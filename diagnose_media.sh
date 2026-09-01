#!/bin/bash
# Quick diagnostic script for media visibility issues

echo "🔍 WhatsCRM Media Diagnostic"
echo "=============================="
echo ""

cd /home/ec2-user/whatsappcrm

# Check 1: Directory exists
echo "1️⃣ Media directory:"
if [ -d "client/public/media" ]; then
    echo "   ✅ EXISTS"
    ls -ld client/public/media
else
    echo "   ❌ NOT FOUND - Creating..."
    mkdir -p client/public/media
    chmod 755 client/public/media
fi

echo ""

# Check 2: Permissions
echo "2️⃣ Directory permissions:"
PERMS=$(stat -c "%a" client/public/media 2>/dev/null)
if [ "$PERMS" = "755" ] || [ "$PERMS" = "775" ]; then
    echo "   ✅ Good ($PERMS)"
else
    echo "   ⚠️  Current: $PERMS (fixing to 755...)"
    chmod 755 client/public/media
fi

echo ""

# Check 3: File count
echo "3️⃣ Files in media folder:"
COUNT=$(ls -1 client/public/media 2>/dev/null | wc -l)
echo "   📁 $COUNT files found"
if [ "$COUNT" -gt 0 ]; then
    echo "   Latest 3 files:"
    ls -lht client/public/media | head -4
fi

echo ""

# Check 4: Test URL
echo "4️⃣ Testing media URL accessibility:"
if [ "$COUNT" -gt 0 ]; then
    SAMPLE_FILE=$(ls client/public/media | head -1)
    echo "   Testing: https://eswarigroup.in/media/$SAMPLE_FILE"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://eswarigroup.in/media/$SAMPLE_FILE")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "   ✅ Accessible (HTTP $HTTP_CODE)"
    else
        echo "   ❌ Not accessible (HTTP $HTTP_CODE)"
        echo "   This means Nginx is not serving the files properly"
    fi
else
    echo "   ℹ️  No files to test"
fi

echo ""

# Check 5: Nginx status
echo "5️⃣ Web server status:"
if systemctl is-active --quiet nginx; then
    echo "   ✅ Nginx is running"
elif systemctl is-active --quiet httpd; then
    echo "   ✅ Apache is running"
else
    echo "   ⚠️  No web server detected"
fi

echo ""
echo "=============================="
echo "🎯 Quick Fixes:"
echo ""
echo "If files are not accessible:"
echo "1. chmod 755 client/public/media"
echo "2. chmod 644 client/public/media/*"
echo "3. Add Nginx location block (see nginx_media_config.conf)"
echo "4. sudo systemctl reload nginx"
echo ""
