const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Email = require('../models/Email');

// Middleware to verify JWT
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Function to refresh access token if expired
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
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    user.accessToken = credentials.access_token;
    if (credentials.refresh_token) {
      user.refreshToken = credentials.refresh_token;
    }
    user.tokenExpiry = new Date(credentials.expiry_date);
    await user.save();

    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}

// Fetch emails from Gmail and store in database
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user || !user.refreshToken) {
      return res.status(400).json({ error: 'User not authenticated with Gmail' });
    }

    const oauth2Client = await getValidOAuthClient(user);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Fetch emails from Gmail (last 50 emails)
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 50,
      q: 'in:inbox' // You can modify this query
    });

    const messages = response.data.messages || [];
    let syncedCount = 0;

    for (const message of messages) {
      // Check if email already exists
      const existingEmail = await Email.findOne({ gmailId: message.id });
      
      if (!existingEmail) {
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
      }
    }

    res.json({ 
      message: 'Emails synced successfully',
      synced: syncedCount,
      total: messages.length
    });

  } catch (error) {
    console.error('Email sync error:', error);
    res.status(500).json({ error: 'Failed to sync emails' });
  }
});

// Get emails from database
router.get('/', authMiddleware, async (req, res) => {
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
});

// Get single email
router.get('/:id', authMiddleware, async (req, res) => {
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
});

module.exports = router;

