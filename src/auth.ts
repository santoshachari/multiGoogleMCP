import { google } from 'googleapis';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';



// Because this script runs out of /build, the root of the project is one folder up
const PROJECT_ROOT = path.join(__dirname, '..');

const CREDENTIALS_PATH = path.join(PROJECT_ROOT, 'credentials.json');
const TOKENS_PATH = path.join(PROJECT_ROOT, 'tokens.json');

export type GmailPermission = 'full' | 'draft' | 'readonly';
export type ServicePermission = 'full' | 'readonly';

export interface AccountPermissions {
    gmail: GmailPermission;
    calendar: ServicePermission;
    drive: ServicePermission;
    chat: ServicePermission;
}

const FULL_PERMISSIONS: AccountPermissions = { gmail: 'full', calendar: 'full', drive: 'full', chat: 'full' };
const READONLY_PERMISSIONS: AccountPermissions = { gmail: 'readonly', calendar: 'readonly', drive: 'readonly', chat: 'readonly' };
const DRAFTONLY_PERMISSIONS: AccountPermissions = { gmail: 'draft', calendar: 'readonly', drive: 'readonly', chat: 'readonly' };

const GMAIL_SCOPES: Record<GmailPermission, string[]> = {
    full: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send'
    ],
    draft: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose'
    ],
    readonly: ['https://www.googleapis.com/auth/gmail.readonly']
};

const CALENDAR_SCOPES: Record<ServicePermission, string[]> = {
    full: ['https://www.googleapis.com/auth/calendar'],
    readonly: ['https://www.googleapis.com/auth/calendar.readonly']
};

const DRIVE_SCOPES: Record<ServicePermission, string[]> = {
    full: ['https://www.googleapis.com/auth/drive'],
    readonly: ['https://www.googleapis.com/auth/drive.readonly']
};

const CHAT_SCOPES: Record<ServicePermission, string[]> = {
    full: [
        'https://www.googleapis.com/auth/chat.messages',
        'https://www.googleapis.com/auth/chat.messages.reactions',
        'https://www.googleapis.com/auth/chat.spaces.readonly'
    ],
    readonly: [
        'https://www.googleapis.com/auth/chat.messages.readonly',
        'https://www.googleapis.com/auth/chat.spaces.readonly'
    ]
};

function scopesFor(permissions: AccountPermissions): string[] {
    return [
        ...GMAIL_SCOPES[permissions.gmail],
        ...CALENDAR_SCOPES[permissions.calendar],
        ...DRIVE_SCOPES[permissions.drive],
        ...CHAT_SCOPES[permissions.chat],
        'https://www.googleapis.com/auth/userinfo.email'
    ];
}

interface AccountToken {
    email: string;
    refresh_token: string;
    permissions: AccountPermissions;
}

// Legacy tokens.json entries only had `readonly`/`draft_only` booleans. Map them onto the
// closest equivalent granular permissions until the account is re-authenticated.
function migratePermissions(raw: any): AccountPermissions {
    if (raw.permissions) return raw.permissions;
    if (raw.readonly) return READONLY_PERMISSIONS;
    if (raw.draft_only) return DRAFTONLY_PERMISSIONS;
    return FULL_PERMISSIONS;
}

export async function getStoredTokens(): Promise<AccountToken[]> {
    try {
        const data = await fs.readFile(TOKENS_PATH, 'utf-8');
        const raw = JSON.parse(data);
        return raw.map((t: any): AccountToken => ({
            email: t.email,
            refresh_token: t.refresh_token,
            permissions: migratePermissions(t)
        }));
    } catch (err) {
        return [];
    }
}

async function saveToken(email: string, refresh_token: string, permissions: AccountPermissions) {
    const tokens = await getStoredTokens();
    const existingIndex = tokens.findIndex(t => t.email === email);
    const entry: AccountToken = { email, refresh_token, permissions };

    if (existingIndex >= 0) {
        tokens[existingIndex] = entry;
    } else {
        tokens.push(entry);
    }

    await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log(`Successfully saved token for ${email} (gmail=${permissions.gmail}, calendar=${permissions.calendar}, drive=${permissions.drive}, chat=${permissions.chat})`);
}

async function authenticate(permissions: AccountPermissions) {
    try {
        const credentialsRaw = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
        const credentials = JSON.parse(credentialsRaw);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

        const redirectUri = (redirect_uris && redirect_uris.length > 0) ? redirect_uris[0] : 'http://localhost:9874/oauth2callback';

        // Parse the URL to get the port and path dynamically based on whatever the user set in GCP
        const parsedUrl = new URL(redirectUri);
        const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80;
        const callbackPath = parsedUrl.pathname || '/';

        const oauth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirectUri
        );

        const scopes = scopesFor(permissions);

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
                    await saveToken(email, tokens.refresh_token, permissions);
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

        server = app.listen(port, (err?: any) => {
            if (err) {
                console.error(`\n[!] Failed to start local server on port ${port}.`);
                console.error(`Error details:`, err.message || err);
                process.exit(1);
            }
            console.log(`Waiting for authorization on port ${port}...`);
            const url = Array.isArray(authUrl) ? authUrl[0] : authUrl;

            if (!url) {
                throw new Error('Failed to generate authentication URL.');
            }

            console.log('Please open the following URL in your browser to authorize the application:');
            console.log(url);
        });

    } catch (error) {
        console.error('Error during authentication startup:', error);
        console.log('\nMake sure you have downloaded a credentials.json file from the Google Cloud Console and placed it in the project root.');
        process.exit(1);
    }
}

// Parses CLI flags into a permissions object.
//   --readonly / --draftonly   Legacy shorthand: sets every service at once.
//   --gmail=<full|draft|readonly>
//   --calendar=<full|readonly>
//   --drive=<full|readonly>
//   --chat=<full|readonly>
// Granular flags override the shorthand for that specific service, so they can be combined,
// e.g. `--draftonly --calendar=full` grants Gmail drafting only, but full Calendar access.
export function parsePermissionsFromArgs(argv: string[]): AccountPermissions {
    let permissions: AccountPermissions = { ...FULL_PERMISSIONS };

    if (argv.includes('--readonly')) {
        permissions = { ...READONLY_PERMISSIONS };
    } else if (argv.includes('--draftonly')) {
        permissions = { ...DRAFTONLY_PERMISSIONS };
    }

    for (const arg of argv) {
        const match = arg.match(/^--(gmail|calendar|drive|chat)=(\w+)$/);
        if (!match) continue;
        const [, service, level] = match;

        if (service === 'gmail') {
            if (level !== 'full' && level !== 'draft' && level !== 'readonly') {
                throw new Error(`Invalid --gmail value '${level}'. Must be one of: full, draft, readonly.`);
            }
            permissions.gmail = level;
        } else {
            if (level !== 'full' && level !== 'readonly') {
                throw new Error(`Invalid --${service} value '${level}'. Must be one of: full, readonly.`);
            }
            permissions[service as 'calendar' | 'drive' | 'chat'] = level;
        }
    }

    return permissions;
}

// Check if run directly
if (require.main === module) {
    try {
        const permissions = parsePermissionsFromArgs(process.argv);
        console.log(`Starting authentication flow. Permissions: gmail=${permissions.gmail}, calendar=${permissions.calendar}, drive=${permissions.drive}, chat=${permissions.chat}`);
        authenticate(permissions);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}
