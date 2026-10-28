/**
 * tests/app/finance.test.mjs — Budget & Financial Commitments (Schema v24).
 *
 * Frameworks applied and asserted here:
 *   - Commitment/encumbrance accounting (GASB budgetary accounting): planned,
 *     committed, spent and released are distinct states; forecast at
 *     completion = recorded actuals + open encumbrances, planned excluded.
 *   - Budgetary control (Anthony & Govindarajan): RULE-FIN-01 acts on the
 *     forecast breach with exactly one open DACI trade-off, idempotently.
 *   - Closed-loop control (Deming PDCA): RULE-FIN-02 links lines to funded
 *     work, logs neutral goal telemetry, and stamps actuals-due in the same
 *     transaction that completes the funded case — amounts never copied.
 *   - Reference-class learning (Flyvbjerg, 2006): RULE-FIN-03 scores
 *     actual/committed ratios (dimensionless, pooling across currencies
 *     without FX), counts-only below n=5.
 *   - Honesty invariants: missing actuals are gaps, not zeros; one currency
 *     per envelope; demo fires no FIN-* findings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  budgetsRollup,
  calibratedForecast,
  commitmentCalibration,
  evaluateBudget,
} from '../../app/core/domain/finance.js';
import { calibrationSummary } from '../../app/core/domain/calibration.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { linksForEntity } from '../../app/core/domain/cases.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 15));

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-fin-${++seq}`;
  const store = createStore({ storage: memStorage(), now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const line = (over = {}) => ({
  id: `l-${Math.random()}`,
  title: 'Line',
  category: 'other',
  status: 'planned',
  committedAmount: null,
  actualAmount: null,
  committedOn: null,
  expectedOn: null,
  spentOn: null,
  releasedOn: null,
  releasedReason: '',
  actualsDueOn: null,
  sourceType: null,
  sourceId: null,
  ownerId: null,
  note: '',
  ...over,
});

/* ------------------------------------------------------------ engine maths */

test('evaluateBudget: FAC is actuals + encumbrances; planned/released excluded; gaps stay gaps', () => {
  const budget = {
    id: 'bud-1', name: 'Q4', currency: 'EUR', limit: 10000, status: 'active',
    startsOn: '2026-10-01', endsOn: '2026-12-31',
    lines: [
      line({ id: 'a', status: 'spent', committedAmount: 3000, actualAmount: 2800, spentOn: '2026-10-10' }),
      line({ id: 'b', status: 'committed', committedAmount: 4000 }),
      line({ id: 'c', status: 'planned', committedAmount: 9000 }),
      line({ id: 'd', status: 'released', committedAmount: 5000 }),
      line({ id: 'e', status: 'spent', committedAmount: 1000, actualAmount: null }),
      line({ id: 'f', status: 'committed', committedAmount: null }),
    ],
  };
  const ev = evaluateBudget(budget, NOW);
  assert.equal(ev.spentKnown, 2800, 'only recorded actuals count as spent');
  assert.equal(ev.committedOpen, 4000);
  assert.equal(ev.forecastAtCompletion, 6800, 'planned and released never enter FAC');
  assert.equal(ev.pipelineExposure, 15800);
  assert.equal(ev.plannedPipeline, 9000);
  assert.equal(ev.missingActualLines.length, 1, 'spent-without-actual is a listed gap, not zero');
  assert.equal(ev.unpricedOpenCount, 1, 'unpriced commitment counted, never valued');
  assert.equal(ev.forecastUnderstated, true);
  assert.equal(ev.breach, false);
  assert.equal(ev.pipelineBreach, true, 'pipeline over ceiling is its own visible state');
  assert.equal(ev.remainingVsLimit, 3200);
  assert.equal(ev.currency, 'EUR');
});

test('evaluateBudget: breach/watch boundaries and tracking-only envelopes', () => {
  const mk = (committed) => ({
    id: 'b', name: 'B', currency: 'USD', limit: 1000, status: 'active',
    lines: [line({ status: 'committed', committedAmount: committed })],
  });
  assert.equal(evaluateBudget(mk(1000), NOW).breach, false, 'exactly at ceiling is not a breach');
  assert.equal(evaluateBudget(mk(1000), NOW).watch, true);
  assert.equal(evaluateBudget(mk(800), NOW).watch, true, 'exactly 80% enters the watch zone');
  assert.equal(evaluateBudget(mk(799), NOW).watch, false);
  assert.equal(evaluateBudget(mk(1001), NOW).breach, true);
  const tracking = evaluateBudget({ id: 'b', name: 'B', currency: 'USD', limit: null, status: 'active', lines: [line({ status: 'committed', committedAmount: 5000 })] }, NOW);
  assert.equal(tracking.hasLimit, false);
  assert.equal(tracking.breach, false, 'no recorded ceiling can never breach');
  assert.equal(tracking.forecastUtilisation, null);
});

test('commitmentCalibration: counts-only below n=5, dimensionless pooling across currencies', () => {
  const spent = (id, committedAmount, actualAmount) => line({ id, status: 'spent', committedAmount, actualAmount, spentOn: '2026-10-01' });
  const state = {
    budgets: [
      { id: 'usd', name: 'USD env', currency: 'USD', status: 'active', limit: null, lines: [spent('u1', 100, 130), spent('u2', 200, 260), spent('u3', 50, null)] },
      { id: 'eur', name: 'EUR env', currency: 'EUR', status: 'active', limit: null, lines: [spent('e1', 100, 120), spent('e2', 100, 140)] },
    ],
  };
  const four = commitmentCalibration(state);
  assert.equal(four.n, 4);
  assert.equal(four.sufficient, false);
  assert.equal(four.medianRatio, null, 'no median below the evidence floor');
  assert.equal(four.missingItems.length, 1, 'spent without actual stays in the follow-up queue');

  state.budgets[1].lines.push(spent('e3', 100, 110));
  const five = commitmentCalibration(state);
  assert.equal(five.n, 5);
  assert.equal(five.sufficient, true);
  assert.equal(five.medianRatio, 1.3, 'ratios 1.3/1.3/1.2/1.4/1.1 → median 1.3 across currencies, no FX');
  assert.equal(five.materialOverrun, true, 'median ≥1.2 raises the review trigger');
  assert.equal(calibrationSummary({ ...createEmptyState(), budgets: state.budgets }).commitments.n, 5, 'fifth ledger joins calibrationSummary');
});

/* ------------------------------------------------------------- schema v24 */

test('schema v24: migration is additive; normalisation keeps amounts, clears dead pointers', () => {
  assert.equal(SCHEMA_VERSION, 42);
  const migrated = migrate({ schemaVersion: 23, settings: {}, cases: [{ id: 'keep-me' }] });
  assert.equal(migrated.raw.schemaVersion, 42);
  assert.deepEqual(migrated.raw.budgets, [], 'no envelope is invented for older workspaces');
  assert.equal(migrated.raw.settings.budgetWatchPct, 80);
  assert.ok(migrated.applied.includes('23 → 24'));
  assert.ok(migrated.applied.includes('24 → 25'), 'v25 stakeholder register migration is additive');

  const base = createEmptyState(NOW.toISOString());
  const { state } = normalizeState({
    ...base,
    budgets: [{
      id: 'bud-1', name: 'Ops', currency: 'gbp', limit: 0, status: 'weird', ownerId: 'ghost',
      lines: [
        { id: 'l1', title: 'Dead source', status: 'committed', committedAmount: 700, actualAmount: 999, sourceType: 'goal', sourceId: 'gone' },
        { id: 'l2', title: 'Future spend', status: 'spent', committedAmount: 10, actualAmount: 12, spentOn: '2999-01-01' },
      ],
    }],
  }, { now: NOW });
  const [b] = state.budgets;
  assert.equal(b.currency, 'GBP');
  assert.equal(b.limit, null, 'zero limit means tracking-only, never a zero ceiling');
  assert.equal(b.status, 'active');
  assert.equal(b.ownerId, null);
  assert.equal(b.lines[0].sourceType, null, 'dead source pointer cleared');
  assert.equal(b.lines[0].committedAmount, 700, '...but the money record survives');
  assert.equal(b.lines[0].actualAmount, null, 'an actual on an unspent line is not scored as spend');
  assert.equal(b.lines[1].spentOn, '2026-10-26', 'future spend date clamped to today');
  assert.equal(state.settings.budgetWatchPct, 80);
});

/* ----------------------------------------------- actions + cross-module rules */

test('RULE-FIN-01: forecast breach opens exactly one DACI trade-off, idempotently', () => {
  const { store, api } = harness();
  const made = api.addBudget({ name: 'Platform Q4', currency: 'USD', limit: 10000 });
  assert.equal(made.ok, true, made.error);
  assert.equal(made.propagations.filter((p) => p.ruleId === 'RULE-FIN-01').length, 0);

  const first = api.addBudgetLine(made.id, { title: 'Licences', status: 'committed', committedAmount: 7000 });
  assert.equal(first.ok, true, first.error);
  assert.equal(store.state.decisions.length, 0, 'within ceiling: no decision');

  const breach = api.addBudgetLine(made.id, { title: 'Contractor', status: 'committed', committedAmount: 5000 });
  assert.equal(breach.ok, true, breach.error);
  assert.ok(breach.propagations.some((p) => p.ruleId === 'RULE-FIN-01' && p.action === 'created'), 'breach propagated in the same transaction');
  assert.equal(store.state.decisions.length, 1);
  const decision = store.state.decisions[0];
  assert.match(decision.title, /Budget forecast breach: Platform Q4/);
  assert.ok(decision.options.some((o) => /Release or defer “Licences”/.test(o.label)), 'release options ranked by encumbered amount');
  assert.ok(decision.options.some((o) => /envelope increase/.test(o.label)), 'explicit increase ask present');
  const edges = linksForEntity(store.state, 'budget', made.id);
  assert.ok(edges.some((e) => e.peer.type === 'decision' && e.link.ruleId === 'RULE-FIN-01'), 'typed decides edge created');
  assert.ok(store.state.events.some((e) => e.summary.startsWith('[RULE-FIN-01]')), 'audit event appended');

  const again = api.addBudgetLine(made.id, { title: 'More tooling', status: 'committed', committedAmount: 100 });
  assert.equal(again.ok, true);
  assert.equal(store.state.decisions.length, 1, 'still exactly one open trade-off while it is undecided');
  assert.ok(AUTOMATION_RULES.some((r) => r.id === 'RULE-FIN-01'));
});

test('RULE-FIN-02: goal funding telemetry is neutral, idempotent, and graph-linked', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Priya', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Billing migration', ownerId: owner.id, dueDate: '2026-12-15' });
  assert.equal(goal.ok, true, goal.error);
  const before = store.state.goals.find((g) => g.id === goal.id);
  const confidenceBefore = before.confidence;
  const checkinsBefore = (before.checkins || []).length;

  const bud = api.addBudget({ name: 'Migration envelope', currency: 'USD', limit: 50000 });
  const added = api.addBudgetLine(bud.id, {
    title: 'Migration tooling', status: 'committed', committedAmount: 12000,
    sourceType: 'goal', sourceId: goal.id,
  });
  assert.equal(added.ok, true, added.error);
  const after = store.state.goals.find((g) => g.id === goal.id);
  assert.equal(after.confidence, confidenceBefore, 'funding telemetry never rewrites goal confidence');
  assert.equal(after.checkins.length, checkinsBefore + 1);
  assert.match(after.checkins.at(-1).note, /\[RULE-FIN-02:.+:committed\] Budget “Migration envelope”: committed USD 12,000/);
  assert.ok(linksForEntity(store.state, 'budget', bud.id).some((e) => e.peer.type === 'goal' && e.link.relation === 'funds'));

  const edited = api.updateBudgetLine(bud.id, added.lineId, { note: 'PO-123' });
  assert.equal(edited.ok, true);
  assert.equal(store.state.goals.find((g) => g.id === goal.id).checkins.length, checkinsBefore + 1, 're-saving never duplicates telemetry');
});

test('RULE-FIN-02 reverse + FIN-03 + RULE-FIN-03: case resolution makes actuals due; evidenced actual scores', () => {
  const { store, api } = harness();
  const kase = api.addCase({
    title: 'Vendor outage exposure', kind: 'risk', openedOn: '2026-09-01',
    fmea: { severity: 7, probability: 5, detectability: 4 },
    financial: { currency: 'USD', optimistic: 5000, mostLikely: 9000, pessimistic: 15000 },
  });
  assert.equal(kase.ok, true, kase.error);
  const bud = api.addBudget({ name: 'Risk envelope', currency: 'USD', limit: 40000 });
  const added = api.addBudgetLine(bud.id, {
    title: 'Outage mitigation retainer', status: 'committed', committedAmount: 9000,
    sourceType: 'case', sourceId: kase.id,
  });
  assert.equal(added.ok, true, added.error);

  const resolved = api.resolveCase(kase.id, { resolvedOn: '2026-10-20', resolutionNotes: 'Guardrail verified.' });
  assert.equal(resolved.ok, true, resolved.error);
  assert.ok(resolved.propagations.some((p) => p.ruleId === 'RULE-FIN-02' && p.action === 'actuals-due'),
    'completion propagated into the budget inside the resolve transaction');
  let storedLine = store.state.budgets[0].lines[0];
  assert.equal(storedLine.actualsDueOn, '2026-10-26');
  assert.equal(storedLine.actualAmount, null, 'no amount was copied from the commitment');
  assert.ok(buildInsights(store.state, NOW).findings.some((f) => f.ruleId === 'FIN-03'), 'FIN-03 surfaces the evidence gap');

  const blank = api.recordBudgetActual(bud.id, added.lineId, { actualAmount: '' });
  assert.equal(blank.ok, false, 'blank actual refused — never defaulted to committed');
  const recorded = api.recordBudgetActual(bud.id, added.lineId, { actualAmount: 10440, spentOn: '2026-10-21' });
  assert.equal(recorded.ok, true, recorded.error);
  assert.ok(recorded.propagations.some((p) => p.ruleId === 'RULE-FIN-03'));
  storedLine = store.state.budgets[0].lines[0];
  assert.equal(storedLine.status, 'spent');
  assert.equal(storedLine.actualAmount, 10440);
  assert.equal(storedLine.actualsDueOn, null);
  const cal = commitmentCalibration(store.state);
  assert.equal(cal.n, 1);
  assert.equal(cal.pairs[0].ratio, 1.16, '10440 / 9000 scored');
  assert.equal(buildInsights(store.state, NOW).findings.some((f) => f.ruleId === 'FIN-03'), false, 'gap closed by evidence');
});

test('release returns authority; spent money cannot be released; validation refuses bad money', () => {
  const { store, api } = harness();
  const bud = api.addBudget({ name: 'Ops', currency: 'USD', limit: 1000 });
  const a = api.addBudgetLine(bud.id, { title: 'Big encumbrance', status: 'committed', committedAmount: 900 });
  assert.equal(evaluateBudget(store.state.budgets[0], NOW).forecastAtCompletion, 900);
  const rel = api.releaseBudgetLine(bud.id, a.lineId, { reason: 'Deferred to next quarter' });
  assert.equal(rel.ok, true, rel.error);
  assert.equal(evaluateBudget(store.state.budgets[0], NOW).forecastAtCompletion, 0, 'released authority leaves the forecast');
  assert.equal(api.recordBudgetActual(bud.id, a.lineId, { actualAmount: 10 }).ok, false, 'released lines take no actuals');

  const b = api.addBudgetLine(bud.id, { title: 'Landed', status: 'spent', committedAmount: 100, actualAmount: 90, spentOn: '2026-10-01' });
  assert.equal(api.releaseBudgetLine(bud.id, b.lineId, {}).ok, false, 'spend that landed cannot be unspent');
  assert.equal(api.addBudgetLine(bud.id, { title: 'Bad', committedAmount: -5 }).ok, false);
  assert.equal(api.addBudgetLine(bud.id, { title: 'Bad source', sourceType: 'goal', sourceId: 'nope' }).ok, false);
  assert.equal(api.addBudgetLine(bud.id, { title: 'Forbidden', sourceType: 'conflict', sourceId: 'x' }).ok, false, 'confidential records can never be funded/linked');
  assert.equal(api.addBudget({ name: 'Bad currency', currency: 'US D!' }).ok, false);
  assert.equal(api.addBudget({ name: 'Bad ceiling', limit: -1 }).ok, false);
});

/* ----------------------------------------------------------------- insights */

test('FIN-01/02/04/05 fire on their conditions; demo baseline is silent', () => {
  const demo = buildDemoState(NOW);
  assert.deepEqual(buildInsights(demo, NOW).findings.filter((f) => f.ruleId.startsWith('FIN-')), [], 'healthy demo fires no FIN rules');
  assert.equal(budgetsRollup(demo, NOW).active.length, 1);

  const { store, api } = harness();
  const bud = api.addBudget({ name: 'Tight envelope', currency: 'USD', limit: 1000, endsOn: '2026-10-01' });
  api.addBudgetLine(bud.id, { title: 'Overdue encumbrance', status: 'committed', committedAmount: 850, expectedOn: '2026-09-15' });
  let findings = buildInsights(store.state, NOW).findings;
  assert.ok(findings.some((f) => f.ruleId === 'FIN-02'), '85% forecast is watch zone');
  assert.ok(findings.some((f) => f.ruleId === 'FIN-05'), 'period ended / overdue encumbrance is stale');
  api.addBudgetLine(bud.id, { title: 'One too many', status: 'committed', committedAmount: 300 });
  findings = buildInsights(store.state, NOW).findings;
  assert.ok(findings.some((f) => f.ruleId === 'FIN-01'), 'over ceiling is a breach, not a watch');

  // Five systematically over-landing commitments → FIN-04 + calibrated view.
  const h2 = harness();
  const b2 = h2.api.addBudget({ name: 'History', currency: 'USD', limit: 100000 });
  for (let i = 0; i < 5; i += 1) {
    const l = h2.api.addBudgetLine(b2.id, { title: `Item ${i}`, status: 'committed', committedAmount: 100 });
    h2.api.recordBudgetActual(b2.id, l.lineId, { actualAmount: 130, spentOn: '2026-10-10' });
  }
  const open = h2.api.addBudgetLine(b2.id, { title: 'Next big one', status: 'committed', committedAmount: 80000 });
  assert.equal(open.ok, true);
  assert.ok(buildInsights(h2.store.state, NOW).findings.some((f) => f.ruleId === 'FIN-04'));
  const calibrated = calibratedForecast(h2.store.state.budgets[0], h2.store.state, NOW);
  assert.equal(calibrated.medianRatio, 1.3);
  assert.equal(calibrated.calibratedBreach, true, '650 spent + 80000×1.3 calibrated exceeds the ceiling the recorded forecast respects');
  assert.equal(evaluateBudget(h2.store.state.budgets[0], NOW).breach, false, 'recorded forecast itself is untouched');
});

/* -------------------------------------------------------------- CSV + rewind */

test('CSV: finance scope is per-line and formula-safe; calibration gains commitment rows', () => {
  assert.equal(CSV_EXPORTS.length, 40);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'finance'));
  const { store, api } = harness();
  const bud = api.addBudget({ name: '=cmd|calc envelope', currency: 'USD', limit: 5000 });
  const l = api.addBudgetLine(bud.id, { title: 'Tooling', status: 'committed', committedAmount: 2000 });
  api.recordBudgetActual(bud.id, l.lineId, { actualAmount: 2100, spentOn: '2026-10-05' });

  const fin = exportWorkspaceCsv(store.state, 'finance', { now: NOW });
  assert.equal(fin.ok, true, fin.error);
  assert.ok(fin.csv.includes("'=cmd"), 'CWE-1236: formula-looking budget name neutralised');
  const parsed = parseCsv(fin.csv);
  assert.equal(parsed.rows.length, 1, 'one line row under the header');
  const row = parsed.rows[0];
  const cell = (name) => row[parsed.headers.indexOf(name)];
  assert.equal(cell('currency'), 'USD');
  assert.equal(cell('forecast_at_completion'), '2100');
  assert.equal(cell('actual_vs_committed_ratio'), '1.05');

  const calCsv = exportWorkspaceCsv(store.state, 'calibration', { now: NOW });
  assert.ok(calCsv.csv.includes('budget-commitment'), 'fifth ledger exported');
  assert.ok(calCsv.csv.includes('budget-reference-class'));
});

test('reconstructStateAt rewinds spend and releases to their pre-event state', () => {
  const { store, api } = harness();
  const bud = api.addBudget({ name: 'Rewind me', currency: 'USD', limit: 9000 });
  const l = api.addBudgetLine(bud.id, { title: 'Spend', status: 'committed', committedAmount: 1000 });
  api.recordBudgetActual(bud.id, l.lineId, { actualAmount: 1100, spentOn: '2026-10-20' });
  const rewound = reconstructStateAt(store.state, new Date('2026-10-10T00:00:00Z'), { currentDay: '2026-10-26' }).state;
  // Budget created on the harness "today" (2026-10-26), so at 10-10 it did not exist.
  assert.equal(rewound.budgets.length, 0);
  const manual = JSON.parse(JSON.stringify(store.state));
  manual.budgets[0].createdAt = '2026-09-01T00:00:00.000Z';
  const rewound2 = reconstructStateAt(manual, new Date('2026-10-10T00:00:00Z'), { currentDay: '2026-10-26' }).state;
  assert.equal(rewound2.budgets[0].lines[0].status, 'committed', 'spend on 10-20 had not landed on 10-10');
  assert.equal(rewound2.budgets[0].lines[0].actualAmount, null);
});

/* ----------------------------------------------------------------------- UI */

function bootDom() {
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
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

test('UI: #/finance list + detail render, record-actual dialog never pre-fills, axe-clean', async () => {
  const env = bootDom();
  let app = null;
  try {
    const { createApp } = await import('../../app/main.js');
    app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    const budget = app.ctx.state.budgets[0];
    assert.ok(budget, 'demo seeds one healthy envelope');

    app.navigate('#/finance');
    await flush();
    let view = env.document.querySelector('#view');
    assert.ok(view.textContent.includes('Budget & finance'));
    assert.ok(view.textContent.includes('Platform team operating budget'));
    assert.ok(view.textContent.includes('USD 37,640'), 'forecast = 7,640 + 6,000 actuals + 24,000 encumbered');
    env.window.eval(AXE_SRC);
    let axeRes = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(axeRes.violations).map((v) => v.id), [], 'zero axe violations on #/finance');

    app.navigate(`#/finance/${budget.id}`);
    await flush();
    view = env.document.querySelector('#view');
    assert.ok(view.textContent.includes('Commitment lines'));
    assert.ok(view.textContent.includes('Aurora Cloud renewal'), 'funded negotiation line visible');
    assert.ok(view.textContent.includes('Cross-module links'));
    axeRes = await env.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(axeRes.violations).map((v) => v.id), [], 'zero axe violations on budget detail');

    const recordBtn = Array.from(view.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Record actual');
    assert.ok(recordBtn, 'committed line offers Record actual');
    recordBtn.click();
    await flush();
    const modal = env.document.querySelector('#modal-root');
    const actualInput = modal.querySelector('[name="actualAmount"]');
    assert.ok(actualInput, 'actual field exists');
    assert.equal(actualInput.value, '', 'actual is never pre-filled from the committed figure');
    actualInput.value = '23100';
    modal.querySelector('.btn-primary').click();
    await flush();
    const settled = app.ctx.state.budgets[0].lines.find((l) => l.actualAmount === 23100);
    assert.ok(settled, 'actual recorded through the dialog');
    assert.equal(settled.status, 'spent');
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app?.destroy?.();
    env.dom.window.close();
  }
});
