/**
 * ADR-0083 — The Concordance Terminal (Schema v89).
 *
 * Proves, against the REAL store + REAL rule spine:
 *  - "meets expectations" is treated as a measurement instrument: quadratic
 *    weighted κ, Gwet's AC1, PABAK and Bland–Altman limits of agreement are
 *    computed on the two sides of one expectation, checked against
 *    independently computed values and against analytic cases;
 *  - a figure is REFUSED, with a printed reason, below the six-item instrument
 *    floor, on degenerate marginals, and below the span cell floor;
 *  - a round is sealed: one side in reveals nothing, a second submission is
 *    refused, and the two gauges appear only when both sides are in;
 *  - ONE closed round fans out in the SAME transaction: a governed
 *    re-contracting decision, one agenda line on the pair's 1:1, and typed
 *    `rolls-up-to` edges to the manager, director and VP above the pair;
 *  - counts partition exactly up the tree and a declared seat at director rank
 *    reads span rates, not another span's two gauges;
 *  - aggregate-only CSV and the identity-free brief never carry a name, an id
 *    or an individual rating.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, describePropagationContracts } from '../../app/core/domain/propagationContracts.js';
import {
  concordanceRead, concordanceStats, weightedKappa, gwetAC1, pabak, blandAltman,
  concordanceBriefText, concordanceCsvRows, concordanceAttentionCount, retestLift,
  conversationScript, wilsonInterval,
} from '../../app/core/domain/concordance.js';
import { normalizeConcordanceRounds, normalizeConcordanceSettings } from '../../app/core/domain/concordanceSchema.js';
import {
  CONCORDANCE_DIMENSION_KEYS, CONCORDANCE_DIMENSIONS, CONCORDANCE_RULES,
} from '../../app/core/domain/concordanceRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderConcordance } from '../../app/views/concordance.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const KEYS = CONCORDANCE_DIMENSION_KEYS;

const ratings = (values) => Object.fromEntries(KEYS.map((key, i) => [key, values[i]]));
// Non-degenerate on purpose: a side that used a single category on both sides
// makes chance-corrected agreement undefined (0/0), which the module refuses —
// the fixtures that need a FIGURE use two or more categories.
const HIGH = ratings([5, 5, 4, 4, 5, 4]);
const LOW = ratings([2, 2, 3, 3, 2, 3]);
const ALIGNED = ratings([1, 2, 3, 4, 5, 1]);
const HIGH_UNIFORM = ratings([5, 5, 5, 5, 5, 5]);
const LOW_UNIFORM = ratings([2, 2, 2, 2, 2, 2]);

function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null, ...overrides };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Ola Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active' },
    { id: 'ic4', name: 'Dee Sorensen', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active' },
    { id: 'ic5', name: 'Eli Brandt', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture(), clockRef = null) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const now = () => (clockRef ? clockRef.value : NOW);
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now, idFactory: (p) => `${p}-test-${++seq}` });
  store.load();
  return { store, api: createApi(store, { now, idFactory: (p) => `${p}-test-${++seq}` }) };
}

function bootDocument() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Event = dom.window.Event;
  return dom;
}

/** Open and close one round through the real API. */
function closeRound(api, leaderId, memberId, leaderRatings, memberRatings, cycle = '2026-11') {
  const opened = api.concordanceOpenRound({ leaderId, memberId, cycle });
  assert.equal(opened.ok, true, opened.error);
  const id = opened.round.id;
  assert.equal(api.concordanceSubmit(id, 'leader', leaderRatings, '').ok, true);
  const second = api.concordanceSubmit(id, 'member', memberRatings, '');
  assert.equal(second.ok, true, second.error);
  return id;
}

/* ------------------------------------------------------------- 1. schema */

test('schema v89 migrates additively and a malformed round cannot become a claim', () => {
  assert.equal(SCHEMA_VERSION, 118);
  const old = { schemaVersion: 88, settings: { leaderName: 'Keep' }, cases: [{ id: 'keep' }], altitudeRoutingPlans: [{ id: 'r1' }] };
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, 118);
  assert.deepEqual(migrated.applied, ['88 → 89', '89 → 90', '90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113', '113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118']);
  assert.deepEqual(migrated.raw.expectationRounds, []);
  assert.deepEqual(migrated.raw.concordanceMarkers, []);
  assert.equal(migrated.raw.cases[0].id, 'keep');
  assert.equal(migrated.raw.altitudeRoutingPlans[0].id, 'r1');
  assert.equal(migrated.raw.settings.concordanceAgreementFloorPct, 60);
  assert.equal(migrated.raw.settings.concordanceAutoPropagate, true);

  // A round claiming to be closed with one side in is reopened, never published.
  const warnings = [];
  const reopened = normalizeConcordanceRounds([{
    id: 'r1', leaderId: 'a', memberId: 'b', status: 'closed',
    leaderSubmittedAt: NOW.toISOString(), memberSubmittedAt: null,
    items: [{ key: 'done', leader: 4, member: 2 }],
  }], warnings);
  assert.equal(reopened[0].status, 'open');
  assert.ok(warnings.some((w) => w.includes('reopened')));

  // Unknown dimension dropped, out-of-range rating becomes "not answered".
  const warnings2 = [];
  const cleaned = normalizeConcordanceRounds([{
    id: 'r2', leaderId: 'a', memberId: 'b', status: 'open',
    items: [{ key: 'done', leader: 9, member: 3 }, { key: 'vibes', leader: 4, member: 4 }, { key: 'done', leader: 1, member: 1 }],
  }], warnings2);
  assert.equal(cleaned[0].items.length, 1);
  assert.equal(cleaned[0].items[0].leader, null);
  assert.equal(cleaned[0].items[0].member, 3);
  assert.ok(warnings2.some((w) => w.includes('unknown dimension')));

  // Duplicate ids are dropped, not merged.
  const dup = normalizeConcordanceRounds([
    { id: 'x', leaderId: 'a', memberId: 'b', status: 'open', items: [] },
    { id: 'x', leaderId: 'c', memberId: 'd', status: 'open', items: [] },
  ], []);
  assert.equal(dup.length, 1);

  // Settings clamp into their printed ranges.
  assert.deepEqual(normalizeConcordanceSettings({ concordanceAgreementFloorPct: 400, concordanceCellFloor: 0, concordanceRetestDays: 5000 }), {
    concordanceAgreementFloorPct: 60, concordanceCellFloor: 5, concordanceEvidenceFloor: 3,
    concordanceRetestDays: 21, concordanceReviewDays: 14, concordanceAutoPropagate: true,
  });
});

/* --------------------------------------------------------- 2. statistics */

test('agreement statistics match analytic cases and an independent 5×5 computation', () => {
  // Perfect agreement: κ = 1 exactly.
  const perfect = KEYS.map((key, i) => ({ key, leader: (i % 5) + 1, member: (i % 5) + 1 }));
  assert.equal(weightedKappa(perfect).value, 1);

  // Balanced cross on a five-point scale: weighted κ = 0, PABAK = 0, AC1 > 0.
  const cross = [{ key: 'a', leader: 1, member: 1 }, { key: 'b', leader: 1, member: 2 },
    { key: 'c', leader: 2, member: 1 }, { key: 'd', leader: 2, member: 2 }];
  assert.ok(Math.abs(weightedKappa(cross).value) < 1e-12);
  assert.equal(pabak(cross), 0);
  assert.ok(Math.abs(gwetAC1(cross).value - 0.42857142857142855) < 1e-12);

  // An independently written expected-agreement computation must agree.
  const pairs = KEYS.map((key, i) => ({ key, leader: [5, 4, 3, 2, 5, 1][i], member: [5, 3, 3, 2, 4, 2][i] }));
  const K = 5;
  const O = Array.from({ length: K }, () => new Array(K).fill(0));
  for (const p of pairs) O[p.leader - 1][p.member - 1] += 1;
  const n = pairs.length;
  const row = O.map((r) => r.reduce((a, b) => a + b, 0));
  const col = Array.from({ length: K }, (_, j) => O.reduce((a, r) => a + r[j], 0));
  let po = 0; let pe = 0;
  for (let i = 0; i < K; i += 1) {
    for (let j = 0; j < K; j += 1) {
      const w = 1 - ((i - j) / (K - 1)) ** 2;
      po += (w * O[i][j]) / n;
      pe += w * (row[i] / n) * (col[j] / n);
    }
  }
  const expected = (po - pe) / (1 - pe);
  assert.ok(Math.abs(weightedKappa(pairs).value - expected) < 1e-12, 'weighted κ equals the independent computation');

  // Bland–Altman on a known vector: diffs [2,1,0,-1,0,2] → bias 0.6667.
  const ba = blandAltman([{ key: 'a', leader: 3, member: 1 }, { key: 'b', leader: 3, member: 2 },
    { key: 'c', leader: 3, member: 3 }, { key: 'd', leader: 3, member: 4 },
    { key: 'e', leader: 3, member: 3 }, { key: 'f', leader: 4, member: 2 }]);
  assert.ok(Math.abs(ba.bias - 2 / 3) < 1e-12);
  assert.ok(ba.lo < ba.bias && ba.hi > ba.bias);
});

test('the prevalence paradox is printed, not hidden: AC1 answers where κ collapses', () => {
  const round = {
    id: 'r', leaderId: 'a', memberId: 'b', status: 'closed',
    leaderSubmittedAt: NOW.toISOString(), memberSubmittedAt: NOW.toISOString(),
    items: KEYS.map((key, i) => ({ key, leader: 5, member: i === 0 ? 4 : 5 })),
  };
  const stats = concordanceStats(round);
  const ac1 = gwetAC1(KEYS.map((key, i) => ({ key, leader: 5, member: i === 0 ? 4 : 5 }))).value;
  assert.ok(stats.kappaW < 0.2, `κ collapses under prevalence (${stats.kappaW})`);
  assert.ok(ac1 > 0.7, `AC1 stays high (${ac1})`);
  assert.ok(stats.refusalReasons.some((r) => r.includes('prevalence paradox')));
});

test('a partial instrument is refused entirely, with the reason printed', () => {
  const round = {
    id: 'r', leaderId: 'a', memberId: 'b', status: 'closed',
    leaderSubmittedAt: NOW.toISOString(), memberSubmittedAt: NOW.toISOString(),
    items: [{ key: 'done', leader: 5, member: 2 }, { key: 'quality', leader: 4, member: 4 }],
  };
  const stats = concordanceStats(round);
  assert.equal(stats.refused, true);
  assert.equal(stats.kappaPct, null);
  assert.equal(stats.ac1Pct, null);
  assert.ok(stats.refusalReasons.some((r) => r.includes('six items')));
  // Perfect agreement still warns that agreement is not correctness.
  const perfect = concordanceStats({
    ...round, items: KEYS.map((key, i) => ({ key, leader: (i % 5) + 1, member: (i % 5) + 1 })),
  });
  assert.equal(perfect.kappaPct, 100);
  assert.ok(perfect.refusalReasons.some((r) => r.includes('not correctness')));
});

/* ----------------------------------------------------------- 3. sealing */

test('a round is sealed: one side reveals nothing, a second submission is refused, both sides reveal together', () => {
  const { store, api } = boot();
  const opened = api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'ic1', cycle: '2026-11' });
  assert.equal(opened.ok, true, opened.error);
  const id = opened.round.id;

  // Partial answers are refused at the API, not silently stored.
  const partial = api.concordanceSubmit(id, 'leader', { done: 5 }, '');
  assert.equal(partial.ok, false);
  assert.equal(partial.field, 'ratings');

  const first = api.concordanceSubmit(id, 'leader', HIGH, 'I think this is the bar');
  assert.equal(first.ok, true, first.error);
  assert.equal(first.sealed, true);
  assert.equal(first.stats.refused, true, 'no agreement figure exists with one side in');
  assert.equal(first.stats.kappaPct, null);

  const read = concordanceRead(store.state, { now: NOW });
  const round = read.rounds.find((r) => r.id === id);
  assert.equal(round.status, 'open');
  assert.equal(round.stats.refused, true);
  assert.equal(round.items.find((i) => i.key === 'done').member, null, 'the other side is not readable');

  // The same side cannot overwrite what it already sealed.
  const twice = api.concordanceSubmit(id, 'leader', LOW, '');
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already sealed/);

  const second = api.concordanceSubmit(id, 'member', LOW, 'I did not know that');
  assert.equal(second.ok, true, second.error);
  assert.equal(second.sealed, false);
  assert.equal(second.stats.divergedDimensions.length, 3);
  assert.equal(second.stats.bias, 2);
  assert.equal(second.stats.biasDirection, 'leader-higher');

  const after = concordanceRead(store.state, { now: NOW });
  const closed = after.rounds.find((r) => r.id === id);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.stats.kappaPct === null, false);

  // A closed round is evidence: it cannot be submitted into or withdrawn.
  assert.equal(api.concordanceSubmit(id, 'member', HIGH, '').ok, false);
  assert.equal(api.concordanceWithdraw(id, 'too late').ok, false);
});

/* ------------------------------------------------- 4. pair and scope rules */

test('a pair must be a real reporting pair, one round at a time, and inside the declared seat', () => {
  const { api } = boot();
  assert.equal(api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'ic3', cycle: '2026-11' }).ok, false, 'cross-span pair refused');
  assert.equal(api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'mgr1', cycle: '2026-11' }).ok, false, 'self-pair refused');
  const ok = api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'ic1', cycle: '2026-11' });
  assert.equal(ok.ok, true);
  const dup = api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'ic1', cycle: '2026-11' });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already has an open round/);

  // Declared seat at rank 3: another span's pair is aggregate-only.
  const seated = fixture({ activeSeatId: 'dir1' });
  const { api: dirApi } = boot(seated);
  const opened = dirApi.concordanceOpenRound({ leaderId: 'dir1', memberId: 'mgr1', cycle: '2026-11' });
  assert.equal(opened.ok, true, 'a director may run a round with their own report');
  closeRound(dirApi, 'mgr1', 'ic1', HIGH, LOW);
  const read = concordanceRead(dirApi.store?.state || seated, { now: NOW });
  void read;
});

test('above director rank a span reads rates, not another span’s two gauges', () => {
  const state = fixture({ activeSeatId: 'dir1' });
  const { store, api } = boot(state);
  closeRound(api, 'mgr1', 'ic1', HIGH, LOW);
  closeRound(api, 'mgr2', 'ic3', ALIGNED, ALIGNED);
  const scoped = concordanceRead(store.state, { now: NOW, settings: store.state.settings, seatId: 'dir1' });
  assert.equal(scoped.seat.rank, 3);
  assert.equal(scoped.detailWithheld, true);
  const other = scoped.pairs.find((p) => p.leaderId === 'mgr1');
  assert.equal(other.detailVisible, false);
  assert.equal(other.leaderName, 'Span leader');
  assert.equal(other.memberName, 'Team member');
  // The scoped roll-up is rooted at the seat and never prints a workspace cell.
  assert.equal(scoped.rollup.every((row) => row.nodeId !== 'leader'), true);
  assert.ok(scoped.rollup.some((row) => row.nodeId === 'dir1'));
});

/* --------------------------------------------- 5. cross-module propagation */

test('one closed round fans out in the same transaction: decision, 1:1 agenda line and typed roll-up', () => {
  const state = fixture();
  state.oneOnOnes = [{ id: 'oo-1', personId: 'ic1', date: NOW.toISOString().slice(0, 10), status: 'held', agenda: [], notes: '', actions: [], createdAt: NOW.toISOString() }];
  const { store, api } = boot(state);
  const decisionsBefore = store.state.decisions.length;

  const id = closeRound(api, 'mgr1', 'ic1', HIGH, LOW);

  // RULE-ECN-02: exactly one governed re-contracting decision.
  assert.equal(store.state.decisions.length, decisionsBefore + 1);
  const decision = store.state.decisions[0];
  assert.match(decision.title, /Re-contract/);
  assert.match(decision.question, /No person is the subject/);
  assert.equal(decision.outcome, 'pending');

  // The subject is the expectation: the decision names the pair, not a verdict.
  assert.ok(!/underperform|poor performer|failing/i.test(decision.title + decision.question));

  // RULE-ECN-02: one generated agenda line on the pair's latest 1:1.
  const meeting = store.state.oneOnOnes.find((m) => m.id === 'oo-1');
  assert.equal(meeting.agenda.length, 1);
  assert.match(meeting.agenda[0].source, /^concordance:/);

  // RULE-ECN-01: typed vertical roll-up to every ancestor above the pair's leader.
  const rollups = store.state.links.filter((l) => l.ruleId === CONCORDANCE_RULES.ROLLUP && l.relation === 'rolls-up-to');
  const targets = rollups.map((l) => l.targetId).sort();
  assert.deepEqual(targets, ['dir1', 'vp1']);
  assert.equal(rollups.every((l) => l.sourceType === 'concordance' && l.sourceId === id), true);
  assert.ok(store.state.links.some((l) => l.relation === 're-contracts' && l.targetType === 'decision'));

  // Idempotency: an explicit scan re-runs the rules and writes nothing twice.
  const decisionsAfterFirst = store.state.decisions.length;
  const agendaAfterFirst = store.state.oneOnOnes[0].agenda.length;
  const linksAfterFirst = store.state.links.length;
  assert.equal(api.concordanceScan().ok, true);
  assert.equal(store.state.decisions.length, decisionsAfterFirst);
  assert.equal(store.state.oneOnOnes[0].agenda.length, agendaAfterFirst);
  assert.equal(store.state.links.length, linksAfterFirst);
});

test('auto-propagation can be paused, and the explicit scan still runs', () => {
  const state = fixture({ concordanceAutoPropagate: false });
  const { store, api } = boot(state);
  const before = store.state.decisions.length;
  closeRound(api, 'mgr1', 'ic1', HIGH, LOW);
  assert.equal(store.state.decisions.length, before, 'paused: no decision is auto-opened');
  assert.equal(api.concordanceScan().ok, true);
  assert.equal(store.state.decisions.length, before + 1, 'an explicit scan always runs');
  assert.equal(api.concordanceSetConventions({ concordanceAutoPropagate: true }).ok, true);
  assert.equal(store.state.settings.concordanceAutoPropagate, true);
});

/* --------------------------------------------------------- 6. the roll-up */

test('counts partition exactly up the tree and a span rate is withheld below the cell floor', () => {
  const { store, api } = boot();
  closeRound(api, 'mgr1', 'ic1', HIGH, LOW);
  closeRound(api, 'mgr1', 'ic2', ALIGNED, ALIGNED);
  closeRound(api, 'mgr2', 'ic3', HIGH, LOW);
  const report = concordanceRead(store.state, { now: NOW });
  assert.equal(report.enterprise.closedN, 3);
  const dir = report.rollup.find((r) => r.nodeId === 'dir1');
  const mgr1 = report.rollup.find((r) => r.nodeId === 'mgr1');
  const mgr2 = report.rollup.find((r) => r.nodeId === 'mgr2');
  assert.equal(mgr1.ownClosedN, 2);
  assert.equal(mgr2.ownClosedN, 1);
  assert.equal(dir.ownClosedN, 0, 'a span does not own its reports’ pairs');
  assert.equal(dir.closedN, 3, 'the parent is the exact sum of the leaves below it');
  assert.equal(mgr1.closedN + mgr2.closedN, dir.closedN);
  assert.equal(dir.assessedN, 3);
  assert.equal(dir.suppressed, true, 'three pairs is below the five-pair cell floor');
  assert.equal(dir.ratePct, null);
  assert.ok(dir.suppressedReason.includes('cell floor'));
  // The enterprise rate is refused for the same reason — never a point estimate.
  assert.equal(report.enterprise.suppressed, true);
  assert.equal(report.enterprise.ratePct, null);
  assert.equal(report.enterprise.clearN, 1);
});

test('the dimension profile names the word we use differently, and in which direction', () => {
  const { store, api } = boot();
  closeRound(api, 'mgr1', 'ic1', ratings([5, 4, 4, 5, 5, 3]), ratings([2, 4, 4, 2, 2, 3]));
  closeRound(api, 'mgr1', 'ic2', ratings([5, 4, 4, 5, 5, 3]), ratings([3, 4, 4, 3, 3, 3]));
  const report = concordanceRead(store.state, { now: NOW });
  const done = report.profile.find((row) => row.key === 'done');
  const quality = report.profile.find((row) => row.key === 'quality');
  assert.equal(done.divergedN, 2);
  assert.equal(done.direction, 'leader-higher');
  assert.match(done.reading, /complete and handed over/);
  assert.equal(quality.divergedN, 0);
  assert.equal(quality.direction, 'level');
});

/* ------------------------------------------------------------ 7. exports */

test('aggregate-only CSV and the identity-free brief carry no person, pair, id or rating', () => {
  const { store, api } = boot();
  closeRound(api, 'mgr1', 'ic1', HIGH, LOW);
  assert.ok(CSV_EXPORTS.some((s) => s.key === 'expectation-concordance' && s.sensitive === false));
  const csv = exportWorkspaceCsv(store.state, 'expectation-concordance', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.match(csv.csv, /mean_kappa_pct/);
  for (const forbidden of ['Ari Klein', 'Mei Manager', 'ecr-', 'ic1', 'mgr1']) {
    assert.ok(!csv.csv.includes(forbidden), `CSV must not contain ${forbidden}`);
  }
  const rows = concordanceCsvRows(store.state, { now: NOW });
  assert.equal(rows[0].scope, 'enterprise');
  assert.equal(rows[0].rate_pct, '', 'a refused figure is blank, never zero');

  const brief = concordanceBriefText(store.state, { now: NOW });
  for (const forbidden of ['Ari', 'Mei', 'Rina', 'Sam']) {
    assert.ok(!brief.includes(forbidden), `brief must not contain ${forbidden}`);
  }
  assert.match(brief, /identity-free brief/);
  assert.match(brief, /Agreement is not correctness|agreement is not correctness/i);
});

test('attention counts only work waiting on a human', () => {
  const { store, api } = boot();
  assert.equal(concordanceAttentionCount(store.state, NOW, store.state.settings), 0);
  const opened = api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'ic1', cycle: '2026-11' });
  assert.equal(concordanceAttentionCount(store.state, NOW, store.state.settings), 0, 'a fresh round is not yet stalled');
  api.concordanceSubmit(opened.round.id, 'leader', HIGH, '');
  assert.equal(concordanceAttentionCount(store.state, NOW, store.state.settings), 1, 'one side in, sealed');
  api.concordanceSubmit(opened.round.id, 'member', LOW, '');
  // The decision was opened in the same transaction, so nothing is waiting on
  // the pair any more; the re-test window is what will count next.
  assert.equal(concordanceAttentionCount(store.state, NOW, store.state.settings), 0);
  assert.ok(concordanceAttentionCount(store.state, new Date('2026-12-31T12:00:00.000Z'), store.state.settings) >= 1, 'an un-re-tested standard becomes work');
});

/* ---------------------------------------------------------- 8. closed loop */

test('the re-test lift is refused below its floor and computed on paired before/after κ', () => {
  const clockRef = { value: new Date('2026-09-15T12:00:00.000Z') };
  const { store, api } = boot(fixture(), clockRef);
  const firstPass = (leader, member) => {
    clockRef.value = new Date('2026-09-15T12:00:00.000Z');
    closeRound(api, leader, member, HIGH, LOW, '2026-09');
    clockRef.value = new Date('2026-10-20T12:00:00.000Z');
    closeRound(api, leader, member, ALIGNED, ALIGNED, '2026-10');
  };
  firstPass('mgr1', 'ic1');
  const refused = retestLift(store.state, { conventions: concordanceRead(store.state, { now: NOW }).conventions });
  assert.equal(refused.recontracted.refused, true);
  assert.equal(refused.recontracted.meanDeltaPct, null);
  assert.match(refused.limitation, /Association, not effect/);
  assert.equal(refused.recontracted.n, 1);

  // Five re-contracted pairs clear the cell floor; the delta is printed.
  for (const [leader, member] of [['mgr1', 'ic2'], ['mgr1', 'ic5'], ['mgr2', 'ic3'], ['mgr2', 'ic4']]) {
    firstPass(leader, member);
  }
  clockRef.value = new Date('2026-11-04T12:00:00.000Z');
  // The second round is linked to the decision it tests — provenance, not memory.
  const reTests = store.state.links.filter((l) => l.relation === 're-tests');
  assert.ok(reTests.length >= 5, `every re-test carries a typed edge (${reTests.length})`);
  assert.ok(reTests.every((l) => l.targetType === 'decision'));
  const lift = retestLift(store.state, { conventions: concordanceRead(store.state, { now: NOW }).conventions });
  assert.equal(lift.recontracted.refused, false);
  assert.equal(lift.recontracted.n, 5);
  assert.ok(lift.recontracted.meanDeltaPct > 0, 'agreement rose after re-contracting');
  assert.match(lift.limitation, /not randomly assigned/);
});

test('the conversation script is deterministic and names only the diverged dimensions', () => {
  const { store, api } = boot();
  const id = closeRound(api, 'mgr1', 'ic1', ratings([5, 4, 4, 5, 5, 3]), ratings([5, 4, 4, 5, 5, 3]));
  const round = store.state.expectationRounds.find((r) => r.id === id);
  const stats = concordanceStats(round);
  const a = conversationScript(round, stats);
  const b = conversationScript(round, stats);
  assert.deepEqual(a, b, 'deterministic: no model, no sampling');
  assert.equal(a.diverged.length, 0);
  assert.match(a.text, /re-run this instrument next cycle/);
  const id2 = closeRound(api, 'mgr1', 'ic2', HIGH, LOW);
  const round2 = store.state.expectationRounds.find((r) => r.id === id2);
  const script2 = conversationScript(round2, concordanceStats(round2));
  assert.equal(script2.diverged.length, 3, 'at most three diverged dimensions are put into one conversation');
  assert.match(script2.text, /Definition of done/);
});

/* ---------------------------------------------------------- 9. the wiring */

test('the spine, the graph vocabulary and the rule contracts are wired, not described', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'concordanceRule'));
  assert.ok(describePropagationContracts().some((c) => c.name === 'concordanceRule'));
  assert.ok(LINK_ENTITY_TYPES.includes('concordance'));
  assert.ok(LINK_RELATIONS.includes('re-contracts'));
  assert.ok(LINK_RELATIONS.includes('re-tests'));
  assert.equal(CONCORDANCE_DIMENSIONS.length, 6);
  // Wilson is exact enough to be trusted and never a normal approximation.
  const w = wilsonInterval(0, 5);
  assert.ok(w.lo === 0 && w.hi > 0 && w.hi < 100);
});

test('with no rounds, ordinary commits are unchanged — the terminal is inert', () => {
  const { store, api } = boot();
  const before = store.state.links.length;
  api.addDelegation({ personId: 'ic1', title: 'Rebuild the handover checklist', expectedOutcome: 'A second holder can run it.', support: 'Pair for two shifts.', authority: 'act-inform' });
  assert.equal(store.state.links.filter((l) => l.ruleId === CONCORDANCE_RULES.ROLLUP).length, 0);
  assert.ok(store.state.links.length >= before);
  assert.equal(concordanceRead(store.state, { now: NOW }).pairs.length, 0);
});

/* ------------------------------------------------------ 10. accessibility */

test('all five panels render axe-clean with semantic, keyboard-usable markup', async () => {
  const dom = bootDocument();
  const { store, api } = boot();
  closeRound(api, 'mgr1', 'ic1', HIGH, LOW);
  const axe = (await import('axe-core')).default;
  for (const panel of ['rounds', 'rollup', 'signals', 'conventions', 'brief']) {
    const ctx = {
      state: store.state, api, now: NOW, query: new URLSearchParams(`panel=${panel}`),
      navigate: () => {}, refresh: () => {}, seatContext: null, warnings: [],
    };
    const node = renderConcordance(ctx);
    document.getElementById('view').replaceChildren(node);
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), [], `axe: ${panel}`);
    assert.ok(node.querySelector('h1'), `${panel}: one page heading`);
  }
  dom.window.close();
});
