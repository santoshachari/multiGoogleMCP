import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeScopes, type ScopeSummary } from "@/lib/googleScopes";

const SERVICE_OPTIONS: ServiceTier[] = ["none", "readonly", "full"];
const GMAIL_OPTIONS = ["none", "readonly", "draft", "full"] as const;

type ServiceTier = "none" | "readonly" | "full";

const NEW_ACCOUNT_DEFAULTS: ScopeSummary = {
  gmail: "readonly",
  calendar: "readonly",
  drive: "readonly",
  chat: "none",
  sheets: "none",
  docs: "none",
};

function Field({
  name,
  label,
  hint,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  options: readonly string[];
  defaultValue: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-4 dark:border-slate-800">
      <div>
        <label
          htmlFor={name}
          className="block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          {label}
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm capitalize text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { accountId } = await searchParams;
  const account = accountId
    ? await prisma.connectedAccount.findFirst({
        where: { id: accountId, userId: session.user.id },
      })
    : null;
  // accountId was given but didn't resolve (wrong user, stale link): fall
  // back to a normal "connect new" form rather than silently editing nothing.
  const editing = accountId ? account : null;
  const tiers = editing ? summarizeScopes(editing.grantedScopes) : NEW_ACCOUNT_DEFAULTS;

  return (
    <main className="min-h-dvh bg-slate-50 px-6 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-lg">
        <Link
          href="/dashboard"
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {editing ? `Edit access for ${editing.googleEmail}` : "Connect a Google account"}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {editing ? (
            <>
              Pre-filled with this account&apos;s current access. Change only
              what you need to — anything you leave as-is stays exactly as
              granted today, nothing is reset.
            </>
          ) : (
            <>
              Choose the most access any agent should ever have to this
              account. This sets a ceiling — individual agents can be scoped
              tighter, never wider.
            </>
          )}{" "}
          You&apos;ll approve these scopes on Google&apos;s consent screen
          next{editing ? ", signed in as this same account" : ""}.
        </p>

        <form
          action="/api/connect/google/start"
          method="get"
          className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          {editing && <input type="hidden" name="reconnect" value={editing.id} />}
          <Field
            name="gmail"
            label="Gmail"
            hint="readonly · draft (compose, no send) · full (send)"
            options={GMAIL_OPTIONS}
            defaultValue={tiers.gmail}
          />
          <Field
            name="calendar"
            label="Calendar"
            hint="readonly · full (create / edit / RSVP)"
            options={SERVICE_OPTIONS}
            defaultValue={tiers.calendar}
          />
          <Field
            name="drive"
            label="Drive"
            hint="readonly · full (upload / edit / share)"
            options={SERVICE_OPTIONS}
            defaultValue={tiers.drive}
          />
          <Field
            name="chat"
            label="Chat"
            hint="readonly · full (send / manage spaces)"
            options={SERVICE_OPTIONS}
            defaultValue={tiers.chat}
          />
          <Field
            name="sheets"
            label="Sheets"
            hint="readonly · full (edit cells / append rows)"
            options={SERVICE_OPTIONS}
            defaultValue={tiers.sheets}
          />
          <Field
            name="docs"
            label="Docs"
            hint="readonly · full (edit / insert text)"
            options={SERVICE_OPTIONS}
            defaultValue={tiers.docs}
          />

          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            Continue to Google
          </button>
        </form>
      </div>
    </main>
  );
}
