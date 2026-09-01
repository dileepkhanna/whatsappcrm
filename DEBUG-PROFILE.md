# 🐛 DEBUG PROFILE ISSUE

## Current Problem
Profile shows "User" and "user@example.com" instead of real data.

## Quick Diagnostic

### Step 1: Check if you're using Dev Server or Production Build

Open the page and press **F12**, then check the **Sources** tab:

**If you see:**
- `localhost:5173` or `ngrok-url` with `.tsx` files → You're on **DEV SERVER** ✅
- `index-XXXXX.js` minified files → You're on **PRODUCTION BUILD** ❌

**Problem:** If you're testing a production build locally, the API proxy won't work!

### Step 2: Verify Dev Server is Running

Check your terminals:

**Terminal 1 - Backend:**
```bash
node server.js
```
Should show: `Server is running on port 3010`

**Terminal 2 - Frontend DEV:**
```bash
cd frontend
npm run dev
```
Should show: 
```
VITE v5.x.x  ready in XXX ms
➜  Local:   http://localhost:5173/
```

**Terminal 3 - ngrok:**
```bash
ngrok http 5173
```
Note the https URL

### Step 3: Browser Console Check

Open ngrok URL, go to Profile, press F12, check Console:

**Look for:** `🔍 Profile Debug:`

**Expected:**
```javascript
{
  fullResponse: { data: { ... }, status: 200 },
  profile: { name: "Dileep Lekkala", email: "dileeplekkala14@gmail.com", ... },
  hasProfile: true,
  profileName: "Dileep Lekkala",
  profileEmail: "dileeplekkala14@gmail.com",
  token: "eyJhbGciOiJIUzI1NiIsInR..."
}
```

**If you see:**
```javascript
{
  profile: undefined,
  hasProfile: false
}
```
→ API is not returning data!

### Step 4: Network Tab Check

1. Open DevTools (F12)
2. Go to **Network** tab
3. Reload profile page
4. Find **`get_me`** request

**Check these:**

**Request URL should be:**
- ✅ `http://localhost:5173/api/user/get_me?userOnly=true`
- ✅ OR `https://your-ngrok-url/api/user/get_me?userOnly=true`
- ❌ NOT `http://localhost:3010/api/...` (this bypasses proxy!)

**Request Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```
Token should be present!

**Response (Preview tab):**
Should show:
```json
{
  "data": {
    "uid": "9SLBG5E7qYd37Jj35LO2ANn2PkbOx7G6",
    "name": "Dileep Lekkala",
    "email": "dileeplekkala14@gmail.com",
    ...
  },
  "success": true,
  "addon": {}
}
```

**If Response shows:**
```json
{
  "msg": "No token found",
  "logout": true
}
```
→ Token is not being sent! Check localStorage.

### Step 5: Test Backend Directly

Open a new terminal and test the backend API directly:

**Windows:**
```bash
curl http://localhost:3010/api/user/get_me?userOnly=true -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

To get your token:
1. Open browser console
2. Type: `localStorage.getItem('wacrm_token')`
3. Copy the token
4. Use it in the curl command above

**Expected Response:**
Should show user data in JSON format

---

## Common Issues & Solutions

### Issue 1: Using Production Build Instead of Dev Server
**Symptom:** No console logs, minified JS files
**Solution:** 
```bash
cd frontend
npm run dev
```
Then use ngrok on port 5173

### Issue 2: Dev Server Not Restarted
**Symptom:** Old code still running
**Solution:**
1. Stop dev server (Ctrl+C)
2. Start again: `npm run dev`
3. Hard refresh browser (Ctrl+F5)

### Issue 3: Wrong ngrok Port
**Symptom:** API calls fail
**Solution:** ngrok should point to **5173** (dev server), NOT 3010 (backend)
```bash
ngrok http 5173
```

### Issue 4: No Token in Browser
**Symptom:** API returns "No token found"
**Solution:** 
1. Logout
2. Login again
3. Check: `localStorage.getItem('wacrm_token')`

### Issue 5: Backend Not Running
**Symptom:** API calls timeout or fail
**Solution:**
```bash
node server.js
```
Check for any errors in backend terminal

### Issue 6: Database Not Connected
**Symptom:** Backend starts but queries fail
**Solution:** Check `.env` file has correct database credentials

---

## Step-by-Step Fresh Start

If nothing works, start completely fresh:

### 1. Kill Everything
```bash
taskkill /F /IM node.exe
taskkill /F /IM ngrok.exe
```

### 2. Start Backend
```bash
node server.js
```
Wait for: "Server is running on port 3010"

### 3. Start Frontend Dev Server
```bash
cd frontend
npm run dev
```
Wait for: "Local: http://localhost:5173"

### 4. Test Locally First (No ngrok)
Open: http://localhost:5173
Login and check profile

**Does it work?**
- ✅ YES → Problem is with ngrok setup
- ❌ NO → Problem is with backend/database

### 5. If Local Works, Add ngrok
```bash
ngrok http 5173
```
Update vite.config.ts with ngrok domain in `allowedHosts`

---

## What to Share for Help

If still not working, share:

1. **Console output:** Screenshot of "🔍 Profile Debug:" log
2. **Network tab:** Screenshot of `/api/user/get_me` request and response
3. **Terminal output:** What do you see in backend and frontend terminals?
4. **localStorage token:** Result of `localStorage.getItem('wacrm_token')`

---

## Quick Test: Is the Fix Applied?

In browser console, run:
```javascript
fetch('/api/user/get_me?userOnly=true', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('wacrm_token')
  }
}).then(r => r.json()).then(console.log)
```

This should return your user data. If it doesn't, the problem is with backend/auth, not frontend.
