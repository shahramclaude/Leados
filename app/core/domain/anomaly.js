/** Honest, read-only SPC assessment of reconstructed weekly case WIP. */
import { computeXmR } from './spc.js';
import { buildVitalSeries } from './vitals.js';

export const ANOMALY_ENGINE_VERSION = 'anomaly-2026.10-v2';
export const ANOMALY_RULE_ID = 'RULE-ANOM-01';

/** Weekly snapshots, not daily net changes. Refuse histories that cannot be reconstructed. */
export function extractModuleSeries(state, metric = 'openCases', options = {}) {
  if (metric !== 'openCases') return [];
  const cases = Array.isArray(state?.cases) ? state.cases : [];
  // An undated opening/closure or a reopening destroys point-in-time fidelity.
  if (cases.some(c => !c?.openedOn || (['resolved', 'closed'].includes(c.status) && !c.resolvedOn)) ||
      (state?.events || []).some(e => e.type === 'case.reopened')) return [];
  return buildVitalSeries(state, 'case-open', { asOf: options.asOf, buckets: 26 }).points
    .map(p => ({ ...p, label: p.date, status: p.value === null ? 'unmeasured' : 'measured' }));
}

export function assessAnomaly(series = [], options = {}) {
  const spc = computeXmR(series, { desirableDirection: options.desirableDirection || 'lower', unit: options.unit || '' });
  const latest = series.at(-1) || null;
  const signals = spc.signals.filter(s => s.index === series.length - 1);
  const signal = signals.find(s => s.polarity === 'adverse') || signals[0] || null;
  const severity = signal?.polarity === 'adverse' ? (signal.rule === 'sustained-shift' ? 4 : 3) : (signal ? 1 : 0);
  const recommendation = !spc.available ? 'Insufficient consecutive history; collect more observations.' :
    signal?.polarity === 'adverse' ? 'Investigate the process and verify the underlying records before acting.' :
    signal ? 'Review this favorable or neutral signal in context.' : 'No latest-point special-cause signal; this does not prove the process is stable.';
  return {
    engineVersion: ANOMALY_ENGINE_VERSION, ruleId: ANOMALY_RULE_ID,
    moduleLabel: options.label || 'Open operational cases', seriesLength: series.length,
    measuredPoints: spc.measuredCount, hasControlLimits: spc.available,
    controlLimits: spc.available ? { unpl: spc.unpl, lnpl: spc.lnpl, mean: spc.mean } : null,
    latestPoint: latest, latestSignal: signal ? { type: signal.rule, polarity: signal.polarity, reason: signal.summary } : null,
    severity, recommendation, predictions: [],
    calibrationNote: 'Descriptive, in-sample control limits; not a calibrated forecast or proof of causation.',
    reason: spc.reason || null,
  };
}

export function generateBoardBrief(results = []) {
  const lines = ['# Operational case WIP — control chart', '',
    'Weekly snapshots reconstructed from recorded case dates. In-sample XmR is exploratory, not a forecast or causal diagnosis.', ''];
  for (const r of results) {
    lines.push(`## ${r.moduleLabel}`, `Measured weeks: ${r.measuredPoints}; latest: ${r.latestPoint?.value ?? 'unmeasured'}.`,
      r.latestSignal ? `Latest signal: ${r.latestSignal.type} (${r.latestSignal.polarity}). ${r.latestSignal.reason}` : 'No latest-point signal, or insufficient history.', r.recommendation, '');
  }
  lines.push('No decisions, coaching notes, stakeholder briefs or forecasts are created by this assessment.');
  return lines.join('\n');
}

/** Retired: the former rule returned unconsumed descriptors and did not create records. */
export function anomalyRule() { return []; }
