/**
 * app/core/domain/lineExitActions.js — the commands of the Matrix Line-Exit
 * Obligation Register (ADR-0152, Schema v127).
 *
 * TWO human writes, both dated and both refused with a printed reason. There is
 * deliberately no third that re-points an ask, none that retires an obligation
 * somebody has already answered, and none that closes a line.
 *
 *   lineExitRemedy  "This obligation left by an ended line is void, and here is
 *                    why" (retire) or "it is still owed, and this manager now
 *                    owes it" (carry). Enforced: the seat must reach the person;
 *                    the obligation must still be OPEN on an ended line; a retire
 *                    needs a stated reason and is final; a carry must name a
 *                    manager who holds a LIVE line for that person today (or
 *                    their home line), because carrying work to somebody who
 *                    never took it is the shadow accountability the register
 *                    refuses.
 *
 *   lineExitScan    Re-run RULE-LEX-01 so any ask a cap deferred is retried.
 *                    Changes no declaration and records no remedy.
 *
 * WHAT NO COMMAND HERE WILL DO
 * ----------------------------
 * It will not edit the original ask, move it to another line, delete it, end a
 * reporting line, invent an end day for a line that has none, or settle an
 * obligation on the home line (whose history is ADR-0149's). It will not retire
 * an obligation the person or the line has already ANSWERED: the answer is the
 * record, and a remedy on top of it would rewrite that record.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildLineExitReport } from './lineExit.js';
import { LINE_EXIT_LIMITS, LINE_EXIT_MIN_REASON, LINE_EXIT_REFUSALS, LINE_EXIT_RIGHTS } from './lineExitRegistry.js';
import { LINE_EXIT_EVENTS } from './lineExitRegistry.js';

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function createLineExitActions(store, { now, idFactory }) {
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
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before settling a line obligation.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  /** Can this seat see this person at all — tree OR declared line, as ADR-0141. */
  const seatReaches = (seat, personId) => {
    if (seat.fullAccess) return true;
    if (seat.id === personId) return true;
    if (seat.scope?.has?.(personId)) return true;
    if (seat.lineScope?.has?.(personId)) return true;
    return false;
  };

  const report = () => buildLineExitReport(store.state, { now: clock(), settings: settings(), limit: 0 });

  /**
   * Is this obligation already answered by the human it was addressed to?
   *
   * The read model only collects OPEN obligations, so a key that resolves to a
   * stored record but is absent from the report has been answered. Naming that
   * plainly is the difference between "we cannot find it" and "somebody already
   * replied, and a remedy would overwrite their words".
   */
  const answeredAlready = (obligationKey) => {
    const [source, rest] = String(obligationKey || '').split(/:(.*)/s);
    if (source === 'onboarding-brief') {
      const row = (Array.isArray(store.state.onboardingLineBriefs) ? store.state.onboardingLineBriefs : [])
        .find((b) => b && b.id === rest);
      if (!row) return false;
      return Boolean(row.acknowledgedOn) || row.outcome === 'declined';
    }
    if (source === 'review-input') {
      const idx = String(rest || '').indexOf(':');
      if (idx < 0) return false;
      const reviewId = rest.slice(0, idx);
      const lineKey = rest.slice(idx + 1);
      const review = (Array.isArray(store.state.reviews) ? store.state.reviews : [])
        .find((r) => r && r.id === reviewId);
      if (!review) return false;
      const answers = Array.isArray(review.stewardship?.answers) ? review.stewardship.answers : [];
      return answers.some((a) => a && a.lineKey === lineKey);
    }
    return false;
  };

  /** The managers who could honestly take an obligation over TODAY. */
  const carryCandidates = (personId) => {
    const at = clock();
    const cfg = settings();
    const matrix = buildMatrix(store.state, { now: at, settings: cfg });
    const ids = new Set();
    const lines = matrix.linesByPerson.get(personId) || [];
    for (const line of lines) {
      if (line && line.managerId) ids.add(line.managerId);
    }
    const node = matrix.roster.get(personId) || null;
    ids.add(node?.rawManagerId || node?.managerId || LEADER_ID);
    const names = new Map();
    for (const [id, n] of matrix.nodes.entries()) names.set(id, n.name || id);
    return { ids, names };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    /** The seat-scoped register read. Refuses rather than rendering a partial ledger. */
    lineExitRead() {
      const check = seatFor(LINE_EXIT_RIGHTS.remedy);
      if (!check.ok) return check;
      const built = report();
      return { ok: true, report: built, board: built.board };
    },

    /* --------------------------------------------------------------- writes */

    lineExitRemedy(input = {}) {
      const check = seatFor(LINE_EXIT_RIGHTS.remedy);
      if (!check.ok) return check;
      const { seat } = check;
      const obligationKey = String(input.obligationKey || '').trim();
      if (!obligationKey) return fail('Choose the obligation this remedy settles.', 'obligationKey');
      const outcome = input.outcome === 'carry' ? 'carry' : input.outcome === 'retire' ? 'retire' : null;
      if (!outcome) return fail('Say whether the obligation is void (retire) or still owed by a named manager (carry).', 'outcome');

      const built = report();
      const row = built.obligations.find((ob) => ob.key === obligationKey) || null;
      if (!row) {
        if (answeredAlready(obligationKey)) return fail(LINE_EXIT_REFUSALS.alreadySettled, 'obligationKey');
        return fail(LINE_EXIT_REFUSALS.unknownObligation, 'obligationKey');
      }
      if (!seatReaches(seat, row.personId)) return fail(LINE_EXIT_REFUSALS.notYourSpan, 'obligationKey');
      if (row.remedy && row.remedy.outcome === 'retire') {
        return fail(LINE_EXIT_REFUSALS.alreadyRetired, 'obligationKey');
      }
      if (!built.isMatrix) return fail(LINE_EXIT_REFUSALS.singleChain, 'obligationKey');
      // A line that has not ended is not this register's to settle. The read model
      // already excludes them; this is the belt-and-braces refusal in words.
      const line = built.lines.find((l) => l.lineKey === row.lineKey) || null;
      if (!line || (line.verifiable === false && line.verdict !== 'vanished')) {
        return fail(LINE_EXIT_REFUSALS.noEndedLine, 'obligationKey');
      }

      const reason = String(input.reason || '').trim().slice(0, LINE_EXIT_LIMITS.reasonChars);
      if (reason.length < LINE_EXIT_MIN_REASON) return fail(LINE_EXIT_REFUSALS.reasonTooShort, 'reason');

      let carryToManagerId = null;
      if (outcome === 'carry') {
        carryToManagerId = String(input.carryToManagerId || '').trim();
        if (!carryToManagerId) return fail(LINE_EXIT_REFUSALS.carryUnnamed, 'carryToManagerId');
        const candidates = carryCandidates(row.personId);
        if (!candidates.ids.has(carryToManagerId)) {
          return fail(LINE_EXIT_REFUSALS.carryNotHolder, 'carryToManagerId');
        }
      }

      const reviewOn = dayOf(input.reviewOn);
      const at = clock();
      const today = dayKey(at);
      const rowId = idFactory('lex');
      const carryToName = outcome === 'carry'
        ? (carryCandidates(row.personId).names.get(carryToManagerId) || carryToManagerId)
        : null;

      store.update((draft) => {
        draft.lineExitRemedies = Array.isArray(draft.lineExitRemedies) ? draft.lineExitRemedies : [];
        draft.lineExitRemedies.push({
          id: rowId,
          obligationKey,
          source: row.source,
          personId: row.personId,
          lineKey: row.lineKey,
          lineRole: 'secondary',
          lineKind: line.kind || '',
          managerId: row.managerId,
          outcome,
          reason,
          carryToManagerId,
          decidedOn: today,
          decidedBySeatId: seat.fullAccess ? null : seat.id,
          decidedSource: seat.fullAccess ? 'operator' : 'leader',
          reviewOn,
          at: at.toISOString(),
        });
        if (draft.lineExitRemedies.length > LINE_EXIT_LIMITS.remedies * 4) {
          draft.lineExitRemedies.splice(0, draft.lineExitRemedies.length - LINE_EXIT_LIMITS.remedies * 4);
        }
      }, {
        type: LINE_EXIT_EVENTS.REMEDY,
        entity: 'person',
        entityId: row.personId,
        summary: (outcome === 'retire'
          ? `The ${row.sourceLabel || row.source} obligation left by ${row.managerName}’s ended line for ${row.personName} was retired, with a reason.`
          : `The ${row.sourceLabel || row.source} obligation left by ${row.managerName}’s ended line for ${row.personName} was carried to ${carryToName}.`).slice(0, 300),
      });

      return saved({
        id: rowId,
        obligationKey,
        outcome,
        decidedOn: today,
        carryToManagerId,
      });
    },

    lineExitScan() {
      const check = seatFor(LINE_EXIT_RIGHTS.remedy);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.lineExitRemedies = Array.isArray(draft.lineExitRemedies) ? draft.lineExitRemedies : [];
      }, {
        type: LINE_EXIT_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'matrix',
        summary: 'Line-exit obligations scanned; deferred asks retried and no declaration or remedy changed.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },
  };
}
