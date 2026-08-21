"""
cv-service/stream_server.py
High-Definition MJPEG HTTP Streaming Server for CrowdSense Dashboard Video Feed.

Serves live HD processed frames at:
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
    """Encode BGR frame as high-quality HD JPEG and update LATEST_FRAMES buffer."""
    if frame is None or frame.size == 0:
        return
    
    # Preserve high-definition crisp preview (1280px width max for crisp drone clarity)
    h, w = frame.shape[:2]
    if w > 1280:
        target_h = int(1280 * (h / w))
        preview = cv2.resize(frame, (1280, target_h), interpolation=cv2.INTER_AREA)
    else:
        preview = frame

    # High JPEG quality (92%) to preserve small overhead crowd details
    ret, jpeg = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
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
                
                time.sleep(0.04)  # ~25 FPS crisp HD stream cap
        except (ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, format, *args) -> None:
        return


def start_stream_server(host: str = "0.0.0.0", port: int = 5001) -> threading.Thread:
    server = ThreadedHTTPServer((host, port), MJPEGStreamHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[StreamServer] Live HD Video Feeds active → http://localhost:{port}/stream/zone_1 & zone_2")
    return thread
