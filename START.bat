@echo off
echo ===================================================
echo       MEMORY PALACE 3D - STARTUP SCRIPT
echo ===================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/
    pause
    exit /b 1
)

echo [1/3] Starting Backend Server...
echo --------------------------------
cd backend
start cmd /k "title Memory Palace Backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

REM Wait a moment for backend to start
timeout /t 5 /nobreak > nul

echo [2/3] Starting Frontend Server...
echo --------------------------------
cd ..\frontend
start cmd /k "title Memory Palace Frontend && python -m http.server 3000"

REM Wait for servers to initialize
timeout /t 3 /nobreak > nul

echo [3/3] Opening Browser...
echo --------------------------------
start http://localhost:3000

echo.
echo ===================================================
echo       ALL SERVICES STARTED SUCCESSFULLY!
echo ===================================================
echo.
echo Backend API:  http://localhost:8000
echo Frontend UI:  http://localhost:3000
echo API Docs:     http://localhost:8000/docs
echo.
echo Press Ctrl+C in each terminal window to stop servers
echo.
pause