# SEO Optimization for Public Profiles

## Summary
Added server-side rendering for public profile pages to improve SEO when sharing on social media platforms (Facebook, Twitter, Discord, etc.). Social media scrapers can now properly read user profile information including avatar, completion rate, quests completed, prestige level, and PMC level.

## Changes Made

### 1. Server-Side Route (`server.js`)
- **Added**: New route `/public-profile` that handles server-side rendering
- **Location**: Lines 1833-1971
- **Functionality**:
  - Fetches user data from database based on username query parameter
  - Dynamically generates meta tags with user-specific information
  - Falls back to static HTML if user not found or profile is private
  - Handles both public and private profiles appropriately

### 2. Dynamic Meta Tags
The following information is now included in meta tags for each public profile:

#### Open Graph (Facebook, Discord, LinkedIn)
- `og:title`: User display name and level with prestige
- `og:description`: Completion rate and quests completed
- `og:image`: User's Twitch avatar (or default image)
- `og:url`: Canonical profile URL

#### Twitter Card
- `twitter:card`: Changed to `summary_large_image` for better display
- `twitter:title`: User display name and level with prestige
- `twitter:description`: Completion rate and quests completed
- `twitter:image`: User's Twitch avatar (or default image)

#### Example Meta Tags
```html
<title>PlayerName - OBS Kappa Tracker</title>
<meta property="og:title" content="PlayerName - Level 45 (Prestige 2)">
<meta property="og:description" content="67.5% Complete | 135 Quests Completed | Escape From Tarkov Kappa Progress">
<meta property="og:image" content="https://static-cdn.jtvnw.net/avatar.jpg">
<meta property="twitter:card" content="summary_large_image">
```

### 3. Updated URLs (`public-profile.html`)
- Changed canonical URL from `/public-profile.html` to `/public-profile`
- Updated Twitter card type from `summary` to `summary_large_image`
- Added `twitter:image` meta tag

### 4. Updated Internal Links
- **`rankings.html`**: Updated profile links to use `/public-profile?user=`
- **`script.js`**: Updated profile links in activity feed
- **`robots.txt`**: Added `/public-profile` to allowed paths
- **`sitemap.xml`**: Added public profile route with priority 0.8

## How It Works

### Before (Client-Side Only)
1. User shares link: `/public-profile.html?user=username`
2. Social media bot fetches page
3. Bot sees static HTML with generic meta tags
4. JavaScript loads user data (but bots don't execute JS)
5. Generic preview shown on social media

### After (Server-Side Rendering)
1. User shares link: `/public-profile?user=username`
2. Social media bot fetches page
3. Server detects username parameter
4. Server fetches user data from database
5. Server generates HTML with dynamic meta tags
6. Bot sees personalized meta tags immediately
7. Rich preview shown on social media with:
   - User's avatar
   - Level and prestige
   - Completion percentage
   - Quest count

## Benefits

1. **Better Social Sharing**: Rich previews on Facebook, Twitter, Discord, etc.
2. **Improved SEO**: Search engines can properly index user profiles with relevant information
3. **Professional Appearance**: Branded previews when sharing links
4. **No Breaking Changes**: Old URLs with `.html` extension still work
5. **Backward Compatible**: Static HTML served if user not found or profile private

## Testing

To test the SEO optimization:

1. **Test Dynamic Route**:
   ```
   Visit: /public-profile?user={username}
   ```

2. **Test Social Media Preview**:
   - Facebook: https://developers.facebook.com/tools/debug/
   - Twitter: https://cards-dev.twitter.com/validator
   - LinkedIn: https://www.linkedin.com/post-inspector/

3. **Test Edge Cases**:
   - No username: `/public-profile` → Shows static page
   - Invalid username: `/public-profile?user=notfound` → Shows static page
   - Private profile: → Shows "Private Profile" message

## Data Included in Meta Tags

As requested by the user:

✅ **Avatar**: User's Twitch avatar (og:image, twitter:image)
✅ **Completion Rate**: Quest completion percentage (in description)
✅ **Quest Completed**: Total number of quests completed (in description)
✅ **Prestige**: Shown as number in title (e.g., "Prestige 2")
✅ **PMC Level**: User's level (in title)

## Example Output

For a user with:
- Display Name: "TarkovPro"
- Level: 45
- Prestige: 2
- Completion: 67.5%
- Quests: 135

**Title**: `TarkovPro - OBS Kappa Tracker`

**Description**: `TarkovPro - Level 45 (Prestige 2) | 67.5% Complete | 135 Quests | Escape From Tarkov Progress`

**OG Title**: `TarkovPro - Level 45 (Prestige 2)`

**OG Description**: `67.5% Complete | 135 Quests Completed | Escape From Tarkov Kappa Progress`

**Image**: User's Twitch avatar URL

## Notes

- The route prioritizes server-side rendering for SEO while maintaining client-side functionality
- Static file still exists as fallback and for direct access
- No changes needed to existing database schema
- Performance impact is minimal (single database query per profile view)
- Caching can be added in the future if needed

