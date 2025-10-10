const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
    try {
        console.log('🔧 Applying reports migration...');

        // Create reports table
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "reports" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "userId" TEXT NOT NULL,
                "type" TEXT NOT NULL,
                "title" TEXT NOT NULL,
                "description" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'pending',
                "adminNotes" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,
                CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
            );
        `);

        // Create indexes
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "reports_userId_idx" ON "reports"("userId");`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports"("status");`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "reports_type_idx" ON "reports"("type");`);

        console.log('✅ Reports table created successfully!');
        console.log('✅ Indexes created successfully!');

    } catch (error) {
        console.error('❌ Error applying migration:', error);
    } finally {
        await prisma.$disconnect();
    }
}

applyMigration();

