/**
 * app/core/domain/parity.js — the Leadership Parity & Standard Consistency
 * Engine (Schema v65, ADR-0054).
 *
 * Grades ONLY the leader's allocation of scarce managerial capital, fulfillment
 * of leader-owed promises, and consistency across evaluative bars — never an
 * employee. Never reads `conflicts` or `pulses`, and never stores or infers
 * protected demographic characteristics.
 *
 * Named cross-domain frameworks:
 *   - Gini (1912) finite-sample-corrected concentration & Lorenz curve
 *   - Atkinson (1970) zero-safe inequality index (epsilon = 0.5)
 *   - Theil (1967) additive entropy decomposition (T = T_between + T_within)
 *   - Graen & Uhl-Bien (1995); Buengeler, Piccolo & Locklear (2021) LMX Variety
 *     (structural role/ramp differentiation) vs LMX Disparity (within-peer skew)
 *   - Rousseau (1989, 1995) Psychological Contract & Wilson (1927) intervals
 *   - Kahneman, Sibony & Sunstein (2021) intra-judge Noise; Leventhal (1980)
 *     procedural consistency; Kendall (1938) tau-b rank concordance
 *   - Brier (1950) verification of frozen parity commitments
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { REVIEW_RATINGS } from '../schema.js';
import { cadence, carryHistory, followThroughIndex, isLeaderOwned } from './oneonone.js';
import { validateSBI, feedbackLatency } from './feedback.js';
import { activeOnboarding } from './onboarding.js';
import { activePlan, openWillActions } from './growth.js';
import { assess } from './readiness.js';
import { buildReviewEvidence, validPeriod } from './reviews.js';
import { PARITY_CHANNEL_KEYS } from './paritySchema.js';

export const PARITY_DEFAULTS = Object.freeze({
  windowDays: 90,
  minTeam: 3,
  rampFloorDays: 14,
  giniWarnPct: 35,
  promiseGapWarnPp: 35,
  reviewHorizonDays: 28,
  maxTasksPerScan: 4,
  auditCap: 60,
  autoPropagate: true,
});

export const PARITY_CHANNEL_META = Object.freeze({
  coaching: {
    key: 'coaching',
    code: 'CH-COACH',
    label: 'Conversational presence (1:1s)',
    unit: 'reliability-adjusted meetings / 30d',
    description: 'Held 1:1 frequency per 30 active days discounted by skip/reschedule share.',
  },
  feedback: {
    key: 'feedback',
    code: 'CH-FDBK',
    label: 'Developmental specificity (SBI)',
    unit: 'specificity-weighted notes / 30d',
    description: 'Feedback notes in window weighted by SBI specificity (1 + quality/4).',
  },
  authority: {
    key: 'authority',
    code: 'CH-AUTH',
    label: 'Stretch delegation authority',
    unit: 'authority-weighted outcomes / 30d',
    description: 'Active and completed delegations weighted by decision boundary (recommend=1 to own=4).',
  },
  sponsorship: {
    key: 'sponsorship',
    code: 'CH-SPON',
    label: 'Visibility & growth sponsorship',
    unit: 'sponsorship signals / 30d',
    description: 'Recognition items, delegation-backed GROW actions, and active succession nominations.',
  },
});

const AUTHORITY_WEIGHTS = Object.freeze({
  recommend: 1,
  agree: 2,
  'act-inform': 3,
  own: 4,
});

const RATING_ORDINAL = Object.freeze(
  Object.fromEntries(REVIEW_RATINGS.map((r, idx) => [r, idx + 1])),
);

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function parityConventionsFromSettings(settings = {}) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const rawGiniWarn = Number(s.parityGiniWarn);
  const normalizedGiniWarn = Number.isFinite(rawGiniWarn) && rawGiniWarn > 0 && rawGiniWarn <= 1
    ? Math.round(rawGiniWarn * 100)
    : rawGiniWarn;
  return {
    windowDays: clampInt(s.parityWindowDays, 14, 365, PARITY_DEFAULTS.windowDays),
    minTeam: clampInt(s.parityMinTeam, 3, 50, PARITY_DEFAULTS.minTeam),
    rampFloorDays: clampInt(s.parityRampFloorDays, 0, 180, PARITY_DEFAULTS.rampFloorDays),
    giniWarnPct: clampInt(normalizedGiniWarn, 10, 90, PARITY_DEFAULTS.giniWarnPct),
    promiseGapWarnPp: clampInt(s.parityPromiseGapWarnPp, 10, 90, PARITY_DEFAULTS.promiseGapWarnPp),
    reviewHorizonDays: clampInt(s.parityReviewHorizonDays, 7, 180, PARITY_DEFAULTS.reviewHorizonDays),
    maxTasksPerScan: clampInt(s.parityMaxTasksPerScan, 0, 10, PARITY_DEFAULTS.maxTasksPerScan),
    auditCap: clampInt(s.parityAuditCap, 10, 200, PARITY_DEFAULTS.auditCap),
    autoPropagate: s.parityAutoPropagate !== false,
  };
}

/* ------------------------------------------------ inequality & stats math */

/**
 * Wilson (1927) 95% score interval for a binomial proportion, returned in [0, 100].
 */
export function wilsonInterval(successes, total, z = 1.959964) {
  const n = Math.round(Number(total) || 0);
  const k = Math.min(n, Math.max(0, Math.round(Number(successes) || 0)));
  if (n <= 0) return { available: false, ratePct: null, lowPct: null, highPct: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    available: true,
    ratePct: round(p * 100, 1),
    lowPct: round(Math.max(0, center - half) * 100, 1),
    highPct: round(Math.min(1, center + half) * 100, 1),
  };
}

/**
 * Finite-sample-corrected Gini (1912), zero-safe Atkinson (1970) at epsilon=0.5,
 * and exact Lorenz curve coordinates. Refuses below `minTeam` or zero total.
 */
export function computeInequality(values, minTeam = PARITY_DEFAULTS.minTeam) {
  const clean = (Array.isArray(values) ? values : []).map((v) => Math.max(0, Number(v) || 0));
  const n = clean.length;
  const zeroCount = clean.filter((v) => v <= 0).length;
  if (n < minTeam) {
    return {
      available: false,
      reason: `Requires at least ${minTeam} post-ramp team members (${n} eligible).`,
      n,
      zeroCount,
      total: round(clean.reduce((a, b) => a + b, 0), 3),
      giniPct: null,
      giniRawPct: null,
      atkinsonPct: null,
      topOneSharePct: null,
      bottomHalfSharePct: null,
      lorenz: [],
    };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return {
      available: false,
      reason: 'Zero recorded activity on this channel inside the look-back window.',
      n,
      zeroCount,
      total: 0,
      giniPct: null,
      giniRawPct: null,
      atkinsonPct: null,
      topOneSharePct: null,
      bottomHalfSharePct: null,
      lorenz: [],
    };
  }
  const mean = total / n;
  let absDiffSum = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      absDiffSum += Math.abs(sorted[i] - sorted[j]);
    }
  }
  const giniRaw = absDiffSum / (2 * n * n * mean);
  const giniCorrected = Math.min(1, giniRaw * (n / (n - 1)));

  // Atkinson (1970) at epsilon = 0.5: 1 - (1/mean) * ((1/n) * sum(sqrt(x_i)))^2.
  const meanSqrt = sorted.reduce((acc, x) => acc + Math.sqrt(x), 0) / n;
  const ede = meanSqrt * meanSqrt;
  const atkinson = Math.min(1, Math.max(0, 1 - ede / mean));

  let cum = 0;
  const lorenz = [{ popPct: 0, sharePct: 0 }];
  for (let i = 0; i < n; i += 1) {
    cum += sorted[i];
    lorenz.push({
      popPct: round(((i + 1) / n) * 100, 1),
      sharePct: round((cum / total) * 100, 1),
    });
  }
  const bottomCount = Math.max(1, Math.floor(n / 2));
  const bottomSum = sorted.slice(0, bottomCount).reduce((a, b) => a + b, 0);
  const topOne = sorted[n - 1];

  return {
    available: true,
    reason: null,
    n,
    zeroCount,
    total: round(total, 3),
    mean: round(mean, 3),
    giniPct: round(giniCorrected * 100, 1),
    giniRawPct: round(giniRaw * 100, 1),
    atkinsonPct: round(atkinson * 100, 1),
    topOneSharePct: round((topOne / total) * 100, 1),
    bottomHalfSharePct: round((bottomSum / total) * 100, 1),
    lorenz,
  };
}

/**
 * Exact additive Theil (1967) T entropy decomposition: T = T_between + T_within
 * across structural cohorts (`level × ramp` — never demographic attributes).
 * Separates functional LMX Variety (T_between) from within-peer LMX Disparity
 * (T_within) per Buengeler, Piccolo & Locklear (2021).
 */
export function computeTheilDecomposition(rows, minTeam = PARITY_DEFAULTS.minTeam) {
  const clean = (Array.isArray(rows) ? rows : []).map((r) => ({
    value: Math.max(0, Number(r?.value) || 0),
    cohort: String(r?.cohort || 'unclassified'),
  }));
  const n = clean.length;
  if (n < minTeam) {
    return {
      available: false,
      reason: `Requires at least ${minTeam} post-ramp team members (${n} eligible).`,
      theil: null,
      betweenTheil: null,
      withinTheil: null,
      betweenSharePct: null,
      withinSharePct: null,
      cohortCount: 0,
      cohorts: [],
    };
  }
  const total = clean.reduce((s, r) => s + r.value, 0);
  if (total <= 0) {
    return {
      available: false,
      reason: 'Zero recorded activity on this channel inside the look-back window.',
      theil: null,
      betweenTheil: null,
      withinTheil: null,
      betweenSharePct: null,
      withinSharePct: null,
      cohortCount: 0,
      cohorts: [],
    };
  }
  const mean = total / n;
  const groups = new Map();
  for (const r of clean) {
    if (!groups.has(r.cohort)) groups.set(r.cohort, []);
    groups.get(r.cohort).push(r.value);
  }

  let between = 0;
  let within = 0;
  const cohorts = [];
  for (const [cohort, vals] of groups.entries()) {
    const ng = vals.length;
    const sumG = vals.reduce((a, b) => a + b, 0);
    const meanG = sumG / ng;
    const shareG = sumG / total;
    let tg = 0;
    if (meanG > 0) {
      for (const x of vals) {
        if (x > 0) tg += (x / meanG) * Math.log(x / meanG);
      }
      tg /= ng;
      between += shareG * Math.log(meanG / mean);
      within += shareG * tg;
    }
    cohorts.push({
      cohort,
      count: ng,
      mean: round(meanG, 3),
      sharePct: round(shareG * 100, 1),
      withinTheil: round(Math.max(0, tg), 4),
    });
  }
  cohorts.sort((a, b) => b.count - a.count || a.cohort.localeCompare(b.cohort));
  between = Math.max(0, between);
  within = Math.max(0, within);
  const theil = between + within;
  const betweenSharePct = theil > 1e-9 ? round((between / theil) * 100, 1) : 0;
  const withinSharePct = theil > 1e-9 ? round((within / theil) * 100, 1) : 0;

  return {
    available: true,
    reason: null,
    theil: round(theil, 4),
    betweenTheil: round(between, 4),
    withinTheil: round(within, 4),
    betweenSharePct,
    withinSharePct,
    cohortCount: cohorts.length,
    cohorts,
  };
}

/**
 * Kendall's (1938) tau-b rank concordance over `[{ x, y, ... }]`.
 */
export function computeKendallTauB(items, minCount = 3) {
  const list = Array.isArray(items) ? items : [];
  if (list.length < minCount) {
    return {
      available: false,
      reason: `Requires at least ${minCount} rated records (${list.length} found).`,
      n: list.length,
      tauB: null,
      concordant: 0,
      discordant: 0,
    };
  }
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const dx = list[i].x - list[j].x;
      const dy = list[i].y - list[j].y;
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) tiesX += 1;
      else if (dy === 0) tiesY += 1;
      else if (dx * dy > 0) concordant += 1;
      else discordant += 1;
    }
  }
  const denom = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
  return {
    available: denom > 0,
    reason: denom > 0 ? null : 'All ratings or evidence scores are tied; concordance is undefined.',
    n: list.length,
    tauB: denom > 0 ? round((concordant - discordant) / denom, 3) : null,
    concordant,
    discordant,
  };
}

/* ------------------------------------------- per-person channel harvesting */

function structuralCohortFor(person, hasActiveRamp) {
  const lvl = String(person.level || '').trim();
  const band = ['lead', 'manager', 'director', 'vp'].includes(lvl)
    ? 'lead+'
    : lvl === 'senior'
      ? 'senior'
      : lvl === 'ic'
        ? 'ic'
        : 'unclassified';
  return `${band}:${hasActiveRamp ? 'ramp' : 'steady'}`;
}

function inWindow(day, windowStart, today) {
  const clean = dayKey(day);
  return Boolean(clean && clean >= windowStart && clean <= today);
}

function harvestPersonAllocation(state, person, windowStart, today, now, conventions) {
  const startDay = dayKey(person.startDate);
  const tenureDays = startDay && startDay <= today ? Math.max(0, daysBetween(startDay, today) ?? conventions.windowDays) : null;
  const inEarlyRamp = tenureDays !== null && tenureDays < conventions.rampFloorDays;
  const effectiveStart = startDay && startDay > windowStart ? startDay : windowStart;
  const activeDays = Math.max(1, Math.min(conventions.windowDays, (daysBetween(effectiveStart, today) ?? 0) + 1));
  const rateScale = 30 / activeDays;
  const rampPlan = activeOnboarding(state, person.id);
  const cohort = structuralCohortFor(person, Boolean(rampPlan));

  // 1. Conversational presence (`coaching`)
  const meetingsInWin = (state.oneOnOnes || []).filter(
    (m) => m && m.personId === person.id && inWindow(m.date, effectiveStart, today),
  );
  const heldCount = meetingsInWin.filter((m) => (m.status || 'held') === 'held').length;
  const skippedCount = meetingsInWin.filter((m) => m.status === 'skipped').length;
  const movedCount = meetingsInWin.filter((m) => m.status === 'moved').length;
  const scheduledTotal = heldCount + skippedCount + movedCount;
  const skipOrMoveShare = scheduledTotal > 0 ? (skippedCount + movedCount) / scheduledTotal : 0;
  const cad = cadence(state, person.id, now, state.settings);
  const coachingUnits = heldCount * rateScale * (1 - 0.5 * skipOrMoveShare);

  // 2. Developmental specificity (`feedback`)
  const fbInWin = (state.feedback || []).filter(
    (f) => f && f.personId === person.id && f.direction !== 'upward' && inWindow(f.date, effectiveStart, today),
  );
  let fbWeighted = 0;
  let praiseCount = 0;
  let constructiveCount = 0;
  const latencies = [];
  for (const fb of fbInWin) {
    const sbi = validateSBI(fb);
    fbWeighted += 1 + sbi.quality / 4;
    if (fb.kind === 'praise') praiseCount += 1;
    else if (fb.kind === 'constructive') constructiveCount += 1;
    const lat = feedbackLatency(fb);
    if (lat !== null) latencies.push(lat);
  }
  const feedbackUnits = fbWeighted * rateScale;

  // 3. Stretch delegation authority (`authority`)
  const dels = (state.delegations || []).filter((d) => {
    if (!d || d.personId !== person.id) return false;
    if (d.status === 'active') return !d.delegatedOn || d.delegatedOn <= today;
    if (d.status === 'done') return inWindow(d.completedOn || d.delegatedOn, effectiveStart, today);
    return false;
  });
  let authorityRaw = 0;
  let stretchCount = 0;
  for (const d of dels) {
    const w = AUTHORITY_WEIGHTS[d.authority] || 1;
    authorityRaw += w;
    if (d.authority === 'act-inform' || d.authority === 'own') stretchCount += 1;
  }
  // Active ongoing stretch scope is scaled gently when active <30d so brand-new
  // 15-day joiners aren't inflated above 4x, while preserving full-window comparability.
  const authorityUnits = authorityRaw * Math.min(2, rateScale);

  // 4. Visibility & growth sponsorship (`sponsorship`)
  const recInWin = (state.recognition || []).filter(
    (r) => r && r.personId === person.id && inWindow(r.date, effectiveStart, today),
  );
  const gPlan = activePlan(state, person.id);
  const backedWillCount = gPlan
    ? openWillActions(gPlan, now).filter((w) => Boolean(w.delegationId)).length
    : 0;
  const readAssess = assess(state, person.id, now, state.settings);
  const nomPoints = readAssess.rating === 'ready-now' ? 2 : readAssess.rating === 'ready-later' ? 1 : 0;
  const sponsorshipUnits = recInWin.length * rateScale + backedWillCount + nomPoints;

  return {
    personId: person.id,
    name: person.name,
    role: person.role || '',
    level: person.level || '',
    cohort,
    tenureDays,
    activeDays,
    inEarlyRamp,
    hasActiveRamp: Boolean(rampPlan),
    cadenceStatus: cad.status,
    overdueDays: cad.overdueDays || 0,
    meetings: { heldCount, skippedCount, movedCount, skipOrMoveSharePct: round(skipOrMoveShare * 100, 1) },
    feedback: {
      count: fbInWin.length,
      praiseCount,
      constructiveCount,
      medianLatencyDays: median(latencies),
    },
    delegations: { count: dels.length, stretchCount, authorityRaw },
    sponsorship: {
      recognitionCount: recInWin.length,
      backedWillCount,
      readinessRating: readAssess.rating,
      readinessEvidenceCount: readAssess.evidence.metCount,
    },
    units: {
      coaching: round(coachingUnits, 3),
      feedback: round(feedbackUnits, 3),
      authority: round(authorityUnits, 3),
      sponsorship: round(sponsorshipUnits, 3),
    },
  };
}

/* ------------------------------------------- leader promise ledger */

function harvestPromiseLedger(state, activePeople, today, now, conventions) {
  const rows = [];

  for (const person of activePeople) {
    let totalPromises = 0;
    let duePromises = 0;
    let fulfilledCount = 0;
    let fulfilledOnTime = 0;
    let overdueOpen = 0;
    let carriedTwicePlus = 0;
    let droppedCount = 0;

    // 1. Leader/shared actions in 1:1s (deduplicating intermediate carried links:
    // inspect terminal actions that were NOT carried forward to a successor).
    const meetings = (state.oneOnOnes || []).filter((m) => m && m.personId === person.id);
    let skippedMeetings = 0;
    let heldMeetings = 0;
    for (const m of meetings) {
      if (m.status === 'skipped') skippedMeetings += 1;
      else if ((m.status || 'held') === 'held') heldMeetings += 1;
      for (const act of m.actions || []) {
        if (!act || !isLeaderOwned(act)) continue;
        // Intermediate link in a carry chain is represented by its terminal action.
        if (act.carriedToActionId || act.carriedToMeetingId) continue;
        const hops = carryHistory(state, m.id, act);
        if (hops.length >= 2) carriedTwicePlus += 1;
        totalPromises += 1;
        const origDue = hops.at(-1)?.action?.due || act.due || null;
        const isSettled = act.done === true || act.dropped === true;
        const isDue = isSettled || !origDue || origDue <= today;
        if (!isDue) continue;
        duePromises += 1;
        if (act.done === true) {
          fulfilledCount += 1;
          const closedDay = act.completedOn || m.date || today;
          if (!origDue || closedDay <= origDue) fulfilledOnTime += 1;
        } else if (act.dropped === true) {
          droppedCount += 1;
        } else if (origDue && origDue < today) {
          overdueOpen += 1;
        }
      }
    }

    // 2. 30-60-90 managerSupport commitments owed to this person.
    for (const ms of state.managerSupport || []) {
      if (!ms || ms.personId !== person.id) continue;
      totalPromises += 1;
      const isSettled = ms.done === true || ms.dropped === true;
      const isDue = isSettled || !ms.due || ms.due <= today;
      if (!isDue) continue;
      duePromises += 1;
      if (ms.done === true) {
        fulfilledCount += 1;
        if (!ms.due || (ms.completedOn || today) <= ms.due) fulfilledOnTime += 1;
      } else if (ms.dropped === true) {
        droppedCount += 1;
      } else if (ms.due && ms.due < today) {
        overdueOpen += 1;
      }
    }

    // 3. Constructive feedback follow-ups promised by the leader.
    for (const fb of state.feedback || []) {
      if (!fb || fb.personId !== person.id || fb.direction === 'upward' || !fb.followUpOn) continue;
      totalPromises += 1;
      if (fb.followUpDone === true) {
        duePromises += 1;
        fulfilledCount += 1;
        if (!fb.followUpCompletedOn || fb.followUpCompletedOn <= fb.followUpOn) fulfilledOnTime += 1;
      } else if (fb.followUpOn <= today) {
        duePromises += 1;
        if (fb.followUpOn < today) overdueOpen += 1;
      }
    }

    // 4. Active GROW plan review deferrals (leader-scheduled review pushed repeatedly).
    const plan = activePlan(state, person.id);
    const reviewDeferrals = Number(plan?.reviewDeferrals) || 0;
    if (plan && reviewDeferrals >= 2) {
      totalPromises += 1;
      duePromises += 1;
      carriedTwicePlus += 1;
      if (plan.reviewOn && plan.reviewOn < today) overdueOpen += 1;
    }

    const wilson = wilsonInterval(fulfilledCount, duePromises);
    const breachRisk = (overdueOpen >= 2)
      || (overdueOpen >= 1 && (carriedTwicePlus >= 1 || skippedMeetings >= 2));

    rows.push({
      personId: person.id,
      name: person.name,
      totalPromises,
      duePromises,
      fulfilledCount,
      fulfilledOnTime,
      overdueOpen,
      carriedTwicePlus,
      droppedCount,
      skippedMeetings,
      heldMeetings,
      reviewDeferrals,
      fulfillmentPct: wilson.ratePct,
      wilsonLowPct: wilson.lowPct,
      wilsonHighPct: wilson.highPct,
      breachRisk,
    });
  }

  const totalDue = rows.reduce((s, r) => s + r.duePromises, 0);
  const totalFulfilled = rows.reduce((s, r) => s + r.fulfilledCount, 0);
  const totalOverdueOpen = rows.reduce((s, r) => s + r.overdueOpen, 0);
  const overallWilson = wilsonInterval(totalFulfilled, totalDue);

  const comparable = rows.filter((r) => r.duePromises >= 2 && r.fulfillmentPct !== null);
  let promiseGapPp = null;
  let highestPct = null;
  let lowestPct = null;
  if (comparable.length >= 2) {
    const rates = comparable.map((r) => r.fulfillmentPct);
    highestPct = Math.max(...rates);
    lowestPct = Math.min(...rates);
    promiseGapPp = round(highestPct - lowestPct, 1);
  }
  const asymmetric = promiseGapPp !== null && promiseGapPp >= conventions.promiseGapWarnPp;

  return {
    rows,
    totalPromises: rows.reduce((s, r) => s + r.totalPromises, 0),
    totalDue,
    totalFulfilled,
    totalOverdueOpen,
    overallFulfillmentPct: overallWilson.ratePct,
    overallWilsonLowPct: overallWilson.lowPct,
    overallWilsonHighPct: overallWilson.highPct,
    comparableCount: comparable.length,
    promiseGapPp,
    highestFulfillmentPct: highestPct,
    lowestFulfillmentPct: lowestPct,
    asymmetric,
    breachRows: rows.filter((r) => r.breachRisk),
  };
}

/* ------------------------------------------- standard-consistency audits */

/**
 * 1. Cross-concern due-process bar consistency (`performanceConcerns`).
 */
export function auditConcernConsistency(state) {
  const concerns = (state.performanceConcerns || []).filter(
    (c) => c && c.plan && dayKey(c.plan.adoptedOn),
  );
  const records = concerns.map((c) => {
    const adoptedOn = dayKey(c.plan.adoptedOn);
    const preObs = (c.observations || []).filter((o) => o && dayKey(o.on || o.observedOn) && dayKey(o.on || o.observedOn) <= adoptedOn);
    const distinctDates = new Set(preObs.map((o) => dayKey(o.on || o.observedOn)).filter(Boolean)).size;
    const preSupports = (c.supports || []).filter((s) => s && (!dayKey(s.on || s.startedOn) || dayKey(s.on || s.startedOn) <= adoptedOn)).length;
    const preTwoWay = (c.conversations || []).some(
      (conv) => conv && conv.kind === 'two-way' && (!dayKey(conv.on) || dayKey(conv.on) <= adoptedOn),
    );
    const assessmentDays = c.openedOn && adoptedOn ? Math.max(0, daysBetween(c.openedOn, adoptedOn) ?? 0) : null;
    const overrideUsed = Boolean(String(c.plan.overrideReason || '').trim());
    return {
      concernId: c.id,
      personId: c.personId || null,
      status: c.status,
      adoptedOn,
      observationsAtAdoption: preObs.length,
      distinctDatesAtAdoption: distinctDates,
      supportsAtAdoption: preSupports,
      twoWayBeforeAdoption: preTwoWay,
      assessmentDays,
      overrideUsed,
    };
  });

  if (records.length < 2) {
    return {
      available: false,
      reason: records.length === 0
        ? 'No formal performance plans have been adopted yet.'
        : 'Only 1 formal plan has been adopted; cross-concern threshold dispersion requires at least 2 adopted plans.',
      adoptedCount: records.length,
      records,
      obsRange: null,
      obsMad: null,
      daysRange: null,
      overrideAsymmetry: false,
      inconsistent: false,
    };
  }

  const obsCounts = records.map((r) => r.observationsAtAdoption);
  const obsMed = median(obsCounts);
  const obsMad = round(median(obsCounts.map((x) => Math.abs(x - obsMed))), 2);
  const obsRange = Math.max(...obsCounts) - Math.min(...obsCounts);

  const dayVals = records.map((r) => r.assessmentDays).filter((v) => v !== null);
  const daysRange = dayVals.length >= 2 ? Math.max(...dayVals) - Math.min(...dayVals) : null;
  const overrides = records.filter((r) => r.overrideUsed).length;
  const overrideAsymmetry = overrides > 0 && overrides < records.length;
  const twoWayAsymmetry = records.some((r) => r.twoWayBeforeAdoption) && records.some((r) => !r.twoWayBeforeAdoption);
  const inconsistent = overrideAsymmetry || twoWayAsymmetry || (obsRange >= 2 && (daysRange ?? 0) >= 14);

  return {
    available: true,
    reason: null,
    adoptedCount: records.length,
    records,
    minObservations: Math.min(...obsCounts),
    maxObservations: Math.max(...obsCounts),
    obsRange,
    obsMad,
    daysRange,
    overrideCount: overrides,
    overrideAsymmetry,
    twoWayAsymmetry,
    inconsistent,
  };
}

/**
 * 2. Succession nomination vs. recorded behavioural evidence (`readiness`).
 */
export function auditReadinessConsistency(state, activeRows) {
  const postRamp = activeRows.filter((r) => !r.inEarlyRamp);
  if (postRamp.length < 2) {
    return {
      available: false,
      reason: 'Requires at least 2 post-ramp team members to compare nomination bars.',
      nominatedCount: 0,
      haloNominations: [],
      overlookedBench: [],
      inversionCount: 0,
    };
  }
  const nominated = postRamp.filter((r) => r.sponsorship.readinessRating === 'ready-now' || r.sponsorship.readinessRating === 'ready-later');
  const unnominated = postRamp.filter((r) => r.sponsorship.readinessRating === 'not-ready');
  const minNominatedEvidence = nominated.length
    ? Math.min(...nominated.map((r) => r.sponsorship.readinessEvidenceCount))
    : null;
  const maxUnnominatedEvidence = unnominated.length
    ? Math.max(...unnominated.map((r) => r.sponsorship.readinessEvidenceCount))
    : null;

  const haloNominations = nominated.filter((r) => {
    const ev = r.sponsorship.readinessEvidenceCount;
    const unsupportedReadyNow = r.sponsorship.readinessRating === 'ready-now' && ev < 3;
    const unsupportedLater = r.sponsorship.readinessRating === 'ready-later' && ev <= 1;
    const beatenByUnnominated = maxUnnominatedEvidence !== null && maxUnnominatedEvidence - ev >= 2;
    return unsupportedReadyNow || unsupportedLater || beatenByUnnominated;
  }).map((r) => ({
    personId: r.personId,
    name: r.name,
    rating: r.sponsorship.readinessRating,
    evidenceCount: r.sponsorship.readinessEvidenceCount,
  }));

  const overlookedBench = unnominated.filter((r) => {
    const ev = r.sponsorship.readinessEvidenceCount;
    return ev >= 4 && (nominated.length === 0 || (minNominatedEvidence !== null && ev > minNominatedEvidence));
  }).map((r) => ({
    personId: r.personId,
    name: r.name,
    evidenceCount: r.sponsorship.readinessEvidenceCount,
    minNominatedEvidence,
  }));

  return {
    available: true,
    reason: null,
    nominatedCount: nominated.length,
    haloNominations,
    overlookedBench,
    inversionCount: haloNominations.length + overlookedBench.length,
  };
}

/**
 * 3. Performance review evidence-to-rating concordance (`reviews`).
 */
export function auditReviewConsistency(state) {
  const peopleById = new Map((state.people || []).map((p) => [p.id, p]));
  const getRating = (rev) => rev?.manager?.rating || rev?.rating || '';
  const rated = (state.reviews || []).filter(
    (rev) => rev && RATING_ORDINAL[getRating(rev)] && validPeriod(rev.periodStart, rev.periodEnd),
  );

  const scored = rated.map((rev) => {
    const rating = getRating(rev);
    const evidence = Array.isArray(rev.evidence) && rev.evidence.length
      ? rev.evidence
      : buildReviewEvidence(state, rev.personId, rev.periodStart, rev.periodEnd);
    const positive = evidence.filter((e) => e.valence === 'positive').length;
    const constructive = evidence.filter((e) => e.valence === 'constructive').length;
    const goalOrDel = evidence.filter((e) => e.sourceType === 'goal' || e.sourceType === 'delegation').length;
    const evidenceScore = round(positive * 1.2 + goalOrDel * 0.8 - constructive * 0.6, 2);

    // Recency share: dated evidence falling in final 25% of [periodStart, periodEnd].
    const spanDays = Math.max(1, daysBetween(rev.periodStart, rev.periodEnd) ?? 1);
    const finalQuarterStart = addDays(rev.periodStart, Math.floor(spanDays * 0.75));
    const dated = evidence.filter((e) => dayKey(e.date));
    const lateCount = dated.filter((e) => dayKey(e.date) >= finalQuarterStart).length;
    const recencySharePct = dated.length >= 3 ? round((lateCount / dated.length) * 100, 1) : null;
    const person = peopleById.get(rev.personId);

    return {
      reviewId: rev.id,
      personId: rev.personId,
      personName: person?.name || '',
      level: person?.level || '',
      rating,
      ratingOrdinal: RATING_ORDINAL[rating],
      evidenceCount: evidence.length,
      positiveCount: positive,
      constructiveCount: constructive,
      evidenceScore,
      recencySharePct,
      recencyBiased: recencySharePct !== null && recencySharePct > 65,
    };
  });

  const kendall = computeKendallTauB(
    scored.map((s) => ({ x: s.evidenceScore, y: s.ratingOrdinal })),
    3,
  );

  const discordantPairs = [];
  for (let i = 0; i < scored.length; i += 1) {
    for (let j = i + 1; j < scored.length; j += 1) {
      const a = scored[i];
      const b = scored[j];
      if (a.personId === b.personId) continue;
      if (a.level && b.level && a.level !== b.level) continue;
      if (a.ratingOrdinal > b.ratingOrdinal && a.evidenceScore + 1.5 <= b.evidenceScore) {
        discordantPairs.push({
          higherRatedReviewId: a.reviewId,
          lowerRatedReviewId: b.reviewId,
          higherRating: a.rating,
          lowerRating: b.rating,
          evidenceDelta: round(b.evidenceScore - a.evidenceScore, 2),
        });
      } else if (b.ratingOrdinal > a.ratingOrdinal && b.evidenceScore + 1.5 <= a.evidenceScore) {
        discordantPairs.push({
          higherRatedReviewId: b.reviewId,
          lowerRatedReviewId: a.reviewId,
          higherRating: b.rating,
          lowerRating: a.rating,
          evidenceDelta: round(a.evidenceScore - b.evidenceScore, 2),
        });
      }
    }
  }

  return {
    available: kendall.available,
    reason: kendall.reason,
    ratedCount: scored.length,
    tauB: kendall.tauB,
    concordant: kendall.concordant,
    discordant: kendall.discordant,
    discordantPairs,
    recencyBiasedCount: scored.filter((s) => s.recencyBiased).length,
    reviews: scored,
  };
}

/* ------------------------------------------- main report & planner */

export function parityReport(state, now = new Date(), settingsOverride = null) {
  const s = state || {};
  const conventions = parityConventionsFromSettings(settingsOverride || s.settings || {});
  const today = dayKey(now);
  const windowStart = addDays(today, -(conventions.windowDays - 1));
  const activePeople = (s.people || []).filter((p) => p && p.status !== 'archived');

  const personRows = activePeople.map((p) =>
    harvestPersonAllocation(s, p, windowStart, today, now, conventions),
  );
  const eligibleRows = personRows.filter((r) => !r.inEarlyRamp);
  const rampProtectedRows = personRows.filter((r) => r.inEarlyRamp);

  // Per-channel inequality & exact Theil decomposition
  const channels = {};
  for (const key of PARITY_CHANNEL_KEYS) {
    const meta = PARITY_CHANNEL_META[key];
    const ineq = computeInequality(eligibleRows.map((r) => r.units[key]), conventions.minTeam);
    const theil = computeTheilDecomposition(
      eligibleRows.map((r) => ({ value: r.units[key], cohort: r.cohort })),
      conventions.minTeam,
    );
    const concentrated = ineq.available && ineq.giniPct >= conventions.giniWarnPct;
    channels[key] = {
      ...meta,
      available: ineq.available,
      reason: ineq.reason,
      eligibleCount: eligibleRows.length,
      zeroCount: ineq.zeroCount,
      total: ineq.total,
      mean: ineq.mean ?? null,
      giniPct: ineq.giniPct,
      giniRawPct: ineq.giniRawPct,
      atkinsonPct: ineq.atkinsonPct,
      topOneSharePct: ineq.topOneSharePct,
      bottomHalfSharePct: ineq.bottomHalfSharePct,
      lorenz: ineq.lorenz,
      theil: theil.theil,
      betweenTheil: theil.betweenTheil,
      withinTheil: theil.withinTheil,
      betweenSharePct: theil.betweenSharePct,
      withinSharePct: theil.withinSharePct,
      cohorts: theil.cohorts,
      concentrated,
    };
  }

  const availableChannels = PARITY_CHANNEL_KEYS.map((k) => channels[k]).filter((c) => c.available);
  const withinTheilMean = availableChannels.length
    ? round(availableChannels.reduce((acc, c) => acc + (c.withinTheil || 0), 0) / availableChannels.length, 4)
    : null;

  // Structural Fringe ("Invisible Zone"): post-ramp active person with
  // overdue or >=50% skipped/moved 1:1s + zero feedback + zero stretch/recognition,
  // while at least one peer receives multi-channel capital.
  const someoneInvested = eligibleRows.some(
    (r) => (r.units.coaching > 0 ? 1 : 0)
      + (r.units.feedback > 0 ? 1 : 0)
      + (r.units.authority > 0 ? 1 : 0)
      + (r.units.sponsorship > 0 ? 1 : 0) >= 2,
  );
  const fringeRows = someoneInvested && eligibleRows.length >= conventions.minTeam
    ? eligibleRows.filter((r) => {
        const weakCadence = r.cadenceStatus === 'overdue' || r.cadenceStatus === 'never' || r.meetings.skipOrMoveSharePct >= 50 || r.meetings.heldCount === 0;
        const noFeedback = r.feedback.count === 0;
        const noStretchOrRec = r.delegations.stretchCount === 0 && r.sponsorship.recognitionCount === 0;
        return weakCadence && noFeedback && noStretchOrRec;
      })
    : [];

  const promises = harvestPromiseLedger(s, activePeople, today, now, conventions);
  const concernConsistency = auditConcernConsistency(s);
  const readinessConsistency = auditReadinessConsistency(s, personRows);
  const reviewConsistency = auditReviewConsistency(s);

  const inversionsCount = (concernConsistency.inconsistent ? 1 : 0)
    + readinessConsistency.inversionCount
    + reviewConsistency.discordantPairs.length;

  const audits = Array.isArray(s.parityAudits) ? s.parityAudits : [];
  const gradedAudits = audits.filter((a) => a && a.status === 'graded' && a.grade);
  const brierSamples = gradedAudits.filter((a) => typeof a.grade?.brier === 'number');
  const brierMean = brierSamples.length >= 5
    ? round(brierSamples.reduce((acc, a) => acc + a.grade.brier, 0) / brierSamples.length, 4)
    : null;

  return {
    today,
    windowStart,
    conventions,
    counts: {
      activePeople: activePeople.length,
      eligiblePostRamp: eligibleRows.length,
      rampProtected: rampProtectedRows.length,
      fringe: fringeRows.length,
      concentratedChannels: availableChannels.filter((c) => c.concentrated).length,
      overdueLeaderPromises: promises.totalOverdueOpen,
      inversions: inversionsCount,
      frozenAudits: audits.filter((a) => a && a.status === 'frozen').length,
      gradedAudits: gradedAudits.length,
    },
    withinTheilMean,
    personRows,
    eligibleRows,
    rampProtectedRows,
    fringeRows,
    channels,
    promises,
    standardConsistency: {
      concerns: concernConsistency,
      readiness: readinessConsistency,
      reviews: reviewConsistency,
      inversionsCount,
    },
    calibration: {
      gradedCount: gradedAudits.length,
      brierCount: brierSamples.length,
      brierMean,
      brierWithheldReason: brierSamples.length < 5
        ? `Average Brier score withheld until 5 probability-bearing audits are graded (${brierSamples.length} graded).`
        : null,
    },
  };
}

/**
 * Counterfactual 14-day rebalancing planner (greedy marginal disparity +
 * promise-debt reduction per leader hour).
 */
export function planParityRebalance(state, now = new Date(), { hourBudget = 4 } = {}) {
  const budget = Math.min(16, Math.max(0.5, Number(hourBudget) || 4));
  const report = parityReport(state, now);
  const { eligibleRows, promises, standardConsistency, conventions } = report;

  const candidates = [];
  const scale30 = 30 / Math.max(14, conventions.windowDays);

  // Candidate 1: Hold overdue / neglected 1:1s
  for (const row of eligibleRows) {
    if (row.cadenceStatus === 'overdue' || row.cadenceStatus === 'never' || row.meetings.heldCount === 0) {
      candidates.push({
        id: `rebal-1on1-${row.personId}`,
        kind: 'hold-1on1',
        hours: 0.75,
        personId: row.personId,
        personName: row.name,
        title: `Hold unscheduled/overdue 1:1 with ${row.name}`,
        rationale: row.meetings.heldCount === 0
          ? 'Zero held 1:1s in window; restores conversational baseline.'
          : `1:1 is ${row.overdueDays}d overdue (${row.meetings.skippedCount} skipped, ${row.meetings.movedCount} moved).`,
        route: `#/oneonones?person=${encodeURIComponent(row.personId)}`,
        deltaUnits: { coaching: round(1.25 * scale30, 3) },
        promisesClosed: 0,
        inversionsResolved: 0,
      });
    }
  }

  // Candidate 2: Close overdue leader promises
  for (const pRow of promises.rows) {
    if (pRow.overdueOpen > 0) {
      const closed = Math.min(2, pRow.overdueOpen);
      candidates.push({
        id: `rebal-promise-${pRow.personId}`,
        kind: 'close-promises',
        hours: round(0.5 * closed, 2),
        personId: pRow.personId,
        personName: pRow.name,
        title: `Close ${closed} overdue leader promise(s) owed to ${pRow.name}`,
        rationale: `${pRow.overdueOpen} overdue leader commitment(s)${pRow.carriedTwicePlus ? `, ${pRow.carriedTwicePlus} carried 2+ times` : ''}.`,
        route: `#/people/${encodeURIComponent(pRow.personId)}`,
        deltaUnits: {},
        promisesClosed: closed,
        inversionsResolved: 0,
      });
    }
  }

  // Candidate 3: Deliver specific SBI observation for zero-feedback post-ramp peers
  for (const row of eligibleRows) {
    if (row.feedback.count === 0) {
      candidates.push({
        id: `rebal-fb-${row.personId}`,
        kind: 'log-sbi-feedback',
        hours: 0.5,
        personId: row.personId,
        personName: row.name,
        title: `Record & discuss one specific SBI observation with ${row.name}`,
        rationale: 'Zero recorded feedback in the look-back window while peers receive developmental notes.',
        route: `#/feedback?person=${encodeURIComponent(row.personId)}`,
        deltaUnits: { feedback: round(2.0 * scale30, 3) },
        promisesClosed: 0,
        inversionsResolved: 0,
      });
    }
  }

  // Candidate 4: Rebalance stretch delegation to ready zero-stretch peers
  if (report.channels.authority.concentrated) {
    for (const row of eligibleRows) {
      if (row.delegations.stretchCount === 0 && row.sponsorship.readinessEvidenceCount >= 2) {
        candidates.push({
          id: `rebal-auth-${row.personId}`,
          kind: 'delegate-stretch',
          hours: 1.0,
          personId: row.personId,
          personName: row.name,
          title: `Scope one act-and-inform stretch outcome with ${row.name}`,
          rationale: `Stretch delegation Gini is ${report.channels.authority.giniPct}%; ${row.name} has ${row.sponsorship.readinessEvidenceCount}/5 readiness signals and 0 stretch delegations.`,
          route: `#/delegations?person=${encodeURIComponent(row.personId)}`,
          deltaUnits: { authority: round(3 * Math.min(2, scale30), 3) },
          promisesClosed: 0,
          inversionsResolved: 0,
        });
      }
    }
  }

  // Candidate 5: Reconcile succession / standard consistency inversions
  if (standardConsistency.inversionsCount > 0) {
    candidates.push({
      id: 'rebal-standard-calibration',
      kind: 'calibrate-standard',
      hours: 0.75,
      personId: standardConsistency.readiness.overlookedBench[0]?.personId || null,
      personName: standardConsistency.readiness.overlookedBench[0]?.name || '',
      title: 'Run intra-leader standard check across recovery plans, succession & reviews',
      rationale: `${standardConsistency.inversionsCount} threshold/evidence inversion(s) detected across evaluative records.`,
      route: '#/parity?panel=consistency',
      deltaUnits: standardConsistency.readiness.overlookedBench[0]
        ? { sponsorship: 1.0 }
        : {},
      promisesClosed: 0,
      inversionsResolved: standardConsistency.inversionsCount,
    });
  }

  // Simulate current state vector
  const simUnits = new Map(eligibleRows.map((r) => [r.personId, { ...r.units, cohort: r.cohort }]));
  let simOverduePromises = promises.totalOverdueOpen;
  let simInversions = standardConsistency.inversionsCount;

  const evalObjective = (unitsMap, overdueProm, invCount) => {
    let withinSum = 0;
    let avail = 0;
    for (const key of PARITY_CHANNEL_KEYS) {
      const th = computeTheilDecomposition(
        [...unitsMap.values()].map((u) => ({ value: u[key], cohort: u.cohort })),
        conventions.minTeam,
      );
      if (th.available && th.withinTheil !== null) {
        withinSum += th.withinTheil;
        avail += 1;
      }
    }
    const meanWithin = avail ? withinSum / avail : 0;
    // Weighted penalty combining unexplained peer Theil disparity + overdue leader promises + standard inversions.
    return meanWithin * 10 + overdueProm * 0.45 + invCount * 0.6;
  };

  let remaining = budget;
  const chosen = [];
  const pool = [...candidates];

  while (pool.length > 0) {
    const baseScore = evalObjective(simUnits, simOverduePromises, simInversions);
    let bestIdx = -1;
    let bestGainPerHour = 0;

    for (let i = 0; i < pool.length; i += 1) {
      const cand = pool[i];
      if (cand.hours > remaining + 1e-9) continue;
      const nextMap = new Map([...simUnits.entries()].map(([id, u]) => [id, { ...u }]));
      if (cand.personId && nextMap.has(cand.personId)) {
        const target = nextMap.get(cand.personId);
        for (const [ch, dv] of Object.entries(cand.deltaUnits || {})) {
          target[ch] = round((target[ch] || 0) + dv, 3);
        }
      }
      const nextScore = evalObjective(
        nextMap,
        Math.max(0, simOverduePromises - cand.promisesClosed),
        Math.max(0, simInversions - cand.inversionsResolved),
      );
      const gain = baseScore - nextScore;
      const gainPerHour = gain / cand.hours;
      if (gainPerHour > bestGainPerHour + 1e-6) {
        bestGainPerHour = gainPerHour;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const picked = pool.splice(bestIdx, 1)[0];
    if (picked.personId && simUnits.has(picked.personId)) {
      const target = simUnits.get(picked.personId);
      for (const [ch, dv] of Object.entries(picked.deltaUnits || {})) {
        target[ch] = round((target[ch] || 0) + dv, 3);
      }
    }
    simOverduePromises = Math.max(0, simOverduePromises - picked.promisesClosed);
    simInversions = Math.max(0, simInversions - picked.inversionsResolved);
    remaining = round(Math.max(0, remaining - picked.hours), 2);
    chosen.push(picked);
  }

  // Compute counterfactual post-rebalance channel stats
  const afterChannels = {};
  let afterWithinSum = 0;
  let afterAvail = 0;
  for (const key of PARITY_CHANNEL_KEYS) {
    const vals = [...simUnits.values()].map((u) => u[key]);
    const ineq = computeInequality(vals, conventions.minTeam);
    const th = computeTheilDecomposition(
      [...simUnits.values()].map((u) => ({ value: u[key], cohort: u.cohort })),
      conventions.minTeam,
    );
    if (th.available && th.withinTheil !== null) {
      afterWithinSum += th.withinTheil;
      afterAvail += 1;
    }
    afterChannels[key] = {
      giniPct: ineq.giniPct,
      withinTheil: th.withinTheil,
    };
  }
  const afterWithinTheilMean = afterAvail ? round(afterWithinSum / afterAvail, 4) : report.withinTheilMean;

  return {
    hourBudget: budget,
    hoursPlanned: round(budget - remaining, 2),
    hoursRemaining: remaining,
    candidateCount: candidates.length,
    chosen,
    before: {
      withinTheilMean: report.withinTheilMean,
      overdueLeaderPromises: promises.totalOverdueOpen,
      inversionsCount: standardConsistency.inversionsCount,
      fringeCount: report.counts.fringe,
    },
    after: {
      withinTheilMean: afterWithinTheilMean,
      overdueLeaderPromises: simOverduePromises,
      inversionsCount: simInversions,
      channels: afterChannels,
    },
  };
}

/* ------------------------------------------- frozen audit snapshot & grade */

export function buildParityAuditSnapshot(report, {
  id,
  label,
  commitment = '',
  reviewOn,
  predictedImprovementPct = null,
  notes = '',
  nowIso = new Date().toISOString(),
}) {
  const prob = predictedImprovementPct === null || predictedImprovementPct === undefined || predictedImprovementPct === ''
    ? null
    : Math.min(95, Math.max(5, Math.round(Number(predictedImprovementPct))));
  return {
    id,
    label: String(label || '').trim().slice(0, 200) || `Parity audit (${report.today})`,
    commitment: String(commitment || '').trim().slice(0, 600),
    frozenOn: report.today,
    reviewOn,
    windowDays: report.conventions.windowDays,
    eligibleCount: report.counts.eligiblePostRamp,
    withinTheilMean: report.withinTheilMean,
    fringeCount: report.counts.fringe,
    promiseFulfillmentPct: report.promises.overallFulfillmentPct,
    promiseGapPp: report.promises.promiseGapPp,
    overdueLeaderPromises: report.promises.totalOverdueOpen,
    inversionsCount: report.standardConsistency.inversionsCount,
    predictedImprovementPct: Number.isFinite(prob) ? prob : null,
    channels: PARITY_CHANNEL_KEYS.map((key) => {
      const ch = report.channels[key];
      return {
        key,
        available: ch.available,
        eligibleCount: ch.eligibleCount,
        giniPct: ch.giniPct,
        atkinsonPct: ch.atkinsonPct,
        theil: ch.theil,
        withinTheil: ch.withinTheil,
        betweenTheil: ch.betweenTheil,
        withinSharePct: ch.withinSharePct,
        zeroCount: ch.zeroCount,
      };
    }),
    status: 'frozen',
    grade: null,
    notes: String(notes || '').trim().slice(0, 600),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function computeParityAuditGrade(audit, liveReport, nowIso = new Date().toISOString()) {
  const beforeTheil = audit.withinTheilMean;
  const afterTheil = liveReport.withinTheilMean;
  const theilImproved = beforeTheil !== null && afterTheil !== null && afterTheil < beforeTheil - 0.005;
  const fringeImproved = liveReport.counts.fringe < audit.fringeCount;
  const promisesImproved = liveReport.promises.totalOverdueOpen < audit.overdueLeaderPromises
    || (audit.promiseGapPp !== null && liveReport.promises.promiseGapPp !== null && liveReport.promises.promiseGapPp < audit.promiseGapPp - 2);
  const inversionsImproved = liveReport.standardConsistency.inversionsCount < audit.inversionsCount;

  const noRegression = (afterTheil === null || beforeTheil === null || afterTheil <= beforeTheil + 0.02)
    && liveReport.counts.fringe <= audit.fringeCount
    && liveReport.standardConsistency.inversionsCount <= audit.inversionsCount;

  const improved = Boolean(noRegression && (theilImproved || fringeImproved || promisesImproved || inversionsImproved));
  const outcome = improved ? 1 : 0;
  const brier = typeof audit.predictedImprovementPct === 'number'
    ? round(((audit.predictedImprovementPct / 100) - outcome) ** 2, 4)
    : null;

  return {
    gradedOn: liveReport.today,
    gradedAt: nowIso,
    improved,
    withinTheilBefore: beforeTheil,
    withinTheilAfter: afterTheil,
    fringeBefore: audit.fringeCount,
    fringeAfter: liveReport.counts.fringe,
    promiseGapBeforePp: audit.promiseGapPp,
    promiseGapAfterPp: liveReport.promises.promiseGapPp,
    inversionsBefore: audit.inversionsCount,
    inversionsAfter: liveReport.standardConsistency.inversionsCount,
    brier,
    summary: improved
      ? 'Disparity or promise/standard gaps narrowed without regression on other parity dimensions.'
      : 'Disparity and standard gaps did not narrow across the audit window (or regressed on another dimension).',
  };
}

/* ------------------------------------------- signals, badge & no-name brief */

export const PARITY_SIGNAL_IDS = Object.freeze({
  FRINGE: 'PAR-01',
  DISPARITY: 'PAR-02',
  PROMISE: 'PAR-03',
  CONCERN_BAR: 'PAR-04',
  BENCH_REVIEW: 'PAR-05',
  STALE_AUDIT: 'PAR-06',
});

export function paritySignals(state, now = new Date(), settings = null) {
  const report = parityReport(state, now, settings);
  const out = [];

  if (report.counts.fringe > 0) {
    out.push({
      id: PARITY_SIGNAL_IDS.FRINGE,
      ruleId: PARITY_SIGNAL_IDS.FRINGE,
      domain: 'Leadership parity',
      severity: 4,
      confidence: 'high',
      title: `${report.counts.fringe} post-ramp team member(s) sit in the structural invisibility fringe`,
      detail: 'They have overdue or repeatedly skipped 1:1s, zero recorded SBI feedback, and zero stretch delegations or recognition inside the look-back window while peers receive multi-channel investment.',
      evidence: [`${report.counts.fringe} of ${report.counts.eligiblePostRamp} post-ramp people have zero feedback + zero stretch/recognition + weak 1:1 cadence over ${report.conventions.windowDays}d.`],
      action: { label: 'Open allocation & LMX', route: '#/parity?panel=allocation' },
    });
  }

  const concentrated = PARITY_CHANNEL_KEYS.map((k) => report.channels[k])
    .filter((c) => c.concentrated && (c.withinSharePct === null || c.withinSharePct >= 50));
  if (concentrated.length > 0) {
    const worst = [...concentrated].sort((a, b) => (b.giniPct || 0) - (a.giniPct || 0))[0];
    out.push({
      id: PARITY_SIGNAL_IDS.DISPARITY,
      ruleId: PARITY_SIGNAL_IDS.DISPARITY,
      domain: 'Leadership parity',
      severity: 3,
      confidence: 'medium',
      title: `Managerial capital is concentrated on ${concentrated.length} channel(s) — peak Gini ${worst.giniPct}% (${worst.label})`,
      detail: `${worst.withinSharePct}% of Theil entropy on ${worst.label.toLowerCase()} comes from unexplained within-cohort peer disparity rather than role/ramp variety.`,
      evidence: [`Corrected Gini ${worst.giniPct}% (warn floor ${report.conventions.giniWarnPct}%); T_within = ${worst.withinTheil}, T_between = ${worst.betweenTheil}.`],
      action: { label: 'Inspect Lorenz & Theil split', route: '#/parity?panel=allocation' },
    });
  }

  if (report.promises.asymmetric || report.promises.breachRows.length > 0) {
    out.push({
      id: PARITY_SIGNAL_IDS.PROMISE,
      ruleId: PARITY_SIGNAL_IDS.PROMISE,
      domain: 'Leadership parity',
      severity: 4,
      confidence: 'high',
      title: report.promises.asymmetric
        ? `Leader promise fulfillment varies by ${report.promises.promiseGapPp}pp across teammates`
        : `${report.promises.breachRows.length} report(s) carry repeated overdue or carried-forward leader promises`,
      detail: 'Psychological-contract reliability is asymmetric when some people get prompt follow-through while others wait on carried or overdue leader commitments.',
      evidence: [`Overall leader fulfillment ${report.promises.overallFulfillmentPct ?? '—'}%; spread ${report.promises.promiseGapPp ?? '—'}pp; ${report.promises.totalOverdueOpen} overdue open leader promise(s).`],
      action: { label: 'Open promise ledger', route: '#/parity?panel=promises' },
    });
  }

  if (report.standardConsistency.concerns.inconsistent) {
    const c = report.standardConsistency.concerns;
    out.push({
      id: PARITY_SIGNAL_IDS.CONCERN_BAR,
      ruleId: PARITY_SIGNAL_IDS.CONCERN_BAR,
      domain: 'Leadership parity',
      severity: 4,
      confidence: 'high',
      title: `Formal recovery plans were adopted at unequal evidentiary bars (${c.minObservations}–${c.maxObservations} observations)`,
      detail: c.overrideAsymmetry
        ? 'At least one formal plan bypassed the 6-rule procedural gate via written override while another met the full bar.'
        : 'Observation counts, two-way voice timing or assessment durations differ materially across adopted plans.',
      evidence: [`${c.adoptedCount} adopted plans; observation range ${c.obsRange}; override count ${c.overrideCount}/${c.adoptedCount}.`],
      action: { label: 'Audit standard consistency', route: '#/parity?panel=consistency' },
    });
  }

  if (report.standardConsistency.readiness.inversionCount > 0 || report.standardConsistency.reviews.discordantPairs.length > 0) {
    const r = report.standardConsistency.readiness;
    const rev = report.standardConsistency.reviews;
    out.push({
      id: PARITY_SIGNAL_IDS.BENCH_REVIEW,
      ruleId: PARITY_SIGNAL_IDS.BENCH_REVIEW,
      domain: 'Leadership parity',
      severity: 3,
      confidence: 'medium',
      title: `Evaluative bar inversion: ${r.haloNominations.length} halo nomination(s), ${r.overlookedBench.length} overlooked bench, ${rev.discordantPairs.length} discordant review pair(s)`,
      detail: 'Succession nominations or review ratings invert the workspace’s own recorded behavioural/delivery evidence within comparable cohorts.',
      evidence: [`Readiness inversions: ${r.inversionCount}; review discordant pairs: ${rev.discordantPairs.length}${rev.tauB !== null ? ` (Kendall τ_b = ${rev.tauB})` : ''}.`],
      action: { label: 'Compare recorded bars', route: '#/parity?panel=consistency' },
    });
  }

  const staleAudits = (state?.parityAudits || []).filter(
    (a) => a && a.status === 'frozen' && a.reviewOn && a.reviewOn <= report.today,
  );
  if (staleAudits.length > 0) {
    out.push({
      id: PARITY_SIGNAL_IDS.STALE_AUDIT,
      ruleId: PARITY_SIGNAL_IDS.STALE_AUDIT,
      domain: 'Leadership parity',
      severity: 3,
      confidence: 'high',
      title: `${staleAudits.length} frozen parity audit(s) reached their review date and await grading`,
      detail: 'Grade frozen parity commitments once their window closes so self-calibration stays honest.',
      evidence: [`Oldest due reviewOn: ${staleAudits.map((a) => a.reviewOn).sort()[0]}.`],
      action: { label: 'Grade due audit', route: '#/parity?panel=rebalance' },
    });
  }

  return out;
}

export function parityAttentionCount(state, now = new Date(), settings = null) {
  return paritySignals(state, now, settings).filter((s) => s.severity >= 3).length;
}

/**
 * Deterministic internal brief with zero employee names, person IDs or notes.
 */
export function parityBrief(state, now = new Date(), settings = null) {
  const r = parityReport(state, now, settings);
  const lines = [
    `Leadership Parity & Standard Consistency Brief — as of ${r.today}`,
    `Window: ${r.windowStart} to ${r.today} (${r.conventions.windowDays}d) · Active roster: ${r.counts.activePeople} (${r.counts.eligiblePostRamp} post-ramp, ${r.counts.rampProtected} ramp-protected <${r.conventions.rampFloorDays}d)`,
    '',
    '1. Multi-Channel LMX Allocation (Gini / Atkinson ε=0.5 / Theil T = T_between + T_within):',
  ];
  for (const key of PARITY_CHANNEL_KEYS) {
    const ch = r.channels[key];
    if (!ch.available) {
      lines.push(`   - ${ch.code} (${ch.label}): withheld — ${ch.reason}`);
    } else {
      lines.push(
        `   - ${ch.code} (${ch.label}): Gini ${ch.giniPct}% · Atkinson ${ch.atkinsonPct}% · Theil T=${ch.theil} (within ${ch.withinTheil} [${ch.withinSharePct}%], between ${ch.betweenTheil}) · zero-receipt=${ch.zeroCount}`,
      );
    }
  }
  lines.push(
    `   - Structural Fringe ("Invisible Zone") count: ${r.counts.fringe}`,
    '',
    '2. Leader Promise Reliability Ledger:',
    `   - Leader promises tracked: ${r.promises.totalPromises} (${r.promises.totalDue} due, ${r.promises.totalFulfilled} fulfilled, ${r.promises.totalOverdueOpen} overdue open)`,
    `   - Fulfillment rate: ${r.promises.overallFulfillmentPct !== null ? `${r.promises.overallFulfillmentPct}% (95% Wilson [${r.promises.overallWilsonLowPct}%, ${r.promises.overallWilsonHighPct}%])` : 'withheld (no due leader promises)'}`,
    `   - Cross-person fulfillment spread: ${r.promises.promiseGapPp !== null ? `${r.promises.promiseGapPp}pp` : 'withheld (<2 people with ≥2 due promises)'}`,
    '',
    '3. Intra-Leader Standard Consistency:',
    `   - Recovery plan bars: ${r.standardConsistency.concerns.available ? `${r.standardConsistency.concerns.adoptedCount} plans, obs range ${r.standardConsistency.concerns.obsRange}, overrides ${r.standardConsistency.concerns.overrideCount}` : r.standardConsistency.concerns.reason}`,
    `   - Succession vs behavioural evidence: ${r.standardConsistency.readiness.available ? `${r.standardConsistency.readiness.haloNominations.length} halo, ${r.standardConsistency.readiness.overlookedBench.length} overlooked bench` : r.standardConsistency.readiness.reason}`,
    `   - Review concordance: ${r.standardConsistency.reviews.available ? `Kendall τ_b = ${r.standardConsistency.reviews.tauB}, discordant pairs = ${r.standardConsistency.reviews.discordantPairs.length}` : r.standardConsistency.reviews.reason}`,
    '',
    'Scope & limits: grades leader allocation, leader promises and process bars only; zero employee ratings; zero protected-class inference; not legal advice.',
  );
  return lines.join('\n');
}
