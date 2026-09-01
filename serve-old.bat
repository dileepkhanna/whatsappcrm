@echo off
echo ========================================
echo Starting OLD Build Server
echo ========================================
echo.
echo Port: 8080
echo URL: http://localhost:8080
echo.

cd frontend\dist-old

REM Check if http-server exists
where http-server >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Using http-server...
    http-server -p 8080 -P http://localhost:3010
) else (
    REM Try Python
    where python >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo Using Python http.server...
        python -m http.server 8080
    ) else (
        echo.
        echo ❌ No HTTP server found!
        echo.
        echo Please install one:
        echo   npm install -g http-server
        echo.
        pause
    )
)
