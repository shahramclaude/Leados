/**
 * app/core/domain/sceptic.js — the Cross-Examination Terminal read model
 * (Schema v81, ADR-0074).
 *
 * This module is a PURE READ MODEL plus two deliberate writers: one frozen round
 * and the human verdict ledger it is graded against. It invents nothing: every
 * claim is a sentence another module already stores, every contradiction is
 * performed by comparing two of those records, and every error rate is measured
 * from verdicts the leader themselves recorded.
 *
 *   claims     six families of assertion, harvested by twelve structural
 *              detectors over records the workspace already holds
 *   verdicts   refuted / held / dismissed — a human act, with a required reason
 *   families   Beta–binomial contradiction rate per family with a Jeffreys prior
 *              and a credible interval, refused below the declared floor
 *   auditor    the terminal's own hit rate, false-alarm rate and dismissal rate,
 *              because an audit that cannot lose is not an audit
 *   coverage   discovery sampling: what a population of N and k examinations can
 *              actually support (rule of three), and what would support more
 *   exposure   stake-weighted expected wrong claims — in declared units, never
 *              dressed as money
 *   freeze     one prospective audit, graded once, afterwards, by Brier and log
 *              loss against the terminal's own base rate
 *
 * Refusals are part of the design: a family below its scored floor has no rate,
 * a finding in such a family has no probability, a round containing one cannot be
 * frozen, a dismissal is never scored as evidence about the claim, and a claim
 * whose counter-evidence merely disappeared is marked lapsed rather than
 * counted as a win.
 */

import {
  CLAIM_FAMILIES,
  CLAIM_FAMILY_KEYS,
  FAMILY_VERDICT_LABELS,
  FAMILY_VERDICT_TEXT,
  FAMILY_VERDICTS,
  SCEPTIC_CONVENTIONS_NOTE,
  SCEPTIC_DETECTORS,
  SCEPTIC_ENGINE_VERSION,
  SCEPTIC_LIMITS,
  SCEPTIC_SIGNAL_IDS,
  SCORED_DISPOSITIONS,
  claimFamily,
  scepticDetector,
} from './scepticRegistry.js';
import { normalizeScepticSettings } from './scepticSchema.js';
import { addDays, dayKey, daysBetween } from '../time.js';

const REPORT_CACHE = new WeakMap();

function round(n, dp = 2) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
}

function text(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function dayOf(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function todayOf(now) {
  return dayKey(now) || new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* 1. Small numerical library (no dependencies, pinned by tests)       */
/* ------------------------------------------------------------------ */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Stirling/Lanczos log-gamma. Correct to ~1e-13 over the range used here. */
export function logGamma(z) {
  if (!Number.isFinite(z)) return NaN;
  if (z < 0.5) {
    // Reflection formula: Γ(z)Γ(1−z) = π / sin(πz)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const x = z - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (x + i + 1);
  const t = x + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the regularized incomplete beta (Lentz). */
function betaContinuedFraction(a, b, x) {
  const TINY = 1e-30;
  const EPS = 1e-14;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) — the Beta CDF. */
export function betaIncomplete(x, a, b) {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Beta quantile by bisection on a monotone CDF. Deterministic and testable. */
export function betaQuantile(p, a, b) {
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const cdf = betaIncomplete(mid, a, b);
    if (cdf < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

export const betaMean = (a, b) => a / (a + b);

/** Jeffreys Beta(½, ½) posterior over a contradiction rate. */
export function jeffreysPosterior(refuted, held) {
  const a = 0.5 + Math.max(0, refuted || 0);
  const b = 0.5 + Math.max(0, held || 0);
  return { a, b, mean: betaMean(a, b) };
}

/**
 * A 90% equal-tailed credible interval. Bisection on the CDF rather than a
 * lookup, so a family with three scored claims gets the wide interval it has
 * earned rather than a symmetric one it has not.
 */
export function betaInterval(refuted, held, level = 0.9) {
  const { a, b } = jeffreysPosterior(refuted, held);
  const tail = (1 - level) / 2;
  return {
    lo: betaQuantile(tail, a, b),
    hi: betaQuantile(1 - tail, a, b),
  };
}

/** Wilson score interval for a proportion (used for the terminal's own rates). */
export function wilsonInterval(successes, n, z = 1.959963984540054) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    pct: round(p * 100, 1),
    loPct: round(Math.max(0, centre - half) * 100, 1),
    hiPct: round(Math.min(1, centre + half) * 100, 1),
  };
}

/**
 * Discovery sampling, exact: with k examinations and zero contradictions, the
 * (1 − α) upper confidence bound on the population contradiction rate is
 * 1 − α^(1/k). With k = 0 the bound is 1 — the honest statement that nothing has
 * been learned. (The familiar "rule of three" is the 95% large-k approximation.)
 */
export function ruleOfThreeUpper(k, alpha = 0.05) {
  if (!Number.isFinite(k) || k <= 0) return 1;
  return 1 - alpha ** (1 / k);
}

/** Examinations needed to bound a rate below `rate` at (1 − α) with zero hits. */
export function sampleSizeFor(rate, alpha = 0.05) {
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return null;
  return Math.ceil(Math.log(alpha) / Math.log(1 - rate));
}

/** Brier score over [{p, y}] with p on [0, 1]. Lower is better; 0 is perfect. */
export function brierScore(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  let sum = 0;
  for (const pair of pairs) sum += (pair.p - pair.y) ** 2;
  return round(sum / pairs.length, 4);
}

/** Logarithmic loss, clamped at 1/200 so a certain forecast is charged, not infinite. */
export function logScore(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  let sum = 0;
  for (const pair of pairs) {
    const p = Math.min(0.995, Math.max(0.005, pair.p));
    sum += pair.y === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return round(sum / pairs.length, 4);
}

/* ------------------------------------------------------------------ */
/* 2. Conventions and the link index                                  */
/* ------------------------------------------------------------------ */

export function scepticConventions(settings) {
  return normalizeScepticSettings(settings);
}

function linkIndex(state) {
  const out = new Map();
  for (const link of asArray(state.links)) {
    if (!link.sourceId) continue;
    const key = `${link.sourceType}|${link.sourceId}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(link);
  }
  return out;
}

function linksFrom(index, sourceType, sourceId) {
  return index.get(`${sourceType}|${sourceId}`) || [];
}

const CADENCE_DAYS = Object.freeze({ immediate: 3, weekly: 7, digest: 14, milestone: 30 });

const COMPLETED_GOAL_STATES = Object.freeze(['done', 'complete', 'completed']);
const CLOSED_CHANGE_STATES = Object.freeze(['closed', 'complete', 'completed', 'done', 'abandoned']);

/* ------------------------------------------------------------------ */
/* 3. The twelve detectors                                            */
/* ------------------------------------------------------------------ */

/**
 * Every detector returns `checked` — the number of records whose claim it
 * actually examined — and the claims it found contradicted. `checked` is the
 * population the sampling bound is computed over, so a detector that silently
 * skipped records would overstate the record's coverage. That is why it is
 * returned rather than recounted by the caller.
 */
const DETECTORS = {
  'SCP-CM-01'(state) {
    const goals = asArray(state.goals).filter((g) => COMPLETED_GOAL_STATES.includes(g.status));
    const claims = [];
    for (const goal of goals) {
      if (asArray(goal.checkins).length === 0) {
        claims.push({
          nodeType: 'goal',
          nodeId: goal.id,
          label: text(goal.title),
          assertedOn: dayOf(goal.completedOn) || dayOf(goal.updatedAt) || dayOf(goal.dueDate),
          detail: `The goal is recorded as ${goal.status}${goal.completedOn ? ` on ${dayOf(goal.completedOn)}` : ''} with ${asArray(goal.keyResults).length} key result(s) and no check-in.`,
        });
      }
    }
    return { checked: goals.length, claims };
  },

  'SCP-CM-02'(state) {
    const index = linkIndex(state);
    const byId = new Map(asArray(state.delegations).map((d) => [d.id, d]));
    const cases = asArray(state.cases);
    const claims = [];
    let checked = 0;
    for (const record of cases) {
      const mitigations = linksFrom(index, 'case', record.id)
        .filter((link) => link.relation === 'mitigates' && link.targetType === 'delegation')
        .map((link) => byId.get(link.targetId))
        .filter(Boolean);
      if (record.status !== 'resolved' || !mitigations.length) continue;
      checked += 1;
      const open = mitigations.filter((d) => d.status === 'active' || d.status === 'open');
      if (open.length) {
        claims.push({
          nodeType: 'case',
          nodeId: record.id,
          label: text(record.title),
          assertedOn: dayOf(record.resolvedOn) || dayOf(record.updatedAt),
          evidenceNodeType: 'delegation',
          evidenceNodeId: open[0].id,
          detail: `The case is resolved while ${open.length} mitigation delegation(s) remain open — the first is “${text(open[0].title, 80)}”, due ${dayOf(open[0].dueOn) || 'with no date'}.`,
        });
      }
    }
    return { checked, claims };
  },

  'SCP-CM-03'(state) {
    const changes = asArray(state.changes).filter((c) => CLOSED_CHANGE_STATES.includes(c.status));
    const claims = [];
    for (const record of changes) {
      if (!text(record.closedReason, 400)) {
        claims.push({
          nodeType: 'change',
          nodeId: record.id,
          label: text(record.title),
          assertedOn: dayOf(record.reviewOn) || dayOf(record.updatedAt),
          detail: `The change is recorded as ${record.status} with an empty closing reason and a review date of ${dayOf(record.reviewOn) || 'none'}.`,
        });
      }
    }
    return { checked: changes.length, claims };
  },

  'SCP-AS-01'(state) {
    const reviews = asArray(state.reviews).filter((r) => r.status === 'complete');
    const claims = [];
    for (const record of reviews) {
      const rating = record.manager && record.manager.rating;
      if (rating && asArray(record.evidence).length === 0) {
        claims.push({
          nodeType: 'review',
          nodeId: record.id,
          label: `Review period ${dayOf(record.periodStart) || '—'} → ${dayOf(record.periodEnd) || '—'}`,
          assertedOn: dayOf(record.completedAt) || dayOf(record.periodEnd),
          detail: `The review carries the band “${text(rating, 40)}” and an empty evidence list.`,
        });
      }
    }
    return { checked: reviews.length, claims };
  },

  'SCP-AS-02'(state) {
    const reviews = asArray(state.reviews).filter((r) => r.status === 'complete' && r.manager && r.manager.rating);
    const claims = [];
    for (const record of reviews) {
      if (!record.selfReflectionRecordedAt) {
        claims.push({
          nodeType: 'review',
          nodeId: record.id,
          label: `Review period ${dayOf(record.periodStart) || '—'} → ${dayOf(record.periodEnd) || '—'}`,
          assertedOn: dayOf(record.completedAt) || dayOf(record.periodEnd),
          detail: `The band “${text(record.manager.rating, 40)}” was recorded and the person’s own reflection was never captured.`,
        });
      }
    }
    return { checked: reviews.length, claims };
  },

  'SCP-PR-01'(state, now, conventions) {
    const today = todayOf(now);
    const goals = asArray(state.goals).filter((g) => g.status === 'active' && g.confidence === 'on-track');
    const claims = [];
    for (const goal of goals) {
      const due = dayOf(goal.dueDate);
      const started = dayOf(goal.createdAt) || dayOf(goal.krUpdatedOn);
      if (!due || !started) continue;
      const total = daysBetween(started, due);
      const elapsed = daysBetween(started, today);
      if (!Number.isFinite(total) || total <= 0 || elapsed === null) continue;
      const expected = Math.min(1, Math.max(0, elapsed / total));
      if (expected < 0.15) continue;
      const gaps = [];
      for (const kr of asArray(goal.keyResults)) {
        const start = Number(kr.start);
        const target = Number(kr.target);
        const current = Number(kr.current);
        if (![start, target, current].every(Number.isFinite) || target === start) continue;
        const actual = (current - start) / (target - start);
        gaps.push(expected - Math.min(1.5, Math.max(-0.5, actual)));
      }
      if (!gaps.length) continue;
      const gapPct = round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 100, 1);
      if (gapPct >= conventions._minPaceGap) {
        claims.push({
          nodeType: 'goal',
          nodeId: goal.id,
          label: text(goal.title),
          assertedOn: today,
          dueOn: due,
          detail: `Marked on-track while its key results sit ${gapPct} percentage points behind the straight-line pace its own start, target and ${due} due date imply (${round(expected * 100, 0)}% of the window has elapsed).`,
        });
      }
    }
    return { checked: goals.length, claims };
  },

  'SCP-PR-02'(state, now) {
    const today = todayOf(now);
    const decisions = asArray(state.decisions).filter((d) => Number.isFinite(Number(d.forecastProbability)));
    const claims = [];
    for (const record of decisions) {
      const reviewOn = dayOf(record.reviewOn);
      if (!reviewOn || reviewOn >= today) continue;
      if (record.reviewedOn || (record.outcome && record.outcome !== 'pending')) continue;
      claims.push({
        nodeType: 'decision',
        nodeId: record.id,
        label: text(record.title),
        assertedOn: dayOf(record.date),
        dueOn: reviewOn,
        detail: `A stated probability of ${round(Number(record.forecastProbability), 1)}% was reviewed on ${reviewOn} and no outcome was recorded.`,
      });
    }
    return { checked: decisions.length, claims };
  },

  'SCP-PR-03'(state, now) {
    const today = todayOf(now);
    const premises = asArray(state.premises).filter((p) => p.humanDisposition !== 'retired');
    const claims = [];
    for (const record of premises) {
      const reviewBy = dayOf(record.reviewBy);
      if (!reviewBy || reviewBy >= today) continue;
      const observed = asArray(record.observations)
        .some((observation) => (dayOf(observation.observedOn) || '') >= reviewBy);
      if (observed || record.lastReviewedOn) continue;
      claims.push({
        nodeType: 'premise',
        nodeId: record.id,
        label: text(record.title),
        assertedOn: reviewBy,
        dueOn: reviewBy,
        detail: `${text(record.criticality, 30) || 'unspecified'} criticality, prior ${Number(record.priorPct) || 0}%, review date ${reviewBy} passed with no observation since.`,
      });
    }
    return { checked: premises.length, claims };
  },

  'SCP-DG-01'(state) {
    const retros = asArray(state.retros).filter((r) => r.status === 'held');
    const claims = [];
    for (const record of retros) {
      if (text(record.cause, 40).length < 20) continue;
      const applied = asArray(record.lessons).filter((lesson) => lesson.state === 'applied');
      if (!applied.length) {
        claims.push({
          nodeType: 'case',
          nodeId: record.subjectId || record.id,
          label: text(record.subjectLabel || record.id),
          assertedOn: dayOf(record.heldOn) || dayOf(record.outcomeOn),
          detail: `The after-action review names a cause in ${text(record.cause, 40).length} characters and no lesson has reached the applied state.`,
        });
      }
    }
    return { checked: retros.length, claims };
  },

  'SCP-DG-02'(state) {
    const cases = asArray(state.cases).filter((c) => c.status === 'resolved');
    const claims = [];
    for (const record of cases) {
      const fmea = record.fmea;
      const rated = fmea && [fmea.severity, fmea.probability, fmea.detectability].every((v) => Number.isFinite(Number(v)) && Number(v) > 0);
      if (!rated) continue;
      if (fmea.residualSeverity === null || fmea.residualSeverity === undefined) {
        claims.push({
          nodeType: 'case',
          nodeId: record.id,
          label: text(record.title),
          assertedOn: dayOf(record.resolvedOn) || dayOf(record.updatedAt),
          detail: `Rated S${fmea.severity}/P${fmea.probability}/D${fmea.detectability} at opening and closed with no residual rating.`,
        });
      }
    }
    return { checked: cases.length, claims };
  },

  'SCP-AL-01'(state, now) {
    const today = todayOf(now);
    const stakeholders = asArray(state.stakeholders).filter((s) => ['champion', 'supportive'].includes(s.stance));
    const claims = [];
    for (const record of stakeholders) {
      const cadence = CADENCE_DAYS[record.commsCadence] ?? null;
      if (!cadence) continue;
      const last = dayOf(record.lastContactOn);
      const since = last ? daysBetween(last, today) : null;
      const bar = cadence * 2;
      if (since === null || since > bar) {
        claims.push({
          nodeType: 'stakeholder',
          nodeId: record.id,
          label: text(record.name),
          assertedOn: last || dayOf(record.nextContactOn),
          dueOn: dayOf(record.nextContactOn),
          detail: `Stance “${record.stance}” with a ${record.commsCadence} cadence; last contact ${last || 'never recorded'}${since === null ? '' : ` — ${since} days ago against a ${bar}-day bar`}.`,
        });
      }
    }
    return { checked: stakeholders.length, claims };
  },

  'SCP-CP-01'(state, now, conventions) {
    const today = todayOf(now);
    const horizon = dayKey(addDays(now, 7));
    const delegations = asArray(state.delegations);
    const open = delegations.filter((d) => d.status === 'active' || d.status === 'open');
    // The measured settlement rate: completions per week over the declared window.
    const windowStart = dayKey(addDays(now, -conventions.scepticWindowDays));
    const completed = delegations.filter((d) => {
      const done = dayOf(d.completedOn) || dayOf(d.returnedOn);
      return done && done >= windowStart && done <= today;
    });
    const weeks = conventions.scepticWindowDays / 7;
    const perWeek = weeks > 0 ? completed.length / weeks : 0;
    const dueNextWeek = open.filter((d) => {
      const due = dayOf(d.dueOn);
      return due && due >= today && due <= horizon;
    });
    // A rate of zero measures nothing; the capacity claim cannot be refuted by a
    // record that has never settled anything, and pretending otherwise would
    // manufacture a finding on day one.
    if (perWeek <= 0) return { checked: 0, claims: [] };
    const claims = [];
    if (dueNextWeek.length >= 3 && dueNextWeek.length > perWeek) {
      const worst = dueNextWeek.slice().sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1))[0];
      claims.push({
        nodeType: 'delegation',
        nodeId: worst.id,
        label: text(worst.title),
        assertedOn: today,
        dueOn: dayOf(worst.dueOn),
        detail: `${dueNextWeek.length} open delegation(s) fall due inside seven days against a measured settlement rate of ${round(perWeek, 2)} per week over ${conventions.scepticWindowDays} days (${completed.length} closed).`,
      });
    }
    return { checked: open.length, claims };
  },
};

/**
 * Harvest every claim the record makes. `checked` counts the records whose claim
 * was actually examined; `claims` counts the ones the record contradicts. The
 * difference is the thing this whole module is about.
 */
export function extractClaims(state, now = new Date(), settings = null) {
  const conventions = { ...scepticConventions(settings), _minPaceGap: SCEPTIC_LIMITS.minPaceGapPct };
  const source = state && typeof state === 'object' ? state : {};
  const byFamily = new Map(CLAIM_FAMILY_KEYS.map((key) => [key, { checked: 0, findings: 0 }]));
  const byDetector = SCEPTIC_DETECTORS.map((detector) => ({ id: detector.id, checked: 0, findings: 0 }));
  const detectorIndex = new Map(byDetector.map((row) => [row.id, row]));
  const claims = [];

  for (const detector of SCEPTIC_DETECTORS) {
    const run = DETECTORS[detector.id];
    if (typeof run !== 'function') continue;
    let result;
    try {
      result = run(source, now, conventions) || { checked: 0, claims: [] };
    } catch (error) {
      // A detector that throws has examined nothing. It must never be counted as
      // coverage, and one broken detector must not take the screen down.
      result = { checked: 0, claims: [], error: String(error && error.message ? error.message : error) };
    }
    const familyRow = byFamily.get(detector.family);
    const detectorRow = detectorIndex.get(detector.id);
    const checked = Number.isFinite(result.checked) ? Math.max(0, Math.round(result.checked)) : 0;
    if (familyRow) familyRow.checked += checked;
    if (detectorRow) {
      detectorRow.checked = checked;
      detectorRow.error = result.error || '';
    }
    for (const claim of result.claims || []) {
      if (!claim || !claim.nodeId) continue;
      const key = `${detector.id}|${claim.nodeType}|${claim.nodeId}`;
      if (claims.some((row) => row.key === key)) continue;
      claims.push({
        key,
        detectorId: detector.id,
        family: detector.family,
        nodeType: claim.nodeType,
        nodeId: claim.nodeId,
        label: claim.label || '',
        assertedOn: claim.assertedOn || null,
        dueOn: claim.dueOn || null,
        detail: claim.detail || '',
        evidenceNodeType: claim.evidenceNodeType || '',
        evidenceNodeId: claim.evidenceNodeId || '',
        stake: detector.stake,
        refuter: detector.refuter,
        detectorLabel: detector.label,
        route: detector.route,
      });
      if (familyRow) familyRow.findings += 1;
      if (detectorRow) detectorRow.findings += 1;
    }
  }

  return {
    claims,
    population: byDetector.reduce((sum, row) => sum + row.checked, 0),
    byFamily: CLAIM_FAMILIES.map((family) => ({
      key: family.key,
      label: family.label,
      checked: byFamily.get(family.key).checked,
      findings: byFamily.get(family.key).findings,
    })),
    byDetector,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Families — the measured contradiction rate                      */
/* ------------------------------------------------------------------ */

/**
 * A family's rate is computed over EVERY disposition ever recorded, not only the
 * ones whose claim is still on file. That distinction is the whole point: a
 * refuted claim usually gets fixed, and a rate computed over surviving claims
 * would report that a family improves as its bad claims are repaired. This is
 * survivorship bias (Wald 1943) and the terminal refuses to commit it.
 */
export function familyRates(state, settings = null) {
  const conventions = scepticConventions(settings);
  const dispositions = asArray(state.scepticDispositions);
  const rows = [];
  for (const family of CLAIM_FAMILIES) {
    const mine = dispositions.filter((row) => row.family === family.key);
    const refuted = mine.filter((row) => row.verdict === 'refuted').length;
    const held = mine.filter((row) => row.verdict === 'held').length;
    const dismissed = mine.filter((row) => row.verdict === 'dismissed').length;
    const scored = refuted + held;
    const interval = scored > 0 ? betaInterval(refuted, held) : null;
    const posterior = jeffreysPosterior(refuted, held);
    let verdict = 'unmeasured';
    if (scored >= conventions.scepticMinScored) {
      const tolerance = conventions.scepticTolerancePct / 100;
      if (interval.lo > tolerance) verdict = 'doubted';
      else if (posterior.mean > tolerance) verdict = 'watch';
      else verdict = 'sound';
    }
    rows.push({
      key: family.key,
      label: family.label,
      claim: family.claim,
      unit: family.unit,
      question: family.question,
      stakes: family.stakes,
      refuted,
      held,
      dismissed,
      scored,
      errorMeanPct: scored > 0 ? round(posterior.mean * 100, 1) : null,
      errorLoPct: interval ? round(interval.lo * 100, 1) : null,
      errorHiPct: interval ? round(interval.hi * 100, 1) : null,
      verdict,
      verdictLabel: FAMILY_VERDICT_LABELS[verdict],
      verdictText: FAMILY_VERDICT_TEXT[verdict],
      minScored: conventions.scepticMinScored,
      needs: Math.max(0, conventions.scepticMinScored - scored),
      tolerancePct: conventions.scepticTolerancePct,
      exceedsTolerance: verdict === 'doubted' || verdict === 'watch',
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* 5. Coverage — what the examination actually supports               */
/* ------------------------------------------------------------------ */

/**
 * The upper confidence bound on this terminal's *false-alarm rate*, given h held
 * verdicts in k examinations. This is the Clopper–Pearson upper limit,
 * Beta(1 − α; h + 1, k − h), which is the exact form of the rule of three: at
 * h = 0, k = 9 it reads 1 − 0.05^(1/9) = 28.3%. With nothing examined it is 1 —
 * the honest statement that a population nobody has looked at supports nothing.
 */
export function falseAlarmUpper(held, examined, alpha = 0.05) {
  if (!Number.isFinite(examined) || examined <= 0) return 1;
  const successes = Math.max(0, Number.isFinite(held) ? held : 0);
  const failures = examined - successes;
  if (failures <= 0) return 1;
  return betaQuantile(1 - alpha, successes + 1, failures);
}

export function coverageOf(findingCount, examined, held = 0, alpha = 0.05) {
  return {
    findings: findingCount,
    examined,
    held,
    unexamined: Math.max(0, findingCount - examined),
    shareExaminedPct: findingCount > 0 ? round((examined / findingCount) * 100, 1) : null,
    falseAlarmUpperPct: round(falseAlarmUpper(held, examined, alpha) * 100, 1),
    upperBoundPct: round(ruleOfThreeUpper(examined, alpha) * 100, 1),
    neededFor10: sampleSizeFor(0.1, alpha),
    neededFor25: sampleSizeFor(0.25, alpha),
    alpha,
  };
}

/* ------------------------------------------------------------------ */
/* 6. The report                                                      */
/* ------------------------------------------------------------------ */

const DISPOSITION_RANK = { refuted: 4, held: 3, dismissed: 2, lapsed: 1 };

/** The latest verdict per claim key. A verdict is never rewritten, only added. */
export function dispositionIndex(state) {
  const index = new Map();
  for (const row of asArray(state.scepticDispositions)) {
    const prior = index.get(row.claimKey);
    if (!prior || (row.at || '') >= (prior.at || '')) index.set(row.claimKey, row);
  }
  return index;
}

export function scepticReport(state, now = new Date(), settings = null) {
  const conventions = scepticConventions(settings || (state && state.settings));
  const source = state && typeof state === 'object' ? state : {};
  const extraction = extractClaims(source, now, conventions);
  const families = familyRates(source, conventions);
  const familyIndex = new Map(families.map((row) => [row.key, row]));
  const verdicts = dispositionIndex(source);

  const findings = extraction.claims.map((claim) => {
    const family = familyIndex.get(claim.family);
    const measured = family && family.verdict !== 'unmeasured';
    const probabilityPct = measured ? family.errorMeanPct : null;
    const disposition = verdicts.get(claim.key) || null;
    const expectedWrong = probabilityPct === null ? null : round((probabilityPct / 100) * claim.stake, 2);
    return {
      ...claim,
      familyLabel: family ? family.label : claim.family,
      familyVerdict: family ? family.verdict : 'unmeasured',
      probabilityPct,
      expectedWrong,
      disposition,
      state: disposition ? disposition.verdict : 'open',
      stateLabel: disposition ? disposition.verdict : 'Unexamined',
      evidence: claim.evidenceNodeId
        ? [{ nodeType: claim.evidenceNodeType, nodeId: claim.evidenceNodeId }]
        : [],
    };
  });

  // One claim per detector per family in the ranking would be noise; the queue is
  // ranked by what settling the claim is worth, and the cap is printed.
  const ranked = findings
    .slice()
    .sort((a, b) => {
      const ea = a.expectedWrong === null ? -1 : a.expectedWrong;
      const eb = b.expectedWrong === null ? -1 : b.expectedWrong;
      if (eb !== ea) return eb - ea;
      if (b.stake !== a.stake) return b.stake - a.stake;
      return (a.dueOn || '9999') < (b.dueOn || '9999') ? -1 : 1;
    });

  const openFindings = findings.filter((row) => row.state === 'open');
  const examined = findings.filter((row) => row.state !== 'open').length;

  const dispositions = asArray(source.scepticDispositions);
  const refuted = dispositions.filter((row) => row.verdict === 'refuted').length;
  const held = dispositions.filter((row) => row.verdict === 'held').length;
  const dismissed = dispositions.filter((row) => row.verdict === 'dismissed').length;
  const scored = refuted + held;
  const precision = scored > 0 ? wilsonInterval(refuted, scored) : null;
  const dismissalRate = dispositions.length > 0 ? dismissed / dispositions.length : null;
  const auditor = {
    raised: dispositions.length,
    refuted,
    held,
    dismissed,
    scored,
    precision,
    dismissalPct: dismissalRate === null ? null : round(dismissalRate * 100, 1),
    dismissalCapPct: conventions.scepticDismissalCapPct,
    dismissalBreached: dismissalRate !== null && dismissalRate * 100 > conventions.scepticDismissalCapPct,
    // A terminal that has never been scored has no precision. It does not have
    // 0% precision and it does not have 100% precision.
    verdict: scored < conventions.scepticMinScored
      ? 'unmeasured'
      : (precision && precision.loPct >= 50 ? 'credible' : 'suspect'),
  };

  const coverage = coverageOf(findings.length, examined, held);

  const measured = findings.filter((row) => row.probabilityPct !== null);
  const expectedWrong = measured.length
    ? round(measured.reduce((sum, row) => sum + (row.expectedWrong || 0), 0), 2)
    : null;

  const rounds = asArray(source.scepticRounds).map((record) => {
    const reviewOn = dayOf(record.reviewOn);
    const gradeable = Boolean(reviewOn && reviewOn < todayOf(now) && !record.graded);
    return {
      ...record,
      gradeable,
      live: !record.graded && !gradeable,
      claimCount: asArray(record.claims).length,
      gradedLabel: record.graded
        ? `Graded ${record.graded.scored} of ${record.graded.considered} · Brier ${record.graded.brier}`
        : gradeable
          ? 'Due for grading'
          : `Frozen for ${record.reviewOn}`,
    };
  });

  const counts = {
    population: extraction.population,
    findings: findings.length,
    open: openFindings.length,
    examined,
    refuted,
    held,
    dismissed,
    measured: measured.length,
    unmeasured: findings.length - measured.length,
    doubtedFamilies: families.filter((row) => row.verdict === 'doubted').length,
    watchFamilies: families.filter((row) => row.verdict === 'watch').length,
    unmeasuredFamilies: families.filter((row) => row.verdict === 'unmeasured').length,
    rounds: rounds.length,
    ungraded: rounds.filter((row) => row.gradeable).length,
  };

  const report = {
    engine: SCEPTIC_ENGINE_VERSION,
    today: todayOf(now),
    conventions,
    population: {
      total: extraction.population,
      byFamily: extraction.byFamily,
      byDetector: extraction.byDetector,
    },
    families,
    findings,
    ranked,
    queue: ranked.filter((row) => row.state === 'open').slice(0, SCEPTIC_LIMITS.maxFindings),
    coverage,
    auditor,
    exposure: {
      expectedWrong,
      measuredClaims: measured.length,
      unmeasuredClaims: findings.length - measured.length,
      note: expectedWrong === null
        ? 'No family has enough scored claims for a probability, so no expected-wrong figure is quoted. A number here would be a guess with a decimal point.'
        : 'Expected wrong claims, stake-weighted, in declared units. This is not money: no record in this workspace prices a wrong claim, and the terminal will not invent an exchange rate between credibility and currency.',
    },
    rounds,
    counts,
    // The list of what could not be priced, said out loud.
    refusals: {
      families: families.filter((row) => row.verdict === 'unmeasured').map((row) => row.key),
      unpriced: findings.filter((row) => row.probabilityPct === null).length,
    },
  };
  REPORT_CACHE.set(report, now);
  return report;
}

/* ------------------------------------------------------------------ */
/* 7. Freezing and grading a round                                    */
/* ------------------------------------------------------------------ */

export function buildScepticRound(report, state, now, id, options = {}) {
  const conventions = report.conventions;
  const today = todayOf(now);
  const candidates = (report.queue || []).filter((row) => row.probabilityPct !== null);
  if (!candidates.length) {
    const unmeasured = report.counts.unmeasured;
    return {
      ok: false,
      reason: unmeasured > 0
        ? `No finding can be priced: all ${unmeasured} contradiction(s) on file belong to families with fewer than ${conventions.scepticMinScored} scored claims. Record a verdict on those claims first — a probability with no basis is not a forecast.`
        : 'There is nothing to cross-examine: no record currently contradicts another. That is a result, not an empty screen — freeze nothing and read the sampling bound instead.',
    };
  }
  const selected = candidates.slice(0, SCEPTIC_LIMITS.maxClaims);
  const reviewHorizon = Number(options.reviewHorizonDays) || conventions.scepticReviewHorizonDays;
  const record = {
    id,
    frozenAt: now.toISOString(),
    reviewOn: dayKey(addDays(now, reviewHorizon)),
    windowDays: conventions.scepticWindowDays,
    tolerancePct: conventions.scepticTolerancePct,
    minScored: conventions.scepticMinScored,
    population: report.population.total,
    examined: report.counts.examined,
    claims: selected.map((row) => ({
      claimKey: row.key,
      detectorId: row.detectorId,
      family: row.family,
      nodeType: row.nodeType,
      nodeId: row.nodeId,
      stake: row.stake,
      probabilityPct: row.probabilityPct,
      evidenceNodeType: row.evidenceNodeType,
      evidenceNodeId: row.evidenceNodeId,
    })),
    families: report.families.map((row) => ({
      key: row.key,
      errorMeanPct: row.errorMeanPct,
      errorLoPct: row.errorLoPct,
      errorHiPct: row.errorHiPct,
      verdict: row.verdict,
    })),
    predictedContradictions: round(selected.reduce((sum, row) => sum + row.probabilityPct / 100, 0), 2),
    expectedLoss: round(selected.reduce((sum, row) => sum + (row.expectedWrong || 0), 0), 2),
    topClaimKey: selected[0].key,
    graded: null,
    challengeNotes: [],
  };
  return { ok: true, record, skipped: (report.findings.length - report.counts.measured) };
}

/**
 * Grade a frozen round exactly once, from verdicts recorded after it was frozen.
 * A verdict recorded before the freeze was already inside the family rate the
 * round quoted, so scoring it again would count one observation twice.
 */
export function gradeScepticRound(record, state, now = new Date()) {
  if (!record) return { ok: false, reason: 'No round to grade.' };
  if (record.graded) return { ok: false, reason: 'This round has already been graded. A round is scored once, against the record as it stood at its review date.' };
  const today = todayOf(now);
  if (!record.reviewOn || record.reviewOn >= today) {
    return { ok: false, reason: `This round is not due for grading until ${record.reviewOn}. Grading it early would score the record before it has answered.` };
  }
  const frozenAt = record.frozenAt || '';
  const verdicts = new Map();
  for (const row of asArray(state.scepticDispositions)) {
    if ((row.at || '') < frozenAt) continue;
    const prior = verdicts.get(row.claimKey);
    if (!prior || (row.at || '') >= (prior.at || '')) verdicts.set(row.claimKey, row);
  }
  const pairs = [];
  let refuted = 0;
  let held = 0;
  let dismissed = 0;
  let lapsed = 0;
  const claimResults = [];
  for (const claim of asArray(record.claims)) {
    const disposition = verdicts.get(claim.claimKey);
    const p = Number(claim.probabilityPct) / 100;
    if (!disposition) {
      claimResults.push({ claimKey: claim.claimKey, outcome: 'unexamined' });
      continue;
    }
    if (disposition.verdict === 'dismissed') {
      dismissed += 1;
      claimResults.push({ claimKey: claim.claimKey, outcome: 'dismissed' });
      continue;
    }
    if (!SCORED_DISPOSITIONS.includes(disposition.verdict)) {
      lapsed += 1;
      claimResults.push({ claimKey: claim.claimKey, outcome: 'lapsed' });
      continue;
    }
    const y = disposition.verdict === 'refuted' ? 1 : 0;
    if (y === 1) refuted += 1;
    else held += 1;
    pairs.push({ p, y });
    claimResults.push({ claimKey: claim.claimKey, outcome: disposition.verdict, p, y });
  }
  if (!pairs.length) {
    return {
      ok: true,
      grade: {
        gradedAt: now.toISOString(),
        considered: asArray(record.claims).length,
        scored: 0,
        refuted,
        held,
        dismissed,
        lapsed,
        baseRatePct: null,
        brier: null,
        brierRef: null,
        logLoss: null,
        logLossRef: null,
        skill: null,
      },
      result: { lapsed: true, claimResults },
    };
  }
  const baseRate = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
  const brier = brierScore(pairs);
  const brierRef = brierScore(pairs.map((pair) => ({ p: baseRate, y: pair.y })));
  const logLoss = logScore(pairs);
  const logLossRef = logScore(pairs.map((pair) => ({ p: baseRate, y: pair.y })));
  const skill = Number.isFinite(brierRef) && brierRef > 0 ? round(1 - brier / brierRef, 3) : null;
  return {
    ok: true,
    grade: {
      gradedAt: now.toISOString(),
      considered: asArray(record.claims).length,
      scored: pairs.length,
      refuted,
      held,
      dismissed,
      lapsed,
      baseRatePct: round(baseRate * 100, 1),
      brier,
      brierRef,
      logLoss,
      logLossRef,
      skill,
    },
    result: { lapsed: false, claimResults, baseRate },
  };
}

/* ------------------------------------------------------------------ */
/* 8. Signals, badge and brief                                        */
/* ------------------------------------------------------------------ */

export function scepticSignals(state, now = new Date(), settings = null) {
  const report = scepticReport(state, now, settings);
  const signals = [];
  const add = (signal) => signals.push(signal);

  if (report.findings.length > 0 && report.counts.examined === 0) {
    add({
      ruleId: SCEPTIC_SIGNAL_IDS.UNEXAMINED,
      domain: 'Cross-examination',
      severity: 2,
      confidence: 'high',
      title: `${report.findings.length} claim(s) the record contradicts, none examined`,
      detail: `The workspace holds ${report.population.total} auditable claims across six families and the record currently contradicts ${report.findings.length} of them. `
        + 'None has a verdict, so nothing here is a measurement yet — it is a list of questions. '
        + `Examining ${report.coverage.neededFor10} with none standing would let you say, at 95%, that fewer than 10% of these contradictions are false alarms.`,
      action: { label: 'Open the cross-examinations', route: '#/sceptic?panel=findings' },
      evidence: [`${report.findings.length} findings`, `0 examined`, 'false-alarm bound 100%'],
    });
  }

  const doubted = report.families.filter((row) => row.verdict === 'doubted');
  if (doubted.length) {
    const worst = doubted.slice().sort((a, b) => (b.errorLoPct || 0) - (a.errorLoPct || 0))[0];
    add({
      ruleId: SCEPTIC_SIGNAL_IDS.FAMILY,
      domain: 'Cross-examination',
      severity: 3,
      confidence: 'medium',
      title: `${worst.label} is failing its own record: ${worst.errorMeanPct}% refuted`,
      detail: `${worst.refuted} of ${worst.scored} scored ${worst.unit}s in this family were refuted and the 90% interval is ${worst.errorLoPct}–${worst.errorHiPct}%, `
        + `entirely above your ${worst.tolerancePct}% tolerance. The next decision is being made on claims of this kind.`,
      action: { label: 'Open the family ledger', route: '#/sceptic?panel=families' },
      evidence: [`${worst.refuted}/${worst.scored} refuted`, `${worst.errorLoPct}–${worst.errorHiPct}%`, `tolerance ${worst.tolerancePct}%`],
    });
  }

  const top = report.queue.find((row) => row.probabilityPct !== null && row.state === 'open');
  if (top) {
    add({
      ruleId: SCEPTIC_SIGNAL_IDS.EXPOSURE,
      domain: 'Cross-examination',
      severity: top.stake >= 4 ? 3 : 2,
      confidence: top.familyVerdict === 'doubted' ? 'high' : 'medium',
      title: `“${String(top.label).slice(0, 70)}” has a ${top.probabilityPct}% chance of being wrong`,
      detail: `${top.detectorLabel}: ${top.detail} Settling it costs one observation — ${top.refuter}.`,
      action: { label: 'Cross-examine it', route: `#/sceptic?panel=findings&finding=${encodeURIComponent(top.key)}` },
      evidence: [`${top.probabilityPct}% wrong`, `stake ${top.stake}`, top.familyLabel],
    });
  }

  if (report.auditor.dismissalBreached) {
    add({
      ruleId: SCEPTIC_SIGNAL_IDS.DISMISSAL,
      domain: 'Cross-examination',
      severity: 2,
      confidence: 'high',
      title: `${report.auditor.dismissalPct}% of this terminal's findings have been dismissed`,
      detail: `The declared cap is ${report.auditor.dismissalCapPct}%. A terminal that is mostly dismissed is not being cross-examined — it is being closed. `
        + 'Either the detectors are wrong (and the reasons say which) or the dismissal is doing the work of a verdict.',
      action: { label: 'Audit the auditor', route: '#/sceptic?panel=auditor' },
      evidence: [`${report.auditor.dismissed}/${report.auditor.raised} dismissed`, `cap ${report.auditor.dismissalCapPct}%`],
    });
  }

  if (report.counts.ungraded > 0) {
    add({
      ruleId: SCEPTIC_SIGNAL_IDS.UNGRADED,
      domain: 'Cross-examination',
      severity: 2,
      confidence: 'high',
      title: `${report.counts.ungraded} frozen round(s) are due for grading`,
      detail: 'A frozen audit nobody grades cannot tell you whether this terminal prices your contradictions correctly. Grading writes the outcome once, from the verdict ledger.',
      action: { label: 'Open the rounds', route: '#/sceptic?panel=rounds' },
      evidence: [`${report.counts.ungraded} due`],
    });
  }

  if (report.families.some((row) => row.verdict === 'unmeasured' && row.findings >= 0) && report.findings.length > 0) {
    const unmeasured = report.families.filter((row) => row.verdict === 'unmeasured');
    add({
      ruleId: SCEPTIC_SIGNAL_IDS.COVERAGE,
      domain: 'Cross-examination',
      severity: 1,
      confidence: 'high',
      title: `${unmeasured.length} claim family(ies) have no rate at all`,
      detail: `${report.counts.unmeasured} finding(s) cannot be priced because their family has fewer than the declared floor of scored claims. `
        + 'That is a refusal, not a zero: the claims are counted and excluded from the exposure total rather than assumed sound.',
      action: { label: 'Open the method', route: '#/sceptic?panel=method' },
      evidence: [`${unmeasured.length} families unmeasured`, `${report.counts.unmeasured} unpriced`],
    });
  }

  return signals;
}

/**
 * The nav badge counts decision-shaped work only: families that are failing their
 * own record, plus frozen rounds due for grading. A list of forty contradictions
 * is not forty pieces of work, and a badge that says otherwise is noise.
 */
export function scepticAttentionCount(state, now = new Date(), settings = null) {
  const report = scepticReport(state, now, settings);
  const doubted = report.counts.doubtedFamilies;
  const ungraded = report.counts.ungraded;
  const firstExam = report.findings.length > 0 && report.counts.examined === 0 ? 1 : 0;
  return doubted + ungraded + firstExam;
}

/** An identity-free brief: counts, rates and refusals only. No names, no titles. */
export function scepticBrief(report, now = new Date()) {
  const lines = [];
  lines.push('# Cross-examination brief');
  lines.push(`Generated ${todayOf(now)} · engine ${report.engine}`);
  lines.push('');
  lines.push(`Auditable claims on file: **${report.population.total}** across ${report.families.length} families.`);
  lines.push(`Contradicted by the record: **${report.findings.length}** (${report.counts.measured} priced, ${report.counts.unmeasured} refused for want of a family rate).`);
  lines.push(`Cross-examined: **${report.counts.examined}** of ${report.findings.length}.`);
  lines.push('');
  lines.push('## Sampling bound');
  lines.push(report.coverage.examined === 0
    ? 'No claim has been examined. With zero examinations no statement at all can be made about this terminal: the 95% upper bound on its false-alarm rate is 100%.'
    : `With ${report.coverage.examined} examination(s) and ${report.coverage.held} recorded false alarm(s), the 95% upper bound on this terminal\'s false-alarm rate is ${report.coverage.falseAlarmUpperPct}% (Clopper–Pearson; the exact form of the rule of three). ${report.coverage.neededFor10} examinations with none would bound it below 10%.`);
  lines.push('');
  lines.push('## Families');
  for (const family of report.families) {
    lines.push(family.verdict === 'unmeasured'
      ? `- ${family.claim} — no rate: ${family.scored} scored, floor ${family.minScored}.`
      : `- ${family.claim} — ${family.errorMeanPct}% refuted (90% interval ${family.errorLoPct}–${family.errorHiPct}%, n=${family.scored}) · ${family.verdictLabel}.`);
  }
  lines.push('');
  lines.push('## The auditor');
  lines.push(report.auditor.scored === 0
    ? 'No verdict has been scored. This terminal has no hit rate, and it does not claim one.'
    : `${report.auditor.refuted} refuted, ${report.auditor.held} held, ${report.auditor.dismissed} dismissed. Precision ${report.auditor.precision ? report.auditor.precision.pct : '—'}% (95% interval ${report.auditor.precision ? `${report.auditor.precision.loPct}–${report.auditor.precision.hiPct}` : '—'}), dismissal rate ${report.auditor.dismissalPct}%.`);
  lines.push('');
  lines.push('## Exposure');
  lines.push(report.exposure.note);
  if (report.exposure.expectedWrong !== null) {
    lines.push(`Expected wrong claims, stake-weighted: **${report.exposure.expectedWrong}** units over ${report.exposure.measuredClaims} priced claim(s).`);
  }
  lines.push('');
  lines.push('Every figure above is derived from dated records this workspace already holds. No claim, verdict, person or probability was generated for this brief.');
  return lines.join('\n');
}
