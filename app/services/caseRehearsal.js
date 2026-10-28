/** Action-level counterfactuals. All writes, including source-action fan-out,
 * land in an injected disposable store. Never imports browser storage or sends IO.
 * This is a policy rehearsal, not a causal prediction of human behaviour.
 */
import { createStore, STORAGE_KEY } from '../core/store.js';
import { createApi } from '../actions.js';
import { COLLECTIONS } from '../core/schema.js';
import { computeFmea, isFmeaRated } from '../core/domain/cases.js';
import { compareAutomationGraphs } from '../core/domain/assurance.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const excluded = new Set(['events', 'conflicts', 'pulses', 'candidates', 'intakeDrafts']);
const round = (n) => Math.round(n * 100) / 100;

function changes(before, after) {
  return COLLECTIONS.filter((key) => !excluded.has(key)).flatMap((collection) => {
    const old = new Map((before[collection] || []).map((row) => [row.id, row]));
    const next = new Map((after[collection] || []).map((row) => [row.id, row]));
    const created = [...next.keys()].filter((id) => !old.has(id)).length;
    const removed = [...old.keys()].filter((id) => !next.has(id)).length;
    const updated = [...next].filter(([id, row]) => old.has(id) && JSON.stringify(old.get(id)) !== JSON.stringify(row)).length;
    return created || updated || removed ? [{ collection, created, updated, removed }] : [];
  });
}

/** Deliberately narrow input surface: numeric assumptions only, never confidential text. */
export function mitigationPatch(input) {
  const fmea = {};
  for (const key of ['residualSeverity', 'residualProbability', 'residualDetectability']) {
    const value = input?.[key];
    if (value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 10) {
      return { ok: false, error: 'Enter all three residual ratings as whole numbers from 1 to 10.' };
    }
    fmea[key] = Number(value);
  }
  const cost = input?.mitigationCost;
  if (cost === '' || cost == null || !Number.isFinite(Number(cost)) || Number(cost) < 0 || Number(cost) > 1e12) {
    return { ok: false, error: 'Enter a mitigation cost between 0 and 1 trillion.' };
  }
  return { ok: true, patch: { fmea, financial: { mitigationCost: round(Number(cost)) } } };
}

/** Savage minimax regret over declared loss severities, not probabilistic forecasts.
 * Ordinal FMEA occurrence/10 is only an explicit sensitivity proxy. No inferred
 * residual or assumed 60% improvement. Existing mitigation is a sunk cost here.
 */
export function mitigationSensitivity(source, patch) {
  const f = source.financial || {};
  const losses = ['optimistic', 'mostLikely', 'pessimistic'].map((key) => f[key]);
  if (!isFmeaRated(source.fmea) || losses.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
      || losses[0] > losses[1] || losses[1] > losses[2] || losses[2] === 0) {
    return { available: false, reason: 'Rate baseline FMEA and supply ordered, nonzero financial loss estimates before comparing economics.', rows: [] };
  }
  const current = source.fmea;
  const residual = patch.fmea;
  // Compare an additional intervention with the explicitly recorded current residual,
  // falling back to pre-mitigation occurrence only when there is no complete residual.
  const hasResidual = ['residualSeverity', 'residualProbability', 'residualDetectability']
    .every((key) => Number.isInteger(current[key]) && current[key] >= 1 && current[key] <= 10);
  const baseline = hasResidual ? current.residualProbability : current.probability;
  const cost = patch.financial.mitigationCost;
  const rows = losses.map((loss, i) => {
    const hold = round(loss * baseline / 10);
    const proposed = round(cost + loss * residual.residualProbability / 10);
    const best = Math.min(hold, proposed);
    return { scenario: ['Optimistic loss', 'Most-likely loss', 'Pessimistic loss'][i], loss, hold, proposed,
      holdRegret: round(hold - best), proposedRegret: round(proposed - best), saving: round(hold - proposed) };
  });
  const holdRegret = Math.max(...rows.map((r) => r.holdRegret));
  const proposedRegret = Math.max(...rows.map((r) => r.proposedRegret));
  const reduction = (baseline - residual.residualProbability) / 10;
  return { available: true, rows, currency: f.currency || 'USD', baselineOccurrence: baseline,
    baselineSource: hasResidual ? 'recorded residual' : 'pre-mitigation rating',
    breakEvenLoss: reduction > 0 ? round(cost / reduction) : null,
    holdRegret, proposedRegret,
    preference: holdRegret === proposedRegret ? 'Tie' : holdRegret < proposedRegret ? 'Hold current plan' : 'Proposed mitigation',
    safetyWarning: residual.residualSeverity > (hasResidual ? current.residualSeverity : current.severity)
      ? 'Proposed residual severity increases. Financial ranking must not override safety or compliance.' : null,
  };
}

export function rehearseCaseMitigation(state, caseId, input, { now = new Date() } = {}) {
  const validated = mitigationPatch(input);
  if (!validated.ok) return validated;
  const source = (state.cases || []).find((c) => c.id === caseId);
  if (!source) return { ok: false, error: 'Case not found.' };
  if (!['open', 'mitigating', 'monitoring'].includes(source.status)) return { ok: false, error: 'Choose an open case; closed cases cannot rehearse a mitigation.' };
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { ok: false, error: 'A valid rehearsal clock is required.' };
  const actionPatch = clone(validated.patch);
  const existingCost = Number(source.financial?.mitigationCost || 0);
  if (!Number.isFinite(existingCost) || existingCost < 0) return { ok: false, error: 'Repair the existing mitigation cost before rehearsing.' };
  actionPatch.financial.mitigationCost = round(existingCost + validated.patch.financial.mitigationCost);
  const run = (patch) => {
    const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
    const occupied = new Set(COLLECTIONS.flatMap((key) => (state[key] || []).map((r) => r.id)));
    let seq = 0;
    const idFactory = (prefix) => { let id; do { id = `${prefix}-rehearsal-${++seq}`; } while (occupied.has(id)); occupied.add(id); return id; };
    const store = createStore({ storage, now: () => now, idFactory });
    store.load();
    // Reject repaired/imported states rather than presenting normalization as an action effect.
    if (store.persistError || store.warnings.length) return { ok: false, error: 'Workspace needs repair or migration review before action rehearsal.' };
    const before = clone(store.state);
    const api = createApi(store, { now: () => now, idFactory });
    const result = api.updateCase(caseId, patch);
    if (!result.ok) return { ok: false, error: result.error };
    const after = store.state;
    const newEvents = (after.events || []).filter((e) => !(before.events || []).some((old) => old.id === e.id));
    const failureCount = newEvents.filter((e) => e.type === 'automation.rule_error').length;
    const target = after.cases.find((c) => c.id === caseId);
    const rating = computeFmea(target.fmea);
    return { ok: true, changes: changes(before, after), graphDelta: compareAutomationGraphs(before, after),
      auditEvents: newEvents.length, failureCount,
      rpn: isFmeaRated(target.fmea) ? rating.rpn : null, residualRpn: rating.residualRpn,
      automationEnabled: target.autoPropagate !== false };
  };
  try {
    const baseline = run({});
    if (!baseline.ok) return baseline;
    const proposed = run(actionPatch);
    if (!proposed.ok) return proposed;
    return { ok: true, baseline, proposed, sensitivity: mitigationSensitivity(source, validated.patch),
      patch: actionPatch, incrementalCost: validated.patch.financial.mitigationCost, evaluatedAt: now.toISOString(),
      scope: 'Actual updateCase action plus production post-commit rules in isolated memory. No live writes, no messages sent. Counts include refreshed records, not causal outcomes.' };
  } catch {
    return { ok: false, error: 'Rehearsal failed. No live records were changed. Inspect the workspace before retrying.' };
  }
}

export function rehearsalBrief(result) {
  if (!result.ok) return 'No valid rehearsal to export.';
  return ['LeadOS — Counterfactual mitigation rehearsal', result.evaluatedAt, result.scope,
    'Proposed case-edit patch (cumulative mitigation cost): ' + JSON.stringify(result.patch),
    `Additional investment used in sensitivity: ${result.incrementalCost}`,
    'Assumptions: occurrence rating / 10 is an uncalibrated proxy, not a measured probability. Mitigation cost is an additional investment; existing costs are sunk. Shared loss scenarios; no causal or safety guarantee.',
    ...['baseline', 'proposed'].flatMap((key) => [key.toUpperCase(),
      `Rule failures: ${result[key].failureCount}; audit events: ${result[key].auditEvents}`,
      ...result[key].changes.map((r) => `${r.collection}: +${r.created} / ~${r.updated} / -${r.removed}`),
      ...result[key].graphDelta.relationships.map((r) => `${r.sourceType} → ${r.relation} → ${r.targetType}: +${r.added} / -${r.removed}`)]),
    result.sensitivity.available ? `Minimax-regret preference: ${result.sensitivity.preference}; maximum regrets hold=${result.sensitivity.holdRegret}, proposed=${result.sensitivity.proposedRegret} ${result.sensitivity.currency}` : result.sensitivity.reason,
    ...result.sensitivity.rows.map((r) => `${r.scenario}: hold ${r.hold}, proposed ${r.proposed}, saving ${r.saving}`),
    result.sensitivity.safetyWarning || '',
  ].join('\n');
}
