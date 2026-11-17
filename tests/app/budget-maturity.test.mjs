// ADR-0239 — exact, privacy-preserving time buckets for budget encumbrances.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildBudgetMaturity, budgetMaturityCsvRows, BUDGET_MATURITY_CSV_SCOPE, BUDGET_MATURITY_CSV_COLUMNS } from '../../app/core/domain/budgetMaturity.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderBudgetMaturityPanel } from '../../app/views/budgetMaturityPanel.js';
import { createEmptyState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';

const NOW = new Date('2026-11-17T12:00:00.000Z');
const line = (id, status, expectedOn, committedAmount, extra = {}) => ({ id, title: `Fixture ${id}`, status, expectedOn, committedAmount, ...extra });
const budget = (id, currency, lines, extra = {}) => ({ id, name: `PRIVATE-${id}`, currency, status: 'active', lines, ...extra });

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  try { return run(dom); } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  }
}

function fullFixture() {
  return { budgets: [
    budget('budget-secret-a', 'USD', [
      line('c1', 'committed', '2026-11-17', '1.01'),
      line('c2', 'committed', '2026-11-18', '2.00'),
      line('c3', 'committed', '2026-11-23', '3'),
      line('p1', 'planned', '2026-11-24', '4'),
      line('p2', 'planned', '2026-11-25', '5.25'),
      line('p3', 'planned', '2026-11-30', '6'),
      line('old1', 'committed', '2026-11-16', '7'),
      line('old2', 'committed', '2026-11-16', '8'),
      line('old3', 'committed', '2026-11-16', '9'),
      line('spent', 'spent', '2026-11-18', '999'),
      line('released', 'released', '2026-11-18', '888'),
    ]),
    budget('budget-secret-b', 'DKK', [line('tiny', 'committed', '2026-11-17', '17.00')]),
  ] };
}

test('ADR-0239: exact week boundaries, overdue placement, status separation and per-currency privacy floor', () => {
  const report = buildBudgetMaturity(fullFixture(), { now: NOW });
  assert.equal(report.partitionReconciles, true);
  assert.equal(report.sourceLineN, 10);
  assert.equal(report.placedLineN, 10);
  assert.equal(report.figuresComplete, false, 'one-cell privacy suppression makes the release incomplete');
  const committedW1 = report.rows.find((row) => row.currency === 'USD' && row.recordType === 'committed' && row.week === 1);
  assert.deepEqual({ cents: committedW1.amountCents, n: committedW1.lineN }, { cents: '601', n: 3 });
  const plannedW2 = report.rows.find((row) => row.currency === 'USD' && row.recordType === 'planned' && row.week === 2);
  assert.deepEqual({ cents: plannedW2.amountCents, n: plannedW2.lineN }, { cents: '1525', n: 3 });
  const overdue = report.rows.find((row) => row.currency === 'USD' && row.recordType === 'committed' && row.week === 'overdue');
  assert.deepEqual({ cents: overdue.amountCents, n: overdue.lineN }, { cents: '2400', n: 3 });
  const tiny = report.rows.find((row) => row.currency === 'DKK' && row.recordType === 'committed' && row.week === 1);
  assert.deepEqual({ cents: tiny.amountCents, n: tiny.lineN, withheld: tiny.withheld }, { cents: null, n: null, withheld: true });
  assert.match(tiny.rowReason, /privacy floor of 3/);
  assert.equal(report.rows.some((row) => row.amountCents?.includes('999') || row.amountCents?.includes('888')), false, 'spent/released lines never enter the ladder');
});

test('ADR-0239: a missing date, an unpriced line, duplicate sources and a long-dated line fail closed', () => {
  const state = { budgets: [
    budget('b1', 'USD', [
      line('nodate', 'committed', null, '1.00'),
      line('badamount', 'committed', '2026-11-17', '1.001'),
      line('dup-a', 'committed', '2026-11-18', '3.00', { sourceType: 'case', sourceId: 'same-source' }),
      line('dup-b', 'committed', '2026-12-01', '4.00', { sourceType: 'case', sourceId: 'same-source' }),
      line('far', 'planned', '2027-03-01', '5.00'),
    ]),
  ] };
  const report = buildBudgetMaturity(state, { now: NOW });
  assert.equal(report.partitionReconciles, true);
  assert.equal(report.sourceLineN, report.placedLineN + report.unplacedLineN + report.beyondHorizonN);
  assert.equal(report.duplicateSourceN, 2);
  assert.equal(report.unplacedLineN, 3);
  assert.equal(report.unpricedLineN, 1);
  assert.equal(report.beyondHorizonN, 1);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.rows.filter((row) => row.currency === 'USD' && row.recordType === 'committed').every((row) => row.amountCents === null), 'unknown date and duplicate source prevent false weekly zeros');
  assert.ok(report.rows.filter((row) => row.currency === 'USD' && row.recordType === 'planned').every((row) => row.amountCents === null), 'out-of-horizon exposure is never silently outside a complete-coverage claim');
});

test('ADR-0239: aggregate CSV matches the reader, hides identities, and renders its own cents exactly', () => withDom((dom) => {
  const raw = createEmptyState(NOW.toISOString());
  raw.budgets = fullFixture().budgets;
  const values = new Map([[STORAGE_KEY, JSON.stringify(raw)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const firstStore = createStore({ storage, now: () => NOW, postCommitRules: [] });
  firstStore.load();
  const stored = JSON.stringify(firstStore.state.budgets);
  const reloadedStore = createStore({ storage, now: () => NOW, postCommitRules: [] });
  const state = reloadedStore.load();
  assert.equal(JSON.stringify(state.budgets), stored, 'budget declarations survive a real store reload unchanged');
  const report = buildBudgetMaturity(state, { now: NOW });
  assert.deepEqual(report, buildBudgetMaturity(firstStore.state, { now: NOW }), 'computed report is stable across reload');
  const rows = budgetMaturityCsvRows(report);
  assert.equal(rows.length, report.rows.length);
  for (const row of rows) assert.deepEqual(Object.keys(row), [...BUDGET_MATURITY_CSV_COLUMNS]);
  const exported = exportWorkspaceCsv(state, BUDGET_MATURITY_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.headers.length, BUDGET_MATURITY_CSV_COLUMNS.length);
  assert.equal(parsed.rows.length, rows.length);
  assert.ok(!exported.csv.includes('budget-secret'));
  assert.ok(!exported.csv.includes('c1'));
  assert.ok(!exported.csv.includes('PRIVATE-'));
  const week1 = report.rows.find((row) => row.currency === 'USD' && row.recordType === 'committed' && row.week === 1);
  const csvLine = parsed.rows.find((row) => row[parsed.headers.indexOf('currency')] === 'USD'
    && row[parsed.headers.indexOf('record_type')] === 'committed'
    && row[parsed.headers.indexOf('week')] === '1');
  assert.equal(csvLine[parsed.headers.indexOf('amount_cents')], week1.amountCents);

  const node = renderBudgetMaturityPanel({ state, now: NOW }, { tabs: null });
  dom.window.document.body.append(node);
  const rowNode = node.querySelector('tbody tr[data-currency="USD"][data-kind="committed"][data-week="1"]');
  assert.ok(rowNode, 'computed week row is rendered');
  assert.equal(rowNode.getAttribute('data-amount-cents'), week1.amountCents);
  assert.equal(rowNode.querySelector('[data-label="Amount"]').textContent.trim(), 'USD 6.01');
  assert.equal(rowNode.querySelector('[data-label="Open lines"]').textContent.trim(), '3');
  assert.ok(node.textContent.includes('Expected date is not a cash date'));
  assert.ok(!node.textContent.includes('PRIVATE-budget-secret-a'));
}));

test('ADR-0239: bad currency and malformed row are counted; invalid currency never fabricates zero cells', () => {
  const report = buildBudgetMaturity({ budgets: [
    budget('valid', 'USD', [line('known', 'committed', '2026-11-17', '1')]),
    budget('bad', 'US dollars', [line('unknown', 'committed', '2026-11-17', '2')]),
    budget('malformed', 'USD', [line('', 'committed', '2026-11-17', '3')]),
  ] }, { now: NOW });
  assert.equal(report.invalidCurrencyN, 1);
  assert.equal(report.invalidRowN, 1);
  assert.equal(report.partitionReconciles, true);
  assert.ok(report.rows.every((row) => row.amountCents === null), 'the source cannot support an all-currency zero claim');
  assert.equal(report.figuresComplete, false);
});

test('maturity identity tuples never collide at delimiter boundaries', () => {
  const state = { budgets: [
    budget('a|b', 'USD', [line('c', 'committed', '2026-11-17', '1', { sourceType: 'x|y', sourceId: 'z' })]),
    budget('a', 'USD', [line('b|c', 'committed', '2026-11-17', '2', { sourceType: 'x', sourceId: 'y|z' }), line('third', 'committed', '2026-11-17', '3')]),
  ] };
  const report = buildBudgetMaturity(state, { now: NOW });
  assert.equal(report.invalidRowN, 0);
  assert.equal(report.duplicateSourceN, 0);
  assert.equal(report.figuresComplete, true);
  assert.equal(report.rows.find((r) => r.week === 1 && r.recordType === 'committed').amountCents, '600');
});

test('all copies of ambiguous budget/line identities are refused independent of order', () => withDom((dom) => {
  const cases = [
    [budget('same', 'USD', [line('a', 'committed', '2026-11-17', '1')]), budget('same', 'EUR', [line('b', 'committed', '2026-11-17', '2')])],
    [budget('unique', 'USD', [line('same', 'committed', '2026-11-17', '1'), line('same', 'planned', '2026-11-18', '2')])],
    [budget('unique', 'USD', [line(42, 'committed', '2026-11-17', '1'), line(' ', 'planned', '2026-11-18', '2')])],
  ];
  for (const bad of cases) {
    const good = budget('good', 'USD', [1, 2, 3].map((n) => line(`g${n}`, 'committed', '2026-11-17', '5')));
    const state = { budgets: [...bad, good] };
    const snapshot = JSON.stringify(state);
    const report = buildBudgetMaturity(state, { now: NOW });
    assert.equal(report.invalidRowN, 2);
    assert.equal(report.unplacedLineN, 2);
    assert.equal(report.placedLineN, 3);
    assert.equal(report.partitionReconciles, true);
    assert.equal(report.figuresComplete, false);
    assert.ok(report.rows.every((r) => r.amountCents === null && r.lineN === null));
    const reversed = { budgets: [...state.budgets].reverse().map((b) => ({ ...b, lines: [...b.lines].reverse() })) };
    assert.deepEqual(buildBudgetMaturity(reversed, { now: NOW }), report);
    assert.equal(JSON.stringify(state), snapshot, 'reader does not rewrite source evidence');
    const exported = budgetMaturityCsvRows(report);
    assert.ok(exported.every((r) => r.amount_cents === null && r.line_n === null));
    const node = renderBudgetMaturityPanel({ state, now: NOW }, { tabs: null });
    dom.window.document.body.replaceChildren(node);
    for (const row of node.querySelectorAll('tbody tr[data-currency]')) {
      assert.equal(row.getAttribute('data-amount-cents'), '');
    }
    assert.ok(node.textContent.includes('unreadable identity'));
  }
}));
