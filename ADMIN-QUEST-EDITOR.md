# Admin Quest Editor

## Overview
A comprehensive quest editing interface for administrators to manually fix and override quest parameters. This tool allows you to correct issues with quest data from the Tarkov.dev API or add custom requirements.

## Access
**Admin Only** - Only users with `isAdmin: true` can access this feature.

### How to Access
1. Log in as an admin user
2. The "Fix Quests" button will appear in the main navigation (between "Finished Quests" and "Rankings")
3. Click "Fix Quests" to open the editor at `/admin-quest-editor.html`

## Features

### Quest Search & Selection
- **Live Search**: Filter quests by name or trader
- **Quest List**: All quests displayed with trader, level, and map info
- **Quick Selection**: Click any quest to start editing

### Editable Parameters

#### 1. **Map Location**
- Dropdown with all Tarkov maps
- Options: Any Location, Customs, Woods, Shoreline, Interchange, Reserve, Factory, The Lab, Lighthouse, Streets of Tarkov, Ground Zero
- Use "Any Location" for multi-map quests or quests that can be completed anywhere

#### 2. **Prerequisite Quests**
- **Searchable Dropdown**: Type to find quests
- **Multiple Selection**: Add as many prerequisite quests as needed
- **Visual Tags**: Selected quests shown as removable tags
- **Prevents Duplicates**: Won't show already selected quests or the current quest
- **Easy Removal**: Click X on any tag to remove prerequisite

#### 3. **Required Items**

##### Simple Editors (Common Items):
- **MS2000 Markers**: Set quantity needed
- **Signal Jammers**: Set quantity needed
- **WI-FI Cameras**: Set quantity needed
- **Keys**: Add multiple keys with names and quantities
  - Click "+ Add Key" to add new key entry
  - Each key has name and count fields
  - Remove keys with trash icon

##### Advanced JSON Editor:
- Edit the complete `requiredItems` JSON array
- Full control over all item properties
- JSON format:
```json
[
  {
    "name": "Item Name",
    "count": 1,
    "category": "fir|keys|markers|jammers|any",
    "type": "giveItem|plantItem|mark|key"
  }
]
```

## Usage Examples

### Example 1: Fix Quest Map Location
**Problem**: "Informed Means Armed" is showing as Customs but can be done on any map.

**Solution**:
1. Search for "Informed Means Armed"
2. Click on the quest
3. Change "Map Name" dropdown to "Any Location"
4. Click "Save Changes"

### Example 2: Add Missing Keys
**Problem**: "Checking" quest needs Dorm Room 114 key but it's not showing.

**Solution**:
1. Search for "Checking"
2. Click "+ Add Key"
3. Enter "Dorm Room 114" in name field
4. Set count to 1
5. Click "Save Changes"

### Example 3: Fix Prerequisite Quests
**Problem**: Quest shows wrong prerequisites.

**Solution**:
1. Select the quest
2. In "Prerequisite Quests" section, type to search
3. Click on correct prerequisite quests to add them
4. Remove wrong ones by clicking X
5. Click "Save Changes"

### Example 4: Set Multiple Markers
**Problem**: Quest needs 3 markers but showing 1.

**Solution**:
1. Select the quest
2. Set "MS2000 Markers" to 3
3. Click "Save Changes"

## How It Works

### Simple Mode (Recommended)
- Use the dedicated fields for markers, jammers, cameras, and keys
- System automatically builds the correct JSON structure
- Easiest for common quest requirements

### Advanced Mode
- Edit the raw JSON in the "Custom Required Items" textarea
- Takes priority over simple mode if valid JSON is present
- Use for complex requirements or special cases

### Data Priority
1. If Advanced JSON is valid → Uses that
2. If Advanced JSON is invalid → Uses Simple Mode inputs
3. Validates all data before saving

## Technical Details

### API Endpoints

#### Update Quest
```
PUT /api/admin/quests/:questId
```

**Request Body:**
```json
{
  "mapName": "Any Location",
  "prerequisiteQuests": "[\"quest-id-1\", \"quest-id-2\"]",
  "requiredItems": "[{\"name\":\"Key\",\"count\":1,\"category\":\"keys\"}]"
}
```

**Response:**
```json
{
  "message": "Quest updated successfully",
  "quest": { /* updated quest object */ }
}
```

#### Get Single Quest
```
GET /api/admin/quests/:questId
```

### Security
- All endpoints require admin authentication (`requireAdmin` middleware)
- Only users with `isAdmin: true` can access
- All changes are logged with admin username
- Page checks admin status on load and redirects if not admin

### Validation
- **JSON Validation**: Both `prerequisiteQuests` and `requiredItems` must be valid JSON
- **Quest Existence**: Validates quest exists before updating
- **Error Handling**: Clear error messages if validation fails

## Item Categories

### Category Types
- `fir` - Found in Raid items
- `keys` - Keys and keycards
- `markers` - MS2000 Markers
- `jammers` - Signal Jammers
- `any` - Any item (FIR not required)

### Type Types
- `giveItem` - Turn in item to trader
- `plantItem` - Place item in location
- `mark` - Mark location with marker
- `key` - Key required for access
- `findItem` - Find and survive (usually ignored in counting)

## UI Features

### Success/Error Alerts
- Green alert on successful save
- Red alert on error
- Auto-disappears after 5 seconds

### Visual Feedback
- Selected quest highlights in gold
- Active editor section expands smoothly
- Hover effects on all clickable elements
- Loading spinners during operations

### Responsive Design
- Works on all screen sizes
- Mobile-friendly interface
- Scrollable quest list
- Proper spacing and readability

## Troubleshooting

### "Quest updated successfully" but changes don't show
- Refresh the page to reload quest data
- Changes are saved but UI needs refresh

### "Invalid JSON" error
- Check your JSON syntax in Advanced editor
- Make sure all quotes and brackets match
- Try using Simple Mode instead

### "Access denied" message
- You're not logged in as admin
- Contact administrator to grant admin access
- Check isAdmin field in user database

### Keys not showing in quest list
- Keys are auto-extracted from `requiredItems`
- Check category is set to "keys"
- Ensure count is greater than 0
- Keys display in the overview stats when viewing available quests

## Keys Functionality

### How Keys Work
Keys are stored in the `requiredItems` JSON field of each quest with:
- `category`: "keys"
- `name`: The key name (e.g., "Dorm Room 114")
- `count`: Usually 1 (some quests might need duplicates)

### Where Keys Display
Keys show in the main tracker interface:
- **Overview Stats Section**: "Keys needed" count and list
- **Only When Visible**: Keys display for currently available/active quests
- **Auto-Hidden**: When no available quests need keys, section is hidden

### Adding Keys via Editor
1. Open the quest in editor
2. Scroll to "Required Items" section
3. Click "+ Add Key"
4. Enter key name (e.g., "RB-BK Marked Key")
5. Set count (usually 1)
6. Save changes

### Example Key Format
```json
{
  "name": "Dorm Room 114 Key",
  "count": 1,
  "category": "keys",
  "type": "key"
}
```

## Best Practices

1. **Backup Before Changes**: Consider noting current values
2. **Test Small Changes**: Edit one thing at a time
3. **Use Simple Mode**: Unless you need advanced features
4. **Validate Results**: Check the main tracker after saving
5. **Document Changes**: Keep track of what you modify
6. **Check API First**: Quest issues might be fixed in API update

## Future Enhancements

Potential features for future versions:
- Bulk edit multiple quests
- Import/export quest fixes
- Undo/redo functionality
- Quest diff viewer (show what changed)
- Preset templates for common fixes
- Integration with quest fix system (auto-apply on startup)

## Related Systems

- **Quest Fix System** (`QUEST-FIX-SYSTEM.md`): Automated fixes applied at startup
- **Admin Routes** (`server.js`): Other admin-only endpoints
- **Quest Initialization** (`server.js`): How quests are fetched from API

---

**Note**: This editor provides complete control over quest parameters. Changes override API data and persist across server restarts. Use carefully and only when necessary to fix incorrect data.

