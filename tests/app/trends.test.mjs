import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { reconstructStateAt, teamHealth, dimensions } from '../../app/core/domain/health.js';
import { buildTeamTrends, firstRecordedActivityDay } from '../../app/core/domain/trends.js';
import { personTimeline } from '../../app/core/domain/people.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-24T10:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function makeHarness(clockFn = () => NOW) {
  const storage = memoryStorage();
  const store = createStore({ storage, now: clockFn });
  store.load();
  const api = createApi(store, { now: clockFn });
  return { storage, store, api };
}

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
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
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;

  return { dom, window, document: window.document, consoleErrors };
}

async function runAxe(env) {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const results = await env.window.axe.run(env.document, {
    rules: {
      // jsdom does not implement HTMLCanvasElement.getContext for pixel contrast sampling.
      'color-contrast': { enabled: false },
    },
  });
  return Array.from(results.violations);
}

test('schema v4 → v5 migration preserves unknown historical dates as null without mutating source', () => {
  const v4 = {
    schemaVersion: 4,
    people: [{ id: 'p1', name: 'Ada Lovelace', status: 'active', createdAt: '2026-08-01T09:00:00.000Z' }],
    oneOnOnes: [{
      id: 'm1', personId: 'p1', date: '2026-09-01', status: 'held',
      actions: [{ id: 'a1', text: 'Ship runbook', done: true }],
    }],
    feedback: [{
      id: 'f1', personId: 'p1', direction: 'given', kind: 'constructive',
      behavior: 'Missed handoff', date: '2026-09-02', followUpOn: '2026-09-10', followUpDone: true,
    }],
    goals: [
      {
        id: 'g-unchecked', title: 'Fresh goal', ownerId: 'p1', scope: 'person',
        confidence: 'at-risk', status: 'active',
        keyResults: [{ id: 'kr1', title: 'Latency', start: 200, target: 100, current: 200 }],
        checkins: [],
        createdAt: '2026-08-15T09:00:00.000Z',
      },
      {
        id: 'g-checked', title: 'Checked-in pre-v5 goal', ownerId: 'p1', scope: 'person',
        confidence: 'on-track', status: 'done',
        keyResults: [{ id: 'kr2', title: 'Coverage', start: 10, target: 90, current: 90 }],
        checkins: [{ id: 'c1', date: '2026-10-01', confidence: 'on-track', note: 'Landed' }],
        createdAt: '2026-08-15T09:00:00.000Z',
      },
    ],
    growthPlans: [{
      id: 'gp1', personId: 'p1', goal: 'Lead architecture reviews', status: 'done',
      will: [{ id: 'w1', text: 'Draft RFC template', done: true }],
      createdAt: '2026-08-10T09:00:00.000Z',
    }],
  };
  const snapshotBefore = JSON.stringify(v4);
  const migrated = migrate(v4);
  assert.equal(JSON.stringify(v4), snapshotBefore, 'migrate must never mutate input');
  assert.deepEqual(migrated.applied, ['4 → 5', '5 → 6', '6 → 7', '7 → 8', '8 → 9', '9 → 10', '10 → 11', '11 → 12', '12 → 13', '13 → 14', '14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66']);
  const { state } = normalizeState(migrated.raw, { now: NOW });
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.oneOnOnes[0].actions[0].completedOn, null);
  assert.equal(state.feedback[0].followUpCompletedOn, null);
  assert.equal(state.goals[0].initialConfidence, 'at-risk', 'unchecked goal preserves initial confidence');
  assert.equal(state.goals[0].keyResults[0].initialCurrent, 200, 'unchecked goal preserves initialCurrent');
  assert.equal(state.goals[1].initialConfidence, null, 'pre-v5 checked-in goal does not guess initialConfidence');
  assert.equal(state.goals[1].completedOn, null, 'pre-v5 done goal does not fabricate completedOn');
  assert.equal(state.goals[1].checkins[0].keyResults, null, 'pre-v5 check-in does not fabricate KR snapshot');
  assert.equal(state.growthPlans[0].closedOn, null);
  assert.equal(state.growthPlans[0].will[0].completedOn, null);
});

test('write-path actions record dated snapshots across 1:1 actions, feedback, goals and growth plans', () => {
  let currentNow = new Date('2026-09-01T09:00:00.000Z');
  const { store, api } = makeHarness(() => currentNow);
  const p = api.addPerson({ name: 'Grace Hopper', role: 'Staff Engineer', startDate: '2026-01-10' });

  const m = api.logOneOnOne({
    personId: p.id,
    date: '2026-09-01',
    status: 'held',
    notes: 'Aligned on compiler milestones',
    actions: [{ text: 'Share benchmark numbers', owner: 'leader', done: false }],
  });
  const actionId = store.state.oneOnOnes[0].actions[0].id;
  assert.equal(store.state.oneOnOnes[0].actions[0].completedOn, null);

  currentNow = new Date('2026-09-05T09:00:00.000Z');
  api.toggleMeetingAction(m.id, actionId);
  assert.equal(store.state.oneOnOnes[0].actions[0].completedOn, '2026-09-05');

  const fb = api.addFeedback({
    personId: p.id, direction: 'given', kind: 'constructive',
    situation: 'Sprint demo', behavior: 'Skipped error cases', impact: 'QA caught regression late',
    observedOn: '2026-09-04', date: '2026-09-05', followUpOn: '2026-09-12',
  });
  currentNow = new Date('2026-09-11T09:00:00.000Z');
  api.completeFollowUp(fb.id, true);
  assert.equal(store.state.feedback[0].followUpCompletedOn, '2026-09-11');

  currentNow = new Date('2026-09-12T09:00:00.000Z');
  const g = api.addGoal({
    title: 'Cut build times in half', ownerId: p.id, scope: 'person', coAuthored: true,
    confidence: 'off-track',
    keyResults: [{ title: 'P95 CI minutes', start: 20, target: 10, current: 20, unit: 'min' }],
  });
  const krId = store.state.goals[0].keyResults[0].id;
  assert.equal(store.state.goals[0].initialConfidence, 'off-track');
  assert.equal(store.state.goals[0].keyResults[0].initialCurrent, 20);

  currentNow = new Date('2026-10-10T09:00:00.000Z');
  api.checkInGoal(g.id, {
    confidence: 'on-track',
    note: 'Remote cache cut build time to 12m',
    keyResults: [{ id: krId, current: 12 }],
  });
  const checkin = store.state.goals[0].checkins[0];
  assert.equal(checkin.progressPct, 80);
  assert.deepEqual(checkin.keyResults, [{ id: krId, current: 12 }]);

  // Reconstruct before the check-in: must recover off-track & 20m (0% progress), exact fidelity!
  const beforeCheckin = reconstructStateAt(store.state, '2026-09-25', { currentDay: '2026-10-24' });
  assert.equal(beforeCheckin.fidelity.clarity.level, 'exact');
  assert.equal(beforeCheckin.state.goals[0].confidence, 'off-track');
  assert.equal(beforeCheckin.state.goals[0].keyResults[0].current, 20);

  // Reconstruct after the check-in: must recover on-track & 12m!
  const afterCheckin = reconstructStateAt(store.state, '2026-10-15', { currentDay: '2026-10-24' });
  assert.equal(afterCheckin.fidelity.clarity.level, 'exact');
  assert.equal(afterCheckin.state.goals[0].confidence, 'on-track');
  assert.equal(afterCheckin.state.goals[0].keyResults[0].current, 12);

  // Growth plan commitment completion & closure dates
  const gp = api.saveGrowthPlan({
    personId: p.id,
    goal: 'Mentor two engineers through promotion',
    reality: 'Strong technical lead',
    options: ['Pair on design docs'],
    will: [{ text: 'Run weekly architecture clinic', due: '2026-10-20' }],
  });
  const willId = store.state.growthPlans[0].will[0].id;
  currentNow = new Date('2026-10-18T09:00:00.000Z');
  api.toggleWillAction(gp.id, willId);
  assert.equal(store.state.growthPlans[0].will[0].completedOn, '2026-10-18');
  api.updateGrowthPlan(gp.id, { status: 'done' });
  assert.equal(store.state.growthPlans[0].closedOn, '2026-10-18');

  const midOct = reconstructStateAt(store.state, '2026-10-12', { currentDay: '2026-10-24' });
  assert.equal(midOct.fidelity.growth.level, 'exact');
  assert.equal(midOct.state.growthPlans[0].status, 'active');
  assert.equal(midOct.state.growthPlans[0].will[0].done, false);
});

test('reconstructStateAt eliminates survivorship bias when a person is archived later', () => {
  let currentNow = new Date('2026-08-01T09:00:00.000Z');
  const { store, api } = makeHarness(() => currentNow);
  const p1 = api.addPerson({ name: 'Consistent Report', startDate: '2026-01-01' });
  const p2 = api.addPerson({ name: 'Neglected Then Exited', startDate: '2026-01-01' });

  // Only p1 ever gets 1:1s; p2 is neglected throughout September. Each meeting
  // is logged after it happened — the write path refuses to record a future
  // conversation, so the clock moves with the calendar.
  currentNow = new Date('2026-09-20T09:00:00.000Z');
  api.logOneOnOne({ personId: p1.id, date: '2026-09-20', status: 'held', notes: 'Good sync' });
  currentNow = new Date('2026-10-20T09:00:00.000Z');
  api.logOneOnOne({ personId: p1.id, date: '2026-10-20', status: 'held', notes: 'Good sync' });

  // Archive p2 on Oct 22.
  currentNow = new Date('2026-10-22T09:00:00.000Z');
  api.archivePerson(p2.id, true);

  const septSnap = reconstructStateAt(store.state, '2026-09-25', { currentDay: '2026-10-24' });
  const activeInSept = septSnap.state.people.filter((p) => p.status !== 'archived');
  assert.equal(activeInSept.length, 2, 'person archived on Oct 22 was still active on Sept 25');

  const septDims = dimensions(septSnap.state, new Date('2026-09-25T23:59:59.000Z'));
  const octDims = dimensions(store.state, NOW);
  const septCadence = septDims.find((d) => d.key === 'cadence').score;
  const octCadence = octDims.find((d) => d.key === 'cadence').score;
  assert.ok(septCadence < octCadence, `historical cadence (${septCadence}) must include neglected report before Oct 22 archive (${octCadence})`);
});

test('teamHealth and buildTeamTrends use matched-dimension deltas so new dimension coverage does not cause Simpson/composition drops', () => {
  const state = createEmptyState('2026-08-01T09:00:00.000Z');
  state.people.push({
    id: 'p1', name: 'Steady Engineer', role: 'SWE', level: 'senior', team: 'Core',
    managerId: null, startDate: '2026-01-01', focus: '', status: 'active',
    createdAt: '2026-08-01T09:00:00.000Z', archivedAt: null,
  });
  // Active on-track goal and active completed-will growth plan since August so clarity & growth are ~100
  state.goals.push({
    id: 'g1', title: 'Keep core API healthy', description: '', ownerId: 'p1', scope: 'person',
    coAuthored: true, dueDate: '2026-12-31',
    keyResults: [{ id: 'kr1', title: 'Uptime', start: 99, target: 100, current: 100, initialCurrent: 100, unit: '%' }],
    confidence: 'on-track', initialConfidence: 'on-track', status: 'active',
    completedOn: null, krUpdatedOn: null,
    checkins: [
      { id: 'c1', date: '2026-09-20', confidence: 'on-track', note: 'Green', progressPct: 100, keyResults: [{ id: 'kr1', current: 100 }] },
      { id: 'c2', date: '2026-10-20', confidence: 'on-track', note: 'Green', progressPct: 100, keyResults: [{ id: 'kr1', current: 100 }] },
    ],
    createdAt: '2026-08-10T09:00:00.000Z',
  });
  state.growthPlans.push({
    id: 'gp1', personId: 'p1', goal: 'Lead reliability', reality: 'Strong', options: [],
    will: [{ id: 'w1', text: 'Run game day', due: '2026-10-01', done: true, completedOn: '2026-09-01', owner: 'them' }],
    competencies: [], reviewOn: '2026-11-15', status: 'active', closedOn: null, stagesUpdatedOn: null,
    createdAt: '2026-08-10T09:00:00.000Z',
  });
  // Steady weekly 1:1s and balanced feedback from Aug through Oct
  for (const d of ['2026-08-25', '2026-09-08', '2026-09-18', '2026-09-22', '2026-10-06', '2026-10-20']) {
    state.oneOnOnes.push({
      id: `m-${d}`, personId: 'p1', date: d, status: 'held', mood: 4, agenda: [], notes: 'Steady', actions: [],
      createdAt: `${d}T09:00:00.000Z`,
    });
  }
  for (const [d, kind] of [['2026-09-10', 'praise'], ['2026-09-15', 'constructive'], ['2026-10-10', 'praise'], ['2026-10-15', 'constructive']]) {
    state.feedback.push({
      id: `f-${d}`, personId: 'p1', direction: 'given', kind, situation: 'S', behavior: 'B', impact: 'I',
      tags: [], date: d, observedOn: d, followUpOn: null, followUpDone: false, followUpCompletedOn: null,
      createdAt: `${d}T09:00:00.000Z`,
    });
  }
  // Low safety/workload pulse responses arrive ONLY in the most recent week (not 30 days ago)
  const lowWellbeingVectors = [
    { safety: 1, clarity: 5, workload: 1, growth: 5 },
    { safety: 2, clarity: 5, workload: 1, growth: 4 },
    { safety: 1, clarity: 4, workload: 2, growth: 5 },
    { safety: 2, clarity: 5, workload: 2, growth: 5 },
    { safety: 1, clarity: 5, workload: 1, growth: 5 },
  ];
  lowWellbeingVectors.forEach((scores, idx) => {
    state.pulses.push({
      id: `pulse-${idx}`, date: '2026-10-22', personId: null, anonymity: 'anonymous',
      scores, comment: '', createdAt: '2026-10-22T09:00:00.000Z',
    });
  });

  const health = teamHealth(state, NOW);
  assert.equal(health.trend.available, true);
  assert.equal(health.trend.coverageChanged, true, 'flags that dimension coverage changed when wellbeing unlocked');
  assert.deepEqual(health.trend.matchedDimensions, ['cadence', 'feedback', 'clarity', 'growth']);
  assert.ok(health.trend.rawOverallDelta < -15, `raw overall dropped sharply (${health.trend.rawOverallDelta}) only because wellbeing entered the denominator`);
  assert.ok(Math.abs(health.trend.delta) <= 2, `matched-dimension delta (${health.trend.delta}) stays truthful for steady habits`);

  const trends = buildTeamTrends(state, NOW, { horizon: '8w' });
  assert.equal(trends.overall.vsPrevious.available, true);
  assert.equal(trends.overall.vsPrevious.coverageChanged, true);
  assert.ok(Math.abs(trends.overall.vsPrevious.delta) <= 2);
});

test('buildTeamTrends guards pre-history periods as null instead of scoring 0 for long-tenured imports', () => {
  const state = createEmptyState('2026-10-20T09:00:00.000Z');
  state.people.push({
    id: 'p1', name: 'Veteran Joiner', role: 'Lead', level: 'lead', team: 'Platform',
    managerId: null, startDate: '2022-03-01', focus: '', status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z', archivedAt: null,
  });
  state.oneOnOnes.push({
    id: 'm1', personId: 'p1', date: '2026-10-20', status: 'held', mood: 4, agenda: [], notes: 'First logged 1:1', actions: [],
    createdAt: '2026-10-20T09:00:00.000Z',
  });

  assert.equal(firstRecordedActivityDay(state), '2026-10-20');
  const trends = buildTeamTrends(state, NOW, { horizon: '12w' });
  const historical = trends.points.slice(0, -1);
  for (const pt of historical) {
    assert.equal(pt.status, 'pre-history');
    assert.equal(pt.overall, null, `checkpoint ${pt.periodEnd} before first activity must be null, never 0`);
    assert.equal(pt.dimensions.cadence.score, null);
  }
  const latest = trends.points.at(-1);
  assert.equal(latest.status, 'measured');
  assert.ok(typeof latest.dimensions.cadence.score === 'number');
});

test('personTimeline includes dated delegation lifecycle events and still excludes confidential conflicts', () => {
  const demo = buildDemoState(NOW);
  demo.conflicts.push({
    id: 'conf-secret', title: 'Private interpersonal tension', summary: 'Secret mediation note',
    safety: 'direct', coordinator: 'Leader', process: 'Voluntary', sharing: 'Private',
    participants: [{ name: 'Freya Lindqvist', perspective: 'P', interest: 'I', participation: 'willing' }],
    openedOn: '2026-10-10', nextFollowUpOn: '2026-10-25', status: 'open',
    agreements: [], followUps: [], transitions: [], followUpFloor: 0,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  });
  const freya = demo.people.find((p) => p.name.includes('Freya'));
  const timeline = personTimeline(demo, freya.id);
  assert.ok(timeline.some((item) => item.kind === 'Delegation'), 'includes delegation start');
  assert.ok(timeline.some((item) => item.kind === 'Delegation completed'), 'includes completed delegation');
  assert.equal(JSON.stringify(timeline).includes('Secret mediation note'), false, 'never leaks conflicts');
});

test('Health & pulse view renders multi-horizon trends, approximate history notes, accessible tables and passes axe-core', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({
    root: env.document.getElementById('view'),
    storage: env.window.localStorage,
    now: () => NOW,
  });

  app.ctx.loadDemo();
  app.navigate('#/health');
  const view = env.document.getElementById('view');
  const trendBox = view.querySelector('[data-testid="health-trends"]');
  assert.ok(trendBox, 'renders longitudinal health trends section');
  assert.ok(trendBox.textContent.includes('12 weeks'));
  assert.ok(trendBox.textContent.includes('Feedback observation → conversation latency'));
  assert.ok(trendBox.textContent.includes('Delegation follow-through'));

  // Accessible tables with col/row headers exist inside chart disclosures
  const tables = trendBox.querySelectorAll('.chart-table-details table');
  assert.equal(tables.length, 3, 'health series, latency, and delegation charts each expose an HTML data table');
  for (const tbl of tables) {
    assert.ok(tbl.querySelectorAll('th[scope="col"]').length >= 2);
    assert.ok(tbl.querySelectorAll('th[scope="row"]').length >= 1);
  }

  // Switch horizon to 6 months and focus on Goal clarity
  const sixMonthBtn = [...trendBox.querySelectorAll('button')].find((b) => b.textContent.trim() === '6 months');
  sixMonthBtn.click();
  assert.equal(env.window.location.hash, '#/health?horizon=6m');
  const clarityBtn = [...view.querySelectorAll('[data-testid="health-trends"] button')].find((b) => b.textContent.trim() === 'Clarity of priorities');
  clarityBtn.click();
  assert.equal(env.window.location.hash, '#/health?horizon=6m&dim=clarity');
  const mainChartSeries = view.querySelector('.trend-section > .chart').querySelectorAll('[data-series]');
  assert.equal(mainChartSeries.length, 1, 'focuses main health chart on selected dimension');
  assert.equal(mainChartSeries[0].getAttribute('data-series'), 'clarity');

  // Inject a pre-v5 undated closed plan and verify approximate badge + hollow marker disclosure
  app.store.update((draft) => {
    draft.growthPlans[0].status = 'done';
    draft.growthPlans[0].closedOn = null;
  });
  app.navigate('#/health');
  assert.ok(view.textContent.includes('Approximate'), 'surfaces approximate reconstruction status');
  assert.ok(view.textContent.includes('A closed development plan has no recorded closing date.'));

  const violations = await runAxe(env);
  assert.deepEqual(
    violations.map((v) => `${v.id}: ${v.help}`),
    [],
    'zero axe-core violations on populated #/health view',
  );
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});
