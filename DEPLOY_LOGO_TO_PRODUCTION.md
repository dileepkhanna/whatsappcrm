# Deploy ASE Logo to Production (EC2)

## Quick Deploy - Run This Batch File:

```cmd
deploy-production.bat
```

This will upload all files and restart the server.

---

## OR: Manual Commands (Copy and paste one by one)

### 1. Upload ASE Logo:
```powershell
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\assets\ase_logo.png" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/assets/
```

### 2. Upload Updated index.html:
```powershell
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\index.html" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/
```

### 3. Upload Demo Removal Script:
```powershell
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\remove-demo-box-active.js" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/
```

### 4. Upload Demo Box CSS:
```powershell
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\hide-demo-box.css" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/
```

### 5. Restart Application:
```powershell
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
pm2 restart whatscrm
exit
```

---

## Verify Logo is Uploaded:

```bash
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
ls -lh /home/ec2-user/whatsappcrm/client/public/assets/ase_logo.png
```

Should show: **42K** file size

---

## After Deployment:

1. **Visit:** https://creativecodex.tech
2. **Clear browser cache:**
   - Press: `Ctrl + Shift + Delete`
   - Select: "All time"
   - Check: "Cached images and files"
   - Click: "Clear data"
3. **Hard refresh:** `Ctrl + Shift + R`
4. **Check:** ASE Technologies logo should appear in top-left

---

## Troubleshooting:

### If logo still doesn't show:

1. **Check if file exists on server:**
   ```bash
   ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
   ls -la /home/ec2-user/whatsappcrm/client/public/assets/ | grep ase
   ```

2. **Check file size:**
   ```bash
   du -h /home/ec2-user/whatsappcrm/client/public/assets/ase_logo.png
   ```
   Should be: **42K** or similar

3. **Test direct access:**
   - Visit: `https://creativecodex.tech/assets/ase_logo.png`
   - Should show the logo image

4. **Check PM2 logs:**
   ```bash
   ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
   pm2 logs whatscrm --lines 50
   ```

5. **Restart Nginx (if needed):**
   ```bash
   ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
   sudo systemctl restart nginx
   ```

---

## Quick Test Commands:

```bash
# Connect to EC2
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129

# Check all uploaded files
ls -lh /home/ec2-user/whatsappcrm/client/public/assets/ase_logo.png
ls -lh /home/ec2-user/whatsappcrm/client/public/remove-demo-box-active.js
ls -lh /home/ec2-user/whatsappcrm/client/public/hide-demo-box.css

# Check PM2 status
pm2 status

# Restart if needed
pm2 restart whatscrm

# Exit
exit
```

---

## What Will Change:

### Before:
- Logo: Default "W" icon (WhatsCRM)
- Text: "WhatsCRM"

### After:
- Logo: ASE Technologies logo
- Text: "Professional WhatsApp CRM by ASE Technologies"
- Demo box: Hidden/Removed

---

**Ready to deploy?** Run `deploy-production.bat` or use the manual commands above!
