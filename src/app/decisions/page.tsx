"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-session";

type Finding = { id: string; summary: string };
type Decision = { id: string; action: string; rationale: string; createdAt: string };

export default function DecisionsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [findingId, setFindingId] = useState("");
  const [action, setAction] = useState<"pursue" | "watch" | "discard">("pursue");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [findingsRes, decisionsRes] = await Promise.all([
      apiFetch("/api/findings?page=1&pageSize=50"),
      apiFetch("/api/decisions?page=1&pageSize=50"),
    ]);
    if (findingsRes.ok) setFindings((await findingsRes.json()).data);
    if (decisionsRes.ok) setDecisions((await decisionsRes.json()).data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await apiFetch("/api/decisions", {
      method: "POST",
      body: JSON.stringify({ findingId, action, rationale }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to record decision");
      return;
    }
    setRationale("");
    await refresh();
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Decisions</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="decision-finding" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Finding
          </label>
          <select
            id="decision-finding"
            value={findingId}
            onChange={(e) => setFindingId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="" disabled>
              Select a finding…
            </option>
            {findings.map((f) => (
              <option key={f.id} value={f.id}>
                {f.summary}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="decision-action" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Action
          </label>
          <select
            id="decision-action"
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="pursue">Pursue</option>
            <option value="watch">Watch</option>
            <option value="discard">Discard</option>
          </select>
        </div>
        <div>
          <label htmlFor="decision-rationale" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Rationale
          </label>
          <textarea
            id="decision-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            required
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          Record decision
        </button>
      </form>

      <ul data-testid="decision-list" className="mt-6 space-y-2">
        {decisions.map((d) => (
          <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="font-medium capitalize text-slate-900 dark:text-white">{d.action}</span>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{d.rationale}</p>
          </li>
        ))}
        {decisions.length === 0 ? <li className="text-sm text-slate-500">No decisions yet.</li> : null}
      </ul>
    </main>
  );
}
