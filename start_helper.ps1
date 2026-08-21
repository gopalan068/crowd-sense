# start_helper.ps1 — Called by start.bat; handles paths with spaces cleanly.
# PowerShell has no quoting issues with paths containing spaces.
#
# Usage (from start.bat):
#   powershell -NoProfile -ExecutionPolicy Bypass -File start_helper.ps1

param(
    [string]$RepoRoot = $PSScriptRoot
)

# Sanitize: strip trailing backslash or stray quote that %~dp0 in cmd may append
$RepoRoot = $RepoRoot.TrimEnd('\', '"', ' ')


$backend  = Join-Path $RepoRoot "backend"
$frontend = Join-Path $RepoRoot "frontend"
$cv       = Join-Path $RepoRoot "cv-service"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Wait-Backend {
    Write-Host "[CrowdSense] Waiting for backend on http://localhost:4000/health ..."
    while ($true) {
        try {
            $null = Invoke-RestMethod http://localhost:4000/health -TimeoutSec 2
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    Write-Host "[CrowdSense] Backend is healthy."
}

# ── 1. Backend ────────────────────────────────────────────────────────────────
Write-Host "[CrowdSense] Starting backend (Node/Express)..."
if (-not (Test-Path (Join-Path $backend "node_modules"))) {
    Write-Host "[Backend] node_modules not found - running npm install..."
    Push-Location $backend
    npm install
    Pop-Location
}
Start-Process cmd -ArgumentList "/k", "pushd `"$backend`" && node src/index.js" `
    -WindowStyle Normal

# ── 2. Wait for backend ───────────────────────────────────────────────────────
Wait-Backend

# ── 3. Frontend ───────────────────────────────────────────────────────────────
Write-Host "[CrowdSense] Starting frontend (Vite/React)..."
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "[Frontend] node_modules not found - running npm install..."
    Push-Location $frontend
    npm install
    Pop-Location
}
Start-Process cmd -ArgumentList "/k", "pushd `"$frontend`" && npm run dev" `
    -WindowStyle Normal

# ── 4. CV Service ─────────────────────────────────────────────────────────────
Write-Host "[CrowdSense] Starting CV service natively..."
Push-Location $cv

$venv    = Join-Path $cv ".venv"
$python  = Join-Path $venv "Scripts\python.exe"
$pip     = Join-Path $venv "Scripts\pip.exe"
$activate = Join-Path $venv "Scripts\activate.bat"

if (-not (Test-Path $venv)) {
    Write-Host "[CV] Creating virtual environment..."
    python -m venv $venv
    Write-Host "[CV] Installing dependencies (first time - takes a few minutes)..."
    & $pip install -r requirements.txt
}

$envFile = Join-Path $cv ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $cv ".env.example") $envFile
    Write-Host ""
    Write-Host "[CV] IMPORTANT: Edit cv-service\.env - set VIDEO_SOURCE and AREA_SQM."
    Write-Host "[CV]   VIDEO_SOURCE=0           for webcam"
    Write-Host "[CV]   VIDEO_SOURCE=sample.mp4  for a video file"
    Write-Host ""
}

$modelPath = Join-Path $cv "models\yolov8n.pt"
if (-not (Test-Path $modelPath)) {
    Write-Host "[CV] Downloading YOLOv8n weights..."
    & $python download_model.py
}

Write-Host ""
Write-Host "================================================================"
Write-Host " CrowdSense running:"
Write-Host "   Backend  ->  http://localhost:4000   (separate window)"
Write-Host "   Frontend ->  http://localhost:5173   (separate window)"
Write-Host "   CV       ->  this window  (Ctrl+C to stop)"
Write-Host "================================================================"
Write-Host ""

& $python main.py
