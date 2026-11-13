/**
 * app/core/domain/goalCommitmentActions.js — the seat-checked commands of the
 * Cross-Line Goal Commitment Conflict register (ADR-0193, Schema v153).
 *
 * THREE human acts and nothing else: DECLARE what one line's goal consumes of
 * one shared person, RE-BASELINE it with a dated successor, and RELEASE it with
 * a reason. Every act is narrowed to the promise it belongs to:
 *
 *  - a commitment under a NAMED line is declared by the holder of THAT line and
 *    by nobody else: not by a peer, not by the workspace leader on a line
 *    holder's behalf, and not by a later holder of the same line;
 *  - a commitment under `no-line` is declared by the person the goal belongs to
 *    (or by the operator view). A manager may NOT declare that somebody else's
 *    goal is owed under no line — that is how a commitment disappears from the
 *    only screen that would have compared it;
 *  - one live commitment per goal per line. A second live promise over the same
 *    goal and line is refused at the door and named, because nobody could say
 *    which of the two the line meant;
 *  - a re-baseline closes its predecessor IN THE SAME COMMIT as it writes the
 *    successor, so the ledger never holds a moment with two live promises or a
 *    dangling pointer.
 *
 * WHAT THE DOOR REFUSES, and why it is the door rather than the reader: a
 * window that starts before the goal existed has no intelligible reading, so it
 * is refused outright. A window that runs past the goal's own due date is NOT
 * refused — a stale due date is usually the thing that is wrong, and this
 * register's job is to print the contradiction with its reason, not to enforce
 * another module's hygiene. The reader flags both for rows that arrive by
 * import.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildGoalCommitments, goalCommitmentBriefText, goalCommitmentCsvRows } from './goalCommitment.js';
import {
  GOAL_COMMITMENT_BOUNDS,
  GOAL_COMMITMENT_EVENTS,
  GOAL_COMMITMENT_HOME_LINE,
  GOAL_COMMITMENT_LIMITS,
  GOAL_COMMITMENT_NO_LINE,
  GOAL_COMMITMENT_RIGHTS,
  GOAL_COMMITMENT_ROUTE,
  GOAL_COMMITMENT_RULE_ID,
  GOAL_COMMITMENT_SETTING_KEYS,
  GOAL_COMMITMENT_SETTING_LABELS,
} from './goalCommitmentRegistry.js';
import {
  goalCommitmentDay,
  goalCommitmentInclusiveDays,
  goalCommitmentMeasureKey,
  normalizeGoalCommitmentSettings,
} from './goalCommitmentSchema.js';

const L = GOAL_COMMITMENT_LIMITS;

export function createGoalCommitmentActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or declaring a goal commitment.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildGoalCommitments(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
  /** The whole-workspace evaluation: what the gate checks an act against. */
  const whole = (check) => buildGoalCommitments(store.state, { now: check.at, settings: check.cfg, seat: null });

  /** A person's active lines, from the ONE matrix engine. */
  function linesOf(report, personId) {
    if (personId === LEADER_ID) return [];
    const { matrix, nameOf } = report.internal;
    return (matrix.linesByPerson.get(personId) || [])
      .filter((line) => line.active !== false)
      .map((line) => ({
        lineKey: line.role === 'primary' ? GOAL_COMMITMENT_HOME_LINE : line.id,
        managerId: line.managerId,
        managerName: nameOf(line.managerId),
        kind: line.kind,
        role: line.role,
        shareH: Number.isInteger(line.shareH) ? line.shareH : null,
      }));
  }

  /** The live commitment occupying one goal+line slot, if any. */
  const liveSlot = (goalId, lineKey) => rows('goalCommitments').find((row) => row
    && row.goalId === goalId && row.lineKey === lineKey && !row.releasedOn && !row.supersededOn) || null;

  /* ---------------------------------------------------------------- shared door */

  /**
   * Everything a declaration must satisfy, checked once so that DECLARE and
   * RE-BASELINE cannot drift apart. Returns the goal, the owner's lines and the
   * standing verdict, or a refusal.
   */
  function doorForDeclaration(check, input, { requireSlot = false } = {}) {
    const report = whole(check);
    const { matrix } = report.internal;
    const operator = check.seat.fullAccess === true;

    const goalId = text(input.goalId, 120);
    if (!goalId) return fail('Name the goal this commitment is declared against.', 'goalId');
    const goal = rows('goals').find((row) => row && row.id === goalId) || null;
    if (!goal) return fail('That goal is not on the record.', 'goalId');
    if (goal.status !== 'active') return fail(`That goal is ${goal.status}. A commitment is a promise about live work; a finished or dropped goal has nothing left to consume.`, 'goalId');
    if (!goal.ownerId) return fail('That goal names no owner, so it is not one person’s commitment and no line can be asked to carry it.', 'goalId');
    if (goal.ownerId === LEADER_ID) return fail('That goal belongs to the workspace leader, who holds no reporting line in this register.', 'goalId');
    if (!matrix.roster.has(goal.ownerId)) return fail('That goal’s owner is not on the active roster.', 'goalId');

    const lines = linesOf(report, goal.ownerId);
    if (!lines.length) return fail(`${matrix.nodes.get(goal.ownerId)?.name || 'That person'} holds no active reporting line, so no line can declare a commitment for them.`, 'goalId');

    const lineKey = input.lineKey === GOAL_COMMITMENT_NO_LINE
      ? GOAL_COMMITMENT_NO_LINE
      : (input.lineKey === GOAL_COMMITMENT_HOME_LINE ? GOAL_COMMITMENT_HOME_LINE : text(input.lineKey, 120));
    if (!lineKey) return fail('Name the reporting line this goal is owed under, or state explicitly that it is owed under none.', 'lineKey');

    let holderId = null;
    if (lineKey === GOAL_COMMITMENT_NO_LINE) {
      // Only the person whose goal it is — or the operator view — may say a goal
      // is owed under no line. A manager saying it about somebody else's goal
      // would remove it from the only screen that compares commitments.
      if (!operator && goal.ownerId !== check.actorId) {
        return fail('A commitment owed under no reporting line is declared by the person the goal belongs to. You are not that person, so you cannot withdraw it from the cross-line comparison on their behalf.', 'lineKey');
      }
    } else {
      const named = lines.find((line) => line.lineKey === lineKey) || null;
      if (!named) return fail('That is not an active reporting line for the person who owns this goal. A line that ended is not a line a commitment can be declared under.', 'lineKey');
      if (!operator && named.managerId !== check.actorId) {
        return fail(`Only the holder of a line can declare what it promises. ${named.managerName} holds that line; you do not, and nobody may commit another manager’s line.`, 'lineKey');
      }
      holderId = named.managerId;
    }

    const existing = liveSlot(goalId, lineKey);
    if (requireSlot) {
      if (!existing) return fail('There is no live commitment on that goal and line to re-baseline. Declare one instead.', 'goalId');
      if (!operator && existing.holderId !== check.actorId && !(lineKey === GOAL_COMMITMENT_NO_LINE && goal.ownerId === check.actorId)) {
        return fail('A commitment is re-baselined by the seat that declared it. You are not that seat.', 'goalId');
      }
    } else if (existing) {
      return fail(`A live commitment already occupies that goal and line (${existing.id}, window ${existing.windowFrom} to ${existing.windowTo}). Re-baseline it with a dated successor, or release it first — the ledger will not hold two live promises for one line on one goal.`, 'lineKey');
    }

    /* The window. Inclusive, real, bounded, and never starting before the goal
       existed. Running past the goal's due date is PRINTED by the reader, not
       refused here: a stale due date is usually the thing that is wrong. */
    const windowFrom = goalCommitmentDay(input.windowFrom);
    const windowTo = goalCommitmentDay(input.windowTo);
    if (!input.windowFrom || !windowFrom) return fail('The window’s first day is not a real calendar day.', 'windowFrom');
    if (!input.windowTo || !windowTo) return fail('The window’s last day is not a real calendar day.', 'windowTo');
    if (windowTo < windowFrom) return fail('The window ends before it starts. Both ends are inclusive.', 'windowTo');
    const windowDays = goalCommitmentInclusiveDays(windowFrom, windowTo);
    if (windowDays > L.windowMaxDays) return fail(`A commitment window may span at most ${L.windowMaxDays} days. ${windowDays} were supplied — that is a strategy, not a commitment.`, 'windowTo');
    const createdDay = goal.createdAt ? dayKey(goal.createdAt) : null;
    if (createdDay && windowFrom < createdDay) {
      return fail(`The goal was created on ${createdDay}, so a commitment cannot begin before it existed. Move the window, or correct the goal’s creation date on the goal itself.`, 'windowFrom');
    }

    /* The effort: required, exact, and in the SAME integer hundredths of one
       person that a declared line share uses, so the per-line reading compares
       two figures in one unit with no conversion nobody wrote down. */
    const effortRaw = input.effortShareH;
    const effortShareH = typeof effortRaw === 'number' ? Math.trunc(effortRaw) : Math.round(Number(effortRaw));
    if (effortRaw === null || effortRaw === undefined || effortRaw === '' || !Number.isFinite(effortShareH)) {
      return fail('Declare what this commitment consumes, in hundredths of one person (100 = the whole person, 40 = 0.40). A commitment that does not say what it draws cannot be added to any other, and the register will not print a capacity figure it cannot support.', 'effortShareH');
    }
    if (!Number.isInteger(effortRaw) && effortRaw !== String(effortRaw)) {
      return fail('The declared effort must be a whole number of hundredths of one person. Nothing was rounded and nothing was saved.', 'effortShareH');
    }
    if (effortShareH < 0 || effortShareH > 100) return fail(`The declared effort must be a whole number from 0 to 100 hundredths of one person. ${effortShareH} was supplied.`, 'effortShareH');

    /* The measure: optional, but never half declared, and never inferred. */
    const rawMeasure = input.measureKey === null || input.measureKey === undefined ? '' : text(input.measureKey, L.measureKeyMax + 8);
    const rawDirection = input.direction === null || input.direction === undefined ? '' : text(input.direction, 20);
    const measureKey = rawMeasure ? goalCommitmentMeasureKey(rawMeasure) : null;
    if (rawMeasure && !measureKey) {
      return fail(`A measure key is a short identifier of ${L.measureKeyMin}–${L.measureKeyMax} characters (lowercase letters, digits, space, dot, underscore, colon, hyphen) — for example “cycle time” or “attrition”. It is not a sentence, and nothing is read out of the goal’s title or key results.`, 'measureKey');
    }
    const direction = rawDirection ? rawDirection : null;
    if (direction && !['increase', 'decrease', 'hold'].includes(direction)) {
      return fail('A declared direction is increase, decrease or hold.', 'direction');
    }
    if (measureKey && !direction) return fail('A measure with no direction is half a declaration: say whether the commitment moves it up, down, or holds it steady.', 'direction');
    if (!measureKey && direction) return fail('A direction with no measure names nothing to move. Either declare both or neither.', 'measureKey');

    return {
      ok: true, report, matrix, operator, goal, goalId, lines, lineKey, holderId,
      windowFrom, windowTo, windowDays, effortShareH,
      measureKey: measureKey || '', direction: direction || null,
      existing,
    };
  }

  function recordFrom(door, check) {
    return {
      id: idFactory('gcc'),
      goalId: door.goalId,
      ownerId: door.goal.ownerId,
      lineKey: door.lineKey,
      holderId: door.holderId,
      windowFrom: door.windowFrom,
      windowTo: door.windowTo,
      effortShareH: door.effortShareH,
      measureKey: door.measureKey,
      direction: door.direction,
      note: text(check.note, L.noteMax),
      supersededById: null,
      supersededOn: null,
      supersededReason: '',
      releasedOn: null,
      releasedReason: '',
      declaredById: check.actorId,
      declaredOn: check.today,
      declaredAt: check.at.toISOString(),
    };
  }

  const linePhrase = (door) => (door.lineKey === GOAL_COMMITMENT_NO_LINE
    ? 'owed under no reporting line'
    : `owed under the ${door.lineKey === GOAL_COMMITMENT_HOME_LINE ? 'home' : door.lines.find((line) => line.lineKey === door.lineKey)?.kind || 'declared'} line`);

  return {
    /* ---------------------------------------------------------------- reads */

    matrixGoalCommitmentReport() {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    matrixGoalCommitmentBriefText() {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: goalCommitmentBriefText(report), report };
    },

    matrixGoalCommitmentCsvRows() {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: goalCommitmentCsvRows(read(check)) };
    },

    matrixGoalCommitmentAttentionCount() {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: read(check).board.attentionN };
    },

    /**
     * Which goals this seat may declare a commitment for, which lines it may
     * declare under, and which slots are already occupied. Only a LIVE goal with
     * an owner on the active roster can carry a commitment: a finished goal has
     * nothing left to consume.
     */
    matrixGoalCommitmentCandidates() {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const report = whole(check);
      const { matrix, nameOf } = report.internal;
      const operator = check.seat.fullAccess === true;
      const out = [];
      for (const goal of rows('goals')) {
        if (!goal || goal.status !== 'active' || !goal.ownerId || goal.ownerId === LEADER_ID) continue;
        if (!matrix.roster.has(goal.ownerId)) continue;
        const lines = linesOf(report, goal.ownerId);
        if (!lines.length) continue;
        const holdsLine = lines.some((line) => line.managerId === check.actorId);
        const isOwner = goal.ownerId === check.actorId;
        if (!operator && !isOwner && !holdsLine) continue;
        out.push({
          goalId: goal.id,
          goalTitle: String(goal.title || '').slice(0, 200),
          goalDueDate: goal.dueDate || null,
          goalCreatedOn: goal.createdAt ? dayKey(goal.createdAt) : null,
          ownerId: goal.ownerId,
          ownerName: nameOf(goal.ownerId),
          self: isOwner,
          lines: lines.map((line) => ({
            ...line,
            canDeclare: operator || line.managerId === check.actorId,
            occupiedBy: liveSlot(goal.id, line.lineKey)?.id || null,
          })),
          noLineAllowed: operator || isOwner,
          noLineOccupiedBy: liveSlot(goal.id, GOAL_COMMITMENT_NO_LINE)?.id || null,
          multiLine: lines.length > 1,
        });
      }
      out.sort((a, b) => Number(b.self) - Number(a.self) || a.ownerName.localeCompare(b.ownerName) || a.goalTitle.localeCompare(b.goalTitle));
      return { ok: true, candidates: out, actorId: check.actorId, effortBounds: { min: 0, max: 100 }, windowMaxDays: L.windowMaxDays };
    },

    /* --------------------------------------------------------------- writes */

    matrixGoalCommitmentDeclare(input = {}) {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('goalCommitments').length >= L.commitments) {
        return fail(`The commitment ledger reached its ${L.commitments}-row cap. Export the workspace before declaring another.`);
      }
      const door = doorForDeclaration(check, input);
      if (!door.ok) return door;
      const record = recordFrom(door, { ...check, note: input.note });
      const { matrix } = door;
      store.update((draft) => {
        draft.goalCommitments = Array.isArray(draft.goalCommitments) ? draft.goalCommitments : [];
        draft.goalCommitments.push(record);
      }, {
        type: GOAL_COMMITMENT_EVENTS.DECLARED,
        entity: 'goalCommitment',
        entityId: record.id,
        summary: `Commitment declared for “${String(door.goal.title || door.goalId).slice(0, 120)}”: ${linePhrase(door)}, ${record.windowFrom} to ${record.windowTo} (${record.windowDays} day(s)), ${record.effortShareH}/100 of one person${record.measureKey ? `, ${record.direction} ${record.measureKey}` : ''}.`.slice(0, 300),
      });
      return saved({
        commitmentId: record.id,
        goalId: record.goalId,
        lineKey: record.lineKey,
        windowDays: door.windowDays,
        effortShareH: record.effortShareH,
        ownerName: matrix.nodes.get(record.ownerId)?.name || record.ownerId,
      });
    },

    /**
     * Re-baseline: write the successor and close the predecessor in ONE atomic
     * commit, so the ledger never holds a moment with two live promises for one
     * goal and line, and never holds a pointer to a successor that failed to
     * save. The predecessor is closed, never edited and never deleted.
     */
    matrixGoalCommitmentRebaseline(input = {}) {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('goalCommitments').length >= L.commitments) {
        return fail(`The commitment ledger reached its ${L.commitments}-row cap. Export the workspace before re-baselining.`);
      }
      const reason = text(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) {
        return fail(`Say why the commitment is being re-baselined (at least ${L.reasonMin} characters). The predecessor is kept as history and the reason is what makes the sequence readable.`, 'reason');
      }
      // The door is checked against the slot the successor will occupy, so the
      // "already occupied" refusal must not fire on the predecessor itself.
      const probe = rows('goalCommitments').find((row) => row && row.id === text(input.commitmentId, 120)) || null;
      if (!probe) return fail('That commitment is not on the record.', 'commitmentId');
      if (probe.releasedOn) return fail(`That commitment was released on ${probe.releasedOn}: ${probe.releasedReason} Declare a new one instead of re-baselining a release.`, 'commitmentId');
      if (probe.supersededOn) return fail(`That commitment was already re-baselined on ${probe.supersededOn} and replaced by ${probe.supersededById || 'a successor'}. Re-baseline the successor instead.`, 'commitmentId');
      const door = doorForDeclaration(check, { ...input, goalId: probe.goalId, lineKey: probe.lineKey }, { requireSlot: true });
      if (!door.ok) return door;
      if (door.existing.id !== probe.id) {
        return fail('The live commitment on that goal and line is not the one you named. Re-baseline the commitment that actually occupies the slot.', 'commitmentId');
      }
      const successor = recordFrom(door, { ...check, note: input.note });
      store.update((draft) => {
        draft.goalCommitments = Array.isArray(draft.goalCommitments) ? draft.goalCommitments : [];
        draft.goalCommitments.push(successor);
        const predecessor = draft.goalCommitments.find((row) => row && row.id === probe.id);
        if (predecessor) {
          predecessor.supersededById = successor.id;
          predecessor.supersededOn = check.today;
          predecessor.supersededReason = reason;
        }
      }, {
        type: GOAL_COMMITMENT_EVENTS.REBASELINED,
        entity: 'goalCommitment',
        entityId: successor.id,
        summary: `Commitment re-baselined for “${String(door.goal.title || door.goalId).slice(0, 120)}”: ${probe.windowFrom} to ${probe.windowTo} at ${probe.effortShareH}/100 replaced by ${successor.windowFrom} to ${successor.windowTo} at ${successor.effortShareH}/100. Reason: ${reason}`.slice(0, 300),
      });
      return saved({ commitmentId: successor.id, supersedesId: probe.id, supersededOn: check.today, goalId: successor.goalId, lineKey: successor.lineKey });
    },

    matrixGoalCommitmentRelease(input = {}) {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.RELEASE);
      if (!check.ok) return check;
      const commitmentId = text(input.commitmentId, 120);
      const row = rows('goalCommitments').find((item) => item && item.id === commitmentId) || null;
      if (!row) return fail('That commitment is not on the record.', 'commitmentId');
      if (row.releasedOn) return fail(`That commitment was already released on ${row.releasedOn}.`, 'commitmentId');
      if (row.supersededOn) return fail(`That commitment was re-baselined on ${row.supersededOn} and is already closed. Release its successor if the promise no longer stands.`, 'commitmentId');
      const operator = check.seat.fullAccess === true;
      const isNoLine = row.lineKey === GOAL_COMMITMENT_NO_LINE;
      if (!operator) {
        const holdsIt = isNoLine ? row.ownerId === check.actorId : row.holderId === check.actorId;
        if (!holdsIt) {
          return fail(isNoLine
            ? 'A commitment owed under no reporting line is released by the person the goal belongs to.'
            : 'A commitment is released by the holder of the line that declared it. Nobody may release another line’s promise.', 'commitmentId');
        }
      }
      const reason = text(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) return fail(`Say why the commitment is being released (at least ${L.reasonMin} characters). A released commitment is kept as history, and the reason is what makes it readable.`, 'reason');

      store.update((draft) => {
        const target = (draft.goalCommitments || []).find((item) => item && item.id === commitmentId);
        if (!target) return;
        target.releasedOn = check.today;
        target.releasedReason = reason;
      }, {
        type: GOAL_COMMITMENT_EVENTS.RELEASED,
        entity: 'goalCommitment',
        entityId: commitmentId,
        summary: `Commitment released on ${check.today} (${row.windowFrom} to ${row.windowTo}, ${row.effortShareH}/100 of one person): ${reason}`.slice(0, 300),
      });
      return saved({ commitmentId, releasedOn: check.today });
    },

    /** Re-run RULE-GCC-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    matrixGoalCommitmentScan() {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: GOAL_COMMITMENT_EVENTS.SCAN,
        entity: 'workspace',
        entityId: GOAL_COMMITMENT_ROUTE,
        summary: `Cross-line goal commitment scan requested (${GOAL_COMMITMENT_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === GOAL_COMMITMENT_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    matrixGoalCommitmentSetConventions(patch = {}) {
      const check = seatFor(GOAL_COMMITMENT_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Goal-commitment conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(GOAL_COMMITMENT_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one goal-commitment convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared goal-commitment convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${GOAL_COMMITMENT_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = GOAL_COMMITMENT_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${GOAL_COMMITMENT_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeGoalCommitmentSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; }, {
        type: GOAL_COMMITMENT_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: GOAL_COMMITMENT_ROUTE,
        summary: `Goal-commitment conventions set: horizon ${next.goalCommitmentHorizonDays} d, ask threshold ${next.goalCommitmentMinOverlapDays} d overlap, attribution floor ${next.goalCommitmentMinGoals} goal(s), ask window ${next.goalCommitmentAskDueDays} d, automation ${next.goalCommitmentAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
