# Upload ASE Technologies Logo to EC2 Production
# This script uploads the logo file to the production server

Write-Host "🚀 Uploading ASE Technologies logo to production..." -ForegroundColor Cyan

# Upload the ASE logo
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\assets\ase_logo.png" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/assets/

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Logo uploaded successfully!" -ForegroundColor Green
    
    # Now connect and restart PM2
    Write-Host "`n🔄 Restarting application..." -ForegroundColor Cyan
    ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 "cd /home/ec2-user/whatsappcrm && pm2 restart whatscrm"
    
    Write-Host "`n✅ Production updated!" -ForegroundColor Green
    Write-Host "🌐 Visit: https://creativecodex.tech" -ForegroundColor Yellow
    Write-Host "💡 Clear browser cache to see the new logo!" -ForegroundColor Yellow
} else {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
}
