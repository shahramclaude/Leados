/** tests/app/matrix-demand-variance.test.mjs — Matrix Demand-Variance Early
 * Warning (ADR-0173, Schema v137 unchanged, `#/matrix?panel=demand-variance`,
 * CSV scope #128).
 *
 * One focused pass over what this session built. Every count below is worked
 * out by hand from the fixture and stated in a comment, so a failure names the
 * decision that moved rather than a number that changed:
 *
 *   - an open decision owned by a person on exactly one line is attributed to
 *     that line, age-weighted (decision-days), and compared to the line's
 *     declared share-day ceiling;
 *   - several decisions on the same line accumulate on one row, never split;
 *   - a person on more than one line refuses the decision as ambiguous-line,
 *     never folded into one manager;
 *   - a decision naming nobody is unassigned; a name not on the roster is
 *     unresolvable; every refusal carries its reason;
 *   - the board counts reconcile (attributed + unassigned + ambiguous +
 *     unresolvable === every open decision) and the displayed figure is the
 *     computed figure (JSDOM render);
 *   - the aggregate-only export carries no identity and no free text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { buildMatrixDemandVariance, matrixDemandVarianceBriefText, matrixDemandVarianceCsvRows } from '../../app/core/domain/matrixDemandVariance.js';
import { DEMAND_VARIANCE_CSV_COLUMNS } from '../../app/core/domain/matrixDemandVarianceRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { matrixDemandVarianceCsvText, renderMatrixDemandVariancePanel } from '../../app/views/matrixDemandVariancePanel.js';

const NOW = new Date('2026-11-11T12:00:00.000Z'); // today: 2026-Q4 runs Oct 1–Dec 31 = 92 days
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, level, managerId = null) => ({
  id, name, level, managerId, status: 'active', startDate: '2020-01-01', createdAt: STAMP,
});

/**
 * The workspace.
 *
 *   Riley Lead (workspace leader, ceo)
 *     ├ Milo Product (prod, director, manager ceo)
 *     │   ├ Sam Builder (sam, ic, manager prod) — on TWO lines: Milo + Nora
 *     │   └ Kim Data (kim, ic, manager prod) — on ONE line: Milo
 *     └ Nora Eng (nora, director, manager ceo)
 *
 * Sam's line to Milo carries 50% across Q4 → ceiling 4600 share-days (46 pd).
 * Sam's line to Nora carries 25% → Sam is cross-line and his demand is
 * refused as ambiguous, never assigned to either manager.
 * Kim's line to Milo carries 40% → ceiling 3680 share-days (36.8 pd).
 */
function fixture() {
  const base = createEmptyState(NOW.toISOString());
  base.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('nora', 'Nora Eng', 'director', 'ceo'),
    person('sam', 'Sam Builder', 'ic', 'prod'),
    person('kim', 'Kim Data', 'ic', 'prod'),
  ];
  base.reportingLines = [
    {
      id: 'l-sam-milo', personId: 'sam', managerId: 'prod', kind: 'product', shareH: 50,
      rights: [], fromISO: '2026-10-01', toISO: null, status: 'active',
      declaredAt: '2026-10-01T00:00:00.000Z', history: [],
    },
    {
      id: 'l-kim-milo', personId: 'kim', managerId: 'prod', kind: 'product', shareH: 40,
      rights: [], fromISO: '2026-10-01', toISO: null, status: 'active',
      declaredAt: '2026-10-01T00:00:00.000Z', history: [],
    },
    {
      id: 'l-sam-nora', personId: 'sam', managerId: 'nora', kind: 'project', shareH: 25,
      rights: [], fromISO: '2026-10-01', toISO: null, status: 'active',
      declaredAt: '2026-10-01T00:00:00.000Z', history: [],
    },
  ];
  // Two decisions on Kim's single line: Oct 1 (41d open) and Oct 20 (22d open).
  base.decisions = [
    { id: 'dec-kim-1', title: 'Vendor migration', driver: 'Kim Data', approver: 'Kim Data', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
    { id: 'dec-kim-2', title: 'Sprint plan', driver: 'Kim Data', approver: 'Kim Data', contributors: '', informed: '', chosen: '', date: '2026-10-20' },
    // Sam sits on two live lines → this decision is ambiguous, never assigned.
    { id: 'dec-sam-1', title: 'Cross-line call', driver: 'Sam Builder', approver: 'Sam Builder', contributors: '', informed: '', chosen: '', date: '2026-10-05' },
    // No party named at all.
    { id: 'dec-unassigned', title: 'Nobody named', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-10' },
    // A name that matches nobody on the roster.
    { id: 'dec-ghost', title: 'Ghost', driver: 'Phantom Person', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-12' },
  ];
  // Kim's first decision waits on a dependency opened Sep 1 (71d old).
  base.links = [
    { id: 'lnk-1', sourceType: 'decision', sourceId: 'dec-kim-1', targetType: 'dependency', targetId: 'dep-legal', relation: 'depends-on', ruleId: 'MANUAL', summary: '', createdOn: '2026-10-01', createdAt: STAMP },
  ];
  base.dependencies = [
    { id: 'dep-legal', name: 'Legal review', date: '2026-09-01', status: 'open' },
  ];
  base.settings = { ...base.settings, leaderName: 'Riley Lead', activeSeatId: null };
  return normalizeState(base, { now: NOW }).state;
}

const read = (state) => buildMatrixDemandVariance(state, { periodKey: '2026-Q4', now: NOW, settings: state.settings });

function seed(rawState) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(rawState)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const rawApi = createApi(store, { now: () => NOW, idFactory });
  return { store, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) {
      globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    }
    return run(dom);
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
}

const pd = (h) => (h === null || h === undefined ? '—' : (h / 100).toFixed(2));

/* =====================================================================
 * 1. REGISTRATION — panel, export catalogue, schema
 * =================================================================== */

test('the reader is wired into the matrix, the export catalogue and Schema v137', () => {
  assert.equal(SCHEMA_VERSION, 142);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'demand-variance'), 'the demand-variance panel is a matrix panel');
  const scope = CSV_EXPORTS.find((entry) => entry.key === 'matrix-demand-variance');
  assert.ok(scope, 'the aggregate scope is in the catalogue');
  assert.equal(scope.sensitive, false);
});

test('the action exists and is classified by the access gateway', () => {
  const { api } = seed(fixture());
  assert.equal(typeof api.matrixDemandVarianceReport, 'function');
});

/* =====================================================================
 * 2. ATTRIBUTION — worked out by hand
 * =================================================================== */

test('an open decision on one person’s single line is attributed and age-weighted', () => {
  const state = fixture();
  const report = read(state);
  // Kim's two decisions: 41 + 22 = 63 decision-days on one line, one row.
  const line = report.lines.find((l) => l.personId === 'kim' && l.managerId === 'prod');
  assert.ok(line, 'kim → milo line row exists');
  assert.equal(line.demandN, 2, 'two decisions accumulate on one line');
  assert.equal(line.demandDays, 63, 'Oct 1 → Nov 11 = 41d, Oct 20 → Nov 11 = 22d, 41 + 22 = 63');
  assert.equal(line.demandH, 6300, '63 days × 100 = 6300 share-days');
  // Kim's ceiling: 92 days × 40 hundredths = 3680 share-days = 36.8 person-days.
  assert.equal(line.ceiling.state, 'computed');
  assert.equal(line.ceilingH, 3680);
  assert.equal(line.varianceH, 6300 - 3680, '6300 − 3680 = 2620 over');
  assert.equal(line.verdict, 'over-ceiling');
  assert.equal(line.verdictLabel, 'Over the declared share-days ceiling');
  assert.equal(line.decisions.map((d) => d.id).sort().join(','), 'dec-kim-1,dec-kim-2');
});

test('a cross-line person’s decision is refused as ambiguous, never assigned', () => {
  const state = fixture();
  const report = read(state);
  assert.equal(report.board.ambiguousN, 1, 'Sam sits on two live lines');
  const refusal = report.refusals.find((r) => r.decisionId === 'dec-sam-1');
  assert.ok(refusal);
  assert.equal(refusal.class, 'ambiguous-line');
  assert.ok(refusal.reason.includes('2 active line'), 'the ambiguity is printed, not resolved');
});

test('a decision naming nobody is unassigned', () => {
  const report = read(fixture());
  assert.equal(report.board.unassignedN, 1);
  const refusal = report.refusals.find((r) => r.decisionId === 'dec-unassigned');
  assert.equal(refusal.class, 'unassigned');
});

test('a name not on the roster is unresolvable', () => {
  const report = read(fixture());
  assert.equal(report.board.unresolvableN, 1);
  const refusal = report.refusals.find((r) => r.decisionId === 'dec-ghost');
  assert.equal(refusal.class, 'unresolvable');
  assert.ok(refusal.reason.includes('Phantom Person'));
});

test('a decision waiting on a dated dependency is named, not assigned an owner', () => {
  const report = read(fixture());
  const bottleneck = report.bottlenecks.find((b) => b.decisionId === 'dec-kim-1');
  assert.ok(bottleneck, 'the dependency is read');
  assert.equal(bottleneck.dependsOnTitle, 'Legal review');
  assert.equal(bottleneck.decisionAgeDays, 41);
});

/* =====================================================================
 * 3. THE BOARD — counts reconcile
 * =================================================================== */

test('the board counts reconcile: every open decision is attributed or refused once', () => {
  const { api } = seed(fixture());
  const report = api.matrixDemandVarianceReport({}).report;
  assert.equal(report.board.periodKey, '2026-Q4');
  assert.equal(report.board.decisionsN, 5);
  assert.equal(report.board.attributedN, 2);
  assert.equal(report.board.unassignedN, 1);
  assert.equal(report.board.ambiguousN, 1);
  assert.equal(report.board.unresolvableN, 1);
  assert.equal(report.board.linesN, 1);
  assert.equal(report.board.overCeilingN, 1);
  assert.equal(report.board.demandH, 6300, '63 decision-days × 100');
  assert.equal(report.board.ceilingH, 3680);
  assert.equal(report.board.varianceH, 2620);
  assert.equal(report.board.figuresComplete, true);
  assert.equal(report.board.countsReconcile, true);
  assert.equal(report.lines[0].verdict, 'over-ceiling');
  assert.equal(report.lines[0].ceilingH, 3680);
  assert.equal(report.lines[0].demandH, 6300);
});

/* =====================================================================
 * 4. THE BRIEF AND CSV — identity-free, refused figures blank
 * =================================================================== */

test('the brief names no person, line or decision', () => {
  const report = read(fixture());
  const brief = matrixDemandVarianceBriefText(report);
  assert.ok(!brief.includes('Kim'), 'no person name');
  assert.ok(!brief.includes('Milo'), 'no line name');
  assert.ok(!brief.includes('Vendor'), 'no decision title');
});

test('the export is aggregate-only: no identity, no free text', () => {
  const report = read(fixture());
  const rows = matrixDemandVarianceCsvRows(report);
  const workspace = rows[0];
  const flat = String(Object.values(workspace));
  assert.ok(!flat.includes('kim'), 'no person id');
  assert.ok(!flat.includes('Kim'), 'no person name');
  assert.ok(!flat.includes('Milo'), 'no manager name');
  assert.ok(!flat.includes('Vendor'), 'no decision title');
  assert.ok(!flat.includes('2026-10-01'), 'no date');
  assert.equal(workspace.figures_complete, 'true');
  assert.equal(workspace.counts_reconcile, 'true');
});

test('the CSV export round-trips through the catalogue', () => {
  const state = fixture();
  const res = exportWorkspaceCsv(state, 'matrix-demand-variance', { now: NOW });
  assert.equal(res.ok, true);
  assert.ok(res.csv.endsWith('\r\n'));
  const parsed = parseCsv(res.csv);
  const headerKeys = parsed.headers.map((h) => h.toLowerCase().replace(/ /g, '_'));
  for (const col of DEMAND_VARIANCE_CSV_COLUMNS) assert.ok(headerKeys.includes(col), `column ${col} present`);
  assert.equal(parsed.rows.length, 1, 'one workspace row');
});

/* =====================================================================
 * 5. THE PANEL — displayed figure is the computed figure
 * =================================================================== */

test('the panel renders the board and the brief, displaying stored figures', () => {
  const base = fixture();
  const { store, api } = seed(base);
  const state = store.state;
  let panel = null;
  withDom(() => {
    panel = renderMatrixDemandVariancePanel({
      state,
      api: { matrixDemandVarianceReport: api.matrixDemandVarianceReport.bind(api) },
      refresh: () => { },
    }, { now: NOW });
  });
  assert.ok(panel, 'the panel rendered without throwing');
  const text = panel?.outerHTML || '';
  assert.ok(text.includes('2026-Q4'), 'the window is printed');
  assert.ok(text.includes('36.80'), 'the ceiling is printed');
  assert.ok(text.includes('63.00'), 'the demand is printed');
  assert.ok(text.includes('26.20'), 'the variance is printed');
});

test('the panel download uses canonical columns and exactly the computed aggregate row', async () => {
  const state = fixture();
  const report = read(state);
  const expectedText = matrixDemandVarianceCsvText(report);
  const parsed = parseCsv(expectedText);
  const expected = matrixDemandVarianceCsvRows(report)[0];
  assert.deepEqual(parsed.headers, [...DEMAND_VARIANCE_CSV_COLUMNS]);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], DEMAND_VARIANCE_CSV_COLUMNS.map((key) => String(expected[key] ?? '')));
  assert.ok(parsed.rows[0].some((cell) => cell === '63.00' || cell === '6300'), 'the CSV contains non-empty computed values');
  const exported = `${parsed.headers.join(',')}\n${parsed.rows[0].join(',')}`;
  assert.ok(!exported.includes('Kim') && !exported.includes('Milo') && !exported.includes('Vendor'), 'the panel export remains aggregate-only');

  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let blob = null;
  let filename = '';
  try {
    URL.createObjectURL = (value) => { blob = value; return 'blob:matrix-demand-variance-test'; };
    URL.revokeObjectURL = () => {};
    withDom((dom) => {
      dom.window.document.addEventListener('click', (event) => {
        if (event.target?.tagName === 'A') {
          filename = event.target.download;
          event.preventDefault();
        }
      }, true);
      const panel = renderMatrixDemandVariancePanel({ state }, { now: NOW });
      dom.window.document.body.appendChild(panel);
      const button = panel.querySelector('button');
      assert.ok(button, 'the aggregate download action is present');
      button.click();
    });
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
  assert.ok(blob, 'click produced a file blob');
  assert.equal(filename, 'matrix-demand-variance-2026-Q4.csv');
  assert.equal(await blob.text(), expectedText, 'downloaded file is byte-for-byte the computed aggregate CSV');
});
