"""
cv-service/test_cv_web.py
Interactive Browser Web Harness for Direct Drone View Image Testing.

Starts a web server at http://localhost:5002
Allows uploading any image file directly via drag-and-drop or file selector,
tweaking aerial detection parameters in real time, and viewing the processed output.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
import cv2
import numpy as np

# Ensure local imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from detector import PersonDetector

# Cache loaded detectors by model path to prevent re-initialization overhead
DETECTORS: dict[str, PersonDetector] = {}

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CrowdSense - Drone View CV Image Tester</title>
    <style>
        :root {
            --bg-dark: #0f172a;
            --card-bg: #1e293b;
            --border-color: #334155;
            --accent-blue: #38bdf8;
            --accent-emerald: #10b981;
            --text-bright: #f8fafc;
            --text-dim: #94a3b8;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-bright);
        }

        header {
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border-color);
            padding: 16px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        h1 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--accent-blue);
        }

        .badge {
            background: #0284c7;
            color: white;
            font-size: 0.7rem;
            padding: 2px 8px;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .container {
            display: grid;
            grid-template-columns: 360px 1fr;
            gap: 24px;
            padding: 24px;
            max-width: 1600px;
            margin: 0 auto;
        }

        .panel {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
        }

        .panel-title {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 16px;
        }

        .upload-box {
            border: 2px dashed var(--border-color);
            border-radius: 8px;
            padding: 32px 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            background: rgba(15, 23, 42, 0.4);
        }

        .upload-box:hover, .upload-box.dragover {
            border-color: var(--accent-blue);
            background: rgba(56, 189, 248, 0.05);
        }

        .upload-icon {
            font-size: 2.5rem;
            margin-bottom: 12px;
        }

        .control-group {
            margin-top: 20px;
        }

        label {
            display: block;
            font-size: 0.85rem;
            color: var(--text-dim);
            margin-bottom: 6px;
        }

        input[type="range"], input[type="number"], select {
            width: 100%;
            background: #0f172a;
            border: 1px solid var(--border-color);
            color: var(--text-bright);
            padding: 8px 12px;
            border-radius: 6px;
            box-sizing: border-box;
        }

        .toggle-group {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 14px;
        }

        .btn-analyze {
            width: 100%;
            margin-top: 24px;
            padding: 12px;
            background: linear-gradient(135deg, #0284c7, #2563eb);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .btn-analyze:hover {
            opacity: 0.9;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: #0f172a;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
        }

        .stat-val {
            font-size: 1.8rem;
            font-weight: 700;
            color: var(--accent-emerald);
        }

        .stat-lbl {
            font-size: 0.75rem;
            color: var(--text-dim);
            text-transform: uppercase;
            margin-top: 4px;
        }

        .image-display {
            background: #0f172a;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            min-height: 500px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .image-display img {
            max-width: 100%;
            height: auto;
            display: block;
            border-radius: 4px;
        }

        .placeholder-text {
            color: var(--text-dim);
            font-size: 0.95rem;
        }

        .spinner {
            display: none;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-top: 4px solid var(--accent-blue);
            border-radius: 50%;
            width: 36px;
            height: 36px;
            animation: spin 0.8s linear infinite;
            margin-bottom: 12px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <header>
        <h1>🚁 Drone View Computer Vision Tester <span class="badge">Standalone</span></h1>
        <div style="font-size: 0.85rem; color: var(--text-dim);">CrowdSense Aerial AI Engine</div>
    </header>

    <div class="container">
        <!-- Left Sidebar Controls -->
        <div class="panel">
            <div class="panel-title">1. Provide Drone Image</div>
            
            <div class="upload-box" id="dropZone" onclick="document.getElementById('fileInput').click()">
                <div class="upload-icon">📸</div>
                <div style="font-size: 0.9rem; font-weight: 600;">Click or Drag & Drop Image</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;" id="fileInfo">Supports JPG, PNG, WEBP</div>
                <input type="file" id="fileInput" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">
            </div>

            <div class="control-group" style="margin-top: 24px;">
                <div class="panel-title">2. Aerial Parameters</div>
                
                <label>Aerial Confidence Floor: <strong id="confVal">0.06</strong></label>
                <input type="range" id="confSlider" min="0.01" max="0.40" step="0.01" value="0.06" oninput="document.getElementById('confVal').innerText = this.value">

                <div class="toggle-group">
                    <label style="margin:0;">SAHI Sliced Tiling</label>
                    <input type="checkbox" id="sahiCheck" checked>
                </div>

                <div class="toggle-group">
                    <label style="margin:0;">Circular Head Feature Detection</label>
                    <input type="checkbox" id="circularCheck" checked>
                </div>

                <div style="margin-top: 14px;">
                    <label>Physical Zone Area (m²)</label>
                    <input type="number" id="areaInput" value="250" min="1" step="1">
                </div>
            </div>

            <button class="btn-analyze" onclick="runDetection()">⚡ Analyze Image Now</button>
        </div>

        <!-- Right Side Visualization & Stats -->
        <div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-val" id="statCount">--</div>
                    <div class="stat-lbl">People Detected</div>
                </div>
                <div class="stat-card">
                    <div class="stat-val" id="statDensity" style="color: #38bdf8;">--</div>
                    <div class="stat-lbl">Density (p / m²)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-val" id="statLatency" style="color: #f59e0b;">--</div>
                    <div class="stat-lbl">Latency (ms)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-val" id="statRes" style="color: #a855f7; font-size: 1.3rem;">--</div>
                    <div class="stat-lbl">Image Size</div>
                </div>
            </div>

            <div class="panel">
                <div class="panel-title">Detection Result Visualization</div>
                <div class="image-display" id="imageDisplay">
                    <div style="text-align: center;" id="placeholderState">
                        <div class="spinner" id="loadingSpinner"></div>
                        <div class="placeholder-text" id="spinnerText">Upload or select an image on the left and click "Analyze Image Now"</div>
                    </div>
                    <img id="resultImg" style="display: none;" alt="Detection Output">
                </div>
            </div>
        </div>
    </div>

    <script>
        let selectedFile = null;

        const dropZone = document.getElementById('dropZone');
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

        ['dragenter', 'dragover'].forEach(name => dropZone.classList.add('dragover'));
        ['dragleave', 'drop'].forEach(name => dropZone.classList.remove('dragover'));

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                selectedFile = files[0];
                document.getElementById('fileInfo').innerText = "Selected: " + selectedFile.name;
                previewLocalFile(selectedFile);
            }
        });

        function handleFileSelect(event) {
            const files = event.target.files;
            if (files.length > 0) {
                selectedFile = files[0];
                document.getElementById('fileInfo').innerText = "Selected: " + selectedFile.name;
                previewLocalFile(selectedFile);
            }
        }

        function previewLocalFile(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.getElementById('resultImg');
                img.src = e.target.result;
                img.style.display = 'block';
                document.getElementById('placeholderState').style.display = 'none';
            };
            reader.readAsDataURL(file);
        }

        async function runDetection() {
            if (!selectedFile) {
                alert("Please select or drop an input image first!");
                return;
            }

            document.getElementById('placeholderState').style.display = 'block';
            document.getElementById('loadingSpinner').style.display = 'inline-block';
            document.getElementById('spinnerText').innerText = "Running Drone Aerial Vision Inference...";
            document.getElementById('resultImg').style.opacity = '0.5';

            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('conf', document.getElementById('confSlider').value);
            formData.append('sahi', document.getElementById('sahiCheck').checked ? 'true' : 'false');
            formData.append('circular', document.getElementById('circularCheck').checked ? 'true' : 'false');
            formData.append('area', document.getElementById('areaInput').value);

            try {
                const response = await fetch('/api/detect', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (data.error) {
                    alert("Detection error: " + data.error);
                    return;
                }

                document.getElementById('statCount').innerText = data.count;
                document.getElementById('statDensity').innerText = data.density.toFixed(2);
                document.getElementById('statLatency').innerText = data.latency_ms.toFixed(1);
                document.getElementById('statRes').innerText = data.width + 'x' + data.height;

                const img = document.getElementById('resultImg');
                img.src = data.annotated_image;
                img.style.display = 'block';
                img.style.opacity = '1.0';
                document.getElementById('placeholderState').style.display = 'none';

            } catch (err) {
                alert("Failed to analyze image: " + err);
            } finally {
                document.getElementById('loadingSpinner').style.display = 'none';
            }
        }
    </script>
</body>
</html>
"""


def parse_multipart_body(body_bytes: bytes, boundary: str) -> tuple[bytes | None, dict[str, str]]:
    boundary_bytes = ("--" + boundary).encode("ascii")
    parts = body_bytes.split(boundary_bytes)

    image_bytes = None
    params = {}

    for part in parts:
        if not part or part.startswith(b"--"):
            continue

        header_end = part.find(b"\r\n\r\n")
        if header_end == -1:
            continue

        header_bytes = part[:header_end]
        content = part[header_end + 4:]
        if content.endswith(b"\r\n"):
            content = content[:-2]

        header_text = header_bytes.decode("utf-8", errors="replace")

        if 'name="image"' in header_text:
            image_bytes = content
        else:
            match = re.search(r'name="([^"]+)"', header_text)
            if match:
                field_name = match.group(1)
                params[field_name] = content.decode("utf-8", errors="replace").strip()

    return image_bytes, params


class WebTesterHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(HTML_PAGE.encode("utf-8"))))
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode("utf-8"))
        else:
            self.send_error(404, "Not Found")

    def do_POST(self) -> None:
        if self.path == "/api/detect":
            try:
                content_type = self.headers.get("Content-Type", "")
                if "multipart/form-data" not in content_type:
                    self.send_json_error("Expected multipart/form-data image upload", 400)
                    return

                match = re.search(r'boundary=([^\s;]+)', content_type)
                if not match:
                    self.send_json_error("Missing boundary in Content-Type header", 400)
                    return

                boundary = match.group(1).strip('"')

                content_length = int(self.headers.get("Content-Length", "0"))
                body_bytes = self.rfile.read(content_length)

                image_bytes, params = parse_multipart_body(body_bytes, boundary)

                if not image_bytes:
                    self.send_json_error("Missing 'image' file field in request", 400)
                    return

                # Parse parameters
                conf_val = float(params.get("conf", "0.06"))
                use_sahi = params.get("sahi", "true").lower() == "true"
                use_circular = params.get("circular", "true").lower() == "true"
                area_sqm = float(params.get("area", "250.0"))

                # Decode image bytes
                nparr = np.frombuffer(image_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if frame is None or frame.size == 0:
                    self.send_json_error("Invalid or corrupted image format", 400)
                    return

                h, w, c = frame.shape

                # Configure and run detector
                os.environ["CONF_THRESH_DRONE"] = str(conf_val)
                os.environ["USE_SAHI"] = "true" if use_sahi else "false"

                model_path = "models/yolov8n-visdrone.pt" if os.path.exists("models/yolov8n-visdrone.pt") else "models/yolov8n.pt"

                if model_path not in DETECTORS:
                    DETECTORS[model_path] = PersonDetector(model_path=model_path, camera_type="drone")

                detector = DETECTORS[model_path]
                detector.conf_threshold = conf_val
                detector.enable_circular_heads = use_circular

                count, boxes, latency_ms = detector.detect(frame)
                density = count / area_sqm if area_sqm > 0 else 0.0

                annotated = detector.annotate(frame, boxes)

                # Encode annotated output as JPEG base64
                ret, buffer = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                base64_str = base64.b64encode(buffer).decode("utf-8")
                data_url = f"data:image/jpeg;base64,{base64_str}"

                resp = {
                    "count": count,
                    "density": round(density, 3),
                    "latency_ms": round(latency_ms, 1),
                    "width": w,
                    "height": h,
                    "annotated_image": data_url,
                }

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                body = json.dumps(resp).encode("utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            except Exception as err:
                self.send_json_error(str(err), 500)
        else:
            self.send_error(404, "Endpoint not found")

    def send_json_error(self, message: str, status_code: int) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args) -> None:
        return


def start_server(port: int = 5002) -> None:
    server = HTTPServer(("0.0.0.0", port), WebTesterHandler)
    print("=" * 65)
    print("🚁 Drone View Computer Vision Interactive Web Tester Active!")
    print(f"👉 Open in Browser: http://localhost:{port}")
    print("=" * 65)
    server.serve_forever()


if __name__ == "__main__":
    start_server(5002)
