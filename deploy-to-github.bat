@echo off
echo ========================================
echo  WhatsCRM - Deploy to GitHub
echo ========================================
echo.

echo [1/3] Checking Git status...
git status --short
echo.

echo [2/3] Pushing to GitHub...
git push origin main
echo.

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Code pushed to GitHub successfully!
    echo.
    echo Next steps:
    echo 1. SSH into your AWS server
    echo 2. Run: cd /path/to/whatscrm
    echo 3. Run: git pull origin main
    echo 4. Run: npm install --production
    echo 5. Run: pm2 restart whatscrm
    echo.
    echo See DEPLOY-TO-AWS.md for complete guide
) else (
    echo [ERROR] Failed to push to GitHub
    echo.
    echo Troubleshooting:
    echo - Check your internet connection
    echo - Verify GitHub credentials
    echo - Try: git push origin main --force
)

echo.
pause
