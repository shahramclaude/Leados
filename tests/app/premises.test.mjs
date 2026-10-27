/**
 * tests/app/premises.test.mjs — Premise Sentinel / Assumption Ledger
 * (Session 53, Schema v35, RULE-PREM-01..04).
 *
 *   1. Bayesian log-odds math: Cromwell clamp, half-life, Wald boundaries,
 *      contested evidence, purity and the evidence-dialog preview.
 *   2. Declarative sensor registry, two-hop typed scope, unrated-FMEA refusal.
 *   3. Validated actions, additive v34→v35 migration, corrupt-data repair,
 *      point-in-time rewind, clearDemo pointer scrub.
 *   4. Atomic cross-module cascade: one registered premise + one priced link +
 *      one dated observation → DACI re-decision, Decision Tempo schedule,
 *      verification delegation, 1:1 prompt, typed links and idempotency.
 *   5. Pause/explicit scan, human reaffirmation cycles and stale review prompts.
 *   6. Automation catalog, signals/Insights, CSV scope #35, board brief, demo.
 *   7. JSDOM + axe across all four tabs, policy save, scan, and dialogs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState, normalizeState, migrate, normalizePremises,
  SCHEMA_VERSION, DEFAULT_SETTINGS,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays, dayKey } from '../../app/core/time.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import {
  PREMISE_CRITICALITIES,
  PREMISE_DEFAULT_BREACH_PCT,
  PREMISE_DEFAULT_HALF_LIFE_DAYS,
  PREMISE_DEFAULT_WATCH_PCT,
  PREMISE_DISCOUNT_FLOOR,
  PREMISE_ENGINE_VERSION,
  PREMISE_EVIDENCE_STRENGTHS,
  PREMISE_RULE_IDS,
  PREMISE_RULES,
  PREMISE_SENSORS,
  PREMISE_SPRT_CHALLENGE,
  PREMISE_SPRT_SUPPORT,
  PREMISE_STATUS_LABELS,
  PREMISE_TRIGGER_PREFIXES,
  buildPremiseReport,
  buildPremiseScope,
  collectPremiseObservations,
  evaluatePremiseCore,
  makeManualPremiseObservation,
  normalizePremisePayload,
  premiseAttentionCount,
  premiseBrief,
  premiseRule,
  premiseSignals,
  previewPremiseEvidence,
  rewindPremises,
} from '../../app/core/domain/premises.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from '../../app/core/domain/cases.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';
const STAMP = NOW.toISOString();

/* --------------------------------------------------------------- fixtures */

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness() {
  let seq = 0;
  let current = NOW;
  const idFactory = (prefix) => `${prefix}-pt-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return {
    store,
    api,
    idFactory,
    now: () => current,
    advance(ms = 2000) { current = new Date(current.getTime() + ms); return current; },
  };
}

function observation(overrides = {}) {
  return {
    id: 'obs-1',
    key: 'manual:obs-1',
    sensorId: 'manual',
    sensorLabel: 'Leader-recorded observation',
    sourceType: 'manual',
    sourceId: 'obs-1',
    sourceRoute: '',
    title: 'Restore drill exceeded the survival window',
    summary: 'A dated operational fact',
    direction: 'against',
    likelihoodRatio: 3,
    observedOn: TODAY,
    createdAt: STAMP,
    ...overrides,
  };
}

function premise(overrides = {}) {
  return {
    id: 'prem-1',
    title: 'Failover fits the survival window',
    statement: 'The signing layer can be restored within half a day before reconciliation fails.',
    signpost: 'A critical dependency with TTR greater than TTS would be the first dated warning.',
    decisionId: 'dec-1',
    ownerId: 'person-1',
    criticality: 'load-bearing',
    priorPct: 70,
    watchPct: PREMISE_DEFAULT_WATCH_PCT,
    breachPct: PREMISE_DEFAULT_BREACH_PCT,
    halfLifeDays: PREMISE_DEFAULT_HALF_LIFE_DAYS,
    reviewBy: '2026-11-20',
    lastReviewedOn: null,
    acknowledgedOn: null,
    acknowledgedAt: null,
    humanDisposition: null,
    reviewCycle: 0,
    sourceRefs: [],
    observations: [],
    history: [],
    status: 'unobserved',
    posteriorPct: 70,
    logBayesFactor: 0,
    autoPropagate: true,
    createdAt: new Date('2026-10-01T09:00:00.000Z').toISOString(),
    updatedAt: STAMP,
    ...overrides,
  };
}

function normalized(overrides = {}) {
  const base = createEmptyState(STAMP);
  const result = normalizeState({ ...base, ...overrides }, { now: NOW });
  return { ...result, state: result.state };
}

function decision(overrides = {}) {
  return {
    id: 'dec-1',
    title: 'Adopt regional failover',
    date: '2026-10-01',
    reversibility: 'irreversible',
    driver: 'Ada Owner',
    approver: 'CFO',
    options: [{ id: 'dopt-1', label: 'Proceed' }, { id: 'dopt-2', label: 'Wait' }],
    chosen: '',
    rationale: '',
    reviewOn: null,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: STAMP,
    ...overrides,
  };
}

function person(overrides = {}) {
  return {
    id: 'person-1',
    name: 'Ada Owner',
    role: 'Lead',
    level: 'lead',
    team: 'Platform',
    status: 'active',
    startDate: '2025-01-01',
    talkingPoints: [],
    createdAt: STAMP,
    ...overrides,
  };
}

function dependency(overrides = {}) {
  return {
    id: 'dep-1',
    name: 'Signing key vault',
    kind: 'system',
    criticality: 'critical',
    status: 'active',
    ttsDays: 0.5,
    ttrDays: 3,
    annualFailureProb: 10,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

function pricedWorkspace(h, premiseOverrides = {}) {
  const personId = h.api.addPerson({ name: 'Ada Owner', role: 'Lead' }).id;
  const decisionId = h.api.addDecision({
    title: 'Adopt regional failover',
    date: '2026-10-01',
    reversibility: 'irreversible',
    driver: 'Ada Owner',
    approver: 'CFO',
    options: [{ label: 'Proceed' }, { label: 'Wait' }],
  }).id;
  const dependencyId = h.api.addDependency({
    name: 'Signing key vault', kind: 'system', criticality: 'critical',
    ttsDays: 0.5, ttrDays: 3, annualFailureProb: 10,
  }).id;
  const budgetId = h.api.addBudget({ name: 'Failover envelope', currency: 'USD', limit: 100000, status: 'active' }).id;
  h.api.addBudgetLine(budgetId, { title: 'Regional failover', status: 'committed', committedAmount: 60000 });
  h.store.update((draft) => {
    draft.links.push({
      id: h.idFactory('lnk'),
      sourceType: 'budget', sourceId: budgetId,
      targetType: 'decision', targetId: decisionId,
      relation: 'funds', summary: 'Priced decision context',
      createdOn: TODAY, createdAt: STAMP,
    });
  }, { type: 'link.created', entity: 'link', entityId: '', summary: 'Priced context linked' });
  const created = h.api.addPremise({
    title: 'Failover fits the survival window',
    statement: 'The signing layer can be restored within half a day before reconciliation fails.',
    signpost: 'A critical dependency with TTR greater than TTS would be the first dated warning.',
    decisionId,
    ownerId: personId,
    priorPct: 90,
    watchPct: 70,
    breachPct: 60,
    sourceRefs: [{ sourceType: 'dependency', sourceId: dependencyId }],
    ...premiseOverrides,
  });
  assert.equal(created.ok, true, created.error);
  return { personId, decisionId, dependencyId, budgetId, premiseId: created.id };
}

function markerDecisions(state) {
  return state.decisions.filter((d) => String(d.question || '').includes(PREMISE_RULE_IDS.BREACH));
}

/* ==================================================== 1. belief math */

test('Bayesian ledger: named LR, Cromwell clamp, watch/breach lines and purity', () => {
  const p = premise({ observations: [observation()] });
  const snapshot = JSON.stringify(p);
  const e = evaluatePremiseCore(p, { now: NOW, settings: {} });
  assert.equal(e.priorPct, 70);
  assert.equal(e.posteriorPct, 43.75, '70% prior odds ÷ LR 3 = 43.75%');
  assert.equal(e.status, 'watch');
  assert.equal(e.evidenceCount, 1);
  assert.equal(e.againstCount, 1);
  assert.equal(e.sprtVerdict, 'continue-sensing');
  assert.ok(e.informationGainBits > 0);
  assert.equal(JSON.stringify(p), snapshot, 'pure: input not mutated');
  assert.equal(evaluatePremiseCore({ priorPct: 0 }, { now: NOW }).priorPct, 5);
  assert.equal(evaluatePremiseCore({ priorPct: 100 }, { now: NOW }).priorPct, 95);
});

test('half-life decay: 90-day-old evidence has half the log-odds weight', () => {
  const fresh = evaluatePremiseCore(premise({ observations: [observation({ key: 'a' })] }), { now: NOW });
  const old = evaluatePremiseCore(premise({
    observations: [observation({ key: 'b', observedOn: addDays(TODAY, -90) })],
  }), { now: NOW });
  assert.equal(fresh.evidenceRows[0].discount, 1);
  assert.equal(old.evidenceRows[0].discount, 0.5);
  assert.ok(old.posteriorPct > fresh.posteriorPct, 'decayed against evidence moves belief less');
  assert.equal(PREMISE_DISCOUNT_FLOOR, 0.05);
  const ancient = evaluatePremiseCore(premise({
    observations: [observation({ key: 'c', observedOn: addDays(TODAY, -2000) })],
  }), { now: NOW });
  assert.ok(ancient.evidenceRows[0].discount >= PREMISE_DISCOUNT_FLOOR);
});

test('Wald-style SPRT boundaries and contested evidence confidence', () => {
  const against = [
    observation({ id: 'o1', key: 'manual:o1', likelihoodRatio: 6 }),
    observation({ id: 'o2', key: 'manual:o2', likelihoodRatio: 6 }),
  ];
  const e = evaluatePremiseCore(premise({ observations: against }), { now: NOW });
  assert.ok(e.logBayesFactor <= PREMISE_SPRT_CHALLENGE);
  assert.equal(e.sprtVerdict, 'challenge-boundary');
  const mixed = [
    observation({ id: 'o1', key: 'manual:o1', direction: 'for', likelihoodRatio: 6 }),
    observation({ id: 'o2', key: 'manual:o2', direction: 'against', likelihoodRatio: 6 }),
  ];
  const contested = evaluatePremiseCore(premise({ observations: mixed }), { now: NOW });
  assert.equal(contested.confidence, 'contested');
  assert.ok(contested.supportBits >= 1 && contested.againstBits >= 1);
  const support = evaluatePremiseCore(premise({
    observations: [
      observation({ id: 'o1', key: 'manual:o1', direction: 'for', likelihoodRatio: 6 }),
      observation({ id: 'o2', key: 'manual:o2', direction: 'for', likelihoodRatio: 6 }),
    ],
  }), { now: NOW });
  assert.ok(support.logBayesFactor >= PREMISE_SPRT_SUPPORT);
  assert.equal(support.sprtVerdict, 'support-boundary');
});

test('evidence dialog preview projects the posterior without mutating the premise', () => {
  const p = premise();
  const snapshot = JSON.stringify(p);
  const before = evaluatePremiseCore(p, { now: NOW });
  const after = previewPremiseEvidence(p, { direction: 'against', strength: 'moderate', observedOn: TODAY }, { now: NOW });
  assert.equal(before.status, 'unobserved');
  assert.ok(after.posteriorPct < before.posteriorPct);
  assert.equal(after.status, 'watch');
  assert.equal(JSON.stringify(p), snapshot);
  const manual = makeManualPremiseObservation({
    title: 'Observed failover delay', direction: 'against', strength: 'strong',
    observedOn: '2099-01-01', note: 'future date is rejected',
  }, { now: NOW, idFactory: (prefix) => `${prefix}-manual-1` });
  assert.equal(manual.observedOn, TODAY, 'future observation date clamps to today');
  assert.equal(manual.likelihoodRatio, PREMISE_EVIDENCE_STRENGTHS.strong);
});

test('validated premise payload refuses false certainty, missing signposts and invalid thresholds', () => {
  const state = normalized({ decisions: [decision()], people: [person()] }).state;
  const good = {
    title: 'Failover fits', statement: 'The signing layer recovers within half a day.',
    signpost: 'A failed restore drill is the first dated signpost.',
    decisionId: 'dec-1', ownerId: 'person-1', priorPct: 70, watchPct: 55, breachPct: 30,
  };
  assert.equal(normalizePremisePayload(good, { state, now: NOW, settings: state.settings }).ok, true);
  assert.equal(normalizePremisePayload({ ...good, priorPct: 100 }, { state, now: NOW, settings: state.settings }).field, 'priorPct');
  assert.equal(normalizePremisePayload({ ...good, signpost: 'risk' }, { state, now: NOW, settings: state.settings }).field, 'signpost');
  assert.equal(normalizePremisePayload({ ...good, watchPct: 20, breachPct: 30 }, { state, now: NOW, settings: state.settings }).field, 'breachPct');
  assert.equal(normalizePremisePayload({ ...good, decisionId: null, sourceRefs: [] }, { state, now: NOW, settings: state.settings }).field, 'decisionId');
  assert.equal(normalizePremisePayload({ ...good, decisionId: 'missing' }, { state, now: NOW, settings: state.settings }).field, 'decisionId');
});

/* ==================================================== 2. sensor registry */

test('declarative sensor registry: eight named sensors, no confidential sources', () => {
  assert.equal(PREMISE_SENSORS.length, 8);
  assert.equal(PREMISE_RULES.length, 4);
  assert.ok(PREMISE_TRIGGER_PREFIXES.includes('premise.'));
  assert.ok(PREMISE_TRIGGER_PREFIXES.includes('settings.'));
  for (const sensor of PREMISE_SENSORS) {
    assert.ok(sensor.id && sensor.label && sensor.framework && sensor.sourceType, `${sensor.id || 'sensor'} is fully described`);
    assert.ok(sensor.eventPrefixes.length > 0);
    assert.equal(typeof sensor.collect, 'function');
    assert.ok(!['conflict', 'pulse'].includes(sensor.sourceType), 'confidential collections are excluded');
  }
  assert.ok(PREMISE_CRITICALITIES.includes('load-bearing'));
  assert.ok(Object.keys(PREMISE_STATUS_LABELS).length >= 6);
});

test('two-hop typed graph scope discovers linked evidence sources automatically', () => {
  const state = normalized({
    decisions: [decision()],
    people: [person()],
    premises: [premise()],
    cases: [{ id: 'case-1', title: 'Regional failover', status: 'open', fmea: { severity: null, probability: null, detectability: null }, createdAt: STAMP }],
    budgets: [{ id: 'bud-1', name: 'Failover envelope', currency: 'USD', limit: 100000, lines: [], status: 'active', createdAt: STAMP }],
    links: [
      { id: 'lnk-1', sourceType: 'decision', sourceId: 'dec-1', targetType: 'case', targetId: 'case-1', relation: 'decides', createdOn: TODAY, createdAt: STAMP },
      { id: 'lnk-2', sourceType: 'case', sourceId: 'case-1', targetType: 'budget', targetId: 'bud-1', relation: 'funds', createdOn: TODAY, createdAt: STAMP },
    ],
  }).state;
  const scope = buildPremiseScope(state, state.premises[0]);
  const keys = new Set(scope.map((r) => `${r.type}:${r.id}`));
  assert.ok(keys.has('decision:dec-1'));
  assert.ok(keys.has('case:case-1'), 'one hop');
  assert.ok(keys.has('budget:bud-1'), 'two hops');
  assert.ok(![...keys].some((key) => key.startsWith('conflict:') || key.startsWith('pulse:')));
});

test('unrated FMEA cases produce no fabricated priority evidence; rated cases do', () => {
  const base = normalized({
    decisions: [decision()],
    people: [person()],
    premises: [premise({ sourceRefs: [{ sourceType: 'case', sourceId: 'case-1' }] })],
    cases: [{ id: 'case-1', title: 'Unrated regional risk', status: 'open', fmea: { severity: null, probability: null, detectability: null }, createdAt: STAMP }],
  }).state;
  assert.equal(collectPremiseObservations(base, base.premises[0], NOW, base.settings)
    .filter((o) => o.sensorId === 'case-fmea').length, 0, 'unrated is not defaulted to 5/5/5');
  base.cases[0].fmea = { severity: 9, probability: 9, detectability: 9 };
  const rows = collectPremiseObservations(base, base.premises[0], NOW, base.settings)
    .filter((o) => o.sensorId === 'case-fmea');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].direction, 'against');
  assert.equal(rows[0].likelihoodRatio, 4);
  assert.match(rows[0].summary, /RPN 729/);
});

test('dependency TTS/TTR sensor produces dated, keyed, idempotent observations', () => {
  const state = normalized({
    decisions: [decision()], people: [person()],
    premises: [premise({ sourceRefs: [{ sourceType: 'dependency', sourceId: 'dep-1' }] })],
    dependencies: [dependency()],
  }).state;
  const first = collectPremiseObservations(state, state.premises[0], NOW, state.settings);
  assert.equal(first.length, 1);
  assert.equal(first[0].sensorId, 'dependency-continuity');
  assert.equal(first[0].direction, 'against');
  assert.equal(first[0].observedOn, TODAY);
  const second = collectPremiseObservations(state, state.premises[0], NOW, state.settings);
  assert.equal(second[0].key, first[0].key, 'same record state → same idempotency key');
  state.dependencies[0].ttrDays = 0.25;
  const third = collectPremiseObservations(state, state.premises[0], NOW, state.settings);
  assert.notEqual(third[0].key, first[0].key, 'changed record → new dated observation, history preserved');
  assert.equal(third[0].direction, 'for');
});

/* ==================================================== 3. schema & actions */

test('Schema v35: additive migration, settings defaults and premise collection', () => {
  assert.equal(SCHEMA_VERSION, 35);
  assert.equal(DEFAULT_SETTINGS.premiseWatchPct, 55);
  assert.equal(DEFAULT_SETTINGS.premiseBreachPct, 30);
  assert.equal(DEFAULT_SETTINGS.premiseHalfLifeDays, 90);
  assert.equal(DEFAULT_SETTINGS.premiseReviewDays, 30);
  assert.equal(DEFAULT_SETTINGS.premiseAutoPropagate, true);
  const empty = createEmptyState(STAMP);
  assert.deepEqual(empty.premises, []);
  const migrated = migrate({ schemaVersion: 34, settings: {}, decisions: [], people: [] });
  assert.equal(migrated.raw.schemaVersion, 35);
  assert.equal(migrated.applied.at(-1), '34 → 35');
  assert.deepEqual(migrated.raw.premises, []);
  assert.equal(migrated.raw.settings.premiseAutoPropagate, true);
  const state = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(state.schemaVersion, 35);
  assert.deepEqual(state.premises, []);
  assert.ok(LINK_ENTITY_TYPES.includes('premise'));
  assert.ok(LINK_RELATIONS.includes('tests'));
  assert.ok(LINK_RELATIONS.includes('revisits'));
});

test('normalization repairs corrupt premise fields, deduplicates evidence and derives status', () => {
  const result = normalized({
    decisions: [decision()],
    people: [person()],
    premises: [premise({
      priorPct: 0,
      status: 'not-a-status',
      sourceRefs: [{ sourceType: 'case', sourceId: 'missing-case' }],
      observations: [
        observation({ observedOn: '2099-01-01' }),
        observation({ id: 'obs-2', key: 'manual:obs-1', observedOn: '2099-01-01' }),
      ],
    })],
  });
  const p = result.state.premises[0];
  assert.equal(p.priorPct, 5, 'Cromwell clamp on load');
  assert.equal(p.sourceRefs.length, 0, 'phantom source dropped with warning');
  assert.equal(p.observations.length, 1, 'duplicate key collapsed');
  assert.equal(p.observations[0].observedOn, TODAY, 'future date clamped');
  assert.equal(p.status, 'breached', 'status derived from evidence, not trusted from disk');
  assert.equal(p.reviewCycle, 0);
  assert.ok(result.warnings.some((w) => /missing case record/.test(w)));
  const callable = normalizePremises([premise()], result.state, STAMP, result.state.settings, []);
  assert.equal(callable.length, 1, 'normalizer is independently callable');
});

test('point-in-time rewind removes future premises and future evidence', () => {
  const state = normalized({
    decisions: [decision()],
    people: [person()],
    premises: [premise({
      createdAt: new Date('2026-10-01T09:00:00.000Z').toISOString(),
      observations: [observation({ observedOn: '2026-10-25' })],
    }), premise({
      id: 'prem-2', title: 'Future premise', createdAt: new Date('2026-10-30T09:00:00.000Z').toISOString(),
    })],
  }).state;
  const earlier = reconstructStateAt(state, '2026-10-20', { currentDay: TODAY }).state;
  assert.equal(earlier.premises.length, 1, 'premise created after as-of is absent');
  assert.equal(earlier.premises[0].observations.length, 0, 'observation after as-of is absent');
  assert.equal(earlier.premises[0].status, 'unobserved');
  const direct = rewindPremises(state, '2026-10-26', { settings: state.settings });
  assert.equal(direct.premises.length, 1, 'premise created after as-of is still absent');
  assert.equal(direct.premises[0].observations.length, 1, 'observation on 2026-10-25 is present');
});

test('actions validate premise registration, evidence and policy', () => {
  const h = harness();
  assert.equal(h.api.addPremise({ title: 'x' }).ok, false);
  const personId = h.api.addPerson({ name: 'Ada Owner' }).id;
  const decisionId = h.api.addDecision({ title: 'Adopt failover', date: TODAY, options: [{ label: 'A' }, { label: 'B' }] }).id;
  const created = h.api.addPremise({
    title: 'Failover fits', statement: 'The signing layer recovers within half a day.',
    signpost: 'A failed restore drill is the first dated signpost.',
    decisionId, ownerId: personId, priorPct: 70,
  });
  assert.equal(created.ok, true);
  assert.equal(h.store.state.premises.length, 1);
  assert.equal(h.api.recordPremiseEvidence(created.id, {
    title: 'Future evidence', direction: 'against', strength: 'strong', observedOn: '2099-01-01',
  }).ok, false);
  assert.equal(h.api.recordPremiseEvidence(created.id, {
    title: 'Drill exceeded window', direction: 'against', strength: 'moderate', observedOn: TODAY,
  }).ok, true);
  assert.equal(h.store.state.premises[0].observations.length, 1);
  assert.equal(h.api.setPremisePolicy({ watchPct: 20, breachPct: 30 }).ok, false);
  assert.equal(h.api.setPremisePolicy({ watchPct: 60, breachPct: 35, halfLifeDays: 45, reviewDays: 21 }).ok, true);
  assert.equal(h.store.state.settings.premiseWatchPct, 60);
  assert.equal(h.store.state.settings.premiseBreachPct, 35);
  assert.equal(h.store.state.settings.premiseHalfLifeDays, 45);
  assert.equal(h.store.state.settings.premiseReviewDays, 21);
});

test('clearDemo removes demo premises/links and scrubs retained user premise pointers', () => {
  const h = harness();
  h.store.seedDemo({ force: true });
  const demoDecision = h.store.state.decisions.find((d) => d.id.includes('-demo-'));
  const demoDependency = h.store.state.dependencies.find((d) => d.id.includes('-demo-'));
  assert.ok(demoDecision && demoDependency);
  const created = h.api.addPremise({
    title: 'Real user premise', statement: 'A real premise that must survive demo cleanup.',
    signpost: 'A reviewed decision outcome of bad would be the first signpost.',
    decisionId: demoDecision.id,
    priorPct: 95,
    watchPct: 10,
    breachPct: 5,
    sourceRefs: [{ sourceType: 'dependency', sourceId: demoDependency.id }],
  });
  assert.equal(created.ok, true, created.error);
  h.store.clearDemo();
  const retained = h.store.state.premises.find((p) => p.id === created.id);
  assert.ok(retained, 'leader-created premise survives');
  assert.equal(retained.decisionId, null, 'pointer to removed demo decision is scrubbed');
  assert.equal(retained.sourceRefs.length, 0, 'pointer to removed demo source is scrubbed');
  assert.equal(h.store.state.premises.filter((p) => p.id.includes('-demo-')).length, 0);
  assert.ok(h.store.state.links.filter((l) => l.ruleId?.startsWith('RULE-PREM'))
    .every((l) => !String(l.sourceId).includes('-demo-') && !String(l.targetId).includes('-demo-')),
  'no typed edge points at a removed demo record');
});

/* ==================================================== 4. atomic cross-module cascade */

test('ONE dated observation fans out to DACI, Tempo, delegation, 1:1, typed links', () => {
  const h = harness();
  const ids = pricedWorkspace(h);
  const before = {
    decisions: h.store.state.decisions.length,
    delegations: h.store.state.delegations.length,
    tempo: h.store.state.tempoSchedules.length,
  };
  const result = h.api.recordPremiseEvidence(ids.premiseId, {
    title: 'Regional restore drill exceeded the survival window',
    direction: 'against', strength: 'strong', observedOn: '2026-10-26',
    note: 'Observed in a recorded continuity drill',
  });
  assert.equal(result.ok, true, result.error);
  const state = h.store.state;
  const p = state.premises.find((x) => x.id === ids.premiseId);
  assert.equal(p.status, 'breached');
  assert.equal(markerDecisions(state).length, 1, 'exactly one re-decision');
  assert.equal(state.decisions.length, before.decisions + 1);
  assert.equal(state.delegations.length, before.delegations + 1, 'one verification delegation');
  assert.ok(state.tempoSchedules.length > before.tempo, 'Decision Tempo priced a new schedule in the same transaction');
  assert.ok(state.people.find((x) => x.id === ids.personId).talkingPoints.some((t) => t.includes(PREMISE_RULE_IDS.BREACH)));
  const rules = new Set(storeRules(result));
  assert.ok(rules.has(PREMISE_RULE_IDS.SENSE));
  assert.ok(rules.has(PREMISE_RULE_IDS.BREACH));
  assert.ok(rules.has('RULE-DLY-03'));
  const relations = new Set(state.links.filter((l) => l.ruleId?.startsWith('RULE-PREM')).map((l) => l.relation));
  for (const relation of ['depends-on', 'tests', 'revisits', 'involves', 'tracks-followup', 'funds']) {
    assert.ok(relations.has(relation), `${relation} typed edge exists`);
  }
  const newDecision = markerDecisions(state)[0];
  assert.equal(newDecision.options.length, 4);
  assert.equal(newDecision.chosen, '', 'no automatic reversal');
  assert.ok(state.links.some((l) => l.sourceType === 'budget' && l.targetId === newDecision.id), 'value context inherited by the re-decision');
  assert.ok(state.events.some((e) => e.type === 'premise.evidence'));
  assert.ok(state.events.filter((e) => e.type === 'automation.propagated').length >= 3);
});

function storeRules(result) {
  return (result.propagations || []).map((p) => p.ruleId);
}

test('repeated scans converge: no duplicate decisions, delegations or prompts', () => {
  const h = harness();
  const ids = pricedWorkspace(h);
  h.api.recordPremiseEvidence(ids.premiseId, {
    title: 'Drill exceeded window', direction: 'against', strength: 'strong', observedOn: '2026-10-26',
  });
  const governance = () => JSON.stringify({
    decisions: markerDecisions(h.store.state).length,
    delegations: h.store.state.delegations.length,
    prompts: h.store.state.people[0].talkingPoints.length,
  });
  const afterFirst = governance();
  h.api.scanPremises();
  h.api.scanPremises();
  assert.equal(governance(), afterFirst, 'governance writes converge');
  const keys = h.store.state.premises[0].observations.map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length, 'append-only evidence keys stay unique');
});

test('pause suppresses governance writes but keeps sensing; explicit scan always runs', () => {
  const h = harness();
  const ids = pricedWorkspace(h);
  assert.equal(h.api.setPremisePolicy({ autoPropagate: false }).ok, true);
  h.api.recordPremiseEvidence(ids.premiseId, {
    title: 'Private strong counter-evidence', direction: 'against', strength: 'strong', observedOn: TODAY,
  });
  assert.equal(h.store.state.premises[0].status, 'breached', 'belief still updates while paused');
  assert.equal(markerDecisions(h.store.state).length, 0, 'no governance fan-out while paused');
  const scan = h.api.scanPremises();
  assert.equal(scan.ok, true);
  assert.equal(markerDecisions(h.store.state).length, 1, 'explicit human scan runs governance despite pause');
  assert.ok(storeRules(scan).includes(PREMISE_RULE_IDS.BREACH));
});

test('human reaffirmation closes one breach cycle; genuinely newer evidence opens a fresh one', () => {
  const h = harness();
  const ids = pricedWorkspace(h);
  h.api.recordPremiseEvidence(ids.premiseId, {
    title: 'First failed drill', direction: 'against', strength: 'strong', observedOn: '2026-10-26',
  });
  assert.equal(markerDecisions(h.store.state).length, 1);
  const review = h.api.reviewPremise(ids.premiseId, {
    note: 'Checked the runbook, added a hedge and reaffirm the direction.',
    disposition: 'reaffirm', nextReviewOn: '2026-11-20',
  });
  assert.equal(review.ok, true, review.error);
  assert.equal(h.store.state.premises[0].status, 'reaffirmed');
  assert.equal(h.store.state.premises[0].reviewCycle, 1);
  h.api.scanPremises();
  assert.equal(markerDecisions(h.store.state).length, 1, 'no duplicate before new evidence');
  h.advance(5000);
  h.api.recordPremiseEvidence(ids.premiseId, {
    title: 'Second independent failed drill', direction: 'against', strength: 'strong', observedOn: TODAY,
  });
  assert.equal(h.store.state.premises[0].status, 'breached');
  assert.equal(markerDecisions(h.store.state).length, 2, 'new cycle opens exactly one new decision');
});

test('overdue signpost review queues one blameless prompt and clears after review', () => {
  const h = harness();
  const personId = h.api.addPerson({ name: 'Ada Owner' }).id;
  const decisionId = h.api.addDecision({ title: 'Adopt failover', date: TODAY, options: [{ label: 'A' }, { label: 'B' }] }).id;
  const created = h.api.addPremise({
    title: 'Failover fits', statement: 'The signing layer recovers within half a day.',
    signpost: 'A failed restore drill is the first dated signpost.',
    decisionId, ownerId: personId, reviewBy: addDays(TODAY, -5),
  });
  assert.equal(created.ok, true, created.error);
  const marker = `[${PREMISE_RULE_IDS.REVIEW}:${created.id}]`;
  assert.ok(h.store.state.people.find((p) => p.id === personId).talkingPoints.some((t) => t.includes(marker)));
  h.api.reviewPremise(created.id, {
    note: 'Reviewed and reaffirmed with a new date.', disposition: 'reaffirm', nextReviewOn: addDays(TODAY, 21),
  });
  assert.ok(!h.store.state.people.find((p) => p.id === personId).talkingPoints.some((t) => t.includes(marker)), 'prompt self-clears');
});

test('post-commit rule is registered upstream of Decision Tempo and reacts to declared event rules', () => {
  const h = harness();
  const ids = pricedWorkspace(h);
  const draft = JSON.parse(JSON.stringify(h.store.state));
  const event = { type: 'premise.scan', entity: 'workspace', entityId: '', summary: 'test scan' };
  const effects = premiseRule(draft, { event, now: NOW, idFactory: h.idFactory, logEvent: () => {} });
  assert.ok(Array.isArray(effects));
  assert.ok(!event.rules?.includes('decisionTempo'), 'no downstream declaration when no new decision was created');
  assert.equal(DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'premiseRule')
    < DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'decisionTempoRule'), true);
  assert.ok(ids.premiseId);
});

/* ==================================================== 5. catalog, signals, CSV, brief, demo */

test('automation catalog: four premise rules are registered and ordered on the shared spine', () => {
  assert.equal(AUTOMATION_RULES.length, 90);
  for (const id of Object.values(PREMISE_RULE_IDS)) {
    assert.ok(PREMISE_RULES.some((r) => r.id === id), `${id} documented`);
    assert.ok(AUTOMATION_RULES.some((r) => r.id === id), `${id} in shared catalog`);
  }
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((r) => r.name === 'premiseRule'));
  assert.ok(DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'premiseRule')
    < DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'decisionTempoRule'));
});

test('PREM signals merge into Insights without inventing findings on an empty workspace', () => {
  const empty = createEmptyState(STAMP);
  assert.deepEqual(premiseSignals(empty, NOW), []);
  const demo = buildDemoState(NOW);
  const signals = premiseSignals(demo, NOW);
  assert.ok(signals.length > 0);
  assert.ok(signals.every((s) => s.domain === 'Premise sentinel'));
  assert.ok(signals.every((s) => s.severity >= 1 && s.severity <= 5));
  assert.ok(DOMAIN_ORDER.includes('Premise sentinel'));
  const insights = buildInsights(demo, NOW);
  assert.ok(insights.findings.some((f) => f.domain === 'Premise sentinel'));
  assert.ok(insights.byDomain.some((d) => d.domain === 'Premise sentinel'));
  assert.ok(premiseAttentionCount(demo, NOW) >= 1);
});

test('CSV scope #35: opaque premise telemetry, no titles, statements, notes or names', () => {
  assert.equal(CSV_EXPORTS.length, 35);
  const spec = CSV_EXPORTS.find((s) => s.key === 'premises');
  assert.ok(spec);
  assert.equal(spec.sensitive, false);
  const demo = buildDemoState(NOW);
  const result = exportWorkspaceCsv(demo, 'premises', { now: NOW });
  assert.equal(result.ok, true, result.error);
  assert.ok(!/Signing-service recovery|Month-end reconciliation|Ada|Priya|Mei|Signpost|pre-mortem/.test(result.csv));
  const parsed = parseCsv(result.csv);
  assert.equal(parsed.rows.length, demo.premises.length);
  for (const required of ['premise_code', 'prior_pct', 'posterior_pct', 'log_bayes_factor', 'bayes_factor', 'information_gain_bits', 'confidence', 'sprt_verdict', 'stale_review', 'engine_version']) {
    assert.ok(parsed.headers.includes(required), `column ${required}`);
  }
  const codeIdx = parsed.headers.indexOf('premise_code');
  const engineIdx = parsed.headers.indexOf('engine_version');
  assert.deepEqual(parsed.rows.map((r) => r[codeIdx]), ['premise_1', 'premise_2']);
  assert.ok(parsed.rows.every((r) => r[engineIdx] === PREMISE_ENGINE_VERSION));
});

test('board brief is deterministic, names the policy and states the caveats', () => {
  const demo = buildDemoState(NOW);
  const a = premiseBrief(demo, NOW);
  const b = premiseBrief(demo, NOW);
  assert.equal(a, b);
  assert.match(a, /Assumption Ledger/);
  assert.match(a, /Wald-style log-BF boundaries/);
  assert.match(a, /Caveats/);
  assert.match(a, /NOT a cash forecast/);
  assert.match(a, /Conflicts and anonymous pulses are never read/);
  assert.match(a, /Signing-service recovery fits the survival window/);
});

test('demo ledger is engine-produced: two premises, real dependency evidence, typed links, no fake breach decision', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.premises.length, 2);
  const statuses = demo.premises.map((p) => p.status).sort();
  assert.deepEqual(statuses, ['supported', 'watch']);
  assert.ok(demo.premises.every((p) => p.observations.length >= 1));
  assert.ok(demo.premises.every((p) => p.observations[0].sensorId === 'dependency-continuity'));
  assert.ok(demo.premises.every((p) => p.sourceRefs.length === 1));
  assert.ok(demo.links.some((l) => l.ruleId === PREMISE_RULE_IDS.SCOPE));
  assert.equal(markerDecisions(demo).length, 0, 'demo shows sensing without forcing a breach');
  const report = buildPremiseReport(demo, NOW);
  assert.equal(report.premises.length, 2);
  assert.equal(report.totals.count, 2);
  assert.equal(report.totals.watch, 1);
  assert.equal(report.sensors.length, 8);
});

/* ==================================================== 6. DOM */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const css = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = css;
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

async function axeViolations(env, node = env.document.querySelector('#view')) {
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  if (!env.window.axe) env.window.eval(axeSrc);
  const result = await env.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: all four tabs, policy save, scan and register dialog render axe-clean', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/premises', '#/premises?tab=evidence', '#/premises?tab=exposure', '#/premises?tab=policy']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 200, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    assert.ok(env.document.querySelector('[href="#/premises"]'), 'reachable from navigation');

    // Policy tab: change the watch threshold through the real validated API.
    app.ctx.navigate('#/premises?tab=policy');
    const watchInput = env.document.querySelector('input[aria-label="Premise watch threshold percent"]');
    assert.ok(watchInput);
    watchInput.value = '62';
    const save = [...env.document.querySelectorAll('#view button')].find((b) => /save policy/i.test(b.textContent));
    assert.ok(save, 'save policy button exists');
    save.click();
    assert.equal(app.store.state.settings.premiseWatchPct, 62);

    // Explicit scan runs idempotently without console errors.
    app.ctx.navigate('#/premises');
    const scan = [...env.document.querySelectorAll('#view button')].find((b) => /run signpost scan/i.test(b.textContent));
    assert.ok(scan);
    scan.click();
    assert.equal(markerDecisions(app.store.state).length, 0, 'demo scan does not invent a breach decision');

    // Register dialog has accessible fields and closes by keyboard-friendly control.
    const register = [...env.document.querySelectorAll('#view button')].find((b) => /register assumption/i.test(b.textContent));
    assert.ok(register);
    register.click();
    const modal = env.document.querySelector('[role="dialog"]');
    assert.ok(modal, 'dialog opens');
    assert.match(modal.textContent, /Pre-register a load-bearing assumption/);
    assert.ok(modal.querySelector('input[name="title"]'));
    assert.ok(modal.querySelector('textarea[name="signpost"]'));
    assert.deepEqual(await axeViolations(env, env.document.getElementById('modal-root')), [], 'dialog axe-clean');
    const closeBtn = modal.querySelector('button[aria-label="Close dialog"]')
      || env.document.querySelector('button[aria-label="Close dialog"]');
    assert.ok(closeBtn, 'accessible close control exists');
    closeBtn.click();
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});
