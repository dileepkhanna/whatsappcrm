# Fix HTTP to HTTPS URL Issue - Production Deployment

## Issue
Campaign header image URLs were being generated with `http://` instead of `https://`, causing WhatsApp template errors.

## Root Cause
The `.env` file had `FRONTENDURI=http://localhost:3010` which was being used to generate all media URLs.

## Solution
Update `.env` on the production server to use HTTPS URLs.

## Deployment Steps

### 1. Backup Current .env File
```bash
ssh ec2-user@your-server-ip
cd /home/ec2-user/whatsappcrm
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
```

### 2. Update .env File on Server
```bash
# Edit the .env file
nano .env
```

Find these lines:
```
FRONTENDURI=http://localhost:3010
BACKURI=http://localhost:3010
NODE_ENV=development
```

Change them to:
```
FRONTENDURI=https://eswarigroup.in
BACKURI=https://eswarigroup.in
NODE_ENV=production
```

Save and exit (Ctrl+O, Enter, Ctrl+X)

### 3. Restart the Application
```bash
# Restart PM2 process to load new environment variables
pm2 restart whatsappcrm

# Check logs to ensure it started correctly
pm2 logs whatsappcrm --lines 50
```

### 4. Verify the Fix
After restarting, any new media uploads will generate HTTPS URLs:
- Upload a new image in the campaign creation form
- Verify the URL shows `https://eswarigroup.in/media/...` instead of `http://...`
- Create a test campaign with the new HTTPS URL
- Check if the WhatsApp API accepts it without the #132012 error

## Testing
1. Create a new campaign with a header image
2. Check the generated URL in the PM2 logs:
   ```bash
   pm2 logs whatsappcrm --lines 100 | grep "https://eswarigroup.in/media"
   ```
3. Verify the campaign sends successfully without parameter format errors

## Alternative: Quick One-Liner Update
```bash
ssh ec2-user@your-server-ip "cd /home/ec2-user/whatsappcrm && sed -i 's|FRONTENDURI=http://localhost:3010|FRONTENDURI=https://eswarigroup.in|g' .env && sed -i 's|BACKURI=http://localhost:3010|BACKURI=https://eswarigroup.in|g' .env && sed -i 's|NODE_ENV=development|NODE_ENV=production|g' .env && pm2 restart whatsappcrm"
```

## Notes
- **Existing media files**: Old URLs in the database won't automatically update. You may need to manually change them or re-upload the media.
- **Template parameters**: The header parameter must match exactly what the template expects. Make sure your template is configured for IMAGE type with one parameter.
- **SSL verification**: The HTTPS URLs will work because your SSL certificate is already valid and nginx is correctly forwarding requests.

## Rollback (if needed)
```bash
cd /home/ec2-user/whatsappcrm
cp .env.backup.YYYYMMDD_HHMMSS .env
pm2 restart whatsappcrm
```
