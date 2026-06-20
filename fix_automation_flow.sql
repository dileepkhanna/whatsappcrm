-- ============================================
-- FIX: Activate Automation Flow
-- ============================================
-- This will activate your flows so they work properly

-- Your UID
SET @uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- ============================================
-- STEP 1: Check current status (BEFORE fix)
-- ============================================
SELECT '=== BEFORE FIX ===' AS status;

SELECT 'Flows' AS table_name, flow_id, name, is_active, source 
FROM beta_flows 
WHERE uid = @uid;

SELECT 'Chatbot Triggers' AS table_name, flow_id, origin_id, active, source 
FROM beta_chatbot 
WHERE uid = @uid;

-- ============================================
-- STEP 2: Activate ALL flows for this user
-- ============================================
UPDATE beta_flows 
SET is_active = 1 
WHERE uid = @uid;

SELECT CONCAT('✅ Activated ', ROW_COUNT(), ' flows in beta_flows') AS result;

-- ============================================
-- STEP 3: Activate ALL chatbot triggers
-- ============================================
UPDATE beta_chatbot 
SET active = 1 
WHERE uid = @uid;

SELECT CONCAT('✅ Activated ', ROW_COUNT(), ' chatbot triggers in beta_chatbot') AS result;

-- ============================================
-- STEP 4: Ensure origin_id is correct for WhatsApp flows
-- ============================================
-- For WhatsApp (Meta Cloud API), origin_id should be 'META'
UPDATE beta_chatbot 
SET origin_id = 'META' 
WHERE uid = @uid 
AND (source = 'wa_chatbot' OR source IS NULL OR source = '')
AND (origin_id IS NULL OR origin_id = '');

SELECT CONCAT('✅ Fixed ', ROW_COUNT(), ' chatbot origin_id to META') AS result;

-- ============================================
-- STEP 5: Ensure source type is correct
-- ============================================
-- Set source to 'wa_chatbot' for WhatsApp flows
UPDATE beta_chatbot 
SET source = 'wa_chatbot' 
WHERE uid = @uid 
AND (source IS NULL OR source = '' OR source = 'chatbot');

SELECT CONCAT('✅ Fixed ', ROW_COUNT(), ' chatbot source types') AS result;

-- Update flows source to 'wa_chatbot' if needed
UPDATE beta_flows 
SET source = 'wa_chatbot' 
WHERE uid = @uid 
AND (source IS NULL OR source = '' OR source = 'chatbot');

SELECT CONCAT('✅ Fixed ', ROW_COUNT(), ' flow source types') AS result;

-- ============================================
-- STEP 6: Clear any stuck flow sessions
-- ============================================
DELETE FROM flow_session 
WHERE uid = @uid;

SELECT CONCAT('✅ Cleared ', ROW_COUNT(), ' stuck flow sessions') AS result;

-- ============================================
-- STEP 7: Check status (AFTER fix)
-- ============================================
SELECT '=== AFTER FIX ===' AS status;

SELECT 'Flows (AFTER)' AS table_name, flow_id, name, is_active, source 
FROM beta_flows 
WHERE uid = @uid;

SELECT 'Chatbot Triggers (AFTER)' AS table_name, flow_id, origin_id, active, source 
FROM beta_chatbot 
WHERE uid = @uid;

-- ============================================
-- STEP 8: Verify the complete setup
-- ============================================
SELECT 
    '✅ VERIFICATION' AS check_type,
    f.flow_id,
    f.name,
    CASE 
        WHEN f.is_active = 1 AND c.active = 1 AND c.origin_id = 'META' THEN '✅ READY TO WORK'
        ELSE '❌ STILL HAS ISSUES'
    END AS status,
    f.is_active AS flow_active,
    c.active AS chatbot_active,
    c.origin_id,
    f.source AS flow_source,
    c.source AS chatbot_source
FROM beta_flows f
LEFT JOIN beta_chatbot c ON f.flow_id = c.flow_id AND f.uid = c.uid
WHERE f.uid = @uid;

-- ============================================
-- INSTRUCTIONS
-- ============================================
SELECT 
    '📋 NEXT STEPS' AS section,
    CONCAT(
        'After running this script:\n\n',
        '1. Restart your application:\n',
        '   ssh ec2-user@13.205.34.169\n',
        '   pm2 restart whatscrm\n\n',
        '2. Send a test WhatsApp message to: +91 87126 55512\n',
        '   Message should be one of your trigger keywords (e.g., "hi")\n\n',
        '3. Check logs:\n',
        '   pm2 logs whatscrm --lines 50\n\n',
        '4. You should see automation processing, not "User does not have any active automation flow"\n\n',
        '5. If still not working, check the initial node in your flow builder:\n',
        '   - Make sure trigger type is set to "Chatbot" (not Instagram/Telegram)\n',
        '   - Make sure keywords are configured\n',
        '   - Make sure flow is published/activated in UI'
    ) AS instructions;
