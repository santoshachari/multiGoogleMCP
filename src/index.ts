import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { marked } from "marked";
import fs from "fs/promises";
import path from "path";
import { getStoredTokens } from "./auth.js";

const PROJECT_ROOT = path.join(__dirname, '..');

const CREDENTIALS_PATH = path.join(PROJECT_ROOT, 'credentials.json');

// --- Helper: Get Authenticated Client ---

async function getAuthClient(email: string) {
    const tokens = await getStoredTokens();
    const account = tokens.find(t => t.email === email);

    if (!account) {
        throw new Error(`Account ${email} is not authenticated. Please run the auth script for this account first.`);
    }

    const credentialsRaw = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(credentialsRaw);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris ? redirect_uris[0] : 'http://localhost:9874/oauth2callback'
    );

    oauth2Client.setCredentials({ refresh_token: account.refresh_token });

    // Auto-refresh the token if needed
    const { credentials: refreshedCredentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshedCredentials);

    return {
        client: oauth2Client,
        isReadonly: account.readonly,
        isDraftOnly: account.draft_only || false
    };
}


// --- MCP Server Setup ---

const server = new Server(
    {
        name: "multi-gmail-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// --- Define Tools ---

const TOOLS: Tool[] = [
    {
        name: "gmail_list_accounts",
        description: "List all Gmail accounts that are currently authenticated and available for use.",
        inputSchema: {
            type: "object",
            properties: {},
            required: []
        },
    },
    {
        name: "gmail_search",
        description: "Search for emails in a specific Gmail account.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address to search within (must be an authenticated account)."
                },
                query: {
                    type: "string",
                    description: "The search query (uses standard Gmail search operators)."
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of results to return (default: 10)."
                }
            },
            required: ["email", "query"]
        },
    },
    {
        name: "gmail_read",
        description: "Read the full content of a specific email by ID.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address the email belongs to."
                },
                messageId: {
                    type: "string",
                    description: "The ID of the message to read."
                }
            },
            required: ["email", "messageId"]
        },
    },
    {
        name: "gmail_draft",
        description: "Draft an email using a specific Gmail account.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address to draft the email from."
                },
                to: {
                    type: "string",
                    description: "Recipient email address."
                },
                subject: {
                    type: "string",
                    description: "Subject of the email."
                },
                body: {
                    type: "string",
                    description: "Body content of the email (plain text)."
                },
                contentType: {
                    type: "string",
                    enum: ["text", "markdown", "html"],
                    description: "Content format: 'text' (plain text, default), 'markdown' (converted to HTML), or 'html' (raw HTML)."
                }
            },
            required: ["email", "to", "subject", "body"]
        }
    },
    {
        name: "gmail_send",
        description: "Send an email using a specific Gmail account.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address to send the email from."
                },
                to: {
                    type: "string",
                    description: "Recipient email address."
                },
                subject: {
                    type: "string",
                    description: "Subject of the email."
                },
                body: {
                    type: "string",
                    description: "Body content of the email (plain text)."
                },
                contentType: {
                    type: "string",
                    enum: ["text", "markdown", "html"],
                    description: "Content format: 'text' (plain text, default), 'markdown' (converted to HTML), or 'html' (raw HTML)."
                }
            },
            required: ["email", "to", "subject", "body"]
        }
    },
    {
        name: "chat_list_spaces",
        description: "List Google Chat spaces (rooms and direct messages) the account belongs to.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The authenticated Google account to list spaces for."
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of spaces to return (default: 25)."
                }
            },
            required: ["email"]
        }
    },
    {
        name: "chat_list_messages",
        description: "List recent messages in a Google Chat space.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The authenticated Google account to use."
                },
                spaceName: {
                    type: "string",
                    description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces."
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of messages to return (default: 25)."
                }
            },
            required: ["email", "spaceName"]
        }
    },
    {
        name: "chat_send_message",
        description: "Send a message to a Google Chat space.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The authenticated Google account to send from."
                },
                spaceName: {
                    type: "string",
                    description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces."
                },
                text: {
                    type: "string",
                    description: "The message text to send."
                }
            },
            required: ["email", "spaceName", "text"]
        }
    },
    {
        name: "gmail_get_attachment",
        description: "Download an attachment from a Gmail message. Use gmail_read first to get the attachmentId from the attachments list.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address the email belongs to."
                },
                messageId: {
                    type: "string",
                    description: "The Gmail message ID containing the attachment (id field from gmail_search or gmail_read)."
                },
                attachmentId: {
                    type: "string",
                    description: "The attachment ID from the attachments array in gmail_read output."
                },
                filename: {
                    type: "string",
                    description: "The filename of the attachment (from gmail_read attachments list, optional but helpful)."
                }
            },
            required: ["email", "messageId", "attachmentId"]
        }
    },
    {
        name: "gmail_read_thread",
        description: "Read all messages in a Gmail thread/conversation in chronological order.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address the thread belongs to."
                },
                threadId: {
                    type: "string",
                    description: "The thread ID (from gmail_read threadId field or gmail_search threadId field)."
                }
            },
            required: ["email", "threadId"]
        }
    },
    {
        name: "gmail_reply",
        description: "Reply to an email within its existing thread. Use gmail_read to obtain the threadId, messageId (Message-ID header), and references before calling this tool.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The Gmail address to reply from."
                },
                threadId: {
                    type: "string",
                    description: "The Gmail thread ID to reply within (from gmail_read Thread-ID)."
                },
                inReplyTo: {
                    type: "string",
                    description: "The RFC 2822 Message-ID of the email being replied to (from gmail_read Message-ID)."
                },
                to: {
                    type: "string",
                    description: "Recipient email address for the reply."
                },
                subject: {
                    type: "string",
                    description: "Subject of the reply (usually 'Re: <original subject>')."
                },
                body: {
                    type: "string",
                    description: "Body content of the reply (plain text)."
                },
                references: {
                    type: "string",
                    description: "Space-separated list of Message-IDs from the References header of the original email (optional)."
                },
                isDraft: {
                    type: "boolean",
                    description: "If true, creates a draft reply instead of sending. Useful for draft-only accounts (default: false)."
                },
                contentType: {
                    type: "string",
                    enum: ["text", "markdown", "html"],
                    description: "Content format: 'text' (plain text, default), 'markdown' (converted to HTML), or 'html' (raw HTML)."
                }
            },
            required: ["email", "threadId", "inReplyTo", "to", "subject", "body"]
        }
    }
];


// --- Tool Implementations ---

async function listAccounts() {
    const tokens = await getStoredTokens();

    if (tokens.length === 0) {
        return "No accounts authenticated yet. Please run the authentication script.";
    }

    const accountsInfo = tokens.map(t => `- ${t.email} (Readonly: ${t.readonly}, Draft-Only: ${t.draft_only || false})`).join("\n");
    return `Authenticated Accounts:\n${accountsInfo}`;
}

async function searchEmails(email: string, query: string, maxResults: number = 10) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
    });

    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
        return "No emails found matching the query.";
    }

    // Fetch details for each message to make the list useful
    const detailedMessages = await Promise.all(
        messages.map(async (msg) => {
            if (!msg.id) return null;
            try {
                const details = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'metadata',
                    metadataHeaders: ['Subject', 'From', 'Date', 'Message-ID']
                });

                const headers = details.data.payload?.headers || [];
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
                const date = headers.find(h => h.name === 'Date')?.value || '';
                const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';

                return {
                    id: msg.id,
                    threadId: details.data.threadId,
                    messageId,
                    snippet: details.data.snippet,
                    subject,
                    from,
                    date
                };
            } catch (e) {
                return null;
            }
        })
    );

    const validMessages = detailedMessages.filter(m => m !== null);

    return JSON.stringify(validMessages, null, 2);
}

function extractText(part: any): string {
    if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }

    if (part.parts) {
        for (const p of part.parts) {
            const text = extractText(p);
            if (text) return text;
        }
    }

    // Fallback to html if no plain text
    if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ').trim();
    }

    return "";
}

function collectAttachments(part: any, acc: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>) {
    if (part.filename && part.body?.attachmentId) {
        acc.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0,
            attachmentId: part.body.attachmentId,
        });
    }
    if (part.parts) {
        for (const p of part.parts) {
            collectAttachments(p, acc);
        }
    }
}

async function readEmail(email: string, messageId: string) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
    });

    const payload = response.data.payload;
    if (!payload) return "Could not retrieve email payload.";

    let textContent = extractText(payload);
    if (!textContent && response.data.snippet) {
        textContent = response.data.snippet;
    }

    const attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = [];
    collectAttachments(payload, attachments);

    const headers = payload.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
    const to = headers.find(h => h.name === 'To')?.value || 'Unknown Recipient';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const rfcMessageId = headers.find(h => h.name === 'Message-ID')?.value || '';
    const references = headers.find(h => h.name === 'References')?.value || '';
    const threadId = response.data.threadId || '';

    return JSON.stringify({ from, to, date, subject, messageId: rfcMessageId, threadId, references, body: textContent, attachments }, null, 2);
}

async function getAttachment(email: string, messageId: string, attachmentId: string, filename?: string) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
    });

    return JSON.stringify({
        filename: filename || 'attachment',
        size: res.data.size,
        data: res.data.data, // base64url encoded
    });
}

async function readThread(email: string, threadId: string) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const response = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
    });

    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
        return "No messages found in thread.";
    }

    const result = messages.map(msg => {
        const payload = msg.payload;
        if (!payload) return { messageId: msg.id, error: 'No payload' };

        const headers = payload.headers || [];
        const attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = [];
        collectAttachments(payload, attachments);

        return {
            id: msg.id,
            threadId: msg.threadId,
            from: headers.find(h => h.name === 'From')?.value || '',
            to: headers.find(h => h.name === 'To')?.value || '',
            date: headers.find(h => h.name === 'Date')?.value || '',
            subject: headers.find(h => h.name === 'Subject')?.value || '',
            messageId: headers.find(h => h.name === 'Message-ID')?.value || '',
            body: extractText(payload) || msg.snippet || '',
            attachments,
        };
    });

    return JSON.stringify(result, null, 2);
}

async function createRawEmail(opts: { to: string; subject: string; body: string; inReplyTo?: string; references?: string; contentType?: 'text' | 'markdown' | 'html' }): Promise<string> {
    const format = opts.contentType || 'text';
    let contentTypeHeader: string;
    let emailBody: string;

    if (format === 'markdown') {
        contentTypeHeader = 'Content-Type: text/html; charset=utf-8';
        emailBody = await marked.parse(opts.body);
    } else if (format === 'html') {
        contentTypeHeader = 'Content-Type: text/html; charset=utf-8';
        emailBody = opts.body;
    } else {
        contentTypeHeader = 'Content-Type: text/plain; charset=utf-8';
        emailBody = opts.body;
    }

    const messageParts = [
        `To: ${opts.to}`,
        contentTypeHeader,
        'MIME-Version: 1.0',
        `Subject: =?utf-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    ];
    if (opts.inReplyTo) {
        messageParts.push(`In-Reply-To: ${opts.inReplyTo}`);
    }
    if (opts.references) {
        messageParts.push(`References: ${opts.references}`);
    }
    messageParts.push('', emailBody);
    const message = messageParts.join('\n');
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function draftEmail(email: string, to: string, subject: string, body: string, contentType?: 'text' | 'markdown' | 'html') {
    const { client, isReadonly } = await getAuthClient(email);
    if (isReadonly) {
        throw new Error(`Cannot draft emails from ${email}: Account is configured in Read-Only mode.`);
    }

    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = await createRawEmail({ to, subject, body, contentType });

    const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
            message: {
                raw
            }
        }
    });

    return `Draft created successfully. Draft ID: ${response.data.id}`;
}

async function sendEmail(email: string, to: string, subject: string, body: string, contentType?: 'text' | 'markdown' | 'html') {
    const { client, isReadonly, isDraftOnly } = await getAuthClient(email);
    if (isReadonly) {
        throw new Error(`Cannot send emails from ${email}: Account is configured in Read-Only mode.`);
    }
    if (isDraftOnly) {
        throw new Error(`Cannot send emails from ${email}: Account is configured in Draft-Only mode (can only draft).`);
    }

    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = await createRawEmail({ to, subject, body, contentType });

    const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw
        }
    });

    return `Email sent successfully. Message ID: ${response.data.id}`;
}

async function replyToEmail(
    email: string,
    threadId: string,
    inReplyTo: string,
    to: string,
    subject: string,
    body: string,
    references?: string,
    isDraft?: boolean,
    contentType?: 'text' | 'markdown' | 'html'
) {
    const { client, isReadonly, isDraftOnly } = await getAuthClient(email);
    if (isReadonly) {
        throw new Error(`Cannot reply from ${email}: Account is configured in Read-Only mode.`);
    }
    if (isDraftOnly && !isDraft) {
        throw new Error(`Cannot send replies from ${email}: Account is configured in Draft-Only mode. Set isDraft to true to create a draft reply.`);
    }

    const gmail = google.gmail({ version: 'v1', auth: client });

    // Build the full references chain
    const refsChain = references ? `${references} ${inReplyTo}` : inReplyTo;

    const raw = await createRawEmail({ to, subject, body, inReplyTo, references: refsChain, contentType });

    if (isDraft) {
        const response = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: {
                message: {
                    raw,
                    threadId
                }
            }
        });
        return `Draft reply created successfully. Draft ID: ${response.data.id}`;
    } else {
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw,
                threadId
            }
        });
        return `Reply sent successfully. Message ID: ${response.data.id}`;
    }
}


// --- Google Chat Implementations ---

async function chatListSpaces(email: string, maxResults: number = 25) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });

    const response = await chat.spaces.list({ pageSize: maxResults });
    const spaces = response.data.spaces;

    if (!spaces || spaces.length === 0) {
        return "No spaces found for this account.";
    }

    const result = spaces.map(s => ({
        name: s.name,
        displayName: s.displayName || '(Direct Message)',
        type: s.spaceType,
    }));

    return JSON.stringify(result, null, 2);
}

async function chatListMessages(email: string, spaceName: string, maxResults: number = 25) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });

    const response = await chat.spaces.messages.list({
        parent: spaceName,
        pageSize: maxResults,
        orderBy: 'createTime desc'
    });

    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
        return "No messages found in this space.";
    }

    const result = messages.map(m => ({
        name: m.name,
        sender: m.sender?.displayName || m.sender?.name || 'Unknown',
        text: m.text || m.formattedText || '',
        createTime: m.createTime,
    }));

    return JSON.stringify(result, null, 2);
}

async function chatSendMessage(email: string, spaceName: string, text: string) {
    const { client, isReadonly, isDraftOnly } = await getAuthClient(email);
    if (isReadonly) {
        throw new Error(`Cannot send Chat messages from ${email}: Account is configured in Read-Only mode.`);
    }
    if (isDraftOnly) {
        throw new Error(`Cannot send Chat messages from ${email}: Account is configured in Draft-Only mode.`);
    }

    const chat = google.chat({ version: 'v1', auth: client });

    const response = await chat.spaces.messages.create({
        parent: spaceName,
        requestBody: { text }
    });

    return `Message sent successfully. Message name: ${response.data.name}`;
}


// --- Server Handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const { name, arguments: args } = request.params;
        let result: string;

        switch (name) {
            case "gmail_list_accounts":
                result = await listAccounts();
                break;
            case "gmail_search":
                if (!args || typeof args.email !== 'string' || typeof args.query !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_search.");
                }
                const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 10;
                result = await searchEmails(args.email, args.query, maxResults);
                break;
            case "gmail_read":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_read.");
                }
                result = await readEmail(args.email, args.messageId);
                break;
            case "gmail_draft":
                if (!args || typeof args.email !== 'string' || typeof args.to !== 'string' || typeof args.subject !== 'string' || typeof args.body !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_draft.");
                }
                result = await draftEmail(args.email, args.to, args.subject, args.body, args.contentType as 'text' | 'markdown' | 'html' | undefined);
                break;
            case "gmail_send":
                if (!args || typeof args.email !== 'string' || typeof args.to !== 'string' || typeof args.subject !== 'string' || typeof args.body !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_send.");
                }
                result = await sendEmail(args.email, args.to, args.subject, args.body, args.contentType as 'text' | 'markdown' | 'html' | undefined);
                break;
            case "chat_list_spaces":
                if (!args || typeof args.email !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_list_spaces.");
                }
                result = await chatListSpaces(args.email, typeof args.maxResults === 'number' ? args.maxResults : 25);
                break;
            case "chat_list_messages":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_list_messages.");
                }
                result = await chatListMessages(args.email, args.spaceName, typeof args.maxResults === 'number' ? args.maxResults : 25);
                break;
            case "chat_send_message":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string' || typeof args.text !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_send_message.");
                }
                result = await chatSendMessage(args.email, args.spaceName, args.text);
                break;
            case "gmail_get_attachment":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string' || typeof args.attachmentId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_get_attachment.");
                }
                result = await getAttachment(args.email, args.messageId, args.attachmentId, typeof args.filename === 'string' ? args.filename : undefined);
                break;
            case "gmail_read_thread":
                if (!args || typeof args.email !== 'string' || typeof args.threadId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_read_thread.");
                }
                result = await readThread(args.email, args.threadId);
                break;
            case "gmail_reply":
                if (!args || typeof args.email !== 'string' || typeof args.threadId !== 'string' || typeof args.inReplyTo !== 'string' || typeof args.to !== 'string' || typeof args.subject !== 'string' || typeof args.body !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_reply.");
                }
                result = await replyToEmail(
                    args.email,
                    args.threadId,
                    args.inReplyTo,
                    args.to,
                    args.subject,
                    args.body,
                    typeof args.references === 'string' ? args.references : undefined,
                    typeof args.isDraft === 'boolean' ? args.isDraft : false,
                    args.contentType as 'text' | 'markdown' | 'html' | undefined
                );
                break;
            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [{ type: "text", text: result }]
        };

    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});


// --- Start Server ---

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Multi-Gmail MCP Sever running on stdio");
}

main().catch(console.error);
