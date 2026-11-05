/**
 * Partial identification (Manski bounds) + Savage minimax regret.
 * Pure scenario calculator: deliberately accepts NO workspace or pulse records.
 * A submission count is not a respondent fraction. All inputs are declarations.
 * No probability distribution, forecast, causal estimate or person score.
 */
export const ROBUSTNESS_VERSION = 'nonresponse-regret-v1';
export const ROBUSTNESS_DUTIES = Object.freeze({
  frontline: { title: 'Protect the next shift', question: 'Is a reversible workload or handover change justified even if missing voices disagree?', reviewDays: 7 },
  manager: { title: 'Coordinate a team experiment', question: 'Which cross-team adjustment is defensible before moving people or capacity?', reviewDays: 14 },
  director: { title: 'Test a structural intervention', question: 'Does the case for a process redesign survive selection uncertainty?', reviewDays: 30 },
  exec: { title: 'Challenge a portfolio assumption', question: 'Would a staged investment still be preferred under adverse missing evidence?', reviewDays: 60 },
  chief: { title: 'Govern an enterprise claim', question: 'Which reversible commitment survives the uncertainty behind a board-level claim?', reviewDays: 90 },
});

const FIELDS = {
  mean: [1, 5, 'Scenario respondent mean'],
  coverage: [0, 100, 'Assumed distinct respondent coverage'],
  missingLow: [1, 5, 'Missing-group lower mean'],
  missingHigh: [1, 5, 'Missing-group upper mean'],
  target: [1, 5, 'Desired score'],
  cost: [0, 1000000000, 'Intervention cost'],
  loss: [0, 1000000000, 'Loss per point of shortfall'],
  effectiveness: [0, 100, 'Assumed intervention effectiveness'],
};

export function validateRobustness(input = {}) {
  const values = {};
  for (const [key, [low, high, label]] of Object.entries(FIELDS)) {
    const raw = input[key];
    if (!['number', 'string'].includes(typeof raw) || (typeof raw === 'string' && !raw.trim())) {
      return { ok: false, field: key, error: `${label} is required; unknown is not zero.` };
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < low || value > high) {
      return { ok: false, field: key, error: `${label} must be between ${low} and ${high}.` };
    }
    values[key] = value;
  }
  if (values.missingLow > values.missingHigh) return { ok: false, field: 'missingHigh', error: 'The missing-group upper mean must not be below its lower mean.' };
  return { ok: true, values };
}

function evaluate(v) {
  const r = v.coverage / 100;
  const low = r * v.mean + (1 - r) * v.missingLow;
  const high = r * v.mean + (1 - r) * v.missingHigh;
  const e = v.effectiveness / 100;
  const benefitLow = e * v.loss * Math.max(0, v.target - high);
  const benefitHigh = e * v.loss * Math.max(0, v.target - low);
  // Both losses share the unmitigated term. Pairwise regret is therefore
  // monotone in mean; evaluating the endpoints is exact, not a grid search.
  const actRegret = Math.max(0, v.cost - benefitLow);
  const waitRegret = Math.max(0, benefitHigh - v.cost);
  const epsilon = 1e-10 * Math.max(1, actRegret, waitRegret, v.cost, benefitHigh);
  const preferred = Math.abs(actRegret - waitRegret) <= epsilon ? 'tie' : actRegret < waitRegret ? 'act' : 'wait';
  const dominance = v.cost < benefitLow - epsilon ? 'act'
    : v.cost > benefitHigh + epsilon ? 'wait' : 'none';
  return {
    low, high, benefitLow, benefitHigh, actRegret, waitRegret, preferred, dominance,
    regretCeiling: Math.min(actRegret, waitRegret),
    costSwitch: (benefitLow + benefitHigh) / 2,
    threshold: high < v.target ? 'below' : low >= v.target ? 'meets' : 'crosses',
    losses: [low, high].map((mean) => ({ mean,
      wait: v.loss * Math.max(0, v.target - mean),
      act: v.cost + (1 - e) * v.loss * Math.max(0, v.target - mean),
    })),
  };
}

export function analyzeRobustness(input) {
  const checked = validateRobustness(input);
  if (!checked.ok) return checked;
  const v = checked.values;
  return {
    ok: true, version: ROBUSTNESS_VERSION, assumptions: v, ...evaluate(v),
    // Fixed sensitivity points, not inferred participation or statistical CI.
    sensitivity: [0, 25, 50, 75, 100].map((coverage) => ({ coverage, ...evaluate({ ...v, coverage }) })),
    unrestricted: evaluate({ ...v, missingLow: 1, missingHigh: 5 }),
  };
}

/** Explicit operational handoff, NOT a link to private evidence.
 * Numeric scenarios stay in the local worksheet; only the human-approved plan
 * goes into ordinary case visibility. CaseCreatedRule and seatRule own fan-out.
 */
export function robustnessCaseInput({ analysis, choice, ownerId, reviewOn, plan, rationale, altitude = 'manager' } = {}) {
  if (!analysis?.ok || !validateRobustness(analysis.assumptions).ok) return { ok: false, error: 'Analyze a valid scenario before creating work.' };
  if (!['act', 'wait'].includes(choice)) return { ok: false, error: 'Choose the action yourself; the calculator does not approve it.' };
  if (typeof ownerId !== 'string' || !ownerId.trim()) return { ok: false, error: 'Choose an accountable owner in your visible span.' };
  if (typeof plan !== 'string' || plan.trim().length < 12 || plan.trim().length > 600) return { ok: false, error: 'Describe a concrete action and observable review criterion in 12–600 characters.' };
  if (typeof rationale !== 'string' || rationale.trim().length < 12 || rationale.trim().length > 600) return { ok: false, error: 'Record why you chose this action in 12–600 characters.' };
  const duty = ROBUSTNESS_DUTIES[altitude] || ROBUSTNESS_DUTIES.manager;
  return { ok: true, data: {
    title: `${duty.title}: ${choice === 'act' ? 'reversible intervention' : 'monitor and review'}`,
    kind: 'initiative', ownerId, reviewOn,
    summary: `Decision robustness review (${ROBUSTNESS_VERSION}). Human choice: ${choice === 'act' ? 'intervene' : 'wait with a dated review'}. This is a declared scenario, not a measured team finding or a causal forecast. No pulse answers, comments, participation counts or scenario scores were copied. Rationale: ${rationale.trim()}`,
    rca: { problemStatement: 'Choose a reversible response under missing-evidence uncertainty.',
      systemicBarrier: 'Submission counts cannot establish distinct coverage or representativeness.',
      preventiveAction: plan.trim() },
    autoPropagate: true, propagateDecision: true, propagateDelegation: true,
  } };
}

export function robustnessWorksheet(analysis) {
  if (!analysis?.ok) return '';
  return JSON.stringify({ version: ROBUSTNESS_VERSION,
    warning: 'PRIVATE SCENARIO WORKSHEET. Declared assumptions, not authenticated survey evidence. Review disclosure before sharing. Bounds are identification regions, not confidence intervals. Minimax regret is not expected loss or the expected value of information.',
    assumptions: analysis.assumptions,
    results: { low: analysis.low, high: analysis.high, actRegret: analysis.actRegret, waitRegret: analysis.waitRegret, preferred: analysis.preferred, costSwitch: analysis.costSwitch },
  }, null, 2);
}

/** Imported results are never trusted: only validated assumptions are replayed. */
export function parseRobustnessWorksheet(text) {
  if (typeof text !== 'string' || text.length > 65536) return { ok: false, error: 'Choose a scenario worksheet smaller than 64 KiB.' };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON. No assumptions were changed.' }; }
  if (parsed?.version !== ROBUSTNESS_VERSION) return { ok: false, error: 'Unsupported scenario version. No assumptions were changed.' };
  const checked = validateRobustness(parsed.assumptions);
  return checked.ok ? { ok: true, assumptions: checked.values } : checked;
}
