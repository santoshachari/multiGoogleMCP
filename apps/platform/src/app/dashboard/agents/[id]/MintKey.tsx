"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mintApiKey } from "../actions";

export function MintKey({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onMint() {
    setLoading(true);
    try {
      const key = await mintApiKey(agentId, name);
      setMinted(key);
      setName("");
      // mintApiKey can't redirect() (it needs to return the plaintext key to
      // us), so the server-rendered key list below wouldn't otherwise pick up
      // the new row until a manual reload — refresh it explicitly.
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      {minted ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100">
              {minted}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(minted);
                setCopied(true);
              }}
              className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-slate-900"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setMinted(null);
              setCopied(false);
            }}
            className="mt-2 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              New key label (optional)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claude Desktop"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={onMint}
            disabled={loading}
            className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {loading ? "Minting…" : "Mint API key"}
          </button>
        </div>
      )}
    </div>
  );
}
