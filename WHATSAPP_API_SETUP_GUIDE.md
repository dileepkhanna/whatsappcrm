# 📱 WhatsApp API Setup Guide for WhatsCRM v5.9.5

## Overview
WhatsCRM supports WhatsApp Meta Cloud API (Official WhatsApp Business API). This guide shows you how to configure it.

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Get WhatsApp Cloud API Credentials

1. **Go to Meta for Developers**
   - Visit: https://developers.facebook.com/
   - Login/Create account

2. **Create a Meta App**
   - Click "Create App" → Choose "Business" type
   - Fill in app details and create

3. **Add WhatsApp Product**
   - In your app dashboard → Click "Add Product"
   - Select "WhatsApp" → Click "Set Up"

4. **Get Your Credentials**
   You'll need these 4 values:
   
   | Credential | Where to Find | Example |
   |------------|---------------|---------|
   | **WABA ID** | WhatsApp → API Setup → WhatsApp Business Account ID | `123456789012345` |
   | **Access Token** | WhatsApp → API Setup → Generate Token (Permanent) | `EAAxxxxxxxxx...` |
   | **Phone Number ID** | WhatsApp → API Setup → Phone number ID | `987654321098765` |
   | **App ID** | App Dashboard → Settings → Basic | `123456789012345` |

   ⚠️ **Important**: Generate a **Permanent Access Token**, not the 24-hour temporary one!

---

### Step 2: Configure in WhatsCRM

#### Option A: Through User Panel (Recommended)

1. **Start your server**:
   ```bash
   node server.js
   ```

2. **Login as a regular user** (NOT admin):
   - URL: http://localhost:3010/login
   - Use existing user: `dileeplekkala23@gmail.com`
   - Or create new user at: http://localhost:3010/signup

3. **Navigate to Meta API Settings**:
   - Go to: Profile → Settings → Meta API
   - Or look for "WhatsApp API" section in settings

4. **Enter your credentials**:
   - WABA ID: `[paste your WABA ID]`
   - Access Token: `[paste your access token]`
   - Business Phone Number ID: `[paste your phone number ID]`
   - App ID: `[paste your app ID]`

5. **Click Save** - System will validate credentials automatically

#### Option B: Direct Database Insert

1. **Find your user ID**:
   ```sql
   SELECT uid, email FROM user;
   ```

2. **Edit and run the SQL file**:
   - Open: `setup_whatsapp_api.sql`
   - Replace placeholder values with your actual credentials
   - Replace `uid = 1` with your actual user ID
   - Run the SQL script in MySQL

---

### Step 3: Configure Webhook (Required for Receiving Messages)

1. **In Meta App Dashboard**:
   - Go to: WhatsApp → Configuration → Webhook

2. **Set Callback URL**:
   ```
   http://YOUR_PUBLIC_URL/api/webhook/meta
   ```
   
   ⚠️ **For local testing**: You need a public URL
   - Use ngrok: `ngrok http 3010`
   - Use your server's public IP/domain
   - Meta cannot reach `localhost`

3. **Set Verify Token**:
   - Any secret string (you choose this)
   - Example: `mySecretToken123`
   - Save this in `web_private` table if needed

4. **Subscribe to Webhook Fields**:
   - ✅ messages
   - ✅ message_status
   - ✅ message_echoes (optional)

---

## ✅ Verify Your Setup

### Test 1: Check Database
```sql
SELECT * FROM meta_api WHERE uid = 1;
```
You should see your credentials stored.

### Test 2: Send a Test Message

1. **Via Admin Panel**:
   - Login as user
   - Go to: Inbox → New Message
   - Select your WhatsApp number
   - Send to: Your test WhatsApp number
   - Format: `+1234567890` (with country code)

2. **Check Response**:
   - ✅ Success = API configured correctly
   - ❌ Error = Check credentials or webhook

---

## 📋 Credential Checklist

Before saving, verify you have:

- [ ] **WABA ID** - 15 digit number
- [ ] **Access Token** - Starts with `EAA`, very long string
- [ ] **Phone Number ID** - 15 digit number
- [ ] **App ID** - Your Meta App ID
- [ ] **Permanent Token** - Not the 24-hour temporary token
- [ ] **Webhook configured** - With public URL
- [ ] **Webhook subscribed** - To messages field

---

## 🔍 Troubleshooting

### Error: "Please fill your meta API keys"
- **Cause**: Credentials not in database
- **Fix**: Re-save credentials through UI or check database

### Error: "Invalid access token"
- **Cause**: Using temporary 24-hour token
- **Fix**: Generate permanent system user token

### Error: "Phone number not found"
- **Cause**: Wrong Business Phone Number ID
- **Fix**: Copy correct ID from Meta dashboard

### Not receiving messages
- **Cause**: Webhook not configured or not accessible
- **Fix**: 
  1. Check webhook URL is public (not localhost)
  2. Verify webhook subscription in Meta dashboard
  3. Check server logs for incoming webhook calls

### Error: "WABA not found"
- **Cause**: Wrong WABA ID
- **Fix**: Verify you copied the correct WhatsApp Business Account ID

---

## 🎯 Quick Reference

### API Endpoints Used
- **Send Message**: `POST /api/user/send_message`
- **Receive Webhook**: `POST /api/webhook/meta`
- **Update Config**: `POST /api/user/update_meta`
- **Get Config**: `GET /api/user/get_meta_keys`

### Database Table
- **Table**: `meta_api`
- **Key Fields**: `uid`, `waba_id`, `access_token`, `business_phone_number_id`, `app_id`

### Required Permissions
Your Meta App needs these permissions:
- `whatsapp_business_messaging`
- `whatsapp_business_management`

---

## 📚 Additional Resources

- **Meta WhatsApp Cloud API Docs**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **Getting Started Guide**: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
- **Webhook Setup**: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

---

## 💡 Tips

1. **Test with WhatsApp Test Number**: Meta provides a test number with 5 free test recipients
2. **Use System User Token**: For permanent access, create a system user in Meta Business Manager
3. **Monitor Webhook Logs**: Check your server logs to debug webhook issues
4. **Rate Limits**: Free tier has message limits, upgrade for production use

---

## ⚠️ Important Notes

- **Access tokens expire**: Generate permanent tokens using System Users in Meta Business Manager
- **Webhook must be HTTPS**: For production, use SSL certificate
- **Phone number format**: Always use international format with country code
- **Testing limits**: Test numbers have recipient limits (usually 5 numbers)

---

Need help? Check the WhatsCRM documentation or Meta's official WhatsApp API documentation.
