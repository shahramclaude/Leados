import { useMemo } from "react";
import { useAppState } from "../lib/AppContext";
import { runInference } from "../lib/inference";
import { evaluateCycle } from "../lib/selfImprove";
import { Card, SectionTitle, Button, Pill } from "../components/ui";
import type { FeedbackOutcome } from "../lib/types";

export function SelfImproveView() {
  const { state, setState } = useAppState();
  const findings = useMemo(() => runInference(state.signalBoard), [state.signalBoard]);
  const report = useMemo(() => evaluateCycle(state.feedback, state.incidents), [state.feedback, state.incidents]);

  const vote = (ruleId: string, outcome: FeedbackOutcome) => {
    setState((prev) => ({ ...prev, feedback: [...prev.feedback, { ruleId, outcome, at: Date.now() }] }));
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Self-Improve"
        subtitle="js/selfImprove.js — closes the feedback loop over calibrateRules.js + institutional memory. Heuristic summary of this session's own data, not a trained model."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Feedback recorded</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{report.totalFeedback}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Confirmed rate</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{Math.round(report.confirmedRate * 100)}%</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-slate-400">Incidents on record</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{report.incidentCount}</div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Vote on active findings' rules" subtitle="Confirm or mark false positive to calibrate future severity." />
        {findings.length === 0 && <p className="text-sm text-slate-500">No active findings.</p>}
        {findings.flatMap((f) => f.ruleIds).map((ruleId) => (
          <div key={ruleId} className="mb-2 flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
            <Pill>{ruleId}</Pill>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => vote(ruleId, "confirmed")}>
                Confirm
              </Button>
              <Button variant="ghost" onClick={() => vote(ruleId, "false_positive")}>
                False positive
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <SectionTitle title="Suggestions" />
        {report.suggestions.length === 0 ? (
          <p className="text-sm text-slate-500">Not enough feedback yet to suggest recalibration.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {report.suggestions.map((s) => (
              <li key={s.ruleId} className="rounded-lg border border-slate-100 p-2">
                <Pill>{s.ruleId}</Pill> <span className="ml-2 text-slate-600">{s.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
