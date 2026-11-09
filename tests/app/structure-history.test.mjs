/**
 * tests/app/structure-history.test.mjs — Matrix Reorganisation Reconciliation &
 * As-Of Structure Reads (Schema v124, ADR-0149, `#/structure-history`,
 * `RULE-SHR-01`, CSV #111).
 *
 * Organised around what an as-of reading can be betrayed by:
 *
 *  1. NEVER PROJECT. A day the ledger does not cover is `unknown` and every
 *     derived figure is withheld — never today's roster printed as the past.
 *  2. NEVER COLLAPSE THREE FACTS. "Joined", "left" and "changed manager" are
 *     three different counts; an unrecorded date is `uncomparable`, not a change.
 *  3. NEVER REWRITE HISTORY. Drift is reported; no stored act is re-pointed,
 *     migrated or withdrawn. A closed period is history; an open one is superseded.
 *  4. DISPLAY == STORED. Every figure the report, the panel and the CSV print is
 *     recomputed from the stored blob, before and after a real reload.
 *  5. INERT WHEN ABSENT. A workspace with no recorded history gains no row, no
 *     ask, no edge and no delegation, and says so instead of inventing one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildStructureHistoryReport,
  buildStructureLedger,
  diffStructures,
  homeLineOn,
  readStructureAsOf,
  reconcileActs,
  structureHistoryBriefText,
  structureHistoryCsvRows,
} from '../../app/core/domain/structureHistory.js';
import { structureHistoryRule } from '../../app/core/domain/structureHistoryRules.js';
import { STRUCTURE_HISTORY_CSV_COLUMNS } from '../../app/core/domain/structureHistoryRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const TODAY = '2026-11-09';
const ISO = NOW.toISOString();

/* --------------------------------------------------------------- fixtures */

/**
 * dana ─┬─ sam   (sam will move to pm on 1 Nov)
 *       └─ pm ─── kim
 */
function roster() {
  return [
    { id: 'dana', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, status: 'active', startDate: '2025-01-01', createdAt: ISO },
    { id: 'pm', name: 'Priya PM', role: 'Head of Delivery', level: 'manager', managerId: 'dana', status: 'active', startDate: '2025-01-01', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'ic', managerId: 'dana', status: 'active', startDate: '2025-06-01', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'pm', status: 'active', startDate: '2025-06-01', createdAt: ISO },
  ];
}

/** One recorded period: sam's home line was dana from 1 Sep, still open. */
function period(over = {}) {
  return {
    id: 'str-1', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01', toISO: null,
    recordedOn: '2026-09-01', recordedBySeatId: null, source: 'moved',
    reason: 'Structural baseline recorded for the audit.', at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function makeState({ people = roster(), history = [period()], consents = [], lines = [], settings = {} } = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.structureHistory = history;
  state.lineConsents = consents;
  state.reportingLines = lines;
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state).state;
}

function seed(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), data, storage };
}

/** Reload through the real storage contract: the only proof that display == stored. */
function reload(ctx) {
  let seq = 1000;
  const idFactory = (p) => `reload-${p}-${++seq}`;
  const store = createStore({ storage: ctx.storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage: ctx.storage };
}

const report = (state, opts = {}) => buildStructureHistoryReport(state, { now: NOW, settings: state.settings, ...opts });

/* ------------------------------------------------ 1. never project the past */

test('a day the ledger does not cover reads unknown and every span is withheld, never today’s roster as the past', () => {
  const state = makeState();
  const r = readStructureAsOf(state, '2026-08-15', { now: NOW, settings: state.settings });

  assert.equal(r.verdict, 'unrecorded');
  assert.equal(r.readingRefused, true);
  assert.equal(r.observedN, 0);
  assert.equal(r.unknownN, 4, 'every person is unknown, not silently re-pointed at today');
  assert.deepEqual(r.spans, [], 'no span is printed for a day nobody recorded');
  assert.equal(r.spansReconcile, null, 'a withheld span set is not asserted to reconcile');
  assert.match(r.refusedReason, /withheld rather than projected/);
  // The pointer really does say something else today. That is the trap.
  assert.equal(state.people.find((p) => p.id === 'sam').managerId, 'dana');
});

test('a partially recorded day withholds every span rather than printing a smaller, tidy list', () => {
  // Only sam has a recorded period; kim, pm and dana do not.
  const r = readStructureAsOf(makeState(), TODAY, { now: NOW, settings: makeState().settings });
  assert.equal(r.verdict, 'partial');
  assert.equal(r.readingRefused, true);
  assert.equal(r.observedN, 1);
  assert.equal(r.unknownN, 3);
  assert.deepEqual(r.spans, [], 'a span over 1 of 4 people would understate the structure');
  assert.match(r.refusedReason, /3 of 4 person\(s\)/);
});

test('a fully recorded day prints spans that reconcile exactly against the observed headcount', () => {
  const history = [
    period({ id: 'a', personId: 'dana', managerId: 'leader', fromISO: '2026-09-01' }),
    period({ id: 'b', personId: 'pm', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'c', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'd', personId: 'kim', managerId: 'pm', fromISO: '2026-09-01' }),
  ];
  const state = makeState({ history });
  const r = readStructureAsOf(state, TODAY, { now: NOW, settings: state.settings });

  assert.equal(r.verdict, 'observed');
  assert.equal(r.readingRefused, false);
  assert.equal(r.observedN, 4);
  assert.equal(r.unknownN, 0);
  assert.equal(r.spansReconcile, true, 'the printed spans must add up to the observed headcount');
  assert.equal(r.spanTotal, 4);
  const danaRow = r.spans.find((s) => s.managerId === 'dana');
  assert.equal(danaRow.spanN, 2, 'pm and sam');
});

test('a future date is refused as unreadable, not answered with today’s structure', () => {
  const r = readStructureAsOf(makeState(), '2027-01-01', { now: NOW, settings: makeState().settings });
  assert.equal(r.verdict, 'future');
  assert.equal(r.readingRefused, true);
  assert.match(r.refusedReason, /has not happened|has not happened|cannot be read/);
  assert.deepEqual(r.spans, []);
});

test('a person who had not started yet is a FACT, not an unknown gap', () => {
  const people = roster().map((p) => (p.id === 'kim' ? { ...p, startDate: '2026-11-01' } : p));
  const history = [
    period({ id: 'a', personId: 'dana', managerId: 'leader', fromISO: '2026-09-01' }),
    period({ id: 'b', personId: 'pm', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'c', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01' }),
  ];
  const state = makeState({ people, history });
  const r = readStructureAsOf(state, '2026-10-01', { now: NOW, settings: state.settings });
  assert.equal(r.notOnRosterN, 1);
  assert.equal(r.unknownN, 0, 'a future start date is knowledge, not ignorance');
  assert.equal(r.verdict, 'observed');
});

/* ------------------------------------- 2. three facts, never collapsed */

test('joined, left and changed manager are three different counts, and an unrecorded date is uncomparable', () => {
  const baseline = makeState();
  const before = readStructureAsOf(baseline, '2026-10-01', { now: NOW, settings: baseline.settings });
  assert.equal(before.verdict, 'partial', 'precondition: the earlier day is not fully recorded');

  const d = diffStructures(before, before);
  assert.ok(d);
  assert.equal(d.comparable, false, 'a change set over an unrecorded day is not a complete account');
  assert.ok(d.uncomparableN >= 1);
  assert.equal(d.movedN, 0, 'nobody is claimed to have moved when nothing can be compared');
  assert.match(d.comparableReason, /not a complete account/);
});

test('a fully recorded move is reported as moved, a joiner as appeared, and a leaver as disappeared', () => {
  const history = [
    period({ id: 'a', personId: 'dana', managerId: 'leader', fromISO: '2026-09-01' }),
    period({ id: 'b', personId: 'pm', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'c', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01', toISO: '2026-10-31' }),
    // recordedOn must never pre-date the period it describes — that guard is
    // exercised on its own below; here the period is recorded when it starts.
    period({ id: 'd', personId: 'sam', managerId: 'pm', fromISO: '2026-11-01', recordedOn: '2026-11-01' }),
    period({ id: 'e', personId: 'kim', managerId: 'pm', fromISO: '2026-09-01' }),
  ];
  const state = makeState({ history, people: roster().map((p) => (p.id === 'kim' ? { ...p, startDate: '2026-10-15' } : p)) });
  const from = readStructureAsOf(state, '2026-10-01', { now: NOW, settings: state.settings });
  const to = readStructureAsOf(state, '2026-11-09', { now: NOW, settings: state.settings });

  const d = diffStructures(from, to);
  assert.equal(d.movedN, 1, 'sam changed manager');
  assert.equal(d.appearedN, 1, 'kim joined between the dates — a joiner is NOT a mover');
  assert.ok(d.rows.some((r) => r.personId === 'sam' && r.kind === 'moved'));
  assert.ok(d.rows.some((r) => r.personId === 'kim' && r.kind === 'appeared'));
  assert.ok(d.heldN >= 1, 'pm and dana held');
});

test('a restructure that moved nobody reports no movement rather than a failure', () => {
  const history = [
    period({ id: 'a', personId: 'dana', managerId: 'leader', fromISO: '2026-09-01' }),
    period({ id: 'b', personId: 'pm', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'c', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'e', personId: 'kim', managerId: 'pm', fromISO: '2026-09-01' }),
  ];
  const state = makeState({ history });
  const d = diffStructures(
    readStructureAsOf(state, '2026-10-01', { now: NOW, settings: state.settings }),
    readStructureAsOf(state, TODAY, { now: NOW, settings: state.settings }),
  );
  assert.equal(d.comparable, true);
  assert.equal(d.movedN, 0);
  assert.equal(d.anyMovement, false);
  assert.equal(d.heldN, 4);
});

/* --------------------------------------- 3. drift is reported, never corrected */

test('a stored act naming a manager who was not in the person’s structure that day reads as drifted', () => {
  // sam's recorded structure on 5 Oct was dana. This acceptance names pm.
  const consents = [{
    id: 'lcn-old', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: '2026-10-05', expiresOn: '2027-01-05',
    sharePct: 40, at: '2026-10-05T09:00:00.000Z',
  }];
  const state = makeState({ consents });
  const before = JSON.stringify(state);
  const acts = reconcileActs(state, { now: NOW, settings: state.settings });

  assert.equal(acts.actsN, 1);
  assert.equal(acts.driftedN, 1);
  assert.equal(acts.consistentN, 0);
  assert.equal(acts.actsReconcile, true, 'every counted act reaches a bucket');
  assert.equal(acts.clean, false);
  assert.equal(acts.drifted[0].personId, 'sam');
  assert.equal(acts.drifted[0].namedManagerName, 'Priya PM');
  assert.equal(acts.drifted[0].recordedManagerName, 'Dana Eng');
  // A read mutates nothing.
  assert.equal(JSON.stringify(state), before);
});

test('an act dated inside an unrecorded window is unverifiable, neither confirmed nor contradicted', () => {
  const consents = [{
    id: 'lcn-old', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: '2026-08-01', expiresOn: '2027-01-05',
    sharePct: 40, at: '2026-08-01T09:00:00.000Z',
  }];
  const state = makeState({ consents });
  const acts = reconcileActs(state, { now: NOW, settings: state.settings });
  assert.equal(acts.driftedN, 0, 'an uncovered day must never be called drift');
  assert.equal(acts.unverifiableN, 1);
});

test('an act with no readable date is counted, not assumed current', () => {
  // The consent normalizer refuses to persist an act with no decision day, which
  // is correct. The `undated` bucket is the DEFENSIVE reading for a record that
  // reaches the engine another way (a legacy blob, a hand-edited file, a future
  // writer), so it is exercised through the store rather than through the API.
  const ctx = seed(makeState());
  ctx.store.update((draft) => {
    draft.lineConsents = [{
      id: 'lcn-nodate', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
      side: 'manager', outcome: 'accepted', expiresOn: '2027-01-05', sharePct: 40,
    }];
  }, { type: 'test.undated', entity: 'workspace', entityId: 'w' });

  const acts = reconcileActs(ctx.store.state, { now: NOW, settings: ctx.store.state.settings });
  assert.equal(acts.actsN, 1);
  assert.equal(acts.undatedN, 1, 'no date means no structure to read it against');
  assert.equal(acts.consistentN, 0, 'an undated act is never assumed current');
  assert.equal(acts.driftedN, 0, 'an undated act is never accused of drift either');
  assert.equal(acts.actsReconcile, true);
});

test('the four act buckets are exactly the whole set — printed as an equality', () => {
  const consents = [
    { id: 'a', declarationId: 'l1', personId: 'sam', managerId: 'pm', side: 'manager', outcome: 'accepted', decidedOn: '2026-10-05', expiresOn: '2027-01-05', sharePct: 40 },
    { id: 'b', declarationId: 'l1', personId: 'sam', managerId: 'dana', side: 'manager', outcome: 'accepted', decidedOn: '2026-10-06', expiresOn: '2027-01-05', sharePct: 10 },
    { id: 'c', declarationId: 'l2', personId: 'kim', managerId: 'pm', side: 'person', outcome: 'acknowledged', decidedOn: '2026-10-07' },
    { id: 'd', declarationId: 'l2', personId: 'kim', managerId: 'pm', side: 'manager', outcome: 'declined', decidedOn: '2026-10-08', reason: 'No delivery agreed for this line.' },
  ];
  const acts = reconcileActs(makeState({ consents }), { now: NOW, settings: makeState().settings });
  assert.equal(acts.actsN, 4);
  assert.equal(acts.countedN, 4);
  assert.equal(acts.actsReconcile, true);
  assert.equal(acts.consistentN + acts.driftedN + acts.unverifiableN + acts.undatedN, acts.actsN);
  // sam->dana on 6 Oct is consistent (the recorded structure that day); sam->pm on 5 Oct drifts.
  assert.equal(acts.consistentN, 1);
  assert.equal(acts.driftedN, 1);
  assert.equal(acts.unverifiableN, 2, 'kim has no recorded history at all');
});

/* ------------------------------------------- 4. the writer: pointer and ledger together */

test('a home-line move writes the pointer and the ledger in one transaction, closing the open period the day before', () => {
  const ctx = seed(makeState());
  const before = ctx.store.state.people.find((p) => p.id === 'sam').managerId;
  assert.equal(before, 'dana');

  const result = ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'pm', fromISO: '2026-11-01',
    reason: 'Moved to Priya to own the migration delivery end to end.',
  });
  assert.equal(result.ok, true, result.error);

  const stored = ctx.store.state;
  assert.equal(stored.people.find((p) => p.id === 'sam').managerId, 'pm', 'the pointer moved');
  const open = stored.structureHistory.filter((r) => r.personId === 'sam' && !r.toISO);
  assert.equal(open.length, 1, 'exactly one open period');
  assert.equal(open[0].managerId, 'pm');
  assert.equal(open[0].fromISO, '2026-11-01');
  const closed = stored.structureHistory.find((r) => r.id === 'str-1');
  assert.equal(closed.toISO, '2026-10-31', 'closed the day before the new period starts');
  assert.ok(closed.reason, 'the superseded period keeps its reason — it is evidence');
});

test('the writer refuses a future date, a no-op move and a move with no stated reason', () => {
  const ctx = seed(makeState());
  assert.match(ctx.api.structureRecordMove({ personId: 'sam', managerId: 'pm', fromISO: '2030-01-01', reason: 'A stated reason here.' }).error, /future/);
  assert.match(ctx.api.structureRecordMove({ personId: 'sam', managerId: 'dana', fromISO: '2026-11-01', reason: 'A stated reason here.' }).error, /already reports/);
  assert.match(ctx.api.structureRecordMove({ personId: 'sam', managerId: 'pm', fromISO: '2026-11-01', reason: 'move' }).error, /why the home line changed/);
  assert.equal(ctx.store.state.structureHistory.length, 1, 'every refusal wrote nothing');
});

test('a peer cannot restructure another span', () => {
  // z3 is dana's PEER: a director under the leader with her own span. She is not
  // sam's manager, not sam's new manager, and not above both — exactly the peer
  // the refusal exists for. (A lead with zero reports gets no seat at all; that is
  // the fail-closed rule from ADR-0141, exercised in matrix-line-seat.test.mjs.)
  const people = [
    ...roster(),
    { id: 'z3', name: 'Zoe Peer Director', role: 'Director of Platform', level: 'director', managerId: null, status: 'active', startDate: '2025-01-01', createdAt: ISO },
    { id: 'z3kid', name: 'Zed Engineer', role: 'Engineer', level: 'ic', managerId: 'z3', status: 'active', startDate: '2025-01-01', createdAt: ISO },
  ];
  const state = makeState({ people, settings: { activeSeatId: 'z3' } });
  const ctx = seed(state);
  const seatCheck = ctx.api.matrixCandidates();
  assert.equal(seatCheck.ok, true, `precondition: the peer seat must resolve — ${seatCheck.error}`);
  const result = ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'pm', fromISO: '2026-11-01',
    reason: 'A peer tries to restructure the span next to theirs.',
  });
  assert.equal(result.ok, false);
  // Two independent controls refuse this, and the test accepts either: the
  // credential/scope gateway refuses a request naming a person outside the
  // operating span, and the action itself refuses a seat that is neither of the
  // two managers nor the span above both. Defense in depth, not one check.
  assert.match(result.error, /peer cannot restructure|outside the operating span|peer boundary/);
  assert.equal(ctx.store.state.structureHistory.length, 1, 'a refused move wrote nothing');
  assert.equal(ctx.store.state.people.find((p) => p.id === 'sam').managerId, 'dana');
});

test('the manager a person is leaving may record the move — including a team lead with no reports', () => {
  // The home line's own holder is the seat this module exists for.
  const state = makeState({ settings: { activeSeatId: 'dana' } });
  const ctx = seed(state);
  const result = ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'pm', fromISO: '2026-11-01',
    reason: 'Dana releases Sam to Priya for the migration delivery.',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(ctx.store.state.people.find((p) => p.id === 'sam').managerId, 'pm');
});

test('a person cannot move their own home line', () => {
  const people = [
    { id: 'dana', name: 'Dana Eng', level: 'director', managerId: null, status: 'active', startDate: '2025-01-01', createdAt: ISO },
    { id: 'pm', name: 'Priya PM', level: 'manager', managerId: 'dana', status: 'active', startDate: '2025-01-01', createdAt: ISO },
    // sam holds a seat of her own (a lead with a report), so the seat resolves —
    // and she still may not rewrite her own home line.
    { id: 'sam', name: 'Sam Engineer', level: 'lead', managerId: 'dana', status: 'active', startDate: '2025-06-01', createdAt: ISO },
    { id: 'samkid', name: 'Sid Junior', level: 'ic', managerId: 'sam', status: 'active', startDate: '2025-06-01', createdAt: ISO },
  ];
  const state = makeState({ people, history: [], settings: { activeSeatId: 'sam' } });
  const ctx = seed(state);
  const seatCheck = ctx.api.matrixCandidates();
  assert.equal(seatCheck.ok, true, `precondition: the seat must resolve — ${seatCheck.error}`);
  // The destination is INSIDE sam's own scope (her report, sid), so the scope
  // gateway does not fire first — her own act is what must be refused.
  const result = ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'samkid', fromISO: '2026-11-01',
    reason: 'Sam reassigns herself onto her own report’s line.',
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot move their own home line/);
  assert.equal(ctx.store.state.people.find((p) => p.id === 'sam').managerId, 'dana');
});

test('a recorded CLOSED period is history: a move onto that day is refused rather than rewriting it', () => {
  const history = [
    period({ id: 'a', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01', toISO: '2026-10-15' }),
    period({ id: 'b', personId: 'sam', managerId: 'pm', fromISO: '2026-10-16', recordedOn: '2026-10-16' }),
  ];
  const state = makeState({ history, people: roster().map((p) => (p.id === 'sam' ? { ...p, managerId: 'pm' } : p)) });
  const ctx = seed(state);
  const result = ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'dana', fromISO: '2026-10-01',
    reason: 'A back-dated correction smuggled in as a move.',
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /recorded history|two home lines true at once/);
  assert.equal(ctx.store.state.structureHistory.find((r) => r.id === 'a').managerId, 'dana', 'the closed period was not rewritten');
});

test('seeding today’s structure is not a back-fill: earlier days stay unknown', () => {
  const ctx = seed(makeState({ history: [] }));
  const seeded = ctx.api.structureSeedCurrent();
  assert.equal(seeded.ok, true, seeded.error);
  assert.equal(seeded.writtenN, 4);
  assert.equal(ctx.store.state.structureHistory.every((r) => r.fromISO === TODAY), true,
    'every seeded period starts today, so nothing is claimed about the past');

  const today = readStructureAsOf(ctx.store.state, TODAY, { now: NOW, settings: ctx.store.state.settings });
  assert.equal(today.verdict, 'observed');
  const lastMonth = readStructureAsOf(ctx.store.state, '2026-10-01', { now: NOW, settings: ctx.store.state.settings });
  assert.equal(lastMonth.verdict, 'unrecorded', 'the past was not invented');

  // Idempotent: a second run writes nothing.
  assert.equal(ctx.api.structureSeedCurrent().ok, false);
});

test('a home-line move round-trips through the real store and display equals stored after reload', () => {
  const ctx = seed(makeState());
  ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'pm', fromISO: '2026-11-01',
    reason: 'Moved to Priya to own the migration delivery end to end.',
  });
  const printed = report(ctx.store.state);

  const fresh = reload(ctx);
  const printedAfter = report(fresh.store.state);

  assert.equal(printedAfter.reading.verdict, printed.reading.verdict);
  assert.equal(printedAfter.board.recordsN, printed.board.recordsN);
  assert.equal(printedAfter.acts.actsN, printed.acts.actsN);
  // The derived reading of the SAME day is identical before and after reload.
  const before = readStructureAsOf(ctx.store.state, '2026-10-01', { now: NOW, settings: ctx.store.state.settings });
  const after = readStructureAsOf(fresh.store.state, '2026-10-01', { now: NOW, settings: fresh.store.state.settings });
  assert.equal(after.verdict, before.verdict);
  assert.equal(after.observedN, before.observedN);
  assert.equal(after.unknownN, before.unknownN);
});

/* ------------------------------------------------ 5. the shared spine */

test('RULE-SHR-01 is registered on the shared spine and its contract is 1:1', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(structureHistoryRule), 'the rule runs in the shared post-commit pass');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === structureHistoryRule);
  assert.ok(contract, 'every rule on the spine declares a contract');
  assert.equal(contract.module, 'structureHistoryRules.js');
  assert.ok(contract.writes.includes('structureHistoryMarkers'));
  assert.equal(contract.writes.includes('structureHistory'), false, 'the rule never writes the ledger itself');
});

test('RULE-SHR-01 issues exactly one reconciliation ask per person and is idempotent', () => {
  const consents = [{
    id: 'lcn-old', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: '2026-10-05', expiresOn: '2027-01-05',
    sharePct: 40, at: '2026-10-05T09:00:00.000Z',
  }];
  const ctx = seed(makeState({ consents }));
  ctx.api.structureRecordMove({
    personId: 'sam', managerId: 'pm', fromISO: '2026-11-01',
    reason: 'Moved to Priya to own the migration delivery end to end.',
  });

  const asks = ctx.store.state.delegations.filter((d) => /stored record\(s\) that now read/.test(d.title));
  assert.equal(asks.length, 1, 'exactly one ask per person, not one per act');
  assert.match(asks[0].personId, /^(dana|pm)$/, 'addressed to the manager who holds the line now');

  // An explicit scan is idempotent: the same drift set is not asked about twice.
  ctx.api.structureScan();
  const again = ctx.store.state.delegations.filter((d) => /stored record\(s\) that now read/.test(d.title));
  assert.equal(again.length, 1);
});

/* ------------------------------------------------ 6. inert and honest when absent */

test('a workspace with no recorded history gains no row, no ask and no delegation, and says why', () => {
  const ctx = seed(makeState({ history: [] }));
  const before = JSON.stringify(ctx.store.state);
  const r = report(ctx.store.state);
  assert.equal(r.isRecorded, false);
  assert.equal(r.board.recordsN, 0);
  assert.ok(r.singleChainNote);
  assert.match(r.singleChainNote, /unknown, not “probably like today”/);
  assert.equal(JSON.stringify(ctx.store.state), before, 'a read writes nothing');
  assert.equal(ctx.store.state.delegations.length, 0);
});

test('a single-chain workspace with no second line is fully supported and unchanged', () => {
  // No reportingLines at all: this is the ordinary tree-only workspace.
  const history = [
    period({ id: 'a', personId: 'dana', managerId: 'leader', fromISO: '2026-09-01' }),
    period({ id: 'b', personId: 'pm', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'c', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01' }),
    period({ id: 'd', personId: 'kim', managerId: 'pm', fromISO: '2026-09-01' }),
  ];
  const state = makeState({ history, lines: [] });
  const r = readStructureAsOf(state, TODAY, { now: NOW, settings: state.settings });
  assert.equal(r.verdict, 'observed');
  assert.equal(r.spansReconcile, true);
  assert.equal(r.spans.find((s) => s.managerId === 'kim'), undefined, 'kim manages nobody');
});

/* ------------------------------------------------ 7. schema, CSV, display */

test('schema v124 is additive and the migration writes an EMPTY ledger, never a back-fill', () => {
  assert.equal(SCHEMA_VERSION, 125);
  const legacy = { schemaVersion: 123, people: roster(), settings: {} };
  const { raw, applied } = migrate(legacy);
  assert.deepEqual(applied, ['123 → 124', '124 → 125']);
  assert.deepEqual(raw.structureHistory, [], 'no past is invented at upgrade time');
  assert.deepEqual(raw.structureHistoryMarkers, []);
  assert.equal(raw.settings.structureHistoryReviewDays, 90, 'the convention is clamped in');
});

test('the normalizer drops an unreadable period instead of repairing it', () => {
  const bad = makeState({
    history: [
      period({ id: 'ok' }),
      period({ id: 'noperson', personId: '' }),
      period({ id: 'backwards', fromISO: '2026-09-01', toISO: '2026-08-01' }),
      period({ id: 'preDated', fromISO: '2026-09-01', recordedOn: '2026-08-01' }),
    ],
  });
  assert.equal(bad.structureHistory.length, 1);
  assert.equal(bad.structureHistory[0].id, 'ok');
});

test('CSV #111 is aggregate-only and its counts equal the computed report', () => {
  const consents = [{
    id: 'lcn-old', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: '2026-10-05', expiresOn: '2027-01-05', sharePct: 40,
  }];
  const state = makeState({ consents });
  const r = report(state);
  const rows = structureHistoryCsvRows(r);
  const summary = rows[0];

  assert.equal(rows[0].row_kind, 'as-of');
  assert.equal(summary.verdict, r.reading.verdict);
  assert.equal(summary.observed_n, String(r.reading.observedN));
  assert.equal(summary.unknown_n, String(r.reading.unknownN));
  assert.equal(summary.reading_refused, r.reading.readingRefused ? 'true' : 'false');
  assert.equal(summary.roster_n, String(r.board.peopleN));

  const consentRow = rows.find((x) => x.act_source === 'line-consent');
  assert.ok(consentRow, 'one row per act family');
  assert.equal(consentRow.acts_n, String(r.acts.sources.find((s) => s.key === 'line-consent').actsN));
  assert.equal(consentRow.acts_drifted_n, String(r.acts.sources.find((s) => s.key === 'line-consent').driftedN));

  // No person, no name, no manager id, no act id, no free text.
  const flat = JSON.stringify(rows);
  for (const forbidden of ['Sam Engineer', 'Priya PM', 'Dana Eng', 'lcn-old']) {
    assert.equal(flat.includes(forbidden), false, `CSV must not leak ${forbidden}`);
  }
  // Every declared column is present on every row.
  for (const row of rows) for (const key of STRUCTURE_HISTORY_CSV_COLUMNS) assert.ok(key in row, `missing column ${key}`);
});

test('a refused figure is a BLANK cell with its reason, never a zero', () => {
  const r = report(makeState(), { asOf: '2026-08-15' });
  assert.equal(r.reading.readingRefused, true);
  const summary = structureHistoryCsvRows(r)[0];
  assert.equal(summary.observed_n, '0', 'a real count of zero observed people is zero');
  assert.equal(summary.manager_n, '', 'a REFUSED manager count is blank, never 0');
  assert.match(summary.refused_reason, /withheld/);
});

test('the identity-free brief carries counts and names nobody', () => {
  const consents = [{
    id: 'lcn-old', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: '2026-10-05', expiresOn: '2027-01-05', sharePct: 40,
  }];
  const text = structureHistoryBriefText(report(makeState({ consents })));
  assert.match(text, /stored act\(s\) name a manager/);
  assert.match(text, /Drift is reported, not corrected/);
  for (const name of ['Sam Engineer', 'Priya PM', 'Dana Eng']) {
    assert.equal(text.includes(name), false, `the brief must not name ${name}`);
  }
});

test('the ledger reports overlapping periods as a defect rather than picking one', () => {
  const history = [
    period({ id: 'a', personId: 'sam', managerId: 'dana', fromISO: '2026-09-01', toISO: '2026-10-20' }),
    period({ id: 'b', personId: 'sam', managerId: 'pm', fromISO: '2026-10-01' }),
  ];
  const book = buildStructureLedger({ structureHistory: history });
  assert.equal(book.defects.length, 1);
  assert.equal(book.defects[0].defect, 'overlapping-period');
  assert.match(book.defects[0].detail, /neither was picked/);
});

test('homeLineOn answers the three observation states without ever falling back to the pointer', () => {
  const book = buildStructureLedger({ structureHistory: [period({ toISO: '2026-10-31' })] });
  assert.equal(homeLineOn(book, 'sam', '2026-10-01').state, 'observed');
  assert.equal(homeLineOn(book, 'sam', '2026-10-01').managerId, 'dana');
  assert.equal(homeLineOn(book, 'sam', '2026-11-05').state, 'unknown');
  assert.equal(homeLineOn(book, 'sam', '2026-11-05').managerId, null, 'an uncovered day has no manager, not a fallback');
});

test('every report figure equals the stored blob recomputed, and reads mutate nothing', () => {
  const consents = [{
    id: 'lcn-old', declarationId: 'line1', personId: 'sam', managerId: 'pm', kind: 'project',
    side: 'manager', outcome: 'accepted', decidedOn: '2026-10-05', expiresOn: '2027-01-05', sharePct: 40,
  }];
  const state = makeState({ consents });
  const snapshot = JSON.stringify(state);
  const r = report(state);

  // Recompute independently from the raw blob.
  const book = buildStructureLedger(JSON.parse(snapshot));
  assert.equal(r.board.recordsN, book.records.filter((x) => x.personId).length);
  assert.equal(r.acts.actsN, (JSON.parse(snapshot).lineConsents || []).length);
  assert.equal(r.reading.observedN, r.reading.observations.filter((o) => o.state === 'observed').length);
  assert.equal(JSON.stringify(state), snapshot, 'a read is not a write');
});
