// ADR-0220 — Variable-Pay Design & Incentive Integrity Register (Schema v174).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — six empty ledgers and one declared
//      convention, and no plan, measure, reading, award or recovery is inferred
//      from anything an upgraded workspace already holds;
//   2. MONEY IS EXACT AND SURVIVES RELOAD — a stored cents integer is never
//      routed back through a major-unit parser, so 250,000.00 cannot become
//      25,000,000.00 on the second load;
//   3. a count and an amount never share a field, and a third decimal place is
//      refused rather than rounded;
//   4. THE VERIFIER IS PROVED, NOT NAMED — the funding line cannot verify its own
//      number, a peer line cannot, and a person who is paid on the measure
//      cannot;
//   5. a MEASURED award without a verified reading in force on its decision day
//      is refused at the door, and one with it is accepted;
//   6. every award lands in EXACTLY ONE money bucket, and the provable total
//      never contains missed, discretionary, unverified, recovery-due or
//      contested money;
//   7. THE SAME OUTCOME PAID TWICE is CONTESTED — both amounts held out of the
//      provable total, the pair named, and the ask sent above BOTH funding lines;
//   8. a restatement that no longer meets the target makes the award
//      recovery-due; a recovery is a recorded human act, never an automatic
//      reversal, and it can never exceed the award;
//   9. verification DRIFT weakens an award after the fact: a verifier the live
//      matrix no longer puts above the funding line makes the award unverified;
//  10. RULE-INC-01 files one opaque ask per condition, is idempotent, closes its
//      own ask when the condition clears, respects a human's answer, and is
//      paused on every path including a scan;
//  11. "the figures add up" and "the printed figures are the computed ones" are
//      reported as TWO claims;
//  12. the CSV boundary is aggregate and identity-free, and the panel prints the
//      reader's own figures, cell by cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS, normalizeSettings } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  buildIncentiveIntegrity,
  incentiveAttentionCount,
  incentiveCsvRows,
  readingInForce,
  readingMeetsTarget,
  terminalRestatement,
  verifierStanding,
  liveIncPlans,
} from '../../app/core/domain/incentiveIntegrity.js';
import {
  centsToDisplay,
  normalizeIncPlans,
  normalizeIncMeasures,
  normalizeIncReadings,
  parseMoneyInputToCents,
  readStoredCents,
} from '../../app/core/domain/incentiveSchema.js';
import {
  incentiveConditions,
  incentiveRule,
  indexIncentiveAsks,
} from '../../app/core/domain/incentiveRules.js';
import {
  INC_CSV_SCOPE,
  INC_LIMITS,
  INC_RIGHTS,
  INC_RULE_ID,
  INC_SETTING_KEYS,
} from '../../app/core/domain/incentiveRegistry.js';
import { renderIncentive } from '../../app/views/incentive.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const L = INC_LIMITS;
const BASIS = 'This envelope funds the quarter’s variable pay against the delivery measures agreed with the line above it.';

const person = (id, managerId, level) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  level,
  role: 'Executive',
  status: 'active',
  startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
});

// ceo (rank 4) → dan (director, rank 3) → mia (manager, rank 2) → ivo (IC)
//                                     → kai (manager, rank 2) → lea (IC)
// ivo ALSO answers to kai on a declared project line: one person, two funding
// lines. That is the matrix case the contest test runs on.
function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'vp'),
    person('dan', 'ceo', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'dan', 'manager'),
    person('lea', 'kai', 'ic'),
  ];
  raw.reportingLines = [{
    id: 'rl-ivo-kai', personId: 'ivo', managerId: 'kai', kind: 'project', shareH: 20,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  return normalizeState(raw, { now: at('2026-11-15') }).state;
}

function seed(state = fixture(), startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  return { store, api, sit, on, values, storage, clock: () => clock };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return run(dom);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

/* ------------------------------------------------------------------ helpers */

function declarePlan(env, overrides = {}) {
  env.sit('dan');
  return env.api.incentiveDeclarePlan({
    label: 'Directorate variable pay',
    ownerId: 'dan',
    currency: 'DKK',
    ceiling: '250000.00',
    periodFrom: '2026-10-01',
    periodTo: '2026-12-31',
    basis: BASIS,
    ...overrides,
  });
}

function addMeasure(env, planId, overrides = {}) {
  env.sit('dan');
  return env.api.incentiveAddMeasure({
    planId,
    key: 'delivery-margin',
    label: 'Delivery margin',
    direction: 'increase',
    unit: 'money',
    target: '100000.00',
    control: 'line',
    ...overrides,
  });
}

function recordReading(env, measureId, overrides = {}, seatId = 'ceo') {
  env.sit(seatId);
  return env.api.incentiveRecordReading({
    measureId,
    actual: '120000.00',
    asOf: '2026-11-10',
    evidenceKind: 'decision',
    evidenceId: 'dec-77',
    note: '',
    ...overrides,
  });
}

function recordAward(env, planId, overrides = {}) {
  env.sit('dan');
  return env.api.incentiveRecordAward({
    planId,
    personId: 'ivo',
    amount: '10000.00',
    basisKind: 'measured',
    decidedOn: '2026-11-12',
    measureId: null,
    ...overrides,
  });
}

/** A complete, provable setup: one plan, one measure, one verified reading. */
function provableFixture(env) {
  const plan = declarePlan(env);
  assert.equal(plan.ok, true, plan.error);
  const measure = addMeasure(env, plan.planId);
  assert.equal(measure.ok, true, measure.error);
  const reading = recordReading(env, measure.measureId);
  assert.equal(reading.ok, true, reading.error);
  return { planId: plan.planId, measureId: measure.measureId, readingId: reading.readingId };
}

function planById(report, id) {
  return report.plans.find((row) => row.id === id) || null;
}

/* ------------------------------------------------------------- 1. schema */

test('ADR-0220 schema: the bump is additive — six empty ledgers, one declared convention, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 177);
  for (const key of ['incentivePlans', 'incentiveMeasures', 'incentiveReadings', 'incentiveAwards', 'incentiveRecoveries', 'incentiveMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const empty = createEmptyState(T0);
  for (const key of ['incentivePlans', 'incentiveMeasures', 'incentiveReadings', 'incentiveAwards', 'incentiveRecoveries', 'incentiveMarkers']) {
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  assert.equal(normalizeSettings({})[INC_SETTING_KEYS.autoPropagate], true, 'the pause switch defaults ON');

  const old = createEmptyState(T0);
  old.schemaVersion = 173;
  const migrated = migrate(old);
  assert.deepEqual(migrated.applied, ['173 → 174', '174 → 175', '175 → 176', '176 → 177']);
  assert.equal(migrated.raw.schemaVersion, 177);
  for (const key of ['incentivePlans', 'incentiveMeasures', 'incentiveReadings', 'incentiveAwards', 'incentiveRecoveries', 'incentiveMarkers']) {
    assert.deepEqual(migrated.raw[key], [], `${key} is added empty rather than inferred`);
  }
  assert.equal(migrated.raw.settings[INC_SETTING_KEYS.autoPropagate], true);
});

/* --------------------------------------------------------------- 2. money */

test('ADR-0220 money: exact cents survive a reload, and no third decimal place is rounded', () => {
  assert.equal(parseMoneyInputToCents('250000.00'), 25_000_000);
  assert.equal(parseMoneyInputToCents('12.5'), 1250);
  assert.equal(parseMoneyInputToCents('12.505'), null, 'a third decimal place is a different amount');
  assert.equal(parseMoneyInputToCents('1,000'), null);
  assert.equal(parseMoneyInputToCents('-1'), null);
  assert.equal(parseMoneyInputToCents('1e3'), null);
  assert.equal(readStoredCents(25_000_000), 25_000_000);
  assert.equal(readStoredCents(12.5), null, 'a stored cents value is an integer or it is unreadable');
  assert.equal(centsToDisplay(25_000_000), '250,000.00');

  const env = seed();
  const plan = declarePlan(env);
  assert.equal(plan.ok, true, plan.error);
  const stored = env.store.state.incentivePlans[0];
  assert.equal(stored.ceilingCents, 25_000_000);
  // The reload is the loader the whole app uses.
  const reloaded = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') }).state;
  assert.equal(reloaded.incentivePlans[0].ceilingCents, 25_000_000, 'the stored figure is read back exactly, never re-parsed');
  const report = env.api.incentiveReport();
  assert.equal(planById(report, plan.planId).ceilingCents, 25_000_000);
});

/* ---------------------------------------------------------------- 3. doors */

test('ADR-0220 plan door: currency, ceiling, window and ownership are proved before anything is written', () => {
  const env = seed();
  assert.equal(declarePlan(env, { currency: 'KRONER' }).ok, false, 'a currency is three letters');
  assert.equal(declarePlan(env, { ceiling: '0' }).ok, false, 'an envelope of zero is not an envelope');
  assert.equal(declarePlan(env, { ceiling: '10.005' }).ok, false, 'a third decimal place is refused');
  assert.equal(declarePlan(env, { periodTo: '2026-10-01' }).ok, false, 'the window must run forwards');
  assert.equal(declarePlan(env, { basis: 'because' }).ok, false, 'a basis of one word is not a basis');
  // dan holds lea through kai, so lea IS a legitimate funding line for dan; the
  // refusal is for a person above dan's own span.
  assert.equal(declarePlan(env, { ownerId: 'ceo' }).ok, false, 'a director does not declare a plan on a line above their own');
  const good = declarePlan(env);
  assert.equal(good.ok, true, good.error);
  assert.equal(declarePlan(env).ok, false, 'two live envelopes on one funding line and window are refused');
  assert.equal(env.store.state.incentivePlans.length, 1, 'nothing half-written');
});

test('ADR-0220 measure door: the unit decides the field, the key is unique per plan, and control is declared', () => {
  const env = seed();
  const plan = declarePlan(env);
  assert.ok(plan.ok, plan.error);
  assert.equal(addMeasure(env, plan.planId, { control: 'guess' }).ok, false, 'control is declared, never inferred');
  assert.equal(addMeasure(env, plan.planId, { direction: 'sideways' }).ok, false);
  assert.equal(addMeasure(env, plan.planId, { target: '0' }).ok, false, 'a target of zero is not a target');
  assert.equal(addMeasure(env, plan.planId, { target: '100.505' }).ok, false, 'a third decimal place is not a target');
  const twoPlaces = addMeasure(env, plan.planId, { key: 'stretch', label: 'Stretch', target: '100.50' });
  assert.equal(twoPlaces.ok, true, twoPlaces.error);
  assert.equal(env.store.state.incentiveMeasures.find((row) => row.id === twoPlaces.measureId).targetCents, 10_050, 'exactly two decimal places, nothing rounded');
  const good = addMeasure(env, plan.planId);
  assert.equal(good.ok, true, good.error);
  assert.equal(addMeasure(env, plan.planId).ok, false, 'one key per plan');
  const stored = env.store.state.incentiveMeasures.find((row) => row.key === 'delivery-margin');
  assert.equal(stored.targetCents, 10_000_000);
  assert.equal(stored.targetCount, null, 'count and money never share a field');
  // A count measure stores the count field, and never the cents field.
  const count = addMeasure(env, plan.planId, { key: 'units-shipped', label: 'Units shipped', unit: 'count', target: '5000' });
  assert.equal(count.ok, true, count.error);
  const storedCount = env.store.state.incentiveMeasures.find((row) => row.id === count.measureId);
  assert.equal(storedCount.targetCount, 5000);
  assert.equal(storedCount.targetCents, null);
  const loaded = normalizeIncMeasures([{ ...storedCount, targetCents: 5000 }], []);
  assert.equal(loaded.length, 0, 'a reading carrying the wrong field for its unit is unreadable');
});

/* ----------------------------------------------------------- 4. verification */

test('ADR-0220 verification: the funding line, a peer line and a beneficiary all fail the door; the seat above passes', () => {
  const env = seed();
  const plan = declarePlan(env);
  const measure = addMeasure(env, plan.planId);
  assert.ok(plan.ok && measure.ok);

  const ownNumber = recordReading(env, measure.measureId, {}, 'dan');
  assert.equal(ownNumber.ok, false, 'the funding line does not verify its own number');
  assert.match(ownNumber.error, /own number|above/i);

  const peer = recordReading(env, measure.measureId, {}, 'mia');
  assert.equal(peer.ok, false, 'a seat below the funding line cannot verify it either');

  const above = recordReading(env, measure.measureId, {}, 'ceo');
  assert.equal(above.ok, true, above.error);
  assert.equal(env.store.state.incentiveReadings.length, 1);

  // A frontline seat is refused on rank alone, before any question of interest.
  env.sit('ivo');
  const frontline = recordReading(env, measure.measureId, { actual: '999999.00', asOf: '2026-11-14' }, 'ivo');
  assert.equal(frontline.ok, false);

  // The beneficiary guard, proved where it can actually bite: a manager who is
  // above the funding line AND holds an award priced off that same measure.
  env.sit('dan');
  const small = env.api.incentiveDeclarePlan({
    label: 'Team delivery envelope', ownerId: 'ivo', currency: 'DKK', ceiling: '50000.00',
    periodFrom: '2026-10-01', periodTo: '2026-12-31', basis: BASIS,
  });
  assert.equal(small.ok, true, small.error);
  const smallMeasure = env.api.incentiveAddMeasure({
    planId: small.planId, key: 'team-output', label: 'Team output', direction: 'increase',
    unit: 'money', target: '10000.00', control: 'line',
  });
  assert.equal(smallMeasure.ok, true, smallMeasure.error);
  env.sit('mia');
  const seated = env.api.incentiveRecordReading({
    measureId: smallMeasure.measureId, actual: '20000.00', asOf: '2026-11-10',
    evidenceKind: 'decision', evidenceId: 'dec-88', note: '',
  });
  assert.equal(seated.ok, true, seated.error);
  env.sit('dan');
  const paidVerifier = env.api.incentiveRecordAward({
    planId: small.planId, personId: 'mia', measureId: smallMeasure.measureId,
    amount: '1000.00', basisKind: 'measured', decidedOn: '2026-11-12',
  });
  assert.equal(paidVerifier.ok, true, paidVerifier.error);
  env.sit('mia');
  const interested = env.api.incentiveRecordReading({
    measureId: smallMeasure.measureId, actual: '999999.00', asOf: '2026-11-14',
    evidenceKind: 'decision', evidenceId: 'dec-99', note: '',
  });
  assert.equal(interested.ok, false, 'the hand that benefits does not confirm the figure');
  assert.match(interested.error, /paid|benefit|interest/i);
});

test('ADR-0220 reading: it must sit inside the plan window, cite its evidence and date a restatement after what it restates', () => {
  const env = seed();
  const plan = declarePlan(env);
  const measure = addMeasure(env, plan.planId);
  assert.ok(plan.ok && measure.ok);
  assert.equal(recordReading(env, measure.measureId, { asOf: '2026-09-30' }).ok, false, 'before the window is not evidence for it');
  assert.equal(recordReading(env, measure.measureId, { asOf: '2026-12-01' }).ok, false, 'a reading cannot be dated in the future');
  assert.equal(recordReading(env, measure.measureId, { evidenceKind: 'vibes' }).ok, false);
  assert.equal(recordReading(env, measure.measureId, { evidenceId: '' }).ok, false, 'a number with no reference cannot be audited');
  const first = recordReading(env, measure.measureId, { asOf: '2026-11-05' });
  assert.ok(first.ok, first.error);
  assert.equal(recordReading(env, measure.measureId, { asOf: '2026-11-06', restatesId: first.readingId }).ok, false, 'a restatement needs a reason');
  const restated = recordReading(env, measure.measureId, {
    asOf: '2026-11-06', restatesId: first.readingId,
    restatementReason: 'The ledger was closed a day later and the figure moved by the late invoice.',
  });
  assert.ok(restated.ok, restated.error);
});

/* ---------------------------------------------------------------- 5. awards */

test('ADR-0220 award door: a measured award needs a verified reading in force on its own decision day', () => {
  const env = seed();
  const plan = declarePlan(env);
  const measure = addMeasure(env, plan.planId);
  assert.ok(plan.ok && measure.ok);

  const early = recordAward(env, plan.planId, { measureId: measure.measureId, decidedOn: '2026-11-09' });
  assert.equal(early.ok, false, 'no reading exists yet, so nothing is measured');

  const reading = recordReading(env, measure.measureId, { asOf: '2026-11-10' });
  assert.ok(reading.ok, reading.error);
  // A reading dated AFTER the decision is not evidence for it.
  const after = recordAward(env, plan.planId, { measureId: measure.measureId, decidedOn: '2026-11-09' });
  assert.equal(after.ok, false, 'a reading that did not exist yet cannot stand behind the award');

  assert.equal(recordAward(env, plan.planId, { measureId: measure.measureId, amount: '10.001' }).ok, false);
  assert.equal(recordAward(env, plan.planId, { measureId: measure.measureId, personId: 'dan' }).ok, false, 'an award for yourself is refused');
  assert.equal(recordAward(env, plan.planId, { measureId: measure.measureId, personId: 'ceo' }).ok, false, 'a person above the seat cannot be awarded');
  assert.equal(recordAward(env, plan.planId, { measureId: measure.measureId, basisKind: 'discretionary' }).ok, false, 'discretion needs a written reason');
  assert.equal(recordAward(env, plan.planId, { measureId: measure.measureId, decidedOn: '2026-09-01' }).ok, false, 'before the envelope existed');

  const good = recordAward(env, plan.planId, { measureId: measure.measureId });
  assert.equal(good.ok, true, good.error);
  const report = env.api.incentiveReport();
  assert.equal(report.awards.length, 1);
  assert.equal(report.awards[0].state, 'provable', report.awards[0].stateReason);
  assert.equal(report.awards[0].bucket, 'provable');
  assert.equal(report.currencies[0].provableCents, 1_000_000);
  assert.equal(report.currencies[0].awardedCents, 1_000_000);
});

test('ADR-0220 buckets: every award sits in exactly one bucket, and the provable total excludes the rest', () => {
  const env = seed();
  const { planId, measureId } = provableFixture(env);
  // Provable.
  assert.ok(recordAward(env, planId, { measureId, personId: 'ivo', amount: '10000.00' }).ok);
  // Missed: a second measure whose verified reading does not meet its target.
  env.sit('dan');
  const safety = addMeasure(env, planId, { key: 'incidents', label: 'Incidents', direction: 'decrease', unit: 'count', target: '5' });
  assert.equal(safety.ok, true, safety.error);
  env.sit('ceo');
  assert.ok(env.api.incentiveRecordReading({
    measureId: safety.measureId, actual: '9', asOf: '2026-11-11', evidenceKind: 'decision', evidenceId: 'dec-90', note: '',
  }).ok);
  env.sit('dan');
  const missed = recordAward(env, planId, { measureId: safety.measureId, personId: 'ivo', amount: '2000.00', decidedOn: '2026-11-13' });
  assert.equal(missed.ok, true, missed.error);
  // Discretion: a written judgement with no measured link.
  assert.ok(recordAward(env, planId, { personId: 'ivo', amount: '3000.00', basisKind: 'discretionary', rationale: 'Kept the incident response running through two weekends while the measure did not capture it.' }).ok);

  const report = env.api.incentiveReport();
  const states = report.awards.map((row) => row.bucket).sort();
  assert.deepEqual(states, ['discretionary', 'missed', 'provable']);
  const totals = report.currencies[0];
  assert.equal(totals.provableCents, 1_000_000);
  assert.equal(totals.missedCents, 200_000);
  assert.equal(totals.discretionaryCents, 300_000);
  assert.equal(totals.awardedCents, 1_500_000);
  assert.equal(totals.provableCents + totals.missedCents + totals.discretionaryCents, totals.awardedCents, 'the buckets are the whole');
  assert.equal(report.claims.countsReconcile, true);
  assert.equal(report.claims.figuresComplete, true, 'every plan is measured and every award’s evidence stands');
  // Currencies are never pooled.
  const second = declarePlan(env, { currency: 'EUR', label: 'Second envelope', ceiling: '1000.00' });
  assert.equal(second.ok, true, second.error);
  const withTwo = env.api.incentiveReport();
  assert.deepEqual(withTwo.currencies.map((row) => row.currency), ['DKK', 'EUR']);
  assert.equal(withTwo.currencies[1].awardedCents, 0);
});

/* --------------------------------------------------------------- 6. contest */

test('ADR-0220 contest: one outcome paid by two overlapping plans is CONTESTED, held out, and escalated above both lines', () => {
  const env = seed();
  // Two funding lines, the same outcome key, overlapping windows.
  env.sit('dan');
  const a = env.api.incentiveDeclarePlan({ label: 'Delivery line pay', ownerId: 'mia', currency: 'DKK', ceiling: '100000.00', periodFrom: '2026-10-01', periodTo: '2026-12-31', basis: BASIS });
  assert.equal(a.ok, true, a.error);
  const b = env.api.incentiveDeclarePlan({ label: 'Project line pay', ownerId: 'kai', currency: 'DKK', ceiling: '100000.00', periodFrom: '2026-11-01', periodTo: '2027-01-31', basis: BASIS });
  assert.equal(b.ok, true, b.error);
  const ma = addMeasure(env, a.planId, { key: 'ebit-contribution', label: 'EBIT contribution' });
  const mb = addMeasure(env, b.planId, { key: 'ebit-contribution', label: 'EBIT contribution' });
  assert.ok(ma.ok && mb.ok);
  assert.ok(recordReading(env, ma.measureId).ok);
  assert.ok(recordReading(env, mb.measureId).ok);

  env.sit('mia');
  const awardA = env.api.incentiveRecordAward({ planId: a.planId, personId: 'ivo', measureId: ma.measureId, amount: '5000.00', basisKind: 'measured', decidedOn: '2026-11-12' });
  assert.equal(awardA.ok, true, awardA.error);
  env.sit('kai');
  const awardB = env.api.incentiveRecordAward({ planId: b.planId, personId: 'lea', measureId: mb.measureId, amount: '7000.00', basisKind: 'measured', decidedOn: '2026-11-12' });
  assert.equal(awardB.ok, true, awardB.error);

  // Neither funding line can see the other's envelope; the pair is only visible
  // at the seat above both. That is exactly where the ask goes.
  assert.equal(env.api.incentiveReport().contests.length, 0, 'a seat inside one line cannot see the other line’s award');
  env.sit('dan');
  const report = env.api.incentiveReport();
  assert.equal(report.contests.length, 1, 'the same key across two overlapping plans is contested');
  assert.deepEqual(report.contests[0].planIds.slice().sort(), [a.planId, b.planId].sort());
  assert.equal(report.contests[0].centsByCurrency.DKK, 1_200_000);
  for (const award of report.awards) {
    assert.equal(award.contested, true, 'both sides are contested, not just one');
    assert.equal(award.bucket, 'contested', 'a contested award is in the contested bucket even when its own state is provable');
  }
  const totals = report.currencies[0];
  assert.equal(totals.provableCents, 0, 'nothing contested is provable');
  assert.equal(totals.contestedCents, 1_200_000);
  assert.equal(totals.awardedCents, 1_200_000);
  // The apex is the lowest seat above BOTH funding lines — dan, never an awardee.
  assert.equal(report.contests[0].escalation.unique, true);
  assert.equal(report.contests[0].escalation.apexId, 'dan');
  assert.ok(!report.contests[0].escalation.apexIds.includes('ivo'));

});

test('ADR-0220 contest: successive, non-overlapping windows for one outcome are NOT a double payment', () => {
  const env = seed();
  env.sit('dan');
  const a = env.api.incentiveDeclarePlan({ label: 'Delivery line Q4', ownerId: 'mia', currency: 'DKK', ceiling: '100000.00', periodFrom: '2026-10-01', periodTo: '2026-12-31', basis: BASIS });
  const b = env.api.incentiveDeclarePlan({ label: 'Delivery line Q1', ownerId: 'mia', currency: 'DKK', ceiling: '100000.00', periodFrom: '2027-01-01', periodTo: '2027-03-31', basis: BASIS });
  assert.ok(a.ok && b.ok);
  const ma = addMeasure(env, a.planId, { key: 'ebit-contribution', label: 'EBIT contribution' });
  const mb = addMeasure(env, b.planId, { key: 'ebit-contribution', label: 'EBIT contribution' });
  assert.ok(ma.ok && mb.ok);
  assert.ok(recordReading(env, ma.measureId).ok);
  assert.ok(recordReading(env, mb.measureId, { asOf: '2027-01-10' }).ok === false, 'the future window cannot be read yet');
  env.sit('mia');
  assert.ok(env.api.incentiveRecordAward({ planId: a.planId, personId: 'ivo', measureId: ma.measureId, amount: '5000.00', basisKind: 'measured', decidedOn: '2026-11-12' }).ok);
  const report = env.api.incentiveReport();
  assert.equal(report.contests.length, 0, 'windows that do not overlap are consecutive periods, not a double payment');
  assert.equal(report.currencies[0].provableCents, 500_000);
});

/* -------------------------------------------------------------- 7. recovery */

test('ADR-0220 recovery: a restatement that no longer meets the target makes the money owed back, and only a human clears it', () => {
  const env = seed();
  const { planId, measureId, readingId } = provableFixture(env);
  assert.ok(recordAward(env, planId, { measureId }).ok);
  assert.equal(env.api.incentiveReport().currencies[0].provableCents, 1_000_000);

  // Restate the reading downward, below the target, with a reason.
  env.sit('ceo');
  const restated = recordReading(env, measureId, {
    actual: '40000.00', asOf: '2026-11-14', restatesId: readingId,
    restatementReason: 'The delivery margin was restated after the intercompany elimination was corrected.',
  });
  assert.equal(restated.ok, true, restated.error);

  env.sit('dan');
  const report = env.api.incentiveReport();
  const award = report.awards[0];
  assert.equal(award.state, 'recovery-due', 'the award rested on a figure that no longer meets the target');
  assert.equal(award.restated, true);
  assert.equal(report.currencies[0].recoveryDueCents, 1_000_000);
  assert.equal(report.currencies[0].recoveryOutstandingCents, 1_000_000);
  assert.equal(report.currencies[0].provableCents, 0);
  assert.equal(award.amountCents, 1_000_000, 'the register never reverses the payment itself');

  // The funding line cannot recover its own money: recovery is an executive act.
  env.sit('dan');
  assert.equal(env.api.incentiveRecordRecovery({ awardId: award.id, kind: 'clawback', state: 'demanded', amount: '10000.00', on: '2026-11-15', reason: 'The measure was restated below target, so the award no longer stands.' }).ok, false);
  env.sit('ceo');
  assert.equal(env.api.incentiveRecordRecovery({ awardId: award.id, kind: 'clawback', state: 'recovered', amount: '12000.00', on: '2026-11-15', reason: 'The measure was restated below target, so the award no longer stands.' }).ok, false, 'a recovery may never exceed the award');
  const partial = env.api.incentiveRecordRecovery({ awardId: award.id, kind: 'clawback', state: 'recovered', amount: '4000.00', on: '2026-11-15', reason: 'First instalment recovered after the restatement was agreed with the awardee.' });
  assert.equal(partial.ok, true, partial.error);
  const after = env.api.incentiveReport();
  assert.equal(after.currencies[0].recoveryRecordedCents, 400_000);
  assert.equal(after.currencies[0].recoveryOutstandingCents, 600_000);
  const waived = env.api.incentiveRecordRecovery({ awardId: award.id, kind: 'clawback', state: 'waived', amount: '6000.00', on: '2026-11-15', reason: 'The remaining balance is waived in writing because the shortfall was caused by a corrected group allocation.' });
  assert.equal(waived.ok, true, waived.error);
  assert.equal(env.api.incentiveReport().currencies[0].recoveryOutstandingCents, 0, 'a written waiver is a decision, not an absence');
});

test('ADR-0220 drift: a verifier the matrix no longer puts above the funding line makes the award unverified', () => {
  const env = seed();
  const { planId, measureId } = provableFixture(env);
  assert.ok(recordAward(env, planId, { measureId }).ok);
  assert.equal(env.api.incentiveReport().awards[0].state, 'provable');
  // The CEO — the only seat above dan — is removed from the roster.
  env.store.update((draft) => {
    draft.people = draft.people.filter((row) => row.id !== 'ceo');
  }, { type: 'person.archived', entity: 'person', entityId: 'ceo', summary: 'ceo left' });
  const report = env.api.incentiveReport();
  const award = report.awards[0];
  assert.equal(award.state, 'unverified', 'the evidence weakened after the fact');
  assert.match(award.stateReason, /not above/);
  assert.equal(report.currencies[0].provableCents, 0);
  assert.equal(report.currencies[0].unverifiedCents, 1_000_000);
  assert.equal(report.claims.verifierDriftedN, 1);
  assert.equal(report.claims.figuresComplete, false);
});

/* ------------------------------------------------------------- 8. the rule */

test('ADR-0220 RULE-INC-01: over-ceiling, contested, recovery and unmeasured conditions each file ONE opaque ask to the right seat', () => {
  const env = seed();
  const plan = declarePlan(env, { ceiling: '100.00' });
  assert.ok(plan.ok, plan.error);
  const measure = addMeasure(env, plan.planId, { target: '1000.00' });
  assert.ok(recordReading(env, measure.measureId).ok);
  // Award far past the envelope: the door records it rather than pushing it off the record.
  const award = recordAward(env, plan.planId, { measureId: measure.measureId, amount: '50000.00' });
  assert.equal(award.ok, true, award.error);

  env.sit('ceo');
  const report = env.api.incentiveReport();
  assert.equal(planById(report, plan.planId).verdict, 'over-ceiling');
  assert.equal(planById(report, plan.planId).overByCents, 4_990_000);

  const asks = env.store.state.delegations.filter((row) => row.title.includes('incentive-integrity register'));
  assert.ok(asks.length >= 1, 'the rule filed an ask');
  const ask = asks[0];
  assert.equal(ask.authority, 'act-inform');
  assert.ok(!/DKK|Directorate|ivo|dan/i.test(ask.title), 'the ask title names no plan, person or amount');
  assert.ok(!/DKK|Directorate|ivo/i.test(ask.expectedOutcome), 'the ask body is deliberately opaque');
  // The addressee is the seat above the funding line, never the funding line.
  assert.notEqual(ask.personId, 'dan', 'the funding line is not asked to clear its own overrun');
  assert.equal(ask.personId, 'ceo');

  // Idempotent: a second commit does not file a second ask for the same condition.
  env.sit('ceo');
  env.api.incentiveScan();
  const after = env.store.state.delegations.filter((row) => row.title.includes('incentive-integrity register'));
  assert.equal(after.length, asks.length, 'one ask per (condition, addressee)');

  // The attention badge counts exactly the conditions the rule would ask this seat.
  const attention = env.api.incentiveAttentionCount();
  assert.equal(attention, after.filter((row) => row.status === 'active').length);

  // Clearing the condition closes the ask by itself.
  env.store.update((draft) => {
    draft.incentiveAwards = [];
  }, { type: 'incentive.award.removed', entity: 'incentiveAward', entityId: award.awardId, summary: 'cleared for the test' });
  env.sit('ceo');
  env.api.incentiveScan();
  const closed = env.store.state.delegations.filter((row) => row.title.includes('incentive-integrity register') && row.status === 'active');
  assert.equal(closed.length, 0, 'the ask closed when its condition cleared');
});

test('ADR-0220 RULE-INC-01: a pause silences every path including the scan, and a human answer is respected', () => {
  const env = seed();
  const plan = declarePlan(env, { ceiling: '100.00' });
  const measure = addMeasure(env, plan.planId, { target: '1000.00' });
  assert.ok(recordReading(env, measure.measureId).ok);
  assert.ok(recordAward(env, plan.planId, { measureId: measure.measureId, amount: '50000.00' }).ok);
  const filed = env.store.state.delegations.length;
  assert.ok(filed > 0);

  // A human returns the ask: the rule does not re-file it while the condition stands.
  env.store.update((draft) => {
    const task = draft.delegations.find((row) => row.title.includes('incentive-integrity register'));
    if (task) { task.status = 'returned'; task.returnedOn = '2026-11-15'; task.returnReason = 'With the board tomorrow; not resolving it today.'; }
  }, { type: 'delegation.returned', entity: 'delegation', entityId: 'ask', summary: 'returned' });
  env.sit('ceo');
  env.api.incentiveScan();
  const active = env.store.state.delegations.filter((row) => row.title.includes('incentive-integrity register') && row.status === 'active');
  assert.equal(active.length, 0, 'a returned ask is an answer, not an absence');

  // Now pause the switch and ask again: nothing is filed, including by the scan.
  env.store.update((draft) => {
    draft.settings = { ...draft.settings, [INC_SETTING_KEYS.autoPropagate]: false };
    draft.delegations = [];
  }, { type: 'settings.updated', entity: 'settings', entityId: 'incentiveAutoPropagate', summary: 'paused' });
  env.sit('ceo');
  env.api.incentiveScan();
  assert.equal(env.store.state.delegations.length, 0, 'a paused rule files nothing, even on an explicit scan');
  const report = env.api.incentiveReport();
  assert.equal(planById(report, plan.planId).verdict, 'over-ceiling', 'the pause silences the ask, never the finding');
});

test('ADR-0220 rule internals: the condition set is a pure function of the reader and the live graph', () => {
  const today = '2026-11-15';
  const matrix = { nodes: new Map([['dan', {}], ['ceo', {}]]) };
  const plan = {
    id: 'p1', label: 'Plan', ownerId: 'dan', currency: 'DKK', overByCents: 5000, verdict: 'over-ceiling',
    recoveryOutstandingN: 0, unmeasured: false, escalation: { managerIds: ['ceo'], unique: true, apexId: 'ceo', apexIds: ['ceo'] },
  };
  const built = incentiveConditions(null, { plans: [plan], contests: [] }, { today, matrix });
  assert.equal(built.conditions.length, 1);
  assert.equal(built.conditions[0].kind, 'plan-over-ceiling');
  assert.equal(built.conditions[0].seatIds[0], 'ceo', 'the seat above the funding line is asked');
  assert.match(built.conditions[0].signature, /^inc1:ceiling:p1:DKK:5000$/);
  assert.equal(built.conditions[0].dueOn, '2026-11-18');

  const nowhere = incentiveConditions(null, { plans: [{ ...plan, escalation: { managerIds: [] } }], contests: [] }, { today, matrix: { nodes: new Map() } });
  assert.equal(nowhere.conditions.length, 0, 'no seat is invented');
  assert.equal(nowhere.observations.length, 1, 'the unaskable condition is recorded as an identity-free observation');

  const unmeasured = incentiveConditions(null, { plans: [{ ...plan, verdict: 'within-ceiling', overByCents: 0, unmeasured: true }], contests: [] }, { today, matrix });
  assert.equal(unmeasured.conditions[0].kind, 'plan-unmeasured');
  assert.deepEqual(unmeasured.conditions[0].seatIds, ['dan'], 'the plan’s own owner records the reading');

  assert.equal(typeof incentiveRule, 'function');
  assert.equal(incentiveRule.id, 'incentiveRule');
  assert.equal(L.centsMax, 1_000_000_000_000_000);
});

/* ------------------------------------------------------------- 9. the read */

test('ADR-0220 access: a frontline IC is refused the register, a manager reads only its own lines, a director reads its directorate', () => {
  const env = seed();
  const { planId, measureId } = provableFixture(env);
  assert.ok(recordAward(env, planId, { measureId }).ok);
  // A second plan on another director's line, invisible to dan.
  const raw = JSON.parse(JSON.stringify(env.store.state));
  raw.people.push(person('nina', 'ceo', 'director'), person('ola', 'nina', 'manager'));
  normalizeState(raw, { now: at('2026-11-15') });
  env.store.update((draft) => {
    draft.people = raw.people;
  }, { type: 'person.added', entity: 'person', entityId: 'nina', summary: 'second directorate' });
  env.sit('nina');
  const other = env.api.incentiveDeclarePlan({ label: 'Other directorate pay', ownerId: 'nina', currency: 'DKK', ceiling: '10000.00', periodFrom: '2026-10-01', periodTo: '2026-12-31', basis: BASIS });
  assert.equal(other.ok, true, other.error);

  env.sit('ivo');
  const ic = env.api.incentiveReport();
  assert.equal(ic.ok, false, 'an IC holds no funding line and no right to the register');
  env.sit('mia');
  const manager = env.api.incentiveReport();
  assert.equal(manager.ok !== false, true, manager.error);
  assert.equal(manager.plans.length, 0, 'a manager does not read a directorate envelope they do not fund');
  env.sit('dan');
  const director = env.api.incentiveReport();
  assert.equal(director.plans.length, 1, 'exactly the plan dan funds');
  assert.equal(director.scope.plansOutsideScopeN, 1);
  assert.equal(director.claims.figuresComplete, true, 'completeness is certified over the scope the seat can see');
  assert.equal(INC_RIGHTS.READ, 'read-incentive-integrity');
  assert.equal(Object.keys(INC_RIGHTS).length, 5, 'five rights, each one deliberate');
});

test('ADR-0220 disclosure: individual award rows are withheld above the director altitude, and the page says so', () => {
  const env = seed();
  const { planId, measureId } = provableFixture(env);
  assert.ok(recordAward(env, planId, { measureId }).ok);
  env.sit('dan');
  assert.equal(env.api.incentiveReport().scope.awardDetail, true);
  env.sit('ceo');
  const executive = env.api.incentiveReport();
  assert.equal(executive.scope.awardDetail, false, 'individual variable pay stops above the director');
  assert.equal(executive.scope.withheldAwardN, 1);
  assert.equal(executive.claims.figuresComplete, false, 'a seat that cannot see the rows does not certify the whole record');
  assert.equal(executive.currencies[0].provableCents, 1_000_000, 'the control total is still printed');
  assert.equal(executive.awards[0].amountCents, null);
  assert.equal(executive.awards[0].personName, null);
});

/* ---------------------------------------------------------------- 10. CSV */

test('ADR-0220 CSV #162: aggregate per currency, identity-free, and every figure is the reader’s', () => {
  const env = seed();
  const { planId, measureId } = provableFixture(env);
  assert.ok(recordAward(env, planId, { measureId }).ok);
  const report = env.api.incentiveReport();
  const exported = exportWorkspaceCsv(env.store.state, INC_CSV_SCOPE, { now: at('2026-11-15') });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(exported.columnCount >= 27);
  for (const forbidden of ['Directorate variable pay', 'delivery-margin', 'ivo', 'Ivo', 'dec-77', BASIS]) {
    assert.ok(!exported.csv.includes(forbidden), `the export carries no “${forbidden}”`);
  }
  const row = incentiveCsvRows(report)[0];
  assert.equal(row.currency, 'DKK');
  assert.equal(row.awarded_cents, report.currencies[0].awardedCents);
  assert.equal(row.provable_cents, report.currencies[0].provableCents);
  assert.equal(row.awards_total, report.currencies[0].awardsN);
  assert.equal(row.counts_reconcile, 1);
  assert.ok(exported.csv.includes(String(report.currencies[0].provableCents)), 'the exported figure is the reader’s own integer');
});

/* --------------------------------------------------------------- 11. panel */

test('ADR-0220 panel: what the screen prints is what the reader computed, cell by cell', () => withDom(() => {
  const env = seed();
  const { planId, measureId } = provableFixture(env);
  assert.ok(recordAward(env, planId, { measureId }).ok);
  env.sit('dan');
  const ctx = { api: env.api, navigate: () => {}, refresh: () => {}, query: new URLSearchParams('') };
  const report = env.api.incentiveReport();
  const node = renderIncentive(ctx);
  const text = (testid) => node.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim();
  assert.equal(text('inc-count-plans'), String(report.counts.plansLive));
  assert.equal(text('inc-count-measures'), String(report.counts.measures));
  assert.equal(text('inc-count-awards'), String(report.counts.awards));
  assert.equal(text('inc-count-contests'), String(report.counts.contests));
  assert.equal(text('inc-count-recovery'), String(report.gaps.recoveryOutstandingN));
  assert.equal(text('inc-count-unmeasured'), String(report.gaps.plansWithoutReadingN));
  const planRow = node.querySelector(`[data-testid="inc-plan-${planId}"]`);
  assert.ok(planRow, 'the plan row is printed');
  const stored = planById(report, planId);
  assert.equal(planRow.getAttribute('data-verdict'), stored.verdict);
  assert.equal(planRow.getAttribute('data-ceiling-cents'), String(stored.ceilingCents));
  assert.equal(planRow.getAttribute('data-awarded-cents'), String(stored.awardedCents));
  assert.ok(planRow.textContent.includes('DKK 250,000.00'), 'the printed ceiling is the computed ceiling');
  assert.ok(planRow.textContent.includes('DKK 10,000.00'), 'the printed award total is the computed total');

  // The awards tab prints the same state the reader computed.
  const awardsCtx = { ...ctx, query: new URLSearchParams('view=awards') };
  const awardsNode = renderIncentive(awardsCtx);
  const awardRow = awardsNode.querySelector(`[data-testid="inc-award-${report.awards[0].id}"]`);
  assert.ok(awardRow, 'the award row is printed at the director altitude');
  assert.equal(awardRow.getAttribute('data-state'), report.awards[0].state);
  assert.equal(awardRow.getAttribute('data-bucket'), report.awards[0].bucket);
  assert.equal(awardRow.getAttribute('data-cents'), String(report.awards[0].amountCents));
  assert.equal(awardRow.getAttribute('data-contested'), '0');

  // The badge is a count for this seat; with no seat resolved it owes nothing.
  assert.equal(typeof env.api.incentiveAttentionCount(), 'number');
  assert.equal(incentiveAttentionCount(env.store.state, { now: at('2026-11-15'), seat: null }), 0);
  // Pure internals that the panel and the rule both rely on.
  assert.equal(readingInForce([], '2026-11-15'), null);
  assert.equal(readingMeetsTarget(null, null), null);
  assert.equal(terminalRestatement([], 'x').chained, false);
  assert.equal(verifierStanding(null, null, null).ok, false);
  assert.deepEqual(liveIncPlans([], '2026-11-15'), { live: [], retired: [], future: [] });
  assert.equal(indexIncentiveAsks({ links: [] }).length, 0);
  assert.equal(typeof INC_RULE_ID, 'string');
  assert.equal(normalizeIncPlans([], []).length, 0);
  assert.equal(normalizeIncReadings([], [], []).length, 0);
  assert.equal(incentiveCsvRows(report).length, 1);
}));
