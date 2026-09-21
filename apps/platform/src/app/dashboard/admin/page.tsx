import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { adminSetPassword } from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!me?.isAdmin) redirect("/dashboard");

  const { ok, error } = await searchParams;
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <main className="min-h-dvh bg-slate-50 px-6 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Dashboard
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          User management
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Admin-only. Set a user&apos;s password directly — useful when the
          email-based reset link can&apos;t be relied on.
        </p>

        {ok && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            Password updated.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            Password must be at least 8 characters.
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {u.email}
                </p>
                {u.isAdmin && (
                  <span className="inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px] text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    admin
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Joined {u.createdAt.toISOString().slice(0, 10)}
              </p>

              <form action={adminSetPassword} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    New password
                  </label>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
                >
                  Set password
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
