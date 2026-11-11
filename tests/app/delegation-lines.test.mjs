/**
 * Cross-Line Ask Attribution — FOUNDATION ONLY (Session 242, 2026-11-11).
 *
 * This suite covers exactly what exists: the closed vocabulary
 * (`delegationLineRegistry.js`) and the fail-closed stored-shape normalizers
 * (`delegationLineSchema.js`). Neither module is wired into the schema, the
 * post-commit spine, the gateway, the CSV exports or a view yet, so nothing here
 * asserts a schema version, a rule count, a CSV scope or a panel — those belong
 * to the remaining slices listed under "In Progress" in ROADMAP.md.
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

test('honest status: the foundation is NOT wired into the workspace schema yet', () => {
  // These two assertions are meant to FAIL the day the stored shape is wired:
  // that commit must replace them with the real registration checks (schema
  // version, empty migration, spine parity, gateway, seat policy, panel, CSV).
  assert.equal(COLLECTIONS.includes('delegationLineActs'), false);
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'delegationLineBudget'), false);
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
