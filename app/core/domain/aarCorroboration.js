/**
 * app/core/domain/aarCorroboration.js — Cross-Line After-Action Corroboration &
 * Lesson-Adoption Parity: the pure reader (ADR-0188, Schema v149,
 * `#/learning?panel=cross-line`, CSV #141).
 *
 * Pure module. No storage, no clock globals, no DOM. Every state, currentness
 * verdict, coverage figure and parity verdict below is recomputed on read from
 * the live AAR ledger (`retros`), the live matrix graph (`buildMatrix`,
 * `matrixJointApex`) and the append-only request / answer / adoption ledgers.
 * Nothing derived is stored, so a printed figure is the computed figure by
 * construction.
 *
 * THE ONE SENTENCE THIS MODULE EXISTS TO MAKE PRINTABLE:
 *   "This review was written by one line; three lines carried the event; one has
 *    agreed, one disputes the cause, and one was never asked — and the lesson the
 *    author marks applied has been adopted by one line and refused by another."
 *
 * WHAT IT WILL NOT DO
 *  - It will not read silence as agreement. `unrequested`, `pending`, `overdue`
 *    and `expired` are four distinct states and none counts toward coverage.
 *  - It will not rewrite the AAR ledger. The lesson's `applied` state remains the
 *    author's claim and is printed BESIDE parity, never replaced by it.
 *  - It will not rate a person. Every outcome describes an ACCOUNT or a LESSON.
 *  - It will not guess a line. A participant whose active line set cannot be read
 *    makes the affected rows `unverifiable` / `unattributable`, with the reason.
 *  - It will not substitute the home line for an ambiguous joint apex.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canonicalJson } from './sealCrypto.js';
import {
  AAR_ADOPTION_STATES,
  AAR_CORROBORATION_ADR,
  AAR_CORROBORATION_CSV_COLUMNS,
  AAR_CORROBORATION_DETAIL_REASONS,
  AAR_CORROBORATION_ENGINE_VERSION,
  AAR_CORROBORATION_LIMITS,
  AAR_CORROBORATION_OUTCOMES,
  AAR_CORROBORATION_READ_REFUSALS,
  AAR_CORROBORATION_RULE_ID,
  AAR_CORROBORATION_STATES,
  AAR_PARITY_VERDICTS,
  aarAdoptionState,
  aarCorroborationOutcome,
  aarCorroborationState,
  aarParityVerdict,
} from './aarCorroborationRegistry.js';
import { normalizeAarCorroborationSettings } from './aarCorroborationSchema.js';

const clean = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => (typeof value === 'string' ? value.trim() : '');
const day = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const sortedText = (values) => [...new Set((Array.isArray(values) ? values : [])
  .filter((value) => typeof value === 'string' && value))].sort((a, b) => a.localeCompare(b));

const STATE_BY_KEY = new Map(AAR_CORROBORATION_STATES.map((row) => [row.key, row]));
const STATE_SEVERITY = new Map(AAR_CORROBORATION_STATES.map((row) => [row.key, row.severity]));
const PARITY_BY_KEY = new Map(AAR_PARITY_VERDICTS.map((row) => [row.key, row]));
const ADOPTION_BY_KEY = new Map(AAR_ADOPTION_STATES.map((row) => [row.key, row]));
const OUTCOME_COUNTS_AS = new Map(AAR_CORROBORATION_OUTCOMES.map((row) => [row.key, row.countsAsCorroboration]));

/** The declared read refusal keys, exported so the suite can prove the closed set. */
export const AAR_CORROBORATION_DECLARED_REFUSALS = Object.freeze(
  AAR_CORROBORATION_READ_REFUSALS.map((row) => row.key),
);

/* ------------------------------------------------------------- small helpers */

function personName(matrix, peopleById, personId) {
  if (!personId) return 'Unknown';
  if (personId === LEADER_ID) return matrix?.nodes?.get?.(LEADER_ID)?.name || 'Workspace leader';
  return matrix?.nodes?.get?.(personId)?.name || peopleById.get(personId)?.name || 'Former roster member';
}

function managerLabel(matrix, peopleById, managerId) {
  if (!managerId) return 'Unknown';
  if (managerId === LEADER_ID) return matrix?.nodes?.get?.(LEADER_ID)?.name || 'Workspace leader';
  return matrix?.nodes?.get?.(managerId)?.name || peopleById.get(managerId)?.name || 'Former roster member';
}

/** Every active line a person holds, read from the ONE canonical matrix engine. */
function activeLinesFor(matrix, personId) {
  if (!matrix?.linesByPerson?.get) return null;
  if (!matrix.roster?.has?.(personId)) return null;
  const lines = matrix.linesByPerson.get(personId) || [];
  return lines.filter((line) => line && line.active !== false);
}

/**
 * The frozen material context of a review for one line's request.
 *
 * It freezes exactly what a line has to have seen to answer honestly: the
 * review's own account, the lesson under review, every participant and the
 * COMPLETE active line set each participant held. It deliberately does not
 * freeze unrelated workspace state, so an ordinary edit elsewhere does not
 * invalidate every line's answer — and it deliberately DOES freeze the line set,
 * so a reorganisation that moves a participant does.
 */
export function aarCorroborationSnapshot(state, retro, { matrix, lessonId = null, holderId = null } = {}) {
  if (!retro || !matrix) return { ok: false, reason: 'The review or the live Matrix graph cannot be read.', refusal: 'subject-unlinked' };
  if (retro.status !== 'held') {
    return { ok: false, reason: 'The review has not been held, so no line can corroborate an account that does not yet exist.', refusal: 'review-not-held' };
  }
  const participants = sortedText(retro.participants);
  if (!participants.length) {
    return { ok: false, reason: 'The review names no participants, so there is no line set to ask.', refusal: 'no-multi-line-participant' };
  }
  if (participants.length > AAR_CORROBORATION_LIMITS.participants) {
    return { ok: false, reason: `The participant set exceeds the ${AAR_CORROBORATION_LIMITS.participants}-person snapshot limit.`, refusal: 'lines-unresolvable' };
  }

  const lessons = Array.isArray(retro.lessons) ? retro.lessons : [];
  const lesson = lessonId ? (lessons.find((row) => row && row.id === lessonId) || null) : null;
  if (lessonId && !lesson) {
    return { ok: false, reason: 'That lesson is not part of this review.', refusal: 'no-lesson-under-review' };
  }
  // A review with no lesson still has an ACCOUNT, and every line that carried the
  // event still owes an answer about it. `no-lesson-under-review` therefore
  // refuses only a request that NAMES a lesson the review does not carry (handled
  // above); an account-level request on a lesson-free review is legitimate.

  const peopleById = new Map((Array.isArray(state?.people) ? state.people : []).map((p) => [p?.id, p]));
  const people = [];
  const lines = [];
  let unresolvable = null;
  for (const personId of participants) {
    const person = peopleById.get(personId) || matrix.nodes?.get?.(personId) || null;
    if (!person) { unresolvable = unresolvable || 'A named participant is no longer on the roster.'; continue; }
    const active = activeLinesFor(matrix, personId);
    if (!active || !active.length) {
      unresolvable = unresolvable || 'A named participant has no readable active Matrix line.';
      continue;
    }
    if (active.length > AAR_CORROBORATION_LIMITS.snapshotLines) {
      unresolvable = unresolvable || `A participant holds more than ${AAR_CORROBORATION_LIMITS.snapshotLines} active lines.`;
      continue;
    }
    const defects = (matrix.defects || []).filter((defect) => defect?.personId === personId);
    if (defects.length) { unresolvable = unresolvable || 'The Matrix cannot verify every active line for a named participant.'; continue; }

    people.push({
      id: personId,
      name: clean(person.name, 120) || personId,
      role: clean(person.role, 120),
      team: clean(person.team, 80),
      managerId: id(person.rawManagerId || person.managerId) || LEADER_ID,
    });
    for (const line of active) {
      lines.push({
        lineKey: String(line.id || ''),
        personId,
        role: line.role === 'primary' ? 'primary' : 'secondary',
        managerId: id(line.managerId),
        managerName: managerLabel(matrix, peopleById, line.managerId),
        kind: clean(line.kind, 48),
        fromISO: day(line.fromISO),
        toISO: day(line.toISO),
      });
    }
  }
  if (unresolvable) return { ok: false, reason: unresolvable, refusal: 'lines-unresolvable' };
  if (!people.length) return { ok: false, reason: 'No participant of this review can be resolved to an active line.', refusal: 'lines-unresolvable' };
  if (lines.some((line) => !line.lineKey || !line.managerId || !line.managerName)) {
    return { ok: false, reason: 'At least one active Matrix line of a participant is incomplete; the set of lines that owe an answer is not verifiable.', refusal: 'lines-unresolvable' };
  }
  lines.sort((a, b) => a.lineKey.localeCompare(b.lineKey));
  const managers = new Set(lines.map((line) => line.managerId));
  if (managers.size < 2) {
    return {
      ok: false,
      singleLine: true,
      reason: 'Every participant of this review sits on one active line, so no second line owes an answer. The cross-line claim is inert, not satisfied.',
      refusal: 'no-multi-line-participant',
    };
  }

  // A requested holder must REALLY hold a line over somebody in this review. A
  // holder with no line inside the frozen set is refused: giving them the home
  // line would be exactly the substitution this register exists to prevent.
  const requestedHolder = id(holderId) || null;
  if (requestedHolder && !lines.some((line) => line.managerId === requestedHolder)) {
    return {
      ok: false,
      reason: 'That manager holds no line over any participant of this review, so nobody could answer for it on their behalf.',
      refusal: 'off-seat',
    };
  }

  const snapshot = {
    version: 1,
    holderId: requestedHolder,
    review: {
      id: id(retro.id),
      subjectType: clean(retro.subjectType, 24),
      subjectId: id(retro.subjectId) || null,
      subjectLabel: clean(retro.subjectLabel, 200) || 'A recorded event',
      outcomeOn: day(retro.outcomeOn),
      heldOn: day(retro.heldOn),
      intended: clean(retro.intended, 1200),
      actual: clean(retro.actual, 1200),
      cause: clean(retro.cause, 1200),
      improve: clean(retro.improve, 1200),
      participantIds: participants,
    },
    lesson: lesson ? {
      id: id(lesson.id),
      class: clean(lesson.class, 32),
      text: clean(lesson.text, 600),
      changeType: clean(lesson.changeType, 32),
      state: clean(lesson.state, 24),
      ownerId: id(lesson.ownerId) || null,
      evidencePersonIds: sortedText((Array.isArray(lesson.evidence) ? lesson.evidence : [])
        .map((row) => row?.sourceType === 'person' ? row.sourceId : null)),
    } : null,
    people: people.sort((a, b) => a.id.localeCompare(b.id)),
    lines,
  };
  return { ok: true, snapshot, lines, people };
}

/* ------------------------------------------------------------------ indexing */

function indexResponses(responses) {
  const byRequest = new Map();
  for (const row of responses) {
    if (!row || !row.requestId) continue;
    if (!byRequest.has(row.requestId)) byRequest.set(row.requestId, row);
  }
  return byRequest;
}

function indexAdoptions(adoptions) {
  const byKey = new Map();
  for (const row of adoptions) {
    if (!row) continue;
    byKey.set(`${row.reviewId}|${row.lessonId}|${row.holderId}`, row);
  }
  return byKey;
}

function latestRequests(requests) {
  const latest = new Map();
  for (const request of requests) {
    if (!request) continue;
    const key = `${request.reviewId}|${request.lessonId || 'account'}|${request.holderId}`;
    const prior = latest.get(key);
    if (!prior) { latest.set(key, request); continue; }
    const cmp = String(request.requestedOn || '').localeCompare(String(prior.requestedOn || ''))
      || String(request.requestedAt || '').localeCompare(String(prior.requestedAt || ''))
      || String(request.id || '').localeCompare(String(prior.id || ''));
    if (cmp > 0) latest.set(key, request);
  }
  return latest;
}

function retrosById(state) {
  const map = new Map();
  for (const retro of (Array.isArray(state?.retros) ? state.retros : [])) {
    if (retro && retro.id) map.set(retro.id, retro);
  }
  return map;
}

/**
 * Is a stored request's snapshot still the live one? Recomputed exactly the way
 * it was frozen: same function, same inputs. A byte difference — a rewritten
 * cause, a changed participant, a line that has since moved — makes every prior
 * answer history.
 */
function currentForRequest(state, request, matrix, retroById) {
  const retro = retroById.get(request.reviewId) || null;
  if (!retro) {
    return { same: false, unverifiable: false, singleLine: false, reason: 'The review no longer exists; this request remains history.', refusal: 'subject-unlinked' };
  }
  if (retro.status !== 'held') {
    return { same: false, unverifiable: false, singleLine: false, reason: 'The review is no longer held; this request remains history.', refusal: 'review-not-held' };
  }
  const live = aarCorroborationSnapshot(state, retro, {
    matrix,
    lessonId: request.lessonId || null,
    holderId: request.holderId,
  });
  if (!live.ok) {
    return {
      same: false,
      unverifiable: !live.singleLine,
      singleLine: Boolean(live.singleLine),
      reason: live.reason,
      refusal: live.refusal,
    };
  }
  const same = canonicalJson(live.snapshot) === canonicalJson(request.snapshot);
  return {
    same,
    unverifiable: false,
    singleLine: false,
    reason: same ? '' : 'The review’s account, its participants or their active lines changed after this request. The answer remains history and no longer counts as current.',
  };
}

/* ------------------------------------------------------------- state deriving */

/**
 * One request's current state. Precedence is the declared registry order, so a
 * stale answer can never also read as a corroboration and a dispute is never
 * softly rounded into a "part support".
 */
function deriveState(state, request, response, { today, matrix, retroById, superseded }) {
  const current = currentForRequest(state, request, matrix, retroById);
  const retro = retroById.get(request.reviewId) || null;

  if (current.unverifiable) {
    return { state: 'unverifiable', current: false, reason: current.reason, response, refusal: current.refusal || 'lines-unresolvable' };
  }
  if (!current.same) {
    // A prior answer that is no longer current is `stale`; a request with no
    // answer whose review moved is also stale, because asking again is the only
    // honest resolution and the old request cannot be answered.
    return { state: 'stale', current: false, reason: current.reason, response, refusal: current.refusal || null };
  }
  if (retro && retro.status !== 'held') {
    return { state: 'historical', current: false, reason: 'The review is no longer held; this dated request is retained as history.', response, refusal: 'review-not-held' };
  }
  if (superseded) {
    return { state: 'superseded', current: false, reason: 'A later request for this same review, lesson and line is the current obligation. The earlier request and answer remain history.', response, refusal: null };
  }
  if (!response) {
    const overdue = today > request.dueOn;
    return {
      state: overdue ? 'overdue' : 'pending',
      current: false,
      reason: overdue
        ? `No first-person answer was recorded by ${request.dueOn}. Silence is not corroboration.`
        : `The line was asked by ${request.dueOn}.`,
      response: null,
      refusal: null,
      overdueDays: overdue ? Math.max(0, daysBetween(request.dueOn, today) || 0) : null,
    };
  }
  if (response.kind === 'observation') {
    // An observation is stored and printed, never counted. It answers nothing.
    return {
      state: 'pending',
      current: false,
      reason: 'A reviewer recorded a first-hand observation. It is evidence for a reviewer, never this line’s answer, and the line’s answer is still owed.',
      response,
      observation: true,
      refusal: null,
    };
  }
  if (response.validThrough && today > response.validThrough) {
    return {
      state: 'expired',
      current: false,
      reason: `The line’s answer was valid through ${response.validThrough} and has ended. It stays as history and a refresh is owed.`,
      response,
      refusal: null,
      late: response.respondedOn > request.dueOn,
    };
  }
  const outcome = aarCorroborationOutcome(response.outcome);
  const key = outcome ? outcome.key : 'declined';
  return {
    state: key,
    current: Boolean(outcome?.countsAsCorroboration),
    reason: outcome?.says || 'The recorded answer is not one of the declared outcomes.',
    response,
    refusal: null,
    late: response.respondedOn > request.dueOn,
  };
}

function worstState(states) {
  let worst = null;
  for (const key of states) {
    const severity = STATE_SEVERITY.get(key);
    if (severity === undefined) continue;
    if (worst === null || severity < STATE_SEVERITY.get(worst)) worst = key;
  }
  return worst || 'unrequested';
}

/* --------------------------------------------------------------- seat scoping */

function reaches(seat, personId) {
  if (!seat || seat.fullAccess) return true;
  return Boolean(seat.scope?.has?.(personId) || seat.lineScope?.has?.(personId));
}

function reachesAny(seat, personIds) {
  if (!seat || seat.fullAccess) return true;
  return (personIds || []).some((personId) => reaches(seat, personId));
}

function fullSpanAccess(seat, personIds) {
  if (!seat || seat.fullAccess) return true;
  if (seat.rank < 3) return false;
  return (personIds || []).some((personId) => seat.scope?.has?.(personId));
}

/* ------------------------------------------------------------------- parity */

/**
 * The set of line HOLDERS a lesson touches: the holders of every line belonging
 * to its owner, to every participant, and to every person its own evidence names.
 * Adoption is a statement a manager makes about their own accountability, so the
 * holder is the parity unit — a holder with three touched people adopts once,
 * and the row prints how many people and which line kinds the claim rests on.
 * Two people on the same project line are one holder, not two obligations.
 *
 * An unresolvable person makes the verdict `unattributable` — the register will
 * not silently treat an unknown line as a line that does not exist, and it will
 * not substitute the home line.
 */
function lessonTouches(state, retro, lesson, matrix, peopleById) {
  const holders = new Map(); // managerId -> { managerId, managerName, people:Set, lineKinds:Set }
  const unresolved = [];
  const ids = new Set();
  if (lesson?.ownerId) ids.add(lesson.ownerId);
  for (const personId of sortedText(retro?.participants)) ids.add(personId);
  for (const personId of sortedText(lesson?.evidencePersonIds)) ids.add(personId);

  // Who the lesson touches, and through whose accountability. A manager holding
  // one line over three touched people is ONE holder with three bases: asking
  // them three times for one lesson would triple a denominator that has one
  // owner.
  for (const personId of ids) {
    const active = activeLinesFor(matrix, personId);
    if (!active || !active.length) {
      unresolved.push({ personId, reason: 'No readable active Matrix line for a person this lesson touches.' });
      continue;
    }
    const defects = (matrix.defects || []).filter((defect) => defect?.personId === personId);
    if (defects.length) {
      unresolved.push({ personId, reason: 'The Matrix cannot verify this person’s active lines.' });
      continue;
    }
    for (const line of active) {
      const managerId = id(line.managerId);
      if (!managerId) { unresolved.push({ personId, reason: 'An active line names no holder.' }); continue; }
      if (!holders.has(managerId)) {
        holders.set(managerId, {
          managerId,
          managerName: managerLabel(matrix, peopleById, managerId),
          people: new Set(),
          lineKinds: new Set(),
          lineKeys: new Set(),
        });
      }
      const entry = holders.get(managerId);
      entry.people.add(personId);
      if (line.kind) entry.lineKinds.add(line.kind);
      entry.lineKeys.add(String(line.id || ''));
    }
  }
  return { holders, unresolved };
}

function parityFor(state, retro, lesson, { matrix, peopleById, adoptionsByKey, today, warnDays }) {
  if (!lesson) {
    return {
      verdict: 'inert',
      verdictLabel: PARITY_BY_KEY.get('inert')?.label || 'Not a cross-line lesson',
      tone: 'neutral',
      reason: AAR_CORROBORATION_READ_REFUSALS.find((row) => row.key === 'no-lesson-under-review')?.says || 'No lesson under review.',
      lines: [],
      touchedLinesN: 0,
      counts: { adopted: 0, refused: 0, 'not-asked': 0, unattributable: 0 },
      complete: false,
      broken: false,
      open: false,
      stale: false,
      openDays: null,
    };
  }
  const { holders, unresolved } = lessonTouches(state, retro, lesson, matrix, peopleById);
  const lines = [];
  const counts = { adopted: 0, refused: 0, 'not-asked': 0, unattributable: 0 };
  for (const entry of [...holders.values()].sort((a, b) => a.managerId.localeCompare(b.managerId))) {
    const adoption = adoptionsByKey.get(`${retro.id}|${lesson.id}|${entry.managerId}`) || null;
    let key = 'not-asked';
    let ageDays = null;
    if (adoption) {
      key = adoption.outcome === 'adopted' ? 'adopted' : 'refused';
      ageDays = day(adoption.adoptedOn) ? Math.max(0, daysBetween(adoption.adoptedOn, today) || 0) : null;
    }
    counts[key] += 1;
    lines.push({
      lineKey: entry.managerId, // the holder IS the parity unit
      managerId: entry.managerId,
      managerName: entry.managerName,
      kind: [...entry.lineKinds].sort().join(', '),
      role: entry.lineKeys.size === 1 ? 'single-line holder' : 'multi-line holder',
      basisN: entry.people.size,
      lineKeys: [...entry.lineKeys].sort(),
      state: key,
      stateLabel: ADOPTION_BY_KEY.get(key)?.label || key,
      stateTone: ADOPTION_BY_KEY.get(key)?.tone || 'warn',
      adoptionOn: adoption?.adoptedOn || null,
      note: adoption ? clean(adoption.note, 400) : '',
      sinceDays: ageDays,
    });
  }
  for (const row of unresolved) {
    counts.unattributable += 1;
    lines.push({
      lineKey: null,
      managerId: null,
      managerName: null,
      kind: '',
      role: '',
      basisN: 1,
      lineKeys: [],
      state: 'unattributable',
      stateLabel: ADOPTION_BY_KEY.get('unattributable')?.label || 'unattributable',
      stateTone: 'bad',
      adoptionOn: null,
      note: row.reason,
      sinceDays: null,
    });
  }

  const touchedLinesN = holders.size;
  let verdict;
  if (counts.unattributable > 0) verdict = 'unattributable';
  else if (touchedLinesN <= 1) verdict = 'inert';
  else if (counts.refused > 0) verdict = 'parity-broken';
  else if (counts['not-asked'] > 0) verdict = 'parity-open';
  else verdict = 'parity-complete';

  // An unasked holder is only a *stale* obligation once the declared window has
  // passed; before that it is simply outstanding and the rule stays quiet.
  const heldOn = day(retro?.heldOn);
  const openDays = heldOn ? Math.max(0, daysBetween(heldOn, today) || 0) : null;
  const stale = verdict === 'parity-open' && openDays !== null && openDays >= warnDays;

  const meta = PARITY_BY_KEY.get(verdict) || PARITY_BY_KEY.get('inert');
  let reason = meta?.says || '';
  if (verdict === 'unattributable') {
    reason = `${counts.unattributable} person(s) this lesson touches cannot be resolved to a holder. ${reason}`;
  } else if (verdict === 'parity-open') {
    reason = `${counts['not-asked']} of ${touchedLinesN} touched line holder(s) have not adopted this lesson${openDays === null ? '' : ` (review held ${openDays} day(s) ago)`}. ${reason}`;
  } else if (verdict === 'parity-broken') {
    reason = `${counts.refused} of ${touchedLinesN} touched line holder(s) refused to adopt. The review’s own lesson state is unchanged — a refusal is a disagreement, not an application. ${reason}`;
  } else if (verdict === 'parity-complete') {
    reason = `Every one of the ${touchedLinesN} line holder(s) this lesson touches recorded a dated adoption. ${reason}`;
  }
  return {
    verdict,
    verdictLabel: meta?.label || verdict,
    tone: meta?.tone || 'neutral',
    reason,
    lines,
    touchedLinesN,
    counts,
    complete: verdict === 'parity-complete',
    broken: verdict === 'parity-broken',
    open: verdict === 'parity-open',
    stale,
    openDays,
  };
}

/* -------------------------------------------------------------------- report */

function refusalLabel(key) {
  return AAR_CORROBORATION_READ_REFUSALS.find((row) => row.key === key)?.says || '';
}

function narrowAnswer(answer) {
  if (!answer) return null;
  return {
    id: answer.id,
    kind: answer.kind,
    outcome: answer.outcome,
    respondedOn: answer.respondedOn,
    validThrough: answer.validThrough,
    via: 'seat',
    reasonWithheld: Boolean(answer.reason),
    noteWithheld: Boolean(answer.note),
    outcomeLabel: aarCorroborationOutcome(answer.outcome)?.label || answer.outcome,
  };
}

/**
 * THE REPORT. `detailLevel` is decided here, in the read model, from the seat;
 * the view cannot widen it.
 */
export function buildAarCorroborationReport(state, {
  now = new Date(),
  settings = null,
  seat = null,
  detailLevel = null,
} = {}) {
  const effective = settings || state?.settings || {};
  const conv = normalizeAarCorroborationSettings(effective);
  const today = dayKey(now) || new Date(now).toISOString().slice(0, 10);
  let matrix;
  try {
    matrix = buildMatrix(state, { now, settings: effective });
  } catch {
    matrix = null;
  }
  const peopleById = new Map((Array.isArray(state?.people) ? state.people : []).map((p) => [p?.id, p]));
  const retroById = retrosById(state);

  const level = detailLevel
    || (!seat || seat.fullAccess ? 'full' : seat.rank >= 3 ? 'full' : seat.rank >= 1 ? 'span' : 'none');

  const requests = Array.isArray(state?.aarCorroborationRequests) ? state.aarCorroborationRequests : [];
  const responses = Array.isArray(state?.aarCorroborationResponses) ? state.aarCorroborationResponses : [];
  const adoptions = Array.isArray(state?.aarAdoptions) ? state.aarAdoptions : [];
  const responsesByRequest = indexResponses(responses);
  const latest = latestRequests(requests);
  const adoptionsByKey = indexAdoptions(adoptions);

  if (!matrix) {
    return emptyReport({ today, level, reason: 'The Matrix graph could not be built, so no line attribution is possible.' });
  }

  const usedRefusals = new Set();
  const noteRefusal = (key) => { if (key) usedRefusals.add(key); };

  /* 1. Which held reviews touch more than one line. */
  const heldRetros = [];
  let notHeldN = 0;
  for (const retro of retroById.values()) {
    if (!retro || retro.status !== 'held') { notHeldN += 1; continue; }
    heldRetros.push(retro);
  }
  heldRetros.sort((a, b) => String(b.heldOn || '').localeCompare(String(a.heldOn || '')) || String(b.id).localeCompare(String(a.id)));

  /* 2. Build every required line answer, current state and parity, per review. */
  const rows = [];
  const historyRows = [];
  const lessonRows = [];
  const singleLineExcluded = [];
  const unverifiableReviews = [];
  let hiddenRowsN = 0;

  for (const retro of heldRetros) {
    // Seat reach: a review is in scope if the seat reaches its author (we do not
    // store an author) — so scope is the participant set and the lesson owner.
    const scopePersonIds = sortedText([
      ...(Array.isArray(retro.participants) ? retro.participants : []),
      ...(Array.isArray(retro.lessons) ? retro.lessons.map((lesson) => lesson?.ownerId) : []),
    ]);
    if (!reachesAny(seat, scopePersonIds)) continue;
    const canSeeFull = fullSpanAccess(seat, scopePersonIds);

    const liveAccount = aarCorroborationSnapshot(state, retro, { matrix });
    if (!liveAccount.ok && liveAccount.singleLine) {
      singleLineExcluded.push({ reviewId: retro.id, reason: liveAccount.reason });
      noteRefusal('no-multi-line-participant');
      continue;
    }
    if (!liveAccount.ok) {
      unverifiableReviews.push({ reviewId: retro.id, reason: liveAccount.reason });
      noteRefusal(liveAccount.refusal || 'lines-unresolvable');
      continue;
    }

    const participantIds = liveAccount.snapshot.review.participantIds;
    const linesByPerson = new Map();
    for (const line of liveAccount.lines) {
      if (!linesByPerson.has(line.personId)) linesByPerson.set(line.personId, []);
      linesByPerson.get(line.personId).push(line);
    }

    // ONE required answer per LINE HOLDER. A holder who holds lines over three
    // participants answers once about the review's account: they are one line,
    // and asking them three times would triple a denominator with one owner.
    const holders = new Map();
    for (const line of liveAccount.lines) {
      const managerId = id(line.managerId);
      if (!managerId) continue;
      if (!holders.has(managerId)) {
        holders.set(managerId, {
          managerId,
          managerName: line.managerName,
          managerLabelText: managerLabel(matrix, peopleById, managerId),
          people: new Set(),
          roles: new Set(),
          kinds: new Set(),
          lineKeys: [],
        });
      }
      const entry = holders.get(managerId);
      entry.people.add(line.personId);
      entry.roles.add(line.role);
      if (line.kind) entry.kinds.add(line.kind);
      entry.lineKeys.push(line.lineKey);
    }

    for (const holder of [...holders.values()].sort((a, b) => a.managerId.localeCompare(b.managerId))) {
      const request = latest.get(`${retro.id}|account|${holder.managerId}`) || null;
      const response = request ? (responsesByRequest.get(request.id) || null) : null;
      const derived = request
        ? deriveState(state, request, response, { today, matrix, retroById, superseded: false })
        : { state: 'unrequested', current: false, reason: 'No dated corroboration request exists for this review and holder.', response: null };
      const peopleList = [...holder.people].sort();
      const row = {
        rowKey: `${retro.id}|${holder.managerId}`,
        reviewId: retro.id,
        subjectLabel: clean(retro.subjectLabel, 200) || 'A recorded event',
        subjectType: clean(retro.subjectType, 24),
        heldOn: retro.heldOn,
        outcomeOn: retro.outcomeOn,
        holderId: holder.managerId,
        holderName: holder.managerName,
        personN: peopleList.length,
        personIds: canSeeFull ? peopleList : [],
        personNames: canSeeFull ? peopleList.map((personId) => personName(matrix, peopleById, personId)) : [],
        roles: [...holder.roles].sort(),
        lineKinds: [...holder.kinds].sort(),
        lineKeys: canSeeFull ? [...holder.lineKeys].sort() : [],
        managerId: holder.managerId,
        managerName: holder.managerName,
        requestId: request?.id || null,
        requestedOn: request?.requestedOn || null,
        dueOn: request?.dueOn || null,
        prompt: request ? clean(request.prompt, 400) : '',
        state: derived.state,
        stateLabel: STATE_BY_KEY.get(derived.state)?.label || derived.state,
        stateTone: STATE_BY_KEY.get(derived.state)?.tone || 'warn',
        current: Boolean(derived.current),
        reason: derived.reason,
        late: Boolean(derived.late),
        overdueDays: derived.overdueDays ?? null,
        observation: Boolean(derived.observation),
        countsAsCorroboration: Boolean(derived.current && OUTCOME_COUNTS_AS.get(derived.state)),
        answer: canSeeFull && derived.response && derived.response.kind === 'corroboration'
          ? {
            id: derived.response.id,
            kind: derived.response.kind,
            outcome: derived.response.outcome,
            outcomeLabel: aarCorroborationOutcome(derived.response.outcome)?.label || derived.response.outcome,
            respondedOn: derived.response.respondedOn,
            validThrough: derived.response.validThrough,
            reason: clean(derived.response.reason, 400),
            note: clean(derived.response.note, 400),
          }
          : narrowAnswer(derived.response),
        canRequest: Boolean((seat ? reaches(seat, holder.managerId) || peopleList.some((personId) => reaches(seat, personId)) : true)
          && !['pending', 'overdue', 'corroborated', 'partly'].includes(derived.state)
          && (seat ? !(seat.id === holder.managerId && !seat.fullAccess) : true)),
        canRespond: Boolean(seat && !seat.fullAccess && seat.id === holder.managerId
          && request && !response && ['pending', 'overdue'].includes(derived.state)),
      };
      rows.push(row);
    }

    /* 3. Lesson parity, per lesson under this review. */
    const lessons = Array.isArray(retro.lessons) ? retro.lessons : [];
    for (const lesson of lessons) {
      const parity = parityFor(state, retro, lesson, { matrix, peopleById, adoptionsByKey, today, warnDays: conv.aarCorroborationAdoptWarnDays });
      if (parity.verdict === 'unattributable') noteRefusal('lines-unresolvable');
      const lessonRow = {
        rowKey: `${retro.id}|${lesson.id}`,
        reviewId: retro.id,
        lessonId: lesson.id,
        subjectLabel: clean(retro.subjectLabel, 200) || 'A recorded event',
        heldOn: retro.heldOn,
        lessonText: canSeeFull ? clean(lesson.text, 600) : '',
        lessonTextWithheld: !canSeeFull && Boolean(lesson.text),
        lessonClass: clean(lesson.class, 32),
        changeType: clean(lesson.changeType, 32),
        // The AAR ledger's own claim, printed and never rewritten.
        aarState: clean(lesson.state, 24),
        ownerId: lesson.ownerId || null,
        ownerName: lesson.ownerId ? personName(matrix, peopleById, lesson.ownerId) : null,
        parityVerdict: parity.verdict,
        parityLabel: parity.verdictLabel,
        parityTone: parity.tone,
        parityReason: parity.reason,
        parityStale: Boolean(parity.stale),
        openDays: parity.openDays,
        touchedLinesN: parity.touchedLinesN,
        parityCounts: parity.counts,
        lines: canSeeFull || level === 'full' ? parity.lines : parity.lines.map((line) => ({
          ...line,
          lineKey: null,
          managerId: null,
          managerName: null,
          note: line.state === 'not-asked' ? '' : 'withheld at this disclosure level',
        })),
        canAdoptN: (seat && !seat.fullAccess)
          ? parity.lines.filter((line) => line.managerId === seat.id && (line.state === 'not-asked' || line.state === 'refused')).length
          : 0,
        // An adoption is a statement the holder makes about their own line, so
        // it is offered only to the seat that holds it.
        canAdopt: Boolean(seat && !seat.fullAccess && parity.lines.some(
          (line) => line.managerId === seat.id && (line.state === 'not-asked' || line.state === 'refused'),
        )),
      };
      lessonRows.push(lessonRow);
    }
  }

  /* 4. Retained history: requests whose current row is not in the display set. */
  const currentRequestIds = new Set(rows.map((row) => row.requestId).filter(Boolean));
  for (const request of requests) {
    if (currentRequestIds.has(request.id)) continue;
    if (!reachesAny(seat, [request.personId, request.holderId])) continue;
    const response = responsesByRequest.get(request.id) || null;
    const derived = deriveState(state, request, response, {
      today, matrix, retroById,
      superseded: (latest.get(`${request.reviewId}|${request.lessonId || 'account'}|${request.holderId}`)?.id || null) !== request.id,
    });
    if (derived.state === 'stale' && derived.refusal) noteRefusal(derived.refusal);
    const retro = retroById.get(request.reviewId) || null;
    historyRows.push({
      rowKey: `history|${request.id}`,
      reviewId: request.reviewId,
      subjectLabel: clean(retro?.subjectLabel || request.snapshot?.review?.subjectLabel, 200) || 'A recorded event',
      heldOn: request.snapshot?.review?.heldOn || null,
      personId: request.personId,
      personName: personName(matrix, peopleById, request.personId),
      holderId: request.holderId,
      managerId: request.holderId,
      managerName: managerLabel(matrix, peopleById, request.holderId),
      requestId: request.id,
      requestedOn: request.requestedOn,
      dueOn: request.dueOn,
      state: derived.state,
      stateLabel: STATE_BY_KEY.get(derived.state)?.label || derived.state,
      stateTone: STATE_BY_KEY.get(derived.state)?.tone || 'warn',
      current: false,
      reason: derived.reason,
      answer: response ? (level === 'full' ? {
        outcome: response.outcome,
        outcomeLabel: aarCorroborationOutcome(response.outcome)?.label || response.outcome,
        respondedOn: response.respondedOn,
        kind: response.kind,
      } : narrowAnswer(response)) : null,
    });
  }

  /* 5. Totals, computed from the WHOLE row set, not the displayed slice. */
  const counts = {
    heldReviewsN: heldRetros.length,
    notHeldReviewsN: notHeldN,
    multiLineReviewsN: new Set(rows.map((row) => row.reviewId)).size,
    requiredLineAnswersN: rows.length,
    corroboratedN: 0,
    partlyN: 0,
    disputedN: 0,
    declinedN: 0,
    pendingN: 0,
    overdueN: 0,
    unrequestedN: 0,
    staleN: 0,
    expiredN: 0,
    unverifiableN: 0,
    supersededN: 0,
    historicalN: 0,
    observationsN: 0,
    singleLineExcludedN: singleLineExcluded.length,
    unverifiableReviewsN: unverifiableReviews.length,
  };
  for (const row of rows) {
    if (row.observation) counts.observationsN += 1;
    const bucket = `${row.state}N`;
    if (Object.hasOwn(counts, bucket)) counts[bucket] += 1;
  }
  // Reconciliation: every row lands in exactly one printed bucket.
  const stateSum = counts.corroboratedN + counts.partlyN + counts.disputedN + counts.declinedN
    + counts.pendingN + counts.overdueN + counts.unrequestedN + counts.staleN
    + counts.expiredN + counts.supersededN + counts.historicalN;
  const countsReconcile = stateSum === counts.requiredLineAnswersN;

  const parityTotals = {
    lessonsN: lessonRows.length,
    parityCompleteN: lessonRows.filter((row) => row.parityVerdict === 'parity-complete').length,
    parityOpenN: lessonRows.filter((row) => row.parityVerdict === 'parity-open').length,
    parityBrokenN: lessonRows.filter((row) => row.parityVerdict === 'parity-broken').length,
    parityInertN: lessonRows.filter((row) => row.parityVerdict === 'inert').length,
    parityUnattributableN: lessonRows.filter((row) => row.parityVerdict === 'unattributable').length,
  };
  const paritySum = parityTotals.parityCompleteN + parityTotals.parityOpenN
    + parityTotals.parityBrokenN + parityTotals.parityInertN + parityTotals.parityUnattributableN;
  const parityReconcile = paritySum === parityTotals.lessonsN;

  const corroboratedTotal = counts.corroboratedN + counts.partlyN;

  /* 6. Display: bounded, and a withheld row says it was withheld. */
  const shownRows = rows.slice(0, AAR_CORROBORATION_LIMITS.reportRows);
  const hiddenBySeatN = level === 'none' ? rows.length : 0;
  if (level === 'none' && rows.length) noteRefusal('off-seat');
  hiddenRowsN += hiddenBySeatN;
  const truncatedN = Math.max(0, rows.length - shownRows.length);
  const shownHistory = historyRows.slice(0, Math.max(0, AAR_CORROBORATION_LIMITS.reportRows - shownRows.length));

  /* 7. Coverage: withheld for every reason the registry declares, with the reason. */
  let coverageWithheldReason = null;
  if (unverifiableReviews.length) {
    coverageWithheldReason = `${unverifiableReviews.length} held review(s) have an unreadable participant line set, so the required-line denominator is incomplete.`;
    noteRefusal('lines-unresolvable');
  } else if (!counts.requiredLineAnswersN) {
    coverageWithheldReason = counts.heldReviewsN
      ? 'No held review touches more than one line, so there is no cross-line denominator. The cross-line claim is inert, not satisfied.'
      : 'No after-action review has been held in this workspace, so no line owes a corroboration.';
    noteRefusal('no-multi-line-participant');
  } else if (counts.requiredLineAnswersN < conv.aarCorroborationMinLines) {
    coverageWithheldReason = `Only ${counts.requiredLineAnswersN} required line answer(s) are in the denominator; the declared disclosure floor is ${conv.aarCorroborationMinLines}.`;
    noteRefusal('below-floor');
  } else if (hiddenBySeatN) {
    coverageWithheldReason = `${hiddenBySeatN} in-scope row(s) sit outside this seat’s view, so a coverage figure would rest on a partial display.`;
    noteRefusal('rows-withheld');
  } else if (!countsReconcile) {
    coverageWithheldReason = 'The printed line states do not add back to the required-line denominator.';
    noteRefusal('coverage-unreconciled');
  }
  const coverageWithheld = Boolean(coverageWithheldReason);
  const coveragePct = coverageWithheld
    ? null
    : Math.round((corroboratedTotal / counts.requiredLineAnswersN) * 1000) / 10;

  const parityWithheld = coverageWithheld || !parityTotals.lessonsN;
  const parityCompletePct = parityWithheld || parityTotals.lessonsN < conv.aarCorroborationMinLines
    ? null
    : Math.round((parityTotals.parityCompleteN / parityTotals.lessonsN) * 1000) / 10;

  const attentionN = Math.max(0, counts.requiredLineAnswersN - corroboratedTotal)
    + parityTotals.parityBrokenN + parityTotals.parityUnattributableN;

  /* 8. The claims, printed apart because they are different facts. */
  const claims = {
    reviewsHeld: counts.heldReviewsN > 0,
    crossLineClaim: parityTotals.lessonsN > 0 || counts.requiredLineAnswersN > 0,
    corroborationRecorded: corroboratedTotal > 0,
    parityClaimed: parityTotals.parityCompleteN > 0,
    adoptionRefused: parityTotals.parityBrokenN > 0,
    countsReconcile: countsReconcile && parityReconcile,
    figuresComplete: !coverageWithheld && !hiddenBySeatN,
  };

  const empty = counts.heldReviewsN === 0;

  const report = {
    engineVersion: AAR_CORROBORATION_ENGINE_VERSION,
    adr: AAR_CORROBORATION_ADR,
    ruleId: AAR_CORROBORATION_RULE_ID,
    today,
    scope: !seat || seat.fullAccess ? 'workspace' : seat.rank >= 3 ? 'span' : 'line',
    seatId: seat?.id || null,
    seatLabel: seat?.label || 'Workspace operator',
    detailLevel: level,
    detailReason: AAR_CORROBORATION_DETAIL_REASONS[level] || '',
    empty,
    conventions: {
      dueDays: conv.aarCorroborationDueDays,
      minLines: conv.aarCorroborationMinLines,
      adoptWarnDays: conv.aarCorroborationAdoptWarnDays,
      autoPropagate: conv.aarCorroborationAutoPropagate,
    },
    rows: level === 'none' ? [] : shownRows,
    historyRows: level === 'none' ? [] : shownHistory,
    lessons: level === 'none' ? [] : lessonRows.slice(0, AAR_CORROBORATION_LIMITS.reportRows),
    singleLineExcluded: singleLineExcluded.slice(0, AAR_CORROBORATION_LIMITS.reportRows),
    unverifiableReviews: unverifiableReviews.slice(0, AAR_CORROBORATION_LIMITS.reportRows),
    // Exposed so a rule on the shared spine reads exactly the graph the panel
    // read, instead of building a second one that could disagree.
    matrix,
    totals: {
      ...counts,
      ...parityTotals,
      corroboratedTotalN: corroboratedTotal,
      coveragePct,
      coverageWithheld,
      coverageWithheldReason,
      parityCompletePct,
      parityWithheld,
      countsReconcile: countsReconcile && parityReconcile,
      figuresComplete: !coverageWithheld && !hiddenBySeatN,
      stateSum,
      paritySum,
      hiddenRowsN,
      truncatedN,
      shownRowsN: level === 'none' ? 0 : shownRows.length,
      shownHistoryN: level === 'none' ? 0 : shownHistory.length,
      attentionN,
      refusalReasons: [...usedRefusals].sort().map((key) => ({ key, says: refusalLabel(key) })),
    },
    claims,
  };
  return report;
}

function emptyReport({ today, level, reason }) {
  // Deliberately no `matrix`: an empty report is a refusal, and a rule that
  // received a graph here would file asks against a record it could not read.
  const refusal = { key: 'lines-unresolvable', says: reason };
  return {
    engineVersion: AAR_CORROBORATION_ENGINE_VERSION,
    adr: AAR_CORROBORATION_ADR,
    ruleId: AAR_CORROBORATION_RULE_ID,
    today,
    scope: 'workspace',
    seatId: null,
    seatLabel: 'Workspace operator',
    detailLevel: level,
    detailReason: AAR_CORROBORATION_DETAIL_REASONS[level] || '',
    empty: true,
    conventions: {},
    rows: [],
    historyRows: [],
    lessons: [],
    singleLineExcluded: [],
    unverifiableReviews: [],
    totals: {
      heldReviewsN: 0, notHeldReviewsN: 0, multiLineReviewsN: 0, requiredLineAnswersN: 0,
      corroboratedN: 0, partlyN: 0, disputedN: 0, declinedN: 0, pendingN: 0, overdueN: 0,
      unrequestedN: 0, staleN: 0, expiredN: 0, unverifiableN: 0, supersededN: 0, historicalN: 0,
      observationsN: 0, singleLineExcludedN: 0, unverifiableReviewsN: 0,
      lessonsN: 0, parityCompleteN: 0, parityOpenN: 0, parityBrokenN: 0, parityInertN: 0,
      parityUnattributableN: 0, corroboratedTotalN: 0,
      coveragePct: null, coverageWithheld: true, coverageWithheldReason: reason,
      parityCompletePct: null, parityWithheld: true,
      countsReconcile: false, figuresComplete: false, stateSum: 0, paritySum: 0,
      hiddenRowsN: 0, truncatedN: 0, shownRowsN: 0, shownHistoryN: 0, attentionN: 0,
      refusalReasons: [refusal],
    },
    claims: {
      reviewsHeld: false, crossLineClaim: false, corroborationRecorded: false,
      parityClaimed: false, adoptionRefused: false, countsReconcile: false, figuresComplete: false,
    },
  };
}

/* ----------------------------------------------------------------------- CSV */

/**
 * CSV #141. One `workspace` row plus one `state` row per request state and one
 * `parity` row per parity verdict, so a reader can add the parts back to the
 * totals. No person, manager, line, review id, lesson text or answer prose.
 */
export function aarCorroborationCsvRows(report) {
  const t = report?.totals || {};
  const out = [{
    row_kind: 'workspace',
    as_of: report?.today || '',
    held_reviews_n: t.heldReviewsN ?? 0,
    multi_line_reviews_n: t.multiLineReviewsN ?? 0,
    required_line_answers_n: t.requiredLineAnswersN ?? 0,
    corroborated_n: t.corroboratedN ?? 0,
    partly_n: t.partlyN ?? 0,
    disputed_n: t.disputedN ?? 0,
    declined_n: t.declinedN ?? 0,
    pending_n: t.pendingN ?? 0,
    overdue_n: t.overdueN ?? 0,
    unrequested_n: t.unrequestedN ?? 0,
    stale_n: t.staleN ?? 0,
    expired_n: t.expiredN ?? 0,
    unverifiable_n: t.unverifiableN ?? 0,
    superseded_n: t.supersededN ?? 0,
    historical_n: t.historicalN ?? 0,
    single_line_excluded_n: t.singleLineExcludedN ?? 0,
    lessons_n: t.lessonsN ?? 0,
    parity_complete_n: t.parityCompleteN ?? 0,
    parity_open_n: t.parityOpenN ?? 0,
    parity_broken_n: t.parityBrokenN ?? 0,
    parity_inert_n: t.parityInertN ?? 0,
    parity_unattributable_n: t.parityUnattributableN ?? 0,
    observations_n: t.observationsN ?? 0,
    withheld_rows_n: (t.hiddenRowsN || 0) + (t.truncatedN || 0),
    coverage_pct: t.coverageWithheld ? '' : (t.coveragePct ?? ''),
    coverage_withheld: t.coverageWithheld === true,
    coverage_withheld_reason: t.coverageWithheldReason || '',
    parity_complete_pct: t.parityWithheld ? '' : (t.parityCompletePct ?? ''),
    parity_withheld: t.parityWithheld === true,
    counts_reconcile: t.countsReconcile === true,
    figures_complete: t.figuresComplete === true,
    engine_version: report?.engineVersion || '',
  }];
  const stateKeys = ['corroborated', 'partly', 'disputed', 'declined', 'pending', 'overdue',
    'unrequested', 'stale', 'expired', 'superseded', 'historical'];
  for (const key of stateKeys) {
    out.push({
      row_kind: 'state',
      as_of: report?.today || '',
      corroborated_n: key === 'corroborated' ? (t.corroboratedN ?? 0) : '',
      partly_n: key === 'partly' ? (t.partlyN ?? 0) : '',
      disputed_n: key === 'disputed' ? (t.disputedN ?? 0) : '',
      declined_n: key === 'declined' ? (t.declinedN ?? 0) : '',
      pending_n: key === 'pending' ? (t.pendingN ?? 0) : '',
      overdue_n: key === 'overdue' ? (t.overdueN ?? 0) : '',
      unrequested_n: key === 'unrequested' ? (t.unrequestedN ?? 0) : '',
      stale_n: key === 'stale' ? (t.staleN ?? 0) : '',
      expired_n: key === 'expired' ? (t.expiredN ?? 0) : '',
      superseded_n: key === 'superseded' ? (t.supersededN ?? 0) : '',
      historical_n: key === 'historical' ? (t.historicalN ?? 0) : '',
      engine_version: report?.engineVersion || '',
    });
  }
  const parityKeys = ['parity-complete', 'parity-open', 'parity-broken', 'parity-inert', 'parity-unattributable'];
  for (const key of parityKeys) {
    out.push({
      row_kind: 'parity',
      as_of: report?.today || '',
      parity_complete_n: key === 'parity-complete' ? (t.parityCompleteN ?? 0) : '',
      parity_open_n: key === 'parity-open' ? (t.parityOpenN ?? 0) : '',
      parity_broken_n: key === 'parity-broken' ? (t.parityBrokenN ?? 0) : '',
      parity_inert_n: key === 'parity-inert' ? (t.parityInertN ?? 0) : '',
      parity_unattributable_n: key === 'parity-unattributable' ? (t.parityUnattributableN ?? 0) : '',
      engine_version: report?.engineVersion || '',
    });
  }
  return out;
}

/** The identity-free one-paragraph brief. Never names a person or a lesson. */
export function aarCorroborationBriefText(report) {
  const t = report?.totals || {};
  if (report?.empty) {
    return `Cross-line after-action corroboration — ${report?.today || 'today'}: no after-action review has been held in this workspace, so no line owes a corroboration and no lesson has an adoption obligation. An empty register is honestly empty; nothing is inferred from it.`;
  }
  if (!t.requiredLineAnswersN) {
    return `Cross-line after-action corroboration — ${report.today}: ${t.heldReviewsN} held review(s), none of which touches more than one line. The cross-line claim is inert, not satisfied: a review authored and answered inside one line is that line’s own record and this register claims nothing about it.`;
  }
  const coverage = t.coverageWithheld
    ? `Coverage withheld: ${t.coverageWithheldReason}`
    : `Current coverage ${t.corroboratedTotalN}/${t.requiredLineAnswersN} required line answers (${t.coveragePct}%).`;
  const parity = t.parityWithheld
    ? 'Lesson adoption parity withheld with the coverage figure.'
    : `Lesson parity: ${t.parityCompleteN} complete, ${t.parityOpenN} open, ${t.parityBrokenN} broken by a reasoned refusal, ${t.parityInertN} single-line and ${t.parityUnattributableN} unattributable across ${t.lessonsN} lesson(s).`;
  return [
    `Cross-line after-action corroboration — ${report.today}.`,
    `${t.heldReviewsN} held review(s); ${t.multiLineReviewsN} touch more than one active line, giving ${t.requiredLineAnswersN} required line answer(s).`,
    coverage,
    `${t.corroboratedN} corroborated, ${t.partlyN} part supported, ${t.disputedN} disputed, ${t.declinedN} declined, ${t.overdueN} overdue, ${t.pendingN} pending and ${t.unrequestedN} not asked. ${t.observationsN} reviewer observation(s) were recorded and none counts as a line’s answer.`,
    parity,
    'A corroboration states that a line agrees with a recorded account; it is not approval of the outcome, not consent, and not a judgement about any person. Adoption parity never rewrites the review’s own lesson state.',
  ].join(' ');
}

/**
 * The signature the rule uses to stay idempotent. One ask per CONDITION, where a
 * condition is (kind, review, line) — never per row, so a large workspace cannot
 * flood the spine.
 */
export function aarCorroborationConditionKey(kind, reviewId, holderId) {
  return `${kind}|${reviewId}|${holderId}`;
}
