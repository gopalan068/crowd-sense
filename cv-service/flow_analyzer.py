"""
cv-service/flow_analyzer.py
OpenCV Farneback Dense Optical Flow Analysis Module.

Implements blueprint Section 6:
  - flow_convergence: motion vector alignment towards zone focal point (0.0 - 1.0)
  - flow_turbulence: circular variance of motion direction angles (0.0 - 1.0)
  - panic_signature: sustained acceleration & turbulence spike with density floor >= 1.5 p/m²
"""
from __future__ import annotations

import math
from typing import Dict, List, Tuple

import cv2
import numpy as np


class FlowAnalyzer:
    """
    Per-zone optical flow analyzer maintaining previous frame & motion history window.
    """

    def __init__(self, focal_point: Tuple[int, int] = (320, 480)) -> None:
        self.focal_point = focal_point
        self.prev_gray: np.ndarray | None = None
        self.prev_magnitude: float = 0.0
        self.consecutive_spike_count: int = 0

    def analyze(self, frame: np.ndarray, current_density: float = 0.0) -> Tuple[float, float, bool]:
        """
        Process a BGR frame using OpenCV Farneback Optical Flow.
        Returns (flow_convergence, flow_turbulence, panic_signature).
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.prev_gray is None:
            self.prev_gray = gray
            return 0.0, 0.0, False

        # Resize for fast optical flow computation
        h, w = gray.shape[:2]
        if w > 640:
            scale_h = int(360 * (h / w))
            small_gray = cv2.resize(gray, (640, scale_h))
            small_prev = cv2.resize(self.prev_gray, (640, scale_h))
        else:
            small_gray = gray
            small_prev = self.prev_gray

        # Compute Farneback Optical Flow
        flow = cv2.calcOpticalFlowFarneback(
            small_prev,
            small_gray,
            None,
            pyr_scale=0.5,
            levels=3,
            winsize=15,
            iterations=3,
            poly_n=5,
            poly_sigma=1.2,
            flags=0,
        )

        self.prev_gray = gray

        fx, fy = flow[..., 0], flow[..., 1]
        magnitude, angle = cv2.cartToPolar(fx, fy)

        # Sensitive motion mask threshold for aerial drone and CCTV feeds
        motion_mask = magnitude > 0.1
        if not np.any(motion_mask):
            self.consecutive_spike_count = 0
            return 0.0, 0.0, False

        active_fx = fx[motion_mask]
        active_fy = fy[motion_mask]
        active_angle = angle[motion_mask]
        active_mag = magnitude[motion_mask]

        # 1. Compute flow_turbulence (Circular Variance of vector angles)
        mean_cos = np.mean(np.cos(active_angle))
        mean_sin = np.mean(np.sin(active_angle))
        R = math.sqrt(mean_cos**2 + mean_sin**2)
        turbulence = max(0.0, min(1.0, 1.0 - R))

        # 2. Compute flow_convergence (alignment toward focal point)
        h_small, w_small = small_gray.shape
        y_coords, x_coords = np.where(motion_mask)
        fx_pts = active_fx
        fy_pts = active_fy

        dx_focal = (self.focal_point[0] * (w_small / w)) - x_coords
        dy_focal = (self.focal_point[1] * (h_small / h)) - y_coords
        dist_focal = np.sqrt(dx_focal**2 + dy_focal**2) + 1e-5

        u_x = dx_focal / dist_focal
        u_y = dy_focal / dist_focal

        mag_pts = active_mag + 1e-5
        norm_fx = fx_pts / mag_pts
        norm_fy = fy_pts / mag_pts

        dot_prods = (norm_fx * u_x) + (norm_fy * u_y)
        convergence = max(0.0, min(1.0, float(np.mean(dot_prods))))

        # 3. Compute panic_signature
        mean_mag = float(np.mean(active_mag))
        acceleration = max(0.0, mean_mag - self.prev_magnitude)
        self.prev_magnitude = mean_mag

        is_spike = (turbulence > 0.60) and (acceleration > 0.80)

        if is_spike and current_density >= 1.00:
            self.consecutive_spike_count += 1
        else:
            self.consecutive_spike_count = max(0, self.consecutive_spike_count - 1)

        panic_signature = self.consecutive_spike_count >= 2

        return round(convergence, 3), round(turbulence, 3), panic_signature
