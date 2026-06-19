-- ============================================================
-- FIX: Price Mismatch Between Checkout and Razorpay
-- ============================================================
-- Issue: Checkout shows $2.00, but Razorpay shows ₹162
-- ============================================================

-- STEP 1: Check current settings
-- ============================================================
SELECT 'Current Exchange Rate:' as info;
SELECT exchange_rate FROM web_public;

SELECT 'Current Plan Prices:' as info;
SELECT id, plan_name, price, duration FROM plan;

-- ============================================================
-- STEP 2: Choose ONE of these solutions:
-- ============================================================

-- ------------------------------------------------------------
-- SOLUTION 1: Standard USD to INR Conversion (Recommended)
-- ------------------------------------------------------------
-- Sets exchange rate to 1.0 for standard 80x multiplier
-- Result: $2.00 → ₹160

UPDATE web_public SET exchange_rate = 1.0000 WHERE id = 1;

-- ------------------------------------------------------------
-- SOLUTION 2: Match Exact Razorpay Amount (₹162)
-- ------------------------------------------------------------
-- Adjusts plan price so Razorpay shows exactly ₹162
-- Result: $2.025 → ₹162

-- UPDATE plan SET price = 2.025 WHERE plan_name = 'basic plan';
-- UPDATE web_public SET exchange_rate = 1.0000 WHERE id = 1;

-- ------------------------------------------------------------
-- SOLUTION 3: Use Current Exchange Rate (1 USD = 83 INR)
-- ------------------------------------------------------------
-- Adjusts for current market rate
-- Result: $2.00 → ₹154

-- UPDATE web_public SET exchange_rate = 1.0375 WHERE id = 1;
-- Calculation: 83 (current rate) / 80 (hardcoded) = 1.0375

-- ============================================================
-- STEP 3: Verify the fix
-- ============================================================
SELECT 'Updated Exchange Rate:' as info;
SELECT exchange_rate FROM web_public;

SELECT 'Updated Plan Prices:' as info;  
SELECT id, plan_name, price, duration FROM plan;

SELECT 'Test Calculation (for $2 plan):' as info;
SELECT 
    price as 'Plan Price (USD)',
    exchange_rate as 'Exchange Rate',
    ROUND((price / exchange_rate) * 80, 2) as 'Razorpay Amount (INR)'
FROM plan, web_public
WHERE plan.plan_name = 'basic plan';

-- ============================================================
-- EXPLANATION:
-- ============================================================
-- The formula used: finalAmount = (price / exchange_rate) * 80
-- 
-- The '80' is hardcoded in the code assuming 1 USD = 80 INR
-- 
-- Examples with different exchange_rate values:
-- - exchange_rate = 1.0: $2.00 → (2/1)*80 = ₹160
-- - exchange_rate = 0.98: $2.00 → (2/0.98)*80 = ₹163
-- - exchange_rate = 1.05: $2.00 → (2/1.05)*80 = ₹152
-- 
-- To get exact ₹162 from $2 plan:
-- 162 = (2 / exchange_rate) * 80
-- exchange_rate = (2 * 80) / 162 = 0.98765
-- OR adjust price: price = 162 / 80 = 2.025
-- ============================================================

-- ============================================================
-- NOTE: Run only ONE solution (uncomment the one you want)
-- ============================================================
