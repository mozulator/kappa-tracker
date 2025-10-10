# Pre-Deployment Checklist

## ✅ Before You Deploy

### 1. Update Prisma Schema for PostgreSQL

**Edit `prisma/schema.prisma`:**

```prisma
datasource db {
  provider = "postgresql"  // Change from "sqlite"
  url      = env("DATABASE_URL")
}
```

### 2. Create GitHub Repository

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - Multi-user Kappa Tracker"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/kappa-tracker.git
git branch -M main
git push -u origin main
```

### 3. Generate Strong Session Secret

Use this command to generate a random secret:

**Windows PowerShell:**
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

**Or visit:** https://randomkeygen.com/ (use "CodeIgniter Encryption Keys")

Save this for your environment variables!

### 4. Environment Variables for Production

You'll need to set these on your hosting platform:

```
NODE_ENV=production
DATABASE_URL=<provided-by-hosting-platform>
SESSION_SECRET=<your-random-secret-from-step-3>
```

---

## 🚀 Quick Deploy: Railway (Easiest)

### Step-by-Step:

1. **Update Prisma Schema** (Step 1 above)

2. **Commit Changes:**
   ```bash
   git add prisma/schema.prisma
   git commit -m "Switch to PostgreSQL for production"
   git push
   ```

3. **Go to Railway:**
   - Visit [railway.app](https://railway.app)
   - Sign up with GitHub
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `kappa-tracker` repository

4. **Add Database:**
   - In your project, click "New"
   - Select "Database" → "Add PostgreSQL"
   - Railway automatically sets `DATABASE_URL`

5. **Set Environment Variable:**
   - Click on your service (not the database)
   - Go to "Variables" tab
   - Add:
     - Key: `SESSION_SECRET`
     - Value: (paste your random secret from Step 3)
   - Add:
     - Key: `NODE_ENV`
     - Value: `production`

6. **Deploy!**
   - Railway will automatically build and deploy
   - Wait 2-3 minutes
   - You'll get a URL like: `kappa-tracker-production-xxxx.up.railway.app`

7. **Test:**
   - Visit your URL
   - Register an account
   - Track a quest
   - Check rankings!

---

## 🌐 Adding Your Custom Domain

### On Railway:

1. Click your service → "Settings"
2. Scroll to "Domains"
3. Click "Add Domain"
4. Enter your domain: `tracker.yourdomain.com`
5. Add the CNAME record to your DNS:
   - Type: `CNAME`
   - Name: `tracker` (or `@` for root domain)
   - Value: (Railway provides this)
   - TTL: `3600`

### On Render:

1. Go to your service → "Settings"
2. Scroll to "Custom Domains"
3. Click "Add Custom Domain"
4. Enter your domain
5. Add the CNAME/A record shown

**DNS propagation takes 5-60 minutes.**

---

## 🔒 Security Checklist

Before going live:

- ✅ Changed `SESSION_SECRET` to strong random string
- ✅ Set `NODE_ENV=production`
- ✅ Using PostgreSQL (not SQLite)
- ✅ HTTPS enabled (automatic on Railway/Render)
- ✅ Tested registration/login
- ✅ Tested quest tracking
- ✅ Checked rankings page

---

## 🐛 Common Deployment Issues

### "Prisma Client not found"
**Fix:** Make sure build command includes:
```bash
npm install && npx prisma generate
```

### "Database connection failed"
**Fix:** Verify `DATABASE_URL` is set correctly by the platform

### "Session not persisting"
**Fix:** Ensure `SESSION_SECRET` is set and HTTPS is enabled

### "App crashes on startup"
**Fix:** Check logs, usually missing environment variables

---

## 📊 After Deployment

### Monitor Your App:

**Railway:**
- View logs in dashboard
- Check database usage
- Monitor free tier credits

**Render:**
- Check deployment logs
- Monitor service status
- Free tier may sleep (wakes on request)

### Update Your App:

Just push to GitHub:
```bash
git add .
git commit -m "Update feature"
git push
```

Both Railway and Render auto-deploy on push!

---

## 💰 Cost Summary

### Railway (Recommended)
- **Free Tier:** $5/month credit
- **Usage:** ~$3-5/month for small app
- **Good for:** 100-1000 users

### Render
- **Free Tier:** Yes (with limitations)
- **Paid:** Starts at $7/month
- **Note:** Free tier sleeps after inactivity

### Own VPS (DigitalOcean, etc.)
- **Cost:** $5-10/month
- **Full Control:** Yes
- **Setup Time:** 30-60 minutes

---

## 🎯 Recommended Path

**For most users:**

1. ✅ Deploy to Railway (free, easy, fast)
2. ✅ Test with Railway subdomain
3. ✅ Add custom domain when ready
4. ✅ Upgrade if you outgrow free tier

**For developers:**

1. Use Docker + your own VPS
2. Full control, lower cost at scale
3. See Docker section in DEPLOYMENT.md

---

## 📞 Need Help?

Check these files:
- **DEPLOYMENT.md** - Detailed platform guides
- **README-MULTIUSER.md** - Feature documentation
- **TRANSFORMATION-SUMMARY.md** - What changed

---

**Ready to deploy? Follow the Railway steps above! 🚀**

Made by [twitch.tv/mozula](https://twitch.tv/mozula)

