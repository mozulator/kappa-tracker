/**
 * Quick production version checker
 * This will tell us what version is actually running
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVersion() {
    console.log('🔍 Checking Production Version...\n');
    
    try {
        // Check 1: Do the database columns exist?
        console.log('1️⃣ Checking Database Schema...');
        const columns = await prisma.$queryRawUnsafe(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
              AND column_name IN ('tarkovDevId', 'avatarUrl')
            ORDER BY column_name;
        `);
        
        console.log(`   Found ${columns.length}/2 new columns:`, columns.map(c => c.column_name));
        
        if (columns.length < 2) {
            console.log('   ❌ MIGRATIONS NOT APPLIED\n');
        } else {
            console.log('   ✅ Database schema is updated\n');
        }
        
        // Check 2: Check quest data for fixes
        console.log('2️⃣ Checking Quest Fixes...');
        const quests = await prisma.quest.findMany({
            where: {
                id: {
                    in: [
                        '5967530a86f77462ba22226b', // Bad Rep Evidence
                        '669fa39c64ea11e84c0642a6', // Walls Have Eyes
                        '66b38c7bf85b8bf7250f9cb6', // Rough Tarkov
                        '5c0d4e61d09282029f53920e'  // The Guide
                    ]
                }
            },
            select: {
                name: true,
                mapName: true,
                requiredItems: true
            }
        });
        
        console.log('   Quest Fix Status:');
        quests.forEach(q => {
            console.log(`   - ${q.name}: ${q.mapName}`);
            if (q.name === 'The Walls Have Eyes') {
                const items = JSON.parse(q.requiredItems);
                const camera = items.find(i => i.name === 'WI-FI Camera');
                console.log(`     WiFi Cameras: ${camera?.count || 0}`);
            }
        });
        
        // Check 3: Count total quests
        console.log('\n3️⃣ Quest Counts...');
        const totalQuests = await prisma.quest.count();
        const kappaQuests = await prisma.quest.count({ where: { requiredForKappa: true } });
        console.log(`   Total: ${totalQuests}, Kappa: ${kappaQuests}`);
        
        // Check 4: Server version check
        console.log('\n4️⃣ Code Version Check...');
        console.log(`   Server file exists: ${require('fs').existsSync('./server.js')}`);
        console.log(`   Public profile exists: ${require('fs').existsSync('./public-profile.html')}`);
        
        console.log('\n' + '='.repeat(50));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkVersion();

