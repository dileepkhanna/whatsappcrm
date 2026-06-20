-- ============================================
-- Fix SMTP Table and Enable Campaigns
-- ============================================

SET @uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- ============================================
-- Fix 1: Check SMTP table structure
-- ============================================
DESCRIBE smtp;

-- If uid column is missing, this will show the issue
-- The error suggests INSERT is providing 5 values but table expects 6+

-- ============================================
-- Fix 2: Check campaign status
-- ============================================
SELECT 
    campaign_id,
    title,
    status,
    total_contacts,
    sent_count,
    delivered_count,
    read_count,
    failed_count,
    createdAt
FROM beta_campaign
WHERE uid = @uid
ORDER BY createdAt DESC
LIMIT 10;

-- ============================================
-- Fix 3: Campaign status explanation
-- ============================================
-- ⚠️ NOTE: The campaignBeta.js loop processes campaigns with status:
--   - 'PENDING' (initial state)
--   - 'IN_PROGRESS' (actively processing)
-- When complete, it marks them as 'COMPLETED'
-- So PENDING campaigns should already be picked up automatically!

-- Check if campaigns are really stuck
SELECT 
    'Current campaign statuses:' as info,
    campaign_id,
    title,
    status,
    total_contacts,
    sent_count,
    CONCAT(ROUND((sent_count * 100.0 / NULLIF(total_contacts, 0)), 1), '%') as progress,
    createdAt
FROM beta_campaign
WHERE uid = @uid
ORDER BY createdAt DESC
LIMIT 5;

-- ============================================
-- Fix 4: Verify campaign logs exist
-- ============================================
SELECT 
    'Campaign logs breakdown:' as info,
    COUNT(*) as total_logs,
    COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
    COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
FROM beta_campaign_logs
WHERE campaign_id IN (
    SELECT campaign_id FROM beta_campaign WHERE uid = @uid
);

-- ============================================
-- Fix 5: Check if campaign loop is actually running
-- ============================================
SELECT 
    '⚠️ DEPLOYMENT STEPS:' as note,
    '1. SSH to server: ssh ec2-user@13.205.34.169' as step1,
    '2. Go to directory: cd whatscrm' as step2,
    '3. Resolve git conflict: git stash' as step3,
    '4. Pull latest code: git pull origin main' as step4,
    '5. Restart server: pm2 restart whatscrm' as step5,
    '6. Check logs: pm2 logs whatscrm --lines 50' as step6,
    '7. Look for: "Campaign loop" or campaign processing messages' as step7,
    '8. Campaigns should change: PENDING → IN_PROGRESS → COMPLETED' as step8;
