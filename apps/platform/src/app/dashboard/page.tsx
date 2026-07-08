import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

function EmptyCard({
  title,
  hint,
  phase,
}: {
  title: string;
  hint: string;
  phase: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {phase}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user) redirect("/");

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
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Your workspace
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The foundation is live. Connecting Google accounts and creating agents
          arrive in the next phases.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <EmptyCard
            title="Connected accounts"
            hint="Link a Google account to expose its Gmail, Calendar, Drive, and Chat."
            phase="Phase 1"
          />
          <EmptyCard
            title="Agents"
            hint="Create scoped endpoints that reach only the accounts and tools you allow."
            phase="Phase 3"
          />
          <EmptyCard
            title="API keys"
            hint="Mint bearer keys your AI clients use to connect to an agent."
            phase="Phase 3"
          />
        </div>
      </div>
    </main>
  );
}
