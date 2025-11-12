const { google } = require('googleapis');

const OAuthUtils = module.exports;

// Function to refresh access token if expired
OAuthUtils.getValidOAuthClient = async (user) => {
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
};

