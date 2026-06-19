-- ============================================================
-- WhatsCRM - WhatsApp Meta Cloud API Configuration
-- ============================================================
-- This script adds WhatsApp Cloud API credentials to the database
-- Replace the placeholder values with your actual Meta API credentials

-- INSTRUCTIONS:
-- 1. Get your credentials from Meta for Developers: https://developers.facebook.com/
-- 2. Replace the values below with your actual credentials
-- 3. Run this SQL script in your MySQL database

-- Get the user ID first (you need to know which user this API is for)
-- SELECT uid, email FROM user;

-- Example: For user with uid = 1
INSERT INTO meta_api (
    uid,
    waba_id,
    access_token,
    business_phone_number_id,
    app_id,
    login_type,
    created_at
) VALUES (
    1,  -- Replace with actual user uid
    'YOUR_WABA_ID_HERE',  -- e.g., '123456789012345'
    'YOUR_PERMANENT_ACCESS_TOKEN_HERE',  -- e.g., 'EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    'YOUR_BUSINESS_PHONE_NUMBER_ID_HERE',  -- e.g., '987654321098765'
    'YOUR_APP_ID_HERE',  -- e.g., '123456789012345'
    'manual',
    NOW()
) ON DUPLICATE KEY UPDATE
    waba_id = VALUES(waba_id),
    access_token = VALUES(access_token),
    business_phone_number_id = VALUES(business_phone_number_id),
    app_id = VALUES(app_id),
    login_type = VALUES(login_type);

-- ============================================================
-- HOW TO GET THESE VALUES:
-- ============================================================
--
-- 1. WABA_ID (WhatsApp Business Account ID):
--    - Go to Meta Business Manager
--    - Navigate to WhatsApp Accounts
--    - Copy the Account ID (usually 15 digits)
--
-- 2. ACCESS_TOKEN (Permanent Access Token):
--    - Go to Meta for Developers → Your App
--    - Navigate to WhatsApp → API Setup
--    - Generate a permanent access token (NOT the temporary 24-hour token)
--    - Starts with 'EAA...'
--
-- 3. BUSINESS_PHONE_NUMBER_ID:
--    - In WhatsApp API Setup page
--    - Find "Phone number ID" under your test number
--    - Copy the numeric ID
--
-- 4. APP_ID:
--    - Your Meta App ID
--    - Found in App Dashboard → Settings → Basic
--
-- ============================================================
-- VERIFY YOUR SETUP:
-- ============================================================
-- Run this query to check if credentials were added:
-- SELECT * FROM meta_api WHERE uid = 1;
--
-- ============================================================
