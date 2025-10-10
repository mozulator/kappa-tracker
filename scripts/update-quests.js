/**
 * Comprehensive Quest Update Script
 * 
 * This script fetches all quests from Tarkov.dev API and scrapes detailed information
 * from the EFT Wiki including:
 * - Quest objectives
 * - Required keys
 * - Required markers (MS2000)
 * - Required jammers (Signal Jammer)
 * - Required cameras (WI-FI Camera)
 * - Found in Raid (FIR) items
 * 
 * Usage: node scripts/update-quests.js
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const prisma = new PrismaClient();

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// GraphQL query to fetch all quests from Tarkov.dev
const QUESTS_QUERY = `
{
  tasks {
    id
    name
    trader {
      name
    }
    map {
      name
    }
    experience
    wikiLink
    minPlayerLevel
    taskRequirements {
      task {
        id
      }
    }
    kappaRequired
  }
}
`;

/**
 * Fetch all quests from Tarkov.dev API
 */
async function fetchQuestsFromAPI() {
    console.log('📡 Fetching quests from Tarkov.dev API...\n');
    
    try {
        const response = await axios.post('https://api.tarkov.dev/graphql', {
            query: QUESTS_QUERY
        });

        const quests = response.data.data.tasks;
        console.log(`✅ Fetched ${quests.length} quests from API\n`);
        return quests;
    } catch (error) {
        console.error('❌ Error fetching quests from API:', error.message);
        throw error;
    }
}

/**
 * Scrape quest objectives from wiki page
 */
async function scrapeObjectives(wikiLink) {
    if (!wikiLink) return [];
    
    try {
        const response = await axios.get(wikiLink);
        const $ = cheerio.load(response.data);
        
        const objectives = [];
        const objectivesSection = $('#Objectives').parent().next('ul');
        
        objectivesSection.find('li').each((i, elem) => {
            const text = $(elem).text().trim();
            if (text && !text.includes('Objective:')) {
                objectives.push(text);
            }
        });
        
        return objectives;
    } catch (error) {
        console.error(`  ⚠️  Failed to scrape objectives: ${error.message}`);
        return [];
    }
}

/**
 * Scrape required keys from wiki page
 */
async function scrapeKeys(wikiLink) {
    if (!wikiLink) return [];
    
    try {
        const response = await axios.get(wikiLink);
        const $ = cheerio.load(response.data);
        
        const keys = [];
        $('.wikitable').each((i, table) => {
            $(table).find('a').each((j, link) => {
                const href = $(link).attr('href');
                if (href && href.endsWith('_key')) {
                    const displayName = $(link).text().trim();
                    if (!displayName) return;
                    
                    const keyName = href.split('/').pop().replace('_key', '');
                    if (keyName && !keys.some(k => k.name === keyName)) {
                        keys.push({
                            name: keyName,
                            displayName: displayName,
                            type: 'key'
                        });
                    }
                }
            });
        });
        
        return keys;
    } catch (error) {
        console.error(`  ⚠️  Failed to scrape keys: ${error.message}`);
        return [];
    }
}

/**
 * Scrape required items (markers, jammers, cameras) from wiki page
 */
async function scrapeRequiredItems(wikiLink) {
    if (!wikiLink) return { markers: [], jammers: [], cameras: [] };
    
    try {
        const response = await axios.get(wikiLink);
        const $ = cheerio.load(response.data);
        
        const markers = [];
        const jammers = [];
        const cameras = [];
        
        $('.wikitable').each((i, table) => {
            $(table).find('tr').each((j, row) => {
                const $row = $(row);
                const itemLink = $row.find('a[href*="/wiki/"]').attr('href');
                
                if (!itemLink) return;
                
                // Check for MS2000 Marker
                if (itemLink.includes('/wiki/MS2000_Marker')) {
                    const itemName = $row.find('a[title]').first().attr('title') || 'MS2000 Marker';
                    const amountText = $row.find('td').eq(1).text().trim();
                    const amount = parseInt(amountText) || 1;
                    
                    markers.push({
                        name: 'MS2000_Marker',
                        displayName: itemName,
                        type: 'markers',
                        count: amount
                    });
                }
                
                // Check for Signal Jammer
                if (itemLink.includes('/wiki/Signal_Jammer')) {
                    const itemName = $row.find('a[title]').first().attr('title') || 'Signal Jammer';
                    const amountText = $row.find('td').eq(1).text().trim();
                    const amount = parseInt(amountText) || 1;
                    
                    jammers.push({
                        name: 'Signal_Jammer',
                        displayName: itemName,
                        type: 'jammers',
                        count: amount
                    });
                }
                
                // Check for WI-FI Camera
                if (itemLink.includes('/wiki/WI-FI_Camera')) {
                    const itemName = $row.find('a[title]').first().attr('title') || 'WI-FI Camera';
                    const amountText = $row.find('td').eq(1).text().trim();
                    const amount = parseInt(amountText) || 1;
                    
                    cameras.push({
                        name: 'WI-FI_Camera',
                        displayName: itemName,
                        type: 'cameras',
                        count: amount
                    });
                }
            });
        });
        
        return { markers, jammers, cameras };
    } catch (error) {
        console.error(`  ⚠️  Failed to scrape items: ${error.message}`);
        return { markers: [], jammers: [], cameras: [] };
    }
}

/**
 * Extract FIR items from objectives
 */
function extractFirItems(objectives) {
    const firItems = [];
    
    objectives.forEach(obj => {
        // Match patterns like "Find X [item name] in raid" or "Find [item name] in raid"
        const match = obj.match(/Find\s(?:(\d+)\s)?(.+?)\s(?:in\sraid|in\sraid\s\d+\sitems?)/i);
        if (match) {
            const count = parseInt(match[1] || '1', 10);
            const itemName = match[2].trim();
            // Clean up item name (remove "any", "a", "an", "some")
            const cleanedItemName = itemName.replace(/^(any|a|an|some)\s/i, '').trim();
            
            firItems.push({
                name: cleanedItemName,
                displayName: cleanedItemName,
                category: 'fir',
                count: count
            });
        }
    });
    
    return firItems;
}

/**
 * Update a single quest in the database
 */
async function updateQuest(quest) {
    const questId = quest.id;
    const questName = quest.name;
    
    console.log(`📋 Processing: ${questName}`);
    
    // Prepare quest data
    const questData = {
        id: questId,
        name: questName,
        trader: quest.trader?.name || 'Unknown',
        level: quest.minPlayerLevel || 1,
        experience: quest.experience || 0,
        wikiLink: quest.wikiLink || null,
        requiredForKappa: quest.kappaRequired || false,
        mapName: quest.map?.name || 'Any Location',
        prerequisiteQuests: JSON.stringify(
            quest.taskRequirements?.map(req => req.task.id) || []
        )
    };
    
    // Scrape additional data if it's a Kappa quest
    let requiredItems = [];
    let objectives = [];
    
    if (quest.kappaRequired && quest.wikiLink) {
        console.log(`  🔍 Scraping additional data...`);
        
        // Scrape objectives
        objectives = await scrapeObjectives(quest.wikiLink);
        if (objectives.length > 0) {
            console.log(`  ✓ Found ${objectives.length} objectives`);
        }
        
        // Scrape keys
        const keys = await scrapeKeys(quest.wikiLink);
        if (keys.length > 0) {
            console.log(`  ✓ Found ${keys.length} keys`);
            requiredItems = [...requiredItems, ...keys];
        }
        
        // Scrape items (markers, jammers, cameras)
        const { markers, jammers, cameras } = await scrapeRequiredItems(quest.wikiLink);
        if (markers.length > 0) {
            console.log(`  ✓ Found ${markers.length} markers`);
            requiredItems = [...requiredItems, ...markers];
        }
        if (jammers.length > 0) {
            console.log(`  ✓ Found ${jammers.length} jammers`);
            requiredItems = [...requiredItems, ...jammers];
        }
        if (cameras.length > 0) {
            console.log(`  ✓ Found ${cameras.length} cameras`);
            requiredItems = [...requiredItems, ...cameras];
        }
        
        // Extract FIR items from objectives
        const firItems = extractFirItems(objectives);
        if (firItems.length > 0) {
            console.log(`  ✓ Found ${firItems.length} FIR items`);
            requiredItems = [...requiredItems, ...firItems];
        }
        
        // Add delay to avoid rate limiting
        await delay(500);
    }
    
    questData.objectives = JSON.stringify(objectives);
    questData.requiredItems = JSON.stringify(requiredItems);
    
    // Upsert quest in database
    await prisma.quest.upsert({
        where: { id: questId },
        update: questData,
        create: questData
    });
    
    console.log(`  ✅ Updated successfully\n`);
}

/**
 * Main update function
 */
async function updateAllQuests() {
    console.log('============================================================');
    console.log('🔄 QUEST UPDATE SCRIPT');
    console.log('============================================================\n');
    
    try {
        // Fetch quests from API
        const quests = await fetchQuestsFromAPI();
        
        // Process each quest
        console.log('📝 Processing quests...\n');
        for (let i = 0; i < quests.length; i++) {
            console.log(`[${i + 1}/${quests.length}]`);
            await updateQuest(quests[i]);
        }
        
        console.log('============================================================');
        console.log('✅ QUEST UPDATE COMPLETED SUCCESSFULLY!');
        console.log('============================================================');
        console.log(`📊 Summary:`);
        console.log(`   - Total quests processed: ${quests.length}`);
        console.log(`   - Kappa quests: ${quests.filter(q => q.kappaRequired).length}`);
        console.log('============================================================\n');
        
    } catch (error) {
        console.error('\n============================================================');
        console.error('❌ ERROR DURING UPDATE:');
        console.error('============================================================');
        console.error(error);
        console.error('============================================================\n');
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the update
updateAllQuests();

