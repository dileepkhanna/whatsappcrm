# Production Verification Script
# Checks if demo removal and logo are working in production

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Production Verification" -ForegroundColor Cyan
Write-Host "https://creativecodex.tech" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$sshKey = "C:\Users\Asus\.ssh\ec2.pem"
$ec2Host = "ec2-user@3.7.194.129"

# Check EC2 server status
Write-Host "Checking EC2 server..." -ForegroundColor Yellow

$checkScript = @"
echo "=== Application Status ==="
pm2 status

echo ""
echo "=== Git Status ==="
cd /home/ec2-user/whatsappcrm
git log -1 --oneline
git status --short

echo ""
echo "=== Critical Files Check ==="
echo "Logo file:"
ls -lh client/public/assets/ase_logo.png 2>/dev/null || echo "NOT FOUND"
ls -lh client/public/media/ase_logo.png 2>/dev/null || echo "(media copy not found - OK)"

echo ""
echo "Demo removal scripts:"
ls -lh client/public/remove-demo-box-active.js 2>/dev/null || echo "NOT FOUND"
ls -lh client/public/hide-demo-box.css 2>/dev/null || echo "NOT FOUND"

echo ""
echo "=== Logo URL Test ==="
echo "Testing /assets/ase_logo.png:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}, Size: %{size_download} bytes\n" http://localhost:3010/assets/ase_logo.png

echo ""
echo "Testing /media/ase_logo.png:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}, Size: %{size_download} bytes\n" http://localhost:3010/media/ase_logo.png

echo ""
echo "=== Demo Removal Scripts Test ==="
echo "Testing /remove-demo-box-active.js:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}, Size: %{size_download} bytes\n" http://localhost:3010/remove-demo-box-active.js

echo "Testing /hide-demo-box.css:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}, Size: %{size_download} bytes\n" http://localhost:3010/hide-demo-box.css

echo ""
echo "=== Recent Application Logs (Last 15 lines) ==="
pm2 logs whatscrm --lines 15 --nostream

echo ""
echo "=== Nginx Status ==="
sudo systemctl status nginx --no-pager | head -10
"@

ssh -i $sshKey $ec2Host "bash -s" <<< $checkScript

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Verification Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Manual Browser Tests:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Cyan
Write-Host "   - Select 'Cached images and files'" -ForegroundColor White
Write-Host "   - Select 'Last hour' or 'All time'" -ForegroundColor White
Write-Host "   - Click 'Clear data'" -ForegroundColor White
Write-Host ""

Write-Host "2. Visit: https://creativecodex.tech" -ForegroundColor Cyan
Write-Host ""

Write-Host "3. Open DevTools (F12):" -ForegroundColor Cyan
Write-Host ""

Write-Host "   Console Tab - Look for:" -ForegroundColor White
Write-Host "   ✅ '🚫 Demo Box Remover: Active'" -ForegroundColor Green
Write-Host "   ✅ '🔧 Landing Page Logo Fix Loading...'" -ForegroundColor Green
Write-Host "   ✅ '✅ Landing page logo fix active'" -ForegroundColor Green
Write-Host "   ❌ NO 'Uncaught SyntaxError' messages" -ForegroundColor Red
Write-Host ""

Write-Host "   Network Tab - Check these load:" -ForegroundColor White
Write-Host "   ✅ ase_logo.png - Status 200, Size ~42KB" -ForegroundColor Green
Write-Host "   ✅ remove-demo-box-active.js - Status 200" -ForegroundColor Green
Write-Host "   ✅ hide-demo-box.css - Status 200" -ForegroundColor Green
Write-Host ""

Write-Host "4. Visual Checks:" -ForegroundColor Cyan
Write-Host "   ✅ NO orange demo access box on login page" -ForegroundColor Green
Write-Host "   ✅ ASE Technologies logo in header (not 'W' icon)" -ForegroundColor Green
Write-Host "   ✅ Text: 'Professional WhatsApp CRM by ASE Technologies'" -ForegroundColor Green
Write-Host ""

Write-Host "5. Test These URLs Directly:" -ForegroundColor Cyan
Write-Host "   https://creativecodex.tech/assets/ase_logo.png" -ForegroundColor White
Write-Host "   https://creativecodex.tech/remove-demo-box-active.js" -ForegroundColor White
Write-Host "   https://creativecodex.tech/hide-demo-box.css" -ForegroundColor White
Write-Host ""

Write-Host "If logo still doesn't show:" -ForegroundColor Yellow
Write-Host "  1. Check which URL actually works (assets/ or media/)" -ForegroundColor White
Write-Host "  2. Update index.html to use the working path" -ForegroundColor White
Write-Host "  3. Run deploy-production-fix.ps1 again" -ForegroundColor White
Write-Host ""
