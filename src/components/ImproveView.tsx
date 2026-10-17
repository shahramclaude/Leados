import { AppState, Finding, Settings } from '../lib/types';
import { generateImprovementProposals } from '../lib/selfImprove';
import { Card, Button, Pill, SectionHeading } from './ui';

export function ImproveView({
  state,
  findings,
  today,
  onApplySettings,
}: {
  state: AppState;
  findings: Finding[];
  today: string;
  onApplySettings: (patch: Partial<Settings>) => void;
}) {
  const { proposals, label } = generateImprovementProposals(state, findings, today);

  return (
    <div className="space-y-8">
      <SectionHeading eyebrow="Part 3 — the self-improving system" title="Self-improvement proposals" desc={label} />

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Current settings</h3>
        <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
          <div><p className="text-xs text-slate-400">1:1 cadence</p><p className="font-medium">{state.settings.cadenceDays}d</p></div>
          <div><p className="text-xs text-slate-400">Skip-level cadence</p><p className="font-medium">{state.settings.skipDays}d</p></div>
          <div><p className="text-xs text-slate-400">Decision max open</p><p className="font-medium">{state.settings.decisionMaxOpenDays}d</p></div>
          <div><p className="text-xs text-slate-400">Crisis postmortem window</p><p className="font-medium">{state.settings.crisisPostmortemDays}d</p></div>
        </div>
      </Card>

      <div className="space-y-3">
        {proposals.length === 0 && <Card className="text-sm text-slate-500">No proposals right now — either there isn't enough data yet, or the system is already well-calibrated to your logged behavior.</Card>}
        {proposals.map((p, i) => (
          <Card key={i}>
            <div className="mb-2 flex items-center gap-2">
              <Pill tone="indigo">{p.type.replace('_', ' ')}</Pill>
            </div>
            <p className="text-sm text-slate-700">{p.evidence}</p>
            <p className="mt-1 text-xs text-slate-400">{p.impact}</p>
            {p.detail && (
              <ul className="mt-2 list-disc pl-4 text-xs text-slate-500">
                {p.detail.map((d, j) => <li key={j}>{d}</li>)}
              </ul>
            )}
            {p.apply && (
              <div className="mt-3">
                <Button onClick={() => onApplySettings(p.apply!())}>Approve &amp; apply</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
