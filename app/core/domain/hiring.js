/**
 * app/core/domain/hiring.js — Selection, evidence and hiring decisions.
 *
 * Hiring is the highest-leverage decision most managers make and the one they
 * receive the least structured training for. This module treats it as a
 * measurement problem with a decision at the end, not a pipeline with a score:
 *
 *  1. Industrial/organisational psychology — structured, job-related evidence
 *     dominates. Kind-level validity coefficients follow Sackett, Zhang, Berry
 *     & Lievens (2022), the current re-analysis of the field's meta-analyses,
 *     which corrected decades of range-restriction overcorrection: structured
 *     interviews .42, job-knowledge tests .40, work samples .33, cognitive
 *     ability .31, unstructured interviews .19, years of experience .07.
 *     (Schmidt & Hunter's 1998 table — .51 / .48 / .54 / .51 / .38 / .18 — is
 *     the better-known predecessor and is *higher* on every method here; using
 *     the 2022 estimates is the conservative choice. 1998 also put work samples
 *     first, 2022 puts structured interviews first, which is why the app no
 *     longer calls a work sample the strongest available signal.) The numbers
 *     are used as *weights*, not as promises: even at .42, no single
 *     conversation can carry a decision.
 *  2. Statistics — evidence is combined in log-odds (the natural scale for
 *     multiplying likelihood ratios) and then converted back once. Correlated
 *     evidence is discounted so five unstructured chats with the same
 *     interviewer never masquerade as five independent signals. Directional
 *     disagreement between raters is surfaced rather than averaged away.
 *  3. Economics & game theory — signaling (Spence, 1973) and adverse selection
 *     (Akerlof, 1970) explain why expensive signals are worth more than cheap
 *     ones; the cost-of-vacancy arithmetic keeps the alternative to hiring
 *     visible instead of treating an empty seat as free.
 *  4. Decision science — every assessment ships a "what would change my mind"
 *     test (the number of contrary observations that would cross the 50%
 *     line), so the leader can run a genuine falsification check instead of
 *     defending a first impression.
 *  5. Process fairness — no protected attribute is ever stored. What is
 *     measured instead is whether the process was applied evenly: the same
 *     competencies assessed for every candidate for the same role, and
 *     decisions that carry at least the evidence the process promised.
 *
 * Pure module: no DOM, no storage, no clock. Everything is derived from records.
 */

import { dayKey } from '../time.js';

/* ---------------------------------------------------------------- constants */

export const REQUISITION_STATUSES = ['open', 'on-hold', 'offer', 'filled', 'cancelled'];

/** Statuses that still consume interviewer time and therefore capacity. */
export const ACTIVE_REQUISITION_STATUSES = ['open', 'offer'];

export const REQUISITION_STATUS_LABELS = {
  open: 'Sourcing & interviewing',
  'on-hold': 'On hold',
  offer: 'Offer out',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

export const REQUISITION_REASONS = ['growth', 'backfill', 'new-scope', 'capability'];

export const REQUISITION_REASON_LABELS = {
  growth: 'Growth — added capacity',
  backfill: 'Backfill — replacing a departure',
  'new-scope': 'New scope — a mandate that did not exist',
  capability: 'Capability gap — a skill the team lacks',
};

export const CANDIDATE_STAGES = [
  'sourced',
  'screening',
  'interviewing',
  'final',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
];

/** Stages that are still in play (the candidate can still move). */
export const OPEN_CANDIDATE_STAGES = ['sourced', 'screening', 'interviewing', 'final', 'offer'];

export const CANDIDATE_STAGE_LABELS = {
  sourced: 'Sourced',
  screening: 'Screening',
  interviewing: 'Interviewing',
  final: 'Final / panel',
  offer: 'Offer out',
  hired: 'Hired',
  rejected: 'Not progressed',
  withdrawn: 'Withdrawn',
};

export const CANDIDATE_OUTCOMES = ['advance', 'hold', 'hire', 'reject', 'withdraw'];

export const CANDIDATE_OUTCOME_LABELS = {
  advance: 'Advance to the next stage',
  hold: 'Hold — collect more evidence',
  hire: 'Make an offer',
  reject: 'Do not progress',
  withdraw: 'Candidate withdrew',
};

/**
 * Evidence kinds and their validity as predictors of job performance, used as
 * log-odds weights. Values are the Sackett et al. (2022) re-analysis of the
 * personnel-selection meta-analyses. A 5/5 structured interview can therefore
 * move the estimate by at most .42, which is why one interview cannot decide
 * anything.
 *
 * `guidance` is shown next to the choice so the leader knows what the option
 * actually means before they use it.
 */
export const EVIDENCE_KINDS = [
  {
    id: 'structured-interview',
    label: 'Structured interview (same questions, scored rubric)',
    validity: 0.42,
    structured: true,
    guidance: 'Every candidate got the same questions and a rated rubric. The highest-validity method in the 2022 re-analysis — and the cheapest to adopt.',
  },
  {
    id: 'job-knowledge',
    label: 'Job-knowledge test or technical exercise',
    validity: 0.40,
    structured: true,
    guidance: 'Directly tests required knowledge with a scored rubric. Strong, but narrower than a full work sample; keep the scoring key fixed in advance.',
  },
  {
    id: 'work-sample',
    label: 'Work sample / job simulation',
    validity: 0.33,
    structured: true,
    guidance: 'The candidate did a representative piece of the job. Costs the most per candidate and is the most resistant to affinity bias; its validity was revised down from .54 to .33 in 2022.',
  },
  {
    id: 'cognitive-test',
    label: 'Cognitive ability / validated work-style assessment',
    validity: 0.31,
    structured: true,
    guidance: 'A validated, job-related assessment. Check it is not acting as a proxy for background, and never screen on it alone.',
  },
  {
    id: 'unstructured-interview',
    label: 'Unstructured conversation / "gut feel"',
    validity: 0.19,
    structured: false,
    guidance: 'Ties with a general personality questionnaire for weakest usable signal. Recording it is honest; relying on it is the most common hiring error.',
  },
  {
    id: 'reference',
    label: 'Reference check',
    validity: 0.18,
    structured: false,
    guidance: 'Not in the 2022 revision; kept conservative below the unstructured interview. Weak on its own and rarely candid — use it to verify specific claims (scope, ownership, exit context), not to predict performance.',
  },
  {
    id: 'years-experience',
    label: 'Years of experience / CV screen',
    validity: 0.07,
    structured: false,
    guidance: 'The weakest predictor in the table, and the one that most penalises career changers. Count it as context, never as evidence of capability.',
  },
];

export const EVIDENCE_KIND_BY_ID = Object.fromEntries(EVIDENCE_KINDS.map((k) => [k.id, k]));
export const EVIDENCE_KIND_LABELS = Object.fromEntries(EVIDENCE_KINDS.map((k) => [k.id, k.label]));
export const DEFAULT_EVIDENCE_KIND = 'structured-interview';

/** Behavioural anchors for the 1–5 evidence rating. 3 is deliberately neutral. */
export const EVIDENCE_RATING_ANCHORS = [
  { rating: 1, label: 'Clear contrary evidence', detail: 'Directly observed a gap that matters for this role.' },
  { rating: 2, label: 'Below the bar', detail: 'Mostly weaker than the role needs, with one or two positives.' },
  { rating: 3, label: 'Mixed / no signal', detail: 'Nothing decisive either way. This rating moves the estimate almost not at all.' },
  { rating: 4, label: 'Above the bar', detail: 'Specific, job-related examples that met or beat expectations.' },
  { rating: 5, label: 'Strong evidence', detail: 'Repeated, job-related evidence that clearly exceeds the bar.' },
];

/** Decision threshold used only for the flip test and the plain-language band. */
export const HIRE_THRESHOLD = 0.5;

/**
 * Evidence-weight floor before an offer is treated as supported. This is a
 * *convention*, not a validated cutoff: at the 2022 weights it means at least
 * two reasonably strong, independent observations (a 5/5 structured interview
 * plus a 5/5 job-knowledge test clears it; a single interview never does). The
 * UI states it as a convention every time it is used.
 */
export const MIN_EVIDENCE_WEIGHT = 0.5;

/** Default prior probability that any candidate reaching the bar would succeed. */
export const DEFAULT_BASE_RATE = 0.45;
export const BASE_RATE_RANGE = [0.05, 0.95];

/** Rating scale 1–5 with midpoint 3 and one-unit standard deviation. */
const RATING_MIDPOINT = 3;
const RATING_HALF_RANGE = 2;

/* ------------------------------------------------------------------- helpers */

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function finite(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function logit(p) {
  const safe = clamp(p, 0.001, 0.999);
  return Math.log(safe / (1 - safe));
}

export function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Whole days between two `YYYY-MM-DD` keys, or null if either is missing. */
export function daysBetween(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const from = new Date(`${fromDay}T00:00:00Z`);
  const to = new Date(`${toDay}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86_400_000);
}

export function isOpenCandidate(candidate) {
  return Boolean(candidate) && OPEN_CANDIDATE_STAGES.includes(candidate.stage);
}

export function isActiveRequisition(requisition) {
  return Boolean(requisition) && ACTIVE_REQUISITION_STATUSES.includes(requisition.status);
}

export function nextStage(stage) {
  const open = OPEN_CANDIDATE_STAGES;
  const index = open.indexOf(stage);
  if (index < 0) return stage;
  return open[Math.min(open.length - 1, index + 1)];
}

/** Measurable three-point effort, or null when the leader has not estimated it. */
export function measurableEffort(effort) {
  const o = finite(effort?.optimistic, 0);
  const m = finite(effort?.mostLikely, 0);
  const p = finite(effort?.pessimistic, 0);
  if (o <= 0 && m <= 0 && p <= 0) return null;
  return { optimistic: o, mostLikely: m, pessimistic: p };
}

/* ------------------------------------------------------------------ evidence */

/**
 * Combine recorded evidence into a posterior probability, with an audit trail.
 *
 * Each signal contributes `validity(kind) × (rating − 3) / 2` in log-odds. The
 * repeated-evidence factor encodes the fact that two ratings of the same
 * competency using the same method — and especially by the same interviewer —
 * are not independent observations: the second adds half, and a repeat by the
 * same person adds a quarter.
 *
 * @returns {{
 *   prior: number, priorLogit: number, posterior: number, posteriorLogit: number,
 *   totalWeight: number, distinctKinds: number, raterCount: number,
 *   contributions: Array<object>, band: string, disagreements: Array<object>,
 *   sameRaterOnly: boolean, strongestKindId: string|null, signalCount: number
 * }}
 */
export function auditEvidence(signals = [], { prior = DEFAULT_BASE_RATE } = {}) {
  const base = clamp(finite(prior, DEFAULT_BASE_RATE), ...BASE_RATE_RANGE);
  const ordered = (Array.isArray(signals) ? signals : [])
    .filter((s) => s && EVIDENCE_KIND_BY_ID[s.kind])
    .slice()
    .sort((a, b) => {
      const da = String(a.date || '');
      const db = String(b.date || '');
      if (da !== db) return da < db ? -1 : 1;
      return String(a.id || '') < String(b.id || '') ? -1 : 1;
    });

  const seen = new Map();
  const contributions = [];
  const raters = new Set();
  const kinds = new Set();
  let weight = 0;
  let logOdds = 0;

  for (const signal of ordered) {
    const kind = EVIDENCE_KIND_BY_ID[signal.kind];
    const rating = clamp(Math.round(finite(signal.rating, RATING_MIDPOINT)), 1, 5);
    const deviation = (rating - RATING_MIDPOINT) / RATING_HALF_RANGE; // -1 … +1
    const groupKey = `${signal.kind}|${signal.competencyId || 'none'}`;
    const interviewerKey = String(signal.interviewerId || 'unattributed');
    const priorSameGroup = seen.get(groupKey) || { count: 0, interviewers: new Set() };
    let factor = 1;
    let repeatedReason = '';
    if (priorSameGroup.count > 0) {
      if (priorSameGroup.interviewers.has(interviewerKey)) {
        factor = 0.25;
        repeatedReason = 'repeat rating of the same competency, same method and same interviewer';
      } else {
        factor = 0.5;
        repeatedReason = 'repeat rating of the same competency and method by a different interviewer';
      }
    }
    priorSameGroup.count += 1;
    priorSameGroup.interviewers.add(interviewerKey);
    seen.set(groupKey, priorSameGroup);

    const contribution = kind.validity * deviation * factor;
    logOdds += contribution;
    weight += Math.abs(kind.validity * factor);
    if (signal.interviewerId) raters.add(interviewerKey);
    kinds.add(signal.kind);

    contributions.push({
      signalId: signal.id || '',
      kindId: signal.kind,
      kindLabel: kind.label,
      competencyId: signal.competencyId || null,
      rating,
      validity: kind.validity,
      factor,
      repeatedReason,
      contribution,
      interviewerId: signal.interviewerId || null,
    });
  }

  const priorLogit = logit(base);
  const posteriorLogit = priorLogit + logOdds;

  // Directional disagreement: opposite ends of the scale on the same
  // competency. Averaging hides it; a spread of 3+ needs a work sample or a
  // calibration conversation, not another opinion.
  const byCompetency = new Map();
  for (const signal of ordered) {
    if (!signal.competencyId) continue;
    const list = byCompetency.get(signal.competencyId) || [];
    list.push(clamp(Math.round(finite(signal.rating, RATING_MIDPOINT)), 1, 5));
    byCompetency.set(signal.competencyId, list);
  }
  const disagreements = [...byCompetency.entries()]
    .map(([competencyId, ratings]) => ({
      competencyId,
      ratings: ratings.slice(),
      spread: ratings.length > 1 ? Math.max(...ratings) - Math.min(...ratings) : 0,
    }))
    .filter((row) => row.spread >= 3);

  const strongest = ordered
    .map((s) => EVIDENCE_KIND_BY_ID[s.kind])
    .sort((a, b) => b.validity - a.validity)[0] || null;

  return {
    prior: base,
    priorLogit,
    posterior: logistic(posteriorLogit),
    posteriorLogit,
    totalWeight: weight,
    distinctKinds: kinds.size,
    raterCount: raters.size,
    signalCount: ordered.length,
    contributions,
    band: weight < MIN_EVIDENCE_WEIGHT ? 'thin' : weight < MIN_EVIDENCE_WEIGHT * 2 ? 'moderate' : 'strong',
    disagreements,
    sameRaterOnly: raters.size === 1 && ordered.length > 1,
    strongestKindId: strongest ? strongest.id : null,
  };
}

/**
 * "What would change my mind" — how many further extreme observations of the
 * strongest available kind would move the posterior across the 50% line.
 *
 * Returns null when no amount of that evidence would cross the line (possible
 * with an extreme prior), so the UI can say so instead of printing a number
 * that implies precision the model does not have.
 */
export function flipTest(audit, { kindId = null, threshold = HIRE_THRESHOLD } = {}) {
  if (!audit) return null;
  const kind = EVIDENCE_KIND_BY_ID[kindId || audit.strongestKindId || DEFAULT_EVIDENCE_KIND];
  if (!kind) return null;
  const post = audit.posterior;
  const against = post >= threshold;
  const targetLogit = logit(threshold);
  const gap = against ? audit.posteriorLogit - targetLogit : targetLogit - audit.posteriorLogit;
  if (gap <= 0) return { direction: 'none', count: 0, kindId: kind.id, kindLabel: kind.label };
  const step = kind.validity;
  if (step <= 0) return null;
  return {
    direction: against ? 'against' : 'for',
    count: Math.ceil(gap / step),
    kindId: kind.id,
    kindLabel: kind.label,
  };
}

/* ------------------------------------------------------------------ coverage */

/**
 * Which of the role's competencies have actually been assessed, and with what
 * evidence count. Missing competencies are a fact about the process, not about
 * the candidate.
 */
export function competencyCoverage(requisition, signals = []) {
  const competencies = (requisition?.competencies || []).filter((c) => c && c.name);
  const counts = new Map();
  for (const signal of signals || []) {
    if (!signal?.competencyId) continue;
    counts.set(signal.competencyId, (counts.get(signal.competencyId) || 0) + 1);
  }
  const rows = competencies.map((c) => ({
    id: c.id,
    name: c.name,
    weight: clamp(Math.round(finite(c.weight, 1)), 1, 5),
    required: c.required !== false,
    evidenceCount: counts.get(c.id) || 0,
    covered: (counts.get(c.id) || 0) > 0,
  }));
  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  const coveredWeight = rows.filter((r) => r.covered).reduce((sum, r) => sum + r.weight, 0);
  return {
    rows,
    totalWeight,
    coveredWeight,
    pct: totalWeight > 0 ? Math.round((coveredWeight / totalWeight) * 100) : null,
    requiredUncovered: rows.filter((r) => r.required && !r.covered),
    optionalUncovered: rows.filter((r) => !r.required && !r.covered),
    measured: totalWeight > 0,
  };
}

/* --------------------------------------------------------------- assessment */

/**
 * Full read on one candidate: posterior, coverage, blockers, warnings and the
 * flip test. The app never prints a bare percentage as a verdict — it prints
 * the estimate, the evidence behind it, and what is missing.
 */
export function assessCandidate(candidate, requisition, { prior = DEFAULT_BASE_RATE, threshold = HIRE_THRESHOLD } = {}) {
  const signals = Array.isArray(candidate?.signals) ? candidate.signals : [];
  const audit = auditEvidence(signals, { prior });
  const coverage = competencyCoverage(requisition, signals);
  const flip = flipTest(audit, { threshold });
  const open = isOpenCandidate(candidate);

  const blockers = [];
  if (open && !coverage.measured) {
    blockers.push({
      code: 'no-competencies',
      message: 'The role has no competencies recorded, so there is nothing to assess against. Add the 2–5 things this role must be able to do.',
    });
  }
  if (open && coverage.requiredUncovered.length) {
    blockers.push({
      code: 'required-uncovered',
      message: `No evidence yet on ${coverage.requiredUncovered.map((c) => c.name).join(', ')}.`,
    });
  }
  if (open && audit.totalWeight < MIN_EVIDENCE_WEIGHT) {
    blockers.push({
      code: 'thin-evidence',
      message: `Evidence weight ${audit.totalWeight.toFixed(2)} is below the ${MIN_EVIDENCE_WEIGHT.toFixed(2)} convention. One conversation is not a decision.`,
    });
  }
  if (open && audit.distinctKinds < 2) {
    blockers.push({
      code: 'single-method',
      message: 'Only one kind of evidence has been collected. Add a second method (work sample or a differently-run interview) before deciding.',
    });
  }

  const warnings = [];
  if (audit.sameRaterOnly) {
    warnings.push({
      code: 'single-rater',
      message: 'Every rating came from one interviewer. Repeated ratings by the same person are discounted, because they share the same blind spots.',
    });
  }
  const kinds = new Set(signals.map((s) => s.kind));
  if (!kinds.has('structured-interview') && !kinds.has('job-knowledge')) {
    warnings.push({
      code: 'no-structured-evidence',
      message: 'No structured interview or job-knowledge test. Those are the two highest-validity methods in the current meta-analysis; adding one is usually cheaper than running more unstructured rounds.',
    });
  }
  if (!kinds.has('work-sample')) {
    warnings.push({
      code: 'no-work-sample',
      message: 'No work sample. Its validity was revised down in 2022, but it is still the most resistant evidence to affinity bias — worth the extra candidate time for a role you will judge on judgement.',
    });
  }
  if (kinds.size === 1 && kinds.has('unstructured-interview')) {
    warnings.push({
      code: 'unstructured-only',
      message: 'Unstructured interviews only — the weakest evidence in the table. Convert one stage into a structured, scored interview.',
    });
  }
  if (audit.disagreements.length) {
    warnings.push({
      code: 'rater-disagreement',
      message: `${audit.disagreements.length} competency(ies) have ratings that disagree by 3 or more points. Do not average that away: run a work sample or a calibration conversation about the evidence.`,
      competencies: audit.disagreements.map((d) => d.competencyId),
    });
  }
  if (audit.posterior >= 0.75 && audit.totalWeight < MIN_EVIDENCE_WEIGHT * 2) {
    warnings.push({
      code: 'overconfident',
      message: 'The estimate looks strong relative to a thin evidence base. Treat the number as provisional.',
    });
  }

  const posterior = audit.posterior;
  const direction = posterior >= 0.65 ? 'leans-yes' : posterior <= 0.35 ? 'leans-no' : 'unclear';

  return {
    audit,
    coverage,
    flip,
    blockers,
    warnings,
    ready: open && blockers.length === 0,
    direction,
    threshold,
  };
}

/**
 * Process-parity check across the candidates for one role: the same
 * competencies should have been assessed for everyone who reached the same
 * stage. This is the fairness check the app can honestly make without storing
 * any protected attribute.
 */
export function processParity(requisition, candidates = []) {
  const advanced = (candidates || []).filter(
    (c) => c && ['interviewing', 'final', 'offer', 'hired', 'rejected'].includes(c.stage),
  );
  if (advanced.length < 2) {
    return { measured: false, reason: 'Fewer than two candidates reached the interview stage, so there is nothing to compare.', rows: [] };
  }
  const competencyIds = (requisition?.competencies || []).map((c) => c.id);
  const rows = competencyIds.map((competencyId) => {
    const competency = (requisition.competencies || []).find((c) => c.id === competencyId);
    const covered = advanced.filter((c) =>
      (c.signals || []).some((s) => s.competencyId === competencyId),
    );
    return {
      competencyId,
      name: competency?.name || competencyId,
      covered: covered.length,
      total: advanced.length,
      pct: Math.round((covered.length / advanced.length) * 100),
    };
  });
  const uneven = rows.filter((r) => r.pct > 0 && r.pct < 100);
  return {
    measured: true,
    rows,
    uneven,
    candidatesCompared: advanced.length,
  };
}

/* -------------------------------------------------------------------- funnel */

/**
 * Funnel counts, conversion rates, observed cycle time and the cost of the
 * seat staying empty.
 *
 * Cycle time needs at least two completed hires before a median is stated —
 * the same small-sample discipline used by the capacity layer. Below that the
 * app says "not measured yet" rather than extrapolating from one case.
 */
export function funnelStats(requisition, candidates, { now = new Date(), stallDays = 30 } = {}) {
  const todayDay = dayKey(now);
  const list = (candidates || []).filter((c) => c && c.reqId === requisition.id);
  const byStage = Object.fromEntries(CANDIDATE_STAGES.map((stage) => [stage, 0]));
  for (const c of list) {
    if (byStage[c.stage] === undefined) byStage[c.stage] = 0;
    byStage[c.stage] += 1;
  }

  const active = list.filter(isOpenCandidate);
  const reached = {
    screening: list.filter((c) => ['screening', 'interviewing', 'final', 'offer', 'hired', 'rejected'].includes(c.stage)).length,
    interviewing: list.filter((c) => ['interviewing', 'final', 'offer', 'hired', 'rejected'].includes(c.stage)).length,
    offer: list.filter((c) => ['offer', 'hired'].includes(c.stage)).length,
    hired: list.filter((c) => c.stage === 'hired').length,
  };
  const applied = list.length;

  const rate = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);
  const conversions = [
    { key: 'screen', label: 'Sourced → screening', numerator: reached.screening, denominator: applied, rate: rate(reached.screening, applied) },
    { key: 'interview', label: 'Screening → interview', numerator: reached.interviewing, denominator: reached.screening, rate: rate(reached.interviewing, reached.screening) },
    { key: 'offer', label: 'Interview → offer', numerator: reached.offer, denominator: reached.interviewing, rate: rate(reached.offer, reached.interviewing) },
    { key: 'accept', label: 'Offer → accepted', numerator: reached.hired, denominator: reached.offer, rate: rate(reached.hired, reached.offer) },
  ];

  const cycles = list
    .filter((c) => c.stage === 'hired' && c.appliedOn && c.hiredOn)
    .map((c) => ({ candidateId: c.id, days: daysBetween(c.appliedOn, c.hiredOn) }))
    .filter((row) => row.days !== null && row.days >= 0);
  const cycleMedian = cycles.length >= 2 ? median(cycles.map((c) => c.days)) : null;

  const daysOpen = daysBetween(requisition.openedOn, requisition.closedOn || todayDay);
  const targetSlipDays = isActiveRequisition(requisition) && requisition.targetStartOn
    ? daysBetween(requisition.targetStartOn, todayDay)
    : null;

  const activityDays = list
    .map((c) => c.lastActivityOn || c.appliedOn)
    .filter(Boolean)
    .sort();
  const lastActivityOn = activityDays.length ? activityDays[activityDays.length - 1] : null;
  const daysSinceActivity = lastActivityOn ? daysBetween(lastActivityOn, todayDay) : daysOpen;
  const stalled = isActiveRequisition(requisition) && daysSinceActivity !== null && daysSinceActivity >= stallDays;

  const daily = finite(requisition.dailyVacancyCost, 0);
  const vacancyDays = requisition.closedOn
    ? daysBetween(requisition.openedOn, requisition.closedOn)
    : daysOpen;
  const vacancy = daily > 0
    ? {
        measured: true,
        daily,
        days: vacancyDays,
        cost: Math.round(daily * (vacancyDays || 0) * 100) / 100,
        currency: requisition.currency || 'USD',
      }
    : {
        measured: false,
        reason: 'No daily cost of the seat being empty has been recorded, so no exposure is claimed. Record it (for example gross margin per day the seat would generate) to price the delay.',
      };

  return {
    total: list.length,
    applied,
    active: active.length,
    byStage,
    reached,
    conversions,
    cycleMedianDays: cycleMedian,
    cycleObservations: cycles.length,
    cycleReason: cycleMedian === null
      ? `Not measured yet: ${cycles.length} completed hire(s); two are needed before a median means anything.`
      : null,
    daysOpen,
    targetSlipDays,
    lastActivityOn,
    daysSinceActivity,
    stalled,
    stallDays,
    vacancy,
  };
}

/* -------------------------------------------------------- planned effort */

/**
 * A *suggestion* for interviewer effort, shown next to the estimate fields.
 * It is never stored unless the leader submits it: the app has a hard rule
 * against inventing effort estimates.
 */
export function suggestedEffortDays(requisition, candidates, { settings = {}, stagesPerCandidate = 3 } = {}) {
  const active = (candidates || []).filter((c) => c && c.reqId === requisition.id && isOpenCandidate(c)).length;
  if (!active) return { measured: false, reason: 'No active candidates, so there is no interview effort to plan yet.' };
  const hoursPerStage = finite(settings.interviewHoursPerStage, 3);
  const hoursPerWeek = finite(settings.capacityHoursPerWeek, 32);
  const hoursPerDay = Math.max(1, hoursPerWeek / 5);
  const hours = active * stagesPerCandidate * hoursPerStage;
  const mostLikely = Math.round((hours / hoursPerDay) * 10) / 10;
  return {
    measured: true,
    activeCandidates: active,
    stagesPerCandidate,
    hoursPerStage,
    hours,
    mostLikely,
    optimistic: Math.round(mostLikely * 0.6 * 10) / 10,
    pessimistic: Math.round(mostLikely * 1.8 * 10) / 10,
    basis: `${active} active candidate(s) × ${stagesPerCandidate} stages × ${hoursPerStage}h per stage ÷ ${hoursPerDay.toFixed(1)} focused hours per day`,
  };
}

/* --------------------------------------------------------------- summaries */

export function requisitionSummary(requisition, candidates, { now = new Date(), settings = {}, prior = DEFAULT_BASE_RATE } = {}) {
  const list = (candidates || []).filter((c) => c && c.reqId === requisition.id);
  const funnel = funnelStats(requisition, list, { now, stallDays: finite(settings.hiringStallDays, 30) });
  const priorValue = clamp(finite(prior ?? settings.hiringBaseRate ?? DEFAULT_BASE_RATE, DEFAULT_BASE_RATE), ...BASE_RATE_RANGE);
  const assessments = list.map((candidate) => ({
    candidate,
    assessment: assessCandidate(candidate, requisition, { prior: priorValue }),
  }));
  const needDecision = assessments.filter(
    (row) => isOpenCandidate(row.candidate) && ['final', 'offer'].includes(row.candidate.stage),
  );
  const effect = measurableEffort(requisition.effortDays);
  const suggestion = suggestedEffortDays(requisition, list, { settings });
  const parity = processParity(requisition, list);
  return {
    requisition,
    candidates: list,
    funnel,
    assessments,
    needDecision,
    effort: effect,
    effortSuggested: suggestion,
    parity,
    active: isActiveRequisition(requisition),
  };
}

/** Workspace-level roll-up for the hiring index and the Today queue. */
export function hiringSummary(state, { now = new Date(), settings = state.settings || {} } = {}) {
  const reqs = state.requisitions || [];
  const candidates = state.candidates || [];
  const prior = clamp(finite(settings.hiringBaseRate, DEFAULT_BASE_RATE), ...BASE_RATE_RANGE);
  // Index candidates by role once. Filtering the full candidate list inside
  // every per-requisition summary is O(roles × candidates): invisible on the
  // demo workspace, 1.5M comparisons at 300 roles × 5,000 candidates, and it
  // runs on every render of the index and the insights panel.
  const byReq = new Map();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const bucket = byReq.get(candidate.reqId);
    if (bucket) bucket.push(candidate);
    else byReq.set(candidate.reqId, [candidate]);
  }
  const summaries = reqs.map((r) => requisitionSummary(r, byReq.get(r.id) || [], { now, settings, prior }));
  const active = summaries.filter((s) => s.active);
  const stalled = active.filter((s) => s.funnel.stalled);
  const needsDecision = summaries.flatMap((s) =>
    s.needDecision.map((row) => ({ requisition: s.requisition, candidate: row.candidate, assessment: row.assessment })),
  );
  const vacancyBuckets = new Map();
  for (const summary of active) {
    const vacancy = summary.funnel.vacancy;
    if (vacancy.measured) vacancyBuckets.set(vacancy.currency, (vacancyBuckets.get(vacancy.currency) || 0) + vacancy.cost);
  }
  const vacancyByCurrency = [...vacancyBuckets].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
  const vacancyMixedCurrencies = vacancyByCurrency.length > 1;
  const vacancyExposure = vacancyMixedCurrencies ? null : (vacancyByCurrency[0]?.amount ?? 0);
  const vacancyCurrency = vacancyMixedCurrencies ? null : (vacancyByCurrency[0]?.currency || 'USD');
  const plannedDays = active.reduce(
    (sum, s) => sum + (s.effort ? s.effort.mostLikely : 0),
    0,
  );
  return {
    summaries,
    active,
    stalled,
    needsDecision,
    openCandidates: candidates.filter(isOpenCandidate).length,
    hired: candidates.filter((c) => c.stage === 'hired').length,
    vacancyExposure,
    vacancyCurrency,
    vacancyByCurrency,
    vacancyMixedCurrencies,
    vacancyMeasured: active.some((s) => s.funnel.vacancy.measured),
    plannedInterviewDays: Math.round(plannedDays * 10) / 10,
    unmeasuredEffort: active.filter((s) => !s.effort).map((s) => s.requisition),
    retention: retentionReview(state, { now, settings }),
  };
}

/* ------------------------------------------------------- data minimisation */

/**
 * Data-minimisation review for candidate records.
 *
 * Candidate records are the most sensitive and least durable thing this
 * workspace holds. Once a role is closed, or a candidate has a final decision
 * and has been out of contact for a while, keeping the record has a real
 * privacy cost and almost no decision value. This function *reports*; it never
 * deletes. Automatic erasure in a local tool that also keeps the audit trail
 * could destroy the rationale behind a decision that is being questioned — the
 * leader is the right person to decide, and the app's job is to make sure the
 * question gets asked.
 *
 * Rules, in order:
 *   - `candidateRetentionDays: 0` disables the review entirely (reported as
 *     disabled, not as "nothing due", so the UI can say which it is).
 *   - A candidate still in play on an open role is never due: their record is
 *     the working file for a live decision.
 *   - A record marked `keepInTouch` is exempt by explicit choice, and counted
 *     separately so the exemption is visible rather than silently applied.
 *   - Otherwise the clock runs from the most recent recorded fact about the
 *     candidate (decision date, hire date, offer, or last activity). A record
 *     with no dates at all is not due — an absent date is unknown age, and
 *     guessing an age is how a reminder becomes a false accusation.
 */
export function retentionReview(state, { now = new Date(), settings = state.settings || {} } = {}) {
  const configured = finite(settings.candidateRetentionDays, 180);
  const windowDays = configured <= 0 ? 0 : Math.round(configured);
  const reqById = new Map((state.requisitions || []).map((r) => [r.id, r]));
  const today = dayKey(now);

  if (!windowDays) {
    return {
      enabled: false,
      windowDays: 0,
      due: [],
      exempt: [],
      count: 0,
      settledCount: 0,
      reason: 'Retention review is switched off (0 days). Candidate records are kept until you delete them.',
    };
  }

  const due = [];
  const exempt = [];
  let settledCount = 0;

  for (const candidate of state.candidates || []) {
    if (!candidate) continue;
    const requisition = reqById.get(candidate.reqId) || null;
    const settled = !isOpenCandidate(candidate);
    const roleClosed = !requisition || !isActiveRequisition(requisition);
    if (!settled && !roleClosed) continue; // live decision on an open role
    if (settled) settledCount += 1;

    const anchors = [
      candidate.decision?.decidedOn,
      candidate.hiredOn,
      candidate.offerAcceptedOn,
      candidate.offerOn,
      candidate.lastActivityOn,
      candidate.appliedOn,
    ].filter(Boolean);
    if (!anchors.length) continue;
    const anchorOn = anchors.sort().at(-1);
    const ageDays = daysBetween(anchorOn, today);
    if (ageDays === null || ageDays < windowDays) continue;

    const row = {
      candidate,
      requisition,
      ageDays,
      anchorOn,
      roleClosed,
      settled,
      windowDays,
    };

    if (candidate.keepInTouch) {
      exempt.push({ ...row, reason: 'Marked “keep in touch”, so it is retained on purpose.' });
    } else {
      due.push({
        ...row,
        reason: roleClosed
          ? `The role is closed and nothing has been recorded about this candidate for ${ageDays} days.`
          : `No decision activity for ${ageDays} days on a candidate whose process has ended.`,
      });
    }
  }

  due.sort((a, b) => b.ageDays - a.ageDays);

  return {
    enabled: true,
    windowDays,
    due,
    exempt,
    count: due.length,
    settledCount,
    oldestDays: due.length ? due[0].ageDays : 0,
    reason: due.length
      ? `${due.length} candidate record(s) have outlived the ${windowDays}-day window. Nothing is deleted automatically — review each one and remove the ones you no longer need.`
      : `No candidate records are past the ${windowDays}-day window.`,
  };
}

/* ---------------------------------------------------------------- risk scan */

/**
 * Pure detector for auto-escalation: a requisition that is still open, has not
 * moved in `stallDays`, and has not already been escalated by this rule.
 * The caller materialises the case through the existing escalation machinery,
 * so a stalled hire fans out into FMEA, PERT financial exposure, stakeholders,
 * a DACI decision and a delegation exactly like every other operational case.
 */
export function stalledRequisitions(state, { now = new Date(), settings = state.settings || {} } = {}) {
  const stallDays = finite(settings.hiringStallDays, 30);
  const candidates = state.candidates || [];
  return (state.requisitions || []).filter((req) => {
    if (!isActiveRequisition(req)) return false;
    if (req.autoEscalated) return false;
    const funnel = funnelStats(req, candidates, { now, stallDays });
    return funnel.stalled;
  });
}
