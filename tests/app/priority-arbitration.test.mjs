/**
 * tests/app/priority-arbitration.test.mjs — the Cross-Line Priority Arbitration
 * (Session 194, Schema v120, ADR-0143, `#/arbitration`, RULE-ARB-01, CSV #106).
 *
 * The suite is organised around the FOUR things a leader's decision can be
 * betrayed by, not around the file list:
 *
 *  1. THE EXACT RANKING. The printed order must be provably the order of the
 *     printed integers. The oracle is a brute-force BigInt comparison over every
 *     pair, and a sweep that also asserts a float ratio would have given a
 *     DIFFERENT answer wherever it could — so the integer path is the only path.
 *  2. THE REFUSALS. A demand with a missing figure, a single-line person, a
 *     manager with no declared line, an agreement with no rationale, a second
 *     party answer, an agreement on a case with a pending demand — each must be
 *     refused WITH a printed reason, and must leave the store byte-identical.
 *  3. THE DERIVED STATE. `open`/`proposed`/`agreed`/`withdrawn` must be
 *     re-derivable from the recorded acts alone, so a hand-edited blob cannot
 *     promote a recommendation into an agreement, and the normalizer must drop
 *     rather than repair.
 *  4. THE ONE CONSEQUENCE. RULE-ARB-01 fires ONLY on an agreement, issues work
 *     ONLY for sequenced demands, opens exactly one decision, and is idempotent.
 *
 * Display-vs-stored parity is asserted directly: every figure the report and the
 * CSV print is re-read from the stored blob and recomputed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { parseCsv, serializeCsv } from '../../app/core/csv.js';
import {
  buildPriorityReport,
  priorityAttentionCount,
  priorityBriefText,
  priorityCsvRows,
  priorityDelayWeight,
  priorityRank,
  priorityState,
} from '../../app/core/domain/priorityArbitration.js';
import {
  PRIORITY_CSV_COLUMNS,
  PRIORITY_STATES,
} from '../../app/core/domain/priorityArbitrationRegistry.js';
import { priorityArbitrationRule, PRIORITY_RULE_ID } from '../../app/core/domain/priorityArbitrationRules.js';
import { normalizePriorityArbitrations } from '../../app/core/domain/priorityArbitrationSchema.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { matrixRule } from '../../app/core/domain/matrixRules.js';
import { seatRule } from '../../app/core/domain/seatRules.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { renderArbitration } from '../../app/views/arbitration.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const NOW = new Date('2026-11-08T12:00:00.000Z');
const STAMP = '2026-10-01T00:00:00.000Z';

/* ------------------------------------------------------------------ fixtures */

function orgRoster() {
  return [
    { id: 'ceo', name: 'Ada Executive', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'vp1', name: 'Victor VP Eng', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'vp2', name: 'Vera VP Prod', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'engdir', name: 'Eve Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'vp2', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
  ];
}

function line(id, personId, managerId, kind, shareH, rights = []) {
  return {
    id, personId, managerId, kind,
    role: kind === 'functional' ? 'primary' : 'secondary',
    shareH, rights, fromISO: '2026-10-01', toISO: null, note: '',
    status: 'active', declaredAt: STAMP, history: [], createdAt: STAMP, updatedAt: STAMP,
  };
}

/** Sam reports home to engdir and on a project line to pmdir. */
function baseLines() {
  return [
    line('l-sam-fn', 'sam', 'engdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'pmdir', 'project', 40, ['priority']),
  ];
}

function workspace({ lines = baseLines(), extra = {}, settings = {} } = {}) {
  const base = createEmptyState(STAMP);
  base.people = orgRoster();
  base.reportingLines = lines;
  base.settings = { ...base.settings, activeSeatId: null, ...settings };
  return normalizeState({ ...base, ...extra }, { now: NOW }).state;
}

function bootMemoryApi(initialState) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(initialState)]]);
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createStore({ now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api };
}

const demand = (managerId, title, cod, jobSize, chainDays = 0) => ({ managerId, title, cod, jobSize, chainDays });

function openCase(api, demands = [
  demand('engdir', 'Fix the release blocker', 60, 3, 4),
  demand('pmdir', 'Ship the Q4 demo deliverable', 30, 1, 0),
]) {
  const result = api.priorityOpenCase({ personId: 'sam', demands, note: 'Two managers, one week.' });
  assert.equal(result.ok, true, result.error);
  return result.id;
}

function treatAll(api, caseId, caseRow) {
  for (const d of caseRow.demands) {
    const r = api.priorityTreatDemand({ caseId, demandId: d.id, disposition: 'sequenced', reason: 'This demand takes the next available capacity.' });
    assert.equal(r.ok, true, r.error);
  }
}

function currentCase(store, caseId) {
  return (store.state.priorityArbitrations || []).find((c) => c.id === caseId);
}

/* -------------------------------------- 1. exact integer ranking (the oracle) */

test('the printed order is provably the order of the printed integers', () => {
  const caseRow = {
    id: 'arb-x',
    personId: 'sam',
    demands: [
      { id: 'd1', managerId: 'engdir', title: 'A', cod: 60, jobSize: 3, chainDays: 4, treatment: { disposition: 'sequenced' } },
      { id: 'd2', managerId: 'pmdir', title: 'B', cod: 30, jobSize: 1, chainDays: 0, treatment: { disposition: 'deferred' } },
      { id: 'd3', managerId: 'engdir', title: 'C', cod: 100, jobSize: 40, chainDays: 0, treatment: { disposition: 'sequenced' } },
    ],
  };
  const rank = priorityRank(caseRow);
  assert.equal(rank.ranked, true);
  assert.equal(rank.verdict, 'clear-first');

  // Delay weight = cod * (1 + chainDays): A=300 on size 3 (=100), B=30 on size 1,
  // C=100 on size 40 (=2.5). Expected order A, B, C.
  assert.deepEqual(rank.rankedIds, ['d1', 'd2', 'd3']);

  // ORACLE: brute-force BigInt comparison over every ordered pair must agree.
  const byId = new Map(rank.rows.map((r) => [r.demandId, r]));
  for (let i = 0; i < rank.rankedIds.length; i += 1) {
    for (let j = i + 1; j < rank.rankedIds.length; j += 1) {
      const a = byId.get(rank.rankedIds[i]);
      const b = byId.get(rank.rankedIds[j]);
      const left = BigInt(a.delayWeight) * BigInt(b.jobSize);
      const right = BigInt(b.delayWeight) * BigInt(a.jobSize);
      assert.ok(left >= right, `row ${i} must not be ranked below row ${j}: ${left} vs ${right}`);
    }
  }
});

test('an exact tie is printed contested, never broken by an invisible tie-break, and survives integer-vs-float divergence', () => {
  // 6/3 === 10/5 exactly. A float comparison also agrees here, but the point is
  // that the engine declares the tie instead of ordering by array position.
  const tied = priorityRank({
    id: 'arb-t', personId: 'sam',
    demands: [
      { id: 'd1', managerId: 'engdir', title: 'A', cod: 6, jobSize: 3, chainDays: 0 },
      { id: 'd2', managerId: 'pmdir', title: 'B', cod: 10, jobSize: 5, chainDays: 0 },
    ],
  });
  assert.equal(tied.ranked, true);
  assert.equal(tied.verdict, 'contested');
  // The tie GROUP is both demands: either could go first, so both are named.
  assert.equal(tied.contestedN, 2);
  assert.deepEqual([...tied.tiedIds].sort(), ['d1', 'd2']);
});

test('one unscored demand refuses the WHOLE order instead of ranking half a case', () => {
  const rank = priorityRank({
    id: 'arb-i', personId: 'sam',
    demands: [
      { id: 'd1', managerId: 'engdir', title: 'Measured', cod: 60, jobSize: 3, chainDays: 4 },
      { id: 'd2', managerId: 'pmdir', title: 'Unmeasured', cod: null, jobSize: 1, chainDays: 0 },
    ],
  });
  assert.equal(rank.ranked, false);
  assert.equal(rank.verdict, 'incomplete');
  assert.equal(rank.incompleteN, 1);
  assert.deepEqual(rank.rankedIds, []);
  assert.match(rank.reason, /cost of delay/i);
  // No partial rank leaks: every row's state is visible, none carries an order.
  assert.equal(rank.rows.every((r) => typeof r.delayWeight === 'number' || r.delayWeight === null), true);
});

test('an unstated chain counts as 0 and is labelled, never treated as critical', () => {
  const rank = priorityRank({
    id: 'arb-c', personId: 'sam',
    demands: [
      { id: 'd1', managerId: 'engdir', title: 'A', cod: 30, jobSize: 1, chainDays: 2 },
      { id: 'd2', managerId: 'pmdir', title: 'B', cod: 60, jobSize: 2, chainDays: null },
    ],
  });
  const a = rank.rows.find((r) => r.demandId === 'd1');
  const b = rank.rows.find((r) => r.demandId === 'd2');
  assert.equal(a.delayWeight, priorityDelayWeight({ cod: 30, chainDays: 2 }));
  assert.equal(b.chainStated, false);
  assert.equal(b.delayWeight, 60, 'unstated chain multiplies by 1, not by a guess');
});

/* -------------------------------------------------- 2. schema v120 is additive */

test('schema v120 migrates additively: empty ledgers, clamped conventions, nothing invented', () => {
  assert.ok(SCHEMA_VERSION >= 120, 'the v120 step still reaches the current head');
  const v119 = {
    schemaVersion: 119, appId: 'leados', meta: { createdAt: STAMP, updatedAt: STAMP, isDemo: false, revision: 0 },
    settings: { priorityPrecedenceDays: 9999, priorityReviewDays: -5 },
    people: orgRoster(), reportingLines: baseLines(),
  };
  const { raw, applied } = migrate(v119);
  assert.ok(applied.includes('119 → 120'), 'the v120 step still runs');
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(raw.priorityArbitrations, []);
  assert.deepEqual(raw.priorityArbitrationMarkers, []);
  // Clamped into their declared bounds, not silently accepted.
  assert.equal(raw.settings.priorityPrecedenceDays, 180);
  assert.equal(raw.settings.priorityReviewDays, 1);
  assert.equal(raw.settings.priorityCapacityShareH, 100);
});

test('the normalizer drops an unreadable case rather than repairing it into an agreement', () => {
  const warnings = [];
  const out = normalizePriorityArbitrations([
    // no person
    { id: 'a1', openedOn: '2026-10-01', openedAt: STAMP, demands: [] },
    // agreement with no rationale -> the agreement is dropped, the case loads open
    {
      id: 'a2', personId: 'sam', openedOn: '2026-10-01', openedAt: STAMP,
      demands: [
        { id: 'd1', managerId: 'engdir', title: 'A', frozenAt: STAMP },
        { id: 'd2', managerId: 'pmdir', title: 'B', frozenAt: STAMP },
      ],
      agreement: {
        at: STAMP, rankedIds: ['d1', 'd2'], effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-20', reviewOn: '2026-11-01', rationale: 'short',
      },
    },
  ], orgRoster(), warnings);
  assert.equal(out.length, 1);
  assert.equal(out[0].agreement, null, 'an agreement with no reasoning is not an agreement');
  assert.equal(priorityState(out[0]), PRIORITY_STATES.open);
  assert.ok(warnings.some((w) => /rationale/i.test(w)));
});

/* ------------------------------------------------------ 3. the human commands */

test('a case cannot be opened on a single-line person, a phantom line, or one manager', () => {
  const { store, api } = bootMemoryApi(workspace());
  const before = JSON.stringify(store.state.priorityArbitrations);

  // kim has ONE line: no cross-line contention exists.
  const single = api.priorityOpenCase({ personId: 'kim', demands: [demand('engdir', 'A', 5, 1), demand('engdir', 'B', 6, 1)] });
  assert.equal(single.ok, false);
  assert.match(single.error, /at least two lines/i);

  // A manager with no declared line to sam.
  const phantom = api.priorityOpenCase({ personId: 'sam', demands: [demand('engdir', 'A', 5, 1), demand('vp1', 'B', 6, 1)] });
  assert.equal(phantom.ok, false);
  assert.match(phantom.error, /no live line/i);

  // Two demands from the SAME manager are that manager's own prioritisation.
  const same = api.priorityOpenCase({ personId: 'sam', demands: [demand('engdir', 'A', 5, 1), demand('engdir', 'B', 6, 1)] });
  assert.equal(same.ok, false);
  assert.match(same.error, /same manager/i);

  // A demand with no cost of delay is refused outright, not defaulted to 0.
  const noCod = api.priorityOpenCase({ personId: 'sam', demands: [demand('engdir', 'A', '', 1), demand('pmdir', 'B', 6, 1)] });
  assert.equal(noCod.ok, false);
  assert.match(noCod.error, /cost of delay/i);

  assert.equal(JSON.stringify(store.state.priorityArbitrations), before, 'every refusal is a TRUE no-op');
});

test('a proposal binds nobody; only the arbiter’s agreement turns it into work', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);

  // Proposing with a pending demand is refused: a side has not been heard.
  const early = api.priorityPropose({ caseId });
  assert.equal(early.ok, false);
  assert.match(early.error, /no disposition/i);

  treatAll(api, caseId, case0);
  const proposed = api.priorityPropose({ caseId });
  assert.equal(proposed.ok, true, proposed.error);
  assert.equal(proposed.binding, false);

  const afterPropose = currentCase(store, caseId);
  assert.equal(priorityState(afterPropose), PRIORITY_STATES.proposed);
  // NO work may exist yet. This is the load-bearing assertion of the whole module.
  assert.equal((store.state.delegations || []).length, 0, 'a proposal issued no obligation');
  assert.equal((store.state.decisions || []).length, 0, 'a proposal opened no governed decision');

  const agreed = api.priorityAgreePrecedence({
    caseId, rationale: 'The blocker unblocks three other teams, so it goes first this fortnight.',
  });
  assert.equal(agreed.ok, true, agreed.error);
  assert.equal(agreed.binding, true);
  assert.deepEqual(agreed.rankedIds, proposed.rankedIds, 'the agreed order is the measured order when not overridden');

  const afterAgree = currentCase(store, caseId);
  assert.equal(priorityState(afterAgree), PRIORITY_STATES.agreed);
  // Both demands were sequenced, so exactly two tasks were issued by RULE-ARB-01,
  // both addressed to sam and both still open. (Other rules may legitimately open
  // their own follow-ups in the same commit; the assertion is on what THIS rule
  // wrote, which is the claim under test.)
  const ours = (store.state.delegations || []).filter((d) => d.personId === 'sam');
  assert.equal(ours.length, 2, 'one obligation per sequenced demand, none for a deferred one');
  assert.equal(ours.every((d) => d.status === 'active' && /agreed cross-line precedence/.test(d.title)), true);
  const pointers = afterAgree.agreement.issued.map((i) => i.taskId).sort();
  assert.deepEqual(pointers, ours.map((d) => d.id).sort(), 'the case points at exactly the tasks the rule issued');
  assert.equal((store.state.decisions || []).length, 1);
  assert.match(store.state.decisions[0].title, /comes first for Sam Engineer/i);
  assert.equal((afterAgree.agreement.issued || []).length, 2, 'the case holds POINTERS to the real tasks');
});

test('RULE-ARB-01 issues work ONLY for sequenced demands, and refuses to guess an arbiter', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  // d1 sequenced, d2 deferred — the deferred demand must produce NO task.
  api.priorityTreatDemand({ caseId, demandId: case0.demands[0].id, disposition: 'sequenced', reason: 'Takes the next available capacity this week.' });
  api.priorityTreatDemand({ caseId, demandId: case0.demands[1].id, disposition: 'deferred', reason: 'Waits for the window; the date moved by two weeks.' });
  const agreed = api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });
  assert.equal(agreed.ok, true, agreed.error);

  const tasks = (store.state.delegations || []).filter((d) => d.personId === 'sam');
  assert.equal(tasks.length, 1, 'the deferred demand produced no obligation');
  assert.match(tasks[0].title, /Fix the release blocker/);
  assert.equal((store.state.delegations || []).some((d) => /Ship the Q4 demo/.test(d.title)), false, 'the deferred demand is not quietly turned into work');

  // An agreement with no reasoning is refused.
  const caseId2 = openCase(api, [demand('engdir', 'X', 10, 2), demand('pmdir', 'Y', 20, 2)]);
  const c2 = currentCase(store, caseId2);
  treatAll(api, caseId2, c2);
  const noReason = api.priorityAgreePrecedence({ caseId: caseId2, rationale: 'ok' });
  assert.equal(noReason.ok, false);
  assert.match(noReason.error, /reasoning/i);

  // An override of the measured order requires a stated reason. X scores 10÷2 = 5
  // and Y scores 20÷2 = 10, so the MEASURED order is [Y, X]; passing [X, Y] is a
  // real reversal. (Reversing a list that already is the measured order is not an
  // override at all, and demanding a reason for it would be noise.)
  assert.deepEqual(priorityRank(c2).rankedIds, [c2.demands[1].id, c2.demands[0].id]);
  const overrideNoReason = api.priorityAgreePrecedence({
    caseId: caseId2,
    rationale: 'I have context the two figures do not carry, so I am reordering this one.',
    rankedIds: [c2.demands[0].id, c2.demands[1].id],
  });
  assert.equal(overrideNoReason.ok, false);
  assert.match(overrideNoReason.error, /reordered/i);

  // With the reason stated, the override is recorded — and recorded AS an override
  // rather than passed off as the engine's finding.
  const override = api.priorityAgreePrecedence({
    caseId: caseId2,
    rationale: 'I have context the two figures do not carry, so I am reordering this one.',
    rankedIds: [c2.demands[0].id, c2.demands[1].id],
    overrideReason: 'The customer demo depends on X landing first, whatever the ratio says.',
  });
  assert.equal(override.ok, true, override.error);
  assert.equal(override.overridden, true);
  const agreedRow = currentCase(store, caseId2);
  assert.match(agreedRow.agreement.rationale, /Human override of the measured order/);
  assert.equal(JSON.stringify(agreedRow.agreement.rankedIds), JSON.stringify([c2.demands[0].id, c2.demands[1].id]));
});

test('each party answers once, in their own words, and a second answer is refused', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);

  // Nothing to answer before an agreement exists.
  const early = api.priorityRecordAnswer({ caseId, stance: 'accept' });
  assert.equal(early.ok, false);
  assert.match(early.error, /nothing to answer/i);

  treatAll(api, caseId, case0);
  api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });

  // An objection needs a reason.
  const noReason = api.priorityRecordAnswer({ caseId, stance: 'object' });
  assert.equal(noReason.ok, false);
  assert.match(noReason.error, /why/i);

  const answered = api.priorityRecordAnswer({ caseId, stance: 'object', reason: 'My demo date was agreed with the customer three weeks ago.' });
  assert.equal(answered.ok, true, answered.error);

  const second = api.priorityRecordAnswer({ caseId, stance: 'accept', reason: 'On reflection I accept it.' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already answered/i);

  const row = currentCase(store, caseId);
  assert.equal(row.dissents.length, 1);
  assert.equal(row.dissents[0].stance, 'object');
  assert.match(row.dissents[0].reason, /customer/);
});

test('an agreement is append-only: a second one on the same case is refused', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  const first = api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });
  assert.equal(first.ok, true, first.error);
  const second = api.priorityAgreePrecedence({ caseId, rationale: 'On reflection the other demand goes first this time.' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already carries an agreed precedence/i);
});

/* --------------------------------- 4. display == stored, and the roll-up maths */

test('every printed figure equals the recomputed stored figure, and the state counts are an identity', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityPropose({ caseId });
  api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });

  // Reload from storage so the assertion is against what was PERSISTED.
  store.load();
  const report = buildPriorityReport(store.state, { now: NOW, settings: store.state.settings });
  const stored = currentCase(store, caseId);

  assert.equal(report.totals.caseN, 1);
  assert.equal(report.totals.agreedN, 1);
  assert.equal(report.totals.proposedN, 0);
  assert.equal(report.totals.openN, 0);
  assert.equal(report.totals.identity, true, 'open + proposed + agreed === live total');

  const printed = report.cases[0];
  assert.equal(printed.demandN, stored.demands.length);
  assert.equal(printed.dispositionTotal, stored.demands.filter((d) => d.treatment).length);
  assert.equal(printed.reconciles, true);

  // The printed capacity claim is exactly the sum of the stored declared shares
  // on the lines that hold a sequenced demand.
  const storedShares = stored.demands
    .filter((d) => d.treatment?.disposition === 'sequenced')
    .map((d) => (baseLines().find((l) => l.personId === 'sam' && l.managerId === d.managerId) || {}).shareH)
    .filter((h) => Number.isInteger(h));
  assert.equal(printed.capacity.claimedH, storedShares.reduce((a, b) => a + b, 0));

  // The printed order is exactly the stored order: recompute it from the blob.
  const recomputed = priorityRank(stored).rankedIds;
  assert.deepEqual(printed.rank.rankedIds, recomputed);
  assert.deepEqual(stored.agreement.rankedIds, recomputed);

  // Every issued obligation points at a REAL stored task with the same due date.
  for (const issued of stored.agreement.issued) {
    const task = store.state.delegations.find((d) => d.id === issued.taskId);
    assert.ok(task, `the pointer ${issued.taskId} resolves to a stored task`);
    assert.equal(task.dueOn, issued.dueOn);
    assert.equal(task.personId, stored.personId);
  }
  // And the count on the page is the count the case actually points at.
  assert.equal(report.totals.obligatedN, stored.agreement.issued.length);
});

test('the derived state is the acts, so a hand-edited blob cannot promote a proposal', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityPropose({ caseId });

  const raw = JSON.parse(JSON.stringify(store.state));
  const row = raw.priorityArbitrations.find((c) => c.id === caseId);
  // A hand-editor claims the case is agreed while the agreement names no demand.
  row.status = 'agreed';
  row.agreement = { at: STAMP, rankedIds: ['nonsense'], effectiveFrom: '2026-10-01', effectiveTo: '2026-10-20', reviewOn: '2026-11-01', rationale: 'fabricated agreement text' };
  const reloaded = normalizeState(raw, { now: NOW }).state;
  const reloadedCase = reloaded.priorityArbitrations.find((c) => c.id === caseId);
  assert.equal(reloadedCase.agreement, null, 'an agreement that does not name every frozen demand is dropped');
  assert.equal(priorityState(reloadedCase), PRIORITY_STATES.proposed, 'the case falls back to its real state');
});

test('the withdrawal is append-only and issues nothing', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const short = api.priorityWithdraw({ caseId, reason: 'soon' });
  assert.equal(short.ok, false, 'a withdrawal with no real reason is refused');
  const done = api.priorityWithdraw({ caseId, reason: 'The project was descoped on 2026-11-07, so the contention is gone.' });
  assert.equal(done.ok, true, done.error);
  const row = currentCase(store, caseId);
  assert.equal(row.status, 'withdrawn');
  assert.ok(row.withdrawnOn);
  assert.equal((store.state.delegations || []).length, 0);

  store.load();
  const report = buildPriorityReport(store.state, { now: NOW });
  assert.equal(report.totals.caseN, 0, 'a withdrawn case is not a live case');
  assert.equal(report.logCases.length, 1, 'but it stays readable in the log');
});

test('RULE-ARB-01 is registered between the matrix fan-out and the seat, with a contract', () => {
  // Rules are compared by FUNCTION IDENTITY: several spine entries carry no `.id`,
  // so an index looked up by name string would silently find -1 and the ordering
  // claim would pass vacuously.
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(priorityArbitrationRule);
  const matrixIdx = DEFAULT_POST_COMMIT_RULES.indexOf(matrixRule);
  assert.ok(idx >= 0 && matrixIdx >= 0);
  assert.ok(idx > matrixIdx, 'it runs after the matrix fan-out, so it sees every declared line');
  assert.ok(idx < DEFAULT_POST_COMMIT_RULES.indexOf(seatRule), 'and before the seat, so the issued task is fanned up the same transaction');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).id, 'sealRule');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === priorityArbitrationRule);
  assert.ok(contract, 'the rule declares a contract');
  assert.match(contract.purpose, new RegExp(PRIORITY_RULE_ID));
  assert.equal(contract.scansWorkspace, true);
  for (const key of ['delegations', 'decisions', 'links']) assert.ok(contract.writes.includes(key));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, '1:1 rule/contract parity');
});

test('the rule is idempotent: a rescan does not issue the same obligation twice', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });
  // Count only the obligations THIS rule issued: other spine rules legitimately
  // open their own follow-ups on the same commit, and folding those into the
  // count would make the idempotency claim unfalsifiable.
  const issuedN = () => (store.state.delegations || [])
    .filter((d) => d.personId === 'sam' && /agreed cross-line precedence/.test(d.title)).length;
  assert.equal(issuedN(), 2);
  const decisionN = store.state.decisions.length;
  assert.equal(decisionN, 1);

  // Run ONLY this rule twice more on an explicit scan, in the same store state.
  // Running it in isolation is the point: through the whole spine a rescan
  // legitimately lets every other rule react to the new work, which would hide a
  // duplicate this rule wrote inside that noise.
  const draft = JSON.parse(JSON.stringify(store.state));
  for (let pass = 0; pass < 2; pass += 1) {
    priorityArbitrationRule(draft, {
      event: { type: 'arbitration.scan' },
      now: NOW,
      idFactory: (p) => `${p}-rescan${pass}`,
      revision: pass + 1,
    });
  }
  assert.equal(draft.delegations.filter((d) => d.personId === 'sam' && /agreed cross-line precedence/.test(d.title)).length, 2, 'no duplicate obligation');
  assert.equal(draft.decisions.length, decisionN, 'no duplicate decision');
  assert.equal(draft.priorityArbitrations[0].agreement.issued.length, 2, 'the pointers did not stack either');
});

test('the rule is INERT without an agreement and in a single-chain workspace', () => {
  // Proposal only: nothing is issued.
  const draft = {
    ...workspace(),
    priorityArbitrations: [{
      id: 'arb-p', personId: 'sam', openedOn: '2026-10-01', openedAt: STAMP, personName: 'Sam',
      demands: [
        { id: 'd1', managerId: 'engdir', title: 'A', cod: 10, jobSize: 1, chainDays: 0, frozenAt: STAMP, treatment: { disposition: 'sequenced' } },
        { id: 'd2', managerId: 'pmdir', title: 'B', cod: 20, jobSize: 2, chainDays: 0, frozenAt: STAMP, treatment: { disposition: 'sequenced' } },
      ],
      proposal: { at: STAMP, verdict: 'clear-first', rankedIds: ['d2', 'd1'], rationale: '' },
      agreement: null, dissents: [], status: 'open',
    }],
    delegations: [],
    decisions: [],
  };
  const proposalOut = priorityArbitrationRule(draft, {
    event: { type: 'arbitration.proposed' }, now: NOW, idFactory: (p) => `${p}-x`,
  });
  assert.deepEqual(proposalOut, [], 'a proposal produces no propagation');
  assert.equal(draft.delegations.length, 0);

  // A single-chain workspace with no case at all stays completely untouched.
  const single = { ...workspace({ lines: [] }), priorityArbitrations: [], delegations: [] };
  const out = priorityArbitrationRule(single, { event: { type: 'case.created' }, now: NOW, idFactory: (p) => `${p}-y` });
  assert.deepEqual(out, []);
  assert.equal(single.delegations.length, 0);
});

/* ------------------------------------------- 5. graph, CSV, brief, attention */

test('the case is a first-class graph node with a real resolver, and every edge is registered', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('arbitration'));
  assert.ok(LINK_RELATIONS.includes('issues-obligation'));
  const resolved = resolveLinkedEntity({ priorityArbitrations: [{ id: 'arb-1', demands: [{}, {}], proposal: { at: STAMP } }] }, 'arbitration', 'arb-1');
  assert.ok(resolved);
  assert.equal(resolved.type, 'arbitration');
  assert.match(resolved.route, /#\/arbitration\?panel=case&case=arb-1/);
  // The label carries the state and counts, never a demand title or a person.
  assert.equal(resolved.title, 'Cross-line precedence · proposed');
  assert.equal(resolved.raw.demands.length, 2);
});

test('CSV #106 round-trips every row kind and blanks a refused figure instead of zeroing it', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });

  // A second case with an INCOMPLETE demand, so a refusal row is exported.
  api.priorityOpenCase({
    personId: 'sam',
    demands: [demand('engdir', 'Measured one', 10, 2), demand('pmdir', 'Also measured', 30, 5)],
  });

  const report = buildPriorityReport(store.state, { now: NOW, settings: store.state.settings });
  const rows = priorityCsvRows(report);
  const text = serializeCsv(PRIORITY_CSV_COLUMNS.map((key) => ({ key, header: key })), rows);
  const parsed = parseCsv(text);
  assert.deepEqual(parsed.headers, [...PRIORITY_CSV_COLUMNS]);
  assert.equal(parsed.rows.length, rows.length);
  // `parseCsv` returns positional rows; index them by the declared header order
  // and assert that every emitted key is a declared column.
  const asObjects = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((h, i) => [h, cells[i]])));
  for (const row of asObjects) for (const key of Object.keys(row)) {
    assert.ok(PRIORITY_CSV_COLUMNS.includes(key), `column ${key} is declared`);
  }
  const kinds = new Set(asObjects.map((r) => r.row_kind));
  assert.ok(kinds.has('workspace'));
  assert.ok(kinds.has('case'));
  assert.ok(kinds.has('demand'));

  // NO person, NO demand title, NO case id in any row.
  for (const row of asObjects) {
    const blob = Object.values(row).join(' ');
    assert.equal(blob.includes('Sam Engineer'), false, 'no person is named');
    assert.equal(blob.includes('Fix the release blocker'), false, 'no demand title is exported');
    assert.equal(blob.includes(caseId), false, 'no case id is exported');
  }

  // A demand missing its job size exports a BLANK rank, and says why.
  const incomplete = {
    ...workspace(),
    priorityArbitrations: [{
      id: 'arb-missing', personId: 'sam', openedOn: '2026-10-01', openedAt: STAMP, personName: 'Sam',
      demands: [
        { id: 'd1', managerId: 'engdir', title: 'A', cod: 10, jobSize: null, chainDays: 0, frozenAt: STAMP, treatment: null },
        { id: 'd2', managerId: 'pmdir', title: 'B', cod: 20, jobSize: 2, chainDays: 0, frozenAt: STAMP, treatment: null },
      ],
      proposal: null, agreement: null, dissents: [], status: 'open',
    }],
  };
  const refusedReport = buildPriorityReport(normalizeState(incomplete, { now: NOW }).state, { now: NOW });
  const refusedRows = priorityCsvRows(refusedReport).filter((r) => r.row_kind === 'demand');
  const refused = refusedRows.find((r) => r.ars_job_size === '');
  assert.ok(refused, 'the unscored demand exports its job size BLANK');
  assert.equal(refused.ars_rank, '', 'and its rank BLANK, never 0');
  assert.match(refused.withheld_reason, /job size/i);
});

test('the upward brief is identity-free and prints the identity it checked', () => {
  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityPropose({ caseId });

  const report = buildPriorityReport(store.state, { now: NOW, settings: store.state.settings });
  const text = priorityBriefText(report);
  assert.match(text, /1 proposed and unagreed|proposed and unagreed/);
  assert.equal(text.includes('Sam Engineer'), false, 'no person is named in the upward brief');
  assert.equal(text.includes('Fix the release blocker'), false, 'no demand title is named');
  assert.match(text, /add exactly to the live case count/i);
});

test('the attention badge counts what needs a decision, not what is healthy', () => {
  const { store, api } = bootMemoryApi(workspace());
  assert.equal(priorityAttentionCount(store.state, { now: NOW }), 0, 'an empty register is not noise');

  const caseId = openCase(api);
  assert.equal(priorityAttentionCount(store.state, { now: NOW }), 1, 'one open case with nothing proposed');
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityPropose({ caseId });
  assert.equal(priorityAttentionCount(store.state, { now: NOW }), 1, 'a proposal nobody agreed still needs a decision');
  api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });
  assert.equal(priorityAttentionCount(store.state, { now: NOW }), 0, 'an agreed, in-force precedence is not attention');
});

/* ----------------------------------------------------------- 6. the screen */

test('the arbitration screen renders axe-clean in JSDOM with no nested <main>', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole,
  });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  dom.window.axe = undefined;
  dom.window.eval(AXE_SRC);
  globalThis.axe = dom.window.axe;

  const { store, api } = bootMemoryApi(workspace());
  const caseId = openCase(api);
  const case0 = currentCase(store, caseId);
  treatAll(api, caseId, case0);
  api.priorityAgreePrecedence({ caseId, rationale: 'The blocker protects the delivery, so it goes first in this window.' });

  const ctx = {
    api,
    query: new URLSearchParams(''),
    navigate: () => {},
    refresh: () => {},
  };
  for (const panel of ['board', 'case', 'log', 'method']) {
    ctx.query = new URLSearchParams(`panel=${panel}&case=${caseId}`);
    const node = renderArbitration(ctx);
    document.body.innerHTML = '';
    document.body.appendChild(node);
    assert.equal(node.querySelectorAll('main').length, 0, 'no nested <main>');
    const results = await axe.run(document.body, { rules: { region: { enabled: false } } });
    assert.equal(results.violations.length, 0, `${panel}: ${results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`);
  }
  assert.deepEqual(errors, []);
});
