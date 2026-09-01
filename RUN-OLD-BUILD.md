# 🔄 Run Old & New Builds Side-by-Side

## Goal
Run the old build (before changes) on port 8080 and new build (with changes) on another port for comparison.

## Prerequisites
You need a simple HTTP server. Here are the options:

---

## Option 1: Using http-server (Recommended) ✅

### Step 1: Install http-server globally
```bash
npm install -g http-server
```

### Step 2: Copy old dist folder
First, backup your current dist folder:
```bash
cd frontend
mkdir dist-old
xcopy /E /I dist dist-old
```

### Step 3: Build new version
```bash
npm run build
# This creates the NEW build in dist/
```

### Step 4: Run old build on port 8080
Open a NEW terminal window:
```bash
cd frontend
http-server dist-old -p 8080 -P http://localhost:3010
```

### Step 5: Run new build on port 8081
Open ANOTHER terminal window:
```bash
cd frontend
http-server dist -p 8081 -P http://localhost:3010
```

### Step 6: Compare
- **Old Design**: http://localhost:8080
- **New Design**: http://localhost:8081

---

## Option 2: Using Python (If you have Python) 🐍

### Step 1: Backup old dist
```bash
cd frontend
mkdir dist-old
xcopy /E /I dist dist-old
npm run build
```

### Step 2: Run old build (Terminal 1)
```bash
cd frontend/dist-old
python -m http.server 8080
```

### Step 3: Run new build (Terminal 2)
```bash
cd frontend/dist
python -m http.server 8081
```

### Access
- **Old**: http://localhost:8080
- **New**: http://localhost:8081

---

## Option 3: Using serve package 📦

### Install
```bash
npm install -g serve
```

### Run old build
```bash
cd frontend
serve dist-old -p 8080
```

### Run new build
```bash
cd frontend
serve dist -p 8081
```

---

## Option 4: Quick Batch Script 🚀

I can create a batch script that does everything automatically:

**run-comparison.bat:**
```batch
@echo off
echo ========================================
echo Setting up Old vs New Build Comparison
echo ========================================

cd frontend

REM Check if dist-old exists
if not exist "dist-old" (
    echo Backing up old dist folder...
    mkdir dist-old
    xcopy /E /I /Y dist dist-old
    echo Old build backed up!
)

echo.
echo Starting servers...
echo - Old build: http://localhost:8080
echo - New build: http://localhost:8081
echo.

REM Start old build server
start "Old Build - Port 8080" cmd /k "cd dist-old && python -m http.server 8080"

REM Wait 2 seconds
timeout /t 2 >nul

REM Start new build server
start "New Build - Port 8081" cmd /k "cd dist && python -m http.server 8081"

echo.
echo ========================================
echo Servers are running!
echo ========================================
echo.
echo Old Build: http://localhost:8080
echo New Build: http://localhost:8081
echo.
echo Press any key to open browsers...
pause

start http://localhost:8080/user/subscription
start http://localhost:8081/user/subscription

echo.
echo To stop servers, close the terminal windows.
pause
```

---

## What I Recommend 🎯

**Use Option 1 (http-server)** because:
- Simple to install
- Works well with SPAs
- Supports proxy (for API calls)
- No CORS issues

### Quick Setup:

1. **Install http-server:**
   ```bash
   npm install -g http-server
   ```

2. **I'll create a script for you:**
   (Creating script now...)

---

## Important Notes ⚠️

### API Calls
Both old and new builds will make API calls to `http://localhost:3010`, so make sure your backend is running:

```bash
node server.js
```

### Login First
You need to login to see the subscription page. Use:
- Email: dileeplekkala14@gmail.com
- Password: [your password]

### Browser Tabs
Open two browser tabs/windows side by side:
- Left: Old design (port 8080)
- Right: New design (port 8081)

---

## Troubleshooting

### If ports are already in use:
```bash
# Check what's running on port 8080
netstat -ano | findstr :8080

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### If API calls fail:
Make sure backend is running on port 3010:
```bash
node server.js
```

### If login doesn't work:
Clear cookies/localStorage and login again in each tab.

---

## After Comparison

Once you're happy with the new design:

1. Stop both servers (Ctrl+C in terminals)
2. Deploy the new build to production:
   ```bash
   cd frontend
   npm run build
   scp -r dist/* ec2-user@eswarigroup.in:/home/ec2-user/whatsappcrm/frontend/dist/
   ssh ec2-user@eswarigroup.in "pm2 restart whatsappcrm"
   ```

3. Optionally delete the old backup:
   ```bash
   rmdir /s /q dist-old
   ```
