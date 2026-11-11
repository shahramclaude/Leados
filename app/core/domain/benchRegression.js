/**
 * app/core/domain/benchRegression.js — the Bench-Claim Evidence Regression Watch
 * (ADR-0172, Schema v137, `#/succession?panel=evidence` § regression).
 *
 * THE DEFECT THIS CLOSES, IN AN OPERATOR'S WORDS. A director owns the
 * succession slate for her span. Marcus's claim — `ready now` for VP
 * Engineering — was `corroborated` in June: every line he worked on was asked,
 * and every one answered. In December the same claim reads `line-unasked`. The
 * RATING never moved. The point-in-time register (ADR-0168) reads December
 * correctly and says nothing about June, because it stores nothing — so nobody
 * is told that the ground moved under a seat the board may be about to fill.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * A COMPARISON, not a new model. It calls:
 *
 *   `resolveClaimEvidenceState(review, stewardship)`   the ONE shared ADR-0168
 *                                                      precedence (a review
 *                                                      resolves to the same
 *                                                      word here and there)
 *   `buildReviewStewardship(state, review)`            ADR-0147's per-line states
 *   `resolveHomeLineAsOf(ledger, person, day)`         the ONE shared ADR-0149
 *                                                      seat resolver
 *   `readinessFor(state, personId, seat)`              the stored rating today
 *
 * and prints, per CONSECUTIVE PAIR of a claim's completed reviews, whether the
 * later window's evidence is weaker than the previous window's — under an
 * unchanged rating.
 *
 * FROZEN HISTORY AGAINST A LIVE QUESTION
 * --------------------------------------
 * The previous window is the FROZEN reading (`benchRegressionReadings`, one
 * per claim per completed review, written by RULE-BRG-01 on `review.completed`
 * and on scan). It is never reconstructed and never rewritten: where it is
 * missing, the pair is `uncomparable` with the reason printed.
 *
 * The LATER window of the claim's latest pair is resolved LIVE from today's
 * record — because the later window's evidence matures after it freezes (a line
 * asked late answers late, and RULE-BNE-01's own ask exists to make that
 * happen). The later window's frozen reading is printed beside it as the audit
 * column (\"as frozen on <day>: <state>\"), proving what the rule saw.
 *
 * Older pairs compare frozen against frozen (history as recorded), with one
 * declared exception applying to EVERY frozen side: a frozen `line-awaiting`
 * was frozen while its question was still open, so it is re-read live with the
 * basis printed. A frozen SETTLED state is never re-read.
 *
 * WHAT IT REFUSES (Bulletproof Reliability Mandate)
 * -------------------------------------------------
 *  - It never prints a trend over an unreadable pair: a missing frozen
 *    reading, a vanished review, an unresolvable window, or a hole in the
 *    consecutive chain each refuse the pair with their own reason.
 *  - It never mistakes an open question for a decay (`open`), a declaration
 *    problem for a decay (`unresolved`), or a structural change for a decay
 *    (`structure-changed` / `stable-single`). Each has its own verdict.
 *  - It never issues attention over a re-assessed claim: where the current
 *    rating differs from the previous window's frozen rating, the pair reads
 *    `rating-moved` and no ask issues.
 *  - It never prints a regression rate. A regression is a dated event on a
 *    named claim, not a proportion.
 *  - It never scores a person or a manager. The subject is a bench claim, two
 *    evidence windows and whether the ground moved.
 *  - It stores NOTHING. Readings are written by the rule; every verdict is
 *    re-derived on read.
 *
 * TWO IDENTITIES IT KEEPS APART AND PRINTS SEPARATELY
 *   pairs    = regressed + rating-moved + improved + stable + stable-single
 *              + structure-changed + unresolved + open + uncomparable
 *   complete = every pair comparable AND every pair printed (no row-cap remainder)
 * `reconciles` is about the first; `figuresComplete` is about the second. They are
 * different facts and are never collapsed into one reassuring word.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey } from '../time.js';
import { readinessFor, readinessLabel } from './readiness.js';
import { buildReviewStewardship } from './reviewStewardship.js';
import { buildStructureLedger } from './structureHistory.js';
import { resolveClaimEvidenceState, resolveHomeLineAsOf } from './benchEvidence.js';
import {
  BENCH_REGRESSION_CONVENTIONS,
  BENCH_REGRESSION_ENGINE_VERSION,
  BENCH_REGRESSION_LIMITS,
  BENCH_REGRESSION_VERDICTS,
  BENCH_REGRESSION_VERDICT_KEYS,
  BENCH_REGRESSION_COMPARABLE_STATES,
  benchRegressionSeverity,
  benchRegressionVerdict,
  benchRegressionBoardVerdict,
} from './benchRegressionRegistry.js';

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));
const dayOf = (v) => (isDay(v) ? String(v).trim().slice(0, 10) : null);
const nameOf = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/**
 * A claim's completed reviews with pairable windows, in CONSECUTIVE order:
 * period end, then completion, then id (the same tie-break the point-in-time
 * register uses to choose ONE review, so the two modules order a claim's
 * history identically). A completed review with an invalid period end cannot be
 * placed and is returned separately — counted, never silently skipped.
 */
export function consecutiveReviewsFor(reviews, personId) {
  const ordered = [];
  const unplaceable = [];
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (!review || review.personId !== personId) continue;
    if (review.status !== 'complete') continue;
    const periodEnd = dayOf(review.periodEnd);
    if (!periodEnd) {
      unplaceable.push(review);
      continue;
    }
    ordered.push({ review, periodEnd });
  }
  ordered.sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd))
    || String(a.review.completedAt || a.review.updatedAt || '').localeCompare(String(b.review.completedAt || b.review.updatedAt || ''))
    || String(a.review.id).localeCompare(String(b.review.id)));
  return { ordered: ordered.map((o) => o.review), unplaceable };
}

/**
 * The watched claims: one record per (person, seat) — the FIRST in roster
 * order, the same identity rule the point-in-time register applies — naming a
 * person currently on the roster. Shared by the read and the rule so the
 * freezer can never freeze a claim the board would not show.
 *
 * @returns {{ claims:Array<{record:object, person:object}>, excludedN:number }}
 */
export function watchedClaimRecords(state = {}) {
  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const personById = new Map(people.map((p) => [p.id, p]));
  const rosterIds = new Set(people.filter((p) => p.status !== 'archived').map((p) => p.id));
  const records = (Array.isArray(state?.readiness) ? state.readiness : [])
    .filter((r) => r && r.personId && r.seat);
  const ordered = [...records].sort((a, b) => String(a.personId).localeCompare(String(b.personId))
    || String(a.seat).localeCompare(String(b.seat)));
  const seen = new Set();
  const claims = [];
  let excludedN = 0;
  for (const record of ordered) {
    const claimKey = `${record.personId}|${record.seat}`;
    if (seen.has(claimKey)) continue;
    seen.add(claimKey);
    const person = personById.get(record.personId) || null;
    if (!person || !rosterIds.has(person.id)) {
      excludedN += 1;
      continue;
    }
    claims.push({ record, person, claimKey });
  }
  return { claims, excludedN };
}

/**
 * Build ONE frozen reading for a claim against a completed review. Pure: the
 * RULE appends the returned row (or skips where one already exists — a frozen
 * reading is never rewritten). Returns null where there is no claim to freeze
 * (no readiness record) or no window to freeze against.
 */
export function freezeClaimReading(state = {}, record, review, { now = new Date(), settings = null, frozenBy = '' } = {}) {
  if (!record || !record.personId || !record.seat || !review || !review.id) return null;
  if (review.status !== 'complete' || review.personId !== record.personId) return null;
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const cfg = settings || state?.settings || {};
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const stewardship = buildReviewStewardship(state, review, { now: at, settings: cfg });
  const resolution = resolveClaimEvidenceState({
    review,
    stewardship,
    eligibleN: 1,
    windowEnd: dayOf(review.periodEnd),
    right: BENCH_REGRESSION_CONVENTIONS.right,
  });
  return {
    claimId: `${record.personId}|${record.seat}`,
    personId: record.personId,
    seat: record.seat,
    reviewId: review.id,
    windowStart: dayOf(review.periodStart),
    windowEnd: dayOf(review.periodEnd),
    evidenceState: resolution.evidenceState,
    lineN: resolution.eligibleLines.length,
    secondaryLineN: resolution.inPeriodSecondary.length,
    unaskedLinesN: resolution.counts.unaskedN,
    silentLinesN: resolution.counts.silentN,
    awaitingLinesN: resolution.counts.awaitingN,
    answeredLinesN: resolution.counts.answeredN,
    declinedLinesN: resolution.counts.declinedN,
    rating: record.rating,
    ratingUpdatedOn: dayOf(record.updatedAt),
    frozenOn: today,
    frozenBy: String(frozenBy || '').slice(0, 40),
  };
}

function emptyVerdictCounts() {
  const out = {};
  for (const key of BENCH_REGRESSION_VERDICT_KEYS) out[key] = 0;
  return out;
}

function emptyReport(today, refusals, conventions) {
  const verdict = benchRegressionBoardVerdict('no-claim');
  return {
    engineVersion: BENCH_REGRESSION_ENGINE_VERSION,
    today,
    conventions,
    verdict: verdict.key,
    verdictLabel: verdict.label,
    verdictTone: verdict.tone,
    verdictDetail: verdict.detail,
    verdictOpen: false,
    rows: [],
    printedRows: [],
    findings: [],
    findingsN: 0,
    findingsCappedN: 0,
    printedFindings: [],
    totals: {
      claimsN: 0,
      watchedN: 0,
      singleWindowN: 0,
      pairedN: 0,
      excludedN: 0,
      pairsN: 0,
      latestPairsN: 0,
      verdictCounts: emptyVerdictCounts(),
      regressedLatestN: 0,
      asksMatchedN: 0,
      asksPendingN: 0,
      asksNotedN: 0,
      markersN: 0,
      orphanMarkersN: 0,
      vanishedWindowsN: 0,
      unpairedReviewsN: 0,
    },
    reconciles: true,
    reconcilesDetail: 'There are no pairs to reconcile.',
    figuresComplete: false,
    figuresCompleteDetail: 'No claim is in scope, so no figure is supported by the record.',
    refusals,
  };
}

/**
 * Build the whole watch reading.
 */
export function buildBenchRegressionRead(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state?.settings || {};
  const conv = { ...BENCH_REGRESSION_CONVENTIONS };
  const refusals = [];

  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const nameById = new Map(people.map((p) => [p.id, nameOf(p.name, p.id)]));

  const records = (Array.isArray(state?.readiness) ? state.readiness : [])
    .filter((r) => r && r.personId && r.seat);
  if (!records.length) {
    refusals.push({
      kind: 'no-claim',
      detail: 'No readiness record exists in this workspace, so there is no bench claim to watch. Nothing is invented and nothing is refused as missing.',
    });
    return emptyReport(today, refusals, conv);
  }

  const ledger = buildStructureLedger(state);
  const reviews = Array.isArray(state?.reviews) ? state.reviews : [];
  const readings = Array.isArray(state?.benchRegressionReadings) ? state.benchRegressionReadings : [];
  const markers = Array.isArray(state?.benchRegressionMarkers) ? state.benchRegressionMarkers : [];

  const readingByClaimReview = new Map();
  for (const row of readings) {
    if (!row || !row.claimId || !row.reviewId) continue;
    const key = `${row.claimId}|${row.reviewId}`;
    if (!readingByClaimReview.has(key)) readingByClaimReview.set(key, row);
  }
  const reviewById = new Map(reviews.filter((r) => r && r.id).map((r) => [r.id, r]));
  const markerByPairKey = new Map();
  for (const m of markers) {
    if (!m || !m.key) continue;
    if (!markerByPairKey.has(m.key)) markerByPairKey.set(m.key, m);
  }

  const rows = [];
  const verdictCounts = emptyVerdictCounts();
  let watchedN = 0;
  let singleWindowN = 0;
  let pairedN = 0;
  let unpairedReviewsN = 0;
  let vanishedWindowsN = 0;
  let cappedPairsN = 0;

  // ONE claim identity, shared with the rule's freezer: first record per
  // (person, seat) naming someone on the roster.
  const { claims, excludedN } = watchedClaimRecords(state);

  for (const { record, person, claimKey } of claims) {
    const { ordered: chain, unplaceable } = consecutiveReviewsFor(reviews, record.personId);
    unpairedReviewsN += unplaceable.length;
    if (!chain.length) continue;
    watchedN += 1;
    if (chain.length < 2) {
      singleWindowN += 1;
      continue;
    }
    pairedN += 1;

    // Frozen readings whose review is GONE from the record: holes in the chain.
    // A pair spanning a vanished window is not consecutive and is refused.
    const vanished = readings.filter((row) => row
      && row.claimId === claimKey && row.reviewId && !reviewById.has(row.reviewId));
    vanishedWindowsN += vanished.length;
    const vanishedUnplaceable = vanished.some((row) => !dayOf(row.windowEnd));

    const currentRating = readinessFor(state, record.personId, record.seat)?.rating || null;

    for (let i = 0; i < chain.length - 1; i += 1) {
      const prevReview = chain[i];
      const laterReview = chain[i + 1];
      const isLatestPair = i === chain.length - 2;
      const pairKey = `benchreg|${claimKey}|${prevReview.id}|${laterReview.id}`;
      const prevEnd = dayOf(prevReview.periodEnd);
      const laterEnd = dayOf(laterReview.periodEnd);

      const prevFrozen = readingByClaimReview.get(`${claimKey}|${prevReview.id}`) || null;
      const laterFrozen = readingByClaimReview.get(`${claimKey}|${laterReview.id}`) || null;

      /* -------------------------------------------- resolve the two sides */
      // PREV: frozen history — except a frozen `line-awaiting`, which was frozen
      // while its question was open and is re-read live with the basis printed.
      let prevState = null;
      let prevBasis = '';
      let prevCounts = null;
      let prevUncomparableReason = '';
      if (vanishedUnplaceable) {
        prevUncomparableReason = 'A frozen window of this claim names a review that is gone and carries no readable window end, so no pair of this claim can be proven consecutive. The hole poisons consecutiveness rather than being stepped over.';
      } else if (vanished.some((row) => {
        const end = dayOf(row.windowEnd);
        return end && prevEnd && laterEnd && end > prevEnd && end < laterEnd;
      })) {
        prevUncomparableReason = `A frozen window of this claim (a review since removed from the record) ends between ${prevEnd} and ${laterEnd}, so these two windows are not consecutive. The pair is refused rather than compared across the hole.`;
      } else if (!prevFrozen) {
        prevUncomparableReason = `The previous window (${prevReview.id}, ending ${prevEnd}) has no frozen reading — the watch did not exist or the freeze was deferred when its review completed. History is never reconstructed live.`;
      } else if (prevFrozen.evidenceState === 'no-review') {
        prevUncomparableReason = `The previous window’s lines did not resolve when frozen (${prevReview.id}), so its evidence state is unknown rather than assumed complete.`;
      } else if (prevFrozen.evidenceState === 'line-awaiting') {
        const live = resolveClaimEvidenceState({
          review: prevReview,
          stewardship: buildReviewStewardship(state, prevReview, { now: at, settings: cfg }),
          eligibleN: 1,
          windowEnd: prevEnd,
          right: conv.right,
        });
        prevState = live.evidenceState;
        prevCounts = live.counts;
        prevBasis = `live — the previous window was frozen while its question was still open (frozen ${prevFrozen.frozenOn || 'on an unknown day'}), so it is re-read from today’s record`;
      } else {
        prevState = prevFrozen.evidenceState;
        prevBasis = `frozen ${prevFrozen.frozenOn || 'on an unknown day'} — history as recorded, never re-read`;
        prevCounts = {
          unaskedN: prevFrozen.unaskedLinesN || 0,
          silentN: prevFrozen.silentLinesN || 0,
          awaitingN: prevFrozen.awaitingLinesN || 0,
          answeredN: prevFrozen.answeredLinesN || 0,
          declinedN: prevFrozen.declinedLinesN || 0,
        };
      }

      // LATER: live on the latest pair (late evidence lands where the operator
      // looks); frozen history on older pairs, with the same frozen-open
      // exception. The later window’s frozen reading is always printed as the
      // audit column where one exists.
      let laterState = null;
      let laterBasis = '';
      let laterCounts = null;
      let laterUncomparableReason = '';
      if (isLatestPair) {
        const live = resolveClaimEvidenceState({
          review: laterReview,
          stewardship: buildReviewStewardship(state, laterReview, { now: at, settings: cfg }),
          eligibleN: 1,
          windowEnd: laterEnd,
          right: conv.right,
        });
        laterState = live.evidenceState;
        laterCounts = live.counts;
        laterBasis = 'live — the latest window is always read from today’s record, so a late answer lands where the operator looks';
        if (laterState === 'no-review') {
          laterUncomparableReason = `The latest window’s lines do not resolve (${laterReview.id}), so its evidence state is unknown rather than assumed complete.`;
        }
      } else if (!laterFrozen) {
        laterUncomparableReason = `The later window (${laterReview.id}, ending ${laterEnd}) has no frozen reading — the watch did not exist or the freeze was deferred when its review completed. History is never reconstructed live.`;
      } else if (laterFrozen.evidenceState === 'no-review') {
        laterUncomparableReason = `The later window’s lines did not resolve when frozen (${laterReview.id}), so its evidence state is unknown rather than assumed complete.`;
      } else if (laterFrozen.evidenceState === 'line-awaiting') {
        const live = resolveClaimEvidenceState({
          review: laterReview,
          stewardship: buildReviewStewardship(state, laterReview, { now: at, settings: cfg }),
          eligibleN: 1,
          windowEnd: laterEnd,
          right: conv.right,
        });
        laterState = live.evidenceState;
        laterCounts = live.counts;
        laterBasis = `live — the later window was frozen while its question was still open (frozen ${laterFrozen.frozenOn || 'on an unknown day'}), so it is re-read from today’s record`;
      } else {
        laterState = laterFrozen.evidenceState;
        laterBasis = `frozen ${laterFrozen.frozenOn || 'on an unknown day'} — history as recorded, never re-read`;
        laterCounts = {
          unaskedN: laterFrozen.unaskedLinesN || 0,
          silentN: laterFrozen.silentLinesN || 0,
          awaitingN: laterFrozen.awaitingLinesN || 0,
          answeredN: laterFrozen.answeredLinesN || 0,
          declinedN: laterFrozen.declinedLinesN || 0,
        };
      }

      /* -------------------------------------------------- declare a verdict */
      // DECLARED PRECEDENCE, first match wins — the same discipline as the
      // point-in-time register, so the two screens cannot disagree.
      let verdict;
      let detail = '';
      const uncomparableReason = prevUncomparableReason || laterUncomparableReason;
      if (uncomparableReason) {
        verdict = 'uncomparable';
        detail = uncomparableReason;
      } else if (prevState === 'line-awaiting' || laterState === 'line-awaiting') {
        verdict = 'open';
        detail = prevState === 'line-awaiting' && laterState === 'line-awaiting'
          ? 'Both windows’ line questions are still inside their declared windows. Two open questions are not a trend; the pair is re-derived on every render.'
          : prevState === 'line-awaiting'
            ? 'The previous window’s line question is still inside its declared window, so the ground was never firm enough to compare against. The pair is re-derived on every render.'
            : 'The later window’s line question is still inside its declared window. An open question is not a silence and not a decay; the pair is re-derived on every render.';
      } else if (
        prevState === 'contested-assessor' || prevState === 'unowned-assessor'
        || laterState === 'contested-assessor' || laterState === 'unowned-assessor'
      ) {
        verdict = 'unresolved';
        detail = 'A contested or unowned assessor sits on at least one window. That is a declaration problem the matrix panels already name — an ask addressed to a contested set can never close, so none issues.';
      } else if ((prevState === 'single-line') !== (laterState === 'single-line')) {
        verdict = 'structure-changed';
        detail = prevState === 'single-line'
          ? `The previous window rested on one reporting line and the later window rests on several: the person gained a line between windows. A fresh gap on the new line is already covered by RULE-BNE-01’s own ask — this watch does not ask twice.`
          : `The previous window rested on several reporting lines and the later window rests on one: the person’s second line ended between windows. The gap evaporated structurally; that is a structural fact, not an evidence decay.`;
      } else if (prevState === 'single-line') {
        verdict = 'stable-single';
        detail = 'Both windows rest on one reporting line. There is no second line that could have decayed, and nothing is claimed about one.';
      } else if (!BENCH_REGRESSION_COMPARABLE_STATES.includes(prevState)
        || !BENCH_REGRESSION_COMPARABLE_STATES.includes(laterState)) {
        verdict = 'uncomparable';
        detail = `At least one window reads ${prevState} → ${laterState}, which the severity ladder does not order. The pair is refused rather than forced onto a ladder that does not hold it.`;
      } else {
        const prevRank = benchRegressionSeverity(prevState);
        const laterRank = benchRegressionSeverity(laterState);
        const prevRating = prevFrozen ? prevFrozen.rating : null;
        if (laterRank < prevRank && currentRating !== prevRating) {
          verdict = 'rating-moved';
          detail = `The later window reads worse (${prevState} → ${laterState}), but the readiness rating moved from ${prevRating || 'unknown'} to ${currentRating || 'unknown'} since the previous window froze. The claim is under active re-assessment; no ask issues on top of a manager who already re-opened it.`;
        } else if (laterRank < prevRank) {
          verdict = 'regressed';
          detail = `The later window reads strictly worse (${prevState} → ${laterState}) and the readiness rating still reads ${currentRating || 'unknown'} — the rating the board sees has not moved while the ground did. This is the ONE verdict that issues an ask${isLatestPair ? '' : ', and this pair is history: only the claim’s latest pair can issue'}.`;
        } else if (laterRank > prevRank) {
          verdict = 'improved';
          detail = `The later window reads strictly better (${prevState} → ${laterState}). Printed and counted; an improvement issues no work.`;
        } else {
          verdict = 'stable';
          detail = `Both windows read ${prevState}. Stability says the procedure is unchanged — never that the evidence is sufficient.`;
        }
      }

      const verdictMeta = benchRegressionVerdict(verdict);
      verdictCounts[verdict] += 1;

      // The seat an ask would go to: the home line as of the LATER window’s
      // end — resolved for latest pairs only, because only they can issue.
      let homeLineState = null;
      let homeManagerId = null;
      let homeManagerName = null;
      let homeKnown = false;
      if (isLatestPair) {
        const home = resolveHomeLineAsOf({ ledger, person, personId: record.personId, day: laterEnd });
        homeLineState = home.homeLineState;
        homeManagerId = home.homeManagerId;
        homeManagerName = home.homeManagerId ? (nameById.get(home.homeManagerId) || home.homeManagerId) : null;
        homeKnown = home.homeKnown;
      }

      // A `no-seat` note never blocks the ask: when the home line becomes
      // readable, the scan issues what the pair was owed. The ask marker and
      // the note carry distinct keys so idempotency and retry do not fight.
      const marker = markerByPairKey.get(pairKey) || markerByPairKey.get(`${pairKey}|no-seat`) || null;

      rows.push({
        pairKey,
        claimId: claimKey,
        personId: record.personId,
        personName: nameById.get(record.personId) || record.personId,
        personLevel: person.level || null,
        seat: record.seat,
        isLatestPair,
        prevReviewId: prevReview.id,
        prevWindowStart: dayOf(prevReview.periodStart),
        prevWindowEnd: prevEnd,
        prevState,
        prevBasis,
        prevCounts,
        prevFrozenOn: prevFrozen ? prevFrozen.frozenOn : null,
        prevRating: prevFrozen ? prevFrozen.rating : null,
        prevRatingLabel: prevFrozen ? readinessLabel(prevFrozen.rating) : null,
        laterReviewId: laterReview.id,
        laterWindowStart: dayOf(laterReview.periodStart),
        laterWindowEnd: laterEnd,
        laterState,
        laterBasis,
        laterCounts,
        laterFrozenState: laterFrozen ? laterFrozen.evidenceState : null,
        laterFrozenOn: laterFrozen ? laterFrozen.frozenOn : null,
        currentRating,
        currentRatingLabel: currentRating ? readinessLabel(currentRating) : null,
        verdict,
        verdictLabel: verdictMeta?.label || verdict,
        verdictTone: verdictMeta?.tone || 'neutral',
        verdictDetail: detail,
        asks: verdictMeta?.asks === true && isLatestPair,
        homeLineManagerId: homeManagerId,
        homeLineManagerName: homeManagerName,
        homeLineState,
        homeLineKnown: homeKnown,
        homeLineBasis: isLatestPair
          ? 'the home line as of the later window’s end (ADR-0149) — never today’s pointer read backwards'
          : 'resolved for latest pairs only: only the claim’s latest pair can issue',
        askMarker: marker ? {
          kind: marker.kind,
          taskId: marker.taskId || null,
          recordedOn: marker.recordedOn || null,
          summary: marker.summary || '',
        } : null,
      });
    }
  }

  if (!rows.length) {
    if (watchedN && !pairedN) {
      refusals.push({
        kind: 'single-window',
        detail: `${watchedN} watched claim(s) hold exactly one completed review each. A regression needs consecutive windows; the first window is the baseline the second will be read against.`,
      });
    }
    if (excludedN) {
      refusals.push({
        kind: 'excluded',
        detail: `${excludedN} readiness record(s) name a person who is no longer on the active roster. A bench claim about someone who has left is not watched, and it is not read as a current decay.`,
      });
    }
    const empty = emptyReport(today, refusals, conv);
    empty.totals.claimsN = claims.length + excludedN;
    empty.totals.watchedN = watchedN;
    empty.totals.singleWindowN = singleWindowN;
    empty.totals.pairedN = pairedN;
    empty.totals.excludedN = excludedN;
    empty.totals.unpairedReviewsN = unpairedReviewsN;
    empty.totals.vanishedWindowsN = vanishedWindowsN;
    empty.verdict = watchedN ? 'single-window' : 'no-claim';
    const board = benchRegressionBoardVerdict(empty.verdict);
    empty.verdictLabel = board.label;
    empty.verdictTone = board.tone;
    empty.verdictDetail = board.detail;
    return empty;
  }

  // Worst verdict first, then the most recently closed later window, then identity.
  const rankOf = (verdict) => benchRegressionVerdict(verdict)?.rank ?? 99;
  rows.sort((a, b) => rankOf(a.verdict) - rankOf(b.verdict)
    || String(b.laterWindowEnd || '').localeCompare(String(a.laterWindowEnd || ''))
    || String(a.personName).localeCompare(String(b.personName))
    || String(a.seat).localeCompare(String(b.seat)));

  const findings = [];
  for (const row of rows) {
    if (!row.isLatestPair || row.verdict !== 'regressed') continue;
    findings.push({
      kind: row.verdict,
      pairKey: row.pairKey,
      claimId: row.claimId,
      personId: row.personId,
      personName: row.personName,
      seat: row.seat,
      prevReviewId: row.prevReviewId,
      laterReviewId: row.laterReviewId,
      detail: `${row.personName} · ${row.seat}: ${row.verdictDetail}`,
    });
  }

  const printedRows = rows.slice(0, BENCH_REGRESSION_LIMITS.rows);
  if (rows.length > printedRows.length) {
    cappedPairsN = rows.length - printedRows.length;
    refusals.push({
      kind: 'row-cap',
      detail: `${cappedPairsN} pair(s) sit beyond the ${BENCH_REGRESSION_LIMITS.rows}-row bound on this reading. They are COUNTED in every total below and not dropped; the per-pair table shows the worst ${printedRows.length}.`,
    });
  }

  const latestPairs = rows.filter((r) => r.isLatestPair);
  const regressedLatestN = latestPairs.filter((r) => r.verdict === 'regressed').length;
  const pairKeys = new Set(rows.map((r) => r.pairKey));
  const notedKeys = new Set([...pairKeys].map((key) => `${key}|no-seat`));
  const askMarkers = markers.filter((m) => m && m.kind === 'ask' && pairKeys.has(m.key));
  const orphanMarkers = markers.filter((m) => m && !pairKeys.has(m.key) && !notedKeys.has(m.key));
  const asksMatchedN = askMarkers.length;
  const regressedLatest = latestPairs.filter((r) => r.verdict === 'regressed');
  const asksPendingN = regressedLatest.filter((r) => !r.askMarker).length;
  const asksNotedN = regressedLatest.filter((r) => r.askMarker && r.askMarker.kind !== 'ask').length;

  /* --------------------------------------------------------- the two claims */
  // Claim 1: the pairs add up. Every pair is exactly one verdict — never
  // skipped and never double-counted.
  const verdictN = BENCH_REGRESSION_VERDICT_KEYS.reduce((acc, key) => acc + (verdictCounts[key] || 0), 0);
  const reconciles = verdictN === rows.length;
  const reconcilesDetail = reconciles
    ? `${verdictN} pair verdict(s) across ${rows.length} consecutive pair(s) on ${pairedN} paired claim(s); ${singleWindowN} watched claim(s) hold a single window and ${excludedN} record(s) are excluded for an archived person. Every pair is exactly one verdict.`
    : `The verdict counts total ${verdictN} and ${rows.length} pairs are printed. This reading refuses its board verdict rather than printing one over a figure it cannot reconcile.`;

  // Claim 2: is the pair population complete? DIFFERENT from claim 1: the
  // counts can add up perfectly over pairs that were refused as unreadable.
  const uncomparableN = verdictCounts.uncomparable || 0;
  let figuresComplete = true;
  let figuresCompleteDetail = `Every one of the ${rows.length} pair(s) was compared from a frozen previous window and a readable later window. Both figures — the pair count and the verdict counts — are supported by the record.`;
  if (uncomparableN) {
    figuresComplete = false;
    figuresCompleteDetail = `${uncomparableN} pair(s) cannot be compared (a missing frozen reading, a vanished review, or an unresolvable window), so the population is incomplete even though every printed count reconciles.`;
  } else if (cappedPairsN) {
    figuresComplete = false;
    figuresCompleteDetail = `${cappedPairsN} pair(s) sit beyond the row bound. They are counted in the totals, but the per-pair table does not show them, so the table is not the whole population.`;
  }

  /* ------------------------------------------------------------- refusals */
  if (uncomparableN) {
    refusals.push({
      kind: 'uncomparable',
      detail: `${uncomparableN} pair(s) cannot be compared. No trend is printed over an unreadable pair — each names its own reason on its row.`,
    });
  }
  if (singleWindowN) {
    refusals.push({
      kind: 'single-window',
      detail: `${singleWindowN} watched claim(s) hold exactly one completed review each. The first window is the baseline the second will be read against — watched, not compared.`,
    });
  }
  if (vanishedWindowsN) {
    refusals.push({
      kind: 'vanished-window',
      detail: `${vanishedWindowsN} frozen window(s) name a review that is no longer in the record. A removed review is a hole in the chain: pairs spanning it are refused, never compared across it.`,
    });
  }
  if (unpairedReviewsN) {
    refusals.push({
      kind: 'unpaired-review',
      detail: `${unpairedReviewsN} completed review(s) carry no readable period end, so they cannot be placed in any claim’s consecutive chain. They are counted here, never silently skipped.`,
    });
  }
  if (orphanMarkers.length) {
    refusals.push({
      kind: 'orphan-marker',
      detail: `${orphanMarkers.length} ask marker(s) name a pair that is no longer in the record. The asks stand as history with their snapshots; they are not counted as current asks.`,
    });
  }
  if (excludedN) {
    refusals.push({
      kind: 'excluded',
      detail: `${excludedN} readiness record(s) name a person who is no longer on the active roster. A bench claim about someone who has left is not watched.`,
    });
  }
  refusals.push({
    kind: 'no-rate',
    detail: 'No regression rate is printed. A regression is a dated event on a named claim, not a proportion — and a percentage over a population that was not chosen would be the anecdote the house conventions forbid.',
  });

  /* -------------------------------------------------------------- verdict */
  // DECLARED PRECEDENCE, mirroring the point-in-time register: an unreadable
  // population outranks every substantive reading.
  let verdictKey;
  if (uncomparableN) verdictKey = 'incomplete';
  else if (regressedLatestN) verdictKey = 'regressed';
  else verdictKey = 'watching';
  const board = benchRegressionBoardVerdict(verdictKey);

  return {
    engineVersion: BENCH_REGRESSION_ENGINE_VERSION,
    today,
    conventions: conv,
    verdict: board.key,
    verdictLabel: board.label,
    verdictTone: board.tone,
    verdictDetail: board.detail,
    verdictOpen: board.key === 'regressed' || board.key === 'incomplete',
    rows,
    printedRows,
    findings,
    findingsN: findings.length,
    findingsCappedN: Math.max(0, findings.length - BENCH_REGRESSION_LIMITS.findings),
    printedFindings: findings.slice(0, BENCH_REGRESSION_LIMITS.findings),
    totals: {
      claimsN: claims.length + excludedN,
      watchedN,
      singleWindowN,
      pairedN,
      excludedN,
      pairsN: rows.length,
      latestPairsN: latestPairs.length,
      verdictCounts,
      regressedLatestN,
      asksMatchedN,
      asksPendingN,
      asksNotedN,
      markersN: markers.length,
      orphanMarkersN: orphanMarkers.length,
      vanishedWindowsN,
      unpairedReviewsN,
    },
    reconciles,
    reconcilesDetail,
    figuresComplete,
    figuresCompleteDetail,
    refusals,
  };
}

/* ------------------------------------------------------------------- brief */

const n = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : '—');

/**
 * Identity-free brief text for the regression watch. No person, no seat, no
 * review, no window date, no rating value — counts and verdicts only. The two
 * windows and the two states are printed on the ASK, which is identified work,
 * never here.
 */
export function benchRegressionBriefText(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildBenchRegressionRead(state, { now, settings });
  const c = r.totals.verdictCounts || {};
  const lines = [];
  lines.push('LEADOS — BENCH-CLAIM EVIDENCE REGRESSION WATCH');
  lines.push(`Read on ${r.today}. Every verdict is re-derived on read from frozen previous windows and live later windows; no verdict is stored.`);
  lines.push('');
  lines.push(`Verdict: ${r.verdictLabel} — ${r.verdictDetail}`);
  lines.push('');
  lines.push(`Bench claims in scope: ${n(r.totals.claimsN)} (${n(r.totals.watchedN)} watched, ${n(r.totals.pairedN)} with consecutive windows, ${n(r.totals.excludedN)} excluded as no longer on the roster).`);
  lines.push(`Consecutive pairs: ${n(r.totals.pairsN)} (${n(r.totals.latestPairsN)} latest pairs that can issue).`);
  lines.push(`Regressed latest pairs: ${n(r.totals.regressedLatestN)} — ${n(r.totals.asksMatchedN)} with an issued ask on record, ${n(r.totals.asksPendingN)} awaiting one, ${n(r.totals.asksNotedN)} noted without a seat to address (the scan retries them).`);
  lines.push('');
  lines.push('Pair verdicts (one per consecutive pair, declared precedence, worst first):');
  for (const v of BENCH_REGRESSION_VERDICTS) {
    const count = c[v.key] || 0;
    if (!count) continue;
    lines.push(`  ${v.label}: ${count}`);
  }
  lines.push('');
  lines.push(`Counts reconcile: ${r.reconciles ? 'yes' : 'no'} — ${r.reconcilesDetail}`);
  lines.push(`Pair population complete: ${r.figuresComplete ? 'yes' : 'no'} — ${r.figuresCompleteDetail}`);
  lines.push('');
  lines.push('Comparison: the previous window’s FROZEN reading against the later window read LIVE (a frozen line-awaiting side is re-read live; its basis is printed). Rating gate: the previous window’s frozen rating against the CURRENT rating.');
  lines.push('No person and no manager is scored, ranked or rated by this brief. The subject is bench claims, evidence windows and whether the ground moved.');
  if (r.refusals.length) {
    lines.push('');
    lines.push('Refusals and limits printed with this reading:');
    for (const refusal of r.refusals) lines.push(`  - ${refusal.detail}`);
  }
  return lines.join('\n');
}

/** Aggregate-only CSV cells for scope #127. No identity of any kind. */
export function benchRegressionCsvCells(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildBenchRegressionRead(state, { now, settings });
  const c = r.totals.verdictCounts || {};
  return {
    regression_read_on: r.today,
    regression_comparison: r.conventions.comparison,
    regression_rating_gate: r.conventions.ratingGate,
    regression_claims_n: String(r.totals.claimsN),
    regression_watched_n: String(r.totals.watchedN),
    regression_paired_n: String(r.totals.pairedN),
    regression_pairs_n: String(r.totals.pairsN),
    regression_pairs_latest_n: String(r.totals.latestPairsN),
    regression_regressed_n: String(c.regressed || 0),
    regression_regressed_latest_n: String(r.totals.regressedLatestN),
    regression_rating_moved_n: String(c['rating-moved'] || 0),
    regression_improved_n: String(c.improved || 0),
    regression_stable_n: String(c.stable || 0),
    regression_stable_single_n: String(c['stable-single'] || 0),
    regression_structure_changed_n: String(c['structure-changed'] || 0),
    regression_unresolved_n: String(c.unresolved || 0),
    regression_open_n: String(c.open || 0),
    regression_uncomparable_n: String(c.uncomparable || 0),
    regression_asks_issued_n: String(r.totals.asksMatchedN),
    regression_verdict: r.verdict,
    regression_reconciles: r.reconciles ? 'yes' : 'no',
    regression_complete: r.figuresComplete ? 'yes' : 'no',
  };
}

/* ------------------------------------------------------------------ badge */

/**
 * How many claims the slate owner should look at: a regressed latest pair on a
 * current bench claim. Refusals are counted on the board, not badged — a pair
 * that cannot be compared is exactly the one nobody will notice, but badging
 * it as a regression would be the false alarm this watch refuses to raise.
 */
export function benchRegressionAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildBenchRegressionRead(state, { now, settings });
  return r.findingsN;
}
