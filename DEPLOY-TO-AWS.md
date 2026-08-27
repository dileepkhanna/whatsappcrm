# Deploy to AWS via GitHub - Complete Guide

## ✅ What's Been Done

1. **Fixed 6 components** with missing imports and array handling
2. **Cleaned up 50+ test files** and debug scripts
3. **Updated .gitignore** to exclude frontend source, include only dist bundles
4. **Committed all changes** to Git (308 files changed)
5. **Ready to push** to GitHub and deploy to AWS

---

## 📦 What Will Be Deployed

### ✅ Included in Git:
- **Backend code**: All routes, models, functions, automation
- **Frontend bundles**: `frontend/dist/` folder (built JavaScript/CSS)
- **Package files**: `package.json`, `package-lock.json`
- **Database schema**: `whatscrm_schema.sql`
- **Configuration examples**: `.env.example`

### ❌ Excluded from Git:
- **Frontend source**: `frontend/src/`, `frontend/public/`
- **Environment variables**: `.env` (sensitive data)
- **Node modules**: `node_modules/`
- **WhatsApp sessions**: `auth_info_baileys/`, `sessions/`
- **User uploads**: `client/public/media/`, `client/public/telegram/`
- **Test files**: All test and debug files

---

## 🚀 Step 1: Push to GitHub

Run these commands:

```bash
# If push was interrupted, try again
git push origin main

# If you encounter issues, force push (only if you're sure)
# git push origin main --force
```

**Expected Output**:
```
Enumerating objects: 500+, done.
Counting objects: 100% (500+/500+), done.
Delta compression using up to X threads
Compressing objects: 100% (300+/300+), done.
Writing objects: 100% (400+/400+), X.XX MiB | X.XX MiB/s, done.
Total 500+ (delta 200+), reused 0 (delta 0)
To https://github.com/your-username/your-repo.git
   abc1234..42ac3f6  main -> main
```

---

## 🔧 Step 2: Pull on AWS Server

### Option A: Using Git Pull (Recommended)

SSH into your AWS server:

```bash
ssh -i your-key.pem ubuntu@your-server-ip
```

Navigate to your project and pull changes:

```bash
cd /path/to/your/whatscrm
git pull origin main
```

### Option B: Using GitHub Actions (Automated)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to AWS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.AWS_HOST }}
          username: ${{ secrets.AWS_USERNAME }}
          key: ${{ secrets.AWS_SSH_KEY }}
          script: |
            cd /path/to/whatscrm
            git pull origin main
            npm install --production
            pm2 restart whatscrm
```

---

## 📥 Step 3: Install Dependencies on AWS

After pulling code:

```bash
# Install/update backend dependencies
npm install --production

# No need to build frontend - dist folder is already included!
```

---

## ⚙️ Step 4: Configure Environment on AWS

Copy and configure your .env file:

```bash
# Create .env from example
cp .env.example .env

# Edit with your production values
nano .env
```

**Important .env Variables**:
```bash
NODE_ENV=production
PORT=3010

# Database
DB_HOST=localhost
DB_USER=root
DB_PASS=your-password
DB_NAME=whatscrm

# JWT
JWT_SECRET=your-secret-key

# Meta WhatsApp API
META_APP_ID=your-app-id
META_APP_SECRET=your-app-secret
WABA_ID=your-waba-id

# Server URL
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://yourdomain.com
```

---

## 🗄️ Step 5: Database Setup (First Time Only)

```bash
# Import schema
mysql -u root -p whatscrm < whatscrm_schema.sql

# Or using source command
mysql -u root -p
> CREATE DATABASE IF NOT EXISTS whatscrm;
> USE whatscrm;
> SOURCE whatscrm_schema.sql;
> EXIT;
```

---

## 🔄 Step 6: Restart Application

### Using PM2 (Recommended):

```bash
# First time setup
pm2 start server.js --name whatscrm

# For updates (restart)
pm2 restart whatscrm

# Save PM2 config
pm2 save
pm2 startup
```

### Using Node directly:

```bash
# Stop existing process
pkill -f "node server.js"

# Start new process
nohup node server.js > output.log 2>&1 &
```

---

## 🌐 Step 7: Configure Nginx (If Using)

Update your Nginx configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve frontend dist files
    location / {
        root /path/to/whatscrm/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js
    location /api {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support (for real-time features)
    location /socket.io {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## ✅ Step 8: Verify Deployment

### Check Application Status:

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs whatscrm --lines 50

# Check if port is listening
netstat -tlnp | grep 3010
```

### Test Application:

```bash
# Test backend
curl http://localhost:3010/api/health

# Test from browser
# Visit: https://yourdomain.com
```

---

## 🔒 Security Checklist

- [ ] `.env` file has correct production values
- [ ] `.env` file has proper permissions: `chmod 600 .env`
- [ ] Database passwords are strong
- [ ] JWT_SECRET is unique and secure
- [ ] Firewall allows only necessary ports
- [ ] SSL/TLS certificate is installed (HTTPS)
- [ ] Session data is backed up regularly
- [ ] WhatsApp auth tokens are protected

---

## 🔄 Future Updates Workflow

When you make changes locally:

```bash
# 1. Make your changes
# 2. Build frontend if you changed frontend code
cd frontend
npm run build

# 3. Commit and push
git add -A
git commit -m "Your update description"
git push origin main

# 4. On AWS server
ssh into server
cd /path/to/whatscrm
git pull origin main
npm install --production  # Only if package.json changed
pm2 restart whatscrm
```

---

## 🐛 Troubleshooting

### Frontend not loading:
```bash
# Check if dist folder exists
ls -la frontend/dist/

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Backend not starting:
```bash
# Check PM2 logs
pm2 logs whatscrm

# Check if port is already in use
lsof -i :3010

# Check Node.js version
node --version  # Should be v16+ or v18+
```

### Database connection failed:
```bash
# Test MySQL connection
mysql -u root -p -h localhost

# Check .env database settings
cat .env | grep DB_
```

### Git pull conflicts:
```bash
# Stash local changes (if any)
git stash

# Pull latest
git pull origin main

# Reapply stashed changes (if needed)
git stash pop
```

---

## 📊 Monitoring

### PM2 Monitoring:

```bash
# Real-time monitoring
pm2 monit

# CPU and memory usage
pm2 describe whatscrm

# Restart on high memory
pm2 start server.js --name whatscrm --max-memory-restart 1G
```

### Log Files:

```bash
# Application logs
pm2 logs whatscrm

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# System logs
journalctl -u pm2-ubuntu -f
```

---

## 🔐 Backup Important Files

Files to backup regularly:

```bash
# Database
mysqldump -u root -p whatscrm > backup_$(date +%Y%m%d).sql

# Environment file
cp .env .env.backup

# WhatsApp sessions
tar -czf sessions_backup_$(date +%Y%m%d).tar.gz auth_info_baileys/ sessions/

# Uploaded media
tar -czf media_backup_$(date +%Y%m%d).tar.gz client/public/media/
```

---

## 📝 Important Notes

1. **Frontend source code is NOT on server** - Only built bundles are deployed
2. **To update frontend**: Build locally → Push to GitHub → Pull on server
3. **No need to rebuild on server** - Saves time and resources
4. **Keep .env secure** - Never commit to Git
5. **Test locally first** - Always test changes before pushing
6. **Use PM2 for stability** - Auto-restart on crashes

---

## 🎉 Success Checklist

- [ ] Code pushed to GitHub successfully
- [ ] Code pulled on AWS server
- [ ] Dependencies installed
- [ ] .env file configured
- [ ] Database imported (first time)
- [ ] PM2/Node process restarted
- [ ] Nginx configured (if using)
- [ ] Application loads in browser
- [ ] API endpoints working
- [ ] WhatsApp connection working
- [ ] Real-time features working

---

## 📞 Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs whatscrm`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify .env configuration
4. Check firewall rules
5. Verify database connection

---

**Deployment Status**: Ready ✅  
**Last Updated**: Now  
**Next Step**: `git push origin main`

---

**End of Deployment Guide**
