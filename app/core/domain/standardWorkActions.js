/**
 * app/core/domain/standardWorkActions.js — the seat-checked commands of Leader
 * Standard Work & Tiered Daily Management (ADR-0190, Schema v150).
 *
 * Four human acts and nothing else: DECLARE a routine, RETIRE one, record a
 * first-person CHECK against one calendar slot, and record a first-person TIER
 * ACT on an abnormality escalated to you. Every act is narrowed to the person
 * it belongs to:
 *
 *  - a routine is declared by its owner, or by a manager who holds an active
 *    line over the owner — and then only UNDER THAT LINE;
 *  - a check is recorded by the routine's owner and nobody else. A manager
 *    cannot tick a subordinate's routine and a peer cannot tick a peer's;
 *  - a tier act is recorded by the leader the abnormality is currently
 *    addressed to, and an escalation always names one of the ACTOR'S OWN line
 *    managers. With several lines and none named, the act is refused.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildStandardWork, standardWorkBriefText, standardWorkCsvRows } from './standardWork.js';
import {
  STANDARD_WORK_BOUNDS,
  STANDARD_WORK_CADENCE_KEYS,
  STANDARD_WORK_DISPOSITION_KEYS,
  STANDARD_WORK_EVENTS,
  STANDARD_WORK_KIND_KEYS,
  STANDARD_WORK_LIMITS,
  STANDARD_WORK_OUTCOME_KEYS,
  STANDARD_WORK_RIGHTS,
  STANDARD_WORK_ROUTE,
  STANDARD_WORK_RULE_ID,
  STANDARD_WORK_SETTING_KEYS,
  STANDARD_WORK_SETTING_LABELS,
  STANDARD_WORK_TIER_ACT_KEYS,
} from './standardWorkRegistry.js';
import { normalizeStandardWorkSettings, standardWorkDay } from './standardWorkSchema.js';

const L = STANDARD_WORK_LIMITS;

export function createStandardWorkActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or recording standard work.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildStandardWork(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
  /** The whole-workspace evaluation: what the gate checks an act against. */
  const whole = (check) => buildStandardWork(store.state, { now: check.at, settings: check.cfg, seat: null });

  /** An owner's active lines as `{ lineKey, managerId, managerName, kind }`, from the ONE matrix engine. */
  function linesOf(report, personId) {
    if (personId === LEADER_ID) return [];
    const { matrix, nameOf } = report.internal;
    return (matrix.linesByPerson.get(personId) || []).map((line) => ({
      lineKey: line.role === 'primary' ? 'home' : line.id, managerId: line.managerId, managerName: nameOf(line.managerId), kind: line.kind,
    }));
  }

  /** Resolve the leader an escalation goes to: a named line manager of `fromId`, or the only one. */
  function resolveTarget(report, fromId, toId) {
    const lines = linesOf(report, fromId);
    if (!lines.length) return fail('There is no tier above the workspace leader. Contain the abnormality here, or return it with a reason.', 'toId');
    const wanted = text(toId, 120);
    const managers = [...new Set(lines.map((line) => line.managerId))];
    if (!wanted) {
      if (managers.length === 1) return { ok: true, toId: managers[0] };
      return fail(`You hold ${managers.length} active reporting lines. Name the line manager this goes to — LeadOS will not pick one of your managers for you.`, 'toId');
    }
    if (!managers.includes(wanted)) return fail('An escalation goes to one of your own active line managers. That person does not hold a line over you.', 'toId');
    return { ok: true, toId: wanted };
  }

  return {
    /* ---------------------------------------------------------------- reads */

    standardWorkReport() {
      const check = seatFor(STANDARD_WORK_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    standardWorkBriefText() {
      const check = seatFor(STANDARD_WORK_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: standardWorkBriefText(report), report };
    },

    standardWorkCsvRows() {
      const check = seatFor(STANDARD_WORK_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: standardWorkCsvRows(read(check)) };
    },

    standardWorkAttentionCount() {
      const check = seatFor(STANDARD_WORK_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: read(check).totals.attentionN };
    },

    /** The leaders this seat may declare a routine for, each with the lines it may be declared under. */
    standardWorkCandidates() {
      const check = seatFor(STANDARD_WORK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const report = whole(check);
      const { matrix, nameOf, tierOf } = report.internal;
      const operator = check.seat.fullAccess === true;
      const out = [];
      for (const node of matrix.nodes.values()) {
        const isLeader = node.id === LEADER_ID;
        if (!isLeader && (!matrix.roster.has(node.id) || !node.altitude)) continue;
        const lines = linesOf(report, node.id);
        const allowed = operator || node.id === check.actorId ? lines : lines.filter((line) => line.managerId === check.actorId);
        if (!operator && node.id !== check.actorId && !allowed.length) continue;
        out.push({ ownerId: node.id, ownerName: nameOf(node.id), tier: tierOf(node.id), self: node.id === check.actorId, lines: allowed, lineRequired: lines.length > 1 });
      }
      out.sort((a, b) => Number(b.self) - Number(a.self) || a.ownerName.localeCompare(b.ownerName));
      return { ok: true, candidates: out, actorId: check.actorId };
    },

    /* --------------------------------------------------------------- writes */

    standardWorkDeclareRoutine(input = {}) {
      const check = seatFor(STANDARD_WORK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const report = whole(check);
      const { matrix } = report.internal;
      const operator = check.seat.fullAccess === true;
      const ownerId = text(input.ownerId, 120) || check.actorId;
      const node = matrix.nodes.get(ownerId) || null;
      if (!node || (ownerId !== LEADER_ID && !matrix.roster.has(ownerId))) return fail('That person is not on the active roster.', 'ownerId');
      if (ownerId !== LEADER_ID && !node.altitude) {
        return fail(`${node.name} holds no leadership altitude on the roster. Leader standard work belongs to a leadership position; an individual contributor’s work standard is a different record.`, 'ownerId');
      }
      const lines = linesOf(report, ownerId);
      const mine = lines.filter((line) => line.managerId === check.actorId);
      if (!operator && ownerId !== check.actorId && !mine.length) {
        return fail('A routine is declared by its owner or by a manager who holds an active line over the owner. You hold no line over that person.', 'ownerId');
      }

      // The line the routine is owed under. Never inferred when there is a choice.
      let lineKey = text(input.lineKey, 120) || null;
      const allowed = operator || ownerId === check.actorId ? lines : mine;
      if (ownerId === LEADER_ID) {
        if (lineKey) return fail('The workspace leader holds no reporting line; a routine at the top tier names none.', 'lineKey');
      } else if (lineKey) {
        if (!allowed.some((line) => line.lineKey === lineKey)) {
          return fail(operator || ownerId === check.actorId
            ? 'That is not one of the owner’s active reporting lines.'
            : 'You may declare a routine only under the line you hold over this person.', 'lineKey');
        }
      } else if (lines.length > 1) {
        if (allowed.length === 1 && ownerId !== check.actorId && !operator) lineKey = allowed[0].lineKey;
        else return fail(`${node.name} holds ${lines.length} active reporting lines. Name the line this routine is owed under — the next tier is that line’s manager, and LeadOS will not choose it.`, 'lineKey');
      }

      const title = text(input.title, L.titleMax);
      if (title.length < L.titleMin) return fail(`Give the routine a title of at least ${L.titleMin} characters.`, 'title');
      const standard = text(input.standard, L.standardMax);
      if (standard.length < L.standardMin) return fail(`State the observable standard — what “done” looks like — in at least ${L.standardMin} characters. A routine with no standard cannot find an abnormality.`, 'standard');
      if (!STANDARD_WORK_KIND_KEYS.includes(input.kind)) return fail('Choose one of the declared routine kinds.', 'kind');
      if (!STANDARD_WORK_CADENCE_KEYS.includes(input.cadence)) return fail('Choose a cadence: daily, weekly or monthly.', 'cadence');
      const minutes = Number(input.minutes);
      const [minM, maxM] = L.minutes;
      if (!Number.isInteger(minutes) || minutes < minM || minutes > maxM) return fail(`Minutes per occurrence must be a whole number from ${minM} to ${maxM}.`, 'minutes');
      let weekdays = [];
      if (input.cadence === 'daily') {
        const raw = Array.isArray(input.weekdays) && input.weekdays.length ? input.weekdays : [1, 2, 3, 4, 5];
        weekdays = [...new Set(raw.map(Number))].sort((a, b) => a - b);
        if (!weekdays.length || weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) return fail('Working weekdays are whole numbers 0 (Sunday) to 6 (Saturday).', 'weekdays');
      }
      const fromDay = input.fromDay ? standardWorkDay(input.fromDay) : check.today;
      if (!fromDay) return fail('The start date is not a real calendar day.', 'fromDay');
      if (fromDay < check.today) return fail('A routine starts today or later. Back-dating one would make it owe slots nobody knew about.', 'fromDay');
      if (fromDay > addDays(check.today, L.fromDayAheadMax)) return fail(`A routine may start at most ${L.fromDayAheadMax} days ahead.`, 'fromDay');

      const live = rows('standardWorkRoutines').filter((row) => row.ownerId === ownerId && !(row.retiredOn && row.retiredOn <= check.today));
      if (live.some((row) => row.title.toLowerCase() === title.toLowerCase())) return fail('This leader already has a live routine with that title. Retire it first, or name this one differently.', 'title');
      if (live.length >= L.routinesPerOwner) return fail(`One leader may hold at most ${L.routinesPerOwner} live routines. Standard work that cannot be done is not standard.`, 'ownerId');
      if (rows('standardWorkRoutines').length >= L.routines) return fail(`The routine ledger reached its ${L.routines}-row cap. Export the workspace before declaring another.`);

      const routine = {
        id: idFactory('lsw'), ownerId, title, standard, kind: input.kind, cadence: input.cadence, minutes, weekdays, lineKey,
        fromDay, retiredOn: null, retiredReason: '', declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId,
      };
      store.update((draft) => {
        draft.standardWorkRoutines = Array.isArray(draft.standardWorkRoutines) ? draft.standardWorkRoutines : [];
        draft.standardWorkRoutines.push(routine);
      }, { type: STANDARD_WORK_EVENTS.DECLARED, entity: 'standardWork', entityId: routine.id, summary: `A ${routine.cadence} standard-work routine was declared (${routine.kind}, ${minutes} min), in force from ${fromDay}.` });
      return saved({ routineId: routine.id, ownerId, lineKey, fromDay });
    },

    standardWorkRetireRoutine(input = {}) {
      const check = seatFor(STANDARD_WORK_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const routineId = text(input.routineId, 120);
      const routine = rows('standardWorkRoutines').find((row) => row.id === routineId) || null;
      if (!routine) return fail('That routine no longer exists.', 'routineId');
      if (routine.retiredOn) return fail(`This routine was already retired on ${routine.retiredOn}. The record is append-only.`, 'routineId');
      const row = whole(check).internal.evaluated.find((entry) => entry.routine.id === routineId) || null;
      const operator = check.seat.fullAccess === true;
      if (!operator && routine.ownerId !== check.actorId && row?.nextTierId !== check.actorId) {
        return fail('A routine is retired by its owner or by the next tier it is owed to.', 'routineId');
      }
      const reason = text(input.reason, L.noteMax);
      if (reason.length < L.noteMin) return fail(`Say why the routine is retired (at least ${L.noteMin} characters). Its history is kept.`, 'reason');
      const retiredOn = routine.fromDay > check.today ? routine.fromDay : check.today;
      store.update((draft) => {
        const target = (draft.standardWorkRoutines || []).find((entry) => entry.id === routineId);
        if (target) { target.retiredOn = retiredOn; target.retiredReason = reason; }
      }, { type: STANDARD_WORK_EVENTS.RETIRED, entity: 'standardWork', entityId: routineId, summary: `A standard-work routine was retired on ${retiredOn}; its recorded checks are kept.` });
      return saved({ routineId, retiredOn });
    },

    standardWorkRecordCheck(input = {}) {
      const check = seatFor(STANDARD_WORK_RIGHTS.RECORD);
      if (!check.ok) return check;
      const routineId = text(input.routineId, 120);
      const report = whole(check);
      const row = report.internal.evaluated.find((entry) => entry.routine.id === routineId) || null;
      if (!row) return fail('That routine no longer exists, or its owner is no longer on the active roster.', 'routineId');
      if (row.routine.ownerId !== check.actorId) {
        return fail('A check is a first-person record: only the routine’s owner can record it. Switch to the owner’s seat; a manager or a peer cannot tick somebody else’s standard work.', 'routineId');
      }
      if (row.retired) return fail('This routine is retired and owes no further slot.', 'routineId');
      const slotKey = text(input.slotKey, 12) || row.recordable.find((slot) => !slot.late)?.slotKey || '';
      const slot = row.recordable.find((entry) => entry.slotKey === slotKey) || null;
      if (!slot) {
        return fail(row.recordable.length
          ? 'That slot cannot be recorded. Only the current slot, or the one immediately before it while still unrecorded, is open — an older slot stays unrecorded and cannot be back-filled.'
          : 'Nothing is open to record: the current slot already holds its one check, or today is not a slot this routine owes.', 'slotKey');
      }
      if (!STANDARD_WORK_OUTCOME_KEYS.includes(input.outcome)) return fail('Choose an outcome: done as standard, done with an abnormality found, or missed with a reason.', 'outcome');
      const note = text(input.note, L.noteMax);
      if (input.outcome === 'missed' && note.length < L.noteMin) return fail(`Say why the routine was missed (at least ${L.noteMin} characters). A stated miss is a reasoned record, not a checkbox.`, 'note');
      if (input.outcome === 'abnormal' && note.length < L.noteMin) return fail(`Describe the abnormality — what was seen against the standard (at least ${L.noteMin} characters).`, 'note');
      let disposition = null;
      let toId = null;
      if (input.outcome === 'abnormal') {
        if (!STANDARD_WORK_DISPOSITION_KEYS.includes(input.disposition)) return fail('Say where the abnormality goes: contained at this tier, or escalated to the next.', 'disposition');
        disposition = input.disposition;
        if (disposition === 'escalated') {
          const target = resolveTarget(report, row.routine.ownerId, input.toId);
          if (!target.ok) return target;
          toId = target.toId;
        }
      }
      if (rows('standardWorkChecks').length >= L.checks) return fail(`The check ledger reached its ${L.checks}-row cap. Export the workspace before recording another.`);

      const record = {
        id: idFactory('lswc'), routineId, slotKey, outcome: input.outcome, recordedOn: check.today, recordedAt: check.at.toISOString(),
        recordedById: check.actorId, late: slot.late, note, disposition, toId,
      };
      store.update((draft) => {
        draft.standardWorkChecks = Array.isArray(draft.standardWorkChecks) ? draft.standardWorkChecks : [];
        draft.standardWorkChecks.push(record);
      }, { type: STANDARD_WORK_EVENTS.CHECKED, entity: 'standardWork', entityId: routineId, summary: `A standard-work check was recorded for ${slotKey}: ${input.outcome}${slot.late ? ' (late)' : ''}${disposition ? `, ${disposition}` : ''}.` });
      return saved({ checkId: record.id, routineId, slotKey, outcome: record.outcome, late: slot.late, disposition, toId });
    },

    standardWorkTierAct(input = {}) {
      const check = seatFor(STANDARD_WORK_RIGHTS.RECORD);
      if (!check.ok) return check;
      const checkId = text(input.checkId, 120);
      const report = whole(check);
      const esc = report.internal.escalations.find((entry) => entry.checkId === checkId) || null;
      if (!esc) return fail('That escalated abnormality no longer exists.', 'checkId');
      if (!esc.open) return fail(`This abnormality was already closed (${esc.stateLabel.toLowerCase()}) on ${esc.closedOn}. The chain is append-only.`, 'checkId');
      if (esc.holderId !== check.actorId) {
        return fail(`This abnormality is currently addressed to ${esc.holderName}. Only the leader it is addressed to can act on it; nobody answers for another tier.`, 'checkId');
      }
      if (!STANDARD_WORK_TIER_ACT_KEYS.includes(input.act)) return fail('Choose one act: contained at this tier, returned with a reason, or escalated one tier further.', 'act');
      const note = text(input.note, L.noteMax);
      if (note.length < L.noteMin) return fail(`Say what was done, or why (at least ${L.noteMin} characters).`, 'note');
      let toId = null;
      if (input.act === 'escalated') {
        if (esc.hopN >= L.hops) return fail(`An abnormality can rise at most ${L.hops} tiers. Contain it or return it.`, 'act');
        const target = resolveTarget(report, check.actorId, input.toId);
        if (!target.ok) return target;
        toId = target.toId;
      }
      if (rows('standardWorkTierActs').length >= L.tierActs) return fail(`The tier-act ledger reached its ${L.tierActs}-row cap. Export the workspace before recording another.`);

      const record = { id: idFactory('lswt'), checkId, hop: esc.hopN, actorId: check.actorId, act: input.act, toId, actedOn: check.today, actedAt: check.at.toISOString(), note };
      store.update((draft) => {
        draft.standardWorkTierActs = Array.isArray(draft.standardWorkTierActs) ? draft.standardWorkTierActs : [];
        draft.standardWorkTierActs.push(record);
      }, { type: STANDARD_WORK_EVENTS.TIER_ACTED, entity: 'standardWork', entityId: esc.routineId, summary: `A tier act was recorded on an escalated abnormality at hop ${esc.hopN}: ${input.act}.` });
      return saved({ actId: record.id, checkId, hop: esc.hopN, act: input.act, toId });
    },

    /** Re-run RULE-LSW-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    standardWorkScan() {
      const check = seatFor(STANDARD_WORK_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, { type: STANDARD_WORK_EVENTS.SCAN, entity: 'workspace', entityId: STANDARD_WORK_ROUTE, summary: `Standard-work scan requested (${STANDARD_WORK_RULE_ID}).` });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === STANDARD_WORK_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    standardWorkSetConventions(patch = {}) {
      const check = seatFor(STANDARD_WORK_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Standard-work conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(STANDARD_WORK_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one standard-work convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared standard-work convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${STANDARD_WORK_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = STANDARD_WORK_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${STANDARD_WORK_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeStandardWorkSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; },
        { type: STANDARD_WORK_EVENTS.CONVENTIONS, entity: 'settings', entityId: STANDARD_WORK_ROUTE, summary: `Standard-work conventions set: window ${next.standardWorkWindowDays} d, slot floor ${next.standardWorkMinSlots}, lapse run ${next.standardWorkLapseRun}, tier window ${next.standardWorkTierDays} d, working week ${next.standardWorkWeekMinutes} min, automation ${next.standardWorkAutoPropagate ? 'on' : 'off'}.`.slice(0, 300) });
      return saved({ conventions: next });
    },
  };
}
