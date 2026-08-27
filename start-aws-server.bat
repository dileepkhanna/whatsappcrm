@echo off
echo ========================================
echo Starting WhatsApp CRM on AWS Server
echo ========================================
echo.

REM Execute all commands in one SSH session to avoid disconnection
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 "cd /home/ec2-user/whatsappcrm && pm2 start server.js --name whatsappcrm && pm2 save && pm2 status && echo '========================================' && echo 'Server Started Successfully!' && echo '========================================'"

echo.
echo Done! Server should be running now.
echo Check status: ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 "pm2 status"
echo.
pause
