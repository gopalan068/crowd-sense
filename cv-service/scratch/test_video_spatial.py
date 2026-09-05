import os
import sys
import json
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def test_video_spatial_cache():
    video_path = "videos/crowd_5.mp4"
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    area_sqm = 250.0

    detector = PersonDetector("yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    sat_detector = SaturationDetector(grid_cols=16, grid_rows=16)
    override_engine = DensityOverrideEngine()

    print(f"Processing {video_path} (Total {total_frames} frames)...")
    results = []

    # Process every 5th frame for fast verification
    for f_idx in range(0, total_frames, 5):
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
        ret, frame = cap.read()
        if not ret:
            break

        count, boxes, latency_ms = detector.detect(frame)
        grid_result = sat_detector.analyze_spatial_grid(
            frame,
            boxes=boxes,
            area_sqm=area_sqm,
            override_engine=override_engine,
            zone_polygon=config.ZONE_POLYGONS.get("zone_1", None),
            zone_id="zone_1",
        )

        eff_count = grid_result["effective_count"]
        eff_den = grid_result["effective_density"]
        is_sat = grid_result["is_saturated"]
        sat_patches = len(grid_result["saturated_cells"])

        results.append({
            "frame": f_idx,
            "raw_count": count,
            "effective_count": eff_count,
            "effective_density": eff_den,
            "is_saturated": is_sat,
            "saturated_patches": sat_patches,
        })

        print(f"Frame {f_idx:3d} | Raw YOLO: {count:3d} | Eff Count: {eff_count:4d} | Density: {eff_den:.2f} p/m2 | Sat: {is_sat} ({sat_patches} patches)")

    cap.release()
    densities = [r["effective_density"] for r in results]
    counts = [r["effective_count"] for r in results]
    print("\n--- Summary ---")
    print(f"Headcount Range: {min(counts)} - {max(counts)} (Avg: {np.mean(counts):.1f})")
    print(f"Density Range: {min(densities):.2f} - {max(densities):.2f} p/m2 (Avg: {np.mean(densities):.2f} p/m2)")

if __name__ == "__main__":
    test_video_spatial_cache()
