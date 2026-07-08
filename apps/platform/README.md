# Google MCP Platform — web app

Multi-tenant web app that wraps the `multiGoogleMCP` tool core: users sign in,
connect Google accounts, and hand out scoped agents + API keys to their AI
clients. Built with Next.js (App Router), Prisma + Postgres, and Auth.js.

> **Status: Phase 0 (foundation).** Sign in with Google and land on an empty
> dashboard. Connecting Google accounts (Phase 1), the tool-core refactor
> (Phase 2), agents/keys (Phase 3), and the remote MCP endpoint (Phase 4) are
> not built yet. See the architecture plan for the full roadmap.

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
