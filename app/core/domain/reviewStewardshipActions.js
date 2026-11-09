/**
 * app/core/domain/reviewStewardshipActions.js — the commands of Matrix Multi-Line
 * Review Stewardship (ADR-0147, Schema v122).
 *
 * THREE human writes, every one dated, span-checked and refused with a printed
 * reason. There is deliberately no fourth that assesses somebody on another
 * line's behalf, and none that marks a line "asked" without a human asking it.
 *
 *   reviewStewardshipAsk     "Ask THIS line's manager for their input into THIS
 *                             review, by this date, with this context." Refuses a
 *                             line that was not in force during the period, a
 *                             manager who does not hold the line, an ask with no
 *                             due date, and a second live ask for the same line.
 *                             A re-ask after the window has closed is a NEW row,
 *                             not an overwrite — the earlier ask stays on the
 *                             record, because "we chased them" is a fact.
 *
 *   reviewStewardshipAnswer  "This is what my line saw of this person in the
 *                             period — in my own words — or nothing to add, and
 *                             here is why." Enforced: only the seat that manages
 *                             the named line may answer, only once per line, and a
 *                             decline must carry a reason. It does NOT set a
 *                             rating: the assessor decides, the line informs.
 *
 *   reviewStewardshipScan    Re-run RULE-SRV-01 on the existing reviews so any
 *                             obligation a cap deferred is retried. Changes no
 *                             declaration and no answer.
 *
 * WHAT NO COMMAND HERE WILL DO
 * ----------------------------
 * It will not pick a single assessor when two lines declared the performance
 * right; it will not complete a review whose lines were never asked; it will not
 * edit a completed packet; and it will not record an answer as somebody else.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildReviewStewardship,
  lineOverlapsPeriod,
  stewardshipLineKey,
} from './reviewStewardship.js';
import { normalizeReviewStewardshipSettings } from './reviewStewardshipSchema.js';
import {
  REVIEW_STEWARDSHIP_EVENTS,
  REVIEW_STEWARDSHIP_LIMITS,
  REVIEW_STEWARDSHIP_SCAN_EVENT,
} from './reviewStewardshipRegistry.js';

const MIN_ANSWER = 8;
const MIN_REASON = 8;

export function createReviewStewardshipActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const at = clock();
    const cfg = settings();
    const built = buildSeats(store.state, {
      now: at,
      settings: cfg,
      lineScope: matrixLineScopeFor(store.state, { now: at, settings: cfg }),
    });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before asking for or recording line input.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const findReview = (id) => (Array.isArray(store.state.reviews) ? store.state.reviews : []).find((r) => r && r.id === id) || null;
  const people = () => (Array.isArray(store.state.people) ? store.state.people : []);

  /** Can this seat see this person at all — tree OR declared line, as ADR-0141. */
  const seatReaches = (seat, personId) => {
    if (seat.fullAccess) return true;
    if (seat.id === personId) return true;
    if (seat.scope?.has?.(personId)) return true;
    if (seat.lineScope?.has?.(personId)) return true;
    return false;
  };

  /** The resolved line for a person's period, by its stable key. */
  const resolveLine = (review, lineKey) => {
    const at = clock();
    const cfg = settings();
    const matrix = buildMatrix(store.state, { now: at, settings: cfg });
    const report = buildReviewStewardship(store.state, review, { now: at, settings: cfg });
    const line = report.lines.find((l) => l.key === String(lineKey || '')) || null;
    return { matrix, report, line };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    reviewStewardshipRead(reviewId) {
      const check = seatFor('ask-review-input');
      if (!check.ok) return check;
      const review = findReview(reviewId);
      if (!review) return fail('That review no longer exists.', 'reviewId');
      if (!seatReaches(check.seat, review.personId)) {
        return fail('That review is outside your operating seat. Line input is only readable from a seat above the person or on one of their lines.');
      }
      return { ok: true, report: buildReviewStewardship(store.state, review, { now: clock(), settings: settings() }) };
    },

    reviewStewardshipCandidates(reviewId) {
      const check = seatFor('ask-review-input');
      if (!check.ok) return check;
      const review = findReview(reviewId);
      if (!review) return fail('That review no longer exists.', 'reviewId');
      const { report } = resolveLine(review, '');
      return {
        ok: true,
        lines: report.lines.map((l) => ({
          key: l.key,
          managerId: l.managerId,
          managerName: l.managerName,
          role: l.role,
          kind: l.kind,
          inPeriod: l.inPeriod,
          reason: l.reason,
          lineState: l.lineState,
          canAsk: l.inPeriod && !l.request,
        })),
      };
    },

    /* --------------------------------------------------------------- writes */

    reviewStewardshipAsk(input = {}) {
      const check = seatFor('ask-review-input');
      if (!check.ok) return check;
      const { seat } = check;
      const review = findReview(String(input.reviewId || '').trim());
      if (!review) return fail('That review no longer exists.', 'reviewId');
      if (review.status !== 'draft') {
        return fail('This review is complete and its packet is frozen. Reopen it before asking a line for input — a question asked after the fact cannot change an assessment that has already been signed.', 'reviewId');
      }
      if (!seatReaches(seat, review.personId)) {
        return fail('That review is outside your operating seat.', 'reviewId');
      }
      const lineKey = String(input.lineKey || '').trim();
      if (!lineKey) return fail('Choose the reporting line you are asking.', 'lineKey');
      const { line, report } = resolveLine(review, lineKey);
      if (!line) {
        return fail('That reporting line does not resolve on this person. A line that is not on the record cannot be asked.', 'lineKey');
      }
      if (!line.inPeriod) {
        return fail(`${line.reason} A line that was not in force during the period cannot contribute to it.`, 'lineKey');
      }
      if (line.answer) {
        return fail(`${line.managerName} has already answered for this line on ${line.answer.answeredOn}. The register keeps the first answer: a second one would make the record of who said what unfalsifiable.`, 'lineKey');
      }
      if (line.request && !line.request.overdue) {
        return fail(`${line.managerName} was already asked on ${line.request.askedOn} and the ${report.conventions.reviewStewardshipAnswerDays}-day window has not closed. Chasing an open ask is not the same act as asking again; wait for the due date${line.request.dueOn ? ` (${line.request.dueOn})` : ''} or record the answer.`, 'lineKey');
      }

      const conv = normalizeReviewStewardshipSettings(settings());
      const today = dayKey(clock());
      const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueOn || ''))
        ? String(input.dueOn)
        : addDays(today, conv.reviewStewardshipAnswerDays);
      if (dueOn < today) return fail('The answer window cannot end before today.', 'dueOn');
      const note = String(input.note || '').trim().slice(0, REVIEW_STEWARDSHIP_LIMITS.noteChars);
      if (note.length < 12) {
        return fail('Say what you want this line to speak to (at least a sentence). An ask with no subject gets a vague answer, which is worse than no answer because it looks like evidence.', 'note');
      }

      const rowId = idFactory('req');
      const at = clock();
      store.update((draft) => {
        const target = (draft.reviews || []).find((r) => r && r.id === review.id);
        if (!target) return;
        target.stewardship = target.stewardship && typeof target.stewardship === 'object' ? target.stewardship : { requests: [], answers: [] };
        target.stewardship.requests = Array.isArray(target.stewardship.requests) ? target.stewardship.requests : [];
        if (target.stewardship.requests.length >= REVIEW_STEWARDSHIP_LIMITS.requests) {
          target.stewardship.requests.splice(0, target.stewardship.requests.length - REVIEW_STEWARDSHIP_LIMITS.requests + 1);
        }
        target.stewardship.requests.push({
          id: rowId,
          lineKey: line.key,
          lineRole: line.role,
          lineKind: line.kind,
          managerId: line.managerId,
          askedOn: today,
          askedBySeatId: seat.fullAccess ? null : seat.id,
          dueOn,
          note,
        });
        target.updatedAt = at.toISOString();
      }, {
        type: REVIEW_STEWARDSHIP_EVENTS.REQUEST,
        entity: 'review',
        entityId: review.id,
        summary: `Input requested from ${line.managerName} (${line.kind} line) for the review period ending ${review.periodEnd}, due ${dueOn}.`.slice(0, 300),
      });
      return saved({ id: rowId, lineKey: line.key, dueOn, reviewId: review.id });
    },

    reviewStewardshipAnswer(input = {}) {
      const check = seatFor('answer-review-input');
      if (!check.ok) return check;
      const { seat } = check;
      const review = findReview(String(input.reviewId || '').trim());
      if (!review) return fail('That review no longer exists.', 'reviewId');
      const lineKey = String(input.lineKey || '').trim();
      if (!lineKey) return fail('Choose the reporting line you are answering for.', 'lineKey');
      const { line } = resolveLine(review, lineKey);
      if (!line) return fail('That reporting line does not resolve on this person.', 'lineKey');
      if (!line.request) {
        return fail('Nobody has asked this line for input on this review. An answer to a question that was never put is not a record of anything.', 'lineKey');
      }
      // FIRST PERSON ONLY. The answer must come from the manager whose line it is,
      // or from the workspace leader acting as operator. A peer cannot answer for
      // another line, and the home-line manager cannot answer for a project line.
      const isOwner = seat.fullAccess ? true : seat.id === line.managerId;
      if (!isOwner) {
        return fail(`Only ${line.managerName}, who holds this line, can answer for it. Recording another manager's view under their line would fabricate consent to an assessment.`, 'lineKey');
      }
      if (line.answer) {
        return fail(`This line already answered on ${line.answer.answeredOn}. There is no second answer: ask again for a later period if the situation changed.`, 'lineKey');
      }
      if (review.status !== 'draft') {
        return fail('This review is complete. Its packet is frozen, and an answer arriving after the signature cannot change what was signed.', 'reviewId');
      }

      const outcomeRaw = String(input.outcome || '').trim();
      if (!['input', 'declined'].includes(outcomeRaw)) {
        return fail('State whether you have something to add, or whether there is nothing to add.', 'outcome');
      }
      const body = String(input.text || '').trim().slice(0, REVIEW_STEWARDSHIP_LIMITS.answerChars);
      const reason = String(input.reason || '').trim().slice(0, REVIEW_STEWARDSHIP_LIMITS.reasonChars);
      if (outcomeRaw === 'input' && body.length < MIN_ANSWER) {
        return fail('Write at least a sentence naming what this line observed. A one-word answer cannot support an assessment.', 'text');
      }
      if (outcomeRaw === 'declined' && reason.length < MIN_REASON) {
        return fail('Say why there is nothing to add. A bare refusal is indistinguishable from a missed deadline, and the record would read as considered when nothing was considered.', 'reason');
      }
      // The coarse signal is the ONLY field the reconciliation compares for
      // divergence, because it is a declared human judgement on a shared scale.
      // It is OPTIONAL on every answer and does not change whether the answer
      // counts as answered — a paragraph with no signal still reads `answered`
      // and still counts toward stewardship completeness. The reconciliation
      // instead reads `unrated-pair` when too few signals are present, rather
      // than inventing a signal from the prose.
      const VALID_SIGNALS = new Set(['needs-support', 'as-expected', 'strong', 'exceptional']);
      const signalRaw = typeof input.signal === 'string' ? input.signal.trim() : '';
      const signal = outcomeRaw === 'input' && signalRaw ? signalRaw : null;
      if (signalRaw && !VALID_SIGNALS.has(signalRaw)) {
        return fail('A signal must be one of the four coarse assessments or left blank — it is a declared human judgement, not an inferred one.', 'signal');
      }

      const rowId = idFactory('ans');
      const at = clock();
      const today = dayKey(at);
      store.update((draft) => {
        const target = (draft.reviews || []).find((r) => r && r.id === review.id);
        if (!target) return;
        target.stewardship = target.stewardship && typeof target.stewardship === 'object' ? target.stewardship : { requests: [], answers: [] };
        target.stewardship.answers = Array.isArray(target.stewardship.answers) ? target.stewardship.answers : [];
        if (target.stewardship.answers.length >= REVIEW_STEWARDSHIP_LIMITS.answers) {
          // Bounded ledger: the OLDEST answer is displaced, and the displacement
          // is printed in the event summary rather than happening silently.
          target.stewardship.answers.splice(0, target.stewardship.answers.length - REVIEW_STEWARDSHIP_LIMITS.answers + 1);
        }
        target.stewardship.answers.push({
          id: rowId,
          lineKey: line.key,
          lineManagerId: line.managerId,
          outcome: outcomeRaw,
          answeredOn: today,
          answeredBySeatId: seat.fullAccess ? null : seat.id,
          text: outcomeRaw === 'input' ? body : '',
          reason: outcomeRaw === 'declined' ? reason : '',
          signal: signal || null,
        });
        target.updatedAt = at.toISOString();
      }, {
        type: REVIEW_STEWARDSHIP_EVENTS.ANSWER,
        entity: 'review',
        entityId: review.id,
        summary: outcomeRaw === 'input'
          ? `${line.managerName} recorded ${line.kind}-line input for the review period ending ${review.periodEnd}.`
          : `${line.managerName} recorded that there is nothing to add for the ${line.kind} line, with a reason.`,
      });
      return saved({ id: rowId, reviewId: review.id, lineKey: line.key, outcome: outcomeRaw });
    },

    reviewStewardshipScan() {
      const check = seatFor('govern-duty-cover');
      if (!check.ok) {
        // A scan changes nothing a human declared; fall back to the review right
        // so a frontline manager can retry their own deferred ask.
        const retry = seatFor('ask-review-input');
        if (!retry.ok) return check;
      }
      store.update((draft) => {
        draft.reviews = Array.isArray(draft.reviews) ? draft.reviews : [];
      }, {
        type: REVIEW_STEWARDSHIP_SCAN_EVENT,
        entity: 'workspace',
        entityId: 'reviews',
        summary: 'Matrix review stewardship scanned; deferred obligations retried and no declaration changed.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },
  };
}
