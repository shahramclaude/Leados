/**
 * app/core/domain/sodRegisterRules.js — RULE-SOD-01, the Cross-Line
 * Segregation-of-Duties Register's one consequence on the shared spine
 * (ADR-0170).
 *
 * THE DUTY. A segregation-of-duties reading that only ever exists on a screen is
 * not a control. The control is the REVIEW: on a named day, somebody with the
 * standing to do it read the register and that reading went on the record, so
 * that next quarter "we reviewed it" is a dated line in the same append-only
 * ledger every other governed signal uses — not a memory.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It runs on exactly ONE event: an explicit, human-requested review
 *    (`SOD_REVIEW_EVENT`). It never fires when a decision is logged, decided or
 *    edited, so no existing flow changes behaviour by its presence.
 *  - It re-reads the register on the WHOLE workspace with the operator view —
 *    a recorded review is a workspace fact, whatever seat pressed the button —
 *    and appends ONE identity-free marker plus one propagation trace carrying
 *    the counts: read, tested, conflicted, irreversible, by class, with no seat
 *    above the hand, unreadable, not testable.
 *  - It is IDEMPOTENT per day per reading: the same review of the same record on
 *    the same day is not written twice; a changed record is a new reading.
 *  - It opens no case, issues no delegation, edits no decision, revokes no right
 *    and names no person. Putting an owned ask in front of the seat above the
 *    hand is a separate, later act (see ADR-0170, "Not in this slice").
 *  - The review is a commit like any other, so every OTHER standing rule on the
 *    spine runs on it exactly as it would on the next save. That is the spine's
 *    contract, not this rule's doing, and the panel says so.
 */

import { dayKey } from '../time.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { buildSodRegister } from './sodRegister.js';
import { SOD_REVIEW_EVENT, SOD_RULE_ID } from './sodRegisterRegistry.js';

export { SOD_REVIEW_EVENT, SOD_RULE_ID };

/** One key per day per distinct reading. Counts only — no person, no decision. */
export function sodReviewKey(today, board) {
  return [
    'sod',
    today,
    board.readN,
    board.testedN,
    board.conflictN,
    board.conflictOneWayN,
    board.sameHandN,
    board.dependentHandN,
    board.secondLineN,
    board.custodyN,
    board.seatNoneN,
    board.seatTieN,
    board.unreadableN,
    board.refusedN,
  ].join('|');
}

/** The identity-free line the ledger carries. */
export function sodReviewSummary(board) {
  return (`Segregation-of-duties review recorded: ${board.readN} decided decision(s) read, ${board.testedN} tested, `
    + `${board.conflictN} conflicted (${board.conflictOneWayN} irreversible) — ${board.sameHandN} one hand, `
    + `${board.dependentHandN} dependent hand (${board.secondLineN} only through a second line), ${board.custodyN} custodian; `
    + `${board.seatNoneN} with no seat above the hand; ${board.unreadableN} unreadable; ${board.refusedN} not testable.`).slice(0, 300);
}

function recordMarker(draft, now, key, detail) {
  if (!Array.isArray(draft.matrixMarkers)) draft.matrixMarkers = [];
  if (draft.matrixMarkers.some((row) => row && row.key === key)) return false;
  draft.matrixMarkers.push({
    key,
    at: now.toISOString(),
    ruleId: SOD_RULE_ID,
    kind: 'sod-review',
    detail,
  });
  if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) {
    draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
  }
  return true;
}

export function sodRegisterRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || event.type !== SOD_REVIEW_EVENT) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now) || now.toISOString().slice(0, 10);

  // The recorded review is a workspace-level fact. The acting manager's scoped
  // panel is NOT the data source: the operator context is stated, not guessed.
  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const report = buildSodRegister({ ...draft, settings: operator }, { now, settings: operator });
  const board = report.board;
  // Nothing was read, so there is no review to record.
  if (!board.readN) return [];

  const detail = sodReviewSummary(board);
  if (!recordMarker(draft, now, sodReviewKey(today, board), detail)) return [];

  const effect = {
    ruleId: SOD_RULE_ID,
    action: board.conflictOneWayN ? 'recorded-control-gaps' : 'recorded-review',
    targetType: 'workspace',
    targetId: 'matrix',
    summary: detail,
  };
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'sodreview',
      entityId: 'matrix',
      summary: `[${SOD_RULE_ID}] ${detail}`.slice(0, 300),
    });
  }
  return [effect];
}
