/**
 * ADR-0177 — Cross-Line Labour Chargeback & Internal Transfer-Price Ledger
 * (Schema v142, RULE-TPL-01, CSV #132, `#/matrix?panel=chargeback`).
 *
 * One focused suite: registration, the fail-closed normalizer, single-chain
 * inertness, a HAND-COMPUTED matrix fixture (share-day partition, integer
 * cents, withheld nets, span eliminations, zero-sum), the two-key lifecycle
 * through the real API under declared seats, RULE-TPL-01 end to end, lender
 * resolution against the recorded home-line history, seat scope, and
 * display == stored across a real reload.
 *
 * THE FIXTURE, BY HAND (period = last completed quarter, 2026-07-01..2026-09-30, 92 days)
 *   sam  home fm, 20% on pm's line until a retune to 40% on 2026-08-15
 *        → 45 days × 20 + 47 days × 40 = 900 + 1880 = 2780 share-days
 *   hal  home fm, 25% on pm2's line from 2026-08-01 → 61 days × 25 = 1525
 *   pat  home pm, 10% on fm's line → 92 days × 10 = 920
 *   consumed = 5225
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { LEADER_ID } from '../../app/core/domain/chain.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { buildLinePeriodAllocation } from '../../app/core/domain/linePeriodAllocation.js';
import { transferPriceRule } from '../../app/core/domain/transferPriceRules.js';
import {
  buildTransferPriceLedger, compileTransferPrices, transferPriceBriefText, transferPriceCsvRows,
} from '../../app/core/domain/transferPrice.js';
import { formatCents, transferPriceRate } from '../../app/core/domain/transferPriceSchema.js';
import {
  TRANSFER_PRICE_AGREEMENT_STATES, TRANSFER_PRICE_CSV_COLUMNS, TRANSFER_PRICE_LIMITS,
  TRANSFER_PRICE_REFUSAL_STATES, TRANSFER_PRICE_ROW_STATES, TRANSFER_PRICE_RULE_ID,
} from '../../app/core/domain/transferPriceRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const ISO = NOW.toISOString();
const C = '2025-01-01T00:00:00.000Z';
const Q3 = { effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30' };

function fakeStorage(seed = null) {
  const map = new Map();
  if (seed) map.set(STORAGE_KEY, JSON.stringify(seed));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

const person = (id, name, level, managerId) => ({ id, name, level, managerId, status: 'active', createdAt: C });
const line = (id, personId, managerId, kind, shareH, fromISO, history = []) => ({
  id, personId, managerId, kind, shareH, rights: [], fromISO, toISO: null, declaredAt: C, status: 'active', history,
});

/**
 * VP → two directors. Under dirA: `fm` (functional) and `pm2` (product). Under
 * dirB: `pm` (project). fm lends sam to pm and hal to pm2; pm lends pat to fm.
 */
function baseState({ seatId = null, lines = true } = {}) {
  const state = createEmptyState(ISO);
  state.settings.activeSeatId = seatId;
  state.people = [
    person('vp', 'Vera VP', 'vp', null),
    person('dirA', 'Dana Director', 'director', 'vp'),
    person('dirB', 'Dev Director', 'director', 'vp'),
    person('fm', 'Fay Functional', 'manager', 'dirA'),
    person('pm2', 'Paul Product', 'manager', 'dirA'),
    person('pm', 'Priya Project', 'manager', 'dirB'),
    person('sam', 'Sam Shared', 'ic', 'fm'),
    person('hal', 'Hal Half', 'ic', 'fm'),
    person('quin', 'Quin Product', 'ic', 'pm2'),
    person('pat', 'Pat Project', 'ic', 'pm'),
  ];
  state.reportingLines = lines ? [
    line('ln-sam', 'sam', 'pm', 'project', 40, '2026-01-01', [{ at: '2026-08-15T09:00:00.000Z', shareH: 20, rights: [] }]),
    line('ln-hal', 'hal', 'pm2', 'product', 25, '2026-08-01'),
    line('ln-pat', 'pat', 'fm', 'cross-functional', 10, '2026-01-01'),
  ] : [];
  return state;
}

function harness(seed) {
  const storage = fakeStorage(seed);
  const store = createStore({ storage, now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api, storage };
}

/** Operate the SAME workspace from another declared seat (null = operator view). */
const sit = (store, seatId) => { store.state.settings = { ...store.state.settings, activeSeatId: seatId }; };
const reportOf = (api, options) => { const r = api.transferPriceReport(options); assert.equal(r.ok, true, r.error); return r.report; };
const tplTasks = (store) => store.state.delegations.filter((d) => String(d.support).includes(TRANSFER_PRICE_RULE_ID));
const activeTasks = (store) => tplTasks(store).filter((d) => d.status === 'active');

/** Operator view: scribe one key, then the other. Returns the agreement id. */
function agree(api, input) {
  const p = api.transferPricePropose({ actingSide: 'lender', ...input });
  assert.equal(p.ok, true, p.error);
  const c = api.transferPriceConfirm(p.id);
  assert.equal(c.ok, true, c.error);
  return p.id;
}

/** Stored acts for one agreed price, as the action writes them. */
function agreedActs(id, lenderId, borrowerId, terms, at = ISO) {
  const base = { agreementId: id, lenderId, borrowerId, via: 'operator', decidedBySeatId: null, decidedOn: at.slice(0, 10), at, note: '', voidFrom: null, ...terms };
  return [
    { ...base, id: `${id}-p`, kind: 'propose', side: 'lender' },
    { ...base, id: `${id}-c`, kind: 'confirm', side: 'borrower' },
  ];
}
const EUR600 = { currency: 'EUR', rateCents: 600, basis: 'standard-cost', ...Q3 };

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><main id="view"></main></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const prev = new Map(keys.map((k) => [k, globalThis[k]]));
  try {
    for (const k of keys) globalThis[k] = k === 'window' ? dom.window : k === 'document' ? dom.window.document : dom.window[k];
    return fn(dom);
  } finally {
    for (const k of keys) globalThis[k] = prev.get(k);
    dom.window.close();
  }
}

test('ADR-0177 registration: Schema v142, empty migration, spine parity, gateway, seat policy, panel, CSV #132, exact-integer helpers', () => {
  assert.equal(SCHEMA_VERSION, 152);
  const empty = createEmptyState(ISO);
  assert.deepEqual(empty.transferPriceActs, []);
  assert.deepEqual(empty.transferPriceMarkers, []);
  assert.equal(empty.settings.transferPriceAskDueDays, 7);
  assert.equal(empty.settings.transferPriceAutoPropagate, true);

  const { raw, applied } = migrate({ schemaVersion: 141, appId: 'leados', meta: {}, settings: {}, reportingLines: [{ id: 'l1', personId: 'a', managerId: 'b' }] });
  assert.deepEqual(applied, ['141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152']);
  assert.deepEqual(raw.transferPriceActs, [], 'no price is fabricated on upgrade');
  assert.deepEqual(raw.transferPriceMarkers, []);

  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(transferPriceRule);
  const seatIdx = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule');
  assert.ok(idx > 0 && idx < seatIdx, 'RULE-TPL-01 runs before the seat roll-up rule');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === transferPriceRule);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'transferPriceMarkers']);

  assert.ok(SAFE_READS.has('transferPriceReport'));
  for (const name of ['transferPricePropose', 'transferPriceConfirm', 'transferPriceRetire']) assert.equal(API_RIGHTS[name], 'agree-transfer-price');
  for (const name of ['transferPriceScan', 'transferPriceSetConventions']) assert.equal(API_RIGHTS[name], 'govern-transfer-prices');
  assert.deepEqual([ACTION_RIGHTS['agree-transfer-price'].minRank, ACTION_RIGHTS['agree-transfer-price'].maxRank], [1, 5]);
  assert.equal(ACTION_RIGHTS['govern-transfer-prices'].minRank, 3);
  assert.equal(RECORD_POLICIES.transferPriceActs.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.transferPriceMarkers.detailCeiling, 0);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'chargeback'));
  assert.equal(CSV_EXPORTS.length, 144);
  assert.equal(CSV_EXPORTS[131].key, 'line-chargeback');

  // Exact integers only: nothing rounds, and a refused figure never prints as 0.00.
  assert.equal(formatCents(-2208000), '-22080.00');
  assert.equal(formatCents(5), '0.05');
  assert.equal(formatCents(null), null);
  assert.equal(formatCents(1.5), null);
  assert.equal(transferPriceRate('600.00'), 600);
  assert.equal(transferPriceRate(0), 0, 'an explicit zero is a rate');
  assert.equal(transferPriceRate(650.5), null, 'a decimal is refused, never rounded');
  assert.equal(transferPriceRate(''), null, 'a blank is refused, never zero');
  assert.equal(transferPriceRate(-1), null);
  assert.equal(transferPriceRate(TRANSFER_PRICE_LIMITS.maxRateCents + 1), null);
});

test('fail-closed normalizer: a forged second key, a wrong-seat key, an orphan and a malformed act are dropped and counted; a departed manager id is kept', () => {
  const state = baseState();
  const terms = { currency: 'EUR', rateCents: 600, basis: 'standard-cost', ...Q3, voidFrom: null };
  const act = (id, kind, agreementId, side, extra = {}) => ({
    id, kind, agreementId, lenderId: 'fm', borrowerId: 'pm', side, via: 'operator', decidedBySeatId: null, decidedOn: '2026-11-11', at: ISO, note: '', ...terms, ...extra,
  });
  state.transferPriceActs = [
    act('a1', 'propose', 'g1', 'lender'),
    act('a2', 'confirm', 'g1', 'borrower', { rateCents: 1 }), // terms differ from the proposal → forged
    act('a3', 'confirm', 'g1', 'lender'), // same side as the proposal → one manager, one key
    act('a4', 'confirm', 'g1', 'borrower', { via: 'seat', decidedBySeatId: 'pm2' }), // signed from a third seat
    act('a5', 'confirm', 'g1', 'borrower'), // the real second key
    act('a6', 'confirm', 'g1', 'borrower'), // a second confirmation
    act('a7', 'confirm', 'gone', 'borrower'), // answers nothing on the record
    act('a8', 'propose', 'g2', 'lender', { rateCents: 600.5 }), // a decimal rate
    act('a9', 'propose', 'g3', 'lender', { effectiveTo: '2030-01-01' }), // term out of bounds
    act('a10', 'retire', 'g1', 'lender', { note: 'no' }), // a retirement with no reason
    { ...act('a11', 'propose', 'g4', 'borrower'), lenderId: 'ghost' }, // a manager not on today's roster is KEPT
    act('a12', 'propose', 'g5', 'lender', { lenderId: 'pm' }), // lender === borrower
    'nonsense',
  ];
  const { state: clean, warnings } = normalizeState({ ...state, schemaVersion: SCHEMA_VERSION });
  assert.deepEqual(clean.transferPriceActs.map((a) => a.id), ['a1', 'a5', 'a11']);
  assert.equal(clean.transferPriceActs[2].lenderId, 'ghost', 'a departed manager is kept as stored, not rewritten');
  assert.ok(warnings.some((w) => /dropped 5 malformed price act/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /dropped 4 act\(s\) that were not a valid key/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /dropped 1 act\(s\) answering a proposal that is not on the record/.test(w)), warnings.join(' | '));
  const compiled = compileTransferPrices(clean.transferPriceActs);
  assert.equal(compiled.get('g1').state, 'agreed');
  assert.equal(compiled.get('g4').state, 'proposed');
});

test('inert: a single-chain workspace gains no row and no refusal; a matrix workspace with no price act is REFUSED as unpriced and never nagged', () => {
  const single = harness(baseState({ lines: false }));
  const report = reportOf(single.api);
  assert.equal(report.verdict, 'inert');
  assert.equal(report.isMatrix, false);
  assert.deepEqual(report.rows, []);
  assert.deepEqual(report.pairs, []);
  assert.deepEqual(report.accounts, []);
  assert.equal(report.board.consumedShareDays, 0);
  assert.ok(report.inertNote.length > 0);
  assert.equal(single.api.transferPriceScan().ok, true);
  assert.deepEqual(tplTasks(single.store), []);
  assert.deepEqual(single.store.state.transferPriceMarkers, []);
  // A price with nothing to price is refused at the door.
  const refused = single.api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm', actingSide: 'lender', currency: 'EUR', ratePerPersonDay: 600, basis: 'negotiated', ...Q3 });
  assert.equal(refused.ok, false);
  assert.equal(refused.field, 'borrowerId');
  assert.deepEqual(single.store.state.transferPriceActs, []);

  const matrix = harness(baseState());
  const scan = matrix.api.transferPriceScan();
  assert.equal(scan.ok, true);
  assert.deepEqual(scan.effects, [], 'no price act exists, so RULE-TPL-01 exits before reading anything');
  assert.deepEqual(tplTasks(matrix.store), []);
  const unpriced = reportOf(matrix.api);
  assert.equal(unpriced.verdict, 'unpriced');
  assert.equal(unpriced.board.consumedShareDays, 5225);
  assert.equal(unpriced.board.pricedShareDays, 0);
  assert.equal(unpriced.board.refused['no-agreed-price'], 5225, 'refused, not charged at zero');
  assert.deepEqual(unpriced.board.currencies, [], 'no price, so no money figure at all');
  assert.equal(unpriced.board.statementComplete, false);
  assert.equal(unpriced.board.accountsNetWithheldN, 3);
});

test('hand-computed matrix statement: partition, integer cents, withheld nets, two currencies never pooled, span eliminations and the zero-sum identity', () => {
  const { store, api } = harness(baseState());
  api.transferPriceSetConventions({ autoPropagate: false });
  agree(api, { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' });
  const usd = api.transferPricePropose({ lenderId: 'pm', borrowerId: 'fm', actingSide: 'borrower', currency: 'USD', ratePerPersonDay: 300, basis: 'market-rate', ...Q3 });
  assert.equal(usd.ok, true, usd.error);

  /* ---- PARTLY PRICED ---- */
  let report = reportOf(api);
  let b = report.board;
  assert.equal(report.verdict, 'partly-priced');
  assert.equal(b.consumedShareDays, 5225);
  assert.equal(b.pricedShareDays, 2780 + 775, 'sam in full, hal for August only (31 × 25)');
  assert.equal(b.unpricedShareDays, 750 + 920);
  assert.deepEqual(b.refused, { 'no-agreed-price': 750, 'awaiting-second-key': 920, 'price-conflict': 0, 'lender-unrecorded': 0, 'lender-conflict': 0 });
  assert.equal(TRANSFER_PRICE_REFUSAL_STATES.reduce((s, k) => s + b.refused[k], 0), b.unpricedShareDays);
  assert.equal(b.pricedShareDays + b.unpricedShareDays + b.sameLineShareDays, b.consumedShareDays);
  assert.equal(b.shareDaysReconcile, true);
  assert.equal(b.periodLedgerIdentity, true);
  assert.deepEqual(b.pairs, { priced: 1, 'partly-priced': 1, unpriced: 1, unmeasured: 0 });
  assert.deepEqual(b.rows, { priced: 1, 'partly-priced': 1, unpriced: 1, unmeasured: 0 });
  assert.equal(TRANSFER_PRICE_ROW_STATES.reduce((s, k) => s + b.rows[k], 0), b.rowsN);
  // 2780 × 600 + 775 × 500 = 1,668,000 + 387,500
  assert.deepEqual(b.currencies.map((c) => [c.currency, c.chargedCents, c.creditedCents, c.charged, c.zeroSum]), [['EUR', 2055500, 2055500, '20555.00', true]]);
  assert.equal(b.zeroSum.holds, true);
  assert.equal(b.statementComplete, false);
  assert.match(b.incompleteReason, /1670 consumed share-day\(s\) carry no two-key price/);
  // Every line is touched by a refusal, so every NET is withheld — never a net over the priced part.
  assert.equal(b.accountsNetWithheldN, 3);
  const acct = (id) => report.accounts.find((a) => a.accountId === id);
  assert.equal(acct('fm').currencies[0].creditedCents, 2055500, 'what the agreed prices state is still printed');
  assert.equal(acct('fm').currencies[0].netCents, null);
  assert.equal(acct('fm').unpricedShareDays, 750 + 920);
  assert.match(acct('fm').netWithheldReason, /1670 share-day\(s\) naming this line carry no two-key price/);
  assert.equal(acct('pm').unpricedShareDays, 920);
  assert.equal(acct('pm2').unpricedShareDays, 750);

  // The retune is priced piece by piece through the period ledger's own timeline.
  const samRow = report.rows.find((r) => r.personId === 'sam');
  assert.deepEqual(samRow.pieces.map((p) => [p.fromDay, p.toDay, p.days, p.shareH, p.shareDays, p.cents]), [
    ['2026-07-01', '2026-08-14', 45, 20, 900, 540000],
    ['2026-08-15', '2026-09-30', 47, 40, 1880, 1128000],
  ]);
  assert.equal(samRow.pieces[0].arithmetic, '20% × 45 day(s) = 900 share-days × 600 = 540000 cents');
  const halRow = report.rows.find((r) => r.personId === 'hal');
  assert.deepEqual(halRow.pieces.map((p) => [p.fromDay, p.toDay, p.state, p.shareDays, p.cents]), [
    ['2026-08-01', '2026-08-31', 'priced', 775, 387500],
    ['2026-09-01', '2026-09-30', 'no-agreed-price', 750, null],
  ]);
  // Cross-ledger identity, checked against the period ledger itself.
  const allocation = buildLinePeriodAllocation(store.state, { now: NOW });
  const ledgerShareDays = allocation.persons.flatMap((p) => p.lines).filter((l) => l.state === 'computed').reduce((s, l) => s + l.shareDaysH, 0);
  assert.equal(ledgerShareDays, b.consumedShareDays);
  // No history is recorded, so every lender is today's home line, PRESUMED and labelled.
  assert.equal(b.presumedLenderShareDays, b.pricedShareDays);
  assert.equal(samRow.pieces[0].lenderBasis, 'presumed-current');
  // Agreed on 2026-11-11 for a quarter that ended in September: priced after the fact.
  assert.equal(b.retroactiveShareDays, b.pricedShareDays);
  assert.equal(b.bothKeysScribedN, 2, 'operator-scribed keys are counted, not passed off as two parties');

  /* ---- PRICED IN FULL ---- */
  assert.equal(api.transferPriceConfirm(usd.id).ok, true);
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30' });
  report = reportOf(api);
  b = report.board;
  assert.equal(report.verdict, 'priced');
  assert.equal(b.pricedShareDays, 5225);
  assert.equal(b.unpricedShareDays, 0);
  assert.equal(b.statementComplete, true);
  assert.equal(b.accountsNetWithheldN, 0);
  // EUR: 1,668,000 + 387,500 + 750 × 500 = 2,430,500. USD: 920 × 300 = 276,000. Never pooled.
  assert.deepEqual(b.currencies.map((c) => [c.currency, c.entriesN, c.chargedCents, c.creditedCents, c.netCents, c.zeroSum]), [
    ['EUR', 4, 2430500, 2430500, 0, true],
    ['USD', 1, 276000, 276000, 0, true],
  ]);
  const nets = Object.fromEntries(report.accounts.map((a) => [a.accountId, Object.fromEntries(a.currencies.map((c) => [c.currency, c.netCents]))]));
  assert.deepEqual(nets, { fm: { EUR: 2430500, USD: -276000 }, pm2: { EUR: -762500 }, pm: { EUR: -1668000, USD: 276000 } });
  for (const currency of ['EUR', 'USD']) {
    assert.equal(report.accounts.reduce((s, a) => s + (a.currencies.find((c) => c.currency === currency)?.netCents || 0), 0), 0, `${currency} nets to zero`);
  }
  assert.equal(acct.call(null, 'fm') && report.accounts.find((a) => a.accountId === 'fm').currencies[1].net, '-2760.00');

  // Spans along the home-line tree: charges inside a span are ELIMINATED.
  const span = (id) => Object.fromEntries(report.spans.find((s) => s.nodeId === id).currencies.map((c) => [c.currency, [c.eliminatedCents, c.inflowCents, c.outflowCents, c.netCents]]));
  assert.deepEqual(span('dirA'), { EUR: [762500, 1668000, 0, 1668000], USD: [0, 0, 276000, -276000] }, 'fm→pm2 cancels inside dirA; fm→pm is earned from outside');
  assert.deepEqual(span('dirB'), { EUR: [0, 0, 1668000, -1668000], USD: [0, 276000, 0, 276000] });
  assert.deepEqual(span('vp'), { EUR: [2430500, 0, 0, 0], USD: [276000, 0, 0, 0] });
  assert.deepEqual(span(LEADER_ID), { EUR: [2430500, 0, 0, 0], USD: [276000, 0, 0, 0] }, 'at the workspace root everything eliminates');
  assert.equal(report.spans.some((s) => s.nodeId === 'fm'), false, 'a span whose only account is its holder is that account, not a second row');

  // A named period is read as named; an unreadable one is REFUSED, never clamped.
  const august = reportOf(api, { from: '2026-08-01', to: '2026-08-31' });
  assert.equal(august.board.consumedShareDays, 14 * 20 + 17 * 40 + 31 * 25 + 31 * 10);
  assert.equal(august.board.currencies.find((c) => c.currency === 'EUR').chargedCents, (14 * 20 + 17 * 40) * 600 + 775 * 500);
  const bad = reportOf(api, { from: '2026-09-30', to: '2026-07-01' });
  assert.equal(bad.verdict, 'window-refused');
  assert.equal(bad.window.valid, false);
  assert.deepEqual(bad.board.currencies, []);
});

test('two keys, first person: a seat turns only its own key; refusals print their reason; decline, withdraw and void are appended acts', () => {
  const { store, api } = harness(baseState());
  api.transferPriceSetConventions({ autoPropagate: false });
  const terms = { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 };

  // The operator view must say whose key it scribes.
  assert.equal(api.transferPricePropose(terms).field, 'actingSide');

  // pm (the borrower) proposes from its own seat.
  sit(store, 'pm');
  assert.equal(api.transferPricePropose({ ...terms, actingSide: 'lender' }).field, 'actingSide', 'a manager cannot turn the counterpart’s key');
  const proposed = api.transferPricePropose(terms);
  assert.equal(proposed.ok, true, proposed.error);
  const stored = store.state.transferPriceActs[0];
  assert.deepEqual([stored.kind, stored.side, stored.via, stored.decidedBySeatId, stored.rateCents], ['propose', 'borrower', 'seat', 'pm', 600]);
  assert.equal(reportOf(api).board.pricedShareDays, 0, 'one key is not a price');
  assert.equal(reportOf(api).board.refused['awaiting-second-key'], 2780);
  // One manager signing twice is one key.
  const own = api.transferPriceConfirm(proposed.id);
  assert.equal(own.ok, false);
  assert.match(own.error, /second key is the other line/);

  // A third seat cannot sign for anybody.
  sit(store, 'pm2');
  const third = api.transferPriceConfirm(proposed.id);
  assert.equal(third.ok, false);
  assert.match(third.error, /Only Fay Functional can turn the missing key/);
  assert.equal(api.transferPricePropose(terms).ok, false, 'pm2 is not a party to fm → pm');
  assert.equal(store.state.transferPriceActs.length, 1);

  // fm (the lender) turns the second key from its own seat.
  sit(store, 'fm');
  const confirmed = api.transferPriceConfirm(proposed.id);
  assert.equal(confirmed.ok, true, confirmed.error);
  assert.equal(confirmed.retroactive, true);
  assert.deepEqual([store.state.transferPriceActs[1].kind, store.state.transferPriceActs[1].side, store.state.transferPriceActs[1].decidedBySeatId], ['confirm', 'lender', 'fm']);
  assert.equal(api.transferPriceConfirm(proposed.id).ok, false, 'a second confirmation records nothing');
  sit(store, null);
  let report = reportOf(api);
  assert.equal(report.board.pricedShareDays, 2780);
  assert.equal(report.board.bothKeysScribedN, 0, 'two seats signed; nothing was scribed');
  assert.equal(report.agreements[0].state, 'agreed');

  // Refusals, each with its field and nothing written.
  const before = store.state.transferPriceActs.length;
  const op = (patch) => api.transferPricePropose({ ...terms, borrowerId: 'pm2', actingSide: 'lender', ...patch });
  assert.equal(op({ ratePerPersonDay: 650.5 }).field, 'ratePerPersonDay');
  assert.match(op({ ratePerPersonDay: 650.5 }).error, /nothing was rounded/);
  assert.equal(op({ ratePerPersonDay: '' }).field, 'ratePerPersonDay');
  assert.equal(op({ currency: 'euro' }).field, 'currency');
  assert.equal(op({ basis: 'guess' }).field, 'basis');
  assert.equal(op({ effectiveTo: '' }).field, 'effectiveTo');
  assert.equal(op({ effectiveFrom: '2026-02-31' }).field, 'effectiveFrom');
  assert.equal(op({ effectiveTo: '2026-06-30' }).field, 'effectiveTo');
  assert.equal(op({ effectiveTo: '2029-01-01' }).field, 'effectiveTo');
  assert.equal(op({ borrowerId: 'fm' }).field, 'borrowerId', 'a line does not charge itself');
  assert.equal(op({ borrowerId: 'ghost' }).field, 'borrowerId');
  const reversed = api.transferPricePropose({ ...terms, lenderId: 'pm2', borrowerId: 'fm', actingSide: 'lender' });
  assert.equal(reversed.field, 'borrowerId');
  assert.match(reversed.error, /run the other way/);
  const overlap = api.transferPricePropose({ ...terms, actingSide: 'lender', effectiveFrom: '2026-09-01', effectiveTo: '2026-10-31' });
  assert.equal(overlap.field, 'effectiveFrom');
  assert.match(overlap.error, /already covers 2026-07-01 to 2026-09-30/);
  assert.equal(store.state.transferPriceActs.length, before, 'a refused price writes nothing');

  // Decline (the counterpart) and withdraw (the proposer) are different facts.
  const q4 = { effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31' };
  const p2 = api.transferPricePropose({ ...terms, ...q4, actingSide: 'lender' });
  assert.equal(api.transferPriceRetire(p2.id, { reason: 'short', actingSide: 'borrower' }).field, 'reason');
  assert.equal(api.transferPriceRetire(p2.id, { reason: 'The rate does not cover our standard cost.' }).field, 'actingSide');
  const declined = api.transferPriceRetire(p2.id, { reason: 'The rate does not cover our standard cost.', actingSide: 'borrower' });
  assert.equal(declined.state, 'declined');
  assert.equal(api.transferPriceConfirm(p2.id).ok, false, 'a declined proposal cannot be confirmed');
  const p3 = api.transferPricePropose({ ...terms, ...q4, actingSide: 'lender' });
  assert.equal(p3.ok, true, 'a dead proposal no longer claims its days');
  assert.equal(api.transferPriceRetire(p3.id, { reason: 'Sent with the wrong currency.', actingSide: 'lender' }).state, 'withdrawn');

  // Void an agreed price from a PAST day: appended, flagged, and the days it uncovers are refused.
  assert.equal(api.transferPriceRetire(proposed.id, { reason: 'Disputed from September onward.', actingSide: 'lender' }).field, 'voidFrom', 'a closed term is not restated by default');
  assert.equal(api.transferPriceRetire(proposed.id, { reason: 'Disputed from September onward.', actingSide: 'lender', voidFrom: '2026-10-05' }).field, 'voidFrom');
  const voided = api.transferPriceRetire(proposed.id, { reason: 'Disputed from September onward.', actingSide: 'lender', voidFrom: '2026-09-01' });
  assert.equal(voided.ok, true, voided.error);
  assert.deepEqual([voided.state, voided.voidFrom, voided.restatesPast], ['voided', '2026-09-01', true]);
  assert.equal(api.transferPriceRetire(proposed.id, { reason: 'Voiding it a second time.', actingSide: 'lender' }).ok, false);
  report = reportOf(api);
  // July + August stay priced: 45 × 20 + 17 × 40 = 1580; September's 30 × 40 = 1200 is refused.
  assert.equal(report.board.pricedShareDays, 1580);
  assert.equal(report.board.refused['no-agreed-price'], 1200 + 1525 + 920);
  assert.deepEqual(report.board.agreements, { proposed: 0, agreed: 0, declined: 1, withdrawn: 1, voided: 1 });
  assert.equal(TRANSFER_PRICE_AGREEMENT_STATES.reduce((s, k) => s + report.board.agreements[k], 0), report.board.agreementsN);
  assert.equal(store.state.transferPriceActs.every((a) => ['propose', 'confirm', 'retire'].includes(a.kind)), true);
  assert.equal(store.state.transferPriceActs.length, 7, 'every change is an appended act; nothing was edited');

  // Conventions are refused out of bounds, never clamped.
  assert.equal(api.transferPriceSetConventions({ askDueDays: 0 }).field, 'askDueDays');
  assert.equal(api.transferPriceSetConventions({ askDueDays: 12 }).ok, true);
  assert.equal(store.state.settings.transferPriceAskDueDays, 12);
});

test('RULE-TPL-01 end to end: asks the named key holder and the borrower of an unpriced pair, rolls up the matrix DAG, is idempotent, bounded, pausable and self-closing', () => {
  const { store, api } = harness(baseState());
  const eur = { currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 };

  // The FIRST price act opts the workspace in.
  const p1 = api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm', actingSide: 'lender', ...eur });
  assert.equal(p1.ok, true, p1.error);
  let open = activeTasks(store);
  assert.deepEqual(open.map((t) => t.personId).sort(), ['fm', 'pm', 'pm2'], 'pm holds the missing key; pm2 and fm each borrowed with no price');
  const keyTask = open.find((t) => t.personId === 'pm');
  assert.match(keyTask.title, /Answer the transfer price Fay Functional proposed \(600 EUR per person-day\)/);
  assert.match(keyTask.expectedOutcome, /You hold the borrower key/);
  assert.equal(keyTask.dueOn, '2026-11-18');
  assert.match(open.find((t) => t.personId === 'pm2').expectedOutcome, /1525 share-day\(s\) your line consumed/);
  assert.match(open.find((t) => t.personId === 'fm').expectedOutcome, /920 share-day\(s\) your line consumed/);
  const edges = store.state.links.filter((l) => l.ruleId === TRANSFER_PRICE_RULE_ID);
  assert.ok(edges.some((l) => l.sourceType === 'person' && l.sourceId === 'fm' && l.targetId === keyTask.id && l.relation === 'issues-obligation'));
  assert.deepEqual(edges.filter((l) => l.relation === 'rolls-up-to' && l.sourceId === keyTask.id).map((l) => l.targetId).sort(), ['dirB', 'vp'], 'rolls up to every roster ancestor of the asked manager');
  // fm also answers to pm through pat's line? No — fm HOLDS a line on pat; fm's own ancestors are dirA and vp.
  const fmTask = open.find((t) => t.personId === 'fm');
  assert.deepEqual(edges.filter((l) => l.relation === 'rolls-up-to' && l.sourceId === fmTask.id).map((l) => l.targetId).sort(), ['dirA', 'vp']);
  assert.equal(reportOf(api).board.openAsksN, 3);
  assert.ok(store.state.events.some((e) => e.type === 'transfer.price.proposed'));

  // Idempotent: a rescan issues nothing new.
  assert.equal(api.transferPriceScan().ok, true);
  assert.equal(tplTasks(store).length, 3);
  assert.equal(store.state.transferPriceMarkers.filter((m) => m.kind === 'ask').length, 3);

  // The key is turned: its ask closes itself. No key was turned by the rule.
  assert.equal(api.transferPriceConfirm(p1.id).ok, true);
  assert.equal(tplTasks(store).find((t) => t.id === keyTask.id).status, 'done');
  assert.match(tplTasks(store).find((t) => t.id === keyTask.id).completionNote, /RULE-TPL-01/);
  assert.equal(store.state.transferPriceActs.length, 2, 'the rule never wrote a price act');

  // A proposal covering pm2's quarter closes its `price` ask and opens the counterpart's key ask.
  const p2 = api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm2', actingSide: 'borrower', ...eur, ratePerPersonDay: 500 });
  assert.equal(p2.ok, true, p2.error);
  open = activeTasks(store);
  assert.equal(open.some((t) => t.personId === 'pm2'), false, 'pm2 proposed; the price ask is no longer owed');
  assert.equal(open.filter((t) => t.personId === 'fm').length, 2, 'fm now owes the lender key AND still owes a price for pat');
  // Declined: the pair is unpriced again and is owed ONE fresh ask (a new generation), not a silent gap.
  assert.equal(api.transferPriceRetire(p2.id, { reason: 'Standard cost is higher than this.', actingSide: 'lender' }).state, 'declined');
  open = activeTasks(store);
  assert.equal(open.filter((t) => t.personId === 'pm2').length, 1);
  assert.equal(open.filter((t) => t.personId === 'fm').length, 1, 'the key ask for the declined proposal closed');
  assert.equal(api.transferPriceScan().ok, true);
  assert.equal(activeTasks(store).filter((t) => t.personId === 'pm2').length, 1, 'still one');

  // Paused: commits issue nothing; an explicit scan still runs.
  assert.equal(api.transferPriceSetConventions({ autoPropagate: false }).ok, true);
  const before = tplTasks(store).length;
  const ids = [];
  for (let day = 1; day <= TRANSFER_PRICE_LIMITS.asksPerCommit + 2; day += 1) {
    const d = `2027-01-${String(day).padStart(2, '0')}`;
    const p = api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm', actingSide: 'lender', ...eur, effectiveFrom: d, effectiveTo: d });
    assert.equal(p.ok, true, p.error);
    ids.push(p.id);
  }
  assert.equal(tplTasks(store).length, before, 'paused automation issued nothing');
  // Bounded per commit; the remainder is COUNTED and issued by the next scan.
  const scan = api.transferPriceScan();
  assert.equal(tplTasks(store).length, before + TRANSFER_PRICE_LIMITS.asksPerCommit);
  assert.ok(scan.effects.some((e) => e.action === 'deferred' && /Deferred 2 /.test(e.summary)), JSON.stringify(scan.effects));
  assert.equal(api.transferPriceScan().ok, true);
  assert.equal(tplTasks(store).length, before + TRANSFER_PRICE_LIMITS.asksPerCommit + 2);

  // A key held by the workspace leader is OBSERVED, never reassigned.
  const seed = baseState();
  seed.people.push(person('ivy', 'Ivy Direct', 'ic', null));
  seed.reportingLines.push(line('ln-ivy', 'ivy', 'fm', 'administrative', 5, '2026-01-01'));
  const lead = harness(seed);
  const lp = lead.api.transferPricePropose({ lenderId: LEADER_ID, borrowerId: 'fm', actingSide: 'borrower', ...eur });
  assert.equal(lp.ok, true, lp.error);
  assert.ok(lead.store.state.transferPriceMarkers.some((m) => m.kind === 'observation' && m.state === 'leader-key'));
  assert.equal(activeTasks(lead.store).some((t) => /Answer the transfer price/.test(t.title)), false, 'nobody else was asked for the leader’s key');
  assert.equal(lead.api.transferPriceConfirm(lp.id).ok, true, 'the leader’s key is turned in the operator view');
  assert.equal(reportOf(lead.api).accounts.find((a) => a.accountId === LEADER_ID).currencies[0].creditedCents, 92 * 5 * 600);
});

test('the lender is the RECORDED home line of each day: a mid-period move splits the credit, an uncovered day is refused, and one unknown lender withholds every net', () => {
  const read = (structureHistory, acts) => {
    const s = baseState();
    s.reportingLines = [s.reportingLines[0]]; // sam on pm's line only
    s.structureHistory = structureHistory;
    s.transferPriceActs = acts;
    return buildTransferPriceLedger(normalizeState({ ...s, schemaVersion: SCHEMA_VERSION }).state, { now: NOW });
  };
  const rec = (id, managerId, fromISO, toISO) => ({ id, personId: 'sam', managerId, fromISO, toISO, recordedOn: fromISO, source: 'moved', reason: 'recorded', at: `${fromISO}T08:00:00.000Z` });
  const fmPm = agreedActs('g1', 'fm', 'pm', EUR600);

  // Sam's home line was pm2 until 31 July and fm from 1 August. July is pm2's to be credited.
  const moved = read([rec('s1', 'pm2', '2026-01-01', '2026-07-31'), rec('s2', 'fm', '2026-08-01', null)], fmPm);
  assert.deepEqual(moved.rows[0].pieces.map((p) => [p.fromDay, p.toDay, p.lenderId, p.lenderBasis, p.state, p.shareDays]), [
    ['2026-07-01', '2026-07-31', 'pm2', 'observed', 'no-agreed-price', 620],
    ['2026-08-01', '2026-08-14', 'fm', 'observed', 'priced', 280],
    ['2026-08-15', '2026-09-30', 'fm', 'observed', 'priced', 1880],
  ]);
  assert.equal(moved.board.pricedShareDays, 2160);
  assert.equal(moved.board.presumedLenderShareDays, 0, 'a recorded lender is a fact, not a presumption');
  assert.equal(moved.board.currencies[0].chargedCents, 2160 * 600);
  assert.deepEqual(moved.pairs.map((p) => [p.lenderId, p.borrowerId, p.state]).sort(), [['fm', 'pm', 'priced'], ['pm2', 'pm', 'unpriced']]);
  // fm is priced in full and no lender is unknown, so fm's net prints; pm's does not.
  assert.equal(moved.accounts.find((a) => a.accountId === 'fm').currencies[0].netCents, 2160 * 600);
  assert.equal(moved.accounts.find((a) => a.accountId === 'pm').currencies[0].netCents, null);

  // History exists and does not cover July: there is NO lender. Today's manager is not projected back.
  const gap = read([rec('s2', 'fm', '2026-08-01', null)], fmPm);
  assert.equal(gap.board.refused['lender-unrecorded'], 620);
  assert.equal(gap.rows[0].pieces[0].lenderName, 'Not recorded');
  assert.equal(gap.board.lenderUnknownAnywhere, true);
  assert.equal(gap.board.accountsNetWithheldN, gap.board.accountsN, 'the unknown lender could be any line, so no net is claimed');
  assert.match(gap.accounts.find((a) => a.accountId === 'fm').netWithheldReason, /could be this one/);
  assert.equal(gap.board.zeroSum.holds, true, 'the priced part still balances — and is not passed off as the whole');
  assert.equal(gap.board.statementComplete, false);

  // Two recorded periods cover the same days: neither manager is picked.
  const conflict = read([rec('s1', 'pm2', '2026-01-01', null), rec('s2', 'fm', '2026-08-01', null)], fmPm);
  assert.equal(conflict.board.refused['lender-conflict'], 280 + 1880);

  // The recorded home line WAS the borrower in July: a line does not charge itself, and that is not a refusal.
  const same = read([rec('s1', 'pm', '2026-01-01', '2026-07-31'), rec('s2', 'fm', '2026-08-01', null)], fmPm);
  assert.equal(same.board.sameLineShareDays, 620);
  assert.equal(same.board.unpricedShareDays, 0);
  assert.equal(same.board.shareDaysReconcile, true);
  assert.equal(same.verdict, 'priced');
  assert.equal(same.board.statementComplete, true);

  // An explicitly agreed zero is a price, counted apart; two agreed prices for one day collide and neither is picked.
  const zero = read([], agreedActs('g0', 'fm', 'pm', { ...EUR600, rateCents: 0 }));
  assert.equal(zero.board.zeroPricedShareDays, 2780);
  assert.equal(zero.board.currencies[0].chargedCents, 0);
  assert.equal(zero.board.statementComplete, true);
  const collide = read([], [...fmPm, ...agreedActs('g2', 'fm', 'pm', { ...EUR600, rateCents: 700, effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30' })]);
  assert.equal(collide.board.refused['price-conflict'], 30 * 40);
  assert.equal(collide.board.pricedShareDays, 2780 - 1200);
});

test('seat scope: a party reads its own lines and its counterparty; a director reads its span with eliminations; everything else is counted, not shown', () => {
  const { store, api } = harness(baseState());
  api.transferPriceSetConventions({ autoPropagate: false });
  agree(api, { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', ...Q3 });
  agree(api, { lenderId: 'pm', borrowerId: 'fm', currency: 'USD', ratePerPersonDay: 300, basis: 'market-rate', ...Q3 });
  const operator = reportOf(api);
  assert.equal(operator.board.rowsN, 3);
  assert.equal(operator.board.statementComplete, true);

  const asSeat = (seatId) => {
    const snapshot = JSON.parse(JSON.stringify(store.state));
    snapshot.settings.activeSeatId = seatId;
    return buildTransferPriceLedger(snapshot, { now: NOW });
  };

  // pm borrows sam from fm and lends pat to fm. It never sees fm → pm2.
  const pm = asSeat('pm');
  assert.equal(pm.seat.fullAccess, false);
  assert.deepEqual(pm.accounts.map((a) => a.accountId), ['pm']);
  assert.deepEqual(pm.accounts[0].currencies.map((c) => [c.currency, c.chargedCents, c.creditedCents, c.netCents]), [['EUR', 1668000, 0, -1668000], ['USD', 0, 276000, 276000]]);
  assert.equal(pm.board.rowsN, 2);
  assert.equal(pm.board.rowsWithheldN, 1, 'hal on pm2’s line is counted, not shown');
  assert.equal(pm.board.accountsWithheldN, 2);
  assert.equal(pm.board.agreementsWithheldN, 1);
  assert.equal(pm.board.consumedShareDays, 2780 + 920);
  assert.deepEqual(pm.pairs.map((p) => [p.lenderName, p.borrowerName, p.mySide]).sort(), [['Fay Functional', 'Priya Project', 'borrower'], ['Priya Project', 'Fay Functional', 'lender']], 'a party reads its own counterparty by name');
  assert.deepEqual(pm.board.currencies.map((c) => [c.currency, c.netCents, c.zeroSum]), [['EUR', -1668000, null], ['USD', 276000, null]], 'one side of two-sided entries is a position, not a zero-sum claim');
  assert.equal(pm.board.zeroSum.holds, true, 'the WORKSPACE identity is still reported');
  assert.equal(pm.actor.canAgree, true);
  assert.equal(pm.actor.canScan, false, 'a manager-rank seat cannot scan');
  assert.doesNotMatch(JSON.stringify(pm), /Paul Product|Hal Half/);

  // dirA spans fm and pm2. pm sits outside: its name is withheld, its trade with the span is not.
  const dirA = asSeat('dirA');
  assert.deepEqual(dirA.accounts.map((a) => a.accountId), ['fm', 'pm2']);
  assert.equal(dirA.board.rowsN, 3, 'every row names a line dirA reads');
  assert.equal(dirA.rows.find((r) => r.personWithheld).personName, 'A person outside this seat');
  assert.ok(dirA.pairs.some((p) => p.borrowerName === 'A line outside this seat' && p.borrowerId === null));
  assert.doesNotMatch(JSON.stringify(dirA), /Priya Project|Pat Project/);
  const ownSpan = dirA.spans.find((s) => s.nodeId === 'dirA');
  // fm → pm2: 1525 × 500 = 762,500 eliminated inside; fm → pm: 1,668,000 earned from outside.
  assert.deepEqual(ownSpan.currencies.map((c) => [c.currency, c.eliminatedCents, c.inflowCents, c.outflowCents, c.netCents]), [['EUR', 762500, 1668000, 0, 1668000], ['USD', 0, 0, 276000, -276000]]);
  assert.equal(dirA.spans.some((s) => s.isRoot || s.nodeId === 'vp' || s.nodeId === 'dirB'), false, 'spans above or beside the seat are not printed');
  assert.equal(dirA.actor.canScan, true);

  // A manager with no line in any pair reads nothing at all.
  const quiet = baseState();
  quiet.people.push(person('om', 'Omar Other', 'manager', 'vp'), person('oz', 'Oz Other', 'ic', 'om'));
  quiet.transferPriceActs = agreedActs('g1', 'fm', 'pm', EUR600);
  quiet.settings.activeSeatId = 'om';
  const om = buildTransferPriceLedger(normalizeState({ ...quiet, schemaVersion: SCHEMA_VERSION }).state, { now: NOW });
  assert.equal(om.verdict, 'inert');
  assert.deepEqual([om.rows, om.pairs, om.accounts, om.agreements, om.spans], [[], [], [], [], []]);
  assert.equal(om.board.rowsWithheldN, 3);
  assert.doesNotMatch(JSON.stringify(om), /Fay|Priya|Sam Shared|EUR/);

  // A manager who also answers to a manager OUTSIDE the span on a declared line is counted on the span row.
  const shared = baseState();
  shared.reportingLines.push(line('ln-pm2', 'pm2', 'dirB', 'project', 50, '2026-01-01'));
  shared.transferPriceActs = [...agreedActs('g1', 'fm', 'pm2', { ...EUR600, effectiveFrom: '2026-08-01' })];
  const sharedReport = buildTransferPriceLedger(normalizeState({ ...shared, schemaVersion: SCHEMA_VERSION }).state, { now: NOW });
  assert.equal(sharedReport.spans.find((s) => s.nodeId === 'dirA').matrixSharedAccountsN, 1, 'pm2’s account consolidates under dirA by the home-line convention, and the row says so');
});

test('display == stored: panel, brief and CSV print the computed board, reads mutate nothing, and a real reload reproduces it', () => {
  const { store, api, storage } = harness(baseState());
  agree(api, { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' });
  const pending = api.transferPricePropose({ lenderId: 'pm', borrowerId: 'fm', actingSide: 'borrower', currency: 'USD', ratePerPersonDay: 300, basis: 'market-rate', ...Q3 });
  assert.equal(pending.ok, true, pending.error);

  const revision = store.state.meta?.revision;
  const frozen = JSON.stringify(store.state);
  const report = reportOf(api);
  const csv = exportWorkspaceCsv(store.state, 'line-chargeback', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.equal(JSON.stringify(store.state), frozen, 'reading and exporting mutate nothing');
  assert.equal(store.state.meta?.revision, revision);

  // CSV cells are exactly the board's figures.
  const lines = csv.csv.trim().split(/\r?\n/);
  assert.deepEqual(lines[0].replace(/^\uFEFF/, '').split(','), [...TRANSFER_PRICE_CSV_COLUMNS]);
  const expected = transferPriceCsvRows(report);
  assert.equal(lines.length - 1, expected.length);
  assert.deepEqual(expected.map((r) => r.row_type), ['summary', 'currency']);
  lines.slice(1).forEach((text, i) => {
    const cells = text.split(',');
    assert.equal(cells.length, TRANSFER_PRICE_CSV_COLUMNS.length);
    TRANSFER_PRICE_CSV_COLUMNS.forEach((key, k) => assert.equal(cells[k], String(expected[i][key]), `${expected[i].row_type}.${key}`));
  });
  const cell = (rowIndex, key) => lines[rowIndex + 1].split(',')[TRANSFER_PRICE_CSV_COLUMNS.indexOf(key)];
  assert.equal(cell(0, 'consumed_share_days'), '5225');
  assert.equal(cell(0, 'priced_share_days'), '3555');
  assert.equal(cell(0, 'refused_no_agreed_price'), '750');
  assert.equal(cell(0, 'refused_awaiting_second_key'), '920');
  assert.equal(cell(0, 'share_days_reconcile'), 'yes');
  assert.equal(cell(0, 'period_ledger_identity'), 'yes');
  assert.equal(cell(0, 'zero_sum'), 'yes');
  assert.equal(cell(0, 'statement_complete'), 'no');
  assert.equal(cell(0, 'accounts_net_withheld'), '3');
  assert.equal(cell(1, 'currency'), 'EUR');
  assert.equal(cell(1, 'charged_cents'), '2055500');
  assert.equal(cell(1, 'charged'), '20555.00');
  assert.doesNotMatch(csv.csv, /Fay|Priya|Paul|Sam Shared|Hal Half|ln-sam|tpg-/, 'the export is identity-free');

  // The rendered panel prints the same integers.
  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=chargeback'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const root = node.querySelector('[data-testid="matrix-chargeback-panel"]');
    assert.ok(root, 'the chargeback panel rendered inside #/matrix');
    const text = (id) => root.querySelector(`[data-testid="${id}"]`).textContent;
    assert.equal(text('tpl-consumed'), String(report.board.consumedShareDays));
    assert.equal(text('tpl-priced'), String(report.board.pricedShareDays));
    assert.equal(text('tpl-unpriced'), String(report.board.unpricedShareDays));
    for (const key of TRANSFER_PRICE_REFUSAL_STATES) assert.equal(text(`tpl-refused-${key}`), String(report.board.refused[key]), key);
    for (const c of report.board.currencies) {
      assert.equal(text(`tpl-cur-${c.currency}-charged`), c.charged);
      assert.equal(text(`tpl-cur-${c.currency}-credited`), c.credited);
      assert.equal(text(`tpl-cur-${c.currency}-net`), c.net);
    }
    assert.equal(text('tpl-cur-EUR-charged'), '20555.00');
    for (const a of report.accounts) {
      for (const c of a.currencies) assert.equal(text(`tpl-acct-${a.accountId}-${c.currency}-net`), c.net === null ? 'withheld' : c.net);
    }
    assert.equal(text('tpl-acct-fm-EUR-net'), 'withheld', 'a withheld net prints the word, never a zero');
    assert.equal(text('tpl-nets-withheld'), `${report.board.accountsNetWithheldN} / ${report.board.accountsN}`);
    assert.equal(text('tpl-brief'), transferPriceBriefText(report));
    assert.ok(root.querySelector(`[data-testid="tpl-confirm-${pending.id}"]`), 'the operator may scribe the missing key');
    assert.equal(node.querySelectorAll('h1').length <= 1, true);
  });

  // Real reload from what was actually persisted.
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  const again = harness(persisted);
  assert.deepEqual(again.store.state.transferPriceActs, store.state.transferPriceActs);
  assert.deepEqual(again.store.state.transferPriceMarkers, store.state.transferPriceMarkers);
  assert.equal(JSON.stringify(again.store.state.transferPriceActs), JSON.stringify(store.state.transferPriceActs), 'the action writes exactly the normalized shape');
  const reloaded = reportOf(again.api);
  assert.deepEqual(reloaded.board, report.board);
  assert.deepEqual(reloaded.accounts, report.accounts);
  assert.deepEqual(reloaded.pairs, report.pairs);
  assert.deepEqual(reloaded.rows, report.rows);
  assert.deepEqual(reloaded.agreements, report.agreements);
  const links = (s) => s.links.filter((l) => l.ruleId === TRANSFER_PRICE_RULE_ID).length;
  assert.equal(links(again.store.state), links(store.state), 'typed provenance survived normalisation');
  assert.ok(links(store.state) > 0);
});

test('the panel is operable end to end: a manager proposes from its own seat, the counterpart confirms, the operator voids — through the rendered controls — and every seat and refusal renders', () => {
  const { store, api } = harness(baseState());
  api.transferPriceSetConventions({ autoPropagate: false });
  const toasts = [];
  const render = (query = 'panel=chargeback') => renderMatrix({
    state: store.state, api, query: new URLSearchParams(query),
    now: NOW, navigate() {}, refresh() {}, toast(message, tone) { toasts.push([tone, message]); },
  });
  const panelOf = (node) => node.querySelector('[data-testid="matrix-chargeback-panel"]');

  withDom((dom) => {
    const doc = dom.window.document;
    const modal = (selector) => doc.querySelector(`#modal-root ${selector}`);
    const set = (name, value) => { const el = modal(`[name="${name}"]`); assert.ok(el, `form field ${name}`); el.value = value; };

    /* pm, the borrower, proposes from its own seat through the pair row. */
    sit(store, 'pm');
    let root = panelOf(render());
    assert.ok(root, 'a manager seat reads its own chargeback panel');
    assert.equal(root.querySelector('[data-testid="tpl-propose-btn"]'), null, 'the free-form proposal is an operator control');
    assert.equal(root.querySelector('[data-testid="tpl-scan-btn"]'), null, 'a manager-rank seat cannot scan');
    assert.doesNotMatch(root.textContent, /Paul Product|Hal Half/, 'nothing outside the seat is printed');
    root.querySelector('[data-testid="tpl-propose-fm-pm"]').click();
    assert.equal(modal('[name="actingSide"]'), null, 'a seat signs its own side; it is not asked whose key it holds');
    assert.equal(modal('[name="effectiveFrom"]').value, '2026-07-01', 'the term defaults to the period on screen');
    assert.equal(modal('[name="effectiveTo"]').value, '2026-09-30');
    // A refused form writes nothing and prints the reason on the field.
    set('currency', 'EUR'); set('basis', 'standard-cost'); set('ratePerPersonDay', '');
    modal('[data-testid="tpl-propose-save"]').click();
    assert.deepEqual(store.state.transferPriceActs, []);
    assert.equal(toasts.at(-1)[0], 'bad');
    assert.match(modal('form').textContent, /whole number/i);
    set('ratePerPersonDay', '600');
    modal('[data-testid="tpl-propose-save"]').click();
    assert.equal(toasts.at(-1)[0], 'good', toasts.at(-1)[1]);
    assert.equal(modal('[role="dialog"]'), null, 'the dialog closed');
    assert.equal(store.state.transferPriceActs.length, 1);
    const proposal = store.state.transferPriceActs[0];
    assert.deepEqual(
      [proposal.kind, proposal.side, proposal.via, proposal.decidedBySeatId, proposal.lenderId, proposal.borrowerId, proposal.currency, proposal.rateCents, proposal.basis, proposal.effectiveFrom, proposal.effectiveTo],
      ['propose', 'borrower', 'seat', 'pm', 'fm', 'pm', 'EUR', 600, 'standard-cost', '2026-07-01', '2026-09-30'],
    );
    // pm sees its own proposal, cannot confirm it, can withdraw it.
    root = panelOf(render());
    assert.equal(root.querySelector(`[data-testid="tpl-confirm-${proposal.agreementId}"]`), null, 'the proposer cannot turn the second key');
    assert.ok(root.querySelector(`[data-testid="tpl-retire-${proposal.agreementId}"]`));
    assert.equal(root.querySelector('[data-testid="tpl-priced"]').textContent, '0', 'one key prices nothing');

    /* A third seat sees neither the pair nor the proposal. */
    sit(store, 'pm2');
    root = panelOf(render());
    assert.equal(root.querySelector(`[data-testid="tpl-confirm-${proposal.agreementId}"]`), null);
    assert.doesNotMatch(root.textContent, /Priya Project|600 EUR/);

    /* fm, the lender, turns the second key. */
    sit(store, 'fm');
    root = panelOf(render());
    root.querySelector(`[data-testid="tpl-confirm-${proposal.agreementId}"]`).click();
    assert.match(modal('[role="dialog"]').textContent, /You hold the lender key/);
    assert.match(modal('[role="dialog"]').textContent, /600 EUR/);
    modal('[data-testid="tpl-confirm-save"]').click();
    assert.equal(toasts.at(-1)[0], 'good', toasts.at(-1)[1]);
    assert.deepEqual(store.state.transferPriceActs.map((a) => [a.kind, a.side, a.decidedBySeatId]), [['propose', 'borrower', 'pm'], ['confirm', 'lender', 'fm']]);
    root = panelOf(render());
    // fm reads sam→pm priced (2780) and hal→pm2 + pat→fm refused (1525 + 920).
    assert.equal(root.querySelector('[data-testid="tpl-priced"]').textContent, '2780');
    assert.equal(root.querySelector('[data-testid="tpl-unpriced"]').textContent, '2445');
    assert.equal(root.querySelector('[data-testid="tpl-acct-fm-EUR-net"]').textContent, 'withheld');

    /* The director above both reads the span and may scan; it holds no key. */
    sit(store, 'dirA');
    root = panelOf(render());
    assert.ok(root.querySelector('[data-testid="tpl-scan-btn"]'));
    assert.equal(root.querySelector(`[data-testid="tpl-retire-${proposal.agreementId}"]`), null, 'a director above a party holds neither key');
    assert.equal(root.querySelector('[data-testid="tpl-span-dirA-EUR-net"]').textContent, 'withheld', 'a span touched by a refusal claims no net');
    assert.doesNotMatch(root.textContent, /Priya Project/);

    /* The operator voids it from 1 September through the rendered control. */
    sit(store, null);
    root = panelOf(render());
    assert.ok(root.querySelector('[data-testid="tpl-propose-btn"]'));
    root.querySelector(`[data-testid="tpl-retire-${proposal.agreementId}"]`).click();
    set('actingSide', 'lender'); set('voidFrom', '2026-09-01'); set('reason', 'Disputed from September onward.');
    modal('[data-testid="tpl-retire-save"]').click();
    assert.equal(toasts.at(-1)[0], 'good', toasts.at(-1)[1]);
    const retire = store.state.transferPriceActs[2];
    assert.deepEqual([retire.kind, retire.side, retire.via, retire.voidFrom, retire.note], ['retire', 'lender', 'operator', '2026-09-01', 'Disputed from September onward.']);
    root = panelOf(render());
    assert.equal(root.querySelector('[data-testid="tpl-priced"]').textContent, '1580', '45 × 20 + 17 × 40 stay priced; September is refused again');
    assert.equal(root.querySelector('[data-testid="tpl-cur-EUR-charged"]').textContent, '9480.00');
    assert.match(root.textContent, /voided from 2026-09-01/);

    /* A named period, a refused period and the operator's free-form proposal dialog all render. */
    root = panelOf(render('panel=chargeback&from=2026-08-01&to=2026-08-31'));
    assert.equal(root.querySelector('[data-testid="tpl-consumed"]').textContent, String(14 * 20 + 17 * 40 + 31 * 25 + 31 * 10));
    root = panelOf(render('panel=chargeback&from=2026-09-30&to=2026-07-01'));
    assert.match(root.textContent, /The period itself is refused/);
    assert.equal(root.querySelector('[data-testid="tpl-consumed"]'), null, 'a refused period prints no figure');
    root = panelOf(render());
    root.querySelector('[data-testid="tpl-propose-btn"]').click();
    assert.ok(modal('[name="lenderId"]') && modal('[name="borrowerId"]') && modal('[name="actingSide"]'));
  });

  /* Single-chain: the panel renders its inert note and no figure. */
  const single = harness(baseState({ lines: false }));
  withDom(() => {
    const node = renderMatrix({
      state: single.store.state, api: single.api, query: new URLSearchParams('panel=chargeback'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const root = panelOf(node);
    assert.ok(root);
    assert.match(root.textContent, /Nothing to charge in this period/);
    assert.equal(root.querySelector('[data-testid="tpl-consumed"]'), null);
    assert.equal(root.querySelector('[data-testid="tpl-cur-EUR-charged"]'), null);
  });
});

test('RULE-TPL-01 closes an ask only for the reason that is true: a quarter rolling over closes nothing, pricing the older quarter does, and one open question is never reissued', () => {
  const clock = { now: NOW };
  const storage = fakeStorage(baseState());
  const store = createStore({ storage, now: () => clock.now });
  store.load();
  const api = createApi(store, { now: () => clock.now });
  const eur = { currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost' };
  const byId = (id) => store.state.delegations.find((d) => d.id === id);
  const asksFor = (personId, pattern) => activeTasks(store).filter((t) => t.personId === personId && pattern.test(t.title));
  const Q3_TITLE = /for 2026-07-01 to 2026-09-30/;
  const Q4_TITLE = /for 2026-10-01 to 2026-12-31/;
  const KEY_TITLE = /Answer the transfer price/;

  // 11 November 2026: Q3 is the last completed quarter. One proposal opts the workspace in.
  const p1 = api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm', actingSide: 'lender', ...eur, ...Q3 });
  assert.equal(p1.ok, true, p1.error);
  const pm2Q3 = asksFor('pm2', Q3_TITLE)[0];
  const pmKey = asksFor('pm', KEY_TITLE)[0];
  assert.ok(pm2Q3 && pmKey && asksFor('fm', Q3_TITLE)[0]);
  assert.match(pm2Q3.support, /closes automatically once every one of those share-days is under a proposed or agreed price/);
  assert.match(pmKey.support, /closes automatically once you confirm or decline the price, or its proposer withdraws it/);

  // 15 January 2027: Q4 is now the last completed quarter and Q3 is STILL unpriced.
  clock.now = new Date('2027-01-15T10:00:00.000Z');
  assert.equal(api.transferPriceScan().ok, true);
  assert.equal(byId(pm2Q3.id).status, 'active', 'the calendar moving on is not an answer: the Q3 ask is still owed and stays open');
  assert.equal(byId(pmKey.id).status, 'active', 'the proposal still holds one key');
  // Q4 consumed share-days on all three pairs and no price covers any of them.
  assert.deepEqual(activeTasks(store).filter((t) => Q4_TITLE.test(t.title)).map((t) => t.personId).sort(), ['fm', 'pm', 'pm2']);
  assert.match(asksFor('pm2', Q4_TITLE)[0].expectedOutcome, /2300 share-day\(s\) your line consumed/, '92 days × 25%');
  assert.equal(asksFor('pm2', Q3_TITLE).length, 1, 'no second Q3 ask was issued');
  assert.equal(api.transferPriceScan().ok, true);
  assert.equal(activeTasks(store).filter((t) => Q4_TITLE.test(t.title)).length, 3, 'idempotent across the rollover');

  // One open question, never reissued: a partial proposal that dies moves the
  // generation, and the ask already open keeps answering for the pair.
  const pm2Q4 = asksFor('pm2', Q4_TITLE)[0];
  const october = api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm2', actingSide: 'borrower', ...eur, effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31' });
  assert.equal(october.ok, true, october.error);
  assert.equal(byId(pm2Q4.id).status, 'active', 'November and December are still unpriced');
  assert.equal(api.transferPriceRetire(october.id, { reason: 'October alone is not what we agreed.', actingSide: 'lender' }).state, 'declined');
  assert.deepEqual(asksFor('pm2', Q4_TITLE).map((t) => t.id), [pm2Q4.id], 'the same ask stays open; it is not closed and reissued');

  // Pricing the OLDER quarter closes its ask, with the reason that is true.
  const q3Price = api.transferPricePropose({ lenderId: 'fm', borrowerId: 'pm2', actingSide: 'lender', ...eur, ratePerPersonDay: 500, effectiveFrom: '2026-08-01', effectiveTo: '2026-09-30' });
  assert.equal(q3Price.ok, true, q3Price.error);
  assert.equal(byId(pm2Q3.id).status, 'done');
  assert.match(byId(pm2Q3.id).completionNote, /^Closed by RULE-TPL-01 on 2027-01-15: every share-day this line consumed from that home line between 2026-07-01 and 2026-09-30 is now under a proposed or agreed price/);
  assert.equal(byId(pm2Q4.id).status, 'active', 'the Q4 ask is a different question and is untouched');
  const pm2Key = asksFor('pm2', KEY_TITLE)[0];
  assert.ok(pm2Key, 'pm2 now holds the missing borrower key');
  assert.equal(api.transferPriceConfirm(q3Price.id).ok, true);
  assert.match(byId(pm2Key.id).completionNote, /the second key was turned on 2027-01-15/);

  // Declining closes the key ask for THAT reason, and no ask is issued for a quarter that is no longer the last completed one.
  assert.equal(api.transferPriceRetire(p1.id, { reason: 'Standard cost was revised after the quarter.', actingSide: 'borrower' }).state, 'declined');
  assert.match(byId(pmKey.id).completionNote, /the proposal was declined on 2027-01-15/);
  assert.equal(asksFor('pm', Q3_TITLE).length, 0, 'the rule only issues asks for the last completed quarter');
  assert.equal(store.state.delegations.filter((d) => /Closed by RULE-TPL-01/.test(d.completionNote || '')).every((d) => /No key was turned on anyone’s behalf and no charge was posted\.$/.test(d.completionNote)), true);
  assert.equal(store.state.transferPriceActs.filter((a) => a.via !== 'operator').length, 0, 'the rule signed nothing: every act is one the test scribed');
  assert.equal(store.state.transferPriceActs.length, 6);
});
