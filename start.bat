@echo off
REM start.bat — Start all three services natively (NO Docker required)
REM Delegates to start_helper.ps1 which handles paths with spaces cleanly.
REM
REM  Backend:    Node.js  — opens in a new cmd window
REM  Frontend:   Node.js  — opens in a new cmd window
REM  CV Service: Python   — runs in THIS window (Ctrl+C to stop)
REM
REM Prerequisites:
REM   - Node.js 18+ in PATH  (check: node --version)
REM   - Python 3.10+ in PATH (check: python --version)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_helper.ps1" -RepoRoot "%~dp0"
