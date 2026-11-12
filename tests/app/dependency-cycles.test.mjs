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

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildDependencyCycles,
  dependencyCycleBriefText,
  dependencyCycleComponents,
  dependencyCycleCsvRows,
} from '../../app/core/domain/dependencyCycle.js';
import {
  DEPENDENCY_CYCLE_CSV_COLUMNS,
  DEPENDENCY_CYCLE_CSV_SCOPE,
  DEPENDENCY_CYCLE_OWNER_STATES,
  DEPENDENCY_CYCLE_RELATIONS,
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
  return { store, api: guardApi(rawApi, store, { now: () => NOW.getTime() }) };
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
  assert.equal(SCHEMA_VERSION, 145, 'no schema bump — the reader stores nothing');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'cycles'), 'the cycles panel is on the matrix tab bar');
  const scope = CSV_EXPORTS.find((entry) => entry.key === DEPENDENCY_CYCLE_CSV_SCOPE);
  assert.ok(scope, 'CSV #137 is registered');
  assert.equal(scope.sensitive, false);
  assert.equal(CSV_EXPORTS.length, 137);
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
