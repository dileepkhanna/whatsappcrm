# 🚀 TEST PROFILE - STEP BY STEP

## ⚠️ IMPORTANT: You MUST restart dev server for changes to work!

The file `frontend/src/api/client.ts` has been updated but the running dev server is still using the old code.

---

## 📋 TESTING STEPS

### Step 1: Stop Everything
```bash
# Press Ctrl+C in all terminal windows
# Or run this to kill all node processes:
taskkill /F /IM node.exe
```

### Step 2: Start Backend Server
```bash
node server.js
```
✅ Wait for: "Server is running on port 3010"

### Step 3: Start Frontend Dev Server (NEW WINDOW)
```bash
cd frontend
npm run dev
```
✅ Wait for: "Local: http://localhost:5173"

### Step 4: Start ngrok (NEW WINDOW)
```bash
ngrok http 5173
```
✅ Copy the https URL (like: https://saturate-chaperone-unblock.ngrok-free.dev)

### Step 5: Test in Browser
1. Open the ngrok URL in browser
2. Login with: dileeplekkala14@gmail.com
3. Go to Profile page
4. Open Browser Console (F12)
5. Check the logs

---

## 🔍 WHAT TO CHECK

### In Browser Console, you should see:

```
🔍 Profile Debug: {
  data: { ... },
  profile: {
    name: "Dileep Lekkala",
    email: "dileeplekkala14@gmail.com",
    ...
  },
  hasProfile: true
}
```

### On the Profile Page, you should see:
- ✅ Name: "Dileep Lekkala" (NOT "User")
- ✅ Email: "dileeplekkala14@gmail.com" (NOT "user@example.com")
- ✅ Phone number showing
- ✅ Plan badge showing

---

## 🐛 IF STILL NOT WORKING

### Check 1: Is dev server using new code?
In browser console, check the API request:
1. Open DevTools (F12)
2. Go to "Network" tab
3. Look for `/api/user/get_me` request
4. Check the "Request URL"

**Should be:** `http://localhost:5173/api/user/get_me` (or ngrok URL + /api/...)
**NOT:** Direct to 3010

### Check 2: Is backend responding?
Test directly:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3010/api/user/get_me?userOnly=true
```

### Check 3: Browser Cache
- Press Ctrl+Shift+Delete
- Clear cache and cookies
- Reload page (Ctrl+F5)

---

## 📱 QUICK TEST SCRIPT

Double-click: **RESTART-DEV-SERVER.bat**

This will:
1. Kill all node processes
2. Start frontend dev server
3. Tell you to restart ngrok

---

## ✅ AFTER IT WORKS LOCALLY

Once you see "Dileep Lekkala" on profile page:

### Deploy to Production:
```bash
cd frontend
npm run build
scp -r dist/* ec2-user@eswarigroup.in:/home/ec2-user/whatsappcrm/frontend/dist/
ssh ec2-user@eswarigroup.in "pm2 restart whatsappcrm"
```

### Test Production:
Visit: https://eswarigroup.in/user/profile

---

## 💡 WHY THIS FIX WORKS

**OLD CODE (Broken with ngrok):**
```typescript
const getBaseURL = () => {
  return `${window.location.protocol}//${window.location.host}`;
  // Returns: https://ngrok-url.com
  // API calls: https://ngrok-url.com/api/... → FAILS (backend not listening on ngrok)
}
```

**NEW CODE (Fixed):**
```typescript
const getBaseURL = () => {
  if (import.meta.env.DEV) {
    return ''; // Empty = use relative paths
    // API calls: /api/... → Vite proxy → localhost:3010 → SUCCESS!
  }
  return window.location; // Production still works fine
}
```

---

## 🎯 SUMMARY

1. ❌ **OLD**: Direct calls to ngrok URL → Backend not listening → FAIL
2. ✅ **NEW**: Relative paths → Vite proxy → localhost:3010 → SUCCESS

**Key:** Dev server MUST be restarted for code changes to load!

---

Need help? Check browser console for errors and share screenshot.
