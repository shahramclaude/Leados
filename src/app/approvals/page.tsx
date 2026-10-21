"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-session";

type Decision = { id: string; action: string };
type Approval = { id: string; approver: string; outcome: string; createdAt: string };

export default function ApprovalsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [decisionId, setDecisionId] = useState("");
  const [approver, setApprover] = useState("");
  const [outcome, setOutcome] = useState<"approved" | "rejected">("approved");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [decisionsRes, approvalsRes] = await Promise.all([
      apiFetch("/api/decisions?page=1&pageSize=50"),
      apiFetch("/api/approvals?page=1&pageSize=50"),
    ]);
    if (decisionsRes.ok) setDecisions((await decisionsRes.json()).data);
    if (approvalsRes.ok) setApprovals((await approvalsRes.json()).data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await apiFetch("/api/approvals", {
      method: "POST",
      body: JSON.stringify({ decisionId, approver, outcome }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to record approval");
      return;
    }
    setApprover("");
    await refresh();
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Approvals</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="approval-decision" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Decision
          </label>
          <select
            id="approval-decision"
            value={decisionId}
            onChange={(e) => setDecisionId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="" disabled>
              Select a decision…
            </option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.action} — {d.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="approval-approver" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Approver
          </label>
          <input
            id="approval-approver"
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Outcome</legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="approval-outcome" checked={outcome === "approved"} onChange={() => setOutcome("approved")} /> Approve
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="approval-outcome" checked={outcome === "rejected"} onChange={() => setOutcome("rejected")} /> Reject
            </label>
          </div>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          Submit approval
        </button>
      </form>

      <ul data-testid="approval-list" className="mt-6 space-y-2">
        {approvals.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="font-medium text-slate-900 dark:text-white">{a.approver}</span>{" "}
            <span className={a.outcome === "approved" ? "text-emerald-600" : "text-rose-600"}>· {a.outcome}</span>
          </li>
        ))}
        {approvals.length === 0 ? <li className="text-sm text-slate-500">No approvals yet.</li> : null}
      </ul>
    </main>
  );
}
