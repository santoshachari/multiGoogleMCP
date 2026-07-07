# Multi-Gmail MCP Server

A Model Context Protocol (MCP) server that connects your AI assistant to multiple Gmail accounts simultaneously. Search emails, read content, draft, send, and reply — with per-account permission controls (full, read-only, or draft-only).

## 1. Setup Google Cloud Project

Since this runs locally, you need your own Google Cloud OAuth credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., "Multi-Gmail MCP").
3. Go to **APIs & Services > Library** and enable the **Gmail API**, **Google Calendar API**, and **Google Drive API**.
4. Go to **APIs & Services > OAuth consent screen**:
   - Choose **External** user type.
   - Fill in the required fields (App name, User support email, Developer contact email).
   - Click **Save and Continue** until you reach the **Test users** step.
   - Add the Gmail addresses you plan to connect as test users (required — Google blocks logins for unlisted users).
   - Click **Save and Continue**.
5. Go to **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Choose **Desktop app** as the application type.
   - Click **Create**.
6. Click **Download JSON** on your new credential.
7. Rename the downloaded file to `credentials.json` and place it in the project root.

## 2. Install & Build

```bash
npm install
npm run build
```

## 3. Authenticate Your Accounts

Authorize each Gmail account you want the server to access:

```bash
# Full access (read, compose, send)
npm run auth

# Read-only (no drafting or sending)
npm run auth -- --readonly

# Draft-only (can read and draft, but not send; Calendar/Drive are read-only)
npm run auth -- --draftonly
```

This opens a browser window for Google OAuth. Run the command once per account — credentials are saved locally in `tokens.json`.

> **Note:** Your Google Cloud project will be in "Testing" status, so Google shows a "Google hasn't verified this app" warning. Click **Advanced** then **Go to [Your App Name] (unsafe)** — this is expected since you built the app yourself.

> **Re-authenticating existing accounts:** If you authenticated an account before Calendar/Drive support was added (or before draft-only mode became read-only for Calendar/Drive), re-run the `npm run auth` command for that account with the same mode flag to pick up the current scopes. Google reuses the same consent flow, so no new credentials are needed.

## 4. Connecting to Claude Desktop

Add the server to your Claude Desktop configuration file.

### macOS

Config file location: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "multi_gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multiGoogleMCP/build/index.js"],
      "env": {
        "NODE_PATH": "/absolute/path/to/multiGoogleMCP/node_modules"
      }
    }
  }
}
```

### Windows

Config file location: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "multi_gmail": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\multiGoogleMCP\\build\\index.js"],
      "env": {
        "NODE_PATH": "C:\\absolute\\path\\to\\multiGoogleMCP\\node_modules"
      }
    }
  }
}
```

> Replace the paths above with the actual absolute path to your project folder.

After editing the config, **restart Claude Desktop** for changes to take effect.

## 5. Connecting to VS Code (Copilot)

Create a `.vscode/mcp.json` file in your workspace (or add to your user settings):

```json
{
  "servers": {
    "multi_gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multiGoogleMCP/build/index.js"],
      "env": {
        "NODE_PATH": "/absolute/path/to/multiGoogleMCP/node_modules"
      }
    }
  }
}
```

On Windows, use backslash paths:

```json
{
  "servers": {
    "multi_gmail": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\multiGoogleMCP\\build\\index.js"],
      "env": {
        "NODE_PATH": "C:\\absolute\\path\\to\\multiGoogleMCP\\node_modules"
      }
    }
  }
}
```

VS Code will prompt you to trust the server the first time it starts.

## 6. Connecting to Google Antigravity

Open the Agent Panel, go to **MCP Servers > Manage MCP Servers > Edit configuration** to open `mcp_config.json`, then add:

```json
{
  "mcpServers": {
    "multi_gmail": {
      "command": "node",
      "args": ["/absolute/path/to/multiGoogleMCP/build/index.js"],
      "env": {
        "NODE_PATH": "/absolute/path/to/multiGoogleMCP/node_modules"
      }
    }
  }
}
```

> Use absolute paths. On Windows, use backslash paths (e.g., `C:\\Users\\...`).

## 7. Connecting to Cursor

Add a new MCP server in Cursor settings:

- **Type:** `command`
- **Command:** `node /absolute/path/to/multiGoogleMCP/build/index.js`

If you run into module resolution errors, set the `NODE_PATH` environment variable to `<project-path>/node_modules`.

## Available Tools

### Gmail

| Tool | Description |
|---|---|
| `gmail_list_accounts` | List all authenticated accounts |
| `gmail_search` | Search emails using Gmail search operators |
| `gmail_read` | Read the full content of an email by ID |
| `gmail_read_thread` | Read all messages in a thread/conversation |
| `gmail_draft` | Create a draft email (supports cc, bcc, attachments) |
| `gmail_send` | Send an email (supports cc, bcc, attachments) |
| `gmail_reply` | Reply to an email within its thread (send or draft) |
| `gmail_forward` | Forward an email to new recipients |
| `gmail_get_attachment` | Download an attachment from a message |
| `gmail_trash` | Move an email to trash |
| `gmail_delete` | Permanently delete an email |
| `gmail_mark_read` / `gmail_mark_unread` | Change an email's read state |
| `gmail_star` / `gmail_unstar` | Star or unstar an email |
| `gmail_list_labels` | List all labels/folders |
| `gmail_apply_label` / `gmail_remove_label` | Apply or remove a label from an email |
| `gmail_list_drafts` | List existing draft emails |
| `gmail_send_draft` | Send a previously saved draft |

### Google Calendar

| Tool | Description |
|---|---|
| `calendar_list_calendars` | List all calendars in the account |
| `calendar_list_events` | List upcoming events, with time range and search filters |
| `calendar_get_event` | Get full details of a specific event |
| `calendar_create_event` | Create an event (supports attendees, location, all-day) |
| `calendar_update_event` | Update fields on an existing event |
| `calendar_delete_event` | Delete an event |
| `calendar_quick_add` | Create an event from natural language text |
| `calendar_respond_to_event` | RSVP to an event invitation (accept/decline/tentative) |

### Google Drive

| Tool | Description |
|---|---|
| `drive_list_files` | List files/folders in a given folder (or root) |
| `drive_search_files` | Search using Drive query syntax |
| `drive_get_file` | Get metadata for a file or folder |
| `drive_read_file` | Read text content (exports Google Docs/Sheets/Slides as text) |
| `drive_download_file` | Download binary content as base64 (images, PDFs, zips, etc.) |
| `drive_upload_file` | Upload a base64-encoded file |
| `drive_create_folder` | Create a new folder |
| `drive_delete_file` | Move a file or folder to trash |
| `drive_share_file` | Share a file/folder with another user |
| `drive_move_file` | Move a file/folder to a different parent folder |

### Google Chat

| Tool | Description |
|---|---|
| `chat_list_spaces` | List Chat spaces/rooms the account belongs to |
| `chat_list_messages` | List recent messages in a space |
| `chat_send_message` | Send a message to a space (optionally as a thread reply) |
| `chat_add_reaction` | Add an emoji reaction to a message |

> **Note:** The Chat API does not support arbitrary DM creation via user-authenticated OAuth (it requires resolving Chat user IDs through the People/Admin API). `chat_list_spaces` already lists existing DM spaces you can send to.

### Pagination

`gmail_search`, `gmail_list_drafts`, `drive_list_files`, `drive_search_files`, `calendar_list_events`, `chat_list_spaces`, and `chat_list_messages` accept an optional `pageToken` parameter and return a `nextPageToken` field in their JSON response. Pass the returned `nextPageToken` back in as `pageToken` to fetch the next page; a `null` value means there are no more results.

### Content Type Support

`gmail_draft`, `gmail_send`, and `gmail_reply` accept an optional `contentType` parameter:

| Value | Behavior |
|---|---|
| `"text"` (default) | Plain text email |
| `"markdown"` | Body is converted from Markdown to HTML |
| `"html"` | Body is sent as raw HTML |

Example — drafting a Markdown email:

```json
{
  "email": "you@gmail.com",
  "to": "recipient@example.com",
  "subject": "Weekly Update",
  "body": "# Status Report\n\n**Completed:**\n- Feature A\n- Bug fix B\n\n*Next steps:* Feature C",
  "contentType": "markdown"
}
```

The resulting email renders as formatted HTML in Gmail.
