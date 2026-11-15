// ADR-0217 — Earned-Value Delivery & Estimate-at-Completion Register.
//
// The register's claims are arithmetic, governance and refusal, so the tests
// are too. One focused pass over what Session 290 built:
//
//   1. migration 170 → 171 adds five EMPTY ledgers and three conventions, and
//      infers no baseline from the record it upgrades;
//   2. every named refusal fires at the door that owns it, and each saves nothing;
//   3. the increments ARE the baseline: they must re-add to budget to the cent,
//      and a package whose lines do not is refused rather than repaired;
//   4. line attribution only when every live package carries a split summing to
//      exactly 100 — anything else prints NOTHING per line, counted;
//   5. EV is computed under the declared method only — shares the method does
//      not admit are refused; a reading that names no share for a live package
//      refuses EV entirely and names the missing packages;
//   6. the two facts are printed apart: `reconciles` (the printed identities
//      re-add) vs `figuresComplete` (every open case reads complete against the
//      CURRENT baseline) — and a re-baseline re-proves readings against today's
//      plan, printed as baseline-moved;
//   7. currencies are never pooled; EACs are three labelled assumptions, each
//      refused separately; TCPI is withheld once the budget is spent;
//   8. RULE-EVL-01 files one opaque ask per owed condition, idempotent,
//      self-closing, pause-governed, before the seat and the seal — the badge
//      counts exactly what the rule would ask;
//   9. what the panel prints is what the reader computed — cell by cell through
//      data-cents — and the CSV exports the same integers with no identity.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, MIGRATIONS, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEarnedValueActions } from '../../app/core/domain/earnedValueActions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildEarnedValue,
  earnedValueAttentionCount,
} from '../../app/core/domain/earnedValue.js';
import { earnedValueConditions, earnedValueObservations } from '../../app/core/domain/earnedValueRules.js';
import { ppm, printedCents, sumCents, estimatesAtCompletion, tcpiPpm } from '../../app/core/domain/earnedValueMath.js';
import { parseEvAskSummary, normalizeEvSettings } from '../../app/core/domain/earnedValueSchema.js';
import { EV_CSV_SCOPE, EV_RULE_ID as RULE_ID, EV_SETTING_KEYS } from '../../app/core/domain/earnedValueRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { renderFinance } from '../../app/views/finance.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

// ceo → vera (vp) → dan (director) → mia (manager) → ivo (ic); vic (vp) → kai.
// mia ALSO declares a project line to vic — the matrix case this register must
// attribute correctly or refuse.
const person = (id, managerId, level) => ({
  id,
  name: `${id[0].toUpperCase()}${id.slice(1)} Name`,
  managerId,
  level,
  role: 'Executive',
  status: 'active',
  startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
});

function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'chief'),
    person('vera', 'ceo', 'vp'),
    person('vic', 'ceo', 'vp'),
    person('dan', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'vic', 'manager'),
  ];
  raw.reportingLines = [{
    id: 'rl-mia-vic', personId: 'mia', managerId: 'vic', kind: 'project', shareH: 20,
    rights: [], fromISO: '2026-01-01', toISO: '2026-11-30', declaredAt: '2026-01-01T09:00:00.000Z', note: '',
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
  const bare = createApi(store, { now: () => clock, idFactory });
  const direct = createEarnedValueActions(store, { now: () => clock, idFactory });
  const api = guardApi(bare, store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  const touch = () => store.update(() => {}, { type: 'test.touch', entity: 'workspace', entityId: 'touch', summary: 'touch' });
  const nowDay = () => new Date(clock.getTime());
  return { store, api, bare, direct, sit, on, touch, values, nowDay };
}

const CASE_INPUT = { label: 'Northwind delivery', currency: 'DKK', methodKey: 'percent-complete', ownerId: 'mia', source: 'programme board' };

function withCase(extra = {}) {
  const env = seed();
  env.on('2026-02-01');
  env.sit('vera');
  const result = env.api.earnedValueDeclareCase({ ...CASE_INPUT, ...extra });
  assert.ok(result.ok, result.error);
  return { env, caseId: result.caseId };
}

const PKG = {
  code: 'WP-1',
  name: 'Integrate the finance platforms',
  plannedAmount: '1000000.00',
  plannedStart: '2026-02-01',
  plannedFinish: '2026-06-30',
  phasesText: '2026-03-31 400000.00\n2026-06-30 600000.00',
};

function withPackage(pkgExtra = {}) {
  const { env, caseId } = withCase();
  env.sit('vera');
  const result = env.api.earnedValueAddPackage({ caseId, ...PKG, ...pkgExtra });
  assert.ok(result.ok, result.error);
  return { env, caseId, packageId: result.packageId };
}

const report = (env) => buildEarnedValue(env.store.state, { now: env.nowDay(), settings: env.store.state.settings, seat: null });
const row = (env, caseId) => report(env).rows.find((entry) => entry.id === caseId);

/* =====================================================================
 * 1. MIGRATION — five empty ledgers, three conventions, nothing inferred
 */

test('ADR-0217 migration 170 → 171 adds five EMPTY ledgers and infers no baseline', () => {
  assert.equal(SCHEMA_VERSION, 177);
  for (const key of ['earnedValueCases', 'earnedValuePackages', 'earnedValueReadings', 'earnedValueActuals', 'earnedValueMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const before = createEmptyState(T0);
  before.schemaVersion = 170;
  delete before.earnedValueCases;
  delete before.earnedValuePackages;
  delete before.earnedValueReadings;
  delete before.earnedValueActuals;
  delete before.earnedValueMarkers;
  const next = MIGRATIONS[170](before);
  assert.equal(next.schemaVersion, 171);
  assert.deepEqual(next.earnedValueCases, []);
  assert.deepEqual(next.earnedValuePackages, []);
  assert.deepEqual(next.earnedValueReadings, []);
  assert.deepEqual(next.earnedValueActuals, []);
  assert.deepEqual(next.earnedValueMarkers, []);
  // The existing record is left exactly as it was; nothing is invented.
  assert.equal((before.synergyMarkers || []).length, 0);
  const migrated = migrate({ ...createEmptyState(T0), schemaVersion: 170 });
  assert.equal(migrated.raw.schemaVersion, 174);
  assert.equal(buildEarnedValue(migrated.raw, { now: at('2026-11-15'), settings: migrated.raw.settings }).counts.casesOpen, 0);
});

/* =====================================================================
 * 2. THE DOOR — named refusals, nothing stored
 */

test('ADR-0217 door: every named refusal fires and nothing is stored', () => {
  const { env, caseId } = withPackage();
  const before = JSON.stringify([env.store.state.earnedValuePackages, env.store.state.earnedValueReadings, env.store.state.earnedValueActuals]);

  // Increments that do not re-add to budget are refused WHOLE.
  env.sit('vera');
  const badPhases = env.api.earnedValueAddPackage({ caseId, ...PKG, code: 'WP-2', phasesText: '2026-03-31 400000.00\n2026-06-30 500000.00' });
  assert.equal(badPhases.ok, false);
  assert.equal(badPhases.refusal, 'earned-value:phases-do-not-add-to-budget');

  // Line shares that do not sum to exactly 100 are refused.
  const badShares = env.api.earnedValueAddPackage({ caseId, ...PKG, code: 'WP-2', lineSharesText: 'mia 70\nvic 70' });
  assert.equal(badShares.ok, false);
  assert.equal(badShares.refusal, 'earned-value:line-shares-do-not-add');
  const unknownLine = env.api.earnedValueAddPackage({ caseId, ...PKG, code: 'WP-2', lineSharesText: 'ghost 100' });
  assert.equal(unknownLine.refusal, 'earned-value:line-unknown');

  // The declared method admits only its own shares (percent-complete: any integer 0..100 — so use zero-hundred for the refusal).
  const { env: env2, caseId: zeroCase } = withCase({ label: 'Strict case', methodKey: 'zero-hundred' });
  env2.on('2026-05-15');
  env2.sit('vera');
  assert.ok(env2.api.earnedValueAddPackage({ caseId: zeroCase, ...PKG }).ok);
  const strict = env2.api.earnedValueRecordReading({ caseId: zeroCase, cutoffDay: '2026-05-15', shares: { [env2.store.state.earnedValuePackages.find((p) => p.caseId === zeroCase).id]: 50 }, evidenceNote: 'Progress review of the integration programme, May 2026.' });
  assert.equal(strict.ok, false);
  assert.equal(strict.refusal, 'earned-value:share-not-admitted');

  // EV refused when a live package names no share.
  const twoPkg = withCase({ label: 'Two packages', methodKey: 'percent-complete' });
  twoPkg.env.on('2026-05-15');
  assert.ok(twoPkg.env.api.earnedValueAddPackage({ caseId: twoPkg.caseId, ...PKG, code: 'WP-A' }).ok);
  assert.ok(twoPkg.env.api.earnedValueAddPackage({ caseId: twoPkg.caseId, ...PKG, code: 'WP-B', phasesText: '2026-03-31 400000.00\n2026-06-30 600000.00' }).ok);
  const onlyA = twoPkg.env.store.state.earnedValuePackages.find((p) => p.code === 'WP-A');
  const incomplete = twoPkg.env.api.earnedValueRecordReading({ caseId: twoPkg.caseId, cutoffDay: '2026-05-15', shares: { [onlyA.id]: 25 }, evidenceNote: 'Review minutes, 2026-05-15, integration programme.' });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.refusal, 'earned-value:reading-incomplete');
  assert.match(incomplete.error, /WP-B/);

  // An actual naming a package outside the case is refused; one with no package is carried unallocated.
  env.sit('vera');
  const wrongPkg = env.api.earnedValueRecordActual({ caseId, packageId: 'nope', date: '2026-05-01', amount: '1000.00' });
  assert.equal(wrongPkg.refusal, 'earned-value:actual-unknown-package');

  // A convention outside its bounds is refused, never clamped.
  const staleDaysBefore = env.store.state.settings.earnedValueStaleDays;
  const oob = env.api.earnedValueSetConventions({ earnedValueStaleDays: 500 });
  assert.equal(oob.refusal, 'earned-value:convention-out-of-bounds');
  assert.equal(env.store.state.settings.earnedValueStaleDays, staleDaysBefore, 'nothing moved');

  // The one-line-declares-another-line's-programme refusal, proved at the action.
  const peer = env.direct.earnedValueDeclareCase({ ...CASE_INPUT, ownerId: 'kai' });
  assert.equal(peer.ok, false);
  assert.equal(peer.refusal, 'earned-value:case-owner-out-of-reach');

  assert.equal(JSON.stringify([env.store.state.earnedValuePackages, env.store.state.earnedValueReadings, env.store.state.earnedValueActuals]), before, 'refusals stored nothing');
});

/* =====================================================================
 * 3 + 5 + 6. ARITHMETIC — increments, method, EV, CPI/SPI/EACs, two facts
 */

test('ADR-0217 arithmetic: EV under the declared method, CPI/SPI/TCPI exact, and the two facts apart', () => {
  const { env, caseId, packageId } = withPackage();
  // A second live package so PV/EV are provably sums of two increment sets.
  env.sit('vera');
  assert.ok(env.api.earnedValueAddPackage({
    caseId, code: 'WP-2', name: 'Build the reconciliation', plannedAmount: '500000.00',
    plannedStart: '2026-02-01', plannedFinish: '2026-06-30',
    phasesText: '2026-04-30 500000.00', lineSharesText: '',
  }).ok);
  env.on('2026-05-15');
  env.sit('dan'); // rank 3, above mia on the home line
  const pkgs = env.store.state.earnedValuePackages.filter((p) => p.caseId === caseId);
  const shares = Object.fromEntries(pkgs.map((p) => [p.id, 50]));
  const reading = env.api.earnedValueRecordReading({ caseId, cutoffDay: '2026-05-15', shares, evidenceNote: 'Percent-complete review, integration programme, 2026-05-15, recorded by the programme director.' });
  assert.ok(reading.ok, reading.error);
  env.on('2026-05-16');
  env.sit('dan');
  assert.ok(env.api.earnedValueRecordActual({ caseId, packageId, date: '2026-05-10', amount: '600000.00', source: 'posted period 2026-04' }).ok);
  assert.ok(env.api.earnedValueRecordActual({ caseId, packageId: null, date: '2026-05-11', amount: '100000.00', source: 'direct cost, uncoded' }).ok);

  const view = report(env);
  const rowV = view.rows.find((entry) => entry.id === caseId);
  const latest = rowV.latestReading;
  // PV at 2026-05-15: 400k (WP-1, 03-31) + 500k (WP-2, 04-30) = 900,000.00
  assert.equal(latest.pvCents, 90_000_000);
  // EV = 50% of (1,000,000 + 500,000) = 750,000.00
  assert.equal(latest.evCents, 75_000_000);
  // AC = 700,000.00 (600k allocated + 100k unallocated)
  assert.equal(latest.acCents, 70_000_000);
  assert.equal(latest.acAllocatedCents, 60_000_000);
  assert.equal(latest.acUnallocatedCents, 10_000_000);
  assert.equal(latest.cvCents, 5_000_000);
  assert.equal(latest.svCents, -15_000_000);
  assert.equal(latest.cpiPpm, ppm(75_000_000, 70_000_000));
  assert.equal(latest.spiPpm, ppm(75_000_000, 90_000_000));
  // TCPI = (BAC − EV)/(BAC − AC) = 750,000 / 800,000 = 9375 ppm
  assert.equal(latest.tcpiPpm, 9375);
  // EAC at plan = AC + (BAC − EV) = 700,000 + 750,000 = 1,450,000.00
  assert.equal(latest.eacAtPlanCents, 145_000_000);
  // EAC at CPI = BAC × AC ÷ EV = 1,500,000 × 700,000 ÷ 750,000 = 1,400,000.00
  assert.equal(latest.eacAtCpiCents, 140_000_000);
  // EAC at CPI×SPI = AC + (BAC − EV) × AC × PV / EV²
  //   = 700,000 + 750,000×700,000×900,000 / 750,000²  = 700,000 + 840,000 = 1,540,000.00
  assert.equal(latest.eacAtCpiSpiCents, 154_000_000);
  assert.equal(view.reconciles, true, 'the printed identities re-add');
  assert.equal(view.figuresComplete, true, 'the case reads complete against the current baseline');
  const totals = view.totals.find((t) => t.currency === 'DKK');
  assert.equal(totals.evCents, 75_000_000);
  assert.equal(totals.cpiPpm, ppm(75_000_000, 70_000_000));
  const lineSplit = view.lines.find((l) => l.lineKey === 'vic');
  // WP-1 was split 60 mia / 40 vic; WP-2 had no split → the case prints NO line money.
  assert.equal(lineSplit, undefined, 'one un-split live package silences line attribution');
  assert.equal(view.counts.lineSplitRefused, 1);
});

test('ADR-0217 re-baseline: the newest reading is re-proved against the CURRENT plan and prints baseline-moved', () => {
  const { env, caseId, packageId } = withPackage({ lineSharesText: 'mia 60\nvic 40' });
  env.on('2026-03-15');
  env.sit('dan');
  const reading = env.api.earnedValueRecordReading({ caseId, cutoffDay: '2026-03-15', shares: { [packageId]: 50 }, evidenceNote: 'Review minutes 2026-03-15; the WP-1 increment of 400,000.00 is earned at half completion.' });
  assert.ok(reading.ok, reading.error);
  const before = row(env, caseId);
  assert.equal(before.stateKey, 'on-plan');
  assert.equal(before.latestReading.baselineMoved, false);

  env.sit('vera');
  const gb = env.api.earnedValueRebaselinePackage({ caseId, packageId, reason: 'The vendor contract moved the increment; the steering group approved the re-plan on 2026-04-01.', plannedAmount: '1200000.00', phasesText: '2026-03-31 400000.00\n2026-06-30 800000.00' });
  assert.ok(gb.ok, gb.error);
  const after = row(env, caseId);
  assert.equal(after.stateKey, 'baseline-moved', 'a reading cut against the old plan is not evidence about the new one');
  assert.equal(after.latestReading.baselineMoved, true);
  assert.equal(after.baselineVersion, 2);
});

/* =====================================================================
 * 7. CURRENCIES NEVER POOLED; TCPI refused when the budget is spent
 */

test('ADR-0217 money withheld until every open case in the currency is complete', () => {
  const { env, caseId } = withCase();
  env.sit('vera');
  assert.ok(env.api.earnedValueAddPackage({ caseId, ...PKG }).ok);
  const r2 = env.api.earnedValueDeclareCase({ ...CASE_INPUT, label: 'Second programme' });
  assert.ok(r2.ok, r2.error);
  assert.ok(env.api.earnedValueAddPackage({ caseId: r2.caseId, ...PKG, code: 'WP-1' }).ok);
  // Complete only the first case.
  env.on('2026-03-31');
  env.sit('dan');
  const only = env.store.state.earnedValuePackages.filter((p) => p.caseId === caseId);
  assert.ok(env.api.earnedValueRecordReading({ caseId, cutoffDay: '2026-03-31', shares: Object.fromEntries(only.map((p) => [p.id, 100])), evidenceNote: 'WP-1 complete at the March milestone review, 2026-03-31.' }).ok);
  const partial = report(env).totals.find((t) => t.currency === 'DKK');
  assert.equal(partial.evCents, null, 'a currency with one incomplete case prints no pooled EV');
  assert.equal(partial.moneyComplete, false);
  // Complete the second as well.
  assert.ok(env.api.earnedValueRecordReading({ caseId: r2.caseId, cutoffDay: '2026-03-31', shares: Object.fromEntries(env.store.state.earnedValuePackages.filter((p) => p.caseId === r2.caseId).map((p) => [p.id, 100])), evidenceNote: 'WP-1 complete at the March milestone review, 2026-03-31.' }).ok);
  const whole = report(env).totals.find((t) => t.currency === 'DKK');
  assert.equal(whole.evCents, 200_000_000, 'two cases × WP-1 @ 100%');
  assert.equal(whole.moneyComplete, true);
});

test('ADR-0217 EAC math: three labelled assumptions, each refused separately; TCPI refused at zero denominator', () => {
  const eac = estimatesAtCompletion({ bac: 10_000_000, ev: 4_000_000, ac: 5_000_000, pv: 6_000_000 });
  assert.equal(eac.atPlan, 11_000_000);
  assert.equal(eac.atCpi, 12_500_000);
  // atCpiSpi = AC + remaining × AC × PV ÷ EV² = 5,000,000 + 6,000,000 × 5,000,000 × 6,000,000 ÷ 4,000,000²
  assert.equal(eac.atCpiSpi, 16_250_000);
  const noEearnedYet = estimatesAtCompletion({ bac: 10_000_000, ev: 0, ac: 5_000_000, pv: 6_000_000 });
  assert.equal(noEearnedYet.atCpi, null, 'no work earned yet — the efficiency of none is undefined');
  assert.equal(noEearnedYet.atCpiSpi, null);
  const noPv = estimatesAtCompletion({ bac: 10_000_000, ev: 4_000_000, ac: 5_000_000, pv: 0 });
  assert.equal(noPv.atCpiSpi, null, 'no planned value due — the joint index is undefined');
  assert.equal(noPv.atCpi, 12_500_000, 'at-CPI is still defined');
  assert.equal(tcpiPpm({ bac: 10_000_000, ev: 4_000_000, ac: 5_000_000 }), 12_000);
  assert.equal(tcpiPpm({ bac: 5_000_000, ev: 4_000_000, ac: 6_000_000 }), null, 'the budget is already spent');
});

/* =====================================================================
 * 8. RULE-EVL-01 — opaque ask, idempotent, self-closing, pause governs
 */

test('ADR-0217 rule: one opaque ask to the owner, idempotent, gated by the pause switch', () => {
  const { env, caseId } = withPackage();
  env.on('2026-04-15'); // 73 days after declaration, no reading
  env.touch();
  const asks = () => env.store.state.delegations.filter((task) => String(task.title).includes('earned-value register'));
  assert.equal(asks().length, 1);
  const ask = asks()[0];
  assert.equal(ask.personId, 'mia', 'the owner is asked — never their manager, never the workspace');
  assert.equal(ask.authority, 'act-inform');
  const body = JSON.stringify(ask).toLowerCase();
  for (const leak of ['northwind', '1000000', '10,000.00', 'wp-1', '2026-06-30', 'integrate']) {
    assert.ok(!body.includes(leak), `the ask must not carry “${leak}”: a delegation is readable above the owner`);
  }
  const links = env.store.state.links.filter((link) => link.ruleId === RULE_ID);
  assert.equal(links.length, 1);
  assert.equal(links[0].relation, 'issues-obligation');
  const parsed = parseEvAskSummary(links[0].summary);
  assert.match(parsed.signature, /^ev1:[0-9a-f]{16}$/);

  env.touch();
  assert.equal(asks().length, 1, 'idempotent');
  assert.equal(earnedValueAttentionCount(env.store.state, { now: env.nowDay(), settings: env.store.state.settings }), 1, 'the badge counts what the rule would ask');

  // A complete reading closes the ask; the condition clears.
  env.sit('dan');
  const pkg = env.store.state.earnedValuePackages.find((p) => p.caseId === caseId);
  assert.ok(env.api.earnedValueRecordReading({ caseId, cutoffDay: '2026-04-15', shares: { [pkg.id]: 50 }, evidenceNote: 'Percent-complete review, April 2026, integration programme.' }).ok);
  env.touch();
  const closed = env.store.state.delegations.find((task) => task.id === ask.id);
  assert.equal(closed.status, 'done', 'the ask self-closed when the record stopped reporting the condition');
  assert.equal(earnedValueAttentionCount(env.store.state, { now: env.nowDay(), settings: env.store.state.settings }), 0);

  // The pause governs every path, including an explicit scan.
  const paused = withPackage();
  paused.env.store.update((draft) => { draft.settings = { ...draft.settings, earnedValueAutoPropagate: false }; },
    { type: 'settings.updated', entity: 'settings', entityId: 'earned-value', summary: 'paused' });
  paused.env.on('2026-04-15');
  paused.env.sit('vera');
  paused.env.api.earnedValueScan();
  assert.equal(paused.env.store.state.delegations.filter((task) => String(task.title).includes('earned-value register')).length, 0);
});

test('ADR-0217 rule: registered on the shared spine before the seat and the seal, with a declared contract', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  const index = ids.indexOf('earnedValueRule');
  assert.ok(index >= 0, 'earnedValueRule is on the spine');
  assert.ok(index < ids.indexOf('speakUpRule'), 'it files before the later governance rules');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2).id, 'seatRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).id, 'sealRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'one rule, one contract');
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.rule === DEFAULT_POST_COMMIT_RULES[index]);
  assert.ok(contract, 'the rule has a declared contract');
  assert.ok(contract.writes.includes('earnedValueMarkers'));
  assert.equal(contract.scansWorkspace, true);
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/core/domain/earnedValueRules.js'), 'utf8');
  assert.ok(source.includes('earnedValueAutoPropagate'));
  assert.ok(!/buildMatrix|reportingLines|matrixLineScope|matrixJointApex/.test(source),
    'the rule asks the named owner directly — silencing it does not reach a second line');
});

test('ADR-0217 observations: a case whose owner has left the roster is marked, never asked', () => {
  const { env, caseId } = withPackage();
  env.store.update((draft) => {
    draft.people = draft.people.map((p) => (p.id === 'mia' ? { ...p, status: 'archived', archivedAt: '2026-03-01T09:00:00.000Z' } : p));
  }, { type: 'person.archived', entity: 'person', entityId: 'mia', summary: 'archived' });
  const obs = earnedValueObservations(report(env));
  assert.equal(obs.length, 1);
  assert.equal(obs[0].kind, 'owner-departed');
  const conditions = earnedValueConditions(report(env), { today: '2026-11-15' });
  assert.equal(conditions.length, 0, 'nobody to ask');
});

/* =====================================================================
 * 9. WHAT THE SCREEN PRINTS =========================================
 */

test('ADR-0217 display = computation: every cell carries the reader’s integer, and the CSV carries no identity', () => {
  withDom(() => {
    const { env, caseId, packageId } = withPackage({ lineSharesText: 'mia 60\nvic 40' });
    env.on('2026-05-15');
    env.sit('dan');
    assert.ok(env.api.earnedValueRecordReading({ caseId, cutoffDay: '2026-05-15', shares: { [packageId]: 50 }, evidenceNote: 'Percent-complete review, integration programme, 2026-05-15.' }).ok);
    assert.ok(env.api.earnedValueRecordActual({ caseId, packageId, date: '2026-05-10', amount: '300000.00', source: 'posted period 2026-04' }).ok);
    env.sit('vera');
    const computed = report(env);
    const caseRow = computed.rows.find((entry) => entry.id === caseId);

    const ctx = {
      api: env.api, state: env.store.state, now: at('2026-05-15'), query: new URLSearchParams('panel=earned-value'),
      seatContext: { seat: null, built: null }, navigate: () => {}, refresh: () => {},
    };
    const page = renderFinance(ctx);
    const cell = (testid) => page.querySelector(`[data-testid="${testid}"]`);
    assert.equal(cell(`ev-case-${caseId}-bac`).getAttribute('data-cents'), String(caseRow.bacCents));
    assert.equal(cell(`ev-case-${caseId}-ev`).getAttribute('data-cents'), String(caseRow.latestReading.evCents));
    assert.equal(cell(`ev-case-${caseId}-ac`).getAttribute('data-cents'), String(caseRow.latestReading.acCents));
    assert.equal(cell(`ev-case-${caseId}-eac-cpi`).getAttribute('data-cents'), String(caseRow.latestReading.eacAtCpiCents));
    assert.equal(page.querySelector(`[data-state]`).getAttribute('data-state'), caseRow.stateKey);
    assert.ok(page.textContent.includes('Earned value'), 'the finance navigation offers the panel');

    const levels = [...page.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1)));
    assert.equal(levels.filter((n) => n === 1).length, 1, 'exactly one h1');
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'no skipped heading level');

    // CSV #159: same integers, no identity, blanks rather than zeros.
    const csv = env.api.earnedValueCsvRows();
    assert.ok(csv.ok, csv.error);
    const summary = csv.rows.find((entry) => entry.row_kind === 'summary');
    assert.equal(Number(summary.bac_cents), computed.totals[0].bacCents);
    assert.equal(summary.counts_reconcile, 1);
    assert.equal(summary.figures_complete, 1);
    const flat = JSON.stringify(csv.rows);
    for (const leak of ['Northwind', 'Mia Name', 'WP-1', 'Integrate the finance', 'review minutes', 'Percent-complete']) {
      assert.ok(!flat.includes(leak), `“${leak}” must not cross the export boundary`);
    }
    assert.ok(CSV_EXPORTS.some((descriptor) => descriptor.key === EV_CSV_SCOPE), 'the scope is declared');
  });
});

test('ADR-0217 storage: a reload returns the row its loader returned — no ×100, no repaired package', () => {
  const { env, caseId, packageId } = withPackage({ plannedAmount: '9500000.00', phasesText: '2026-03-31 3800000.00\n2026-06-30 5700000.00' });
  const stored = env.store.state.earnedValuePackages.find((entry) => entry.id === packageId);
  assert.equal(stored.plannedCents, 950_000_000, '9,500,000.00 is stored as 950,000,000 whole cents');
  const reloaded = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') }).state;
  const again = reloaded.earnedValuePackages.find((entry) => entry.id === packageId);
  assert.equal(again.plannedCents, stored.plannedCents);
  assert.equal(again.phases[0].cents, stored.phases[0].cents);
});

test('ADR-0217 withdrawal: a withdrawn case leaves every total, stays on the record and is counted', () => {
  const { env, caseId } = withPackage();
  env.sit('vera');
  assert.ok(env.api.earnedValueWithdrawCase({ caseId, reason: 'The programme was descoped at the board on 2026-06-01; the case is withdrawn, not diminished.' }).ok);
  const view = report(env);
  assert.equal(view.counts.casesOpen, 0);
  assert.equal(view.counts.casesWithdrawn, 1);
  assert.equal(view.rows.find((entry) => entry.id === caseId).stateKey, 'withdrawn');
});

test('ADR-0217 helpers: printedCents refuses out-of-range, ppm is exact half-away-from-zero', () => {
  assert.equal(ppm(1, 3), 3333);
  assert.equal(ppm(-1, 3), -3333);
  assert.equal(printedCents(900_000_000_000_001n), null);
  assert.equal(sumCents([100, 200]), 300n);
});

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
