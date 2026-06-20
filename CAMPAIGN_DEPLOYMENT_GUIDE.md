# 📤 Campaign Processing Deployment Guide

## 🔍 Problem Summary
Campaigns are stuck in **PENDING** status with 0% progress. The campaign processing loop (`initCampaign`) was commented out in production.

## ✅ Solution
Enable the campaign processing loop by uncommenting `initCampaign()` in `app.js` and deploying to production.

---

## 📋 Pre-Deployment Checklist

### 1. Verify Local Changes
```bash
# Check that initCampaign is uncommented (line 99 in app.js)
grep -A 2 "initCampaign()" app.js
```

Should show:
```javascript
initCampaign(); // ✅ ENABLED - Process campaigns
```

### 2. Test Locally (Optional)
```bash
# Start local server
npm start

# Check logs for campaign processing
# Look for: "Campaign loop" messages
```

---

## 🚀 Production Deployment Steps

### Step 1: Connect to Production Server
```bash
ssh ec2-user@13.205.34.169
```

### Step 2: Navigate to Application Directory
```bash
cd whatscrm
```

### Step 3: Check Current Status
```bash
# Check current branch
git branch

# Check what files have local changes
git status
```

### Step 4: Resolve Git Conflict
The `client/public/index.html` file has local changes that will conflict with the pull.

**Option A: Keep local changes (recommended if phonebook fix is important)**
```bash
# Commit local changes first
git add client/public/index.html
git commit -m "Fix: Phonebook UI modal and campaign processing"
git pull origin main
```

**Option B: Discard local changes and pull fresh code**
```bash
# Stash local changes (saves them temporarily)
git stash

# Pull latest code
git pull origin main

# If you need the stashed changes later
# git stash pop
```

**Option C: Force overwrite local changes**
```bash
# ⚠️ WARNING: This will DELETE local changes permanently
git reset --hard HEAD
git pull origin main
```

### Step 5: Pull Latest Code
```bash
git pull origin main
```

You should see:
```
Updating [hash]...[hash]
Fast-forward
 app.js | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

### Step 6: Verify Changes
```bash
# Check that initCampaign is uncommented
grep -A 2 "initCampaign()" app.js
```

Should show:
```javascript
initCampaign(); // ✅ ENABLED - Process campaigns
```

### Step 7: Restart Application
```bash
pm2 restart whatscrm
```

### Step 8: Monitor Logs
```bash
# Watch logs in real-time
pm2 logs whatscrm --lines 50

# Press Ctrl+C to stop watching
```

**Look for these messages:**
- ✅ `WaCrm server is running on port 5000`
- ✅ Campaign processing messages
- ❌ `Error in campaign processing loop` (indicates issues)

### Step 9: Check Campaign Status in Database
```bash
# Connect to MySQL
mysql -u whatscrm_user -p whatscrm_prod
# Password: Whats@CRM#2026!Secure$Pass
```

```sql
-- Check campaign status
SELECT 
    campaign_id,
    title,
    status,
    total_contacts,
    sent_count,
    CONCAT(ROUND((sent_count * 100.0 / NULLIF(total_contacts, 0)), 1), '%') as progress,
    createdAt
FROM beta_campaign
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t'
ORDER BY createdAt DESC
LIMIT 5;
```

---

## 📊 How to Verify Campaigns Are Working

### 1. Status Flow
Campaigns should transition through these statuses:
```
PENDING → IN_PROGRESS → COMPLETED
```

### 2. Progress Updates
- `sent_count` should increase over time
- Progress percentage should climb towards 100%
- Check every 30 seconds (the loop interval)

### 3. Log Messages
Watch PM2 logs for:
```
Processing campaign: [campaign_id]
Sent message to: [phone_number]
Campaign [campaign_id] completed
```

### 4. Dashboard UI
- Open: https://dileepkhanna.dev
- Login as: dileeplekkala23@gmail.com
- Navigate to: Campaigns section
- Status should change from "PENDING 2" to "PROCESSING" to "COMPLETED"

---

## 🔧 Troubleshooting

### Issue: Campaigns Still Stuck at PENDING

**Check 1: Is the loop running?**
```bash
pm2 logs whatscrm | grep -i campaign
```
If no campaign messages appear, the loop might not be running.

**Check 2: Are there campaign logs?**
```sql
SELECT COUNT(*) FROM beta_campaign_logs 
WHERE campaign_id = [YOUR_CAMPAIGN_ID];
```
If count is 0, campaign was never initialized properly.

**Check 3: Meta API credentials**
```sql
SELECT * FROM meta_api 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```
Verify `access_token` and `business_phone_number_id` exist.

**Check 4: Restart loop manually**
```bash
pm2 restart whatscrm
pm2 logs whatscrm --lines 100
```

### Issue: Campaign Fails Immediately

**Check campaign logs for errors:**
```sql
SELECT * FROM beta_campaign_logs 
WHERE campaign_id = [YOUR_CAMPAIGN_ID]
AND status = 'FAILED'
LIMIT 10;
```

Common errors:
- `Meta API credentials not found` → Check meta_api table
- `Invalid access token` → Refresh Meta token
- `Template not found` → Verify template name and language

### Issue: Git Pull Fails

**Error: "Your local changes would be overwritten"**
```bash
# See what changed
git diff client/public/index.html

# Option 1: Keep changes
git add client/public/index.html
git commit -m "Local fixes"
git pull origin main

# Option 2: Discard changes
git stash
git pull origin main
```

---

## 📝 Campaign Processing Details

### Configuration (from campaignBeta.js)
```javascript
CONFIG = {
  batchSize: 20,        // Process 20 messages per batch
  checkInterval: 30000, // Check for campaigns every 30 seconds
  messageDelay: 300,    // Wait 300ms between messages
  maxRetries: 3,        // Retry failed messages 3 times
  retryDelay: 5000,     // Wait 5 seconds before retry
}
```

### Processing Flow
1. Loop checks every **30 seconds** for PENDING/IN_PROGRESS campaigns
2. For each campaign:
   - Marks campaign as `IN_PROGRESS`
   - Fetches next **20 PENDING logs** (contacts)
   - Sends WhatsApp template message to each contact
   - Updates log status: `SENT` or `FAILED`
   - Updates campaign counts
   - Waits **300ms** between messages (rate limiting)
3. When all logs are sent, marks campaign as `COMPLETED`

### Template Types Supported
- **STANDARD**: Text, image, video, document headers
- **CAROUSEL**: Multiple cards with images
- **CATALOG**: Product catalogs

---

## 🎯 Post-Deployment Verification

After deployment, verify everything works:

- [ ] Server restarted successfully
- [ ] No errors in PM2 logs
- [ ] Campaign status changed from PENDING
- [ ] sent_count is increasing
- [ ] Dashboard shows progress
- [ ] Messages delivered to WhatsApp numbers

---

## 🆘 Emergency Rollback

If something breaks after deployment:

```bash
# Stop the server
pm2 stop whatscrm

# Rollback to previous commit
git log --oneline -5  # Find previous commit hash
git reset --hard [previous-commit-hash]

# Restart server
pm2 start whatscrm

# Verify rollback
pm2 logs whatscrm
```

---

## 📞 Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs whatscrm --lines 100`
2. Check database status: Run `fix_smtp_and_campaign.sql`
3. Review this guide's troubleshooting section
4. Contact support with:
   - Campaign ID
   - Error messages from logs
   - Database query results

---

## ✨ Success Criteria

You know it's working when:

✅ PM2 logs show campaign processing messages
✅ Campaign status changes: PENDING → IN_PROGRESS → COMPLETED
✅ sent_count increases over time
✅ Dashboard shows progress percentage
✅ WhatsApp messages are delivered to contacts
✅ No errors in logs

---

**Last Updated**: Campaign processing enabled on 2026-06-20
**Status**: Ready for production deployment
