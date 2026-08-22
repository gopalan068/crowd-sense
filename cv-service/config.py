"""
cv-service/config.py
All configuration is loaded from environment variables (or a .env file via dotenv).
"""
import os
from glob import glob
from dotenv import load_dotenv

load_dotenv()

# Automatically discover custom video in cv-service/videos/ if available
default_z1_video = "0"
video_files = glob("videos/*.mp4") + glob("videos/*.avi") + glob("videos/*.mov")
if video_files:
    default_z1_video = video_files[0].replace("\\", "/")

# Per-zone video sources (webcam index "0" or file path to real crowd video .mp4/.avi)
VIDEO_SOURCE_Z1: str = os.getenv("VIDEO_SOURCE_Z1", os.getenv("VIDEO_SOURCE", default_z1_video))
VIDEO_SOURCE_Z2: str = os.getenv("VIDEO_SOURCE_Z2", os.getenv("CORRIDOR_VIDEO_SOURCE", "models/sample_corridor.mp4"))

# Camera Perspective Modes: "drone" (overhead low-threshold + SAHI) vs "cctv" (angled high-threshold + full frame)
CAMERA_TYPE_Z1: str = os.getenv("CAMERA_TYPE_Z1", os.getenv("CAMERA_TYPE", "cctv" if "crowd_1" in VIDEO_SOURCE_Z1 else "drone")).lower()
CAMERA_TYPE_Z2: str = os.getenv("CAMERA_TYPE_Z2", "cctv").lower()

# Per-Zone Infrastructure Type: "corridor" (enclosed passage, tight 2.0 p/m² red alarm) vs "general" (open plaza)
ZONE_TYPE_Z1: str = os.getenv("ZONE_TYPE_Z1", os.getenv("ZONE_TYPE", "corridor" if CAMERA_TYPE_Z1 == "cctv" else "general")).lower()
ZONE_TYPE_Z2: str = os.getenv("ZONE_TYPE_Z2", "corridor").lower()

# Per-Zone Physical Location Area in Square Meters (m²)
AREA_SQM_Z1: float = float(os.getenv("AREA_SQM_Z1", os.getenv("AREA_SQM", "30.0" if ZONE_TYPE_Z1 == "corridor" else "250.0")))
AREA_SQM_Z2: float = float(os.getenv("AREA_SQM_Z2", "15.0"))

# Strict Mode-Specific Confidence Thresholds
CONF_THRESH_CCTV: float = float(os.getenv("CONF_THRESH_CCTV", "0.30"))
CONF_THRESH_DRONE: float = float(os.getenv("CONF_THRESH_DRONE", "0.06"))
CONF_THRESH: float = float(os.getenv("CONF_THRESH", "0.30"))

# Analysis Intervals per Camera Mode (Seconds between AI evaluation passes)
DRONE_ANALYSIS_INTERVAL_SEC: float = float(os.getenv("DRONE_ANALYSIS_INTERVAL_SEC", "3.0"))
CCTV_ANALYSIS_INTERVAL_SEC: float = float(os.getenv("CCTV_ANALYSIS_INTERVAL_SEC", "1.0"))

# Model Weights Selection: "visdrone" vs "coco"
MODEL_TYPE: str = os.getenv("MODEL_TYPE", "visdrone" if os.path.exists("models/yolov8n-visdrone.pt") else "coco").lower()

# SAHI Slicing Aided Hyper Inference Flags — Tuned for Ultra-Dense Drone Crowds
USE_SAHI: bool = os.getenv("USE_SAHI", "true").lower() in ("true", "1", "yes")
SAHI_SLICE_HEIGHT: int = int(os.getenv("SAHI_SLICE_HEIGHT", "320"))
SAHI_SLICE_WIDTH: int = int(os.getenv("SAHI_SLICE_WIDTH", "320"))
SAHI_OVERLAP_RATIO: float = float(os.getenv("SAHI_OVERLAP_RATIO", "0.20"))

# Tuned Aerial Inference Parameters
NMS_IOU_THRESH: float = float(os.getenv("NMS_IOU_THRESH", "0.60"))
INFERENCE_IMGSZ: int = int(os.getenv("INFERENCE_IMGSZ", "1280"))

BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:4000/api/density")
ZONE_ID: str = os.getenv("ZONE_ID", "zone_1")
ZONE_TYPE: str = ZONE_TYPE_Z1
AREA_SQM: float = AREA_SQM_Z1
MODEL_PATH: str = os.getenv("MODEL_PATH", "models/yolov8n-visdrone.pt" if MODEL_TYPE == "visdrone" else "models/yolov8n.pt")

ENABLE_OPTICAL_FLOW: bool = os.getenv("ENABLE_OPTICAL_FLOW", "true").lower() in ("true", "1", "yes")

# Focal Points (X, Y) pixel coordinates of the Egress Exit Door / Staircase in each video feed
FOCAL_POINTS = {
    "zone_1": (
        int(os.getenv("FOCAL_POINT_Z1_X", "320")),
        int(os.getenv("FOCAL_POINT_Z1_Y", "240")),
    ),
    "zone_2": (
        int(os.getenv("FOCAL_POINT_Z2_X", "540")),
        int(os.getenv("FOCAL_POINT_Z2_Y", "240")),
    ),
}
