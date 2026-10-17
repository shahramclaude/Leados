import { AppState } from '../lib/types';
import { generateMemoryView } from '../lib/institutionalMemory';
import { Card, Pill, SectionHeading } from './ui';

export function MemoryView({ state, today }: { state: AppState; today: string }) {
  const view = generateMemoryView(state, today);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Part 2 — institutional memory"
        title="What the organization has learned"
        desc={view.learnings.label}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-medium text-slate-400">Decision learnings</p>
          <p className="text-2xl font-semibold text-slate-900">{view.learnings.byType.DECISION_LEARNING}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-400">Crisis learnings</p>
          <p className="text-2xl font-semibold text-slate-900">{view.learnings.byType.CRISIS_LEARNING}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-400">Reflective learnings</p>
          <p className="text-2xl font-semibold text-slate-900">{view.learnings.byType.REFLECTIVE_LEARNING}</p>
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Behavioral genome (heuristic)</h3>
          <Pill tone={view.genome.confidence === 'low' ? 'amber' : 'emerald'}>{view.genome.confidence} confidence</Pill>
        </div>
        <p className="text-sm text-slate-600">
          Based on {view.genome.plans} plan-tagged and {view.genome.directs} direct-tagged events, your ratio skews{' '}
          <span className="font-semibold">{view.genome.name}</span> ({view.genome.ratio}x).
        </p>
        <p className="mt-1 text-xs text-slate-400">{view.genome.note}</p>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Learning timeline</h3>
        <div className="space-y-2">
          {view.timeline.length === 0 && <Card className="text-sm text-slate-500">No learnings logged yet.</Card>}
          {view.timeline.map((t) => (
            <Card key={t.quarter}>
              <p className="text-sm font-semibold text-slate-900">{t.quarter} — {t.count} learning(s)</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">
                {t.highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Transferable wisdom (successor-ready)</h3>
        <Card>
          {view.transferableWisdom.length === 0 && <p className="text-sm text-slate-500">None yet — transferable wisdom excludes personal-voice reflections by design.</p>}
          <ul className="space-y-2 text-sm">
            {view.transferableWisdom.map((w, i) => (
              <li key={i} className="border-b border-slate-100 pb-2 last:border-0">
                <p className="text-slate-700">{w.lesson}</p>
                <p className="text-xs text-slate-400">{w.source} — {w.context}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">All learnings</h3>
        <Card className="max-h-96 overflow-auto">
          <ul className="divide-y divide-slate-100 text-sm">
            {view.learnings.learnings.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex items-center gap-2">
                  <Pill tone="indigo">{l.type.replace('_', ' ')}</Pill>
                  <span className="text-xs text-slate-400">{l.date.slice(0, 10)}</span>
                </div>
                <p className="mt-1 text-slate-700">{l.lesson}</p>
                <p className="text-xs text-slate-400">{l.context}</p>
              </li>
            ))}
            {view.learnings.learnings.length === 0 && <li className="py-2 text-slate-400">Nothing logged yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
