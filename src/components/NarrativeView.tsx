import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { narrativeIntel } from "../lib/narrativeIntel";
import { Badge, Card, Label } from "./ui";

export function NarrativeView({ state }: { state: AppState }) {
  const effectiveness = useMemo(() => narrativeIntel.computeNarrativeEffectiveness(state), [state]);
  const [audience, setAudience] = useState("board");
  const [goal, setGoal] = useState("Approve the Q2 pricing change");
  const strategy = useMemo(() => narrativeIntel.generateCommunicationStrategy(audience, goal, state), [audience, goal, state]);

  return (
    <div className="space-y-6">
      <Card title="Narrative effectiveness by audience">
        {effectiveness.insufficient ? (
          <p className="text-sm text-slate-500">{effectiveness.message} (n={effectiveness.n})</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {effectiveness.audienceStats!.map((a) => (
                <div key={a.audience} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-slate-800">{a.audience}</span>
                    <span className="text-xs text-slate-400">n={a.n}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><div className="font-semibold text-emerald-600">{a.alignmentRate ?? "—"}%</div><div className="text-slate-400">aligned</div></div>
                    <div><div className="font-semibold text-amber-600">{a.confusionRate ?? "—"}%</div><div className="text-slate-400">confused</div></div>
                    <div><div className="font-semibold text-rose-600">{a.resistanceRate ?? "—"}%</div><div className="text-slate-400">resistant</div></div>
                  </div>
                </div>
              ))}
            </div>
            {effectiveness.recommendation && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{effectiveness.recommendation}</div>
            )}
          </>
        )}
        <Label>{effectiveness.label}</Label>
      </Card>

      <Card title="Generate a communication strategy">
        <div className="flex flex-wrap gap-3">
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">
            <option value="board">board</option>
            <option value="team">team</option>
            <option value="investor">investor</option>
          </select>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="min-w-[280px] flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            placeholder="Message goal / the ask"
          />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div><Badge tone="indigo">Structure</Badge> <span className="ml-1 text-slate-700">{strategy.strategy.structureRecommendation}</span></div>
          <div><Badge tone="slate">Length</Badge> <span className="ml-1 text-slate-700">{strategy.strategy.lengthRecommendation}</span></div>
          <div><Badge tone="blue">Opener</Badge> <span className="ml-1 text-slate-700">{strategy.strategy.openingLine}</span></div>
          <div><Badge tone="amber">Pre-mortem</Badge> <span className="ml-1 text-slate-700">{strategy.strategy.preMortem}</span></div>
          {strategy.strategy.knownLearnings.length > 0 && (
            <div>
              <Badge tone="green">Known learnings</Badge>
              <ul className="ml-5 mt-1 list-disc text-slate-700">
                {strategy.strategy.knownLearnings.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
        <Label>{strategy.label}</Label>
      </Card>
    </div>
  );
}
