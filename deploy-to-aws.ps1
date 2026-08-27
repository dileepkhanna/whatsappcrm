# PowerShell deployment script for AWS
# Run with: .\deploy-to-aws.ps1

$KEY_PATH = "C:\Users\Asus\.ssh\ec2.pem"
$EC2_IP = "3.7.194.129"
$EC2_USER = "ec2-user"
$PROJECT_PATH = "/home/ec2-user/whatsappcrm"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Deploy to AWS EC2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Push to GitHub
Write-Host "[1/3] Pushing code to GitHub..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to push to GitHub" -ForegroundColor Red
    exit 1
}
Write-Host "[SUCCESS] Code pushed to GitHub" -ForegroundColor Green
Write-Host ""

# Step 2: Deploy to AWS
Write-Host "[2/3] Deploying to AWS..." -ForegroundColor Yellow
Write-Host "This will execute all deployment commands in one session" -ForegroundColor Gray
Write-Host ""

# Deployment commands to run on AWS
$deployCommands = @"
cd $PROJECT_PATH && \
echo '=> Pulling latest code...' && \
git pull origin main && \
echo '=> Installing dependencies...' && \
npm install --production && \
echo '=> Restarting application...' && \
pm2 restart whatsappcrm && \
echo '=> Deployment complete!' && \
pm2 status
"@

# Execute deployment
$sshCommand = "ssh -i `"$KEY_PATH`" -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=10 -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP `"$deployCommands`""

Write-Host "Executing deployment..." -ForegroundColor Gray
Invoke-Expression $sshCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your application has been deployed to AWS" -ForegroundColor White
    Write-Host "Check your website to verify the changes" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERROR] Deployment failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check your internet connection" -ForegroundColor White
    Write-Host "2. Verify EC2 instance is running" -ForegroundColor White  
    Write-Host "3. Check PM2 is installed: ssh and run 'pm2 --version'" -ForegroundColor White
    Write-Host "4. Try manual deployment (see DEPLOY-TO-AWS.md)" -ForegroundColor White
    Write-Host ""
}

Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
