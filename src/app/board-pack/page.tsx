"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-session";

export default function BoardPackPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pack, setPack] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  async function generate() {
    setError(null);
    const res = await apiFetch("/api/board-pack");
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to generate board pack");
      return;
    }
    const body = await res.json();
    setPack(body);
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    setDownloadUrl(URL.createObjectURL(blob));
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Board pack export</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Aggregates leads, findings, decisions, approvals and automation runs for this tenant.
      </p>
      <button
        type="button"
        onClick={generate}
        className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
      >
        Generate board pack
      </button>
      {error ? <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p> : null}

      {pack ? (
        <div data-testid="board-pack-summary" className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">
          <ul className="grid grid-cols-2 gap-2">
            <li>Leads: <strong>{pack.totals.leads}</strong></li>
            <li>Findings: <strong>{pack.totals.findings}</strong></li>
            <li>Decisions: <strong>{pack.totals.decisions}</strong></li>
            <li>Approvals: <strong>{pack.totals.approvals}</strong></li>
            <li>Automation runs: <strong>{pack.totals.automationRuns}</strong></li>
          </ul>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              download="board-pack.json"
              data-testid="board-pack-download"
              className="inline-block rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Download board-pack.json
            </a>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
