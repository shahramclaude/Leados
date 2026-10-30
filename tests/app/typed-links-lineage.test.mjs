/**
 * Tests for the typed relationship registry and schema v48 propagation lineage.
 * These are cross-module integrity tests: declarations must survive a real
 * schema round-trip, resolve to navigable records, and remain content-free as
 * automation crosses module boundaries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS, linksForEntity, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  appendPropagationLineage,
  normalizePropagationLineage,
  PROPAGATION_LINEAGE_CAP,
  PROPAGATION_LINEAGE_STEP_CAP,
} from '../../app/core/domain/automationLineage.js';
import { EW_SERIES_REGISTRY } from '../../app/core/domain/watchRegistry.js';
import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';

const NOW = new Date('2026-10-29T10:00:00.000Z');
const NOW_ISO = NOW.toISOString();

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function traceRow({ id = 'trace-test', entity = 'scorecard', entityId = 'scorecard-1', type = 'scorecard.committed' } = {}) {
  const event = { type, entity, entityId };
  return {
    id,
    at: NOW_ISO,
    revision: 1,
    rootEvent: event,
    steps: [{
      stepId: 's1',
      parentStepId: null,
      depth: 0,
      event,
      rule: 'measurementRule',
      ruleIds: ['RULE-MTX-01'],
      changedCollections: ['decisions', 'links'],
      targets: [{ type: 'decision', id: 'decision-1', change: 'created', cleared: false }],
      links: [{
        sourceType: 'scorecard', sourceId: 'scorecard-1', relation: 'informs',
        targetType: 'decision', targetId: 'decision-1', sourceCleared: false, targetCleared: false,
      }],
      emitted: [{ type: 'decision.created', entity: 'decision', entityId: 'decision-1' }],
      omittedTargets: 0,
      omittedLinks: 0,
      omittedEvents: 0,
    }],
    truncatedSteps: 0,
    omittedTargets: 0,
    omittedLinks: 0,
    omittedEvents: 0,
  };
}

test('schema v48 migrates additively without guessing successful history and normalizes a bounded content-free trace', () => {
  assert.equal(SCHEMA_VERSION, 52);
  const previousLedger = [traceRow({ id: 'untrusted-v47-history' })];
  const migrated = migrate({ schemaVersion: 47, propagationLineage: previousLedger, scorecards: [] });
  assert.deepEqual(migrated.applied, ['47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52']);
  assert.deepEqual(migrated.raw.propagationLineage, [], 'the migration never infers or imports a pre-v48 success ledger');

  const rawTrace = traceRow();
  rawTrace.title = 'PRIVATE TRANSACTION TITLE';
  rawTrace.steps[0].summary = 'PRIVATE RULE SUMMARY';
  rawTrace.steps[0].targets[0].title = 'PRIVATE DECISION TITLE';
  rawTrace.steps[0].changedCollections.push('conflicts', 'pulses');
  rawTrace.steps[0].links.push({
    sourceType: 'conflict', sourceId: 'conflict-secret', relation: 'informs',
    targetType: 'decision', targetId: 'decision-1',
  });
  rawTrace.steps[0].emitted.push({ type: 'conflict.created', entity: 'conflict', entityId: 'conflict-secret' });
  const normalized = normalizeState({
    schemaVersion: 47,
    propagationLineage: [rawTrace],
  }, { now: NOW });
  const [stored] = normalized.state.propagationLineage;
  assert.equal(normalized.state.schemaVersion, 52);
  assert.equal(normalized.state.propagationLineage.length, 1);
  assert.deepEqual(stored.steps[0].changedCollections, ['decisions', 'links']);
  assert.equal(stored.steps[0].links.length, 1, 'confidential typed edges are rejected');
  assert.equal(stored.steps[0].emitted.length, 1, 'conflict events are rejected');
  const serialized = JSON.stringify(stored);
  for (const privateValue of ['PRIVATE TRANSACTION TITLE', 'PRIVATE RULE SUMMARY', 'PRIVATE DECISION TITLE', 'conflict-secret']) {
    assert.ok(!serialized.includes(privateValue), `lineage must not retain ${privateValue}`);
  }

  const tooManySteps = traceRow();
  tooManySteps.steps = Array.from({ length: PROPAGATION_LINEAGE_STEP_CAP + 3 }, (_, index) => ({
    ...traceRow().steps[0],
    stepId: `s${index + 1}`,
    event: { type: `rule.step${index + 1}`, entity: 'scorecard', entityId: 'scorecard-1' },
  }));
  const cappedSteps = normalizePropagationLineage([tooManySteps], NOW_ISO)[0];
  assert.equal(cappedSteps.steps.length, PROPAGATION_LINEAGE_STEP_CAP);
  assert.equal(cappedSteps.truncatedSteps, 3);

  const tooManyTransactions = Array.from({ length: PROPAGATION_LINEAGE_CAP + 2 }, (_, index) =>
    traceRow({ id: `trace-${index + 1}` }));
  const cappedRows = normalizePropagationLineage(tooManyTransactions, NOW_ISO);
  assert.equal(cappedRows.length, PROPAGATION_LINEAGE_CAP);
  assert.equal(cappedRows[0].id, 'trace-3', 'the oldest over-cap rows are the only ones trimmed');
});

test('lineage rejects overlong IDs without truncating references and refuses self-parenting steps', () => {
  const validMaxId = 'v'.repeat(80);
  const tooLongId = 't'.repeat(81);
  const row = traceRow({ entityId: validMaxId });
  row.steps[0].event = { ...row.steps[0].event, entityId: tooLongId };
  row.steps[0].targets.push({ type: 'delegation', id: tooLongId, change: 'created', cleared: false });
  row.steps[0].links.push({
    sourceType: 'scorecard', sourceId: 'scorecard-1', relation: 'informs',
    targetType: 'decision', targetId: tooLongId,
  });
  row.steps[0].emitted.push({ type: 'decision.created', entity: 'decision', entityId: tooLongId });
  row.steps.push({
    ...traceRow().steps[0],
    stepId: 's2',
    parentStepId: 's2',
    targets: [],
    links: [],
    emitted: [],
  });

  const [normalized] = normalizePropagationLineage([row], NOW_ISO);
  assert.equal(normalized.rootEvent.entityId, validMaxId, 'an ID at the 80-character limit remains exact');
  assert.equal(normalized.steps[0].event.entityId, null, 'an overlong event ID is removed instead of being truncated');
  assert.deepEqual(normalized.steps[0].targets.map((target) => target.id), ['decision-1']);
  assert.equal(normalized.steps[0].links.length, 1, 'an edge with an overlong endpoint is rejected');
  assert.equal(normalized.steps[0].emitted.at(-1).entityId, null);
  assert.equal(normalized.steps[1].parentStepId, null, 'a step cannot be its own parent');
  assert.ok(!JSON.stringify(normalized).includes(tooLongId.slice(0, 80)), 'no dangling 80-character prefix is stored');
  assert.deepEqual(normalizePropagationLineage([traceRow({ id: tooLongId })], NOW_ISO), [],
    'an overlong transaction ID is rejected rather than silently truncated');
});

test('append resolves repeated trace IDs without colliding or looping on an occupied suffix', () => {
  const draft = { propagationLineage: [traceRow({ id: 'trace-1' }), traceRow({ id: 'trace-1-3' })] };
  const template = traceRow();
  assert.equal(appendPropagationLineage(draft, {
    rootEvent: template.rootEvent,
    steps: template.steps,
  }, { idFactory: () => 'trace-1', now: NOW }), true);
  assert.equal(draft.propagationLineage.at(-1).id, 'trace-1-4');
  assert.equal(new Set(draft.propagationLineage.map((row) => row.id)).size, 3);
});

test('every registered link type survives schema normalization/reload and resolves to a navigable record', () => {
  assert.deepEqual(Object.keys(LINK_ENTITY_COLLECTIONS).sort(), [...LINK_ENTITY_TYPES].sort(),
    'the collection registry is exhaustive with declared types');
  assert.ok(LINK_RELATIONS.includes('informs'));
  const raw = JSON.parse(JSON.stringify(buildDemoState(NOW)));
  const sourceCase = raw.cases[0];
  const otherCase = raw.cases.find((row) => row.id !== sourceCase.id);
  raw.links = [];
  raw.reviews = [{
    id: 'review-link-fixture', personId: raw.people[0].id,
    periodStart: '2026-10-01', periodEnd: '2026-10-28', status: 'draft',
  }];
  raw.forecastChallenges = [{
    id: 'forecast-link-fixture', atomKey: 'case:delivery-days', sourceType: 'case', sourceId: sourceCase.id,
    recordedForecast: 14, forecastOn: '2026-10-29', title: 'A bounded test forecast',
  }];
  raw.premiseOutcomes = [{
    id: 'premise-outcome-link-fixture', premiseId: raw.premises[0].id,
    verdict: 'inconclusive', settledOn: '2026-10-29', createdAt: NOW_ISO,
  }];

  const targetIdFor = (type) => {
    if (type === 'case') return otherCase.id;
    if (type === 'lesson') return raw.retros.flatMap((retro) => retro.lessons || [])[0].id;
    if (type === 'series') return EW_SERIES_REGISTRY[0].id;
    const collection = LINK_ENTITY_COLLECTIONS[type];
    const row = raw[collection]?.[0];
    assert.ok(row?.id, `fixture provides an entity ID for ${type} (${collection})`);
    return row.id;
  };
  raw.links = LINK_ENTITY_TYPES.map((type) => ({
    id: `link-${type}`,
    sourceType: 'case',
    sourceId: sourceCase.id,
    targetType: type,
    targetId: targetIdFor(type),
    relation: 'informs',
    ruleId: 'TEST-LINK-01',
    createdAt: NOW_ISO,
  }));

  const first = normalizeState(raw, { now: NOW });
  assert.equal(first.state.links.length, LINK_ENTITY_TYPES.length,
    first.warnings.filter((warning) => warning.includes('Cross-module links')).join('; '));
  assert.deepEqual(new Set(first.state.links.map((link) => link.targetType)), new Set(LINK_ENTITY_TYPES));
  for (const link of first.state.links) {
    const resolved = resolveLinkedEntity(first.state, link.targetType, link.targetId);
    assert.ok(resolved, `${link.targetType}:${link.targetId} should resolve`);
    assert.equal(resolved.type, link.targetType);
    assert.match(resolved.route, /^#\//, `${link.targetType} has a navigable hash route`);
    const [routePath, routeQuery = ''] = resolved.route.slice(1).split('?');
    const routeSegments = routePath.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    const query = new URLSearchParams(routeQuery);
    const focusParam = {
      lesson: ['lesson', resolved.id], decision: ['decision', resolved.id], delegation: ['delegation', resolved.id],
      goal: ['goal', resolved.id], growth: ['plan', resolved.id], oneonone: ['meeting', resolved.id],
      feedback: ['item', resolved.id], onboarding: ['plan', resolved.id], readiness: ['seat', resolved.raw.seat],
      premise: ['premise', resolved.id], comms: ['draft', resolved.id],
      recognition: ['item', resolved.id], portfolio: ['item', resolved.id], forecast: ['challenge', resolved.id],
      tempo: ['schedule', resolved.id], strategy: ['bet', resolved.id], impact: ['study', resolved.id],
      premiseOutcome: ['outcome', resolved.id], dynamics: ['experiment', resolved.id], series: ['series', resolved.id],
      alert: ['alert', resolved.id], scorecard: ['card', resolved.id], capital: ['policy', resolved.id],
      fidelity: ['plan', resolved.id],
      merit: ['cycle', resolved.id],
      // Schema v52: the transition terminal addresses a programme by query, the
      // same contract as the merit cycle it prices against.
      transition: ['program', resolved.id],
      checkpoint: ['checkpoint', resolved.id],
    }[link.targetType];
    if (focusParam) {
      assert.equal(query.get(focusParam[0]), focusParam[1], `${link.targetType} route carries an encoded, exact focus ID`);
    } else if (link.targetType === 'candidate') {
      assert.equal(query.get('candidate'), resolved.id, 'candidate route carries the exact candidate ID');
      assert.equal(routeSegments.at(-1), resolved.raw.reqId, 'candidate route also names its owning requisition');
    } else {
      assert.equal(routeSegments.at(-1), resolved.id, `${link.targetType} route carries its exact path ID`);
    }
    assert.ok(linksForEntity(first.state, link.sourceType, link.sourceId)
      .some((item) => item.link.id === link.id && item.peer.id === link.targetId));
  }
  const reloaded = normalizeState(JSON.parse(JSON.stringify(first.state)), { now: NOW });
  assert.equal(reloaded.state.links.length, LINK_ENTITY_TYPES.length, 'the same graph survives a second normalize/load pass');
  assert.equal(reloaded.state.links.filter((link) => !resolveLinkedEntity(reloaded.state, link.targetType, link.targetId)).length, 0);
});

test('resolver URL construction encodes unusual entity IDs without changing identity', () => {
  const caseId = 'case/α &?next=value';
  const caseLink = resolveLinkedEntity({ cases: [{ id: caseId, title: 'Encoded case', status: 'open' }] }, 'case', caseId);
  assert.equal(caseLink.route, `#/cases/${encodeURIComponent(caseId)}`);

  const reqId = 'req/one & two';
  const candidateId = 'candidate/β?x=1';
  const candidateLink = resolveLinkedEntity({ candidates: [{ id: candidateId, reqId, name: 'Encoded candidate', stage: 'screen' }] }, 'candidate', candidateId);
  assert.equal(candidateLink.route, `#/hiring/${encodeURIComponent(reqId)}?candidate=${encodeURIComponent(candidateId)}`);
  const query = new URLSearchParams(candidateLink.route.split('?')[1]);
  assert.equal(query.get('candidate'), candidateId);
});

test('committing a distorted scorecard records real multi-module propagation, typed provenance, CSV-safe telemetry and durable backup', () => {
  const storage = memoryStorage();
  let serial = 0;
  const idFactory = (prefix) => `${prefix}-test-${++serial}`;
  const store = createStore({ storage, key: 'lineage-workspace', now: () => NOW, idFactory });
  store.seedDemo(buildDemoState(NOW));
  const api = createApi(store, { now: () => NOW, idFactory });
  const ownerId = store.state.people.find((person) => person.status !== 'archived').id;
  const created = api.createScorecard({
    title: 'PRIVATE SCORECARD TITLE',
    objective: 'PRIVATE OBJECTIVE SENTENCE',
    ownerId,
    tasks: [
      { id: 'metric-1', name: 'PRIVATE COUNTER A', kind: 'measured', weightPct: 70, trueValue: 25, effortCost: 25, gamingEase: 80, noisePct: 15, ratchetPct: 40 },
      { id: 'metric-2', name: 'PRIVATE COUNTER B', kind: 'measured', weightPct: 30, trueValue: 85, effortCost: 60, gamingEase: 15, noisePct: 35, ratchetPct: 10 },
      { id: 'metric-3', name: 'PRIVATE UNCOUNTED TASK', kind: 'unmeasured', weightPct: 0, trueValue: 75, effortCost: 45, gamingEase: 0, noisePct: 10, ratchetPct: 0 },
    ],
    stakesPct: 70,
    detectionPct: 20,
  });
  assert.equal(created.ok, true, created.error);
  const committed = api.commitScorecard(created.id, {});
  assert.equal(committed.ok, true, committed.error);

  assert.equal(store.state.propagationLineage.length, 1, 'one committed transaction is appended');
  const trace = store.state.propagationLineage[0];
  assert.equal(trace.rootEvent.type, 'scorecard.committed');
  assert.equal(trace.rootEvent.entity, 'scorecard');
  assert.equal(trace.rootEvent.entityId, created.id);
  const measurementStep = trace.steps.find((step) => step.rule === 'measurementRule');
  assert.ok(measurementStep, 'the registered rule actually ran and committed');
  assert.ok(measurementStep.targets.some((target) => target.type === 'decision' && target.change === 'created'));
  assert.ok(measurementStep.targets.some((target) => target.type === 'delegation' && target.change === 'created'));
  assert.ok(measurementStep.targets.some((target) => target.type === 'person' && target.change === 'updated'));
  assert.ok(measurementStep.emitted.some((event) => event.type === 'decision.created'));
  assert.ok(measurementStep.links.some((link) => link.sourceType === 'scorecard' && link.targetType === 'decision'));
  assert.ok(measurementStep.links.some((link) => link.sourceType === 'scorecard' && link.targetType === 'delegation'));
  const resolved = linksForEntity(store.state, 'scorecard', created.id);
  assert.ok(resolved.some((item) => item.peer.type === 'decision' && item.peer.route.startsWith(`#/decisions?decision=`)));
  assert.ok(resolved.some((item) => item.peer.type === 'delegation' && item.peer.route.startsWith(`#/delegations?delegation=`)));

  const traceJson = JSON.stringify(trace);
  for (const privateValue of ['PRIVATE SCORECARD TITLE', 'PRIVATE OBJECTIVE SENTENCE', 'PRIVATE COUNTER A', 'PRIVATE COUNTER B', 'PRIVATE UNCOUNTED TASK']) {
    assert.ok(!traceJson.includes(privateValue), `durable lineage must not copy ${privateValue}`);
  }

  const csv = exportWorkspaceCsv(store.state, 'propagationLineage', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.ok(CSV_EXPORTS.some((item) => item.key === 'propagationLineage'));
  assert.match(csv.csv, /source_event_type/);
  assert.match(csv.csv, /measurementRule/);
  assert.match(csv.csv, /transactions/);
  assert.match(csv.csv, /typed_link_types/);
  const csvHeaders = csv.csv.split(/\r?\n/, 1)[0].split(',');
  for (const forbiddenColumn of ['transaction_code', 'revision', 'recorded_at', 'step', 'depth']) {
    assert.ok(!csvHeaders.includes(forbiddenColumn), `${forbiddenColumn} is not a counts/types-only export field`);
  }
  for (const privateValue of [created.id, ownerId, 'PRIVATE SCORECARD TITLE', 'PRIVATE OBJECTIVE SENTENCE', 'PRIVATE COUNTER A']) {
    assert.ok(!csv.csv.includes(privateValue), `counts-only CSV must not contain ${privateValue}`);
  }

  const fullBackup = JSON.parse(store.exportJSON());
  assert.equal(fullBackup.state.propagationLineage.length, 1, 'full JSON backup preserves the bounded ledger');
  const redactedBackup = store.exportRedactedJSON();
  assert.equal(redactedBackup.ok, true);
  assert.equal(JSON.parse(redactedBackup.json).state.propagationLineage.length, 1,
    'unrelated scorecard provenance remains in the redacted operational backup');

  const persisted = JSON.parse(storage.values.get('lineage-workspace'));
  assert.equal(persisted.propagationLineage.length, 1, 'the transaction is persisted with the workspace state');
  const reloaded = createStore({ storage, key: 'lineage-workspace', now: () => NOW, idFactory });
  const loaded = reloaded.load();
  assert.equal(loaded.propagationLineage.length, 1);
  assert.deepEqual(loaded.propagationLineage[0], trace, 'reload preserves the content-free transaction exactly');
});

test('redacted export omits candidate-linked lineage transactions instead of exposing their trace references', () => {
  const store = createStore({ storage: memoryStorage(), now: () => NOW });
  const state = createEmptyState(NOW_ISO);
  state.settings.candidateRetentionDays = 1;
  state.requisitions = [{ id: 'req-closed', status: 'closed' }];
  state.candidates = [{
    id: 'candidate-private-1', reqId: 'req-closed', stage: 'rejected', appliedOn: '2025-01-01',
    decision: { decidedOn: '2025-01-02' }, keepInTouch: false,
  }];
  state.propagationLineage = [traceRow({
    id: 'trace-candidate', entity: 'candidate', entityId: 'candidate-private-1', type: 'candidate.rejected',
  })];
  Object.assign(store.state, state);
  const exported = store.exportRedactedJSON({ redactConflicts: false, pruneOverdueCandidates: true });
  assert.equal(exported.ok, true, exported.error);
  assert.equal(exported.omitted.candidateLineageTransactionsOmitted, 1);
  const redacted = JSON.parse(exported.json).state;
  assert.equal(redacted.candidates.length, 0);
  assert.deepEqual(redacted.propagationLineage, []);
  assert.ok(!exported.json.includes('candidate-private-1'));
});

test('clearDemo keeps the trace but scrubs every reference to records that cleanup removes, including after reload', () => {
  const storage = memoryStorage();
  let serial = 0;
  const idFactory = (prefix) => `${prefix}-clear-${++serial}`;
  const store = createStore({ storage, key: 'clear-lineage', now: () => NOW, idFactory });
  store.seedDemo(buildDemoState(NOW));
  const api = createApi(store, { now: () => NOW, idFactory });
  const ownerId = store.state.people.find((person) => person.status !== 'archived').id;
  const created = api.createScorecard({
    title: 'Clear-demo trace test',
    ownerId,
    tasks: [
      { name: 'Counted work', kind: 'measured', weightPct: 100, trueValue: 20, effortCost: 25, gamingEase: 90, noisePct: 10, ratchetPct: 40 },
      { name: 'Quality work', kind: 'unmeasured', weightPct: 0, trueValue: 80, effortCost: 40, gamingEase: 0, noisePct: 10, ratchetPct: 0 },
    ],
    stakesPct: 80,
    detectionPct: 10,
  });
  assert.equal(created.ok, true, created.error);
  assert.equal(api.commitScorecard(created.id, {}).ok, true);
  assert.equal(store.state.propagationLineage.length, 1);

  const before = store.state.propagationLineage[0];
  assert.ok(before.steps[0].targets.some((target) => target.type === 'person' && target.id === ownerId));
  store.clearDemo();
  assert.equal(store.state.propagationLineage.length, 1, 'clearing demo records does not erase rule history');
  const after = store.state.propagationLineage[0];
  assert.equal(after.rootEvent.entityId, created.id, 'the surviving scorecard source remains linked');
  assert.ok(after.steps.some((step) => step.targets.some((target) => target.cleared && target.id === null)),
    'removed demo people/delegations are represented as cleared, not dangling IDs');
  assert.ok(after.steps.some((step) => step.links.some((link) => link.targetCleared && link.targetId === null)));

  const reloaded = createStore({ storage, key: 'clear-lineage', now: () => NOW, idFactory });
  const loaded = reloaded.load();
  const persistedTrace = loaded.propagationLineage[0];
  assert.equal(persistedTrace.rootEvent.entityId, created.id);
  assert.ok(persistedTrace.steps.some((step) => step.targets.some((target) => target.cleared && target.id === null)));
  for (const step of persistedTrace.steps) {
    for (const target of step.targets) {
      if (target.id) assert.ok(resolveLinkedEntity(loaded, target.type, target.id), `${target.type}:${target.id} is not dangling`);
    }
    for (const link of step.links) {
      if (link.sourceId) assert.ok(resolveLinkedEntity(loaded, link.sourceType, link.sourceId));
      if (link.targetId) assert.ok(resolveLinkedEntity(loaded, link.targetType, link.targetId));
    }
  }
});
