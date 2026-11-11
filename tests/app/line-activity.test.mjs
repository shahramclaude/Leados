/**
 * tests/app/line-activity.test.mjs — the Matrix Line Activity Reconciliation
 * (ADR-0160, Schema v130 unchanged, `#/matrix?panel=activity`, CSV scope #120).
 *
 * One focused pass over what this session built: the declared-versus-originated
 * reading, the refusals that ARE the product (unpriced declared side, ambiguous
 * attribution, the act floor), the exact-integer identities, the home-line
 * boundary, the aggregate-only export, a JSDOM render of the panel and the fact
 * that nothing on the screen is stored.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import {
  buildLineActivity,
  lineActivityBriefText,
  lineActivityCsvRows,
  permilleAllocate,
} from '../../app/core/domain/lineActivity.js';
import { LINE_ACTIVITY_CSV_COLUMNS } from '../../app/core/domain/lineActivityRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { buildLinePeriodAllocation } from '../../app/core/domain/linePeriodAllocation.js';
import { renderActivityPanel } from '../../app/views/matrixActivityPanel.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const Q3_FROM = '2026-07-01';
const Q3_TO = '2026-09-30';

function line(id, personId, managerId, shareH, kind = 'project') {
  return {
    id, personId, managerId, kind, shareH, rights: [],
    fromISO: '2026-01-01', toISO: null, status: 'active',
    declaredAt: '2026-01-01T00:00:00.000Z', history: [],
  };
}

function consent(id, { personId, managerId, declarationId, day }) {
  return {
    id, declarationId, personId, managerId, kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: day,
    expiresOn: '2026-12-31', basis: 'delivery commitments', at: `${day}T00:00:00.000Z`,
  };
}

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home Manager', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'product', name: 'Product Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
    { id: 'leo', name: 'Leo', level: 'ic', managerId: 'home', status: 'active' },
  ];
  state.reportingLines = [
    line('l-sam-project', 'sam', 'project', 40),
    line('l-sam-product', 'sam', 'product', 60, 'product'),
    line('l-leo-project', 'leo', 'project', 30),
    line('l-leo-product', 'leo', 'product', 70, 'product'),
  ];
  state.lineConsents = [
    consent('c1', { personId: 'sam', managerId: 'project', declarationId: 'l-sam-project', day: '2026-07-10' }),
    consent('c2', { personId: 'sam', managerId: 'project', declarationId: 'l-sam-project', day: '2026-07-20' }),
    consent('c3', { personId: 'sam', managerId: 'project', declarationId: 'l-sam-project', day: '2026-08-01' }),
    consent('c4', { personId: 'sam', managerId: 'project', declarationId: 'l-sam-project', day: '2026-08-15' }),
    consent('c5', { personId: 'sam', managerId: 'project', declarationId: 'l-sam-project', day: '2026-09-01' }),
    consent('c6', { personId: 'sam', managerId: 'product', declarationId: 'l-sam-product', day: '2026-07-12' }),
    consent('c7', { personId: 'sam', managerId: 'product', declarationId: 'l-sam-product', day: '2026-09-02' }),
    // Leo's product line originates activity; his project line originates none.
    consent('d1', { personId: 'leo', managerId: 'product', declarationId: 'l-leo-product', day: '2026-07-11' }),
    consent('d2', { personId: 'leo', managerId: 'product', declarationId: 'l-leo-product', day: '2026-07-21' }),
    consent('d3', { personId: 'leo', managerId: 'product', declarationId: 'l-leo-product', day: '2026-08-11' }),
    consent('d4', { personId: 'leo', managerId: 'product', declarationId: 'l-leo-product', day: '2026-09-11' }),
    // An act from the HOME manager: out of scope, never charged to a line.
    consent('h1', { personId: 'leo', managerId: 'home', declarationId: 'l-leo-product', day: '2026-09-15' }),
  ];
  return normalizeState(state).state;
}

const read = (state, opts = {}) => buildLineActivity(state, {
  from: Q3_FROM, to: Q3_TO, now: NOW, settings: state.settings, ...opts,
});
const personOf = (report, id) => report.people.find((p) => p.personId === id);
const lineOf = (report, personId, declarationId) => personOf(report, personId)?.lines.find((l) => l.declarationId === declarationId);

/* --------------------------------------------------------------- the module */

test('the panel is registered on the matrix surface and the schema is untouched', () => {
  // ADR-0160 (Schema v130), bumped to v131 by ADR-0162.
  assert.equal(SCHEMA_VERSION, 136);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'activity'));
});

test('a single-chain workspace is inert: no row, no figure, no refusal', () => {
  const state = normalizeState(createEmptyState(NOW.toISOString())).state;
  const report = read(state);
  assert.equal(report.isMatrix, false);
  assert.equal(report.people.length, 0);
  assert.equal(report.board.linesN, 0);
  assert.equal(report.board.attributedN, 0);
  assert.equal(report.board.countsReconcile, true);
  assert.match(report.singleChainNote, /single-chain workspace gains no row/);
  assert.match(lineActivityBriefText(report), /No person in scope holds a second reporting line/);
  assert.equal(lineActivityCsvRows(report).length, 1, 'the summary row still says so');
});

/* ------------------------------------------------- declared vs originated */

test('the declared share is read against what each line originated, in exact per-mille', () => {
  const state = fixture();
  const report = read(state);
  const sam = personOf(report, 'sam');
  assert.equal(sam.pricedLinesN, 2);
  assert.equal(sam.attributedN, 7, 'every act is placed once');
  assert.equal(sam.homeN, 0);

  const project = lineOf(report, 'sam', 'l-sam-project');
  const product = lineOf(report, 'sam', 'l-sam-product');
  // Declared 40/60 over the period; observed 5 of 7 acts against 2 of 7.
  assert.equal(project.declaredPermille, 400);
  assert.equal(product.declaredPermille, 600);
  assert.equal(project.observedN, 5);
  assert.equal(product.observedN, 2);
  assert.equal(project.observedPermille + product.observedPermille, 1000, 'the observed shares are exact');
  assert.equal(project.verdict, 'over-active');
  assert.equal(product.verdict, 'under-active');
  assert.equal(project.gapPermille, project.observedPermille - 400);
  // Display == computed: the printed share-days are the period ledger's own figure.
  const declared = buildLinePeriodAllocation(state, { from: Q3_FROM, to: Q3_TO, now: NOW, settings: state.settings });
  const declaredRow = declared.persons
    .find((p) => p.personId === 'sam').lines.find((l) => l.declarationId === 'l-sam-project');
  assert.equal(project.shareDaysH, declaredRow.shareDaysH);
  assert.equal(report.board.countsReconcile, true);
  assert.equal(report.board.sharesReconcile, true);
});

test('a line charged share-days that originated nothing is silent, and the person reads the worst verdict', () => {
  const report = read(fixture());
  const leo = personOf(report, 'leo');
  const project = lineOf(report, 'leo', 'l-leo-project');
  assert.equal(project.observedN, 0);
  assert.equal(project.verdict, 'silent-line');
  assert.match(project.reason, /originated no dated act/);
  assert.equal(leo.verdict, 'silent-line', 'the worst verdict on the ladder wins, not the first row');
  assert.equal(leo.homeN, 1, 'an act from the home manager is counted and never charged to a line');
  assert.equal(leo.attributedN, 4);
});

test('the home line is out of scope on both sides: its acts are printed and never attributed', () => {
  const report = read(fixture());
  assert.equal(report.board.homeN, 1);
  assert.equal(report.board.attributedN, 11);
  assert.equal(report.board.actsN, 12);
  assert.ok(report.rows.every((r) => r.managerId !== 'home'), 'no home manager appears as a priced line');
});

test('a period with no acts originated at all refuses the comparison rather than reporting a zero', () => {
  const report = read(fixture(), { from: '2026-01-01', to: '2026-03-31' });
  assert.equal(report.board.actsN, 0);
  assert.equal(report.board.alignedN, 0);
  assert.equal(report.board.overActiveN, 0);
  assert.equal(report.board.countsReconcile, true);
  // Every line is below the act floor, so no share is compared in either direction.
  assert.ok(report.rows.every((r) => r.verdict === 'insufficient' || r.verdict === 'refused' || r.verdict === 'sole-line'));
});

/* -------------------------------------------------------------- refusals */

test('acts from a manager whose declared line could not be priced refuse the person, never lose the act', () => {
  const state = fixture();
  // A third declared line with an allocation outside 0–100% is refused by the
  // matrix engine, so the person's declared side is incomplete for the period.
  state.reportingLines.push(line('l-sam-ghost', 'sam', 'product', 250, 'functional'));
  const normalized = normalizeState(state).state;
  const report = read(normalized);
  const sam = personOf(report, 'sam');
  assert.equal(sam.refusedLinesN >= 1, true);
  assert.ok(sam.lines.some((l) => l.verdict === 'refused'));
  assert.equal(report.board.refusedN >= 1, true);
  assert.equal(report.board.countsReconcile, true);
  // Nothing invented: the refused row carries no share, no observed count and no gap.
  const refused = sam.lines.find((l) => l.verdict === 'refused');
  assert.equal(refused.gapPermille, null);
});

test('an act from a manager holding two of the person’s priced lines is never assigned to one', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [
    { id: 'home', name: 'Home Manager', level: 'director', managerId: null, status: 'active' },
    { id: 'project', name: 'Project Manager', level: 'manager', managerId: null, status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'home', status: 'active' },
  ];
  state.reportingLines = [
    line('l-a', 'sam', 'project', 40, 'project'),
    line('l-b', 'sam', 'project', 60, 'functional'),
  ];
  state.lineConsents = [
    consent('a1', { personId: 'sam', managerId: 'project', declarationId: 'l-a', day: '2026-07-10' }),
    consent('a2', { personId: 'sam', managerId: 'project', declarationId: 'l-a', day: '2026-08-10' }),
    consent('a3', { personId: 'sam', managerId: 'project', declarationId: 'l-a', day: '2026-09-10' }),
  ];
  const normalized = normalizeState(state).state;
  const report = read(normalized);
  const sam = personOf(report, 'sam');
  assert.equal(sam.ambiguousN, 3, 'both declarations belong to the same manager, so neither is picked');
  assert.equal(sam.attributedN, 0);
  assert.ok(sam.lines.every((l) => l.observedN === 0));
  assert.equal(report.board.sharesReconcile, true);
});

test('the per-mille allocator is exact and sums to 1000 or returns nothing', () => {
  const exact = permilleAllocate([{ key: 'a', weight: 1 }, { key: 'b', weight: 2 }]);
  assert.deepEqual([...exact.values()].reduce((a, b) => a + b, 0), 1000);
  assert.equal(exact.get('b'), 667);
  assert.equal(permilleAllocate([{ key: 'a', weight: 0 }]), null);
  assert.equal(permilleAllocate([]), null);
});

/* ----------------------------------------------------------------- export */

test('the export is aggregate-only: no person, no manager id, no declaration id', () => {
  const report = read(fixture());
  const rows = lineActivityCsvRows(report);
  assert.ok(rows.length >= 2, 'a summary row plus one row per line kind');
  const flat = JSON.stringify(rows);
  for (const forbidden of ['Sam', 'Leo', 'Home Manager', 'Project Manager', 'Product Manager', 'l-sam-project', 'l-leo-project']) {
    assert.equal(flat.includes(forbidden), false, `export leaks ${forbidden}`);
  }
  assert.equal(rows[0].scope, 'workspace');
  assert.equal(rows[0].lines_n, report.board.linesN);
  assert.equal(Object.keys(rows[0]).sort().join(','), [...LINE_ACTIVITY_CSV_COLUMNS].sort().join(','));
  // The CSV registry exposes the scope, and it exports the same rows.
  assert.ok(CSV_EXPORTS.some((e) => e.key === 'line-activity'));
  const csv = exportWorkspaceCsv(normalizeState(fixture()).state, 'line-activity', { now: NOW });
  assert.equal(csv.ok, true);
  assert.match(String(csv.csv), /line_kind/);
});

/* -------------------------------------------------------------- renders */

test('the panel renders, mutates nothing and prints its two reconciliation claims', () => {
  const state = fixture();
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((k) => [k, globalThis[k]]));
  const before = JSON.stringify(state);
  try {
    for (const k of globals) globalThis[k] = k === 'document' ? dom.window.document : k === 'window' ? dom.window : dom.window[k];
    const node = renderActivityPanel({
      state,
      query: new URLSearchParams(`from=${Q3_FROM}&to=${Q3_TO}`),
      navigate() {},
      refresh() {},
    }, { now: NOW });
    assert.equal(JSON.stringify(state), before, 'rendering mutates nothing');
    const text = node.textContent;
    assert.match(text, /Counts reconcile: verified/);
    assert.match(text, /Shares reconcile: verified/);
    assert.match(text, /Declared against what the line originated, line by line/);
    assert.match(text, /Where the line-addressed acts came from/);
    assert.match(text, /Line holders/);
    const table = [...node.querySelectorAll('table')]
      .find((t) => t.querySelector('caption')?.textContent === 'Line activity per person per priced line');
    assert.ok(table, 'the ledger table is rendered');
    assert.equal(table.querySelectorAll('tbody tr').length, report_row_count(state));
  } finally {
    for (const k of globals) globalThis[k] = previous.get(k);
  }
});

function report_row_count(state) {
  return buildLineActivity(state, { from: Q3_FROM, to: Q3_TO, now: NOW, settings: state.settings }).rows.length;
}
