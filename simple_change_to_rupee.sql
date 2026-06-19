-- ============================================================
-- Simple Currency Change: $ → ₹ (No Conversion)
-- ============================================================
-- This simply changes the display symbol from $ to ₹
-- All prices stay the same (2 becomes ₹2, not ₹166)
-- ============================================================

-- Change currency symbol from $ to ₹
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- ============================================================
-- Verify the change
-- ============================================================
SELECT 'Currency Settings:' as info;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

SELECT 'Plan Prices (unchanged):' as info;
SELECT id, plan_name, price, duration FROM plan;

-- ============================================================
-- RESULT:
-- ============================================================
-- Before: Plan shows "$2.00" → Pays ₹2
-- After:  Plan shows "₹2.00" → Pays ₹2
--
-- The number stays the same, only the symbol changes!
-- ============================================================

-- ============================================================
-- NOTE: 
-- After running this, restart your server
-- The frontend will automatically show ₹ instead of $
-- ============================================================
