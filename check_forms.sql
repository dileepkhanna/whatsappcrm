-- Check available WhatsApp forms
-- Run this to find the correct form ID

SELECT 
    id,
    name,
    flow_id,
    flow_status,
    createdAt
FROM wa_forms
WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t'
ORDER BY createdAt DESC;

-- If no results, check if forms exist at all:
SELECT COUNT(*) as total_forms FROM wa_forms;

-- Check if the flow_id matches what you're looking for:
SELECT * FROM wa_forms 
WHERE flow_id = '1016919324967980';
