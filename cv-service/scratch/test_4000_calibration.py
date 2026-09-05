import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def test_4000_calibration():
    frame = cv2.imread("videos/frame.png")
    h, w = frame.shape[:2]
    
    # Ground Area: 1000 m2 gathering zone (or 2000 m2 total scene)
    area_sqm = 1000.0

    detector = PersonDetector("yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)
    print(f"Raw YOLO detections: {raw_count}")

    sat_detector = SaturationDetector(grid_cols=20, grid_rows=20)
    texture_energy = sat_detector.compute_crowd_texture_energy(frame)
    
    # 20x20 grid
    cols, rows = 20, 20
    cell_w = w // cols
    cell_h = h // rows
    cell_area = area_sqm / float(cols * rows) # 2.5 m2 per cell

    total_people = 0
    dense_patches = 0

    for r in range(rows):
        for c in range(cols):
            x1, y1 = c * cell_w, r * cell_h
            x2, y2 = (c + 1) * cell_w, (r + 1) * cell_h

            # Count YOLO boxes with center in cell
            cell_boxes = [b for b in boxes if x1 <= (b[0]+b[2])/2 < x2 and y1 <= (b[1]+b[3])/2 < y2]
            det_cnt = len(cell_boxes)
            det_den = det_cnt / cell_area

            # Extract texture energy in cell
            cell_tex = float(np.mean(texture_energy[y1:y2, x1:x2]))

            # Calibrate texture energy to crowd crush density
            # Background/roofs: tex < 0.20 -> den ~ 0
            # Sparse crowd: tex 0.25 - 0.40 -> den 1.0 - 2.0 p/m2
            # Packed street: tex 0.50 - 1.20 -> den 3.5 - 5.5 p/m2
            if cell_tex > 0.20:
                tex_den = np.clip((cell_tex - 0.20) / 0.85, 0.0, 1.0) * 5.5
            else:
                tex_den = 0.0

            # Hybrid fusion: take max of detection or texture proxy
            effective_cell_den = max(det_den, tex_den)
            effective_cell_cnt = int(round(effective_cell_den * cell_area))

            total_people += effective_cell_cnt
            if tex_den > 3.0:
                dense_patches += 1

    effective_density = total_people / area_sqm
    print(f"\n--- 4000+ Crowd Ground-Truth Calibration ---")
    print(f"Total Physical Area       : {area_sqm} m2")
    print(f"Raw YOLO Detections       : {raw_count} people (Detection Recall: {raw_count/total_people*100:.1f}%)")
    print(f"Total Estimated Headcount : {total_people} people")
    print(f"Overall Ground Density    : {effective_density:.2f} people / m2")
    print(f"Dense Crush Patches (>3.0): {dense_patches} patches")

if __name__ == "__main__":
    test_4000_calibration()
