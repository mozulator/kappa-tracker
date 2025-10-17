const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function viewReports() {
    try {
        const reports = await prisma.report.findMany({
            include: {
                user: {
                    select: {
                        username: true,
                        displayName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log('\n========================================');
        console.log(`TOTAL REPORTS: ${reports.length}`);
        console.log('========================================\n');

        reports.forEach((report, index) => {
            console.log(`\n[${index + 1}] ID: ${report.id}`);
            console.log(`Type: ${report.type.toUpperCase()}`);
            console.log(`Status: ${report.status}`);
            console.log(`Title: ${report.title}`);
            console.log(`Description: ${report.description}`);
            console.log(`Quest Name: ${report.questName || 'N/A'}`);
            console.log(`Quest ID: ${report.questId || 'N/A'}`);
            console.log(`User: ${report.user.displayName || report.user.username}`);
            console.log(`Created: ${new Date(report.createdAt).toLocaleString()}`);
            console.log('----------------------------------------');
        });

        console.log('\n\n========================================');
        console.log('SUMMARY BY TYPE:');
        console.log('========================================');
        const bugCount = reports.filter(r => r.type === 'bug').length;
        const featureCount = reports.filter(r => r.type === 'feature').length;
        const questErrorCount = reports.filter(r => r.type === 'quest-error').length;
        console.log(`Bugs: ${bugCount}`);
        console.log(`Features: ${featureCount}`);
        console.log(`Quest Errors: ${questErrorCount}`);
        console.log('\n');

    } catch (error) {
        console.error('Error fetching reports:', error);
    } finally {
        await prisma.$disconnect();
    }
}

viewReports();

