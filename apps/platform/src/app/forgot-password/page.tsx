import Link from "next/link";
import { requestPasswordReset } from "../actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <p className="text-center font-mono text-xs uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          Google MCP Platform
        </p>
        <h1 className="mt-4 text-center text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Reset your password
        </h1>

        {sent ? (
          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            If that email has an account, we&apos;ve sent a reset link.
            It expires in 1 hour.
          </p>
        ) : (
          <form action={requestPasswordReset} className="mt-6 flex flex-col gap-3">
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
            <button
              type="submit"
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
            >
              Send reset link
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link
            href="/"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
