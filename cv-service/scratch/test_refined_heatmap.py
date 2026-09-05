import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def build_crowd_heatmap(
    frame: np.ndarray,
    boxes: list,
    saturated_cells: list = None,
    max_density_scale: float = 5.5,
    show_hud_legend: bool = True,
    show_pinpoint_dots: bool = True,
) -> np.ndarray:
    """
    Renders a stunning, fluid aerial crowd density heatmap overlaid on the drone footage.
    """
    h, w = frame.shape[:2]
    density_map = np.zeros((h, w), dtype=np.float32)

    # 1. Superposition of 2D Gaussian kernels for all detected people
    # In aerial crowd counting, each person adds a normalized Gaussian bell curve.
    if boxes:
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            bw = max(10, b[2] - b[0])
            bh = max(10, b[3] - b[1])
            radius = int(max(bw, bh) * 2.2)
            radius = max(20, min(radius, 50))
            sigma = radius / 2.0

            y1 = max(0, cy - radius)
            y2 = min(h, cy + radius + 1)
            x1 = max(0, cx - radius)
            x2 = min(w, cx + radius + 1)

            gy, gx = np.ogrid[y1 - cy : y2 - cy, x1 - cx : x2 - cx]
            kernel = np.exp(-(gx**2 + gy**2) / (2.0 * sigma**2))
            # Normalize and scale
            density_map[y1:y2, x1:x2] += (kernel * 1.8).astype(np.float32)

    # 2. Saturated Crush Energy Injection
    # For cells identified as saturated crowd crush, generate distributed crowd energy
    if saturated_cells:
        edges = cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (5, 5), 0), 50, 150)
        for cell in saturated_cells:
            x1, y1, x2, y2 = cell["box"]
            den = float(cell.get("density", 4.0))
            raw_cnt = cell.get("raw_count", 0)
            target_cnt = cell.get("count", int(den * 15))

            # If detections were deficient in this saturated cell, inject smooth texture energy
            if target_cnt > raw_cnt:
                cell_edge = edges[y1:y2, x1:x2].astype(np.float32) / 255.0
                cell_smooth = cv2.GaussianBlur(cell_edge, (25, 25), 6.0)
                if np.max(cell_smooth) > 0.05:
                    cell_smooth = cell_smooth / (np.max(cell_smooth) + 1e-5)
                
                # Scale by calibrated density factor
                energy = cell_smooth * (den * 0.85)
                density_map[y1:y2, x1:x2] = np.maximum(density_map[y1:y2, x1:x2], energy)

    # 3. Fluid Gaussian Diffusion / Multi-Scale Smoothing
    # This turns discrete clusters into a continuous, natural thermal topology
    smooth_density = cv2.GaussianBlur(density_map, (41, 41), 12.0)
    smooth_density_wide = cv2.GaussianBlur(density_map, (81, 81), 24.0)
    continuous_density = 0.70 * smooth_density + 0.30 * smooth_density_wide

    # 4. Colormapping (Scientific JET colormap: Deep Blue -> Cyan -> Emerald Green -> Amber Yellow -> Crimson Red)
    norm_vis = np.clip(continuous_density / max_density_scale, 0.0, 1.0)
    heat_u8 = (norm_vis * 255).astype(np.uint8)
    colored_heat = cv2.applyColorMap(heat_u8, cv2.COLORMAP_JET)

    # 5. Density-Aware Dynamic Alpha Blending
    # Low density / background = completely transparent (alpha = 0)
    # Moderate density = subtle translucent veil (~0.35)
    # High density / crush = glowing vibrant overlay (~0.58)
    alpha = np.clip((norm_vis - 0.06) / 0.60, 0.0, 1.0)
    alpha = np.power(alpha, 0.90) * 0.60
    alpha_3d = alpha[:, :, np.newaxis]

    # Seamless alpha composite over original frame
    blended = (frame.astype(np.float32) * (1.0 - alpha_3d) + colored_heat.astype(np.float32) * alpha_3d).astype(np.uint8)

    # 6. Sleek Pinpoint Detection Markers
    if show_pinpoint_dots and boxes:
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            # Glowing double-ring dot
            cv2.circle(blended, (cx, cy), 3, (56, 189, 248), -1, cv2.LINE_AA)
            cv2.circle(blended, (cx, cy), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # 7. Modern Glassmorphism HUD Legend
    if show_hud_legend and w >= 640 and h >= 400:
        legend_w, legend_h = 290, 60
        lx1 = w - legend_w - 24
        ly1 = h - legend_h - 24
        lx2 = lx1 + legend_w
        ly2 = ly1 + legend_h

        # Translucent dark glass panel
        sub_hud = blended[ly1:ly2, lx1:lx2]
        dark_glass = np.zeros_like(sub_hud, dtype=np.uint8)
        dark_glass[:] = (15, 23, 42)
        cv2.addWeighted(dark_glass, 0.82, sub_hud, 0.18, 0, sub_hud)
        cv2.rectangle(blended, (lx1, ly1), (lx2, ly2), (100, 116, 139), 1, cv2.LINE_AA)

        # Gradient color bar
        bar_x1, bar_y1 = lx1 + 14, ly1 + 12
        bar_w, bar_h = 262, 12
        grad_strip = np.linspace(0, 255, bar_w, dtype=np.uint8).reshape(1, bar_w)
        grad_img = np.repeat(grad_strip, bar_h, axis=0)
        grad_color = cv2.applyColorMap(grad_img, cv2.COLORMAP_JET)
        blended[bar_y1 : bar_y1 + bar_h, bar_x1 : bar_x1 + bar_w] = grad_color
        cv2.rectangle(blended, (bar_x1, bar_y1), (bar_x1 + bar_w, bar_y1 + bar_h), (255, 255, 255), 1)

        # Scale tick labels
        cv2.putText(blended, "0.0 p/m2", (bar_x1, ly1 + 42), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (203, 213, 225), 1, cv2.LINE_AA)
        cv2.putText(blended, "2.0 (ALERT)", (bar_x1 + 80, ly1 + 42), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (251, 191, 36), 1, cv2.LINE_AA)
        cv2.putText(blended, "4.5+ (CRUSH)", (bar_x1 + 182, ly1 + 42), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (239, 68, 68), 1, cv2.LINE_AA)

    return blended

def test():
    frame = cv2.imread("videos/frame.png")
    detector = PersonDetector(model_path="yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)
    print(f"Detected boxes: {len(boxes)}")

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

    heatmap_result = build_crowd_heatmap(frame, boxes, saturated_cells)
    cv2.imwrite("test_drone_dense_output.jpg", heatmap_result)
    print("Saved refined test_drone_dense_output.jpg")

if __name__ == "__main__":
    test()
