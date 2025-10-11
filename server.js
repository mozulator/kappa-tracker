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

            // No approval check needed - users have immediate access
            // Approval now only controls leaderboard visibility

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
                twitchName: true,
                twitchUrl: true,
                discordTag: true,
                tarkovDevId: true,
                avatarUrl: true,
                approved: true,
                isAdmin: true,
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

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Forbidden - Admin access required' });
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

// Helper function to fetch Twitch avatar
async function fetchTwitchAvatar(twitchUsername) {
    try {
        // Twitch API requires OAuth, but we can use a simpler approach
        // Try to fetch from Twitch's public API or use a third-party service
        const response = await fetch(`https://decapi.me/twitch/avatar/${twitchUsername}`);
        if (response.ok) {
            const avatarUrl = await response.text();
            // DecAPI returns the URL as plain text
            if (avatarUrl && avatarUrl.startsWith('http')) {
                return avatarUrl.trim();
            }
        }
        return null;
    } catch (error) {
        console.error('Error fetching Twitch avatar:', error);
        return null;
    }
}

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { email, username, password, displayName, tarkovDevId, twitchUsername } = req.body;

        // Validation
        if (!email || !username || !password) {
            return res.status(400).json({ error: 'Email, username, and password are required' });
        }

        if (!tarkovDevId || tarkovDevId.trim() === '') {
            return res.status(400).json({ error: 'Tarkov.dev Profile ID is required' });
        }

        if (!twitchUsername || twitchUsername.trim() === '') {
            return res.status(400).json({ error: 'Twitch Username is required' });
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

        // Fetch Twitch avatar if username provided
        let avatarUrl = null;
        let twitchUrl = null;
        let twitchName = null;
        if (twitchUsername && twitchUsername.trim()) {
            twitchName = twitchUsername.trim();
            twitchUrl = `https://twitch.tv/${twitchName}`;
            avatarUrl = await fetchTwitchAvatar(twitchName);
            console.log(`Fetched Twitch avatar for ${twitchName}:`, avatarUrl);
        }

        // Check if this is the first user (make admin)
        const userCount = await prisma.user.count();
        const isFirstUser = userCount === 0;

        // Create user and progress
        // All users get immediate access, approval now only controls leaderboard visibility
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                username: username.toLowerCase(),
                displayName: displayName || username,
                passwordHash,
                tarkovDevId: tarkovDevId.trim(),
                twitchUrl,
                twitchName,
                avatarUrl,
                approved: isFirstUser, // First user (admin) auto-approved for leaderboard
                isAdmin: isFirstUser,  // First user is admin
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
                approved: true,
                isAdmin: true,
                createdAt: true
            }
        });

        // Auto login all new users (they have immediate access)
        req.login(user, (err) => {
            if (err) {
                console.error('Auto-login failed after registration:', err);
                return res.status(500).json({ error: 'Registration successful but login failed' });
            }
            console.log('User auto-logged in after registration:', user.username);
            res.json({
                message: 'Registration successful',
                user,
                leaderboardPending: !user.approved // Let them know if they need leaderboard approval
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

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        // Fetch fresh user data from database to get latest updates
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                isPublic: true,
                bio: true,
                twitchName: true,
                twitchUrl: true,
                discordTag: true,
                tarkovDevId: true,
                avatarUrl: true,
                isAdmin: true,
                createdAt: true
            }
        });
        
        res.json({ user });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

// Get users pending leaderboard approval (admin only)
app.get('/api/admin/pending-users', requireAdmin, async (req, res) => {
    try {
        const pendingUsers = await prisma.user.findMany({
            where: { approved: false },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                tarkovDevId: true,
                twitchUrl: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.json({ users: pendingUsers });
    } catch (error) {
        console.error('Error fetching pending users:', error);
        res.status(500).json({ error: 'Failed to fetch pending users' });
    }
});

// Approve user for leaderboard (admin only)
app.post('/api/admin/approve-user/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await prisma.user.update({
            where: { id: userId },
            data: { approved: true },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true
            }
        });
        
        console.log(`Admin ${req.user.username} approved user for leaderboard: ${user.username}`);
        res.json({ message: 'User approved for leaderboard successfully', user });
    } catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

// Reject user from leaderboard (admin only) - removes leaderboard access only
app.delete('/api/admin/reject-user/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Remove from leaderboard (don't delete the user, just set approved to false)
        const user = await prisma.user.update({
            where: { id: userId },
            data: { approved: false },
            select: {
                username: true,
                email: true
            }
        });
        
        console.log(`Admin ${req.user.username} removed user from leaderboard: ${user.username}`);
        res.json({ message: 'User removed from leaderboard', user });
    } catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

// Get all users (admin only)
app.get('/api/admin/all-users', requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                approved: true,
                isAdmin: true,
                createdAt: true,
                progress: {
                    select: {
                        totalCompleted: true,
                        completionRate: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.json({ users });
    } catch (error) {
        console.error('Error fetching all users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Toggle admin status (admin only)
app.put('/api/admin/toggle-admin/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { isAdmin } = req.body;
        
        // Prevent changing your own admin status
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot change your own admin status' });
        }
        
        // Get target user
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, isAdmin: true }
        });
        
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update admin status
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { isAdmin: Boolean(isAdmin) },
            select: { id: true, username: true, isAdmin: true }
        });
        
        console.log(`Admin ${req.user.username} ${isAdmin ? 'granted' : 'revoked'} admin access for user: ${targetUser.username}`);
        res.json({ 
            message: isAdmin ? 'Admin access granted' : 'Admin access revoked',
            user: updatedUser 
        });
    } catch (error) {
        console.error('Error toggling admin status:', error);
        res.status(500).json({ error: 'Failed to update admin status' });
    }
});

// Delete user (admin only)
app.delete('/api/admin/delete-user/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Prevent deleting yourself
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        // Check if user is admin
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true, username: true }
        });
        
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (targetUser.isAdmin) {
            return res.status(403).json({ error: 'Cannot delete admin users' });
        }
        
        // Delete user (cascade will delete progress and activities)
        await prisma.user.delete({
            where: { id: userId }
        });
        
        console.log(`Admin ${req.user.username} deleted user: ${targetUser.username}`);
        res.json({ message: 'User deleted successfully', username: targetUser.username });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Update user Twitch info (admin only)
app.post('/api/admin/update-twitch/:username', requireAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const { twitchName } = req.body;
        
        if (!twitchName || !twitchName.trim()) {
            return res.status(400).json({ error: 'Twitch name is required' });
        }
        
        // Find user
        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase() }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Fetch Twitch avatar
        const twitchUrl = `https://twitch.tv/${twitchName.trim()}`;
        let avatarUrl = null;
        
        try {
            const avatarResponse = await fetch(`https://decapi.me/twitch/avatar/${twitchName.trim()}`);
            if (avatarResponse.ok) {
                const avatar = await avatarResponse.text();
                if (avatar && avatar.startsWith('http')) {
                    avatarUrl = avatar.trim();
                }
            }
        } catch (error) {
            console.error('Error fetching Twitch avatar:', error);
        }
        
        // Update user
        const updateData = {
            twitchName: twitchName.trim(),
            twitchUrl
        };
        
        if (avatarUrl) {
            updateData.avatarUrl = avatarUrl;
        }
        
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: updateData,
            select: {
                username: true,
                twitchName: true,
                twitchUrl: true,
                avatarUrl: true
            }
        });
        
        console.log(`Admin ${req.user.username} updated Twitch info for ${updatedUser.username}: ${twitchName}`);
        res.json({ message: 'Twitch info updated', user: updatedUser });
    } catch (error) {
        console.error('Error updating Twitch info:', error);
        res.status(500).json({ error: 'Failed to update Twitch info' });
    }
});

// ============================================================================
// REPORT SYSTEM
// ============================================================================

// Submit a report (bug or feature)
app.post('/api/reports', requireAuth, async (req, res) => {
    try {
        const { type, title, description } = req.body;
        
        // Validation
        if (!type || !['bug', 'feature'].includes(type)) {
            return res.status(400).json({ error: 'Type must be "bug" or "feature"' });
        }
        
        if (!title || title.trim().length < 3) {
            return res.status(400).json({ error: 'Title must be at least 3 characters' });
        }
        
        if (!description || description.trim().length < 10) {
            return res.status(400).json({ error: 'Description must be at least 10 characters' });
        }
        
        const report = await prisma.report.create({
            data: {
                userId: req.user.id,
                type,
                title: title.trim(),
                description: description.trim(),
                status: 'pending'
            },
            include: {
                user: {
                    select: {
                        username: true,
                        displayName: true
                    }
                }
            }
        });
        
        console.log(`New ${type} report from ${req.user.username}: ${title}`);
        res.json({ message: 'Report submitted successfully', report });
    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

// Get all reports (admin only)
app.get('/api/admin/reports', requireAdmin, async (req, res) => {
    try {
        const { status, type } = req.query;
        
        const where = {};
        if (status) where.status = status;
        if (type) where.type = type;
        
        const reports = await prisma.report.findMany({
            where,
            include: {
                user: {
                    select: {
                        username: true,
                        displayName: true,
                        email: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.json({ reports });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

// Update report status (admin only)
app.put('/api/admin/reports/:reportId', requireAdmin, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status, adminNotes } = req.body;
        
        if (status && !['pending', 'reviewed', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const updateData = {};
        if (status) updateData.status = status;
        if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
        
        const report = await prisma.report.update({
            where: { id: reportId },
            data: updateData,
            include: {
                user: {
                    select: {
                        username: true,
                        displayName: true
                    }
                }
            }
        });
        
        console.log(`Admin ${req.user.username} updated report ${reportId} to ${status}`);
        res.json({ message: 'Report updated', report });
    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// Delete report (admin only)
app.delete('/api/admin/reports/:reportId', requireAdmin, async (req, res) => {
    try {
        const { reportId } = req.params;
        
        await prisma.report.delete({
            where: { id: reportId }
        });
        
        console.log(`Admin ${req.user.username} deleted report ${reportId}`);
        res.json({ message: 'Report deleted' });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// ============================================================================
// USER PROFILE MANAGEMENT
// ============================================================================

// Update Twitch name
app.post('/api/user/update-twitch', requireAuth, async (req, res) => {
    try {
        const { twitchName } = req.body;
        
        // Validate Twitch name (alphanumeric and underscores only, 4-25 chars)
        if (twitchName && (twitchName.length < 4 || twitchName.length > 25 || !/^[a-zA-Z0-9_]+$/.test(twitchName))) {
            return res.status(400).json({ 
                error: 'Invalid Twitch username. Must be 4-25 characters and contain only letters, numbers, and underscores.' 
            });
        }
        
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { 
                twitchName: twitchName || null,
                twitchUrl: twitchName ? `https://twitch.tv/${twitchName}` : null
            }
        });
        
        res.json({ 
            success: true,
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating Twitch name:', error);
        res.status(500).json({ error: 'Failed to update Twitch name' });
    }
});

// Generate unique overlay URL for collector progress
app.get('/api/user/collector-url', requireAuth, async (req, res) => {
    try {
        const crypto = require('crypto');
        
        // Check if user already has a valid token
        let token = await prisma.overlayToken.findFirst({
            where: {
                userId: req.user.id,
                type: 'collector',
                expiresAt: { gt: new Date() }
            }
        });
        
        // If no valid token, create one (expires in 10 years)
        if (!token) {
            const tokenString = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 10);
            
            token = await prisma.overlayToken.create({
                data: {
                    token: tokenString,
                    userId: req.user.id,
                    type: 'collector',
                    expiresAt
                }
            });
        }
        
        const url = `${req.protocol}://${req.get('host')}/collector/${req.user.id}/${token.token}`;
        res.json({ url });
    } catch (error) {
        console.error('Error generating collector URL:', error);
        res.status(500).json({ error: 'Failed to generate URL' });
    }
});

// Generate unique overlay URL for kappa overview
app.get('/api/user/kappa-url', requireAuth, async (req, res) => {
    try {
        const crypto = require('crypto');
        
        // Check if user already has a valid token
        let token = await prisma.overlayToken.findFirst({
            where: {
                userId: req.user.id,
                type: 'kappa',
                expiresAt: { gt: new Date() }
            }
        });
        
        // If no valid token, create one (expires in 10 years)
        if (!token) {
            const tokenString = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 10);
            
            token = await prisma.overlayToken.create({
                data: {
                    token: tokenString,
                    userId: req.user.id,
                    type: 'kappa',
                    expiresAt
                }
            });
        }
        
        const url = `${req.protocol}://${req.get('host')}/kappa/${req.user.id}/${token.token}`;
        res.json({ url });
    } catch (error) {
        console.error('Error generating kappa URL:', error);
        res.status(500).json({ error: 'Failed to generate URL' });
    }
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
                tarkovDevId: true,
                avatarUrl: true,
                isPublic: true,
                createdAt: true,
                progress: {
                    select: {
                        pmcLevel: true,
                        prestige: true,
                        completionRate: true,
                        totalCompleted: true,
                        lastQuestDate: true,
                        completedQuests: true,
                        collectorItemsFound: true
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

        // Parse completed quests and collector items
        // If public profile or own profile, include data for OBS overlays
        if (user.progress) {
            if (user.isPublic || isOwnProfile) {
                user.progress.completedQuests = JSON.parse(user.progress.completedQuests || '[]');
                user.progress.collectorItemsFound = JSON.parse(user.progress.collectorItemsFound || '[]');
            } else {
                // Don't send detailed quest list for private profiles
                delete user.progress.completedQuests;
                delete user.progress.collectorItemsFound;
            }
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

        const { displayName, bio, twitchUrl, twitchUsername, discordTag, tarkovDevId, avatarUrl, isPublic } = req.body;

        // Build update data object
        let updateData = {
                ...(displayName !== undefined && { displayName }),
                ...(bio !== undefined && { bio }),
                ...(discordTag !== undefined && { discordTag }),
            ...(tarkovDevId !== undefined && { tarkovDevId }),
                ...(isPublic !== undefined && { isPublic })
        };

        // Handle Twitch username update (auto-fetch avatar)
        if (twitchUsername !== undefined) {
            if (twitchUsername && twitchUsername.trim()) {
                const twitchName = twitchUsername.trim();
                updateData.twitchName = twitchName;
                updateData.twitchUrl = `https://twitch.tv/${twitchName}`;
                const fetchedAvatar = await fetchTwitchAvatar(twitchName);
                if (fetchedAvatar) {
                    updateData.avatarUrl = fetchedAvatar;
                }
            } else {
                // Clear Twitch data if empty
                updateData.twitchName = null;
                updateData.twitchUrl = null;
            }
        } else if (twitchUrl !== undefined) {
            // Legacy support for direct twitchUrl updates
            updateData.twitchUrl = twitchUrl;
        }

        // Manual avatar URL override (if provided separately)
        if (avatarUrl !== undefined) {
            updateData.avatarUrl = avatarUrl;
        }

        const updatedUser = await prisma.user.update({
            where: { username: username.toLowerCase() },
            data: updateData,
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                bio: true,
                twitchUrl: true,
                twitchName: true,
                discordTag: true,
                tarkovDevId: true,
                avatarUrl: true,
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

// Update quest (admin only)
app.put('/api/admin/quests/:questId', requireAdmin, async (req, res) => {
    try {
        const { questId } = req.params;
        const { trader, level, requiredForKappa, mapName, prerequisiteQuests, requiredItems, images } = req.body;

        // Validate quest exists
        const quest = await prisma.quest.findUnique({
            where: { id: questId },
            select: { id: true, name: true }
        });

        if (!quest) {
            return res.status(404).json({ error: 'Quest not found' });
        }

        // Build update data
        const updateData = {};
        
        if (trader !== undefined) {
            updateData.trader = trader;
        }
        
        if (level !== undefined) {
            updateData.level = parseInt(level);
        }
        
        if (requiredForKappa !== undefined) {
            updateData.requiredForKappa = Boolean(requiredForKappa);
        }
        
        if (mapName !== undefined) {
            updateData.mapName = mapName;
        }
        
        if (prerequisiteQuests !== undefined) {
            // Validate it's valid JSON
            try {
                JSON.parse(prerequisiteQuests);
                updateData.prerequisiteQuests = prerequisiteQuests;
            } catch (e) {
                return res.status(400).json({ error: 'Invalid prerequisiteQuests JSON' });
            }
        }
        
        if (requiredItems !== undefined) {
            // Validate it's valid JSON
            try {
                JSON.parse(requiredItems);
                updateData.requiredItems = requiredItems;
            } catch (e) {
                return res.status(400).json({ error: 'Invalid requiredItems JSON' });
            }
        }
        
        if (images !== undefined) {
            // Validate it's valid JSON
            try {
                JSON.parse(images);
                updateData.images = images;
            } catch (e) {
                return res.status(400).json({ error: 'Invalid images JSON' });
            }
        }

        // Update quest
        const updatedQuest = await prisma.quest.update({
            where: { id: questId },
            data: updateData
        });

        console.log(`Admin ${req.user.username} updated quest: ${quest.name}`);
        res.json({
            message: 'Quest updated successfully',
            quest: updatedQuest
        });

    } catch (error) {
        console.error('Error updating quest:', error);
        res.status(500).json({ error: 'Failed to update quest' });
    }
});

// Get single quest (admin)
app.get('/api/admin/quests/:questId', requireAdmin, async (req, res) => {
    try {
        const { questId } = req.params;
        const quest = await prisma.quest.findUnique({
            where: { id: questId }
        });

        if (!quest) {
            return res.status(404).json({ error: 'Quest not found' });
        }

        res.json(quest);
    } catch (error) {
        console.error('Error fetching quest:', error);
        res.status(500).json({ error: 'Failed to fetch quest' });
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
                    prestige: 0,
                    completedQuests: JSON.stringify([]),
                    completionRate: 0,
                    totalCompleted: 0
                }
            });
        }

        // Parse completedQuests before sending
        const responseData = {
            ...progress,
            completedQuests: JSON.parse(progress.completedQuests || '[]')
        };
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching progress:', error);
        res.status(500).json({ error: error.message });
    }
});

// Public endpoint for getting user progress by userId (for overlay pages)
app.get('/api/progress/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        let progress = await prisma.userProgress.findUnique({
            where: { userId }
        });

        if (!progress) {
            // Return empty progress if user doesn't exist
            return res.json({
                pmcLevel: 1,
                completedQuests: [],
                completionRate: 0,
                totalCompleted: 0
            });
        }

        // Parse completedQuests before sending
        const responseData = {
            ...progress,
            completedQuests: JSON.parse(progress.completedQuests || '[]')
        };
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching public progress:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/progress', requireAuth, async (req, res) => {
    try {
        const { pmcLevel, prestige, completedQuests } = req.body;

        // Calculate stats
        const allQuests = await prisma.quest.findMany({
            where: { requiredForKappa: true }
        });
        const totalKappaQuests = allQuests.length;
        const kappaQuestIds = allQuests.map(q => q.id);
        
        // Only count completed quests that are kappa-required
        const completedKappaQuests = completedQuests 
            ? completedQuests.filter(id => kappaQuestIds.includes(id))
            : [];
        const completedCount = completedKappaQuests.length;
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
                    prestige: prestige || 0,
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
                    prestige: prestige !== undefined ? prestige : progress.prestige,
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
                prestige: 0,
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

        // Fetch all rankings without pagination first (to sort properly)
        const allRankings = await prisma.user.findMany({
            where: {
                isPublic: true,
                approved: true // Only show approved users
            },
            select: {
                username: true,
                displayName: true,
                twitchName: true,
                twitchUrl: true,
                tarkovDevId: true,
                avatarUrl: true,
                progress: {
                    select: {
                        pmcLevel: true,
                        prestige: true,
                        completionRate: true,
                        totalCompleted: true,
                        lastQuestDate: true
                    }
                }
            }
        });

        // Sort by prestige (descending), then by completionRate (descending), then by PMC level (descending)
        const sortedRankings = allRankings.sort((a, b) => {
            const prestigeA = a.progress?.prestige || 0;
            const prestigeB = b.progress?.prestige || 0;
            
            // First, compare prestige (higher is better)
            if (prestigeB !== prestigeA) {
                return prestigeB - prestigeA;
            }
            
            // If prestige is equal, compare completion rate (higher is better)
            const rateA = a.progress?.completionRate || 0;
            const rateB = b.progress?.completionRate || 0;
            if (rateB !== rateA) {
            return rateB - rateA;
            }
            
            // If completion rate is also equal, compare PMC level (higher is better)
            const levelA = a.progress?.pmcLevel || 0;
            const levelB = b.progress?.pmcLevel || 0;
            return levelB - levelA;
        });

        // Apply pagination after sorting
        const rankings = sortedRankings.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        // Get total count
        const total = allRankings.length;

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
                approved: true
            },
            select: {
                username: true,
                displayName: true,
                progress: {
                    select: {
                        completedQuests: true,
                        pmcLevel: true,
                        prestige: true
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
                prestige: user.progress.prestige || 0,
                mapCompleted: mapCompleted.length,
                mapTotal: mapQuestIds.length,
                mapCompletionRate
            };
        })
        .filter(u => u.mapCompleted > 0)
        .sort((a, b) => {
            // Sort by prestige first
            if (b.prestige !== a.prestige) {
                return b.prestige - a.prestige;
            }
            // Then by map completion rate
            if (b.mapCompletionRate !== a.mapCompletionRate) {
                return b.mapCompletionRate - a.mapCompletionRate;
            }
            // Then by PMC level
            return b.pmcLevel - a.pmcLevel;
        })
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
    if (!mapName) return 'Any Location';
    
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
        'peacekeeping mission',
        'fishing place',
        'colleagues - part 3',
        'the cult - part 2'
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

// Note: Quest fixes are now managed through the admin UI (Fix Quests tab)
// The applyQuestFixes() function has been removed in favor of manual fixes through the web interface

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', async (req, res) => {
    try {
        // Basic health check
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        };

        // Check database connection
        try {
            await prisma.$queryRaw`SELECT 1`;
            health.database = 'connected';
        } catch (error) {
            health.database = 'disconnected';
            health.status = 'degraded';
        }

        // Include quest fix status if available
        if (global.questFixStatus) {
            health.questFixes = global.questFixStatus;
            
            // Mark as degraded if quest fixes failed
            if (global.questFixStatus.failed > 0) {
                health.status = 'degraded';
                health.warnings = health.warnings || [];
                health.warnings.push(`${global.questFixStatus.failed} quest fix(es) failed`);
            }
            
            // Warn about ID changes
            if (global.questFixStatus.idChanges > 0) {
                health.warnings = health.warnings || [];
                health.warnings.push(`${global.questFixStatus.idChanges} quest ID(s) have changed - update recommended`);
            }
        }

        res.json(health);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Detailed quest fixes health check endpoint
app.get('/health/quest-fixes', async (req, res) => {
    try {
        if (!global.questFixStatus) {
            return res.json({
                status: 'unknown',
                message: 'Quest fixes have not been applied yet (server may still be starting)',
                timestamp: new Date().toISOString()
            });
        }

        const status = global.questFixStatus;
        const isHealthy = status.failed === 0;
        
        const recommendations = [];
        if (status.failed > 0) {
            recommendations.push('Some quest fixes failed to apply. Check server logs for details.');
        }
        if (status.idChanges > 0) {
            recommendations.push('Quest IDs have changed. Consider updating the fix list in server.js.');
        }
        
        res.json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: status.timestamp,
            summary: {
                total: status.total,
                successful: status.successful,
                failed: status.failed,
                idChanges: status.idChanges
            },
            details: {
                successRate: `${((status.successful / status.total) * 100).toFixed(1)}%`,
                failedFixes: status.failedFixes,
                needsUpdate: status.idChanges > 0,
                recommendations: recommendations
            }
        });
        
    } catch (error) {
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// ============================================================================
// OVERLAY PAGES (with token authentication)
// ============================================================================

// Collector Progress overlay
app.get('/collector/:userId/:token', async (req, res) => {
    try {
        const { userId, token } = req.params;
        
        // Validate token
        const overlayToken = await prisma.overlayToken.findFirst({
            where: {
                userId,
                token,
                type: 'collector',
                expiresAt: { gt: new Date() }
            }
        });
        
        if (!overlayToken) {
            return res.status(401).send('Invalid or expired token');
        }
        
        // Serve collector-progress.html
        res.sendFile(path.join(__dirname, 'collector-progress.html'));
    } catch (error) {
        console.error('Error serving collector overlay:', error);
        res.status(500).send('Error loading overlay');
    }
});

// Kappa Overview overlay
app.get('/kappa/:userId/:token', async (req, res) => {
    try {
        const { userId, token } = req.params;
        
        // Validate token
        const overlayToken = await prisma.overlayToken.findFirst({
            where: {
                userId,
                token,
                type: 'kappa',
                expiresAt: { gt: new Date() }
            }
        });
        
        if (!overlayToken) {
            return res.status(401).send('Invalid or expired token');
        }
        
        // Serve kappa-overview.html
        res.sendFile(path.join(__dirname, 'kappa-overview.html'));
    } catch (error) {
        console.error('Error serving kappa overlay:', error);
        res.status(500).send('Error loading overlay');
    }
});

// Collector Items overlay (public - no auth required for now)
app.get('/collector-items-overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'collector-items-overlay.html'));
});

// API endpoint for collector items overlay data
// Get collector items with user's progress (authenticated or with username)
app.get('/api/collector-items', optionalAuth, async (req, res) => {
    try {
        const { username } = req.query;
        
        const collectorQuest = await prisma.quest.findFirst({
            where: {
                name: 'Collector',
                trader: 'Fence'
            }
        });

        if (!collectorQuest) {
            return res.json({ items: [], foundItems: [] });
        }

        const requiredItems = JSON.parse(collectorQuest.requiredItems || '[]');
        const firItems = requiredItems.filter(item => 
            item.type === 'giveItem' || item.category === 'fir'
        );

        let foundItems = [];
        
        // If username provided, get that user's progress
        if (username) {
            const user = await prisma.user.findUnique({
                where: { username: username.toLowerCase() },
                include: {
                    progress: {
                        select: {
                            collectorItemsFound: true
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

            foundItems = user.progress ? JSON.parse(user.progress.collectorItemsFound || '[]') : [];
        } 
        // Otherwise, use authenticated user's progress
        else if (req.user) {
            const userProgress = await prisma.userProgress.findUnique({
                where: { userId: req.user.id }
            });
            foundItems = userProgress ? JSON.parse(userProgress.collectorItemsFound || '[]') : [];
        }

        res.json({
            items: firItems.map(item => ({
                id: item.name,
                name: item.name,
                count: item.count || 1,
                image: null
            })),
            foundItems: foundItems
        });
    } catch (error) {
        console.error('Error fetching collector items:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Save collector items progress (authenticated)
app.post('/api/collector-items/save', requireAuth, async (req, res) => {
    try {
        const { foundItems } = req.body;
        
        await prisma.userProgress.upsert({
            where: { userId: req.user.id },
            update: {
                collectorItemsFound: JSON.stringify(foundItems || [])
            },
            create: {
                userId: req.user.id,
                collectorItemsFound: JSON.stringify(foundItems || []),
                completedQuests: '[]'
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving collector items:', error);
        res.status(500).json({ error: 'Failed to save progress' });
    }
});

// ============================================================================
// STATIC FILES (must be after API routes)
// ============================================================================
// Explicitly serve fonts directory
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

// Serve all static files
app.use(express.static('.'));

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

// Public profile with server-side rendering for SEO
app.get('/public-profile', async (req, res) => {
    const username = req.query.user;
    
    // If no username, serve basic page
    if (!username) {
        return res.sendFile(path.join(__dirname, 'public-profile.html'));
    }
    
    try {
        // Fetch user data
        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase() },
            select: {
                id: true,
                username: true,
                displayName: true,
                bio: true,
                twitchUrl: true,
                discordTag: true,
                tarkovDevId: true,
                avatarUrl: true,
                isPublic: true,
                createdAt: true,
                progress: {
                    select: {
                        pmcLevel: true,
                        prestige: true,
                        completionRate: true,
                        totalCompleted: true,
                        lastQuestDate: true
                    }
                }
            }
        });
        
        // If user not found or private, serve basic page
        if (!user || !user.isPublic) {
            return res.sendFile(path.join(__dirname, 'public-profile.html'));
        }
        
        // Generate dynamic meta tags
        const displayName = user.displayName || user.username;
        const completionRate = user.progress?.completionRate?.toFixed(1) || '0.0';
        const questsCompleted = user.progress?.totalCompleted || 0;
        const prestige = user.progress?.prestige || 0;
        const pmcLevel = user.progress?.pmcLevel || 1;
        const avatarUrl = user.avatarUrl || 'https://kappa-tracker.onrender.com/imgs/kaban.png';
        const profileUrl = `${req.protocol}://${req.get('host')}/public-profile?user=${username}`;
        
        // Build description with stats
        const description = `${displayName} - Level ${pmcLevel}${prestige > 0 ? ` (Prestige ${prestige})` : ''} | ${completionRate}% Complete | ${questsCompleted} Quests | Escape From Tarkov Progress`;
        
        // Read the base HTML file
        const fs = require('fs');
        let html = fs.readFileSync(path.join(__dirname, 'public-profile.html'), 'utf8');
        
        // Replace meta tags
        html = html.replace(
            /<title>.*?<\/title>/,
            `<title>${displayName} - OBS Kappa Tracker</title>`
        );
        
        html = html.replace(
            /<meta name="title" content=".*?">/,
            `<meta name="title" content="${displayName} - OBS Kappa Tracker">`
        );
        
        html = html.replace(
            /<meta name="description" content=".*?">/,
            `<meta name="description" content="${description}">`
        );
        
        html = html.replace(
            /<link rel="canonical" href=".*?">/,
            `<link rel="canonical" href="${profileUrl}">`
        );
        
        // Open Graph tags
        html = html.replace(
            /<meta property="og:url" content=".*?">/,
            `<meta property="og:url" content="${profileUrl}">`
        );
        
        html = html.replace(
            /<meta property="og:title" content=".*?">/,
            `<meta property="og:title" content="${displayName} - Level ${pmcLevel}${prestige > 0 ? ` (Prestige ${prestige})` : ''}">`
        );
        
        html = html.replace(
            /<meta property="og:description" content=".*?">/,
            `<meta property="og:description" content="${completionRate}% Complete | ${questsCompleted} Quests Completed | Escape From Tarkov Kappa Progress">`
        );
        
        html = html.replace(
            /<meta property="og:image" content=".*?">/,
            `<meta property="og:image" content="${avatarUrl}">`
        );
        
        // Twitter tags
        html = html.replace(
            /<meta property="twitter:url" content=".*?">/,
            `<meta property="twitter:url" content="${profileUrl}">`
        );
        
        html = html.replace(
            /<meta property="twitter:title" content=".*?">/,
            `<meta property="twitter:title" content="${displayName} - Level ${pmcLevel}${prestige > 0 ? ` (Prestige ${prestige})` : ''}">`
        );
        
        html = html.replace(
            /<meta property="twitter:description" content=".*?">/,
            `<meta property="twitter:description" content="${completionRate}% Complete | ${questsCompleted} Quests Completed">`
        );
        
        // Add twitter:image if not present
        if (!html.includes('twitter:image')) {
            html = html.replace(
                /<meta property="twitter:description".*?>/,
                `$&\n    <meta property="twitter:image" content="${avatarUrl}">`
            );
        } else {
            html = html.replace(
                /<meta property="twitter:image" content=".*?">/,
                `<meta property="twitter:image" content="${avatarUrl}">`
            );
        }
        
        // Change twitter card to summary_large_image for better display
        html = html.replace(
            /<meta property="twitter:card" content="summary">/,
            `<meta property="twitter:card" content="summary_large_image">`
        );
        
        res.send(html);
    } catch (error) {
        console.error('Error serving public profile:', error);
        res.sendFile(path.join(__dirname, 'public-profile.html'));
    }
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

