@echo off
title NX AI — Autonomous Windows Agent
echo ===============================================================
echo   NX AI — Autonomous Windows Agent (Powered by DevX_NX)
echo   "Kaam karo, verify karo, phir bolo"
echo ===============================================================
echo.
echo Checking Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

echo Starting NX AI Workstation on http://localhost:3000 ...
start "" http://localhost:3000
npm run dev
pause
