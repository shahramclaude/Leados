import { useMemo, useState } from "react";
import { useAppState } from "../lib/AppContext";
import { runInference } from "../lib/inference";
import { runSelfTests } from "../lib/selfTest";
import { RULES, CATEGORIES } from "../lib/rules";
import { Card, SectionTitle, SeverityBadge, Button, Pill } from "../components/ui";

export function TodayView() {
  const { state, setState, reset } = useAppState();
  const findings = useMemo(() => runInference(state.signalBoard), [state.signalBoard]);
  const activeSignals = Object.values(state.signalBoard).filter((s) => s.active).length;
  const [tests] = useState(() => runSelfTests());
  const passCount = tests.filter((t) => t.pass).length;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Today"
        subtitle="Overview of this browser session's synthetic Signal Board, verified rule catalog, and self-test status."
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Active findings</div>
          <div className="mt-1 text-3xl font-semibold text-slate-900">{findings.length}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Active signals</div>
          <div className="mt-1 text-3xl font-semibold text-slate-900">{activeSignals}</div>
          <div className="text-xs text-slate-400">of {RULES.length} total rules</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Categories</div>
          <div className="mt-1 text-3xl font-semibold text-slate-900">{CATEGORIES.length}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Self-tests</div>
          <div className={`mt-1 text-3xl font-semibold ${passCount === tests.length ? "text-emerald-600" : "text-rose-600"}`}>
            {passCount}/{tests.length}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle title="Runway" subtitle="Used by the Financial & Austerity category and onboarding baseline." />
          <Pill tone="indigo">{state.runwayMonths} months</Pill>
        </div>
        <input
          type="range"
          min={0}
          max={36}
          value={state.runwayMonths}
          onChange={(e) => setState((prev) => ({ ...prev, runwayMonths: Number(e.target.value) }))}
          className="w-full"
        />
      </Card>

      <Card>
        <SectionTitle title="Active findings" subtitle="Live output of the inference engine over the current Signal Board." />
        {findings.length === 0 ? (
          <p className="text-sm text-slate-500">No rules are active yet. Go to Signal Board to toggle some on.</p>
        ) : (
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={f.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{f.title}</span>
                  <SeverityBadge severity={f.severity} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{f.narrative}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" onClick={reset}>
          Reset synthetic data
        </Button>
      </div>
    </div>
  );
}
