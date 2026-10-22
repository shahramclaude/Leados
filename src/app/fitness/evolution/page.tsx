"use client";

import { useCallback, useEffect, useState } from "react";

interface Loop {
  id: number;
  title: string;
  dimensionId: string;
  hypothesis: string;
  relatedExperimentId: string | null;
  twinPredictedDelta: string | null;
  twinConfidence: string | null;
  stage: string;
  decisionTier: string;
  decisionId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  executionRef: string | null;
  executedAt: string | null;
  measuredAt: string | null;
  actualDelta: string | null;
  counterfactualDelta: string | null;
  counterfactualNote: string | null;
  beliefUpdateNote: string | null;
}

const STAGE_FLOW = [
  "hypothesis",
  "twin_predicted",
  "decision_pending",
  "decision_approved",
  "executing",
  "measured",
  "belief_updated",
];

const STAGE_LABEL: Record<string, string> = {
  hypothesis: "Hypothesis",
  twin_predicted: "Twin-predicted (Part 06 stand-in)",
  decision_pending: "Awaiting human T3 decision",
  decision_approved: "Decision approved",
  decision_rejected: "Decision rejected",
  executing: "Executing (Part 10 stand-in)",
  measured: "Outcome measured",
  belief_updated: "Belief updated",
};

const DIMENSION_OPTIONS = [
  "execution_health",
  "financial_resilience",
  "people_sustainability",
  "decision_quality",
  "risk_posture",
  "learning_velocity",
  "stakeholder_health",
];

function StageTimeline({ stage }: { stage: string }) {
  const idx = STAGE_FLOW.indexOf(stage);
  const rejected = stage === "decision_rejected";
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {STAGE_FLOW.map((s, i) => (
        <span
          key={s}
          className={`rounded-full px-2 py-1 font-medium ${
            rejected && i >= 2
              ? "bg-slate-100 text-slate-400"
              : i < idx
                ? "bg-emerald-100 text-emerald-700"
                : i === idx
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-400"
          }`}
        >
          {STAGE_LABEL[s]}
        </span>
      ))}
      {rejected && <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">Rejected</span>}
    </div>
  );
}

function LoopCard({ loop, onChanged }: { loop: Loop; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [cf, setCf] = useState<null | { recordedActualDelta: number; recordedCounterfactualDelta: number | null; freshEstimatedEffect: number }>(null);

  useEffect(() => {
    if (loop.stage === "measured" || loop.stage === "belief_updated") {
      fetch(`/api/fitness/counterfactual?loopId=${loop.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.ok && d.comparedToRecorded) setCf(d.comparedToRecorded);
        })
        .catch(() => {});
    }
  }, [loop.id, loop.stage]);

  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/fitness/evolution-loops/${loop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!data.ok) alert(data.error);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-slate-900">{loop.title}</p>
          <p className="text-sm text-slate-500">
            Dimension: <span className="font-mono">{loop.dimensionId}</span> · Decision tier: {loop.decisionTier}
          </p>
          <p className="mt-2 text-sm text-slate-700">{loop.hypothesis}</p>
        </div>
      </div>

      <div className="mt-3">
        <StageTimeline stage={loop.stage} />
      </div>

      <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
        {loop.twinPredictedDelta && (
          <p>
            <span className="text-slate-400">Twin predicted Δfitness:</span>{" "}
            <span className="font-mono">{Number(loop.twinPredictedDelta).toFixed(4)}</span> (confidence{" "}
            {loop.twinConfidence ? (Number(loop.twinConfidence) * 100).toFixed(0) : "?"}%)
          </p>
        )}
        {loop.approvedBy && (
          <p>
            <span className="text-slate-400">Approved by:</span> {loop.approvedBy}
          </p>
        )}
        {loop.actualDelta && (
          <p>
            <span className="text-slate-400">Actual Δfitness:</span>{" "}
            <span className="font-mono">{Number(loop.actualDelta).toFixed(4)}</span>
          </p>
        )}
        {loop.counterfactualDelta && (
          <p>
            <span className="text-slate-400">Counterfactual (no-intervention) Δfitness:</span>{" "}
            <span className="font-mono">{Number(loop.counterfactualDelta).toFixed(4)}</span>
          </p>
        )}
      </div>
      {loop.counterfactualNote && <p className="mt-2 text-xs italic text-slate-500">{loop.counterfactualNote}</p>}
      {loop.beliefUpdateNote && (
        <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">{loop.beliefUpdateNote}</p>
      )}
      {cf && (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Fresh counterfactual re-estimate from live snapshot series: {cf.freshEstimatedEffect.toFixed(4)} (recorded at decision
          time: {cf.recordedCounterfactualDelta?.toFixed(4) ?? "n/a"}).
        </p>
      )}

      {/* Stage-specific actions */}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        {loop.stage === "hypothesis" && (
          <>
            <input
              placeholder="Twin predicted Δfitness (e.g. 0.03)"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, twinPredictedDelta: e.target.value })}
            />
            <input
              placeholder="Twin confidence 0-1 (e.g. 0.6)"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, twinConfidence: e.target.value })}
            />
            <button
              disabled={busy}
              onClick={() =>
                act("twin_predict", {
                  twinPredictedDelta: Number(form.twinPredictedDelta || 0),
                  twinConfidence: Number(form.twinConfidence || 0),
                })
              }
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Record twin pre-test
            </button>
          </>
        )}

        {loop.stage === "twin_predicted" && (
          <>
            <input
              placeholder="Decision ledger id (Part 23 stand-in)"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, decisionId: e.target.value })}
            />
            <button
              disabled={busy}
              onClick={() => act("submit_decision", { decisionId: form.decisionId || `dec-${loop.id}` })}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Submit for T3 human decision
            </button>
          </>
        )}

        {loop.stage === "decision_pending" && (
          <>
            <input
              placeholder="Approver name (required — human gate)"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
            />
            <button
              disabled={busy || !form.approvedBy}
              onClick={() => act("approve", { approvedBy: form.approvedBy })}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Approve (human, T3)
            </button>
            <input
              placeholder="Rejection reason"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, rejectedReason: e.target.value })}
            />
            <button
              disabled={busy || !form.rejectedReason}
              onClick={() => act("reject", { rejectedReason: form.rejectedReason })}
              className="rounded bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}

        {loop.stage === "decision_approved" && (
          <>
            <input
              placeholder="Execution reference (Part 10 stand-in)"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, executionRef: e.target.value })}
            />
            <button
              disabled={busy}
              onClick={() => act("execute", { executionRef: form.executionRef || `exec-${loop.id}` })}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mark executing
            </button>
          </>
        )}

        {loop.stage === "executing" && (
          <>
            <input
              placeholder="Actual Δfitness"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, actualDelta: e.target.value })}
            />
            <input
              placeholder="Counterfactual Δfitness"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, counterfactualDelta: e.target.value })}
            />
            <input
              placeholder="Counterfactual note/caveat"
              className="w-64 rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, counterfactualNote: e.target.value })}
            />
            <button
              disabled={busy}
              onClick={() =>
                act("measure", {
                  actualDelta: Number(form.actualDelta || 0),
                  counterfactualDelta: Number(form.counterfactualDelta || 0),
                  counterfactualNote: form.counterfactualNote || "Pre-period linear-trend estimate (declared proxy).",
                })
              }
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Record measured outcome
            </button>
          </>
        )}

        {loop.stage === "measured" && (
          <>
            <input
              placeholder="Belief update note"
              className="w-72 rounded border border-slate-300 px-2 py-1 text-sm"
              onChange={(e) => setForm({ ...form, beliefUpdateNote: e.target.value })}
            />
            <button
              disabled={busy}
              onClick={() => act("update_belief", { beliefUpdateNote: form.beliefUpdateNote || "Belief updated." })}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Close loop (update belief)
            </button>
          </>
        )}

        {(loop.stage === "belief_updated" || loop.stage === "decision_rejected") && (
          <p className="text-sm text-slate-400">Loop closed.</p>
        )}
      </div>
    </div>
  );
}

export default function EvolutionLoopsPage() {
  const [loops, setLoops] = useState<Loop[]>([]);
  const [newLoop, setNewLoop] = useState({ title: "", dimensionId: DIMENSION_OPTIONS[0], hypothesis: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/fitness/evolution-loops").then((r) => r.json());
    if (res.ok) setLoops(res.loops);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createLoop() {
    if (!newLoop.title || !newLoop.hypothesis) return;
    await fetch("/api/fitness/evolution-loops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLoop),
    });
    setNewLoop({ title: "", dimensionId: DIMENSION_OPTIONS[0], hypothesis: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-slate-900">Evolution Loops</h2>
        <p className="text-sm text-slate-500">
          fitness trend → drift detection (Part 38 stand-in) → experiment proposal (Part 30 stand-in) → twin pre-test
          (Part 06 stand-in) → <strong>human T3 decision</strong> (Part 23 stand-in) → execution (Part 10 stand-in) →
          measured outcome → belief update. Every arrow requires an explicit human action — nothing here auto-executes.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <input
            placeholder="Title"
            value={newLoop.title}
            onChange={(e) => setNewLoop({ ...newLoop, title: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-1"
          />
          <select
            value={newLoop.dimensionId}
            onChange={(e) => setNewLoop({ ...newLoop, dimensionId: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            {DIMENSION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            placeholder="Hypothesis"
            value={newLoop.hypothesis}
            onChange={(e) => setNewLoop({ ...newLoop, hypothesis: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-1"
          />
          <button onClick={createLoop} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">
            New hypothesis
          </button>
        </div>
      </section>

      <div className="space-y-4">
        {loops.length === 0 && <p className="text-sm text-slate-400">No loops yet. Seed demo data from the Dashboard or create one above.</p>}
        {loops.map((loop) => (
          <LoopCard key={loop.id} loop={loop} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
