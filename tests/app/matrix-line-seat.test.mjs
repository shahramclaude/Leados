/**
 * ADR-0141 — the second line's seat (Schema v119 unchanged).
 *
 * The gap this pins is a READ-SIDE matrix failure, not a missing write. RULE-MTX-01
 * already fans work about a multi-line person to EVERY manager in that person's
 * reporting set. The Operating Seat then resolved that work through
 * `person.managerId` alone, so:
 *
 *   - a project/product manager holding people only on a declared line has
 *     `span = 0`, which meant NO SEAT — choosing them as the operating seat
 *     resolved to the read-only fallback and the whole workspace locked;
 *   - `canSee` scoped a record to `seat.scope` (the tree subtree), so the very
 *     manager the work had been fanned to was DENIED their own item;
 *   - nothing counted the open work a single-chain seat silently drops.
 *
 * These tests pin the fix AND the boundaries it must not cross:
 *  1. The line-scope sets are derived from the matrix engine, not a second one.
 *  2. A line manager gets a seat and can read the people their line carries.
 *  3. The widening is never sideways: one outsider in the record still denies it.
 *  4. A line holder the roster gives no altitude is REFUSED a seat, with the
 *     reason printed — never given a rung that does not exist.
 *  5. A workspace with no declared line is byte-identical to before.
 *  6. The panel's split reconciles exactly, and the CSV displays the computed
 *     figures (display-vs-stored).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import {
  buildSeats, resolveSeat, canSee, seatDigest, seatReport,
} from '../../app/core/domain/seat.js';
import {
  buildMatrix, matrixLineScope, matrixLineScopeFor, matrixWorkReach,
  buildMatrixReport, matrixCsvRows, matrixBriefText,
} from '../../app/core/domain/matrix.js';
import { harvestWork } from '../../app/core/domain/chain.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { MATRIX_CSV_COLUMNS } from '../../app/core/domain/matrixRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

const NOW = new Date('2026-11-08T12:00:00.000Z');
const STAMP = '2026-01-01T00:00:00.000Z';

function roster() {
  return [
    { id: 'ceo', name: 'Ada Chief', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'engdir', name: 'Eve Director', level: 'director', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'ivy', name: 'Ivy Outside', level: 'ic', managerId: 'ceo', status: 'active', createdAt: STAMP },
  ];
}

function line(id, personId, managerId, kind, shareH, extra = {}) {
  return {
    id, personId, managerId, kind, shareH, rights: [],
    fromISO: '2026-01-01', toISO: null, declaredAt: STAMP, status: 'active',
    history: [], ...extra,
  };
}

function workspace(lines = [], people = roster()) {
  const state = createEmptyState(NOW.toISOString());
  state.people = people;
  state.reportingLines = lines;
  state.goals = [
    { id: 'g-sam', title: 'Migrate the billing service', ownerId: 'sam', status: 'open', createdAt: STAMP, dueOn: '2026-10-01' },
    { id: 'g-kim', title: 'Weekly ops review', ownerId: 'kim', status: 'open', createdAt: STAMP, dueOn: '2026-11-30' },
    { id: 'g-ivy', title: 'Vendor review', ownerId: 'ivy', status: 'open', createdAt: STAMP, dueOn: '2026-11-30' },
  ];
  return normalizeState(state).state;
}

const TWO_LINES = () => [
  line('l-sam', 'sam', 'pmdir', 'project', 40),
  line('l-kim', 'kim', 'pmdir', 'product', 30),
];

/* ---------------------------------------------- 1. the sets come from the engine */

test('the line-scope is derived from the matrix graph, and names the tree-hidden subset', () => {
  const state = workspace(TWO_LINES());
  const matrix = buildMatrix(state, { now: NOW, settings: {} });
  const scope = matrixLineScope(matrix);

  assert.deepEqual([...scope.byManager.keys()], ['pmdir'], 'only the declared line holder');
  const entry = scope.byManager.get('pmdir');
  assert.deepEqual(entry.personIds, ['kim', 'sam'], 'deterministic ordering');
  assert.equal(entry.lineN, 2);
  assert.deepEqual(entry.kinds, ['product', 'project']);
  assert.deepEqual(entry.lineOnlyIds, ['kim', 'sam'], 'the tree puts neither of them under her');

  const row = scope.rows.find((r) => r.managerId === 'pmdir');
  assert.equal(row.treeSpanN, 0, 'the tree gave her no span at all');
  assert.equal(row.matrixSpanN, 2, 'the matrix did');
  assert.equal(row.seatEligible, true, 'her roster title carries an altitude, so the rung is hers');
  assert.equal(row.seatReason, null);

  // The home line is NOT duplicated into the scope: it is the tree's job.
  assert.equal(scope.byManager.has('engdir'), false, 'the home line creates no line-scope entry');
});

/* ---------------------------------------------- 2. the seat that did not exist */

test('a line-only manager has no seat without the lines, and one with them', () => {
  const state = workspace(TWO_LINES());

  const closed = buildSeats(state, { now: NOW, settings: {} });
  assert.equal(closed.byId.has('pmdir'), false, 'without the declared lines the tree seats her nowhere');
  const fallback = resolveSeat(closed, 'pmdir');
  assert.equal(fallback.readOnly, true, 'the seat resolved to the fail-closed read-only view');
  assert.equal(fallback.unresolvedSeatId, 'pmdir');

  const scope = matrixLineScopeFor(state, { now: NOW, settings: {} });
  const open = buildSeats(state, { now: NOW, settings: {}, lineScope: scope });
  const seat = resolveSeat(open, 'pmdir');
  assert.equal(seat.readOnly, undefined, 'the line gives her a real seat');
  assert.equal(seat.lineScopeN, 2);
  assert.equal(seat.lineOnlyN, 2);
  assert.equal(seat.matrixScopeN, seat.scopeN + 2);
  assert.equal(seat.rank, 3, 'her altitude comes from the roster title, not from the line');
});

test('the manager the work was fanned to can finally read it — with the route named', () => {
  const state = workspace(TWO_LINES());
  const scope = matrixLineScopeFor(state, { now: NOW, settings: {} });
  const built = buildSeats(state, { now: NOW, settings: {}, lineScope: scope });
  const seat = resolveSeat(built, 'pmdir');
  const goal = state.goals.find((g) => g.id === 'g-sam');

  const verdict = canSee(goal, 'goals', seat, built);
  assert.equal(verdict.allow, 'full', 'her own person’s goal is readable');
  assert.equal(verdict.viaLine, true, 'and the verdict says WHICH route carried it');
  assert.equal(verdict.lineScopedN, 1);

  // The functional manager is unaffected.
  const engdir = resolveSeat(built, 'engdir');
  const treeVerdict = canSee(goal, 'goals', engdir, built);
  assert.equal(treeVerdict.allow, 'full');
  assert.equal(treeVerdict.viaLine, false, 'a tree route is not reported as a line route');
});

test('the seat digest counts the line reach separately and reconciles exactly', () => {
  const state = workspace(TWO_LINES());
  const scope = matrixLineScopeFor(state, { now: NOW, settings: {} });
  const built = buildSeats(state, { now: NOW, settings: {}, lineScope: scope });
  const seat = resolveSeat(built, 'pmdir');
  const digest = seatDigest(state, seat, built, { now: NOW, settings: {} });

  assert.equal(digest.counts.openN, 2, 'both of her people’s open goals');
  assert.equal(digest.counts.viaLineN, 2, 'both arrive only through the line');
  assert.equal(digest.counts.treeOpenN, 0, 'the tree puts neither under her');
  assert.equal(digest.counts.treeOpenN + digest.counts.viaLineN, digest.counts.openN,
    'the two columns add to the printed total — an exact integer identity');

  // Nothing is invented: the outsider’s goal is in neither column.
  const harvested = harvestWork(state, built.chain, { now: NOW, settings: {} });
  const ivyItems = harvested.filter((i) => i.people.includes('ivy'));
  assert.ok(ivyItems.length > 0, 'the outsider does have open work');
  assert.equal(digest.counts.openN, harvested.length - ivyItems.length,
    'her reading is exactly the items about her people and nothing else');
});

/* ---------------------------------------------- 3. never sideways */

test('one person reachable through neither the tree nor the line still denies the record', () => {
  const state = workspace(TWO_LINES());
  const scope = matrixLineScopeFor(state, { now: NOW, settings: {} });
  const built = buildSeats(state, { now: NOW, settings: {}, lineScope: scope });
  const seat = resolveSeat(built, 'pmdir');

  const mixed = { id: 'mixed', title: 'Cross-division review', ownerId: 'sam', involvedPersonIds: ['ivy'], status: 'open' };
  const verdict = canSee(mixed, 'cases', seat, built);
  assert.equal(verdict.allow, 'denied', 'the matrix widens a seat to its own line, never sideways');
  assert.match(verdict.reason, /names people outside/);
  assert.match(verdict.reason, /through neither/, 'the refusal names how many arrive by no route at all');
});

test('a peer with no line to them remains outside', () => {
  const state = workspace(TWO_LINES());
  const scope = matrixLineScopeFor(state, { now: NOW, settings: {} });
  const built = buildSeats(state, { now: NOW, settings: {}, lineScope: scope });
  const pm = resolveSeat(built, 'pmdir');
  const eng = resolveSeat(built, 'engdir');

  const ivyGoal = state.goals.find((g) => g.id === 'g-ivy');
  assert.equal(canSee(ivyGoal, 'goals', pm, built).allow, 'denied');
  assert.equal(canSee(ivyGoal, 'goals', eng, built).allow, 'denied', 'a peer director is not widened either');
});

/* ---------------------------------------------- 4. refuse, never invent a rung */

test('a line holder the roster gives no leadership altitude is refused a seat, with the reason', () => {
  const people = roster().map((p) => (p.id === 'ivy' ? { ...p, level: 'ic', managerId: 'engdir' } : p));
  const lines = [line('l-ivy', 'sam', 'ivy', 'project', 50), line('l-ivy2', 'kim', 'ivy', 'project', 50)];
  const state = workspace(lines, people);
  const scope = matrixLineScopeFor(state, { now: NOW, settings: {} });
  assert.ok(scope, 'the scope exists');
  const built = buildSeats(state, { now: NOW, settings: {}, lineScope: scope });

  assert.equal(built.byId.has('ivy'), false, 'no rung is invented for her');
  assert.equal(built.refusedLineSeats.length, 1);
  const refusal = built.refusedLineSeats[0];
  assert.equal(refusal.id, 'ivy');
  assert.equal(refusal.lineScopeN, 2);
  assert.match(refusal.reason, /no leadership altitude/);
  assert.match(refusal.reason, /refused rather than invented/);

  const report = buildMatrixReport(state, { now: NOW, settings: {} });
  assert.equal(report.seats.refusedN, 1, 'the panel counts it');
  assert.equal(report.seats.seatableN, 0);
  assert.equal(report.seats.refused[0].managerId, 'ivy');
  assert.match(matrixBriefText(report), /refused a seat rather than invented/);
});

/* ---------------------------------------------- 5. the single-chain no-op */

test('a workspace that declares no line is byte-identical to the pre-0141 seat', () => {
  const state = workspace([]);
  assert.equal(matrixLineScopeFor(state, { now: NOW, settings: {} }), null, 'no lines → no injection at all');

  const bare = buildSeats(state, { now: NOW, settings: {} });
  const injected = buildSeats(state, { now: NOW, settings: {}, lineScope: null });
  assert.deepEqual(
    bare.seats.map((s) => Object.keys(s).sort()),
    injected.seats.map((s) => Object.keys(s).sort()),
    'not one line field appears on a single-chain seat',
  );
  assert.equal(bare.refusedLineSeats.length, 0);

  const scope = resolveSeat(bare, 'engdir');
  assert.equal(scope.lineScope, undefined);
  const goal = state.goals.find((g) => g.id === 'g-sam');
  const verdict = canSee(goal, 'goals', scope, bare);
  assert.equal(verdict.allow, 'full');
  assert.equal(verdict.viaLine, false);

  const digest = seatDigest(state, scope, bare, { now: NOW, settings: {} });
  assert.equal(digest.counts.viaLineN, 0);
  assert.equal(digest.counts.treeOpenN, digest.counts.openN, 'everything the seat sees came through the tree');

  const report = buildMatrixReport(state, { now: NOW, settings: {} });
  assert.equal(report.seats.managerN, 0);
  assert.equal(report.seats.workLineOnlyN, 0);
  assert.equal(report.seats.workSharedN, 0);
  assert.equal(report.seats.identityHolds, true);
});

/* ---------------------------------------------- 6. ownership is named, not picked */

test('an item is owned by every accounting manager and by none exclusively', () => {
  const state = workspace(TWO_LINES());
  const matrix = buildMatrix(state, { now: NOW, settings: {} });
  const scope = matrixLineScope(matrix);
  const items = harvestWork(state, matrix.chain, { now: NOW, settings: {} });
  const reach = matrixWorkReach(matrix, scope, items);

  const samItem = reach.find((r) => r.entityId === 'g-sam');
  assert.ok(samItem);
  assert.equal(samItem.treeOwnerNodeId, 'engdir', 'the tree names one owner');
  assert.deepEqual(samItem.sites, ['engdir', 'pmdir'], 'the matrix names both, and picks neither');
  assert.equal(samItem.shared, true);
  assert.equal(samItem.lineManagers.length, 1);
  assert.equal(samItem.lineManagers[0].managerId, 'pmdir');
  assert.equal(samItem.lineManagers[0].lineOnly, true, 'that manager is reachable only through the line');

  const ivyItem = reach.find((r) => r.entityId === 'g-ivy');
  assert.equal(ivyItem.shared, false, 'no line reaches Ivy, so the tree answer stands alone');
  assert.deepEqual(ivyItem.sites, ['ceo']);
});

/* ---------------------------------------------- 7. the panel and the file */

test('the seats panel reconciles, and the CSV displays the computed figures', () => {
  const state = workspace(TWO_LINES());
  const report = buildMatrixReport(state, { now: NOW, settings: {} });
  const s = report.seats;

  assert.equal(s.managerN, 1);
  assert.equal(s.peopleOnLinesN, 2);
  assert.equal(s.lineOnlyPeopleN, 2);
  assert.equal(s.seatableN, 1);
  assert.equal(s.refusedN, 0);
  assert.equal(s.identityHolds, true, 'the printed split reconciles');
  assert.equal(s.workTreeN + s.workLineOnlyN, s.workTotalN, 'tree + line-only = total, exactly');
  assert.equal(s.workSharedN, 2, 'both of her people’s items have two accountable managers');

  const row = s.rows[0];
  assert.equal(row.matrixSpanN, row.treeSpanN + row.lineOnlyN, 'the matrix span is the tree span plus what only the line adds');

  const rows = matrixCsvRows(report);
  for (const csvRow of rows) for (const key of Object.keys(csvRow)) assert.ok(MATRIX_CSV_COLUMNS.includes(key), `column ${key} is declared`);

  const workspaceRow = rows.find((r) => r.row_kind === 'workspace');
  assert.equal(workspaceRow.line_scope_n, s.peopleOnLinesN, 'the workspace row shows the computed count');
  assert.equal(workspaceRow.line_only_n, s.lineOnlyPeopleN);
  assert.equal(workspaceRow.line_work_n, s.workLineOnlyN);
  assert.equal(workspaceRow.line_work_shared_n, s.workSharedN);

  const seatRow = rows.find((r) => r.row_kind === 'seat');
  assert.ok(seatRow, 'the seat block is exported');
  assert.equal(seatRow.line_scope_n, row.linePersonN);
  assert.equal(seatRow.line_only_n, row.lineOnlyN);
  assert.equal(seatRow.manager_direct_n, row.treeSpanN);
  assert.equal(seatRow.seat_state, 'seated');
  // Aggregate-only: a named line holder below the cell floor is withheld.
  assert.equal(seatRow.withheld, 'yes');
  assert.equal(seatRow.scope, 'withheld');
  assert.match(seatRow.withheld_reason, /item detail/);
});

/* ---------------------------------------------- 8. the gate agrees with the panel */

test('the API gate resolves a line-only manager instead of locking the workspace', () => {
  const state = workspace(TWO_LINES());
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const result = guardApiCall(state, 'routingConfirm', ['R1'], NOW.getTime());
  assert.equal(result.ok, true, result.error || 'the declared seat is resolvable');
  assert.equal(result.seat.id, 'pmdir');
  assert.equal(result.seat.lineScopeN, 2);
});

test('the seat read model reports the line reach for the operating seat', () => {
  const state = workspace(TWO_LINES());
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const scope = matrixLineScopeFor(state, { now: NOW, settings: state.settings });
  const report = seatReport(state, { now: NOW, settings: state.settings, lineScope: scope });
  assert.equal(report.seat.id, 'pmdir');
  assert.equal(report.digest.counts.openN, 2);
  assert.equal(report.digest.counts.viaLineN, 2);
  assert.equal(report.digest.lineScopeN, 2);
  assert.equal(report.digest.matrixScopeN, report.digest.scopeN + 2);
  const listed = report.allSeats.find((s) => s.id === 'pmdir');
  assert.equal(listed.lineOnlyN, 2, 'the seat picker can show what the line adds');
});

/* ---------------------------------------------- 9. the panel renders */

test('the seats panel renders, states the reconciliation, and is axe-clean', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://leados.test/', virtualConsole });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  dom.window.axe = undefined;
  dom.window.eval(AXE_SRC);
  globalThis.axe = dom.window.axe;

  const report = buildMatrixReport(workspace(TWO_LINES()), { now: NOW, settings: {} });
  const node = renderMatrix({
    api: { matrixReport: () => ({ ok: true, report }) },
    query: new URLSearchParams('panel=seats'),
    navigate() {},
    refresh() {},
  });
  dom.window.document.body.append(node);

  const text = node.textContent;
  assert.match(text, /Seats/);
  assert.match(text, /only through a declared line/, 'the split is stated on the page');
  assert.doesNotMatch(text, /0\.00 of a person is attributed across 0/, 'no invented figure');
  assert.ok(text.includes(String(report.seats.workLineOnlyN)), 'the counted figure is printed');

  const results = await dom.window.axe.run(node, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  assert.deepEqual(results.violations.map((v) => v.id), [], 'no axe violations');
  assert.deepEqual(errors, [], 'no jsdom errors');
});
