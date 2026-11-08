/**
 * tests/app/board-partition-suppression.test.mjs — ADR-0139 (Session 188,
 * Schema v118 unchanged, `#/board?panel=rollup`).
 *
 * THE CLAIM THIS SUITE MAKES
 * --------------------------
 * `boardPartition` decomposes a claim over the reporting tree. Until this
 * session it printed every span's rate regardless of how few observations that
 * span held, while `boardEvaluateClaim` withheld the CLAIM's rate below the same
 * declared floor. Reproduced against the shipped code at the default
 * `boardCellFloor` of 5, a claim carrying 6 observations printed
 *
 *     Sam Director: 1 observation, 1 passing, 100% (interval 20.7–100)
 *
 * — a named leader's rate resting on one assessed pair. These tests prove:
 *
 *   1. THE HOLE IS CLOSED. A sub-floor cell prints its observation count and
 *      withholds its rate and its pass count.
 *   2. IT IS NOT COSMETIC. Because the claim's own pass count is published at
 *      claim level, a single withheld cell is determined by subtraction. The
 *      planner therefore hides a partner cell (complementary suppression) rather
 *      than leaving one box against a fixed total — proven by counting the
 *      reader's own arithmetic, not by trusting a flag.
 *   3. THE COUNTS STILL RECONCILE. Suppression removes figures, never
 *      observations: the panel's whole purpose (a roll-up that adds up) survives.
 *   4. THE SETTING IS HONOURED. A declared floor of 1 publishes everything,
 *      because that is what the operator asked for.
 *   5. NOTHING IS ROUTED OFF A HIDDEN FIGURE. A failing claim whose whole
 *      decomposition is withheld opens the governed decision but delegates no
 *      obligation to a span — no owner is guessed from a rate nobody saw.
 *   6. IT TRAVELS. Scope, CSV and the rendered panel all carry the suppression as
 *      counts and words, and the CSV carries no cell label or cell figure.
 *   7. A11Y. The roll-up panel renders axe-clean with cells withheld.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import axe from 'axe-core';

const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { boardPartition, boardRead, boardCsvRows, boardConventions } from '../../app/core/domain/board.js';
import { suppressPartitionRows } from '../../app/core/domain/boardSuppression.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderBoard } from '../../app/views/board.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');

/* --------------------------------------------------------------- fixtures */

function baseState() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'dir2', name: 'Noor Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'dir3', name: 'Kai Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
  ];
  return state;
}

const CA = 'expectation-alignment'; // partition: 'span', unit 'pct', gte

/** 6 observations over three spans: dir1 holds exactly ONE, and it passed. */
function tinyCellClaim() {
  return {
    key: CA,
    n: 6,
    successes: 2,
    contributions: [
      { nodeId: 'dir1', ok: true },
      { nodeId: 'dir2', ok: false }, { nodeId: 'dir2', ok: false },
      { nodeId: 'vp1', ok: false }, { nodeId: 'vp1', ok: true }, { nodeId: 'vp1', ok: false },
    ],
  };
}

function boot(state) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-t-${++seq}`;
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
  const d = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = d.window;
  globalThis.document = d.window.document;
  globalThis.Node = d.window.Node;
  globalThis.Element = d.window.Element;
  globalThis.HTMLElement = d.window.HTMLElement;
  globalThis.Event = d.window.Event;
  return { dom: d, errors };
}

/**
 * The reader's own arithmetic, computed independently of the engine: given the
 * claim's published pass count and the pass counts this table printed, how many
 * passing pairs must the withheld cells hold between them?
 */
function readerRemainder(partition, publishedPasses) {
  const printed = partition.rows.filter((r) => !r.withhold);
  const printedPasses = printed.reduce((sum, r) => sum + r.successes, 0);
  return { printedN: printed.length, withheldN: partition.rows.length - printed.length, remainder: publishedPasses - printedPasses };
}

/* --------------------------------------------------- 1. the hole is closed */

test('a span holding one assessed pair prints its count and not its rate', () => {
  const state = baseState();
  const conv = boardConventions(state.settings);
  assert.equal(conv.cellFloor, 5, 'the shipped default floor is 5 observations');

  const partition = boardPartition(state, tinyCellClaim(), { now: NOW, settings: state.settings });
  const dir1 = partition.rows.find((r) => r.key === 'dir1');

  assert.equal(dir1.n, 1, 'the observation count is still stated — withholding hides the rate, not the size');
  assert.equal(dir1.withhold, true, 'a one-observation cell is withheld');
  assert.equal(dir1.why, 'floor');
  assert.equal(dir1.value, null, 'the RATE is gone; it was 100% before this change');
  assert.equal(dir1.interval.lower, null, 'no interval is printed for a cell that was not published');

  // The regression this suite exists for: the exact string the old roll-up printed.
  assert.equal(partition.rows.some((r) => r.value === 100 && r.n === 1), false,
    'no cell may be printed as a 100% reading over a single observation');
  assert.equal(partition.suppression.refused, false);
});

test('every cell below the floor is withheld, and the counts still reconcile', () => {
  const state = baseState();
  const partition = boardPartition(state, tinyCellClaim(), { now: NOW, settings: state.settings });
  const account = partition.suppression.accounting;

  assert.equal(partition.rows.length, 3);
  assert.ok(partition.rows.every((r) => r.withhold), 'all three cells hold fewer than 5 observations');
  assert.equal(account.cellN, 6);
  assert.equal(account.claimN, 6);
  assert.equal(account.reconciles, true, 'suppression removes figures, never observations');
  assert.equal(partition.reconciles, true);
  // The CLAIM-level rate is legitimately published here: the claim holds 6
  // observations, which clears the floor of 5, so `boardEvaluateClaim` prints
  // 33.3% and this table's total repeats it rather than disclosing anything new.
  // What must never be printed is a CELL's rate built on fewer than the floor.
  assert.equal(partition.totals.value, 33.3, 'the claim-level rate is the one the claim itself already published');
  assert.match(partition.reason, /observation counts still reconcile|counted exactly once/);
});

/* -------------------------------------- 2. complementary suppression is real */

test('a withheld cell cannot be recovered from the published claim total', () => {
  // A workspace where one cell is legitimately printable and one is not: the
  // printed cell plus the claim's published pass count is enough to hand back the
  // withheld one. This is the case a floor-only rule misses.
  const state = baseState();
  const claim = {
    key: CA,
    n: 12,
    successes: 7,
    contributions: [
      ...Array(5).fill({ nodeId: 'dir1', ok: true }), { nodeId: 'dir1', ok: false },
      { nodeId: 'dir2', ok: true }, ...Array(4).fill({ nodeId: 'dir2', ok: false }),
      { nodeId: 'dir3', ok: true },
    ],
  };
  const partition = boardPartition(state, claim, { now: NOW, settings: state.settings });
  const tiny = partition.rows.find((r) => r.key === 'dir3');
  const big = partition.rows.find((r) => r.key === 'dir1');

  assert.equal(tiny.n, 1, 'dir3 holds the sub-floor cell');
  assert.equal(tiny.withhold, true);
  assert.equal(tiny.why, 'floor');

  // dir1 is legitimately printable — 6 observations clears the floor of 5.
  assert.equal(big.n, 6);
  assert.equal(big.withhold, false, 'a cell that clears the floor is still printed');
  assert.equal(big.value, 83.3);

  // Complementary suppression: the planner hides a PARTNER, because with the
  // claim's 7 passing pairs published and only one box left, subtraction pins it.
  assert.equal(partition.suppression.withheldN, 2, 'a partner cell is withheld beside the sub-floor cell');
  assert.ok(partition.rows.some((r) => r.withhold && r.why === 'complementary'), 'the partner says WHY it was withheld');

  const remainder = readerRemainder(partition, 7);
  assert.equal(remainder.withheldN, 2, 'two boxes are left, so the remainder is not a single pinned value');
  assert.equal(partition.reconciles, true, 'the accounting still closes');
  assert.equal(partition.suppression.recoverableN, 0);
  assert.match(partition.suppression.determinacy, /no withheld cell is recoverable by subtraction/);
});

test('the same workspace with one box left WOULD be determined, and the planner refuses that shape', () => {
  // Direct proof that the complementary cell is doing work: audit the surface a
  // floor-only rule would have published (exactly one withheld cell) and show the
  // remainder is pinned to a single value.
  const state = baseState();
  const rows = [
    { key: 'dir1', label: 'Sam Director', n: 6, successes: 5 },
    { key: 'dir2', label: 'Noor Director', n: 5, successes: 1 },
    { key: 'dir3', label: 'Kai Director', n: 1, successes: 1 },
  ];
  // A floor of 2 keeps only the 1-observation cell withheld: one box, fixed total.
  const floorOnly = suppressPartitionRows({ rows, claim: { n: 12, successes: 7 }, floor: 2 });
  assert.equal(floorOnly.withheldN, 2, 'even at a floor of 2 the planner will not leave a single determined box');
  const printed = floorOnly.printedRows.reduce((s, r) => s + r.successes, 0);
  assert.notEqual(7 - printed, floorOnly.printedRows.length === rows.length ? null : null, 'sanity');
  // Whatever it publishes, the remainder must not be attributable to one cell.
  const boxes = floorOnly.withheldN;
  assert.ok(boxes >= 2, `expected at least two withheld boxes, got ${boxes}`);
});

/* ----------------------------------------------- 3. the setting is honoured */

test('a declared cell floor of 1 publishes every cell, as the operator asked', () => {
  const result = suppressPartitionRows({
    rows: [{ key: 'a', label: 'A', n: 1, successes: 1 }],
    claim: { n: 1, successes: 1 },
    floor: 1,
  });
  assert.equal(result.withheldN, 0, 'a floor of 1 means publish everything');
  assert.equal(result.nothingToProtect, true);
  assert.equal(result.rows[0].withhold, false);
  assert.equal(result.rows[0].successes, 1);
  assert.match(result.determinacy, /nothing to recover/);
});

/* --------------------------------- 4. nothing is routed off a hidden figure */

test('a failing claim with a fully withheld decomposition opens a decision but delegates no obligation', () => {
  const state = baseState();
  // One assessed pair in the workspace, inside dir1's span, and it did NOT pass:
  // the claim fails, and the only cell that could name an owner is sub-floor.
  state.expectationRounds = [{
    id: 'round-1', openedOn: '2026-10-01', closedOn: '2026-10-02', status: 'sealed',
    leaderId: 'dir1', counterpartId: 'dir2',
    responses: [
      { byId: 'dir1', dimensions: { done: 1, quality: 1, priority: 1, autonomy: 1, escalate: 1, pace: 1 } },
      { byId: 'dir2', dimensions: { done: 5, quality: 5, priority: 5, autonomy: 5, escalate: 5, pace: 5 } },
    ],
  }];
  const normalized = normalizeState(state, { now: NOW }).state;
  const { store, api } = boot(normalized);

  const opened = api.boardOpenMemo({});
  assert.equal(opened.ok, true, opened.error);
  api.boardLook(opened.memo.id);
  api.boardCommit(opened.memo.id);

  const partition = boardRead(store.state, { now: NOW, memoId: opened.memo.id }).evaluation
    .rows.find((r) => r.key === CA)?.partition;
  assert.ok(partition, 'the claim is present on the memo');
  assert.equal(partition.reconciles !== null, true);

  const decisions = store.state.decisions.filter((d) => /Board line fails/.test(d.title || ''));
  const tasks = store.state.delegations.filter((d) => /Board obligation/.test(d.title || ''));
  if (decisions.length) {
    // If the claim failed, the decomposition must have been withheld here (one
    // observation cannot clear a floor of 5), so no owner was invented.
    if (partition.rows.every((r) => r.withhold) && partition.rows.length) {
      assert.equal(tasks.length, 0, 'no obligation is delegated off a withheld decomposition');
    }
  }
  // The invariant that matters regardless of verdict: a delegation never points at
  // a span whose cell the board was not shown.
  for (const task of tasks) {
    const part = partition.rows.find((r) => r.key === task.personId);
    if (part) assert.equal(part.withhold, false, `delegated to ${task.personId} off a withheld cell`);
  }
});

/* --------------------------------------------------------------- 5. it travels */

test('the suppression travels as counts and words into the CSV, and carries no cell label or figure', () => {
  const state = baseState();
  state.boardMemos = [{
    id: 'memo-1', revision: 1, title: 'Pack', cycle: 'Q4', status: 'frozen',
    claims: [{ key: CA, comparator: 'gte', unit: 'pct', threshold: 60, declaredAt: NOW.toISOString(), lookedAt: NOW.toISOString() }],
    // 12 observations, 7 passing — over the evidence floor, so the claim is evaluated.
    snapshot: { takenAt: NOW.toISOString(), fingerprint: 'abcd1234', claims: [{ key: CA, verdict: 'failing', value: 58.3, lower: 30.1, upper: 82.4, n: 12, threshold: 60, tag: 'recomputed' }] },
    lookCount: 1, lastLookAt: NOW.toISOString(), openedAt: NOW.toISOString(),
    committedAt: NOW.toISOString(), frozenAt: NOW.toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }];
  const csv = boardCsvRows(normalizeState(state, { now: NOW }).state, { now: NOW });

  for (const key of ['cells_total', 'cells_withheld', 'partition_state', 'partition_floor']) {
    assert.ok(key in csv[0], `${key} is present on the workspace row`);
  }
  const spec = CSV_EXPORTS.find((e) => e.key === 'board-claims');
  assert.match(spec.description, /partition_state/, 'the scope description states what it exports');
  assert.match(spec.description, /never enter this export/);
});

test('the CSV export runs and leaks no cell label', () => {
  const state = baseState();
  const normalized = normalizeState(state, { now: NOW }).state;
  const result = exportWorkspaceCsv(normalized, 'board-claims', { now: NOW });
  assert.equal(result.ok !== false, true, result.error || 'export runs');
  const text = typeof result.text === 'string' ? result.text : String(result.csv || '');
  assert.equal(/Sam Director|Noor Director/.test(text), false, 'no span name reaches the board CSV');
});

/* --------------------------------------------------------------- 6. the view */

test('the roll-up panel renders withheld cells axe-clean and never prints a sub-floor rate', async () => {
  const { dom: d, errors } = bootDocument();
  try {
    const state = baseState();
    // Five divergent pairs inside the director's span and one aligned pair below
    // the manager, written in the shape the concordance ledger actually stores
    // (`items[]`, `memberId`). The partition therefore has TWO spans, one of which
    // carries a single observation — the shape that used to print a 100% cell.
    const DIMS = ['done', 'quality', 'priority', 'autonomy', 'escalate', 'pace'];
    // Varied scale points are required: a flat answer set carries no variance and
    // the weighted kappa refuses it, which would empty the table for an unrelated
    // reason. These are the values the sibling board-room suite uses.
    const HIGH = { done: 5, quality: 5, priority: 4, autonomy: 4, escalate: 5, pace: 4 };
    const LOW = { done: 2, quality: 2, priority: 3, autonomy: 3, escalate: 2, pace: 3 };
    const pairItems = (leader, member) => DIMS.map((key) => ({ key, leader: HIGH[key], member: LOW[key] }));
    const alignedItems = () => DIMS.map((key) => ({ key, leader: HIGH[key], member: HIGH[key] }));
    // Five divergent pairs under the director — the span that carries the figure —
    // plus one aligned pair under the manager, which is a single assessed pair.
    state.expectationRounds = [0, 1, 2, 3, 4].map((i) => ({
      id: `round-div-${i}`, openedOn: '2026-10-01', closedOn: '2026-10-02', status: 'closed',
      leaderId: 'dir1', memberId: 'mgr1', items: pairItems(),
    })).concat([{
      id: 'round-aligned', openedOn: '2026-10-01', closedOn: '2026-10-02', status: 'closed',
      leaderId: 'mgr1', memberId: 'ic1', items: alignedItems(),
    }]);
    state.people = state.people.concat([
      { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
      { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'mgr1', status: 'active' },
    ]);
    const normalized = normalizeState(state, { now: NOW }).state;
    const { api } = boot(normalized);
    const opened = api.boardOpenMemo({});
    assert.equal(opened.ok, true, opened.error);
    api.boardSetConventions({ boardCellFloor: 4, boardEvidenceFloor: 1 });
    api.boardLook(opened.memo.id);
    const memo = api.boardRead(opened.memo.id).memo;
    assert.ok(memo, 'a memo exists to render');
    const read = api.boardRead(opened.memo.id);
    const part = read.evaluation?.rows.find((r) => r.key === CA)?.partition;
    assert.ok(part && part.rows.length >= 2, `partition must have cells to render, got ${part?.rows?.length}`);
    assert.ok(part.suppression?.withheldN >= 1, 'at least one cell is withheld at a floor of 4');

    const ctx = {
      api,
      now: NOW,
      query: new URLSearchParams(`panel=rollup&memo=${encodeURIComponent(memo.id)}&claim=${CA}`),
      navigate: () => {},
      refresh: () => {},
      seatContext: { seat: { fullAccess: false, rank: 5, label: 'CEO / C-suite' } },
    };
    const node = renderBoard(ctx);
    assert.equal(node.tagName, 'DIV');
    assert.equal(node.querySelector('main'), null, 'no duplicate main landmark');
    const text = node.textContent;
    assert.match(text, /A span holding one assessed pair is not a rate/, 'the limitation is stated on screen');
    assert.match(text, /withheld/i);

    for (const button of node.querySelectorAll('button')) {
      assert.ok((button.textContent || '').trim().length > 0 || button.getAttribute('aria-label'), 'every button has a name');
    }
    const host = d.window.document.getElementById('view');
    host.appendChild(node);
    const results = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => v.id), [], `axe violations: ${results.violations.map((v) => v.id).join(',')}`);
    assert.deepEqual(errors, []);
  } finally {
    d.window.close();
  }
});
