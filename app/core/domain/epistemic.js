/**
 * app/core/domain/epistemic.js — the Epistemic Ledger engine (`#/epistemic`,
 * Schema v105, ADR-0103).
 *
 * Pure: no DOM, no storage, no wall-clock globals, no unseeded randomness. Every
 * function that needs today takes `now`. Every figure the screen prints is
 * derived here, so a view can never invent one.
 *
 * THREE COMPUTATIONS
 * ------------------
 *  1. THE LEDGER OF UNKNOWNS. The record is read, not surveyed. Every DANGER
 *     signal (a constructive feedback follow-up nobody closed, a risk case
 *     ageing in the open, a performance concern that stopped moving), every
 *     DEFECT signal (a breached premise, an at-risk or overdue goal, an overdue
 *     delegation, a decision whose recorded outcome was bad) and every
 *     OPPORTUNITY signal (a finished goal nobody recognised, a closed case
 *     nobody learned from) becomes one UNKNOWN with a declared, evidence-bound
 *     expiry. Each carries the record it came from, the span that owns it and
 *     one `rolls-up-to` edge per leadership ancestor — so a missing signal is
 *     visible ABOVE the span that missed it in the same transaction.
 *
 *  2. THE OVERCONFIDENCE INDEX. A leader declares what they believe about work
 *     whose outcome is not yet on the record. Later the record supplies the
 *     outcome. Four cells follow, and four statistics follow the cells:
 *     Cohen's (1960) kappa, its normal-approximation z, Byrt–Bishop–Carlin's
 *     prevalence and bias indices (McKenna & Myers 1997), and the prevalence-
 *     adjusted bias-adjusted kappa (PABAK; Feinstein & Cicchetti 1990), which
 *     exists because raw kappa collapses when outcomes are rare. The terminal
 *     reads the DIRECTION — an optimism gap is handed up, underconfidence is
 *     handed down — and refuses the whole reading when one cell carries the
 *     table, because a kappa computed there is a prior wearing a decimal point.
 *
 *  3. THE IMPLIED LEDGER. The shared spine already writes a `rolls-up-to` edge
 *     from every open work record to each leadership ancestor (ADR-0076).
 *     Coverage per blind class is therefore an exact ratio over the records
 *     this workspace holds: measurable activity below the span against activity
 *     that actually produced an arriving edge. Where nothing arrived in the
 *     window the rule of three (Hanley & Lippman-Hand 1983) bounds the rate
 *     instead of printing a zero. The uncertainty that remains is RECORD
 *     COMPLETENESS — work nobody logged is invisible to this or any arithmetic —
 *     and the screen says that in the same sentence it prints the number.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never asks for a sentiment score, and it never treats agreement as
 *    accuracy.
 *  - It never closes an unknown because time passed. Expiry escalates.
 *  - It never rates, ranks or names a person; above director rank the roll-up is
 *    counts by altitude.
 *  - It never prints a refused rate, a suppressed cell or a kappa below its
 *    floor, and an averaged index is never substituted for two indices that
 *    disagree.
 */

import { addDays, dayKey, daysBetween, round, weekKey } from '../time.js';
import { buildSeats, activeSeat } from './seat.js';
import { buildChain, responsibleNodeId, readPath } from './chain.js';
import { LEADER_ID } from './chain.js';
import {
  BELIEF_CELLS,
  BLIND_BANDS,
  BLIND_CLASSES,
  BLIND_CLASS_KEYS,
  CALIBRATION_VERDICTS,
  EPISTEMIC_DEFAULTS,
  EPISTEMIC_DISCLOSURE,
  EPISTEMIC_ENGINE_VERSION,
  EPISTEMIC_LIMITS,
  EPISTEMIC_PLAYBOOK,
  EPISTEMIC_PREMISE,
  SIGNAL_DISCIPLINES,
  UNKNOWN_KINDS,
  UNKNOWN_KIND_KEYS,
  UNKNOWN_STATES,
  harvestedUnknownId,
} from './epistemicRegistry.js';
import { epistemicConventions } from './epistemicSchema.js';

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

function asDay(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  return null;
}

function dayOf(record, ...fields) {
  for (const field of fields) {
    const value = asDay(record?.[field]);
    if (value) return value;
  }
  return null;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

/* ------------------------------------------------------------------ */
/* Statistics — named, exact, exported so they can be checked by hand */
/* ------------------------------------------------------------------ */

/**
 * Wilson (1927) score interval for a proportion. Returns percentages so the
 * screen never has to convert, and `null` for an empty denominator rather than
 * a reassuring 0%.
 */
export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const pct = (value) => round(clamp(value, 0, 1) * 100, 1);
  return { pct: pct(p), lowPct: pct(Math.max(0, centre - halfWidth)), highPct: pct(Math.min(1, centre + halfWidth)) };
}

/** erf, Abramowitz & Stegun 7.1.26 (|ε| < 1.5e-7). Kept local: no imports. */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Two-sided normal p. Used only for kappa's z, and printed beside the z. */
export function normalTwoSidedP(z) {
  if (!Number.isFinite(z)) return null;
  return round3(clamp(2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2))), 0, 1));
}

/**
 * The rule of three (Hanley & Lippman-Hand 1983): with zero events observed in
 * n opportunities, the 95% upper bound on the rate is 3/n. Applied here to
 * DAYS: zero arrivals in w days bounds the arrival rate at 3/w per day. It is
 * the honest replacement for printing a zero.
 */
export function ruleOfThree(arrivalN, windowDays) {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return null;
  if (arrivalN > 0) return null;
  return round((3 / windowDays) * 30, 3); // per 30 days, for readability
}

/**
 * Cohen's (1960) kappa on the belief × record 2×2.
 *
 *   a = agreedOk    said fine, was fine
 *   b = optimism    said fine, was not      (belief ran ahead)
 *   c = pessimism   said not fine, was fine (belief ran behind)
 *   d = agreedBad   said not fine, was not
 *
 * `refused` is not a courtesy — with one cell carrying the table, κ is undefined
 * or degenerate, and printing it anyway is the error Cook (2005) catalogues.
 */
export function cohenKappa({ agreedOk = 0, optimism = 0, pessimism = 0, agreedBad = 0 } = {}, { pairFloor = 8 } = {}) {
  const a = Math.max(0, agreedOk);
  const b = Math.max(0, optimism);
  const c = Math.max(0, pessimism);
  const d = Math.max(0, agreedBad);
  const n = a + b + c + d;
  const cells = { agreedOk: a, optimism: b, pessimism: c, agreedBad: d };
  if (n < pairFloor) {
    return {
      ...cells, n, refused: true, kappa: null, pabak: null, prevalenceIndex: null, biasIndex: null, z: null, p: null,
      reason: `Only ${n} paired belief(s) have a resolved outcome in scope — below the declared floor of ${pairFloor}. At this sample every pattern looks like a finding.`,
    };
  }
  // A table where every pair sits in one cell has no marginal variation to
  // divide by: pe = 1 and both kappa and PABAK are degenerate (PABAK = 1 by
  // construction, which would read as perfect calibration and is the opposite
  // of the truth). Refuse it explicitly.
  if (a + b === 0 || a + c === 0 || c + d === 0 || b + d === 0) {
    return {
      ...cells, n, refused: true, kappa: null, pabak: null, prevalenceIndex: null, biasIndex: null, z: null, p: null,
      reason: `Every one of the ${n} paired belief(s) sits in one cell, so the table has no variation to measure. One cell carrying the table is a finding about the sample, not a calibration.`,
    };
  }
  const po = (a + d) / n;
  const pe = (((a + b) * (a + c)) + ((c + d) * (b + d))) / (n * n);
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe);
  const pabak = 2 * po - 1;
  const prevalenceIndex = (a - d) / n;
  const biasIndex = (b - c) / n;
  const se = pe === 1 ? null : Math.sqrt((po * (1 - po)) / (n * (1 - pe) * (1 - pe)));
  const z = se ? kappa / se : null;
  return {
    ...cells,
    n,
    po: round3(po),
    pe: round3(pe),
    pabak: round3(pabak),
    kappa: round3(kappa),
    prevalenceIndex: round3(prevalenceIndex),
    biasIndex: round3(biasIndex),
    z: round3(z),
    p: normalTwoSidedP(z),
    refused: false,
    reason: '',
  };
}

/**
 * The verdict, from the DIRECTION of the two indices — never from an average of
 * them. A positive bias index means the belief ran ahead of the record.
 */
export function calibrationVerdict(kappa, { conventions }) {
  if (!kappa || kappa.refused) {
    return { ...CALIBRATION_VERDICTS.refused, reason: kappa?.reason || 'The table cannot support a reading.' };
  }
  const band = Math.max(0.05, (1 - conventions.epistemicBlindFloor / 100) / 2);
  const bias = kappa.biasIndex;
  const sign = (value) => (value > band ? 1 : value < -band ? -1 : 0);
  const biasSign = sign(bias);
  const prevalenceSign = sign(kappa.prevalenceIndex);
  // Optimism needs BOTH conditions: the belief over-predicts good outcomes
  // (bias > band) and there WERE good outcomes to over-predict (prevalence > 0).
  if (biasSign > 0 && prevalenceSign > 0) {
    return {
      ...CALIBRATION_VERDICTS.optimism,
      reason: `${kappa.b} belief(s) said fine when the record later said otherwise, against ${kappa.c} the other way — the belief runs ahead of the record, and the record has good outcomes for it to have been right about.`,
    };
  }
  if (biasSign < 0 && prevalenceSign < 0) {
    return {
      ...CALIBRATION_VERDICTS.optimism,
      reason: `${kappa.c} belief(s) said fine when the record later said otherwise, against ${kappa.b} the other way. Read with care: the outcomes here are mostly bad, so the belief is running ahead of a record that is itself deteriorating.`,
    };
  }
  if (biasSign < 0 && prevalenceSign > 0) {
    return {
      ...CALIBRATION_VERDICTS.underconfidence,
      reason: `${kappa.c} belief(s) predicted trouble that did not arrive, against ${kappa.b} the other way. The record is better than the belief — a visibility problem owned by this span, not by the span above it.`,
    };
  }
  if (biasSign === 0 && Math.abs(kappa.kappa ?? 0) < 0.2) {
    return { ...CALIBRATION_VERDICTS['no-signal'], reason: 'The bias index sits inside the declared band, so no direction is claimed even where agreement is low.' };
  }
  return {
    ...CALIBRATION_VERDICTS.calibrated,
    reason: `Bias index ${kappa.biasIndex} sits inside the declared ±${round(band, 2)} band at ${kappa.n} paired beliefs. The honest reading is "no gap measured", never "accurate".`,
  };
}

/* ------------------------------------------------------------------ */
/* 1. The harvest                                                      */
/* ------------------------------------------------------------------ */

/** Record types the spike already knows how to date and attribute. */
const SIGNAL_DEFS = Object.freeze([
  { key: 'feedback-unclosed', collection: 'feedback', className: 'danger', discipline: 'people' },
  { key: 'case-ageing', collection: 'cases', className: 'danger', discipline: 'operations' },
  { key: 'concern-stalled', collection: 'performanceConcerns', className: 'danger', discipline: 'people' },
  { key: 'premise-breached', collection: 'premises', className: 'defect', discipline: 'strategy' },
  { key: 'goal-at-risk', collection: 'goals', className: 'defect', discipline: 'operations' },
  { key: 'delegation-overdue', collection: 'delegations', className: 'defect', discipline: 'operations' },
  { key: 'decision-bad-outcome', collection: 'decisions', className: 'defect', discipline: 'engineering' },
  { key: 'escalation-absorbed', collection: 'escalationRecords', className: 'defect', discipline: 'politics' },
  { key: 'goal-unrecognised', collection: 'goals', className: 'opportunity', discipline: 'people' },
  { key: 'case-closed-unlearned', collection: 'cases', className: 'opportunity', discipline: 'engineering' },
  { key: 'recognition-quiet', collection: 'recognition', className: 'opportunity', discipline: 'people' },
]);

/** The disciplines the workspace's own records can actually evidence. */
export const EVIDENCED_DISCIPLINES = Object.freeze(['people', 'operations', 'strategy', 'engineering', 'politics']);

function personIdsOf(source, record) {
  if (!record) return [];
  if (source === 'feedback' || source === 'performanceConcerns' || source === 'recognition') {
    return record.personId ? [record.personId] : [];
  }
  if (source === 'goals') return record.ownerId ? [record.ownerId] : [];
  if (source === 'delegations') return record.personId ? [record.personId] : [];
  if (source === 'cases') return [record.ownerId, ...(Array.isArray(record.involvedPersonIds) ? record.involvedPersonIds : [])].filter(Boolean);
  return [];
}

function routeOf(source, record) {
  if (source === 'feedback') return `#/feedback?person=${encodeURIComponent(record.personId || '')}&item=${encodeURIComponent(record.id)}`;
  if (source === 'cases') return `#/cases?case=${encodeURIComponent(record.id)}`;
  if (source === 'premises') return `#/premises?premise=${encodeURIComponent(record.id)}`;
  if (source === 'goals') return `#/goals?goal=${encodeURIComponent(record.id)}`;
  if (source === 'delegations') return `#/delegations?delegation=${encodeURIComponent(record.id)}`;
  if (source === 'decisions') return `#/decisions?decision=${encodeURIComponent(record.id)}`;
  if (source === 'performanceConcerns') return '#/performance';
  if (source === 'escalationRecords') return '#/escalation';
  if (source === 'recognition') return `#/recognition?item=${encodeURIComponent(record.id)}`;
  return '#/epistemic';
}

/**
 * Harvest every signal the record already holds, inside the declared window.
 * A signal is included only when its own record says it is unaddressed; the
 * module never guesses that something is wrong from a title or a word.
 */
export function harvestSignals(state, { now = new Date(), settings = null } = {}) {
  const conventions = epistemicConventions(settings || state?.settings || {});
  const today = dayKey(now);
  const from = addDays(today, -conventions.epistemicWindowDays);
  const out = [];
  /**
   * `live` signals describe a condition the record says is TRUE RIGHT NOW — an
   * open case, an overdue delegation, a breached premise. They are never dropped
   * for being old: a two-year-old case nobody read is a worse finding than last
   * week's, not an irrelevant one, and their declared expiry therefore counts
   * from the day the ledger NOTICED them rather than from the day they began.
   * Closed and opportunity signals are historical: for those the window decides
   * what is still worth reading.
   */
  const push = ({ signalKey, className, discipline, sourceType, sourceId, title, evidencesOn, evidenceClass, severity, people, route, beliefHint, live = true }) => {
    const day = asDay(evidencesOn);
    if (!day || day > today) return;
    if (!live && day < from) return;
    out.push({
      signalKey, className, discipline, sourceType, sourceId,
      title: String(title || '').slice(0, EPISTEMIC_LIMITS.titleChars),
      evidencesOn: day,
      expiresOn: live ? addDays(today, conventions.epistemicExpiryDays) : addDays(day, conventions.epistemicExpiryDays),
      evidenceClass,
      severity: clamp(Math.round(severity), 1, 3),
      people: [...new Set((people || []).filter(Boolean))],
      route,
      beliefHint: Boolean(beliefHint),
    });
  };

  const rows = (collection) => (Array.isArray(state?.[collection]) ? state[collection] : []);

  // DANGER — a signal the record itself flags and nobody has closed.
  for (const item of rows('feedback')) {
    if (!item || item.direction !== 'given' || item.kind !== 'constructive') continue;
    if (!item.followUpOn || item.followUpDone === true) continue;
    if (item.followUpOn > today) continue;
    push({
      signalKey: 'feedback-unclosed', className: 'danger', discipline: 'people',
      sourceType: 'feedback', sourceId: item.id,
      title: `A constructive conversation from ${item.date} has an unclosed follow-up due ${item.followUpOn}`,
      evidencesOn: item.followUpOn, evidenceClass: 'people', severity: 2,
      people: personIdsOf('feedback', item), route: routeOf('feedback', item), beliefHint: true,
    });
  }
  for (const item of rows('cases')) {
    if (!item || !['open', 'mitigating'].includes(item.status)) continue;
    const openedOn = dayOf(item, 'openedOn', 'createdAt');
    const age = daysBetween(openedOn, today);
    if (age === null || age < 14) continue;
    const fmeaSeverity = Number(readPath(item, 'fmea.severity'));
    const severity = Number.isFinite(fmeaSeverity) && fmeaSeverity >= 7 ? 3 : Number.isFinite(fmeaSeverity) && fmeaSeverity >= 4 ? 2 : 1;
    push({
      signalKey: 'case-ageing', className: 'danger', discipline: 'operations',
      sourceType: 'case', sourceId: item.id,
      title: `A ${item.kind || 'risk'} case has been ${item.status} for ${age} day(s)`,
      evidencesOn: openedOn, evidenceClass: 'operations', severity,
      people: personIdsOf('cases', item), route: routeOf('cases', item), beliefHint: true,
    });
  }
  for (const item of rows('performanceConcerns')) {
    if (!item || !['assessing', 'plan'].includes(item.status)) continue;
    const openedOn = dayOf(item, 'openedOn');
    const age = daysBetween(openedOn, today);
    if (age === null || age < 21) continue;
    // The person is deliberately not named in the title: the signal is about a
    // conversation that is not happening, and naming it here would create a
    // second, unsanctioned record of someone's difficulty.
    push({
      signalKey: 'concern-stalled', className: 'danger', discipline: 'people',
      sourceType: 'person', sourceId: item.personId || item.id,
      title: `A performance conversation registered ${age} day(s) ago has not moved past “${item.status}”`,
      evidencesOn: openedOn, evidenceClass: 'people', severity: 3,
      people: personIdsOf('performanceConcerns', item), route: '#/performance', beliefHint: true,
    });
  }

  // DEFECT — the record commits to something and shows it did not land.
  for (const item of rows('premises')) {
    // The stored STATE is derived by the Premise Sentinel from the evidence it
    // holds; only a human DISPOSITION is authoritative. A premise a human judged
    // 'breached' and a premise whose evidence currently reads 'breached' are the
    // same finding for this ledger, and both are taken from the record as it is.
    if (!item) continue;
    const breached = item.status === 'breached';
    if (!breached) continue;
    const on = dayOf(item, 'lastReviewedOn', 'updatedAt', 'createdAt');
    push({
      signalKey: 'premise-breached', className: 'defect', discipline: 'strategy',
      sourceType: 'premise', sourceId: item.id,
      title: `A ${item.criticality || 'major'} premise is breached and nobody has re-opened the decision it underwrites`,
      evidencesOn: on, evidenceClass: 'strategy', severity: item.criticality === 'load-bearing' ? 3 : 2,
      people: [], route: routeOf('premises', item), beliefHint: true,
    });
  }
  for (const item of rows('goals')) {
    if (!item) continue;
    if (item.status === 'active') {
      const atRisk = ['at-risk', 'off-track'].includes(item.confidence);
      const overdueDays = item.dueDate ? daysBetween(item.dueDate, today) : null;
      if (!atRisk && !(overdueDays !== null && overdueDays > 7)) continue;
      push({
        signalKey: 'goal-at-risk', className: 'defect', discipline: 'operations',
        sourceType: 'goal', sourceId: item.id,
        title: overdueDays !== null && overdueDays > 7
          ? `A goal is ${overdueDays} day(s) past its own date and still “${item.confidence || 'on-track'}”`
          : `A goal is marked “${item.confidence}” and no recovery decision exists`,
        evidencesOn: dayOf(item, 'createdAt'), evidenceClass: 'operations', severity: atRisk ? 2 : 1,
        people: personIdsOf('goals', item), route: routeOf('goals', item), beliefHint: true,
      });
      continue;
    }
    if (item.status === 'done' && item.completedOn) {
      // OPPORTUNITY: the work landed and no named contribution followed inside
      // the declared window. Recency is the point — this closes by an act.
      const recognition = rows('recognition').some((r) => r && r.personId && item.ownerId && r.personId === item.ownerId
        && asDay(r.date) && asDay(r.date) >= item.completedOn);
      if (recognition || !item.ownerId) continue;
      push({
        signalKey: 'goal-unrecognised', className: 'opportunity', discipline: 'people',
        sourceType: 'goal', sourceId: item.id,
        title: 'A goal finished and nobody named the contribution',
        evidencesOn: item.completedOn, evidenceClass: 'people', severity: 1,
        people: personIdsOf('goals', item), route: routeOf('goals', item), beliefHint: false,
      });
    }
  }
  for (const item of rows('delegations')) {
    if (!item || item.status !== 'active' || !item.dueOn) continue;
    const overdueDays = daysBetween(item.dueOn, today);
    if (overdueDays === null || overdueDays <= 0) continue;
    push({
      signalKey: 'delegation-overdue', className: 'defect', discipline: 'operations',
      sourceType: 'delegation', sourceId: item.id,
      title: `Delegated work is ${overdueDays} day(s) past its due date with no check-in recorded`,
      evidencesOn: item.dueOn, evidenceClass: 'operations', severity: overdueDays > 14 ? 3 : 2,
      people: personIdsOf('delegations', item), route: routeOf('delegations', item), beliefHint: true,
    });
  }
  for (const item of rows('decisions')) {
    if (!item || item.outcome !== 'bad') continue;
    const on = dayOf(item, 'reviewedOn', 'decidedOn', 'date');
    push({
      signalKey: 'decision-bad-outcome', className: 'defect', discipline: 'engineering',
      sourceType: 'decision', sourceId: item.id,
      title: 'A decision recorded a bad outcome and the root cause is not on the record',
      evidencesOn: on, evidenceClass: 'engineering', severity: 2,
      people: [], route: routeOf('decisions', item), beliefHint: false,
    });
  }
  for (const item of rows('escalationRecords')) {
    if (!item || item.disposition !== 'absorbed') continue;
    const on = dayOf(item, 'decidedOn', 'loggedOn', 'createdAt');
    push({
      signalKey: 'escalation-absorbed', className: 'defect', discipline: 'politics',
      sourceType: 'escalationrecord', sourceId: item.id,
      title: `Work absorbed at ${item.fromSeatId || 'a span'} for “${item.reasonKey || 'an undisclosed reason'}” — never tested against the span above`,
      evidencesOn: on, evidenceClass: 'politics', severity: 2,
      people: [], route: '#/escalation', beliefHint: false,
    });
  }

  // OPPORTUNITY — an asset the record shows and nobody acted on.
  for (const item of rows('cases')) {
    if (!item || !['resolved', 'closed'].includes(item.status) || !item.resolvedOn) continue;
    const age = daysBetween(item.resolvedOn, today);
    // Only while the artifact is still recent enough for a lesson to be worth
    // writing: a twelve-month-old closure is history, not an opportunity.
    if (age === null || age > 30) continue;
    push({
      signalKey: 'case-closed-unlearned', className: 'opportunity', discipline: 'engineering',
      sourceType: 'case', sourceId: item.id,
      title: 'A case closed recently and no lesson was recorded from it',
      evidencesOn: item.resolvedOn, evidenceClass: 'engineering', severity: 1,
      people: personIdsOf('cases', item), route: routeOf('cases', item), beliefHint: false, live: false,
    });
  }
  for (const person of rows('people')) {
    if (!person || person.status === 'archived') continue;
    const recent = rows('recognition').some((r) => r && r.personId === person.id && asDay(r.date) && daysBetween(asDay(r.date), today) !== null
      && daysBetween(asDay(r.date), today) <= 60);
    if (recent) continue;
    const startedOn = dayOf(person, 'startDate', 'createdAt');
    const tenure = daysBetween(startedOn, today);
    if (tenure === null || tenure < 90) continue;
    push({
      signalKey: 'recognition-quiet', className: 'opportunity', discipline: 'people',
      sourceType: 'person', sourceId: person.id,
      title: 'Ninety days of tenure and no contribution has been named on the record',
      evidencesOn: today, evidenceClass: 'people', severity: 1,
      people: [person.id], route: `#/people?person=${encodeURIComponent(person.id)}`, beliefHint: false, live: false,
    });
  }

  // Deterministic order: newest evidence first, then a stable id tiebreak, so a
  // rescan of an unchanged record produces the same ledger in the same order.
  return out.sort((a, b) => String(b.evidencesOn).localeCompare(String(a.evidencesOn))
    || a.className.localeCompare(b.className)
    || String(a.sourceType).localeCompare(String(b.sourceType))
    || String(a.sourceId).localeCompare(String(b.sourceId)));
}

/** Which declared evidence classes produced nothing inside the window. */
export function blindInstruments(signals = []) {
  const seen = new Set(signals.map((signal) => signal.evidenceClass).filter(Boolean));
  return EVIDENCED_DISCIPLINES.map((key) => ({
    key,
    label: SIGNAL_DISCIPLINES[key] ? key : key,
    discipline: SIGNAL_DISCIPLINES[key] || '',
    evidenceN: signals.filter((signal) => signal.evidenceClass === key).length,
    blind: !seen.has(key),
  }));
}

/* ------------------------------------------------------------------ */
/* 2. Beliefs against the record                                       */
/* ------------------------------------------------------------------ */

const RESOLVED_OUTCOME = Object.freeze({
  /** true = the record says it went well, false = it did not, null = not resolved. */
  decision: (record) => (record.outcome === 'good' ? true : record.outcome === 'bad' || record.outcome === 'mixed' ? false : null),
  goal: (record) => (record.status === 'done' ? true : record.status === 'dropped' ? false : null),
  case: (record) => (['resolved', 'closed'].includes(record.status) ? true : null),
  premise: (record) => (['supported', 'reaffirmed'].includes(record.status) ? true : record.status === 'breached' ? false : null),
  delegation: (record) => (record.status === 'done' ? true : record.status === 'returned' ? false : null),
});

/** One subject's own resolved outcome, read from its record. Never inferred. */
export function outcomeOfSubject(state, pair) {
  const resolver = RESOLVED_OUTCOME[pair?.subjectType];
  if (!resolver) return null;
  const collection = { decision: 'decisions', goal: 'goals', case: 'cases', premise: 'premises', delegation: 'delegations' }[pair.subjectType];
  if (!collection) return null;
  const record = (Array.isArray(state?.[collection]) ? state[collection] : []).find((row) => row && row.id === pair.subjectId);
  if (!record) return null;
  const value = resolver(record);
  return value === null || value === undefined ? null : value;
}

/**
 * Score one frozen observation against the record as it stands now. A pair whose
 * subject has no resolved outcome is `unpaired` and enters no cell — a belief
 * about work still in flight is not yet right or wrong.
 *
 * A pair that resolved on or before the day it was declared is dropped: that is
 * not a prediction, it is a memory, and charging it as foresight would be the
 * exact error the hindsight lock exists to refuse.
 */
export function scoreObservation(state, observation) {
  const cells = { agreedOk: 0, optimism: 0, pessimism: 0, agreedBad: 0 };
  let unpairedN = 0;
  let backdatedN = 0;
  for (const pair of observation?.pairs || []) {
    const truth = outcomeOfSubject(state, pair);
    if (truth === null) {
      unpairedN += 1;
      continue;
    }
    if (pair.declaredOn && observation.declaredOn && pair.declaredOn < observation.declaredOn) {
      // The pair was frozen into the set but dated BEFORE the declaration. That
      // is not a prediction; the schema refuses it at write time, and the reader
      // counts it here rather than crediting it as foresight.
      backdatedN += 1;
      continue;
    }
    const same = pair.belief === truth;
    if (same && truth) cells.agreedOk += 1;
    else if (same && !truth) cells.agreedBad += 1;
    else if (pair.belief && !truth) cells.optimism += 1;
    else cells.pessimism += 1;
  }
  return { cells, unpairedN, backdatedN, pairedN: cells.agreedOk + cells.optimism + cells.pessimism + cells.agreedBad };
}

/* ------------------------------------------------------------------ */
/* 3. The implied ledger                                               */
/* ------------------------------------------------------------------ */

/** Which collections and predicates count as measurable activity per class. */
const BLIND_SOURCES = Object.freeze({
  danger: Object.freeze({ collections: ['feedback', 'cases'], predicate: (type, record) => (type === 'feedback'
    ? record.direction === 'given' && record.kind === 'constructive'
    : ['open', 'mitigating'].includes(record.status)), dateFields: ['followUpOn', 'openedOn', 'createdAt'] }),
  delivery: Object.freeze({ collections: ['goals', 'delegations'], predicate: (type, record) => (type === 'goals'
    ? record.status === 'done'
    : record.status === 'done'), dateFields: ['completedOn'] }),
  people: Object.freeze({ collections: ['oneOnOnes', 'feedback'], predicate: (type) => (type === 'oneOnOnes'
    ? true : true), dateFields: ['date'] }),
  decisions: Object.freeze({ collections: ['decisions'], predicate: (type, record) => Boolean(record.chosen), dateFields: ['decidedOn', 'date'] }),
  strategy: Object.freeze({ collections: ['premises'], predicate: () => true, dateFields: ['createdAt'] }),
  repair: Object.freeze({ collections: ['cases'], predicate: (type, record) => ['resolved', 'closed'].includes(record.status), dateFields: ['resolvedOn'] }),
});

const LINK_TYPE_OF = Object.freeze({
  feedback: 'feedback', cases: 'case', goals: 'goal', delegations: 'delegation',
  decisions: 'decision', premises: 'premise', oneOnOnes: 'oneonone',
});

function coverageBand(pct, conventions) {
  if (pct === null) return BLIND_BANDS[0];
  const band = BLIND_BANDS.find((row, index) => (index === BLIND_BANDS.length - 1 ? true : pct >= row.min * 100));
  // The two convention-driven bands override the declared defaults so a
  // director can move them without editing code.
  if (pct <= conventions.epistemicBlindDarkPct) return BLIND_BANDS[3];
  if (pct < conventions.epistemicBlindFloor) return BLIND_BANDS[2];
  if (pct < 85) return BLIND_BANDS[1];
  return band && band.key === 'none' ? band : BLIND_BANDS[0];
}

/**
 * The implied ledger: for one seat and one class, the exact ratio of measurable
 * activity below the span that actually produced an arriving `rolls-up-to` edge.
 * Everything here is a statement about the span's information system.
 */
export function blindReading(state, { built, seatId, className, now, settings }) {
  const conventions = epistemicConventions(settings);
  const source = BLIND_SOURCES[className];
  if (!source) return null;
  const today = dayKey(now);
  const from = addDays(today, -conventions.epistemicWindowDays);
  const chain = built.chain;
  const edges = (Array.isArray(state?.links) ? state.links : [])
    .filter((edge) => edge && edge.relation === 'rolls-up-to' && edge.targetType === 'person' && edge.targetId === seatId)
    .filter((edge) => !String(edge.ruleId || '').startsWith('RULE-EPI'))
    .filter((edge) => !String(edge.ruleId || '').startsWith('RULE-SEAT-02'));
  const arrived = new Set(edges.map((edge) => `${edge.sourceType}:${edge.sourceId}`));

  let expectedN = 0;
  let arrivedN = 0;
  const expected = [];
  for (const collection of source.collections) {
    for (const record of (Array.isArray(state?.[collection]) ? state[collection] : [])) {
      if (!record || !record.id) continue;
      if (!source.predicate(collection, record)) continue;
      const on = dayOf(record, ...source.dateFields);
      if (!on || on < from || on > today) continue;
      const owner = responsibleNodeId(chain, personIdsOf(collection === 'oneOnOnes' ? 'feedback' : collection, record));
      if (!owner) continue;
      // "Below the span" includes the span itself: a manager's own closed work
      // is measurable activity the manager may or may not be reading.
      const inside = owner !== LEADER_ID && (owner === seatId || built.byId.get(seatId)?.scope?.has(owner));
      if (!inside) continue;
      expectedN += 1;
      expected.push({ collection, id: record.id, on });
      if (arrived.has(`${LINK_TYPE_OF[collection] || collection}:${record.id}`)) arrivedN += 1;
    }
  }
  const refused = expectedN < conventions.epistemicCellFloor;
  const pct = refused ? null : round((arrivedN / expectedN) * 100, 1);
  const band = refused ? BLIND_BANDS[0] : coverageBand(pct, conventions);
  return {
    className,
    label: BLIND_CLASSES[className].label,
    question: BLIND_CLASSES[className].question,
    expectedN,
    arrivedN,
    silentN: Math.max(0, expectedN - arrivedN),
    coveragePct: pct,
    band: refused ? { ...BLIND_BANDS[0], key: 'refused', label: 'Not measurable', tone: 'neutral', meaning: `Only ${expectedN} measurable record(s) below this span carry a date inside the window — below the declared cell floor of ${conventions.epistemicCellFloor}. Silence over three records is not a blind class.` } : band,
    refused,
    refusedReason: refused ? `Only ${expectedN} measurable record(s) in the window (floor ${conventions.epistemicCellFloor}).` : '',
    zeroArrivalRateUpper: ruleOfThree(arrivedN, conventions.epistemicWindowDays),
  };
}

/* ------------------------------------------------------------------ */
/* The whole terminal                                                  */
/* ------------------------------------------------------------------ */

function inScope(seat, seatId) {
  if (!seat) return true;
  if (!seatId) return false;
  if (seat.fullAccess) return true;
  return seatId === seat.id || (seat.scope && seat.scope.has(seatId));
}

function emptyState(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function seatForPeople(built, people) {
  const chain = built.chain;
  const nodeId = responsibleNodeId(chain, people);
  if (nodeId === LEADER_ID) return { seatId: null, altitudeKey: 'chief', rank: 5 };
  const seat = built.byId.get(nodeId);
  if (!seat) return { seatId: null, altitudeKey: 'chief', rank: 5 };
  return { seatId: seat.id, altitudeKey: seat.altitudeKey, rank: seat.rank };
}

/**
 * The whole terminal, scoped to the active seat. Every list is derived; nothing
 * here is persisted except the unknowns a human declared and the beliefs a human
 * froze.
 */
export function buildEpistemicReport(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const conventions = epistemicConventions(effective);
  const built = buildSeats(state, { now, settings: effective });
  const seat = activeSeat(built);
  const today = dayKey(now);
  const signals = harvestSignals(state, { now, settings: effective });

  /* ---------------------------------------------------- the ledger */
  const stored = Array.isArray(state?.epistemicUnknowns) ? state.epistemicUnknowns : [];
  const scopedStored = stored.filter((row) => inScope(seat, row.ownerSeatId));
  const storedBySignal = new Map();
  for (const row of scopedStored) {
    const key = row.origin === 'declared'
      ? `declared:${row.id}`
      : `${row.sourceType}:${row.sourceId}|${row.signalKey || ''}`;
    storedBySignal.set(key, row);
  }

  const ledger = [];
  for (const signal of signals) {
    const key = `${signal.sourceType}:${signal.sourceId}|${signal.signalKey}`;
    const existing = storedBySignal.get(key) || null;
    const owner = existing ? { seatId: existing.ownerSeatId, altitudeKey: existing.altitudeKey, rank: existing.rank } : seatForPeople(built, signal.people);
    if (!inScope(seat, owner.seatId)) continue;
    const ageDays = daysBetween(signal.evidencesOn, today);
    const lifecycle = existing ? existing.state : 'unopened';
    const escalated = !existing || existing.state === 'unopened'
      ? (ageDays ?? 0) >= conventions.epistemicEscalateDays
      : false;
    const expired = existing
      ? existing.state === 'expired'
      : Boolean(signal.expiresOn && signal.expiresOn < today);
    ledger.push({
      key,
      id: existing ? existing.id : harvestedUnknownId(signal.className, signal.sourceType, signal.sourceId),
      title: existing ? existing.title : signal.title,
      className: existing ? existing.className : signal.className,
      discipline: signal.discipline,
      signalKey: signal.signalKey,
      sourceType: signal.sourceType,
      sourceId: signal.sourceId,
      route: signal.route,
      ownerSeatId: owner.seatId,
      ownerName: owner.seatId ? (built.byId.get(owner.seatId)?.name || '') : 'the whole workspace',
      altitudeKey: owner.altitudeKey,
      rank: owner.rank,
      harvestedOn: existing ? existing.harvestedOn : signal.evidencesOn,
      evidencesOn: signal.evidencesOn,
      expiresOn: existing ? existing.expiresOn : signal.expiresOn,
      state: lifecycle,
      ageDays: ageDays ?? 0,
      escalated,
      expired,
      severity: existing ? existing.severity : signal.severity,
      answer: existing ? existing.answer : '',
      dismissReason: existing ? existing.dismissReason : '',
      persisted: Boolean(existing),
    });
  }
  for (const row of scopedStored) {
    if (row.origin !== 'declared') continue;
    const key = `declared:${row.id}`;
    if (ledger.some((item) => item.key === key)) continue;
    const ageDays = daysBetween(row.harvestedOn, today);
    ledger.push({
      key,
      id: row.id,
      title: row.title,
      className: 'declared',
      discipline: 'people',
      signalKey: 'declared',
      sourceType: null,
      sourceId: null,
      route: '#/epistemic?panel=unknowns',
      ownerSeatId: row.ownerSeatId,
      ownerName: row.ownerSeatId ? (built.byId.get(row.ownerSeatId)?.name || '') : 'the whole workspace',
      altitudeKey: row.altitudeKey,
      rank: row.rank,
      harvestedOn: row.harvestedOn,
      evidencesOn: row.evidencesOn || row.harvestedOn,
      expiresOn: row.expiresOn,
      state: row.state,
      ageDays: ageDays ?? 0,
      escalated: row.state === 'unopened' && (ageDays ?? 0) >= conventions.epistemicEscalateDays,
      expired: row.state === 'expired' || Boolean(row.expiresOn && row.expiresOn < today && row.state === 'unopened'),
      severity: row.severity,
      answer: row.answer,
      dismissReason: row.dismissReason,
      persisted: true,
    });
  }
  // A closed unknown stays on the record after its signal stops being
  // harvestable — a question that was ANSWERED is history, and dropping it when
  // the underlying record was fixed would silently improve the answer rate.
  for (const row of scopedStored) {
    if (row.origin === 'declared') continue;
    if (!['answered', 'dismissed'].includes(row.state)) continue;
    if (ledger.some((item) => item.id === row.id)) continue;
    ledger.push({
      key: `${row.sourceType}:${row.sourceId}|${row.signalKey || ''}`,
      id: row.id,
      title: row.title,
      className: row.className,
      discipline: 'people',
      signalKey: row.signalKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      route: row.sourceRoute || '#/epistemic?panel=unknowns',
      ownerSeatId: row.ownerSeatId,
      ownerName: row.ownerSeatId ? (built.byId.get(row.ownerSeatId)?.name || '') : 'the whole workspace',
      altitudeKey: row.altitudeKey,
      rank: row.rank,
      harvestedOn: row.harvestedOn,
      evidencesOn: row.evidencesOn || row.harvestedOn,
      expiresOn: row.expiresOn,
      state: row.state,
      ageDays: daysBetween(row.evidencesOn || row.harvestedOn, today) ?? 0,
      escalated: false,
      expired: false,
      severity: row.severity,
      answer: row.answer,
      dismissReason: row.dismissReason,
      persisted: true,
      historical: true,
    });
  }
  ledger.sort((a, b) => {
    const rank = (item) => (item.state === 'unopened' ? 0 : item.state === 'open' ? 1 : item.state === 'expired' ? 2 : 3);
    return rank(a) - rank(b) || b.ageDays - a.ageDays || a.title.localeCompare(b.title);
  });

  const ledgerByState = emptyState(Object.keys(UNKNOWN_STATES));
  const ledgerByKind = emptyState(UNKNOWN_KIND_KEYS);
  const ledgerByAltitude = new Map();
  const discovered = new Set(stored.map((row) => `${row.sourceType}:${row.sourceId}`));
  for (const item of ledger) {
    ledgerByState[item.state] = (ledgerByState[item.state] || 0) + 1;
    ledgerByKind[item.className] = (ledgerByKind[item.className] || 0) + 1;
    const key = item.altitudeKey || 'unassigned';
    if (!ledgerByAltitude.has(key)) ledgerByAltitude.set(key, { altitudeKey: key, unknownN: 0, unopenedN: 0, expiredN: 0, answeredN: 0 });
    const cell = ledgerByAltitude.get(key);
    cell.unknownN += 1;
    if (item.state === 'unopened') cell.unopenedN += 1;
    if (item.state === 'expired' || item.expired) cell.expiredN += 1;
    if (item.state === 'answered') cell.answeredN += 1;
  }

  const answerN = ledgerByState.answered || 0;
  const dismissN = ledgerByState.dismissed || 0;
  const closedN = answerN + dismissN;
  const answerRate = closedN < conventions.epistemicAnswerFloor
    ? { pct: null, lowPct: null, highPct: null, refused: true, reason: `Only ${closedN} unknown(s) have been closed by a human — below the declared floor of ${conventions.epistemicAnswerFloor}. An answer rate over four rows is a mood.` }
    : { ...wilsonInterval(answerN, closedN), refused: false, reason: '' };

  const ages = ledger.map((item) => item.ageDays).sort((a, b) => a - b);
  const medianAge = ages.length ? ages[Math.floor(ages.length / 2)] : null;

  /* ------------------------------------------------- calibration */
  const observations = (Array.isArray(state?.epistemicObservations) ? state.epistemicObservations : [])
    .filter((row) => inScope(seat, row.ownerSeatId));
  const live = observations.map((observation) => {
    const scored = scoreObservation(state, observation);
    const kappa = cohenKappa(scored.cells, { pairFloor: conventions.epistemicPairFloor });
    const verdict = calibrationVerdict(kappa, { conventions });
    return { observation, scored, kappa, verdict };
  });
  const pooledCells = emptyState(['agreedOk', 'optimism', 'pessimism', 'agreedBad']);
  let pooledUnpaired = 0;
  for (const row of live) {
    for (const key of Object.keys(pooledCells)) pooledCells[key] += row.scored.cells[key];
    pooledUnpaired += row.scored.unpairedN;
  }
  const pooledKappa = cohenKappa(pooledCells, { pairFloor: conventions.epistemicPairFloor });
  const pooledVerdict = calibrationVerdict(pooledKappa, { conventions });

  // Per-span cells, suppressed below the floor with a complementary partner so a
  // printed total cannot be differenced back into the withheld cell.
  const bySeat = new Map();
  for (const row of live) {
    const key = row.observation.ownerSeatId || 'unassigned';
    if (!bySeat.has(key)) bySeat.set(key, { seatId: key, cells: emptyState(['agreedOk', 'optimism', 'pessimism', 'agreedBad']), observationsN: 0, unpairedN: 0 });
    const cell = bySeat.get(key);
    for (const k of Object.keys(cell.cells)) cell.cells[k] += row.scored.cells[k];
    cell.observationsN += 1;
    cell.unpairedN += row.scored.unpairedN;
  }
  const cellFloor = conventions.epistemicCellFloor;
  const seatRows = [];
  for (const [key, cell] of bySeat) {
    const pairedN = Object.values(cell.cells).reduce((sum, n) => sum + n, 0);
    const kappa = pairedN >= conventions.epistemicPairFloor ? cohenKappa(cell.cells, { pairFloor: conventions.epistemicPairFloor }) : null;
    seatRows.push({
      seatId: key,
      name: key === 'unassigned' ? 'the whole workspace' : (built.byId.get(key)?.name || key),
      altitudeKey: key === 'unassigned' ? 'chief' : (built.byId.get(key)?.altitudeKey || null),
      rank: key === 'unassigned' ? 5 : (built.byId.get(key)?.rank || 5),
      ...cell.cells,
      pairedN,
      unpairedN: cell.unpairedN,
      observationsN: cell.observationsN,
      kappa: kappa && !kappa.refused ? kappa.kappa : null,
      pabak: kappa && !kappa.refused ? kappa.pabak : null,
      biasIndex: kappa && !kappa.refused ? kappa.biasIndex : null,
      verdict: kappa && !kappa.refused ? calibrationVerdict(kappa, { conventions }) : { ...CALIBRATION_VERDICTS.refused, reason: kappa ? kappa.reason : `Under ${conventions.epistemicPairFloor} paired beliefs.` },
      suppressed: pairedN > 0 && pairedN < cellFloor,
    });
  }
  const suppressedSeats = seatRows.filter((row) => row.suppressed);
  if (suppressedSeats.length === 1) {
    const partner = seatRows.filter((row) => !row.suppressed).sort((a, b) => a.pairedN - b.pairedN)[0];
    if (partner) {
      partner.suppressed = true;
      partner.complementary = true;
    }
  }
  seatRows.sort((a, b) => b.pairedN - a.pairedN);

  /* ---------------------------------------------------- implied ledger */
  const blindSeatId = seat.fullAccess ? 'leader' : seat.id;
  const blindRows = BLIND_CLASS_KEYS.map((key) => blindReading(state, {
    built, seatId: blindSeatId, className: key, now, settings: effective,
  })).filter(Boolean);
  const measurableBlind = blindRows.filter((row) => !row.refused);
  const darkN = measurableBlind.filter((row) => row.band.key === 'dark').length;
  const mostlyBlindN = measurableBlind.filter((row) => row.band.key === 'blind').length;

  // Where a span has measurable activity in a class and NOTHING arrived, the
  // rule of three bounds the arrival rate. The union across classes is the
  // number this terminal is named for: how many kinds of trouble can exist
  // below this span without anyone above it hearing.
  const silentClasses = blindRows.filter((row) => row.arrivedN === 0 && row.expectedN > 0);
  const impliedUnheardLower = blindRows.reduce((sum, row) => sum + row.silentN, 0);

  /* ------------------------------------------------------------ rollup */
  const altitudeRows = [...ledgerByAltitude.values()].map((cell) => ({
    ...cell,
    suppressed: cell.unknownN > 0 && cell.unknownN < cellFloor,
  })).sort((a, b) => String(a.altitudeKey).localeCompare(String(b.altitudeKey)));

  const instruments = blindInstruments(signals);
  const playbook = EPISTEMIC_PLAYBOOK[seat.altitudeKey] || EPISTEMIC_PLAYBOOK.chief;

  const escalateList = ledger.filter((item) => item.escalated && item.state === 'unopened');
  const expiredList = ledger.filter((item) => item.expired && item.state !== 'answered' && item.state !== 'dismissed');

  return {
    ok: true,
    engineVersion: EPISTEMIC_ENGINE_VERSION,
    generatedOn: today,
    premise: EPISTEMIC_PREMISE,
    disclosure: EPISTEMIC_DISCLOSURE,
    conventions,
    seat: {
      id: seat.id,
      label: seat.label,
      altitudeKey: seat.altitudeKey || 'chief',
      rank: seat.rank,
      fullAccess: Boolean(seat.fullAccess),
      readOnly: Boolean(seat.readOnly),
    },
    playbook,
    summary: {
      unknownN: ledger.length,
      persistedN: ledger.filter((item) => item.persisted).length,
      harvestedN: ledger.length - ledger.filter((item) => item.persisted).length,
      unopenedN: ledgerByState.unopened || 0,
      openN: ledgerByState.open || 0,
      answeredN: answerN,
      dismissedN: dismissN,
      expiredN: ledger.filter((item) => item.expired && item.state !== 'answered' && item.state !== 'dismissed').length,
      escalateN: escalateList.length,
      declaredN: ledger.filter((item) => item.className === 'declared').length,
      medianAgeDays: medianAge,
      oldestAgeDays: ages.length ? ages[ages.length - 1] : null,
      discoveryN: discovered.size,
      signalN: signals.length,
    },
    ledger: ledger.slice(0, 120),
    ledgerByState,
    ledgerByKind,
    byKindMeta: UNKNOWN_KINDS,
    byStateMeta: UNKNOWN_STATES,
    escalateList: escalateList.slice(0, 40),
    expiredList: expiredList.slice(0, 40),
    answerRate,
    calibration: {
      observationsN: observations.length,
      pairedN: Object.values(pooledCells).reduce((sum, n) => sum + n, 0),
      unpairedN: pooledUnpaired,
      cells: pooledCells,
      kappa: pooledKappa,
      verdict: pooledVerdict,
      bySeat: seat.rank <= 3 ? seatRows : [],
      bySeatHidden: seat.rank > 3,
      rows: live.slice(0, 60).map((row) => ({
        id: row.observation.id,
        declaredOn: row.observation.declaredOn,
        question: row.observation.question,
        confidencePct: row.observation.confidencePct,
        ownerSeatId: row.observation.ownerSeatId,
        altitudeKey: row.observation.altitudeKey,
        cells: row.scored.cells,
        pairedN: row.scored.pairedN,
        unpairedN: row.scored.unpairedN,
        kappa: row.kappa.refused ? null : row.kappa.kappa,
        pabak: row.kappa.refused ? null : row.kappa.pabak,
        verdict: row.verdict,
        refused: row.kappa.refused,
        reason: row.kappa.reason,
      })),
    },
    blind: {
      rows: blindRows,
      darkN,
      mostlyBlindN,
      silentClasses,
      impliedUnheardLower,
      measurableN: measurableBlind.length,
      note: 'Coverage is an exact ratio over the records this workspace holds: measurable activity below the span against activity that produced an arriving edge. Work nobody logged is invisible to this arithmetic, and that limit is larger than the number.',
    },
    instruments,
    altitudeRows,
    cellFloor,
  };
}

/* ------------------------------------------------------------------ */
/* Brief, CSV and attention                                            */
/* ------------------------------------------------------------------ */

export function epistemicBriefText(report) {
  if (!report || report.ok === false) return { ok: false, error: 'No epistemic reading is available.' };
  const s = report.summary;
  const c = report.calibration;
  const lines = [
    `Epistemic ledger — what the record knew and nobody read (${report.generatedOn})`,
    `Seat: ${report.seat.label}, rank ${report.seat.rank}. The reading is scoped to this seat; no person is named anywhere in it.`,
    `Unknowns in scope: ${s.unknownN} (${s.unopenedN} unopened, ${s.openN} under investigation, ${s.answeredN} answered, ${s.dismissedN} dismissed with a reason, ${s.expiredN} expired without an answer).`,
    s.medianAgeDays === null
      ? 'Age: no unknown is in scope.'
      : `Age: median ${s.medianAgeDays} day(s), oldest ${s.oldestAgeDays} day(s). ${s.escalateN} unopened signal(s) have passed the declared escalation age of ${report.conventions.epistemicEscalateDays} day(s).`,
    report.answerRate.refused
      ? `Answer rate: REFUSED — ${report.answerRate.reason}`
      : `Answer rate: ${report.answerRate.pct}% of closed unknowns were answered rather than dismissed (95% interval ${report.answerRate.lowPct}–${report.answerRate.highPct}%).`,
    c.kappa.refused
      ? `Overconfidence index: REFUSED — ${c.kappa.reason}`
      : `Overconfidence index: κ = ${c.kappa.kappa} (PABAK ${c.kappa.pabak}), bias index ${c.kappa.biasIndex}, prevalence index ${c.kappa.prevalenceIndex}, two-sided p = ${c.kappa.p}. Verdict: ${c.verdict.label}. ${c.verdict.reason}`,
    `Blind classes: ${report.blind.measurableN} measurable, ${report.blind.darkN} dark and ${report.blind.mostlyBlindN} mostly blind. ${report.blind.silentClasses.length} class(es) produced no arriving edge at all despite measurable activity below this span.`,
    `Evidence classes with no signal in the window: ${report.instruments.filter((row) => row.blind).map((row) => row.discipline).join('; ') || 'none — every declared class produced at least one signal'}. A class with no evidence is a blind instrument, not a clean one.`,
    'Coverage is an exact ratio over this workspace’s own records. Work nobody logged is invisible to it. No person is rated, ranked or named; suppressed cells are blank, never zero.',
  ];
  return { ok: true, text: lines.join('\n') };
}

export function epistemicCsvRows(report) {
  if (!report || report.ok === false) return [];
  const rows = [];
  const s = report.summary;
  rows.push({
    row_kind: 'summary',
    scope: report.seat.altitudeKey || 'unassigned',
    unknown_n: s.unknownN,
    unopened_n: s.unopenedN,
    open_n: s.openN,
    answered_n: s.answeredN,
    dismissed_n: s.dismissedN,
    expired_n: s.expiredN,
    escalate_n: s.escalateN,
    declared_n: s.declaredN,
    median_age_days: s.medianAgeDays ?? '',
    oldest_age_days: s.oldestAgeDays ?? '',
  });
  for (const key of Object.keys(report.byStateMeta)) {
    rows.push({ row_kind: 'state', scope: key, unknown_n: report.ledgerByState[key] || 0 });
  }
  for (const key of Object.keys(report.byKindMeta)) {
    rows.push({ row_kind: 'kind', scope: key, unknown_n: report.ledgerByKind[key] || 0 });
  }
  for (const cell of report.altitudeRows) {
    rows.push({
      row_kind: 'altitude-cell',
      scope: cell.altitudeKey,
      unknown_n: cell.suppressed ? '' : cell.unknownN,
      unopened_n: cell.suppressed ? '' : cell.unopenedN,
      answered_n: cell.suppressed ? '' : cell.answeredN,
      expired_n: cell.suppressed ? '' : cell.expiredN,
      suppressed: cell.suppressed ? 'yes' : 'no',
    });
  }
  const k = report.calibration.kappa;
  rows.push({
    row_kind: 'calibration',
    scope: 'belief-vs-record',
    paired_n: report.calibration.pairedN,
    unpaired_n: report.calibration.unpairedN,
    agreed_ok_n: report.calibration.cells.agreedOk,
    optimism_n: report.calibration.cells.optimism,
    pessimism_n: report.calibration.cells.pessimism,
    agreed_bad_n: report.calibration.cells.agreedBad,
    kappa: k.refused ? '' : k.kappa,
    pabak: k.refused ? '' : k.pabak,
    bias_index: k.refused ? '' : k.biasIndex,
    prevalence_index: k.refused ? '' : k.prevalenceIndex,
    p_value: k.refused ? '' : k.p,
    verdict: report.calibration.verdict.key,
    suppressed: k.refused ? 'refused' : 'no',
  });
  for (const row of report.calibration.bySeat) {
    rows.push({
      row_kind: 'calibration-cell',
      scope: row.altitudeKey || 'unassigned',
      paired_n: row.suppressed ? '' : row.pairedN,
      optimism_n: row.suppressed ? '' : row.optimism,
      pessimism_n: row.suppressed ? '' : row.pessimism,
      kappa: row.suppressed || row.kappa === null ? '' : row.kappa,
      bias_index: row.suppressed || row.biasIndex === null ? '' : row.biasIndex,
      verdict: row.suppressed ? 'suppressed' : row.verdict.key,
      suppressed: row.suppressed ? 'yes' : 'no',
    });
  }
  for (const row of report.blind.rows) {
    rows.push({
      row_kind: 'blind-class',
      scope: row.className,
      expected_n: row.expectedN,
      arrived_n: row.arrivedN,
      silent_n: row.silentN,
      coverage_pct: row.refused ? '' : row.coveragePct,
      band: row.band.key,
      rate_upper_30d: row.zeroArrivalRateUpper === null ? '' : row.zeroArrivalRateUpper,
      suppressed: row.refused ? 'refused' : 'no',
    });
  }
  for (const row of report.instruments) {
    rows.push({ row_kind: 'evidence-class', scope: row.discipline, unknown_n: row.evidenceN, blind: row.blind ? 'yes' : 'no' });
  }
  return rows;
}

export function epistemicAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildEpistemicReport(state, { now, settings });
  const calibrationGap = report.calibration.kappa.refused ? 0 : 1;
  return report.summary.escalateN + report.summary.expiredN + report.blind.darkN + calibrationGap;
}

export { BLIND_CLASSES, BLIND_CLASS_KEYS, EPISTEMIC_DEFAULTS, UNKNOWN_KINDS, UNKNOWN_STATES, BELIEF_CELLS };
