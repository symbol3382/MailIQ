#!/usr/bin/env node

/**
 * Standalone Email Sync Script
 * 
 * Usage: node scripts/syncUserEmails.js <userId>
 * Example: node scripts/syncUserEmails.js 507f1f77bcf86cd799439011
 * 
 * This script syncs emails for a specific user from Gmail to MongoDB
 * Can be run independently or via cron jobs
 */

// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const { google } = require('googleapis');
const User = require('../src/models/User');
const Email = require('../src/models/Email');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function getValidOAuthClient(user) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
        expiry_date: user.tokenExpiry?.getTime()
    });

    // Check if token is expired and refresh if needed
    if (user.tokenExpiry && new Date() >= user.tokenExpiry) {
        log('Access token expired, refreshing...', colors.yellow);
        const { credentials } = await oauth2Client.refreshAccessToken();

        user.accessToken = credentials.access_token;
        if (credentials.refresh_token) {
            user.refreshToken = credentials.refresh_token;
        }
        user.tokenExpiry = new Date(credentials.expiry_date);
        await user.save();

        oauth2Client.setCredentials(credentials);
        log('Token refreshed successfully', colors.green);
    }

    return oauth2Client;
}

async function syncEmails(userId) {
    try {
        log(`\n${'='.repeat(60)}`, colors.cyan);
        log('Email Sync Script Started', colors.bright + colors.cyan);
        log(`${'='.repeat(60)}\n`, colors.cyan);

        // Connect to MongoDB
        log('Connecting to MongoDB...', colors.blue);
        await mongoose.connect(process.env.MONGODB_URI);
        log('✓ Connected to MongoDB', colors.green);

        // Find user
        log(`\nFinding user with ID: ${userId}`, colors.blue);
        const user = await User.findById(userId);

        if (!user) {
            log(`✗ User not found with ID: ${userId}`, colors.red);
            process.exit(1);
        }

        log(`✓ Found user: ${user.name} (${user.email})`, colors.green);

        if (!user.refreshToken) {
            log('✗ User not authenticated with Gmail (no refresh token)', colors.red);
            process.exit(1);
        }

        // Setup Gmail API
        log('\nSetting up Gmail API...', colors.blue);
        const oauth2Client = await getValidOAuthClient(user);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        log('✓ Gmail API configured', colors.green);

        // Fetch all emails using pagination
        log('\n📧 Fetching emails from Gmail...', colors.bright + colors.blue);
        let allMessages = [];
        let pageToken = null;
        let pageCount = 0;

        do {
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 500,
                pageToken: pageToken,
                q: 'in:inbox OR in:sent OR in:drafts OR in:trash OR in:spam'
            });

            const messages = response.data.messages || [];
            allMessages = allMessages.concat(messages);
            pageToken = response.data.nextPageToken;
            pageCount++;

            log(`  Page ${pageCount}: ${messages.length} emails (Total: ${allMessages.length})`, colors.cyan);

        } while (pageToken);

        log(`\n✓ Total emails found in Gmail: ${allMessages.length}`, colors.green);

        if (allMessages.length === 0) {
            log('\nNo emails to sync. Exiting.', colors.yellow);
            await mongoose.connection.close();
            process.exit(0);
        }

        // Process emails
        log('\n💾 Processing and storing emails...', colors.bright + colors.blue);
        let syncedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        const batchSize = 1000;
        const totalBatches = Math.ceil(allMessages.length / batchSize);

        for (let i = 0; i < allMessages.length; i += batchSize) {
            const batch = allMessages.slice(i, i + batchSize);
            const currentBatch = Math.floor(i / batchSize) + 1;

            process.stdout.write(`  Processing batch ${currentBatch}/${totalBatches}... `);

            await Promise.all(batch.map(async (message) => {
                try {
                    // Check if email already exists
                    const existingEmail = await Email.findOne({ gmailId: message.id });

                    if (existingEmail) {
                        skippedCount++;
                        return;
                    }

                    // Fetch full message details
                    const fullMessage = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    const headers = fullMessage.data.payload.headers;
                    const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                    const from = headers.find(h => h.name === 'From')?.value || '';
                    const to = headers.find(h => h.name === 'To')?.value || '';
                    const dateHeader = headers.find(h => h.name === 'Date')?.value;

                    // Extract body
                    let body = fullMessage.data.snippet;

                    if (fullMessage.data.payload.body?.data) {
                        body = Buffer.from(fullMessage.data.payload.body.data, 'base64').toString('utf-8');
                    } else if (fullMessage.data.payload.parts) {
                        const textPart = fullMessage.data.payload.parts.find(part => part.mimeType === 'text/plain');
                        if (textPart?.body?.data) {
                            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
                        }
                    }

                    const isRead = fullMessage.data.labelIds?.includes('UNREAD') ? false : true;
                    const isStarred = fullMessage.data.labelIds?.includes('STARRED') ? true : false;

                    // Create email document
                    await Email.create({
                        userId: user._id,
                        gmailId: fullMessage.data.id,
                        threadId: fullMessage.data.threadId,
                        from,
                        to,
                        subject,
                        snippet: fullMessage.data.snippet,
                        body,
                        date: dateHeader ? new Date(dateHeader) : new Date(fullMessage.data.internalDate),
                        labels: fullMessage.data.labelIds || [],
                        isRead,
                        isStarred
                    });
                    syncedCount++;

                } catch (emailError) {
                    console.error(`Error processing email ${message.id}:`, emailError.message);
                    errorCount++;
                    // Silent error handling in batch mode
                }
            }));

            process.stdout.write(`✓\n`);

            // Show progress for this batch
            log(`    Batch ${Math.floor(i / batchSize) + 1}: Processed ${Math.min(batchSize, allMessages.length - i)} emails | Total so far: ${syncedCount} synced | ${skippedCount} skipped | ${errorCount} errors`, colors.cyan);
        }

        // Clean up emails that no longer exist in Gmail
        log('\n🧹 Cleaning up emails that no longer exist in Gmail...', colors.bright + colors.blue);
        
        // Get all Gmail IDs from the fetched messages
        const gmailIdsFromGmail = new Set(allMessages.map(msg => msg.id));
        log(`  Total Gmail IDs from Gmail: ${gmailIdsFromGmail.size}`, colors.cyan);

        // Get all emails from database for this user
        const allDbEmails = await Email.find({ userId: user._id })
            .select('gmailId _id')
            .lean();

        log(`  Total emails in database: ${allDbEmails.length}`, colors.cyan);

        // Find emails in database that don't exist in Gmail anymore
        const emailsToDelete = allDbEmails.filter(dbEmail => {
            // Only delete if email has a gmailId and it's not in the current Gmail list
            return dbEmail.gmailId && !gmailIdsFromGmail.has(dbEmail.gmailId);
        });

        let deletedCount = 0;

        if (emailsToDelete.length > 0) {
            log(`  Found ${emailsToDelete.length} emails in database that no longer exist in Gmail`, colors.yellow);
            
            const emailsToDeleteIds = emailsToDelete.map(e => e._id);
            
            // Delete emails that no longer exist in Gmail
            const deleteResult = await Email.deleteMany({
                _id: { $in: emailsToDeleteIds },
                userId: user._id
            });

            deletedCount = deleteResult.deletedCount;
            log(`  ✓ Deleted ${deletedCount} emails from database`, colors.green);
        } else {
            log(`  ✓ No emails to delete - database is in sync with Gmail`, colors.green);
        }

        // Final summary
        log(`\n${'='.repeat(60)}`, colors.cyan);
        log('Sync Summary', colors.bright + colors.green);
        log(`${'='.repeat(60)}`, colors.cyan);
        log(`  User: ${user.name} (${user.email})`, colors.white);
        log(`  Total emails in Gmail: ${allMessages.length}`, colors.white);
        log(`  ✓ New emails synced: ${syncedCount}`, colors.green);
        log(`  ⊘ Already existed: ${skippedCount}`, colors.yellow);
        if (deletedCount > 0) {
            log(`  ✗ Deleted from database: ${deletedCount} (no longer in Gmail)`, colors.red);
        }
        log(`  Total in database: ${allDbEmails.length - deletedCount}`, colors.white);
        if (errorCount > 0) {
            log(`  ✗ Errors: ${errorCount}`, colors.red);
        }
        log(`${'='.repeat(60)}\n`, colors.cyan);

        // Close database connection
        await mongoose.connection.close();
        log('✓ Database connection closed', colors.green);
        log('\n🎉 Email sync completed successfully!\n', colors.bright + colors.green);

        process.exit(0);

    } catch (error) {
        log(`\n✗ Error during sync: ${error.message}`, colors.red);
        console.error(error);

        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }

        process.exit(1);
    }
}

// Main execution
if (require.main === module) {
    const userId = process.argv[2];

    if (!userId) {
        log('\n❌ Error: User ID is required', colors.red);
        log('\nUsage:', colors.yellow);
        log('  node scripts/syncUserEmails.js <userId>', colors.cyan);
        log('\nExample:', colors.yellow);
        log('  node scripts/syncUserEmails.js 507f1f77bcf86cd799439011\n', colors.cyan);
        process.exit(1);
    }

    // Validate MongoDB ObjectId format
    if (!/^[a-f\d]{24}$/i.test(userId)) {
        log('\n❌ Error: Invalid MongoDB ObjectId format', colors.red);
        log(`Provided: ${userId}`, colors.yellow);
        log('Expected: 24 character hexadecimal string\n', colors.yellow);
        process.exit(1);
    }

    syncEmails(userId);
}

module.exports = { syncEmails };

