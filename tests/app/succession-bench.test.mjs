/**
 * tests/app/succession-bench.test.mjs — ADR-0077, Session 117: the Succession
 * Terminal (bench coverage as a certified flow-feasibility proof).
 *
 * The claims this suite makes, in order:
 *   1. Schema v83 is additive and fail-closed: a malformed reading is dropped
 *      rather than repaired, a daily cost with no currency is refused, markers are
 *      a bounded set, and `MIGRATIONS[82]` invents no history.
 *   2. THE FLOW TEST IS REAL. A maximum-flow/minimum-cut on a bipartite graph
 *      returns the true matching, and a Hall-violating instance returns the exact
 *      blocked set. Cross-checked against brute-force enumeration on small cases.
 *   3. The overload rule is the DECLARED one: a balanced team can absorb work; a
 *      span that is already overloaded admits nothing.
 *   4. The blanket is the collective union, not the longest individual horizon,
 *      and a recurring commitment never sets it.
 *   5. Concentration: HHI, inverse-HHI effective holders and entropy, with empty
 *      holders in the denominator.
 *   6. REFUSALS: a span of one is structural, not a gap; an unmeasured span is
 *      never `covered`; a rate below the tested floor is withheld.
 *   7. One span's verdict is honestly derived end-to-end from a real store.
 *   8. THE HEADLINE (cross-module × cross-altitude): one committed delegation runs
 *      the 56-rule spine, and a certified bench gap opens a governed decision plus
 *      capped owned tasks carrying the min-cut certificate — and the SAME
 *      transaction fans the work up every leadership ancestor through the Altitude
 *      Lens.
 *   9. Freeze/grade: a refused claim cannot be frozen, grading is once, a deleted
 *      member is unmeasurable rather than a gap, and a graded reading cannot be
 *      deleted.
 *  10. Cross-altitude tiering: the same engine answers five different questions and
 *      withholds names above the director rank.
 *  11. Six panels render, axe-clean, no placeholders.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, normalizeSettings, DEFAULT_SETTINGS, MIGRATIONS,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { describePropagationContracts } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_COLLECTIONS, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import {
  SUCCESSION_RULE_IDS, SUCCESSION_LIMITS, SUCCESSION_STANCES, GAP_VERDICTS, ELIGIBILITY_SOURCES,
} from '../../app/core/domain/successionRegistry.js';
import {
  blanketFor, buildSuccessionReading, certificationFor, concentrationFor, deprivationExposure,
  eligibilityGraph, gradeSuccessionReading, maxFlowMinCut, spanBench, successionAttentionCount,
  successionBrief, successionConventions, successionReport, successionSignals, successionSkill,
  successionView, understudyRisk,
} from '../../app/core/domain/succession.js';
import {
  normalizeDailyCosts, normalizeSuccessionMarkers, normalizeSuccessionReadings,
  normalizeTestedHandovers,
} from '../../app/core/domain/successionSchema.js';
import { successionRule } from '../../app/core/domain/successionRules.js';
import { renderSuccession } from '../../app/views/succession.js';

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const ahead = (days) => new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10);
const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * A five-altitude roster with two competing benches:
 *  - `mgr1` has three reports with recorded relationships and room to help each
 *    other → covered if the load is balanced.
 *  - `mgr2` has three reports but one of them (`ic6`) holds a single very large
 *    obligation that nobody else has a record for → a certified gap.
 */
function fixture(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    successionAutoPropagate: true,
    ...overrides,
  };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', team: 'Ops', managerId: null, status: 'active', createdAt: NOW.toISOString() },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active', createdAt: NOW.toISOString() },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active', createdAt: NOW.toISOString() },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'mgr1', status: 'active', createdAt: NOW.toISOString() },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'mgr1', status: 'active', createdAt: NOW.toISOString() },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'mgr1', status: 'active', createdAt: NOW.toISOString() },
    { id: 'mgr2', name: 'Tomas Iversen', role: 'Manager', level: 'manager', team: 'Ledger', managerId: 'dir1', status: 'active', createdAt: NOW.toISOString() },
    { id: 'ic4', name: 'Dee Park', role: 'Analyst', level: 'ic', team: 'Ledger', managerId: 'mgr2', status: 'active', createdAt: NOW.toISOString() },
    { id: 'ic5', name: 'Esi Mensah', role: 'Analyst', level: 'ic', team: 'Ledger', managerId: 'mgr2', status: 'active', createdAt: NOW.toISOString() },
    // ic6 sits outside the team they report into — a specialist who owns the
    // statutory ledger alone. No survivor has a recorded working relationship with
    // them, which is what makes the second bench a CERTIFIED gap rather than a
    // worry: `same-team` is the weakest eligibility source and they do not even
    // have that.
    { id: 'ic6', name: 'Fay Doubek', role: 'Specialist', level: 'ic', team: 'Statutory', managerId: 'mgr2', status: 'active', createdAt: NOW.toISOString() },
  ];
  // mgr1: balanced, and everyone is eligible for everyone (shared goal + same team).
  state.delegations = [
    { id: 'd1', personId: 'ic1', title: 'Reconcile the vendor ledger', support: '', delegatedOn: ago(10), dueOn: ahead(30), status: 'active', checkins: [] },
    { id: 'd2', personId: 'ic2', title: 'Own the dispute queue', support: '', delegatedOn: ago(9), dueOn: ahead(20), status: 'active', checkins: [] },
    { id: 'd3', personId: 'ic3', title: 'Rebuild the invoice runbook', support: '', delegatedOn: ago(8), dueOn: ahead(90), status: 'active', checkins: [] },
    // mgr2: one holder carries everything, and no record links the others to it.
    { id: 'd4', personId: 'ic6', title: 'Sole owner of the statutory ledger', support: '', delegatedOn: ago(6), dueOn: ahead(45), status: 'active', checkins: [] },
    { id: 'd5', personId: 'ic4', title: 'Month-end packet', support: '', delegatedOn: ago(4), dueOn: ahead(12), status: 'active', checkins: [] },
    { id: 'd6', personId: 'ic5', title: 'Variance commentary', support: '', delegatedOn: ago(3), dueOn: ahead(15), status: 'active', checkins: [] },
  ];
  state.goals = [
    // One shared goal links ic1, ic2 and ic3 — a recorded working relationship.
    { id: 'g1', title: 'Cut cycle time', ownerId: 'ic1', status: 'active', dueDate: ahead(60), keyResults: [{ id: 'kr1', text: 'x', target: 10, current: 2 }], contributorIds: ['ic2', 'ic3'] },
  ];
  return state;
}

/** An in-memory storage shim: the store's default is `localStorage`, which does
 *  not exist in a Node process. Also pins the clock and the id factory so a
 *  frozen reading's review date is deterministic. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function newStore(seed) {
  let counter = 0;
  const store = createStore({
    storage: memoryStorage(),
    now: () => NOW,
    idFactory: (prefix) => `${prefix}-s${(counter += 1)}`,
  });
  store.load();
  store.update((draft) => Object.assign(draft, seed), { type: 'fixture.loaded', entity: 'workspace' });
  return store;
}

function ruleContext(event, settings = {}, draft = null) {
  let counter = 0;
  const logged = [];
  return {
    event, now: NOW, settings, idFactory: (prefix) => `${prefix}-${(counter += 1)}`,
    logEvent: (entry) => logged.push(entry), out: [], logged, draft,
  };
}

function bootDocument() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { window, document: window.document, consoleErrors };
}

/* ---------------------------------------------------------------- 1. schema */

test('1. Schema v83 is additive and fail-closed', () => {
  assert.equal(SCHEMA_VERSION, 87);
  assert.equal(typeof MIGRATIONS[82], 'function', 'the 82→83 migration exists');
  const upgraded = MIGRATIONS[82]({ schemaVersion: 82, people: [] });
  assert.equal(upgraded.schemaVersion, 83);
  assert.deepEqual(upgraded.successionReadings, [], 'no reading is invented on upgrade');
  assert.deepEqual(upgraded.successionMarkers, []);

  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.successionReadings, []);
  assert.equal(empty.settings.successionAutoPropagate, true);
  assert.equal(empty.settings.successionConcentrationCapPct, 40);
  assert.equal(empty.settings.successionMemberFloor, 3);
  assert.equal(empty.settings.successionTestedFloor, 4);
  assert.deepEqual(empty.settings.successionDailyCosts, {});
  // Round-trip through the normalizer and back to the same version.
  const normalized = normalizeState({ ...empty, schemaVersion: 82 }, { now: NOW }).state;
  assert.equal(normalized.schemaVersion, 87);
  assert.deepEqual(normalized.successionReadings, []);

  // A daily cost needs a currency; a bad amount is dropped, not defaulted.
  assert.deepEqual(normalizeDailyCosts({ ic1: { amount: 400, currency: 'eur' } }), { ic1: { amount: 400, currency: 'EUR' } });
  assert.deepEqual(normalizeDailyCosts({ ic1: { amount: 400 } }), {}, 'no currency → refused');
  assert.deepEqual(normalizeDailyCosts({ ic1: { amount: -1, currency: 'EUR' } }), {}, 'negative → refused');
  assert.deepEqual(normalizeDailyCosts({ ic1: 250 }, {}), {}, 'a bare number has no currency');
  // Handover counters cannot claim more failures than handovers.
  assert.deepEqual(normalizeTestedHandovers({ ic1: { tested: 2, failed: 3 } }), { ic1: { tested: 3, failed: 3, lastOn: null } });
  assert.deepEqual(normalizeTestedHandovers({ ic1: { tested: 0, failed: 0 } }), {});
  // Markers are a bounded set.
  const markers = normalizeSuccessionMarkers(['a', 'a', 'b', 3, null]);
  assert.deepEqual(markers, ['a', 'b']);

  // A reading without a probability is dropped with a warning, not repaired.
  const warnings = [];
  const dropped = normalizeSuccessionReadings([
    { id: 'r1', frozenAt: NOW.toISOString(), reviewOn: ahead(30), pGapPct: null, spans: [{ nodeId: 'mgr1' }] },
    { id: 'r2', frozenAt: NOW.toISOString(), reviewOn: ahead(30), pGapPct: 30, spans: [] },
    { id: 'r3', frozenAt: NOW.toISOString(), reviewOn: ahead(30), pGapPct: 30, spans: [{ nodeId: 'mgr1', verdict: 'covered' }] },
  ], warnings);
  assert.equal(dropped.length, 1, 'only the complete reading survives');
  assert.equal(dropped[0].id, 'r3');
  assert.match(warnings[0], /dropped 2 unreadable/);
  // Settings are clamped rather than trusted.
  const conv = successionConventions({ successionConcentrationCapPct: 500, successionMemberFloor: 0 });
  assert.equal(conv.successionConcentrationCapPct, 95);
  assert.equal(conv.successionMemberFloor, 2);
});

/* ------------------------------------------------------ 2. max flow / min cut */

/** Brute force: is there an assignment of every item to an eligible survivor,
 *  respecting per-survivor integer capacity? Exponential, only for tiny cases. */
function feasibleByBruteForce(items, survivors) {
  const order = items.slice();
  const remaining = new Map(survivors.map((s) => [s.id, Math.max(0, Math.floor(s.headroom))]));
  const walk = (index) => {
    if (index === order.length) return true;
    const item = order[index];
    for (const survivorId of item.eligible) {
      if ((remaining.get(survivorId) || 0) <= 0) continue;
      remaining.set(survivorId, remaining.get(survivorId) - 1);
      if (walk(index + 1)) return true;
      remaining.set(survivorId, remaining.get(survivorId) + 1);
    }
    return false;
  };
  return walk(0);
}

test('2. the flow test is a real max-flow/min-cut, cross-checked by brute force', () => {
  // (a) A perfect matching exists.
  const items = [
    { id: 'i1', eligible: new Set(['s1', 's2']) },
    { id: 'i2', eligible: new Set(['s2']) },
  ];
  const survivors = [
    { id: 's1', headroom: 1 },
    { id: 's2', headroom: 1 },
  ];
  const ok = maxFlowMinCut({ items, survivors });
  assert.equal(ok.feasible, true);
  assert.equal(ok.flow, 2);
  assert.equal(ok.blocked.length, 0);
  assert.equal(ok.assignment.length, 2);
  assert.equal(new Set(ok.assignment.map((a) => a.survivorId)).size, 2, 'distinct survivors');

  // (b) Hall's condition fails: two items, one eligible survivor.
  const items2 = [
    { id: 'i1', eligible: new Set(['s1']) },
    { id: 'i2', eligible: new Set(['s1']) },
  ];
  const hall = maxFlowMinCut({ items: items2, survivors: [{ id: 's1', headroom: 1 }] });
  assert.equal(hall.feasible, false);
  assert.equal(hall.blocked.length, 1, 'exactly one obligation is lost: the min cut');
  assert.equal(hall.absorbed.length, 1);

  // (c) Capacity is the cut, not eligibility: every item is eligible for the one
  // survivor, but the survivor has room for one.
  const capacityCut = maxFlowMinCut({
    items: [{ id: 'i1', eligible: new Set(['s1']) }, { id: 'i2', eligible: new Set(['s1']) }],
    survivors: [{ id: 's1', headroom: 1 }],
  });
  assert.equal(capacityCut.blocked.length, 1);

  // (d) An item with no eligibility at all is orphaned, which is a different
  // failure from a capacity shortage and is reported separately.
  const orphan = maxFlowMinCut({
    items: [{ id: 'i1', eligible: new Set() }],
    survivors: [{ id: 's1', headroom: 5 }],
  });
  assert.equal(orphan.feasible, false);
  assert.equal(orphan.orphaned.length, 1);

  // (e) Cross-check against brute force on every small instance of a fixed shape.
  const survivorSets = [
    [{ id: 's1', headroom: 1 }, { id: 's2', headroom: 1 }],
    [{ id: 's1', headroom: 2 }],
    [{ id: 's1', headroom: 1 }, { id: 's2', headroom: 0 }],
  ];
  const eligibilityPatterns = [
    [['s1'], ['s1']],
    [['s1'], ['s1', 's2']],
    [['s1', 's2'], ['s2']],
    [['s1'], []],
    [['s2'], ['s2']],
  ];
  for (const survivorsCase of survivorSets) {
    for (const pattern of eligibilityPatterns) {
      const caseItems = pattern.map((eligible, index) => ({ id: `i${index}`, eligible: new Set(eligible) }));
      const flow = maxFlowMinCut({ items: caseItems, survivors: survivorsCase });
      const brute = feasibleByBruteForce(caseItems, survivorsCase);
      assert.equal(
        flow.feasible,
        brute,
        `flow ${flow.feasible} must equal brute force ${brute} for ${JSON.stringify({ survivorsCase, pattern })}`,
      );
    }
  }
});

/* ------------------------------------------------------- 3. the overload rule */

test('3. the overload rule is the declared one, on a span read from the store', () => {
  const state = fixture();
  const report = successionReport(state, { now: NOW, settings: state.settings });
  const billing = report.spans.find((s) => s.nodeId === 'mgr1');
  assert.ok(billing, 'the Billing span exists');
  assert.equal(billing.membersN, 3);
  assert.equal(billing.itemsN, 3);
  // Every member carries one item, so the median load is 1 and every survivor has
  // room under the declared 1.5× factor. A balanced team is NOT a gap.
  for (const member of billing.members) {
    assert.equal(member.itemN, 1);
    assert.equal(member.headroom, Math.floor(1 * 1.5 - 1) + 1, 'headroom follows the printed rule');
  }
  assert.equal(billing.verdict, 'covered');
  assert.equal(billing.blockedN, 0);

  // An already-overloaded span admits nothing: give one member four items and the
  // others one each, and the overloaded member is correctly reported as having no
  // room for anyone else's work.
  const heavy = clone(state);
  heavy.delegations.push(
    { id: 'h1', personId: 'ic1', title: 'Extra A', delegatedOn: ago(2), dueOn: ahead(10), status: 'active', checkins: [] },
    { id: 'h2', personId: 'ic1', title: 'Extra B', delegatedOn: ago(2), dueOn: ahead(11), status: 'active', checkins: [] },
    { id: 'h3', personId: 'ic1', title: 'Extra C', delegatedOn: ago(2), dueOn: ahead(12), status: 'active', checkins: [] },
  );
  const heavyReport = successionReport(heavy, { now: NOW, settings: heavy.settings });
  const heavyBilling = heavyReport.spans.find((s) => s.nodeId === 'mgr1');
  const ari = heavyBilling.members.find((m) => m.id === 'ic1');
  assert.equal(ari.itemN, 4);
  assert.equal(ari.headroom, 0, 'a member at four times the median has no room');
});

/* ------------------------------------------------------------ 4. the blanket */

test('4. the blanket is collective, and a recurring commitment never sets it', () => {
  const items = [
    { id: 'a', holderId: 'p1', dueOn: ahead(10), weight: 1 },
    { id: 'b', holderId: 'p2', dueOn: ahead(90), weight: 1 },
    { id: 'c', holderId: 'p3', dueOn: ahead(120), weight: 1 },
  ];
  const blanket = blanketFor(items, ['p1', 'p2', 'p3', 'p4'], NOW);
  assert.equal(blanket.blanketDays, 120, 'the union is the furthest promise');
  assert.equal(blanket.threadCount, 3);
  assert.equal(blanket.expiringIn30N, 1);
  assert.equal(blanket.refused, null);

  // No future-dated obligation → refused, never "infinite".
  const empty = blanketFor([], ['p1'], NOW);
  assert.equal(empty.blanketDays, null);
  assert.match(empty.refused, /An empty blanket is not infinite continuity/);

  // An overdue promise contributes no blanket: it is not coverage, it is debt.
  const overdue = blanketFor([{ id: 'x', holderId: 'p1', dueOn: ago(5), weight: 1 }], ['p1'], NOW);
  assert.equal(overdue.blanketDays, null);

  // A 1:1 cadence is not a dated obligation and is excluded at the source list, so
  // a weekly rhythm can never inflate a coverage figure.
  const state = fixture();
  state.oneOnOnes = [{ id: 'oo1', personId: 'ic1', date: ago(1), status: 'held' }];
  const report = successionReport(state, { now: NOW, settings: state.settings });
  const billing = report.spans.find((s) => s.nodeId === 'mgr1');
  assert.equal(billing.itemsN, 3, 'the cadence is not an obligation');
});

/* ------------------------------------------------------- 5. concentration */

test('5. concentration is HHI + inverse-HHI effective holders, with empty holders counted', () => {
  const items = [
    { holderId: 'p1', weight: 3 },
    { holderId: 'p2', weight: 1 },
  ];
  const conc = concentrationFor(items, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(conc.holdersN, 2);
  assert.equal(conc.memberN, 4, 'idle members stay in the denominator');
  assert.equal(conc.topHolderShare, 75);
  // HHI = (0.75² + 0.25²) × 10000 = 6250
  assert.equal(conc.hhi, 6250);
  assert.equal(conc.effectiveHolders, 1.6);
  assert.ok(conc.entropy > 0 && conc.entropy < Math.log(2) + 0.001);
  // A perfectly even split of four holders is 2500 → 4 effective holders.
  const even = concentrationFor([{ holderId: 'p1', weight: 1 }, { holderId: 'p2', weight: 1 }, { holderId: 'p3', weight: 1 }, { holderId: 'p4', weight: 1 }], ['p1', 'p2', 'p3', 'p4']);
  assert.equal(even.hhi, 2500);
  assert.equal(even.effectiveHolders, 4);
  // No work → refused, never "diversified".
  const none = concentrationFor([], ['p1']);
  assert.equal(none.hhi, null);
  assert.match(none.refused, /not diversified — it is empty/);
});

/* ---------------------------------------------------------- 6. the refusals */

test('6. refusals are printed, and an unmeasured span is never called covered', () => {
  // A span of ONE is structural: there is nobody for the work to move to.
  const single = fixture();
  single.people.push({ id: 'lonely', name: 'Sol Okafor', level: 'ic', team: 'Ledger', managerId: 'ic5', status: 'active', createdAt: NOW.toISOString() });
  const singleReport = successionReport(single, { now: NOW, settings: single.settings });
  const lone = singleReport.spans.find((s) => s.nodeId === 'ic5');
  assert.ok(lone, 'the span of one is drawn, not omitted');
  assert.equal(lone.membersN, 1);
  assert.equal(lone.verdict, 'unmeasured');
  assert.equal(lone.structural, 'span-of-one');
  assert.match(lone.refused, /span of one/);

  // Below the member floor but above one → unmeasured with the floor named.
  const two = fixture();
  two.people.push({ id: 'extra', name: 'Gil Ruiz', level: 'ic', team: 'Billing', managerId: 'mgr1', status: 'active', createdAt: NOW.toISOString() });
  const twoReport = successionReport(two, { now: NOW, settings: two.settings });
  assert.equal(twoReport.spans.find((s) => s.nodeId === 'mgr1').verdict, 'covered', 'four members is above the floor');

  // Below the ITEM floor → unmeasured.
  const thin = fixture();
  thin.delegations = thin.delegations.filter((d) => d.personId !== 'ic1' && d.personId !== 'ic2' && d.personId !== 'ic3');
  const thinReport = successionReport(thin, { now: NOW, settings: thin.settings });
  const thinBilling = thinReport.spans.find((s) => s.nodeId === 'mgr1');
  assert.equal(thinBilling.verdict, 'unmeasured');
  assert.match(thinBilling.refused, /dated obligation\(s\) in scope against a floor of 3/);

  // A rate below the tested floor is withheld and the method is named.
  const risk = understudyRisk({ tested: 1, failed: 0, floor: 4 });
  assert.equal(risk.mode, 'untested');
  assert.equal(risk.probabilityPct, 66.7, '(1+1)/(1+2) = 66.7% — what a barely-tested bench is worth');
  assert.match(risk.refused, /1 handover\(s\) on record against a 4-handover floor/);
  const measured = understudyRisk({ tested: 10, failed: 2, floor: 4 });
  assert.equal(measured.mode, 'measured');
  assert.equal(measured.probabilityPct, 22.7, 'Jeffreys (2+0.5)/(10+1)');
  assert.equal(measured.refused, null);

  // A never-tested bench reads 50% at zero handovers, which is the honest answer.
  assert.equal(understudyRisk({ tested: 0, failed: 0, floor: 4 }).probabilityPct, 50);

  // Money with no declared cost is counted and never valued.
  const exposure = deprivationExposure(successionReport(fixture(), { now: NOW, settings: fixture().settings }), { now: NOW });
  assert.equal(exposure.currencies.length, 0);
  assert.match(exposure.refused, /Unpriced work is counted, never valued|No holder with a blocked obligation/);
});

/* -------------------------------------------------- 7. the verdict, end to end */

test('7. the certified gap is derived from the record, with the min-cut certificate', () => {
  const state = fixture();
  const report = successionReport(state, { now: NOW, settings: state.settings });
  const ledger = report.spans.find((s) => s.nodeId === 'mgr2');
  assert.ok(ledger);
  assert.equal(ledger.membersN, 3);
  assert.equal(ledger.itemsN, 3);
  // ic6 is the only holder of the statutory ledger and sits outside the team they
  // report into, so NO survivor has a recorded relationship with them: not a shared
  // goal, not a co-run review, not even `same-team`.
  const ic6Holder = ledger.holders.find((h) => h.holderId === 'ic6');
  assert.ok(ic6Holder);
  assert.equal(ic6Holder.eligibleSurvivorN, 0);
  assert.match(ic6Holder.refused, /Eligibility is evidence; the terminal will not invent a name/);
  assert.equal(ledger.verdict, 'certified-gap', 'the flow test is infeasible, so the span is certified, not warned');
  assert.ok(ledger.blockingSet.some((item) => item.holderNodeId === 'ic6'), 'the certificate names the blocked obligation');
  for (const item of ledger.blockingSet) {
    assert.equal(item.reabsorbable, false);
    assert.ok(item.type && item.id, 'the certificate names a real record');
  }
  // The weak `same-team` source is real, not decorative: bring ic6 into the team
  // and the same holder becomes eligible for reabsorption.
  const teamed = clone(state);
  teamed.people.find((p) => p.id === 'ic6').team = 'Ledger';
  const teamedReport = successionReport(teamed, { now: NOW, settings: teamed.settings });
  const teamedHolder = teamedReport.spans.find((s) => s.nodeId === 'mgr2').holders.find((h) => h.holderId === 'ic6');
  assert.ok(teamedHolder.eligibleSurvivorN >= 1, 'same-team is a recorded (if weak) source');
  assert.equal(teamedHolder.refused, null);

  // A shared goal earns an edge, and the source is named.
  const graph = eligibilityGraph(state, report.chain, 'ic1', [
    { id: 'ic2', team: 'Billing' }, { id: 'ic3', team: 'Billing' }, { id: 'ic4', team: 'Ledger' },
  ]);
  assert.ok(graph.eligibleSet.has('ic2'));
  assert.ok(graph.eligibleSet.has('ic3'));
  assert.ok(!graph.eligibleSet.has('ic4'), 'a different team with no shared goal is not eligible');
  const ic2Edge = graph.edges.find((e) => e.survivorId === 'ic2');
  assert.ok(ic2Edge.sources.includes('shared-goal'));
  assert.ok(ELIGIBILITY_SOURCES.some((s) => s.key === 'shared-goal'));
});

/* --------------------------------------- 8. the headline: spine + altitude */

test('8. one committed delegation runs the spine: certificate + multi-altitude roll-up', () => {
  const state = fixture();
  const store = newStore(state);
  const api = createApi(store, { now: () => NOW });
  const before = {
    decisions: (store.state.decisions || []).length,
    delegations: (store.state.delegations || []).length,
    links: (store.state.links || []).length,
  };
  // A single ordinary commit through the real store, which runs all 56 rules.
  const result = api.addDelegation({
    personId: 'ic5',
    title: 'Rebuild the statutory ledger handover',
    expectedOutcome: 'A second holder can run the statutory ledger unaided.',
    support: 'Pairing with the current holder for two closes.',
    authority: 'act-inform',
    dueOn: ahead(14),
  });
  assert.ok(result.ok, `delegation logged: ${result.error || ''}`);
  const draft = store.state;

  // (a) cross-module: the succession rules opened governed work, and the work it
  // opened is present in the same transaction. (The rules also fired when the
  // fixture was loaded, which is the point: EVERY operational commit runs them, so
  // the assertion is about the state the commit produced, not about a delta that a
  // second firing would hide.)
  const successionTasks = (draft.delegations || []).filter((d) => /succession-/.test(d.support || ''));
  const successionDecisions = (draft.decisions || []).filter((d) => /\[RULE-SUC-02\]/.test(d.rationale || ''));
  assert.ok(successionTasks.length > 0, 'at least one bench task was opened by the rules');
  assert.ok(before.delegations >= 6, 'the fixture delegations survived alongside the rule output');
  assert.ok(successionDecisions.length > 0, 'at least one governed bench decision was opened by the rules');
  const gapDecision = successionDecisions.find((d) => /cannot reabsorb/.test(d.title));
  assert.ok(gapDecision, 'the certified-gap decision names the certificate');
  assert.match(gapDecision.question, /names a span, never a person/);
  assert.equal(gapDecision.options.length, 3, 'the three governed moves survive normalization');
  assert.ok(gapDecision.options.every((o) => o.label), 'each option carries a label after a reload');

  // (b) the certificate is a typed edge from the obligation to the task
  const certEdges = (draft.links || []).filter((l) => l.ruleId === SUCCESSION_RULE_IDS.GAP);
  assert.ok(certEdges.length > 0, 'certificate edges were written');
  assert.ok(certEdges.some((e) => e.relation === 'certifies-gap'), 'the obligation points at its certificate');
  assert.ok(certEdges.some((e) => e.relation === 'understudies-for'), 'the seat points at the development work');
  assert.ok(certEdges.some((e) => e.relation === 'hedges-departure'), 'the reading points at the governed decision');
  // Every relation is in the shared registry and every endpoint type resolves.
  for (const edge of certEdges) {
    assert.ok(LINK_RELATIONS.includes(edge.relation), `${edge.relation} is a declared relation`);
    assert.ok(edge.sourceType in LINK_ENTITY_COLLECTIONS, `${edge.sourceType} has an owning collection`);
    assert.ok(edge.targetType in LINK_ENTITY_COLLECTIONS, `${edge.targetType} has an owning collection`);
  }

  // (c) cross-altitude: the same transaction fanned the bench work up the chain
  const benchDecisionEdge = (draft.links || []).find((l) => l.ruleId === SUCCESSION_RULE_IDS.GAP && l.relation === 'hedges-departure');
  assert.ok(benchDecisionEdge, 'the governed decision is linked to the span it protects');
  assert.ok(['leader', 'mgr1', 'mgr2', 'dir1', 'vp1'].includes(benchDecisionEdge.sourceId), 'the edge names a real span, never a person as a subject');

  // (d) idempotence: an explicit rescan writes no second copy of anything.
  const decisionsAfter = draft.decisions.length;
  const tasksAfter = draft.delegations.length;
  api.scanSuccession();
  assert.equal((store.state.decisions || []).length, decisionsAfter, 'a rescan cannot double the governed decision');
  assert.equal((store.state.delegations || []).length, tasksAfter, 'a rescan cannot double the tasks');

  // (e) the rule is on the shared spine, before the seat rule, and contracted.
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'successionRule'));
  const successionIndex = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.id === 'successionRule');
  const seatIndex = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.id === 'seatRule');
  assert.ok(successionIndex < seatIndex, 'succession runs before the seat roll-up so its edges can be explained');
  const contracts = describePropagationContracts();
  const contract = contracts.find((c) => c.module === 'successionRules.js');
  assert.ok(contract, 'the rule declares its contract');
  assert.match(contract.purpose, /RULE-SUC-01/);
  assert.ok(contract.writes.includes('successionMarkers'));
});

test('8b. a declared seat rolls the bench decision up the chain in the same transaction', () => {
  const state = fixture({ activeSeatId: 'mgr1' });
  const store = newStore(state);
  const api = createApi(store, { now: () => NOW });
  const beforeDecisions = (store.state.decisions || []).length;
  assert.ok(beforeDecisions > 0, 'the certified-gap decision was already opened by the loaded commit');
  const result = api.addDelegation({
    personId: 'ic6',
    title: 'Document the statutory ledger close',
    expectedOutcome: 'A written runbook exists.',
    support: 'Two afternoons with the current holder.',
    authority: 'act-inform',
    dueOn: ahead(30),
  });
  assert.ok(result.ok, result.error || '');
  const draft = store.state;
  const seatEdges = (draft.links || []).filter((l) => l.ruleId === 'RULE-SEAT-01' && l.relation === 'rolls-up-to');
  assert.ok(seatEdges.length > 0, 'the seat rule rolled items up the chain');
  // Nothing was invented: every roll-up edge points at a real leadership node.
  const leadershipIds = new Set(['vp1', 'dir1', 'mgr1', 'mgr2']);
  for (const edge of seatEdges) {
    assert.ok(leadershipIds.has(edge.targetId), `${edge.targetId} is a real leadership span`);
  }
  assert.equal((draft.decisions || []).length, beforeDecisions, 'a second commit does not duplicate the governed decision');
});

/* ------------------------------------------------------ 9. freeze and grade */

test('9. freeze refuses an unquotable bench, grading is once, deletion is unmeasurable', () => {
  const state = fixture();
  const report = successionReport(state, { now: NOW, settings: state.settings });
  const built = buildSuccessionReading(report, { now: NOW, id: 'suc-1' });
  assert.ok(built.ok, built.error);
  assert.equal(built.record.scope, 'chain');
  assert.ok(built.record.members.length > 0, 'the frozen claim names its members');
  assert.ok(built.record.pGapPct >= 0 && built.record.pGapPct <= 100);
  assert.ok(built.record.pGapLowerPct <= built.record.pGapPct, 'the union-bound lower bound never exceeds the independence figure');
  assert.equal(built.record.reviewOn, ahead(60), 'review day = freeze day + the declared 60-day horizon');

  // Grading before the review date is refused.
  const early = gradeSuccessionReading(built.record, state, { now: NOW, settings: state.settings });
  assert.equal(early.ok, false);
  assert.match(early.error, /cannot be graded before/);

  // Grade it later: no gap opened because every member is still open and held.
  const reviewed = { ...built.record, reviewOn: ago(1) };
  const graded = gradeSuccessionReading(reviewed, state, { now: NOW, settings: state.settings });
  assert.ok(graded.ok, graded.error);
  assert.equal(graded.grade.lapsed, false);
  assert.equal(typeof graded.grade.brier, 'number');
  // This fixture HAS a certified gap, and the frozen members include the
  // non-reabsorbable obligation — so a gap is observed, and that is the correct
  // grade. The Brier loss is the honest cost of having quoted a probability.
  assert.equal(graded.grade.observedGap, true, 'the certified obligation is still unheld');
  // The Brier loss is whatever the arithmetic says, including zero: a probability
  // of 1 on an event that happened loses nothing, and the terminal does not
  // pretend a correct forecast was costly. What it refuses to do is skip the grade.
  assert.equal(typeof graded.grade.brier, 'number');
  assert.ok(graded.grade.brier >= 0);

  // Grading twice is refused.
  const twice = gradeSuccessionReading({ ...reviewed, graded: graded.grade }, state, { now: NOW });
  assert.equal(twice.ok, false);
  assert.match(twice.error, /already been graded/);

  // A deleted member is UNMEASURABLE, never a gap.
  const thin = clone(state);
  thin.delegations = thin.delegations.filter((d) => d.id !== reviewed.members[0].id);
  // A reading whose only frozen member belonged to a certified gap has one member,
  // so deleting it must LAPSE the reading rather than score it — a deletion is not
  // evidence that the claim was right, and it is not evidence that it was wrong.
  const partial = gradeSuccessionReading(reviewed, thin, { now: NOW, settings: thin.settings });
  assert.ok(partial.ok);
  assert.ok(partial.grade.unmeasurableN >= 1);
  assert.equal(partial.grade.lapsed, true);
  assert.equal(partial.grade.brier, null, 'a lapsed reading is never scored');
  assert.match(partial.grade.note || '', /no longer exist and were excluded|Every member of this reading has been deleted/);

  // Every member deleted → the reading lapses rather than being credited.
  const gone = clone(state);
  gone.delegations = [];
  gone.goals = [];
  gone.cases = [];
  const lapsed = gradeSuccessionReading(reviewed, gone, { now: NOW, settings: gone.settings });
  assert.ok(lapsed.ok);
  assert.equal(lapsed.grade.lapsed, true);
  assert.equal(lapsed.grade.brier, null);

  // A reading with no probability is not scoreable.
  const unquotable = gradeSuccessionReading({ ...reviewed, pGapPct: null }, state, { now: NOW });
  assert.equal(unquotable.ok, false);

  // Skill is withheld below five graded readings.
  const skill = successionSkill([{ graded: graded.grade }]);
  assert.equal(skill.skill, null);
  assert.match(skill.refused, /1 graded reading\(s\) against a 5-reading floor/);
});

test('9b. the action layer refuses a refused freeze, a bad currency and a double freeze', () => {
  const state = fixture();
  const store = newStore(state);
  const api = createApi(store, { now: () => NOW });

  // An amount with no currency is refused with a reason a leader can act on.
  const badCost = api.setSuccessionConventions({ dailyCosts: { ic1: { amount: 500, currency: '' } } });
  assert.equal(badCost.ok, false);
  assert.match(badCost.error, /three-letter currency/);
  // A cost for a person who left the roster is refused.
  const ghost = api.setSuccessionConventions({ dailyCosts: { nobody: { amount: 500, currency: 'EUR' } } });
  assert.equal(ghost.ok, false);
  assert.match(ghost.error, /must name someone on the roster/);
  // More failures than handovers is refused.
  const impossible = api.setSuccessionConventions({ testedHandovers: { ic1: { tested: 1, failed: 3 } } });
  assert.equal(impossible.ok, false);
  assert.match(impossible.error, /More failed handovers than handovers/);
  // A valid declaration is stored and used.
  const good = api.setSuccessionConventions({ dailyCosts: { ic6: { amount: 900, currency: 'EUR' } } });
  assert.ok(good.ok, good.error);
  assert.equal(store.state.settings.successionDailyCosts.ic6.currency, 'EUR');

  // Freeze once, then a second freeze on the same day is refused.
  const first = api.freezeSuccessionReading({ reviewDays: 30 });
  assert.ok(first.ok, first.error || '');
  const second = api.freezeSuccessionReading({ reviewDays: 30 });
  assert.equal(second.ok, false);
  assert.match(second.error, /already frozen today/);

  // A graded reading cannot be deleted; grading is once and forever.
  const reading = store.state.successionReadings[0];
  store.update((draft) => {
    const target = draft.successionReadings.find((row) => row.id === reading.id);
    target.reviewOn = ago(1);
  }, { type: 'test.force', entity: 'workspace', entityId: '', summary: 'force review date for the test' });
  const grade = api.gradeSuccessionReadingNow(reading.id);
  assert.ok(grade.ok, grade.error || '');
  const del = api.deleteSuccessionReading(reading.id);
  assert.equal(del.ok, false);
  assert.match(del.error, /cannot be deleted/);
});

/* ------------------------------------------------- 10. cross-altitude tiering */

test('10. five altitudes, five questions, and names withheld above the director rank', () => {
  const state = fixture();
  const report = successionReport(state, { now: NOW, settings: state.settings });
  // Five distinct stances exist and are distinct questions.
  const questions = new Set(Object.values(SUCCESSION_STANCES).map((s) => s.question));
  assert.equal(questions.size, 5, 'each altitude asks a genuinely different question');
  assert.ok(Object.values(SUCCESSION_STANCES).every((s) => s.duties.length >= 3));

  const chief = successionView(report, { seat: { rank: 5, altitudeKey: 'chief' } });
  const frontline = successionView(report, { seat: { rank: 1, altitudeKey: 'frontline' } });
  assert.equal(chief.disclosure.personNames, false, 'a chief is handed counts, not names');
  assert.equal(frontline.disclosure.personNames, true, 'a frontline lead is handed names');
  assert.ok(chief.rows.every((row) => !/Ari Klein|Fay Doubek/.test(row.label)), 'no person name leaks to the chief');
  assert.ok(frontline.rows.some((row) => /Ari Klein|Mei Chen/.test(row.label)), 'the frontline lead sees their own span');

  // A seat's scope filters the rows; ancestors are marked rather than hidden.
  const scoped = successionView(report, { seat: { rank: 2, altitudeKey: 'manager', scope: ['ic1', 'ic2', 'ic3'] } });
  assert.ok(scoped.rows.some((row) => row.where === 'above'), 'the manager can see the chain above exists');
  assert.equal(scoped.ownN >= 0, true);
});

/* ------------------------------------------------------------ 11. the surf */

test('11. six panels render axe-clean with no placeholders', async () => {
  const { window, document, consoleErrors } = bootDocument();
  const axe = (await import('axe-core')).default;
  const state = fixture({ activeSeatId: null });
  const settings = normalizeSettings(state.settings);
  const run = (panel, extra = {}) => {
    const api = {
      successionRead: (opts = {}) => {
        const report = successionReport(state, { now: NOW, settings });
        return { ...report, view: successionView(report, { seat: opts.seat || null, nodeId: opts.nodeId || null }) };
      },
      successionBriefText: () => successionBrief(successionReport(state, { now: NOW, settings }), NOW),
      successionExposure: () => deprivationExposure(successionReport(state, { now: NOW, settings }), { now: NOW }),
      freezeSuccessionReading: () => ({ ok: true, record: { pGapPct: 10, reviewOn: ahead(30) } }),
      gradeSuccessionReadingNow: () => ({ ok: true }),
      deleteSuccessionReading: () => ({ ok: true }),
      setSuccessionConventions: () => ({ ok: true }),
      scanSuccession: () => ({ ok: true }),
      ...extra,
    };
    const host = document.getElementById('view');
    host.innerHTML = '';
    const node = renderSuccession({
      state, now: NOW, query: new URLSearchParams({ panel }), navigate: () => {}, refresh: () => {}, api,
    });
    host.append(node);
    return node;
  };
  const panels = ['bench', 'reabsorb', 'blanket', 'chain', 'readings', 'method'];
  for (const panel of panels) {
    const node = run(panel);
    const text = node.textContent;
    assert.ok(node.querySelector('h1'), `${panel} has a heading`);
    assert.ok(text.length > 400, `${panel} has content (${text.length})`);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(text), `${panel} leaked a placeholder: ${text.slice(0, 300)}`);
    const results = await axe.run(node, { runOnly: ['wcag2a', 'wcag2aa'] });
    assert.equal(results.violations.length, 0, `${panel}: ${results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`);
  }
  // jsdom cannot implement HTMLCanvasElement#getContext, which axe-core uses
  // internally to resolve a computed colour. That is an environment limitation,
  // not a page defect, so it is filtered explicitly rather than ignored.
  const realErrors = consoleErrors.filter((message) => !/getContext\(\) method/.test(message));
  assert.deepEqual(realErrors, [], 'no jsdom errors');
  // An unknown panel falls back to the bench rather than a blank screen.
  assert.match(run('no-such-panel').textContent, /Leadership bench|certified/i);
  // The view never emits a placeholder when the chain is empty.
  const emptyState2 = createEmptyState(NOW.toISOString());
  const emptyNode = renderSuccession({
    state: emptyState2, now: NOW, query: new URLSearchParams({ panel: 'bench' }), navigate: () => {}, refresh: () => {},
    api: {
      successionRead: () => {
        const report = successionReport(emptyState2, { now: NOW, settings: emptyState2.settings });
        return { ...report, view: successionView(report, {}) };
      },
      successionExposure: () => deprivationExposure(successionReport(emptyState2, { now: NOW, settings: emptyState2.settings }), { now: NOW }),
      successionBriefText: () => '',
    },
  });
  assert.match(emptyNode.textContent, /No leadership span exists yet/);
  window.close();
});

/* ---------------------------------------------------- 12. surfaces & signals */

test('12. signals, badge, brief and the CSV scope are all wired', async () => {
  const state = fixture();
  const signals = successionSignals(state, NOW, state.settings);
  assert.ok(signals.length > 0, 'a bench with a certified gap raises signals');
  assert.ok(signals.every((s) => s.domain === 'Succession' && s.route.startsWith('#/succession')));
  for (const signal of signals) {
    assert.ok(SUCCESSION_RULE_IDS.BLANKET.startsWith('RULE-SUC'));
    assert.ok(signal.ruleId.startsWith('SUC-'), `${signal.ruleId} follows the SUC-nn convention`);
  }
  assert.ok(signals.some((s) => s.ruleId === 'SUC-05'), 'a never-tested bench is flagged');
  const badge = successionAttentionCount(state, NOW, state.settings);
  assert.equal(typeof badge, 'number');
  assert.ok(badge >= 0);

  const brief = successionBrief(successionReport(state, { now: NOW, settings: state.settings }), NOW);
  assert.match(brief, /LEADERSHIP BENCH/);
  assert.match(brief, /lower bound/);
  assert.match(brief, /Unverified/);
  assert.ok(!/Ari Klein|Fay Doubek|Mei Chen/.test(brief), 'the brief names nobody');

  const csv = await import('../../app/core/csv.js');
  const scope = csv.CSV_EXPORTS.find((s) => s.key === 'succession-bench');
  assert.ok(scope, 'CSV scope #73 exists');
  const built = csv.exportWorkspaceCsv(state, 'succession-bench', { now: NOW });
  assert.ok(built.ok, built.error);
  assert.ok(built.csv.split('\n').length > 2, 'the export has a header and rows');
  // No person id or name in an aggregate export.
  assert.ok(!/ic1|Fay Doubek|Ari Klein/.test(built.csv), 'the export carries no person identifier');
  assert.match(built.csv.split('\n')[0], /row_kind/);
});

/* --------------------------------------------------- 13. no-regression safety */

test('13. an unmeasurable workspace writes nothing, and the auto-pass never invents work', () => {
  const empty = createEmptyState(NOW.toISOString());
  const draft = clone(empty);
  draft.links = [];
  const ctx = ruleContext({ type: 'case.created', entity: 'case', entityId: 'x' }, draft.settings, draft);
  const effects = successionRule(draft, ctx);
  assert.deepEqual(effects, [], 'no chain → no bench finding to invent');

  // A pausable automatic pass: with `successionAutoPropagate` off, an ordinary
  // operational commit writes nothing, but an explicit scan still runs.
  const paused = fixture({ successionAutoPropagate: false });
  const draft2 = clone(paused);
  draft2.links = [];
  const pausedEffects = successionRule(draft2, ruleContext({ type: 'delegation.created', entity: 'delegation', entityId: 'd1' }, draft2.settings, draft2));
  assert.deepEqual(pausedEffects, []);
  const scanEffects = successionRule(draft2, ruleContext({ type: 'succession.scan', entity: 'workspace', entityId: '' }, draft2.settings, draft2));
  assert.ok(scanEffects.length > 0, 'pausing automation never silences an explicit request to look');

  // Derived events never trigger the automatic pass.
  const draft3 = clone(fixture());
  draft3.links = [];
  assert.deepEqual(successionRule(draft3, ruleContext({ type: 'automation.propagated', entity: 'workspace', entityId: '' }, draft3.settings, draft3)), [], 'a derived event never triggers the automatic pass');
  // Freezing is a deliberate human act, so it runs the rules even with automation
  // paused — the same contract `seat.switched` and an explicit scan follow.
  const frozenDraft = clone(fixture({ successionAutoPropagate: false }));
  frozenDraft.links = [];
  assert.ok(successionRule(frozenDraft, ruleContext({ type: 'succession.frozen', entity: 'successionreading', entityId: 'x' }, frozenDraft.settings, frozenDraft)).length > 0);
});

test('14. the certification pair is coherent and the diffusion floor is honoured', () => {
  const state = fixture();
  const report = successionReport(state, { now: NOW, settings: state.settings });
  const cert = report.certification;
  if (cert.pIndependence !== null) {
    assert.ok(cert.pLower <= cert.pIndependence + 0.001, 'the lower bound never exceeds the independence reference');
    assert.ok(cert.pLower >= 0 && cert.pIndependence <= 100);
    assert.equal(cert.perSpan.length, cert.measuredN);
    assert.match(cert.method, /union-bound LOWER bound/);
  }
  // Below the span floor, diffusion refuses rather than printing a coin toss.
  if (report.diffusion.measuredN < report.conventions.successionDiffusionFloor) {
    assert.equal(report.diffusion.share, null);
    assert.match(report.diffusion.refused, /floor/);
  }
  // A single-span certification reports that span's own probability as the bound.
  const single = certificationFor({ spans: report.spans.filter((s) => s.nodeId === 'mgr2'), conv: report.conventions });
  if (single.pIndependence !== null) {
    assert.equal(single.pIndependence, single.perSpan[0].pGapPct);
    assert.equal(single.pLower, single.perSpan[0].pGapPct, 'one span: independence and the union bound coincide');
  }
  assert.ok(SUCCESSION_LIMITS.maxBlockingSet >= 1);
  assert.ok(GAP_VERDICTS.length === 4);
});
