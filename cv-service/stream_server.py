"""
cv-service/stream_server.py
Optimized Low-Bandwidth MJPEG HTTP Streaming Server for CrowdSense Dashboard Video Feed.

Serves live optimized processed frames at:
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
import config

# In-memory latest encoded JPEG frames and frame sequence counter per zone
LATEST_FRAMES = {
    "zone_1": {"bytes": None, "seq": 0},
    "zone_2": {"bytes": None, "seq": 0},
}

LOCK = threading.Lock()
FRAME_COUNTER = {"zone_1": 0, "zone_2": 0}


def update_zone_frame(zone_id: str, frame: np.ndarray) -> None:
    """Encode BGR frame as bandwidth-optimized JPEG and update LATEST_FRAMES buffer."""
    if frame is None or frame.size == 0:
        return

    stream_w = getattr(config, "STREAM_WIDTH", 640)
    stream_q = getattr(config, "STREAM_QUALITY", 70)

    # Resize to optimized dashboard preview width while maintaining aspect ratio
    h, w = frame.shape[:2]
    if w > stream_w:
        target_h = int(stream_w * (h / w))
        preview = cv2.resize(frame, (stream_w, target_h), interpolation=cv2.INTER_AREA)
    else:
        preview = frame

    # Balanced JPEG quality (default 70%) to preserve visual clarity with ~85% smaller payload
    ret, jpeg = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), stream_q])
    if ret:
        frame_bytes = jpeg.tobytes()
        with LOCK:
            FRAME_COUNTER[zone_id] = FRAME_COUNTER.get(zone_id, 0) + 1
            LATEST_FRAMES[zone_id] = {
                "bytes": frame_bytes,
                "seq": FRAME_COUNTER[zone_id],
            }


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
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()

        max_fps = max(1, min(30, getattr(config, "STREAM_MAX_FPS", 15)))
        frame_interval = 1.0 / max_fps
        last_sent_seq = -1

        try:
            while True:
                with LOCK:
                    zone_entry = LATEST_FRAMES.get(zone_id)
                    frame_bytes = zone_entry["bytes"] if zone_entry else None
                    curr_seq = zone_entry["seq"] if zone_entry else 0

                # Only transmit when a new frame is generated or on initial stream connection
                if frame_bytes is not None and curr_seq != last_sent_seq:
                    self.wfile.write(b"--frame\r\n")
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(frame_bytes)))
                    self.end_headers()
                    self.wfile.write(frame_bytes)
                    self.wfile.write(b"\r\n")
                    last_sent_seq = curr_seq

                time.sleep(frame_interval)
        except (ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, format, *args) -> None:
        return


def start_stream_server(host: str = "0.0.0.0", port: int = 5001) -> threading.Thread:
    server = ThreadedHTTPServer((host, port), MJPEGStreamHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    stream_w = getattr(config, "STREAM_WIDTH", 640)
    stream_q = getattr(config, "STREAM_QUALITY", 70)
    max_fps = getattr(config, "STREAM_MAX_FPS", 15)
    print(f"[StreamServer] Optimized Video Stream active -> http://localhost:{port}/stream/zone_1 & zone_2 ({stream_w}px @ Q={stream_q}%, Max {max_fps} FPS)")
    return thread

