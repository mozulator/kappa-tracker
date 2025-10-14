# Running Kappa Tracker Locally with Production Data

## Prerequisites

- Docker Desktop for Windows installed and running
- Access to Render.com dashboard to get production DATABASE_URL

---

## Setup Steps

### 1. Start Local PostgreSQL

```bash
docker-compose -f docker-compose.local.yml up -d
```

This starts a local PostgreSQL 17 container matching your production version.

**Verify it's running:**
```bash
docker ps
```

You should see `kappa-local-db` in the list.

---

### 2. Get Production Database URL

1. Go to [Render.com Dashboard](https://dashboard.render.com/)
2. Click on your **kappa-db** database
3. Under "Connections" → copy the **External Database URL**
4. It looks like: `postgresql://username:password@dpg-xxxxx.oregon-postgres.render.com/kappa_db`

---

### 3. Dump Production Data

Replace `PRODUCTION_URL_HERE` with your actual database URL:

```powershell
docker run --rm postgres:17-alpine pg_dump "PRODUCTION_URL_HERE" > prod_backup.sql
```

**Example:**
```powershell
docker run --rm postgres:17-alpine pg_dump "postgresql://kappa_db_user:abc123@dpg-xxxxx.oregon-postgres.render.com/kappa_db" > prod_backup.sql
```

This creates a `prod_backup.sql` file with all your production data.

---

### 4. Import Data to Local Database

```powershell
Get-Content prod_backup.sql | docker exec -i kappa-local-db psql -U kappauser -d kappatracker
```

This imports all production data into your local PostgreSQL.

---

### 5. Create `.env` File

Create a `.env` file in your project root:

```env
DATABASE_URL="postgresql://kappauser:kappapass@localhost:5432/kappatracker"
SESSION_SECRET="local-dev-secret"
NODE_ENV="development"
```

**Note:** This file is gitignored and won't affect production deployments.

---

### 6. Generate Prisma Client & Run

```bash
npx prisma generate
npm start
```

---

### 7. Access Your App

Open your browser to: **http://localhost:3000**

You now have your local app running with production data! 🎉

---

## Troubleshooting

### Port 5432 Already in Use

**Fix:** Change the port in `docker-compose.local.yml`:
```yaml
ports:
  - "5433:5432"  # Use 5433 instead
```

**Update `.env`:**
```env
DATABASE_URL="postgresql://kappauser:kappapass@localhost:5433/kappatracker"
```

---

### Docker Not Found

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Restart your computer
3. Make sure Docker Desktop is running (check system tray)

---

### Version Mismatch Error

Make sure you're using `postgres:17-alpine` (matches production) not `postgres:15-alpine`.

---

### Permission Denied on Import

Run PowerShell as Administrator and retry the import command.

---

## Updating Local Data

To sync latest production data, repeat steps 3-4:

```powershell
# Dump latest production data
docker run --rm postgres:17-alpine pg_dump "PRODUCTION_URL_HERE" > prod_backup.sql

# Import to local
Get-Content prod_backup.sql | docker exec -i kappa-local-db psql -U kappauser -d kappatracker
```

---

## Important Notes

- ✅ `.env` file is gitignored - safe to use locally
- ✅ Production uses Render's DATABASE_URL - won't be affected
- ✅ Git pushes to `main` still auto-deploy to production
- ✅ Local changes don't affect production
- ⚠️ Remember to stop Docker when done: `docker-compose -f docker-compose.local.yml down`

---

## Stopping the Local Database

When you're done developing:

```bash
docker-compose -f docker-compose.local.yml down
```

This stops the PostgreSQL container but keeps your data. Next time you run `up -d`, your data will still be there.

**To completely remove everything (including data):**
```bash
docker-compose -f docker-compose.local.yml down -v
```
