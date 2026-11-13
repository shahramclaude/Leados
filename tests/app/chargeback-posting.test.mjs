/**
 * ADR-0194 — Chargeback Period Posting & Budget-Envelope Binding
 * (Schema v154, RULE-CBP-01, CSV #146, `#/matrix?panel=postings`).
 *
 * One focused suite: registration, the fail-closed normalizer (integer
 * identities re-proved on LOAD), single-chain inertness, refusal of every
 * incomplete statement, the HAND-COMPUTED posting lifecycle over the
 * transfer-price fixture (post → duplicate refused → reverse → repost
 * generation), the drift audit with exact cent deltas, binding decay,
 * RULE-CBP-01 end to end (pause + explicit scan, close-on-posted, new
 * generation after reversal), and display == stored across a real reload.
 *
 * THE FIXTURE (same as transfer-price.test.mjs; quarter 2026-07-01..09-30):
 *   sam 2780 share-days fm→pm @600 EUR  = 1,668,000 cents
 *   hal  775 (Aug) @500 + 750 (Sep) @500 fm→pm2 = 762,500 cents
 *   pat  920 pm→fm @300 USD             =   276,000 cents
 *   EUR: fm credited 2,430,500; pm charged 1,668,000; pm2 charged 762,500.
 *   USD: pm credited 276,000; fm charged 276,000.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { PAUSE_PERMIT_MATRIX_REACH_SWITCHES, PAUSE_PERMIT_REACH_RULES } from '../../app/core/domain/pausePermitRegistry.js';
import { transferPriceRule } from '../../app/core/domain/transferPriceRules.js';
import { chargebackPostingRule, CHARGEBACK_POSTING_TRIGGER_EVENTS } from '../../app/core/domain/chargebackPostingRules.js';
import {
  buildChargebackPostingLedger, chargebackPostingBriefText, chargebackPostingCsvRows, compileChargebackPostings,
} from '../../app/core/domain/chargebackPosting.js';
import {
  CHARGEBACK_POSTING_CSV_COLUMNS, CHARGEBACK_POSTING_EVENTS, CHARGEBACK_POSTING_LIMITS, CHARGEBACK_POSTING_RULE_ID,
} from '../../app/core/domain/chargebackPostingRegistry.js';
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

/** VP → dirA (fm, pm2) and dirB (pm). Budgets: pm owns an EUR and a USD envelope. */
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
  state.budgets = [
    { id: 'env-pm', name: 'Project line run budget (EUR)', ownerId: 'pm', currency: 'EUR', status: 'active', limit: 50000 },
    { id: 'env-pm-usd', name: 'Project line run budget (USD)', ownerId: 'pm', currency: 'USD', status: 'active', limit: 10000 },
    { id: 'env-fm-usd', name: 'Functional absorb budget (USD)', ownerId: 'fm', currency: 'USD', status: 'active', limit: 10000 },
  ];
  return state;
}

function harness(seed) {
  const storage = fakeStorage(seed);
  const store = createStore({ storage, now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api, storage };
}

const sit = (store, seatId) => { store.state.settings = { ...store.state.settings, activeSeatId: seatId }; };
const reportOf = (api) => { const r = api.chargebackPostingReport(); assert.equal(r.ok, true, r.error); return r.report; };
const cbpTasks = (store) => store.state.delegations.filter((d) => String(d.support).includes(CHARGEBACK_POSTING_RULE_ID));
const activeAsks = (store) => cbpTasks(store).filter((d) => d.status === 'active');

/** Operator view: scribe one key, then the other. */
function agree(api, input) {
  const p = api.transferPricePropose({ actingSide: 'lender', ...input });
  assert.equal(p.ok, true, p.error);
  const c = api.transferPriceConfirm(p.id);
  assert.equal(c.ok, true, c.error);
  return p.id;
}

/** Price the quarter IN FULL: EUR 2,430,500 and USD 276,000, netting to zero. */
function priceInFull(api) {
  agree(api, { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30' });
  agree(api, { lenderId: 'pm', borrowerId: 'fm', actingSide: 'lender', currency: 'USD', ratePerPersonDay: 300, basis: 'market-rate', ...Q3 });
}

/** The full EUR binding set: pm against its own envelope, fm and pm2 declared. */
const EUR_BINDINGS = [
  { accountId: 'pm', envelopeId: 'env-pm' },
  { accountId: 'fm', reason: 'Lender side: the credit funds the functional cost centre, which runs without a declared envelope this year.' },
  { accountId: 'pm2', reason: 'Paul’s product line budget is not yet declared in LeadOS; charge tracked in the finance system of record.' },
];

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

test('ADR-0194 registration: Schema v154, empty migration, spine order and parity, gateway, seat policy, panel #37, CSV #146, pause-permit reach', () => {
  assert.equal(SCHEMA_VERSION, 154);
  const empty = createEmptyState(ISO);
  assert.deepEqual(empty.chargebackPostings, []);
  assert.deepEqual(empty.chargebackPostingMarkers, []);
  assert.equal(empty.settings.chargebackPostingAskDueDays, 10);
  assert.equal(empty.settings.chargebackPostingAutoPropagate, true);

  const { raw, applied } = migrate({ schemaVersion: 153, appId: 'leados', meta: {}, settings: {} });
  assert.deepEqual(applied, ['153 → 154']);
  assert.deepEqual(raw.chargebackPostings, [], 'no period fact is fabricated on upgrade');
  assert.deepEqual(raw.chargebackPostingMarkers, []);

  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(chargebackPostingRule);
  const tplIdx = DEFAULT_POST_COMMIT_RULES.indexOf(transferPriceRule);
  const seatIdx = DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule');
  assert.ok(tplIdx >= 0 && idx === tplIdx + 1, 'RULE-CBP-01 runs immediately after RULE-TPL-01 — in the commit that completes the statement');
  assert.ok(idx < seatIdx, 'RULE-CBP-01 runs before the seat roll-up rule');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === chargebackPostingRule);
  assert.deepEqual(contract.writes, ['delegations', 'links', 'chargebackPostingMarkers']);
  assert.equal(chargebackPostingRule.id, 'chargebackPostingRule');
  assert.ok(CHARGEBACK_POSTING_TRIGGER_EVENTS.has(CHARGEBACK_POSTING_EVENTS.SCAN));

  assert.ok(SAFE_READS.has('chargebackPostingReport'));
  for (const name of ['chargebackPost', 'chargebackReversePosting']) assert.equal(API_RIGHTS[name], 'post-chargeback');
  for (const name of ['chargebackPostingScan', 'chargebackPostingSetConventions']) assert.equal(API_RIGHTS[name], 'govern-transfer-prices');
  assert.deepEqual([ACTION_RIGHTS['post-chargeback'].minRank, ACTION_RIGHTS['post-chargeback'].maxRank], [4, 5], 'posting a period fact is director-and-above');
  assert.equal(RECORD_POLICIES.chargebackPostings.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.chargebackPostingMarkers.detailCeiling, 0);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'postings'));
  assert.equal(CSV_EXPORTS.length, 146);
  assert.ok(CSV_EXPORTS.some((d) => d.key === 'chargeback-postings'));

  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('chargebackPostingAutoPropagate'), 'the switch reaches a second line, so it is on the permit list');
  assert.equal(PAUSE_PERMIT_REACH_RULES.chargebackPostingAutoPropagate, 'chargebackPostingRules.js');
});

test('fail-closed normalizer: the integer identities are re-proved on LOAD — forged totals, forged claims and orphan reversals are dropped and counted', () => {
  const state = baseState();
  const base = {
    via: 'operator', decidedBySeatId: null, decidedOn: '2026-11-11', at: ISO, note: '',
    periodFrom: '2026-07-01', periodTo: '2026-09-30', currency: 'EUR',
    entriesN: 1, pricedShareDays: 10, engineVersion: 'tp-x',
    claims: { statementComplete: true, zeroSum: true, shareDaysReconcile: true, periodLedgerIdentity: true, arithmeticSafe: true },
  };
  const rows = [
    { accountId: 'fm', chargedCents: 0, creditedCents: 1000, envelopeId: null, noEnvelopeReason: 'the lender side runs without a declared envelope' },
    { accountId: 'pm', chargedCents: 1000, creditedCents: 0, envelopeId: 'env-pm', noEnvelopeReason: '' },
  ];
  state.chargebackPostings = [
    { ...base, id: 'p1', kind: 'post', rows, totalChargedCents: 1000, totalCreditedCents: 1000 },
    // Rows do not sum to the totals: a forged period fact, never repaired.
    { ...base, id: 'p2', kind: 'post', rows, totalChargedCents: 999, totalCreditedCents: 1000 },
    // Frozen claims admit the statement was NOT complete: never a posting.
    { ...base, id: 'p3', kind: 'post', rows, totalChargedCents: 1000, totalCreditedCents: 1000, claims: { ...base.claims, statementComplete: false } },
    { ...base, id: 'r1', kind: 'reverse', postingId: 'p1', reason: 'posted against the wrong quarter statement by mistake' },
    { ...base, id: 'r2', kind: 'reverse', postingId: 'ghost', reason: 'answers a posting that is not on the record' },
    'nonsense',
  ];
  state.chargebackPostingMarkers = [
    { key: 'ask|post|2026-07-01..2026-09-30|EUR|g0', kind: 'ask', subjectKey: 'post|2026-07-01..2026-09-30|EUR|g0', taskId: 'dlg-1', state: 'unposted', summary: 's', at: ISO },
    { key: 'junk', kind: 'wat' },
  ];
  const { state: clean, warnings } = normalizeState({ ...state, schemaVersion: SCHEMA_VERSION });
  assert.deepEqual(clean.chargebackPostings.map((a) => a.id), ['p1', 'r1']);
  assert.ok(warnings.some((w) => /dropped 1 malformed posting act/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /dropped 2 posting\(s\) whose frozen figures or claims failed/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /dropped 1 reversal\(s\) answering a posting that is not on the record/.test(w)), warnings.join(' | '));
  assert.equal(clean.chargebackPostingMarkers.length, 1);
  const { posts, liveByKey } = compileChargebackPostings(clean.chargebackPostings);
  assert.equal(posts.get('p1').reverse.id, 'r1');
  assert.deepEqual(liveByKey.get('2026-07-01..2026-09-30|EUR') || [], [], 'a reversed posting is not live');
});

test('inert and refused: a single-chain workspace gains no row; an incomplete statement is refused whole with the exact failing claim, never posted at a substitute rate', () => {
  const single = harness(baseState({ lines: false }));
  const inert = reportOf(single.api);
  assert.equal(inert.quarter.state, 'inert');
  assert.deepEqual(inert.postings, []);
  assert.ok(inert.inertNote, 'the inert workspace says so in words');
  assert.equal(single.api.chargebackPost({ currency: 'EUR', bindings: [] }).ok, false);
  // O(1) inertness of the rule: no price act has ever existed, so even an
  // explicit scan issues nothing and reads nothing.
  assert.equal(single.api.chargebackPostingScan().ok, true);
  assert.equal(cbpTasks(single.store).length, 0);

  const { store, api } = harness(baseState());
  agree(api, { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 });
  const report = reportOf(api);
  assert.equal(report.quarter.state, 'not-postable');
  assert.equal(report.quarter.claims.statementComplete, false);
  const refused = api.chargebackPost({ currency: 'EUR', bindings: EUR_BINDINGS });
  assert.equal(refused.ok, false);
  assert.equal(refused.field, 'statement');
  assert.match(refused.error, /incomplete/i);
  assert.match(refused.error, /RULE-TPL-01/, 'the refusal names whose asks the missing prices are');
  assert.equal(store.state.chargebackPostings.length, 0, 'nothing was written');
  assert.equal(activeAsks(store).length, 0, 'an incomplete quarter owes RULE-TPL-01’s asks, not a posting ask');
});

test('the lifecycle, hand-computed: pause and explicit scan, asks to the joint apex, every binding refusal, the posting, close-on-posted, duplicate refused, reversal, new generation', () => {
  const { store, api } = harness(baseState());
  const set = api.chargebackPostingSetConventions({ autoPropagate: false });
  assert.equal(set.ok, true, set.error);

  priceInFull(api);
  assert.equal(activeAsks(store).length, 0, 'the pause silences automation');
  const scan = api.chargebackPostingScan();
  assert.equal(scan.ok, true, scan.error);
  const asks = activeAsks(store);
  assert.equal(asks.length, 2, 'one ask per (quarter, currency): EUR and USD');
  for (const ask of asks) {
    assert.equal(ask.personId, 'vp', 'the lowest joint apex of fm, pm and pm2 is the VP — the one seat both sides roll up to');
    assert.equal(ask.dueOn, '2026-11-21', 'due = today + chargebackPostingAskDueDays (10)');
    assert.equal(ask.authority, 'act-inform');
  }
  const markerKeys = store.state.chargebackPostingMarkers.map((m) => m.key);
  assert.ok(markerKeys.includes('ask|post|2026-07-01..2026-09-30|EUR|g0'), markerKeys.join(' | '));
  assert.ok(markerKeys.includes('ask|post|2026-07-01..2026-09-30|USD|g0'));
  assert.equal(api.chargebackPostingScan().ok, true);
  assert.equal(activeAsks(store).length, 2, 'a second scan is idempotent — no duplicate ask');
  assert.equal(api.chargebackPostingSetConventions({ autoPropagate: true }).ok, true);

  // The standing, hand-computed.
  let report = reportOf(api);
  assert.equal(report.quarter.state, 'ready');
  assert.deepEqual(report.quarter.claims, { statementComplete: true, zeroSum: true, shareDaysReconcile: true, periodLedgerIdentity: true, arithmeticSafe: true });
  assert.deepEqual(report.quarter.currencies.map((c) => [c.currency, c.state, c.chargedCents, c.charged]), [
    ['EUR', 'postable', 2430500, '24305.00'],
    ['USD', 'postable', 276000, '2760.00'],
  ]);
  assert.equal(report.board.openAsksN, 2);

  /* ---- every refusal at the door ---- */
  let r = api.chargebackPost({ currency: 'EUR', bindings: [EUR_BINDINGS[0], EUR_BINDINGS[1]] });
  assert.equal(r.ok, false);
  assert.match(r.error, /Paul Product.*has none/s, 'the unbound line is named with its exact figures');
  r = api.chargebackPost({ currency: 'EUR', bindings: [{ accountId: 'fm', envelopeId: 'env-pm' }, EUR_BINDINGS[0], EUR_BINDINGS[2]] });
  assert.equal(r.ok, false);
  assert.match(r.error, /not owned by Fay Functional/, 'a line’s charge stands against ITS OWN envelope');
  r = api.chargebackPost({ currency: 'EUR', bindings: [{ accountId: 'pm', envelopeId: 'env-pm-usd' }, EUR_BINDINGS[1], EUR_BINDINGS[2]] });
  assert.equal(r.ok, false);
  assert.match(r.error, /recorded in USD, not EUR/, 'nothing is converted');
  r = api.chargebackPost({ currency: 'EUR', bindings: [{ accountId: 'pm2' }, EUR_BINDINGS[0], EUR_BINDINGS[1]] });
  assert.equal(r.ok, false);
  assert.match(r.error, /written reason of at least 10/, 'an absence is recorded, never implied');
  r = api.chargebackPost({ currency: 'CHF', bindings: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /Postable: EUR, USD/);
  assert.equal(store.state.chargebackPostings.length, 0, 'every refusal wrote nothing');

  /* ---- a manager seat is refused by rank; a director may post ---- */
  sit(store, 'pm');
  assert.equal(reportOf(api).actor.canPost, false);
  assert.equal(api.chargebackPost({ currency: 'EUR', bindings: EUR_BINDINGS }).ok, false, 'rank 3 is below the posting floor');
  sit(store, 'vp');
  assert.equal(reportOf(api).actor.canPost, true, 'the asked apex can actually do the thing it was asked');
  sit(store, null);

  /* ---- the posting ---- */
  const posted = api.chargebackPost({ currency: 'EUR', bindings: EUR_BINDINGS, note: 'Q3 close' });
  assert.equal(posted.ok, true, posted.error);
  assert.equal(posted.totalChargedCents, 2430500);
  assert.equal(posted.rowsN, 3);

  report = reportOf(api);
  const eurStanding = report.quarter.currencies.find((c) => c.currency === 'EUR');
  assert.equal(eurStanding.state, 'posted');
  assert.equal(eurStanding.auditVerdict, 'faithful');
  assert.equal(report.quarter.currencies.find((c) => c.currency === 'USD').state, 'postable');
  assert.equal(report.board.liveN, 1);
  const p = report.postings[0];
  assert.deepEqual([p.state, p.currency, p.totalChargedCents, p.totalCreditedCents, p.zeroSum, p.audit.verdict], ['posted', 'EUR', 2430500, 2430500, true, 'faithful']);
  assert.equal(p.periodDays, 92);
  assert.deepEqual(p.rows.map((row) => [row.accountName, row.chargedCents, row.creditedCents, row.binding.state]), [
    ['Fay Functional', 0, 2430500, 'no-envelope'],
    ['Priya Project', 1668000, 0, 'bound'],
    ['Paul Product', 762500, 0, 'no-envelope'],
  ]);
  assert.equal(p.rows[1].envelopeName, 'Project line run budget (EUR)');
  const envelope = store.state.budgets.find((b) => b.id === 'env-pm');
  assert.equal(envelope.limit, 50000, 'no budget figure was written — the posting is printed beside the envelope, not into it');

  // RULE-CBP-01 closed its own EUR ask in the SAME commit, with the reason.
  const eurAsk = cbpTasks(store).find((d) => d.title.includes('(EUR)'));
  assert.equal(eurAsk.status, 'done');
  assert.match(eurAsk.completionNote, /was posted/);
  assert.equal(activeAsks(store).length, 1, 'the USD ask stays open');

  /* ---- a closed period is corrected by reversal, never posted over ---- */
  r = api.chargebackPost({ currency: 'EUR', bindings: EUR_BINDINGS });
  assert.equal(r.ok, false);
  assert.match(r.error, /already posted in EUR.*reverse/s);
  r = api.chargebackReversePosting(posted.id, 'oops');
  assert.equal(r.ok, false, 'a reversal without a real written reason is an erasure');
  const reversed = api.chargebackReversePosting(posted.id, 'The August fm→pm2 agreement priced the wrong rate card; reversing to re-agree and re-post.');
  assert.equal(reversed.ok, true, reversed.error);

  report = reportOf(api);
  assert.equal(report.quarter.currencies.find((c) => c.currency === 'EUR').state, 'postable', 'the reversed quarter is owed again');
  const rp = report.postings.find((x) => x.id === posted.id);
  assert.deepEqual([rp.state, rp.reversedOn, rp.audit.verdict], ['reversed', '2026-11-11', 'not-audited']);
  assert.match(rp.reverseReason, /wrong rate card/);
  // A reversal opens generation 1: a NEW ask, automatically (autoPropagate on).
  assert.ok(store.state.chargebackPostingMarkers.some((m) => m.key === 'ask|post|2026-07-01..2026-09-30|EUR|g1'));
  assert.equal(activeAsks(store).length, 2, 'EUR g1 + USD g0');

  /* ---- and the period can be posted again, as a new dated act ---- */
  const again = api.chargebackPost({ currency: 'EUR', bindings: EUR_BINDINGS, note: 'Q3 close, corrected' });
  assert.equal(again.ok, true, again.error);
  assert.notEqual(again.id, posted.id);
  report = reportOf(api);
  assert.deepEqual([report.board.postingsN, report.board.liveN, report.board.reversedN], [2, 1, 1]);
});

test('the audit never lies: a retro retune drifts the posted USD figures by exact cents, and a dead envelope decays the binding — reported, never corrected', () => {
  const { store, api } = harness(baseState());
  priceInFull(api);
  const posted = api.chargebackPost({
    currency: 'USD',
    bindings: [
      { accountId: 'fm', envelopeId: 'env-fm-usd' },
      { accountId: 'pm', envelopeId: 'env-pm-usd' },
    ],
  });
  assert.equal(posted.ok, true, posted.error);
  assert.equal(posted.totalChargedCents, 276000, 'pat: 920 share-days × 300 cents');

  let report = reportOf(api);
  assert.equal(report.postings.find((p) => p.currency === 'USD').audit.verdict, 'faithful');

  // A retroactive retune: pat's declared share doubles for the whole period.
  // The Q3 USD agreement still covers every share-day, so the statement stays
  // complete — but it no longer says what the posting froze.
  store.state.reportingLines = store.state.reportingLines.map((l) => (l.id === 'ln-pat' ? { ...l, shareH: 20 } : l));
  report = reportOf(api);
  const usd = report.postings.find((p) => p.currency === 'USD');
  assert.equal(usd.audit.verdict, 'drifted');
  assert.deepEqual(
    usd.audit.drifts.map((d) => [d.accountName, d.field, d.postedCents, d.currentCents, d.deltaCents]).sort(),
    [
      ['Fay Functional', 'charged', 276000, 552000, 276000],
      ['Priya Project', 'credited', 276000, 552000, 276000],
    ],
    'the drift is exact integer cents per account and field: 920 → 1840 share-days at 300',
  );
  assert.equal(report.quarter.currencies.find((c) => c.currency === 'USD').state, 'posted-drifted');
  assert.equal(report.board.audits.drifted, 1);
  assert.equal(usd.totalChargedCents, 276000, 'the FROZEN figures never move — drift is a verdict, not an edit');

  // Binding decay: the bound envelope closes after the posting.
  store.state.budgets = store.state.budgets.map((b) => (b.id === 'env-pm-usd' ? { ...b, status: 'closed' } : b));
  report = reportOf(api);
  const pmRow = report.postings.find((p) => p.currency === 'USD').rows.find((r) => r.accountId === 'pm');
  assert.equal(pmRow.binding.state, 'envelope-inactive');
  assert.equal(report.board.rowsDecayedN, 1);
  assert.equal(pmRow.envelopeId, 'env-pm-usd', 'the decayed binding is reported, never re-pointed');
});

test('display == stored: the panel, the brief and CSV #146 print the computed board; reads mutate nothing; a real reload reproduces every figure', () => {
  const { store, api, storage } = harness(baseState());
  priceInFull(api);
  const posted = api.chargebackPost({ currency: 'EUR', bindings: EUR_BINDINGS, note: 'Q3 close' });
  assert.equal(posted.ok, true, posted.error);

  const revision = store.state.meta?.revision;
  const frozen = JSON.stringify(store.state);
  const report = reportOf(api);
  const csv = exportWorkspaceCsv(store.state, 'chargeback-postings', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.equal(JSON.stringify(store.state), frozen, 'reading and exporting mutate nothing');
  assert.equal(store.state.meta?.revision, revision);

  // CSV cells are exactly the board's figures, identity-free.
  const lines = csv.csv.trim().split(/\r?\n/);
  assert.deepEqual(lines[0].replace(/^\uFEFF/, '').split(','), [...CHARGEBACK_POSTING_CSV_COLUMNS]);
  const expected = chargebackPostingCsvRows(report);
  assert.equal(lines.length - 1, expected.length);
  assert.deepEqual(expected.map((row) => row.row_type), ['workspace', 'posting']);
  lines.slice(1).forEach((text, i) => {
    const cells = text.split(',');
    CHARGEBACK_POSTING_CSV_COLUMNS.forEach((key, k) => assert.equal(cells[k], String(expected[i][key]), `${expected[i].row_type}.${key}`));
  });
  const cell = (rowIndex, key) => lines[rowIndex + 1].split(',')[CHARGEBACK_POSTING_CSV_COLUMNS.indexOf(key)];
  assert.equal(cell(0, 'postings'), '1');
  assert.equal(cell(0, 'rows_bound'), '1');
  assert.equal(cell(0, 'rows_no_envelope'), '2');
  assert.equal(cell(1, 'total_charged_cents'), '2430500');
  assert.equal(cell(1, 'total_charged'), '24305.00');
  assert.equal(cell(1, 'audit_verdict'), 'faithful');
  assert.equal(cell(1, 'zero_sum'), 'true');
  assert.doesNotMatch(csv.csv, /Fay|Priya|Paul|Vera|env-pm|run budget|Q3 close/, 'the export is identity-free: no person, envelope, note or reason');

  // The rendered panel prints the same report.
  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=postings'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const root = node.querySelector('[data-testid="matrix-chargeback-posting-panel"]');
    assert.ok(root, 'the postings panel rendered inside #/matrix');
    assert.ok(root.querySelector(`[data-testid="cbp-posting-${posted.id}"]`), 'the posting card is on the panel');
    assert.ok(root.querySelector('[data-testid="cbp-standing-USD"]'), 'the still-postable USD standing row renders');
    assert.ok(root.querySelector('[data-testid="cbp-post-btn-USD"]'), 'the operator sees the post control for the owed currency');
    assert.equal(root.querySelector('[data-testid="cbp-post-btn-EUR"]'), null, 'a posted currency offers no second post button');
    assert.equal(root.querySelector('[data-testid="cbp-brief"]').textContent, chargebackPostingBriefText(report));
    assert.ok(root.querySelector(`[data-testid="cbp-reverse-btn-${posted.id}"]`), 'the live posting offers its reversal');
    assert.match(root.textContent, /24305\.00/, 'the frozen EUR total prints exactly');
  });

  // Real reload from what was actually persisted.
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  const again = harness(persisted);
  assert.deepEqual(again.store.state.chargebackPostings, store.state.chargebackPostings, 'the action writes exactly the normalized shape');
  assert.deepEqual(again.store.state.chargebackPostingMarkers, store.state.chargebackPostingMarkers);
  const reloaded = reportOf(again.api);
  assert.deepEqual(reloaded.board, report.board);
  assert.deepEqual(reloaded.postings, report.postings);
  assert.deepEqual(reloaded.quarter, report.quarter);
  const direct = buildChargebackPostingLedger(again.store.state, { now: NOW });
  assert.deepEqual(direct.board, report.board, 'the panel’s read model and the raw builder agree');
});
