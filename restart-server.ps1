# Server Restart Script for WhatsCRM
# This will stop the current server and restart it to load middleware fixes

Write-Host "`n🔄 Restarting WhatsCRM Server..." -ForegroundColor Yellow
Write-Host "=" * 60 -ForegroundColor Gray

# Step 1: Stop existing Node processes
Write-Host "`n📍 Step 1: Stopping existing Node.js processes..." -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  ⏹ Stopping PID: $($_.Id) (Started: $($_.StartTime))" -ForegroundColor Gray
    }
    Stop-Process -Name node -Force
    Start-Sleep -Seconds 2
    Write-Host "✅ All Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host "⚠ No Node.js processes found running" -ForegroundColor Yellow
}

# Step 2: Verify processes stopped
Write-Host "`n📍 Step 2: Verifying cleanup..." -ForegroundColor Cyan
$remainingProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($remainingProcesses) {
    Write-Host "❌ Warning: Some Node.js processes still running" -ForegroundColor Red
    $remainingProcesses | ForEach-Object {
        Write-Host "  Still running: PID $($_.Id)" -ForegroundColor Red
    }
} else {
    Write-Host "✅ All processes cleaned up successfully" -ForegroundColor Green
}

# Step 3: Wait a moment for ports to be released
Write-Host "`n📍 Step 3: Waiting for ports to be released..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Write-Host "✅ Ports should now be available" -ForegroundColor Green

# Step 4: Instructions to restart
Write-Host "`n📍 Step 4: Ready to start server" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "`n🚀 Now run the following command to start the server:" -ForegroundColor Green
Write-Host "`n   node app.js" -ForegroundColor Yellow
Write-Host "`nOr if you have a start script:" -ForegroundColor Gray
Write-Host "`n   npm start" -ForegroundColor Yellow
Write-Host "`n=" * 60 -ForegroundColor Gray
Write-Host "`n💡 After server starts, run this to test agent login:" -ForegroundColor Cyan
Write-Host "`n   .\test-agent-after-restart.ps1" -ForegroundColor Yellow
Write-Host "`n" -ForegroundColor Gray
