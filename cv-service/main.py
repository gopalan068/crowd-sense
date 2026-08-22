"""
cv-service/main.py
Multi-Zone Entry Point: Decoupled Multi-Threaded Video Streaming & AI Analysis Engine.

Per-Zone Decoupled Execution:
  - Drone Mode: Analyzes 1 frame every 4.0 seconds (Heavy SAHI/Drone crowd inference, zero lag).
  - CCTV Mode: Analyzes 1 frame every 1.0 second (Ground angle inference).
  - Stream Server: Streams smooth 30 FPS video preview to the dashboard shell continuously.
"""
from __future__ import annotations

import argparse
import json
import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
import sys
import threading
import time
import numpy as np
import math

import cv2

import config
from detector import PersonDetector
from emitter import emit
from flow_analyzer import FlowAnalyzer
from stream_server import start_stream_server, update_zone_frame


def parse_source(src: str) -> int | str:
    if src.isdigit():
        return int(src)
    if os.path.exists(src):
        return src
    alt_path = os.path.join("videos", os.path.basename(src))
    if os.path.exists(alt_path):
        return alt_path
    return src


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


def zone_loop(
    *,
    cap,                        # cv2.VideoCapture or None
    src,                        # original source (int or str)
    detector: PersonDetector,
    flow_analyzer,              # FlowAnalyzer or None
    zone_id: str,
    zone_type: str,
    area_sqm: float,
    feed_source: str,
    camera_type: str,
    stop_event: threading.Event,
    log_tag: str,
) -> None:
    """
    Decoupled per-zone worker thread.
    
    Streams video frames at smooth 30 FPS pacing continuously.
    Runs heavy AI analysis every analysis_interval seconds:
      - 4.0 seconds for Drone overhead feeds (SAHI + Farneback Flow).
      - 1.0 second for CCTV ground feeds.
    """
    analysis_interval_sec = config.DRONE_ANALYSIS_INTERVAL_SEC if camera_type == "drone" else config.CCTV_ANALYSIS_INTERVAL_SEC

    last_analysis_time = 0.0
    last_boxes: list[tuple] = []
    conv, turb, panic = 0.0, 0.0, False
    last_latency = 0.0
    last_count = 0
    demo_step = 0

    print(f"{log_tag} Started worker thread | Mode=[{camera_type.upper()}] | Analysis Interval={analysis_interval_sec}s")

    while not stop_event.is_set():
        # 1. Read next video frame
        if cap and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                if isinstance(src, str):  # file ended -> loop back
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                if not ret:
                    time.sleep(0.033)
                    continue
        else:
            frame = create_demo_crowd_frame(demo_step)
            demo_step += 1

        now = time.monotonic()

        # 2. Run AI Analysis when interval elapses
        if now - last_analysis_time >= analysis_interval_sec:
            last_count, last_boxes, last_latency = detector.detect(frame)

            if flow_analyzer:
                curr_den = last_count / area_sqm
                conv, turb, panic = flow_analyzer.analyze(frame, curr_den)

            # Emit reading to backend
            payload = emit(
                [last_count],
                zone_id=zone_id,
                zone_type=zone_type,
                area_sqm=area_sqm,
                feed_source=feed_source,
                camera_type=camera_type,
                flow_convergence=round(conv, 3),
                flow_turbulence=round(turb, 3),
                panic_signature=panic,
            )
            print(
                f"{log_tag} [AI Analyzed] count={last_count} den={payload['density']} p/m² "
                f"flow_turb={round(turb, 2)} (latency: {last_latency}ms)"
            )
            last_analysis_time = now

        # 3. Annotate and stream frame preview continuously for smooth 30 FPS video playback
        annotated = detector.annotate(frame, last_boxes)
        update_zone_frame(zone_id, annotated)

        # Smooth ~30 FPS frame pacing for video file / webcam stream
        time.sleep(0.033)


def main() -> None:
    parser = argparse.ArgumentParser(description="CrowdSense Multi-Zone CV Microservice")
    parser.add_argument("--z1",    type=str, default=None, help="Zone 1 video source (0=webcam or path)")
    parser.add_argument("--z2",    type=str, default=None, help="Zone 2 video source (path to .mp4)")
    parser.add_argument("--type1", type=str, default=None, choices=["drone", "cctv"])
    parser.add_argument("--type2", type=str, default=None, choices=["drone", "cctv"])
    args = parser.parse_args()

    z1_source_str = args.z1   or config.VIDEO_SOURCE_Z1
    z2_source_str = args.z2   or config.VIDEO_SOURCE_Z2
    type_z1       = (args.type1 or config.CAMERA_TYPE_Z1).lower()
    type_z2       = (args.type2 or config.CAMERA_TYPE_Z2).lower()

    src_z1 = parse_source(z1_source_str)
    src_z2 = parse_source(z2_source_str)

    feed_z1 = "live_webcam" if isinstance(src_z1, int) else "pre_recorded"
    feed_z2 = "live_webcam" if isinstance(src_z2, int) else "pre_recorded"

    print(
        f"\n[CV] Multi-Zone Engine Starting — Model: {config.MODEL_PATH}\n"
        f"     Model Type: {config.MODEL_TYPE.upper()} | SAHI Enabled: {config.USE_SAHI}\n"
        f"     Drone Analysis Interval: {config.DRONE_ANALYSIS_INTERVAL_SEC}s | CCTV Analysis Interval: {config.CCTV_ANALYSIS_INTERVAL_SEC}s\n"
        f"     Zone 1: 'zone_1' ({config.ZONE_TYPE})  Source: {src_z1!r} Mode: [{type_z1.upper()}]\n"
        f"     Zone 2: 'zone_2' (corridor) Source: {src_z2!r} Mode: [{type_z2.upper()}]\n"
    )

    start_stream_server(port=5001)

    detector_z1 = PersonDetector(config.MODEL_PATH, camera_type=type_z1, model_type=config.MODEL_TYPE)
    detector_z2 = PersonDetector(config.MODEL_PATH, camera_type=type_z2, model_type=config.MODEL_TYPE)

    flow_z1 = FlowAnalyzer(config.FOCAL_POINTS["zone_1"]) if config.ENABLE_OPTICAL_FLOW else None
    flow_z2 = FlowAnalyzer(config.FOCAL_POINTS["zone_2"]) if config.ENABLE_OPTICAL_FLOW else None

    # Open Zone 1 Stream
    cap_z1 = cv2.VideoCapture(src_z1) if src_z1 is not None else None
    if cap_z1 and not cap_z1.isOpened():
        print(f"[CV] WARN: Cannot open Zone 1 source {src_z1!r}")

    # Open Zone 2 Stream
    cap_z2 = cv2.VideoCapture(src_z2) if src_z2 is not None else None
    if cap_z2 and not cap_z2.isOpened():
        print(f"[CV] INFO: Zone 2 file {src_z2!r} not opened — falling back to synthetic generator.")

    stop_event = threading.Event()

    t1 = threading.Thread(
        target=zone_loop,
        kwargs=dict(
            cap=cap_z1,
            src=src_z1,
            detector=detector_z1,
            flow_analyzer=flow_z1,
            zone_id="zone_1",
            zone_type=config.ZONE_TYPE,
            area_sqm=config.AREA_SQM,
            feed_source=feed_z1,
            camera_type=type_z1,
            stop_event=stop_event,
            log_tag="[CV-Z1]",
        ),
        daemon=True,
        name="ZoneWorker-1",
    )

    t2 = threading.Thread(
        target=zone_loop,
        kwargs=dict(
            cap=cap_z2,
            src=src_z2,
            detector=detector_z2,
            flow_analyzer=flow_z2,
            zone_id="zone_2",
            zone_type="corridor",
            area_sqm=15.0,
            feed_source=feed_z2,
            camera_type=type_z2,
            stop_event=stop_event,
            log_tag="[CV-Z2]",
        ),
        daemon=True,
        name="ZoneWorker-2",
    )

    t1.start()
    t2.start()

    print("[CV] Both zone workers running cleanly in parallel threads. Press Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n[CV] Stopping workers...")
        stop_event.set()
        t1.join(timeout=2.0)
        t2.join(timeout=2.0)
        if cap_z1:
            cap_z1.release()
        if cap_z2:
            cap_z2.release()
        print("[CV] Shutdown complete.")


if __name__ == "__main__":
    main()
