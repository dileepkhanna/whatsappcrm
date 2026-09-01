#!/bin/bash

echo "========================================"
echo "WhatsCRM Media Visibility Fix Script"
echo "========================================"
echo ""

# Navigate to project directory
cd /home/ec2-user/whatsappcrm

echo "1. Checking media directory existence..."
if [ ! -d "client/public/media" ]; then
    echo "⚠️  Media directory doesn't exist. Creating it..."
    mkdir -p client/public/media
    echo "✅ Created client/public/media"
else
    echo "✅ Media directory exists"
fi

echo ""
echo "2. Checking media directory permissions..."
ls -ld client/public/media
echo ""

echo "3. Setting correct permissions for media folder..."
chmod 755 client/public/media
echo "✅ Set media folder permissions to 755"

echo ""
echo "4. Checking if files exist in media folder..."
FILE_COUNT=$(ls -1 client/public/media 2>/dev/null | wc -l)
echo "📁 Found $FILE_COUNT files in media folder"

if [ "$FILE_COUNT" -gt 0 ]; then
    echo ""
    echo "5. Setting permissions for existing files..."
    chmod 644 client/public/media/*
    echo "✅ Set file permissions to 644"
    
    echo ""
    echo "Sample files:"
    ls -lh client/public/media | head -5
fi

echo ""
echo "6. Checking Nginx configuration..."
if [ -f "/etc/nginx/conf.d/whatscrm.conf" ] || [ -f "/etc/nginx/sites-available/whatscrm" ]; then
    echo "✅ Nginx config found"
    echo ""
    echo "Checking if /media location is configured..."
    if grep -q "location /media" /etc/nginx/conf.d/*.conf 2>/dev/null || grep -q "location /media" /etc/nginx/sites-available/* 2>/dev/null; then
        echo "✅ /media location is configured in Nginx"
    else
        echo "⚠️  /media location NOT found in Nginx config"
        echo ""
        echo "Add this to your Nginx server block:"
        echo "----------------------------------------"
        cat << 'EOF'
location /media {
    alias /home/ec2-user/whatsappcrm/client/public/media;
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header Access-Control-Allow-Origin "*";
    try_files $uri =404;
}

location /meta-media {
    alias /home/ec2-user/whatsappcrm/client/public/meta-media;
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header Access-Control-Allow-Origin "*";
    try_files $uri =404;
}
EOF
        echo "----------------------------------------"
        echo ""
        echo "After adding, run: sudo systemctl reload nginx"
    fi
else
    echo "ℹ️  Nginx config not found in standard locations"
    echo "   If you're using Apache or different setup, configure accordingly"
fi

echo ""
echo "7. Testing media URL accessibility..."
echo "Checking: https://eswarigroup.in/media/"
curl -I "https://eswarigroup.in/media/" 2>/dev/null | head -5

echo ""
echo "========================================"
echo "Fix script completed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. If Nginx changes were needed, reload: sudo systemctl reload nginx"
echo "2. Test uploading a new image in the template"
echo "3. Check browser console for any errors"
echo "4. Verify the full image URL is correct"
