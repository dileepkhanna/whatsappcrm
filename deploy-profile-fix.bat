@echo off
echo ===================================
echo Deploying Profile Page Fix to AWS
echo ===================================
echo.

echo Building frontend...
cd frontend
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)
cd ..

echo.
echo Copying files to server...
scp -r frontend\dist\* ec2-user@eswarigroup.in:/home/ec2-user/whatsappcrm/frontend/dist/

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Files copied successfully!
    echo.
    echo Restarting PM2...
    ssh ec2-user@eswarigroup.in "pm2 restart whatsappcrm"
    echo.
    echo ===================================
    echo Deployment Complete!
    echo ===================================
    echo.
    echo Changes:
    echo 1. Fixed profile data visibility
    echo 2. Added password change functionality
    echo.
    echo Test at: https://eswarigroup.in/user/profile
) else (
    echo.
    echo Deployment failed!
    exit /b 1
)
