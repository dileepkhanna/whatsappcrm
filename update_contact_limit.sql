-- SQL Script to Update Contact Limit for eswarigroup9@gmail.com
-- Run this directly in your production database

-- Step 1: Check current plan details for the user
SELECT 
    uid,
    email, 
    name,
    plan,
    plan_expire
FROM user 
WHERE email = 'eswarigroup9@gmail.com';

-- Step 2: Update the contact_limit in the plan JSON
-- Replace 1000 with your desired contact limit
UPDATE user 
SET plan = JSON_SET(plan, '$.contact_limit', 1000)
WHERE email = 'eswarigroup9@gmail.com';

-- Step 3: Verify the update
SELECT 
    email,
    JSON_EXTRACT(plan, '$.contact_limit') as contact_limit,
    plan
FROM user 
WHERE email = 'eswarigroup9@gmail.com';

-- Alternative: If you want to set unlimited contacts (use a very high number)
-- UPDATE user 
-- SET plan = JSON_SET(plan, '$.contact_limit', 999999)
-- WHERE email = 'eswarigroup9@gmail.com';
