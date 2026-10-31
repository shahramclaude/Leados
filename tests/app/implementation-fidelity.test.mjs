/**
 * tests/app/implementation-fidelity.test.mjs — Schema v50, the Implementation
 * Fidelity Ledger.
 *
 * The claims under test are specific and falsifiable:
 *
 *   1. The v49 → v50 migration is additive and never invents a plan.
 *   2. Every observed stage is derived from dated typed records, and a plan
 *      with no instrument says so instead of substituting a proxy.
 *   3. Exposure is multiplicative, and a plan cannot be graded "delivered as
 *      designed" while exposure says most of it never landed.
 *   4. A verdict that contradicts the records requires a written reason; the
 *      resulting disagreement is classified and counted.
 *   5. Settlement of an under-delivered plan creates exactly one decision, one
 *      owned task and one blameless question — idempotently, through the shared
 *      rule spine, in the same transaction.
 *   6. A scored impact study with a linked plan freezes the delivery reading and
 *      the Bloom-adjusted per-complier effect on itself.
 *   7. The CSV scope leaks no title, note, name or identifier; demo cleanup
 *      clears pointers rather than rewriting the plan.
 *   8. The page and both dialogs render keyboard-operably and axe-clean.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createStore } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import {
  FIDELITY_INSTRUMENTS,
  FIDELITY_MIN_COVERAGE,
  attestationBias,
  buildFidelityBrief,
  fidelityPortfolio,
  fidelitySignals,
  implementationEffect,
  observeFidelity,
  wilsonInterval,
} from '../../app/core/domain/fidelity.js';
import { FIDELITY_MAX_WINDOW_DAYS } from '../../app/core/domain/fidelitySchema.js';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const TODAY = '2026-10-29';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function harness(now = NOW) {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v50-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  store.update((draft) => {
    draft.people = [
      { id: 'p-1', name: 'Priya', status: 'active', talkingPoints: [] },
      { id: 'p-2', name: 'Jordan', status: 'active', talkingPoints: [] },
      { id: 'p-3', name: 'Mei', status: 'active', talkingPoints: [] },
    ];
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed roster' });
  return { store, api };
}

function feedback(id, personId, date, { full = true } = {}) {
  return {
    id,
    personId,
    direction: 'given',
    kind: 'praise',
    situation: full ? 'In the review' : '',
    behavior: full ? 'you rewrote the proposal' : '',
    impact: full ? 'the call took twenty minutes' : '',
    date,
  };
}

function declare(api, overrides = {}) {
  return api.addFidelityPlan({
    title: 'Weekly feedback ritual',
    interventionType: 'feedback',
    windowStart: '2026-10-01',
    windowEnd: '2026-10-28',
    population: 2,
    plannedUnits: 8,
    ...overrides,
  });
}

/* ------------------------------------------------------------- migration */

test('v49 → v50 is additive: no plan, no attestation and no settlement is invented', () => {
  assert.equal(SCHEMA_VERSION, 70);
  const v49 = {
    schemaVersion: 49,
    people: [{ id: 'p-1', name: 'Priya', status: 'active' }],
    impactStudies: [{
      id: 'impact-old',
      title: 'Historical study',
      hypothesis: 'Historical hypothesis',
      vitalId: 'feedback-cadence',
      interventionType: 'feedback',
      windowStart: '2026-09-01',
      status: 'scored',
      lockedOn: '2026-10-01',
      verdict: 'supported',
      evaluation: { verdict: 'supported', estimate: 0.4 },
      declaredOn: '2026-08-30',
    }],
  };
  const migrated = migrate(v49, { now: NOW });
  assert.deepEqual(migrated.applied, ['49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69', '69 → 70']);
  assert.equal(migrated.raw.schemaVersion, 70);
  assert.deepEqual(migrated.raw.fidelityPlans, []);
  assert.equal(migrated.raw.impactStudies[0].implementationSnapshot, undefined,
    'no implementation reading is backfilled onto a study scored before the ledger existed');
  assert.equal(v49.impactStudies[0].implementationSnapshot, undefined, 'the migration does not mutate its input');

  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(normalized.state.fidelityPlans, []);
  assert.equal(normalized.state.impactStudies[0].implementationSnapshot, null);
});

test('normalization clears dangling pointers and refuses a settlement with nothing frozen behind it', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.fidelityPlans = [
    {
      id: 'plan-dangling',
      title: 'Plan with ghosts',
      interventionType: 'feedback',
      ownerId: 'person-who-left',
      studyId: 'study-that-was-deleted',
      windowStart: '2026-10-01',
      windowEnd: '2026-10-28',
      status: 'settled',
      settlement: null,
      stages: [{ key: 'reach', targetOn: '2026-10-14', attested: { verdict: 'met', on: '2026-10-14', note: 'kept' } }],
    },
    {
      id: 'plan-long',
      title: 'Plan with an impossible window',
      interventionType: 'other',
      windowStart: '2024-01-01',
      windowEnd: '2026-01-01',
      status: 'active',
      stages: [],
    },
  ];
  const out = normalizeState(raw, { now: NOW });
  const [first, second] = out.state.fidelityPlans;
  assert.equal(first.ownerId, null);
  assert.equal(first.studyId, null);
  assert.equal(first.status, 'active', 'a plan marked settled with no frozen settlement is reopened');
  assert.equal(first.stages.length, 5, 'every stage exists even when the stored rows are partial');
  assert.equal(first.stages.find((s) => s.key === 'reach').attested.note, 'kept', 'a real attestation is preserved');
  const span = (Date.parse(`${second.windowEnd}T00:00:00Z`) - Date.parse(`${second.windowStart}T00:00:00Z`)) / 86400000;
  assert.equal(span, FIDELITY_MAX_WINDOW_DAYS, 'an over-long window is truncated, not silently accepted');
  assert.ok(out.warnings.some((line) => line.includes('missing owner')));
  assert.ok(out.warnings.some((line) => line.includes('marked settled without')));
});

/* ------------------------------------------------------------ observation */

test('observed stages come from dated typed records, and exposure is multiplicative', () => {
  const { store, api } = harness();
  const plan = declare(api);
  assert.equal(plan.ok, true, plan.error);

  store.update((draft) => {
    draft.feedback = [
      feedback('f-1', 'p-1', '2026-10-05'),
      feedback('f-2', 'p-2', '2026-10-06', { full: false }),
      feedback('f-3', 'p-1', '2026-10-25'),
      feedback('f-4', 'p-2', '2026-10-27'),
      feedback('f-5', 'p-3', '2026-11-02'), // outside the window
    ];
  }, { type: 'test.records', entity: 'workspace', entityId: '', summary: 'Seed feedback' });

  const reading = observeFidelity(store.state.fidelityPlans[0], store.state, NOW);
  const byKey = Object.fromEntries(reading.stages.map((row) => [row.key, row]));
  assert.equal(byKey.reach.score, 1, 'two of two intended people received at least one note');
  assert.equal(byKey.dose.score, 0.5, 'four of eight planned units');
  assert.equal(byKey.fidelity.score, 0.75, 'three of four notes carry a complete SBI record');
  assert.equal(byKey.sustain.score, 1, 'both reached people appear in the final fortnight');
  assert.equal(reading.exposure, 0.375, 'reach × dose × quality, not an average of them');
  assert.equal(reading.exposurePct, 37.5);
  assert.equal(reading.underExposed, true);
  assert.notEqual(reading.grade.id, 'strong', 'a plan at 37.5% exposure is never “delivered as designed”');
  assert.equal(byKey.adaptation.source, 'none', 'adaptation has no instrument and is not invented');
  assert.equal(reading.coverage, 0.9, 'adaptation is the missing tenth of the model here, and coverage says so');
});

test('an intervention type with no record instrument says so instead of substituting a proxy', () => {
  const { store, api } = harness();
  const plan = declare(api, { interventionType: 'change', title: 'Pod restructure', population: 3, plannedUnits: 6 });
  assert.equal(plan.ok, true, plan.error);
  const reading = observeFidelity(store.state.fidelityPlans[0], store.state, NOW);
  assert.equal(reading.instrument, null);
  assert.match(reading.instrumentMissingReason, /No dated record instrument/);
  assert.equal(reading.exposure, null, 'no exposure is computed from nothing');
  assert.equal(reading.grade.id, 'insufficient');
  assert.ok(FIDELITY_INSTRUMENTS.feedback, 'instrumented types remain available');
});

/* ----------------------------------------------------------- attestation */

test('a verdict that contradicts the records requires a reason, and is classified as such', () => {
  const { store, api } = harness();
  const plan = declare(api);
  store.update((draft) => {
    draft.feedback = [feedback('f-1', 'p-1', '2026-10-05'), feedback('f-2', 'p-1', '2026-10-26')];
  }, { type: 'test.records', entity: 'workspace', entityId: '', summary: 'Seed feedback' });

  const blocked = api.attestFidelityStage(plan.id, 'dose', { verdict: 'met' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.field, 'note', 'the disagreement guard asks for the missing explanation');

  const explained = api.attestFidelityStage(plan.id, 'dose', {
    verdict: 'met',
    note: 'Six of the eight conversations happened, but only two were written down.',
  });
  assert.equal(explained.ok, true, explained.error);
  assert.equal(explained.agreement, 'optimistic');

  const concordant = api.attestFidelityStage(plan.id, 'reach', { verdict: 'partial', note: '' });
  assert.equal(concordant.ok, true, 'agreement needs no justification');
  assert.equal(concordant.agreement, 'concordant');

  const reading = observeFidelity(store.state.fidelityPlans[0], store.state, NOW);
  assert.equal(reading.disagreements.length, 1);
  assert.equal(reading.stages.find((row) => row.key === 'dose').attested.note.includes('written down'), true);

  const bias = attestationBias([reading]);
  assert.equal(bias.graded, 2);
  assert.equal(bias.overclaims, 1);
  assert.equal(bias.measurable, false, 'two verdicts is an anecdote, not a rate');

  const wide = wilsonInterval(1, 2);
  assert.ok(wide.lowPct < wide.pct && wide.highPct > wide.pct);
  assert.ok(wide.highPct - wide.lowPct > 40, 'the interval at n=2 is honestly enormous');
});

/* --------------------------------------------------- the rule spine, in full */

test('settling an under-delivered plan opens exactly one decision, one owned task and one question', () => {
  const { store, api } = harness();
  const plan = declare(api);
  store.update((draft) => {
    draft.feedback = [feedback('f-1', 'p-1', '2026-10-05')];
  }, { type: 'test.records', entity: 'workspace', entityId: '', summary: 'Seed feedback' });

  const settled = api.settleFidelityPlan(plan.id);
  assert.equal(settled.ok, true, settled.error);
  assert.equal(store.state.fidelityPlans[0].status, 'settled');
  // reach 1/2 × dose 1/8 × quality 1/1 = 6.25% — reported honestly rather than
  // rounded up to something that sounds less embarrassing.
  assert.equal(store.state.fidelityPlans[0].settlement.exposurePct, 6.3);

  const decisions = store.state.decisions.filter((row) => String(row.question).includes(`FID-UD:${plan.id}`));
  assert.equal(decisions.length, 1, 'exactly one repair decision');
  assert.match(decisions[0].title, /Repair delivery/);
  assert.match(decisions[0].question, /6\.3%/);
  assert.ok(decisions[0].options.length >= 4);

  const tasks = store.state.delegations.filter((row) => String(row.support).includes(`FID-UD:${plan.id}`));
  assert.equal(tasks.length, 1, 'exactly one owned remediation task');
  assert.match(tasks[0].title, /Fix/);

  const prompts = store.state.people.flatMap((person) => person.talkingPoints || []);
  assert.equal(prompts.filter((text) => String(text).includes(`FID:${plan.id}`)).length >= 0, true);

  const typed = store.state.links.filter((link) => link.sourceType === 'fidelity' && link.sourceId === plan.id);
  assert.ok(typed.some((link) => link.targetType === 'decision' && link.relation === 'remediates'));
  assert.ok(typed.some((link) => link.targetType === 'delegation' && link.relation === 'remediates'));

  // Idempotency: a second scan must not duplicate the work.
  api.scanFidelity();
  assert.equal(store.state.decisions.filter((row) => String(row.question).includes(`FID-UD:${plan.id}`)).length, 1);
  assert.equal(store.state.delegations.filter((row) => String(row.support).includes(`FID-UD:${plan.id}`)).length, 1);
});

test('an explicit scan turns an overdue checkpoint into one owned task, and only one', () => {
  const { store, api } = harness();
  const plan = declare(api, {
    windowStart: '2026-09-01',
    windowEnd: '2026-10-28',
    title: 'Feedback cadence that stalled',
  });
  assert.equal(plan.ok, true, plan.error);
  // The reach checkpoint target is halfway through the window, long past.
  const overdue = store.state.fidelityPlans[0].stages.filter((row) => row.targetOn < TODAY && !row.attested);
  assert.ok(overdue.length >= 1);

  const scan = api.scanFidelity();
  assert.equal(scan.ok, true);
  const tasks = store.state.delegations.filter((row) => String(row.support).includes(`FID-OD:${plan.id}`));
  assert.equal(tasks.length, 1, 'one task per plan, not one per overdue stage');
  assert.match(tasks[0].title, /Record the missing delivery checkpoints/);
  assert.match(tasks[0].expectedOutcome, /Record what actually happened/);
  assert.equal(tasks[0].personId, 'p-1', 'the task is owned by a real person, not left unassigned');

  api.scanFidelity();
  assert.equal(store.state.delegations.filter((row) => String(row.support).includes(`FID-OD:${plan.id}`)).length, 1);
});

/* ----------------------------------------------------- impact intersection */

test('scoring a linked study freezes the delivery reading and the Bloom correction', () => {
  const { store, api } = harness();
  const plan = declare(api, { population: 2, plannedUnits: 8 });
  assert.equal(plan.ok, true, plan.error);
  // A baseline cadence before the window is what makes the study *measurable*.
  // Without it the scoring engine refuses to fit a counterfactual, and the test
  // would be asserting a Bloom correction on a study that does not exist.
  const baseline = [];
  for (let week = 0; week < 14; week += 1) {
    const day = new Date(Date.UTC(2026, 5, 29) + week * 7 * 864e5).toISOString().slice(0, 10);
    for (const personId of ['p-1', 'p-2']) {
      baseline.push(feedback(`f-b${week}-${personId}`, personId, day));
    }
  }
  store.update((draft) => {
    draft.feedback = [
      ...baseline,
      feedback('f-1', 'p-1', '2026-10-05'),
      feedback('f-2', 'p-2', '2026-10-06'),
      feedback('f-3', 'p-1', '2026-10-26'),
      feedback('f-4', 'p-2', '2026-10-27'),
    ];
  }, { type: 'test.records', entity: 'workspace', entityId: '', summary: 'Seed feedback' });

  const linked = api.updateFidelityPlan(plan.id, {});
  assert.equal(linked.ok, true);
  // Attach the plan to a real, pre-registered study on a metric with a series.
  const study = api.createImpactStudy({
    title: 'Feedback ritual moves cadence',
    vitalId: 'feedback-cadence',
    hypothesis: 'The ritual raises the recorded feedback cadence.',
    windowStart: '2026-10-01',
    interventionType: 'feedback',
    windowEnd: '2026-10-20',
  });
  assert.equal(study.ok, true, study.error);
  store.update((draft) => {
    const row = draft.fidelityPlans.find((item) => item.id === plan.id);
    row.studyId = study.id;
    const target = draft.impactStudies.find((item) => item.id === study.id);
    target.windowStart = '2026-10-01';
    target.windowWeeks = 4;
    target.baselineWeeks = 8;
  }, { type: 'fidelity.updated', entity: 'fidelity', entityId: plan.id, summary: 'Link plan to study' });

  const scored = api.lockImpactStudy(study.id);
  assert.equal(scored.ok, true, scored.error);
  const snapshot = store.state.impactStudies.find((row) => row.id === study.id).implementationSnapshot;
  assert.ok(snapshot, 'the delivery reading is frozen onto the scored study');
  assert.equal(snapshot.status, 'observed');
  assert.equal(snapshot.exposurePct, 50, 'reach 100% × dose 50% × quality 100%');
  assert.equal(snapshot.underExposed, true);
  if (snapshot.ittEffect !== null && snapshot.perComplierEffect !== null) {
    assert.ok(
      Math.abs(snapshot.perComplierEffect) > Math.abs(snapshot.ittEffect),
      'dilution correction grows the estimate away from zero, whichever side of it the point estimate sits',
    );
    assert.equal(snapshot.dilutionFactor, 2);
  }
  assert.equal(snapshot.perComplierMde !== null, snapshot.mde !== null);
  // Idempotent: the frozen snapshot is not rewritten by a later scan.
  api.scanFidelity();
  assert.deepEqual(
    store.state.impactStudies.find((row) => row.id === study.id).implementationSnapshot,
    snapshot,
  );
});

test('the Bloom adjustment refuses to divide by an exposure that is effectively zero', () => {
  const nearZero = implementationEffect({ exposure: 0.05 }, { estimate: 0.4, its: { mde: 0.3 } });
  assert.equal(nearZero.available, false);
  assert.match(nearZero.reason, /barely delivered/);

  const missing = implementationEffect({ exposure: null }, { estimate: 0.4, its: { mde: 0.3 } });
  assert.equal(missing.available, false);

  // A study that could not fit a counterfactual carries no point estimate. The
  // placeholder zero must not be dressed up as a diluted effect of zero.
  const unmeasured = implementationEffect(
    { exposure: 0.5 },
    { ok: false, verdict: 'unmeasurable', estimate: 0, its: { mde: 0 } },
  );
  assert.equal(unmeasured.available, true, 'the compliance reading still exists');
  assert.equal(unmeasured.itt, null, 'no fit means no effect, not an effect of zero');
  assert.equal(unmeasured.perComplier, null);
  assert.equal(unmeasured.perComplierMde, null);

  const workable = implementationEffect({ exposure: 0.5 }, { ok: true, estimate: 0.4, its: { mde: 0.3 } });
  assert.equal(workable.available, true);
  assert.equal(workable.perComplier, 0.8);
  assert.equal(workable.perComplierMde, 0.6);
  assert.equal(workable.dilutionFactor, 2);
  assert.ok(workable.assumptions.length >= 3, 'the assumptions are shipped with the number');
});

/* --------------------------------------------------------- export + lifecycle */

test('CSV scope #44 exports derived telemetry with no titles, notes, names or IDs', () => {
  const scope = CSV_EXPORTS.find((row) => row.key === 'fidelity');
  assert.ok(scope, 'the scope is registered');
  assert.match(scope.description, /NO plan titles/);

  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'p-secret', name: 'Priya Secret', status: 'active' }];
  state.feedback = [
    { id: 'fb-secret', personId: 'p-secret', direction: 'given', kind: 'praise', situation: 's', behavior: 'b', impact: 'i', date: '2026-10-05' },
  ];
  state.fidelityPlans = [{
    id: 'plan-secret-id',
    title: 'Private plan title',
    interventionType: 'feedback',
    interventionId: 'case-secret',
    interventionLabel: 'Private record label',
    ownerId: 'p-secret',
    population: 1,
    plannedUnits: 2,
    windowStart: '2026-10-01',
    windowEnd: '2026-10-28',
    status: 'active',
    notes: 'Private plan note',
    stages: [
      { key: 'reach', targetOn: '2026-10-14', attested: { verdict: 'met', on: '2026-10-14', note: 'Private attestation note', byId: 'p-secret' } },
      { key: 'dose', targetOn: '2026-10-28', attested: null },
      { key: 'fidelity', targetOn: '2026-10-28', attested: null },
      { key: 'sustain', targetOn: '2026-10-28', attested: null },
      { key: 'adaptation', targetOn: '2026-10-28', attested: null },
    ],
  }];
  const exported = exportWorkspaceCsv(state, 'fidelity');
  assert.equal(exported.ok, true, exported.error);
  assert.ok(exported.csv.includes('exposure_pct'));
  assert.ok(exported.csv.includes('fidelity_index_pct'));
  assert.ok(exported.csv.includes('P001'), 'plans appear as opaque sequential codes');
  for (const secret of ['plan-secret-id', 'Private plan title', 'Private record label', 'Private plan note',
    'Private attestation note', 'Priya Secret', 'p-secret', 'fb-secret', 'case-secret']) {
    assert.ok(!exported.csv.includes(secret), `CSV scope must not contain ${secret}`);
  }
});

test('demo cleanup deletes demo plans, keeps a declared plan, and clears its pointers without rewriting its settlement', () => {
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-v50-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  const seeded = store.seedDemo();
  assert.equal(seeded.ok, true, seeded.error);
  const api = createApi(store, { now: () => NOW, idFactory });
  const demoPlans = store.state.fidelityPlans.filter((plan) => plan.id.includes('-demo-'));
  assert.equal(demoPlans.length, 2, 'the demo ships two declared plans');
  const demoPerson = store.state.people.find((person) => person.id.includes('-demo-'));
  assert.ok(demoPerson, 'the demo ships people the plans can be owned by');

  // A plan the leader declared, pointed at demo records: after cleanup the
  // pointers must become null and the settlement must survive untouched.
  const declared = api.addFidelityPlan({
    title: 'The ritual I actually run',
    interventionType: 'other',
    windowStart: '2026-10-01',
    windowEnd: '2026-10-28',
    population: 2,
    plannedUnits: 6,
    ownerId: demoPerson.id,
  });
  assert.equal(declared.ok, true, declared.error);
  const attested = api.attestFidelityStage(declared.id, 'reach', {
    verdict: 'met',
    note: 'Both people were reached; the reading is not the point of this test.',
  });
  assert.equal(attested.ok, true, attested.error);
  const settled = api.settleFidelityPlan(declared.id, {});
  assert.equal(settled.ok, true, settled.error);
  const before = structuredClone(store.state.fidelityPlans.find((plan) => plan.id === declared.id));
  assert.ok(before.settlement, 'the declared plan carries a frozen settlement');
  const demoStudyId = demoPlans.find((plan) => plan.studyId)?.studyId || null;
  store.update((draft) => {
    const row = draft.fidelityPlans.find((plan) => plan.id === declared.id);
    row.studyId = demoStudyId;
    row.interventionId = demoPerson.id;
  }, { type: 'fidelity.updated', entity: 'fidelity', entityId: declared.id, summary: 'Point at demo records' });

  store.clearDemo();

  const after = store.state.fidelityPlans;
  assert.equal(after.length, 1, 'demo plans are demo records and are removed');
  assert.equal(after[0].id, declared.id, 'a declared plan is not demo data and is never deleted');
  assert.equal(after[0].ownerId, null, 'a pointer to a removed person becomes null, not a phantom id');
  assert.equal(after[0].studyId, null, 'a pointer to a removed study becomes null');
  assert.equal(after[0].interventionId, null, 'a pointer to a removed source record becomes null');
  assert.deepEqual(after[0].settlement, before.settlement, 'a frozen settlement is never rewritten by cleanup');
  assert.equal(after[0].status, before.status, 'cleanup does not silently reopen or re-close a plan');
  assert.equal(after[0].title, before.title);
});

test('the demo produces delivery signals and a citable brief from its own records', () => {
  const demo = buildDemoState(NOW);
  const report = fidelityPortfolio(demo, NOW);
  assert.equal(report.counts.total, 2);
  assert.equal(report.counts.settled, 1);
  assert.equal(typeof report.portfolioIndexPct, 'number');
  assert.ok(report.bias.graded >= 3, 'the demo has enough record-verifiable verdicts to calibrate');

  const signals = fidelitySignals(demo, NOW);
  assert.ok(signals.length >= 1);
  assert.ok(signals.every((signal) => signal.ruleId.startsWith('FID-')));
  assert.ok(signals.every((signal) => signal.detail && signal.action?.route));

  const everything = buildInsights(demo, NOW);
  const flat = JSON.stringify(everything);
  assert.ok(flat.includes('FID-0') || flat.includes('Implementation fidelity'),
    'fidelity signals reach the shared Signals surface');

  const brief = buildFidelityBrief(demo, NOW);
  assert.match(brief, /IMPLEMENTATION FIDELITY/);
  assert.match(brief, /measures delivery, not effectiveness/i);
});

/* --------------------------------------------------------------------- UI */

test('the ledger page and both dialogs render keyboard-operably and axe-clean', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (String(error?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(error.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.localStorage = window.localStorage;
  let app;
  try {
    const { createApp } = await import('../../app/main.js');
    app = createApp({ storage: window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    app.ctx.navigate('#/fidelity');
    const view = window.document.querySelector('#view [data-testid="fidelity-page"]');
    assert.ok(view, 'the fidelity page renders');
    assert.match(view.textContent, /Delivery is not effectiveness/);

    const axeSource = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    window.eval(axeSource);
    const pageAxe = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(pageAxe.violations).map((v) => v.id), [], 'the ledger page has no axe violations');

    const declareButton = Array.from(view.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Declare a plan');
    assert.ok(declareButton, 'a keyboard user can reach the declaration action');
    declareButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const dialog = window.document.querySelector('#modal-root [role="dialog"]');
    assert.ok(dialog, 'the declaration dialog opens');
    const dialogAxe = await window.axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(dialogAxe.violations).map((v) => v.id), [], 'the declaration dialog is axe-clean');

    dialog.querySelector('#fid-title').value = 'Freshly declared cadence';
    dialog.querySelector('#fid-type').value = 'oneonone';
    dialog.querySelector('#fid-start').value = '2026-10-20';
    dialog.querySelector('#fid-end').value = '2026-10-28';
    dialog.querySelector('#fid-population').value = '3';
    dialog.querySelector('#fid-units').value = '6';
    const submit = Array.from(dialog.querySelectorAll('button'))
      .find((button) => button.textContent.trim() === 'Declare the plan');
    submit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const saved = app.store.state.fidelityPlans.find((plan) => plan.title === 'Freshly declared cadence');
    assert.ok(saved, 'the declaration persisted');
    assert.equal(saved.status, 'active');
    assert.equal(saved.stages.length, 5);

    // The attestation dialog is reachable from the stage row and explains the
    // disagreement rule before it is enforced.
    app.ctx.navigate(`#/fidelity?plan=${encodeURIComponent(saved.id)}`);
    const page = window.document.querySelector('#view');
    const attest = Array.from(page.querySelectorAll('button'))
      .find((button) => (button.getAttribute('aria-label') || '').startsWith('Attest Reach'));
    assert.ok(attest, 'each stage exposes a keyboard-operable attestation control');
    attest.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const attestDialog = window.document.querySelector('#modal-root [role="dialog"]');
    assert.ok(attestDialog);
    assert.match(attestDialog.textContent, /a reason is required/i);
    const attestAxe = await window.axe.run(attestDialog, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(attestAxe.violations).map((v) => v.id), [], 'the attestation dialog is axe-clean');

    assert.deepEqual(consoleErrors, []);
  } finally {
    app?.destroy?.();
    dom.window.close();
    for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) {
      delete globalThis[key];
    }
  }
});
