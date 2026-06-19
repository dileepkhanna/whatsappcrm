-- Check current state
USE whatscrm;

SELECT '=== CURRENT STATE ===' as status;
SELECT id, plan_name, price FROM plan WHERE id = 2;
SELECT currency_symbol, exchange_rate FROM web_public;

-- Fix it
UPDATE web_public SET exchange_rate = 1.0 WHERE id = 1;
UPDATE plan SET price = 2 WHERE id = 2;

-- Verify
SELECT '=== AFTER FIX ===' as status;
SELECT id, plan_name, price FROM plan WHERE id = 2;
SELECT currency_symbol, exchange_rate FROM web_public;
SELECT CONCAT('Plan will show: ₹', price) as display FROM plan WHERE id = 2;
