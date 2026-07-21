# Git Quick Commands Reference

Quick copy-paste commands for daily Git usage.

---

## 🔍 Check Status

```bash
# See what changed
git status

# Short format
git status -s

# See what's ignored
git status --ignored
```

---

## ✅ Verify .gitignore Working

```bash
# Test if .env is ignored (should say "ignored")
git check-ignore -v .env

# Test if auth_info_baileys is ignored
git check-ignore -v auth_info_baileys/

# Test if node_modules is ignored
git check-ignore -v node_modules/
```

---

## 📝 Daily Workflow

```bash
# Pull latest changes
git pull

# Add all changes
git add .

# Commit with message
git commit -m "Your message here"

# Push to remote
git push
```

---

## 🚨 Remove Sensitive File (Already Committed)

```bash
# Remove .env from Git (keeps local file)
git rm --cached .env
git commit -m "Security: Remove .env from version control"
git push

# Remove directory from Git
git rm --cached -r auth_info_baileys/
git commit -m "Security: Remove WhatsApp sessions"
git push
```

---

## 🌿 Branches

```bash
# Create and switch to new branch
git checkout -b feature-name

# Switch to existing branch
git checkout main

# List all branches
git branch -a

# Delete branch
git branch -d feature-name

# Push branch to remote
git push -u origin feature-name
```

---

## ↩️ Undo Changes

```bash
# Undo changes to file (before commit)
git checkout -- filename.js

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes) - DANGEROUS!
git reset --hard HEAD~1

# Temporarily save changes
git stash
git stash pop
```

---

## 📊 View History

```bash
# View commit history
git log --oneline

# View graphical history
git log --oneline --graph --all

# View changes in file
git log -p filename.js

# See who changed what
git blame filename.js
```

---

## 🔗 Remote Repository

```bash
# Add remote (first time)
git remote add origin https://github.com/username/repo.git

# View remote
git remote -v

# Push to remote (first time)
git push -u origin main

# Push to remote (after first time)
git push
```

---

## 🎯 First Time Setup

```bash
# 1. Initialize Git
git init

# 2. Configure user (if needed)
git config user.name "Your Name"
git config user.email "your.email@example.com"

# 3. Add all files
git add .

# 4. Check what will be committed
git status

# 5. Make sure .env and auth_info_baileys/ are NOT listed!

# 6. Commit
git commit -m "Initial commit: ASE Technologies WhatsApp CRM v5.9.5"

# 7. Add remote
git remote add origin https://github.com/username/repo.git

# 8. Push
git push -u origin main
```

---

## 🧹 After Cleanup (161 Files Deleted)

```bash
# Stage all changes (including deletions)
git add .

# Check what's changed
git status

# You should see ~161 files marked with 'D' (deleted)

# Commit the cleanup
git commit -m "Clean up: Remove 161 test/helper files, update .gitignore"

# Push changes
git push
```

---

## 🔒 Security Check Before Commit

```bash
# ALWAYS run these before committing:

# 1. Check .env is ignored
git check-ignore -v .env

# 2. Check auth_info_baileys is ignored
git check-ignore -v auth_info_baileys/

# 3. Review what will be committed
git status

# 4. If you see .env or auth_info_baileys/ in git status, STOP!
#    Fix .gitignore first!
```

---

## 📦 Common Scenarios

### Scenario 1: Made changes, want to commit
```bash
git add .
git commit -m "Fix: Description of what you fixed"
git push
```

### Scenario 2: Need to pull before push
```bash
git pull
# If conflicts, resolve them then:
git add .
git commit -m "Merge: Resolve conflicts"
git push
```

### Scenario 3: Accidentally added wrong file
```bash
git reset filename.js
# Or to unstage everything:
git reset
```

### Scenario 4: Want to see what changed before committing
```bash
git diff
git diff filename.js
```

### Scenario 5: Forgot to add file to last commit
```bash
git add forgotten-file.js
git commit --amend --no-edit
git push --force  # Only if not pushed yet!
```

---

## ⚠️ DANGEROUS Commands (Use with Caution)

```bash
# Force push - overwrites remote history
git push --force

# Hard reset - discards all changes
git reset --hard HEAD~1

# Clean untracked files - deletes files!
git clean -fd
```

**Only use these if you know what you're doing!**

---

## 🎨 Git Aliases (Optional Time Savers)

Add these to `~/.gitconfig`:

```bash
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
```

Then use:
```bash
git st          # instead of git status
git co main     # instead of git checkout main
git ci -m "msg" # instead of git commit -m "msg"
```

---

## 📝 Commit Message Format

```bash
# Good commit messages:
git commit -m "Fix: Resolve ASE branding flash on page load"
git commit -m "Add: WhatsApp QR code auto-reconnect feature"
git commit -m "Update: Improve pricing section responsive design"
git commit -m "Remove: Delete 161 unnecessary test files"
git commit -m "Docs: Add Git setup guide and .gitignore"

# Bad commit messages:
git commit -m "changes"
git commit -m "update"
git commit -m "fix"
git commit -m "wip"
```

**Format:** `Type: Description`

**Types:**
- `Fix:` - Bug fixes
- `Add:` - New features
- `Update:` - Improvements
- `Remove:` - Deletions
- `Docs:` - Documentation
- `Security:` - Security fixes
- `Refactor:` - Code restructuring

---

## 🆘 Emergency: Committed Sensitive Data

```bash
# 1. Remove from Git immediately
git rm --cached .env
git commit -m "Security: Remove .env"
git push

# 2. IMMEDIATELY rotate ALL secrets:
#    - Change database password
#    - Regenerate API keys
#    - Update session secret
#    - Reconnect WhatsApp accounts

# 3. Clean history (advanced - use with caution):
#    Install BFG Repo Cleaner
#    https://rtyley.github.io/bfg-repo-cleaner/
```

---

**Project:** ASE Technologies WhatsApp CRM v5.9.5  
**Last Updated:** January 2025

For detailed guide, see: **GIT_SETUP_GUIDE.md**
