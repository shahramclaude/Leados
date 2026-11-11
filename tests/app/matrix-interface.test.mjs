/**
 * tests/app/matrix-interface.test.mjs — Matrix Management-Interface
 * Operating-Agreement Register (ADR-0162, Schema v131, `RULE-MIA-01`,
 * `#/matrix?panel=interfaces`, CSV scope #122).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES, runPostCommitRules } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  buildMatrixInterfaceReport,
  matrixInterfaceBriefText,
  matrixInterfaceCsvRows,
} from '../../app/core/domain/matrixInterface.js';
import {
  MATRIX_INTERFACE_CSV_COLUMNS,
  MATRIX_INTERFACE_EVENTS,
  MATRIX_INTERFACE_RULE_ID,
} from '../../app/core/domain/matrixInterfaceRegistry.js';
import { matrixInterfaceRule } from '../../app/core/domain/matrixInterfaceRules.js';
import { renderMatrixInterfacePanel } from '../../app/views/matrixInterfacePanel.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const ISO = NOW.toISOString();

function fakeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

function person(id, name, level, managerId = null) {
  return {
    id,
    name,
    role: level === 'ic' ? 'Engineer' : 'Leader',
    level,
    managerId,
    status: 'active',
    startDate: '2025-01-01',
    createdAt: ISO,
  };
}

function line(id, personId, managerId, kind, shareH, extra = {}) {
  return {
    id,
    personId,
    managerId,
    kind,
    shareH,
    rights: [],
    fromISO: '2026-01-01',
    toISO: null,
    declaredAt: ISO,
    declaredBySeatId: null,
    history: [],
    status: 'active',
    ...extra,
  };
}

function forum(id, title, status = 'active') {
  return {
    id,
    title,
    cadence: 'weekly',
    kind: 'operating-review',
    chairSeatId: 'vp',
    decisionCapacity: 6,
    horizonDays: 90,
    status,
    createdAt: ISO,
  };
}

function makeHarness(seedFn, clockDate = NOW) {
  let currentNow = clockDate;
  const storage = fakeStorage();
  const store = createStore({ storage, now: () => currentNow });
  store.load();
  if (seedFn) {
    store.update((draft) => seedFn(draft), { type: 'test.seed', entity: 'workspace', entityId: 'seed', summary: 'seed' });
  }
  const api = createApi(store, { now: () => currentNow });
  return {
    storage,
    store,
    api,
    setNow(nextDate) { currentNow = nextDate; },
  };
}

/**
 * Standard 3-pair matrix workspace under `vp` (rank 4) so cellFloor=3 is met:
 *   - (dana, priya) shared across sam & sally -> deduplicated to 1 pair with sharedPeopleN=2
 *   - (dana, marcus) shared via lee
 *   - (marcus, priya) shared via kim
 * Also includes a bystander manager `omar` who has no matrix pairs.
 */
function seedThreePairMatrix(draft) {
  draft.people = [
    person('vp', 'Vera VP', 'vp', null),
    person('dana', 'Dana Director', 'director', 'vp'),
    person('marcus', 'Marcus Director', 'director', 'vp'),
    person('priya', 'Priya Lead', 'manager', 'vp'),
    person('omar', 'Omar Bystander', 'manager', 'vp'),
    person('sam', 'Sam Engineer', 'ic', 'dana'),
    person('sally', 'Sally Engineer', 'ic', 'dana'),
    person('lee', 'Lee Engineer', 'ic', 'marcus'),
    person('kim', 'Kim Engineer', 'ic', 'marcus'),
    person('zoe', 'Zoe Engineer', 'ic', 'omar'),
  ];
  draft.reportingLines = [
    line('l1', 'sam', 'dana', 'functional', 60),
    line('l2', 'sam', 'priya', 'project', 40),
    line('l3', 'sally', 'dana', 'functional', 50),
    line('l4', 'sally', 'priya', 'project', 50),
    line('l5', 'lee', 'marcus', 'functional', 60),
    line('l6', 'lee', 'dana', 'cross-functional', 40),
    line('l7', 'kim', 'marcus', 'functional', 60),
    line('l8', 'kim', 'priya', 'product', 40),
  ];
  draft.cadenceForums = [forum('frm-sync', 'Cross-Line Ops Review', 'active')];
}

/* ----------------------------------------------------- 1. Schema & Spine */

test('schema v131 registers additive collections, clamped settings, gateway rights, CSV #122 and spine contract', () => {
  assert.equal(SCHEMA_VERSION, 136);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'interfaces'));
  assert.ok(ACTION_RIGHTS['affirm-matrix-interface']);
  assert.ok(ACTION_RIGHTS['govern-matrix-interface']);
  assert.equal(ACTION_RIGHTS['govern-matrix-interface'].minRank, 3);
  assert.equal(RECORD_POLICIES.matrixInterfaceAgreements.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.matrixInterfaceMarkers.detailCeiling, 0);
  assert.equal(API_RIGHTS.matrixInterfaceAffirm, 'affirm-matrix-interface');
  assert.equal(API_RIGHTS.matrixInterfaceRetire, 'affirm-matrix-interface');
  assert.equal(API_RIGHTS.matrixInterfaceScan, 'affirm-matrix-interface');
  assert.equal(API_RIGHTS.matrixInterfaceSetConventions, 'govern-matrix-interface');
  for (const key of ['matrixInterfaceReport', 'matrixInterfaceBriefText', 'matrixInterfaceCsvRows', 'matrixInterfaceAttentionCount', 'matrixInterfaceCandidates']) {
    assert.ok(SAFE_READS.has(key), `${key} is in SAFE_READS`);
  }
  assert.ok(CSV_EXPORTS.some((c) => c.key === 'matrix-interfaces'));

  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(matrixInterfaceRule);
  const seatIdx = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule');
  assert.ok(idx > 0 && seatIdx > idx, 'RULE-MIA-01 runs before seatRule on the shared spine');

  // Migration 130 -> 131 stays strictly empty (never fabricates agreements)
  const v130 = { schemaVersion: 130, people: [], settings: { matrixInterfaceDefaultTermDays: 999, matrixInterfaceDueWarnDays: -5 } };
  const { raw, applied } = migrate(v130);
  assert.deepEqual(applied, ['130 → 131', '131 → 132', '132 → 133']);
  assert.equal(raw.schemaVersion, 136);
  assert.deepEqual(raw.matrixInterfaceAgreements, []);
  assert.deepEqual(raw.matrixInterfaceMarkers, []);
  assert.equal(raw.settings.matrixInterfaceDefaultTermDays, 365);
  assert.equal(raw.settings.matrixInterfaceDueWarnDays, 1);

  // Normalizer drops malformed / side-forged / reasonless / bad-date rows fail-closed
  const bad = normalizeState({
    ...createEmptyState(ISO),
    matrixInterfaceAgreements: [
      { id: 'bad-side', pairKey: 'dana|priya', managerAId: 'dana', managerBId: 'priya', actingSide: 'a', actingManagerId: 'priya', outcome: 'affirm', consultationRule: 'joint-tradeoffs-only', effectiveFrom: '2026-11-01', reviewByOn: '2027-02-01', escalationSeatId: 'vp', basis: 'Valid length basis', decidedOn: '2026-11-10' },
      { id: 'bad-dates', pairKey: 'dana|priya', managerAId: 'dana', managerBId: 'priya', actingSide: 'a', actingManagerId: 'dana', outcome: 'affirm', consultationRule: 'joint-tradeoffs-only', effectiveFrom: '2026-12-01', reviewByOn: '2026-11-01', escalationSeatId: 'vp', basis: 'Valid length basis', decidedOn: '2026-11-10' },
      { id: 'bad-retire', pairKey: 'dana|priya', managerAId: 'dana', managerBId: 'priya', actingSide: 'a', actingManagerId: 'dana', outcome: 'retire', reason: 'short', decidedOn: '2026-11-10' },
      { id: 'ok-1', pairKey: 'dana|priya', managerAId: 'dana', managerBId: 'priya', actingSide: 'a', actingManagerId: 'dana', outcome: 'affirm', consultationRule: 'joint-tradeoffs-only', effectiveFrom: '2026-11-01', reviewByOn: '2027-03-01', escalationSeatId: 'vp', basis: 'Joint triage weekly across projects.', decidedOn: '2026-11-10' },
    ],
  });
  assert.equal(bad.state.matrixInterfaceAgreements.length, 1);
  assert.equal(bad.state.matrixInterfaceAgreements[0].id, 'ok-1');
  assert.ok(bad.warnings.some((w) => w.includes('dropped 3')));
});

/* -------------------------- 2. Pair deduplication & full state machine */

test('pair extraction deduplicates across shared people and tracks all 7 interface states + expiry + forum availability', () => {
  const h = makeHarness(seedThreePairMatrix);
  const r0 = h.api.matrixInterfaceReport().report;
  assert.equal(r0.isMatrix, true);
  assert.equal(r0.board.allPairsN, 3, 'sam & sally both share dana+priya -> deduplicated to 3 total pairs');
  assert.equal(r0.board.unagreedN, 3);
  assert.equal(r0.board.coveragePct, 0);
  assert.equal(r0.board.coverageWithheld, false);
  assert.equal(r0.board.statesReconcile, true);

  const dp = r0.pairs.find((p) => p.pairKey === 'dana|priya');
  assert.equal(dp.sharedPeopleN, 2);
  assert.equal(dp.apex.apexId, 'vp');

  // Step A: Dana signs side A -> one-sided (2026-11-20 is within 14d dueWarnDays from 2026-11-10)
  h.api.setActiveSeat('dana');
  assert.equal(h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    consultationRule: 'joint-priority-and-capacity',
    forumId: 'frm-sync',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2026-11-20',
    basis: 'Joint priority check each Monday.',
  }).ok, true);
  let r1 = h.api.matrixInterfaceReport().report;
  assert.equal(r1.board.oneSidedN, 1);

  // Step B: Priya signs different rule -> contested-terms
  h.api.setActiveSeat('priya');
  assert.equal(h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    consultationRule: 'async-update-only',
    forumId: 'frm-sync',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2026-11-20',
    basis: 'Prefer written asynchronous updates.',
  }).ok, true);
  let r2 = h.api.matrixInterfaceReport().report;
  assert.equal(r2.board.contestedTermsN, 1);
  assert.equal(r2.board.currentN, 0);

  // Step C: Priya confirms Dana's exact proposal -> current (within dueWarnDays=14 -> dueSoon)
  // Priya's span covers 2 pairs (< cellFloor=3), so coveragePct is withheld in Priya's view and revealed (33.3%) at operator altitude
  assert.equal(h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    confirmCounterpart: true,
    basis: 'Confirmed Dana proposal for November.',
  }).ok, true);
  let r3Priya = h.api.matrixInterfaceReport().report;
  assert.equal(r3Priya.board.currentN, 1);
  assert.equal(r3Priya.board.dueSoonN, 1);
  assert.equal(r3Priya.board.coveragePct, null);
  assert.equal(r3Priya.board.statesReconcile, true);
  assert.equal(r3Priya.pairs.find((p) => p.pairKey === 'dana|priya').agreed.forumName, 'Cross-Line Ops Review');

  h.api.setActiveSeat('');
  let r3 = h.api.matrixInterfaceReport().report;
  assert.equal(r3.board.coveragePct, 33.3);
  h.store.update((draft) => {
    draft.cadenceForums[0].status = 'retired';
  }, { type: 'cadence.forum.retired', entity: 'cadenceforum', entityId: 'frm-sync', summary: 'Retired forum' });
  let rForum = h.api.matrixInterfaceReport().report;
  assert.equal(rForum.board.forumUnavailableN, 1);
  assert.equal(rForum.board.currentN, 0);

  // Re-activate forum -> current again; advance clock past 2026-11-30 -> expired (no silent auto-renewal)
  h.store.update((draft) => {
    draft.cadenceForums[0].status = 'active';
  }, { type: 'cadence.forum.declared', entity: 'cadenceforum', entityId: 'frm-sync', summary: 'Restored forum' });
  h.setNow(new Date('2026-12-05T10:00:00.000Z'));
  let rExp = h.api.matrixInterfaceReport().report;
  assert.equal(rExp.board.expiredN, 1);
  assert.equal(rExp.board.currentN, 0);

  // Reset clock & affirm future-dated terms on dana|marcus -> stays unagreed (futureDated: true)
  h.setNow(NOW);
  h.api.setActiveSeat('dana');
  assert.equal(h.api.matrixInterfaceAffirm({
    pairKey: 'dana|marcus',
    consultationRule: 'consult-before-retune',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-12-01',
    reviewByOn: '2027-03-01',
    basis: 'Starts next month after Q4 close.',
  }).ok, true);
  h.api.setActiveSeat('marcus');
  assert.equal(h.api.matrixInterfaceAffirm({
    pairKey: 'dana|marcus',
    confirmCounterpart: true,
    basis: 'Agreed for December start.',
  }).ok, true);
  const dm = h.api.matrixInterfaceReport().report.pairs.find((p) => p.pairKey === 'dana|marcus');
  assert.equal(dm.state, 'unagreed');
  assert.equal(dm.futureDated, true);

  // Retire current dana|priya -> back to unagreed
  h.api.setActiveSeat('dana');
  assert.equal(h.api.matrixInterfaceRetire({
    pairKey: 'dana|priya',
    reason: 'Scope wound down cleanly after release.',
  }).ok, true);
  const dpAfterRetire = h.api.matrixInterfaceReport().report.pairs.find((p) => p.pairKey === 'dana|priya');
  assert.equal(dpAfterRetire.state, 'unagreed');
});

/* ---------------- 3. DAG diamond tie, disconnected graph & apex shift */

test('matrixJointApex diamond ties and disconnected managers read structurally-unresolvable and refuse signing', () => {
  const h = makeHarness((draft) => {
    // Diamond tie: both a1 and a2 are ancestors of mgrA AND mgrB without a unique join
    draft.people = [
      person('topA', 'Top A', 'vp', null),
      person('topB', 'Top B', 'vp', null),
      person('mgrA', 'Mgr Alpha', 'director', 'topA'),
      person('mgrB', 'Mgr Beta', 'director', 'topB'),
      person('dev', 'Dev Shared', 'ic', 'mgrA'),
      person('solo', 'Solo Isolated', 'director', 'external-missing'),
    ];
    draft.reportingLines = [
      // Give mgrA a secondary line up to topB and mgrB a secondary line up to topA -> incomparable joint ancestors!
      line('tie-a', 'mgrA', 'topB', 'cross-functional', 20),
      line('tie-b', 'mgrB', 'topA', 'cross-functional', 20),
      line('shared-dev-home', 'dev', 'mgrA', 'functional', 50),
      line('shared-dev-proj', 'dev', 'mgrB', 'project', 50),
    ];
    draft.people.push(person('ic2', 'Dev Two', 'ic', 'mgrA'));
    draft.reportingLines.push(line('ic2-home', 'ic2', 'mgrA', 'functional', 50));
    draft.reportingLines.push(line('ic2-proj', 'ic2', 'solo', 'project', 50));
  });

  const rep = h.api.matrixInterfaceReport().report;
  const tiePair = rep.allPairs.find((p) => p.pairKey === 'mgrA|mgrB');
  const discPair = rep.allPairs.find((p) => p.pairKey === 'mgrA|solo');
  assert.equal(tiePair.state, 'structurally-unresolvable');
  assert.equal(tiePair.apex.ambiguous, true);
  assert.equal(discPair.state, 'structurally-unresolvable');
  assert.equal(discPair.apex.disconnected, true);

  // Signing either ambiguous or disconnected pair MUST be refused
  const tieTry = h.api.matrixInterfaceAffirm({
    pairKey: 'mgrA|mgrB',
    actingSide: 'a',
    consultationRule: 'joint-tradeoffs-only',
    escalationSeatId: 'topA',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-02-01',
    basis: 'Trying to force one branch of a diamond.',
  });
  assert.equal(tieTry.ok, false);
  assert.match(tieTry.error, /ties across multiple minimal joint ancestors/);

  const discTry = h.api.matrixInterfaceAffirm({
    pairKey: 'mgrA|solo',
    actingSide: 'a',
    consultationRule: 'joint-tradeoffs-only',
    escalationSeatId: 'topA',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-02-01',
    basis: 'Trying to sign disconnected pair.',
  });
  assert.equal(discTry.ok, false);

  // Structure shift invalidating prior agreed escalation seat:
  const h2 = makeHarness((draft) => {
    draft.people = [
      person('ceo', 'Celia CEO', 'vp', null),
      person('dirOld', 'Old Apex Dir', 'director', 'ceo'),
      person('mA', 'Mgr A', 'manager', 'dirOld'),
      person('mB', 'Mgr B', 'manager', 'dirOld'),
      person('p1', 'Pat One', 'ic', 'mA'),
    ];
    draft.reportingLines = [
      line('l1', 'p1', 'mA', 'functional', 50),
      line('l2', 'p1', 'mB', 'project', 50),
    ];
  });
  h2.api.matrixInterfaceAffirm({ pairKey: 'mA|mB', actingSide: 'a', consultationRule: 'joint-tradeoffs-only', escalationSeatId: 'dirOld', effectiveFrom: '2026-11-01', reviewByOn: '2027-03-01', basis: 'Signed under dirOld apex.' });
  h2.api.matrixInterfaceAffirm({ pairKey: 'mA|mB', actingSide: 'b', confirmCounterpart: true, basis: 'Confirmed under dirOld.' });
  assert.equal(h2.api.matrixInterfaceReport().report.allPairs[0].state, 'current');

  // Re-org moves mB directly under ceo -> joint apex is now ceo, dirOld is NO LONGER above both!
  h2.store.update((draft) => {
    const mb = draft.people.find((p) => p.id === 'mB');
    mb.managerId = 'ceo';
  }, { type: 'person.updated', entity: 'person', entityId: 'mB', summary: 'Moved mB to ceo' });
  const shifted = h2.api.matrixInterfaceReport().report.allPairs[0];
  assert.equal(shifted.apex.apexId, 'ceo');
  assert.equal(shifted.escalationStale, true);
  assert.equal(shifted.state, 'structurally-unresolvable');
});

/* -------- 4. Standing guards, detail ceiling, cell floor & identity safety */

test('standing guards prevent counterpart forgery and peer interference; rank>=4 redacts peer names; brief & CSV carry zero identity', () => {
  const h = makeHarness(seedThreePairMatrix);

  // Manager dana CANNOT forge Priya's side B!
  h.api.setActiveSeat('dana');
  const forgedSide = h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    actingSide: 'b',
    consultationRule: 'joint-tradeoffs-only',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-03-01',
    basis: 'Trying to sign on Priya behalf.',
  });
  assert.equal(forgedSide.ok, false);

  // Escalation seat below apex (e.g. 'dana' instead of 'vp') MUST be refused
  const badEsc = h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    consultationRule: 'joint-tradeoffs-only',
    escalationSeatId: 'dana',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-03-01',
    basis: 'Trying to set escalation to self.',
  });
  assert.equal(badEsc.ok, false);

  // Bystander omar cannot sign or retire someone else's pair
  h.api.setActiveSeat('omar');
  const omarTry = h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    consultationRule: 'joint-tradeoffs-only',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-03-01',
    basis: 'Uninvolved peer interfering.',
  });
  assert.equal(omarTry.ok, false);
  assert.equal(h.api.matrixInterfaceReport().report.board.allPairsN, 0);

  // Legit sign-off by Dana + Priya for identity-audit checks
  h.api.setActiveSeat('dana');
  h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    consultationRule: 'joint-tradeoffs-only',
    forumId: 'frm-sync',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-03-01',
    basis: 'CONFIDENTIAL_PROSE_TOKEN',
  });

  // Rank 4 VP sees all 3 structural pairs, but non-self counterpart names & basis prose are redacted
  h.api.setActiveSeat('vp');
  const vpRep = h.api.matrixInterfaceReport().report;
  assert.equal(vpRep.board.allPairsN, 3);
  assert.ok(vpRep.pairs.every((p) => p.managerAWithheld && p.managerBWithheld));
  assert.ok(!JSON.stringify(vpRep.pairs).includes('CONFIDENTIAL_PROSE_TOKEN'));
  assert.ok(!JSON.stringify(vpRep.pairs).includes('Dana Director'));

  // Brief & CSV #122 must contain ZERO names, IDs, forum titles, or prose
  h.api.setActiveSeat('');
  const brief = matrixInterfaceBriefText(h.api.matrixInterfaceReport().report);
  const csvRes = exportWorkspaceCsv(h.store.state, 'matrix-interfaces', { now: NOW });
  assert.equal(csvRes.ok, true);
  const parsed = parseCsv(csvRes.csv);
  assert.deepEqual(parsed.headers, MATRIX_INTERFACE_CSV_COLUMNS);
  for (const forbidden of ['Dana', 'Priya', 'Marcus', 'Vera', 'Sam', 'Sally', 'dana', 'priya', 'frm-sync', 'Cross-Line Ops Review', 'CONFIDENTIAL_PROSE_TOKEN']) {
    assert.ok(!brief.includes(forbidden), `brief leaked "${forbidden}"`);
    assert.ok(!csvRes.csv.includes(forbidden), `CSV leaked "${forbidden}"`);
  }

  // Coverage withheld below cellFloor=3 OR with active defect
  const hSmall = makeHarness((draft) => {
    draft.people = [person('vp', 'Vera VP', 'vp'), person('d1', 'D1', 'director', 'vp'), person('d2', 'D2', 'director', 'vp'), person('p1', 'P1', 'ic', 'd1')];
    draft.reportingLines = [line('a1', 'p1', 'd1', 'functional', 50), line('a2', 'p1', 'd2', 'project', 50)];
  });
  const smallRep = hSmall.api.matrixInterfaceReport().report;
  assert.equal(smallRep.board.allPairsN, 1);
  assert.equal(smallRep.board.coverageWithheld, true);
  assert.equal(smallRep.board.coveragePct, null);
  assert.equal(parseCsv(exportWorkspaceCsv(hSmall.store.state, 'matrix-interfaces', { now: NOW }).csv).rows[0][MATRIX_INTERFACE_CSV_COLUMNS.indexOf('coverage_pct')], '');

  // Active reporting-line defect withholds coverage rate even with 3+ pairs
  h.store.update((draft) => {
    draft.reportingLines.push(line('bad-line', 'sam', 'marcus', 'project', 999));
  }, { type: 'matrix.line.declared', entity: 'person', entityId: 'sam', summary: 'Invalid share defect' });
  h.store.load();
  const defectRep = h.api.matrixInterfaceReport().report;
  assert.equal(defectRep.board.invalidLineN > 0, true);
  assert.equal(defectRep.board.coverageWithheld, true);
  assert.equal(defectRep.board.coveragePct, null);
});

/* ---------------- 5. RULE-MIA-01 spine, savepoint equivalence & reload */

test('RULE-MIA-01 stays inert in single-chain, delegates uncovered pairs to unique apex, closes upon agreement, and preserves savepoint equivalence', () => {
  // Single-chain inertness on automatic commits
  const single = makeHarness((draft) => {
    draft.people = [person('vp', 'Vera VP', 'vp'), person('sam', 'Sam', 'ic', 'vp')];
  });
  single.store.update(() => {}, { type: 'matrix.line.declared', entity: 'person', entityId: 'sam', summary: 'Noop' });
  assert.equal(single.store.state.delegations.length, 0);
  assert.equal(single.store.state.matrixInterfaceMarkers.length, 0);

  // Matrix workspace: explicit scan issues bounded asks to unique apex (`vp`), idempotent, closes on settlement
  const h = makeHarness(seedThreePairMatrix);
  const scan1 = h.api.matrixInterfaceScan();
  assert.equal(scan1.ok, true);
  const askTasks = h.store.state.delegations.filter((d) => d.support?.includes(MATRIX_INTERFACE_RULE_ID));
  assert.equal(askTasks.length, 3, 'one ask per uncovered pair');
  assert.ok(askTasks.every((d) => d.personId === 'vp' && d.status === 'active'));
  assert.ok(h.store.state.links.some((l) => l.ruleId === MATRIX_INTERFACE_RULE_ID && l.relation === 'issues-obligation'));

  // Re-scanning does NOT duplicate delegations
  h.api.matrixInterfaceScan();
  assert.equal(h.store.state.delegations.filter((d) => d.support?.includes(MATRIX_INTERFACE_RULE_ID)).length, 3);

  // Both sides affirm `dana|priya` -> RULE-MIA-01 automatically closes that pair's open delegation!
  h.api.setActiveSeat('dana');
  h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    consultationRule: 'joint-tradeoffs-only',
    escalationSeatId: 'vp',
    effectiveFrom: '2026-11-01',
    reviewByOn: '2027-02-01',
    basis: 'Joint weekly trade-offs established.',
  });
  h.api.setActiveSeat('priya');
  h.api.matrixInterfaceAffirm({
    pairKey: 'dana|priya',
    confirmCounterpart: true,
    basis: 'Confirmed bilateral operating terms.',
  });
  const closedAsk = h.store.state.delegations.filter((d) => d.support?.includes(MATRIX_INTERFACE_RULE_ID) && d.status === 'done');
  assert.equal(closedAsk.length, 1, 'agreed pair closed its interface review ask');

  // Reload persistence round-trip: display === stored and zero warnings
  const persisted = JSON.parse(h.storage.getItem(STORAGE_KEY));
  const reloadedStorage = fakeStorage();
  reloadedStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  const reloadedStore = createStore({ storage: reloadedStorage, now: () => NOW });
  reloadedStore.load();
  assert.deepEqual(
    buildMatrixInterfaceReport(reloadedStore.state, { now: NOW }).board,
    buildMatrixInterfaceReport(h.store.state, { now: NOW }).board,
  );

  // Savepoint lazy vs clone equivalence & declineMemo equivalence
  const baseA = normalizeState(createEmptyState(ISO)).state;
  seedThreePairMatrix(baseA);
  const baseB = JSON.parse(JSON.stringify(baseA));
  const idGen = (tag) => {
    let n = 0;
    return (p) => `${p}-${tag}-${++n}`;
  };
  const ev = { type: MATRIX_INTERFACE_EVENTS.SCAN, entity: 'workspace', entityId: 'matrix-interfaces' };
  runPostCommitRules(baseA, { now: NOW, nowIso: ISO, event: ev, idFactory: idGen('x') });
  runPostCommitRules(baseB, { now: NOW, nowIso: ISO, event: ev, idFactory: idGen('x'), savepoint: 'clone', declineMemo: false });
  assert.deepEqual(baseA, baseB, 'lazy savepoint & decline memoization match clone baseline byte-for-byte');
});

/* ------------------------- 6. JSDOM UI rendering & live panel round-trip */

test('JSDOM renders `#/matrix?panel=interfaces` cleanly and preserves stored state after reload', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;

  try {
    const h = makeHarness(seedThreePairMatrix);
    h.api.setActiveSeat('dana');
    h.api.matrixInterfaceAffirm({
      pairKey: 'dana|priya',
      consultationRule: 'joint-tradeoffs-only',
      escalationSeatId: 'vp',
      effectiveFrom: '2026-11-01',
      reviewByOn: '2027-02-01',
      basis: 'Rendered basis across shared engineers.',
    });
    h.api.setActiveSeat('priya');
    h.api.matrixInterfaceAffirm({
      pairKey: 'dana|priya',
      confirmCounterpart: true,
      basis: 'Confirmed in JSDOM round-trip check.',
    });
    h.api.setActiveSeat('');

    const node = renderMatrixInterfacePanel({
      api: h.api,
      state: h.store.state,
      toast() {},
      refresh() {},
      navigate() {},
    }, { now: NOW });

    dom.window.document.querySelector('#root').appendChild(node);
    const text = dom.window.document.querySelector('#root').textContent;
    assert.match(text, /33\.3%/);
    assert.match(text, /Dana Director ↔ Priya Lead/);
    assert.match(text, /Counterpart management-interface register/);
    assert.match(text, /State counts reconcile: verified/);
  } finally {
    dom.window.close();
  }
});
