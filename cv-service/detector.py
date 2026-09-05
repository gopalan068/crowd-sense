"""
cv-service/detector.py
Drone-Domain Overhead Detector wrapping Ultralytics YOLOv8 & SAHI (Slicing Aided Hyper Inference).

Enforces strict mode-specific confidence thresholds:
  - CCTV Mode: STRICT 0.30 (30% minimum confidence floor). ZERO boxes under 0.30 allowed.
  - Drone Mode: 0.06 (6% sensitive aerial threshold with SAHI sliced inference).
"""
from __future__ import annotations

import os
import math
import time
import cv2
import numpy as np
from ultralytics import YOLO

try:
    from sahi import AutoDetectionModel
    from sahi.predict import get_sliced_prediction
    SAHI_AVAILABLE = True
except ImportError:
    SAHI_AVAILABLE = False


class PersonDetector:
    """
    YOLOv8 Aerial Drone & CCTV Ground Detector with SAHI sliced tiling inference.
    """

    def __init__(self, model_path: str, camera_type: str = "drone", model_type: str = "coco") -> None:
        self.model_path = model_path
        self.camera_type = camera_type.lower()
        self.model_type = model_type.lower()

        # Class Taxonomy Mapping
        if "visdrone" in model_path.lower() or self.model_type == "visdrone":
            self.target_classes = [0, 1]
            self.model_type = "visdrone"
        else:
            self.target_classes = [0]
            self.model_type = "coco"

        # STRICT Mode-Specific Confidence Thresholding
        if self.camera_type == "cctv":
            # Strict 0.30 (30%) confidence floor for CCTV ground cameras
            self.conf_threshold = float(os.getenv("CONF_THRESH_CCTV", "0.30"))
            self.slice_h = 640
            self.slice_w = 640
            self.overlap = 0.20
            self.use_sahi = False
        else:
            # Sensitive 0.06 threshold for aerial drone head dots
            self.conf_threshold = float(os.getenv("CONF_THRESH_DRONE", os.getenv("CONF_THRESH", "0.06")))
            self.slice_h = int(os.getenv("SAHI_SLICE_HEIGHT", "320"))
            self.slice_w = int(os.getenv("SAHI_SLICE_WIDTH", "320"))
            self.overlap = float(os.getenv("SAHI_OVERLAP_RATIO", "0.20"))
            self.use_sahi = (
                SAHI_AVAILABLE
                and os.getenv("USE_SAHI", "true").lower() in ("true", "1", "yes")
            )

        self.iou_threshold = float(os.getenv("NMS_IOU_THRESH", "0.60"))
        self.imgsz = int(os.getenv("INFERENCE_IMGSZ", "1280" if self.camera_type == "drone" else "640"))

        # Load Ultralytics YOLO model
        self.model = YOLO(self.model_path)

        # Initialize SAHI AutoDetectionModel if active (drone mode only)
        self.sahi_model = None
        if self.use_sahi:
            try:
                self.sahi_model = AutoDetectionModel.from_pretrained(
                    model_type="ultralytics",
                    model_path=self.model_path,
                    confidence_threshold=self.conf_threshold,
                    device="cpu",
                )
                print(f"[Detector SAHI] Initialized SAHI model: {self.model_path} | slice={self.slice_w}x{self.slice_h} conf={self.conf_threshold}")
            except Exception as err:
                print(f"[Detector SAHI] WARN: SAHI init failed ({err}). Falling back to whole-frame YOLO.")
                self.use_sahi = False

        print(
            f"[Detector] Mode={self.camera_type.upper()} | ModelType={self.model_type.upper()} | "
            f"StrictConfFloor={self.conf_threshold} | IoU={self.iou_threshold} | SAHI={self.use_sahi}"
        )

    def _nms_centroids(self, boxes: list[tuple[int, int, int, int, float]], min_dist_px: float = 20.0) -> list[tuple[int, int, int, int, float]]:
        """
        Spatial Centroid Distance NMS Deduplication.
        """
        if not boxes:
            return []

        sorted_boxes = sorted(boxes, key=lambda b: b[4], reverse=True)
        keep: list[tuple[int, int, int, int, float]] = []

        for b in sorted_boxes:
            cx1 = (b[0] + b[2]) / 2.0
            cy1 = (b[1] + b[3]) / 2.0

            is_duplicate = False
            for k in keep:
                cx2 = (k[0] + k[2]) / 2.0
                cy2 = (k[1] + k[3]) / 2.0
                dist = math.hypot(cx1 - cx2, cy1 - cy2)
                if dist < min_dist_px:
                    is_duplicate = True
                    break

            if not is_duplicate:
                keep.append(b)

        return keep

    def detect(self, frame: np.ndarray) -> tuple[int, list[tuple[int, int, int, int, float]], float]:
        """
        Mode-Aware Detection Pipeline with Strict Confidence Filtering.
        Pipeline: YOLO + SAHI (sliced tiling) -> Whole-Frame YOLO -> Spatial NMS Deduplication.
        """
        start_time = time.monotonic()
        all_boxes: list[tuple[int, int, int, int, float]] = []

        # 1. SAHI Sliced Prediction Pass (Drone Mode Only)
        if self.use_sahi and self.sahi_model:
            try:
                rgb_frame = cv2.cvtColor(frame, getattr(cv2, "COLOR_BGR2RGB", 4))
                sliced_pred = get_sliced_prediction(
                    rgb_frame,
                    self.sahi_model,
                    slice_height=self.slice_h,
                    slice_width=self.slice_w,
                    overlap_height_ratio=self.overlap,
                    overlap_width_ratio=self.overlap,
                    postprocess_type="NMS",
                    postprocess_match_metric="IOU",
                    postprocess_match_threshold=0.50,
                    verbose=0,
                )

                for object_prediction in sliced_pred.object_prediction_list:
                    cat_id = object_prediction.category.id
                    if cat_id in self.target_classes:
                        bbox = object_prediction.bbox
                        conf = object_prediction.score.value
                        all_boxes.append((int(bbox.minx), int(bbox.miny), int(bbox.maxx), int(bbox.maxy), float(conf)))
            except Exception as err:
                print(f"[Detector SAHI] Sliced pass warning: {err}")

        # 2. Whole-Frame YOLO Pass
        wf_results = self.model(
            frame,
            classes=self.target_classes,
            verbose=False,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            imgsz=self.imgsz,
            max_det=1000,
        )

        for r in wf_results:
            for box in r.boxes:
                bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                all_boxes.append((bx1, by1, bx2, by2, conf))

        # 3. Spatial Centroid Distance NMS Deduplication
        min_spatial_dist = 20.0 if self.camera_type == "drone" else 15.0
        deduped_boxes = self._nms_centroids(all_boxes, min_dist_px=min_spatial_dist)

        # 4. STRICT CONFIDENCE FLOOR FILTER (Strictly rejects any detection under self.conf_threshold)
        final_boxes = [b for b in deduped_boxes if b[4] >= self.conf_threshold]

        latency_ms = (time.monotonic() - start_time) * 1000.0
        return len(final_boxes), final_boxes, round(latency_ms, 1)

    def annotate(self, frame: np.ndarray, boxes: list[tuple[int, int, int, int, float]]) -> np.ndarray:
        """
        Draw annotations:
          - Drone Mode: Clean solid dots on each detected person's head/center.
          - CCTV Mode: Standard ground CCTV bounding boxes with confidence labels (conf >= 0.30).
        """
        annotated = frame.copy()

        for (x1, y1, x2, y2, conf) in boxes:
            if self.camera_type == "drone":
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                cv2.circle(annotated, (cx, cy), 3, (248, 189, 56), -1, cv2.LINE_AA)
                cv2.circle(annotated, (cx, cy), 5, (16, 185, 129), 1, cv2.LINE_AA)
            else:
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (248, 189, 56), 2)
                label = f"P {conf:.2f}"
                (text_w, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.40, 1)
                cv2.rectangle(annotated, (x1, max(0, y1 - 16)), (x1 + text_w + 4, max(0, y1)), (248, 189, 56), -1)
                cv2.putText(
                    annotated,
                    label,
                    (x1 + 2, max(11, y1 - 3)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.40,
                    (0, 0, 0),
                    1,
                    cv2.LINE_AA,
                )

        return annotated

    def detect_and_annotate(self, frame: np.ndarray) -> tuple[int, np.ndarray]:
        count, boxes, latency_ms = self.detect(frame)
        annotated = self.annotate(frame, boxes)
        return count, annotated

    def count_persons(self, frame: np.ndarray) -> int:
        count, _, _ = self.detect(frame)
        return count
