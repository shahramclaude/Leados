import { useState } from 'react';
import { AppState, EventType, Finding } from '../lib/types';
import { PLAYBOOKS } from '../lib/engine';
import { generateFindingExplanation } from '../lib/docs';
import { recallRelevant } from '../lib/institutionalMemory';
import { Card, Button, Pill, Label, inputCls, SectionHeading } from './ui';

const CAPTURE_TYPES: { id: EventType; label: string }[] = [
  { id: 'oneonone.logged', label: '1:1 logged' },
  { id: 'skip.logged', label: 'Skip-level logged' },
  { id: 'decision.made', label: 'Decision made' },
  { id: 'decision.outcome', label: 'Decision outcome' },
  { id: 'crisis.logged', label: 'Crisis logged' },
  { id: 'crisis.postmortem', label: 'Crisis postmortem' },
  { id: 'goal.set', label: 'Goal set' },
  { id: 'feedback.logged', label: 'Feedback logged' },
  { id: 'reflection.logged', label: 'Reflection logged' },
];

const sevTone = (sev: number) => (sev >= 4 ? 'rose' : sev >= 3 ? 'amber' : 'slate') as 'rose' | 'amber' | 'slate';

export function TodayView({
  state,
  findings,
  today,
  onCapture,
  onCompletePlaybook,
  onDismiss,
  onSeed,
  onReset,
}: {
  state: AppState;
  findings: Finding[];
  today: string;
  onCapture: (type: EventType, data: Record<string, any>, personId?: string) => void;
  onCompletePlaybook: (playId: string, personId?: string) => void;
  onDismiss: (key: string, mode: 'snooze' | 'dismiss') => void;
  onSeed: () => void;
  onReset: () => void;
}) {
  const [type, setType] = useState<EventType>('oneonone.logged');
  const [personId, setPersonId] = useState<string>(state.people[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [style, setStyle] = useState<'' | 'plan' | 'direct'>('');
  const [explainKey, setExplainKey] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, any> = {};
    if (note) data.note = note;
    if (title) data.title = title;
    if (owner) data.owner = owner;
    if (style) data.style = style;
    if (type === 'crisis.logged') data.what = note || title;
    if (type === 'crisis.postmortem') {
      data.what_happened = note;
      data.action_items = [];
      data.what_went_well = [];
    }
    if (type === 'reflection.logged') data.patterns = note ? [note] : [];
    onCapture(type, data, personId || undefined);
    setNote('');
    setTitle('');
    setOwner('');
    setStyle('');
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Part 4 — adaptive onboarding is in the banner above the fold"
        title="Today"
        desc="Quick capture writes an event; the engine re-evaluates every rule against your updated log immediately."
      />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Quick capture</h3>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onSeed}>Load sample data</Button>
            <Button variant="danger" onClick={onReset}>Reset all data</Button>
          </div>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Event type</Label>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {CAPTURE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Person (optional)</Label>
            <select className={inputCls} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">— none —</option>
              {state.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {(type === 'decision.made' || type === 'goal.set') && (
            <div>
              <Label>Title</Label>
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Freeze hiring for Q3" />
            </div>
          )}
          {type === 'goal.set' && (
            <div>
              <Label>Owner (person id, optional)</Label>
              <select className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">— no owner —</option>
                {state.people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {(type === 'decision.made' || type === 'oneonone.logged') && (
            <div>
              <Label>Style (for genome heuristic, optional)</Label>
              <select className={inputCls} value={style} onChange={(e) => setStyle(e.target.value as any)}>
                <option value="">— unspecified —</option>
                <option value="plan">plan</option>
                <option value="direct">direct</option>
              </select>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-4">
            <Label>Note / lessons / patterns</Label>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Free text — stored in data.note / data.lessons / data.patterns depending on type" />
          </div>
          <div>
            <Button type="submit">Log event</Button>
          </div>
        </form>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Active findings ({findings.length})
        </h3>
        <div className="space-y-3">
          {findings.length === 0 && (
            <Card className="text-sm text-slate-500">No active findings. Every installed rule is currently passing against your logged data.</Card>
          )}
          {findings.map((f) => {
            const explanation = explainKey === f.key ? generateFindingExplanation(f, state) : null;
            const memories = recallRelevant({ findingRule: f.rule, personId: f.personId }, state, today);
            return (
              <Card key={f.key}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Pill tone={sevTone(f.sev)}>sev {f.sev}</Pill>
                      <Pill>{f.rule}</Pill>
                      <Pill tone="slate">conf {f.conf}</Pill>
                      <Pill tone="slate">score {f.score}</Pill>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{f.title}</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
                      {f.basis.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setExplainKey(explainKey === f.key ? null : f.key)}>
                      {explainKey === f.key ? 'Hide explanation' : 'Explain'}
                    </Button>
                    {f.play && (
                      <Button onClick={() => onCompletePlaybook(f.play as string, f.personId)}>
                        Run playbook: {PLAYBOOKS[f.play]}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => onDismiss(f.key, 'snooze')}>Snooze 3d</Button>
                    <Button variant="ghost" onClick={() => onDismiss(f.key, 'dismiss')}>Dismiss</Button>
                  </div>
                </div>
                {explanation && (
                  <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    <p><span className="font-semibold text-slate-800">Rule:</span> {explanation.headline}</p>
                    <p><span className="font-semibold text-slate-800">Your case:</span> {explanation.yourCase}</p>
                    {explanation.sourceData.length > 0 && (
                      <div>
                        <p className="font-semibold text-slate-800">Source data:</p>
                        <ul className="list-disc pl-4">{explanation.sourceData.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      </div>
                    )}
                    <p><span className="font-semibold text-slate-800">Resolution:</span> {explanation.resolution}</p>
                    {memories.length > 0 && (
                      <div>
                        <p className="font-semibold text-slate-800">Relevant institutional memory:</p>
                        <ul className="list-disc pl-4">{memories.map((m) => <li key={m.id}>{m.lesson}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
