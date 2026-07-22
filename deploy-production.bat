@echo off
echo Deploying to production...
echo.

echo [1/5] Uploading ASE logo...
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\assets\ase_logo.png" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/assets/

echo.
echo [2/5] Uploading index.html...
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\index.html" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/

echo.
echo [3/5] Uploading demo removal script...
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\remove-demo-box-active.js" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/

echo.
echo [4/5] Uploading demo box CSS...
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\hide-demo-box.css" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/

echo.
echo [5/5] Restarting application...
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 "cd /home/ec2-user/whatsappcrm && pm2 restart whatscrm"

echo.
echo ========================================
echo Production deployment complete!
echo.
echo Visit: https://creativecodex.tech
echo Remember to clear browser cache!
echo ========================================
pause
