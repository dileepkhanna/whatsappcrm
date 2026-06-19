-- ============================================================
-- FINAL FIX: Make ₹2 show as ₹2 (not ₹162)
-- ============================================================
-- Problem: Database has price=2, but shows ₹162
-- Cause: exchange_rate is set to 81 (2 × 81 = 162)
-- Solution: Set exchange_rate to 1.0
-- ============================================================

UPDATE web_public 
SET exchange_rate = 1.0
WHERE id = 1;

-- Verify the fix
SELECT 'Fixed! Exchange rate is now:' as info, exchange_rate FROM web_public;

-- ============================================================
-- RESULT:
-- ============================================================
-- Before: price=2, exchange_rate=81 → shows ₹162
-- After:  price=2, exchange_rate=1.0 → shows ₹2
-- ============================================================

-- ============================================================
-- RESTART YOUR SERVER AFTER RUNNING THIS!
-- node server.js
-- ============================================================
