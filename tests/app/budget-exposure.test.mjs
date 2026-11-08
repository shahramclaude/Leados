/**
 * ADR-0136 — the span budget exposure roll-up (Schema v118 unchanged).
 *
 * The duty: a director allocating one envelope across five teams, or a VP
 * forecasting exposure across divisions, must be able to read the money position
 * of their own span PER CURRENCY, see WHICH branch holds the overrun, and be told
 * honestly where the ledger is unsound. This suite proves, against the real
 * schema, the real store/API and the real view:
 *
 *  - currencies are never pooled and never converted;
 *  - a declared-ceiling total says how many envelopes it covers, and headroom is
 *    refused (BLANK, never zero) when any active envelope has no ceiling;
 *  - every envelope is attributed to exactly one bucket or excluded with a
 *    printed reason, and an unowned envelope never lands in a span total;
 *  - spend with no recorded actual contributes zero and is counted as debt;
 *  - closed envelopes are counted and never summed;
 *  - the queue is bounded, deterministic under storage order, and dispatched
 *    worst-first;
 *  - above the declared detail ceiling the reading is counts and bands: no
 *    envelope name, no per-envelope amount;
 *  - the text ledger is deterministic and carries no person name;
 *  - the API read is seat-scoped on the RAW store, so a peer division's envelope
 *    is never in the reading, and it mutates nothing;
 *  - the span panel renders over real state with no dead end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { RECORD_CLASSES } from '../../app/core/domain/seatRegistry.js';
import { SAFE_READS } from '../../app/core/domain/accessGateway.js';
import {
  BUDGET_EXPOSURE_BANDS, BUDGET_EXPOSURE_FLOORS, BUDGET_EXPOSURE_LIMITS,
  BUDGET_EXPOSURE_METHOD, BUDGET_EXPOSURE_REASONS,
  buildBudgetExposure, budgetExposureBrief, budgetExposureText,
} from '../../app/core/domain/budgetExposure.js';
import { renderFinance } from '../../app/views/finance.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');

/* --------------------------------------------------------------- fixtures */

const line = (id, { status = 'committed', committedAmount = null, actualAmount = null, expectedOn = null, actualsDueOn = null, category = 'other', title = null } = {}) => ({
  id,
  title: title || `Line ${id}`,
  category,
  status,
  committedAmount,
  actualAmount,
  committedOn: '2026-10-01',
  expectedOn,
  spentOn: status === 'spent' ? '2026-10-15' : null,
  actualsDueOn,
});

const budget = (id, { name, currency = 'DKK', limit = null, ownerId = null, status = 'active', lines = [] } = {}) => ({
  id,
  name: name || `Envelope ${id}`,
  currency,
  limit,
  periodLabel: '2026-Q4',
  startsOn: '2026-10-01',
  endsOn: '2026-12-31',
  status,
  ownerId,
  note: '',
  lines,
});

const PEOPLE = [
  { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
  { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
  { id: 'dir2', name: 'Peer Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
  { id: 'mgrA', name: 'Ada Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
  { id: 'mgrB', name: 'Bo Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
  { id: 'mgrC', name: 'Cy Peer Manager', role: 'Manager', level: 'manager', managerId: 'dir2', status: 'active' },
  { id: 'icA', name: 'Ivy Analyst', role: 'Analyst', level: 'ic', managerId: 'mgrA', status: 'active' },
  { id: 'icB', name: 'Ken Builder', role: 'Builder', level: 'ic', managerId: 'mgrB', status: 'active' },
];

/** Two branches, one desk, one unowned root envelope, one tracking-only, a peer division, history and debt. */
const BUDGETS = () => [
  // Branch A — a breach (actuals + open commitments over the ceiling).
  budget('bud-a', {
    name: 'Platform delivery', currency: 'DKK', limit: 100000, ownerId: 'mgrA',
    lines: [line('a1', { status: 'spent', actualAmount: 50000, committedAmount: 50000 }), line('a2', { committedAmount: 60000 })],
  }),
  // Branch B — headroom, plus a watch-zone envelope.
  budget('bud-b', { name: 'Customer success', currency: 'DKK', limit: 200000, ownerId: 'mgrB', lines: [line('b1', { committedAmount: 40000 })] }),
  budget('bud-watch', { name: 'Support tooling', currency: 'DKK', limit: 10000, ownerId: 'mgrB', lines: [line('w1', { committedAmount: 8500 })] }),
  // Own desk — a breach in a SECOND currency that must never be pooled with DKK.
  budget('bud-desk', { name: "Director office", currency: 'EUR', limit: 50000, ownerId: 'dir1', lines: [line('d1', { committedAmount: 55000 })] }),
  // Branch A — spend with no recorded actual (evidence debt) and an unpriced open line.
  budget('bud-debt', {
    name: 'Vendor programme', currency: 'EUR', limit: 30000, ownerId: 'mgrA',
    lines: [line('e1', { status: 'spent', committedAmount: 7000 }), line('e2', { committedAmount: null })],
  }),
  // Tracking-only: no ceiling, so it can never be headroom and never a breach.
  budget('bud-track', { name: 'Discretionary pool', currency: 'DKK', limit: null, ownerId: 'mgrB', lines: [line('t1', { committedAmount: 1000 })] }),
  // No owner: the enterprise root's own envelope — counted, never attributed.
  budget('bud-root', { name: 'Enterprise reserve', currency: 'DKK', limit: 999999, ownerId: null, lines: [line('r1', { committedAmount: 999999 })] }),
  // A peer division's envelope: owned two spans away from the acting seat.
  budget('bud-peer', { name: 'Peer division', currency: 'DKK', limit: 80000, ownerId: 'mgrC', lines: [line('p1', { committedAmount: 70000 })] }),
  // History: closed envelopes are counted, never summed.
  budget('bud-old', { name: 'Last year', currency: 'DKK', limit: 50000, ownerId: 'mgrA', status: 'closed', lines: [line('o1', { committedAmount: 12345 })] }),
];

function stateWith(budgets = BUDGETS(), { activeSeatId = 'dir1', people = PEOPLE } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId };
  state.people = people;
  state.budgets = budgets;
  return normalizeState(state, { now: NOW }).state;
}

function seatsFor(state) {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  return { built, seat: activeSeat(built) };
}

function directorReport(state = stateWith()) {
  const { built, seat } = seatsFor(state);
  return { report: buildBudgetExposure(state, { now: NOW, seat, built }), seat, built };
}

function boot(state) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const now = () => NOW;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now, idFactory });
  store.load();
  return { store, api: createApi(store, { now, idFactory }) };
}

function bootDocument() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e?.message || e)));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div><div id="modal-root"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return { dom, errors };
}

const currencyRow = (report, code) => report.currencies.find((row) => row.currency === code);

/* ---------------------------------------------------------- vocabulary */

test('the floors, bands and methods are declared once and the reads are safe under a seat', () => {
  assert.equal(SCHEMA_VERSION, 118, 'no schema bump: the roll-up stores nothing');
  assert.equal(BUDGET_EXPOSURE_FLOORS.portfolioRank, RECORD_CLASSES.portfolio.minRank, 'the floor is the portfolio floor, not a private one');
  assert.equal(BUDGET_EXPOSURE_FLOORS.detailRank, RECORD_CLASSES.portfolio.detailCeiling, 'the ceiling is the declared detail ceiling');
  assert.deepEqual(Object.values(BUDGET_EXPOSURE_BANDS).sort(), ['over-ceiling', 'pipeline-breach', 'tracking-only', 'watch-zone', 'within-ceiling']);
  assert.equal(BUDGET_EXPOSURE_REASONS[0].key, 'breach', 'the worst reason dispatches first');
  assert.ok(BUDGET_EXPOSURE_METHOD.length >= 4);
  assert.match(BUDGET_EXPOSURE_METHOD.map((m) => m.name).join(' | '), /Encumbrance/);
  assert.match(BUDGET_EXPOSURE_METHOD.map((m) => m.name).join(' | '), /Anthony & Govindarajan|Responsibility-centre/);
  assert.match(BUDGET_EXPOSURE_METHOD.map((m) => m.name).join(' | '), /Goldratt/);
  for (const name of ['budgetExposureRead', 'budgetExposureText', 'budgetExposureBriefText']) {
    assert.ok(SAFE_READS.has(name), `${name} must be a SAFE_READ under enforcement`);
  }
});

/* ------------------------------------------------------------- the floor */

test('below the portfolio floor the reading is refused with the policy reason, not filled with zeros', () => {
  const state = stateWith(BUDGETS(), { activeSeatId: 'mgrA' });
  const { built, seat } = seatsFor(state);
  assert.equal(seat.rank, 2);
  const report = buildBudgetExposure(state, { now: NOW, seat, built });
  assert.equal(report.refused, true);
  assert.equal(report.ok, false);
  assert.match(report.refusals[0], /floor is rank 3/);
  assert.deepEqual(report.currencies, []);
  assert.deepEqual(report.queue, []);
  assert.equal(report.counts.breaches, 0, 'a refusal never reports a measured zero');
});

/* ------------------------------------------------ currencies and totals */

test('currencies are never pooled: each total is computed inside one currency only', () => {
  const { report } = directorReport();
  assert.equal(report.currencies.length, 2);
  assert.deepEqual(report.currencies.map((row) => row.currency), ['DKK', 'EUR']);
  const dkk = currencyRow(report, 'DKK');
  const eur = currencyRow(report, 'EUR');
  // DKK attributable: bud-a 150000 forecast, bud-b 40000, bud-watch 8500, bud-track 1000. NOT bud-root, NOT bud-peer, NOT bud-old.
  assert.equal(dkk.forecast, 159500);
  assert.equal(dkk.actuals, 50000);
  assert.equal(dkk.committed, 109500);
  // EUR attributable: bud-desk 55000, bud-debt 0 (spend with no actual contributes nothing).
  assert.equal(eur.forecast, 55000);
  assert.equal(eur.actuals, 0, 'spend with no recorded actual is never counted as spend');
  const text = budgetExposureText(report);
  assert.ok(!/DKK.*EUR|EUR.*DKK/.test(text.split('PER CURRENCY')[1].split('BY BRANCH')[0].split('\n').slice(0, 2).join(' ')), 'no line mixes two currencies');
});

test('a ceiling total says what it covers, and headroom is BLANK when an envelope carries no ceiling', () => {
  const { report } = directorReport();
  const dkk = currencyRow(report, 'DKK');
  assert.equal(dkk.ceilingsCovered, 3);
  assert.equal(dkk.envelopes, 4, 'the tracking-only envelope is counted in the denominator');
  assert.equal(dkk.ceiling, 310000, 'declared ceilings only: 100000 + 200000 + 10000');
  assert.equal(dkk.complete, false);
  assert.equal(dkk.headroom, null, 'BLANK, never zero and never the ceiling minus a partial forecast');
  assert.match(dkk.headroomReason, /carry no declared ceiling/);
  const eur = currencyRow(report, 'EUR');
  assert.equal(eur.complete, true);
  assert.equal(eur.headroom, null, 'missing actual and price cannot be treated as available funds');
  assert.match(eur.headroomReason, /without recorded actuals/);
  assert.match(eur.headroomReason, /have no price/);
  assert.ok(report.refusals.some((r) => /headroom cannot be computed/i.test(r)));
});

test('headroom follows actual and priced evidence through real finance writes, by branch and currency', () => {
  const state = stateWith([
    budget('gaps', { currency: 'EUR', limit: 100, ownerId: 'mgrA', lines: [
      line('spent', { status: 'spent', committedAmount: 20 }),
      line('open', { status: 'committed' }),
      line('plan', { status: 'planned' }),
    ] }),
    budget('sound', { currency: 'EUR', limit: 200, ownerId: 'mgrB', lines: [line('known', { committedAmount: 30 })] }),
    budget('other', { currency: 'DKK', limit: 100, ownerId: 'mgrA', lines: [line('priced', { committedAmount: 40 })] }),
  ]);
  const { store, api } = boot(state);
  let report = api.budgetExposureRead();
  let eur = currencyRow(report, 'EUR');
  assert.equal(eur.forecast, 30, 'known subtotal remains visible');
  assert.equal(eur.headroom, null);
  assert.match(eur.headroomReason, /without recorded actuals/);
  assert.match(eur.headroomReason, /2 open line/);
  assert.equal(currencyRow(report, 'DKK').headroom, 60, 'other currency is independent');
  assert.equal(report.branches.find((b) => b.label === 'Ada Manager').currencies.find((c) => c.currency === 'EUR').headroom, null);
  assert.equal(report.branches.find((b) => b.label === 'Bo Manager').currencies[0].headroom, 170, 'sound sibling is independent');
  assert.match(api.budgetExposureText().text, /headroom BLANK/);
  assert.match(api.budgetExposureBriefText().text, /headroom blank/);

  assert.equal(api.setActiveSeat('vp1').ok, true, 'capital writes require the VP authority floor');
  assert.equal(api.recordBudgetActual('gaps', 'spent', { actualAmount: 15 }).ok, true);
  assert.equal(api.updateBudgetLine('gaps', 'open', { committedAmount: 10 }).ok, true);
  report = api.budgetExposureRead();
  eur = currencyRow(report, 'EUR');
  assert.equal(eur.headroom, null, 'unpriced planned line conservatively blocks headroom');
  assert.match(eur.headroomReason, /including planned lines/);
  assert.equal(api.updateBudgetLine('gaps', 'plan', { committedAmount: 5 }).ok, true);
  report = api.budgetExposureRead();
  assert.equal(currencyRow(report, 'EUR').headroom, 245, 'priced planned pipeline is not part of FAC');
  assert.ok(store.state.events.some((e) => e.type === 'budget.lineUpdated'), 'normal finance events still fire');
});

/* ---------------------------------------------------------- attribution */

test('every envelope lands in exactly one bucket, and an unowned envelope never enters a span total', () => {
  const { report } = directorReport();
  assert.equal(report.counts.active, 8);
  assert.equal(report.counts.inactive, 1, 'the closed envelope is counted');
  assert.equal(report.counts.unowned, 1);
  assert.equal(report.counts.outOfSpan, 1);
  assert.equal(report.counts.ambiguous, 0);
  assert.equal(report.counts.attributed, 6);
  assert.equal(report.counts.attributed + report.counts.unowned + report.counts.outOfSpan + report.counts.inactive, report.counts.envelopes);
  // Two direct branches plus the acting seat's own desk.
  assert.equal(report.branches.length, 3);
  const branchA = report.branches.find((row) => row.label === 'Ada Manager');
  const branchB = report.branches.find((row) => row.label === 'Bo Manager');
  const desk = report.branches.find((row) => row.ownDesk);
  assert.ok(branchA && branchA.position === 1, 'branch positions are deterministic and bounded');
  assert.ok(branchB && branchB.position === 2);
  assert.equal(branchA.envelopes, 2);
  assert.equal(branchA.breaches, 1);
  assert.equal(branchB.envelopes, 3);
  assert.equal(desk.envelopes, 1);
  // The enterprise reserve (999999) and the peer division (70000) are absent from every currency total.
  const dkk = currencyRow(report, 'DKK');
  assert.equal(dkk.forecast, 159500, 'the enterprise reserve and the peer division are not in the total');
  assert.ok(!report.branches.some((row) => row.label === 'Enterprise reserve'));
  assert.equal(report.excluded.find((row) => row.bucket === 'unowned').currency, 'DKK');
  assert.match(report.refusals.join(' '), /belongs to the enterprise root/);
  assert.match(report.refusals.join(' '), /outside this seat’s span/);
});

test('the ledger is unsound where it is unsound: spend without actual, unpriced lines, and no ceiling', () => {
  const { report } = directorReport();
  assert.equal(report.counts.evidenceDebt, 1, 'the EUR envelope marked spent with no actual');
  assert.equal(report.counts.unpricedEnvelopes, 1, 'the open line with no committed amount');
  assert.equal(report.counts.untracked, 1, 'the tracking-only envelope');
  assert.equal(report.counts.measured, 7, 'seven of the eight active envelopes carry a declared ceiling');
  const consumer = report.queue.find((row) => row.currency === 'EUR' && row.reasonKey !== 'breach');
  assert.ok(consumer, 'the debt envelope is queued');
  assert.match(consumer.reasons.map((r) => r.text).join(' '), /no recorded actual/);
});

/* --------------------------------------------------------------- queue */

test('the queue is bounded, worst-first and deterministic under storage order', () => {
  const { report } = directorReport();
  assert.equal(report.queue[0].reasonKey, 'breach');
  assert.equal(report.queue[0].currency, 'DKK', 'equal utilisation breaks the tie by currency, then id');
  assert.equal(report.queue[1].reasonKey, 'breach');
  assert.equal(report.queue[1].currency, 'EUR');
  const order = report.queue.map((row) => row.reasonKey);
  const firstWatch = order.indexOf('watch');
  const firstDebt = order.indexOf('evidence-debt');
  const firstUntracked = order.indexOf('untracked');
  assert.ok(firstWatch > 1 && firstDebt > firstWatch && firstUntracked > firstDebt, `reason families dispatch worst-first: ${order.join(',')}`);

  // Storage order must not change the reading.
  const reversed = stateWith([...BUDGETS()].reverse());
  const { report: reversedReport } = directorReport(reversed);
  assert.deepEqual(reversedReport.queue.map((row) => row.budgetId), report.queue.map((row) => row.budgetId));
  assert.deepEqual(reversedReport.currencies, report.currencies);

  // The cap is honoured and the remainder counted, never dropped silently.
  const capped = (() => {
    const state = stateWith();
    const { built, seat } = seatsFor(state);
    return buildBudgetExposure(state, { now: NOW, seat, built, queueCap: 2 });
  })();
  assert.equal(capped.queue.length, 2);
  assert.equal(capped.queueDeferred, report.queue.length - 2);
  assert.ok(capped.queueDeferred > 0);
  assert.match(budgetExposureText(capped), /further row\(s\) beyond the queue cap/);
});

/* ------------------------------------------------------- detail ceiling */

test('above the declared detail ceiling the reading is counts and bands, never a named envelope', () => {
  const state = stateWith(BUDGETS(), { activeSeatId: 'vp1' });
  const { built, seat } = seatsFor(state);
  assert.equal(seat.rank, 4, 'the VP is at the detail ceiling, so full detail still applies');
  const vp = buildBudgetExposure(state, { now: NOW, seat, built });
  assert.equal(vp.detail, 'full');
  assert.ok(vp.queue.some((row) => row.name === 'Platform delivery'));

  const chiefState = stateWith(BUDGETS(), { activeSeatId: 'vp1' });
  const chiefBuilt = buildSeats(chiefState, { now: NOW, settings: chiefState.settings });
  const chief = { ...activeSeat(chiefBuilt), rank: 5, altitudeKey: 'chief', label: 'Chief / C-suite' };
  const report = buildBudgetExposure(chiefState, { now: NOW, seat: chief, built: chiefBuilt });
  assert.equal(report.detail, 'aggregate');
  for (const row of report.queue) {
    assert.equal(row.name, null, 'no envelope name above the detail ceiling');
    assert.equal(row.ceiling, null, 'no per-envelope amount above the detail ceiling');
    assert.equal(row.forecast, null);
    assert.ok(row.band);
  }
  for (const branch of report.branches) {
    assert.match(branch.label, /^(Branch \d+|Own desk|Whole workspace)/, 'branches are anonymous positions above the ceiling');
  }
  assert.ok(report.currencies.length, 'the currency aggregate survives: it is the enterprise total, not item detail');
  assert.match(report.refusals.join(' '), /item detail and are withheld/);
  assert.match(budgetExposureBrief(report), /counts only/);
});

/* ------------------------------------------------------------ the text */

test('the ledger text and the brief are deterministic and carry no person name', () => {
  const { report } = directorReport();
  const first = budgetExposureText(report);
  const { report: again } = directorReport(stateWith([...BUDGETS()].reverse()));
  assert.equal(budgetExposureText(again), first, 'the ledger is order-independent');
  assert.match(first, /SPAN BUDGET EXPOSURE/);
  assert.match(first, /PER CURRENCY — never pooled/);
  assert.match(first, /BY BRANCH/);
  assert.match(first, /REVIEW QUEUE/);
  // Full detail names the branch that holds the authority (org structure the
  // director already reads on the People screen) — and nothing below it.
  assert.match(first, /Ada Manager/, 'the branch that holds the authority is named at full detail');
  for (const person of PEOPLE.filter((p) => !['dir1', 'mgrA', 'mgrB'].includes(p.id))) {
    assert.ok(!first.includes(person.name), `the ledger must never carry the name ${person.name}`);
  }
  // The upward brief is identity-free by construction: counts and currency
  // totals only, never a branch or a person.
  const brief = budgetExposureBrief(report);
  assert.match(brief, /Money: \d+ active envelope/);
  assert.match(brief, /No netting across currencies or branches/);
  assert.ok(!PEOPLE.some((person) => brief.includes(person.name)), 'the brief carries no person name at all');
});

test('a workspace with no envelope refuses instead of reporting zero movement', () => {
  const state = stateWith([]);
  const { built, seat } = seatsFor(state);
  const report = buildBudgetExposure(state, { now: NOW, seat, built });
  assert.equal(report.refused, false);
  assert.equal(report.counts.active, 0);
  assert.deepEqual(report.currencies, []);
  assert.match(report.refusals[0], /No active budget envelope is readable/);
  assert.match(budgetExposureBrief(report), /nothing has been measured/);
  assert.match(budgetExposureText(report), /no attributable active envelope/);
});

test('an absent amount survives a reload as ABSENT: spent-without-actual and unpriced lines stay visible gaps', () => {
  // Reproduced before the repair: `Number(null) === 0`, so `normalizeBudgets`
  // wrote a spent line with no recorded actual as a spend of ZERO and a blank
  // commitment as a priced commitment of zero. `evaluateBudget`'s
  // missingActualLines / unpricedOpenCount branches then never fired again, and
  // the commitment-calibration ledger scored a fake perfect underspend.
  const raw = stateWith();
  const budgetLine = raw.budgets.find((b) => b.id === 'bud-debt').lines[0];
  const unpriced = raw.budgets.find((b) => b.id === 'bud-debt').lines[1];
  assert.equal(budgetLine.actualAmount, null, 'a spent line with no evidence keeps a blank actual');
  assert.equal(unpriced.committedAmount, null, 'a blank commitment stays unpriced, not zero');
  // A second round trip (what a reload does) must not change either fact.
  const reloaded = normalizeState(JSON.parse(JSON.stringify(raw)), { now: NOW }).state;
  assert.equal(reloaded.budgets.find((b) => b.id === 'bud-debt').lines[0].actualAmount, null);
  assert.equal(reloaded.budgets.find((b) => b.id === 'bud-debt').lines[1].committedAmount, null);
  const { built, seat } = seatsFor(reloaded);
  const report = buildBudgetExposure(reloaded, { now: NOW, seat, built });
  assert.equal(report.counts.evidenceDebt, 1, 'the debt is still a debt after the reload');
  assert.equal(report.counts.unpricedEnvelopes, 1, 'the unpriced line is still unpriced after the reload');
});

/* ------------------------------------------------------------ the API */

test('the API read is seat-scoped on the raw store and mutates nothing', () => {
  const state = stateWith();
  const { store, api } = boot(state);
  const before = JSON.stringify(store.state.budgets);
  const report = api.budgetExposureRead();
  assert.equal(report.detail, 'full');
  assert.equal(report.counts.outOfSpan, 0, 'the seat never even receives the peer division envelope');
  assert.equal(report.counts.unowned, 1, 'an unowned envelope is readable but excluded from every total');
  const dkk = currencyRow(report, 'DKK');
  assert.equal(dkk.forecast, 159500, 'the peer division envelope is not in the total');
  assert.ok(!report.branches.some((b) => b.label === 'Cy Peer Manager'));
  assert.equal(JSON.stringify(store.state.budgets), before, 'a read never writes');
  const text = api.budgetExposureText();
  assert.equal(text.ok, true);
  assert.match(text.text, /SPAN BUDGET EXPOSURE/);
  const brief = api.budgetExposureBriefText();
  assert.match(brief.text, /No netting/);
});

/* ------------------------------------------------------------ the view */

test('the span panel renders over real state with no dead end', () => {
  const { dom, errors } = bootDocument();
  try {
    const state = stateWith();
    const { built, seat } = seatsFor(state);
    const { api } = boot(state);
    const ctx = {
      api,
      now: NOW,
      state,
      query: new URLSearchParams('panel=span'),
      navigate: () => {},
      refresh: () => {},
      seatContext: { built, seat },
    };
    const node = renderFinance(ctx);
    assert.equal(node.tagName, 'DIV');
    assert.equal(node.querySelector('main'), null, 'no duplicate main landmark');
    const text = node.textContent;
    assert.match(text, /Span budget exposure/);
    assert.match(text, /Position by currency/);
    assert.match(text, /Headroom cannot be computed for EUR/);
    assert.match(text, /Recorded forecasts exclude missing amounts/);
    assert.match(text, /By branch/);
    assert.match(text, /Review queue/);
    assert.match(text, /No netting|does not net|transfer of authority/);
    assert.match(text, /Ada Manager/, 'a director reads the branch that holds the authority');
    assert.match(text, /Platform delivery/);
    assert.ok(!text.includes('Peer division'), 'the peer division envelope is never rendered at this seat');
    assert.ok(!text.includes('Rina VP'), 'no person name above the branch label');
    const tables = node.querySelectorAll('table');
    assert.ok(tables.length >= 3, 'currency, branch and queue tables all render');
    for (const button of node.querySelectorAll('button')) {
      assert.ok((button.textContent || '').trim().length > 0 || button.getAttribute('aria-label'), 'every button has a name');
    }
    assert.deepEqual(errors, []);

    // The default panel is unchanged and still carries the envelope list.
    const envelopes = renderFinance({ ...ctx, query: new URLSearchParams('') });
    assert.match(envelopes.textContent, /Forecast breaches/);
    assert.match(envelopes.textContent, /Span exposure/, 'the panel switch is reachable from the envelope list');
  } finally {
    dom.window.close();
  }
});
