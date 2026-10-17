import { useState } from "react";
import type { AppState, Severity } from "../lib/types";
import { RULES, SCENARIO_PRESETS } from "../lib/rules";
import { SEVERITY_LABEL, CATEGORIES } from "../lib/types";
import { Card, Badge, Button, Label } from "./ui";

const SEV_TONE: Record<Severity, "slate" | "amber" | "rose" | "sky"> = {
  1: "slate",
  2: "sky",
  3: "amber",
  4: "rose",
};

export function SignalBoardView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const [filter, setFilter] = useState<string>("All");

  function toggleRule(id: string) {
    const active = state.activeRuleIds.includes(id);
    setState({
      ...state,
      activeRuleIds: active ? state.activeRuleIds.filter((r) => r !== id) : [...state.activeRuleIds, id],
    });
  }

  function setSeverity(id: string, sev: Severity) {
    setState({ ...state, severityOverrides: { ...state.severityOverrides, [id]: sev } });
  }

  function setPerson(id: string, personId: string) {
    const next = { ...state.personLinks };
    if (personId) next[id] = personId;
    else delete next[id];
    setState({ ...state, personLinks: next });
  }

  function simulateRecurrence(id: string) {
    // One click jumps straight to 3 occurrences, matching the attractor
    // threshold in casEngine.ts, so the control's label ("simulate 3x
    // recurrence") does exactly what it says in a single action.
    setState({ ...state, recurrence: { ...state.recurrence, [id]: 3 } });
  }

  const visibleRules = filter === "All" ? RULES : RULES.filter((r) => r.category === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Signal Board</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          50 synthetic rule IDs across 8 categories. Toggle a rule on, optionally override severity or link a person, and use "simulate 3x
          recurrence" to test attractor detection on the CAS Engine page.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Label>Runway (months)</Label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={24}
              value={state.runwayMonths}
              onChange={(e) => setState({ ...state, runwayMonths: Number(e.target.value) })}
              className="w-48 accent-indigo-500"
            />
            <span className="w-16 text-sm font-medium text-slate-200">{state.runwayMonths} mo</span>
          </div>
        </div>
      </Card>

      <Card title="Scenario presets">
        <div className="flex flex-wrap gap-2">
          {SCENARIO_PRESETS.map((p) => (
            <Button key={p.id} onClick={() => setState({ ...state, activeRuleIds: p.ruleIds })}>
              {p.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("All")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${filter === "All" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
        >
          All ({RULES.length})
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === c ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
          >
            {c} ({RULES.filter((r) => r.category === c).length})
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleRules.map((rule) => {
          const active = state.activeRuleIds.includes(rule.id);
          const sev = state.severityOverrides[rule.id] ?? rule.defaultSeverity;
          const rec = state.recurrence[rule.id] ?? 0;
          return (
            <div
              key={rule.id}
              className={`rounded-xl border p-4 text-xs transition ${
                active ? "border-indigo-500/60 bg-indigo-500/5" : "border-slate-800 bg-slate-900/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">{rule.id}</span>
                    <Badge tone="slate">{rule.category}</Badge>
                    <Badge tone={SEV_TONE[sev]}>{SEVERITY_LABEL[sev]}</Badge>
                  </div>
                  <div className="mt-1 font-medium text-slate-200">{rule.label}</div>
                  <p className="mt-1 text-slate-500">{rule.description}</p>
                </div>
                <input type="checkbox" checked={active} onChange={() => toggleRule(rule.id)} className="mt-1 h-4 w-4 accent-indigo-500" />
              </div>

              {active && (
                <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                  <div className="flex items-center gap-2">
                    <Label>Severity</Label>
                    <select
                      value={sev}
                      onChange={(e) => setSeverity(rule.id, Number(e.target.value) as Severity)}
                      className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200"
                    >
                      {[1, 2, 3, 4].map((s) => (
                        <option key={s} value={s}>
                          {SEVERITY_LABEL[s as Severity]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Person</Label>
                    <select
                      value={state.personLinks[rule.id] ?? ""}
                      onChange={(e) => setPerson(rule.id, e.target.value)}
                      className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200"
                    >
                      <option value="">(none)</option>
                      {state.roster.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Recurrence: {rec}x</span>
                    <Button onClick={() => simulateRecurrence(rule.id)}>Simulate 3x recurrence</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
