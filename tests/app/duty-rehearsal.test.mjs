/**
 * tests/app/duty-rehearsal.test.mjs — ADR-0128, Schema v117.
 *
 * One focused pass over the built path: cover exercise evidence is tied to an
 * EXPLICIT, dated rehearsal attestation instead of resting on inferred dated
 * work alone. The suite proves the schema's fail-closed drops (a third party
 * cannot invent an observation, a record cannot precede its own rehearsal),
 * the `rehearsed` grade outranking inferred work, the `gaps` grade refusing to
 * certify, the one-transaction write (row + edge + roll-ups + event, decision
 * only on gaps), the enforcement gates (positioned seats only, no operator
 * attestation, bounded lag), derived-not-stored reload parity, the identity
 * wall above rank 2, the seat-scoped ledger read, and the plan-panel render.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat, recordPolicy } from '../../app/core/domain/seat.js';
import { LINK_ENTITY_COLLECTIONS, LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import {
  absenceWindowPlan, buildDutyCoverageReport, dutyCoverageBriefText, dutyCoverageCsvRows,
} from '../../app/core/domain/dutyCoverage.js';
import { buildWindowExerciseIndex, windowExerciseFor } from '../../app/core/domain/dutyWindowExercise.js';
import { normalizeDutyRehearsals } from '../../app/core/domain/dutyRehearsalSchema.js';
import {
  DUTY_REHEARSAL_EVENTS, DUTY_REHEARSAL_LIMITS, DUTY_REHEARSAL_RELATION,
} from '../../app/core/domain/dutyRehearsalRegistry.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-07-04T00:00:00.000Z');
const WINDOW = { from: '2027-07-05', to: '2027-07-09' };
const REHEARSED = '2027-06-28';
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

function people() {
  return [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1' },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1' },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead2' },
  ];
}

function caseRow(id, day, { closed = false, involved = ['ic1', 'mgr1'] } = {}) {
  return {
    id, title: `Case ${id}`, status: closed ? 'resolved' : 'open', ownerId: 'ic1',
    involvedPersonIds: involved, openedOn: day, resolvedOn: closed ? day : null,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), fmea: { severity: 5 },
  };
}

function rehearsalRow(over = {}) {
  return {
    id: 'reh-1', coverRowId: 'cover-1', dutyId: 'lead1|first-signal', dutyKey: 'first-signal',
    seatId: 'lead1', coverSeatId: 'mgr1', recordedBySeatId: 'lead1',
    rehearsedOn: REHEARSED, recordedOn: REHEARSED, recordedAt: `${REHEARSED}T10:00:00.000Z`,
    mode: 'supervised', outcome: 'ready', note: 'Ran the escalation triage end to end on the live board.',
    decisionId: null, status: 'active', revokedOn: null, revokedAt: null, revokeReason: '',
    version: 'duty-rehearsal-2026.11-v1',
    ...over,
  };
}

function makeState({ activeSeatId = 'lead1', cases = [], oneOnOnes = [], absences = [], covers = null, rehearsals = [] } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId,
  };
  state.people = people().map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
  state.cases = cases;
  state.oneOnOnes = oneOnOnes;
  state.absencePlans = absences.map((a, i) => ({
    id: `abs-${i + 1}`, seatId: a.seatId, from: a.from, to: a.to,
    reason: 'A planned absence declared for this window.', note: '', decisionId: null,
    declaredBySeatId: a.seatId, declaredOn: ago(2), declaredAt: NOW.toISOString(),
    status: 'active', revokedOn: null, revokedAt: null, revokeReason: '', version: 'duty-absence-2026.11-v1',
  }));
  const coverRows = covers || [
    { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' },
    { seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' },
  ];
  state.dutyCovers = coverRows.map((c, i) => ({
    id: `cover-${i + 1}`, dutyId: `${c.seatId}|${c.dutyKey}`, seatId: c.seatId,
    dutyKey: c.dutyKey, coverId: c.coverId, note: 'Declared answerable for this duty.',
    decisionId: null, declaredBySeatId: 'mgr1', declaredOn: ago(5), declaredAt: NOW.toISOString(),
    status: c.status || 'active', revokedOn: null, revokedAt: null, revokeReason: '', verifiedOn: null,
    version: 'duty-coverage-2026.11-v1',
  }));
  state.dutyRehearsals = rehearsals;
  return normalizeState(state, { now: NOW }).state;
}

function boot(state) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

function planFor(state, window = WINDOW, seatId = state.settings.activeSeatId, namesVisible = null) {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = built.byId.get(seatId) || activeSeat(built);
  return absenceWindowPlan(state, built, seat, window, { now: NOW, settings: state.settings, namesVisible });
}

function firstSignal(plan) {
  return plan.rows.find((r) => r.key === 'first-signal');
}

/* --------------------------------------------------------------- 1. schema */

test('schema v117 is additive and convergent; an observation nobody was positioned to make is dropped', () => {
  assert.equal(SCHEMA_VERSION, 147);
  const migrated = migrate({ schemaVersion: 116, people: [{ id: 'p1', name: 'A' }], settings: { leaderName: 'Dana' } });
  assert.deepEqual(migrated.applied, ['116 → 117', '117 → 118', '118 → 119', '119 → 120', '120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147']);
  assert.equal(migrated.raw.schemaVersion, 147);
  assert.deepEqual(migrated.raw.dutyRehearsals, [], 'no attestation is invented at upgrade time');
  assert.equal(migrated.raw.settings.leaderName, 'Dana', 'existing settings survive an additive bump');
  assert.deepEqual(migrate(migrated.raw).applied, [], 'convergence, not a loop');

  // The graph vocabulary is declared once and wired to a real collection.
  assert.ok(LINK_ENTITY_TYPES.includes('rehearsal'));
  assert.equal(LINK_ENTITY_COLLECTIONS.rehearsal, 'dutyRehearsals');
  assert.ok(LINK_RELATIONS.includes(DUTY_REHEARSAL_RELATION));
  assert.equal(recordPolicy('dutyRehearsals').classKey, 'unit');

  const covers = [{ id: 'cover-1', dutyId: 'lead1|first-signal', seatId: 'lead1', coverId: 'mgr1' }];
  const roster = people();
  const warnings = [];
  const kept = normalizeDutyRehearsals([
    rehearsalRow(),
    rehearsalRow({ id: 'reh-self', recordedBySeatId: 'mgr1' }),
    rehearsalRow({ id: 'reh-boss', recordedBySeatId: 'vp1' }),
    'not-an-object',
    rehearsalRow({ id: 'reh-bad-mode', mode: 'telepathy' }),
    rehearsalRow({ id: 'reh-no-day', rehearsedOn: 'soon' }),
    rehearsalRow({ id: 'reh-future-record', rehearsedOn: '2027-06-28', recordedOn: '2027-06-20' }),
    rehearsalRow({ id: 'reh-third-party', recordedBySeatId: 'lead2' }),
    rehearsalRow({ id: 'reh-wrong-cover', coverSeatId: 'ic1' }),
    rehearsalRow({ id: 'reh-wrong-duty', dutyId: 'lead1|coach', dutyKey: 'first-signal' }),
  ], covers, roster, warnings);
  const ids = kept.map((r) => r.id);
  assert.deepEqual(ids, ['reh-1', 'reh-self', 'reh-boss'], 'holder, self and supervisor survive; everything else is dropped');
  assert.equal(warnings.length, 7, 'every drop prints its reason');
  assert.ok(warnings.some((w) => /recorded before the rehearsal/i.test(w)));
  assert.ok(warnings.some((w) => /neither the duty, nor the cover, nor a leadership span/i.test(w)));
  assert.ok(warnings.some((w) => /different duty line or a different person/i.test(w)));
});

/* ------------------------------------------------- 2. the rehearsed grade */

test('a ready rehearsal inside the preparation window grades ABOVE inferred work; work alone still grades valid', () => {
  const state = makeState({
    cases: [caseRow('case-valid', '2027-07-01', { closed: true })],
    rehearsals: [rehearsalRow()],
  });
  const plan = planFor(state);
  const row = firstSignal(plan);
  assert.equal(row.windowBand, 'covered');
  assert.equal(row.covers[0].windowExercise.status, 'rehearsed');
  assert.equal(row.covers[0].windowExercise.exercised, true);
  assert.equal(row.covers[0].windowExercise.evidence.kind, 'rehearsal');
  assert.equal(row.covers[0].windowExercise.evidence.mode, 'supervised');
  assert.equal(row.covers[0].windowExercise.evidence.attestation, 'holder');
  assert.equal(row.covers[0].windowExercise.evidence.day, REHEARSED);
  assert.match(row.covers[0].windowExercise.reason, /Explicit rehearsal recorded 2027-06-28/);
  assert.match(row.covers[0].windowExercise.reason, /attested by the duty holder/);
  assert.equal(row.rehearsedAvailableN, 1);
  assert.equal(plan.summary.exercise.rehearsedCoversN, 1);
  assert.equal(plan.summary.exercise.attestedRehearsalsN, 1);
  assert.equal(plan.summary.exercise.validCoversN, 0, 'the graded cover is rehearsed, not merely valid');

  // The coach duty line has the same cover but NO rehearsal: the case in the
  // window is a duty-specific source for first-signal only, so coach reads on
  // its own evidence — the rehearsal never leaks across duty lines.
  const coach = plan.rows.find((r) => r.key === 'coach');
  assert.notEqual(coach.covers[0].windowExercise.status, 'rehearsed');

  // ADR-0125 unchanged: with no rehearsal record at all, inferred work still
  // grades `valid` and covers the line.
  const plain = makeState({ cases: [caseRow('case-valid', '2027-07-04', { closed: true })] });
  const plainRow = firstSignal(planFor(plain));
  assert.equal(plainRow.windowBand, 'covered');
  assert.equal(plainRow.covers[0].windowExercise.status, 'valid');
  assert.equal(plainRow.rehearsedAvailableN, 0);
});

test('the cover’s own record grades rehearsed but prints as self-reported; attestation outranks recency', () => {
  const state = makeState({
    rehearsals: [
      rehearsalRow({ id: 'reh-older', recordedBySeatId: 'lead1', rehearsedOn: '2027-06-10', recordedOn: '2027-06-10', recordedAt: '2027-06-10T09:00:00.000Z' }),
      rehearsalRow({ id: 'reh-self', recordedBySeatId: 'mgr1', rehearsedOn: '2027-06-30', recordedOn: '2027-06-30', recordedAt: '2027-06-30T09:00:00.000Z', mode: 'walkthrough' }),
    ],
  });
  const row = firstSignal(planFor(state));
  const ex = row.covers[0].windowExercise;
  assert.equal(ex.status, 'rehearsed');
  // The newer record is the cover's own; the older is the holder's attestation.
  // Strength beats recency: the graded evidence is the holder-attested one.
  assert.equal(ex.evidence.attestation, 'holder');
  assert.equal(ex.evidence.day, '2027-06-10');
  assert.equal(planFor(state).summary.exercise.attestedRehearsalsN, 1);

  const selfOnly = makeState({ rehearsals: [rehearsalRow({ recordedBySeatId: 'mgr1' })] });
  const selfEx = firstSignal(planFor(selfOnly)).covers[0].windowExercise;
  assert.equal(selfEx.status, 'rehearsed');
  assert.equal(selfEx.evidence.attestation, 'self');
  assert.match(selfEx.reason, /self-reported by the cover/);
  assert.equal(planFor(selfOnly).summary.exercise.selfReportedRehearsalsN, 1);
  assert.equal(planFor(selfOnly).summary.exercise.attestedRehearsalsN, 0);
});

/* ------------------------------------------------------ 3. the gaps grade */

test('a rehearsal that found gaps does NOT certify: the line stays thin and the reason names the drill', () => {
  const state = makeState({
    rehearsals: [rehearsalRow({ outcome: 'gaps', note: 'The night escalation path stalled at the handoff.' })],
  });
  const plan = planFor(state);
  const row = firstSignal(plan);
  assert.equal(row.windowBand, 'thin', 'a gaps drill is practice, not readiness');
  const ex = row.covers[0].windowExercise;
  assert.equal(ex.status, 'gaps');
  assert.equal(ex.exercised, false);
  assert.match(ex.reason, /FOUND GAPS/);
  assert.match(row.windowReason, /A rehearsal inside the window FOUND GAPS/);
  assert.equal(plan.summary.exercise.gapsCoversN, 1);
  assert.equal(plan.summary.exercise.rehearsedCoversN, 0);

  // A ready rehearsal recorded after the gaps drill supersedes it in-window.
  const healed = makeState({
    rehearsals: [
      rehearsalRow({ id: 'reh-gaps', outcome: 'gaps', rehearsedOn: '2027-06-20', recordedOn: '2027-06-20', recordedAt: '2027-06-20T09:00:00.000Z', note: 'Stalled at the handoff.' }),
      rehearsalRow({ id: 'reh-ready', rehearsedOn: '2027-06-30', recordedOn: '2027-06-30', recordedAt: '2027-06-30T09:00:00.000Z' }),
    ],
  });
  const healedRow = firstSignal(planFor(healed));
  assert.equal(healedRow.windowBand, 'covered');
  assert.equal(healedRow.covers[0].windowExercise.status, 'rehearsed');
});

/* ---------------------------------------------------- 4. the write is one transaction */

test('recording a ready rehearsal is ONE transaction: row, attestation edge, roll-ups from the holder, event, no decision', () => {
  const { store, api } = boot(makeState());
  const before = store.state.decisions.length;
  const result = api.dutyRehearsalRecord({
    coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'supervised', outcome: 'ready',
    note: 'Walked the whole triage path on the live board.',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.decisionId, null, 'a certification opens no decision');
  assert.equal(store.state.decisions.length, before);

  const rows = store.state.dutyRehearsals;
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.seatId, 'lead1');
  assert.equal(row.coverSeatId, 'mgr1');
  assert.equal(row.recordedBySeatId, 'lead1');
  assert.equal(row.rehearsedOn, REHEARSED);
  assert.equal(row.mode, 'supervised');
  assert.equal(row.outcome, 'ready');
  assert.equal(row.status, 'active');

  const attest = store.state.links.filter((l) => l.relation === DUTY_REHEARSAL_RELATION);
  assert.equal(attest.length, 1);
  assert.equal(attest[0].sourceType, 'rehearsal');
  assert.equal(attest[0].sourceId, row.id);
  assert.equal(attest[0].targetType, 'dutycover');
  assert.equal(attest[0].targetId, 'cover-1');

  const rollups = store.state.links.filter((l) => l.sourceType === 'rehearsal' && l.relation === 'rolls-up-to');
  assert.deepEqual(rollups.map((l) => l.targetId).sort(), ['dir1', 'lead1', 'mgr1', 'vp1'], 'the holder and every span above, never the synthetic leader');

  const event = store.state.events.find((e) => e.type === DUTY_REHEARSAL_EVENTS.RECORD && e.entityId === row.id);
  assert.ok(event, 'the audit event names the act');
  assert.match(event.summary, /Cover rehearsal recorded/);
});

test('recording gaps quotes the recorder verbatim on a governed decision reviewed by the absence start', () => {
  const { store, api } = boot(makeState({ absences: [{ seatId: 'lead1', from: WINDOW.from, to: WINDOW.to }] }));
  const result = api.dutyRehearsalRecord({
    coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'handover', outcome: 'gaps',
    note: 'The night escalation stalled at the handoff; Jordan could not reach the on-call rota.',
  });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.decisionId);
  const decision = store.state.decisions.find((d) => d.id === result.decisionId);
  assert.ok(decision);
  assert.match(decision.title, /found gaps/);
  assert.ok(decision.question.includes('The night escalation stalled at the handoff; Jordan could not reach the on-call rota.'), 'the recorder’s words, verbatim');
  assert.equal(decision.reviewOn, WINDOW.from, 'reviewed before the absence starts, not after');
  assert.equal(decision.outcome, 'pending');
  const event = store.state.events.find((e) => e.type === DUTY_REHEARSAL_EVENTS.GAPS && e.entityId === result.id);
  assert.ok(event, 'the gaps finding is on the audit trail');
  assert.match(event.summary, /Rehearsal found gaps/);
});

/* ------------------------------------------------------- 5. enforcement */

test('only a seat that was there attests: peer refused, operator refused, bad dates and modes refused', () => {
  // A peer lead holds no position at this duty.
  const peer = boot(makeState({ activeSeatId: 'lead2' }));
  const refused = peer.api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'supervised', outcome: 'ready' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /a seat that was there/i);
  assert.equal(peer.store.state.dutyRehearsals.length, 0);

  // The undeclared operator view observed nothing, so it records nothing.
  const operator = boot(makeState({ activeSeatId: null }));
  const opRefused = operator.api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'supervised', outcome: 'ready' });
  assert.equal(opRefused.ok, false);
  assert.match(opRefused.error, /operator view observed nothing/i);

  const { api, store } = boot(makeState());
  // A future rehearsal is a plan, not an attestation.
  const future = api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: '2027-07-10', mode: 'supervised', outcome: 'ready' });
  assert.equal(future.ok, false);
  assert.match(future.error, /not after today|future|on the day it was run/i);
  // An attestation from memory too far back is refused at the declared lag.
  const lagged = api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: '2027-01-15', mode: 'supervised', outcome: 'ready' });
  assert.equal(lagged.ok, false);
  assert.match(lagged.error, new RegExp(`${DUTY_REHEARSAL_LIMITS.maxRecordLagDays}`));
  // Mode is a declared vocabulary.
  const modeless = api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'vibes', outcome: 'ready' });
  assert.equal(modeless.ok, false);
  assert.match(modeless.error, /walkthrough, shadow, supervised, handover/);
  // Gaps without words leaves the decision empty.
  const wordless = api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'supervised', outcome: 'gaps', note: 'bad' });
  assert.equal(wordless.ok, false);
  assert.equal(wordless.field, 'note');
  // A revoked cover row has no live ask to attest to.
  const revokedCover = boot(makeState({ covers: [{ seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1', status: 'revoked' }] }));
  const dead = revokedCover.api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'supervised', outcome: 'ready' });
  assert.equal(dead.ok, false);
  assert.match(dead.error, /revoked/i);
  assert.equal(store.state.dutyRehearsals.length, 0, 'nothing was written by any refusal');

  // The cover themselves may record (self-reported), and so may the manager above.
  const self = boot(makeState({ activeSeatId: 'mgr1' }));
  const selfResult = self.api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'walkthrough', outcome: 'ready' });
  assert.equal(selfResult.ok, true, selfResult.error);
  assert.equal(selfResult.attestation, 'self');
  const vp = boot(makeState({ activeSeatId: 'vp1' }));
  const vpResult = vp.api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'shadow', outcome: 'ready' });
  assert.equal(vpResult.ok, true, vpResult.error);
  assert.equal(vpResult.attestation, 'supervisor');
});

test('revoking an attestation is append-only and only the recorder (or full access) may do it', () => {
  const { store, api } = boot(makeState({ rehearsals: [rehearsalRow()] }));
  // lead2 did not record it.
  const peerState = normalizeState({ ...JSON.parse(JSON.stringify(store.state)), settings: { ...store.state.settings, activeSeatId: 'lead2' } }, { now: NOW }).state;
  const peer = boot(peerState);
  const refused = peer.api.dutyRehearsalRevoke({ id: 'reh-1', reason: 'I do not believe it.' });
  assert.equal(refused.ok, false);

  const short = api.dutyRehearsalRevoke({ id: 'reh-1', reason: 'no' });
  assert.equal(short.ok, false);
  const done = api.dutyRehearsalRevoke({ id: 'reh-1', reason: 'The rehearsal never actually happened on that day.' });
  assert.equal(done.ok, true, done.error);
  const row = store.state.dutyRehearsals.find((r) => r.id === 'reh-1');
  assert.equal(row.status, 'revoked');
  assert.equal(row.revokedOn, '2027-07-04');
  assert.match(row.revokeReason, /never actually happened/);
  // The revoked attestation no longer grades the window.
  const plan = planFor(store.state);
  assert.equal(firstSignal(plan).covers[0].windowExercise.status, 'missing');
  assert.equal(store.state.dutyRehearsals.length, 1, 'append-only: never deleted');
});

/* --------------------------------------------- 6. out-of-window honesty */

test('an out-of-window rehearsal re-derives honestly: stale before, future after today, and a moved window re-grades', () => {
  const staleState = makeState({ rehearsals: [rehearsalRow({ rehearsedOn: '2027-05-01', recordedOn: '2027-05-01', recordedAt: '2027-05-01T09:00:00.000Z' })] });
  const staleEx = firstSignal(planFor(staleState)).covers[0].windowExercise;
  assert.equal(staleEx.status, 'stale');
  assert.match(staleEx.lastEvidence.typeLabel, /explicit rehearsal/);
  assert.match(staleEx.reason, /before the preparation window/);

  const futureState = makeState({ rehearsals: [rehearsalRow({ rehearsedOn: '2027-07-20', recordedOn: '2027-07-20', recordedAt: '2027-07-20T09:00:00.000Z' })] });
  const futureEx = firstSignal(planFor(futureState)).covers[0].windowExercise;
  assert.equal(futureEx.status, 'future');
  assert.equal(futureEx.exercised, false);

  // Move the absence and the SAME record re-grades with nothing mutated.
  const state = makeState({ rehearsals: [rehearsalRow()] });
  const moved = planFor(state, { from: '2027-09-01', to: '2027-09-05' });
  assert.equal(firstSignal(moved).covers[0].windowExercise.status, 'stale');
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const index = buildWindowExerciseIndex(state, built, built.byId.get('lead1'), { now: NOW, settings: state.settings, duties: built.byId.get('lead1').duties });
  const direct = windowExerciseFor(index, 'first-signal', 'mgr1', WINDOW, { now: NOW, exerciseDays: 30 });
  assert.equal(direct.status, 'rehearsed', 'the same derivation, read directly');
});

/* ------------------------------------------- 7. derived, not stored; reload */

test('nothing about the verdict is stored: a reload re-derives the identical reading and drops an invented observer', () => {
  const { store, api } = boot(makeState({ absences: [{ seatId: 'lead1', from: WINDOW.from, to: WINDOW.to }] }));
  const recorded = api.dutyRehearsalRecord({ coverRowId: 'cover-1', rehearsedOn: REHEARSED, mode: 'supervised', outcome: 'ready', note: 'Full triage walk.' });
  assert.equal(recorded.ok, true, recorded.error);
  const first = planFor(store.state);

  const reloaded = normalizeState(JSON.parse(JSON.stringify(store.state)), { now: NOW }).state;
  const second = planFor(reloaded);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)), 'a reload re-derives the identical reading');

  // A hand-edited file cannot invent an observer, a cover, or a pre-dated record.
  const edited = JSON.parse(JSON.stringify(store.state));
  edited.dutyRehearsals.unshift(rehearsalRow({ id: 'reh-forged', recordedBySeatId: 'lead2', rehearsedOn: '2027-07-01', recordedOn: '2027-07-01', recordedAt: '2027-07-01T09:00:00.000Z' }));
  const warnings = [];
  const cleaned = normalizeState(edited, { now: NOW, warnings }).state;
  assert.ok(!cleaned.dutyRehearsals.some((r) => r.id === 'reh-forged'), 'the third-party attestation is dropped on reload');
  assert.ok(cleaned.dutyRehearsals.some((r) => r.id === recorded.id), 'the real attestation survives');
});

/* --------------------------------------- 8. roll-up, identity wall, brief */

test('rehearsal counts roll up through the report and brief; above rank 2 the record id is withheld and counts survive', () => {
  const state = makeState({
    absences: [{ seatId: 'lead1', from: WINDOW.from, to: WINDOW.to }],
    rehearsals: [rehearsalRow()],
  });

  // The holder's own plan names the record; the same plan above rank 2 does not.
  const named = firstSignal(planFor(state, WINDOW, 'lead1', true));
  assert.equal(named.covers[0].windowExercise.evidence.sourceId, 'reh-1');
  const withheld = firstSignal(planFor(state, WINDOW, 'lead1', false));
  assert.equal(withheld.covers[0].windowExercise.evidence.sourceId, null);
  assert.equal(withheld.covers[0].windowExercise.evidence.mode, 'supervised', 'mode, outcome and attestation strength are not identity');
  assert.equal(withheld.covers[0].windowExercise.status, 'rehearsed');

  const dirState = normalizeState({ ...state, settings: { ...state.settings, activeSeatId: 'dir1' } }, { now: NOW }).state;
  const dirReport = buildDutyCoverageReport(dirState, { now: NOW, settings: dirState.settings });
  assert.ok(dirReport.absences.exercise.rehearsedCoversN >= 1, 'the roll-up counts explicit rehearsals');
  assert.equal(dirReport.absences.exercise.attestedRehearsalsN, dirReport.absences.exercise.rehearsedCoversN);
  const brief = dutyCoverageBriefText(dirReport);
  assert.match(brief, /rehearsed by explicit dated record/);
  assert.match(brief, /1 holder\/supervisor-attested, 0 self-reported/);
  for (const banned of ['Mei Chen', 'Priya Raman', 'reh-1', 'mgr1', 'lead1']) {
    assert.ok(!brief.includes(banned), `the upward brief must not carry ${banned}`);
  }

  // The CSV absence row carries the counts and the row kinds are unchanged.
  const csv = dutyCoverageCsvRows(dirReport);
  const absenceRow = csv.find((r) => r.row_kind === 'absence');
  assert.ok(absenceRow);
  assert.equal(absenceRow.absence_rehearsed_n, 1);
  assert.equal(absenceRow.absence_rehearsal_gaps_n, 0);
  assert.deepEqual([...new Set(csv.map((r) => r.row_kind))].sort(), ['absence', 'branch', 'branch-summary', 'duty', 'register']);
  const serialized = JSON.stringify(csv);
  for (const banned of ['Mei', 'Priya', 'reh-1', 'lead1', 'mgr1']) {
    assert.ok(!serialized.includes(banned), `the CSV must not carry ${banned}`);
  }
});

/* ------------------------------------------- 9. the seat-scoped ledger read */

test('dutyRehearsalList is seat-scoped: the holder and the span above read it, a peer does not', () => {
  const state = makeState({ rehearsals: [rehearsalRow()] });

  const holder = boot(state);
  const holderList = holder.api.dutyRehearsalList();
  assert.equal(holderList.ok, true, holderList.error);
  assert.equal(holderList.rows.length, 1);
  assert.equal(holderList.rows[0].attestation, 'holder');
  assert.equal(holderList.rows[0].coverName, 'Mei Chen', 'names at the frontline altitude');
  assert.equal(holderList.rows[0].canRevoke, true);
  assert.equal(holderList.summary.readyN, 1);

  const peer = boot(normalizeState({ ...JSON.parse(JSON.stringify(state)), settings: { ...state.settings, activeSeatId: 'lead2' } }, { now: NOW }).state);
  const peerList = peer.api.dutyRehearsalList();
  assert.equal(peerList.ok, true, peerList.error);
  assert.equal(peerList.rows.length, 0, 'a peer’s duty rehearsal is outside a peer’s scope');

  const dir = boot(normalizeState({ ...JSON.parse(JSON.stringify(state)), settings: { ...state.settings, activeSeatId: 'dir1' } }, { now: NOW }).state);
  const dirList = dir.api.dutyRehearsalList();
  assert.equal(dirList.rows.length, 1, 'the span above reads the same ledger');
  assert.equal(dirList.namesVisible, false);
  assert.equal(dirList.rows[0].coverName, null, 'names withheld above rank 2');
  assert.equal(dirList.rows[0].note, null, 'notes withheld above rank 2');
  assert.ok(dirList.rows[0].coverLabel, 'the seat label survives the identity wall');
  assert.equal(dirList.rows[0].canRevoke, false, 'only the recorder revokes');

  const selfBoot = boot(normalizeState({ ...JSON.parse(JSON.stringify(state)), settings: { ...state.settings, activeSeatId: 'mgr1' } }, { now: NOW }).state);
  const selfList = selfBoot.api.dutyRehearsalList();
  assert.equal(selfList.rows.length, 1, 'the cover sees the attestation about themselves');
});

/* --------------------------------------- 10. declare/scan wiring */

test('declaring an absence and scanning carry the rehearsal counts; the rehearsal scan logs what it sees', () => {
  const { store, api } = boot(makeState({ rehearsals: [rehearsalRow()] }));
  const declared = api.dutyAbsenceDeclare({ from: WINDOW.from, to: WINDOW.to, reason: 'A planned week off in early July.' });
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.exercise.rehearsedCoversN, 1);
  const decision = store.state.decisions.find((d) => d.id === declared.decisionId);
  assert.match(decision.question, /1 available cover\(s\) hold an explicit rehearsal record \(1 attested, 0 self-reported\)/);

  const scanned = api.dutyAbsenceScan();
  assert.equal(scanned.ok, true, scanned.error);
  assert.equal(scanned.exercise.rehearsedCoversN, 1);
  const scanEvent = store.state.events.filter((e) => e.type === 'dutyAbsence.scan').at(-1);
  assert.match(scanEvent.summary, /1 cover\(s\) rehearsed by explicit record/);

  const rehScan = api.dutyRehearsalScan();
  assert.equal(rehScan.ok, true, rehScan.error);
  assert.equal(rehScan.summary.activeN, 1);
  const rehEvent = store.state.events.filter((e) => e.type === DUTY_REHEARSAL_EVENTS.SCAN).at(-1);
  assert.match(rehEvent.summary, /Cover rehearsals re-derived/);
});

/* -------------------------------------------------------- 11. the view */

test('the plan panel renders the rehearsed badge and the rehearsal ledger, axe-clean', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    FileReader: window.FileReader, localStorage: window.localStorage,
  })) globalThis[k] = v;

  const state = makeState({ absences: [{ seatId: 'lead1', from: WINDOW.from, to: WINDOW.to }], rehearsals: [rehearsalRow()] });
  const { api } = boot(state);

  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  const ctx = { api, query: new URLSearchParams('panel=plan'), navigate: () => {}, refresh: () => {} };
  if (!window.axe) window.eval(AXE_SRC);
  const node = renderDutyCover(ctx);
  view.replaceChildren(node);
  assert.match(view.textContent, /rehearsed 2027-06-28/, 'the rehearsed badge prints');
  assert.match(view.textContent, /Explicit rehearsal records/, 'the ledger card prints');
  assert.match(view.textContent, /holder-attested/, 'the attestation strength prints');
  assert.match(view.textContent, /supervised practice/, 'the declared mode prints');
  assert.match(view.textContent, /Ran the escalation triage end to end/, 'the recorder’s words print at the frontline altitude');
  assert.match(view.textContent, /Rehearse/, 'the record dialog is reachable from the plan’s cover table');
  const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), []);
  assert.deepEqual(consoleErrors, []);
});
