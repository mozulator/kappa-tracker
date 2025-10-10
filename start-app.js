#!/usr/bin/env node

console.log('=== STARTUP SCRIPT STARTING ===');
console.log('Node.js version:', process.version);
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', process.env.PORT || 3000);

// Run migrations first
console.log('Running database migrations...');
const { execSync } = require('child_process');

try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations completed successfully');
} catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
}

// Start the server
console.log('Starting server...');
require('./server.js');
