const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

const app = express();
let prisma;
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'kappa-tracker-secret-change-in-production';

// Trust proxy for Render (required for rate limiting)
app.set('trust proxy', 1);

// Initialize Prisma with error handling
try {
    prisma = new PrismaClient();
    console.log('Prisma client initialized successfully');
} catch (error) {
    console.error('Failed to initialize Prisma client:', error);
    process.exit(1);
}

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
const sessionConfig = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
};

// Use SQLite store for development, memory store for production
if (process.env.NODE_ENV === 'production') {
    // Production: use memory store (sessions will reset on restart)
    app.use(session(sessionConfig));
} else {
    // Development: use SQLite store
    sessionConfig.store = new SQLiteStore({ db: 'sessions.db', dir: './prisma' });
    app.use(session(sessionConfig));
}

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const user = await prisma.user.findUnique({
                where: { username: username.toLowerCase() }
            });

            if (!user) {
                return done(null, false, { message: 'Incorrect username or password.' });
            }

            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (!isValid) {
                return done(null, false, { message: 'Incorrect username or password.' });
            }

            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                isPublic: true,
                bio: true,
                twitchUrl: true,
                discordTag: true,
                createdAt: true
            }
        });
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Too many attempts, please try again later.'
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100
});

// Static files
app.use(express.static('.'));

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function optionalAuth(req, res, next) {
    // Continue regardless of auth status
    next();
}

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { email, username, password, displayName } = req.body;

        // Validation
        if (!email || !username || !password) {
            return res.status(400).json({ error: 'Email, username, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email.toLowerCase() },
                    { username: username.toLowerCase() }
                ]
            }
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({ error: 'Email already registered' });
            } else {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user and progress
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                username: username.toLowerCase(),
                displayName: displayName || username,
                passwordHash,
                progress: {
                    create: {
                        pmcLevel: 1,
                        completedQuests: JSON.stringify([]),
                        completionRate: 0,
                        totalCompleted: 0
                    }
                }
            },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                createdAt: true
            }
        });

        // Auto login
        req.login(user, (err) => {
            if (err) {
                console.error('Auto-login failed after registration:', err);
                return res.status(500).json({ error: 'Registration successful but login failed' });
            }
            console.log('User auto-logged in after registration:', user.username);
            res.json({
                message: 'Registration successful',
                user
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', authLimiter, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return res.status(500).json({ error: 'Authentication error' });
        }
        if (!user) {
            return res.status(401).json({ error: info.message || 'Login failed' });
        }
        req.login(user, (err) => {
            if (err) {
                return res.status(500).json({ error: 'Login failed' });
            }
            res.json({
                message: 'Login successful',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    displayName: user.displayName
                }
            });
        });
    })(req, res, next);
});

app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logout successful' });
    });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        user: req.user
    });
});

app.get('/api/auth/status', (req, res) => {
    res.json({
        authenticated: req.isAuthenticated(),
        user: req.user || null
    });
});

// ============================================================================
// USER PROFILE ROUTES
// ============================================================================

app.get('/api/users/:username', optionalAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase() },
            select: {
                id: true,
                username: true,
                displayName: true,
                bio: true,
                twitchUrl: true,
                discordTag: true,
                isPublic: true,
                createdAt: true,
                progress: {
                    select: {
                        pmcLevel: true,
                        completionRate: true,
                        totalCompleted: true,
                        lastQuestDate: true,
                        completedQuests: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user wants their profile public
        const isOwnProfile = req.user && req.user.id === user.id;
        if (!user.isPublic && !isOwnProfile) {
            return res.status(403).json({ error: 'Profile is private' });
        }

        // Parse completed quests for own profile
        if (isOwnProfile && user.progress) {
            user.progress.completedQuests = JSON.parse(user.progress.completedQuests || '[]');
        } else {
            // Don't send detailed quest list for other users
            delete user.progress?.completedQuests;
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

app.put('/api/users/:username', requireAuth, async (req, res) => {
    try {
        const { username } = req.params;

        // Only allow users to update their own profile
        if (req.user.username !== username.toLowerCase()) {
            return res.status(403).json({ error: 'Cannot update another user\'s profile' });
        }

        const { displayName, bio, twitchUrl, discordTag, isPublic } = req.body;

        const updatedUser = await prisma.user.update({
            where: { username: username.toLowerCase() },
            data: {
                ...(displayName !== undefined && { displayName }),
                ...(bio !== undefined && { bio }),
                ...(twitchUrl !== undefined && { twitchUrl }),
                ...(discordTag !== undefined && { discordTag }),
                ...(isPublic !== undefined && { isPublic })
            },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                bio: true,
                twitchUrl: true,
                discordTag: true,
                isPublic: true
            }
        });

        res.json(updatedUser);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ============================================================================
// QUEST ROUTES
// ============================================================================

app.get('/api/quests', apiLimiter, async (req, res) => {
    try {
        const quests = await prisma.quest.findMany({
            orderBy: [
                { trader: 'asc' },
                { level: 'asc' },
                { name: 'asc' }
            ]
        });
        res.json(quests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/refresh-quests', requireAuth, async (req, res) => {
    try {
        await initializeQuests(true);
        res.json({ message: 'Quests refreshed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// PROGRESS ROUTES
// ============================================================================

app.get('/api/progress', requireAuth, async (req, res) => {
    try {
        let progress = await prisma.userProgress.findUnique({
            where: { userId: req.user.id }
        });

        if (!progress) {
            progress = await prisma.userProgress.create({
                data: {
                    userId: req.user.id,
                    pmcLevel: 1,
                    completedQuests: JSON.stringify([]),
                    completionRate: 0,
                    totalCompleted: 0
                }
            });
        }

        progress.completedQuests = JSON.parse(progress.completedQuests || '[]');
        res.json(progress);
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/progress', requireAuth, async (req, res) => {
    try {
        const { pmcLevel, completedQuests } = req.body;

        // Calculate stats
        const allQuests = await prisma.quest.findMany({
            where: { requiredForKappa: true }
        });
        const totalKappaQuests = allQuests.length;
        const completedCount = completedQuests ? completedQuests.length : 0;
        const completionRate = totalKappaQuests > 0 ? (completedCount / totalKappaQuests) * 100 : 0;

        let progress = await prisma.userProgress.findUnique({
            where: { userId: req.user.id }
        });

        // Track quest activities
        if (progress) {
            const oldCompleted = JSON.parse(progress.completedQuests || '[]');
            const newCompleted = completedQuests || [];

            // Find newly completed quests
            const added = newCompleted.filter(id => !oldCompleted.includes(id));
            const removed = oldCompleted.filter(id => !newCompleted.includes(id));

            // Create activity records
            for (const questId of added) {
                const quest = allQuests.find(q => q.id === questId);
                if (quest) {
                    await prisma.questActivity.create({
                        data: {
                            userId: req.user.id,
                            questId,
                            questName: quest.name,
                            action: 'completed'
                        }
                    });
                }
            }

            for (const questId of removed) {
                const quest = allQuests.find(q => q.id === questId);
                if (quest) {
                    await prisma.questActivity.create({
                        data: {
                            userId: req.user.id,
                            questId,
                            questName: quest.name,
                            action: 'uncompleted'
                        }
                    });
                }
            }
        }

        if (!progress) {
            progress = await prisma.userProgress.create({
                data: {
                    userId: req.user.id,
                    pmcLevel: pmcLevel || 1,
                    completedQuests: JSON.stringify(completedQuests || []),
                    completionRate,
                    totalCompleted: completedCount,
                    lastQuestDate: completedCount > 0 ? new Date() : null
                }
            });
        } else {
            progress = await prisma.userProgress.update({
                where: { userId: req.user.id },
                data: {
                    pmcLevel: pmcLevel !== undefined ? pmcLevel : progress.pmcLevel,
                    completedQuests: JSON.stringify(completedQuests || []),
                    completionRate,
                    totalCompleted: completedCount,
                    lastQuestDate: completedCount > 0 ? new Date() : progress.lastQuestDate
                }
            });
        }

        progress.completedQuests = JSON.parse(progress.completedQuests);
        res.json(progress);
    } catch (error) {
        console.error('Error saving progress:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reset-progress', requireAuth, async (req, res) => {
    try {
        const progress = await prisma.userProgress.update({
            where: { userId: req.user.id },
            data: {
                pmcLevel: 1,
                completedQuests: JSON.stringify([]),
                completionRate: 0,
                totalCompleted: 0,
                lastQuestDate: null
            }
        });

        res.json({
            message: 'Progress reset successfully',
            progress
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// RANKINGS ROUTES
// ============================================================================

app.get('/api/rankings', apiLimiter, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const rankings = await prisma.user.findMany({
            where: {
                isPublic: true,
                progress: {
                    totalCompleted: {
                        gt: 0
                    }
                }
            },
            select: {
                username: true,
                displayName: true,
                twitchUrl: true,
                progress: {
                    select: {
                        pmcLevel: true,
                        completionRate: true,
                        totalCompleted: true,
                        lastQuestDate: true
                    }
                }
            },
            orderBy: {
                progress: {
                    completionRate: 'desc'
                }
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        // Get total count
        const total = await prisma.user.count({
            where: {
                isPublic: true,
                progress: {
                    totalCompleted: {
                        gt: 0
                    }
                }
            }
        });

        res.json({
            rankings,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching rankings:', error);
        res.status(500).json({ error: 'Failed to fetch rankings' });
    }
});

app.get('/api/rankings/map/:mapName', apiLimiter, async (req, res) => {
    try {
        const { mapName } = req.params;
        const { limit = 50 } = req.query;

        // Get quests for this map
        const mapQuests = await prisma.quest.findMany({
            where: {
                requiredForKappa: true,
                mapName: mapName
            },
            select: { id: true }
        });

        const mapQuestIds = mapQuests.map(q => q.id);

        // Get all users and calculate their map completion
        const users = await prisma.user.findMany({
            where: {
                isPublic: true,
                progress: {
                    totalCompleted: {
                        gt: 0
                    }
                }
            },
            select: {
                username: true,
                displayName: true,
                progress: {
                    select: {
                        completedQuests: true,
                        pmcLevel: true
                    }
                }
            }
        });

        // Calculate map-specific completion
        const rankings = users.map(user => {
            const completed = JSON.parse(user.progress.completedQuests || '[]');
            const mapCompleted = completed.filter(id => mapQuestIds.includes(id));
            const mapCompletionRate = mapQuestIds.length > 0
                ? (mapCompleted.length / mapQuestIds.length) * 100
                : 0;

            return {
                username: user.username,
                displayName: user.displayName,
                pmcLevel: user.progress.pmcLevel,
                mapCompleted: mapCompleted.length,
                mapTotal: mapQuestIds.length,
                mapCompletionRate
            };
        })
        .filter(u => u.mapCompleted > 0)
        .sort((a, b) => b.mapCompletionRate - a.mapCompletionRate)
        .slice(0, parseInt(limit));

        res.json({
            mapName,
            rankings
        });
    } catch (error) {
        console.error('Error fetching map rankings:', error);
        res.status(500).json({ error: 'Failed to fetch map rankings' });
    }
});

app.get('/api/stats/global', apiLimiter, async (req, res) => {
    try {
        const totalUsers = await prisma.user.count();
        const activeUsers = await prisma.user.count({
            where: {
                progress: {
                    totalCompleted: {
                        gt: 0
                    }
                }
            }
        });

        const allProgress = await prisma.userProgress.findMany({
            select: {
                completionRate: true,
                totalCompleted: true
            }
        });

        const avgCompletion = allProgress.length > 0
            ? allProgress.reduce((sum, p) => sum + p.completionRate, 0) / allProgress.length
            : 0;

        const totalQuestsCompleted = allProgress.reduce((sum, p) => sum + p.totalCompleted, 0);

        // Get recent activities
        const recentActivities = await prisma.questActivity.findMany({
            where: {
                action: 'completed'
            },
            orderBy: {
                timestamp: 'desc'
            },
            take: 20,
            select: {
                questName: true,
                timestamp: true,
                user: {
                    select: {
                        username: true,
                        displayName: true
                    }
                }
            }
        });

        res.json({
            totalUsers,
            activeUsers,
            avgCompletion: Math.round(avgCompletion * 10) / 10,
            totalQuestsCompleted,
            recentActivities
        });
    } catch (error) {
        console.error('Error fetching global stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================================================
// QUEST INITIALIZATION (from original server.js)
// ============================================================================

// Fetch quests from Tarkov.dev API
async function fetchTarkovQuests() {
    const query = `
        query {
            tasks {
                id
                name
                trader {
                    name
                }
                minPlayerLevel
                wikiLink
                kappaRequired
                map {
                    name
                }
                taskRequirements {
                    task {
                        id
                        name
                    }
                }
                objectives {
                    id
                    type
                    description
                    ... on TaskObjectiveItem {
                        item {
                            name
                        }
                        count
                    }
                }
            }
        }
    `;

    try {
        const response = await fetch('https://api.tarkov.dev/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });

        const data = await response.json();
        return data.data.tasks;
    } catch (error) {
        console.error('Error fetching quests:', error);
        return [];
    }
}

// Normalize map names to avoid duplicates
function normalizeMapName(mapName) {
    if (!mapName) return 'General';
    
    const normalizedName = mapName.trim();
    
    if (normalizedName.toLowerCase().includes('factory')) {
        return 'Factory';
    }
    
    const mapNormalizations = {
        'night factory': 'Factory',
        'factory day': 'Factory',
        'factory night': 'Factory',
        'the lab': 'The Lab',
        'lab': 'The Lab',
        'laboratory': 'The Lab',
        'ground zero': 'Ground Zero',
        'streets of tarkov': 'Streets of Tarkov',
        'lighthouse': 'Lighthouse',
        'shoreline': 'Shoreline',
        'customs': 'Customs',
        'woods': 'Woods',
        'reserve': 'Reserve',
        'interchange': 'Interchange'
    };
    
    const lowerName = normalizedName.toLowerCase();
    for (const [variant, canonical] of Object.entries(mapNormalizations)) {
        if (lowerName === variant) {
            return canonical;
        }
    }
    
    return normalizedName;
}

// Extract map name from quest data
function extractMapFromQuest(task) {
    const questName = (task.name || '').toLowerCase();
    const objectives = task.objectives || [];
    
    const multiMapQuests = [
        'a shooter born in heaven',
        'shooter born in heaven',
        'general wares',
        'peacekeeping mission'
    ];
    
    for (const multiMapQuest of multiMapQuests) {
        if (questName.includes(multiMapQuest)) {
            return null;
        }
    }
    
    const mapKeywords = {
        'customs': ['customs', 'dorms', 'gas station', 'big red', 'construction'],
        'woods': ['woods', 'sawmill', 'lumber mill', 'scav house'],
        'shoreline': ['shoreline', 'resort', 'health resort', 'pier', 'villa'],
        'interchange': ['interchange', 'mall', 'kiba', 'techlight', 'ultra'],
        'reserve': ['reserve', 'bunker', 'hermetic', 'marked room'],
        'factory': ['factory'],
        'the lab': ['laboratory', 'terragroup labs'],
        'lighthouse': ['lighthouse', 'water treatment', 'rogue'],
        'streets of tarkov': ['streets', 'concordia'],
        'ground zero': ['ground zero', 'tarcone', 'terragroup complex']
    };
    
    for (const [mapName, keywords] of Object.entries(mapKeywords)) {
        for (const keyword of keywords) {
            if (questName.includes(keyword)) {
                return mapName;
            }
        }
    }
    
    for (const objective of objectives) {
        const objDesc = (objective.description || '').toLowerCase();
        
        if (objDesc.includes('excluding') || objDesc.includes('except')) {
            continue;
        }
        
        for (const [mapName, keywords] of Object.entries(mapKeywords)) {
            for (const keyword of keywords) {
                if (objDesc.includes(keyword)) {
                    return mapName;
                }
            }
        }
    }
    
    return null;
}

// Extract required items from quest objectives
function extractRequiredItems(objectives) {
    const itemsMap = new Map();
    
    for (const objective of objectives) {
        const objectiveType = objective.type;
        
        if (objective.item && objective.count) {
            const itemName = objective.item.name;
            
            if (objectiveType === 'findItem') {
                continue;
            }
            
            let category = 'fir';
            if (itemName.toLowerCase().includes('marker') || itemName.toLowerCase().includes('ms2000')) {
                category = 'markers';
            } else if (itemName.toLowerCase().includes('jammer') || itemName.toLowerCase().includes('sj1')) {
                category = 'jammers';
            } else if ((itemName.toLowerCase().includes('keycard') || itemName.toLowerCase().includes('key') || 
                       itemName.toLowerCase().includes('access')) && 
                       !itemName.toLowerCase().includes('graphics card')) {
                category = 'keys';
            }
            
            if (itemsMap.has(itemName)) {
                const existingItem = itemsMap.get(itemName);
                existingItem.count = Math.max(existingItem.count, objective.count);
            } else {
                itemsMap.set(itemName, {
                    name: itemName,
                    count: objective.count,
                    category: category,
                    type: objectiveType
                });
            }
        } else if (objectiveType === 'mark' && objective.description) {
            const description = objective.description.toLowerCase();
            
            if (description.includes('ms2000 marker') || description.includes('marker')) {
                const itemName = 'MS2000 Marker';
                const category = 'markers';
                
                if (itemsMap.has(itemName)) {
                    const existingItem = itemsMap.get(itemName);
                    existingItem.count += 1;
                } else {
                    itemsMap.set(itemName, {
                        name: itemName,
                        count: 1,
                        category: category,
                        type: objectiveType
                    });
                }
            }
        }
    }
    
    return Array.from(itemsMap.values());
}

// Initialize database with quest data
async function initializeQuests(force = false) {
    const existingQuests = await prisma.quest.count();
    if (existingQuests > 0 && !force) {
        console.log('Quests already initialized');
        return;
    }
    
    if (force) {
        console.log('Force refreshing quest data...');
        await prisma.quest.deleteMany({});
    }

    console.log('Fetching quests from Tarkov.dev...');
    const tasks = await fetchTarkovQuests();
    
    if (tasks.length === 0) {
        console.log('No quests fetched');
        return;
    }

    for (const task of tasks) {
        try {
            const requiredItems = extractRequiredItems(task.objectives || []);
            const prerequisiteQuestIds = (task.taskRequirements || []).map(req => req.task.id);
            
            await prisma.quest.create({
                data: {
                    id: task.id,
                    name: task.name,
                    trader: task.trader?.name || 'Unknown',
                    level: task.minPlayerLevel || 1,
                    objectives: JSON.stringify(task.objectives || []),
                    wikiLink: task.wikiLink,
                    requiredForKappa: task.kappaRequired || false,
                    mapName: normalizeMapName(task.map?.name || extractMapFromQuest(task)),
                    requiredItems: JSON.stringify(requiredItems),
                    prerequisiteQuests: JSON.stringify(prerequisiteQuestIds)
                }
            });
        } catch (error) {
            console.error(`Error creating quest ${task.name}:`, error);
        }
    }

    console.log(`Initialized ${tasks.length} quests`);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ============================================================================
// STATIC PAGES
// ============================================================================

app.get('/', (req, res) => {
    if (!req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, 'login.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

app.get('/dashboard', (req, res) => {
    // Redirect to main page instead of requiring auth
    res.redirect('/');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/rankings', (req, res) => {
    res.sendFile(path.join(__dirname, 'rankings.html'));
});

app.get('/profile', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

// ============================================================================
// START SERVER
// ============================================================================

function start() {
    console.log('Starting OBS Kappa Tracker server...');
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    try {
        // Start the server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`
╔════════════════════════════════════════════════════╗
║  🎮 OBS Kappa Tracker - Multi-User Edition       ║
║  Server running on port ${PORT}                    ║
║                                                    ║
║  Features:                                         ║
║  ✓ User Authentication & Profiles                 ║
║  ✓ Personal Quest Tracking                        ║
║  ✓ Public Rankings & Leaderboards                 ║
║  ✓ Activity Feed                                   ║
║                                                    ║
║  Made by twitch.tv/mozula                         ║
╚════════════════════════════════════════════════════╝
            `);
        });
        
        // Handle server errors
        server.on('error', (error) => {
            console.error('Server error:', error);
            process.exit(1);
        });
        
        // Initialize quests in the background (non-blocking)
        console.log('Initializing quest data in background...');
        if (typeof initializeQuests === 'function') {
            initializeQuests().catch(error => {
                console.error('Failed to initialize quests:', error);
                console.log('Server will continue running, quests can be initialized later via API');
            });
        }
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
