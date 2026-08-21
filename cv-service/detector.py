"""
cv-service/detector.py
YOLOv8n person detection wrapper with bounding box annotation.
Loads from a local model file — no network calls at runtime.
"""
from __future__ import annotations

import cv2
import numpy as np
from ultralytics import YOLO


class PersonDetector:
    """
    Thin wrapper around YOLOv8n that returns person counts and annotated frames with bounding boxes.
    """

    PERSON_CLASS_ID = 0

    def __init__(self, model_path: str) -> None:
        self.model = YOLO(model_path)
        print(f"[Detector] Loaded model from {model_path}")

    def detect_and_annotate(self, frame: np.ndarray) -> tuple[int, np.ndarray]:
        """
        Run inference on a single BGR frame, draw bounding boxes around detected persons,
        and return (person_count, annotated_frame).
        """
        results = self.model(
            frame,
            classes=[self.PERSON_CLASS_ID],
            verbose=False,
            conf=0.25,  # Confidence threshold for person detection
        )

        annotated = frame.copy()
        count = 0

        for r in results:
            boxes = r.boxes
            count += len(boxes)
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])

                # Draw bounding box (Cyan #38BDF8)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (248, 189, 56), 2)

                # Draw label background pill
                label = f"Person {conf:.2f}"
                (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(annotated, (x1, max(0, y1 - 18)), (x1 + w + 6, max(0, y1)), (248, 189, 56), -1)
                cv2.putText(
                    annotated,
                    label,
                    (x1 + 3, max(12, y1 - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 0, 0),
                    1,
                    cv2.LINE_AA,
                )

        return count, annotated

    def count_persons(self, frame: np.ndarray) -> int:
        """
        Fallback simple integer count of detected persons.
        """
        count, _ = self.detect_and_annotate(frame)
        return count
