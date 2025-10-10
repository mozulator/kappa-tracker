/**
 * Manual Migration Runner for Render
 * Run this if automatic migrations aren't working
 * 
 * Usage: node run-manual-migration.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigrations() {
    console.log('🔄 Starting manual migrations...\n');
    
    try {
        // Migration 1: Add tarkovDevId
        console.log('📝 Adding tarkovDevId column...');
        await prisma.$executeRawUnsafe(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='users' AND column_name='tarkovDevId') THEN
                    ALTER TABLE "users" ADD COLUMN "tarkovDevId" TEXT;
                    RAISE NOTICE 'Column tarkovDevId added';
                ELSE
                    RAISE NOTICE 'Column tarkovDevId already exists';
                END IF;
            END $$;
        `);
        console.log('✅ tarkovDevId migration complete\n');

        // Migration 2: Add avatarUrl
        console.log('📝 Adding avatarUrl column...');
        await prisma.$executeRawUnsafe(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='users' AND column_name='avatarUrl') THEN
                    ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;
                    RAISE NOTICE 'Column avatarUrl added';
                ELSE
                    RAISE NOTICE 'Column avatarUrl already exists';
                END IF;
            END $$;
        `);
        console.log('✅ avatarUrl migration complete\n');

        // Verify columns exist
        console.log('🔍 Verifying columns...');
        const result = await prisma.$queryRawUnsafe(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
              AND column_name IN ('tarkovDevId', 'avatarUrl')
            ORDER BY column_name;
        `);
        
        console.log('📊 Current columns:');
        console.table(result);
        
        if (result.length === 2) {
            console.log('\n✅ All migrations completed successfully!');
        } else {
            console.log('\n⚠️  Warning: Expected 2 columns, found', result.length);
        }
        
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

runMigrations();

