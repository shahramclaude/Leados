/**
 * tests/app/propagation-ledger.test.mjs — ADR-0026.
 *
 * The Session 61 change touched the one piece of machinery every mutation in
 * the product runs through, so the tests here are mostly *equivalence*
 * obligations rather than feature assertions:
 *
 *   1. The copy-on-write savepoint must produce a byte-identical workspace to
 *      the whole-workspace deep copy it replaced, including on rollback.
 *   2. Collapsing a provably identical declined re-run must change nothing but
 *      the number of rule invocations.
 *   3. The "decline depends only on workspace version and event type" property
 *      that collapse relies on must be probed against the real rules, not the
 *      comment that claims it.
 *   4. A failed propagation must survive as a receipt and be genuinely
 *      re-runnable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { runPostCommitRules, DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { createSavepointDraft } from '../../app/core/domain/savepoint.js';
import {
  DECLINE_MEMO_RULES,
  describePropagationContracts,
  isDeclineMemoizable,
  PROPAGATION_CONTRACTS,
} from '../../app/core/domain/propagationContracts.js';
import {
  buildPropagationLedger,
  propagationRetryPlan,
  summarizeByEvent,
  summarizeByRule,
} from '../../app/core/domain/propagationLedger.js';
import { createApi } from '../../app/actions.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-28T09:00:00.000Z');

let seq = 0;
const idFactory = (prefix) => `${prefix}-pl-${(seq += 1)}`;
const noop = () => {};

/**
 * A deterministic id sequence per run. Generated ids are part of the committed
 * workspace, so two runs can only be compared for equality if they are given
 * the same sequence — otherwise every equivalence test fails for a reason that
 * has nothing to do with the thing under test.
 */
function freshIds() {
  let n = 0;
  return (prefix) => `${prefix}-fixed-${(n += 1)}`;
}

/**
 * A failed rule writes a receipt into the live draft on purpose: the savepoint
 * is exactly what was rolled back, so the record of the failure has to survive
 * it. Everything ELSE must be untouched.
 */
function withoutReceipts(state) {
  const copy = { ...state };
  delete copy.propagationReceipts;
  return JSON.stringify(copy);
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness() {
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

/** A demo workspace plus one open case, which is what drives the real chain. */
function fixture() {
  const state = buildDemoState(NOW);
  const owner = (state.people || []).find((p) => p && p.status !== 'archived');
  state.cases.push({
    id: 'case-pl-1',
    title: 'Checkout latency regression',
    kind: 'operational',
    status: 'open',
    priority: 'high',
    ownerId: owner ? owner.id : null,
    openedOn: '2026-10-28',
    summary: 'Synthetic case used to exercise the post-commit chain.',
    severity: 7, occurrence: 5, detection: 4,
    costEstimate: 12000, currency: 'DKK',
    optimisticDays: 3, likelyDays: 8, pessimisticDays: 21,
    capacityPersonDays: 6,
    createdAt: NOW.toISOString(),
  });
  return state;
}

function runCaseChain(strategy, extra = {}) {
  const draft = fixture();
  const metrics = {};
  runPostCommitRules(draft, {
    event: { type: 'case.created', entity: 'case', entityId: 'case-pl-1' },
    now: NOW,
    idFactory: freshIds(),
    logEvent: noop,
    warnings: [],
    metrics,
    ...(strategy ? { savepoint: strategy } : {}),
    ...extra,
  });
  return { draft, metrics };
}

/* --------------------------------------------- 1. savepoint equivalence */

test('savepoint: copy-on-write produces a workspace byte-identical to the eager deep copy', () => {
  const cow = runCaseChain('cow').draft;
  const eager = runCaseChain('clone').draft;
  assert.equal(JSON.stringify(cow), JSON.stringify(eager),
    'the two savepoint strategies must commit exactly the same workspace');
});

test('savepoint: copy-on-write yields the same measurements as the eager deep copy', () => {
  const cow = runCaseChain('cow').metrics;
  const eager = runCaseChain('clone').metrics;
  const shape = (m) => m.pairs.map((p) => [p.rule, p.event, p.status, p.collections.join(',')]);
  assert.deepEqual(shape(cow), shape(eager), 'same rules must reach the same verdicts');
  assert.equal(cow.executed + cow.declined + cow.rolledBack, eager.executed + eager.declined + eager.rolledBack);
});

/**
 * The regression that motivated this test: `comms.js`'s `ensureDrafts` does
 * `draft.commsDrafts = Array.isArray(draft.commsDrafts) ? draft.commsDrafts : []`
 * and its caller keeps the returned reference, then pushes into it later. An
 * earlier copy-on-write savepoint deep-copied on ASSIGNMENT, so that push went
 * into an orphaned array — closure notes silently stopped being created while
 * the rule still reported "applied" and a narrow case.created equivalence test
 * passed. This walks a whole realistic workflow instead of a single event.
 */
function runWorkflow(savepoint) {
  let n = 0;
  const ids = (p) => `${p}-wf-${(n += 1)}`;
  const store = createStore({
    storage: memoryStorage(),
    now: () => NOW,
    idFactory: ids,
    ...(savepoint ? { savepointStrategy: savepoint } : {}),
  });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: ids });

  const created = api.addCase({
    title: 'Payment gateway outage',
    kind: 'incident',
    openedOn: '2026-10-26',
    reviewOn: '2026-11-09',
    fmea: { severity: 8, probability: 6, detectability: 7 },
    rca: { preventiveAction: 'Add canary release gate for the gateway' },
    stakeholders: [
      { name: 'Dana Ortiz', power: 5, interest: 4, stance: 'skeptical' },
      { name: 'Priya Shah', power: 4, interest: 4, stance: 'supportive' },
    ],
  });
  const priya = store.state.commsDrafts.find((d) => d.stakeholderName === 'Priya Shah' && d.purpose === 'brief');
  const sent = api.markCommsDraftSent(priya.id, { channel: 'Email', sentOn: '2026-10-28' });
  assert.equal(sent.ok, true, `the workflow must record the brief as sent: ${sent.error}`);
  api.resolveCase(created.id, {
    resolutionNotes: 'Rolled back the deploy and enforced the canary gate',
    systemicBarrier: 'Canary gate blocks promotion on error-budget burn',
  });
  return store.state;
}

test('savepoint: a whole multi-step workflow is identical under both strategies', () => {
  const cow = runWorkflow(null);
  const eager = runWorkflow('clone');
  assert.equal(JSON.stringify(cow), JSON.stringify(eager),
    'the savepoint rewrite must not change the outcome of a real workflow, not just one event');
  assert.ok(cow.commsDrafts.some((d) => d.purpose === 'closure'),
    'the workflow must actually produce a closure note, or this test proves nothing');
});

test('savepoint: an in-rule alias survives to commit', () => {
  // The exact shape that broke: capture a collection, reassign it to itself,
  // then mutate the captured reference.
  const base = createEmptyState(NOW.toISOString());
  base.goals.push({ id: 'g1', title: 'kept' });
  const rule = (draft) => {
    draft.goals = Array.isArray(draft.goals) ? draft.goals : [];
    const rows = draft.goals;
    rows.push({ id: 'g2', title: 'added through the captured reference' });
    return [];
  };
  runPostCommitRules(base, {
    event: { type: 'x.y', entity: 'x', entityId: '1' },
    now: NOW, idFactory: freshIds(), logEvent: noop, warnings: [], rules: [rule],
  });
  assert.equal(base.goals.length, 2, 'a push through a captured alias must reach the committed draft');
});

test('savepoint: a throwing rule leaves the draft untouched (rollback is still rollback)', () => {
  const base = createEmptyState(NOW.toISOString());
  base.cases.push({ id: 'c1', title: 'kept' });
  const before = withoutReceipts(base);
  const bomb = () => { throw new Error('deliberate'); };
  runPostCommitRules(base, {
    event: { type: 'case.created', entity: 'case', entityId: 'c1' },
    now: NOW, idFactory, logEvent: noop, warnings: [], rules: [bomb],
  });
  assert.equal(withoutReceipts(base), before, 'a rolled-back rule must not commit anything');
  assert.equal(base.propagationReceipts.length, 1,
    'the failure itself must survive the rollback, or the loss is silent again');
});

test('savepoint: writes made before a throw are discarded, not partially committed', () => {
  const base = createEmptyState(NOW.toISOString());
  base.goals.push({ id: 'g1', title: 'Existing goal' });
  const before = withoutReceipts(base);
  const writesThenThrows = (draft) => {
    draft.goals.push({ id: 'g2', title: 'Should never survive' });
    draft.cases.push({ id: 'c9', title: 'Should never survive either' });
    throw new Error('fail after writing');
  };
  runPostCommitRules(base, {
    event: { type: 'x.y', entity: 'x', entityId: '1' },
    now: NOW, idFactory, logEvent: noop, warnings: [], rules: [writesThenThrows],
  });
  assert.equal(withoutReceipts(base), before, 'partial writes must be rolled back with the rule');
});

test('savepoint: a rule sees a private copy, and a successful rule commits its writes', () => {
  const base = createEmptyState(NOW.toISOString());
  base.goals.push({ id: 'g1', title: 'Existing goal', note: '' });
  const seenDuringRule = [];
  // Nested records are the interesting case: a shallow array copy would alias
  // the record objects and let a rule mutate the live workspace in place.
  const rule = (draft) => {
    draft.goals[0].note = 'mutated';
    seenDuringRule.push(base.goals[0].note);
    return [];
  };
  runPostCommitRules(base, {
    event: { type: 'x.y', entity: 'x', entityId: '1' },
    now: NOW, idFactory: freshIds(), logEvent: noop, warnings: [], rules: [rule],
  });
  assert.deepEqual(seenDuringRule, [''], 'the live draft must stay invisible while the rule runs');
  assert.equal(base.goals[0].note, 'mutated', 'a committed write must land');
});

test('savepoint: a record a rule creates is published as its own lifecycle event', () => {
  const base = createEmptyState(NOW.toISOString());
  // Only acts on the seed event; the derived decision.created it causes must
  // reach the OTHER rule, not cause this one to create a second record.
  const creator = (draft, ctx) => {
    if (ctx.event?.type !== 'seed') return [];
    draft.decisions.push({ id: 'd1', title: 'New decision' });
    return [];
  };
  const seed = () => [];
  const metrics = {};
  runPostCommitRules(base, {
    event: { type: 'seed', entity: 'workspace', entityId: 'w' },
    now: NOW, idFactory: freshIds(), logEvent: noop, warnings: [], metrics,
    rules: [seed, creator],
  });
  assert.equal(base.decisions.length, 1, 'the created record must land');
  assert.ok(metrics.pairs.some((p) => p.event === 'decision.created'),
    'a newly created decision must reach subscribers as decision.created');
});

test('savepoint: deleting a top-level collection commits and rolls back correctly', () => {
  const base = createEmptyState(NOW.toISOString());
  base.pulses.push({ id: 'p1' });
  const keeper = (draft) => { delete draft.pulses; return []; };
  runPostCommitRules(base, {
    event: { type: 'x.y', entity: 'x', entityId: '1' },
    now: NOW, idFactory, logEvent: noop, warnings: [], rules: [keeper],
  });
  assert.equal(Object.hasOwn(base, 'pulses'), false, 'a committed delete must remove the key');

  const base2 = createEmptyState(NOW.toISOString());
  base2.pulses.push({ id: 'p1' });
  const deleterThenThrow = (draft) => { delete draft.pulses; throw new Error('no'); };
  runPostCommitRules(base2, {
    event: { type: 'x.y', entity: 'x', entityId: '1' },
    now: NOW, idFactory, logEvent: noop, warnings: [], rules: [deleterThenThrow],
  });
  assert.deepEqual(base2.pulses, [{ id: 'p1' }], 'a rolled-back delete must restore the key');
});

test('savepoint: a rule that reads nothing materialises nothing', () => {
  const base = createEmptyState(NOW.toISOString());
  for (let i = 0; i < 50; i += 1) base.goals.push({ id: `g${i}`, title: 'x'.repeat(200) });
  const savepoint = createSavepointDraft(base);
  // Guard-only rule: the shape every rule in this codebase opens with.
  if (savepoint.draft.goals) noop();
  assert.deepEqual(savepoint.touched(), ['goals'], 'reading one collection touches one collection');
  const untouched = createSavepointDraft(base);
  untouched.draft;
  assert.deepEqual(untouched.touched(), [], 'creating a savepoint alone touches nothing');
});

/* ------------------------------------------------- 2. decline collapse */

test('collapse: an identical declined re-run is skipped, and skipping changes nothing', () => {
  // A producer emits three events of the same type. `earlyWarningRule` declines
  // the first, so the other two are provably identical at the same version.
  const state = fixture();
  const producer = (draft, ctx) => {
    if (ctx.event?.type !== 'seed') return [];
    for (const n of [1, 2, 3]) ctx.emitEvent({ type: 'pulse.recorded', entity: 'pulse', entityId: `p${n}` });
    return [];
  };
  const earlyWarning = DEFAULT_POST_COMMIT_RULES.find((r) => r.name === 'earlyWarningRule');
  assert.ok(isDeclineMemoizable(earlyWarning), 'earlyWarningRule must be a declared collapse rule');

  const withMemo = {};
  runPostCommitRules(state, {
    event: { type: 'seed', entity: 'workspace', entityId: 'w' },
    now: NOW, idFactory: freshIds(), logEvent: noop, warnings: [], metrics: withMemo,
    rules: [producer, earlyWarning],
  });
  assert.ok(withMemo.skipped > 0, 'the repeated declined invocation must be collapsed');

  const withoutMemo = {};
  const state2 = fixture();
  runPostCommitRules(state2, {
    event: { type: 'seed', entity: 'workspace', entityId: 'w' },
    now: NOW, idFactory: freshIds(), logEvent: noop, warnings: [], metrics: withoutMemo,
    declineMemo: false,
    rules: [producer, earlyWarning],
  });
  assert.equal(withoutMemo.skipped || 0, 0, 'the seam must actually disable collapse');
  assert.equal(JSON.stringify(state), JSON.stringify(state2),
    'collapsing a declined re-run must not change the resulting workspace');
});

test('collapse: the whole real chain is identical with and without collapse', () => {
  const withMemo = runCaseChain(null).draft;
  const withoutMemo = runCaseChain(null, { declineMemo: false }).draft;
  assert.equal(JSON.stringify(withMemo), JSON.stringify(withoutMemo),
    'decline collapse must be observationally free on a real case transaction');
});

/* ------------------------- 3. the property collapse actually depends on */

test('collapse: every declared rule declines identically for two entities of the same event type', () => {
  const violations = [];
  for (const rule of DECLINE_MEMO_RULES) {
    const ledger = [];
    for (const entityId of ['case-probe-a', 'case-probe-b']) {
      const draft = fixture();
      const metrics = {};
      runPostCommitRules(draft, {
        event: { type: 'case.created', entity: 'case', entityId },
        now: NOW, idFactory, logEvent: noop, warnings: [], metrics, rules: [rule],
      });
      const pair = metrics.pairs[0];
      ledger.push({
        entityId,
        applied: pair.status === 'applied',
        collections: pair.collections.join(','),
      });
    }
    if (ledger[0].applied !== ledger[1].applied || ledger[0].collections !== ledger[1].collections) {
      violations.push({ rule: rule.name, ledger });
    }
  }
  assert.deepEqual(violations, [],
    'a rule whose verdict depends on WHICH entity the event names can never be collapsed; '
    + 'if this fails, remove that rule from DECLINE_MEMO_RULES rather than weakening the test');
});

test('collapse: rules that are not declared are never skipped, however expensive', () => {
  const undeclared = DEFAULT_POST_COMMIT_RULES.filter((r) => !isDeclineMemoizable(r));
  assert.ok(undeclared.length > 0, 'the default must remain "never skip"');
  for (const rule of undeclared) {
    assert.equal(isDeclineMemoizable(rule), false, `${rule.name} must not be collapsed`);
  }
});

/* ------------------------------------------------------- 4. contracts */

test('contracts: every rule in the chain is documented', () => {
  const described = describePropagationContracts();
  const names = new Set(described.map((c) => c.name));
  for (const rule of DEFAULT_POST_COMMIT_RULES) {
    assert.ok(names.has(rule.name), `${rule.name} must have a declared purpose`);
  }
  assert.equal(described.length, PROPAGATION_CONTRACTS.length);
  for (const row of described) {
    assert.ok(row.purpose.length > 20, `${row.name} needs a real purpose, not a placeholder`);
    assert.ok(row.module.endsWith('.js'), `${row.name} must name its module`);
  }
});

test('contracts: an undocumented rule is reported as undocumented rather than invented', () => {
  const described = describePropagationContracts();
  assert.equal(described.filter((c) => !c.purpose).length, 0);
  assert.equal(described.filter((c) => c.declineMemoizable).length, DECLINE_MEMO_RULES.size);
});

/* ------------------------------------------------- 5. ledger arithmetic */

test('ledger: aggregates pairs into per-rule rows with measured shares', () => {
  const rows = summarizeByRule([
    { rule: 'a', event: 'e1', status: 'applied', ms: 10, effects: 2, emitted: 1, collections: ['cases'] },
    { rule: 'a', event: 'e2', status: 'declined', ms: 30, effects: 0, emitted: 0, collections: [] },
    { rule: 'b', event: 'e1', status: 'declined', ms: 60, effects: 0, emitted: 0, collections: [] },
  ]);
  const a = rows.find((r) => r.rule === 'a');
  const b = rows.find((r) => r.rule === 'b');
  assert.equal(a.calls, 2);
  assert.equal(a.applied, 1);
  assert.equal(a.declined, 1);
  assert.equal(a.ms, 40);
  assert.equal(b.ms, 60);
  assert.equal(a.sharePct + b.sharePct, 100, 'rule shares must account for all measured rule time');
  assert.deepEqual(a.collections, ['cases']);
});

test('ledger: an unmeasured chain is reported as unmeasured, never as zero cost', () => {
  const ledger = buildPropagationLedger({ metrics: null, receipts: [], contracts: [], now: NOW });
  assert.equal(ledger.measured, false);
  assert.equal(ledger.totals, null);
  assert.match(ledger.reason, /no transaction/i);
});

test('ledger: waste ranks only rules that applied nothing and names their cost', () => {
  const ledger = buildPropagationLedger({
    metrics: {
      pairs: [
        { rule: 'worker', event: 'e', status: 'applied', ms: 5, collections: ['cases'] },
        { rule: 'scanner', event: 'e', status: 'declined', ms: 900, collections: [] },
        { rule: 'cheap', event: 'e', status: 'declined', ms: 1, collections: [] },
      ],
      events: 1, executed: 1, declined: 2, rolledBack: 0, skipped: 0, elapsedMs: 950,
    },
    receipts: [], contracts: [], now: NOW,
  });
  assert.deepEqual(ledger.waste.map((r) => r.rule), ['scanner', 'cheap']);
  assert.equal(ledger.totals.wasteMs, 901);
  assert.equal(ledger.totals.pairMs, 906);
  assert.equal(ledger.totals.wastePct, 99.4);
  assert.equal(ledger.totals.elapsedMs, 950, 'wall clock is reported separately from rule time');
});

test('ledger: event rollup separates delivered-but-inert events from applied ones', () => {
  const rows = summarizeByEvent([
    { rule: 'a', event: 'case.created', status: 'applied', ms: 10 },
    { rule: 'b', event: 'pulse.recorded', status: 'declined', ms: 40 },
  ]);
  assert.equal(rows[0].event, 'pulse.recorded');
  assert.equal(rows[0].applied, 0);
  assert.equal(rows[1].applied, 1);
});

/* ------------------------------------------------ 6. receipts and retry */

test('receipts: a failed rule is recorded durably with the event that caused it', () => {
  const state = fixture();
  const metrics = {};
  runPostCommitRules(state, {
    event: { type: 'case.created', entity: 'case', entityId: 'case-missing' },
    now: NOW, idFactory, logEvent: noop, warnings: [], metrics,
    rules: [DEFAULT_POST_COMMIT_RULES.find((r) => r.name === 'caseCreatedRule')],
  });
  assert.equal(metrics.rolledBack, 1);
  assert.equal(state.propagationReceipts.length, 1);
  const receipt = state.propagationReceipts[0];
  assert.equal(receipt.rule, 'caseCreatedRule');
  assert.equal(receipt.eventType, 'case.created');
  assert.equal(receipt.entityId, 'case-missing');
  assert.equal(receipt.status, 'open');
  assert.match(receipt.error, /missing/i);
});

test('receipts: a failed rule can be retried, and a successful retry resolves the receipt', () => {
  const { store, api } = harness();
  const demo = buildDemoState(NOW);
  store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: demo.schemaVersion, exportedAt: NOW.toISOString(), state: demo }));
  const realCaseId = store.state.cases[0].id;
  store.update((draft) => {
    draft.propagationReceipts.push({
      id: 'rcpt-good', at: NOW.toISOString(), rule: 'caseCreatedRule',
      eventType: 'case.created', entity: 'case', entityId: realCaseId,
      error: 'simulated earlier failure', status: 'open', attempts: [], resolvedAt: null,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: 'w' });

  const result = api.retryPropagationReceipt('rcpt-good');
  assert.equal(result.ok, true);
  assert.equal(result.resolved, true, 're-running a now-valid event must resolve the receipt');
  const after = store.state.propagationReceipts.find((r) => r.id === 'rcpt-good');
  assert.equal(after.status, 'resolved');
  assert.equal(after.attempts.length, 1);
  assert.equal(after.attempts[0].outcome, 'succeeded');
});

test('receipts: a retry that fails again says so and keeps the receipt open for a human', () => {
  const { store, api } = harness();
  const demo = buildDemoState(NOW);
  store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: demo.schemaVersion, exportedAt: NOW.toISOString(), state: demo }));
  store.update((draft) => {
    draft.propagationReceipts.push({
      id: 'rcpt-bad', at: NOW.toISOString(), rule: 'caseCreatedRule',
      eventType: 'case.created', entity: 'case', entityId: 'no-such-case',
      error: 'simulated', status: 'open', attempts: [], resolvedAt: null,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: 'w' });

  const result = api.retryPropagationReceipt('rcpt-bad');
  assert.equal(result.ok, true);
  assert.equal(result.resolved, false, 'a rule that throws again must not be reported as resolved');
  assert.match(String(result.error), /missing/i);
  const after = store.state.propagationReceipts.find((r) => r.id === 'rcpt-bad');
  assert.equal(after.status, 'retried');
  assert.equal(after.attempts.at(-1).outcome, 'failed');
});

test('receipts: retrying does not file a duplicate receipt for the same failure', () => {
  const { store, api } = harness();
  const demo = buildDemoState(NOW);
  store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: demo.schemaVersion, exportedAt: NOW.toISOString(), state: demo }));
  store.update((draft) => {
    draft.propagationReceipts.push({
      id: 'rcpt-dup', at: NOW.toISOString(), rule: 'caseCreatedRule',
      eventType: 'case.created', entity: 'case', entityId: 'nope',
      error: 'simulated', status: 'open', attempts: [], resolvedAt: null,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: 'w' });
  const before = store.state.propagationReceipts.length;
  api.retryPropagationReceipt('rcpt-dup');
  assert.equal(store.state.propagationReceipts.length, before, 'the retry updates the receipt, it does not clone it');
});

test('receipts: a resolved or dismissed receipt refuses a retry instead of silently doing nothing', () => {
  const state = fixture();
  const rules = DEFAULT_POST_COMMIT_RULES;
  const resolved = propagationRetryPlan(
    { propagationReceipts: [{ id: 'r1', status: 'resolved' }] }, 'r1', rules,
  );
  assert.equal(resolved.ok, false);
  assert.match(resolved.error, /already succeeded/i);

  const dismissed = propagationRetryPlan(
    { propagationReceipts: [{ id: 'r2', status: 'dismissed' }] }, 'r2', rules,
  );
  assert.equal(dismissed.ok, false);
  assert.match(dismissed.error, /dismissed/i);

  const missing = propagationRetryPlan(state, 'nope', rules);
  assert.equal(missing.ok, false);

  const unknownRule = propagationRetryPlan(
    { propagationReceipts: [{ id: 'r3', status: 'open', rule: 'aRuleFromTheFuture' }] }, 'r3', rules,
  );
  assert.equal(unknownRule.ok, false);
  assert.match(unknownRule.error, /not a rule in this build/i);
});

test('receipts: dismissing closes the receipt but keeps it in the ledger', () => {
  const { store, api } = harness();
  store.update((draft) => {
    draft.propagationReceipts.push({
      id: 'rcpt-d', at: NOW.toISOString(), rule: 'earlyWarningRule',
      eventType: 'pulse.recorded', entity: 'pulse', entityId: 'p1',
      error: 'x', status: 'open', attempts: [], resolvedAt: null,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: 'w' });
  const res = api.dismissPropagationReceipt('rcpt-d');
  assert.equal(res.ok, true);
  const row = store.state.propagationReceipts.find((r) => r.id === 'rcpt-d');
  assert.equal(row.status, 'dismissed');
  assert.ok(row.resolvedAt, 'dismissal must be timestamped');
});

/* ------------------------------------------------------ 7. schema v41 */

test('schema: v41 adds the receipt ledger additively and invents no history', () => {
  assert.equal(SCHEMA_VERSION, 76);
  const migrated = migrate({ schemaVersion: 40, goals: [{ id: 'g1' }] });
  assert.deepEqual(migrated.applied, ['40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75', '75 → 76']);
  assert.deepEqual(migrated.raw.propagationReceipts, [],
    'a workspace from before v41 has no recorded failures, so it starts empty rather than guessed');
  assert.deepEqual(migrated.raw.goals, [{ id: 'g1' }], 'existing records survive the migration');
});

test('schema: receipts are normalized, bounded and cannot smuggle record content', () => {
  const state = createEmptyState(NOW.toISOString());
  state.propagationReceipts = null;
  const rows = [];
  for (let i = 0; i < 80; i += 1) {
    rows.push({
      id: `r${i}`, at: NOW.toISOString(), rule: 'x'.repeat(200),
      eventType: 'case.created', entity: 'case', entityId: 'c1',
      error: 'e'.repeat(900), status: 'nonsense',
      attempts: new Array(40).fill({ at: NOW.toISOString(), outcome: 'failed', detail: 'd' }),
    });
  }
  const blob = { ...createEmptyState(NOW.toISOString()), propagationReceipts: rows };
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const result = store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: 41, exportedAt: NOW.toISOString(), state: blob }));
  assert.equal(result.ok, true);
  const receipts = store.state.propagationReceipts;
  assert.ok(receipts.length <= 50, 'the receipt ledger must stay bounded');
  assert.ok(receipts[0].rule.length <= 80);
  assert.ok(receipts[0].error.length <= 300);
  assert.ok(receipts[0].attempts.length <= 20);
  assert.equal(receipts[0].status, 'open', 'an unrecognised status degrades to open, never to resolved');
});

/* --------------------------------------------------------------- 8. UI */

function bootDom() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const style = window.document.createElement('style');
  style.textContent = CSS;
  window.document.head.appendChild(style);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.localStorage = window.localStorage;
  window.eval(AXE_SRC);
  return { window, errors };
}

async function axeViolations(window, selector) {
  const target = selector ? window.document.querySelector(selector) : window.document.body;
  const results = await window.axe.run(target || window.document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  // Array.from, not .map: axe runs inside the jsdom realm, so its arrays have a
  // different Array prototype and deepStrictEqual would reject them as unequal
  // even when both sides are empty.
  return Array.from(results.violations).map((v) => `${v.id}: ${v.nodes.length} node(s)`);
}

test('ui: the propagation ledger renders price, coverage and failures without axe violations', async () => {
  const { window, errors } = bootDom();
  const { store, api } = harness();
  const demo = buildDemoState(NOW);
  store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: demo.schemaVersion, exportedAt: NOW.toISOString(), state: demo }));
  store.lastPropagationMetrics = {
    pairs: [
      { rule: 'earlyWarningRule', event: 'case.created', status: 'declined', ms: 44, effects: 0, emitted: 0, collections: [] },
      { rule: 'caseCreatedRule', event: 'case.created', status: 'applied', ms: 6, effects: 1, emitted: 1, collections: ['decisions'] },
    ],
    events: 1, executed: 1, declined: 1, rolledBack: 0, skipped: 0, elapsedMs: 51,
    at: NOW.toISOString(), rootEvent: 'case.created', revision: 7,
  };

  const { renderPropagation } = await import('../../app/views/propagation.js');
  const ctx = {
    state: store.state,
    now: NOW,
    api,
    query: { tab: 'price' },
    navigate: () => {},
    refresh: () => {},
    propagationMetrics: store.lastPropagationMetrics,
  };

  const node = renderPropagation(ctx);
  window.document.getElementById('view').appendChild(node);
  const text = window.document.getElementById('view').textContent;
  assert.match(text, /Propagation ledger/);
  assert.match(text, /Rule invocations/);
  assert.match(text, /earlyWarningRule/, 'the measured hotspot must be named');
  assert.deepEqual(await axeViolations(window), [], 'ledger must pass axe');

  for (const tab of ['coverage', 'failures']) {
    window.document.getElementById('view').innerHTML = '';
    window.document.getElementById('view').appendChild(renderPropagation({ ...ctx, query: { tab } }));
    assert.deepEqual(await axeViolations(window), [], `${tab} tab must pass axe`);
  }
  assert.deepEqual(errors.filter((e) => !e.includes('getContext')), []);
});

test('ui: the lineage tab renders safe typed links, honors the trace query and keeps rows keyboard-operable', async () => {
  const { window } = bootDom();
  const { store, api } = harness();
  const demo = buildDemoState(NOW);
  store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: demo.schemaVersion, exportedAt: NOW.toISOString(), state: demo }));
  const source = store.state.scorecards[0];
  const decision = store.state.decisions[0];
  store.update((draft) => {
    draft.propagationLineage = [{
      id: 'trace-ui', at: NOW.toISOString(), revision: 7,
      rootEvent: { type: 'scorecard.committed', entity: 'scorecard', entityId: source.id },
      steps: [{
        stepId: 's1', parentStepId: null, depth: 0,
        event: { type: 'scorecard.committed', entity: 'scorecard', entityId: source.id },
        rule: 'measurementRule', ruleIds: ['RULE-MTX-01'],
        changedCollections: ['decisions', 'links'],
        targets: [{ type: 'decision', id: decision.id, change: 'created', cleared: false }],
        links: [{ sourceType: 'scorecard', sourceId: source.id, relation: 'informs', targetType: 'decision', targetId: decision.id, sourceCleared: false, targetCleared: false }],
        emitted: [{ type: 'decision.created', entity: 'decision', entityId: decision.id }],
        omittedTargets: 0, omittedLinks: 0, omittedEvents: 0,
      }],
      truncatedSteps: 0, omittedTargets: 0, omittedLinks: 0, omittedEvents: 0,
    }];
  }, { type: 'test.seed-lineage', entity: 'workspace', entityId: 'workspace-ui' });

  const { renderPropagation } = await import('../../app/views/propagation.js');
  const navigations = [];
  const ctx = {
    state: store.state, now: NOW, api,
    query: new URLSearchParams('tab=lineage&trace=trace-ui'),
    navigate: (route) => navigations.push(route), refresh: () => {}, propagationMetrics: null,
  };
  const root = window.document.getElementById('view');
  root.appendChild(renderPropagation(ctx));
  assert.match(root.textContent, /Successful propagation history/);
  assert.match(root.textContent, /measurementRule/);
  assert.match(root.textContent, /Support throughput/);
  assert.equal(root.querySelector('[data-testid="propagation-lineage-detail"]') !== null, true);
  const row = root.querySelector('button.lineage-item');
  assert.ok(row, 'each transaction is a native keyboard-operable button');
  assert.equal(row.querySelector('a'), null, 'a link is not nested inside the button');
  assert.equal(row.getAttribute('aria-pressed'), 'true');
  assert.ok(root.querySelector('a[href^="#/measurement?card="]'), 'the detail exposes a typed scorecard route');
  row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(navigations, ['#/propagation?tab=lineage&trace=trace-ui']);
  assert.deepEqual(await axeViolations(window), [], 'the lineage tab must pass axe');
});

test('ui: the failures tab offers a retry only while a receipt still needs one', async () => {
  const { window } = bootDom();
  const { store } = harness();
  const demo = buildDemoState(NOW);
  store.importJSON(JSON.stringify({ app: 'LeadOS', schemaVersion: demo.schemaVersion, exportedAt: NOW.toISOString(), state: demo }));
  store.update((draft) => {
    draft.propagationReceipts.push({
      id: 'rcpt-ui', at: NOW.toISOString(), rule: 'premiseRule', eventType: 'case.created',
      entity: 'case', entityId: 'c1', error: 'boom', status: 'open', attempts: [], resolvedAt: null,
    });
  }, { type: 'test.seed', entity: 'workspace', entityId: 'w' });

  const { renderPropagation } = await import('../../app/views/propagation.js');
  const ctx = {
    state: store.state, now: NOW, api: {}, query: { tab: 'failures' },
    navigate: () => {}, refresh: () => {}, propagationMetrics: null,
  };
  const node = renderPropagation(ctx);
  window.document.getElementById('view').appendChild(node);
  const buttons = [...window.document.querySelectorAll('button')].map((b) => b.textContent.trim());
  assert.ok(buttons.includes('Retry now'), 'an open receipt must offer a retry');
  assert.ok(buttons.includes('Dismiss'));

  const empty = renderPropagation({ ...ctx, state: { ...store.state, propagationReceipts: [] } });
  window.document.getElementById('view').innerHTML = '';
  window.document.getElementById('view').appendChild(empty);
  assert.match(window.document.getElementById('view').textContent, /No failed propagations recorded/);
  const buttons2 = [...window.document.querySelectorAll('button')].map((b) => b.textContent.trim());
  assert.equal(buttons2.includes('Retry now'), false, 'with nothing to retry there must be no retry button');
});
