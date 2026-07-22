# Quick Connect to EC2 Instance
# ASE Technologies WhatsApp CRM

$EC2_IP = "3.7.194.129"
$KEY_FILE = "$env:USERPROFILE\.ssh\ec2.pem"
$USER = "ubuntu"  # Change to "ec2-user" if using Amazon Linux

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ASE Technologies WhatsApp CRM" -ForegroundColor Cyan
Write-Host "  EC2 Connection Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if key file exists
if (-not (Test-Path $KEY_FILE)) {
    Write-Host "❌ ERROR: Key file not found!" -ForegroundColor Red
    Write-Host "   Expected location: $KEY_FILE" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please move ec2.pem to:" -ForegroundColor Yellow
    Write-Host "   $env:USERPROFILE\.ssh\ec2.pem" -ForegroundColor White
    Write-Host ""
    Write-Host "Commands to move the key:" -ForegroundColor Cyan
    Write-Host "   mkdir $env:USERPROFILE\.ssh -ErrorAction SilentlyContinue" -ForegroundColor Gray
    Write-Host "   Move-Item ec2.pem $env:USERPROFILE\.ssh\ec2.pem" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✅ Key file found: $KEY_FILE" -ForegroundColor Green
Write-Host "🔗 Connecting to: $USER@$EC2_IP" -ForegroundColor Cyan
Write-Host ""

# Connect via SSH
ssh -i $KEY_FILE "$USER@$EC2_IP"
