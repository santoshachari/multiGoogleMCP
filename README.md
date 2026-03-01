# Multi-Gmail MCP Server

A Model Context Protocol (MCP) server that connects your AI assistant to multiple Gmail accounts simultaneously. Search emails, read content, draft, send, and reply — with per-account permission controls (full, read-only, or draft-only).

## 1. Setup Google Cloud Project

Since this runs locally, you need your own Google Cloud OAuth credentials:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., "Multi-Gmail MCP").
3. Go to **APIs & Services > Library**, search for **Gmail API**, and enable it.
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

# Draft-only (can read and draft, but not send)
npm run auth -- --draftonly
```

This opens a browser window for Google OAuth. Run the command once per account — credentials are saved locally in `tokens.json`.

> **Note:** Your Google Cloud project will be in "Testing" status, so Google shows a "Google hasn't verified this app" warning. Click **Advanced** then **Go to [Your App Name] (unsafe)** — this is expected since you built the app yourself.

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

| Tool | Description |
|---|---|
| `gmail_list_accounts` | List all authenticated accounts |
| `gmail_search` | Search emails using Gmail search operators |
| `gmail_read` | Read the full content of an email by ID |
| `gmail_draft` | Create a draft email |
| `gmail_send` | Send an email |
| `gmail_reply` | Reply to an email within its thread (send or draft) |

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
