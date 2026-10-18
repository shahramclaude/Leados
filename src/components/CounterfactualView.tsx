import { useState } from 'react';
import type { Projection } from '../lib/types';
import { counterfactual } from '../lib/causal';
import { Card, SectionTitle, Callout, Tag } from './ui';

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function CounterfactualView({ P, today }: { P: Projection; today: string }) {
  const [type, setType] = useState('hired');
  const [daysBack, setDaysBack] = useState(60);
  const [description, setDescription] = useState('We had hired a second SRE instead of waiting.');
  const [predictedEffect, setPredictedEffect] = useState('Fewer burnout-related findings and no attrition on the Platform team.');
  const [result, setResult] = useState<ReturnType<typeof counterfactual> | null>(null);

  const run = () => {
    const date = daysAgoISO(daysBack);
    setResult(counterfactual({ type, date, description, predictedEffect }, P, today));
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Counterfactual Reasoning" subtitle="What would have happened if you had made a different decision at some point in the past? This tool replays your event log up to that date and compares it to what actually happened since." />
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Decision type</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="hired">Hired</option>
              <option value="promoted">Promoted</option>
              <option value="fired">Let go</option>
              <option value="restructured">Restructured</option>
              <option value="product-decision">Product decision</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">How many days ago would this have happened?</span>
            <input type="number" className="select" value={daysBack} onChange={(e) => setDaysBack(parseInt(e.target.value) || 0)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Describe the hypothetical decision</span>
            <input className="select" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-500">What do you predict would have changed?</span>
            <input className="select" value={predictedEffect} onChange={(e) => setPredictedEffect(e.target.value)} />
          </label>
        </div>
        <button onClick={run} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Run counterfactual analysis
        </button>
      </Card>

      {result && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Tag kind="HYPOTHETICAL" />
            <h3 className="font-semibold text-slate-900">Analysis</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Attritions since" value={String(result.actualDelta.attritions)} />
            <Metric label="Team size delta" value={(result.actualDelta.teamSize > 0 ? '+' : '') + result.actualDelta.teamSize} />
            <Metric label="Finding count delta" value={String(result.actualDelta.findings)} />
          </div>
          <p className="mt-4 text-sm text-slate-700">{result.counterfactualAnalysis.whatHappened}</p>
          <Callout tone="amber">
            <strong>Your hypothesis:</strong> {result.counterfactualAnalysis.hypotheticalPrediction}
            <br />
            <strong>Can this be verified?</strong> {result.counterfactualAnalysis.canVerify ? 'Yes' : 'No \u2014 inherently unverifiable.'}
          </Callout>
          <p className="mt-3 text-xs text-slate-500">{result.counterfactualAnalysis.learningValue}</p>
          <p className="mt-3 text-xs italic text-slate-400">{result.label}</p>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <div className="text-xl font-bold text-slate-800">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
