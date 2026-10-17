import { useMemo } from "react";
import { useAppState } from "../lib/AppContext";
import { buildSnapshot, dunbarLoadFactor } from "../lib/leadershipScience";
import { ROSTER } from "../lib/seed";
import { Card, SectionTitle, Pill } from "../components/ui";

export function LeadershipScienceView() {
  const { state } = useAppState();
  const snapshot = useMemo(
    () => buildSnapshot(state.signalBoard, ROSTER, state.onboarding.baseline.teamAgeMonths),
    [state.signalBoard, state.onboarding.baseline.teamAgeMonths],
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Leadership Science"
        subtitle="js/leadership_science.js — heuristics named after public concepts (Tuckman 1965, Edmondson 1999, Dunbar ~1992). Formulas are original simplifications for this sandbox, not validated instruments — unverified beyond this file's own math."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Estimated Tuckman stage</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.tuckmanStage}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Psych-safety risk index</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.psychSafetyRiskIndex}%</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Team age (onboarding baseline)</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{state.onboarding.baseline.teamAgeMonths}mo</div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Span of control" subtitle="5-9 direct reports treated as the commonly cited 'healthy' range (approximation, not a single verified source)." />
        <div className="grid gap-2">
          {ROSTER.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
              <span>
                {p.name} <span className="text-slate-400">· {p.role}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{p.directReports} reports</span>
                <Pill tone={snapshot.spanOfControl[p.id] === "healthy" ? "indigo" : "violet"}>{snapshot.spanOfControl[p.id]}</Pill>
                <span className="text-xs text-slate-400">Dunbar load tier: {dunbarLoadFactor(p.directReports, ROSTER.length - 1)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
