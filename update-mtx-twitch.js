const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
        console.error('Error fetching Twitch avatar:', error);
        return null;
    }
}

async function updateMtxUser() {
    try {
        console.log('🔍 Finding mTx user...');

        const user = await prisma.user.findUnique({
            where: { username: 'mtx' }
        });

        if (!user) {
            console.log('❌ User "mTx" not found. Trying case-insensitive search...');
            
            // Try finding with case-insensitive search
            const users = await prisma.user.findMany();
            const mtxUser = users.find(u => u.username.toLowerCase() === 'mtx');
            
            if (!mtxUser) {
                console.log('❌ User not found at all.');
                return;
            }
            
            console.log(`✅ Found user: ${mtxUser.username} (${mtxUser.displayName || 'no display name'})`);
        } else {
            console.log(`✅ Found user: ${user.username}`);
        }

        const targetUser = user || await prisma.user.findFirst({
            where: {
                username: {
                    mode: 'insensitive',
                    equals: 'mtx'
                }
            }
        });

        if (!targetUser) {
            console.log('❌ Could not find user.');
            return;
        }

        console.log(`🔄 Updating Twitch info for ${targetUser.username}...`);

        const twitchName = 'mTx0925_';
        const twitchUrl = `https://twitch.tv/${twitchName}`;
        
        console.log(`📡 Fetching Twitch avatar for ${twitchName}...`);
        const avatarUrl = await fetchTwitchAvatar(twitchName);

        if (avatarUrl) {
            console.log(`✅ Got avatar: ${avatarUrl.substring(0, 60)}...`);
        } else {
            console.log('⚠️  Could not fetch avatar, but will still update Twitch info');
        }

        const updateData = {
            twitchName,
            twitchUrl
        };

        if (avatarUrl) {
            updateData.avatarUrl = avatarUrl;
        }

        await prisma.user.update({
            where: { id: targetUser.id },
            data: updateData
        });

        console.log('\n✅ Successfully updated mTx user:');
        console.log(`   Twitch Name: ${twitchName}`);
        console.log(`   Twitch URL: ${twitchUrl}`);
        if (avatarUrl) {
            console.log(`   Avatar URL: ${avatarUrl}`);
        }
        console.log('\n🎉 Done!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateMtxUser();

