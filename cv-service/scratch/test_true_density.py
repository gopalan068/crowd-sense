import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from saturation_detector import SaturationDetector

def test_true_density():
    frame = cv2.imread("videos/frame.png")
    h, w = frame.shape[:2]
    area_sqm = 1000.0 # Active gathering area

    sat_detector = SaturationDetector(grid_cols=20, grid_rows=20)
    edges = sat_detector.compute_edge_map(frame)
    texture_energy = sat_detector.compute_crowd_texture_energy(frame)

    cell_w = w // 20
    cell_h = h // 20

    print("--- 20x20 Grid Patch Analysis ---")
    total_est_people = 0
    total_active_cells = 0

    for r in range(20):
        for c in range(20):
            x1, y1 = c * cell_w, r * cell_h
            x2, y2 = (c + 1) * cell_w, (r + 1) * cell_h

            cell_patch = frame[y1:y2, x1:x2]
            cell_tex = np.mean(texture_energy[y1:y2, x1:x2])
            cell_edges = np.count_nonzero(edges[y1:y2, x1:x2]) / float(cell_w * cell_h)

            # Estimate true density based on texture energy
            # In crowd areas, texture energy 0.3 -> ~1.5 p/m2, 0.8 -> ~3.5 p/m2, 1.5+ -> ~5.5 p/m2
            if cell_tex > 0.15:
                # Cell area in m2
                cell_area = area_sqm / 400.0 # 2.5 m2 per cell
                cell_density = np.clip(cell_tex * 3.8, 0.5, 6.0)
                cell_cnt = int(round(cell_density * cell_area))
                total_est_people += cell_cnt
                total_active_cells += 1

    print(f"Total active crowd cells: {total_active_cells} / 400")
    print(f"Total estimated people across crowd area: {total_est_people} people")

if __name__ == "__main__":
    test_true_density()
