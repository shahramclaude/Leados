import { useState } from "react";
import type { AppState, Domain } from "../lib/types";
import { DOMAINS, DOMAIN_LABEL } from "../lib/types";
import { Button, Card } from "./Shell";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString();
}

export function WorkspaceView({ state, onChange }: { state: AppState; onChange: (s: AppState) => void }) {
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDomain, setGoalDomain] = useState<Domain>("strategy");

  function addGoal() {
    if (!goalTitle.trim()) return;
    const id = `g${state.meta.idSeq}`;
    onChange({
      ...state,
      goals: [...state.goals, { id, domain: goalDomain, title: goalTitle.trim(), ownerId: null, lastUpdate: new Date().toISOString() }],
      meta: { ...state.meta, idSeq: state.meta.idSeq + 1 },
    });
    setGoalTitle("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="text-sm text-stone-500">Decisions, goals, vendor renewals, and the three synthetic business metrics.</p>
      </div>

      <Card title="Decisions">
        <ul className="divide-y divide-stone-100">
          {state.decisions.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="text-sm font-medium">{d.title}</div>
                <div className="text-xs text-stone-500">
                  {DOMAIN_LABEL[d.domain]} · review by {fmt(d.reviewBy)} · {d.outcome ? `outcome: ${d.outcome}` : "no outcome yet"}
                </div>
              </div>
              {!d.outcome && (
                <div className="flex gap-2">
                  <Button onClick={() => onChange({ ...state, decisions: state.decisions.map((x) => (x.id === d.id ? { ...x, outcome: "validated" } : x)) })}>
                    Mark validated
                  </Button>
                  <Button onClick={() => onChange({ ...state, decisions: state.decisions.map((x) => (x.id === d.id ? { ...x, outcome: "reversed" } : x)) })}>
                    Mark reversed
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Goals">
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={goalDomain} onChange={(e) => setGoalDomain(e.target.value as Domain)} className="rounded-md border border-stone-300 px-2 py-1.5 text-sm">
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{DOMAIN_LABEL[d]}</option>
            ))}
          </select>
          <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="New goal title…" className="min-w-[200px] flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm" />
          <Button variant="primary" onClick={addGoal}>Add goal (ownerless)</Button>
        </div>
        <ul className="divide-y divide-stone-100">
          {state.goals.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="text-sm font-medium">{g.title}</div>
                <div className="text-xs text-stone-500">
                  {DOMAIN_LABEL[g.domain]} · owner: {g.ownerId ? state.people.find((p) => p.id === g.ownerId)?.name ?? g.ownerId : "none"} · updated {fmt(g.lastUpdate)}
                </div>
              </div>
              <div className="flex gap-2">
                {!g.ownerId && state.people[0] && (
                  <Button onClick={() => onChange({ ...state, goals: state.goals.map((x) => (x.id === g.id ? { ...x, ownerId: state.people[0].id, lastUpdate: new Date().toISOString() } : x)) })}>
                    Assign to {state.people[0].name}
                  </Button>
                )}
                <Button onClick={() => onChange({ ...state, goals: state.goals.map((x) => (x.id === g.id ? { ...x, lastUpdate: new Date().toISOString() } : x)) })}>
                  Touch (mark updated)
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Vendor / contract renewals">
        <ul className="divide-y divide-stone-100">
          {state.vendors.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="text-sm font-medium">{v.name}</div>
                <div className="text-xs text-stone-500">
                  Renewal due {fmt(v.renewalDue)} · {v.counterpartRespondedAt ? `responded ${fmt(v.counterpartRespondedAt)}` : "no response yet"}
                </div>
              </div>
              {!v.counterpartRespondedAt && (
                <Button onClick={() => onChange({ ...state, vendors: state.vendors.map((x) => (x.id === v.id ? { ...x, counterpartRespondedAt: new Date().toISOString() } : x)) })}>
                  Log response
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Synthetic metrics">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricSlider
            label="Budget variance %"
            value={state.metrics.budgetVariancePct}
            min={-20}
            max={60}
            onChange={(v) => onChange({ ...state, metrics: { ...state.metrics, budgetVariancePct: v } })}
          />
          <MetricSlider
            label="Deploy frequency delta %"
            value={state.metrics.deployFreqDeltaPct}
            min={-80}
            max={40}
            onChange={(v) => onChange({ ...state, metrics: { ...state.metrics, deployFreqDeltaPct: v } })}
          />
          <MetricSlider
            label="Churn delta pp"
            value={state.metrics.churnDeltaPct}
            min={-10}
            max={40}
            onChange={(v) => onChange({ ...state, metrics: { ...state.metrics, churnDeltaPct: v } })}
          />
        </div>
      </Card>
    </div>
  );
}

function MetricSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-stone-500">
        <span>{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-rose-600" />
    </div>
  );
}
