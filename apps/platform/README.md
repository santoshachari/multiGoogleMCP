# Google MCP Platform — web app

Multi-tenant web app that wraps the `multiGoogleMCP` tool core: users sign in,
connect Google accounts, and hand out scoped agents + API keys to their AI
clients. Built with Next.js (App Router), Prisma + Postgres, and Auth.js.

> **Status: functional end-to-end.** Sign in, connect Google accounts
> (encrypted tokens), create scoped agents, mint API keys, and connect an MCP
> client to the agent's endpoint — all 53 Gmail/Calendar/Drive/Chat tools are
> served, scoped per agent.

## Connecting an MCP client

Each agent is served at a single endpoint, authenticated by one of its API keys:

```
POST http://localhost:3000/api/mcp
Authorization: Bearer mcp_<your-key>
```

The client sees only the tools for services the agent has been granted, and
every call is scoped to the agent's granted accounts at the granted permission.
Pass one of the agent's accessible account addresses as the `email` argument to
each tool (the `initialize` response lists them).

Example Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-google-agent": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer mcp_<your-key>" }
    }
  }
}
```

## One-time setup

1. **Postgres** — a local database must exist. This app is wired to
   `postgresql://santosh@localhost:5432/multigmail`; change `DATABASE_URL` in
   `.env` if yours differs.

2. **Google Web OAuth client** (for platform login — separate from the Desktop
   client the local MCP server uses):
   - Google Cloud Console → **APIs & Services → Credentials → Create
     credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Paste the client id/secret into `.env` as `AUTH_GOOGLE_ID` /
     `AUTH_GOOGLE_SECRET`.
   - Add yourself as a **Test user** on the OAuth consent screen.

   `AUTH_SECRET` and `ENCRYPTION_KEY` are already generated in `.env`.

3. **Install & migrate** (from this directory):
   ```bash
   npm install
   npm run db:migrate      # creates tables (already applied once)
   ```

## Run

```bash
npm run dev                # http://localhost:3000
```

Open the app, click **Continue with Google**, and you should land on the
dashboard.

## Useful scripts

| Command              | What it does                          |
| -------------------- | ------------------------------------- |
| `npm run dev`        | Start the dev server                  |
| `npm run build`      | Production build                      |
| `npm run db:migrate` | Create/apply a Prisma migration       |
| `npm run db:studio`  | Open Prisma Studio to inspect the DB  |

## Layout

```
prisma/schema.prisma          Data model (login + domain tables)
src/lib/prisma.ts             PrismaClient singleton
src/lib/crypto.ts             AES-256-GCM encrypt/decrypt for tokens at rest
src/lib/auth.ts               Auth.js config (Google login)
src/app/page.tsx              Landing / sign-in
src/app/dashboard/page.tsx    Protected dashboard
src/app/api/auth/[...nextauth]/route.ts   Auth.js handlers
```
