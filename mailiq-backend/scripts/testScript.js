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

const getLabels = async () => {
    const labels = await gmail.users.labels.list({
        userId: 'me'
    });
    // console.log(labels);
    // console.log(JSON.stringify(labels, null, 2));

    return labels.data.labels;
}

const getMessagesByLabel = async (labelId, labelName) => {
    let pageToken = null;
    let allMessages = [];
    do {

        const messages = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 500,
            labelIds: [labelId],
            pageToken: pageToken
        });

        allMessages = allMessages.concat(messages.data.messages);
        pageToken = messages.data.nextPageToken;
    } while (pageToken);

    console.log('Label: ' +labelId + ' (' + labelName + ') has ' + allMessages.length + ' messages');
    return allMessages;
}

let gmail = null;

const main = async (userId) => {
    await mongoose.connect(process.env.MONGODB_URI);
    log('✓ Connected to MongoDB', colors.green);
    const user = await User.findById(userId);
    if (!user) {
        log(`\n✗ Error: User not found`, colors.red);
        process.exit(1);
    }

    const oauth2Client = await getValidOAuthClient(user);
    gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const labels = await getLabels();

    let allMessages = [];

    await Promise.all(labels.map(async (label) => {
        const messages = await getMessagesByLabel(label.id, label.name);
        if(messages.filter(Boolean).length > 0) {
            allMessages = allMessages.concat(messages);
        }
    }));

    console.log('Total messages: ' + allMessages.length, allMessages.filter(Boolean).length);

    process.exit(0);
}

// Main execution
if (require.main === module) {
    const userId = process.argv[2];

    if (!userId) {
        log('\n❌ Error: User ID is required', colors.red);
        log('\nUsage:', colors.yellow);
        log('  node scripts/getSingleMessage.js <userId> <messageId>', colors.cyan);
        log('\nExample:', colors.yellow);
        log('  node scripts/getSingleMessage.js 507f1f77bcf86cd799439011 185d35c7e885f096\n', colors.cyan);
        process.exit(1);
    }

    // Validate MongoDB ObjectId format
    if (!/^[a-f\d]{24}$/i.test(userId)) {
        log('\n❌ Error: Invalid MongoDB ObjectId format', colors.red);
        log(`Provided: ${userId}`, colors.yellow);
        log('Expected: 24 character hexadecimal string\n', colors.yellow);
        process.exit(1);
    }

    // Connect to MongoDB
    log('Connecting to MongoDB...', colors.blue);

    main(userId);

}
