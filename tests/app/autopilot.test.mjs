/**
 * tests/app/autopilot.test.mjs — Autopilot Studio (Session 84, Schema v58,
 * ADR-0049, RULE-AP-01).
 *
 * The claims here are specific and falsifiable:
 *
 *   1. Schema v58 is additive. A v57 workspace gains two empty collections
 *      and nothing else; no agreement is inferred or activated from history.
 *   2. The registry is closed. Conditions reference only declared facts,
 *      templates only declared tokens, and actions only the five bounded
 *      effects. Anything else is refused at the boundary, never executed.
 *   3. Rehearsal is pure. It mutates a disposable copy only, reports unknown
 *      facts as non-matches (never zero), and skips paused records.
 *   4. Activation binds approval to a digest of the definition, the workspace
 *      revision and the rehearsal. A stale token, a blocked action or a
 *      changed workspace refuses to activate.
 *   5. Execution is all-or-nothing inside the triggering transaction: one
 *      case.created fans out into a decision, an owned task, a coaching
 *      prompt, a joined assumption and stakeholder drafts, each with typed
 *      `automates` provenance — while built-in rules still apply their normal
 *      effects in the same transaction and never duplicate the decision.
 *   6. Re-fires are idempotent. Identical facts reuse silently; changed facts
 *      open a new run that reuses the existing records instead of copying them.
 *   7. Missing owners and full queues block the run, record the refusal and
 *      pause the agreement. Nothing is guessed and nothing half-applies.
 *   8. A record created by an agreement cannot trigger another agreement, but
 *      a human action onward still can.
 *   9. An oversized batch applies nothing rather than an arbitrary prefix,
 *      files a failure receipt, and leaves every other rule running.
 *  10. The terminal renders keyboard-reachably with a single h1 and named
 *      tables, and every dialog control has a bound label.
 *  11. CSV scope #50 carries codes and counts but never a name, a threshold
 *      or action text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  AUTOPILOT_ACTION_BY_ID,
  AUTOPILOT_ACTIONS,
  AUTOPILOT_EVENTS,
  AUTOPILOT_LIMITS,
  AUTOPILOT_SOURCES,
  AUTOPILOT_SOURCE_BY_ID,
  sourceForEvent,
} from '../../app/core/domain/autopilotRegistry.js';
import {
  normalizeAutopilotPolicies,
  normalizePolicyPayload,
} from '../../app/core/domain/autopilotSchema.js';
import {
  activationGate,
  agreementTemplate,
  autopilotAttentionCount,
  autopilotBrief,
  autopilotRule,
  autopilotSignals,
  evaluatePolicy,
  executePolicy,
  rehearsePolicy,
} from '../../app/core/domain/autopilot.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, isDeclineMemoizable } from '../../app/core/domain/propagationContracts.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderAutopilot } from '../../app/views/autopilot.js';
import {
  openAutopilotPolicyDialog,
  openAutopilotRehearseDialog,
} from '../../app/ui/autopilot-modals.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS } from '../../app/core/domain/cases.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function makeStore() {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-s84-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

function seedOwner(api) {
  const person = api.addPerson({ name: 'Autopilot Owner', role: 'Lead' });
  assert.ok(person.ok, person.error);
  return person.id;
}

function pricedCaseInput(ownerId) {
  return {
    title: 'Vendor delay threatens launch',
    kind: 'risk',
    status: 'open',
    ownerId,
    openedOn: '2026-10-29',
    fmea: { severity: 8, probability: 6, detectability: 5 },
    financial: { currency: 'USD', optimistic: 10000, mostLikely: 20000, pessimistic: 40000 },
    stakeholders: [{ name: 'Big Customer', power: 5, interest: 5, stance: 'skeptical' }],
  };
}

function declareAndActivate(api, input) {
  const declared = api.addAutopilotPolicy(input);
  assert.ok(declared.ok, declared.error);
  const rehearsed = api.rehearseAutopilotPolicy(declared.id);
  assert.ok(rehearsed.ok, rehearsed.error);
  assert.equal(rehearsed.rehearsal.blockers.length, 0, 'the fixture rehearses clean');
  const activated = api.activateAutopilotPolicy(declared.id, { token: rehearsed.rehearsal.token });
  assert.ok(activated.ok, activated.error);
  return declared.id;
}

function policyArtifacts(state, policyId) {
  const runs = (state.autopilotRuns || []).filter((run) => run.policyId === policyId);
  const automates = (state.links || []).filter((link) => link.sourceType === 'autopilot' && link.sourceId === policyId);
  const markedDecisions = (state.decisions || []).filter((d) => String(d.rationale || '').includes('[AP:'));
  const markedDelegations = (state.delegations || []).filter((d) => String(d.support || '').includes('[AP:'));
  const markedPrompts = (state.people || []).flatMap((p) => p.talkingPoints || []).filter((t) => t.includes('[AP:'));
  const markedPremises = (state.premises || []).filter((p) => (p.history || []).some((h) => String(h.summary || '').includes('[AP:')));
  return { runs, automates, markedDecisions, markedDelegations, markedPrompts, markedPremises };
}

async function withDom(fn) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="modal-root"></div></body></html>', { virtualConsole, pretendToBeVisual: true, url: 'https://leados.test/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.localStorage = dom.window.localStorage;
  try { return await fn(dom.window); } finally {
    delete global.window; delete global.document; delete global.HTMLElement;
    delete global.Node; delete global.localStorage;
  }
}

/* ------------------------------------------------------------ 1. schema */

test('Schema v58 is additive: a v57 workspace gains two empty collections and no invented agreement', () => {
  assert.equal(SCHEMA_VERSION, 77);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.autopilotPolicies, []);
  assert.deepEqual(empty.autopilotRuns, []);

  const migrated = migrate({ schemaVersion: 57, settings: {}, people: [], autopilotPolicies: undefined });
  assert.equal(migrated.raw.schemaVersion, 77);
  assert.equal(migrated.applied.at(-1), '76 → 77');
  assert.deepEqual(migrated.raw.autopilotPolicies, []);
  assert.deepEqual(migrated.raw.autopilotRuns, []);

  const state = normalizeState({ schemaVersion: 57, people: [] }, { now: NOW }).state;
  assert.deepEqual(state.autopilotPolicies, []);
  assert.deepEqual(state.autopilotRuns, []);
});

/* ---------------------------------------------------------- 2. registry */

test('the registry is closed: 4 sources, 14 events, 5 actions, every event owned by exactly one source', () => {
  assert.equal(AUTOPILOT_SOURCES.length, 4);
  assert.equal(AUTOPILOT_EVENTS.length, 14);
  assert.equal(AUTOPILOT_ACTIONS.length, 5);
  for (const event of AUTOPILOT_EVENTS) {
    const owners = AUTOPILOT_SOURCES.filter((source) => source.events.includes(event));
    assert.equal(owners.length, 1, `${event} has exactly one owning source`);
    assert.equal(sourceForEvent(event).id, owners[0].id);
  }
  assert.equal(sourceForEvent('autopilot.activated'), null, 'agreement lifecycle events never retrigger agreements');
  assert.equal(sourceForEvent('case.deleted'), null, 'destructive events are outside the vocabulary');
  for (const source of AUTOPILOT_SOURCES) {
    assert.ok(source.fields.length >= 3, `${source.id} exposes facts`);
    assert.ok(source.collection && source.route, `${source.id} names its collection and route`);
  }
  for (const action of AUTOPILOT_ACTIONS) {
    assert.equal(AUTOPILOT_ACTION_BY_ID[action.id], action);
    assert.ok(action.target && action.route, `${action.id} names its target and route`);
  }
});

test('validation refuses unknown facts, operators, tokens, audiences and owners at the boundary', () => {
  const { store } = makeStore();
  const base = agreementTemplate('delay');

  const badToken = normalizePolicyPayload({
    ...base, actions: [{ type: 'decision', title: 'Review {{bogus}}', question: 'What now?', dueDays: 7 }],
  }, store.state, null);
  assert.equal(badToken.ok, false);
  assert.match(badToken.error, /{{title}}/);

  const badField = normalizePolicyPayload({
    ...base, conditions: [{ field: 'salary', op: 'gte', value: 1 }],
  }, store.state, null);
  assert.equal(badField.ok, false);
  assert.match(badField.error, /not a fact/);

  const badOp = normalizePolicyPayload({
    ...base, conditions: [{ field: 'exposure', op: 'contains', value: 'x' }],
  }, store.state, null);
  assert.equal(badOp.ok, false);

  const outOfRange = normalizePolicyPayload({
    ...base, conditions: [{ field: 'severity', op: 'gte', value: 99 }],
  }, store.state, null);
  assert.equal(outOfRange.ok, false);

  const commsOnGoal = normalizePolicyPayload({
    ...agreementTemplate('goal'), actions: [{ type: 'comms', audience: 'key' }],
  }, store.state, null);
  assert.equal(commsOnGoal.ok, false);
  assert.match(commsOnGoal.error, /only for cases/);

  const duplicate = normalizePolicyPayload({
    ...base, actions: [{ type: 'decision', title: 'A', question: 'Q', dueDays: 7 }, { type: 'decision', title: 'B', question: 'Q', dueDays: 7 }],
  }, store.state, null);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /at most once/);

  const ghostOwner = normalizePolicyPayload({
    ...base,
    actions: [{ type: 'delegation', ownerMode: 'fixed', ownerId: 'person-ghost', title: 'T', outcome: 'O', authority: 'own', dueDays: 3 }],
  }, store.state, null);
  assert.equal(ghostOwner.ok, false);
  assert.match(ghostOwner.error, /not an active person/);

  const empty = normalizePolicyPayload({ ...base, actions: [] }, store.state, null);
  assert.equal(empty.ok, false);

  const budget = normalizePolicyPayload({ ...base, maxRuns: 0 }, store.state, null);
  assert.equal(budget.ok, false);
});

test('declaring stores a draft with version 1 and a history entry, never an active agreement', () => {
  const { store, api } = makeStore();
  const declared = api.addAutopilotPolicy({ template: 'delay' });
  assert.ok(declared.ok, declared.error);
  assert.equal(declared.version, 1);
  const policy = store.state.autopilotPolicies[0];
  assert.equal(policy.status, 'draft');
  assert.equal(policy.version, 1);
  assert.equal(policy.rehearsalToken, null);
  assert.equal(policy.history.length, 1);
  assert.match(policy.history[0].summary, /Rehearsal is required/);
  const event = store.state.events.at(-1);
  assert.equal(event.type, 'autopilot.created');
  assert.equal(event.entityId, declared.id);
});

/* --------------------------------------------------------- 3. rehearsal */

test('rehearsal is pure: the workspace is byte-identical afterwards', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  api.addCase(pricedCaseInput(ownerId));
  const declared = api.addAutopilotPolicy({ template: 'delay' });
  const before = JSON.stringify(store.state);
  const rehearsed = api.rehearseAutopilotPolicy(declared.id);
  assert.ok(rehearsed.ok, rehearsed.error);
  assert.equal(JSON.stringify(store.state), before, 'rehearsal wrote nothing');
  assert.ok(rehearsed.rehearsal.token);
  assert.match(rehearsed.rehearsal.caveat, /Not a historical backtest/);
});

test('an unrecorded fact never matches, and a paused record is skipped rather than matched', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  api.addCase({ ...pricedCaseInput(ownerId), title: 'Unpriced', financial: {} });
  api.addCase({ ...pricedCaseInput(ownerId), title: 'Paused', autoPropagate: false });
  const declared = api.addAutopilotPolicy({ template: 'delay' });
  const { rehearsal } = api.rehearseAutopilotPolicy(declared.id);
  const unpriced = rehearsal.rows.find((row) => row.title === 'Unpriced');
  assert.equal(unpriced.matched, false, 'no exposure recorded means no match, not a zero');
  assert.ok(unpriced.conditions.some((c) => c.actual === null && c.pass === false));
  const paused = rehearsal.rows.find((row) => row.title === 'Paused');
  assert.equal(paused.matched, false);
  assert.equal(paused.paused, true);
});

/* --------------------------------------------------------- 4. activation */

test('activation without a token, with a wrong token, or after a workspace change is refused', () => {
  const { store, api } = makeStore();
  seedOwner(api);
  const declared = api.addAutopilotPolicy({ template: 'delay' });
  assert.equal(api.activateAutopilotPolicy(declared.id, {}).ok, false);
  assert.equal(api.activateAutopilotPolicy(declared.id, { token: 'deadbeefdeadbeef' }).ok, false);

  const first = api.rehearseAutopilotPolicy(declared.id).rehearsal;
  api.addPerson({ name: 'A change that invalidates the preview', role: 'IC' });
  const stale = api.activateAutopilotPolicy(declared.id, { token: first.token });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /changed since rehearsal/);
  assert.ok(stale.rehearsal, 'the refusal carries a fresh rehearsal');

  const fresh = api.rehearseAutopilotPolicy(declared.id).rehearsal;
  const activated = api.activateAutopilotPolicy(declared.id, { token: fresh.token });
  assert.ok(activated.ok, activated.error);
  const policy = store.state.autopilotPolicies[0];
  assert.equal(policy.status, 'active');
  assert.equal(policy.rehearsalToken, fresh.token);
  assert.ok(policy.activatedAt);
  assert.equal(api.activateAutopilotPolicy(declared.id, { token: fresh.token }).ok, false, 'double activation is refused');
});

test('a rehearsal blocker refuses activation until the source or agreement is repaired', () => {
  const { store, api } = makeStore();
  api.addCase({ ...pricedCaseInput(null), ownerId: null, title: 'Nobody owns this yet' });
  const declared = api.addAutopilotPolicy({
    name: 'Ownerless test',
    sourceType: 'case',
    trigger: 'case.created',
    conditions: [{ field: 'kind', op: 'eq', value: 'risk' }],
    actions: [{ type: 'delegation', ownerMode: 'source', ownerId: '', title: 'Follow up {{title}}', outcome: 'Own it', authority: 'recommend', dueDays: 3 }],
    maxRuns: 10,
  });
  assert.ok(declared.ok, declared.error);
  const rehearsed = api.rehearseAutopilotPolicy(declared.id);
  assert.equal(rehearsed.rehearsal.blockers.length, 1);
  const refused = api.activateAutopilotPolicy(declared.id, { token: rehearsed.rehearsal.token });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /blocked action/);
  assert.equal(store.state.autopilotPolicies[0].status, 'draft');
});

/* ---------------------------------------------------------- 5. execution */

test('one case.created fans out into five typed effects while built-in rules still do their jobs', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const policyId = declareAndActivate(api, { template: 'delay' });
  const created = api.addCase(pricedCaseInput(ownerId));
  assert.ok(created.ok, created.error);

  const state = store.state;
  const found = policyArtifacts(state, policyId);
  assert.equal(found.runs.length, 1, 'exactly one run');
  assert.equal(found.runs[0].status, 'applied');
  assert.deepEqual(found.runs[0].actions.map((a) => `${a.type}:${a.status}`),
    ['decision:created', 'delegation:created', 'coaching:created', 'premise:created', 'comms:created']);

  // Typed provenance: one automates edge per created record plus one semantic edge each.
  assert.equal(found.automates.length, 5, 'one automates edge per effect');
  for (const link of found.automates) assert.equal(link.relation, 'automates');
  const semantic = state.links.filter((link) => link.sourceType === 'case' && link.sourceId === created.id);
  for (const relation of ['decides', 'tracks-followup', 'coaches', 'tests', 'communicates']) {
    assert.ok(semantic.some((link) => link.relation === relation), `a ${relation} edge exists`);
  }

  // The decision is undecided, the premise joins it, drafts stay drafts.
  assert.equal(found.markedDecisions.length, 1);
  assert.equal(found.markedDecisions[0].chosen, '', 'the agreement never selects an option');
  assert.ok(found.markedDecisions[0].options.length >= 2, 'a person gets real options');
  assert.equal(found.markedPremises.length, 1);
  assert.equal(found.markedPremises[0].decisionId, found.markedDecisions[0].id, 'the premise joins the run decision');
  assert.equal(found.markedDelegations.length, 1);
  assert.equal(found.markedDelegations[0].personId, ownerId, 'the source owner owns the work');
  assert.equal(found.markedPrompts.length, 1, 'one blameless prompt, not a rating');
  const drafts = state.commsDrafts.filter((d) => d.caseId === created.id);
  assert.ok(drafts.length >= 1);
  assert.ok(drafts.every((d) => d.status !== 'sent'), 'nothing is ever sent');
  const latest = drafts[drafts.length - 1];
  assert.equal(latest.status, 'draft', 'the current brief awaits a human');
  const commsTarget = found.runs[0].actions.find((a) => a.type === 'comms').targetId;
  assert.ok(drafts.some((d) => d.id === commsTarget), 'the run points at a real draft');
  // The agreement drafts before built-in stakeholder scheduling lands, so the
  // built-in pass may supersede that first draft in the same transaction.
  // Supersession is honest versioning, not a second message: at most two
  // drafts exist and exactly one is current.
  assert.ok(drafts.length <= 2, `at most one supersession, found ${drafts.length}`);
  assert.equal(drafts.filter((d) => d.status === 'draft').length, 1);

  // Built-in rules ran in the same transaction without duplicating the decision.
  assert.equal(state.decisions.length, 1, 'RULE-DEC-01 saw the linked decision and declined');
  const kase = state.cases.find((c) => c.id === created.id);
  assert.equal(kase.status, 'mitigating', 'RULE-DEL-01 still advanced the case');
  assert.ok(state.delegations.some((d) => d.title.startsWith('Mitigate:')), 'the built-in mitigation task still exists');
  assert.ok(state.links.some((l) => l.relation === 'mitigates'), 'built-in typed links still attach');
});

test('a delegation completion fires a second source end to end', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const policyId = declareAndActivate(api, { template: 'completion' });
  const task = api.addDelegation({ personId: ownerId, title: 'Migrate the rota', expectedOutcome: 'Done', authority: 'own', support: 'Weekly check-ins and vendor access', delegatedOn: '2026-10-20', dueOn: '2026-10-29' });
  assert.ok(task.ok, task.error);
  assert.equal(store.state.autopilotRuns.length, 0, 'creation does not match a completion trigger');
  const done = api.completeDelegation(task.id, { completedOn: '2026-10-29', completionNote: 'Migrated' });
  assert.ok(done.ok, done.error);
  const found = policyArtifacts(store.state, policyId);
  assert.equal(found.runs.length, 1);
  assert.equal(found.runs[0].status, 'applied');
  assert.equal(found.markedPrompts.length, 1);
  assert.equal(found.markedDecisions.length, 1, 'the learning-loop decision exists');
});

/* -------------------------------------------------------- 6. idempotency */

test('identical facts re-fire silently; changed facts open a run that reuses instead of duplicating', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const policyId = declareAndActivate(api, {
    name: 'Track exposure drift',
    sourceType: 'case',
    trigger: 'case.updated',
    conditions: [{ field: 'kind', op: 'eq', value: 'risk' }, { field: 'exposure', op: 'gte', value: 10000 }],
    actions: [
      { type: 'decision', title: 'Review {{title}}', question: 'What now?', dueDays: 7 },
      { type: 'delegation', ownerMode: 'source', ownerId: '', title: 'Follow up {{title}}', outcome: 'Own it', authority: 'recommend', dueDays: 3 },
    ],
    maxRuns: 10,
  });
  const marked = () => policyArtifacts(store.state, policyId);
  const created = api.addCase(pricedCaseInput(ownerId));
  assert.ok(created.ok, created.error);
  assert.equal(store.state.autopilotRuns.length, 0, 'creation does not match an update trigger');

  api.updateCase(created.id, { summary: 'A first touch that changes no fact' });
  assert.equal(store.state.autopilotRuns.length, 1, 'the first matching update applies');
  assert.equal(marked().markedDecisions.length, 1);

  api.updateCase(created.id, { summary: 'A second touch that changes no fact' });
  assert.equal(store.state.autopilotRuns.length, 1, 'same facts, same key: no new run');
  assert.equal(marked().markedDecisions.length, 1, 'nothing duplicated');

  api.updateCase(created.id, { financial: { currency: 'USD', optimistic: 50000, mostLikely: 80000, pessimistic: 120000 } });
  assert.equal(store.state.autopilotRuns.length, 2, 'changed exposure means a new run');
  assert.equal(store.state.autopilotRuns[1].status, 'reused');
  assert.equal(marked().markedDecisions.length, 1, 'the existing decision is reused, not copied');
  assert.equal(marked().markedDelegations.length, 1, 'the existing task is reused, not copied');
});

/* -------------------------------------------------- 7. refusals that pause */

test('a missing owner blocks the run, pauses the agreement and raises AP-01', () => {
  const { store, api } = makeStore();
  seedOwner(api);
  const policyId = declareAndActivate(api, {
    name: 'Needs an owner',
    sourceType: 'case',
    trigger: 'case.created',
    conditions: [{ field: 'kind', op: 'eq', value: 'risk' }],
    actions: [{ type: 'delegation', ownerMode: 'source', ownerId: '', title: 'Follow up {{title}}', outcome: 'Own it', authority: 'recommend', dueDays: 3 }],
    maxRuns: 10,
  });
  // Rehearsal was clean because no records existed; the ownerless record arrives afterwards.
  const added = api.addCase({ ...pricedCaseInput(null), ownerId: null, title: 'Nobody owns this yet' });
  assert.ok(added.ok, added.error);
  const policy = store.state.autopilotPolicies.find((p) => p.id === policyId);
  assert.equal(policy.status, 'paused');
  assert.match(policy.pausedReason, /no active owner/);
  const runs = store.state.autopilotRuns.filter((run) => run.policyId === policyId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'blocked');
  assert.equal(store.state.delegations.length, 0, 'nothing half-applied');
  const signals = autopilotSignals(store.state);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].ruleId, 'AP-01');
  assert.equal(signals[0].domain, 'Autopilot');
  assert.equal(autopilotAttentionCount(store.state), 1);
  const insights = buildInsights(store.state, NOW);
  assert.ok(insights.findings.some((f) => f.ruleId === 'AP-01'), 'the signal reaches the feed');
  assert.ok(insights.byDomain.some((row) => row.domain === 'Autopilot'), 'the Autopilot bucket is registered');
});

test('a full 1:1 queue blocks the whole agreement without partial writes', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  store.update((draft) => {
    draft.people.find((p) => p.id === ownerId).talkingPoints = Array.from({ length: 12 }, (_, i) => `Existing prompt ${i + 1}`);
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Fill the queue' });
  const policyId = declareAndActivate(api, {
    name: 'Coach everything',
    sourceType: 'case',
    trigger: 'case.created',
    conditions: [],
    actions: [
      { type: 'decision', title: 'Review {{title}}', question: 'What now?', dueDays: 7 },
      { type: 'coaching', ownerMode: 'source', ownerId: '', text: 'Ask {{owner}} about {{title}} support' },
    ],
    maxRuns: 10,
  });
  api.addCase(pricedCaseInput(ownerId));
  const policy = store.state.autopilotPolicies.find((p) => p.id === policyId);
  assert.equal(policy.status, 'paused');
  assert.match(policy.pausedReason, /queue is full/);
  const runs = store.state.autopilotRuns.filter((run) => run.policyId === policyId);
  assert.equal(runs.length, 1, 'the refusal is a run, not a silent skip');
  assert.equal(runs[0].status, 'blocked');
  assert.equal(store.state.decisions.filter((d) => String(d.rationale || '').includes('[AP:')).length, 0,
    'the decision was not created ahead of the blocked prompt');
});

/* ------------------------------------------------- 8. no policy cascades */

test('an agreement cannot trigger another agreement, but a human action still can', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const firstId = declareAndActivate(api, {
    name: 'Case opens a decision',
    sourceType: 'case',
    trigger: 'case.created',
    conditions: [],
    actions: [{ type: 'decision', title: 'Review {{title}}', question: 'What now?', dueDays: 7 }],
    maxRuns: 10,
  });
  const secondId = declareAndActivate(api, {
    name: 'Decision opens work',
    sourceType: 'decision',
    trigger: 'decision.created',
    conditions: [],
    actions: [{ type: 'delegation', ownerMode: 'fixed', ownerId, title: 'Act on {{title}}', outcome: 'Act', authority: 'own', dueDays: 3 }],
    maxRuns: 10,
  });
  api.addCase(pricedCaseInput(ownerId));
  assert.equal(store.state.autopilotRuns.filter((r) => r.policyId === firstId).length, 1, 'the first agreement fired');
  assert.equal(store.state.autopilotRuns.filter((r) => r.policyId === secondId).length, 0,
    'the derived decision.created did not chain into the second agreement');

  api.addDecision({ title: 'A human decision', question: 'Made by a person' });
  assert.equal(store.state.autopilotRuns.filter((r) => r.policyId === secondId).length, 1,
    'a human-created decision still triggers the second agreement');
});

/* ----------------------------------------------------- 9. batch ceiling */

test('an oversized batch applies nothing, files a receipt, and leaves other rules running', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  for (let i = 1; i <= 6; i += 1) {
    declareAndActivate(api, {
      name: `Blanket agreement ${i}`,
      sourceType: 'case',
      trigger: 'case.created',
      conditions: [],
      actions: ['decision', 'delegation', 'coaching', 'premise', 'comms'].map((type) => {
        if (type === 'decision') return { type, title: `Review ${i} {{title}}`, question: 'What now?', dueDays: 7 };
        if (type === 'delegation') return { type, ownerMode: 'fixed', ownerId, title: `Work ${i} {{title}}`, outcome: 'Act', authority: 'own', dueDays: 3 };
        if (type === 'coaching') return { type, ownerMode: 'fixed', ownerId, text: `Support ${i} {{title}}` };
        if (type === 'premise') return { type, ownerMode: 'fixed', ownerId, statement: `Assumption ${i} {{title}}`, signpost: 'Watch', priorPct: 70, reviewDays: 14 };
        return { type, audience: 'key' };
      }),
      maxRuns: 10,
    });
  }
  const created = api.addCase(pricedCaseInput(ownerId));
  assert.ok(created.ok, created.error);
  assert.equal(store.state.cases.length, 1, 'the action itself still committed');
  assert.equal(store.state.autopilotRuns.length, 0, 'no agreement applied anything');
  assert.equal(policyArtifacts(store.state, store.state.autopilotPolicies[0].id).automates.length, 0);
  assert.equal(store.state.decisions.filter((d) => String(d.rationale || '').includes('[AP:')).length, 0);
  const receipts = store.state.propagationReceipts || [];
  assert.ok(receipts.some((r) => String(r.rule || '').includes('autopilotRule')), 'the ceiling breach filed a receipt');
  assert.ok(store.state.events.some((e) => e.type === 'automation.rule_error'), 'the rollback is in the audit log');
  assert.ok(store.state.delegations.some((d) => d.title.startsWith('Mitigate:')), 'built-in rules were unaffected');
  assert.equal(store.state.cases[0].status, 'mitigating');
});

/* --------------------------------------------------------------- 10. UI */

test('the terminal renders one h1 and named tables on every panel', async () => {
  const { store, api } = makeStore();
  seedOwner(api);
  api.addAutopilotPolicy({ template: 'delay' });
  const makeCtx = (panel, policy = '') => ({
    state: store.state,
    now: NOW,
    query: new URLSearchParams(`${panel ? `panel=${panel}` : ''}${policy ? `&policy=${policy}` : ''}`),
    navigate: () => {},
    refresh: () => {},
    api: {},
  });
  await withDom(async () => {
    for (const panel of ['agreements', 'runs', 'method']) {
      const node = renderAutopilot(makeCtx(panel));
      const host = document.createElement('div');
      host.append(node);
      assert.equal(host.querySelectorAll('h1').length, 1, `panel ${panel} has exactly one h1`);
      for (const el of host.querySelectorAll('table')) {
        assert.ok(el.getAttribute('aria-label'), `panel ${panel}: a table has no accessible name`);
      }
    }
  });
});

test('every dialog control has a bound label and the rehearsal offers a bound activation', async () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const declared = api.addAutopilotPolicy({ template: 'delay' });
  const ctx = { state: store.state, now: NOW, api, navigate: () => {}, refresh: () => {} };
  await withDom(async () => {
    openAutopilotPolicyDialog(ctx, {});
    const labelled = (el) => el.getAttribute('aria-label')
      || (el.id && document.querySelector(`label[for="${el.id}"]`))
      || el.closest('label');
    const controls = Array.from(document.querySelectorAll('#modal-root input, #modal-root select, #modal-root textarea'));
    assert.ok(controls.length > 10, `the builder exposes its controls (found ${controls.length})`);
    for (const el of controls) assert.ok(labelled(el), `${el.tagName}#${el.id || '(no id)'} has no bound label`);
    document.querySelector('#modal-root').replaceChildren();

    openAutopilotRehearseDialog({ ...ctx, state: store.state }, store.state.autopilotPolicies[0]);
    const text = document.querySelector('#modal-root').textContent;
    assert.match(text, /Approval token [0-9a-f]{16}/, 'the binding token is shown');
    assert.match(text, /Not a historical backtest/, 'the caveat travels with the preview');
    const buttons = Array.from(document.querySelectorAll('#modal-root button')).map((b) => b.textContent);
    assert.ok(buttons.includes('Activate with this rehearsal'), 'a clean rehearsal offers activation');
    void declared; void ownerId;
  });
});

/* -------------------------------------------------------------- 11. CSV */

test('CSV scope #50 carries codes and counts but never a name, threshold or action text', () => {
  const descriptor = CSV_EXPORTS.find((row) => row.key === 'autopilot');
  assert.ok(descriptor);
  assert.match(descriptor.description, /NO agreement names/);
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const policyId = declareAndActivate(api, { template: 'delay' });
  api.addCase(pricedCaseInput(ownerId));
  const exported = exportWorkspaceCsv(store.state, 'autopilot', { now: NOW });
  assert.ok(exported.ok, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, 1);
  assert.ok(parsed.headers.includes('agreement_code'));
  assert.ok(parsed.headers.includes('runs_applied'));
  assert.ok(!parsed.headers.includes('name'));
  const serialized = JSON.stringify(parsed.rows);
  assert.ok(!serialized.includes('Production delay'), 'the agreement name does not leak');
  assert.ok(!serialized.includes('Autopilot Owner'), 'no person name leaks');
  assert.ok(!serialized.includes(policyId), 'no record identifier leaks');
  assert.equal(parsed.rows[0][parsed.headers.indexOf('agreement_code')], 'G01');
  assert.equal(parsed.rows[0][parsed.headers.indexOf('runs_applied')], '1');
});

/* ------------------------------------------------------------ 12. wiring */

test('the rule evaluates first on the shared spine with a declared contract, and is never decline-memoized', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES[0], autopilotRule, 'agreements see the record as the action left it');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === autopilotRule);
  assert.ok(contract, 'the rule declares a contract');
  assert.match(contract.purpose, /RULE-AP-01/);
  assert.deepEqual(contract.writes, ['autopilotPolicies', 'autopilotRuns', 'decisions', 'delegations', 'people', 'premises', 'commsDrafts', 'links']);
  assert.equal(contract.scansWorkspace, false);
  assert.equal(isDeclineMemoizable(autopilotRule), false, 'user-authored verdicts are never collapsed');
});

test('the agreement node is a typed graph node with a system-generated relation', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('autopilot'));
  assert.equal(LINK_ENTITY_COLLECTIONS.autopilot, 'autopilotPolicies');
  assert.ok(LINK_RELATIONS.includes('automates'));
  assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes('automates'));
});

test('a manually asserted automates edge is refused at the action boundary', () => {
  const { api } = makeStore();
  const ownerId = seedOwner(api);
  const created = api.addCase(pricedCaseInput(ownerId));
  const refused = api.linkCaseEntity(created.id, { targetType: 'decision', targetId: 'dec-x', relation: 'automates' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /cannot be asserted manually/);
});

/* ----------------------------------------------------- 13. fail-closed */

test('stored active agreements that cannot prove their activation contract pause on load', () => {
  const warnings = [];
  const policies = normalizeAutopilotPolicies([
    {
      id: 'ap-no-token', name: 'No token', sourceType: 'case', trigger: 'case.created',
      conditions: [], actions: [{ type: 'decision', title: 'T', question: 'Q', dueDays: 7 }],
      maxRuns: 10, version: 1, status: 'active', activatedAt: NOW.toISOString(), rehearsalToken: null,
    },
    {
      id: 'ap-spent', name: 'Spent', sourceType: 'case', trigger: 'case.created',
      conditions: [], actions: [{ type: 'decision', title: 'T', question: 'Q', dueDays: 7 }],
      maxRuns: 10, version: 1, status: 'active', activatedAt: NOW.toISOString(),
      rehearsalToken: '0123456789abcdef', runCount: AUTOPILOT_LIMITS.lifetimeRuns,
    },
  ], { people: [] }, NOW.toISOString(), warnings);
  assert.equal(policies[0].status, 'paused');
  assert.equal(policies[1].status, 'paused');
  assert.ok(warnings.some((w) => /activation contract/.test(w)));
});

test('editing an active agreement voids its approval; the old token cannot reactivate', () => {
  const { store, api } = makeStore();
  seedOwner(api);
  const policyId = declareAndActivate(api, { template: 'delay' });
  const policy = store.state.autopilotPolicies.find((p) => p.id === policyId);
  const oldToken = policy.rehearsalToken;
  const updated = api.updateAutopilotPolicy(policyId, { ...agreementTemplate('delay'), name: 'Renamed agreement' });
  assert.ok(updated.ok, updated.error);
  assert.equal(updated.version, 2);
  const edited = store.state.autopilotPolicies.find((p) => p.id === policyId);
  assert.equal(edited.status, 'draft');
  assert.equal(edited.rehearsalToken, null);
  assert.equal(api.activateAutopilotPolicy(policyId, { token: oldToken }).ok, false, 'the old approval is void');
  const fresh = api.rehearseAutopilotPolicy(policyId).rehearsal;
  assert.ok(api.activateAutopilotPolicy(policyId, { token: fresh.token }).ok, 'a fresh rehearsal reactivates');
});

test('delete is refused once anything executed; retire keeps the ledger and ends the agreement', () => {
  const { store, api } = makeStore();
  const ownerId = seedOwner(api);
  const policyId = declareAndActivate(api, { template: 'delay' });
  assert.equal(api.deleteAutopilotPolicy(policyId).ok, false, 'an active agreement cannot be deleted');
  api.addCase(pricedCaseInput(ownerId));
  assert.equal(store.state.autopilotRuns.length, 1);
  assert.equal(api.pauseAutopilotPolicy(policyId, {}).ok, true);
  assert.equal(api.deleteAutopilotPolicy(policyId).ok, false, 'an executed agreement cannot be deleted');
  assert.match(api.deleteAutopilotPolicy(policyId).error, /Retire it/);
  assert.ok(api.retireAutopilotPolicy(policyId).ok);
  assert.equal(store.state.autopilotPolicies.find((p) => p.id === policyId).status, 'retired');
  assert.equal(store.state.autopilotRuns.length, 1, 'the ledger survives retirement');
  assert.equal(api.rehearseAutopilotPolicy(policyId).ok, false, 'a retired agreement cannot rehearse');
  assert.equal(api.activateAutopilotPolicy(policyId, { token: 'x' }).ok, false);

  const pristine = api.addAutopilotPolicy({ template: 'goal' });
  assert.ok(api.deleteAutopilotPolicy(pristine.id).ok, 'a draft that never fired can be deleted');
  assert.equal(store.state.autopilotPolicies.some((p) => p.id === pristine.id), false);
});

/* -------------------------------------------------------------- 14. demo */

test('the demo carries two valid drafts and the narrow one already matches the billing case', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.autopilotPolicies.length, 2);
  assert.ok(demo.autopilotPolicies.every((p) => p.status === 'draft'), 'the demo never activates on the leader behalf');
  const renormalized = normalizeState(JSON.parse(JSON.stringify(demo)), { now: NOW });
  assert.ok(!renormalized.warnings.some((w) => /Autopilot/.test(w)), `no autopilot warnings: ${renormalized.warnings.join('; ')}`);
  const narrow = demo.autopilotPolicies.find((p) => p.id === 'ap-demo-1');
  const rehearsal = rehearsePolicy(demo, narrow, NOW);
  assert.ok(rehearsal.matched >= 1, 'the billing case matches the narrow policy');
  assert.match(JSON.stringify(rehearsal.rows), /Billing ledger/);
});

/* ------------------------------------------------------------- 15. brief */

test('the brief is deterministic and states the guarantees rather than claiming value', () => {
  const { store, api } = makeStore();
  seedOwner(api);
  declareAndActivate(api, { template: 'delay' });
  const first = autopilotBrief(store.state, NOW);
  assert.equal(first, autopilotBrief(store.state, NOW));
  assert.match(first, /No message is sent/);
  assert.match(first, /not a causal estimate/);
});

test('the activation gate refuses retired agreements and exhausted lifetime budgets', () => {
  const { store, api } = makeStore();
  seedOwner(api);
  const policyId = declareAndActivate(api, { template: 'delay' });
  api.retireAutopilotPolicy(policyId);
  const retired = store.state.autopilotPolicies.find((p) => p.id === policyId);
  assert.equal(activationGate(store.state, retired, 'any-token', NOW).ok, false);
  assert.equal(activationGate(store.state, undefined, 'any-token', NOW).ok, false);
  const spent = { ...store.state.autopilotPolicies[0], status: 'paused', runCount: AUTOPILOT_LIMITS.lifetimeRuns };
  const gate = activationGate({ ...store.state, autopilotPolicies: [spent] }, spent, rehearsePolicy(store.state, spent, NOW).token, NOW);
  assert.equal(gate.ok, false);
  assert.match(gate.error, /lifetime safety budget/);
  void executePolicy; void evaluatePolicy;
});
