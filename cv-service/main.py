"""
cv-service/main.py
Multi-Zone Entry Point: Decoupled Multi-Threaded Video Streaming & AI Analysis Engine.

Per-Zone Decoupled Execution:
  - Drone Mode: Analyzes 1 frame every 4.0 seconds (Heavy SAHI/Drone crowd inference, zero lag).
  - CCTV Mode: Analyzes 1 frame every 1.0 second (Ground angle inference).
  - Stream Server: Streams smooth 30 FPS video preview to the dashboard shell continuously.
  - Per-Zone Physical Area & Type: AREA_SQM_Z1/Z2 and ZONE_TYPE_Z1/Z2 supported independently in .env.
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
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine


def load_zone_density_cache(cache_path: str = "zone_density_cache.json") -> dict:
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                frames_cache = data.get("frames", {})
                print(f"[CV Cache] Loaded precomputed density cache ({len(frames_cache)} zones) from {cache_path}")
                return frames_cache
        except Exception as err:
            print(f"[CV Cache] Warning: Could not read {cache_path} ({err})")
    return {}


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
    saturation_detector: SaturationDetector,
    override_engine: DensityOverrideEngine,
    zone_density_cache: dict,
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
      - 3.0-4.0 seconds for Drone overhead feeds (SAHI + Farneback Flow + Saturation Fallback).
      - 1.0 second for CCTV ground feeds (Standard YOLO detection).
    """
    analysis_interval_sec = config.DRONE_ANALYSIS_INTERVAL_SEC if camera_type == "drone" else config.CCTV_ANALYSIS_INTERVAL_SEC
    override_mode = config.OVERRIDE_MODE.lower()
    zone_polygon = config.ZONE_POLYGONS.get(zone_id, None)

    last_analysis_time = 0.0
    last_boxes: list[tuple] = []
    conv, turb, panic, exodus = 0.0, 0.0, False, False
    last_latency = 0.0
    last_count = 0
    last_effective_density = 0.0
    last_density_source = "detection"
    last_saturated = False
    demo_step = 0
    last_frame_pos: int = -1   # tracks video position for loop detection
    loop_count: int = 0        # how many times the file has looped

    print(
        f"{log_tag} Started worker thread | Mode=[{camera_type.upper()}] | Type=[{zone_type.upper()}] | "
        f"Area={area_sqm}m² | Interval={analysis_interval_sec}s | OverrideMode=[{override_mode.upper()}]"
    )

    while not stop_event.is_set():
        # 1. Read next video frame
        if cap and cap.isOpened():
            curr_frame_pos = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
            ret, frame = cap.read()
            if not ret:
                if isinstance(src, str):  # file ended -> loop back
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                if not ret:
                    time.sleep(0.033)
                    continue

            # Detect video loop: position jumped back to near 0
            is_loop_frame = isinstance(src, str) and (curr_frame_pos < last_frame_pos - 1) and last_frame_pos > 0
            if is_loop_frame:
                loop_count += 1
                print(f"{log_tag} [VIDEO LOOP #{loop_count}] Video restarted — resetting FlowAnalyzer state.")
                if flow_analyzer:
                    flow_analyzer.reset()
                conv, turb, panic, exodus = 0.0, 0.0, False, False
            last_frame_pos = curr_frame_pos
        else:
            curr_frame_pos = demo_step
            is_loop_frame = False
            frame = create_demo_crowd_frame(demo_step)
            demo_step += 1

        now = time.monotonic()

        # 2. Camera Mode-Specific Streaming & Analysis Strategy
        if camera_type == "drone":
            # Drone Mode: Analysis + Saturation Override Module
            if now - last_analysis_time >= analysis_interval_sec and not is_loop_frame:
                raw_count, last_boxes, last_latency = detector.detect(frame)
                raw_density = round(raw_count / area_sqm, 3) if area_sqm > 0 else 0.0

                effective_count = raw_count
                effective_density = raw_density
                density_source = "detection"
                is_saturated = False
                saturated_cells = []

                # Saturation Detection & Override (Drone Mode Only)
                if override_mode != "off":
                    grid_eval = saturation_detector.analyze_spatial_grid(
                        frame,
                        boxes=last_boxes,
                        area_sqm=area_sqm,
                        override_engine=override_engine,
                        zone_polygon=zone_polygon,
                        zone_id=zone_id,
                    )
                    is_saturated = grid_eval["is_saturated"]
                    saturated_cells = grid_eval["saturated_cells"]

                    if is_saturated:
                        # Auto / Precomputed Mode: Check cache first
                        cached_zone_frames = zone_density_cache.get(zone_id, {})
                        cached_rec = None

                        if override_mode in ("auto", "precomputed") and cached_zone_frames:
                            frame_key = str(curr_frame_pos)
                            if frame_key in cached_zone_frames:
                                cached_rec = cached_zone_frames[frame_key]
                            else:
                                # Match nearest cached sample within +/- 15 frames
                                nearby_keys = [int(k) for k in cached_zone_frames.keys() if abs(int(k) - curr_frame_pos) <= 15]
                                if nearby_keys:
                                    nearest_k = min(nearby_keys, key=lambda k: abs(k - curr_frame_pos))
                                    cached_rec = cached_zone_frames[str(nearest_k)]

                        if cached_rec:
                            effective_density = float(cached_rec.get("density", 0.0))
                            effective_count = int(cached_rec.get("people_count", int(effective_density * area_sqm)))
                            density_source = "override_cached"
                        elif override_mode in ("auto", "live_proxy", "precomputed"):
                            # Spatial Grid Live Proxy Fallback
                            effective_density = grid_eval["effective_density"]
                            effective_count = grid_eval["effective_count"]
                            density_source = "override_live"

                last_count = effective_count
                last_effective_density = effective_density
                last_density_source = density_source
                last_saturated = is_saturated

                # Flow analysis using effective density
                if flow_analyzer:
                    conv, turb, panic, exodus = flow_analyzer.analyze(frame, effective_density)

                # Emit reading to backend
                payload = emit(
                    [effective_count],
                    zone_id=zone_id,
                    zone_type=zone_type,
                    area_sqm=area_sqm,
                    feed_source=feed_source,
                    camera_type=camera_type,
                    flow_convergence=round(conv, 3),
                    flow_turbulence=round(turb, 3),
                    panic_signature=panic,
                    exodus_signature=exodus,
                    density_source=density_source,
                    saturated=is_saturated,
                    override_density=effective_density,
                    override_people_count=effective_count,
                )

                override_tag = f"[{density_source.upper()} SATURATED: {len(saturated_cells)} patches]" if is_saturated else "[DETECTION]"
                print(
                    f"{log_tag} [AI Analyzed] {override_tag} count={effective_count} (raw={raw_count}) "
                    f"den={effective_density:.2f} p/m2 source={density_source} panic={panic} "
                    f"flow_turb={round(turb, 2)} (latency: {last_latency}ms)"
                )
                last_analysis_time = now

                # Push evaluated frame with annotations to dashboard stream
                annotated = saturation_detector.annotate_density_heatmap(
                    frame=frame,
                    boxes=last_boxes,
                    saturated_cells=saturated_cells,
                    area_sqm=area_sqm,
                    effective_count=effective_count,
                    effective_density=effective_density,
                    density_source=density_source,
                    is_saturated=is_saturated,
                    latency_ms=last_latency,
                    show_hud_legend=True,
                    show_top_badge=True,
                    show_pinpoint_dots=True,
                    zone_polygon=zone_polygon,
                    zone_id=zone_id,
                )

                update_zone_frame(zone_id, annotated)
        else:
            # CCTV Mode: Standard ground CCTV analysis (Zero override)
            if now - last_analysis_time >= analysis_interval_sec and not is_loop_frame:
                last_count, last_boxes, last_latency = detector.detect(frame)
                cctv_density = round(last_count / area_sqm, 3) if area_sqm > 0 else 0.0

                if flow_analyzer:
                    conv, turb, panic, exodus = flow_analyzer.analyze(frame, cctv_density)

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
                    exodus_signature=exodus,
                    density_source="detection",
                    saturated=False,
                )
                print(
                    f"{log_tag} [AI Analyzed] count={last_count} den={payload['density']} p/m² "
                    f"panic={panic} exodus={exodus} flow_turb={round(turb, 2)} (latency: {last_latency}ms)"
                )
                last_analysis_time = now

            annotated = detector.annotate(frame, last_boxes)
            update_zone_frame(zone_id, annotated)

        # Smooth ~30 FPS loop pacing
        time.sleep(0.033)


def main() -> None:
    parser = argparse.ArgumentParser(description="CrowdSense Multi-Zone CV Microservice")
    parser.add_argument("--z1",    type=str, default=None, help="Zone 1 video source (0=webcam or path)")
    parser.add_argument("--z2",    type=str, default=None, help="Zone 2 video source (path to .mp4)")
    parser.add_argument("--type1", type=str, default=None, choices=["drone", "cctv"])
    parser.add_argument("--type2", type=str, default=None, choices=["drone", "cctv"])
    parser.add_argument("--override-mode", type=str, default=None, choices=["auto", "precomputed", "live_proxy", "off"])
    args = parser.parse_args()

    if args.override_mode:
        config.OVERRIDE_MODE = args.override_mode

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
        f"     Override Mode: [{config.OVERRIDE_MODE.upper()}] (Active for Drone perspective)\n"
        f"     Zone 1: 'zone_1' ({config.ZONE_TYPE_Z1}) Area={config.AREA_SQM_Z1}m² Source: {src_z1!r} Mode: [{type_z1.upper()}]\n"
        f"     Zone 2: 'zone_2' ({config.ZONE_TYPE_Z2}) Area={config.AREA_SQM_Z2}m² Source: {src_z2!r} Mode: [{type_z2.upper()}]\n"
    )

    start_stream_server(port=5001)

    detector_z1 = PersonDetector(config.MODEL_PATH, camera_type=type_z1, model_type=config.MODEL_TYPE)
    detector_z2 = PersonDetector(config.MODEL_PATH, camera_type=type_z2, model_type=config.MODEL_TYPE)

    flow_z1 = FlowAnalyzer(config.FOCAL_POINTS["zone_1"], camera_type=type_z1) if config.ENABLE_OPTICAL_FLOW else None
    flow_z2 = FlowAnalyzer(config.FOCAL_POINTS["zone_2"], camera_type=type_z2) if config.ENABLE_OPTICAL_FLOW else None

    # Load Saturation Detector, Override Engine, and Precomputed Cache
    saturation_detector = SaturationDetector(
        min_detection_density=config.SATURATION_MIN_DETECTION_DENSITY,
        saturation_edge_threshold=config.SATURATION_EDGE_THRESHOLD,
    )
    override_engine = DensityOverrideEngine(config.CALIBRATION_FILE)
    zone_density_cache = load_zone_density_cache(config.CACHE_FILE)

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
            saturation_detector=saturation_detector,
            override_engine=override_engine,
            zone_density_cache=zone_density_cache,
            zone_id="zone_1",
            zone_type=config.ZONE_TYPE_Z1,
            area_sqm=config.AREA_SQM_Z1,
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
            saturation_detector=saturation_detector,
            override_engine=override_engine,
            zone_density_cache=zone_density_cache,
            zone_id="zone_2",
            zone_type=config.ZONE_TYPE_Z2,
            area_sqm=config.AREA_SQM_Z2,
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
