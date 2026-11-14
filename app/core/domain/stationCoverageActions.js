/** ADR-0201 — self-attributed station, window and availability declarations through
 * the shared atomic store/event/post-commit pipeline. Never schedules anyone,
 * never assigns a person to a station, never infers availability or consent,
 * never edits a reporting line and never issues a training plan.
 */
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { buildStationCoverage, stationCoverageBriefText, stationCoverageCsvRows } from './stationCoverage.js';
import {
  STATION_COVERAGE_BOUNDS,
  STATION_COVERAGE_LIMITS,
  STATION_COVERAGE_SETTING_BOUNDS,
} from './stationCoverageRegistry.js';
import {
  normalizeStationCoverageSettings,
  stationCoverageAvailabilityError,
  stationCoverageStationError,
  stationCoverageWindowError,
  stationCoverageDay,
} from './stationCoverageSchema.js';

const text = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const LEDGERS = ['stationWindows', 'skillStations', 'stationAvailability'];

export function createStationCoverageActions(store, { now, idFactory }) {
  const fail = (error) => ({ ok: false, error });
  function context(right) {
    const at = new Date(now());
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: store.state.settings });
    const seat = activeSeat(buildSeats(store.state, { now: at, settings: store.state.settings, lineScope }));
    const verdict = canAct(right, seat);
    if (seat.readOnly || !verdict.allow) return fail(verdict.reason || 'Resolve the operating seat first.');
    const report = buildStationCoverage(store.state, { now: at, seat });
    return { ok: true, at, seat, report, actorId: seat.fullAccess ? LEADER_ID : seat.nodeId || seat.id };
  }
  function save(collection, row, type, summary) {
    if (LEDGERS.some((name) => (store.state[name] || []).some((r) => r?.id === row.id))) {
      return fail('Generated ledger identity already exists. Nothing was written.');
    }
    store.update((draft) => { draft[collection] = [...(draft[collection] || []), row]; },
      { type, entity: 'stationCoverage', entityId: row.id, summary });
    return { ok: true, id: row.id, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] };
  }
  /** A holder may declare only in their own span; the operator view may scribe and is labelled as such. */
  function holdsLine(state, actorId, holderId, at) {
    if (actorId === holderId) return true;
    const matrix = buildMatrix(state, { now: at, settings: state.settings });
    return (matrix.linesByPerson.get(holderId) || []).some((l) => l.managerId === actorId);
  }
  return {
    stationCoverageReport() {
      const c = context('read-station-coverage');
      return c.ok ? { ok: true, report: c.report } : c;
    },
    /** The SAME report the panel prints, serialised — never a second computation. */
    stationCoverageCsvRows() {
      const c = context('read-station-coverage');
      return c.ok ? { ok: true, rows: stationCoverageCsvRows(c.report) } : c;
    },
    stationCoverageBriefText() {
      const c = context('read-station-coverage');
      return c.ok ? { ok: true, text: stationCoverageBriefText(c.report) } : c;
    },
    stationCoverageDeclareWindow(input = {}) {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      if ((store.state.stationWindows || []).length >= STATION_COVERAGE_LIMITS.windows) return fail('Window register is full. Export the workspace before proceeding.');
      const row = {
        id: idFactory('station-window'),
        holderId: c.actorId,
        label: text(input.label, 160),
        fromDay: stationCoverageDay(input.fromDay),
        toDay: stationCoverageDay(input.toDay),
        declaredAt: c.at.toISOString(),
        retiredOn: null,
      };
      const error = stationCoverageWindowError(row);
      if (error) return fail(error);
      const clash = (store.state.stationWindows || []).some((r) => !r.invalid && !r.retiredOn && r.holderId === c.actorId
        && r.fromDay <= row.toDay && row.fromDay <= r.toDay);
      if (clash) return fail('You already declared a live window overlapping these days. Declare one window per shift; overlapping windows would double-count one afternoon.');
      return save('stationWindows', row, 'stations.window.declared',
        'A line holder declared a dated window in which named stations must be manned.');
    },
    stationCoverageRetireWindow(windowId) {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      const row = (store.state.stationWindows || []).find((r) => r.id === windowId && !r.invalid);
      if (!row || row.holderId !== c.actorId) return fail('Only the holder who declared this window can retire it. No successor is inferred.');
      if (row.retiredOn) return fail('This window was already retired. Its history remains on record.');
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      store.update((draft) => { draft.stationWindows.find((r) => r.id === windowId).retiredOn = c.report.today; },
        { type: 'stations.window.retired', entity: 'stationCoverage', entityId: windowId, summary: 'A window was retired; its stations and statements were retained.' });
      return { ok: true, saved: !store.persistError, warning: store.persistError || null };
    },
    stationCoverageDeclareStation(input = {}) {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      const window = (store.state.stationWindows || []).find((r) => r.id === input.windowId && !r.retiredOn && !r.invalid);
      if (!window || window.holderId !== c.actorId) return fail('Declare the station inside a live window of your own. A station is never filed into another manager’s window.');
      if ((store.state.skillStations || []).length >= STATION_COVERAGE_LIMITS.stations) return fail('Station register is full. Export the workspace before proceeding.');
      const inWindow = (store.state.skillStations || []).filter((r) => !r.invalid && !r.retiredOn && r.windowId === window.id).length;
      if (inWindow >= STATION_COVERAGE_BOUNDS.stationsPerWindow[1]) return fail(`One window holds at most ${STATION_COVERAGE_BOUNDS.stationsPerWindow[1]} stations.`);
      // The task must be a live task the holder declared: a station qualifies
      // people through an existing attestation, never through a new claim.
      const task = (store.state.skillTasks || []).find((r) => r.id === input.taskId && !r.invalid && !r.retiredOn && r.holderId === c.actorId);
      if (!task) return fail('Name a live task you declared. A station is qualified through your own ILUO register; a new qualification is never inferred here.');
      const row = {
        id: idFactory('skill-station'),
        windowId: window.id,
        holderId: c.actorId,
        title: text(input.title, 160),
        standard: text(input.standard, 1200),
        taskId: task.id,
        requirement: input.requirement,
        demand: input.demand,
        declaredAt: c.at.toISOString(),
        retiredOn: null,
      };
      const error = stationCoverageStationError(row, store.state.stationWindows || []);
      if (error) return fail(error);
      return save('skillStations', row, 'stations.station.declared',
        'A line holder declared a station, its required headcount and whether it must run concurrently.');
    },
    stationCoverageRetireStation(stationId) {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      const row = (store.state.skillStations || []).find((r) => r.id === stationId && !r.invalid);
      if (!row || row.holderId !== c.actorId) return fail('Only the holder who declared this station can retire it. No successor is inferred.');
      if (row.retiredOn) return fail('This station was already retired. Its history remains on record.');
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      store.update((draft) => { draft.skillStations.find((r) => r.id === stationId).retiredOn = c.report.today; },
        { type: 'stations.station.retired', entity: 'stationCoverage', entityId: stationId, summary: 'A station was retired; its window and availability history were retained.' });
      return { ok: true, saved: !store.persistError, warning: store.persistError || null };
    },
    /**
     * The person's own availability, or — declared explicitly as such — their
     * line manager's statement about them. The two are never conflated: `basis`
     * is stored and printed, and a manager statement about themselves is refused.
     */
    stationCoverageDeclareAvailability(input = {}) {
      const c = context('declare-station-availability');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      const window = (store.state.stationWindows || []).find((r) => r.id === input.windowId && !r.retiredOn && !r.invalid);
      if (!window) return fail('Choose a live window. Availability is a statement about a declared window, never standing consent.');
      if ((store.state.stationAvailability || []).length >= STATION_COVERAGE_LIMITS.availability) return fail('Availability ledger is full. Export the workspace before proceeding.');
      const personId = input.personId || c.actorId;
      const basis = personId === c.actorId ? 'self' : 'manager';
      const matrix = buildMatrix(store.state, { now: c.at });
      if (!matrix.roster.has(personId) && personId !== LEADER_ID) return fail('That person is not on the active roster. Availability is never recorded for a departed person.');
      if (basis === 'manager' && !holdsLine(store.state, c.actorId, personId, c.at)) {
        return fail('You do not hold a live reporting line to that person, so you cannot state their availability. Only they can.');
      }
      const live = (store.state.stationAvailability || []).find((r) => !r.invalid && !r.withdrawnAt && r.personId === personId && r.windowId === window.id);
      if (live) return fail('An availability statement for this person and window is already live. Withdraw it first: two live statements would leave the reader to choose between them.');
      const row = {
        id: idFactory('station-availability'),
        personId,
        windowId: window.id,
        byId: c.actorId,
        basis,
        fromDay: stationCoverageDay(input.fromDay),
        toDay: stationCoverageDay(input.toDay),
        capacity: input.capacity,
        declaredAt: c.at.toISOString(),
        withdrawnAt: null,
        withdrawnBy: null,
        note: text(input.note, 400),
        stationIds: Array.isArray(input.stationIds) ? input.stationIds.map((s) => text(s, 120)) : [],
      };
      const error = stationCoverageAvailabilityError(row, {
        windows: store.state.stationWindows || [],
        stations: store.state.skillStations || [],
        people: matrix.roster,
      });
      if (error) return fail(error);
      return save('stationAvailability', row, 'stations.availability.declared',
        basis === 'self'
          ? 'A person declared their own availability and concurrent capacity for a declared window.'
          : 'A line manager declared a person’s availability and capacity; the register prints that the person did not say it themselves.');
    },
    stationCoverageWithdrawAvailability(availabilityId, reason = '') {
      const c = context('declare-station-availability');
      if (!c.ok) return c;
      const row = (store.state.stationAvailability || []).find((r) => r.id === availabilityId && !r.invalid);
      if (!row) return fail('That availability statement is not on the register.');
      const mine = row.personId === c.actorId;
      const managerOfThem = holdsLine(store.state, c.actorId, row.personId, c.at);
      if (!mine && !managerOfThem) return fail('Only the person, or a holder of their live line, can withdraw this statement.');
      if (row.withdrawnAt) return fail('This statement was already withdrawn. Its history remains on record.');
      const note = text(reason, 400);
      if (note.length < 5) return fail('A withdrawal needs a written reason of at least 5 characters.');
      store.update((draft) => {
        const target = draft.stationAvailability.find((r) => r.id === availabilityId);
        target.withdrawnAt = c.at.toISOString();
        target.withdrawnBy = c.actorId;
        target.note = note;
      }, { type: 'stations.availability.withdrawn', entity: 'stationCoverage', entityId: availabilityId,
        summary: 'An availability statement was withdrawn with a written reason; it no longer covers the window.' });
      return { ok: true, saved: !store.persistError, warning: store.persistError || null };
    },
    stationCoverageSetConventions(input = {}) {
      const c = context('govern-station-coverage');
      if (!c.ok) return c;
      const next = { ...(store.state.settings || {}) };
      const changes = [];
      for (const [key, [min, max]] of Object.entries(STATION_COVERAGE_SETTING_BOUNDS)) {
        if (input[key] === undefined || input[key] === null || input[key] === '') continue;
        const n = Math.round(Number(input[key]));
        if (!Number.isFinite(n) || n < min || n > max) return fail(`${key} must be a whole number from ${min} to ${max}.`);
        next[key] = n;
        changes.push(`${key}=${n}`);
      }
      if (typeof input.stationCoverageAutoPropagate === 'boolean') {
        next.stationCoverageAutoPropagate = input.stationCoverageAutoPropagate;
        changes.push(`stationCoverageAutoPropagate=${input.stationCoverageAutoPropagate}`);
      }
      if (!changes.length) return fail('No convention was supplied.');
      const normalized = normalizeStationCoverageSettings(next);
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...normalized }; },
        { type: 'stations.conventions.set', entity: 'settings', entityId: 'stationCoverage',
          summary: `Station-coverage conventions re-declared: ${changes.join(', ')}.` });
      return { ok: true, saved: !store.persistError, warning: store.persistError || null, changes };
    },
  };
}
