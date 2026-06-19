-- ============================================================
-- COMPLETE SOLUTION: Convert $2 to ₹162 and Display Correctly
-- ============================================================
-- Goal: Show ₹162 everywhere (checkout and Razorpay)
-- Current: Database has price=2 (thinking it's dollars)
-- Solution: Convert to INR equivalent
-- ============================================================

-- Step 1: Check what we have now
SELECT '=== CURRENT STATE ===' as info;
SELECT id, plan_name, price, duration FROM plan;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

-- Step 2: Convert all USD prices to INR
-- $2 × 81 = ₹162
-- $5 × 81 = ₹405
-- $10 × 81 = ₹810
UPDATE plan SET price = ROUND(price * 81, 0);

-- Step 3: Set currency to INR and disable further conversion
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- Step 4: Verify the changes
SELECT '=== AFTER CONVERSION ===' as info;
SELECT id, plan_name, price, duration FROM plan;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

-- ============================================================
-- RESULT:
-- ============================================================
-- Before: price=2 (thinking dollars)
-- After:  price=162 (actual rupees)
-- Display: ₹162
-- Razorpay: ₹162
-- Perfect match! ✅
-- ============================================================

-- ============================================================
-- EXAMPLE CONVERSIONS:
-- ============================================================
-- $2  → ₹162
-- $5  → ₹405
-- $10 → ₹810
-- $20 → ₹1,620
-- $50 → ₹4,050
-- ============================================================
