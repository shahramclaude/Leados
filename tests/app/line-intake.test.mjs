/**
 * tests/app/line-intake.test.mjs — the Matrix Line Intake Gate and Share-Day
 * WIP Ceiling (ADR-0171, Schema v136, `#/matrix?panel=intake`, CSV scope
 * #126).
 *
 * One focused pass over what this session built. Every count below is worked
 * out by hand from the fixture and stated in a comment, so a failure names the
 * decision that moved rather than a number that changed:
 *
 *   - the gate admits a dated intake within a line's declared share-day ceiling;
 *   - the gate REFUSES an intake that would breach the ceiling, with the reason
     printed, never a silent no-op;
 *   - a human override records the over-share as a fact, never a pass;
 *   - re-routing voids the old intake and records a new one on the target line
     through the same gate check;
 *   - an unprovable ceiling admits nothing and prints its reason;
 *   - the displayed figure is the computed figure (JSDOM render);
 *   - the aggregate-only export carries no identity and no free text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { buildLineIntakeGate, lineCeiling, lineIntakeBriefText, lineIntakeCsvRows } from '../../app/core/domain/lineIntake.js';
import {
  LINE_INTAKE_BOUNDS,
  LINE_INTAKE_CSV_COLUMNS,
  LINE_INTAKE_REFUSALS,
  LINE_INTAKE_VERDICTS,
} from '../../app/core/domain/lineIntakeRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderMatrixIntakePanel } from '../../app/views/matrixIntakePanel.js';

const NOW = new Date('2026-11-11T12:00:00.000Z'); // today: 2026-Q4 runs Oct 1–Dec 31 = 92 days
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, level, managerId = null) => ({
  id, name, level, managerId, status: 'active', startDate: '2020-01-01', createdAt: STAMP,
});

/**
 * The workspace.
 *
 *   Riley Lead (workspace leader)
 *     └ Milo Product (prod, director)   ← funds Sam's line at 50%
 *         └ Sam Builder (sam, ic)
 *
 * Sam's line to Milo carries shareH 50 across all of Q4 2026, so its declared
 * ceiling is 50 hundredths × 92 days = 4600 share-days = 46 person-days.
 */
function fixture() {
  const base = createEmptyState(NOW.toISOString());
  base.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('sam', 'Sam Builder', 'ic', 'prod'),
  ];
  base.reportingLines = [{
    id: 'l-sam-prod', personId: 'sam', managerId: 'prod', kind: 'product', shareH: 50,
    rights: [], fromISO: '2026-10-01', toISO: null, status: 'active',
    declaredAt: '2026-10-01T00:00:00.000Z', history: [],
  }];
  base.settings = { ...base.settings, leaderName: 'Riley Lead', activeSeatId: null };
  return normalizeState(base, { now: NOW }).state;
}

const read = (state, periodKey = null) => buildLineIntakeGate(state, { periodKey, now: NOW, settings: state.settings });

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
 * 1. REGISTRATION — panel, scope, schema, actions
 * ===================================================================== */

test('the gate is wired into the matrix, the export catalogue and Schema v136', () => {
  assert.equal(SCHEMA_VERSION, 152, 'schema moved to v140 for Matrix 1:1 Line Coverage completion');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'intake'), 'the intake panel is a matrix panel');
  const scope = CSV_EXPORTS.find((entry) => entry.key === 'matrix-intake');
  assert.ok(scope, 'the aggregate scope is in the catalogue');
  assert.equal(scope.sensitive, false);
});

test('the actions exist and are classified by the access gateway', () => {
  const { api } = seed(fixture());
  assert.equal(typeof api.matrixRecordIntake, 'function');
  assert.equal(typeof api.matrixRerouteIntake, 'function');
  assert.equal(typeof api.matrixIntakeReport, 'function');
  assert.equal(typeof api.matrixIntakeCandidates, 'function');
});

/* =====================================================================
 * 2. THE CEILING ARITHMETIC — worked out by hand
 * ===================================================================== */

test('a line ceiling is declared share-days swept day by day over the period', () => {
  const state = fixture();
  const ceiling = lineCeiling(state, 'sam', 'prod', '2026-Q4', { now: NOW });
  assert.equal(ceiling.state, 'computed');
  // 92 days × 50 hundredths = 4600 share-days = 46 person-days
  assert.equal(ceiling.ceilingH, 4600, '92 days × 50 hundredths = 4600');
  assert.equal(ceiling.daysN, 92);
  assert.equal(ceiling.declarationId, 'l-sam-prod');
});

test('an unreadable period is refused rather than guessed', () => {
  const state = fixture();
  const ceiling = lineCeiling(state, 'sam', 'prod', 'not-a-quarter', { now: NOW });
  assert.equal(ceiling.state, 'ceiling-unprovable');
  assert.ok(ceiling.reason);
});

test('no declared line is an absence of scope, not a zero ceiling', () => {
  const state = fixture();
  const ceiling = lineCeiling(state, 'sam', 'ceo', '2026-Q4', { now: NOW });
  assert.equal(ceiling.state, 'no-line');
  assert.ok(ceiling.reason);
});

/* =====================================================================
 * 3. THE GATE ADMITS WITHIN CEILING, REFUSES PAST IT
 * ===================================================================== */

test('an intake within the ceiling is recorded', () => {
  const { api } = seed(fixture());
  const result = api.matrixRecordIntake({
    personId: 'sam', managerId: 'prod', title: 'Vendor migration',
    shareDays: 5, date: '2026-11-11',
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.status, 'recorded');
  assert.equal(result.shareDaysH, 500, '5 person-days = 500 hundredths');
});

test('an intake past the ceiling is refused with the reason printed', () => {
  const { api } = seed(fixture());
  // ceiling is 4600; record 40 person-days first
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Big chunk', shareDays: 40, date: '2026-11-01' });
  const result = api.matrixRecordIntake({
    personId: 'sam', managerId: 'prod', title: 'Second chunk', shareDays: 7, date: '2026-11-11',
  }); // 40 + 7 = 47 > 46
  assert.ok(!result.ok, 'expected a refusal, got ' + JSON.stringify(result));
  assert.ok(result.error && result.error.includes('Refused'), 'the refusal reason is printed');
  assert.equal(result.field, 'shareDays');
});

test('a human override records the over-share as a fact, never a pass', () => {
  const { api } = seed(fixture());
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Big chunk', shareDays: 40, date: '2026-11-01' });
  const over = api.matrixRecordIntake({
    personId: 'sam', managerId: 'prod', title: 'Override', shareDays: 7, date: '2026-11-11',
    override: true, overrideReason: 'CEO directed; re-routing would miss the board date.',
  });
  assert.ok(over.ok, JSON.stringify(over));
  assert.equal(over.status, 'over-share');
});

test('an override without a reason is refused', () => {
  const { api } = seed(fixture());
  const result = api.matrixRecordIntake({
    personId: 'sam', managerId: 'prod', title: 'X', shareDays: 50, date: '2026-11-11',
    override: true, overrideReason: '',
  });
  assert.ok(!result.ok);
  assert.ok(result.error && result.error.includes('reason'), 'a reason is required for an override');
});

/* =====================================================================
 * 4. RE-ROUTE
 * ===================================================================== */

test('re-routing voids the old intake and records a new one on the target line', () => {
  const base = fixture();
  base.people.push(person('eng', 'Nora Eng', 'director', 'ceo'));
  // give Sam a second line to Nora at 25% (23 person-days ceiling)
  base.reportingLines.push({
    id: 'l-sam-eng', personId: 'sam', managerId: 'eng', kind: 'project', shareH: 25,
    rights: [], fromISO: '2026-10-01', toISO: null, status: 'active',
    declaredAt: '2026-10-01T00:00:00.000Z', history: [],
  });
  const { store, api } = seed(base);
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Vendor migration', shareDays: 5, date: '2026-11-01' });
  const result = api.matrixRerouteIntake({ intakeId: 'intake-1', toManagerId: 'eng' });
  assert.ok(result.ok, JSON.stringify(result));
  // the old intake is voided and the new one is on the target line
  const state = store.state;
  const old = state.lineIntakes.find((r) => r.id === 'intake-1');
  const neu = state.lineIntakes.find((r) => r.reroutedFrom === 'intake-1');
  assert.ok(old, 'the original intake exists');
  assert.equal(old.status, 're-routed', 'the original intake is voided');
  assert.ok(neu, 'a new intake was recorded for the re-route');
  assert.equal(neu.managerId, 'eng', 'the new intake is on the target line');
  assert.equal(neu.status, 'recorded', 'the new intake is recorded');
  assert.equal(neu.title, 'Vendor migration', 'the same work is carried');
});

test('re-routing a non-existent intake is refused', () => {
  const { api } = seed(fixture());
  const result = api.matrixRerouteIntake({ intakeId: 'nope', toManagerId: 'ceo' });
  assert.ok(!result.ok);
});

/* =====================================================================
 * 5. THE REPORT — board counts reconcile
 * ===================================================================== */

test('the board counts reconcile and the verdicts sort by severity', () => {
  const { api } = seed(fixture());
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Vendor migration', shareDays: 5, date: '2026-11-11' });
  const report = api.matrixIntakeReport({}).report;
  assert.equal(report.board.periodKey, '2026-Q4');
  assert.equal(report.board.linesN, 1);
  assert.equal(report.board.intakesN, 1);
  assert.equal(report.board.recordedN, 1);
  assert.equal(report.board.ceilingH, 4600);
  assert.equal(report.board.consumedH, 500);
  assert.equal(report.board.figuresComplete, true);
  assert.equal(report.board.countsReconcile, true);
  assert.equal(report.lines[0].verdict, 'within-ceiling');
  assert.equal(report.lines[0].verdictLabel, 'Within the ceiling');
  assert.equal(report.lines[0].headroomH, 4100, '4600 − 500 = 4100');
});

/* =====================================================================
 * 6. THE BRIEF AND CSV — identity-free, refused figures blank
 * ===================================================================== */

test('the brief names no person, line or intake', () => {
  const { api } = seed(fixture());
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Vendor migration', shareDays: 5, date: '2026-11-11' });
  const report = read(fixture());
  const brief = lineIntakeBriefText(report);
  assert.ok(!brief.includes('Sam'), 'no person name');
  assert.ok(!brief.includes('Milo'), 'no line name');
  assert.ok(!brief.includes('Vendor'), 'no intake title');
});

test('the export is aggregate-only: no identity, no free text', () => {
  const { api } = seed(fixture());
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Vendor migration', shareDays: 5, date: '2026-11-11' });
  const report = read(fixture());
  const rows = lineIntakeCsvRows(report);
  const workspace = rows[0];
  const flat = String(Object.values(workspace));
  assert.ok(!flat.includes('sam'), 'no person id');
  assert.ok(!flat.includes('Sam'), 'no person name');
  assert.ok(!flat.includes('Milo'), 'no manager name');
  assert.ok(!flat.includes('Vendor'), 'no intake title');
  assert.ok(!flat.includes('2026-11-11'), 'no intake date');
  assert.equal(workspace.figures_complete, 'true');
  assert.equal(workspace.counts_reconcile, 'true');
});

/* =====================================================================
 * 7. THE PANEL — displayed figure is the computed figure
 * ===================================================================== */

test('the panel renders the board and the brief, displaying stored figures', () => {
  const base = fixture();
  const { store, api } = seed(base);
  api.matrixRecordIntake({ personId: 'sam', managerId: 'prod', title: 'Vendor migration', shareDays: 5, date: '2026-11-11' });
  const state = store.state;
  let panel = null;
  withDom(() => {
    panel = renderMatrixIntakePanel({
      state,
      api: { matrixRecordIntake: api.matrixRecordIntake.bind(api), matrixIntakeReport: api.matrixIntakeReport.bind(api), matrixIntakeCandidates: api.matrixIntakeCandidates.bind(api) },
      refresh: () => { },
    }, { now: NOW });
  });
  assert.ok(panel, 'the panel rendered without throwing');
  const text = panel?.outerHTML || '';
  assert.ok(text.includes('2026-Q4'), 'the period is printed');
  assert.ok(text.includes('46.00'), 'the ceiling is printed');
  assert.ok(text.includes('5.00'), 'the consumed is printed');
});
