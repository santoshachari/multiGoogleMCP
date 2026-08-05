"use client";

import { useState } from "react";

export function CopyField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {multiline && (
          <button
            type="button"
            onClick={copy}
            className="whitespace-nowrap rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {multiline ? (
        <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
          {value}
        </pre>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
            {value}
          </code>
          <button
            type="button"
            onClick={copy}
            className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
