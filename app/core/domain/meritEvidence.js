/**
 * app/core/domain/meritEvidence.js — the Cross-Line Review-Evidence Join
 * (ADR-0166, Schema v132 unchanged, `#/merit?panel=matrix`, CSV scope #116).
 *
 * THE DUTY. ADR-0154 prints the pay authority, ADR-0155 prints the structure the
 * money was decided under, and ADR-0147 prints, per review, which lines were
 * asked and which answered. Nothing has ever put the SECOND and the THIRD
 * together. So a November merit decision can print `authority: clear` on a
 * packet whose assessment was written by the home-line manager while the
 * project line that held 40% of the person was never asked a single question
 * about them. The number is not wrong; the EVIDENCE behind it is one line wide,
 * and no surface in the product says so.
 *
 * WHY THIS IS A JOIN AND NOT A NEW MODEL
 * --------------------------------------
 * Both halves already exist and are already trustworthy:
 *
 *   WHICH review a pay decision reads — `comp.js` `ratingIndex(state, asOf)`
 *   picks the LATEST completed review at or before the rating date, and nothing
 *   else. This module calls the very same function, so the join can never
 *   compare a decision to a review the decision was not made from. The rating
 *   date is printed on every row.
 *
 *   HOW that review was run — `reviewStewardship.js` `buildReviewStewardship`
 *   resolves every line in force in the review period, its `performance` right
 *   holders, and the per-line state (`answered` / `declined` / `asked` /
 *   `overdue` / `unasked` / `assessor` / `excluded`). This module reads those
 *   states; it recomputes no right and re-derives no window.
 *
 * The single thing this module adds is the reconciliation between them: did the
 * review that produced this number have the evidence the matrix says it should
 * have had?
 *
 * WHAT IT REFUSES (Bulletproof Reliability Mandate)
 * ------------------------------------------------
 *  - It never falls back to "some other review". A pay decision whose rating
 *    cannot be traced to a completed review reads `unknown`, and the decision is
 *    excluded from every rate — never imputed from a neighbouring review.
 *  - It never invents a line's contribution. ADR-0147 already documents that
 *    feedback, 1:1 notes and delegations carry a SUBJECT and no AUTHORING line,
 *    so no share is printed, and the panel repeats ADR-0147's own words for it.
 *  - It never treats a declined answer as missing evidence. `declined` with a
 *    stated reason is a dated human act and counts toward corroboration.
 *  - It never scores, ranks or rates a person or a manager. Every finding is on
 *    a PAY DECISION and a line's STATE.
 *  - It stores NOTHING. No collection, no field, no migration — every figure is
 *    re-derived on read from the cycle, the roster, the dated reporting lines and
 *    the review records.
 *  - It never lets a withheld figure become a zero: a rate below the declared
 *    floor or over a partial pool is BLANK with its reason on the row.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey } from '../time.js';
import { buildMatrix } from './matrix.js';
import { ratingIndex } from './comp.js';
import { buildReviewStewardship, periodLinesFor } from './reviewStewardship.js';
import { buildMeritStructure } from './meritStructure.js';
// The one cycle picker in the product (ADR-0154): the draft cycle, then the
// latest effective one. Imported rather than copied so the standalone entry
// points below can never be reading a different cycle than the merit page — and
// the embedded block inside `buildMeritParity` always receives the cycle it is
// already reading, so the panel and the money cannot drift apart either way.
import { pickMeritParityCycle } from './meritParity.js';
import {
  MERIT_EVIDENCE_CONVENTIONS,
  MERIT_EVIDENCE_ENGINE_VERSION,
  MERIT_EVIDENCE_FLOOR,
  MERIT_EVIDENCE_LIMITS,
  MERIT_EVIDENCE_OPEN_STATES,
  MERIT_EVIDENCE_STATES,
  MERIT_EVIDENCE_VERDICTS,
  meritEvidenceState,
  meritEvidenceVerdict,
} from './meritEvidenceRegistry.js';

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));

const dayOf = (v) => (isDay(v) ? String(v).trim().slice(0, 10) : null);

/**
 * A rating the pay decision reads must be traceable to a review the workspace
 * still holds. `ratingIndex` returns the rating and the review's date but not its
 * id; this resolves the id by the SAME comparison it used (`completedAt`, then
 * `updatedAt`, latest wins), so the join and the money can never disagree about
 * which review was read.
 */
function reviewForRating(state, personId, ratingDate) {
  const bound = isDay(ratingDate) ? `${ratingDate}T23:59:59.999Z` : null;
  let best = null;
  for (const review of (state?.reviews || [])) {
    if (!review || review.personId !== personId) continue;
    if (review.status !== 'complete') continue;
    const at = String(review.completedAt || review.updatedAt || '');
    if (bound && (!at || at > bound)) continue;
    const score = ['needs-development', 'meets-expectations', 'often-exceeds', 'sets-standard']
      .indexOf(review.manager?.rating) + 1;
    if (!score) continue;
    if (!best || String(best.at) < at) best = { review, at };
  }
  return best ? best.review : null;
}

function emptyCohortTotals() {
  const out = {};
  for (const s of MERIT_EVIDENCE_STATES) out[s.key] = 0;
  return out;
}

function emptyReport(today, refusals) {
  const verdict = meritEvidenceVerdict('no-cycle');
  return {
    engineVersion: MERIT_EVIDENCE_ENGINE_VERSION,
    today,
    hasCycle: false,
    cycleId: null,
    cycleStatus: null,
    currency: null,
    effectiveOn: null,
    ratingAsOf: null,
    conventions: { ...MERIT_EVIDENCE_CONVENTIONS },
    verdict: verdict?.key || 'no-cycle',
    verdictLabel: verdict?.label || 'No merit cycle to read',
    verdictTone: verdict?.tone || 'neutral',
    verdictOpen: false,
    verdictDetail: verdict?.detail || '',
    rows: [],
    findings: [],
    findingsN: 0,
    cappedFindingsN: 0,
    totals: {
      rowsN: 0,
      joinedN: 0,
      unreadableN: 0,
      matrixRowsN: 0,
      singleRowsN: 0,
      stateCounts: emptyCohortTotals(),
      secondLineJoinedN: 0,
      secondLineCleanN: 0,
      secondLineGapN: 0,
      secondLineCleanPct: null,
      cleanPctWithheldReason: 'No cycle.',
      unaskedLinesN: 0,
      silentLinesN: 0,
      askedLinesN: 0,
      answeredLinesN: 0,
      declinedLinesN: 0,
      orphanedN: 0,
      traceableN: 0,
      untraceableN: 0,
    },
    ratePrinted: false,
    rateWithheldReason: 'No cycle.',
    reconciles: true,
    reconcilesDetail: 'There are no rows to reconcile.',
    figuresComplete: false,
    figuresCompleteDetail: 'No cycle, so no figure is supported by the record.',
    refusals,
  };
}

/**
 * Join every pay decision in a cycle to the review it reads.
 *
 * Returns one row per pay decision (never one per person: ADR-0154's duplicate
 * rule applies here too), the aggregate state counts, the second-line rate and
 * two SEPARATE claims — that the counts reconcile, and that every printed figure
 * was complete.
 */
export function buildMeritEvidenceJoin(state, { cycle = null, cycleId = null, now = new Date(), settings = null, moneyComplete = null } = {}) {
  const today = dayKey(now);
  const effective = settings || state?.settings || null;
  // NO SECOND CYCLE PICKER. The caller either hands us the cycle it is already
  // reading (the pay-parity report does exactly that, so the panel, the brief
  // and the export cannot be looking at two different cycles) or names one by
  // id. There is no fallback heuristic here to drift out of step with ADR-0154.
  const chosen = cycle || pickMeritParityCycle(state, cycleId);
  if (!chosen) {
    return emptyReport(today, [{
      kind: 'no-cycle',
      detail: 'There is no merit cycle in this workspace, so there is no pay decision and no review to join it to.',
    }]);
  }

  const effectiveOn = dayOf(chosen.effectiveOn);
  if (!effectiveOn) {
    return emptyReport(today, [{
      kind: 'no-effective-date',
      detail: 'The cycle carries no readable effective date, so the review period and the line set the decision rests on cannot be read and are not invented.',
    }]);
  }

  const refusals = [];
  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const matrix = buildMatrix(state, { now, settings: effective });
  // ADR-0155's as-of home line, reused rather than re-derived: a person who
  // moved AFTER the money landed must not have their evidence read against a
  // structure they were not working under when the review was written.
  const structure = buildMeritStructure(state, { asOf: effectiveOn, now, settings: effective });
  const asOfMatrix = structure?.asOfMatrix || matrix;
  // The date the rating is read for — the same rule `comp.js` applies (never
  // from the future), and the same day the join reads reviews against.
  const ratingAsOf = effectiveOn <= today ? effectiveOn : today;
  const ratings = ratingIndex(state, ratingAsOf);

  const reviewsById = new Map((Array.isArray(state?.reviews) ? state.reviews : [])
    .filter((r) => r && r.id)
    .map((r) => [r.id, r]));

  const sourceRows = Array.isArray(chosen.rows) ? chosen.rows : [];
  const rawRows = sourceRows.slice(0, MERIT_EVIDENCE_LIMITS.rows);
  const overflowN = sourceRows.length - rawRows.length;
  const malformedN = rawRows.filter((r) => !r || typeof r.personId !== 'string' || !r.personId.trim()).length;
  const personCounts = new Map();
  for (const row of rawRows) {
    if (row && typeof row.personId === 'string' && row.personId.trim()) {
      personCounts.set(row.personId, (personCounts.get(row.personId) || 0) + 1);
    }
  }

  const rows = [];
  let unaskedLinesN = 0;
  let silentLinesN = 0;
  let askedLinesN = 0;
  let answeredLinesN = 0;
  let declinedLinesN = 0;
  let orphanedN = 0;
  let untraceableN = 0;

  for (const row of rawRows) {
    if (!row || typeof row.personId !== 'string' || !row.personId.trim()) continue;
    const personId = row.personId;
    const person = peopleById.get(personId) || null;
    const duplicated = personCounts.get(personId) > 1;
    const homeObservation = structure?.perPerson?.get?.(personId) || null;
    const homeUnreadable = Boolean(homeObservation && homeObservation.state === 'unrecorded');

    // The lines in force ON THE EFFECTIVE DATE, read through the SAME as-of
    // matrix the pay authority is read on. A second line that ended in June did
    // not observe a review that closed in December.
    const lines = person
      ? periodLinesFor(asOfMatrix, personId, effectiveOn, effectiveOn, state).filter((l) => l.inPeriod)
      : [];
    const isMatrix = lines.length > 1;

    const rating = ratings.get(personId) || null;
    const review = rating ? reviewForRating(state, personId, ratingAsOf) : null;
    // The stewardship read is computed from the review the MONEY was made from,
    // never from "the most recent review" — a different review has different
    // lines in force and a different set of asks.
    const stewardship = review ? buildReviewStewardship(state, review, { now, settings: effective }) : null;

    let stateKey;
    let detail = '';
    let unaskedN = 0;
    let silentN = 0;
    let answeredN = 0;
    let declinedN = 0;
    let askedN = 0;
    let secondarySettledN = 0;
    let assessorState = null;

    if (duplicated) {
      stateKey = 'unknown';
      detail = 'This person has repeated pay rows in the cycle. No occurrence is selected, so the evidence behind this decision cannot be read.';
    } else if (!person) {
      stateKey = 'unknown';
      detail = 'The pay row names a person who is no longer on the roster, so the lines in force and the review cannot be read.';
    } else if (homeUnreadable) {
      stateKey = 'unknown';
      detail = `The recorded home line for this person does not cover ${effectiveOn}, so the line set this decision rests on is not in the record and is never projected backwards from today’s roster.`;
    } else if (!rating) {
      // No rating at all is NOT an evidence failure — it means the cycle did not
      // read a review for this person. The join says so rather than inventing a
      // review, and the row is counted as untraceable.
      stateKey = 'unknown';
      untraceableN += 1;
      detail = 'The pay decision reads no completed review rating at the rating date. Nothing was joined and no review is substituted.';
    } else if (!review) {
      stateKey = 'unknown';
      untraceableN += 1;
      detail = `A rating was read (${rating.rating}) but the completed review that produced it is not in the record. The evidence cannot be read.`;
    } else {
      const period = stewardship;
      if (!period || !period.personId) {
        stateKey = 'unknown';
        untraceableN += 1;
        detail = 'The review exists but its period cannot be read, so its lines and asks cannot be resolved.';
      } else {
        assessorState = period.assessorState;
        const inPeriod = (period.periodLines || []);
        unaskedN = inPeriod.filter((l) => l.lineState === 'unasked').length;
        silentN = inPeriod.filter((l) => l.lineState === 'overdue').length;
        answeredN = inPeriod.filter((l) => l.lineState === 'answered').length;
        declinedN = inPeriod.filter((l) => l.lineState === 'declined').length;
        // A line ANSWERED or DECLINED whether or not it also holds the assessment
        // right: the assessor line writes the packet, so its own `assessor` state
        // is a settled act and not a gap.
        secondarySettledN = inPeriod.filter((l) => l.role !== 'primary'
          && (l.lineState === 'answered' || l.lineState === 'declined' || l.lineState === 'assessor')).length;
        askedN = inPeriod.filter((l) => l.lineState === 'asked').length;
        orphanedN += (period.orphanRequests?.length || 0) + (period.orphanAnswers?.length || 0);
        unaskedLinesN += unaskedN;
        silentLinesN += silentN;
        answeredLinesN += answeredN;
        declinedLinesN += declinedN;
        askedLinesN += askedN;

        if (assessorState === 'contested') {
          stateKey = 'contested-assessor';
          detail = 'Two or more lines held the `performance` right for this review period. The packet that fed this money has no sole author.';
        } else if (assessorState === 'unowned') {
          stateKey = 'unowned-assessor';
          detail = 'No line in force in the period held the `performance` right. The assessment has no entitled author.';
        } else if (unaskedN > 0) {
          stateKey = 'line-unasked';
          detail = `${unaskedN} line(s) in force in the review period were never asked for input. The rating that fed this pay decision rests on the lines that spoke.`;
        } else if (silentN > 0) {
          stateKey = 'line-silent';
          detail = `${silentN} line(s) were asked and did not answer inside their declared window. Not answering is a dated human act, printed and never counted as evidence.`;
        } else if (!isMatrix) {
          stateKey = 'single-line';
          detail = 'The person sat on exactly one reporting line in the review period, so the matrix does not apply to this decision.';
        } else if (secondarySettledN > 0) {
          stateKey = 'corroborated';
          detail = 'Every line in force in the period was asked and either answered in its own words or declined with a stated reason. A claim about the process, not about the number.';
        } else {
          stateKey = 'home-line-only';
          detail = 'Every line in force was asked, but no line other than the home line contributed an answer. The reading says the assessment rests on one line; it does not call that wrong.';
        }
      }
    }

    const meta = meritEvidenceState(stateKey) || MERIT_EVIDENCE_STATES[0];
    rows.push({
      personId,
      personName: person?.name || null,
      missingPerson: !person,
      duplicated,
      level: row.level || person?.level || null,
      effectiveOn,
      ratingAsOf,
      lineN: lines.length,
      isMatrix,
      // ADR-0155's home line on the effective date, carried so the rule can
      // address the ask to the seat that actually held the pay decision — never
      // to today's pointer over a past decision.
      homeManagerId: homeObservation?.state === 'unrecorded' ? null : (homeObservation?.managerId || null),
      homeManagerName: homeObservation?.state === 'unrecorded' ? null : (homeObservation?.managerName || null),
      rating: rating?.rating || null,
      ratingAt: rating?.at || null,
      // Printed because the join's whole claim is "this review, not any review".
      reviewId: review?.id || null,
      reviewPeriodStart: review?.periodStart || null,
      reviewPeriodEnd: review?.periodEnd || null,
      assessorState,
      unaskedN,
      silentN,
      askedN,
      answeredN,
      declinedN,
      evidenceState: stateKey,
      evidenceLabel: meta.label,
      evidenceTone: meta.tone,
      evidenceOpen: meta.open,
      detail,
      // A row is `blocking` when its evidence state is unknown: a figure cannot
      // be supported, so every rate is withheld over it (fail closed).
      blocking: stateKey === 'unknown',
    });
  }

  const stateCounts = emptyCohortTotals();
  for (const r of rows) stateCounts[r.evidenceState] = (stateCounts[r.evidenceState] || 0) + 1;

  const excludedN = rows.filter((r) => r.duplicated || r.missingPerson).length;
  const partialPool = excludedN > 0 || overflowN > 0 || malformedN > 0;
  const blockingN = rows.filter((r) => r.blocking).length;

  // The population the finding is about: second-line pay decisions whose review
  // was read. Single-line decisions and unreadable ones are excluded and named.
  const secondLine = rows.filter((r) => r.isMatrix && !r.blocking && r.evidenceState !== 'single-line');
  const secondLineJoinedN = secondLine.length;
  const secondLineCleanN = secondLine.filter((r) => r.evidenceState === 'corroborated').length;
  const secondLineGapN = secondLine.filter((r) => r.evidenceOpen || r.evidenceState === 'home-line-only').length;

  let rateWithheldReason = '';
  if (partialPool) {
    rateWithheldReason = `The pay pool is incomplete: ${excludedN} excluded row(s), ${malformedN} malformed and ${overflowN} beyond the read limit. The joined population is not the whole cycle, so no rate is printed.`;
  } else if (blockingN > 0) {
    rateWithheldReason = `${blockingN} pay decision(s) cannot be traced to a readable review. Printing a rate over the readable remainder would present a narrowed population as the cycle’s evidence base.`;
  } else if (secondLineJoinedN < MERIT_EVIDENCE_FLOOR) {
    rateWithheldReason = `Only ${secondLineJoinedN} second-line pay decision(s) were joined, against a declared floor of ${MERIT_EVIDENCE_FLOOR}. A percentage over this few is an anecdote; the counts are printed instead.`;
  }
  const ratePrinted = !rateWithheldReason;
  const secondLineCleanPct = ratePrinted
    ? Math.trunc((secondLineCleanN * 10000) / secondLineJoinedN) / 100
    : null;

  let verdictKey;
  if (partialPool || blockingN > 0) verdictKey = 'incomplete';
  else if (secondLineJoinedN === 0) verdictKey = 'single-line';
  else if (secondLineGapN > 0) verdictKey = 'gap';
  else verdictKey = 'corroborated';
  const verdictMeta = meritEvidenceVerdict(verdictKey) || MERIT_EVIDENCE_VERDICTS[0];

  if (overflowN) refusals.push({ kind: 'partial-pool', detail: `${overflowN} further pay row(s) were beyond the bounded read of ${MERIT_EVIDENCE_LIMITS.rows} and are NOT included in any figure.` });
  if (malformedN) refusals.push({ kind: 'partial-pool', detail: `${malformedN} pay row(s) have no readable person id and cannot be joined to a review.` });
  if (excludedN) refusals.push({ kind: 'partial-pool', detail: `${excludedN} pay row(s) name a person off the roster or are repeated; every occurrence is excluded and counted, and no review is chosen on their behalf.` });
  if (untraceableN) refusals.push({ kind: 'no-completed-review', detail: `${untraceableN} pay decision(s) read a rating the workspace cannot trace to a readable completed review. They read UNKNOWN, are excluded from every rate, and no other review is substituted.` });
  if (orphanedN) refusals.push({ kind: 'orphaned-stewardship', detail: `${orphanedN} stored ask(s) or answer(s) name a reporting line that no longer resolves on this person. They are kept by the review reader and reported here rather than reassigned.` });
  if (!ratePrinted) refusals.push({ kind: secondLineJoinedN < MERIT_EVIDENCE_FLOOR && !partialPool && !blockingN ? 'cohort-below-floor' : 'partial-pool', detail: rateWithheldReason });

  const findings = [];
  for (const r of rows) {
    if (!r.evidenceOpen) continue;
    findings.push({
      kind: r.evidenceState,
      personId: r.personId,
      personName: r.personName,
      lineN: r.lineN,
      reviewId: r.reviewId,
      unaskedN: r.unaskedN,
      silentN: r.silentN,
      detail: r.detail,
    });
  }
  const findingsCapped = findings.slice(0, MERIT_EVIDENCE_LIMITS.findings);

  // Two claims, kept apart on purpose (North Star, Bulletproof Reliability):
  // `reconciles` says the printed counts add up to the rows printed; `figuresComplete`
  // says every figure that WAS printed is computed from the record and nothing
  // needed is missing. Neither is allowed to stand in for the other.
  const reconciles = rows.length === rawRows.length - malformedN
    && Object.values(stateCounts).reduce((a, n) => a + n, 0) === rows.length
    && secondLineCleanN + secondLineGapN <= secondLineJoinedN
    && secondLineJoinedN <= rows.length;
  // ADR-0154 owns the MONEY gate (an unpriced pay row, a missing proposal, a
  // capped pool). When this join is computed from inside that report it is handed
  // the money verdict, because a join whose denominators are priced rows must not
  // print `figuresComplete` over a pool the money reader has already refused.
  // Standalone, the gate is simply absent — never assumed to be `true`.
  const moneyBlocked = moneyComplete === false;
  const figuresComplete = reconciles
    && !partialPool
    && blockingN === 0
    && !moneyBlocked
    && rows.length > 0
    && (ratePrinted || secondLineJoinedN === 0);

  return {
    engineVersion: MERIT_EVIDENCE_ENGINE_VERSION,
    today,
    hasCycle: true,
    cycleId: chosen.id,
    cycleStatus: chosen.status,
    currency: chosen.currency || 'USD',
    effectiveOn,
    ratingAsOf,
    conventions: { ...MERIT_EVIDENCE_CONVENTIONS },
    verdict: verdictMeta.key,
    verdictLabel: verdictMeta.label,
    verdictTone: verdictMeta.tone,
    verdictOpen: verdictMeta.open,
    verdictDetail: verdictMeta.detail,
    rows,
    findings: findingsCapped,
    findingsN: findings.length,
    cappedFindingsN: Math.max(0, findings.length - findingsCapped.length),
    totals: {
      rowsN: rows.length,
      joinedN: rows.filter((r) => !r.blocking).length,
      unreadableN: blockingN,
      matrixRowsN: rows.filter((r) => r.isMatrix).length,
      singleRowsN: rows.filter((r) => !r.isMatrix).length,
      stateCounts,
      secondLineJoinedN,
      secondLineCleanN,
      secondLineGapN,
      secondLineCleanPct,
      cleanPctWithheldReason: rateWithheldReason,
      unaskedLinesN,
      silentLinesN,
      askedLinesN,
      answeredLinesN,
      declinedLinesN,
      orphanedN,
      traceableN: rows.filter((r) => r.reviewId).length,
      untraceableN,
    },
    ratePrinted,
    rateWithheldReason,
    reconciles,
    reconcilesDetail: reconciles
      ? `The ${rows.length} joined pay decision(s) equal the stored rows, the ${Object.values(stateCounts).reduce((a, n) => a + n, 0)} printed state counts equal those rows, and the second-line population ${secondLineJoinedN} is a subset of them.`
      : 'The printed counts do NOT add up to the rows printed. No figure on this page is supported until that is resolved.',
    figuresComplete,
    figuresCompleteDetail: figuresComplete
      ? 'Every printed figure is the computed figure, and every review the cycle reads was found and read.'
      : moneyBlocked
        ? 'The pay-pool reading this join is computed beside is itself incomplete (an unpriced or capped pay row), so no evidence figure is declared complete over it.'
        : rateWithheldReason || 'A needed figure is missing; the affected reading is withheld rather than narrowed.',
    refusals,
    openStates: [...MERIT_EVIDENCE_OPEN_STATES],
  };
}

/** Attention badge: pay decisions in this cycle whose evidence is open. */
export function meritEvidenceAttentionCount(state, { cycle = null, cycleId = null, now = new Date(), settings = null } = {}) {
  const r = buildMeritEvidenceJoin(state, { cycle, cycleId, now, settings });
  if (!r.hasCycle) return 0;
  return r.rows.filter((row) => row.evidenceOpen).length;
}

/**
 * The identity-free brief a VP can put in a pack. The evidence claim is printed
 * as its own paragraph, separate from the authority and parity claims ADR-0154
 * already owns, because "the money had an owner" and "the evidence was complete"
 * are different facts.
 */
export function meritEvidenceBriefText(state, { cycle = null, cycleId = null, now = new Date(), settings = null } = {}) {
  const r = buildMeritEvidenceJoin(state, { cycle, cycleId, now, settings });
  if (!r.hasCycle) {
    return `Cross-line review evidence — ${r.today}: there is no merit cycle in this workspace, so there is no pay decision to join to a review.`;
  }
  const lines = [
    `Cross-line review evidence — ${r.today}, cycle effective ${r.effectiveOn}.`,
    `Pay decisions joined: ${r.totals.rowsN}; ${r.totals.traceableN} traced to a completed review, ${r.totals.untraceableN} could not be.`,
    `Evidence states: ${MERIT_EVIDENCE_STATES
      .filter((s) => (r.totals.stateCounts[s.key] || 0) > 0)
      .map((s) => `${r.totals.stateCounts[s.key]} ${s.label.toLowerCase()}`)
      .join('; ') || 'none'}.`,
  ];
  if (r.ratePrinted) {
    lines.push(`Second-line pay decisions: ${r.totals.secondLineJoinedN}, of which ${r.totals.secondLineCleanN} rest on a review every line answered (${r.totals.secondLineCleanPct}%). Verdict: ${r.verdictLabel.toLowerCase()}. This is a PROCEDURE finding about the evidence base, never a rating of a person or a manager.`);
  } else {
    lines.push(`Second-line evidence rate: REFUSED. ${r.rateWithheldReason}`);
  }
  if (r.totals.unaskedLinesN) lines.push(`${r.totals.unaskedLinesN} line(s) in force across these reviews were never asked for input; ${r.totals.silentLinesN} were asked and did not answer inside their window.`);
  lines.push(`Declared floor ${MERIT_EVIDENCE_FLOOR} second-line decisions before a rate is printed. The export carries no name, no manager id, no rating and no review id.`);
  return lines.join(' ');
}

/* --------------------------------------------------------------------- CSV */

/**
 * Aggregate-only rows for CSV scope #116, exported beside the ADR-0154/0155
 * columns. The columns are APPENDED to the existing header so a consumer
 * reading by header is unaffected. NO person, NO name, NO manager id, NO
 * rating, NO review id, NO salary.
 */
export function meritEvidenceCsvCells(state, { cycle = null, cycleId = null, now = new Date(), settings = null } = {}) {
  const r = buildMeritEvidenceJoin(state, { cycle, cycleId, now, settings });
  if (!r.hasCycle) {
    return {
      evidence_joined_n: '0',
      evidence_unreadable_n: '0',
      evidence_corroborated_n: '0',
      evidence_home_line_only_n: '0',
      evidence_line_unasked_n: '0',
      evidence_line_silent_n: '0',
      evidence_contested_assessor_n: '0',
      evidence_unowned_assessor_n: '0',
      evidence_single_line_n: '0',
      second_line_joined_n: '0',
      second_line_clean_n: '0',
      second_line_gap_n: '0',
      second_line_clean_pct: '',
      evidence_verdict: 'no-cycle',
      evidence_reconciles: 'yes',
      evidence_complete: 'no',
    };
  }
  const c = r.totals.stateCounts || {};
  const n = (key) => String(c[key] || 0);
  return {
    evidence_joined_n: String(r.totals.joinedN),
    evidence_unreadable_n: String(r.totals.unreadableN),
    evidence_corroborated_n: n('corroborated'),
    evidence_home_line_only_n: n('home-line-only'),
    evidence_line_unasked_n: n('line-unasked'),
    evidence_line_silent_n: n('line-silent'),
    evidence_contested_assessor_n: n('contested-assessor'),
    evidence_unowned_assessor_n: n('unowned-assessor'),
    evidence_single_line_n: n('single-line'),
    second_line_joined_n: String(r.totals.secondLineJoinedN),
    second_line_clean_n: String(r.totals.secondLineCleanN),
    second_line_gap_n: String(r.totals.secondLineGapN),
    second_line_clean_pct: r.totals.secondLineCleanPct === null ? '' : String(r.totals.secondLineCleanPct),
    evidence_verdict: r.verdict,
    evidence_reconciles: r.reconciles ? 'yes' : 'no',
    evidence_complete: r.figuresComplete ? 'yes' : 'no',
  };
}
