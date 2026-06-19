-- ============================================================
-- FIX: Show ₹2 instead of ₹162
-- ============================================================
-- Problem: Plan price is 2, but Razorpay shows ₹162
-- Cause: Frontend is multiplying by exchange_rate
-- Solution: Set exchange_rate properly to disable conversion
-- ============================================================

-- Step 1: Check current settings
SELECT '=== BEFORE ===' as status;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;
SELECT id, plan_name, price FROM plan LIMIT 3;

-- Step 2: Fix currency settings  
-- Set exchange_rate to 0.0125 to reverse the 80x multiplier
-- Formula: If frontend does (price / 0.0125) * 80, we get back the original price
-- Example: (2 / 0.0125) * 80 = 160 * 80 = won't work...

-- Actually, the frontend likely does: price * exchange_rate
-- So to get 2 from 2, we need exchange_rate = 1.0

-- BUT if it's showing 162, it means: 2 * 81 = 162
-- So current exchange_rate might be 81

-- Let's just set it to 1.0 to disable any multiplication
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- Step 3: Verify
SELECT '=== AFTER ===' as status;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;
SELECT id, plan_name, price FROM plan LIMIT 3;

-- ============================================================
-- Expected Result:
-- ============================================================
-- Plan price in DB: 2
-- Frontend calculation: 2 * 1.0 = 2
-- Display: ₹2
-- Razorpay: ₹2
-- ============================================================

-- ============================================================
-- If this still doesn't work, the frontend might be using
-- a hardcoded multiplier. In that case, we need to adjust
-- the plan price itself to compensate.
-- ============================================================

-- Backup command (if above doesn't work):
-- Calculate what price should be to show as ₹2
-- If frontend multiplies by 81: price should be 2/81 = 0.0247
-- UPDATE plan SET price = ROUND(price / 81, 4);

-- ============================================================
-- IMPORTANT: Restart server after running this!
-- ============================================================
