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
import { getStoredTokens, AccountPermissions } from "./auth.js";

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
        permissions: account.permissions
    };
}

// --- Helper: Permission Guards ---

function assertGmailCanSend(permissions: AccountPermissions, email: string) {
    if (permissions.gmail !== 'full') {
        throw new Error(`Cannot send emails from ${email}: Gmail permission is '${permissions.gmail}' (requires 'full'). Re-run auth with --gmail=full to enable sending.`);
    }
}

function assertGmailCanModify(permissions: AccountPermissions, email: string) {
    if (permissions.gmail === 'readonly') {
        throw new Error(`Cannot modify emails from ${email}: Gmail permission is 'readonly'. Re-run auth with --gmail=full or --gmail=draft to enable this.`);
    }
}

function assertCalendarCanWrite(permissions: AccountPermissions, email: string) {
    if (permissions.calendar !== 'full') {
        throw new Error(`Cannot modify calendar from ${email}: Calendar permission is 'readonly'. Re-run auth with --calendar=full to enable this.`);
    }
}

function assertDriveCanWrite(permissions: AccountPermissions, email: string) {
    if (permissions.drive !== 'full') {
        throw new Error(`Cannot modify Drive from ${email}: Drive permission is 'readonly'. Re-run auth with --drive=full to enable this.`);
    }
}

function assertChatCanSend(permissions: AccountPermissions, email: string) {
    if (permissions.chat !== 'full') {
        throw new Error(`Cannot send Chat messages from ${email}: Chat permission is 'readonly'. Re-run auth with --chat=full to enable this.`);
    }
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
                },
                pageToken: {
                    type: "string",
                    description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results."
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
                    description: "Recipient email address. Multiple addresses can be comma-separated."
                },
                subject: {
                    type: "string",
                    description: "Subject of the email."
                },
                body: {
                    type: "string",
                    description: "Body content of the email."
                },
                cc: {
                    type: "string",
                    description: "CC recipients. Multiple addresses can be comma-separated."
                },
                bcc: {
                    type: "string",
                    description: "BCC recipients. Multiple addresses can be comma-separated."
                },
                contentType: {
                    type: "string",
                    enum: ["text", "markdown", "html"],
                    description: "Content format: 'text' (plain text, default), 'markdown' (converted to HTML), or 'html' (raw HTML)."
                },
                attachments: {
                    type: "array",
                    description: "Files to attach to the email.",
                    items: {
                        type: "object",
                        properties: {
                            filename: { type: "string", description: "Name of the file as it will appear in the email." },
                            data: { type: "string", description: "Base64-encoded file content." },
                            mimeType: { type: "string", description: "MIME type of the file, e.g. 'application/pdf' or 'image/png'." }
                        },
                        required: ["filename", "data", "mimeType"]
                    }
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
                    description: "Recipient email address. Multiple addresses can be comma-separated."
                },
                subject: {
                    type: "string",
                    description: "Subject of the email."
                },
                body: {
                    type: "string",
                    description: "Body content of the email."
                },
                cc: {
                    type: "string",
                    description: "CC recipients. Multiple addresses can be comma-separated."
                },
                bcc: {
                    type: "string",
                    description: "BCC recipients. Multiple addresses can be comma-separated."
                },
                contentType: {
                    type: "string",
                    enum: ["text", "markdown", "html"],
                    description: "Content format: 'text' (plain text, default), 'markdown' (converted to HTML), or 'html' (raw HTML)."
                },
                attachments: {
                    type: "array",
                    description: "Files to attach to the email.",
                    items: {
                        type: "object",
                        properties: {
                            filename: { type: "string", description: "Name of the file as it will appear in the email." },
                            data: { type: "string", description: "Base64-encoded file content." },
                            mimeType: { type: "string", description: "MIME type of the file, e.g. 'application/pdf' or 'image/png'." }
                        },
                        required: ["filename", "data", "mimeType"]
                    }
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
                },
                pageToken: {
                    type: "string",
                    description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results."
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
                },
                pageToken: {
                    type: "string",
                    description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results."
                }
            },
            required: ["email", "spaceName"]
        }
    },
    {
        name: "chat_send_message",
        description: "Send a message to a Google Chat space, optionally as a reply within an existing thread.",
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
                },
                threadName: {
                    type: "string",
                    description: "Thread resource name to reply within (e.g. 'spaces/XXXXXX/threads/YYYYYY'), from chat_list_messages threadName field. Omit to start a new thread."
                }
            },
            required: ["email", "spaceName", "text"]
        }
    },
    {
        name: "chat_add_reaction",
        description: "Add an emoji reaction to a Google Chat message.",
        inputSchema: {
            type: "object",
            properties: {
                email: {
                    type: "string",
                    description: "The authenticated Google account to react as."
                },
                messageName: {
                    type: "string",
                    description: "The message resource name to react to (e.g. 'spaces/XXXXXX/messages/YYYYYY'), from chat_list_messages name field."
                },
                emoji: {
                    type: "string",
                    description: "The emoji unicode character to react with (e.g. '👍', '❤️')."
                }
            },
            required: ["email", "messageName", "emoji"]
        }
    },
    {
        name: "chat_get_message",
        description: "Get the full content of a single Google Chat message by its resource name.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to use." },
                messageName: { type: "string", description: "The message resource name (e.g. 'spaces/XXXXXX/messages/YYYYYY'), from chat_list_messages name field." }
            },
            required: ["email", "messageName"]
        }
    },
    {
        name: "chat_delete_message",
        description: "Delete a Google Chat message you sent.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account that sent the message." },
                messageName: { type: "string", description: "The message resource name to delete (e.g. 'spaces/XXXXXX/messages/YYYYYY')." }
            },
            required: ["email", "messageName"]
        }
    },
    {
        name: "chat_update_message",
        description: "Edit the text of a Google Chat message you sent.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account that sent the message." },
                messageName: { type: "string", description: "The message resource name to edit (e.g. 'spaces/XXXXXX/messages/YYYYYY')." },
                text: { type: "string", description: "The new text content for the message." }
            },
            required: ["email", "messageName", "text"]
        }
    },
    {
        name: "chat_list_reactions",
        description: "List reactions on a Google Chat message.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to use." },
                messageName: { type: "string", description: "The message resource name (e.g. 'spaces/XXXXXX/messages/YYYYYY'), from chat_list_messages name field." },
                maxResults: { type: "number", description: "Maximum number of reactions to return (default: 25)." },
                pageToken: { type: "string", description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results." }
            },
            required: ["email", "messageName"]
        }
    },
    {
        name: "chat_remove_reaction",
        description: "Remove a reaction from a Google Chat message. Use chat_list_reactions to get the reaction's resource name.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account that created the reaction." },
                reactionName: { type: "string", description: "The reaction resource name to remove (e.g. 'spaces/XXXXXX/messages/YYYYYY/reactions/ZZZZZZ'), from chat_list_reactions name field." }
            },
            required: ["email", "reactionName"]
        }
    },
    {
        name: "chat_get_attachment",
        description: "Download an attachment from a Google Chat message. Use chat_list_messages or chat_get_message first to get the resourceName from the attachments list.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to use." },
                resourceName: { type: "string", description: "The attachment data resourceName from a message's attachments list." },
                filename: { type: "string", description: "The filename of the attachment (from the attachments list, optional but helpful)." }
            },
            required: ["email", "resourceName"]
        }
    },
    {
        name: "chat_list_members",
        description: "List the members of a Google Chat space.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to use." },
                spaceName: { type: "string", description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces." },
                maxResults: { type: "number", description: "Maximum number of members to return (default: 50)." },
                pageToken: { type: "string", description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results." }
            },
            required: ["email", "spaceName"]
        }
    },
    {
        name: "chat_get_space",
        description: "Get details about a single Google Chat space.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to use." },
                spaceName: { type: "string", description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces." }
            },
            required: ["email", "spaceName"]
        }
    },
    {
        name: "chat_create_space",
        description: "Create a new named Google Chat space (room), optionally inviting initial members.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to create the space as." },
                displayName: { type: "string", description: "Display name for the new space." },
                memberEmails: { type: "string", description: "Comma-separated list of email addresses to invite as initial members (optional)." }
            },
            required: ["email", "displayName"]
        }
    },
    {
        name: "chat_add_member",
        description: "Add a member to a Google Chat space.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account performing the action." },
                spaceName: { type: "string", description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces." },
                memberEmail: { type: "string", description: "Email address of the person to add." }
            },
            required: ["email", "spaceName", "memberEmail"]
        }
    },
    {
        name: "chat_remove_member",
        description: "Remove a member from a Google Chat space.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account performing the action." },
                spaceName: { type: "string", description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces." },
                memberEmail: { type: "string", description: "Email address of the member to remove." }
            },
            required: ["email", "spaceName", "memberEmail"]
        }
    },
    {
        name: "chat_upload_attachment",
        description: "Upload a file and send it as an attachment to a Google Chat space, with optional accompanying text.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account to send from." },
                spaceName: { type: "string", description: "The space resource name (e.g. 'spaces/XXXXXX'). Get this from chat_list_spaces." },
                filename: { type: "string", description: "The name for the file as it will appear in the message." },
                mimeType: { type: "string", description: "MIME type of the file (e.g. 'application/pdf', 'image/png')." },
                data: { type: "string", description: "Base64-encoded file content." },
                text: { type: "string", description: "Optional message text to send alongside the attachment." },
                threadName: { type: "string", description: "Thread resource name to reply within (optional), from chat_list_messages threadName field." }
            },
            required: ["email", "spaceName", "filename", "mimeType", "data"]
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
                },
                cc: {
                    type: "string",
                    description: "CC recipients. Multiple addresses can be comma-separated."
                },
                bcc: {
                    type: "string",
                    description: "BCC recipients. Multiple addresses can be comma-separated."
                },
                attachments: {
                    type: "array",
                    description: "Files to attach to the reply.",
                    items: {
                        type: "object",
                        properties: {
                            filename: { type: "string", description: "Name of the file as it will appear in the email." },
                            data: { type: "string", description: "Base64-encoded file content." },
                            mimeType: { type: "string", description: "MIME type of the file, e.g. 'application/pdf' or 'image/png'." }
                        },
                        required: ["filename", "data", "mimeType"]
                    }
                }
            },
            required: ["email", "threadId", "inReplyTo", "to", "subject", "body"]
        }
    },
    {
        name: "gmail_forward",
        description: "Forward an email to new recipients. Use gmail_read first to get the original message content.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address to forward from." },
                to: { type: "string", description: "Recipient email address(es), comma-separated." },
                subject: { type: "string", description: "Subject of the forwarded email (usually 'Fwd: <original subject>')." },
                body: { type: "string", description: "Body content to prepend before the forwarded message." },
                originalMessageId: { type: "string", description: "The Gmail message ID of the email to forward (from gmail_search or gmail_read)." },
                cc: { type: "string", description: "CC recipients, comma-separated." },
                bcc: { type: "string", description: "BCC recipients, comma-separated." },
                contentType: { type: "string", enum: ["text", "markdown", "html"], description: "Content format for the prepended body." },
                attachments: {
                    type: "array",
                    description: "Additional files to attach.",
                    items: {
                        type: "object",
                        properties: {
                            filename: { type: "string" },
                            data: { type: "string", description: "Base64-encoded file content." },
                            mimeType: { type: "string" }
                        },
                        required: ["filename", "data", "mimeType"]
                    }
                }
            },
            required: ["email", "to", "subject", "body", "originalMessageId"]
        }
    },
    {
        name: "gmail_trash",
        description: "Move an email to the trash.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID to trash (from gmail_search or gmail_read)." }
            },
            required: ["email", "messageId"]
        }
    },
    {
        name: "gmail_delete",
        description: "Permanently delete an email. This cannot be undone. Use gmail_trash to move to trash instead.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID to permanently delete." }
            },
            required: ["email", "messageId"]
        }
    },
    {
        name: "gmail_mark_read",
        description: "Mark an email as read.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID to mark as read." }
            },
            required: ["email", "messageId"]
        }
    },
    {
        name: "gmail_mark_unread",
        description: "Mark an email as unread.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID to mark as unread." }
            },
            required: ["email", "messageId"]
        }
    },
    {
        name: "gmail_star",
        description: "Star an email.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID to star." }
            },
            required: ["email", "messageId"]
        }
    },
    {
        name: "gmail_unstar",
        description: "Remove the star from an email.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID to unstar." }
            },
            required: ["email", "messageId"]
        }
    },
    {
        name: "gmail_list_labels",
        description: "List all labels (folders) in a Gmail account.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address to list labels for." }
            },
            required: ["email"]
        }
    },
    {
        name: "gmail_apply_label",
        description: "Apply a label to an email. Use gmail_list_labels to get label IDs.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID." },
                labelId: { type: "string", description: "The label ID to apply (from gmail_list_labels)." }
            },
            required: ["email", "messageId", "labelId"]
        }
    },
    {
        name: "gmail_remove_label",
        description: "Remove a label from an email. Use gmail_list_labels to get label IDs.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the email belongs to." },
                messageId: { type: "string", description: "The Gmail message ID." },
                labelId: { type: "string", description: "The label ID to remove (from gmail_list_labels)." }
            },
            required: ["email", "messageId", "labelId"]
        }
    },
    {
        name: "gmail_list_drafts",
        description: "List draft emails in a Gmail account.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address to list drafts for." },
                maxResults: { type: "number", description: "Maximum number of drafts to return (default: 10)." },
                pageToken: { type: "string", description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results." }
            },
            required: ["email"]
        }
    },
    {
        name: "gmail_send_draft",
        description: "Send an existing draft email. Use gmail_list_drafts to get draft IDs.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The Gmail address the draft belongs to." },
                draftId: { type: "string", description: "The draft ID to send (from gmail_list_drafts or gmail_draft)." }
            },
            required: ["email", "draftId"]
        }
    },

    // --- Google Calendar Tools ---
    {
        name: "calendar_list_calendars",
        description: "List all calendars in a Google account.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." }
            },
            required: ["email"]
        }
    },
    {
        name: "calendar_list_events",
        description: "List upcoming events in a calendar.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                calendarId: { type: "string", description: "The calendar ID (from calendar_list_calendars). Use 'primary' for the main calendar." },
                maxResults: { type: "number", description: "Maximum number of events to return (default: 10)." },
                timeMin: { type: "string", description: "Start of time range in ISO 8601 format (e.g. '2024-01-01T00:00:00Z'). Defaults to now." },
                timeMax: { type: "string", description: "End of time range in ISO 8601 format." },
                query: { type: "string", description: "Free text search query to filter events." },
                pageToken: { type: "string", description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results." }
            },
            required: ["email", "calendarId"]
        }
    },
    {
        name: "calendar_get_event",
        description: "Get details of a specific calendar event.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                calendarId: { type: "string", description: "The calendar ID. Use 'primary' for the main calendar." },
                eventId: { type: "string", description: "The event ID (from calendar_list_events)." }
            },
            required: ["email", "calendarId", "eventId"]
        }
    },
    {
        name: "calendar_create_event",
        description: "Create a new event in a Google Calendar.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                calendarId: { type: "string", description: "The calendar ID. Use 'primary' for the main calendar." },
                title: { type: "string", description: "Title/summary of the event." },
                startDateTime: { type: "string", description: "Start date/time in ISO 8601 format (e.g. '2024-06-15T10:00:00-07:00'). For all-day events use 'YYYY-MM-DD'." },
                endDateTime: { type: "string", description: "End date/time in ISO 8601 format. For all-day events use 'YYYY-MM-DD'." },
                description: { type: "string", description: "Description or notes for the event." },
                location: { type: "string", description: "Location of the event." },
                attendees: { type: "string", description: "Comma-separated list of attendee email addresses." },
                isAllDay: { type: "boolean", description: "If true, startDateTime and endDateTime are treated as dates (YYYY-MM-DD) for an all-day event." },
                timeZone: { type: "string", description: "Timezone for the event (e.g. 'America/Los_Angeles'). Defaults to account timezone." },
                addGoogleMeet: { type: "boolean", description: "If true, attaches a Google Meet video conference to the event and returns its join link." },
                enableGeminiNotes: { type: "boolean", description: "If true (requires addGoogleMeet), enables Gemini 'Take notes for me' auto-generated notes for the Meet space. Requires a Google Workspace account with Gemini access; silently reported as unavailable otherwise." }
            },
            required: ["email", "calendarId", "title", "startDateTime", "endDateTime"]
        }
    },
    {
        name: "calendar_update_event",
        description: "Update an existing calendar event.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                calendarId: { type: "string", description: "The calendar ID. Use 'primary' for the main calendar." },
                eventId: { type: "string", description: "The event ID to update (from calendar_list_events)." },
                title: { type: "string", description: "New title/summary." },
                startDateTime: { type: "string", description: "New start date/time in ISO 8601 format." },
                endDateTime: { type: "string", description: "New end date/time in ISO 8601 format." },
                description: { type: "string", description: "New description." },
                location: { type: "string", description: "New location." },
                attendees: { type: "string", description: "Comma-separated list of attendee email addresses (replaces existing)." },
                timeZone: { type: "string", description: "Timezone for the event." }
            },
            required: ["email", "calendarId", "eventId"]
        }
    },
    {
        name: "calendar_delete_event",
        description: "Delete a calendar event.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                calendarId: { type: "string", description: "The calendar ID. Use 'primary' for the main calendar." },
                eventId: { type: "string", description: "The event ID to delete (from calendar_list_events)." }
            },
            required: ["email", "calendarId", "eventId"]
        }
    },
    {
        name: "calendar_quick_add",
        description: "Create a calendar event from a natural language string (e.g. 'Lunch with John tomorrow at noon').",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                calendarId: { type: "string", description: "The calendar ID. Use 'primary' for the main calendar." },
                text: { type: "string", description: "Natural language description of the event." }
            },
            required: ["email", "calendarId", "text"]
        }
    },
    {
        name: "calendar_respond_to_event",
        description: "RSVP to a calendar event invitation as the authenticated account (accept, decline, or tentative).",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account (must be an attendee of the event)." },
                calendarId: { type: "string", description: "The calendar ID. Use 'primary' for the main calendar." },
                eventId: { type: "string", description: "The event ID to respond to (from calendar_list_events)." },
                responseStatus: { type: "string", enum: ["accepted", "declined", "tentative"], description: "The RSVP response to record." }
            },
            required: ["email", "calendarId", "eventId", "responseStatus"]
        }
    },

    // --- Google Drive Tools ---
    {
        name: "drive_list_files",
        description: "List files and folders in Google Drive.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                folderId: { type: "string", description: "Folder ID to list contents of. Omit or use 'root' for the root folder." },
                maxResults: { type: "number", description: "Maximum number of files to return (default: 20)." },
                pageToken: { type: "string", description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results." }
            },
            required: ["email"]
        }
    },
    {
        name: "drive_search_files",
        description: "Search for files in Google Drive.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                query: { type: "string", description: "Search query. Supports Drive query syntax (e.g. \"name contains 'report'\", \"mimeType='application/pdf'\")." },
                maxResults: { type: "number", description: "Maximum number of results to return (default: 20)." },
                pageToken: { type: "string", description: "Pagination token from a previous call's nextPageToken, to fetch the next page of results." }
            },
            required: ["email", "query"]
        }
    },
    {
        name: "drive_get_file",
        description: "Get metadata for a specific file or folder in Google Drive.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                fileId: { type: "string", description: "The file or folder ID (from drive_list_files or drive_search_files)." }
            },
            required: ["email", "fileId"]
        }
    },
    {
        name: "drive_read_file",
        description: "Read the text content of a file in Google Drive. Works for Google Docs, plain text, and other text-based files.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                fileId: { type: "string", description: "The file ID (from drive_list_files or drive_search_files)." }
            },
            required: ["email", "fileId"]
        }
    },
    {
        name: "drive_download_file",
        description: "Download a file from Google Drive as base64-encoded binary content. Use for images, PDFs, zips, and other non-text files. Google Docs/Sheets/Slides are exported to a concrete format (default PDF).",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                fileId: { type: "string", description: "The file ID (from drive_list_files or drive_search_files)." },
                exportMimeType: { type: "string", description: "MIME type to export Google-native files (Docs/Sheets/Slides) as (default 'application/pdf'). Ignored for non-Google-native files." }
            },
            required: ["email", "fileId"]
        }
    },
    {
        name: "drive_upload_file",
        description: "Upload a file to Google Drive.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                filename: { type: "string", description: "The name for the file in Drive." },
                mimeType: { type: "string", description: "MIME type of the file (e.g. 'text/plain', 'application/pdf', 'image/png')." },
                data: { type: "string", description: "Base64-encoded file content." },
                folderId: { type: "string", description: "ID of the parent folder to upload into. Omit for root." }
            },
            required: ["email", "filename", "mimeType", "data"]
        }
    },
    {
        name: "drive_create_folder",
        description: "Create a new folder in Google Drive.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                name: { type: "string", description: "Name of the new folder." },
                parentFolderId: { type: "string", description: "ID of the parent folder. Omit for root." }
            },
            required: ["email", "name"]
        }
    },
    {
        name: "drive_delete_file",
        description: "Delete a file or folder from Google Drive (moves to trash).",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                fileId: { type: "string", description: "The file or folder ID to delete." }
            },
            required: ["email", "fileId"]
        }
    },
    {
        name: "drive_share_file",
        description: "Share a file or folder with another user.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                fileId: { type: "string", description: "The file or folder ID to share." },
                shareWithEmail: { type: "string", description: "The email address of the person to share with." },
                role: { type: "string", enum: ["reader", "commenter", "writer", "owner"], description: "Permission role to grant (default: reader)." },
                sendNotification: { type: "boolean", description: "Whether to send a notification email to the recipient (default: true)." }
            },
            required: ["email", "fileId", "shareWithEmail"]
        }
    },
    {
        name: "drive_move_file",
        description: "Move a file or folder to a different folder in Google Drive.",
        inputSchema: {
            type: "object",
            properties: {
                email: { type: "string", description: "The authenticated Google account." },
                fileId: { type: "string", description: "The file or folder ID to move." },
                newParentFolderId: { type: "string", description: "The ID of the destination folder." }
            },
            required: ["email", "fileId", "newParentFolderId"]
        }
    }
];


// --- Tool Implementations ---

async function listAccounts() {
    const tokens = await getStoredTokens();

    if (tokens.length === 0) {
        return "No accounts authenticated yet. Please run the authentication script.";
    }

    const accountsInfo = tokens.map(t => `- ${t.email} (gmail: ${t.permissions.gmail}, calendar: ${t.permissions.calendar}, drive: ${t.permissions.drive}, chat: ${t.permissions.chat})`).join("\n");
    return `Authenticated Accounts:\n${accountsInfo}`;
}

async function searchEmails(email: string, query: string, maxResults: number = 10, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });

    const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        pageToken
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

    return JSON.stringify({ emails: validMessages, nextPageToken: response.data.nextPageToken || null }, null, 2);
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

interface EmailAttachment {
    filename: string;
    // base64-encoded file content
    data: string;
    // MIME type, e.g. "application/pdf" or "image/png"
    mimeType: string;
}

async function createRawEmail(opts: {
    to: string;
    subject: string;
    body: string;
    from?: string;
    cc?: string;
    bcc?: string;
    inReplyTo?: string;
    references?: string;
    contentType?: 'text' | 'markdown' | 'html';
    attachments?: EmailAttachment[];
}): Promise<string> {
    const format = opts.contentType || 'text';
    let bodyMimeType: string;
    let emailBody: string;

    if (format === 'markdown') {
        bodyMimeType = 'text/html';
        emailBody = await marked.parse(opts.body);
    } else if (format === 'html') {
        bodyMimeType = 'text/html';
        emailBody = opts.body;
    } else {
        bodyMimeType = 'text/plain';
        emailBody = opts.body;
    }

    const boundary = `----=_Part_${Math.random().toString(36).slice(2)}`;
    const hasAttachments = opts.attachments && opts.attachments.length > 0;

    const headers: string[] = [
        `To: ${opts.to}`,
        'MIME-Version: 1.0',
        `Subject: =?utf-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    ];
    if (opts.from) headers.push(`From: ${opts.from}`);
    if (opts.cc) headers.push(`Cc: ${opts.cc}`);
    if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);
    if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
    if (opts.references) headers.push(`References: ${opts.references}`);

    let message: string;

    if (hasAttachments) {
        headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        const parts: string[] = [
            `--${boundary}`,
            `Content-Type: ${bodyMimeType}; charset=utf-8`,
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(emailBody).toString('base64'),
        ];
        for (const att of opts.attachments!) {
            parts.push(
                `--${boundary}`,
                `Content-Type: ${att.mimeType}; name="${att.filename}"`,
                'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${att.filename}"`,
                '',
                att.data,
            );
        }
        parts.push(`--${boundary}--`);
        message = [...headers, '', ...parts].join('\n');
    } else {
        headers.push(`Content-Type: ${bodyMimeType}; charset=utf-8`);
        message = [...headers, '', emailBody].join('\n');
    }

    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function draftEmail(email: string, to: string, subject: string, body: string, contentType?: 'text' | 'markdown' | 'html', cc?: string, bcc?: string, attachments?: EmailAttachment[]) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanModify(permissions, email);

    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = await createRawEmail({ to, subject, body, from: email, contentType, cc, bcc, attachments });

    const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
            message: {
                raw
            }
        }
    });

    return `Draft created successfully. Draft ID: ${response.data.id}, Thread ID: ${response.data.message?.threadId ?? 'unknown'}`;
}

async function sendEmail(email: string, to: string, subject: string, body: string, contentType?: 'text' | 'markdown' | 'html', cc?: string, bcc?: string, attachments?: EmailAttachment[]) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanSend(permissions, email);

    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = await createRawEmail({ to, subject, body, from: email, contentType, cc, bcc, attachments });

    const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw
        }
    });

    return `Email sent successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
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
    contentType?: 'text' | 'markdown' | 'html',
    cc?: string,
    bcc?: string,
    attachments?: EmailAttachment[]
) {
    const { client, permissions } = await getAuthClient(email);
    if (isDraft) {
        assertGmailCanModify(permissions, email);
    } else {
        assertGmailCanSend(permissions, email);
    }

    const gmail = google.gmail({ version: 'v1', auth: client });

    // Build the full references chain
    const refsChain = references ? `${references} ${inReplyTo}` : inReplyTo;

    const raw = await createRawEmail({ to, subject, body, from: email, inReplyTo, references: refsChain, contentType, cc, bcc, attachments });

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
        return `Draft reply created successfully. Draft ID: ${response.data.id}, Thread ID: ${response.data.message?.threadId ?? 'unknown'}`;
    } else {
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw,
                threadId
            }
        });
        return `Reply sent successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
    }
}


async function forwardEmail(
    email: string,
    to: string,
    subject: string,
    body: string,
    originalMessageId: string,
    cc?: string,
    bcc?: string,
    contentType?: 'text' | 'markdown' | 'html',
    attachments?: EmailAttachment[]
) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanSend(permissions, email);

    const gmail = google.gmail({ version: 'v1', auth: client });

    // Fetch the original message to inline its body
    const original = await gmail.users.messages.get({ userId: 'me', id: originalMessageId, format: 'full' });
    const origHeaders = original.data.payload?.headers || [];
    const origFrom = origHeaders.find(h => h.name === 'From')?.value || '';
    const origDate = origHeaders.find(h => h.name === 'Date')?.value || '';
    const origSubject = origHeaders.find(h => h.name === 'Subject')?.value || '';
    const origBody = extractText(original.data.payload) || '';

    const fwdSuffix = `\n\n---------- Forwarded message ----------\nFrom: ${origFrom}\nDate: ${origDate}\nSubject: ${origSubject}\n\n${origBody}`;
    const fullBody = body + fwdSuffix;

    const raw = await createRawEmail({ to, subject, body: fullBody, from: email, cc, bcc, contentType, attachments });
    const response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return `Email forwarded successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
}

async function trashEmail(email: string, messageId: string) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanModify(permissions, email);
    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.messages.trash({ userId: 'me', id: messageId });
    return `Message ${messageId} moved to trash.`;
}

async function deleteEmail(email: string, messageId: string) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanModify(permissions, email);
    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.messages.delete({ userId: 'me', id: messageId });
    return `Message ${messageId} permanently deleted.`;
}

async function modifyMessageLabels(email: string, messageId: string, addLabelIds: string[], removeLabelIds: string[]) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanModify(permissions, email);
    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds, removeLabelIds } });
    return messageId;
}

async function markRead(email: string, messageId: string) {
    await modifyMessageLabels(email, messageId, [], ['UNREAD']);
    return `Message ${messageId} marked as read.`;
}

async function markUnread(email: string, messageId: string) {
    await modifyMessageLabels(email, messageId, ['UNREAD'], []);
    return `Message ${messageId} marked as unread.`;
}

async function starEmail(email: string, messageId: string) {
    await modifyMessageLabels(email, messageId, ['STARRED'], []);
    return `Message ${messageId} starred.`;
}

async function unstarEmail(email: string, messageId: string) {
    await modifyMessageLabels(email, messageId, [], ['STARRED']);
    return `Message ${messageId} unstarred.`;
}

async function applyLabel(email: string, messageId: string, labelId: string) {
    await modifyMessageLabels(email, messageId, [labelId], []);
    return `Label ${labelId} applied to message ${messageId}.`;
}

async function removeLabel(email: string, messageId: string, labelId: string) {
    await modifyMessageLabels(email, messageId, [], [labelId]);
    return `Label ${labelId} removed from message ${messageId}.`;
}

async function listLabels(email: string) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const response = await gmail.users.labels.list({ userId: 'me' });
    const labels = (response.data.labels || []).map(l => ({ id: l.id, name: l.name, type: l.type }));
    return JSON.stringify(labels, null, 2);
}

async function listDrafts(email: string, maxResults: number = 10, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const response = await gmail.users.drafts.list({ userId: 'me', maxResults, pageToken });
    const drafts = response.data.drafts;
    if (!drafts || drafts.length === 0) return 'No drafts found.';

    const detailed = await Promise.all(drafts.map(async d => {
        if (!d.id) return null;
        try {
            const draft = await gmail.users.drafts.get({ userId: 'me', id: d.id, format: 'metadata' });
            const headers = draft.data.message?.payload?.headers || [];
            return {
                draftId: d.id,
                messageId: draft.data.message?.id,
                subject: headers.find(h => h.name === 'Subject')?.value || '(no subject)',
                to: headers.find(h => h.name === 'To')?.value || '',
                date: headers.find(h => h.name === 'Date')?.value || ''
            };
        } catch { return null; }
    }));
    return JSON.stringify({ drafts: detailed.filter(Boolean), nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function sendDraft(email: string, draftId: string) {
    const { client, permissions } = await getAuthClient(email);
    assertGmailCanSend(permissions, email);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const response = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
    return `Draft sent successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
}

// --- Google Chat Implementations ---

async function chatListSpaces(email: string, maxResults: number = 25, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });

    const response = await chat.spaces.list({ pageSize: maxResults, pageToken });
    const spaces = response.data.spaces;

    if (!spaces || spaces.length === 0) {
        return "No spaces found for this account.";
    }

    const result = spaces.map(s => ({
        name: s.name,
        displayName: s.displayName || '(Direct Message)',
        type: s.spaceType,
    }));

    return JSON.stringify({ spaces: result, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function chatListMessages(email: string, spaceName: string, maxResults: number = 25, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });

    const response = await chat.spaces.messages.list({
        parent: spaceName,
        pageSize: maxResults,
        orderBy: 'createTime desc',
        pageToken
    });

    const messages = response.data.messages;
    if (!messages || messages.length === 0) {
        return "No messages found in this space.";
    }

    const result = messages.map(m => ({
        name: m.name,
        threadName: m.thread?.name,
        sender: m.sender?.displayName || m.sender?.name || 'Unknown',
        text: m.text || m.formattedText || '',
        createTime: m.createTime,
        attachments: (m.attachment || []).map(a => ({
            resourceName: a.attachmentDataRef?.resourceName,
            contentName: a.contentName,
            contentType: a.contentType
        }))
    }));

    return JSON.stringify({ messages: result, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function chatSendMessage(email: string, spaceName: string, text: string, threadName?: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);

    const chat = google.chat({ version: 'v1', auth: client });

    const response = await chat.spaces.messages.create({
        parent: spaceName,
        messageReplyOption: threadName ? 'REPLY_MESSAGE_OR_FAIL' : undefined,
        requestBody: {
            text,
            thread: threadName ? { name: threadName } : undefined
        }
    });

    return `Message sent successfully. Message name: ${response.data.name}`;
}

async function chatAddReaction(email: string, messageName: string, emoji: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);

    const chat = google.chat({ version: 'v1', auth: client });

    await chat.spaces.messages.reactions.create({
        parent: messageName,
        requestBody: { emoji: { unicode: emoji } }
    });

    return `Reaction '${emoji}' added to message ${messageName}.`;
}

async function chatGetMessage(email: string, messageName: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.spaces.messages.get({ name: messageName });
    const m = response.data;
    return JSON.stringify({
        name: m.name,
        threadName: m.thread?.name,
        sender: m.sender?.displayName || m.sender?.name || 'Unknown',
        text: m.text || m.formattedText || '',
        createTime: m.createTime,
        lastUpdateTime: m.lastUpdateTime,
        attachments: (m.attachment || []).map(a => ({
            resourceName: a.attachmentDataRef?.resourceName,
            contentName: a.contentName,
            contentType: a.contentType
        }))
    }, null, 2);
}

async function chatDeleteMessage(email: string, messageName: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });
    await chat.spaces.messages.delete({ name: messageName });
    return `Message ${messageName} deleted.`;
}

async function chatUpdateMessage(email: string, messageName: string, text: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.spaces.messages.patch({
        name: messageName,
        updateMask: 'text',
        requestBody: { text }
    });
    return `Message ${response.data.name} updated.`;
}

async function chatListReactions(email: string, messageName: string, maxResults: number = 25, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.spaces.messages.reactions.list({
        parent: messageName,
        pageSize: maxResults,
        pageToken
    });
    const reactions = (response.data.reactions || []).map(r => ({
        name: r.name,
        emoji: r.emoji?.unicode || r.emoji?.customEmoji?.uid,
        user: r.user?.displayName || r.user?.name
    }));
    return JSON.stringify({ reactions, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function chatRemoveReaction(email: string, reactionName: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });
    await chat.spaces.messages.reactions.delete({ name: reactionName });
    return `Reaction ${reactionName} removed.`;
}

async function chatGetAttachment(email: string, resourceName: string, filename?: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.media.download({ resourceName }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data as ArrayBuffer);
    return JSON.stringify({
        filename: filename || 'attachment',
        size: buffer.length,
        data: buffer.toString('base64')
    });
}

async function chatListMembers(email: string, spaceName: string, maxResults: number = 50, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.spaces.members.list({
        parent: spaceName,
        pageSize: maxResults,
        pageToken
    });
    const members = (response.data.memberships || []).map(m => ({
        name: m.name,
        member: m.member?.displayName || m.member?.name,
        role: m.role,
        state: m.state
    }));
    return JSON.stringify({ members, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function chatGetSpace(email: string, spaceName: string) {
    const { client } = await getAuthClient(email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.spaces.get({ name: spaceName });
    const s = response.data;
    return JSON.stringify({
        name: s.name,
        displayName: s.displayName || '(Direct Message)',
        type: s.spaceType,
        threadedMessages: s.spaceThreadingState,
    }, null, 2);
}

async function chatCreateSpace(email: string, displayName: string, memberEmails?: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });

    const memberships = memberEmails
        ? memberEmails.split(',').map(e => ({ member: { name: `users/${e.trim()}`, type: 'HUMAN' } }))
        : undefined;

    const response = await chat.spaces.setup({
        requestBody: {
            space: { spaceType: 'SPACE', displayName },
            memberships
        }
    });
    return `Space created. Name: ${response.data.name}, Display Name: ${response.data.displayName}`;
}

async function chatAddMember(email: string, spaceName: string, memberEmail: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });
    const response = await chat.spaces.members.create({
        parent: spaceName,
        requestBody: { member: { name: `users/${memberEmail}`, type: 'HUMAN' } }
    });
    return `${memberEmail} added to ${spaceName}. Membership: ${response.data.name}`;
}

async function chatRemoveMember(email: string, spaceName: string, memberEmail: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });
    await chat.spaces.members.delete({ name: `${spaceName}/members/${memberEmail}` });
    return `${memberEmail} removed from ${spaceName}.`;
}

async function chatUploadAttachment(email: string, spaceName: string, filename: string, mimeType: string, data: string, text?: string, threadName?: string) {
    const { client, permissions } = await getAuthClient(email);
    assertChatCanSend(permissions, email);
    const chat = google.chat({ version: 'v1', auth: client });

    const buffer = Buffer.from(data, 'base64');
    const { Readable } = await import('stream');
    const stream = Readable.from(buffer);

    const uploadResponse = await chat.media.upload({
        parent: spaceName,
        requestBody: { filename },
        media: { mimeType, body: stream }
    });

    const attachmentUploadToken = uploadResponse.data.attachmentDataRef?.attachmentUploadToken;
    if (!attachmentUploadToken) {
        throw new Error('Attachment upload succeeded but no upload token was returned.');
    }

    const response = await chat.spaces.messages.create({
        parent: spaceName,
        messageReplyOption: threadName ? 'REPLY_MESSAGE_OR_FAIL' : undefined,
        requestBody: {
            text,
            thread: threadName ? { name: threadName } : undefined,
            attachment: [{ attachmentDataRef: { attachmentUploadToken } }]
        }
    });

    return `File uploaded and sent. Message name: ${response.data.name}`;
}


// --- Google Calendar Implementations ---

async function calendarListCalendars(email: string) {
    const { client } = await getAuthClient(email);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.calendarList.list();
    const items = (response.data.items || []).map(c => ({
        id: c.id,
        name: c.summary,
        description: c.description,
        primary: c.primary || false,
        accessRole: c.accessRole,
        timeZone: c.timeZone
    }));
    return JSON.stringify(items, null, 2);
}

async function calendarListEvents(email: string, calendarId: string, maxResults: number = 10, timeMin?: string, timeMax?: string, query?: string, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.list({
        calendarId,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || undefined,
        q: query || undefined,
        pageToken
    });
    const events = (response.data.items || []).map(e => ({
        id: e.id,
        title: e.summary,
        description: e.description,
        location: e.location,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        attendees: (e.attendees || []).map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
        status: e.status,
        htmlLink: e.htmlLink
    }));
    return JSON.stringify({ events, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function calendarGetEvent(email: string, calendarId: string, eventId: string) {
    const { client } = await getAuthClient(email);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.get({ calendarId, eventId });
    const e = response.data;
    return JSON.stringify({
        id: e.id,
        title: e.summary,
        description: e.description,
        location: e.location,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        attendees: (e.attendees || []).map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
        organizer: e.organizer,
        status: e.status,
        htmlLink: e.htmlLink,
        meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri,
        created: e.created,
        updated: e.updated
    }, null, 2);
}

// Meet conference data is generated asynchronously by Calendar; poll briefly until the
// meeting code shows up so we can configure the Meet space (e.g. Gemini notes) right after.
async function pollForMeetingCode(calendar: any, calendarId: string, eventId: string, attempts: number = 5): Promise<string | null> {
    for (let i = 0; i < attempts; i++) {
        const ev = await calendar.events.get({ calendarId, eventId });
        const conferenceId = ev.data.conferenceData?.conferenceId;
        if (conferenceId) return conferenceId;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return null;
}

async function enableGeminiNotesForSpace(client: any, meetingCode: string) {
    const meet = google.meet({ version: 'v2', auth: client });
    await meet.spaces.patch({
        name: `spaces/${meetingCode}`,
        updateMask: 'config.artifactConfig.smartNotesConfig.autoSmartNotesGeneration',
        requestBody: {
            config: {
                artifactConfig: {
                    smartNotesConfig: { autoSmartNotesGeneration: 'ON' }
                }
            }
        }
    });
}

async function calendarCreateEvent(
    email: string,
    calendarId: string,
    title: string,
    startDateTime: string,
    endDateTime: string,
    description?: string,
    location?: string,
    attendees?: string,
    isAllDay?: boolean,
    timeZone?: string,
    addGoogleMeet?: boolean,
    enableGeminiNotes?: boolean
) {
    const { client, permissions } = await getAuthClient(email);
    assertCalendarCanWrite(permissions, email);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const attendeeList = attendees ? attendees.split(',').map(a => ({ email: a.trim() })) : [];

    const startObj = isAllDay ? { date: startDateTime } : { dateTime: startDateTime, timeZone };
    const endObj = isAllDay ? { date: endDateTime } : { dateTime: endDateTime, timeZone };

    const requestBody: any = {
        summary: title,
        description,
        location,
        start: startObj,
        end: endObj,
        attendees: attendeeList.length > 0 ? attendeeList : undefined
    };

    if (addGoogleMeet) {
        requestBody.conferenceData = {
            createRequest: {
                requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
        };
    }

    const response = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: addGoogleMeet ? 1 : undefined,
        requestBody
    });

    const meetLink = response.data.hangoutLink
        || response.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;

    let notesNote = '';
    if (addGoogleMeet && enableGeminiNotes) {
        try {
            const meetingCode = response.data.conferenceData?.conferenceId
                || await pollForMeetingCode(calendar, calendarId, response.data.id!);
            if (meetingCode) {
                await enableGeminiNotesForSpace(client, meetingCode);
                notesNote = ' Gemini note-taking enabled.';
            } else {
                notesNote = ' (Meet link created, but Gemini notes could not be enabled: conference data was not ready in time.)';
            }
        } catch (e: any) {
            notesNote = ` (Meet link created, but Gemini notes could not be enabled: ${e.message})`;
        }
    }

    return `Event created. ID: ${response.data.id}${meetLink ? `, Meet Link: ${meetLink}` : ''}, Link: ${response.data.htmlLink}.${notesNote}`;
}

async function calendarUpdateEvent(
    email: string,
    calendarId: string,
    eventId: string,
    title?: string,
    startDateTime?: string,
    endDateTime?: string,
    description?: string,
    location?: string,
    attendees?: string,
    timeZone?: string
) {
    const { client, permissions } = await getAuthClient(email);
    assertCalendarCanWrite(permissions, email);
    const calendar = google.calendar({ version: 'v3', auth: client });

    // Fetch existing event to patch
    const existing = await calendar.events.get({ calendarId, eventId });
    const patch: any = {};
    if (title !== undefined) patch.summary = title;
    if (description !== undefined) patch.description = description;
    if (location !== undefined) patch.location = location;
    if (startDateTime !== undefined) patch.start = { dateTime: startDateTime, timeZone };
    if (endDateTime !== undefined) patch.end = { dateTime: endDateTime, timeZone };
    if (attendees !== undefined) patch.attendees = attendees.split(',').map(a => ({ email: a.trim() }));

    const response = await calendar.events.patch({ calendarId, eventId, requestBody: patch });
    return `Event updated. ID: ${response.data.id}, Link: ${response.data.htmlLink}`;
}

async function calendarDeleteEvent(email: string, calendarId: string, eventId: string) {
    const { client, permissions } = await getAuthClient(email);
    assertCalendarCanWrite(permissions, email);
    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.delete({ calendarId, eventId });
    return `Event ${eventId} deleted.`;
}

async function calendarQuickAdd(email: string, calendarId: string, text: string) {
    const { client, permissions } = await getAuthClient(email);
    assertCalendarCanWrite(permissions, email);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.quickAdd({ calendarId, text });
    return `Event created. ID: ${response.data.id}, Title: ${response.data.summary}, Start: ${response.data.start?.dateTime || response.data.start?.date}, Link: ${response.data.htmlLink}`;
}

async function calendarRespondToEvent(email: string, calendarId: string, eventId: string, responseStatus: 'accepted' | 'declined' | 'tentative') {
    const { client, permissions } = await getAuthClient(email);
    assertCalendarCanWrite(permissions, email);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const existing = await calendar.events.get({ calendarId, eventId });
    const attendees = existing.data.attendees || [];
    const selfIndex = attendees.findIndex(a => a.email?.toLowerCase() === email.toLowerCase());

    if (selfIndex === -1) {
        throw new Error(`Account ${email} is not listed as an attendee of event ${eventId}.`);
    }

    attendees[selfIndex] = { ...attendees[selfIndex], responseStatus };

    const response = await calendar.events.patch({ calendarId, eventId, requestBody: { attendees } });
    return `RSVP updated to '${responseStatus}' for event ${eventId}. Link: ${response.data.htmlLink}`;
}


// --- Google Drive Implementations ---

async function driveListFiles(email: string, folderId?: string, maxResults: number = 20, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const drive = google.drive({ version: 'v3', auth: client });
    const parent = folderId || 'root';
    const response = await drive.files.list({
        q: `'${parent}' in parents and trashed = false`,
        pageSize: maxResults,
        pageToken,
        fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents)'
    });
    const files = (response.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink
    }));
    return JSON.stringify({ files, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function driveSearchFiles(email: string, query: string, maxResults: number = 20, pageToken?: string) {
    const { client } = await getAuthClient(email);
    const drive = google.drive({ version: 'v3', auth: client });
    const response = await drive.files.list({
        q: `${query} and trashed = false`,
        pageSize: maxResults,
        pageToken,
        fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents)'
    });
    const files = (response.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink
    }));
    return JSON.stringify({ files, nextPageToken: response.data.nextPageToken || null }, null, 2);
}

async function driveGetFile(email: string, fileId: string) {
    const { client } = await getAuthClient(email);
    const drive = google.drive({ version: 'v3', auth: client });
    const response = await drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,owners,shared,description'
    });
    return JSON.stringify(response.data, null, 2);
}

async function driveReadFile(email: string, fileId: string) {
    const { client } = await getAuthClient(email);
    const drive = google.drive({ version: 'v3', auth: client });

    // Get file metadata to determine type
    const meta = await drive.files.get({ fileId, fields: 'mimeType,name' });
    const mimeType = meta.data.mimeType || '';

    // Export Google Docs/Sheets/Slides as plain text
    if (mimeType === 'application/vnd.google-apps.document') {
        const response = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
        return response.data as string;
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        const response = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'text' });
        return response.data as string;
    }
    if (mimeType === 'application/vnd.google-apps.presentation') {
        const response = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
        return response.data as string;
    }

    // Download other text-based files
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
    return response.data as string;
}

async function driveDownloadFile(email: string, fileId: string, exportMimeType?: string) {
    const { client } = await getAuthClient(email);
    const drive = google.drive({ version: 'v3', auth: client });

    const meta = await drive.files.get({ fileId, fields: 'name,mimeType' });
    const originalMimeType = meta.data.mimeType || 'application/octet-stream';
    const filename = meta.data.name || 'file';

    let buffer: Buffer;
    let mimeType: string;

    if (originalMimeType.startsWith('application/vnd.google-apps.')) {
        // Google-native files (Docs, Sheets, Slides) must be exported to a concrete format
        mimeType = exportMimeType || 'application/pdf';
        const response = await drive.files.export({ fileId, mimeType }, { responseType: 'arraybuffer' });
        buffer = Buffer.from(response.data as ArrayBuffer);
    } else {
        mimeType = originalMimeType;
        const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        buffer = Buffer.from(response.data as ArrayBuffer);
    }

    return JSON.stringify({
        filename,
        mimeType,
        size: buffer.length,
        data: buffer.toString('base64')
    });
}

async function driveUploadFile(email: string, filename: string, mimeType: string, data: string, folderId?: string) {
    const { client, permissions } = await getAuthClient(email);
    assertDriveCanWrite(permissions, email);
    const drive = google.drive({ version: 'v3', auth: client });

    const buffer = Buffer.from(data, 'base64');
    const { Readable } = await import('stream');
    const stream = Readable.from(buffer);

    const response = await drive.files.create({
        requestBody: {
            name: filename,
            parents: folderId ? [folderId] : undefined
        },
        media: { mimeType, body: stream },
        fields: 'id,name,webViewLink'
    });
    return `File uploaded. ID: ${response.data.id}, Name: ${response.data.name}, Link: ${response.data.webViewLink}`;
}

async function driveCreateFolder(email: string, name: string, parentFolderId?: string) {
    const { client, permissions } = await getAuthClient(email);
    assertDriveCanWrite(permissions, email);
    const drive = google.drive({ version: 'v3', auth: client });
    const response = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentFolderId ? [parentFolderId] : undefined
        },
        fields: 'id,name,webViewLink'
    });
    return `Folder created. ID: ${response.data.id}, Name: ${response.data.name}`;
}

async function driveDeleteFile(email: string, fileId: string) {
    const { client, permissions } = await getAuthClient(email);
    assertDriveCanWrite(permissions, email);
    const drive = google.drive({ version: 'v3', auth: client });
    await drive.files.delete({ fileId });
    return `File ${fileId} deleted.`;
}

async function driveShareFile(email: string, fileId: string, shareWithEmail: string, role: string = 'reader', sendNotification: boolean = true) {
    const { client, permissions } = await getAuthClient(email);
    assertDriveCanWrite(permissions, email);
    const drive = google.drive({ version: 'v3', auth: client });
    await drive.permissions.create({
        fileId,
        sendNotificationEmail: sendNotification,
        requestBody: { type: 'user', role, emailAddress: shareWithEmail }
    });
    return `File ${fileId} shared with ${shareWithEmail} as ${role}.`;
}

async function driveMoveFile(email: string, fileId: string, newParentFolderId: string) {
    const { client, permissions } = await getAuthClient(email);
    assertDriveCanWrite(permissions, email);
    const drive = google.drive({ version: 'v3', auth: client });

    // Get current parents
    const file = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = (file.data.parents || []).join(',');

    await drive.files.update({
        fileId,
        addParents: newParentFolderId,
        removeParents: previousParents,
        fields: 'id,parents'
    });
    return `File ${fileId} moved to folder ${newParentFolderId}.`;
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
                result = await searchEmails(args.email, args.query, maxResults, typeof args.pageToken === 'string' ? args.pageToken : undefined);
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
                result = await draftEmail(args.email, args.to, args.subject, args.body, args.contentType as 'text' | 'markdown' | 'html' | undefined, typeof args.cc === 'string' ? args.cc : undefined, typeof args.bcc === 'string' ? args.bcc : undefined, Array.isArray(args.attachments) ? args.attachments : undefined);
                break;
            case "gmail_send":
                if (!args || typeof args.email !== 'string' || typeof args.to !== 'string' || typeof args.subject !== 'string' || typeof args.body !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_send.");
                }
                result = await sendEmail(args.email, args.to, args.subject, args.body, args.contentType as 'text' | 'markdown' | 'html' | undefined, typeof args.cc === 'string' ? args.cc : undefined, typeof args.bcc === 'string' ? args.bcc : undefined, Array.isArray(args.attachments) ? args.attachments : undefined);
                break;
            case "chat_list_spaces":
                if (!args || typeof args.email !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_list_spaces.");
                }
                result = await chatListSpaces(args.email, typeof args.maxResults === 'number' ? args.maxResults : 25, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "chat_list_messages":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_list_messages.");
                }
                result = await chatListMessages(args.email, args.spaceName, typeof args.maxResults === 'number' ? args.maxResults : 25, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "chat_send_message":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string' || typeof args.text !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_send_message.");
                }
                result = await chatSendMessage(args.email, args.spaceName, args.text, typeof args.threadName === 'string' ? args.threadName : undefined);
                break;
            case "chat_add_reaction":
                if (!args || typeof args.email !== 'string' || typeof args.messageName !== 'string' || typeof args.emoji !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_add_reaction.");
                }
                result = await chatAddReaction(args.email, args.messageName, args.emoji);
                break;
            case "chat_get_message":
                if (!args || typeof args.email !== 'string' || typeof args.messageName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_get_message.");
                }
                result = await chatGetMessage(args.email, args.messageName);
                break;
            case "chat_delete_message":
                if (!args || typeof args.email !== 'string' || typeof args.messageName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_delete_message.");
                }
                result = await chatDeleteMessage(args.email, args.messageName);
                break;
            case "chat_update_message":
                if (!args || typeof args.email !== 'string' || typeof args.messageName !== 'string' || typeof args.text !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_update_message.");
                }
                result = await chatUpdateMessage(args.email, args.messageName, args.text);
                break;
            case "chat_list_reactions":
                if (!args || typeof args.email !== 'string' || typeof args.messageName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_list_reactions.");
                }
                result = await chatListReactions(args.email, args.messageName, typeof args.maxResults === 'number' ? args.maxResults : 25, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "chat_remove_reaction":
                if (!args || typeof args.email !== 'string' || typeof args.reactionName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_remove_reaction.");
                }
                result = await chatRemoveReaction(args.email, args.reactionName);
                break;
            case "chat_get_attachment":
                if (!args || typeof args.email !== 'string' || typeof args.resourceName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_get_attachment.");
                }
                result = await chatGetAttachment(args.email, args.resourceName, typeof args.filename === 'string' ? args.filename : undefined);
                break;
            case "chat_list_members":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_list_members.");
                }
                result = await chatListMembers(args.email, args.spaceName, typeof args.maxResults === 'number' ? args.maxResults : 50, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "chat_get_space":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_get_space.");
                }
                result = await chatGetSpace(args.email, args.spaceName);
                break;
            case "chat_create_space":
                if (!args || typeof args.email !== 'string' || typeof args.displayName !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_create_space.");
                }
                result = await chatCreateSpace(args.email, args.displayName, typeof args.memberEmails === 'string' ? args.memberEmails : undefined);
                break;
            case "chat_add_member":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string' || typeof args.memberEmail !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_add_member.");
                }
                result = await chatAddMember(args.email, args.spaceName, args.memberEmail);
                break;
            case "chat_remove_member":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string' || typeof args.memberEmail !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_remove_member.");
                }
                result = await chatRemoveMember(args.email, args.spaceName, args.memberEmail);
                break;
            case "chat_upload_attachment":
                if (!args || typeof args.email !== 'string' || typeof args.spaceName !== 'string' || typeof args.filename !== 'string' || typeof args.mimeType !== 'string' || typeof args.data !== 'string') {
                    throw new Error("Missing or invalid arguments for chat_upload_attachment.");
                }
                result = await chatUploadAttachment(args.email, args.spaceName, args.filename, args.mimeType, args.data, typeof args.text === 'string' ? args.text : undefined, typeof args.threadName === 'string' ? args.threadName : undefined);
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
                    args.contentType as 'text' | 'markdown' | 'html' | undefined,
                    typeof args.cc === 'string' ? args.cc : undefined,
                    typeof args.bcc === 'string' ? args.bcc : undefined,
                    Array.isArray(args.attachments) ? args.attachments : undefined
                );
                break;
            case "gmail_forward":
                if (!args || typeof args.email !== 'string' || typeof args.to !== 'string' || typeof args.subject !== 'string' || typeof args.body !== 'string' || typeof args.originalMessageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_forward.");
                }
                result = await forwardEmail(args.email, args.to, args.subject, args.body, args.originalMessageId, typeof args.cc === 'string' ? args.cc : undefined, typeof args.bcc === 'string' ? args.bcc : undefined, args.contentType as 'text' | 'markdown' | 'html' | undefined, Array.isArray(args.attachments) ? args.attachments : undefined);
                break;
            case "gmail_trash":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_trash.");
                }
                result = await trashEmail(args.email, args.messageId);
                break;
            case "gmail_delete":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_delete.");
                }
                result = await deleteEmail(args.email, args.messageId);
                break;
            case "gmail_mark_read":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_mark_read.");
                }
                result = await markRead(args.email, args.messageId);
                break;
            case "gmail_mark_unread":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_mark_unread.");
                }
                result = await markUnread(args.email, args.messageId);
                break;
            case "gmail_star":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_star.");
                }
                result = await starEmail(args.email, args.messageId);
                break;
            case "gmail_unstar":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_unstar.");
                }
                result = await unstarEmail(args.email, args.messageId);
                break;
            case "gmail_list_labels":
                if (!args || typeof args.email !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_list_labels.");
                }
                result = await listLabels(args.email);
                break;
            case "gmail_apply_label":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string' || typeof args.labelId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_apply_label.");
                }
                result = await applyLabel(args.email, args.messageId, args.labelId);
                break;
            case "gmail_remove_label":
                if (!args || typeof args.email !== 'string' || typeof args.messageId !== 'string' || typeof args.labelId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_remove_label.");
                }
                result = await removeLabel(args.email, args.messageId, args.labelId);
                break;
            case "gmail_list_drafts":
                if (!args || typeof args.email !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_list_drafts.");
                }
                result = await listDrafts(args.email, typeof args.maxResults === 'number' ? args.maxResults : 10, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "gmail_send_draft":
                if (!args || typeof args.email !== 'string' || typeof args.draftId !== 'string') {
                    throw new Error("Missing or invalid arguments for gmail_send_draft.");
                }
                result = await sendDraft(args.email, args.draftId);
                break;

            // Calendar cases
            case "calendar_list_calendars":
                if (!args || typeof args.email !== 'string') throw new Error("Missing or invalid arguments for calendar_list_calendars.");
                result = await calendarListCalendars(args.email);
                break;
            case "calendar_list_events":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string') throw new Error("Missing or invalid arguments for calendar_list_events.");
                result = await calendarListEvents(args.email, args.calendarId, typeof args.maxResults === 'number' ? args.maxResults : 10, typeof args.timeMin === 'string' ? args.timeMin : undefined, typeof args.timeMax === 'string' ? args.timeMax : undefined, typeof args.query === 'string' ? args.query : undefined, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "calendar_get_event":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string' || typeof args.eventId !== 'string') throw new Error("Missing or invalid arguments for calendar_get_event.");
                result = await calendarGetEvent(args.email, args.calendarId, args.eventId);
                break;
            case "calendar_create_event":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string' || typeof args.title !== 'string' || typeof args.startDateTime !== 'string' || typeof args.endDateTime !== 'string') throw new Error("Missing or invalid arguments for calendar_create_event.");
                result = await calendarCreateEvent(args.email, args.calendarId, args.title, args.startDateTime, args.endDateTime, typeof args.description === 'string' ? args.description : undefined, typeof args.location === 'string' ? args.location : undefined, typeof args.attendees === 'string' ? args.attendees : undefined, typeof args.isAllDay === 'boolean' ? args.isAllDay : false, typeof args.timeZone === 'string' ? args.timeZone : undefined, typeof args.addGoogleMeet === 'boolean' ? args.addGoogleMeet : false, typeof args.enableGeminiNotes === 'boolean' ? args.enableGeminiNotes : false);
                break;
            case "calendar_update_event":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string' || typeof args.eventId !== 'string') throw new Error("Missing or invalid arguments for calendar_update_event.");
                result = await calendarUpdateEvent(args.email, args.calendarId, args.eventId, typeof args.title === 'string' ? args.title : undefined, typeof args.startDateTime === 'string' ? args.startDateTime : undefined, typeof args.endDateTime === 'string' ? args.endDateTime : undefined, typeof args.description === 'string' ? args.description : undefined, typeof args.location === 'string' ? args.location : undefined, typeof args.attendees === 'string' ? args.attendees : undefined, typeof args.timeZone === 'string' ? args.timeZone : undefined);
                break;
            case "calendar_delete_event":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string' || typeof args.eventId !== 'string') throw new Error("Missing or invalid arguments for calendar_delete_event.");
                result = await calendarDeleteEvent(args.email, args.calendarId, args.eventId);
                break;
            case "calendar_quick_add":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string' || typeof args.text !== 'string') throw new Error("Missing or invalid arguments for calendar_quick_add.");
                result = await calendarQuickAdd(args.email, args.calendarId, args.text);
                break;
            case "calendar_respond_to_event":
                if (!args || typeof args.email !== 'string' || typeof args.calendarId !== 'string' || typeof args.eventId !== 'string' || typeof args.responseStatus !== 'string') throw new Error("Missing or invalid arguments for calendar_respond_to_event.");
                result = await calendarRespondToEvent(args.email, args.calendarId, args.eventId, args.responseStatus as 'accepted' | 'declined' | 'tentative');
                break;

            // Drive cases
            case "drive_list_files":
                if (!args || typeof args.email !== 'string') throw new Error("Missing or invalid arguments for drive_list_files.");
                result = await driveListFiles(args.email, typeof args.folderId === 'string' ? args.folderId : undefined, typeof args.maxResults === 'number' ? args.maxResults : 20, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "drive_search_files":
                if (!args || typeof args.email !== 'string' || typeof args.query !== 'string') throw new Error("Missing or invalid arguments for drive_search_files.");
                result = await driveSearchFiles(args.email, args.query, typeof args.maxResults === 'number' ? args.maxResults : 20, typeof args.pageToken === 'string' ? args.pageToken : undefined);
                break;
            case "drive_get_file":
                if (!args || typeof args.email !== 'string' || typeof args.fileId !== 'string') throw new Error("Missing or invalid arguments for drive_get_file.");
                result = await driveGetFile(args.email, args.fileId);
                break;
            case "drive_read_file":
                if (!args || typeof args.email !== 'string' || typeof args.fileId !== 'string') throw new Error("Missing or invalid arguments for drive_read_file.");
                result = await driveReadFile(args.email, args.fileId);
                break;
            case "drive_download_file":
                if (!args || typeof args.email !== 'string' || typeof args.fileId !== 'string') throw new Error("Missing or invalid arguments for drive_download_file.");
                result = await driveDownloadFile(args.email, args.fileId, typeof args.exportMimeType === 'string' ? args.exportMimeType : undefined);
                break;
            case "drive_upload_file":
                if (!args || typeof args.email !== 'string' || typeof args.filename !== 'string' || typeof args.mimeType !== 'string' || typeof args.data !== 'string') throw new Error("Missing or invalid arguments for drive_upload_file.");
                result = await driveUploadFile(args.email, args.filename, args.mimeType, args.data, typeof args.folderId === 'string' ? args.folderId : undefined);
                break;
            case "drive_create_folder":
                if (!args || typeof args.email !== 'string' || typeof args.name !== 'string') throw new Error("Missing or invalid arguments for drive_create_folder.");
                result = await driveCreateFolder(args.email, args.name, typeof args.parentFolderId === 'string' ? args.parentFolderId : undefined);
                break;
            case "drive_delete_file":
                if (!args || typeof args.email !== 'string' || typeof args.fileId !== 'string') throw new Error("Missing or invalid arguments for drive_delete_file.");
                result = await driveDeleteFile(args.email, args.fileId);
                break;
            case "drive_share_file":
                if (!args || typeof args.email !== 'string' || typeof args.fileId !== 'string' || typeof args.shareWithEmail !== 'string') throw new Error("Missing or invalid arguments for drive_share_file.");
                result = await driveShareFile(args.email, args.fileId, args.shareWithEmail, typeof args.role === 'string' ? args.role : 'reader', typeof args.sendNotification === 'boolean' ? args.sendNotification : true);
                break;
            case "drive_move_file":
                if (!args || typeof args.email !== 'string' || typeof args.fileId !== 'string' || typeof args.newParentFolderId !== 'string') throw new Error("Missing or invalid arguments for drive_move_file.");
                result = await driveMoveFile(args.email, args.fileId, args.newParentFolderId);
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
