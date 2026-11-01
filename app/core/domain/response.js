/** Response Studio: policy alternatives, declared economics and read-side nudges.
 * A replay is a software counterfactual, never a causal forecast of human behaviour.
 */
import { addDays, dayKey } from '../time.js';
import { RESPONSE_LABELS, RESPONSE_STRATEGIES, validateResponseAssumptions } from './responseSchema.js';
export { RESPONSE_LABELS, RESPONSE_STRATEGIES, validateResponseAssumptions } from './responseSchema.js';

export const RESPONSE_VERSION = 'response-2026.11-v1';
export const RESPONSE_RULE_IDS = Object.freeze({ LINK: 'RULE-RSP-01', FOLLOWUP: 'RULE-RSP-02', ADOPT: 'RULE-RSP-03', SCAN: 'RULE-RSP-04' });
const round = (n) => Math.round(n * 100) / 100;
const clone = (v) => JSON.parse(JSON.stringify(v));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
/** Non-cryptographic content identity. Revision equality is the stale-write guard. */
export function responseFingerprint(value) {
  const text = JSON.stringify(canonical(value));
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function responseSourceFingerprint(draft) {
  return responseFingerprint({ sourceText: draft?.sourceText || '', analysis: draft?.analysis || null, status: draft?.status });
}

/** The only strategy-dependent fields. No owner, root cause or probability is invented. */
export function responseCaseInput(baseInput, strategy, assumptions, now = new Date()) {
  const valid = validateResponseAssumptions(assumptions);
  if (!valid.ok) throw new Error(valid.error);
  if (!RESPONSE_STRATEGIES.includes(strategy)) throw new Error('Unknown response policy.');
  const input = clone(baseInput);
  const at = dayKey(now);
  input.openedOn = at;
  input.financial = { ...(input.financial || {}), currency: valid.value.currency,
    mitigationCost: strategy === 'verify' ? 0 : valid.value.mitigationBudget };
  if (strategy === 'verify') input.reviewOn = addDays(at, valid.value.evidenceDays);
  else if (input.reviewOn && input.reviewOn < at) input.reviewOn = addDays(at, 7);
  input.autoPropagate = input.autoPropagate !== false;
  return input;
}

/** PERT-style scenario mean, not a probability distribution or confidence interval. */
export function responseEconomics(assumptions) {
  const valid = validateResponseAssumptions(assumptions);
  if (!valid.ok) return { available: false, reason: valid.error, rows: [] };
  const a = valid.value;
  const rates = { low: a.weeklyDelayLow, mode: a.weeklyDelayMode, high: a.weeklyDelayHigh };
  const carry = (rate, days) => round(rate * days / 7);
  const rows = RESPONSE_STRATEGIES.map((id) => {
    const days = id === 'wait' ? a.delayDays : id === 'verify' ? a.evidenceDays : 0;
    const upfront = id === 'contain' ? a.mitigationBudget : 0;
    const later = id === 'contain' ? 0 : a.mitigationBudget;
    const costs = Object.fromEntries(Object.entries(rates).map(([key, rate]) => [key, round(upfront + later + carry(rate, days))]));
    return { id, label: RESPONSE_LABELS[id], exposureDays: days, upfront, later,
      low: costs.low, mode: costs.mode, high: costs.high,
      mean: round(upfront + later + carry((a.weeklyDelayLow + 4 * a.weeklyDelayMode + a.weeklyDelayHigh) / 6, days)),
      costs };
  });
  for (const key of ['low', 'mode', 'high']) {
    const best = Math.min(...rows.map((row) => row[key]));
    for (const row of rows) row[`${key}Regret`] = round(row[key] - best);
  }
  for (const row of rows) row.maxRegret = Math.max(row.lowRegret, row.modeRegret, row.highRegret);
  const minimum = Math.min(...rows.map((row) => row.maxRegret));
  const verify = rows.find((row) => row.id === 'verify');
  return {
    available: true, currency: a.currency, rows,
    preferred: rows.filter((row) => row.maxRegret === minimum).map((row) => row.id),
    verificationCarry: round(verify.mean - a.mitigationBudget),
    verificationBreakEvenPct: a.mitigationBudget > 0 ? round(100 * (verify.mean - a.mitigationBudget) / a.mitigationBudget) : null,
    scope: 'Known mitigation budget plus declared carrying cost. No discounting, outcome probability, avoided-loss estimate or causal benefit is inferred. The evidence-first budget is a possible later spend, not money committed now.',
  };
}

export function responsePlanInputFingerprint(draftId, caseInput, assumptions, strategy) {
  return responseFingerprint({ draftId, caseInput, assumptions, strategy, version: RESPONSE_VERSION });
}

export function responsePlanReport(state, now = new Date()) {
  const today = dayKey(now);
  const plans = (state.responsePlans || []).map((plan) => ({
    ...plan,
    due: plan.status === 'scheduled' && Boolean(plan.reviewOn && plan.reviewOn <= today),
    stale: ['rehearsed', 'scheduled'].includes(plan.status) && Math.floor((Date.parse(today) - Date.parse(plan.createdAt.slice(0, 10))) / 86400000) >= 3,
    economics: responseEconomics(plan.assumptions),
  }));
  return {
    plans,
    open: plans.filter((p) => ['rehearsed', 'scheduled'].includes(p.status)),
    due: plans.filter((p) => p.due),
    stale: plans.filter((p) => p.stale),
    committed: plans.filter((p) => p.status === 'committed'),
    incomplete: plans.filter((p) => p.preview.branches.some((b) => b.failureCount > 0)),
  };
}

export function responseAttentionCount(state, now = new Date()) {
  const report = responsePlanReport(state, now);
  return new Set([...report.due, ...report.stale, ...report.incomplete].map((p) => p.id)).size;
}

export function responseSignals(state, now = new Date()) {
  const report = responsePlanReport(state, now);
  const route = (id) => `#/responses?plan=${encodeURIComponent(id)}`;
  const signals = [];
  if (report.due.length) signals.push({
    ruleId: 'RSP-01', domain: 'Response studio', severity: 4, confidence: 'high',
    title: `${report.due.length} response review(s) have reached their decision date`,
    detail: 'A delayed response is a choice with a review date, not a forgotten inbox item. Re-read the facts and commit, revise or explicitly reschedule.',
    evidence: report.due.slice(0, 5).map((p) => `${RESPONSE_LABELS[p.strategy]} · review ${p.reviewOn}`),
    action: { label: 'Review responses', route: route(report.due[0].id) },
  });
  if (report.stale.length) signals.push({
    ruleId: 'RSP-02', domain: 'Response studio', severity: 3, confidence: 'high',
    title: `${report.stale.length} response plan(s) have waited at least three days`,
    detail: 'The rehearsal is tied to an old workspace revision. Run it again before acting; no stale preview can be committed.',
    evidence: [`${report.stale.length} open plan(s)`, 'Staleness is an operating convention, not a risk probability.'],
    action: { label: 'Rehearse current facts', route: route(report.stale[0].id) },
  });
  if (report.incomplete.length) signals.push({
    ruleId: 'RSP-03', domain: 'Response studio', severity: 4, confidence: 'high',
    title: `${report.incomplete.length} rehearsal(s) contain isolated rule failures`,
    detail: 'A partial fan-out is not a complete response. Inspect the propagation ledger and rehearse again before adoption.',
    evidence: ['Adoption is blocked while any preview branch reports a rule failure.'],
    action: { label: 'Inspect rehearsal', route: route(report.incomplete[0].id) },
  });
  return signals;
}

/** Identity-free: no intake text, case title, person name or record ID is exported. */
export function responseBrief(plan) {
  if (!plan) return 'No response plan selected.';
  const e = responseEconomics(plan.assumptions);
  return [
    'LeadOS — Response rehearsal receipt', `Policy: ${RESPONSE_LABELS[plan.strategy]}`, `Status: ${plan.status}`,
    `Rehearsed: ${plan.createdAt}`, `Workspace revision: ${plan.baseRevision}`,
    'Scope: production software actions in disposable stores; not a causal prediction of human outcomes.',
    ...plan.preview.branches.map((b) => `${RESPONSE_LABELS[b.id]}: ${b.failureCount} rule failures; ` + b.changes.map((c) => `${c.collection} +${c.created}/~${c.updated}/-${c.removed}`).join('; ')),
    e.available ? `Declared carrying-cost scenarios (${e.currency}; not confidence intervals): ` + e.rows.map((r) => `${r.label} ${r.low} / ${r.mode} / ${r.high}`).join('; ') : e.reason,
    e.scope,
    'Human review required. No message was sent by the rehearsal. No employee score was produced.',
  ].join('\n');
}
