"""
cv-service/main.py
Entry point: opens the video source, samples frames, and emits one density
reading per second to the backend in the exact docs/api-contract.md shape.
"""
from __future__ import annotations

import json
import sys
import time

import cv2

import config
from detector import PersonDetector
from emitter import emit


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_source(src: str) -> int | str:
    """
    "0" or any digit-only string → integer webcam index.
    Anything else → treat as a file path.
    This matches the VIDEO_SOURCE env var semantics documented in .env.example.
    """
    return int(src) if src.isdigit() else src


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    print(
        f"[CV] Starting — source={config.VIDEO_SOURCE!r}  "
        f"zone={config.ZONE_ID!r} ({config.ZONE_TYPE})  "
        f"area={config.AREA_SQM} sqm  "
        f"sample_every={config.FRAME_SAMPLE_RATE} frames  "
        f"model={config.MODEL_PATH}"
    )

    detector = PersonDetector(config.MODEL_PATH)
    source = parse_source(config.VIDEO_SOURCE)

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[CV] ERROR: Cannot open video source {config.VIDEO_SOURCE!r}", file=sys.stderr)
        sys.exit(1)

    frame_idx: int = 0
    window_samples: list[int] = []  # person counts in the current 1-sec window
    window_start: float = time.monotonic()

    print("[CV] Running. Press Ctrl+C to stop.")

    try:
        while True:
            ret, frame = cap.read()

            if not ret:
                if isinstance(source, str):
                    # File source ended — loop back to the first frame.
                    # This lets a pre-recorded dense-crowd clip run indefinitely
                    # during the demo without manual intervention.
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_idx = 0
                    continue
                else:
                    print("[CV] Webcam read failed — exiting.", file=sys.stderr)
                    break

            # ------------------------------------------------------------------
            # Frame sampling
            # Sample every Nth frame to stay within CPU inference budget.
            # See config.FRAME_SAMPLE_RATE for the full justification.
            # ------------------------------------------------------------------
            if frame_idx % config.FRAME_SAMPLE_RATE == 0:
                count = detector.count_persons(frame)
                window_samples.append(count)

            frame_idx += 1

            # ------------------------------------------------------------------
            # Emit once per second
            # ------------------------------------------------------------------
            elapsed = time.monotonic() - window_start
            if elapsed >= config.EMIT_INTERVAL_SEC and window_samples:
                payload = emit(window_samples)
                # Log the emitted JSON to stdout for eyeball verification and piping.
                print(json.dumps(payload, separators=(",", ":")))
                window_samples = []
                window_start = time.monotonic()

    except KeyboardInterrupt:
        print("\n[CV] Stopped by user.")
    finally:
        cap.release()


if __name__ == "__main__":
    main()
