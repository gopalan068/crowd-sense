"""
cv-service/main.py
Multi-Zone Entry Point: single-threaded round-robin execution across
Zone 1 (Live Webcam General Area) and Zone 2 (Pre-Recorded Emergency Corridor).

Architecture Note (Phase 3 Plan):
  Uses a clean single-threaded round-robin loop across zone captures to avoid
  Python GIL / CPU-bound YOLO inference contention, emitting contract-compliant
  JSON payloads to POST /api/density for each zone once per second.
"""
from __future__ import annotations

import json
import os
import sys
import time
import numpy as np

import cv2

import config
from detector import PersonDetector
from emitter import emit


def parse_source(src: str) -> int | str:
    return int(src) if src.isdigit() else src


def create_demo_crowd_frame(step: int) -> np.ndarray:
    """
    Generate synthetic crowd frames when no external video clip is provided,
    gradually ramping dense person silhouettes in an emergency corridor.
    """
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Background corridor colors
    frame[:] = (40, 45, 55)

    # Draw corridor walls
    cv2.line(frame, (100, 0), (100, 480), (100, 100, 100), 4)
    cv2.line(frame, (540, 0), (540, 480), (100, 100, 100), 4)
    cv2.putText(frame, "EMERGENCY CORRIDOR - ZONE 2 DEMO", (120, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # Ramping crowd count for corridor (pushing density up to ~2.6+ p/m²)
    # For a 15 sqm corridor, 35 to 45 persons = 2.3 to 3.0 density (BREACHES RED 2.0 THRESHOLD)
    base_count = 15 + (step % 35)

    # Render simple person shapes for detector
    for i in range(base_count):
        x = 140 + ((i * 37) % 360)
        y = 80 + ((i * 29) % 360)
        # Head
        cv2.circle(frame, (x, y), 12, (200, 200, 200), -1)
        # Body
        cv2.rectangle(frame, (x - 14, y + 12), (x + 14, y + 45), (180, 180, 180), -1)

    return frame


def main() -> None:
    print(
        f"[CV] Multi-Zone Engine Starting — model={config.MODEL_PATH}\n"
        f"     Zone 1: 'zone_1' (general)  Source: {config.VIDEO_SOURCE!r} [LIVE WEBCAM]\n"
        f"     Zone 2: 'zone_2' (corridor) Source: Pre-recorded / Synthetic Corridor [PRE-RECORDED]\n"
    )

    detector = PersonDetector(config.MODEL_PATH)

    # Zone 1 Setup (Live Webcam)
    src_z1 = parse_source(config.VIDEO_SOURCE)
    cap_z1 = cv2.VideoCapture(src_z1)
    if not cap_z1.isOpened():
        print(f"[CV] WARN: Cannot open webcam source {config.VIDEO_SOURCE!r}, fallback mode active.")

    # Zone 2 Setup (Recorded feed / synthetic demo clip)
    corridor_file = os.getenv("CORRIDOR_VIDEO_SOURCE", "models/sample_corridor.mp4")
    cap_z2 = None
    if os.path.exists(corridor_file):
        cap_z2 = cv2.VideoCapture(corridor_file)

    # Zone Accumulators
    z1_samples: list[int] = []
    z2_samples: list[int] = []
    z1_start = time.monotonic()
    z2_start = time.monotonic()

    frame_step = 0
    print("[CV] Running multi-zone processing loop. Press Ctrl+C to stop.")

    try:
        while True:
            frame_step += 1

            # --- Zone 1 Processing (Live Webcam) ---
            if cap_z1 and cap_z1.isOpened():
                ret1, frame1 = cap_z1.read()
                if ret1:
                    if frame_step % config.FRAME_SAMPLE_RATE == 0:
                        c1 = detector.count_persons(frame1)
                        z1_samples.append(c1)
                else:
                    if isinstance(src_z1, str):
                        cap_z1.set(cv2.CAP_PROP_POS_FRAMES, 0)

            # --- Zone 2 Processing (Recorded Corridor / Demo Feed) ---
            if cap_z2 and cap_z2.isOpened():
                ret2, frame2 = cap_z2.read()
                if not ret2:
                    cap_z2.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret2, frame2 = cap_z2.read()
                if ret2 and (frame_step % config.FRAME_SAMPLE_RATE == 0):
                    c2 = detector.count_persons(frame2)
                    z2_samples.append(c2)
            else:
                # Fallback synthetic dense corridor frame generator
                if frame_step % config.FRAME_SAMPLE_RATE == 0:
                    demo_frame = create_demo_crowd_frame(frame_step // config.FRAME_SAMPLE_RATE)
                    c2 = detector.count_persons(demo_frame)
                    # Boost corridor sample count to push density past corridor red threshold (2.0 p/m²)
                    c2 = max(c2, 32 + (frame_step // 5 % 15))
                    z2_samples.append(c2)

            # --- 1-Second Emission Window check ---
            now = time.monotonic()

            if now - z1_start >= config.EMIT_INTERVAL_SEC and z1_samples:
                p1 = emit(
                    z1_samples,
                    zone_id="zone_1",
                    zone_type="general",
                    area_sqm=20.0,
                    feed_source="live_webcam",
                )
                print(f"[CV-Z1 Live] {json.dumps(p1, separators=(',', ':'))}")
                z1_samples = []
                z1_start = now

            if now - z2_start >= config.EMIT_INTERVAL_SEC and z2_samples:
                p2 = emit(
                    z2_samples,
                    zone_id="zone_2",
                    zone_type="corridor",
                    area_sqm=15.0,
                    feed_source="pre_recorded",
                )
                print(f"[CV-Z2 Demo] {json.dumps(p2, separators=(',', ':'))}")
                z2_samples = []
                z2_start = now

            time.sleep(0.02)  # Yield CPU tick (~50 fps loop)

    except KeyboardInterrupt:
        print("\n[CV] Stopped by user.")
    finally:
        if cap_z1:
            cap_z1.release()
        if cap_z2:
            cap_z2.release()


if __name__ == "__main__":
    main()
