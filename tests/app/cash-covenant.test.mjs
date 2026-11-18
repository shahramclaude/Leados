// ADR-0259: exact sourced receipts, guarded replay and non-destructive correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createApi } from '../../app/actions.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { moduleAggregate } from '../../app/core/domain/disclosure.js';
import { planRelease } from '../../app/core/domain/differencing.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';
import { CASH_COVENANT_LIMITS as L, CASH_COVENANT_METHOD } from '../../app/core/domain/cashCovenantSchema.js';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const AT = NOW.toISOString();
const START = '2026-10-01T08:00:00.000Z';
const DATE = '2026-10-31';
const CUTOFF = '2026-10-31T22:00:00.000Z';
const FACILITY = 'FAC-OPS-11';
const CLAUSE = 'Executed amendment 7 §4';
const CONTROL = 'GL close 10/31 57';
const HEAD = 'facility\ttestDate\tcurrency\tminimumMinor\tclauseRef\tcontrolAccounts\tcontrolTotalMinor\tcontrolRef';
const ACCOUNTS = 'account\ttestDate\tcurrency\tbalanceMinor\ttreatment\tbasisRef\tbalanceRef';
const a = `A01\t${DATE}\tDKK\t9007199254740997\tinclude\t§4(a)\tBank close A01`;
const b = `A02\t${DATE}\tDKK\t-4\tinclude\t§4(a)\tBank close A02`;
const c = `A03\t${DATE}\tDKK\t6\texclude\tPledge schedule\tBank close A03`;
function extract({ minimum = '9007199254740994', facility = FACILITY, count = '3', total = '9007199254740999', control = CONTROL, rows = [a, b, c, a] } = {}) {
  return [HEAD, `${facility}\t${DATE}\tDKK\t${minimum}\t${CLAUSE}\t${count}\t${total}\t${control}`, ACCOUNTS, ...rows].join('\n');
}
function input(patch = {}) {
  return { cutoffAt: CUTOFF, versionRef: 'Treasury workpaper v1', stewardIds: ['ops', 'books'], text: extract(), ...patch };
}
function fixture(matrix = true) {
  const state = createEmptyState(START);
  state.settings.activeSeatId = 'director';
  state.settings.chainLeaderAltitude = 'chief';
  const person = (id, managerId, level) => ({ id, managerId, level, name: `Name ${id}`, role: level, status: 'active', createdAt: START, updatedAt: START });
  state.people = [person('vp', null, 'vp'), person('director', 'vp', 'director'), person('peer', 'vp', 'director'),
    person('ops', 'director', 'manager'), person('books', matrix ? 'peer' : 'director', 'manager'),
    person('team-lead', 'ops', 'lead'), person('worker', 'team-lead', 'ic'), person('controller', 'books', 'ic'), person('peer-ic', 'peer', 'ic')];
  if (matrix) state.reportingLines = [
    { id: 'books-project', personId: 'books', managerId: 'director', kind: 'project', fromISO: '2026-10-05', declaredAt: START, status: 'active' },
    { id: 'books-functional', personId: 'books', managerId: 'ops', kind: 'functional', fromISO: '2026-10-05', declaredAt: START, status: 'active' },
  ];
  return state;
}
function workspace(state = fixture()) {
  const cache = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => cache.get(k) ?? null, removeItem: (k) => cache.delete(k),
    setItem: (k, v) => {
      if (blocked) throw Object.assign(new Error('Disk is full'), { name: 'QuotaExceededError' });
      cache.set(k, String(v));
    },
  };
  let n = 0, blocked = false;
  const idFactory = (prefix) => `${prefix}-q-${++n}`;
  const options = { storage, now: () => NOW, idFactory, kdfIterations: 1000, minKdfIterations: 1000 };
  function reopen() {
    const store = createStore(options);
    store.load();
    return { store, api: createApi(store, options) };
  }
  const w = reopen();
  return { ...w, reopen, storage, idFactory, persisted: () => cache.get(STORAGE_KEY), block: () => { blocked = true; },
    sit: (id) => w.store.update((draft) => { draft.settings.activeSeatId = id; }) };
}
function preview(api, data = input()) {
  const plan = api.cashCovenantPreview(data);
  assert.equal(plan.ok, true, plan.error);
  return plan;
}
async function record(api, data = input()) {
  const saved = await api.cashCovenantRecord(preview(api, data).submission);
  assert.equal(saved.saved, true, saved.error || saved.warning);
  return saved;
}
const correction = (testId, patch = {}) => input({ prior: { testId, versionRef: 'Treasury workpaper v1' },
  versionRef: 'Treasury workpaper v2', stewardIds: undefined, correctionReason: 'Corrected to executed amendment 7',
  text: extract({ minimum: '9007199254740993' }), ...patch });

test('cash covenant: additive v210 → v211 migration creates no evidence or derived budget changes', () => {
  const old = fixture(false);
  old.schemaVersion = 210;
  delete old.cashCovenantTests;
  old.budgets = [{ id: 'existing-budget' }];
  const { raw, applied } = migrate(old);
  assert.deepEqual(applied, ['210 → 211', '211 → 212']);
  assert.deepEqual(raw, { ...old, schemaVersion: SCHEMA_VERSION, cashCovenantTests: [] });
  assert.deepEqual(normalizeState(raw, { now: NOW }).state.cashCovenantTests, []);
});

test('cash covenant: unsupported cutoffs, inputs and conflicting evidence leave storage untouched', async () => {
  const w = workspace();
  const before = w.persisted();
  for (const bad of [input({ cutoffAt: '' }), input({ cutoffAt: '2026-02-30T00:00:00Z' }),
    input({ cutoffAt: '2026-11-18T12:00:00.001Z' }), input({ cutoffAt: '2026-11-02T00:00:00Z' }),
    input({ cutoffAt: '2026-10-31T22:00:00' }), input({ versionRef: ' ' }), input({ stewardIds: ['ops', 'ops'] }),
    input({ stewardIds: ['controller'] }), input({ text: extract({ rows: [a, a.replace('Bank close A01', 'Other balance')] }) }),
    input({ text: extract({ rows: [a, a.replace('A01\t', 'a01\t')] }) }), input({ text: extract({ control: 'bank close a01' }) }),
    input({ text: extract({ rows: [a, b.replace('DKK', 'EUR')] }) }), input({ text: extract({ minimum: '-1' }) }),
    input({ text: extract({ minimum: '1e8' }) }), input({ text: 'x'.repeat(L.extract + 1) })]) {
    assert.equal(w.api.cashCovenantPreview(bad).ok, false);
    assert.equal((await w.api.cashCovenantRecord({ ...bad, expectedSeatId: 'director' })).ok, false);
  }
  assert.equal(w.persisted(), before);
  assert.deepEqual(w.store.state.cashCovenantTests, []);
  const midnight = preview(w.api, input({ cutoffAt: '2026-11-01T03:00:00Z' }));
  assert.equal(midnight.revision.cutoffAt, '2026-11-01T03:00:00.000Z');
});

test('cash covenant: equal arithmetic is not sufficient evidence; a withheld receipt is historical, not a zero', async () => {
  const w = workspace();
  const partial = input({ text: extract({ rows: [a, b, c.replace('exclude', 'unresolved')], total: '9007199254740998' }) });
  const plan = preview(w.api, partial);
  assert.deepEqual([plan.report.printedRowsBalance, plan.report.countMatches, plan.report.totalMatches], [true, true, false]);
  assert.match(plan.report.reasons.join(' '), /unresolved/);
  assert.equal(plan.report.result, null);
  const saved = await w.api.cashCovenantRecord(plan.submission);
  assert.equal(saved.saved, true, saved.error);
  assert.deepEqual(w.reopen().api.cashCovenantRead(saved.testId).report, plan.report);
  const empty = preview(w.api, input({ text: extract({ facility: 'NO-ROWS', count: '0', total: '0', rows: [] }) }));
  assert.equal(empty.report.result, null);
  assert.deepEqual(empty.report.reasons, ['No account evidence supplied.']);
});

test('cash covenant: intact latest/source history after two versions, stale correction and changed-seat refusals', async () => {
  const w = workspace();
  const initial = await record(w.api);
  const first = structuredClone(w.store.state.cashCovenantTests[0]);
  const beforeCorrection = w.persisted();
  for (const invalid of [correction(initial.testId, { correctionReason: '' }), correction(initial.testId, { versionRef: 'treasury workpaper v1' }),
    correction(initial.testId, { stewardIds: ['ops'] }), correction(initial.testId, { text: extract({ facility: 'OTHER' }) })]) {
    assert.equal(w.api.cashCovenantPreview(invalid).ok, false);
  }
  assert.equal(w.api.cashCovenantPreview(input({ text: extract({ facility: FACILITY.toLowerCase() }) })).ok, false);
  const revised = preview(w.api, correction(initial.testId));
  const stale = preview(w.api, correction(initial.testId, { versionRef: 'Treasury workpaper v3' }));
  assert.equal(w.persisted(), beforeCorrection, 'previews and refusals do not write');
  w.sit('vp');
  const changedSeat = w.persisted();
  assert.match((await w.api.cashCovenantRecord(revised.submission)).error, /seat has changed/);
  assert.equal(w.persisted(), changedSeat);
  w.sit('director');
  assert.equal((await w.api.cashCovenantRecord(revised.submission)).saved, true);
  assert.equal((await w.api.cashCovenantRecord(stale.submission)).ok, false);
  const reload = w.reopen();
  const series = reload.store.state.cashCovenantTests[0];
  assert.equal(series.method, CASH_COVENANT_METHOD);
  assert.deepEqual(series.revisions[0], first.revisions[0]);
  assert.equal(series.revisions[1].supersedes, first.revisions[0].versionRef);
  assert.equal(series.revisions[1].text, revised.submission.text);
  assert.equal(reload.api.cashCovenantRead(initial.testId).report.result.signedHeadroomMinor, '0');
  assert.equal(reload.api.cashCovenantRead(initial.testId, '1').report.result.signedHeadroomMinor, '-1');
  assert.equal(reload.api.cashCovenantRead(initial.testId, '1').mayCorrect, false);
  assert.equal(reload.api.cashCovenantRead(initial.testId, '01').ok, false);
  const events = reload.store.state.events.filter((r) => r.type.startsWith('cashCovenant.'));
  assert.deepEqual(events.map((r) => [r.type, r.entityId]), [['cashCovenant.recorded', initial.testId], ['cashCovenant.corrected', initial.testId]]);
  for (const secret of [FACILITY, CLAUSE, CONTROL]) assert.ok(!JSON.stringify(events).includes(secret));
});

test('cash covenant: disclose only whole steward sets, including one reached solely through multiple active matrix paths', async () => {
  const w = workspace();
  assert.equal(w.api.cashCovenantIndex().candidates.filter((p) => p.id === 'books').length, 1);
  const { testId } = await record(w.api);
  w.sit('peer');
  assert.deepEqual(w.api.cashCovenantIndex().tests, []);
  assert.equal(w.api.cashCovenantRead(testId).ok, false);
  assert.equal(w.api.cashCovenantPreview(correction(testId)).ok, false);
  for (const seatId of ['team-lead', 'ops']) {
    w.sit(seatId);
    assert.equal(w.api.cashCovenantIndex().ok, false);
    assert.equal(w.api.cashCovenantRead(testId).ok, false);
  }
  w.store.update((draft) => {
    draft.settings.activeSeatId = 'director';
    for (const line of draft.reportingLines) line.toISO = '2026-11-17';
  });
  assert.equal(w.api.cashCovenantRead(testId).ok, false);
  w.sit('vp');
  assert.deepEqual(w.api.cashCovenantIndex().tests.map((r) => r.id), [testId]);
  for (const seatId of ['leader', null]) {
    w.sit(seatId);
    const scope = safeSeatContext(w.store.state, NOW);
    assert.equal(scope.seat.rank, 5);
    if (seatId) assert.equal(scope.seat.fullAccess, false);
    assert.equal(w.api.cashCovenantRead(testId).ok, true);
    assert.equal(w.api.cashCovenantIndex().mayRecord, false);
    assert.equal((await w.api.cashCovenantRecord({ ...input(), expectedSeatId: 'leader' })).ok, false);
  }
});

test('cash covenant: kept out of generic projections, grants and publications', async () => {
  const w = workspace();
  const { testId } = await record(w.api);
  const state = w.store.state;
  const seated = safeSeatContext(state, NOW);
  assert.equal(workspaceRouteVerdict('cash-covenant', seated.seat, { state, built: seated.built, now: NOW }).detail, true);
  assert.deepEqual(scopedViewState(state, seated, { now: NOW }).cashCovenantTests, []);
  assert.equal(moduleAggregate(state, 'cash-covenant', seated.seat, seated.built, { now: NOW }), null);
  assert.equal(planRelease({ state, route: 'cash-covenant', now: NOW }).ok, false);
  assert.equal(w.api.cashCovenantRead(testId).ok, true);
});

test('cash covenant: a corrupted correction cannot promote older evidence; original material survives unrelated saves', async () => {
  const w = workspace();
  const { testId } = await record(w.api);
  await record(w.api, correction(testId));
  const valid = structuredClone(w.store.state.cashCovenantTests);
  const withForgedResult = structuredClone(valid);
  withForgedResult[0].revisions[0].result = { signedHeadroomMinor: '999' };
  assert.deepEqual(normalizeState({ ...w.store.state, cashCovenantTests: withForgedResult }, { now: NOW }).state.cashCovenantTests, valid);
  const damaged = structuredClone(valid);
  damaged[0].revisions[1].supersedes = 'missing';
  for (const ledger of [damaged, [valid[0], { ...valid[0], id: 'ambiguous-series' }], [...valid].map((r) => ({ ...r, method: 'unknown' }))]) {
    const bad = workspace({ ...w.store.state, cashCovenantTests: ledger });
    assert.match(bad.store.warnings.join(' '), /Cash covenant ledger.*No receipt was substituted/);
    assert.equal(bad.api.cashCovenantRead(testId, '1').ok, false);
    assert.equal(bad.api.cashCovenantIndex().ok, false);
    assert.equal((await bad.api.cashCovenantRecord({ ...input(), expectedSeatId: 'director' })).ok, false);
    bad.sit('vp');
    assert.deepEqual(JSON.parse(bad.persisted()).cashCovenantTests, ledger);
  }
});

test('cash covenant: quota failure is not a durable save, encrypted success survives lock and fresh reload', async () => {
  const blocked = workspace();
  const before = blocked.persisted();
  const plan = preview(blocked.api);
  blocked.block();
  const unsaved = await blocked.api.cashCovenantRecord(plan.submission);
  assert.equal(unsaved.saved, false);
  assert.match(unsaved.warning, /storage is full/);
  assert.equal(blocked.persisted(), before);
  assert.deepEqual(blocked.reopen().api.cashCovenantIndex().tests, []);

  const w = workspace();
  const passphrase = 'Test-only local cash vault fixture';
  const enabled = await w.store.enableEncryption(passphrase);
  assert.equal(enabled.ok, true, enabled.error);
  const { testId } = await record(w.api);
  const original = w.api.cashCovenantRead(testId).report;
  assert.ok(!w.persisted().includes(FACILITY));
  const reload = w.reopen();
  assert.equal(reload.store.isLocked, true);
  assert.equal(reload.api.cashCovenantRead(testId).ok, false);
  const unlocked = await reload.store.unlock(passphrase);
  assert.equal(unlocked.ok, true, unlocked.error);
  assert.deepEqual(reload.api.cashCovenantRead(testId).report, original);
});

for (const matrix of [false, true]) {
  test(`cash covenant: actual form → storage → reloaded receipt agrees cell for cell (${matrix ? 'matrix' : 'single-chain'})`, async () => {
    const w = workspace(fixture(matrix));
    const dom = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), { url: 'https://leados.test/', pretendToBeVisual: true });
    const old = Object.fromEntries(['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'URL', 'localStorage'].map((key) => [key, globalThis[key]]));
    const { window } = dom;
    window.__LEADOS_TEST__ = true;
    Object.assign(globalThis, Object.fromEntries(Object.keys(old).map((key) => [key, key === 'window' ? window : window[key]])));
    const { document } = window;
    const cell = (key, root = document) => root.querySelector(`[data-cash-measure="${key}"]`)?.textContent;
    const dialog = () => document.querySelector('#modal-root [role="dialog"]');
    const click = (label) => {
      const element = [...document.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label);
      assert.ok(element, label);
      element.click();
    };
    const set = (values) => {
      for (const [name, value] of Object.entries(values)) document.querySelector(`[name="${name}"]`).value = value;
    };
    const appOptions = { storage: w.storage, now: () => NOW, idFactory: w.idFactory };
    try {
      const { createApp } = await import('../../app/main.js');
      const app = createApp(appOptions);
      if (!matrix) {
        app.navigate('#/finance');
        assert.equal(document.querySelector('#view h1').textContent, 'Budget & finance');
      }
      app.navigate('#/cash-covenant');
      assert.ok(document.querySelector('[data-testid="cash-covenant-page"]'));
      click('Review a test');
      const sub = input();
      set({ versionRef: sub.versionRef, cutoffAt: CUTOFF, text: sub.text });
      for (const id of sub.stewardIds) document.querySelector(`[name="stewardIds[]"][value="${id}"]`).checked = true;
      const before = w.persisted();
      click('Preview reconciliation');
      assert.equal(cell('signedHeadroomMinor', dialog()), '-1');
      assert.equal(w.persisted(), before);
      click('Record workpaper');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const first = JSON.parse(w.persisted()).cashCovenantTests[0];
      assert.equal(first.revisions[0].text, sub.text);
      assert.deepEqual(first.stewardIds, ['books', 'ops']);
      const link = (number) => `#/cash-covenant?test=${first.id}&revision=${number}`;
      assert.equal(window.location.hash, link(1));
      click('Prepare correction');
      const fixed = correction(first.id, { text: extract({ rows: [a, b, c.replace('exclude', 'unresolved'), a] }) });
      set({ versionRef: fixed.versionRef, correctionReason: fixed.correctionReason, text: fixed.text });
      click('Preview reconciliation');
      assert.equal(cell('signedHeadroomMinor', dialog()), 'Withheld');
      click('Record correction');
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(window.location.hash, link(2));
      const bytes = w.persisted();
      const saved = JSON.parse(bytes).cashCovenantTests[0];
      assert.deepEqual(saved.revisions[0], first.revisions[0]);
      assert.equal(saved.revisions[1].text, fixed.text);
      const reload = createApp(appOptions);
      reload.navigate(link(2));
      assert.equal(cell('signedHeadroomMinor'), 'Withheld');
      assert.deepEqual([...document.querySelectorAll('[aria-label="Reasons headroom is withheld"] li')].map((li) => li.textContent),
        ['Eligibility unresolved on one or more accounts.']);
      reload.navigate(link(1));
      assert.match(document.querySelector('#cash-covenant-receipt .card-sub').textContent, /Superseded revision/);
      const { report, revision } = reload.api.cashCovenantRead(first.id, '1');
      const expected = { minimumMinor: '9007199254740994', bookMinor: '9007199254740999', controlTotalMinor: '9007199254740999',
        include: '9007199254740993', exclude: '6', unresolved: '0', eligibleMinor: '9007199254740993', signedHeadroomMinor: '-1',
        duplicateRows: '1', distinctAccounts: '3', controlAccounts: '3', printedRowsBalance: 'Yes', countMatches: 'Yes', totalMatches: 'Yes' };
      for (const [key, value] of Object.entries(expected)) assert.equal(cell(key), value, key);
      assert.equal(cell('signedHeadroomMinor'), report.result.signedHeadroomMinor);
      assert.equal(cell('bookMinor'), report.bookMinor);
      assert.deepEqual(report.subtotalsMinor, { include: cell('include'), exclude: cell('exclude'), unresolved: cell('unresolved') });
      for (const [key, value] of Object.entries({ facility: FACILITY, testDate: DATE, currency: 'DKK', clauseRef: CLAUSE, controlRef: CONTROL,
        cutoffAt: saved.revisions[0].cutoffAt, versionRef: saved.revisions[0].versionRef, recordedAt: revision.recordedAt, revision: '1' })) {
        assert.equal(document.querySelector(`[data-cash-field="${key}"]`).textContent, value, key);
      }
      const rows = [...document.querySelectorAll('table[aria-label="Distinct submitted cash accounts"] tbody tr')]
        .map((row) => [...row.cells].map((td) => td.textContent));
      assert.deepEqual(rows, [a, b, c].map((line, i) => {
        const [account, , , balance, treatment, basis, reference] = line.split('\t');
        return [account, balance, treatment, basis, reference, ['4, 7', '5', '6'][i]];
      }));
      assert.equal(rows.reduce((sum, row) => sum + BigInt(row[1]), 0n).toString(), cell('bookMinor'));
      assert.equal(w.persisted(), bytes, 'reopening a receipt does not save a computed number');
      assert.equal(reload.api.setActiveSeat('leader').saved, true);
      reload.navigate(link(1));
      assert.equal(cell('signedHeadroomMinor'), '-1', 'chief can see the exact reading on this scoped route');
      assert.ok(![...document.querySelectorAll('button')].some((btn) => btn.textContent.trim() === 'Review a test'));
    } finally { dom.window.close(); Object.assign(globalThis, old); }
  });
}
