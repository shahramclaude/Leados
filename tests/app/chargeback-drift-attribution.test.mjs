/**
 * ADR-0203 — Posted-Period Drift Attribution: which dated acts landed on a
 * posted period between the posting and today (Schema v158 unchanged — nothing
 * is stored, everything is derived on read; `#/matrix?panel=postings`, CSV #146
 * extended).
 *
 * One focused suite. Part A drives the pure join (`attributePostingDrift` and
 * `eventLogCoverage`) over hand-built fixtures and pins every classification
 * the vocabulary declares: the three families, the four exclusions, the three
 * link states, the coverage proof and its two refusals, the unordered instant,
 * the new-account link, and the count identity. Part B drives the same thing
 * through the real app: a posted USD quarter, a real `matrix.line.retuned` act,
 * the drift ADR-0202 fingerprints, and then the panel, the brief, CSV #146 and a
 * real reload all printing the same candidate figures.
 *
 * THE FIXTURE (as transfer-price / chargeback-posting; quarter 2026-07-01..09-30):
 *   USD: pat 920 share-days pm→fm @300 = 276,000 cents; a retro retune of
 *   ln-pat 10% → 20% doubles it to 552,000, moving fm charged and pm credited.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import { attributePostingDrift, eventLogCoverage, DRIFT_ACT_FAMILY_OF_EVENT } from '../../app/core/domain/chargebackDriftAttribution.js';
import { chargebackPostingBriefText } from '../../app/core/domain/chargebackPosting.js';
import {
  CHARGEBACK_DRIFT_ACT_FAMILIES,
  CHARGEBACK_DRIFT_ATTRIBUTION_VERDICTS,
  CHARGEBACK_DRIFT_COVERAGE_STATES,
  CHARGEBACK_DRIFT_LINK_STATES,
  CHARGEBACK_POSTING_CSV_COLUMNS,
} from '../../app/core/domain/chargebackPostingRegistry.js';
import { renderMatrix } from '../../app/views/matrix.js';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const ISO = NOW.toISOString();
const C = '2025-01-01T00:00:00.000Z';
const Q3 = { effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30' };

/* ------------------------------------------------- Part A: the pure join */

const POST = {
  id: 'cbp-1',
  at: '2026-10-05T09:00:00.000Z',
  periodFrom: '2026-07-01',
  periodTo: '2026-09-30',
  currency: 'EUR',
  rows: [
    { accountId: 'fm', chargedCents: 100000, creditedCents: 0 },
    { accountId: 'pm', chargedCents: 0, creditedCents: 100000 },
  ],
};
const DRIFT = {
  verdict: 'drifted',
  signature: 'drift1:1:0123456789abcdef',
  entries: [{ accountId: 'fm', field: 'chargedCents', postedCents: 100000, currentCents: 150000 }],
};

const ev = (id, ts, type, entityId) => ({ id, ts, type, entity: 'x', entityId, summary: '' });

function synthState(overrides = {}) {
  return {
    events: [
      ev('ev-line', '2026-10-06T08:00:00.000Z', 'matrix.line.retuned', 'ln-1'),
      ev('ev-price', '2026-10-07T08:00:00.000Z', 'transfer.price.confirmed', 'tp-1'),
      ev('ev-noise', '2026-10-08T08:00:00.000Z', 'delegation.created', 'dlg-1'),
      ev('ev-before', '2026-09-30T08:00:00.000Z', 'matrix.line.declared', 'ln-1'),
    ],
    reportingLines: [
      { id: 'ln-1', personId: 'sam', managerId: 'fm', kind: 'project', fromISO: '2026-01-01', toISO: null, status: 'active' },
    ],
    transferPriceActs: [
      { id: 'tpa-1', kind: 'propose', agreementId: 'tp-1', lenderId: 'pm', borrowerId: 'fm', currency: 'EUR', rateCents: 500, basis: 'standard-cost', effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30', decidedOn: '2026-06-01', side: 'lender', via: 'operator' },
      { id: 'tpa-2', kind: 'confirm', agreementId: 'tp-1', side: 'borrower', decidedOn: '2026-06-02', via: 'operator' },
    ],
    people: [{ id: 'sam', managerId: 'pm' }, { id: 'pat', managerId: 'pm' }],
    ...overrides,
  };
}

const attribute = (state, extra = {}) => attributePostingDrift({
  post: POST, drift: DRIFT, state, now: new Date('2026-10-09T12:00:00.000Z'), ...extra,
});

test('vocabulary: the declared families, link states, verdicts and coverage states are the ones the join emits', () => {
  assert.deepEqual(Object.keys(CHARGEBACK_DRIFT_ACT_FAMILIES), ['price', 'line', 'roster']);
  assert.deepEqual(DRIFT_ACT_FAMILY_OF_EVENT['transfer.price.proposed'], undefined, 'a proposal prices nothing, so it is outside every family');
  assert.equal(DRIFT_ACT_FAMILY_OF_EVENT['transfer.price.confirmed'], 'price');
  assert.equal(DRIFT_ACT_FAMILY_OF_EVENT['transfer.price.retired'], 'price');
  assert.deepEqual(CHARGEBACK_DRIFT_ACT_FAMILIES.line.events, ['matrix.line.declared', 'matrix.line.retuned', 'matrix.line.ended']);
  assert.deepEqual(CHARGEBACK_DRIFT_ACT_FAMILIES.roster.events, ['person.updated', 'person.archived', 'person.restored']);
  assert.deepEqual(CHARGEBACK_DRIFT_LINK_STATES, ['linked', 'unlinked', 'unresolved']);
  assert.deepEqual(CHARGEBACK_DRIFT_ATTRIBUTION_VERDICTS, ['attributed', 'no-candidates', 'refused', 'not-run']);
  assert.deepEqual(CHARGEBACK_DRIFT_COVERAGE_STATES, ['covered', 'refused']);
});

test('the join, hand-classified: two linked candidates with the exact link and moved cents, one out-of-window act excluded, one outside-family act counted', () => {
  const a = attribute(synthState());
  assert.equal(a.verdict, 'attributed');
  assert.equal(a.countsReconcile, true);
  // Three of the four events are inside the window (the 2026-09-30 declaration
  // predates the posting instant and is not in it at all).
  assert.equal(a.counts.windowEventsN, 3);
  assert.equal(a.counts.candidatesN, 2);
  assert.equal(a.counts.linkedN, 2);
  assert.equal(a.counts.unlinkedN, 0);
  assert.equal(a.counts.unresolvedN, 0);
  assert.equal(a.counts.outsideFamilyN, 1, '`delegation.created` cannot move a statement figure');
  assert.equal(a.counts.unorderedN, 0);
  assert.equal(a.candidatesOmittedN, 0);
  assert.equal(a.movedAccountsN, 1);

  // Newest first, and the printed candidates are the linked ones only.
  assert.deepEqual(a.candidates.map((c) => c.eventId), ['ev-price', 'ev-line']);

  const price = a.candidates[0];
  assert.equal(price.family, 'price');
  assert.equal(price.entityRef, 'tp-1');
  assert.equal(price.on, '2026-10-07');
  assert.deepEqual(price.link.accounts.map((x) => [x.accountId, x.basis]), [
    ['fm', 'the charge side of this price'],
    ['pm', 'the credit side of this price'],
  ], 'the moved account prints first, each with the side of the price it is');
  assert.match(price.link.basis, /prices 2026-07-01–2026-09-30 at 5\.00 EUR per person-day/);
  const fmFromPrice = price.link.accounts.find((x) => x.accountId === 'fm');
  assert.deepEqual([fmFromPrice.moved, fmFromPrice.fields[0].field, fmFromPrice.fields[0].postedCents, fmFromPrice.fields[0].currentCents, fmFromPrice.fields[0].deltaCents], [true, 'charged', 100000, 150000, 50000]);
  assert.equal(price.link.accounts.find((x) => x.accountId === 'pm').moved, false, 'pm is frozen by the posting but its cents did not move');

  const line = a.candidates[1];
  assert.equal(line.family, 'line');
  assert.equal(line.entityRef, null, 'a line id is not printed as a reference; the account is');
  assert.deepEqual(line.link.accounts.map((x) => x.accountId), ['fm', 'pm'], 'the charged account, then the person’s home-line account as the record reads today');
  assert.match(line.link.accounts[1].basis, /home-line account, as the record reads today/);
  assert.deepEqual([a.window.from, a.window.to, a.window.days], ['2026-10-05', '2026-10-09', 5]);
  assert.deepEqual([a.coverage.state, a.coverage.earliestEventOn], ['covered', '2026-09-30']);
  assert.match(a.coverage.basisText, /suffix that covers the whole window/);
});

test('the four exclusions are counted, never listed: out-of-period, not-figure-moving, unattributable, outside-family — and the identity still holds', () => {
  const state = synthState();
  state.events = [
    ev('ev-ancient', '2026-10-01T00:00:00.000Z', 'settings.updated', 'workspace'),
    ev('ev-oop', '2026-10-06T08:00:00.000Z', 'matrix.line.retuned', 'ln-later'),
    ev('ev-nfm', '2026-10-06T09:00:00.000Z', 'transfer.price.retired', 'tp-drawn'),
    ev('ev-noid', '2026-10-06T10:00:00.000Z', 'person.updated', ''),
    ev('ev-fam', '2026-10-06T11:00:00.000Z', 'settings.updated', 'workspace'),
  ];
  state.reportingLines = [
    ...state.reportingLines,
    { id: 'ln-later', personId: 'pat', managerId: 'fm', kind: 'project', fromISO: '2026-11-01', toISO: null, status: 'active' },
  ];
  state.transferPriceActs = [
    ...state.transferPriceActs,
    { id: 'tpa-3', kind: 'propose', agreementId: 'tp-drawn', lenderId: 'pm', borrowerId: 'fm', currency: 'EUR', rateCents: 400, basis: 'negotiated', effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30', decidedOn: '2026-06-01', side: 'lender', via: 'operator' },
    { id: 'tpa-4', kind: 'retire', agreementId: 'tp-drawn', side: 'lender', decidedOn: '2026-10-06', via: 'operator', note: 'Withdrawn before the other key was scribed.' },
  ];
  const a = attribute(state);
  assert.equal(a.verdict, 'no-candidates');
  assert.equal(a.counts.windowEventsN, 4);
  assert.equal(a.counts.outOfPeriodN, 1, 'a line that starts after the period closes cannot have moved it');
  assert.equal(a.counts.notFigureMovingN, 1, 'a price withdrawn before it was agreed never priced a day');
  assert.equal(a.counts.unattributableN, 1);
  assert.equal(a.counts.outsideFamilyN, 1);
  assert.equal(a.counts.candidatesN, 0);
  assert.equal(a.countsReconcile, true);
  assert.equal(a.candidates.length, 0);
  assert.match(a.detail, /1 in-window act\(s\) touch days outside this posting’s period and are excluded/);
  assert.match(a.detail, /1 in-window act\(s\) cannot move a figure/);
  assert.match(a.detail, /1 in-window act\(s\) were logged with no record id/);
  assert.equal(a.counts.outsideFamilyN, 1);
});

test('unlinked and unresolved are counted and explained, never dressed as candidates, and no account is guessed for them', () => {
  const state = synthState();
  state.events = [
    ev('ev-ancient', '2026-10-01T00:00:00.000Z', 'settings.updated', 'workspace'),
    ev('ev-other', '2026-10-06T08:00:00.000Z', 'matrix.line.retuned', 'ln-other'),
    ev('ev-ghost', '2026-10-06T09:00:00.000Z', 'transfer.price.confirmed', 'tp-ghost'),
    ev('ev-gone', '2026-10-06T10:00:00.000Z', 'person.updated', 'nobody'),
  ];
  state.reportingLines = [
    ...state.reportingLines,
    { id: 'ln-other', personId: 'quin', managerId: 'dirA', kind: 'product', fromISO: '2026-01-01', toISO: null, status: 'active' },
  ];
  const a = attribute(state);
  assert.equal(a.verdict, 'no-candidates');
  assert.equal(a.counts.linkedN, 0);
  assert.equal(a.counts.unlinkedN, 1, 'a line charging an account this posting never froze is not a candidate for it');
  assert.equal(a.counts.unresolvedN, 2, 'a price agreement and a person that are no longer on the record');
  assert.equal(a.counts.candidatesN, 3);
  assert.equal(a.candidates.length, 0);
  assert.equal(a.countsReconcile, true);
  assert.match(a.detail, /2 in-window act\(s\) name a record that is gone; they are counted, and no account is guessed for them/);
});

test('a roster act links through the lines of that person, and a person with no line inside the period is unlinked rather than invented', () => {
  const state = synthState();
  const anchor = ev('ev-ancient', '2026-10-01T00:00:00.000Z', 'settings.updated', 'workspace');
  state.events = [anchor, ev('ev-person', '2026-10-06T08:00:00.000Z', 'person.updated', 'sam')];
  const a = attribute(state);
  assert.equal(a.verdict, 'attributed');
  assert.equal(a.candidates.length, 1);
  assert.deepEqual(a.candidates[0].link.accounts.map((x) => x.accountId), ['fm', 'pm'], 'the account sam’s line charges, and sam’s home-line account');
  assert.match(a.candidates[0].link.basis, /1 line\(s\) inside this posting’s period/);

  state.events = [anchor, ev('ev-person', '2026-10-06T08:00:00.000Z', 'person.archived', 'quin')];
  state.people = [...state.people, { id: 'quin', managerId: 'dirB' }];
  const b = attribute(state);
  assert.equal(b.verdict, 'no-candidates');
  assert.equal(b.counts.unlinkedN, 1);
  assert.match(b.detail, /1 further in-window act\(s\) of a figure-moving family could not be tied to an account this posting froze, and are counted rather than listed/);
  assert.equal(b.candidates.length, 0, 'an act the record cannot tie is counted, never listed as a candidate');
});

test('a brand-new account the posting never froze is part of the link set: the act that put money on it is linked, not unlinked', () => {
  const drift = {
    verdict: 'drifted',
    signature: 'drift1:2:0123456789abcdef',
    entries: [
      { accountId: 'fm', field: 'chargedCents', postedCents: 100000, currentCents: 150000 },
      { accountId: 'pm2', field: 'new-account', postedCents: null, currentCents: null },
    ],
  };
  const state = synthState();
  state.events = [
    ev('ev-ancient', '2026-10-01T00:00:00.000Z', 'settings.updated', 'workspace'),
    ev('ev-new', '2026-10-06T08:00:00.000Z', 'matrix.line.retuned', 'ln-new'),
  ];
  state.reportingLines = [
    ...state.reportingLines,
    { id: 'ln-new', personId: 'pat', managerId: 'pm2', kind: 'product', fromISO: '2026-01-01', toISO: null, status: 'active' },
  ];
  const a = attributePostingDrift({ post: POST, drift, state, now: new Date('2026-10-09T12:00:00.000Z') });
  assert.equal(a.verdict, 'attributed');
  assert.equal(a.movedAccountsN, 2);
  const hit = a.candidates[0].link.accounts.find((x) => x.accountId === 'pm2');
  assert.equal(hit.moved, true);
  assert.deepEqual(hit.fields[0].field, 'new-account');
  assert.equal(hit.fields[0].deltaCents, null, 'a new account has no posted cent to difference');
});

test('coverage is a proof, and where the log cannot see back to the posting the join is REFUSED — never reported as empty', () => {
  const postedAt = POST.at;
  assert.equal(eventLogCoverage([ev('e', '2026-10-01T00:00:00.000Z', 'x', 'y')], { postedAt, now: ISO }).state, 'covered');
  assert.equal(eventLogCoverage([ev('e', postedAt, 'x', 'y')], { postedAt, now: ISO }).state, 'covered', 'an oldest survivor exactly at the posting instant still covers the window');

  const truncated = eventLogCoverage([ev('e', '2026-10-06T00:00:00.000Z', 'x', 'y')], { postedAt, now: ISO });
  assert.deepEqual([truncated.state, truncated.basis], ['refused', 'truncated']);
  assert.equal(eventLogCoverage([], { postedAt, now: ISO }).basis, 'empty');
  assert.equal(eventLogCoverage([ev('e', '2026-10-01T00:00:00.000Z', 'x', 'y')], { postedAt: '2026-12-01T00:00:00.000Z', now: ISO }).basis, 'no-window');

  const state = synthState();
  state.events = state.events.map((e) => ({ ...e, ts: '2026-10-06T00:00:00.000Z' }));
  const a = attribute(state);
  assert.equal(a.verdict, 'refused');
  assert.equal(a.candidates.length, 0);
  assert.equal(a.counts.windowEventsN, 0, 'a refused join counts nothing: it made no comparison');
  assert.match(a.reason, /bounded, oldest-first record/);
  assert.match(a.detail, /The oldest surviving event is 2026-10-06; the posting is dated 2026-10-05/);
  assert.equal(a.coverage.earliestEventOn, '2026-10-06');
});

test('an act at the SAME instant as the posting is printed unordered, and a posting with no drift is not attributed at all', () => {
  const state = synthState();
  state.events = [ev('ev-same', POST.at, 'matrix.line.retuned', 'ln-1')];
  const a = attribute(state);
  assert.equal(a.counts.unorderedN, 1);
  assert.equal(a.candidates[0].unordered, true);
  assert.match(a.detail, /cannot order them before or after it/);

  const notRun = attributePostingDrift({ post: POST, drift: { verdict: 'faithful', signature: null, entries: [] }, state });
  assert.equal(notRun.verdict, 'not-run');
  assert.equal(notRun.counts.windowEventsN, 0);
  assert.equal(notRun.window, null);
});

test('the reading seat decides what a candidate may name: an account outside the seat is counted and withheld, never shown', () => {
  const a = attribute(synthState(), { readable: (id) => id === 'pm', nameOf: (id) => ({ fm: 'Fay Functional', pm: 'Priya Project' })[id] || id });
  const line = a.candidates.find((c) => c.family === 'line');
  const fm = line.link.accounts.find((x) => x.accountId === 'fm');
  assert.deepEqual([fm.name, fm.withheld, fm.moved], ['A line outside this seat', true, true], 'the drift fact survives; the identity does not');
});

/* --------------------------------------- Part B: through the real app */

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

function baseState() {
  const state = createEmptyState(ISO);
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
  state.reportingLines = [
    line('ln-sam', 'sam', 'pm', 'project', 40, '2026-01-01', [{ at: '2026-08-15T09:00:00.000Z', shareH: 20, rights: [] }]),
    line('ln-hal', 'hal', 'pm2', 'product', 25, '2026-08-01'),
    line('ln-pat', 'pat', 'fm', 'cross-functional', 10, '2026-01-01'),
  ];
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

const reportOf = (api) => { const r = api.chargebackPostingReport(); assert.equal(r.ok, true, r.error); return r.report; };

function agree(api, input) {
  const p = api.transferPricePropose({ actingSide: 'lender', ...input });
  assert.equal(p.ok, true, p.error);
  const c = api.transferPriceConfirm(p.id);
  assert.equal(c.ok, true, c.error);
  return p.id;
}

function priceInFull(api) {
  agree(api, { lenderId: 'fm', borrowerId: 'pm', currency: 'EUR', ratePerPersonDay: 600, basis: 'standard-cost', ...Q3 });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' });
  agree(api, { lenderId: 'fm', borrowerId: 'pm2', currency: 'EUR', ratePerPersonDay: 500, basis: 'negotiated', effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30' });
  agree(api, { lenderId: 'pm', borrowerId: 'fm', actingSide: 'lender', currency: 'USD', ratePerPersonDay: 300, basis: 'market-rate', ...Q3 });
}

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><main id="view"></main></body></html>');
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const prev = new Map(keys.map((k) => [k, globalThis[k]]));
  try {
    for (const k of keys) globalThis[k] = k === 'window' ? dom.window : k === 'document' ? dom.window.document : dom.window[k];
    return fn(dom);
  } finally {
    for (const [k, v] of prev) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
}

/**
 * Post the USD quarter, then move the record with a REAL dated act: ending
 * ln-pat at 2026-08-31 cuts pat's priced share from 920 to 620 share-days, so
 * the posted 276,000 cents re-derive as 186,000 on both the fm charge and the
 * pm credit — a drift of exactly -90,000 per side, with `matrix.line.ended`
 * on the log as the act that landed inside the window.
 */
function postedThenMoved() {
  const h = harness(baseState());
  priceInFull(h.api);
  const posted = h.api.chargebackPost({
    currency: 'USD',
    bindings: [{ accountId: 'fm', envelopeId: 'env-fm-usd' }, { accountId: 'pm', envelopeId: 'env-pm-usd' }],
  });
  assert.equal(posted.ok, true, posted.error);
  const before = reportOf(h.api).postings.find((p) => p.id === posted.id);
  assert.deepEqual([before.audit.verdict, before.audit.attribution.verdict], ['faithful', 'not-run'], 'a faithful posting has nothing to attribute');
  const ended = h.api.matrixEndLine({ id: 'ln-pat', reason: 'The cross-functional secondment to the functional line ended at the end of August.', toISO: '2026-08-31' });
  assert.equal(ended.ok, true, ended.error);
  return { ...h, posted };
}

test('a real line-end act becomes the candidate: the panel, the brief, CSV #146 and a reload all print the same figures, and nothing is invented', () => {
  const { store, api, storage, posted } = postedThenMoved();
  const report = reportOf(api);
  const p = report.postings.find((x) => x.id === posted.id);
  assert.equal(p.audit.verdict, 'drifted');
  const a = p.audit.attribution;
  assert.equal(a.verdict, 'attributed');
  assert.equal(a.countsReconcile, true);
  assert.equal(report.board.attributionsReconcile, true);
  assert.equal(report.board.attributionCountsReconcile, true);
  assert.equal(report.board.attributions['not-run'], 0);
  assert.equal(report.board.attributions.attributed, 1);

  /* The line-end act is on the log, and the record ties it to BOTH frozen
   * accounts: the account the line charges (fm) and pat’s home line (pm). */
  const endAct = a.candidates.find((c) => c.type === 'matrix.line.ended');
  assert.ok(endAct, a.candidates.map((c) => c.type).join(' | '));
  assert.equal(endAct.on, '2026-11-11');
  assert.equal(endAct.familyLabel, 'Reporting line');
  assert.deepEqual(endAct.link.accounts.map((x) => x.accountId), ['fm', 'pm']);
  assert.deepEqual(
    endAct.link.accounts.flatMap((x) => x.fields.map((f) => [x.name, f.field, f.postedCents, f.currentCents, f.deltaCents])).sort(),
    [['Fay Functional', 'charged', 276000, 186000, -90000], ['Priya Project', 'credited', 276000, 186000, -90000]].sort(),
    'the candidate carries the exact cents it sits beside: 920 → 620 share-days at 300',
  );
  assert.match(endAct.link.basis, /dated out/, 'the line’s own state is printed with the link');

  /* The fixture clock is one instant, so every act is inside the window and
   * unordered against the posting — printed as such, not silently ordered. */
  assert.equal(a.counts.windowEventsN, store.state.events.length, 'every event on the log sits inside the window on a one-instant fixture clock');
  assert.equal(a.counts.unorderedN, a.counts.candidatesN, 'and so no candidate can be ordered against the posting');
  assert.equal(a.coverage.state, 'covered');
  assert.match(a.detail, /cannot order them before or after it/);

  /* Nothing outside the declared families is listed, and the price events that
   * were scribed before the posting are candidates only because this clock
   * cannot order them — which is exactly what `unordered` says. */
  const priceCandidates = a.candidates.filter((c) => c.family === 'price');
  assert.ok(priceCandidates.every((c) => c.unordered), 'no candidate is claimed to postdate the posting on a clock that cannot say so');

  /* ---- the brief carries the same counts ---- */
  const brief = chargebackPostingBriefText(report);
  assert.match(brief, /Drift attribution: 1 drifted posting\(s\) with a record-linked candidate act, 0 with none, 0 REFUSED/);
  assert.match(brief, new RegExp(`${a.counts.linkedN} candidate act\\(s\\) tied to a frozen account`));

  const csv = exportWorkspaceCsv(store.state, 'chargeback-postings', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  const lines = csv.csv.trim().split(/\r?\n/);
  const cell = (rowIndex, key) => lines[rowIndex + 1].split(',')[CHARGEBACK_POSTING_CSV_COLUMNS.indexOf(key)];
  const postingRow = lines.findIndex((l, i) => i > 0 && l.startsWith('posting,')) - 1;
  assert.equal(cell(0, 'drift_attributed'), '1');
  assert.equal(cell(0, 'drift_no_candidates'), '0');
  assert.equal(cell(0, 'drift_attribution_refused'), '0');
  assert.equal(cell(0, 'drift_candidates'), String(a.counts.linkedN));
  assert.equal(cell(0, 'drift_candidates_linked'), String(a.counts.linkedN));
  assert.equal(cell(postingRow, 'drift_attribution'), 'attributed');
  assert.equal(cell(postingRow, 'drift_candidates'), String(a.counts.candidatesN));
  assert.equal(cell(postingRow, 'drift_candidates_linked'), String(a.counts.linkedN));
  assert.equal(cell(postingRow, 'drift_window_days'), String(a.window.days));
  assert.equal(cell(postingRow, 'drift_event_coverage'), 'covered');
  assert.doesNotMatch(csv.csv, /Fay|Priya|ev-|ln-pat|tpa-/, 'the export stays identity-free: no name, no act id, no line id');

  /* ---- the panel prints the block the reader computed ---- */
  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=postings'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const root = node.querySelector('[data-testid="matrix-chargeback-posting-panel"]');
    const block = root.querySelector(`[data-testid="cbp-attribution-${posted.id}"]`);
    assert.ok(block, 'the attribution block prints on the drifted posting card');
    assert.match(block.textContent, /Candidate acts on the record — CANDIDATES, not causes/);
    assert.match(block.textContent, /Reporting line/);
    assert.match(block.textContent, /Counts reconcile: yes/);
    assert.equal(root.querySelector('[data-testid="cbp-brief"]').textContent.split('\n').some((l) => l.startsWith('Drift attribution:')), true, 'the brief carries the attribution line');
  });

  /* ---- display == stored across a real reload ---- */
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  const again = harness(persisted);
  const reloaded = reportOf(again.api).postings.find((x) => x.id === posted.id);
  assert.deepEqual(reloaded.audit.attribution, a, 'the reload reproduces every attribution figure and candidate');
});

test('a drift with no act on the record is printed as no-candidates, never as a cause somebody is assumed to have caused', () => {
  const { store, api, posted } = postedThenMoved();
  // Keep the drift, keep a log that covers the window, and hold nothing in it:
  // the record can no longer tie ANY act to the moved accounts.
  store.state.events = [{ id: 'ev-old', ts: '2026-01-01T00:00:00.000Z', type: 'settings.updated', entity: 'workspace', entityId: 'workspace', summary: '' }];
  const report = reportOf(api);
  const p = report.postings.find((x) => x.id === posted.id);
  assert.equal(p.audit.verdict, 'drifted', 'the drift stands on its own evidence');
  const a = p.audit.attribution;
  assert.deepEqual([a.verdict, a.counts.windowEventsN, a.counts.linkedN, a.candidates.length], ['no-candidates', 0, 0, 0]);
  assert.equal(a.coverage.state, 'covered', 'the log reaches back past the posting, so this is a real empty, not a truncation');
  assert.match(a.reason, /not a statement that nothing happened/);
  assert.equal(report.board.attributions['no-candidates'], 1);
  assert.equal(report.board.attributionCountsReconcile, true);

  const csv = exportWorkspaceCsv(store.state, 'chargeback-postings', { now: NOW });
  const lines = csv.csv.trim().split(/\r?\n/);
  const cell = (rowIndex, key) => lines[rowIndex + 1].split(',')[CHARGEBACK_POSTING_CSV_COLUMNS.indexOf(key)];
  const postingRow = lines.findIndex((l, i) => i > 0 && l.startsWith('posting,')) - 1;
  assert.equal(cell(postingRow, 'drift_attribution'), 'no-candidates');

  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=postings'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const block = node.querySelector(`[data-testid="cbp-attribution-${posted.id}"]`);
    assert.match(block.textContent, /No candidate act on the record inside the window/);
    assert.equal(block.querySelector('table'), null);
  });
});

test('when the event log cannot cover the window the whole join is refused: panel, CSV and board say REFUSED instead of printing an empty list', () => {
  const { store, api, posted } = postedThenMoved();
  store.state.events = store.state.events.map((e) => ({ ...e, ts: '2026-11-12T00:00:00.000Z' }));
  const report = reportOf(api);
  const p = report.postings.find((x) => x.id === posted.id);
  assert.equal(p.audit.verdict, 'drifted', 'the drift is still exact; only the attribution is refused');
  assert.deepEqual([p.audit.attribution.verdict, p.audit.attribution.candidates.length], ['refused', 0]);
  assert.equal(report.board.attributions.refused, 1);
  assert.equal(report.board.attributionCandidatesN, 0);

  const csv = exportWorkspaceCsv(store.state, 'chargeback-postings', { now: NOW });
  const lines = csv.csv.trim().split(/\r?\n/);
  const cell = (rowIndex, key) => lines[rowIndex + 1].split(',')[CHARGEBACK_POSTING_CSV_COLUMNS.indexOf(key)];
  const postingRow = lines.findIndex((l, i) => i > 0 && l.startsWith('posting,')) - 1;
  assert.equal(cell(0, 'drift_attribution_refused'), '1');
  assert.equal(cell(postingRow, 'drift_attribution'), 'refused');
  assert.equal(cell(postingRow, 'drift_event_coverage'), 'refused');

  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=postings'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const block = node.querySelector(`[data-testid="cbp-attribution-${posted.id}"]`);
    assert.match(block.textContent, /Attribution REFUSED — the event log cannot cover the window/);
    assert.equal(block.querySelector('table'), null, 'a refused join prints no candidate table');
  });
});

test('a seat outside the frozen accounts reads the same candidate with the names withheld — the drift fact survives, the identity does not', () => {
  const { store, api, posted } = postedThenMoved();
  store.state.settings = { ...store.state.settings, activeSeatId: 'pm' };
  const report = reportOf(api);
  const a = report.postings.find((x) => x.id === posted.id).audit.attribution;
  assert.equal(a.verdict, 'attributed');
  const endAct = a.candidates.find((c) => c.type === 'matrix.line.ended');
  assert.ok(endAct);
  const fm = endAct.link.accounts.find((x) => x.accountId === 'fm');
  assert.deepEqual([fm.withheld, fm.name, fm.moved, fm.fields[0].deltaCents], [true, 'A line outside this seat', true, -90000]);
  assert.equal(report.board.attributionCountsReconcile, true);
  withDom(() => {
    const node = renderMatrix({
      state: store.state, api, query: new URLSearchParams('panel=postings'),
      now: NOW, navigate() {}, refresh() {}, toast() {},
    });
    const block = node.querySelector(`[data-testid="cbp-attribution-${posted.id}"]`);
    assert.match(block.textContent, /A line outside this seat/);
    assert.doesNotMatch(block.textContent, /Fay Functional/);
  });
});
