const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function to fetch Twitch avatar
async function fetchTwitchAvatar(twitchUsername) {
    try {
        const response = await fetch(`https://decapi.me/twitch/avatar/${twitchUsername}`);
        if (response.ok) {
            const avatarUrl = await response.text();
            if (avatarUrl && avatarUrl.startsWith('http')) {
                return avatarUrl.trim();
            }
        }
        return null;
    } catch (error) {
        console.error(`Error fetching Twitch avatar for ${twitchUsername}:`, error);
        return null;
    }
}

async function updateAllUserAvatars() {
    try {
        console.log('🔍 Finding users with Twitch names...');

        // Get all users who have a twitchName
        const users = await prisma.user.findMany({
            where: {
                twitchName: {
                    not: null
                }
            },
            select: {
                id: true,
                username: true,
                twitchName: true,
                avatarUrl: true
            }
        });

        console.log(`✅ Found ${users.length} users with Twitch names`);

        if (users.length === 0) {
            console.log('No users to update.');
            return;
        }

        let updated = 0;
        let failed = 0;

        for (const user of users) {
            console.log(`🔄 Fetching avatar for ${user.username} (Twitch: ${user.twitchName})...`);

            const avatarUrl = await fetchTwitchAvatar(user.twitchName);

            if (avatarUrl) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { avatarUrl }
                });
                console.log(`✅ Updated ${user.username} with avatar: ${avatarUrl.substring(0, 50)}...`);
                updated++;
            } else {
                console.log(`❌ Failed to fetch avatar for ${user.username}`);
                failed++;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log('\n📊 Summary:');
        console.log(`   ✅ Updated: ${updated}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log('\n🎉 Done!');

    } catch (error) {
        console.error('❌ Error updating avatars:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
updateAllUserAvatars();

