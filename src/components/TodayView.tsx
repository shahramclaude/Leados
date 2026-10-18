import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { runEngine } from "../lib/engine";
import { runSelfTests } from "../lib/selfTest";
import { resetToSeed } from "../lib/store";
import { Card, Label, SevBadge, Stat } from "./ui";

export function TodayView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const today = useMemo(() => new Date(), []);
  const findings = useMemo(() => runEngine(state, today), [state, today]);
  const tests = useMemo(() => runSelfTests(state, today), [state, today]);
  const [showTests, setShowTests] = useState(true);

  const passCount = tests.filter((t) => t.pass).length;

  return (
    <div className="space-y-6">
      <Card
        title="Overview"
        right={
          <button
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            onClick={() => setState(resetToSeed())}
          >
            Regenerate synthetic data
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="People" value={state.people.length} />
          <Stat label="Events logged" value={state.events.length} />
          <Stat label="Active findings" value={findings.length} />
          <Stat label="Self-tests passing" value={`${passCount}/${tests.length}`} />
        </div>
        <Label>
          All data on this page is synthetically generated (src/lib/seed.ts) for demonstration purposes — it is not a
          real company. Findings below come from a subset of rule IDs (R206–R220) named in the task's pasted
          "pt-U Implementation Summary"; R206/R207/R216/R220 are intentionally not implemented because their
          dependencies (living strategy docs, the simulated-annealing attention optimizer) were not pasted into
          this session. See About / Provenance for the full disclosure.
        </Label>
      </Card>

      <Card title={`Findings (${findings.length})`}>
        {findings.length === 0 && <p className="text-sm text-slate-500">No findings triggered by the current synthetic dataset.</p>}
        <div className="space-y-2">
          {findings.map((f, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
              <SevBadge sev={f.sev} />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">
                  <span className="mr-2 font-mono text-xs text-slate-400">{f.rule}</span>
                  {f.title}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={`Self-test runner — ${passCount}/${tests.length} passing`}
        right={
          <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => setShowTests((s) => !s)}>
            {showTests ? "Hide" : "Show"}
          </button>
        }
      >
        {showTests && (
          <div className="space-y-1.5">
            {tests.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-slate-50">
                <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${t.pass ? "bg-emerald-500" : "bg-rose-500"}`} />
                <span className="w-16 flex-shrink-0 font-mono text-xs text-slate-500">{t.id}</span>
                <span className="text-slate-600">{t.detail}</span>
              </div>
            ))}
          </div>
        )}
        <Label>
          These are originally-named tests ("ST-*") written for this delivery's own code, checking the math in
          talent.ts / financialOS.ts / regulatory.ts / narrativeIntel.ts / orgODE.ts. They are not a reproduction of
          the pasted brief's T_U_1…T_U_20 test suite — most of those depend on modules (attention optimizer,
          scenario federation, living docs) not included in this session's pasted text.
        </Label>
      </Card>
    </div>
  );
}
