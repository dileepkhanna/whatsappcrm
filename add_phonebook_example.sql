-- ============================================
-- Quick Script: Add Phonebook and Contacts
-- ============================================

SET @uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t';

-- ============================================
-- Step 1: Create a phonebook
-- ============================================
INSERT INTO phonebook (name, uid) 
VALUES ('My First Phonebook', @uid);

-- Get the ID of the phonebook we just created
SET @phonebook_id = LAST_INSERT_ID();

SELECT CONCAT('✅ Created phonebook with ID: ', @phonebook_id) AS result;

-- ============================================
-- Step 2: Add some sample contacts
-- ============================================

INSERT INTO contact (uid, phonebook_id, phonebook_name, name, mobile, var1, var2, var3, var4, var5) 
VALUES 
  (@uid, @phonebook_id, 'My First Phonebook', 'Kanna', '919948318650', 'Customer', 'Hyderabad', '', '', ''),
  (@uid, @phonebook_id, 'My First Phonebook', 'Test User 1', '919876543210', 'Lead', 'Mumbai', '', '', ''),
  (@uid, @phonebook_id, 'My First Phonebook', 'Test User 2', '919123456789', 'VIP', 'Delhi', '', '', '');

SELECT CONCAT('✅ Added ', ROW_COUNT(), ' contacts to phonebook') AS result;

-- ============================================
-- Step 3: Verify the data
-- ============================================

SELECT '=== PHONEBOOKS ===' AS section;
SELECT id, name, 
       (SELECT COUNT(*) FROM contact WHERE phonebook_id = phonebook.id) AS contact_count
FROM phonebook 
WHERE uid = @uid;

SELECT '=== CONTACTS ===' AS section;
SELECT id, phonebook_name, name, mobile, var1, var2
FROM contact 
WHERE uid = @uid 
ORDER BY phonebook_id, id;

SELECT '=== SUMMARY ===' AS section;
SELECT 
  CONCAT('Total Phonebooks: ', COUNT(DISTINCT phonebook_id)) AS stat1,
  CONCAT('Total Contacts: ', COUNT(*)) AS stat2
FROM contact 
WHERE uid = @uid;

-- ============================================
-- Next Steps:
-- ============================================
SELECT 
  '📋 NEXT STEPS' AS section,
  CONCAT(
    'Your phonebook is ready!\n\n',
    '1. Go to: https://dileepkhanna.dev/user?page=phonebook\n',
    '2. You should see "My First Phonebook" with 3 contacts\n',
    '3. You can now:\n',
    '   - Add more contacts\n',
    '   - Use this phonebook in Broadcast campaigns\n',
    '   - Use this phonebook in WhatsApp template campaigns\n\n',
    '4. To add more contacts via database:\n',
    'INSERT INTO contact (uid, phonebook_id, phonebook_name, name, mobile) \n',
    'VALUES (''', @uid, ''', ', @phonebook_id, ', ''My First Phonebook'', ''New Contact'', ''919999999999'');'
  ) AS instructions;
