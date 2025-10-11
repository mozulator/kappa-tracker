# OBS Overlay Development Guide

This guide documents the standard pattern for creating OBS overlays in the Kappa Tracker application. Follow these rules to ensure your overlay works correctly the first time.

## Core Principles

1. **Standalone HTML Page**: Each overlay is a separate HTML file that can be opened independently
2. **Username Parameter Support**: Overlays must support `?username=XXX` URL parameter to display any user's data
3. **Auto-refresh**: Overlays should automatically refresh data every 10 seconds
4. **Public/Private Profile Respect**: Overlays must respect user privacy settings
5. **Error Handling**: Never break the UI on error - keep showing existing data
6. **Authenticated Fallback**: If no username is provided, use authenticated session

## Required Components

### 1. URL Parameter Extraction

```javascript
// Extract username from URL query parameter (format: ?username=XXX)
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get('username');
```

### 2. API Endpoint Pattern

Your API endpoint must support both authenticated users and username-based queries:

```javascript
app.get('/api/your-overlay-data', optionalAuth, async (req, res) => {
    try {
        const { username } = req.query;
        
        // Fetch your main data (e.g., quests, items, etc.)
        const mainData = await prisma.yourModel.findFirst({ ... });
        
        let userData = {};
        
        // If username provided, get that user's progress
        if (username) {
            const user = await prisma.user.findUnique({
                where: { username: username.toLowerCase() },
                include: {
                    progress: {
                        select: {
                            // Select the fields you need
                            yourField: true,
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

            // Parse JSON fields if needed
            userData = user.progress ? JSON.parse(user.progress.yourField || '[]') : [];
        } 
        // Otherwise, use authenticated user's progress
        else if (req.user) {
            const userProgress = await prisma.userProgress.findUnique({
                where: { userId: req.user.id }
            });
            userData = userProgress ? JSON.parse(userProgress.yourField || '[]') : [];
        }

        res.json({
            mainData,
            userData
        });
    } catch (error) {
        console.error('Error fetching overlay data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});
```

### 3. Data Fetching in Overlay

```javascript
async function loadOverlayData() {
    try {
        // Fetch data - either by username or authenticated session
        const apiUrl = username ? `/api/your-overlay-data?username=${username}` : '/api/your-overlay-data';
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            console.error('Error fetching data:', response.status);
            // Don't update UI - keep showing existing data
            return;
        }
        
        const data = await response.json();
        
        // Check for error response
        if (data.error) {
            console.error('API returned error:', data.error);
            return;
        }
        
        // Update your UI
        updateOverlayUI(data);
        
        // Auto-refresh every 10 seconds
        setTimeout(() => loadOverlayData(), 10000);
    } catch (error) {
        console.error('Error loading overlay data:', error);
        // Don't update UI on error - keep showing existing data
    }
}

// Start loading data
loadOverlayData();
```

### 4. User API Endpoint Updates

When adding new progress fields, update the `/api/users/:username` endpoint:

```javascript
app.get('/api/users/:username', optionalAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase() },
            select: {
                // ... existing fields ...
                progress: {
                    select: {
                        // ... existing fields ...
                        yourNewField: true  // Add your new field here
                    }
                }
            }
        });

        // ... validation ...

        // Parse JSON fields for overlays
        if (user.progress) {
            if (user.isPublic || isOwnProfile) {
                // Parse your field
                user.progress.yourNewField = JSON.parse(user.progress.yourNewField || '[]');
            } else {
                // Don't send for private profiles
                delete user.progress.yourNewField;
            }
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
```

### 5. Main App Link Updates

In `index.html`, add your overlay link and update it with username:

```javascript
// Get reference to your overlay link
const yourOverlayLink = document.getElementById('your-overlay-link');

// Inside the auth check, update the link with username
fetch('/api/auth/me', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
        if (data.user && data.user.username) {
            const username = data.user.username;
            
            // Update your overlay link
            if (yourOverlayLink) {
                yourOverlayLink.href = `/your-overlay.html?username=${username}`;
            }
        }
    });
```

## Database Schema Updates

When adding new progress tracking:

1. **Update Prisma Schema** (`prisma/schema.prisma`):
```prisma
model UserProgress {
  // ... existing fields ...
  yourNewField String @default("[]") // JSON array
}
```

2. **Create Migration**:
```bash
# Create migration directory
mkdir prisma/migrations/YYYYMMDDHHMMSS_add_your_field

# Create migration SQL file
# prisma/migrations/YYYYMMDDHHMMSS_add_your_field/migration.sql
-- AlterTable
ALTER TABLE "user_progress" ADD COLUMN "yourNewField" TEXT NOT NULL DEFAULT '[]';
```

## Error Handling Rules

1. **Never break existing UI**: If an API call fails, keep showing the last successful data
2. **Log errors to console**: Use `console.error()` for debugging
3. **Return early on errors**: Use `return;` to prevent UI updates on error
4. **Validate data**: Check for `null`, `undefined`, and error responses

## Testing Checklist

Before considering your overlay complete, test these scenarios:

- [ ] Overlay works with `?username=yourusername` parameter
- [ ] Overlay works without username (authenticated user)
- [ ] Overlay respects private profiles (shows 403 error)
- [ ] Overlay handles non-existent users (shows 404 error)
- [ ] Overlay auto-refreshes every 10 seconds
- [ ] Overlay maintains data display when API errors occur
- [ ] Link in main app is updated with username on login
- [ ] Overlay visual design is suitable for OBS (transparent backgrounds, good contrast)

## Common Pitfalls

1. **Forgetting `optionalAuth`**: Your API endpoints must use `optionalAuth` middleware, not `requireAuth`
2. **Not checking `isPublic`**: Always respect user privacy settings
3. **Breaking UI on error**: Never update the UI when an error occurs
4. **Missing username parsing**: Don't forget to extract username from query parameters
5. **Hardcoding authentication**: Support both username parameter and authenticated session
6. **Forgetting to parse JSON**: Database JSON fields must be parsed with `JSON.parse()`
7. **Not lowercasing username**: Always use `.toLowerCase()` when querying by username

## Example Files

Reference these existing overlays:
- `collector-progress.html` - Simple progress tracker
- `kappa-overview.html` - Quest overview grid
- `collector-items-overlay.html` - Split-screen item tracker

## Summary

**The Golden Rule**: An OBS overlay must work independently with just a username parameter, respect privacy settings, handle errors gracefully, and auto-refresh without breaking the display.

Follow this guide, and your overlay will work on the first try! 🎯

