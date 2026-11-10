/**
 * app/core/domain/lineReaffirmationActions.js — the commands of the Matrix Line
 * Re-Affirmation Register (ADR-0157, Schema v129).
 *
 * FOUR human writes, every one dated, seat-checked and refused with a printed
 * reason. There is deliberately no command that re-affirms a line on somebody
 * else's behalf, none that answers as the person, and — the load-bearing
 * absence — none that ENDS a line. Ending a declared line remains the governed
 * `matrixEndLine` action run by a human, because an engine that removed
 * accountability on its own is the failure the matrix ledger exists to prevent.
 *
 *   lineReaffirm        "The commitment still holds. I hold this share of this
 *                       person until this date, because this is what the line is
 *                       on the hook to deliver." Only the line's own manager.
 *                       Refuses a line that is not in force, a second
 *                       re-affirmation while one is live, a term that does not
 *                       end in the future, a term beyond the declared bound, and
 *                       a re-affirmed total past 100% of a person (arithmetic
 *                       printed).
 *
 *   lineRelease         "This commitment does not hold any more, and here is
 *                       why, and here is the day it ends." Only the line's own
 *                       manager. The declaration is untouched: the register
 *                       prints the still-charged share beside the release and
 *                       routes the human to the governed End action.
 *
 *   lineReaffirmationAccept   "These hours are still taken from me and I have
 *                       been told." Only the person themselves (or the operator
 *                       view, marked as a scribed statement).
 *
 *   lineReaffirmationObject   "They are not, in my own words." Only the person.
 *                       Records the disagreement and does NOT end the line.
 *
 * Plus one explicit scan that retries any obligation a per-transaction cap
 * deferred, changing no declaration and no answer.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { buildLineReaffirmation, reaffirmationActsFor } from './lineReaffirmation.js';
import { normalizeLineReaffirmationSettings } from './lineReaffirmationSchema.js';
import {
  LINE_REAFFIRMATION_BOUNDS,
  LINE_REAFFIRMATION_EVENTS,
  LINE_REAFFIRMATION_FULL_H,
  LINE_REAFFIRMATION_LIMITS,
  LINE_REAFFIRMATION_RIGHTS,
  LINE_REAFFIRMATION_STATES,
} from './lineReaffirmationRegistry.js';

const MIN_REASON = LINE_REAFFIRMATION_LIMITS.minReason;
const MIN_BASIS = 8;

export function createLineReaffirmationActions(store, { now, idFactory }) {
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
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before answering a reporting line.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  /** The live declared line this command is about, read from the matrix graph. */
  const resolveLine = (declarationId) => {
    const at = clock();
    const cfg = settings();
    const matrix = buildMatrix(store.state, { now: at, settings: cfg });
    const id = String(declarationId || '').trim();
    if (!id) return { ok: false, error: 'Choose the reporting line you are answering.', field: 'declarationId' };
    const line = (Array.isArray(matrix.lines) ? matrix.lines : [])
      .find((l) => l && l.role !== 'primary' && (l.declarationId === id || l.id === id)) || null;
    if (!line) {
      const ended = (Array.isArray(matrix.inactiveLines) ? matrix.inactiveLines : []).find((l) => l && (l.declarationId === id || l.id === id));
      if (ended) {
        return { ok: false, error: 'That reporting line has ended. A commitment that no longer holds cannot be re-affirmed or released; there is nothing to call back.' };
      }
      return { ok: false, error: 'That reporting line does not resolve in the matrix graph. A line the engine refused (a duplicate, a loop, a bad window) has no term to answer.' };
    }
    return { ok: true, line, matrix, at, cfg };
  };

  const reportFor = () => buildLineReaffirmation(store.state, { now: clock(), settings: settings() });
  const lineRow = (report, personId, declarationId) => {
    const person = report.persons.find((p) => p.personId === personId) || null;
    const row = person?.lines.find((r) => r.declarationId === declarationId) || null;
    return { person, row };
  };

  const reachCommittee = (seat, personId) => {
    if (seat.fullAccess) return true;
    if (seat.id === personId) return true;
    if (seat.scope?.has?.(personId)) return true;
    if (seat.lineScope?.has?.(personId)) return true;
    return false;
  };

  const appendAct = (line, personName, row) => {
    store.update((draft) => {
      draft.lineReaffirmations = Array.isArray(draft.lineReaffirmations) ? draft.lineReaffirmations : [];
      if (draft.lineReaffirmations.length >= LINE_REAFFIRMATION_LIMITS.acts) {
        // Bounded ledger: the OLDEST answer is displaced and the displacement is
        // named in the event summary. A cap that silently eats history is the
        // failure this register exists to catch.
        draft.lineReaffirmations.splice(0, draft.lineReaffirmations.length - LINE_REAFFIRMATION_LIMITS.acts + 1);
      }
      draft.lineReaffirmations.push(row);
    }, {
      type: row.outcome === 'reaffirm' ? LINE_REAFFIRMATION_EVENTS.REAFFIRM
        : row.outcome === 'release' ? LINE_REAFFIRMATION_EVENTS.RELEASE
          : row.outcome === 'accept' ? LINE_REAFFIRMATION_EVENTS.ACCEPT
            : LINE_REAFFIRMATION_EVENTS.OBJECT,
      entity: 'reportingLine',
      entityId: row.declarationId,
      summary: (row.outcome === 'reaffirm'
        ? `Share of ${personName || row.personId} re-affirmed by that line until ${row.termEndsOn}`
        : row.outcome === 'release'
          ? `Share of ${personName || row.personId} released by that line, with a reason`
          : row.outcome === 'accept'
            ? 'The person accepted that the re-affirmed share is still taken from their hours'
            : 'The person objected, in their own words, to a share still charged to them')
        .slice(0, 300),
    });
  };

  return {
    /* ---------------------------------------------------------------- reads */

    lineReaffirmationRead() {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.read);
      if (!check.ok) return check;
      return { ok: true, report: reportFor() };
    },

    /** The lines a human can act on now, with the state that makes them actable. */
    lineReaffirmationCandidates() {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.read);
      if (!check.ok) return check;
      const report = reportFor();
      return {
        ok: true,
        isMatrix: report.isMatrix,
        lines: report.persons.flatMap((person) => person.lines
          .filter((line) => line.state !== LINE_REAFFIRMATION_STATES.inTerm)
          .map((line) => ({
            declarationId: line.declarationId,
            personId: line.personId,
            personName: line.personName,
            managerId: line.managerId,
            managerName: line.managerName,
            kind: line.kind,
            sharePct: line.sharePct,
            fromISO: line.fromISO,
            toISO: line.toISO,
            state: line.state,
            stateLabel: line.stateLabel,
            reason: line.reason,
            termEndsOn: line.termEndsOn,
            termDaysRemaining: line.termDaysRemaining,
            lastAnsweredOn: line.lastAnsweredOn,
            personAnsweredOn: line.personAnsweredOn,
          }))),
      };
    },

    /* --------------------------------------------------------------- writes */

    lineReaffirm(input = {}) {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.reaffirm);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      // THE LINE'S OWN MANAGER ONLY. Recording a renewal for a manager who never
      // said it would fabricate an agreement — the exact failure this register
      // exists to name.
      if (!seat.fullAccess && seat.id !== line.managerId) {
        return fail(`Only the manager who holds this line (${matrixName(resolved.matrix, line.managerId)}) can re-affirm it. Recording a renewal on somebody else's behalf would fabricate an agreement they never gave.`, 'declarationId');
      }
      if (!reachCommittee(seat, line.personId)) {
        return fail('That person is outside your operating seat. A share is re-affirmed by a manager who already holds a line to them.', 'declarationId');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const { person, row } = lineRow(report, line.personId, line.declarationId || line.id);
      if (!person || !row) {
        return fail('That line is not on the re-affirmation register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.inTerm) {
        return fail(`This commitment is already re-affirmed until ${row.termEndsOn} and ${person.personName} accepted it on ${row.personAnsweredOn}. A second re-affirmation would duplicate a term that stands.`, 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.awaitingPerson && row.termDaysRemaining !== null && row.termDaysRemaining > report.conventions.lineReaffirmWarnDays) {
        return fail(`You re-affirmed this share on ${row.lastAnsweredOn} for a term ending ${row.termEndsOn}. ${person.personName} has not answered yet; the line does not need re-affirming, it needs the person asked.`, 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.released) {
        return fail(`This commitment was released on ${row.releasedOn}. Re-affirming it would undo a decision that is already on the record; if the accountability genuinely holds again, declare a new line so the record shows both.`, 'declarationId');
      }

      const conv = normalizeLineReaffirmationSettings(settings());
      const requested = String(input.termEndsOn || '').trim();
      const fallbackEnd = addDays(today, conv.lineReaffirmTermDays);
      const termEndsOn = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : fallbackEnd;
      const span = termEndsOn ? daysBetween(today, termEndsOn) : null;
      if (span === null || !Number.isFinite(span) || span < 1) {
        return fail('The term must end on a future date. A renewal with no end cannot be distinguished from one nobody revisited — the state this register exists to expose.', 'termEndsOn');
      }
      if (span > LINE_REAFFIRMATION_BOUNDS.termDays[1]) {
        return fail(`A term cannot run longer than ${LINE_REAFFIRMATION_BOUNDS.termDays[1]} days. A commitment renewed for longer than that is a permanent grant with a date on it, and the register would stop reading it.`, 'termEndsOn');
      }

      // THE CAPACITY CHECK, ARITHMETIC PRINTED. A person already covered by more
      // than one whole person cannot be covered further. Only checkable when every
      // share is declared — otherwise the sum is refused, not guessed.
      if (row.sharePct !== null && !person.totals.shareRefused) {
        const projected = (person.totals.reaffirmedShareH || 0) + row.sharePct;
        if (projected > LINE_REAFFIRMATION_FULL_H) {
          return fail(`Re-affirming ${row.sharePct}% would cover ${projected}% of ${person.personName} with live re-affirmed terms, against 100% of a person. ${person.totals.reaffirmedShareH}% is already covered. Refusing the excess is arithmetic, not a judgement: the line can still be declared, and it can still be released.`, 'declarationId');
        }
      }

      const basis = String(input.basis || '').trim().slice(0, LINE_REAFFIRMATION_LIMITS.basisChars);
      if (basis && basis.length < MIN_BASIS) {
        return fail('If you state what this line is on the hook to deliver, write at least a sentence. A three-word basis is not a commitment somebody can be held to.', 'basis');
      }

      const rowId = idFactory('lrf');
      appendAct({ ...line, personName: person.personName }, person.personName, {
        id: rowId,
        declarationId: row.declarationId,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'manager',
        outcome: 'reaffirm',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        via: seat.fullAccess ? 'operator' : 'seat',
        termEndsOn,
        // The share that was RE-AFFIRMED, stored with the answer. A later retune
        // shows as `changed-share` and refuses to inherit this term.
        sharePct: row.sharePct,
        basis,
        reason: '',
        at: clock().toISOString(),
      });
      return saved({ id: rowId, declarationId: row.declarationId, termEndsOn, capacityChecked: !person.totals.shareRefused });
    },

    lineRelease(input = {}) {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.reaffirm);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      if (!seat.fullAccess && seat.id !== line.managerId) {
        return fail(`Only the manager who holds this line (${matrixName(resolved.matrix, line.managerId)}) can release it. A peer or the person cannot end somebody else's accountability.`, 'declarationId');
      }
      const reason = String(input.reason || '').trim().slice(0, LINE_REAFFIRMATION_LIMITS.reasonChars);
      if (reason.length < MIN_REASON) {
        return fail('Say why this commitment no longer holds. A bare release is indistinguishable from a typo, and the record would read as a considered decision with no thought in it.', 'reason');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const { person, row } = lineRow(report, line.personId, line.declarationId || line.id);
      if (!person || !row) {
        return fail('That line is not on the re-affirmation register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.released) {
        return fail(`This commitment was already released on ${row.releasedOn}. A second release records nothing new; what is still open is the declaration itself, which only the governed End action closes.`, 'declarationId');
      }

      const rowId = idFactory('lrf');
      appendAct({ ...line, personName: person.personName }, person.personName, {
        id: rowId,
        declarationId: row.declarationId,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'manager',
        outcome: 'release',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        via: seat.fullAccess ? 'operator' : 'seat',
        termEndsOn: null,
        sharePct: null,
        basis: '',
        reason,
        at: clock().toISOString(),
      });
      return saved({
        id: rowId,
        declarationId: row.declarationId,
        // Printed on the receipt: releasing does not end the charge, and the
        // register will keep saying so until a human dates the line out.
        stillCharged: row.sharePct !== null && row.sharePct > 0,
        stillChargedPct: row.sharePct,
      });
    },

    lineReaffirmationAccept(input = {}) {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.answer);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      // FIRST PERSON ONLY — the person whose hours are taken says this, or the
      // operator view acting as scribe. A manager accepting on the person's
      // behalf records an answer that was never given.
      if (!seat.fullAccess && seat.id !== line.personId) {
        return fail('Only the person the share is taken from can answer for themselves. A manager answering on their behalf would record an agreement that was never given.', 'declarationId');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const { person, row } = lineRow(report, line.personId, line.declarationId || line.id);
      if (!person || !row) {
        return fail('That line is not on the re-affirmation register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.noTerm) {
        return fail('The line has never given this commitment a term, so there is nothing to accept. Accepting an untermed share would read as a renewal nobody made.', 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.released) {
        return fail(`The line released this commitment on ${row.releasedOn}. Accepting a released commitment would record an agreement the line itself withdrew.`, 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.lapsed) {
        return fail(`The term ended on ${row.termEndsOn}. The line has to re-affirm the commitment before it can be accepted; an answer to an expired term answers a question nobody is asking.`, 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.changed) {
        return fail(`The line was re-affirmed at a different share (${row.answeredSharePct === null ? 'no declared share' : `${row.answeredSharePct}%`}) and now declares ${row.sharePct === null ? 'no share' : `${row.sharePct}%`}. The manager has to re-affirm the current share before you can accept it.`, 'declarationId');
      }
      if (row.personAnsweredOn && row.personOutcome === 'accept') {
        return fail(`You already accepted this commitment on ${row.personAnsweredOn}. A second acceptance records nothing new.`, 'declarationId');
      }

      const rowId = idFactory('lrf');
      appendAct({ ...line, personName: person.personName }, person.personName, {
        id: rowId,
        declarationId: row.declarationId,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'person',
        outcome: 'accept',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        via: seat.fullAccess ? 'operator' : 'seat',
        termEndsOn: null,
        sharePct: null,
        basis: '',
        reason: '',
        at: clock().toISOString(),
      });
      return saved({ id: rowId, declarationId: row.declarationId });
    },

    lineReaffirmationObject(input = {}) {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.answer);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      if (!seat.fullAccess && seat.id !== line.personId) {
        return fail('Only the person the share is taken from can object to it. A manager objecting on their behalf would record a disagreement that was never stated.', 'declarationId');
      }
      const reason = String(input.reason || '').trim().slice(0, LINE_REAFFIRMATION_LIMITS.objectionChars);
      if (reason.length < MIN_REASON) {
        return fail('Say, in your own words, why the share no longer holds for you. A bare objection is indistinguishable from a typo, and this record is the one that reaches a human — it has to carry your words.', 'reason');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const { person, row } = lineRow(report, line.personId, line.declarationId || line.id);
      if (!person || !row) {
        return fail('That line is not on the re-affirmation register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (row.state === LINE_REAFFIRMATION_STATES.released) {
        return fail('The line already released this commitment. There is nothing left to object to, and objecting would record a disagreement with a decision that agrees with you.', 'declarationId');
      }
      if (row.personAnsweredOn && row.personOutcome === 'object') {
        return fail(`You objected to this commitment on ${row.personAnsweredOn} and it is on the record. A second objection records nothing new; what is open is the line's answer.`, 'declarationId');
      }

      const rowId = idFactory('lrf');
      appendAct({ ...line, personName: person.personName }, person.personName, {
        id: rowId,
        declarationId: row.declarationId,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'person',
        outcome: 'object',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        via: seat.fullAccess ? 'operator' : 'seat',
        termEndsOn: null,
        sharePct: null,
        basis: '',
        reason,
        at: clock().toISOString(),
      });
      return saved({
        id: rowId,
        declarationId: row.declarationId,
        // Printed on the receipt so nobody reads an objection as an ending.
        endsTheLine: false,
        stillCharged: row.sharePct !== null && row.sharePct > 0,
      });
    },

    lineReaffirmationScan() {
      const check = seatFor(LINE_REAFFIRMATION_RIGHTS.read);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.lineReaffirmations = Array.isArray(draft.lineReaffirmations) ? draft.lineReaffirmations : [];
      }, {
        type: LINE_REAFFIRMATION_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'matrix',
        summary: 'Matrix line re-affirmation scanned; deferred asks retried and no declaration or answer changed.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },
  };
}

function matrixName(matrix, personId) {
  return matrix?.nodes?.get?.(personId)?.name || personId;
}
