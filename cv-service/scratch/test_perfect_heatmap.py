import os
import sys
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")
from detector import PersonDetector
from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
import config

def compute_crowd_texture_energy(frame: np.ndarray, zone_mask: np.ndarray) -> np.ndarray:
    """
    Extracts omnidirectional crowd texture energy.
    """
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    lap = cv2.Laplacian(blurred, cv2.CV_32F, ksize=3)
    abs_lap = np.abs(lap)

    blur_sq = cv2.GaussianBlur(gray.astype(np.float32)**2, (21, 21), 0)
    sq_blur = cv2.GaussianBlur(gray.astype(np.float32), (21, 21), 0)**2
    local_std = np.sqrt(np.maximum(0, blur_sq - sq_blur))

    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(gx**2 + gy**2)

    dir_ratio = np.abs(gx) / (np.abs(gx) + np.abs(gy) + 1e-5)
    directional_penalty = np.clip(1.0 - 1.8 * np.abs(dir_ratio - 0.5), 0.2, 1.0)

    norm_lap = np.clip(abs_lap / 40.0, 0.0, 2.0)
    norm_std = np.clip((local_std - 12.0) / 22.0, 0.0, 1.5)
    norm_grad = np.clip(grad_mag / 65.0, 0.0, 2.0)

    combined = (0.45 * norm_lap + 0.35 * norm_std + 0.20 * norm_grad) * directional_penalty

    if zone_mask is not None:
        combined = combined * (zone_mask.astype(np.float32) / 255.0)

    texture_field = cv2.GaussianBlur(combined, (21, 21), 6.0)
    return np.clip(texture_field, 0.0, 3.0)

def render_drone_heatmap_overlay(
    frame: np.ndarray,
    boxes: list,
    saturated_cells: list = None,
    area_sqm: float = 250.0,
    effective_count: int = 0,
    effective_density: float = 0.0,
    density_source: str = "override_live",
    is_saturated: bool = True,
    latency_ms: float = 0.0,
    max_density_scale: float = 5.5,
) -> np.ndarray:
    """
    Renders a continuous aerial crowd density heatmap overlaid on the drone footage.
    """
    h, w = frame.shape[:2]
    density_map = np.zeros((h, w), dtype=np.float32)
    px_per_sqm = (h * w) / float(area_sqm)

    # 1. 2D Gaussian Splatting for Detected Individuals
    if boxes:
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            bw = max(10, b[2] - b[0])
            bh = max(10, b[3] - b[1])
            sigma = max(16.0, float(max(bw, bh)) * 0.9)
            radius = int(2.8 * sigma)
            radius = max(24, min(radius, 64))

            y1 = max(0, cy - radius)
            y2 = min(h, cy + radius + 1)
            x1 = max(0, cx - radius)
            x2 = min(w, cx + radius + 1)

            gy, gx = np.ogrid[y1 - cy : y2 - cy, x1 - cx : x2 - cx]
            kernel = (1.0 / (2 * np.pi * (sigma**2 / px_per_sqm))) * np.exp(-(gx**2 + gy**2) / (2.0 * sigma**2))
            density_map[y1:y2, x1:x2] += kernel.astype(np.float32)

    # 2. Crowd Texture Energy
    zone_mask = np.full((h, w), 255, dtype=np.uint8)
    texture_field = compute_crowd_texture_energy(frame, zone_mask)
    texture_density = np.power(np.clip(texture_field - 0.20, 0.0, 2.0) / 1.05, 1.15) * 3.8
    density_map += texture_density

    # 3. Direct Saturated Cell Crush Injection (fills crush corridors where YOLO collapsed)
    if saturated_cells:
        sat_plane = np.zeros((h, w), dtype=np.float32)
        for cell in saturated_cells:
            x1, y1, x2, y2 = cell["box"]
            den = float(cell.get("density", 4.2))
            # Inject density into saturated cell
            sat_plane[y1:y2, x1:x2] = np.maximum(sat_plane[y1:y2, x1:x2], den * 0.85)

        # Blur saturated plane so boundaries dissolve seamlessly
        sat_plane_smooth = cv2.GaussianBlur(sat_plane, (55, 55), 18.0)
        density_map = np.maximum(density_map, sat_plane_smooth)

    # 4. Continuous Multi-Scale Thermal Diffusion
    smooth_fine = cv2.GaussianBlur(density_map, (31, 31), 8.0)
    smooth_med = cv2.GaussianBlur(density_map, (61, 61), 18.0)
    smooth_broad = cv2.GaussianBlur(density_map, (101, 101), 32.0)
    continuous_density = 0.50 * smooth_fine + 0.35 * smooth_med + 0.15 * smooth_broad

    # 5. Scientific JET Colormapping
    norm_vis = np.clip(continuous_density / max_density_scale, 0.0, 1.0)
    heat_u8 = (norm_vis * 255).astype(np.uint8)
    colored_heat = cv2.applyColorMap(heat_u8, cv2.COLORMAP_JET)

    # 6. Density-Aware Dynamic Alpha Blending
    alpha = np.clip((norm_vis - 0.05) / 0.62, 0.0, 1.0)
    alpha = np.power(alpha, 0.85) * 0.58
    alpha_3d = alpha[:, :, np.newaxis]

    blended = (frame.astype(np.float32) * (1.0 - alpha_3d) + colored_heat.astype(np.float32) * alpha_3d).astype(np.uint8)

    # 7. Pinpoint Detection Markers
    if boxes:
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            cv2.circle(blended, (cx, cy), 3, (56, 189, 248), -1, cv2.LINE_AA)
            cv2.circle(blended, (cx, cy), 5, (255, 255, 255), 1, cv2.LINE_AA)

    # 8. Modern Glassmorphic HUD Legend (Bottom Right)
    if w >= 640 and h >= 400:
        legend_w, legend_h = 310, 64
        lx1 = w - legend_w - 24
        ly1 = h - legend_h - 24
        lx2 = lx1 + legend_w
        ly2 = ly1 + legend_h

        sub_hud = blended[ly1:ly2, lx1:lx2]
        dark_glass = np.zeros_like(sub_hud, dtype=np.uint8)
        dark_glass[:] = (15, 23, 42)
        cv2.addWeighted(dark_glass, 0.82, sub_hud, 0.18, 0, sub_hud)
        cv2.rectangle(blended, (lx1, ly1), (lx2, ly2), (100, 116, 139), 1, cv2.LINE_AA)

        bar_x1, bar_y1 = lx1 + 14, ly1 + 14
        bar_w, bar_h = 282, 12
        grad_strip = np.linspace(0, 255, bar_w, dtype=np.uint8).reshape(1, bar_w)
        grad_img = np.repeat(grad_strip, bar_h, axis=0)
        grad_color = cv2.applyColorMap(grad_img, cv2.COLORMAP_JET)
        blended[bar_y1 : bar_y1 + bar_h, bar_x1 : bar_x1 + bar_w] = grad_color
        cv2.rectangle(blended, (bar_x1, bar_y1), (bar_x1 + bar_w, bar_y1 + bar_h), (255, 255, 255), 1)

        cv2.putText(blended, "0.0 p/m2", (bar_x1, ly1 + 46), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (203, 213, 225), 1, cv2.LINE_AA)
        cv2.putText(blended, "2.1 (ALERT)", (bar_x1 + 90, ly1 + 46), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (251, 191, 36), 1, cv2.LINE_AA)
        cv2.putText(blended, "4.5+ (CRUSH)", (bar_x1 + 198, ly1 + 46), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (239, 68, 68), 1, cv2.LINE_AA)

    # 9. Sleek Glassmorphic Status Header (Top Left)
    top_w, top_h = 580, 52
    tx1, ty1 = 20, 20
    tx2, ty2 = tx1 + top_w, ty1 + top_h

    sub_top = blended[ty1:ty2, tx1:tx2]
    dark_top = np.zeros_like(sub_top, dtype=np.uint8)
    dark_top[:] = (15, 23, 42)
    cv2.addWeighted(dark_top, 0.85, sub_top, 0.15, 0, sub_top)
    accent_color = (245, 158, 11) if is_saturated else (56, 189, 248)
    cv2.rectangle(blended, (tx1, ty1), (tx2, ty2), accent_color, 1, cv2.LINE_AA)

    status_str = f"FALLBACK ACTIVE: {effective_density:.2f} p/m2" if is_saturated else f"{effective_density:.2f} p/m2"
    cv2.putText(
        blended,
        f"AERIAL CROWD DENSITY HEATMAP | {effective_count} EST. PEOPLE ({density_source.upper()})",
        (tx1 + 14, ty1 + 22),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        (255, 255, 255),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        blended,
        f"Density: {status_str} | Latency: {latency_ms:.1f} ms | Model: YOLOv8+SAHI",
        (tx1 + 14, ty1 + 42),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.42,
        accent_color,
        1,
        cv2.LINE_AA,
    )

    return blended

def test():
    frame = cv2.imread("videos/frame.png")
    detector = PersonDetector(model_path="yolov8n.pt", camera_type="drone")
    detector.conf_threshold = 0.06
    raw_count, boxes, latency_ms = detector.detect(frame)

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

    heatmap_result = render_drone_heatmap_overlay(
        frame,
        boxes=boxes,
        saturated_cells=grid_result["saturated_cells"],
        area_sqm=250.0,
        effective_count=grid_result["effective_count"],
        effective_density=grid_result["effective_density"],
        density_source="override_live" if grid_result["is_saturated"] else "detection",
        is_saturated=grid_result["is_saturated"],
        latency_ms=latency_ms,
    )

    cv2.imwrite("test_drone_dense_output.jpg", heatmap_result)
    print("Saved perfect test_drone_dense_output.jpg")

if __name__ == "__main__":
    test()
