"""
cv-service/detector.py
Multi-Perspective Crowd & Head Detector supporting Drone Overhead & CCTV Camera Modes.
Fast & Smooth High-FPS Inference Engine.
"""
from __future__ import annotations

import os
import cv2
import numpy as np
from ultralytics import YOLO


class PersonDetector:
    """
    YOLOv8 Person & Head Detector optimized for smooth high-FPS video playback.
    """

    PERSON_CLASS_ID = 0

    def __init__(self, model_path: str, camera_type: str = "drone") -> None:
        self.model = YOLO(model_path)
        self.camera_type = camera_type.lower()

        if self.camera_type == "drone":
            default_conf = "0.14"
            default_tiling = "true"
        else:
            default_conf = "0.35"
            default_tiling = "false"

        self.conf_threshold = float(os.getenv("DETECTOR_CONF", default_conf))
        self.enable_tiling = os.getenv("ENABLE_DRONE_TILING", default_tiling).lower() in ("true", "1", "yes")

        print(
            f"[Detector] Mode: {self.camera_type.upper()} | "
            f"conf={self.conf_threshold} | tiling={self.enable_tiling} | model={model_path}"
        )

    def _nms(self, boxes: list[tuple[int, int, int, int, float]], iou_thresh: float = 0.40) -> list[tuple[int, int, int, int, float]]:
        if not boxes:
            return []

        boxes_np = np.array([[b[0], b[1], b[2], b[3]] for b in boxes], dtype=float)
        scores_np = np.array([b[4] for b in boxes], dtype=float)

        x1 = boxes_np[:, 0]
        y1 = boxes_np[:, 1]
        x2 = boxes_np[:, 2]
        y2 = boxes_np[:, 3]

        areas = (x2 - x1 + 1) * (y2 - y1 + 1)
        order = scores_np.argsort()[::-1]

        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)

            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1 + 1)
            h = np.maximum(0.0, yy2 - yy1 + 1)
            inter = w * h

            ovr = inter / (areas[i] + areas[order[1:]] - inter)
            inds = np.where(ovr <= iou_thresh)[0]
            order = order[inds + 1]

        return [boxes[k] for k in keep]

    def detect(self, frame: np.ndarray) -> tuple[int, list[tuple[int, int, int, int, float]]]:
        """
        Run fast inference and return (count, list_of_bounding_boxes).
        Optimized to 2 fast passes for Drone mode (Full frame + Center core) for zero lag.
        """
        h, w = frame.shape[:2]
        all_detected_boxes: list[tuple[int, int, int, int, float]] = []

        # Tiling list: Full frame + optional Center Core crop
        tiles = [(0, 0, w, h)]

        if self.enable_tiling and (w >= 800 or h >= 600):
            half_w, half_h = w // 2, h // 2
            # Add center plaza core crop (where 90% of drone crowds gather)
            tiles.append(
                (max(0, half_w // 2), max(0, half_h // 2), min(w, half_w + half_w // 2), min(h, half_h + half_h // 2))
            )

        for (tx1, ty1, tx2, ty2) in tiles:
            crop = frame[ty1:ty2, tx1:tx2]
            if crop.size == 0:
                continue

            results = self.model(
                crop,
                classes=[self.PERSON_CLASS_ID],
                verbose=False,
                conf=self.conf_threshold,
                imgsz=960 if self.camera_type == "drone" else 640,
            )

            for r in results:
                for box in r.boxes:
                    bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])

                    gx1 = tx1 + bx1
                    gy1 = ty1 + by1
                    gx2 = tx1 + bx2
                    gy2 = ty1 + by2

                    all_detected_boxes.append((gx1, gy1, gx2, gy2, conf))

        final_boxes = self._nms(all_detected_boxes, iou_thresh=0.40)
        return len(final_boxes), final_boxes

    def annotate(self, frame: np.ndarray, boxes: list[tuple[int, int, int, int, float]]) -> np.ndarray:
        """
        Draw bounding boxes / dot markers on a frame.
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
        count, boxes = self.detect(frame)
        annotated = self.annotate(frame, boxes)
        return count, annotated

    def count_persons(self, frame: np.ndarray) -> int:
        count, _ = self.detect(frame)
        return count
