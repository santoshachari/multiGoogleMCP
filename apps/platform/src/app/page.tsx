import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { login } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Incorrect email or password.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, reset } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <p className="text-center font-mono text-xs uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          Google MCP Platform
        </p>
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Sign in
        </h1>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {ERRORS[error] ?? "Something went wrong. Please try again."}
          </div>
        )}
        {reset === "ok" && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
            Password updated. Sign in with your new password.
          </div>
        )}

        <form action={login} className="mt-6 flex flex-col gap-3">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link
            href="/forgot-password"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </main>
  );
}
