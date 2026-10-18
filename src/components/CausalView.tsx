import { useMemo, useState } from 'react';
import type { Projection } from '../lib/types';
import { buildCausalGraph, estimateCausalEffect, VARIABLE_LABELS } from '../lib/causal';
import { Card, SectionTitle, Tag, Callout } from './ui';

const VAR_NAMES = Object.keys(VARIABLE_LABELS);

export function CausalView({
  P,
  today,
  onAnnotate,
}: {
  P: Projection;
  today: string;
  onAnnotate: (cause: string, effect: string, direction: 'DIRECT' | 'INVERSE', strength: number, note: string) => void;
}) {
  const graph = useMemo(() => buildCausalGraph(P, today), [P, today]);

  const [cause, setCause] = useState(VAR_NAMES[0]);
  const [effect, setEffect] = useState(VAR_NAMES[1]);
  const [direction, setDirection] = useState<'DIRECT' | 'INVERSE'>('DIRECT');
  const [strength, setStrength] = useState(0.5);
  const [note, setNote] = useState('');

  const [interventionVar, setInterventionVar] = useState(VAR_NAMES[0]);
  const [interventionVal, setInterventionVal] = useState(1);
  const [outcomeVar, setOutcomeVar] = useState('flightRisk');

  const estimate = useMemo(
    () => estimateCausalEffect({ variable: interventionVar, value: interventionVal }, outcomeVar, graph, graph.nodes),
    [interventionVar, interventionVal, outcomeVar, graph]
  );

  return (
    <div className="space-y-6">
      <SectionTitle title="Structural Causal Model" subtitle={graph.label} />

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">Causal graph edges</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">From \u2192 To</th>
                <th className="py-2 pr-3">Direction</th>
                <th className="py-2 pr-3">Strength</th>
                <th className="py-2">Basis</th>
              </tr>
            </thead>
            <tbody>
              {graph.edges.map((e, i) => (
                <tr key={i} className="border-b border-slate-50 align-top">
                  <td className="py-2 pr-3"><Tag kind={e.type} /></td>
                  <td className="py-2 pr-3 font-medium text-slate-700">
                    {VARIABLE_LABELS[e.from] || e.from} \u2192 {VARIABLE_LABELS[e.to] || e.to}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{e.direction}</td>
                  <td className="py-2 pr-3 text-slate-500">{e.assumed_strength ?? e.confirmed_strength ?? e.r ?? '\u2014'}</td>
                  <td className="py-2 text-xs text-slate-500">{e.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout tone="amber" >
          Known structural limitation (from the pasted spec, not patched silently): the <code>flightRisk</code> variable is measured only across currently-active
          people here, where it is always 0 (departed people are excluded from this node set by the spec's own definition). This edge type is therefore only
          meaningfully evidenced via the separate historical departure-signature model under Roster &amp; Flight Risk, not via the correlation table above.
        </Callout>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">Do-calculus: estimate a causal effect</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Intervention variable">
            <select className="select" value={interventionVar} onChange={(e) => setInterventionVar(e.target.value)}>
              {VAR_NAMES.map((v) => <option key={v} value={v}>{VARIABLE_LABELS[v]}</option>)}
            </select>
          </Field>
          <Field label="Set to value">
            <input type="number" step="0.1" className="select" value={interventionVal} onChange={(e) => setInterventionVal(parseFloat(e.target.value))} />
          </Field>
          <Field label="Outcome variable">
            <select className="select" value={outcomeVar} onChange={(e) => setOutcomeVar(e.target.value)}>
              {VAR_NAMES.map((v) => <option key={v} value={v}>{VARIABLE_LABELS[v]}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          {'error' in estimate ? (
            <p className="text-slate-500">{estimate.error}</p>
          ) : 'method' in estimate ? (
            <div>
              <div className="font-semibold text-slate-800">{estimate.method}</div>
              <p className="mt-1 text-slate-600">{estimate.note}</p>
              <p className="mt-2 text-xs text-slate-400">{estimate.label}</p>
            </div>
          ) : (
            <div>
              <div className="font-semibold text-slate-800">Estimated effect: {estimate.estimatedEffect}</div>
              <p className="mt-1 text-slate-600">{estimate.interpretation}</p>
              <p className="mt-2 text-xs text-slate-400">{estimate.confidence}</p>
              <p className="mt-1 text-xs text-slate-400">{estimate.label}</p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">Log a CONFIRMED causal annotation</h3>
        <p className="mb-3 text-xs text-slate-500">Use this after you've observed and are confident about a cause \u2192 effect relationship in your own org (e.g. from a decision-outcome review).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cause">
            <select className="select" value={cause} onChange={(e) => setCause(e.target.value)}>
              {VAR_NAMES.map((v) => <option key={v} value={v}>{VARIABLE_LABELS[v]}</option>)}
            </select>
          </Field>
          <Field label="Effect">
            <select className="select" value={effect} onChange={(e) => setEffect(e.target.value)}>
              {VAR_NAMES.map((v) => <option key={v} value={v}>{VARIABLE_LABELS[v]}</option>)}
            </select>
          </Field>
          <Field label="Direction">
            <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as 'DIRECT' | 'INVERSE')}>
              <option value="DIRECT">DIRECT</option>
              <option value="INVERSE">INVERSE</option>
            </select>
          </Field>
          <Field label="Strength (0-1)">
            <input type="number" min={0} max={1} step={0.05} className="select" value={strength} onChange={(e) => setStrength(parseFloat(e.target.value))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note (your evidence)">
              <input className="select" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Logged decision.outcome after shifting 1:1 cadence for Team X" />
            </Field>
          </div>
        </div>
        <button
          onClick={() => { if (note.trim()) { onAnnotate(cause, effect, direction, strength, note.trim()); setNote(''); } }}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          disabled={!note.trim()}
        >
          Log annotation
        </button>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
