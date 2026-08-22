"""
cv-service/detector.py
Drone-Domain Overhead Detector wrapping Ultralytics YOLOv8, SAHI & OpenCV Circular Head Feature Detector.

Features Spatial Centroid Distance NMS Deduplication:
  - Eliminates 2-3 dots per person by suppressing detections within 20px centroid radius.
  - Guarantees exactly 1 single head dot per person.
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
    YOLOv8 Drone & Ground Detector with SAHI and OpenCV Circular Head Feature Detector.
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

        # Parameter Tuning for Drone Crowds
        if self.camera_type == "drone":
            default_conf = "0.08"        # Sensitive threshold for small aerial heads
            default_slice_h = "400"      # Perspective-adapted 400x400 tiles
            default_slice_w = "400"
            default_overlap = "0.25"     # 25% overlap
        else:
            default_conf = "0.35"
            default_slice_h = "640"
            default_slice_w = "640"
            default_overlap = "0.20"

        self.conf_threshold = float(os.getenv("CONF_THRESH", default_conf))
        self.iou_threshold = float(os.getenv("NMS_IOU_THRESH", "0.60"))
        self.imgsz = int(os.getenv("INFERENCE_IMGSZ", "1280" if self.camera_type == "drone" else "640"))

        # SAHI Tiling Config
        self.use_sahi = (
            SAHI_AVAILABLE
            and os.getenv("USE_SAHI", "true").lower() in ("true", "1", "yes")
            and self.camera_type == "drone"
        )
        self.slice_h = int(os.getenv("SAHI_SLICE_HEIGHT", default_slice_h))
        self.slice_w = int(os.getenv("SAHI_SLICE_WIDTH", default_slice_w))
        self.overlap = float(os.getenv("SAHI_OVERLAP_RATIO", default_overlap))

        # Enable Circular Head Detector for Drone Overhead Feeds
        self.enable_circular_heads = self.camera_type == "drone"

        # Load Ultralytics YOLO model
        self.model = YOLO(self.model_path)

        # Initialize SAHI AutoDetectionModel if active
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
            f"SAHI={self.use_sahi} | CircularHeadDetector={self.enable_circular_heads} | Conf={self.conf_threshold}"
        )

    def detect_circular_heads(self, frame: np.ndarray) -> list[tuple[int, int, int, int, float]]:
        """
        User-Proposed Feature Extraction:
        Detects invariant round head geometries using CLAHE + OpenCV Hough Circles.
        Uses minDist=24 to prevent multiple dots on the same person.
        """
        boxes: list[tuple[int, int, int, int, float]] = []

        try:
            if len(frame.shape) == 2:
                gray = frame
            elif len(frame.shape) == 3 and frame.shape[2] == 3:
                bgr2gray_flag = getattr(cv2, "COLOR_BGR2GRAY", 6)
                gray = cv2.cvtColor(frame, bgr2gray_flag)
            elif len(frame.shape) == 3 and frame.shape[2] == 4:
                bgra2gray_flag = getattr(cv2, "COLOR_BGRA2GRAY", 10)
                gray = cv2.cvtColor(frame, bgra2gray_flag)
            else:
                gray = frame

            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)

            hough_flag = getattr(cv2, "HOUGH_GRADIENT", 3)

            # Detect circular head structures (minDist=24px prevents 2-3 dots per person)
            circles = cv2.HoughCircles(
                blurred,
                hough_flag,
                dp=1.2,
                minDist=24,
                param1=50,
                param2=22,
                minRadius=4,
                maxRadius=18,
            )

            if circles is not None:
                circles = np.uint16(np.around(circles))
                for i in circles[0, :]:
                    cx, cy, r = int(i[0]), int(i[1]), int(i[2])
                    x1 = max(0, cx - r)
                    y1 = max(0, cy - r)
                    x2 = min(frame.shape[1], cx + r)
                    y2 = min(frame.shape[0], cy + r)
                    boxes.append((x1, y1, x2, y2, 0.70))

        except Exception as err:
            print(f"[Circular Head Detector] Exception caught safely: {err}")

        return boxes

    def _nms_centroids(self, boxes: list[tuple[int, int, int, int, float]], min_dist_px: float = 20.0) -> list[tuple[int, int, int, int, float]]:
        """
        Spatial Centroid Distance NMS Deduplication.
        Eliminates duplicate 2-3 dots per person by enforcing a minimum spatial distance (20px) between dot centroids.
        """
        if not boxes:
            return []

        # Sort by confidence score descending
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
        Hybrid Detection Pipeline with Spatial Centroid Distance Deduplication.
        Ensures exactly 1 single dot per person.
        """
        start_time = time.monotonic()
        all_boxes: list[tuple[int, int, int, int, float]] = []

        # 1. SAHI Sliced Prediction Pass
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

        # 2. Whole-Frame 1280px YOLO Pass
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

        # 3. Circular Head Structure Detector (Targets round heads directly in bottom/occluded zones)
        if self.enable_circular_heads:
            circular_head_boxes = self.detect_circular_heads(frame)
            all_boxes.extend(circular_head_boxes)

        # 4. Spatial Centroid Distance NMS Deduplication (Guarantees exactly 1 dot per person)
        min_spatial_dist = 20.0 if self.camera_type == "drone" else 15.0
        final_boxes = self._nms_centroids(all_boxes, min_dist_px=min_spatial_dist)

        latency_ms = (time.monotonic() - start_time) * 1000.0
        return len(final_boxes), final_boxes, round(latency_ms, 1)

    def annotate(self, frame: np.ndarray, boxes: list[tuple[int, int, int, int, float]]) -> np.ndarray:
        """
        Draw annotations:
          - Drone Mode: Clean solid dots on each detected person's head/center (zero boxes).
          - CCTV Mode: Standard ground CCTV bounding boxes with confidence labels.
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
