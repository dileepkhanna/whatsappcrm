-- ============================================================
-- DIAGNOSE: Plan vs Razorpay Price Mismatch
-- ============================================================

SELECT '=== CURRENT CURRENCY SETTINGS ===' as info;
SELECT 
    id,
    currency_code,
    currency_symbol,
    exchange_rate,
    CONCAT('Plan Price × ', exchange_rate, ' = Razorpay Amount') as formula
FROM web_public;

SELECT '=== CURRENT PLAN PRICES ===' as info;
SELECT 
    id,
    plan_name,
    price as 'DB Price',
    duration,
    CONCAT(
        (SELECT currency_symbol FROM web_public WHERE id=1),
        price
    ) as 'Display',
    CONCAT(
        '₹',
        ROUND(price * (SELECT exchange_rate FROM web_public WHERE id=1), 0)
    ) as 'Razorpay Will Show'
FROM plan
ORDER BY id;

SELECT '=== DIAGNOSIS ===' as info;
SELECT 
    CASE 
        WHEN (SELECT exchange_rate FROM web_public WHERE id=1) = 1.0 
        THEN '✅ exchange_rate is 1.0 - No conversion'
        ELSE CONCAT('❌ exchange_rate is ', (SELECT exchange_rate FROM web_public WHERE id=1), ' - Conversion happening!')
    END as 'Exchange Rate Status',
    CASE
        WHEN (SELECT currency_symbol FROM web_public WHERE id=1) = '₹'
        THEN '✅ Currency symbol is ₹ (Rupee)'
        ELSE CONCAT('❌ Currency symbol is ', (SELECT currency_symbol FROM web_public WHERE id=1))
    END as 'Symbol Status';

SELECT '=== SOLUTION ===' as info;
SELECT 
    'To fix mismatch, exchange_rate must be 1.0' as instruction,
    'Run: UPDATE web_public SET exchange_rate = 1.0 WHERE id = 1;' as fix_command;
