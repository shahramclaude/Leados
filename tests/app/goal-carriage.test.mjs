/**
 * tests/app/goal-carriage.test.mjs — Matrix Goal Carriage & Attainment
 * Reconciliation Register, IN PROGRESS (Session 224).
 *
 * Only two leaf modules exist so far — the closed vocabulary and the stance
 * normalizers — and nothing in the app imports them yet. These tests pin the
 * contracts those two modules already make. They deliberately assert nothing
 * about a reader, a rule, a panel, a CSV scope or a schema version, because
 * none of that has been built.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOAL_CARRIAGE_CAUSE_KEYS,
  GOAL_CARRIAGE_CSV_COLUMNS,
  GOAL_CARRIAGE_CSV_DESCRIPTOR,
  GOAL_CARRIAGE_LIMITS,
  GOAL_CARRIAGE_LIVE_STANCES,
  GOAL_CARRIAGE_SPAN_STATES,
  GOAL_CARRIAGE_STANCES,
  GOAL_CARRIAGE_STATES,
  GOAL_CARRIAGE_STATE_KEYS,
  GOAL_CARRIAGE_UNSETTLED_STATES,
  goalCarriageSpanStateMeta,
  goalCarriageStateMeta,
  goalCarriageStateRank,
} from '../../app/core/domain/goalCarriageRegistry.js';
import {
  appendGoalLineStance,
  homeLineId,
  normalizeGoalCarriageMarkers,
  normalizeGoalLineStances,
} from '../../app/core/domain/goalCarriageSchema.js';

function stance(id, extra = {}) {
  return {
    id,
    goalId: 'goal-1',
    lineId: 'rl-sam-priya',
    goalOwnerId: 'sam',
    lineManagerId: 'priya',
    stance: 'carries',
    basis: 'This goal is delivered on the project line.',
    decidedOn: '2026-11-10',
    decidedBySeatId: 'priya',
    at: '2026-11-10T10:00:00.000Z',
    ...extra,
  };
}

test('the carriage vocabulary is closed, ordered worst-first and internally consistent', () => {
  assert.deepEqual(GOAL_CARRIAGE_STATE_KEYS, [
    'unplaced', 'unanchored', 'release-pending', 'unattributed', 'open',
    'joint', 'attributed', 'single-line', 'leader-owned',
  ]);
  assert.equal(new Set(GOAL_CARRIAGE_STATE_KEYS).size, GOAL_CARRIAGE_STATE_KEYS.length);
  for (const s of GOAL_CARRIAGE_STATES) {
    assert.ok(s.label && s.hint && ['bad', 'warn', 'neutral', 'good'].includes(s.tone), `${s.key} is fully described`);
    assert.equal(goalCarriageStateMeta(s.key), s);
  }
  assert.equal(goalCarriageStateMeta('not-a-state'), null, 'an unknown state is never mapped onto a real one');
  assert.equal(goalCarriageStateRank('unplaced'), 0);
  assert.equal(goalCarriageStateRank('leader-owned'), 8);
  assert.equal(goalCarriageStateRank('not-a-state'), GOAL_CARRIAGE_STATES.length, 'an unknown state sorts last');

  // An answer is still owed in exactly the multi-line states that are not settled.
  assert.deepEqual(GOAL_CARRIAGE_UNSETTLED_STATES, ['release-pending', 'unattributed', 'open']);
  for (const key of GOAL_CARRIAGE_UNSETTLED_STATES) {
    const meta = goalCarriageStateMeta(key);
    assert.ok(meta.multiLine && !meta.settled);
  }
  for (const key of ['joint', 'attributed']) {
    const meta = goalCarriageStateMeta(key);
    assert.ok(meta.multiLine && meta.settled, `${key} is a settled multi-line state`);
  }
  // A goal that reaches no span, or no manager, is not a multi-line question.
  for (const key of ['unplaced', 'unanchored', 'single-line', 'leader-owned']) {
    assert.equal(goalCarriageStateMeta(key).multiLine, false);
  }

  assert.deepEqual(GOAL_CARRIAGE_STANCES, ['carries', 'releases', 'withdrawn']);
  assert.deepEqual(GOAL_CARRIAGE_LIVE_STANCES, ['carries', 'releases'], 'a withdrawal is an act, never a standing stance');
  assert.deepEqual(GOAL_CARRIAGE_CAUSE_KEYS, ['unsettled', 'declared-joint', 'upstream-structure']);
  assert.deepEqual(GOAL_CARRIAGE_SPAN_STATES.map((s) => s.key), ['refused', 'unsettled', 'structural', 'declared', 'clean']);
  assert.equal(goalCarriageSpanStateMeta('not-a-reading').key, 'clean');

  assert.equal(new Set(GOAL_CARRIAGE_CSV_COLUMNS).size, GOAL_CARRIAGE_CSV_COLUMNS.length, 'no CSV column is declared twice');
  assert.equal(GOAL_CARRIAGE_CSV_DESCRIPTOR.key, 'goal-carriage');
  assert.equal(GOAL_CARRIAGE_CSV_DESCRIPTOR.sensitive, false);
  for (const frozen of [GOAL_CARRIAGE_STATES, GOAL_CARRIAGE_STATE_KEYS, GOAL_CARRIAGE_STANCES, GOAL_CARRIAGE_CSV_COLUMNS, GOAL_CARRIAGE_LIMITS]) {
    assert.ok(Object.isFrozen(frozen));
  }
});

test('the stance normalizer keeps a valid first-person act verbatim and drops an impossible one without repairing it', () => {
  const warnings = [];
  const kept = normalizeGoalLineStances([
    stance('ok-declared'),
    stance('ok-home', { lineId: homeLineId('sam'), lineManagerId: 'dana', stance: 'releases' }),
    stance('ok-withdrawn', { stance: 'withdrawn', basis: 'Stated in error; taking it back.' }),
    stance('ok-no-at', { at: undefined, basis: `   ${'x'.repeat(400)}   ` }),
    // --- every row below is structurally impossible and must be dropped ---
    stance('own-line', { lineManagerId: 'sam' }),
    stance('foreign-home', { lineId: homeLineId('lee') }),
    stance('bad-stance', { stance: 'claims' }),
    stance('bad-day', { decidedOn: '2026-02-30' }),
    stance('no-basis', { basis: 'short' }),
    stance('withdrawn-no-basis', { stance: 'withdrawn', basis: '' }),
    stance('no-goal', { goalId: '' }),
    stance('ok-declared', { stance: 'releases' }),
    null,
    'not a record',
  ], warnings);

  assert.deepEqual(kept.map((r) => r.id), ['ok-declared', 'ok-home', 'ok-withdrawn', 'ok-no-at']);
  assert.deepEqual(kept[0], {
    id: 'ok-declared',
    goalId: 'goal-1',
    lineId: 'rl-sam-priya',
    goalOwnerId: 'sam',
    lineManagerId: 'priya',
    stance: 'carries',
    basis: 'This goal is delivered on the project line.',
    decidedOn: '2026-11-10',
    decidedBySeatId: 'priya',
    at: '2026-11-10T10:00:00.000Z',
  });
  assert.equal(kept[0].stance, 'carries', 'a duplicate id never overwrites the first act');
  assert.equal(kept[1].lineId, 'home:sam');
  assert.equal(kept[3].at, '2026-11-10T00:00:00.000Z', 'an undated instant falls back to the stated day, not to now');
  assert.equal(kept[3].basis.length, GOAL_CARRIAGE_LIMITS.basisMax, 'the basis is trimmed and bounded');

  assert.equal(warnings.length, 1, 'one printed warning, not one per row');
  assert.match(warnings[0], /dropped 10 /);

  const clean = [];
  assert.deepEqual(normalizeGoalLineStances(undefined, clean), []);
  assert.deepEqual(normalizeGoalLineStances('nonsense', clean), []);
  assert.equal(clean.length, 0, 'an absent ledger is empty, not a warning');
});

test('both ledgers are bounded, and the marker ledger is deduplicated with an unreadable count left unknown', () => {
  const cap = GOAL_CARRIAGE_LIMITS.acts;
  const many = Array.from({ length: cap + 5 }, (_, i) => stance(`act-${i}`));
  const bounded = normalizeGoalLineStances(many, []);
  assert.equal(bounded.length, cap);
  assert.equal(bounded[0].id, 'act-5', 'the oldest acts are the ones evicted');
  assert.equal(bounded[cap - 1].id, `act-${cap + 4}`);

  const list = bounded.slice();
  const returned = appendGoalLineStance(list, stance('newest'));
  assert.equal(returned, list, 'append mutates the draft list it was given');
  assert.equal(list.length, cap, 'the bound holds on write as well as on load');
  assert.equal(list[0].id, 'act-6');
  assert.equal(list[cap - 1].id, 'newest');
  assert.deepEqual(appendGoalLineStance(undefined, stance('first')).map((r) => r.id), ['first']);

  const markers = normalizeGoalCarriageMarkers([
    { key: 'ask|priya|abc', kind: 'ask', lineManagerId: 'priya', taskId: 'dlg-1', goalN: 3, recordedOn: '2026-11-10', summary: 'Issued.' },
    { key: 'ask|priya|abc', kind: 'ask', lineManagerId: 'someone-else', goalN: 99 },
    { key: 'obs|dana', goalN: -4, recordedOn: 'yesterday' },
    { kind: 'ask' },
    null,
  ]);
  assert.equal(markers.length, 2, 'a repeated key and a keyless row are dropped');
  assert.deepEqual(markers[0], {
    key: 'ask|priya|abc', kind: 'ask', lineManagerId: 'priya', taskId: 'dlg-1', goalN: 3, recordedOn: '2026-11-10', summary: 'Issued.',
  });
  assert.deepEqual(markers[1], {
    key: 'obs|dana', kind: 'ask', lineManagerId: '', taskId: '', goalN: null, recordedOn: null, summary: '',
  }, 'a negative count and an unreadable day are left unknown, not turned into 0 or today');
  assert.equal(
    normalizeGoalCarriageMarkers(Array.from({ length: GOAL_CARRIAGE_LIMITS.markers + 3 }, (_, i) => ({ key: `k-${i}` }))).length,
    GOAL_CARRIAGE_LIMITS.markers,
  );
});
