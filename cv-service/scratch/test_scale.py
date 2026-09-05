import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def test_scale():
    frame = cv2.imread("videos/frame.png")
    h, w = frame.shape[:2]
    
    # 2560x1440 image
    # Chariot base is ~140px ≈ 4.5m wide -> ~31 px/m -> 2560x1440 ≈ 82m x 46m ≈ 3800 m2 total footprint
    # Active street/gathering space ≈ 30% of total footprint ≈ 1000 - 1200 m2
    area_sqm = 1000.0

    detector = PersonDetector("yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)

    sat_detector = SaturationDetector(grid_cols=16, grid_rows=16)
    override_engine = DensityOverrideEngine()

    grid_result = sat_detector.analyze_spatial_grid(
        frame,
        boxes=boxes,
        area_sqm=area_sqm,
        override_engine=override_engine,
        zone_polygon=config.ZONE_POLYGONS.get("zone_1", None),
        zone_id="zone_1",
    )

    print(f"Area: {area_sqm} m2")
    print(f"Raw YOLO detections: {raw_count}")
    print(f"Effective Headcount: {grid_result['effective_count']} people")
    print(f"Effective Density: {grid_result['effective_density']} people/m2")
    print(f"Saturated Patches: {len(grid_result['saturated_cells'])}")
    print(f"Saturated Area Ratio: {grid_result['saturated_area_ratio'] * 100:.1f}%")

if __name__ == "__main__":
    test_scale()
