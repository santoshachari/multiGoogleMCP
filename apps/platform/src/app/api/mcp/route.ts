import { NextRequest, NextResponse } from "next/server";
import {
  TOOL_DEFINITIONS,
  IMPLEMENTED_TOOLS,
  executeTool,
  meetsToolRequirement,
  toolRequirementLabel,
  describePermissions,
  type AccountPermissions,
} from "@multigoogle/core";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/apiKeys";
import { resolverForGrants, type GrantEntry } from "@/lib/toolRunner";

const PROTOCOL_VERSION = "2025-06-18";
const IMPLEMENTED = new Set<string>(IMPLEMENTED_TOOLS);

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: any;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}
function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

interface AgentContext {
  agentName: string;
  grantsByEmail: Map<string, GrantEntry>;
}

// Resolve the bearer key → agent + grants. Returns null if unauthenticated.
async function authenticate(req: NextRequest): Promise<AgentContext | null> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;

  const key = await prisma.apiKey.findFirst({
    where: { keyHash: hashApiKey(token), revokedAt: null },
    include: { agent: { include: { grants: { include: { account: true } } } } },
  });
  if (!key) return null;

  // Record usage; don't block the request on it.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const grantsByEmail = new Map<string, GrantEntry>();
  for (const g of key.agent.grants) {
    const permissions: AccountPermissions = {
      gmail: g.gmail as AccountPermissions["gmail"],
      calendar: g.calendar as AccountPermissions["calendar"],
      drive: g.drive as AccountPermissions["drive"],
      chat: g.chat as AccountPermissions["chat"],
    };
    grantsByEmail.set(g.account.googleEmail, {
      refreshTokenEnc: g.account.refreshTokenEnc,
      permissions,
    });
  }

  return { agentName: key.agent.name, grantsByEmail };
}

// A tool is advertised if AT LEAST ONE granted account meets its minimum
// tier (the actual account is chosen via the "email" argument at call time).
// This is tier-accurate, not just "is the service non-none": an agent with
// calendar=readonly will NOT see calendar_create_event, matching exactly
// what would succeed if called.
function advertisedTools(ctx: AgentContext) {
  const allPerms = [...ctx.grantsByEmail.values()].map((g) => g.permissions);
  return TOOL_DEFINITIONS.filter(
    (d) =>
      IMPLEMENTED.has(d.name) &&
      allPerms.some((perms) => meetsToolRequirement(perms, d.name)),
  );
}

async function handleMessage(
  msg: JsonRpcMessage,
  ctx: AgentContext,
): Promise<object | null> {
  switch (msg.method) {
    case "initialize": {
      const accountLines = [...ctx.grantsByEmail.entries()].map(
        ([email, g]) => `- ${email} — ${describePermissions(g.permissions)}`,
      );
      return rpcResult(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: `agent:${ctx.agentName}`, version: "0.1.0" },
        instructions:
          `Pass one of these accounts as the "email" argument to every tool. ` +
          `Only the tools each account's permissions allow are listed in tools/list — ` +
          `if a tool isn't there, this agent can't do that yet for that account:\n` +
          (accountLines.join("\n") || "(no accounts granted yet)"),
      });
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return null; // notifications get no response

    case "ping":
      return rpcResult(msg.id, {});

    case "tools/list":
      return rpcResult(msg.id, { tools: advertisedTools(ctx) });

    case "tools/call": {
      const name = msg.params?.name;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (typeof name !== "string" || !IMPLEMENTED.has(name)) {
        return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      }

      // Gate by the tool's exact minimum tier for the targeted account — not
      // just "is the service non-none". Read tools have no permission guard
      // in core, and write tools' core guards only check the ceiling for
      // *that* tool's own service/tier, so this is the only place that knows
      // "gmail_send specifically needs full, not just any gmail access" up
      // front, matching what tools/list already advertised.
      const email = typeof args.email === "string" ? args.email : undefined;
      const perms = email ? ctx.grantsByEmail.get(email)?.permissions : undefined;
      if (!perms) {
        return rpcResult(msg.id, {
          content: [
            {
              type: "text",
              text: `Error: this agent has no access to ${email ?? "(no email provided)"}.`,
            },
          ],
          isError: true,
        });
      }
      if (!meetsToolRequirement(perms, name)) {
        return rpcResult(msg.id, {
          content: [
            {
              type: "text",
              text: `Error: ${name} requires ${toolRequirementLabel(name)} for ${email}, but this agent's grant is ${describePermissions(perms)}.`,
            },
          ],
          isError: true,
        });
      }

      try {
        const text = await executeTool(
          resolverForGrants(ctx.grantsByEmail),
          name,
          args,
        );
        return rpcResult(msg.id, { content: [{ type: "text", text }] });
      } catch (e) {
        return rpcResult(msg.id, {
          content: [
            { type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` },
          ],
          isError: true,
        });
      }
    }

    default:
      if (msg.id === undefined) return null; // unknown notification
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if (!ctx) {
    return NextResponse.json(
      rpcError(null, -32001, "Unauthorized: missing or invalid API key."),
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcMessage[];
  const responses = (
    await Promise.all(messages.map((m) => handleMessage(m, ctx)))
  ).filter((r): r is object => r !== null);

  // All notifications → 202 with no body.
  if (responses.length === 0) {
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(batch ? responses : responses[0]);
}

// Streamable HTTP allows an optional GET SSE stream; we're stateless and don't
// offer one.
export function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
