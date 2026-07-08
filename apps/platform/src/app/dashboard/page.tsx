import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeScopes } from "@/lib/googleScopes";
import { disconnectAccount } from "./actions";

const BANNERS: Record<string, { text: string; tone: "ok" | "warn" }> = {
  ok: { text: "Account connected.", tone: "ok" },
  denied: { text: "Connection cancelled — you declined on Google's screen.", tone: "warn" },
  norefresh: {
    text: "Google didn't return a refresh token. Revoke this app at myaccount.google.com → Security → Third-party access, then reconnect.",
    tone: "warn",
  },
  error: { text: "Something went wrong connecting the account. Please try again.", tone: "warn" },
};

const TIER_STYLES: Record<string, string> = {
  full: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  readonly: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  none: "bg-transparent text-slate-400 dark:text-slate-600",
};

function TierBadge({ service, tier }: { service: string; tier: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] ${TIER_STYLES[tier]}`}
    >
      {service}:{tier}
    </span>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { connect } = await searchParams;
  const banner = connect ? BANNERS[connect] : undefined;

  const accounts = await prisma.connectedAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Dashboard
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Signed in as{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {session.user.email}
              </span>
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {banner && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              banner.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Connected accounts
          </h2>
          <Link
            href="/dashboard/connect"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Connect account
          </Link>
        </div>

        {accounts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No accounts connected yet. Link a Google account to expose its
              Gmail, Calendar, Drive, and Chat to scoped agents.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {accounts.map((a) => {
              const s = summarizeScopes(a.grantedScopes);
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {a.googleEmail}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <TierBadge service="gmail" tier={s.gmail} />
                      <TierBadge service="calendar" tier={s.calendar} />
                      <TierBadge service="drive" tier={s.drive} />
                      <TierBadge service="chat" tier={s.chat} />
                    </div>
                  </div>
                  <form action={disconnectAccount}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      Disconnect
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8">
          <Link
            href="/dashboard/agents"
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Agents &amp; API keys
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Create scoped endpoints and mint the keys your AI clients connect
                with.
              </p>
            </div>
            <span className="text-slate-400 dark:text-slate-600">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
