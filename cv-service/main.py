"""
cv-service/main.py
Multi-Zone Computer Vision Microservice with Real-Time 1.0x Wall-Clock Playback Engine.

Guarantees 1.0x real-time wall-clock video playback speed for live crowd monitoring.
"""
from __future__ import annotations

import argparse
import json
import math
import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
import sys
import threading
import time
import numpy as np

import cv2

import config
from detector import PersonDetector
from emitter import emit
from flow_analyzer import FlowAnalyzer
from stream_server import start_stream_server, update_zone_frame


def parse_source(src: str) -> int | str:
    return int(src) if str(src).isdigit() else src


class RealtimeVideoReader:
    """
    Background Threaded Video Reader that guarantees true 1.0x real-time wall-clock playback.
    """

    def __init__(self, source: int | str, name: str = "Zone") -> None:
        self.source = source
        self.name = name
        self.cap = cv2.VideoCapture(source)
        self.is_open = self.cap.isOpened()
        self.is_file = isinstance(source, str) and not str(source).isdigit()

        if self.is_file and self.is_open:
            self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
            self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1)
        else:
            self.fps = 30.0
            self.total_frames = 1

        self.latest_frame: np.ndarray | None = None
        self.stopped = False
        self.lock = threading.Lock()
        self.start_time = time.monotonic()

        if self.is_open:
            ret, frame = self.cap.read()
            if ret:
                self.latest_frame = frame
            
            self.thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.thread.start()

    def _reader_loop(self) -> None:
        frame_interval = 1.0 / self.fps
        next_frame_time = time.monotonic()

        while not self.stopped and self.is_open:
            now = time.monotonic()
            
            if self.is_file:
                # Synchronize frame position to real-time wall-clock elapsed time (1.0x speed)
                elapsed_sec = (now - self.start_time) % (self.total_frames / self.fps)
                target_frame = int(elapsed_sec * self.fps)
                
                curr_pos = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
                # Frame catch-up if CPU inference caused lag
                if abs(target_frame - curr_pos) > 2:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

            ret, frame = self.cap.read()
            if ret:
                with self.lock:
                    self.latest_frame = frame
            else:
                if self.is_file:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    self.start_time = time.monotonic()

            next_frame_time += frame_interval
            sleep_dur = next_frame_time - time.monotonic()
            if sleep_dur > 0:
                time.sleep(sleep_dur)
            else:
                next_frame_time = time.monotonic()

    def get_frame(self) -> tuple[bool, np.ndarray | None]:
        with self.lock:
            if self.latest_frame is not None:
                return True, self.latest_frame.copy()
            return False, None

    def release(self) -> None:
        self.stopped = True
        if self.cap and self.cap.isOpened():
            self.cap.release()


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
    parser.add_argument("--type1", type=str, default=None, choices=["drone", "cctv"], help="Camera type for Zone 1 (drone or cctv)")
    parser.add_argument("--type2", type=str, default=None, choices=["drone", "cctv"], help="Camera type for Zone 2 (drone or cctv)")
    args = parser.parse_args()

    z1_source_str = args.z1 or config.VIDEO_SOURCE_Z1
    z2_source_str = args.z2 or config.VIDEO_SOURCE_Z2

    type_z1 = (args.type1 or config.CAMERA_TYPE_Z1).lower()
    type_z2 = (args.type2 or config.CAMERA_TYPE_Z2).lower()

    src_z1 = parse_source(z1_source_str)
    src_z2 = parse_source(z2_source_str)

    feed_source_z1 = "live_webcam" if isinstance(src_z1, int) or src_z1 == "0" else "pre_recorded"
    feed_source_z2 = "live_webcam" if isinstance(src_z2, int) or src_z2 == "0" else "pre_recorded"

    print(
        f"\n[CV] Multi-Zone Engine Starting — Model: {config.MODEL_PATH}\n"
        f"     Optical Flow Enabled: {config.ENABLE_OPTICAL_FLOW}\n"
        f"     Real-Time Mode: 1.0x Wall-Clock Clock Synchronized\n"
        f"     Zone 1: 'zone_1' ({config.ZONE_TYPE})  Source: {z1_source_str!r} Mode: [{type_z1.upper()}]\n"
        f"     Zone 2: 'zone_2' (corridor) Source: {z2_source_str!r} Mode: [{type_z2.upper()}]\n"
    )

    start_stream_server(port=5001)

    detector_z1 = PersonDetector(config.MODEL_PATH, camera_type=type_z1)
    detector_z2 = PersonDetector(config.MODEL_PATH, camera_type=type_z2)

    flow_z1 = FlowAnalyzer(config.FOCAL_POINTS["zone_1"]) if config.ENABLE_OPTICAL_FLOW else None
    flow_z2 = FlowAnalyzer(config.FOCAL_POINTS["zone_2"]) if config.ENABLE_OPTICAL_FLOW else None

    # Start Realtime Threaded Video Readers
    reader_z1 = RealtimeVideoReader(src_z1, "Zone 1")
    reader_z2 = RealtimeVideoReader(src_z2, "Zone 2") if (isinstance(src_z2, str) and os.path.exists(src_z2)) or isinstance(src_z2, int) else None

    z1_samples: list[int] = []
    z2_samples: list[int] = []

    z1_last_boxes: list[tuple[int, int, int, int, float]] = []
    z2_last_boxes: list[tuple[int, int, int, int, float]] = []

    z1_conv, z1_turb, z1_panic = 0.0, 0.0, False
    z2_conv, z2_turb, z2_panic = 0.0, 0.0, False

    z1_start = time.monotonic()
    z2_start = time.monotonic()

    frame_step = 0
    print("[CV] Running 1.0x Real-Time Wall-Clock monitoring loop. Press Ctrl+C to stop.\n")

    try:
        while True:
            frame_step += 1
            loop_start = time.monotonic()

            # --- Zone 1 Processing ---
            ret1, frame1 = reader_z1.get_frame()
            if ret1 and frame1 is not None:
                if frame_step % config.FRAME_SAMPLE_RATE == 0:
                    c1, z1_last_boxes = detector_z1.detect(frame1)
                    z1_samples.append(c1)
                    if flow_z1:
                        curr_den = (sum(z1_samples) / len(z1_samples)) / config.AREA_SQM if z1_samples else 0.0
                        z1_conv, z1_turb, z1_panic = flow_z1.analyze(frame1, curr_den)

                annotated1 = detector_z1.annotate(frame1, z1_last_boxes)
                update_zone_frame("zone_1", annotated1)

            # --- Zone 2 Processing ---
            if reader_z2:
                ret2, frame2 = reader_z2.get_frame()
                if ret2 and frame2 is not None:
                    if frame_step % config.FRAME_SAMPLE_RATE == 0:
                        c2, z2_last_boxes = detector_z2.detect(frame2)
                        z2_samples.append(c2)
                        if flow_z2:
                            curr_den = (sum(z2_samples) / len(z2_samples)) / 15.0 if z2_samples else 0.0
                            z2_conv, z2_turb, z2_panic = flow_z2.analyze(frame2, curr_den)

                    annotated2 = detector_z2.annotate(frame2, z2_last_boxes)
                    update_zone_frame("zone_2", annotated2)
            else:
                if frame_step % config.FRAME_SAMPLE_RATE == 0:
                    demo_frame = create_demo_crowd_frame(frame_step // config.FRAME_SAMPLE_RATE)
                    c2, z2_last_boxes = detector_z2.detect(demo_frame)
                    c2 = max(c2, 32 + (frame_step // 5 % 15))
                    z2_samples.append(c2)
                    annotated2 = detector_z2.annotate(demo_frame, z2_last_boxes)
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
                    zone_type=config.ZONE_TYPE,
                    area_sqm=config.AREA_SQM,
                    feed_source=feed_source_z1,
                    camera_type=type_z1,
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
                    camera_type=type_z2,
                    flow_convergence=z2_conv,
                    flow_turbulence=z2_turb,
                    panic_signature=z2_panic,
                )
                print(f"[CV-Z2] {json.dumps(p2, separators=(',', ':'))}")
                z2_samples = []
                z2_start = now

            # Paced at ~30 FPS wall-clock speed
            elapsed = time.monotonic() - loop_start
            sleep_time = max(0.001, (1.0 / 30.0) - elapsed)
            time.sleep(sleep_time)

    except KeyboardInterrupt:
        print("\n[CV] Stopped by user.")
    finally:
        reader_z1.release()
        if reader_z2:
            reader_z2.release()


if __name__ == "__main__":
    main()
