# Deployment Instructions for User Profile Fix

## Changes Made:
1. Fixed Profile component to properly display user data
2. Updated MainLayout to show real user info instead of placeholders
3. Modified useAuth hook to update store when user data is fetched
4. Frontend build completed successfully

## Deploy to Production:

### Option 1: Direct File Copy (If you have SSH/FTP access)

Upload these files to your EC2 server at `/home/ec2-user/whatsappcrm/`:

```
frontend/dist/ (entire folder)
frontend/src/features/profile/Profile.tsx
frontend/src/components/layout/MainLayout.tsx  
frontend/src/hooks/useAuth.ts
```

### Option 2: Using Git (Recommended)

On your LOCAL machine:
```bash
cd "c:\Users\Asus\Downloads\WhatsCRM v5.9.5\WhatsCRM v5.9.5\codecanyon-51122205-whatscrm-chatbot-flow-builder-api-access-whatsapp-crm-saas-system"

git add .
git commit -m "Fix: Display real user data in profile and menu"
git push origin main
```

On your EC2 SERVER:
```bash
cd /home/ec2-user/whatsappcrm

# Pull latest code
git pull origin main

# Restart the application
pm2 restart all

# Or if using systemd
sudo systemctl restart whatsappcrm
```

### Option 3: Manual Build on Server

On your EC2 SERVER:
```bash
cd /home/ec2-user/whatsappcrm/frontend

# Install dependencies if needed
npm install

# Build frontend
npm run build

# Restart application
cd ..
pm2 restart all
```

## Verify the Fix:

1. Open https://eswarigroup.in in your browser
2. Login with your account
3. Click on your avatar in the top right
4. You should now see:
   - Your actual name instead of "User"
   - Your actual email instead of "user@example.com"
5. Click "Profile" menu item - the dialog should also show real data

## If Still Not Working:

1. Clear browser cache (Ctrl+Shift+Del)
2. Hard refresh the page (Ctrl+F5)
3. Check browser console (F12) for errors
4. Check if user data is in localStorage:
   - Open browser console
   - Type: `localStorage.getItem('wacrm_token')`
   - Should show your token

## Contact Limit Fix Already Deployed:

Run this on your EC2 database to increase contact limit:

```bash
mysql -u root -p'9948318650' whatscrm -e "UPDATE user SET plan = JSON_SET(plan, '\$.contact_limit', 10000) WHERE email = 'eswarigroup9@gmail.com';"
```

This gives the user 10,000 contact limit (change number as needed).
