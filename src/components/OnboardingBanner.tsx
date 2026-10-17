import { AppState, Finding } from '../lib/types';
import { getGuidance } from '../lib/onboarding';
import { Card, Button, Pill } from './ui';
import { Tab } from './Shell';

export function OnboardingBanner({ state, findings, onNavigate }: { state: AppState; findings: Finding[]; onNavigate: (t: Tab) => void }) {
  const { stage, guidance } = getGuidance(state, findings);
  return (
    <Card className="border-indigo-100 bg-indigo-50/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1.5">
          <div className="flex items-center gap-2">
            <Pill tone="indigo">Stage: {stage}</Pill>
            <span className="text-xs text-slate-400">Auto-detected from your data — advances as you use the system</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900">{guidance.headline}</h3>
          <p className="text-sm text-slate-600">{guidance.instruction}</p>
          {guidance.whyItMatters && <p className="text-xs italic text-slate-400">Why this matters: {guidance.whyItMatters}</p>}
        </div>
        <Button onClick={() => onNavigate(guidance.actionTab)}>{guidance.actionLabel} →</Button>
      </div>
    </Card>
  );
}
