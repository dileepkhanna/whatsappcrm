-- ============================================================
-- FIX: Match Plan Amount with Razorpay Amount Exactly
-- ============================================================
-- Problem: Plan shows one amount, Razorpay shows different
-- Solution: Set exchange_rate = 1.0 to disable any conversion
-- ============================================================

-- Step 1: See current mismatch
SELECT '=== BEFORE FIX ===' as status;
SELECT plan_name, price, 
       CONCAT('₹', ROUND(price * (SELECT exchange_rate FROM web_public), 0)) as razorpay_will_show
FROM plan;

-- Step 2: FIX - Set exchange rate to 1.0
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- Step 3: Verify fix
SELECT '=== AFTER FIX ===' as status;
SELECT 
    plan_name, 
    price as 'Plan Price',
    CONCAT('₹', ROUND(price * (SELECT exchange_rate FROM web_public), 0)) as 'Razorpay Shows',
    CASE 
        WHEN price = ROUND(price * (SELECT exchange_rate FROM web_public), 0)
        THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as 'Status'
FROM plan;

SELECT '=== CURRENCY SETTINGS ===' as status;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

-- ============================================================
-- RESULT:
-- ============================================================
-- If plan price is 162:
--   - Plan shows: ₹162
--   - Razorpay shows: ₹162
--   - Perfect match! ✅
--
-- If plan price is 2:
--   - Plan shows: ₹2
--   - Razorpay shows: ₹2
--   - Perfect match! ✅
--
-- The key is: exchange_rate MUST be 1.0
-- ============================================================
