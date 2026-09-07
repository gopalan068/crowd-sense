"""
cv-service/precompute_cctv_cache.py
Offline batch processing script that runs YOLOv8 detection and Optical Flow
over CCTV footage and caches deterministic frame-by-frame results to cctv_cache.json.

Saved Data Per Frame:
  - people_count: Raw / accurate YOLO headcount
  - density: people_count / area_sqm (p/m²)
  - boxes: List of [[x1, y1, x2, y2, conf], ...]
  - flow_convergence: Vector alignment towards designated egress focal point
  - flow_turbulence: Optical flow velocity variance
  - panic_signature: Sudden acceleration / dispersion threshold flag
  - exodus_signature: High convergence + elevated speed flag
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Dict, Any, List

import cv2
import numpy as np

# Ensure unbuffered stdout on Windows
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

import config
from detector import PersonDetector
from flow_analyzer import FlowAnalyzer


def precompute_cctv_video_cache(
    video_path: str,
    zone_id: str = "zone_1",
    area_sqm: float = 20.0,
    model_path: str | None = None,
    output_cache: str = "cctv_cache.json",
    step_frames: int = 1,
    max_frames: int | None = None,
) -> Dict[str, Any]:
    print("=" * 75)
    print(f"[CCTV PRECOMPUTE] Generating Offline CCTV AI Cache from Video")
    print(f"                  Video: {video_path}")
    print(f"                  Zone: {zone_id} | Area: {area_sqm} m² | Step: Every {step_frames} frame(s)")
    print("=" * 75)

    if not os.path.exists(video_path):
        print(f"[ERROR] Video file not found: {video_path}")
        sys.exit(1)

    resolved_model = model_path or config.MODEL_PATH
    print(f"[CCTV PRECOMPUTE] Loading PersonDetector with model: {resolved_model} (Camera: CCTV)...")
    detector = PersonDetector(resolved_model, camera_type="cctv", model_type=config.MODEL_TYPE)
    
    # Initialize FlowAnalyzer
    flow_analyzer = FlowAnalyzer(
        focal_point=config.FOCAL_POINTS.get(zone_id, (320, 240)),
        camera_type="cctv",
    )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Unable to open video: {video_path}")
        sys.exit(1)

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"[CCTV PRECOMPUTE] Video Resolution: {video_w}x{video_h} @ {fps:.1f} FPS | Total Frames: {total_video_frames}")
    print("-" * 75)

    # Load existing cache store if it exists
    cache_store: Dict[str, Any] = {}
    if os.path.exists(output_cache):
        try:
            with open(output_cache, "r", encoding="utf-8") as f:
                cache_store = json.load(f)
        except Exception:
            cache_store = {}

    if "frames" not in cache_store:
        cache_store["frames"] = {}

    zone_frames_map: Dict[str, Any] = {}
    cache_store["frames"][zone_id] = zone_frames_map

    frame_idx = 0
    start_time = time.monotonic()
    counts: List[int] = []
    densities: List[float] = []
    evaluated_count = 0

    last_boxes: list = []
    last_record: dict = {}

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Standardize max width for consistent detection coordinates
        h, w = frame.shape[:2]
        if w > 1280:
            target_h = int(1280 * (h / w))
            frame = cv2.resize(frame, (1280, target_h), interpolation=cv2.INTER_AREA)

        if frame_idx % step_frames == 0:
            eval_t0 = time.monotonic()
            
            # 1. Real YOLOv8 detection
            count, boxes, det_lat = detector.detect(frame)
            density = round(count / area_sqm, 3) if area_sqm > 0 else 0.0

            # 2. Optical flow analysis
            conv, turb, panic, exodus = flow_analyzer.analyze(frame, density)
            eval_latency = round((time.monotonic() - eval_t0) * 1000.0, 1)

            # Format boxes for JSON: [[x1, y1, x2, y2, conf], ...]
            formatted_boxes = [
                [int(b[0]), int(b[1]), int(b[2]), int(b[3]), round(float(b[4]), 2)]
                for b in boxes
            ]

            record = {
                "frame": frame_idx,
                "people_count": count,
                "density": density,
                "boxes": formatted_boxes,
                "flow_convergence": round(float(conv), 3),
                "flow_turbulence": round(float(turb), 3),
                "panic_signature": bool(panic),
                "exodus_signature": bool(exodus),
                "density_source": "cctv_cached",
                "latency_ms": eval_latency,
            }

            zone_frames_map[str(frame_idx)] = record
            last_record = record
            counts.append(count)
            densities.append(density)
            evaluated_count += 1

            if evaluated_count % 15 == 0 or frame_idx == 0:
                print(
                    f"  Frame {frame_idx:4d}/{total_video_frames} | "
                    f"Count={count:3d} | "
                    f"Density={density:4.2f} p/m² | "
                    f"Turb={turb:4.2f} | "
                    f"Panic={str(panic):<5} | "
                    f"Boxes={len(formatted_boxes):2d} | "
                    f"Eval Latency={eval_latency:4.1f}ms",
                    flush=True,
                )
        else:
            # Interpolate from last evaluated record
            interpolated = dict(last_record)
            interpolated["frame"] = frame_idx
            zone_frames_map[str(frame_idx)] = interpolated

        frame_idx += 1
        if max_frames and frame_idx >= max_frames:
            break

    cap.release()
    elapsed = time.monotonic() - start_time

    # Also mirror to other zones for multi-zone convenience if needed
    if zone_id == "zone_1":
        cache_store["frames"]["zone_2"] = dict(zone_frames_map)
    elif zone_id == "zone_2":
        cache_store["frames"]["zone_1"] = dict(zone_frames_map)

    # Save summary metadata
    cache_store["metadata"] = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime()),
        "source_video": os.path.basename(video_path),
        "zone_id": zone_id,
        "camera_type": "cctv",
        "area_sqm": area_sqm,
        "total_video_frames": frame_idx,
        "evaluated_frames": evaluated_count,
        "step_frames": step_frames,
        "statistics": {
            "mean_count": round(float(np.mean(counts)), 2) if counts else 0,
            "min_count": int(np.min(counts)) if counts else 0,
            "max_count": int(np.max(counts)) if counts else 0,
            "mean_density": round(float(np.mean(densities)), 3) if densities else 0,
            "min_density": round(float(np.min(densities)), 3) if densities else 0,
            "max_density": round(float(np.max(densities)), 3) if densities else 0,
        },
    }

    with open(output_cache, "w", encoding="utf-8") as f:
        json.dump(cache_store, f, indent=2)

    print("\n" + "=" * 75)
    print(f"[CCTV PRECOMPUTE DONE] Saved {len(zone_frames_map)} cached frames in {elapsed:.1f}s")
    print(f"                       Output File: {os.path.abspath(output_cache)}")
    print("-" * 75)
    print(f"  Source Video : {os.path.basename(video_path)} ({frame_idx} frames)")
    print(f"  Mean Count   : {np.mean(counts):.1f} people (Min: {min(counts)}, Max: {max(counts)})")
    print(f"  Mean Density : {np.mean(densities):.2f} p/m² (Min: {min(densities):.2f}, Max: {max(densities):.2f})")
    print("=" * 75 + "\n")

    return cache_store


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute and Cache CCTV Bounding Boxes and Flow Metrics")
    parser.add_argument("--video", type=str, default="videos/crowd_4.mp4", help="Path to CCTV video (.mp4)")
    parser.add_argument("--zone", type=str, default="zone_1", help="Zone ID (zone_1 or zone_2)")
    parser.add_argument("--area", type=float, default=20.0, help="Zone area in m²")
    parser.add_argument("--model", type=str, default=None, help="YOLO model path")
    parser.add_argument("--out", type=str, default="cctv_cache.json", help="Output cache JSON path")
    parser.add_argument("--step", type=int, default=1, help="Frame step interval (default 1 = every frame)")
    parser.add_argument("--max-frames", type=int, default=None, help="Max frames to process")
    args = parser.parse_args()

    precompute_cctv_video_cache(
        video_path=args.video,
        zone_id=args.zone,
        area_sqm=args.area,
        model_path=args.model,
        output_cache=args.out,
        step_frames=args.step,
        max_frames=args.max_frames,
    )


if __name__ == "__main__":
    main()
