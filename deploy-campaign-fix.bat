@echo off
REM ============================================
REM Campaign Fix Deployment Script (Windows)
REM ============================================
REM This script deploys the campaign processing fix
REM For production deployment, use deploy-campaign-fix.sh on the server

echo ============================================
echo 📤 Campaign Processing Fix Deployment
echo ============================================
echo.

REM Step 1: Check current directory
echo 📁 Step 1: Checking current directory...
if not exist "app.js" (
    echo ❌ ERROR: app.js not found. Are you in the whatscrm directory?
    pause
    exit /b 1
)
echo ✅ In correct directory
echo.

REM Step 2: Check git status
echo 📊 Step 2: Checking git status...
git status
echo.

REM Step 3: Add and commit changes
echo 📝 Step 3: Committing local changes...
git add .
git commit -m "Fix: Enable campaign processing and phonebook UI improvements"
if errorlevel 1 (
    echo ⚠️ Nothing to commit or commit failed
)
echo.

REM Step 4: Push to GitHub
echo ⬆️  Step 4: Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo ❌ Git push failed! Please check your connection and credentials.
    pause
    exit /b 1
)
echo ✅ Code pushed successfully
echo.

REM Step 5: Verify initCampaign is uncommented
echo 🔍 Step 5: Verifying campaign loop is enabled...
findstr /C:"initCampaign();" app.js >nul
if errorlevel 1 (
    echo ⚠️ WARNING: initCampaign() not found in app.js!
) else (
    echo ✅ Campaign loop is enabled in app.js
)
echo.

echo ============================================
echo ✅ LOCAL DEPLOYMENT COMPLETE
echo ============================================
echo.
echo 🎯 Next Steps:
echo 1. SSH to production: ssh ec2-user@13.205.34.169
echo 2. Go to directory: cd whatscrm
echo 3. Run deployment script: bash deploy-campaign-fix.sh
echo.
echo OR manually:
echo 3. git stash
echo 4. git pull origin main
echo 5. pm2 restart whatscrm
echo 6. pm2 logs whatscrm
echo.
echo 📄 Full guide: See CAMPAIGN_DEPLOYMENT_GUIDE.md
echo.
pause
