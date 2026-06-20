# 📝 WhatsApp Forms - Bulk Send Guide

## 🔍 Current Limitation

Currently, the WhatsApp Forms feature only supports sending to **one phone number at a time** through the UI.

## ✅ Solutions to Send to Multiple Numbers

### Option 1: Use Phonebook + New Bulk Send Feature (RECOMMENDED)

I'll add a new feature that allows you to:
1. Select a form
2. Choose a phonebook (with multiple contacts)
3. Send the form to all contacts in the phonebook

### Option 2: API Integration (For Developers)

Use the API to send forms programmatically to multiple numbers:

```javascript
// Example: Send form to multiple numbers
const formId = 1; // Your form ID
const phoneNumbers = [
  '919876543210',
  '919876543211',
  '919876543212'
];

for (const phone of phoneNumbers) {
  await fetch('https://dileepkhanna.dev/api/waform/send-form', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      id: formId,
      to: phone
    })
  });
  
  // Wait 1 second between messages (rate limiting)
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### Option 3: Manual Repeat (Current Method)

1. Click **Send** button on a form
2. Enter phone number
3. Send
4. Repeat for each number

**Limitation**: Time-consuming for many contacts

---

## 🚀 Adding Bulk Send Feature

I'll now add the bulk send feature to the system.

### New Features Being Added:

1. **Bulk Send Endpoint**: `/api/waform/send-form-bulk`
   - Accepts form ID and array of phone numbers OR phonebook ID
   - Sends form to all contacts
   - Rate-limited to prevent API throttling
   - Returns success/failure count

2. **Frontend Integration**: JavaScript injection
   - Add "Bulk Send" button to form cards
   - Modal to select phonebook or enter multiple numbers
   - Progress indicator
   - Success/failure report

---

## 📊 How Bulk Send Will Work

### Backend Flow:
```
1. User selects form
2. User chooses:
   - Option A: Select phonebook (sends to all contacts)
   - Option B: Enter multiple phone numbers (comma-separated)
3. Backend processes:
   - Fetches contacts from phonebook OR parses phone list
   - Loops through each contact
   - Sends form via Meta WhatsApp API
   - Waits 1 second between sends (rate limiting)
   - Tracks success/failures
4. Returns summary:
   - Total sent: 45
   - Failed: 2
   - Success rate: 95.7%
```

### Rate Limiting:
- **1 second delay** between each message
- Prevents Meta API throttling
- Safe for large contact lists

### Example Timeline:
- 10 contacts: ~10 seconds
- 50 contacts: ~50 seconds
- 100 contacts: ~1.7 minutes
- 500 contacts: ~8.3 minutes

---

## 🛠️ Technical Implementation

### 1. New Backend Endpoint

**File**: `routes/waform.js`

```javascript
// ─── SEND FORM TO MULTIPLE NUMBERS ────────────────────────────────────────────
router.post(
  "/send-form-bulk",
  validateUser,
  checkPlan,
  checkWaForms,
  async (req, res) => {
    try {
      const { id, phonebookId, phoneNumbers } = req.body;
      
      // Get contacts from phonebook OR use provided phone numbers
      let contacts = [];
      
      if (phonebookId) {
        // Option A: Get contacts from phonebook
        contacts = await query(
          `SELECT name, mobile FROM contact WHERE phonebook_id = ? AND uid = ?`,
          [phonebookId, req.decode.uid]
        );
      } else if (phoneNumbers && Array.isArray(phoneNumbers)) {
        // Option B: Use provided phone numbers
        contacts = phoneNumbers.map(phone => ({ mobile: phone, name: '' }));
      } else {
        return res.json({ 
          success: false, 
          msg: "Please provide phonebookId or phoneNumbers array" 
        });
      }
      
      if (contacts.length === 0) {
        return res.json({ success: false, msg: "No contacts found" });
      }
      
      const metaApi = await getMetaConfig(req.decode.uid);
      if (!metaApi)
        return res.json({ success: false, msg: "Meta API not configured" });

      const [form] = await query(
        `SELECT * FROM wa_forms WHERE id = ? AND uid = ?`,
        [id, req.decode.uid]
      );
      if (!form) return res.json({ success: false, msg: "Form not found" });

      // Send to all contacts with rate limiting
      const results = { success: 0, failed: 0, errors: [] };
      
      for (const contact of contacts) {
        try {
          await axios.post(
            `https://graph.facebook.com/v20.0/${metaApi.business_phone_number_id}/messages`,
            {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: contact.mobile,
              type: "interactive",
              interactive: {
                type: "flow",
                header: { type: "text", text: form.name },
                body: {
                  text: form.description || "Please fill out the form below."
                },
                footer: { text: "Powered by WhatsApp Flows" },
                action: {
                  name: "flow",
                  parameters: {
                    flow_message_version: "3",
                    flow_token: "TOKEN_" + Date.now(),
                    flow_id: form.flow_id,
                    flow_cta: "Open Form",
                    flow_action: "navigate",
                    flow_action_payload: { screen: "FORM_SCREEN" }
                  }
                }
              }
            },
            {
              headers: {
                Authorization: `Bearer ${metaApi.access_token}`,
                "Content-Type": "application/json"
              }
            }
          );
          
          results.success++;
          
          // Wait 1 second between messages (rate limiting)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (err) {
          results.failed++;
          results.errors.push({
            phone: contact.mobile,
            error: err.response?.data?.error?.message || err.message
          });
        }
      }

      res.json({
        success: true,
        msg: `Form sent to ${results.success} contacts. ${results.failed} failed.`,
        results
      });
      
    } catch (err) {
      console.error(err);
      res.json({
        success: false,
        msg: err.response?.data?.error?.message || "Something went wrong"
      });
    }
  }
);
```

### 2. Frontend UI Enhancement

**File**: `client/public/index.html`

Add JavaScript to inject "Bulk Send" button:

```javascript
// Add Bulk Send button to WhatsApp Forms
if (window.location.pathname === '/user') {
  // Wait for form cards to load
  const observer = new MutationObserver(() => {
    const formCards = document.querySelectorAll('[data-form-id]');
    formCards.forEach(card => {
      if (!card.querySelector('.bulk-send-btn')) {
        const bulkBtn = document.createElement('button');
        bulkBtn.className = 'bulk-send-btn';
        bulkBtn.textContent = 'Bulk Send';
        bulkBtn.onclick = () => openBulkSendModal(card.dataset.formId);
        card.querySelector('.actions').appendChild(bulkBtn);
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
```

---

## 📋 Usage Instructions (After Implementation)

### Step 1: Prepare Your Contacts

**Option A: Use Phonebook**
1. Go to **Phonebook** section
2. Create a phonebook (e.g., "Customer List")
3. Add contacts with phone numbers
4. Remember the phonebook name

**Option B: Prepare Phone Numbers**
- Create a list of phone numbers
- Format: `919876543210` (country code + number, no spaces)
- Example:
  ```
  919876543210
  919876543211
  919876543212
  ```

### Step 2: Select Your Form
1. Go to **WhatsApp Forms** page
2. Find the form you want to send
3. Click **"Bulk Send"** button (new button)

### Step 3: Choose Sending Method
A modal will appear with two options:

**Option A: Send to Phonebook**
- Select phonebook from dropdown
- All contacts in that phonebook will receive the form

**Option B: Send to Custom List**
- Paste phone numbers (comma-separated or one per line)
- Example: `919876543210, 919876543211, 919876543212`

### Step 4: Send
1. Click **"Send to All"**
2. Progress bar shows status
3. Wait until complete (don't close browser)
4. See summary:
   - ✅ Successfully sent: 45
   - ❌ Failed: 2
   - 📊 Success rate: 95.7%

---

## ⚠️ Important Notes

### Rate Limiting
- **1 second delay** between each message
- Prevents Meta API throttling
- Large lists take longer (expected)

### Phone Number Format
Must include country code:
- ✅ Correct: `919876543210`
- ✅ Correct: `14155552671`
- ❌ Wrong: `9876543210` (missing country code)
- ❌ Wrong: `+91 98765 43210` (spaces and + symbol)

### Meta API Limits
- WhatsApp has daily message limits based on your account tier
- Check your Meta Business Manager for current limits
- Typical limits:
  - Tier 1: 1,000 messages/day
  - Tier 2: 10,000 messages/day
  - Tier 3: 100,000 messages/day

### Form Responses
- Each recipient can fill out the form independently
- Responses are tracked in **Submissions** section
- View all submissions: Go to Forms → Submissions tab

---

## 🔧 Troubleshooting

### Error: "Meta API not configured"
**Solution**: Configure Meta WhatsApp API in settings
1. Go to Settings → Meta API
2. Add Phone Number ID and Access Token

### Error: "Form not found"
**Solution**: Form must be published
1. Go to WhatsApp Forms
2. Check if form status is "PUBLISHED"
3. If draft, click "Publish" first

### Error: "No contacts found"
**Solution**: Phonebook is empty
1. Go to Phonebook section
2. Add contacts to the selected phonebook
3. Verify contacts have valid phone numbers

### Some Messages Failed
**Common reasons**:
1. **Invalid phone number format**: Must include country code
2. **Number not on WhatsApp**: Recipient doesn't have WhatsApp
3. **Blocked by recipient**: User blocked your business number
4. **Rate limited**: Too many messages too quickly (our delay prevents this)

**View failed numbers**:
- Check the error report in the summary
- Re-send to failed numbers after fixing issues

---

## 📊 Best Practices

### 1. Test First
- Send to your own number first
- Verify form displays correctly
- Test form submission

### 2. Segment Your Audience
- Create separate phonebooks for different audiences
- Example: "VIP Customers", "New Leads", "Inactive Users"
- Send targeted forms to each segment

### 3. Timing
- Send during business hours (9 AM - 6 PM local time)
- Avoid late nights or early mornings
- Consider recipient's timezone

### 4. Follow-Up
- Monitor submission rate
- Send reminder to non-responders after 24-48 hours
- Analyze which segments have best response rates

### 5. Compliance
- Only send to contacts who opted in
- Include opt-out instructions
- Follow WhatsApp Business Policy
- Don't spam

---

## 🎯 Example Use Cases

### 1. Customer Feedback Survey
```
Phonebook: "Recent Customers"
Form: "Satisfaction Survey"
Timing: 24 hours after purchase
Expected Response: 30-40%
```

### 2. Event Registration
```
Phonebook: "Email Subscribers"
Form: "Webinar Registration"
Timing: 1 week before event
Expected Response: 15-25%
```

### 3. Lead Qualification
```
Phonebook: "Website Leads"
Form: "Interest Form"
Timing: Within 1 hour of sign-up
Expected Response: 40-60%
```

### 4. Order Confirmation
```
Phonebook: None (individual sends)
Form: "Order Details Form"
Timing: Immediately after order
Expected Response: 90%+
```

---

## 📈 Tracking Success

### Metrics to Monitor:
1. **Delivery Rate**: % of messages successfully sent
2. **Open Rate**: % of recipients who opened the form
3. **Completion Rate**: % who submitted the form
4. **Response Time**: How quickly recipients respond

### Where to View:
- **Dashboard**: Overall statistics
- **Forms → Submissions**: Individual responses
- **Analytics**: Detailed breakdowns (if implemented)

---

## 🆘 Need Help?

### Quick Actions:
1. **Test with one number first**
2. **Check PM2 logs**: `pm2 logs whatscrm`
3. **Verify Meta API credentials**: Settings → Meta API
4. **Check phone number format**: Must include country code

### Common Questions:

**Q: How long does it take to send to 100 contacts?**
A: ~2 minutes (1 second per message + processing time)

**Q: Can I cancel mid-send?**
A: No, once started it processes all contacts. Test with small list first.

**Q: Will recipients see others' phone numbers?**
A: No, each message is sent individually. It's not a group message.

**Q: Can I schedule bulk sends?**
A: Not yet. Send immediately or use API with cron job.

---

**Status**: Implementation in progress
**Estimated Time**: 30 minutes to implement
**Testing Required**: Yes, test with 2-3 numbers first
