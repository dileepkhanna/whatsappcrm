# Update EC2 from Git - Manual Steps

## Run these commands on EC2:

### 1. SSH into EC2:
```bash
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
```

### 2. Navigate to app directory:
```bash
cd /home/ec2-user/whatsappcrm
```

### 3. Pull latest changes:
```bash
git pull origin main
```

### 4. Check if logo file exists:
```bash
ls -lh client/public/assets/ase_logo.png
```

### 5. If logo doesn't exist, check Git status:
```bash
git status
git log --oneline -5
```

### 6. Restart application:
```bash
pm2 restart whatscrm
```

### 7. Check logs:
```bash
pm2 logs whatscrm --lines 20
```

### 8. Exit:
```bash
exit
```

---

## After running these commands:

1. Visit: https://creativecodex.tech
2. Clear browser cache: Ctrl + Shift + Delete
3. Hard refresh: Ctrl + Shift + R
4. Check if ASE logo appears

---

## If logo still doesn't show:

The logo might not have been committed to Git. Let's manually upload it:

### From your Windows PowerShell:
```powershell
scp -i "C:\Users\Asus\.ssh\ec2.pem" "client\public\assets\ase_logo.png" ec2-user@3.7.194.129:/home/ec2-user/whatsappcrm/client/public/assets/
```

Then SSH and restart:
```bash
ssh -i "C:\Users\Asus\.ssh\ec2.pem" ec2-user@3.7.194.129
pm2 restart whatscrm
exit
```
