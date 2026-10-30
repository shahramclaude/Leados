/**
 * tests/app/org-design.test.mjs — Schema v53, the Structural Design Terminal.
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. The v52 → v53 migration is additive: no design, no move and no
 *      prediction is invented for an existing workspace.
 *   2. Normalization keeps a dangling move as history rather than repairing it,
 *      drops a second move for the same person, clears an owner who left,
 *      clamps the band so a maximum can never sit below its minimum, and
 *      preserves a frozen snapshot verbatim.
 *   3. The reporting graph is exact: span is out-degree, layers is longest path,
 *      channels are n(n−1)/2 per unit with the manager included, and a cycle is
 *      cut and reported rather than silently rewritten.
 *   4. Coordination is priced from recorded pay and is `null` — never zero —
 *      where no pay exists, with the priced share printed beside the total.
 *   5. The decision queue is Kingman from each manager's own completed
 *      commitments: not measured below the floor, unstable (and `null`) at
 *      ρ ≥ 1, and reproducible against a hand-computed value.
 *   6. A simulation changes nothing on the roster, counts the people whose line
 *      or depth moves, and scales arrivals by coordination channels as declared.
 *   7. The Pareto frontier reports dominance and never invents a latency.
 *   8. The actions refuse what the module refuses: a nameless design, an edit to
 *      a committed design, a commit with no owner, no moves, a move that changes
 *      nothing, or a reporting cycle.
 *   9. Committing applies the reporting lines and freezes the prediction in one
 *      transaction; reverting restores exactly the recorded lines and leaves a
 *      line that changed again alone.
 *  10. One commit produces typed `structures` / `resizes` provenance, one
 *      residual decision, one owned scope task, at most three blameless prompts
 *      and one dated outcome review — idempotently.
 *  11. Settling appends a scored outcome, withheld below the floor, and refuses
 *      to settle before the declared review date without an explicit override.
 *  12. Signals, the Insights bucket, CSV scope #47 and demo cleanup behave.
 *  13. The page renders every tab and both dialogs keyboard-operably under JSDOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  ORG_CONVENTIONS,
  buildStructure,
  coefficientOfVariation,
  conventionsFromSettings,
  decisionRights,
  designPortfolio,
  freezeDesignSnapshot,
  gini,
  hhi,
  kingmanWait,
  median,
  orgDesignAttention,
  orgDesignBrief,
  orgDesignSignals,
  paretoFrontier,
  payIndex,
  personQueueModel,
  scaleQueue,
  scoreDesignPrediction,
  simulateDesign,
  structureReading,
  waitPercentiles,
} from '../../app/core/domain/orgDesign.js';
import {
  normalizeOrgConventions,
  normalizeOrgDesigns,
} from '../../app/core/domain/orgDesignSchema.js';
import { ORG_RULE_IDS, orgDesignRule } from '../../app/core/domain/orgDesignRules.js';
import { renderOrgDesign } from '../../app/views/orgDesign.js';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const TODAY = '2026-10-30';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

/**
 * One leader, three managers and fourteen ICs. Manager 2 holds nine direct
 * reports, which is one over the default band of eight; manager 3 holds two,
 * which is under the floor of three. That gives the reading a breach, a narrow
 * unit and an inside unit without inventing anything.
 */
function roster() {
  const people = [
    { id: 'p-lead', name: 'Lead', role: 'Head of Ops', level: 'lead', managerId: null, status: 'active', startDate: '2024-01-01', talkingPoints: [] },
    { id: 'p-m1', name: 'Mara', role: 'Platform lead', level: 'manager', managerId: 'p-lead', status: 'active', startDate: '2024-02-01', talkingPoints: [] },
    { id: 'p-m2', name: 'Ivo', role: 'Service lead', level: 'manager', managerId: 'p-lead', status: 'active', startDate: '2024-03-01', talkingPoints: [] },
    { id: 'p-m3', name: 'Bea', role: 'Data lead', level: 'manager', managerId: 'p-lead', status: 'active', startDate: '2024-04-01', talkingPoints: [] },
  ];
  const assign = (prefix, count, managerId) => {
    for (let i = 1; i <= count; i += 1) {
      people.push({
        id: `${prefix}-${i}`,
        name: `${prefix.toUpperCase()} ${i}`,
        role: 'Engineer',
        level: 'ic',
        managerId,
        status: 'active',
        startDate: '2025-01-15',
        talkingPoints: [],
      });
    }
  };
  assign('a', 3, 'p-m1');
  assign('b', 9, 'p-m2');
  assign('c', 2, 'p-m3');
  return people;
}

/** Six completed delegations for p-m2 with a known median of four days. */
function delegations() {
  const spans = [2, 3, 4, 4, 5, 6];
  return spans.map((days, index) => ({
    id: `del-${index + 1}`,
    personId: 'p-m2',
    title: `Completed work ${index + 1}`,
    expectedOutcome: 'Done',
    authority: 'act-inform',
    support: '',
    delegatedOn: `2026-09-${String(1 + index).padStart(2, '0')}`,
    dueOn: '2026-10-20',
    status: 'done',
    checkins: [],
    completedOn: `2026-09-${String(1 + index + days).padStart(2, '0')}`,
    completionNote: '',
  }));
}

function makeStore() {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v53-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  return { store, api };
}

function seed(store, { withPay = true, withQueue = true } = {}) {
  store.update((draft) => {
    draft.people = roster();
    draft.delegations = withQueue ? delegations() : [];
    draft.decisions = [
      { id: 'dec-1', title: 'Call one', question: 'q', date: '2026-09-01', approver: 'Lead', driver: 'Lead', decidedOn: '2026-09-02' },
      { id: 'dec-2', title: 'Call two', question: 'q', date: '2026-09-03', approver: 'Lead', driver: 'Lead', decidedOn: null },
    ];
    draft.meritCycles = withPay
      ? [{
        id: 'merit-1',
        label: 'Recorded pay',
        currency: 'USD',
        effectiveOn: '2026-01-01',
        status: 'draft',
        budget: { kind: 'amount', value: 1000 },
        comparison: { dimension: 'origin' },
        ownerId: null,
        rows: [
          { personId: 'p-m1', level: 'manager', currentPay: 120000, proposedPay: 120000, origin: 'internal', retentionConcern: false, note: '' },
          { personId: 'p-m2', level: 'manager', currentPay: 130000, proposedPay: 130000, origin: 'internal', retentionConcern: false, note: '' },
        ],
        audit: null,
        outcomes: [],
      }]
      : [];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed a roster with recorded reporting lines' });
}

function newDesign(api) {
  const created = api.addOrgDesign({ label: 'Split the service unit', purpose: 'Two leads stop re-deciding the same call.', ownerId: 'p-lead' });
  assert.equal(created.ok, true, created.error);
  return created.id;
}

/* --------------------------------------------------------------- migration */

test('v52 → v53 is additive: no design, move or prediction is invented', () => {
  assert.equal(SCHEMA_VERSION, 59);
  const applied = migrate({ schemaVersion: 52, people: [{ id: 'p1', name: 'Someone' }] });
  assert.deepEqual(applied.applied, ['52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59']);
  assert.deepEqual(applied.raw.orgDesigns, []);
  const normalized = normalizeState(applied.raw, { now: NOW });
  assert.deepEqual(normalized.state.orgDesigns, []);
  assert.equal(normalized.state.schemaVersion, 59);
  // The migration chain still reaches the current version from the oldest blob.
  const fromOne = migrate({ schemaVersion: 1 });
  assert.equal(fromOne.raw.schemaVersion, 59);
  assert.deepEqual(fromOne.applied.at(-1), '58 → 59');
});

test('normalization keeps history, refuses duplicates and clamps the band', () => {
  const state = { people: roster() };
  const warnings = [];
  const [design] = normalizeOrgDesigns([{
    id: 'od-1',
    label: '  A   structural   design ',
    purpose: 'why',
    ownerId: 'gone-away',
    status: 'commit',
    declaredOn: 'not-a-day',
    conventions: { spanMin: 12, spanMax: 4, coordinationHoursPerWeek: 99, loadedHoursPerWeek: 2 },
    moves: [
      { personId: 'p-m1', toManagerId: 'p-lead' },
      { personId: 'p-m1', toManagerId: 'p-m2' },
      { personId: 'vanished', toManagerId: 'p-m2' },
    ],
    previousManagers: [{ personId: 'p-m1', managerId: 'p-lead' }, { personId: 'p-m1', managerId: 'p-m2' }],
    snapshot: { capturedAt: '2026-10-01T00:00:00.000Z', predicted: { modelledWaitP80Weeks: 1.5 } },
  }], state, NOW, warnings);

  assert.equal(design.label, 'A structural design');
  assert.equal(design.ownerId, null, 'an owner who left is cleared, not guessed');
  assert.equal(design.status, 'draft', 'an unknown status falls back to draft, never to committed');
  assert.equal(design.declaredOn, TODAY);
  assert.equal(design.moves.length, 2, 'the duplicate move is dropped');
  assert.ok(design.moves.some((move) => move.personId === 'vanished'), 'a dangling move is kept as history');
  assert.ok(warnings.some((warning) => /no longer in the roster/.test(warning)));
  assert.ok(warnings.some((warning) => /duplicate move/.test(warning)));
  // Band integrity: minimum clamped to 30 and the maximum forced above it.
  assert.ok(design.conventions.spanMax > design.conventions.spanMin);
  assert.equal(design.conventions.coordinationHoursPerWeek, 12);
  assert.equal(design.conventions.loadedHoursPerWeek, 20);
  assert.equal(design.snapshot.predicted.modelledWaitP80Weeks, 1.5, 'the frozen prediction survives normalization');
  assert.equal(design.previousManagers.length, 1, 'a duplicate previous-manager row is dropped');

  // normalizeOrgConventions is total: garbage in, a usable band out.
  const conventions = normalizeOrgConventions({ spanMin: 'x', spanMax: null });
  assert.equal(conventions.spanMin, ORG_CONVENTIONS.spanMin);
  assert.ok(conventions.spanMax > conventions.spanMin);
});

/* ---------------------------------------------------------------- structure */

test('the reporting graph is exact and a cycle is cut and reported', () => {
  const structure = buildStructure({ people: roster() });
  assert.equal(structure.headcount, 18);
  assert.equal(structure.layers, 3);
  assert.deepEqual(structure.roots, ['p-lead']);
  const byManager = new Map(structure.units.map((unit) => [unit.managerId, unit]));
  assert.equal(byManager.get('p-lead').span, 3);
  assert.equal(byManager.get('p-m1').span, 3);
  assert.equal(byManager.get('p-m2').span, 9);
  // Brooks: (k+1)k/2 with the manager inside the unit.
  assert.equal(byManager.get('p-lead').channels, 6);
  assert.equal(byManager.get('p-m1').channels, 6);
  assert.equal(byManager.get('p-m2').channels, 45);
  assert.equal(byManager.get('p-m3').channels, 3);

  const cyclic = roster().map((person) => (
    person.id === 'p-lead' ? { ...person, managerId: 'p-m1' } : person
  ));
  const cut = buildStructure({ people: cyclic });
  assert.ok(cut.issues.cycles.length >= 1, 'the cycle is reported rather than hidden');
  assert.equal(cut.unreachable.length, 0, 'everyone is still reachable after the cut');

  const selfManaged = roster().map((person) => (person.id === 'p-m1' ? { ...person, managerId: 'p-m1' } : person));
  assert.deepEqual(buildStructure({ people: selfManaged }).issues.selfManaged, ['p-m1']);

  const dangling = roster().map((person) => (person.id === 'p-m3' ? { ...person, managerId: 'ghost' } : person));
  assert.deepEqual(buildStructure({ people: dangling }).issues.missingManager, ['p-m3']);
});

test('span, layers and coordination are read against the declared band', () => {
  const state = { people: roster(), settings: { orgSpanMin: 3, orgSpanMax: 8, orgCoordinationHoursPerWeek: 2 } };
  const reading = structureReading(state, buildStructure(state), { now: NOW, conventions: conventionsFromSettings(state) });
  assert.equal(reading.span.max, 9);
  assert.equal(reading.span.median, 3);
  assert.equal(reading.span.overBandCount, 1, 'only the nine-report unit is over the band');
  assert.equal(reading.span.overBand[0].managerId, 'p-m2');
  assert.equal(reading.span.overBand[0].over, 1);
  assert.equal(reading.span.underBandCount, 1, 'the two-report unit is under the floor');
  assert.equal(reading.coordination.channels, 60);
  assert.equal(reading.coordination.hoursPerWeek, 120, '60 channels × the declared 2 hours');
  assert.equal(reading.verdict.id, 'over-band');
  assert.match(reading.verdict.detail, /declared maximum of 8/);
});

test('coordination money comes from recorded pay, and is absent — never zero — without it', () => {
  const withoutPay = { people: roster() };
  const unpriced = structureReading(withoutPay, buildStructure(withoutPay), { now: NOW });
  assert.equal(unpriced.coordination.annualCost, null);
  assert.equal(unpriced.coordination.pricedUnits, 0);
  assert.match(unpriced.coordination.note, /absent, not zero/i);
  assert.ok(unpriced.units.every((unit) => unit.annualCost === null));
  assert.deepEqual(payIndex(withoutPay, NOW).size, 0);

  const paid = {
    people: roster(),
    meritCycles: [{
      id: 'merit-1',
      effectiveOn: '2026-01-01',
      rows: [
        { personId: 'p-m1', currentPay: 104000 },
        { personId: 'p-m2', currentPay: 208000 },
        { personId: 'p-m3', currentPay: null },
        { personId: 'p-lead', currentPay: 260000 },
      ],
    }],
  };
  const priced = structureReading(paid, buildStructure(paid), { now: NOW });
  assert.equal(priced.coordination.pricedUnits, 3, 'three of four units have a priced manager');
  assert.ok(priced.coordination.annualCost > 0);
  assert.ok(priced.coordination.pricedShare > 0 && priced.coordination.pricedShare < 1);
  // Hourly rate: annual / (52 × 40).
  const m1 = priced.units.find((unit) => unit.managerId === 'p-m1');
  assert.equal(m1.hourlyRate, 50);
  assert.equal(m1.annualCost, 50 * m1.hoursPerWeek * 52);
  const m3 = priced.units.find((unit) => unit.managerId === 'p-m3');
  assert.equal(m3.annualCost, null, 'a blank pay figure stays blank');
});

/* -------------------------------------------------------------------- queue */

test('Kingman wait is exact and unstable queues return no finite answer', () => {
  // ρ = 0.5, Ts = 1, Ca = Cs = 1 → Wq = (0.5/0.5) × 1 × 1 = 1.
  assert.equal(kingmanWait({ utilisation: 0.5, serviceTime: 1, ca: 1, cs: 1 }), 1);
  // ρ = 0.8, Ts = 2, variability factor (1+4)/2 = 2.5 → 4 × 2.5 × 2 = 20.
  assert.equal(kingmanWait({ utilisation: 0.8, serviceTime: 2, ca: 1, cs: 2 }), 20);
  assert.equal(kingmanWait({ utilisation: 0, serviceTime: 1 }), 0);
  assert.equal(kingmanWait({ utilisation: 1, serviceTime: 1 }), null, 'an unstable queue has no finite wait');
  assert.equal(kingmanWait({ utilisation: 1.4, serviceTime: 1 }), null);
  const tails = waitPercentiles(1);
  assert.ok(tails.p50 < tails.p80 && tails.p80 < tails.p90);
  assert.deepEqual(waitPercentiles(null), { p50: null, p80: null, p90: null });
});

test('the decision queue is measured per manager and refuses to guess', () => {
  const state = { people: roster(), delegations: delegations() };
  const measured = personQueueModel(state, 'p-m2', { now: NOW });
  assert.equal(measured.status, 'measured');
  assert.equal(measured.sample, 6);
  assert.equal(measured.serviceDaysMedian, 4, 'the median of 2,3,4,4,5,6');
  assert.ok(measured.utilisation > 0 && measured.utilisation < 1);
  assert.ok(measured.waitWeeks > 0);
  assert.match(measured.basis, /λ = /);
  assert.match(measured.basis, /Ca assumed 1/);

  // One completion is an anecdote, not a service rate.
  const thin = personQueueModel({ people: roster(), delegations: delegations().slice(0, 2) }, 'p-m2', { now: NOW });
  assert.equal(thin.status, 'insufficient');
  assert.equal(thin.utilisation, null);
  assert.equal(thin.waitWeeks, null);
  assert.match(thin.basis, /at least 3/);

  // An overloaded manager is unstable, and says so instead of printing a wait.
  const many = Array.from({ length: 24 }, (_, index) => ({
    id: `del-x-${index}`,
    personId: 'p-m2',
    delegatedOn: '2026-09-01',
    completedOn: '2026-10-01',
    status: 'done',
  }));
  const unstable = personQueueModel({ people: roster(), delegations: many }, 'p-m2', { now: NOW });
  assert.equal(unstable.utilisation >= 1 ? unstable.status : 'measured', 'unstable');
  assert.equal(unstable.waitWeeks, null);
});

test('the counterfactual scales arrivals by channels and says it is a model', () => {
  const state = { people: roster(), delegations: delegations() };
  const base = personQueueModel(state, 'p-m2', { now: NOW });
  const scaled = scaleQueue(base, { channelsBefore: 45, channelsAfter: 15 });
  assert.equal(scaled.scaled, true);
  assert.ok(scaled.factor < 1);
  assert.ok(scaled.utilisation < base.utilisation, 'fewer channels means a shorter queue');
  assert.match(scaled.modelNote, /declared convention, not a measurement/);

  const thin = scaleQueue(personQueueModel({ people: roster(), delegations: [] }, 'p-m2', { now: NOW }), { channelsBefore: 1, channelsAfter: 3 });
  assert.equal(thin.scaled, false);
  assert.equal(thin.model, null);
  assert.match(thin.modelNote, /invented rather than derived/);
});

/* --------------------------------------------------------------- simulation */

test('a simulation writes nothing, and counts the people whose line or depth moves', () => {
  const { store } = makeStore();
  seed(store);
  const before = JSON.stringify(store.state.people.map((person) => [person.id, person.managerId]));
  const design = {
    id: 'od-1',
    label: 'Split',
    conventions: { ...ORG_CONVENTIONS },
    status: 'draft',
    moves: [
      // Move four of Ivo's nine reports under Mara: span 9 → 5 and 3 → 7.
      { personId: 'b-1', toManagerId: 'p-m1' },
      { personId: 'b-2', toManagerId: 'p-m1' },
      { personId: 'b-3', toManagerId: 'p-m1' },
      { personId: 'b-4', toManagerId: 'p-m1' },
    ],
  };
  const sim = simulateDesign(store.state, design, { now: NOW });
  assert.equal(JSON.stringify(store.state.people.map((person) => [person.id, person.managerId])), before, 'the roster is untouched');
  assert.equal(sim.delta.moved, 4);
  assert.equal(sim.baseline.span.max, 9);
  assert.equal(sim.proposed.span.max, 7);
  assert.equal(sim.proposed.span.overBandCount, 0);
  assert.ok(sim.delta.coordinationHoursPerWeek < 0, 'fewer channels inside the two units');
  // The modelled wait exists only because a measured queue exists for p-m2.
  assert.ok(sim.queueModel.some((row) => row.managerId === 'p-m2' && row.measured));
  assert.ok(sim.objectives.disruption === 4);
  assert.deepEqual(sim.delta.movedPeople.map((row) => row.personId).sort(), ['b-1', 'b-2', 'b-3', 'b-4']);
});

test('the frontier reports dominance and never ranks on an invented latency', () => {
  const frontier = paretoFrontier([
    { designId: 'a', label: 'A', objectives: { coordination: 10, span: 0, latency: null, disruption: 2 } },
    { designId: 'b', label: 'B', objectives: { coordination: 10, span: 0, latency: null, disruption: 2 } },
    { designId: 'c', label: 'C', objectives: { coordination: 12, span: 0, latency: null, disruption: 2 } },
  ]);
  const byId = new Map(frontier.rows.map((row) => [row.designId, row]));
  assert.equal(byId.get('a').frontier, true);
  assert.equal(byId.get('b').frontier, true, 'an identical design is not dominated');
  assert.equal(byId.get('c').frontier, false, 'worse on coordination at equal everything else');
  assert.deepEqual(byId.get('c').dominatedBy.sort(), ['a', 'b']);
  assert.equal(frontier.missingLatency, 3);
  assert.match(frontier.note, /never ranked on an imputed latency/);
});

/* ------------------------------------------------------------------ actions */

test('the actions refuse a nameless design, a late edit, and a no-op commit', () => {
  const { store, api } = makeStore();
  seed(store);
  assert.equal(api.addOrgDesign({ label: '   ' }).ok, false);
  const id = newDesign(api);

  // A committed design is evidence, not a draft.
  const moved = api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] });
  assert.equal(moved.ok, true, moved.error);
  assert.equal(api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'b-1' }] }).ok, false, 'self-management refused');
  assert.equal(api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }, { personId: 'b-1', toManagerId: 'p-m3' }] }).ok, false, 'one manager per person');
  assert.equal(api.commitOrgDesign(id).ok, true, 'an owner and a real move commit');
  assert.equal(api.updateOrgDesign(id, { label: 'Rename' }).ok, false, 'a committed design cannot be edited');

  // A design that describes the reporting lines that already exist changes nothing.
  // b-1 is now under Mara, so proposing exactly that is a no-op.
  const noop = newDesign(api);
  api.updateOrgDesign(noop, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] });
  const result = api.commitOrgDesign(noop);
  assert.equal(result.ok, false);
  assert.match(result.error, /change nothing/);

  // A missing owner is refused, and the message says why the work needs one.
  const ownerless = api.addOrgDesign({ label: 'Unowned' });
  api.updateOrgDesign(ownerless.id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] });
  const refused = api.commitOrgDesign(ownerless.id);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /owner/i);

  // A reporting cycle is refused before anything is written.
  const cyclic = newDesign(api);
  api.updateOrgDesign(cyclic, { moves: [{ personId: 'p-m1', toManagerId: 'b-1' }, { personId: 'b-1', toManagerId: 'p-m1' }] });
  const cycleResult = api.commitOrgDesign(cyclic);
  assert.equal(cycleResult.ok, false);
  assert.match(cycleResult.error, /cycle/i);
});

test('commit applies the lines, freezes the prediction, and revert restores exactly the record', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  api.updateOrgDesign(id, {
    moves: [
      { personId: 'b-1', toManagerId: 'p-m1' },
      { personId: 'b-2', toManagerId: 'p-m1' },
      { personId: 'b-3', toManagerId: 'p-m1' },
      { personId: 'b-4', toManagerId: 'p-m1' },
    ],
  });
  const before = store.state.people.find((person) => person.id === 'b-1').managerId;
  assert.equal(before, 'p-m2');
  const result = api.commitOrgDesign(id);
  assert.equal(result.ok, true, result.error);
  const design = store.state.orgDesigns.find((row) => row.id === id);
  assert.equal(design.status, 'committed');
  assert.equal(design.committedOn, TODAY);
  assert.ok(design.reviewOn > TODAY);
  assert.equal(store.state.people.find((person) => person.id === 'b-1').managerId, 'p-m1');
  assert.equal(design.snapshot.after.maxSpan, 7);
  assert.equal(design.snapshot.after.overBandCount, 0);
  assert.equal(design.snapshot.previousManagers.length, 4);
  assert.equal(design.snapshot.appliedMoves[0].fromManagerId, 'p-m2');
  assert.ok(design.snapshot.predicted.perManager['p-m2'], 'a per-manager prediction is frozen');

  // A line changed again after the commit is not quietly overwritten.
  store.update((draft) => {
    draft.people.find((person) => person.id === 'b-2').managerId = 'p-m3';
  }, { type: 'test.edit', entity: 'person', entityId: 'b-2', summary: 'Someone moved b-2 again' });
  const reverted = api.revertOrgDesign(id);
  assert.equal(reverted.ok, true, reverted.error);
  assert.equal(reverted.restored, 3);
  assert.equal(reverted.skipped, 1);
  assert.equal(store.state.people.find((person) => person.id === 'b-1').managerId, 'p-m2', 'b-1 is back with its recorded manager');
  assert.equal(store.state.people.find((person) => person.id === 'b-2').managerId, 'p-m3', 'the later decision stands');
  assert.equal(store.state.orgDesigns.find((row) => row.id === id).status, 'reverted');
  // Reverting again is refused: a reverted design is history.
  assert.equal(api.revertOrgDesign(id).ok, false);
});

/* -------------------------------------------------------------------- rules */

test('one commit produces provenance, one residual decision, one task and blameless prompts', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  // Move two reports off the over-band unit only: Ivo keeps seven, which is
  // inside the band; Mara goes to five. Nothing is left over the band.
  api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }, { personId: 'b-2', toManagerId: 'p-m1' }] });
  const decisionsBefore = store.state.decisions.length;
  const delegationsBefore = store.state.delegations.length;
  const result = api.commitOrgDesign(id);
  assert.equal(result.ok, true, result.error);

  const design = store.state.orgDesigns.find((row) => row.id === id);
  const links = store.state.links.filter((link) => link.sourceType === 'orgdesign' && link.sourceId === id);
  assert.ok(links.some((link) => link.relation === 'structures' && link.targetId === 'b-1'));
  assert.ok(links.some((link) => link.relation === 'resizes' && link.targetId === 'p-m1'));

  // No unit is over the band any more, so no residual decision is opened — the
  // module is quiet when there is nothing to decide.
  const residual = store.state.decisions.filter((row) => row.question.includes('[ORD-RESIDUAL:'));
  assert.equal(residual.length, 0);

  // The dated outcome review is always opened on a commit.
  const reviews = store.state.decisions.filter((row) => row.question.includes('[ORD-REVIEW:'));
  assert.equal(reviews.length, 1);
  assert.ok(reviews[0].reviewOn >= TODAY);
  assert.match(reviews[0].question, /Max span|max span/);

  // At most three blameless prompts, one per moved person.
  const prompts = store.state.people.filter((person) => (person.talkingPoints || []).some((point) => point.includes('[ORD-MOVED:')));
  assert.ok(prompts.length <= 3);
  assert.ok(prompts.length >= 1);
  assert.ok(prompts.every((person) => (person.talkingPoints || []).every((point) => !/lazy|careless|blame/i.test(point))));

  // No delegation is opened when the structure is inside the band.
  assert.equal(store.state.delegations.length, delegationsBefore);

  // Re-scanning is idempotent: no duplicate decision, no duplicate prompt.
  const decisionsAfterCommit = store.state.decisions.length;
  api.scanOrgDesign(id);
  api.scanOrgDesign(id);
  assert.equal(store.state.decisions.length, decisionsAfterCommit);
  assert.ok(store.state.decisions.length >= decisionsBefore);
});

test('a design that leaves a unit over the band opens exactly one mechanism decision and one owned task', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  // Move one of Mara's reports under Bea: Ivo keeps all nine, so the unit that
  // was over the band stays over it. That is the case this rule exists for.
  api.updateOrgDesign(id, { moves: [{ personId: 'a-1', toManagerId: 'p-m3' }] });
  const result = api.commitOrgDesign(id);
  assert.equal(result.ok, true, result.error);

  const residual = store.state.decisions.filter((row) => row.question.includes('[ORD-RESIDUAL:'));
  assert.equal(residual.length, 1, 'exactly one structural decision, never one per person');
  assert.match(residual[0].question, /Ivo/);
  assert.equal(residual[0].options.length, 3);
  assert.match(residual[0].question, /never a private arrangement|deliberately not an option/i);

  const tasks = store.state.delegations.filter((row) => String(row.support).includes('[ORD-SCOPE:'));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].personId, 'p-m2');
  assert.equal(tasks[0].status, 'active');

  const links = store.state.links.filter((link) => link.sourceType === 'orgdesign' && link.sourceId === id);
  assert.ok(links.some((link) => link.relation === 'screens' && link.targetId === residual[0].id));
  assert.ok(links.some((link) => link.relation === 'tracks-followup' && link.targetId === tasks[0].id));

  // A second scan cannot duplicate either obligation.
  api.scanOrgDesign(id);
  assert.equal(store.state.decisions.filter((row) => row.question.includes('[ORD-RESIDUAL:')).length, 1);
  assert.equal(store.state.delegations.filter((row) => String(row.support).includes('[ORD-SCOPE:')).length, 1);
});

test('settling scores the frozen prediction, refuses an early settle, and withholds below the floor', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] });
  assert.equal(api.commitOrgDesign(id).ok, true);

  const early = api.settleOrgDesign(id);
  assert.equal(early.ok, false);
  assert.match(early.error, /review date/);

  const design = store.state.orgDesigns.find((row) => row.id === id);
  const score = scoreDesignPrediction(store.state, design, { now: NOW });
  assert.equal(score.status, 'insufficient', 'one measured manager is below the floor of three');
  assert.equal(score.medianApePct, null);

  const forced = api.settleOrgDesign(id, { force: true });
  assert.equal(forced.ok, true, forced.error);
  const settled = store.state.orgDesigns.find((row) => row.id === id);
  assert.equal(settled.status, 'settled');
  assert.equal(settled.outcomes.length, 1);
  assert.equal(settled.outcomes[0].medianApePct, null, 'an unscored outcome is recorded as unscored');
  assert.ok(settled.snapshot, 'the frozen snapshot survives settlement');
  assert.equal(api.settleOrgDesign(id, { force: true }).ok, false, 'settling twice is refused');
});

/* -------------------------------------------------------- signals and export */

test('signals fire on a span breach and a stale design, and the bucket is counted', () => {
  const { store, api } = makeStore();
  seed(store);
  const signals = orgDesignSignals(store.state, NOW);
  const span = signals.find((signal) => signal.ruleId === 'ORD-01');
  assert.ok(span, 'a nine-report unit is a signal against a band of eight');
  assert.match(span.title, /Ivo holds 9 direct reports/);
  assert.ok(signals.every((signal) => signal.domain === 'Structural design'));
  assert.ok(orgDesignAttention(store.state, NOW) >= 1);

  const insights = buildInsights(store.state, NOW);
  const bucket = insights.byDomain.find((row) => row.domain === 'Structural design');
  assert.ok(bucket && bucket.count >= 1, 'the domain is listed, or the roll-up would silently drop it');

  // A draft left uncommitted for a month becomes a decision-shaped finding.
  api.addOrgDesign({ label: 'Old idea', ownerId: 'p-lead' });
  store.update((draft) => {
    draft.orgDesigns[0].declaredOn = '2026-09-01';
  }, { type: 'test.edit', entity: 'orgdesign', entityId: 'od', summary: 'Age the draft' });
  assert.ok(orgDesignSignals(store.state, NOW).some((signal) => signal.ruleId === 'ORD-03'));

  // The brief is deterministic and states its limits.
  const brief = orgDesignBrief(store.state, NOW);
  assert.equal(brief, orgDesignBrief(store.state, NOW));
  assert.match(brief, /STRUCTURAL DESIGN BRIEF/);
  assert.match(brief, /convention, not an estimate/);
  assert.doesNotMatch(brief, /\bMara\b|\bIvo\b|\bBea\b|\bLead\b/);
});

test('CSV scope #47 carries counts only and never a name, identifier or label', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] });
  api.commitOrgDesign(id);

  assert.equal(CSV_EXPORTS.length, 51);
  const scope = CSV_EXPORTS.find((entry) => entry.key === 'orgdesign');
  assert.ok(scope);
  const csv = exportWorkspaceCsv(store.state, 'orgdesign', { now: NOW }).csv;
  assert.match(csv, /design_code/);
  assert.match(csv, /median_ape_pct/);
  assert.doesNotMatch(csv, /Split the service unit/, 'no label');
  assert.doesNotMatch(csv, /Mara|Ivo|Bea|Lead/, 'no name');
  assert.doesNotMatch(csv, /p-m1|b-1|od-v53/, 'no identifier');

  // A workspace with no design still exports its live reading, honestly marked.
  const { store: bare } = makeStore();
  seed(bare);
  const live = exportWorkspaceCsv(bare.state, 'orgdesign', { now: NOW }).csv;
  assert.match(live, /live-structure/);
  assert.doesNotMatch(live, /Mara/);
});

test('the rule is registered on the shared spine, the catalog and the graph', () => {
  assert.equal(ORG_RULE_IDS.LINKED, 'RULE-ORD-01');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'orgDesignRule'));
  const index = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.name === 'orgDesignRule');
  const tempo = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.name === 'decisionTempoRule');
  assert.ok(index >= 0 && index < tempo, 'it runs before decision tempo so an opened decision is timeboxed in the same write');
  assert.ok(PROPAGATION_CONTRACTS.some((contract) => contract.rule.name === 'orgDesignRule'));
  for (const id of ['RULE-ORD-01', 'RULE-ORD-02', 'RULE-ORD-03', 'RULE-ORD-04', 'RULE-ORD-05']) {
    assert.ok(AUTOMATION_RULES.some((rule) => rule.id === id), `${id} is catalogued`);
  }
  assert.ok(LINK_ENTITY_TYPES.includes('orgdesign'));
  for (const relation of ['structures', 'resizes']) {
    assert.ok(LINK_RELATIONS.includes(relation), `${relation} is a declared relation`);
  }
  const state = createEmptyState(NOW.toISOString());
  state.orgDesigns = [{ id: 'od-1', label: 'x', status: 'draft', moves: [] }];
  const resolved = resolveLinkedEntity(state, 'orgdesign', 'od-1');
  assert.equal(resolved.route, '#/orgdesign?design=od-1');
  // An unrelated event does nothing at all.
  assert.deepEqual(orgDesignRule(state, { event: { type: 'case.created', entity: 'case', entityId: 'c1' }, now: NOW }), []);
  // The pause switch stops the automatic side, not an explicit scan.
  state.settings.orgAutoPropagate = false;
  assert.deepEqual(orgDesignRule(state, { event: { type: 'orgdesign.committed', entity: 'orgdesign', entityId: 'od-1' }, now: NOW }), []);
});

test('demo cleanup drops moves for removed demo people and keeps a frozen snapshot', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }, { personId: 'b-2', toManagerId: 'p-m1' }] });
  api.commitOrgDesign(id);
  // Mark one moved person as a demo record and one as real.
  store.update((draft) => {
    draft.people = draft.people.map((person) => (person.id === 'b-2' ? { ...person, id: 'b-2-demo-9' } : person));
    draft.orgDesigns[0].moves = draft.orgDesigns[0].moves.map((move) => (
      move.personId === 'b-2' ? { ...move, personId: 'b-2-demo-9' } : move
    ));
    draft.orgDesigns[0].previousManagers = draft.orgDesigns[0].previousManagers.map((row) => (
      row.personId === 'b-2' ? { ...row, personId: 'b-2-demo-9' } : row
    ));
  }, { type: 'test.edit', entity: 'workspace', entityId: '', summary: 'Mark one person as demo' });
  const frozen = JSON.parse(JSON.stringify(store.state.orgDesigns[0].snapshot));
  store.clearDemo();
  const retained = store.state.orgDesigns.find((row) => row.id === id);
  assert.ok(retained, 'a retained design survives');
  assert.equal(retained.moves.length, 1, 'the move for the removed demo person is dropped');
  assert.deepEqual(retained.snapshot, frozen, 'the frozen snapshot is kept verbatim');
  assert.ok((retained.history || []).some((entry) => entry.type === 'demo-cleanup'));
});

/* ---------------------------------------------------------------------- DOM */

function renderInDom(state, hash = '#/orgdesign') {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { virtualConsole, url: `https://leados.test/${hash}` });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.localStorage = window.localStorage;
  const query = new URLSearchParams(hash.split('?')[1] || '');
  const ctx = {
    state,
    now: NOW,
    today: TODAY,
    query,
    api: { scanOrgDesign: () => ({ ok: true, changed: false }) },
    navigate: () => {},
    refresh: () => {},
  };
  const node = renderOrgDesign(ctx);
  window.document.getElementById('app').append(node);
  return { window, node };
}

test('every tab renders, tables are captioned, and the page states its limits', () => {
  const { store, api } = makeStore();
  seed(store);
  const id = newDesign(api);
  api.updateOrgDesign(id, { moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] });
  api.commitOrgDesign(id);

  const panels = ['structure', 'coordination', 'queue', 'designs', 'rights', 'method'];
  for (const panel of panels) {
    const { window, node } = renderInDom(store.state, `#/orgdesign?panel=${panel}`);
    const doc = window.document;
    assert.equal(node.querySelectorAll('h1').length, 1, `${panel}: exactly one h1`);
    assert.equal(doc.querySelectorAll('table:not([aria-label])').length, 0, `${panel}: every table is named`);
    assert.equal(doc.querySelectorAll('th:empty').length, 0, `${panel}: no empty header cell`);
    const tabs = doc.querySelectorAll('[role="tab"]');
    assert.equal(tabs.length, 6, `${panel}: six tabs`);
    assert.ok([...tabs].filter((tab) => tab.getAttribute('aria-selected') === 'true').length === 1, `${panel}: exactly one tab selected`);
    assert.ok(doc.body.textContent.length > 0);
    window.close();
  }

  const { window } = renderInDom(store.state, '#/orgdesign?panel=method');
  const text = window.document.body.textContent;
  assert.match(text, /Kingman/);
  assert.match(text, /not measured/);
  assert.match(text, /unpriced|no manager has recorded pay/);
  assert.match(text, /Not claimed/);
  window.close();
});

test('an empty workspace renders a real dead end rather than a broken page', () => {
  const state = createEmptyState(NOW.toISOString());
  const { window, node } = renderInDom(state, '#/orgdesign');
  assert.ok(node);
  assert.match(window.document.body.textContent, /No reporting lines recorded/);
  window.close();
  const designs = renderInDom(state, '#/orgdesign?panel=designs');
  assert.match(designs.window.document.body.textContent, /No structural design declared/);
  designs.window.close();
});

test('statistics helpers are total and honest about small samples', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(coefficientOfVariation([5]), null);
  assert.equal(gini([5]), null);
  assert.equal(gini([0, 0]), null);
  assert.equal(hhi([]), null);
  assert.equal(hhi([10, 10]), 5000);
  assert.equal(decisionRights({ decisions: [] }).hhi, null);
  assert.equal(decisionRights({ decisions: [{ approver: 'A' }, { approver: 'A' }, { approver: 'B' }] }).topSharePct, 66.7);
  // freezeDesignSnapshot separates measured from modelled, and the score reads
  // the per-manager predictions rather than a workspace average.
  const { store } = makeStore();
  seed(store);
  const sim = simulateDesign(store.state, { id: 'x', label: 'x', conventions: { ...ORG_CONVENTIONS }, moves: [{ personId: 'b-1', toManagerId: 'p-m1' }] }, { now: NOW });
  const snapshot = freezeDesignSnapshot(sim, { capturedAt: NOW.toISOString(), previousManagers: [] });
  assert.ok(Object.keys(snapshot.predicted.perManager).length > 0);
  assert.equal(snapshot.predicted.modelledWaitP80Weeks, sim.delta.modelledWaitP80Weeks);
  assert.notEqual(snapshot.predicted.measuredWaitP80Weeks, undefined);
  // portfolio + brief tolerate a design with no moves
  const portfolio = designPortfolio({ ...store.state, orgDesigns: [{ id: 'd1', label: 'Empty', status: 'draft', moves: [], conventions: { ...ORG_CONVENTIONS } }] }, NOW);
  assert.equal(portfolio.simulations.length, 1);
  assert.equal(portfolio.simulations[0].delta.moved, 0);
});
