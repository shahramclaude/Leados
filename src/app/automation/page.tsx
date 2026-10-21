"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-session";

type Approval = { id: string; outcome: string; approver: string };
type AutomationRun = { id: string; seed: number; trials: number; meanOutcome: number; p05: number; p95: number };

export default function AutomationPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approvalId, setApprovalId] = useState("");
  const [trials, setTrials] = useState(5000);
  const [seed, setSeed] = useState<string>("");
  const [result, setResult] = useState<AutomationRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await apiFetch("/api/approvals?page=1&pageSize=50");
    if (res.ok) setApprovals((await res.json()).data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const body: Record<string, unknown> = { approvalId, trials };
    if (seed.trim() !== "") body.seed = Number(seed);
    const res = await apiFetch("/api/automation/run", { method: "POST", body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? "Automation run failed");
      return;
    }
    setResult(payload);
  }

  const approvedOnly = approvals.filter((a) => a.outcome === "approved");

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Automation run</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Runs a reproducible Monte Carlo forecast (same approval + seed + trials always yields the same result).
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="automation-approval" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Approved decision
          </label>
          <select
            id="automation-approval"
            value={approvalId}
            onChange={(e) => setApprovalId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="" disabled>
              Select an approved decision…
            </option>
            {approvedOnly.map((a) => (
              <option key={a.id} value={a.id}>
                {a.approver} — {a.id.slice(0, 8)}
              </option>
            ))}
          </select>
          {approvedOnly.length === 0 ? (
            <p className="mt-1 text-xs text-amber-600">No approved decisions yet — approve one first.</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="automation-trials" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Trials
            </label>
            <input
              id="automation-trials"
              type="number"
              min={100}
              max={200000}
              value={trials}
              onChange={(e) => setTrials(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="automation-seed" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Seed (optional)
            </label>
            <input
              id="automation-seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="auto"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          Run automation
        </button>
      </form>

      {result ? (
        <div data-testid="automation-result" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">
          <p>Seed: <strong>{result.seed}</strong> · Trials: <strong>{result.trials}</strong></p>
          <p className="mt-1">
            Mean outcome: <strong>{result.meanOutcome.toFixed(2)}</strong> (p05 {result.p05.toFixed(2)} – p95 {result.p95.toFixed(2)})
          </p>
        </div>
      ) : null}
    </main>
  );
}
