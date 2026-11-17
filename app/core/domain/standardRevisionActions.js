/**
 * app/core/domain/standardRevisionActions.js — the seat-checked commands of the
 * Standard-Work Revision Register (ADR-0237, Schema v192).
 *
 * Two human acts and one read:
 *
 *   APPROVE  the holder of the line a routine is owed under approves a new
 *            text for that routine's standard, names the day it takes effect,
 *            and names who owes the new text. The owner of the standard can
 *            never approve their own change.
 *   BRIEF    the approver who approved a revision records, with a date, that
 *            each named person was briefed on it.
 *   REPORT   the seat-scoped reading. Read-only.
 *
 * The previous text is never typed in: it is the text the routine's chain
 * already holds. A refusal names the field that caused it and saves nothing.
 * The undeclared operator view acts as the workspace leader — the one seat a
 * keyboard genuinely is — and as nobody else.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { buildStandardRevisions } from './standardRevision.js';
import { standardWorkDay } from './standardWorkSchema.js';
import { STANDARD_REVISION_EVENTS, STANDARD_REVISION_LIMITS as L, STANDARD_REVISION_RIGHTS } from './standardRevisionRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function createStandardRevisionActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const exactText = (value, min, max) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
  };
  const idText = (value) => (typeof value === 'string' ? value.trim().slice(0, L.idMax) : '');

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or recording a standard revision.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }

  /** Who the seat may see. Operators see everyone; a seat sees its span and its line scope. */
  function reachOf(check) {
    const operator = check.seat.fullAccess === true;
    const reach = new Set([...(check.seat.scope || []), ...(check.seat.lineScope || [])]);
    return (id) => operator || id === check.actorId || reach.has(id);
  }

  /** The active lines of a person, from the ONE matrix engine. */
  function linesOf(matrix, personId) {
    if (personId === LEADER_ID) return [];
    return (matrix.linesByPerson.get(personId) || []).map((line) => ({
      lineKey: line.role === 'primary' ? 'home' : line.id, managerId: line.managerId, kind: line.kind,
    }));
  }

  /** The one line a revision is approved under. Never inferred when there is a choice. */
  function governingLine(matrix, routine) {
    if (routine.ownerId === LEADER_ID) {
      return fail('A top-tier routine has no line holder above it, so no revision of its standard can be approved in this register.', 'routineId');
    }
    const lines = linesOf(matrix, routine.ownerId);
    if (routine.lineKey) {
      const line = lines.find((row) => row.lineKey === routine.lineKey);
      if (!line) return fail('The line this routine is owed under has ended or is no longer on the record, so no line holder can approve a revision of it.', 'routineId');
      return { ok: true, line };
    }
    if (lines.length === 1) return { ok: true, line: lines[0] };
    if (!lines.length) return fail('The owner holds no active reporting line, so nobody can approve a revision of this routine.', 'routineId');
    return fail(`The owner holds ${lines.length} active reporting lines and this routine names none. LeadOS will not choose the approving line for you.`, 'routineId');
  }

  /** Who may be named as owed a revision: the owner, and everyone who reports to them on any line — each once. */
  function owedCandidates(matrix, ownerId, inReach) {
    const out = new Set([ownerId]);
    for (const [personId, lines] of matrix.linesByPerson) {
      if (lines.some((line) => line.managerId === ownerId)) out.add(personId);
    }
    return [...out].filter((id) => inReach(id) && (id === LEADER_ID || matrix.roster.has(id)));
  }

  const chainOf = (routineId) => list(store.state.standardRevisions)
    .filter((row) => row.routineId === routineId).sort((a, b) => a.revisionNo - b.revisionNo);

  return {
    /* ---------------------------------------------------------------- reads */

    standardRevisionReport() {
      const check = seatFor(STANDARD_REVISION_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: buildStandardRevisions(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * The routines this seat may approve a revision of, each with the people it
     * may name as owed the text, and the briefings this seat still owes.
     */
    standardRevisionCandidates() {
      const check = seatFor(STANDARD_REVISION_RIGHTS.APPROVE);
      if (!check.ok) return check;
      const matrix = buildMatrix(store.state, { now: check.at, settings: check.cfg });
      const inReach = reachOf(check);
      const nameOf = (id) => matrix.nodes.get(id)?.name || list(store.state.people).find((p) => p.id === id)?.name || 'Former colleague';
      const routines = [];
      for (const routine of list(store.state.standardWorkRoutines)) {
        if (routine.retiredOn && routine.retiredOn <= check.today) continue;
        if (routine.ownerId === check.actorId || !inReach(routine.ownerId)) continue;
        const gate = governingLine(matrix, routine);
        if (!gate.ok || gate.line.managerId !== check.actorId) continue;
        const chain = chainOf(routine.id);
        const last = chain.at(-1) || null;
        const earliest = [check.today, routine.fromDay, last ? addDays(last.effectiveOn, 1) : null].filter(Boolean).sort().at(-1);
        routines.push({
          routineId: routine.id,
          title: routine.title,
          ownerId: routine.ownerId,
          ownerName: nameOf(routine.ownerId),
          lineKey: gate.line.lineKey,
          currentStandard: last ? last.standard : routine.standard,
          nextRevisionNo: chain.length + 1,
          earliestEffectiveOn: earliest,
          latestEffectiveOn: addDays(check.today, L.aheadMax),
          owedOptions: owedCandidates(matrix, routine.ownerId, inReach).map((id) => ({ personId: id, name: nameOf(id) }))
            .sort((a, b) => Number(b.personId === routine.ownerId) - Number(a.personId === routine.ownerId) || a.name.localeCompare(b.name)),
        });
      }
      routines.sort((a, b) => a.title.localeCompare(b.title));

      const awaiting = [];
      for (const rev of list(store.state.standardRevisions)) {
        if (rev.approverId !== check.actorId || rev.approvedOn > check.today) continue;
        const routine = list(store.state.standardWorkRoutines).find((row) => row.id === rev.routineId);
        if (!routine || (routine.retiredOn && routine.retiredOn <= rev.effectiveOn)) continue;
        const briefed = new Set(list(store.state.standardRevisionBriefs).filter((row) => row.revisionId === rev.id).map((row) => row.personId));
        const unbriefed = rev.briefeeIds.filter((id) => !briefed.has(id)).map((id) => ({ personId: id, name: nameOf(id) }));
        if (unbriefed.length) awaiting.push({ revisionId: rev.id, revisionNo: rev.revisionNo, title: routine.title, effectiveOn: rev.effectiveOn, unbriefed });
      }
      return { ok: true, routines, awaiting, today: check.today, actorId: check.actorId, limits: { standardMin: L.standardMin, standardMax: L.standardMax, changedStepMin: L.changedStepMin, changedStepMax: L.changedStepMax, basisMin: L.basisMin, basisMax: L.basisMax, aheadMax: L.aheadMax, briefeesMax: L.briefeesMax } };
    },

    /* --------------------------------------------------------------- writes */

    standardRevisionApprove(input = {}) {
      const check = seatFor(STANDARD_REVISION_RIGHTS.APPROVE);
      if (!check.ok) return check;
      const routineId = idText(input.routineId);
      const routine = list(store.state.standardWorkRoutines).find((row) => row.id === routineId) || null;
      if (!routine) return fail('That routine no longer exists.', 'routineId');
      if (routine.retiredOn && routine.retiredOn <= check.today) return fail(`This routine was retired on ${routine.retiredOn}. A retired standard cannot be revised; its record is kept.`, 'routineId');
      if (routine.ownerId === check.actorId) return fail('The owner of a standard cannot approve a change to it. The line holder above them approves it.', 'routineId');

      const matrix = buildMatrix(store.state, { now: check.at, settings: check.cfg });
      const gate = governingLine(matrix, routine);
      if (!gate.ok) return gate;
      const nameOf = (id) => matrix.nodes.get(id)?.name || list(store.state.people).find((p) => p.id === id)?.name || 'Former colleague';
      if (gate.line.managerId !== check.actorId) {
        return fail(`Only ${nameOf(gate.line.managerId)}, the holder of the line this routine is owed under, may approve a revision of it.`, 'routineId');
      }

      const chain = chainOf(routine.id);
      const last = chain.at(-1) || null;
      const priorStandard = last ? last.standard : routine.standard;
      const lastDay = last ? last.effectiveOn : null;

      const standard = exactText(input.standard, L.standardMin, L.standardMax);
      if (!standard) return fail(`State the new standard text in ${L.standardMin}–${L.standardMax} characters. A revision that is not written out cannot be briefed.`, 'standard');
      if (standard === priorStandard) return fail('The new text is the same as the standard it would replace. There is nothing to approve.', 'standard');
      const changedStep = exactText(input.changedStep, L.changedStepMin, L.changedStepMax);
      if (!changedStep) return fail(`Say which step changed, in ${L.changedStepMin}–${L.changedStepMax} characters.`, 'changedStep');
      const basis = exactText(input.basis, L.basisMin, L.basisMax);
      if (!basis) return fail(`Say why the standard changes, in ${L.basisMin}–${L.basisMax} characters. A change with no reason is not a decision.`, 'basis');

      const effectiveOn = standardWorkDay(input.effectiveOn);
      if (!effectiveOn) return fail('The day the new text takes effect is not a real calendar day.', 'effectiveOn');
      if (effectiveOn < check.today) return fail('A revision takes effect today or later. Back-dating a standard would make work done under it look like a departure from text nobody had been told.', 'effectiveOn');
      if (effectiveOn > addDays(check.today, L.aheadMax)) return fail(`A revision takes effect at most ${L.aheadMax} days after it is approved.`, 'effectiveOn');
      if (effectiveOn < routine.fromDay) return fail(`The routine starts on ${routine.fromDay}. A revision cannot take effect before the standard it changes.`, 'effectiveOn');
      if (lastDay && effectiveOn <= lastDay) return fail(`An earlier revision of this standard takes effect on ${lastDay}. This one must take effect after it.`, 'effectiveOn');
      if (routine.retiredOn && effectiveOn >= routine.retiredOn) return fail(`The routine ends on ${routine.retiredOn}. A revision must take effect before the routine ends.`, 'effectiveOn');

      const inReach = reachOf(check);
      const allowed = new Set(owedCandidates(matrix, routine.ownerId, inReach));
      const picked = list(input.briefeeIds).map(idText).filter(Boolean);
      const owed = [...new Set(picked)];
      if (owed.length !== picked.length) return fail('A person is named twice. Each person is owed the new text once.', 'briefeeIds');
      if (!owed.includes(routine.ownerId)) return fail(`${nameOf(routine.ownerId)} owns this standard and is always owed its new text. Include them.`, 'briefeeIds');
      if (owed.length > L.briefeesMax) return fail(`At most ${L.briefeesMax} people may be named as owed one revision.`, 'briefeeIds');
      const outside = owed.find((id) => !allowed.has(id));
      if (outside) return fail(`${nameOf(outside)} is not the owner or someone who reports to the owner on a line you can see. Only those people can be named as owed the text.`, 'briefeeIds');

      if (list(store.state.standardRevisions).length >= L.revisions) return fail(`The revision ledger reached its ${L.revisions}-row cap. Export the workspace before approving another.`);

      const revision = {
        id: idFactory('srv'), routineId: routine.id, revisionNo: chain.length + 1, priorRevisionNo: chain.length,
        priorStandard, standard, changedStep, basis,
        approverId: check.actorId, approvedOn: check.today, approvedAt: check.at.toISOString(),
        effectiveOn, briefeeIds: owed,
      };
      store.update((draft) => {
        draft.standardRevisions = Array.isArray(draft.standardRevisions) ? draft.standardRevisions : [];
        draft.standardRevisions.push(revision);
      }, {
        type: STANDARD_REVISION_EVENTS.APPROVED, entity: 'standardWork', entityId: revision.id,
        summary: `Revision ${revision.revisionNo} of a standard-work routine was approved, in force from ${effectiveOn}; ${owed.length} person(s) owed the new text.`,
      });
      return saved({ revisionId: revision.id, revisionNo: revision.revisionNo, effectiveOn, briefeesN: owed.length });
    },

    standardRevisionBrief(input = {}) {
      const check = seatFor(STANDARD_REVISION_RIGHTS.BRIEF);
      if (!check.ok) return check;
      const revisionId = idText(input.revisionId);
      const rev = list(store.state.standardRevisions).find((row) => row.id === revisionId) || null;
      if (!rev) return fail('That revision no longer exists.', 'revisionId');
      if (rev.approverId !== check.actorId) return fail('Only the approver of this revision records who was briefed on it.', 'revisionId');
      const routine = list(store.state.standardWorkRoutines).find((row) => row.id === rev.routineId) || null;
      if (!routine) return fail('The routine this revision belongs to no longer exists.', 'revisionId');
      if (routine.retiredOn && routine.retiredOn <= rev.effectiveOn) return fail('This revision lapsed: its routine ended before the text took effect, so no briefing is owed or recorded.', 'revisionId');

      const briefedOn = input.briefedOn ? standardWorkDay(input.briefedOn) : check.today;
      if (!briefedOn) return fail('The briefing day is not a real calendar day.', 'briefedOn');
      if (briefedOn > check.today) return fail('A briefing is recorded on the day it happened. A future-dated briefing is refused.', 'briefedOn');
      if (briefedOn < rev.approvedOn) return fail(`A briefing cannot predate the approval of this revision on ${rev.approvedOn}.`, 'briefedOn');

      const picked = list(input.personIds).map(idText).filter(Boolean);
      const personIds = [...new Set(picked)];
      if (!personIds.length) return fail('Name at least one person who was briefed.', 'personIds');
      if (personIds.length !== picked.length) return fail('A person is named twice in one briefing.', 'personIds');
      if (personIds.length > L.briefsPerAct) return fail(`At most ${L.briefsPerAct} briefings are recorded in one act.`, 'personIds');

      const matrix = buildMatrix(store.state, { now: check.at, settings: check.cfg });
      const nameOf = (id) => matrix.nodes.get(id)?.name || list(store.state.people).find((p) => p.id === id)?.name || 'Former colleague';
      const owed = new Set(rev.briefeeIds);
      const inReach = reachOf(check);
      const briefs = list(store.state.standardRevisionBriefs);
      for (const personId of personIds) {
        if (!owed.has(personId)) return fail(`${nameOf(personId)} is not among the people this revision names as owed the text.`, 'personIds');
        if (!inReach(personId)) return fail(`${nameOf(personId)} is outside your reach. You record briefings only for people you can see.`, 'personIds');
        if (briefs.some((row) => row.revisionId === rev.id && row.personId === personId)) {
          return fail(`${nameOf(personId)} is already briefed on this revision. The first briefing on the record stands.`, 'personIds');
        }
      }
      if (briefs.length + personIds.length > L.briefs) return fail(`The briefing ledger reached its ${L.briefs}-row cap. Export the workspace before recording another.`, 'personIds');

      const rows = personIds.map((personId) => ({
        id: idFactory('srb'), revisionId: rev.id, personId, briefedOn, briefedAt: check.at.toISOString(), briefedById: check.actorId,
      }));
      store.update((draft) => {
        draft.standardRevisionBriefs = Array.isArray(draft.standardRevisionBriefs) ? draft.standardRevisionBriefs : [];
        draft.standardRevisionBriefs.push(...rows);
      }, {
        type: STANDARD_REVISION_EVENTS.BRIEFED, entity: 'standardWork', entityId: rev.id,
        summary: `${rows.length} person(s) recorded as briefed on revision ${rev.revisionNo} of a standard-work routine, on ${briefedOn}.`,
      });
      return saved({ revisionId: rev.id, briefedN: rows.length, briefedOn });
    },
  };
}
