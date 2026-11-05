/** ADR-0087: lateral value-stream contracts and governed capital carryover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_COLLECTIONS, LINK_RELATIONS, SYSTEM_GENERATED_LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { buildValueStreamNetwork, buildValueStreamReport } from '../../app/core/domain/valueStream.js';
import { normalizeValueStreamContracts, normalizeValueStreamReallocations, normalizeValueStreamSettings } from '../../app/core/domain/valueStreamSchema.js';
import { renderValueStream } from '../../app/views/valueStream.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildSeats } from '../../app/core/domain/seat.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
function fixture({ withInvalidatedSource = false } = {}) {
  const state = createEmptyState(NOW.toISOString());
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.catchballAutoPropagate = true;
  state.settings.valueStreamAutoPropagate = true;
  state.people = [
    { id: 'vp', name: 'Vic Executive', role: 'VP', level: 'vp', status: 'active' },
    { id: 'dir', name: 'Dee Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'mgr', name: 'Morgan Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'mgr2', name: 'Mika Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'lead3', name: 'Rin Lead', role: 'Lead', level: 'lead', managerId: 'mgr2', status: 'active' },
    { id: 'ic1', name: 'Ari Analyst', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Analyst', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active' },
    { id: 'ic3', name: 'Cy Analyst', role: 'Analyst', level: 'ic', managerId: 'lead3', status: 'active' },
  ];
  state.strategyBets = [
    { id: 'bet1', title: 'Falsified bet', weightPct: 40, status: 'active', ownerId: 'dir', createdAt: NOW.toISOString() },
    { id: 'bet2', title: 'Receiving bet', weightPct: 60, status: 'active', ownerId: 'dir', createdAt: NOW.toISOString() },
  ];
  state.budgets = [
    { id: 'budget1', name: 'Operations', ownerId: 'vp', status: 'active', currency: 'DKK', limit: 2000, lines: [], createdAt: NOW.toISOString() },
    { id: 'budget2', name: 'Receiving envelope', ownerId: 'vp', status: 'active', currency: 'DKK', limit: 1000, lines: [], createdAt: NOW.toISOString() },
  ];
  if (withInvalidatedSource) {
    state.budgets[0].lines.push({
      id: 'source-line', title: 'Stopped pact encumbrance', category: 'other', status: 'committed',
      committedAmount: 300, actualAmount: null, committedOn: '2026-10-01', expectedOn: '2026-11-20',
      sourceType: null, sourceId: null, ownerId: 'lead1', note: 'Historical actual spend is kept on a separate spent line.',
    });
    state.budgets[0].lines.push({
      id: 'spent-line', title: 'Historical actual', category: 'other', status: 'spent',
      committedAmount: 100, actualAmount: 90, spentOn: '2026-10-15', sourceType: null, sourceId: null, ownerId: 'lead1',
    });
    state.catchballPacts.push({
      id: 'source-pact', title: 'Stopped thesis pact', summary: 'Execution held; the causal thesis did not.',
      strategyBetId: 'bet1', fromSeatId: 'mgr', toSeatId: 'lead1', ownerId: 'lead1', altitudeKey: 'manager',
      horizonDays: 30, correlation: 'strong', status: 'settled', effortDays: 5, effortActualDays: 1,
      budgetId: 'budget1', currency: 'DKK', resourceAskAmount: 300, encumberedLineId: 'source-line',
      roundCount: 2, startsOn: '2026-10-01', dueOn: '2026-11-20', agreedOn: '2026-10-01',
      gradedOn: '2026-11-03', gradedOutcome: 'thesis-invalidated', gradeNote: 'Leading held; outcome stalled.',
      createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-11-03T09:00:00.000Z',
    });
  }
  return normalizeState(state, { now: NOW }).state;
}
function harness(state = fixture()) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let serial = 0; let current = NOW;
  const idFactory = (p) => `${p}-test-${++serial}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { api, store, setNow: (date) => { current = date; } };
}
const contractInput = (extra = {}) => ({
  title: 'Validated increments hand-off', summary: 'Supply validated increments to the downstream team.',
  supplierSeatId: 'lead1', consumerSeatId: 'lead3', strategyBetId: 'bet2',
  metric: 'Validated increments', unit: 'increments', direction: 'at-least', target: 10, actual: 0,
  effortDays: 2, leadTimeDays: 5, startsOn: '2026-11-01', dueOn: '2026-11-20', ...extra,
});
const carryoverInput = (extra = {}) => ({
  sourcePactIds: ['source-pact'], title: 'Next-cycle recovery pact', summary: 'Apply the released envelope to the surviving bet.',
  toSeatId: 'lead3', strategyBetId: 'bet2', budgetId: 'budget2', currency: 'DKK', resourceAskAmount: 250,
  effortDays: 3, startsOn: '2026-11-05', dueOn: '2026-12-05', rationale: 'Stop-rule evidence favours the surviving bet.',
  ...extra,
});

test('v93 migration is additive; malformed contracts fail closed and graph/spine/CSV vocabulary is declared', () => {
  assert.equal(SCHEMA_VERSION, 103);
  const migrated = migrate({ schemaVersion: 92, settings: { leaderName: 'Keep' }, catchballPacts: [{ id: 'existing' }] });
  assert.deepEqual(migrated.applied, ['92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103']);
  assert.equal(migrated.raw.settings.leaderName, 'Keep');
  assert.equal(migrated.raw.catchballPacts[0].id, 'existing');
  assert.deepEqual(migrated.raw.valueStreamContracts, []);
  assert.deepEqual(migrated.raw.valueStreamReallocations, []);
  assert.deepEqual(migrated.raw.valueStreamMarkers, []);
  const warnings = [];
  assert.deepEqual(normalizeValueStreamContracts([{ id: 'bad', status: 'agreed' }], warnings), []);
  assert.ok(warnings.length);
  assert.deepEqual(normalizeValueStreamReallocations([{ id: 'bad', status: 'committed' }], warnings), []);
  const settings = normalizeValueStreamSettings({ valueStreamCellFloor: -4, valueStreamMaxDecisions: 900 });
  assert.ok(settings.valueStreamCellFloor >= 2);
  assert.ok(settings.valueStreamMaxDecisions <= 10);
  assert.equal(LINK_ENTITY_COLLECTIONS.valuestreamcontract, 'valueStreamContracts');
  assert.equal(LINK_ENTITY_COLLECTIONS.valuestreamreallocation, 'valueStreamReallocations');
  for (const relation of ['mediated-by', 'supplies-pact', 'breaches-sla', 'releases-capacity', 'funds-next-cycle', 'reallocates-to']) {
    assert.ok(LINK_RELATIONS.includes(relation), relation);
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation), relation);
  }
  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  assert.ok(names.indexOf('valueStreamRule') < names.indexOf('decisionTempoRule'));
  assert.ok(names.indexOf('valueStreamRule') < names.indexOf('catchballRule'));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.equal(CSV_EXPORTS.at(-1).key, 'value-stream-exchange');
});

test('critical path is a real CPM longest path with slack, downstream blast radius and cycle refusal', () => {
  const edges = [
    { id: 'a', supplierSeatId: 'a', consumerSeatId: 'b', leadTimeDays: 5, status: 'agreed' },
    { id: 'b', supplierSeatId: 'b', consumerSeatId: 'c', leadTimeDays: 20, status: 'agreed' },
    { id: 'c', supplierSeatId: 'a', consumerSeatId: 'c', leadTimeDays: 10, status: 'agreed' },
  ];
  const network = buildValueStreamNetwork(edges);
  assert.equal(network.criticalPathDays, 25);
  assert.deepEqual(network.criticalPathContractIds, ['a', 'b']);
  assert.equal(network.edges.find((e) => e.id === 'c').slackDays, 15);
  assert.deepEqual(network.edges.find((e) => e.id === 'a').downstreamContractIds, ['b']);
  const cycle = buildValueStreamNetwork([...edges, { id: 'd', supplierSeatId: 'c', consumerSeatId: 'a', leadTimeDays: 1, status: 'agreed' }]);
  assert.equal(cycle.criticalPathDays, null);
  assert.equal(cycle.cycleDetected, true);
  assert.ok(cycle.refusal.includes('cycle'));
});

test('horizontal proposal uses LCA mediation, receiver consent and same-transaction two-branch roll-up', () => {
  const { api, store } = harness();
  assert.ok(api.setActiveSeat('lead1').ok);
  const proposed = api.valueStreamContractPropose(contractInput());
  assert.ok(proposed.ok, proposed.error);
  const contract = proposed.contract;
  assert.equal(contract.mediatorSeatId, 'dir');
  assert.equal(contract.status, 'proposed');
  assert.equal(contract.awaitingConsentSeatId, 'lead3');
  assert.equal(api.valueStreamContractAccept(contract.id).ok, false, 'supplier cannot consent twice');
  assert.ok(api.setActiveSeat('lead2').ok);
  assert.equal(api.valueStreamContractAccept(contract.id).ok, false, 'sideways non-party denied');
  assert.equal(api.valueStreamRead().contracts.length, 0, 'non-party cannot read the peer contract');
  assert.ok(api.setActiveSeat('lead3').ok);
  assert.equal(api.valueStreamRead().contracts.length, 1, 'consumer party can read across the peer boundary');
  const accepted = api.valueStreamContractAccept(contract.id);
  assert.ok(accepted.ok, accepted.error);
  assert.equal(accepted.contract.status, 'agreed');
  const links = store.state.links.filter((l) => l.sourceId === contract.id && l.relation === 'rolls-up-to');
  for (const ancestor of ['lead1', 'mgr', 'dir', 'vp', 'lead3', 'mgr2']) {
    assert.ok(links.some((l) => l.targetId === ancestor), ancestor);
  }
  assert.ok(store.state.links.some((l) => l.sourceId === contract.id && l.relation === 'mediated-by' && l.targetId === 'dir'));
  assert.equal(store.state.events.filter((e) => e.type === 'automation.rule_error').length, 0);
});

test('customer-initiated request requires supplier consent; counters append terms rather than rewrite history', () => {
  const { api, store } = harness();
  assert.ok(api.setActiveSeat('lead3').ok);
  const proposed = api.valueStreamContractPropose(contractInput());
  assert.ok(proposed.ok, proposed.error);
  assert.equal(proposed.contract.awaitingConsentSeatId, 'lead1');
  assert.ok(api.setActiveSeat('lead1').ok);
  const counter = api.valueStreamContractCounter(proposed.contract.id, { target: 8, leadTimeDays: 7, effortDays: 1.5, note: 'Capacity-priced counter.' });
  assert.ok(counter.ok, counter.error);
  assert.equal(counter.contract.status, 'countered');
  assert.equal(counter.contract.target, 8);
  assert.equal(counter.contract.awaitingConsentSeatId, 'lead3');
  assert.ok(api.setActiveSeat('lead3').ok);
  assert.ok(api.valueStreamContractAccept(proposed.contract.id).ok);
  const rounds = store.state.valueStreamRounds.filter((r) => r.contractId === proposed.contract.id);
  assert.deepEqual(rounds.map((r) => r.kind), ['propose', 'counter', 'accept']);
  assert.equal(rounds[0].target, 10, 'initial offer remains immutable');
});

test('SLA direction, actuals, overdue breach governance and idempotent scans are not cosmetic statuses', () => {
  const { api, store, setNow } = harness();
  assert.ok(api.setActiveSeat('lead1').ok);
  const offered = api.valueStreamContractPropose(contractInput({ dueOn: '2026-11-03' }));
  assert.ok(api.setActiveSeat('lead3').ok);
  assert.ok(api.valueStreamContractAccept(offered.contract.id).ok);
  assert.ok(api.setActiveSeat('lead1').ok);
  const checkin = api.valueStreamContractCheckin(offered.contract.id, { actual: 4, note: 'Four validated; six blocked.', recordedOn: '2026-11-04' });
  assert.ok(checkin.ok, checkin.error);
  const decision = store.state.decisions.find((d) => d.question.includes(offered.contract.id));
  assert.ok(decision, 'overdue SLA miss opens a governed DACI decision in the same commit');
  assert.ok(store.state.links.some((l) => l.relation === 'breaches-sla' && l.targetId === offered.contract.id));
  const decisionCount = store.state.decisions.length;
  assert.ok(api.setActiveSeat(null).ok);
  assert.ok(api.valueStreamScan().ok);
  assert.equal(store.state.decisions.length, decisionCount, 'weekly marker prevents duplicate breach decisions');
  assert.ok(api.setActiveSeat('lead3').ok);
  assert.equal(api.valueStreamContractSettle(offered.contract.id, { outcome: 'fulfilled' }).ok, false, 'actual miss cannot be painted green');
  const settled = api.valueStreamContractSettle(offered.contract.id, { outcome: 'missed', note: 'Miss acknowledged; recovery decision remains open.' });
  assert.ok(settled.ok, settled.error);
  assert.equal(settled.contract.settlementOutcome, 'missed');
  setNow(new Date('2026-11-05T12:00:00.000Z'));
});

test('carryover preview releases only invalidated committed authority and preserves actuals, consent and lineage atomically', () => {
  const { api, store } = harness(fixture({ withInvalidatedSource: true }));
  assert.ok(api.setActiveSeat('vp').ok);
  const preview = api.valueStreamReallocationPreview(carryoverInput());
  assert.ok(preview.ok, preview.error);
  assert.equal(preview.preview.releasedEffortDays, 4);
  assert.equal(preview.preview.releasedBudgetAmount, 300);
  assert.equal(preview.preview.unallocatedBudgetAmount, 50);
  assert.equal(preview.preview.unallocatedEffortDays, 1);
  assert.match(preview.digest, /^[a-f0-9]{16}$/);
  const result = api.valueStreamReallocate({ ...carryoverInput(), expectedDigest: preview.digest });
  assert.ok(result.ok, result.error);
  const sourceLine = store.state.budgets[0].lines.find((l) => l.id === 'source-line');
  const spentLine = store.state.budgets[0].lines.find((l) => l.id === 'spent-line');
  assert.equal(sourceLine.status, 'released');
  assert.match(sourceLine.releasedReason, /valueStreamReallocation/);
  assert.equal(spentLine.status, 'spent');
  assert.equal(spentLine.actualAmount, 90, 'historical actual spend is untouched');
  assert.equal(store.state.catchballPacts.find((p) => p.id === 'source-pact').gradedOutcome, 'thesis-invalidated');
  const target = store.state.catchballPacts.find((p) => p.id === result.targetPactId);
  assert.equal(target.status, 'proposed', 'receiver is never auto-consented');
  assert.equal(target.strategyBetId, 'bet2');
  assert.equal(target.effortDays, 3);
  const planned = store.state.budgets[1].lines.find((l) => l.id === target.encumberedLineId);
  assert.equal(planned.status, 'planned');
  assert.equal(planned.committedAmount, 250);
  assert.equal(store.state.valueStreamReallocations.length, 1);
  assert.ok(store.state.links.some((l) => l.relation === 'releases-capacity' && l.targetId === 'source-pact'));
  assert.ok(store.state.links.some((l) => l.relation === 'funds-next-cycle' && l.targetId === target.id));
  assert.ok(store.state.links.some((l) => l.relation === 'reallocates-to' && l.targetId === 'bet2'));
  assert.ok(store.state.links.some((l) => l.sourceId === target.id && l.relation === 'deploys-strategy' && l.targetId === 'bet2'), 'Catchball consumes the reallocation event in the same spine');
  const second = api.valueStreamReallocationPreview(carryoverInput());
  assert.equal(second.ok, false, 'a consumed source cannot be offered twice');
  assert.equal(store.state.valueStreamReallocations.length, 1);
});

test('stale preview, mixed currency, excess capacity and non-invalidated sources cannot partially commit', () => {
  const { api, store } = harness(fixture({ withInvalidatedSource: true }));
  assert.ok(api.setActiveSeat('vp').ok);
  const preview = api.valueStreamReallocationPreview(carryoverInput());
  assert.ok(preview.ok, preview.error);
  api.updateBudgetLine('budget1', 'source-line', { committedAmount: 280 });
  const stale = api.valueStreamReallocate({ ...carryoverInput(), expectedDigest: preview.digest });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /stale|changed|Preview/i);
  assert.equal(store.state.valueStreamReallocations.length, 0);
  assert.equal(store.state.budgets[0].lines.find((l) => l.id === 'source-line').status, 'committed');
  assert.equal(api.valueStreamReallocationPreview(carryoverInput({ currency: 'EUR' })).ok, false);
  assert.equal(api.valueStreamReallocationPreview(carryoverInput({ resourceAskAmount: 301 })).ok, false);
  assert.equal(api.valueStreamReallocationPreview(carryoverInput({ effortDays: 4.1 })).ok, false);
  const target = { ...store.state.catchballPacts[0], gradedOutcome: 'missed' };
  store.state.catchballPacts[0] = target;
  assert.equal(api.valueStreamReallocationPreview(carryoverInput({ resourceAskAmount: 200, effortDays: 2 })).ok, false);
});

test('carryover receiver consent commits the existing planned line once; withdrawal releases it without reopening sources', () => {
  const { api, store } = harness(fixture({ withInvalidatedSource: true }));
  assert.ok(api.setActiveSeat('vp').ok);
  const preview = api.valueStreamReallocationPreview(carryoverInput());
  const committed = api.valueStreamReallocate({ ...carryoverInput(), expectedDigest: preview.digest });
  assert.ok(committed.ok, committed.error);
  assert.ok(api.setActiveSeat('lead3').ok);
  const accepted = api.catchballAccept(committed.targetPactId, { overloadJustification: 'Capacity was explicitly carried over.' });
  assert.ok(accepted.ok, accepted.error);
  const lines = () => store.state.budgets[1].lines.filter((l) => l.id === committed.targetPact.encumberedLineId || l.id === store.state.catchballPacts.find((p) => p.id === committed.targetPactId).encumberedLineId);
  assert.equal(lines().length, 1);
  assert.equal(lines()[0].status, 'committed');
  assert.ok(api.catchballWithdraw(committed.targetPactId).ok);
  assert.equal(lines()[0].status, 'released');
  assert.equal(store.state.valueStreamReallocations.length, 1);
  assert.equal(store.state.budgets[0].lines.find((l) => l.id === 'source-line').status, 'released');
});

test('carryover rights fail closed for director, peer and unrelated seats; root cannot consent for receiver', () => {
  const { api } = harness(fixture({ withInvalidatedSource: true }));
  for (const seatId of ['dir', 'lead1', 'lead2']) {
    assert.ok(api.setActiveSeat(seatId).ok);
    const result = api.valueStreamReallocate({ ...carryoverInput(), expectedDigest: 'not-a-valid-digest' });
    assert.equal(result.ok, false, seatId);
  }
  assert.ok(api.setActiveSeat('vp').ok);
  const preview = api.valueStreamReallocationPreview(carryoverInput());
  const committed = api.valueStreamReallocate({ ...carryoverInput(), expectedDigest: preview.digest });
  assert.ok(committed.ok, committed.error);
  assert.equal(api.catchballAccept(committed.targetPactId).ok, false, 'capital approver cannot substitute for receiving-span consent');
});

test('unknown effort actuals release budget but cannot invent person-day capacity', () => {
  const state = fixture({ withInvalidatedSource: true });
  delete state.catchballPacts[0].effortActualDays;
  state.catchballPacts[0] = normalizeState(state, { now: NOW }).state.catchballPacts[0];
  const { api } = harness(state);
  assert.ok(api.setActiveSeat('vp').ok);
  assert.equal(api.valueStreamReallocationPreview(carryoverInput({ effortDays: 1 })).ok, false);
  const preview = api.valueStreamReallocationPreview(carryoverInput({ effortDays: 0 }));
  assert.ok(preview.ok, preview.error);
  assert.equal(preview.preview.effortActualsComplete, false);
  assert.equal(preview.preview.releasedEffortDays, 0);
  assert.ok(preview.preview.warnings.some((w) => /actual effort/i.test(w)));
});

test('aggregate altitude disclosure hides contract bodies and small cells while LCA mediator retains exact terms', () => {
  const { api } = harness();
  assert.ok(api.setActiveSeat('lead1').ok);
  const offered = api.valueStreamContractPropose(contractInput());
  assert.ok(offered.ok, offered.error);
  assert.ok(api.setActiveSeat('dir').ok);
  const mediated = api.valueStreamRead();
  assert.equal(mediated.contracts.length, 1);
  assert.equal(mediated.contracts[0].title, 'Validated increments hand-off');
  assert.ok(api.setActiveSeat('vp').ok);
  const executive = api.valueStreamRead();
  assert.equal(executive.detailWithheld, true);
  assert.equal(executive.contracts.length, 0);
  assert.equal(executive.totals.active, null, 'small-cell count is suppressed, not exposed as one');
  assert.ok(executive.withheldReason);
});

test('value-stream CSV is aggregate-only below the cell floor and formula-safe', () => {
  const { api, store } = harness();
  assert.ok(api.setActiveSeat('lead1').ok);
  assert.ok(api.valueStreamContractPropose(contractInput({ title: '=HYPERLINK("bad")' })).ok);
  const rows = api.valueStreamCsvRows();
  assert.ok(rows.length >= 1);
  const csv = exportWorkspaceCsv(store.state, 'value-stream-exchange', { now: NOW });
  assert.ok(csv.ok, csv.error);
  assert.ok(csv.csv.includes('critical_path_days'));
  assert.ok(!csv.csv.includes('Ari Analyst'));
  const formula = exportWorkspaceCsv({ ...store.state, settings: { ...store.state.settings, activeSeatId: null } }, 'value-stream-exchange', { now: NOW });
  assert.ok(formula.ok, formula.error);
  assert.ok(!formula.csv.includes('\n=HYPERLINK'));
});

test('terminal renders five distinct altitude jobs, accessible forms, real preview and empty states', () => {
  const { api, store } = harness(fixture({ withInvalidatedSource: true }));
  const dom = new JSDOM('<!doctype html><main id="root"></main>');
  global.window = dom.window; global.document = dom.window.document; global.Node = dom.window.Node;
  const render = () => {
    const report = api.valueStreamRead();
    const preview = api.valueStreamReallocationPreview(carryoverInput());
    const node = renderValueStream(report, { preview: preview.ok ? preview.preview : null, previewDigest: preview.digest || null });
    const html = node.outerHTML;
    assert.ok(html.length > 100);
    assert.ok(html.includes('Value Stream'));
    assert.ok(html.includes('critical path'));
    assert.ok(html.includes('aria-label'));
    assert.ok(!html.includes('undefined'), html.match(/.{0,100}undefined.{0,100}/)?.[0] || 'no undefined');
    return html;
  };
  assert.ok(api.setActiveSeat('lead1').ok);
  assert.ok(render().includes('supplier'));
  assert.ok(api.setActiveSeat('dir').ok);
  assert.ok(render().includes('mediate'));
  assert.ok(api.setActiveSeat('vp').ok);
  const executive = render();
  assert.ok(executive.includes('carryover'));
  assert.ok(executive.includes('[UNVERIFIED]') || executive.includes('withheld'));
  delete global.window; delete global.document; delete global.Node;
});

test('demo workspace contains a normalized peer SLA over real leadership seats and derives its CPM', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.meta.isDemo, true);
  assert.equal(demo.valueStreamContracts.length, 1);
  assert.equal(demo.valueStreamRounds.length, 4);
  const contract = demo.valueStreamContracts[0];
  const built = buildSeats(demo, { now: NOW, settings: demo.settings });
  assert.ok(built.byId.has(contract.supplierSeatId), 'supplier is a leadership seat, not a courtesy IC seat');
  assert.ok(built.byId.has(contract.consumerSeatId), 'consumer is a leadership seat, not a courtesy IC seat');
  assert.equal(contract.mediatorSeatId, 'person-demo-1');
  const network = buildValueStreamNetwork(demo.valueStreamContracts);
  assert.equal(network.cycleDetected, false);
  assert.equal(network.criticalPathDays, 5);
  assert.deepEqual(network.criticalPathContractIds, ['vs-demo-1']);
  const reloaded = normalizeState(demo, { now: NOW });
  assert.equal(reloaded.state.valueStreamContracts.length, 1);
  assert.ok(!reloaded.warnings.some((warning) => warning.includes('valueStream')));
});

test('integrated terminal renders all five altitude panels through the reviewed API', () => {
  const dom = new JSDOM('<!doctype html><div id="modal-root"></div><div id="toast-root"></div>', { url: 'https://leados.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const { api, store } = harness();
    const proposed = api.valueStreamContractPropose(contractInput({ title: 'Secret supplier metric' }));
    assert.ok(proposed.ok, proposed.error);
    for (const panel of ['network', 'contracts', 'reallocation', 'rollup', 'brief']) {
      const node = renderValueStream({
        now: NOW,
        state: store.state,
        api,
        query: new URLSearchParams({ panel }),
        navigate() {},
        refresh() {},
      });
      assert.equal(node.querySelectorAll('h1').length, 1, panel);
      assert.ok(node.textContent.includes('Value Stream Exchange'), panel);
      assert.ok(!node.textContent.includes('undefined undefined'), panel);
    }
    assert.ok(api.setActiveSeat('vp').ok);
    for (const panel of ['network', 'rollup', 'brief']) {
      const node = renderValueStream({ now: NOW, state: store.state, api, query: new URLSearchParams({ panel }), navigate() {}, refresh() {} });
      assert.equal(node.querySelectorAll('h1').length, 1, `vp/${panel}`);
      assert.ok(!node.textContent.includes('Secret supplier metric'), `vp/${panel} must not expose peer terms`);
    }
  } finally {
    dom.window.close();
  }
});
