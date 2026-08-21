"""
cv-service/download_model.py
Downloads the pretrained YOLOv8n weights to models/yolov8n.pt.

Run ONCE before first use (or during team setup):
    python download_model.py

WHY: Ultralytics pulls weights from the internet on first YOLO() call if the
file isn't found locally. Venue wifi during a live demo is exactly the worst
moment to discover a missing model file. Downloading once and storing locally
eliminates this risk.

The file is ~6 MB. Commit it to the repo (or add to your team's shared cache)
so every team member has it without an extra setup step.
"""
from __future__ import annotations

import os
import shutil
import sys

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
TARGET_PATH = os.path.join(MODELS_DIR, "yolov8n.pt")


def download() -> None:
    if os.path.exists(TARGET_PATH):
        size_mb = os.path.getsize(TARGET_PATH) / 1_048_576
        print(f"[Model] Already exists at {TARGET_PATH} ({size_mb:.1f} MB) — skipping download.")
        return

    os.makedirs(MODELS_DIR, exist_ok=True)
    print("[Model] Downloading YOLOv8n pretrained weights ...")

    # Import here so the script fails fast (with a clear pip error) if
    # ultralytics isn't installed, rather than failing silently later.
    from ultralytics import YOLO

    # YOLO('yolov8n.pt') downloads weights to the ultralytics cache dir
    # if not present locally. We then copy from cache → models/ directory.
    model = YOLO("yolov8n.pt")

    # Locate the downloaded file
    src: str | None = None
    if hasattr(model, "ckpt_path") and model.ckpt_path:
        src = str(model.ckpt_path)
    else:
        # Fallback: search common cache locations
        import torch
        cache_dir = torch.hub.get_dir()
        candidate = os.path.join(cache_dir, "yolov8n.pt")
        if os.path.exists(candidate):
            src = candidate

    if src and os.path.exists(src):
        shutil.copy(src, TARGET_PATH)
        size_mb = os.path.getsize(TARGET_PATH) / 1_048_576
        print(f"[Model] Saved to {TARGET_PATH} ({size_mb:.1f} MB)")
    else:
        # Ultralytics may have written directly to current directory
        local = os.path.join(os.getcwd(), "yolov8n.pt")
        if os.path.exists(local):
            shutil.move(local, TARGET_PATH)
            size_mb = os.path.getsize(TARGET_PATH) / 1_048_576
            print(f"[Model] Moved to {TARGET_PATH} ({size_mb:.1f} MB)")
        else:
            print(
                "[Model] WARNING: Could not locate downloaded weights. "
                f"Please manually copy yolov8n.pt to {TARGET_PATH}",
                file=sys.stderr,
            )
            sys.exit(1)


if __name__ == "__main__":
    download()
