# Fix Message Sending Issue - Deployment Guide

## Problem
Messages were displaying in the UI but not being sent to WhatsApp or saved to the database properly.

## Root Causes Found
1. ✅ Missing `sentBy` column in `beta_conversation` table - **FIXED IN DATABASE**
2. ❌ `sendMetaMsg()` function not saving messages to `beta_conversation` table
3. ❌ `sendMetaMsg()` function updating old `chats` table instead of `beta_chats`
4. ❌ `saveMessageToConversation()` missing `sentBy` field

## Files Changed (Need to Upload to Server)

### 1. functions/function.js
**Line ~1635-1660** - Updated `sendMetaMsg()` function:
- Changed `chats` table references to `beta_chats`
- Added `INSERT INTO beta_conversation` to save messages to database
- Added `sentBy: 'human'` field

### 2. helper/inbox/meta/index.js
**Line ~129-150** - Updated `saveMessageToConversation()` function:
- Added `sentBy` field with logic: `messageData.sentBy || (messageData.route === 'OUTGOING' ? 'human' : 'customer')`

## Deployment Steps

### Step 1: Upload Modified Files
```bash
# On your local machine, upload the modified files to server
scp functions/function.js ec2-user@13.205.34.169:/var/www/whatscrm/functions/function.js
scp helper/inbox/meta/index.js ec2-user@13.205.34.169:/var/www/whatscrm/helper/inbox/meta/index.js
```

### Step 2: Restart the Application
```bash
# SSH into server
ssh ec2-user@13.205.34.169

# Navigate to app directory
cd /var/www/whatscrm

# Restart PM2
pm2 restart whatscrm

# Check logs for errors
pm2 logs whatscrm --lines 20
```

### Step 3: Test Message Sending
1. Go to https://dileepkhanna.dev
2. Login as: dileeplekkala23@gmail.com
3. Open Inbox
4. Select the conversation with Test User (+919876543210)
5. Send a test message: "Testing message fix"
6. **Expected Results:**
   - ✅ Message appears in UI immediately
   - ✅ Message is sent via WhatsApp API
   - ✅ Message is saved to `beta_conversation` table with `sentBy='human'`
   - ✅ Message is saved to `beta_chats` table with updated `last_message`
   - ✅ Checkmark (✓) appears when message is delivered

### Step 4: Verify in Database
```bash
# Check if message was saved to beta_conversation
sudo mysql whatscrm_prod -e "SELECT id, type, senderMobile, sentBy, status, route, timestamp FROM beta_conversation WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t' ORDER BY id DESC LIMIT 5;"

# Check if chat was updated in beta_chats
sudo mysql whatscrm_prod -e "SELECT chat_id, sender_name, sender_mobile, unread_count, updatedAt FROM beta_chats WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t' ORDER BY updatedAt DESC LIMIT 3;"
```

### Step 5: Send Real Test Message
Send a message to: **919948318650** (your number)
- Message text: "Hello! This is a test message from WhatsCRM"
- Check your WhatsApp to confirm you received it

## Alternative: Use WinSCP or FileZilla
If you prefer GUI:
1. Connect to 13.205.34.169 with your SSH key
2. Upload `/functions/function.js` 
3. Upload `/helper/inbox/meta/index.js`
4. SSH in and run `pm2 restart whatscrm`

## Rollback Plan (If Issues Occur)
If you encounter problems after deployment:
```bash
# Restore from backup (if you made one)
cp /var/www/whatscrm/functions/function.js.backup /var/www/whatscrm/functions/function.js
cp /var/www/whatscrm/helper/inbox/meta/index.js.backup /var/www/whatscrm/helper/inbox/meta/index.js

# Restart
pm2 restart whatscrm
```

## Expected Outcome
After deployment:
- ✅ Messages sent from inbox will be saved to `beta_conversation` table
- ✅ Messages will actually be sent via WhatsApp Cloud API
- ✅ Chat list (`beta_chats`) will update correctly
- ✅ Message status (sent/delivered/read) will work properly
- ✅ Both incoming and outgoing messages will have `sentBy` field populated

## Notes
- Database schema was already fixed (sentBy column added)
- These code changes complete the fix
- No database migration needed - column already exists
