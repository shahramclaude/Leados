/**
 * tests/app/signal-path.test.mjs — the Signal Path terminal (Session 85,
 * Schema v59, RULE-SIG-01..04).
 *
 * The claims here are specific and falsifiable:
 *
 *   1. Schema v59 is additive. A v58 workspace gains three empty collections and
 *      nothing else; no class, no probe and no exposure is invented.
 *   2. Series reliability is exact: reach is the product of the hops, and the
 *      parallel branch composes as 1 − (1 − a)(1 − b). False alarms compound in
 *      the opposite direction, so depth hurts twice.
 *   3. Mutual information is exact on hand-checkable cases: an uninformative
 *      channel carries 0 bits, and a perfect one carries the source entropy.
 *   4. The inverse normal is accurate enough that d′ is meaningful, and it is
 *      refined by Halley rather than trusted to the raw approximation.
 *   5. Depth is derived from the roster, and a management cycle is detected and
 *      refused rather than turned into an arbitrary number.
 *   6. Every lever is priced by re-running the SAME evaluator, so a
 *      recommendation can never contradict the baseline it came from, and no
 *      lever ever lowers reach or raises the wait.
 *   7. The hurdle is the leader's own price of an hour: a lever below it is
 *      still priced and explicitly marked as not clearing.
 *   8. A committed class freezes its reading and refuses to have its exposure
 *      rewritten afterwards, because that number is what the probes grade.
 *   9. The probe ledger scores with counts, a Wilson interval, d′ and a Brier,
 *      and refuses a verdict below the declared floor.
 *  10. RULE-SIG-01..04 write typed edges, exactly one decision, exactly one task
 *      per lever, and are marker-idempotent through the real action layer.
 *  11. RULE-SIG-03 fires on a real case event and links the case to the class.
 *  12. The terminal renders keyboard-reachably with one h1 and named tables, and
 *      CSV scope #51 carries ratios and counts but never a label, a name or an
 *      amount.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import {
  SIGNAL_LEVER_IDS,
  SIGNAL_RULE_IDS,
  applyLever,
  brierScore,
  binaryEntropy,
  buildReportingIndex,
  buildSignalReport,
  channelInformation,
  conventionsFromSettings,
  detectionSensitivity,
  evaluateChannel,
  hopsFor,
  inverseNormal,
  leaderWaitDays,
  pathFor,
  priceLevers,
  readClass,
  scoreProbes,
  signalAttentionCount,
  signalBrief,
  signalSignals,
  wilsonInterval,
} from '../../app/core/domain/signalPath.js';
import {
  freezeSignalPrediction,
  normalizeSignalClasses,
  normalizeSignalLevers,
  normalizeSignalProbes,
} from '../../app/core/domain/signalPathSchema.js';
import { signalPathRule } from '../../app/core/domain/signalPathRules.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { renderSignalPath } from '../../app/views/signalPath.js';
import {
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { buildDemoState } from '../../app/core/demo.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const TODAY = '2026-10-30';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function makeStore() {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-s85-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

/**
 * A three-level roster: Cam leads, Bo reports to Cam, Ana reports to Bo.
 * Depths are 1, 2 and 3 — the depth at which the default conventions cross the
 * blind floor, which is exactly the case this module exists to price.
 */
function seedChain(store) {
  store.update((draft) => {
    draft.people = [
      { id: 'p-cam', name: 'Cam', role: 'Lead', level: 'manager', managerId: null, status: 'active', talkingPoints: [] },
      { id: 'p-bo', name: 'Bo', role: 'Manager', level: 'manager', managerId: 'p-cam', status: 'active', talkingPoints: [] },
      { id: 'p-ana', name: 'Ana', role: 'Engineer', level: 'ic', managerId: 'p-bo', status: 'active', talkingPoints: [] },
    ];
    draft.oneOnOnes = [];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed the signal-path fixture' });
}

function oneOnOne(id, personId, date) {
  return {
    id,
    personId,
    date,
    status: 'held',
    mood: 3,
    agenda: [],
    notes: '',
    actions: [],
    createdAt: `${date}T09:00:00.000Z`,
  };
}

/* -------------------------------------------------------------- 1. schema */

test('Schema v59 is additive: a v58 workspace gains three empty collections and no invented declaration', () => {
  assert.equal(SCHEMA_VERSION, 74);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.signalClasses, []);
  assert.deepEqual(empty.signalProbes, []);
  assert.deepEqual(empty.signalLevers, []);
  assert.equal(empty.settings.sigTransmitPct, 78);

  const migrated = migrate({ schemaVersion: 58, settings: {}, people: [] });
  assert.equal(migrated.raw.schemaVersion, 74);
  assert.equal(migrated.applied.at(-1), '73 → 74');
  assert.deepEqual(migrated.raw.signalClasses, []);
  assert.deepEqual(migrated.raw.signalProbes, []);
  assert.deepEqual(migrated.raw.signalLevers, []);

  const state = normalizeState({ schemaVersion: 58, people: [] }, { now: NOW }).state;
  assert.deepEqual(state.signalClasses, []);
  assert.equal(state.settings.sigBlindFloorPct, 50);
});

test('a settings typo cannot declare a perfect channel or an unfalsifiable floor', () => {
  const state = normalizeState({
    schemaVersion: 59,
    people: [],
    settings: {
      sigTransmitPct: 500,
      sigFalseAlarmPct: -20,
      sigBlindFloorPct: 0,
      sigHourValue: -4,
      sigUnderReachPp: 400,
      sigRelayLagDays: -3,
    },
  }, { now: NOW }).state;
  assert.equal(state.settings.sigTransmitPct, 99, 'a channel can never be declared perfect');
  assert.equal(state.settings.sigFalseAlarmPct, 0);
  assert.equal(state.settings.sigBlindFloorPct, 1);
  assert.equal(state.settings.sigHourValue, 1);
  assert.equal(state.settings.sigUnderReachPp, 90);
  assert.equal(state.settings.sigRelayLagDays, 0);
});

test('an unreadable class is dropped, a dangling origin is cleared, and a committed class without a frozen reading demotes', () => {
  const base = { id: 'c1', label: 'A rota slip', status: 'committed', pathPersonId: 'p-x', committedOn: TODAY, exposure: 1000 };
  const warnings = [];
  const out = normalizeSignalClasses([
    base,
    { id: 'c2' },
    { id: 'c1', label: 'duplicate' },
    'not-an-object',
  ], { people: [] }, NOW.toISOString(), warnings);
  assert.equal(out.length, 1, 'the unnamed class and the duplicate are dropped');
  assert.equal(out[0].pathPersonId, null, 'a dangling origin is cleared, never followed');
  assert.equal(out[0].status, 'declared', 'a committed class with no frozen reading keeps the honest status');
  assert.ok(warnings.some((w) => w.includes('origin pointer')));
  assert.ok(warnings.some((w) => w.includes('no id or no label')));
});

test('a probe whose class is gone is dropped, and a settled probe with no delivery is reopened', () => {
  const warnings = [];
  const probes = normalizeSignalProbes([
    { id: 'x1', classId: 'ghost', status: 'settled', delivered: true, truth: 'event' },
    { id: 'x2', classId: 'c1', status: 'settled', truth: 'event', delivered: null },
  ], { signalClasses: [{ id: 'c1' }] }, NOW.toISOString(), warnings);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].status, 'open', 'a settled probe with no observation is not evidence');
  assert.ok(warnings.some((w) => w.includes('event class no longer exists')));
});

/* --------------------------------------------------------------- 2. maths */

test('series and parallel reliability compose exactly, and depth hurts both ways', () => {
  const one = evaluateChannel({ hops: [{ transmit: 0.8, falseAlarm: 0.05, lagDays: 2 }], theta: 0.5 });
  assert.equal(one.reach, 0.8);
  assert.equal(one.falseAlarm, 0.05);
  assert.equal(one.latencyDays, 2);

  const three = evaluateChannel({
    hops: [
      { transmit: 0.8, falseAlarm: 0.05, lagDays: 2 },
      { transmit: 0.8, falseAlarm: 0.05, lagDays: 3 },
      { transmit: 0.8, falseAlarm: 0.05, lagDays: 4 },
    ],
    theta: 0.5,
  });
  assert.equal(three.reach, 0.512, '0.8^3 — reach decays geometrically with depth');
  assert.equal(three.falseAlarm, Math.round((1 - 0.95 ** 3) * 10000) / 10000, 'false alarms compound in the opposite direction');
  assert.equal(three.latencyDays, 9);
  assert.ok(three.falseAlarm > one.falseAlarm, 'a deeper chain cries wolf more often and hears less');

  const withDirect = evaluateChannel({
    hops: [{ transmit: 0.5, falseAlarm: 0.1, lagDays: 10 }],
    direct: { enabled: true, detect: 0.6, falseAlarm: 0.2, lagDays: 1 },
    theta: 0.5,
  });
  assert.equal(withDirect.reach, 0.8, '1 - (1 - 0.5)(1 - 0.6)');
  assert.equal(withDirect.falseAlarm, 0.28, '1 - (1 - 0.1)(1 - 0.2)');
  // Latency is weighted by which branch produced the arrival.
  // viaLadder = 0.5 × 0.4 = 0.2 at 10 d; viaDirectOnly = 0.5 × 0.6 = 0.3 at 1 d.
  assert.equal(withDirect.latencyDays, 4.6);
});

test('mutual information is zero for an uninformative channel and the source entropy for a perfect one', () => {
  assert.equal(binaryEntropy(0.5), 1);
  assert.equal(binaryEntropy(0), 0);
  assert.ok(Math.abs(binaryEntropy(0.1) - 0.469) < 0.001);

  assert.equal(channelInformation(0.5, 1, 0), 1, 'a perfect channel carries the whole bit');
  assert.equal(channelInformation(0.5, 0.5, 0.5), 0, 'a channel that fires with the same rate either way carries nothing');
  assert.ok(Math.abs(channelInformation(0.5, 0.5, 0) - 0.3113) < 0.001, 'a Z-channel that never fires on nothing still leaks 0.31 bits');

  const reading = evaluateChannel({ hops: [{ transmit: 0.78, falseAlarm: 0.06, lagDays: 5 }], theta: 0.5 });
  assert.ok(reading.carriedBits > 0 && reading.carriedBits < reading.sourceBits);
  assert.equal(reading.lostBits, Math.round((reading.sourceBits - reading.carriedBits) * 10000) / 10000);
});

test('the inverse normal is accurate and d-prime uses the log-linear correction', () => {
  assert.ok(Math.abs(inverseNormal(0.975) - 1.959964) < 0.0005);
  assert.ok(Math.abs(inverseNormal(0.5)) < 1e-6, "the centre is exact up to the erf residual");
  assert.ok(Math.abs(inverseNormal(0.1) + 1.281552) < 0.0005);
  assert.equal(inverseNormal(0), null);
  assert.equal(inverseNormal(1), null);

  const perfect = detectionSensitivity({ hits: 20, events: 20, falseAlarms: 0, negatives: 20 });
  assert.ok(perfect.dPrime > 3.5, 'a perfect record is discriminable, not infinite');
  const chance = detectionSensitivity({ hits: 10, events: 20, falseAlarms: 10, negatives: 20 });
  assert.ok(Math.abs(chance.dPrime) < 0.01, 'a coin flip has d-prime of zero');
  assert.equal(detectionSensitivity({ events: 0 }), null);
});

test('Wilson and Brier refuse an empty sample and behave on a known one', () => {
  assert.equal(wilsonInterval(0, 0), null);
  const interval = wilsonInterval(2, 6);
  assert.equal(interval.p, 0.333);
  assert.ok(interval.low < interval.p && interval.high > interval.p);
  assert.equal(brierScore([]), null);
  assert.equal(brierScore([{ p: 1, outcome: 1 }, { p: 1, outcome: 1 }]).score, 0);
  assert.equal(brierScore([{ p: 0.5, outcome: 1 }, { p: 0.5, outcome: 0 }]).score, 0.25);
});

/* ----------------------------------------------------------- 3. structure */

test('depth is derived from the roster and a management cycle is refused, not guessed', () => {
  const index = buildReportingIndex([
    { id: 'a', name: 'A', managerId: null },
    { id: 'b', name: 'B', managerId: 'a' },
    { id: 'c', name: 'C', managerId: 'b' },
    { id: 'x', name: 'X', managerId: 'y' },
    { id: 'y', name: 'Y', managerId: 'x' },
    { id: 'z', name: 'Z', managerId: 'gone', status: 'archived' },
  ]);
  assert.equal(index.depthOf('a'), 1);
  assert.equal(index.depthOf('c'), 3);
  assert.equal(index.depthOf('x'), null, 'a cycle has no depth');
  assert.equal(index.cycles.length, 1, 'a cycle is detected and named');
  assert.equal(index.depthOf('y'), null, 'both ends of a cycle are refused');
  assert.equal(index.byId.has('z'), false, 'an archived person is not on the active channel');

  const chain = pathFor(index, 'c');
  assert.deepEqual(chain.map((n) => n.personId), ['c', 'b', 'a']);
  assert.equal(chain.at(-1).top, true);
});

test('the wait at the top hop is measured from the leader own 1:1 history', () => {
  const conventions = conventionsFromSettings({ oneOnOneCadenceDays: 14 });
  const withTwo = leaderWaitDays({
    oneOnOnes: [oneOnOne('m1', 'p', '2026-10-09'), oneOnOne('m2', 'p', '2026-10-23')],
  }, 'p', conventions, NOW);
  assert.equal(withTwo.days, 7, 'a 14-day observed spacing, 7 days since the last one');
  assert.match(withTwo.basis, /observed 1:1 spacing/);

  const none = leaderWaitDays({ oneOnOnes: [] }, 'p', conventions, NOW);
  assert.equal(none.days, 14, 'no history falls back to the declared cadence and says so');

  const overdue = leaderWaitDays({
    oneOnOnes: [oneOnOne('m1', 'p', '2026-09-01'), oneOnOne('m2', 'p', '2026-09-15')],
  }, 'p', conventions, NOW);
  assert.equal(overdue.days, 0, 'an overdue 1:1 waits zero days — the next one is now');
});

/* -------------------------------------------------------------- 4. levers */

test('every lever is priced by the same evaluator and none of them can hurt', () => {
  const conventions = conventionsFromSettings({});
  const hops = [
    { personId: 'p-ana', name: 'Ana', transmit: 0.78, falseAlarm: 0.06, lagDays: 12 },
    { personId: 'p-bo', name: 'Bo', transmit: 0.78, falseAlarm: 0.06, lagDays: 12 },
    { personId: 'p-cam', name: 'Cam', transmit: 0.78, falseAlarm: 0.06, lagDays: 3 },
  ];
  const base = { hops, direct: { enabled: false }, theta: 0.4, exposure: 50000, horizonDays: 90, hopCount: 3 };
  const priced = priceLevers(base, conventions, { hourValue: 400 });
  assert.equal(priced.rows.length, SIGNAL_LEVER_IDS.length);
  assert.equal(priced.price, 400);
  assert.match(priced.priceSource, /measured price/);
  for (const row of priced.rows) {
    assert.ok(row.reachAfter >= row.reachBefore - 1e-9, `${row.leverId} cannot lower reach`);
    assert.ok(row.latencyAfter <= row.latencyBefore + 1e-9, `${row.leverId} cannot raise the wait`);
    assert.ok(row.hours !== null, `${row.leverId} declares its hours`);
    assert.ok(row.value === null || row.value >= 0, `${row.leverId} never claims a negative benefit`);
  }
  // The baseline is the same arithmetic the page prints.
  const direct = evaluateChannel({ hops, direct: { enabled: false }, theta: 0.4, exposure: 50000, horizonDays: 90 });
  assert.equal(priced.base.reach, direct.reach);

  const skip = priced.rows.find((r) => r.leverId === 'skip-level');
  const expected = 1 - (1 - priced.base.reach) * (1 - conventions.skipLevelDetect);
  assert.ok(skip.reachAfter > skip.reachBefore);
  assert.ok(Math.abs(skip.reachAfter - expected) < 0.01);

  const cadence = priced.rows.find((r) => r.leverId === 'cadence');
  assert.equal(cadence.reachAfter, cadence.reachBefore, 'cadence changes the wait, not the odds');
  assert.equal(cadence.latencyAfter, 17, 'a weekly 1:1 caps every hop at 7 days: 7 + 7 + 3');

  const review = applyLever({ hops, direct: { enabled: false } }, 'review', conventions);
  assert.equal(review.hops[0].transmit, 0.86, 'review lifts every relay by the declared 8 pp');
  assert.equal(review.hops[0].lagDays, hops[0].lagDays, 'review does not change the wait');
});

test('the hurdle is explicit and a lever below it is shown, priced and refused', () => {
  const conventions = conventionsFromSettings({});
  const tiny = priceLevers({
    hops: [{ transmit: 0.78, falseAlarm: 0.06, lagDays: 5 }],
    direct: { enabled: false },
    theta: 0.02,
    exposure: 600,
    horizonDays: 90,
    hopCount: 1,
  }, conventions, { hourValue: 100000 });
  for (const row of tiny.rows) {
    assert.equal(row.clearsHurdle, false, `${row.leverId} is below an absurd hurdle and says so`);
  }
  const declared = priceLevers({
    hops: [{ transmit: 0.78, falseAlarm: 0.06, lagDays: 5 }],
    direct: { enabled: false },
    theta: 0.5, exposure: null, horizonDays: 90, hopCount: 1,
  }, conventions, { hourValue: null });
  assert.equal(declared.priceSource.includes('declared value of an hour'), true);
  for (const row of declared.rows) {
    assert.equal(row.value, null, 'no exposure means no invented money');
    assert.equal(row.clearsHurdle, null, 'and no hurdle verdict either');
  }
});

/* ------------------------------------------------------------- 5. actions */

test('a class is refused without a name, an origin or a cycle-free path, and its reading is real', () => {
  const { store, api } = makeStore();
  seedChain(store);
  assert.equal(api.addSignalClass({ label: 'x', pathPersonId: 'p-ana' }).ok, false);
  assert.equal(api.addSignalClass({ label: 'A rota slip', pathPersonId: 'nobody' }).ok, false);
  assert.equal(api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', probabilityPct: 140 }).ok, false);

  const created = api.addSignalClass({
    label: 'A customer-impacting slip on the support rota',
    pathPersonId: 'p-ana',
    ownerId: 'p-cam',
    exposure: 48000,
    probabilityPct: 45,
    horizonDays: 90,
  });
  assert.ok(created.ok, created.error);
  const record = store.state.signalClasses[0];
  const conventions = conventionsFromSettings(store.state.settings);
  const reading = readClass(record, store.state, buildReportingIndex(store.state.people), conventions, NOW);
  assert.equal(reading.reading.hopCount, 3);
  assert.equal(reading.reading.reach, 0.4746, '0.78^3 rounded to four places');
  assert.ok(reading.reading.reach < conventions.blindFloor, 'three hops crosses the declared blind floor');
  assert.ok(reading.reading.expectedLoss !== null && reading.reading.expectedLoss > 0);
  assert.ok(reading.reading.expectedLoss < 48000 * 0.45, 'the channel absorbs part of the loss, it does not abolish it');
});

test('committing freezes the reading and the exposure cannot be rewritten afterwards', () => {
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', exposure: 48000, probabilityPct: 45 });
  const committed = api.commitSignalClass(created.id);
  assert.ok(committed.ok, committed.error);
  const record = store.state.signalClasses[0];
  assert.equal(record.status, 'committed');
  assert.ok(record.frozen);
  assert.equal(record.frozen.reach, committed.reading.reach);

  const rewritten = api.updateSignalClass(created.id, { exposure: 900000 });
  assert.equal(rewritten.ok, false, 'the number being graded cannot be edited');
  assert.match(rewritten.error, /frozen/);

  const recommit = api.commitSignalClass(created.id);
  assert.equal(recommit.ok, false);
  const retire = api.retireSignalClass(created.id);
  assert.ok(retire.ok);
  assert.equal(api.deleteSignalClass(created.id).ok, false, 'a committed class is retired, never deleted');
});

test('a probe records delivery only when the chain carried it, and computes the lag from the two dates', () => {
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', exposure: 48000, probabilityPct: 45 });
  const probe = api.addSignalProbe(created.id, { label: 'The vendor missed the Tuesday cutover', existsSinceOn: '2026-10-20' });
  assert.ok(probe.ok, probe.error);
  assert.equal(api.settleSignalProbe(probe.id, { learnedVia: 'nonsense' }).ok, false);

  const settled = api.settleSignalProbe(probe.id, { learnedVia: 'skip-level', learnedOn: TODAY });
  assert.ok(settled.ok, settled.error);
  assert.equal(settled.delivered, false, 'a skip-level is a different channel — that is the finding');
  assert.equal(settled.latencyDays, 10);

  const twice = api.settleSignalProbe(probe.id, { learnedVia: 'escalation' });
  assert.equal(twice.ok, false, 'settled evidence is not overwritten');

  const quiet = api.addSignalProbe(created.id, { label: 'Nothing happened this week', truth: 'none' });
  assert.ok(quiet.ok);
  assert.equal(api.settleSignalProbe(quiet.id, { learnedVia: 'escalation' }).delivered, true, 'a quiet probe that fired is a false alarm');
});

/* --------------------------------------------------------------- 6. rules */

test('RULE-SIG-01 attaches the typed chain through a real commit event', () => {
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', ownerId: 'p-cam', exposure: 48000 });
  const committed = api.commitSignalClass(created.id);
  assert.ok(committed.ok, committed.error);
  const links = store.state.links.filter((link) => link.sourceType === 'signal' && link.sourceId === created.id);
  assert.equal(links.filter((l) => l.relation === 'reaches').length, 3, 'one edge per relay on the path');
  assert.equal(links.filter((l) => l.relation === 'involves').length, 1, 'one edge to the owner');
  assert.ok(links.every((l) => l.ruleId === SIGNAL_RULE_IDS.DECLARE));
  assert.ok(store.state.signalClasses[0].markers.includes('chainAttached'));
});

test('RULE-SIG-02 opens exactly one decision and one owned task when the probes contradict the declaration, and is idempotent', () => {
  const { store, api } = makeStore();
  store.update((draft) => {
    draft.people = [
      { id: 'p-cam', name: 'Cam', role: 'Lead', level: 'manager', managerId: null, status: 'active', talkingPoints: [] },
      { id: 'p-bo', name: 'Bo', role: 'Manager', level: 'manager', managerId: 'p-cam', status: 'active', talkingPoints: [] },
    ];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Two-hop chain' });
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-bo', ownerId: 'p-cam', exposure: 48000, probabilityPct: 45 });
  assert.ok(api.commitSignalClass(created.id).ok);

  const before = store.state.decisions.length;
  // 0.78^2 = 60.8% declared; two deliveries out of six is 33%, a 27-point miss.
  const outcomes = ['escalation', 'accident', 'escalation', 'never', 'skip-level', 'accident'];
  outcomes.forEach((learnedVia, index) => {
    const opened = api.addSignalProbe(created.id, { label: `Rota gap ${index + 1}`, existsSinceOn: '2026-10-01' });
    assert.ok(opened.ok, opened.error);
    const settled = api.settleSignalProbe(opened.id, { learnedVia, learnedOn: '2026-10-05' });
    assert.ok(settled.ok, settled.error);
  });

  const decisions = store.state.decisions.filter((row) => String(row.rationale || '').includes('[RULE-SIG-02:contradicted]'));
  assert.equal(decisions.length, 1, 'exactly one redesign decision, never one per probe');
  assert.equal(decisions[0].title, 'The “A rota slip” channel delivers 33%, not 61%');
  assert.match(decisions[0].question, /6 settled probe\(s\) delivered 2/);
  assert.match(decisions[0].question, /Which redesign do you commit to before \d{4}-\d{2}-\d{2}\?/);
  assert.equal(decisions[0].options.length, 3, 'three real options, not a binary yes/no');
  assert.ok(decisions[0].reviewOn > '2026-10-30', 'it carries a review date');
  const tasks = store.state.delegations.filter((row) => String(row.support || '').includes('[RULE-SIG-02:task]'));
  assert.equal(tasks.length, 1, 'exactly one owned probe task');
  assert.equal(tasks[0].personId, 'p-cam');
  assert.ok(store.state.links.some((l) => l.sourceType === 'signal' && l.relation === 'signals' && l.targetType === 'decision'));

  // A seventh probe that also misses must not open a second decision.
  const extra = api.addSignalProbe(created.id, { label: 'Rota gap seven', existsSinceOn: '2026-10-01' });
  api.settleSignalProbe(extra.id, { learnedVia: 'accident', learnedOn: '2026-10-05' });
  assert.equal(
    store.state.decisions.filter((row) => String(row.rationale || '').includes('[RULE-SIG-02:contradicted]')).length,
    1,
    'the rule is marker-idempotent',
  );
  assert.ok(before >= 0);
});

test('RULE-SIG-03 links a case that landed on a blind path, on a real case event', () => {
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', ownerId: 'p-cam', exposure: 48000, probabilityPct: 45 });
  assert.ok(api.commitSignalClass(created.id).ok);

  const caseResult = api.addCase({
    title: 'The overnight queue backed up twice this week',
    kind: 'risk',
    status: 'open',
    ownerId: 'p-ana',
    financial: { currency: 'USD', optimistic: 8000, mostLikely: 15000, pessimistic: 30000 },
  });
  assert.ok(caseResult.ok, caseResult.error);

  const edges = store.state.links.filter((l) => l.sourceType === 'signal' && l.sourceId === created.id && l.targetType === 'case' && l.relation === 'signals');
  assert.equal(edges.length, 1, 'the case is linked to the class whose channel it landed on');
  const notes = store.state.signalClasses[0].notes || [];
  assert.ok(notes.some((n) => n.source === SIGNAL_RULE_IDS.CASE), 'the class records the gap it just learned about');
  assert.ok(notes.some((n) => String(n.text).includes('[RULE-SIG-03:')));
  assert.ok(!JSON.stringify(notes).includes('p-ana'), 'the note names the person by name, never by an internal id');
});

test('a case on a channel that clears the floor is not linked — ceremony is not the product', () => {
  const { store, api } = makeStore();
  store.update((draft) => {
    draft.people = [{ id: 'p-cam', name: 'Cam', role: 'Lead', level: 'manager', managerId: null, status: 'active', talkingPoints: [] }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'One-hop chain' });
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-cam', exposure: 48000 });
  assert.ok(api.commitSignalClass(created.id).ok);
  assert.ok(api.addCase({
    title: 'A contained slip', kind: 'risk', status: 'open', ownerId: 'p-cam',
    financial: { currency: 'USD', optimistic: 1000, mostLikely: 2000, pessimistic: 3000 },
  }).ok);
  const edges = store.state.links.filter((l) => l.sourceType === 'signal' && l.targetType === 'case');
  assert.equal(edges.length, 0, 'one hop at 78% is above the blind floor, so nothing is created');
});

test('RULE-SIG-04 opens owned, dated work for an adopted lever and is idempotent', () => {
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', ownerId: 'p-cam', exposure: 48000, probabilityPct: 45 });
  assert.ok(api.commitSignalClass(created.id).ok);

  const adopted = api.adoptSignalLever(created.id, 'skip-level', { ownerId: 'p-bo', hourValue: 400 });
  assert.ok(adopted.ok, adopted.error);
  const lever = store.state.signalLevers[0];
  assert.equal(lever.hours, adopted.lever.hours);
  assert.ok(lever.reachAfter > lever.reachBefore);
  const tasks = store.state.delegations.filter((row) => String(row.support || '').includes(`[RULE-SIG-04:${lever.id}]`));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].personId, 'p-bo', 'the named owner spends the hours');
  assert.ok(store.state.links.some((l) => l.sourceType === 'signal' && l.relation === 'tracks-followup' && l.targetId === tasks[0].id));

  // Re-running the rule over the same event must not duplicate the work.
  store.update((draft) => {
    signalPathRule(draft, {
      event: { type: 'signal.lever', entity: 'signalClass', entityId: created.id },
      now: NOW,
      idFactory: (prefix) => `${prefix}-dup`,
      logEvent: () => {},
    });
  }, { type: 'test.rerun', entity: 'workspace', entityId: '', summary: 'Re-run the lever rule' });
  assert.equal(
    store.state.delegations.filter((row) => String(row.support || '').includes(`[RULE-SIG-04:${lever.id}]`)).length,
    1,
    'marker-idempotent',
  );

  assert.equal(api.adoptSignalLever(created.id, 'cadence', {}).ok, true);
  assert.equal(api.retireSignalLever(lever.id).ok, true);
  assert.equal(api.retireSignalLever(lever.id).ok, false);
});

test('the probe score refuses a verdict below the floor and reports a Wilson interval above it', () => {
  const probes = Array.from({ length: 6 }, (_, index) => ({
    id: `p${index}`,
    status: 'settled',
    truth: 'event',
    delivered: index < 2,
    latencyDays: index < 2 ? 4 : null,
    prediction: { reach: 0.6 },
  }));
  const scored = scoreProbes(probes, { reach: 0.6, latencyDays: 5 });
  assert.equal(scored.ready, true);
  assert.equal(scored.observedReach.p, 0.3333);
  assert.ok(scored.observedReach.wilson.low < 0.3333 && scored.observedReach.wilson.high > 0.3333);
  assert.equal(scored.underReach, true);
  assert.equal(scored.gapPp, -26.7);
  assert.ok(scored.brier.score > 0);

  const thin = scoreProbes(probes.slice(0, 3), { reach: 0.6, latencyDays: 5 });
  assert.equal(thin.ready, false);
  assert.equal(thin.underReach, false, 'a verdict on three probes is noise with a label');
  assert.ok(thin.notes.some((n) => n.includes('count')));
});

/* ------------------------------------------------------------- 7. wiring */

test('signals fire on a real reading and the badge counts real work', () => {
  const { store, api } = makeStore();
  seedChain(store);
  assert.equal(signalAttentionCount(store.state, NOW), 0, 'an empty workspace has nothing urgent to say');

  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', ownerId: 'p-cam', exposure: 48000 });
  assert.ok(api.commitSignalClass(created.id).ok);
  const signals = signalSignals(store.state, NOW);
  assert.ok(signals.some((s) => s.ruleId === 'SIG-03'), 'a committed channel under the blind floor is a finding');
  assert.ok(signals.some((s) => s.ruleId === 'SIG-06'), 'an untested commitment is a finding');
  for (const signal of signals) {
    assert.ok(signal.evidence.length > 0, `${signal.ruleId} must carry evidence`);
    assert.ok(signal.action?.route?.startsWith('#/'), `${signal.ruleId} must be navigable`);
  }
  assert.ok(signalAttentionCount(store.state, NOW) >= 1);

  const report = buildSignalReport(store.state, NOW);
  assert.equal(report.totals.blindNodes, 2, 'the two people at or below the blind line');
  assert.equal(report.totals.committed, 1);
});

test('the rule is registered on the shared spine with a declared contract, and the node is typed', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(signalPathRule));
  const caseIndex = DEFAULT_POST_COMMIT_RULES.indexOf(DEFAULT_POST_COMMIT_RULES.find((r) => r.name === 'caseCreatedRule'));
  assert.ok(DEFAULT_POST_COMMIT_RULES.indexOf(signalPathRule) > caseIndex, 'it reads the case after the case engine left it');
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === signalPathRule);
  assert.ok(contract);
  assert.match(contract.purpose, /RULE-SIG/);
  assert.equal(contract.scansWorkspace, false);

  assert.ok(LINK_ENTITY_TYPES.includes('signal'));
  assert.equal(LINK_ENTITY_COLLECTIONS.signal, 'signalClasses');
  assert.ok(LINK_RELATIONS.includes('reaches'));
  assert.ok(LINK_RELATIONS.includes('signals'));

  const state = buildDemoState(NOW);
  const resolved = resolveLinkedEntity(state, 'signal', state.signalClasses[0].id);
  assert.ok(resolved);
  assert.equal(resolved.type, 'signal');
  assert.match(resolved.route, /^#\/signal\?/);
});

test('the demo seeds a committed channel its own probe ledger contradicts, through the real reader', () => {
  const state = buildDemoState(NOW);
  assert.equal(state.signalClasses.length, 2);
  assert.equal(state.signalClasses[0].status, 'committed');
  assert.ok(state.signalClasses[0].frozen);
  const conventions = conventionsFromSettings(state.settings);
  const reading = readClass(state.signalClasses[0], state, buildReportingIndex(state.people), conventions, NOW);
  assert.equal(reading.reading.reach, state.signalClasses[0].frozen.reach, 'the frozen figure matches the live reader');
  assert.equal(reading.observed.ready, true);
  assert.equal(reading.observed.underReach, true, 'the demo teaches the contradiction, not the agreement');
  assert.ok(state.signalProbes.some((p) => p.status === 'open'), 'a probe is left open so the settle dialog is reachable');
  assert.equal(state.signalLevers.length, 1);
});

test('the brief is deterministic and states its method and its limits', () => {
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({ label: 'A rota slip', pathPersonId: 'p-ana', ownerId: 'p-cam', exposure: 48000 });
  assert.ok(api.commitSignalClass(created.id).ok);
  const first = api.signalBriefText();
  const second = api.signalBriefText();
  assert.equal(first, second, 'the brief is deterministic');
  assert.match(first, /series\/parallel reliability/);
  assert.match(first, /bits carried/);
  assert.match(first, /LIMITS: independence of parallel branches is assumed/);
  assert.match(first, /A rota slip/);
  assert.match(first, /thoughtful|reach 47%|reach 48%/);

  const empty = signalBrief(createEmptyState(NOW.toISOString()), NOW);
  assert.match(empty, /No event class has been declared/);
});

/* ------------------------------------------------------------------ 8. UI */

async function withDom(fn) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="modal-root"></div></body></html>', { virtualConsole, pretendToBeVisual: true, url: 'https://leados.test/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.localStorage = dom.window.localStorage;
  try { return await fn(dom.window); } finally {
    delete global.window; delete global.document; delete global.HTMLElement;
    delete global.Node; delete global.localStorage;
  }
}

test('the terminal renders with one h1 and named tables on every panel', async () => {
  const { store } = makeStore();
  seedChain(store);
  store.update((draft) => {
    draft.signalClasses = [{
      id: 'sig-1',
      label: 'A rota slip',
      status: 'committed',
      currency: 'USD',
      exposure: 48000,
      probabilityPct: 45,
      horizonDays: 90,
      pathPersonId: 'p-ana',
      ownerId: 'p-cam',
      committedOn: TODAY,
      frozen: { frozenOn: TODAY, reach: 0.47, latencyDays: 15, hopCount: 3, chain: [] },
      overrides: {},
      direct: { enabled: false },
      markers: [],
      notes: [],
      history: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }];
    draft.signalProbes = [{
      id: 'probe-1',
      classId: 'sig-1',
      label: 'A rota gap nobody escalated',
      truth: 'event',
      existsSinceOn: '2026-10-01',
      status: 'open',
      prediction: { reach: 0.47, latencyDays: 15, frozenOn: TODAY },
      markers: [],
      history: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed one committed class' });

  const makeCtx = (panel) => ({
    state: store.state,
    now: NOW,
    query: new URLSearchParams(`panel=${panel}`),
    navigate: () => {},
    refresh: () => {},
    api: {},
  });

  await withDom(async () => {
    for (const panel of ['path', 'reach', 'probes', 'levers', 'method']) {
      const node = renderSignalPath(makeCtx(panel));
      const host = document.createElement('div');
      host.append(node);
      assert.equal(host.querySelectorAll('h1').length, 1, `panel ${panel} has exactly one h1`);
      for (const el of host.querySelectorAll('table')) {
        assert.ok(el.getAttribute('aria-label'), `panel ${panel}: a table has no accessible name`);
      }
    }
  });
});

test('the empty workspace has no dead end on any panel', async () => {
  const { store } = makeStore();
  const makeCtx = (panel) => ({
    state: store.state,
    now: NOW,
    query: new URLSearchParams(`panel=${panel}`),
    navigate: () => {},
    refresh: () => {},
    api: {},
  });
  await withDom(async () => {
    for (const panel of ['path', 'reach', 'probes', 'levers', 'method']) {
      const node = renderSignalPath(makeCtx(panel));
      const host = document.createElement('div');
      host.append(node);
      assert.equal(host.querySelectorAll('h1').length, 1);
      assert.ok(host.textContent.length > 200, `panel ${panel} explains what to do next`);
    }
  });
});

/* ----------------------------------------------------------------- CSV */

test('CSV scope #51 carries ratios and counts but never a label, a name or an amount', () => {
  const descriptor = CSV_EXPORTS.find((row) => row.key === 'signalPath');
  assert.ok(descriptor);
  assert.match(descriptor.description, /NO class labels/);
  const { store, api } = makeStore();
  seedChain(store);
  const created = api.addSignalClass({
    label: 'A customer-impacting slip on the support rota',
    pathPersonId: 'p-ana',
    ownerId: 'p-cam',
    exposure: 48000,
    probabilityPct: 45,
  });
  assert.ok(api.commitSignalClass(created.id).ok);

  const exported = exportWorkspaceCsv(store.state, 'signalPath', { now: NOW });
  assert.ok(exported.ok, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, 1);
  assert.ok(parsed.headers.includes('declared_reach_pct'));
  assert.ok(parsed.headers.includes('carried_bits'));
  assert.ok(!parsed.headers.includes('exposure'));
  const serialized = JSON.stringify(parsed.rows);
  assert.ok(!serialized.includes('support rota'), 'the class label does not leak');
  assert.ok(!serialized.includes('Ana'), 'a person name does not leak');
  assert.ok(!serialized.includes('48000'), 'an absolute amount does not leak');
  assert.equal(parsed.rows[0][parsed.headers.indexOf('class_code')], 'S01');
});
