"""
cv-service/density_override.py
Computes calibrated crowd density proxy (people/m²) from edge/texture density
metrics when aerial drone detection saturation occurs.

Performs piecewise linear interpolation against the empirical calibration curve
defined in calibration.json.
"""
from __future__ import annotations

import json
import os
from typing import List, Tuple, Optional


class DensityOverrideEngine:
    """
    Interpolates edge density ratio into people/m² using calibrated lookup points.
    """

    def __init__(self, calibration_path: str = "calibration.json") -> None:
        self.calibration_path = calibration_path
        self.lookup_table: List[List[float]] = []
        self.min_clamp: float = 0.0
        self.max_clamp: float = 6.5
        self.min_detection_density: float = 0.35
        self.saturation_edge_threshold: float = 0.075

        self.load_calibration()

    def load_calibration(self) -> None:
        """Loads or reloads calibration parameters from JSON file."""
        if os.path.exists(self.calibration_path):
            try:
                with open(self.calibration_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.lookup_table = sorted(
                        data.get("lookup_table", []),
                        key=lambda point: point[0]
                    )
                    thresholds = data.get("thresholds", {})
                    self.min_clamp = float(thresholds.get("min_density_clamp", 0.0))
                    self.max_clamp = float(thresholds.get("max_density_clamp", 6.5))
                    self.min_detection_density = float(thresholds.get("min_detection_density", 0.35))
                    self.saturation_edge_threshold = float(thresholds.get("saturation_edge_threshold", 0.075))
            except Exception as err:
                print(f"[DensityOverrideEngine] Warning: Could not parse {self.calibration_path} ({err}), using defaults.")
                self._load_fallback_table()
        else:
            self._load_fallback_table()

    def _load_fallback_table(self) -> None:
        """Default lookup table based on standard aerial drone edge metrics."""
        self.lookup_table = [
            [0.020, 0.1],  # Empty ground
            [0.060, 1.2],  # LOS C (1.2 p/m²)
            [0.100, 2.6],  # LOS E (2.6 p/m²)
            [0.150, 4.2],  # LOS F (Crush Hazard 4.2 p/m²)
            [0.220, 5.8],  # Extreme Crush (5.8 p/m²)
        ]

    def interpolate_density(self, edge_ratio: float) -> float:
        """
        Maps edge_density_ratio to people/m² via piecewise linear interpolation.
        """
        if not self.lookup_table:
            self._load_fallback_table()

        # Below lowest calibration point
        if edge_ratio <= self.lookup_table[0][0]:
            return max(self.min_clamp, self.lookup_table[0][1])

        # Above highest calibration point
        if edge_ratio >= self.lookup_table[-1][0]:
            return min(self.max_clamp, self.lookup_table[-1][1])

        # Piecewise interpolation between adjacent segments
        for i in range(len(self.lookup_table) - 1):
            x0, y0 = self.lookup_table[i]
            x1, y1 = self.lookup_table[i + 1]
            if x0 <= edge_ratio <= x1:
                if x1 == x0:
                    return y0
                t = (edge_ratio - x0) / (x1 - x0)
                interpolated = y0 + t * (y1 - y0)
                return round(max(self.min_clamp, min(self.max_clamp, interpolated)), 3)

        return self.lookup_table[-1][1]

    def get_override(
        self,
        edge_density_ratio: float,
        area_sqm: float,
    ) -> Tuple[float, int]:
        """
        Returns (override_density, equivalent_headcount).
        """
        density = self.interpolate_density(edge_density_ratio)
        equivalent_count = max(1, int(round(density * area_sqm))) if area_sqm > 0 else 0
        return density, equivalent_count
