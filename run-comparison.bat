@echo off
echo ========================================
echo Setting up Old vs New Build Comparison
echo ========================================
echo.

cd frontend

REM Check if dist-old exists
if not exist "dist-old" (
    echo [1/4] Backing up old dist folder...
    mkdir dist-old
    xcopy /E /I /Y dist dist-old >nul 2>&1
    echo      ✓ Old build backed up to dist-old/
) else (
    echo [1/4] dist-old already exists, skipping backup
)

echo.
echo [2/4] Building new version...
call npm run build
echo      ✓ New build created in dist/

echo.
echo [3/4] Starting HTTP servers...
echo.

REM Check if http-server is installed
where http-server >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  http-server not found!
    echo.
    echo Installing http-server globally...
    call npm install -g http-server
    echo      ✓ http-server installed
)

echo.
echo Starting servers...
echo - Old build: http://localhost:8080
echo - New build: http://localhost:8081
echo.

REM Start old build server
start "Old Build - Port 8080" cmd /k "cd dist-old && http-server -p 8080 -P http://localhost:3010"

REM Wait 2 seconds
timeout /t 2 >nul

REM Start new build server  
start "New Build - Port 8081" cmd /k "cd dist && http-server -p 8081 -P http://localhost:3010"

REM Wait for servers to start
timeout /t 3 >nul

echo.
echo ========================================
echo ✅ Servers are running!
echo ========================================
echo.
echo 📱 Old Build: http://localhost:8080
echo 🎨 New Build: http://localhost:8081
echo.
echo ⚙️  Make sure backend is running:
echo    node server.js
echo.
echo [4/4] Opening subscription pages...
echo.

REM Open both pages in browser
start http://localhost:8080/user/subscription
timeout /t 1 >nul
start http://localhost:8081/user/subscription

echo.
echo ========================================
echo 🎉 Ready to Compare!
echo ========================================
echo.
echo Left Tab:  Old Design (port 8080)
echo Right Tab: New Design (port 8081)
echo.
echo To stop servers:
echo - Close the terminal windows
echo - Or press Ctrl+C in each terminal
echo.
pause
