import { useMemo } from "react";
import { Card, Badge } from "./Shell";
import type { SignalState } from "../lib/store";
import { buildFindings } from "../lib/engine";
import { CATEGORY_LABEL, CATEGORIES } from "../lib/types";
import { getCurrentProfile } from "../lib/circadian";

export function TodayView({ state, navigate }: { state: SignalState; navigate: (r: string) => void }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const profile = useMemo(() => getCurrentProfile(), []);
  const totalScore = findings.reduce((s, f) => s + f.score, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Today</h1>
        <p className="text-sm text-slate-400">
          Overview of the current synthetic Signal Board state and your circadian capacity window.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Active findings">
          <div className="text-3xl font-semibold text-white">{findings.length}</div>
          <div className="text-xs text-slate-500">of 24 synthetic rules</div>
        </Card>
        <Card title="Aggregate risk score">
          <div className="text-3xl font-semibold text-white">{totalScore.toFixed(1)}</div>
          <div className="text-xs text-slate-500">sum of sev^1.6 across active findings (illustrative)</div>
        </Card>
        <Card title="Circadian phase (now)">
          <div className="text-xl font-semibold text-white">{profile.label}</div>
          <div className="text-xs text-slate-500">analytical capacity ≈ {Math.round(profile.analytical * 100)}%</div>
        </Card>
      </div>

      <Card title="By category">
        <div className="grid gap-2 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const n = findings.filter((f) => f.category === c).length;
            return (
              <div key={c} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm">
                <span className="text-slate-300">{CATEGORY_LABEL[c]}</span>
                <Badge tone={n > 0 ? "amber" : "slate"}>{n}</Badge>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Next step">
        <p className="text-sm text-slate-300">
          You have {findings.length} active findings competing for a finite amount of leadership
          attention this week. Run the optimizer to get the sequence that maximizes benefit under
          your time and cognitive-load budget.
        </p>
        <button
          onClick={() => navigate("/attention")}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Open Attention Optimizer →
        </button>
      </Card>
    </div>
  );
}
