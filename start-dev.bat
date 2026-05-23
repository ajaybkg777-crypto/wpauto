@echo off
REM WaAuto - Development Server Starter (Windows Batch)
REM This batch file starts both backend and frontend servers

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║       WaAuto - WhatsApp Automation SaaS Platform           ║
echo ║           Development Environment Starter                 ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Kill processes on ports 5000 and 5173
echo Cleaning up existing processes...
netstat -ano | findstr :5000 >nul
if !errorlevel! equ 0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do taskkill /pid %%a /f >nul 2>&1
    echo ✓ Killed process on port 5000
)

netstat -ano | findstr :5173 >nul
if !errorlevel! equ 0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /pid %%a /f >nul 2>&1
    echo ✓ Killed process on port 5173
)

echo.
echo Starting WaAuto Development Servers...
echo.

REM Start Backend
echo 1️⃣  Starting Backend Server ^(Port 5000^)...
start "WaAuto Backend" cmd /k "cd backend && npm run dev"

echo.
echo ⏳ Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak >nul

REM Start Frontend
echo 2️⃣  Starting Frontend Dev Server ^(Port 5173^)...
start "WaAuto Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                 ✅ Servers Starting...                      ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 📍 Backend API: http://localhost:5000
echo 📍 Frontend: http://localhost:5173
echo.
echo 🔑 Test Credentials:
echo    Email: admin@waauto.com
echo    Password: admin123
echo.
echo 📚 Documentation:
echo    • README.md - Full documentation
echo    • QUICK_START.md - Setup guide
echo.
echo ✨ Servers are running in separate windows
echo ⏹️  Close the windows to stop servers
echo.
pause
