"use client";

import { useActionState } from "react";
import { saveGrant, type SaveGrantState } from "../actions";
import type { GmailTier, ServiceTier } from "@/lib/googleScopes";

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

const initialState: SaveGrantState = { ok: false };

export function SaveGrantForm({
  agentId,
  connectedAccountId,
  gmailOptions,
  calendarOptions,
  driveOptions,
  chatOptions,
  sheetsOptions,
  docsOptions,
  grant,
}: {
  agentId: string;
  connectedAccountId: string;
  gmailOptions: GmailTier[];
  calendarOptions: ServiceTier[];
  driveOptions: ServiceTier[];
  chatOptions: ServiceTier[];
  sheetsOptions: ServiceTier[];
  docsOptions: ServiceTier[];
  grant?: {
    gmail: string;
    calendar: string;
    drive: string;
    chat: string;
    sheets: string;
    docs: string;
  };
}) {
  const [state, formAction, pending] = useActionState(saveGrant, initialState);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="connectedAccountId" value={connectedAccountId} />
      <div className="flex flex-wrap items-end gap-3">
        <TierSelect name="gmail" options={gmailOptions} value={grant?.gmail ?? "none"} />
        <TierSelect name="calendar" options={calendarOptions} value={grant?.calendar ?? "none"} />
        <TierSelect name="drive" options={driveOptions} value={grant?.drive ?? "none"} />
        <TierSelect name="chat" options={chatOptions} value={grant?.chat ?? "none"} />
        <TierSelect name="sheets" options={sheetsOptions} value={grant?.sheets ?? "none"} />
        <TierSelect name="docs" options={docsOptions} value={grant?.docs ?? "none"} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {!pending && state.ok && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Saved
            </span>
          )}
          {!pending && state.error && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {state.error}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
