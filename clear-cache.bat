@echo off
echo ======================================
echo  Clearing All Caches and Rebuilding
echo ======================================
echo.

echo [1/5] Stopping Vite dev server (if running)...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *vite*" 2>nul
timeout /t 2 /nobreak >nul

echo [2/5] Clearing Vite cache...
cd frontend
if exist node_modules\.vite (
    rmdir /s /q node_modules\.vite
    echo Vite cache deleted.
) else (
    echo No Vite cache found.
)

echo [3/5] Clearing dist folder...
if exist dist (
    rmdir /s /q dist
    echo Dist folder deleted.
) else (
    echo No dist folder found.
)

echo [4/5] Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo [5/5] Starting fresh dev server...
echo.
echo ======================================
echo  Cache Cleared! Starting Dev Server
echo ======================================
echo.
echo IMPORTANT: In your browser, press Ctrl+Shift+Delete
echo and clear "Cached images and files" before loading.
echo.
echo Or use Incognito mode: Ctrl+Shift+N
echo.

npm run dev
