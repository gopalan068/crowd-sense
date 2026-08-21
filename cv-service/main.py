"""
cv-service/main.py
Multi-Zone Entry Point: single-threaded round-robin execution across
Zone 1 (Live Webcam / Custom Drone Video) and Zone 2 (Emergency Corridor / Custom Drone Video)
with YOLOv8 Bounding Box Annotations, OpenCV Farneback Optical Flow, and Live Stream Server.

Usage:
  python main.py
  python main.py --z1 videos/drone_overhead.mp4
  python main.py --z1 videos/drone_rally.mp4 --z2 videos/corridor_exit.mp4
"""
from __future__ import annotations

import argparse
import json
import math
import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
import sys
import time
import numpy as np

import cv2

import config
from detector import PersonDetector
from emitter import emit
from flow_analyzer import FlowAnalyzer
from stream_server import start_stream_server, update_zone_frame


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
        jitter = int(math.sin(step + i) * 10)
        x = 140 + ((i * 37 + jitter) % 360)
        y = 80 + ((i * 29 + jitter) % 360)
        cv2.circle(frame, (x, y), 12, (200, 200, 200), -1)
        cv2.rectangle(frame, (x - 14, y + 12), (x + 14, y + 45), (180, 180, 180), -1)

    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="CrowdSense Multi-Zone Computer Vision Microservice")
    parser.add_argument("--z1", type=str, default=None, help="Video source for Zone 1 (0 for webcam or path to .mp4 video)")
    parser.add_argument("--z2", type=str, default=None, help="Video source for Zone 2 (path to .mp4 video)")
    args = parser.parse_args()

    z1_source_str = args.z1 or config.VIDEO_SOURCE_Z1
    z2_source_str = args.z2 or config.VIDEO_SOURCE_Z2

    src_z1 = parse_source(z1_source_str)
    src_z2 = parse_source(z2_source_str)

    feed_source_z1 = "live_webcam" if isinstance(src_z1, int) or src_z1 == "0" else "pre_recorded"
    feed_source_z2 = "live_webcam" if isinstance(src_z2, int) or src_z2 == "0" else "pre_recorded"

    print(
        f"\n[CV] Multi-Zone Engine Starting — Model: {config.MODEL_PATH}\n"
        f"     Optical Flow Enabled: {config.ENABLE_OPTICAL_FLOW}\n"
        f"     Zone 1: 'zone_1' (general)  Source: {z1_source_str!r} [{feed_source_z1.upper()}]\n"
        f"     Zone 2: 'zone_2' (corridor) Source: {z2_source_str!r} [{feed_source_z2.upper()}]\n"
    )

    # Start live MJPEG streaming server for frontend dashboard display
    start_stream_server(port=5001)

    detector = PersonDetector(config.MODEL_PATH)

    flow_z1 = FlowAnalyzer(config.FOCAL_POINTS["zone_1"]) if config.ENABLE_OPTICAL_FLOW else None
    flow_z2 = FlowAnalyzer(config.FOCAL_POINTS["zone_2"]) if config.ENABLE_OPTICAL_FLOW else None

    # Open Zone 1 Stream
    cap_z1 = cv2.VideoCapture(src_z1)
    if not cap_z1.isOpened():
        print(f"[CV] WARN: Cannot open Zone 1 video source {z1_source_str!r}")

    # Open Zone 2 Stream
    cap_z2 = None
    if isinstance(src_z2, str) and os.path.exists(src_z2):
        cap_z2 = cv2.VideoCapture(src_z2)
    elif isinstance(src_z2, int):
        cap_z2 = cv2.VideoCapture(src_z2)
    else:
        print(f"[CV] INFO: Zone 2 file {z2_source_str!r} not found — falling back to synthetic generator.")

    z1_samples: list[int] = []
    z2_samples: list[int] = []

    z1_conv, z1_turb, z1_panic = 0.0, 0.0, False
    z2_conv, z2_turb, z2_panic = 0.0, 0.0, False

    z1_start = time.monotonic()
    z2_start = time.monotonic()

    frame_step = 0
    print("[CV] Running multi-zone processing loop. Press Ctrl+C to stop.\n")

    try:
        while True:
            frame_step += 1

            # --- Zone 1 Processing ---
            if cap_z1 and cap_z1.isOpened():
                ret1, frame1 = cap_z1.read()
                if ret1:
                    if frame_step % config.FRAME_SAMPLE_RATE == 0:
                        c1, annotated1 = detector.detect_and_annotate(frame1)
                        z1_samples.append(c1)
                        update_zone_frame("zone_1", annotated1)
                        if flow_z1:
                            curr_den = (sum(z1_samples) / len(z1_samples)) / config.AREA_SQM if z1_samples else 0.0
                            z1_conv, z1_turb, z1_panic = flow_z1.analyze(frame1, curr_den)
                    else:
                        update_zone_frame("zone_1", frame1)
                else:
                    if isinstance(src_z1, str):
                        cap_z1.set(cv2.CAP_PROP_POS_FRAMES, 0)

            # --- Zone 2 Processing ---
            if cap_z2 and cap_z2.isOpened():
                ret2, frame2 = cap_z2.read()
                if not ret2:
                    if isinstance(src_z2, str):
                        cap_z2.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret2, frame2 = cap_z2.read()
                if ret2:
                    if frame_step % config.FRAME_SAMPLE_RATE == 0:
                        c2, annotated2 = detector.detect_and_annotate(frame2)
                        z2_samples.append(c2)
                        update_zone_frame("zone_2", annotated2)
                        if flow_z2:
                            curr_den = (sum(z2_samples) / len(z2_samples)) / 15.0 if z2_samples else 0.0
                            z2_conv, z2_turb, z2_panic = flow_z2.analyze(frame2, curr_den)
                    else:
                        update_zone_frame("zone_2", frame2)
            else:
                if frame_step % config.FRAME_SAMPLE_RATE == 0:
                    demo_frame = create_demo_crowd_frame(frame_step // config.FRAME_SAMPLE_RATE)
                    c2, annotated2 = detector.detect_and_annotate(demo_frame)
                    c2 = max(c2, 32 + (frame_step // 5 % 15))
                    z2_samples.append(c2)
                    update_zone_frame("zone_2", annotated2)
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
                    area_sqm=config.AREA_SQM,
                    feed_source=feed_source_z1,
                    flow_convergence=z1_conv,
                    flow_turbulence=z1_turb,
                    panic_signature=z1_panic,
                )
                print(f"[CV-Z1] {json.dumps(p1, separators=(',', ':'))}")
                z1_samples = []
                z1_start = now

            if now - z2_start >= config.EMIT_INTERVAL_SEC and z2_samples:
                p2 = emit(
                    z2_samples,
                    zone_id="zone_2",
                    zone_type="corridor",
                    area_sqm=15.0,
                    feed_source=feed_source_z2,
                    flow_convergence=z2_conv,
                    flow_turbulence=z2_turb,
                    panic_signature=z2_panic,
                )
                print(f"[CV-Z2] {json.dumps(p2, separators=(',', ':'))}")
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
