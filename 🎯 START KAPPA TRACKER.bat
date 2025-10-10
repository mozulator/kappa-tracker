@echo off
title OBS Kappa Tracker Launcher

:: Change to the script directory
cd /d "%~dp0"

:: Try PowerShell version first (better experience)
where powershell >nul 2>&1
if not errorlevel 1 (
    powershell -ExecutionPolicy Bypass -File "start-kappa-tracker.ps1"
) else (
    :: Fallback to batch version
    call "start-kappa-tracker.bat"
)