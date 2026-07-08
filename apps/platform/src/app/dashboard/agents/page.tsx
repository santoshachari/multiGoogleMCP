import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createAgent } from "./actions";

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const agents = await prisma.agent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { grants: true, apiKeys: true } } },
  });

  return (
    <main className="min-h-dvh bg-slate-50 px-6 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Agents
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          An agent is a scoped endpoint. It reaches only the accounts and
          permissions you grant it, and your AI tools connect to it with an API
          key.
        </p>

        <form
          action={createAgent}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label
              htmlFor="name"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              New agent name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Inbox assistant"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Create agent
          </button>
        </form>

        {agents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No agents yet. Create one above, then grant it access to your
              connected accounts.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/dashboard/agents/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {a.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {a._count.grants} account
                      {a._count.grants === 1 ? "" : "s"} · {a._count.apiKeys} key
                      {a._count.apiKeys === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-slate-400 dark:text-slate-600">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
