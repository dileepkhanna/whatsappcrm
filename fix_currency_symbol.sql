-- Fix currency symbol to INR rupee
UPDATE web_public SET currency_code='INR', currency_symbol='Rs', exchange_rate=1.0;

-- Verify the change
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;
