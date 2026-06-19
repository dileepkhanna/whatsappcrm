-- Check current currency and pricing settings

SELECT '=== CURRENCY SETTINGS ===' as info;
SELECT 
    id,
    currency_code,
    currency_symbol,
    exchange_rate
FROM web_public;

SELECT '=== PLAN PRICES ===' as info;
SELECT 
    id,
    plan_name,
    price,
    duration,
    description
FROM plan
ORDER BY id;

SELECT '=== WHAT THIS MEANS ===' as info;
-- If you see price = 2, but Razorpay shows ₹162, conversion is happening
-- If you see price = 162, then it's direct (no conversion)
