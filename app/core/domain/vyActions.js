/**
 * app/core/domain/vyActions.js — `createVyActions(store, { now, idFactory })`
 * for the Vroom–Yetton–Jago Decision-Participation Selector (ADR-0230,
 * Schema v183, `RULE-VY-01`).
 *
 * Five human acts and nothing else: DECLARE a participation question,
 * WITHDRAW it (final), RECORD diagnostic answers on a line, SELECT a
 * participation style (accept or override the recommendation with a reason),
 * and GRADE whether the predicted commitment materialised. Every figure,
 * verdict and style is re-derived on read by `vy.js`; nothing derived is
 * stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - No diagnostic answer is inferred from a reporting line, a title or an
 *    org chart — each is a dated, named yes/no declaration.
 *  - One answer per (decision, line, seat) — a second is a duplicate, not an
 *    amendment.
 *  - The seat that SELECTS the style must not also have answered the
 *    diagnostics for the same line — the choice and the evidence stay apart.
 *  - A decide-alone style (A1/A2) is refused where another line has answered
 *    the diagnostics — one line may not autocratically decide on another
 *    line's territory.
 *  - Grading is director-and-above, and the seat that selected the style may
 *    not grade its own outcome.
 *  - A write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { buildSeats, activeSeat, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildChain } from './chain.js';
import { dayKey } from '../time.js';
import {
  buildVroomYetton,
  vyAttentionCount,
} from './vy.js';
import {
  normalizeVyDecisions,
  normalizeVyAnswers,
  normalizeVyStyleRecords,
  vyId, vyActorId, vyDay, vyBool, vyText, vyOneOf,
} from './vySchema.js';
import {
  VY_EVENTS,
  VY_LIMITS as L,
  VY_QUESTION_KEYS,
  VY_PER_LINE_KEYS,
  VY_SOLO_DIAGNOSTICS,
  VY_STYLE_KEYS,
  VY_TREE_KEYS,
  VY_REFUSALS,
  VY_RIGHTS,
  vyQuestion,
  vyStyle,
} from './vyRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);
const fail = (error, field = null, extra = {}) => ({ ok: false, error, field, ...extra });

/** The line ids a seat holds as manager, read from the declared reporting lines. */
function seatHeldLines(state, seatId) {
  return new Set(
    (Array.isArray(state?.reportingLines) ? state.reportingLines : [])
      .filter((rl) => rl && rl.managerId === seatId && rl.active !== false)
      .map((rl) => rl.id),
  );
}

export function createVyActions(store, { now, idFactory } = {}) {
  const clock = typeof now === 'function' ? now : (() => new Date());
  const makeId = typeof idFactory === 'function' ? idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  const buildSeat = () => buildSeats(store.state, { now: clock(), settings: store.state.settings || null });

  function seatFor(right) {
    const at = clock();
    const built = buildSeat();
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(VY_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const cfg = store.state.settings || {};
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? LEADER_ID : (seat.id || null), today: dayKey(at) };
  }

  /* ---------------------------------------------------------- DECLARE */

  function declareVyDecision(input = {}) {
    const check = seatFor(VY_RIGHTS.DECLARE);
    if (!check.ok) return check;

    const title = vyText(input.title, L.titleMax);
    if (title.length < L.titleMin) {
      return fail(`Name the decision, in ${L.titleMin}–${L.titleMax} characters.`, 'title', { refusals: ['title-too-short'] });
    }
    const question = vyText(input.question, L.textMax);
    if (!question) return fail('State the decision question in one sentence.', 'question', { refusals: ['question-missing'] });
    const reason = vyText(input.reason, L.reasonMax);
    if (reason.length < L.reasonMin) {
      return fail(`Write the basis for this participation question, in at least ${L.reasonMin} characters.`, 'reason', { refusals: ['reason-too-short'] });
    }
    const treeVariant = vyOneOf(VY_TREE_KEYS, input.treeVariant);
    if (!treeVariant) return fail('Choose a tree variant: time-driven or development-driven.', 'treeVariant', { refusals: ['tree-variant-missing'] });
    const lineIds = Array.isArray(input.lineIds)
      ? [...new Set(input.lineIds.map((x) => vyId(x)).filter(Boolean))].sort()
      : [];

    // Validate lines: the seat must hold each declared line.
    const seatLineIds = seatHeldLines(store.state, check.seat.id);
    for (const lid of lineIds) {
      if (!seatLineIds.has(lid)) {
        return fail(`This seat does not hold line ${lid}; it cannot declare a decision on that line.`, 'lineIds', { refusals: ['not-your-line'] });
      }
    }

    const already = normalizeVyDecisions([...rows('vyDecisions')], []).some(
      (d) => d.title.toLowerCase() === title.toLowerCase() && !d.withdrawnOn,
    );
    if (already) {
      return fail('A live decision already carries that title. Amend that one, or withdraw it first.', 'title', { refusals: ['duplicate-title'] });
    }

    if (rows('vyDecisions').length >= L.decisions) {
      return fail('The decision register is at its declared cap; withdraw or export before opening another.', null, { refusals: ['ledger-full'] });
    }

    let stored = null;
    store.update((draft) => {
      const row = {
        id: makeId('vy-decision'),
        title,
        question,
        declaredById: check.seat.id,
        declaredOn: check.today,
        treeVariant,
        lineIds,
        withdrawnOn: null,
        reason,
      };
      const kept = normalizeVyDecisions([...(draft.vyDecisions || []), row], []);
      const found = kept.find((candidate) => candidate.id === row.id);
      if (!found) return;
      draft.vyDecisions = kept;
      stored = found;
    }, { type: VY_EVENTS.DECISION_DECLARED, entity: 'vyDecision', entityId: stored ? stored.id : null, summary: `Declare Vroom–Yetton decision: ${title.slice(0, 80)}` });

    if (!stored) return fail('The decision could not be read back by the loader, so nothing was saved.', null, { refusals: ['loader-refused'] });
    return { ok: true, decision: stored, seat: check.seat };
  }

  /* --------------------------------------------------------- WITHDRAW */

  function withdrawVyDecision(input = {}) {
    const check = seatFor(VY_RIGHTS.DECLARE);
    if (!check.ok) return check;

    const decisionId = vyId(input.decisionId);
    if (!decisionId) return fail('Name the decision to withdraw.', 'decisionId', { refusals: ['decision-missing'] });
    const reason = vyText(input.reason, L.reasonMax);
    if (reason.length < L.reasonMin) {
      return fail(`Write why this decision is being withdrawn, in at least ${L.reasonMin} characters.`, 'reason', { refusals: ['reason-too-short'] });
    }

    const decision = rows('vyDecisions').find((d) => d.id === decisionId);
    if (!decision) return fail('That decision is not on this record.', 'decisionId', { refusals: ['not-found'] });
    if (decision.withdrawnOn) return fail('This decision was already withdrawn.', 'decisionId', { refusals: ['already-withdrawn'] });

    const seatLineIds = seatHeldLines(store.state, check.seat.id);
    if (decision.declaredById !== check.seat.id) {
      const holdsLine = decision.lineIds.some((lid) => seatLineIds.has(lid));
      if (!holdsLine && !check.seat.fullAccess) {
        return fail('Only the declaring seat, a seat holding a touched line, or the workspace apex may withdraw.', 'decisionId', { refusals: ['not-your-decision'] });
      }
    }

    let stored = null;
    store.update((draft) => {
      const next = (draft.vyDecisions || []).map((row) =>
        row.id === decisionId
          ? { ...row, withdrawnOn: check.today, reason: `${row.reason} — withdrawn ${check.today}: ${reason}`.slice(0, L.reasonMax) }
          : row);
      const kept = normalizeVyDecisions(next, []);
      const found = kept.find((r) => r.id === decisionId);
      if (!found) return;
      draft.vyDecisions = kept;
      stored = found;
    }, { type: VY_EVENTS.DECISION_WITHDRAWN, entity: 'vyDecision', entityId: decisionId, summary: `Withdraw Vroom–Yetton decision: ${decisionId}` });

    if (!stored) return fail('The withdrawal could not be read back by the loader, so nothing was saved.', null, { refusals: ['loader-refused'] });
    return { ok: true, decision: stored, seat: check.seat };
  }

  /* -------------------------------------------------- RECORD ANSWERS */

  function recordVyAnswers(input = {}) {
    const check = seatFor(VY_RIGHTS.ANSWER);
    if (!check.ok) return check;

    const decisionId = vyId(input.decisionId);
    if (!decisionId) return fail('Name the decision these answers belong to.', 'decisionId', { refusals: ['decision-missing'] });

    const decision = rows('vyDecisions').find((d) => d.id === decisionId);
    if (!decision) return fail('That decision is not on this record.', 'decisionId', { refusals: ['not-found'] });
    if (decision.withdrawnOn) return fail('This decision is withdrawn.', 'decisionId', { refusals: ['withdrawn'] });

    const lineId = input.lineId ? vyId(input.lineId) : null;

    const answers = {};
    let answersPresent = false;
    for (const key of VY_QUESTION_KEYS) {
      const raw = input[key];
      if (raw === undefined || raw === null) continue;
      const bool = vyBool(raw);
      if (bool === null) return fail(`${vyQuestion(key)?.label || key} must be answered yes or no.`, key, { refusals: ['answer-not-boolean'] });
      answers[key] = bool;
      answersPresent = true;
    }
    if (!answersPresent) return fail('Record at least one diagnostic answer.', 'answers', { refusals: ['no-answers'] });

    // Per-line diagnostics require a line; solo diagnostics must not carry one.
    for (const key of VY_PER_LINE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(answers, key) && !lineId) {
        return fail(`${vyQuestion(key)?.label || key} is answered per line — name the line.`, key, { refusals: ['line-required'] });
      }
    }
    for (const key of VY_SOLO_DIAGNOSTICS) {
      if (Object.prototype.hasOwnProperty.call(answers, key) && lineId) {
        return fail(`${vyQuestion(key)?.label || key} is answered once per decision, not under a line.`, key, { refusals: ['line-not-allowed'] });
      }
    }

    // The seat must hold the line (for per-line answers) or hold a line the
    // decision touches / have declared it (for solo answers).
    const seatLineIds = seatHeldLines(store.state, check.seat.id);
    if (lineId && !seatLineIds.has(lineId)) {
      return fail(`This seat does not hold line ${lineId}.`, 'lineId', { refusals: ['not-your-line'] });
    }
    if (!lineId) {
      if (decision.declaredById !== check.seat.id && !decision.lineIds.some((lid) => seatLineIds.has(lid))) {
        return fail('This seat neither declared the decision nor holds a line it touches.', 'seatId', { refusals: ['not-your-decision'] });
      }
    }

    // One answer per (decision, line, seat).
    const signature = `${decisionId}|${lineId || ''}|${check.seat.id}`;
    const existing = (rows('vyAnswers') || []).find((a) => `${a.decisionId}|${a.lineId || ''}|${a.answeredById}` === signature);
    if (existing) return fail('An answer for this decision, line and seat already exists. Amend it rather than recording a second.', 'decisionId', { refusals: ['duplicate-answer'] });

    let stored = null;
    store.update((draft) => {
      const next = {
        id: makeId('vy-answer'),
        decisionId,
        answeredById: check.seat.id,
        answeredOn: check.today,
        lineId,
        answers,
      };
      draft.vyAnswers = [...(draft.vyAnswers || []), next];
      stored = next;
    }, { type: VY_EVENTS.ANSWERS_RECORDED, entity: 'vyAnswer', entityId: stored ? stored.id : null, summary: `Record Vroom–Yetton answers for decision: ${decisionId}` });

    if (!stored) return fail('The answers could not be read back by the loader, so nothing was saved.', null, { refusals: ['loader-refused'] });
    return { ok: true, answer: stored, seat: check.seat };
  }

  /* ----------------------------------------------------- SELECT STYLE */

  function selectVyStyle(input = {}) {
    const check = seatFor(VY_RIGHTS.SELECT);
    if (!check.ok) return check;

    const decisionId = vyId(input.decisionId);
    if (!decisionId) return fail('Name the decision this style belongs to.', 'decisionId', { refusals: ['decision-missing'] });

    const decision = rows('vyDecisions').find((d) => d.id === decisionId);
    if (!decision) return fail('That decision is not on this record.', 'decisionId', { refusals: ['not-found'] });
    if (decision.withdrawnOn) return fail('This decision is withdrawn.', 'decisionId', { refusals: ['withdrawn'] });

    const chosenStyle = vyOneOf(VY_STYLE_KEYS, input.chosenStyle);
    if (!chosenStyle) return fail('Choose a participation style: A1, A2, C1, C2 or G2.', 'chosenStyle', { refusals: ['style-missing'] });

    // Build the reader to get the recommended style for this decision.
    const report = buildVroomYetton(store.state, { now: check.today, settings: check.cfg, seat: check.seat });
    const row = report.rows.find((r) => r.id === decisionId);
    if (!row) return fail('The decision could not be read in the participation register.', 'decisionId', { refusals: ['unreadable'] });
    if (!row.combined) return fail('No diagnostic answers have been recorded for this decision. Answer the seven diagnostics first.', 'decisionId', { refusals: ['no-answers'] });

    const recommended = row.recommended[decision.treeVariant];
    if (!recommended) return fail('No recommendation could be computed for this decision on the declared tree.', 'decisionId', { refusals: ['no-recommendation'] });

    const overrideReason = vyText(input.overrideReason || '', L.reasonMax);
    const isOverride = chosenStyle !== recommended;

    if (isOverride && overrideReason.length < L.reasonMin) {
      return fail(`An override requires a written reason of at least ${L.reasonMin} characters.`, 'overrideReason', { refusals: ['override-reason-too-short'] });
    }
    if (!isOverride && overrideReason.length > 0) {
      return fail('An override reason is only recorded when the chosen style differs from the recommendation.', 'overrideReason', { refusals: ['override-reason-not-needed'] });
    }

    // Feasibility: a decide-alone style is unavailable where another line has answered.
    if (['A1', 'A2'].includes(chosenStyle)) {
      const answers = rows('vyAnswers') || [];
      for (const ans of answers) {
        if (ans.decisionId === decisionId && ans.lineId && ans.answeredById !== check.seat.id) {
          return fail(`${chosenStyle} is not feasible: another line has answered the diagnostics, so decide-alone is unavailable.`, 'chosenStyle', { refusals: ['decide-alone-unavailable'] });
        }
      }
    }

    // One style record per decision.
    const existing = (rows('vyStyleRecords') || []).find((sr) => sr.decisionId === decisionId);
    if (existing) return fail('A participation style is already recorded on this decision.', 'decisionId', { refusals: ['already-selected'] });

    const seatLineIds = seatHeldLines(store.state, check.seat.id);
    if (!decision.lineIds.some((lid) => seatLineIds.has(lid)) && decision.declaredById !== check.seat.id && !check.seat.fullAccess) {
      return fail('This seat neither declared the decision nor holds a line it touches.', 'seatId', { refusals: ['not-your-decision'] });
    }

    let stored = null;
    store.update((draft) => {
      const next = {
        id: makeId('vy-style'),
        decisionId,
        actorId: check.actorId,
        at: check.today,
        chosenStyle,
        recommendedStyle: recommended,
        overrideReason: isOverride ? overrideReason : '',
        followUpOn: null,
        commitmentMaterialised: null,
      };
      draft.vyStyleRecords = [...(draft.vyStyleRecords || []), next];
      stored = next;
    }, { type: VY_EVENTS.STYLE_SELECTED, entity: 'vyStyleRecord', entityId: stored ? stored.id : null, summary: `Select Vroom–Yetton style: ${chosenStyle} for decision ${decisionId}` });

    if (!stored) return fail('The style selection could not be read back by the loader, so nothing was saved.', null, { refusals: ['loader-refused'] });
    return { ok: true, styleRecord: stored, recommended, seat: check.seat };
  }

  /* ---------------------------- RECORD COMMITMENT OUTCOME (GRADE) */

  function recordVyCommitmentOutcome(input = {}) {
    const check = seatFor(VY_RIGHTS.SELECT);
    if (!check.ok) return check;

    const decisionId = vyId(input.decisionId);
    if (!decisionId) return fail('Name the decision to grade.', 'decisionId', { refusals: ['decision-missing'] });

    const commitmentMaterialised = vyBool(input.commitmentMaterialised);
    if (commitmentMaterialised === null) return fail('Answer yes or no: did the predicted commitment materialise?', 'commitmentMaterialised', { refusals: ['outcome-missing'] });

    const lesson = vyText(input.lesson, L.reasonMax);
    if (lesson.length < L.reasonMin) {
      return fail(`Write what this taught you, in at least ${L.reasonMin} characters.`, 'lesson', { refusals: ['lesson-too-short'] });
    }

    const decision = rows('vyDecisions').find((d) => d.id === decisionId);
    if (!decision) return fail('That decision is not on this record.', 'decisionId', { refusals: ['not-found'] });
    if (decision.withdrawnOn) return fail('This decision is withdrawn.', 'decisionId', { refusals: ['withdrawn'] });

    const styleRecord = (rows('vyStyleRecords') || []).find((sr) => sr.decisionId === decisionId);
    if (!styleRecord) return fail('No participation style is recorded for this decision; nothing to grade.', 'decisionId', { refusals: ['no-style-recorded'] });
    if (styleRecord.commitmentMaterialised !== null) return fail('This decision has already been graded.', 'decisionId', { refusals: ['already-graded'] });

    // Grading is director-and-above; the selector may not grade their own selection.
    if (check.seat.rank < 3) return fail('Grading a participation outcome is a director-and-above act.', 'seatId', { refusals: ['below-rank'] });
    if (styleRecord.actorId === check.seat.id) {
      return fail('The seat that selected the style may not grade its own outcome.', 'seatId', { refusals: ['self-grade'] });
    }
    if (styleRecord.followUpOn && check.today < styleRecord.followUpOn) {
      return fail(`This decision cannot be graded before its follow-up day ${styleRecord.followUpOn}.`, 'at', { refusals: ['too-early'] });
    }

    store.update((draft) => {
      const next = (draft.vyStyleRecords || []).map((sr) =>
        sr.decisionId === decisionId
          ? { ...sr, commitmentMaterialised, followUpOn: check.today }
          : sr);
      draft.vyStyleRecords = next;
    }, { type: 'vroom-yetton.commitment.graded', entity: 'vyStyleRecord', entityId: decisionId, summary: `Grade Vroom–Yetton outcome: ${commitmentMaterialised ? 'commitment materialised' : 'commitment did not materialise'} for decision ${decisionId}` });

    return { ok: true, styleRecord: { ...styleRecord, commitmentMaterialised, followUpOn: check.today }, seat: check.seat };
  }

  /* ----------------------------------------------------------- SCAN */

  function sourcingVyScan() {
    // The scan is handled by RULE-VY-01 on the post-commit spine; here we
    // return the attention count for the badge.
    const check = seatFor(VY_RIGHTS.READ);
    if (!check.ok) return { ok: true, count: 0 };
    return vyAttentionCount(store.state, { now: check.today, settings: check.cfg, seat: check.seat });
  }

  /* ----------------------------------------------------------- READ */

  function vyReport() {
    const check = seatFor(VY_RIGHTS.READ);
    if (!check.ok) return check;
    const report = buildVroomYetton(store.state, { now: check.today, settings: check.cfg, seat: check.seat });
    return { ok: true, report, seat: check.seat };
  }

  return {
    declareVyDecision,
    withdrawVyDecision,
    recordVyAnswers,
    selectVyStyle,
    recordVyCommitmentOutcome,
    vyReport,
    sourcingVyScan,
  };
}
