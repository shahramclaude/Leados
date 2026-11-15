/**
 * app/core/domain/justCulture.js — the pure reader of the Just Culture Decision
 * Record (ADR-0218, Schema v172, `#/just-culture`).
 *
 * ONE READER. Every row, count, state, finding and attention figure the screen
 * prints is computed here, from the stored reviews and acts and the live matrix,
 * and nothing is stored as a derived figure. The screen formats what this function
 * returns; a test proves that the printed figures are these figures.
 *
 * TWO CLAIMS, PRINTED SEPARATELY (Bulletproof Reliability Mandate). `reconciles`
 * says the per-state counts add up to the number of reviews held. `printedAreComputed`
 * is a property of the screen (asserted in the test suite), not of this object. They
 * are different facts and this reader never collapses them into one word.
 *
 * DISCLOSURE. A review is an individual record, so a seat receives the full row only
 * where the seat engine grants `full` on the `individual` class: the manager altitude
 * and below, for people in its span or on a declared line. Everything else is a count.
 * Per-line counts are withheld below `lineFloorN` reviews, and every withheld cell is
 * counted and explained rather than dropped.
 */

import { dayKey } from '../time.js';
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { canSee } from './seat.js';
import {
  normalizeJustCultureActs,
  normalizeJustCultureReviews,
} from './justCultureSchema.js';
import {
  JC_RESPONSES,
  JC_STATES,
  JUST_CULTURE_ADR,
  JUST_CULTURE_ENGINE_VERSION,
  JUST_CULTURE_LIMITS as L,
  JUST_CULTURE_METHOD,
  justCultureExpectation,
  justCultureLabel,
} from './justCultureRegistry.js';

export const JUST_CULTURE_COLLECTION = 'justCultureReviews';

/** The actor a seat acts as: the operator is the leader, a declared seat is its node. */
export function justCultureActorId(seat) {
  if (!seat) return null;
  return seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id || null);
}

/** The matrix, built with no seat so the reader never depends on who is looking. */
export function justCultureMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

const nameOf = (matrix, id) => {
  if (!id) return null;
  const node = matrix?.nodes?.get(id);
  return (node && node.name) || id;
};

/** The unique managers a person holds right now, on the home line and on every declared line. */
export function justCultureManagerIds(matrix, personId) {
  const lines = (matrix.linesByPerson.get(personId) || []).filter((line) => line.active !== false);
  return [...new Set(lines.map((line) => line.managerId).filter(Boolean))];
}

/**
 * Derive ONE review's state from its acts and the live matrix. Pure. The state
 * order is fixed: withdrawn, then orphaned (the deciding line no longer holds the
 * person, whatever else has happened), then awaiting-decision, then contested, then
 * awaiting-concurrence, then settled. Orphaned is printed before anything else
 * because nothing else can be settled by a line that is no longer there.
 */
export function deriveJustCultureReview(review, acts, matrix) {
  const mine = acts.filter((act) => act.reviewId === review.id);
  const withdrawnAct = mine.find((act) => act.kind === 'withdrawn') || null;
  let decisionIdx = -1;
  mine.forEach((act, index) => { if (act.kind === 'decided' || act.kind === 'revised') decisionIdx = index; });
  const decision = decisionIdx >= 0 ? mine[decisionIdx] : null;
  const after = decision ? mine.slice(decisionIdx + 1) : [];
  const managerIds = justCultureManagerIds(matrix, review.personId);
  const orphaned = !managerIds.includes(review.decidingManagerId);
  const required = managerIds.filter((id) => id !== review.decidingManagerId);
  const concurrence = required.map((managerId) => {
    const act = after.find((row) => (row.kind === 'concurred' || row.kind === 'dissented') && row.byId === managerId) || null;
    return {
      managerId,
      name: nameOf(matrix, managerId),
      verdict: act ? (act.kind === 'concurred' ? 'concurred' : 'dissented') : 'owed',
      on: act ? act.on : null,
      note: act ? act.note : '',
    };
  });
  const owed = concurrence.filter((row) => row.verdict === 'owed');
  const dissented = concurrence.filter((row) => row.verdict === 'dissented');
  let state;
  if (withdrawnAct) state = 'withdrawn';
  else if (orphaned) state = 'orphaned';
  else if (!decision) state = 'awaiting-decision';
  else if (dissented.length) state = 'contested';
  else if (owed.length) state = 'awaiting-concurrence';
  else state = 'settled';

  const expectation = decision ? justCultureExpectation(decision.answers) : null;
  const revisions = mine.filter((act) => act.kind === 'revised').length;
  return {
    id: review.id,
    personId: review.personId,
    personName: nameOf(matrix, review.personId),
    eventOn: review.eventOn,
    openedOn: review.openedOn,
    eventSummary: review.eventSummary,
    eventRef: review.eventRef,
    decidingManagerId: review.decidingManagerId,
    deciderName: nameOf(matrix, review.decidingManagerId),
    managerIds,
    lineCount: managerIds.length,
    state,
    stateLabel: justCultureLabel(JC_STATES, state)?.label || state,
    withdrawn: Boolean(withdrawnAct),
    orphaned,
    contested: dissented.length > 0,
    concurrence,
    owedLines: owed.map((row) => ({ managerId: row.managerId, name: row.name })),
    decision: decision ? {
      kind: decision.kind,
      on: decision.on,
      answers: decision.answers,
      response: decision.response,
      responseLabel: justCultureLabel(JC_RESPONSES, decision.response)?.label || decision.response,
      expectedResponse: expectation.response,
      expectedLabel: justCultureLabel(JC_RESPONSES, expectation.response)?.label || expectation.response,
      path: expectation.path,
      followsAnswers: decision.response === expectation.response,
      departureReason: decision.departureReason || '',
      systemAction: decision.systemAction || '',
      byId: decision.byId,
      byName: nameOf(matrix, decision.byId),
      revisions,
    } : null,
  };
}

/** The seat's disclosure verdict for ONE review. `full` is the only grant that prints a row. */
function reviewGrant(seat, review) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  return canSee({ id: review.id, personId: review.personId }, JUST_CULTURE_COLLECTION, seat, null).allow;
}

/**
 * The whole report. Pure: every figure is re-derived on each call.
 */
export function buildJustCultureReport(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const asOf = dayKey(at);
  const reviews = normalizeJustCultureReviews(state?.justCultureReviews, warnings);
  const acts = normalizeJustCultureActs(state?.justCultureActs, reviews, warnings);
  let matrix = null;
  let matrixError = null;
  try {
    matrix = justCultureMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    matrixError = `The reporting graph could not be read, so ownership and concurrence cannot be computed: ${error?.message || 'unknown error'}.`;
  }
  const actorId = justCultureActorId(seat);
  const derived = matrix ? reviews.map((review) => deriveJustCultureReview(review, acts, matrix)) : [];

  // Line aggregates are counts over EVERY review — a count discloses no person —
  // and are withheld below the floor, with the withholding counted.
  const byState = Object.fromEntries(JC_STATES.map((row) => [row.key, 0]));
  for (const row of derived) byState[row.state] += 1;
  const stateSum = Object.values(byState).reduce((sum, n) => sum + n, 0);

  const lineMap = new Map();
  for (const row of derived) {
    if (!lineMap.has(row.decidingManagerId)) lineMap.set(row.decidingManagerId, []);
    lineMap.get(row.decidingManagerId).push(row);
  }
  const lines = [...lineMap.entries()].map(([managerId, rows]) => {
    const reviewsN = rows.length;
    const withheld = reviewsN < L.lineFloorN;
    if (withheld) {
      return {
        managerId, managerName: nameOf(matrix, managerId), reviewsN, withheld: true,
        withheldReason: `Fewer than ${L.lineFloorN} reviews held by this line: its counts are withheld, not shown as zero.`,
        byState: null, responses: null, departsN: null, contestedN: null, orphanedN: null,
      };
    }
    const lineByState = Object.fromEntries(JC_STATES.map((s) => [s.key, 0]));
    const responses = Object.fromEntries(JC_RESPONSES.map((r) => [r.key, 0]));
    let departsN = 0;
    for (const row of rows) {
      lineByState[row.state] += 1;
      if (row.decision) {
        responses[row.decision.response] += 1;
        if (!row.decision.followsAnswers) departsN += 1;
      }
    }
    return {
      managerId, managerName: nameOf(matrix, managerId), reviewsN, withheld: false, withheldReason: '',
      byState: lineByState,
      responses,
      departsN,
      contestedN: lineByState.contested,
      orphanedN: lineByState.orphaned,
    };
  }).sort((a, b) => b.reviewsN - a.reviewsN || String(a.managerName).localeCompare(String(b.managerName)));
  const withheldLines = lines.filter((line) => line.withheld).length;

  // Rows: only what this seat is granted in full. Everything else is counted.
  const visible = derived.filter((row) => reviewGrant(seat, { id: row.id, personId: row.personId }) === 'full');
  const hiddenN = derived.length - visible.length;
  const rows = visible
    .slice()
    .sort((a, b) => (b.openedOn < a.openedOn ? -1 : b.openedOn > a.openedOn ? 1 : 0) || (a.id < b.id ? -1 : 1))
    .map((row) => ({
      ...row,
      owedByMe: Boolean(actorId) && (
        (row.state === 'awaiting-decision' && (seat.fullAccess || row.decidingManagerId === actorId))
        || (row.state === 'awaiting-concurrence' && row.owedLines.some((line) => seat.fullAccess || line.managerId === actorId))
        || (row.state === 'contested' && (seat.fullAccess || row.decidingManagerId === actorId))
        || (row.state === 'orphaned' && (seat.fullAccess || row.decidingManagerId === actorId))
      ),
    }));
  const shown = rows.slice(0, L.reviewsShown);

  // Attention: only what THIS seat owes. Counted from the visible rows, so a seat
  // is never told about a review it may not read.
  const attention = rows.filter((row) => row.owedByMe).length;

  const perLine = {
    'awaiting-decision': 'deciding line owes the answers',
    'awaiting-concurrence': 'another line the person holds owes a concurrence or dissent',
    'contested': 'a dissent is open',
    'orphaned': 'the deciding line has ended',
  };

  return {
    engineVersion: JUST_CULTURE_ENGINE_VERSION,
    adr: JUST_CULTURE_ADR,
    asOf,
    seat: seat ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) } : null,
    matrixError,
    warnings,
    totals: {
      reviewsN: reviews.length,
      actsN: acts.length,
      byState,
      stateSum,
      /** The per-state counts add up to the reviews held. A separate claim from the screen's printed = computed. */
      reconciles: stateSum === reviews.length,
      visibleN: visible.length,
      hiddenN,
      hiddenReason: hiddenN
        ? `${hiddenN} review(s) are counted, not shown: this seat is not granted the individual record for them (the manager altitude and the people in its span or on a declared line).`
        : '',
      departsN: derived.filter((row) => row.decision && !row.decision.followsAnswers).length,
      /** Decisions taken, counted per response over EVERY review. Seat-independent. */
      responses: Object.fromEntries(JC_RESPONSES.map((row) => [row.key, derived.filter((r) => r.decision && r.decision.response === row.key).length])),
      /** False when the reporting graph could not be read: the state counts are then unknown, not zero. */
      stateCountsKnown: matrix !== null,
      withheldLines,
    },
    rows: shown,
    rowsShown: shown.length,
    rowsCapped: rows.length - shown.length,
    lines,
    attention,
    attentionReason: attention ? 'Reviews where this seat owes the answers, a concurrence, or a new owner.' : '',
    perLine,
    method: JUST_CULTURE_METHOD,
  };
}

/** The attention figure on the navigation badge — the same number the panel prints. */
export function justCultureAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  return buildJustCultureReport(state, { now, settings, seat }).attention;
}

/**
 * The people a seat may open a review for: those it holds on at least one line, with
 * every line each one holds. The operator sees everyone. A seat that holds nobody
 * gets an empty list and a printed reason, not a silent empty.
 */
export function justCultureCandidates(state, { now = new Date(), settings = null, seat = null } = {}) {
  const actorId = justCultureActorId(seat);
  if (!actorId) return { candidates: [], reason: 'No seat resolved.' };
  let matrix;
  try {
    matrix = justCultureMatrix(state, now instanceof Date ? now : new Date(now), settings || state?.settings || null);
  } catch (error) {
    return { candidates: [], reason: `The reporting graph could not be read: ${error?.message || 'unknown error'}.` };
  }
  const people = (state?.people || []).filter((person) => person && person.status !== 'archived');
  const candidates = [];
  for (const person of people) {
    if (person.id === actorId) continue;
    const lines = (matrix.linesByPerson.get(person.id) || []).filter((line) => line.active !== false);
    const held = seat.fullAccess ? lines : lines.filter((line) => line.managerId === actorId);
    if (!held.length) continue;
    candidates.push({
      personId: person.id,
      personName: nameOf(matrix, person.id),
      lines: lines.map((line) => ({ managerId: line.managerId, managerName: nameOf(matrix, line.managerId), kind: line.kind || 'home' })),
      heldByMe: held.map((line) => line.managerId),
    });
  }
  candidates.sort((a, b) => String(a.personName).localeCompare(String(b.personName)));
  return {
    candidates,
    reason: candidates.length ? '' : 'No person on the reporting graph is held by this seat. A review can only be opened by a manager of the person.',
  };
}

/**
 * CSV #160: one summary row, one row per review state and one per response. Built
 * from the SAME reader the panel renders, with no seat — every figure is seat-
 * independent, and no identity is reachable from the aggregate. A count the reader
 * cannot compute is BLANK with its reason, never a zero.
 */
export function justCultureCsvRows(report) {
  if (!report || !report.totals) return [];
  const asOf = report.asOf;
  const t = report.totals;
  const known = t.stateCountsKnown !== false;
  const blank = known ? '' : 'matrix_unreadable';
  const rows = [{ as_of: asOf, row_kind: 'summary', key: 'reviews_held', count: t.reviewsN, blank_reason: '' }];
  rows.push({ as_of: asOf, row_kind: 'summary', key: 'departs_from_answers', count: known ? t.departsN : '', blank_reason: blank });
  for (const row of JC_STATES) {
    rows.push({ as_of: asOf, row_kind: 'state', key: row.key, count: known ? t.byState[row.key] : '', blank_reason: blank });
  }
  for (const row of JC_RESPONSES) {
    rows.push({ as_of: asOf, row_kind: 'response', key: row.key, count: known ? t.responses[row.key] : '', blank_reason: blank });
  }
  return rows;
}

