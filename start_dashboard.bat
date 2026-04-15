@echo off
TITLE Home Shopping Dashboard - ABAR
SET PORT=8001

echo ==================================================
echo   ABAR Home Shopping P^&L Dashboard
echo ==================================================
echo.
echo [1/3] Checking Node.js installation...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js to run this dashboard.
    pause
    exit /b
)

echo [2/3] Starting server on port %PORT%...
start http://localhost:%PORT%
node server.js

if %errorlevel% neq 0 (
    echo [ERROR] Failed to start server.
    pause
)

echo.
echo ==================================================
pause
