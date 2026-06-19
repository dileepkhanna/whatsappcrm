-- ============================================================
-- COPY AND PASTE THIS INTO MYSQL WORKBENCH OR PHPMYADMIN
-- ============================================================

USE whatscrm;

-- Fix exchange rate to 1.0 (no conversion)
UPDATE web_public SET exchange_rate = 1.0 WHERE id = 1;

-- Make sure plan prices are what you want
-- If you want ₹2, set price = 2
-- If you want ₹162, set price = 162
UPDATE plan SET price = 2 WHERE id = 2;

-- Show results
SELECT 'Currency Settings:' as info;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

SELECT 'Plan Prices:' as info;
SELECT id, plan_name, price, duration FROM plan;

-- ============================================================
-- After running this:
-- 1. Restart your Node.js server
-- 2. Clear browser cache (Ctrl+Shift+Delete)
-- 3. Hard refresh (Ctrl+Shift+R)
-- ============================================================
