/**
 * tests/app/dependency-cycles.test.mjs — ADR-0183, Session 251, Schema v145
 * unchanged, `#/matrix?panel=cycles`, CSV scope #137.
 *
 * ONE focused pass over what this session built. Every expected count is worked
 * out BY HAND from the fixture below and stated in a comment; no assertion
 * calls the engine a second time to discover its own answer.
 *
 * The fixture (matrix case):
 *
 *   ceo
 *    ├ prod (director) ─ home line of sam and kim
 *    └ nora (director) ─ declared project line of sam AND kim
 *
 *   Arcs (all `informs` = source-first, except a5 `depends-on` = target-first):
 *     a1 d1→d2, a2 d2→d3, a3 d3→d1     => ONE 3-node feedback block (blk-001)
 *     a4 g1→d4, a5 dep1→d4             => two sequential blocks feeding d4
 *     a6 g2→g3, a7 g3→g2              => ONE 2-node feedback block (blk-005)
 *
 *   So: 8 nodes, 7 arcs, 7 distinct pairs, 5 blocks (2 feedback + 3
 *   sequential), 5 arcs inside blocks, 2 arcs between blocks. blk-001 names
 *   only sam (2 lines → 2 managers nora+prod) → one joint apex `ceo`.
 *   blk-005 names kim AND sam (both on the same two lines) → the matrix DAG
 *   returns TWO incomparable minimal ancestors (nora, prod) → ambiguous.
 *
 *   Every node has a typed people-edge, so line reach is complete, all four
 *   claims hold and the workspace verdict is `cross-line-cycles`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  createEmptyState,
  DEFAULT_SETTINGS,
  normalizeSettings,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { API_RIGHTS, guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { contractFor, PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_REACH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { buildPausePermits } from '../../app/core/domain/pausePermits.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildDependencyCycles,
  dependencyCycleBriefText,
  dependencyCycleComponents,
  dependencyCycleCsvRows,
  dependencyCycleTearSensitivity,
} from '../../app/core/domain/dependencyCycle.js';
import { dependencyCycleRule } from '../../app/core/domain/dependencyCycleRules.js';
import {
  DEPENDENCY_CYCLE_CLOSED_PREFIX,
  normalizeDependencyCycleSettings,
} from '../../app/core/domain/dependencyCycleSchema.js';
import {
  DEPENDENCY_CYCLE_CSV_COLUMNS,
  DEPENDENCY_CYCLE_CSV_SCOPE,
  DEPENDENCY_CYCLE_LIMITS,
  DEPENDENCY_CYCLE_OWNER_STATES,
  DEPENDENCY_CYCLE_RELATIONS,
  DEPENDENCY_CYCLE_RIGHT,
  DEPENDENCY_CYCLE_RULE_ID,
  DEPENDENCY_CYCLE_SETTING_KEYS,
} from '../../app/core/domain/dependencyCycleRegistry.js';
import { renderMatrixDependencyCyclePanel } from '../../app/views/matrixDependencyCyclePanel.js';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const STAMP = '2020-01-01T00:00:00.000Z';

const person = (id, name, level, managerId = null) => ({
  id, name, level, managerId, status: 'active', startDate: '2020-01-01', createdAt: STAMP,
});
const link = (id, sourceType, sourceId, targetType, targetId, relation) => ({
  id, sourceType, sourceId, targetType, targetId, relation,
  ruleId: 'MANUAL', summary: '', createdOn: '2026-10-01', createdAt: STAMP,
});

function fixture({ withLines = true, withCycle = true, withoutDepPerson = false } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('nora', 'Nora Eng', 'director', 'ceo'),
    person('sam', 'Sam Builder', 'ic', 'prod'),
    person('kim', 'Kim Data', 'ic', 'prod'),
    person('lee', 'Lee Ops', 'ic', 'nora'),
  ];
  raw.reportingLines = withLines ? [
    {
      id: 'l-sam-nora', personId: 'sam', managerId: 'nora', kind: 'project', shareH: 25,
      rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [],
    },
    {
      id: 'l-kim-nora', personId: 'kim', managerId: 'nora', kind: 'project', shareH: 25,
      rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [],
    },
  ] : [];
  raw.decisions = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => ({
    id, title: id.toUpperCase(), driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01',
  }));
  raw.goals = ['g1', 'g2', 'g3'].map((id) => ({ id, title: id.toUpperCase(), status: 'active' }));
  raw.premises = [{ id: 'p1', title: 'P1', status: 'open' }];
  raw.dependencies = [{ id: 'dep1', name: 'Legal review', date: '2026-09-01', status: 'open' }];
  raw.links = [
    link('a1', 'decision', 'd1', 'decision', 'd2', 'informs'),
    link('a2', 'decision', 'd2', 'decision', 'd3', 'informs'),
    ...(withCycle ? [link('a3', 'decision', 'd3', 'decision', 'd1', 'informs')] : []),
    link('a4', 'goal', 'g1', 'decision', 'd4', 'informs'),
    link('a5', 'decision', 'd4', 'dependency', 'dep1', 'depends-on'),
    link('a6', 'goal', 'g2', 'goal', 'g3', 'informs'),
    link('a7', 'goal', 'g3', 'goal', 'g2', 'informs'),
    link('p1', 'person', 'sam', 'decision', 'd1', 'involves'),
    link('p2', 'person', 'sam', 'decision', 'd2', 'involves'),
    link('p3', 'person', 'sam', 'decision', 'd3', 'involves'),
    link('p4', 'person', 'sam', 'decision', 'd4', 'involves'),
    link('p5', 'person', 'sam', 'goal', 'g1', 'involves'),
    link('p6', 'person', 'sam', 'premise', 'p1', 'involves'),
    link('p7', 'person', 'kim', 'goal', 'g2', 'involves'),
    link('p8', 'person', 'sam', 'goal', 'g3', 'involves'),
    ...(withoutDepPerson ? [] : [link('p9', 'person', 'sam', 'dependency', 'dep1', 'involves')]),
  ];
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null };
  return normalizeState(raw, { now: NOW }).state;
}

const read = (state, extra = {}) => buildDependencyCycles(state, { now: NOW, settings: state.settings, ...extra });

function seed(rawState) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(rawState)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const rawApi = createApi(store, { now: () => NOW, idFactory });
  return { store, values, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(globals.map((key) => [key, globalThis[key]]));
  try {
    for (const key of globals) {
      globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
    }
    return run(dom);
  } finally {
    for (const key of globals) globalThis[key] = previous.get(key);
  }
}

/** Brute-force SCC: mutual reachability over the same edge list. */
function bruteComponents(ids, arcs) {
  const reach = new Map(ids.map((id) => [id, new Set([id])]));
  for (const arc of arcs) reach.get(arc.from).add(arc.to);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, set] of reach) {
      for (const mid of [...set]) {
        for (const next of reach.get(mid)) {
          if (!set.has(next)) { set.add(next); changed = true; }
        }
      }
    }
  }
  const seen = new Set();
  const groups = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const group = ids.filter((other) => !seen.has(other) && reach.get(id).has(other) && reach.get(other).has(id));
    group.forEach((member) => seen.add(member));
    groups.push(group.sort());
  }
  return groups.sort((a, b) => a[0].localeCompare(b[0]));
}

/* ------------------------------------------------------------- 1. wiring */

test('registration: schema v145 unchanged, panel #30, CSV scope #137, one safe read', () => {
  assert.equal(SCHEMA_VERSION, 149, 'no schema bump — the reader stores nothing');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'cycles'), 'the cycles panel is on the matrix tab bar');
  const scope = CSV_EXPORTS.find((entry) => entry.key === DEPENDENCY_CYCLE_CSV_SCOPE);
  assert.ok(scope, 'CSV #137 is registered');
  assert.equal(scope.sensitive, false);
  assert.equal(CSV_EXPORTS.length, 141);
  assert.ok(SAFE_READS.has('matrixDependencyCycleReport'));
  assert.equal(DEPENDENCY_CYCLE_RELATIONS.length, 5, 'five declared precedence relations');
  assert.equal(new Set(DEPENDENCY_CYCLE_RELATIONS.map((r) => r.relation)).size, 5);
  assert.equal(DEPENDENCY_CYCLE_OWNER_STATES.length, 5);
});

/* ------------------------------------------------- 2. exact partition */

test('the SCC partition exactly matches brute-force mutual reachability on all 512 directed 3-node graphs', () => {
  const ids = ['a', 'b', 'c'];
  const cells = [];
  for (const from of ids) for (const to of ids) cells.push([from, to]);
  let checked = 0;
  for (let mask = 0; mask < (1 << cells.length); mask += 1) {
    const arcs = cells.filter((_, index) => (mask & (1 << index)) !== 0).map(([from, to]) => ({ from, to }));
    assert.deepEqual(dependencyCycleComponents(ids, arcs), bruteComponents(ids, arcs), `mask ${mask}`);
    checked += 1;
  }
  assert.equal(checked, 512);
});

test('the partition is independent of node insertion order and never loses a node', () => {
  const ids = ['x', 'y', 'z', 'w'];
  const arcs = [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }, { from: 'z', to: 'w' }];
  const expected = [['w'], ['x', 'y'], ['z']];
  assert.deepEqual(dependencyCycleComponents(ids, arcs), expected);
  assert.deepEqual(dependencyCycleComponents([...ids].reverse(), [...arcs].reverse()), expected);
  assert.equal(dependencyCycleComponents(ids, arcs).flat().length, 4);
});

/* ----------------------------------------------- 3. hand-worked matrix read */

test('a two-line matrix workspace partitions into 5 blocks, 2 feedback, 7 arcs, with four separate claims', () => {
  const state = fixture();
  const report = read(state);
  const b = report.board;
  assert.equal(b.nodesN, 8);
  assert.equal(b.arcsN, 7);
  assert.equal(b.pairsN, 7);
  assert.equal(b.blocksN, 5);
  assert.equal(b.feedbackN, 2);
  assert.equal(b.sequentialN, 3);
  assert.equal(b.internalArcsN, 5, '3 arcs inside blk-001 + 2 inside blk-005');
  assert.equal(b.externalArcsN, 2, 'g1→d4 and dep1→d4');
  assert.equal(b.internalArcsN + b.externalArcsN, b.arcsN);
  assert.equal(b.countsReconcile, true);
  assert.equal(b.figuresComplete, true);
  assert.equal(b.lineReachComplete, true);
  assert.equal(b.crossLineClaim, true);
  assert.equal(b.condensationAcyclic, true);
  assert.equal(b.verdict, 'cross-line-cycles');
  assert.equal(report.matrix.hasMatrix, true);
  assert.equal(report.matrix.defectsN, 0);
  assert.equal(report.refusals.length, 0);
  assert.equal(b.excludedRelationsN, 9, 'the nine people-attribution edges create no arc');
  assert.equal(report.excluded[0].relation, 'involves');
  assert.match(report.excluded[0].reason, /people-attribution/i);
  assert.equal(report.blocks.reduce((sum, block) => sum + block.size, 0), b.nodesN);
  assert.equal(report.blocks.reduce((sum, block) => sum + block.internalArcsN, 0), b.internalArcsN);
});

test('the 3-node loop is one irreducible block with one joint apex; records inside it are never ordered', () => {
  const report = read(fixture());
  const block = report.blocks.find((row) => row.size === 3 && row.state === 'feedback-cycle');
  assert.ok(block);
  assert.deepEqual(block.members.map((member) => member.key), ['decision:d1', 'decision:d2', 'decision:d3']);
  assert.equal(block.internalArcsN, 3);
  assert.equal(block.state, 'feedback-cycle');
  assert.equal(block.lineState, 'cross-line');
  assert.equal(block.ownerState, 'joint-apex');
  assert.equal(block.apexBasis, 'line-managers', 'one person named → joint apex of the two line holders');
  assert.deepEqual(block.apexIds, ['ceo']);
  assert.equal(block.apexAmbiguous, false);
  assert.equal(block.reason, null);
  assert.equal(block.order, 0);
});

test('a diamond tie names BOTH incomparable minimal ancestors instead of picking one', () => {
  const report = read(fixture());
  const block = report.blocks.find((row) => row.size === 2 && row.state === 'feedback-cycle');
  assert.ok(block);
  assert.equal(block.apexBasis, 'people', 'two people named → their shared minimal ancestors');
  assert.equal(block.lineState, 'cross-line');
  assert.equal(block.ownerState, 'ambiguous-apex');
  assert.deepEqual(block.apexIds, ['nora', 'prod']);
  assert.equal(block.apexAmbiguous, true);
  assert.match(block.reason, /incomparable minimal ancestor/);
  assert.equal(report.board.jointApexN, 1);
  assert.equal(report.board.ambiguousApexN, 1);
  assert.equal(report.board.crossLineFeedbackN, 2);
});

test('the condensation graph is ordered and every block lands in exactly one ownership roll-up', () => {
  const report = read(fixture());
  assert.equal(report.rollUps.reduce((sum, row) => sum + row.blocksN, 0), report.board.feedbackN);
  assert.equal(report.rollUps.filter((row) => row.ownerState === 'joint-apex')[0].blocksN, 1);
  assert.equal(report.rollUps.filter((row) => row.ownerState === 'ambiguous-apex')[0].blocksN, 1);
  const downstream = report.blocks.filter((block) => block.externalInN > 0);
  assert.equal(downstream.length, 1, 'd4 receives arcs from g1 and dep1');
  assert.equal(downstream[0].order, 1);
  assert.equal(report.board.distinctLinePairN, 6, 'C(4,2) over the four active line ids');
});

/* --------------------------------------------------- 4. refusals / limits */

test('a node with no people-edge refuses the cross-line claim but still prints the coupled blocks', () => {
  const report = read(fixture({ withoutDepPerson: true }));
  assert.equal(report.board.lineReachComplete, false);
  assert.equal(report.board.crossLineClaim, false);
  assert.equal(report.board.countsReconcile, true, 'counts can reconcile while the structure claim is refused');
  assert.equal(report.board.verdict, 'unprovable-line-reach');
  assert.match(report.board.reason, /no provable reporting-line reach/);
  assert.equal(report.board.feedbackN, 2, 'the cycles are still printed');
  const unattributed = report.blocks.find((block) => block.members.some((member) => member.key === 'dependency:dep1'));
  assert.equal(unattributed.lineState, 'line-reach-unknown');
});

test('a single-chain workspace finds the same cycles but makes no cross-line finding', () => {
  const report = read(fixture({ withLines: false }));
  assert.equal(report.matrix.hasMatrix, false);
  assert.equal(report.board.feedbackN, 2);
  assert.equal(report.board.crossLineFeedbackN, 0);
  assert.equal(report.board.singleLineFeedbackN, 2);
  assert.equal(report.board.jointApexN + report.board.ambiguousApexN, 0);
  assert.equal(report.board.verdict, 'single-line-cycles');
  assert.equal(report.board.crossLineClaim, true, 'line reach is complete even with no declared additional line');
});

test('removing one arc makes the graph acyclic and the verdict names that', () => {
  const report = read(fixture({ withCycle: false }));
  assert.equal(report.board.feedbackN, 1, 'only the g2↔g3 loop remains');
  assert.equal(report.board.verdict, 'cross-line-cycles');
  const noArcReport = read({ ...fixture(), links: [] });
  assert.equal(noArcReport.board.arcsN, 0);
  assert.equal(noArcReport.board.verdict, 'no-arcs');
  assert.equal(noArcReport.board.crossLineClaim, false);
});

test('a dangling endpoint and a symmetric coupling are counted, never silently dropped', () => {
  const state = fixture();
  state.links = [
    ...state.links,
    link('bad', 'decision', 'd1', 'decision', 'missing-record', 'informs'),
    link('sym', 'decision', 'd2', 'decision', 'd3', 'shares-barrier'),
  ];
  const report = read(state);
  assert.equal(report.refusals.find((row) => row.key === 'unresolved-endpoint')?.n, 1);
  const symmetric = report.excluded.find((row) => row.relation === 'shares-barrier');
  assert.equal(symmetric?.n, 1);
  assert.match(symmetric.reason, /equivalence class/);
  assert.equal(report.board.arcsN, 7, 'neither the dangling edge nor the coupling created an arc');
});

/* ------------------------------------------- 5. display == stored / reload */

test('reads mutate nothing and the report survives a real store reload unchanged', () => {
  const raw = fixture();
  const before = JSON.stringify(raw);
  const first = read(raw);
  assert.equal(JSON.stringify(raw), before, 'the reader did not mutate the state');
  const { store, api } = seed(raw);
  const second = read(store.state);
  assert.deepEqual(second.board, first.board);
  assert.deepEqual(second.blocks, first.blocks);
  assert.deepEqual(second.rollUps, first.rollUps);
  assert.equal(JSON.stringify(store.state), JSON.stringify(raw), 'reload changed no stored byte');
  const viaAction = api.matrixDependencyCycleReport();
  assert.equal(viaAction.ok, true);
  assert.deepEqual(viaAction.report.board, first.board, 'the safe read returns the SAME computed board');
  assert.equal(typeof renderMatrixDependencyCyclePanel, 'function');
});

/* --------------------------------------------------- 6. CSV #137 contract */

test('CSV #137 has exact column parity, one row per block/state, and carries no identity', () => {
  const report = read(fixture());
  const rows = dependencyCycleCsvRows(report);
  assert.equal(rows.length, 1 + DEPENDENCY_CYCLE_OWNER_STATES.length + report.board.feedbackN);
  assert.deepEqual(rows.map((row) => row.row_kind).slice(0, 2), ['workspace', 'owner_state']);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [...DEPENDENCY_CYCLE_CSV_COLUMNS].sort(), 'every declared column is present on every row');
    assert.equal(row.row_kind.length > 0, true);
    assert.equal(row.engine, report.engineVersion);
    assert.equal(row.generated_on, report.generatedOn);
    assert.equal(row.nodes_n, report.board.nodesN);
    assert.equal(row.arcs_n, report.board.arcsN);
  }
  const blockRow = rows.find((row) => row.row_kind === 'feedback_block');
  assert.ok(blockRow);
  assert.equal(blockRow.block_size, 3);
  assert.equal(blockRow.owner_state, 'joint-apex');

  const exported = exportWorkspaceCsv(fixture(), DEPENDENCY_CYCLE_CSV_SCOPE, { now: NOW });
  assert.equal(exported.ok, true);
  const text = exported.csv;
  const parsed = parseCsv(text);
  assert.deepEqual(parsed.headers, [...DEPENDENCY_CYCLE_CSV_COLUMNS]);
  assert.equal(parsed.rows.length, rows.length);
  const forbidden = [/Sam Builder/, /Kim Data/, /Milo Product/, /Nora Eng/, /decision:d1/, /goal:g2/, /home:sam/, /l-sam-nora/, /Legal review/, /D1/, /2026-10-01/];
  for (const pattern of forbidden) assert.doesNotMatch(text, pattern, `identity leaked: ${pattern}`);
  assert.match(dependencyCycleBriefText(report), /Counts reconcile/);
});

/* ------------------------------------------------------- 7. panel render */

test('the JSDOM panel prints the computed board and the real generated diagram', () => {
  const state = fixture();
  const report = read(state);
  withDom(() => {
    const panel = renderMatrixDependencyCyclePanel({ state, api: {}, refresh: () => {} }, { now: NOW });
    assert.ok(panel, 'the panel rendered without throwing');
    const html = panel.outerHTML;
    assert.match(html, /Coupled feedback blocks/);
    assert.match(html, /dependency-cycle-dsm\.jpg/);
    assert.match(html, /data-testid="dependency-cycle-dsm-diagram"/);
    assert.match(html, /counts reconcile — yes/);
    assert.match(html, /Feedback cycles cross reporting lines/);
    assert.match(html, /blk-001/);
    assert.match(html, /incomparable minimal ancestor/);
    assert.equal((html.match(/<h1/g) || []).length, 0, 'a panel never adds a second h1');
  });
  assert.equal(report.board.verdict, 'cross-line-cycles');
});

/* ------------------------------------------- 8. ADR-0187 spine & rights */

test('ADR-0187 registration: RULE-CYC-01 on spine before seatRule, contract parity, pause permit switch, rights and conventions', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(dependencyCycleRule));
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).name, 'sealRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2).name, 'seatRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-3), dependencyCycleRule);

  const contract = contractFor(dependencyCycleRule);
  assert.ok(contract);
  assert.equal(contract.module, 'dependencyCycleRules.js');
  assert.match(contract.purpose, /RULE-CYC-01/);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);

  assert.equal(API_RIGHTS.matrixDependencyCycleScan, DEPENDENCY_CYCLE_RIGHT);
  assert.equal(API_RIGHTS.matrixDependencyCycleSetConventions, DEPENDENCY_CYCLE_RIGHT);
  assert.deepEqual(ACTION_RIGHTS[DEPENDENCY_CYCLE_RIGHT], {
    minRank: 3,
    maxRank: 5,
    label: 'Scan dependency feedback cycles on the shared spine and set cycle conventions',
  });

  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('dependencyCycleAutoPropagate'));
  assert.equal(PAUSE_PERMIT_REACH_RULES.dependencyCycleAutoPropagate, 'dependencyCycleRules.js');

  assert.equal(DEFAULT_SETTINGS.dependencyCycleAskDueDays, 7);
  assert.equal(DEFAULT_SETTINGS.dependencyCycleAutoPropagate, true);
  const norm = normalizeSettings({ dependencyCycleAskDueDays: 14, dependencyCycleAutoPropagate: false });
  assert.equal(norm.dependencyCycleAskDueDays, 14);
  assert.equal(norm.dependencyCycleAutoPropagate, false);
  assert.deepEqual(normalizeDependencyCycleSettings({ dependencyCycleAskDueDays: 999, dependencyCycleAutoPropagate: false }), {
    dependencyCycleAskDueDays: 30,
    dependencyCycleAutoPropagate: false,
  });
});

/* ----------------------- 9. exhaustive + hand-worked tear sensitivity */

test('dependencyCycleTearSensitivity matches brute-force single-pair deletion across ALL 512 directed 3-node graphs (including self-arcs)', () => {
  const ids = ['a', 'b', 'c'];
  const cells = [];
  for (const from of ids) for (const to of ids) cells.push([from, to]);

  for (let mask = 0; mask < (1 << cells.length); mask += 1) {
    const pairArcs = cells
      .filter((_, bit) => (mask & (1 << bit)) !== 0)
      .map(([from, to], i) => ({
        from,
        to,
        relation: 'informs',
        linkId: `l-${i}`,
      }));
    const sccs = bruteComponents(ids, pairArcs);
    for (const compIds of sccs) {
      const compSet = new Set(compIds);
      const internal = pairArcs.filter((a) => compSet.has(a.from) && compSet.has(a.to));
      const hasSelf = internal.some((a) => a.from === a.to);
      if (compIds.length === 1 && !hasSelf) continue;

      const got = dependencyCycleTearSensitivity(compIds, internal);
      assert.equal(got.evaluated, true);
      assert.equal(got.reconciles, true);
      assert.equal(got.internalPairsN, internal.length);

      let wantBreak = 0;
      let wantPartial = 0;
      let wantPersist = 0;
      for (const cand of got.candidates) {
        const remainingArcs = internal.filter((a) => !(a.from === cand.from && a.to === cand.to));
        const subSccs = bruteComponents(compIds, remainingArcs);
        let remFeedbackBlocks = 0;
        let coupledNodes = 0;
        for (const sc of subSccs) {
          const scSelf = sc.length === 1 && remainingArcs.some((a) => a.from === sc[0] && a.to === sc[0]);
          if (sc.length > 1 || scSelf) {
            remFeedbackBlocks += 1;
            coupledNodes += sc.length;
          }
        }
        const wantFreed = compIds.length - coupledNodes;
        assert.equal(cand.freedNodesN, wantFreed, `freedNodes mismatch on mask ${mask} pair ${cand.pairKey}`);
        assert.equal(cand.remainingFeedbackBlocksN, remFeedbackBlocks, `remainingFeedbackBlocks mismatch on mask ${mask}`);
        if (remFeedbackBlocks === 0) wantBreak += 1;
        else if (wantFreed > 0) wantPartial += 1;
        else wantPersist += 1;
      }
      assert.equal(got.singleArcBreakN, wantBreak, `singleArcBreakN mismatch on mask ${mask}`);
      assert.equal(got.partialTearN, wantPartial, `partialTearN mismatch on mask ${mask}`);
      assert.equal(got.persistentArcN, wantPersist, `persistentArcN mismatch on mask ${mask}`);
    }
  }
});

test('hand-worked tear sensitivity distinguishes 1-arc break, core-shrinking tear, multi-arc-only clique, parallel links and bound refusal', () => {
  const members = ['decision:a', 'decision:b', 'decision:c'];
  const lineReach = new Map([
    ['decision:a', { state: 'known', managerIds: ['prod'] }],
    ['decision:b', { state: 'known', managerIds: ['nora'] }],
    ['decision:c', { state: 'unknown', managerIds: [] }],
  ]);

  // 1) Overlapping 4-pair loop: a->b (with a parallel link!), b->a, b->c, c->a
  const overlapArcs = [
    { from: 'decision:a', to: 'decision:b', relation: 'informs', linkId: 'l1' },
    { from: 'decision:a', to: 'decision:b', relation: 'pre-registers', linkId: 'l1b' },
    { from: 'decision:b', to: 'decision:a', relation: 'informs', linkId: 'l2' },
    { from: 'decision:b', to: 'decision:c', relation: 'informs', linkId: 'l3' },
    { from: 'decision:c', to: 'decision:a', relation: 'informs', linkId: 'l4' },
  ];
  const overlap = dependencyCycleTearSensitivity(members, overlapArcs, { lineReach });
  assert.equal(overlap.evaluated, true);
  assert.equal(overlap.tearState, 'single-arc-tearable');
  assert.equal(overlap.internalPairsN, 4, '5 links on 4 distinct directed pairs');
  assert.equal(overlap.singleArcBreakN, 1, 'only removing a->b breaks BOTH loops');
  assert.equal(overlap.partialTearN, 2, 'removing b->c or c->a frees c and leaves a<->b');
  assert.equal(overlap.persistentArcN, 1, 'removing b->a leaves a->b->c->a intact');
  assert.equal(overlap.reconciles, true);

  const ab = overlap.candidates.find((c) => c.pairKey === 'decision:a>decision:b');
  assert.equal(ab.outcome, 'acyclic');
  assert.equal(ab.arcsN, 2);
  assert.deepEqual(ab.relations, ['informs', 'pre-registers']);
  assert.equal(ab.arcSpanState, 'cross-holder');

  const bc = overlap.candidates.find((c) => c.pairKey === 'decision:b>decision:c');
  assert.equal(bc.outcome, 'reduces-core');
  assert.equal(bc.freedNodesN, 1);
  assert.equal(bc.largestRemainingBlockSize, 2);
  assert.equal(bc.arcSpanState, 'unattributed-endpoint');

  // 2) Bidirected 3-clique (6 arcs): no single pair breaks or shrinks the 3-cycle!
  const cliqueArcs = [
    ['decision:a', 'decision:b'], ['decision:b', 'decision:a'],
    ['decision:b', 'decision:c'], ['decision:c', 'decision:b'],
    ['decision:a', 'decision:c'], ['decision:c', 'decision:a'],
  ].map(([from, to], idx) => ({ from, to, relation: 'informs', linkId: `k${idx}` }));
  const clique = dependencyCycleTearSensitivity(members, cliqueArcs, { lineReach });
  assert.equal(clique.tearState, 'multi-arc-only');
  assert.equal(clique.singleArcBreakN, 0);
  assert.equal(clique.partialTearN, 0);
  assert.equal(clique.persistentArcN, 6);
  assert.equal(clique.reconciles, true);

  // 3) Bound refusal (`maxTearArcsPerBlock = 3` on a 4-pair block):
  const refused = dependencyCycleTearSensitivity(members, overlapArcs, { maxTearArcsPerBlock: 3 });
  assert.equal(refused.evaluated, false);
  assert.equal(refused.tearState, 'tear-bound-exceeded');
  assert.equal(refused.singleArcBreakN, null, 'withheld figure is null, never 0');
  assert.equal(refused.partialTearN, null);
  assert.equal(refused.persistentArcN, null);
  assert.equal(refused.candidates.length, 0);
  assert.match(refused.reason, /exceeding the 3-pair counterfactual bound/);
});

/* ---------------- 10. RULE-CYC-01 on the real post-commit spine & seal */

const cycleAsksOf = (state) => (state.delegations || [])
  .filter((d) => String(d.support || '').includes(DEPENDENCY_CYCLE_RULE_ID));
const cycleLinksOf = (state, relation) => (state.links || [])
  .filter((l) => l.ruleId === DEPENDENCY_CYCLE_RULE_ID && (!relation || l.relation === relation));
const cycleMarkersOf = (state) => (state.matrixMarkers || [])
  .filter((m) => m.ruleId === DEPENDENCY_CYCLE_RULE_ID && m.kind === 'dependency-cycle');

test('RULE-CYC-01 on the REAL spine issues one ask to the unique joint apex, observes the ambiguous cycle, seals atomically, and is idempotent on repeat & reload', () => {
  const init = fixture();
  init.settings = { ...init.settings, activeSeatId: 'ceo', sealEnabled: true };
  const { store, values, api } = seed(init);

  const scanned = api.matrixDependencyCycleScan();
  assert.equal(scanned.ok, true, scanned?.error || 'VP scan succeeds');
  assert.deepEqual(
    scanned.effects.map((e) => e.action),
    ['delegated', 'observed'],
    'one ask for blk-001 (ceo) and one identity-free observation for blk-005 (ambiguous)',
  );

  const asks = cycleAsksOf(store.state);
  assert.equal(asks.length, 1, 'derived cascade did not duplicate the ask');
  assert.equal(asks[0].personId, 'ceo', 'blk-001 addresses its unique matrixJointApex');
  assert.equal(asks[0].status, 'active');
  assert.equal(asks[0].dueOn, '2026-11-19', '7-day default window from 2026-11-12');
  assert.match(asks[0].expectedOutcome, /3 of 3 distinct internal precedence pair\(s\) would uncouple all 3 record\(s\)/);
  assert.match(asks[0].expectedOutcome, /No edge was torn and no commitment was deprioritised automatically/);

  const obLinks = cycleLinksOf(store.state, 'issues-obligation');
  assert.equal(obLinks.length, 1);
  assert.equal(obLinks[0].sourceType, 'person');
  assert.equal(obLinks[0].sourceId, 'ceo');
  assert.equal(obLinks[0].targetType, 'delegation');
  assert.equal(obLinks[0].targetId, asks[0].id);

  // Markers are strictly identity-free:
  const markers = cycleMarkersOf(store.state);
  assert.equal(markers.length, 1);
  assert.match(markers[0].detail, /ambiguous/);
  for (const pat of [/Ada/, /Milo/, /Nora/, /Kim/, /Sam/, /Lee/, /D1/, /G2/, /Legal review/]) {
    assert.doesNotMatch(markers[0].detail, pat, `marker leaked identity: ${pat}`);
  }

  // Covered by audit.seal in the same commit:
  const seals = store.state.events.filter((ev) => ev.type === 'audit.seal');
  assert.equal(seals.length, 1);

  // Repeat scan is 100% idempotent:
  const rescan = api.matrixDependencyCycleScan();
  assert.equal(rescan.ok, true);
  assert.deepEqual(rescan.effects, [], 'second scan emits zero effects');
  assert.equal(cycleAsksOf(store.state).length, 1);
  assert.equal(cycleMarkersOf(store.state).length, 1);

  // Reload from persisted bytes (`display == stored`):
  const persisted = JSON.parse(values.get(STORAGE_KEY));
  assert.equal(cycleAsksOf(persisted).length, 1);
  const { store: rebooted } = seed(persisted);
  const report = read(rebooted.state);
  assert.equal(report.asks.openN, 1);
  assert.equal(report.asks.answeredN, 0);
  assert.equal(report.asks.notIssuedN, 0);
  assert.equal(report.asks.notApplicableN, 1);
  assert.equal(report.asks.observationsN, 1);
  assert.equal(report.asks.reconciles, true);
});

test('RULE-CYC-01 serves single-chain workspaces too (sole line holder + rolls-up-to ancestor), respects human closure, self-closes on break, and never fabricates a leader ask', () => {
  // Single-chain (`withLines: false`): both Sam and Kim sit solely under `prod` (Milo Product), who reports to `ceo`!
  const init = fixture({ withLines: false });
  init.settings = { ...init.settings, activeSeatId: 'ceo', sealEnabled: true };
  const { store, api } = seed(init);

  const first = api.matrixDependencyCycleScan();
  assert.equal(first.ok, true);
  const asks = cycleAsksOf(store.state);
  assert.equal(asks.length, 2, 'both single-line cycles inside Milo’s branch receive one ask');
  assert.ok(asks.every((d) => d.personId === 'prod'));

  // Milo (`prod`) sits under Ada (`ceo`), so RULE-CYC-01 attaches `rolls-up-to` from each ask -> `ceo`!
  const rollups = cycleLinksOf(store.state, 'rolls-up-to');
  assert.equal(rollups.length, 2);
  assert.ok(rollups.every((l) => l.targetId === 'ceo'));

  const ask3 = asks.find((d) => d.title.includes('3-record'));
  const ask2 = asks.find((d) => d.title.includes('2-record'));
  assert.ok(ask3 && ask2);

  // 1) Human closes `ask3` (d1->d2->d3->d1) while its cycle still stands -> never re-asked!
  store.update((draft) => {
    const target = draft.delegations.find((d) => d.id === ask3.id);
    target.status = 'done';
    target.completedOn = '2026-11-12';
    target.completionNote = 'Sequenced D1 ahead of D2 via pre-registered premise.';
  }, { type: 'delegation.completed', entity: 'delegation', entityId: ask3.id, summary: 'Completed ask' });

  assert.equal(cycleAsksOf(store.state).length, 2, 'human closure was NOT re-opened');
  const midReport = read(store.state);
  assert.equal(midReport.asks.openN, 1);
  assert.equal(midReport.asks.answeredN, 1);

  // 2) Break the remaining 2-record cycle by deleting `a7` (g3 -> g2) -> RULE-CYC-01 self-closes `ask2`!
  store.update((draft) => {
    draft.links = draft.links.filter((l) => l.id !== 'a7');
  }, { type: 'link.deleted', entity: 'link', entityId: 'a7', summary: 'Removed reverse goal dependency' });

  const closed2 = store.state.delegations.find((d) => d.id === ask2.id);
  assert.equal(closed2.status, 'done', 'open ask self-closed when its cycle cleared');
  assert.equal(closed2.completedOn, '2026-11-12');
  assert.ok(closed2.completionNote.startsWith(DEPENDENCY_CYCLE_CLOSED_PREFIX));
  const afterClear = read(store.state);
  assert.equal(afterClear.asks.openN, 0);
  assert.equal(afterClear.asks.answeredN, 1);

  // 3) Leader-held single-line cycle (`ceo` has `managerId === null` -> home line under synthetic `leader`):
  const leaderRaw = createEmptyState(NOW.toISOString());
  leaderRaw.people = [person('ceo', 'Ada Chief', 'vp', null)];
  leaderRaw.decisions = [
    { id: 'ld1', title: 'LD1', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
    { id: 'ld2', title: 'LD2', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
  ];
  leaderRaw.links = [
    link('ll1', 'decision', 'ld1', 'decision', 'ld2', 'informs'),
    link('ll2', 'decision', 'ld2', 'decision', 'ld1', 'informs'),
    link('lp1', 'person', 'ceo', 'decision', 'ld1', 'involves'),
    link('lp2', 'person', 'ceo', 'decision', 'ld2', 'involves'),
  ];
  leaderRaw.settings = { ...leaderRaw.settings, activeSeatId: null };
  const { store: lStore, api: lApi } = seed(normalizeState(leaderRaw, { now: NOW }).state);
  const lScan = lApi.matrixDependencyCycleScan();
  assert.equal(lScan.ok, true);
  assert.equal(cycleAsksOf(lStore.state).length, 0, 'never fabricates a delegation for synthetic leader');
  assert.equal(cycleMarkersOf(lStore.state).length, 1, 'records leader-held observation instead');
  assert.match(cycleMarkersOf(lStore.state)[0].detail, /leader-held/);
});

test('RULE-CYC-01 enforces the per-commit ask cap (6) and issues the remainder on the next scan', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('sam', 'Sam Builder', 'ic', 'prod'),
  ];
  raw.decisions = [];
  raw.links = [];
  for (let i = 1; i <= 8; i += 1) {
    const a = `da-${i}`;
    const b = `db-${i}`;
    raw.decisions.push(
      { id: a, title: `DA${i}`, driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
      { id: b, title: `DB${i}`, driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
    );
    raw.links.push(
      link(`la-${i}`, 'decision', a, 'decision', b, 'informs'),
      link(`lb-${i}`, 'decision', b, 'decision', a, 'informs'),
      link(`pa-${i}`, 'person', 'sam', 'decision', a, 'involves'),
      link(`pb-${i}`, 'person', 'sam', 'decision', b, 'involves'),
    );
  }
  raw.settings = { ...raw.settings, activeSeatId: 'ceo' };
  const { store, api } = seed(normalizeState(raw, { now: NOW }).state);

  const first = api.matrixDependencyCycleScan();
  assert.equal(first.ok, true);
  assert.equal(cycleAsksOf(store.state).length, DEPENDENCY_CYCLE_LIMITS.asksPerCommit);
  const deferred = first.effects.find((e) => e.action === 'deferred');
  assert.ok(deferred);
  assert.match(deferred.summary, /^2 dependency-cycle ask\(s\) were deferred/);

  const second = api.matrixDependencyCycleScan();
  assert.equal(second.ok, true);
  assert.equal(cycleAsksOf(store.state).length, 8);
  assert.equal(second.effects.some((e) => e.action === 'deferred'), false);
});

/* -------- 11. pause switch, convention bounds, seat rights & redaction */

test('pause switch, pause-permit register, fail-closed convention bounds, rank-3+ gate and seat-scoped redaction hold', () => {
  const init = fixture();
  init.settings = { ...init.settings, activeSeatId: 'ceo', dependencyCycleAutoPropagate: false };
  const { store, api } = seed(init);

  // Pause-permit register recognizes `dependencyCycleAutoPropagate` as an unpermitted matrix-reaching pause:
  const permitRead = buildPausePermits(store.state, { now: NOW, settings: { ...store.state.settings, activeSeatId: null } });
  const cycRow = permitRead.offSwitches.find((s) => s.key === 'dependencyCycleAutoPropagate');
  assert.ok(cycRow, 'pause-permit census includes dependencyCycleAutoPropagate');
  assert.equal(cycRow.reachesMatrix, true);
  assert.equal(cycRow.reachRule, 'dependencyCycleRules.js');
  assert.equal(cycRow.stateKey, 'unpermitted');

  // With auto-propagation paused, an ordinary operational write issues zero cycle asks:
  store.update((draft) => {
    draft.decisions.push({ id: 'd-extra', title: 'Extra', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-02' });
  }, { type: 'decision.created', entity: 'decision', entityId: 'd-extra', summary: 'Extra decision' });
  assert.equal(cycleAsksOf(store.state).length, 0);

  // Explicit scan STILL runs while paused:
  assert.equal(api.matrixDependencyCycleScan().ok, true);
  assert.equal(cycleAsksOf(store.state).length, 1);

  // Fail-closed convention validation (never clamped):
  const K = DEPENDENCY_CYCLE_SETTING_KEYS;
  assert.equal(api.matrixDependencyCycleSetConventions({ [K.askDueDays]: 0 }).ok, false);
  assert.equal(api.matrixDependencyCycleSetConventions({ [K.askDueDays]: 31 }).ok, false);
  assert.equal(api.matrixDependencyCycleSetConventions({ [K.askDueDays]: 2.5 }).ok, false);
  assert.equal(api.matrixDependencyCycleSetConventions({ unknownKey: 5 }).ok, false);
  assert.equal(api.matrixDependencyCycleSetConventions({ [K.autoPropagate]: 'yes' }).ok, false);
  assert.equal(store.state.settings.dependencyCycleAskDueDays, 7, 'refused writes mutated nothing');

  const updated = api.matrixDependencyCycleSetConventions({ [K.askDueDays]: 14, [K.autoPropagate]: true });
  assert.equal(updated.ok, true);
  assert.equal(store.state.settings.dependencyCycleAskDueDays, 14);
  assert.equal(store.state.settings.dependencyCycleAutoPropagate, true);

  // Scoped seat redaction: add an out-of-span cycle on `lee` (under `nora`), then read from `prod` (Milo Product, reaches Sam + Kim only!):
  store.update((draft) => {
    draft.decisions.push(
      { id: 'lee-a', title: 'Secret Nora Plan A', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-03' },
      { id: 'lee-b', title: 'Secret Nora Plan B', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-03' },
    );
    draft.links.push(
      link('ll-a', 'decision', 'lee-a', 'decision', 'lee-b', 'informs'),
      link('ll-b', 'decision', 'lee-b', 'decision', 'lee-a', 'informs'),
      link('lp-a', 'person', 'lee', 'decision', 'lee-a', 'involves'),
      link('lp-b', 'person', 'lee', 'decision', 'lee-b', 'involves'),
    );
    draft.settings.activeSeatId = 'prod';
  }, { type: 'seat.switched', entity: 'settings', entityId: 'seat', summary: 'Switch to Milo Product' });

  const prodRead = api.matrixDependencyCycleReport();
  assert.equal(prodRead.ok, true);
  const prodBlocksJson = JSON.stringify(prodRead.report.blocks);
  assert.doesNotMatch(prodBlocksJson, /Secret Nora Plan|Lee Ops|Ada Chief/, 'out-of-span record titles, people and upward apexes are withheld');
  assert.match(prodBlocksJson, /withheld outside seat span/);

  // IC seat (`sam`, rank 1) cannot run workspace-wide scan or change cycle conventions:
  store.update((draft) => { draft.settings.activeSeatId = 'sam'; }, { type: 'seat.switched', entity: 'settings', entityId: 'seat', summary: 'Switch to Sam' });
  assert.equal(api.matrixDependencyCycleScan().ok, false, 'IC seat refused on scan');
  assert.equal(api.matrixDependencyCycleSetConventions({ [K.askDueDays]: 10 }).ok, false, 'IC seat refused on conventions');
});

/* ------------------------------------ 12. interactive JSDOM panel flow */

test('interactive JSDOM panel renders tear census & escalation status and persists scan + conventions through the API', () => {
  const init = fixture();
  init.settings = { ...init.settings, activeSeatId: 'ceo' };
  const { store, values, api } = seed(init);

  withDom((dom) => {
    const host = dom.window.document.body;
    let refreshes = 0;
    const mount = () => {
      host.innerHTML = '';
      host.appendChild(renderMatrixDependencyCyclePanel({
        state: store.state,
        api,
        refresh: () => { refreshes += 1; mount(); },
      }, { now: NOW }));
    };
    mount();

    assert.match(host.innerHTML, /Counterfactual single-arc tear sensitivity/);
    assert.match(host.innerHTML, /Governed escalation on the shared spine \(RULE-CYC-01\)/);

    const scanBtn = host.querySelector('[data-testid="dependency-cycle-scan-btn"]');
    assert.ok(scanBtn, 'director+ seat sees Scan button');
    scanBtn.click();
    assert.equal(refreshes, 1);
    assert.equal(cycleAsksOf(store.state).length, 1);
    assert.match(host.innerHTML, /open · due 2026-11-19/);

    const input = host.querySelector('[data-testid="dependency-cycle-due-days-input"]');
    const form = host.querySelector('[data-testid="dependency-cycle-conventions-form"]');
    assert.ok(input && form);
    input.value = '12';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(store.state.settings.dependencyCycleAskDueDays, 12);
    const onDisk = JSON.parse(values.get(STORAGE_KEY));
    assert.equal(onDisk.settings.dependencyCycleAskDueDays, 12, 'convention persisted to STORAGE_KEY');
  });
});
