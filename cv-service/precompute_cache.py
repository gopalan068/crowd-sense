"""
cv-service/precompute_cache.py
Offline batch processing script that runs the full aerial detection & saturation
override pipeline over a demo video file once and caches results to zone_density_cache.json.

Keyed by (zone_id, frame_number) to guarantee 100% deterministic, reviewed output
during live presentation replay.

Includes offline sanity-check summary reporting (saturated frames vs detection frames,
density ranges, and trigger frequency).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Dict, Any

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


def precompute_video_cache(
    video_path: str,
    zone_id: str = "zone_1",
    camera_type: str = "drone",
    area_sqm: float = 250.0,
    model_path: str | None = None,
    output_cache: str = "zone_density_cache.json",
    step_frames: int = 1,
    max_frames: int | None = None,
) -> Dict[str, Any]:
    print("=" * 75)
    print(f"[PRECOMPUTE] Generating Zone Density Cache")
    print(f"             Video: {video_path}")
    print(f"             Zone: {zone_id} | Camera Mode: {camera_type.upper()} | Area: {area_sqm} m2")
    print("=" * 75)

    if not os.path.exists(video_path):
        print(f"[ERROR] Video file not found: {video_path}")
        sys.exit(1)

    resolved_model = model_path or config.MODEL_PATH
    print(f"[PRECOMPUTE] Loading Detector: {resolved_model} (SAHI={config.USE_SAHI})...")
    detector = PersonDetector(resolved_model, camera_type=camera_type, model_type=config.MODEL_TYPE)
    saturation_detector = SaturationDetector()
    override_engine = DensityOverrideEngine()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Unable to open video: {video_path}")
        sys.exit(1)

    total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"[PRECOMPUTE] Video Stats: {video_w}x{video_h} @ {fps:.1f} FPS | Total Frames: {total_video_frames}")

    # Load existing cache if present to allow multi-zone / multi-video merging
    cache_store: Dict[str, Any] = {}
    if os.path.exists(output_cache):
        try:
            with open(output_cache, "r", encoding="utf-8") as f:
                cache_store = json.load(f)
        except Exception:
            cache_store = {}

    if "frames" not in cache_store:
        cache_store["frames"] = {}

    zone_frames_map = cache_store["frames"].setdefault(zone_id, {})

    processed_count = 0
    saturated_count = 0
    detection_count = 0
    all_densities = []

    frame_idx = 0
    start_time = time.monotonic()

    zone_polygon = config.ZONE_POLYGONS.get(zone_id) if hasattr(config, "ZONE_POLYGONS") else None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % step_frames == 0:
            count, boxes, latency_ms = detector.detect(frame)

            # Check saturation
            sat_result = saturation_detector.check_saturation(
                frame,
                detected_count=count,
                area_sqm=area_sqm,
                camera_type=camera_type,
                boxes=boxes,
                zone_polygon=zone_polygon,
                zone_id=zone_id,
            )

            is_saturated = sat_result["is_saturated"]
            edge_ratio = sat_result["edge_density_ratio"]

            if is_saturated:
                override_density, override_count = override_engine.get_override(edge_ratio, area_sqm)
                density = override_density
                people_count = override_count
                density_source = "override_cached"
                saturated_count += 1
            else:
                density = sat_result["detected_density"]
                people_count = count
                density_source = "detection"
                detection_count += 1

            all_densities.append(density)

            # Store cache record for this frame
            zone_frames_map[str(frame_idx)] = {
                "frame": frame_idx,
                "people_count": people_count,
                "density": density,
                "density_source": density_source,
                "saturated": is_saturated,
                "raw_detection_count": count,
                "edge_density_ratio": edge_ratio,
            }

            processed_count += 1

            print(
                f"  Frame {frame_idx:4d}/{total_video_frames} | "
                f"Count={people_count:3d} (Raw={count:3d}) | "
                f"Density={density:4.2f} p/m2 | "
                f"Source={density_source:<15} | "
                f"Edge={edge_ratio:.4f}",
                flush=True,
            )

        frame_idx += 1
        if max_frames and processed_count >= max_frames:
            break

    cap.release()
    elapsed = time.monotonic() - start_time

    # Update metadata
    cache_store["metadata"] = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime()),
        "source_video": os.path.basename(video_path),
        "zone_id": zone_id,
        "camera_type": camera_type,
        "area_sqm": area_sqm,
        "total_cached_frames": len(zone_frames_map),
        "saturation_threshold": saturation_detector.saturation_edge_threshold,
        "min_detection_density": saturation_detector.min_detection_density,
    }

    with open(output_cache, "w", encoding="utf-8") as f:
        json.dump(cache_store, f, indent=2)

    # Sanity-check summary reporting
    sat_pct = (saturated_count / processed_count * 100.0) if processed_count > 0 else 0.0
    det_pct = (detection_count / processed_count * 100.0) if processed_count > 0 else 0.0
    min_den = min(all_densities) if all_densities else 0.0
    max_den = max(all_densities) if all_densities else 0.0
    avg_den = (sum(all_densities) / len(all_densities)) if all_densities else 0.0

    print("\n" + "=" * 75)
    print(f"[PRECOMPUTE SUMMARY] Offline Batch Completed in {elapsed:.1f}s")
    print(f"                     Output File: {os.path.abspath(output_cache)}")
    print("-" * 75)
    print(f"  Zone ID                : {zone_id}")
    print(f"  Total Processed Frames : {processed_count}")
    print(f"  Saturated Frames       : {saturated_count} / {processed_count} ({sat_pct:.1f}%)")
    print(f"  Normal Detection Frames: {detection_count} / {processed_count} ({det_pct:.1f}%)")
    print(f"  Density Range          : Min = {min_den:.2f} p/m2 | Max = {max_den:.2f} p/m2 | Avg = {avg_den:.2f} p/m2")
    print("=" * 75 + "\n")

    return cache_store


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute and Cache Zone Density Overrides for Demo Video")
    parser.add_argument("--video", type=str, default="videos/crowd_5.mp4", help="Path to demo drone video")
    parser.add_argument("--zone", type=str, default="zone_1", help="Zone ID to cache")
    parser.add_argument("--type", type=str, default="drone", choices=["drone", "cctv"], help="Camera type")
    parser.add_argument("--area", type=float, default=250.0, help="Zone physical area in m2")
    parser.add_argument("--out", type=str, default="zone_density_cache.json", help="Output cache JSON")
    parser.add_argument("--step", type=int, default=1, help="Frame step interval (default 1 = every frame)")
    parser.add_argument("--max-frames", type=int, default=None, help="Max frames to process")
    args = parser.parse_args()

    precompute_video_cache(
        video_path=args.video,
        zone_id=args.zone,
        camera_type=args.type,
        area_sqm=args.area,
        output_cache=args.out,
        step_frames=args.step,
        max_frames=args.max_frames,
    )


if __name__ == "__main__":
    main()
