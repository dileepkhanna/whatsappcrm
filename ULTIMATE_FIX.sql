-- ============================================================
-- ULTIMATE FIX: Match Everything - Plan, Checkout, Razorpay
-- ============================================================

-- Change to INR currency with exchange_rate = 1.0
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- Show what we fixed
SELECT '=== CURRENCY FIXED ===' as status;
SELECT 
    CONCAT('Currency: ', currency_code) as setting1,
    CONCAT('Symbol: ', currency_symbol) as setting2,
    CONCAT('Exchange Rate: ', exchange_rate) as setting3
FROM web_public;

SELECT '=== YOUR PLAN PRICES ===' as status;
SELECT 
    id,
    plan_name,
    CONCAT(
        (SELECT currency_symbol FROM web_public),
        price
    ) as 'Will Show As',
    duration
FROM plan
ORDER BY id;

SELECT '=== RESULT ===' as status;
SELECT 'Checkout page will show ₹ symbol' as result1;
SELECT 'Razorpay will show same amount (no conversion)' as result2;
SELECT 'RESTART SERVER after this!' as result3;
