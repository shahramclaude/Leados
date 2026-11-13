/**
 * tests/app/sod-register.test.mjs — the Cross-Line Segregation-of-Duties
 * Register (ADR-0170, Schema v135 unchanged, `#/matrix?panel=sod`, CSV scope
 * #125, RULE-SOD-01).
 *
 * One focused pass over what this session built. Every count below is worked
 * out by hand from the fixture and stated in a comment, so a failure names the
 * decision that moved rather than a number that changed:
 *
 *   - the three conflict classes, and the two bases a finding can rest on;
 *   - the structure of the DECISION DAY, not of today: a dated second line, a
 *     recorded home-line move, and the three ways that day cannot be read;
 *   - the refusals that are the product (a title is not a hand; a rate over an
 *     unsound denominator is blank);
 *   - the seat above the senior hand — one, several, none, unreadable;
 *   - seat scope: a hand outside the acting seat leaves neither name nor id;
 *   - the aggregate-only export, the one rule on the shared spine, and a JSDOM
 *     render proving the displayed figure is the computed figure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import {
  buildSodRegister,
  readHand,
  sodFindingText,
  sodPermille,
  sodRegisterBriefText,
  sodRegisterCsvRows,
  sodSeatText,
} from '../../app/core/domain/sodRegister.js';
import { buildNameIndex } from '../../app/core/domain/rightsConcordance.js';
import {
  SOD_BOUNDS,
  SOD_CLASS_KEYS,
  SOD_CSV_COLUMNS,
  SOD_REVIEW_EVENT,
  SOD_RULE_ID,
} from '../../app/core/domain/sodRegisterRegistry.js';
import { sodRegisterRule, sodReviewSummary } from '../../app/core/domain/sodRegisterRules.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderMatrixSodPanel } from '../../app/views/matrixSodPanel.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
// Every fixture person started long before any decision day, so "not on the
// roster that day" is a fact the fixture states on purpose (Zed), never an
// accident of when the fixture was written.
const STAMP = '2020-01-01T00:00:00.000Z';

const ROSTER_NAMES = ['Ada Chief', 'Nora Eng', 'Milo Product', 'Gus Manager', 'Sam Builder', 'Leo Analyst', 'Zed Newhire', 'Riley Lead'];

const person = (id, name, level, managerId = null, extra = {}) => ({
  id, name, level, managerId, status: 'active', startDate: '2020-01-01', createdAt: STAMP, ...extra,
});

/** A DECIDED decision unless `chosen` is blanked. `on: null` is a legacy record with no decision day. */
const decision = (id, driver, approver, { on = '2026-06-01', door = 'reversible', chosen = 'Option A' } = {}) => ({
  id, title: `Call ${id}`, question: '', date: on || '2026-01-05',
  reversibility: door, driver, approver,
  contributors: '', informed: '', options: [], chosen,
  rationale: 'A written rationale that is long enough to pass the quality bar.',
  reviewOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
  forecastProbability: null, decidedOn: on, portfolioNotes: [], createdAt: STAMP,
});

/**
 * The workspace.
 *
 *   Riley Lead (workspace leader)
 *     └ Ada Chief (ceo)
 *         ├ Nora Eng (eng)
 *         │   └ Gus Manager (mgr)
 *         │       ├ Sam Builder (sam) ······ product line to Milo from 2026-03-01
 *         │       └ Zed Newhire (zed)        joined 2026-09-01
 *         └ Milo Product (prod)
 *             └ Leo Analyst (leo)            recorded under Nora until 2026-06-30
 *
 * It is passed through `normalizeState`, so every assertion below is about the
 * shape the store actually persists.
 */
function fixture({ settings = {}, mutate = null } = {}) {
  const base = createEmptyState(NOW.toISOString());
  base.people = [
    person('ceo', 'Ada Chief', 'vp'),
    person('eng', 'Nora Eng', 'director', 'ceo'),
    person('prod', 'Milo Product', 'director', 'ceo'),
    person('mgr', 'Gus Manager', 'manager', 'eng'),
    person('sam', 'Sam Builder', 'ic', 'mgr'),
    person('leo', 'Leo Analyst', 'ic', 'prod'),
    person('zed', 'Zed Newhire', 'ic', 'mgr', { startDate: '2026-09-01', createdAt: '2026-09-01T00:00:00.000Z' }),
  ];
  base.reportingLines = [{
    id: 'l-sam-prod', personId: 'sam', managerId: 'prod', kind: 'product', shareH: 40,
    rights: ['priority', 'performance'], fromISO: '2026-03-01', toISO: null, status: 'active',
    declaredAt: '2026-03-01T00:00:00.000Z', history: [],
  }];
  base.structureHistory = [
    { id: 'sh-leo-1', personId: 'leo', managerId: 'eng', fromISO: '2026-01-01', toISO: '2026-06-30' },
    { id: 'sh-leo-2', personId: 'leo', managerId: 'prod', fromISO: '2026-07-01', toISO: null },
  ];
  base.decisions = [
    // --- conflicts (9)
    decision('d-same', 'Nora Eng', 'Nora Eng', { door: 'irreversible' }),
    decision('d-same2', 'Nora Eng', 'Nora Eng', { on: '2026-07-01' }),
    decision('d-home', 'Nora Eng', 'Sam Builder'),
    decision('d-line', 'Milo Product', 'Sam Builder', { door: 'irreversible' }),
    decision('d-asof', 'Nora Eng', 'Leo Analyst', { on: '2026-05-01', door: 'irreversible' }),
    decision('d-custody', 'Nora Eng', 'Milo Product', { door: 'irreversible' }),
    decision('d-tie', 'Sam Builder', 'Sam Builder'),
    decision('d-leader', 'Riley Lead', 'Riley Lead', { door: 'irreversible' }),
    decision('d-nodayself', 'Gus Manager', 'Gus Manager', { on: null }),
    // --- two independent hands (2)
    decision('d-before', 'Milo Product', 'Sam Builder', { on: '2026-02-01' }),
    decision('d-after', 'Nora Eng', 'Leo Analyst', { on: '2026-08-01' }),
    // --- independence unreadable (3)
    decision('d-unrec', 'Nora Eng', 'Leo Analyst', { on: '2025-12-01' }),
    decision('d-notplaced', 'Nora Eng', 'Zed Newhire'),
    decision('d-noday', 'Nora Eng', 'Milo Product', { on: null }),
    // --- not testable (4)
    decision('d-noappr', 'Nora Eng', ''),
    decision('d-nodrv', '', 'Nora Eng'),
    decision('d-several', 'Nora Eng, Milo Product', 'Ada Chief'),
    decision('d-unres', 'Steering Committee', 'Ada Chief'),
    // --- still open: not in the population at all
    decision('d-open', 'Nora Eng', 'Nora Eng', { chosen: '' }),
  ];
  base.cases = [{
    id: 'c-1', title: 'Vendor exit', status: 'open', severity: 3, ownerId: 'prod',
    kind: 'initiative', openedOn: '2026-05-10', createdAt: STAMP,
  }];
  base.links = [{
    id: 'lnk-1', sourceType: 'case', sourceId: 'c-1', targetType: 'decision', targetId: 'd-custody',
    relation: 'decides', ruleId: 'RULE-TEST', summary: '', createdOn: '2026-06-01', createdAt: STAMP,
  }];
  base.settings = { ...base.settings, leaderName: 'Riley Lead', activeSeatId: null, ...settings };
  if (mutate) mutate(base);
  return normalizeState(base, { now: NOW }).state;
}

const read = (state) => buildSodRegister(state, { now: NOW, settings: state.settings });
const rowOf = (report, id) => report.rows.find((row) => row.decisionId === id) || null;
const classOf = (report, id, key) => rowOf(report, id)?.classes.find((entry) => entry.key === key) || null;
const countOf = (list, key) => list.find((entry) => entry.key === key)?.n;

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

const tableByCaption = (node, caption) => [...node.querySelectorAll('table')]
  .find((table) => table.querySelector('caption')?.textContent === caption) || null;

/* =====================================================================
 * 1. REGISTRATION — one panel, one scope, one rule, no schema move
 * ===================================================================== */

test('the register is wired into the matrix, the export catalogue and the shared spine without a schema move', () => {
  assert.equal(SCHEMA_VERSION, 150, 'ADR-0164 moved the schema to v140; the SoD register itself needs no migration');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'sod'));
  const scope = CSV_EXPORTS.find((entry) => entry.key === 'matrix-sod');
  assert.ok(scope, 'the aggregate scope is in the catalogue');
  assert.equal(scope.sensitive, false);
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(sodRegisterRule));
  assert.ok(PROPAGATION_CONTRACTS.some((contract) => contract.rule === sodRegisterRule));
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'every rule on the spine declares its contract');
  assert.equal(typeof seed(fixture()).api.matrixSodReview, 'function', 'the action is classified by the access gateway');
});

/* =====================================================================
 * 2. THE ARITHMETIC — every count recomputed here
 * ===================================================================== */

test('per-mille is exact, and an absent denominator is an absence — never a zero', () => {
  assert.equal(sodPermille(10, 12), 833);
  assert.equal(sodPermille(0, 12), 0);
  assert.equal(sodPermille(5, 5), 1000);
  assert.equal(sodPermille(1, 0), null);
  assert.equal(sodPermille(1.5, 3), null);
});

test('a role field resolves to exactly one roster person or is refused with its reason', () => {
  const index = buildNameIndex(fixture());
  assert.deepEqual(readHand(index, ''), { state: 'missing', personId: null, reason: null });
  assert.deepEqual(readHand(index, '  nora eng '), { state: 'resolved', personId: 'eng', reason: null });
  assert.deepEqual(readHand(index, 'Riley Lead'), { state: 'resolved', personId: 'leader', reason: null });
  assert.equal(readHand(index, 'Nora Eng & Milo Product').state, 'several');
  // A body is not a hand: a conflict is never inferred from a title.
  assert.deepEqual(readHand(index, 'Steering Committee'), { state: 'unresolved', personId: null, reason: 'not-on-roster' });
});

test('the board: 18 decided → 14 tested + 4 refused → 9 conflicted + 3 unreadable + 2 clear', () => {
  const report = read(fixture());
  const b = report.board;
  assert.equal(b.decidedN, 18);
  assert.equal(b.openN, 1, 'the undecided decision is counted as open and read nowhere');
  assert.equal(b.readN, 18);
  assert.equal(b.omittedN, 0);
  assert.equal(b.outsideSeatN, 0);
  assert.equal(b.testedN, 14);
  assert.equal(b.refusedN, 4);
  assert.equal(b.conflictN, 9);
  assert.equal(b.unreadableN, 3);
  assert.equal(b.clearN, 2);
  // d-same, d-line, d-asof, d-custody, d-leader are the irreversible ones — all five conflicted.
  assert.equal(b.testedOneWayN, 5);
  assert.equal(b.conflictOneWayN, 5);
  assert.equal(b.conflictTwoWayN, 4);
  assert.equal(b.unreadableOneWayN, 0);
  // No decision in this fixture carries two classes, so findings = conflicted decisions.
  assert.equal(b.findingsN, 9);
  assert.equal(b.sameHandN, 5);
  assert.equal(b.dependentHandN, 3);
  assert.equal(b.custodyN, 1);
  assert.equal(b.distinctConflictN, 9);
  for (const [name, held] of Object.entries(b.identities)) assert.equal(held, true, `identity "${name}" holds`);
  assert.equal(b.countsReconcile, true);
  assert.deepEqual(report.classes.map((c) => c.key), [...SOD_CLASS_KEYS]);
  assert.equal(report.isMatrix, true);
  assert.equal(report.fullAccess, true);
});

/* =====================================================================
 * 3. THE THREE CLASSES
 * ===================================================================== */

test('one hand holding both roles is a recorded finding, and the same pair is counted once', () => {
  const report = read(fixture());
  const entry = classOf(report, 'd-same', 'same-hand');
  assert.equal(entry.basis, 'recorded');
  assert.equal(sodFindingText(rowOf(report, 'd-same'), entry), 'Nora Eng is recorded as both Driver and Approver.');
  // Two calls by the same hand are ONE row about a control, not two.
  const pair = report.pairs.find((p) => p.driverId === 'eng' && p.approverId === 'eng');
  assert.equal(pair.sameHand, true);
  assert.equal(pair.decisionsN, 2);
  assert.equal(pair.oneWayN, 1);
  assert.equal(pair.twoWayN, 1);
  assert.equal(pair.sameHandN, 2);
  assert.equal(pair.lastOn, '2026-07-01');
  assert.equal(report.board.pairsN, 8);
  assert.equal(report.pairs.reduce((acc, p) => acc + p.decisionsN, 0), report.board.conflictN);
});

test('an Approver who reports to the Driver up the home chain is dependent — and a chain with no history is printed as presumed', () => {
  const report = read(fixture());
  const entry = classOf(report, 'd-home', 'dependent-hand');
  // Sam → Gus → Nora: two lines, neither with recorded history.
  assert.equal(entry.route, 'home-chain');
  assert.equal(entry.hops, 2);
  assert.equal(entry.direct, false);
  assert.equal(entry.basis, 'presumed');
  assert.deepEqual(entry.rights, [], 'rights are printed only for a DIRECT line');
  assert.match(sodFindingText(rowOf(report, 'd-home'), entry), /through 2 lines — through the home chain\. Presumed:/);
  // Only a seat above the DRIVER is above both hands.
  assert.equal(rowOf(report, 'd-home').seniorHandId, 'eng');
});

test('a dependence that exists ONLY through a declared second line is found, with the rights that line declares', () => {
  const report = read(fixture());
  const entry = classOf(report, 'd-line', 'dependent-hand');
  // On the chart Sam reports to Gus → Nora; nothing there leads to Milo.
  assert.equal(entry.route, 'second-line');
  assert.equal(entry.hops, 1);
  assert.equal(entry.direct, true);
  assert.equal(entry.basis, 'recorded', 'a declared line is a record, not a presumption');
  assert.deepEqual(entry.viaKinds, ['product']);
  assert.deepEqual(entry.rights, ['priority', 'performance']);
  assert.equal(entry.stewardship, true, 'the Driver writes the Approver’s assessment');
  assert.match(sodFindingText(rowOf(report, 'd-line'), entry), /only through a declared second line \(product\); the home chain of that day does not show it/);
  assert.equal(report.board.secondLineN, 1);
  assert.equal(report.board.homeChainN, 2);
  assert.equal(report.board.stewardshipN, 2);
});

test('the same two hands are independent on a day the line’s window does not cover', () => {
  // d-before was decided on 2026-02-01; the product line starts on 2026-03-01.
  const report = read(fixture());
  assert.equal(rowOf(report, 'd-before'), null);
  assert.ok(!report.unreadableRows.some((row) => row.decisionId === 'd-before'), 'clear, not unreadable');

  // End the line on 2026-05-31: the call of 2026-06-01 is now independent, and a
  // call INSIDE the ended window is still dependent although the line is over today.
  const ended = read(fixture({
    mutate: (base) => {
      base.reportingLines[0].toISO = '2026-05-31';
      base.decisions.push(decision('d-inwin', 'Milo Product', 'Sam Builder', { on: '2026-04-15' }));
    },
  }));
  assert.equal(rowOf(ended, 'd-line'), null, 'the line had ended the day before');
  assert.equal(classOf(ended, 'd-inwin', 'dependent-hand').route, 'second-line');
  assert.equal(ended.board.secondLineN, 1);
  assert.equal(ended.board.clearN, 3);
  // With the line gone on 2026-06-01, Sam has one seat above again.
  assert.equal(rowOf(ended, 'd-tie').seat.state, 'unique');
  assert.equal(ended.board.seatTieN, 0);
  assert.equal(ended.board.countsReconcile, true);
});

test('a custodian who authorizes is a finding only through a typed decision↔case link, and always presumed', () => {
  const report = read(fixture());
  const row = rowOf(report, 'd-custody');
  assert.deepEqual(row.classKeys, ['custody-and-approval']);
  const entry = classOf(report, 'd-custody', 'custody-and-approval');
  assert.equal(entry.basis, 'presumed');
  assert.equal(entry.casesN, 1);
  assert.match(sodFindingText(row, entry), /Milo Product \(Approver\) owns 1 case\(s\).*Presumed: ownership is read as the case stands today\./);
  assert.equal(row.seniorHandId, 'prod');
  assert.equal(report.board.custodyTestedN, 1);
  // d-home (presumed chain) + d-custody (presumed ownership).
  assert.equal(report.board.presumedBasisN, 2);

  // Without the typed link nothing ties Milo to the object: two independent hands.
  const unlinked = read(fixture({ mutate: (base) => { base.links = []; } }));
  assert.equal(rowOf(unlinked, 'd-custody'), null);
  assert.equal(unlinked.board.custodyN, 0);
  assert.equal(unlinked.board.custodyTestedN, 0);
  assert.equal(unlinked.board.conflictN, 8);
  assert.equal(unlinked.board.clearN, 3);
});

/* =====================================================================
 * 4. THE STRUCTURE OF THE DECISION DAY — never today's chart
 * ===================================================================== */

test('a recorded home-line move is read as of the decision day, in both directions', () => {
  const state = fixture();
  assert.equal(state.people.find((p) => p.id === 'leo').managerId, 'prod', 'today Leo reports to Milo');
  const report = read(state);
  // 2026-05-01: the ledger records Leo under Nora. Today's chart would pass this.
  const entry = classOf(report, 'd-asof', 'dependent-hand');
  assert.equal(entry.route, 'home-chain');
  assert.equal(entry.hops, 1);
  assert.equal(entry.basis, 'recorded');
  assert.deepEqual(entry.rights, ['performance', 'pay', 'absence']);
  assert.deepEqual(entry.presumedRights, ['performance', 'pay', 'absence'], 'home-line rights are printed as a presumption');
  // 2026-08-01: the ledger records Leo under Milo. The same two hands are independent.
  assert.equal(rowOf(report, 'd-after'), null);
  assert.ok(!report.unreadableRows.some((row) => row.decisionId === 'd-after'));
  assert.equal(report.hasLedger, true);
  assert.equal(report.ledgerCoverageStart, '2026-01-01');
});

test('a day the structure cannot answer is refused — neither a finding nor a pass', () => {
  const report = read(fixture());
  const reasonOf = (id) => report.unreadableRows.find((row) => row.decisionId === id)?.reason;
  // Leo HAS recorded history and none of it covers 2025-12-01.
  assert.equal(reasonOf('d-unrec'), 'home-line-unrecorded');
  // Zed joined on 2026-09-01; on 2026-06-01 Zed was not on the roster.
  assert.equal(reasonOf('d-notplaced'), 'not-placed');
  // A legacy record with no decision day and two different hands.
  assert.equal(reasonOf('d-noday'), 'no-decision-day');
  assert.equal(countOf(report.structureRefusals, 'home-line-unrecorded'), 1);
  assert.equal(countOf(report.structureRefusals, 'not-placed'), 1);
  assert.equal(countOf(report.structureRefusals, 'no-decision-day'), 1);
  assert.equal(report.unreadableRows.length, report.board.unreadableN);
  // Refused decisions are in NO conflict row and NOT in the clear count.
  for (const id of ['d-unrec', 'd-notplaced', 'd-noday']) assert.equal(rowOf(report, id), null);
});

/* =====================================================================
 * 5. THE REFUSALS THAT ARE THE PRODUCT
 * ===================================================================== */

test('a decision that does not name two testable hands lands in exactly one refusal bucket', () => {
  const report = read(fixture());
  assert.equal(countOf(report.recordRefusals, 'no-approver'), 1);
  assert.equal(countOf(report.recordRefusals, 'no-driver'), 1);
  assert.equal(countOf(report.recordRefusals, 'several-named'), 1);
  assert.equal(countOf(report.recordRefusals, 'unresolved-hand'), 1);
  assert.equal(report.board.ambiguousNameN, 0);
  for (const id of ['d-noappr', 'd-nodrv', 'd-several', 'd-unres']) {
    assert.equal(rowOf(report, id), null);
    assert.ok(!report.unreadableRows.some((row) => row.decisionId === id));
  }

  // Two roster people sharing a name: the register does not pick one.
  const twins = read(fixture({
    mutate: (base) => {
      base.people.push(person('sam2', 'Sam Builder', 'ic', 'prod'));
    },
  }));
  // d-home, d-line, d-before and d-tie all name "Sam Builder".
  assert.equal(countOf(twins.recordRefusals, 'unresolved-hand'), 5);
  assert.equal(twins.board.ambiguousNameN, 4);
  assert.equal(twins.board.countsReconcile, true);
});

test('a share is printed only over a sound denominator; otherwise its reason is printed instead', () => {
  const b = read(fixture()).board;
  // 14 tested, but 3 of them cannot be read for independence.
  assert.equal(b.conflictPermille, null);
  assert.match(b.conflictPermilleRefusedReason, /^3 tested decision\(s\) cannot be read for independence/);
  // Only 5 irreversible decisions were tested; the declared floor is 10.
  assert.equal(b.oneWayConflictPermille, null);
  assert.equal(b.oneWayPermilleRefusedReason, `Only 5 tested decision(s); the declared floor for a share is ${SOD_BOUNDS.rateFloor}.`);

  // Ten irreversible same-hand calls and two independent reversible ones.
  const sound = read(fixture({
    mutate: (base) => {
      base.decisions = [
        ...Array.from({ length: 10 }, (_, i) => decision(`s-${i}`, 'Nora Eng', 'Nora Eng', { door: 'irreversible' })),
        decision('c-a', 'Nora Eng', 'Milo Product'),
        decision('c-b', 'Milo Product', 'Nora Eng'),
      ];
    },
  })).board;
  assert.equal(sound.testedN, 12);
  assert.equal(sound.conflictN, 10);
  assert.equal(sound.clearN, 2);
  assert.equal(sound.conflictPermille, 833, '10 of 12, exact integer per-mille');
  assert.equal(sound.conflictPermilleRefusedReason, null);
  assert.equal(sound.oneWayConflictPermille, 1000, '10 of 10');
  assert.equal(sound.countsReconcile, true);
});

/* =====================================================================
 * 6. WHO COULD SUPPLY THE SECOND HAND
 * ===================================================================== */

test('the seat above the senior hand is one, several, none or unreadable — and a tie is never collapsed', () => {
  const report = read(fixture());
  assert.equal(countOf(report.seatStates, 'unique'), 6);
  assert.equal(countOf(report.seatStates, 'tie'), 1);
  assert.equal(countOf(report.seatStates, 'none'), 1);
  assert.equal(countOf(report.seatStates, 'unreadable'), 1);

  const unique = rowOf(report, 'd-same');
  assert.equal(unique.seat.state, 'unique');
  assert.deepEqual(unique.seat.seatNames, ['Ada Chief']);
  assert.equal(unique.seat.presumed, true, 'Nora’s home line has no recorded history');

  // On 2026-06-01 Sam sat under Gus (home) AND Milo (product line).
  const tie = rowOf(report, 'd-tie');
  assert.equal(tie.seat.state, 'tie');
  assert.equal(tie.seat.seatN, 2);
  assert.deepEqual(tie.seat.seatNames, ['Gus Manager', 'Milo Product']);
  assert.equal(tie.seat.apexName, 'Ada Chief', 'the lowest seat above both');
  assert.equal(tie.seat.apexAmbiguous, false);
  assert.match(sodSeatText(tie), /^2 seats above the hand \(Gus Manager, Milo Product\); the structure does not say which supplies the second hand/);

  const none = rowOf(report, 'd-leader');
  assert.equal(none.seat.state, 'none');
  assert.match(sodSeatText(none), /^No seat above the hand: it is the workspace leader\./);

  // One hand, but no decision day: the conflict stands, the seat cannot be read.
  const unreadable = rowOf(report, 'd-nodayself');
  assert.deepEqual(unreadable.classKeys, ['same-hand']);
  assert.equal(unreadable.seat.state, 'unreadable');
  assert.equal(unreadable.seat.reason, 'no-decision-day');
});

test('conflicts roll up every line of the reporting graph, and the branches are printed as not additive', () => {
  const report = read(fixture());
  const span = (id) => report.spans.find((s) => s.spanId === id);
  // Every conflict reaches the leader exactly once.
  assert.equal(span('leader').totalN, report.board.distinctConflictN);
  assert.equal(span('leader').ownN, 1);
  assert.equal(span('leader').noSeatN, 1);
  assert.equal(span('ceo').totalN, 8);
  // Nora: d-same, d-same2, d-home, d-asof are her own; d-tie and d-nodayself sit below her.
  assert.equal(span('eng').ownN, 4);
  assert.equal(span('eng').belowN, 2);
  // Milo: d-line and d-custody are his own; d-tie reaches him through Sam’s product line.
  assert.equal(span('prod').ownN, 2);
  assert.equal(span('prod').belowN, 1);
  assert.equal(span('prod').secondLineN, 1);
  assert.equal(span('mgr').totalN, 2);
  // Sam is on two lines, so d-tie is in BOTH branches: 6 + 3 > the 8 above them.
  assert.equal(report.board.sharedN, 1);
  assert.ok(span('eng').totalN + span('prod').totalN > span('ceo').totalN);
});

test('rows are bounded: irreversible first, and what is past the cap is counted, never dropped', () => {
  const report = read(fixture({
    mutate: (base) => {
      for (let i = 0; i < 45; i += 1) base.decisions.push(decision(`x-${i}`, 'Nora Eng', 'Nora Eng', { on: '2026-06-02' }));
    },
  }));
  assert.equal(report.board.conflictN, 54);
  assert.equal(report.rows.length, SOD_BOUNDS.rows);
  assert.equal(report.board.rowsOmittedN, 54 - SOD_BOUNDS.rows);
  assert.ok(report.rows.slice(0, 5).every((row) => row.tier === 'one-way'));
  assert.ok(report.rows.slice(5).every((row) => row.tier === 'two-way'));
  assert.equal(report.pairs.find((p) => p.driverId === 'eng' && p.approverId === 'eng').decisionsN, 47);
  assert.equal(report.board.countsReconcile, true);
});

/* =====================================================================
 * 7. SEAT SCOPE — a hand outside the seat leaves neither name nor id
 * ===================================================================== */

test('a seat reads its own span: outside decisions are counted and folded into nothing; outside hands are withheld', () => {
  const state = fixture({ settings: { activeSeatId: 'eng' } });
  const report = read(state);
  assert.equal(report.seat.id, 'eng');
  assert.equal(report.fullAccess, false);
  const b = report.board;
  // Outside Nora’s span: d-leader (leader only), d-several and d-unres (only Ada resolves).
  assert.equal(b.outsideSeatN, 3);
  assert.equal(b.inSeatN, 15);
  assert.equal(b.readN, b.inSeatN + b.outsideSeatN);
  assert.equal(b.refusedN, 2);
  assert.equal(b.testedN, 13);
  assert.equal(b.conflictN, 8);
  assert.equal(b.seatNoneN, 0);
  assert.equal(b.countsReconcile, true);

  // Milo drove d-line; Milo is outside this seat. Sam approved; Sam is inside.
  const line = rowOf(report, 'd-line');
  assert.equal(line.driverWithheld, true);
  assert.equal(line.driverName, null);
  assert.equal(line.driverId, null);
  assert.equal(line.seniorHandId, null);
  assert.equal(line.approverName, 'Sam Builder');
  assert.match(sodFindingText(line, line.classes[0]), /reported to a person outside this seat \(Driver\)/);

  // Of Sam’s two seats, only Gus is inside; the apex (Ada) is withheld too.
  const tie = rowOf(report, 'd-tie');
  assert.deepEqual(tie.seat.seatNames, ['Gus Manager']);
  assert.equal(tie.seat.seatWithheldN, 1);
  assert.equal(tie.seat.apexName, null);
  assert.equal(tie.seat.apexWithheld, true);

  assert.deepEqual(report.spans.map((s) => s.spanId).sort(), ['eng', 'mgr']);
  const carried = JSON.stringify({
    rows: report.rows, pairs: report.pairs, unreadableRows: report.unreadableRows, spans: report.spans,
  });
  for (const outside of ['Milo Product', 'Ada Chief', 'Leo Analyst', 'Riley Lead', '"prod"', '"ceo"', '"leo"', '"leader"']) {
    assert.ok(!carried.includes(outside), `${outside} is outside the seat and is carried nowhere`);
  }
});

/* =====================================================================
 * 8. THE BRIEF AND THE EXPORT — counts only
 * ===================================================================== */

test('the brief names no person and no decision, and says what was refused', () => {
  const report = read(fixture());
  const brief = sodRegisterBriefText(report);
  assert.match(brief, /^Segregation of duties — read from the whole workspace on 2026-11-10\./);
  assert.match(brief, /Of the 14 tested: 9 carry a conflict, 3 cannot be read for independence, 2 show two independent hands\./);
  assert.match(brief, /\(2 through the home chain, 1 only through a declared second line\)/);
  assert.match(brief, /The share of irreversible decisions carrying a conflict is REFUSED: Only 5 tested decision\(s\)/);
  assert.match(brief, /Counts reconcile: verified\./);
  for (const name of ROSTER_NAMES) assert.ok(!brief.includes(name), `${name} is not in the brief`);
  assert.ok(!/Call d-|d-same|d-line/.test(brief), 'no decision title or id');

  const empty = read(fixture({ mutate: (base) => { base.decisions = []; } }));
  assert.equal(empty.board.decidedN, 0);
  assert.match(empty.emptyNote, /No decided decision is on the record\./);
  assert.equal(empty.board.countsReconcile, true);
});

test('CSV scope #125 is aggregate-only, equals the board, and exports a refused share BLANK with its flag', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const report = read(state);
  const rows = sodRegisterCsvRows(report);

  const exported = exportWorkspaceCsv(state, 'matrix-sod', { now: NOW });
  assert.equal(exported.ok, true);
  assert.equal(JSON.stringify(state), before, 'exporting is read-only');
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, [...SOD_CSV_COLUMNS]);
  // One workspace row plus one row per conflict class — and nothing per person or per decision.
  assert.equal(parsed.rows.length, 1 + SOD_CLASS_KEYS.length);
  const cells = (index) => Object.fromEntries(parsed.headers.map((header, i) => [header, parsed.rows[index][i]]));

  const workspace = cells(0);
  const b = report.board;
  assert.equal(workspace.row_kind, 'workspace');
  assert.equal(workspace.seat_scope, 'workspace');
  assert.equal(workspace.decided_n, String(b.decidedN));
  assert.equal(workspace.tested_n, String(b.testedN));
  assert.equal(workspace.refused_n, String(b.refusedN));
  assert.equal(workspace.conflict_decisions_n, String(b.conflictN));
  assert.equal(workspace.conflict_one_way_n, String(b.conflictOneWayN));
  assert.equal(workspace.unreadable_decisions_n, String(b.unreadableN));
  assert.equal(workspace.clear_decisions_n, String(b.clearN));
  assert.equal(workspace.second_line_n, String(b.secondLineN));
  assert.equal(workspace.seat_tie_n, String(b.seatTieN));
  assert.equal(workspace.seat_none_n, String(b.seatNoneN));
  assert.equal(workspace.conflict_permille, '', 'a refused share is blank, never zero');
  assert.equal(workspace.conflict_permille_withheld, 'true');
  assert.equal(workspace.one_way_conflict_permille, '');
  assert.equal(workspace.one_way_permille_withheld, 'true');
  assert.equal(workspace.counts_reconcile, 'true');

  assert.deepEqual([1, 2, 3].map((i) => cells(i).class), [...SOD_CLASS_KEYS]);
  assert.deepEqual([1, 2, 3].map((i) => cells(i).findings_n), ['5', '3', '1']);
  assert.equal(cells(2).home_chain_n, '2');
  assert.equal(cells(1).home_chain_n, '', 'a route is not a property of a same-hand finding');

  for (const name of ROSTER_NAMES) assert.ok(!exported.csv.includes(name), `${name} is not exported`);
  for (const fragment of ['Call d-', 'd-same', 'Vendor exit', '2026-06-01', '2026-05-01', 'Steering Committee']) {
    assert.ok(!exported.csv.includes(fragment), `"${fragment}" is not exported`);
  }

  const reloaded = normalizeState(JSON.parse(before), { now: NOW }).state;
  assert.deepEqual(sodRegisterCsvRows(read(reloaded)), rows, 'the export reproduces from persisted bytes');

  const seated = fixture({ settings: { activeSeatId: 'eng' } });
  const seatedCsv = parseCsv(exportWorkspaceCsv(seated, 'matrix-sod', { now: NOW }).csv);
  const seatedRow = Object.fromEntries(seatedCsv.headers.map((header, i) => [header, seatedCsv.rows[0][i]]));
  assert.equal(seatedRow.seat_scope, 'seat');
  assert.equal(seatedRow.outside_seat_n, '3');
});

/* =====================================================================
 * 9. THE ONE RULE ON THE SHARED SPINE
 * ===================================================================== */

test('RULE-SOD-01 runs only on an explicit review, is idempotent per reading, and reads the whole workspace', () => {
  const draft = structuredClone(fixture({ settings: { activeSeatId: 'eng' } }));
  const logged = [];
  const ctx = (type) => ({ event: { type }, now: NOW, logEvent: (event) => logged.push(event) });
  const markers = () => draft.matrixMarkers.filter((row) => row.ruleId === SOD_RULE_ID);

  // A decision being logged or decided is not a review.
  for (const type of ['decision.created', 'decision.updated', 'matrix.scan']) {
    assert.deepEqual(sodRegisterRule(draft, ctx(type)), []);
  }
  assert.equal(markers().length, 0);
  assert.equal(logged.length, 0);

  const effects = sodRegisterRule(draft, ctx(SOD_REVIEW_EVENT));
  assert.equal(effects.length, 1);
  assert.equal(effects[0].ruleId, SOD_RULE_ID);
  assert.equal(effects[0].action, 'recorded-control-gaps', 'an irreversible conflict is on the record');
  assert.equal(markers().length, 1);
  assert.equal(markers()[0].kind, 'sod-review');
  // The acting seat is Nora's, but a recorded review is a workspace fact: the
  // counts are the operator's 18 / 14 / 9, not the seat's 15 / 13 / 8.
  const operator = fixture();
  assert.equal(markers()[0].detail, sodReviewSummary(read(operator).board));
  assert.match(markers()[0].detail, /18 decided decision\(s\) read, 14 tested, 9 conflicted \(5 irreversible\)/);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].type, 'automation.propagated');
  assert.ok(logged[0].summary.startsWith(`[${SOD_RULE_ID}] `));
  for (const name of ROSTER_NAMES) assert.ok(!markers()[0].detail.includes(name), `${name} is not on the ledger`);

  // The same reading on the same day is not written twice.
  assert.deepEqual(sodRegisterRule(draft, ctx(SOD_REVIEW_EVENT)), []);
  assert.equal(markers().length, 1);
  assert.equal(logged.length, 1);

  // A changed record is a new reading.
  draft.decisions.push(decision('d-new', 'Gus Manager', 'Gus Manager'));
  assert.equal(sodRegisterRule(draft, ctx(SOD_REVIEW_EVENT)).length, 1);
  assert.equal(markers().length, 2);
});

test('recording a review through the API writes exactly one marker on the shared ledger, once', () => {
  const { store, api } = seed(fixture());
  const decisionsBefore = JSON.stringify(store.state.decisions.filter((d) => d.id.startsWith('d-')));
  const first = api.matrixSodReview();
  assert.equal(first.ok, true);
  assert.equal(first.recorded, true);
  assert.equal(first.report.board.conflictN, 9);
  const markers = () => store.state.matrixMarkers.filter((marker) => marker.ruleId === SOD_RULE_ID);
  assert.equal(markers().length, 1);
  assert.ok(store.lastPropagations.some((effect) => effect.ruleId === SOD_RULE_ID));
  assert.equal(
    JSON.stringify(store.state.decisions.filter((d) => d.id.startsWith('d-'))),
    decisionsBefore,
    'no decision that was read is edited by reviewing it',
  );

  const second = api.matrixSodReview();
  assert.equal(second.ok, true);
  assert.equal(second.recorded, false, 'the same reading of the same record on the same day');
  assert.equal(markers().length, 1);
});

/* =====================================================================
 * 10. THE SCREEN — the displayed figure is the computed figure
 * ===================================================================== */

test('the panel renders the computed values, mutates nothing, and withholds what the seat cannot see', () => {
  const state = fixture();
  const before = JSON.stringify(state);
  const report = read(state);
  withDom(() => {
    let reviews = 0;
    let refreshes = 0;
    const node = renderMatrixSodPanel({
      state,
      refresh() { refreshes += 1; },
      api: { matrixSodReview: () => { reviews += 1; return { ok: true, recorded: true }; } },
    }, { now: NOW });
    assert.equal(JSON.stringify(state), before, 'rendering is read-only');

    const stats = new Map([...node.querySelectorAll('.stat')]
      .map((el) => [el.querySelector('.stat-label').textContent, el.querySelector('.stat-value').textContent]));
    const b = report.board;
    assert.equal(stats.get('Decided decisions'), String(b.decidedN));
    assert.equal(stats.get('Tested'), String(b.testedN));
    assert.equal(stats.get('Not testable'), String(b.refusedN));
    assert.equal(stats.get('Conflicted'), String(b.conflictN));
    assert.equal(stats.get('Irreversible and conflicted'), String(b.conflictOneWayN));
    assert.equal(stats.get('Independence unreadable'), String(b.unreadableN));
    assert.equal(stats.get('Two independent hands'), String(b.clearN));
    assert.equal(stats.get('Dependent hand'), String(b.dependentHandN));
    assert.equal(stats.get('Several seats above'), String(b.seatTieN));
    assert.equal(stats.get('No seat above the hand'), String(b.seatNoneN));

    const bodyRows = (caption) => [...tableByCaption(node, caption).querySelectorAll('tbody tr')];
    assert.equal(bodyRows('Conflicted decisions per pair of hands').length, report.pairs.length);
    assert.deepEqual(
      bodyRows('Conflicted decisions in scope').map((tr) => tr.querySelector('td').textContent),
      report.rows.map((row) => row.title),
    );
    assert.equal(bodyRows('Decisions whose independence is not readable').length, report.unreadableRows.length);
    assert.equal(bodyRows('Record refusals').length, 4);
    assert.equal(bodyRows('Conflicted decisions per leadership span').length, report.spans.length);

    const text = node.textContent;
    assert.ok(text.includes('5 irreversible decision(s) were ratified without an independent second hand'));
    assert.ok(text.includes('1 dependence(s) exist only through a declared second line'));
    assert.ok(text.includes(`REFUSED — ${b.oneWayPermilleRefusedReason}`));
    assert.ok(text.includes('Counts reconcile: verified.'));
    assert.ok(text.includes(sodRegisterBriefText(report)), 'the brief on the page is the reader’s brief');
    assert.ok(text.includes(sodSeatText(rowOf(report, 'd-tie'))));

    [...node.querySelectorAll('button')].find((button) => button.textContent === 'Record this review').click();
    assert.equal(reviews, 1);
    assert.equal(refreshes, 1);
  });

  const seated = fixture({ settings: { activeSeatId: 'eng' } });
  withDom(() => {
    const text = renderMatrixSodPanel({ state: seated, refresh() {}, api: {} }, { now: NOW }).textContent;
    for (const outside of ['Milo Product', 'Ada Chief', 'Leo Analyst', 'Riley Lead']) {
      assert.ok(!text.includes(outside), `${outside} is outside the seat and is not printed`);
    }
    assert.ok(text.includes('a person outside this seat'));
  });

  const empty = fixture({ mutate: (base) => { base.decisions = []; } });
  withDom(() => {
    const text = renderMatrixSodPanel({ state: empty, refresh() {}, api: {} }, { now: NOW }).textContent;
    assert.ok(text.includes('No decided decision on the record'));
  });
});
