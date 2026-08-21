"""
cv-service/detector.py
YOLOv8n person detection wrapper.
Loads from a local model file — no network calls at runtime.
"""
from __future__ import annotations

import numpy as np
from ultralytics import YOLO


class PersonDetector:
    """
    Thin wrapper around YOLOv8n that returns only person counts per frame.
    Keeping this class isolated means the detection backend can be swapped
    (e.g. to YOLOv8s for better accuracy) without touching main.py or emitter.py.
    """

    # COCO class index for "person"
    PERSON_CLASS_ID = 0

    def __init__(self, model_path: str) -> None:
        """
        Load YOLOv8n from a local .pt file.
        model_path must exist on disk — run download_model.py first.
        Raises FileNotFoundError (from Ultralytics) if the file is missing,
        which gives a clear error before any video frames are processed.
        """
        self.model = YOLO(model_path)
        print(f"[Detector] Loaded model from {model_path}")

    def count_persons(self, frame: np.ndarray) -> int:
        """
        Run inference on a single BGR frame (as returned by cv2.VideoCapture.read).
        Returns the integer count of detected persons.

        verbose=False suppresses per-frame Ultralytics progress output that would
        drown the structured JSON lines we emit to stdout.
        """
        results = self.model(
            frame,
            classes=[self.PERSON_CLASS_ID],  # filter to persons only
            verbose=False,
        )
        # results is a list with one element per image; sum boxes across results
        return int(sum(len(r.boxes) for r in results))
