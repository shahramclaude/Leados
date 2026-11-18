// ADR-0251: exact single-loss matching, honest refusals and seat scope, and a
// real write → persist → reload → guarded read → DOM & CSV comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApi } from '../../app/actions.js';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { buildStationCoverage } from '../../app/core/domain/stationCoverage.js';
import { solveSingleAbsence } from '../../app/core/domain/stationCoverageFlow.js';
import { STATION_ABSENCE_STATES } from '../../app/core/domain/stationCoverageRegistry.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const AT = '2026-11-16T09:00:00.000Z';
const FROM = '2026-11-19';
const TO = '2026-11-20';
const STATION_IDS = ['station-alpha-private', 'station-beta-private'];
const TITLES = ['Private packing cell', 'Private quality cell'];
const WINDOW_ID = 'window-private-alpha';
const LABEL = 'Private Friday line';
const IDs = ['kim', 'ria', 'sam'];
const person = (id, managerId, level = 'ic') => ({ id, name: `Private person ${id}`, managerId, level, status: 'active', createdAt: AT, updatedAt: AT });
const task = (i) => ({ id: `task-${i}`, holderId: 'ann', title: `Task ${i}`, standard: 'Run to the documented operating standard.', floor: 1, declaredAt: AT, retiredOn: null });
const act = (i, p, patch = {}) => ({ id: `q-${i}-${p}`, taskId: `task-${i}`, personId: p, byId: 'ann', level: 'U', recordedAt: AT,
  expiresOn: TO, evidence: 'Observed unaided at the station on its standard.', supersedesId: null, ...patch });
const windowRow = (id = WINDOW_ID, patch = {}) => ({ id, label: LABEL, holderId: 'ann', fromDay: FROM, toDay: TO, declaredAt: AT, retiredOn: null, ...patch });
const station = (i, patch = {}) => ({ id: STATION_IDS[i], title: TITLES[i], windowId: WINDOW_ID, holderId: 'ann', taskId: `task-${i}`,
  standard: 'Manned and running to standard throughout the declared window.', requirement: 'concurrent', demand: 1, declaredAt: AT, retiredOn: null, ...patch });
const availability = (p, patch = {}) => ({ id: `avail-${p}`, personId: p, byId: p, windowId: WINDOW_ID, basis: 'self', fromDay: FROM, toDay: TO,
  capacity: 1, declaredAt: AT, withdrawnAt: null, withdrawnBy: null, note: '', stationIds: [], ...patch });

function fixture({ qualified = IDs.slice(0, 2), available = IDs.slice(0, 2), borrowed = false, patch = {} } = {}) {
  const state = createEmptyState(AT);
  state.people = [person('ada', null, 'vp'), person('ann', 'ada'), person('bob', 'ada'),
    ...IDs.map((p) => person(p, p === 'sam' && borrowed ? 'bob' : 'ann'))];
  state.settings = { ...state.settings, activeSeatId: 'ann' };
  state.skillTasks = [task(0), task(1)];
  state.skillActs = [0, 1].flatMap((i) => qualified.map((p) => act(i, p)));
  state.stationWindows = [windowRow()];
  state.skillStations = [station(0), station(1)];
  state.stationAvailability = available.map((p) => availability(p));
  if (borrowed) state.reportingLines = [
    { id: 'rl-kim', personId: 'kim', managerId: 'bob', kind: 'project', fromISO: '2026-11-16', declaredAt: AT },
    { id: 'rl-sam', personId: 'sam', managerId: 'ann', kind: 'project', fromISO: '2026-11-16', declaredAt: AT },
  ];
  return normalizeState({ ...state, ...patch }, { now: NOW }).state;
}

const coverage = (state, extra) => buildStationCoverage(state, { now: NOW, ...extra });
const absence = (state, extra) => coverage(state, extra).singleAbsence.rows[0];

// independent exhaustive allocator: fill or skip each station/person pair,
// remembering remaining capacity and per-station demand, not residual arcs.
function oracle(stations, capacities, omit) {
  const pairs = stations.flatMap(({ eligible }, i) => [...eligible].filter((p) => p !== omit).map((p) => [i, p]));
  const demand = stations.map((s) => s.demand);
  const remaining = new Map(capacities);
  function search(k) {
    if (k === pairs.length) return 0;
    const [s, p] = pairs[k];
    let best = search(k + 1);
    if (demand[s] && remaining.get(p)) {
      demand[s] -= 1;
      remaining.set(p, remaining.get(p) - 1);
      best = Math.max(best, 1 + search(k + 1));
      remaining.set(p, remaining.get(p) + 1);
      demand[s] += 1;
    }
    return best;
  }
  return search(0);
}

test('the residual sweep matches an independent allocator on every 3 × 3 eligibility graph at multiple demands and capacities', () => {
  for (let mask = 0; mask < 512; mask += 1) {
    for (const capacity of [1, 2]) for (const firstDemand of [1, 2]) {
      const stations = [0, 1, 2].map((i) => ({
        stationId: `s${i}`, demand: i === 0 ? firstDemand : 1,
        eligible: new Set(IDs.filter((_, j) => mask & (1 << (3 * i + j)))),
      }));
      const capacities = new Map(IDs.map((p, i) => [p, i === 0 ? capacity : 1]));
      const result = solveSingleAbsence(stations, capacities, { remaining: 100_000 });
      const demand = firstDemand + 2;
      const baseline = oracle(stations, capacities);
      const label = `graph ${mask}, first demand ${firstDemand}, capacity ${capacity}`;
      if (baseline !== demand) {
        assert.deepEqual(result, { ok: false, reason: 'baseline' }, label);
        continue;
      }
      const gaps = IDs.map((id) => demand - oracle(stations, capacities, id));
      const maximum = Math.max(...gaps);
      assert.equal(result.ok, true, label);
      assert.equal(result.testedN, IDs.length, label);
      assert.equal(result.fillableN, gaps.filter((n) => n === 0).length, label);
      assert.equal(result.shortfallN, gaps.filter((n) => n > 0).length, label);
      assert.equal(result.worst?.deficitN ?? 0, maximum, label);
      if (result.worst) assert.equal(result.worst.demandN - result.worst.capacityN, maximum, label);
    }
  }
});

test('a multi-capacity candidate cannot fill two places at the same station, and a cut proves the exact gap', () => {
  const stations = [
    { stationId: 's1', demand: 2, eligible: new Set(['kim', 'ria']) },
    { stationId: 's2', demand: 1, eligible: new Set(['ria', 'sam']) },
  ];
  const result = solveSingleAbsence(stations, new Map([['kim', 1], ['ria', 3], ['sam', 1]]), { remaining: 100_000 });
  assert.equal(result.shortfallN, 2);
  assert.equal(result.fillableN, 1);
  assert.equal(result.worst.deficitN, 1);
  assert.equal(result.worst.demandN, result.worst.capacityN + 1);
  assert.ok(result.worst.stationIds.includes('s1'));
});

test('the work budget never returns partial results', () => {
  const stations = [{ stationId: 's1', demand: 1, eligible: new Set(['kim']) }, { stationId: 's2', demand: 1, eligible: new Set(['ria']) }];
  const capacity = new Map([['kim', 1], ['ria', 1]]);
  // This admits the tiny graph and its feasible baseline but cuts off the sweep.
  const budget = { remaining: 50 };
  assert.deepEqual(solveSingleAbsence(stations, capacity, budget), { ok: false, reason: 'limit' });
  assert.equal(budget.remaining, 0);
});

test('coverage at each station does not prove resilience across both stations', () => {
  const report = coverage(fixture());
  assert.equal(report.windows[0].verdict, 'feasible');
  assert.ok(report.windows[0].stations.every((r) => r.state === 'covered'));
  const result = report.singleAbsence;
  assert.deepEqual(result.counts, { tolerant: 0, exposed: 1, unproven: 0, withheld: 0, 'not-tested': 0 });
  assert.equal(result.countsReconcile, true);
  assert.equal(result.evidenceComplete, true);
  assert.deepEqual(result.rows[0].evidence, { testedN: 2, fillableN: 0, shortfallN: 2, missingN: 0,
    worst: { deficitN: 1, demandN: 2, capacityN: 1, stationTitles: TITLES } });
});

test('an additional active reporting line adds eligibility where real, never a second copy of a shared person', () => {
  const settings = { qualified: IDs, available: IDs };
  const single = absence(fixture(settings));
  const matrix = absence(fixture({ ...settings, borrowed: true }));
  assert.deepEqual(matrix, single);
  assert.equal(matrix.status, 'tolerant');
  assert.deepEqual(matrix.evidence, { testedN: 3, fillableN: 3, shortfallN: 0, missingN: 0, worst: null });

  const state = fixture({ ...settings, borrowed: true });
  state.reportingLines = state.reportingLines.filter((line) => line.personId !== 'sam');
  assert.equal(absence(state).status, 'exposed', 'a person on another line is not substituted without a real live edge');
  assert.equal(absence(state).evidence.testedN, 2);
});

test('withdrawn or part-window availability does not convert silence to absence', () => {
  for (const third of [null, availability('sam', { toDay: FROM }), availability('sam', { withdrawnAt: NOW.toISOString(), withdrawnBy: 'sam' })]) {
    const row = absence(fixture({ qualified: IDs, patch: { stationAvailability: [availability('kim'), availability('ria'), ...(third ? [third] : [])] } }));
    assert.equal(row.status, 'unproven');
    assert.equal(row.evidence.testedN, 2);
    assert.equal(row.evidence.shortfallN, 2);
    assert.equal(row.evidence.missingN, 1);
    assert.equal(row.evidence.worst.deficitN, 1);
    assert.match(row.reason, /before calling it a shortage/u);
  }
});

test('exact coverage can be proved with enough recorded cover even if another candidate has not answered', () => {
  const state = fixture({ qualified: IDs, available: IDs });
  state.people.push(person('fourth', 'ann'));
  state.skillActs.push(act(0, 'fourth'), act(1, 'fourth'));
  const row = absence(state);
  assert.equal(row.status, 'tolerant');
  assert.equal(row.evidence.testedN, 3);
  assert.equal(row.evidence.missingN, 1);
});

test('skills that lapse before the window end are excluded; future or invalid evidence cannot masquerade as cover', () => {
  const expiring = fixture({ qualified: IDs, available: IDs,
    patch: { skillActs: [0, 1].flatMap((i) => IDs.map((p) => act(i, p, { expiresOn: p === 'sam' ? FROM : TO }))) } });
  assert.equal(absence(expiring).status, 'exposed');
  assert.equal(absence(expiring).evidence.testedN, 2);
  const allExpire = fixture({ patch: { skillActs: [0, 1].flatMap((i) => ['kim', 'ria'].map((p) => act(i, p, { expiresOn: FROM }))) } });
  assert.equal(coverage(allExpire).windows[0].verdict, 'feasible', 'the original baseline is a distinct inference');
  assert.match(absence(allExpire).reason, /baseline demand using qualifications valid through the window end/u);
  assert.equal(absence(allExpire).evidence, null);

  for (const badAct of [{ recordedAt: '2026-11-18T10:00:00.000Z' }, { level: 'invented' }]) {
    const state = fixture();
    const old = state.skillActs[0];
    state.skillActs.push({ ...old, id: 'new-qualification', supersedesId: old.id, ...badAct });
    assert.match(absence(state).reason, /unreadable or future-dated evidence/u);
    assert.equal(absence(state).evidence, null);
  }
});

test('a missing or pending prerequisite never yields a clean single-absence result', () => {
  const prerequisite = windowRow('feeder', { label: 'Private feeder line' });
  const feeder = station(0, { id: 'feeder-station', windowId: prerequisite.id });
  const edge = {
    id: 'private-feed-link', fromWindowId: 'feeder', fromStationId: 'feeder-station', toWindowId: WINDOW_ID, toStationId: STATION_IDS[0],
    byId: 'ann', basis: 'joint-apex', reason: 'The feeder must be ready before packing begins.', declaredAt: AT,
    retiredOn: null, retiredBy: null, retireReason: null,
  };
  // Neither window is earlier: the calendar cannot prove the prerequisite.
  const state = fixture({ patch: {
    stationWindows: [windowRow(), prerequisite], skillStations: [station(0), station(1), feeder], stationWindowEnables: [edge],
  } });
  const report = coverage(state);
  assert.equal(report.windows[0].feed.status, 'ambiguous');
  const row = report.singleAbsence.rows.find((r) => r.windowId === WINDOW_ID);
  assert.equal(row.status, 'unproven');
  assert.match(row.reason, /prerequisite cannot be confirmed/u);
  assert.equal(row.evidence, null);
});

test('one-station, past and retired windows do not become positive absence proofs', () => {
  const state = fixture({ patch: {
    stationWindows: [windowRow(), windowRow('past', { fromDay: '2026-11-17', toDay: '2026-11-17' }),
      windowRow('retired', { fromDay: '2026-11-18', toDay: '2026-11-18', retiredOn: '2026-11-18' })],
    skillStations: [station(0), station(1, { requirement: 'sequential' })],
  } });
  const check = coverage(state).singleAbsence;
  assert.equal(check.windowsN, 1);
  assert.equal(check.rows[0].status, 'not-tested');
  assert.match(check.rows[0].reason, /two simultaneous stations/u);
  assert.equal(check.evidenceComplete, false);
  assert.equal(check.countsReconcile, true);
});

test('roll-up narrows to the seat, withholds below the floor and never publishes individual scenario detail above it', () => {
  const ancestor = { nodeId: 'ada', scope: new Set(['ann']), lineScope: new Set() };
  const read = (state) => absence(state, { seat: ancestor });
  const small = read(fixture());
  assert.equal(small.status, 'withheld');
  assert.equal(small.evidence, null);
  const enough = read(fixture({ qualified: IDs, available: IDs }));
  assert.equal(enough.status, 'tolerant');
  assert.equal(enough.evidence, null);
  const outside = coverage(fixture(), { seat: { nodeId: 'bob', scope: new Set() } }).singleAbsence;
  assert.equal(outside.windowsN, 0);
  assert.equal(outside.evidenceComplete, false);
});

function storageFor(state) {
  const saved = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  return { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, String(v)), removeItem: (k) => saved.delete(k) };
}

function open(storage) {
  const idFactory = (prefix) => `${prefix}-new`;
  const store = createStore({ storage, now: () => NOW, idFactory, postCommitRules: [] });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, api };
}

function withDom(fn) {
  const { window } = new JSDOM('<!DOCTYPE html><html><body><main></main></body></html>', { url: 'https://local.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node'];
  const previous = keys.map((k) => Object.getOwnPropertyDescriptor(globalThis, k));
  for (const k of keys) Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
  try { fn(window.document); }
  finally {
    window.close();
    keys.forEach((k, i) => { if (previous[i]) Object.defineProperty(globalThis, k, previous[i]); else delete globalThis[k]; });
  }
}

function assertSurfaces(opened, storage, expected) {
  const { store, api } = opened;
  const storedBytes = storage.getItem(STORAGE_KEY);
  const persisted = JSON.parse(storedBytes);
  const read = api.stationCoverageReport();
  assert.equal(read.ok, true, read.error);
  assert.equal('internal' in read.report, false, 'the public report never returns raw engine inputs');
  const computed = coverage(persisted).singleAbsence;
  assert.deepEqual(read.report.singleAbsence, computed);
  const [row] = computed.rows;
  const labels = Object.fromEntries(STATION_ABSENCE_STATES.map(({ key, label }) => [key, label]));
  assert.equal(row.status, expected);

  withDom((document) => {
    document.querySelector('main').append(renderStandardWork({ api, query: new URLSearchParams('panel=stations'), refresh() {}, navigate() {} }));
    const root = document.querySelector('[data-testid="station-absence-check"]');
    const displayed = root.querySelector(`[data-testid="station-absence-${WINDOW_ID}"]`);
    const { evidence: e } = row;
    assert.equal(displayed.cells[1].textContent, labels[expected]);
    assert.ok(displayed.cells[2].textContent.includes(row.reason));
    assert.equal(displayed.querySelector('[data-testid="station-absence-scenarios"]').textContent,
      `${e.testedN} absence case(s): ${e.fillableN} covered, ${e.shortfallN} short on recorded cover. ${e.missingN} qualified candidate(s) without covering availability.`);
    const witness = displayed.querySelector('[data-testid="station-absence-witness"]');
    if (e.worst) {
      assert.equal(witness.textContent, `Worst recorded shortfall: ${e.worst.deficitN}. Bottleneck: ${e.worst.stationTitles.join(', ')}. ${e.worst.demandN} required; ${e.worst.capacityN} coverable at most.`);
    } else assert.equal(witness, null);
    const counts = root.querySelector('[data-testid="station-absence-counts"]').textContent;
    assert.ok(counts.startsWith(`${computed.windowsN} live window(s)`));
    for (const [key, n] of Object.entries(computed.counts)) assert.ok(counts.includes(`${labels[key]}: ${n}`));
    const claims = root.querySelector('[data-testid="station-absence-claims"]').textContent;
    assert.equal(claims, `Window counts reconcile: yes. Evidence supports a definite result for every listed live window: ${computed.evidenceComplete ? 'yes' : 'no'}.`);
  });

  const guarded = api.stationCoverageCsvRows();
  assert.equal(guarded.ok, true, guarded.error);
  const file = exportWorkspaceCsv(persisted, 'skill-station-coverage', { now: NOW });
  assert.equal(file.ok, true, file.reason);
  const parsed = parseCsv(file.csv);
  const rows = parsed.rows.map((r) => Object.fromEntries(parsed.headers.map((h, i) => [h, r[i]])));
  assert.equal(rows[0].absence_windows_n, String(computed.windowsN));
  assert.equal(rows[0].absence_counts_reconcile, 'yes');
  assert.equal(rows[0].absence_evidence_complete, computed.evidenceComplete ? 'yes' : 'no');
  for (const [key, n] of Object.entries(computed.counts)) {
    assert.equal(rows.find((r) => r.row_type === 'single-absence-status' && r.key === key).absence_windows_n, String(n));
    assert.equal(guarded.rows.find((r) => r.row_type === 'single-absence-status' && r.key === key).absence_windows_n, n);
  }
  for (const secret of [...TITLES, LABEL, WINDOW_ID, ...STATION_IDS, 'Private person']) assert.equal(file.csv.includes(secret), false);
  assert.match(api.stationCoverageBriefText().text, new RegExp(`single absence — ${labels[expected]}`, 'u'));
  assert.equal(storage.getItem(STORAGE_KEY), storedBytes);
  assert.equal(store.state.stationAvailability.length, persisted.stationAvailability.length);
}

test('guarded availability changes the exact persisted → computed → DOM and CSV result without writing analysis back', () => {
  const storage = storageFor(fixture({ qualified: IDs }));
  const first = open(storage);
  assertSurfaces(first, storage, 'unproven');

  const added = first.api.stationCoverageDeclareAvailability({ windowId: WINDOW_ID, personId: 'sam', fromDay: FROM, toDay: TO, capacity: 1 });
  assert.equal(added.ok, true, added.error);
  assert.equal(added.saved, true);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  const statement = saved.stationAvailability.find((r) => r.id === added.id);
  assert.deepEqual([statement.personId, statement.byId, statement.basis, statement.capacity, statement.fromDay, statement.toDay], ['sam', 'ann', 'manager', 1, FROM, TO]);
  assert.equal('singleAbsence' in saved, false);
  assertSurfaces(open(storage), storage, 'tolerant');
});

test('CSV preserves the baseline refusal without including a window label from a reasons string', () => {
  const state = fixture({ available: [] });
  const report = coverage(state);
  assert.ok(report.claims.reasons.some((reason) => reason.includes(LABEL)));
  const file = exportWorkspaceCsv(state, 'skill-station-coverage', { now: NOW });
  const csv = parseCsv(file.csv);
  assert.match(csv.rows[0][csv.headers.indexOf('claim_reason')], /coverage or prerequisite evidence is incomplete/u);
  assert.equal(file.csv.includes(LABEL), false);
});
