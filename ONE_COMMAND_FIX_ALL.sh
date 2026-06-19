#!/bin/bash
# ============================================================
# ONE COMMAND TO FIX EVERYTHING
# ============================================================

echo "🔧 Fixing currency and exchange rate..."

# Fix database
mysql -u root -p9948318650 whatscrm <<EOF
-- Change currency to INR with rupee symbol
UPDATE web_public 
SET 
    currency_code = 'INR',
    currency_symbol = '₹',
    exchange_rate = 1.0
WHERE id = 1;

-- Show results
SELECT '✅ Currency Settings Updated:' as status;
SELECT currency_code, currency_symbol, exchange_rate FROM web_public;

SELECT '✅ Current Plan Prices:' as status;
SELECT id, plan_name, CONCAT('₹', price) as price, duration FROM plan;
EOF

echo ""
echo "✅ Database fixed!"
echo ""
echo "🔄 Now:"
echo "   1. Restart server: node server.js"
echo "   2. Clear browser cache: Ctrl+Shift+Delete"
echo "   3. Hard refresh: Ctrl+Shift+R"
echo ""
