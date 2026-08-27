@echo off
echo ========================================
echo Checking AWS Server Status
echo ========================================
echo.

REM Quick status check
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 "cd /home/ec2-user/whatsappcrm && pm2 status && echo '' && echo 'Recent logs:' && pm2 logs whatsappcrm --lines 20 --nostream"

echo.
pause
