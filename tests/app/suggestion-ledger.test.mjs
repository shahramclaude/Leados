// ADR-0227 — Frontline improvement-suggestion ledger (kaizen teian, RULE-KZT-01).
//
// The claims this suite exists to prove:
//
//   1. a suggestion closes only through the three keys in order — route triage,
//      the named owner's claim after acceptance, and an independent confirmation
//      by someone other than the owner — and nothing closes it by the passage of time;
//   2. on a SHARED route (matrix: several apexes above the submitter's lines) every
//      member must decide the same way, with the same owner and target day; any
//      disagreement is printed as a split, and nobody is picked as the decider;
//   3. every refused act is counted, printed with its reason, and never applied;
//      a second triage, claim or confirmation never overwrites the first;
//   4. the derived state is a pure function of the stored record and the injected
//      clock: the input order of acts does not change the output, and the input is
//      never mutated;
//   5. a malformed row is dropped and counted; nothing is repaired (no route, owner,
//      deadline or wording invented); the synthetic `leader` seat is never accepted;
//   6. overdue flags are separate from the state, and an overdue response never
//      triages a suggestion;
//   7. the printed state counts are re-derived here, independently, from hand-built
//      fixtures whose outcome is known by construction.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSuggestionLedger } from '../../app/core/domain/suggestionLedger.js';
import { KZT_ADR, KZT_ENGINE_VERSION, KZT_LIMITS, KZT_REFUSALS, KZT_RULE_ID, KZT_STATE_KEYS } from '../../app/core/domain/suggestionRegistry.js';

const NOW = '2026-11-16T12:00:00.000Z';
const SUBMITTED = '2026-11-10T08:00:00.000Z';
const RESPOND_BY = '2026-11-14T08:00:00.000Z';
const DECIDED = '2026-11-11T09:00:00.000Z';
const TEXT = 'Label reprint wastes two minutes at every changeover on the line';
const PROPOSAL = 'Pre-print the label set at the start of the shift and keep it at the station';

const suggestion = (overrides = {}) => ({
  id: 'sug-1',
  areaRef: 'Line 3 packing',
  problemText: TEXT,
  proposalText: PROPOSAL,
  submitterId: 'ana',
  routeIds: ['mgr-a'],
  submittedAt: SUBMITTED,
  responseByAt: RESPOND_BY,
  ...overrides,
});

const triage = (id, suggestionId, actorId, decision, extra = {}) => ({
  id,
  kind: 'triage',
  suggestionId,
  actorId,
  decision,
  reason: 'The route considered the trade-off against the controlled-label rule and decided',
  decidedAt: DECIDED,
  ...(decision === 'accept' ? { ownerId: 'ben', targetDay: '2026-11-20' } : {}),
  ...extra,
});
const claim = (id, suggestionId, actorId, at = '2026-11-12T09:00:00.000Z') => ({
  id,
  kind: 'claim',
  suggestionId,
  actorId,
  effectText: 'Changeover label waste dropped; observed on two shifts by the owner',
  claimedAt: at,
});
const confirm = (id, suggestionId, actorId, at = '2026-11-13T09:00:00.000Z') => ({
  id,
  kind: 'confirm',
  suggestionId,
  actorId,
  note: 'I watched the next three changeovers myself from the station',
  confirmedAt: at,
});

const ledger = (suggestions, acts = [], now = NOW) => buildSuggestionLedger({ suggestions, suggestionActs: acts }, { now });
const rowOf = (report, id) => report.rows.find((row) => row.id === id);
const refusalsFor = (report, id) => report.refusals.filter((row) => row.suggestionId === id).map((row) => row.reason);

test('ADR-0227 identity: the engine, ADR and rule ids are the declared constants', () => {
  assert.equal(KZT_ADR, 'ADR-0227');
  assert.equal(KZT_RULE_ID, 'RULE-KZT-01');
  assert.match(KZT_ENGINE_VERSION, /^kaizen-teian-/);
});

test('a single-route suggestion closes only through triage, claim and an independent confirmation', () => {
  const base = [suggestion()];
  assert.equal(rowOf(ledger(base), 'sug-1').state, 'awaiting-triage');

  const accepted = ledger(base, [triage('t1', 'sug-1', 'mgr-a', 'accept')]);
  assert.equal(rowOf(accepted, 'sug-1').state, 'accepted-awaiting-claim');
  assert.equal(rowOf(accepted, 'sug-1').ownerId, 'ben');

  const claimed = ledger(base, [triage('t1', 'sug-1', 'mgr-a', 'accept'), claim('c1', 'sug-1', 'ben')]);
  assert.equal(rowOf(claimed, 'sug-1').state, 'claimed-awaiting-confirmation');

  const closed = ledger(base, [
    triage('t1', 'sug-1', 'mgr-a', 'accept'),
    claim('c1', 'sug-1', 'ben'),
    confirm('k1', 'sug-1', 'ana'),
  ]);
  assert.equal(rowOf(closed, 'sug-1').state, 'closed-confirmed');
  assert.equal(rowOf(closed, 'sug-1').confirmedAt, '2026-11-13T09:00:00.000Z');
  assert.equal(closed.partitionReconciles, true);
  assert.equal(closed.figuresComplete, true);
});

test('a decline by the whole route is final, carries its reason, and names no owner', () => {
  const report = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'decline', { reason: 'The reprint is a controlled label and cannot be pre-printed' }),
    claim('c1', 'sug-1', 'ben'),
  ]);
  const row = rowOf(report, 'sug-1');
  assert.equal(row.state, 'declined');
  assert.equal(row.ownerId, null);
  assert.equal(row.decisionReason, 'The reprint is a controlled label and cannot be pre-printed');
  assert.deepEqual(refusalsFor(report, 'sug-1'), [KZT_REFUSALS.notAccepted]);
});

test('a shared route answers only when every member decided the same way with the same owner and day', () => {
  const route = suggestion({ routeIds: ['apex-1', 'apex-2'] });
  const partial = ledger([route], [triage('t1', 'sug-1', 'apex-1', 'accept')]);
  assert.equal(rowOf(partial, 'sug-1').state, 'awaiting-joint-triage');
  assert.equal(rowOf(partial, 'sug-1').ownerId, null, 'an undecided route names no owner');

  const agreed = ledger([route], [
    triage('t1', 'sug-1', 'apex-1', 'accept'),
    triage('t2', 'sug-1', 'apex-2', 'accept'),
  ]);
  assert.equal(rowOf(agreed, 'sug-1').state, 'accepted-awaiting-claim');
});

test('a disagreeing shared route is printed as a split and nobody decides', () => {
  const route = suggestion({ routeIds: ['apex-1', 'apex-2'] });
  const declined = ledger([route], [
    triage('t1', 'sug-1', 'apex-1', 'accept'),
    triage('t2', 'sug-1', 'apex-2', 'decline', { reason: 'Not agreed; the regulated label cannot be pre-printed' }),
    triage('t3', 'sug-1', 'apex-1', 'decline', { reason: 'A later attempt that must not overwrite the split' }),
  ]);
  assert.equal(rowOf(declined, 'sug-1').state, 'triage-split');
  assert.equal(rowOf(declined, 'sug-1').decision, null, 'a split names no decision');
  assert.deepEqual(refusalsFor(declined, 'sug-1'), [KZT_REFUSALS.routeSplit]);

  const ownerMismatch = ledger([route], [
    triage('t1', 'sug-1', 'apex-1', 'accept', { ownerId: 'ben' }),
    triage('t2', 'sug-1', 'apex-2', 'accept', { ownerId: 'cara' }),
  ]);
  assert.equal(rowOf(ownerMismatch, 'sug-1').state, 'triage-split', 'two different owners are a split, not a winner');
});

test('a triage from outside the declared route is refused and the state does not move', () => {
  const report = ledger([suggestion()], [triage('t1', 'sug-1', 'someone-else', 'accept')]);
  assert.equal(rowOf(report, 'sug-1').state, 'awaiting-triage');
  assert.deepEqual(refusalsFor(report, 'sug-1'), [KZT_REFUSALS.notInRoute]);
  assert.equal(report.figuresComplete, false, 'a refused act makes the figures incomplete');
});

test('the first triage from a route member stands; a second from the same member is refused', () => {
  const report = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'decline', { reason: 'Declined first, with a reason that stands on the record' }),
    triage('t2', 'sug-1', 'mgr-a', 'accept'),
  ]);
  assert.equal(rowOf(report, 'sug-1').state, 'declined');
  assert.deepEqual(refusalsFor(report, 'sug-1'), [KZT_REFUSALS.routeSettled]);

  const twice = ledger([suggestion({ routeIds: ['apex-1', 'apex-2'] })], [
    triage('t1', 'sug-1', 'apex-1', 'accept'),
    triage('t2', 'sug-1', 'apex-1', 'accept'),
  ]);
  assert.deepEqual(refusalsFor(twice, 'sug-1'), [KZT_REFUSALS.alreadyDecided]);
  assert.equal(rowOf(twice, 'sug-1').state, 'awaiting-joint-triage');
});

test('only the named owner may claim, only after acceptance, and only once', () => {
  const notAccepted = ledger([suggestion()], [claim('c1', 'sug-1', 'ben')]);
  assert.deepEqual(refusalsFor(notAccepted, 'sug-1'), [KZT_REFUSALS.notAccepted]);

  const wrongPerson = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'accept'),
    claim('c1', 'sug-1', 'mgr-a'),
  ]);
  assert.equal(rowOf(wrongPerson, 'sug-1').state, 'accepted-awaiting-claim');
  assert.deepEqual(refusalsFor(wrongPerson, 'sug-1'), [KZT_REFUSALS.notOwner]);

  const twice = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'accept'),
    claim('c1', 'sug-1', 'ben', '2026-11-12T09:00:00.000Z'),
    claim('c2', 'sug-1', 'ben', '2026-11-12T10:00:00.000Z'),
  ]);
  assert.deepEqual(refusalsFor(twice, 'sug-1'), [KZT_REFUSALS.alreadyClaimed]);
  assert.equal(rowOf(twice, 'sug-1').claimedAt, '2026-11-12T09:00:00.000Z', 'the first claim stands');
});

test('confirmation is independent: never the owner, never a stranger, never before a claim, once only', () => {
  const base = [triage('t1', 'sug-1', 'mgr-a', 'accept')];

  const beforeClaim = ledger([suggestion()], [...base, confirm('k1', 'sug-1', 'ana', '2026-11-12T08:00:00.000Z'), claim('c1', 'sug-1', 'ben')]);
  assert.deepEqual(refusalsFor(beforeClaim, 'sug-1'), [KZT_REFUSALS.notClaimed]);
  assert.equal(rowOf(beforeClaim, 'sug-1').state, 'claimed-awaiting-confirmation');

  const selfConfirm = ledger([suggestion()], [...base, claim('c1', 'sug-1', 'ben'), confirm('k1', 'sug-1', 'ben')]);
  assert.deepEqual(refusalsFor(selfConfirm, 'sug-1'), [KZT_REFUSALS.selfConfirmation]);
  assert.equal(rowOf(selfConfirm, 'sug-1').state, 'claimed-awaiting-confirmation');

  const stranger = ledger([suggestion()], [...base, claim('c1', 'sug-1', 'ben'), confirm('k1', 'sug-1', 'stranger')]);
  assert.deepEqual(refusalsFor(stranger, 'sug-1'), [KZT_REFUSALS.notConfirmer]);

  const routeMemberConfirms = ledger([suggestion()], [...base, claim('c1', 'sug-1', 'ben'), confirm('k1', 'sug-1', 'mgr-a')]);
  assert.equal(rowOf(routeMemberConfirms, 'sug-1').state, 'closed-confirmed');

  const twice = ledger([suggestion()], [
    ...base,
    claim('c1', 'sug-1', 'ben'),
    confirm('k1', 'sug-1', 'ana', '2026-11-13T09:00:00.000Z'),
    confirm('k2', 'sug-1', 'mgr-a', '2026-11-13T10:00:00.000Z'),
  ]);
  assert.deepEqual(refusalsFor(twice, 'sug-1'), [KZT_REFUSALS.alreadyConfirmed]);
  assert.equal(rowOf(twice, 'sug-1').confirmedAt, '2026-11-13T09:00:00.000Z');
});

test('an act dated before its suggestion was submitted is refused, never applied', () => {
  const report = ledger([suggestion()], [triage('t1', 'sug-1', 'mgr-a', 'accept', { decidedAt: '2026-11-09T09:00:00.000Z' })]);
  assert.equal(rowOf(report, 'sug-1').state, 'awaiting-triage');
  assert.deepEqual(refusalsFor(report, 'sug-1'), [KZT_REFUSALS.beforeSubmission]);
});

test('an overdue response is a printed flag beside the state and never triages the suggestion', () => {
  const late = ledger([suggestion()], [], '2026-11-15T08:00:00.000Z');
  assert.equal(rowOf(late, 'sug-1').state, 'awaiting-triage');
  assert.deepEqual(rowOf(late, 'sug-1').overdue, ['response-overdue']);
  assert.equal(late.counts.overdue.response, 1);

  const onTime = ledger([suggestion()], [], '2026-11-14T07:59:59.000Z');
  assert.deepEqual(rowOf(onTime, 'sug-1').overdue, []);

  const decidedLate = ledger([suggestion()], [triage('t1', 'sug-1', 'mgr-a', 'decline')], '2026-11-15T08:00:00.000Z');
  assert.deepEqual(rowOf(decidedLate, 'sug-1').overdue, [], 'a decided suggestion is not a response overdue');
});

test('an accepted suggestion past its target day with no claim prints target-overdue', () => {
  const report = ledger([suggestion()], [triage('t1', 'sug-1', 'mgr-a', 'accept')], '2026-11-21T10:00:00.000Z');
  assert.equal(rowOf(report, 'sug-1').state, 'accepted-awaiting-claim');
  assert.deepEqual(rowOf(report, 'sug-1').overdue, ['target-overdue']);
  assert.equal(report.counts.overdue.target, 1);

  const claimedLate = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'accept'),
    claim('c1', 'sug-1', 'ben', '2026-11-21T10:00:00.000Z'),
  ], '2026-11-21T10:00:00.000Z');
  assert.deepEqual(rowOf(claimedLate, 'sug-1').overdue, [], 'a claim clears the target flag');
});

test('the derived ledger is independent of act input order and never mutates the input', () => {
  const acts = [
    triage('t1', 'sug-1', 'apex-1', 'accept'),
    triage('t2', 'sug-1', 'apex-2', 'accept'),
    claim('c1', 'sug-1', 'ben'),
    confirm('k1', 'sug-1', 'ana'),
  ];
  const suggestions = [suggestion({ routeIds: ['apex-1', 'apex-2'] })];
  const state = { suggestions, suggestionActs: acts };
  const snapshot = structuredClone(state);
  const forward = buildSuggestionLedger(state, { now: NOW });
  const reversed = buildSuggestionLedger({ suggestions, suggestionActs: [...acts].reverse() }, { now: NOW });
  assert.deepEqual(state, snapshot, 'the input is not mutated');
  assert.deepEqual(forward.rows, reversed.rows);
  assert.deepEqual(forward.counts, reversed.counts);
});

test('an empty or absent record reads as an empty ledger, not an error', () => {
  const empty = buildSuggestionLedger({}, { now: NOW });
  assert.equal(empty.counts.total, 0);
  assert.equal(empty.partitionReconciles, true);
  assert.equal(empty.figuresComplete, true);
  assert.deepEqual(Object.keys(empty.counts.byState).sort(), [...KZT_STATE_KEYS].sort());
});

test('the clock is injected: a missing or invalid now is refused, not defaulted', () => {
  assert.throws(() => buildSuggestionLedger({}, {}), TypeError);
  assert.throws(() => buildSuggestionLedger({}, { now: 'not a time' }), TypeError);
});

test('fail-closed normalization: malformed, self-routed, reserved and over-window rows are dropped and counted', () => {
  const report = ledger([
    suggestion({ id: 'ok' }),
    suggestion({ id: 'self-route', routeIds: ['ana'] }),
    suggestion({ id: 'leader-submitter', submitterId: 'leader' }),
    suggestion({ id: 'dup-route', routeIds: ['mgr-a', 'mgr-a'] }),
    suggestion({ id: 'too-long-window', responseByAt: '2026-12-30T08:00:00.000Z' }),
    suggestion({ id: 'short-text', problemText: 'too short' }),
    suggestion({ id: 'ok' }),
  ]);
  assert.deepEqual(report.rows.map((row) => row.id), ['ok']);
  assert.equal(report.counts.droppedSuggestions, 6);
  assert.equal(report.figuresComplete, false);
  assert.ok(report.warnings.some((text) => text.includes('refused 6')));
});

test('fail-closed normalization: an act with the wrong shape, an orphan, or the leader seat is dropped', () => {
  const report = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'accept', { ownerId: undefined, targetDay: undefined }),
    triage('t2', 'sug-1', 'leader', 'decline'),
    triage('t3', 'missing-suggestion', 'mgr-a', 'decline'),
    triage('t4', 'sug-1', 'mgr-a', 'decline', { ownerId: 'ben' }),
    triage('t5', 'sug-1', 'mgr-a', 'accept', { targetDay: '2026-11-20T00:00:00Z' }),
    triage('t6', 'sug-1', 'mgr-a', 'accept', { targetDay: '2030-01-01' }),
    { id: 'c9', kind: 'claim', suggestionId: 'sug-1', actorId: 'ben', effectText: 'short', claimedAt: '2026-11-12T09:00:00.000Z' },
  ]);
  assert.equal(report.counts.droppedActs, 7);
  assert.equal(rowOf(report, 'sug-1').state, 'awaiting-triage', 'no dropped act was applied');
  assert.equal(report.figuresComplete, false);
});

test('a decline that carries an owner or target is refused as malformed, never repaired', () => {
  const report = ledger([suggestion()], [
    triage('t1', 'sug-1', 'mgr-a', 'decline', { ownerId: 'ben' }),
  ]);
  assert.equal(report.counts.droppedActs, 1);
  assert.equal(rowOf(report, 'sug-1').state, 'awaiting-triage');
});

test('the target window is bounded: a target more than 180 days out is dropped', () => {
  assert.equal(KZT_LIMITS.targetMaxDays, 180);
  const report = ledger([suggestion()], [triage('t1', 'sug-1', 'mgr-a', 'accept', { targetDay: '2027-12-31' })]);
  assert.equal(report.counts.droppedActs, 1);
});

test('printed state counts equal an independent recomputation from hand-built fixtures', () => {
  // Each fixture's outcome is known by construction; the expectation is written
  // here per suggestion, not read back from the reader.
  const expectedById = {
    f1: 'awaiting-triage',
    f2: 'awaiting-joint-triage',
    f3: 'triage-split',
    f4: 'declined',
    f5: 'accepted-awaiting-claim',
    f6: 'claimed-awaiting-confirmation',
    f7: 'closed-confirmed',
    f8: 'closed-confirmed',
  };
  const shared = (id) => suggestion({ id, routeIds: ['apex-1', 'apex-2'] });
  const suggestions = [
    suggestion({ id: 'f1' }),
    shared('f2'),
    shared('f3'),
    suggestion({ id: 'f4', routeIds: ['mgr-b'] }),
    suggestion({ id: 'f5', routeIds: ['mgr-c'] }),
    suggestion({ id: 'f6', routeIds: ['mgr-d'] }),
    suggestion({ id: 'f7', routeIds: ['mgr-e'] }),
    suggestion({ id: 'f8', routeIds: ['mgr-f'] }),
  ];
  const acts = [
    triage('a', 'f2', 'apex-1', 'accept'),
    triage('b', 'f3', 'apex-1', 'accept'),
    triage('c', 'f3', 'apex-2', 'decline', { reason: 'Disagreement recorded for the split fixture here' }),
    triage('d', 'f4', 'mgr-b', 'decline'),
    triage('e', 'f5', 'mgr-c', 'accept'),
    triage('f', 'f6', 'mgr-d', 'accept'),
    claim('g', 'f6', 'ben'),
    triage('h', 'f7', 'mgr-e', 'accept'),
    claim('i', 'f7', 'ben'),
    confirm('j', 'f7', 'ana'),
    triage('k', 'f8', 'mgr-f', 'accept'),
    claim('l', 'f8', 'ben'),
    confirm('m', 'f8', 'mgr-f'),
  ];
  const report = ledger(suggestions, acts);
  for (const row of report.rows) {
    assert.equal(row.state, expectedById[row.id], `state of ${row.id}`);
  }
  const countsFromRows = Object.fromEntries(KZT_STATE_KEYS.map((key) => [key, report.rows.filter((row) => row.state === key).length]));
  assert.deepEqual(report.counts.byState, countsFromRows, 'printed counts equal the rows they summarise');
  assert.equal(report.counts.total, suggestions.length);
  assert.equal(report.partitionReconciles, true);
  assert.equal(report.figuresComplete, true);
});

test('a two-apex shared route is one suggestion and one row, not one per apex', () => {
  const report = ledger([suggestion({ routeIds: ['apex-1', 'apex-2'] })]);
  assert.equal(report.counts.total, 1);
  assert.equal(report.rows.length, 1);
  assert.deepEqual(report.rows[0].routeIds, ['apex-1', 'apex-2']);
});

test('the report carries no per-person ranking, score or recognition field', () => {
  const report = ledger([suggestion()], [triage('t1', 'sug-1', 'mgr-a', 'accept'), claim('c1', 'sug-1', 'ben'), confirm('k1', 'sug-1', 'ana')]);
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /"(score|rank|ranking|recognition|points|leaderboard)"/i);
  assert.equal(report.method.frameworks.length >= 4, true);
});
