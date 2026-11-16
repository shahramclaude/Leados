/**
 * ADR-0194 — Chargeback Period Posting & Budget-Envelope Binding
 * (introduced at Schema v154; current Schema v155, RULE-CBP-01, CSV #146,
 * `#/matrix?panel=postings`).
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
  auditPostingDrift,
  buildChargebackPostingLedger, chargebackPostingBriefText, chargebackPostingCsvRows, compileChargebackPostings,
  driftSignatureOf,
} from '../../app/core/domain/chargebackPosting.js';
import {
  CHARGEBACK_POSTING_ACT_KINDS,
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

test('ADR-0194/0202 registration: introduced at Schema v154, current Schema v158, empty migration, spine order and parity, gateway, seat policy, panel #37, CSV #146, pause-permit reach', () => {
  assert.equal(SCHEMA_VERSION, 179);
  const empty = createEmptyState(ISO);
  assert.deepEqual(empty.chargebackPostings, []);
  assert.deepEqual(empty.chargebackPostingMarkers, []);
  assert.equal(empty.settings.chargebackPostingAskDueDays, 10);
  assert.equal(empty.settings.chargebackPostingAutoPropagate, true);

  const { raw, applied } = migrate({ schemaVersion: 153, appId: 'leados', meta: {}, settings: {} });
  assert.deepEqual(applied, ['153 → 154', '154 → 155', '155 → 156', '156 → 157', '157 → 158', '158 → 159', '159 → 160', '160 → 161', '161 → 162', '162 → 163', '163 → 164', '164 → 165', '165 → 166', '166 → 167', '167 → 168', '168 → 169', '169 → 170', '170 → 171', '171 → 172', '172 → 173', '173 → 174', '174 → 175', '175 → 176', '176 → 177', '177 → 178', '178 → 179']);
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
  assert.ok(CHARGEBACK_POSTING_TRIGGER_EVENTS.has(CHARGEBACK_POSTING_EVENTS.ACKNOWLEDGED), 'an acknowledgement closes its own ask in the same commit');
  assert.ok(CHARGEBACK_POSTING_TRIGGER_EVENTS.has('matrix.line.retuned'), 'a retro retune restates a posted period, so the posting is re-audited when it lands');
  assert.ok(CHARGEBACK_POSTING_ACT_KINDS.includes('acknowledge'), 'ADR-0202 adds the dated drift decision to the act vocabulary');

  assert.ok(SAFE_READS.has('chargebackPostingReport'));
  for (const name of ['chargebackPost', 'chargebackReversePosting', 'chargebackAcknowledgeDrift']) assert.equal(API_RIGHTS[name], 'post-chargeback');
  for (const name of ['chargebackPostingScan', 'chargebackPostingSetConventions']) assert.equal(API_RIGHTS[name], 'govern-transfer-prices');
  assert.deepEqual([ACTION_RIGHTS['post-chargeback'].minRank, ACTION_RIGHTS['post-chargeback'].maxRank], [4, 5], 'posting a period fact is director-and-above');
  assert.equal(RECORD_POLICIES.chargebackPostings.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.chargebackPostingMarkers.detailCeiling, 0);
  assert.ok(MATRIX_PANELS.some((p) => p.key === 'postings'));
  assert.equal(CSV_EXPORTS.length, 166);
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

/* ---------------------------------------------------- ADR-0202: drift decisions */

const driftMarkers = (store) => store.state.chargebackPostingMarkers
  .filter((m) => m && m.kind === 'ask' && String(m.subjectKey || '').startsWith('drift|'));
const activeDriftAsks = (store) => {
  const active = new Set(store.state.delegations.filter((d) => d.status === 'active').map((d) => d.id));
  return driftMarkers(store).filter((m) => active.has(m.taskId));
};

test('acknowledgements are fail-closed on LOAD: unknown postings, malformed signatures, duplicates, short reasons and post-reversal acks are dropped and counted; a valid ack survives', () => {
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
  const ack = (id, postingId, signature, reason = 'the retuned share was accepted as the period fact by finance') => ({
    ...base, id, kind: 'acknowledge', postingId, signature, reason,
  });
  state.chargebackPostings = [
    { ...base, id: 'p1', kind: 'post', rows, totalChargedCents: 1000, totalCreditedCents: 1000 },
    ack('a1', 'p1', 'drift1:1:deadbeefdeadbeef'),                                  // kept: valid, before any reversal
    ack('a2', 'p1', 'drift1:1:deadbeefdeadbeef'),                                  // duplicate (posting, signature)
    ack('a3', 'ghost', 'drift1:1:deadbeefdeadbeef'),                               // posting not on the record
    ack('a4', 'p1', 'not-a-signature'),                                            // malformed fingerprint
    ack('a5', 'p1', 'drift1:1:cafecafecafecafe', 'short'),                         // reason below the floor
    { ...base, id: 'r1', kind: 'reverse', postingId: 'p1', reason: 'posted against the wrong quarter statement by mistake' },
    ack('a6', 'p1', 'drift1:1:aaaaaaaaaaaaaaaa'),                                  // after the reversal: no claim to decide
  ];
  const { state: clean, warnings } = normalizeState({ ...state, schemaVersion: SCHEMA_VERSION });
  assert.deepEqual(clean.chargebackPostings.map((a) => a.id), ['p1', 'a1', 'r1'], 'only the valid ack and the acts it answers survive');
  assert.equal(clean.chargebackPostings[1].signature, 'drift1:1:deadbeefdeadbeef');
  assert.ok(warnings.some((w) => /dropped 4 malformed posting act\(s\)/.test(w)), warnings.join(' | '));
  assert.ok(warnings.some((w) => /dropped 1 acknowledgement\(s\) answering a posting that is not on the record/.test(w)), warnings.join(' | '));
  // A load never re-derives or repairs a signature: the reader compares the
  // stored one against the record it derives today, and prints the difference.
  const doc = compileChargebackPostings(clean.chargebackPostings).posts.get('p1');
  assert.ok(doc.reverse, 'the reversal still answers its posting');
});

test('a drifted posting becomes ONE dated decision: exact signature, one ask to the posting’s apex, acknowledge covers only that signature, a grown drift asks again, reversal closes', () => {
  const { store, api, storage } = harness(baseState());
  priceInFull(api);
  const posted = api.chargebackPost({ currency: 'USD', bindings: [{ accountId: 'fm', envelopeId: 'env-fm-usd' }, { accountId: 'pm', envelopeId: 'env-pm-usd' }] });
  assert.equal(posted.ok, true, posted.error);

  /* ---- a faithful posting owes no decision ---- */
  let report = reportOf(api);
  const faithful = report.postings.find((p) => p.id === posted.id);
  assert.deepEqual([faithful.audit.verdict, faithful.audit.ackState, faithful.audit.driftSignature], ['faithful', 'no-drift', null]);
  const noDrift = api.chargebackAcknowledgeDrift(posted.id, 'A sufficiently long reason while nothing has moved.');
  assert.equal(noDrift.ok, false);
  assert.match(noDrift.error, /reads faithful/);
  assert.match(noDrift.error, /no drift to acknowledge/i);

  /* ---- a retro retune drifts the posted figures by exact cents ---- */
  store.state.reportingLines = store.state.reportingLines.map((l) => (l.id === 'ln-pat' ? { ...l, shareH: 20 } : l));
  report = reportOf(api);
  const drifted = report.postings.find((p) => p.id === posted.id);
  assert.equal(drifted.audit.verdict, 'drifted');
  assert.equal(drifted.audit.ackState, 'unacknowledged');
  assert.match(drifted.audit.driftSignature, /^drift1:2:[0-9a-f]{16}$/, 'two moved figures: fm charged and pm credited');
  // The signature is the shared implementation over the hand-built entries —
  // reader, rule and action door all fingerprint the SAME drift.
  assert.equal(drifted.audit.driftSignature, driftSignatureOf([
    { accountId: 'fm', field: 'chargedCents', postedCents: 276000, currentCents: 552000 },
    { accountId: 'pm', field: 'creditedCents', postedCents: 276000, currentCents: 552000 },
  ]));
  assert.equal(report.board.driftAcks.unacknowledged, 1);
  assert.equal(report.board.driftAcks.acknowledged, 0);
  assert.equal(report.board.driftAcksReconcile, true);
  assert.equal(reportOf(api).postings.find((p) => p.id === posted.id).audit.driftSignature, drifted.audit.driftSignature, 'two reads produce the byte-identical signature');

  /* ---- every refusal at the door ---- */
  let r = api.chargebackAcknowledgeDrift(posted.id, 'too short');
  assert.equal(r.ok, false);
  assert.match(r.error, /written reason of at least 10/);
  r = api.chargebackAcknowledgeDrift('ghost', 'A sufficiently long reason for a posting that does not exist.');
  assert.equal(r.ok, false);
  assert.match(r.error, /not on the record/);
  sit(store, 'pm');
  assert.equal(api.chargebackAcknowledgeDrift(posted.id, 'A sufficiently long reason attempted from a manager seat.').ok, false, 'rank 3 is below the posting floor');
  sit(store, null);

  /* ---- one dated ask, to the apex of the lines the POSTING froze ---- */
  assert.equal(activeDriftAsks(store).length, 0, 'a read never asks; the rule runs on an event');
  assert.equal(api.chargebackPostingScan().ok, true);
  let asks = activeDriftAsks(store);
  assert.equal(asks.length, 1, 'one ask per (posting, signature)');
  const s1 = drifted.audit.driftSignature;
  const task = store.state.delegations.find((d) => d.id === asks[0].taskId);
  assert.equal(task.personId, 'vp', 'the lowest joint apex of the frozen fm and pm rows is the VP');
  assert.equal(task.authority, 'act-inform');
  assert.match(task.title, /Decide the drift on the 2026-07-01–2026-09-30 USD posting/);
  assert.ok(store.state.chargebackPostingMarkers.some((m) => m.key === `ask|drift|${posted.id}|${s1}`), asks.map((m) => m.key).join(' | '));
  assert.equal(api.chargebackPostingScan().ok, true);
  assert.equal(activeDriftAsks(store).length, 1, 'a second scan is idempotent — one ask per signature, ever');

  /* ---- the dated decision: acknowledge covers EXACTLY this signature ---- */
  const acked = api.chargebackAcknowledgeDrift(posted.id, 'Finance accepted the retuned share as the Q3 period fact; the divergence is noted and the posted totals stand.');
  assert.equal(acked.ok, true, acked.error);
  assert.equal(acked.signature, s1, 'the door re-derives the same signature the panel printed');
  report = reportOf(api);
  const decided = report.postings.find((p) => p.id === posted.id);
  assert.deepEqual([decided.audit.ackState, decided.audit.ack.decidedOn, decided.audit.ack.signature], ['acknowledged', '2026-11-11', s1]);
  assert.match(decided.audit.ack.reason, /retuned share/);
  assert.equal(report.board.driftAcks.acknowledged, 1);
  assert.equal(report.board.openDriftAsksN, 0);
  const closed = store.state.delegations.find((d) => String(d.title).includes('Decide the drift'));
  assert.equal(closed.status, 'done');
  assert.match(closed.completionNote, /acknowledged in writing on 2026-11-11/);
  assert.match(closed.completionNote, /Nothing was posted, reversed or bound/, 'the rule decided nothing on anyone’s behalf');
  r = api.chargebackAcknowledgeDrift(posted.id, 'Attempting to acknowledge the very same signature a second time.');
  assert.equal(r.ok, false);
  assert.match(r.error, /already acknowledged on 2026-11-11/);

  /* ---- panel, CSV and reload print the computed decision ---- */
  const csv = exportWorkspaceCsv(store.state, 'chargeback-postings', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  const lines = csv.csv.trim().split(/\r?\n/);
  const cell = (rowIndex, key) => lines[rowIndex + 1].split(',')[CHARGEBACK_POSTING_CSV_COLUMNS.indexOf(key)];
  const postingRow = lines.findIndex((l, i) => i > 0 && l.startsWith('posting,')) - 1; // cell() indexes data rows (header excluded)
  assert.equal(cell(0, 'drift_ack_acknowledged'), '1');
  assert.equal(cell(0, 'drift_ack_unacknowledged'), '0');
  assert.equal(cell(0, 'open_drift_asks'), '0');
  assert.equal(cell(postingRow, 'drift_signature'), s1, 'the exported signature is the printed signature');
  assert.equal(cell(postingRow, 'drift_ack_state'), 'acknowledged');
  assert.equal(cell(postingRow, 'drift_ack_on'), '2026-11-11');
  assert.doesNotMatch(csv.csv, /Fay|Priya|Paul|Vera|env-fm-usd|retuned share|period fact/, 'the export stays identity- and prose-free: no person, envelope, signature reason or note');
  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=postings'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const root = node.querySelector('[data-testid="matrix-chargeback-posting-panel"]');
    const cardEl = root.querySelector(`[data-testid="cbp-ack-${posted.id}"]`);
    assert.ok(cardEl, 'the decision prints on the posting card');
    assert.match(cardEl.textContent, /Drift ACKNOWLEDGED/);
    assert.match(cardEl.textContent, new RegExp(s1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(root.querySelector(`[data-testid="cbp-ack-btn-${posted.id}"]`), null, 'an acknowledged drift offers no second acknowledgement');
    assert.equal(root.querySelector('[data-testid="cbp-brief"]').textContent, chargebackPostingBriefText(report));
  });

  /* ---- the record moves again: a NEW signature is a NEW decision ---- */
  store.state.reportingLines = store.state.reportingLines.map((l) => (l.id === 'ln-pat' ? { ...l, shareH: 30 } : l));
  report = reportOf(api);
  const grown = report.postings.find((p) => p.id === posted.id);
  assert.equal(grown.audit.ackState, 'unacknowledged', 'the S1 acknowledgement never covers an S2 drift');
  const s2 = grown.audit.driftSignature;
  assert.notEqual(s2, s1);
  assert.match(s2, /^drift1:2:[0-9a-f]{16}$/);
  assert.equal(grown.audit.priorAck.signature, s1, 'the prior acknowledgement is printed as history, not as cover');
  assert.equal(api.chargebackPostingScan().ok, true);
  asks = activeDriftAsks(store);
  assert.equal(asks.length, 1, 'exactly one ask for the signature that is actually owed');
  assert.ok(store.state.chargebackPostingMarkers.some((m) => m.key === `ask|drift|${posted.id}|${s2}`));
  assert.ok(store.state.chargebackPostingMarkers.some((m) => m.key === `ask|drift|${posted.id}|${s1}`), 'the S1 ask stays as history — it is never issued again');

  /* ---- a reversal closes the drift ask with the actual reason ---- */
  const reversed = api.chargebackReversePosting(posted.id, 'The retuned share was agreed against the wrong line; reversing to re-post the corrected statement.');
  assert.equal(reversed.ok, true, reversed.error);
  report = reportOf(api);
  const asHistory = report.postings.find((p) => p.id === posted.id);
  assert.deepEqual([asHistory.state, asHistory.audit.verdict, asHistory.audit.ackState], ['reversed', 'not-audited', 'no-drift']);
  assert.equal(activeDriftAsks(store).length, 0, 'a reversed posting owes no drift decision');
  const s2Task = store.state.delegations.find((d) => String(d.title).includes('Decide the drift') && d.expectedOutcome.includes(s2));
  assert.equal(s2Task.status, 'done');
  assert.match(s2Task.completionNote, /posting was reversed/);

  /* ---- display == stored across a real reload ---- */
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  const again = harness(persisted);
  const reloaded = reportOf(again.api);
  assert.deepEqual(reloaded.postings, report.postings, 'the persisted acts reproduce every printed figure');
  assert.deepEqual(reloaded.board, report.board);
});

test('one ask per signature, ever: an UNANSWERED drift that clears and returns is not re-asked, and the panel still prints it as undecided', () => {
  const { store, api } = harness(baseState());
  priceInFull(api);
  const posted = api.chargebackPost({ currency: 'USD', bindings: [{ accountId: 'fm', envelopeId: 'env-fm-usd' }, { accountId: 'pm', envelopeId: 'env-pm-usd' }] });
  assert.equal(posted.ok, true, posted.error);

  store.state.reportingLines = store.state.reportingLines.map((l) => (l.id === 'ln-pat' ? { ...l, shareH: 20 } : l));
  const s1 = reportOf(api).postings.find((p) => p.id === posted.id).audit.driftSignature;
  assert.ok(s1);
  assert.equal(api.chargebackPostingScan().ok, true);
  assert.equal(activeDriftAsks(store).length, 1);

  // The record returns to the posted figures: the ask closes because the
  // condition cleared — not because anybody decided anything.
  store.state.reportingLines = store.state.reportingLines.map((l) => (l.id === 'ln-pat' ? { ...l, shareH: 10 } : l));
  assert.equal(api.chargebackPostingScan().ok, true);
  assert.equal(activeDriftAsks(store).length, 0);
  const cleared = store.state.delegations.find((d) => String(d.title).includes('Decide the drift'));
  assert.equal(cleared.status, 'done');
  assert.match(cleared.completionNote, /reproduces the posted figures again/);
  assert.equal(reportOf(api).postings.find((p) => p.id === posted.id).audit.ackState, 'no-drift');

  // The identical drift returns: the signature already has its one ask, so no
  // second ask is issued — and the register prints the decision as still owed.
  store.state.reportingLines = store.state.reportingLines.map((l) => (l.id === 'ln-pat' ? { ...l, shareH: 20 } : l));
  const back = reportOf(api).postings.find((p) => p.id === posted.id);
  assert.equal(back.audit.driftSignature, s1, 'the identical restatement yields the identical signature');
  assert.equal(back.audit.ackState, 'unacknowledged');
  assert.equal(api.chargebackPostingScan().ok, true);
  assert.equal(activeDriftAsks(store).length, 0, 'never asks twice for one signature');
  assert.equal(reportOf(api).board.openDriftAsksN, 0);
});
