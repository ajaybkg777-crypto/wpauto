# WaAuto - Development Server Starter Script

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       WaAuto - WhatsApp Automation SaaS Platform           ║" -ForegroundColor Cyan
Write-Host "║           Development Environment Starter                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Colors
$success = "Green"
$error = "Red"
$info = "Cyan"
$warning = "Yellow"

# Function to kill port
function Stop-Port([int]$port) {
    try {
        $process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $process.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "✓ Killed process on port $port" -ForegroundColor $success
            Start-Sleep -Milliseconds 500
        }
    }
    catch {
        # Port not in use
    }
}

# Stop any existing processes
Write-Host "Cleaning up existing processes..." -ForegroundColor $info
Stop-Port 5000
Stop-Port 5173

Write-Host ""
Write-Host "Starting WaAuto Development Servers..." -ForegroundColor $info
Write-Host ""

# Start Backend
Write-Host "1️⃣  Starting Backend Server (Port 5000)..." -ForegroundColor $info
Push-Location backend
Start-Process powershell -ArgumentList "-NoExit -Command `"npm run dev`"" -WindowStyle Normal
Pop-Location

Write-Host ""
Write-Host "⏳ Waiting 5 seconds for backend to start..." -ForegroundColor $warning
Start-Sleep -Seconds 5

# Start Frontend
Write-Host "2️⃣  Starting Frontend Dev Server (Port 5173)..." -ForegroundColor $info
Push-Location frontend
Start-Process powershell -ArgumentList "-NoExit -Command `"npm run dev`"" -WindowStyle Normal
Pop-Location

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                 ✅ Servers Starting...                      ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Backend API: http://localhost:5000" -ForegroundColor $success
Write-Host "📍 Frontend: http://localhost:5173" -ForegroundColor $success
Write-Host ""
Write-Host "🔑 Test Credentials:" -ForegroundColor $info
Write-Host "   Email: admin@waauto.com" -ForegroundColor $info
Write-Host "   Password: use ADMIN_PASSWORD from backend\.env" -ForegroundColor $info
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor $info
Write-Host "   • README.md - Full documentation" -ForegroundColor $info
Write-Host "   • QUICK_START.md - Setup guide" -ForegroundColor $info
Write-Host ""
Write-Host "✨ Servers are running in separate windows" -ForegroundColor $success
Write-Host "⏹️  Close the windows to stop servers" -ForegroundColor $warning
