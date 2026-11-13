/**
 * ADR-0181 — Non-Promotable Work Turn Ledger (Schema v144).
 *
 * WHAT THIS SUITE COVERS
 * ----------------------
 *   workTurnRegistry.js   the closed vocabulary;
 *   workTurnSchema.js     settings, acts and markers (load-time normalisation);
 *   workTurns.js          the pure read model, brief and CSV row;
 *   workTurnRules.js      RULE-NPW-01, called directly on a plain draft AND
 *                         registered on the real post-commit spine;
 *   workTurnActions.js    the four API doors, through the real access gateway;
 *   the wiring            `#/matrix?panel=turns`, both gateway lists, CSV scope
 *                         #135, the contract, the view dispatch and the panel
 *                         (DOM figures == the report the action returned).
 *
 * Every expected number below is worked out BY HAND in a comment from the
 * fixture, never by calling the engine a second time.
 *
 * The contract proved here:
 *   - an ask nobody classified is charged to nobody (refused, not guessed);
 *   - a fair turn is share-weighted in exact integers and matches a hand sum;
 *   - a pool with a missing share, below the floor or partly outside the seat
 *     makes no claim, and a person whose pools were not all read is `unread`;
 *   - the stacked finding — within a fair turn on every line, over it in sum —
 *     is read only by a seat that can read every line;
 *   - a seat reads its own span, and a withheld altitude gets counts only;
 *   - the rule asks ONE seat, once per signature, closes its own ask, and
 *     substitutes nobody when no single seat owns the finding;
 *   - under the REAL spine the classification, the ask, the roll-up and the
 *     seal land in one commit, persist, and read back equal (display == stored).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, COLLECTIONS, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildMatrixReport } from '../../app/core/domain/matrix.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  buildWorkTurns,
  workTurnApprox,
  workTurnBriefText,
  workTurnCsvRows,
  workTurnIsOver,
  workTurnRuleIssuedIds,
  workTurnSignature,
} from '../../app/core/domain/workTurns.js';
import { rankWorkTurnBounds } from '../../app/core/domain/workTurnBounds.js';
import {
  WORK_TURN_CLOSED_PREFIX, WORK_TURN_GUIDANCE, WORK_TURN_OLD_GUIDANCE, WORK_TURN_TRIGGER_EVENTS, workTurnRule,
} from '../../app/core/domain/workTurnRules.js';
import {
  compactWorkTurnActs,
  effectiveWorkTurnActs,
  normalizeWorkTurnActs,
  normalizeWorkTurnSettings,
} from '../../app/core/domain/workTurnSchema.js';
import {
  WORK_TURN_BOUNDS,
  WORK_TURN_CLASS_REASONS,
  WORK_TURN_CSV_COLUMNS,
  WORK_TURN_CSV_DESCRIPTOR,
  WORK_TURN_EVENTS,
  WORK_TURN_LIMITS,
  WORK_TURN_METHOD,
  WORK_TURN_PLACEMENT_REASONS,
  WORK_TURN_POOL_STATES,
  WORK_TURN_POOL_STATE_LABELS,
  WORK_TURN_RANK_STATES,
  WORK_TURN_RIGHTS,
  WORK_TURN_RULE_ID,
  WORK_TURN_RULE_RELATIONS,
  WORK_TURN_SETTING_KEYS,
  WORK_TURN_VERDICTS,
  WORK_TURN_VERDICT_LABELS,
} from '../../app/core/domain/workTurnRegistry.js';
import { renderMatrixWorkTurnPanel } from '../../app/views/matrixWorkTurnPanel.js';
import { renderMatrix } from '../../app/views/matrix.js';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const ISO = NOW.toISOString();
const K = WORK_TURN_SETTING_KEYS;

const person = (id, name, level, managerId = null) => ({ id, name, level, managerId, status: 'active', createdAt: ISO });
const line = (id, personId, managerId, kind, shareH, toISO = null) => ({
  id, personId, managerId, kind, shareH, rights: [], fromISO: '2026-01-01', toISO,
  declaredAt: ISO, declaredBySeatId: null, history: [], status: toISO ? 'ended' : 'active',
});
const ask = (id, personId, title, delegatedOn = '2026-10-20', status = 'active') => ({
  id, personId, title, delegatedOn, status, createdAt: ISO, updatedAt: ISO,
  ...(status === 'returned' ? { returnedOn: '2026-10-25', returnReason: 'No capacity this month' } : {}),
});
const kindAct = (id, delegationId, personId, kind, at = ISO) => ({ id, delegationId, personId, kind, byId: null, at });
const lineAct = (id, delegationId, personId, lineId, managerId, lineKind) => ({
  id, delegationId, personId, lineId, managerId, lineKind, basis: 'declared', byId: null, at: ISO,
});

/**
 * Vera (VP) → Dora (director) → Finn (functional manager) and Petra (project manager).
 *
 *   Finn holds Ann, Ben, Dan whole, and Cat at 60 (her home line).
 *   Petra holds Gus and Hal whole, and Cat at 40 (a declared project line).
 *
 * Eleven asks. Ten were handed over on 20 Oct, inside the 90-day window
 * (14 Aug → 11 Nov); `old` (5 Jan) is outside it.
 *
 *   a1 a2 a3 → Ann     b1 → Ben     c1 c2 → Cat     d1 → Dan
 *   g1 → Gus           r1 → Hal (handed back)       f1 → Finn (from Dora)
 */
function fixture({ settings = {}, mutate = null, classified = false } = {}) {
  const state = createEmptyState(ISO);
  state.people = [
    person('vp', 'Vera Vice', 'vp'),
    person('dir', 'Dora Director', 'director', 'vp'),
    person('fm', 'Finn Functional', 'manager', 'dir'),
    person('pm', 'Petra Project', 'manager', 'dir'),
    person('ann', 'Ann Able', 'ic', 'fm'),
    person('ben', 'Ben Brook', 'ic', 'fm'),
    person('cat', 'Cat Cole', 'ic', 'fm'),
    person('dan', 'Dan Dove', 'ic', 'fm'),
    person('gus', 'Gus Gray', 'ic', 'pm'),
    person('hal', 'Hal Hart', 'ic', 'pm'),
  ];
  state.reportingLines = [
    line('h-cat', 'cat', 'fm', 'functional', 60),
    line('p-cat', 'cat', 'pm', 'project', 40),
  ];
  state.delegations = [
    ask('a1', 'ann', 'Take the notes at the weekly'),
    ask('a2', 'ann', 'Onboard the new starter'),
    ask('a3', 'ann', 'Organise the offsite'),
    ask('b1', 'ben', 'Chase the action list'),
    ask('c1', 'cat', 'Sit on the safety committee'),
    ask('c2', 'cat', 'Run the retro logistics'),
    ask('d1', 'dan', 'Lead the pricing redesign'),
    ask('g1', 'gus', 'Draft the roadmap'),
    ask('r1', 'hal', 'Book the venue', '2026-10-20', 'returned'),
    ask('f1', 'fm', 'Run the floor fire drill'),
    ask('old', 'ann', 'An ask from January', '2026-01-05'),
  ];
  if (classified) {
    // Six non-promotable asks (a1 a2 a3 b1 c1 c2), one promotable (d1).
    // Cat's two are placed: c1 on her home line (Finn), c2 on the project line (Petra).
    state.workTurnActs = [
      kindAct('w1', 'a1', 'ann', 'non-promotable'), kindAct('w2', 'a2', 'ann', 'non-promotable'),
      kindAct('w3', 'a3', 'ann', 'non-promotable'), kindAct('w4', 'b1', 'ben', 'non-promotable'),
      kindAct('w5', 'c1', 'cat', 'non-promotable'), kindAct('w6', 'c2', 'cat', 'non-promotable'),
      kindAct('w7', 'd1', 'dan', 'promotable'),
    ];
    state.delegationLineActs = [
      lineAct('l1', 'c1', 'cat', 'home:cat', 'fm', 'functional'),
      lineAct('l2', 'c2', 'cat', 'p-cat', 'pm', 'project'),
    ];
  }
  if (mutate) mutate(state);
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state, { now: NOW }).state;
}

const read = (state, seatId = null) => buildWorkTurns(state, { now: NOW, settings: { ...state.settings, activeSeatId: seatId } });
const poolOf = (report, managerId) => report.pools.find((p) => p.managerId === managerId);
const memberOf = (report, managerId, personId) => poolOf(report, managerId).members.find((m) => m.personId === personId);
const personOf = (report, personId) => report.people.find((p) => p.personId === personId);
const sumOf = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const ruleAsks = (state) => state.delegations.filter((d) => String(d.support || '').includes(WORK_TURN_RULE_ID));
const draftOf = (state) => JSON.parse(JSON.stringify(state));

function boot({ settings = {}, classified = false, mutate = null } = {}) {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-t-${++seq}`;
  map.set(STORAGE_KEY, JSON.stringify(fixture({ settings, classified, mutate })));
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { map, storage, store, api };
}

function runRule(draft, type, { now = NOW } = {}) {
  let sequence = draft.__seq || 0;
  const recorded = [];
  const effects = workTurnRule(draft, {
    event: { type, entity: 'workspace', entityId: 'test' },
    now,
    idFactory: (prefix) => `${prefix}-npw-${++sequence}`,
    recordEffect: (entry) => recorded.push(entry),
  });
  Object.defineProperty(draft, '__seq', { value: sequence, enumerable: false, configurable: true, writable: true });
  return { effects, recorded };
}

/* ----------------------------------------- robust next-turn evidence bounds */

test('interval ranking agrees with exhaustive integer resolutions, including changing ties', () => {
  const triples = (values) => values.flatMap((a) => values.flatMap((b) => values.map((c) => [a, b, c])));
  for (const lower of triples([0, 1, 2])) {
    for (const unknown of triples([0, 1, 2])) {
      for (const shares of triples([40, 100])) {
        const rows = lower.map((n, i) => ({ personId: `p${i}`, lowerN: n, upperN: n + unknown[i], shareH: shares[i] }));
        const union = new Set();
        let intersection = new Set(rows.map((r) => r.personId));
        for (let a = rows[0].lowerN; a <= rows[0].upperN; a += 1) {
          for (let b = rows[1].lowerN; b <= rows[1].upperN; b += 1) {
            for (let c = rows[2].lowerN; c <= rows[2].upperN; c += 1) {
              const values = [a, b, c];
              const minima = rows.filter((r, i) => rows.every((other, j) => values[i] * other.shareH <= values[j] * r.shareH))
                .map((r) => r.personId);
              minima.forEach((id) => union.add(id));
              intersection = new Set([...intersection].filter((id) => minima.includes(id)));
            }
          }
        }
        const actual = rankWorkTurnBounds(rows);
        const ids = rows.map((r) => r.personId);
        assert.deepEqual(actual.possible, ids.filter((id) => union.has(id)), JSON.stringify(rows));
        assert.deepEqual(actual.certain, ids.filter((id) => intersection.has(id)), JSON.stringify(rows));
        assert.equal(actual.stable, union.size === intersection.size, JSON.stringify(rows));
      }
    }
  }
  assert.equal(rankWorkTurnBounds([{ personId: 'x', lowerN: 0, upperN: 1, shareH: 100 }]), null);
  assert.equal(rankWorkTurnBounds([{ personId: 'x', lowerN: 0, upperN: 1, shareH: 100 }, { personId: 'x', lowerN: 0, upperN: 1, shareH: 100 }]), null);
  assert.equal(rankWorkTurnBounds([{ personId: 'x', lowerN: 0, upperN: 1, shareH: 100 }, { personId: 'y', lowerN: 0, upperN: 1, shareH: 0 }]), null);
  assert.equal(rankWorkTurnBounds([{ personId: 'x', lowerN: 0, upperN: Number.MAX_SAFE_INTEGER, shareH: 100 }, { personId: 'y', lowerN: 0, upperN: 1, shareH: 100 }]), null);
});

test('a missing classification can change a tie; recording it restores the exact set in either structure', () => {
  const unknown = read(fixture({ classified: true }));
  const pm = poolOf(unknown, 'pm');
  assert.deepEqual([pm.turnRank.state, pm.turnRank.unresolvedN, pm.nextTurn], ['uncertain', 1, null]);
  assert.deepEqual(pm.turnRank.possiblePersonIds, ['gus', 'hal']);
  assert.deepEqual(pm.turnRank.certainPersonIds, ['hal']);
  assert.deepEqual([memberOf(unknown, 'pm', 'gus').carriedN, memberOf(unknown, 'pm', 'gus').upperN], [0, 1]);

  const resolved = read(fixture({ classified: true, mutate: (s) => {
    s.workTurnActs.push(kindAct('w8', 'g1', 'gus', 'promotable'));
  } }));
  assert.deepEqual(poolOf(resolved, 'pm').nextTurn, { personIds: ['gus', 'hal'], names: ['Gus Gray', 'Hal Hart'], tied: true });
  assert.equal(poolOf(resolved, 'pm').turnRank.state, 'stable');

  const single = read(fixture({ classified: true, mutate: (s) => { s.reportingLines = []; s.delegationLineActs = []; } }));
  assert.equal(single.structure, 'single-chain');
  assert.equal(poolOf(single, 'pm').turnRank.state, 'uncertain');
  assert.equal(single.board.turnRanksReconcile, true);
});

test('line attribution narrows bounds; an unplaced ask is possible on either line but charged to neither', () => {
  const attributed = read(fixture({ classified: true, mutate: (s) => {
    s.delegations.push(ask('c3', 'cat', 'Unclassified project work'));
    s.delegationLineActs.push(lineAct('l3', 'c3', 'cat', 'p-cat', 'pm', 'project'));
  } }));
  assert.equal(memberOf(attributed, 'fm', 'cat').unresolvedN, 0);
  assert.equal(memberOf(attributed, 'pm', 'cat').unresolvedN, 1);

  const unplaced = read(fixture({ classified: true, mutate: (s) => {
    s.delegations.push(ask('c3', 'cat', 'Unplaced non-promotable work'));
    s.workTurnActs.push(kindAct('w8', 'c3', 'cat', 'non-promotable'));
  } }));
  assert.equal(unplaced.board.classes['non-promotable'], 7, 'the person and ask are counted once');
  assert.equal(unplaced.board.placements.unplaced, 1);
  assert.equal(poolOf(unplaced, 'fm').totalN, 5);
  assert.equal(poolOf(unplaced, 'pm').totalN, 1);
  assert.equal(memberOf(unplaced, 'fm', 'cat').unresolvedN, 1);
  assert.equal(memberOf(unplaced, 'pm', 'cat').unresolvedN, 1);
  assert.equal(unplaced.board.turnRanksReconcile, true);
  const director = read(fixture({ classified: true }), 'dir');
  assert.equal(poolOf(director, 'pm').turnRank.state, 'withheld');
  assert.equal(JSON.stringify(poolOf(director, 'pm').turnRank).includes('Gus'), false);
});

test('missing shares, refused lines, duplicate asks and a zero-share pool refuse rather than guess', () => {
  const missing = read(fixture({ classified: true, mutate: (s) => { s.reportingLines.find((l) => l.id === 'p-cat').shareH = null; } }));
  assert.equal(poolOf(missing, 'fm').turnRank.state, 'missing-share');
  assert.equal(poolOf(missing, 'fm').nextTurn, null);

  const defective = draftOf(fixture({ classified: true }));
  defective.reportingLines.push(line('bad-line', 'cat', 'missing-manager', 'project', 10));
  assert.equal(poolOf(read(defective), 'fm').turnRank.state, 'matrix-defect');
  assert.equal(poolOf(read(defective), 'pm').turnRank.state, 'matrix-defect');

  const duplicate = draftOf(fixture({ classified: true }));
  duplicate.delegations.push({ ...duplicate.delegations.find((d) => d.id === 'g1'), personId: 'hal' });
  assert.equal(poolOf(read(duplicate), 'pm').turnRank.state, 'unreadable-asks');
  assert.equal(poolOf(read(duplicate), 'pm').nextTurn, null);

  const zero = read(fixture({ classified: true, mutate: (s) => {
    s.reportingLines.find((l) => l.id === 'p-cat').shareH = 0;
    s.reportingLines.push(line('h-gus', 'gus', 'pm', 'functional', 0), line('h-hal', 'hal', 'pm', 'functional', 0));
    for (let i = 2; i <= 4; i += 1) s.delegations.push(ask(`g${i}`, 'gus', 'Extra work'));
    for (let i = 1; i <= 4; i += 1) s.workTurnActs.push(kindAct(`zg${i}`, `g${i}`, 'gus', 'non-promotable'));
  } }));
  const zeroPool = poolOf(zero, 'pm');
  assert.equal(zeroPool.shareSum, 0);
  assert.equal(zeroPool.stateKey, 'share-zero');
  assert.equal(zero.board.pools['share-undeclared'], 0, 'zero is not an undeclared share');
  assert.equal(workTurnCsvRows(zero)[0].pool_share_zero, 1);
  assert.equal(workTurnCsvRows(zero)[0].pool_share_undeclared, 0);
  assert.equal(zeroPool.turnRank.state, 'too-few');
  assert.equal(zeroPool.nextTurn, null);
  assert.ok(zeroPool.members.every((m) => m.turnText === null && m.over === false));
});

/* ------------------------------------------------------------ 1. the wiring */

test('the ledger is wired end to end: schema, panel, both gateway lists, spine order, contract and CSV scope', () => {
  assert.equal(SCHEMA_VERSION, 149);
  assert.ok(COLLECTIONS.includes('workTurnActs') && COLLECTIONS.includes('workTurnMarkers'));
  const empty = createEmptyState(ISO);
  assert.deepEqual(empty.workTurnActs, []);
  assert.deepEqual(empty.workTurnMarkers, []);

  // The five conventions are declared defaults, each inside its printed bounds.
  assert.deepEqual(
    [K.windowDays, K.minAsks, K.factorPct, K.askDueDays, K.autoPropagate].map((key) => DEFAULT_SETTINGS[key]),
    [90, 4, 200, 7, true],
  );
  for (const name of ['windowDays', 'minAsks', 'factorPct', 'askDueDays']) {
    const [min, max] = WORK_TURN_BOUNDS[name];
    assert.ok(DEFAULT_SETTINGS[K[name]] >= min && DEFAULT_SETTINGS[K[name]] <= max, `${name} default is inside its bounds`);
  }

  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'turns'), 'the matrix page offers the tab');

  // Deny-by-default gateway: one safe read, three rank-gated writes.
  assert.ok(SAFE_READS.has('workTurnReport'));
  assert.equal(API_RIGHTS.workTurnClassify, WORK_TURN_RIGHTS.CLASSIFY);
  assert.equal(API_RIGHTS.workTurnScan, WORK_TURN_RIGHTS.GOVERN);
  assert.equal(API_RIGHTS.workTurnSetConventions, WORK_TURN_RIGHTS.GOVERN);
  assert.deepEqual([ACTION_RIGHTS[WORK_TURN_RIGHTS.CLASSIFY].minRank, ACTION_RIGHTS[WORK_TURN_RIGHTS.CLASSIFY].maxRank], [1, 5]);
  assert.deepEqual([ACTION_RIGHTS[WORK_TURN_RIGHTS.GOVERN].minRank, ACTION_RIGHTS[WORK_TURN_RIGHTS.GOVERN].maxRank], [3, 5]);

  // On the shared spine, BEFORE the Operating Seat's roll-up and the seal. The
  // pin is relative on purpose: the next rule registered above the seat must
  // not have to move it.
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  const at = ids.indexOf('workTurnRule');
  assert.ok(at > 0, 'RULE-NPW-01 is registered');
  assert.ok(at < ids.indexOf('seatRule'), 'the ask exists before the seat rule fans the commit up the chain');
  assert.ok(ids.indexOf('seatRule') < ids.indexOf('sealRule'), 'and the seal closes the same transaction');
  assert.equal(ids.filter((id) => id === 'workTurnRule').length, 1);

  // One contract per rule, in the same place.
  const contracts = PROPAGATION_CONTRACTS.map((c) => c.rule);
  const cAt = contracts.indexOf(workTurnRule);
  assert.ok(cAt > 0, 'RULE-NPW-01 has a propagation contract');
  assert.equal(contracts.filter((rule) => rule === workTurnRule).length, 1, 'exactly one');
  assert.equal(PROPAGATION_CONTRACTS[cAt].module, 'workTurnRules.js');
  assert.deepEqual(PROPAGATION_CONTRACTS[cAt].writes, ['delegations', 'links', 'workTurnMarkers']);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'contracts == rules');

  // CSV scope #135 remains in place; Session 248 added scope #136 after it.
  assert.equal(CSV_EXPORTS.length, 142);
  assert.equal(CSV_EXPORTS[134], WORK_TURN_CSV_DESCRIPTOR);
  assert.equal(WORK_TURN_CSV_DESCRIPTOR.key, 'work-turns');
  assert.equal(new Set(WORK_TURN_CSV_COLUMNS).size, WORK_TURN_CSV_COLUMNS.length, 'no duplicate column');

  // The rule listens to its own three events and to the acts that move a pool.
  for (const type of [...Object.values(WORK_TURN_EVENTS), 'delegation.line.attributed', 'delegation.returned', 'matrix.line.retuned', 'person.archived', 'person.updated']) {
    assert.ok(WORK_TURN_TRIGGER_EVENTS.has(type), `${type} triggers the rule`);
  }
  assert.equal(WORK_TURN_METHOD.length, 9, 'the method the screen prints is the nine-statement contract');
});

/* ------------------------------------------------- 2. nothing is guessed */

test('an ask nobody classified is charged to nobody, and the rule stays inert', () => {
  const state = fixture();
  const report = read(state);
  const b = report.board;

  // Ten asks inside the window; r1 was handed back; nine are read.
  assert.equal(b.asksInWindowN, 10);
  assert.equal(b.asksReturnedN, 1);
  assert.equal(b.asksRuleIssuedN, 0);
  assert.equal(b.asksNotReadN, 0);
  assert.equal(b.asksReadN, 9);
  assert.deepEqual(b.classes, { 'non-promotable': 0, promotable: 0, unclassified: 9 });
  assert.equal(b.carriersN, 0);
  assert.equal(b.verdicts.within, 10, 'ten people, nobody accused of anything');
  assert.equal(b.findingsN, 0);
  assert.match(report.inertNote, /Classify the asks/);
  assert.equal(report.asks.every((row) => row.classKey === 'unclassified' && row.placement === null), true);
  assert.equal(report.asks.some((row) => row.delegationId === 'old'), false, 'the January ask is outside the window');

  // No act and no ask of its own: the rule does not even read.
  const draft = draftOf(state);
  const before = JSON.stringify(draft);
  for (const type of WORK_TURN_TRIGGER_EVENTS) assert.deepEqual(runRule(draft, type).effects, []);
  assert.equal(JSON.stringify(draft), before, 'an unclassified workspace is byte-for-byte untouched');
});

/* ---------------------------------------------- 3. the arithmetic, by hand */

test('pools, share-weighted fair turns, verdicts and owners match a hand calculation', () => {
  const state = fixture({ classified: true });
  const report = read(state);
  const b = report.board;

  // Population: 10 in window = 0 not read + 1 handed back + 0 automation + 9 read.
  assert.deepEqual([b.asksInWindowN, b.asksNotReadN, b.asksReturnedN, b.asksRuleIssuedN, b.asksReadN], [10, 0, 1, 0, 9]);
  // Classes: a1 a2 a3 b1 c1 c2 | d1 | g1 f1.
  assert.deepEqual(b.classes, { 'non-promotable': 6, promotable: 1, unclassified: 2 });
  // Placement: c1 c2 are attributed; a1 a2 a3 b1 sit on a person's only line.
  assert.deepEqual(b.placements, { attributed: 2, 'sole-line': 4, unplaced: 0, stale: 0 });

  // Finn's pool: Ann 100, Ben 100, Cat 60, Dan 100 → total share 360.
  // It carries a1 a2 a3 (Ann), b1 (Ben), c1 (Cat) → 5 asks.
  const fm = poolOf(report, 'fm');
  assert.equal(fm.totalN, 5);
  assert.equal(fm.shareSum, 360);
  assert.deepEqual(fm.members.map((m) => [m.personId, m.shareH, m.carriedN]),
    [['ann', 100, 3], ['ben', 100, 1], ['cat', 60, 1], ['dan', 100, 0]]);
  // Ann's fair turn is 5 × 100 ÷ 360 = 500/360 = 1.388… → printed truncated.
  const ann = memberOf(report, 'fm', 'ann');
  assert.deepEqual([ann.turnNumer, ann.turnDenom, ann.turnText, ann.turnApprox], [500, 360, '5 × 100 ÷ 360', '1.38']);
  // Cat owes Finn's line 60% of a turn: 5 × 60 ÷ 360 = 300/360 = 0.833…
  const cat = memberOf(report, 'fm', 'cat');
  assert.deepEqual([cat.turnNumer, cat.turnDenom, cat.turnApprox], [300, 360, '0.83']);
  // Over-turn (200%): Ann 3 × 360 × 100 = 108000 ≥ 200 × 5 × 100 = 100000 → over.
  assert.equal(3 * 360 * 100 >= 200 * 5 * 100, true);
  assert.equal(ann.over, true);
  // Ben and Cat carry one ask each: one ask can never be a pattern.
  assert.equal(memberOf(report, 'fm', 'ben').over, false);
  assert.equal(cat.over, false);
  assert.equal(fm.stateKey, 'concentrated');
  // Next turn: the lowest carried-to-share ratio is Dan's (0 ÷ 100).
  assert.deepEqual(fm.nextTurn, { personIds: ['dan'], names: ['Dan Dove'], tied: false });

  // Petra's pool: Cat 40, Gus 100, Hal 100; it carries only c2 → below the floor of 4.
  const pm = poolOf(report, 'pm');
  assert.deepEqual([pm.totalN, pm.shareSum, pm.stateKey], [1, 240, 'below-floor']);
  assert.equal(pm.members.some((m) => m.over), false, 'a pool below the floor accuses nobody');
  // Gus has an unclassified ask: it could break the apparent tie with Hal.
  // Hal is always among the minima, but Gus is not, so no fixed tie is claimed.
  assert.equal(pm.nextTurn, null);
  assert.equal(pm.turnRank.state, 'uncertain');
  assert.deepEqual(pm.turnRank.possiblePersonIds, ['gus', 'hal']);
  assert.deepEqual(pm.turnRank.certainPersonIds, ['hal']);

  // Five pools: Dora's, Finn's, the workspace leader's, Petra's and Vera's.
  assert.equal(b.poolsReadN, 5);
  assert.deepEqual(b.pools, { partial: 0, 'below-floor': 4, 'share-undeclared': 0, 'share-zero': 0, concentrated: 1, even: 0 });

  // People: Ann is over a fair turn in Finn's pool.
  assert.equal(personOf(report, 'ann').verdict, 'over-turn');
  assert.equal(personOf(report, 'ben').verdict, 'within');
  // Cat: one ask on each line — neither manager is over a fair turn with her.
  // In sum she carries 2 of the 6 asks read across 10 people:
  // 2 × 10 × 100 = 2000 ≥ 200 × 6 = 1200 → stacked.
  assert.equal(2 * 10 * 100 >= 200 * 6, true);
  const catRow = personOf(report, 'cat');
  assert.equal(catRow.verdict, 'stacked');
  assert.deepEqual(catRow.lines.map((l) => [l.managerId, l.shareH, l.carriedN, l.over]), [['fm', 60, 1, false], ['pm', 40, 1, false]]);
  assert.deepEqual(b.verdicts, { unplaced: 0, 'over-turn': 1, unread: 0, stacked: 1, within: 8 });
  assert.equal(b.peopleReadN, 10);
  assert.equal(b.carriersN, 3);

  // Findings: the pool belongs to Finn; the stack belongs to the one seat above
  // both of Cat's managers — Dora.
  assert.deepEqual(report.findings.map((f) => [f.kind, f.subject, f.ownerState, f.ownerId, f.carriedN, f.totalN]), [
    ['pool', 'pool|fm', 'unique', 'fm', 3, 5],
    ['stack', 'stack|cat', 'unique', 'dir', 2, 6],
  ]);
  assert.equal(report.findings[0].signature, workTurnSignature(['a1', 'a2', 'a3']));
  assert.equal(report.findings[1].signature, workTurnSignature(['c1', 'c2']));
  assert.deepEqual(b.owners, { unique: 2, 'leader-held': 0, ambiguous: 0, 'off-roster': 0 });

  // Every printed partition adds up to its population.
  assert.equal(sumOf(b.classes), b.asksReadN);
  assert.equal(sumOf(b.placements), b.classes['non-promotable']);
  assert.equal(sumOf(b.verdicts), b.peopleReadN);
  assert.equal(sumOf(b.pools), b.poolsReadN);
  assert.equal(sumOf(b.owners), b.findingsN);
  for (const flag of ['populationReconciles', 'classesReconcile', 'placementsReconcile', 'verdictsReconcile', 'poolsReconcile', 'ownersReconcile']) {
    assert.equal(b[flag], true, flag);
  }
  assert.equal(report.structure, 'matrix');
  assert.equal(report.detail.level, 'visible');

  // The pure helpers agree with the same hand sums.
  assert.equal(workTurnIsOver({ carried: 3, total: 5, shareH: 100, shareSum: 360, factorPct: 200 }), true);
  assert.equal(workTurnIsOver({ carried: 1, total: 1, shareH: 100, shareSum: 100, factorPct: 200 }), false, 'one ask is never over');
  // Exactly at the threshold counts (≥): 2 of 4 across two equal shares = 2 × 200 × 100 = 200 × 4 × 100.
  assert.equal(workTurnIsOver({ carried: 2, total: 4, shareH: 100, shareSum: 400, factorPct: 200 }), true);
  assert.equal(workTurnIsOver({ carried: 2, total: 4, shareH: 100, shareSum: 399, factorPct: 200 }), false);
  assert.equal(workTurnApprox(500, 360), '1.38');
  assert.equal(workTurnApprox(2, 3), '0.66', 'truncated, never rounded up');
  assert.equal(workTurnApprox(1, 0), null);
});

test('a fair turn is weighted by the share of the person the line holds — a 40% line is owed 40% of a turn', () => {
  // Petra's pool is Cat at 40, Gus at 100, Hal at 100 → total share 240.
  const heavy = read(fixture({
    mutate: (s) => {
      s.delegations.push(ask('c3', 'cat', 'Keep the project risk log'), ask('h1', 'hal', 'Order the team lunch'));
      s.workTurnActs = [
        kindAct('w1', 'c2', 'cat', 'non-promotable'), kindAct('w2', 'c3', 'cat', 'non-promotable'),
        kindAct('w3', 'g1', 'gus', 'non-promotable'), kindAct('w4', 'h1', 'hal', 'non-promotable'),
      ];
      s.delegationLineActs = [lineAct('l1', 'c2', 'cat', 'p-cat', 'pm', 'project'), lineAct('l2', 'c3', 'cat', 'p-cat', 'pm', 'project')];
    },
  }));
  const pm = poolOf(heavy, 'pm');
  // Four asks: Cat 2, Gus 1, Hal 1.
  assert.deepEqual([pm.totalN, pm.shareSum], [4, 240]);
  // Cat's fair turn on a 40% line is 4 × 40 ÷ 240 = 0.66…; she carries 2.
  // 2 × 240 × 100 = 48000 ≥ 200 × 4 × 40 = 32000 → over a fair turn.
  assert.equal(2 * 240 * 100 >= 200 * 4 * 40, true);
  const cat = memberOf(heavy, 'pm', 'cat');
  assert.deepEqual([cat.turnText, cat.turnApprox, cat.over], ['4 × 40 ÷ 240', '0.66', true]);
  // Counted by heads — three people, a third each — she would NOT be:
  // 2 × 300 × 100 = 60000 < 200 × 4 × 100 = 80000. The declared share decides it.
  assert.equal(2 * 300 * 100 >= 200 * 4 * 100, false);
  assert.equal(pm.stateKey, 'concentrated');
  assert.equal(personOf(heavy, 'cat').verdict, 'over-turn');
  assert.deepEqual(heavy.findings.map((f) => [f.subject, f.ownerId, f.carriedN, f.totalN]), [['pool|pm', 'pm', 2, 4]]);

  // The next turn is weighted the same way. Cat 1, Gus 2, Hal 2:
  // Cat 1 ÷ 40 = 0.025 is ABOVE Gus and Hal at 2 ÷ 100 = 0.02 — by heads she would be next; by share she is not.
  const light = read(fixture({
    mutate: (s) => {
      s.delegations.push(ask('g2', 'gus', 'Tidy the wiki'), ask('h1', 'hal', 'Order the team lunch'), ask('h2', 'hal', 'Host the visitors'));
      s.workTurnActs = [
        kindAct('w1', 'c2', 'cat', 'non-promotable'), kindAct('w2', 'g1', 'gus', 'non-promotable'), kindAct('w3', 'g2', 'gus', 'non-promotable'),
        kindAct('w4', 'h1', 'hal', 'non-promotable'), kindAct('w5', 'h2', 'hal', 'non-promotable'),
      ];
      s.delegationLineActs = [lineAct('l1', 'c2', 'cat', 'p-cat', 'pm', 'project')];
    },
  }));
  const lightPool = poolOf(light, 'pm');
  assert.deepEqual(lightPool.members.map((m) => [m.personId, m.shareH, m.carriedN]), [['cat', 40, 1], ['gus', 100, 2], ['hal', 100, 2]]);
  assert.equal(1 * 100 > 2 * 40, true, 'cross-multiplied: 1/40 > 2/100');
  assert.deepEqual(lightPool.nextTurn, { personIds: ['gus', 'hal'], names: ['Gus Gray', 'Hal Hart'], tied: true });
  // Gus: 2 × 240 × 100 = 48000 < 200 × 5 × 100 = 100000 → nobody is over.
  assert.equal(lightPool.stateKey, 'even');
  assert.equal(light.board.findingsN, 0);
});

/* --------------------------------------------------- 4. the refusals */

test('a non-promotable ask on a two-line person with no recorded line is charged to NO pool', () => {
  const state = fixture({ classified: true, mutate: (s) => { s.delegationLineActs = []; } });
  const report = read(state);
  assert.deepEqual(report.board.placements, { attributed: 0, 'sole-line': 4, unplaced: 2, stale: 0 });
  // Finn's pool now carries 4 (a1 a2 a3 b1) — Cat's two were not guessed onto it.
  assert.equal(poolOf(report, 'fm').totalN, 4);
  assert.equal(poolOf(report, 'pm').totalN, 0);
  assert.equal(memberOf(report, 'fm', 'cat').carriedN, 0);
  const cat = personOf(report, 'cat');
  assert.deepEqual([cat.verdict, cat.nptN, cat.unreadableN], ['unplaced', 2, 2]);
  assert.equal(report.board.verdicts.stacked, 0, 'no stacked claim from asks on no line');
  assert.equal(report.board.placementsReconcile, true);
});

test('an attribution to a line the person no longer holds reads stale and is never re-pointed', () => {
  const state = fixture({
    classified: true,
    mutate: (s) => { s.reportingLines = [line('h-cat', 'cat', 'fm', 'functional', 60), line('p-cat', 'cat', 'pm', 'project', 40, '2026-11-01')]; },
  });
  const report = read(state);
  assert.deepEqual(report.board.placements, { attributed: 1, 'sole-line': 4, unplaced: 0, stale: 1 });
  assert.equal(report.asks.find((row) => row.delegationId === 'c2').placement, 'stale');
  assert.equal(report.asks.find((row) => row.delegationId === 'c2').managerId, null, 'not moved onto her remaining line');
  assert.equal(personOf(report, 'cat').verdict, 'unplaced');
  assert.equal(report.structure, 'single-chain', 'nobody holds two lines any more');
});

test('a missing share refuses every fair turn in the pool; people with two or more asks read `unread`, never `within`', () => {
  const state = fixture({
    classified: true,
    mutate: (s) => { s.reportingLines = [line('h-cat', 'cat', 'fm', 'functional', 60), line('p-cat', 'cat', 'pm', 'project', null)]; },
  });
  const report = read(state);
  const fm = poolOf(report, 'fm');
  assert.equal(fm.stateKey, 'share-undeclared');
  assert.equal(fm.shareSum, null);
  assert.equal(fm.members.every((m) => m.turnText === null && m.turnApprox === null && m.over === false), true, 'no turn was split evenly');
  assert.equal(fm.nextTurn, null, 'no next turn is named over an unknown share');
  // Petra's pool is below the floor first (precedence), so it claims nothing either way.
  assert.equal(poolOf(report, 'pm').stateKey, 'below-floor');
  // Ann (3 asks) and Cat (2 asks) sit in a pool that could not be read.
  assert.equal(personOf(report, 'ann').verdict, 'unread');
  assert.equal(personOf(report, 'cat').verdict, 'unread');
  // Ben carries one ask: no test can be met by one ask, so `within` is exact.
  assert.equal(personOf(report, 'ben').verdict, 'within');
  assert.deepEqual(report.board.verdicts, { unplaced: 0, 'over-turn': 0, unread: 2, stacked: 0, within: 8 });
  assert.equal(report.board.findingsN, 0);
  assert.equal(report.board.verdictsReconcile, true);
});

test('below the declared floor no pattern is claimed — for a pool, or for the stack', () => {
  // Floor 6: Finn's pool carries 5 → no claim. Six asks were read → the stack is still tested.
  const six = read(fixture({ classified: true, settings: { [K.minAsks]: 6 } }));
  assert.equal(poolOf(six, 'fm').stateKey, 'below-floor');
  assert.equal(memberOf(six, 'fm', 'ann').over, false);
  assert.equal(personOf(six, 'ann').verdict, 'within');
  assert.equal(personOf(six, 'cat').verdict, 'stacked');
  assert.deepEqual(six.findings.map((f) => f.kind), ['stack']);
  // The fair turn is still printed below the floor — only the claim is withheld.
  assert.equal(memberOf(six, 'fm', 'ann').turnText, '5 × 100 ÷ 360');

  // Floor 7: only six non-promotable asks were read → nothing is claimed at all.
  const seven = read(fixture({ classified: true, settings: { [K.minAsks]: 7 } }));
  assert.equal(personOf(seven, 'cat').verdict, 'within');
  assert.equal(seven.board.findingsN, 0);
  assert.deepEqual(seven.board.verdicts, { unplaced: 0, 'over-turn': 0, unread: 0, stacked: 0, within: 10 });
});

test('the threshold is the declared convention, not a constant', () => {
  // At 300%: Ann 3 × 360 × 100 = 108000 < 300 × 5 × 100 = 150000 → not over.
  const report = read(fixture({ classified: true, settings: { [K.factorPct]: 300 } }));
  assert.equal(memberOf(report, 'fm', 'ann').over, false);
  assert.equal(poolOf(report, 'fm').stateKey, 'even');
  // Cat: 2 × 10 × 100 = 2000 ≥ 300 × 6 = 1800 → still stacked.
  assert.equal(personOf(report, 'cat').verdict, 'stacked');
  assert.equal(personOf(report, 'ann').verdict, 'within');
});

test('asks handed back, issued by automation or outside the window are counted apart and carried by nobody', () => {
  const state = fixture({
    classified: true,
    mutate: (s) => {
      // An ask a rule stamped (support note) and one a rule linked.
      s.delegations.push({ ...ask('x1', 'ann', 'Record the next dated commitment'), support: 'Certified by RULE-SUC-01 on 2026-11-11.' });
      s.delegations.push(ask('x2', 'ann', 'Reconcile the overload'));
      s.links = [{
        id: 'lnk-x2', sourceType: 'person', sourceId: 'cat', targetType: 'delegation', targetId: 'x2',
        relation: 'issues-obligation', ruleId: 'RULE-DLA-01', summary: 'Issued by a rule.', createdAt: ISO,
      }];
    },
  });
  assert.deepEqual([...workTurnRuleIssuedIds(state)].sort(), ['x1', 'x2']);
  const report = read(state);
  const b = report.board;
  assert.deepEqual([b.asksInWindowN, b.asksReturnedN, b.asksRuleIssuedN, b.asksReadN], [12, 1, 2, 9]);
  assert.equal(b.populationReconciles, true);
  assert.equal(report.asks.some((row) => ['x1', 'x2', 'r1', 'old'].includes(row.delegationId)), false);
  assert.equal(personOf(report, 'ann').nptN, 3, 'automation did not add to what Ann carries');
});

/* ------------------------------------------------ 5. what each seat reads */

test('Finn reads his own pool; the stack across a line he cannot read is `unread`, not claimed and not cleared', () => {
  const report = read(fixture({ classified: true }), 'fm');
  const b = report.board;
  // Finn sees himself, Ann, Ben, Cat and Dan. Gus's g1 and Hal's r1 are outside.
  assert.equal(b.peopleReadN, 5);
  assert.deepEqual([b.asksInWindowN, b.asksNotReadN, b.asksReturnedN, b.asksReadN], [10, 2, 0, 8]);
  assert.deepEqual(report.pools.map((p) => p.managerId), ['fm'], 'only the pool he manages');
  assert.equal(poolOf(report, 'fm').stateKey, 'concentrated');
  assert.equal(personOf(report, 'ann').verdict, 'over-turn');
  // Cat's other pool is Petra's. Finn cannot read it, so he is told so.
  const cat = personOf(report, 'cat');
  assert.equal(cat.verdict, 'unread');
  assert.deepEqual(cat.lines.map((l) => l.poolState), ['concentrated', null]);
  assert.deepEqual(b.verdicts, { unplaced: 0, 'over-turn': 1, unread: 1, stacked: 0, within: 3 });
  assert.deepEqual(report.findings.map((f) => f.subject), ['pool|fm']);
  assert.equal(report.detail.level, 'visible');
  // He may classify what he hands out; never the ask he himself carries.
  assert.equal(report.asks.find((row) => row.delegationId === 'a1').canClassify, true);
  assert.equal(report.asks.find((row) => row.delegationId === 'f1').canClassify, false);
  assert.equal(report.actor.canGovern, false, 'a manager does not set the conventions');
  assert.equal(b.populationReconciles && b.verdictsReconcile && b.poolsReconcile, true);
});

test('Petra reads Cat through her declared line and nothing else of Finn’s team', () => {
  const report = read(fixture({ classified: true }), 'pm');
  const b = report.board;
  // Petra sees herself, Gus, Hal and (through the project line) Cat.
  assert.equal(b.peopleReadN, 4);
  // Not read: a1 a2 a3 b1 d1 f1. Handed back: r1. Read: g1 c1 c2.
  assert.deepEqual([b.asksInWindowN, b.asksNotReadN, b.asksReturnedN, b.asksReadN], [10, 6, 1, 3]);
  assert.deepEqual(b.classes, { 'non-promotable': 2, promotable: 0, unclassified: 1 });
  assert.deepEqual(report.pools.map((p) => [p.managerId, p.stateKey, p.totalN]), [['pm', 'below-floor', 1]]);
  assert.equal(personOf(report, 'cat').verdict, 'unread', 'Finn’s pool is outside her seat');
  assert.equal(report.asks.some((row) => row.personId === 'ann'), false, 'no row of Ann’s crosses the boundary');
  assert.equal(JSON.stringify(report.pools).includes('Ann Able'), false);
  assert.equal(report.asks.find((row) => row.delegationId === 'c1').canClassify, true, 'a declared line reaches the person');
});

test('Dora reads leaders by name and people as counts; Vera reads counts only — and both read the whole finding count', () => {
  const state = fixture({ classified: true });

  const dora = read(state, 'dir');
  assert.equal(dora.detail.level, 'leaders');
  assert.equal(dora.detail.withheld, true);
  // Dora reads herself and the eight people below her; Vera is above.
  assert.equal(dora.board.peopleReadN, 9);
  assert.deepEqual(dora.pools.map((p) => p.managerId), ['dir', 'fm', 'pm']);
  // Her own pool is two managers — leaders — so its members are listed.
  assert.deepEqual(poolOf(dora, 'dir').members.map((m) => m.personId), ['fm', 'pm']);
  // Finn's and Petra's pools are individual contributors: counted, not listed.
  assert.deepEqual(poolOf(dora, 'fm').members, []);
  assert.equal(poolOf(dora, 'fm').totalN, 5, 'the count is still the whole count');
  assert.equal(poolOf(dora, 'fm').nextTurn, null);
  // She sees every pool Cat sits in, so the matrix-only finding IS claimed here.
  assert.equal(dora.board.verdicts.stacked, 1);
  assert.equal(dora.board.findingsN, 2);
  assert.deepEqual(dora.findings.map((f) => [f.kind, f.peopleN, f.personNames.length, f.ownerName]),
    [['pool', 1, 0, 'Finn Functional'], ['stack', 1, 0, 'Dora Director']]);
  assert.deepEqual(dora.people, [], 'no individual contributor is listed');
  // The one ask she can list — and classify — is the one she handed a manager.
  assert.deepEqual(dora.asks.map((row) => [row.delegationId, row.canClassify]), [['f1', true]]);
  assert.equal(dora.asksUnlistedN, 8, 'the other eight read asks are counted, not listed');
  assert.equal(JSON.stringify([dora.pools, dora.people, dora.asks, dora.findings]).includes('Ann Able'), false);
  assert.equal(dora.actor.canGovern, true);

  const vera = read(state, 'vp');
  assert.equal(vera.detail.level, 'none');
  assert.deepEqual([vera.pools, vera.people, vera.asks, vera.findings], [[], [], [], []]);
  assert.equal(vera.board.peopleReadN, 10);
  assert.equal(vera.board.findingsN, 2, 'counts are computed over the whole span');
  assert.deepEqual(vera.board.verdicts, { unplaced: 0, 'over-turn': 1, unread: 0, stacked: 1, within: 8 });
  assert.equal(vera.board.poolsReadN, 4, 'her own pool, Dora’s, Finn’s and Petra’s — not the workspace leader’s');
});

test('a single-chain workspace reads pools but can never read `stacked` or `unplaced`', () => {
  const state = fixture({ classified: true, mutate: (s) => { s.reportingLines = []; s.delegationLineActs = []; } });
  const report = read(state);
  assert.equal(report.structure, 'single-chain');
  assert.equal(report.sharedPeopleN, 0);
  assert.deepEqual(report.board.placements, { attributed: 0, 'sole-line': 6, unplaced: 0, stale: 0 });
  // Finn's pool is four whole people carrying a1 a2 a3 b1 c1 c2: Ann 3 × 400 × 100 = 120000 < 200 × 6 × 100.
  assert.equal(poolOf(report, 'fm').totalN, 6);
  assert.equal(poolOf(report, 'fm').shareSum, 400);
  assert.equal(3 * 400 * 100 >= 200 * 6 * 100, true, 'exactly at the threshold counts');
  assert.equal(personOf(report, 'ann').verdict, 'over-turn');
  assert.equal(personOf(report, 'cat').verdict, 'within', 'one line, two asks of six: 2 × 400 × 100 < 200 × 6 × 100');
  assert.equal(report.board.verdicts.stacked + report.board.verdicts.unplaced + report.board.verdicts.unread, 0);
});

test('a pool partly outside the reading seat makes no claim: no turn over part of a pool', () => {
  // Zed belongs to another director's organisation and gives Petra's project half his time.
  // Petra's pool: Cat 40, Gus 100, Hal 100, Zed 50 → 290. Four asks: Cat 2, Gus 1, Hal 1.
  const state = fixture({
    mutate: (s) => {
      s.people.push(person('dir2', 'Della Director', 'director', 'vp'), person('zed', 'Zed Zane', 'ic', 'dir2'));
      s.reportingLines.push(line('h-zed', 'zed', 'dir2', 'functional', 50), line('p-zed', 'zed', 'pm', 'project', 50));
      s.delegations.push(ask('c3', 'cat', 'Keep the project risk log'), ask('h1', 'hal', 'Order the team lunch'));
      s.workTurnActs = [
        kindAct('w1', 'c2', 'cat', 'non-promotable'), kindAct('w2', 'c3', 'cat', 'non-promotable'),
        kindAct('w3', 'g1', 'gus', 'non-promotable'), kindAct('w4', 'h1', 'hal', 'non-promotable'),
      ];
      s.delegationLineActs = [lineAct('l1', 'c2', 'cat', 'p-cat', 'pm', 'project'), lineAct('l2', 'c3', 'cat', 'p-cat', 'pm', 'project')];
    },
  });

  // The operator reads the whole pool: Cat 2 × 290 × 100 = 58000 ≥ 200 × 4 × 40 = 32000 → over.
  const whole = read(state);
  assert.deepEqual([poolOf(whole, 'pm').memberN, poolOf(whole, 'pm').hiddenN, poolOf(whole, 'pm').shareSum, poolOf(whole, 'pm').stateKey], [4, 0, 290, 'concentrated']);
  assert.deepEqual(whole.findings.map((f) => f.subject), ['pool|pm']);

  // Petra reads her own pool whole too — Zed reaches her seat through his declared line.
  const petra = read(state, 'pm');
  assert.deepEqual([poolOf(petra, 'pm').hiddenN, poolOf(petra, 'pm').stateKey], [0, 'concentrated']);
  assert.equal(memberOf(petra, 'pm', 'cat').turnText, '4 × 40 ÷ 290');

  // Dora's span holds Petra but not Zed. One person of the pool is outside her
  // seat, so the pool's share total is not hers to read: no turn, no claim.
  const dora = read(state, 'dir');
  const pool = poolOf(dora, 'pm');
  assert.deepEqual([pool.memberN, pool.hiddenN, pool.stateKey], [4, 1, 'partial']);
  assert.equal(pool.nextTurn, null);
  assert.equal(dora.board.pools.partial, 1);
  assert.equal(dora.board.pools.concentrated, 0);
  assert.equal(dora.board.findingsN, 0, 'no finding is raised from part of a pool');
  // Cat carries two asks in a pool that was not read whole: `unread`, not `within` and not `over-turn`.
  assert.deepEqual(dora.board.verdicts, { unplaced: 0, 'over-turn': 0, unread: 1, stacked: 0, within: 8 });
  assert.equal(dora.board.poolsReconcile && dora.board.verdictsReconcile, true);
  assert.equal(JSON.stringify(dora).includes('Zed Zane'), false, 'the person outside the seat is counted, never named');
});

/* ------------------------------------------------------- 6. the rule */

test('the real spine corrects legacy guidance without losing human text, rolls up and survives reload', () => {
  const seed = draftOf(fixture({ classified: true, settings: { activeSeatId: 'dir', sealEnabled: true } }));
  runRule(seed, WORK_TURN_EVENTS.CLASSIFIED);
  const legacy = ruleAsks(seed).find((d) => d.personId === 'fm');
  assert.ok(legacy);
  const oldText = `Human preface. ${WORK_TURN_OLD_GUIDANCE} Human note: ${'x'.repeat(3900)}`;
  assert.ok(oldText.length <= 4000);
  legacy.expectedOutcome = oldText;
  const values = new Map([[STORAGE_KEY, JSON.stringify(seed)]]);
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) };
  let n = 0;
  const idFactory = (prefix) => `${prefix}-repair-${++n}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  const result = api.workTurnScan();
  assert.equal(result.ok, true, result?.error);
  assert.ok(result.propagations.some((e) => e.ruleId === WORK_TURN_RULE_ID && e.action === 'updated'));
  const expected = oldText.replace(WORK_TURN_OLD_GUIDANCE, WORK_TURN_GUIDANCE);
  assert.ok(WORK_TURN_GUIDANCE.length <= WORK_TURN_OLD_GUIDANCE.length);
  assert.equal(store.state.delegations.find((d) => d.id === legacy.id).expectedOutcome, expected);
  assert.deepEqual(store.state.links.filter((l) => l.ruleId === WORK_TURN_RULE_ID && l.sourceId === legacy.id && l.relation === 'rolls-up-to')
    .map((l) => l.targetId).sort(), ['dir', 'vp']);
  assert.ok(result.propagations.some((e) => e.ruleId === 'RULE-SEAL-01'));
  const reboot = createStore({ storage, now: () => NOW, idFactory });
  reboot.load();
  assert.equal(reboot.state.delegations.find((d) => d.id === legacy.id).expectedOutcome, expected);
  const again = api.workTurnScan();
  assert.equal(again.ok, true);
  assert.equal(again.propagations.some((e) => e.ruleId === WORK_TURN_RULE_ID && e.action === 'updated'), false);
});

test('RULE-NPW-01 asks the one owning seat once, survives a round trip, and closes its own ask', () => {
  const draft = draftOf(fixture({ classified: true }));
  const first = runRule(draft, WORK_TURN_EVENTS.CLASSIFIED);
  assert.deepEqual(first.effects.map((e) => e.action), ['delegated']);
  assert.equal(first.recorded.length, 1, 'the effect is recorded on the spine’s ledger');

  const asks = ruleAsks(draft);
  assert.equal(asks.length, 2);
  const toFinn = asks.find((d) => d.personId === 'fm');
  const toDora = asks.find((d) => d.personId === 'dir');
  assert.ok(toFinn && toDora, 'one ask to the pool’s manager, one to the seat above both of Cat’s lines');
  assert.equal(toFinn.dueOn, '2026-11-18', 'today + the declared 7 days');
  assert.equal(toFinn.status, 'active');
  assert.match(toFinn.title, /3 of 5 went to Ann Able/);
  assert.match(toDora.title, /Cat Cole’s 2 non-promotable asks across reporting lines/);
  assert.match(toDora.expectedOutcome, /2 of the 6 non-promotable asks/);
  assert.match(toFinn.expectedOutcome, /No ask was reassigned automatically/);

  // Typed provenance: the person the finding is about issues the obligation;
  // the ask rolls up to every roster seat above its owner.
  const links = draft.links.filter((l) => l.ruleId === WORK_TURN_RULE_ID);
  assert.deepEqual([...new Set(links.map((l) => l.relation))].sort(), [...WORK_TURN_RULE_RELATIONS].sort(), 'the rule writes exactly its declared relations');
  assert.deepEqual(links.filter((l) => l.relation === 'issues-obligation').map((l) => [l.sourceId, l.targetId]).sort(),
    [['ann', toFinn.id], ['cat', toDora.id]].sort());
  assert.deepEqual(links.filter((l) => l.relation === 'rolls-up-to' && l.sourceId === toFinn.id).map((l) => l.targetId).sort(), ['dir', 'vp']);
  assert.deepEqual(links.filter((l) => l.relation === 'rolls-up-to' && l.sourceId === toDora.id).map((l) => l.targetId), ['vp']);
  assert.deepEqual(draft.workTurnMarkers.map((m) => [m.kind, m.subject, m.taskId]).sort(),
    [['ask', 'pool|fm', toFinn.id], ['ask', 'stack|cat', toDora.id]].sort());

  // Its own two asks are automation: they do not move the reading they came from.
  const after = read(draft);
  assert.equal(after.board.asksRuleIssuedN, 2);
  assert.equal(after.board.asksReadN, 9);
  assert.equal(after.board.openRotationAsksN, 2);

  // Idempotent — also across a normalisation round trip (a reload).
  assert.deepEqual(runRule(draft, WORK_TURN_EVENTS.SCAN).effects, []);
  const reloaded = draftOf(normalizeState(draftOf(draft), { now: NOW }).state);
  assert.deepEqual(runRule(reloaded, WORK_TURN_EVENTS.SCAN).effects, []);
  assert.equal(ruleAsks(reloaded).length, 2);

  // A human closes Finn's ask. The pattern has not changed, so he is NOT asked again.
  toFinn.status = 'done';
  assert.deepEqual(runRule(draft, WORK_TURN_EVENTS.SCAN).effects, []);
  assert.equal(ruleAsks(draft).length, 2);

  // The pattern CONTINUES: Ann is handed a fourth non-promotable ask. New signature → one new ask.
  draft.delegations.push(ask('a4', 'ann', 'Minute the steering group', '2026-11-10'));
  draft.workTurnActs.push(kindAct('w8', 'a4', 'ann', 'non-promotable'));
  const again = runRule(draft, WORK_TURN_EVENTS.CLASSIFIED);
  assert.deepEqual(again.effects.map((e) => e.action), ['delegated']);
  const finnAsks = ruleAsks(draft).filter((d) => d.personId === 'fm');
  assert.equal(finnAsks.length, 2);
  assert.match(finnAsks.find((d) => d.status === 'active').title, /4 of 6 went to Ann Able/);

  // The manager rotates: three of Ann's asks are re-declared promotable by a later act.
  draft.workTurnActs.push(kindAct('w9', 'a1', 'ann', 'promotable', '2026-11-11T13:00:00.000Z'));
  draft.workTurnActs.push(kindAct('w10', 'a2', 'ann', 'promotable', '2026-11-11T13:00:00.000Z'));
  draft.workTurnActs.push(kindAct('w11', 'a3', 'ann', 'promotable', '2026-11-11T13:00:00.000Z'));
  const cleared = runRule(draft, WORK_TURN_EVENTS.CLASSIFIED);
  assert.deepEqual(cleared.effects.map((e) => e.action), ['completed']);
  const closed = ruleAsks(draft).filter((d) => d.personId === 'fm' && d.completedOn === '2026-11-11');
  assert.equal(closed.length, 1);
  assert.equal(closed[0].status, 'done');
  assert.ok(closed[0].completionNote.startsWith(WORK_TURN_CLOSED_PREFIX));
  // Finn's pool now carries a4 b1 c1 = 3, below the floor. Four non-promotable
  // asks are still read (a4 b1 c1 c2) and Cat still carries two of them on two
  // lines: 2 × 10 × 100 = 2000 ≥ 200 × 4 = 800. Dora's ask stands, untouched.
  assert.equal(toDora.status, 'active', 'a finding that has not cleared is not closed');
  assert.equal(ruleAsks(draft).filter((d) => d.status === 'active').length, 1);

  // Petra re-declares c2: Cat carries one ask. The stack clears and the rule closes Dora's ask.
  draft.workTurnActs.push(kindAct('w12', 'c2', 'cat', 'promotable', '2026-11-11T14:00:00.000Z'));
  assert.deepEqual(runRule(draft, WORK_TURN_EVENTS.CLASSIFIED).effects.map((e) => e.action), ['completed']);
  assert.equal(toDora.status, 'done');
  assert.ok(toDora.completionNote.startsWith(WORK_TURN_CLOSED_PREFIX));
  assert.equal(ruleAsks(draft).some((d) => d.status === 'active'), false);
  assert.equal(draft.workTurnActs.length, 12, 'every act is still in history; nothing was overwritten');
});

test('the automation pause holds the rule; an explicit scan still runs', () => {
  const draft = draftOf(fixture({ classified: true, settings: { [K.autoPropagate]: false } }));
  assert.deepEqual(runRule(draft, WORK_TURN_EVENTS.CLASSIFIED).effects, []);
  assert.equal(ruleAsks(draft).length, 0);
  assert.deepEqual(runRule(draft, 'case.created').effects, [], 'an event the rule does not list is ignored');
  assert.deepEqual(runRule(draft, 'person.updated').effects, [], 'a listed event is held by the pause too');
  assert.deepEqual(runRule(draft, WORK_TURN_EVENTS.SCAN).effects.map((e) => e.action), ['delegated']);
  assert.equal(ruleAsks(draft).length, 2);
});

test('with no single owning seat the rule records an observation and substitutes nobody', () => {
  // Finn and Petra report to nobody on the roster: the only seat above both is
  // the workspace leader, who is not a person an ask can be handed to.
  const state = fixture({
    classified: true,
    mutate: (s) => {
      s.people = s.people.filter((p) => !['vp', 'dir'].includes(p.id)).map((p) => (['fm', 'pm'].includes(p.id) ? { ...p, managerId: null } : p));
    },
  });
  const report = read(state);
  const stack = report.findings.find((f) => f.kind === 'stack');
  assert.deepEqual([stack.ownerState, stack.ownerId, stack.ownerName], ['leader-held', null, null]);
  assert.deepEqual(report.board.owners, { unique: 1, 'leader-held': 1, ambiguous: 0, 'off-roster': 0 });

  const draft = draftOf(state);
  const run = runRule(draft, WORK_TURN_EVENTS.CLASSIFIED);
  assert.deepEqual(run.effects.map((e) => e.action).sort(), ['delegated', 'observed']);
  assert.deepEqual(ruleAsks(draft).map((d) => d.personId), ['fm'], 'only the pool finding has an owner; nobody stands in for the other');
  const observation = draft.workTurnMarkers.find((m) => m.kind === 'observation');
  assert.deepEqual([observation.subject, observation.state, observation.taskId], ['stack|cat', 'leader-held', null]);
  assert.deepEqual(runRule(draft, WORK_TURN_EVENTS.SCAN).effects, [], 'observed once, not on every commit');
});

test('at most eight asks per commit; the remainder is counted, not dropped', () => {
  // Ten two-person pools, each with one person carrying all four of its asks.
  const state = fixture({
    mutate: (s) => {
      s.people = [person('top', 'Tara Top', 'director')];
      s.reportingLines = [];
      s.delegations = [];
      s.workTurnActs = [];
      for (let i = 0; i < 10; i += 1) {
        const m = `m${i}`;
        s.people.push(person(m, `Manager ${i}`, 'manager', 'top'), person(`${m}a`, `Carrier ${i}`, 'ic', m), person(`${m}b`, `Other ${i}`, 'ic', m));
        for (let j = 0; j < 4; j += 1) {
          s.delegations.push(ask(`${m}-q${j}`, `${m}a`, `Housekeeping ${i}.${j}`));
          s.workTurnActs.push(kindAct(`${m}-w${j}`, `${m}-q${j}`, `${m}a`, 'non-promotable'));
        }
      }
    },
  });
  // Each pool: 4 asks, shares 100 + 100; the carrier has 4 × 200 × 100 = 80000 ≥ 200 × 4 × 100 = 80000.
  const report = read(state);
  assert.equal(report.board.pools.concentrated, 10);
  const draft = draftOf(state);
  const first = runRule(draft, WORK_TURN_EVENTS.SCAN);
  assert.deepEqual(first.effects.map((e) => e.action), ['delegated', 'deferred']);
  assert.equal(ruleAsks(draft).length, WORK_TURN_LIMITS.asksPerCommit);
  assert.match(first.effects[1].summary, /^2 rotation ask\(s\) were not issued/);
  const second = runRule(draft, WORK_TURN_EVENTS.SCAN);
  assert.deepEqual(second.effects.map((e) => e.action), ['delegated']);
  assert.equal(ruleAsks(draft).length, 10, 'the two deferred asks followed on the next write');
});

/* ---------------------------------------------------- 7. the real spine */

test('under the REAL spine a classification, the rotation ask, the seat roll-up and the seal land in one commit and read back equal', () => {
  const { map, store, api } = boot({ settings: { activeSeatId: 'fm', sealEnabled: true } });

  // Finn classifies what he handed out. Three asks: the pool is below the floor.
  const firstThree = ['a1', 'a2', 'a3'].map((id) => {
    const result = api.workTurnClassify(id, 'non-promotable');
    assert.equal(result.ok, true, result?.error);
    assert.equal(result.saved, true);
    return result;
  });
  assert.equal(ruleAsks(store.state).length, 0, 'three asks are below the declared floor of four');
  // A classification is an operational commit: under a declared seat the
  // Operating Seat fans it up the chain on the same spine.
  assert.ok(firstThree[0].propagations.some((effect) => effect && effect.ruleId === 'RULE-SEAT-01'),
    'the Operating Seat rolled the span up in the first classification commit');
  const sealCount = () => store.state.events.filter((event) => event.type === 'audit.seal').length;
  assert.equal(sealCount(), 3, 'one seal per commit so far');

  // The fourth: Finn's pool now carries 4, Ann 3 of them.
  // 3 × 360 × 100 = 108000 ≥ 200 × 4 × 100 = 80000 → over a fair turn.
  const fourth = api.workTurnClassify('b1', 'non-promotable');
  assert.equal(fourth.ok, true, fourth?.error);
  const npw = (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === WORK_TURN_RULE_ID);
  assert.deepEqual(npw.map((effect) => effect.action), ['delegated'], 'the ask was issued in the same commit as the act');

  const asks = ruleAsks(store.state);
  assert.equal(asks.length, 1, 'exactly one ask — the derived cascade did not ask twice');
  assert.equal(asks[0].personId, 'fm', 'the manager who made the allocation, nobody else');
  assert.equal(asks[0].status, 'active');
  assert.equal(asks[0].dueOn, '2026-11-18');
  assert.match(asks[0].title, /3 of 4 went to Ann Able/);

  // The act is stamped with the seat that made it.
  const acts = store.state.workTurnActs;
  assert.equal(acts.length, 4);
  assert.deepEqual(acts.map((a) => [a.delegationId, a.personId, a.kind, a.byId]),
    [['a1', 'ann', 'non-promotable', 'fm'], ['a2', 'ann', 'non-promotable', 'fm'], ['a3', 'ann', 'non-promotable', 'fm'], ['b1', 'ben', 'non-promotable', 'fm']]);

  // Vertical roll-up: the ask reaches every roster seat above its owner in the
  // SAME commit. The seat rule runs straight after RULE-NPW-01 and finds the
  // edges already there, so there is exactly one per ancestor — none doubled.
  const own = store.state.links.filter((l) => l.ruleId === WORK_TURN_RULE_ID);
  assert.deepEqual(own.filter((l) => l.relation === 'issues-obligation').map((l) => [l.sourceId, l.targetId]), [['ann', asks[0].id]]);
  const rollups = store.state.links.filter((l) => l.relation === 'rolls-up-to' && l.sourceType === 'delegation' && l.sourceId === asks[0].id);
  assert.deepEqual(rollups.map((l) => l.targetId).sort(), ['dir', 'vp'], 'Dora and Vera, once each, whichever rule wrote the edge');
  // The seal is the last rule on the spine: it attested this commit, ask included.
  assert.ok(fourth.propagations.some((effect) => effect && effect.ruleId === 'RULE-SEAL-01'), 'the seal ran over the same transaction');
  assert.equal(sealCount(), 4, 'exactly one new seal for the commit that issued the ask');

  // The bytes on disk carry the acts, the ask and the marker.
  const stored = JSON.parse(map.get(STORAGE_KEY));
  assert.equal(stored.schemaVersion, 149);
  assert.equal(stored.workTurnActs.length, 4);
  assert.equal(stored.workTurnMarkers.length, 1);
  assert.equal(stored.delegations.filter((d) => String(d.support || '').includes(WORK_TURN_RULE_ID)).length, 1);

  // display == stored: a fresh store over the same bytes reads the same report.
  let seq = 0;
  const reboot = createStore({
    storage: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) },
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-reboot-${++seq}`,
  });
  reboot.load();
  assert.deepEqual(reboot.state.workTurnActs, store.state.workTurnActs);
  assert.deepEqual(reboot.state.workTurnMarkers, store.state.workTurnMarkers);
  const live = api.workTurnReport();
  assert.equal(live.ok, true, live?.error);
  const fresh = buildWorkTurns(reboot.state, { now: NOW });
  assert.deepEqual(fresh.board, live.report.board, 'every printed count is the stored count');
  assert.equal(workTurnBriefText(fresh), workTurnBriefText(live.report));
  assert.equal(live.report.board.openRotationAsksN, 1);
  assert.equal(live.report.board.asksRuleIssuedN >= 1, true, 'the rule’s own ask is counted apart');
  assert.equal(memberOf(live.report, 'fm', 'ann').over, true);

  // A second write that changes nothing about the pattern does not ask again.
  const fifth = api.workTurnClassify('d1', 'promotable');
  assert.equal(fifth.ok, true, fifth?.error);
  assert.deepEqual((store.lastPropagations || []).filter((effect) => effect && effect.ruleId === WORK_TURN_RULE_ID), []);
  assert.equal(ruleAsks(store.state).length, 1);

  // Finn corrects a classification: the earlier act stays, the pool falls below
  // the floor, and the rule closes its own ask in that commit.
  const corrected = api.workTurnClassify('a3', 'promotable');
  assert.equal(corrected.ok, true, corrected?.error);
  assert.equal(store.state.workTurnActs.filter((a) => a.delegationId === 'a3').length, 2, 'append-only: both acts are in history');
  assert.equal(effectiveWorkTurnActs(store.state.workTurnActs).get('a3').act.kind, 'promotable');
  const closedAsk = ruleAsks(store.state)[0];
  assert.equal(closedAsk.status, 'done');
  assert.ok(closedAsk.completionNote.startsWith(WORK_TURN_CLOSED_PREFIX));
  assert.equal(JSON.parse(map.get(STORAGE_KEY)).delegations.find((d) => d.id === closedAsk.id).status, 'done', 'the closure is on disk');
});

/* ------------------------------------------- 8. the doors and their gates */

test('classifying is refused for an ask outside the seat, for the carrier’s own ask, and for anything that takes no kind', () => {
  const { store, api } = boot({ settings: { activeSeatId: 'fm' } });
  const before = JSON.stringify(store.state);

  const outside = api.workTurnClassify('g1', 'non-promotable');
  assert.equal(outside.ok, false);
  assert.match(outside.error, /outside your span and your declared lines/);

  const own = api.workTurnClassify('f1', 'non-promotable');
  assert.equal(own.ok, false);
  assert.match(own.error, /never by the person carrying it/);

  const kind = api.workTurnClassify('a1', 'glue');
  assert.equal(kind.ok, false);
  assert.equal(kind.field, 'kind');

  const missing = api.workTurnClassify('nope', 'promotable');
  assert.equal(missing.ok, false);
  assert.equal(JSON.stringify(store.state), before, 'four refusals, no byte changed');

  // A manager does not scan or set conventions: the gateway's rank window says why.
  const scan = api.workTurnScan();
  assert.equal(scan.ok, false);
  assert.match(scan.error, /rank/i);
  const conventions = api.workTurnSetConventions({ [K.minAsks]: 5 });
  assert.equal(conventions.ok, false);
  assert.equal(JSON.stringify(store.state), before);

  // Same kind twice is refused rather than appended.
  assert.equal(api.workTurnClassify('a1', 'promotable').ok, true);
  const twice = api.workTurnClassify('a1', 'promotable');
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already recorded/);
  assert.equal(store.state.workTurnActs.length, 1);
});

test('a line manager classifies the shared contributor’s ask through the declared line; handed-back and automation asks take no kind', () => {
  const petra = boot({ settings: { activeSeatId: 'pm' } });
  const viaLine = petra.api.workTurnClassify('c2', 'non-promotable');
  assert.equal(viaLine.ok, true, viaLine?.error);
  assert.equal(petra.store.state.workTurnActs[0].byId, 'pm');
  const notHers = petra.api.workTurnClassify('a1', 'non-promotable');
  assert.equal(notHers.ok, false);
  const returned = petra.api.workTurnClassify('r1', 'non-promotable');
  assert.equal(returned.ok, false);
  assert.match(returned.error, /handed back/);

  const operator = boot({ mutate: (s) => { s.delegations.push({ ...ask('x1', 'ann', 'Record the commitment'), support: 'Certified by RULE-SUC-01.' }); } });
  const automated = operator.api.workTurnClassify('x1', 'non-promotable');
  assert.equal(automated.ok, false);
  assert.match(automated.error, /automation rule issued this ask/);
  assert.equal(operator.store.state.workTurnActs.length, 0);
});

test('conventions are set by a director, refused out of bounds with the bound printed, and never clamped', () => {
  const { map, store, api } = boot({ settings: { activeSeatId: 'dir' }, classified: true });
  const before = JSON.stringify(store.state.settings);

  const low = api.workTurnSetConventions({ [K.minAsks]: 1 });
  assert.equal(low.ok, false);
  assert.match(low.error, /whole number from 2 to 50/);
  assert.match(low.error, /Nothing was clamped/);
  const fractional = api.workTurnSetConventions({ [K.factorPct]: 150.5 });
  assert.equal(fractional.ok, false);
  const text = api.workTurnSetConventions({ [K.windowDays]: '90' });
  assert.equal(text.ok, false);
  const unknown = api.workTurnSetConventions({ seatFloorN: 1 });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /is not a work-turn convention/);
  const mixed = api.workTurnSetConventions({ [K.minAsks]: 6, [K.factorPct]: 9999 });
  assert.equal(mixed.ok, false, 'one bad value refuses the whole patch');
  const same = api.workTurnSetConventions({ [K.minAsks]: 4 });
  assert.equal(same.ok, false);
  assert.equal(JSON.stringify(store.state.settings), before, 'six refusals, no setting moved');

  const ok = api.workTurnSetConventions({ [K.minAsks]: 6, [K.askDueDays]: 10 });
  assert.equal(ok.ok, true, ok?.error);
  assert.deepEqual(ok.changed.sort(), [K.askDueDays, K.minAsks].sort());
  assert.equal(store.state.settings[K.minAsks], 6);
  const stored = JSON.parse(map.get(STORAGE_KEY));
  assert.equal(stored.settings[K.minAsks], 6);
  assert.equal(stored.settings[K.askDueDays], 10);
  // The reading moved with the convention: Finn's pool (5 asks) is below a floor of 6.
  const report = api.workTurnReport().report;
  assert.equal(report.minAsks, 6);
  assert.equal(report.board.pools.concentrated, 0);

  // A director scans; the rule answers on the spine.
  const scan = api.workTurnScan();
  assert.equal(scan.ok, true, scan?.error);
  assert.ok(Array.isArray(scan.effects));
});

/* --------------------------------------------------------- 9. the schema */

test('schema v144: the migration adds two empty collections and fabricates no kind', () => {
  const v143 = { ...draftOf(fixture()), schemaVersion: 143 };
  delete v143.workTurnActs;
  delete v143.workTurnMarkers;
  const migrated = migrate(v143);
  assert.deepEqual(migrated.applied, ['143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149']);
  assert.equal(migrated.raw.schemaVersion, 149);
  assert.deepEqual(migrated.raw.workTurnActs, []);
  assert.deepEqual(migrated.raw.workTurnMarkers, []);
  assert.equal(migrated.raw.delegations.length, v143.delegations.length, 'no ask changed');
  const report = read(normalizeState(migrated.raw, { now: NOW }).state);
  assert.equal(report.board.classes.unclassified, report.board.asksReadN, 'every existing ask reads not classified');

  // Idempotent: the current workspace is not migrated again, and a v143 file that
  // already carries acts (a hand-edited or partly upgraded export) keeps them.
  const again = migrate(migrated.raw);
  assert.deepEqual(again.applied, []);
  assert.equal(JSON.stringify(again.raw), JSON.stringify(migrated.raw));
  const carried = migrate({ ...v143, workTurnActs: [kindAct('w1', 'a1', 'ann', 'non-promotable')] });
  assert.deepEqual(carried.raw.workTurnActs.map((a) => a.id), ['w1'], 'the step never empties a ledger that is already there');
});

test('load-time normalisation drops what it cannot trust with a counted warning and clamps a stored convention', () => {
  const state = fixture();
  const warnings = [];
  const kept = normalizeWorkTurnActs([
    kindAct('ok1', 'a1', 'ann', 'non-promotable'),
    kindAct('bad-kind', 'a2', 'ann', 'housework'),
    kindAct('wrong-owner', 'a3', 'ben', 'non-promotable'),
    kindAct('orphan', 'gone', 'ann', 'promotable'),
    'not an object',
  ], state, warnings);
  assert.deepEqual(kept.map((a) => a.id), ['ok1']);
  assert.equal(warnings.length, 3);
  assert.match(warnings.join(' | '), /dropped 2 malformed/);
  assert.match(warnings.join(' | '), /dropped 1 classification act\(s\) whose ask no longer exists/);
  assert.match(warnings.join(' | '), /naming a person other than the ask’s owner; none was re-pointed/);

  // The loader clamps a stored value into its bounds; the setter refuses it (tested above).
  const clamped = normalizeWorkTurnSettings({ [K.windowDays]: 9999, [K.minAsks]: 0, [K.factorPct]: 'x', [K.autoPropagate]: 'yes' });
  assert.equal(clamped[K.windowDays], WORK_TURN_BOUNDS.windowDays[1]);
  assert.equal(clamped[K.minAsks], WORK_TURN_BOUNDS.minAsks[0]);
  assert.equal(clamped[K.factorPct], 200, 'an unreadable value falls back to the declared default');
  assert.equal(typeof clamped[K.autoPropagate], 'boolean');

  // The settings survive the workspace normaliser (the convention-persistence defect class).
  const custom = fixture({ settings: { [K.minAsks]: 9, [K.factorPct]: 250, [K.autoPropagate]: false } });
  assert.deepEqual([custom.settings[K.minAsks], custom.settings[K.factorPct], custom.settings[K.autoPropagate]], [9, 250, false]);

  // Acts and markers are stable across a second normalisation.
  const classified = fixture({ classified: true });
  const again = normalizeState(draftOf(classified), { now: NOW }).state;
  assert.deepEqual(again.workTurnActs, classified.workTurnActs);
  assert.equal(classified.workTurnActs.length, 7);
});

test('the classification ledger is append-only and bounded: only superseded acts are ever evicted', () => {
  const acts = [
    kindAct('1', 'a1', 'ann', 'non-promotable', '2026-11-01T00:00:00.000Z'),
    kindAct('2', 'a1', 'ann', 'promotable', '2026-11-02T00:00:00.000Z'),
    kindAct('3', 'a2', 'ann', 'non-promotable', '2026-11-03T00:00:00.000Z'),
    kindAct('4', 'a1', 'ann', 'non-promotable', '2026-11-04T00:00:00.000Z'),
  ];
  const effective = effectiveWorkTurnActs(acts);
  assert.equal(effective.get('a1').act.id, '4', 'the latest act is the effective one');
  assert.equal(effective.get('a1').actN, 3);
  assert.equal(effective.get('a2').act.id, '3');
  // Room for three: the OLDEST superseded act goes; no effective act is touched.
  assert.deepEqual(compactWorkTurnActs(acts, 3).map((a) => a.id), ['2', '3', '4']);
  // Room for two: both superseded acts go.
  assert.deepEqual(compactWorkTurnActs(acts, 2).map((a) => a.id), ['3', '4']);
  // Room for one: the two effective acts are BOTH kept — an effective act is never evicted.
  assert.deepEqual(compactWorkTurnActs(acts, 1).map((a) => a.id), ['3', '4']);
});

/* ------------------------------------------------------------ 10. the CSV */

test('CSV scope #135 exports exactly the counts the seat was shown, and no identity', () => {
  const state = fixture({ classified: true });
  const report = read(state);
  const result = exportWorkspaceCsv(state, 'work-turns', { now: NOW });
  assert.equal(result.ok, true, result?.error);
  assert.equal(result.rowCount, 1);
  const [header, data] = result.csv.trim().split(/\r?\n/);
  assert.deepEqual(header.split(','), [...WORK_TURN_CSV_COLUMNS]);
  const cells = Object.fromEntries(header.split(',').map((key, index) => [key, data.split(',')[index]]));

  const b = report.board;
  assert.equal(cells.row_type, 'summary');
  assert.equal(cells.generated_on, '2026-11-11');
  assert.equal(cells.scope, 'matrix');
  assert.equal(cells.window_from, '2026-08-14');
  assert.equal(cells.window_to, '2026-11-11');
  assert.deepEqual(
    ['asks_in_window', 'asks_read', 'asks_non_promotable', 'asks_unclassified', 'npt_attributed', 'npt_sole_line', 'people_read',
      'carriers', 'verdict_over_turn', 'verdict_stacked', 'verdict_unread', 'verdict_within', 'pools_read', 'pool_concentrated',
      'findings', 'findings_pool', 'findings_stack', 'owner_unique'].map((key) => Number(cells[key])),
    [b.asksInWindowN, b.asksReadN, b.classes['non-promotable'], b.classes.unclassified, b.placements.attributed, b.placements['sole-line'],
      b.peopleReadN, b.carriersN, b.verdicts['over-turn'], b.verdicts.stacked, b.verdicts.unread, b.verdicts.within, b.poolsReadN,
      b.pools.concentrated, b.findingsN, b.findingKinds.pool, b.findingKinds.stack, b.owners.unique],
    'every exported count is the printed count',
  );
  assert.deepEqual([Number(cells.asks_in_window), Number(cells.verdict_stacked), Number(cells.findings)], [10, 1, 2], 'and the printed count is the hand count');
  // Every declared column is filled on the summary row: nothing exports blank.
  const row = workTurnCsvRows(report)[0];
  assert.deepEqual(Object.keys(row), [...WORK_TURN_CSV_COLUMNS]);
  assert.deepEqual(WORK_TURN_CSV_COLUMNS.filter((key) => row[key] === '' || row[key] === undefined), []);
  // Identity-free: no person, manager or ask title crosses the boundary.
  for (const leak of ['Ann', 'Cat Cole', 'Finn', 'Petra', 'notes', 'committee', 'a1', 'fm']) {
    assert.equal(data.includes(leak), false, `the export does not carry “${leak}”`);
  }

  // A seat exports ITS reading: Petra's file carries Petra's counts.
  const petra = { ...state, settings: { ...state.settings, activeSeatId: 'pm' } };
  const hers = exportWorkspaceCsv(petra, 'work-turns', { now: NOW });
  const [h2, d2] = hers.csv.trim().split(/\r?\n/);
  const hersCells = Object.fromEntries(h2.split(',').map((key, index) => [key, d2.split(',')[index]]));
  assert.deepEqual([Number(hersCells.people_read), Number(hersCells.asks_read), Number(hersCells.asks_not_read), Number(hersCells.verdict_unread)], [4, 3, 6, 1]);

  // An unresolved seat is refused in the file as it is on the screen.
  const ghost = read(state, 'nobody-here');
  assert.equal(ghost.seat.readOnly, true, 'a seat id that names nobody resolves to the read-only fallback');
  assert.equal(ghost.detail.level, 'none');
  const refusedRow = workTurnCsvRows(ghost)[0];
  assert.equal(refusedRow.row_type, 'refused');
  assert.equal(refusedRow.generated_on, '2026-11-11');
  assert.deepEqual(WORK_TURN_CSV_COLUMNS.filter((key) => !['row_type', 'generated_on'].includes(key) && refusedRow[key] !== ''), [],
    'no count is exported to an unresolved seat');
  const ghostApi = boot({ classified: true, settings: { activeSeatId: 'nobody-here' } });
  const refusedReport = ghostApi.api.workTurnReport();
  assert.equal(refusedReport.ok, false, 'and the report door refuses it too');
});

/* ---------------------------------------------------------- 11. the panel */

function bootDocument() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  return dom;
}

const tableByCaption = (node, caption) => node.querySelector(`table[aria-label="${caption}"]`);
const cellsOf = (tableEl) => [...tableEl.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));

test('the panel prints the report the action returned, a render stores nothing, and its Record button writes through the gateway', () => {
  const dom = bootDocument();
  const errors = [];
  dom.window.addEventListener('error', (event) => errors.push(String(event.message)));

  const { map, store, api } = boot({ classified: true });
  const bytesBefore = map.get(STORAGE_KEY);
  const stateBefore = JSON.stringify(store.state);
  const result = api.workTurnReport();
  assert.equal(result.ok, true, result?.error);
  const report = result.report;

  let refreshed = 0;
  const ctx = { api, state: store.state, query: new URLSearchParams('panel=turns'), navigate() {}, refresh() { refreshed += 1; } };
  const node = renderMatrixWorkTurnPanel(ctx, { now: NOW });
  dom.window.document.body.append(node);

  // The brief on the screen IS the brief of the report the action returned.
  assert.equal(node.querySelector('[data-testid="npw-brief"]').textContent, workTurnBriefText(report));
  assert.match(node.textContent, /All seven count identities reconcile/);

  // Pools: one printed row per report pool, in order, with the computed state and next turn.
  const pools = cellsOf(tableByCaption(node, 'Manager pools and whose turn is next'));
  assert.deepEqual(pools.map((row) => row[0]), report.pools.map((p) => p.managerName));
  assert.deepEqual(pools.map((row) => Number(row[3])), report.pools.map((p) => p.totalN));
  const finnRow = pools.find((row) => row[0] === 'Finn Functional');
  assert.deepEqual(finnRow, ['Finn Functional', WORK_TURN_POOL_STATE_LABELS.concentrated, '4', '5', '0', 'Dan Dove']);
  assert.equal(WORK_TURN_POOL_STATE_LABELS.concentrated, 'One person carries the turn');
  const petraPool = poolOf(report, 'pm');
  assert.equal(pools.find((row) => row[0] === 'Petra Project')[5], petraPool.turnRank.text);
  assert.match(petraPool.turnRank.text, /Uncertain — possible: Gus Gray, Hal Hart/);

  // Members: the printed fair turn is the exact fraction and its truncated rendering.
  const members = cellsOf(tableByCaption(node, 'Pool members and fair turns'));
  const annRow = members.find((row) => row[0] === 'Finn Functional' && row[1] === 'Ann Able');
  assert.deepEqual(annRow.slice(3), ['100%', '3', '0', '3–3', '5 × 100 ÷ 360 ≈ 1.38', 'Over a fair turn']);
  const catRow = members.find((row) => row[0] === 'Finn Functional' && row[1] === 'Cat Cole');
  assert.deepEqual(catRow.slice(3), ['60%', '1', '0', '1–1', '5 × 60 ÷ 360 ≈ 0.83', '—']);
  assert.equal(members.length, report.pools.reduce((acc, p) => acc + p.members.length, 0));

  // People and findings: exactly the report rows.
  const people = cellsOf(tableByCaption(node, 'People carrying non-promotable work'));
  assert.deepEqual(people.map((row) => [row[0], Number(row[2])]), report.people.map((p) => [p.name, p.nptN]));
  assert.deepEqual(people.map((row) => row[4]), report.people.map((p) => WORK_TURN_VERDICT_LABELS[p.verdict]));
  assert.deepEqual(people.map((row) => row[4]), ['Over a fair turn on a line', 'Within a fair turn', 'Stacked across lines']);
  const findings = cellsOf(tableByCaption(node, 'Work-turn findings and owning seats'));
  assert.deepEqual(findings.map((row) => row[2]), report.findings.map((f) => `${f.carriedN} of ${f.totalN}`));
  assert.match(findings[1][3], /Dora Director/);

  // The method and purpose-built conceptual asset are real and accessible; the
  // image carries no workspace data and the text remains available without it.
  assert.equal(node.querySelectorAll('ol li').length, WORK_TURN_METHOD.length);
  const diagram = node.querySelector('[data-testid="npw-evidence-diagram"]');
  assert.equal(diagram.getAttribute('src'), './app/assets/work-turn-evidence.jpg');
  assert.match(diagram.getAttribute('alt'), /stable, uncertain or refused/);
  const image = fs.readFileSync(path.resolve('app/assets/work-turn-evidence.jpg'));
  assert.deepEqual([...image.subarray(0, 2)], [0xff, 0xd8], 'the displayed asset is a JPEG, not a placeholder');
  assert.deepEqual([...image.subarray(-2)], [0xff, 0xd9]);

  // Every kind and line badge in the ask table explains itself in the registry's own words.
  const askTable = tableByCaption(node, 'Asks handed over inside the look-back window');
  const titles = [...askTable.querySelectorAll('.badge[title]')].map((el) => el.getAttribute('title'));
  const expectedTitles = report.asks.flatMap((a) => [WORK_TURN_CLASS_REASONS[a.classKey], ...(a.placement ? [WORK_TURN_PLACEMENT_REASONS[a.placement]] : [])]);
  assert.deepEqual(titles, expectedTitles);
  assert.ok(titles.includes(WORK_TURN_CLASS_REASONS.unclassified) && titles.includes(WORK_TURN_PLACEMENT_REASONS.attributed));

  // A render mutates no stored byte.
  assert.equal(JSON.stringify(store.state), stateBefore);
  assert.equal(map.get(STORAGE_KEY), bytesBefore, 'display == stored: rendering wrote nothing');

  // The Record button is a real door: it appends one act and persists it.
  const button = node.querySelector('[data-testid="npw-classify-g1"]');
  assert.ok(button, 'an unclassified ask offers a Record button');
  const select = button.parentElement.querySelector('select');
  select.value = 'non-promotable';
  button.click();
  assert.equal(refreshed, 1, 'the page was asked to redraw');
  const act = store.state.workTurnActs.find((a) => a.delegationId === 'g1');
  assert.deepEqual([act.personId, act.kind, act.byId], ['gus', 'non-promotable', null]);
  assert.equal(JSON.parse(map.get(STORAGE_KEY)).workTurnActs.some((a) => a.delegationId === 'g1'), true, 'the act is on disk');
  const after = api.workTurnReport().report;
  assert.equal(poolOf(after, 'pm').turnRank.state, 'stable');
  assert.deepEqual(poolOf(after, 'pm').nextTurn.names, ['Hal Hart']);
  const updatedNode = renderMatrixWorkTurnPanel({ ...ctx, state: store.state }, { now: NOW });
  const updatedRow = cellsOf(tableByCaption(updatedNode, 'Manager pools and whose turn is next')).find((row) => row[0] === 'Petra Project');
  assert.equal(updatedRow[5], poolOf(after, 'pm').turnRank.text, 'rendered rank equals the current computed rank');
  const reboot = createStore({ storage: {
    getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key),
  }, now: () => NOW });
  reboot.load();
  assert.deepEqual(poolOf(buildWorkTurns(reboot.state, { now: NOW }), 'pm').turnRank, poolOf(after, 'pm').turnRank,
    'the same bounds are reconstructed from the persisted acts');
  const exported = exportWorkspaceCsv(store.state, 'work-turns', { now: NOW });
  const [head, data] = exported.csv.trim().split(/\r?\n/);
  const cells = Object.fromEntries(head.split(',').map((key, index) => [key, data.split(',')[index]]));
  assert.equal(Number(cells.turn_rank_stable), after.board.turnRanks.stable);
  assert.equal(Number(cells.turn_rank_uncertain), after.board.turnRanks.uncertain);
  assert.equal(cells.turn_ranks_reconcile, String(after.board.turnRanksReconcile));

  // Choosing nothing is refused by the action, not repaired by the screen.
  const idle = node.querySelector('[data-testid="npw-classify-f1"]');
  idle.parentElement.querySelector('select').value = '';
  const actsBefore = store.state.workTurnActs.length;
  idle.click();
  assert.equal(store.state.workTurnActs.length, actsBefore);
  assert.equal(refreshed, 1);
  assert.deepEqual(errors, [], 'no jsdom errors during render or click');
});

test('a withheld altitude is shown counts and the reason, never a name; the tab dispatches through the matrix page', () => {
  const dom = bootDocument();
  const errors = [];
  dom.window.addEventListener('error', (event) => errors.push(String(event.message)));

  // Vera (rank 4) reads counts only.
  const vera = boot({ classified: true, settings: { activeSeatId: 'vp' } });
  const veraNode = renderMatrixWorkTurnPanel({ api: vera.api, state: vera.store.state, navigate() {}, refresh() {} }, { now: NOW });
  dom.window.document.body.append(veraNode);
  const text = veraNode.textContent;
  assert.match(text, /Detail is withheld at this altitude/);
  assert.match(text, /This seat reads counts only/);
  for (const name of ['Ann Able', 'Cat Cole', 'Ben Brook', 'Take the notes']) assert.equal(text.includes(name), false, `${name} is not printed`);
  assert.equal(veraNode.querySelector('table'), null, 'no pool, person, ask or finding table at this altitude');
  assert.match(veraNode.querySelector('[data-testid="npw-brief"]').textContent, /over a fair turn: 1; stacked across lines: 1/);
  assert.ok(veraNode.querySelector('[data-testid="npw-scan"]'), 'a VP may scan');
  assert.ok(veraNode.querySelector('[data-testid="npw-save-conventions"]'));

  // Finn (rank 2) is offered neither the scan nor the conventions.
  const finn = boot({ classified: true, settings: { activeSeatId: 'fm' } });
  const finnNode = renderMatrixWorkTurnPanel({ api: finn.api, state: finn.store.state, navigate() {}, refresh() {} }, { now: NOW });
  assert.equal(finnNode.querySelector('[data-testid="npw-scan"]'), null);
  assert.equal(finnNode.querySelector('[data-testid="npw-save-conventions"]'), null);
  assert.match(finnNode.textContent, /A pool could not be read|pool not read: 1/);

  // The matrix page routes `?panel=turns` here.
  const state = fixture({ classified: true });
  const page = renderMatrix({
    api: {
      matrixReport: () => ({ ok: true, report: buildMatrixReport(state, { now: NOW, settings: state.settings }) }),
      workTurnReport: () => ({ ok: true, report: buildWorkTurns(state, { now: NOW }) }),
    },
    state,
    query: new URLSearchParams('panel=turns'),
    navigate() {},
    refresh() {},
  });
  dom.window.document.body.append(page);
  assert.ok(page.querySelector('[data-testid="work-turn-panel"]'), 'the work-turn panel is on the page');
  assert.match(page.textContent, /Non-Promotable Work Turns/);
  assert.match(page.textContent, /Work turns/, 'the tab is offered');
  assert.equal(page.textContent.includes('Ledger refused'), false);
  assert.deepEqual(errors, [], 'no jsdom errors through renderMatrix');
});

test('a11y: the panel passes axe-core at every disclosure level, and every control has an accessible name', async () => {
  const AXE_SRC = fs.readFileSync(path.resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
  const violationsFor = async (settings) => {
    const vc = new VirtualConsole();
    const dom = new JSDOM('<!doctype html><html lang="en"><head><title>LeadOS</title></head><body><main id="view"><h1>Matrix</h1></main><div id="toast-root"></div></body></html>', {
      url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const { store, api } = boot({ classified: true, settings });
    const node = renderMatrixWorkTurnPanel({ api, state: store.state, navigate() {}, refresh() {} }, { now: NOW });
    dom.window.document.getElementById('view').append(node);
    // Structural checks axe does not make for us: every form control is named.
    const unnamed = [...node.querySelectorAll('select, input, button')].filter((el) => {
      if (el.tagName === 'BUTTON') return !el.textContent.trim();
      return !el.getAttribute('aria-label') && !el.closest('label')?.textContent.trim();
    });
    assert.deepEqual(unnamed.map((el) => el.outerHTML.slice(0, 80)), [], 'no unnamed control');
    for (const tableEl of node.querySelectorAll('table')) {
      assert.ok(tableEl.getAttribute('aria-label') || tableEl.querySelector('caption'), 'every table is named');
    }
    dom.window.eval(AXE_SRC);
    const res = await dom.window.axe.run(dom.window.document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
    return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
  };
  assert.deepEqual(await violationsFor({}), [], 'operator view (every card, select and input rendered)');
  assert.deepEqual(await violationsFor({ activeSeatId: 'fm' }), [], 'a manager seat');
  assert.deepEqual(await violationsFor({ activeSeatId: 'dir' }), [], 'a director seat (leaders by name)');
  assert.deepEqual(await violationsFor({ activeSeatId: 'vp' }), [], 'a VP seat (counts only)');
});

test('the closed vocabularies the screen and the file use are exactly the ones the engine counts', () => {
  const report = read(fixture({ classified: true }));
  assert.deepEqual(Object.keys(report.board.verdicts), [...WORK_TURN_VERDICTS]);
  assert.deepEqual(Object.keys(report.board.pools), [...WORK_TURN_POOL_STATES]);
  assert.deepEqual(Object.keys(report.board.turnRanks), [...WORK_TURN_RANK_STATES]);
  assert.equal(report.method, WORK_TURN_METHOD);
  const brief = workTurnBriefText(report);
  assert.equal(brief.split('\n').length, 9);
  assert.equal(brief.includes('NO'), false, 'every identity reads yes');
  assert.equal(JSON.stringify(report.board).includes('Ann'), false, 'the board itself carries no identity');
});
