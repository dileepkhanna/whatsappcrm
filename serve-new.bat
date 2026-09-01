@echo off
echo ========================================
echo Starting NEW Build Server
echo ========================================
echo.
echo Port: 8081
echo URL: http://localhost:8081
echo.

cd frontend\dist

REM Check if http-server exists
where http-server >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Using http-server...
    http-server -p 8081 -P http://localhost:3010
) else (
    REM Try Python
    where python >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo Using Python http.server...
        python -m http.server 8081
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
