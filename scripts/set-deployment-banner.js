const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setDeploymentBanner() {
    try {
        const settings = await prisma.siteSettings.upsert({
            where: { id: 'default' },
            update: {
                bannerEnabled: true,
                bannerMessage: '🚀 New version deploying! The site will be back online shortly. Please wait a moment...',
                bannerUpdatedBy: 'System'
            },
            create: {
                id: 'default',
                bannerEnabled: true,
                bannerMessage: '🚀 New version deploying! The site will be back online shortly. Please wait a moment...',
                bannerUpdatedBy: 'System'
            }
        });
        
        console.log('✅ Deployment banner set successfully!');
        console.log('Message:', settings.bannerMessage);
    } catch (error) {
        console.error('❌ Error setting deployment banner:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

setDeploymentBanner();

