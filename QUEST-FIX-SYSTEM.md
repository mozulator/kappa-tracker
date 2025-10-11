# Quest Fix System - Enhanced Robustness

## Overview
The quest fix system has been enhanced to handle quest ID changes automatically, providing better resilience when Tarkov updates or the Tarkov.dev API data changes.

## Features

### 1. **Smart Quest Lookup with Fallback**
The system now uses a multi-step approach to find quests:
1. **Primary**: Look up by quest ID (fast)
2. **Fallback Level 1**: Look up by exact name match
3. **Fallback Level 2**: Case-insensitive name match
4. **Fallback Level 3**: Normalized name match (ignoring special characters like hyphens, spaces)

This ensures that even if quest IDs change after a Tarkov update, the fixes can still be applied using the quest name.

### 2. **Automatic ID Change Detection**
When a quest is found by name but the ID doesn't match, the system:
- ✅ Still applies the fix successfully
- ⚡ Logs a warning that the ID has changed
- 📝 Shows both old and new IDs for easy updating
- 💡 Suggests updating the fix list

Example log output:
```
⚠️  Quest ID not found for "Informed Means Armed" (669f8d43e1bc2a1a6c04bcf9), trying name lookup...
   ✅ Found by name: "Informed Means Armed" with ID: 5b47926a86f7747ccc057c15
   ⚡ Quest ID has changed!
      Old ID: 669f8d43e1bc2a1a6c04bcf9
      New ID: 5b47926a86f7747ccc057c15
      ⚠️  Consider updating the fix list with the new ID
✅ Applied fix: "Informed Means Armed" (5b47926a86f7747ccc057c15)
```

### 3. **Enhanced Startup Logging**
The system now provides detailed logging during startup:

```
🔧 Applying quest fixes...
✅ Applied fix: "Introduction" (5d2495a886f77425cd51e403)
✅ Applied fix: "Bad Rep Evidence" (5967530a86f77462ba22226b)
...

📊 Quest Fix Summary:
   ✅ Successful: 7
   ❌ Failed: 0
   ⚡ ID changes detected: 2 (consider updating fix list)
```

If fixes fail, detailed information is provided:
```
⚠️  Failed fixes:
   - Quest Name (quest-id): reason for failure
```

### 4. **Health Check Endpoints**

#### Basic Health Check: `/health`
Returns overall system health including quest fix status:

```json
{
  "status": "ok",
  "timestamp": "2025-10-11T12:00:00.000Z",
  "environment": "production",
  "database": "connected",
  "questFixes": {
    "timestamp": "2025-10-11T12:00:00.000Z",
    "total": 7,
    "successful": 7,
    "failed": 0,
    "idChanges": 2,
    "failedFixes": []
  },
  "warnings": [
    "2 quest ID(s) have changed - update recommended"
  ]
}
```

**Status Levels:**
- `ok` - Everything working normally
- `degraded` - System working but with warnings (e.g., ID changes, some fixes failed)
- `error` - Critical error

#### Detailed Quest Fixes Check: `/health/quest-fixes`
Returns detailed information about quest fix status:

```json
{
  "status": "healthy",
  "timestamp": "2025-10-11T12:00:00.000Z",
  "summary": {
    "total": 7,
    "successful": 7,
    "failed": 0,
    "idChanges": 2
  },
  "details": {
    "successRate": "100.0%",
    "failedFixes": [],
    "needsUpdate": true,
    "recommendations": [
      "Quest IDs have changed. Consider updating the fix list in server.js."
    ]
  }
}
```

**Status Values:**
- `healthy` - All fixes applied successfully
- `unhealthy` - Some fixes failed to apply
- `unknown` - Server still starting, fixes not yet applied

## Current Quest Fixes

The following quests have manual fixes applied:

| Quest Name | Current ID | Purpose |
|------------|------------|---------|
| Introduction | `5d2495a886f77425cd51e403` | Clear prerequisites |
| Bad Rep Evidence | `5967530a86f77462ba22226b` | Set to "Any Location" |
| The Walls Have Eyes | `669fa39c64ea11e84c0642a6` | Fix WI-FI Camera requirements (FIR) |
| Rough Tarkov | `66b38c7bf85b8bf7250f9cb6` | Set to "Any Location" |
| The Guide | `5c0d4e61d09282029f53920e` | Set to "Any Location" |
| Informed Means Armed | `5b47926a86f7747ccc057c15` | Set to "Any Location" + WI-FI Camera (any) |
| Lend-Lease - Part 1 | `5b4794cb86f774598100d5d4` | Set to "Any Location" |

## How It Works

### Quest Lookup Algorithm

```
1. Try to find quest by ID
   ├─ Found? → Apply fix
   └─ Not found? → Continue to step 2

2. Try exact name match
   ├─ Found? → Compare IDs, log if changed, apply fix
   └─ Not found? → Continue to step 3

3. Try case-insensitive name match
   ├─ Found? → Compare IDs, log if changed, apply fix
   └─ Not found? → Continue to step 4

4. Try normalized name match (remove special chars)
   ├─ Found? → Compare IDs, log if changed, apply fix
   └─ Not found? → Log as failed
```

### Name Normalization
Names are normalized by:
- Converting to lowercase
- Removing all non-alphanumeric characters
- This allows matching "Lend Lease" with "Lend-Lease"

## Monitoring

### Production Monitoring
You can monitor quest fix health in production:

```bash
# Basic health check
curl https://your-app.com/health

# Detailed quest fix check
curl https://your-app.com/health/quest-fixes
```

### CI/CD Integration
Add health checks to your deployment pipeline:

```yaml
# Example GitHub Actions step
- name: Check Quest Fixes
  run: |
    RESPONSE=$(curl -s https://your-app.com/health/quest-fixes)
    STATUS=$(echo $RESPONSE | jq -r '.status')
    if [ "$STATUS" = "unhealthy" ]; then
      echo "Warning: Quest fixes are unhealthy"
      echo $RESPONSE | jq .
    fi
```

## Updating Quest IDs

When you see ID change warnings in logs:

1. Check `/health/quest-fixes` endpoint
2. Note the new IDs from the logs or response
3. Update `server.js` in the `applyQuestFixes()` function:

```javascript
{
    name: 'Quest Name',
    id: 'NEW_ID_HERE', // Update this
    data: { /* fix data */ }
}
```

4. Commit and deploy

## Benefits

✅ **Resilient**: Continues working even when quest IDs change  
✅ **Self-Healing**: Automatically finds quests by name if ID is outdated  
✅ **Transparent**: Detailed logging shows exactly what's happening  
✅ **Monitorable**: Health check endpoints for production monitoring  
✅ **Developer-Friendly**: Clear warnings show which IDs need updating  
✅ **Zero Downtime**: Fixes still apply while you update IDs  

## Troubleshooting

### "Quest not found by name either"
- The quest may have been removed from the game
- The quest name may have changed
- The quest may no longer be Kappa-required
- Check Tarkov.dev API or wiki for quest status

### "Quest ID has changed"
- Normal after Tarkov updates
- Fixes still apply successfully
- Update IDs when convenient to clean up logs

### Health check shows "degraded"
- Some fixes failed or IDs changed
- Check detailed logs for specifics
- System still operational, but needs attention

## Technical Details

### Global State
Quest fix status is stored in `global.questFixStatus` and includes:
- `timestamp`: When fixes were last applied
- `total`: Total number of fixes attempted
- `successful`: Number of successful fixes
- `failed`: Number of failed fixes
- `idChanges`: Number of ID mismatches detected
- `failedFixes`: Array of failed fix details

### Performance
- ID lookup: O(1) - Database indexed query
- Name lookup: O(n) - Scans all quests if needed
- Runs once at startup, minimal performance impact
- Cached in global state for health checks

