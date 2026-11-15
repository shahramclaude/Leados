// ADR-0216 — Deal Thesis & Synergy Realization Register.
//
// The register's claims are arithmetic, governance and refusal, so the tests are
// too. One focused pass over what Session 289 built:
//
//   1. migration 169 → 170 adds five EMPTY ledgers and three conventions, and
//      infers no deal, no promise and no saving from the record it upgrades;
//   2. every named refusal is exercised by the door that owns it, and each one
//      saves nothing;
//   3. the identity `headline + contested + dis-synergy = the sum of the rows`
//      holds against an independent oracle, on a hand-worked case and on
//      randomized claims, and a contested saving is counted NOWHERE;
//   4. claimed is not verified: a self-reported run-rate never moves the verified
//      figures, and the capture ratio is refused with a reason rather than 0%;
//   5. the phase ladder decides what is due: not-due before the first phase,
//      promised-to-date from the phase that has arrived, behind beyond the
//      declared materiality band, met inside it with the shortfall printed;
//   6. verification is a control: the owner cannot verify, a peer cannot verify,
//      an ancestor on a DECLARED line can — and reach is recomputed on read, so a
//      line that ends turns a verification into drift and the value leaves the
//      verified figures;
//   7. the run-rate and the P&L effect are never added, and one period cannot be
//      recorded twice;
//   8. currencies are never pooled, and payback is refused rather than assumed;
//   9. RULE-SYN-01 files one opaque ask to the owner, idempotent, self-closing,
//      pause-governed, on the shared spine before the seat and the seal;
//  10. what the panel prints is what the reader computed — cell by cell through
//      data-cents — and the CSV exports the same integers with no identity.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, MIGRATIONS, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createSynergyActions } from '../../app/core/domain/synergyActions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildDealSynergy,
  synergyAttentionCount,
  synergyCsvRows,
  synergyVerifierAbove,
} from '../../app/core/domain/dealSynergy.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import { reconcileClaims, ppm, printedCents, sumCents } from '../../app/core/domain/synergyMath.js';
import { normalizeSynergyClaims, parseSynergyAskSummary } from '../../app/core/domain/synergySchema.js';
import {
  SYNERGY_CSV_SCOPE,
  SYNERGY_RULE_ID,
  SYNERGY_RULE_ID as RULE_ID,
} from '../../app/core/domain/synergyRegistry.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { renderFinance } from '../../app/views/finance.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);

// ceo → vera (vp) → dan (director) → mia (manager) → ivo (ic)
//         → vic (vp) → kai (manager)
// mia ALSO answers to vic on a declared project line, so vic can verify a saving
// mia promised — and can promise one for kai that vera would claim for mia, which
// is the double count this register exists to name instead of resolving.
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
  // The bare api is the one the app's own views call. The guarded one adds the
  // scope boundary the harness enforces; the action's own doors are proved
  // against the bare api so a guard refusal cannot be mistaken for a rule.
  const bare = createApi(store, { now: () => clock, idFactory });
  // The action layer on its own — no gateway, no scope guard. This is the door
  // the app's own code reaches, and the only place a person outside the acting
  // seat's span can be named, so the refusal that guards it can be proved.
  const direct = createSynergyActions(store, { now: () => clock, idFactory });
  const api = guardApi(bare, store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  const touch = () => store.update(() => {}, { type: 'test.touch', entity: 'workspace', entityId: 'touch', summary: 'touch' });
  const nowDay = () => new Date(clock.getTime());
  return { store, api, bare, direct, sit, on, touch, values, nowDay };
}

const THESIS = 'Bought to consolidate the two finance functions and cross-sell the SME book into the acquired platform.';

function declareDeal(env, extra = {}) {
  // Declared inside its own window: a promise made at signing is declared before
  // the readings that measure it, which is the only ordering this record allows.
  env.on('2026-01-20');
  env.sit('vera');
  const result = env.api.synergyDeclareDeal({
    label: 'Northwind',
    currency: 'DKK',
    signedOn: '2026-01-15',
    leadId: 'dan',
    thesis: THESIS,
    ...extra,
  });
  assert.ok(result.ok, result.error);
  return result.dealId;
}

const claimInput = (dealId, extra = {}) => ({
  dealId,
  leverKey: 'cost-sga',
  effectKey: 'synergy',
  ownerId: 'mia',
  savingRef: 'sga-duplicated-finance',
  promisedAnnual: '1000000.00',
  dueOn: '2026-06-30',
  ...extra,
});

function withDeal(extra = {}) {
  const env = seed();
  const dealId = declareDeal(env);
  return { env, dealId, ...extra };
}

function withClaim(claimExtra = {}, env = null) {
  const base = env ? { env } : withDeal();
  const { env: e, dealId } = base;
  e.on('2026-02-01');
  e.sit('vera');
  const result = e.api.synergyDeclareClaim(claimInput(dealId, claimExtra));
  assert.ok(result.ok, result.error);
  e.on('2026-11-15');
  return { ...base, claimId: result.claimId };
}

/** The register as the record implies it. Rights are exercised in their own test. */
function report(env) {
  return buildDealSynergy(env.store.state, { now: env.nowDay(), settings: env.store.state.settings, seat: null });
}

function row(env, claimId) {
  return report(env).rows.find((candidate) => candidate.id === claimId);
}

/** A verification by a seat above the owner on a line. */
function verify(env, claimId, extra = {}) {
  env.sit('dan');
  const result = env.api.synergyRecordReading({
    claimId,
    kindKey: 'run-rate',
    basisKey: 'verified',
    asOf: '2026-09-30',
    amount: '1000000.00',
    evidenceRef: 'Monthly management accounts, September close, reviewed with the CFO.',
    ...extra,
  });
  assert.ok(result.ok, result.error);
  return result;
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

/* =====================================================================
 * 1. MIGRATION — five empty ledgers, three conventions, nothing inferred
 */

test('ADR-0216 migration 169 → 170 adds five EMPTY ledgers and three conventions, and infers no deal', () => {
  assert.equal(SCHEMA_VERSION, 177);
  for (const key of ['dealTheses', 'synergyClaims', 'synergyReadings', 'synergyCosts', 'synergyMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  // A workspace that already holds valuation readings, investment cases and
  // budget envelopes must arrive with NOTHING promised: a synergy inferred from
  // them would put a number on a board's table that nobody made.
  const before = createEmptyState(T0);
  before.schemaVersion = 169;
  before.valueBridgeReadings = [{ id: 'vb1', day: '2026-10-31', currency: 'DKK', ebitdaCents: 1, multipleE4: 85000, netDebtCents: 2, perimeter: 'organic', perimeterAdjCents: 0, basis: 'board pack of the day', recordedOn: '2026-10-31', recordedAt: T0, recordedById: null }];
  delete before.dealTheses;
  delete before.synergyClaims;
  delete before.synergyReadings;
  delete before.synergyCosts;
  delete before.synergyMarkers;
  const next = MIGRATIONS[169](before);
  assert.equal(next.schemaVersion, 170);
  assert.deepEqual(next.dealTheses, []);
  assert.deepEqual(next.synergyClaims, []);
  assert.deepEqual(next.synergyReadings, []);
  assert.deepEqual(next.synergyCosts, []);
  assert.deepEqual(next.synergyMarkers, []);
  assert.equal(next.settings.synergyMaterialityPct, 2);
  assert.equal(next.settings.synergyStaleDays, 120);
  assert.equal(next.settings.synergyAutoPropagate, true);
  assert.equal(next.valueBridgeReadings.length, 1, 'the existing record is left exactly as it was');

  const migrated = migrate({ ...createEmptyState(T0), schemaVersion: 169 });
  assert.equal(migrated.raw.schemaVersion, 174); // full chain to current head
  assert.equal(buildDealSynergy(migrated.raw, { now: at('2026-11-15'), settings: migrated.raw.settings }).counts.deals, 0);
});

/* =====================================================================
 * 2. THE DOOR — every refusal has a name and saves nothing
 */

test('ADR-0216 declarations: the named refusals fire at the door and nothing is stored', () => {
  const { env, dealId } = withDeal();
  const before = JSON.stringify(env.store.state.synergyClaims);
  const refused = (input, name) => {
    const result = env.api.synergyDeclareClaim(input);
    assert.equal(result.ok, false, `${name} must be refused`);
    assert.equal(result.refusal, `synergy:${name}`, `${name} is printed by name`);
    assert.equal(JSON.stringify(env.store.state.synergyClaims), before, `${name} saved nothing`);
  };

  env.sit('vera');
  refused(claimInput('ghost'), 'claim-unknown-deal');
  refused(claimInput(dealId, { leverKey: 'vibes' }), 'claim-unknown-lever');
  refused(claimInput(dealId, { effectKey: 'maybe' }), 'claim-unknown-effect');
  refused(claimInput(dealId, { ownerId: '' }), 'claim-owner-required');
  // An id that names nobody at all never reaches the action: the scope guard
  // refuses it first, which is the stronger door.
  env.sit('vera');
  assert.equal(env.api.synergyDeclareClaim(claimInput(dealId, { ownerId: 'ghost' })).code, 'scope-refusal');
  // A person who has left the roster: no matrix node, so the scope guard lets
  // the id through — and the ACTION, which is what a view actually calls, is the
  // door that must refuse her. A promise made to somebody who has left would sit
  // in the headline with a name beside it who cannot be asked.
  env.store.update((draft) => {
    draft.people = [...draft.people, { ...person('zoe', 'vera', 'manager'), status: 'archived', archivedAt: '2026-03-01T09:00:00.000Z' }];
  }, { type: 'person.archived', entity: 'person', entityId: 'zoe', summary: 'archived' });
  const orphan = env.direct.synergyDeclareClaim(claimInput(dealId, { ownerId: 'zoe' }));
  assert.equal(orphan.ok, false, 'owner-not-on-roster must be refused');
  assert.equal(orphan.refusal, 'synergy:owner-not-on-roster', 'owner-not-on-roster is printed by name');
  assert.equal(JSON.stringify(env.store.state.synergyClaims), before, 'owner-not-on-roster saved nothing');
  // kai answers to vic, not to vera: one line does not promise another line's
  // saving. Proved at the action, because the gateway refuses the naming of a
  // person outside the seat's span before this rule is ever asked.
  const peer = env.direct.synergyDeclareClaim(claimInput(dealId, { ownerId: 'kai' }));
  assert.equal(peer.ok, false);
  assert.equal(peer.refusal, 'synergy:owner-not-reachable', 'owner-not-reachable is printed by name');
  assert.equal(JSON.stringify(env.store.state.synergyClaims), before, 'owner-not-reachable saved nothing');
  refused(claimInput(dealId, { savingRef: '!!' }), 'saving-ref-required');
  refused(claimInput(dealId, { promisedAnnual: '-5.00' }), 'promise-not-positive');
  refused(claimInput(dealId, { promisedAnnual: '1,500.00' }), 'promise-not-positive');
  refused(claimInput(dealId, { dueOn: '' }), 'promise-date-required');
  refused(claimInput(dealId, { dueOn: '2025-12-31' }), 'promise-before-signing');
  refused(claimInput(dealId, { phases: [
    { dueOn: '2026-06-30', target: '400.00' },
    { dueOn: '2026-06-30', target: '1000.00' },
  ] }), 'phase-ladder-order');
  refused(claimInput(dealId, { phases: [{ dueOn: '2026-06-30', target: '900.00' }] }), 'phase-ladder-final');
  refused(claimInput(dealId, { phases: [
    { dueOn: '2026-06-30', target: '400.00' },
    { dueOn: '2026-12-31', target: '900.00' },
  ], promisedAnnual: '1000.00' }), 'phase-ladder-final');

  // The deal door too.
  const dealRefused = env.api.synergyDeclareDeal({ label: 'Cross-border platform deal', currency: 'DKKX', signedOn: '2026-01-01', thesis: THESIS });
  assert.equal(dealRefused.refusal, 'synergy:deal-currency-required');
  const future = env.api.synergyDeclareDeal({ label: 'Future deal', currency: 'DKK', signedOn: '2027-01-01', thesis: THESIS });
  assert.equal(future.refusal, 'synergy:deal-date-required');
  const thin = env.api.synergyDeclareDeal({ label: 'Thin thesis deal', currency: 'DKK', signedOn: '2026-01-01', thesis: 'too short' });
  assert.equal(thin.refusal, 'synergy:thesis-required');
});

test('ADR-0216 readings: self-verification, a peer verifier, missing evidence and a period are all refused', () => {
  const { env, claimId } = withClaim();
  const before = JSON.stringify(env.store.state.synergyReadings);
  const refused = (input, name, seat = 'dan', api = env.api) => {
    env.sit(seat);
    const result = api.synergyRecordReading({ claimId, ...input });
    assert.equal(result.ok, false, `${name} must be refused`);
    assert.equal(result.refusal, `synergy:${name}`, `${name} is printed by name`);
    assert.equal(JSON.stringify(env.store.state.synergyReadings), before, `${name} saved nothing`);
  };
  const base = { kindKey: 'run-rate', basisKey: 'verified', asOf: '2026-09-30', amount: '100.00', evidenceRef: 'Board pack of the September close, signed.' };

  refused({ ...base, kindKey: 'guess' }, 'reading-kind-unknown');
  refused({ ...base, basisKey: 'probably' }, 'reading-basis-unknown');
  refused({ ...base, amount: 'abc' }, 'reading-amount-required');
  refused({ ...base, asOf: '2999-01-01' }, 'reading-date-required');
  refused({ ...base, asOf: '2026-01-31' }, 'reading-before-claim');
  refused({ ...base, kindKey: 'pnl', periodKey: '' }, 'period-key-required');
  refused({ ...base, evidenceRef: '' }, 'evidence-required');

  // The owner cannot verify their own saving: the claim is what they can record.
  refused(base, 'self-verification', 'mia');
  // A peer cannot verify: the test is about the chain, not about rank, so it is
  // proved on the graph itself. kai answers to vic; vic is not above mia.
  const graph = buildMatrix(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings });
  assert.equal(synergyVerifierAbove(graph, 'kai', 'mia'), false, 'a peer on another branch is not above the owner');
  assert.equal(synergyVerifierAbove(graph, 'mia', 'mia'), false, 'nobody is above themselves');
  assert.equal(synergyVerifierAbove(graph, 'dan', 'mia'), true, 'the home manager holds her');
  assert.equal(synergyVerifierAbove(graph, 'vic', 'mia'), true, 'and so does the declared line');
  assert.equal(synergyVerifierAbove(graph, 'ceo', 'mia'), true, 'the ancestor above both does too');

  // A seat the model cannot place at all is refused for that reason, not with a
  // verdict about the promise: ivo is an IC, and an IC seat is read-only.
  env.sit('ivo');
  const unplaced = env.direct.synergyRecordReading({ claimId, ...base });
  assert.equal(unplaced.ok, false);
  assert.match(unplaced.error, /read-only/);

  // A seat BELOW the owner cannot verify upward: mia holds ivo, dan holds mia.
  const upward = withClaim({ ownerId: 'dan' });
  upward.env.sit('mia');
  const denied = upward.env.direct.synergyRecordReading({
    claimId: upward.claimId, kindKey: 'run-rate', basisKey: 'verified', asOf: '2026-09-30', amount: '100.00',
    evidenceRef: 'Monthly pack — but the reader is below the owner, so this is refused.',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.refusal, 'synergy:verifier-out-of-reach', 'a seat below the owner cannot verify upward');

  // The owner's own report is a claim, and it is recorded as one.
  env.sit('mia');
  const claimed = env.api.synergyRecordReading({ claimId, kindKey: 'run-rate', basisKey: 'claimed', asOf: '2026-09-30', amount: '980000.00' });
  assert.ok(claimed.ok, claimed.error);
  assert.equal(env.store.state.synergyReadings.at(-1).basisKey, 'claimed');

  // One P&L reading per period, and a restatement withdraws rather than stacks.
  env.sit('dan');
  assert.ok(env.api.synergyRecordReading({ claimId, kindKey: 'pnl', basisKey: 'claimed', asOf: '2026-09-30', periodKey: '2026-Q3', amount: '250000.00' }).ok);
  const duplicate = env.api.synergyRecordReading({ claimId, kindKey: 'pnl', basisKey: 'claimed', asOf: '2026-09-30', periodKey: '2026-Q3', amount: '260000.00' });
  assert.equal(duplicate.refusal, 'synergy:period-duplicate');
});

/* =====================================================================
 * 3. THE IDENTITY — contested money is counted nowhere
 */

test('ADR-0216 double count: two owners, one saving — printed, excluded, and the rows still add up', () => {
  const { env, dealId } = withClaim({ promisedAnnual: '1000000.00' });
  // A second line promises the SAME saving on the same deal, spelled differently.
  env.sit('vic');
  const twin = env.api.synergyDeclareClaim(claimInput(dealId, {
    ownerId: 'kai',
    savingRef: 'SGA duplicated finance',
    promisedAnnual: '600000.00',
    dueOn: '2026-09-30',
  }));
  assert.ok(twin.ok, twin.error);
  // And an unrelated promise that must stay in the headline.
  env.sit('vera');
  const other = env.api.synergyDeclareClaim(claimInput(dealId, {
    savingRef: 'cogs-procurement-scale',
    leverKey: 'cost-cogs',
    promisedAnnual: '400000.00',
  }));
  assert.ok(other.ok, other.error);

  const table = report(env).deals[0];
  assert.equal(table.counts.contestedGroups, 1, 'one contested saving, not two promises');
  const group = table.contestedGroups[0];
  assert.equal(group.members.length, 2);
  assert.deepEqual(group.members.map((member) => member.ownerName).sort(), ['Kai Name', 'Mia Name'], 'both claimants are printed');
  assert.equal(group.promisedCents, 1_600_000_00, 'both promises are printed on the group');

  assert.equal(table.totals.contestedCents, 1_600_000_00, 'held OUT of the headline');
  assert.equal(table.totals.headlineCents, 400_000_00, 'the headline is the uncontested promise only');
  assert.equal(table.totals.sumOfRowsCents, 2_000_000_00, 'the plain sum of the rows');
  assert.equal(
    table.totals.headlineCents + table.totals.contestedCents,
    table.totals.sumOfRowsCents,
    'headline + contested = the sum of the rows, re-added from the printed integers',
  );
  assert.equal(table.reconcile.headlinePlusContested, true);

  // The oracle: an independent reconciliation over the raw promise rows.
  const claims = normalizeSynergyClaims(env.store.state.synergyClaims, env.store.state.dealTheses, []);
  const oracle = reconcileClaims(claims);
  assert.equal(oracle.headlineCents, 400_000_00n);
  assert.equal(oracle.contestedCents, 1_600_000_00n);
  assert.equal(oracle.sumOfRowsCents, 2_000_000_00n);
});

test('ADR-0216 reconciliation: randomized promises satisfy the printed identity exactly', () => {
  // A small deterministic generator: the identity must hold for every shape,
  // including repeated saving references across owners and directions.
  let seedValue = 7;
  const next = () => { seedValue = (seedValue * 1103515245 + 12345) % 2147483648; return seedValue; };
  const refs = ['a', 'b', 'c', 'd'];
  for (let round = 0; round < 200; round += 1) {
    const claims = [];
    const n = 1 + (next() % 7);
    for (let index = 0; index < n; index += 1) {
      claims.push({
        id: `c${index}`,
        dealId: 'd1',
        savingKey: refs[next() % refs.length],
        effectKey: next() % 5 === 0 ? 'dis-synergy' : 'synergy',
        promisedAnnualCents: 1 + (next() % 100000),
      });
    }
    const result = reconcileClaims(claims);
    assert.equal(result.countsReconcile, true, 'the identity holds by construction');
    assert.equal(result.headlineCents + result.contestedCents, result.sumOfRowsCents);
    // A contested saving is counted in exactly one place: the contested column.
    for (const group of result.groups) {
      if (!group.contested) continue;
      assert.ok(result.contestedGroups.includes(group));
    }
    // The printed figures are the computed figures, exactly.
    assert.equal(result.headlinePrinted, Number(result.headlineCents));
    assert.equal(result.sumOfRowsPrinted, Number(result.sumOfRowsCents));
  }
});

test('ADR-0216 dis-synergy: a declared loss is subtracted, printed apart, and never hidden as a negative promise', () => {
  const { env, dealId } = withClaim({ promisedAnnual: '1000000.00' });
  env.sit('vera');
  const loss = env.api.synergyDeclareClaim(claimInput(dealId, {
    effectKey: 'dis-synergy',
    savingRef: 'revenue-customer-attrition',
    leverKey: 'revenue-cross-sell',
    promisedAnnual: '250000.00',
    dueOn: '2026-06-30',
  }));
  assert.ok(loss.ok, loss.error);
  const table = report(env).deals[0];
  assert.equal(table.totals.disSynergyCents, 250_000_00);
  assert.equal(table.totals.headlineCents, 750_000_00, 'gross synergy minus the declared loss');
  assert.equal(table.totals.sumOfRowsCents, 750_000_00);
  const lossRow = table.liveRows.find((candidate) => candidate.id === loss.claimId);
  assert.equal(lossRow.effectKey, 'dis-synergy');
  assert.equal(lossRow.promisedFullCents, 250_000_00, 'the magnitude is positive; the direction is declared');
});

/* =====================================================================
 * 4. CLAIMED IS NOT VERIFIED
 */

test('ADR-0216 verification: a claimed reading is printed, counted nowhere, and the capture is REFUSED', () => {
  const { env, claimId } = withClaim();
  env.sit('mia');
  assert.ok(env.api.synergyRecordReading({ claimId, kindKey: 'run-rate', basisKey: 'claimed', asOf: '2026-09-30', amount: '1000000.00' }).ok);

  const reading = row(env, claimId);
  assert.equal(reading.claimedRunRateCents, 1_000_000_00, 'the claim is printed');
  assert.equal(reading.verifiedRunRateCents, null, 'and not counted as verified');
  assert.equal(reading.stateKey, 'unverified', 'a due promise with no verification is a refusal, not a miss');
  const table = report(env).deals[0];
  assert.equal(table.totals.verifiedRunRateCents, 0);
  assert.equal(table.capturePpm, null);
  assert.equal(table.captureReason, 'no verified reading exists, so there is no measured figure to divide');
  assert.equal(table.verificationSharePpm, 0);

  // The verification lands: the same promise becomes measured, and the capture
  // is the ratio of the printed integers.
  verify(env, claimId, { amount: '800000.00' });
  const verified = row(env, claimId);
  assert.equal(verified.stateKey, 'behind');
  assert.equal(verified.verifiedRunRateCents, 800_000_00);
  const after = report(env).deals[0];
  assert.equal(after.capturePpm, 8000, '80.0% of the promised run-rate, in exact parts per ten-thousand');
  assert.equal(after.verificationSharePpm, 8000, 'the share of the FULL promise that carries a verified reading');
});

/* =====================================================================
 * 5. THE PHASE LADDER
 */

test('ADR-0216 ladder: not-due before the first phase, promised-to-date from the phase that arrived, met within the band', () => {
  const env = seed();
  const dealId = declareDeal(env);
  env.sit('vera');
  const declared = env.api.synergyDeclareClaim(claimInput(dealId, {
    promisedAnnual: '1000.00',
    phases: [
      { dueOn: '2026-06-30', target: '400.00' },
      { dueOn: '2027-06-30', target: '1000.00' },
    ],
  }));
  assert.ok(declared.ok, declared.error);
  const claimId = declared.claimId;

  // Before the first phase: nothing is owed, and nothing is graded.
  env.on('2026-03-01');
  let current = row(env, claimId);
  assert.equal(current.stateKey, 'not-due');
  assert.equal(current.promisedToDateCents, 0);
  assert.equal(report(env).deals[0].capturePpm, null, 'no capture against a date that has not arrived');

  // After the first phase: the phase target, never the full promise.
  env.on('2026-11-15');
  current = row(env, claimId);
  assert.equal(current.promisedToDateCents, 400_00);
  assert.equal(current.promisedFullCents, 1000_00);
  assert.equal(current.nextDueOn, '2027-06-30');

  // 380 verified against a 400 target, 2% band = 8.00: short by 20 → behind.
  verify(env, claimId, { amount: '380.00' });
  current = row(env, claimId);
  assert.equal(current.toleranceCents, 8_00);
  assert.equal(current.stateKey, 'behind');
  assert.equal(current.gapCents, 20_00);

  // A second verification inside the band: met, with the shortfall printed.
  env.sit('dan');
  assert.ok(env.api.synergyRecordReading({
    claimId, kindKey: 'run-rate', basisKey: 'verified', asOf: '2026-10-31', amount: '396.00',
    evidenceRef: 'October management accounts, agreed with the integration office.',
  }).ok);
  current = row(env, claimId);
  assert.equal(current.stateKey, 'met');
  assert.equal(current.metShortfallCents, 4_00, 'inside the band is still printed as an amount, never rounded away');

  // A dis-synergy is BEHIND when more leaves than was declared, not less. The
  // promise is declared on the day its reading is dated: a reading before the
  // promise measures something else, which the action refuses by name.
  env.on('2026-10-31');
  env.sit('vera');
  const loss = env.api.synergyDeclareClaim(claimInput(dealId, {
    effectKey: 'dis-synergy', savingRef: 'loss-attrition', promisedAnnual: '100.00', dueOn: '2026-06-30',
  }));
  assert.ok(loss.ok, loss.error);
  env.sit('dan');
  assert.ok(env.api.synergyRecordReading({
    claimId: loss.claimId, kindKey: 'run-rate', basisKey: 'verified', asOf: '2026-10-31', amount: '140.00',
    evidenceRef: 'Churn report from the acquired book, October.',
  }).ok);
  assert.equal(row(env, loss.claimId).stateKey, 'behind', 'a worse loss than declared is behind');
});

/* =====================================================================
 * 6. VERIFICATION REACH — a matrix control, recomputed on every read
 */

test('ADR-0216 reach: an ancestor on a DECLARED line can verify, and the reach is re-tested on read', () => {
  const { env, claimId } = withClaim();
  // vic is mia's second manager on a declared line. He is not her home manager.
  env.sit('vic');
  const verified = env.api.synergyRecordReading({
    claimId, kindKey: 'run-rate', basisKey: 'verified', asOf: '2026-09-30', amount: '1000000.00',
    evidenceRef: 'Shared cost-centre report, agreed with the functional controller.',
  });
  assert.ok(verified.ok, verified.error);
  const matrix = buildDealSynergy(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings }).rows;
  assert.equal(matrix[0].verifiedByName, 'Vic Name');
  assert.equal(matrix[0].verifiedDrifted, false);
  assert.equal(matrix[0].ownerLines, 2, 'the reader prints that the owner sits on two lines');

  // The declared line ENDS. The verifier is no longer above her on any line, so
  // the reading stops counting — the value stays on the record, unverified.
  env.store.update((draft) => {
    draft.reportingLines = draft.reportingLines.map((line) => (line.id === 'rl-mia-vic' ? { ...line, toISO: '2026-10-31' } : line));
  }, { type: 'matrix.line.ended', entity: 'reportingLine', entityId: 'rl-mia-vic', summary: 'line ended' });

  const after = row(env, claimId);
  assert.equal(after.verifiedDrifted, true, 'the drift is printed, not silently accepted');
  assert.equal(after.stateKey, 'unverified', 'and the promise is unverified again, not still “met”');
  assert.equal(after.verifiedRunRateCents, 1_000_000_00, 'the reading itself is still on the record');
  const table = report(env).deals[0];
  assert.equal(table.totals.verifiedRunRateCents, 0, 'a drifted verification is counted as unverified');
  assert.ok(report(env).counts.verifierDrifted >= 1);
});

test('ADR-0216 owner: a promise whose owner leaves the roster is kept, printed and asked of nobody', () => {
  const { env, claimId } = withClaim();
  env.store.update((draft) => {
    draft.people = draft.people.map((entry) => (entry.id === 'mia' ? { ...entry, status: 'archived' } : entry));
  }, { type: 'person.archived', entity: 'person', entityId: 'mia', summary: 'archived' });
  const current = row(env, claimId);
  assert.equal(current.stateKey, 'unowned');
  assert.equal(current.promisedFullCents, 1_000_000_00, 'the promise is not deleted with the person');
  env.touch();
  const asks = env.store.state.delegations.filter((task) => String(task.title).includes('deal synergy register'));
  assert.equal(asks.length, 0, 'nobody is asked, because the only addressee has left');
  assert.ok(env.store.state.synergyMarkers.some((marker) => marker.key.includes('unowned')), 'the finding is recorded identity-free');
});

/* =====================================================================
 * 7. RUN-RATE AND P&L ARE NEVER ADDED
 */

test('ADR-0216 run-rate vs P&L: two totals, kept apart, and a period recorded once', () => {
  const { env, claimId } = withClaim();
  verify(env, claimId, { amount: '600000.00' });
  env.sit('dan');
  assert.ok(env.api.synergyRecordReading({ claimId, kindKey: 'pnl', basisKey: 'claimed', asOf: '2026-09-30', periodKey: '2026-Q3', amount: '150000.00' }).ok);
  assert.ok(env.api.synergyRecordReading({ claimId, kindKey: 'pnl', basisKey: 'claimed', asOf: '2026-11-10', periodKey: '2026-Q4', amount: '50000.00' }).ok);

  const table = report(env).deals[0];
  assert.equal(table.totals.verifiedRunRateCents, 600_000_00, 'the run-rate is the run-rate');
  assert.equal(table.totals.pnlCents, 200_000_00, 'the P&L is money in named periods');
  assert.notEqual(table.totals.verifiedRunRateCents, table.totals.pnlCents);
  // Neither is folded into the other anywhere: the identity is over promises, and
  // the two readings are separate columns on every row.
  const current = row(env, claimId);
  assert.equal(current.verifiedRunRateCents, 600_000_00);
  assert.equal(current.pnlCents, 200_000_00);
  assert.equal(current.pnlPeriods, 2);
  // A hand-edited file with a duplicated period is FLAGGED, not silently summed.
  const tampered = { ...env.store.state, synergyReadings: [...env.store.state.synergyReadings, { ...env.store.state.synergyReadings.at(-1), id: 'dup-1' }] };
  const flagged = buildDealSynergy(tampered, { now: at('2026-11-15'), settings: tampered.settings });
  assert.equal(flagged.flags.figuresComplete, false, 'a period recorded twice makes the figures incomplete');
  assert.ok(flagged.counts.duplicatePeriodRows >= 1);
});

/* =====================================================================
 * 8. CURRENCY AND PAYBACK
 */

test('ADR-0216 currency: two currencies are printed apart and no grand total is offered', () => {
  const env = seed();
  const dkk = declareDeal(env);
  env.sit('vera');
  assert.ok(env.api.synergyDeclareClaim(claimInput(dkk, { promisedAnnual: '500.00' })).ok);
  env.on('2026-11-15');
  const usd = env.api.synergyDeclareDeal({ label: 'Other', currency: 'USD', signedOn: '2026-02-01', leadId: 'dan', thesis: THESIS }).dealId;
  assert.ok(usd);
  assert.ok(env.api.synergyDeclareClaim(claimInput(usd, { promisedAnnual: '300.00', savingRef: 'us-sga' })).ok);

  const reportValue = report(env);
  assert.equal(reportValue.currencyTotals.length, 2);
  assert.deepEqual(reportValue.currencyTotals.map((bucket) => bucket.currency), ['DKK', 'USD']);
  assert.equal(reportValue.multiCurrency, true);
  assert.equal(reportValue.grandTotal.value, null);
  assert.match(reportValue.grandTotal.reason, /more than one currency/);
  const csv = synergyCsvRows(reportValue);
  assert.equal(csv.filter((entry) => entry.row_kind === 'summary').length, 2);
  // A promise is never written in another deal's currency: the deal carries it.
  const mismatch = env.api.synergyDeclareClaim(claimInput(dkk, { currency: 'USD' }));
  assert.ok(mismatch.ok, 'a stray currency field is ignored; the deal owns the currency');
  assert.equal(row(env, mismatch.claimId).currency, 'DKK');
});

test('ADR-0216 payback: refused without a declared cost, refused on a non-positive run-rate, exact otherwise', () => {
  const { env, claimId } = withClaim();
  verify(env, claimId, { amount: '1200000.00' });
  let table = report(env).deals[0];
  assert.equal(table.paybackMonthsX10, null);
  assert.match(table.paybackReason, /no one-off cost has been declared/);

  env.sit('dan');
  const cost = env.api.synergyRecordCost({ dealId: table.id, amount: '600000.00', spentOn: '2026-06-01', kindKey: 'severance' });
  assert.ok(cost.ok, cost.error);
  table = report(env).deals[0];
  assert.equal(table.totals.costCents, 600_000_00);
  // 600,000 ÷ (1,200,000 ÷ 12) = 6.0 months.
  assert.equal(table.paybackMonthsX10, 60);

  // A verified run-rate of zero refuses the payback rather than printing infinity.
  const zero = withClaim();
  verify(zero.env, zero.claimId, { amount: '0.00' });
  zero.env.sit('dan');
  assert.ok(zero.env.api.synergyRecordCost({ dealId: report(zero.env).deals[0].id, amount: '1000.00', spentOn: '2026-06-01', kindKey: 'advisory' }).ok);
  const zeroTable = report(zero.env).deals[0];
  assert.equal(zeroTable.paybackMonthsX10, null);
  assert.match(zeroTable.paybackReason, /zero or negative/);
});

/* =====================================================================
 * 9. RULE-SYN-01 ON THE SHARED SPINE
 */

test('ADR-0216 rule: one opaque ask to the owner, idempotent, self-closing, paused by its own switch', () => {
  const { env, claimId } = withClaim(); // due 2026-06-30, no verification
  env.touch();
  const asks = () => env.store.state.delegations.filter((task) => String(task.title).includes('deal synergy register'));
  assert.equal(asks().length, 1);
  const ask = asks()[0];
  assert.equal(ask.personId, 'mia', 'the owner is asked, never their manager and never a verifier');
  assert.equal(ask.authority, 'act-inform');

  // THE ASK SAYS NOTHING: no deal, no lever, no amount, no saving reference.
  const body = JSON.stringify(ask).toLowerCase();
  for (const leak of ['northwind', 'cost-sga', 'sga-duplicated', '1,000,000', '1000000', 'mia name', '2026-06-30']) {
    assert.ok(!body.includes(leak), `the ask must not carry “${leak}”: a delegation is readable above the owner`);
  }
  const links = env.store.state.links.filter((link) => link.ruleId === RULE_ID);
  assert.equal(links.length, 1);
  assert.equal(links[0].relation, 'issues-obligation');
  const parsed = parseSynergyAskSummary(links[0].summary);
  assert.equal(parsed.kind, 'unverified');
  assert.equal(parsed.claimId, claimId);

  // Idempotent: another commit files nothing.
  env.touch();
  assert.equal(asks().length, 1);

  // Self-closing: the verification lands, the ask closes.
  verify(env, claimId, { amount: '1000000.00' });
  const closed = env.store.state.delegations.find((task) => task.id === ask.id);
  assert.equal(closed.status, 'done');
  assert.match(closed.completionNote, /no longer reports this condition/);

  // The pause governs every path, including an explicit scan.
  const paused = withClaim();
  paused.env.store.update((draft) => { draft.settings = { ...draft.settings, synergyAutoPropagate: false }; },
    { type: 'settings.updated', entity: 'settings', entityId: 'synergy', summary: 'paused' });
  paused.env.sit('vera');
  paused.env.api.synergyScan();
  assert.equal(paused.env.store.state.delegations.filter((task) => String(task.title).includes('deal synergy register')).length, 0);
});

test('ADR-0216 rule: registered on the shared spine before the seat and the seal, with a declared contract', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  const index = ids.indexOf('synergyRule');
  assert.ok(index >= 0, 'synergyRule is on the spine');
  assert.ok(index < ids.indexOf('speakUpRule'), 'it files before the later governance rules');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2).id, 'seatRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).id, 'sealRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length, 'one rule, one contract');
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.rule === DEFAULT_POST_COMMIT_RULES[index]);
  assert.ok(contract, 'the rule has a declared contract');
  assert.ok(contract.writes.includes('synergyMarkers'));
  assert.equal(contract.scansWorkspace, true);

  // The switch is named in the source that reads it (the pause census greps this).
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/core/domain/synergyRules.js'), 'utf8');
  assert.ok(source.includes('synergyAutoPropagate'));
  assert.ok(!/buildMatrix|reportingLines|matrixLineScope|matrixJointApex|personAllocation/.test(source),
    'the rule asks the named owner directly, so silencing it does not reach a second line — recorded, not inherited');
});

/* =====================================================================
 * 10. AUTHORITY AND WHAT THE SCREEN PRINTS
 */

test('ADR-0216 authority: enterprise material at rank 4, a director may record but not declare', () => {
  const { env } = withDeal();
  env.sit('dan'); // director, rank 3
  assert.equal(env.api.synergyReport().ok, false, 'a director does not read a deal thesis');
  const declared = env.api.synergyDeclareClaim(claimInput('any'));
  assert.equal(declared.ok, false, 'and does not declare a promise');
  const recorded = env.api.synergyRecordReading({ claimId: 'x', kindKey: 'run-rate', basisKey: 'claimed', asOf: '2026-11-01', amount: '1.00' });
  assert.equal(recorded.ok, false);
  assert.match(recorded.error, /belongs to a promise/, 'the recording right is held; the row is what is missing');

  env.sit('vera');
  assert.ok(env.api.synergyReport().ok, 'a VP reads the register');
  // The undeclared operator view still reads the whole register: the seat model
  // is a workflow declaration, and the operator is the workspace owner.
  env.store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: null }; },
    { type: 'seat.undeclared', entity: 'settings', entityId: 'seat', summary: 'operator' });
  assert.ok(env.api.synergyReport().ok, 'and so does the operator view');
});

test('ADR-0216 display = computation: every cell carries the reader’s integer, and the CSV carries no identity', () => {
  withDom(() => {
    const { env, claimId, dealId } = withClaim();
    env.sit('vera');
    verify(env, claimId, { amount: '800000.00' });
    env.sit('dan');
    assert.ok(env.api.synergyRecordCost({ dealId, amount: '150000.00', spentOn: '2026-05-01', kindKey: 'advisory' }).ok);
    env.sit('vera');
    const computed = report(env);
    const deal = computed.deals[0];
    const current = deal.liveRows[0];

    const ctx = {
      api: env.api, state: env.store.state, now: at('2026-11-15'), query: new URLSearchParams('panel=synergy'),
      seatContext: { seat: null, built: null }, navigate: () => {}, refresh: () => {},
    };
    const page = renderFinance(ctx);
    const cell = (testid) => page.querySelector(`[data-testid="${testid}"]`);
    const dealCell = (name) => cell(`syn-deal-${dealId}-${name}`);
    assert.equal(dealCell('headline').getAttribute('data-cents'), String(deal.totals.headlineCents));
    assert.equal(dealCell('todate').getAttribute('data-cents'), String(deal.totals.promisedToDateCents));
    assert.equal(dealCell('verified').getAttribute('data-cents'), String(deal.totals.verifiedRunRateCents));
    assert.equal(dealCell('contested').getAttribute('data-cents'), String(deal.totals.contestedCents));
    assert.equal(dealCell('cost').getAttribute('data-cents'), String(deal.totals.costCents));
    assert.equal(dealCell('pnl').getAttribute('data-cents'), String(deal.totals.pnlCents));
    assert.equal(cell(`syn-row-${claimId}-promised`).getAttribute('data-cents'), String(current.promisedFullCents));
    assert.equal(cell(`syn-row-${claimId}-todate`).getAttribute('data-cents'), String(current.promisedToDateCents));
    assert.equal(cell(`syn-row-${claimId}-verified`).getAttribute('data-cents'), String(current.verifiedRunRateCents));
    assert.equal(page.querySelector('[data-state]').getAttribute('data-state'), current.stateKey);
    assert.ok(page.textContent.includes('Deal synergy'), 'the finance navigation offers the panel');

    // One h1 and no skipped heading level.
    const levels = [...page.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => Number(el.tagName.slice(1)));
    assert.equal(levels.filter((n) => n === 1).length, 1, 'exactly one h1');
    for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'no skipped heading level');

    // CSV #158: same integers, no identity, blanks rather than zeros.
    const csv = env.api.synergyCsvRows();
    assert.ok(csv.ok, csv.error);
    const summary = csv.rows.find((entry) => entry.row_kind === 'summary');
    assert.equal(summary.promised_full_cents, String(deal.totals.headlineCents), 'the summary row states the printed headline');
    assert.equal(summary.verified_run_rate_cents, String(deal.totals.verifiedRunRateCents));
    assert.equal(summary.cost_to_achieve_cents, String(deal.totals.costCents));
    assert.equal(summary.counts_reconcile, 'YES');
    assert.equal(summary.figures_complete, 'YES');
    const flat = JSON.stringify(csv.rows);
    for (const leak of ['Mia Name', 'Dan Name', 'Northwind', 'sga-duplicated-finance', 'management accounts', THESIS.slice(0, 20)]) {
      assert.ok(!flat.includes(leak), `“${leak}” must not cross the export boundary`);
    }
    assert.ok(CSV_EXPORTS.some((descriptor) => descriptor.key === SYNERGY_CSV_SCOPE), 'the scope is declared');
  });
});

test('ADR-0216 attention: the badge counts what is due and unverified, plus what is verified short', () => {
  const { env, claimId } = withClaim();
  assert.equal(synergyAttentionCount(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings }), 1);
  verify(env, claimId, { amount: '400000.00' });
  assert.equal(synergyAttentionCount(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings }), 1, 'now behind');
  verify(env, claimId, { amount: '1000000.00', asOf: '2026-10-31' });
  assert.equal(synergyAttentionCount(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings }), 0, 'met and current');
});

test('ADR-0216 storage: a reload returns the row its loader returned — no ×100, no repaired promise', () => {
  const { env, claimId } = withClaim({ promisedAnnual: '9500000.00' });
  const stored = env.store.state.synergyClaims.find((entry) => entry.id === claimId);
  assert.equal(stored.promisedAnnualCents, 950_000_000, '9,500,000.00 is stored as 950,000,000 whole cents');
  const reloaded = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') }).state;
  const again = reloaded.synergyClaims.find((entry) => entry.id === claimId);
  assert.equal(again.promisedAnnualCents, stored.promisedAnnualCents, 'the same cents before and after a reload');
  assert.equal(again.phases[0].targetCents, stored.phases[0].targetCents);

  // A malformed row is dropped AND counted, never repaired into existence.
  const broken = { ...reloaded, synergyClaims: [...reloaded.synergyClaims, { id: 'bad', dealId: 'nope', leverKey: 'cost-sga', effectKey: 'synergy', ownerId: 'mia', savingRef: 'x', promisedAnnualCents: 1000, phases: [{ dueOn: '2026-01-01', targetCents: 500 }], declaredOn: '2026-01-01' }] };
  const warnings = [];
  const loaded = normalizeSynergyClaims(broken.synergyClaims, reloaded.dealTheses, warnings);
  assert.equal(loaded.length, 1, 'the unreadable promise is dropped');
  assert.equal(warnings.length, 1, 'and the drop is counted');
  const view = buildDealSynergy(broken, { now: at('2026-11-15'), settings: broken.settings });
  assert.equal(view.flags.figuresComplete, false);
  assert.ok(view.counts.droppedRows >= 1);
});

test('ADR-0216 withdrawal: a withdrawn promise leaves every total, stays on the record and is counted', () => {
  const { env, claimId, dealId } = withClaim();
  env.sit('vera');
  assert.ok(env.api.synergyDeclareClaim(claimInput(dealId, { savingRef: 'cogs-scope', promisedAnnual: '100.00' })).ok);
  let table = report(env).deals[0];
  assert.equal(table.totals.headlineCents, 1_000_100_00);

  assert.ok(env.api.synergyWithdrawClaim({ claimId, reason: 'The function was not consolidated; the promise is withdrawn, not resized.' }).ok);
  table = report(env).deals[0];
  assert.equal(table.totals.headlineCents, 100_00, 'the withdrawn promise leaves the total');
  assert.equal(table.counts.withdrawn, 1, 'and the exclusion is counted');
  assert.equal(table.rows.length, 2, 'the row is kept on the record');
  const withdrawn = table.rows.find((entry) => entry.id === claimId);
  assert.equal(withdrawn.stateKey, 'withdrawn');
  assert.match(withdrawn.withdrawnReason, /consolidated/);
});

test('ADR-0216 conventions: a value outside its bounds is refused, never clamped', () => {
  const { env } = withDeal();
  env.sit('vera');
  const refused = env.api.synergySetConventions({ synergyMaterialityPct: 51 });
  assert.equal(refused.refusal, 'synergy:convention-out-of-bounds');
  assert.equal(env.store.state.settings.synergyMaterialityPct, 2, 'nothing moved');
  assert.ok(env.api.synergySetConventions({ synergyMaterialityPct: 10 }).ok);
  assert.equal(env.store.state.settings.synergyMaterialityPct, 10);
});

test('ADR-0216 helpers: ppm is the exact ratio and a figure outside the printed range is refused', () => {
  assert.equal(ppm(1, 3), 3333, 'one third, half away from zero');
  assert.equal(ppm(2, 3), 6667);
  assert.equal(ppm(0, 5), 0);
  assert.equal(ppm(5, 0), null, 'no denominator, no ratio');
  assert.equal(sumCents([100, 200, -50]), 250n);
  assert.equal(printedCents(900_000_000_000_001n), null, 'a figure outside the printed range is refused, never rounded into range');
});
