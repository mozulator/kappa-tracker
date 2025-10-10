# Migration Guide: Single-User to Multi-User

This guide helps you migrate from the original single-user local version to the new multi-user online version.

## What Changed

### New Features ✨
- **User Authentication** - Login/register system
- **User Profiles** - Customizable profiles with social links
- **Public Rankings** - Global leaderboard
- **Activity Feed** - See recent quest completions
- **Multi-user Support** - Each user has their own progress

### Breaking Changes ⚠️

1. **Database Schema** - New user tables and relationships
2. **API Changes** - Now requires authentication
3. **Session Management** - Uses express-session
4. **No Backward Compatibility** - Old database won't work directly

## Migration Steps

### Option 1: Fresh Start (Recommended)

If you haven't made significant progress or want a clean slate:

1. **Backup your old database** (optional)
   ```bash
   copy prisma\dev.db prisma\dev.db.backup
   ```

2. **Install new dependencies**
   ```bash
   npm install
   ```

3. **Generate new Prisma client**
   ```bash
   npx prisma generate
   ```

4. **Run database migrations**
   ```bash
   npx prisma migrate dev --name init_multiuser
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Register a new account** at `http://localhost:3000`

7. **Re-enter your progress** (if needed)

### Option 2: Migrate Existing Data

If you want to preserve your quest progress:

1. **Backup everything first!**
   ```bash
   copy prisma\dev.db prisma\dev.db.backup
   ```

2. **Install new dependencies**
   ```bash
   npm install
   ```

3. **Create migration SQL file**
   
   Create `prisma/migrations/manual_migration.sql`:

   ```sql
   -- Create users table
   CREATE TABLE "users" (
       "id" TEXT NOT NULL PRIMARY KEY,
       "email" TEXT NOT NULL,
       "username" TEXT NOT NULL,
       "displayName" TEXT,
       "passwordHash" TEXT NOT NULL,
       "isPublic" INTEGER NOT NULL DEFAULT 1,
       "bio" TEXT,
       "twitchUrl" TEXT,
       "discordTag" TEXT,
       "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" DATETIME NOT NULL
   );

   -- Create quest_activities table
   CREATE TABLE "quest_activities" (
       "id" TEXT NOT NULL PRIMARY KEY,
       "userId" TEXT NOT NULL,
       "questId" TEXT NOT NULL,
       "questName" TEXT NOT NULL,
       "action" TEXT NOT NULL,
       "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "quest_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
   );

   -- Create indexes
   CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
   CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
   CREATE INDEX "quest_activities_userId_idx" ON "quest_activities"("userId");
   CREATE INDEX "quest_activities_timestamp_idx" ON "quest_activities"("timestamp");

   -- Create a default user (you'll need to register normally)
   -- This just creates the structure

   -- Alter user_progress table
   ALTER TABLE "user_progress" ADD COLUMN "userId" TEXT;
   ALTER TABLE "user_progress" ADD COLUMN "completionRate" REAL NOT NULL DEFAULT 0;
   ALTER TABLE "user_progress" ADD COLUMN "totalCompleted" INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE "user_progress" ADD COLUMN "lastQuestDate" DATETIME;

   -- Note: You'll need to link your existing progress to a user account after registering
   ```

4. **Apply migration**
   ```bash
   sqlite3 prisma/dev.db < prisma/migrations/manual_migration.sql
   ```

5. **Generate Prisma client**
   ```bash
   npx prisma generate
   ```

6. **Start server and register**
   - Start: `npm start`
   - Register at `http://localhost:3000/register`

7. **Link old progress to new account**
   
   You'll need to manually update the database to link your old progress to your new user ID.
   
   This is complex and may require SQL knowledge. **Fresh start is easier!**

## Updating Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="your-random-secret-change-this"
```

### Session Storage

The new version uses `connect-sqlite3` for session storage. No configuration needed for local development.

## New File Structure

```
kappa-tracker/
├── prisma/
│   ├── schema.prisma       # Updated with new tables
│   ├── dev.db              # SQLite database
│   └── sessions.db         # Session storage (new)
├── login.html              # NEW - Login page
├── register.html           # NEW - Registration page
├── rankings.html           # NEW - Public rankings
├── profile.html            # NEW - User profile
├── index.html              # UPDATED - Now requires auth
├── server.js               # COMPLETELY REWRITTEN
├── script.js               # UPDATED - Added auth checks
├── styles.css              # UPDATED - New user info styles
├── .env                    # NEW - Configuration
├── .gitignore              # NEW - Git ignore rules
├── Dockerfile              # NEW - Docker support
├── docker-compose.yml      # NEW - Docker Compose
├── DEPLOYMENT.md           # NEW - Deployment guide
└── MIGRATION-GUIDE.md      # This file
```

## Testing the Migration

After migration, test these features:

- [ ] Register a new account
- [ ] Login with credentials
- [ ] Track quest progress
- [ ] View rankings page
- [ ] Edit profile settings
- [ ] Test privacy settings
- [ ] Logout and login again
- [ ] OBS overlays still work

## Troubleshooting

### "Prisma Client not generated"
```bash
npx prisma generate
```

### Database errors
```bash
# Delete database and start fresh
del prisma\dev.db
del prisma\sessions.db
npx prisma migrate dev
```

### Can't login after migration
- Make sure you registered a new account
- Old auth system doesn't exist, you need to create new credentials

### Session issues
- Delete `prisma/sessions.db` and restart
- Clear browser cookies for localhost

### Port already in use
- Change PORT in `.env` file
- Kill any running node processes

## Reverting to Old Version

If you want to go back to the single-user version:

1. **Restore backup**
   ```bash
   copy prisma\dev.db.backup prisma\dev.db
   ```

2. **Checkout old code**
   ```bash
   git checkout <old-commit-hash>
   ```

3. **Reinstall old dependencies**
   ```bash
   npm install
   ```

## Questions?

- Check DEPLOYMENT.md for production deployment
- Review README.md for new features
- See server.js for API documentation

The new system is more powerful but requires initial setup. Take your time and test thoroughly!

---

Made by [twitch.tv/mozula](https://twitch.tv/mozula)

