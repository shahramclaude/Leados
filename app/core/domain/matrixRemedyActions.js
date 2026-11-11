/**
 * app/core/domain/matrixRemedyActions.js — the governed command for the Matrix
 * Pattern Repair Register (ADR-0175, Schema v139).
 *
 * One human command ships in this slice:
 *
 *   matrixRemedyDeclare  a span-level seat (rank 4+, or the full-access operator)
 *                        names an accountable owner, a dated remedy and a review
 *                        date against ONE recurring structural pattern that is
 *                        visible in the acting seat.
 *
 * Standing rules, enforced here and never delegated to client input:
 *  - `canAct('declare-matrix-remedy', seat)` (ACTION_RIGHTS, rank 4–5).
 *  - The pattern must be a recurring pattern in the acting seat right now
 *    (two or more distinct decisions). A remedy cannot be attached to a pattern
 *    the record does not show.
 *  - One active remedy per pattern. A second one is refused; replacing a remedy
 *    is a supersession, which is In Progress and not faked here.
 *  - The owner must be a person the acting seat reaches, or the workspace leader.
 *    Ownership is never inferred from a line, a title or a manager.
 *  - The decision date may not be in the future. The review date must fall
 *    within the declared bounds after the decision date.
 *
 * Stored: the act only. The verdict is never written; it is read every time.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildMatrixRemedyReport } from './matrixRemedy.js';
import { isIsoDay, normalizeMatrixRemedy } from './matrixRemedySchema.js';
import { MATRIX_REMEDY_LIMITS, MATRIX_REMEDY_RIGHT } from './matrixRemedyRegistry.js';

const fail = (error, field = 'matrixRemedy') => ({ ok: false, error, field });

function resolveSeat(store, at, cfg) {
  const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
  const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
  return { seat: activeSeat(built) };
}

export function createMatrixRemedyActions(store, { now = () => new Date(), idFactory = (p) => `${p}-${Date.now()}` } = {}) {
  const clock = () => {
    const v = now();
    return v instanceof Date ? v : new Date(v);
  };

  return {
    matrixRemedyDeclare(input = {}) {
      const at = clock();
      const today = dayKey(at);
      const cfg = store.state.settings || {};
      const { seat } = resolveSeat(store, at, cfg);
      if (!seat || seat.readOnly) {
        return fail('The operating seat is unresolved and read-only. Choose a valid seat before recording a remedy.', 'scope');
      }
      const verdict = canAct(MATRIX_REMEDY_RIGHT, seat);
      if (!verdict.allow) return fail(verdict.reason, 'scope');

      const report = buildMatrixRemedyReport(store.state, { now: at, settings: cfg });
      const signatureKey = typeof input.signatureKey === 'string' ? input.signatureKey : '';
      const pattern = report.allPatterns.find((p) => p.signatureKey === signatureKey) || null;
      if (!pattern) {
        return fail(
          'No recurring structural pattern visible in this seat matches that signature. A pattern needs two or more distinct decisions on the record before a remedy can name it.',
          'signatureKey',
        );
      }
      if (pattern.remedyState === 'remedied' || pattern.duplicateRemedyN) {
        return fail(
          'This pattern already carries an active remedy. Recording a second one is refused; replacing a remedy is a supersession, which is not yet built.',
          'signatureKey',
        );
      }

      const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : '';
      if (!ownerId || !report.ownerOptions.some((o) => o.id === ownerId)) {
        return fail('Name the accountable owner from the people this seat reaches. Ownership is never inferred.', 'ownerId');
      }

      const remedy = String(input.remedy ?? '').trim();
      if (remedy.length < MATRIX_REMEDY_LIMITS.remedyMinChars) {
        return fail(`Describe the remedy in at least ${MATRIX_REMEDY_LIMITS.remedyMinChars} characters — what will change, and how the owner will know.`, 'remedy');
      }
      if (remedy.length > MATRIX_REMEDY_LIMITS.remedyChars) {
        return fail(`The remedy must be ${MATRIX_REMEDY_LIMITS.remedyChars} characters or fewer.`, 'remedy');
      }

      const decidedOn = typeof input.decidedOn === 'string' ? input.decidedOn.trim() : '';
      if (!isIsoDay(decidedOn)) return fail('Enter the remedy decision date as YYYY-MM-DD.', 'decidedOn');
      if (decidedOn > today) return fail('The remedy decision cannot be dated after today.', 'decidedOn');

      const reviewOn = typeof input.reviewOn === 'string' ? input.reviewOn.trim() : '';
      if (!isIsoDay(reviewOn)) return fail('Enter the review date as YYYY-MM-DD.', 'reviewOn');
      const gap = daysBetween(decidedOn, reviewOn);
      if (gap < MATRIX_REMEDY_LIMITS.reviewMinDays || gap > MATRIX_REMEDY_LIMITS.reviewMaxDays) {
        return fail(
          `The review date must fall ${MATRIX_REMEDY_LIMITS.reviewMinDays} to ${MATRIX_REMEDY_LIMITS.reviewMaxDays} days after the decision date, so the review window can separate an effect from ordinary variation.`,
          'reviewOn',
        );
      }

      const basis = String(input.basis ?? '').trim().slice(0, MATRIX_REMEDY_LIMITS.basisChars);
      const existing = Array.isArray(store.state.matrixRemedies) ? store.state.matrixRemedies : [];
      if (existing.length >= MATRIX_REMEDY_LIMITS.remedies) {
        return fail(`The register holds the declared maximum of ${MATRIX_REMEDY_LIMITS.remedies} remedy records.`, 'matrixRemedy');
      }

      const row = {
        id: idFactory('mtxrmd'),
        signatureKey,
        ownerId,
        remedy,
        basis,
        decidedOn,
        reviewOn,
        declaredAt: at.toISOString(),
        declaredBySeatId: seat.fullAccess ? null : seat.id,
        status: 'active',
      };
      /* Defensive: the stored row must pass the same normaliser a reload uses,
         or the record would silently disappear on the next load. */
      if (!normalizeMatrixRemedy(row)) {
        return fail('The remedy could not be stored in its canonical form, so nothing was recorded.', 'matrixRemedy');
      }

      store.update((draft) => {
        draft.matrixRemedies = Array.isArray(draft.matrixRemedies) ? draft.matrixRemedies : [];
        draft.matrixRemedies.push(row);
      });
      return { ok: true, remedy: row, pattern: { signatureKey, findingLabel: pattern.findingLabel } };
    },
  };
}
