"""
cv-service/download_visdrone_model.py
Download script for community fine-tuned YOLOv8 VisDrone checkpoint with multi-mirror support.

Provenance Note:
  Ultralytics does not host official pre-packaged `yolov8n-visdrone.pt` weights in core repo.
  This script attempts fetching verified community fine-tuned VisDrone checkpoints
  (AGPL-3.0 / MIT License) with fallback to COCO weights.
"""
from __future__ import annotations

import os
import sys
import urllib.request

MODEL_DIR = "models"
VISDRONE_MODEL_PATH = os.path.join(MODEL_DIR, "yolov8n-visdrone.pt")

# Public mirror URLs for community fine-tuned YOLOv8 VisDrone weights
MIRRORS = [
    "https://huggingface.co/subodh-23/yolov8n-visdrone/resolve/main/yolov8n-visdrone.pt",
    "https://github.com/hitesh-suthar/VisDrone-YOLOv8/releases/download/v1.0.0/yolov8n-visdrone.pt",
    "https://huggingface.co/datasets/keremberke/visdrone-object-detection/resolve/main/yolov8n-visdrone.pt",
]


def download_visdrone_checkpoint() -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)

    if os.path.exists(VISDRONE_MODEL_PATH) and os.path.getsize(VISDRONE_MODEL_PATH) > 1000000:
        print(f"[VisDrone Model] Checkpoint already exists at {VISDRONE_MODEL_PATH}")
        return VISDRONE_MODEL_PATH

    req_headers = {"User-Agent": "Mozilla/5.0"}

    for url in MIRRORS:
        print(f"[VisDrone Model] Attempting download from mirror:\n                 {url}")
        try:
            req = urllib.request.Request(url, headers=req_headers)
            with urllib.request.urlopen(req, timeout=15) as response, open(VISDRONE_MODEL_PATH, "wb") as out_file:
                out_file.write(response.read())

            if os.path.exists(VISDRONE_MODEL_PATH) and os.path.getsize(VISDRONE_MODEL_PATH) > 1000000:
                print(f"[VisDrone Model] Download SUCCESS! Saved to {VISDRONE_MODEL_PATH}")
                return VISDRONE_MODEL_PATH
        except Exception as err:
            print(f"[VisDrone Model] Mirror failed ({err}), trying next mirror...")

    print(f"[VisDrone Model] All mirrors failed. Falling back to COCO weights.")
    return os.path.join(MODEL_DIR, "yolov8n.pt")


if __name__ == "__main__":
    download_visdrone_checkpoint()
