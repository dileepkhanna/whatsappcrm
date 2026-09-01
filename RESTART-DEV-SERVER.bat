@echo off
echo ========================================
echo Restarting Frontend Dev Server
echo ========================================
echo.

echo Step 1: Killing existing dev servers...
taskkill /F /IM node.exe 2>nul
timeout /t 2 >nul

echo.
echo Step 2: Starting frontend dev server...
cd frontend
start "WhatsApp CRM - Dev Server" cmd /k "npm run dev"

echo.
echo ========================================
echo Dev server is starting...
echo Wait for "Local: http://localhost:5173" message
echo Then restart ngrok: ngrok http 5173
echo ========================================
pause
