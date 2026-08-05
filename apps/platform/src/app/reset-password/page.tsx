import Link from "next/link";
import { resetPassword } from "../actions";

const ERRORS: Record<string, string> = {
  weak: "Password must be at least 8 characters.",
  mismatch: "Passwords don't match.",
  invalid: "This reset link is invalid or expired. Request a new one.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string; error?: string }>;
}) {
  const { token, email, error } = await searchParams;

  if (!token || !email) {
    return (
      <main className="min-h-dvh grid place-items-center px-6 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Invalid link
          </h1>
          <Link
            href="/forgot-password"
            className="mt-4 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Request a new reset link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <p className="text-center font-mono text-xs uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          Google MCP Platform
        </p>
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Set a new password
        </h1>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {ERRORS[error] ?? "Something went wrong. Please try again."}
          </div>
        )}

        <form action={resetPassword} className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={email} />
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Update password
          </button>
        </form>
      </div>
    </main>
  );
}
