/**
 * ADR-0085 — The Board Room (Schema v91).
 *
 * Proves, against the REAL store, the REAL rule spine and the REAL modules:
 *  - the chief altitude's declared duty route `#/board` exists and is enterprise
 *    material: an executive seat reads it, a director seat does not, and only the
 *    chief may commit or freeze;
 *  - a claim is adjudicated on the CONSERVATIVE end of its interval — holding,
 *    failing, inconclusive, withheld and refused are each reachable and each
 *    carries a printed reason;
 *  - pre-registration is enforced in the record: a threshold moved after a
 *    recorded look is marked post-hoc forever, and a claim cannot be removed
 *    after a look;
 *  - a committed memo freezes its verdicts and, in the SAME transaction, opens a
 *    governed decision per failing claim and delegates one owned obligation to
 *    the span the failing reading points at — chief → director downward, with
 *    typed `summarizes-span` provenance back up;
 *  - the span decomposition sums EXACTLY to the claim's own denominator, and a
 *    partition that does not is reported as broken rather than drawn;
 *  - two modules disagreeing is a finding, and no composite score exists;
 *  - the memo text and the aggregate CSV carry no memo id, operator, note, span
 *    name or person, and every refused figure is BLANK rather than zero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate, MIGRATIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, contractFor } from '../../app/core/domain/propagationContracts.js';
import {
  boardRead, boardEvaluateMemo, boardEvaluateClaim, boardPartition, boardMeasure,
  boardSources, boardWilson, boardRequiredSample, boardConventions,
  boardMemoText, boardCsvRows, boardAttentionCount, boardFingerprint,
} from '../../app/core/domain/board.js';
import { boardRule } from '../../app/core/domain/boardRules.js';
import { normalizeBoardMemo, normalizeBoardMemos, normalizeBoardSettings } from '../../app/core/domain/boardSchema.js';
import {
  BOARD_CLAIMS, BOARD_CLAIM_KEYS, BOARD_CROSS_CHECKS, BOARD_RULES, BOARD_TAGS,
} from '../../app/core/domain/boardRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderBoard } from '../../app/views/board.js';
import { LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { routeVerdict, actionVerdict } from '../../app/core/domain/seatRegistry.js';
import { workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { parseRoute, NAV } from '../../app/main.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');

function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Root',
    chainLeaderAltitude: 'chief',
    activeSeatId: null,
    ...overrides,
  };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'dir2', name: 'Tove Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'mgr2', name: 'Ola Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    { id: 'ic4', name: 'Dee Sorensen', role: 'Operator', level: 'ic', managerId: 'mgr2', status: 'active' },
    { id: 'ic5', name: 'Eli Brandt', role: 'Operator', level: 'ic', managerId: 'dir1', status: 'active' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture()) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const now = () => NOW;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now, idFactory });
  store.load();
  return { store, api: createApi(store, { now, idFactory }) };
}

function bootDocument() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e?.message || e)));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return { dom, errors };
}

/* ---------------------------------------------------------------- fixtures */

const memoSkeleton = (claims = BOARD_CLAIMS.map((c) => ({
  key: c.key, comparator: c.comparator, unit: c.unit, threshold: c.defaultThreshold,
  declaredAt: NOW.toISOString(), declaredBy: null, lookedAt: null, lastLookAt: null,
  revisedAfterLook: false, revisionCount: 0, note: '',
}))) => ({
  id: 'brm-synthetic',
  revision: 1,
  title: 'Synthetic memo',
  cycle: '2026-Q4',
  status: 'draft',
  ownerNodeId: null,
  ownerSeatId: null,
  claims,
  snapshot: null,
  lookCount: 0,
  lastLookAt: null,
  openedAt: NOW.toISOString(),
  openedBy: null,
  committedAt: null,
  frozenAt: null,
  supersededAt: null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

const spanSet = (covered, total) => Array.from({ length: total }, (_, i) => ({
  nodeId: `span-${i + 1}`,
  name: `Span ${i + 1}`,
  altitude: i % 2 ? 'director' : 'manager',
  rank: i % 2 ? 3 : 2,
  quotable: true,
  verdict: i < covered ? 'covered' : 'concentrated',
  membersN: 4,
  itemsN: 6,
  blockedN: 0,
}));

function syntheticSources(overrides = {}) {
  return {
    succession: { spans: [], certification: { pLower: null, refused: null } },
    solvency: { counts: { open: 0, overdue: 0 } },
    authority: { totalTrials: 0, totalCompleted: 0, overallRefused: true, conv: { floorN: 5 }, altitudeReadings: [] },
    concordance: { pairs: [] },
    health: { overall: null, dimensions: [], coverage: 0, label: 'No dimension scored.' },
    seal: { enabled: false, blocks: 0, verification: { chainValid: false, contentValid: false, breaks: [] } },
    sceptic: { counts: { claims: 0, examined: 0 } },
    ...overrides,
  };
}

const verdictOf = (evaluation, key) => evaluation.rows.find((row) => row.key === key);

/* ------------------------------------------------------------ schema/wiring */

test('schema v91 (main) then v92/v93: board collections arrive additively', () => {
  assert.equal(SCHEMA_VERSION, 103);
  assert.equal(typeof MIGRATIONS[90], 'function');
  const before = { ...createEmptyState(NOW.toISOString()), schemaVersion: 90 };
  delete before.boardMemos;
  delete before.boardMarkers;
  const migrated = migrate(before);
  assert.deepEqual(migrated.applied, ['90 → 91', '91 → 92', '92 → 93', '93 → 94', '94 → 95', '95 → 96', '96 → 97', '97 → 98', '98 → 99', '99 → 100', '100 → 101', '101 → 102', '102 → 103'], 'each step additive');
  assert.equal(migrated.raw.schemaVersion, 103);
  assert.deepEqual(migrated.raw.boardMemos, []);
  assert.deepEqual(migrated.raw.boardMarkers, []);
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(normalized.schemaVersion, 103);
  assert.equal(normalized.settings.boardCellFloor, 5);
  assert.equal(normalized.settings.boardEvidenceFloor, 4);
  assert.equal(normalized.settings.boardMaterialityPct, 10);
  assert.equal(normalized.settings.boardRecheckDays, 90);
  assert.equal(normalized.settings.boardAutoPropagate, true);
});

test('the register is coherent: seven claims, three cross-checks, every reference real', () => {
  assert.equal(BOARD_CLAIMS.length, 7);
  assert.equal(BOARD_CLAIM_KEYS.length, new Set(BOARD_CLAIM_KEYS).size);
  for (const claim of BOARD_CLAIMS) {
    assert.ok(['pct', 'score', 'binary'].includes(claim.unit), `${claim.key} unit`);
    assert.ok(['gte', 'lte'].includes(claim.comparator), `${claim.key} comparator`);
    assert.ok(claim.defaultThreshold >= 0 && claim.defaultThreshold <= 100, `${claim.key} threshold`);
    assert.ok(claim.route.startsWith('#/'), `${claim.key} route`);
    assert.ok(claim.cost.length > 20, `${claim.key} cost`);
  }
  for (const check of BOARD_CROSS_CHECKS) {
    assert.ok(BOARD_CLAIM_KEYS.includes(check.left), `${check.key} left claim exists`);
    assert.ok(check.right && check.route.startsWith('#/'), `${check.key} right source`);
  }
  assert.deepEqual(Object.keys(BOARD_TAGS).sort(), ['asserted', 'attested', 'recomputed', 'refused', 'withheld']);
});

test('the graph vocabulary covers the memo: type, collection and both relations', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('boardmemo'));
  assert.equal(LINK_ENTITY_COLLECTIONS.boardmemo, 'boardMemos');
  assert.ok(LINK_RELATIONS.includes('summarizes-span'));
  assert.ok(LINK_RELATIONS.includes('escalates-from'));
  // Exhaustive both ways: every declared type names a collection.
  for (const type of LINK_ENTITY_TYPES) assert.ok(type in LINK_ENTITY_COLLECTIONS, `${type} has a collection entry`);
});

test('the rule is on the shared spine, has an auditable contract, and cannot outrun the seal', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, '1:1 rule/contract parity');
  // This is a tripwire, not a contract: it makes any session that adds a rule
  // state the new total deliberately. It read 71 on `main` while the spine was
  // already at 75 (the count had drifted stale across ADR-0089/0090/0091), so it
  // was failing before that session; ADR-0092 brought it to 76, ADR-0094
  // (RULE-PIC-01..04) to 77 and ADR-0095 (RULE-RAL-01..04, one rule on the shared
  // spine) brings it to 78.
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 82, 'the shared spine includes cadence, Strategy Cycle (RULE-SCR), Envoy (RULE-ENV), Federation (RULE-FED), Differencing (RULE-DFR), the Prospective Contract (RULE-PIC), the Robust Allocation Terminal (RULE-RAL), the Internal Clearinghouse (RULE-CLR), the Discretion Calibrator (RULE-SPC) and the Reputational Capital Ledger (RULE-RCL)');
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(boardRule));
  const contract = contractFor(boardRule);
  assert.ok(contract, 'boardRule has a declared contract');
  assert.equal(contract.module, 'boardRules.js');
  assert.match(contract.purpose, /RULE-BRD-01/);
  assert.deepEqual(contract.writes, ['boardMarkers', 'decisions', 'delegations', 'links']);
  const index = DEFAULT_POST_COMMIT_RULES.indexOf(boardRule);
  assert.ok(index < DEFAULT_POST_COMMIT_RULES.indexOf(DEFAULT_POST_COMMIT_RULES.find((r) => r.name === 'attentionMarketRule')), 'board runs before the market');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).name, 'sealRule', 'the seal stays absolutely last');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2).name, 'seatRule', 'the seat stays second-last');
});

test('the route exists, is enterprise material, and is reachable from the nav', () => {
  const parsed = parseRoute('#/board?panel=rollup');
  assert.equal(parsed.route, 'board');
  assert.equal(parsed.query.get('panel'), 'rollup');
  assert.equal(parseRoute('#/board-pack').route, 'board', 'alias resolves');
  const item = NAV.flatMap((group) => group.items).find((i) => i.route === 'board');
  assert.ok(item, 'nav carries the Board Room');
  assert.equal(item.badge, 'board');
  assert.equal(item.label, 'Board Room');

  const built = buildSeats(fixture(), { now: NOW });
  const byRank = (rank) => [...built.byId.values()].find((s) => !s.fullAccess && s.rank === rank);
  const director = byRank(3);
  const exec = byRank(4);
  const chief = byRank(5);
  assert.equal(routeVerdict('board', exec).allow, true, 'executive may read the pack');
  assert.equal(workspaceRouteVerdict('board', exec).allow, true, 'the pack completed its seat-scoped read audit');
  assert.equal(routeVerdict('board', director).allow, false, 'director is below the enterprise floor');
  assert.match(routeVerdict('board', director).reason, /floor is rank 4/);
  assert.equal(actionVerdict('declare-board-line', exec).allow, false, 'only the chief commits');
  assert.equal(actionVerdict('declare-board-line', chief).allow, true);
  assert.equal(actionVerdict('freeze-board-summary', chief).allow, true);
});

test('CSV scope #80 exists and refuses to guess', () => {
  assert.equal(CSV_EXPORTS.length, 97);
  const scope = CSV_EXPORTS.find((s) => s.key === 'board-claims');
  assert.ok(scope);
  assert.equal(scope.sensitive, false);
  assert.match(scope.description, /BLANK rather than zero/);
});

/* ---------------------------------------------------------- interval maths */

test('Wilson intervals match the analytic values, including the degenerate end', () => {
  const zero = boardWilson(0, 5);
  assert.equal(zero.lower, 0);
  assert.ok(Math.abs(zero.upper - 43.4) < 0.15, `0/5 upper ≈ 43.4, got ${zero.upper}`);
  const four = boardWilson(4, 5);
  assert.ok(Math.abs(four.lower - 37.6) < 0.2, `4/5 lower ≈ 37.6, got ${four.lower}`);
  assert.ok(Math.abs(four.upper - 96.4) < 0.2, `4/5 upper ≈ 96.4, got ${four.upper}`);
  assert.deepEqual(boardWilson(0, 0), { lower: null, upper: null });
  const half = boardWilson(50, 100);
  assert.ok(half.lower > 39 && half.lower < 41 && half.upper > 59 && half.upper < 61, `50/100 ≈ 40–60, got ${half.lower}–${half.upper}`);
});

test('the settling sample inverts the interval and refuses a claim exactly on its line', () => {
  assert.equal(boardRequiredSample({ valuePct: 50, thresholdPct: 60 }), 97);
  assert.equal(boardRequiredSample({ valuePct: 60, thresholdPct: 60 }), null, 'no sample settles a coin exactly fair');
  assert.ok(boardRequiredSample({ valuePct: 40, thresholdPct: 50 }) > 90);
});

/* ------------------------------------------------------------- adjudication */

test('a claim HOLDS only when the conservative end of its interval clears the floor', () => {
  const sources = syntheticSources({ succession: { spans: spanSet(10, 10), certification: { pLower: 5 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'bench-coverage');
  assert.equal(row.verdict, 'holding');
  assert.equal(row.value, 100);
  assert.ok(row.lower >= 60, `conservative end ${row.lower} clears 60`);
  assert.match(row.reason, /conservative end of the interval/);
});

test('a claim FAILS only when even the optimistic end misses — and materiality is measured below the line', () => {
  const sources = syntheticSources({ succession: { spans: spanSet(0, 10), certification: { pLower: 5 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'bench-coverage');
  assert.equal(row.verdict, 'failing');
  assert.ok(row.upper < 60, `optimistic end ${row.upper} still misses 60`);
  assert.equal(row.material, true, '0% against a 60% floor is a material miss');
  assert.equal(row.missPp, 60);
});

test('a straddling interval is INCONCLUSIVE, and the terminal computes what would settle it', () => {
  const sources = syntheticSources({ succession: { spans: spanSet(5, 10), certification: { pLower: 5 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'bench-coverage');
  assert.equal(row.verdict, 'inconclusive');
  assert.ok(row.lower < 60 && row.upper > 60, `interval ${row.lower}–${row.upper} straddles 60`);
  assert.ok(row.requiredN > row.n, 'more observations than the workspace has');
  assert.match(row.reason, /straddles/);
});

test('below the declared floor the rate is WITHHELD and only counts print', () => {
  const sources = syntheticSources({ succession: { spans: spanSet(3, 3), certification: { pLower: 1 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'bench-coverage');
  assert.equal(row.verdict, 'withheld');
  assert.equal(row.tag, 'withheld');
  assert.equal(row.value, null, 'no figure at all');
  assert.equal(row.n, 3);
  assert.match(row.reason, /declared floor of 5/);
});

test('a source that produces nothing is REFUSED with its reason, never zero-filled', () => {
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources: syntheticSources() });
  for (const key of ['bench-coverage', 'promise-reliability', 'authority-hold', 'expectation-alignment', 'record-integrity']) {
    const row = verdictOf(evaluation, key);
    assert.equal(row.verdict, 'refused', `${key} refused`);
    assert.equal(row.value, null, `${key} has no value`);
    assert.ok(row.reason.length > 20, `${key} prints why`);
  }
});

test('a claim with no declared threshold is refused rather than measured against a default', () => {
  const claims = memoSkeleton().claims.map((c) => (c.key === 'bench-coverage' ? { ...c, threshold: null } : c));
  const sources = syntheticSources({ succession: { spans: spanSet(9, 10), certification: { pLower: 1 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(claims), { now: NOW, sources });
  const row = verdictOf(evaluation, 'bench-coverage');
  assert.equal(row.verdict, 'refused');
  assert.match(row.reason, /No threshold was declared/);
});

test('an exact fact is tested exactly and says so: a broken chain fails, tagged attested', () => {
  const seal = { enabled: true, blocks: 12, activeMode: 'hash', chainHead: 'abc', verification: { chainValid: false, contentValid: true, breaks: [{ reason: 'chain-break' }] } };
  const sources = syntheticSources({ seal });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'record-integrity');
  assert.equal(row.verdict, 'failing');
  assert.equal(row.value, 0);
  assert.equal(row.tag, 'attested', 'a figure whose chain does not verify cannot claim recomputed');
  assert.equal(evaluation.attestation.verified, false);
});

/* ---------------------------------------------------------- cross-examination */

test('a coverage count can pass while the flow says a gap is likely — the discrepancy fires', () => {
  const sources = syntheticSources({
    succession: { spans: spanSet(10, 10), certification: { pLower: 40, method: 'union bound' } },
  });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  assert.equal(verdictOf(evaluation, 'bench-coverage').verdict, 'holding');
  const check = evaluation.discrepancies.find((c) => c.key === 'bench-count-vs-flow');
  assert.equal(check.triggered, true);
  assert.match(check.finding, /40% likely/);
});

test('a reliability rate beside a book with overdue promises is a discrepancy, not a green light', () => {
  const sources = syntheticSources({ solvency: { counts: { open: 100, overdue: 2 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const promise = verdictOf(evaluation, 'promise-reliability');
  assert.equal(promise.verdict, 'holding', `98% of 100 holds, got ${promise.verdict}`);
  const check = evaluation.discrepancies.find((c) => c.key === 'promise-rate-vs-book');
  assert.equal(check.triggered, true);
  assert.match(check.finding, /2 promise\(s\) are already past their own date/);
});

test('a verified chain with nothing examined is a discrepancy: non-alteration is not truth', () => {
  const sources = syntheticSources({
    seal: { enabled: true, blocks: 30, activeMode: 'hash', verification: { chainValid: true, contentValid: true, breaks: [] } },
    sceptic: { counts: { claims: 14, examined: 0 } },
  });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  assert.equal(verdictOf(evaluation, 'record-integrity').verdict, 'holding');
  const check = evaluation.discrepancies.find((c) => c.key === 'integrity-vs-examination');
  assert.equal(check.triggered, true);
  assert.match(check.finding, /unaltered record is not a true one/);
});

test('agreement is reported as agreement — and as evidence, not proof', () => {
  const sources = syntheticSources({
    succession: { spans: spanSet(20, 20), certification: { pLower: 2 } },
    solvency: { counts: { open: 100, overdue: 0 } },
    seal: { enabled: true, blocks: 30, activeMode: 'hash', verification: { chainValid: true, contentValid: true, breaks: [] } },
    sceptic: { counts: { claims: 14, examined: 9 } },
  });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  assert.equal(evaluation.counts.discrepancies, 0);
  assert.ok(evaluation.discrepancies.every((c) => c.triggered === false));
});

/* ------------------------------------------------------------- decomposition */

test('the span partition sums EXACTLY to the claim denominator', () => {
  const contributions = [
    { nodeId: 'dir1', ok: false },
    { nodeId: 'dir1', ok: true },
    { nodeId: 'mgr1', ok: true },
    { nodeId: 'mgr2', ok: false },
    { nodeId: 'mgr2', ok: false },
  ];
  const sources = syntheticSources({ concordance: { pairs: contributions.map((c, i) => ({ nodeId: c.nodeId, key: `pair-${i}`, latestStats: { kappaPct: c.ok ? 90 : 10, clearsFloor: c.ok, refused: false } })) } });
  const evaluation = boardEvaluateMemo(fixture(), memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'expectation-alignment');
  const partition = row.partition;
  assert.equal(partition.dimension, 'span');
  assert.equal(partition.rows.length, 3, 'three spans contributed');
  assert.equal(partition.totals.n, row.n, 'every observation counted once');
  assert.equal(partition.totals.n, contributions.length);
  assert.equal(partition.reconciles, true);
  const failures = partition.rows.reduce((sum, r) => sum + (r.n - r.successes), 0);
  assert.equal(failures, 3, 'the failing observations are preserved across rows');
});

test('a partition that does not add up is reported as BROKEN, never drawn', () => {
  const row = { key: 'expectation-alignment', n: 9, successes: 4, contributions: [{ nodeId: 'dir1', ok: true }, { nodeId: 'mgr1', ok: false }], comparator: 'gte' };
  const partition = boardPartition(fixture(), row, { now: NOW });
  assert.equal(partition.reconciles, false);
  assert.match(partition.reason, /BROKEN ROLL-UP/);
  assert.equal(partition.totals.n, 2);
});

test('a workspace-level claim refuses to be decomposed rather than printing a team figure it never measured', () => {
  const sources = syntheticSources({ seal: { enabled: true, blocks: 4, activeMode: 'hash', verification: { chainValid: true, contentValid: true, breaks: [] } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  const row = verdictOf(evaluation, 'record-integrity');
  assert.equal(row.partition.dimension, 'none');
  assert.equal(row.partition.rows.length, 0);
  assert.match(row.partition.reason, /workspace-level reading/);
});

/* ------------------------------------------------------- the unasked question */

test('the unasked question targets the claim a little evidence would settle', () => {
  const sources = syntheticSources({ succession: { spans: spanSet(5, 10), certification: { pLower: 1 } } });
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources });
  assert.equal(evaluation.unasked.kind, 'settle');
  assert.equal(evaluation.unasked.claimKey, 'bench-coverage');
  assert.match(evaluation.unasked.action, /Collect about/);
});

test('with everything refused, the unasked question is the number this organisation cannot produce', () => {
  const evaluation = boardEvaluateMemo({ people: [], settings: {} }, memoSkeleton(), { now: NOW, sources: syntheticSources() });
  assert.equal(evaluation.unasked.kind, 'produce');
  assert.match(evaluation.unasked.action, /never becomes a small one/);
});

test('with nothing failing and nothing unsettled, the memo refuses to call that health', () => {
  const sources = syntheticSources({
    succession: { spans: spanSet(20, 20), certification: { pLower: 1 } },
    solvency: { counts: { open: 100, overdue: 0 } },
    authority: { totalTrials: 50, totalCompleted: 45, overallRefused: false, conv: { floorN: 5 }, altitudeReadings: [] },
    concordance: {
      pairs: Array.from({ length: 20 }, (_, i) => ({ nodeId: 'dir1', key: `pair-${i}`, latestStats: { kappaPct: 80, clearsFloor: true, refused: false } })),
    },
    health: { overall: 70, dimensions: [{ score: 70 }, { score: 70 }, { score: 70 }], coverage: 0.6 },
    seal: { enabled: true, blocks: 5, activeMode: 'hash', verification: { chainValid: true, contentValid: true, breaks: [] } },
    sceptic: { counts: { claims: 4, examined: 2 } },
  });
  const state = { people: [], settings: {}, oneOnOnes: [{ date: '2026-10-01' }, { date: '2026-10-08' }, { date: '2026-10-15' }] };
  const evaluation = boardEvaluateMemo(state, memoSkeleton(), { now: NOW, sources });
  assert.ok(evaluation.rows.every((r) => !['failing', 'inconclusive'].includes(r.verdict)));
  assert.equal(evaluation.unasked.kind, 'none');
  assert.match(evaluation.unasked.why, /proof that the thresholds were chosen by the same people being measured/);
});

/* ----------------------------------------------------------- normalisation */

test('a hostile blob cannot produce a claim, a direction flip or a committed memo', () => {
  const warnings = [];
  const memo = normalizeBoardMemo({
    id: 'brm-hostile',
    status: 'committed',
    committedAt: NOW.toISOString(),
    claims: [
      { key: 'not-a-claim', threshold: 50 },
      { key: 'bench-coverage', threshold: 400, comparator: 'lte' },
      { key: 'bench-coverage', threshold: 70 },
      { key: 'record-integrity', threshold: 100 },
    ],
  }, warnings);
  assert.equal(memo.status, 'draft', 'committed without a snapshot is reopened');
  assert.equal(memo.snapshot, null);
  assert.deepEqual(memo.claims.map((c) => c.key), ['bench-coverage', 'record-integrity'], 'unknown key dropped, duplicate collapsed, registry order');
  assert.equal(memo.claims[0].threshold, 70, 'the out-of-range threshold became "not declared" and was replaced by the later valid one');
  assert.equal(memo.claims[0].comparator, 'gte', 'the registry owns the direction');
  assert.ok(warnings.some((w) => /undeclared claim/.test(w)));
  assert.ok(warnings.some((w) => /COMMITTED with no frozen snapshot/.test(w)));
});

test('conventions are clamped, and a boolean cannot become a number', () => {
  const conv = normalizeBoardSettings({ boardCellFloor: 0, boardEvidenceFloor: 999, boardMaterialityPct: 'x', boardRecheckDays: 4, boardAutoPropagate: 'yes' });
  assert.equal(conv.boardCellFloor, 5);
  assert.equal(conv.boardEvidenceFloor, 4);
  assert.equal(conv.boardMaterialityPct, 10);
  assert.equal(conv.boardRecheckDays, 90);
  assert.equal(conv.boardAutoPropagate, true);
});

test('the memo cap is applied by the read model without deleting anything', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ ...memoSkeleton(), id: `brm-${i}`, openedAt: `2026-11-0${i + 1}T00:00:00.000Z` }));
  const warnings = [];
  const capped = normalizeBoardMemos(rows, warnings, { cap: 3 });
  assert.equal(capped.length, 3);
  assert.equal(capped[0].id, 'brm-5', 'newest first');
  assert.ok(warnings.some((w) => /were not deleted/.test(w)));
});

/* -------------------------------------------------------------- the API flow */

function seedContexts(api) {
  const HIGH = { done: 5, quality: 5, priority: 4, autonomy: 4, escalate: 5, pace: 4 };
  const LOW = { done: 2, quality: 2, priority: 3, autonomy: 3, escalate: 2, pace: 3 };
  const divergentId = [];
  // Five divergent pairs inside the director's span: 0 of 5 clears the floor,
  // whose Wilson upper bound (43.4%) misses the 60% floor outright.
  for (const memberId of ['mgr1', 'mgr2', 'ic2', 'ic3', 'ic5']) {
    const round = api.concordanceOpenRound({ leaderId: 'dir1', memberId });
    assert.equal(round.ok, true, round.error || `divergent pair dir1→${memberId} opens`);
    api.concordanceSubmit(round.round.id, 'leader', HIGH);
    api.concordanceSubmit(round.round.id, 'member', LOW);
    divergentId.push(round.round.id);
  }
  // One aligned pair below the director: the partition therefore has two spans,
  // and the worst reading is still the director's.
  const aligned = api.concordanceOpenRound({ leaderId: 'mgr1', memberId: 'ic1' });
  assert.equal(aligned.ok, true, aligned.error || 'aligned pair opens');
  api.concordanceSubmit(aligned.round.id, 'leader', HIGH);
  api.concordanceSubmit(aligned.round.id, 'member', HIGH);
  return { divergentIds: divergentId, alignedId: aligned.round.id };
}

test('pre-registration: the look is recorded, a later threshold move is permanent', () => {
  const { api } = boot();
  const opened = api.boardOpenMemo({ title: 'Q4 pack', cycle: '2026-Q4' });
  assert.equal(opened.ok, true, opened.error || 'memo opens');
  const memoId = opened.memo.id;
  api.boardSetConventions({ boardCellFloor: 1, boardEvidenceFloor: 1 });
  assert.equal(opened.memo.claims.length, 7);
  assert.ok(opened.memo.claims.every((c) => c.lookedAt === null), 'nothing has been looked at');

  // Before the look: a move is a declaration, not a revision.
  const first = api.boardDeclareClaim(memoId, 'bench-coverage', 65);
  assert.equal(first.ok, true);
  let claim = first.memo.claims.find((c) => c.key === 'bench-coverage');
  assert.equal(claim.threshold, 65);
  assert.equal(claim.revisedAfterLook, false);
  assert.equal(claim.lookedAt, null);

  seedContexts(api);
  const looked = api.boardLook(memoId);
  assert.equal(looked.ok, true, looked.error || 'look succeeds');
  assert.equal(looked.counts.evaluated >= 1, true, 'the concordance claim is evaluable');

  const moved = api.boardDeclareClaim(memoId, 'bench-coverage', 55);
  assert.equal(moved.ok, true);
  claim = moved.memo.claims.find((c) => c.key === 'bench-coverage');
  assert.equal(claim.threshold, 55);
  assert.equal(claim.revisedAfterLook, true, 'the mark is set');
  assert.ok(claim.lookedAt, 'the look that set it is recorded');
  assert.equal(claim.revisionCount, 2);

  const removal = api.boardRemoveClaim(memoId, 'record-integrity');
  assert.equal(removal.ok, false);
  assert.match(removal.error, /already been evaluated/);

  const read = api.boardRead(memoId);
  assert.equal(read.evaluation.counts.postHoc, 1, 'the memo counts its own post-hoc mark');
});

test('a memo commits only when its evidence floor is met', () => {
  const { api } = boot();
  const opened = api.boardOpenMemo({});
  seedContexts(api);
  api.boardLook(opened.memo.id);
  const refused = api.boardCommit(opened.memo.id);
  assert.equal(refused.ok, false, 'one evaluable claim against a floor of four');
  assert.match(refused.error, /declared floor of 4/);

  const lowered = api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  assert.equal(lowered.ok, true);
  const committed = api.boardCommit(opened.memo.id);
  assert.equal(committed.ok, true, committed.error || 'commits at the lowered floor');
  const memo = api.boardRead(opened.memo.id).memo;
  assert.equal(memo.status, 'committed');
  assert.ok(memo.committedAt);
  assert.ok(memo.snapshot, 'the verdicts are frozen into the record');
  assert.equal(memo.snapshot.claims.length, 7);
  assert.match(api.boardRead(opened.memo.id).evaluation.fingerprint, /^[0-9a-f]{8}$/);
});

test('committing fans DOWNWARD in the same transaction: a decision, a director obligation, and typed provenance', () => {
  const { store, api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  const committed = api.boardCommit(opened.memo.id);
  assert.equal(committed.ok, true, committed.error || 'commits');

  const evaluation = api.boardRead(opened.memo.id).evaluation;
  const alignment = evaluation.rows.find((r) => r.key === 'expectation-alignment');
  assert.equal(alignment.verdict, 'failing', `0 of 1 assessed pair clears the floor, got ${alignment.verdict}`);
  assert.equal(alignment.partition.reconciles, true, 'the partition reconciles');

  const decisions = store.state.decisions.filter((d) => /Board line fails/.test(d.title));
  assert.equal(decisions.length, 1, 'exactly one governed decision per failing claim');
  assert.match(decisions[0].rationale, /RULE-BRD-01/);
  assert.match(decisions[0].question, /No person is the subject of this decision/);

  // Downward propagation: the failing reading belongs to the director's span,
  // where the divergent pair's leader sits — so the obligation lands there.
  const tasks = store.state.delegations.filter((d) => /Board obligation/.test(d.title));
  assert.equal(tasks.length, 1, 'exactly one owned obligation');
  assert.equal(tasks[0].personId, 'dir1', 'the chief has delegated to the director whose span carries the reading');
  assert.match(tasks[0].expectedOutcome, /Report back by/);

  const links = store.state.links;
  const toMemo = links.filter((l) => l.targetType === 'boardmemo' && l.targetId === opened.memo.id);
  assert.ok(toMemo.some((l) => l.relation === 'escalates-from' && l.sourceType === 'decision'), 'the decision escalates from the memo');
  const toSpans = links.filter((l) => l.sourceType === 'boardmemo' && l.sourceId === opened.memo.id && l.relation === 'summarizes-span');
  assert.ok(toSpans.some((l) => l.targetId === 'dir1'), 'the memo names the director span it reports on');
  assert.ok(toSpans.some((l) => l.targetId === 'mgr1'), 'and the manager span');

  // Idempotence: an explicit scan and a further transaction add nothing twice.
  const decisionCount = store.state.decisions.length;
  const taskCount = store.state.delegations.length;
  api.boardScan();
  api.boardScan();
  assert.equal(store.state.decisions.length, decisionCount);
  assert.equal(store.state.delegations.length, taskCount);
});

test('a committed pack is immutable, freezable only by the proper right, and superseded rather than edited', () => {
  const { store, api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);

  const edit = api.boardDeclareClaim(opened.memo.id, 'bench-coverage', 80);
  assert.equal(edit.ok, false);
  assert.match(edit.error, /committed memo is evidence/);

  const frozen = api.boardFreeze(opened.memo.id);
  assert.equal(frozen.ok, true, frozen.error || 'freezes');
  assert.equal(api.boardRead(opened.memo.id).memo.status, 'frozen');

  const second = api.boardOpenMemo({ title: 'Q4 revised' });
  const superseded = api.boardSupersede(opened.memo.id, second.memo.id);
  assert.equal(superseded.ok, true);
  assert.equal(api.boardRead(opened.memo.id).memo.status, 'superseded');
  assert.equal(api.boardRead(second.memo.id).memo.status, 'draft');
  const ledger = api.boardRead().ledger;
  assert.equal(ledger.total, 2);
  assert.equal(ledger.superseded, 1);
  assert.equal(ledger.draft, 1);
});

test('a declared executive seat may read the pack and may not commit it', () => {
  const { store, api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);

  store.update((draft) => { draft.settings.activeSeatId = 'vp1'; }, { type: 'seat.switched', entity: 'workspace', entityId: '', summary: 'seat vp1' });
  const read = api.boardRead(opened.memo.id);
  assert.equal(read.seat.rank, 4);
  assert.equal(read.canCommit, false);
  assert.equal(read.evaluation.rows.length, 7, 'the pack is readable');

  const attempt = api.boardCommit(opened.memo.id);
  assert.equal(attempt.ok, false);
  assert.match(attempt.error, /may not|chief-altitude act/);
});

/* ------------------------------------------------------------- text & export */

test('the memorandum marks every unverified figure and names nobody', () => {
  const { api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);
  const text = api.boardMemoText(opened.memo.id).text;

  assert.match(text, /BOARD DISCLOSURE MEMORANDUM/);
  assert.match(text, /\[REFUSED\] Bench coverage/);
  assert.match(text, /Marked UNVERIFIED in this pack/);
  assert.match(text, /THE QUESTION WE ARE NOT ASKING/);
  assert.match(text, /It is not a composite|No composite score exists/);
  assert.match(text, /ATTESTATION/);
  for (const name of ['Dana Root', 'Rina VP', 'Sam Director', 'Mei Manager', 'Ola Manager', 'Ari Klein', 'Tove Director']) {
    assert.ok(!text.includes(name), `the memorandum does not name ${name}`);
  }
  assert.ok(!text.includes(opened.memo.id), 'the memorandum does not carry the memo id');
  assert.ok(!text.includes('RULE-BRD'), 'rules are provenance, not prose shown to a board');
});

test('the aggregate CSV is blank where the record is silent and carries no identifier', () => {
  const { store, api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);

  const res = exportWorkspaceCsv(store.state, 'board-claims', { now: NOW });
  assert.equal(res.ok, true, res.error || 'export runs');
  const lines = res.csv.split('\n');
  assert.ok(lines.length >= 3, 'header plus workspace plus claim rows');
  assert.match(lines[0], /scope,claim,verdict/);
  assert.ok(lines.some((line) => line.startsWith('workspace,')), 'the workspace row is exported');
  const refusedLine = lines.find((line) => line.includes('bench-coverage'));
  assert.ok(refusedLine, 'the refused claim is exported');
  assert.ok(refusedLine.includes(',,,'), 'its value cells are blank, not zero');
  for (const identifier of [opened.memo.id, 'dir1', 'mgr1', 'Sam Director', 'Mei Manager']) {
    assert.ok(!res.csv.includes(identifier), `the export does not carry ${identifier}`);
  }
});

test('the CSV rows are the same read model the view renders', () => {
  const { api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);
  const rows = api.boardCsvRows(opened.memo.id).rows;
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].scope, 'workspace');
  assert.equal(rows[0].attestation, 'none');
  assert.ok(rows.filter((r) => r.scope === 'claim').every((r) => typeof r.claim === 'string' && r.claim.length > 0));
});

test('the badge counts stored facts only and resets nothing', () => {
  const { store, api } = boot();
  assert.equal(api.boardAttentionCount(), 0);
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);
  const committed = api.boardAttentionCount();
  assert.ok(committed >= 1, 'a committed pack carrying a failing claim is attention');
  store.update((draft) => {
    const memo = draft.boardMemos.find((m) => m.id === opened.memo.id);
    memo.committedAt = '2026-01-01T00:00:00.000Z';
  }, { type: 'test.backdate', entity: 'boardmemo', entityId: opened.memo.id, summary: 'backdated for the re-check window' });
  assert.ok(api.boardAttentionCount() >= committed, 'a stale pack is still attention, never silently dropped');
});

/* ------------------------------------------------------------------- view */

test('the view renders every panel, with no duplicate landmark and no dead end', () => {
  const { dom, errors } = bootDocument();
  try {
    const { api } = boot();
    const opened = api.boardOpenMemo({});
    api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
    seedContexts(api);
    api.boardLook(opened.memo.id);
    api.boardCommit(opened.memo.id);

    const ctxFor = (panel) => ({
      api,
      now: NOW,
      query: new URLSearchParams(`panel=${panel}&memo=${encodeURIComponent(opened.memo.id)}`),
      navigate: () => {},
      refresh: () => {},
      seatContext: { seat: { fullAccess: false, rank: 5, label: 'CEO / C-suite' } },
    });

    for (const panel of ['memo', 'claims', 'rollup', 'discrepancies', 'method']) {
      const node = renderBoard(ctxFor(panel));
      assert.equal(node.tagName, 'DIV', `${panel}: the view is a div, not a nested <main>`);
      assert.ok(node.classList.contains('page'), `${panel}: page class`);
      assert.equal(node.querySelector('main'), null, `${panel}: no duplicate main landmark`);
      const text = node.textContent;
      assert.ok(text.length > 200, `${panel}: renders content`);
      const buttons = node.querySelectorAll('button');
      for (const button of buttons) {
        if (button.type === 'submit') continue;
        assert.ok((button.textContent || '').trim().length > 0 || button.getAttribute('aria-label'), `${panel}: every button has a name`);
      }
    }

    const memoPanel = renderBoard(ctxFor('memo'));
    assert.match(memoPanel.textContent, /The unasked question/);
    assert.match(memoPanel.textContent, /HOLDS|FAILS|INCONCLUSIVE|WITHHELD|REFUSED/);
    const rollupPanel = renderBoard(ctxFor('rollup'));
    assert.match(rollupPanel.textContent, /reconciled|broken roll-up/);
    assert.match(rollupPanel.textContent, /Expectation alignment/, 'the roll-up opens on the claim that actually decomposes');
    const checkPanel = renderBoard(ctxFor('discrepancies'));
    assert.match(checkPanel.textContent, /Cross-module|cross-module|disagreement|agreement/);
    const claimsPanel = renderBoard(ctxFor('claims'));
    assert.match(claimsPanel.textContent, /Pre-registration is the whole point/);
    assert.match(claimsPanel.textContent, /post-hoc|ex ante/);
    assert.deepEqual(errors, [], 'no jsdom errors while rendering');
  } finally {
    dom.window.close();
  }
});

test('the empty state is a starting point, not a dead end', () => {
  const { dom } = bootDocument();
  try {
    const { api } = boot();
    const node = renderBoard({
      api,
      now: NOW,
      query: new URLSearchParams('panel=memo'),
      navigate: () => {},
      refresh: () => {},
      seatContext: { seat: { fullAccess: false, rank: 5, label: 'CEO / C-suite' } },
    });
    const text = node.textContent;
    assert.match(text, /No memo is open/);
    assert.match(text, /The claim register/);
    assert.ok(node.querySelectorAll('button').length >= 1, 'the operator can start');
  } finally {
    dom.window.close();
  }
});

test('a director seat sees the read-only reason instead of an unusable commit button', () => {
  const { dom } = bootDocument();
  try {
    const { api } = boot();
    const opened = api.boardOpenMemo({});
    const node = renderBoard({
      api,
      now: NOW,
      query: new URLSearchParams(`panel=memo&memo=${encodeURIComponent(opened.memo.id)}`),
      navigate: () => {},
      refresh: () => {},
      seatContext: { seat: { fullAccess: false, rank: 4, label: 'VP / executive' } },
    });
    assert.match(node.textContent, /Read-only at this altitude/);
    const labels = [...node.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
    assert.ok(!labels.includes('Commit'), 'no commit control a seat cannot use');
    assert.ok(!labels.includes('Look (evaluate)'), 'no look control a seat cannot use');
  } finally {
    dom.window.close();
  }
});

/* --------------------------------------------------------------- utilities */

test('the memo fingerprint is a content function, not a clock read', () => {
  const a = boardFingerprint('a|1|holding|90|62.9|97|10');
  const b = boardFingerprint('a|1|holding|90|62.9|97|10');
  const c = boardFingerprint('a|1|holding|90|62.9|97|11');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('boardConventions reads declared settings and refuses nonsense', () => {
  const conv = boardConventions({ boardCellFloor: 3, boardEvidenceFloor: 6, boardMaterialityPct: 15, boardRecheckDays: 30, boardAutoPropagate: false });
  assert.deepEqual(
    { cell: conv.cellFloor, evidence: conv.evidenceFloor, materiality: conv.materialityPct, recheck: conv.recheckDays, auto: conv.autoPropagate },
    { cell: 3, evidence: 6, materiality: 15, recheck: 30, auto: false },
  );
  const fallback = boardConventions({ boardCellFloor: 'many', boardRecheckDays: -4 });
  assert.equal(fallback.cellFloor, 5);
  assert.equal(fallback.recheckDays, 90);
});

test('the rule declines politely when nothing is committed and runs on an explicit scan', () => {
  const state = fixture();
  const draft = { ...memoSkeleton(), status: 'draft' };
  state.boardMemos = [draft];
  const effects = boardRule(state, { event: { type: 'board.scan' }, now: NOW, idFactory: (p) => `${p}-x`, settings: state.settings });
  assert.deepEqual(effects, [], 'a draft commits nothing');
});

test('measurement adapters never throw: a broken source becomes a refusal, not a crash', () => {
  const sources = syntheticSources({
    succession: {
      get spans() { throw new Error('module exploded'); },
      certification: {},
    },
  });
  // The adapter is allowed to throw; boardMeasure catches it.
  const measurement = boardMeasure({ people: [], settings: {} }, 'bench-coverage', { sources, now: NOW });
  assert.ok(measurement.refused);
  assert.match(measurement.refused, /failed while producing this figure|no leadership span/);
});

test('the board room is schema-consistent with the rest of the app on reload', () => {
  const { store, api } = boot();
  const opened = api.boardOpenMemo({});
  api.boardSetConventions({ boardEvidenceFloor: 1, boardCellFloor: 1 });
  seedContexts(api);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);
  const reloaded = normalizeState(JSON.parse(JSON.stringify(store.state)), { now: NOW }).state;
  assert.equal(reloaded.boardMemos.length, 1);
  assert.equal(reloaded.boardMemos[0].status, 'committed');
  assert.ok(reloaded.boardMemos[0].snapshot);
  assert.equal(reloaded.links.filter((l) => l.sourceType === 'boardmemo').length > 0, true, 'provenance edges survive reload');
  const read = boardRead(reloaded, { now: NOW });
  assert.equal(read.evaluation.rows.length, 7);
  assert.equal(read.evaluation.fingerprint, boardRead(store.state, { now: NOW }).evaluation.fingerprint, 'the fingerprint is stable across a reload');
});
