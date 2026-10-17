import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors } from "../lib/casEngine";
import { Card, Label, Badge } from "./ui";

const POLARITY_TONE: Record<string, "rose" | "emerald" | "amber"> = {
  REINFORCING_NEGATIVE: "rose",
  REINFORCING_POSITIVE: "emerald",
  BALANCING: "amber",
};

export function CasView({ state }: { state: AppState }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const loops = useMemo(() => identifyFeedbackLoops(findings), [findings]);
  const bifurcations = useMemo(() => identifyBifurcationPoints(findings, state.runwayMonths), [findings, state.runwayMonths]);
  const attractors = useMemo(() => identifyAttractors(state), [state]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Complex Adaptive Systems Engine</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Models the organization as a CAS: feedback loops (reinforcing/balancing), bifurcation points (structural
          thresholds past which the system behaves qualitatively differently), and attractors (states the system keeps
          returning to despite intervention). Original implementation for this sandbox — see About / Provenance.
        </p>
      </div>

      <Card title={`Feedback Loops (${loops.length})`} subtitle="Detected from combinations of active rule IDs">
        {loops.length === 0 ? (
          <p className="text-sm text-slate-400">None detected. Try the presets on the Signal Board (e.g. "Burnout loop").</p>
        ) : (
          <ul className="space-y-3">
            {loops.map((l) => (
              <li key={l.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{l.label}</span>
                  <Badge tone={POLARITY_TONE[l.polarity]}>{l.polarity}</Badge>
                  {l.personId && <span className="text-xs text-slate-500">person: {state.people.find((p) => p.id === l.personId)?.name}</span>}
                  <span className="text-[10px] font-mono text-slate-600">{l.rules.join(" + ")}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{l.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <Label>
          Named loops wired up here: BURNOUT_FEEDBACK_LOOP (R7+R4, same person), VELOCITY_DEATH_SPIRAL (R73+R17),
          TALENT_VIRTUOUS_CYCLE (R10+R11, reinforcing-positive), GOVERNANCE_SELF_CORRECTION (R88+R90, balancing).
        </Label>
      </Card>

      <Card title={`Bifurcation Points (${bifurcations.length})`} subtitle="Structural thresholds past which reversal gets harder or impossible">
        {bifurcations.length === 0 ? (
          <p className="text-sm text-slate-400">None crossed. Try dropping runway below 6 months, or activating R88 / R9.</p>
        ) : (
          <ul className="space-y-3">
            {bifurcations.map((b) => (
              <li key={b.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{b.label}</span>
                  <Badge tone={b.reversible ? "amber" : "rose"}>{b.reversible ? "reversible" : "irreversible"}</Badge>
                  <span className="text-[10px] text-slate-600">{b.category}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{b.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <Label>
          <strong className="text-slate-400">Disclosed gap:</strong> a "cultural bifurcation" is referenced in the task's
          pasted brief but depends on a <code className="rounded bg-slate-800 px-1 py-0.5">scoreCulture()</code> function
          that is never defined anywhere in that brief, nor found in the real repo. Left unimplemented here rather than
          invented — the same choice the real repo's own prior sessions made for undefined dependencies.
        </Label>
      </Card>

      <Card title={`Attractors (${attractors.length})`} subtitle="A rule that keeps re-activating after being turned off, ≥2 times">
        {attractors.length === 0 ? (
          <p className="text-sm text-slate-400">
            None yet. Go to the Signal Board and click "simulate 3x recurrence" under any rule, then come back here.
          </p>
        ) : (
          <ul className="space-y-2">
            {attractors.map((a) => (
              <li key={a.key} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
                {a.label}
              </li>
            ))}
          </ul>
        )}
        <Label>
          This build's recurrence detector is a fresh implementation, not a verbatim port of any confirmed source — so it
          intentionally works correctly (requires ≥2 reactivations) rather than inheriting an unverified bug claimed
          elsewhere. See Self-Tests on the Today view: "attractor-needs-2".
        </Label>
      </Card>
    </div>
  );
}
