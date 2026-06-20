# 🔧 Automation Flow Not Working - Diagnosis & Fix

## 🔍 What You're Seeing

Your screenshots show that:
- ✅ Flow IS responding to some messages ("hi" → sends form and "Hi" text)
- ❌ But you think it's "not working"

## 🧩 Understanding the System

Automation flows require **TWO database entries** to work:

### 1. **Flow Definition** (`beta_flows` table)
```sql
SELECT flow_id, name, is_active, source 
FROM beta_flows 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```
- `is_active` must be `1` (not 0)
- `source` must be `'wa_chatbot'` for WhatsApp

### 2. **Chatbot Trigger** (`beta_chatbot` table)
```sql
SELECT flow_id, origin_id, active, source 
FROM beta_chatbot 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```
- `active` must be `1` (not 0)
- `origin_id` must be `'META'` for WhatsApp Cloud API
- `source` must be `'wa_chatbot'`
- `flow_id` must match a flow in `beta_flows`

**BOTH must be active for flow to work!**

---

## 🚨 Common Problems

### Problem 1: Flow shows "User does not have any active automation flow"

**Cause:** Either:
- Flow `is_active = 0` in `beta_flows`
- Chatbot trigger `active = 0` in `beta_chatbot`
- No matching flow_id between the two tables

**Fix:** Run `fix_automation_flow.sql`

### Problem 2: Flow exists but never triggers

**Cause:** Either:
- Wrong `origin_id` (not set to 'META')
- Wrong `source` type (not 'wa_chatbot')
- Keywords don't match what customer is sending

**Fix:** 
1. Check initial node keywords in flow builder
2. Make sure customer sends EXACT keyword
3. Run diagnostic: `check_flow_status.sql`

### Problem 3: Flow triggers sometimes but not always

**Cause:** Flow session stuck in previous state

**Fix:** Clear sessions:
```sql
DELETE FROM flow_session 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```

---

## 🛠️ Step-by-Step Fix

### Step 1: Run Diagnostic

```bash
# SSH to server
ssh ec2-user@13.205.34.169

# Connect to database
mysql -u whatscrm_user -p whatscrm_prod
# Password: Whats@CRM#2026!Secure$Pass

# Run diagnostic
source /var/www/whatscrm/check_flow_status.sql
```

Look for any rows with ❌ status.

### Step 2: Run Fix Script

```bash
# In MySQL
source /var/www/whatscrm/fix_automation_flow.sql
```

This will:
- ✅ Set `is_active = 1` on all your flows
- ✅ Set `active = 1` on all chatbot triggers
- ✅ Set correct `origin_id = 'META'`
- ✅ Set correct `source = 'wa_chatbot'`
- ✅ Clear stuck flow sessions

### Step 3: Restart Application

```bash
# Exit MySQL
exit

# Restart PM2
pm2 restart whatscrm

# Watch logs
pm2 logs whatscrm --lines 50
```

### Step 4: Test the Flow

**From your phone:**
1. Open WhatsApp
2. Send message to: **+91 87126 55512**
3. Type: **"hi"** (or whatever your flow keyword is)
4. You should get automatic response

**Check logs:**
```bash
pm2 logs whatscrm --lines 100 | grep -i "automation\|flow"
```

**Good logs (flow working):**
```
Processing automation for flow_id: abc123...
Sending message via flow node...
✅ Meta message sent successfully
```

**Bad logs (flow not active):**
```
User does not have any active automation flow
```

---

## 🎯 Verify Flow Configuration in UI

Even after database fixes, you need to check the flow builder:

### 1. Go to Chatbot Page
https://dileepkhanna.dev/user?page=chatbot

### 2. Find Your Flow
- Click on the flow you created
- Make sure it says **"Active"** or **"Published"** (not "Draft")

### 3. Check Initial Node Settings

Click on the **Initial Node** (first node) and verify:

**For WhatsApp flows:**
```
Trigger Type: Chatbot (NOT Instagram/Telegram/Webhook)
Origin: WhatsApp / Meta
Keywords: hi, hello, hey (or whatever you want)
Match Type: Exact Match or Contains
```

**For Webhook flows:**
```
Trigger Type: Webhook Automation
Webhook URL: (system provides this)
Phone Number Path: customer.phone (or your JSON path)
```

### 4. Check Message Nodes

- Make sure **SEND_MESSAGE** nodes have content
- Make sure nodes are connected with edges
- Make sure flow has a clear path from Initial Node to end

---

## 📊 Quick Database Check (Without Scripts)

**Check if flow is active:**
```sql
SELECT f.flow_id, f.name, f.is_active, c.active AS chatbot_active, c.origin_id 
FROM beta_flows f
LEFT JOIN beta_chatbot c ON f.flow_id = c.flow_id AND f.uid = c.uid
WHERE f.uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```

**What you should see:**
| flow_id | name | is_active | chatbot_active | origin_id |
|---------|------|-----------|----------------|-----------|
| abc123  | My Flow | 1      | 1              | META      |

**If you see:**
- `is_active = 0` → Flow is disabled
- `chatbot_active = 0` or NULL → Trigger is disabled
- `origin_id` is empty or not 'META' → Wrong configuration

**Quick fix:**
```sql
UPDATE beta_flows SET is_active = 1 WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
UPDATE beta_chatbot SET active = 1, origin_id = 'META' WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```

---

## ✅ Final Checklist

Before saying "flow is not working", verify:

- [ ] Flow exists in `beta_flows` with `is_active = 1`
- [ ] Trigger exists in `beta_chatbot` with `active = 1`
- [ ] `flow_id` matches between both tables
- [ ] `origin_id = 'META'` for WhatsApp
- [ ] `source = 'wa_chatbot'` for both tables
- [ ] Flow shows as "Active" in UI (not Draft/Paused)
- [ ] Initial node has trigger type set to "Chatbot"
- [ ] Keywords are configured in initial node
- [ ] Customer is sending EXACT keyword
- [ ] Meta API is connected (`meta_api` table has credentials)
- [ ] Application restarted after database changes
- [ ] No errors in `pm2 logs whatscrm`
- [ ] Flow has message nodes with actual content
- [ ] Nodes are connected with edges

---

## 🆘 Still Not Working?

### Check the actual flow data:

```sql
SELECT flow_id, name, data 
FROM beta_flows 
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';
```

The `data` column contains the JSON flow definition. Check:
- Does it have nodes? `"nodes": [...]`
- Does it have edges? `"edges": [...]`
- Does initial node have trigger config?

### Check if webhook is receiving messages:

```bash
tail -f /var/www/whatscrm/logs/pm2-out.log | grep "webhook"
```

Send a WhatsApp message and see if webhook receives it.

### Enable debug mode:

Add this to your `.env`:
```
DEBUG_AUTOMATION=true
```

Then restart:
```bash
pm2 restart whatscrm
```

This will show more detailed automation logs.

---

## 🎓 Summary

**The most common issue:** Flow exists in UI but `beta_chatbot` table is missing the trigger or has `active = 0`.

**Quick fix:** Run `fix_automation_flow.sql` → Restart app → Test with keyword

**Remember:** Flows don't "send" messages proactively - they respond when customers message you!
