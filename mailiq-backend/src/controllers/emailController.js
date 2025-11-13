const User = require('../models/User');
const Email = require('../models/Email');
const { google } = require('googleapis');
const OAuthUtils = require('../utils/oauth');

const EmailController = module.exports;


EmailController.syncEmails = async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user || !user.refreshToken) {
            return res.status(400).json({ error: 'User not authenticated with Gmail' });
        }

        const oauth2Client = await OAuthUtils.getValidOAuthClient(user);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Fetch ALL emails from Gmail using pagination
        let allMessages = [];
        let pageToken = null;
        let pageCount = 0;

        console.log('Starting to fetch all emails from Gmail...');

        // Loop through all pages to get all emails
        do {
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 500, // Maximum allowed by Gmail API per page
                pageToken: pageToken,
                q: 'in:inbox OR in:sent OR in:drafts OR in:trash OR in:spam' // Fetch from all folders
            });

            const messages = response.data.messages || [];
            console.log(response.data);
            allMessages = allMessages.concat(messages);
            pageToken = response.data.nextPageToken;
            pageCount++;

            console.log(`Fetched page ${pageCount}: ${messages.length} emails (Total so far: ${allMessages.length})`);

        } while (pageToken); // Continue until no more pages

        console.log(`Total emails fetched from Gmail: ${allMessages.length}`);

        let syncedCount = 0;
        let skippedCount = 0;

        // Process emails in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < allMessages.length; i += batchSize) {
            const batch = allMessages.slice(i, i + batchSize);

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

                    // Extract body (simplified - taking snippet for now)
                    let body = fullMessage.data.snippet;

                    // Try to get actual body if available
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

                    // Log progress every 50 emails
                    if (syncedCount % 50 === 0) {
                        console.log(`Progress: ${syncedCount} new emails synced, ${skippedCount} already exist`);
                    }
                } catch (emailError) {
                    console.error(`Error processing email ${message.id}:`, emailError.message);
                }
            }));
        }

        console.log(`Sync completed: ${syncedCount} new emails added, ${skippedCount} already existed`);

        // Get all Gmail IDs from the fetched messages
        const gmailIdsFromGmail = new Set(allMessages.map(msg => msg.id));
        console.log(`Total Gmail IDs from Gmail: ${gmailIdsFromGmail.size}`);

        // Get all emails from database for this user
        const allDbEmails = await Email.find({ userId: user._id })
            .select('gmailId _id')
            .lean();

        console.log(`Total emails in database: ${allDbEmails.length}`);

        // Find emails in database that don't exist in Gmail anymore
        const emailsToDelete = allDbEmails.filter(dbEmail => {
            // Only delete if email has a gmailId and it's not in the current Gmail list
            return dbEmail.gmailId && !gmailIdsFromGmail.has(dbEmail.gmailId);
        });

        let deletedCount = 0;

        if (emailsToDelete.length > 0) {
            console.log(`Found ${emailsToDelete.length} emails in database that no longer exist in Gmail`);
            
            const emailsToDeleteIds = emailsToDelete.map(e => e._id);
            
            // Delete emails that no longer exist in Gmail
            const deleteResult = await Email.deleteMany({
                _id: { $in: emailsToDeleteIds },
                userId: user._id
            });

            deletedCount = deleteResult.deletedCount;
            console.log(`Deleted ${deletedCount} emails from database that no longer exist in Gmail`);
        } else {
            console.log('No emails to delete - database is in sync with Gmail');
        }

        res.json({
            message: 'Emails synced successfully',
            synced: syncedCount,
            skipped: skippedCount,
            deleted: deletedCount,
            totalInGmail: allMessages.length,
            totalInDatabase: allDbEmails.length - deletedCount
        });

    } catch (error) {
        console.error('Email sync error:', error);
        res.status(500).json({ error: 'Failed to sync emails', details: error.message });
    }
}

EmailController.getEmails = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;

        const emails = await Email.find({ userId: req.userId })
            .sort({ date: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const count = await Email.countDocuments({ userId: req.userId });

        res.json({
            emails,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });

    } catch (error) {
        console.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
};

EmailController.getSingleEmail = async (req, res) => {
    try {
        const email = await Email.findOne({
            _id: req.params.id,
            userId: req.userId
        });

        if (!email) {
            return res.status(404).json({ error: 'Email not found' });
        }

        res.json({ email });

    } catch (error) {
        console.error('Error fetching email:', error);
        res.status(500).json({ error: 'Failed to fetch email' });
    }
}

// Helper function to extract domain from email string
const extractDomain = (emailString) => {
    if (!emailString) return 'Unknown';
    const emailMatch = emailString.match(/<(.+?)>|([^\s<>]+@[^\s<>]+)/);
    if (emailMatch) {
        const email = emailMatch[1] || emailMatch[2];
        const domain = email.split('@')[1];
        return domain || 'Unknown';
    }
    return 'Unknown';
};

// Helper function to extract clean email from email string
const extractEmail = (emailString) => {
    if (!emailString) return 'Unknown';
    const emailMatch = emailString.match(/<(.+?)>|([^\s<>]+@[^\s<>]+)/);
    if (emailMatch) {
        return emailMatch[1] || emailMatch[2];
    }
    return emailString;
};

// Get domain statistics from all emails
EmailController.getDomainStats = async (req, res) => {
    try {
        // Get all emails for the user (only from field for efficiency)
        const allEmails = await Email.find({ userId: req.userId })
            .select('from')
            .lean();

        const domainStats = {};

        allEmails.forEach((email) => {
            const domain = extractDomain(email.from);
            const fromEmail = extractEmail(email.from);

            if (!domainStats[domain]) {
                domainStats[domain] = {
                    domain,
                    emailCount: 0,
                    uniqueFroms: new Set()
                };
            }

            domainStats[domain].emailCount++;
            domainStats[domain].uniqueFroms.add(fromEmail);
        });

        // Convert to array and sort by email count
        const result = Object.values(domainStats)
            .map(stat => ({
                domain: stat.domain,
                emailCount: stat.emailCount,
                uniqueFromCount: stat.uniqueFroms.size
            }))
            .sort((a, b) => b.emailCount - a.emailCount);

        res.json({ domains: result, total: result.length });

    } catch (error) {
        console.error('Error fetching domain stats:', error);
        res.status(500).json({ error: 'Failed to fetch domain stats' });
    }
};

// Get froms for a specific domain
EmailController.getFromsForDomain = async (req, res) => {
    try {
        const { domain } = req.params;

        // Get all emails for the user from this domain
        const allEmails = await Email.find({ userId: req.userId })
            .select('from')
            .lean();

        const fromStats = {};

        allEmails.forEach((email) => {
            const emailDomain = extractDomain(email.from);
            const fromEmail = extractEmail(email.from);

            if (emailDomain === domain) {
                if (!fromStats[fromEmail]) {
                    fromStats[fromEmail] = {
                        from: fromEmail,
                        count: 0
                    };
                }
                fromStats[fromEmail].count++;
            }
        });

        // Convert to array and sort by count
        const result = Object.values(fromStats)
            .sort((a, b) => b.count - a.count);

        res.json({ froms: result, domain, total: result.length });

    } catch (error) {
        console.error('Error fetching froms for domain:', error);
        res.status(500).json({ error: 'Failed to fetch froms for domain' });
    }
};

// Get all emails from a specific from address
EmailController.getEmailsByFrom = async (req, res) => {
    try {
        const { fromEmail } = req.params;

        // Get all emails for the user and filter by from address
        const allEmails = await Email.find({ userId: req.userId })
            .select('from _id')
            .lean();

        // Find matching email IDs
        const matchingEmailIds = allEmails
            .filter(email => {
                const emailFrom = extractEmail(email.from);
                return emailFrom === fromEmail;
            })
            .map(e => e._id);

        if (matchingEmailIds.length === 0) {
            return res.json({
                emails: [],
                from: fromEmail,
                total: 0
            });
        }

        // Get full email details for matching emails
        const emails = await Email.find({
            _id: { $in: matchingEmailIds },
            userId: req.userId
        })
            .sort({ date: -1 })
            .lean();

        res.json({
            emails,
            from: fromEmail,
            total: emails.length
        });

    } catch (error) {
        console.error('Error fetching emails by from:', error);
        res.status(500).json({ error: 'Failed to fetch emails by from' });
    }
};

// Delete all emails from a specific from address
EmailController.deleteEmailsByFrom = async (req, res) => {
    try {
        const { fromEmail } = req.params;

        // Get user for OAuth
        const user = await User.findById(req.userId);
        if (!user || !user.refreshToken) {
            return res.status(400).json({ error: 'User not authenticated with Gmail' });
        }

        // Get all emails for the user and filter by from address
        const allEmails = await Email.find({ userId: req.userId })
            .select('from _id gmailId')
            .lean();

        // Find matching emails with their Gmail IDs
        const matchingEmails = allEmails.filter(email => {
            const emailFrom = extractEmail(email.from);
            return emailFrom === fromEmail;
        });

        if (matchingEmails.length === 0) {
            return res.json({
                message: 'No emails found to delete',
                deleted: 0
            });
        }

        // Get Gmail IDs for deletion
        const gmailIds = matchingEmails
            .filter(email => email.gmailId) // Only emails with Gmail ID
            .map(email => email.gmailId);

        let gmailDeletedCount = 0;
        let gmailErrors = [];

        // Delete from Gmail if we have Gmail IDs
        if (gmailIds.length > 0) {
            try {
                const oauth2Client = await OAuthUtils.getValidOAuthClient(user);
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                // Gmail batch delete can handle up to 1000 IDs at once
                const batchSize = 1000;
                for (let i = 0; i < gmailIds.length; i += batchSize) {
                    const batch = gmailIds.slice(i, i + batchSize);
                    
                    try {
                        await gmail.users.messages.batchDelete({
                            userId: 'me',
                            requestBody: {
                                ids: batch
                            }
                        });
                        gmailDeletedCount += batch.length;
                    } catch (gmailError) {
                        console.error(`Error deleting Gmail batch ${i}-${i + batch.length}:`, gmailError);
                        
                        // Check if it's an insufficient permissions error
                        if (gmailError.code === 403 && 
                            (gmailError.message?.includes('Insufficient Permission') || 
                             gmailError.message?.includes('insufficient_scope'))) {
                            gmailErrors.push('Insufficient permissions: User needs to re-authenticate with gmail.modify scope');
                            // Don't try individual deletion if it's a scope issue
                            break;
                        }
                        
                        gmailErrors.push(`Failed to delete ${batch.length} emails from Gmail`);
                        
                        // Try individual deletion for this batch (only if not a scope issue)
                        for (const gmailId of batch) {
                            try {
                                await gmail.users.messages.delete({
                                    userId: 'me',
                                    id: gmailId
                                });
                                gmailDeletedCount++;
                            } catch (individualError) {
                                if (individualError.code === 403 && 
                                    (individualError.message?.includes('Insufficient Permission') || 
                                     individualError.message?.includes('insufficient_scope'))) {
                                    // Stop trying if it's a scope issue
                                    break;
                                }
                                console.error(`Error deleting individual Gmail message ${gmailId}:`, individualError);
                            }
                        }
                    }
                }
            } catch (gmailApiError) {
                console.error('Gmail API error:', gmailApiError);
                gmailErrors.push('Failed to connect to Gmail API');
            }
        }

        // Delete from database
        const matchingEmailIds = matchingEmails.map(e => e._id);
        const dbResult = await Email.deleteMany({
            _id: { $in: matchingEmailIds },
            userId: req.userId
        });

        const response = {
            message: 'Emails deleted successfully',
            deleted: dbResult.deletedCount,
            from: fromEmail,
            gmailDeleted: gmailDeletedCount,
            totalGmailIds: gmailIds.length
        };

        // Check if there's an insufficient permissions error
        const hasPermissionError = gmailErrors.some(err => 
            err.includes('Insufficient permissions') || err.includes('insufficient_scope')
        );

        if (hasPermissionError) {
            response.requiresReauth = true;
            response.warning = 'Gmail deletion failed: Please log out and log back in to grant delete permissions';
            response.gmailErrors = gmailErrors;
        } else if (gmailErrors.length > 0) {
            response.gmailErrors = gmailErrors;
            response.warning = 'Some emails may not have been deleted from Gmail';
        }

        res.json(response);

    } catch (error) {
        console.error('Error deleting emails by from:', error);
        res.status(500).json({ error: 'Failed to delete emails', details: error.message });
    }
};