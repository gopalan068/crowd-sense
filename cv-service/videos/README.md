# Testing Real Crowd & Drone Video Files

Place custom crowd or drone overhead video files (`.mp4`, `.avi`, `.mov`) in this directory to test YOLOv8 person detection and OpenCV Optical Flow performance against actual crowd footage.

## Quick Start Commands

1. **Run Zone 1 with a real drone video:**
   ```bash
   python main.py --z1 videos/drone_rally.mp4
   ```

2. **Run Zone 2 (Emergency Corridor) with a real crowd video:**
   ```bash
   python main.py --z2 videos/corridor_dense.mp4
   ```

3. **Run both zones with real videos simultaneously:**
   ```bash
   python main.py --z1 videos/drone_rally.mp4 --z2 videos/corridor_dense.mp4
   ```

YOLOv8 and OpenCV Farneback Optical Flow process real video frames continuously, looping smoothly and emitting live density & flow metrics directly to the CrowdSense dashboard shell.
