# ✅ AWS Keys & EC2 PEM Files - Protected

## What's Protected

Your `.gitignore` now protects all AWS EC2 key pairs and SSH keys from being accidentally committed to Git.

---

## 🔒 Protected Files

### AWS EC2 Key Pairs:
- ✅ `ec2.pem`
- ✅ `*.pem` (all .pem files)
- ✅ `*-key-pair.pem`
- ✅ `*-keypair.pem`
- ✅ `aws-*.pem`
- ✅ `lightsail-*.pem`

### SSH Keys:
- ✅ `id_rsa`
- ✅ `id_rsa.pub`
- ✅ `id_ed25519`
- ✅ `id_ed25519.pub`
- ✅ `*.ppk` (PuTTY keys)
- ✅ `known_hosts`

### AWS Credentials:
- ✅ `.aws/` directory
- ✅ `*.aws/credentials`
- ✅ `.boto`
- ✅ `credentials.json`
- ✅ `service-account.json`

### SSL Certificates:
- ✅ `*.key`
- ✅ `*.crt`
- ✅ `*.cer`
- ✅ `*.p12`
- ✅ `*.pfx`
- ✅ `ssl/` directory
- ✅ `certs/` directory

### Other Cloud Providers:
- ✅ `.gcp/` (Google Cloud)
- ✅ `.azure/` (Microsoft Azure)

---

## ✅ Verification

Test if your ec2.pem file is protected:

```bash
# Should output: .gitignore:XXX:*.pem    ec2.pem
git check-ignore -v ec2.pem

# Test other patterns
git check-ignore -v my-aws-key.pem
git check-ignore -v id_rsa
git check-ignore -v .aws/credentials
```

If you see output with `.gitignore` in it, the file is **PROTECTED** ✅

---

## 🚨 If Already Committed

If you've already committed an EC2 .pem file, remove it immediately:

```bash
# Remove ec2.pem from Git (keeps local file)
git rm --cached ec2.pem

# Or remove all .pem files
git rm --cached *.pem

# Commit the removal
git commit -m "Security: Remove EC2 key pairs from version control"

# Push immediately
git push
```

### ⚠️ CRITICAL SECURITY STEPS:

After removing a committed .pem file:

1. **Consider the key compromised**
2. **Create a new EC2 key pair immediately:**
   - AWS Console → EC2 → Key Pairs → Create Key Pair
3. **Update EC2 instances with new key**
4. **Delete the old key pair from AWS**
5. **Never use the old .pem file again**

---

## 📁 Where to Store EC2 Keys

### ✅ SAFE Locations:

**Option 1: Separate secure directory (Recommended)**
```bash
# Create secure directory outside project
mkdir ~/aws-keys
chmod 700 ~/aws-keys

# Move key there
mv ec2.pem ~/aws-keys/
chmod 400 ~/aws-keys/ec2.pem

# Connect to EC2
ssh -i ~/aws-keys/ec2.pem ec2-user@your-server.com
```

**Option 2: User's .ssh directory**
```bash
# Move to .ssh directory
mv ec2.pem ~/.ssh/
chmod 400 ~/.ssh/ec2.pem

# Connect to EC2
ssh -i ~/.ssh/ec2.pem ec2-user@your-server.com
```

**Option 3: Use SSH config**
```bash
# Add to ~/.ssh/config
Host my-ec2
    HostName your-ec2-ip.compute.amazonaws.com
    User ec2-user
    IdentityFile ~/.ssh/ec2.pem
    IdentitiesOnly yes

# Then connect simply with:
ssh my-ec2
```

### ❌ UNSAFE Locations:

- ❌ Project root directory
- ❌ Any directory tracked by Git
- ❌ Public folders
- ❌ Shared network drives
- ❌ Cloud storage (Dropbox, Google Drive, OneDrive)
- ❌ Desktop or Downloads folder

---

## 🔐 Best Practices

### Key File Permissions:
```bash
# Set strict permissions (read-only for owner)
chmod 400 ec2.pem

# Verify permissions
ls -la ec2.pem
# Should show: -r-------- 1 user user
```

### Backup Keys Securely:
```bash
# Encrypt before backing up
gpg -c ec2.pem
# Creates: ec2.pem.gpg (encrypted)

# Store encrypted backup in secure location
# Never backup unencrypted .pem files to cloud!
```

### Multiple Keys:
```bash
# Use descriptive names
production-ec2.pem
staging-lightsail.pem
dev-aws-key.pem

# All automatically ignored by .gitignore
```

---

## 🎯 Quick Check: Is My Key Safe?

Run these commands in your project directory:

```bash
# Check if any .pem files are tracked
git ls-files | grep '\.pem$'

# Should return NOTHING
# If it shows files, they're tracked (BAD!)

# Check if .pem files are ignored
find . -name "*.pem" -type f | while read file; do
    git check-ignore -q "$file" && echo "✅ $file is ignored" || echo "❌ $file is NOT ignored"
done
```

---

## 📝 What to Commit Instead

If you need to document EC2 access:

### Create: `AWS_ACCESS.md` (Example)
```markdown
# AWS EC2 Access Instructions

## Servers

### Production Server
- **Instance ID:** i-1234567890abcdef
- **Public IP:** 203.0.113.42
- **Region:** us-east-1
- **Key Pair Name:** production-ec2
- **Key File Location:** ~/.ssh/production-ec2.pem (NOT in repo)

### Connect:
```bash
ssh -i ~/.ssh/production-ec2.pem ec2-user@203.0.113.42
```

### Staging Server
- **Instance ID:** i-abcdef1234567890
- **Public IP:** 203.0.113.99
- **Region:** us-east-1
- **Key Pair Name:** staging-ec2
- **Key File Location:** ~/.ssh/staging-ec2.pem (NOT in repo)
```

**✅ Commit** this documentation
**❌ Don't commit** the actual .pem files

---

## 🆘 Emergency: Committed .pem File

If you accidentally committed and pushed an EC2 .pem file:

### Immediate Actions (Within 5 minutes):

```bash
# 1. Remove from Git
git rm --cached ec2.pem
git commit -m "Security: Remove EC2 key"
git push --force

# 2. AWS Console - Create new key pair
# 3. Update EC2 instances
# 4. Delete old key pair from AWS
```

### If Pushed More Than 5 Minutes Ago:

**The key is compromised. You must:**

1. ✅ Create new EC2 key pair in AWS Console
2. ✅ Add new public key to EC2 instances
3. ✅ Update all deployment scripts with new key
4. ✅ Delete old key pair from AWS
5. ✅ Review AWS CloudTrail for suspicious activity
6. ✅ Check EC2 security groups and network ACLs
7. ✅ Consider rotating other credentials
8. ✅ Clean Git history (see below)

### Clean Git History:
```bash
# Install BFG Repo Cleaner
# Download: https://rtyley.github.io/bfg-repo-cleaner/

# Remove .pem files from entire history
java -jar bfg.jar --delete-files '*.pem'

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (everyone must re-clone)
git push --force
```

---

## ✅ Verification Checklist

Before committing:

- [ ] Verified `git check-ignore -v ec2.pem` shows it's ignored
- [ ] Ran `git status` and no .pem files appear
- [ ] EC2 keys stored in `~/.ssh/` or `~/aws-keys/`
- [ ] Key permissions set to `400` (read-only)
- [ ] No keys in project directory
- [ ] Documentation created (without actual keys)
- [ ] Team members know where keys are stored
- [ ] Backup keys are encrypted

---

## 📞 More Information

- **AWS Key Pair Docs:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html
- **SSH Best Practices:** https://www.ssh.com/academy/ssh/public-key-authentication
- **Git Security:** See GIT_SETUP_GUIDE.md

---

**Status:** ✅ PROTECTED  
**EC2 .pem Files:** 🔒 SECURE  
**Last Updated:** January 2025

Your AWS keys are now fully protected from Git commits!
