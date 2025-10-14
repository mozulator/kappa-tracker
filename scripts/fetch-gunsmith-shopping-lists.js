const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Web scraping setup
const https = require('https');
const http = require('http');

// Gunsmith quest names (Part 1-25)
const GUNSMITH_QUESTS = [
    'Gunsmith - Part 1',
    'Gunsmith - Part 2',
    'Gunsmith - Part 3',
    'Gunsmith - Part 4',
    'Gunsmith - Part 5',
    'Gunsmith - Part 6',
    'Gunsmith - Part 7',
    'Gunsmith - Part 8',
    'Gunsmith - Part 9',
    'Gunsmith - Part 10',
    'Gunsmith - Part 11',
    'Gunsmith - Part 12',
    'Gunsmith - Part 13',
    'Gunsmith - Part 14',
    'Gunsmith - Part 15',
    'Gunsmith - Part 16',
    'Gunsmith - Part 17',
    'Gunsmith - Part 18',
    'Gunsmith - Part 19',
    'Gunsmith - Part 20',
    'Gunsmith - Part 21',
    'Gunsmith - Part 22',
    'Gunsmith - Part 23',
    'Gunsmith - Part 24',
    'Gunsmith - Part 25'
];

// Helper to fetch HTML from URL
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Helper to fetch gun name from objectives section
async function fetchGunName(html) {
    try {
        // Find the Objectives section
        const objectivesMatch = html.match(/<span[^>]*id="Objectives"[^>]*>[\s\S]*?<\/span>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
        if (!objectivesMatch) {
            console.log('  ⚠️  No Objectives section found');
            return null;
        }
        
        // Look for "Modify" text and extract the gun link
        const modifyMatch = objectivesMatch[1].match(/Modify\s+(?:the\s+)?<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/i);
        if (!modifyMatch) {
            console.log('  ⚠️  No Modify instruction found');
            return null;
        }
        
        const gunName = modifyMatch[2].trim();
        console.log(`  🔫 Found gun: ${gunName}`);
        return gunName;
        
    } catch (error) {
        console.log('  ⚠️  Error parsing gun name:', error.message);
        return null;
    }
}

// Parse wikitable to extract shopping list
function parseWikitable(html) {
    const shoppingList = [];
    
    // Find the wikitable section
    const wikitableMatch = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!wikitableMatch) {
        console.log('  ⚠️  No wikitable found');
        return shoppingList;
    }
    
    const tableHTML = wikitableMatch[1];
    
    // Extract rows (skip header)
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = [...tableHTML.matchAll(rowRegex)];
    
    for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i][1];
        
        // Extract cells
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells = [...row.matchAll(cellRegex)].map(m => m[1]);
        
        if (cells.length >= 4) {
            // Column order: Icon, Attachment, Sold By, Loyalty Level
            let attachmentName = cells[1];
            let soldBy = cells[2];
            let loyaltyLevel = cells[3];
            
            // Clean HTML tags
            attachmentName = attachmentName.replace(/<[^>]*>/g, '').trim();
            soldBy = soldBy.replace(/<[^>]*>/g, '').trim();
            loyaltyLevel = loyaltyLevel.replace(/<[^>]*>/g, '').trim();
            
            // Skip empty rows
            if (!attachmentName || attachmentName === '') continue;
            
            // Check if it's a barter
            const isBarter = loyaltyLevel.toLowerCase().includes('barter');
            
            // Parse loyalty level to number
            const levelMatch = loyaltyLevel.match(/\d+/);
            const level = levelMatch ? parseInt(levelMatch[0]) : 1;
            
            // Handle multiple traders - parse and choose the one with lower loyalty level
            let finalTrader = soldBy;
            let finalLevel = level;
            
            if (soldBy.includes('/') || soldBy.match(/[A-Z][a-z]+[A-Z]/)) {
                // Multiple traders detected (e.g., "MechanicPeacekeeper" or "Mechanic/Peacekeeper")
                const traderMatches = soldBy.match(/([A-Z][a-z]+)/g);
                if (traderMatches && traderMatches.length > 1) {
                    // Parse loyalty levels for each trader
                    const loyaltyMatches = [...loyaltyLevel.matchAll(/\d+/g)];
                    
                    if (loyaltyMatches.length >= traderMatches.length) {
                        // Find trader with lowest loyalty level
                        let minLevel = parseInt(loyaltyMatches[0][0]);
                        let minTrader = traderMatches[0];
                        
                        for (let j = 1; j < traderMatches.length; j++) {
                            const traderLevel = parseInt(loyaltyMatches[j][0]);
                            if (traderLevel < minLevel) {
                                minLevel = traderLevel;
                                minTrader = traderMatches[j];
                            }
                        }
                        
                        finalTrader = minTrader;
                        finalLevel = minLevel;
                    } else {
                        // Just use the first trader
                        finalTrader = traderMatches[0];
                    }
                }
            }
            
            shoppingList.push({
                name: attachmentName,
                trader: finalTrader,
                loyaltyLevel: finalLevel,
                isBarter: isBarter
            });
        }
    }
    
    return shoppingList;
}

async function fetchGunsmithShoppingListForQuest(questName) {
    try {
        console.log(`\n📋 Fetching shopping list for: ${questName}`);
        
        // Find quest in database
        const quest = await prisma.quest.findFirst({
            where: { name: questName }
        });
        
        if (!quest) {
            console.log(`❌ Quest not found in database: ${questName}`);
            return null;
        }
        
        if (!quest.wikiLink) {
            console.log(`❌ No wiki link for: ${questName}`);
            return null;
        }
        
        console.log(`🌐 Fetching from: ${quest.wikiLink}`);
        
        // Fetch the wiki page
        const html = await fetchHTML(quest.wikiLink);
        
        // Extract the gun name from objectives
        const gunName = await fetchGunName(html);
        
        // Parse the shopping list
        const shoppingList = parseWikitable(html);
        
        if (shoppingList.length === 0 && !gunName) {
            console.log(`⚠️  No shopping list or gun found for: ${questName}`);
            return null;
        }
        
        // Add gun as first item if found
        if (gunName) {
            shoppingList.unshift({
                name: gunName,
                trader: 'Base Weapon',
                loyaltyLevel: 1,
                isBarter: false
            });
        }
        
        console.log(`✅ Found ${shoppingList.length} items (${gunName ? '1 weapon + ' : ''}${shoppingList.length - (gunName ? 1 : 0)} attachments):`);
        shoppingList.forEach(item => {
            const barterTag = item.isBarter ? ' [BARTER]' : '';
            console.log(`   - ${item.name} (${item.trader} LL${item.loyaltyLevel}${barterTag})`);
        });
        
        return {
            questId: quest.id,
            shoppingList
        };
        
    } catch (error) {
        console.error(`Error fetching ${questName}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🔫 Fetching Gunsmith Shopping Lists from Wiki...\n');
    console.log('=' .repeat(60));
    
    const results = [];
    
    for (const questName of GUNSMITH_QUESTS) {
        const result = await fetchGunsmithShoppingListForQuest(questName);
        if (result) {
            results.push(result);
        }
        
        // Add a small delay to be respectful to the wiki server
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   Total Gunsmith quests: ${GUNSMITH_QUESTS.length}`);
    console.log(`   Successfully fetched: ${results.length}`);
    console.log(`   Failed: ${GUNSMITH_QUESTS.length - results.length}`);
    
    if (results.length > 0) {
        console.log('\n💾 Updating database...');
        
        for (const { questId, shoppingList } of results) {
            await prisma.quest.update({
                where: { id: questId },
                data: {
                    shoppingList: JSON.stringify(shoppingList)
                }
            });
        }
        
        console.log('✅ Database updated successfully!');
    }
    
    await prisma.$disconnect();
}

main().catch(console.error);

