# Changelog

## Version 1.0.0 - Production Ready (October 2025)

### 🎉 Major Release - Ready for Distribution

This version is fully packaged and ready to share with friends. All features are complete, tested, and documented.

---

### ✨ New Features

#### Quest Data Management
- **Automated Update Script** (`scripts/update-quests.js`)
  - Fetches all quests from Tarkov.dev API
  - Scrapes quest objectives from EFT Wiki
  - Extracts required keys from wiki tables
  - Finds MS2000 Markers, Signal Jammers, WI-FI Cameras
  - Parses "Found in Raid" items from objectives
  - Comprehensive error handling and progress logging
  - Run with: `npm run update-quests`

#### Installation & Deployment
- **Windows Installer** (`install.bat`)
  - Automatic Node.js detection
  - One-click dependency installation
  - Prisma client generation
  - Database initialization
- **Start Script** (`start.bat`)
  - Quick server launch
  - Clear instructions for users

#### Documentation
- **Comprehensive README.md**
  - Feature overview
  - Installation guide
  - Usage instructions
  - OBS setup guide
  - Troubleshooting section
  - Technical details
- **Quick Setup Guide** (`SETUP-GUIDE.txt`)
  - Simple step-by-step instructions for non-technical users
- **Distribution Checklist** (`DISTRIBUTION-CHECKLIST.txt`)
  - Packaging instructions
  - Required files list
  - Platform-specific notes

### 🎨 UI/UX Improvements

#### Design Refinements
- Removed all animations (except slideshow) for better performance
- Made stats section more compact and inline
- Centered empty state messages
- Added footer with creator credits and Twitch link
- Improved overall responsiveness

#### Quest Management
- **Confirmation Dialog** for completing quests
  - Prevents accidental clicks
  - Shows quest name before confirming
  - Clean, accessible modal design

#### Stats Display
- Dynamic show/hide for stats with 0 count
- Inline layout for better space usage
- Removed "Quests on this map" stat (redundant)
- Improved visual hierarchy

### 🔧 Code Quality

#### Cleanup
- Removed unused theme toggle functionality
- Removed unused CSS variables (light theme)
- Removed placeholder content styles
- Eliminated dead code from script.js
- Cleaned up empty CSS sections

#### Organization
- Created `scripts/` folder for utilities
- Proper project structure
- Added `.gitignore` for version control
- Updated `package.json` with update script

### 📦 Package Contents

```
EFT-OBS-Kappa-Tracker/
├── 📄 Core Files
│   ├── index.html                    # Main dashboard
│   ├── collector-progress.html       # Progress overlay
│   ├── kappa-overview.html          # Quest overview
│   ├── obs-overlay.html             # OBS wrapper
│   ├── script.js                    # Application logic
│   ├── styles.css                   # Styles
│   └── server.js                    # Express server
│
├── 📁 Database
│   ├── prisma/schema.prisma         # Database schema
│   └── prisma/dev.db                # SQLite database (auto-generated)
│
├── 📁 Scripts
│   └── scripts/update-quests.js     # Quest update utility
│
├── 📁 Assets
│   └── imgs/                        # Boss images for slideshow
│
├── 🚀 Launch Scripts
│   ├── install.bat                  # Windows installer
│   └── start.bat                    # Server launcher
│
├── 📚 Documentation
│   ├── README.md                    # Full documentation
│   ├── SETUP-GUIDE.txt             # Quick setup
│   ├── DISTRIBUTION-CHECKLIST.txt  # Packaging guide
│   └── CHANGELOG.md                # This file
│
└── ⚙️ Configuration
    ├── package.json                 # Dependencies
    └── .gitignore                   # Git exclusions
```

### 🐛 Bug Fixes
- Fixed progress bar width issue
- Fixed stat items not hiding when count is 0
- Fixed loading messages not centered
- Fixed objectives list collapse animation
- Fixed quest card styling inconsistencies

### 🔄 Data Tracking

#### Items Tracked
- ✅ Quest objectives (scraped from wiki)
- ✅ Required keys (extracted from wikitables)
- ✅ MS2000 Markers (count and quest list)
- ✅ Signal Jammers (count and quest list)
- ✅ WI-FI Cameras (count and quest list)
- ✅ Found in Raid items (parsed from objectives)

#### Quest Information
- ✅ Name, trader, level requirement
- ✅ Experience reward
- ✅ Map location
- ✅ Prerequisites (quest chain)
- ✅ Unlocked quests
- ✅ Kappa requirement status
- ✅ Wiki links

### 📊 Statistics
- Total quests tracked: All EFT quests
- Kappa quests: ~200+ quests
- Database updates: Real-time
- OBS refresh: Automatic polling

### 🎯 Ready For
- ✅ Distribution to friends
- ✅ Streaming on Twitch/YouTube
- ✅ Game version 1.0 (Nov 15, 2025)
- ✅ Future quest updates
- ✅ Community sharing

---

## Previous Development

### Beta Phase (September-October 2025)
- Initial development
- Feature iterations based on user feedback
- UI/UX refinements
- Data scraping implementation
- OBS integration

### Alpha Phase
- Core quest tracking
- Database setup
- Basic UI
- Progress calculation

---

## Future Considerations

### Potential Features
- Export/Import progress between PCs
- Multiple profile support
- Quest completion statistics
- Time tracking per quest
- Custom overlay themes
- Quest notes/comments
- Achievement system

### Platform Support
- Mac installer script
- Linux installer script
- Docker container option

---

## Credits

**Developer:** [twitch.tv/mozula](https://twitch.tv/mozula)

**Data Sources:**
- [Tarkov.dev](https://tarkov.dev) - Quest API
- [EFT Wiki](https://escapefromtarkov.fandom.com) - Detailed quest info
- [tarkov.community](https://tarkov.community) - Design inspiration

**Special Thanks:**
- The Tarkov.dev team for the amazing API
- The wiki contributors for detailed quest information
- The Tarkov community for feedback and support

---

Made with ❤️ for the Tarkov community

