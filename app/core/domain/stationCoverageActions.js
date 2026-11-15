/** ADR-0201 — self-attributed station, window and availability declarations through
 * the shared atomic store/event/post-commit pipeline. Never schedules anyone,
 * never assigns a person to a station, never infers availability or consent,
 * never edits a reporting line and never issues a training plan.
 */
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor, buildMatrix, matrixJointApex } from './matrix.js';
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
  stationEnableError,
  stationWindowEnableError,
  stationWindowRelation,
  stationCoverageStationError,
  stationCoverageWindowError,
  stationCoverageDay,
} from './stationCoverageSchema.js';

const text = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const LEDGERS = ['stationWindows', 'skillStations', 'stationAvailability', 'stationEnables', 'stationWindowEnables'];

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
    /**
     * An enabling declaration: this station must come up before that one, in the
     * same window. Same authority as the stations themselves — the window's own
     * holder — and it declares an ORDER, never a staffing. Refusals name the
     * contradiction rather than guessing between two readings.
     */
    stationCoverageDeclareEnable(input = {}) {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      const window = (store.state.stationWindows || []).find((r) => r.id === input.windowId && !r.invalid && !r.retiredOn);
      if (!window || window.holderId !== c.actorId) return fail('Declare the enabling declaration inside a live window of your own. An order is never filed into another manager’s window.');
      if ((store.state.stationEnables || []).length >= STATION_COVERAGE_LIMITS.enables) return fail('Enabling-declaration register is full. Export the workspace before proceeding.');
      const inWindow = (store.state.stationEnables || []).filter((r) => !r.invalid && !r.retiredOn && r.windowId === window.id);
      if (inWindow.length >= STATION_COVERAGE_LIMITS.enablesPerWindow) return fail(`One window holds at most ${STATION_COVERAGE_LIMITS.enablesPerWindow} enabling declarations.`);
      const liveStations = (store.state.skillStations || []).filter((r) => !r.invalid && !r.retiredOn && r.windowId === window.id);
      const from = liveStations.find((r) => r.id === input.fromStationId);
      const to = liveStations.find((r) => r.id === input.toStationId);
      if (!from) return fail('Name a live station in this window as the enabler — the one that must come up first.');
      if (!to) return fail('Name a live station in this window as the dependent — the one that waits.');
      if (from.id === to.id) return fail('A station cannot enable itself; the declaration is a contradiction, not an order.');
      const reason = text(input.reason, STATION_COVERAGE_BOUNDS.enablingReason[1]);
      if (reason.length < STATION_COVERAGE_BOUNDS.enablingReason[0]) return fail(`An enabling declaration needs a written reason of at least ${STATION_COVERAGE_BOUNDS.enablingReason[0]} characters.`);
      const clash = inWindow.some((r) => r.fromStationId === from.id && r.toStationId === to.id);
      if (clash) return fail('A live enabling declaration for this ordered pair is already live. Retire it first if it is wrong; two live declarations would leave the precedence graph to choose between them.');
      const row = {
        id: idFactory('station-enable'),
        windowId: window.id,
        holderId: c.actorId,
        fromStationId: from.id,
        toStationId: to.id,
        reason,
        declaredAt: c.at.toISOString(),
        retiredOn: null,
        retiredBy: null,
      };
      const error = stationEnableError(row, { windows: store.state.stationWindows || [], stations: store.state.skillStations || [] });
      if (error) return fail(error);
      return save('stationEnables', row, 'stations.enable.declared',
        'A line holder declared that one station must come up before another in the same window.');
    },
    stationCoverageRetireEnable(enableId, reason = '') {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      const row = (store.state.stationEnables || []).find((r) => r.id === enableId && !r.invalid);
      if (!row || row.holderId !== c.actorId) return fail('Only the holder who declared this enabling declaration can retire it. No successor is inferred.');
      if (row.retiredOn) return fail('This enabling declaration was already retired. Its history remains on record.');
      const note = text(reason, 400);
      if (note.length < 5) return fail('Retiring an enabling declaration needs a written reason of at least 5 characters.');
      store.update((draft) => {
        const target = draft.stationEnables.find((r) => r.id === enableId);
        target.retiredOn = c.report.today;
        target.retiredBy = c.actorId;
        target.retireReason = note;
      }, { type: 'stations.enable.retired', entity: 'stationCoverage', entityId: enableId,
        summary: 'An enabling declaration was retired with a written reason; the order it imposed is gone, the declaration stays on record.' });
      return { ok: true, saved: !store.persistError, warning: store.persistError || null };
    },
    /**
     * A CROSS-WINDOW prerequisite (ADR-0207): a station in one window must come
     * up before a station in another. Two managers' windows are not one holder's
     * to order, so the declaring seat must hold BOTH lines — the lowest joint
     * apex of the two window holders — or be the operator view, which is printed
     * as scribery rather than as a leadership decision. The calendar is not
     * checked here: whether the order is provable, ambiguous or impossible is
     * derived on every read, so a record that cannot be read exactly is the only
     * refusal. An impossible declaration IS recordable, and the register then
     * prints the contradiction and asks its declarer to repair it.
     */
    stationCoverageDeclareWindowEnable(input = {}) {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      if (!c.report.clean) return fail(c.report.reasons.join(' '));
      const fromWindowId = text(input.fromWindowId, 120);
      const toWindowId = text(input.toWindowId, 120);
      if (fromWindowId === toWindowId) {
        return fail('Both stations sit in the same window; that order belongs to the in-window enabling register, so one order has exactly one home.');
      }
      const fromWindow = (store.state.stationWindows || []).find((r) => r.id === fromWindowId && !r.invalid && !r.retiredOn);
      const toWindow = (store.state.stationWindows || []).find((r) => r.id === toWindowId && !r.invalid && !r.retiredOn);
      if (!fromWindow || !toWindow) return fail('Name two live windows. A prerequisite against a retired window would order work nobody can run.');
      const liveStations = (store.state.skillStations || []).filter((r) => !r.invalid && !r.retiredOn);
      const from = liveStations.find((r) => r.id === text(input.fromStationId, 120) && r.windowId === fromWindow.id);
      const to = liveStations.find((r) => r.id === text(input.toStationId, 120) && r.windowId === toWindow.id);
      if (!from) return fail('Name a live station in the first window as the enabler — the one that must come up first.');
      if (!to) return fail('Name a live station in the second window as the dependent — the one that waits.');
      if (from.id === to.id) return fail('A station cannot enable itself; the declaration is a contradiction, not an order.');
      const reason = text(input.reason, STATION_COVERAGE_BOUNDS.enablingReason[1]);
      if (reason.length < STATION_COVERAGE_BOUNDS.enablingReason[0]) return fail(`A cross-window declaration needs a written reason of at least ${STATION_COVERAGE_BOUNDS.enablingReason[0]} characters.`);
      if ((store.state.stationWindowEnables || []).length >= STATION_COVERAGE_LIMITS.windowEnables) return fail('Cross-window prerequisite register is full. Export the workspace before proceeding.');
      const live = (store.state.stationWindowEnables || []).filter((r) => !r.invalid && !r.retiredOn);
      if (live.some((r) => r.fromStationId === from.id && r.toStationId === to.id)) {
        return fail('A live cross-window declaration for this ordered pair already stands. Retire it first if it is wrong; two live declarations would leave the calendar to choose between them.');
      }
      const pairN = live.filter((r) => r.fromWindowId === fromWindow.id && r.toWindowId === toWindow.id).length;
      if (pairN >= STATION_COVERAGE_LIMITS.windowEnablesPerPair) return fail(`This pair of windows holds at most ${STATION_COVERAGE_LIMITS.windowEnablesPerPair} cross-window declarations.`);
      const operator = c.seat.fullAccess === true;
      const matrix = buildMatrix(store.state, { now: c.at, settings: store.state.settings });
      let basis = 'operator';
      if (!operator) {
        const apex = matrixJointApex(matrix, [fromWindow.holderId, toWindow.holderId]);
        if (!apex.unique || apex.apexId !== c.actorId) {
          return fail('An order between two windows is not one holder’s to make. Only the seat that holds BOTH windows — their lowest joint apex — can declare it, and the register does not let one manager order another’s work.');
        }
        basis = 'joint-apex';
      }
      const row = {
        id: idFactory('station-window-enable'),
        fromWindowId: fromWindow.id,
        fromStationId: from.id,
        toWindowId: toWindow.id,
        toStationId: to.id,
        byId: c.actorId,
        basis,
        reason,
        declaredAt: c.at.toISOString(),
        retiredOn: null,
        retiredBy: null,
        retireReason: null,
      };
      const error = stationWindowEnableError(row, { windows: store.state.stationWindows || [], stations: store.state.skillStations || [] });
      if (error) return fail(error);
      const relation = stationWindowRelation(fromWindow, toWindow);
      const result = save('stationWindowEnables', row, 'stations.window-enable.declared',
        'A seat holding both windows declared that a station in one must come up before a station in the other.');
      if (!result.ok) return result;
      // The calendar verdict is derived on read; it is reported here only so the
      // person who just pressed the button is told what the register now proves.
      return { ...result, relation, warning: result.warning || (relation === 'contradiction'
        ? 'Recorded. The calendar contradicts this order: the consumer window is over before the feeder window opens, so it can never be met. The register prints that and asks its declarer to repair it.'
        : relation === 'same-day' || relation === 'overlap'
          ? 'Recorded. These windows meet or overlap, so the register counts this prerequisite as not proven by the calendar — it supports no claim.'
          : null) };
    },
    stationCoverageRetireWindowEnable(enableId, reason = '') {
      const c = context('declare-station-coverage');
      if (!c.ok) return c;
      const row = (store.state.stationWindowEnables || []).find((r) => r.id === enableId && !r.invalid);
      if (!row) return fail('That cross-window declaration is not on the register.');
      const operator = c.seat.fullAccess === true;
      if (!operator && row.byId !== c.actorId) return fail('Only the seat that declared this prerequisite (or the operator view) can retire it. No successor is inferred.');
      if (row.retiredOn) return fail('This prerequisite was already retired. Its history remains on record.');
      const note = text(reason, 400);
      if (note.length < 5) return fail('Retiring a cross-window declaration needs a written reason of at least 5 characters.');
      store.update((draft) => {
        const target = draft.stationWindowEnables.find((r) => r.id === enableId);
        target.retiredOn = c.report.today;
        target.retiredBy = c.actorId;
        target.retireReason = note;
      }, { type: 'stations.window-enable.retired', entity: 'stationCoverage', entityId: enableId,
        summary: 'A cross-window prerequisite was retired with a written reason; the order it imposed is gone, the declaration stays on record.' });
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
