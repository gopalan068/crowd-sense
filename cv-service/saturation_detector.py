"""
cv-service/saturation_detector.py
Zone-Aware Spatial Crowd Saturation Detector for Aerial Drone Computer Vision.

Identifies when packed crowd regions cross into detection saturation failure
(where person boundaries blend into an unbroken mass of heads, causing YOLO+SAHI
detections to collapse to near-zero).

Features:
  1. Global Zone Saturation Check:
     is_saturated = (detected_density < min_detection_density) AND (edge_density_ratio >= saturation_edge_threshold)
  2. Spatial Grid Saturation Mapping:
     Divides the zone into spatial patches. Analyzes each patch independently.
     Substitutes calibrated density for saturated patches while preserving YOLO detections
     in sparse peripheral areas (rooftops, side alleys).
  3. Visual Density Overlay:
     Annotates saturated crowd patches with an alpha-blended density heatmap & dot texture.
"""
from __future__ import annotations

import os
from typing import List, Tuple, Optional, Dict, Any
import cv2
import numpy as np


class SaturationDetector:
    """
    Zone-aware crowd detection saturation detector for aerial drone camera feeds.
    """

    def __init__(
        self,
        min_detection_density: float = 0.35,
        saturation_edge_threshold: float = 0.075,
        canny_low: int = 50,
        canny_high: int = 150,
        grid_cols: int = 16,
        grid_rows: int = 16,
    ) -> None:
        self.min_detection_density = float(os.getenv("SATURATION_MIN_DETECTION_DENSITY", str(min_detection_density)))
        self.saturation_edge_threshold = float(os.getenv("SATURATION_EDGE_THRESHOLD", str(saturation_edge_threshold)))
        self.canny_low = canny_low
        self.canny_high = canny_high
        self.grid_cols = grid_cols
        self.grid_rows = grid_rows
        self._mask_cache: Dict[Tuple[int, int, str], np.ndarray] = {}

    def get_zone_mask(
        self,
        frame_shape: Tuple[int, int],
        zone_polygon: Optional[List[Tuple[float, float]]] = None,
        zone_id: str = "default",
    ) -> np.ndarray:
        h, w = frame_shape[:2]
        cache_key = (h, w, str(zone_polygon) if zone_polygon else zone_id)
        if cache_key in self._mask_cache:
            return self._mask_cache[cache_key]

        mask = np.zeros((h, w), dtype=np.uint8)

        if zone_polygon and len(zone_polygon) >= 3:
            pts = []
            for p in zone_polygon:
                px = int(p[0] * w) if (0.0 <= p[0] <= 1.0 and isinstance(p[0], float)) else int(p[0])
                py = int(p[1] * h) if (0.0 <= p[1] <= 1.0 and isinstance(p[1], float)) else int(p[1])
                pts.append([px, py])
            pts_np = np.array(pts, dtype=np.int32).reshape((-1, 1, 2))
            cv2.fillPoly(mask, [pts_np], 255)
        else:
            mask[:] = 255

        self._mask_cache[cache_key] = mask
        return mask

    def compute_edge_map(self, frame: np.ndarray) -> np.ndarray:
        """Computes CLAHE-enhanced Canny edge binary map."""
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
        edges = cv2.Canny(blurred, self.canny_low, self.canny_high)
        return edges

    def compute_edge_density(
        self,
        frame: np.ndarray,
        zone_polygon: Optional[List[Tuple[float, float]]] = None,
        zone_id: str = "default",
    ) -> Tuple[float, int, int]:
        h, w = frame.shape[:2]
        mask = self.get_zone_mask((h, w), zone_polygon, zone_id=zone_id)
        zone_pixel_count = int(np.count_nonzero(mask))

        if zone_pixel_count == 0:
            return 0.0, 0, 0

        edges = self.compute_edge_map(frame)
        masked_edges = cv2.bitwise_and(edges, edges, mask=mask)
        edge_pixel_count = int(np.count_nonzero(masked_edges))

        edge_density_ratio = edge_pixel_count / float(zone_pixel_count)
        return edge_density_ratio, edge_pixel_count, zone_pixel_count

    def filter_boxes_in_zone(
        self,
        boxes: List[Tuple[int, int, int, int, float]],
        frame_shape: Tuple[int, int],
        zone_polygon: Optional[List[Tuple[float, float]]] = None,
        zone_id: str = "default",
    ) -> List[Tuple[int, int, int, int, float]]:
        if not zone_polygon or not boxes:
            return boxes

        mask = self.get_zone_mask(frame_shape, zone_polygon, zone_id=zone_id)
        h, w = frame_shape[:2]
        zone_boxes = []

        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            if 0 <= cx < w and 0 <= cy < h and mask[cy, cx] > 0:
                zone_boxes.append(b)

        return zone_boxes

    def analyze_spatial_grid(
        self,
        frame: np.ndarray,
        boxes: List[Tuple[int, int, int, int, float]],
        area_sqm: float,
        override_engine: Any,
        zone_polygon: Optional[List[Tuple[float, float]]] = None,
        zone_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Spatial Grid Multi-Patch Saturation Analysis.
        
        Evaluates crowd density across spatial cells. For packed crush patches
        where YOLO detections collapse, substitutes calibrated density overrides.
        """
        h, w = frame.shape[:2]
        mask = self.get_zone_mask((h, w), zone_polygon, zone_id=zone_id)
        total_zone_pixels = int(np.count_nonzero(mask))

        if total_zone_pixels == 0:
            return {
                "effective_count": 0,
                "effective_density": 0.0,
                "saturated_cells": [],
                "is_saturated": False,
                "raw_detection_count": 0,
            }

        edges = self.compute_edge_map(frame)
        masked_edges = cv2.bitwise_and(edges, edges, mask=mask)

        # Index boxes into grid
        cell_w = w // self.grid_cols
        cell_h = h // self.grid_rows

        grid_boxes: Dict[Tuple[int, int], List[Tuple]] = {}
        for b in boxes:
            cx = int((b[0] + b[2]) / 2)
            cy = int((b[1] + b[3]) / 2)
            if 0 <= cx < w and 0 <= cy < h and mask[cy, cx] > 0:
                col_idx = min(cx // cell_w, self.grid_cols - 1)
                row_idx = min(cy // cell_h, self.grid_rows - 1)
                grid_boxes.setdefault((col_idx, row_idx), []).append(b)

        saturated_cells = []
        total_effective_count = 0
        total_raw_count = 0
        saturated_pixel_area = 0

        for r in range(self.grid_rows):
            for c in range(self.grid_cols):
                x1 = c * cell_w
                y1 = r * cell_h
                x2 = w if c == self.grid_cols - 1 else (c + 1) * cell_w
                y2 = h if r == self.grid_rows - 1 else (r + 1) * cell_h

                cell_mask = mask[y1:y2, x1:x2]
                cell_mask_px = int(np.count_nonzero(cell_mask))
                if cell_mask_px < (cell_w * cell_h * 0.10):
                    continue

                cell_fraction = cell_mask_px / float(total_zone_pixels)
                cell_area_sqm = max(0.1, area_sqm * cell_fraction)

                cell_box_count = len(grid_boxes.get((c, r), []))
                total_raw_count += cell_box_count

                cell_detected_density = cell_box_count / cell_area_sqm

                cell_edges = masked_edges[y1:y2, x1:x2]
                cell_edge_px = int(np.count_nonzero(cell_edges))
                cell_edge_ratio = cell_edge_px / float(cell_mask_px)

                # Saturation condition on patch level
                is_cell_saturated = (
                    cell_detected_density < self.min_detection_density
                    and cell_edge_ratio >= self.saturation_edge_threshold
                )

                if is_cell_saturated:
                    override_den = override_engine.interpolate_density(cell_edge_ratio)
                    override_cnt = max(1, int(round(override_den * cell_area_sqm)))
                    total_effective_count += override_cnt
                    saturated_pixel_area += cell_mask_px
                    saturated_cells.append({
                        "box": (x1, y1, x2, y2),
                        "edge_ratio": cell_edge_ratio,
                        "density": override_den,
                        "count": override_cnt,
                        "raw_count": cell_box_count,
                    })
                else:
                    total_effective_count += cell_box_count

        effective_density = round(total_effective_count / area_sqm, 3) if area_sqm > 0 else 0.0
        is_any_saturated = len(saturated_cells) > 0 and (saturated_pixel_area / float(total_zone_pixels)) >= 0.08

        return {
            "effective_count": total_effective_count,
            "effective_density": effective_density,
            "saturated_cells": saturated_cells,
            "is_saturated": is_any_saturated,
            "raw_detection_count": total_raw_count,
            "saturated_area_ratio": round(saturated_pixel_area / float(total_zone_pixels), 3),
        }

    def check_saturation(
        self,
        frame: np.ndarray,
        detected_count: int,
        area_sqm: float,
        camera_type: str = "drone",
        boxes: Optional[List[Tuple[int, int, int, int, float]]] = None,
        zone_polygon: Optional[List[Tuple[float, float]]] = None,
        zone_id: str = "default",
    ) -> Dict[str, Any]:
        if camera_type.lower() != "drone":
            detected_density = round(detected_count / area_sqm, 3) if area_sqm > 0 else 0.0
            return {
                "is_saturated": False,
                "detected_density": detected_density,
                "effective_count": detected_count,
                "edge_density_ratio": 0.0,
                "edge_pixels": 0,
                "zone_pixels": 0,
                "reason": "CCTV_MODE_BYPASS",
            }

        h, w = frame.shape[:2]

        if boxes is not None and zone_polygon is not None:
            zone_boxes = self.filter_boxes_in_zone(boxes, (h, w), zone_polygon, zone_id=zone_id)
            effective_count = len(zone_boxes)
        else:
            effective_count = detected_count

        detected_density = round(effective_count / area_sqm, 3) if area_sqm > 0 else 0.0

        edge_ratio, edge_px, zone_px = self.compute_edge_density(
            frame,
            zone_polygon=zone_polygon,
            zone_id=zone_id,
        )

        is_low_detection = detected_density < self.min_detection_density
        is_high_texture = edge_ratio >= self.saturation_edge_threshold

        is_saturated = bool(is_low_detection and is_high_texture)

        return {
            "is_saturated": is_saturated,
            "detected_density": detected_density,
            "effective_count": effective_count,
            "edge_density_ratio": round(edge_ratio, 5),
            "edge_pixels": edge_px,
            "zone_pixels": zone_px,
            "reason": "SATURATED" if is_saturated else "NOMINAL",
        }

    def compute_crowd_texture_energy(self, frame: np.ndarray, zone_mask: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Extracts omnidirectional high-frequency crowd texture energy while suppressing
        directional straight lines from building roofs and flat surfaces.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        # 1. CLAHE Local Contrast Enhancement
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # 2. Omnidirectional High-Frequency Texture (Laplacian of Gaussian)
        blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
        lap = cv2.Laplacian(blurred, cv2.CV_32F, ksize=3)
        abs_lap = np.abs(lap)

        # 3. Local Standard Deviation (Crowd contrast vs uniform roofs)
        blur_sq = cv2.GaussianBlur(gray.astype(np.float32)**2, (21, 21), 0)
        sq_blur = cv2.GaussianBlur(gray.astype(np.float32), (21, 21), 0)**2
        local_std = np.sqrt(np.maximum(0, blur_sq - sq_blur))

        # 4. Directional Edge Uniformity (Isotropic check)
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

    def annotate_density_heatmap(
        self,
        frame: np.ndarray,
        boxes: Optional[Any] = None,
        saturated_cells: Optional[List[Dict[str, Any]]] = None,
        area_sqm: float = 250.0,
        effective_count: int = 0,
        effective_density: float = 0.0,
        density_source: str = "detection",
        is_saturated: bool = False,
        latency_ms: float = 0.0,
        max_density_scale: float = 5.5,
        show_hud_legend: bool = True,
        show_top_badge: bool = True,
        show_pinpoint_dots: bool = True,
        zone_polygon: Optional[List[Tuple[float, float]]] = None,
        zone_id: str = "default",
    ) -> np.ndarray:
        """
        Renders a continuous scientific crowd density heatmap overlay on the drone frame.

        Pipeline:
          1. 2D Gaussian Kernel Splatting for all detected persons (calibrated to physical footprint).
          2. Omnidirectional Crowd Texture Energy Field for packed crush masses.
          3. Saturated Patch Crush Energy Injection (fills crush corridors where detections collapsed).
          4. Continuous Multi-Scale Thermal Diffusion (dissolves grid boundaries into fluid thermal topology).
          5. Scientific JET Colormapping (Deep Blue -> Cyan -> Emerald Green -> Amber -> Radiant Red).
          6. Density-Aware Dynamic Alpha Blending (0% opacity on empty roofs/roads, up to ~60% in crush crowd).
          7. Sleek Pinpoint Detection Markers with glowing cyan halos.
          8. Modern Glassmorphic HUD Color Bar Legend & Status Header.
        """
        # Handle flexible caller signatures (e.g. if saturated_cells was passed as 2nd arg)
        box_list = []
        if boxes is not None:
            if isinstance(boxes, list) and len(boxes) > 0 and isinstance(boxes[0], dict):
                saturated_cells = boxes
                box_list = []
            elif isinstance(boxes, list):
                box_list = boxes

        h, w = frame.shape[:2]
        density_map = np.zeros((h, w), dtype=np.float32)
        px_per_sqm = (h * w) / float(area_sqm) if area_sqm > 0 else 1.0

        # 1. 2D Gaussian Splatting for Detected Individuals
        if box_list:
            for b in box_list:
                if len(b) < 4:
                    continue
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

        # 2. Omnidirectional Crowd Texture Energy
        zone_mask = self.get_zone_mask((h, w), zone_polygon, zone_id=zone_id) if zone_polygon else None
        texture_field = self.compute_crowd_texture_energy(frame, zone_mask=zone_mask)
        texture_density = np.power(np.clip(texture_field - 0.20, 0.0, 2.0) / 1.05, 1.15) * 3.8
        density_map += texture_density

        # 3. Saturated Patch Crush Energy Injection
        if saturated_cells:
            sat_plane = np.zeros((h, w), dtype=np.float32)
            for cell in saturated_cells:
                x1, y1, x2, y2 = cell["box"]
                den = float(cell.get("density", 4.2))
                sat_plane[y1:y2, x1:x2] = np.maximum(sat_plane[y1:y2, x1:x2], den * 0.85)

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

        # 7. Sleek Pinpoint Detection Markers
        if show_pinpoint_dots and box_list:
            for b in box_list:
                cx = int((b[0] + b[2]) / 2)
                cy = int((b[1] + b[3]) / 2)
                cv2.circle(blended, (cx, cy), 3, (56, 189, 248), -1, cv2.LINE_AA)
                cv2.circle(blended, (cx, cy), 5, (255, 255, 255), 1, cv2.LINE_AA)

        # 8. Modern Glassmorphic HUD Legend (Bottom Right)
        if show_hud_legend and w >= 640 and h >= 400:
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
        if show_top_badge and w >= 640 and h >= 400:
            top_w, top_h = 580, 52
            tx1, ty1 = 20, 20
            tx2, ty2 = tx1 + top_w, ty1 + top_h

            sub_top = blended[ty1:ty2, tx1:tx2]
            dark_top = np.zeros_like(sub_top, dtype=np.uint8)
            dark_top[:] = (15, 23, 42)
            cv2.addWeighted(dark_top, 0.85, sub_top, 0.15, 0, sub_top)
            accent_color = (245, 158, 11) if is_saturated else (56, 189, 248)
            cv2.rectangle(blended, (tx1, ty1), (tx2, ty2), accent_color, 1, cv2.LINE_AA)

            cnt_val = effective_count if effective_count > 0 else len(box_list)
            status_str = f"FALLBACK ACTIVE: {effective_density:.2f} p/m2" if is_saturated else f"{effective_density:.2f} p/m2"
            cv2.putText(
                blended,
                f"AERIAL CROWD DENSITY HEATMAP | {cnt_val} EST. PEOPLE ({density_source.upper()})",
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

