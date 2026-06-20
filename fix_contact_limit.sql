-- ============================================
-- FIX: Increase Contact Limit
-- ============================================

SET @uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- ============================================
-- Check current status
-- ============================================
SELECT '=== BEFORE FIX ===' AS status;

SELECT 
    'Current Plan' AS check_type,
    JSON_EXTRACT(plan, '$.contact_limit') AS contact_limit,
    (SELECT COUNT(*) FROM contact WHERE uid = @uid) AS current_contacts
FROM user 
WHERE uid = @uid;

-- ============================================
-- Increase contact limit to 9999 (practically unlimited)
-- ============================================
UPDATE user 
SET plan = JSON_SET(plan, '$.contact_limit', 9999)
WHERE uid = @uid;

SELECT '✅ Updated contact limit to 9999' AS result;

-- ============================================
-- Verify the fix
-- ============================================
SELECT '=== AFTER FIX ===' AS status;

SELECT 
    'Updated Plan' AS check_type,
    JSON_EXTRACT(plan, '$.contact_limit') AS contact_limit,
    (SELECT COUNT(*) FROM contact WHERE uid = @uid) AS current_contacts,
    '✅ Can now add contacts!' AS status
FROM user 
WHERE uid = @uid;
