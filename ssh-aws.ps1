# PowerShell script to connect to AWS EC2
# Run with: .\ssh-aws.ps1

$KEY_PATH = "C:\Users\Asus\.ssh\ec2.pem"
$EC2_IP = "3.7.194.129"
$EC2_USER = "ec2-user"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Connecting to AWS EC2 Instance" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if key file exists
if (-not (Test-Path $KEY_PATH)) {
    Write-Host "[ERROR] Key file not found: $KEY_PATH" -ForegroundColor Red
    exit 1
}

Write-Host "Connecting to $EC2_USER@$EC2_IP..." -ForegroundColor Green
Write-Host ""

# Connect with keep-alive settings
$sshCommand = "ssh -i `"$KEY_PATH`" -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -o TCPKeepAlive=yes $EC2_USER@$EC2_IP"

Write-Host "Running: $sshCommand" -ForegroundColor Yellow
Write-Host ""

Invoke-Expression $sshCommand

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Connection failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Check EC2 instance is running in AWS Console" -ForegroundColor White
    Write-Host "2. Verify Security Group allows SSH (port 22)" -ForegroundColor White
    Write-Host "3. Check your internet connection" -ForegroundColor White
    Write-Host "4. Try: ssh -vvv -i `"$KEY_PATH`" $EC2_USER@$EC2_IP" -ForegroundColor White
    Write-Host ""
}
