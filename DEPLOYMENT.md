# Deployment Guide for EFT Kappa Tracker

This guide covers deploying the Kappa Tracker to various platforms.

## Prerequisites

Before deploying, make sure you:

1. Have a GitHub repository with your code
2. Have updated `.env` with production values
3. Have tested locally with `npm start`

## Option 1: Railway (Recommended for Beginners)

Railway provides free tier with PostgreSQL database included.

### Steps:

1. **Sign up at [Railway.app](https://railway.app)**

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your repository

3. **Add PostgreSQL Database**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will automatically set `DATABASE_URL`

4. **Set Environment Variables**
   - Go to your service → "Variables"
   - Add:
     ```
     NODE_ENV=production
     SESSION_SECRET=your-random-secret-here
     ```

5. **Update Prisma Schema**
   - Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`
   - Commit and push

6. **Deploy**
   - Railway will automatically deploy
   - Your app will be available at `your-app.railway.app`

### Cost: Free tier includes $5/month credit

---

## Option 2: Render

Render offers free tier with managed PostgreSQL.

### Steps:

1. **Sign up at [Render.com](https://render.com)**

2. **Create PostgreSQL Database**
   - Dashboard → "New" → "PostgreSQL"
   - Choose free tier
   - Note the internal connection string

3. **Create Web Service**
   - Dashboard → "New" → "Web Service"
   - Connect your GitHub repository
   - Settings:
     - **Environment:** Node
     - **Build Command:** `npm install && npx prisma generate`
     - **Start Command:** `npx prisma migrate deploy && node server.js`

4. **Set Environment Variables**
   ```
   NODE_ENV=production
   SESSION_SECRET=your-random-secret-here
   DATABASE_URL=<your-postgres-connection-string>
   ```

5. **Update Prisma Schema**
   - Change to PostgreSQL provider
   - Commit and push

6. **Deploy**
   - Render will build and deploy automatically

### Cost: Free tier available (may spin down after inactivity)

---

## Option 3: Fly.io

Fly.io offers generous free tier with global deployment.

### Steps:

1. **Install Fly CLI**
   ```bash
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login and Launch**
   ```bash
   fly auth login
   fly launch
   ```

3. **Create PostgreSQL Database**
   ```bash
   fly postgres create
   fly postgres attach <postgres-app-name>
   ```

4. **Set Secrets**
   ```bash
   fly secrets set SESSION_SECRET=your-random-secret
   fly secrets set NODE_ENV=production
   ```

5. **Update Prisma Schema**
   - Change to PostgreSQL provider
   - Run: `fly deploy`

### Cost: Free tier includes 3GB storage

---

## Option 4: DigitalOcean App Platform

Professional hosting with predictable pricing.

### Steps:

1. **Create Account at [DigitalOcean](https://digitalocean.com)**

2. **Create App**
   - Apps → "Create App"
   - Connect GitHub repository
   - Choose Node.js

3. **Add Database**
   - Add Component → "Database"
   - Choose PostgreSQL Dev (Free)

4. **Configure Build**
   - Build Command: `npm install && npx prisma generate`
   - Run Command: `npx prisma migrate deploy && node server.js`

5. **Set Environment Variables**
   - Add `SESSION_SECRET` and `NODE_ENV`

6. **Deploy**

### Cost: Starts at $5/month

---

## Option 5: Docker + Your Own Server

If you have your own VPS (DigitalOcean Droplet, AWS EC2, etc.)

### Steps:

1. **Install Docker on your server**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```

2. **Clone repository**
   ```bash
   git clone <your-repo>
   cd kappa-tracker
   ```

3. **Create .env file**
   ```bash
   nano .env
   # Add your production values
   ```

4. **Update Prisma schema to PostgreSQL**

5. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

6. **Run migrations**
   ```bash
   docker-compose exec app npx prisma migrate deploy
   ```

7. **Set up Nginx reverse proxy** (optional but recommended)

### Cost: Depends on VPS provider ($5-20/month typically)

---

## Post-Deployment Checklist

After deploying to any platform:

- [ ] Update `DATABASE_URL` to PostgreSQL connection string
- [ ] Set strong `SESSION_SECRET`
- [ ] Run database migrations: `npx prisma migrate deploy`
- [ ] Test user registration
- [ ] Test quest tracking
- [ ] Test rankings page
- [ ] Set up custom domain (optional)
- [ ] Enable HTTPS (most platforms do this automatically)

---

## Switching from SQLite to PostgreSQL

### 1. Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"  // Changed from "sqlite"
  url      = env("DATABASE_URL")
}
```

### 2. Create migration:

```bash
npx prisma migrate dev --name switch_to_postgresql
```

### 3. Deploy migration:

```bash
npx prisma migrate deploy
```

---

## Monitoring & Maintenance

### Check Logs:
- **Railway:** Dashboard → Service → "Logs"
- **Render:** Dashboard → Service → "Logs"
- **Fly.io:** `fly logs`

### Database Management:
- **Railway:** Built-in database browser
- **Render:** Use any PostgreSQL client
- **Fly.io:** `fly postgres connect`

### Updating the App:
1. Push changes to GitHub
2. Most platforms auto-deploy on push
3. Verify deployment in logs

---

## Troubleshooting

### "Prisma Client not generated"
```bash
npx prisma generate
```

### Database connection errors
- Check `DATABASE_URL` is correct
- Ensure database is running
- Verify network connectivity

### Session issues
- Verify `SESSION_SECRET` is set
- Check if cookies are enabled
- For SQLite session store, ensure write permissions

---

## Cost Comparison

| Platform | Free Tier | Paid Plan | Best For |
|----------|-----------|-----------|----------|
| Railway | $5 credit/month | $5+ usage-based | Quick start |
| Render | Free (with limits) | $7+/month | Side projects |
| Fly.io | Generous free tier | Usage-based | Global apps |
| DigitalOcean | $0 (trial credit) | $5+/month | Production |
| Docker/VPS | Depends on VPS | $5-20/month | Full control |

---

## Need Help?

If you encounter issues:

1. Check the logs first
2. Verify environment variables
3. Test database connection
4. Review Prisma migrations
5. Check GitHub Issues

---

## Security Notes

**Important for Production:**

1. **Always use HTTPS** (enabled by default on most platforms)
2. **Set a strong SESSION_SECRET** (32+ random characters)
3. **Use environment variables** for sensitive data
4. **Regularly update dependencies**: `npm update`
5. **Enable rate limiting** (already configured in server.js)
6. **Regular backups** of your database

---

Made by [twitch.tv/mozula](https://twitch.tv/mozula)

