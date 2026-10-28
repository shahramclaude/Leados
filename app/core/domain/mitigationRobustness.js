/**
 * Interval decision analysis, not a forecast or causal estimator.
 * Savage minimax regret over explicit uncertainty sets. The basic mode keeps
 * the original eight-corner model. Constrained-effects mode adds bounded
 * probability and conditional-severity changes, represented as two clipped
 * 2-D polytopes. Bilinear savings attain extrema at a pair of polytope
 * vertices, so the exact search is bounded (at most 36 combinations).
 * No FMEA-to-probability conversion, ambient clock, storage, DOM or network.
 */

export const ROBUSTNESS_RULE_ID = 'RULE-ROB-01';
export const ROBUSTNESS_EVENT = 'mitigation.review.requested';
const MAX_MONEY = 1e12;
const round = (n) => Math.round(n * 100) / 100;
const fail = (error) => ({ ok: false, error });

function numeric(raw) {
  return (typeof raw === 'number' || typeof raw === 'string') && String(raw).trim() !== ''
    ? Number(raw) : NaN;
}

export function normalizeRobustnessInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Enter a probability-range analysis object.');
  const out = {};
  for (const key of ['currentLow', 'currentHigh', 'proposedLow', 'proposedHigh', 'incrementalCost', 'horizonDays']) {
    const n = numeric(input[key]);
    if (!Number.isFinite(n) || n < 0 || (key.endsWith('Low') || key.endsWith('High') ? n > 100 : key === 'incrementalCost' ? n > MAX_MONEY : !Number.isInteger(n) || n < 1 || n > 3650)) {
      return fail('Probabilities must be 0–100%, cost 0–1 trillion, and horizon a whole 1–3650 days.');
    }
    // Do not silently quantize probabilities or tiny costs before analysis.
    out[key] = n;
  }
  if (out.currentLow > out.currentHigh || out.proposedLow > out.proposedHigh) {
    return fail('Each lower probability bound must be at or below its upper bound.');
  }
  const constrained = input.constrainEffects === true;
  if (input.constrainEffects !== undefined && typeof input.constrainEffects !== 'boolean') {
    return fail('Choose whether to constrain intervention effects.');
  }
  out.constrainEffects = constrained;
  if (constrained) {
    for (const key of ['probabilityReductionLow', 'probabilityReductionHigh']) {
      const n = numeric(input[key]);
      if (!Number.isFinite(n) || n < -100 || n > 100) {
        return fail('Effect bounds are required: probability reduction must be −100 to +100 percentage points.');
      }
      out[key] = n;
    }
    for (const key of ['conditionalLossChangeLow', 'conditionalLossChangeHigh']) {
      const n = numeric(input[key]);
      if (!Number.isFinite(n) || n < -MAX_MONEY || n > MAX_MONEY) {
        return fail('Effect bounds are required: conditional-loss change must be within ±1 trillion.');
      }
      out[key] = n;
    }
    if (out.probabilityReductionLow > out.probabilityReductionHigh
        || out.conditionalLossChangeLow > out.conditionalLossChangeHigh) {
      return fail('Each minimum intervention effect must be at or below its maximum.');
    }
  }
  return { ok: true, input: out };
}

export function robustnessLosses(source = {}) {
  const financial = source?.financial || {};
  const losses = ['optimistic', 'mostLikely', 'pessimistic'].map((key) => financial[key]);
  if (losses.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_MONEY)
      || losses[0] > losses[1] || losses[1] > losses[2] || losses[2] === 0) {
    return fail('Supply ordered, nonzero case loss estimates first (0–1 trillion). Missing loss is not zero.');
  }
  return { ok: true, losses, currency: financial.currency || 'USD' };
}

const saving = (currentProbability, proposedProbability, currentLoss, proposedLoss, cost) =>
  (currentLoss * currentProbability - proposedLoss * proposedProbability) / 100 - cost;
// Tolerance only absorbs floating-point arithmetic noise, never a substantive
// monetary cutoff. Classification uses unrounded amounts, not displayed cents.
const epsilon = (...values) => Math.max(1, ...values.map(Math.abs)) * Number.EPSILON * 16;
function verdict(low, high, eps) {
  if (Math.abs(low) <= eps && Math.abs(high) <= eps) return 'Equivalent';
  if (low >= -eps) return 'Proposed dominates';
  if (high <= eps) return 'Hold dominates';
  return 'Evidence-sensitive';
}

function tolerance(...values) {
  return Math.max(1, ...values.map(Math.abs)) * Number.EPSILON * 32;
}

/**
 * Vertices of x∈[xLow,xHigh], y∈[yLow,yHigh], y−x∈[differenceLow,differenceHigh].
 * Candidate intersections of the six boundary lines give an exact bounded
 * polygon (including line/point degeneracies); infeasible boxes return [].
 */
function verticesWithDifference(xLow, xHigh, yLow, yHigh, differenceLow, differenceHigh) {
  const lines = [
    [1, 0, xLow], [1, 0, xHigh], [0, 1, yLow], [0, 1, yHigh],
    [-1, 1, differenceLow], [-1, 1, differenceHigh],
  ];
  const points = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const [a1, b1, c1] = lines[i]; const [a2, b2, c2] = lines[j];
    const determinant = a1 * b2 - a2 * b1;
    if (determinant === 0) continue;
    const x = (c1 * b2 - c2 * b1) / determinant;
    const y = (a1 * c2 - a2 * c1) / determinant;
    const eps = tolerance(x, y, xLow, xHigh, yLow, yHigh, differenceLow, differenceHigh);
    if (x < xLow - eps || x > xHigh + eps || y < yLow - eps || y > yHigh + eps
        || y - x < differenceLow - eps || y - x > differenceHigh + eps) continue;
    if (!points.some((point) => Math.abs(point.x - x) <= eps && Math.abs(point.y - y) <= eps)) points.push({ x, y });
  }
  return points;
}

function axis(a, b) { return a === b ? [a] : Array.from({ length: 5 }, (_, i) => a + (b - a) * i / 4); }

export function analyzeMitigationRobustness(source, rawInput) {
  const normalized = normalizeRobustnessInput(rawInput);
  if (!normalized.ok) return normalized;
  const lossResult = robustnessLosses(source);
  if (!lossResult.ok) return lossResult;
  const input = normalized.input;
  const { losses, currency } = lossResult;
  const probabilityVertices = input.constrainEffects
    ? verticesWithDifference(input.currentLow, input.currentHigh, input.proposedLow, input.proposedHigh,
      -input.probabilityReductionHigh, -input.probabilityReductionLow)
    : [input.currentLow, input.currentHigh].flatMap((current) =>
      [...new Set([input.proposedLow, input.proposedHigh])].map((proposed) => ({ x: current, y: proposed })));
  if (!probabilityVertices.length) return fail('The probability ranges and declared reduction bounds have no feasible combination.');
  const lossVertices = input.constrainEffects
    ? verticesWithDifference(losses[0], losses[2], 0, MAX_MONEY,
      input.conditionalLossChangeLow, input.conditionalLossChangeHigh)
    : [losses[0], losses[2]].map((loss) => ({ x: loss, y: loss }));
  if (!lossVertices.length) return fail('The case loss range and declared conditional-loss change have no feasible nonnegative proposed loss.');

  const scenarios = [];
  for (const p of probabilityVertices) for (const loss of lossVertices) {
    scenarios.push({
      currentProbability: p.x, proposedProbability: p.y,
      currentLoss: loss.x, proposedLoss: loss.y,
      saving: saving(p.x, p.y, loss.x, loss.y, input.incrementalCost),
    });
  }
  const low = Math.min(...scenarios.map((r) => r.saving));
  const high = Math.max(...scenarios.map((r) => r.saving));
  const eps = epsilon(input.incrementalCost, low, high, ...scenarios.flatMap((r) => [
    r.currentLoss * r.currentProbability / 100,
    r.proposedLoss * r.proposedProbability / 100,
  ]));
  const holdRegret = Math.max(0, high);
  const proposedRegret = Math.max(0, -low);
  const preference = Math.abs(holdRegret - proposedRegret) <= eps ? 'Tie'
    : holdRegret < proposedRegret ? 'Hold current plan' : 'Proposed mitigation';

  let grid;
  if (!input.constrainEffects) {
    grid = [];
    for (const current of axis(input.currentLow, input.currentHigh)) {
      for (const proposed of axis(input.proposedLow, input.proposedHigh)) {
        const atLosses = [losses[0], losses[2]].map((loss) => saving(current, proposed, loss, loss, input.incrementalCost));
        grid.push({ current, proposed, low: round(Math.min(...atLosses)), high: round(Math.max(...atLosses)),
          verdict: verdict(Math.min(...atLosses), Math.max(...atLosses), eps) });
      }
    }
  } else {
    const points = [];
    const probabilityFeasible = (current, proposed) => {
      const reduction = current - proposed;
      const epsPoint = tolerance(current, proposed, input.probabilityReductionLow, input.probabilityReductionHigh);
      return reduction >= input.probabilityReductionLow - epsPoint && reduction <= input.probabilityReductionHigh + epsPoint;
    };
    for (const current of axis(input.currentLow, input.currentHigh)) {
      for (const proposed of axis(input.proposedLow, input.proposedHigh)) {
        if (probabilityFeasible(current, proposed)) points.push({ x: current, y: proposed });
      }
    }
    points.push(...probabilityVertices);
    const unique = points.filter((point, index) => !points.slice(0, index).some((other) =>
      Math.abs(point.x - other.x) <= tolerance(point.x, other.x) && Math.abs(point.y - other.y) <= tolerance(point.y, other.y)));
    grid = unique.map((point) => {
      const values = lossVertices.map((loss) => saving(point.x, point.y, loss.x, loss.y, input.incrementalCost));
      const cellLow = Math.min(...values); const cellHigh = Math.max(...values);
      return { current: point.x, proposed: point.y, low: round(cellLow), high: round(cellHigh),
        verdict: verdict(cellLow, cellHigh, eps) };
    });
  }

  const grossSavings = scenarios.map((r) => r.saving + input.incrementalCost);
  const possibleReduction = input.constrainEffects
    ? Math.max(...probabilityVertices.map((p) => p.x - p.y)) / 100
    : (input.currentHigh - input.proposedLow) / 100;
  const guaranteedReduction = input.constrainEffects
    ? Math.min(...probabilityVertices.map((p) => p.x - p.y)) / 100
    : (input.currentLow - input.proposedHigh) / 100;
  const proposedLosses = lossVertices.map((point) => point.y);
  const scope = input.constrainEffects
    ? 'User-declared probability boxes clipped by a bound on current-minus-proposed event probability; case conditional-loss range clipped by a bound on proposed-minus-current conditional loss. Exact extrema enumerate the vertices of both feasible polygons and their Cartesian products. Additional cost is paid once. No fitted probabilities, confidence level, discounting, causal proof or safety clearance. Historical mitigation spending is sunk.'
    : 'Independent declared event-probability ranges over one shared horizon; shared conditional loss range; additional cost paid once. No fitted probabilities, confidence level, discounting, causal proof or safety clearance. Historical mitigation spending is sunk. The rectangular set may include impossible combinations if probabilities are dependent.';
  return {
    ok: true, input, losses, currency,
    proposedLossLow: round(Math.min(...proposedLosses)), proposedLossHigh: round(Math.max(...proposedLosses)),
    savingLow: round(low), savingHigh: round(high),
    holdRegret: round(holdRegret), proposedRegret: round(proposedRegret),
    preference, verdict: verdict(low, high, eps), grid,
    feasibleVertexCounts: { probabilities: probabilityVertices.length, conditionalLosses: lossVertices.length },
    perfectInformationCeiling: round(Math.min(holdRegret, proposedRegret)),
    // A single loss break-even has no meaning when conditional severity itself
    // changes by an independent declared amount under the proposed action.
    possibleBreakEvenLoss: input.constrainEffects ? null : possibleReduction > 0 ? round(input.incrementalCost / possibleReduction) : null,
    guaranteedBreakEvenLoss: input.constrainEffects ? null : guaranteedReduction > 0 ? round(input.incrementalCost / guaranteedReduction) : null,
    breakEvenScope: input.constrainEffects ? 'Not a single-valued threshold when conditional severity changes under the proposal.' : null,
    guaranteedCostCeiling: round(Math.min(...grossSavings)),
    possibleCostCeiling: round(Math.max(...grossSavings)),
    scope,
  };
}

/** Exact numeric provenance, no narrative or lossy hash. Preserve legacy replay keys. */
export function robustnessEvidenceKey(caseId, report, ownerId) {
  const legacy = [caseId, ownerId, report.currency, ...report.losses,
    ...['currentLow', 'currentHigh', 'proposedLow', 'proposedHigh', 'incrementalCost', 'horizonDays'].map((key) => report.input[key])];
  if (!report.input.constrainEffects) return JSON.stringify(legacy);
  return JSON.stringify([...legacy, 'constrained-effects-v1', ...[
    'probabilityReductionLow', 'probabilityReductionHigh', 'conditionalLossChangeLow', 'conditionalLossChangeHigh',
  ].map((key) => report.input[key])]);
}

export function robustnessMarker(key) { return `[${ROBUSTNESS_RULE_ID}:${key}]`; }

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
    ...(i.constrainEffects ? [
      `Declared probability reduction (current minus proposed): ${i.probabilityReductionLow} to ${i.probabilityReductionHigh} percentage points.`,
      `Declared conditional-loss change (proposed minus current): ${i.conditionalLossChangeLow} to ${i.conditionalLossChangeHigh}; feasible proposed conditional loss ${report.proposedLossLow} to ${report.proposedLossHigh}.`,
    ] : []),
    `Exact saving range: ${report.savingLow} to ${report.savingHigh}. ${report.verdict}.`,
    `Savage minimax-regret preference: ${report.preference}. Worst regrets: hold ${report.holdRegret}; proposed ${report.proposedRegret}.`,
    `Model-only perfect-information ceiling: ${report.perfectInformationCeiling}. Not EVSI; real research can be worth less or nothing.`,
    `Break-even loss: possible ${report.possibleBreakEvenLoss ?? report.breakEvenScope ?? 'none'}; guaranteed ${report.guaranteedBreakEvenLoss ?? report.breakEvenScope ?? 'none'}.`,
    `Additional cost ceilings: possible ${report.possibleCostCeiling}; guaranteed ${report.guaranteedCostCeiling}. Negative means even a free mitigation is not assured to help.`,
    i.constrainEffects
      ? `Method: exact vertex enumeration over ${report.feasibleVertexCounts.probabilities} feasible probability vertices × ${report.feasibleVertexCounts.conditionalLosses} feasible conditional-loss vertices; no sampled confidence.`
      : 'Method: extrema at all eight corners of the probability × probability × loss box. The 5×5 grid is illustrative, not a probability distribution. Most-likely loss is provenance, not an expected-value weight.',
    report.scope,
  ].join('\n');
}
