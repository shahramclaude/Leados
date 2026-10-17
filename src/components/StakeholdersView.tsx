import type { AppState } from "../lib/types";
import { analyzeStakeholders, stakeholderGame } from "../lib/stakeholders";
import { Card, Stat, Badge, Slider } from "./ui";
import { useMemo, useState } from "react";

export function StakeholdersView({ state, setState }: { state: AppState; setState: (updater: (s: AppState) => AppState) => void }) {
  const { analyzed, alignmentIndex } = useMemo(() => analyzeStakeholders(state.stakeholders), [state.stakeholders]);
  const [selectedId, setSelectedId] = useState(state.stakeholders[0]?.id);
  const selected = analyzed.find((s) => s.id === selectedId) ?? analyzed[0];
  const game = useMemo(() => stakeholderGame(selected?.stance ?? 0), [selected]);

  const updateStance = (id: string, stance: number) =>
    setState((s) => ({ ...s, stakeholders: s.stakeholders.map((h) => (h.id === id ? { ...h, stance } : h)) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stakeholder Intelligence + Game Theory</h1>
        <p className="mt-1 text-sm text-slate-500">
          <code>js/stakeholders.js</code> (pt-O spec) → <code>src/lib/stakeholders.ts</code>. Power/interest grid follows
          Mendelow (1981); the 2×2 cooperate/compete game uses standard game theory with original payoff numbers.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><Stat label="Power-weighted alignment index" value={alignmentIndex} tone={alignmentIndex >= 0 ? "emerald" : "rose"} /></Card>
        <Card><Stat label="Stakeholders tracked" value={analyzed.length} /></Card>
      </div>

      <Card title="Power / Interest grid">
        <div className="space-y-2">
          {analyzed.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelectedId(h.id)}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition ${
                h.id === selected?.id ? "border-indigo-300 bg-indigo-50" : "border-slate-100 hover:bg-slate-50"
              }`}
            >
              <div>
                <div className="font-medium text-slate-700">{h.name} <span className="font-normal text-slate-400">— {h.role}</span></div>
                <div className="text-xs text-slate-500">power {h.power} · interest {h.interest} · stance {h.stance > 0 ? "+" : ""}{h.stance}</div>
              </div>
              <Badge tone={h.quadrant === "Manage Closely" ? "violet" : h.quadrant === "Keep Satisfied" ? "amber" : h.quadrant === "Keep Informed" ? "indigo" : "slate"}>
                {h.quadrant}
              </Badge>
            </button>
          ))}
        </div>
      </Card>

      {selected && (
        <Card title={`Game theory — negotiating with ${selected.name}`} subtitle="Adjust stance to see the equilibrium shift">
          <div className="mb-4 max-w-sm">
            <Slider label="Stance" min={-100} max={100} value={selected.stance} onChange={(v) => updateStance(selected.id, v)} />
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Badge tone={game.equilibrium.includes("cooperation") ? "emerald" : game.equilibrium.includes("competition") ? "rose" : "amber"}>
              {game.equilibrium}
            </Badge>
          </div>
          <p className="mb-3 text-sm text-slate-600">{game.recommendation}</p>
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr><th className="p-2 text-left">Us</th><th className="p-2 text-left">Them</th><th className="p-2 text-right">Our payoff</th><th className="p-2 text-right">Their payoff</th></tr>
              </thead>
              <tbody>
                {game.payoffMatrix.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="p-2">{row.usMove}</td>
                    <td className="p-2">{row.themMove}</td>
                    <td className="p-2 text-right tabular-nums">{row.us}</td>
                    <td className="p-2 text-right tabular-nums">{row.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
