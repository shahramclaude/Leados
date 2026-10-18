import { useState } from 'react';
import type { AppState } from '../lib/types';
import { evaluateOpenHypotheses, generateFromAnomalies, learnFromResults } from '../lib/hypothesis';
import { Panel, Label, Stat } from './Shell';

export function HypothesisView({
  state,
  today,
  onLogHypothesis,
  onLogResult,
}: {
  state: AppState;
  today: Date;
  onLogHypothesis: (hypothesisId: string) => void;
  onLogResult: (hypothesisId: string, outcome: 'confirmed' | 'refuted' | 'inconclusive', implication: string) => void;
}) {
  const events = state.events;
  const preview = generateFromAnomalies(events, today);
  const alreadyLoggedIds = new Set(events.filter((e) => e.type === 'hypothesis.generated').map((e) => e.data.id));
  const candidates = preview.hypotheses.filter((h) => !alreadyLoggedIds.has(h.id));

  const open = evaluateOpenHypotheses(events, today);
  const learning = learnFromResults(events);

  const [implicationDraft, setImplicationDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <Panel title="Learning so far" subtitle="What confirmed/refuted hypotheses have updated about the organizational model">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Resolved" value={learning.total} />
          <Stat label="Confirmed" value={learning.confirmed} tone="ok" />
          <Stat label="Refuted" value={learning.refuted} tone="warn" />
          <Stat label="Calibration" value={learning.calibration !== null ? `${learning.calibration}%` : '—'} />
        </div>
        {learning.modelUpdates.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {learning.modelUpdates.map((m, i) => (
              <li key={i} className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-800">{m}</li>
            ))}
          </ul>
        ) : (
          <Label>No confirmed hypotheses yet — resolve one below to see a model update appear here.</Label>
        )}
      </Panel>

      <Panel title="Auto-generated candidates" subtitle="Detected live from anomalies in your event log — not from any predefined rule template">
        {candidates.length === 0 ? (
          <Label>No new anomaly-driven candidates right now. This updates as the event log changes.</Label>
        ) : (
          <div className="space-y-3">
            {candidates.map((h) => (
              <div key={h.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{h.type} · {h.source}</div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{h.statement}</p>
                    <p className="mt-1 text-sm text-slate-600"><strong>Prediction:</strong> {h.prediction}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Test metric: <code>{h.testMetric}</code> · window {h.testWindow_days}d · confidence at generation {Math.round(h.confidenceAtGeneration * 100)}%
                    </p>
                  </div>
                  <button
                    onClick={() => onLogHypothesis(h.id)}
                    className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Track this hypothesis
                  </button>
                </div>
                <Label>{h.label}</Label>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Open &amp; tracked hypotheses" subtitle="Scientific method applied to leadership: state it, wait, test it">
        {open.length === 0 ? (
          <Label>Nothing tracked yet. Track a candidate above to start a test window.</Label>
        ) : (
          <div className="space-y-3">
            {open.map((o) => (
              <div key={o.hypothesis.id} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">{o.hypothesis.statement}</p>
                <p className="mt-1 text-xs text-slate-500">Generated {new Date(o.generatedTs).toDateString()}</p>
                {o.status === 'OPEN' ? (
                  <p className="mt-2 text-sm text-amber-700">⏳ Test window open — {o.daysRemaining} day(s) remaining before a result can be recorded.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-slate-700">
                      Window expired. Current <code>{o.hypothesis.testMetric}</code> value: <strong>{o.currentValue ?? '—'}</strong>.
                      Prediction was: <em>{o.hypothesis.prediction}</em>
                    </p>
                    <textarea
                      placeholder="Implication for the organizational model if this is confirmed…"
                      className="w-full rounded-md border border-slate-300 p-2 text-sm"
                      rows={2}
                      value={implicationDraft[o.hypothesis.id] ?? ''}
                      onChange={(e) => setImplicationDraft((d) => ({ ...d, [o.hypothesis.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onLogResult(o.hypothesis.id, 'confirmed', implicationDraft[o.hypothesis.id] || o.hypothesis.prediction)}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => onLogResult(o.hypothesis.id, 'refuted', implicationDraft[o.hypothesis.id] || '')}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
                      >
                        Refute
                      </button>
                      <button
                        onClick={() => onLogResult(o.hypothesis.id, 'inconclusive', '')}
                        className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
                      >
                        Inconclusive
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
