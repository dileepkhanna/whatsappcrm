# Deploy All Changes to EC2 Production
# Uploads logo, index.html, and demo removal scripts

Write-Host "🚀 Deploying all changes to production..." -ForegroundColor Cyan

$keyPath = "C:\Users\Asus\.ssh\ec2.pem"
$server = "ec2-user@3.7.194.129"
$remoteBase = "/home/ec2-user/whatsappcrm"

# 1. Upload ASE Technologies Logo
Write-Host "`n📤 Uploading ASE logo..." -ForegroundColor Yellow
scp -i $keyPath "client\public\assets\ase_logo.png" "${server}:${remoteBase}/client/public/assets/"

# 2. Upload updated index.html (with all fixes)
Write-Host "📤 Uploading index.html..." -ForegroundColor Yellow
scp -i $keyPath "client\public\index.html" "${server}:${remoteBase}/client/public/"

# 3. Upload demo removal script
Write-Host "📤 Uploading demo removal script..." -ForegroundColor Yellow
scp -i $keyPath "client\public\remove-demo-box-active.js" "${server}:${remoteBase}/client/public/"

# 4. Upload hide demo box CSS
Write-Host "📤 Uploading demo box CSS..." -ForegroundColor Yellow
scp -i $keyPath "client\public\hide-demo-box.css" "${server}:${remoteBase}/client/public/"

# 5. Upload favicon
Write-Host "📤 Uploading favicon..." -ForegroundColor Yellow
scp -i $keyPath "client\public\favicon.ico" "${server}:${remoteBase}/client/public/"

# 6. Upload PWA icons (if they exist)
if (Test-Path "client\public\logo192.png") {
    Write-Host "📤 Uploading PWA icons..." -ForegroundColor Yellow
    scp -i $keyPath "client\public\logo192.png" "${server}:${remoteBase}/client/public/"
    scp -i $keyPath "client\public\logo512.png" "${server}:${remoteBase}/client/public/"
}

Write-Host "`n🔄 Restarting application on EC2..." -ForegroundColor Cyan
ssh -i $keyPath $server "cd ${remoteBase} && pm2 restart whatscrm"

Write-Host "`n✅ Production deployment complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "🌐 Production URL: https://creativecodex.tech" -ForegroundColor Yellow
Write-Host "💡 Clear browser cache to see changes!" -ForegroundColor Yellow
Write-Host "   Ctrl + Shift + Delete → All time → Clear" -ForegroundColor Gray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
