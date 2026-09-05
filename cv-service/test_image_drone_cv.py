"""
cv-service/test_image_drone_cv.py
Standalone Aerial Drone Computer Vision Testing Harness for Direct Input Images.

Usage:
    python test_image_drone_cv.py --image path/to/drone_image.jpg
    python test_image_drone_cv.py -i input.png -o output.jpg --conf 0.06 --area 250

Features:
    - Direct image input & high-resolution aerial crowd detection
    - Drone Aerial Pipeline: Ultralytics YOLOv8 + SAHI Sliced Tiling + Circular Head Feature Detection
    - Outputs annotated image with head detection dots, headcount overlay, and latency stats
    - Prints detailed headcount, density (p/m²), and box coordinates to console
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
    use_circular_heads: bool = True,
    show_window: bool = False,
) -> None:
    if not os.path.exists(image_path):
        print(f"\n❌ Error: Input image file not found at '{image_path}'")
        sys.exit(1)

    print("\n" + "=" * 65)
    print("🚁 CrowdSense Aerial Drone View CV Testing Harness")
    print("=" * 65)
    print(f"📷 Input Image        : {image_path}")

    # Load input image
    frame = cv2.imread(image_path)
    if frame is None or frame.size == 0:
        print(f"❌ Error: Unable to decode image file '{image_path}'. Ensure it is a valid JPEG/PNG.")
        sys.exit(1)

    h, w, c = frame.shape
    print(f"📐 Image Resolution   : {w} x {h} px ({c} channels)")

    # Resolve model path
    if model_path is None:
        if os.path.exists("models/yolov8n-visdrone.pt"):
            model_path = "models/yolov8n-visdrone.pt"
        elif os.path.exists("yolov8n.pt"):
            model_path = "yolov8n.pt"
        else:
            model_path = "models/yolov8n.pt"

    print(f"🤖 Model Weights      : {model_path}")
    print(f"🎯 Confidence Floor   : {conf_thresh} ({conf_thresh * 100:.1f}%)")
    print(f"🧩 SAHI Sliced Tiling : {'ENABLED' if use_sahi else 'DISABLED'}")
    print(f"⭕ Head Geometry Det  : {'ENABLED' if use_circular_heads else 'DISABLED'}")
    print(f"📐 Physical Area      : {area_sqm} m²")
    print("-" * 65)

    # Set environment variables for PersonDetector configuration override
    os.environ["CONF_THRESH_DRONE"] = str(conf_thresh)
    os.environ["USE_SAHI"] = "true" if use_sahi else "false"

    # Initialize Detector
    print("⏳ Initializing Drone AI Detector Pipeline...")
    init_start = time.monotonic()
    detector = PersonDetector(model_path=model_path, camera_type="drone")
    detector.enable_circular_heads = use_circular_heads
    detector.conf_threshold = conf_thresh
    init_time_ms = (time.monotonic() - init_start) * 1000.0
    print(f"✅ Detector Initialized in {init_time_ms:.1f} ms")
    print("-" * 65)

    # Run Detection
    print("🚀 Running Aerial Computer Vision Inference on Input Image...")
    count, boxes, latency_ms = detector.detect(frame)
    density = count / area_sqm if area_sqm > 0 else 0.0

    print("\n📊 --- DETECTION RESULTS ---")
    print(f"👥 Total Headcount     : {count} people detected")
    print(f"⚡ Processing Latency  : {latency_ms:.1f} ms")
    print(f"📊 Crowd Density       : {density:.2f} people / m²")

    if count > 0:
        confs = [b[4] for b in boxes]
        avg_conf = sum(confs) / len(confs)
        max_conf = max(confs)
        min_conf = min(confs)
        print(f"🎯 Conf Stats          : Avg={avg_conf:.3f} | Min={min_conf:.3f} | Max={max_conf:.3f}")

    # Annotate Frame
    annotated = detector.annotate(frame, boxes)

    # Draw Banner Overlay on Result Image
    banner_h = 70
    banner = np.zeros((banner_h, w, 3), dtype=np.uint8)
    banner[:] = (20, 24, 33)

    cv2.putText(
        banner,
        f"DRONE VIEW CV DETECTED: {count} PEOPLE | Density: {density:.2f} p/m2 | Latency: {latency_ms:.1f} ms",
        (15, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (56, 189, 248),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        banner,
        f"Conf Floor: {conf_thresh} | SAHI: {use_sahi} | Circular Heads: {use_circular_heads} | Input: {os.path.basename(image_path)}",
        (15, 55),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        (180, 190, 205),
        1,
        cv2.LINE_AA,
    )

    final_output = np.vstack([banner, annotated])

    # Save output image
    cv2.imwrite(output_path, final_output)
    print(f"\n💾 Saved Annotated Image : {os.path.abspath(output_path)}")
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
        "--area", type=float, default=250.0, help="Physical ground area in m² for density (default: 250.0)"
    )
    parser.add_argument(
        "--model", type=str, default=None, help="Path to custom model weights file (.pt)"
    )
    parser.add_argument(
        "--no-sahi", action="store_true", help="Disable SAHI sliced tiling inference"
    )
    parser.add_argument(
        "--no-circular", action="store_true", help="Disable OpenCV circular head feature detector"
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
        use_circular_heads=not args.no_circular,
        show_window=args.show,
    )


if __name__ == "__main__":
    main()
