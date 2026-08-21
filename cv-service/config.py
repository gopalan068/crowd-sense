"""
cv-service/config.py
All configuration is loaded from environment variables (or a .env file via dotenv).
"""
import os
from dotenv import load_dotenv

load_dotenv()

VIDEO_SOURCE: str = os.getenv("VIDEO_SOURCE", "0")
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:4000/api/density")
ZONE_ID: str = os.getenv("ZONE_ID", "zone_1")
ZONE_TYPE: str = os.getenv("ZONE_TYPE", "general")
AREA_SQM: float = float(os.getenv("AREA_SQM", "20.0"))
FRAME_SAMPLE_RATE: int = int(os.getenv("FRAME_SAMPLE_RATE", "5"))
MODEL_PATH: str = os.getenv("MODEL_PATH", "models/yolov8n.pt")
EMIT_INTERVAL_SEC: float = float(os.getenv("EMIT_INTERVAL_SEC", "1.0"))

# Phase 4 — Optical Flow Enable/Disable Switch (standardized across services)
ENABLE_OPTICAL_FLOW: bool = os.getenv("ENABLE_OPTICAL_FLOW", "true").lower() in ("true", "1", "yes")

# Per-zone focal point coordinates (X, Y) for flow_convergence
FOCAL_POINTS = {
    "zone_1": (320, 480),  # General zone: center bottom
    "zone_2": (540, 240),  # Corridor zone: egress exit right
}
