import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-dvh grid place-items-center px-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          Google MCP Platform
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Scoped access to your Google accounts
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          Connect Google accounts, create scoped agents, and hand out API keys
          your AI tools can use — nothing more than you allow.
        </p>

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
