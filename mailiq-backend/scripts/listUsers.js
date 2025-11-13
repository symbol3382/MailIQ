#!/usr/bin/env node

/**
 * List All Users Script
 * 
 * Usage: node scripts/listUsers.js
 * 
 * This script lists all users in the database with their IDs
 * Useful for finding user IDs to run the sync script
 */

// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../src/models/User');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    white: '\x1b[37m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function listUsers() {
    try {
        log('\n📋 Fetching users from database...', colors.blue);

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        log('✓ Connected to MongoDB\n', colors.green);

        // Fetch all users
        const users = await User.find({}).select('_id email name createdAt').lean();

        if (users.length === 0) {
            log('No users found in the database.', colors.yellow);
            await mongoose.connection.close();
            process.exit(0);
        }

        log(`Found ${users.length} user(s)\n`, colors.bright + colors.green);

        // Format data for console.table
        const tableData = users.map((user, index) => ({
            'Name': user.name,
            'Email': user.email,
            'User ID': user._id.toString(),
        }));

        console.table(tableData);

        log('\n💡 To sync emails for a user, run:', colors.yellow);
        log(`   node scripts/syncUserEmails.js <userId>\n`, colors.cyan);
        log('Example:', colors.yellow);
        log(`   node scripts/syncUserEmails.js ${users[0]._id}\n`, colors.cyan);

        // Close database connection
        await mongoose.connection.close();

    } catch (error) {
        log(`\n✗ Error: ${error.message}`, colors.red);
        console.error(error);

        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }

        process.exit(1);
    }
}

// Execute
if (require.main === module) {
    listUsers();
}

module.exports = { listUsers };

