#!/bin/bash
# Quick Connect to EC2 Instance
# ASE Technologies WhatsApp CRM

EC2_IP="3.7.194.129"
KEY_FILE="$HOME/.ssh/ec2.pem"
USER="ubuntu"  # Change to "ec2-user" if using Amazon Linux

echo "========================================"
echo "  ASE Technologies WhatsApp CRM"
echo "  EC2 Connection Script"
echo "========================================"
echo ""

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "❌ ERROR: Key file not found!"
    echo "   Expected location: $KEY_FILE"
    echo ""
    echo "Please move ec2.pem to: $HOME/.ssh/ec2.pem"
    echo ""
    echo "Commands to move the key:"
    echo "   mkdir -p ~/.ssh"
    echo "   mv ec2.pem ~/.ssh/"
    echo "   chmod 400 ~/.ssh/ec2.pem"
    echo ""
    exit 1
fi

# Check key permissions
PERMS=$(stat -c %a "$KEY_FILE" 2>/dev/null || stat -f %A "$KEY_FILE" 2>/dev/null)
if [ "$PERMS" != "400" ] && [ "$PERMS" != "600" ]; then
    echo "⚠️  WARNING: Key file permissions are too open: $PERMS"
    echo "   Setting permissions to 400..."
    chmod 400 "$KEY_FILE"
    echo "   ✅ Permissions fixed"
    echo ""
fi

echo "✅ Key file found: $KEY_FILE"
echo "🔗 Connecting to: $USER@$EC2_IP"
echo ""

# Connect via SSH
ssh -i "$KEY_FILE" "$USER@$EC2_IP"
