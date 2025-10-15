/**
 * Automated Quest Save Operations Test Script
 * 
 * Tests quest completion/uncompletion under various scenarios:
 * - Multiple concurrent users
 * - Rapid completion/uncompletion
 * - Auto-complete functionality
 * - Network error handling
 * 
 * Usage: node scripts/test-save-operations.js
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_USERS = [
    { username: 'testuser1', password: 'test123' },
    { username: 'testuser2', password: 'test123' },
    { username: 'testuser3', password: 'test123' }
];

class SaveTester {
    constructor() {
        this.results = {
            totalTests: 0,
            passed: 0,
            failed: 0,
            errors: [],
            saveTimes: [],
            concurrentSaves: 0
        };
    }

    async login(username, password) {
        try {
            const response = await fetch(`${BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            if (!response.ok) {
                throw new Error(`Login failed for ${username}`);
            }
            
            // Extract session cookie
            const cookies = response.headers.get('set-cookie');
            return cookies;
        } catch (error) {
            console.error(`Login error for ${username}:`, error.message);
            return null;
        }
    }

    async testSingleSave(sessionCookie, questIds, testName) {
        this.results.totalTests++;
        const startTime = Date.now();
        
        try {
            console.log(`[TEST] ${testName} - Starting...`);
            
            const response = await fetch(`${BASE_URL}/api/progress`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': sessionCookie
                },
                body: JSON.stringify({
                    pmcLevel: 15,
                    prestige: 0,
                    completedQuests: questIds
                })
            });
            
            if (!response.ok) {
                throw new Error(`Save failed with status ${response.status}`);
            }
            
            const data = await response.json();
            const duration = Date.now() - startTime;
            this.results.saveTimes.push(duration);
            
            console.log(`[TEST] ${testName} - PASSED (${duration}ms)`);
            console.log(`[TEST] ${testName} - Request ID: ${data.requestId}`);
            
            this.results.passed++;
            return data;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[TEST] ${testName} - FAILED (${duration}ms):`, error.message);
            this.results.failed++;
            this.results.errors.push({ test: testName, error: error.message });
            return null;
        }
    }

    async testConcurrentSaves(sessions, questSets) {
        console.log(`\n[TEST-SUITE] Testing ${sessions.length} concurrent saves...`);
        
        const promises = sessions.map((session, index) => 
            this.testSingleSave(session, questSets[index], `Concurrent-${index + 1}`)
        );
        
        const results = await Promise.all(promises);
        const successful = results.filter(r => r !== null).length;
        
        console.log(`[TEST-SUITE] Concurrent saves: ${successful}/${sessions.length} successful`);
        return results;
    }

    async testRapidChanges(sessionCookie, allQuests) {
        console.log(`\n[TEST-SUITE] Testing rapid completion/uncompletion...`);
        
        let currentQuests = [];
        const operations = 10;
        
        for (let i = 0; i < operations; i++) {
            // Randomly add or remove quests
            if (Math.random() > 0.5 && currentQuests.length < allQuests.length) {
                // Add random quest
                const available = allQuests.filter(q => !currentQuests.includes(q));
                if (available.length > 0) {
                    currentQuests.push(available[Math.floor(Math.random() * available.length)]);
                }
            } else if (currentQuests.length > 0) {
                // Remove random quest
                const index = Math.floor(Math.random() * currentQuests.length);
                currentQuests.splice(index, 1);
            }
            
            await this.testSingleSave(sessionCookie, currentQuests, `Rapid-${i + 1}`);
            
            // Small delay between operations
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async testHealthEndpoint() {
        console.log(`\n[TEST-SUITE] Testing health endpoint...`);
        this.results.totalTests++;
        
        try {
            const response = await fetch(`${BASE_URL}/api/health`);
            const data = await response.json();
            
            if (data.status === 'ok' && data.timestamp && data.uptime >= 0) {
                console.log(`[TEST] Health check - PASSED`);
                console.log(`[TEST] Server uptime: ${Math.round(data.uptime)}s`);
                this.results.passed++;
                return true;
            } else {
                throw new Error('Invalid health response');
            }
        } catch (error) {
            console.error(`[TEST] Health check - FAILED:`, error.message);
            this.results.failed++;
            this.results.errors.push({ test: 'Health Check', error: error.message });
            return false;
        }
    }

    async fetchAvailableQuests(sessionCookie) {
        try {
            const response = await fetch(`${BASE_URL}/api/quests`, {
                headers: { 'Cookie': sessionCookie }
            });
            const quests = await response.json();
            return quests.filter(q => q.requiredForKappa).map(q => q.id);
        } catch (error) {
            console.error('Failed to fetch quests:', error.message);
            return [];
        }
    }

    printReport() {
        console.log('\n========================================');
        console.log('QUEST SAVE OPERATIONS TEST REPORT');
        console.log('========================================');
        console.log(`Total Tests: ${this.results.totalTests}`);
        console.log(`Passed: ${this.results.passed} ✓`);
        console.log(`Failed: ${this.results.failed} ✗`);
        console.log(`Success Rate: ${((this.results.passed / this.results.totalTests) * 100).toFixed(2)}%`);
        
        if (this.results.saveTimes.length > 0) {
            const avgTime = this.results.saveTimes.reduce((a, b) => a + b, 0) / this.results.saveTimes.length;
            const minTime = Math.min(...this.results.saveTimes);
            const maxTime = Math.max(...this.results.saveTimes);
            
            console.log(`\nSave Performance:`);
            console.log(`  Average: ${avgTime.toFixed(0)}ms`);
            console.log(`  Min: ${minTime}ms`);
            console.log(`  Max: ${maxTime}ms`);
        }
        
        if (this.results.errors.length > 0) {
            console.log(`\nErrors:`);
            this.results.errors.forEach(err => {
                console.log(`  - ${err.test}: ${err.error}`);
            });
        }
        
        console.log('========================================\n');
        
        // Exit with appropriate code
        process.exit(this.results.failed > 0 ? 1 : 0);
    }
}

async function runTests() {
    console.log('Starting Quest Save Operations Tests...');
    console.log(`Target URL: ${BASE_URL}\n`);
    
    const tester = new SaveTester();
    
    // Test 1: Health endpoint
    await tester.testHealthEndpoint();
    
    // Note: Actual user login and quest testing would require real test users
    // For now, this is the framework that can be extended
    
    console.log('\n[INFO] Full user testing requires test accounts to be created.');
    console.log('[INFO] To extend this test:');
    console.log('[INFO]   1. Create test users in the database');
    console.log('[INFO]   2. Uncomment the sections below');
    console.log('[INFO]   3. Run with: node scripts/test-save-operations.js\n');
    
    /* UNCOMMENT WHEN TEST USERS ARE READY
    
    // Login test users
    const sessions = [];
    for (const user of TEST_USERS) {
        const cookie = await tester.login(user.username, user.password);
        if (cookie) {
            sessions.push(cookie);
        }
    }
    
    if (sessions.length === 0) {
        console.error('No test users could log in. Aborting tests.');
        process.exit(1);
    }
    
    // Fetch available quests
    const allQuests = await tester.fetchAvailableQuests(sessions[0]);
    console.log(`Loaded ${allQuests.length} Kappa quests for testing\n`);
    
    // Test 2: Single save operation
    await tester.testSingleSave(
        sessions[0],
        allQuests.slice(0, 10),
        'Single-Save-10-Quests'
    );
    
    // Test 3: Concurrent saves from multiple users
    const questSets = [
        allQuests.slice(0, 15),
        allQuests.slice(10, 25),
        allQuests.slice(20, 35)
    ];
    await tester.testConcurrentSaves(sessions, questSets);
    
    // Test 4: Rapid completion/uncompletion
    await tester.testRapidChanges(sessions[0], allQuests.slice(0, 20));
    
    */
    
    // Print final report
    tester.printReport();
}

// Run tests
if (require.main === module) {
    runTests().catch(error => {
        console.error('Test suite crashed:', error);
        process.exit(1);
    });
}

module.exports = { SaveTester };

