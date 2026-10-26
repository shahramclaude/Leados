/**
 * tests/app/cases-automation.test.mjs — Cross-domain Operational Cases &
 * Event-Driven Parallel Cross-Module Propagation Engine (Schema v16) suite:
 *   1. Engineering FMEA (RPN + AIAG-VDA Severity-9/10 Action Priority override)
 *   2. Math/Finance 3-point PERT cost/capacity & risk-adjusted ROI
 *   3. Political Science Mendelow Power x Interest coalition & briefing cadence
 *   4. Production/Engineering 5-Whys & Swiss-Cheese RCA + blameless check
 *   5. Parallel event-driven propagation across Decisions, Delegations, Goals,
 *      1:1 Coaching/Prep, Insights, and Today + idempotent re-sync
 *   6. Downstream-to-upstream feedback loop (completing linked Delegation moves Case to Monitoring)
 *      and resolution loop (resolveCase updates linked Goal + residual RPN)
 *   7. Upstream escalation (Goal / Delegation / Decision -> Operational Case)
 *   8. Schema v14 -> v15 migration, orphan cleanup, conflict/pulse privacy walls,
 *      point-in-time reconstruction, and CSV formula-safe export
 *   9. Full JSDOM + axe-core UI workflow across #/cases, #/cases/:id, dialogs,
 *      and connected views
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  computeFmea,
  computePertImpact,
  summarizeStakeholderCoalition,
  evaluateRca,
  linksForEntity,
} from '../../app/core/domain/cases.js';
import {
  AUTOMATION_RULES,
  previewCasePropagations,
} from '../../app/core/domain/automation.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { suggestAgenda } from '../../app/core/domain/oneonone.js';
import { buildPrepSheet } from '../../app/core/domain/prep.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');
const TODAY = '2026-10-25';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k) => data.set(k, String(k)),
    removeItem: (k) => data.delete(k),
  };
}

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(storage = kvStorage(), now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-s23-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
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

async function withApp(fn, now = NOW) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => now });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function setValue(input, value) {
  assert.ok(input, 'expected a form input');
  if (input.type === 'checkbox' || input.type === 'radio') {
    input.checked = Boolean(value);
  } else {
    input.value = String(value);
  }
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

test('FMEA: computes RPN, AIAG-VDA Severity-9/10 Action Priority elevation, and residual RPN reduction', () => {
  // Severity >= 9 with P>=4 or D>=4 MUST elevate to High Action Priority even when RPN < 200 (AIAG-VDA 2019).
  const catastrophic = computeFmea({ severity: 9, probability: 4, detectability: 2 });
  assert.equal(catastrophic.rpn, 72);
  assert.equal(catastrophic.actionPriority, 'high', 'Severity 9+ with P>=4 overrides low RPN to High AP');

  // High RPN with residual reduction
  const mitigated = computeFmea({
    severity: 8,
    probability: 5,
    detectability: 6,
    residualSeverity: 7,
    residualProbability: 2,
    residualDetectability: 2,
  });
  assert.equal(mitigated.rpn, 240);
  assert.equal(mitigated.actionPriority, 'high');
  assert.equal(mitigated.residualRpn, 28);
  assert.equal(mitigated.rpnReductionPct, 88.33);
});

test('PERT & Finance: computes 3-point expected value, stdDev, 80% interval, expected loss, and mitigation ROI', () => {
  const econ = computePertImpact(
    {
      currency: 'USD',
      optimistic: 6000,
      mostLikely: 15000,
      pessimistic: 48000,
      mitigationCost: 4000,
      capacityDaysOptimistic: 3,
      capacityDaysMostLikely: 6,
      capacityDaysPessimistic: 15,
    },
    {
      severity: 8,
      probability: 5,
      detectability: 5,
      residualSeverity: 8,
      residualProbability: 1,
      residualDetectability: 2,
    },
  );
  // PERT mean = (6000 + 60000 + 48000) / 6 = 19000
  assert.equal(econ.hasFinancialEstimate, true);
  assert.equal(econ.cost.expected, 19000);
  // PERT stdDev = (48000 - 6000) / 6 = 7000
  assert.equal(econ.cost.stdDev, 7000);
  // Pre-probability = 5/10 = 0.50 -> expectedUnmitigatedLoss = 9500
  assert.equal(econ.expectedUnmitigatedLoss, 9500);
  // Post-probability = 1/10 = 0.10 -> expectedResidualLoss = 1900
  assert.equal(econ.expectedResidualLoss, 1900);
  // Loss avoided = 7600; netRiskAdjustedValue = 7600 - 4000 = 3600; mitigationRoi = 3600 / 4000 = 0.9x
  assert.equal(econ.expectedLossAvoided, 7600);
  assert.equal(econ.netRiskAdjustedValue, 3600);
  assert.equal(econ.mitigationRoi, 0.9);
  assert.equal(econ.capacity.expected, 7);
});

test('Political Science & RCA: Mendelow Power x Interest quadrants, overdue comms, and blameless 5-Whys', () => {
  const coalition = summarizeStakeholderCoalition(
    [
      { id: 's1', name: 'VP Finance', power: 5, interest: 4, stance: 'skeptical', commsCadence: 'weekly', nextCommsOn: '2026-10-20' },
      { id: 's2', name: 'Legal Counsel', power: 4, interest: 2, stance: 'neutral', commsCadence: 'milestone', nextCommsOn: '2026-11-05' },
      { id: 's3', name: 'Partner Eng', power: 2, interest: 5, stance: 'supportive', commsCadence: 'weekly', nextCommsOn: '2026-10-24' },
      { id: 's4', name: 'Vendor', power: 1, interest: 2, stance: 'champion', commsCadence: 'digest', nextCommsOn: '2026-11-15' },
    ],
    TODAY,
    { caseOpen: true },
  );
  assert.equal(coalition.byQuadrant['manage-closely'].length, 1);
  assert.equal(coalition.byQuadrant['keep-satisfied'].length, 1);
  assert.equal(coalition.byQuadrant['keep-informed'].length, 1);
  assert.equal(coalition.byQuadrant['monitor'].length, 1);
  assert.equal(coalition.overdueComms.length, 2, 'VP Finance and Partner Eng have past nextCommsOn');

  const blameful = evaluateRca(
    {
      whys: ['Engineer was careless during deploy'],
      systemicBarrier: '',
    },
    'incident',
  );
  assert.ok(String(blameful.blameWarning).includes('individual blame'), 'flags individual blame without systemic barrier');

  const systemic = evaluateRca(
    {
      problemStatement: 'Checkout workers exhausted CPU for 22 minutes.',
      whys: [
        'Webhook retries exhausted worker pool',
        'Retry policy lacked exponential backoff',
        'Staging load harness did not simulate downstream 503s',
      ],
      rootCause: 'Unbounded synchronous retry loop on partner 503s',
      systemicBarrier: 'No circuit-breaker or bounded retry queue on webhook ingress.',
      preventiveAction: 'Add exponential backoff, circuit-breaker, and 503 chaos test.',
    },
    'incident',
  );
  assert.equal(systemic.blameWarning, null);
  assert.equal(systemic.whyDepth, 3);
  assert.equal(systemic.completenessPct, 100);
});

test('Parallel Cross-Module Propagation: adding one Operational Case simultaneously creates Decision, Delegation, Goal check-in, 1:1 coaching topic, Stakeholder schedule, and typed links idempotently', () => {
  const { store, api } = harness();
  assert.equal(AUTOMATION_RULES.length, 31, 'catalog includes negotiation delivery feedback alongside existing rules');

  const p1 = api.addPerson({ name: 'Elena Rostova', role: 'Staff Engineer', startDate: '2025-01-15', talkingPoints: ['I want to discuss sustainable on-call load'] });
  const p2 = api.addPerson({ name: 'Marcus Vance', role: 'Product Lead', startDate: '2025-03-01' });
  const goal = api.addGoal({
    title: 'Deliver zero-downtime billing v2',
    ownerId: p1.id,
    coAuthored: true,
    confidence: 'on-track',
    dueDate: '2026-12-15',
  });

  const casePayload = {
    title: 'Billing webhook retry storm threatening Q4 SLA',
    kind: 'incident',
    status: 'mitigating',
    openedOn: '2026-10-24',
    reviewOn: '2026-11-05',
    ownerId: p1.id,
    involvedPersonIds: [p2.id],
    linkedGoalId: goal.id,
    summary: 'Unbounded synchronous retries saturated checkout workers for 22 minutes.',
    fmea: {
      severity: 8,
      probability: 5,
      detectability: 5,
      failureMode: 'Unbounded retry loop on partner 503',
      effect: 'Checkout API latency spikes > 10s',
      controls: 'Manual pager alert only',
    },
    financial: {
      currency: 'USD',
      optimistic: 8000,
      mostLikely: 20000,
      pessimistic: 50000,
      mitigationCost: 3500,
      capacityDaysOptimistic: 3,
      capacityDaysMostLikely: 6,
      capacityDaysPessimistic: 12,
      opportunityCost: 'Delays self-serve invoice export by one sprint.',
    },
    rca: {
      problemStatement: 'Checkout workers hit 100% CPU for 22 minutes.',
      whys: [
        'Checkout workers hit 100% CPU.',
        'Partner gateway returned 503 and triggered immediate retries.',
        'Webhook client had no jitter, circuit breaker, or queue cap.',
      ],
      rootCause: 'Synchronous unbounded retry loop in webhook client.',
      systemicBarrier: 'Missing circuit-breaker and dead-letter queue in webhook gateway.',
      preventiveAction: 'Deploy bounded retry queue and circuit breaker with chaos test.',
    },
    stakeholders: [
      {
        name: 'VP Revenue',
        role: 'Executive sponsor',
        power: 5,
        interest: 5,
        stance: 'skeptical',
        keyMessage: 'Enterprise SLA penalty exposure & cutover safeguard',
      },
    ],
    autoPropagate: true,
  };

  // Preview before saving surfaces all 5 parallel rules
  const preview = previewCasePropagations(casePayload, store.state, { now: NOW });
  assert.equal(
    preview.length,
    6,
    'previews Coalition cadence, Decision, Delegation, Goal risk update, 1:1 Coaching topic, and the capacity reserve (RULE-CAP-01)',
  );

  const res = api.addCase(casePayload);
  assert.equal(res.ok, true);
  assert.ok(res.propagations.length >= 5);

  // 1. Stakeholder coalition rule auto-scheduled nextCommsOn & commsCadence
  const savedCase = store.state.cases.find((c) => c.id === res.id);
  assert.ok(savedCase.stakeholders[0].commsCadence, 'assigned Mendelow comms cadence');
  assert.ok(savedCase.stakeholders[0].nextCommsOn, 'scheduled nextCommsOn date');

  // 2. Decision module simultaneously received a DACI-structured decision + link
  assert.equal(store.state.decisions.length, 1);
  const createdDecision = store.state.decisions[0];
  assert.ok(createdDecision.title.includes('Billing webhook retry storm'));
  assert.equal(createdDecision.chosen, '');
  assert.ok(createdDecision.options.length >= 2, 'seeds risk-adjusted PERT mitigation vs accept/defer options');

  // 3. Delegations module simultaneously received an accountable mitigation delegation + link
  assert.equal(store.state.delegations.length, 1);
  const createdDelegation = store.state.delegations[0];
  assert.equal(createdDelegation.personId, p1.id);
  assert.equal(createdDelegation.status, 'active');

  // 4. Goals module simultaneously received a risk check-in & lowered confidence to at-risk + link
  const updatedGoal = store.state.goals.find((g) => g.id === goal.id);
  assert.equal(updatedGoal.confidence, 'at-risk', 'High FMEA Action Priority lowers on-track goal to at-risk');
  assert.equal(updatedGoal.checkins.length, 1);
  assert.ok(updatedGoal.checkins[0].note.includes('RPN 200'));

  // 5. People / 1:1 Coaching & Prep simultaneously received blameless talkingPoints + links
  const elena = store.state.people.find((p) => p.id === p1.id);
  assert.equal(elena.talkingPoints.length, 2, 'employee-owned topics remain alongside case-generated support prompts');
  assert.ok(elena.talkingPoints.some((topic) => topic.startsWith('Case support (')), 'case-created coaching prompt remains natural language');
  assert.ok(elena.talkingPoints.some((topic) => topic.includes(`; ref ${res.id})`)), 'case-created coaching prompts carry a reversible case reference');
  const agenda = suggestAgenda(store.state, p1.id, NOW, store.state.settings);
  assert.ok(agenda.some((a) => a.source === 'case'), '1:1 agenda surfaces active High-priority operational case');
  const prep = buildPrepSheet(store.state, p1.id, NOW, store.state.settings);
  assert.equal(prep.openCases.length, 1);
  assert.equal(prep.openCases[0].rpn, 200);

  // 6. Typed Cross-Module Graph holds links without duplicates
  const caseLinks = linksForEntity(store.state, 'case', res.id);
  const peerTypes = caseLinks.map((l) => l.peer.type).sort();
  assert.deepEqual(peerTypes, ['decision', 'delegation', 'goal', 'person', 'person', 'portfolio']);

  // 6b. Capacity: the case's diverted person-days became a committed reserve
  const reserve = store.state.portfolio.find((p) => p.kind === 'capacity-reserve' && p.sourceId === res.id);
  assert.ok(reserve, 'RULE-CAP-01 registered a capacity reserve for the case');
  assert.equal(reserve.decision, 'funded');
  assert.equal(reserve.effortDays.mostLikely, 6);

  // 7. Re-syncing or updating the case is idempotent (never duplicates Decision/Delegation/Topic/Links)
  const syncRes = api.syncCaseAutomations(res.id);
  assert.equal(syncRes.ok, true);
  assert.equal(store.state.decisions.length, 1, 'no duplicate decision created');
  assert.equal(store.state.delegations.length, 1, 'no duplicate delegation created');
  assert.equal(store.state.people.find((p) => p.id === p1.id).talkingPoints.length, 2, 're-sync is idempotent and preserves the employee-owned topic');
  assert.equal(linksForEntity(store.state, 'case', res.id).length, 6, 'no duplicate links created');
  assert.equal(store.state.portfolio.length, 1, 'no duplicate capacity reserve created');

  // 8. Signals (buildInsights) surface CASE-02 (high-power skeptical stakeholder needing alignment)
  const insights = buildInsights(store.state, NOW);
  const ruleIds = insights.findings.map((f) => f.ruleId);
  assert.ok(ruleIds.includes('CASE-02'), 'surfaces Mendelow high-power skeptical stakeholder signal');
  assert.ok(!ruleIds.includes('CASE-01'), 'auto-propagated mitigation + systemic barrier clears CASE-01 gap');

  // 9. Downstream -> Upstream feedback loop: completing the linked Delegation moves Case to Monitoring!
  const compDel = api.completeDelegation(createdDelegation.id, {
    completedOn: TODAY,
    completionNote: 'Circuit breaker & bounded retry queue deployed and verified in chaos staging.',
  });
  assert.equal(compDel.ok, true);
  const caseAfterDel = store.state.cases.find((c) => c.id === res.id);
  assert.equal(
    caseAfterDel.status,
    'monitoring',
    'completing linked mitigation delegation automatically advances Case to Monitoring',
  );

  // 10. Resolving the Case records residual FMEA and propagates resolution check-in to linked Goal!
  const resolved = api.resolveCase(res.id, {
    status: 'resolved',
    resolvedOn: TODAY,
    resolutionNotes: 'Circuit breaker + bounded queue live in prod; 0 retry storms under synthetic 503 test.',
    residualSeverity: 7,
    residualProbability: 1,
    residualDetectability: 2,
  });
  assert.equal(resolved.ok, true);
  const closedCase = store.state.cases.find((c) => c.id === res.id);
  assert.equal(closedCase.status, 'resolved');
  assert.equal(computeFmea(closedCase.fmea).residualRpn, 14);
  assert.equal(
    store.state.goals.find((g) => g.id === goal.id).checkins.length,
    2,
    'linked Goal receives resolution check-in note',
  );
  const postInsights = buildInsights(store.state, NOW);
  assert.ok(!postInsights.findings.some((f) => f.ruleId.startsWith('CASE-')), 'resolved case clears active CASE risk findings');
  assert.ok(postInsights.wins.some((w) => w.title.toLowerCase().includes('operational case')), 'resolved case surfaces as an evidence-backed win');
  const topicsAfterResolution = store.state.people.find((p) => p.id === p1.id).talkingPoints;
  const learningTopic = topicsAfterResolution.find((topic) => topic.startsWith('Case learning ('));
  assert.equal(topicsAfterResolution[0], 'I want to discuss sustainable on-call load', 'employee-authored topic is untouched');
  assert.ok(learningTopic, 'case resolution changes only the linked support topic into a systemic learning conversation');
  assert.match(learningTopic, /not individual blame or performance rating/i);
  const preparedTopics = buildPrepSheet(store.state, p1.id, NOW, store.state.settings).theirTopics;
  assert.ok(preparedTopics.some((topic) => topic.text.startsWith('Case learning (') && topic.text.includes(`ref ${res.id}`)), `case closeout learning remains visible on the real prep sheet: ${JSON.stringify(preparedTopics)}`);
  assert.ok(resolved.propagations.some((item) => item.ruleId === 'RULE-COACH-02' && item.action === 'updated'));

  const reopened = api.reopenCase(res.id);
  assert.equal(reopened.ok, true);
  assert.ok(reopened.propagations.some((item) => item.ruleId === 'RULE-COACH-02' && item.action === 'reopened'));
  const topicsAfterReopen = store.state.people.find((p) => p.id === p1.id).talkingPoints;
  const restoredTopic = topicsAfterReopen.find((topic) => topic.startsWith('Case support ('));
  assert.ok(restoredTopic, 'reopening restores the active case-support prompt without duplication');
  assert.equal(topicsAfterReopen.length, 2, 'reopen preserves one employee topic and one case topic');
});

test('Upstream Escalation: Goal, Delegation, and Decision escalate cleanly to Operational Cases without duplicates', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Nadia Haddad', role: 'Platform Lead', startDate: '2024-06-01' });
  const goal = api.addGoal({
    title: 'Cut API p99 latency below 180ms',
    ownerId: owner.id,
    coAuthored: true,
    confidence: 'off-track',
    dueDate: '2026-11-30',
  });

  const escalated = api.escalateToCase({ sourceType: 'goal', sourceId: goal.id });
  assert.equal(escalated.ok, true);
  assert.equal(store.state.cases.length, 1);
  assert.equal(store.state.cases[0].linkedGoalId, goal.id);
  assert.ok(linksForEntity(store.state, 'goal', goal.id).length >= 1);

  // Attempting to escalate the same Goal again while the case is open prevents duplication
  const duplicate = api.escalateToCase({ sourceType: 'goal', sourceId: goal.id });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.existingCaseId, escalated.id);
  assert.equal(store.state.cases.length, 1);
});

test('Schema v14 -> v15 migration, privacy wall (conflicts/pulses forbidden), point-in-time rewind, and CSV export', () => {
  assert.equal(SCHEMA_VERSION, 23);
  const v14 = {
    ...createEmptyState(NOW.toISOString()),
    schemaVersion: 14,
  };
  delete v14.cases;
  delete v14.links;
  delete v14.settings.caseReviewDays;

  const snap = JSON.stringify(v14);
  const migrated = migrate(v14);
  assert.equal(JSON.stringify(v14), snap, 'migration never mutates input');
  assert.deepEqual(migrated.applied, ['14 → 15', '15 → 16', '16 → 17', '17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23']);
  assert.deepEqual(migrated.raw.cases, []);
  assert.deepEqual(migrated.raw.links, []);
  assert.equal(migrated.raw.settings.caseReviewDays, 14);

  // Privacy wall: injecting a link pointing to `conflict` or `pulse` is stripped with a warning
  migrated.raw.people = [{ id: 'p1', name: 'Safe Person', startDate: '2025-01-01', status: 'active' }];
  migrated.raw.cases = [{ id: 'c1', title: 'Valid Case', openedOn: '2026-10-20', status: 'open', ownerId: 'p1' }];
  migrated.raw.links = [
    { id: 'lnk-ok', sourceType: 'case', sourceId: 'c1', targetType: 'person', targetId: 'p1', relation: 'coaches' },
    { id: 'lnk-bad-conflict', sourceType: 'case', sourceId: 'c1', targetType: 'conflict', targetId: 'conf-1', relation: 'escalates-from' },
    { id: 'lnk-bad-pulse', sourceType: 'case', sourceId: 'c1', targetType: 'pulse', targetId: 'pul-1', relation: 'informs' },
  ];
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.equal(state.links.length, 1, 'strips forbidden conflict and pulse links');
  assert.equal(state.links[0].id, 'lnk-ok');
  assert.ok(warnings.length >= 1);

  // Point-in-time reconstruction rewinds cases opened after cutoff
  const demo = buildDemoState(NOW);
  assert.equal(demo.cases.length, 3, 'demo carries two open cases plus one settled (Schema v22)');
  const rewound = reconstructStateAt(demo, new Date('2026-09-01T10:00:00.000Z'));
  assert.equal(rewound.state.cases.length, 1, 'only the August-opened, August-settled case exists on the Sept 1 snapshot; the October cases do not appear');
  assert.equal(rewound.state.cases[0].status, 'resolved', 'its resolution also predates the cutoff, so it is not un-resolved');

  // CSV formula-injection defense & new export scopes ('cases' and 'caseLinks')
  demo.cases[0].title = '=CMD("calc")';
  const casesCsv = exportWorkspaceCsv(demo, 'cases', { now: NOW });
  assert.equal(casesCsv.ok, true);
  const parsedCases = parseCsv(casesCsv.csv);
  assert.equal(parsedCases.rows.length, 3, '3 demo cases');
  assert.ok(parsedCases.rows[0].some((cell) => String(cell).startsWith("'=")), 'neutralises spreadsheet formula injection');

  const linksCsv = exportWorkspaceCsv(demo, 'caseLinks', { now: NOW });
  assert.equal(linksCsv.ok, true);
  const parsedLinks = parseCsv(linksCsv.csv);
  assert.ok(parsedLinks.rows.length >= 7, '7 demo cross-module links');
});

test('UI & Accessibility: #/cases, #/cases/:id, Case Dialog live preview, Resolve Case, and connected views stay axe-clean', async () => {
  await withApp(async (app, env) => {
    // Load rich demo workspace (includes 2 Operational Cases & 7 cross-module links)
    app.ctx.loadDemo();
    const firstDemoCase = app.store.state.cases[0];
    const firstPerson = app.store.state.people[0];

    // 1. Today surfaces Operational cases & coalition triage card
    app.navigate('#/today');
    const todayText = env.document.querySelector('#view').textContent;
    assert.ok(todayText.includes('Operational cases & coalition'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    // 2. Navigate to #/cases portfolio view and verify axe-clean rendering
    app.navigate('#/cases');
    const casesText = env.document.querySelector('#view').textContent;
    assert.ok(casesText.includes('Operational cases'));
    assert.ok(casesText.includes('Billing ledger cutover reconciliation drift'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    // 3. Open #/cases/:id detail view and verify Mendelow, FMEA, PERT, 5-Whys, and axe
    app.navigate(`#/cases/${firstDemoCase.id}`);
    const detailText = env.document.querySelector('#view').textContent;
    assert.ok(detailText.includes('Mendelow'));
    assert.ok(detailText.includes('PERT'));
    assert.deepEqual(await axeViolations(env, '#view'), []);

    // 4. Open "+ Register case" dialog, verify live parallel propagation preview + axe, and submit!
    app.navigate('#/cases');
    const newBtn = Array.from(env.document.querySelectorAll('#view button')).find((b) =>
      b.textContent.includes('Register case'),
    );
    click(newBtn);

    const modalRoot = env.document.querySelector('#modal-root');
    const dialog = modalRoot.querySelector('[role="dialog"], dialog, .modal');
    assert.ok(dialog, 'case dialog opened');
    assert.deepEqual(await axeViolations(env, '#modal-root'), []);

    setValue(dialog.querySelector('[name="title"]'), 'EU data residency migration latency spike');
    setValue(dialog.querySelector('[name="summary"]'), 'Cross-region read replicas lag by 4.2s under batch imports.');
    setValue(dialog.querySelector('[name="severity"]'), '8');
    setValue(dialog.querySelector('[name="probability"]'), '5');
    setValue(dialog.querySelector('[name="detectability"]'), '5');
    setValue(dialog.querySelector('[name="systemicBarrier"]'), 'No read-your-writes session pinning on EU tenant router.');
    setValue(dialog.querySelector('[name="preventiveAction"]'), 'Ship tenant session pinning and lag circuit breaker.');

    const saveBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-primary'),
    );
    click(saveBtn);

    const createdCase = app.store.state.cases.find((c) => c.title.includes('EU data residency'));
    assert.ok(createdCase, 'new case persisted through UI dialog');

    // 5. Resolve first demo case via detail view dialog & verify axe
    app.navigate(`#/cases/${firstDemoCase.id}`);
    const resolveBtn = Array.from(env.document.querySelectorAll('#view button')).find((b) =>
      b.textContent.includes('Resolve case'),
    );
    click(resolveBtn);
    const resDialog = modalRoot.querySelector('[role="dialog"], dialog, .modal');
    assert.ok(resDialog, 'resolve dialog opened');
    assert.deepEqual(await axeViolations(env, '#modal-root'), []);
    setValue(
      resDialog.querySelector('[name="resolutionNotes"]'),
      'Shadow reconciliation + rounding guard shipped and verified across multi-currency ledger batch.',
    );
    const confirmResolveBtn = Array.from(resDialog.querySelectorAll('button')).find((b) =>
      b.classList.contains('btn-primary'),
    );
    click(confirmResolveBtn);
    assert.equal(app.store.state.cases.find((c) => c.id === firstDemoCase.id).status, 'resolved');

    // 6. Connected views (#/decisions, #/delegations, #/goals, #/people/:id, #/prep/:id) show linked cases & pass axe
    for (const hash of [
      '#/decisions',
      '#/delegations',
      '#/goals',
      `#/people/${firstPerson.id}`,
      `#/prep/${firstPerson.id}`,
    ]) {
      app.navigate(hash);
      assert.deepEqual(await axeViolations(env, '#view'), [], `${hash} must have zero axe violations`);
    }

    assert.deepEqual(env.consoleErrors, [], 'zero unexpected console/JSDOM errors');
  });
});
