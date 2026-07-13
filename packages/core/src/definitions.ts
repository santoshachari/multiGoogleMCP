// Tool schema definitions advertised over MCP. Extracted verbatim from the
// original stdio server so descriptions and input schemas stay identical.
// (gmail_list_accounts is included but not advertised by the platform, since
//  it is a local-only, tokens.json concept — hosts filter by IMPLEMENTED_TOOLS.)

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export const TOOL_DEFINITIONS: ToolDefinition[] = [
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
                enableGeminiNotes: { type: "boolean", description: "If true (requires addGoogleMeet), enables Gemini 'Take notes for me' auto-generated notes for the Meet space. Requires a Google Workspace account with Gemini access; silently reported as unavailable otherwise." },
                recurrence: {
                    type: "array",
                    items: { type: "string" },
                    description: "Makes this a repeating event. One or more RFC 5545 recurrence rule lines (RRULE/EXRULE/RDATE/EXDATE) — do NOT include DTSTART/DTEND, those come from startDateTime/endDateTime. Examples: [\"RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\"] for every Mon/Wed/Fri forever; [\"RRULE:FREQ=DAILY;COUNT=10\"] for 10 daily occurrences; [\"RRULE:FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20261231T000000Z\"] for the 1st of every month until end of 2026. Omit entirely for a one-off event."
                }
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
                eventId: { type: "string", description: "The event ID to update (from calendar_list_events). To edit a whole recurring series, use the series' event ID (the recurringEventId), not a single instance's ID." },
                title: { type: "string", description: "New title/summary." },
                startDateTime: { type: "string", description: "New start date/time in ISO 8601 format." },
                endDateTime: { type: "string", description: "New end date/time in ISO 8601 format." },
                description: { type: "string", description: "New description." },
                location: { type: "string", description: "New location." },
                attendees: { type: "string", description: "Comma-separated list of attendee email addresses (replaces existing)." },
                timeZone: { type: "string", description: "Timezone for the event." },
                recurrence: {
                    type: "array",
                    items: { type: "string" },
                    description: "Replaces the event's recurrence rule with one or more RFC 5545 lines (same format as calendar_create_event's recurrence). Pass an empty array to stop the event from repeating (turn it back into a single event). Omit entirely to leave recurrence unchanged."
                }
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
