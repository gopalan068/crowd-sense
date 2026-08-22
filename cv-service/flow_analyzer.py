"""
cv-service/flow_analyzer.py
OpenCV Farneback Dense Optical Flow Analysis Module.

Implements two behaviorally distinct panic signatures:
  1. panic_signature  — chaotic crowd crush (high turbulence + acceleration spike)
  2. exodus_signature — mass fire evacuation flee (high directional coherence + high speed)

Blueprint Section 6 false-positive proof rules:
  - flow_convergence: motion vector alignment towards zone focal point (0.0 - 1.0)
  - flow_turbulence: circular variance of motion direction angles (0.0 - 1.0)
  - panic_signature: sustained acceleration & high turbulence spike (crush/stampede)
  - exodus_signature: high directional coherence + high mean magnitude (mass flee/evacuation)
"""
from __future__ import annotations

import math
from collections import deque
from typing import Deque, Tuple

import cv2
import numpy as np


class FlowAnalyzer:
    """
    Per-zone optical flow analyzer maintaining previous frame & motion history window.

    Detects two behaviorally distinct crowd emergency patterns:
      - panic_signature : crowd CRUSH — chaotic turbulence + sudden acceleration spike
      - exodus_signature: mass FLEE  — coherent unidirectional fast movement (fire evacuation)
    """

    # EMA smoothing factor for baseline magnitude (α=0.25 → ~4-window memory)
    _EMA_ALPHA = 0.25

    def __init__(
        self,
        focal_point: Tuple[int, int] = (320, 240),
        camera_type: str = "cctv",
    ) -> None:
        self.focal_point = focal_point
        self.camera_type = camera_type.lower()

        self.prev_gray: np.ndarray | None = None
        self.mag_baseline_ema: float = 0.0           # EMA of mean magnitude (stable baseline)
        self.consecutive_spike_count: int = 0         # crush/panic consecutive spike counter
        self.consecutive_exodus_count: int = 0        # exodus/flee consecutive window counter
        self.consecutive_high_turb_count: int = 0     # sustained turbulence counter

        # Per-mode density gate for panic_signature (lower for CCTV ground cameras)
        # CCTV: partial occlusion -> fewer detected -> lower p/m2 even in real panic
        self._density_gate = 0.30 if self.camera_type == "cctv" else 1.00

        # Exodus: high directional coherence (R) + high mean magnitude thresholds
        # Calibrated from real CCTV 1280x720 footage: mean_mag ranges 4-8 px/frame
        # R peaks at ~0.60 even during mass evacuation (camera perspective limits coherence)
        self._exodus_coherence_thresh = 0.50   # R > 0.50 -> significant directional alignment
        self._exodus_magnitude_thresh = 4.00   # mean_mag > 4.0 px/frame -> fast crowd motion

        # Crush/panic thresholds
        # Turbulence typically 0.40-0.97 in real CCTV panic footage
        self._turbulence_thresh = 0.50         # lowered from 0.60 for CCTV realism
        self._acceleration_thresh = 0.60       # deviation above EMA baseline

        # Sustained high turbulence: 3+ windows of turb > 0.65 = confirmed panic
        # (catches cases where motion is consistently chaotic even without acceleration spike)
        self._high_turb_thresh = 0.65
        self._sustained_turb_windows = 3       # consecutive windows before confirmation

    def analyze(
        self,
        frame: np.ndarray,
        current_density: float = 0.0,
    ) -> Tuple[float, float, bool, bool]:
        """
        Process a BGR frame using OpenCV Farneback Optical Flow.

        Returns:
            (flow_convergence, flow_turbulence, panic_signature, exodus_signature)

        panic_signature  → crowd crush / stampede (chaotic turbulence + acceleration)
        exodus_signature → mass evacuation flee (coherent fast unidirectional movement)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.prev_gray is None:
            self.prev_gray = gray
            return 0.0, 0.0, False, False

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

        # Motion mask: only consider pixels with meaningful displacement
        motion_mask = magnitude > 0.3
        if not np.any(motion_mask):
            self.consecutive_spike_count = 0
            self.consecutive_exodus_count = 0
            self.consecutive_high_turb_count = 0
            return 0.0, 0.0, False, False

        active_fx = fx[motion_mask]
        active_fy = fy[motion_mask]
        active_angle = angle[motion_mask]
        active_mag = magnitude[motion_mask]

        # ── 1. Directional Statistics ──────────────────────────────────────────
        # Mean resultant length R (circular statistics): 1.0 = perfectly aligned, 0.0 = chaotic
        mean_cos = np.mean(np.cos(active_angle))
        mean_sin = np.mean(np.sin(active_angle))
        R = math.sqrt(mean_cos**2 + mean_sin**2)

        # flow_turbulence = 1 - R  (high turbulence → chaotic, low turbulence → aligned)
        turbulence = max(0.0, min(1.0, 1.0 - R))

        # ── 2. flow_convergence (alignment toward focal point) ─────────────────
        h_small, w_small = small_gray.shape
        y_coords, x_coords = np.where(motion_mask)
        mag_pts = active_mag + 1e-5

        dx_focal = (self.focal_point[0] * (w_small / w)) - x_coords
        dy_focal = (self.focal_point[1] * (h_small / h)) - y_coords
        dist_focal = np.sqrt(dx_focal**2 + dy_focal**2) + 1e-5

        u_x = dx_focal / dist_focal
        u_y = dy_focal / dist_focal

        norm_fx = active_fx / mag_pts
        norm_fy = active_fy / mag_pts

        dot_prods = (norm_fx * u_x) + (norm_fy * u_y)
        convergence = max(0.0, min(1.0, float(np.mean(dot_prods))))

        # ── 3. Mean magnitude & EMA-baseline acceleration ──────────────────────
        mean_mag = float(np.mean(active_mag))

        # Warm up EMA on first non-zero reading
        if self.mag_baseline_ema == 0.0:
            self.mag_baseline_ema = mean_mag
        else:
            self.mag_baseline_ema = (
                self._EMA_ALPHA * mean_mag
                + (1.0 - self._EMA_ALPHA) * self.mag_baseline_ema
            )

        # Acceleration = deviation above the rolling EMA baseline
        # (positive only — sudden speed-up vs. established baseline)
        acceleration = max(0.0, mean_mag - self.mag_baseline_ema)

        # ── 4. panic_signature — CRUSH / STAMPEDE detector ────────────────────
        # Path A: Turbulence spike + significant acceleration above EMA baseline
        is_crush_spike = (
            (turbulence > self._turbulence_thresh)
            and (acceleration > self._acceleration_thresh)
        )

        # Path B: Sustained high turbulence across multiple windows (chaotic fast crowd)
        # Catches real CCTV fire evacuation where motion stays chaotic throughout
        if turbulence > self._high_turb_thresh and mean_mag > 2.0:
            self.consecutive_high_turb_count += 1
        else:
            self.consecutive_high_turb_count = max(0, self.consecutive_high_turb_count - 1)

        is_sustained_turb = self.consecutive_high_turb_count >= self._sustained_turb_windows

        # Check for extreme magnitude events
        is_extreme_speed = (mean_mag > 5.0 and turbulence > 0.5)

        # Either path requires minimum crowd density floor
        if (is_crush_spike or is_sustained_turb or is_extreme_speed) and current_density >= self._density_gate:
            self.consecutive_spike_count += 1
        else:
            self.consecutive_spike_count = max(0, self.consecutive_spike_count - 1)

        # Sustained across 2 consecutive analysis windows -> confirmed panic
        panic_signature = self.consecutive_spike_count >= 2

        # ── 5. exodus_signature — MASS FLEE / FIRE EVACUATION detector ────────
        # High directional coherence (R > threshold) = everyone moving the same way
        # + High mean speed (calibrated for real CCTV pixel scale: 4-8 px/frame)
        # Fires WITHOUT needing high turbulence — clean evacuation is COHERENT
        is_exodus_window = (
            (R > self._exodus_coherence_thresh)
            and (mean_mag > self._exodus_magnitude_thresh)
        )

        if is_exodus_window:
            self.consecutive_exodus_count += 1
        else:
            self.consecutive_exodus_count = max(0, self.consecutive_exodus_count - 1)

        # Confirmed after 2 consecutive windows of mass coherent fast movement
        exodus_signature = self.consecutive_exodus_count >= 2

        return (
            round(convergence, 3),
            round(turbulence, 3),
            panic_signature,
            exodus_signature,
        )
