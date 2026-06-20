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
-- Fix 3: Change PENDING campaigns to QUEUE
-- ============================================
-- Campaigns need to be in QUEUE status to be processed

UPDATE beta_campaign
SET status = 'QUEUE'
WHERE uid = @uid
AND status = 'PENDING';

SELECT CONCAT('✅ Updated ', ROW_COUNT(), ' campaigns from PENDING to QUEUE') AS result;

-- ============================================
-- Fix 4: Verify campaign logs exist
-- ============================================
SELECT 
    COUNT(*) as total_logs,
    status,
    COUNT(CASE WHEN status = 'QUEUE' THEN 1 END) as queued,
    COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent,
    COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as delivered,
    COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
FROM beta_campaign_logs
WHERE campaign_id IN (
    SELECT campaign_id FROM beta_campaign WHERE uid = @uid
)
GROUP BY status;

-- ============================================
-- Fix 5: Check if campaign loop is actually running
-- ============================================
SELECT 
    '⚠️ After this fix:' as note,
    '1. Restart server: pm2 restart whatscrm' as step1,
    '2. Check logs: pm2 logs whatscrm --lines 100' as step2,
    '3. Look for: "Campaign loop started" or similar messages' as step3,
    '4. Campaigns should change from QUEUE → PROCESSING → COMPLETED' as step4;
