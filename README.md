# EFT OBS Kappa Tracker

A comprehensive Escape from Tarkov Kappa quest tracking application designed for streamers using OBS. Track your progress towards the Kappa container with a clean, Tarkov-themed interface that can be displayed on stream.

## Features

### Quest Tracking
- ✅ Track all Kappa-required quests
- ✅ Filter quests by map
- ✅ View quest objectives, required items, keys, and more
- ✅ Mark quests as complete/incomplete
- ✅ Track PMC level requirements
- ✅ View quest prerequisites and unlocked quests

### Required Items Tracking
- 🔑 **Keys** - Track all required keys per quest
- 📍 **MS2000 Markers** - Count markers needed
- 📡 **Signal Jammers** - Count jammers needed
- 📷 **WI-FI Cameras** - Count cameras needed
- 🔍 **Found in Raid Items** - Track FIR item requirements

### OBS Integration
- **Collector Progress Overlay** - Display your overall Kappa progress on stream
- **Kappa Overview** - Show current available quests organized by map
- Both overlays update in real-time as you complete quests

### Interface
- 🎨 Tarkov-themed dark design inspired by tarkov.community
- 📱 Responsive layout for different screen sizes
- ⚡ Fast, local database (SQLite via Prisma)
- 🔄 Real-time updates without page refresh

## Installation

### Quick Install (Recommended)

1. **Extract the files** to a folder on your computer
2. **Run `install.bat`** - This will:
   - Check for Node.js installation
   - Install all dependencies
   - Set up the database
   - Initialize with quest data

### Manual Installation

If you prefer to install manually or the batch file doesn't work:

   ```bash
# 1. Install dependencies
   npm install

# 2. Generate Prisma client
npx prisma generate

# 3. Initialize database
npx prisma db push
```

## Usage

### Starting the Application

**Quick Start:**
- Run `start.bat` to launch the server

**Manual Start:**
   ```bash
npm start
```

The application will be available at `http://localhost:3000`

### Pages

1. **Dashboard** (`http://localhost:3000`)
   - Main quest tracking interface
   - Filter by map, view available/future quests
   - Complete/uncomplete quests
   - View detailed quest information

2. **Collector Progress** (`http://localhost:3000/collector-progress.html`)
   - Full-screen progress display
   - Shows completion percentage and quest counts
   - Background slideshow of boss images
   - Perfect for OBS overlay

3. **Kappa Overview** (`http://localhost:3000/kappa-overview.html`)
   - Minimal overview of current quests
   - Organized by map in columns
   - Shows progress per map
   - Ideal for stream overlay

### OBS Setup

#### Adding Collector Progress Overlay

1. In OBS, add a new **Browser Source**
2. Set URL to: `http://localhost:3000/obs-overlay.html`
3. Set Width: `1920` Height: `1080` (or your stream resolution)
4. Check ✅ "Shutdown source when not visible"
5. The overlay will update automatically when you complete quests

#### Adding Kappa Overview

1. In OBS, add a new **Browser Source**
2. Set URL to: `http://localhost:3000/kappa-overview.html`
3. Adjust size as needed for your layout
4. Position it where you want on your stream

## Updating Quest Data

### When to Update

Update quest data when:
- New quests are added to the game (e.g., major patches)
- Quest requirements change
- Kappa requirements are updated
- After game version 1.0 release (Nov 15, 2025)

### How to Update

**Quick Update:**
   ```bash
npm run update-quests
```

This script will:
1. Fetch all quests from Tarkov.dev API
2. Scrape detailed information from EFT Wiki:
   - Quest objectives
   - Required keys
   - Required markers, jammers, cameras
   - Found in Raid items
3. Update your local database

**Note:** The update process may take 5-10 minutes depending on the number of Kappa quests, as it scrapes data from the wiki for each one.

## Project Structure

```
EFT-OBS-Kappa-Tracker/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── dev.db                 # SQLite database
├── scripts/
│   └── update-quests.js       # Quest data update script
├── imgs/                      # Background images
├── index.html                 # Main dashboard
├── collector-progress.html    # Progress overlay
├── kappa-overview.html        # Quest overview overlay
├── obs-overlay.html          # OBS wrapper for collector progress
├── script.js                 # Main application logic
├── styles.css                # Application styles
├── server.js                 # Express server
├── install.bat               # Installation script (Windows)
├── start.bat                 # Start server script (Windows)
├── package.json              # Node.js dependencies
└── README.md                 # This file
```

## Technical Details

### Tech Stack
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Node.js, Express
- **Database:** SQLite with Prisma ORM
- **APIs:** Tarkov.dev GraphQL API
- **Web Scraping:** Axios, Cheerio

### Database Schema

The application uses a single `Quest` table with the following fields:
- Basic info: id, name, trader, level, experience
- Progress: wikiLink, requiredForKappa, mapName
- Relations: prerequisiteQuests (JSON array)
- Details: objectives (JSON array), requiredItems (JSON array)

### Data Scraping

The `update-quests.js` script performs the following:

1. **Fetches quests** from Tarkov.dev GraphQL API
2. **Scrapes wiki pages** for Kappa-required quests:
   - Finds `#Objectives` section for quest objectives
   - Searches wikitables for links ending in `_key`
   - Looks for MS2000_Marker, Signal_Jammer, WI-FI_Camera references
   - Extracts item counts from Amount columns
   - Parses objectives for "Find X in raid" patterns
3. **Updates database** with upsert operations

## Troubleshooting

### Server won't start
- Make sure Node.js is installed: `node --version`
- Try reinstalling: run `install.bat` again
- Check if port 3000 is available

### OBS not showing updates
- Make sure the server is running
- Refresh the browser source in OBS
- Check the browser source URL is correct

### Database errors
- Delete `prisma/dev.db` and run `install.bat` again
- Run `npx prisma generate` then `npx prisma db push`

### Quest data is outdated
- Run `npm run update-quests` to fetch latest data
- This may take several minutes

### "Prisma Client not generated" error
- Run: `npx prisma generate`
- If Node.js processes are running, close them first (Ctrl+C in terminal)

## Credits

**Made by [twitch.tv/mozula](https://twitch.tv/mozula)** - Feel free to drop a follow!

### Data Sources
- Quest data: [Tarkov.dev](https://tarkov.dev)
- Quest details: [Official EFT Wiki](https://escapefromtarkov.fandom.com)
- Design inspiration: [tarkov.community](https://tarkov.community)

### Font
- Bender font (Tarkov official font)

## License

Free to use and modify. If you share or distribute this, please keep the credits intact.

## Future Plans

- [ ] Export/Import progress
- [ ] Multiple profile support
- [ ] Quest completion statistics
- [ ] Time tracking per quest
- [ ] Custom overlay themes

## Support

If you encounter any issues or have suggestions:
1. Check the Troubleshooting section above
2. Make sure you're running the latest version
3. Try updating quest data with `npm run update-quests`

## Changelog

### Version 1.0.0 (October 2025)
- Initial release
- Full Kappa quest tracking
- OBS overlay support
- Comprehensive data scraping
- Windows installation scripts
