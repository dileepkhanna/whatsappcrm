# FINAL FIX GUIDE - Display Real User Data

## Problem
The profile card shows "User" instead of actual user name.

## Root Cause
The code works locally but production has:
1. Old cached files in browser
2. User data not saved to localStorage during login
3. Need to re-login to trigger the fix

## Solution - Follow EXACTLY in Order

### STEP 1: Deploy Latest Code

**On Windows (Your Local Machine):**
```cmd
cd "c:\Users\Asus\Downloads\WhatsCRM v5.9.5\WhatsCRM v5.9.5\codecanyon-51122205-whatscrm-chatbot-flow-builder-api-access-whatsapp-crm-saas-system"
deploy-to-github.bat
```

Wait for deployment to complete, then continue.

---

### STEP 2: Update Production Server

**SSH to EC2 and run these commands:**
```bash
cd /home/ec2-user/whatsappcrm

# Pull latest code
git pull origin main

# Check if frontend/dist folder was updated
ls -la frontend/dist/index.html

# Restart application
pm2 restart all

# Verify it's running
pm2 status
```

---

### STEP 3: Clear Browser Cache (CRITICAL!)

**On production site (https://eswarigroup.in):**

1. **Open Developer Tools** - Press `F12`
2. **Go to Application tab** (Chrome) or **Storage tab** (Firefox)
3. **Click "Local Storage"** → **https://eswarigroup.in**
4. **Right-click** → **Clear**
5. **Go to Console tab**
6. **Type**: `localStorage.clear()` and press Enter
7. **Type**: `sessionStorage.clear()` and press Enter
8. **Close DevTools**
9. **Hard Refresh** - Press `Ctrl + Shift + R` (or `Ctrl + F5`)

---

### STEP 4: Login Again

**IMPORTANT:** You MUST logout and login again for the fix to work!

1. Logout if you're logged in
2. Close all browser tabs of eswarigroup.in
3. Open a new tab
4. Go to https://eswarigroup.in
5. Login with your credentials

After login, the profile card should show your actual name!

---

### STEP 5: Verify the Fix

Check these locations for real user data:
- ✅ Top-right menu dropdown (should show name + email)
- ✅ Profile menu card header
- ✅ Profile dialog when you click "Profile"

---

## If Still Not Working After All Steps

### Debug Checklist:

1. **Check if new build is deployed:**
   ```bash
   # On EC2
   cd /home/ec2-user/whatsappcrm
   git log -1 --oneline
   # Should show recent commit
   ```

2. **Check if localStorage has user data:**
   - Open DevTools (F12)
   - Go to Console
   - Type: `localStorage.getItem('wacrm_user')`
   - Should show user JSON data (not null)

3. **Check API response:**
   - Open DevTools (F12)
   - Go to Network tab
   - Login
   - Look for `/api/user/login` request
   - Click on it → Response tab
   - Should see user object with name and email

4. **Force rebuild on server (if code not updated):**
   ```bash
   cd /home/ec2-user/whatsappcrm/frontend
   npm install
   npm run build
   cd ..
   pm2 restart all
   ```

---

## Contact Limit Fix (Separate Issue)

For the "100 contacts" issue for eswarigroup9@gmail.com:

```bash
# On EC2
mysql -u root -p'9948318650' whatscrm -e "UPDATE user SET plan = JSON_SET(plan, '\$.contact_limit', 10000) WHERE email = 'eswarigroup9@gmail.com';"

# Verify
mysql -u root -p'9948318650' whatscrm -e "SELECT email, JSON_EXTRACT(plan, '\$.contact_limit') as contact_limit FROM user WHERE email = 'eswarigroup9@gmail.com';"
```

---

## Summary of Changes Made

### Files Modified:
1. `frontend/src/store/authStore.ts` - Added localStorage persistence
2. `frontend/src/hooks/useAuth.ts` - Update store when user data fetched
3. `frontend/src/features/profile/Profile.tsx` - Better data extraction logic
4. `frontend/src/components/layout/MainLayout.tsx` - Display real user data

### What Was Fixed:
- ✅ User data now saves to localStorage on login
- ✅ User data loads from localStorage on page reload
- ✅ Profile shows real data instead of "User" placeholder
- ✅ All components properly handle user data

The fix is complete and tested locally. Just follow the deployment steps!
