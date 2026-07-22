# Production Fix Deployment Script
# Deploys demo removal and logo fixes to EC2

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Production Fix Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify local files exist
Write-Host "Step 1: Verifying local files..." -ForegroundColor Yellow

$filesToCheck = @(
    "client\public\assets\ase_logo.png",
    "client\public\remove-demo-box-active.js",
    "client\public\hide-demo-box.css",
    "client\public\index.html"
)

$allFilesExist = $true
foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        Write-Host "  [OK] $file ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] $file NOT FOUND!" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host ""
    Write-Host "ERROR: Some files are missing!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Git commit and push
Write-Host "Step 2: Committing changes to Git..." -ForegroundColor Yellow

git add .
git commit -m "Fix: Deploy demo removal and logo fixes to production"

if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) {
    Write-Host "  [ERROR] Git commit failed!" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Changes committed" -ForegroundColor Green

Write-Host ""
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Git push failed!" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Pushed to GitHub" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy to EC2
Write-Host "Step 3: Deploying to EC2..." -ForegroundColor Yellow
Write-Host ""

$sshKey = "C:\Users\Asus\.ssh\ec2.pem"
$ec2Host = "ec2-user@3.7.194.129"

# Create deployment script
$deployScript = @"
cd /home/ec2-user/whatsappcrm

echo "=== Resetting local changes ==="
git reset --hard HEAD

echo ""
echo "=== Pulling latest from GitHub ==="
git pull origin main

echo ""
echo "=== Verifying files exist ==="
ls -lh client/public/assets/ase_logo.png
ls -lh client/public/remove-demo-box-active.js
ls -lh client/public/hide-demo-box.css

echo ""
echo "=== Setting file permissions ==="
chmod 644 client/public/assets/ase_logo.png
chmod 644 client/public/remove-demo-box-active.js
chmod 644 client/public/hide-demo-box.css

echo ""
echo "=== Creating backup logo locations ==="
mkdir -p client/public/media
cp client/public/assets/ase_logo.png client/public/media/ase_logo.png 2>/dev/null; true
cp client/public/assets/ase_logo.png client/public/ase_logo.png 2>/dev/null; true
chmod 644 client/public/media/ase_logo.png 2>/dev/null; true
chmod 644 client/public/ase_logo.png 2>/dev/null; true

echo ""
echo "=== Testing logo file access ==="
curl -I http://localhost:3010/assets/ase_logo.png 2>&1 | grep -E "HTTP|Content"

echo ""
echo "=== Restarting application ==="
pm2 restart whatscrm --update-env

echo ""
echo "=== Checking PM2 status ==="
pm2 status

echo ""
echo "=== Recent logs ==="
pm2 logs whatscrm --lines 10 --nostream
"@

# Execute deployment on EC2
Write-Host "Connecting to EC2 and deploying..." -ForegroundColor Cyan
$deployScript | ssh -i $sshKey $ec2Host "bash -s"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [ERROR] EC2 deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Step 4: Verification URLs
Write-Host "Verification Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Visit: https://creativecodex.tech" -ForegroundColor Cyan
Write-Host "2. Open DevTools (F12) -> Console tab" -ForegroundColor Cyan
Write-Host "3. Look for:" -ForegroundColor Cyan
Write-Host "   - 'Demo Box Remover: Active'" -ForegroundColor White
Write-Host "   - 'Landing page logo fix active'" -ForegroundColor White
Write-Host "   - NO syntax errors" -ForegroundColor White
Write-Host ""
Write-Host "4. Check Network tab for these files (200 OK):" -ForegroundColor Cyan
Write-Host "   - /assets/ase_logo.png (42KB)" -ForegroundColor White
Write-Host "   - /remove-demo-box-active.js" -ForegroundColor White
Write-Host "   - /hide-demo-box.css" -ForegroundColor White
Write-Host ""
Write-Host "5. Verify visually:" -ForegroundColor Cyan
Write-Host "   - No demo access box visible" -ForegroundColor White
Write-Host "   - ASE Technologies logo in header" -ForegroundColor White
Write-Host "   - 'Professional WhatsApp CRM by ASE Technologies'" -ForegroundColor White
Write-Host ""

# Test URLs directly
Write-Host "Test these URLs directly in browser:" -ForegroundColor Yellow
Write-Host "  https://creativecodex.tech/assets/ase_logo.png" -ForegroundColor White
Write-Host "  https://creativecodex.tech/media/ase_logo.png" -ForegroundColor White
Write-Host "  https://creativecodex.tech/remove-demo-box-active.js" -ForegroundColor White
Write-Host ""
