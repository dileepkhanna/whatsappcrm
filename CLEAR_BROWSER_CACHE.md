# How to Fix the ₹162 Issue

## Problem
The checkout page shows **₹162** instead of **Rs 2** because the frontend React app cached the old exchange rate (81).

## Database is Already Fixed ✅
- Currency: INR
- Symbol: Rs  
- Exchange Rate: 1.0
- Plan Price: 2.00
- Server: Restarted

## Solution: Clear Browser Cache

### Method 1: Clear Browser Storage (Recommended)

1. Open the checkout page: http://localhost:3010/user/checkout?product=2

2. Open Browser Developer Tools:
   - Press **F12** or **Ctrl + Shift + I**

3. Go to the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)

4. In the left sidebar, expand:
   - **Local Storage** → Click on `http://localhost:3010` → Click "Clear All"
   - **Session Storage** → Click on `http://localhost:3010` → Click "Clear All"
   - **IndexedDB** → If there's any database, right-click and delete it

5. **Hard refresh the page**:
   - Press **Ctrl + Shift + R** (or **Ctrl + F5**)

6. **Logout and login again** to refresh the session

### Method 2: Full Browser Cache Clear

1. Press **Ctrl + Shift + Delete**

2. Select:
   - **Cached images and files**
   - **Cookies and other site data**
   - Time range: **All time**

3. Click **Clear data**

4. Go to: http://localhost:3010 and login again

### Method 3: Open in Incognito/Private Window

1. Press **Ctrl + Shift + N** (Chrome/Edge) or **Ctrl + Shift + P** (Firefox)

2. Go to: http://localhost:3010

3. Login and check the checkout page

## Expected Result
After clearing cache, the checkout page should show:
- Plan price: **Rs 2**
- Razorpay modal: **Rs 200** (Razorpay minimum is Rs 100, so it converts 2.00 to 200 paise which is Rs 2.00)

**Note**: If Razorpay shows "Amount should be at least ₹1.00", it means Rs 2 is too small. You may need to increase the plan price to at least Rs 100 in the database.
