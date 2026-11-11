@echo off
title NX AI - Autonomous Windows Agent & Desktop Companion
echo ===============================================================
echo   NX AI Windows Autonomous Agent & Anime Desktop Companion v3.0
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

echo Starting NX AI Windows Agent on http://localhost:3000 ...
start "" http://localhost:3000
npm run dev
pause
