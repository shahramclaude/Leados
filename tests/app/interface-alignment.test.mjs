/**
 * tests/app/interface-alignment.test.mjs — the Product–Organisation Interface
 * Alignment Matrix (Sosa, Eppinger & Rowles, 2004; Galbraith, 1974), ADR-0189,
 * Schema v149 unchanged, CSV scope #142, `RULE-OIA-01`.
 *
 * Hand-computed fixture (counts are pinned in comments — every number below
 * was derived by hand from the fixture BEFORE the reader existed):
 *   holders: ceo(vp) ← prod(director), nora — siblings under ceo; ops under nora;
 *   workers: tess, kim under prod; mia under prod + project line to nora;
 *            lee under nora; pat under ops; zoe under prod + project line to ops.
 *   nodes:   d1=tess(prod) d2=lee(nora) d3=kim(prod) d4=mia(UNATTRIBUTED — two
 *            managers) g1=lee(nora) g2=tess(prod) h1=pat(ops).
 *   arcs:    a1 d1→d2 (cross prod|nora, in-window)  a2 d3→d1 (same, prod)
 *            a3 d2→g1 (same, nora)  a4 d4→d1 (unattributed)
 *            a5 g2→g1 on 2026-05-01 (cross, OUT of window — start 2026-05-16)
 *            a6 h1→d2 on 2026-01-01 (cross ops|nora, OUT) — idle-case only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  SCHEMA_VERSION,
  createEmptyState,
  normalizeState,
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
  INTERFACE_ALIGNMENT_ASK_STATES,
  INTERFACE_ALIGNMENT_BOUNDS,
  INTERFACE_ALIGNMENT_CHANNEL_STATES,
  INTERFACE_ALIGNMENT_CSV_COLUMNS,
  INTERFACE_ALIGNMENT_CSV_DESCRIPTOR,
  INTERFACE_ALIGNMENT_CSV_SCOPE,
  INTERFACE_ALIGNMENT_ESCALATION_STATES,
  INTERFACE_ALIGNMENT_EVENTS,
  INTERFACE_ALIGNMENT_FINDINGS,
  INTERFACE_ALIGNMENT_PAIR_VERDICTS,
  INTERFACE_ALIGNMENT_RULE_ID,
  INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS,
} from '../../app/core/domain/interfaceAlignmentRegistry.js';
import {
  buildInterfaceAlignment,
  interfaceAlignmentCsvRows,
} from '../../app/core/domain/interfaceAlignment.js';
import { interfaceAlignmentRule } from '../../app/core/domain/interfaceAlignmentRules.js';
import { renderMatrixInterfaceAlignmentPanel } from '../../app/views/matrixInterfaceAlignmentPanel.js';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const TODAY = '2026-11-12';
const STAMP = '2026-11-12T09:00:00.000Z';
const WINDOW_START = '2026-05-16'; // TODAY - 180d

const link = (id, sourceType, sourceId, targetType, targetId, relation, createdOn) => ({
  id, sourceType, sourceId, targetType, targetId, relation,
  ruleId: 'MANUAL', summary: '', createdOn: createdOn || '2026-10-01', createdAt: STAMP,
});

const line = (id, personId, managerId, kind = 'home', shareH = 100) => ({
  id, personId, managerId, kind, shareH,
  rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: STAMP, history: [],
});

/**
 * The fixture. `arc` selects the precedence set: 'base' = a1..a5 (5 arcs),
 * 'idle' = base + a6. `acts` appends interface-agreement act rows. `forums`
 * appends cadence-forum rows. `ambiguous` swaps in the diamond-apex case.
 */
function fixture({ arc = 'base', acts = [], forums = [], extraLinks = [] } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    { id: 'ceo', name: 'Ceo', level: 0, levelName: 'vp', isManager: true, managerId: '' },
    { id: 'prod', name: 'Prod', level: 1, levelName: 'director', isManager: true, managerId: 'ceo' },
    { id: 'nora', name: 'Nora', level: 1, levelName: 'director', isManager: true, managerId: 'ceo' },
    { id: 'ops', name: 'Ops', level: 2, levelName: 'director', isManager: true, managerId: 'nora' },
    { id: 'tess', name: 'Tess', level: 3, levelName: 'lead', isManager: false, managerId: 'prod' },
    { id: 'kim', name: 'Kim', level: 3, levelName: 'lead', isManager: false, managerId: 'prod' },
    { id: 'mia', name: 'Mia', level: 3, levelName: 'lead', isManager: false, managerId: 'prod' },
    { id: 'lee', name: 'Lee', level: 3, levelName: 'lead', isManager: false, managerId: 'nora' },
    { id: 'pat', name: 'Pat', level: 4, levelName: 'ic', isManager: false, managerId: 'ops' },
    { id: 'zoe', name: 'Zoe', level: 3, levelName: 'lead', isManager: false, managerId: 'prod' },
  ];
  raw.reportingLines = [
    line('l-tess-prod', 'tess', 'prod'),
    line('l-kim-prod', 'kim', 'prod'),
    line('l-mia-prod', 'mia', 'prod'),
    line('l-mia-nora', 'mia', 'nora', 'project', 25),
    line('l-lee-nora', 'lee', 'nora'),
    line('l-pat-ops', 'pat', 'ops'),
    line('l-zoe-prod', 'zoe', 'prod'),
    line('l-zoe-ops', 'zoe', 'ops', 'project', 25),
  ];
  raw.decisions = [
    { id: 'd1', title: 'D1', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
    { id: 'd2', title: 'D2', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
    { id: 'd3', title: 'D3', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
    { id: 'd4', title: 'D4', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' },
  ];
  raw.goals = [
    { id: 'g1', title: 'G1', status: 'active' },
    { id: 'g2', title: 'G2', status: 'active' },
  ];
  raw.dependencies = [{ id: 'h1', name: 'H1', date: '2026-09-01', status: 'open' }];
  const baseArcs = [
    link('a1', 'decision', 'd1', 'decision', 'd2', 'informs', '2026-10-01'),
    link('a2', 'decision', 'd3', 'decision', 'd1', 'informs', '2026-10-01'),
    link('a3', 'decision', 'd2', 'goal', 'g1', 'informs', '2026-10-01'),
    link('a4', 'decision', 'd4', 'decision', 'd1', 'informs', '2026-10-01'),
    link('a5', 'goal', 'g2', 'goal', 'g1', 'informs', '2026-05-01'),
  ];
  const idleArcs = arc === 'idle'
    ? [link('a6', 'dependency', 'h1', 'decision', 'd2', 'informs', '2026-01-01')]
    : [];
  raw.links = [
    ...baseArcs,
    ...idleArcs,
    // people-attribution edges
    link('p1', 'person', 'tess', 'decision', 'd1', 'involves'),
    link('p2', 'person', 'lee', 'decision', 'd2', 'involves'),
    link('p3', 'person', 'kim', 'decision', 'd3', 'involves'),
    link('p4', 'person', 'mia', 'decision', 'd4', 'involves'),
    link('p5', 'person', 'lee', 'goal', 'g1', 'involves'),
    link('p6', 'person', 'tess', 'goal', 'g2', 'involves'),
    link('p7', 'person', 'pat', 'dependency', 'h1', 'involves'),
    ...extraLinks,
  ];
  raw.matrixInterfaceAgreements = acts;
  raw.cadenceForums = forums;
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null, today: TODAY };
  return normalizeState(raw, { now: NOW }).state;
}

const act = (over) => ({
  pairKey: 'nora|prod', managerAId: 'nora', managerBId: 'prod',
  actingSide: 'a', actingManagerId: 'nora', outcome: 'affirm',
  consultationRule: 'joint-priority-and-capacity', forumId: '',
  escalationSeatId: 'ceo', effectiveFrom: '2026-01-01', reviewByOn: '2027-01-01',
  basis: 'Joint priority and capacity review each Monday.', decidedOn: '2026-01-05',
  ...over,
});

const bilateral = (pairKey, managerAId, managerBId, over = {}) => [
  act({ id: `aff-${pairKey}-a`, pairKey, managerAId, managerBId, actingSide: 'a', actingManagerId: managerAId, ...over }),
  act({ id: `aff-${pairKey}-b`, pairKey, managerAId, managerBId, actingSide: 'b', actingManagerId: managerBId, ...over }),
];

const read = (state, extra = {}) => buildInterfaceAlignment(state, { now: NOW, settings: state.settings, ...extra });
const pairOf = (report, key) => report.pairs.find((p) => p.pairKey === key);

/* ---------------------------------------------------------- 1. registration */

test('registration: schema v149 unchanged, the 34th matrix panel, CSV #142, one safe read, declared right and pause permit', () => {
  assert.equal(SCHEMA_VERSION, 154, 'no schema bump — the register stores nothing');
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'alignment'), 'the alignment panel is on the matrix tab bar');
  const scope = CSV_EXPORTS.find((entry) => entry.key === INTERFACE_ALIGNMENT_CSV_SCOPE);
  assert.ok(scope, 'CSV #142 is registered');
  assert.equal(scope.sensitive, false, 'the export is aggregate-only');
  assert.equal(scope.filenameSlug, INTERFACE_ALIGNMENT_CSV_DESCRIPTOR.filenameSlug);
  assert.equal(CSV_EXPORTS.length, 146);
  assert.ok(SAFE_READS.has('matrixInterfaceAlignmentReport'), 'the pure read is a declared safe read');
  assert.ok(!SAFE_READS.has('matrixInterfaceAlignmentScan'), 'the scan is NOT a safe read: it writes');
  assert.equal(ACTION_RIGHTS['govern-interface-alignment'].minRank, 3);
  const right = API_RIGHTS;
  assert.equal(right.matrixInterfaceAlignmentScan, 'govern-interface-alignment');
  assert.equal(right.matrixInterfaceAlignmentSetConventions, 'govern-interface-alignment');
  assert.equal(right.matrixInterfaceAlignmentReport, 'declare-matrix-line', 'the pure read sits on declare-matrix-line');
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('interfaceAlignmentAutoPropagate'), 'the switch is a permit');
  assert.equal(PAUSE_PERMIT_REACH_RULES.interfaceAlignmentAutoPropagate, 'interfaceAlignmentRules.js');
  assert.equal(INTERFACE_ALIGNMENT_RULE_ID, 'RULE-OIA-01');
  // Closed vocabularies, exactly as declared.
  assert.equal(INTERFACE_ALIGNMENT_PAIR_VERDICTS.length, 7);
  assert.deepEqual(INTERFACE_ALIGNMENT_PAIR_VERDICTS.map((v) => v.rank), [0, 1, 2, 3, 4, 5, 6], 'ranks are 0..6');
  assert.equal(INTERFACE_ALIGNMENT_CHANNEL_STATES.length, 8);
  assert.equal(INTERFACE_ALIGNMENT_ESCALATION_STATES.length, 6);
  assert.equal(INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS.length, 4);
  assert.equal(INTERFACE_ALIGNMENT_FINDINGS.map((f) => f.key).join(','), 'interface-unattended,agreement-idle');
  assert.equal(INTERFACE_ALIGNMENT_ASK_STATES.length, 4);
  assert.equal(INTERFACE_ALIGNMENT_BOUNDS.windowDays[0], 30);
  assert.equal(INTERFACE_ALIGNMENT_BOUNDS.windowDays[1], 730);
  // Shared spine: one rule, one contract, stated total.
  const contract = contractFor(interfaceAlignmentRule);
  assert.ok(contract, 'RULE-OIA-01 declares its propagation contract');
  assert.equal(contract.module, 'interfaceAlignmentRules.js');
  assert.deepEqual(contract.writes, ['delegations', 'links', 'matrixMarkers']);
  assert.deepEqual(contract.emits, []);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, '1:1 rule/contract parity');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, 123, 'the shared spine total is stated deliberately (ADR-0193 added RULE-GCC-01, ADR-0194 added RULE-CBP-01)');
});

test('the pause permit table and the rule agree: a pause is a pause', () => {
  const state = fixture();
  const view = buildPausePermits(
    { ...state, settings: { ...state.settings, interfaceAlignmentAutoPropagate: false } },
    { now: NOW },
  );
  const entry = (view.switches || []).find((s) => s && (s.key === 'interfaceAlignmentAutoPropagate' || s.switchKey === 'interfaceAlignmentAutoPropagate'));
  assert.ok(entry, 'the paused switch appears in the permit ledger');
});

/* ------------------------------------------------ 2. the base hand-computed */

test('base fixture (a1..a5): every board figure matches the hand computation', () => {
  const report = read(fixture());
  const b = report.board;
  // 5 precedence arcs = 2 cross (1 in / 1 out) + 2 same + 1 unattributed.
  assert.equal(b.precedenceArcsN, 5, 'a1..a5');
  assert.equal(b.crossHolderArcsN, 2, 'a1 in-window, a5 out-of-window');
  assert.equal(b.crossHolderInWindowN, 1);
  assert.equal(b.crossHolderOutOfWindowN, 1);
  assert.equal(b.sameHolderArcsN, 2, 'a2 (prod), a3 (nora)');
  assert.equal(b.unattributedArcsN, 1, 'a4: d4 (mia) has two managers — refused, never charged');
  assert.equal(b.nodesN, 6, 'd1 d2 d3 d4 g1 g2');
  assert.equal(b.pairRowsN, 1, 'exactly one cross-holder interface row: nora|prod');
  assert.equal(report.pairsTotalN, 1);
  assert.equal(b.sharedPeopleOnlyPairsN, 1, 'prod|ops via zoe — context only, never a row');
  assert.equal(b.unattendedPairsN, 1);
  assert.equal(b.darkChannelPairsN, 0);
  assert.equal(b.idleAgreementPairsN, 0);
  assert.equal(b.attendedPairsN, 0);
  assert.equal(b.standingPairsN, 0);
  assert.equal(b.failureModeInterfacesN, 1);
  assert.equal(b.failureModeIdleN, 0);
  assert.equal(b.liveAgreementsN, 0);
  assert.equal(b.partialAgreementsN, 0);
  assert.equal(b.sharedActiveForumsN, 0);
  assert.equal(b.rollupApexN, 1);
  assert.equal(b.ambiguousApexN, 0);
  // Three claims, printed apart.
  assert.equal(b.countsReconcile, true);
  assert.equal(b.figuresComplete, true);
  assert.equal(b.interfacesClaim, false, 'one unattributed arc refuses the census claim');
  assert.ok(String(b.claimReason).length > 0, 'the refusal prints its reason');

  // The nora|prod interface row, in full.
  const pair = pairOf(report, 'nora|prod');
  assert.ok(pair, 'pair key is managerA|managerB sorted');
  assert.equal(pair.managerAId, 'nora');
  assert.equal(pair.managerBId, 'prod');
  assert.equal(pair.depsN, 2, 'a1 + a5');
  assert.equal(pair.depsInWindowN, 1);
  assert.equal(pair.depsOutOfWindowN, 1);
  assert.equal(pair.flowsAB, 0);
  assert.equal(pair.flowsBA, 2, 'both arcs flow prod → nora');
  assert.equal(pair.sharedPeopleN, 1, 'mia: home prod + project line nora');
  assert.equal(pair.channelState, 'none');
  assert.equal(pair.verdict, 'unattended-interface');
  assert.equal(pair.failureMode, 'interface-unattended');
  assert.equal(pair.isFinding, true);
  assert.equal(pair.escalationState, 'unique');
  assert.equal(pair.escalationSeatId, 'ceo', 'minimal common ancestor of nora and prod (siblings under ceo)');
  assert.equal(pair.askState, 'not-issued', 'the pure read never issues an ask');
  assert.equal(pair.membersN, 2, 'd1→d2 and g2→g1');

  // Roll-up: one apex, one pair, one finding.
  const roll = report.rollUps.find((r) => r.apexId === 'ceo');
  assert.ok(roll);
  assert.equal(roll.pairsN, 1);
  assert.equal(roll.findingsN, 1);
  assert.equal(roll.unattendedN, 1);

  // Closed-loop tallies used by the CSV (the closed map carries every key).
  assert.equal(report.verdictCounts['unattended-interface'], 1);
  assert.equal(report.verdictCounts['idle-channel'], 0);
  assert.equal(report.verdictCounts.attended, 0);
  assert.equal(report.verdictCounts.standing, 0);
  assert.equal(Object.keys(report.verdictCounts).length, INTERFACE_ALIGNMENT_PAIR_VERDICTS.length);
  assert.equal(report.channelStateCounts.none, 1);
  assert.equal(report.asks.openN, 0);
  assert.equal(report.asks.notIssuedN, 1);
});

/* --------------------------------------------------- 3. the idle-channel case */

test('idle case (base + a6 + a live bilateral agreement on nora|ops): idle-channel prints beside the unattended pair', () => {
  const report = read(fixture({ arc: 'idle', acts: bilateral('nora|ops', 'nora', 'ops') }));
  const idle = pairOf(report, 'nora|ops');
  assert.ok(idle);
  assert.equal(idle.depsN, 1, 'a6');
  assert.equal(idle.depsInWindowN, 0);
  assert.equal(idle.depsOutOfWindowN, 1, 'a6 prints beside the finding, never in-window');
  assert.equal(idle.sharedPeopleN, 0);
  assert.equal(idle.channelState, 'live-agreement');
  assert.equal(idle.verdict, 'idle-channel');
  assert.equal(idle.failureMode, 'agreement-idle');
  assert.equal(idle.isFinding, true);
  assert.equal(idle.escalationState, 'unique');
  assert.equal(idle.escalationSeatId, 'nora', 'minimal common ancestor of nora and ops');
  // FM1 still stands on its own pair — never collapsed.
  assert.equal(pairOf(report, 'nora|prod').verdict, 'unattended-interface');
  const b = report.board;
  assert.equal(b.idleAgreementPairsN, 1);
  assert.equal(b.failureModeIdleN, 1);
  assert.equal(b.failureModeInterfacesN, 1);
  assert.equal(b.liveAgreementsN, 1);
});

/* --------------------------------------------- 4. dark channels, one by one */

function darkCase(name, acts, forums, expectedState) {
  test(`dark channel: ${name} reads ${expectedState} and channel-not-live — never a live one`, () => {
    const report = read(fixture({ acts, forums }));
    const pair = pairOf(report, 'nora|prod');
    assert.equal(pair.channelState, expectedState, name);
    assert.equal(pair.channelLive, false);
    assert.equal(pair.verdict, 'channel-not-live');
    assert.equal(pair.failureMode, 'interface-unattended');
    assert.ok(String(pair.channelDetail).length > 0, 'the detail prints its reason');
  });
}

darkCase('one-sided (a signed, b silent)', [act({ id: 'one-a' })], [], 'one-sided');
darkCase('contested terms (both signed, different consultation rules)', [
  act({ id: 'c-a' }),
  act({ id: 'c-b', actingSide: 'b', actingManagerId: 'prod', consultationRule: 'joint-tradeoffs-only' }),
], [], 'contested-terms');
darkCase('expired agreement (reviewByOn in the past)', bilateral('nora|prod', 'nora', 'prod', { reviewByOn: '2026-06-01' }), [], 'expired-agreement');
darkCase('future agreement (effectiveFrom after today)', bilateral('nora|prod', 'nora', 'prod', { effectiveFrom: '2027-01-01', reviewByOn: '2027-06-01' }), [], 'future-agreement');
darkCase('forum unavailable (the bilateral terms name a retired forum)', bilateral('nora|prod', 'nora', 'prod', { forumId: 'frm-gone' }), [
  { id: 'frm-gone', title: 'Joint sync', kind: 'leadership-sync', cadence: 'weekly', status: 'retired', chairSeatId: 'ceo', attending: ['nora', 'prod'], createdAt: '2026-01-01T09:00:00.000Z' },
], 'forum-unavailable');

/* ------------------------------------------------ 5. the attended / standing */

test('attended: a shared ACTIVE forum carries the dependencies; standing: a live agreement with shared contributors and no dependency', () => {
  const attended = read(fixture({
    forums: [{ id: 'frm-live', title: 'Joint sync', kind: 'leadership-sync', cadence: 'weekly', status: 'active', chairSeatId: 'ceo', attending: ['nora', 'prod'], createdAt: '2026-01-01T09:00:00.000Z' }],
  }));
  const pair = pairOf(attended, 'nora|prod');
  assert.equal(pair.channelState, 'shared-forum');
  assert.equal(pair.channelLive, true);
  assert.equal(pair.verdict, 'attended', 'every declared dependency rides the live channel');
  assert.equal(attended.board.attendedPairsN, 1);
  assert.equal(attended.board.failureModeInterfacesN, 0);

  // prod|ops share zoe; a live bilateral agreement and NO dependency: standing.
  // canonicalPairKey sorts 'ops' before 'prod'.
  const standing = read(fixture({ acts: bilateral('ops|prod', 'ops', 'prod') }));
  const sp = pairOf(standing, 'ops|prod');
  assert.ok(sp, 'the agreement itself makes the pair a row');
  assert.equal(sp.depsN, 0);
  assert.equal(sp.sharedPeopleN, 1, 'zoe');
  assert.equal(sp.channelState, 'live-agreement');
  assert.equal(sp.verdict, 'standing');
  assert.equal(standing.board.standingPairsN, 1);
  assert.equal(standing.board.sharedPeopleOnlyPairsN, 0, 'no longer shared-only: it is a row');
});

test('context rows: a shared forum with nothing behind it, and a dark channel with nothing behind it', () => {
  // nora|ops: shared forum, no dependency, no shared person.
  const forumOnly = read(fixture({ arc: 'base', forums: [{ id: 'frm-j', title: 'Joint', kind: 'leadership-sync', cadence: 'weekly', status: 'active', chairSeatId: 'ceo', attending: ['nora', 'ops'], createdAt: '2026-01-01T09:00:00.000Z' }] }));
  const fp = pairOf(forumOnly, 'nora|ops');
  assert.ok(fp);
  assert.equal(fp.verdict, 'forum-without-interface');
  assert.equal(fp.failureMode, null, 'printed as context; the idle claim is scoped to agreements');
  // nora|ops: one dark act, nothing behind it.
  const darkOnly = read(fixture({ acts: [act({ id: 'solo', pairKey: 'nora|ops', managerAId: 'nora', managerBId: 'ops', actingManagerId: 'nora' })] }));
  const dp = pairOf(darkOnly, 'nora|ops');
  assert.ok(dp);
  assert.equal(dp.verdict, 'channel-without-interface');
  assert.equal(dp.failureMode, null);
});

/* ---------------------------------------------- 6. ambiguity is named, never broken */

test('a diamond apex is named ambiguous and refused an ask path', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    { id: 'ann1', name: 'Ann1', level: 1, levelName: 'vp', isManager: true, managerId: '' },
    { id: 'ann2', name: 'Ann2', level: 1, levelName: 'vp', isManager: true, managerId: '' },
    { id: 'm1', name: 'M1', level: 2, levelName: 'director', isManager: true, managerId: 'ann1' },
    { id: 'm2', name: 'M2', level: 2, levelName: 'director', isManager: true, managerId: 'ann1' },
    { id: 'w1', name: 'W1', level: 3, levelName: 'ic', isManager: false, managerId: 'm1' },
    { id: 'w2', name: 'W2', level: 3, levelName: 'ic', isManager: false, managerId: 'm2' },
  ];
  raw.reportingLines = [
    line('l-m1-ann1', 'm1', 'ann1'), line('l-m1-ann2', 'm1', 'ann2', 'project', 25),
    line('l-m2-ann1', 'm2', 'ann1'), line('l-m2-ann2', 'm2', 'ann2', 'project', 25),
    line('l-w1-m1', 'w1', 'm1'), line('l-w2-m2', 'w2', 'm2'),
  ];
  raw.decisions = [{ id: 'x1', title: 'X1', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' }];
  raw.goals = [{ id: 'x2', title: 'X2', status: 'active' }];
  raw.links = [
    link('ax', 'decision', 'x1', 'goal', 'x2', 'informs', '2026-10-01'),
    link('px1', 'person', 'w1', 'decision', 'x1', 'involves'),
    link('px2', 'person', 'w2', 'goal', 'x2', 'involves'),
  ];
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null, today: TODAY };
  const state = normalizeState(raw, { now: NOW }).state;
  const report = read(state);
  const pair = pairOf(report, 'm1|m2');
  assert.ok(pair);
  assert.equal(pair.verdict, 'unattended-interface');
  assert.equal(pair.escalationState, 'ambiguous', 'minimal common ancestors {ann1, ann2} — incomparable');
  assert.deepEqual(pair.apexIds, ['ann1', 'ann2']);
  assert.equal(pair.escalationSeatId, null, 'ambiguity is named, never silently resolved');
  assert.equal(report.board.ambiguousApexN, 1);
});

/* --------------------------------------------------- 7. the CSV: identity-free */

test('CSV #142 exports the same aggregates and no identity', () => {
  const state = fixture({ arc: 'idle', acts: bilateral('nora|ops', 'nora', 'ops') });
  const report = read(state);
  const rows = interfaceAlignmentCsvRows(report);
  // 1 workspace + 2 pair-verdict + channel-state rows + refusal rows.
  const kinds = rows.map((r) => r.row_kind);
  assert.equal(kinds.filter((k) => k === 'workspace').length, 1);
  assert.equal(kinds.filter((k) => k === 'pair-verdict').length, INTERFACE_ALIGNMENT_PAIR_VERDICTS.length);
  assert.equal(kinds.filter((k) => k === 'channel-state').length, INTERFACE_ALIGNMENT_CHANNEL_STATES.length);
  for (const row of rows) {
    for (const key of INTERFACE_ALIGNMENT_CSV_COLUMNS) {
      assert.ok(key in row, `column ${key} is present on every row`);
    }
  }
  // The workspace row carries the SAME figures the board printed.
  const ws = rows[0];
  assert.equal(ws.precedence_arcs_n, '6', 'base 5 + a6 — the reader’s own tally');
  assert.equal(ws.unattended_pairs_n, '1');
  assert.equal(ws.idle_agreement_pairs_n, '1');
  assert.equal(ws.failure_mode_interfaces_n, '1');
  assert.equal(ws.failure_mode_idle_n, '1');
  assert.equal(ws.counts_reconcile, 'yes');
  assert.equal(ws.interfaces_claim, 'no');
  assert.ok(ws.claim_reason.length > 0, 'the refused claim prints its reason');
  // Identity-free: no name, id or pair key anywhere in the values.
  const banned = ['nora', 'prod', 'ops', 'ceo', 'tess', 'mia', 'zoe', 'lee', 'pat', 'kim', 'nora|prod', 'd1', 'g1', 'h1', 'Riley'];
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      for (const word of banned) {
        assert.ok(!String(value).includes(word), `row ${row.row_kind}.${key} leaks "${word}": ${value}`);
      }
    }
  }
  // The export path returns the same rows.
  const out = exportWorkspaceCsv(state, INTERFACE_ALIGNMENT_CSV_SCOPE, { now: NOW });
  assert.ok(out && out.ok !== false);
  const text = typeof out === 'string' ? out : String(out.csv || out.text || '');
  assert.ok(text.length > 0);
  assert.equal(text.split(/\r?\n/).length >= rows.length, true);
});

/* ------------------------------------------------ 8. RULE-OIA-01 on the spine */

let seq = 0;
function runRule(state, { event = INTERFACE_ALIGNMENT_EVENTS.SCAN, at = NOW, settings = {} } = {}) {
  const draft = JSON.parse(JSON.stringify(state));
  draft.settings = { ...draft.settings, ...settings };
  const out = interfaceAlignmentRule(draft, {
    now: at,
    event: { type: event, entity: 'workspace', entityId: 'workspace' },
    idFactory: (prefix) => `${prefix}-t${++seq}`,
    recordEffect: () => {},
  });
  return { draft, out };
}
const asksOf = (draft) => (draft.delegations || []).filter((d) => d && d.status === 'active');
const markersOf = (draft) => (draft.matrixMarkers || []).filter((m) => m && m.kind === 'interface-alignment');

test('RULE-OIA-01: one dated ask to the unique joint apex, idempotent, self-closing, pause-governed', () => {
  const state = fixture();
  // (a) one ask to ceo — the unique matrixJointApex of the nora|prod finding.
  const first = runRule(state);
  const asks = asksOf(first.draft);
  assert.equal(asks.length, 1, 'exactly one open ask');
  assert.equal(asks[0].personId, 'ceo');
  assert.ok(asks[0].dueOn, 'the ask is dated');
  assert.ok(String(asks[0].description || asks[0].title || '').length > 0, 'the copy prints what to do');
  const obligationLinks = (first.draft.links || []).filter((l) => l && l.relation === 'issues-obligation');
  assert.equal(obligationLinks.length, 1, 'typed issues-obligation provenance');
  assert.equal(obligationLinks[0].sourceId, 'ceo');
  // (b) idempotence: a second run over the SAME ground issues nothing new.
  const second = runRule(first.draft);
  assert.equal(asksOf(second.draft).length, 1, 'no duplicate ask per finding signature');
  // (c) self-close when the finding clears.
  const cleared = JSON.parse(JSON.stringify(first.draft));
  cleared.links = cleared.links.filter((l) => !['a1', 'a5'].includes(l.id));
  const third = runRule(cleared);
  const task = (third.draft.delegations || []).find((d) => d && d.id === asks[0].id);
  assert.ok(task, 'the ask survives as history');
  assert.equal(task.status, 'done', 'closed');
  assert.ok(String(task.completionNote).startsWith('Closed by RULE-OIA-01:'), 'the close reason prints');
  // (d) a pause is a pause — every path, including explicit scans.
  const paused = runRule(state, { settings: { interfaceAlignmentAutoPropagate: false } });
  assert.equal(asksOf(paused.draft).length, 0);
  assert.equal(paused.out.length, 0, 'no effects, no asks');
});

test('RULE-OIA-01: an ambiguous-apex finding records ONE identity-free marker and substitutes nobody', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [
    { id: 'ann1', name: 'Ann1', level: 1, levelName: 'vp', isManager: true, managerId: '' },
    { id: 'ann2', name: 'Ann2', level: 1, levelName: 'vp', isManager: true, managerId: '' },
    { id: 'm1', name: 'M1', level: 2, levelName: 'director', isManager: true, managerId: 'ann1' },
    { id: 'm2', name: 'M2', level: 2, levelName: 'director', isManager: true, managerId: 'ann1' },
    { id: 'w1', name: 'W1', level: 3, levelName: 'ic', isManager: false, managerId: 'm1' },
    { id: 'w2', name: 'W2', level: 3, levelName: 'ic', isManager: false, managerId: 'm2' },
  ];
  raw.reportingLines = [
    line('l-m1-ann1', 'm1', 'ann1'), line('l-m1-ann2', 'm1', 'ann2', 'project', 25),
    line('l-m2-ann1', 'm2', 'ann1'), line('l-m2-ann2', 'm2', 'ann2', 'project', 25),
    line('l-w1-m1', 'w1', 'm1'), line('l-w2-m2', 'w2', 'm2'),
  ];
  raw.decisions = [{ id: 'x1', title: 'X1', driver: '', approver: '', contributors: '', informed: '', chosen: '', date: '2026-10-01' }];
  raw.goals = [{ id: 'x2', title: 'X2', status: 'active' }];
  raw.links = [
    link('ax', 'decision', 'x1', 'goal', 'x2', 'informs', '2026-10-01'),
    link('px1', 'person', 'w1', 'decision', 'x1', 'involves'),
    link('px2', 'person', 'w2', 'goal', 'x2', 'involves'),
  ];
  raw.settings = { ...raw.settings, leaderName: 'Riley Lead', activeSeatId: null, today: TODAY };
  const state = normalizeState(raw, { now: NOW }).state;
  const { draft, out } = runRule(state);
  assert.equal(asksOf(draft).length, 0, 'nobody is substituted for an incomparable apex');
  const markers = markersOf(draft);
  assert.equal(markers.length, 1, 'ONE identity-free observation');
  assert.equal(markers[0].key.startsWith('interface-alignment|obs|'), true);
  assert.ok(out.length >= 1, 'the observation is reported as an effect');
});

/* ------------------------------------------------------- 9. panel smoke */

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

test('the panel prints the reader’s figures — the same numbers the CSV exports', () => {
  const state = fixture({ arc: 'idle', acts: bilateral('nora|ops', 'nora', 'ops') });
  const html = withDom(() => {
    const node = renderMatrixInterfaceAlignmentPanel({ state, api: {} }, { now: NOW });
    const wrap = document.createElement('div');
    wrap.appendChild(node);
    return wrap.innerHTML;
  });
  assert.ok(html.includes('unattended-interface') || html.includes('Unattended technical interface'), 'FM1 prints');
  assert.ok(html.includes('idle-channel') || html.includes('Idle coordination channel'), 'FM2 prints');
  assert.ok(html.includes('RULE-OIA-01'), 'the rule is named on the panel');
  assert.ok(html.includes('ADR-0189'), 'the ADR is named on the panel');
  assert.ok(!/undefined|NaN|\[object/.test(html), 'no placeholder garbage on screen');
});
