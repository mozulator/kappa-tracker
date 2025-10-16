const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearDeploymentBanner() {
    try {
        const settings = await prisma.siteSettings.upsert({
            where: { id: 'default' },
            update: {
                bannerEnabled: false,
                bannerMessage: null,
                bannerUpdatedBy: 'System'
            },
            create: {
                id: 'default',
                bannerEnabled: false,
                bannerMessage: null,
                bannerUpdatedBy: 'System'
            }
        });
        
        console.log('✅ Deployment banner cleared successfully!');
    } catch (error) {
        console.error('❌ Error clearing deployment banner:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

clearDeploymentBanner();

