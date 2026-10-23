"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface AgentRun {
  id: string;
  objective: string;
  status: string;
  budgetUsd: string;
  budgetMin: number;
  totalCostUsd: string;
  totalMin: string;
  replanCount: number;
  verdict: string | null;
  replayHash: string | null;
  criticScore: string | null;
  createdAt: string;
}

interface PlanNodeRow {
  id: number;
  nodeId: string;
  kind: string;
  goal: string;
  tool: string;
  riskTier: number;
  dependsOn: string[];
  estCostUsd: string;
  estMin: string;
  status: string;
}

interface StepRecordRow {
  id: number;
  nodeId: string;
  toolId: string;
  outcome: string;
  costUsd: string;
  outputSummary: string | null;
  error: string | null;
  startedAt: string;
}

interface ApprovalRow {
  id: number;
  runId: string;
  nodeId: string;
  role: string;
  status: string;
  attentionRequired: boolean;
  reason: string | null;
  reviewer: string | null;
  reasonQualityScore: string | null;
  createdAt: string;
}

interface RunDetail {
  run: AgentRun;
  nodes: PlanNodeRow[];
  steps: StepRecordRow[];
  approvals: ApprovalRow[];
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-slate-200 text-slate-800",
  running: "bg-blue-100 text-blue-800",
  awaiting_approval: "bg-amber-100 text-amber-800",
  critic_review: "bg-purple-100 text-purple-800",
  replanning: "bg-purple-100 text-purple-800",
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-orange-100 text-orange-800",
  aborted: "bg-rose-100 text-rose-800",
  failed: "bg-rose-100 text-rose-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-200 text-slate-800"}`}>
      {status}
    </span>
  );
}

export default function AgentConsole() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRow[]>([]);
  const [objective, setObjective] = useState("Forecast next quarter revenue and prepare scenario bands");
  const [budgetUsd, setBudgetUsd] = useState(1.5);
  const [budgetMin, setBudgetMin] = useState(12);
  const [requestedBy, setRequestedBy] = useState("executive-sponsor");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<{ replayRunId: string; originalReplayHash: string | null } | null>(null);

  const refreshRuns = useCallback(async () => {
    const res = await fetch("/api/agent/runs", { cache: "no-store" });
    const data = await res.json();
    setRuns(data.runs ?? []);
  }, []);

  const refreshApprovals = useCallback(async () => {
    const res = await fetch("/api/agent/approvals?status=pending", { cache: "no-store" });
    const data = await res.json();
    setPendingApprovals(data.approvals ?? []);
  }, []);

  const refreshDetail = useCallback(async (runId: string) => {
    const res = await fetch(`/api/agent/runs/${runId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setDetail(data);
  }, []);

  useEffect(() => {
    refreshRuns();
    refreshApprovals();
    const interval = setInterval(() => {
      refreshRuns();
      refreshApprovals();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshRuns, refreshApprovals]);

  useEffect(() => {
    if (!selectedRunId) return;
    refreshDetail(selectedRunId);
    const interval = setInterval(() => refreshDetail(selectedRunId), 2500);
    return () => clearInterval(interval);
  }, [selectedRunId, refreshDetail]);

  const launchRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const res = await fetch("/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective, budgetUsd, budgetMin, requestedBy }),
    });
    const data = await res.json();
    if (!data.ok) {
      setSubmitError((data.errors ?? ["unknown error"]).join("; "));
      return;
    }
    setSelectedRunId(data.runId);
    refreshRuns();
  };

  const decide = async (approvalId: number, decision: "approve" | "reject") => {
    const reason = window.prompt(
      decision === "approve"
        ? "Why are you approving this action? Be specific (risk, benefit, and any guardrail checked)."
        : "Why are you rejecting this action?"
    );
    if (!reason) return;
    const reviewer = window.prompt("Your name / role:", requestedBy) ?? requestedBy;
    const res = await fetch(`/api/agent/approvals/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason, reviewer }),
    });
    const data = await res.json();
    if (!data.ok) {
      window.alert(data.error ?? "Could not record decision");
      return;
    }
    refreshApprovals();
    if (selectedRunId) refreshDetail(selectedRunId);
  };

  const runReplay = async (runId: string) => {
    const res = await fetch(`/api/agent/runs/${runId}/replay`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setReplayState({ replayRunId: data.replayRunId, originalReplayHash: data.originalReplayHash });
      refreshRuns();
    }
  };

  const replayRun = useMemo(() => runs.find((r) => r.id === replayState?.replayRunId) ?? null, [runs, replayState]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-1 space-y-6">
        <form onSubmit={launchRun} className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Launch objective</h2>
          <label className="mt-3 block text-xs font-medium text-slate-600">Objective</label>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            rows={3}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">Budget (USD)</label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                max={1.5}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Budget (min)</label>
              <input
                type="number"
                min={1}
                max={12}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                value={budgetMin}
                onChange={(e) => setBudgetMin(Number(e.target.value))}
              />
            </div>
          </div>
          <label className="mt-3 block text-xs font-medium text-slate-600">Requested by (role)</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
          />
          {submitError && <p className="mt-2 text-xs text-rose-600">{submitError}</p>}
          <button type="submit" className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white">
            Submit to Planner
          </button>
        </form>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Approval queue ({pendingApprovals.length})</h2>
          <ul className="mt-3 space-y-3">
            {pendingApprovals.length === 0 && <li className="text-sm text-slate-500">No pending approvals.</li>}
            {pendingApprovals.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">run {a.runId.slice(0, 8)} · node {a.nodeId}</span>
                  {a.attentionRequired && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      attention check
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">Role required: {a.role}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => decide(a.id, "approve")} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white">
                    Approve
                  </button>
                  <button onClick={() => decide(a.id, "reject")} className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white">
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lg:col-span-2 space-y-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Runs</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-2">id</th>
                  <th className="py-1 pr-2">objective</th>
                  <th className="py-1 pr-2">status</th>
                  <th className="py-1 pr-2">cost</th>
                  <th className="py-1 pr-2">replans</th>
                  <th className="py-1 pr-2">critic</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedRunId === r.id ? "bg-slate-50" : ""}`}
                    onClick={() => setSelectedRunId(r.id)}
                  >
                    <td className="py-1 pr-2 font-mono">{r.id.slice(0, 8)}</td>
                    <td className="py-1 pr-2 max-w-[20rem] truncate">{r.objective}</td>
                    <td className="py-1 pr-2"><StatusBadge status={r.status} /></td>
                    <td className="py-1 pr-2">
                      ${Number(r.totalCostUsd).toFixed(3)} / ${Number(r.budgetUsd).toFixed(2)}
                    </td>
                    <td className="py-1 pr-2">{r.replanCount}</td>
                    <td className="py-1 pr-2">{r.criticScore ?? "—"}</td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-slate-400">
                      No runs yet. Launch an objective to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {detail && (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Run {detail.run.id.slice(0, 8)} — plan graph</h2>
              <button onClick={() => runReplay(detail.run.id)} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                Replay for determinism check
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              replayHash: <span className="font-mono">{detail.run.replayHash ?? "pending"}</span>
            </p>
            {replayState && replayRun && (
              <p className="mt-1 text-xs">
                Replay run {replayState.replayRunId.slice(0, 8)} status <StatusBadge status={replayRun.status} /> hash{" "}
                <span className="font-mono">{replayRun.replayHash ?? "pending"}</span> —{" "}
                {replayRun.replayHash
                  ? replayRun.replayHash === replayState.originalReplayHash
                    ? "MATCH ✅"
                    : "MISMATCH ❌"
                  : "awaiting worker"}
              </p>
            )}

            <ol className="mt-4 space-y-2">
              {detail.nodes.map((n) => {
                const step = detail.steps.find((s) => s.nodeId === n.nodeId);
                return (
                  <li key={n.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{n.nodeId}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{n.kind}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">tool:{n.tool}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">T{n.riskTier}</span>
                      <StatusBadge status={n.status} />
                      <span className="text-slate-400">deps: {n.dependsOn.join(", ") || "none"}</span>
                      <span className="ml-auto text-slate-500">${Number(n.estCostUsd).toFixed(3)} / {n.estMin}min</span>
                    </div>
                    <p className="mt-1 text-slate-700">{n.goal}</p>
                    {step && (
                      <p className="mt-1 text-slate-500">
                        step outcome: <span className="font-medium">{step.outcome}</span>
                        {step.outputSummary ? ` — ${step.outputSummary}` : ""}
                        {step.error ? ` — error: ${step.error}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>

            <h3 className="mt-5 text-sm font-semibold text-slate-900">Approvals for this run</h3>
            <ul className="mt-2 space-y-2">
              {detail.approvals.length === 0 && <li className="text-xs text-slate-400">No approvals required.</li>}
              {detail.approvals.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                  node {a.nodeId} · <StatusBadge status={a.status} /> · reviewer: {a.reviewer ?? "—"} · quality:{" "}
                  {a.reasonQualityScore ?? "—"}
                  {a.reason && <p className="mt-1 text-slate-600">&ldquo;{a.reason}&rdquo;</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
