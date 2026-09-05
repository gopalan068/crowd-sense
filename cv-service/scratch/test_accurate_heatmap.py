import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def is_crowd_texture(patch: np.ndarray) -> bool:
    """
    Differentiates isotropic crowd texture from directional roof/building lines.
    Crowds have omnidirectional gradient orientation and color entropy.
    Roofs have strong directional dominance (e.g. horizontal/vertical ridges).
    """
    if patch.shape[0] < 8 or patch.shape[1] < 8:
        return False
    gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY) if len(patch.shape) == 3 else patch
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    
    mag = np.sqrt(gx**2 + gy**2)
    if np.mean(mag) < 15.0:
        return False # Flat surface (concrete roof)
    
    # Calculate directional coherence
    angles = np.arctan2(gy, gx)
    # Histogram of gradient angles across 8 bins
    hist, _ = np.histogram(angles, bins=8, range=(-np.pi, np.pi), weights=mag)
    hist_norm = hist / (np.sum(hist) + 1e-6)
    
    # Entropy of angle distribution: high entropy = isotropic (crowd), low entropy = directional lines (roof)
    entropy = -np.sum(hist_norm * np.log(hist_norm + 1e-6))
    
    # Check color saturation / variance (monochromatic roofs vs multicolored people)
    if len(patch.shape) == 3:
        hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
        sat_mean = np.mean(hsv[:, :, 1])
    else:
        sat_mean = 30.0

    return entropy > 1.70 or sat_mean > 35.0

def build_accurate_crowd_heatmap(
    frame: np.ndarray,
    boxes: list,
    saturated_cells: list,
    area_sqm: float = 250.0,
    max_density_scale: float = 5.5,
    show_hud_legend: bool = True,
    show_pinpoint_dots: bool = True,
) -> np.ndarray:
    h, w = frame.shape[:2]
    density_map = np.zeros((h, w), dtype=np.float32)

    # Conversion factor from pixels to real-world area
    total_px = h * w
    px_per_sqm = total_px / float(area_sqm) # pixels per m2

    # 1. Splat calibrated Gaussian kernels for individual detections
    if boxes:
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            # Physical footprint of 1 person ~ 0.35 m2
            person_footprint_px = 0.35 * px_per_sqm
            sigma = max(14.0, np.sqrt(person_footprint_px / (2 * np.pi)))
            radius = int(3.0 * sigma)
            radius = max(20, min(radius, 60))

            y1 = max(0, cy - radius)
            y2 = min(h, cy + radius + 1)
            x1 = max(0, cx - radius)
            x2 = min(w, cx + radius + 1)

            gy, gx = np.ogrid[y1 - cy : y2 - cy, x1 - cx : x2 - cx]
            # Gaussian representing 1 person integrated over space in p/m2
            kernel = (1.0 / (2 * np.pi * (sigma**2 / px_per_sqm))) * np.exp(-(gx**2 + gy**2) / (2.0 * sigma**2))
            density_map[y1:y2, x1:x2] += kernel.astype(np.float32)

    # 2. Inject calibrated density field for saturated crush cells
    if saturated_cells:
        edges = cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (5, 5), 0), 50, 150)
        for cell in saturated_cells:
            x1, y1, x2, y2 = cell["box"]
            patch = frame[y1:y2, x1:x2]
            
            # Verify crowd texture to exclude non-crowd roof reflections
            if not is_crowd_texture(patch):
                continue

            den = float(cell.get("density", 4.5))
            raw_cnt = cell.get("raw_count", 0)
            cell_area = ((x2 - x1) * (y2 - y1)) / px_per_sqm
            expected_cnt = int(den * cell_area)

            # If YOLO severely undercounted, inject texture-modulated density
            if expected_cnt > raw_cnt * 1.5:
                cell_edge = edges[y1:y2, x1:x2].astype(np.float32) / 255.0
                cell_smooth = cv2.GaussianBlur(cell_edge, (31, 31), 8.0)
                if np.max(cell_smooth) > 0.05:
                    cell_smooth = cell_smooth / (np.max(cell_smooth) + 1e-5)
                else:
                    cell_smooth[:] = 1.0

                # Inject density calibrated to crush level (e.g. 4.2 - 5.5 p/m2)
                cell_den_field = (0.35 + 0.65 * cell_smooth) * den
                density_map[y1:y2, x1:x2] = np.maximum(density_map[y1:y2, x1:x2], cell_den_field)

    # 3. Multi-scale continuous thermal smoothing
    # Eliminates any grid artifacts while preserving sharp crowd boundaries
    smooth_density = cv2.GaussianBlur(density_map, (35, 35), 10.0)
    smooth_density_wide = cv2.GaussianBlur(density_map, (71, 71), 20.0)
    continuous_density = 0.75 * smooth_density + 0.25 * smooth_density_wide

    # 4. Scientific Colormapping (JET)
    norm_vis = np.clip(continuous_density / max_density_scale, 0.0, 1.0)
    heat_u8 = (norm_vis * 255).astype(np.uint8)
    colored_heat = cv2.applyColorMap(heat_u8, cv2.COLORMAP_JET)

    # 5. Non-linear Alpha Transparency Blending
    # Low density / background (<0.3 p/m2) = 0.0 opacity (clear underlying image)
    # High density (>4.0 p/m2) = 0.56 opacity (vibrant glowing thermal overlay)
    alpha = np.clip((norm_vis - 0.05) / 0.65, 0.0, 1.0)
    alpha = np.power(alpha, 0.88) * 0.58
    alpha_3d = alpha[:, :, np.newaxis]

    # Composite heatmap onto frame
    blended = (frame.astype(np.float32) * (1.0 - alpha_3d) + colored_heat.astype(np.float32) * alpha_3d).astype(np.uint8)

    # 6. Sleek Pinpoint Detection Markers
    if show_pinpoint_dots and boxes:
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            cv2.circle(blended, (cx, cy), 3, (56, 189, 248), -1, cv2.LINE_AA)
            cv2.circle(blended, (cx, cy), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # 7. Modern Glassmorphic HUD Legend
    if show_hud_legend and w >= 640 and h >= 400:
        legend_w, legend_h = 300, 62
        lx1 = w - legend_w - 24
        ly1 = h - legend_h - 24
        lx2 = lx1 + legend_w
        ly2 = ly1 + legend_h

        # Translucent glass panel
        sub_hud = blended[ly1:ly2, lx1:lx2]
        dark_glass = np.zeros_like(sub_hud, dtype=np.uint8)
        dark_glass[:] = (15, 23, 42)
        cv2.addWeighted(dark_glass, 0.82, sub_hud, 0.18, 0, sub_hud)
        cv2.rectangle(blended, (lx1, ly1), (lx2, ly2), (100, 116, 139), 1, cv2.LINE_AA)

        # Gradient color bar
        bar_x1, bar_y1 = lx1 + 14, ly1 + 12
        bar_w, bar_h = 272, 12
        grad_strip = np.linspace(0, 255, bar_w, dtype=np.uint8).reshape(1, bar_w)
        grad_img = np.repeat(grad_strip, bar_h, axis=0)
        grad_color = cv2.applyColorMap(grad_img, cv2.COLORMAP_JET)
        blended[bar_y1 : bar_y1 + bar_h, bar_x1 : bar_x1 + bar_w] = grad_color
        cv2.rectangle(blended, (bar_x1, bar_y1), (bar_x1 + bar_w, bar_y1 + bar_h), (255, 255, 255), 1)

        # Ticks and Labels
        cv2.putText(blended, "0.0 p/m2", (bar_x1, ly1 + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (203, 213, 225), 1, cv2.LINE_AA)
        cv2.putText(blended, "2.1 (ALERT)", (bar_x1 + 84, ly1 + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (251, 191, 36), 1, cv2.LINE_AA)
        cv2.putText(blended, "4.5+ (CRUSH)", (bar_x1 + 190, ly1 + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (239, 68, 68), 1, cv2.LINE_AA)

    return blended

def test():
    frame = cv2.imread("videos/frame.png")
    detector = PersonDetector(model_path="yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)
    print(f"Raw detection count: {len(boxes)}")

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

    heatmap_result = build_accurate_crowd_heatmap(frame, boxes, saturated_cells, area_sqm=250.0)
    cv2.imwrite("test_drone_dense_output.jpg", heatmap_result)
    print("Saved accurate test_drone_dense_output.jpg")

if __name__ == "__main__":
    test()
