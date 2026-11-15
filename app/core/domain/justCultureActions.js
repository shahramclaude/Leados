/**
 * app/core/domain/justCultureActions.js — the seat-checked commands of the Just
 * Culture Decision Record (ADR-0218, Schema v172).
 *
 * FOUR human acts and nothing else: OPEN a review, DECIDE it (or REVISE a decision
 * already made), CONCUR or DISSENT as another line the person holds, and WITHDRAW an
 * undecided review. Nothing is computed and stored: the state, the expected response
 * and every count are re-derived on read by `justCulture.js`.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Ownership is PROVED against the live matrix, not trusted from the form. The
 *    deciding line must be one the person actually holds. A person with several lines
 *    must have one named explicitly: the record will not choose a manager for you.
 *  - Only the manager of the deciding line may open, decide, revise or withdraw. The
 *    operator view acts for any line, and the line it acts for is written down.
 *  - A person may not open, decide or concur on their own conduct.
 *  - A decision is refused unless every question on its path is answered. A response
 *    that departs from what the answers point to is refused unless the manager writes
 *    why. A system condition that contributed must name the system action owed.
 *  - Concurrence belongs to the line that is answering, and only to a decision in
 *    force. A second answer from the same line is a correction, which means a revision,
 *    never a second act.
 *  - Every write is run through the loader and the stored row is the row the loader
 *    returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildJustCultureReport,
  deriveJustCultureReview,
  justCultureActorId,
  justCultureAttentionCount,
  justCultureCandidates,
  justCultureMatrix,
} from './justCulture.js';
import {
  jcDay,
  jcText,
  normalizeJustCultureActs,
  normalizeJustCultureAnswers,
  normalizeJustCultureReviews,
} from './justCultureSchema.js';
import {
  JC_RESPONSE_KEYS,
  JUST_CULTURE_EVENTS,
  JUST_CULTURE_LIMITS as L,
  JUST_CULTURE_REFUSALS,
  JUST_CULTURE_RIGHTS,
  justCultureExpectation,
  justCultureResponseLabel,
} from './justCultureRegistry.js';

const REFUSAL = (key) => `justCulture:${key}`;

export function createJustCultureActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(JUST_CULTURE_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: justCultureActorId(seat), today: dayKey(at) };
  }

  /** The read seat: a counted seat is never refused a read — the reader grants or withholds detail. */
  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg };
  }

  function ledger() {
    const warnings = [];
    const reviews = normalizeJustCultureReviews(rows('justCultureReviews'), warnings);
    const acts = normalizeJustCultureActs(rows('justCultureActs'), reviews, warnings);
    return { reviews, acts };
  }

  function matrixOrFail(check) {
    try {
      return { ok: true, matrix: justCultureMatrix(store.state, check.at, check.cfg) };
    } catch (error) {
      return fail(`The reporting graph could not be read, so no owner can be proved. Nothing was saved. (${error?.message || 'unknown error'})`, null, REFUSAL('graph-unreadable'));
    }
  }

  /** Prove the review may take this act: it exists, is not withdrawn, and the day is lawful. */
  function reviewContext(check, reviewId) {
    const id = jcText(reviewId, 80);
    if (!id) return fail('Name the review this act belongs to.', 'reviewId');
    const { reviews, acts } = ledger();
    const review = reviews.find((row) => row.id === id) || null;
    if (!review) return fail('That review is not on this record. Nothing was saved.', 'reviewId', REFUSAL('review-not-found'));
    const graph = matrixOrFail(check);
    if (!graph.ok) return graph;
    const derived = deriveJustCultureReview(review, acts, graph.matrix);
    if (derived.withdrawn) return fail('This review was withdrawn. Nothing can be added to it.', 'reviewId', REFUSAL('withdrawn'));
    const lastOn = acts.filter((act) => act.reviewId === review.id).reduce((max, act) => (act.on > max ? act.on : max), review.openedOn);
    return { ok: true, review, acts, matrix: graph.matrix, derived, lastOn };
  }

  /** An act's day: today by default, never future, never before the review or any act already on it. */
  function actDay(input, check, ctx) {
    const day = input.on === undefined || input.on === null || input.on === '' ? check.today : jcDay(input.on);
    if (!day) return fail('Give a real day for this act.', 'on', REFUSAL('day-invalid'));
    if (day > check.today) return fail('An act cannot be dated after today.', 'on', REFUSAL('day-future'));
    if (day < ctx.review.openedOn) return fail(`An act cannot be dated before the review was opened on ${ctx.review.openedOn}.`, 'on', REFUSAL('day-before-open'));
    if (day < ctx.lastOn) return fail(`An act cannot be dated before the last act on this review (${ctx.lastOn}). Nothing is backdated into existence.`, 'on', REFUSAL('day-before-last'));
    return { day };
  }

  /** Run the loader over the whole ledger plus the new row: the write lands only if it reads back. */
  function readBack(act) {
    const reviews = normalizeJustCultureReviews(rows('justCultureReviews'), []);
    const combined = normalizeJustCultureActs([...rows('justCultureActs'), act], reviews, []);
    return combined.find((row) => row.id === act.id) || null;
  }

  return {
    /** Open a review. The deciding line is named explicitly whenever the person holds more than one. */
    justCultureOpen(input = {}) {
      const check = seatFor(JUST_CULTURE_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const personId = jcText(input.personId, L.personIdMax);
      if (!personId) return fail('Name the person whose conduct this review concerns.', 'personId');
      const person = rows('people').find((row) => row && row.id === personId && row.status !== 'archived') || null;
      if (!person) return fail('That person is not on the active roster. Nothing was saved.', 'personId', REFUSAL('person-not-active'));
      if (personId === check.actorId) return fail('A review of your own conduct is not opened by you. Ask the line above you.', 'personId', REFUSAL('self-subject'));
      const graph = matrixOrFail(check);
      if (!graph.ok) return graph;
      const lines = (graph.matrix.linesByPerson.get(personId) || []).filter((line) => line.active !== false);
      const managerIds = [...new Set(lines.map((line) => line.managerId).filter(Boolean))];
      if (!managerIds.length) return fail('This person holds no line on the reporting graph, so no manager can own a review of them. Declare the reporting line first.', 'personId', REFUSAL('no-line'));
      const named = jcText(input.decidingManagerId, L.personIdMax);
      if (managerIds.length > 1 && !named) {
        return fail(`This person is accountable through ${managerIds.length} lines. Name which line decides — the record will not choose one for you. Nothing was saved.`, 'decidingManagerId', REFUSAL('ambiguous-owner'));
      }
      const decider = named || managerIds[0];
      if (!managerIds.includes(decider)) return fail('The named deciding line is not one this person holds on the reporting graph.', 'decidingManagerId', REFUSAL('not-a-line'));
      if (!check.seat.fullAccess && decider !== check.actorId) {
        return fail('Only the manager on the deciding line may open the review. The line that owns the decision is the line that opens it.', 'decidingManagerId', REFUSAL('not-the-decider'));
      }
      const eventOn = jcDay(input.eventOn);
      if (!eventOn) return fail('Give the day the event happened.', 'eventOn', REFUSAL('event-day'));
      if (eventOn > check.today) return fail('The event cannot be dated after today.', 'eventOn', REFUSAL('event-future'));
      const eventSummary = jcText(input.eventSummary, L.summaryMax);
      if (eventSummary.length < L.summaryMin) return fail('Describe what happened in at least a sentence. A review with no description is a verdict with no evidence under it.', 'eventSummary');
      const { reviews } = ledger();
      if (reviews.length >= L.reviews) return fail('The review register is full. Nothing was saved.', null, REFUSAL('register-full'));
      const id = idFactory('jcr');
      const row = {
        id, personId, eventOn, openedOn: check.today, openedById: check.actorId,
        decidingManagerId: decider, eventSummary, eventRef: jcText(input.eventRef, L.refMax),
      };
      const loaded = normalizeJustCultureReviews([row], [])[0];
      if (!loaded) return fail('The review could not be stored as a row this register can read back. Nothing was saved.', null, REFUSAL('unreadable'));
      store.update((draft) => {
        draft.justCultureReviews = Array.isArray(draft.justCultureReviews) ? draft.justCultureReviews : [];
        draft.justCultureReviews.push(loaded);
      }, {
        type: JUST_CULTURE_EVENTS.OPENED,
        entity: 'justCultureReview',
        entityId: id,
        summary: `Just Culture review opened on ${check.today} (${managerIds.length} line(s) held).`.slice(0, 300),
      });
      return saved({ reviewId: id, decidingManagerId: decider, linesN: managerIds.length });
    },

    /** The deciding line answers the questions and records a response. A second decision is a revision. */
    justCultureDecide(input = {}) {
      const check = seatFor(JUST_CULTURE_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = reviewContext(check, input.reviewId);
      if (!ctx.ok) return ctx;
      const { review, derived } = ctx;
      if (derived.state === 'orphaned') {
        return fail('The deciding line no longer holds this person, so nobody can decide this review as it stands. The owner must be reassigned first. Nothing was saved.', 'reviewId', REFUSAL('orphaned'));
      }
      if (!check.seat.fullAccess && review.decidingManagerId !== check.actorId) {
        return fail('Only the manager on the deciding line may decide this review.', 'reviewId', REFUSAL('not-the-decider'));
      }
      // A form sends '' for a question it did not ask. That is NOT an answer: it is
      // the absence of one, so it becomes null before the loader sees it.
      const blank = (value) => (value === '' || value === undefined ? null : value);
      const answers = normalizeJustCultureAnswers({
        deviation: blank(input.deviation), choice: blank(input.choice), risk: blank(input.risk),
        substitution: blank(input.substitution), system: blank(input.system),
      });
      if (!answers) return fail('Answer each question that applies to this path, and only those. An answer under a question that does not apply is refused.', 'answers', REFUSAL('answers-malformed'));
      const expected = justCultureExpectation(answers);
      if (expected.pending.length) {
        return fail(`Not yet decidable. These questions are still open: ${expected.pending.join(', ')}. A decision is recorded only once every question on its path is answered. Nothing was saved.`, 'answers', REFUSAL('answers-owed'));
      }
      const response = JC_RESPONSE_KEYS.includes(input.response) ? input.response : null;
      if (!response) return fail('Choose the response. The register will show whether it follows from the answers.', 'response', REFUSAL('response-missing'));
      const departureReason = jcText(input.departureReason, L.noteMax);
      if (response !== expected.response && departureReason.length < L.noteMin) {
        return fail(`The response chosen (${justCultureResponseLabel(response)}) departs from the response the answers point to (${justCultureResponseLabel(expected.response)}). Write the reason in at least a sentence. Nothing was saved.`, 'departureReason', REFUSAL('mismatch-unexplained'));
      }
      const systemAction = jcText(input.systemAction, L.noteMax);
      if (answers.system === 'present' && systemAction.length < L.noteMin) {
        return fail('A system condition contributed. Name the system action owed, in at least a sentence. Nothing was saved.', 'systemAction', REFUSAL('system-action-missing'));
      }
      const note = jcText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Record the basis for the decision in at least a sentence.', 'note', REFUSAL('note-missing'));
      const day = actDay(input, check, ctx);
      if (day.error) return day.error;
      const revising = Boolean(derived.decision);
      const id = idFactory('jca');
      const act = {
        id, reviewId: review.id, personId: review.personId,
        kind: revising ? 'revised' : 'decided', on: day.day, byId: review.decidingManagerId,
        answers, response, departureReason, systemAction, note,
      };
      const loaded = readBack(act);
      if (!loaded) return fail('The decision could not be stored as a row this register can read back. Nothing was saved.', 'answers', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.justCultureActs = Array.isArray(draft.justCultureActs) ? draft.justCultureActs : [];
        draft.justCultureActs.push(loaded);
      }, {
        type: revising ? JUST_CULTURE_EVENTS.REVISED : JUST_CULTURE_EVENTS.DECIDED,
        entity: 'justCultureReview',
        entityId: review.id,
        summary: `Just Culture ${revising ? 'decision revised' : 'decision recorded'} on ${day.day}: ${response}${response === expected.response ? '' : ' (departs from answers, reason recorded)'}.`.slice(0, 300),
      });
      return saved({ actId: id, response, expectedResponse: expected.response, followsAnswers: response === expected.response, revision: revising });
    },

    /** Another line the person holds concurs with, or dissents from, the decision in force. */
    justCultureConcur(input = {}) {
      const check = seatFor(JUST_CULTURE_RIGHTS.CONCUR);
      if (!check.ok) return check;
      const ctx = reviewContext(check, input.reviewId);
      if (!ctx.ok) return ctx;
      const { review, derived } = ctx;
      const line = check.seat.fullAccess ? jcText(input.lineManagerId, L.personIdMax) : check.actorId;
      if (!line) return fail('Name the line this answer is for. The operator view answers for a named line.', 'lineManagerId', REFUSAL('line-required'));
      if (!derived.managerIds.includes(line)) return fail('That line is not one this person holds on the reporting graph.', 'lineManagerId', REFUSAL('not-a-line'));
      if (line === review.decidingManagerId) return fail('The deciding line does not concur with its own decision. Another line the person holds answers it.', 'lineManagerId', REFUSAL('decider-cannot-concur'));
      if (!derived.decision) return fail('There is no decision to concur with yet. The deciding line answers first.', 'reviewId', REFUSAL('no-decision'));
      const verdict = input.verdict === 'dissent' ? 'dissent' : input.verdict === 'concur' ? 'concur' : null;
      if (!verdict) return fail('Choose concur or dissent.', 'verdict', REFUSAL('verdict-missing'));
      const current = derived.concurrence.find((row) => row.managerId === line);
      if (current && current.verdict !== 'owed') {
        return fail('This line has already answered the decision in force. A second answer is a correction: revise the decision instead if it is wrong. Nothing was saved.', 'lineManagerId', REFUSAL('already-answered'));
      }
      const note = jcText(input.note, L.noteMax);
      if (verdict === 'dissent' && note.length < L.noteMin) return fail('A dissent must say why, in at least a sentence. A dissent with no reason cannot be acted on.', 'note', REFUSAL('dissent-reason-missing'));
      const day = actDay(input, check, ctx);
      if (day.error) return day.error;
      if (day.day < derived.decision.on) return fail(`This answer cannot be dated before the decision it answers (${derived.decision.on}).`, 'on', REFUSAL('day-before-decision'));
      const id = idFactory('jca');
      const act = {
        id, reviewId: review.id, personId: review.personId,
        kind: verdict === 'dissent' ? 'dissented' : 'concurred', on: day.day, byId: line,
        answers: null, response: null, departureReason: '', systemAction: '', note,
      };
      const loaded = readBack(act);
      if (!loaded) return fail('The answer could not be stored as a row this register can read back. Nothing was saved.', 'verdict', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.justCultureActs = Array.isArray(draft.justCultureActs) ? draft.justCultureActs : [];
        draft.justCultureActs.push(loaded);
      }, {
        type: verdict === 'dissent' ? JUST_CULTURE_EVENTS.DISSENTED : JUST_CULTURE_EVENTS.CONCURRED,
        entity: 'justCultureReview',
        entityId: review.id,
        summary: `Just Culture ${verdict === 'dissent' ? 'dissent' : 'concurrence'} recorded on ${day.day}.`.slice(0, 300),
      });
      return saved({ actId: id, verdict: loaded.kind });
    },

    /** Withdraw a review that has NO decision. A decided review is revised, never erased. */
    justCultureWithdraw(input = {}) {
      const check = seatFor(JUST_CULTURE_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = reviewContext(check, input.reviewId);
      if (!ctx.ok) return ctx;
      const { review, derived } = ctx;
      if (derived.decision) {
        return fail('A decision has been recorded. It is revised, not withdrawn: withdrawing would erase a decision someone may already have relied on.', 'reviewId', REFUSAL('decided'));
      }
      if (!check.seat.fullAccess && review.decidingManagerId !== check.actorId) {
        return fail('Only the manager on the deciding line may withdraw the review.', 'reviewId', REFUSAL('not-the-decider'));
      }
      const note = jcText(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail('Say why the review is withdrawn, in at least a sentence.', 'note', REFUSAL('note-missing'));
      const day = actDay(input, check, ctx);
      if (day.error) return day.error;
      const id = idFactory('jca');
      const act = {
        id, reviewId: review.id, personId: review.personId, kind: 'withdrawn', on: day.day, byId: review.decidingManagerId,
        answers: null, response: null, departureReason: '', systemAction: '', note,
      };
      const loaded = readBack(act);
      if (!loaded) return fail('The withdrawal could not be stored as a row this register can read back. Nothing was saved.', 'note', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.justCultureActs = Array.isArray(draft.justCultureActs) ? draft.justCultureActs : [];
        draft.justCultureActs.push(loaded);
      }, {
        type: JUST_CULTURE_EVENTS.WITHDRAWN,
        entity: 'justCultureReview',
        entityId: review.id,
        summary: `Just Culture review withdrawn on ${day.day} before any decision.`.slice(0, 300),
      });
      return saved({ actId: id });
    },

    /** The whole register as this seat may read it. Every figure is derived here. */
    justCultureReport() {
      const { seat, at, cfg } = readSeat();
      return buildJustCultureReport(store.state, { now: at, settings: cfg, seat });
    },

    /** The navigation badge: exactly the attention count the panel prints for this seat. */
    justCultureAttentionCount() {
      const { seat, at, cfg } = readSeat();
      return justCultureAttentionCount(store.state, { now: at, settings: cfg, seat });
    },

    /** Who the seat may open a review for, with every line each person holds. */
    justCultureCandidates() {
      const { seat, at, cfg } = readSeat();
      if (seat.readOnly) return fail(JUST_CULTURE_REFUSALS.notSeated);
      return justCultureCandidates(store.state, { now: at, settings: cfg, seat });
    },
  };
}
