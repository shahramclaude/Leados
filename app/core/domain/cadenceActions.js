/**
 * app/core/domain/cadenceActions.js — reviewed command & read mixin for the
 * Operating Cadence Clock (`#/cadence`, Schema v93, ADR-0087).
 *
 * Mounted on `api` in `app/actions.js` prior to `guardApi(api, store)` so every
 * method is mediated by the central ADR-0080 gateway (`API_RIGHTS['run-cadence']`
 * and `SAFE_READS`). Enforces:
 *
 *   1. **Span-scoped declarations.** A forum may only be declared by a seat that
 *      chairs it or outranks it, and only a chair inside the operating span may
 *      declare attendance. A peer span cannot be conscripted into your forum.
 *   2. **No self-graded foresight.** A frozen reading is written exactly once and
 *      graded exactly once; a grade is never rewritten by the actor who wrote the
 *      prediction.
 *   3. **No invented history.** Logging a sitting cannot claim more closures than
 *      the declared capacity of that sitting, so the measured closures-per-sitting
 *      figure cannot be inflated by data entry.
 *   4. **Confidential sources never cross.** A performance concern is deliberately
 *      absent from every cadence payload; the read model counts it and refuses it.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { altitudeByKey } from './chainRegistry.js';
import {
  buildCadenceReading,
  buildCadenceReport,
  cadenceBriefText,
  cadenceCsvRows,
  gradeCadenceReading,
} from './cadence.js';
import {
  normalizeCadenceReading,
  normalizeCadenceSettings,
  normalizeCadenceForum,
  normalizeCadenceSession,
} from './cadenceSchema.js';
import {
  CADENCE_EVENTS,
  CADENCE_LIMITS,
  FORUM_CADENCES,
  FORUM_KINDS,
  SESSION_STATUSES,
  INPUT_CLASS_KEYS,
} from './cadenceRegistry.js';

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createCadenceActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const settings = () => store.state.settings || {};
  const forums = () => (Array.isArray(store.state.cadenceForums) ? store.state.cadenceForums : []);
  const sessions = () => (Array.isArray(store.state.cadenceSessions) ? store.state.cadenceSessions : []);
  const readings = () => (Array.isArray(store.state.cadenceReadings) ? store.state.cadenceReadings : []);
  const findForum = (id) => forums().find((f) => f && f.id === id) || null;

  const seatReachesPerson = (seat, id) => Boolean(
    seat.fullAccess
    || (id && (id === seat.id || seat.scope?.has(id) || seat.lineScope?.has(id))),
  );

  function resolveOperatingSeat(at = clock(), effective = settings()) {
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: effective });
    const built = buildSeats(store.state, {
      now: at,
      settings: effective,
      ...(lineScope ? { lineScope } : {}),
    });
    const seat = activeSeat(built);
    return { built, seat, lineScope };
  }

  /** A forum is inside the seat's span if the chair is, or the seat reaches it via tree or declared matrix line. */
  function verifyForumScope(forum, { requireChair = false } = {}) {
    const { built, seat } = resolveOperatingSeat();
    if (seat.fullAccess) return { error: null, seat, built };
    if (seat.readOnly) {
      return {
        error: fail('The declared seat is unresolved and read-only. Choose a valid leadership seat before acting.', 'scope'),
        seat,
        built,
      };
    }
    const right = canAct('run-cadence', seat);
    if (!right.allow) return { error: fail(right.reason, 'scope'), seat, built };
    const chairInSpan = seatReachesPerson(seat, forum.chairSeatId);
    if (!chairInSpan) {
      return {
        error: fail(
          'This forum is chaired outside your operating span. Declare or edit forums you chair, or ask the common leader to change the cadence.',
          'scope',
        ),
        seat,
        built,
      };
    }
    if (requireChair && chairInSpan && forum.chairSeatId !== seat.id && !seat.isLeader) {
      return {
        error: fail('Only the chairing span may log the sitting or change the attendance list for this forum.', 'scope'),
        seat,
        built,
      };
    }
    return { error: null, seat, built };
  }

  function verifyAttendanceScope(forum, attending, seat) {
    for (const id of attending || []) {
      if (!seatReachesPerson(seat, id)) {
        return `“${id}” is outside your operating span (reporting tree and active declared lines). A forum cannot conscript a peer span as an attendee; escalate to the common leader.`;
      }
      if (!(store.state.people || []).some((p) => p && p.id === id && p.status !== 'archived')) {
        return 'An attendee is not an active person in this workspace.';
      }
    }
    return null;
  }

  const api = {
    /* ---------------------------------------------------------------- reads */

    cadenceRead(options = {}) {
      const at = clock();
      const effective = settings();
      const { seat } = resolveOperatingSeat(at, effective);
      if (seat.readOnly) {
        return fail('The declared seat is unresolved and read-only; the cadence register refuses to read a boundary it cannot resolve.', 'scope');
      }
      const report = buildCadenceReport(store.state, { now: at, settings: effective });
      // A declared seat sees forums inside its span (tree or direct matrix
      // line); the operator sees all.
      const rows = seat.fullAccess
        ? report.picture.forums
        : report.picture.forums.filter((row) => seatReachesPerson(seat, row.chairSeatId));
      const visibleForumIds = new Set(rows.map((r) => r.id));
      const visibleItemKeys = report.picture.perItem
        .filter((item) => seat.fullAccess
          || (item.forumId && visibleForumIds.has(item.forumId))
          || (Array.isArray(item.competingForumIds) && item.competingForumIds.some((fid) => visibleForumIds.has(fid)))
          || (Array.isArray(item.people) && item.people.length
            ? item.people.every((pid) => seatReachesPerson(seat, pid))
            : seatReachesPerson(seat, item.ownerNodeId)))
        .map((item) => `${item.type}:${item.entityId}`);
      const scopedPeople = (store.state.people || [])
        .filter((p) => p && p.status !== 'archived' && seatReachesPerson(seat, p.id))
        .map((p) => ({ id: p.id, name: p.name || p.id, role: p.role || p.level || '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        ok: true,
        report,
        forums: rows,
        scopedPeople,
        visibleItemKeys,
        readings: readings().slice(-12).reverse(),
        band: report.band,
        constraint: report.constraint,
        secondary: report.secondary,
        planning: report.planning,
        altitudeRows: report.altitudeRows,
        clock: report.clock,
        counts: report.counts,
        conventions: report.conventions,
        seat: {
          id: seat.id,
          label: seat.label,
          rank: seat.rank,
          fullAccess: seat.fullAccess,
          disclosure: seat.disclosure,
          lineScopeN: seat.lineScopeN || 0,
        },
        engineVersion: report.engineVersion,
        ...(options.includeItems ? { perItem: report.picture.perItem } : {}),
      };
    },

    cadenceBriefText() {
      const report = buildCadenceReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, text: cadenceBriefText(report) };
    },

    cadenceCsvRows() {
      const report = buildCadenceReport(store.state, { now: clock(), settings: settings() });
      return { ok: true, rows: cadenceCsvRows(report, { floor: report.conventions.cadenceCellFloor }) };
    },

    cadenceAttentionCount() {
      const report = buildCadenceReport(store.state, { now: clock(), settings: settings() });
      return report.clock.counts.escape + (report.constraint.type === 'none' ? 0 : 1);
    },

    /**
     * Preview what a proposed forum would carry BEFORE it is declared. This is
     * the "no dead ends" affordance: a leader can see that a weekly forum at the
     * wrong altitude is instantly congested without committing to it.
     */
    cadencePreviewForum(input = {}) {
      const candidate = normalizeCadenceForum({
        id: 'preview',
        title: input.title || 'Preview forum',
        kind: input.kind,
        cadence: input.cadence,
        status: 'active',
        chairSeatId: input.chairSeatId || input.ownerId || null,
        attending: input.attending || [],
        decisionCapacity: input.decisionCapacity,
        serviceDays: input.serviceDays,
        altitudeKey: input.altitudeKey,
        horizonDays: input.horizonDays,
        createdAt: clock().toISOString(),
      });
      if (!candidate) return fail('A forum needs a kind, a cadence and a chair.', 'kind');
      const at = clock();
      // Evaluate the preview against the same demand picture, but with the forum
      // substituted in so the demand it would absorb is visible immediately.
      const previewState = {
        ...store.state,
        cadenceForums: [...forums(), { ...candidate, id: 'preview' }],
      };
      const report = buildCadenceReport(previewState, { now: at, settings: settings() });
      const row = report.picture.forums.find((f) => f.id === 'preview');
      return {
        ok: true,
        preview: {
          forum: candidate,
          itemN: row ? row.itemN : 0,
          demand: row ? row.demand : null,
          flow: row ? row.flow : null,
          fit: row ? row.fit : null,
          next: row ? row.next : null,
          verdict: row ? row.flow.verdictText : null,
        },
      };
    },

    /* -------------------------------------------------------------- commands */

    cadenceDeclareForum(input = {}) {
      const at = clock();
      const today = dayKey(at);
      if (!FORUM_KINDS.includes(input.kind)) return fail('Choose the kind of standing forum.', 'kind');
      if (!FORUM_CADENCES.includes(input.cadence)) return fail('Choose how often the forum sits.', 'cadence');
      const chairSeatId = input.chairSeatId || input.ownerId || null;
      if (!chairSeatId) return fail('Name the seat that chairs this forum.', 'chairSeatId');

      const { built: builtProps } = resolveOperatingSeat(at, settings());
      if (!builtProps.byId.has(chairSeatId) && chairSeatId !== 'leader') {
        const refused = (builtProps.refusedLineSeats || []).find((r) => r.id === chairSeatId);
        return fail(refused?.reason || 'The chairing seat is not a leadership node in this roster.', 'chairSeatId');
      }
      const altitudeKey = input.altitudeKey || builtProps.byId.get(chairSeatId)?.altitudeKey || 'manager';
      const alt = altitudeByKey(altitudeKey);
      const candidate = normalizeCadenceForum({
        id: idFactory('cdf'),
        title: input.title,
        purpose: input.purpose,
        kind: input.kind,
        cadence: input.cadence,
        status: 'active',
        altitudeKey,
        horizonDays: input.horizonDays || (alt ? alt.horizonDays : 30),
        chairSeatId,
        attending: Array.isArray(input.attending) ? input.attending : [],
        decisionCapacity: input.decisionCapacity,
        serviceDays: input.serviceDays,
        agendaRule: input.agendaRule,
        stakes: input.stakes,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      });
      if (!candidate) return fail('The forum could not be validated: kind, cadence, status and chair are required.');

      const { error: scopeError, seat } = verifyForumScope(candidate);
      if (scopeError) return scopeError;
      const attendeeError = verifyAttendanceScope(candidate, candidate.attending, seat);
      if (attendeeError) return fail(attendeeError, 'attending');
      if (forums().length >= CADENCE_LIMITS.forums) {
        return fail('The forum register is full; retire a forum before declaring another.', 'cadenceForums');
      }
      const duplicate = forums().find((f) => f && f.status === 'active' && f.kind === candidate.kind
        && f.chairSeatId === candidate.chairSeatId && f.cadence === candidate.cadence);
      if (duplicate) {
        return fail(`“${duplicate.title}” already covers this kind at this cadence for that seat. Declare a different interval or retire the duplicate.`, 'kind');
      }

      store.update(
        (draft) => {
          draft.cadenceForums = Array.isArray(draft.cadenceForums) ? draft.cadenceForums : [];
          draft.cadenceForums.unshift(candidate);
        },
        {
          type: CADENCE_EVENTS.FORUM_DECLARED,
          entity: 'cadenceforum',
          entityId: candidate.id,
          summary: `Declared standing forum “${candidate.title}” (${candidate.kind}, ${candidate.cadence}, capacity ${candidate.decisionCapacity}/sitting).`,
        },
      );
      return saved({ forum: findForum(candidate.id) });
    },

    cadenceUpdateForum(forumId, patch = {}) {
      const forum = findForum(forumId);
      if (!forum) return fail('Forum not found.', 'forumId');
      const { error: scopeError, seat } = verifyForumScope(forum, { requireChair: true });
      if (scopeError) return scopeError;

      const merged = {
        ...forum,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}),
        ...(patch.cadence !== undefined ? { cadence: patch.cadence } : {}),
        ...(patch.decisionCapacity !== undefined ? { decisionCapacity: patch.decisionCapacity } : {}),
        ...(patch.serviceDays !== undefined ? { serviceDays: patch.serviceDays } : {}),
        ...(patch.horizonDays !== undefined ? { horizonDays: patch.horizonDays } : {}),
        ...(patch.agendaRule !== undefined ? { agendaRule: patch.agendaRule } : {}),
        ...(patch.attending !== undefined ? { attending: patch.attending } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: clock().toISOString(),
      };
      const candidate = normalizeCadenceForum(merged);
      if (!candidate) return fail('The updated forum failed validation.', 'cadence');
      if (patch.attending !== undefined) {
        const attendeeError = verifyAttendanceScope(candidate, candidate.attending, seat);
        if (attendeeError) return fail(attendeeError, 'attending');
      }

      store.update(
        (draft) => {
          const list = Array.isArray(draft.cadenceForums) ? draft.cadenceForums : [];
          const index = list.findIndex((f) => f && f.id === forumId);
          if (index >= 0) list[index] = candidate;
        },
        {
          type: candidate.status === 'retired' ? CADENCE_EVENTS.FORUM_RETIRED : CADENCE_EVENTS.FORUM_DECLARED,
          entity: 'cadenceforum',
          entityId: forumId,
          summary: `Updated standing forum “${candidate.title}” (${candidate.cadence}, capacity ${candidate.decisionCapacity}/sitting, ${candidate.status}).`,
        },
      );
      return saved({ forum: findForum(forumId) });
    },

    /**
     * Log a sitting. Only a HELD or CANCELLED sitting advances the clock: a
     * scheduled sitting does not move `lastHeldOn`, because a meeting that has not
     * happened has not reset anyone's cadence.
     */
    cadenceLogSession(forumId, input = {}) {
      const forum = findForum(forumId);
      if (!forum) return fail('Forum not found.', 'forumId');
      if (forum.status === 'retired') return fail('A retired forum cannot record further sittings.', 'status');
      const { error: scopeError, seat } = verifyForumScope(forum, { requireChair: true });
      if (scopeError) return scopeError;

      const status = SESSION_STATUSES.includes(input.status) ? input.status : 'held';
      const heldOn = input.heldOn || dayKey(clock());
      if (!validDay(heldOn)) return fail('Enter the date the forum sat.', 'heldOn');
      if (heldOn > dayKey(clock())) return fail('A sitting cannot be recorded in the future.', 'heldOn');

      const capacity = Math.max(0, Number(forum.decisionCapacity) || 0);
      const closedN = input.closedN === '' || input.closedN == null ? 0 : Math.round(Number(input.closedN));
      if (!Number.isFinite(closedN) || closedN < 0) return fail('Closed items must be a non-negative count.', 'closedN');
      if (status === 'held' && closedN > capacity) {
        return fail(
          `This forum is declared to produce at most ${capacity} binding decision(s) per sitting; ${closedN} cannot be recorded. Raise the declared capacity deliberately, or record what actually closed.`,
          'closedN',
        );
      }
      if (status === 'cancelled' && closedN > 0) {
        return fail('A cancelled sitting closed nothing; record it as cancelled with zero closures so the cadence slip is visible.', 'closedN');
      }
      const existing = sessions().find((s) => s.forumId === forumId && s.heldOn === heldOn && s.status === status);
      if (existing) return fail('A sitting of this forum is already recorded for that date.', 'heldOn');

      const closedClassKeys = Array.isArray(input.closedClassKeys)
        ? input.closedClassKeys.filter((k) => INPUT_CLASS_KEYS.includes(k)).slice(0, 6)
        : [];
      const session = normalizeCadenceSession({
        id: idFactory('cds'),
        forumId,
        heldOn,
        status,
        decisionCapacity: capacity,
        plannedN: input.plannedN,
        closedN,
        closedClassKeys,
        attendeeIds: Array.isArray(input.attendeeIds) && input.attendeeIds.length
          ? input.attendeeIds
          : forum.attending,
        minutes: input.minutes,
        note: input.note,
        estimatedServiceDays: input.estimatedServiceDays,
        ownerId: forum.chairSeatId,
        createdAt: clock().toISOString(),
      });
      if (!session) return fail('The sitting failed validation.', 'heldOn');
      if (sessions().length >= CADENCE_LIMITS.sessions) {
        return fail('The sitting log is full; export the history before continuing.', 'cadenceSessions');
      }

      store.update(
        (draft) => {
          draft.cadenceSessions = Array.isArray(draft.cadenceSessions) ? draft.cadenceSessions : [];
          draft.cadenceSessions.push(session);
          if (status === 'held') {
            const target = (draft.cadenceForums || []).find((f) => f && f.id === forumId);
            if (target && (!target.lastHeldOn || heldOn > target.lastHeldOn)) target.lastHeldOn = heldOn;
          }
        },
        {
          type: CADENCE_EVENTS.SESSION_LOGGED,
          entity: 'cadenceforum',
          entityId: forumId,
          summary: status === 'held'
            ? `“${forum.title}” sat on ${heldOn}: ${closedN} of ${Math.min(capacity, closedN + Math.max(0, (Number(input.plannedN) || 0) - closedN))} planned item(s) closed.`
            : `“${forum.title}” was cancelled on ${heldOn} — the cadence slip is recorded, not hidden.`,
        },
      );
      // The sitting may complete a frozen reading's prediction window; a scan
      // lets RULE-CAD-04 grade it in the same transaction.
      try {
        store.update(() => {}, {
          type: CADENCE_EVENTS.SCAN,
          entity: 'cadenceforum',
          entityId: forumId,
          summary: 'Cadence re-read after a recorded sitting.',
        });
      } catch {
        /* A scan is advisory; a refused scan must never fail the sitting write. */
      }
      return saved({ session });
    },

    /** Freeze one prospective reading about the governance machine. */
    cadenceFreezeReading(input = {}) {
      const at = clock();
      const report = buildCadenceReport(store.state, { now: at, settings: settings() });
      if (!report.picture.forums.length) {
        return fail('Declare at least one standing forum before freezing a reading; there is nothing to make a claim about.', 'cadenceForums');
      }
      const reading = normalizeCadenceReading(buildCadenceReading(report, {
        now: at,
        id: idFactory('cdr'),
        reviewDays: input.reviewDays,
      }));
      if (!reading) return fail('The reading failed validation.');
      store.update(
        (draft) => {
          draft.cadenceReadings = Array.isArray(draft.cadenceReadings) ? draft.cadenceReadings : [];
          draft.cadenceReadings.push(reading);
          if (draft.cadenceReadings.length > CADENCE_LIMITS.readings) {
            draft.cadenceReadings.splice(0, draft.cadenceReadings.length - CADENCE_LIMITS.readings);
          }
        },
        {
          type: CADENCE_EVENTS.READING_FROZEN,
          entity: 'cadencereading',
          entityId: reading.id,
          summary: `Froze the cadence reading: ${reading.prediction ? reading.prediction.claim : 'no prediction available'}`,
        },
      );
      return saved({ reading });
    },

    /** Grade a due reading once. A grade is never rewritten. */
    cadenceGradeReading(readingId) {
      const reading = readings().find((r) => r && r.id === readingId);
      if (!reading) return fail('Reading not found.', 'readingId');
      if (reading.grade) return fail('This reading has already been graded; a grade is never rewritten.', 'grade');
      const graded = gradeCadenceReading(reading, store.state, { now: clock() });
      if (!graded.changed) return fail(graded.reason || 'This reading is not yet due for grading.', 'grade');
      store.update(
        (draft) => {
          const list = Array.isArray(draft.cadenceReadings) ? draft.cadenceReadings : [];
          const index = list.findIndex((r) => r && r.id === readingId);
          if (index >= 0) list[index] = graded.reading;
        },
        {
          type: CADENCE_EVENTS.GRADED,
          entity: 'cadencereading',
          entityId: readingId,
          summary: `Graded the cadence reading: ${graded.reading.grade.outcome} (${graded.reading.grade.note}).`,
        },
      );
      return saved({ reading: graded.reading });
    },

    /** Explicit scan — always available, even when auto-propagation is paused. */
    cadenceScan() {
      store.update(() => {}, {
        type: CADENCE_EVENTS.SCAN,
        entity: 'cadenceforum',
        entityId: 'workspace',
        summary: 'Explicit cadence scan: queue provenance, constraint and agenda fit re-derived.',
      });
      return saved();
    },

    cadenceSetConventions(patch = {}) {
      const next = normalizeCadenceSettings({ ...settings(), ...(patch || {}) });
      store.update(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...next };
        },
        {
          type: 'cadence.conventions',
          entity: 'cadenceforum',
          entityId: 'workspace',
          summary: `Cadence conventions: utilisation target ${next.cadenceUtilisationTargetPct}%, flow target ${next.cadenceFlowTargetDays}d, floor ${next.cadenceFloorN}.`,
        },
      );
      return saved({ conventions: next });
    },
  };

  return api;
}

export { normalizeCadenceSettings };

/** Exposed for the view's "what would this fix" calculator. */
export function plannedCloseFor(forum, today, extraDays = 0) {
  const interval = Number(forum?.intervalDays) || 7;
  return addDays(today, Math.round(interval + (Number(forum?.serviceDays) || 0) + extraDays));
}
