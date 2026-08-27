# AWS Server Start Commands

## Current Status
✅ Git pull completed successfully (308 files updated)
✅ Dependencies installed
❌ PM2 process not found - need to start fresh

## Commands to Run on AWS Server

### Option 1: Start with PM2 (Recommended)
```bash
# Start the server with PM2
pm2 start server.js --name whatsappcrm

# Check status
pm2 status

# View logs
pm2 logs whatsappcrm

# Save PM2 configuration for auto-restart
pm2 save

# Setup PM2 to start on system reboot
pm2 startup
```

### Option 2: Start with Node directly (for testing)
```bash
# Start server
node server.js

# Note: This will block the terminal. Use Ctrl+C to stop.
```

### Check if Server is Running
```bash
# Check process
pm2 status

# Check logs for any errors
pm2 logs whatsappcrm --lines 50

# Check if port is listening (usually 3000 or 5000)
netstat -tuln | grep LISTEN
```

### Common PM2 Commands
```bash
# Restart
pm2 restart whatsappcrm

# Stop
pm2 stop whatsappcrm

# Delete process
pm2 delete whatsappcrm

# Monitor in real-time
pm2 monit
```

## Troubleshooting

### If you see "port already in use" error:
```bash
# Find process using port 5000 (or your port)
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### If you see database connection errors:
Check if MySQL is running:
```bash
sudo systemctl status mysqld
# or
sudo systemctl status mariadb
```

### View application logs:
```bash
pm2 logs whatsappcrm --lines 100
```

## Current Deployment Summary

**Files Changed:** 308 files
- ✅ Deleted test files and unwanted development files
- ✅ Added frontend/dist/ bundles (production build)
- ✅ Updated routes (user.js, automation/functions.js, loops/campaignBeta.js)
- ✅ Fixed inbox messages, campaign messages, flow messages
- ✅ Added "Back" button to flow builder
- ✅ Fixed chatbot toggle double-click issue
- ✅ Added upcoming features page
- ✅ Created 11 "coming soon" pages
- ✅ Fixed all missing imports and array handling errors

## Next Steps After Starting Server

1. Access your application via browser: `http://3.7.194.129:5000` (or your configured port)
2. Test the inbox to verify messages are visible
3. Test campaign creation
4. Test automation flows
5. Verify all new pages work correctly

## Important Notes

- The application is now running the production frontend bundles from `frontend/dist/`
- All backend fixes are deployed
- Database should already have data from previous installation
- Make sure `.env` file exists with correct configuration
