# OBS Kappa Tracker - Multi-User Edition 🎮

A comprehensive Escape from Tarkov Kappa quest tracking application with **user accounts**, **public rankings**, and **social features**. Perfect for streamers and the EFT community! Optimized for OBS integration.

## 🆕 New Features

### User System
- ✅ **User Registration & Login** - Secure authentication
- ✅ **Personal Profiles** - Customize your profile with bio and social links
- ✅ **Privacy Controls** - Choose to show/hide your progress publicly

### Rankings & Competition
- ✅ **Global Leaderboard** - See top Kappa hunters worldwide
- ✅ **Map-Specific Rankings** - Compare progress on individual maps
- ✅ **Activity Feed** - Watch recent quest completions in real-time
- ✅ **Global Statistics** - View community-wide stats

### Original Features (Still Included!)
- ✅ Track all Kappa-required quests
- ✅ Filter quests by map
- ✅ View quest objectives, required items, keys
- ✅ Mark quests as complete/incomplete
- ✅ Track PMC level requirements
- ✅ View quest prerequisites
- ✅ OBS overlay integration

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### Installation

1. **Clone or download the repository**
   ```bash
   git clone <your-repo-url>
   cd obs-kappa-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate Prisma client**
   ```bash
   npx prisma generate
   ```

4. **Run database migrations**
   ```bash
   npx prisma migrate dev
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open your browser**
   - Navigate to `http://localhost:3000`
   - Register a new account
   - Start tracking!

## 📖 Usage Guide

### First Time Setup

1. **Register an Account**
   - Visit `http://localhost:3000`
   - Click "Create Account"
   - Fill in your email, username, and password
   - You'll be automatically logged in

2. **Set Up Your Profile**
   - Click "Profile" in the header
   - Add display name, bio, Twitch URL
   - Choose privacy settings
   - Save changes

3. **Start Tracking**
   - Go to "Dashboard"
   - Set your PMC level
   - Browse quests by map
   - Mark quests as complete

### Using Rankings

1. **View Global Rankings**
   - Click "Rankings" in header
   - See top players by completion rate
   - View recent activity feed
   - Check global statistics

2. **Privacy Settings**
   - Go to your Profile
   - Toggle "Show my profile on public leaderboards"
   - Save to update visibility

### OBS Integration

Your OBS overlays work the same way as before!

#### Collector Progress Overlay
1. Add a **Browser Source** in OBS
2. URL: `http://localhost:3000/collector-progress.html`
3. Width: 1920, Height: 1080
4. Your progress updates automatically

#### Kappa Overview
1. Add a **Browser Source** in OBS
2. URL: `http://localhost:3000/kappa-overview.html`
3. Adjust size as needed
4. Shows current quests by map

## 🛠️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (SQLite for local, PostgreSQL for production)
DATABASE_URL="file:./prisma/dev.db"

# Session Secret (CHANGE IN PRODUCTION!)
SESSION_SECRET="your-random-secret-here"
```

### Changing the Port

Edit `.env` file:
```env
PORT=5000
```

Or use environment variable:
```bash
PORT=5000 npm start
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `GET /api/auth/status` - Check auth status

### User Management
- `GET /api/users/:username` - Get user profile
- `PUT /api/users/:username` - Update profile (own only)

### Quest Management
- `GET /api/quests` - Get all quests
- `POST /api/refresh-quests` - Refresh quest data

### Progress Tracking
- `GET /api/progress` - Get user progress
- `POST /api/progress` - Update progress
- `POST /api/reset-progress` - Reset progress

### Rankings
- `GET /api/rankings` - Get global leaderboard
- `GET /api/rankings/map/:mapName` - Map-specific rankings
- `GET /api/stats/global` - Global statistics

## 🚢 Deployment

Ready to deploy online? Check out [DEPLOYMENT.md](DEPLOYMENT.md) for detailed guides on:

- **Railway** - Free tier, easiest setup
- **Render** - Free tier with PostgreSQL
- **Fly.io** - Global edge deployment
- **DigitalOcean** - Professional hosting
- **Docker** - Self-hosted option

### Quick Deploy to Railway

1. Push code to GitHub
2. Go to [Railway.app](https://railway.app)
3. "New Project" → "Deploy from GitHub"
4. Add PostgreSQL database
5. Set `SESSION_SECRET` environment variable
6. Deploy! 🎉

## 🔄 Migrating from Single-User Version

If you're upgrading from the original single-user version, see [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) for:

- Migration steps
- Data preservation options
- Troubleshooting
- Reverting if needed

## 🔧 Development

### Project Structure

```
obs-kappa-tracker/
├── server.js              # Express server with auth
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── dev.db            # SQLite database (local)
├── login.html            # Authentication pages
├── register.html
├── rankings.html         # Public rankings
├── profile.html          # User profile
├── index.html            # Main dashboard
├── script.js             # Frontend logic
├── styles.css            # Styling
└── scripts/
    └── update-quests.js  # Quest data updater
```

### Database Schema

**Users**
- Authentication credentials
- Profile information
- Privacy settings
- Social links (Twitch, Discord)

**UserProgress**
- PMC level
- Completed quests (JSON array)
- Completion stats
- Last activity date

**Quests** (unchanged)
- Quest details from Tarkov.dev API
- Required items
- Prerequisites
- Map locations

**QuestActivity**
- Activity history
- Quest completions/uncompletions
- Timestamps for feed

### Adding New Features

The codebase is modular and easy to extend:

1. **Add API route** in `server.js`
2. **Update database** in `prisma/schema.prisma`
3. **Create migration**: `npx prisma migrate dev`
4. **Add frontend** in HTML/JS files
5. **Style** in `styles.css`

### Running Tests

```bash
# Install quest data
npm run update-quests

# Start development server
npm run dev
```

## 🐛 Troubleshooting

### "Prisma Client not generated"
```bash
npx prisma generate
```

### Database migration errors
```bash
npx prisma migrate reset
npx prisma migrate dev
```

### Port already in use
```bash
# Change port in .env
PORT=5000
```

### Session issues
```bash
# Delete session database
del prisma\sessions.db  # Windows
rm prisma/sessions.db   # Linux/Mac
```

### Can't register/login
- Check database exists: `prisma/dev.db`
- Verify Prisma client generated
- Check console for errors
- Try incognito/private browsing

## 📈 Performance Tips

### For Production

1. **Use PostgreSQL** instead of SQLite
2. **Enable rate limiting** (already configured)
3. **Set strong SESSION_SECRET**
4. **Use HTTPS** (auto on most platforms)
5. **Enable gzip compression**
6. **Set up caching** for rankings

### For Heavy Traffic

Consider:
- Redis for session storage
- Database indexing (already set up)
- CDN for static assets
- Load balancing
- Database connection pooling

## 🔒 Security

This application includes:

- ✅ Password hashing (bcrypt)
- ✅ Rate limiting
- ✅ Session management
- ✅ SQL injection protection (Prisma)
- ✅ XSS protection
- ✅ CSRF token support (via same-origin)

**For Production:**
- Use HTTPS
- Set strong SESSION_SECRET
- Keep dependencies updated
- Regular database backups
- Monitor logs

## 🤝 Contributing

Want to improve the tracker?

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

### Ideas for Contributions

- Export/import progress
- Quest completion notifications
- Twitch extension
- Mobile responsive improvements
- Dark/light theme toggle
- Quest completion predictions
- Friend system
- Guild/team tracking

## 📝 License

Free to use and modify. If you share or distribute this, please keep the credits intact.

## 💬 Support & Community

- **Creator:** [twitch.tv/mozula](https://twitch.tv/mozula)
- **Data Sources:** [Tarkov.dev](https://tarkov.dev), [EFT Wiki](https://escapefromtarkov.fandom.com)

## 🎯 Roadmap

### Planned Features
- [ ] Export/Import progress
- [ ] Email notifications
- [ ] Friend system
- [ ] Quest completion times
- [ ] Achievement badges
- [ ] Mobile app
- [ ] Twitch extension
- [ ] Discord bot integration

### Community Requests
Submit your ideas via GitHub Issues!

## ⚡ Quick Commands

```bash
# Install
npm install

# Setup database
npx prisma generate
npx prisma migrate dev

# Start server
npm start

# Update quests
npm run update-quests

# Reset database
npx prisma migrate reset

# Production build
NODE_ENV=production npm start
```

## 📞 Getting Help

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment issues
2. Review [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) for migration help
3. Search existing GitHub issues
4. Create new issue with details

---

## 🏆 Credits

**Made with ❤️ by [twitch.tv/mozula](https://twitch.tv/mozula)**

### Data Sources
- Quest data: [Tarkov.dev API](https://tarkov.dev)
- Quest details: [Official EFT Wiki](https://escapefromtarkov.fandom.com)
- Design inspiration: [tarkov.community](https://tarkov.community)

### Tech Stack
- **Backend:** Node.js, Express
- **Database:** Prisma ORM (SQLite/PostgreSQL)
- **Auth:** Passport.js, bcrypt
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Font:** Bender (Tarkov official font)

---

**Special thanks to the EFT community for inspiration and feedback!**

Enjoy tracking your Kappa progress! 🎮✨

