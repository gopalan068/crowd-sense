import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def test():
    img_path = "videos/frame.png"
    frame = cv2.imread(img_path)
    if frame is None:
        print("Error: frame not found")
        return

    h, w = frame.shape[:2]
    print(f"Loaded frame {w}x{h}")

    detector = PersonDetector(model_path="yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)
    print(f"Detections: {len(boxes)}")

    sat_detector = SaturationDetector(grid_cols=16, grid_rows=16)
    override_engine = DensityOverrideEngine()

    grid_result = sat_detector.analyze_spatial_grid(
        frame,
        boxes=boxes,
        area_sqm=250.0,
        override_engine=override_engine,
        zone_polygon=config.ZONE_POLYGONS.get("zone_1", None),
        zone_id="zone_1",
    )

    saturated_cells = grid_result["saturated_cells"]
    print(f"Saturated cells: {len(saturated_cells)}, effective_count: {grid_result['effective_count']}")

    # Build continuous heatmap
    density_map = np.zeros((h, w), dtype=np.float32)

    # 1. Splat Gaussians for detected boxes
    for b in boxes:
        cx = int((b[0] + b[2]) / 2)
        cy = int((b[1] + b[3]) / 2)
        bw = max(10, b[2] - b[0])
        bh = max(10, b[3] - b[1])
        radius = int(max(bw, bh) * 1.8)
        radius = max(16, min(radius, 40))

        y1 = max(0, cy - radius)
        y2 = min(h, cy + radius + 1)
        x1 = max(0, cx - radius)
        x2 = min(w, cx + radius + 1)

        gy, gx = np.ogrid[y1 - cy : y2 - cy, x1 - cx : x2 - cx]
        g = np.exp(-(gx**2 + gy**2) / (2.0 * (radius / 2.2)**2))
        density_map[y1:y2, x1:x2] += g.astype(np.float32) * 1.5

    # 2. Add energy from saturated cells
    # We compute texture energy specifically in the saturated cells
    edges = sat_detector.compute_edge_map(frame)
    mask = sat_detector.get_zone_mask((h, w), config.ZONE_POLYGONS.get("zone_1", None), zone_id="zone_1")
    
    sat_mask = np.zeros((h, w), dtype=np.float32)
    for cell in saturated_cells:
        x1, y1, x2, y2 = cell["box"]
        den = cell.get("density", 3.5)
        # Weight by local edge intensity inside the cell
        cell_edge = edges[y1:y2, x1:x2].astype(np.float32) / 255.0
        # Smooth the cell edges
        cell_smooth = cv2.GaussianBlur(cell_edge, (31, 31), 8.0)
        # Normalize cell smooth
        max_v = np.max(cell_smooth)
        if max_v > 0.05:
            cell_smooth = cell_smooth / max_v
        sat_mask[y1:y2, x1:x2] = np.maximum(sat_mask[y1:y2, x1:x2], cell_smooth * den)

    # Apply wide Gaussian smoothing to the saturated mask so there are zero hard edges
    sat_mask_smooth = cv2.GaussianBlur(sat_mask, (65, 65), 22.0)
    density_map += sat_mask_smooth

    # Apply global smoothing to create seamless fluid heat distribution
    density_map = cv2.GaussianBlur(density_map, (35, 35), 10.0)

    # Colormap & Alpha blend
    max_scale = 5.5
    norm_density = np.clip(density_map / max_scale, 0.0, 1.0)
    heat_u8 = (norm_density * 255).astype(np.uint8)
    colored_heat = cv2.applyColorMap(heat_u8, cv2.COLORMAP_JET)

    # Alpha blending: 0 alpha on empty, smoothly rising to 0.55 on dense crowd
    alpha = np.clip((norm_density - 0.08) / 0.55, 0.0, 1.0)
    alpha = np.power(alpha, 0.85) * 0.58
    alpha_3d = alpha[:, :, np.newaxis]

    blended = (frame.astype(np.float32) * (1.0 - alpha_3d) + colored_heat.astype(np.float32) * alpha_3d).astype(np.uint8)

    # Draw pinpoint glow dots on detected heads
    for b in boxes:
        cx = int((b[0] + b[2]) / 2)
        cy = int((b[1] + b[3]) / 2)
        cv2.circle(blended, (cx, cy), 3, (56, 189, 248), -1, cv2.LINE_AA)
        cv2.circle(blended, (cx, cy), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # Glassmorphic Legend HUD
    lx1, ly1 = w - 280, h - 70
    lx2, ly2 = w - 20, h - 20
    sub_hud = blended[ly1:ly2, lx1:lx2]
    dark_rect = np.zeros_like(sub_hud, dtype=np.uint8)
    dark_rect[:] = (15, 23, 42)
    cv2.addWeighted(dark_rect, 0.80, sub_hud, 0.20, 0, sub_hud)
    cv2.rectangle(blended, (lx1, ly1), (lx2, ly2), (148, 163, 184), 1, cv2.LINE_AA)

    bar_x1, bar_y1 = lx1 + 12, ly1 + 12
    bar_w, bar_h = 236, 12
    grad_strip = np.linspace(0, 255, bar_w, dtype=np.uint8).reshape(1, bar_w)
    grad_img = np.repeat(grad_strip, bar_h, axis=0)
    grad_color = cv2.applyColorMap(grad_img, cv2.COLORMAP_JET)
    blended[bar_y1 : bar_y1 + bar_h, bar_x1 : bar_x1 + bar_w] = grad_color
    cv2.rectangle(blended, (bar_x1, bar_y1), (bar_x1 + bar_w, bar_y1 + bar_h), (255, 255, 255), 1)

    cv2.putText(blended, "0 p/m2", (bar_x1, ly1 + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (203, 213, 225), 1, cv2.LINE_AA)
    cv2.putText(blended, "2.0 (ALERT)", (bar_x1 + 75, ly1 + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (251, 191, 36), 1, cv2.LINE_AA)
    cv2.putText(blended, "4.5+ (CRUSH)", (bar_x1 + 165, ly1 + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (239, 68, 68), 1, cv2.LINE_AA)

    # Save output
    cv2.imwrite("test_drone_dense_output.jpg", blended)
    print("Saved test_drone_dense_output.jpg")

if __name__ == "__main__":
    test()
