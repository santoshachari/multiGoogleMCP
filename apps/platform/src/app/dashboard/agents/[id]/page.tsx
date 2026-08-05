import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeScopes } from "@/lib/googleScopes";
import { allowedGmailTiers, allowedServiceTiers } from "@/lib/permissions";
import { deleteAgent, saveGrant, revokeApiKey } from "../actions";
import { MintKey } from "./MintKey";
import { CopyField } from "./CopyField";

function TierSelect({
  name,
  options,
  value,
}: {
  name: string;
  options: string[];
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {name}
      </span>
      <select
        name={name}
        defaultValue={options.includes(value) ? value : "none"}
        disabled={options.length <= 1}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm capitalize text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function AgentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.user.id },
    include: {
      grants: true,
      apiKeys: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!agent) redirect("/dashboard/agents");

  const accounts = await prisma.connectedAccount.findMany({
    where: { userId: session.user.id, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  const grantByAccount = new Map(agent.grants.map((g) => [g.connectedAccountId, g]));
  const mcpUrl = `${process.env.PUBLIC_BASE_URL ?? "http://localhost:3800"}/api/mcp`;

  const logs = await prisma.auditLog.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="min-h-dvh bg-slate-50 px-6 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/agents"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← All agents
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {agent.name}
            </h1>
            {agent.description && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {agent.description}
              </p>
            )}
          </div>
          <form action={deleteAgent}>
            <input type="hidden" name="id" value={agent.id} />
            <button
              type="submit"
              className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              Delete agent
            </button>
          </form>
        </div>

        {/* --- Access grants --- */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Account access
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Grant this agent per-service access to your connected accounts.
            Options are capped at each account&apos;s granted ceiling.
          </p>

          {accounts.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No connected accounts yet.{" "}
              <Link
                href="/dashboard/connect"
                className="text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Connect one first.
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {accounts.map((acc) => {
                const ceiling = summarizeScopes(acc.grantedScopes);
                const grant = grantByAccount.get(acc.id);
                return (
                  <li
                    key={acc.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {acc.googleEmail}
                    </p>
                    <form action={saveGrant} className="mt-3">
                      <input type="hidden" name="agentId" value={agent.id} />
                      <input
                        type="hidden"
                        name="connectedAccountId"
                        value={acc.id}
                      />
                      <div className="flex flex-wrap gap-3">
                        <TierSelect
                          name="gmail"
                          options={allowedGmailTiers(ceiling.gmail)}
                          value={grant?.gmail ?? "none"}
                        />
                        <TierSelect
                          name="calendar"
                          options={allowedServiceTiers(ceiling.calendar)}
                          value={grant?.calendar ?? "none"}
                        />
                        <TierSelect
                          name="drive"
                          options={allowedServiceTiers(ceiling.drive)}
                          value={grant?.drive ?? "none"}
                        />
                        <TierSelect
                          name="chat"
                          options={allowedServiceTiers(ceiling.chat)}
                          value={grant?.chat ?? "none"}
                        />
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* --- Connect this agent --- */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Connect this agent
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Any MCP client (Claude Desktop, Claude Code, ClaudeClaw, etc.)
            needs two things to use this agent: the server address below, and
            an API key from &quot;API keys&quot; further down. Mint a key
            first — the ready-to-paste config below fills itself in with it.
          </p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <CopyField label="MCP server address" value={mcpUrl} />
          </div>
        </section>

        {/* --- API keys --- */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            API keys
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bearer keys an MCP client presents to connect as this agent. Stored
            hashed — shown once at creation.
          </p>

          {agent.apiKeys.length > 0 && (
            <ul className="mt-3 space-y-2">
              {agent.apiKeys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-slate-900 dark:text-slate-100">
                      {k.prefix}…
                      {k.name && (
                        <span className="ml-2 font-sans text-xs text-slate-500 dark:text-slate-400">
                          {k.name}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {k.revokedAt
                        ? "Revoked"
                        : k.lastUsedAt
                          ? `Last used ${k.lastUsedAt.toISOString().slice(0, 10)}`
                          : "Never used"}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <form action={revokeApiKey}>
                      <input type="hidden" name="id" value={k.id} />
                      <input type="hidden" name="agentId" value={agent.id} />
                      <button
                        type="submit"
                        className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <MintKey agentId={agent.id} mcpUrl={mcpUrl} />
        </section>

        {/* --- Activity --- */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recent activity
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The last 50 tool calls this agent made, newest first.
          </p>

          {logs.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No activity yet.
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
                        log.status === "ok"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : log.status === "denied"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="truncate font-mono text-xs text-slate-900 dark:text-slate-100">
                      {log.toolName}
                    </span>
                    {log.accountEmail && (
                      <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {log.accountEmail}
                      </span>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
                    {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
