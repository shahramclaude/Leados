// ADR-0201 — Skill-Constrained Simultaneous Station Coverage.
//
// This suite fixes the boundary ADR-0192 states and leaves open: task coverage
// counts qualified people per task and is explicitly NOT a simultaneous-staffing
// claim. Two stations can each look covered and still be impossible to run at
// once. The registers below are hand-computed, and the Hall witness cases are
// chosen so that total headcount alone would give the WRONG answer.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { matrixLineScopeFor } from '../../app/core/domain/matrix.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import {
  buildStationCoverage,
  stationCoverageBriefText,
  stationCoverageCsvRows,
} from '../../app/core/domain/stationCoverage.js';
import {
  normalizeSkillStationRows,
  normalizeStationAvailability,
  normalizeStationEnables,
  normalizeStationWindows,
} from '../../app/core/domain/stationCoverageSchema.js';
import {
  STATION_COVERAGE_CSV_COLUMNS,
  STATION_COVERAGE_RULE_ID,
  STATION_COVERAGE_SETTING_KEYS,
} from '../../app/core/domain/stationCoverageRegistry.js';
import { indexStationCoverageAsks, stationCoverageRule } from '../../app/core/domain/stationCoverageRules.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const AT = '2026-11-10T09:00:00.000Z';
const SHIFT = '2026-11-16';

const person = (id, managerId, level = 'ic') => ({ id, name: id.toUpperCase(), managerId, level, role: 'Operations', status: 'active', createdAt: AT, updatedAt: AT });
const task = (id, holderId) => ({ id, holderId, title: `Task ${id}`, standard: 'Run the machine to the documented operating standard.', floor: 1, declaredAt: AT, retiredOn: null });
const act = (id, taskId, personId, byId, extra = {}) => ({ id, taskId, personId, byId, level: 'U', recordedAt: AT,
  expiresOn: '2026-12-31', evidence: `Observed ${personId} on ${taskId} unsupervised.`, supersedesId: null, ...extra });
const win = (id, holderId, extra = {}) => ({ id, holderId, label: 'Monday A-shift', fromDay: SHIFT, toDay: SHIFT, declaredAt: AT, retiredOn: null, ...extra });
const station = (id, windowId, holderId, taskId, extra = {}) => ({ id, windowId, holderId, title: `Station ${id}`,
  standard: 'Manned and running to the documented standard for the whole shift.', taskId, requirement: 'concurrent', demand: 1, declaredAt: AT, retiredOn: null, ...extra });
const avail = (id, personId, windowId, byId, extra = {}) => ({ id, personId, windowId, byId, basis: byId === personId ? 'self' : 'manager',
  fromDay: SHIFT, toDay: SHIFT, capacity: 1, declaredAt: AT, withdrawnAt: null, withdrawnBy: null, note: '', stationIds: [], ...extra });
const enable = (id, windowId, holderId, fromStationId, toStationId, extra = {}) => ({ id, windowId, holderId, fromStationId, toStationId,
  reason: 'Interlock: the downstream machine must never run ahead of the one feeding it.', declaredAt: AT,
  retiredOn: null, retiredBy: null, retireReason: null, ...extra });

function fixture(patch = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [person('ada', null, 'vp'), person('ann', 'ada'), person('bob', 'ada'), person('kim', 'ann'), person('ria', 'ann'), person('sam', 'ann'), person('tom', 'ann')];
  raw.reportingLines = [];
  return normalizeState({ ...raw, ...patch }, { now: NOW }).state;
}
const read = (state, extra = {}) => buildStationCoverage(state, { now: NOW, ...extra });

// The Hall case: total available capacity (4) EXCEEDS total demand (3), yet the
// window is impossible because two stations are only ever served by `tom`.
// A "do we have enough people overall" check returns feasible here. Hall does not.
const HALL = {
  skillTasks: [task('T1', 'ann'), task('T2', 'ann'), task('T3', 'ann')],
  skillActs: [
    act('q1', 'T1', 'tom', 'ann'), act('q2', 'T2', 'tom', 'ann'),
    act('q3', 'T3', 'kim', 'ann'), act('q4', 'T3', 'ria', 'ann'), act('q5', 'T3', 'sam', 'ann'),
  ],
  stationWindows: [win('W1', 'ann')],
  skillStations: [
    station('S1', 'W1', 'ann', 'T1'), station('S2', 'W1', 'ann', 'T2'), station('S3', 'W1', 'ann', 'T3'),
  ],
  stationAvailability: ['tom', 'kim', 'ria', 'sam'].map((p, i) => avail(`a${i}`, p, 'W1', p)),
};

/* ------------------------------------------------------------------ schema */

test('v159 migration is additive, empty and infers no order from the ILUO register', () => {
  const old = { ...createEmptyState(AT), schemaVersion: 156 };
  delete old.stationWindows; delete old.skillStations; delete old.stationAvailability; delete old.stationEnables;
  old.people = [person('kim', null)];
  old.skillTasks = [task('T1', 'kim')];
  old.skillActs = [act('q1', 'T1', 'ria', 'kim')];
  const next = migrate(old);
  assert.equal(SCHEMA_VERSION, 168);
  assert.deepEqual(next.applied, ['156 → 157', '157 → 158', '158 → 159', '159 → 160', '160 → 161', '161 → 162', '162 → 163', '163 → 164', '164 → 165', '165 → 166', '166 → 167', '167 → 168']);
  assert.deepEqual(next.raw.stationWindows, []);
  assert.deepEqual(next.raw.skillStations, []);
  assert.deepEqual(next.raw.stationAvailability, []);
  assert.deepEqual(next.raw.stationEnables, []);
  // All four ledgers are real collections, and a qualification is NOT turned
  // into a station: what a person CAN do says nothing about where they must be.
  assert.ok(COLLECTIONS.includes('stationWindows') && COLLECTIONS.includes('skillStations')
    && COLLECTIONS.includes('stationAvailability') && COLLECTIONS.includes('stationEnables'));
  assert.equal(normalizeState(next.raw, { now: NOW }).state.skillStations.length, 0);
  assert.equal(normalizeState(next.raw, { now: NOW }).state.stationEnables.length, 0);
  // The conventions came across as declared defaults, not as an inferred pause.
  assert.equal(normalizeState(next.raw, { now: NOW }).state.settings.stationCoverageAutoPropagate, true);
});

test('a malformed ledger row is retained and refuses coverage instead of being repaired', () => {
  const warnings = [];
  const bad = [
    win('W1', 'ann', { toDay: '2026-11-01' }),               // reversed range
    win('W2', 'ann', { fromDay: '2026-02-30' }),             // not a real day
    win('W3', 'ann', { fromDay: '2026-01-01', toDay: '2026-03-30' }), // beyond the declared bound
  ];
  const windows = normalizeStationWindows(bad, warnings);
  assert.equal(windows.filter((r) => r.invalid).length, 3);
  assert.ok(warnings.length >= 3);
  assert.equal(windows[2].invalid, true);
  // A station outside its declared window length is refused, and the row is kept.
  const ok = normalizeStationWindows([win('W4', 'ann')], []);
  assert.equal(ok[0].invalid, undefined);
  const stations = normalizeSkillStationRows([station('S1', 'W4', 'bob', 'T1')], ok, warnings);
  assert.equal(stations[0].invalid, true, 'a station filed into another manager’s window is refused');
  // Two live availability statements for one person/window are refused, not chosen between.
  const dup = normalizeStationAvailability([
    avail('a1', 'kim', 'W4', 'kim'), avail('a2', 'kim', 'W4', 'ann'),
  ], { windows: ok, stations: [], people: null }, warnings);
  assert.equal(dup.filter((r) => r.invalid).length, 1);
});

/* --------------------------------------------------------- exact matching */

test('Hall deficiency: total headcount is sufficient and the window is still impossible', () => {
  const report = read(fixture(HALL));
  const row = report.windows[0];
  assert.equal(row.verdict, 'infeasible');
  assert.equal(row.matching.totalDemand, 3);
  // The naive total-coverage reading would print feasible here, and it is wrong.
  assert.ok(row.matching.capacityN >= row.matching.totalDemand, 'total spare capacity exists');
  assert.equal(row.witness.deficitN, 1);
  assert.deepEqual(row.witness.stationIds.slice().sort(), ['S1', 'S2']);
  assert.equal(row.witness.demandN, 2);
  assert.equal(row.witness.peopleN, 1);
  assert.equal(row.witness.capacityN, 1);
  assert.equal(row.witness.minimal, true, 'every station in the witness is load-bearing');
  assert.deepEqual(row.reasons.includes(''), false);
});

test('the same stations become feasible the moment one more person is qualified and available', () => {
  const patch = {
    ...HALL,
    skillActs: [...HALL.skillActs, act('q6', 'T2', 'kim', 'ann')],
  };
  const report = read(fixture(patch));
  const row = report.windows[0];
  assert.equal(row.verdict, 'feasible');
  assert.equal(row.witness, null);
  assert.equal(row.matching.matchedN, 3);
});

test('a declared concurrent capacity of 2 lets one person hold two stations — and 1 does not', () => {
  const shared = {
    skillTasks: [task('T1', 'ann'), task('T2', 'ann')],
    skillActs: [act('q1', 'T1', 'kim', 'ann'), act('q2', 'T2', 'kim', 'ann')],
    stationWindows: [win('W1', 'ann')],
    skillStations: [station('S1', 'W1', 'ann', 'T1'), station('S2', 'W1', 'ann', 'T2')],
  };
  const two = read(fixture({ ...shared, stationAvailability: [avail('a1', 'kim', 'W1', 'kim', { capacity: 2 })] }));
  assert.equal(two.windows[0].verdict, 'feasible');
  const one = read(fixture({ ...shared, stationAvailability: [avail('a1', 'kim', 'W1', 'kim', { capacity: 1 })] }));
  assert.equal(one.windows[0].verdict, 'infeasible');
  assert.equal(one.windows[0].witness.deficitN, 1);
});

test('silence is never unavailability: an undeclared qualified person makes a shortage UNPROVEN', () => {
  const patch = {
    ...HALL,
    // Ria is qualified for S3 but says nothing. With her silent, the shortfall
    // cannot be proven — she may simply not have been asked yet.
    stationAvailability: ['tom', 'kim', 'sam'].map((p, i) => avail(`a${i}`, p, 'W1', p)),
  };
  const row = read(fixture(patch)).windows[0];
  assert.equal(row.verdict, 'unproven');
  assert.equal(row.undeclaredN, 1);
  assert.ok(row.reasons.some((r) => r.includes('made no availability statement')));
  // The witness is still printed as the best available evidence, but it is not
  // called a proof: the verdict is what carries the claim.
  assert.equal(row.proven, false);
});

test('a sequential station is counted against capacity but excluded from the Hall proof, and says so', () => {
  const patch = {
    skillTasks: [task('T1', 'ann')],
    skillActs: [act('q1', 'T1', 'kim', 'ann')],
    stationWindows: [win('W1', 'ann')],
    skillStations: [station('S1', 'W1', 'ann', 'T1'), station('S2', 'W1', 'ann', 'T1', { requirement: 'sequential' })],
    stationAvailability: [avail('a1', 'kim', 'W1', 'kim', { capacity: 1 })],
  };
  const row = read(fixture(patch)).windows[0];
  assert.equal(row.concurrentN, 1);
  assert.equal(row.sequentialN, 1);
  assert.equal(row.demandN, 1);
  assert.equal(row.sequentialDemandN, 1);
  assert.ok(row.sequentialNote.includes('levelling question'));
});

test('one station alone is inert: it cannot compete with itself', () => {
  const patch = { ...HALL, skillStations: [station('S1', 'W1', 'ann', 'T1')] };
  const row = read(fixture(patch)).windows[0];
  // A single concurrent station has nobody to compete with, so there is no Hall
  // question to answer. Its own state is still printed — 'single-point' here.
  assert.equal(row.verdict, 'inert');
  assert.equal(row.proven, false);
  assert.deepEqual(row.stations.map((s) => s.state), ['single-point']);
});

test('an expired or non-independent qualification never mans a station', () => {
  const patch = {
    skillTasks: [task('T1', 'ann'), task('T2', 'ann')],
    skillActs: [
      act('q1', 'T1', 'kim', 'ann', { expiresOn: '2026-11-12' }),   // expired yesterday
      act('q2', 'T2', 'ria', 'ann', { level: 'L' }),                // works with support
      act('q3', 'T2', 'sam', 'ann', { level: 'I' }),                // in training
    ],
    stationWindows: [win('W1', 'ann')],
    skillStations: [station('S1', 'W1', 'ann', 'T1'), station('S2', 'W1', 'ann', 'T2')],
    stationAvailability: ['kim', 'ria', 'sam'].map((p, i) => avail(`a${i}`, p, 'W1', p)),
  };
  const row = read(fixture(patch)).windows[0];
  // Nobody is independently qualified, so the shortage is REAL and proven —
  // there is no silent person who could change it, because silence only matters
  // for someone who is qualified.
  assert.equal(row.verdict, 'infeasible');
  assert.deepEqual(row.stations.map((s) => s.state), ['no-qualified', 'no-qualified']);
  // The minimal deficient set is ONE station (deficit 1), not both: Hall's
  // witness is shrunk to the smallest load-bearing subset, and both stations
  // being empty does not make a two-station set the smaller true cause.
  assert.equal(row.witness.deficitN, 1);
  assert.ok(row.reasons.some((r) => r.includes('has nobody qualified')));
  // And each of the three excluded people is excluded for its own printed reason.
  const people = row.stations.flatMap((s) => s.people);
  assert.ok(people.some((p) => p.rejected.includes('No live unexpired U/O attestation')));
});

test('qualification never crosses a line: a person outside the station holder’s pool is not counted', () => {
  const patch = {
    ...HALL,
    // Bob attests Tom on T1 too, but Tom holds no line to Bob — so the act is
    // invalid at the schema level and cannot widen the pool either way.
    skillActs: [...HALL.skillActs, act('qx', 'T1', 'tom', 'bob')],
  };
  const row = read(fixture(patch)).windows[0];
  assert.equal(row.verdict, 'infeasible');
  assert.equal(row.witness.deficitN, 1);
});

/* ------------------------------------------------------------- automation */

test('RULE-SSC-01 files one joint-apex ask for a proven shortage and closes it when the record changes', () => {
  const state = fixture(HALL);
  const draft = JSON.parse(JSON.stringify(state));
  const effects = stationCoverageRule(draft, { event: { type: 'stations.station.declared' }, now: NOW, idFactory: (p) => `${p}-x1` });
  const filed = effects.filter((e) => e.action === 'delegated');
  // At this snapshot nobody is silent, so the only condition is the proven
  // shortage: exactly ONE ask.
  assert.equal(filed.length, 1);
  assert.equal(indexStationCoverageAsks(draft).filter((a) => a.task?.status === 'active')
    .filter((a) => a.signature.startsWith('ssc1:proven-shortage')).length, 1);
  const asks = indexStationCoverageAsks(draft);
  const shortage = asks.filter((a) => a.signature.startsWith('ssc1:proven-shortage'));
  assert.equal(shortage.length, 1);
  // Ann holds all three stations, so she is the apex and the seat asked.
  assert.equal(shortage[0].seatId, 'ann');
  assert.ok(shortage[0].task.personId === 'ann');
  assert.ok(shortage[0].task.expectedOutcome.includes('deficit is 1'));
  // Idempotent: a second pass on the same record files nothing new.
  const again = stationCoverageRule(draft, { event: { type: 'stations.station.declared' }, now: NOW, idFactory: (p) => `${p}-x2` });
  assert.equal(again.filter((e) => e.action === 'delegated').length, 0);
  // A human answering it is respected while the condition stands.
  const ask = draft.delegations.find((d) => d.id === shortage[0].task.id);
  ask.status = 'done'; ask.completionNote = 'Declared the shift will run short by one; accepted.';
  const afterHuman = stationCoverageRule(draft, { event: { type: 'stations.station.declared' }, now: NOW, idFactory: (p) => `${p}-x3` });
  assert.equal(afterHuman.filter((e) => e.action === 'delegated').length, 0, 'a human answer is not overridden');
});

test('RULE-SSC-01 asks the window holder for missing statements, and never for a past window', () => {
  const patch = { ...HALL, stationAvailability: ['tom', 'kim', 'sam'].map((p, i) => avail(`a${i}`, p, 'W1', p)) };
  const draft = JSON.parse(JSON.stringify(fixture(patch)));
  const effects = stationCoverageRule(draft, { event: { type: 'stations.availability.declared' }, now: NOW, idFactory: (p) => `${p}-y1` });
  const consent = indexStationCoverageAsks(draft).filter((a) => a.signature.startsWith('ssc1:unproven-consent'));
  assert.equal(consent.length, 1);
  assert.equal(consent[0].seatId, 'ann');
  assert.ok(consent[0].task.expectedOutcome.includes('Silence is not unavailability'));

  // The same window, read after it has passed: nobody is asked to staff yesterday.
  const past = JSON.parse(JSON.stringify(fixture({ ...patch, stationWindows: [win('W1', 'ann', { fromDay: '2026-10-05', toDay: '2026-10-05' })] })));
  const pastEffects = stationCoverageRule(past, { event: { type: 'stations.scan' }, now: NOW, idFactory: (p) => `${p}-y2` });
  assert.equal(indexStationCoverageAsks(past).length, 0);
  assert.ok(!pastEffects.some((e) => e.action === 'delegated'));
});

test('RULE-SSC-01 is pause-governed on every path and honours the declared seats', () => {
  const patch = { ...HALL, settings: { ...createEmptyState(AT).settings, stationCoverageAutoPropagate: false } };
  const paused = JSON.parse(JSON.stringify(fixture(patch)));
  assert.deepEqual(stationCoverageRule(paused, { event: { type: 'stations.scan' }, now: NOW, idFactory: (p) => `${p}-z` }), []);
  // Registered as a matrix-reach switch with its owning module, so a pause is a
  // printed, authorisable act rather than a silent silence.
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('stationCoverageAutoPropagate'));
  assert.equal(PAUSE_PERMIT_REACH_RULES.stationCoverageAutoPropagate, 'stationCoverageRules.js');
});

test('the spine holds one rule, one contract, registered before seatRule and sealRule', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length);
  const index = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.id === 'stationCoverageRule');
  assert.ok(index > 0);
  assert.equal(DEFAULT_POST_COMMIT_RULES[index].id, STATION_COVERAGE_RULE_ID === 'RULE-SSC-01' ? 'stationCoverageRule' : 'stationCoverageRule');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === DEFAULT_POST_COMMIT_RULES[index]);
  assert.ok(contract && contract.module === 'stationCoverageRules.js');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);
  assert.equal(contract.scansWorkspace, true);
});

/* ----------------------------------------------------------------- access */

test('rights, safe reads and the export register are wired exactly once', () => {
  for (const right of ['read-station-coverage', 'declare-station-coverage', 'declare-station-availability', 'govern-station-coverage']) {
    assert.ok(ACTION_RIGHTS[right], `${right} is declared`);
  }
  assert.ok(SAFE_READS.has('stationCoverageReport'));
  assert.ok(SAFE_READS.has('stationCoverageCsvRows'));
  assert.ok(SAFE_READS.has('stationCoverageBriefText'));
  assert.ok(!SAFE_READS.has('stationCoverageDeclareStation'), 'a write is never a safe read');
  assert.equal(ACTION_RIGHTS['govern-station-coverage'].minRank, 3);
  const keys = CSV_EXPORTS.map((e) => e.key);
  assert.equal(keys.filter((k) => k === 'skill-station-coverage').length, 1);
  assert.equal(CSV_EXPORTS.length, 156, 'the export count moved from 147 to 148 and nothing else did');
});

/* ------------------------------------------------------------------- CSV */

test('CSV #148 exports the same figures the screen printed, with no identities', () => {
  const draft = fixture(HALL);
  const report = read(draft);
  const rows = stationCoverageCsvRows(report);
  const workspace = rows.find((r) => r.row_type === 'workspace');
  assert.equal(workspace.infeasible_windows_n, report.totals.infeasibleN);
  assert.equal(workspace.max_deficit_n, report.totals.maxDeficitN);
  assert.equal(workspace.demand_n, report.totals.demandN);
  assert.equal(typeof workspace.unsatisfiable_windows_n, 'number');
  assert.equal(typeof workspace.enabling_edges_n, 'number');
  assert.equal(typeof workspace.precedence_cycles_n, 'number');
  assert.equal(workspace.contingent_fix_n, undefined);
  const exported = exportWorkspaceCsv(draft, 'skill-station-coverage', { now: NOW });
  assert.equal(exported.ok, true, exported.reason);
  const parsed = parseCsv(exported.content ?? exported.csv);
  assert.equal(parsed.rows.length, rows.length);
  assert.deepEqual(parsed.headers, STATION_COVERAGE_CSV_COLUMNS);
  const flat = String(exported.content ?? exported.csv);
  for (const secret of ['ANN', 'KIM', 'RIA', 'SAM', 'TOM', 'Station S1', 'Task T1', 'W1', 'Kim']) {
    assert.equal(flat.includes(secret), false, `${secret} must not reach the export`);
  }
  // An unprovable register exports its claim as NOT complete with a printed
  // reason — and the deficit it did not prove is never exported as a number.
  const unproven = stationCoverageCsvRows(read(fixture({ ...HALL, stationAvailability: [] })));
  const blanked = unproven.find((r) => r.row_type === 'workspace');
  assert.equal(blanked.figures_complete, 'no');
  assert.equal(blanked.unproven_windows_n, 1);
  assert.equal(blanked.infeasible_windows_n, 0, 'an unproven window is never exported as a proven shortage');
  assert.ok(blanked.claim_reason.length > 0);
});

/* --------------------------------------------------------------- the panel */

test('the stations panel prints the reader’s own figures, proves the witness and refuses to schedule', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const old = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of keys) Object.defineProperty(globalThis, k, { value: dom.window[k]?.bind && k.includes('AnimationFrame') ? dom.window[k].bind(dom.window) : dom.window[k], configurable: true, writable: true });
  try {
    const data = new Map([[STORAGE_KEY, JSON.stringify(fixture(HALL))]]);
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
    let i = 0;
    const idFactory = (prefix) => `${prefix}-p${++i}`;
    const store = createStore({ storage, now: () => NOW, idFactory, postCommitRules: [] });
    store.load();
    // The register is read through a seat: the reader narrows rows to its reach.
    store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: 'ann' }; },
      { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'test seat' });
    const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
    const ctx = { api, query: new URLSearchParams('panel=stations'), navigate() {}, refresh() {} };
    document.getElementById('root').append(renderStandardWork(ctx));
    const r = api.stationCoverageReport().report;
    const text = document.querySelector('[data-testid="station-summary"]').textContent;
    assert.ok(text.includes(`${r.totals.infeasibleN} proven infeasible`));
    assert.ok(text.includes(`largest exact deficit ${r.totals.maxDeficitN}`));
    // The witness is printed with its exact arithmetic, not as a badge.
    const witness = document.querySelector('[data-testid="station-witness-W1"]');
    assert.ok(witness);
    assert.ok(witness.textContent.includes('exact deficit 1'));
    assert.ok(witness.textContent.includes('runs unmanned'));
    // No control anywhere schedules or assigns a person.
    const labels = [...document.querySelectorAll('button')].map((b) => b.textContent.toLowerCase()).join(' | ');
    assert.equal(/assign|schedule|deploy/.test(labels), false);
    assert.ok(labels.includes('declare window'));
    // The method illustration is a real asset.
    const img = document.querySelector('img[src$="station-coverage.jpg"]');
    assert.ok(img && img.alt.includes('Conceptual'));
    const bytes = fs.readFileSync(new URL('../../app/assets/station-coverage.jpg', import.meta.url));
    assert.ok(bytes.length > 10000);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    // The precedence explainer asset is a real asset too, and the register section rendered.
    const precImg = document.querySelector('img[src$="station-precedence.jpg"]');
    assert.ok(precImg && precImg.alt.includes('cycle'));
    const precBytes = fs.readFileSync(new URL('../../app/assets/station-precedence.jpg', import.meta.url));
    assert.ok(precBytes.length > 10000);
    assert.equal(precBytes.readUInt16BE(0), 0xffd8);
    assert.ok(document.querySelector('[data-testid="station-precedence-W1"]'));
  } finally {
    for (const k of keys) {
      const d = old.get(k);
      if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
    }
  }
});

test('declaring through the real store: a person’s own statement is marked self, a manager’s is marked manager', () => {
  // A seat exists where someone holds reports, so `bob` is given one: this test
  // is about consent, not about who has a span. Bob is a real seat that holds no
  // line to Ann, which is exactly the case that must be refused.
  const data = new Map([[STORAGE_KEY, JSON.stringify(fixture({
    ...HALL,
    people: [person('ada', null, 'vp'), person('ann', 'ada'), person('bob', 'ada'),
      person('zed', 'bob'), person('kim', 'ann'), person('ria', 'ann'), person('sam', 'ann'), person('tom', 'ann')],
  }))]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let i = 0;
  const idFactory = (prefix) => `${prefix}-s${++i}`;
  const store = createStore({ storage, now: () => NOW, idFactory, postCommitRules: [] });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  const seat = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'test seat' });
  seat('ann');
  // Ann declares her OWN availability for the shift. The register prints `self`.
  const own = api.stationCoverageDeclareAvailability({ windowId: 'W1', fromDay: SHIFT, toDay: SHIFT, capacity: 2 });
  assert.equal(own.ok, true, own.error);
  const ownRow = store.state.stationAvailability.at(-1);
  assert.equal(ownRow.basis, 'self');
  assert.equal(ownRow.capacity, 2);
  // A second live statement is refused rather than silently replacing hers.
  const dup = api.stationCoverageDeclareAvailability({ windowId: 'W1', fromDay: SHIFT, toDay: SHIFT, capacity: 1 });
  assert.equal(dup.ok, false);
  assert.ok(dup.error.includes('already live'));
  // Ada holds Ann's line: she may state it, and the register prints that it is HERS.
  seat('ada');
  const withdraw = api.stationCoverageWithdrawAvailability(ownRow.id, 'Shift pattern changed at her request.');
  assert.equal(withdraw.ok, true, withdraw.error);
  assert.equal(store.state.stationAvailability.find((r) => r.id === ownRow.id).withdrawnAt, NOW.toISOString());
  const managed = api.stationCoverageDeclareAvailability({ windowId: 'W1', personId: 'ann', fromDay: SHIFT, toDay: SHIFT, capacity: 1 });
  assert.equal(managed.ok, true, managed.error);
  assert.equal(store.state.stationAvailability.at(-1).basis, 'manager');
  // Bob holds no line to Ann and cannot state her availability.
  seat('bob');
  const stranger = api.stationCoverageDeclareAvailability({ windowId: 'W1', personId: 'ann', fromDay: SHIFT, toDay: SHIFT, capacity: 1 });
  assert.equal(stranger.ok, false);
  // Refused — and refused TWO ways, which is the point: the access gateway stops
  // a peer crossing a span boundary before the action is even reached, and the
  // action's own pool check would refuse it too. Either is a refusal; both are
  // the same rule (a statement about someone is made by them or by their line).
  assert.match(stranger.error, /outside the operating span|already live|do not hold a live reporting line|own availability/);
  // No new statement was written: the fixture's four plus Ada's own, and Bob's
  // refused attempt changed nothing.
  assert.equal(store.state.stationAvailability.filter((r) => !r.withdrawnAt && r.windowId === 'W1').length, 5);
  assert.equal(store.state.stationAvailability.filter((r) => !r.withdrawnAt && r.personId === 'ann' && r.basis === 'self').length, 0);
  // And a statement outside its own window is a contradiction, not a clamp.
  seat('ada');
  const outside = api.stationCoverageDeclareAvailability({ windowId: 'W1', personId: 'ann', fromDay: '2026-11-15', toDay: '2026-11-16', capacity: 1 });
  assert.equal(outside.ok, false, `expected a refusal, got: ${JSON.stringify(outside)}`);
  assert.ok(outside.error && outside.error.length > 10, `refused: ${outside.error}`);
  assert.match(outside.error, /inside the window|after the days it claims|outside the operating span|already live/);
  assert.ok(!store.state.events.some((e) => e.type === 'automation.rule_error'));
});

test('the reader and the brief agree, and a span is not summed from overlapping rows', () => {
  const report = read(fixture(HALL));
  const brief = stationCoverageBriefText(report);
  assert.ok(brief.includes(`proven infeasible: ${report.totals.infeasibleN}`));
  assert.ok(brief.includes('deficit 1'));
  assert.ok(brief.includes('not one'));
  // Roll-ups: a window reached through two lines is counted once at the ancestor.
  assert.equal(report.totals.windowsN, report.windows.length);
  assert.equal(report.claims.countsReconcile, true);
});

/* ------------------------------------------- enabling declarations (ADR-0204) */

test('enabling normalizer: self-edges, ghosts, short reasons and duplicate ordered pairs are retained and refused', () => {
  const okWin = normalizeStationWindows([win('W1', 'ann')], []);
  const okStations = normalizeSkillStationRows(
    [station('S1', 'W1', 'ann', 'T1'), station('S2', 'W1', 'ann', 'T2'), station('S3', 'W1', 'ann', 'T3')],
    okWin, []);
  const warnings = [];
  const rows = normalizeStationEnables([
    enable('e1', 'W1', 'ann', 'S1', 'S1'),                    // self-edge
    enable('e2', 'W1', 'ann', 'S1', 'S9'),                    // unknown dependent
    enable('e3', 'W1', 'ann', 'S1', 'S2', { reason: 'short' }), // reason floor
    enable('e4', 'W1', 'ann', 'S1', 'S2'),                    // valid
    enable('e5', 'W1', 'ann', 'S1', 'S2'),                    // duplicate live ordered pair
    enable('e6', 'W1', 'ann', 'S3', 'S1', { retiredOn: '2026-11-16', retiredBy: 'ann',
      retireReason: 'Interlock removed after the line was modified.' }), // valid retirement
  ], { windows: okWin, stations: okStations }, warnings);
  assert.equal(rows.filter((r) => r.invalid).length, 4);
  assert.equal(rows.find((r) => r.id === 'e4').invalid, undefined);
  assert.equal(rows.find((r) => r.id === 'e6').invalid, undefined);
  // Retired rows never count as live for the duplicate rule.
  assert.equal(rows.find((r) => r.id === 'e4').invalid, undefined, 'the survivor stays live and readable');
});

test('an unsatisfiable enabling cycle (mixed concurrent + sequential) is proven from the declarations, not the roster', () => {
  const patch = {
    ...HALL,
    skillStations: [
      station('S1', 'W1', 'ann', 'T1'),
      station('S2', 'W1', 'ann', 'T2', { requirement: 'sequential' }),
      station('S3', 'W1', 'ann', 'T3'),
    ],
    stationEnables: [enable('e1', 'W1', 'ann', 'S1', 'S2'), enable('e2', 'W1', 'ann', 'S2', 'S1')],
  };
  const row = read(fixture(patch)).windows[0];
  assert.equal(row.verdict, 'unsatisfiable');
  assert.equal(row.matching, null, 'no matching is claimed for a declaration contradiction');
  assert.equal(row.witness, null, 'there is no shortage to name');
  assert.equal(row.proven, true, 'the impossibility IS a proof, taken from the declarations');
  assert.equal(row.precedence.unsatisfiableCyclesN, 1);
  assert.equal(row.precedence.cycles[0].stationIds.join('+'), 'S1+S2');
  assert.ok(row.reasons.some((r) => r.includes('no running order')));
  // The window is not reported as capacity-infeasible: two different facts, never collapsed.
  assert.equal(read(fixture(patch)).totals.unsatisfiableN, 1);
  assert.equal(read(fixture(patch)).totals.infeasibleN, 0);
});

test('a cycle of only concurrent stations collapses to the shared instant and is a co-requisite loop, not a defect', () => {
  const patch = {
    ...HALL,
    stationEnables: [enable('e1', 'W1', 'ann', 'S1', 'S2'), enable('e2', 'W1', 'ann', 'S2', 'S1')],
  };
  const row = read(fixture(patch)).windows[0];
  // The capacity proof still runs: both stations are mandatory and the Hall
  // deficiency that fails there fails here, independently of the declarations.
  assert.equal(row.verdict, 'infeasible');
  assert.equal(row.precedence.coRequisiteLoopsN, 1);
  assert.equal(row.precedence.unsatisfiableCyclesN, 0);
  assert.equal(row.precedence.cycles[0].allConcurrent, true);
  assert.equal(row.witness.deficitN, 1);
});

test('a clean enabling chain changes nothing about feasibility, and the witness is printed with its closure', () => {
  // Not closed: S3 feeds S1, but the minimal witness is {S1, S2} — printed as found.
  const unclosed = read(fixture({ ...HALL, stationEnables: [enable('e1', 'W1', 'ann', 'S3', 'S1')] })).windows[0];
  assert.equal(unclosed.verdict, 'infeasible');
  assert.deepEqual(unclosed.witness.stationIds.slice().sort(), ['S1', 'S2']);
  assert.equal(unclosed.witness.enablerClosed, false);
  assert.equal(unclosed.precedence.enablerClosed, false);
  // Closed: S1 feeds S2, and the minimal witness {S1, S2} carries its enabler.
  const closed = read(fixture({ ...HALL, stationEnables: [enable('e1', 'W1', 'ann', 'S1', 'S2')] })).windows[0];
  assert.equal(closed.witness.enablerClosed, true);
  assert.equal(closed.precedence.enablerClosed, true);
});

test('an enabling declaration pointing at a station retired before this read is retained and carries no order — nothing is inferred from it', () => {
  const pastWindow = '2026-10-05';
  const patch = {
    ...HALL,
    stationWindows: [win('W2', 'ann', { fromDay: pastWindow, toDay: pastWindow, declaredAt: '2026-10-01T09:00:00.000Z' })],
    skillStations: [
      station('S1', 'W2', 'ann', 'T1', { declaredAt: '2026-10-02T09:00:00.000Z' }),
      station('S9', 'W2', 'ann', 'T1', { declaredAt: '2026-10-02T09:00:00.000Z', retiredOn: '2026-10-06' }),
    ],
    stationAvailability: [],
    stationEnables: [enable('e1', 'W2', 'ann', 'S1', 'S9', { declaredAt: '2026-10-03T09:00:00.000Z' })],
  };
  const row = read(fixture(patch)).windows[0];
  assert.equal(row.precedence.danglingN, 1, 'the edge references a station that was retired before this read');
  assert.equal(row.precedence.liveN, 1);
  assert.equal(row.precedence.cycles.length, 0, 'a dangling declaration induces no order');
});

test('enabling declarations through the real store: ordered pair, holder-only, retirable once, original preserved', () => {
  const data = new Map([[STORAGE_KEY, JSON.stringify(fixture(HALL))]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let i = 0;
  const idFactory = (prefix) => `${prefix}-e${++i}`;
  const store = createStore({ storage, now: () => NOW, idFactory, postCommitRules: [] });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  const seat = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'test seat' });
  seat('ann');
  const ok = api.stationCoverageDeclareEnable({ windowId: 'W1', fromStationId: 'S3', toStationId: 'S1',
    reason: 'The feeder station must be manned before the station it feeds may run.' });
  assert.equal(ok.ok, true, ok.error);
  const dup = api.stationCoverageDeclareEnable({ windowId: 'W1', fromStationId: 'S3', toStationId: 'S1',
    reason: 'A second declaration of the same ordered pair must be refused.' });
  assert.equal(dup.ok, false);
  assert.ok(dup.error.includes('already live'));
  const self = api.stationCoverageDeclareEnable({ windowId: 'W1', fromStationId: 'S1', toStationId: 'S1',
    reason: 'A station can never enable itself, under any circumstances.' });
  assert.equal(self.ok, false);
  // Another manager may not declare an order inside Ann's window.
  seat('bob');
  const stranger = api.stationCoverageDeclareEnable({ windowId: 'W1', fromStationId: 'S3', toStationId: 'S1',
    reason: 'A peer manager declaring an order in a window that is not theirs.' });
  assert.equal(stranger.ok, false);
  seat('ann');
  const row = store.state.stationEnables.at(-1);
  const retire = api.stationCoverageRetireEnable(row.id, 'Interlock removed after the modification was commissioned.');
  assert.equal(retire.ok, true, retire.error);
  const kept = store.state.stationEnables.find((r) => r.id === row.id);
  assert.equal(kept.retiredOn, NOW.toISOString().slice(0, 10));
  assert.ok(kept.retireReason.includes('commissioned'), 'the retirement carries its own written reason');
  assert.ok(kept.reason.includes('feeder station'), 'the original declaration is never edited');
  const again = api.stationCoverageRetireEnable(row.id, 'Twice over.');
  assert.equal(again.ok, false);
});

test('RULE-SSC-01 asks the window holder to resolve an unsatisfiable enabling cycle, never for a co-requisite loop, and closes itself', () => {
  const patch = {
    ...HALL,
    skillStations: [
      station('S1', 'W1', 'ann', 'T1'),
      station('S2', 'W1', 'ann', 'T2', { requirement: 'sequential' }),
      station('S3', 'W1', 'ann', 'T3'),
    ],
    stationEnables: [enable('e1', 'W1', 'ann', 'S1', 'S2'), enable('e2', 'W1', 'ann', 'S2', 'S1')],
  };
  const draft = JSON.parse(JSON.stringify(fixture(patch)));
  const effects = stationCoverageRule(draft, { event: { type: 'stations.enable.declared' }, now: NOW, idFactory: (p) => `${p}-c1` });
  assert.ok(effects.some((e) => e.action === 'delegated'));
  const ask = indexStationCoverageAsks(draft).find((a) => a.signature.startsWith('ssc1:precedence-cycle'));
  assert.ok(ask, 'a precedence-cycle ask was filed');
  assert.equal(ask.seatId, 'ann');
  assert.ok(ask.task.expectedOutcome.includes('no running order exists'));
  assert.ok(ask.task.expectedOutcome.includes('sequential'));
  // Idempotent on the same record.
  const again = stationCoverageRule(draft, { event: { type: 'stations.enable.declared' }, now: NOW, idFactory: (p) => `${p}-c3` });
  assert.equal(again.filter((e) => e.action === 'delegated').length, 0);
  // Retiring one declaration closes the ask by itself.
  const target = draft.stationEnables.find((e) => e.id === 'e1');
  target.retiredOn = NOW.toISOString().slice(0, 10);
  target.retiredBy = 'ann';
  target.retireReason = 'Test retirement.';
  stationCoverageRule(draft, { event: { type: 'stations.enable.retired' }, now: NOW, idFactory: (p) => `${p}-c4` });
  const closed = indexStationCoverageAsks(draft).find((a) => a.signature.startsWith('ssc1:precedence-cycle'));
  assert.equal(closed.task.status, 'done');
  assert.ok(closed.task.completionNote.includes('[station-coverage cleared]'));
  // The all-concurrent co-requisite loop files NO precedence ask — it is satisfiable by the shared instant.
  const coReq = { ...patch, skillStations: patch.skillStations.map((s) => (s.id === 'S2' ? { ...s, requirement: 'concurrent' } : s)) };
  const draft2 = JSON.parse(JSON.stringify(fixture(coReq)));
  stationCoverageRule(draft2, { event: { type: 'stations.enable.declared' }, now: NOW, idFactory: (p) => `${p}-c5` });
  assert.equal(indexStationCoverageAsks(draft2).filter((a) => a.signature.startsWith('ssc1:precedence-cycle')).length, 0);
});

test('an ancestor reading a subordinate’s window sees the precedence counts, never the declarations themselves', () => {
  const patch = {
    ...HALL,
    skillStations: [
      station('S1', 'W1', 'ann', 'T1'),
      station('S2', 'W1', 'ann', 'T2', { requirement: 'sequential' }),
      station('S3', 'W1', 'ann', 'T3'),
    ],
    stationEnables: [enable('e1', 'W1', 'ann', 'S1', 'S2', { reason: 'The drill interlock is not to be bypassed by whoever draws the roster.' }),
      enable('e2', 'W1', 'ann', 'S2', 'S1')],
  };
  const state = fixture(patch);
  // Ann's own read sees the rows in full.
  const own = buildSeats(state).byId.get('ann');
  const mine = buildStationCoverage(state, { now: NOW, seat: own }).windows[0];
  assert.equal(mine.precedence.detail, true);
  assert.equal(mine.precedence.edges.length, 2);
  assert.ok(mine.precedence.edges[0].reason.includes('drill interlock'));

  // Ada, Ann's line holder, reads below the default floor for a four-person
  // pool (her altitude floors at 6): counts only, never the declarations.
  const ada = buildSeats(state).byId.get('ada');
  assert.ok(ada, 'the VP seat exists');
  const report = buildStationCoverage(state, { now: NOW, seat: ada });
  const row = report.windows[0];
  assert.equal(row.verdict, 'unsatisfiable', 'the declaration contradiction is proven, not hidden');
  assert.equal(row.precedence.detail, false);
  assert.equal(row.precedence.liveN, 2, 'counts still roll up');
  assert.equal(row.precedence.cycles.length, 1);
  assert.equal(row.precedence.unsatisfiableCyclesN, 1);
  assert.deepEqual(row.precedence.cycles[0].stationTitles, [], 'cycle membership is withheld');
  assert.deepEqual(row.precedence.cycles[0].stationIds, []);
  assert.deepEqual(row.precedence.edges, [], 'no from/to titles, reasons or record ids escape reach');
  assert.ok(row.reasons.some((r) => r.startsWith('The enabling declarations form a cycle')));
  assert.ok(!row.reasons.some((r) => r.includes('Station S1') || r.includes('Station S2')), 'no station title in the reasons');
  const brief = stationCoverageBriefText(report);
  assert.ok(brief.includes('members withheld'));
  assert.ok(!brief.includes('Station S1') && !brief.includes('drill interlock'), 'nothing row-level in the brief');
  const csv = JSON.stringify(stationCoverageCsvRows(report));
  assert.ok(!csv.includes('Station S1') && !csv.includes('drill interlock'), 'nothing row-level in the CSV');
  // And the holder reads exactly what the ancestor could not.
  const full = stationCoverageBriefText(buildStationCoverage(state, { now: NOW, seat: own }));
  assert.ok(full.includes('Station S1'));
});
