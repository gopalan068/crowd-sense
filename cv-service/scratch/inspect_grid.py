import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def inspect_grid():
    frame = cv2.imread("videos/frame.png")
    h, w = frame.shape[:2]
    detector = PersonDetector(model_path="yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)
    print(f"Total raw boxes: {len(boxes)}")

    sat_detector = SaturationDetector(grid_cols=16, grid_rows=16)
    override_engine = DensityOverrideEngine()

    grid_cols = 16
    grid_rows = 16
    cell_w = w // grid_cols
    cell_h = h // grid_rows

    edges = sat_detector.compute_edge_map(frame)
    mask = sat_detector.get_zone_mask((h, w), config.ZONE_POLYGONS.get("zone_1", None), zone_id="zone_1")
    total_zone_pixels = int(np.count_nonzero(mask))
    area_sqm = 250.0

    print("\n--- Cell Grid Analysis (Left corridor is around col 3..6, row 3..14) ---")
    for r in range(grid_rows):
        row_str = []
        for c in range(grid_cols):
            x1 = c * cell_w
            y1 = r * cell_h
            x2 = (c + 1) * cell_w
            y2 = (r + 1) * cell_h

            cell_mask = mask[y1:y2, x1:x2]
            cell_mask_px = int(np.count_nonzero(cell_mask))
            if cell_mask_px == 0:
                row_str.append(" .  ")
                continue

            cell_fraction = cell_mask_px / float(total_zone_pixels)
            cell_area = max(0.1, area_sqm * cell_fraction)

            # count boxes in cell
            cnt = sum(1 for b in boxes if x1 <= (b[0]+b[2])/2 < x2 and y1 <= (b[1]+b[3])/2 < y2)
            den = cnt / cell_area

            cell_edges = edges[y1:y2, x1:x2]
            edge_px = int(np.count_nonzero(cell_edges))
            edge_ratio = edge_px / float(cell_mask_px)

            is_sat = (den < sat_detector.min_detection_density and edge_ratio >= sat_detector.saturation_edge_threshold)
            if is_sat:
                row_str.append(f"S{edge_ratio:.2f}")
            else:
                row_str.append(f"D{cnt:02d}")
        print(f"Row {r:02d}: " + " | ".join(row_str))

if __name__ == "__main__":
    inspect_grid()
