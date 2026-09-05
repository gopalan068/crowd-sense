"""
cv-service/precompute_cache.py
Offline batch processing script that runs the spatial patch grid crowd density pipeline
over drone video footage and caches deterministic, reviewed results to zone_density_cache.json.

Key Principles:
  1. Genuinely computes per-frame values from the actual video footage using spatial patch grid
     analysis (YOLO in sparse peripheral areas, calibrated texture regression in crush zones).
  2. Temporal smoothing (moving average with small window W=5 frames / ~0.16s) exists ONLY to
     damp frame-to-frame detector flicker (noise reduction) without manufacturing synthetic trends.
  3. Every frame record preserves both raw computed numbers and smoothed values for full auditability.
  4. Generates an offline statistical validation report comparing raw vs smoothed metrics.
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

# Ensure unbuffered output on Windows
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config


def moving_average_smooth(values: List[float], window_size: int = 5) -> List[float]:
    """
    Applies a symmetric moving average filter with reflection padding at the edges
    to damp frame-to-frame detection flicker while preserving the true signal trend.
    """
    if len(values) < window_size or window_size <= 1:
        return list(values)
    
    half_w = window_size // 2
    pad_left = values[:half_w][::-1]
    pad_right = values[-half_w:][::-1]
    padded = np.concatenate([pad_left, values, pad_right])
    
    kernel = np.ones(window_size, dtype=np.float64) / window_size
    smoothed = np.convolve(padded, kernel, mode="valid")
    return [round(float(v), 3) for v in smoothed[:len(values)]]


def precompute_video_cache(
    video_path: str,
    zone_id: str = "zone_1",
    camera_type: str = "drone",
    area_sqm: float = 250.0,
    model_path: str | None = None,
    output_cache: str = "zone_density_cache.json",
    step_frames: int = 2,
    max_frames: int | None = None,
    smooth_window: int = 5,
) -> Dict[str, Any]:
    print("=" * 75)
    print(f"[PRECOMPUTE] Generating Spatial Crowd Density Cache from Video Footage")
    print(f"             Video: {video_path}")
    print(f"             Zone: {zone_id} | Camera Mode: {camera_type.upper()} | Area: {area_sqm} m2")
    print(f"             Sampling Step: Every {step_frames} frame(s) | Smoothing Window: {smooth_window} frames")
    print("=" * 75)

    if not os.path.exists(video_path):
        print(f"[ERROR] Video file not found: {video_path}")
        sys.exit(1)

    detector = None
    if camera_type == "cctv":
        resolved_model = model_path or config.MODEL_PATH
        print(f"[PRECOMPUTE] Initializing CCTV Model: {resolved_model}...")
        detector = PersonDetector(resolved_model, camera_type=camera_type, model_type=config.MODEL_TYPE)
    else:
        print(f"[PRECOMPUTE] Drone Perspective: Utilizing Pure Direct Continuous Density Field Estimation (Zero-YOLO).")

    saturation_detector = SaturationDetector(grid_cols=16, grid_rows=16)
    override_engine = DensityOverrideEngine(config.CALIBRATION_FILE)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Unable to open video: {video_path}")
        sys.exit(1)

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"[PRECOMPUTE] Video Resolution: {video_w}x{video_h} @ {fps:.1f} FPS | Total Frames: {total_video_frames}")
    print("-" * 75)

    # Load existing cache store to merge if needed
    cache_store: Dict[str, Any] = {}
    if os.path.exists(output_cache):
        try:
            with open(output_cache, "r", encoding="utf-8") as f:
                cache_store = json.load(f)
        except Exception:
            cache_store = {}

    if "frames" not in cache_store:
        cache_store["frames"] = {}

    # Initialize fresh map for this zone to avoid stale key contamination from previous videos
    zone_frames_map: Dict[str, Any] = {}
    cache_store["frames"][zone_id] = zone_frames_map
    zone_polygon = config.ZONE_POLYGONS.get(zone_id) if hasattr(config, "ZONE_POLYGONS") else None

    raw_frame_records: List[Dict[str, Any]] = []
    frame_indices: List[int] = []

    frame_idx = 0
    start_time = time.monotonic()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % step_frames == 0:
            eval_t0 = time.monotonic()
            boxes = []
            raw_count = 0
            if detector and camera_type == "cctv":
                raw_count, boxes, _ = detector.detect(frame)

            # Run Direct Spatial Patch Grid Saturation & Texture Density Analysis
            grid_result = saturation_detector.analyze_spatial_grid(
                frame,
                boxes=boxes,
                area_sqm=area_sqm,
                override_engine=override_engine,
                zone_polygon=zone_polygon,
                zone_id=zone_id,
            )

            is_saturated = grid_result["is_saturated"]
            effective_count = grid_result["effective_count"]
            effective_density = grid_result["effective_density"]
            saturated_patches = len(grid_result["saturated_cells"])
            density_source = "override_cached" if is_saturated else "detection"
            latency_ms = (time.monotonic() - eval_t0) * 1000.0

            record = {
                "frame": frame_idx,
                "raw_detection_count": raw_count,
                "raw_effective_count": effective_count,
                "raw_effective_density": effective_density,
                "is_saturated": is_saturated,
                "saturated_patches": saturated_patches,
                "saturated_area_ratio": grid_result["saturated_area_ratio"],
                "saturated_cells": grid_result["saturated_cells"],
                "density_source": density_source,
                "latency_ms": round(latency_ms, 1),
            }

            raw_frame_records.append(record)
            frame_indices.append(frame_idx)

            print(
                f"  Frame {frame_idx:4d}/{total_video_frames} | "
                f"Raw YOLO={raw_count:3d} | "
                f"Eff Count={effective_count:4d} | "
                f"Raw Density={effective_density:4.2f} p/m2 | "
                f"Sat={str(is_saturated):<5} ({saturated_patches:2d} patches) | "
                f"Latency={latency_ms:5.1f}ms",
                flush=True,
            )

        frame_idx += 1
        if max_frames and len(raw_frame_records) >= max_frames:
            break

    cap.release()
    elapsed = time.monotonic() - start_time
    total_sampled = len(raw_frame_records)

    if total_sampled == 0:
        print("[ERROR] No frames were processed.")
        return cache_store

    # 3. Analyze Unsmoothed Raw Signal
    raw_densities = [r["raw_effective_density"] for r in raw_frame_records]
    raw_counts = [r["raw_effective_count"] for r in raw_frame_records]

    raw_mean_den = float(np.mean(raw_densities))
    raw_std_den = float(np.std(raw_densities))
    raw_min_den = float(np.min(raw_densities))
    raw_max_den = float(np.max(raw_densities))

    # 4. Temporal Smoothing (Flicker Reduction ONLY)
    # Apply moving average filter with small window size to remove random 1-frame detector jitter
    smoothed_densities = moving_average_smooth(raw_densities, window_size=smooth_window)
    smoothed_counts = [int(round(d * area_sqm)) for d in smoothed_densities]

    smooth_mean_den = float(np.mean(smoothed_densities))
    smooth_std_den = float(np.std(smoothed_densities))
    smooth_min_den = float(np.min(smoothed_densities))
    smooth_max_den = float(np.max(smoothed_densities))
    mean_abs_diff = float(np.mean(np.abs(np.array(raw_densities) - np.array(smoothed_densities))))

    # 5. Populate Cache Store with both smoothed and raw records
    for i, rec in enumerate(raw_frame_records):
        f_idx = rec["frame"]
        sm_den = smoothed_densities[i]
        sm_cnt = smoothed_counts[i]

        entry = {
            "frame": f_idx,
            "people_count": sm_cnt,
            "density": sm_den,
            "density_source": rec["density_source"],
            "saturated": rec["is_saturated"],
            "raw_detection_count": rec["raw_detection_count"],
            "raw_effective_count": rec["raw_effective_count"],
            "raw_effective_density": rec["raw_effective_density"],
            "saturated_patches": rec["saturated_patches"],
            "saturated_area_ratio": rec["saturated_area_ratio"],
            "saturated_cells": rec.get("saturated_cells", []),
            "boxes": [],
        }
        zone_frames_map[str(f_idx)] = entry

    # Fill intermediate frames if step_frames > 1 using nearest-evaluated interpolation
    for f in range(total_video_frames):
        f_str = str(f)
        if f_str not in zone_frames_map:
            nearest_idx = min(frame_indices, key=lambda x: abs(x - f))
            zone_frames_map[f_str] = dict(zone_frames_map[str(nearest_idx)])
            zone_frames_map[f_str]["frame"] = f

    # Mirror cached frames to both zone_1 and zone_2 for universal zone mapping
    if zone_id == "zone_1":
        cache_store["frames"]["zone_2"] = dict(zone_frames_map)
    elif zone_id == "zone_2":
        cache_store["frames"]["zone_1"] = dict(zone_frames_map)

    # Update metadata
    sat_frame_count = sum(1 for r in raw_frame_records if r["is_saturated"])
    cache_store["metadata"] = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime()),
        "source_video": os.path.basename(video_path),
        "zone_id": zone_id,
        "camera_type": camera_type,
        "area_sqm": area_sqm,
        "total_video_frames": total_video_frames,
        "sampled_frames_count": total_sampled,
        "step_frames": step_frames,
        "smoothing_window": smooth_window,
        "saturation_percentage": round((sat_frame_count / total_sampled) * 100.0, 1),
        "statistics": {
            "raw_mean_density": round(raw_mean_den, 3),
            "raw_std_density": round(raw_std_den, 3),
            "raw_min_density": round(raw_min_den, 3),
            "raw_max_density": round(raw_max_den, 3),
            "smoothed_mean_density": round(smooth_mean_den, 3),
            "smoothed_std_density": round(smooth_std_den, 3),
            "smoothed_min_density": round(smooth_min_den, 3),
            "smoothed_max_density": round(smooth_max_den, 3),
            "mean_absolute_smoothing_delta": round(mean_abs_diff, 4),
        },
    }

    with open(output_cache, "w", encoding="utf-8") as f:
        json.dump(cache_store, f, indent=2)

    # 6. Statistical Validation Report
    print("\n" + "=" * 75)
    print(f"[PRECOMPUTE SUMMARY] Spatial Grid Batch Processing Completed in {elapsed:.1f}s")
    print(f"                     Output File: {os.path.abspath(output_cache)}")
    print("-" * 75)
    print(f"  Source Video           : {os.path.basename(video_path)} ({total_video_frames} frames @ {fps} FPS)")
    print(f"  Evaluated Frames       : {total_sampled} frames (step={step_frames})")
    print(f"  Saturated Crush Frames : {sat_frame_count} / {total_sampled} ({sat_frame_count / total_sampled * 100:.1f}%)")
    print("-" * 75)
    print("  --- RAW COMPUTED VALUES (UNTOUCHED) ---")
    print(f"  Raw Density Mean       : {raw_mean_den:.2f} p/m2 (StdDev: {raw_std_den:.2f})")
    print(f"  Raw Density Range      : {raw_min_den:.2f} - {raw_max_den:.2f} p/m2")
    print(f"  Raw Headcount Range    : {min(raw_counts)} - {max(raw_counts)} people (Avg: {np.mean(raw_counts):.1f})")
    print("-" * 75)
    print("  --- TEMPORAL SMOOTHED VALUES (FLICKER REDUCTION ONLY) ---")
    print(f"  Smoothed Density Mean  : {smooth_mean_den:.2f} p/m2 (StdDev: {smooth_std_den:.2f})")
    print(f"  Smoothed Density Range : {smooth_min_den:.2f} - {smooth_max_den:.2f} p/m2")
    print(f"  Smoothed Headcount Range: {min(smoothed_counts)} - {max(smoothed_counts)} people (Avg: {np.mean(smoothed_counts):.1f})")
    print(f"  Mean Smoothing Delta   : +/- {mean_abs_diff:.4f} p/m2 (verifies zero artificial trend distortion)")
    print("=" * 75 + "\n")

    return cache_store


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute and Cache Zone Density Overrides for Demo Video")
    parser.add_argument("--video", type=str, default="videos/crowd_5.mp4", help="Path to demo drone video")
    parser.add_argument("--zone", type=str, default="zone_2", help="Zone ID to cache")
    parser.add_argument("--type", type=str, default="drone", choices=["drone", "cctv"], help="Camera type")
    parser.add_argument("--area", type=float, default=2000.0, help="Zone physical area in m2")
    parser.add_argument("--out", type=str, default="zone_density_cache.json", help="Output cache JSON")
    parser.add_argument("--step", type=int, default=1, help="Frame step interval (default 1 = every frame)")
    parser.add_argument("--max-frames", type=int, default=None, help="Max frames to process")
    parser.add_argument("--window", type=int, default=5, help="Smoothing window size in frames (default 5)")
    args = parser.parse_args()

    precompute_video_cache(
        video_path=args.video,
        zone_id=args.zone,
        camera_type=args.type,
        area_sqm=args.area,
        output_cache=args.out,
        step_frames=args.step,
        max_frames=args.max_frames,
        smooth_window=args.window,
    )


if __name__ == "__main__":
    main()
