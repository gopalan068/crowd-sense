"""
cv-service/detector.py
Drone-Domain Overhead Detector wrapping Ultralytics YOLOv8 & SAHI (Slicing Aided Hyper Inference).
Features explicit cross-tile NMS postprocessing (IOU=0.50) to prevent boundary double-counting,
VisDrone class taxonomy mapping ([0, 1]), and per-frame latency monitoring.
"""
from __future__ import annotations

import os
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
    YOLOv8 Drone & Ground Detector with optional SAHI (Slicing Aided Hyper Inference)
    and explicit cross-tile NMS deduplication.
    """

    def __init__(self, model_path: str, camera_type: str = "drone", model_type: str = "coco") -> None:
        self.model_path = model_path
        self.camera_type = camera_type.lower()
        self.model_type = model_type.lower()

        # Class Taxonomy Mapping:
        # VisDrone taxonomy: 0 -> pedestrian, 1 -> people (Must count both 0 & 1)
        # COCO taxonomy: 0 -> person
        if "visdrone" in model_path.lower() or self.model_type == "visdrone":
            self.target_classes = [0, 1]
            self.model_type = "visdrone"
        else:
            self.target_classes = [0]
            self.model_type = "coco"

        # Parameter Tuning
        self.conf_threshold = float(os.getenv("CONF_THRESH", "0.15" if self.camera_type == "drone" else "0.35"))
        self.iou_threshold = float(os.getenv("NMS_IOU_THRESH", "0.65"))
        self.imgsz = int(os.getenv("INFERENCE_IMGSZ", "1280" if self.camera_type == "drone" else "640"))

        # SAHI Tiling Config
        self.use_sahi = (
            SAHI_AVAILABLE
            and os.getenv("USE_SAHI", "true").lower() in ("true", "1", "yes")
            and self.camera_type == "drone"
        )
        self.slice_h = int(os.getenv("SAHI_SLICE_HEIGHT", "640"))
        self.slice_w = int(os.getenv("SAHI_SLICE_WIDTH", "640"))
        self.overlap = float(os.getenv("SAHI_OVERLAP_RATIO", "0.20"))

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
                print(f"[Detector SAHI] Initialized SAHI model: {self.model_path}")
            except Exception as err:
                print(f"[Detector SAHI] WARN: SAHI init failed ({err}). Falling back to whole-frame YOLO.")
                self.use_sahi = False

        print(
            f"[Detector] Mode={self.camera_type.upper()} | ModelType={self.model_type.upper()} | "
            f"SAHI={self.use_sahi} | Conf={self.conf_threshold} | IoU={self.iou_threshold} | ImgSz={self.imgsz}"
        )

    def detect(self, frame: np.ndarray) -> tuple[int, list[tuple[int, int, int, int, float]], float]:
        """
        Run detection and return (count, bounding_boxes, latency_ms).
        """
        start_time = time.monotonic()
        boxes: list[tuple[int, int, int, int, float]] = []

        if self.use_sahi and self.sahi_model:
            # --- SAHI Sliced Prediction Path with explicit cross-tile NMS deduplication ---
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            sliced_pred = get_sliced_prediction(
                rgb_frame,
                self.sahi_model,
                slice_height=self.slice_h,
                slice_width=self.slice_w,
                overlap_height_ratio=self.overlap,
                overlap_width_ratio=self.overlap,
                postprocess_type="NMS",
                postprocess_match_metric="IOU",
                postprocess_match_threshold=0.50,  # Explicit cross-tile NMS deduplication
                verbose=0,
            )

            for object_prediction in sliced_pred.object_prediction_list:
                cat_id = object_prediction.category.id
                if cat_id in self.target_classes:
                    bbox = object_prediction.bbox
                    conf = object_prediction.score.value
                    boxes.append((int(bbox.minx), int(bbox.miny), int(bbox.maxx), int(bbox.maxy), float(conf)))
        else:
            # --- Whole-Frame YOLO Path ---
            results = self.model(
                frame,
                classes=self.target_classes,
                verbose=False,
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                imgsz=self.imgsz,
            )

            for r in results:
                for box in r.boxes:
                    bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    boxes.append((bx1, by1, bx2, by2, conf))

        latency_ms = (time.monotonic() - start_time) * 1000.0
        return len(boxes), boxes, round(latency_ms, 1)

    def annotate(self, frame: np.ndarray, boxes: list[tuple[int, int, int, int, float]]) -> np.ndarray:
        """
        Draw clean bounding boxes / head dots on frame.
        """
        annotated = frame.copy()

        for (x1, y1, x2, y2, conf) in boxes:
            box_w = x2 - x1
            box_h = y2 - y1

            if self.camera_type == "drone" and (box_w < 25 or box_h < 25):
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2
                cv2.circle(annotated, (cx, cy), 3, (56, 189, 248), -1)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (16, 185, 129), 1)
            else:
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (248, 189, 56), 2)
                if self.camera_type == "cctv":
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
