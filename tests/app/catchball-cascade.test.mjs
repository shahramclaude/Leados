/** ADR-0084: Hoshin Catchball lifecycle, disclosure and calibration. */
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
import { buildSpanRollupRows, calibrateCatchball, classifyBowlerPact, frechetDeliveryBounds, wilsonInterval } from '../../app/core/domain/catchball.js';
import { normalizeCatchballPacts } from '../../app/core/domain/catchballSchema.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { renderCatchball } from '../../app/views/catchball.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 86400000;
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  for (const key of Object.keys(state.settings)) if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  state.settings.catchballAutoPropagate = true;
  state.people = [
    { id: 'vp', name: 'Vic Executive', role: 'VP', level: 'vp', status: 'active' },
    { id: 'dir', name: 'Dee Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'mgr', name: 'Morgan Manager', role: 'Manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'lead2', name: 'Pat Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    { id: 'ic1', name: 'Ari Analyst', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Analyst', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  state.strategyBets = [{ id: 'bet1', title: 'A strategy bet', weightPct: 60, status: 'active', ownerId: 'dir', createdAt: NOW.toISOString() }];
  state.budgets = [{ id: 'budget1', name: 'Operations', ownerId: 'dir', status: 'active', currency: 'DKK', limit: 1000, lines: [], createdAt: NOW.toISOString() }];
  state.goals = [{ id: 'existing-goal', title: 'Existing commitment', ownerId: 'lead1', status: 'active', keyResults: [], createdAt: NOW.toISOString() }];
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
const proposal = (toSeatId = 'lead1', extra = {}) => ({ title: 'Improve the delivery flow', toSeatId, effortDays: 1, ...extra });

// Schema and graph are additive; imported rows cannot silently become accepted pacts.
test('v88 migration, record validation, graph vocabulary and spine parity', () => {
  assert.equal(SCHEMA_VERSION, 98);
  const migrated = migrate({ schemaVersion: 88, settings: { leaderName: 'Keep' }, people: [] });
  assert.deepEqual(migrated.applied, ['88 → 89', '89 → 90', '90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98']);
  assert.deepEqual(migrated.raw.catchballPacts, []);
  assert.deepEqual(migrated.raw.catchballRounds, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep');
  const afterConcordance = migrate({ schemaVersion: 89, expectationRounds: [{ id: 'existing-round' }], settings: {} });
  assert.deepEqual(afterConcordance.applied, ['89 → 90', '90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98']);
  assert.equal(afterConcordance.raw.expectationRounds[0].id, 'existing-round');
  assert.deepEqual(afterConcordance.raw.catchballPacts, []);
  const warnings = [];
  assert.deepEqual(normalizeCatchballPacts([{ id: 'bad', title: 'No consent', toSeatId: 'p', status: 'settled' }], warnings), []);
  assert.ok(warnings.length);
  assert.equal(LINK_ENTITY_COLLECTIONS.catchballpact, 'catchballPacts');
  assert.equal(LINK_ENTITY_COLLECTIONS.catchballround, 'catchballRounds');
  for (const relation of ['deploys-strategy', 'cascades-to', 'counters-upward', 'trades-off']) {
    assert.ok(LINK_RELATIONS.includes(relation));
    assert.ok(SYSTEM_GENERATED_LINK_RELATIONS.includes(relation));
  }
  const names = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.name);
  assert.equal(names.indexOf('catchballRule'), names.indexOf('altitudeRouterRule') + 1);
  // ADR-0089 freezes and links renewal evidence after the cascade; cadence then
  // reads the queue after both have added any human-review decisions.
  assert.equal(names.indexOf('strategyCycleRule'), names.indexOf('catchballRule') + 1);
  // The contract is that cadence reads the queue AFTER the cascade and the strategy
  // cycle have added their human-review decisions — not that they are adjacent.
  // ADR-0089's carryover rule already sits between them, so asserting position + 1
  // encoded a coincidence rather than the invariant (it failed on main for exactly
  // that reason). Assert the ordering, and the rules cadence must read behind.
  assert.ok(names.indexOf('cadenceRule') > names.indexOf('strategyCycleRule'), 'cadence reads the queue after the strategy cycle');
  assert.ok(names.indexOf('cadenceRule') > names.indexOf('catchballRule'), 'cadence reads the queue after the cascade');
  assert.ok(names.indexOf('catchballRule') < names.indexOf('attentionMarketRule'));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  // The registry is append-only and numbering follows position: CSV #79 is the
  // Catchball cascade, #80 the Board Room (Session 125) and #81 the Operating
  // Cadence Clock (Session 126). Asserting the ORDER is the contract; asserting
  // one of them is LAST would break the moment a later session appends its own.
  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'catchball-cascade'));
  assert.ok(CSV_EXPORTS.findIndex((scope) => scope.key === 'catchball-cascade') < CSV_EXPORTS.findIndex((scope) => scope.key === 'board-claims'));
  assert.ok(CSV_EXPORTS.findIndex((scope) => scope.key === 'board-claims') < CSV_EXPORTS.findIndex((scope) => scope.key === 'operating-cadence'));
  // A later session may append; registration ORDER is the contract, not the tail.
  assert.ok(CSV_EXPORTS.findIndex((s) => s.key === 'catchball-cascade') < CSV_EXPORTS.findIndex((s) => s.key === 'operating-cadence'));
});

test('one proposal writes strategy and hierarchy provenance; scans are idempotent', () => {
  const { api, store } = harness();
  const result = api.catchballPropose(proposal('lead1', { strategyBetId: 'bet1' }));
  assert.equal(result.ok, true, result.error);
  const id = result.pact.id;
  const links = store.state.links.filter((l) => l.sourceId === id && l.ruleId === 'RULE-HK-01');
  assert.ok(links.some((l) => l.relation === 'deploys-strategy' && l.targetType === 'strategy' && l.targetId === 'bet1'));
  for (const person of ['lead1', 'mgr', 'dir', 'vp']) assert.ok(links.some((l) => l.relation === 'rolls-up-to' && l.targetId === person), person);
  const before = store.state.links.length;
  assert.ok(api.catchballScan().ok);
  assert.equal(store.state.links.length, before);
  const reloaded = normalizeState(store.state, { now: NOW }).state;
  assert.ok(reloaded.links.some((l) => l.sourceId === id && l.targetId === 'bet1'));
  assert.equal(store.state.events.filter((e) => e.type === 'automation.rule_error').length, 0);
});

test('declared seats enforce receiver consent, peer isolation and real counters', () => {
  const { api, store } = harness();
  assert.ok(api.setActiveSeat('mgr').ok);
  const offered = api.catchballPropose(proposal());
  assert.ok(offered.ok, offered.error);
  assert.equal(api.catchballAccept(offered.pact.id).ok, false, 'ancestor cannot accept for the receiver');
  assert.equal(api.catchballCounter(offered.pact.id, { mechanism: 'scope-trim', proposedEffortDays: 0 }).ok, false, 'ancestor cannot counter for receiver');
  assert.ok(api.setActiveSeat('lead2').ok);
  assert.equal(api.catchballAccept(offered.pact.id).ok, false, 'sideways peer');
  assert.equal(api.catchballPreviewFeasibility('lead1').ok, false, 'sideways preview');
  assert.ok(api.setActiveSeat('lead1').ok);
  assert.equal(api.catchballCounter(offered.pact.id, { mechanism: 'scope-trim', proposedEffortDays: 1, proposedLaggingTarget: 100 }).ok, false, 'no-op trim cannot bypass overload');
  const counter = api.catchballCounter(offered.pact.id, { mechanism: 'trade-off', tradeOffSourceType: 'goal', tradeOffSourceId: 'existing-goal', note: 'Pause the old objective.' });
  assert.ok(counter.ok, counter.error);
  assert.ok(store.state.links.some((l) => l.relation === 'counters-upward'));
  assert.ok(store.state.links.some((l) => l.relation === 'trades-off' && l.targetId === 'existing-goal'));
  const accepted = api.catchballAccept(offered.pact.id, { confidencePct: 70 });
  assert.ok(accepted.ok, accepted.error);
  assert.equal(accepted.pact.status, 'agreed');
  assert.equal(accepted.pact.roundCount, 3);
});

test('acceptance creates a same-currency encumbrance and a reload-safe goal; withdrawal releases it', () => {
  const { api, store } = harness();
  assert.equal(api.catchballPropose(proposal('lead1', { budgetId: 'budget1', currency: 'EUR' })).ok, false);
  const offered = api.catchballPropose(proposal('lead1', { budgetId: 'budget1', currency: 'DKK', resourceAskAmount: 300 }));
  assert.ok(offered.ok, offered.error);
  const accepted = api.catchballAccept(offered.pact.id, { createGoal: true, confidencePct: 75, overloadJustification: 'We reserved enough capacity.' });
  assert.ok(accepted.ok, accepted.error);
  let line = store.state.budgets[0].lines.find((l) => l.id === accepted.encumberedLineId);
  assert.equal(line.status, 'committed');
  assert.equal(line.committedAmount, 300);
  assert.ok(store.state.links.some((l) => l.relation === 'funds' && l.sourceId === offered.pact.id));
  const normalized = normalizeState(store.state, { now: NOW }).state;
  assert.equal(normalized.goals.find((g) => g.id === accepted.goalId).keyResults.length, 1);
  assert.ok(api.catchballWithdraw(offered.pact.id).ok);
  line = store.state.budgets[0].lines.find((l) => l.id === accepted.encumberedLineId);
  assert.equal(line.status, 'released');
  assert.equal(line.releasedOn, '2026-11-04');
});

test('watermelon and double-loop detection trigger once per week and retain human choice', () => {
  const { api, store, setNow } = harness();
  const parent = api.catchballPropose(proposal('mgr', { strategyBetId: 'bet1', startsOn: '2026-10-01', dueOn: '2026-11-20' }));
  assert.ok(parent.ok, parent.error);
  assert.ok(api.catchballAccept(parent.pact.id, { overloadJustification: 'Explicitly reprioritised capacity.' }).ok);
  const child = api.catchballPropose(proposal('lead1', { parentPactId: parent.pact.id, strategyBetId: 'bet1', startsOn: '2026-10-01', dueOn: '2026-11-20' }));
  assert.ok(child.ok, child.error);
  assert.ok(api.catchballAccept(child.pact.id, { overloadJustification: 'Explicitly reprioritised capacity.' }).ok);
  const second = api.catchballPropose(proposal('lead2', { parentPactId: parent.pact.id, startsOn: '2026-10-01', dueOn: '2026-11-20' }));
  assert.ok(second.ok, second.error);
  assert.ok(api.catchballAccept(second.pact.id, { overloadJustification: 'Explicitly reprioritised capacity.' }).ok);
  assert.ok(api.catchballCheckin(parent.pact.id, { leadingPct: 90, laggingPct: 70, reportedPct: 90 }).ok);
  assert.ok(api.catchballCheckin(child.pact.id, { leadingPct: 90, laggingPct: 20 }).ok);
  assert.ok(api.catchballCheckin(second.pact.id, { leadingPct: 85, laggingPct: 90 }).ok);
  const report = api.catchballRead();
  assert.ok(report.watermelons.some((p) => p.id === parent.pact.id));
  assert.ok(report.thesisSuspects.some((p) => p.id === child.pact.id && p.bowler.executionExonerated));
  const markerDecisions = () => store.state.decisions.filter((d) => /\[HK-(WML|DBL):/.test(d.question));
  assert.equal(markerDecisions().length, 2);
  assert.ok(api.catchballScan().ok);
  assert.equal(markerDecisions().length, 2);
  setNow(new Date(NOW.getTime() + 8 * DAY));
  assert.ok(api.catchballScan().ok);
  assert.equal(markerDecisions().length, 4);
  assert.equal(store.state.strategyBets.find((b) => b.id === 'bet1').status, 'draft', 'automation does not alter the bet');
});

test('math refuses missing data, reports uncertainty and avoids lookahead calibration', () => {
  assert.equal(wilsonInterval(2, 4, 5), null);
  assert.deepEqual(frechetDeliveryBounds([0.8, 0.7]), { k: 2, lowerPct: 50, independencePct: 56, upperPct: 70 });
  assert.equal(frechetDeliveryBounds([0.8, null]), null);
  assert.equal(classifyBowlerPact({ status: 'agreed', leadingPct: 90, laggingPct: 20, startsOn: '2026-11-01', dueOn: '2026-11-30' }, '2026-11-04').state, 'outcome-lag');
  assert.equal(classifyBowlerPact({ status: 'agreed', leadingPct: 90, laggingPct: 20, startsOn: '2026-10-01', dueOn: '2026-11-01' }, '2026-11-04').state, 'thesis-suspect');
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, altitudeKey: 'manager', status: 'settled',
    agreedOn: '2026-10-01', gradedOn: '2026-10-20', createdAt: '2026-10-01', frozenConfidencePct: 80,
    roundCount: i < 3 ? 2 : 3, gradedOutcome: i % 2 ? 'missed' : 'delivered' }));
  const r = calibrateCatchball(rows);
  assert.equal(r.singlePassN, 3);
  assert.equal(r.negotiatedN, 3);
  assert.equal(r.negotiationLiftPp, null, 'each group remains below the evidence floor');
  assert.equal(r.pooledBrierN, 6);
  assert.equal(r.pooledBrier, 0.34);
  const sameDay = calibrateCatchball(rows.map((p) => ({ ...p, agreedOn: p.gradedOn })));
  assert.equal(sameDay.pooledBrier, null, 'same-day ordering is not known');
});

test('executive API suppresses item bodies, small counts and scoped export', () => {
  const { api, store } = harness();
  const p = api.catchballPropose(proposal('lead1', { title: 'Secret pact title' }));
  assert.ok(p.ok, p.error);
  assert.ok(api.setActiveSeat('vp').ok);
  const read = api.catchballRead();
  assert.equal(read.detailWithheld, true);
  assert.deepEqual(read.pacts, []);
  assert.equal(read.totals.active, null);
  assert.ok(!JSON.stringify(read).includes('Secret pact title'));
  assert.equal(api.catchballPreviewFeasibility('lead1').ok, false);
  const csv = api.catchballCsvRows();
  assert.ok(csv.every((row) => row.verdict === 'withheld-aggregate-view'));
  assert.ok(!JSON.stringify(csv).includes('Secret pact title'));
  assert.ok(!api.catchballBriefText().includes('Secret pact title'));
  assert.equal(api.catchballScan().ok, false, 'subordinate seat cannot scan across workspace');
  const aggregate = exportWorkspaceCsv(store.state, 'catchball-cascade', { now: NOW });
  assert.ok(aggregate.ok);
  assert.match(aggregate.csv, /withheld-aggregate-view/);
});

test('primary and complementary span suppression cannot reveal raw sibling counts', () => {
  const state = fixture();
  state.people.push({ id: 'dir2', name: 'Other Director', role: 'Director', level: 'director', managerId: 'vp', status: 'active' },
    { id: 'worker2', name: 'Other Worker', role: 'Lead', level: 'lead', managerId: 'dir2', status: 'active' });
  const built = buildSeats(state, { now: NOW });
  const viewer = built.byId.get('vp');
  const rows = buildSpanRollupRows([
    { toSeatId: 'lead1', status: 'agreed', laggingPct: 40, effortDays: 1 },
    ...Array.from({ length: 4 }, () => ({ toSeatId: 'worker2', status: 'agreed', laggingPct: 80, effortDays: 1 })),
  ], viewer, built, 3);
  assert.equal(rows.filter((r) => r.primarySuppressed).length, 1);
  assert.equal(rows.filter((r) => r.complementarySuppressed).length, 1);
});

test('all five panels render with the real reviewed API', () => {
  const dom = new JSDOM('<!doctype html><div id="modal-root"></div><div id="toast-root"></div>', { url: 'https://leados.test/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const { api, store } = harness();
    const p = api.catchballPropose(proposal());
    assert.ok(p.ok);
    for (const panel of ['matrix', 'workbench', 'watermelon', 'calibration', 'brief']) {
      const node = renderCatchball({ now: NOW, state: store.state, api, query: new URLSearchParams({ panel }), navigate() {}, refresh() {} });
      assert.equal(node.querySelectorAll('h1').length, 1, panel);
      assert.match(node.textContent, /Catchball/);
    }
  } finally { dom.window.close(); }
});
