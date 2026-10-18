import { project } from "../lib/engine";
import { buildAllClear, buildCrisis, buildSeed } from "../lib/store";
import type { AppState } from "../lib/types";
import { DOMAIN_LABEL } from "../lib/types";
import { Button, BucketBadge, Card, SeverityBadge } from "./Shell";

export function TodayView({ state, onReplace }: { state: AppState; onReplace: (s: AppState) => void }) {
  const projection = project(state);
  const top = [...projection.findings].sort((a, b) => b.ageDays - a.ageDays).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-stone-500">Live projection — recomputed from current state on every render, nothing derived is stored.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onReplace(buildAllClear())}>Scenario: all clear</Button>
          <Button onClick={() => onReplace(buildSeed())}>Scenario: busy quarter</Button>
          <Button variant="danger" onClick={() => onReplace(buildCrisis())}>Scenario: crisis</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
        <Card className="lg:col-span-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Overall score</div>
          <div className="mt-2 text-3xl font-bold text-rose-600">{projection.overallScore}</div>
          <div className="mt-1 text-xs text-stone-400">{projection.findings.length} open findings</div>
        </Card>
        {projection.domainScores.map((d) => (
          <Card key={d.domain}>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{DOMAIN_LABEL[d.domain]}</div>
            <div className="mt-2 text-2xl font-bold">{d.score}</div>
            <div className="mt-1">
              <BucketBadge bucket={d.bucket} />
            </div>
          </Card>
        ))}
      </div>

      <Card title="Most overdue / most severe">
        {top.length === 0 ? (
          <div className="py-6 text-center text-sm text-stone-400">No active findings. All clear.</div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {top.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-stone-500">{f.detail}</div>
                  <div className="mt-1 text-[11px] font-mono text-stone-400">{f.rule}</div>
                </div>
                <SeverityBadge severity={f.severity} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
