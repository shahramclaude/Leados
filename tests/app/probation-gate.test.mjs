/**
 * tests/app/probation-gate.test.mjs — the kernel suite for ADR-0233 (Probation
 * Confirmation Gate Register, `RULE-PBG-01`).
 *
 * Pure over (state, now): no store, no seat, no DOM. Every expected state
 * comes from the acts the fixture declares, never from a stored copy — the
 * same discipline the kernel enforces on the real record.
 *
 * The fixture is deliberately matrixed: Jo reports home to Marta and on a
 * declared project line to Priya, so the evidence duty can only be satisfied
 * when BOTH lines have carried evidence — and a confirmation that arrives
 * while one line is silent is refused, not averaged.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProbationGates } from '../../app/core/domain/probationGate.js';
import {
  normalizeProbationActs,
  normalizeProbationGates,
  normalizeProbationMarkers,
} from '../../app/core/domain/probationGateSchema.js';
import {
  PBG_FLAGS,
  PBG_STATE_KEYS,
} from '../../app/core/domain/probationRegistry.js';
import { PBG_WINDOW_BUCKETS } from '../../app/core/domain/probationGateMath.js';

const iso = '2026-01-01T09:00:00.000Z';

const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
const line = (id, personId, managerId, kind = 'functional') => ({ id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '', status: 'active', history: [] });

function state(overrides = {}) {
  return {
    people: [
      person('ceo', 'Cleo Executive', 'vp', null),
      person('marta', 'Marta Home', 'manager', 'ceo'),
      person('priya', 'Priya Project', 'manager', 'ceo'),
      person('jo', 'Jo Joiner', 'ic', 'marta'),
    ],
    reportingLines: [
      line('rl-marta-ceo', 'marta', 'ceo'),
      line('rl-priya-ceo', 'priya', 'ceo'),
      line('rl-jo-marta', 'jo', 'marta'),
      line('rl-jo-priya', 'jo', 'priya', 'project'),
    ],
    probationGates: [],
    probationActs: [],
    probationMarkers: [],
    settings: {},
    ...overrides,
  };
}

function gate(overrides = {}) {
  return {
    id: 'pbg-1',
    joinerId: 'jo',
    roleLabel: 'Payments analyst',
    startOn: '2026-10-01',
    endOn: '2026-12-01',
    expectations: 'Run the payment reconciliation without supervision and raise the first two anomalies through the declared route.',
    instrument: 'contract',
    instrumentRef: 'EMP-2026-114 §3 prøvetid',
    allowsExtension: true,
    legalCapDays: 180,
    noticeDays: 14,
    declaredById: 'marta',
    createdAt: iso,
    ...overrides,
  };
}

const ask = (overrides = {}) => ({
  id: 'pba-1', gateId: 'pbg-1', actorId: 'marta', kind: 'ask',
  lineKind: 'matrix', lineId: 'rl-jo-priya', lineHolderId: 'priya',
  dueOn: '2026-11-20',
  note: 'Priya has seen the daily delivery work the home line cannot see; the ask covers delivery against the declared expectations.',
  askedAt: '2026-10-05T10:00:00.000Z',
  ...overrides,
});
const submitHome = (overrides = {}) => ({
  id: 'pba-2', gateId: 'pbg-1', actorId: 'marta', kind: 'submit',
  lineKind: 'home', lineId: null, lineHolderId: null,
  observedText: 'Jo ran the October reconciliation solo on the 14th and 28th and raised both anomalies through the route on the same day.',
  recommendation: 'support',
  submittedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});
const submitMatrix = (overrides = {}) => ({
  id: 'pba-3', gateId: 'pbg-1', actorId: 'priya', kind: 'submit',
  lineKind: 'matrix', lineId: 'rl-jo-priya', lineHolderId: 'priya',
  observedText: 'Jo delivered the integration slice on time in weeks 3 and 5; the review comments were addressed within a day each time.',
  recommendation: 'support',
  submittedAt: '2026-11-15T10:00:00.000Z',
  ...overrides,
});
const decide = (overrides = {}) => ({
  id: 'pba-4', gateId: 'pbg-1', actorId: 'marta', kind: 'decide',
  lineKind: null, lineId: null, lineHolderId: null,
  decision: 'confirm',
  reason: 'Both lines carry dated evidence inside the window; the concerns raised in week 2 were resolved and re-verified on the record.',
  decidedAt: '2026-11-25T10:00:00.000Z',
  ...overrides,
});

const NOW = new Date('2026-11-16T10:00:00.000Z');

test('the state machine walks declared → evidence-gathering → evidence-complete → decided-confirmed on two lines', () => {
  const asOf = (s) => buildProbationGates(s, { now: NOW }).rows[0]?.state;
  const withGate = state({ probationGates: [gate()] });
  assert.equal(asOf(withGate), 'declared', 'a fresh gate reads declared');
  assert.equal(buildProbationGates(withGate, { now: NOW }).rows[0].lines.length, 2, 'the home line and the declared matrix line both carry the duty');

  const asked = { ...withGate, probationActs: [ask()] };
  assert.equal(asOf(asked), 'evidence-gathering', 'an ask makes the duty visible');
  const lineOf = (s, kind) => buildProbationGates(s, { now: NOW }).rows[0].lines.find((l) => l.lineKind === kind);
  assert.equal(lineOf(asked, 'matrix').lineState, 'asked');
  assert.equal(lineOf(asked, 'matrix').askDueOn, '2026-11-20');

  const homeIn = { ...asked, probationActs: [ask(), submitHome()] };
  assert.equal(asOf(homeIn), 'evidence-gathering', 'home evidence alone does not complete a matrixed duty');
  const bothIn = { ...homeIn, probationActs: [ask(), submitHome(), submitMatrix()] };
  assert.equal(asOf(bothIn), 'evidence-complete');
  assert.equal(buildProbationGates(bothIn, { now: NOW }).rows[0].confirmable, true);

  const decided = { ...bothIn, probationActs: [ask(), submitHome(), submitMatrix(), decide()] };
  assert.equal(asOf(decided), 'decided-confirmed');
  const row = buildProbationGates(decided, { now: NOW }).rows[0];
  assert.equal(row.closed, true);
  assert.equal(row.decidedOn, '2026-11-25');
  assert.equal(row.unnotified, true, 'decided is not told until the notification act');
  assert.deepEqual(row.flags, [PBG_FLAGS.unnotified]);
});

test('a single-chain joiner (no declared matrix lines) owes only the home evidence', () => {
  const solo = state({
    reportingLines: [line('rl-marta-ceo', 'marta', 'ceo'), line('rl-jo-marta', 'jo', 'marta')],
    probationGates: [gate()],
    probationActs: [submitHome()],
  });
  const row = buildProbationGates(solo, { now: NOW }).rows[0];
  assert.equal(row.lines.length, 1);
  assert.equal(row.state, 'evidence-complete');
  assert.equal(row.confirmable, true);
});

test('a window whose day passes with no decision reads lapsed — the register never defaults it', () => {
  const past = state({
    probationGates: [gate({ endOn: '2026-11-10' })],
    probationActs: [ask(), submitHome(), submitMatrix()],
  });
  const row = buildProbationGates(past, { now: NOW }).rows[0];
  assert.equal(row.state, 'lapsed-no-decision');
  assert.equal(row.lapsed, true);
  assert.ok(row.flags.includes(PBG_FLAGS.lapsed));
  assert.equal(row.confirmable, true, 'the evidence is complete; what is missing is the decision');
  assert.equal(buildProbationGates(past, { now: NOW }).counts.lapsed, 1);
  assert.equal(buildProbationGates(past, { now: NOW }).counts.windows.past, 1);
});

test('the on-time rate counts a decision inside the window and never counts a lapse', () => {
  const one = state({ probationGates: [gate()], probationActs: [ask(), submitHome(), submitMatrix(), decide()] });
  const k = buildProbationGates(one, { now: NOW });
  // decided 2026-11-25 is in the future of NOW 2026-11-16 → window not yet passed; owed = 0
  assert.equal(k.counts.rates.decidedInsideWindow.owed, 0);
  assert.equal(k.counts.rates.decidedInsideWindow.onTimeBp, null, 'no published denominator, no rate');

  const two = state({
    probationGates: [
      gate({ id: 'pbg-a', endOn: '2026-11-01', joinerId: 'jo' }),
      gate({ id: 'pbg-b', endOn: '2026-11-01', joinerId: 'priya', declaredById: 'ceo' }),
    ],
    probationActs: [
      submitHome({ id: 'pba-a1', gateId: 'pbg-a', submittedAt: '2026-10-20T10:00:00.000Z' }),
      decide({ id: 'pba-a2', gateId: 'pbg-a', decidedAt: '2026-10-28T10:00:00.000Z' }),
      // pbg-b carries no decision at all: lapsed.
    ],
    reportingLines: [
      line('rl-marta-ceo', 'marta', 'ceo'),
      line('rl-priya-ceo', 'priya', 'ceo'),
      line('rl-jo-marta', 'jo', 'marta'),
      line('rl-priya-ceo2', 'priya', 'ceo'),
    ],
  });
  const k2 = buildProbationGates(two, { now: NOW });
  assert.equal(k2.counts.rates.decidedInsideWindow.owed, 2, 'both windows have passed');
  assert.equal(k2.counts.rates.decidedInsideWindow.onTime, 1, 'only pbg-a decided inside its window');
  assert.equal(k2.counts.rates.decidedInsideWindow.onTimeBp, 5000, 'floor basis points: 1 of 2');
  assert.equal(k2.counts.lapsed, 1);
});

test('an extension moves the window and closes nothing; evidence must be dated inside the extended window to confirm', () => {
  const extended = {
    ...state({ probationGates: [gate()] }),
    probationActs: [
      ask(),
      submitHome({ submittedAt: '2026-11-10T10:00:00.000Z' }),
      submitMatrix({ submittedAt: '2026-11-15T10:00:00.000Z' }),
      {
        id: 'pba-9', gateId: 'pbg-1', actorId: 'marta', kind: 'extend',
        lineKind: null, lineId: null, lineHolderId: null,
        reason: 'The integration slice slipped two weeks on a vendor outage; the extension covers the re-run and a second review.',
        newEndOn: '2026-12-20',
        extendedAt: '2026-11-14T10:00:00.000Z',
      },
    ],
  };
  const row = buildProbationGates(extended, { now: NOW }).rows[0];
  assert.equal(row.effectiveEndOn, '2026-12-20', 'the window in force is the extension’s');
  assert.equal(row.extendCount, 1);
  assert.equal(row.extendedOn, '2026-11-14');
  assert.equal(row.state, 'evidence-gathering', 'the pre-extension evidence no longer qualifies');
  assert.equal(row.confirmable, false, 'evidence dated before the extension says nothing about the extended window');
  assert.equal(row.windowBucket, '31+', 'open windows bucket by days remaining (34 days to the extended day)');
  const refreshed = {
    ...extended,
    probationActs: [...extended.probationActs,
      submitHome({ id: 'pba-10', submittedAt: '2026-12-10T10:00:00.000Z' }),
      submitMatrix({ id: 'pba-11', submittedAt: '2026-12-12T10:00:00.000Z' })],
  };
  const row2 = buildProbationGates(refreshed, { now: NOW }).rows[0];
  assert.equal(row2.state, 'evidence-complete', 'fresh evidence inside the extended window completes the duty');
  const decided = {
    ...refreshed,
    probationActs: [...refreshed.probationActs, decide({ decidedAt: '2026-12-18T10:00:00.000Z' })],
  };
  const row3 = buildProbationGates(decided, { now: NOW }).rows[0];
  assert.equal(row3.state, 'decided-confirmed');
  assert.equal(row3.decidedOn, '2026-12-18');
  assert.equal(row3.daysRemaining, 34, 'NOW still has 34 days to the extended day; the decision is recorded inside the window');
});

test('directional disagreement is surfaced, never averaged: a confirmation over a concern carries its flag', () => {
  const mixed = state({
    probationGates: [gate()],
    probationActs: [ask(), submitHome(), submitMatrix({ recommendation: 'concern' }), decide()],
  });
  const row = buildProbationGates(mixed, { now: NOW }).rows[0];
  assert.equal(row.state, 'decided-confirmed', 'the weighing is the manager’s recorded decision, not the register’s');
  assert.ok(row.flags.includes(PBG_FLAGS.confirmedOverConcern), 'the confirmation is printed as one made over a line’s concern');
  assert.equal(row.concernCount, 1);

  const unresolved = state({
    probationGates: [gate()],
    probationActs: [ask(), submitHome(), submitMatrix({ recommendation: 'unresolved' }), decide()],
  });
  const row2 = buildProbationGates(unresolved, { now: NOW }).rows[0];
  assert.ok(row2.flags.includes(PBG_FLAGS.confirmedOverUnresolved), 'a “cannot say” is a different fact from a concern, and carries its own flag');
  assert.equal(row2.unresolvedReadingCount, 1);
});

test('the notification duty: decided-unnotified is printed and closes only on the dated act', () => {
  const base = state({ probationGates: [gate()], probationActs: [ask(), submitHome(), submitMatrix(), decide()] });
  const row = buildProbationGates(base, { now: NOW }).rows[0];
  assert.equal(row.unnotified, true);
  const told = {
    ...base,
    probationActs: [...base.probationActs, {
      id: 'pba-5', gateId: 'pbg-1', actorId: 'marta', kind: 'notify',
      lineKind: null, lineId: null, lineHolderId: null,
      instrumentRef: 'Confirmation letter 2026-11-26, sent by HR post',
      notifiedAt: '2026-11-26T10:00:00.000Z',
    }],
  };
  const row2 = buildProbationGates(told, { now: NOW }).rows[0];
  assert.equal(row2.unnotified, false);
  assert.equal(row2.notifiedOn, '2026-11-26');
  assert.deepEqual(row2.flags, [], 'a confirmed, communicated gate owes nothing');
});

test('a hand-edited malformed row is dropped and counted, never repaired', () => {
  const dirty = state({
    probationGates: [gate(), { id: 'hand-edited', joinerId: 'ghost', endOn: 'yesterday' }],
    probationActs: [ask(), { id: 'orphan', gateId: 'no-such-gate', actorId: 'marta', kind: 'decide', decision: 'confirm', reason: 'nobody recorded this', decidedAt: iso }],
    probationMarkers: [{ key: 'dup', at: iso, detail: 'x' }, { key: 'dup', at: iso, detail: 'y' }],
  });
  const k = buildProbationGates(dirty, { now: NOW });
  assert.equal(k.rows.length, 1, 'the malformed gate is not in the population');
  assert.ok(k.counts.droppedRows >= 2, 'the gate and the orphan act are both counted');
  assert.equal(k.figuresComplete, false, 'an incomplete register never prints complete figures');
  assert.ok(k.warnings.some((w) => /Probation gates/.test(w)));
  assert.ok(k.warnings.some((w) => /Probation gate acts/.test(w)));
});

test('a declared window that exceeds its own declared cap is refused by the loader, never repaired', () => {
  const outOfCap = normalizeProbationGates([gate({ startOn: '2026-10-01', endOn: '2027-01-15', legalCapDays: 90 })], []);
  assert.equal(outOfCap.length, 0, 'a 106-day window against a 90-day cap is not stored as given');
  const inCap = normalizeProbationGates([gate()], []);
  assert.equal(inCap.length, 1, 'the 61-day window under a 180-day cap is stored');
  const noCap = normalizeProbationGates([gate({ legalCapDays: null })], []);
  assert.equal(noCap.length, 1);
});

test('normalization is idempotent: the loader accepts its own output byte for byte', () => {
  const gates = normalizeProbationGates([gate()], []);
  const acts = normalizeProbationActs([ask(), submitHome(), submitMatrix(), decide()], gates, []);
  const markers = normalizeProbationMarkers([{ key: 'k1', at: iso, detail: 'An observation a human can read.' }], []);
  const again = normalizeProbationActs(normalizeProbationActs(acts, gates, []), gates, []);
  assert.deepEqual(again, acts, 'acts re-normalize to themselves');
  const gatesAgain = normalizeProbationGates(normalizeProbationGates(gates, []), []);
  assert.deepEqual(gatesAgain, gates);
  const markersAgain = normalizeProbationMarkers(normalizeProbationMarkers(markers, []), []);
  assert.deepEqual(markersAgain, markers);
  assert.equal(JSON.stringify(acts[0].askedAt), JSON.stringify(acts[0].at), 'the raw timestamp key survives beside the uniform `at`');
});

test('the kernel never mutates its input', () => {
  const input = state({ probationGates: [gate()], probationActs: [ask(), submitHome(), submitMatrix(), decide()] });
  const before = JSON.stringify(input);
  buildProbationGates(input, { now: NOW });
  assert.equal(JSON.stringify(input), before, 'derived nothing is stored and the input is never mutated');
});

test('a declared line that carried an ask but no longer resolves is printed, never substituted', () => {
  const withdrawn = state({
    probationGates: [gate()],
    probationActs: [ask()],
  });
  withdrawn.reportingLines = withdrawn.reportingLines.filter((l) => l.id !== 'rl-jo-priya');
  const row = buildProbationGates(withdrawn, { now: NOW }).rows[0];
  assert.ok(row.flags.includes(PBG_FLAGS.lineUnresolved), 'the ask’s line is gone from the graph and the register says so');
  assert.equal(row.lines.some((l) => l.lineKind === 'matrix' && l.lineId === 'rl-jo-priya'), false, 'the dead line does not silently become a live duty');
});

test('a joiner who is no longer active is flagged, not dropped', () => {
  const archived = state({
    probationGates: [gate()],
    probationActs: [],
    people: [
      person('ceo', 'Cleo Executive', 'vp', null),
      person('marta', 'Marta Home', 'manager', 'ceo'),
      person('priya', 'Priya Project', 'manager', 'ceo'),
      { ...person('jo', 'Jo Joiner', 'ic', 'marta'), status: 'archived' },
    ],
  });
  const row = buildProbationGates(archived, { now: NOW }).rows[0];
  assert.ok(row.flags.includes(PBG_FLAGS.joinerUnresolved));
  assert.equal(row.joinerActive, false);
  assert.equal(row.joinerName, 'Jo Joiner', 'the name the roster still carries is printed');
});

test('counts partition cleanly and the printed states add to the total', () => {
  const mixed = state({
    probationGates: [
      gate({ id: 'pbg-1' }),
      gate({ id: 'pbg-2', joinerId: 'priya', declaredById: 'ceo', endOn: '2026-11-01' }),
    ],
    probationActs: [ask(), submitHome(), submitMatrix()],
  });
  const k = buildProbationGates(mixed, { now: NOW });
  assert.equal(k.counts.gates, 2);
  const sum = PBG_STATE_KEYS.reduce((acc, key) => acc + k.counts.byState[key], 0);
  assert.equal(sum, k.counts.gates, 'the state partition sums to the gate total');
  assert.equal(k.partitionReconciles, true);
  assert.equal(k.counts.open, 2);
  assert.equal(k.counts.closed, 0);
  for (const bucket of PBG_WINDOW_BUCKETS) {
    assert.ok(k.counts.windows[bucket.key] !== undefined, `bucket ${bucket.key} is always printed`);
  }
});

test('an ask that names nobody and an unreadable decision are refused; ordering stays the reader’s job', () => {
  const acts = normalizeProbationActs([
    ask({ id: 'a1' }),
    ask({ id: 'a2', lineHolderId: 'leader' }),
    submitHome({ id: 'a3', submittedAt: '2025-01-01T10:00:00.000Z' }),
    decide({ id: 'a4', decision: 'maybe' }),
  ], normalizeProbationGates([gate()], []), []);
  assert.deepEqual(acts.map((a) => a.id), ['a1', 'a3'], 'the synthetic leader and the unreadable decision are refused; a datable act is kept for the reader to order, as the loader convention has it');
  // The READER refuses to let pre-window evidence qualify: a submission dated
  // before the window started is not evidence about the window.
  const withGate = state({ probationGates: [gate()], probationActs: [ask(), submitHome({ submittedAt: '2025-01-01T10:00:00.000Z' }), submitMatrix({ submittedAt: '2025-01-02T10:00:00.000Z' })] });
  const row = buildProbationGates(withGate, { now: NOW }).rows[0];
  assert.equal(row.confirmable, false, 'pre-window evidence never qualifies');
  assert.equal(row.state, 'evidence-gathering');
});
