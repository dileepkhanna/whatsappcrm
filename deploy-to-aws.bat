@echo off
echo ========================================
echo  Deploy to AWS EC2 (Non-Interactive)
echo ========================================
echo.

set KEY_PATH=C:\Users\Asus\.ssh\ec2.pem
set EC2_IP=3.7.194.129
set EC2_USER=ec2-user
set PROJECT_PATH=/home/ec2-user/whatsappcrm

echo [1/3] Pushing code to GitHub...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to push to GitHub
    pause
    exit /b 1
)
echo [SUCCESS] Code pushed to GitHub
echo.

echo [2/3] Deploying to AWS (this may take a minute)...
echo.

REM Execute deployment commands on AWS in a single SSH session
ssh -i "%KEY_PATH%" -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=10 %EC2_USER%@%EC2_IP% "cd %PROJECT_PATH% && git pull origin main && npm install --production && pm2 restart whatsappcrm && pm2 status"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo  DEPLOYMENT SUCCESSFUL!
    echo ========================================
    echo.
    echo Your application has been deployed to AWS
    echo Check your website to verify changes
    echo.
) else (
    echo.
    echo [ERROR] Deployment failed
    echo.
    echo Troubleshooting:
    echo 1. Check your internet connection
    echo 2. Verify EC2 instance is running
    echo 3. Try manual deployment (see DEPLOY-TO-AWS.md)
    echo.
)

pause
