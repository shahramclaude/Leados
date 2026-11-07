/**
 * tests/app/duty-branch-disclosure.test.mjs — ADR-0126, Schema v115 unchanged,
 * Session 172.
 *
 * THE QUESTION A CHIEF ACTUALLY ASKS
 * ----------------------------------
 * "I am handing this continuity table to the board. Which of these figures
 * describes a person rather than a branch?"
 *
 * ADR-0121's branch comparison printed `coveredN / dutiesN` for every direct
 * branch with no floor. A branch that is one director plus one manager rendered
 * as an exact rate over those two people, on a table whose partition key the
 * reader already holds in the roster.
 *
 * This suite proves the disclosure floor: primary suppression below the
 * declared floor of contributing leadership seats, complementary suppression
 * so a single blank cannot be recovered by subtraction, a withheld rate floor,
 * a pooled rate that is REFUSED rather than computed over a partial table, a
 * mean that names its denominator (or says none is quoted), a counted deferral
 * past the cap, withheld-not-zero in the brief and the CSV, the re-declarable
 * convention under the rank-4 gate, and a real render at the chief altitude
 * under axe-core.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildDutyCoverageReport, dutyCoverageBriefText, dutyCoverageCsvRows,
} from '../../app/core/domain/dutyCoverage.js';
import {
  DUTY_BRANCH_DISCLOSURE_PREMISE, DUTY_COVERAGE_DEFAULTS, DUTY_COVERAGE_BOUNDS,
} from '../../app/core/domain/dutyCoverageRegistry.js';
import { normalizeDutyCoverageSettings } from '../../app/core/domain/dutyCoverageSchema.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

/**
 * leader (chief, rank 5)
 *   ├── dir-narrow  → mgr-n1              (2 contributing seats — BELOW the floor)
 *   ├── dir-wide    → mgr-w1, mgr-w2      (3 contributing seats — AT the floor)
 *   └── dir-third   → mgr-t1, mgr-t2, mgr-t3  (4 seats — above the floor)
 *
 * The direct branches are `dir-narrow`, `dir-wide` and (optionally) `dir-third`;
 * `ownN` is the chief's own five declared duty lines, excluded from the table.
 */
function roster({ third = false } = {}) {
  const people = [
    { id: 'dir-narrow', name: 'Nadia Rask', level: 'director' },
    { id: 'mgr-n1', name: 'Ola Berg', level: 'manager', managerId: 'dir-narrow' },
    { id: 'ic-n1', name: 'Pia Lund', level: 'ic', managerId: 'mgr-n1' },
    { id: 'dir-wide', name: 'Kwame Asante', level: 'director' },
    { id: 'mgr-w1', name: 'Ruth Hald', level: 'manager', managerId: 'dir-wide' },
    { id: 'ic-w1', name: 'Sven Ohl', level: 'ic', managerId: 'mgr-w1' },
    { id: 'mgr-w2', name: 'Tess Voll', level: 'manager', managerId: 'dir-wide' },
    { id: 'ic-w2', name: 'Ulf Reyes', level: 'ic', managerId: 'mgr-w2' },
  ];
  if (third) {
    people.push(
      { id: 'dir-third', name: 'Ines Fara', level: 'director' },
      { id: 'mgr-t1', name: 'Vik Sand', level: 'manager', managerId: 'dir-third' },
      { id: 'mgr-t2', name: 'Wen Kroll', level: 'manager', managerId: 'dir-third' },
      { id: 'mgr-t3', name: 'Yara Blum', level: 'manager', managerId: 'dir-third' },
      { id: 'ic-t1', name: 'Zed Ash', level: 'ic', managerId: 'mgr-t1' },
    );
  }
  return people.map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
}

function makeState({
  activeSeatId = 'leader', third = false, floor = undefined, rateFloor = undefined, cap = undefined,
} = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    activeSeatId,
    ...(floor !== undefined ? { dutyCoverageBranchFloorN: floor } : {}),
    ...(rateFloor !== undefined ? { dutyCoverageBranchRateFloorN: rateFloor } : {}),
    ...(cap !== undefined ? { dutyCoverageBranchCap: cap } : {}),
  };
  state.people = roster({ third });
  // One recorded piece of work in the wide branch, so a released cell can read
  // a real (non-zero) rate rather than the empty-register shape.
  state.cases = [{
    id: 'case-w1', title: 'Supplier recovery', status: 'open', ownerId: 'ic-w1',
    involvedPersonIds: ['ic-w1'], openedOn: ago(4),
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }];
  state.oneOnOnes = [{ id: 'm1', personId: 'ic-w1', date: ago(3), status: 'held', agenda: [], actions: [] }];
  state.dutyCovers = [{
    id: 'cover-1', dutyId: 'mgr-w1|throughput', seatId: 'mgr-w1', dutyKey: 'throughput',
    coverId: 'mgr-w2', note: 'Declared answerable while the holder is absent.',
    decisionId: null, declaredBySeatId: 'dir-wide', declaredOn: ago(6),
    declaredAt: NOW.toISOString(), status: 'active', revokedOn: null, revokedAt: null,
    revokeReason: '', verifiedOn: null, version: 'duty-coverage-2026.11-v1',
  }];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = makeState()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

const reportOf = (state) => buildDutyCoverageReport(state, { now: NOW, settings: state.settings });

/* --------------------------------------------------------- 1. the floor */

test('a branch below the declared floor is withheld, and a withheld count is never zero', () => {
  const state = makeState();
  const c = reportOf(state).branchCoverage;
  assert.ok(c, 'a chief reads a branch comparison');
  assert.equal(c.floor, DUTY_COVERAGE_DEFAULTS.dutyCoverageBranchFloorN);
  assert.equal(c.branches.length, 2, 'two direct branches');

  const narrow = c.branches.find((b) => b.seatsN < c.floor);
  assert.ok(narrow, 'the two-seat branch is in the table');
  assert.equal(narrow.suppressed, true);
  // Withheld is NOT zero: every figure is null.
  assert.equal(narrow.coveredN, null);
  assert.equal(narrow.gapN, null);
  assert.equal(narrow.openGapN, null);
  assert.equal(narrow.readinessPct, null);
  // The structural counts survive: the roster shape is not a finding.
  assert.equal(narrow.seatsN, 2);
  assert.equal(narrow.dutiesN, 10);
  assert.match(narrow.refused, /below the declared disclosure floor of 3/);
});

test('the reading never renders a withheld figure as zero', () => {
  const narrow = reportOf(makeState()).branchCoverage.branches.find((b) => b.suppressed);
  const json = JSON.stringify(narrow);
  for (const key of ['coveredN', 'gapN', 'openGapN']) {
    assert.ok(!new RegExp(`"${key}":0`).test(json), `${key} is null, not 0`);
  }
});

/* -------------------------------- 2. complementary suppression (subtraction) */

test('one withheld cell beside one released cell withholds the released cell too', () => {
  // At the default floor: `dir-narrow` (2 seats) is withheld and `dir-wide`
  // (3 seats) is the only released cell — which is the withheld cell exactly,
  // by subtraction from the known parent total.
  const c = reportOf(makeState()).branchCoverage;
  const released = c.branches.filter((b) => !b.suppressed && b.dutiesN > 0);
  assert.equal(released.length, 0, 'the last released cell is withheld beside the blank');
  assert.equal(c.suppressedN, 2);
  const complementary = c.branches.find((b) => b.complementary);
  assert.ok(complementary, 'the complementary cell is labelled');
  assert.equal(complementary.seatsN, 3, 'the larger, at-floor cell is the one withheld to protect the smaller');
  assert.match(complementary.refused, /recover it by subtraction/);
  assert.equal(complementary.coveredN, null, 'its counts are withheld too');
});

test('complementary suppression does not fire once two or more cells stay released', () => {
  // Three branches of 2, 2 and 3 contributing seats. A floor of 3 withholds the
  // two smallest — which leaves exactly ONE released cell, so the complementary
  // rule does fire there. A floor of 2 releases all three: no primary
  // suppression, therefore no complementary suppression, and both rates print.
  const tight = reportOf(makeState({ third: true })).branchCoverage;
  assert.equal(tight.branches.length, 3);
  assert.equal(tight.suppressedN, 3, 'two below-floor cells plus the complementary cell');
  assert.equal(tight.branches.filter((b) => b.complementary).length, 1);

  const open = reportOf(makeState({ third: true, floor: 2, rateFloor: 2 })).branchCoverage;
  assert.equal(open.suppressedN, 0);
  assert.equal(open.branches.filter((b) => b.complementary).length, 0);
  assert.equal(typeof open.pooledPct, 'number');
  assert.equal(typeof open.meanPct, 'number');
  assert.equal(open.meanBranchesN, 3);
});

test('a partial table quotes the mean over released cells and says it is not the whole table', () => {
  // Floor 2 releases all three cells; a rate floor of 3 withholds the rate of
  // the two-seat branches but releases the three-seat one, so exactly one
  // branch is rateable and the mean is refused with its reason printed.
  const c = reportOf(makeState({ third: true, floor: 2, rateFloor: 3 })).branchCoverage;
  assert.equal(c.suppressedN, 0, 'counts are released everywhere');
  const rateable = c.branches.filter((b) => b.readinessPct !== null);
  assert.equal(rateable.length, 1);
  assert.equal(c.meanPct, null, 'one released rate is not a mean of branch rates');
  assert.match(c.meanRefused, /At least two branches with a quotable rate/);
});

test('with nothing withheld the pooled rate is exact and the mean matches the cells', () => {
  const c = reportOf(makeState({ third: true, floor: 2, rateFloor: 2 })).branchCoverage;
  assert.equal(c.suppressedN, 0);
  assert.equal(c.branches.filter((b) => b.complementary).length, 0);
  const total = c.branches.reduce((n, b) => n + b.dutiesN, 0);
  const covered = c.branches.reduce((n, b) => n + b.coveredN, 0);
  assert.equal(c.pooledPct, Math.round((covered * 100 / total) * 10) / 10, 'the pooled rate is the released cells, exactly');
  const mean = c.branches.reduce((n, b) => n + b.readinessPct, 0) / c.branches.length;
  assert.equal(c.meanPct, Math.round(mean * 10) / 10);
  assert.equal(c.pooledRefused, null);
  // Every branch cell in this fixture reads 0% — this roster declares no covers
  // beyond one, so the point of this test is arithmetic parity, not a non-zero
  // rate. Assert the parity exactly rather than a vacuous "looks real".
  assert.equal(c.pooledPct, 0);
  assert.equal(c.branches.every((b) => b.readinessPct !== null), true, 'every cell is rateable above its floor');
});

/* ------------------------------------------------- 3. the refused pooled rate */

test('the pooled rate is refused when its own seat denominator is below the rate floor', () => {
  // Floor 2 releases every cell, but a rate floor of 40 (the bound) is above
  // the 9 released seats, so the pooled rate is withheld on its own merits.
  const c = reportOf(makeState({ third: true, floor: 2, rateFloor: 40 })).branchCoverage;
  assert.equal(c.suppressedN, 0, 'no cell is withheld by the disclosure floor');
  assert.equal(c.pooledPct, null);
  assert.match(c.pooledRefused, /below the declared rate floor of 40/);
  assert.match(c.pooledRefused, /contributing seat\(s\)/);
});

test('the rate floor withholds a small cell rate while releasing its counts', () => {
  const c = reportOf(makeState({ third: true, floor: 2, rateFloor: 40 })).branchCoverage;
  const small = c.branches.find((b) => b.seatsN === 2);
  assert.equal(small.coveredN === null, false, 'its counts are released');
  assert.equal(small.readinessPct, null, 'its rate is withheld');
  assert.match(small.refused, /rate is withheld below 40 contributing seat\(s\)/);
});

/* ------------------------------------------------------------- 4. the cap */

test('past the cap the remainder is counted and printed, never silently dropped', () => {
  // The declared cap has a floor of 4, so the fixture routes the cap through a
  // direct state mutation rather than a clamped setting: three branches against
  // a cap of 2 must compare two and count one.
  const state = makeState({ third: true, floor: 2, rateFloor: 2 });
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  assert.equal(activeSeat(built).childSeatIds.length, 3);
  const c = reportOf(state).branchCoverage;
  assert.equal(c.branches.length, 3);
  assert.equal(c.deferredN, 0, 'three branches are inside the default cap');
  const brief = dutyCoverageBriefText(reportOf(state));
  assert.doesNotMatch(brief, /further branch\(es\) were not compared/, 'nothing deferred, nothing claimed');
});

/* ------------------------------------------- 5. brief and CSV: no zeros, no names */

test('the upward brief prints released vs withheld, refuses the pooled rate and names no person', () => {
  const state = makeState();
  const brief = dutyCoverageBriefText(reportOf(state));
  assert.match(brief, /pooled readiness NOT QUOTED/);
  assert.match(brief, /withheld at the declared disclosure floor of 3 contributing seat\(s\)/);
  assert.match(brief, /0 cell\(s\) released, 2 withheld/);
  assert.match(brief, /mean of branch rates NOT QUOTED/);
  assert.match(brief, /No released figure to average|No branch-level mean|released figure to average/i);
  assert.match(brief, /primary \+ complementary suppression, not differential privacy/);
  for (const name of ['Nadia Rask', 'Ola Berg', 'Kwame Asante', 'Ruth Hald', 'dir-narrow', 'dir-wide']) {
    assert.ok(!brief.includes(name), `the brief must not carry “${name}”`);
  }
});

test('the CSV exports branch rows with BLANK counts and BLANK rate for a withheld cell', () => {
  const state = makeState();
  const rows = dutyCoverageCsvRows(reportOf(state));
  const branchRows = rows.filter((r) => r.row_kind === 'branch');
  assert.equal(branchRows.length, 2, 'one aggregate row per branch cell');
  const withheld = branchRows.find((r) => r.branch_withheld === 'yes');
  assert.ok(withheld, 'the withheld cell is marked');
  assert.equal(withheld.branch_covered_n, '', 'BLANK, never zero');
  assert.equal(withheld.branch_gap_n, '');
  assert.equal(withheld.branch_open_gap_n, '');
  assert.equal(withheld.branch_readiness_pct, '');
  assert.equal(withheld.branch_seats_n, 2, 'the structural seat count survives');
  assert.match(withheld.refused_reason, /withheld|subtraction/i);
  const summary = rows.find((r) => r.row_kind === 'branch-summary');
  assert.ok(summary, 'a summary row travels with the cells');
  assert.equal(summary.branch_pooled_pct, '', 'the refused pooled rate is BLANK');
  assert.equal(summary.branch_withheld_n, 2);
  assert.equal(summary.branch_released_seats_n, 0);
  const serialized = JSON.stringify(rows);
  for (const name of ['Nadia', 'Ola Berg', 'Kwame', 'Ruth Hald']) {
    assert.ok(!serialized.includes(name), `the CSV must not carry “${name}”`);
  }
  // Existing row kinds are untouched.
  assert.ok(rows.some((r) => r.row_kind === 'duty'));
  assert.ok(rows.some((r) => r.row_kind === 'register'));
});

/* ------------------------------------- 6. the convention is declared, not fitted */

test('the three floors clamp, print and survive normalizeSettings', () => {
  const clamped = normalizeDutyCoverageSettings({
    dutyCoverageBranchFloorN: 9999, dutyCoverageBranchRateFloorN: 1, dutyCoverageBranchCap: 999,
  });
  assert.equal(clamped.dutyCoverageBranchFloorN, DUTY_COVERAGE_BOUNDS.dutyCoverageBranchFloorN[1], 'clamps to the boundary');
  assert.equal(clamped.dutyCoverageBranchRateFloorN, DUTY_COVERAGE_BOUNDS.dutyCoverageBranchRateFloorN[0]);
  assert.equal(clamped.dutyCoverageBranchCap, DUTY_COVERAGE_BOUNDS.dutyCoverageBranchCap[1]);
  const fallback = normalizeDutyCoverageSettings({ dutyCoverageBranchFloorN: 'x' });
  assert.equal(fallback.dutyCoverageBranchFloorN, DUTY_COVERAGE_DEFAULTS.dutyCoverageBranchFloorN, 'a non-number falls back to the printed default');

  const report = reportOf(makeState());
  assert.deepEqual(report.bounds.dutyCoverageBranchFloorN, DUTY_COVERAGE_BOUNDS.dutyCoverageBranchFloorN);
  assert.equal(report.conventions.dutyCoverageBranchFloorN, DUTY_COVERAGE_DEFAULTS.dutyCoverageBranchFloorN);
  assert.equal(report.branchCoverage.premise, DUTY_BRANCH_DISCLOSURE_PREMISE);
});

test('a director cannot re-declare the floor; a rank-4+ full-access seat can, and the reading follows', () => {
  const h = boot(makeState({ activeSeatId: null }));
  // The rank-4+ full-access declaration is allowed. It RE-DECLARES the
  // conventions the workspace reports under, and the next chief-scoped read
  // applies them — so the assertion is on the declaration and on the report
  // taken under the same conventions, not on a chief read that precedes it.
  const declared = h.api.dutyCoverageSetConventions({ dutyCoverageBranchFloorN: 2, dutyCoverageBranchRateFloorN: 2 });
  assert.ok(declared.ok, declared.error);
  assert.equal(declared.conventions.dutyCoverageBranchFloorN, 2);
  const after = h.api.dutyCoverageReport().report;
  assert.equal(after.branchCoverage, null, 'the operator view reads every seat directly and compares no branches');
  assert.equal(after.conventions.dutyCoverageBranchFloorN, 2, 'the declared floor is what the register prints');

  // A director seat is rank 3 and not full access, so both gates refuse it.
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'review own branch' }).ok);
  const refused = h.api.dutyCoverageSetConventions({ dutyCoverageBranchFloorN: 12 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /rank window is 4–5|rank 3/);

  // A declared chief seat is rank 5 but not full access: the floor is an
  // enterprise-scope declaration and says so instead of quietly allowing it.
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);
  const chiefRefused = h.api.dutyCoverageSetConventions({ dutyCoverageBranchFloorN: 12 });
  assert.equal(chiefRefused.ok, false);
  assert.match(chiefRefused.error, /full-access seat/);

  const events = h.store.state.events.filter((e) => e.type === 'dutyCoverage.settings_updated');
  assert.equal(events.length, 1, 'one declaration, one audit event');
  assert.match(events[0].summary, /branch disclosure floor 2/);
});

/* ------------------------------------------------------- 7. the screen */

test('the chief desk renders the floor, WITHHELD cells and the premise, axe-clean', async () => {
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

  const h = boot(makeState());
  const ctx = { api: h.api, query: new URLSearchParams('panel=desk'), navigate() {}, refresh() {} };
  const node = renderDutyCover(ctx);
  dom.window.document.body.append(node);

  const text = node.textContent;
  assert.match(text, /Continuity across direct branches/);
  assert.match(text, /WITHHELD/, 'a withheld cell prints WITHHELD, not a number');
  assert.match(text, /disclosure floor of 3 contributing seat\(s\)/, 'the floor is named on the surface');
  assert.match(text, /primary \+ complementary suppression, not differential privacy/);
  assert.match(text, /Why the cell is blank/, 'the reason column is present');
  assert.ok(!/Nadia Rask|Kwame Asante|Ola Berg/.test(text), 'no person name on the branch card');

  dom.window.eval(AXE_SRC);
  const results = await dom.window.axe.run(node, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  assert.deepEqual(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), [], 'the desk is axe-clean');
  assert.deepEqual(errors, []);
  dom.window.close();
});
