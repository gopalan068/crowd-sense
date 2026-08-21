#!/usr/bin/env bash
# start.sh — Start all three services natively (NO Docker required)
#
#  Backend:    Node.js  — background process, logs to backend/backend.log
#  Frontend:   Node.js  — background process, logs to frontend/frontend.log
#  CV Service: Python   — runs in THIS terminal (Ctrl+C to stop all three)
#
# Prerequisites:
#   - Node.js 18+   in PATH  (check: node --version)
#   - Python 3.10+  in PATH  (check: python3 --version)
#   - npm install run once in backend/ and frontend/
#   - python download_model.py run once in cv-service/

set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Backend ───────────────────────────────────────────────────────────────
echo "[CrowdSense] Starting backend (Node/Express)..."
cd "$REPO_ROOT/backend"
if [ ! -d node_modules ]; then
    echo "[Backend] Installing node_modules..."
    npm install
fi
node src/index.js > backend.log 2>&1 &
BACKEND_PID=$!
echo "[Backend] PID $BACKEND_PID  (logs: backend/backend.log)"

# ── 2. Wait for backend health ───────────────────────────────────────────────
echo "[CrowdSense] Waiting for backend on http://localhost:4000/health ..."
until curl -sf http://localhost:4000/health > /dev/null 2>&1; do sleep 1; done
echo "[CrowdSense] Backend is healthy."

# ── 3. Frontend ──────────────────────────────────────────────────────────────
echo "[CrowdSense] Starting frontend (Vite/React)..."
cd "$REPO_ROOT/frontend"
if [ ! -d node_modules ]; then
    echo "[Frontend] Installing node_modules..."
    npm install
fi
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "[Frontend] PID $FRONTEND_PID  (logs: frontend/frontend.log)"

# ── 4. CV Service ────────────────────────────────────────────────────────────
echo "[CrowdSense] Starting CV service natively..."
cd "$REPO_ROOT/cv-service"

if [ ! -d ".venv" ]; then
    echo "[CV] Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "[CV] Installing dependencies (first time — takes a few minutes)..."
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "[CV] Created .env from .env.example — edit VIDEO_SOURCE and AREA_SQM if needed."
fi

if [ ! -f "models/yolov8n.pt" ]; then
    echo "[CV] Downloading YOLOv8n weights..."
    python download_model.py
fi

# ── Ctrl+C → kill all three ──────────────────────────────────────────────────
cleanup() {
    echo ""
    echo "[CrowdSense] Stopping all services..."
    kill "$BACKEND_PID"  2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    echo "[CrowdSense] Done."
    exit 0
}
trap cleanup INT TERM

echo ""
echo "================================================================"
echo " CrowdSense running:"
echo "   Backend   ->  http://localhost:4000  (PID $BACKEND_PID)"
echo "   Frontend  ->  http://localhost:5173  (PID $FRONTEND_PID)"
echo "   CV        ->  this terminal  (Ctrl+C stops all three)"
echo "================================================================"
echo ""

python main.py

