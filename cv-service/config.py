"""
cv-service/config.py
All configuration is loaded from environment variables (or a .env file via dotenv).
Copy .env.example → .env and customise before running.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Video source
# ---------------------------------------------------------------------------
# "0" (or any digit string) → webcam index; anything else → file path.
# NOTE: Webcam is a native-run-only path. Docker does not reliably pass
# through USB/webcam devices on Mac/Windows (Docker Desktop limitation).
# Use VIDEO_SOURCE=path/to/file.mp4 when running inside Docker or CI.
VIDEO_SOURCE: str = os.getenv("VIDEO_SOURCE", "0")

# ---------------------------------------------------------------------------
# Backend endpoint
# ---------------------------------------------------------------------------
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:4000/api/density")

# ---------------------------------------------------------------------------
# Zone configuration — must match zone definitions expected by the backend
# ---------------------------------------------------------------------------
ZONE_ID: str = os.getenv("ZONE_ID", "zone_1")

# ZONE_TYPE controls downstream threshold logic in the backend.
# "general"  → standard density thresholds
# "corridor" → tighter thresholds (emergency corridors must stay clear)
# Default to "general"; override to "corridor" for Phase 3 multi-zone setup.
ZONE_TYPE: str = os.getenv("ZONE_TYPE", "general")

# Area in square metres — manually configured constant.
# No homography correction in Phase 1 (deliberate scope cut per §12 of blueprint).
# Measure or estimate the zone footprint and set this before a real deployment.
AREA_SQM: float = float(os.getenv("AREA_SQM", "20.0"))

# ---------------------------------------------------------------------------
# Frame sampling
# ---------------------------------------------------------------------------
# Process every Nth frame from the video source.
# Justification: YOLOv8n inference takes ~20–50 ms on CPU. At a typical
# 30 fps input stream, processing every frame requires ≥30 fps throughput —
# borderline on a developer laptop. Sampling every 5th frame yields ~6
# detections/sec, well within budget, while still producing multiple fresh
# readings per 1-second emission window.
FRAME_SAMPLE_RATE: int = int(os.getenv("FRAME_SAMPLE_RATE", "5"))

# ---------------------------------------------------------------------------
# Model path — local disk only, no network fallback
# ---------------------------------------------------------------------------
# Download once with:  python download_model.py
# The file is ~6 MB and should be committed (or cached) so venue wifi
# outages don't break the demo at the worst moment.
MODEL_PATH: str = os.getenv("MODEL_PATH", "models/yolov8n.pt")

# ---------------------------------------------------------------------------
# Emission interval
# ---------------------------------------------------------------------------
# How often (in seconds) to POST an aggregated reading to the backend.
EMIT_INTERVAL_SEC: float = float(os.getenv("EMIT_INTERVAL_SEC", "1.0"))
