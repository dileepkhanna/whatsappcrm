# 🤖 How to Use Automation Flows - Complete Guide

## ⚠️ IMPORTANT: Flows Don't "Send" - They "Respond"

**Automation flows are REACTIVE, not PROACTIVE:**
- ❌ Flows **cannot** initiate conversations
- ❌ Flows **cannot** send messages to customers first
- ✅ Flows **respond automatically** when customers message you
- ✅ Flows **trigger** based on incoming messages

---

## 🔄 How Automation Flows Work

### Step-by-Step Process:

1. **Customer sends WhatsApp message** → Your WhatsApp Business number (+91 87126 55512)
2. **Meta Cloud API receives message** → Sends webhook to your server
3. **Webhook endpoint processes** → `POST /api/inbox/webhook/:uid`
4. **System checks for active flows** → Queries `beta_flows` table where `status='active'`
5. **Flow triggers if conditions match** → Based on trigger type and keywords
6. **Flow executes automatically** → Processes nodes and sends responses

### Code Flow Path:
```
routes/inbox.js (webhook endpoint)
  ↓
helper/inbox/meta/index.js (saveMessageToConversation)
  ↓
helper/inbox/inbox.js (processMessage)
  ↓
automation/automation.js (processAutomation)
  ↓
automation/functions.js (process each node type)
```

---

## 🎯 Types of Flow Triggers

### 1. **Chatbot Trigger** (Most Common)
**Configuration in Initial Node:**
- **Trigger Type:** "Chatbot"
- **Keywords:** Specific words that activate the flow
- **Match Type:** Exact match or contains

**How it works:**
```
Customer sends: "hi"
System checks: Does any active flow have keyword "hi"?
If YES: Flow executes
If NO: Message just saves to inbox (no auto-reply)
```

**Example Keywords:**
- `hi`, `hello`, `hey` → Greeting flow
- `price`, `cost`, `payment` → Pricing flow
- `help`, `support` → Support flow
- `order`, `track` → Order tracking flow

### 2. **All Messages Trigger**
**Configuration:**
- **Trigger Type:** "All Messages"
- No keywords needed

**How it works:**
- Flow triggers for EVERY incoming message
- Good for: Welcome messages, general info bot
- ⚠️ Warning: Can interfere with human agents

### 3. **Webhook Automation Trigger**
**Configuration:**
- **Trigger Type:** "Webhook Automation"
- **Webhook URL:** Provided by system
- **Phone Number Path:** JSON path to extract phone number

**How it works:**
- External system (your website, CRM, etc.) calls webhook URL
- System extracts phone number from webhook payload
- Flow executes and sends messages to that number

**Example:**
```bash
POST https://dileepkhanna.dev/api/user/fire-webhook-automation
Content-Type: application/json

{
  "customer": {
    "phone": "919948318650",
    "name": "John"
  },
  "order_id": "12345"
}
```

---

## 📋 Step-by-Step: Testing Your Flow

### Option 1: Test with Real WhatsApp Message

1. **Check if flow is active:**
   - Go to: https://dileepkhanna.dev/user?page=chatbot
   - Find your flow
   - Make sure status is **"Active"** (not paused/draft)

2. **Note the trigger keywords:**
   - Click on Initial Node in your flow
   - Check what keywords trigger it (e.g., "hi", "hello")

3. **Send test message from another phone:**
   - Open WhatsApp on your personal phone
   - Send message to: **+91 87126 55512**
   - Type the exact keyword (e.g., "hi")

4. **Flow should respond automatically:**
   - You'll receive automated messages from the flow
   - Check your inbox at: https://dileepkhanna.dev/user?page=inbox
   - You'll see the conversation there

### Option 2: Test from Existing Conversation

1. **Open inbox:**
   - Go to: https://dileepkhanna.dev/user?page=inbox
   
2. **Open existing chat:**
   - Click on Kanna's chat (+919948318650)
   
3. **Send keyword message:**
   - Type your flow keyword in the reply box
   - Click send
   - Flow should trigger and respond

### Option 3: Check Server Logs

**SSH to server and check logs:**
```bash
ssh ec2-user@13.205.34.169
pm2 logs whatscrm --lines 50
```

**What to look for:**
```
✅ Good - Flow triggered:
"Processing automation for flow_id: abc123..."
"Sending message via flow..."

❌ Flow not active:
"User does not have any active automation flow"

❌ Keyword mismatch:
(No logs appear - message just saves to inbox)
```

---

## 🐛 Troubleshooting: Flow Not Working

### Problem 1: "User does not have any active automation flow"

**Cause:** No active flows found in database

**Solution:**
1. Check flow status in database:
```sql
SELECT flow_id, name, status 
FROM beta_flows 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```

2. Make sure flow status is `'active'` (not `'draft'` or `'paused'`)

3. Activate flow from UI:
   - Go to https://dileepkhanna.dev/user?page=chatbot
   - Click on your flow
   - Click "Activate" or "Publish"

### Problem 2: Flow Exists But Doesn't Trigger

**Possible causes:**

**A. Keyword mismatch**
- Flow keywords: `"hi"`, `"hello"`
- Customer sent: `"Hi there"` or `"HELLO"`
- Solution: Add more keyword variations or use "contains" match

**B. Wrong origin**
- Flow is set for Instagram DM
- Customer messaged via WhatsApp
- Solution: Create separate flow for WhatsApp (Chatbot origin)

**C. Session stuck in old state**
- Previous flow execution didn't complete
- Solution: Clear flow session:
```sql
DELETE FROM flow_session 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t' 
AND sender_mobile = '919948318650';
```

### Problem 3: Flow Triggers But Doesn't Send Messages

**Check:**
1. Meta API credentials valid
2. SEND_MESSAGE nodes properly configured
3. Message content not empty
4. WhatsApp 24-hour window not expired

---

## 🚀 Alternative Ways to Send Messages (Not Flows)

If you want to **initiate conversations** with customers (not wait for them to message you):

### 1. **Broadcast / Campaign Feature**
**Best for:** Sending to many customers at once

**Steps:**
1. Go to: https://dileepkhanna.dev/user?page=broadcast
2. Upload CSV with phone numbers
3. Compose message
4. Send to all

### 2. **Start New Conversation**
**Best for:** One-to-one new conversations

**Steps:**
1. Go to: https://dileepkhanna.dev/user?page=inbox
2. Click "Start New Conversation"
3. Select "From" number (your WhatsApp Business)
4. Enter customer phone number
5. Type and send message

### 3. **API Endpoint**
**Best for:** Programmatic/automated sending from your systems

**Endpoint:**
```bash
POST https://dileepkhanna.dev/api/inbox/send_message
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json
Body:
{
  "to": "919948318650",
  "message": "Hello! Your order is ready.",
  "type": "text"
}
```

---

## 📊 Flow Execution Monitoring

### Check if Flows Are Running:

**Database queries:**
```sql
-- Check active flows
SELECT flow_id, name, status, origin 
FROM beta_flows 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t' 
AND status = 'active';

-- Check flow sessions (current customer conversations in flow)
SELECT * FROM flow_session 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- Check automation logs (if table exists)
SELECT * FROM automation_logs 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Server Logs:
```bash
# Real-time logs
pm2 logs whatscrm --lines 100

# Filter for automation
pm2 logs whatscrm --lines 100 | grep -i "automation\|flow"

# Error logs only
pm2 logs whatscrm --err --lines 50
```

---

## ✅ Quick Checklist

Before asking "why isn't my flow sending messages?", verify:

- [ ] Flow status is **"active"** in database
- [ ] Flow has correct **origin** (chatbot for WhatsApp)
- [ ] Flow has **trigger keywords** configured
- [ ] Customer sent **exact keyword** that matches trigger
- [ ] Meta Cloud API is **connected** and working
- [ ] **24-hour window** not expired (for template-free messages)
- [ ] No **error logs** in PM2 output
- [ ] Flow has **SEND_MESSAGE nodes** with content
- [ ] Flow nodes are **properly connected** with edges

---

## 🎓 Summary

**Remember:**
- ✅ Flows = **Automatic responses** to customer messages
- ❌ Flows ≠ **Sending messages** to customers first
- 🔑 Triggers = **Keywords** or "all messages"
- 🎯 Testing = **Send WhatsApp message** with keyword
- 📊 Monitor = **PM2 logs** and **database queries**

**For sending messages TO customers:**
Use Broadcast, Start New Conversation, or API - NOT automation flows!
