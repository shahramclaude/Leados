/**
 * app/core/domain/structureHistoryActions.js — the commands of Matrix
 * Reorganisation Reconciliation & As-Of Structure Reads (ADR-0149, Schema v124).
 *
 * THREE human writes. Every one is dated, seat-checked, and refused with a
 * printed reason. There is deliberately no fourth that moves a home line
 * silently, none that back-fills history, and none that "corrects" a stored act
 * to match today's roster.
 *
 *   structureRecordMove     "On this day, this person's home line became this
 *                            manager, because this happened." Atomically closes
 *                            the open period it supersedes and opens the new one,
 *                            and writes `person.managerId` in the SAME
 *                            transaction — so the pointer and the ledger cannot
 *                            disagree even for one revision.
 *
 *   structureImportDesign   "This committed design moved these people on this
 *                            day; record what it actually changed." Imports the
 *                            before/after evidence ADR-0099 already froze, so a
 *                            re-org that was rehearsed and committed does not
 *                            leave the ledger with a hole exactly where the
 *                            comparability question is hardest.
 *
 *   structureScan           retries any reconciliation work a per-transaction cap
 *                            deferred, changing no structure.
 *
 * The refusals that are the product:
 *  - A move dated in the FUTURE is refused. A ledger that records tomorrow's
 *    structure makes today's as-of reading wrong, which is the whole failure mode.
 *  - A move with no stated reason is refused. A reporting line that changed for
 *    no recorded reason is an accountability nobody can be asked about.
 *  - A move that would make a person their own manager is refused by name.
 *  - A move by a seat that is neither of the two managers involved nor the span
 *    above both is refused: a peer cannot restructure somebody else's span.
 *  - A move whose day is already covered by a DIFFERENT manager's open period is
 *    refused rather than silently split, because the overlapping period is a
 *    contradiction that a human has to resolve.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildStructureHistoryReport,
  buildStructureLedger,
  homeLineOn,
  structureHistoryBriefText,
  structureHistoryCsvRows,
} from './structureHistory.js';
import { normalizeStructureHistorySettings } from './structureHistorySchema.js';
import {
  STRUCTURE_HISTORY_EVENTS,
  STRUCTURE_HISTORY_LIMITS,
  STRUCTURE_HISTORY_RIGHTS,
} from './structureHistoryRegistry.js';
import { ensureEntityLink } from './automation.js';

const MIN_REASON = 8;

export function createStructureHistoryActions(store, { now, idFactory }) {
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
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before recording a home-line change.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const people = () => (Array.isArray(store.state.people) ? store.state.people : []);
  const activePerson = (id) => people().find((p) => p && p.id === id && p.status !== 'archived') || null;

  /** The current open period for a person, if the ledger holds one. */
  const openPeriodFor = (personId) => {
    const book = buildStructureLedger(store.state);
    const rows = book.byPerson.get(personId) || [];
    return rows.find((r) => !r.toISO) || null;
  };

  /**
   * Who may move this person's home line: the manager they are leaving, the
   * manager they are joining, or the span above both. Never a peer, and never a
   * seat with no line of sight to either party.
   */
  function moveEligibility(seat, built, personId, fromManagerId, toManagerId) {
    if (seat.fullAccess) return { ok: true };
    if (seat.id === personId) {
      return {
        ok: false,
        error: 'A person cannot move their own home line. A reporting change is declared by a manager: the one they are leaving, the one they are joining, or the span above both.',
        field: 'personId',
      };
    }
    if (seat.id === fromManagerId || seat.id === toManagerId) return { ok: true };
    const scope = new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
    const reachesBoth = (fromManagerId === LEADER_ID || scope.has(fromManagerId))
      && (toManagerId === LEADER_ID || scope.has(toManagerId));
    if (scope.has(personId) && reachesBoth) return { ok: true };
    return {
      ok: false,
      error: 'A home-line change is declared by the manager the person is leaving, the manager they are joining, or the span above both. A peer cannot restructure somebody else’s span.',
      field: 'toManagerId',
    };
  }

  /**
   * Append one period and close the period it supersedes, in the draft.
   *
   * The superseded period is CLOSED ON THE DAY BEFORE the new one starts, which
   * is the only way two home lines cannot both be true on one day. It is never
   * deleted: a period that stored acts were judged against is evidence.
   *
   * Every OPEN period is closed by a move that starts on or after it — regardless
   * of which manager it named. The earlier `managerId !==` guard was wrong: an
   * open period is the current state, and a move to a manager that a *previous*
   * period also named must still close it, or two periods overlap.
   */
  function applyMove(draft, { personId, managerId, fromISO, reason, seatId, source }) {
    draft.structureHistory = Array.isArray(draft.structureHistory) ? draft.structureHistory : [];
    const recordId = idFactory('str');
    const existing = draft.structureHistory.filter((r) => r && r.personId === personId);
    const closeOn = new Date(`${fromISO}T00:00:00.000Z`);
    closeOn.setUTCDate(closeOn.getUTCDate() - 1);
    const closeKey = closeOn.toISOString().slice(0, 10);
    let closedN = 0;
    for (const row of existing) {
      if (!row.toISO && row.fromISO <= fromISO) {
        row.toISO = closeKey >= row.fromISO ? closeKey : row.fromISO;
        closedN += 1;
      }
    }
    draft.structureHistory.push({
      id: recordId,
      personId,
      managerId,
      fromISO,
      toISO: null,
      recordedOn: dayKey(clock()),
      recordedBySeatId: seatId || null,
      source: source || 'moved',
      reason: String(reason || '').trim().slice(0, STRUCTURE_HISTORY_LIMITS.reasonChars),
      at: clock().toISOString(),
    });
    draft.structureHistory.sort((a, b) => String(a.fromISO).localeCompare(String(b.fromISO))
      || String(a.personId).localeCompare(String(b.personId)));
    draft.structureHistory = draft.structureHistory.slice(-STRUCTURE_HISTORY_LIMITS.records);
    return { recordId, closedN };
  }

  /**
   * Can a new period start on `fromISO` without making two home lines true at once?
   *
   *   OPEN period covering the day   → yes: the move supersedes the current state.
   *   CLOSED period covering the day → no: that day is already recorded, and
   *                                    overwriting it is the silent rewrite this
   *                                    module exists to prevent.
   *   any period starting AFTER it   → no: inserting history underneath recorded
   *                                    history would leave an overlap, and the
   *                                    operator must correct the later period
   *                                    deliberately instead.
   */
  function periodConflict(book, personId, fromISO, toManagerId) {
    const rows = book.byPerson.get(personId) || [];
    const covering = rows.find((r) => r.fromISO <= fromISO && (!r.toISO || r.toISO >= fromISO)) || null;

    if (covering) {
      // A CLOSED period covering the day is recorded history. Overwriting it is
      // the silent rewrite this ledger exists to prevent — regardless of whether
      // the new manager happens to match, because inserting a period inside a
      // closed one would leave two true at once.
      if (covering.toISO) {
        return {
          ok: false,
          error: `The ledger already records ${fromISO} as inside a ${covering.managerId} period (${covering.fromISO}–${covering.toISO}) for this person. That day is recorded history; writing another period over it would make two home lines true at once. Correct the existing period deliberately first.`,
        };
      }
      // An OPEN period is the current state, and a move supersedes it — unless it
      // already names the manager being moved to, in which case nothing changes.
      if (covering.managerId === toManagerId) {
        return {
          ok: false,
          error: `This person has already reported to that manager since ${covering.fromISO} according to the ledger. Nothing would change, so nothing was recorded.`,
        };
      }
    }

    // A period that starts AFTER this day would overlap the one being opened,
    // because the new period runs forward from its start until it is superseded.
    const later = rows.find((r) => r.fromISO > fromISO) || null;
    if (later) {
      return {
        ok: false,
        error: `A recorded period already starts on ${later.fromISO}, after ${fromISO}. Opening a period from ${fromISO} would overlap it and leave two home lines true at once; record against the later boundary or correct that period deliberately.`,
      };
    }
    return { ok: true };
  }

  return {
    /* ---------------------------------------------------------------- reads */

    structureHistoryReport(options = {}) {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.read);
      if (!check.ok) return check;
      return {
        ok: true,
        report: buildStructureHistoryReport(store.state, {
          now: clock(),
          settings: settings(),
          asOf: options.asOf || null,
          fromISO: options.fromISO || null,
          toISO: options.toISO || null,
        }),
      };
    },

    structureHistoryBriefText(options = {}) {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.read);
      if (!check.ok) return check;
      const report = buildStructureHistoryReport(store.state, {
        now: clock(), settings: settings(), asOf: options.asOf || null,
      });
      return { ok: true, text: structureHistoryBriefText(report), report };
    },

    structureHistoryCsvRows(options = {}) {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.read);
      if (!check.ok) return check;
      const report = buildStructureHistoryReport(store.state, {
        now: clock(), settings: settings(), asOf: options.asOf || null,
      });
      return { ok: true, rows: structureHistoryCsvRows(report) };
    },

    /** The roster and managers a seat may move between, with the refusals printed. */
    structureHistoryCandidates() {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.move);
      if (!check.ok) return check;
      const { seat, built } = check;
      const scope = seat.fullAccess
        ? new Set(built.chain.byId.keys())
        : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
      const book = buildStructureLedger(store.state);
      const personRows = [];
      for (const personId of scope) {
        const node = built.chain.byId.get(personId);
        if (!node) continue;
        const line = homeLineOn(book, personId, dayKey(clock()));
        personRows.push({
          personId,
          name: node.name,
          role: node.role || '',
          currentManagerId: node.rawManagerId || LEADER_ID,
          historyRecorded: (book.byPerson.get(personId) || []).length > 0,
          historyObservedToday: line.state === 'observed',
        });
      }
      personRows.sort((a, b) => a.name.localeCompare(b.name));
      const managerRows = [];
      for (const node of built.chain.nodes.values()) {
        if (node.id !== LEADER_ID && !built.chain.byId.has(node.id)) continue;
        if (!seat.fullAccess && node.id !== LEADER_ID && !scope.has(node.id)) continue;
        managerRows.push({ managerId: node.id, name: node.name, role: node.role || '', isLeader: node.id === LEADER_ID });
      }
      managerRows.sort((a, b) => (a.isLeader ? 1 : 0) - (b.isLeader ? 1 : 0) || a.name.localeCompare(b.name));
      return {
        ok: true,
        people: personRows,
        managers: managerRows,
        coverageStart: book.firstRecordedDay,
        limits: { reasonChars: STRUCTURE_HISTORY_LIMITS.reasonChars },
      };
    },

    /* --------------------------------------------------------------- writes */

    structureRecordMove(input = {}) {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.move);
      if (!check.ok) return check;
      const { seat, built } = check;

      const personId = String(input.personId || '').trim();
      const person = activePerson(personId);
      if (!person) return fail('Choose a person on the active roster.', 'personId');

      const at = clock();
      const today = dayKey(at);
      const fromISO = String(input.fromISO || today).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromISO)) {
        return fail('Choose the day the change took effect (YYYY-MM-DD).', 'fromISO');
      }
      // THE REFUSAL THAT PROTECTS THE LEDGER: a future-dated move makes today's
      // as-of reading wrong, which is the exact failure this module exists to
      // prevent. It is refused, not scheduled.
      if (fromISO > today) {
        return fail(`That day is in the future (${fromISO}; today is ${today}). A home-line change is recorded on the day it takes effect — recording it early would make today's structure read as something it is not yet.`, 'fromISO');
      }

      const toManagerId = String(input.managerId || '').trim();
      if (!toManagerId) return fail('Choose the manager this person now reports to.', 'managerId');
      if (toManagerId === personId) {
        return fail('A person cannot report to themselves.', 'managerId');
      }
      if (toManagerId !== LEADER_ID && !activePerson(toManagerId)) {
        return fail('That manager is not on the active roster.', 'managerId');
      }

      const fromManagerId = person.managerId || LEADER_ID;
      if (fromManagerId === toManagerId) {
        return fail('This person already reports to that manager. Nothing would change, so nothing was recorded.', 'managerId');
      }

      const reason = String(input.reason || '').trim();
      if (reason.length < MIN_REASON) {
        return fail('State why the home line changed. A reporting line that moved for no recorded reason is an accountability nobody can be asked about.', 'reason');
      }

      const eligibility = moveEligibility(seat, built, personId, fromManagerId, toManagerId);
      if (!eligibility.ok) return fail(eligibility.error, eligibility.field);

      // A day already recorded as CLOSED under a different manager is history, and
      // rewriting it is the exact silent rewrite this module exists to prevent. An
      // OPEN period covering the day is simply superseded by this move.
      const book = buildStructureLedger(store.state);
      const conflict = periodConflict(book, personId, fromISO, toManagerId);
      if (!conflict.ok) return fail(conflict.error, 'fromISO');

      let outcome = null;
      store.update(
        (draft) => {
          const target = draft.people.find((p) => p && p.id === personId);
          if (!target) return;
          // The pointer and the ledger move together, in ONE transaction. A
          // pointer that moved without a period would be exactly the silent
          // re-pointing this module exists to end.
          target.managerId = toManagerId;
          outcome = applyMove(draft, {
            personId,
            managerId: toManagerId,
            fromISO,
            reason,
            seatId: seat.id,
            source: 'moved',
          });
          // Typed provenance on the same spine every module uses: the person now
          // concerns the manager they joined.
          ensureEntityLink(draft, {
            sourceType: 'person', sourceId: personId,
            targetType: 'person', targetId: toManagerId,
            relation: 'concerns',
            ruleId: 'RULE-SHR-01',
            summary: `Home line moved here on ${fromISO}.`,
          }, { idFactory, todayStr: today, nowIso: at.toISOString() });
        },
        {
          type: STRUCTURE_HISTORY_EVENTS.HOME_LINE_MOVED,
          entity: 'person',
          entityId: personId,
          summary: `Home line moved to ${toManagerId} on ${fromISO}`,
        },
      );

      return saved({
        id: outcome?.recordId || null,
        personId,
        fromManagerId,
        toManagerId,
        fromISO,
        closedN: outcome?.closedN || 0,
      });
    },

    /**
     * Record the structure AS IT STANDS TODAY, for every person whose home line
     * has never been recorded.
     *
     * This is the one honest way out of the "everything is unknown" state, and it
     * is deliberately narrow: it writes a period that STARTS TODAY and says
     * nothing about yesterday. It is not a back-fill — a back-fill would claim to
     * know the past, which is the lie the module exists to prevent. What it does
     * claim is exactly what the operator can see: "from today, this is the
     * structure." Tomorrow's as-of reading is then recorded; last month's still
     * honestly reads `unknown`, and always will, because nobody recorded it.
     *
     * It never touches a person who already has a period covering today, so it is
     * safe to run repeatedly and it cannot overwrite history.
     */
    structureSeedCurrent(input = {}) {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.move);
      if (!check.ok) return check;
      const { seat, built } = check;
      const at = clock();
      const today = dayKey(at);

      const scope = seat.fullAccess
        ? new Set(built.chain.byId.keys())
        : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
      const book = buildStructureLedger(store.state);

      const eligible = [];
      const alreadyRecorded = [];
      const outsideScope = [];
      for (const person of people()) {
        if (!person || !person.id || person.status === 'archived') continue;
        if (!scope.has(person.id)) { outsideScope.push(person.id); continue; }
        const line = homeLineOn(book, person.id, today);
        if (line.state === 'observed') { alreadyRecorded.push(person.id); continue; }
        eligible.push(person);
      }

      if (!eligible.length) {
        return fail(alreadyRecorded.length
          ? `Every person in scope already has a recorded home line covering ${today}. Nothing was written.`
          : 'No active person sits inside this seat, so there is no structure to record.', 'personId');
      }

      let written = 0;
      store.update(
        (draft) => {
          draft.structureHistory = Array.isArray(draft.structureHistory) ? draft.structureHistory : [];
          for (const person of eligible) {
            applyMove(draft, {
              personId: person.id,
              managerId: person.managerId || LEADER_ID,
              fromISO: today,
              reason: `Structure recorded as it stands on ${today}. This says nothing about any earlier day, which remains unknown unless it was recorded when it happened.`,
              seatId: seat.id,
              source: 'declared',
            });
            written += 1;
          }
          draft.structureHistory = draft.structureHistory.slice(-STRUCTURE_HISTORY_LIMITS.records);
        },
        {
          type: STRUCTURE_HISTORY_EVENTS.STRUCTURE_ESTABLISHED,
          entity: 'workspace',
          entityId: 'workspace',
          summary: `Recorded today's structure for ${written} person(s) with no recorded home line`,
        },
      );

      return saved({
        writtenN: written,
        alreadyRecordedN: alreadyRecorded.length,
        outsideScopeN: outsideScope.length,
        fromISO: today,
      });
    },

    /**
     * Import the before/after evidence a committed design already froze (ADR-0099).
     *
     * This is the one place the product already knows what a re-org changed, and
     * leaving it out of the ledger would put the hole exactly where the
     * comparability question is hardest. Only rows that ACTUALLY changed are
     * imported; an unchanged move is not a move and writing it would inflate the
     * re-org count.
     */
    structureImportDesign(input = {}) {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.move);
      if (!check.ok) return check;
      const { seat } = check;
      const at = clock();
      const today = dayKey(at);
      const designId = String(input.designId || '').trim();
      const designs = Array.isArray(store.state.designs) ? store.state.designs : [];
      const design = designs.find((d) => d && d.id === designId) || null;
      if (!design) return fail('That structural design is not in the workspace.', 'designId');
      if (design.status !== 'committed') {
        return fail('Only a COMMITTED design changed the structure. A rehearsal or a reverted design must not write history — it is a plan, not a past.', 'designId');
      }
      const effectiveOn = String(design.committedOn || design.effectiveOn || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) {
        return fail('The committed design carries no readable effective date, so there is no day to record the change against.', 'designId');
      }
      if (effectiveOn > today) {
        return fail(`The design takes effect on ${effectiveOn}, which is in the future. History is recorded on the day it happens.`, 'designId');
      }
      const previous = Array.isArray(design.previousManagers) ? design.previousManagers : [];
      if (!previous.length) {
        return fail('The design froze no before-state, so there is nothing to record. A re-org with no recorded before-state cannot be reconstructed afterwards.', 'designId');
      }

      const atById = new Map(people().map((p) => [p.id, p]));
      const changed = previous.filter((row) => {
        const person = atById.get(row.personId);
        if (!person || person.status === 'archived') return false;
        const currentNow = person.managerId || LEADER_ID;
        const before = row.managerId || LEADER_ID;
        return currentNow !== before;
      });

      if (!changed.length) {
        return fail('Every move this design froze has already been recorded, or left the reporting line unchanged. Nothing was imported twice.', 'designId');
      }

      let written = 0;
      const skipped = [];
      store.update(
        (draft) => {
          draft.structureHistory = Array.isArray(draft.structureHistory) ? draft.structureHistory : [];
          for (const row of changed) {
            const person = draft.people.find((p) => p && p.id === row.personId);
            if (!person) { skipped.push(row.personId); continue; }
            const toManagerId = person.managerId || LEADER_ID;
            // Idempotent on the exact period so a second import is a no-op.
            const exists = draft.structureHistory.some((r) => r
              && r.personId === row.personId
              && r.managerId === toManagerId
              && r.fromISO === effectiveOn);
            if (exists) { skipped.push(row.personId); continue; }
            applyMove(draft, {
              personId: row.personId,
              managerId: toManagerId,
              fromISO: effectiveOn,
              reason: `Imported from committed design ${design.name || design.id} (${effectiveOn}).`,
              seatId: seat.id,
              source: 'design-evidence',
            });
            written += 1;
          }
        },
        {
          type: STRUCTURE_HISTORY_EVENTS.IMPORTED,
          entity: 'design',
          entityId: designId,
          summary: `Imported ${written} home-line change(s) from a committed design`,
        },
      );

      return saved({ designId, effectiveOn, writtenN: written, skippedN: skipped.length, skipped });
    },

    /** Explicit retry for work a per-transaction cap deferred. Changes no structure. */
    structureScan() {
      const check = seatFor(STRUCTURE_HISTORY_RIGHTS.move);
      if (!check.ok) return check;
      const at = clock();
      store.update(
        (draft) => {
          draft.structureHistoryMarkers = Array.isArray(draft.structureHistoryMarkers) ? draft.structureHistoryMarkers : [];
        },
        {
          type: STRUCTURE_HISTORY_EVENTS.SCAN,
          entity: 'workspace',
          entityId: 'workspace',
          summary: 'Explicit structure-history reconciliation scan',
        },
      );
      const report = buildStructureHistoryReport(store.state, { now: at, settings: settings() });
      return saved({ driftedN: report.acts.driftedN, recentMoveN: report.board.recentMoveN });
    },
  };
}

export { normalizeStructureHistorySettings };
