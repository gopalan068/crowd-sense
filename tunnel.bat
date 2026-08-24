@echo off
setlocal

REM ================================================================
REM  CrowdSense ngrok Public Tunnel Generator
REM ================================================================
set NGROK_DOMAIN=gallery-harddisk-stuffy.ngrok-free.dev

if "%NGROK_DOMAIN%"=="" (
    echo ================================================================
    echo  ngrok Setup Required
    echo ================================================================
    echo  Please enter your free ngrok static domain name.
    echo  Example: fancy-lion-12.ngrok-free.app
    echo ================================================================
    echo.
    set /p NGROK_DOMAIN="Enter your ngrok static domain: "
)

if "%NGROK_DOMAIN%"=="" (
    echo Error: No domain specified. Exiting...
    pause
    exit /b 1
)

REM Strip any leading https:// or http:// if present
set NGROK_DOMAIN=%NGROK_DOMAIN:https://=%
set NGROK_DOMAIN=%NGROK_DOMAIN:http://=%
set NGROK_DOMAIN=%NGROK_DOMAIN:/=%

echo.
echo ================================================================
echo  CrowdSense ngrok Public Tunnel
echo  Static Domain: https://%NGROK_DOMAIN%
echo ================================================================
echo  [1] Ops Dashboard     (Port 5173 - Default)
echo  [2] Field Mobile Sim  (Port 5174)
echo  [3] Backend API       (Port 4000)
echo ================================================================
echo.

set CHOICE=1
set /p CHOICE="Select service to expose [1, 2, or 3] (Default: 1): "

if "%CHOICE%"=="2" (
    set PORT=5174
    set SERVICE=Field Mobile Sim
) else if "%CHOICE%"=="3" (
    set PORT=4000
    set SERVICE=Backend API
) else (
    set PORT=5173
    set SERVICE=Ops Dashboard
)

echo.
echo ================================================================
echo  Starting ngrok tunnel for %SERVICE% on Port %PORT% ...
echo  Public URL: https://%NGROK_DOMAIN%
echo ================================================================
echo.

npx ngrok http %PORT% --url=https://%NGROK_DOMAIN%

pause
