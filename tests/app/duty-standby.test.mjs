/**
 * tests/app/duty-standby.test.mjs — ADR-0127, Schema v116, Session 173.
 *
 * Cover acknowledgement closes the one gap in the register that was an accusation
 * aimed at itself: ADR-0121 opens by citing Kahn (1990) — "a responsibility
 * nobody was told about is not a responsibility" — and then recorded the
 * declaration without ever recording the telling. A named cover could therefore
 * never be told apart from one who had agreed, and the named person had no surface
 * in the product at all.
 *
 * What this suite proves, against the REAL store, the REAL rule/graph spine and
 * the REAL access gateway:
 *   1. Schema v116 is additive and convergent; an answer given by someone other
 *      than the named cover is DROPPED, never repaired into consent.
 *   2. An ask is DERIVED: the holder's dated absence is the exact window; without
 *      one it is a bounded forward window (nobody can answer "indefinitely").
 *   3. A declaration reads `awaiting` inside the declared response deadline, then
 *      `overdue` past it — silence is never read as yes, and the transition is a
 *      function of the date, not a stored field.
 *   4. Accepting is ONE atomic transaction: the answer row, ONE
 *      `accepts-standby-for` edge to the declaration, ONE `rolls-up-to` edge per
 *      leadership ancestor, and the audit event — and it opens NO decision.
 *   5. Declining records the reason and OPENS a governed decision naming what
 *      stops, in the same transaction.
 *   6. First-person enforcement: only the named cover may answer, only for dates
 *      inside the ask, never widening the ask, never stacking a second answer.
 *   7. A yes LAPSES when the ask window moves (consent does not travel with dates)
 *      and the register prints the lapse rather than extending the consent.
 *   8. The outgoing board names who has not answered; the incoming chair shows the
 *      acting seat only; a refusal-only duty line is printed as concrete exposure.
 *   9. The upward brief and the CSV scope carry counts and states — no person, no
 *      seat id, no duty label, no note — and a non-accepted row is BLANK, not 0.
 *  10. Both panels render axe-clean at director and at the named cover.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, migrate, normalizeSettings,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { ACTION_RIGHTS, recordPolicy } from '../../app/core/domain/seatRegistry.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS, DUTY_STANDBY_ENGINE_VERSION,
  DUTY_STANDBY_EVENTS, DUTY_STANDBY_LIMITS, DUTY_STANDBY_RELATION, DUTY_STANDBY_STATES,
} from '../../app/core/domain/dutyStandbyRegistry.js';
import {
  normalizeStandbyAnswers, normalizeDutyStandbySettings, parseStandbyWindow, activeAnswerFor,
} from '../../app/core/domain/dutyStandbySchema.js';
import {
  askWindowFor, standbyAsks, standbyForCover, refusedOnlyDuties, standbyCsvRows,
  standbyBriefLines, standbyExportBoard, dutyStandbyAttentionCount,
} from '../../app/core/domain/dutyStandby.js';
import { renderStandby } from '../../app/views/standby.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const plus = (days) => new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10);

/**
 * leader (chief, no roster record) → vp1 (4) → dir1 (3) → mgr1 (2) → lead1 (1)
 * → ic1/ic2. dir1 is the seat that will be named as a cover for mgr1's leave,
 * which is exactly the cross-altitude ask a director actually receives.
 */
function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    activeSeatId: null,
    ...(overrides.settings || {}),
  };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null, status: 'active', createdAt: ago(600) },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: ago(600) },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active', createdAt: ago(600) },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
  ];
  state.oneOnOnes = [
    { id: 'oo1', personId: 'ic1', date: ago(3), status: 'held', notes: 'Weekly cadence held.', agenda: [], actions: [] },
  ];
  state.cases = [
    { id: 'case1', title: 'Night-shift handover blocker', status: 'open', ownerId: 'ic2', openedOn: ago(11), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), involvedPersonIds: ['ic2'] },
  ];
  if (overrides.covers) state.dutyCovers = overrides.covers;
  if (overrides.absences) state.absencePlans = overrides.absences;
  if (overrides.answers) state.dutyStandbyAnswers = overrides.answers;
  return normalizeState(state, { now: NOW }).state;
}

/** A cover row as the engine would store it (the row shape normalizeDutyCovers enforces). */
const coverRow = (id, seatId, dutyKey, coverId, declaredOn = ago(6)) => ({
  id,
  dutyId: `${seatId}|${dutyKey}`,
  seatId,
  dutyKey,
  coverId,
  note: 'Named as the stand-in while the holder is away.',
  decisionId: null,
  declaredBySeatId: seatId,
  declaredOn,
  declaredAt: `${declaredOn}T09:00:00.000Z`,
  status: 'active',
  revokedOn: null,
  revokedAt: null,
  revokeReason: '',
  verifiedOn: null,
  version: DUTY_STANDBY_ENGINE_VERSION,
});

function boot(state) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const idFactory = (p) => `${p}-t${++seq}`;
  const store = createStore({ storage, now, idFactory });
  store.load();
  const api = createApi(store, { now, idFactory });
  return { store, api, map };
}

const asSeat = (state, seatId) => normalizeState(
  { ...state, settings: { ...state.settings, activeSeatId: seatId } },
  { now: NOW },
).state;
const boardAt = (state, seatId) => {
  const scoped = asSeat(state, seatId);
  const built = buildSeats(scoped, { now: NOW, settings: scoped.settings });
  return standbyAsks(scoped, built, activeSeat(built), { now: NOW, settings: scoped.settings });
};

/* --------------------------------------------------------------- 1. schema */

test('schema v116 is additive and convergent; consent given by a third party is dropped', () => {
  assert.equal(SCHEMA_VERSION, 118);
  const migrated = migrate({ schemaVersion: 115, people: [{ id: 'p1', name: 'A' }], settings: { leaderName: 'Dana' } });
  assert.deepEqual(migrated.applied, ['115 → 116', '116 → 117', '117 → 118']);
  assert.equal(migrated.raw.schemaVersion, 118);
  assert.deepEqual(migrated.raw.dutyStandbyAnswers, [], 'nobody has answered at upgrade time');
  assert.equal(migrated.raw.settings.dutyStandbyResponseDays, DUTY_STANDBY_DEFAULTS.dutyStandbyResponseDays);
  assert.equal(migrated.raw.settings.dutyStandbyWindowDays, DUTY_STANDBY_DEFAULTS.dutyStandbyWindowDays);
  assert.equal(migrated.raw.settings.leaderName, 'Dana', 'existing settings survive an additive bump');
  assert.deepEqual(migrate(migrated.raw).applied, [], 'convergence, not a loop');

  // The graph vocabulary is declared once and wired to a real collection.
  assert.ok(LINK_ENTITY_TYPES.includes('standbyanswer'));
  assert.equal(LINK_ENTITY_COLLECTIONS.standbyanswer, 'dutyStandbyAnswers');
  assert.ok(LINK_RELATIONS.includes(DUTY_STANDBY_RELATION));

  const covers = [coverRow('c1', 'lead1', 'coach', 'mgr1')];
  const warnings = [];
  const base = {
    id: 'a1', coverId: 'c1', dutyId: 'lead1|coach', seatId: 'lead1', answeredBySeatId: 'mgr1',
    answer: 'accepted', windowFrom: ago(2), windowTo: plus(5), note: 'I can take the cadence.',
    answeredOn: ago(1), answeredAt: `${ago(1)}T10:00:00.000Z`, status: 'active',
  };
  const kept = normalizeStandbyAnswers([base], covers, warnings);
  assert.equal(kept.length, 1, 'the named cover’s own answer survives');

  // The whole point of this module, enforced at the schema as well as the action.
  // Each forged row points at its OWN cover row so the person check — not the
  // duplicate check — is what refuses it.
  const forgedCovers = [coverRow('c1', 'lead1', 'coach', 'mgr1')];
  const forged = normalizeStandbyAnswers(
    [{ ...base, id: 'a2', coverId: 'c1', answeredBySeatId: 'dir1' }], forgedCovers, warnings,
  );
  assert.equal(forged.length, 0, 'a third party cannot consent on the cover’s behalf');
  assert.ok(warnings.some((w) => /consent on another/.test(w)), 'and the drop is explained');

  const mismatched = normalizeStandbyAnswers([{ ...base, id: 'a3', dutyId: 'lead1|clarity' }], covers, warnings);
  assert.equal(mismatched.length, 0, 'an answer cannot be re-pointed at a different duty line');

  const duplicate = normalizeStandbyAnswers([base, { ...base, id: 'a4' }], covers, warnings);
  assert.equal(duplicate.length, 1, 'a second active answer is not stacked over the first');

  assert.equal(parseStandbyWindow({ from: ago(2), to: plus(5) }).days, 8);
  assert.equal(parseStandbyWindow({ from: plus(5), to: ago(2) }), null, 'a backwards window is not a window');
  assert.equal(parseStandbyWindow({ from: ago(200), to: plus(5) }), null, 'an unbounded answer is refused');

  const clamped = normalizeDutyStandbySettings({ dutyStandbyResponseDays: 999, dutyStandbyWindowDays: 1 });
  assert.equal(clamped.dutyStandbyResponseDays, DUTY_STANDBY_BOUNDS.dutyStandbyResponseDays[1], 'out of range clamps');
  assert.equal(clamped.dutyStandbyWindowDays, DUTY_STANDBY_BOUNDS.dutyStandbyWindowDays[0]);
  assert.equal(normalizeDutyStandbySettings({ dutyStandbyResponseDays: 'x' }).dutyStandbyResponseDays, 3, 'a non-number falls back to the printed default');
  assert.equal(normalizeSettings({}).dutyStandbyResponseDays, 3, 'the convention survives normalizeSettings');

  assert.equal(ACTION_RIGHTS['answer-duty-standby'].minRank, 1, 'a named cover answers at every altitude');
  assert.equal(ACTION_RIGHTS['answer-duty-standby'].maxRank, 5);
  assert.equal(recordPolicy('dutyStandbyAnswers').classKey, 'unit');
  assert.deepEqual(DUTY_STANDBY_STATES.slice().sort(), ['accepted', 'awaiting', 'declined', 'lapsed', 'overdue']);
});

/* --------------------------------------------------- 2. the derived ask */

test('the ask window is the holder’s absence, or a bounded forward window — never open-ended', () => {
  const absence = { id: 'abs1', seatId: 'mgr1', from: plus(10), to: plus(17), reason: 'Leave planned with the family.', declaredOn: ago(2), declaredAt: `${ago(2)}T09:00:00.000Z`, status: 'active' };
  const withAbsence = fixture({ absences: [absence] });
  const built = buildSeats(withAbsence, { now: NOW, settings: withAbsence.settings });
  const mgr = built.byId.get('mgr1');
  const window = askWindowFor(withAbsence, mgr, { now: NOW, settings: withAbsence.settings });
  assert.deepEqual([window.from, window.to], [plus(10), plus(17)], 'the ask IS the declared absence');
  assert.equal(window.basis, 'declared-absence');
  assert.equal(window.days, 8);

  const noAbsence = fixture();
  const built2 = buildSeats(noAbsence, { now: NOW, settings: noAbsence.settings });
  const rolling = askWindowFor(noAbsence, built2.byId.get('mgr1'), { now: NOW, settings: noAbsence.settings });
  assert.equal(rolling.basis, 'rolling-window');
  assert.equal(rolling.from, ago(0));
  assert.equal(rolling.to, plus(DUTY_STANDBY_DEFAULTS.dutyStandbyWindowDays), 'a yes is always about bounded dates');
});

/* ------------------------------------------ 3. awaiting → overdue, by date */

test('a declaration reads awaiting inside the deadline and overdue past it — silence is never yes', () => {
  const fresh = boardAt(fixture({ covers: [coverRow('c1', 'lead1', 'coach', 'mgr1', ago(1))] }), 'mgr1');
  assert.equal(fresh.rows.length, 1);
  assert.equal(fresh.rows[0].state, 'awaiting');
  assert.equal(fresh.rows[0].answeredOn, null);
  assert.equal(fresh.rows[0].deadlineOn, plus(2), 'declaredOn (ago 1) + the declared 3-day response deadline');
  assert.match(fresh.rows[0].stateReason, /has not answered yet/);
  assert.equal(fresh.summary.acknowledgedPct, 0, 'zero ACCEPTED is a fact about the register, and it is printed');

  const stale = boardAt(fixture({ covers: [coverRow('c1', 'lead1', 'coach', 'mgr1', ago(9))] }), 'mgr1');
  assert.equal(stale.rows[0].state, 'overdue', 'the same row, later, with nobody answering');
  assert.equal(stale.rows[0].dayAfterDeadline, 6);
  assert.match(stale.rows[0].stateReason, /has not answered/);
  assert.match(stale.rows[0].stateReason, /one absence away from stopping/);
  assert.equal(stale.summary.overdueN, 1);
  assert.equal(stale.summary.awaitingN, 0);

  // Nothing was stored by either read: the state is a function of the date.
  const state = fixture({ covers: [coverRow('c1', 'lead1', 'coach', 'mgr1', ago(9))] });
  const before = JSON.stringify(state);
  boardAt(state, 'mgr1');
  assert.equal(JSON.stringify(state), before);
});

/* --------------------------------------------- 4. accepting is one transaction */

test('accepting writes the answer, the edge and the roll-up in one transaction — and opens no decision', () => {
  const state = fixture({
    settings: { activeSeatId: 'mgr1' },
    covers: [coverRow('c1', 'lead1', 'coach', 'mgr1')],
  });
  const { store, api } = boot(state);
  const decisionsBefore = store.state.decisions.length;

  // mgr1 holds the duty being covered; the COVER is mgr1 here, which the action
  // refuses (you cannot be your own cover) — so ask from the cover's own seat.
  const result = api.dutyStandbyAcknowledge({ coverRowId: 'c1' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.answer, 'accepted');
  assert.equal(result.decisionId, null, 'accepting adds no risk to the record');

  const answer = store.state.dutyStandbyAnswers.find((a) => a.id === result.id);
  assert.ok(answer);
  assert.equal(answer.answeredBySeatId, 'mgr1', 'the answer belongs to the named cover');
  assert.equal(answer.status, 'active');
  assert.deepEqual([answer.windowFrom, answer.windowTo], [ago(0), plus(DUTY_STANDBY_DEFAULTS.dutyStandbyWindowDays)], 'defaulted to the exact ask window');

  // ONE typed edge to the declaration it answers.
  const answerEdges = store.state.links.filter((l) => l.sourceId === result.id && l.relation === DUTY_STANDBY_RELATION);
  assert.equal(answerEdges.length, 1, 'exactly one accepts-standby-for edge');
  assert.equal(answerEdges[0].targetType, 'dutycover');
  assert.equal(answerEdges[0].targetId, 'c1');

  // ONE rolls-up-to edge per leadership ancestor of the cover: dir1 and vp1
  // (the climb starts at the cover's own manager, ADR-0121's convention, so the
  // cover's own seat is never addressed as its own ancestor).
  const rollUps = store.state.links.filter((l) => l.sourceId === result.id && l.relation === 'rolls-up-to');
  assert.ok(rollUps.length >= 2, 'the answer climbs the chain above the cover');
  assert.ok(!rollUps.some((l) => l.targetId === 'mgr1'), 'a seat is never its own ancestor');

  assert.equal(store.state.decisions.length, decisionsBefore, 'an acceptance opens no governed decision');
  const events = store.state.events.filter((e) => e.type === DUTY_STANDBY_EVENTS.ACCEPT);
  assert.equal(events.length, 1);
});

/* ------------------------------- 5. declining records the reason + a decision */

test('a refusal is a recorded answer that opens a governed decision naming what stops', () => {
  const state = fixture({
    settings: { activeSeatId: 'mgr1' },
    covers: [coverRow('c1', 'lead1', 'coach', 'mgr1')],
  });
  const { store, api } = boot(state);

  const tooShort = api.dutyStandbyDecline({ coverRowId: 'c1', note: 'no' });
  assert.equal(tooShort.ok, false, 'a refusal with no words is not a reviewed answer');
  assert.match(tooShort.error, /why you cannot stand behind/);

  const result = api.dutyStandbyDecline({ coverRowId: 'c1', note: 'I am on the same leave week with my own team.' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.answer, 'declined');
  assert.ok(result.decisionId, 'a refusal opens a governed decision');

  const decision = store.state.decisions.find((d) => d.id === result.decisionId);
  assert.ok(decision);
  assert.match(decision.title, /now that Mei Chen has declined/);
  assert.match(decision.question, /I am on the same leave week with my own team\./, 'the person’s own words are quoted, never summarised');
  assert.match(decision.question, /What remains open is who answers for this duty/);

  const graded = boardAt(store.state, 'mgr1').rows.find((r) => r.coverRowId === 'c1');
  assert.equal(graded.state, 'declined');
  assert.match(graded.stateReason, /declined on/);
});

/* ------------------------------------ 6. first-person, bounded, single answer */

test('only the named cover answers, only inside the ask, and never twice', () => {
  const state = fixture({
    settings: { activeSeatId: 'dir1' },
    covers: [coverRow('c1', 'lead1', 'coach', 'mgr1')],
  });
  const { store, api } = boot(state);

  // The wrong person: dir1 was not named. Consent is not a spectator sport.
  const wrongSeat = api.dutyStandbyAcknowledge({ coverRowId: 'c1' });
  assert.equal(wrongSeat.ok, false);
  assert.match(wrongSeat.error, /Only the person named as the cover can answer/);

  api.setActiveSeat('mgr1');
  const askWindow = askWindowFor(store.state, buildSeats(store.state, { now: NOW, settings: store.state.settings }).byId.get('lead1'), { now: NOW, settings: store.state.settings });

  // A wider window than the question is a bigger claim than the ask.
  const wider = api.dutyStandbyAcknowledge({ coverRowId: 'c1', from: askWindow.from, to: plus(60) });
  assert.equal(wider.ok, false);
  assert.match(wider.error, /would be consent to something nobody asked you about/);

  // Narrowing is allowed: a yes about the days a person can actually see.
  const narrowed = api.dutyStandbyAcknowledge({ coverRowId: 'c1', from: askWindow.from, to: askWindow.from });
  assert.equal(narrowed.ok, true, narrowed.error);
  assert.equal(narrowed.window.to, askWindow.from);

  // A second answer over the first is refused, with the way forward named.
  const twice = api.dutyStandbyAcknowledge({ coverRowId: 'c1' });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already answered this ask/);
  assert.match(twice.error, /Revoke that answer first/);

  // Revoking frees the ask again, and keeps the first answer in the record.
  const revoked = api.dutyStandbyRevoke({ id: narrowed.id, reason: 'The leave dates moved after I answered.' });
  assert.equal(revoked.ok, true, revoked.error);
  const kept = store.state.dutyStandbyAnswers.find((a) => a.id === narrowed.id);
  assert.equal(kept.status, 'revoked');
  assert.equal(kept.revokeReason, 'The leave dates moved after I answered.');
  assert.equal(activeAnswerFor(store.state.dutyStandbyAnswers, 'c1'), null);
  assert.equal(api.dutyStandbyAcknowledge({ coverRowId: 'c1' }).ok, true, 'the ask is answerable again');
});

/* --------------------------------------- 7. a yes does not travel with dates */

test('a yes lapses when the ask window moves — consent is not extended by a read', () => {
  const absence = { id: 'abs1', seatId: 'lead1', from: plus(10), to: plus(17), reason: 'Planned leave for the handover week.', declaredOn: ago(2), declaredAt: `${ago(2)}T09:00:00.000Z`, status: 'active' };
  const answer = {
    id: 'a1', coverId: 'c1', dutyId: 'lead1|coach', seatId: 'lead1', answeredBySeatId: 'mgr1',
    answer: 'accepted', windowFrom: plus(10), windowTo: plus(17), note: 'Yes for that week.',
    decisionId: null, answeredOn: ago(1), answeredAt: `${ago(1)}T10:00:00.000Z`, status: 'active',
    version: DUTY_STANDBY_ENGINE_VERSION,
  };
  const agreed = boardAt(fixture({ absences: [absence], covers: [coverRow('c1', 'lead1', 'coach', 'mgr1')], answers: [answer] }), 'mgr1');
  assert.equal(agreed.rows[0].state, 'accepted', 'the yes covers the exact absence it was given for');
  assert.match(agreed.rows[0].stateReason, /exactly this window/);

  // The holder moves their leave. The same yes no longer covers the ask, and the
  // register says so instead of quietly reading a stale consent as readiness.
  const moved = { ...absence, from: plus(40), to: plus(47) };
  const lapsed = boardAt(fixture({ absences: [moved], covers: [coverRow('c1', 'lead1', 'coach', 'mgr1')], answers: [answer] }), 'mgr1');
  assert.equal(lapsed.rows[0].state, 'lapsed');
  assert.match(lapsed.rows[0].stateReason, /does NOT cover the ask window/);
  assert.match(lapsed.rows[0].stateReason, /needs re-asking/);
  assert.equal(lapsed.summary.acceptedN, 0);
  assert.equal(lapsed.summary.lapsedN, 1);

  // Widening the ask past a narrower yes reads the same way.
  const narrow = { ...answer, windowFrom: plus(10), windowTo: plus(12) };
  const wide = { ...absence, from: plus(10), to: plus(17) };
  const partial = boardAt(fixture({ absences: [wide], covers: [coverRow('c1', 'lead1', 'coach', 'mgr1')], answers: [narrow] }), 'mgr1');
  assert.equal(partial.rows[0].state, 'lapsed', 'a partial yes is not a full yes');
});

/* --------------------------------- 8. the two chairs, and refused-only exposure */

test('the outgoing board names who has not answered; the incoming chair is the named seat only', () => {
  const state = fixture({
    settings: { activeSeatId: 'dir1' },
    covers: [
      coverRow('c1', 'lead1', 'coach', 'mgr1', ago(1)),   // awaiting
      coverRow('c2', 'lead2', 'clarity', 'mgr1', ago(9)), // overdue
    ],
  });
  const { store, api } = boot(state);
  const board = api.dutyStandbyBoard().board;
  assert.equal(board.summary.coversN, 2);
  assert.equal(board.summary.awaitingN, 1);
  assert.equal(board.summary.overdueN, 1);
  assert.equal(board.rows[0].state, 'overdue', 'worst state first — a director reads the top of the list');

  // The incoming chair: mgr1 has two asks; dir1 has none.
  api.setActiveSeat('mgr1');
  const mine = api.dutyStandbyForMe().board;
  assert.equal(mine.summary.assignedN, 2);
  assert.deepEqual([...new Set(mine.rows.map((r) => r.holderSeatId))].sort(), ['lead1', 'lead2']);

  api.setActiveSeat('dir1');
  const notMine = api.dutyStandbyForMe().board;
  assert.equal(notMine.summary.assignedN, 0, 'a cover sees only the asks addressed to them');
  assert.ok(notMine.refusal);

  // A peer's ask never appears: lead2 is not covered by lead1, and lead1's chair
  // cannot see lead2's duty line.
  api.setActiveSeat('lead1');
  const peer = api.dutyStandbyForMe().board;
  assert.equal(peer.rows.filter((r) => r.holderSeatId === 'lead2').length, 0, 'no sideways disclosure between peers');

  // Refused-only exposure: both live covers of one duty line declined.
  api.setActiveSeat('mgr1');
  api.dutyStandbyDecline({ coverRowId: 'c1', note: 'I am out the same week for a family funeral.' });
  api.dutyStandbyDecline({ coverRowId: 'c2', note: 'Not able to take this on in that window at all.' });
  api.setActiveSeat('dir1');
  const exposed = api.dutyStandbyBoard().board;
  assert.equal(exposed.summary.declinedN, 2);
  assert.equal(refusedOnlyDuties(exposed).length >= 1, true, 'a duty line whose only covers refused is printed as exposure');
});

/* --------------------------------------------- 9. brief, CSV, badge, gateway */

test('the brief and CSV carry states and counts only, and refuse rather than zero', () => {
  const state = fixture({
    settings: { activeSeatId: 'dir1' },
    covers: [coverRow('c1', 'lead1', 'coach', 'mgr1', ago(9)), coverRow('c2', 'lead2', 'clarity', 'dir1', ago(1))],
  });
  const scoped = normalizeState(state, { now: NOW }).state;
  const built = buildSeats(scoped, { now: NOW, settings: scoped.settings });
  const board = standbyAsks(scoped, built, activeSeat(built), { now: NOW, settings: scoped.settings });

  const brief = standbyBriefLines(board).join('\n');
  assert.match(brief, /Cover acknowledgement: 2 declared cover\(s\)/);
  assert.ok(!brief.includes('Mei Chen'), 'the brief names no person');
  assert.ok(!brief.includes('Samuel Park'));
  assert.ok(!brief.includes('Coaching cadence'), 'and no duty label');
  assert.match(brief, /measures the REGISTER/);

  // The export board is built under the active seat exactly as the screen is, and
  // carries no identity at all.
  const dirState = asSeat(state, 'dir1');
  const exportBoard = standbyExportBoard(dirState, { now: NOW, settings: dirState.settings });
  const rows = standbyCsvRows(exportBoard);
  const open = rows.filter((r) => r.row_kind === 'standby' && r.standby_state !== 'accepted');
  assert.ok(open.length >= 1);
  for (const row of open) {
    assert.equal(row.rate_acknowledged_pct, '', 'an unanswered row is BLANK, never 0');
    assert.equal(row.answered_on, '');
  }
  assert.ok(!('cover_name' in rows[0]), 'no person key reaches the export');
  assert.ok(!('seat_id' in rows[0]));
  assert.ok(!('duty_label' in rows[0]));
  assert.ok(rows.some((r) => r.row_kind === 'standby-summary'));
  assert.ok(!JSON.stringify(rows).includes('Mei Chen'), 'no name leaks into any cell');

  // The badge counts only what is actionable: overdue asks and refusals. An ask
  // still inside its deadline is a normal Monday and is deliberately not counted.
  assert.equal(dutyStandbyAttentionCount(dirState, { now: NOW, settings: dirState.settings }), 1, 'one overdue ask, one cover still inside its deadline');

  // The export scope exists and is registered.
  assert.equal(CSV_EXPORTS.length, 104);
  const exported = exportWorkspaceCsv(dirState, 'cover-standby', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(exported.rowCount >= 1);
  assert.match(exported.csv, /row_kind,scope,altitude,standby_state/, 'the export carries the derived state column');
  assert.match(exported.csv, /standby-summary/);
  assert.ok(!exported.csv.includes('Mei Chen'), 'no name in the file');
  assert.ok(!exported.csv.includes('Coaching cadence'), 'no duty label in the file');
  // A non-accepted row exports its rate BLANK. Zero would read as "no cover is
  // acknowledged anywhere", which is a much stronger claim than "this one has
  // not answered yet" — the same withheld-is-never-zero rule the rest of the
  // register follows.
  const standbyLine = exported.csv.split('\r\n').find((l) => l.startsWith('standby,'));
  assert.ok(standbyLine, 'the export carries a standby row');
  assert.match(standbyLine, /,,("|$)/, 'the unanswered row’s rate column is empty, not 0');

  // The gateway: a read-only unresolved seat cannot answer or read the board.
  const readOnly = normalizeState({ ...scoped, settings: { ...scoped.settings, activeSeatId: 'ghost' } }, { now: NOW }).state;
  const verdict = guardApiCall(readOnly, 'dutyStandbyAcknowledge', [{ coverRowId: 'c1' }]);
  assert.equal(verdict.ok, false, 'an unresolved seat is refused');
  assert.match(verdict.error, /unresolved|Declare a valid seat/i);
  assert.equal(guardApiCall(readOnly, 'dutyStandbyForMe', []).ok, false);
});

/* --------------------------------------------------------------- 10. render */

test('both panels render axe-clean at the director seat and at the named cover', async () => {
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

  const base = fixture({
    covers: [coverRow('c1', 'lead1', 'coach', 'mgr1', ago(9)), coverRow('c2', 'lead2', 'clarity', 'mgr1', ago(1))],
  });
  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();

  if (!window.axe) window.eval(AXE_SRC);

  const renderAs = async (seatId, panel, render) => {
    const scoped = asSeat(base, seatId);
    const map = new Map([[STORAGE_KEY, JSON.stringify(scoped)]]);
    let seq = 0;
    const store = createStore({
      storage: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) },
      now: () => NOW, idFactory: (p) => `s-${++seq}`,
    });
    store.load();
    const api = createApi(store, { now: () => NOW, idFactory: (p) => `s-${++seq}` });
    const ctx = { api, query: new URLSearchParams(`panel=${panel}`), navigate: () => {}, refresh: () => {} };
    const node = render(ctx);
    view.replaceChildren(node);
    assert.ok(view.querySelector('h1'), `${seatId}/${panel}: the page has an h1`);
    assert.ok(view.textContent.length > 200, `${seatId}/${panel}: rendered content`);
    assert.ok(!/undefined|\[object Object\]/.test(view.textContent), `${seatId}/${panel}: no placeholder leaked into the DOM`);
    const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], `axe violations at ${seatId}/${panel}`);
    for (const el of view.querySelectorAll('button, a[href], select, textarea, input')) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('value') || '').trim();
      assert.ok(name.length > 0, `${seatId}/${panel}: an unnamed ${el.tagName} would fail a screen-reader user`);
    }
    return view;
  };

  // The director's chair: who has answered, and the exposure behind it.
  const asked = await renderAs('dir1', 'asked', renderStandby);
  assert.match(asked.textContent, /Who has answered the asks you named|Declared covers/);
  assert.match(asked.textContent, /overdue|awaiting/);
  assert.match(asked.textContent, /measures the REGISTER, not a person/);

  // The named cover's chair — the surface the product did not have.
  const mine = await renderAs('mgr1', 'for-me', renderStandby);
  assert.match(mine.textContent, /What you have been asked to stand behind/);
  assert.match(mine.textContent, /I accept — for these dates/);
  assert.match(mine.textContent, /I cannot — here is why/);

  // Method prints the two declared conventions.
  const method = await renderAs('dir1', 'method', renderStandby);
  assert.match(method.textContent, /Declared conventions/);
  assert.match(method.textContent, /additive/);

  // The duty-coverage desk still renders: the new screen sits beside it, not on it.
  const desk = await renderAs('dir1', 'desk', renderDutyCover);
  assert.match(desk.textContent, /Register readiness/);

  assert.deepEqual(consoleErrors, [], 'no console errors while rendering');
  window.close();
});
