import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors } from "../lib/casEngine";
import { Card, Label, Badge } from "./ui";

export function CasView({ state }: { state: AppState }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const loops = useMemo(() => identifyFeedbackLoops(findings), [findings]);
  const bifurcations = useMemo(() => identifyBifurcationPoints(findings, state.runwayMonths), [findings, state.runwayMonths]);
  const attractors = useMemo(() => identifyAttractors(findings), [findings]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Complex Adaptive Systems Engine</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Models the organization as a CAS: feedback loops (reinforcing/balancing), bifurcation points (structural thresholds), and
          attractors (states the system keeps returning to). Original implementation for this sandbox — generic systems-thinking concepts,
          not a validated organizational model. See About / Provenance.
        </p>
      </div>

      <Card title={`Feedback loops (${loops.length})`} subtitle="Detected from combinations of active rule IDs.">
        {loops.length === 0 ? (
          <p className="text-xs text-slate-500">No feedback loops detected. Try the "Burnout feedback loop" or "Velocity death spiral" presets on Today or the Signal Board.</p>
        ) : (
          <ul className="space-y-2">
            {loops.map((l) => (
              <li key={l.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 font-medium text-slate-200">
                  {l.label}
                  <Badge tone={l.polarity === "REINFORCING" ? "rose" : "amber"}>{l.polarity}</Badge>
                  {l.ruleIds.map((id) => (
                    <Badge key={id} tone="slate">{id}</Badge>
                  ))}
                </div>
                <p className="mt-1 text-slate-500">{l.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Bifurcation points (${bifurcations.length})`} subtitle="Structural thresholds, computed from the Signal Board and runway slider.">
        {bifurcations.length === 0 ? (
          <p className="text-xs text-slate-500">No thresholds currently crossed.</p>
        ) : (
          <ul className="space-y-2">
            {bifurcations.map((b) => (
              <li key={b.id} className="rounded-lg border border-amber-900/40 bg-amber-500/5 p-3 text-xs">
                <div className="font-medium text-amber-300">{b.label}</div>
                <p className="mt-1 text-slate-400">{b.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Attractors (${attractors.length})`} subtitle='Rules with "simulate 3x recurrence" triggered on the Signal Board.'>
        {attractors.length === 0 ? (
          <p className="text-xs text-slate-500">
            None yet. Go to the Signal Board, activate a rule, and click "Simulate 3x recurrence" to see one appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {attractors.map((a) => (
              <li key={a.id} className="rounded-lg border border-rose-900/40 bg-rose-500/5 p-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-rose-300">
                  {a.label}
                  <Badge tone="rose">{a.occurrences}x</Badge>
                </div>
                <p className="mt-1 text-slate-400">{a.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Label>Disclosed gap</Label>
        <p className="mt-1 text-xs text-slate-500">
          "Cultural bifurcation" is intentionally not implemented. It would depend on a <code className="text-slate-400">scoreCulture()</code>{" "}
          function that is not defined anywhere this build's sources were verified against — see About / Provenance.
        </p>
      </Card>
    </div>
  );
}
