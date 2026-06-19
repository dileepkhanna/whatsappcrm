# WhatsApp Forms - Complete Testing Guide

**Date**: June 19, 2026  
**Status**: ✅ Database Fixed, Ready for Testing

---

## ✅ FIXES APPLIED

1. **Database**: Added `err` column to `beta_api_logs` table ✅
2. **Application**: Restarted successfully (PM2 process ID: 3110682) ✅
3. **Schema File**: Updated locally for future deployments ✅

---

## 🧪 HOW TO TEST WHATSAPP FORMS

### Understanding the 24-Hour Rule

WhatsApp has a **strict 24-hour messaging window**:
- ✅ Can send ANY message type (including forms) if user messaged you < 24 hours ago
- ❌ CANNOT send unless you use approved Message Templates
- This is WhatsApp policy, not a bug

---

## 🎯 TEST METHOD 1: Self-Test (Easiest)

### Step 1: Send Message to Yourself
From your phone (+91 87126 55512):
1. Open WhatsApp
2. Send a message to **your own number**: +91 87126 55512
3. You should receive it immediately

### Step 2: Send Form to Yourself
1. Login to https://dileepkhanna.dev
2. Go to **WhatsApp Forms** page
3. Select any form
4. Click **Send Form**
5. Enter recipient: **+918712655512** (your own number)
6. Click Send

### Step 3: Verify Success
✅ **Expected Result**:
- Form sends successfully (real, not just alert)
- You receive WhatsApp Form on your phone
- Check `beta_api_logs` table for entry with `status = 'sent'`

❌ **If it fails**:
- Check `beta_api_logs` table
- Look at `err` column for error details
- Error 131047 = 24-hour window expired (wait and retry)

---

## 🎯 TEST METHOD 2: Test with Real User

### Step 1: Get Fresh 24-Hour Window
Option A: Ask someone to message your business number first
```
1. Give them your WhatsApp Business number: +91 87126 55512
2. Ask them to send any message (e.g., "Hi")
3. You now have 24-hour window
```

Option B: Reply to existing chat
```
1. Check your inbox for any incoming message
2. That contact has 24-hour window open
3. Use that number for testing
```

### Step 2: Send Form
1. Login to https://dileepkhanna.dev
2. Navigate to **WhatsApp Forms**
3. Select form to send
4. Enter the contact's number
5. Click Send

### Step 3: Verify
- Check if recipient received the form on WhatsApp
- Check `beta_api_logs` in database
- Check Meta Business Manager insights

---

## 🎯 TEST METHOD 3: Check Database Logs

### After Sending Any Form:

```sql
-- Connect to database
sudo mysql whatscrm_prod

-- Check recent API logs
SELECT 
  id,
  uid,
  msg_id,
  status,
  SUBSTRING(err, 1, 200) as error_preview,
  createdAt
FROM beta_api_logs 
ORDER BY createdAt DESC 
LIMIT 10;

-- Check for failures
SELECT 
  msg_id,
  status,
  err
FROM beta_api_logs 
WHERE status = 'failed' 
ORDER BY createdAt DESC 
LIMIT 5;

-- Exit
EXIT;
```

### What to Look For:

**✅ Success Scenario**:
```
status: 'sent'
err: NULL
msg_id: 'wamid.xxx...'
```

**❌ 24-Hour Window Error**:
```
status: 'failed'
err: {"error": {"code": 131047, "message": "Message failed to send because more than 24 hours have passed..."}}
```

**❌ Invalid Phone Number**:
```
status: 'failed'
err: {"error": {"code": 100, "message": "Invalid parameter..."}}
```

---

## 🔍 MONITORING & DEBUGGING

### Check Application Logs
```bash
# On production server
ssh ec2-user@13.205.34.169

# View real-time logs
pm2 logs whatscrm --lines 50

# View only errors
pm2 logs whatscrm --err --lines 100

# View specific time
pm2 logs whatscrm --timestamp
```

### Check Webhook Activity
```bash
# Check if webhooks are receiving data
cd /var/www/whatscrm/routes/
sudo tail -f log.txt

# Check webhook payloads
sudo cat data.json | jq .
```

### Check Meta API Status
```bash
# Test Meta API connection
curl -X GET \
  "https://graph.facebook.com/v20.0/1106994085838127?fields=verified_name,code_verification_status,display_phone_number,quality_rating" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 📊 VERIFY IN META BUSINESS MANAGER

### Step 1: Login
https://business.facebook.com/

### Step 2: Check Message Insights
1. Go to **WhatsApp Manager**
2. Select your number: +91 87126 55512
3. Click **Insights** → **Messages**
4. Check:
   - Messages sent count (should increase)
   - Delivered count
   - Read count
   - Failed count

### Step 3: Check Quality Rating
1. In WhatsApp Manager
2. Go to **Phone Numbers**
3. Check **Quality Rating**: Should be GREEN
4. Check **Status**: Should be CONNECTED

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue 1: "Sent Successfully" but Form Not Received

**Possible Causes**:
1. 24-hour window expired ⏰
2. Invalid phone number format 📱
3. Recipient blocked your number 🚫
4. Meta API rate limit reached 📊

**Solution**:
- Check `beta_api_logs.err` column for actual error
- Ensure phone number format: +[country_code][number] (no spaces)
- Verify 24-hour window is active
- Check Meta Business Manager for restrictions

---

### Issue 2: Database Errors in Logs

**Before Fix** (should NOT happen anymore):
```
Error: ER_BAD_FIELD_ERROR: Unknown column 'err' in 'field list'
```

**After Fix** (should be gone):
✅ No more database errors
✅ Errors logged properly in `err` column

**If still seeing errors**:
```bash
# Verify column exists
sudo mysql whatscrm_prod -e "DESCRIBE beta_api_logs;"

# Should show 'err' column
# If not, re-run the ALTER TABLE command
```

---

### Issue 3: "From" Dropdown Empty

**Status**: Known frontend limitation (pre-compiled React)

**Workaround**:
1. Don't use "Start New Conversation" dialog
2. Instead, go directly to **WhatsApp Forms** page
3. Use the "Send Form" button there
4. OR reply to existing chats in Inbox

**Why**: React component doesn't properly display Meta API config. Backend works fine.

---

## 🎓 UNDERSTANDING WHATSAPP MESSAGING RULES

### Business-Initiated Messages

**Type 1: Template Messages**
- ✅ Can send anytime (no 24-hour limit)
- ✅ Can send to cold contacts
- ❌ Must be pre-approved by Meta
- ❌ Limited content customization
- Use for: Notifications, appointments, order updates

**Type 2: Interactive Messages (Forms, Buttons, Lists)**
- ❌ Requires 24-hour window
- ✅ Full customization
- ✅ Rich interactions
- Use for: Active conversations, customer support

### Customer-Initiated Messages

**When customer messages you**:
- ✅ 24-hour window opens automatically
- ✅ Can send any message type (text, forms, buttons, etc.)
- ✅ No template approval needed
- ⏰ Window expires 24 hours after customer's last message

---

## 📋 TESTING CHECKLIST

Before marking as "Working":

- [ ] Database `err` column exists and is writable
- [ ] Application restarted without errors
- [ ] Sent test form to valid phone number (with 24h window)
- [ ] Recipient confirmed receiving the form
- [ ] Checked `beta_api_logs` table shows `status = 'sent'`
- [ ] No database errors in PM2 logs
- [ ] Meta Business Manager shows message in insights
- [ ] Quality rating remains GREEN

After marking as "Working":

- [ ] Documented the 24-hour window requirement for users
- [ ] Created approved Message Templates for cold outreach
- [ ] Trained team on WhatsApp messaging policies
- [ ] Set up monitoring alerts for failed messages

---

## 🔗 USEFUL LINKS

**Meta Documentation**:
- Flows API: https://developers.facebook.com/docs/whatsapp/flows
- 24-Hour Window: https://developers.facebook.com/docs/whatsapp/pricing#conversations
- Message Templates: https://developers.facebook.com/docs/whatsapp/message-templates
- Error Codes: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

**Your Resources**:
- Meta Business Manager: https://business.facebook.com/
- WhatsCRM Dashboard: https://dileepkhanna.dev/
- Server IP: 13.205.34.169
- WhatsApp Business Number: +91 87126 55512

---

## 📞 SUPPORT

**If Issues Persist**:

1. **Check Logs First**:
   ```bash
   pm2 logs whatscrm --lines 200 > /tmp/whatscrm_logs.txt
   ```

2. **Check Database**:
   ```bash
   sudo mysql whatscrm_prod -e "SELECT * FROM beta_api_logs ORDER BY createdAt DESC LIMIT 5\\G"
   ```

3. **Contact Meta Support**:
   - Meta Business Support: https://www.facebook.com/business/help
   - WhatsApp Business API Support: https://developers.facebook.com/support/

4. **WhatsCRM Support**:
   - CodeCanyon: https://codecanyon.net/item/whatscrm/51122205
   - Author: Check your purchase page for support email

---

**Last Updated**: June 19, 2026  
**Next Action**: Test sending WhatsApp Forms using Method 1 (Self-Test)  
**Expected Result**: Form sends successfully after following test method
