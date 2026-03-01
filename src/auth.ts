import { google } from 'googleapis';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';



// Because this script runs out of /build, the root of the project is one folder up
const PROJECT_ROOT = path.join(__dirname, '..');

const CREDENTIALS_PATH = path.join(PROJECT_ROOT, 'credentials.json');
const TOKENS_PATH = path.join(PROJECT_ROOT, 'tokens.json');

const FULL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
];

const READONLY_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
];

const DRAFTONLY_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/userinfo.email'
];

interface AccountToken {
    email: string;
    refresh_token: string;
    readonly: boolean;
    draft_only: boolean;
}

export async function getStoredTokens(): Promise<AccountToken[]> {
    try {
        const data = await fs.readFile(TOKENS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function saveToken(email: string, refresh_token: string, readonly: boolean, draft_only: boolean) {
    const tokens = await getStoredTokens();
    const existingIndex = tokens.findIndex(t => t.email === email);

    if (existingIndex >= 0) {
        tokens[existingIndex] = { email, refresh_token, readonly, draft_only };
    } else {
        tokens.push({ email, refresh_token, readonly, draft_only });
    }

    await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log(`Successfully saved token for ${email}`);
}

async function authenticate(readonly: boolean = false, draftOnly: boolean = false) {
    try {
        const credentialsRaw = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
        const credentials = JSON.parse(credentialsRaw);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

        const redirectUri = (redirect_uris && redirect_uris.length > 0) ? redirect_uris[0] : 'http://localhost:3000/oauth2callback';

        // Parse the URL to get the port and path dynamically based on whatever the user set in GCP
        const parsedUrl = new URL(redirectUri);
        const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80;
        const callbackPath = parsedUrl.pathname || '/';

        const oauth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirectUri
        );

        let scopes = FULL_SCOPES;
        if (readonly) {
            scopes = READONLY_SCOPES;
        } else if (draftOnly) {
            scopes = DRAFTONLY_SCOPES;
        }

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: scopes,
        });

        const app = express();
        let server: any;

        app.get(callbackPath, async (req, res) => {
            const code = req.query.code as string;
            if (!code) {
                res.send('Authorization failed. Please try again.');
                return;
            }

            try {
                const { tokens } = await oauth2Client.getToken(code);
                oauth2Client.setCredentials(tokens);

                const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
                const userInfo = await oauth2.userinfo.get();
                const email = userInfo.data.email;

                if (!email) {
                    throw new Error('Could not determine email address.');
                }

                if (!tokens.refresh_token) {
                    console.warn(`WARNING: No refresh token received for ${email}. You might need to revoke access in Google Account settings and try again.`);
                } else {
                    await saveToken(email, tokens.refresh_token, readonly, draftOnly);
                }

                res.send('Authorization successful! You can close this window and return to the terminal.');
            } catch (err) {
                console.error('Error retrieving access token', err);
                res.send('Error retrieving access token. Check terminal output.');
            } finally {
                server.close();
                process.exit(0);
            }
        });

        server = app.listen(port, () => {
            console.log(`Waiting for authorization on port ${port}...`);
            const url = Array.isArray(authUrl) ? authUrl[0] : authUrl;

            if (!url) {
                throw new Error('Failed to generate authentication URL.');
            }

            console.log('Opening browser to Google authorization page...');
            import('open').then(openModule => {
                const open = openModule.default;
                open(url);
            }).catch(err => {
                console.error('Failed to open browser:', err);
                console.log('Please open the following URL in your browser to authorize the application:');
                console.log(url);
            });
        });

    } catch (error) {
        console.error('Error during authentication startup:', error);
        console.log('\nMake sure you have downloaded a credentials.json file from the Google Cloud Console and placed it in the project root.');
        process.exit(1);
    }
}

// Check if run directly
if (require.main === module) {
    const isReadonly = process.argv.includes('--readonly');
    const isDraftOnly = process.argv.includes('--draftonly');
    console.log(`Starting authentication flow. Readonly mode: ${isReadonly}, Draft-Only mode: ${isDraftOnly}`);
    authenticate(isReadonly, isDraftOnly);
}
