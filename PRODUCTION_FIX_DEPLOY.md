# Production Fix Deployment Guide

## Current Issues on https://creativecodex.tech:
1. ✅ Demo box - Scripts ready to deploy
2. ❌ Logo - Shows "W" instead of ASE Technologies logo
3. ❌ Text - Shows "Phonebook CRM" instead of "WhatsApp CRM"

## Root Cause Analysis:
- Demo removal scripts exist locally but need production deployment
- Logo file exists at `client/public/assets/ase_logo.png` (42KB)
- index.html has logo replacement scripts but logo file may not be accessible in production

## Solution - Deploy Everything:

### Step 1: Commit Latest Changes
```powershell
git add .
git commit -m "Fix: Deploy demo removal and logo fixes"
git push origin main
```

### Step 2: SSH to EC2 and Deploy
```bash
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129

cd /home/ec2-user/whatsappcrm

# Reset any local changes
git reset --hard HEAD

# Pull latest from GitHub
git pull origin main

# Verify logo file exists
ls -lh client/public/assets/ase_logo.png

# Verify demo removal scripts exist
ls -lh client/public/remove-demo-box-active.js
ls -lh client/public/hide-demo-box.css

# Check file permissions (must be readable)
chmod 644 client/public/assets/ase_logo.png
chmod 644 client/public/remove-demo-box-active.js
chmod 644 client/public/hide-demo-box.css

# Restart application
pm2 restart whatscrm --update-env

# Check logs for errors
pm2 logs whatscrm --lines 20

exit
```

### Step 3: Test in Browser
1. Visit: https://creativecodex.tech
2. Open DevTools (F12) → Network tab
3. Check these files load successfully (200 OK):
   - `/assets/ase_logo.png` (should be 42KB)
   - `/remove-demo-box-active.js`
   - `/hide-demo-box.css`

### Step 4: If Logo Still Not Loading
The logo might be served from `/media/` instead of `/assets/`. Try:

```bash
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129

cd /home/ec2-user/whatsappcrm

# Create media directory if it doesn't exist
mkdir -p client/public/media

# Copy logo to multiple locations
cp client/public/assets/ase_logo.png client/public/media/ase_logo.png
cp client/public/assets/ase_logo.png client/public/ase_logo.png

# Set permissions
chmod 644 client/public/media/ase_logo.png
chmod 644 client/public/ase_logo.png

# Restart
pm2 restart whatscrm

exit
```

Then test these URLs directly:
- https://creativecodex.tech/assets/ase_logo.png
- https://creativecodex.tech/media/ase_logo.png
- https://creativecodex.tech/ase_logo.png

Whichever one works, update `index.html` to use that path.

### Step 5: Check Console Errors
In DevTools Console, you should see:
- ✅ "Demo Box Remover: Active"
- ✅ "Landing page logo fix active"
- ❌ NO syntax errors

If you see `Uncaught SyntaxError`, there are still problematic script files.

## Troubleshooting:

### Issue: Logo loads but doesn't display
**Fix:** The CSS/JS in index.html might have wrong selector. Check browser DevTools → Elements tab to see what element contains the logo.

### Issue: Demo box still visible
**Fix:** The remove-demo-box-active.js script runs continuously. Check Console for "Demo box removed!" messages.

### Issue: "Phonebook CRM" text instead of "WhatsApp CRM"
**Fix:** Text replacement script in index.html might be wrong. This happens if React bundle has hard-coded text.

## Quick Verification Commands:

```bash
# On EC2, check if files exist:
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 'ls -lh /home/ec2-user/whatsappcrm/client/public/assets/ase_logo.png /home/ec2-user/whatsappcrm/client/public/remove-demo-box-active.js'

# Check if app is running:
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 'pm2 status'

# Check nginx is serving static files:
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129 'curl -I http://localhost:3010/assets/ase_logo.png'
```

## Expected Results After Deployment:
✅ Demo access box completely hidden
✅ ASE Technologies logo visible in header
✅ "Professional WhatsApp CRM by ASE Technologies" text
✅ No JavaScript syntax errors in console

