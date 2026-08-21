"""
cv-service/stream_server.py
Lightweight MJPEG HTTP Streaming Server for CrowdSense Dashboard Video Feed.

Serves live processed frames at:
  - http://localhost:5001/stream/zone_1
  - http://localhost:5001/stream/zone_2
"""
from __future__ import annotations

import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import threading
import cv2
import numpy as np

# In-memory latest encoded JPEG frames per zone
LATEST_FRAMES = {
    "zone_1": None,
    "zone_2": None,
}

LOCK = threading.Lock()


def update_zone_frame(zone_id: str, frame: np.ndarray) -> None:
    """Encode BGR frame as JPEG and update LATEST_FRAMES buffer."""
    if frame is None or frame.size == 0:
        return
    
    # Resize to standard preview size (640x360) for low bandwidth & high FPS
    h, w = frame.shape[:2]
    if w > 640:
        target_h = int(360 * (h / w))
        preview = cv2.resize(frame, (640, target_h))
    else:
        preview = frame

    ret, jpeg = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
    if ret:
        with LOCK:
            LATEST_FRAMES[zone_id] = jpeg.tobytes()


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in separate threads for simultaneous multi-zone streams."""
    daemon_threads = True


class MJPEGStreamHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path in ("/stream/zone_1", "/stream/zone_1/"):
            zone_id = "zone_1"
        elif self.path in ("/stream/zone_2", "/stream/zone_2/"):
            zone_id = "zone_2"
        else:
            self.send_error(404, "Stream not found. Use /stream/zone_1 or /stream/zone_2")
            return

        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                with LOCK:
                    frame_bytes = LATEST_FRAMES.get(zone_id)

                if frame_bytes is not None:
                    self.wfile.write(b"--frame\r\n")
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(frame_bytes)))
                    self.end_headers()
                    self.wfile.write(frame_bytes)
                    self.wfile.write(b"\r\n")
                
                time.sleep(0.06)  # ~15 FPS stream cap
        except (ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, format, *args) -> None:
        # Suppress HTTP access logging to keep terminal clean
        return


def start_stream_server(host: str = "0.0.0.0", port: int = 5001) -> threading.Thread:
    server = ThreadedHTTPServer((host, port), MJPEGStreamHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[StreamServer] Live MJPEG Video Feeds active → http://localhost:{port}/stream/zone_1 & zone_2")
    return thread
