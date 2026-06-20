-- ============================================
-- Check Contact Limit Issue
-- ============================================

SET @uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- ============================================
-- 1. Check user plan and contact limit
-- ============================================
SELECT 
    'User Plan' AS check_type,
    uid,
    JSON_EXTRACT(plan, '$.contact_limit') AS contact_limit,
    JSON_EXTRACT(plan, '$.name') AS plan_name
FROM user 
WHERE uid = @uid;

-- ============================================
-- 2. Count current contacts
-- ============================================
SELECT 
    'Current Contacts' AS check_type,
    COUNT(*) AS total_contacts
FROM contact 
WHERE uid = @uid;

-- ============================================
-- 3. Check if limit reached
-- ============================================
SELECT 
    'Limit Status' AS check_type,
    (SELECT COUNT(*) FROM contact WHERE uid = @uid) AS current_contacts,
    JSON_EXTRACT(plan, '$.contact_limit') AS allowed_contacts,
    CASE 
        WHEN (SELECT COUNT(*) FROM contact WHERE uid = @uid) >= JSON_EXTRACT(plan, '$.contact_limit')
        THEN '❌ LIMIT REACHED - Cannot add more contacts'
        ELSE CONCAT('✅ CAN ADD - ', 
                    JSON_EXTRACT(plan, '$.contact_limit') - (SELECT COUNT(*) FROM contact WHERE uid = @uid), 
                    ' more contacts allowed')
    END AS status
FROM user 
WHERE uid = @uid;

-- ============================================
-- 4. Show existing contacts
-- ============================================
SELECT 
    'Existing Contacts' AS section,
    id,
    phonebook_name,
    name,
    mobile
FROM contact 
WHERE uid = @uid
ORDER BY id DESC
LIMIT 10;

-- ============================================
-- FIX: Increase contact limit if needed
-- ============================================
SELECT '=== FIX ===' AS section;

-- Option 1: Set contact limit to unlimited (9999)
-- UPDATE user 
-- SET plan = JSON_SET(plan, '$.contact_limit', 9999)
-- WHERE uid = @uid;

-- Option 2: Set contact limit to specific number (e.g., 500)
-- UPDATE user 
-- SET plan = JSON_SET(plan, '$.contact_limit', 500)
-- WHERE uid = @uid;

SELECT 
    'To fix contact limit issue, run one of these:' AS instructions,
    'UPDATE user SET plan = JSON_SET(plan, ''$.contact_limit'', 9999) WHERE uid = ''N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t'';' AS unlimited_contacts,
    'UPDATE user SET plan = JSON_SET(plan, ''$.contact_limit'', 500) WHERE uid = ''N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t'';' AS set_to_500;
