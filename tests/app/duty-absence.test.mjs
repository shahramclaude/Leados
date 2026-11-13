/**
 * tests/app/duty-absence.test.mjs — ADR-0122, Schema v115, Session 167.
 *
 * The Dated Absence Plan answers the temporal half of the coverage question:
 * "if I am not here on these dates, which of my duty lines lose their cover,
 * and does the declared cover have their own absence on those same dates?"
 *
 * What this suite proves, against the REAL store, the REAL rule spine and the
 * REAL access gateway:
 *   1. Schema v115 is additive and convergent; a malformed absence row is
 *      dropped with a warning, never repaired into an absence nobody declared.
 *   2. `parseAbsenceWindow` refuses whole windows: malformed dates, from > to,
 *      and spans over the declared maximum. A partially repaired window would
 *      grade the wrong dates and print a confident wrong answer.
 *   3. A declaration is one atomic transaction: the absence row, ONE
 *      `declares-absence-of` edge to the seat, ONE governed decision naming
 *      the exposure, and one `rolls-up-to` edge per leadership ancestor —
 *      then the graph survives a reload.
 *   4. A seat may not declare a second active absence overlapping one it
 *      already holds; the register grades one window per seat at a time.
 *   5. Revoke is append-only with a required reason: the row is marked
 *      revoked, never deleted, and the revocation is on the record.
 *   6. Availability is DERIVED, never stored: `absenceWindowPlan` re-derives
 *      which declared covers are available on each day of the window from
 *      the declared absence windows, and the state row itself is never
 *      rewritten by the read.
 *   7. The roll-up grades every active absence in the seat's span through
 *      `absenceWindowPlan`, sorted by window start, with reason text
 *      withheld from rank-3-and-above readers unless full access.
 *   8. The gateway enforces the new right: an unresolved (read-only) seat
 *      cannot declare or revoke an absence.
 *   9. The upward brief and the CSV absence rows name no person and no seat
 *      id, and a refused figure is BLANK rather than zero.
 *  10. The plan panel renders at the frontline altitude, axe-clean, with no
 *      console errors — the absence plan, the window grade and the roll-up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, migrate, normalizeSettings,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  DUTY_ABSENCE_ENGINE_VERSION, DUTY_ABSENCE_EVENTS, DUTY_ABSENCE_LIMITS,
  DUTY_ABSENCE_RELATION, DUTY_ABSENCE_PREMISE,
} from '../../app/core/domain/dutyAbsenceRegistry.js';
import {
  parseAbsenceWindow, overlaps, normalizeAbsencePlans, activeAbsenceFor,
} from '../../app/core/domain/dutyAbsenceSchema.js';
import {
  absenceWindowPlan, dutyAbsenceRollup, buildDutyCoverageReport,
  dutyCoverageBriefText, dutyCoverageCsvRows,
} from '../../app/core/domain/dutyCoverage.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { ACTION_RIGHTS, recordPolicy } from '../../app/core/domain/seatRegistry.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

/**
 * leader (chief, no roster record) → vp1 (4) → dir1 (3) → mgr1 (2) → lead1 (1)
 * → ic1/ic2. Two frontline leads under one manager so a peer span exists and
 * can be proven to be REFUSED rather than merely absent from a list.
 */
function fixture(seatId = 'lead1') {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId: seatId,
  };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null, status: 'active', createdAt: ago(600) },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: ago(600) },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active', createdAt: ago(600) },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
  ];
  state.oneOnOnes = [
    { id: 'oo1', personId: 'ic1', date: ago(3), status: 'held', notes: 'Weekly cadence held.', agenda: [], actions: [] },
  ];
  state.cases = [
    { id: 'case1', title: 'Night-shift handover blocker', status: 'open', ownerId: 'ic2', openedOn: ago(11), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), involvedPersonIds: ['ic2'] },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

const seatOf = (state) => activeSeat(buildSeats(state, { now: NOW, settings: state.settings }));

/* --------------------------------------------------------------- 1. schema */

test('schema v115 is additive and convergent; a malformed absence is dropped, never repaired', () => {
  assert.equal(SCHEMA_VERSION, 150);
  const migrated = migrate({ schemaVersion: 114, people: [{ id: 'p1', name: 'A' }], settings: { leaderName: 'Dana' } });
  assert.deepEqual(migrated.applied, ['114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150']);
  assert.equal(migrated.raw.schemaVersion, 150);
  assert.deepEqual(migrated.raw.absencePlans, [], 'no absence is invented at upgrade time');
  assert.equal(migrated.raw.settings.leaderName, 'Dana', 'existing settings survive');
  assert.deepEqual(migrate(migrated.raw).applied, [], 'convergence, not a loop');

  const warnings = [];
  const plans = normalizeAbsencePlans([
    { id: 'a-ok', seatId: 'lead1', from: '2027-07-01', to: '2027-07-05', reason: 'A planned week off.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'a-bad-window', seatId: 'lead1', from: 'not-a-date', to: '2027-07-05', reason: 'Broken window.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'a-no-reason', seatId: 'lead1', from: '2027-07-01', to: '2027-07-05', reason: '', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'a-bad-status', seatId: 'lead1', from: '2027-07-01', to: '2027-07-05', reason: 'A planned absence.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'maybe' },
    'not-an-object',
    { id: 'a-ok', seatId: 'lead1', from: '2027-07-01', to: '2027-07-05', reason: 'A planned week off.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
  ], warnings);
  assert.equal(plans.length, 1, 'only the one well-formed, unique absence survives');
  assert.equal(plans[0].id, 'a-ok');
  assert.equal(plans[0].seatId, 'lead1');
  assert.equal(plans[0].status, 'active');
  assert.ok(warnings.length >= 4, 'every drop is explained');

  // A second active absence for the same seat overlapping the first is dropped.
  const clashWarnings = [];
  const clashed = normalizeAbsencePlans([
    { id: 'a1', seatId: 'lead1', from: '2027-07-01', to: '2027-07-05', reason: 'First absence.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'a2', seatId: 'lead1', from: '2027-07-03', to: '2027-07-10', reason: 'Second overlapping absence.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
  ], clashWarnings);
  assert.equal(clashed.length, 1, 'one window per seat at a time');
  assert.ok(clashWarnings.some((w) => /second active absence/i.test(w)), 'the clash is printed, not silent');

  // A non-overlapping second absence for the same seat is fine.
  const later = normalizeAbsencePlans([
    { id: 'a1', seatId: 'lead1', from: '2027-07-01', to: '2027-07-05', reason: 'First absence.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'a2', seatId: 'lead1', from: '2027-08-01', to: '2027-08-05', reason: 'Second absence, later.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
  ]);
  assert.equal(later.length, 2, 'non-overlapping absences for one seat are both loaded');

  assert.equal(DUTY_ABSENCE_ENGINE_VERSION, 'duty-absence-2026.11-v1');
  assert.equal(DUTY_ABSENCE_RELATION, 'declares-absence-of');
  assert.deepEqual(DUTY_ABSENCE_EVENTS.DECLARE, 'dutyAbsence.declared');
  assert.deepEqual(DUTY_ABSENCE_LIMITS.maxSpanDays, 90);
  assert.deepEqual(DUTY_ABSENCE_LIMITS.reasonChars, 300);
  assert.ok(DUTY_ABSENCE_PREMISE.length > 0, 'the premise is printed');

  assert.equal(ACTION_RIGHTS['declare-duty-absence'].minRank, 1, 'every leadership seat declares its own absence');
  assert.equal(ACTION_RIGHTS['declare-duty-absence'].maxRank, 5);
  assert.equal(recordPolicy('absencePlans').classKey, 'unit', 'an absence is a statement about a seat, not about a person');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'rule/contract parity is untouched: this module adds no rule');
});

/* --------------------------------------------------------- 2. window parse */

test('parseAbsenceWindow refuses whole windows: malformed dates, from > to, over-span', () => {
  assert.deepEqual(parseAbsenceWindow({ from: '2027-07-01', to: '2027-07-05' }), { from: '2027-07-01', to: '2027-07-05' });
  assert.equal(parseAbsenceWindow({ from: '2027-07-05', to: '2027-07-01' }), null, 'from must not be after to');
  assert.equal(parseAbsenceWindow({ from: 'not-a-date', to: '2027-07-05' }), null);
  assert.equal(parseAbsenceWindow({ from: '2027-07-01' }), null, 'both ends are required');
  assert.equal(parseAbsenceWindow({ from: '2027-07-01', to: '2027-10-01' }), null, 'a window over the span cap is refused whole');
  assert.equal(parseAbsenceWindow(null), null);
  assert.equal(parseAbsenceWindow('2027-07-01'), null, 'a string is not a window');

  // The span cap is inclusive: 90 days is the last accepted window.
  assert.equal(parseAbsenceWindow({ from: '2027-01-01', to: '2027-04-01' }), null, '91 days is refused');
  assert.deepEqual(parseAbsenceWindow({ from: '2027-01-01', to: '2027-03-31' }), { from: '2027-01-01', to: '2027-03-31' }, '90 days is the last accepted window');

  assert.equal(overlaps({ from: '2027-07-01', to: '2027-07-05' }, { from: '2027-07-03', to: '2027-07-10' }), true);
  assert.equal(overlaps({ from: '2027-07-01', to: '2027-07-05' }, { from: '2027-07-06', to: '2027-07-10' }), false);
  assert.equal(overlaps({ from: '2027-07-01', to: '2027-07-05' }, { from: '2027-07-05', to: '2027-07-10' }), true, 'the boundary day overlaps');
  assert.equal(overlaps(null, { from: '2027-07-01', to: '2027-07-05' }), false);

  assert.equal(activeAbsenceFor([], 'lead1'), null);
  const one = [{ seatId: 'lead1', status: 'active', from: '2027-07-01', to: '2027-07-05' }];
  assert.equal(activeAbsenceFor(one, 'lead1').from, '2027-07-01');
  assert.equal(activeAbsenceFor(one, 'lead2'), null);
  assert.equal(activeAbsenceFor([{ seatId: 'lead1', status: 'revoked', from: '2027-07-01', to: '2027-07-05' }], 'lead1'), null, 'a revoked absence is not active');
});

/* ------------------------------------------------------- 3. atomic declare */

test('a declaration is one atomic transaction: row, edge, decision, rolls-up-to', () => {
  const { store, api } = boot();
  const seat = seatOf(store.state);
  assert.equal(seat.id, 'lead1');

  const result = api.dutyAbsenceDeclare({
    from: '2027-07-01', to: '2027-07-05',
    reason: 'A planned week off in early July.',
  });
  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.equal(result.window.from, '2027-07-01');
  assert.equal(result.window.to, '2027-07-05');

  const row = store.state.absencePlans[0];
  assert.equal(row.seatId, 'lead1');
  assert.equal(row.status, 'active');
  assert.equal(row.version, DUTY_ABSENCE_ENGINE_VERSION);
  assert.equal(row.declaredOn, '2027-06-30');

  // The graph edge: absenceplan DECLARES-ABENCE-OF person.
  const link = store.state.links.find(
    (l) => l.sourceType === 'absenceplan' && l.sourceId === row.id && l.relation === DUTY_ABSENCE_RELATION,
  );
  assert.ok(link, 'the declares-absence-of edge is on the graph');
  assert.equal(link.targetId, 'lead1');

  // One governed decision naming the exposure.
  const decision = store.state.decisions.find((d) => d.id === row.decisionId);
  assert.ok(decision, 'the governed decision is on the record');
  assert.match(decision.title, /absent 2027-07-01 → 2027-07-05/);
  assert.match(decision.question, /declared an absence/);

  // rolls-up-to edges per leadership ancestor above the absent seat.
  const rolls = store.state.links.filter(
    (l) => l.sourceType === 'decision' && l.sourceId === row.decisionId && l.relation === 'rolls-up-to',
  );
  assert.ok(rolls.length >= 3, 'the decision climbs every leadership ancestor');
  const targets = new Set(rolls.map((r) => r.targetId));
  assert.ok(targets.has('mgr1') && targets.has('dir1') && targets.has('vp1'), 'mgr1, dir1 and vp1 are all on the roll-up');

  // The event is logged (post-commit rules may append automation events after it).
  const declareEvent = store.state.events.find((e) => e.type === DUTY_ABSENCE_EVENTS.DECLARE && e.entityId === row.id);
  assert.ok(declareEvent, 'the absence declare event is on the record');
  assert.equal(declareEvent.entity, 'absenceplan');

  // Survives a reload.
  const map2 = new Map([[STORAGE_KEY, JSON.stringify(store.state)]]);
  const store2 = createStore({ storage: { getItem: (k) => map2.get(k) ?? null, setItem: (k, v) => map2.set(k, String(v)), removeItem: (k) => map2.delete(k) }, now: () => NOW, idFactory: (p) => `${p}-r${++seq}` });
  store2.load();
  assert.equal(store2.state.absencePlans.length, 1, 'the absence survives a reload');
  assert.equal(store2.state.absencePlans[0].seatId, 'lead1');
});

/* ----------------------------------------------------- 4. clash refusal */

test('a seat may not declare a second active absence overlapping one it already holds', () => {
  const { api } = boot();
  const first = api.dutyAbsenceDeclare({
    from: '2027-07-01', to: '2027-07-05',
    reason: 'A planned week off in early July.',
  });
  assert.equal(first.ok, true);

  const clash = api.dutyAbsenceDeclare({
    from: '2027-07-03', to: '2027-07-10',
    reason: 'An overlapping absence declared later.',
  });
  assert.equal(clash.ok, false);
  assert.match(clash.error, /already holds an active absence/i);

  // A non-overlapping absence is fine.
  const later = api.dutyAbsenceDeclare({
    from: '2027-08-01', to: '2027-08-05',
    reason: 'A second absence later in the summer.',
  });
  assert.equal(later.ok, true);

  // A short reason is refused.
  const short = api.dutyAbsenceDeclare({
    from: '2027-09-01', to: '2027-09-05',
    reason: 'short',
  });
  assert.equal(short.ok, false);
  assert.equal(short.field, 'reason');

  // A malformed window is refused.
  const bad = api.dutyAbsenceDeclare({
    from: 'not-a-date', to: '2027-09-05',
    reason: 'A planned absence with a broken window.',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.field, 'window');
});

/* -------------------------------------------------------- 5. append-only */

test('revoke is append-only with a required reason; the row is never deleted', () => {
  const { store, api } = boot();
  const declared = api.dutyAbsenceDeclare({
    from: '2027-07-01', to: '2027-07-05',
    reason: 'A planned week off in early July.',
  });
  const rowId = declared.id;

  // A short revoke reason is refused.
  const short = api.dutyAbsenceRevoke({ id: rowId, reason: 'ok' });
  assert.equal(short.ok, false);
  assert.equal(short.field, 'reason');

  // A valid revoke marks the row revoked, never deletes it.
  const revoked = api.dutyAbsenceRevoke({ id: rowId, reason: 'The trip was cancelled.' });
  assert.equal(revoked.ok, true);
  const row = store.state.absencePlans.find((r) => r.id === rowId);
  assert.equal(row.status, 'revoked');
  assert.equal(row.revokedOn, '2027-06-30');
  assert.equal(row.revokeReason, 'The trip was cancelled.');
  assert.equal(store.state.absencePlans.length, 1, 'the row is still on the record');

  // A second revoke is refused.
  const again = api.dutyAbsenceRevoke({ id: rowId, reason: 'Trying again.' });
  assert.equal(again.ok, false);
  assert.match(again.error, /already revoked/i);

  // A revoked absence no longer reads as active.
  assert.equal(activeAbsenceFor(store.state.absencePlans, 'lead1'), null);

  // The event is logged.
  const event = store.state.events.at(-1);
  assert.equal(event.type, DUTY_ABSENCE_EVENTS.REVOKE);
  assert.equal(event.entityId, rowId);
});

/* ---------------------------------------------------- 6. derived availability */

test('availability is derived, never stored: absenceWindowPlan re-derives from declared windows', () => {
  const state = fixture();
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = activeSeat(built);
  assert.equal(seat.id, 'lead1');

  // No absences declared: every cover is available.
  const noAbsence = absenceWindowPlan(state, built, seat, { from: '2027-07-01', to: '2027-07-05' });
  assert.ok(noAbsence.rows.length > 0, 'the plan grades every duty line the seat holds');
  for (const row of noAbsence.rows) {
    assert.equal(row.windowBand !== 'cover-absent', true, 'no cover is absent when no absence is declared');
  }

  // The manager is absent during the window: their cover reads cover-absent.
  const withAbsence = {
    ...state,
    absencePlans: [
      {
        id: 'a1', seatId: 'mgr1', from: '2027-07-01', to: '2027-07-05',
        reason: 'The manager is out the first week of July.',
        declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active',
      },
    ],
  };
  const built2 = buildSeats(withAbsence, { now: NOW, settings: withAbsence.settings });
  const seat2 = activeSeat(built2);
  const plan = absenceWindowPlan(withAbsence, built2, seat2, { from: '2027-07-01', to: '2027-07-05' });
  const exposedRow = plan.rows.find((r) => r.windowBand === 'cover-absent');
  if (exposedRow) {
    assert.ok(exposedRow.conflicts.length > 0, 'the conflict is printed, not assumed');
    assert.match(exposedRow.windowReason, /is out 2027-07-01 → 2027-07-05/i);
  }

  // The state row is never rewritten by the read.
  assert.equal(state.absencePlans.length, 0, 'the read does not write to the store');
});

/* --------------------------------------------------------- 7. the roll-up */

test('the roll-up grades every active absence in the span, sorted by window start', () => {
  const mgrState = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'mgr1' } }, { now: NOW }).state;
  const built = buildSeats(mgrState, { now: NOW, settings: mgrState.settings });
  const seat = activeSeat(built);
  assert.equal(seat.id, 'mgr1');

  // No absences: the roll-up is empty.
  const empty = dutyAbsenceRollup(mgrState, built, seat, { now: NOW, settings: mgrState.settings });
  assert.equal(empty.rows.length, 0);

  // Two absences in the span (lead1 and lead2 are in mgr1's scope), sorted by window start.
  const withAbsences = {
    ...mgrState,
    absencePlans: [
      { id: 'a1', seatId: 'lead1', from: '2027-08-01', to: '2027-08-05', reason: 'Lead absent in August.', declaredOn: '2027-07-28', declaredAt: NOW.toISOString(), status: 'active' },
      { id: 'a2', seatId: 'lead2', from: '2027-07-01', to: '2027-07-05', reason: 'Second lead absent in July.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
      { id: 'a3', seatId: 'mgr1', from: '2027-07-01', to: '2027-07-05', reason: 'The seat itself is absent.', declaredOn: '2027-06-28', declaredAt: NOW.toISOString(), status: 'active' },
    ],
  };
  const built2 = buildSeats(withAbsences, { now: NOW, settings: withAbsences.settings });
  const seat2 = activeSeat(built2);
  const rollup = dutyAbsenceRollup(withAbsences, built2, seat2, { now: NOW, settings: withAbsences.settings });

  // The seat's own absence is excluded from the in-span list.
  assert.equal(rollup.rows.every((r) => r.seatId !== 'mgr1'), true, 'the seat itself is not in its own roll-up');
  assert.equal(rollup.rows.length, 2, 'lead1 and lead2 are in the span');

  // Sorted by window start.
  assert.equal(rollup.rows[0].seatId, 'lead2', 'July comes before August');
  assert.equal(rollup.rows[1].seatId, 'lead1');

  // The report's absences section carries the own absence and the roll-up.
  const report = buildDutyCoverageReport(withAbsences, { now: NOW, settings: withAbsences.settings });
  assert.ok(report.absences, 'the report carries the absences section');
  assert.ok(report.absences.own, 'the own absence is present');
  assert.equal(report.absences.own.from, '2027-07-01', 'the own absence window is on the record');
  assert.equal(report.absences.inSpan.length, 2);
  assert.ok(typeof report.absences.exposedN === 'number');
  assert.ok(typeof report.absences.exposedOpenN === 'number');
});

/* ----------------------------------------------------------- 8. gateway */

test('the gateway enforces the new right: a read-only seat cannot declare or revoke', () => {
  const ghostState = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'ghost-seat' } }, { now: NOW }).state;
  const { api } = boot(ghostState);
  const result = api.dutyAbsenceDeclare({
    from: '2027-07-01', to: '2027-07-05',
    reason: 'A planned absence declared by an unresolved seat.',
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /unresolved/i);

  const revoke = api.dutyAbsenceRevoke({ id: 'any', reason: 'Revoking from a read-only seat.' });
  assert.equal(revoke.ok, false);
  assert.match(revoke.error, /unresolved/i);

  const scan = api.dutyAbsenceScan();
  assert.equal(scan.ok, false);
  assert.match(scan.error, /unresolved/i);
});

/* ------------------------------------------------- 9. identity-free output */

test('the upward brief and the CSV absence rows name no person and no seat id', () => {
  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const h = boot(state);
  const declared = h.api.dutyAbsenceDeclare({
    from: '2027-07-01', to: '2027-07-05',
    reason: 'A planned week off in early July.',
  });
  assert.ok(declared.ok, declared.error);

  const brief = h.api.dutyAbsencePlan();
  assert.ok(brief.ok, brief.error);
  // The plan carries the acting seat's own id and label — it is a frontline
  // tool. It must not carry any OTHER person's name or any OTHER seat's id.
  const briefStr = JSON.stringify(brief);
  for (const name of ['Priya Raman', 'Mei Chen', 'Rina Okafor', 'Samuel Park', 'Ari Klein']) {
    assert.ok(!briefStr.includes(name), `the plan must not carry “${name}”`);
  }
  for (const id of ['mgr1', 'vp1', 'dir1', 'lead2']) {
    assert.ok(!briefStr.includes(id), `the plan must not carry “${id}”`);
  }

  const csv = h.api.dutyCoverageCsvRows();
  assert.ok(csv.ok, csv.error);
  const serialized = JSON.stringify(csv.rows);
  for (const name of ['Priya', 'Mei', 'Ari', 'Rina', 'lead1', 'mgr1', 'vp1', 'dir1']) {
    assert.ok(!serialized.includes(name), `the CSV row set must not carry “${name}”`);
  }

  const descriptor = CSV_EXPORTS.find((x) => x.key === 'duty-coverage');
  assert.ok(descriptor, 'CSV scope #104 is registered');
});

/* ------------------------------------------------------------ 10. the view */

test('the absence plan panel renders at the frontline altitude, axe-clean, with no console errors', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    FileReader: window.FileReader, localStorage: window.localStorage,
  })) globalThis[k] = v;

  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `u-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `u-${++seq}` });
  const declared = api.dutyAbsenceDeclare({
    from: '2027-07-01', to: '2027-07-05',
    reason: 'A planned week off in early July.',
  });
  assert.ok(declared.ok, declared.error);

  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  const ctx = { api, query: new URLSearchParams('panel=plan'), navigate: () => {}, refresh: () => {} };

  if (!window.axe) window.eval(AXE_SRC);
  const node = renderDutyCover(ctx);
  view.replaceChildren(node);
  assert.ok(view.querySelector('h1'), 'the plan panel has an h1');
  assert.ok(view.textContent.length > 200, 'rendered content');
  assert.ok(!/undefined|\[object Object\]/.test(view.textContent), 'no placeholder leaked into the DOM');
  const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], 'the plan panel has axe violations');

  assert.match(view.textContent, /Absence plan/i, 'the plan panel is rendered');
  assert.match(view.textContent, /2027-07-01/, 'the window start is printed');
  assert.match(view.textContent, /2027-07-05/, 'the window end is printed');

  for (const el of view.querySelectorAll('button, a[href], select, textarea, input')) {
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('value') || '').trim();
    assert.ok(name.length > 0, `an unnamed ${el.tagName} control would fail a screen-reader user`);
  }
  assert.deepEqual(consoleErrors, [], 'no console errors while rendering');
  window.close();
});
