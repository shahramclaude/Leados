import { useMemo } from "react";
import type { AppState, Category } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { RULE_CATALOG } from "../lib/rules";
import { toggleSignal, setPersonLink, setRunway, simulateRecurrence, applyPreset } from "../lib/store";
import { Card, Label, Badge } from "./ui";

const CATEGORY_COLOR: Record<Category, "rose" | "amber" | "emerald" | "indigo" | "slate"> = {
  STRATEGIC: "indigo",
  OPERATIONAL: "slate",
  FINANCIAL: "amber",
  PEOPLE: "rose",
  GOVERNANCE: "indigo",
  MARKET: "slate",
  REPUTATIONAL: "rose",
  RESILIENCE: "amber",
};

export function SignalBoardView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const byCategory = useMemo(() => {
    const map: Record<Category, typeof RULE_CATALOG> = Object.fromEntries(CATEGORIES.map((c) => [c, []])) as any;
    for (const r of RULE_CATALOG) map[r.category].push(r);
    return map;
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Signal Board</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          50 synthetic rule IDs across 8 categories. Toggle any on/off, link person-level rules to a specific person, and
          everything downstream (Thermodynamics, CAS Engine, Risk Register) recomputes live. Direct manual control keeps
          every computation auditable rather than hidden behind an opaque generator.
        </p>
      </div>

      <Card title="Scenario Presets" subtitle="One click to load a coherent combination for exploring the CAS / Risk views">
        <div className="flex flex-wrap gap-2">
          <PresetButton label="Burnout loop (R7+R4, same person)" onClick={() => setState(applyPreset(state, ["R7", "R4"], "p1"))} />
          <PresetButton label="Velocity death spiral (R73+R17)" onClick={() => setState(applyPreset(state, ["R73", "R17"]))} />
          <PresetButton label="Talent virtuous cycle (R10+R11)" onClick={() => setState(applyPreset(state, ["R10", "R11"]))} />
          <PresetButton label="Trust collapse (R88+R60)" onClick={() => setState(applyPreset(state, ["R88", "R60"]))} />
          <PresetButton label="Austerity trap (R30+R4)" onClick={() => setState(applyPreset(state, ["R30", "R4"]))} />
        </div>
      </Card>

      <Card title="Financial Runway" subtitle="Drives the FINANCIAL bifurcation check directly (independent of R30 toggle)">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={24}
            value={state.runwayMonths}
            onChange={(e) => setState(setRunway(state, Number(e.target.value)))}
            className="w-64"
          />
          <span className="font-mono text-sm text-white">{state.runwayMonths} months</span>
          {state.runwayMonths < 6 && <Badge tone="rose">bifurcation threshold crossed</Badge>}
        </div>
      </Card>

      {CATEGORIES.map((cat) => (
        <Card key={cat} title={cat} subtitle={`${byCategory[cat].length} rules`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {byCategory[cat].map((rule) => {
              const sig = state.signals[rule.id];
              return (
                <div
                  key={rule.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs ${
                    sig.active ? "border-indigo-700/60 bg-indigo-950/30" : "border-slate-800 bg-slate-900/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-400">{rule.id}</span>
                      {rule.polarity === "positive" && <Badge tone="emerald">positive</Badge>}
                      <Badge tone={CATEGORY_COLOR[cat]}>sev {sig.sev}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-slate-300">{rule.title}</div>
                    {rule.personLinkable && sig.active && (
                      <select
                        className="mt-1 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300"
                        value={sig.personId ?? ""}
                        onChange={(e) => setState(setPersonLink(state, rule.id, e.target.value))}
                      >
                        <option value="">no person linked</option>
                        {state.people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      onClick={() => setState(toggleSignal(state, rule.id, state.people[0]?.id))}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        sig.active ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {sig.active ? "ON" : "OFF"}
                    </button>
                    <button
                      onClick={() => setState(simulateRecurrence(state, rule.id))}
                      className="text-[9px] text-slate-600 underline hover:text-slate-400"
                      title="Toggle on/off 3 times to test attractor detection"
                    >
                      simulate 3x recurrence
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <Label>
        Rule titles and category assignments are this delivery's own invented, illustrative labels — not sourced from any
        real rule engine. R1, R4, R7, R17, R73 and R88 specifically are reused IDs from the task's pasted "pt-L" brief so
        the CAS/Risk examples below line up with that brief's own named scenarios; everything else is filler to make an
        8-category board explorable.
      </Label>
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700">
      {label}
    </button>
  );
}
