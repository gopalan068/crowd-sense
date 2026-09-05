"""
cv-service/test_image_drone_cv.py
Standalone Aerial Drone Computer Vision Testing Harness for Direct Input Images.

Usage:
    python test_image_drone_cv.py --image path/to/drone_image.jpg
    python test_image_drone_cv.py -i input.png -o output.jpg --conf 0.06 --area 250

Features:
    - Direct image input & high-resolution aerial crowd detection
    - Drone Aerial Pipeline: Ultralytics YOLOv8 + SAHI Sliced Tiling + Saturation Fallback
    - Outputs annotated image with head detection dots, headcount overlay, and latency stats
    - Prints detailed headcount, density (p/m2), and box coordinates to console
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import cv2
import numpy as np

# Ensure local imports work correctly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from detector import PersonDetector
import config


def test_drone_image(
    image_path: str,
    output_path: str = "detected_drone_output.jpg",
    conf_thresh: float = 0.06,
    area_sqm: float = 250.0,
    model_path: str | None = None,
    use_sahi: bool = True,
    show_window: bool = False,
) -> None:
    if not os.path.exists(image_path):
        print(f"\n[ERROR] Input image file not found at '{image_path}'")
        sys.exit(1)

    print("\n" + "=" * 65)
    print("[TEST] CrowdSense Aerial Drone View CV Testing Harness")
    print("=" * 65)
    print(f"  Input Image        : {image_path}")

    # Load input image
    frame = cv2.imread(image_path)
    if frame is None or frame.size == 0:
        print(f"[ERROR] Unable to decode image file '{image_path}'. Ensure it is a valid JPEG/PNG.")
        sys.exit(1)

    h, w, c = frame.shape
    print(f"  Image Resolution   : {w} x {h} px ({c} channels)")

    # Resolve model path
    if model_path is None:
        if os.path.exists("models/yolov8n-visdrone.pt"):
            model_path = "models/yolov8n-visdrone.pt"
        elif os.path.exists("yolov8n.pt"):
            model_path = "yolov8n.pt"
        else:
            model_path = "models/yolov8n.pt"

    print(f"  Model Weights      : {model_path}")
    print(f"  Confidence Floor   : {conf_thresh} ({conf_thresh * 100:.1f}%)")
    print(f"  SAHI Sliced Tiling : {'ENABLED' if use_sahi else 'DISABLED'}")
    print(f"  Physical Area      : {area_sqm} m2")
    print("-" * 65)

    # Set environment variables for PersonDetector configuration override
    os.environ["CONF_THRESH_DRONE"] = str(conf_thresh)
    os.environ["USE_SAHI"] = "true" if use_sahi else "false"

    # Initialize Detector
    print("[INIT] Initializing Drone AI Detector Pipeline...")
    init_start = time.monotonic()
    detector = PersonDetector(model_path=model_path, camera_type="drone")
    detector.conf_threshold = conf_thresh
    init_time_ms = (time.monotonic() - init_start) * 1000.0
    print(f"[OK] Detector Initialized in {init_time_ms:.1f} ms")
    print("-" * 65)

    # Run Detection
    print("[TEST] Running Aerial Computer Vision Inference on Input Image...")
    raw_count, boxes, latency_ms = detector.detect(frame)
    raw_density = raw_count / area_sqm if area_sqm > 0 else 0.0

    # Saturation Check & Spatial Grid Override
    from saturation_detector import SaturationDetector
    from density_override import DensityOverrideEngine
    sat_detector = SaturationDetector(grid_cols=16, grid_rows=16)
    override_engine = DensityOverrideEngine()

    grid_result = sat_detector.analyze_spatial_grid(
        frame,
        boxes=boxes,
        area_sqm=area_sqm,
        override_engine=override_engine,
        zone_polygon=config.ZONE_POLYGONS.get("zone_1", None),
        zone_id="zone_1",
    )

    is_saturated = grid_result["is_saturated"]
    effective_count = grid_result["effective_count"]
    effective_density = grid_result["effective_density"]
    saturated_cells = grid_result["saturated_cells"]
    density_source = "override_live" if is_saturated else "detection"

    print("\n[RESULTS] --- DETECTION & DENSITY RESULTS ---")
    print(f"  Total Headcount    : {effective_count} people (Raw YOLO={raw_count})")
    print(f"  Processing Latency : {latency_ms:.1f} ms")
    print(f"  Crowd Density      : {effective_density:.2f} people / m2")
    print(f"  Density Source     : {density_source.upper()}")
    print(f"  Saturation Status  : {'SATURATED (FALLBACK ACTIVE)' if is_saturated else 'NOMINAL'}")
    print(f"  Saturated Patches  : {len(saturated_cells)} grid patches filled by texture proxy")
    print(f"  Saturated Area     : {grid_result['saturated_area_ratio'] * 100:.1f}% of zone")

    if raw_count > 0:
        confs = [b[4] for b in boxes]
        avg_conf = sum(confs) / len(confs)
        max_conf = max(confs)
        min_conf = min(confs)
        print(f"  Conf Stats         : Avg={avg_conf:.3f} | Min={min_conf:.3f} | Max={max_conf:.3f}")

    # Annotate Frame: Render continuous aerial crowd density heatmap overlay
    final_output = sat_detector.annotate_density_heatmap(
        frame=frame,
        boxes=boxes,
        saturated_cells=saturated_cells,
        area_sqm=area_sqm,
        effective_count=effective_count,
        effective_density=effective_density,
        density_source=density_source,
        is_saturated=is_saturated,
        latency_ms=latency_ms,
        show_hud_legend=True,
        show_top_badge=True,
        show_pinpoint_dots=True,
        zone_polygon=config.ZONE_POLYGONS.get("zone_1", None),
        zone_id="zone_1",
    )

    # Save output image
    cv2.imwrite(output_path, final_output)
    print(f"\n[OK] Saved Annotated Image : {os.path.abspath(output_path)}")
    print("=" * 65)

    if show_window:
        try:
            cv2.imshow("Drone CV Detection Result", final_output)
            print("Press any key in the image window to exit...")
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        except Exception as e:
            print(f"(Note: OpenCV window display unavailable: {e})")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="CrowdSense Standalone Drone View Computer Vision Test Harness"
    )
    parser.add_argument(
        "-i", "--image", type=str, required=True, help="Path to input image file (e.g. aerial_crowd.jpg)"
    )
    parser.add_argument(
        "-o", "--output", type=str, default="detected_drone_output.jpg", help="Path to output annotated image file"
    )
    parser.add_argument(
        "--conf", type=float, default=0.06, help="Aerial drone confidence floor (default: 0.06)"
    )
    parser.add_argument(
        "--area", type=float, default=250.0, help="Physical ground area in m2 for density (default: 250.0)"
    )
    parser.add_argument(
        "--model", type=str, default=None, help="Path to custom model weights file (.pt)"
    )
    parser.add_argument(
        "--no-sahi", action="store_true", help="Disable SAHI sliced tiling inference"
    )
    parser.add_argument(
        "--show", action="store_true", help="Display result in GUI popup window"
    )

    args = parser.parse_args()

    test_drone_image(
        image_path=args.image,
        output_path=args.output,
        conf_thresh=args.conf,
        area_sqm=args.area,
        model_path=args.model,
        use_sahi=not args.no_sahi,
        show_window=args.show,
    )


if __name__ == "__main__":
    main()
