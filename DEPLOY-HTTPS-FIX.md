# Deploy HTTPS URL Fix to Production

## Issue Summary
Campaign header image URLs are being generated with `http://` instead of `https://` because the code was using `req.protocol` which returns `http` when behind Nginx reverse proxy.

## Files Changed
1. `.env` - Updated FRONTENDURI to use https://eswarigroup.in
2. `routes/user.js` - Line ~1105: Changed URL generation to use `process.env.FRONTENDURI`

## Deployment Steps

### Step 1: Upload Updated Code to Server
```bash
# From your local machine, upload the changed file
scp routes/user.js ec2-user@your-server-ip:/home/ec2-user/whatsappcrm/routes/
```

OR using Git (if you have a repository):
```bash
# Commit changes locally
git add routes/user.js .env
git commit -m "Fix: Use HTTPS for media URLs in production"
git push

# On the server
ssh ec2-user@your-server-ip
cd /home/ec2-user/whatsappcrm
git pull
```

### Step 2: Restart PM2 with Updated Environment
```bash
# SSH into server if not already there
ssh ec2-user@your-server-ip
cd /home/ec2-user/whatsappcrm

# Restart PM2 and reload environment variables
pm2 restart whatsappcrm --update-env

# Verify it's running
pm2 status
```

### Step 3: Test the Fix
```bash
# Watch the logs
pm2 logs whatsappcrm --lines 50

# Look for this line when you fetch template media:
# ✅ Template media found: https://eswarigroup.in/media/...
# 🌐 Using FRONTENDURI: https://eswarigroup.in
```

### Step 4: Verify in Browser
1. Go to Campaign creation page
2. Select a template with header image
3. Check the "Header Image URL" field - it should now show `https://`
4. Create a test campaign
5. Verify messages are sent successfully

## What Changed

### Before (routes/user.js ~line 1105):
```javascript
const protocol = req.protocol;  // Returns 'http' behind Nginx
const host = req.get('host');
const url = `${protocol}://${host}/media/${mediaData[0].file_name}`;
// Result: http://eswarigroup.in/media/...
```

### After:
```javascript
const url = `${process.env.FRONTENDURI}/media/${mediaData[0].file_name}`;
// Result: https://eswarigroup.in/media/...
```

## Expected Results
- ✅ New media URLs will use HTTPS
- ✅ WhatsApp templates will accept the URLs
- ✅ No more #132012 parameter format errors (related to URL protocol)
- ✅ Campaigns will send successfully

## Rollback (if needed)
```bash
cd /home/ec2-user/whatsappcrm
git checkout HEAD~1 routes/user.js
pm2 restart whatsappcrm
```

## Alternative Solution (Not Recommended)
Instead of changing the code, you could configure Nginx to forward the correct protocol:

```nginx
# In your Nginx config, add this header:
proxy_set_header X-Forwarded-Proto $scheme;

# And in server.js, add Express trust proxy:
app.set('trust proxy', true);
```

However, using `process.env.FRONTENDURI` is cleaner and more explicit.
