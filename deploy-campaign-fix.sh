#!/bin/bash

# ============================================
# Campaign Fix Deployment Script
# ============================================
# This script deploys the campaign processing fix to production
# Run this on your production server (13.205.34.169)

set -e  # Exit on any error

echo "============================================"
echo "📤 Campaign Processing Fix Deployment"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check current directory
echo "📁 Step 1: Checking current directory..."
if [ ! -f "app.js" ]; then
    echo -e "${RED}❌ ERROR: app.js not found. Are you in the whatscrm directory?${NC}"
    exit 1
fi
echo -e "${GREEN}✅ In correct directory${NC}"
echo ""

# Step 2: Check git status
echo "📊 Step 2: Checking git status..."
git status
echo ""

# Step 3: Ask user how to handle conflicts
echo "❓ Step 3: How do you want to handle local changes?"
echo "   1) Keep local changes (commit them first)"
echo "   2) Discard local changes (use git stash)"
echo "   3) Cancel deployment"
echo ""
read -p "Enter your choice (1/2/3): " choice

case $choice in
    1)
        echo -e "${YELLOW}📝 Committing local changes...${NC}"
        git add .
        git commit -m "Fix: Enable campaign processing and phonebook UI improvements"
        ;;
    2)
        echo -e "${YELLOW}📦 Stashing local changes...${NC}"
        git stash
        ;;
    3)
        echo -e "${YELLOW}🚫 Deployment cancelled${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Invalid choice. Deployment cancelled.${NC}"
        exit 1
        ;;
esac
echo ""

# Step 4: Pull latest code
echo "⬇️  Step 4: Pulling latest code from GitHub..."
git pull origin main
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Git pull failed! Please resolve conflicts manually.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Code updated successfully${NC}"
echo ""

# Step 5: Verify initCampaign is uncommented
echo "🔍 Step 5: Verifying campaign loop is enabled..."
if grep -q "initCampaign();" app.js; then
    echo -e "${GREEN}✅ Campaign loop is enabled in app.js${NC}"
else
    echo -e "${RED}⚠️  WARNING: initCampaign() not found in app.js!${NC}"
    echo -e "${YELLOW}Please check manually: grep -A 2 'initCampaign()' app.js${NC}"
fi
echo ""

# Step 6: Restart PM2
echo "🔄 Step 6: Restarting PM2 process..."
pm2 restart whatscrm
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ PM2 restart failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Application restarted${NC}"
echo ""

# Step 7: Wait for startup
echo "⏳ Waiting 3 seconds for startup..."
sleep 3
echo ""

# Step 8: Show logs
echo "📋 Step 7: Checking logs..."
echo -e "${YELLOW}Showing last 30 lines (Press Ctrl+C to exit log view):${NC}"
echo ""
pm2 logs whatscrm --lines 30

echo ""
echo "============================================"
echo "✅ DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "🎯 Next Steps:"
echo "1. Monitor logs: pm2 logs whatscrm"
echo "2. Check database: mysql -u whatscrm_user -p whatscrm_prod"
echo "3. Run this query to check campaigns:"
echo ""
echo "   SELECT campaign_id, title, status, sent_count, total_contacts"
echo "   FROM beta_campaign"
echo "   WHERE uid = 'N3PtG1RbbhDXZmOz607ic1hvQ1PFQ43t'"
echo "   ORDER BY createdAt DESC LIMIT 5;"
echo ""
echo "4. Watch dashboard: https://dileepkhanna.dev"
echo ""
echo "📄 Full guide: See CAMPAIGN_DEPLOYMENT_GUIDE.md"
echo ""
