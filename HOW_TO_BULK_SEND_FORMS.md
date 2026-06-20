# 📤 How to Send WhatsApp Forms to Multiple Numbers

## ✅ Solution Added!

I've added a **bulk send feature** that allows you to send WhatsApp Forms to multiple phone numbers at once.

---

## 🚀 Quick Start (Using API)

### Method 1: Send to Multiple Phone Numbers

```bash
curl -X POST http://localhost:3010/api/waform/send-form-bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "id": 1,
    "phoneNumbers": [
      "919876543210",
      "919876543211",
      "919876543212"
    ]
  }'
```

### Method 2: Send to Entire Phonebook

```bash
curl -X POST http://localhost:3010/api/waform/send-form-bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "id": 1,
    "phonebookId": 123
  }'
```

---

## 📋 Step-by-Step Guide

### Step 1: Get Your JWT Token

1. Open browser console (F12) on https://dileepkhanna.dev
2. Go to **Application** tab → **Local Storage**
3. Find `wacrm_user` key
4. Copy the token value (long string)

OR login via API:

```javascript
const response = await fetch('http://localhost:3010/api/user/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'dileeplekkala23@gmail.com',
    password: 'your_password'
  })
});
const data = await response.json();
const token = data.token;
```

### Step 2: Get Your Form ID

```javascript
const response = await fetch('http://localhost:3010/api/waform/get-forms', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const forms = await response.json();
console.log(forms.data); // See all forms with IDs
```

### Step 3: Send to Multiple Numbers

```javascript
const response = await fetch('http://localhost:3010/api/waform/send-form-bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    id: 1, // Your form ID
    phoneNumbers: [
      '919876543210',
      '918765432109',
      '917654321098'
    ]
  })
});

const result = await response.json();
console.log(result);
// Output:
// {
//   "success": true,
//   "msg": "Form sent to 3/3 contacts (100.0% success rate). 0 failed.",
//   "results": {
//     "success": 3,
//     "failed": 0,
//     "total": 3,
//     "errors": []
//   }
// }
```

---

## 🎯 Complete Node.js Example

Save this as `send-forms.js`:

```javascript
const BASE_URL = 'http://localhost:3010'; // Or https://dileepkhanna.dev for production

async function sendBulkForms() {
  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'dileeplekkala23@gmail.com',
      password: 'your_password'
    })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  
  // 2. Get forms
  const formsRes = await fetch(`${BASE_URL}/api/waform/get-forms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const formsData = await formsRes.json();
  console.log('Available forms:', formsData.data);
  
  // 3. Send to multiple numbers
  const formId = formsData.data[0].id; // Use first form
  const phoneNumbers = [
    '919876543210', // Replace with real numbers
    '918765432109',
    '917654321098'
  ];
  
  const bulkRes = await fetch(`${BASE_URL}/api/waform/send-form-bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      id: formId,
      phoneNumbers: phoneNumbers
    })
  });
  
  const result = await bulkRes.json();
  console.log('Result:', result);
  
  if (result.success) {
    console.log(`✅ Success: ${result.results.success}/${result.results.total}`);
    console.log(`❌ Failed: ${result.results.failed}`);
    
    if (result.results.errors.length > 0) {
      console.log('Errors:');
      result.results.errors.forEach(err => {
        console.log(`  - ${err.phone}: ${err.error}`);
      });
    }
  }
}

sendBulkForms().catch(console.error);
```

Run it:
```bash
node send-forms.js
```

---

## 📊 Using with Phonebook

If you have contacts in a phonebook:

```javascript
// Get phonebooks
const phonebooksRes = await fetch(`${BASE_URL}/api/phonebook/get_all_phonebook`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const phonebooks = await phonebooksRes.json();
console.log('Phonebooks:', phonebooks.data);

// Send to entire phonebook
const bulkRes = await fetch(`${BASE_URL}/api/waform/send-form-bulk`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    id: formId,
    phonebookId: phonebooks.data[0].id // Use first phonebook
  })
});
```

---

## ⚙️ API Reference

### Endpoint: `/api/waform/send-form-bulk`

**Method**: `POST`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

**Body** (Option 1 - Phone Numbers Array):
```json
{
  "id": 1,
  "phoneNumbers": [
    "919876543210",
    "918765432109"
  ]
}
```

**Body** (Option 2 - Phonebook ID):
```json
{
  "id": 1,
  "phonebookId": 123
}
```

**Response** (Success):
```json
{
  "success": true,
  "msg": "Form sent to 10/12 contacts (83.3% success rate). 2 failed.",
  "results": {
    "success": 10,
    "failed": 2,
    "total": 12,
    "errors": [
      {
        "phone": "919876543210",
        "name": "John Doe",
        "error": "Invalid phone number format"
      }
    ]
  }
}
```

**Response** (Error):
```json
{
  "success": false,
  "msg": "Meta API not configured",
  "error": "..."
}
```

---

## 📝 Phone Number Format

**IMPORTANT**: Phone numbers must include country code without spaces or symbols.

✅ **Correct**:
- `919876543210` (India)
- `14155552671` (USA)
- `447700900123` (UK)

❌ **Wrong**:
- `+91 98765 43210` (has spaces and +)
- `9876543210` (missing country code)
- `+919876543210` (has + symbol)

---

## ⏱️ Processing Time

The system sends **1 message per second** to avoid rate limiting.

**Estimated time**:
- 10 numbers: ~10 seconds
- 50 numbers: ~50 seconds
- 100 numbers: ~2 minutes
- 500 numbers: ~8 minutes

---

## 🔧 Testing

Use the provided test script:

```bash
# Edit test-forms-bulk-send.js first
# Update TEST_USER password and TEST_NUMBERS

node test-forms-bulk-send.js
```

Expected output:
```
🧪 WhatsApp Forms Bulk Send API Test
============================================

📝 Step 1: Logging in...
✅ Logged in successfully

📋 Step 2: Fetching available forms...
✅ Found 4 form(s)
   1. datepicker (ID: 1, Status: PUBLISHED)
   2. dileep (ID: 2, Status: PUBLISHED)

🎯 Using form: "datepicker" (ID: 1)

🚀 Step 4: Testing bulk send...
✅ Bulk send completed!
   Total: 3
   Success: 3
   Failed: 0
```

---

## ⚠️ Important Notes

### Rate Limiting
- 1 second delay between messages
- Prevents Meta API throttling
- Don't send to more than 1000 contacts per hour

### Phone Number Validation
- System doesn't validate numbers before sending
- Invalid numbers will fail and be reported in results
- Test with 2-3 numbers first

### Meta API Limits
- Check your daily message limits in Meta Business Manager
- Tier 1: 1,000 messages/day
- Tier 2: 10,000 messages/day
- Going over limit will result in errors

### Error Handling
- System continues even if some messages fail
- All errors are reported in the response
- You can retry failed numbers separately

---

## 📈 Production Usage

### Deploy to Production

```bash
# Local: Commit and push
git add .
git commit -m "feat: Add WhatsApp Forms bulk send feature"
git push origin main

# Production: Pull and restart
ssh ec2-user@13.205.34.169
cd whatscrm
git pull origin main
pm2 restart whatscrm
```

### Production URL

Change `BASE_URL` to:
```javascript
const BASE_URL = 'https://dileepkhanna.dev';
```

---

## 🎯 Common Use Cases

### 1. Send Survey to All Customers
```javascript
// Send feedback form to phonebook "Customers"
{
  "id": 1, // Feedback Form ID
  "phonebookId": 5 // Customers Phonebook
}
```

### 2. Event Registration
```javascript
// Send registration form to specific list
{
  "id": 2, // Registration Form ID
  "phoneNumbers": ["919876543210", "918765432109"]
}
```

### 3. Lead Qualification
```javascript
// Send qualification form to new leads
{
  "id": 3, // Lead Form ID
  "phonebookId": 8 // New Leads Phonebook
}
```

---

## 🆘 Troubleshooting

### Error: "Meta API not configured"
**Solution**: Add Meta API credentials in settings

### Error: "Form not found"
**Solution**: Check form ID is correct and form is published

### Error: "No contacts found"
**Solution**: Check phonebook has contacts or phone numbers array is not empty

### Some messages failed
**Check**: 
- Phone number format (must include country code)
- Number is on WhatsApp
- Your account hasn't hit daily limits

---

## ✅ Summary

You can now send WhatsApp Forms to multiple numbers using:

1. **API with phone numbers array**: Send to custom list
2. **API with phonebook ID**: Send to entire phonebook
3. **Test script**: Test locally before production

**Next Steps**:
1. Test with 2-3 numbers first
2. Deploy to production
3. Use for your campaigns

Full guide: See `WHATSAPP_FORMS_BULK_SEND_GUIDE.md`
