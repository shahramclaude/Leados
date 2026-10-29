/**
 * tests/app/negotiation.test.mjs — Negotiation Workbench (Schema v23) suite.
 *
 * Frameworks applied and asserted here:
 *   - Fisher & Ury (1981) principled negotiation: BATNA discipline and the
 *     weighted preparation checklist (people/interests/options/criteria).
 *   - Raiffa (1982) negotiation analysis: reservation prices, ZOPA geometry,
 *     gap measurement when reservation envelopes do not overlap, and honest
 *     "incomplete" states instead of invented zeros.
 *   - Lax & Sebenius (1986) value creation: package options and agreement
 *     term ownership so commitments survive the closing session.
 *   - Event-driven parallel automation (RULE-NEG-01/02/03, RULE-ESC-01):
 *     every propagation is a typed graph edge, idempotent on re-sync.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  negotiationDelivery,
  analyzeNegotiationIssue,
  batnaWarnings,
  evaluateNegotiationPrep,
  evaluateNegotiationSettlement,
  negotiationsRollup,
  summarizeNegotiation,
} from '../../app/core/domain/negotiation.js';
import { deriveDelegationLineage, delegationSummary } from '../../app/core/domain/delegations.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { linksForEntity } from '../../app/core/domain/cases.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const NOW = new Date('2026-10-26T10:00:00.000Z');
const TODAY = '2026-10-26';

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-nt-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

const zopaIssue = (over = {}) => ({
  name: 'Fee',
  unit: 'USD',
  direction: 'minimize',
  weight: 4,
  ourReservation: 100,
  ourTarget: 80,
  theirReservation: 70,
  theirTarget: 95,
  estimateConfidence: 'medium',
  ...over,
});

/* ------------------------------------------------------------- engine math */

test('ZOPA: minimize and maximize overlap geometry, gap math, and honest incomplete state', () => {
  const minimizer = analyzeNegotiationIssue(zopaIssue());
  assert.equal(minimizer.status, 'zopa');
  assert.equal(minimizer.zopaLow, 70);
  assert.equal(minimizer.zopaHigh, 100);
  assert.equal(minimizer.zopaWidth, 30);
  assert.equal(minimizer.zopaMidpoint, 85);
  assert.equal(minimizer.gap, null);

  // Maximizer: our floor 60 below their ceiling 80 → ZOPA 60..80.
  const maximizer = analyzeNegotiationIssue(zopaIssue({
    direction: 'maximize', ourReservation: 60, ourTarget: 90, theirReservation: 80, theirTarget: 65,
  }));
  assert.equal(maximizer.status, 'zopa');
  assert.equal(maximizer.zopaLow, 60);
  assert.equal(maximizer.zopaHigh, 80);

  // Minimizer gap: our walk-away 60 is below their floor 75 → no settlement
  // zone; the gap is the 15 units that new options must close.
  const gap = analyzeNegotiationIssue(zopaIssue({
    ourReservation: 60, ourTarget: 50, theirReservation: 75, theirTarget: 90,
  }));
  assert.equal(gap.status, 'no-zopa');
  assert.equal(gap.gap, 15);
  assert.equal(gap.zopaWidth, null);

  // Regression: a missing counterparty estimate (explicit null after schema
  // normalization, or an absent field) is "incomplete", never a zero offer.
  const missing = analyzeNegotiationIssue(zopaIssue({ theirReservation: null, theirTarget: null }));
  assert.equal(missing.status, 'incomplete');
  assert.equal(missing.theirReservation, null);
  const absent = analyzeNegotiationIssue({ name: 'Bare', ourReservation: 10 });
  assert.equal(absent.status, 'incomplete');
});

test('target warning fires when the aspiration is not strictly better than the walk-away', () => {
  const sane = analyzeNegotiationIssue(zopaIssue());
  assert.equal(sane.targetWarning, null);
  const lazy = analyzeNegotiationIssue(zopaIssue({ direction: 'minimize', ourReservation: 100, ourTarget: 120 }));
  assert.ok(lazy.targetWarning, 'a target above our own walk-away on a minimizer is not an aspiration');
});

test('Fisher & Ury prep checklist is weighted; BATNA and walk-away price count twice', () => {
  const empty = evaluateNegotiationPrep({});
  assert.equal(empty.completenessPct, 0);
  assert.equal(empty.metCount, 0);
  assert.ok(empty.blockers.length === empty.totalCount);

  const ready = evaluateNegotiationPrep({
    ourBatnaDescription: 'Walk away and extend the incumbent contract month to month.',
    ourInterests: ['Cap spend'],
    theirInterests: ['Book renewal'],
    objectiveCriteria: ['Market benchmark', 'Last year’s CPI-adjusted rate'],
    options: ['One-year price hold', 'Two-year term with support days'],
    issues: [zopaIssue()],
  });
  assert.equal(ready.completenessPct, 100, 'all eight disciplines evidenced');
  assert.equal(ready.blockers.length, 0);

  // BATNA alone (weight 2) on a 9-point checklist = 22%, not "one of eight ticks".
  const onlyBatna = evaluateNegotiationPrep({ ourBatnaDescription: 'Concrete walk-away plan documented here.' });
  assert.equal(onlyBatna.completenessPct, Math.round((2 / ready.maxWeight) * 100));
});

test('BATNA cross-check is dimensionally honest: same unit warns, mixed units stay silent', () => {
  const record = { ourBatnaValue: 90, ourBatnaUnit: 'USD' };
  const sameUnit = analyzeNegotiationIssue(zopaIssue({ ourReservation: 120 }));
  const warnings = batnaWarnings(record, [sameUnit]);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes('worse than executing the BATNA'));

  // 120 days vs a USD BATNA cannot be compared — manufacturing a verdict would
  // be dimensional nonsense, so the engine deliberately says nothing.
  const days = analyzeNegotiationIssue(zopaIssue({ unit: 'days', ourReservation: 120 }));
  assert.deepEqual(batnaWarnings({ ourBatnaValue: 90, ourBatnaUnit: 'USD' }, [days]), []);
  assert.deepEqual(batnaWarnings({}, [sameUnit]), []);
});

test('summarizeNegotiation flags session/review drift, high stakes and weighted ZOPA coverage', () => {
  const base = {
    id: 'n1', title: 'Renewal', kind: 'vendor-contract', status: 'active',
    openedOn: '2026-10-01', nextSessionOn: '2026-10-20', reviewOn: '2026-10-25',
    strategic: false, stakesValue: 5000, stakesCurrency: 'USD',
    ourBatnaDescription: 'Incumbent rollover is available and priced.',
    ourInterests: ['x'], theirInterests: ['y'], objectiveCriteria: ['a', 'b'], options: ['o1', 'o2'],
    issues: [
      zopaIssue({ weight: 5 }),
      zopaIssue({ name: 'Term', weight: 3, ourReservation: 60, theirReservation: 40, status: undefined }),
    ],
  };
  const overdue = summarizeNegotiation(base, null, NOW);
  assert.equal(overdue.sessionOverdue, true);
  assert.equal(overdue.reviewOverdue, true);
  assert.equal(overdue.highStakes, false, '5,000 is below the 25,000 high-stakes threshold');
  assert.equal(overdue.needsAttention, true);
  assert.equal(overdue.zopaCoveragePct, 100);

  const strategic = summarizeNegotiation({ ...base, strategic: true, nextSessionOn: '2026-10-28', reviewOn: '2026-11-01' }, null, NOW);
  assert.equal(strategic.highStakes, true);
  assert.equal(strategic.sessionOverdue, false);
  assert.equal(strategic.sessionDueSoon, true, 'session two days out is in the prep window');
  assert.equal(strategic.weakPrepBeforeSession, false, 'prep is complete, so an upcoming session is not a risk');

  // Weighted coverage: weight-5 gap and weight-3 ZOPA → 3/8 = 38%, and the
  // heavy gap alone is enough to demand attention.
  const heavy = summarizeNegotiation({
    ...base, nextSessionOn: null, reviewOn: '2026-11-01',
    issues: [
      zopaIssue({ weight: 5, ourReservation: 60, theirReservation: 75 }),
      zopaIssue({ name: 'Term', weight: 3 }),
    ],
  }, null, NOW);
  assert.equal(heavy.blockingGaps[0].weight, 5);
  assert.equal(heavy.zopaCoveragePct, 38);
  assert.equal(heavy.needsAttention, true);
});

test('negotiationsRollup buckets open, impasse and attention records without inventing urgency', () => {
  const state = {
    people: [], goals: [], links: [],
    negotiations: [
      { id: 'a', title: 'Open', kind: 'other', status: 'active', openedOn: '2026-10-01', issues: [] },
      { id: 'b', title: 'Stuck', kind: 'other', status: 'impasse', openedOn: '2026-10-01', issues: [] },
      { id: 'c', title: 'Done', kind: 'other', status: 'agreed', openedOn: '2026-09-01', closedOn: '2026-09-10', issues: [] },
    ],
  };
  const roll = negotiationsRollup(state, NOW);
  assert.equal(roll.all.length, 3);
  assert.equal(roll.open.length, 1);
  assert.equal(roll.impasses.length, 1);
  assert.ok(roll.attention.some((s) => s.record.id === 'b'), 'impasse always needs attention');
  assert.ok(!roll.attention.some((s) => s.record.id === 'a'), 'a calm open record is not noise');
  assert.ok(!roll.attention.some((s) => s.record.id === 'c'), 'closed records leave the queue');
});

/* --------------------------------------------------- validation & failures */

test('addNegotiation rejects bad input rather than persisting a hollow record', () => {
  const { store, api } = harness();
  assert.equal(api.addNegotiation({}).ok, false);
  assert.equal(api.addNegotiation({ title: 'Future', openedOn: '2026-11-01' }).ok, false);
  const person = api.addPerson({ name: 'Pat Owner', startDate: '2025-01-01' });
  assert.equal(api.addNegotiation({ title: 'Ghost owner', ownerId: `${person.id}-x` }).ok, false);
  assert.equal(api.addNegotiation({ title: 'Negative value', stakesValue: -5 }).ok, false);
  assert.equal(api.addNegotiation({ title: 'Bad kind', kind: 'hostage-swap' }).ok, true, 'unknown kind repairs to "other", it does not reject');
  assert.equal((store.state.negotiations || []).length, 1);
  assert.equal(store.state.negotiations[0].kind, 'other');
});

/* --------------------------------------------- RULE-NEG-01 fan-out graph */

test('RULE-NEG-01: a high-stakes negotiation connects goal, mandate decision and coaching', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Priya', role: 'Lead', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Billing migration', ownerId: owner.id, dueDate: '2026-12-15' });

  const res = api.addNegotiation({
    title: 'Aurora renewal', kind: 'vendor-contract', strategic: true,
    counterparty: 'Elena Voss', ownerId: owner.id, linkedGoalId: goal.id,
    openedOn: '2026-10-08', stakesValue: 96000,
    ourBatnaDescription: 'Migrate reserved workloads to Northstack.',
    issues: [zopaIssue()],
  });
  assert.equal(res.ok, true);
  const negotiation = store.state.negotiations[0];

  const edges = linksForEntity(store.state, 'negotiation', negotiation.id);
  const relations = edges.map((l) => `${l.peer.type}:${l.relation}`).sort();
  assert.ok(relations.includes('goal:impacts-goal'));
  assert.ok(relations.includes('person:coaches'));
  const mandateEdge = edges.find((l) => l.peer.type === 'decision' && l.relation === 'decides');
  assert.ok(mandateEdge, 'high-stakes work gets a pursue-agreement-vs-BATNA mandate decision');
  const mandate = store.state.decisions.find((d) => d.id === mandateEdge.peer.id);
  assert.ok(mandate.title.includes('Aurora renewal'));
  assert.ok(mandate.question.includes('ZOPA'), 'the mandate carries the analytical evidence, not a blank question');

  // Idempotent re-sync: editing a note must not duplicate edges or decisions.
  const edgeCountBefore = store.state.links.length;
  const decisionCountBefore = store.state.decisions.length;
  const update = api.updateNegotiation(negotiation.id, { notes: 'Second session booked.' });
  assert.equal(update.ok, true);
  assert.equal(store.state.links.length, edgeCountBefore);
  assert.equal(store.state.decisions.length, decisionCountBefore);
});

test('RULE-NEG-01 provenance edge and the autoPropagate kill switch', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Sam', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Reliability', ownerId: owner.id, dueDate: '2026-12-15' });

  const quiet = api.addNegotiation({
    title: 'Quiet prep', ownerId: owner.id, linkedGoalId: goal.id, autoPropagate: false,
    ourBatnaDescription: 'A concrete plan exists for the no-deal path.',
    issues: [zopaIssue()],
  });
  assert.equal(quiet.ok, true);
  assert.equal(linksForEntity(store.state, 'negotiation', quiet.id).length, 0, 'kill switch suppresses every edge');
  assert.equal(store.state.decisions.length, 0, 'and no mandate decision is invented');
});

/* --------------------------------------------- RULE-NEG-03 impasse fan-out */

test('RULE-NEG-03 + RULE-ESC-01: impasse raises one escalation case, idempotently', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Priya', startDate: '2025-01-01' });
  const created = api.addNegotiation({
    title: 'Stalled renewal', kind: 'vendor-contract', strategic: true, ownerId: owner.id,
    openedOn: '2026-10-01', ourBatnaDescription: 'Northstack migration plan is ready.',
    issues: [zopaIssue({ ourReservation: 60, theirReservation: 75 })],
  });
  const id = created.id;
  assert.equal(api.setNegotiationStatus(id, 'active').ok, true);
  const impasse = api.setNegotiationStatus(id, 'impasse');
  assert.equal(impasse.ok, true);
  assert.equal(impasse.escalation.created, true);
  assert.equal(store.state.cases.length, 1);
  const caseId = impasse.escalation.caseId;
  assert.equal(store.state.negotiations[0].escalationCaseId, caseId);

  const edges = linksForEntity(store.state, 'negotiation', id);
  assert.ok(edges.some((l) => l.peer.type === 'case' && l.relation === 'escalates-from'));

  // Reopen and deadlock again: the existing open case is reused, never duplicated.
  assert.equal(api.setNegotiationStatus(id, 'active').ok, true);
  const again = api.setNegotiationStatus(id, 'impasse');
  assert.equal(again.ok, true);
  assert.equal(again.escalation.created, false);
  assert.equal(again.escalation.caseId, caseId);
  assert.equal(store.state.cases.length, 1);
});

/* --------------------------------------------- RULE-NEG-02 agreement terms */

test('RULE-NEG-02: owned terms become delegations; ownerless terms stay honest gaps', () => {
  const { store, api } = harness();
  const mei = api.addPerson({ name: 'Mei', startDate: '2025-01-01' });
  const freya = api.addPerson({ name: 'Freya', startDate: '2025-02-01' });
  const made = api.addNegotiation({
    title: 'Launch coverage', kind: 'scope-deadline', ownerId: mei.id,
    openedOn: '2026-09-15', ourBatnaDescription: 'Sales staffs the desk itself.',
    issues: [zopaIssue()],
  });

  const agreement = api.recordNegotiationAgreement(made.id, {
    outcomeNotes: 'Package agreed in the second session.',
    agreedTerms: [
      { text: 'Mei runs the launch desk', ownerId: mei.id, dueOn: '2026-11-05', agreedValue: 32, unit: 'hours' },
      { text: 'Sales funds two backfill days', ownerId: freya.id, dueOn: '2026-11-07', agreedValue: 2, unit: 'days' },
      { text: 'Joint retro after launch week' }, // no owner — a visible gap
    ],
  });
  assert.equal(agreement.ok, true);
  assert.equal(store.state.negotiations[0].status, 'agreed');
  assert.equal(store.state.delegations.length, 2);
  const gap = agreement.propagations.find((p) => p.action === 'ownership-gap');
  assert.ok(gap, 'the ownerless term is surfaced, never silently assigned');

  const followups = linksForEntity(store.state, 'negotiation', made.id)
    .filter((l) => l.peer.type === 'delegation' && l.relation === 'tracks-followup');
  assert.equal(followups.length, 2);
  const delegation = store.state.delegations[0];
  assert.equal(delegation.sourceNegotiationId, made.id);
  assert.ok(delegation.title.startsWith('Negotiated commitment:'));
  assert.equal(delegation.dueOn, '2026-11-05');

  // Recording again must not duplicate the same term delegations.
  const repeat = api.recordNegotiationAgreement(made.id, { agreedTerms: [{ text: 'Mei runs the launch desk', ownerId: mei.id }] });
  assert.equal(repeat.ok, true);
  assert.equal(store.state.delegations.length, 3, 'the re-recorded term replaces the term set; one new owned term, still no duplicates per term id');
});

test('agreement validation: terms need text, owners must exist, withdrawn record is locked', () => {
  const { api } = harness();
  const owner = api.addPerson({ name: 'Pat', startDate: '2025-01-01' });
  const made = api.addNegotiation({ title: 'Locked', ownerId: owner.id, openedOn: '2026-10-01' });
  assert.equal(api.recordNegotiationAgreement(made.id, { agreedTerms: [{ text: '' }] }).ok, false);
  assert.equal(api.recordNegotiationAgreement(made.id, { agreedTerms: [{ text: 'x', ownerId: 'ghost' }] }).ok, false);
  assert.equal(api.setNegotiationStatus(made.id, 'withdrawn').ok, true);
  assert.equal(api.recordNegotiationAgreement(made.id, { agreedTerms: [{ text: 'too late' }] }).ok, false);
});

/* --------------------------------------------- transitions & delete cascade */

test('transition guard rails and reopen/delete graph semantics', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Rio', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Goal', ownerId: owner.id, dueDate: '2026-12-15' });
  const made = api.addNegotiation({
    title: 'Edge case', ownerId: owner.id, linkedGoalId: goal.id, strategic: true,
    openedOn: '2026-10-01', ourBatnaDescription: 'BATNA documented for the walk-away.',
    issues: [zopaIssue()],
  });
  // preparing cannot jump straight to impasse; agreement only via the dedicated action.
  assert.equal(api.setNegotiationStatus(made.id, 'impasse').ok, false);
  assert.equal(api.setNegotiationStatus(made.id, 'agreed').ok, false);

  const negotiationEdges = () => store.state.links.filter(
    (l) => (l.sourceType === 'negotiation' && l.sourceId === made.id) ||
           (l.targetType === 'negotiation' && l.targetId === made.id),
  );
  assert.ok(negotiationEdges().length >= 2);

  // A second, independent negotiation proves delete is scoped, not a wipe.
  const other = api.addNegotiation({
    title: 'Other workstream', ownerId: owner.id, linkedGoalId: goal.id,
    openedOn: '2026-10-02', ourBatnaDescription: 'Separate BATNA on file.',
    issues: [zopaIssue()],
  });
  const otherEdgesBefore = store.state.links.filter(
    (l) => (l.sourceType === 'negotiation' && l.sourceId === other.id) ||
           (l.targetType === 'negotiation' && l.targetId === other.id),
  ).length;
  assert.ok(otherEdgesBefore >= 1);

  assert.equal(api.deleteNegotiation(made.id).ok, true);
  assert.equal(negotiationEdges().length, 0, 'every negotiation-owned edge is cleared');
  assert.equal(store.state.negotiations.some((n) => n.id === made.id), false);
  const otherEdgesAfter = store.state.links.filter(
    (l) => (l.sourceType === 'negotiation' && l.sourceId === other.id) ||
           (l.targetType === 'negotiation' && l.targetId === other.id),
  ).length;
  assert.equal(otherEdgesAfter, otherEdgesBefore, 'the other negotiation’s graph is untouched');
});

/* ----------------------------------------------------------------- insights */

test('NEG-01..06 insight rules fire on evidence and stay silent on the demo baseline', () => {
  const demoFired = new Set(buildInsights(buildDemoState(NOW), NOW).findings.map((f) => f.ruleId));
  for (const rule of ['NEG-01', 'NEG-02', 'NEG-03', 'NEG-04', 'NEG-05', 'NEG-06']) {
    assert.ok(!demoFired.has(rule), `${rule} silent on the healthy demo baseline`);
  }

  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Pat', startDate: '2025-01-01' });

  // NEG-01: strategic, no BATNA.
  const noBatna = api.addNegotiation({ title: 'No walk-away plan', strategic: true, openedOn: '2026-10-10' });
  // NEG-02: session already in the past.
  const overdue = api.addNegotiation({
    title: 'Missed session', ownerId: owner.id, openedOn: '2026-09-20', nextSessionOn: '2026-10-18',
    ourBatnaDescription: 'BATNA exists.',
  });
  // NEG-03: session in two days with sub-50% prep (only a BATNA → 22%).
  const weakPrep = api.addNegotiation({
    title: 'Cold meeting', ownerId: owner.id, openedOn: '2026-10-20', nextSessionOn: '2026-10-28',
    ourBatnaDescription: 'Short BATNA note.',
  });
  // NEG-04: weight-5 issue with no ZOPA.
  const noZopa = api.addNegotiation({
    title: 'Price canyon', ownerId: owner.id, openedOn: '2026-10-05', nextSessionOn: '2026-11-10',
    reviewOn: '2026-11-20', ourBatnaDescription: 'BATNA exists.',
    issues: [zopaIssue({ weight: 5, ourReservation: 60, theirReservation: 75 })],
  });
  // NEG-06: an agreement carrying an ownerless term.
  const softAgreement = api.addNegotiation({
    title: 'Gentleman’s deal', ownerId: owner.id, openedOn: '2026-09-01',
    ourBatnaDescription: 'BATNA exists.',
  });
  api.recordNegotiationAgreement(softAgreement.id, { agreedTerms: [{ text: 'Someone will send the contract' }] });

  // NEG-05: impasse without an escalation case — only reachable by writing
  // state directly (the action layer always raises one via RULE-NEG-03).
  store.update((draft) => {
    draft.negotiations.push({
      id: 'neg-orphan-impasse', title: 'Orphan deadlock', kind: 'other', status: 'impasse',
      openedOn: '2026-10-01', closedOn: '2026-10-20', issues: [],
    });
  });

  const fired = new Set(buildInsights(store.state, NOW).findings.map((f) => f.ruleId));
  for (const rule of ['NEG-01', 'NEG-02', 'NEG-03', 'NEG-04', 'NEG-05', 'NEG-06']) {
    assert.ok(fired.has(rule), `${rule} fires on its crafted evidence`);
  }

  // Every finding still satisfies the generic insight contract.
  const negFindings = buildInsights(store.state, NOW).findings.filter((f) => f.ruleId.startsWith('NEG-'));
  for (const f of negFindings) {
    assert.equal(f.domain, 'Negotiation');
    assert.ok(f.evidence.length > 0);
    assert.ok(f.action.route.startsWith('#/negotiations/'));
  }
});

/* ---------------------------------------------------------------------- CSV */

test('negotiations CSV scope exports analytical rows honestly and survives round-trip', () => {
  const descriptor = CSV_EXPORTS.find((s) => s.key === 'negotiations');
  assert.ok(descriptor, 'the workbench ships a purpose-limited CSV scope');
  assert.equal(descriptor.sensitive, false);

  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Pat', startDate: '2025-01-01' });
  api.addNegotiation({
    title: '=Aurora renewal', kind: 'vendor-contract', strategic: true,
    counterparty: '=SUM(1+1)', ownerId: owner.id, openedOn: '2026-10-08',
    stakesValue: 96000, ourBatnaDescription: 'Northstack migration.', ourBatnaValue: 88000, ourBatnaUnit: 'USD',
    issues: [zopaIssue(), zopaIssue({ name: 'Term', weight: 2, ourReservation: 60, theirReservation: 75 })],
  });

  const res = exportWorkspaceCsv(store.state, 'negotiations', { now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.rowCount, 1);
  const parsed = parseCsv(res.csv);
  assert.equal(parsed.headers.length, res.columnCount);
  assert.equal(parsed.rows.length, 1);

  const headerIndex = Object.fromEntries(parsed.headers.map((h, i) => [h, i]));
  const row = parsed.rows[0];
  assert.equal(row[headerIndex.weighted_zopa_coverage_pct], '67', 'weight-4 ZOPA of weight-6 total rounds to 67%');
  assert.equal(row[headerIndex.no_zopa_issue_count], '1');
  assert.equal(row[headerIndex.batna_value], '88000');
  // CWE-1236: formula-shaped text is neutralized in the serialized cell and
  // the protective apostrophe is part of the stored text (by design — it is
  // what makes a spreadsheet treat the cell as a literal).
  assert.ok(res.csv.includes("'=SUM(1+1)"), 'formula prefix neutralized for spreadsheet safety');
  assert.equal(row[headerIndex.counterparty], "'=SUM(1+1)");

  // Unknown scope remains an explicit, typed failure.
  assert.equal(exportWorkspaceCsv(store.state, 'nope', { now: NOW }).ok, false);
});

/* ------------------------------------------------------------------ schema */

test('Schema v23: v22 workspaces migrate additively and negotiation records repair, never invent', () => {
  assert.equal(SCHEMA_VERSION, 48);
  const v22 = {
    schemaVersion: 22,
    people: [{ id: 'p1', name: 'Ada', status: 'active', startDate: '2025-01-01' }],
    goals: [],
  };
  const snapshot = JSON.stringify(v22);
  const migrated = migrate(v22);
  assert.equal(JSON.stringify(v22), snapshot, 'migration never mutates its input');
  assert.deepEqual(migrated.applied.at(-1), '47 → 48');
  assert.ok(migrated.applied.includes('22 → 23'), 'v23 negotiation step still in the additive chain');
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(state.negotiations, [], 'a v22 workspace simply starts with no negotiations');
  assert.equal(state.schemaVersion, 48);
  assert.deepEqual(warnings, []);

  const dirty = normalizeState({
    schemaVersion: 23,
    people: [{ id: 'p1', name: 'Ada', status: 'active', startDate: '2025-01-01' }],
    goals: [{ id: 'g1', title: 'Survive', ownerId: 'p1', dueDate: '2026-12-15' }],
    negotiations: [
      {
        id: 'n-dirty',
        title: 'Repairable record',
        kind: 'hostage-swap',
        status: 'limbo',
        openedOn: '2030-01-01', // future clamped to today
        nextSessionOn: '2026-09-01', // before opened → dropped
        linkedGoalId: 'g-gone', // dangling → cleared
        stakesValue: 'lots', // unparsable → null, not NaN
        issues: [{ name: 'Fee', ourReservation: 100, theirReservation: 70, weight: 9 }],
        agreedTerms: [{ text: 'Owned term', ownerId: 'p1' }, { text: '', ownerId: 'p1' }],
      },
      { id: 'n-blank', title: '   ' }, // missing title → dropped, never invented
    ],
  }, { now: NOW });

  const rec = dirty.state.negotiations[0];
  assert.equal(rec.kind, 'other');
  assert.equal(rec.status, 'preparing');
  assert.equal(rec.openedOn, TODAY);
  assert.equal(rec.nextSessionOn, null);
  assert.equal(rec.linkedGoalId, null);
  assert.equal(rec.stakesValue, null);
  assert.equal(rec.issues[0].weight, 5, 'weight clamps into the 1..5 scale');
  assert.equal(rec.agreedTerms.length, 1, 'empty term text is dropped, not stored');
  assert.ok(dirty.warnings.some((w) => w.includes('dropped') && w.includes('title')), 'blank-title drop is logged');
  assert.ok(dirty.warnings.some((w) => w.includes('broken goal link')), 'dangling goal repair is logged');
  assert.ok(dirty.warnings.length > 0, 'repairs are visible in the warning log');
});

test('empty workspace carries the v23 negotiation collection and a no-op re-normalization', () => {
  const empty = createEmptyState();
  assert.equal(empty.schemaVersion, 48);
  assert.deepEqual(empty.negotiations, []);
  const once = normalizeState(empty, { now: NOW }).state;
  const twice = normalizeState(JSON.parse(JSON.stringify(once)), { now: NOW }).state;
  assert.equal(JSON.stringify(twice.negotiations), JSON.stringify(once.negotiations));
});

/* ------------------------------------------------------- JSDOM UI + axe-core */

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;

  return { dom, window, document: window.document, consoleErrors };
}

async function withApp(fn, now = NOW) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => now });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
}

test('UI: negotiation list, detail, dialog submit and Today queue render axe-clean and stay error-free', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();

    // 1. List view: framework explainer and the three demo records.
    app.navigate('#/negotiations');
    const listText = env.document.querySelector('#view').textContent;
    assert.ok(listText.includes('Aurora Cloud platform renewal'));
    assert.ok(listText.includes('Fisher & Ury'), 'the workbench names its real framework, not generic prose');
    assert.ok(listText.includes('Freya’s secondment'));
    assert.deepEqual(await axeViolations(env), []);
    assert.deepEqual(env.consoleErrors, []);

    // 2. Detail view: ZOPA table, BATNA, prep checklist and graph links.
    const vendor = app.store.state.negotiations.find((n) => n.kind === 'vendor-contract');
    app.navigate(`#/negotiations/${vendor.id}`);
    const detailText = env.document.querySelector('#view').textContent;
    assert.ok(detailText.includes('BATNA'));
    assert.ok(detailText.includes('Annual platform fee'));
    assert.ok(detailText.includes('Northstack'));
    assert.ok(detailText.includes('Negotiation mandate'), 'the RULE-NEG-01 mandate decision is linked on screen');
    assert.deepEqual(await axeViolations(env), []);

    // 3. Agreed record shows owned terms, never an unlabelled gap.
    const agreed = app.store.state.negotiations.find((n) => n.status === 'agreed');
    app.navigate(`#/negotiations/${agreed.id}`);
    const agreedText = env.document.querySelector('#view').textContent;
    assert.ok(agreedText.includes('backfill'));
    assert.ok(agreedText.includes('Freya'));
    assert.deepEqual(await axeViolations(env), []);

    // 4. Register dialog: live ZOPA preview, submit, and persistence.
    app.navigate('#/negotiations');
    const registerBtn = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => b.textContent.includes('Register negotiation'));
    click(registerBtn);
    const modalRoot = env.document.querySelector('#modal-root');
    const dialog = modalRoot.querySelector('[role="dialog"], dialog, .modal');
    assert.ok(dialog, 'the register dialog opens');
    const titleInput = dialog.querySelector('input[name="title"]');
    titleInput.value = 'Northstack fallback terms';
    titleInput.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    assert.deepEqual(await axeViolations(env, '#modal-root'), []);
    const submit = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.includes('Register negotiation'));
    click(submit);
    assert.equal(app.store.state.negotiations.length, 4, 'the dialog wrote through ctx.api, not local state');
    assert.ok(!modalRoot.querySelector('[role="dialog"], dialog, .modal'), 'the dialog closes after save');

    // 5. Agreement dialog: owned term closes the negotiation and fans out a delegation.
    const createdId = app.store.state.negotiations.find((n) => n.title === 'Northstack fallback terms').id;
    assert.equal(app.api.setNegotiationStatus(createdId, 'active').ok, true);
    app.navigate(`#/negotiations/${createdId}`);
    const agreementBtn = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => b.textContent.trim() === 'Record agreement');
    click(agreementBtn);
    const termDialog = modalRoot.querySelector('[role="dialog"], dialog, .modal');
    assert.ok(termDialog, 'the agreement dialog opens');
    const termInput = termDialog.querySelector('input[aria-label="Committed term"]');
    termInput.value = 'Send the fallback pricing sheet';
    termInput.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const ownerSelectEl = termDialog.querySelector('select[aria-label="Term owner"]');
    ownerSelectEl.value = app.store.state.people[0].id;
    ownerSelectEl.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    assert.deepEqual(await axeViolations(env, '#modal-root'), []);
    const agreeSubmit = Array.from(termDialog.querySelectorAll('button')).find((b) => b.textContent.includes('Record agreement'));
    click(agreeSubmit);
    const closed = app.store.state.negotiations.find((n) => n.id === createdId);
    assert.equal(closed.status, 'agreed');
    assert.ok(app.store.state.delegations.some((d) => d.sourceNegotiationId === createdId), 'RULE-NEG-02 delegation exists');

    // 6. Today stays calm on the healthy demo, then surfaces an overdue session.
    app.navigate('#/today');
    assert.equal(env.document.querySelector('#negotiations-triage'), null);
    const owner = app.store.state.people[0].id;
    app.api.addNegotiation({
      title: 'Missed vendor call', ownerId: owner, openedOn: '2026-09-20',
      nextSessionOn: '2026-10-18', ourBatnaDescription: 'BATNA note for the walk-away path.',
    });
    app.navigate('#/today');
    const card = env.document.querySelector('#negotiations-triage');
    assert.ok(card, 'an overdue session puts the negotiation on the Today queue');
    assert.ok(card.textContent.includes('Missed vendor call'));
    assert.deepEqual(await axeViolations(env), []);
    assert.deepEqual(env.consoleErrors, []);
  });
});


test('RULE-NEG-04: agreement delivery fans back to goal and history without inventing outcomes', () => {
  const { store, api } = harness();
  const person = api.addPerson({ name: 'Delivery owner', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Launch', ownerId: person.id, dueDate: '2026-12-15' });
  const made = api.addNegotiation({ title: 'Launch support', ownerId: person.id, linkedGoalId: goal.id });
  assert.equal(api.recordNegotiationAgreement(made.id, { agreedTerms: [
    { text: 'Run launch desk', ownerId: person.id },
    { text: 'Provide backfill', ownerId: person.id },
    { text: 'Arrange retrospective' },
  ] }).ok, true);
  const [first, second] = store.state.delegations;
  const before = store.state.goals[0].checkins.length;
  const confidence = store.state.goals[0].confidence;
  assert.equal(api.completeDelegation(first.id, { completionNote: 'Desk delivered with handover.' }).ok, true);
  let delivery = negotiationDelivery(store.state.negotiations[0], store.state);
  assert.equal(delivery.delivered, 1);
  assert.equal(delivery.untracked, 1);
  assert.equal(delivery.complete, false);
  assert.equal(store.state.goals[0].checkins.length, before + 1);
  assert.equal(store.state.goals[0].confidence, confidence);
  assert.equal(store.state.goals[0].checkins.at(-1).progressPct, null);
  assert.equal(api.completeDelegation(first.id, { completionNote: 'Replay' }).ok, false);
  assert.equal(store.state.goals[0].checkins.length, before + 1);
  assert.equal(api.returnDelegation(second.id, { returnReason: 'Backfill unavailable; leader recovery needed.' }).ok, true);
  delivery = negotiationDelivery(store.state.negotiations[0], store.state);
  assert.equal(delivery.returned, 1);
  assert.equal(store.state.goals[0].checkins.length, before + 2);
  assert.equal(store.state.events.filter((e) => e.type === 'negotiation.delivery').length, 2);
  assert.ok(buildInsights(store.state, NOW, store.state.settings).findings.some((f) => f.ruleId === 'NEG-07'));
  // Derived delivery survives persistence normalization; deleting a source does not guess completion.
  const normalized = normalizeState(store.state).state || normalizeState(store.state);
  assert.equal(negotiationDelivery(normalized.negotiations[0], normalized).delivered, 1);
});

test('RULE-NEG-04 respects opt-out and ignores unrelated or obsolete terms', async () => {
  const { propagateNegotiationDelivery } = await import('../../app/core/domain/automation.js');
  const draft = { negotiations: [{ id: 'n', autoPropagate: false, agreedTerms: [{ id: 't' }] }] };
  const delegation = { id: 'd', sourceNegotiationId: 'n', sourceTermId: 't', status: 'done' };
  assert.deepEqual(propagateNegotiationDelivery(draft, delegation), []);
  draft.negotiations[0].autoPropagate = true;
  delegation.sourceTermId = 'obsolete';
  assert.deepEqual(propagateNegotiationDelivery(draft, delegation), []);
  assert.equal(negotiationDelivery({ id: 'empty', agreedTerms: [] }, draft).complete, false);
});

/* ----------------------------------------------------- Session 37: RULE-NEG-05 */

test('RULE-NEG-05: returned commitment recovery preserves returned delegation history, updates negotiation term lineage, queues 1:1 handover topic, and clears NEG-07', () => {
  const { store, api } = harness();
  const alice = api.addPerson({ name: 'Alice Vance', startDate: '2025-01-01' });
  const ben = api.addPerson({ name: 'Ben Okafor', startDate: '2025-02-01' });
  const goal = api.addGoal({ title: 'Platform resiliency', ownerId: alice.id, dueDate: '2026-12-15' });
  const openedCase = api.addCase({
    title: 'Cross-team handoff bottleneck',
    kind: 'incident',
    severity: 'high',
    summary: 'Handoffs stalling.',
    ownerId: alice.id,
  });
  const neg = api.addNegotiation({
    title: 'Incident rotation SLA',
    ownerId: alice.id,
    linkedGoalId: goal.id,
    sourceType: 'case',
    sourceId: openedCase.id,
    ourBatnaDescription: 'Escalate to VP Engineering.',
  });

  const agreed = api.recordNegotiationAgreement(neg.id, {
    agreedTerms: [
      { text: 'Publish runbook and pager rotation', ownerId: alice.id, dueOn: '2026-11-05', agreedValue: 14, unit: 'days' },
    ],
  });
  assert.equal(agreed.ok, true);
  const termId = store.state.negotiations[0].agreedTerms[0].id;
  const firstDel = store.state.delegations.find((d) => d.sourceNegotiationId === neg.id && d.sourceTermId === termId);
  assert.ok(firstDel);
  assert.equal(firstDel.personId, alice.id);

  // Also link the first delegation as mitigating the case to verify mitigation link inheritance on recovery.
  api.linkCaseEntity(openedCase.id, { targetType: 'delegation', targetId: firstDel.id, relation: 'mitigates' });

  // Return the delegation: NEG-07 must fire.
  const ret = api.returnDelegation(firstDel.id, {
    returnedOn: '2026-10-26',
    returnReason: 'pulled into P0 production incident all week',
  });
  assert.equal(ret.ok, true);
  assert.ok(buildInsights(store.state, NOW, store.state.settings).findings.some((f) => f.ruleId === 'NEG-07'), 'NEG-07 fires while returned delegation is unrecovered');

  // Recover the negotiated term by re-delegating to Ben with a countermeasure.
  const rec = api.recoverNegotiationTerm(neg.id, termId, {
    personId: ben.id,
    authority: 'act-inform',
    dueOn: '2026-11-12',
    delegatedOn: '2026-10-26',
    recoveryNote: 'Shifted pager rotation setup to Ben with SRE pairing support.',
    support: '2h/week SRE pairing + runbook template.',
  });
  assert.equal(rec.ok, true);
  assert.equal(rec.delegation.personId, ben.id);
  assert.equal(rec.delegation.priorDelegationId, firstDel.id);

  // Verify returned delegation remains intact in history with supersededByDelegationId.
  const historical = store.state.delegations.find((d) => d.id === firstDel.id);
  assert.equal(historical.status, 'returned');
  assert.equal(historical.returnReason, 'pulled into P0 production incident all week');
  assert.equal(historical.supersededByDelegationId, rec.delegation.id);
  assert.equal(historical.recoveredOn, '2026-10-26');

  // Verify lineage derivation and summary counts.
  const lineage = deriveDelegationLineage(store.state, rec.delegation.id);
  assert.equal(lineage.attemptNumber, 2);
  assert.equal(lineage.priorOwners.length, 1);
  assert.equal(lineage.priorOwners[0].ownerName, 'Alice Vance');
  assert.equal(lineage.priorOwners[0].returnReason, 'pulled into P0 production incident all week');

  const dSummary = delegationSummary(store.state, NOW);
  assert.equal(dSummary.returned, 1);
  assert.equal(dSummary.unrecoveredReturned, 0);
  assert.equal(dSummary.recoveredReturned, 1);

  // Verify negotiation term points to the active successor delegation and preserves priorOwners.
  const updatedNeg = store.state.negotiations[0];
  const updatedTerm = updatedNeg.agreedTerms[0];
  assert.equal(updatedTerm.ownerId, ben.id);
  assert.equal(updatedTerm.dueOn, '2026-11-12');
  assert.equal(updatedTerm.priorOwners.length, 1);
  assert.equal(updatedTerm.priorOwners[0].ownerId, alice.id);
  assert.equal(updatedTerm.priorOwners[0].delegationId, firstDel.id);

  const delivery = negotiationDelivery(updatedNeg, store.state);
  assert.equal(delivery.returned, 0);
  assert.equal(delivery.inProgress, 1);
  assert.equal(delivery.recovered, 1);
  assert.equal(delivery.rows[0].attemptCount, 2);
  assert.equal(delivery.rows[0].delegation.id, rec.delegation.id);

  // NEG-07 must no longer fire once recovered!
  assert.equal(
    buildInsights(store.state, NOW, store.state.settings).findings.some((f) => f.ruleId === 'NEG-07'),
    false,
    'NEG-07 clears once the returned commitment has an active recovery delegation',
  );

  // Verify 1:1 handover talking point queued for Ben with prior return reason and countermeasure.
  const benRecord = store.state.people.find((p) => p.id === ben.id);
  const benTopic = (benRecord.talkingPoints || []).find((tp) => tp.includes('pulled into P0 production incident all week'));
  assert.ok(benTopic, '1:1 handover coaching topic queued for the new owner');
  assert.ok(benTopic.includes('Shifted pager rotation setup to Ben'));

  // Verify case mitigation link carried forward to the successor delegation.
  const caseLinks = linksForEntity(store.state, 'case', openedCase.id);
  assert.ok(caseLinks.some((l) => l.peer.type === 'delegation' && l.peer.id === rec.delegation.id && l.relation === 'mitigates'));

  // Re-trying to recover an already-superseded delegation must be rejected cleanly.
  const dup = api.redelegateReturnedOutcome(firstDel.id, {
    personId: alice.id,
    dueOn: '2026-11-20',
    recoveryNote: 'Duplicate attempt',
  });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already been recovered/i);
});

test('repairDelegationRecoveryChains: cycle-safe lineage repair on corrupted imports', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.people.push({ id: 'p-1', name: 'A', startDate: '2025-01-01', status: 'active' });
  raw.delegations.push(
    {
      id: 'd-cycle-1',
      personId: 'p-1',
      title: 'Cycle A',
      expectedOutcome: 'Out A',
      authority: 'act-inform',
      support: 'Sup',
      delegatedOn: '2026-10-01',
      dueOn: '2026-10-15',
      status: 'returned',
      returnedOn: '2026-10-10',
      returnReason: 'Reason A',
      priorDelegationId: 'd-cycle-2',
    },
    {
      id: 'd-cycle-2',
      personId: 'p-1',
      title: 'Cycle B',
      expectedOutcome: 'Out B',
      authority: 'act-inform',
      support: 'Sup',
      delegatedOn: '2026-10-11',
      dueOn: '2026-10-20',
      status: 'returned',
      returnedOn: '2026-10-15',
      returnReason: 'Reason B',
      priorDelegationId: 'd-cycle-1',
    },
  );
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.ok(warnings.some((w) => /cyclic/i.test(w)), 'cycle in priorDelegationId is detected and repaired with a warning');
  const lineage1 = deriveDelegationLineage(state, 'd-cycle-1');
  const lineage2 = deriveDelegationLineage(state, 'd-cycle-2');
  assert.ok(lineage1.chain.length <= 2);
  assert.ok(lineage2.chain.length <= 2);
});

/* ----------------------------------------------------- Session 37: RULE-NEG-06 */

test('RULE-NEG-06 & NEG-08: ex-post settlement records actuals, computes Perold shortfall and unit-honest BATNA breach, cascades to goal and DACI governance, and voids on reopen', () => {
  const { store, api } = harness();
  const owner = api.addPerson({ name: 'Elena Rostova', startDate: '2025-01-01' });
  const goal = api.addGoal({ title: 'Cloud unit-cost reduction', ownerId: owner.id, dueDate: '2026-12-31' });
  const neg = api.addNegotiation({
    title: 'Observability Enterprise Renewal',
    kind: 'vendor-contract',
    ownerId: owner.id,
    linkedGoalId: goal.id,
    strategic: true,
    stakesCurrency: 'USD',
    stakesValue: 80_000,
    ourBatnaDescription: 'Migrate cold logs to S3 archive tier at $62k net value.',
    ourBatnaValue: 62_000,
    ourBatnaUnit: 'USD',
    issues: [
      zopaIssue({ name: 'Annual platform commit', unit: 'USD', direction: 'minimize', ourTarget: 70_000, ourReservation: 85_000, theirReservation: 75_000, theirTarget: 82_000 }),
    ],
  });
  assert.equal(neg.ok, true);

  const issueId = store.state.negotiations[0].issues[0].id;
  assert.equal(
    api.recordNegotiationAgreement(neg.id, {
      agreedTerms: [
        { text: 'Commit annual spend at $74k with burst cap', issueId, agreedValue: 74_000, unit: 'USD', ownerId: owner.id, dueOn: '2026-11-01' },
      ],
    }).ok,
    true,
  );

  // Complete the delegation before settling: NEG-08 should prompt for settlement on a high-stakes delivered agreement.
  const delId = store.state.delegations[0].id;
  assert.equal(api.completeDelegation(delId, { completionNote: 'Contract executed and burst alert configured.' }).ok, true);
  const awaitingFindings = buildInsights(store.state, NOW, store.state.settings).findings.filter((f) => f.ruleId === 'NEG-08');
  assert.equal(awaitingFindings.length, 1);
  assert.equal(awaitingFindings[0].severity, 2);
  assert.match(awaitingFindings[0].title, /record settled actuals/i);

  // Now record an adverse settlement where realised value ($55k) falls below the walk-away BATNA ($62k USD) and agreed term settles at $81k (> $74k minimize).
  const termId = store.state.negotiations[0].agreedTerms[0].id;
  const settled = api.recordNegotiationSettlement(neg.id, {
    settledOn: '2026-10-26',
    realisedValue: 55_000,
    counterpartyDelivered: false,
    note: 'Overage charges reduced net realized value to $55k; burst cap was not honored on ingestion spike.',
    termSettlements: { [termId]: 81_000 },
  });
  assert.equal(settled.ok, true);
  const calibrationPropagation = settled.propagations.find((entry) => entry.ruleId === 'RULE-NEG-07');
  assert.ok(calibrationPropagation, 'settlement event refreshes the derived calibration read model');
  assert.equal(calibrationPropagation.targetType, 'calibration');
  assert.match(calibrationPropagation.summary, /USD\/minimize/);
  assert.equal(store.state.events.filter((event) => event.summary.startsWith('[RULE-NEG-07]')).length, 1);

  // Replaying the same settlement payload must not duplicate its calibration audit propagation.
  const replayed = api.recordNegotiationSettlement(neg.id, {
    settledOn: '2026-10-26',
    realisedValue: 55_000,
    counterpartyDelivered: false,
    note: 'Overage charges reduced net realized value to $55k; burst cap was not honored on ingestion spike.',
    termSettlements: { [termId]: 81_000 },
  });
  assert.equal(replayed.ok, true);
  assert.equal(store.state.events.filter((event) => event.summary.startsWith('[RULE-NEG-07]')).length, 1, 'idempotent repeat does not duplicate RULE-NEG-07 audit events');

  const se = evaluateNegotiationSettlement(settled.negotiation);
  assert.equal(se.settled, true);
  assert.equal(se.sameUnitDealBatna, true);
  assert.equal(se.batnaBreached, true);
  assert.equal(se.status, 'batna-breach');
  assert.equal(se.realisationRatio, 0.6875);
  assert.equal(se.adverseTermCount, 1);
  assert.equal(se.adverseGovernanceTrigger, true);

  // RULE-NEG-06 must have appended a goal check-in and opened a DACI settlement review decision!
  const goalCheckins = store.state.goals[0].checkins;
  assert.ok(goalCheckins.some((c) => c.note.includes(`[RULE-NEG-06:${neg.id}:`)));
  const reviewDecision = store.state.decisions.find((d) => d.title.startsWith('Settlement review:'));
  assert.ok(reviewDecision, 'RULE-NEG-06 opens a DACI settlement review decision when BATNA or counterparty delivery is breached');

  // NEG-08 must now fire as a high-severity governance finding.
  const breachFindings = buildInsights(store.state, NOW, store.state.settings).findings.filter((f) => f.ruleId === 'NEG-08');
  assert.equal(breachFindings.length, 1);
  assert.equal(breachFindings[0].severity, 4);
  assert.match(breachFindings[0].title, /breached the walk-away BATNA/i);

  // Unit-honesty check: if BATNA unit is 'weeks' while stakesCurrency and term unit are 'USD', sameUnitDealBatna and batnaBreached are false.
  const mixedUnitEval = evaluateNegotiationSettlement({
    ...settled.negotiation,
    ourBatnaUnit: 'weeks',
    ourBatnaValue: 60_000,
  });
  assert.equal(mixedUnitEval.sameUnitDealBatna, false);
  assert.equal(mixedUnitEval.batnaBreached, false);

  // Reopening the negotiation must void the settlement cleanly.
  assert.equal(api.reopenNegotiation(neg.id, { status: 'active' }).ok, true);
  assert.equal(store.state.negotiations[0].settlement, null);
  assert.equal(store.state.negotiations[0].agreedTerms[0].settledValue, null);
});

test('Store & Rewind integrity: clearDemo scrubs dangling demo refs on negotiations and reconstructStateAt rewinds settlements and delegation recovery', () => {
  const { store, api } = harness();
  store.seedDemo({ force: true });
  const demoPersonId = store.state.people[0].id;
  const demoGoalId = store.state.goals[0].id;
  const userPerson = api.addPerson({ name: 'User Leader', startDate: '2026-01-01' });

  // User creates a negotiation referencing a demo owner and demo goal.
  const userNeg = api.addNegotiation({
    title: 'User retained negotiation',
    ownerId: demoPersonId,
    linkedGoalId: demoGoalId,
    ourBatnaDescription: 'Keep internal team.',
  });
  const nextState = store.clearDemo();
  assert.equal(nextState.negotiations.length, 1);
  const retained = store.state.negotiations.find((n) => n.id === userNeg.id);
  assert.ok(retained, 'user-created negotiation survives clearDemo');
  assert.equal(retained.ownerId, null, 'dangling demo ownerId scrubbed on clearDemo');
  assert.equal(retained.linkedGoalId, null, 'dangling demo linkedGoalId scrubbed on clearDemo');

  // Rewind integrity: settlement on 2026-10-26 and delegation recovery on 2026-10-26 rewind cleanly as of 2026-10-20.
  api.updateNegotiation(userNeg.id, {
    ownerId: userPerson.id,
    openedOn: '2026-10-10',
    stakesCurrency: 'USD',
    stakesValue: 40_000,
  });
  api.recordNegotiationAgreement(userNeg.id, {
    closedOn: '2026-10-15',
    agreedTerms: [{ text: 'Deliver audit', ownerId: userPerson.id, dueOn: '2026-11-01', agreedValue: 10, unit: 'days' }],
  });
  const delId = store.state.delegations[0].id;
  const termId = store.state.negotiations[0].agreedTerms[0].id;
  api.returnDelegation(delId, { returnedOn: '2026-10-18', returnReason: 'Scope change' });
  api.recoverNegotiationTerm(userNeg.id, termId, {
    personId: userPerson.id,
    delegatedOn: '2026-10-26',
    dueOn: '2026-11-10',
    recoveryNote: 'Recovered after 2026-10-20 snapshot.',
  });
  api.recordNegotiationSettlement(userNeg.id, {
    settledOn: '2026-10-26',
    realisedValue: 38_000,
    counterpartyDelivered: true,
    termSettlements: { [termId]: 10 },
  });

  const { state: rewound } = reconstructStateAt(store.state, '2026-10-20');
  const rewoundNeg = rewound.negotiations.find((n) => n.id === userNeg.id);
  assert.equal(rewoundNeg.settlement, null, 'settlement after asOfDay is rewound');
  assert.equal(rewoundNeg.agreedTerms[0].settledValue, null, 'term settledValue after asOfDay is rewound');
  const rewoundDel = rewound.delegations.find((d) => d.id === delId);
  assert.equal(rewoundDel.status, 'returned', 'return on 2026-10-18 is preserved at 2026-10-20');
  assert.equal(rewoundDel.supersededByDelegationId, null, 'recovery on 2026-10-26 is rewound at 2026-10-20');
});

test('CSV export includes additive lineage columns on delegations and settlement columns on negotiations', () => {
  const { store, api } = harness();
  const p1 = api.addPerson({ name: 'P1', startDate: '2025-01-01' });
  const p2 = api.addPerson({ name: 'P2', startDate: '2025-01-01' });
  const neg = api.addNegotiation({
    title: 'CSV Settlement Deal',
    ownerId: p1.id,
    openedOn: '2026-10-15',
    stakesCurrency: 'USD',
    stakesValue: 50_000,
    ourBatnaDescription: 'Walk away.',
    ourBatnaValue: 40_000,
    ourBatnaUnit: 'USD',
  });
  api.recordNegotiationAgreement(neg.id, {
    closedOn: '2026-10-20',
    agreedTerms: [{ text: 'Deliver integration', ownerId: p1.id, dueOn: '2026-11-05' }],
  });
  const delId = store.state.delegations[0].id;
  const termId = store.state.negotiations[0].agreedTerms[0].id;
  api.returnDelegation(delId, { returnedOn: '2026-10-24', returnReason: 'Blocked on vendor API' });
  api.recoverNegotiationTerm(neg.id, termId, {
    personId: p2.id,
    delegatedOn: '2026-10-26',
    dueOn: '2026-11-12',
    recoveryNote: 'Unblocked vendor sandbox and reassigned.',
  });
  api.recordNegotiationSettlement(neg.id, {
    settledOn: '2026-10-26',
    realisedValue: 48_000,
    counterpartyDelivered: true,
    note: 'Settled within ZOPA.',
  });

  const delCsv = exportWorkspaceCsv(store.state, 'delegations', { now: NOW });
  const delParsed = parseCsv(delCsv.csv);
  assert.ok(delParsed.headers.includes('prior_delegation_id'));
  assert.ok(delParsed.headers.includes('superseded_by_delegation_id'));
  assert.ok(delParsed.headers.includes('attempt_number'));

  const negCsv = exportWorkspaceCsv(store.state, 'negotiations', { now: NOW });
  const negParsed = parseCsv(negCsv.csv);
  assert.ok(negParsed.headers.includes('recovered_terms_count'));
  assert.ok(negParsed.headers.includes('realised_value'));
  assert.ok(negParsed.headers.includes('batna_breached'));
  const realIdx = negParsed.headers.indexOf('realised_value');
  assert.equal(negParsed.rows[0][realIdx], '48000');
});

test('UI: Recover returned term & Settle agreement dialogs on #/negotiations/:id and #/delegations work end-to-end and stay axe-clean', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const owner = app.store.state.people[0];
    const made = app.api.addNegotiation({
      title: 'UI Recovery & Settlement Deal',
      ownerId: owner.id,
      openedOn: '2026-10-15',
      stakesCurrency: 'USD',
      stakesValue: 12000,
      ourBatnaDescription: 'Walk away to internal staffing.',
      ourBatnaValue: 15000,
      ourBatnaUnit: 'USD',
      issues: [zopaIssue({ name: 'Annual platform commit', unit: 'USD', direction: 'minimize' })],
    });
    app.api.recordNegotiationAgreement(made.id, {
      closedOn: '2026-10-20',
      agreedTerms: [{ text: 'Staff weekend rotation desk', ownerId: owner.id, dueOn: '2026-11-05', agreedValue: 16, unit: 'hours' }],
    });
    const agreed = app.store.state.negotiations.find((n) => n.id === made.id);
    const del = app.store.state.delegations.find((d) => d.sourceNegotiationId === agreed.id);
    assert.ok(del);

    // Return the delegation so the term shows "Returned — needs recovery" and the "Recover term" button.
    app.api.returnDelegation(del.id, {
      returnedOn: '2026-10-25',
      returnReason: 'Competing release freeze priority',
    });

    app.navigate(`#/negotiations/${agreed.id}`);
    let viewText = env.document.querySelector('#view').textContent;
    assert.ok(viewText.includes('Returned — needs recovery'));
    assert.ok(viewText.includes('Agreement settlement & realization'));
    assert.ok(viewText.includes('Outside-view settlement context'));
    assert.ok(viewText.includes('Prior USD / minimize settlements: n=0. Counts only'), 'small historical samples show counts without a performance readout');

    // Click "Recover term" on #/negotiations/:id
    const recoverBtn = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => b.textContent.trim() === 'Recover term');
    assert.ok(recoverBtn, 'Recover term button renders for returned negotiated commitment');
    click(recoverBtn);

    let modal = env.document.querySelector('[role="dialog"], dialog, .modal');
    assert.ok(modal, 'Recover commitment dialog opens');
    const noteField = modal.querySelector('[name="recoveryNote"]');
    noteField.value = 'Protected sprint capacity and assigned backup lead.';
    noteField.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const recoverSubmit = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'Recover & delegate');
    click(recoverSubmit);

    viewText = env.document.querySelector('#view').textContent;
    assert.ok(viewText.includes('Recovered · attempt #2'), 'detail view shows recovered badge and attempt count');
    assert.ok(viewText.includes('Lineage: previously held by'), 'detail view renders prior owner lineage');

    // Open Settle agreement dialog and record settlement actuals
    const settleBtn = Array.from(env.document.querySelectorAll('#view button'))
      .find((b) => b.textContent.trim() === 'Record settlement');
    assert.ok(settleBtn, 'Record settlement button renders on agreed negotiation');
    click(settleBtn);

    modal = env.document.querySelector('[role="dialog"], dialog, .modal');
    assert.ok(modal, 'Settle agreement dialog opens');
    const realisedInput = modal.querySelector('[name="realisedValue"]');
    assert.equal(realisedInput.value, '', 'realised value is never pre-filled from the agreement');
    realisedInput.value = '12000';
    realisedInput.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const cpSelect = modal.querySelector('[name="counterpartyDelivered"]');
    cpSelect.value = 'yes';
    cpSelect.dispatchEvent(new env.window.Event('change', { bubbles: true }));
    const settleNote = modal.querySelector('[name="note"]');
    settleNote.value = 'Scope cut held through Q4 planning; full $12k capacity preserved.';
    settleNote.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const saveSettlement = Array.from(modal.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'Save settlement');
    click(saveSettlement);

    viewText = env.document.querySelector('#view').textContent;
    assert.ok(viewText.includes('Settled on agreed terms'));
    assert.ok(viewText.includes('100% of signed value'));
    assert.deepEqual(await axeViolations(env), [], 'zero axe violations on settled negotiation detail with lineage');

    // Navigate to #/delegations and verify the lineage badge and returned filter
    app.navigate('#/delegations?filter=returned');
    const delViewText = env.document.querySelector('#view').textContent;
    assert.ok(delViewText.includes('Recovered on'), 'returned delegation card shows recovery link');
    assert.deepEqual(await axeViolations(env), [], 'zero axe violations on #/delegations returned view');
    assert.deepEqual(env.consoleErrors, []);
  });
});
