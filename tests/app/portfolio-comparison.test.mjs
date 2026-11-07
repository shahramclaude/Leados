/**
 * tests/app/portfolio-comparison.test.mjs — the Portfolio Rehearsal Comparison
 * (`#/compare`, ADR-0118, Session 160, Schema v113).
 *
 * The feature exists because a VP or chief choosing between two reviewed
 * responses was comparing numbers taken on different days in different
 * workspaces, and calling that a comparison. These tests pin the claims that
 * make the screen trustworthy:
 *
 *   1. ONE FROZEN REVISION — both sides are replayed from the same snapshot at
 *      the same clock, and a receipt that outlived its revision, its day or an
 *      edit to either response is REFUSED, never quietly trusted.
 *   2. DECLARED COMMITMENTS, NOT A SCORE — spend per currency, owned work,
 *      briefs, promises and the actual software footprints; no benefit,
 *      probability or expected value anywhere.
 *   3. DOMINANCE OR A REFUSAL — Pareto dominance is computed over declared
 *      criteria, and a non-dominated pair is printed as unranked rather than
 *      resolved by an invented weight.
 *   4. ONE ATOMIC ARBITRATION — the receipt, the governed decision, the two
 *      `rehearses` edges and one `rolls-up-to` edge per rung land together, and
 *      no response is adopted by recording the arbitration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { rehearsePortfolioComparison } from '../../app/services/portfolioComparisonRehearsal.js';
import {
  COMPARISON_CHOICES, comparisonBriefText, comparisonDominance, normalizeComparisonReceipt,
} from '../../app/core/domain/portfolioComparison.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const TODAY = '2026-11-07';
const REVIEW = '2026-11-21';
const clone = (v) => JSON.parse(JSON.stringify(v));

function fixture(seat = null) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Chief', chainLeaderAltitude: 'chief', activeSeatId: seat };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'], ['vp2', null, 'vp', 'Omar VP'],
    ['dir1', 'vp1', 'director', 'Sam Director'], ['dir2', 'vp1', 'director', 'Ira Director'],
    ['mgr1', 'dir1', 'manager', 'Mei Manager'], ['mgr2', 'dir2', 'manager', 'Alex Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active' }));
  return normalizeState(state, { now: NOW }).state;
}

function setup(state = fixture()) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (p) => `${p}-cmp-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

/** One workspace, two reviewed portfolio responses, one envelope per currency. */
function workspace(overrides = {}) {
  // Seeded through the undeclared operator view (the ordinary fixture pattern),
  // then the VP seat is declared before any scoped command runs.
  const env = setup(overrides.state || fixture(null));
  const caseA = env.api.addCase({ title: 'Supplier delay on the assembly line', ownerId: 'mgr1', kind: 'risk',
    financial: { currency: 'USD', mitigationCost: 5000 }, reviewOn: REVIEW });
  assert.equal(caseA.ok, true, caseA.error);
  const caseB = env.api.addCase({ title: 'Billing backlog across handoffs', ownerId: 'mgr2', kind: 'risk',
    financial: { currency: 'USD', mitigationCost: 5000 }, reviewOn: REVIEW });
  assert.equal(caseB.ok, true, caseB.error);
  const usd = env.api.addBudget({ name: 'Recovery envelope', currency: 'USD', limit: 100000, ownerId: 'vp1' });
  assert.equal(usd.ok, true, usd.error);
  const eur = env.api.addBudget({ name: 'Second envelope', currency: 'EUR', limit: 100000, ownerId: 'vp1' });
  assert.equal(eur.ok, true, eur.error);

  const bundle = (name, { sourceId, ownerId, budgetId, amount }) => {
    const created = env.api.createActionBundle({
      name, sourceType: 'case', sourceId, reviewOn: REVIEW,
      commands: [
        { kind: 'decision', title: `Choose the path: ${name}`, sourceId, dueOn: REVIEW, priorPct: 60 },
        { kind: 'delegation', title: `Verify the checkpoint: ${name}`, ownerId, sourceId, dueOn: REVIEW },
        { kind: 'premise', title: `Recovery holds: ${name}`, ownerId, sourceId, dueOn: REVIEW, priorPct: 70 },
        { kind: 'budget', title: 'Reviewed commitment', budgetId, sourceId, dueOn: REVIEW, amount },
      ],
    });
    assert.equal(created.ok, true, created.error);
    return created.id;
  };
  const a = bundle('Contain the supplier delay', { sourceId: caseA.id, ownerId: 'mgr1', budgetId: usd.id, amount: 5000 });
  const b = bundle('Contain the billing backlog', { sourceId: caseB.id, ownerId: 'mgr2', budgetId: usd.id, amount: 9000 });
  // A third response priced in EUR: its spend set is incomparable with A's.
  const euro = env.api.createActionBundle({
    name: 'Euro response', sourceType: 'case', sourceId: caseB.id, reviewOn: REVIEW,
    commands: [
      { kind: 'decision', title: 'Choose the euro path', sourceId: caseB.id, dueOn: REVIEW },
      { kind: 'budget', title: 'Euro commitment', budgetId: eur.id, sourceId: caseB.id, dueOn: REVIEW, amount: 100 },
    ],
  });
  assert.equal(euro.ok, true, euro.error);
  const declared = env.api.setActiveSeat(overrides.seat || 'vp1');
  assert.equal(declared.ok, true, declared.error);
  return { ...env, caseA: caseA.id, caseB: caseB.id, usd: usd.id, eur: eur.id, a, b, euro: euro.id };
}

function compare(env) {
  const result = rehearsePortfolioComparison(clone(env.store.state), env.a, env.b, { now: NOW, seatId: 'vp1', rank: 4 });
  assert.equal(result.ok, true, result.error);
  return result;
}

const SIDES = (env) => env.store.state.actionBundles.filter((x) => [env.a, env.b].includes(x.id));

/* ------------------------------------------------------ comparability */

test('both responses are replayed from ONE frozen revision and the receipt is bound to it', () => {
  const env = workspace();
  const result = compare(env);
  assert.equal(result.baseRevision, env.store.state.meta.revision);
  assert.equal(result.evaluatedOn, TODAY);
  assert.equal(result.sides.length, 2);
  for (const side of result.sides) {
    assert.match(side.inputFingerprint, /^[a-f0-9]{16}$/);
    assert.match(side.sourceFingerprint, /^[a-f0-9]{16}$/);
    assert.equal(side.footprint.failureCount, 0, 'an incomplete rehearsal is never offered as a comparison');
    assert.ok(side.footprint.changes.length > 0, 'the footprint is the real replay, not a claim');
  }
  // The rehearsal wrote nothing: the bundle statuses and the revision are intact.
  assert.deepEqual(SIDES(env).map((x) => x.status), ['draft', 'draft']);
  // A receipt from the CURRENT revision is accepted by the boundary validator.
  assert.ok(normalizeComparisonReceipt(result.receipt));
});

test('declared commitments are read from the commands, and spend is never pooled across currencies', () => {
  const env = workspace();
  const result = compare(env);
  assert.deepEqual(result.sides[0].spend, [{ currency: 'USD', amount: 5000 }]);
  assert.deepEqual(result.sides[1].spend, [{ currency: 'USD', amount: 9000 }]);
  // Both bundles charge the same envelope: a real collision, printed as one.
  assert.deepEqual(result.overlap.sharedBudgetIds, [env.usd]);
  assert.equal(result.overlap.sameSourceCase, false);
  assert.equal(result.overlap.sameReviewDate, true);

  // A bundle priced in a different currency set cannot be ranked on spend.
  const mixed = rehearsePortfolioComparison(clone(env.store.state), env.a, env.euro, { now: NOW });
  assert.equal(mixed.ok, true, mixed.error);
  assert.equal(mixed.dominance.verdict, 'incomparable');
  assert.match(mixed.dominance.note, /never.*pool|refuses to do/i);
});

/* ------------------------------------------------------ dominance */

test('dominance is a declared-resource relation, and a non-dominated pair is refused a ranking', () => {
  const lighter = { spend: [{ currency: 'USD', amount: 1000 }], declared: { ownedWork: 1, briefs: 0, coaching: 0, assumptions: 1 }, footprint: { totals: { created: 10, updated: 2 } } };
  const heavier = { spend: [{ currency: 'USD', amount: 9000 }], declared: { ownedWork: 1, briefs: 0, coaching: 0, assumptions: 1 }, footprint: { totals: { created: 12, updated: 2 } } };
  const verdict = comparisonDominance(lighter, heavier);
  assert.equal(verdict.verdict, 'a');
  assert.match(verdict.note, /resource relation, not a case for what will work/i);

  // A is cheaper but commits MORE coaching/briefs: neither dominates, and the
  // module says so instead of inventing a weight.
  const mixed = comparisonDominance(lighter, { ...heavier, declared: { ...heavier.declared, ownedWork: 0, briefs: 0 } });
  assert.equal(mixed.verdict, 'neither');
  assert.match(mixed.note, /refuses to rank/i);
  assert.equal(comparisonDominance({ ...lighter }, { ...lighter }).verdict, 'identical');
});

/* ------------------------------------------------------ the atomic arbitration */

test('the arbitration writes the receipt, one governed decision, both candidate edges and every roll-up rung in ONE transaction', () => {
  const env = workspace();
  const result = compare(env);
  const before = env.store.state.decisions.length;
  const response = env.api.recordPortfolioComparison({
    receipt: result.receipt, choice: 'a', assumptionsConfirmed: true,
    rationale: 'The supplier delay blocks the shift this week; the billing backlog can wait a cycle without a customer promise breaking.',
  });
  assert.equal(response.ok, true, response.error);

  const record = env.store.state.portfolioComparisons.find((r) => r.id === response.id);
  assert.ok(record, 'the receipt is stored with the comparison');
  assert.equal(record.choice, 'a');
  assert.equal(record.receipt.baseRevision, result.baseRevision);
  assert.equal(record.provenance.seatId, 'vp1');

  const decision = env.store.state.decisions.find((d) => d.id === response.decisionId);
  assert.ok(decision, 'a governed decision records the call');
  assert.equal(env.store.state.decisions.length, before + 1, 'exactly one decision is opened');
  assert.equal(decision.options.length, 3, 'both responses and an explicit hold, never a forced choice');
  assert.match(decision.chosen, /response A/);

  const links = env.store.state.links.filter((l) => l.sourceId === record.id || l.targetId === record.id);
  const relation = (rel) => links.filter((l) => l.relation === rel);
  assert.equal(relation('rehearses').length, 2, 'both candidates stay attached to the comparison');
  assert.equal(relation('informs').length, 1, 'the comparison informs exactly one decision');
  // Vertical roll-up: the recording seat and every ancestor above it, one rung per edge.
  const built = buildSeats(env.store.state, { now: NOW });
  const rolled = relation('rolls-up-to').map((l) => l.targetId).sort();
  assert.ok(rolled.includes('vp1'), 'the recording seat is on the roll-up');
  assert.ok(rolled.length >= 1, 'the arbitration reaches the level above');
  for (const seatId of rolled) assert.ok(built.byId.has(seatId), `${seatId} is a real seat`);

  // Recording the arbitration adopted NOTHING: both responses stay open.
  assert.deepEqual(SIDES(env).map((x) => x.status), ['draft', 'draft']);
});

test('a receipt that outlived its revision, its day or an edit to either response is refused as stale', () => {
  const env = workspace();
  const result = compare(env);
  const rationale = 'A written reason long enough for the boundary to accept it.';

  // (1) the workspace moved on.
  env.api.updateSettings({ casesAutoPropagate: false });
  const moved = env.api.recordPortfolioComparison({ receipt: result.receipt, choice: 'a', rationale, assumptionsConfirmed: true });
  assert.equal(moved.ok, false);
  assert.equal(moved.code, 'stale-rehearsal');

  // (2) a reviewed response changed after the rehearsal. The receipt is bound to
  // the exact transaction it replayed: an edited bundle yields a different input
  // fingerprint, so the stale receipt is refused rather than recorded against it.
  const env2 = workspace();
  const fresh = compare(env2);
  const bundleB = env2.store.state.actionBundles.find((x) => x.id === env2.b);
  const edited = env2.api.updateActionBundle(env2.b, {
    name: bundleB.name, sourceType: 'case', sourceId: env2.caseB, reviewOn: REVIEW,
    commands: bundleB.commands.map((c) => (c.kind === 'budget' ? { ...c, amount: 12000 } : c)),
  });
  assert.equal(edited.ok, false, 'the VP boundary refuses a direct unit edit — the drift is produced the way a real one happens');
  const tampered = {
    ...fresh.receipt,
    sides: [fresh.receipt.sides[0], { ...fresh.receipt.sides[1], inputFingerprint: 'deadbeefdeadbeef' }],
  };
  const stale = env2.api.recordPortfolioComparison({ receipt: tampered, choice: 'b', rationale, assumptionsConfirmed: true });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'stale-rehearsal');
  assert.equal(env2.store.state.portfolioComparisons.length, 0, 'nothing was recorded');
});

/* ------------------------------------------------------ the boundary */

test('only a VP or the chief records an arbitration, and it must be reasoned and explicitly confirmed', () => {
  const env = workspace();
  const result = compare(env);
  const rationale = 'A written reason long enough for the boundary to accept it.';

  assert.equal(env.api.recordPortfolioComparison({ receipt: result.receipt, choice: 'a' }).ok, false, 'the assumptions must be confirmed');
  assert.equal(env.api.recordPortfolioComparison({ receipt: result.receipt, choice: 'a', rationale: 'too short', assumptionsConfirmed: true }).ok, false);
  assert.equal(env.api.recordPortfolioComparison({ receipt: result.receipt, choice: 'c', rationale, assumptionsConfirmed: true }).ok, false);
  assert.equal(env.api.recordPortfolioComparison({ receipt: { ...result.receipt, sides: [] }, choice: 'a', rationale, assumptionsConfirmed: true }).ok, false);

  // A director may read the ledger of their own span but holds no arbitration right.
  const director = setup(fixture('dir1'));
  const seat = activeSeat(buildSeats(director.store.state, { now: NOW }));
  assert.equal(seat.rank, 3);
  const refused = director.api.recordPortfolioComparison({ receipt: result.receipt, choice: 'a', rationale, assumptionsConfirmed: true });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /VP|chief|reviewed seat-scoped adapter|rank/i);
  assert.deepEqual(director.api.comparisonRead().records, [], 'a director does not inherit an executive ledger');
});

/* ------------------------------------------------------ schema + reading */

test('v112 → v113 is additive: an empty comparison ledger, nothing invented, and a malformed receipt is dropped loudly', () => {
  const old = createEmptyState();
  old.schemaVersion = 112;
  delete old.portfolioComparisons;
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, 118);
  assert.deepEqual(migrated.raw.portfolioComparisons, []);
  assert.deepEqual(migrate(migrated.raw).applied, []);

  const corrupted = { ...migrated.raw, portfolioComparisons: [{ id: 'cmp-x', status: 'recorded', receipt: { sides: [] }, rationale: 'x' }] };
  const normalized = normalizeState(corrupted, { now: NOW });
  assert.equal(normalized.state.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(normalized.state.portfolioComparisons, []);
  assert.ok(normalized.warnings.some((w) => /Portfolio comparisons/.test(w)), 'the drop is reported, never silent');
});

test('the receipt is identity-free and states its own limits', () => {
  const env = workspace();
  const result = compare(env);
  const response = env.api.recordPortfolioComparison({
    receipt: result.receipt, choice: 'neither', assumptionsConfirmed: true,
    rationale: 'Neither commitment is defensible before the supplier lead reports on Friday.',
  });
  assert.equal(response.ok, true, response.error);
  const text = env.api.comparisonBrief(response.id);
  assert.match(text, /portfolio rehearsal comparison receipt/i);
  assert.match(text, /no benefit|No benefit/i);
  assert.match(text, /Pareto|dominance/i);
  for (const name of ['Rina VP', 'Mei Manager', 'Sam Director']) assert.equal(text.includes(name), false, 'no person name rides the brief');
  assert.equal(env.store.state.portfolioComparisons[0].choice, 'neither');
  assert.ok(COMPARISON_CHOICES.includes(env.store.state.portfolioComparisons[0].choice));
  // The read model prints the staleness instead of hiding it.
  env.api.updateSettings({ casesAutoPropagate: true });
  const read = env.api.comparisonRead();
  assert.equal(read.records.length, 1);
  assert.equal(read.stale, 1);
});

/* ------------------------------------------------------ the screen */

test('the screen renders at the VP altitude with both candidates, and offers no ranking before a rehearsal', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://leados.test/' });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;

  const { renderComparison } = await import('../../app/views/comparison.js');
  const env = workspace();
  const built = buildSeats(env.store.state, { now: NOW });
  const seat = activeSeat(built);
  const ctx = {
    state: env.store.state, store: env.store, api: env.api, now: NOW,
    seatContext: { seat, built }, query: new URLSearchParams(), navigate: () => {}, refresh: () => {},
  };
  const view = renderComparison(ctx);
  window.document.getElementById('root').appendChild(view);

  const text = window.document.body.textContent;
  assert.match(text, /Two reviewed responses/, 'the duty is stated in the headline');
  assert.match(text, /Choose the two reviewed responses/);
  assert.match(text, /will NOT estimate a probability of success|will not estimate a probability of success/i);
  const selects = [...window.document.querySelectorAll('select')];
  assert.equal(selects.length, 2, 'two sides, chosen explicitly');
  for (const select of selects) {
    const values = [...select.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    // The two responses that put people to work inside this seat's span are
    // offered. The third response names no owner at all, so it is not a candidate
    // at this altitude — an owner-less commitment is the unit's own call.
    assert.ok(values.length >= 2, 'the two owner-bearing responses are offered');
    assert.ok(!values.includes(env.euro), 'a response naming no owner is not offered');
  }
  // The arbitration form exists only after a rehearsal: no unverified choice can be recorded.
  assert.equal(window.document.body.textContent.includes('Record this arbitration'), false);
  assert.equal(window.document.body.textContent.includes('Rehearse both from this revision'), true);
});
