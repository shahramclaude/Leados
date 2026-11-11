/**
 * ADR-0178 — Cross-Line Ask Attribution & Shared-Contributor Load Reconciliation.
 * Focused contracts for vocabulary, fail-closed storage and exact stored → read → CSV identity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as R from '../../app/core/domain/delegationLineRegistry.js';
import {
  compactDelegationLineActs,
  effectiveDelegationLineActs,
  normalizeDelegationLineActs,
  normalizeDelegationLineMarkers,
  normalizeDelegationLineSettings,
} from '../../app/core/domain/delegationLineSchema.js';
import { LOAD_COMMITMENT_BUDGET } from '../../app/core/domain/load.js';
import { COLLECTIONS, DEFAULT_SETTINGS } from '../../app/core/schema.js';

const T1 = '2026-11-10T09:00:00.000Z';
const T2 = '2026-11-11T09:00:00.000Z';

/** `sam` owns one open and one closed ask; `hal` owns one open ask. */
const STATE = Object.freeze({
  delegations: Object.freeze([
    Object.freeze({ id: 'd1', personId: 'sam', status: 'active' }),
    Object.freeze({ id: 'd2', personId: 'sam', status: 'done' }),
    Object.freeze({ id: 'd3', personId: 'hal', status: 'active' }),
  ]),
});
const GOOD = Object.freeze({
  id: 'a1', delegationId: 'd1', personId: 'sam', lineId: 'home:sam', managerId: 'home',
  lineKind: 'functional', basis: 'declared', byId: null, at: T1,
});

test('vocabulary: every closed key carries its label, CSV columns are distinct, and the default budget is the Load engine’s', () => {
  assert.equal(R.DELEGATION_LINE_DEFAULTS.budget, LOAD_COMMITMENT_BUDGET, 'the two modules must speak about the same ceiling');
  for (const key of R.DELEGATION_LINE_CLASSES) {
    assert.ok(R.DELEGATION_LINE_CLASS_LABELS[key], `class label: ${key}`);
    assert.ok(R.DELEGATION_LINE_CLASS_REASONS[key], `class reason: ${key}`);
  }
  for (const key of R.DELEGATION_LINE_VERDICTS) {
    assert.ok(R.DELEGATION_LINE_VERDICT_LABELS[key], `verdict label: ${key}`);
    assert.ok(R.DELEGATION_LINE_VERDICT_REASONS[key], `verdict reason: ${key}`);
  }
  for (const key of R.DELEGATION_LINE_LINE_STATES) assert.ok(R.DELEGATION_LINE_LINE_STATE_LABELS[key], `line state: ${key}`);
  for (const key of R.DELEGATION_LINE_CHARTER_STATES) assert.ok(R.DELEGATION_LINE_CHARTER_LABELS[key], `charter state: ${key}`);
  for (const key of R.DELEGATION_LINE_APEX_STATES) assert.ok(R.DELEGATION_LINE_APEX_LABELS[key], `apex state: ${key}`);
  // No label without a key either: a word that is not in the closed list cannot be printed.
  assert.deepEqual(Object.keys(R.DELEGATION_LINE_CLASS_LABELS), [...R.DELEGATION_LINE_CLASSES]);
  assert.deepEqual(Object.keys(R.DELEGATION_LINE_VERDICT_LABELS), [...R.DELEGATION_LINE_VERDICTS]);
  assert.deepEqual(Object.keys(R.DELEGATION_LINE_LINE_STATE_LABELS), [...R.DELEGATION_LINE_LINE_STATES]);
  assert.deepEqual(Object.keys(R.DELEGATION_LINE_CHARTER_LABELS), [...R.DELEGATION_LINE_CHARTER_STATES]);
  assert.deepEqual(Object.keys(R.DELEGATION_LINE_APEX_LABELS), [...R.DELEGATION_LINE_APEX_STATES]);
  assert.equal(new Set(R.DELEGATION_LINE_CSV_COLUMNS).size, R.DELEGATION_LINE_CSV_COLUMNS.length);
  assert.equal(R.DELEGATION_LINE_CSV_DESCRIPTOR.sensitive, false);
});

test('stored shape is registered without inventing an attribution', () => {
  assert.equal(COLLECTIONS.includes('delegationLineActs'), true);
  assert.equal(COLLECTIONS.includes('delegationLineMarkers'), true);
  assert.equal(DEFAULT_SETTINGS.delegationLineBudget, 6);
  assert.equal(DEFAULT_SETTINGS.delegationLineAskDueDays, 5);
  assert.equal(DEFAULT_SETTINGS.delegationLineAutoPropagate, true);
});

test('settings: declared defaults, bounded integers, an explicit pause, and no coercion of a non-number', () => {
  assert.deepEqual(normalizeDelegationLineSettings({}), {
    delegationLineBudget: 6, delegationLineAskDueDays: 5, delegationLineAutoPropagate: true,
  });
  assert.deepEqual(
    normalizeDelegationLineSettings({ delegationLineBudget: 99, delegationLineAskDueDays: 0, delegationLineAutoPropagate: false }),
    { delegationLineBudget: 24, delegationLineAskDueDays: 1, delegationLineAutoPropagate: false },
  );
  assert.deepEqual(normalizeDelegationLineSettings('nonsense'), normalizeDelegationLineSettings({}));
  assert.equal(normalizeDelegationLineSettings({ delegationLineBudget: '9' }).delegationLineBudget, 6);
  assert.equal(normalizeDelegationLineSettings({ delegationLineBudget: Number.NaN }).delegationLineBudget, 6);
});

test('fail-closed acts: malformed, orphaned and wrong-owner acts are dropped and counted; a departed manager is kept as stored', () => {
  const raw = [
    GOOD,
    { ...GOOD, id: 'a2', lineId: 'ln-sam', managerId: 'pm', lineKind: 'project', basis: 'seat', byId: 'pm', at: T2 },
    { ...GOOD, id: 'a1' }, // duplicate id
    { ...GOOD, id: 'a3', delegationId: 'gone' }, // orphan
    { ...GOOD, id: 'a4', personId: 'hal' }, // names somebody who does not own the ask
    { ...GOOD, id: 'a5', basis: 'guessed' }, // outside the closed basis list
    { ...GOOD, id: 'a6', basis: 'seat', byId: null }, // seat-stamped with no seat on it
    { ...GOOD, id: 'a7', at: 'not a date' },
    { ...GOOD, id: 'a8', lineId: '' },
    { ...GOOD, id: 'a9', delegationId: 'd3', personId: 'hal', lineId: 'home:hal', managerId: 'ghost-who-left' },
    'nonsense',
    null,
  ];
  const before = JSON.stringify(raw);
  const warnings = [];
  const acts = normalizeDelegationLineActs(raw, STATE, warnings);

  assert.equal(JSON.stringify(raw), before, 'the normalizer does not mutate what it was given');
  assert.deepEqual(acts.map((a) => a.id), ['a1', 'a2', 'a9']);
  assert.deepEqual(Object.keys(acts[0]), ['id', 'delegationId', 'personId', 'lineId', 'managerId', 'lineKind', 'basis', 'byId', 'at']);
  assert.equal(acts[2].managerId, 'ghost-who-left', 'a manager who left is never rewritten into somebody else');
  // 12 rows in = 3 kept + 7 malformed + 1 orphan + 1 wrong owner. Nothing vanishes uncounted.
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /dropped 7 malformed line-attribution act\(s\); no attribution was repaired or guessed/);
  assert.match(warnings[1], /dropped 1 line-attribution act\(s\) whose delegation no longer exists/);
  assert.match(warnings[2], /dropped 1 line-attribution act\(s\) naming a person other than the delegation’s owner; none was re-pointed/);
  assert.equal(acts.length + 7 + 1 + 1, raw.length);

  const again = [];
  assert.deepEqual(normalizeDelegationLineActs(acts, STATE, again), acts, 'idempotent on its own output');
  assert.deepEqual(again, [], 'and silent the second time');
  assert.deepEqual(normalizeDelegationLineActs(undefined, STATE, []), []);
  assert.deepEqual(normalizeDelegationLineActs(raw, {}, []), [], 'with no delegations every act is an orphan');
});

test('effective act: the latest timestamp wins, an exact tie goes to the later-appended act, and line moves are counted', () => {
  const acts = [
    GOOD,
    { ...GOOD, id: 'a2', lineId: 'ln-sam', managerId: 'pm', at: T2 },
    { ...GOOD, id: 'a9', delegationId: 'd3', personId: 'hal', lineId: 'home:hal' },
  ];
  const effective = effectiveDelegationLineActs(acts);
  assert.equal(effective.size, 2);
  assert.deepEqual(
    { id: effective.get('d1').act.id, index: effective.get('d1').index, actN: effective.get('d1').actN, lineN: effective.get('d1').lineN },
    { id: 'a2', index: 1, actN: 2, lineN: 2 },
  );
  assert.equal(effective.get('d3').lineN, 1);
  assert.equal(Object.hasOwn(effective.get('d1'), 'lineIds'), false, 'the working set is not leaked');

  const tie = effectiveDelegationLineActs([{ ...GOOD, id: 'x1' }, { ...GOOD, id: 'x2', lineId: 'ln-sam' }]);
  assert.equal(tie.get('d1').act.id, 'x2');
  const backdated = effectiveDelegationLineActs([{ ...GOOD, id: 'y1', at: T2 }, { ...GOOD, id: 'y2', at: T1 }]);
  assert.equal(backdated.get('d1').act.id, 'y1', 'an older act appended later does not win');
  // Re-attributing to the SAME line is two acts on one line, not a move.
  const same = effectiveDelegationLineActs([{ ...GOOD, id: 'z1' }, { ...GOOD, id: 'z2', at: T2 }]);
  assert.deepEqual({ actN: same.get('d1').actN, lineN: same.get('d1').lineN }, { actN: 2, lineN: 1 });
  assert.equal(effectiveDelegationLineActs(null).size, 0);
});

test('compaction: bounded oldest-first, and it never evicts the effective attribution of an OPEN ask', () => {
  const ledger = [
    { ...GOOD, id: 'c1', at: T1 }, // d1, superseded by c3 → evictable
    { ...GOOD, id: 'c2', delegationId: 'd2', at: T1 }, // d2 is closed → evictable
    { ...GOOD, id: 'c3', lineId: 'ln-sam', managerId: 'pm', at: T2 }, // d1 effective, open → protected
    { ...GOOD, id: 'c4', delegationId: 'd3', personId: 'hal', at: T1 }, // d3 effective, open → protected
  ];
  const ids = (cap) => compactDelegationLineActs(ledger, STATE.delegations, cap).map((a) => a.id);
  assert.equal(compactDelegationLineActs(ledger, STATE.delegations, 4), ledger, 'at or under the cap the ledger is returned untouched');
  assert.deepEqual(ids(3), ['c2', 'c3', 'c4'], 'the oldest evictable act goes first');
  assert.deepEqual(ids(2), ['c3', 'c4']);
  assert.deepEqual(ids(1), ['c3', 'c4'], 'protected acts stay even over the cap: live work is never silently un-attributed');
  assert.equal(ledger.length, 4, 'the input ledger is not mutated');
  assert.equal(R.DELEGATION_LINE_LIMITS.acts, 5000);
});

test('markers: duplicate, keyless and unknown-kind rows are dropped; a bad date reads as no date', () => {
  const markers = normalizeDelegationLineMarkers([
    { key: 'ask|sam|d9', kind: 'ask', pairKey: 'sam', taskId: 't1', state: 'unique', summary: 's', at: T1 },
    { key: 'ask|sam|d9', kind: 'ask' },
    { key: '', kind: 'ask' },
    { key: 'k2', kind: 'other' },
    7,
    { key: 'obs|sam|d9|ambiguous', kind: 'observation', at: 'bad' },
  ]);
  assert.deepEqual(markers, [
    { key: 'ask|sam|d9', kind: 'ask', pairKey: 'sam', taskId: 't1', state: 'unique', summary: 's', at: T1 },
    { key: 'obs|sam|d9|ambiguous', kind: 'observation', pairKey: '', taskId: null, state: '', summary: '', at: null },
  ]);
  assert.deepEqual(normalizeDelegationLineMarkers('nonsense'), []);
  const overCap = Array.from({ length: R.DELEGATION_LINE_LIMITS.markers + 3 }, (_, i) => ({ key: `k${i}`, kind: 'ask' }));
  const capped = normalizeDelegationLineMarkers(overCap);
  assert.equal(capped.length, R.DELEGATION_LINE_LIMITS.markers);
  assert.equal(capped[0].key, 'k3', 'the oldest markers are the ones dropped');
});

test('matrix read partitions the stored workload exactly and CSV prints the same computed figures', async () => {
  const { createEmptyState, normalizeState } = await import('../../app/core/schema.js');
  const { buildDelegationLines, delegationLineCsvRows } = await import('../../app/core/domain/delegationLines.js');
  const raw = createEmptyState(T2);
  raw.people = [
    { id: 'dir', name: 'Director', level: 'director', managerId: null, status: 'active' },
    { id: 'fm', name: 'Functional manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'pm', name: 'Project manager', level: 'manager', managerId: 'dir', status: 'active' },
    { id: 'sam', name: 'Sam', level: 'ic', managerId: 'fm', status: 'active' },
  ];
  const lineBase = { declaredAt: T1, fromISO: '2026-01-01', toISO: null, note: '', history: [] };
  raw.reportingLines = [
    { ...lineBase, id: 'homealloc', personId: 'sam', managerId: 'fm', kind: 'functional', shareH: 50, rights: ['assignment'] },
    { ...lineBase, id: 'projectline', personId: 'sam', managerId: 'pm', kind: 'project', shareH: 50, rights: [] },
  ];
  raw.delegations = Array.from({ length: 7 }, (_, i) => ({ id: `ask${i}`, personId: 'sam', title: `Ask ${i}`, expectedOutcome: 'Done', authority: 'act-inform', delegatedOn: '2026-11-01', dueOn: '2026-11-20', status: 'active', checkins: [], createdAt: T1 }));
  raw.delegationLineActs = [
    { id: 'act0', delegationId: 'ask0', personId: 'sam', lineId: 'home:sam', managerId: 'fm', lineKind: 'functional', basis: 'declared', byId: null, at: T2 },
    { id: 'act1', delegationId: 'ask1', personId: 'sam', lineId: 'projectline', managerId: 'pm', lineKind: 'project', basis: 'declared', byId: null, at: T2 },
  ];
  const { state, warnings } = normalizeState(raw, { now: new Date(T2) });
  assert.deepEqual(warnings, []);
  const before = JSON.stringify(state);
  const report = buildDelegationLines(state, { now: new Date(T2) });
  assert.equal(JSON.stringify(state), before, 'read mutates no stored byte');
  assert.equal(report.board.asksReadN, 7);
  assert.deepEqual(report.board.classes, { attributed: 2, 'sole-line': 0, 'rule-issued': 0, unattributed: 5, stale: 0 });
  assert.equal(report.board.verdicts.overloaded, 1);
  assert.equal(report.board.classesReconcile, true);
  assert.equal(report.board.verdictsReconcile, true);
  assert.equal(report.board.linesReconcile, true);
  assert.equal(report.board.charterReconcile, true);
  const [csv] = delegationLineCsvRows(report);
  assert.equal(csv.asks_read, report.board.asksReadN);
  assert.equal(csv.asks_attributed, report.board.classes.attributed);
  assert.equal(csv.asks_unattributed, report.board.classes.unattributed);
  assert.equal(csv.verdict_overloaded, report.board.verdicts.overloaded);
  assert.equal(csv.classes_reconcile, true);
});
