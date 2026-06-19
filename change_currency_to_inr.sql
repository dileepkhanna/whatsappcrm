-- ============================================================
-- Change Currency from USD ($) to INR (₹)
-- ============================================================
-- This script changes the entire application to use Indian Rupees
-- ============================================================

-- Step 1: Update currency settings
-- ============================================================
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- Step 2: Convert all plan prices from USD to INR
-- ============================================================
-- Example: If you had $2 USD, it becomes ₹166 INR (at current rate)
-- Adjust the multiplier based on your needs

-- Option A: Convert at current market rate (83.25 INR per USD)
UPDATE plan SET price = ROUND(price * 83.25, 0);

-- Option B: If you want custom prices, set them directly
-- UPDATE plan SET price = 166 WHERE plan_name = 'basic plan';
-- UPDATE plan SET price = 416 WHERE plan_name = 'standard plan';
-- UPDATE plan SET price = 833 WHERE plan_name = 'premium plan';

-- ============================================================
-- Step 3: Verify the changes
-- ============================================================
SELECT 'Currency Settings:' as info;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

SELECT 'Plan Prices (now in INR):' as info;
SELECT id, plan_name, price, duration FROM plan;

-- ============================================================
-- EXPLANATION:
-- ============================================================
-- After this update:
-- - All prices are stored in INR (₹)
-- - Frontend displays ₹ symbol instead of $
-- - Razorpay shows the exact same amount
-- - No conversion needed
--
-- Example:
-- Before: Plan price = $2 → Razorpay shows ₹166 (converted)
-- After:  Plan price = ₹166 → Razorpay shows ₹166 (direct)
-- ============================================================

-- ============================================================
-- NOTES:
-- ============================================================
-- 1. Run this ONCE only
-- 2. Backup your database before running
-- 3. After running, restart your server
-- 4. Frontend will automatically show ₹ symbol
-- 5. All future plans should be priced in INR
-- ============================================================
