# Git Setup Guide - ASE Technologies WhatsApp CRM

## 📋 Overview
This guide helps you set up Git version control for your WhatsApp CRM project safely and correctly.

---

## ✅ Step 1: Verify .gitignore is Working

Before committing anything, verify your .gitignore is protecting sensitive files:

```bash
# Check if .env is ignored (should say "ignored")
git check-ignore -v .env

# Check auth_info_baileys is ignored (should say "ignored")
git check-ignore -v auth_info_baileys/

# List all files that would be committed
git status
```

**IMPORTANT:** If `.env` or `auth_info_baileys/` appear in `git status`, STOP and fix your .gitignore first!

---

## 🔒 Step 2: Remove Already-Committed Sensitive Files

If you've already committed sensitive files, remove them:

```bash
# Remove .env from Git (keeps local file)
git rm --cached .env

# Remove auth_info_baileys directory from Git
git rm --cached -r auth_info_baileys/

# Remove any test files if accidentally committed
git rm --cached test-*.js check-*.js fix-*.js

# Commit the removal
git commit -m "Remove sensitive files from version control"
```

---

## 📝 Step 3: Create .env.example

Create a template .env file WITHOUT sensitive data:

```bash
# Copy your .env
cp .env .env.example
```

Then edit `.env.example` and replace all sensitive values with placeholders:

```env
# Database
DB_HOST=localhost
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=whatscrm
DB_PORT=3306

# Server
PORT=3010
NODE_ENV=production

# Session Secret
SESSION_SECRET=your_random_secret_here_change_this

# Meta API (Facebook/WhatsApp Business)
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_VERIFY_TOKEN=your_verify_token

# Add other variables with placeholder values
```

---

## 🚀 Step 4: Initial Commit

If this is your first commit:

```bash
# Initialize Git (if not already done)
git init

# Add all files (respecting .gitignore)
git add .

# Check what's being committed
git status

# Make sure .env and auth_info_baileys/ are NOT in the list!

# Create initial commit
git commit -m "Initial commit: ASE Technologies WhatsApp CRM v5.9.5"
```

---

## 🌿 Step 5: Create Branches (Recommended)

Use branches for different environments:

```bash
# Create and switch to development branch
git checkout -b development

# Create production branch from main
git checkout -b production main

# Switch back to main
git checkout main
```

**Branch Strategy:**
- `main` - Stable production-ready code
- `development` - Active development and testing
- `production` - Deployed production code
- `feature/feature-name` - Individual features

---

## 🔗 Step 6: Add Remote Repository (GitHub/GitLab/Bitbucket)

### GitHub:
```bash
# Add remote
git remote add origin https://github.com/your-username/whatscrm.git

# Push to GitHub
git push -u origin main

# Push all branches
git push --all origin
```

### GitLab:
```bash
# Add remote
git remote add origin https://gitlab.com/your-username/whatscrm.git

# Push to GitLab
git push -u origin main
```

### Private Server:
```bash
# Add remote
git remote add origin user@your-server.com:/path/to/repo.git

# Push to server
git push -u origin main
```

---

## 📦 Step 7: Daily Git Workflow

### Making Changes:
```bash
# See what changed
git status

# Add specific files
git add file1.js file2.js

# Or add all changes
git add .

# Commit with message
git commit -m "Add new feature: description"

# Push to remote
git push
```

### Good Commit Messages:
```
✅ "Fix: Resolve ASE branding flash on page load"
✅ "Add: New WhatsApp QR code generation feature"
✅ "Update: Improve pricing section alignment"
✅ "Remove: Delete unnecessary test files"
❌ "changes"
❌ "update"
❌ "fix bug"
```

---

## 🔄 Step 8: Pulling Updates

When working with a team:

```bash
# Pull latest changes
git pull origin main

# If there are conflicts, resolve them and:
git add .
git commit -m "Merge: Resolve conflicts"
git push
```

---

## 🛡️ Step 9: Security Best Practices

### ✅ DO:
- ✅ Always use .gitignore for sensitive files
- ✅ Commit .env.example with placeholder values
- ✅ Use environment variables for secrets
- ✅ Review changes before committing (`git status`, `git diff`)
- ✅ Keep auth_info_baileys/ out of version control
- ✅ Commit meaningful documentation
- ✅ Use branches for features and fixes

### ❌ DON'T:
- ❌ NEVER commit .env files
- ❌ NEVER commit database passwords
- ❌ NEVER commit API keys or tokens
- ❌ NEVER commit WhatsApp session files
- ❌ NEVER commit node_modules/
- ❌ NEVER commit logs or temp files
- ❌ Don't force push to main/production branches

---

## 🧹 Step 10: Clean Up History (If Needed)

If you accidentally committed sensitive data:

### Option 1: Remove Last Commit (if not pushed)
```bash
# Undo last commit, keep changes
git reset --soft HEAD~1

# Undo last commit, discard changes
git reset --hard HEAD~1
```

### Option 2: Remove File from History (if pushed)
```bash
# Install BFG Repo Cleaner
# Download from: https://rtyley.github.io/bfg-repo-cleaner/

# Remove .env from entire history
java -jar bfg.jar --delete-files .env

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (DANGEROUS - only if necessary)
git push --force
```

⚠️ **WARNING:** After cleaning history, immediately:
1. Rotate all exposed secrets
2. Change all passwords
3. Regenerate API keys
4. Consider all data compromised

---

## 📊 Useful Git Commands

```bash
# View commit history
git log --oneline --graph --all

# See what changed in a file
git diff filename.js

# Undo changes to a file (before commit)
git checkout -- filename.js

# See who changed a line
git blame filename.js

# Create a tag for version
git tag -a v5.9.5 -m "ASE Technologies Version 5.9.5"
git push --tags

# List all branches
git branch -a

# Delete a branch
git branch -d branch-name

# Stash changes temporarily
git stash
git stash pop
```

---

## 🐛 Troubleshooting

### Issue: .env is showing in git status
**Solution:**
```bash
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Fix: Remove .env from tracking"
```

### Issue: Too many files to commit
**Solution:**
```bash
# Make sure .gitignore is correct
git check-ignore -v filename

# Update .gitignore and remove cached files
git rm -r --cached .
git add .
git commit -m "Update .gitignore rules"
```

### Issue: Merge conflicts
**Solution:**
```bash
# See conflicted files
git status

# Edit files, resolve conflicts (look for <<<<<<, ======, >>>>>>)
# After fixing:
git add resolved-file.js
git commit -m "Merge: Resolve conflicts in resolved-file.js"
```

---

## 📚 What Should Be Committed?

### ✅ Commit These:
- Source code (.js, .jsx, .ts, .tsx)
- Configuration files (package.json, jest.config.js)
- Routes, models, middlewares
- Client-side code (React components)
- Public assets (logos, icons - ASE logo)
- Documentation (.md files)
- Database schema (whatscrm_schema.sql)
- .env.example (template)
- .gitignore

### ❌ Don't Commit These:
- .env (environment variables)
- node_modules/ (dependencies)
- auth_info_baileys/ (WhatsApp sessions)
- logs/ (log files)
- test-*.js, check-*.js (test files)
- *.log (logs)
- sessions/ (user sessions)
- Uploaded media (client/public/media/*)

---

## 🎯 Quick Reference

```bash
# Setup
git init
git add .
git commit -m "Initial commit"
git remote add origin URL
git push -u origin main

# Daily workflow
git pull                          # Get updates
git add .                         # Stage changes
git commit -m "Message"           # Commit
git push                          # Upload

# Branch workflow
git checkout -b feature-name      # Create branch
git checkout main                 # Switch to main
git merge feature-name            # Merge branch

# Emergency
git rm --cached .env              # Remove .env
git reset --hard HEAD~1           # Undo last commit
git stash                         # Temporarily save changes
```

---

## 📞 Need Help?

- **Git Documentation:** https://git-scm.com/doc
- **GitHub Guides:** https://guides.github.com/
- **Git Cheat Sheet:** https://education.github.com/git-cheat-sheet-education.pdf

---

## ✅ Checklist Before First Push

- [ ] .gitignore is in place and working
- [ ] .env is NOT in git status
- [ ] auth_info_baileys/ is NOT in git status
- [ ] node_modules/ is NOT in git status
- [ ] .env.example exists with placeholder values
- [ ] Reviewed all files with `git status`
- [ ] Tested locally after cleanup
- [ ] Created meaningful commit message
- [ ] Backed up database and .env separately

**Once verified, push with confidence!** 🚀

---

**Last Updated:** January 2025  
**Project:** ASE Technologies WhatsApp CRM v5.9.5
