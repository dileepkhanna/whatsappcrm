@echo off
echo ========================================
echo  Connect to AWS EC2 Instance
echo ========================================
echo.

set KEY_PATH=C:\Users\Asus\.ssh\ec2.pem
set EC2_IP=3.7.194.129
set EC2_USER=ec2-user

echo Checking key file...
if not exist "%KEY_PATH%" (
    echo [ERROR] Key file not found: %KEY_PATH%
    pause
    exit /b 1
)

echo Connecting to %EC2_USER%@%EC2_IP%...
echo.
echo Tips if connection fails:
echo - Press Ctrl+C to cancel
echo - Check your internet connection
echo - Verify EC2 instance is running
echo - Check AWS Security Group allows SSH from your IP
echo.

REM Try connection with keep-alive settings
ssh -i "%KEY_PATH%" -o ServerAliveInterval=60 -o ServerAliveCountMax=3 %EC2_USER%@%EC2_IP%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Connection failed!
    echo.
    echo Troubleshooting:
    echo 1. Check if EC2 instance is running in AWS Console
    echo 2. Verify Security Group allows SSH (port 22) from your IP
    echo 3. Try: ssh -vvv -i "%KEY_PATH%" %EC2_USER%@%EC2_IP%
    echo.
)

pause
