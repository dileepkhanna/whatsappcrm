@echo off
echo ========================================
echo Restarting WhatsApp CRM on AWS Server
echo ========================================
echo.

REM Restart the application
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 "cd /home/ec2-user/whatsappcrm && pm2 restart whatsappcrm && pm2 status && echo '' && echo 'Logs:' && pm2 logs whatsappcrm --lines 15 --nostream"

echo.
echo Done!
pause
