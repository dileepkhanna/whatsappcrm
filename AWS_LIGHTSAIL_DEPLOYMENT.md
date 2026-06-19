# AWS Lightsail Deployment Guide - WhatsCRM v5.9.5

**Deployment Strategy:** Multi-project setup without disrupting existing applications

---

## 🎯 Deployment Overview

### Your Environment
- **Platform:** AWS Lightsail
- **Existing Projects:** 2 projects already running
- **Available Ports:** 3000, 3001, 4000, 5000, 8080, 8081, 9000, 9001
- **Recommended Port:** **5000** (standard alternative to 3000/8080)

### Deployment Structure
```
/opt/
├── project1/              # Your existing project 1
├── project2/              # Your existing project 2
└── whatscrm/              # New WhatsCRM project (port 5000)
```

---

## 📋 Pre-Deployment Checklist

### On Your Local Machine

- [ ] Push code to GitHub (follow GITHUB_SETUP_GUIDE.md)
- [ ] Verify `.gitignore` is working
- [ ] Create `.env.production` file with production values
- [ ] Note down your GitHub repository URL
- [ ] Have AWS Lightsail credentials ready

### Security Requirements

- [ ] Generate strong JWT secret (64+ characters)
- [ ] Change default admin password after deployment
- [ ] Setup domain/subdomain for this project
- [ ] Get SSL certificate ready (Let's Encrypt)

---

## 🚀 Step-by-Step Deployment

### Step 1: Connect to AWS Lightsail

```bash
# SSH into your Lightsail instance
ssh -i /path/to/your-key.pem ubuntu@your-lightsail-ip

# Or use Lightsail browser-based SSH
# (from AWS Console → Lightsail → Connect using SSH)
```

### Step 2: Check Current Setup (Don't Disturb)

```bash
# Check what's running
pm2 list

# Check occupied ports
sudo netstat -tulpn | grep LISTEN

# Check existing projects
ls -la /opt/
# or
ls -la ~/

# Note: Don't stop or modify anything yet!
```

### Step 3: Install Prerequisites (If Not Installed)

#### Check Node.js Version
```bash
node --version
# Should be v14+ (v18 LTS recommended)
```

#### Install/Update Node.js (if needed)
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
nvm alias default 18
```

#### Check MySQL
```bash
mysql --version
# Should be MySQL 8.0+
```

#### Check PM2
```bash
pm2 --version
# If not installed:
npm install -g pm2
```

### Step 4: Create Dedicated Directory

```bash
# Navigate to deployment location
cd /opt
# or
cd ~

# Create directory for WhatsCRM
sudo mkdir -p whatscrm
sudo chown $USER:$USER whatscrm
cd whatscrm
```

### Step 5: Clone Repository

```bash
# Clone from GitHub (replace with your repo URL)
git clone https://github.com/YOUR-USERNAME/whatscrm.git .

# Or if private repository:
git clone https://YOUR-TOKEN@github.com/YOUR-USERNAME/whatscrm.git .

# Verify files
ls -la
```

### Step 6: Install Dependencies

```bash
# Install npm packages
npm install --production

# This will install ~455 packages
# Wait for completion (2-5 minutes)
```

### Step 7: Create Production Environment File

```bash
# Create .env file
nano .env
```

**Paste this configuration (customize values):**

```env
# ============================================================
# WhatsCRM v5.9.5 - Production Environment
# ============================================================

# ─── Server ──────────────────────────────────────────────────
PORT=5000

# ─── Database (MySQL) ────────────────────────────────────────
DBHOST=localhost
DBPORT=3306
DBUSER=whatscrm_user
DBPASS=CHANGE_THIS_STRONG_PASSWORD
DBNAME=whatscrm_prod

# ─── JWT Secret ──────────────────────────────────────────────
# CRITICAL: Use the command below to generate:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWTKEY=PASTE_YOUR_64_CHARACTER_RANDOM_STRING_HERE

# ─── App URLs ────────────────────────────────────────────────
FRONTENDURI=https://your-domain.com
BACKURI=https://your-domain.com

# Or if using subdomain:
# FRONTENDURI=https://whatscrm.your-domain.com
# BACKURI=https://whatscrm.your-domain.com

# Or temporarily with IP (not recommended for production):
# FRONTENDURI=http://your-lightsail-ip:5000
# BACKURI=http://your-lightsail-ip:5000

# ─── Stripe ──────────────────────────────────────────────────
STRIPE_LANG=en

# ─── Node Environment ────────────────────────────────────────
NODE_ENV=production
```

**Save:** Ctrl+O, Enter, Ctrl+X

### Step 8: Generate Strong JWT Secret

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Copy output and paste into .env JWTKEY field
nano .env
```

### Step 9: Setup Database

#### Create Database User (Isolated from other projects)

```bash
# Connect to MySQL
mysql -u root -p
```

**Run these SQL commands:**

```sql
-- Create dedicated database for WhatsCRM
CREATE DATABASE whatscrm_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create dedicated user
CREATE USER 'whatscrm_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD_HERE';

-- Grant privileges only to this database
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON whatscrm_prod.* TO 'whatscrm_user'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;

-- Verify
SHOW GRANTS FOR 'whatscrm_user'@'localhost';

-- Exit
EXIT;
```

#### Import Schema

```bash
# Import database schema
mysql -u whatscrm_user -p whatscrm_prod < whatscrm_schema.sql

# Verify tables created
mysql -u whatscrm_user -p whatscrm_prod -e "SHOW TABLES;"
```

### Step 10: Configure PM2 Ecosystem

```bash
# Create PM2 config file
nano ecosystem.config.js
```

**Paste this configuration:**

```javascript
module.exports = {
  apps: [{
    name: 'whatscrm',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

**Save:** Ctrl+O, Enter, Ctrl+X

### Step 11: Create Logs Directory

```bash
# Create logs directory
mkdir -p logs

# Set permissions
chmod 755 logs
```

### Step 12: Test Application (Before PM2)

```bash
# Test run to check for errors
NODE_ENV=production PORT=5000 node server.js

# Expected output:
# WaCrm server is running on port 5000
# 🌐 [LangSync] All language files are in sync with English.json
# Database has been connected

# If successful, press Ctrl+C to stop
```

**If you get errors:**
- Check `.env` values
- Verify database connection
- Check port 5000 is not in use

### Step 13: Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Check status
pm2 list

# Should show:
# ┌─────┬─────────────┬─────┬─────┬────────┐
# │ id  │ name        │ mode│ status │ cpu │
# ├─────┼─────────────┼─────┼────────┼─────┤
# │ 0   │ project1    │ ... │ online │ ... │
# │ 1   │ project2    │ ... │ online │ ... │
# │ 2   │ whatscrm    │ fork│ online │ 0%  │
# └─────┴─────────────┴─────┴────────┴─────┘

# View logs
pm2 logs whatscrm --lines 50

# Monitor
pm2 monit
```

### Step 14: Configure Auto-Start on Reboot

```bash
# Save PM2 configuration
pm2 save

# Setup startup script (if not already done)
pm2 startup

# Follow the command it outputs (run with sudo)
# Example: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### Step 15: Open Firewall Port

```bash
# Check current firewall rules
sudo ufw status

# Allow port 5000
sudo ufw allow 5000/tcp

# Verify
sudo ufw status
```

**Also in AWS Lightsail Console:**
1. Go to your Lightsail instance
2. Click **Networking** tab
3. Under **Firewall**, click **Add rule**
4. Choose **Custom**, Protocol: **TCP**, Port: **5000**
5. Click **Create**

### Step 16: Test Application

```bash
# Test locally on server
curl http://localhost:5000

# Should return HTML content

# Test from your computer
# Open browser: http://your-lightsail-ip:5000
```

---

## 🌐 Setup Domain & Nginx Reverse Proxy

### Why Use Nginx?

- SSL/HTTPS support
- Better security
- Professional URLs (no port numbers)
- Can host multiple apps on port 80/443

### Install Nginx (if not installed)

```bash
# Check if nginx is installed
nginx -v

# If not installed:
sudo apt update
sudo apt install nginx -y
```

### Configure Nginx for WhatsCRM

```bash
# Create nginx config
sudo nano /etc/nginx/sites-available/whatscrm
```

**Paste this configuration:**

```nginx
# WhatsCRM - Port 5000
server {
    listen 80;
    server_name whatscrm.your-domain.com;  # Change this!
    
    # Or if using subdomain:
    # server_name crm.your-domain.com;
    
    # Or temporarily with IP:
    # server_name your-lightsail-ip;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

**Save:** Ctrl+O, Enter, Ctrl+X

### Enable Nginx Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/whatscrm /etc/nginx/sites-enabled/

# Test nginx config
sudo nginx -t

# Should output:
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# Reload nginx
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

### Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (change domain!)
sudo certbot --nginx -d whatscrm.your-domain.com

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended: 2)

# Auto-renewal test
sudo certbot renew --dry-run
```

### Update .env with HTTPS URL

```bash
nano .env

# Change:
# FRONTENDURI=https://whatscrm.your-domain.com
# BACKURI=https://whatscrm.your-domain.com

# Restart application
pm2 restart whatscrm
```

---

## ✅ Post-Deployment Verification

### Check Application Status

```bash
# PM2 status
pm2 list

# View logs
pm2 logs whatscrm --lines 50

# Check CPU/Memory
pm2 monit

# Application health
curl http://localhost:5000
```

### Test All Features

1. **Admin Login:**
   - Go to: https://whatscrm.your-domain.com/admin/login
   - Login: admin@whatscrm.com / admin123
   - ⚠️ Change password immediately!

2. **User Registration:**
   - Test signup flow
   - Test Google/Facebook login (if configured)

3. **Payment Gateway:**
   - Configure in Admin Panel
   - Test with test cards

4. **WhatsApp Connection:**
   - Test QR code generation
   - Send test message

### Monitor Resources

```bash
# Check port usage
sudo netstat -tulpn | grep LISTEN

# Check memory
free -h

# Check disk space
df -h

# Check PM2 processes
pm2 status
```

---

## 🔄 Daily Operations

### View Logs

```bash
# Real-time logs
pm2 logs whatscrm

# Last 100 lines
pm2 logs whatscrm --lines 100

# Error logs only
pm2 logs whatscrm --err

# Application logs
tail -f logs/pm2-error.log
tail -f logs/pm2-out.log
```

### Restart Application

```bash
# Restart WhatsCRM only
pm2 restart whatscrm

# Restart all applications (careful!)
pm2 restart all

# Reload (zero-downtime)
pm2 reload whatscrm
```

### Update Code

```bash
# Navigate to project
cd /opt/whatscrm

# Pull latest code
git pull origin main

# Install new dependencies (if any)
npm install --production

# Restart
pm2 restart whatscrm
```

### Database Backup

```bash
# Create backup script
nano ~/backup-whatscrm.sh
```

**Paste:**

```bash
#!/bin/bash
BACKUP_DIR="/opt/whatscrm-backups"
DATE=$(date +%Y%m%d_%H%M%S)
DBNAME="whatscrm_prod"
DBUSER="whatscrm_user"
DBPASS="YOUR_PASSWORD"

mkdir -p $BACKUP_DIR
mysqldump -u $DBUSER -p$DBPASS $DBNAME | gzip > "$BACKUP_DIR/whatscrm_$DATE.sql.gz"

# Delete backups older than 7 days
find $BACKUP_DIR -name "whatscrm_*.sql.gz" -mtime +7 -delete

echo "Backup completed: whatscrm_$DATE.sql.gz"
```

**Make executable:**

```bash
chmod +x ~/backup-whatscrm.sh

# Test backup
~/backup-whatscrm.sh
```

**Schedule daily backups:**

```bash
# Edit crontab
crontab -e

# Add line (runs daily at 2 AM):
0 2 * * * /home/ubuntu/backup-whatscrm.sh >> /home/ubuntu/backup.log 2>&1
```

---

## 🐛 Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs whatscrm --err

# Common issues:
# 1. Port already in use
sudo netstat -tulpn | grep 5000

# 2. Database connection failed
mysql -u whatscrm_user -p whatscrm_prod -e "SELECT 1"

# 3. Environment variables
cat .env | grep -v '^#'
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Set memory limit in ecosystem.config.js:
max_memory_restart: '500M'

# Restart
pm2 restart whatscrm
```

### Port Conflict

```bash
# Check what's using port 5000
sudo lsof -i :5000

# Change port in .env
nano .env
# Change PORT=5000 to another available port

# Update PM2 config
nano ecosystem.config.js

# Restart
pm2 restart whatscrm
```

### Database Issues

```bash
# Check database connection
mysql -u whatscrm_user -p whatscrm_prod

# Check tables
SHOW TABLES;

# Check recent errors
SHOW ENGINE INNODB STATUS\G
```

### Nginx Issues

```bash
# Test config
sudo nginx -t

# View error log
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

---

## 📊 Resource Management

### Multiple Projects Setup

Your Lightsail instance now runs:

| Project | Port | PM2 Name | Database | Status |
|---------|------|----------|----------|--------|
| Project 1 | ? | project1 | db1 | ✅ Running |
| Project 2 | ? | project2 | db2 | ✅ Running |
| WhatsCRM | 5000 | whatscrm | whatscrm_prod | ✅ Running |

### Resource Allocation

```bash
# View all PM2 processes
pm2 list

# Monitor resources
pm2 monit

# Restart specific project
pm2 restart whatscrm  # Only affects WhatsCRM
```

### Isolated Databases

Each project has its own database:
- **Project 1:** `db1` (unchanged)
- **Project 2:** `db2` (unchanged)
- **WhatsCRM:** `whatscrm_prod` (new, isolated)

---

## 🔒 Security Hardening

### Change Default Passwords

```bash
# 1. Login to admin panel
# https://whatscrm.your-domain.com/admin/login

# 2. Change admin password immediately
# Go to: Settings → Profile → Change Password

# 3. Update database password periodically
mysql -u root -p
ALTER USER 'whatscrm_user'@'localhost' IDENTIFIED BY 'NEW_PASSWORD';
FLUSH PRIVILEGES;
EXIT;

# Update .env
nano .env  # Change DBPASS

# Restart
pm2 restart whatscrm
```

### Setup Firewall

```bash
# Only allow necessary ports
sudo ufw status

# Should see:
# 22/tcp (SSH)
# 80/tcp (HTTP)
# 443/tcp (HTTPS)
# 5000/tcp (WhatsCRM - if not using nginx)
# Other project ports
```

### Rate Limiting (Optional)

Add to nginx config:

```nginx
limit_req_zone $binary_remote_addr zone=whatscrm:10m rate=10r/s;

server {
    ...
    location / {
        limit_req zone=whatscrm burst=20 nodelay;
        ...
    }
}
```

---

## ✅ Deployment Success Checklist

- [ ] Application running on port 5000
- [ ] PM2 shows "online" status
- [ ] Database connected successfully
- [ ] Can access via browser
- [ ] Admin login works
- [ ] Changed default admin password
- [ ] Nginx reverse proxy configured (optional)
- [ ] SSL certificate installed (optional)
- [ ] Domain points to application
- [ ] Existing projects still running fine
- [ ] PM2 auto-start configured
- [ ] Database backups scheduled
- [ ] Firewall configured
- [ ] Logs are accessible

---

## 📞 Quick Reference

### Common Commands

```bash
# PM2
pm2 list                          # List all processes
pm2 logs whatscrm                 # View logs
pm2 restart whatscrm              # Restart
pm2 stop whatscrm                 # Stop
pm2 delete whatscrm               # Remove
pm2 monit                         # Monitor
pm2 save                          # Save config

# Nginx
sudo systemctl status nginx       # Check status
sudo systemctl restart nginx      # Restart
sudo nginx -t                     # Test config
sudo certbot renew                # Renew SSL

# Database
mysql -u whatscrm_user -p whatscrm_prod  # Connect
~/backup-whatscrm.sh              # Backup

# Logs
tail -f logs/pm2-out.log          # App logs
tail -f logs/pm2-error.log        # Error logs
tail -f /var/log/nginx/access.log # Nginx logs
```

### Important URLs

- **Application:** http://your-ip:5000 or https://your-domain.com
- **Admin:** /admin/login
- **User:** /user/login
- **API:** /api

### Important Files

- **Environment:** `/opt/whatscrm/.env`
- **PM2 Config:** `/opt/whatscrm/ecosystem.config.js`
- **Nginx Config:** `/etc/nginx/sites-available/whatscrm`
- **Logs:** `/opt/whatscrm/logs/`

---

## 🎉 Deployment Complete!

Your WhatsCRM application is now running on AWS Lightsail on port 5000 without affecting your other projects!

**Next Steps:**
1. Configure payment gateways in Admin Panel
2. Setup social login (Google, Facebook)
3. Configure SMTP for emails
4. Test all features thoroughly
5. Monitor logs for first few days
6. Setup monitoring alerts (optional)

**Support:**
- Check logs: `pm2 logs whatscrm`
- Review documentation in project root
- Monitor resources: `pm2 monit`

---

**Deployed:** [Date]  
**Port:** 5000  
**Domain:** [Your Domain]  
**Status:** ✅ Production Ready
