/**
 * Interval decision analysis, not a forecast or a causal estimator.
 * Savage minimax regret over a rectangular uncertainty set. Savings are
 * L * (pCurrent - pProposed) - incrementalCost. This multi-affine expression
 * attains both extrema at the eight corners; the grid is explanatory only.
 * No FMEA-to-probability conversion, ambient clock, storage, DOM or network.
 */

export const ROBUSTNESS_RULE_ID = 'RULE-ROB-01';
export const ROBUSTNESS_EVENT = 'mitigation.review.requested';
const round = (n) => Math.round(n * 100) / 100;
const fail = (error) => ({ ok: false, error });

export function normalizeRobustnessInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Enter a probability-range analysis object.');
  const out = {};
  for (const key of ['currentLow', 'currentHigh', 'proposedLow', 'proposedHigh', 'incrementalCost', 'horizonDays']) {
    const raw = input[key];
    if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '') {
      return fail('Enter all probability bounds, the additional cost and the shared horizon. Unknown is not zero.');
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || (key.endsWith('Low') || key.endsWith('High') ? n > 100 : key === 'incrementalCost' ? n > 1e12 : !Number.isInteger(n) || n < 1 || n > 3650)) {
      return fail('Probabilities must be 0–100%, cost 0–1 trillion, and horizon a whole 1–3650 days.');
    }
    // Do not silently quantize probabilities or tiny costs before analysis.
    out[key] = n;
  }
  if (out.currentLow > out.currentHigh || out.proposedLow > out.proposedHigh) {
    return fail('Each lower probability bound must be at or below its upper bound.');
  }
  return { ok: true, input: out };
}

export function robustnessLosses(source = {}) {
  const financial = source?.financial || {};
  const losses = ['optimistic', 'mostLikely', 'pessimistic'].map((key) => financial[key]);
  if (losses.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e12)
      || losses[0] > losses[1] || losses[1] > losses[2] || losses[2] === 0) {
    return fail('Supply ordered, nonzero case loss estimates first (0–1 trillion). Missing loss is not zero.');
  }
  return { ok: true, losses, currency: financial.currency || 'USD' };
}

const saving = (loss, current, proposed, cost) => loss * ((current - proposed) / 100) - cost;
// Tolerance only absorbs floating-point arithmetic noise, never a substantive
// monetary cutoff. Classification uses unrounded amounts, not displayed cents.
const epsilon = (...values) => Math.max(1, ...values.map(Math.abs)) * Number.EPSILON * 16;
function verdict(low, high, eps) {
  if (Math.abs(low) <= eps && Math.abs(high) <= eps) return 'Equivalent';
  if (low >= -eps) return 'Proposed dominates';
  if (high <= eps) return 'Hold dominates';
  return 'Evidence-sensitive';
}

export function analyzeMitigationRobustness(source, rawInput) {
  const normalized = normalizeRobustnessInput(rawInput);
  if (!normalized.ok) return normalized;
  const lossResult = robustnessLosses(source);
  if (!lossResult.ok) return lossResult;
  const input = normalized.input;
  const { losses, currency } = lossResult;
  const corners = [];
  for (const loss of [losses[0], losses[2]]) {
    for (const current of [input.currentLow, input.currentHigh]) {
      for (const proposed of [input.proposedLow, input.proposedHigh]) {
        corners.push({ loss, current, proposed, saving: saving(loss, current, proposed, input.incrementalCost) });
      }
    }
  }
  const low = Math.min(...corners.map((r) => r.saving));
  const high = Math.max(...corners.map((r) => r.saving));
  const eps = epsilon(losses[2], input.incrementalCost, low, high);
  const holdRegret = Math.max(0, high);
  const proposedRegret = Math.max(0, -low);
  const preference = Math.abs(holdRegret - proposedRegret) <= eps ? 'Tie'
    : holdRegret < proposedRegret ? 'Hold current plan' : 'Proposed mitigation';
  const axes = (a, b) => a === b ? [a] : Array.from({ length: 5 }, (_, i) => a + (b - a) * i / 4);
  const grid = [];
  for (const current of axes(input.currentLow, input.currentHigh)) {
    for (const proposed of axes(input.proposedLow, input.proposedHigh)) {
      const atLosses = [losses[0], losses[2]].map((loss) => saving(loss, current, proposed, input.incrementalCost));
      grid.push({ current, proposed, low: round(Math.min(...atLosses)), high: round(Math.max(...atLosses)),
        verdict: verdict(Math.min(...atLosses), Math.max(...atLosses), eps) });
    }
  }
  const minReduction = (input.currentLow - input.proposedHigh) / 100;
  const maxReduction = (input.currentHigh - input.proposedLow) / 100;
  const budgetCorners = corners.map((r) => r.saving + input.incrementalCost);
  return {
    ok: true, input, losses, currency,
    savingLow: round(low), savingHigh: round(high),
    holdRegret: round(holdRegret), proposedRegret: round(proposedRegret),
    preference, verdict: verdict(low, high, eps), grid,
    // Regret is a bound on the value of resolving uncertainty for these TWO
    // actions in this model, not EVSI or an expected return on research.
    perfectInformationCeiling: round(Math.min(holdRegret, proposedRegret)),
    guaranteedBreakEvenLoss: minReduction > 0 ? round(input.incrementalCost / minReduction) : null,
    possibleBreakEvenLoss: maxReduction > 0 ? round(input.incrementalCost / maxReduction) : null,
    guaranteedCostCeiling: round(Math.min(...budgetCorners)),
    possibleCostCeiling: round(Math.max(...budgetCorners)),
    scope: 'Independent declared event-probability ranges over one shared horizon; shared conditional loss range; additional cost paid once. No fitted probabilities, confidence level, discounting, causal proof or safety clearance. Historical mitigation spending is sunk. The rectangular set may include impossible combinations if probabilities are dependent.',
  };
}

/** Exact numeric provenance, no narrative or lossy hash. Doubles as replay key. */
export function robustnessEvidenceKey(caseId, report, ownerId) {
  return JSON.stringify([caseId, ownerId, report.currency, ...report.losses,
    ...['currentLow', 'currentHigh', 'proposedLow', 'proposedHigh', 'incrementalCost', 'horizonDays'].map((key) => report.input[key])]);
}

export function robustnessMarker(key) {
  return `[${ROBUSTNESS_RULE_ID}:${key}]`;
}

export function robustnessDecision(state, key) {
  const marker = robustnessMarker(key);
  return (state.decisions || []).find((row) => String(row.question || '').includes(marker)) || null;
}

export function robustnessBrief(report) {
  if (!report?.ok) return 'No valid robustness analysis.';
  const i = report.input;
  return [
    'LeadOS — Mitigation robustness & evidence gate',
    `Horizon: ${i.horizonDays} days. Currency: ${report.currency}. Additional cost: ${i.incrementalCost}.`,
    `Current event probability: ${i.currentLow}–${i.currentHigh}%. Proposed: ${i.proposedLow}–${i.proposedHigh}%.`,
    `Conditional loss estimates (optimistic / most likely / pessimistic): ${report.losses.join(' / ')}.`,
    `Exact saving range: ${report.savingLow} to ${report.savingHigh}. ${report.verdict}.`,
    `Savage minimax-regret preference: ${report.preference}. Worst regrets: hold ${report.holdRegret}; proposed ${report.proposedRegret}.`,
    `Model-only perfect-information ceiling: ${report.perfectInformationCeiling}. Not EVSI; real research can be worth less or nothing.`,
    `Break-even loss: possible ${report.possibleBreakEvenLoss ?? 'none'}; guaranteed ${report.guaranteedBreakEvenLoss ?? 'none'}.`,
    `Additional cost ceilings: possible ${report.possibleCostCeiling}; guaranteed ${report.guaranteedCostCeiling}. Negative means even a free mitigation is not assured to help.`,
    'Method: extrema at all eight corners of the probability × probability × loss box. The 5×5 grid is illustrative, not a probability distribution. Most-likely loss is provenance, not an expected-value weight.',
    report.scope,
  ].join('\n');
}
