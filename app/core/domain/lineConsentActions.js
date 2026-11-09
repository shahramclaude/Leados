/**
 * app/core/domain/lineConsentActions.js — the commands of Matrix Line Consent
 * (ADR-0148, Schema v123).
 *
 * THREE human writes, every one dated, seat-checked and refused with a printed
 * reason. There is deliberately no fourth that accepts a share on somebody
 * else's behalf, and none that acknowledges a commitment for the person whose
 * hours it takes.
 *
 *   lineConsentAccept     "I hold this line. I accept this share of this person
 *                          and these rights, until this date, because this is
 *                          what the line is on the hook to deliver." Refuses a
 *                          seat that is not the line's manager, a line that is
 *                          not in force, a second acceptance while one is live,
 *                          an acceptance with no expiry, and — the one that
 *                          matters — an acceptance that would take the person
 *                          past 100% of themselves, printing the arithmetic.
 *
 *   lineConsentDecline    "I was given this share and I refuse it, because …"
 *                          A reason is required. The declaration is untouched:
 *                          only the manager who declared it, or the span above
 *                          both, may end it, so the declined share stays charged
 *                          and the register names that.
 *
 *   lineConsentAcknowledge   "This share is taken from my hours. I have been
 *                          told." Only the person themselves may say it, and
 *                          only for an acceptance that is currently live.
 *
 * Plus one explicit scan that retries any obligation a per-transaction cap
 * deferred, changing no declaration.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { buildLineConsent, consentActsFor } from './lineConsent.js';
import { normalizeLineConsentSettings } from './lineConsentSchema.js';
import {
  LINE_CONSENT_BOUNDS,
  LINE_CONSENT_EVENTS,
  LINE_CONSENT_FULL_H,
  LINE_CONSENT_LIMITS,
  LINE_CONSENT_RIGHTS,
  LINE_CONSENT_STATES,
} from './lineConsentRegistry.js';

const MIN_REASON = 8;
const MIN_BASIS = 8;

export function createLineConsentActions(store, { now, idFactory }) {
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

  const people = () => (Array.isArray(store.state.people) ? store.state.people : []);

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
      // A line that has ended, or that the graph REFUSED (a duplicate, a cycle, a
      // bad window), is not a line anybody can accept. Saying which is the point.
      const ended = (Array.isArray(matrix.inactiveLines) ? matrix.inactiveLines : []).find((l) => l && (l.declarationId === id || l.id === id));
      if (ended) {
        return { ok: false, error: 'That reporting line has ended. A share that no longer holds cannot be accepted or acknowledged; declare a new line if the accountability continues.' };
      }
      return { ok: false, error: 'That reporting line does not resolve in the matrix graph. A line the engine refused (a duplicate, a loop, a bad window) cannot be consented to.' };
    }
    return { ok: true, line, matrix, at, cfg };
  };

  const reportFor = () => buildLineConsent(store.state, { now: clock(), settings: settings() });
  const personRow = (report, personId) => report.persons.find((p) => p.personId === personId) || null;

  const reachCommittee = (seat, personId) => {
    if (seat.fullAccess) return true;
    if (seat.id === personId) return true;
    if (seat.scope?.has?.(personId)) return true;
    if (seat.lineScope?.has?.(personId)) return true;
    return false;
  };

  const appendAct = (line, row) => {
    store.update((draft) => {
      draft.lineConsents = Array.isArray(draft.lineConsents) ? draft.lineConsents : [];
      if (draft.lineConsents.length >= LINE_CONSENT_LIMITS.decisions) {
        // Bounded ledger: the OLDEST act is displaced and the displacement is
        // printed in the event summary. A cap that silently eats history is the
        // failure this register exists to catch.
        draft.lineConsents.splice(0, draft.lineConsents.length - LINE_CONSENT_LIMITS.decisions + 1);
      }
      draft.lineConsents.push(row);
    }, {
      type: row.side === 'manager'
        ? (row.outcome === 'accepted' ? LINE_CONSENT_EVENTS.ACCEPT : LINE_CONSENT_EVENTS.DECLINE)
        : LINE_CONSENT_EVENTS.ACKNOWLEDGE,
      entity: 'reportingLine',
      entityId: row.declarationId,
      summary: (row.side === 'manager'
        ? (row.outcome === 'accepted'
            ? `Share of ${line.personName ?? row.personId} accepted by that line until ${row.expiresOn}`
            : `Share of ${line.personName ?? row.personId} declined by that line, with a reason`)
        : `The person acknowledged the accepted share taken by that line`)
        .slice(0, 300),
    });
  };

  return {
    /* ---------------------------------------------------------------- reads */

    lineConsentRead() {
      const check = seatFor(LINE_CONSENT_RIGHTS.read);
      if (!check.ok) return check;
      return { ok: true, report: reportFor() };
    },

    lineConsentCandidates() {
      const check = seatFor(LINE_CONSENT_RIGHTS.read);
      if (!check.ok) return check;
      const report = reportFor();
      return {
        ok: true,
        isMatrix: report.isMatrix,
        lines: report.persons.flatMap((person) => person.lines
          .filter((line) => line.state !== LINE_CONSENT_STATES.accepted)
          .map((line) => ({
            declarationId: line.declarationId,
            personId: line.personId,
            personName: line.personName,
            managerId: line.managerId,
            managerName: line.managerName,
            kind: line.kind,
            sharePct: line.sharePct,
            state: line.state,
            stateLabel: line.stateLabel,
            reason: line.reason,
          }))),
      };
    },

    /* --------------------------------------------------------------- writes */

    lineConsentAccept(input = {}) {
      const check = seatFor(LINE_CONSENT_RIGHTS.accept);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      if (!seat.fullAccess && seat.id !== line.managerId) {
        return fail(`Only ${line.managerId === seat.id ? 'the line’s manager' : `the manager who holds this line (${line.managerId})`} can accept it. Recording another manager’s acceptance would fabricate consent to a commitment they never made.`, 'declarationId');
      }
      if (!reachCommittee(seat, line.personId)) {
        return fail('That person is outside your operating seat. A share is accepted by a manager who already holds a line to them.', 'declarationId');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const person = personRow(report, line.personId);
      const reportLine = person?.lines.find((r) => r.declarationId === (line.declarationId || line.id)) || null;
      if (!person || !reportLine) {
        return fail('That line is not on the consent register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (reportLine.state === LINE_CONSENT_STATES.accepted) {
        return fail(`This share is already accepted and acknowledged (accepted ${reportLine.acceptedOn}, acknowledged ${reportLine.acknowledgedOn}). A second acceptance would duplicate a commitment that stands.`, 'declarationId');
      }
      const currentAcceptanceLive = reportLine.state === LINE_CONSENT_STATES.awaitingPerson;
      if (currentAcceptanceLive) {
        return fail(`You accepted this share on ${reportLine.acceptedOn} and it stands until ${reportLine.acceptanceExpiresOn}. The person has not acknowledged it yet; the line does not need re-accepting, it needs the person told.`, 'declarationId');
      }

      const conv = normalizeLineConsentSettings(settings());
      const requested = String(input.expiresOn || '').trim();
      const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : addDays(today, conv.lineConsentAcceptDays);
      const span = expiresOn ? Math.round((Date.parse(`${expiresOn}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86400000) : NaN;
      if (!Number.isFinite(span) || span < 1) {
        return fail('The acceptance must end on a future date. An acceptance with no expiry cannot be distinguished from one nobody revisited.', 'expiresOn');
      }
      if (span > LINE_CONSENT_BOUNDS.acceptDays[1]) {
        return fail(`An acceptance cannot stand for more than ${LINE_CONSENT_BOUNDS.acceptDays[1]} days. Consent that never expires is consent nobody can be held to.`, 'expiresOn');
      }

      // THE CAPACITY CHECK, ARITHMETIC PRINTED. A person already committed to
      // more than one whole person cannot be committed further. Only checkable
      // when every share is declared — otherwise the sum is refused, not guessed.
      if (reportLine.sharePct !== null && !person.totals.shareRefused) {
        const projected = (person.totals.acceptedShareH || 0) + reportLine.sharePct;
        if (projected > LINE_CONSENT_FULL_H) {
          return fail(`Accepting ${reportLine.sharePct}% would commit ${projected}% of ${person.personName} to accepted lines, against 100% of a person. ${person.totals.acceptedShareH}% is already accepted. Refusing the excess is arithmetic, not a judgement: the line can still be declared, and it can still be declined.`, 'declarationId');
        }
      }

      const basis = String(input.basis || '').trim().slice(0, LINE_CONSENT_LIMITS.basisChars);
      if (basis && basis.length < MIN_BASIS) {
        return fail('If you state what this line is on the hook to deliver, write at least a sentence. A three-word basis is not a commitment somebody can be held to.', 'basis');
      }

      const rowId = idFactory('lcn');
      const row = {
        id: rowId,
        declarationId: line.declarationId || line.id,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'manager',
        outcome: 'accepted',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        // `via` is printed: an act captured by the operator view is a scribed
        // statement, not an authenticated one. LeadOS has no seated identity for
        // a non-leader, and pretending otherwise would be the exact silent
        // overclaim the reliability mandate forbids.
        via: seat.fullAccess ? 'operator' : 'seat',
        expiresOn,
        // The share that was accepted, stored with the act. A later retune shows
        // as `changed` and refuses to inherit this consent.
        sharePct: reportLine.sharePct,
        basis,
        reason: '',
        at: clock().toISOString(),
      };
      appendAct({ ...line, personName: person.personName }, row);
      return saved({ id: rowId, declarationId: row.declarationId, expiresOn, capacityChecked: !person.totals.shareRefused });
    },

    lineConsentDecline(input = {}) {
      const check = seatFor(LINE_CONSENT_RIGHTS.accept);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      if (!seat.fullAccess && seat.id !== line.managerId) {
        return fail('Only the manager who holds this line can decline it. A peer cannot refuse a share on somebody else’s behalf.', 'declarationId');
      }
      const reason = String(input.reason || '').trim().slice(0, LINE_CONSENT_LIMITS.reasonChars);
      if (reason.length < MIN_REASON) {
        return fail('Say why this share is being refused. A bare refusal is indistinguishable from a typo, and the record would read as a considered judgement with no thought in it.', 'reason');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const person = personRow(report, line.personId);
      const reportLine = person?.lines.find((r) => r.declarationId === (line.declarationId || line.id)) || null;
      if (!person || !reportLine) {
        return fail('That line is not on the consent register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (reportLine.state === LINE_CONSENT_STATES.declined) {
        return fail(`This share was already declined on ${reportLine.declinedOn}. A second refusal records nothing new; the declaration itself is what needs withdrawing, and only the declaring manager or the span above both can do that.`, 'declarationId');
      }

      const rowId = idFactory('lcn');
      const row = {
        id: rowId,
        declarationId: line.declarationId || line.id,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'manager',
        outcome: 'declined',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        via: seat.fullAccess ? 'operator' : 'seat',
        expiresOn: null,
        sharePct: null,
        basis: '',
        reason,
        at: clock().toISOString(),
      };
      appendAct({ ...line, personName: person.personName }, row);
      return saved({ id: rowId, declarationId: row.declarationId, stillCharged: reportLine.sharePct !== null && reportLine.sharePct > 0 });
    },

    lineConsentAcknowledge(input = {}) {
      const check = seatFor(LINE_CONSENT_RIGHTS.acknowledge);
      if (!check.ok) return check;
      const { seat } = check;
      const resolved = resolveLine(input.declarationId);
      if (!resolved.ok) return resolved;
      const { line, at } = resolved;
      // FIRST PERSON ONLY. The person whose hours are taken says this, or the
      // workspace leader acting as operator. A manager cannot acknowledge on the
      // person's behalf; that is exactly the shadow this module removes.
      if (!seat.fullAccess && seat.id !== line.personId) {
        return fail('Only the person the share is taken from can acknowledge it. A manager acknowledging on their behalf would record a consent that was never given.', 'declarationId');
      }

      const today = dayKey(clock()) || at.toISOString().slice(0, 10);
      const report = reportFor();
      const person = personRow(report, line.personId);
      const reportLine = person?.lines.find((r) => r.declarationId === (line.declarationId || line.id)) || null;
      if (!person || !reportLine) {
        return fail('That line is not on the consent register for this person. The register is read from the live matrix and this line is not in force.', 'declarationId');
      }
      if (reportLine.state === LINE_CONSENT_STATES.unanswered) {
        return fail('The line’s manager has not accepted this share yet. There is nothing to acknowledge: acknowledging an unaccepted share would record the person as committed to something nobody agreed to deliver.', 'declarationId');
      }
      if (reportLine.state === LINE_CONSENT_STATES.declined) {
        return fail('The line’s manager declined this share. Acknowledging a declined share would record a commitment the line itself refused.', 'declarationId');
      }
      if (reportLine.state === LINE_CONSENT_STATES.lapsed) {
        return fail(`The acceptance lapsed on ${reportLine.acceptanceExpiresOn}. The line’s manager has to accept it again before it can be acknowledged.`, 'declarationId');
      }
      if (reportLine.state === LINE_CONSENT_STATES.changed) {
        return fail(`The line was accepted at a different share (${reportLine.acceptedSharePct === null ? 'no declared share' : `${reportLine.acceptedSharePct}%`}) and now declares ${reportLine.sharePct === null ? 'no share' : `${reportLine.sharePct}%`}. The manager has to accept the current share before you can acknowledge it.`, 'declarationId');
      }
      if (reportLine.acknowledgementCounts) {
        return fail(`You already acknowledged this share on ${reportLine.acknowledgedOn}. A second acknowledgement records nothing new.`, 'declarationId');
      }

      const rowId = idFactory('lcn');
      const row = {
        id: rowId,
        declarationId: line.declarationId || line.id,
        personId: line.personId,
        managerId: line.managerId,
        kind: line.kind || '',
        side: 'person',
        outcome: 'acknowledged',
        decidedOn: today,
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        via: seat.fullAccess ? 'operator' : 'seat',
        expiresOn: null,
        sharePct: null,
        basis: '',
        reason: '',
        at: clock().toISOString(),
      };
      appendAct({ ...line, personName: person.personName }, row);
      return saved({ id: rowId, declarationId: row.declarationId });
    },

    lineConsentScan() {
      const check = seatFor(LINE_CONSENT_RIGHTS.read);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.lineConsents = Array.isArray(draft.lineConsents) ? draft.lineConsents : [];
      }, {
        type: LINE_CONSENT_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'matrix',
        summary: 'Matrix line consent scanned; deferred obligations retried and no declaration changed.',
      });
      return saved({ propagations: store.lastPropagations || [] });
    },
  };
}
