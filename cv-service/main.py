"""
cv-service/main.py
Multi-Zone Entry Point: single-threaded round-robin execution across
Zone 1 (Live Webcam General Area) and Zone 2 (Pre-Recorded Emergency Corridor)
with optional OpenCV Farneback Optical Flow analysis.
"""
from __future__ import annotations

import json
import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
import sys
import time
import numpy as np
import math

import cv2

import config
from detector import PersonDetector
from emitter import emit
from flow_analyzer import FlowAnalyzer


def parse_source(src: str) -> int | str:
    return int(src) if src.isdigit() else src


def create_demo_crowd_frame(step: int) -> np.ndarray:
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:] = (40, 45, 55)

    cv2.line(frame, (100, 0), (100, 480), (100, 100, 100), 4)
    cv2.line(frame, (540, 0), (540, 480), (100, 100, 100), 4)
    cv2.putText(frame, "EMERGENCY CORRIDOR - ZONE 2 DEMO", (120, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    base_count = 15 + (step % 35)

    for i in range(base_count):
        # Introduce motion jitter to simulate flow
        jitter = int(math.sin(step + i) * 10) if 'math' in sys.modules else 0
        x = 140 + ((i * 37 + jitter) % 360)
        y = 80 + ((i * 29 + jitter) % 360)
        cv2.circle(frame, (x, y), 12, (200, 200, 200), -1)
        cv2.rectangle(frame, (x - 14, y + 12), (x + 14, y + 45), (180, 180, 180), -1)

    return frame


def main() -> None:
    print(
        f"[CV] Multi-Zone Engine Starting — model={config.MODEL_PATH}\n"
        f"     Optical Flow Enabled: {config.ENABLE_OPTICAL_FLOW}\n"
        f"     Zone 1: 'zone_1' (general)  Source: {config.VIDEO_SOURCE!r} [LIVE WEBCAM]\n"
        f"     Zone 2: 'zone_2' (corridor) Source: Pre-recorded Corridor [PRE-RECORDED]\n"
    )

    detector = PersonDetector(config.MODEL_PATH)

    # Initialize per-zone FlowAnalyzers if Optical Flow is enabled
    flow_z1 = FlowAnalyzer(config.FOCAL_POINTS["zone_1"]) if config.ENABLE_OPTICAL_FLOW else None
    flow_z2 = FlowAnalyzer(config.FOCAL_POINTS["zone_2"]) if config.ENABLE_OPTICAL_FLOW else None

    # Zone 1 Setup
    src_z1 = parse_source(config.VIDEO_SOURCE)
    cap_z1 = cv2.VideoCapture(src_z1)
    if not cap_z1.isOpened():
        print(f"[CV] WARN: Cannot open webcam source {config.VIDEO_SOURCE!r}, fallback mode active.")

    # Zone 2 Setup
    corridor_file = os.getenv("CORRIDOR_VIDEO_SOURCE", "models/sample_corridor.mp4")
    cap_z2 = None
    if os.path.exists(corridor_file):
        cap_z2 = cv2.VideoCapture(corridor_file)

    # Zone Accumulators
    z1_samples: list[int] = []
    z2_samples: list[int] = []

    z1_conv, z1_turb, z1_panic = 0.0, 0.0, False
    z2_conv, z2_turb, z2_panic = 0.0, 0.0, False

    z1_start = time.monotonic()
    z2_start = time.monotonic()

    frame_step = 0
    print("[CV] Running multi-zone processing loop. Press Ctrl+C to stop.")

    try:
        while True:
            frame_step += 1

            # --- Zone 1 Processing ---
            if cap_z1 and cap_z1.isOpened():
                ret1, frame1 = cap_z1.read()
                if ret1:
                    if frame_step % config.FRAME_SAMPLE_RATE == 0:
                        c1 = detector.count_persons(frame1)
                        z1_samples.append(c1)
                        if flow_z1:
                            curr_den = (sum(z1_samples) / len(z1_samples)) / 20.0 if z1_samples else 0.0
                            z1_conv, z1_turb, z1_panic = flow_z1.analyze(frame1, curr_den)
                else:
                    if isinstance(src_z1, str):
                        cap_z1.set(cv2.CAP_PROP_POS_FRAMES, 0)

            # --- Zone 2 Processing ---
            if cap_z2 and cap_z2.isOpened():
                ret2, frame2 = cap_z2.read()
                if not ret2:
                    cap_z2.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret2, frame2 = cap_z2.read()
                if ret2 and (frame_step % config.FRAME_SAMPLE_RATE == 0):
                    c2 = detector.count_persons(frame2)
                    z2_samples.append(c2)
                    if flow_z2:
                        curr_den = (sum(z2_samples) / len(z2_samples)) / 15.0 if z2_samples else 0.0
                        z2_conv, z2_turb, z2_panic = flow_z2.analyze(frame2, curr_den)
            else:
                if frame_step % config.FRAME_SAMPLE_RATE == 0:
                    demo_frame = create_demo_crowd_frame(frame_step // config.FRAME_SAMPLE_RATE)
                    c2 = detector.count_persons(demo_frame)
                    c2 = max(c2, 32 + (frame_step // 5 % 15))
                    z2_samples.append(c2)
                    if flow_z2:
                        curr_den = (sum(z2_samples) / len(z2_samples)) / 15.0 if z2_samples else 0.0
                        z2_conv, z2_turb, z2_panic = flow_z2.analyze(demo_frame, curr_den)

            # --- 1-Second Emission Window check ---
            now = time.monotonic()

            if now - z1_start >= config.EMIT_INTERVAL_SEC and z1_samples:
                p1 = emit(
                    z1_samples,
                    zone_id="zone_1",
                    zone_type="general",
                    area_sqm=20.0,
                    feed_source="live_webcam",
                    flow_convergence=z1_conv,
                    flow_turbulence=z1_turb,
                    panic_signature=z1_panic,
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
                    flow_convergence=z2_conv,
                    flow_turbulence=z2_turb,
                    panic_signature=z2_panic,
                )
                print(f"[CV-Z2 Demo] {json.dumps(p2, separators=(',', ':'))}")
                z2_samples = []
                z2_start = now

            time.sleep(0.02)

    except KeyboardInterrupt:
        print("\n[CV] Stopped by user.")
    finally:
        if cap_z1:
            cap_z1.release()
        if cap_z2:
            cap_z2.release()


if __name__ == "__main__":
    main()
