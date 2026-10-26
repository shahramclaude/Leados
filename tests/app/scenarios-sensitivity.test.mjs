import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { inspectExportGovernance } from '../../app/core/domain/export-governance.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { personSupply } from '../../app/core/domain/capacity.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  projectScenarioState,
  evaluateScenario,
  compareScenarios,
  computeParetoFrontier,
  buildSuggestedScenarios,
  computeSensitivityTornado,
} from '../../app/core/domain/scenarios.js';
import { personOptions, goalOptions } from '../../app/ui/options.js';

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
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const store = createStore({ storage: memStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
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

test('Sandbox zero-mutation invariant: projectScenarioState, compareScenarios, and computeSensitivityTornado never mutate live workspace state', () => {
  const demo = buildDemoState(NOW);
  const snapshotBefore = JSON.stringify(demo);

  const presets = buildSuggestedScenarios(demo, { now: NOW });
  assert.ok(presets.length >= 2, 'demo workspace yields multiple context-aware counterfactual presets');

  const cmp = compareScenarios(demo, presets, { now: NOW, seed: 42, trials: 400 });
  assert.equal(cmp.scenarios.length, presets.length + 1);
  assert.equal(cmp.baseline.isBaseline, true);

  const tornado = computeSensitivityTornado(demo, { now: NOW, seed: 42, trials: 300 });
  assert.equal(tornado.available, true);
  assert.ok(tornado.bars.length >= 3);

  const snapshotAfter = JSON.stringify(demo);
  assert.equal(snapshotAfter, snapshotBefore, 'live workspace state is 100% untouched by counterfactual evaluations');
});

test('Common Random Numbers (CRN) determinism & variance reduction: identical seeds reproduce exact deltas and scope relief reduces overload odds', () => {
  const { store, api } = harness();
  const p1 = api.addPerson({ name: 'Ada Lovelace', role: 'Staff Engineer', startDate: '2025-01-10' });
  const p2 = api.addPerson({ name: 'Grace Hopper', role: 'Senior Engineer', startDate: '2025-02-10' });

  const itemA = api.addPortfolioItem({
    title: 'Core ledger migration',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 8, mostLikely: 12, pessimistic: 20 },
    value: { optimistic: 80000, mostLikely: 120000, pessimistic: 160000 },
  });
  const itemB = api.addPortfolioItem({
    title: 'Low-CD3 internal admin polish',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 6, mostLikely: 10, pessimistic: 16 },
    value: { optimistic: 5000, mostLikely: 8000, pessimistic: 12000 },
  });
  assert.equal(itemA.ok && itemB.ok && Boolean(p2.id), true);

  const deferSpec = {
    id: 'defer-low-cd3',
    name: 'Defer low-CD3 polish',
    levers: {
      portfolioDecisions: [{ itemId: itemB.id, decision: 'deferred' }],
    },
  };
  const rebalanceSpec = {
    id: 'rebalance-owner',
    name: 'Move polish to Grace',
    levers: {
      portfolioDecisions: [{ itemId: itemB.id, ownerId: p2.id }],
    },
  };

  const run1 = compareScenarios(store.state, [deferSpec, rebalanceSpec], { now: NOW, seed: 1337, trials: 500 });
  const run2 = compareScenarios(store.state, [deferSpec, rebalanceSpec], { now: NOW, seed: 1337, trials: 500 });
  assert.deepEqual(run1, run2, 'CRN comparison is 100% deterministic for fixed seed and clock');

  const deferRow = run1.scenarios[1];
  const rebalanceRow = run1.scenarios[2];
  assert.ok(deferRow.deltas.committedDays < 0, 'deferring scope reduces committed days');
  assert.ok(deferRow.deltas.overloadProbability <= 0, 'deferring scope never increases CRN overload probability');
  assert.ok(
    rebalanceRow.monteCarlo.effectiveP80Days < run1.baseline.monteCarlo.effectiveP80Days,
    'Critical-Chain owner de-bottlenecking compresses owner-constrained P80 completion',
  );
});

test('Brooks’s Law onboarding drag vs Watkins 30-60-90 ramp crossover: late hires reduce near-term horizon net capacity while early hires with freed interview reserve add net capacity', () => {
  const { store, api } = harness();
  api.addPerson({ name: 'Linus Torvalds', role: 'Principal Engineer', startDate: '2024-01-01' });
  const reqLate = api.addRequisition({
    title: 'Distributed Systems Engineer',
    level: 'senior',
    reason: 'growth',
    openedOn: '2026-10-01',
    competencies: 'Distributed Systems | 3',
  });
  assert.equal(reqLate.ok, true);

  // Starting 24 days into a 28-day horizon with 6d mentoring drag and 0d interview reserve -> Brooks's Law trap!
  const lateProj = projectScenarioState(
    store.state,
    {
      id: 'late-hire',
      levers: {
        hiringActions: [
          { reqId: reqLate.id, hireStartOn: '2026-11-19', mentoringDragDays: 6 },
        ],
      },
    },
    { now: NOW },
  );
  assert.equal(lateProj.brooksDiagnostics.length, 1);
  assert.equal(lateProj.brooksDiagnostics[0].brooksLawTrap, true);
  assert.ok(lateProj.brooksDiagnostics[0].netCapacityDeltaDays < 0);

  // Starting in 2 days on a role that also frees 5d of open interviewer capacity -> net positive!
  const reqEarly = api.addRequisition({
    title: 'Product Engineer',
    level: 'mid',
    reason: 'backfill',
    openedOn: '2026-10-01',
    competencies: 'Product Engineering | 3',
    effortOptimistic: 4,
    effortMostLikely: 5,
    effortPessimistic: 7,
  });
  const earlyProj = projectScenarioState(
    store.state,
    {
      id: 'early-hire',
      levers: {
        hiringActions: [
          { reqId: reqEarly.id, hireStartOn: '2026-10-28', mentoringDragDays: 2 },
        ],
      },
    },
    { now: NOW },
  );
  assert.equal(earlyProj.brooksDiagnostics[0].brooksLawTrap, false);
  assert.ok(earlyProj.brooksDiagnostics[0].netCapacityDeltaDays > 0);
});

test('Pareto frontier dominance & Tornado OAT sensitivity ranking accurately classify options and sort widest schedule drivers first', () => {
  const frontier = computeParetoFrontier([
    {
      id: 'opt-frontier',
      name: 'Frontier relief',
      monteCarlo: { overloadProbability: 0.12, effectiveP80Days: 18 },
      economics: { measured: true, currency: 'USD', netRiskAdjustedValue: 150000 },
    },
    {
      id: 'opt-dominated',
      name: 'Dominated option',
      monteCarlo: { overloadProbability: 0.45, effectiveP80Days: 29 },
      economics: { measured: true, currency: 'USD', netRiskAdjustedValue: 110000 },
    },
    {
      id: 'opt-high-value',
      name: 'High-value stretch',
      monteCarlo: { overloadProbability: 0.35, effectiveP80Days: 24 },
      economics: { measured: true, currency: 'USD', netRiskAdjustedValue: 240000 },
    },
  ]);

  const byId = Object.fromEntries(frontier.map((r) => [r.id, r]));
  assert.equal(byId['opt-frontier'].paretoOptimal, true);
  assert.equal(byId['opt-high-value'].paretoOptimal, true, 'higher net value trades off against higher risk -> non-dominated');
  assert.equal(byId['opt-dominated'].paretoOptimal, false);
  assert.equal(byId['opt-dominated'].dominatedBy[0].id, 'opt-frontier');

  // Tornado OAT ranking: wider PERT spread item must rank above narrow spread item
  const { store, api } = harness();
  const p = api.addPerson({ name: 'Barbara Liskov', role: 'Staff Engineer', startDate: '2024-06-01' });
  api.addPortfolioItem({
    title: 'Narrow predictable task',
    kind: 'project',
    decision: 'funded',
    ownerId: p.id,
    effortDays: { optimistic: 4, mostLikely: 4.5, pessimistic: 5 },
  });
  api.addPortfolioItem({
    title: 'Wide tail-risk migration',
    kind: 'project',
    decision: 'funded',
    ownerId: p.id,
    effortDays: { optimistic: 3, mostLikely: 9, pessimistic: 28 },
  });

  const tornado = computeSensitivityTornado(store.state, { now: NOW, seed: 99, trials: 400 });
  assert.equal(tornado.available, true);
  for (let i = 1; i < tornado.bars.length; i += 1) {
    assert.ok(
      tornado.bars[i - 1].p80SwingDays >= tornado.bars[i].p80SwingDays,
      'tornado bars are monotonically sorted from largest P80 swing to smallest',
    );
  }
  const idxWide = tornado.bars.findIndex((b) => b.label.includes('Wide tail-risk migration'));
  const idxNarrow = tornado.bars.findIndex((b) => b.label.includes('Narrow predictable task'));
  assert.ok(idxWide >= 0 && idxNarrow >= 0 && idxWide < idxNarrow, 'wider PERT spread commitment ranks higher in tornado sensitivity');
});

test('RULE-SCN-01 governance & parallel commitment: recordScenarioDecision preserves live state while commitScenarioLevers cascades across portfolio, goals, cases, changes, and settings + SCN-01 insight + sensitivity CSV', () => {
  const { store, api } = harness();
  const p1 = api.addPerson({ name: 'Margaret Hamilton', role: 'Principal Engineer', startDate: '2024-03-01' });
  const goal = api.addGoal({
    title: 'Ship resilient flight control v3',
    ownerId: p1.id,
    coAuthored: true,
    confidence: 'on-track',
    dueDate: '2026-12-20',
  });
  const pfMain = api.addPortfolioItem({
    title: 'Flight control core',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    effortDays: { optimistic: 8, mostLikely: 11, pessimistic: 16 },
  });
  const pfGoalLinked = api.addPortfolioItem({
    title: 'Telemetry replay dashboard =SUM(1,2)',
    kind: 'project',
    decision: 'funded',
    ownerId: p1.id,
    sourceType: 'goal',
    sourceId: goal.id,
    effortDays: { optimistic: 6, mostLikely: 9, pessimistic: 15 },
  });
  const cRes = api.addCase({
    title: 'Sensor queue backpressure',
    kind: 'incident',
    status: 'open',
    ownerId: p1.id,
    fmea: { severity: 8, probability: 6, detectability: 5 },
    financial: {
      currency: 'USD',
      optimistic: 5000,
      mostLikely: 15000,
      pessimistic: 35000,
      mitigationCost: 2000,
      capacityDaysOptimistic: 2,
      capacityDaysMostLikely: 4,
      capacityDaysPessimistic: 7,
    },
  });
  const chgRes = api.addChange({
    title: 'Platform stream split',
    kind: 'topology',
    status: 'active',
    ownerId: p1.id,
    effortDays: { optimistic: 2, mostLikely: 4, pessimistic: 6 },
    forces: [
      { side: 'driving', label: 'Autonomous deploys', weight: 4, category: 'architecture' },
      { side: 'restraining', label: 'Legacy shared DB coupling', weight: 4, category: 'architecture', mitigated: false },
    ],
  });
  assert.equal(pfMain.ok && pfGoalLinked.ok && cRes.ok && chgRes.ok, true);

  // Verify SCN-01 insight fires on the overloaded live plan
  const preInsights = buildInsights(store.state, NOW);
  const scnInsight = preInsights.findings.find((f) => f.ruleId === 'SCN-01');
  assert.ok(scnInsight, 'SCN-01 surfaces Pareto-dominating counterfactual relief when plan is overloaded');
  assert.equal(scnInsight.action.route, '#/scenarios');

  // Verify sensitivity CSV export + CWE-1236 formula neutralization
  const csvOut = exportWorkspaceCsv(store.state, 'sensitivity', { now: NOW });
  assert.equal(csvOut.ok, true);
  assert.ok(csvOut.rowCount >= 4);
  const parsedCsv = parseCsv(csvOut.csv);
  assert.equal(parsedCsv.rows.length, csvOut.rowCount);
  assert.ok(
    !parsedCsv.rows.flat().some((cell) => cell.startsWith('=SUM')),
    'CWE-1236 formula trigger inside item title is neutralized in sensitivity CSV',
  );

  const spec = {
    id: 'scn-relief-bundle',
    name: '=Composite Relief Plan',
    description: 'Defer replay dashboard, resolve sensor incident, and pause topology split.',
    levers: {
      settingsPatch: { operationalLoadPct: 15 },
      portfolioDecisions: [{ itemId: pfGoalLinked.id, decision: 'deferred' }],
      caseMitigations: [cRes.id],
      changeActions: [{ changeId: chgRes.id, action: 'pause' }],
    },
  };

  const preCaseStatus = store.state.cases.find((c) => c.id === cRes.id).status;

  // 1. recordScenarioDecision logs DACI + RULE-SCN-01 links WITHOUT mutating live portfolio/case/change
  const logOnly = api.recordScenarioDecision({
    scenarioSpec: spec,
    rationale: 'Documenting option before team review.',
  });
  assert.equal(logOnly.ok, true);
  assert.equal(logOnly.committed, false);
  assert.equal(store.state.portfolio.find((i) => i.id === pfGoalLinked.id).decision, 'funded', 'live portfolio unchanged on log-only');
  assert.equal(store.state.cases.find((c) => c.id === cRes.id).status, preCaseStatus, 'live case unchanged on log-only');
  assert.equal(store.state.changes.find((c) => c.id === chgRes.id).status, 'active', 'live change unchanged on log-only');
  const scnLinks = store.state.links.filter((l) => l.sourceId === logOnly.id && l.ruleId === 'RULE-SCN-01');
  assert.equal(scnLinks.length, 3, 'RULE-SCN-01 links decision to portfolio, case, and change');

  // 2. commitScenarioLevers atomically executes levers and cascades RULE-CAP-01, RULE-CAP-03, and RULE-CHG-01
  const committed = api.commitScenarioLevers({
    scenarioSpec: spec,
    rationale: 'Executing relief bundle for Q4 reliability.',
  });
  assert.equal(committed.ok, true);
  assert.equal(committed.committed, true);
  assert.equal(store.state.settings.operationalLoadPct, 15, 'settingsPatch applied');
  assert.equal(store.state.portfolio.find((i) => i.id === pfGoalLinked.id).decision, 'deferred', 'portfolio deferral applied');
  assert.equal(store.state.goals.find((g) => g.id === goal.id).confidence, 'at-risk', 'RULE-CAP-03 cascaded deferral to linked goal');
  assert.equal(store.state.cases.find((c) => c.id === cRes.id).status, 'resolved', 'case mitigation applied');
  const caseReserve = store.state.portfolio.find((i) => i.sourceType === 'case' && i.sourceId === cRes.id);
  assert.equal(caseReserve.status, 'released', 'RULE-CAP-01 released incident reserve');
  assert.equal(store.state.changes.find((c) => c.id === chgRes.id).status, 'paused', 'change pause applied');
  const chgReserve = store.state.portfolio.find((i) => i.sourceType === 'change' && i.sourceId === chgRes.id);
  assert.equal(chgReserve.status, 'released', 'RULE-CHG-01 released transition reserve');
});

test('Audited bug-fix regressions (#1–#7): documentTitle, cases stakeholder keyMessage redaction, RULE-CAP-05 text, reconstructStateAt candidates, options helpers, settings dialog, and future startDate supply proration', async () => {
  // Bug #3: RULE-CAP-05 description states >= 50%
  const cap05 = AUTOMATION_RULES.find((r) => r.id === 'RULE-CAP-05');
  assert.ok(cap05.description.includes('≥ 50%'));

  // Bug #7: personSupply prorates future startDate > today
  const futureAfterHorizon = personSupply(
    { id: 'p-after', name: 'Future Joiner', startDate: '2026-12-15', status: 'active' },
    { onboarding: [{ personId: 'p-after', kind: 'new-hire', startDate: '2026-12-15', status: 'active' }], settings: { onboardingDays: 90, capacityHoursPerWeek: 32 } },
    { now: NOW, horizonWeeks: 4 },
  );
  assert.equal(futureAfterHorizon.availableDays, 0, 'joiner starting after 4-week horizon contributes 0 available days now');
  assert.equal(futureAfterHorizon.inHorizonShare, 0);

  const futureMidHorizon = personSupply(
    { id: 'p-mid', name: 'Mid-Horizon Joiner', startDate: '2026-11-09', status: 'active' },
    { onboarding: [{ personId: 'p-mid', kind: 'new-hire', startDate: '2026-11-09', status: 'active' }], settings: { onboardingDays: 90, capacityHoursPerWeek: 32 } },
    { now: NOW, horizonWeeks: 4 },
  );
  // 14 days into 28-day horizon -> 50% of horizon * 45% month-1 ramp * 16 gross days = 3.6 available days
  assert.equal(futureMidHorizon.availableDays, 3.6, 'joiner starting halfway through horizon contributes prorated 50% ramp days');

  // Bug #2: cases[].stakeholders[].keyMessage governance detection + JSON & CSV redaction
  const { store, api } = harness();
  const person = api.addPerson({ name: 'Priya Patel', role: 'Lead', startDate: '2025-01-01' });
  const other = api.addPerson({ name: 'Samir Khan', role: 'Eng', startDate: '2025-02-01' });
  api.addGoal({ title: 'Priya Goal', ownerId: person.id });
  api.addGoal({ title: 'Samir Goal', ownerId: other.id });

  // Bug #5: personOptions & goalOptions includeNone / excludeId / personId
  const pOpts = personOptions(store.state, { includeNone: 'None', excludeId: other.id });
  assert.equal(pOpts[0].label, 'None');
  assert.equal(pOpts.some((o) => o.value === other.id), false);
  const gOpts = goalOptions(store.state, { includeNone: 'No goal', personId: person.id });
  assert.equal(gOpts.length, 2, 'sentinel + Priya’s goal only');

  api.addCase({
    title: 'Vendor contract dispute',
    kind: 'escalation',
    status: 'open',
    fmea: { severity: 6, probability: 5, detectability: 4 },
    stakeholders: [
      { name: 'VP Procurement', role: 'Approver', power: 5, interest: 4, stance: 'neutral', keyMessage: 'CONFIDENTIAL_LEVERAGE_NOTE' },
    ],
  });
  const gov = inspectExportGovernance(store.state, { format: 'csv', csvScope: 'cases', now: NOW });
  assert.equal(gov.requiresDisclosure, true, 'keyMessage on neutral case stakeholder triggers export governance disclosure');

  const redactedExport = store.exportRedactedJSON({ redactStakeholderStances: true });
  assert.equal(redactedExport.ok, true);
  const redactedJson = JSON.parse(redactedExport.json).state;
  assert.equal(redactedJson.cases[0].stakeholders[0].keyMessage, '', 'JSON redaction scrubs cases stakeholder keyMessage');

  const redactedCsv = exportWorkspaceCsv(store.state, 'cases', { now: NOW, redactStakeholderStances: true });
  assert.equal(redactedCsv.csv.includes('CONFIDENTIAL_LEVERAGE_NOTE'), false);
  assert.equal(redactedCsv.omitted.stakeholderRecordsScrubbed, 1);

  // Bug #4: reconstructStateAt rewinds post-cutoff candidate signals, stage, decision, and hiredOn
  const req = api.addRequisition({ title: 'Security Lead', level: 'staff', reason: 'growth', openedOn: '2026-09-01', competencies: 'AppSec | 3' });
  const reqCompId = store.state.requisitions.find((r) => r.id === req.id).competencies[0].id;
  const cand = api.addCandidate({ reqId: req.id, name: 'Alex Rivera', appliedOn: '2026-09-10', stage: 'onsite' });
  const evRes = api.recordEvidence(cand.id, {
    kind: 'work-sample',
    date: '2026-10-20',
    interviewerId: person.id,
    competencyId: reqCompId,
    rating: 5,
    note: 'Strong threat model',
  });
  assert.equal(evRes.ok, true);
  const rewound = reconstructStateAt(store.state, new Date('2026-10-01T00:00:00.000Z'));
  const rewoundCand = rewound.state.candidates.find((c) => c.id === cand.id);
  assert.ok(rewoundCand, 'candidate applied before cutoff exists');
  assert.equal(rewoundCand.signals.length, 0, 'signals recorded after cutoff are rewound');
  assert.equal(rewoundCand.stage, 'applied', 'post-cutoff stage progression rewound to applied');

  // Bugs #1 & #6 + #/scenarios UI + axe-core verification in jsdom
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const { openSettingsDialog } = await import('../../app/ui/modals.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();

    env.window.location.hash = '#/capacity';
    await flush();
    assert.equal(env.document.title, 'Capacity & flow · LeadOS');

    env.window.location.hash = '#/changes';
    await flush();
    assert.equal(env.document.title, 'Org design & change · LeadOS');

    const firstReq = app.ctx.state.requisitions[0];
    if (firstReq) {
      env.window.location.hash = `#/hiring/${firstReq.id}`;
      await flush();
      assert.equal(env.document.title, `${firstReq.title} · LeadOS`);
    }

    // Navigate to #/scenarios with preset query — verify zero mutation of store.state + 0 axe violations
    const eventsBefore = app.ctx.state.events.length;
    env.window.location.hash = '#/scenarios?preset=preset-cd3-trim';
    await flush();
    assert.equal(env.document.title, 'What-if scenarios & sensitivity · LeadOS');
    assert.equal(app.ctx.state.events.length, eventsBefore, 'opening and evaluating #/scenarios appends zero audit events');

    env.window.eval(AXE_SRC);
    const axeRes = await env.window.axe.run(env.document.querySelector('#view'), {
      rules: { 'color-contrast': { enabled: false } },
    });
    assert.deepEqual(
      Array.from(axeRes.violations).map((v) => v.id),
      [],
      'zero axe-core accessibility violations on #/scenarios',
    );

    // Bug #6: openSettingsDialog saves simulationSeed, simulationTrials, changeReviewDays, and 0 operationalLoadPct
    openSettingsDialog(app.ctx);
    await flush();
    const modal = env.document.querySelector('#modal-root');
    const setField = (name, val) => {
      const input = modal.querySelector(`[name="${name}"]`);
      assert.ok(input, `settings field ${name} exists`);
      input.value = String(val);
    };
    setField('operationalLoadPct', 0);
    setField('idleLockMinutes', 0);
    setField('candidateRetentionDays', 0);
    setField('changeReviewDays', 30);
    setField('simulationSeed', 777);
    setField('simulationTrials', 800);
    const saveBtn = modal.querySelector('.btn-primary');
    assert.ok(saveBtn, 'settings save button exists');
    saveBtn.click();
    await flush();

    assert.equal(app.ctx.state.settings.operationalLoadPct, 0);
    assert.equal(app.ctx.state.settings.idleLockMinutes, 0);
    assert.equal(app.ctx.state.settings.candidateRetentionDays, 0);
    assert.equal(app.ctx.state.settings.changeReviewDays, 30);
    assert.equal(app.ctx.state.settings.simulationSeed, 777);
    assert.equal(app.ctx.state.settings.simulationTrials, 800);
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    env.dom.window.close();
  }
});

test('UI interactive #/scenarios sandbox: toggling levers leaves live state untouched until Commit levers modal executes RULE-SCN-01', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();

    env.window.location.hash = '#/scenarios';
    await flush();

    const stateSnapshotBefore = JSON.stringify(app.ctx.state.portfolio);
    const eventsBefore = app.ctx.state.events.length;

    // Toggle operational interrupt reserve in sandbox
    const opInput = env.document.querySelector('#scn-op-reserve');
    assert.ok(opInput, 'sandbox operational reserve input rendered');
    opInput.value = '12';
    opInput.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    await flush();

    // Inject a hypothetical uncommitted request in sandbox
    const hypForm = env.document.querySelector('.scenario-hyp-form');
    assert.ok(hypForm, 'hypothetical work form rendered');
    hypForm.querySelector('#scn-hyp-title').value = 'Urgent SOC2 audit evidence pack';
    hypForm.dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    assert.equal(JSON.stringify(app.ctx.state.portfolio), stateSnapshotBefore, 'live portfolio untouched after interactive sandbox edits');
    assert.equal(app.ctx.state.events.length, eventsBefore, 'live audit log untouched after interactive sandbox edits');
    assert.notEqual(app.ctx.state.settings.operationalLoadPct, 12, 'live settings untouched before commit');

    // Click Commit sandbox levers button -> opens confirmation modal -> submit
    const commitTrigger = Array.from(env.document.querySelectorAll('#view button')).find((b) =>
      b.textContent.includes('Commit ') && b.textContent.includes('sandbox lever'),
    );
    assert.ok(commitTrigger, 'Commit sandbox levers button visible');
    commitTrigger.click();
    await flush();

    const modal = env.document.querySelector('#modal-root');
    const submitBtn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent.includes('Commit levers & save DACI'));
    assert.ok(submitBtn, 'modal Commit levers & save DACI button rendered');
    submitBtn.click();
    await flush();

    assert.equal(app.ctx.state.settings.operationalLoadPct, 12, 'committed sandbox lever applied to live settings');
    assert.ok(
      app.ctx.state.portfolio.some((i) => i.title === 'Urgent SOC2 audit evidence pack'),
      'committed hypothetical item added to live portfolio',
    );
    assert.ok(
      app.ctx.state.events.some((e) => e.type === 'scenario.committed'),
      'scenario.committed event appended to audit log',
    );
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    env.dom.window.close();
  }
});

