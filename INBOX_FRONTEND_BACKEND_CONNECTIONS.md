# Inbox Frontend-Backend Connections Analysis

## Overview
This document maps the frontend-backend connections for the Inbox feature in WhatsCRM.

---

## 🔌 API Endpoints

### 1. **Get Meta API Keys** (for "From" dropdown)
**Frontend Request:**
```javascript
GET /api/user/get_meta_keys
Headers: { Authorization: Bearer <token> }
```

**Backend Handler:** `routes/user.js:950`
```javascript
router.get("/get_meta_keys", validateUser, async (req, res) => {
  const data = await query(`SELECT * FROM meta_api WHERE uid = ?`, [req.decode.uid]);
  if (data.length < 1) {
    res.json({ success: true, data: {} });
  } else {
    res.json({ success: true, data: data[0] }); // ⚠️ Returns SINGLE OBJECT, not array
  }
});
```

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "uid": "N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t",
    "access_token": "...",
    "business_phone_number_id": "1106994085838127",
    "display_phone_number": "+91 87126 55512",
    "waba_id": "1495715455014740",
    // ... other fields
  }
}
```

**⚠️ Important:** `data.data` is a **single object**, NOT an array!

---

### 2. **Get Chats List** (sidebar conversation list)
**Frontend Request:**
```javascript
GET /api/inbox/get_chats
Headers: { Authorization: Bearer <token> }
```

**Backend Handler:** `routes/inbox.js:650`
```javascript
router.get("/get_chats", validateUser, async (req, res) => {
  // ✅ FIXED: Now queries beta_chats (was 'chats' before)
  data = await query(`SELECT * FROM beta_chats WHERE uid = ? ORDER BY updatedAt DESC`, [req.decode.uid]);
  res.json({ data, success: true });
});
```

**Database Table:** `beta_chats`
- `chat_id` (e.g., "meta_919876543210")
- `sender_name`
- `sender_mobile`
- `last_message` (JSON)
- `unread_count`
- `updatedAt`

---

### 3. **Get Conversation Messages** (message thread)
**Frontend Request:**
```javascript
POST /api/inbox/get_convo
Body: { chatId: "meta_919876543210" }
Headers: { Authorization: Bearer <token> }
```

**Backend Handler:** `routes/inbox.js:675`
```javascript
router.post("/get_convo", validateUser, async (req, res) => {
  const { chatId } = req.body;
  const filePath = `${__dirname}/../conversations/inbox/${req.decode.uid}/${chatId}.json`;
  const data = readJSONFile(filePath, 100);
  res.json({ data, success: true });
});
```

**Data Source:** JSON file at `/conversations/inbox/{uid}/{chatId}.json`

**⚠️ Issue:** Messages are also stored in `beta_conversation` table, but this endpoint only reads from JSON files.

---

### 4. **Send Text Message** (primary send function)
**Frontend Request:**
```javascript
POST /api/inbox/send_text
Body: {
  text: "Hello",
  toNumber: "919948318650",
  toName: "Dileep",
  chatId: "meta_919948318650"
}
Headers: { Authorization: Bearer <token> }
```

**Backend Handler:** `routes/inbox.js:1000`
```javascript
router.post("/send_text", validateUser, checkPlan, async (req, res) => {
  const { text, toNumber, toName, chatId } = req.body;
  
  const msgObj = {
    type: "text",
    text: { preview_url: true, body: text }
  };
  
  const savObj = {
    type: "text",
    senderName: toName,
    senderMobile: toNumber,
    status: "sent",
    route: "OUTGOING",
    // ... other fields
  };
  
  // Calls sendMetaMsg() which:
  // 1. Sends to WhatsApp Cloud API
  // 2. Saves to JSON file (addObjectToFile)
  // 3. ✅ NOW saves to beta_conversation table (after our fix)
  // 4. Updates beta_chats table
  const resp = await sendMetaMsg(req.decode.uid, msgObj, toNumber, savObj, chatId);
  res.json(resp);
});
```

**What happens:**
1. **WhatsApp API Call:** `POST https://graph.facebook.com/v17.0/{phoneNumberId}/messages`
2. **Save to JSON:** `/conversations/inbox/{uid}/{chatId}.json`
3. **✅ Save to Database:** `INSERT INTO beta_conversation` (after our fix)
4. **Update Chat:** `UPDATE beta_chats SET last_message = ...`

---

### 5. **Receive WhatsApp Messages** (webhook)
**Meta Webhook Request:**
```javascript
POST /api/inbox/webhook/{uid}
Body: { /* Meta webhook payload */ }
```

**Backend Handler:** `routes/inbox.js:130`
```javascript
router.post("/webhook/:uid", async (req, res) => {
  const { uid } = req.params;
  const body = req.body;
  
  // Process message via helper/inbox/meta/index.js
  const result = await processMetaMessage({ body, uid });
  
  // Saves to:
  // 1. beta_conversation table (✅ with sentBy field after our fix)
  // 2. beta_chats table (updates last message)
  
  res.sendStatus(200);
});
```

**Processing:** `helper/inbox/meta/index.js`
- Extracts message data
- Saves to `beta_conversation` (✅ now includes `sentBy` field)
- Updates `beta_chats` with last message and unread count

---

## 📊 Database Tables

### **beta_chats** (conversation list)
```sql
CREATE TABLE beta_chats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  chat_id VARCHAR(255) NOT NULL,           -- "meta_919876543210"
  uid VARCHAR(255) NOT NULL,               -- User ID
  sender_name VARCHAR(255),                -- Contact name
  sender_mobile VARCHAR(50),               -- Contact phone
  last_message TEXT,                       -- JSON of last message
  unread_count INT DEFAULT 0,
  is_opened TINYINT(1) DEFAULT 0,
  origin VARCHAR(50),                      -- "meta"
  origin_instance_id TEXT,                 -- WhatsApp number info
  assigned_agent VARCHAR(255),
  kanban_order INT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **beta_conversation** (messages)
```sql
CREATE TABLE beta_conversation (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type VARCHAR(100),                       -- "text", "image", etc.
  chat_id VARCHAR(255) NOT NULL,           -- "meta_919876543210"
  uid VARCHAR(255) NOT NULL,               -- User ID
  status VARCHAR(50) DEFAULT 'sent',       -- "sent", "delivered", "read", "failed"
  sentBy VARCHAR(50) DEFAULT 'human',      -- ✅ FIXED: Added this column
  err TEXT DEFAULT NULL,
  metaChatId VARCHAR(255),                 -- WhatsApp message ID
  msgContext TEXT,                         -- JSON of message content
  reaction VARCHAR(50),
  timestamp BIGINT(20),
  senderName VARCHAR(255),
  senderMobile VARCHAR(50),
  star TINYINT(1) DEFAULT 0,
  route VARCHAR(50),                       -- "INCOMING" or "OUTGOING"
  context TEXT,                            -- Reply context (if replying)
  origin VARCHAR(100),                     -- "meta"
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### **meta_api** (WhatsApp credentials)
```sql
CREATE TABLE meta_api (
  id INT PRIMARY KEY AUTO_INCREMENT,
  uid VARCHAR(255) NOT NULL,
  access_token TEXT,                       -- Meta access token
  business_phone_number_id VARCHAR(255),   -- "1106994085838127"
  display_phone_number VARCHAR(50),        -- "+91 87126 55512"
  waba_id VARCHAR(255),                    -- "1495715455014740"
  webhook_url TEXT,
  verify_token TEXT,
  // ... other fields
);
```

---

## 🔧 Recent Fixes Applied

### **Fix 1: Missing `sentBy` column**
**Problem:** Messages failed to save with error: `Unknown column 'sentBy' in 'field list'`

**Solution:**
```sql
ALTER TABLE beta_conversation ADD COLUMN sentBy VARCHAR(50) DEFAULT 'human' AFTER status;
```

**Files Updated:**
- `whatscrm_schema.sql` - Added column definition
- `functions/function.js:1635` - Added `sentBy: 'human'` when saving messages
- `helper/inbox/meta/index.js:139` - Added `sentBy` with logic for incoming/outgoing

---

### **Fix 2: Wrong table references (chats → beta_chats)**
**Problem:** Code was updating old `chats` table instead of `beta_chats`

**Solution:**
```javascript
// Before
await query(`UPDATE chats SET ...`);

// After
await query(`UPDATE beta_chats SET ...`);
```

**Files Updated:**
- `functions/function.js:1647-1652`
- `routes/inbox.js:653` (already fixed)

---

### **Fix 3: Messages not saved to database**
**Problem:** `sendMetaMsg()` only saved to JSON file, not to `beta_conversation` table

**Solution:** Added database INSERT in `functions/function.js:1635-1656`
```javascript
// Save message to beta_conversation table
await query(`INSERT INTO beta_conversation SET ?`, {
  type: finalSaveMsg.type,
  chat_id: chatId,
  uid: uid,
  status: finalSaveMsg.status || 'sent',
  sentBy: 'human',
  metaChatId: finalSaveMsg.metaChatId,
  msgContext: JSON.stringify(finalSaveMsg.msgContext),
  // ... other fields
});
```

---

### **Fix 4: "From" dropdown empty in Start New Conversation**
**Problem:** Pre-compiled React code not populating dropdown from API response

**Solution:** Added JavaScript injection in `client/public/index.html`
- Monitors for "Start New Conversation" dialog
- Fetches `/api/user/get_meta_keys`
- Handles JWT token directly from `localStorage.wacrm_user`
- Converts single object response to array: `[data.data]`
- Populates Material-UI dropdown with phone numbers

**Current Status:** ⚠️ Still debugging `data.data.forEach is not a function` error
- API returns: `{success: true, data: {id: 1, display_phone_number: "..."}}`
- Need to wrap in array: `[data.data]` before iterating

---

## 🧪 Testing Checklist

### ✅ Working:
- [x] Inbox loads chat list from `beta_chats`
- [x] Messages display in conversation thread
- [x] Receiving messages via webhook
- [x] Messages save to `beta_conversation` with `sentBy` field
- [x] `beta_chats` updates correctly
- [x] Token authentication

### ⚠️ In Progress:
- [ ] "Start New Conversation" dropdown population (forEach error)
- [ ] Sending messages from inbox (need to test after fixing sentBy)

### 📋 To Test:
1. Send message from existing conversation
2. Start new conversation with 919948318650
3. Verify message arrives on WhatsApp
4. Verify message saves to database
5. Verify conversation appears in sidebar
6. Test reply functionality
7. Test message status updates (sent → delivered → read)

---

## 🔑 localStorage Structure

```javascript
// User token (JWT)
localStorage.wacrm_user = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// OR (alternative structure)
localStorage.wacrm_user = JSON.stringify({
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  user: { /* user data */ }
});
```

**Frontend script handles both formats:**
```javascript
let token = localStorage.getItem('wacrm_user');
try {
  const userData = JSON.parse(token);
  if (userData.token) token = userData.token;
} catch (e) {
  // Token is already a string, use directly
}
```

---

## 🚀 Next Steps

1. **Fix dropdown forEach error:**
   - Update script to handle `data.data` as single object
   - Convert to array: `const metaKeys = [data.data];`

2. **Test message sending end-to-end:**
   - Send test message to 919948318650
   - Verify WhatsApp delivery
   - Check `beta_conversation` table
   - Check `beta_chats` update

3. **Monitor logs for errors:**
   ```bash
   pm2 logs whatscrm --lines 50
   ```

4. **Verify all database columns exist:**
   ```sql
   DESCRIBE beta_conversation;
   DESCRIBE beta_chats;
   ```

---

## 📞 Support Contact
- **Your Number:** 919948318650
- **WhatsApp Business:** +91 87126 55512
- **Domain:** https://dileepkhanna.dev
- **User:** dileeplekkala23@gmail.com

---

**Last Updated:** June 19, 2026
**Status:** 🟡 Fixes applied, testing in progress
