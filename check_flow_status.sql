-- ============================================
-- DIAGNOSTIC: Check Automation Flow Status
-- ============================================
-- Run this on your production database to see why flows aren't working

-- Your UID
SET @uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- ============================================
-- 1. Check if user has chatbot permission
-- ============================================
SELECT 
    'User Plan Check' AS check_type,
    uid,
    JSON_EXTRACT(plan, '$.allow_chatbot') AS allow_chatbot_quota,
    CASE 
        WHEN JSON_EXTRACT(plan, '$.allow_chatbot') > 0 THEN '✅ PASS'
        ELSE '❌ FAIL - No chatbot quota'
    END AS status
FROM user 
WHERE uid = @uid;

-- ============================================
-- 2. Check flows in beta_flows table
-- ============================================
SELECT 
    'Flows Table' AS check_type,
    flow_id,
    name,
    is_active,
    source,
    CASE 
        WHEN is_active = 1 THEN '✅ ACTIVE'
        ELSE '❌ INACTIVE'
    END AS status,
    created_at
FROM beta_flows 
WHERE uid = @uid
ORDER BY created_at DESC;

-- ============================================
-- 3. Check chatbot triggers in beta_chatbot
-- ============================================
SELECT 
    'Chatbot Triggers' AS check_type,
    flow_id,
    origin_id,
    source,
    active,
    CASE 
        WHEN active = 1 THEN '✅ ACTIVE'
        ELSE '❌ INACTIVE'
    END AS status,
    origin
FROM beta_chatbot 
WHERE uid = @uid
ORDER BY flow_id;

-- ============================================
-- 4. Check matched flows (what system actually uses)
-- ============================================
SELECT 
    'Matched Flows' AS check_type,
    f.flow_id,
    f.name,
    f.is_active AS flow_active,
    c.active AS chatbot_active,
    f.source AS flow_source,
    c.source AS chatbot_source,
    c.origin_id,
    CASE 
        WHEN f.is_active = 1 AND c.active = 1 THEN '✅ WILL TRIGGER'
        WHEN f.is_active = 0 THEN '❌ Flow not active'
        WHEN c.active = 0 THEN '❌ Chatbot trigger not active'
        ELSE '❌ Unknown issue'
    END AS status
FROM beta_flows f
INNER JOIN beta_chatbot c ON f.flow_id = c.flow_id AND f.uid = c.uid
WHERE f.uid = @uid;

-- ============================================
-- 5. Check flow sessions (active conversations)
-- ============================================
SELECT 
    'Flow Sessions' AS check_type,
    flow_id,
    sender_mobile,
    origin,
    origin_id,
    created_at,
    updated_at
FROM flow_session 
WHERE uid = @uid
ORDER BY updated_at DESC
LIMIT 10;

-- ============================================
-- 6. Check for Meta API connection (required for WhatsApp flows)
-- ============================================
SELECT 
    'Meta API' AS check_type,
    business_phone_number_id,
    display_phone_number,
    CASE 
        WHEN access_token IS NOT NULL AND access_token != '' THEN '✅ Connected'
        ELSE '❌ Not connected'
    END AS status
FROM meta_api 
WHERE uid = @uid;

-- ============================================
-- RECOMMENDATIONS
-- ============================================
SELECT 
    'Recommendations' AS section,
    CONCAT(
        'For flows to work, you need:\n',
        '1. User plan with allow_chatbot > 0 ✅\n',
        '2. Flow in beta_flows with is_active = 1\n',
        '3. Chatbot trigger in beta_chatbot with active = 1\n',
        '4. Both must have matching flow_id\n',
        '5. For WhatsApp: source should be "wa_chatbot" and origin_id should be "META"\n',
        '6. Meta API must be connected\n\n',
        'If any row shows ❌, that is the problem!'
    ) AS instructions;
