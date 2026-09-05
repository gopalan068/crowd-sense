"""
cv-service/test_saturation_override.py
Unit and Integration Test Suite for Zone Density Override & Saturation Detection Module.
"""
from __future__ import annotations

import json
import os
import sys
import unittest
import numpy as np
import cv2

# Ensure local imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from saturation_detector import SaturationDetector
from density_override import DensityOverrideEngine
from emitter import build_payload
import config


class TestSaturationDetector(unittest.TestCase):

    def setUp(self):
        self.detector = SaturationDetector(
            min_detection_density=0.35,
            saturation_edge_threshold=0.075,
        )

    def test_empty_frame_not_saturated(self):
        """A smooth black/flat image (empty plaza) should NOT be flagged as saturated."""
        empty_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        res = self.detector.check_saturation(
            empty_frame,
            detected_count=0,
            area_sqm=250.0,
            camera_type="drone",
        )
        self.assertFalse(res["is_saturated"], "Empty frame must not trigger saturation")
        self.assertLess(res["edge_density_ratio"], 0.075)

    def test_high_detection_not_saturated(self):
        """When YOLO detects plenty of people, saturation override should NOT activate."""
        frame = np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8)
        res = self.detector.check_saturation(
            frame,
            detected_count=150,  # 150 / 250 = 0.60 p/m2 (> 0.35 threshold)
            area_sqm=250.0,
            camera_type="drone",
        )
        self.assertFalse(res["is_saturated"], "High detection density must not be flagged saturated")

    def test_packed_crush_low_detection_triggers_saturation(self):
        """High texture edge noise + zero detections must trigger saturation override."""
        # Create a synthetic high-frequency texture (edges everywhere)
        rng = np.random.RandomState(42)
        high_texture_frame = rng.randint(0, 256, (480, 640, 3), dtype=np.uint8)

        res = self.detector.check_saturation(
            high_texture_frame,
            detected_count=2,  # 2 / 250 = 0.008 p/m2 (< 0.35 threshold)
            area_sqm=250.0,
            camera_type="drone",
        )
        self.assertTrue(res["is_saturated"], "High edge texture + low detection count must trigger saturation")
        self.assertGreaterEqual(res["edge_density_ratio"], 0.075)

    def test_cctv_mode_bypasses_saturation(self):
        """Saturation override must be bypassed for CCTV ground camera mode."""
        high_texture_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        for y in range(0, 480, 4):
            high_texture_frame[y, :] = 255

        res = self.detector.check_saturation(
            high_texture_frame,
            detected_count=0,
            area_sqm=30.0,
            camera_type="cctv",
        )
        self.assertFalse(res["is_saturated"], "CCTV mode must bypass saturation override")

    def test_zone_roi_masking(self):
        """Edge calculation should be restricted to the designated zone polygon."""
        # Top half flat, bottom half texture
        frame = np.zeros((400, 400, 3), dtype=np.uint8)
        frame[200:400, :] = np.random.randint(0, 256, (200, 400, 3), dtype=np.uint8)

        # Polygon covering only top flat area (Y: 0.0 to 0.4)
        top_polygon = [(0.0, 0.0), (1.0, 0.0), (1.0, 0.4), (0.0, 0.4)]
        ed_top, _, _ = self.detector.compute_edge_density(frame, zone_polygon=top_polygon)

        # Polygon covering bottom textured area (Y: 0.6 to 1.0)
        bottom_polygon = [(0.0, 0.6), (1.0, 0.6), (1.0, 1.0), (0.0, 1.0)]
        ed_bottom, _, _ = self.detector.compute_edge_density(frame, zone_polygon=bottom_polygon)

        self.assertLess(ed_top, 0.05, "Top flat area should have low edge density")
        self.assertGreater(ed_bottom, 0.05, "Bottom textured area should have higher edge density")


class TestDensityOverrideEngine(unittest.TestCase):

    def setUp(self):
        self.engine = DensityOverrideEngine(calibration_path="calibration.json")

    def test_interpolation_monotonicity(self):
        """Higher edge density must produce equal or higher crowd density override."""
        densities = [self.engine.interpolate_density(r) for r in [0.01, 0.05, 0.10, 0.15, 0.20, 0.28]]
        for i in range(len(densities) - 1):
            self.assertLessEqual(densities[i], densities[i + 1], "Interpolation curve must be monotonically non-decreasing")

    def test_equivalent_headcount_calculation(self):
        """Calculates correct headcount based on area."""
        den, cnt = self.engine.get_override(0.25, area_sqm=200.0)
        self.assertGreater(den, 0.0)
        self.assertEqual(cnt, int(round(den * 200.0)))


class TestPayloadContract(unittest.TestCase):

    def test_payload_fields(self):
        """Payload must contain required fields and the new density_source and saturated keys."""
        payload = build_payload(
            [40],
            zone_id="zone_1",
            zone_type="general",
            area_sqm=250.0,
            density_source="override_live",
            saturated=True,
            override_density=4.25,
            override_people_count=1063,
        )
        self.assertEqual(payload["zone_id"], "zone_1")
        self.assertEqual(payload["density"], 4.25)
        self.assertEqual(payload["people_count"], 1063)
        self.assertEqual(payload["density_source"], "override_live")
        self.assertTrue(payload["saturated"])


if __name__ == "__main__":
    unittest.main()
