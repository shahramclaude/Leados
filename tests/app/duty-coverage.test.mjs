/**
 * tests/app/duty-coverage.test.mjs — ADR-0121, Schema v114, Session 163.
 *
 * The Duty Coverage Register answers the ordinary Monday question every altitude
 * asks in its own words: "if I am not here tomorrow, which of my duties stops,
 * and does the person who would pick it up know, have the span, and have used
 * their access?"
 *
 * What this suite proves, against the REAL store, the REAL rule spine and the
 * REAL access gateway:
 *   1. Schema v114 is additive and convergent; a malformed cover row is dropped
 *      with a warning, never repaired into a responsibility nobody accepted.
 *   2. Duty lines are DECLARED (the altitude table) and never invented: an
 *      undeclared operator seat has no duty lines and the readiness rate is
 *      REFUSED rather than printed as a zero.
 *   3. The eligible pool is the reporting tree, printed with reasons: the seat
 *      itself is refused and its ancestors are offered; a rank BELOW the seat is refused
 *      with the Jaques reason; a peer is never offered at all.
 *   4. A declaration is one atomic transaction: the cover row, ONE
 *      `prepares-for` edge to the person, ONE governed decision naming the
 *      consequence and one `rolls-up-to` edge per leadership ancestor above the
 *      covered seat — then the graph survives a reload.
 *   5. "Exercised" is DERIVED from dated records, never ticked: a declared cover
 *      reads `thin` until that person records work inside the span, then reads
 *      `covered`, and the state row itself is never rewritten by the read.
 *   6. The register rates the REGISTER, not a person: readiness is per duty
 *      line with a Wilson interval, and it moves when a cover is declared.
 *   7. The gateway enforces the new right: an unresolved (read-only) seat cannot
 *      declare cover, and a trailing seat cannot set the conventions.
 *   8. Above the manager altitude the register prints counts, bands and refusals
 *      and withholds the cover's name — the same row, read at a different altitude.
 *   9. The upward brief and the CSV scope name no person and no seat id, and a
 *      refused figure is BLANK rather than zero.
 *  10. The screen renders at the frontline altitude, axe-clean, with no console
 *      errors — every declared duty line printed.
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
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  DUTY_COVERAGE_DEFAULTS, DUTY_COVERAGE_EVENTS, DUTY_COVERAGE_LIMITS,
} from '../../app/core/domain/dutyCoverageRegistry.js';
import {
  normalizeDutyCovers, normalizeDutyCoverageSettings, parseDutyId, makeDutyId,
} from '../../app/core/domain/dutyCoverageSchema.js';
import {
  buildDutyCoverageReport, dutyCandidates, dutyCoverageBriefText, dutyCoverageCsvRows,
  exerciseIndex, wilsonInterval,
} from '../../app/core/domain/dutyCoverage.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { ACTION_RIGHTS, recordPolicy } from '../../app/core/domain/seatRegistry.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

/**
 * leader (chief, no roster record) → vp1 (4) → dir1 (3) → mgr1 (2) → lead1 (1)
 * → ic1/ic2. Two frontline leads under one manager so a peer span exists and can
 * be proven to be REFUSED rather than merely absent from a list.
 */
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId: null,
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
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = fixture()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

const seatOf = (state) => activeSeat(buildSeats(state, { now: NOW, settings: state.settings }));

/* --------------------------------------------------------------- 1. schema */

test('schema v114 is additive and convergent; a malformed cover is dropped, never repaired', () => {
  assert.equal(SCHEMA_VERSION, 119);
  const migrated = migrate({ schemaVersion: 113, people: [{ id: 'p1', name: 'A' }], settings: { leaderName: 'Dana' } });
  assert.deepEqual(migrated.applied, ['113 → 114', '114 → 115', '115 → 116', '116 → 117', '117 → 118', '118 → 119']);
  assert.equal(migrated.raw.schemaVersion, 119);
  assert.deepEqual(migrated.raw.dutyCovers, [], 'no stand-in is invented at upgrade time');
  assert.deepEqual(migrated.raw.dutyCoverageMarkers, []);
  assert.equal(migrated.raw.settings.dutyCoverageExerciseDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageExerciseDays);
  assert.equal(migrated.raw.settings.dutyCoverageConcentrationPct, DUTY_COVERAGE_DEFAULTS.dutyCoverageConcentrationPct);
  assert.equal(migrated.raw.settings.leaderName, 'Dana', 'existing settings survive');
  assert.deepEqual(migrate(migrated.raw).applied, [], 'convergence, not a loop');

  const warnings = [];
  const covers = normalizeDutyCovers([
    { id: 'c-ok', dutyId: 'lead1|coach', coverId: 'mgr1', note: 'Mei takes the cadence', declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'c-bad-duty', dutyId: 'not-a-duty', coverId: 'mgr1', declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'c-no-cover', dutyId: 'lead1|cover', declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'active' },
    { id: 'c-bad-status', dutyId: 'lead1|clarify', coverId: 'mgr1', declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'maybe' },
    'not-an-object',
    { id: 'c-ok', dutyId: 'lead1|coach', coverId: 'mgr1', declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'active' },
  ], warnings);
  assert.equal(covers.length, 1, 'only the one well-formed, unique cover survives');
  assert.equal(covers[0].id, 'c-ok');
  assert.equal(covers[0].seatId, 'lead1');
  assert.equal(covers[0].dutyKey, 'coach');
  assert.ok(warnings.length >= 4, 'every drop is explained');

  // The declared cap is enforced on load, not discovered later.
  const many = normalizeDutyCovers(Array.from({ length: DUTY_COVERAGE_LIMITS.coversPerDuty + 2 }, (_, i) => ({
    id: `c${i}`, dutyId: 'lead1|coach', coverId: `p${i}`, declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'active',
  })));
  assert.equal(many.length, DUTY_COVERAGE_LIMITS.coversPerDuty, 'a duty is not a committee');

  assert.equal(parseDutyId('lead1|coach').dutyKey, 'coach');
  assert.equal(parseDutyId('lead1coach'), null);
  assert.equal(parseDutyId('lead1|Coach'), null, 'a duty key is a declared lower-case identifier');
  assert.equal(makeDutyId('lead1', 'coach'), 'lead1|coach');

  const clamped = normalizeDutyCoverageSettings({ dutyCoverageExerciseDays: 9999, dutyCoverageConcentrationPct: 1 });
  assert.equal(clamped.dutyCoverageExerciseDays, 180, 'out of range clamps to the boundary');
  assert.equal(clamped.dutyCoverageConcentrationPct, 50);
  assert.equal(normalizeDutyCoverageSettings({ dutyCoverageExerciseDays: 'x' }).dutyCoverageExerciseDays, 30, 'a non-number falls back to the printed default');
  assert.equal(normalizeSettings({}).dutyCoverageExerciseDays, 30, 'the convention survives normalizeSettings');

  assert.equal(ACTION_RIGHTS['declare-duty-cover'].minRank, 1, 'every leadership seat declares its own cover');
  assert.equal(ACTION_RIGHTS['declare-duty-cover'].maxRank, 5);
  assert.equal(ACTION_RIGHTS['govern-duty-cover'].minRank, 4);
  assert.equal(recordPolicy('dutyCovers').classKey, 'unit', 'a cover is a statement about a position, not about a person');
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'rule/contract parity is untouched: this module adds no rule');
});

/* --------------------------------------------------- 2. declared duty lines */

test('duty lines are declared, not invented: the operator seat has none and its rate is refused', () => {
  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const operator = buildDutyCoverageReport(state, { now: NOW });
  assert.equal(operator.seat.id, 'lead1', 'a declared seat is what gives the register a duty table');
  const rows = operator.rows;
  assert.ok(rows.length > 0);
  // Every row must name a duty that the altitude table actually declares.
  const lead1 = normalizeState({ ...state, settings: { ...state.settings, activeSeatId: undefined } }, { now: NOW }).state;
  const seats = buildSeats(lead1, { now: NOW, settings: lead1.settings });
  const declaredKeys = new Set(seats.seats.flatMap((s) => (s.duties || []).map((d) => `${s.id}|${d.key}`)));
  for (const row of rows) assert.ok(declaredKeys.has(row.reading.dutyId), `${row.reading.dutyId} is a declared duty line`);

  // An undeclared operator workspace resolves to the operator view: no duty
  // lines, so there is no denominator — the rate is refused, never zero.
  const bare = createEmptyState(NOW.toISOString());
  bare.settings = { ...bare.settings, activeSeatId: null };
  const normalized = normalizeState(bare, { now: NOW }).state;
  const report = buildDutyCoverageReport(normalized, { now: NOW });
  assert.equal(report.rows.length, 0);
  assert.equal(report.summary.readinessPct, null, 'no denominator ⇒ refused, not 0%');
  assert.equal(report.summary.interval, null);
  assert.match(dutyCoverageBriefText(report), /refused/);
});

/* ------------------------------------------------------- 3. eligible pool */

test('the eligible pool rises through the tree and refuses a lower rank with its reason', () => {
  const state = { ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } };
  const normalized = normalizeState(state, { now: NOW }).state;
  const built = buildSeats(normalized, { now: NOW, settings: normalized.settings });
  const seat = activeSeat(built);
  assert.equal(seat.id, 'lead1');
  const coach = seat.duties.find((d) => d.key === 'coach');
  const candidates = dutyCandidates(normalized, built, seat, coach);
  const byId = new Map(candidates.map((c) => [c.personId, c]));
  assert.equal(byId.get('lead1')?.eligible, false, 'the absent holder cannot be their own stand-in');
  assert.match(byId.get('lead1').reason, /cannot cover their own absence/);
  assert.ok(byId.get('mgr1')?.eligible, 'the manager above is an ancestor cover');
  assert.ok(byId.get('dir1')?.eligible);
  assert.ok(byId.get('vp1')?.eligible);
  assert.equal(byId.get('lead2'), undefined, 'a PEER span is never offered — cover rises, never sideways');
  assert.equal(byId.get('ic1'), undefined, 'an IC holds no altitude and cannot answer an altitude duty');
  assert.match(byId.get('mgr1').reason, /subsidiarity/);

  // From the manager's seat, a subordinate lead is REFUSED with the Jaques reason.
  const mgrState = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'mgr1' } }, { now: NOW }).state;
  const mgrBuilt = buildSeats(mgrState, { now: NOW, settings: mgrState.settings });
  const mgrSeat = activeSeat(mgrBuilt);
  const mgrCoach = mgrSeat.duties.find((d) => d.key === 'throughput');
  const mgrCandidates = dutyCandidates(mgrState, mgrBuilt, mgrSeat, mgrCoach);
  const lead1Row = mgrCandidates.find((c) => c.personId === 'lead1');
  assert.ok(lead1Row, 'a subordinate lead is OFFERED so the refusal can be printed, not hidden');
  assert.equal(lead1Row.eligible, false);
  assert.match(lead1Row.reason, /BELOW rank 2/);
  assert.match(lead1Row.reason, /Jaques 1956/);
});

test('self-cover is refused and legacy self-declarations cannot inflate manager or upward readiness', () => {
  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'mgr1' } }, { now: NOW }).state;
  const h = boot(state);
  const before = h.store.state.dutyCovers.length;
  const rejected = h.api.dutyCoverageDesignate({ dutyId: 'mgr1|throughput', coverId: 'mgr1', note: 'I will cover this duty.' });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /cannot cover their own absence/);
  assert.equal(h.store.state.dutyCovers.length, before);

  // An old validly stored declaration is retained, but must not count even
  // when the holder has recent recorded work in their span.
  const legacy = normalizeState({ ...state,
    dutyCovers: [{ id: 'legacy-self', dutyId: 'mgr1|throughput', coverId: 'mgr1', note: 'Legacy self declaration', declaredOn: '2027-06-01', declaredAt: NOW.toISOString(), status: 'active' }],
    oneOnOnes: [{ id: 'exercise-self', personId: 'lead1', status: 'held', date: '2027-06-29' }],
  }, { now: NOW }).state;
  const manager = buildDutyCoverageReport(legacy, { now: NOW });
  const row = manager.rows.find((r) => r.reading.dutyId === 'mgr1|throughput').reading;
  assert.equal(row.covers[0].exercised, true);
  assert.equal(row.covers[0].eligible, false);
  assert.equal(row.band, 'ineligible');
  assert.match(row.bandReason, /cannot cover their own absence/);
  assert.equal(legacy.dutyCovers[0].id, 'legacy-self');
  const director = buildDutyCoverageReport({ ...legacy, settings: { ...legacy.settings, activeSeatId: 'dir1' } }, { now: NOW });
  const rolled = director.rows.find((r) => r.reading.dutyId === 'mgr1|throughput').reading;
  assert.equal(rolled.band, 'ineligible');
  assert.equal(rolled.covers[0].name, null);
  assert.ok(director.ineligible.some((r) => r.reading.dutyId === 'mgr1|throughput'));
  assert.match(dutyCoverageBriefText(director), /ineligible cover/);
  const loaded = boot(legacy);
  assert.equal(loaded.api.dutyCoverageRevoke({ id: 'legacy-self', reason: 'Cannot cover my own absence' }).ok, true);
  assert.equal(loaded.api.dutyCoverageReport().report.rows.find((r) => r.reading.dutyId === 'mgr1|throughput').reading.band, 'gap');
});

/* ------------------------------------------------- 4-6. the declaration act */

test('declaring cover is ONE transaction: row + prepares-for edge + governed decision + ancestor edges', () => {
  const h = boot(normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state);
  const before = h.store.state;
  const decisionsBefore = before.decisions.length;
  const linksBefore = before.links.length;
  const dutyId = 'lead1|coach';

  const result = h.api.dutyCoverageDesignate({
    dutyId,
    coverId: 'mgr1',
    note: 'Mei takes the weekly coaching cadence when Priya is on leave.',
    failureMode: 'Two analysts go a fortnight without a real conversation.',
  });
  assert.ok(result.ok, result.error);

  const after = h.store.state;
  const covers = after.dutyCovers.filter((c) => c.status === 'active');
  assert.equal(covers.length, 1);
  const cover = covers[0];
  assert.equal(cover.dutyId, dutyId);
  assert.equal(cover.coverId, 'mgr1');
  assert.equal(cover.declaredBySeatId, 'lead1');
  assert.equal(cover.declaredOn, '2027-06-30');
  assert.match(cover.note, /cadence/);
  assert.ok(cover.decisionId, 'the consequence is on the record as a decision, not in someone’s head');

  // Exactly one new `prepares-for` edge, from the cover to the person.
  const newPrepares = after.links.filter((l) => l.relation === 'prepares-for' && l.sourceType === 'dutycover');
  assert.equal(newPrepares.length, 1);
  assert.equal(newPrepares[0].sourceId, cover.id);
  assert.equal(newPrepares[0].targetId, 'mgr1');

  // Exactly one governed decision, naming the failure the leader declared.
  assert.equal(after.decisions.length, decisionsBefore + 1);
  const decision = after.decisions.find((d) => d.id === cover.decisionId);
  assert.ok(decision, 'the decision named on the cover exists');
  assert.match(decision.question, /a fortnight without a real conversation/, 'the declared failure is on the record verbatim');
  assert.equal(decision.options.length, 3, 'three printed moves, never a forced choice');

  // One `rolls-up-to` edge per leadership ancestor above the covered seat.
  const rollUps = after.links.filter((l) => l.ruleId === '' && l.relation === 'rolls-up-to' && l.sourceId === decision.id);
  assert.deepEqual(rollUps.map((l) => l.targetId).sort(), ['dir1', 'lead1', 'mgr1', 'vp1'], 'the question climbs the whole chain of command');

  assert.ok(after.events.some((e) => e.type === DUTY_COVERAGE_EVENTS.DESIGNATE), 'the declaration is an append-only event');
  assert.ok(after.links.length > linksBefore, 'the declaration writes typed provenance, not a second table');

  // The register now reads `thin`: declared and eligible, but never exercised.
  const report = h.api.dutyCoverageReport().report;
  const coachRow = report.rows.find((r) => r.reading.dutyId === dutyId);
  assert.equal(coachRow.reading.band, 'thin');
  assert.equal(coachRow.reading.exercisedCoversN, 0);
  assert.match(coachRow.reading.covers[0].exerciseNote, /no recorded work/i);

  // Exercise is DERIVED: the moment the cover records work inside the span,
  // the same stored row reads `covered` — and the stored row is untouched.
  // The manager (the declared cover) records work that names the span. A lead
  // cannot create that record — the gateway correctly refuses a name outside
  // their span — so the cover itself is what exercises the access.
  assert.ok(h.api.setActiveSeat('mgr1', { reason: 'coverage rehearsal' }).ok);
  const outage = h.api.addCase({
    title: 'Coaching cadence is slipping on the night shift',
    status: 'open', kind: 'risk', severity: 'medium',
    ownerId: 'ic2', involvedPersonIds: ['ic2', 'mgr1'],
  });
  assert.ok(outage.ok, outage.error);
  assert.ok(h.api.setActiveSeat('lead1', { reason: 'back to the shift' }).ok);
  const reread = h.api.dutyCoverageReport().report.rows.find((r) => r.reading.dutyId === dutyId);
  assert.equal(reread.reading.band, 'covered');
  assert.equal(reread.reading.exercisedCoversN, 1);
  assert.equal(h.store.state.dutyCovers.find((c) => c.id === cover.id).verifiedOn, null, 'the read never rewrites the declaration');

  // Readiness measures the REGISTER and moves with declarations, not with people.
  const baseline = buildDutyCoverageReport(normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state, { now: NOW });
  assert.equal(baseline.summary.coveredN, 0, 'nothing is covered before a human declares it');
  assert.equal(baseline.summary.readinessPct, 0);
  const exercisedReport = h.api.dutyCoverageReport().report;
  assert.ok(exercisedReport.summary.readinessPct > baseline.summary.readinessPct, 'declaring AND exercising cover raises the register’s readiness');
  assert.equal(exercisedReport.summary.coveredN, 1);
  assert.equal(reread.reading.band, 'covered', 'the exercised declaration is what raises it');

  // Idempotence: the same person cannot be declared twice for one duty.
  const twice = h.api.dutyCoverageDesignate({ dutyId, coverId: 'mgr1', note: 'Declare it again for fun.' });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already the declared cover/);

  // Refusals carry the reason, and there is no bulk or automatic assignment.
  const peer = h.api.dutyCoverageDesignate({ dutyId, coverId: 'lead2', note: 'Jordan is around anyway.' });
  assert.equal(peer.ok, false);
  assert.match(peer.error, /outside the reporting tree/);
  const noNote = h.api.dutyCoverageDesignate({ dutyId, coverId: 'dir1', note: 'ok' });
  assert.equal(noNote.ok, false);
  assert.match(noNote.error, /one line saying what this person would be answerable for/);
  const belowSeat = h.api.dutyCoverageDesignate({ dutyId: 'mgr1|throughput', coverId: 'lead1', note: 'Lead could take the throughput duty.' });
  assert.equal(belowSeat.ok, false, 'a manager may declare cover — but not on a rank below them');
  assert.match(belowSeat.error, /BELOW rank 2/);
});

test('a cover survives a reload, and revoking it is append-only and printed', () => {
  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const h = boot(state);
  const declared = h.api.dutyCoverageDesignate({ dutyId: 'lead1|coach', coverId: 'mgr1', note: 'Mei covers the coaching cadence while Priya is away.' });
  assert.ok(declared.ok, declared.error);
  const coverId = declared.id;

  // Reload from the persisted blob: the cover, its edge and the decision survive.
  const reloaded = boot(JSON.parse(h.map.get(STORAGE_KEY)));
  assert.equal(reloaded.store.state.dutyCovers.length, 1);
  assert.equal(reloaded.store.state.dutyCovers[0].id, coverId);
  assert.ok(reloaded.store.state.links.some((l) => l.sourceType === 'dutycover' && l.sourceId === coverId && l.relation === 'prepares-for'));
  const report = reloaded.api.dutyCoverageReport().report;
  assert.equal(report.rows.find((r) => r.reading.dutyId === 'lead1|coach').reading.covers.length, 1, 'the `dutycover` link entity type resolves across reload');

  // Revocation requires a reason and never deletes the row.
  const bare = reloaded.api.dutyCoverageRevoke({ id: coverId, reason: 'x' });
  assert.equal(bare.ok, false);
  const revoked = reloaded.api.dutyCoverageRevoke({ id: coverId, reason: 'Priya returned early; the cover is no longer needed.' });
  assert.ok(revoked.ok, revoked.error);
  const row = reloaded.store.state.dutyCovers.find((c) => c.id === coverId);
  assert.equal(row.status, 'revoked');
  assert.equal(row.revokedOn, '2027-06-30');
  assert.match(row.revokeReason, /returned early/);
  assert.equal(reloaded.store.state.dutyCovers.length, 1, 'the declaration is kept, not deleted');
  assert.equal(reloaded.api.dutyCoverageRevoke({ id: coverId, reason: 'again please' }).ok, false, 'already revoked');
  const after = reloaded.api.dutyCoverageReport().report.rows.find((r) => r.reading.dutyId === 'lead1|coach');
  assert.equal(after.reading.covers.length, 0, 'a revoked cover no longer counts');
  assert.equal(after.reading.band, 'gap');
});

/* ------------------------------------------- 7. the gateway enforces the right */

test('the access gateway enforces the right: a read-only seat cannot declare, a lead cannot govern', () => {
  const state = normalizeState({
    ...fixture(),
    settings: { ...fixture().settings, activeSeatId: 'ghost-seat' },
  }, { now: NOW }).state;
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  assert.equal(activeSeat(built).readOnly, true, 'an unresolvable seat is read-only, not a courtesy invitation');
  const refused = guardApiCall(state, 'dutyCoverageDesignate', [{ dutyId: 'lead1|coach', coverId: 'mgr1', note: 'no' }], NOW.getTime());
  assert.equal(refused.ok, false);
  assert.match(String(refused.reason || refused.error), /read-only|unresolved|not a leadership position/i);

  // A frontline lead holds `declare-duty-cover` but not `govern-duty-cover`.
  const leadState = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const leadBuilt = buildSeats(leadState, { now: NOW, settings: leadState.settings });
  const lead = activeSeat(leadBuilt);
  const govern = guardApiCall(leadState, 'dutyCoverageSetConventions', [{ dutyCoverageExerciseDays: 60 }], NOW.getTime());
  assert.equal(govern.ok, false, 're-pricing every duty line is not a rank-1 right');
  assert.match(String(govern.reason || govern.error), /rank/i);
  assert.ok(lead.rank === 1);

  // Reads are SAFE_READS: a lead may read the register without a write right.
  const read = guardApiCall(leadState, 'dutyCoverageReport', [], NOW.getTime());
  assert.equal(read.ok, true);
  const candidates = guardApiCall(leadState, 'dutyCoverageCandidates', ['lead1|coach'], NOW.getTime());
  assert.equal(candidates.ok, true);
  void govern;
});

/* ------------------------------------------------- 8. the altitude roll-up */

test('above the manager altitude the same register withholds names and prints bands', () => {
  const base = fixture();
  const withCover = {
    ...base,
    dutyCovers: [{ id: 'dc1', dutyId: 'lead1|coach', seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1', note: 'Mei covers the cadence.', declaredOn: ago(4), declaredAt: NOW.toISOString(), status: 'active', revokedOn: null, revokeReason: '' }],
  };

  const frontline = buildDutyCoverageReport(normalizeState({ ...withCover, settings: { ...base.settings, activeSeatId: 'lead1' } }, { now: NOW }).state, { now: NOW });
  assert.equal(frontline.namesVisible, true, 'a lead needs the actual name to make a call');
  const named = frontline.rows.find((r) => r.reading.dutyId === 'lead1|coach');
  assert.equal(named.reading.covers[0].name, 'Mei Chen');

  const executive = buildDutyCoverageReport(normalizeState({ ...withCover, settings: { ...base.settings, activeSeatId: 'vp1' } }, { now: NOW }).state, { now: NOW });
  assert.equal(executive.namesVisible, false, 'a VP reads counts and bands, never a cover’s name');
  const redacted = executive.rows.find((r) => r.reading.dutyId === 'lead1|coach');
  assert.ok(redacted, 'the enterprise reading still contains the frontline duty line');
  assert.equal(redacted.reading.covers[0].name, null);
  assert.equal(redacted.reading.covers[0].coverId, null);
  assert.match(redacted.reading.covers[0].label, /Rank 2 cover/);
  assert.equal(redacted.reading.band, named.reading.band, 'the BAND is the same fact at both altitudes');
  assert.ok(executive.rows.length > frontline.rows.length, 'a VP reads every duty line in the span below');
  assert.ok(executive.seatRows.length >= 3);
  assert.ok(executive.seatRows.every((s) => s.name === null), 'no seat name rides the executive table');
  // The manager altitude keeps names: the boundary is a rank, not a flag.
  const manager = buildDutyCoverageReport(normalizeState({ ...withCover, settings: { ...base.settings, activeSeatId: 'mgr1' } }, { now: NOW }).state, { now: NOW });
  assert.equal(manager.namesVisible, true);
});

/* ----------------------------------------------------- 9. privacy + export */

test('the brief and the CSV scope name no person and no seat id, and refuse rather than zero', () => {
  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const h = boot(state);
  const declared = h.api.dutyCoverageDesignate({ dutyId: 'lead1|coach', coverId: 'mgr1', note: 'Mei covers the coaching cadence while Priya is away.' });
  assert.ok(declared.ok, declared.error);

  const brief = h.api.dutyCoverageBriefText();
  assert.ok(brief.ok, brief.error);
  for (const name of ['Mei Chen', 'Priya Raman', 'Ari Klein', 'lead1', 'mgr1']) {
    assert.ok(!brief.text.includes(name), `the upward brief must not carry “${name}”`);
  }
  assert.match(brief.text, /measures the REGISTER, not any person/);

  const csv = h.api.dutyCoverageCsvRows();
  assert.ok(csv.ok, csv.error);
  assert.ok(csv.rows.length > 1);
  const serialized = JSON.stringify(csv.rows);
  for (const name of ['Mei', 'Priya', 'Ari', 'Rina', 'lead1', 'mgr1', 'vp1', 'dir1']) {
    assert.ok(!serialized.includes(name), `the CSV row set must not carry “${name}”`);
  }
  // The generated refusal sentences name the DUTY and its seat label, never a person.
  assert.match(serialized, /Frontline lead/);
  assert.equal(csv.rows.filter((r) => r.row_kind === 'duty').every((r) => !('cover_name' in r)), true);

  // The workspace export scope exists, is aggregate-only, and exports the table.
  const descriptor = CSV_EXPORTS.find((x) => x.key === 'duty-coverage');
  assert.ok(descriptor, 'CSV scope #104 is registered');
  const exported = exportWorkspaceCsv(state, 'duty-coverage', { now: NOW });
  assert.ok(exported.ok, exported.error);
  assert.match(exported.text || exported.csv || '', /duty_key/);

  // A refused reading is BLANK in the CSV, never zero.
  const bare = normalizeState({ ...createEmptyState(NOW.toISOString()), settings: { ...createEmptyState(NOW.toISOString()).settings, activeSeatId: null } }, { now: NOW }).state;
  const bareReport = buildDutyCoverageReport(bare, { now: NOW });
  assert.equal(bareReport.summary.readinessPct, null);
  const rows = dutyCoverageCsvRows(bareReport);
  assert.equal(rows.length, 1, 'a workspace with no declared seat exports one refused register row');
  assert.equal(rows[0].concentration_top_share_pct, '');
  assert.match(String(rows[0].refused_reason), /no declared duty line/);
  assert.ok(wilsonInterval(0, 0) === null, 'no denominator, no interval');
  assert.ok(exerciseIndex, 'the exercise derivation is exported and testable on its own');
});

/* ------------------------------------------------------- 10. the screen */

test('the Duty Coverage Register renders at the frontline altitude, axe-clean, over a real store', async () => {
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

  const state = normalizeState({ ...fixture(), settings: { ...fixture().settings, activeSeatId: 'lead1' } }, { now: NOW }).state;
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `u-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `u-${++seq}` });
  const declared = api.dutyCoverageDesignate({ dutyId: 'lead1|coach', coverId: 'mgr1', note: 'Mei covers the coaching cadence while Priya is away.' });
  assert.ok(declared.ok, declared.error);
  const stored = api.dutyCoverageReport().report.rows.find((r) => r.reading.dutyId === 'lead1|coach');
  assert.equal(stored.reading.covers.length, 1, 'the declaration is readable before the screen is rendered');

  // The app shell already renders a page `<header>`; a bare div would make a
  // second banner landmark and axe would rightly complain. Render inside the
  // real `#view` main region, exactly as the shell does.
  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  const host = view;
  const ctx = { api, query: new URLSearchParams('panel=desk'), navigate: () => {}, refresh: () => {} };

  if (!window.axe) window.eval(AXE_SRC);
  for (const panel of ['desk', 'register', 'gaps', 'concentration', 'method']) {
    ctx.query = new URLSearchParams(`panel=${panel}`);
    const node = renderDutyCover(ctx);
    host.replaceChildren(node);
    assert.ok(host.querySelector('h1'), `${panel}: the page has an h1`);
    assert.ok(host.textContent.length > 200, `${panel}: rendered content`);
    assert.ok(!/undefined|\[object Object\]/.test(host.textContent), `${panel}: no placeholder leaked into the DOM`);
    const res = await window.axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], `${panel} has axe violations`);
  }

  // The register panel prints every declared duty line and its band.
  ctx.query = new URLSearchParams('panel=register');
  host.replaceChildren(renderDutyCover(ctx));
  const report = api.dutyCoverageReport().report;
  for (const row of report.rows) {
    assert.ok(host.textContent.includes(row.reading.label), `the register names the “${row.reading.label}” duty line`);
  }
  ctx.query = new URLSearchParams('panel=register');
  host.replaceChildren(renderDutyCover(ctx));
  assert.ok(host.textContent.includes('Mei Chen'), 'below the manager altitude the register names the declared cover');
  // The desk prints the altitude's own question and a rate about the REGISTER.
  ctx.query = new URLSearchParams('panel=desk');
  host.replaceChildren(renderDutyCover(ctx));
  assert.match(host.textContent, /Register readiness/);
  assert.match(host.textContent, /This altitude's question/);
  assert.match(host.textContent, /measures the REGISTER, not a person/);

  // Every interactive control has an accessible name.
  for (const el of host.querySelectorAll('button, a[href], select, textarea, input')) {
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('value') || '').trim();
    assert.ok(name.length > 0, `an unnamed ${el.tagName} control would fail a screen-reader user`);
  }
  assert.deepEqual(consoleErrors, [], 'no console errors while rendering');
  window.close();
});
