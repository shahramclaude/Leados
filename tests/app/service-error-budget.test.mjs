// ADR-0255: parse closed evidence, compute exactly, refuse unsupported rates,
// constrain scoped reads and writes, and compare real rendered/exported cells.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { parseCsv } from '../../app/core/csv.js';
import { guardApi, workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';
import { moduleAggregate } from '../../app/core/domain/disclosure.js';
import { planRelease } from '../../app/core/domain/differencing.js';
import {
  SERVICE_BUDGET_LIMITS as L, evaluateServiceBudget, parseServiceBudgetExtract,
  readServiceBudgetEvidence, serviceTargetPpm,
} from '../../app/core/domain/serviceBudget.js';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const AT = NOW.toISOString();
const START = '2026-10-01T08:00:00.000Z';
const HEADERS = 'day,good_events,total_events';
const PAYMENTS = 'PAYMENTS-SERVICE';
const SOURCE = 'edge-request extract 3f88 / v1';
const CONTROL = 'request-warehouse report 8cd4';
const evidence = (patch = {}) => ({
  serviceRef: PAYMENTS, policyRef: 'customer requests / version 4', sourceRef: SOURCE,
  startOn: '2026-11-16', endOn: '2026-11-17', targetPpm: 999000, stewardIds: ['delivery', 'platform'],
  daily: [{ day: '2026-11-16', good: '498', total: '500' }, { day: '2026-11-17', good: '9500', total: '9500' }],
  control: { ref: CONTROL, good: '9998', total: '10000' }, ...patch,
});
const paper = (patch = {}) => ({ ...evidence(), id: 'sbud-original', recordedById: 'director', recordedAt: AT, ...patch });
const cell = (result, measure) => result.receipt.find((r) => r.measure === measure).value;
function read(input = evidence()) {
  const parsed = readServiceBudgetEvidence(input, AT.slice(0, 10));
  assert.equal(parsed.ok, true, parsed.error);
  return evaluateServiceBudget(parsed.evidence);
}

function fixture(matrix = true) {
  const state = createEmptyState(START);
  state.settings.activeSeatId = 'director';
  const person = (id, managerId, level) => ({ id, managerId, level, name: `Name ${id}`, role: level, status: 'active', createdAt: START, updatedAt: START });
  state.people = [person('vp', null, 'vp'), person('director', 'vp', 'director'), person('peer', 'vp', 'director'),
    person('delivery', 'director', 'manager'), person('platform', matrix ? 'peer' : 'director', 'manager'),
    person('lead', 'delivery', 'lead'), person('worker', 'lead', 'ic'), person('engineer', 'platform', 'ic'), person('peer-worker', 'peer', 'ic')];
  if (matrix) state.reportingLines = [
    { id: 'matrix-platform', personId: 'platform', managerId: 'director', kind: 'project', fromISO: '2026-11-02', declaredAt: START, status: 'active' },
    { id: 'matrix-delivery', personId: 'delivery', managerId: 'director', kind: 'functional', fromISO: '2026-11-02', declaredAt: START, status: 'active' },
  ];
  return state;
}
function workspace(state = fixture()) {
  const cache = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  let n = 0, blocked = false;
  const idFactory = (prefix) => `${prefix}-q-${++n}`;
  const storage = { getItem: (k) => cache.get(k) ?? null, removeItem: (k) => cache.delete(k), setItem: (k, v) => {
    if (blocked) throw Object.assign(new Error('Disk full'), { name: 'QuotaExceededError' });
    cache.set(k, String(v));
  } };
  function reopen() {
    const store = createStore({ storage, now: () => NOW, idFactory });
    store.load();
    return { store, api: guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW }) };
  }
  const w = reopen();
  return { ...w, reopen, storage, idFactory, persisted: () => cache.get(STORAGE_KEY), block: () => { blocked = true; },
    sit: (id) => w.store.update((draft) => { draft.settings.activeSeatId = id; }),
  };
}

test('service budget: v207 migration adds an empty evidence ledger and does not reinterpret incidents', () => {
  const earlier = fixture();
  earlier.schemaVersion = 207;
  delete earlier.serviceBudgets;
  earlier.micIncidents = [{ id: 'existing-incident' }];
  const { raw, applied } = migrate(earlier);
  assert.deepEqual(applied, ['207 → 208', '208 → 209', '209 → 210', '210 → 211', '211 → 212']);
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(raw.serviceBudgets, []);
  assert.deepEqual(raw.micIncidents, earlier.micIncidents);
  assert.deepEqual(raw.settings, earlier.settings);
});

test('service budget: CSV and TSV accept reordered quoted headers; malformed records never import a prefix', () => {
  assert.deepEqual(parseServiceBudgetExtract('\uFEFF"total_events"\tday\t"good_events"\r\n500\t2026-11-16\t"498"\r\n').daily,
    [evidence().daily[0]]);
  for (const bad of ['', HEADERS, 'day,good_events,good_events\n2026-11-16,1,1', `${HEADERS}\n2026-11-16,1,1,1`,
    `${HEADERS}\n2026-11-16,1`, `${HEADERS}\n2026-11-16,1,1\n\n`, `${HEADERS}\n2026-11-16,1,"1`, `${HEADERS}\n2026-11-16,"1"x,1`,
    `${HEADERS}\n2026-02-29,0,0`, `${HEADERS}\n2026-11-16,0.0,1`, `${HEADERS}\n2026-11-16,1,1e7`,
    `${HEADERS}\n2026-11-16,1,01`, `${HEADERS}\n2026-11-16,1,1\r`, 'x'.repeat(L.extract + 1),
    `${HEADERS}\n${'2026-11-16,1,1\n'.repeat(L.days + 1)}`]) {
    assert.equal(parseServiceBudgetExtract(bad).ok, false, JSON.stringify(bad.slice(0, 70)));
  }
  assert.equal(serviceTargetPpm('99.9999'), 999999);
  assert.equal(serviceTargetPpm('100.0000'), 1000000);
  for (const invalid of ['0', '100.0001', '99.99999', '99.9%', '9.99e1', ' 99.9', '-99.9', 99.9]) assert.equal(serviceTargetPpm(invalid), null);
});

test('service budget: closed UTC boundaries and a single disjoint row per day are enforced at the door', () => {
  for (const patch of [
    { endOn: '2026-11-18' }, { startOn: '2026-09-01', endOn: '2026-12-01' }, { startOn: '2026-01-01' },
    { startOn: '2026-11-17' }, { targetPpm: '999000' }, { stewardIds: ['delivery', 'delivery'] }, { stewardIds: [] },
    { control: { ref: SOURCE.toUpperCase(), good: '2', total: '3' } }, { control: { ref: 'missing-count', total: '9' } },
    { daily: [evidence().daily[0], evidence().daily[0]] }, { daily: [{ day: '2026-11-16', good: '2', total: '1' }] },
    { daily: [{ day: '2026-11-16', good: 1, total: '1' }] }, { control: { ref: 'bad', good: '2', total: '1' } },
    { sourceRef: 'filename\n(with line newline)' }, { daily: [{ day: '2026-11-15', good: '0', total: '0' }] },
  ]) assert.equal(readServiceBudgetEvidence(evidence(patch), '2026-11-18').ok, false, JSON.stringify(patch));
  const leapWindow = read(evidence({ startOn: '2024-02-28', endOn: '2024-03-01', daily: [{ day: '2024-02-29', good: '0', total: '0' }] }));
  assert.deepEqual(leapWindow.missing, ['2024-02-28', '2024-03-01']);
});

test('service budget: request-weighted full window, exact fraction, whole-error headroom, and row balance', () => {
  const analysis = read();
  assert.deepEqual(analysis.rows, [
    { day: '2026-11-16', good: '498', total: '500', errors: '2' },
    { day: '2026-11-17', good: '9500', total: '9500', errors: '0' },
  ]);
  assert.deepEqual(analysis.issues, []);
  for (const [measure, expected] of Object.entries({ recorded_good_events: '9998', recorded_total_events: '10000', recorded_error_events: '2',
    observed_success_fraction: '9998/10000', target_percent: '99.9%', whole_errors_allowed: '10', whole_error_headroom: '8',
    errors_over_allowance: '0', burn_multiple_fraction: '1/5', printed_rows_balance: 'yes', control_matches: 'yes', verdict: 'within' })) {
    assert.equal(cell(analysis, measure), expected, measure);
  }
  assert.deepEqual(read(evidence({ daily: evidence().daily.reverse() })), analysis);
});

test('service budget: independent enumeration pins every small-population boundary, including no whole headroom below 1× burn', () => {
  const targets = [1, 1_000, 333_333, 500_000, 999_000, 999_999, 1_000_000];
  for (let eligible = 1; eligible <= 14; eligible += 1) for (let good = 0; good <= eligible; good += 1) for (const targetPpm of targets) {
    const result = read(evidence({ targetPpm, endOn: '2026-11-16', daily: [{ day: '2026-11-16', good: String(good), total: String(eligible) }],
      control: { ref: CONTROL, good: String(good), total: String(eligible) } }));
    const fits = (remainingGood) => remainingGood * 1_000_000 >= eligible * targetPpm;
    const allowed = [...Array(eligible + 1).keys()].filter((e) => fits(eligible - e)).at(-1);
    const headroom = [...Array(good + 1).keys()].filter((n) => fits(good - n)).at(-1);
    assert.equal(cell(result, 'whole_errors_allowed'), String(allowed));
    assert.equal(cell(result, 'whole_error_headroom'), String(headroom ?? 0));
    assert.equal(result.verdict, headroom === undefined ? 'exceeded' : headroom === 0 ? 'no-headroom' : 'within');
    const expectedOver = headroom === undefined ? [...Array(eligible + 1).keys()].find((n) => fits(good + n)) : 0;
    assert.equal(cell(result, 'errors_over_allowance'), String(expectedOver));
    if (targetPpm === 1_000_000) {
      assert.equal(cell(result, 'burn_multiple_fraction'), null);
      assert.match(result.receipt.find((r) => r.measure === 'burn_multiple_fraction').reason, /100%/);
    }
  }
  const nonInteger = read(evidence({ targetPpm: 990000, endOn: '2026-11-16', daily: [{ day: '2026-11-16', good: '149', total: '150' }],
    control: { ref: CONTROL, good: '149', total: '150' } }));
  assert.deepEqual([nonInteger.verdict, cell(nonInteger, 'burn_multiple_fraction')], ['no-headroom', '2/3']);
});

test('service budget: magnitudes beyond IEEE integer precision remain exact', () => {
  const a = read(evidence({ targetPpm: 999999, daily: [{ day: '2026-11-16', good: '999999999999999998', total: '999999999999999999' },
    { day: '2026-11-17', good: '999999999999999999', total: '999999999999999999' }],
  control: { ref: CONTROL, good: '1999999999999999997', total: '1999999999999999998' } }));
  assert.deepEqual([cell(a, 'recorded_good_events'), cell(a, 'recorded_error_events'), cell(a, 'whole_errors_allowed'), cell(a, 'whole_error_headroom')],
    ['1999999999999999997', '1', '1999999999999', '1999999999998']);
});

test('service budget: missing days, mismatched controls and observed zero are not made into a passing rate', () => {
  const basis = evidence();
  const zeroRows = basis.daily.map((r) => ({ ...r, good: '0', total: '0' }));
  for (const [input, issues, controlState] of [
    [{ daily: [basis.daily[0]], control: { ref: CONTROL, good: '498', total: '500' } }, ['missing-days'], 'yes'],
    [{ control: null }, ['missing-control'], null],
    [{ control: { ...basis.control, good: '9997' } }, ['control-mismatch'], 'no'],
    [{ control: { ...basis.control, total: '10001' } }, ['control-mismatch'], 'no'],
    [{ daily: zeroRows, control: { ref: CONTROL, good: '0', total: '0' } }, ['no-eligible-events'], 'yes'],
  ]) {
    const a = read(evidence(input));
    assert.deepEqual(a.issues.map((i) => i.code), issues);
    assert.equal(cell(a, 'control_matches'), controlState);
    assert.equal(cell(a, 'printed_rows_balance'), 'yes');
    assert.equal(a.verdict, 'withheld');
    for (const key of ['observed_success_fraction', 'whole_errors_allowed', 'whole_error_headroom', 'errors_over_allowance', 'burn_multiple_fraction']) {
      const row = a.receipt.find((r) => r.measure === key);
      assert.equal(row.value, null, key); assert.ok(row.reason.length);
    }
  }
});

test('service budget: imports do not preserve a forged verdict or salvage ambiguous or malformed evidence', () => {
  const state = fixture();
  const original = paper();
  state.serviceBudgets = [{ ...original, report: { verdict: 'within' }, daily: original.daily.map((r) => ({ ...r, errors: '999' })) }];
  const once = normalizeState(state, { now: NOW });
  assert.deepEqual(once.state.serviceBudgets, [original]);
  assert.deepEqual(normalizeState(once.state, { now: NOW }).state.serviceBudgets, [original]);
  for (const rows of [[original, paper({ id: 'second', daily: [] })], [original, paper({ sourceRef: 'v2' })],
    [paper({ recordedAt: '2026-11-18T13:00:00.000Z' })], [paper({ daily: [{}] })], Array(L.papers + 1).fill(original)]) {
    for (const candidate of [rows, [...rows].reverse()]) {
      const out = normalizeState({ ...state, serviceBudgets: candidate }, { now: NOW });
      assert.deepEqual(out.state.serviceBudgets, []);
      assert.match(out.warnings.find((w) => w.startsWith('Service error budget: ')), /refused|No partial ledger/);
    }
  }
});

test('service budget: director and VP both reach a matrix paper once; partial reach and lower ranks get no paper or control data', async () => {
  for (const matrix of [true, false]) {
    const w = workspace(fixture(matrix));
    assert.deepEqual(w.api.serviceBudgetIndex().candidates.filter((p) => p.id === 'platform').length, 1);
    assert.equal(w.api.serviceBudgetIndex().candidates.some((p) => p.id === 'worker'), false, 'no roster-wide IC list');
    const before = w.persisted();
    const preview = w.api.serviceBudgetPreview(evidence());
    assert.equal(preview.ok, true, preview.error);
    assert.equal(w.persisted(), before);
    const saved = await w.api.serviceBudgetRecord(preview.evidence);
    assert.equal(saved.saved, true, saved.error);
    w.sit('vp');
    assert.deepEqual(w.api.serviceBudgetIndex().entries.map((r) => r.id), [saved.id]);
    assert.equal(w.api.serviceBudgetRead(saved.id).report.verdict, 'within');
    const seated = safeSeatContext(w.store.state, NOW);
    assert.equal(workspaceRouteVerdict('service-error-budget', seated.seat, { state: w.store.state, built: seated.built, now: NOW }).detail, true);
    assert.deepEqual(scopedViewState(w.store.state, seated, { now: NOW }).serviceBudgets, []);
    assert.equal(moduleAggregate(w.store.state, 'service-error-budget', seated.seat, seated.built), null);
    assert.equal(planRelease({ state: w.store.state, now: NOW, route: 'service-error-budget', seatId: 'vp' }).ok, false);
    w.sit('peer');
    assert.deepEqual(w.api.serviceBudgetIndex().entries, []);
    assert.deepEqual(w.api.serviceBudgetRead(saved.id), w.api.serviceBudgetRead('missing-paper'));
    const unchanged = w.persisted();
    assert.equal((await w.api.serviceBudgetRecord(evidence({ sourceRef: 'v2' }))).ok, false);
    assert.equal(w.persisted(), unchanged);
    for (const id of ['delivery', 'lead', 'invalid-seat']) {
      w.sit(id);
      assert.equal(w.api.serviceBudgetIndex().ok, false, id);
      assert.equal(w.api.serviceBudgetRead(saved.id).ok, false, id);
      assert.equal(w.api.serviceBudgetPreview(evidence()).ok, false, id);
    }
    w.sit(null);
    assert.equal(w.api.serviceBudgetIndex().mayRecord, false);
    assert.equal(w.api.serviceBudgetRead(saved.id).ok, true);
    assert.equal((await w.api.serviceBudgetRecord(evidence({ sourceRef: 'v2' }))).ok, false);
  }
});

test('service budget: preview cannot preserve an expired reporting grant, and changed versions append without overwrites', async () => {
  const w = workspace();
  const saved = await w.api.serviceBudgetRecord(evidence());
  assert.equal(saved.saved, true, saved.error);
  const first = structuredClone(w.store.state.serviceBudgets[0]);
  assert.equal((await w.api.serviceBudgetRecord(evidence())).ok, false);
  const preview = w.api.serviceBudgetPreview(evidence({ sourceRef: 'corrected extract / v2', control: null }));
  assert.equal(preview.ok, true, preview.error);
  w.store.update((draft) => { draft.reportingLines.find((r) => r.id === 'matrix-platform').toISO = '2026-11-17'; });
  const before = w.persisted();
  assert.equal((await w.api.serviceBudgetRecord(preview.evidence)).ok, false);
  assert.equal(w.persisted(), before);
  assert.deepEqual(w.api.serviceBudgetIndex().entries, []);
  w.sit('vp');
  const revised = await w.api.serviceBudgetRecord(preview.evidence);
  assert.equal(revised.saved, true, revised.error);
  assert.deepEqual(w.store.state.serviceBudgets[0], first);
  assert.equal(w.api.serviceBudgetRead(revised.id).report.verdict, 'withheld');
  assert.equal(w.api.serviceBudgetIndex().entries.length, 2);
});

test('service budget: a storage refusal is not reported as a durable save', async () => {
  const w = workspace(); w.block();
  const result = await w.api.serviceBudgetRecord(evidence());
  assert.equal(result.ok, true);
  assert.equal(result.saved, false);
  assert.match(result.warning, /Could not save/);
  assert.equal(w.store.state.serviceBudgets.length, 1);
  assert.equal(w.reopen().store.state.serviceBudgets.length, 0);
});

test('service budget: real shell preview → record → reload → displayed and exported evidence match exactly; incident command remains intact', async () => {
  // The inherited incident route has no declared-seat disclosure manifest.
  // Confirm adjacency in the existing operator view, then exercise the new route as a director.
  const initial = fixture();
  initial.settings.activeSeatId = null;
  const w = workspace(initial);
  const dom = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), { url: 'https://leados.test/', pretendToBeVisual: true });
  const original = Object.fromEntries(['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'URL', 'localStorage'].map((k) => [k, globalThis[k]]));
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  Object.assign(globalThis, Object.fromEntries(Object.keys(original).map((k) => [k, k === 'window' ? window : window[k]])));
  const { document } = window;
  const click = (label) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    assert.ok(btn, `Missing button: ${label}`); btn.click();
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 40; i += 1) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail('The shell did not render the expected result.');
  };
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: w.storage, now: () => NOW, idFactory: w.idFactory });
    app.ctx.navigate('#/incidents');
    const incidents = document.querySelector('[data-testid="incident-command-panel"]');
    assert.ok(incidents);
    const originalStats = incidents.querySelectorAll('[data-testid^="mic-"]').length;
    assert.ok(originalStats > 0);
    assert.ok(incidents.querySelector('a[href="#/service-error-budget"]'));
    const switched = app.api.setActiveSeat('director');
    assert.equal(switched.saved, true, switched.error);
    app.ctx.navigate('#/slo');
    assert.ok(document.querySelector('[data-testid="service-budget-page"]'));
    click('Review a window');
    const e = evidence();
    for (const [name, value] of Object.entries({ serviceRef: e.serviceRef, policyRef: e.policyRef, sourceRef: e.sourceRef,
      startOn: e.startOn, endOn: e.endOn, target: '99.9', controlRef: e.control.ref, controlGood: e.control.good,
      controlTotal: e.control.total, extract: `${HEADERS}\n2026-11-16,498,500\n2026-11-17,9500,9500` })) {
      document.querySelector(`[name="${name}"]`).value = value;
    }
    for (const id of e.stewardIds) document.querySelector(`[name="stewardIds[]"][value="${id}"]`).checked = true;
    const before = w.persisted();
    click('Preview reconciliation');
    assert.equal(document.querySelector('[data-measure="whole_error_headroom"]').textContent, '8');
    assert.equal(w.persisted(), before, 'the preview must not write');
    click('Record workpaper');
    await waitFor(() => document.querySelector('[data-measure="whole_error_headroom"]') && document.querySelector('a[aria-current="page"][href*="?paper="]'));
    const bytes = w.persisted();
    const storageRecord = JSON.parse(bytes);
    const [written] = storageRecord.serviceBudgets;
    assert.deepEqual(written, { ...e, id: written.id, recordedById: 'director', recordedAt: AT });
    const audit = storageRecord.events.filter((r) => r.type === 'serviceBudget.recorded');
    assert.deepEqual(audit.map((r) => r.entityId), [written.id]);
    assert.ok(!JSON.stringify(audit).includes(SOURCE));
    const reload = w.reopen();
    assert.deepEqual(reload.store.state.serviceBudgets, [written]);
    const reopened = createApp({ storage: w.storage, now: () => NOW, idFactory: w.idFactory });
    reopened.ctx.navigate(`#/service-error-budget?paper=${written.id}`);
    const report = reload.api.serviceBudgetRead(written.id).report;
    for (const { measure, value, reason } of report.receipt) {
      const node = document.querySelector(`[data-measure="${measure}"]`);
      assert.equal(node.textContent, value ?? 'Withheld', measure);
      assert.equal(node.closest('td').nextElementSibling.textContent, reason, measure);
    }
    assert.deepEqual([...document.querySelectorAll('table[aria-label="Recorded UTC daily counts"] tbody tr')]
      .map((row) => [...row.cells].map((td) => td.textContent)), [['2026-11-16', '498', '500', '2'], ['2026-11-17', '9500', '9500', '0']]);
    click('Export numeric receipt');
    const csv = document.querySelector('[aria-label="Service error-budget receipt CSV"]').value;
    assert.deepEqual(parseCsv(csv).rows, report.receipt.map((r) => [r.measure, r.value ?? '', r.reason]));
    for (const token of [PAYMENTS, SOURCE, CONTROL, written.id, 'director', '2026-11-16']) assert.ok(!csv.includes(token), token);
    assert.equal(w.persisted(), bytes, 'read and receipt do not save derived numbers');
  } finally { dom.window.close(); Object.assign(globalThis, original); }
});
