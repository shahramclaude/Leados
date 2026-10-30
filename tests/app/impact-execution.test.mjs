/**
 * v49 Impact execution evidence: typed source selection, immutable scoring-time
 * snapshot, lineage bounds/redaction, legacy migration, and real propagation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  buildImpactExecutionSnapshot,
  interventionRecordFor,
  interventionRecords,
  normalizeImpactExecutionSnapshot,
} from '../../app/core/domain/impactExecution.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const TODAY = '2026-10-29';
const START = '2026-09-01';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function harness() {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v49-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

function trace({
  id,
  at = '2026-10-10T09:00:00.000Z',
  rootEntity = 'case',
  rootId = 'case-source',
  rootType = `${rootEntity}.created`,
  stepEvents = [],
  target = null,
  truncated = false,
} = {}) {
  const steps = stepEvents.map((event, index) => ({
    rule: `RULE-TEST-${index + 1}`,
    event,
    targets: index === 0 && target ? [target] : [],
    links: [],
    emitted: [],
  }));
  if (!steps.length) {
    steps.push({
      rule: 'RULE-TEST-1',
      event: { type: rootType, entity: rootEntity, entityId: rootId },
      targets: target ? [target] : [],
      links: [],
      emitted: [],
    });
  }
  return {
    id,
    at,
    revision: 1,
    rootEvent: { type: rootType, entity: rootEntity, entityId: rootId },
    steps,
    truncatedSteps: truncated ? 1 : 0,
    omittedTargets: 0,
    omittedLinks: 0,
    omittedEvents: 0,
  };
}

function caseStudy(overrides = {}) {
  return {
    id: 'impact-v49',
    title: 'Case response experiment',
    hypothesis: 'A bounded retry policy will reduce customer-impact minutes.',
    vitalId: 'feedback-cadence',
    interventionType: 'case',
    interventionId: 'case-source',
    interventionLabel: 'Retry storm response',
    windowStart: START,
    baselineWeeks: 8,
    windowWeeks: 4,
    alpha: 0.1,
    declaredOn: TODAY,
    status: 'running',
    lockedOn: null,
    verdict: null,
    evaluation: null,
    history: [],
    ...overrides,
  };
}

test('v49 migration preserves historical Impact results but never reconstructs execution evidence', () => {
  assert.equal(SCHEMA_VERSION, 53);
  const legacySnapshot = {
    version: 1,
    capturedAt: '2026-10-01T00:00:00.000Z',
    status: 'observed',
    sourceType: 'case',
    sourceAvailable: true,
    matchingTransactionCount: 4,
    traceIds: ['trace-old'],
  };
  const v48 = {
    schemaVersion: 48,
    cases: [{ id: 'case-source', title: 'Historical incident', kind: 'incident', status: 'resolved' }],
    impactStudies: [{
      ...caseStudy({ status: 'scored', lockedOn: '2026-10-10', declaredOn: START }),
      evaluation: { verdict: 'underpowered', reason: 'historical evaluation is retained' },
      executionSnapshot: legacySnapshot,
    }],
  };
  const migrated = migrate(v48, { now: NOW });
  assert.deepEqual(migrated.applied, ['48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53']);
  assert.equal(migrated.raw.schemaVersion, 53);
  assert.equal(migrated.raw.impactStudies[0].executionSnapshot, null);
  assert.deepEqual(migrated.raw.impactStudies[0].evaluation, v48.impactStudies[0].evaluation);
  assert.equal(v48.impactStudies[0].executionSnapshot, legacySnapshot, 'the migration does not mutate its input');

  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.equal(normalized.state.schemaVersion, 53);
  assert.equal(normalized.state.impactStudies[0].executionSnapshot, null);
  assert.equal(normalized.state.impactStudies[0].evaluation.verdict, 'underpowered');
});

test('typed source registry resolves current records and refuses cross-type or missing IDs', () => {
  const state = createEmptyState(NOW.toISOString());
  state.cases = [{ id: 'case-source', title: 'Retry storm response' }];
  state.decisions = [{ id: 'decision-other', title: 'Separate call' }];
  assert.equal(interventionRecordFor(state, 'case', 'case-source').entityType, 'case');
  assert.equal(interventionRecordFor(state, 'case', 'decision-other'), null);
  assert.equal(interventionRecordFor(state, 'case', 'missing'), null);
  assert.deepEqual(interventionRecords(state, 'network'), [], 'unsupported types have no misleading picker options');
  assert.deepEqual(interventionRecords(state, 'case').map((record) => record.id), ['case-source']);

  const env = harness();
  env.store.state.cases = state.cases;
  env.store.state.decisions = state.decisions;
  const invalid = env.api.createImpactStudy({
    title: 'Reject cross-type source',
    vitalId: 'feedback-cadence',
    windowStart: TODAY,
    interventionType: 'case',
    interventionId: 'decision-other',
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.field, 'interventionId');
  const valid = env.api.createImpactStudy({
    title: 'Accept typed source',
    vitalId: 'feedback-cadence',
    windowStart: TODAY,
    interventionType: 'case',
    interventionId: 'case-source',
  });
  assert.equal(valid.ok, true, valid.error);
  assert.equal(env.store.state.impactStudies[0].interventionLabel, 'Retry storm response');
  const invalidUpdate = env.api.updateImpactStudy(valid.id, {
    interventionType: 'decision',
    interventionId: 'case-source',
  });
  assert.equal(invalidUpdate.ok, false);
  assert.equal(env.store.state.impactStudies[0].interventionType, 'case', 'a rejected update leaves the source unchanged');
});

test('snapshot matches exact typed root/step events within the declared time window, not labels or targets', () => {
  const state = createEmptyState(NOW.toISOString());
  state.cases = [{ id: 'case-source', title: 'Private source title' }];
  state.propagationLineage = [
    trace({ id: 'trace-root', at: '2026-09-10T09:00:00.000Z' }),
    trace({
      id: 'trace-step',
      rootEntity: 'decision',
      rootId: 'decision-other',
      rootType: 'decision.created',
      at: '2026-09-11T09:00:00.000Z',
      stepEvents: [{ type: 'case.updated', entity: 'case', entityId: 'case-source' }],
    }),
    trace({
      id: 'trace-target-only',
      rootEntity: 'decision',
      rootId: 'decision-other',
      rootType: 'decision.created',
      at: '2026-09-12T09:00:00.000Z',
      target: { type: 'case', id: 'case-source' },
    }),
    trace({ id: 'trace-before-window', at: '2026-08-31T23:59:59.000Z' }),
    trace({ id: 'trace-after-capture', at: '2026-10-30T00:00:00.000Z' }),
  ];
  const snapshot = buildImpactExecutionSnapshot(caseStudy(), state, { capturedAt: NOW });
  assert.equal(snapshot.status, 'observed');
  assert.equal(snapshot.matchingTransactionCount, 2);
  assert.equal(snapshot.matchingRootTransactions, 1);
  assert.equal(snapshot.matchingStepEvents, 2, 'the source root event and its matching applied-step event are counted separately');
  assert.deepEqual(snapshot.traceIds, ['trace-root', 'trace-step']);
  assert.equal(snapshot.ledgerTransactionCount, 5);
  assert.ok(!JSON.stringify(snapshot).includes('Private source title'));
  assert.ok(!JSON.stringify(snapshot).includes('hypothesis'));

  const labelOnly = buildImpactExecutionSnapshot({ ...caseStudy(), interventionId: null }, state, { capturedAt: NOW });
  assert.equal(labelOnly.status, 'no-record-selected');
  assert.equal(labelOnly.matchingTransactionCount, 0);

  const targetIsNotEvent = buildImpactExecutionSnapshot(caseStudy(), {
    ...state,
    propagationLineage: [state.propagationLineage[2]],
  }, { capturedAt: NOW });
  assert.equal(targetIsNotEvent.status, 'no-matching-retained-trace');
  assert.equal(targetIsNotEvent.matchingTransactionCount, 0);
});

test('snapshot counts are capped, references are bounded, and malformed imports normalize safely', () => {
  const state = createEmptyState(NOW.toISOString());
  state.cases = [{ id: 'case-source', title: 'Source' }];
  state.propagationLineage = Array.from({ length: 15 }, (_, index) => trace({ id: `trace-${index}`, truncated: index === 0 }));
  const snapshot = buildImpactExecutionSnapshot(caseStudy(), state, { capturedAt: NOW });
  assert.equal(snapshot.matchingTransactionCount, 15);
  assert.equal(snapshot.traceIds.length, 12);
  assert.equal(snapshot.omittedTraceReferences, 3);
  assert.equal(snapshot.truncatedTransactions, 1);

  const normalized = normalizeImpactExecutionSnapshot({
    ...snapshot,
    matchingTransactionCount: 999999,
    changedTargetReferences: -4,
    traceIds: [...snapshot.traceIds, 'bad\ntrace', 'x'.repeat(100)],
    unexpectedPayload: 'discarded',
  }, { interventionType: 'case' });
  assert.equal(normalized.matchingTransactionCount, 250);
  assert.equal(normalized.changedTargetReferences, 0);
  assert.equal(normalized.traceIds.length, 12);
  assert.ok(normalized.traceIds.every((id) => !id.includes('\n') && id.length <= 80));
  assert.equal(Object.hasOwn(normalized, 'unexpectedPayload'), false);
});

test('real case.created propagation is joined to Impact scoring once, then links back without self-counting', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Nadia Haddad', role: 'Platform Lead', startDate: '2024-06-01' });
  const goal = api.addGoal({
    title: 'Cut API p99 latency below 180ms',
    ownerId: owner.id,
    coAuthored: true,
    confidence: 'on-track',
    dueDate: '2026-12-15',
  });
  const created = api.addCase({
    title: 'Payment gateway retry storm',
    kind: 'incident',
    openedOn: '2026-10-20',
    reviewOn: '2026-11-05',
    ownerId: owner.id,
    linkedGoalId: goal.id,
    fmea: { severity: 8, probability: 5, detectability: 5, failureMode: 'Unbounded retry loop' },
    rca: { preventiveAction: 'Add bounded retries and a circuit breaker' },
    stakeholders: [{ name: 'VP Revenue', power: 5, interest: 4, stance: 'skeptical' }],
  });
  assert.equal(created.ok, true, created.error);
  const rootTrace = store.state.propagationLineage.find((row) =>
    row.rootEvent?.type === 'case.created' && row.rootEvent.entity === 'case' && row.rootEvent.entityId === created.id);
  assert.ok(rootTrace, 'a real case action must create a successful lineage transaction');
  assert.ok(rootTrace.steps.some((step) => step.targets.some((target) => target.type === 'decision')),
    'case automation actually propagated into the decision module');
  assert.ok(rootTrace.steps.some((step) => step.targets.some((target) => target.type === 'delegation')),
    'case automation actually propagated into the delegation module');

  const declared = api.createImpactStudy({
    title: 'Retry-policy outcome',
    hypothesis: 'A bounded retry policy will reduce customer-impact minutes.',
    vitalId: 'feedback-cadence',
    interventionType: 'case',
    interventionId: created.id,
    windowStart: START,
  });
  assert.equal(declared.ok, true, declared.error);
  const score = api.lockImpactStudy(declared.id);
  assert.equal(score.ok, true, score.error);
  const study = store.state.impactStudies.find((row) => row.id === declared.id);
  const snapshot = study.executionSnapshot;
  assert.equal(snapshot.status, 'observed');
  assert.ok(snapshot.matchingTransactionCount >= 1);
  assert.ok(snapshot.traceIds.includes(rootTrace.id));
  assert.ok(store.state.links.some((link) =>
    link.sourceType === 'impact' && link.sourceId === declared.id
      && link.targetType === 'case' && link.targetId === created.id && link.relation === 'evaluates'),
  'RULE-IMP-01 creates a navigable Impact → Case graph edge');
  assert.ok(store.state.events.some((event) => event.type === 'impact.scored' && event.entityId === declared.id),
    'scoring itself is recorded as a domain event');
  const scoreTraceIds = new Set(store.state.propagationLineage
    .filter((row) => row.rootEvent?.type === 'impact.scored' && row.rootEvent.entityId === declared.id)
    .map((row) => row.id));
  assert.ok(snapshot.traceIds.every((id) => !scoreTraceIds.has(id)),
    'any rule lineage produced by scoring is outside the frozen pre-rule snapshot');
});

test('demo cleanup clears a deleted source pointer but preserves frozen counts and scrubs lineage IDs', () => {
  const { store } = harness();
  store.state.cases = [{ id: 'case-demo-source', title: 'Demo source' }];
  store.state.impactStudies = [caseStudy({
    id: 'impact-user-study',
    interventionId: 'case-demo-source',
    status: 'scored',
    lockedOn: TODAY,
    evaluation: { verdict: 'underpowered' },
    executionSnapshot: {
      version: 1,
      capturedAt: NOW.toISOString(),
      status: 'observed',
      sourceType: 'case',
      sourceAvailable: true,
      sourceCleared: false,
      ledgerTransactionCount: 1,
      ledgerAtCapacity: false,
      matchingTransactionCount: 1,
      matchingRootTransactions: 1,
      matchingStepEvents: 0,
      appliedRuleSteps: 1,
      changedTargetReferences: 1,
      newTypedLinkReferences: 0,
      emittedEventReferences: 0,
      truncatedTransactions: 0,
      traceIds: ['trace-cleared-source'],
      omittedTraceReferences: 0,
    },
  })];
  store.state.propagationLineage = [trace({ id: 'trace-cleared-source', rootId: 'case-demo-source' })];
  store.clearDemo();
  const study = store.state.impactStudies[0];
  assert.equal(store.state.cases.length, 0);
  assert.equal(study.interventionId, null);
  assert.equal(study.executionSnapshot.status, 'source-cleared');
  assert.equal(study.executionSnapshot.sourceAvailable, false);
  assert.equal(study.executionSnapshot.matchingTransactionCount, 1);
  assert.equal(store.state.propagationLineage[0].rootEvent.entityId, null);
  assert.equal(store.state.propagationLineage[0].rootEvent.cleared, true);
});

test('redacted export removes navigation IDs for lineage rows it omits without changing evidence counts', () => {
  const { store } = harness();
  store.state.cases = [{ id: 'case-source', title: 'Case source' }];
  store.state.requisitions = [];
  store.state.candidates = [{
    id: 'candidate-expired',
    reqId: 'missing-requisition',
    stage: 'rejected',
    appliedOn: '2025-01-01',
    lastActivityOn: '2025-01-01',
    decision: { outcome: 'reject', decidedOn: '2025-01-01' },
  }];
  store.state.settings.candidateRetentionDays = 90;
  store.state.impactStudies = [caseStudy({
    status: 'scored',
    lockedOn: TODAY,
    evaluation: { verdict: 'underpowered' },
    executionSnapshot: {
      version: 1,
      capturedAt: NOW.toISOString(),
      status: 'observed',
      sourceType: 'case',
      sourceAvailable: true,
      sourceCleared: false,
      ledgerTransactionCount: 1,
      ledgerAtCapacity: false,
      matchingTransactionCount: 1,
      matchingRootTransactions: 1,
      matchingStepEvents: 0,
      appliedRuleSteps: 1,
      changedTargetReferences: 1,
      newTypedLinkReferences: 0,
      emittedEventReferences: 0,
      truncatedTransactions: 0,
      traceIds: ['trace-candidate-linked'],
      omittedTraceReferences: 0,
    },
  })];
  store.state.propagationLineage = [trace({
    id: 'trace-candidate-linked',
    target: { type: 'candidate', id: 'candidate-expired' },
  })];

  const exported = store.exportRedactedJSON({ redactConflicts: false, pruneOverdueCandidates: true });
  assert.equal(exported.ok, true, exported.error);
  const file = JSON.parse(exported.json);
  assert.equal(file.state.candidates.length, 0);
  assert.equal(file.state.propagationLineage.length, 0);
  const snapshot = file.state.impactStudies[0].executionSnapshot;
  assert.deepEqual(snapshot.traceIds, []);
  assert.equal(snapshot.omittedTraceReferences, 1);
  assert.equal(snapshot.matchingTransactionCount, 1, 'the export does not revise the frozen scoring-time count');
  assert.ok(!exported.json.includes('trace-candidate-linked'));
  assert.equal(store.state.impactStudies[0].executionSnapshot.traceIds[0], 'trace-candidate-linked',
    'redaction only changes the export copy');
});

test('Impact CSV exports bounded counts only and labels legacy evidence as not recorded', () => {
  const scope = CSV_EXPORTS.find((row) => row.key === 'impact');
  assert.ok(scope.description.includes('zero matching count is not evidence') || scope.description.includes('zero matching count'));
  const state = createEmptyState(NOW.toISOString());
  state.impactStudies = [
    caseStudy({
      id: 'study-private-id',
      title: 'Private Impact title',
      hypothesis: 'Private Impact hypothesis',
      interventionId: 'case-private-id',
      interventionLabel: 'Private record label',
      status: 'scored',
      lockedOn: TODAY,
      executionSnapshot: {
        version: 1,
        capturedAt: NOW.toISOString(),
        status: 'observed',
        sourceType: 'case',
        sourceAvailable: true,
        sourceCleared: false,
        ledgerTransactionCount: 5,
        ledgerAtCapacity: false,
        matchingTransactionCount: 2,
        matchingRootTransactions: 1,
        matchingStepEvents: 1,
        appliedRuleSteps: 3,
        changedTargetReferences: 6,
        newTypedLinkReferences: 2,
        emittedEventReferences: 1,
        truncatedTransactions: 0,
        traceIds: ['trace-sensitive-id'],
        omittedTraceReferences: 0,
      },
    }),
    caseStudy({ id: 'study-legacy', status: 'scored', lockedOn: TODAY, executionSnapshot: null }),
  ];
  const exported = exportWorkspaceCsv(state, 'impact');
  assert.equal(exported.ok, true, exported.error);
  assert.ok(exported.csv.includes('execution_status'));
  assert.ok(exported.csv.includes('matching_transactions'));
  assert.ok(exported.csv.includes('observed'));
  assert.ok(exported.csv.includes('not-recorded'));
  assert.ok(!exported.csv.includes('study-private-id'));
  assert.ok(!exported.csv.includes('case-private-id'));
  assert.ok(!exported.csv.includes('trace-sensitive-id'));
  assert.ok(!exported.csv.includes('Private Impact title'));
  assert.ok(!exported.csv.includes('Private Impact hypothesis'));
  assert.ok(!exported.csv.includes('Private record label'));
});

test('Impact declaration UI exposes an accessible typed record picker and persists its exact selection', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.localStorage = window.localStorage;
  let app;
  try {
    const { createApp } = await import('../../app/main.js');
    app = createApp({ storage: window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/impact?tab=studies');
    const declare = Array.from(window.document.querySelectorAll('#view button'))
      .find((button) => button.textContent.trim() === 'Declare a study');
    assert.ok(declare, 'study declaration action is available');
    declare.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const dialog = window.document.querySelector('#modal-root [role="dialog"]');
    assert.ok(dialog, 'declaration opens a keyboard-operable dialog');
    const type = dialog.querySelector('#imp-type');
    const record = dialog.querySelector('#imp-record');
    assert.equal(record.labels[0].textContent.trim(), 'Specific workspace record (optional)');
    type.value = 'case';
    type.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.ok(record.options.length > 1, 'choosing a type populates only records of that type');
    const selected = Array.from(record.options).find((option) => option.value);
    assert.ok(selected, 'a real workspace record is selectable');
    record.value = selected.value;
    const axeSource = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    window.eval(axeSource);
    const dialogAxe = await window.axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(dialogAxe.violations).map((violation) => violation.id), [], 'the declaration dialog has no axe violations');
    dialog.querySelector('#imp-title').value = 'Typed source selection test';
    dialog.querySelector('#imp-hypothesis').value = 'A recorded change will move the selected metric.';
    const submit = Array.from(dialog.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Declare study');
    assert.ok(submit, 'keyboard user can reach the declaration submit button');
    submit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const saved = app.store.state.impactStudies.find((study) => study.title === 'Typed source selection test');
    assert.ok(saved, 'the declaration persisted');
    assert.equal(saved.interventionType, 'case');
    assert.equal(saved.interventionId, selected.value);
    assert.ok(saved.interventionLabel, 'the record label is copied for human display');
    assert.equal(app.ctx.api.lockImpactStudy(saved.id).ok, true, 'the UI-created study can be scored');
    app.ctx.navigate('#/impact?tab=studies');
    const evidencePanel = window.document.querySelector('#view [data-testid="impact-execution-evidence"]');
    assert.ok(evidencePanel, 'the scored study renders its recorded-propagation panel');
    assert.match(evidencePanel.textContent, /Captured/);
    assert.match(evidencePanel.textContent, /not proof of intervention delivery/i);
    const viewAxe = await window.axe.run(window.document.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(viewAxe.violations).map((violation) => violation.id), [], 'the scored evidence view is accessible to axe');
    assert.deepEqual(consoleErrors, []);
  } finally {
    app?.destroy?.();
    dom.window.close();
    for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) {
      delete globalThis[key];
    }
  }
});
