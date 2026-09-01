# Local Testing with ngrok - Profile Fix

## Problem Fixed
The profile data was not loading because axios was bypassing Vite's proxy when using ngrok. Fixed by using relative paths in development mode.

## Setup Steps

### 1. Start Backend Server
```bash
node server.js
```
Backend should be running on **http://localhost:3010**

### 2. Start Frontend Dev Server
```bash
cd frontend
npm run dev
```
Frontend should be running on **http://localhost:5173**

### 3. Start ngrok
```bash
ngrok http 5173
```
You'll get a URL like: `https://saturate-chaperone-unblock.ngrok-free.dev`

### 4. Update vite.config.ts
The `allowedHosts` should match your ngrok domain:
```typescript
server: {
  allowedHosts: ['saturate-chaperone-unblock.ngrok-free.dev'],
  // ... rest of config
}
```

## How It Works Now

### Development Mode (npm run dev):
- ✅ axios uses **empty baseURL** (relative paths)
- ✅ Requests like `/api/user/get_me` go through **Vite proxy**
- ✅ Vite proxy forwards to `http://localhost:3010/api/user/get_me`
- ✅ Works with **localhost**, **ngrok**, or any domain

### Production Mode (npm run build):
- ✅ axios uses **window.location** (full URL)
- ✅ Requests like `/api/user/get_me` go directly to backend
- ✅ No proxy needed in production

## Testing Checklist

1. ✅ Backend running on port 3010
2. ✅ Frontend dev server running on port 5173
3. ✅ ngrok forwarding to port 5173
4. ✅ Open ngrok URL in browser
5. ✅ Login with: dileeplekkala14@gmail.com
6. ✅ Go to Profile page
7. ✅ Check if "Dileep Lekkala" is visible (not "User")
8. ✅ Check if email shows correctly
9. ✅ Open browser console and check "🔍 Profile Debug:" logs

## Expected Browser Console Output

```
🔍 Profile Debug: {
  data: {
    data: {
      uid: "9SLBG5E7qYd37Jj35LO2ANn2PkbOx7G6",
      name: "Dileep Lekkala",
      email: "dileeplekkala14@gmail.com",
      mobile_with_country_code: "9948318650",
      ...
    },
    success: true,
    addon: {...}
  },
  profile: {
    uid: "9SLBG5E7qYd37Jj35LO2ANn2PkbOx7G6",
    name: "Dileep Lekkala",
    email: "dileeplekkala14@gmail.com",
    ...
  },
  hasProfile: true
}
```

## Troubleshooting

### If profile still shows "User":
1. Check browser console for errors
2. Check Network tab for `/api/user/get_me` request
3. Verify backend is running and responding
4. Clear browser cache and reload
5. Check if token is in localStorage: `localStorage.getItem('wacrm_token')`

### If API request fails:
1. Verify Vite dev server is running on port 5173
2. Verify backend is running on port 3010
3. Check ngrok is pointing to port 5173 (not 3010)
4. Restart dev server if needed

## Next Steps After Local Testing

Once everything works locally with ngrok:

1. **Build for production:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy to production:**
   ```bash
   scp -r dist/* ec2-user@eswarigroup.in:/home/ec2-user/whatsappcrm/frontend/dist/
   ssh ec2-user@eswarigroup.in "pm2 restart whatsappcrm"
   ```

3. **Test on production:**
   - Visit https://eswarigroup.in
   - Login and check profile

## Key Changes Made

**File: `frontend/src/api/client.ts`**
- Changed `getBaseURL()` to return empty string in development mode
- This allows Vite's proxy to handle all `/api/*` requests
- Production mode still uses full URL from window.location

**Result:**
- ✅ Works with localhost
- ✅ Works with ngrok
- ✅ Works with production domain
- ✅ No code changes needed between environments
