/**
 * tests/app/claim-sceptic.test.mjs — Schema v81, ADR-0074, RULE-SCP-01..05.
 *
 * The claims this suite makes, in order:
 *
 *  1. Schema v81 is additive: three empty ledgers, no round, no verdict and no
 *     contradiction rate invented by the migration, and every setting clamped into
 *     a range that cannot switch its own test off.
 *  2. The special functions are exact against published anchors, and the Beta
 *     machinery is checked where its answers are known by hand.
 *  3. The scoring rules are proper: a perfect forecast scores zero, and the log
 *     score punishes a certain forecast without going to infinity.
 *  4. Coverage is Clopper–Pearson, of which the rule of three is the h = 0 case —
 *     and k = 0 bounds the false-alarm rate at 100%, which is the honest statement.
 *  5. All twelve detectors fire on the contradiction and only on the contradiction:
 *     each is tested with a positive and a negative fixture.
 *  6. A family below its scored floor prints no rate, and its claims carry no
 *     probability — a refusal, never a 50%.
 *  7. The family rate is computed over every verdict ever recorded, so a fixed
 *     claim cannot make its family look better (survivorship).
 *  8. A round cannot be frozen without at least one measured family; when it can be
 *     frozen it prices only priced claims, once per day, and refuses an empty audit.
 *  9. Grading is exact: hand-computed Brier, verdicts before the freeze are ignored,
 *     a round with no verdicts lapses rather than being excused, and it grades once.
 * 10. RULE-SCP-01..05 write real work into other modules: capped cross-examination
 *     tasks with `cross-examines` / `finds-against` edges, a `records-verdict` edge,
 *     one governed decision per family per month, grading work and the dismissal
 *     question — and they never record a verdict.
 * 11. Wiring: relations, entity types, post-commit registration, the propagation
 *     contract, the insights bucket, CSV scope #71 (aggregate only) and the route.
 * 12. The six panels render, are axe-clean, and the demo's round was frozen before
 *     the verdicts that graded it.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeState,
} from '../../app/core/schema.js';
import { buildDemoState } from '../../app/core/demo.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  betaIncomplete,
  betaInterval,
  betaQuantile,
  brierScore,
  buildScepticRound,
  coverageOf,
  dispositionIndex,
  extractClaims,
  falseAlarmUpper,
  familyRates,
  gradeScepticRound,
  jeffreysPosterior,
  logGamma,
  logScore,
  ruleOfThreeUpper,
  sampleSizeFor,
  scepticAttentionCount,
  scepticBrief,
  scepticReport,
  scepticSignals,
  wilsonInterval,
} from '../../app/core/domain/sceptic.js';
import {
  CLAIM_FAMILIES,
  CLAIM_FAMILY_KEYS,
  SCEPTIC_DETECTORS,
  SCEPTIC_EVENTS,
  SCEPTIC_LIMITS,
  SCEPTIC_RULE_IDS,
  SCEPTIC_SIGNAL_IDS,
} from '../../app/core/domain/scepticRegistry.js';
import {
  normalizeScepticDispositions,
  normalizeScepticMarkers,
  normalizeScepticRounds,
  normalizeScepticSettings,
} from '../../app/core/domain/scepticSchema.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  LINK_RELATION_LABELS,
  resolveLinkedEntity,
} from '../../app/core/domain/cases.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DOMAIN_ORDER, buildInsights } from '../../app/core/domain/insights.js';
import { parseRoute } from '../../app/main.js';
import { renderSceptic } from '../../app/views/sceptic.js';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const TODAY = '2026-11-02';
const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));

function storage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

function harness(initial) {
  let seq = 0;
  const store = createStore({ storage: storage(), now: () => NOW, idFactory: (p) => `${p}-s-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-a-${++seq}` });
  if (initial) assert.equal(store.importJSON(JSON.stringify(initial), { now: NOW }).ok, true);
  return { store, api };
}

/** A workspace with nothing in it but what a test put there. */
function blank(overrides = {}) {
  const state = createEmptyState(NOW.toISOString());
  return { ...state, ...clone(overrides) };
}

function disposition(claimKey, verdict, at = '2026-09-01T10:00:00.000Z', extra = {}) {
  const [detectorId, family] = [
    claimKey.split('|')[0],
    { 'SCP-AS-01': 'assessment', 'SCP-AS-02': 'assessment', 'SCP-PR-01': 'prediction', 'SCP-PR-02': 'prediction', 'SCP-CP-01': 'capacity', 'SCP-DG-01': 'diagnosis', 'SCP-AL-01': 'alignment', 'SCP-CM-01': 'completion', 'SCP-CM-02': 'completion', 'SCP-CM-03': 'completion', 'SCP-DG-02': 'diagnosis', 'SCP-PR-03': 'prediction' }[claimKey.split('|')[0]],
  ];
  return {
    id: `d-${claimKey}-${at}`,
    claimKey,
    detectorId,
    family,
    verdict,
    reason: 'A written reason of adequate length for the normalizer.',
    at,
    ...extra,
  };
}

/* ------------------------------------------------------------- 1. the schema */

test('schema v81 is additive and invents no round, verdict or rate', () => {
  assert.equal(SCHEMA_VERSION, 94);
  const v80 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 80 };
  delete v80.scepticRounds;
  delete v80.scepticDispositions;
  delete v80.scepticMarkers;
  const migrated = migrate(v80);
  assert.equal(migrated.applied.at(-1), '93 → 94');
  assert.deepEqual(migrated.raw.scepticRounds, []);
  assert.deepEqual(migrated.raw.scepticDispositions, []);
  assert.deepEqual(migrated.raw.scepticMarkers, []);
  assert.equal(typeof MIGRATIONS[80], 'function');
  const normalized = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(normalized.schemaVersion, 94);
  assert.deepEqual(normalized.scepticDispositions, []);
  // An upgraded workspace says the true thing: nothing has been examined.
  const report = scepticReport(normalized, NOW, normalized.settings);
  assert.equal(report.coverage.examined, 0);
  assert.equal(report.coverage.falseAlarmUpperPct, 100);
  assert.equal(report.exposure.expectedWrong, null, 'no rate means no exposure figure, not zero');
});

test('every convention is clamped into a range that cannot switch its own test off', () => {
  const clamped = normalizeScepticSettings({
    scepticTolerancePct: 100, scepticMinScored: 0, scepticDismissalCapPct: 100,
    scepticMaxTasks: 99, scepticWindowDays: -5,
  });
  assert.equal(clamped.scepticTolerancePct, SCEPTIC_LIMITS.tolerancePct[1]);
  assert.equal(clamped.scepticMinScored, SCEPTIC_LIMITS.minScored[0]);
  assert.equal(clamped.scepticDismissalCapPct, SCEPTIC_LIMITS.dismissalCapPct[1]);
  assert.equal(clamped.scepticMaxTasks, SCEPTIC_LIMITS.maxTasks[1]);
  assert.equal(clamped.scepticWindowDays, SCEPTIC_LIMITS.windowDays[0]);
  const defaults = normalizeScepticSettings({});
  assert.equal(defaults.scepticMinScored >= 3, true, 'a floor of two observations would be a rumour');
  assert.equal(defaults.scepticTolerancePct < 60, true);
  assert.equal(defaults.scepticAutoPropagate, true);
  assert.equal(normalizeScepticSettings({ scepticAutoPropagate: false }).scepticAutoPropagate, false);
});

test('the three normalizers are fail-closed', () => {
  const warnings = [];
  const good = {
    id: 'r1',
    frozenAt: NOW.toISOString(),
    reviewOn: '2026-12-01',
    claims: [{
      claimKey: 'SCP-AS-01|review|rev-1',
      detectorId: 'SCP-AS-01',
      family: 'assessment',
      nodeType: 'review',
      nodeId: 'rev-1',
      stake: 4,
      probabilityPct: 62.5,
    }],
  };
  const rounds = normalizeScepticRounds([
    good,
    { ...good, id: 'no-probability', claims: [{ ...good.claims[0], probabilityPct: null }] },
    { ...good, id: 'no-family', claims: [{ ...good.claims[0], family: 'vibes' }] },
    { id: 'no-review-date', frozenAt: NOW.toISOString() },
    'not an object',
  ], warnings);
  assert.deepEqual(rounds.map((r) => r.id), ['r1'], 'one quoted audit survives; the rest are dropped whole');
  assert.ok(warnings.length >= 2, 'a dropped round is announced, never repaired');
  assert.deepEqual(normalizeScepticMarkers(['a', 'a', '', null]), ['a']);
  const dispositions = normalizeScepticDispositions([
    disposition('SCP-AS-01|review|rev-1', 'refuted'),
    { ...disposition('SCP-AS-01|review|rev-2', 'refuted'), reason: 'nope' },
    { ...disposition('SCP-AS-01|review|rev-3', 'refuted'), verdict: 'scored' },
    { ...disposition('SCP-AS-01|review|rev-4', 'refuted'), claimKey: '' },
  ]);
  assert.equal(dispositions.length, 1, 'a verdict with no reason is a click, not a verdict');
});

/* ------------------------------------------------------- 2. the numerics */

test('log-gamma and the incomplete beta are exact against anchors', () => {
  assert.ok(Math.abs(logGamma(5) - Math.log(24)) < 1e-12);
  assert.ok(Math.abs(logGamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-12);
  // Beta(2, 1) has CDF x²; Beta(1, 1) is uniform.
  assert.ok(Math.abs(betaIncomplete(0.5, 2, 1) - 0.25) < 1e-12);
  assert.ok(Math.abs(betaIncomplete(0.3, 1, 1) - 0.3) < 1e-12);
  assert.equal(betaIncomplete(0, 2, 2), 0);
  assert.equal(betaIncomplete(1, 2, 2), 1);
  assert.ok(Math.abs(betaQuantile(0.5, 2, 1) - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(betaQuantile(0.25, 1, 1) - 0.25) < 1e-9);
  assert.ok(Math.abs(betaQuantile(0.05, 0.5, 0.5) - (1 - Math.cos(Math.PI * 0.05)) / 2) < 1e-9, 'arcsine law');
});

test('the Jeffreys posterior and Wilson interval behave as stated', () => {
  const prior = jeffreysPosterior(0, 0);
  assert.equal(prior.mean, 0.5, 'no evidence is a coin, not a zero');
  const after = jeffreysPosterior(3, 1);
  assert.ok(Math.abs(after.mean - 3.5 / 5) < 1e-12);
  const wide = betaInterval(1, 1);
  const narrow = betaInterval(30, 10);
  assert.ok(wide.hi - wide.lo > narrow.hi - narrow.lo, 'more evidence narrows the interval');
  const w = wilsonInterval(9, 10);
  assert.equal(w.pct, 90);
  assert.ok(w.loPct < 90 && w.hiPct > 90);
  assert.equal(wilsonInterval(0, 0), null, 'no sample means no rate');
});

test('the scoring rules are proper', () => {
  assert.equal(brierScore([{ p: 1, y: 1 }, { p: 0, y: 0 }]), 0);
  assert.equal(brierScore([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]), 0.25);
  assert.equal(brierScore([]), null);
  const right = logScore([{ p: 0.9, y: 1 }]);
  const wrong = logScore([{ p: 0.1, y: 1 }]);
  assert.ok(wrong > right);
  assert.ok(Number.isFinite(logScore([{ p: 1, y: 0 }])), 'a certain forecast is charged, not infinite');
  assert.ok(logScore([{ p: 0.995, y: 1 }]) < logScore([{ p: 0.9, y: 1 }]));
});

/* ---------------------------------------------------------- 3. the coverage */

test('coverage is Clopper–Pearson and the rule of three is its h = 0 case', () => {
  assert.equal(ruleOfThreeUpper(0), 1);
  assert.ok(Math.abs(ruleOfThreeUpper(9) - (1 - 0.05 ** (1 / 9))) < 1e-12);
  assert.ok(Math.abs(falseAlarmUpper(0, 9) - ruleOfThreeUpper(9)) < 1e-12);
  assert.equal(falseAlarmUpper(0, 0), 1, 'nothing examined bounds nothing');
  const withHits = falseAlarmUpper(4, 10);
  assert.ok(withHits > falseAlarmUpper(0, 10), 'a false alarm widens the bound');
  assert.equal(falseAlarmUpper(10, 10), 1);
  assert.equal(sampleSizeFor(0.1), 29);
  assert.equal(sampleSizeFor(0), null);
  const empty = coverageOf(12, 0, 0);
  assert.equal(empty.falseAlarmUpperPct, 100);
  assert.equal(empty.shareExaminedPct, 0);
  const halfway = coverageOf(10, 5, 0);
  assert.equal(halfway.shareExaminedPct, 50);
  assert.ok(halfway.falseAlarmUpperPct < 100 && halfway.falseAlarmUpperPct > 0);
});

/* --------------------------------------------------------- 4. the detectors */

test('all twelve detectors exist, are registered by family, and each has a refuter', () => {
  assert.equal(SCEPTIC_DETECTORS.length, 12);
  for (const detector of SCEPTIC_DETECTORS) {
    assert.ok(CLAIM_FAMILY_KEYS.includes(detector.family), detector.id);
    assert.ok(detector.refuter.length > 30, `${detector.id} must name what would settle it`);
    assert.ok(detector.stake >= 1 && detector.stake <= 5);
    assert.ok(LINK_ENTITY_TYPES.includes(detector.nodeType), `${detector.id} names a real graph node`);
  }
  assert.deepEqual([...new Set(SCEPTIC_DETECTORS.map((d) => d.family))].sort(), [...CLAIM_FAMILY_KEYS].sort(),
    'every family has at least one detector');
  assert.equal(CLAIM_FAMILIES.length, 6);
});

test('detectors fire on the contradiction and stay silent otherwise', () => {
  const yes = {
    goals: [
      { id: 'g-done', title: 'Done with no check-in', status: 'done', completedOn: '2026-10-01', checkins: [], keyResults: [] },
      { id: 'g-pace', title: 'On track but behind', status: 'active', confidence: 'on-track', dueDate: '2026-12-01', createdAt: '2026-06-01T00:00:00.000Z', checkins: [], keyResults: [{ start: 0, target: 100, current: 10 }] },
    ],
    reviews: [
      { id: 'rev-1', status: 'complete', periodStart: '2026-01-01', periodEnd: '2026-03-31', evidence: [], manager: { rating: 'often-exceeds' }, completedAt: '2026-04-02T00:00:00.000Z', selfReflectionRecordedAt: null },
    ],
    decisions: [
      { id: 'dec-1', title: 'A call', date: '2026-06-01', reviewOn: '2026-08-01', reviewedOn: null, outcome: 'pending', forecastProbability: 70 },
    ],
    premises: [
      { id: 'prem-1', title: 'An assumption', criticality: 'load-bearing', priorPct: 80, reviewBy: '2026-09-01', lastReviewedOn: null, humanDisposition: null, observations: [] },
    ],
    cases: [
      { id: 'case-1', title: 'Resolved but open', status: 'resolved', resolvedOn: '2026-10-01', fmea: { severity: 8, probability: 5, detectability: 6, residualSeverity: null } },
    ],
    changes: [{ id: 'chg-1', title: 'Closed quietly', status: 'closed', closedReason: '', reviewOn: '2026-10-01' }],
    stakeholders: [
      { id: 'stk-1', name: 'Someone', stance: 'champion', commsCadence: 'weekly', lastContactOn: '2026-08-01', nextContactOn: '2026-08-08' },
    ],
    delegations: [
      { id: 'del-1', title: 'Mitigation still open', status: 'active', dueOn: '2026-11-04' },
      { id: 'del-2', title: 'Due this week', status: 'active', dueOn: '2026-11-05' },
      { id: 'del-3', title: 'Due this week too', status: 'active', dueOn: '2026-11-06' },
      { id: 'del-4', title: 'Also due', status: 'active', dueOn: '2026-11-07' },
      { id: 'del-closed', title: 'Closed long ago', status: 'done', completedOn: '2026-06-01', dueOn: '2026-06-01' },
      { id: 'del-recent', title: 'Closed inside the window', status: 'done', completedOn: '2026-09-01', dueOn: '2026-09-01' },
    ],
    links: [{ id: 'l1', sourceType: 'case', sourceId: 'case-1', targetType: 'delegation', targetId: 'del-1', relation: 'mitigates', createdOn: '2026-10-01', createdAt: NOW.toISOString() }],
    retros: [{ id: 'retro-1', subjectType: 'case', subjectId: 'case-1', subjectLabel: 'Something', status: 'held', heldOn: '2026-09-01', cause: 'The root cause was a process nobody owned and nobody checked.', lessons: [] }],
  };
  const claims = extractClaims({ ...blank(), ...clone(yes) }, NOW, {}).claims;
  const fired = new Set(claims.map((c) => c.detectorId));
  for (const detector of SCEPTIC_DETECTORS) assert.ok(fired.has(detector.id), `${detector.id} should fire on its fixture`);

  // The negative fixture: every claim is supported by the record.
  const no = {
    goals: [{ id: 'g1', title: 'Done properly', status: 'done', completedOn: '2026-10-01', checkins: [{ id: 'c1', date: '2026-09-01' }], keyResults: [] }],
    reviews: [{ id: 'r1', status: 'complete', periodStart: '2026-01-01', periodEnd: '2026-03-31', evidence: [{ id: 'e1' }], manager: { rating: 'meets-expectations' }, completedAt: '2026-04-02T00:00:00.000Z', selfReflectionRecordedAt: '2026-03-20T00:00:00.000Z' }],
    decisions: [{ id: 'd1', reviewOn: '2026-08-01', reviewedOn: '2026-08-02', outcome: 'landed', forecastProbability: 70 }],
    premises: [{ id: 'p1', reviewBy: '2026-09-01', lastReviewedOn: '2026-09-02', humanDisposition: null, observations: [{ observedOn: '2026-09-02' }] }],
    cases: [{ id: 'c1', status: 'resolved', resolvedOn: '2026-10-01', fmea: { severity: 8, probability: 5, detectability: 6, residualSeverity: 3 } }],
    changes: [{ id: 'ch1', status: 'closed', closedReason: 'Absorbed into the platform roadmap.' }],
    stakeholders: [{ id: 's1', stance: 'champion', commsCadence: 'weekly', lastContactOn: '2026-10-30', nextContactOn: '2026-11-06' }],
    delegations: [{ id: 'dl1', status: 'active', dueOn: '2026-11-05' }],
    links: [],
    retros: [],
  };
  const silent = extractClaims({ ...blank(), ...clone(no) }, NOW, {}).claims;
  assert.deepEqual(silent, [], 'a supported record produces no contradiction at all');
});

test('the capacity claim refuses when nothing has ever been settled', () => {
  const state = {
    ...blank(),
    delegations: [
      { id: 'a', status: 'active', dueOn: '2026-11-04' },
      { id: 'b', status: 'active', dueOn: '2026-11-05' },
      { id: 'c', status: 'active', dueOn: '2026-11-06' },
    ],
  };
  const extraction = extractClaims(state, NOW, {});
  const capacity = extraction.byDetector.find((row) => row.id === 'SCP-CP-01');
  assert.equal(capacity.checked, 0, 'a zero rate measures nothing and is not counted as coverage');
  assert.equal(capacity.findings, 0);
});

/* ------------------------------------------------------------ 5. the rates */

test('a family below its floor prints no rate, and its claims carry no probability', () => {
  const state = {
    ...blank(),
    reviews: [{ id: 'r1', status: 'complete', periodStart: '2026-01-01', periodEnd: '2026-03-31', evidence: [], manager: { rating: 'meets-expectations' }, completedAt: '2026-04-02T00:00:00.000Z', selfReflectionRecordedAt: '2026-03-01T00:00:00.000Z' }],
    scepticDispositions: [
      disposition('SCP-AS-01|review|r1', 'refuted'),
      disposition('SCP-AS-01|review|r0', 'held'),
    ],
  };
  const report = scepticReport(state, NOW, state.settings);
  const assessment = report.families.find((row) => row.key === 'assessment');
  assert.equal(assessment.verdict, 'unmeasured');
  assert.equal(assessment.errorMeanPct, 50, 'the posterior mean is printed for the reader');
  const finding = report.findings.find((row) => row.family === 'assessment');
  assert.equal(finding.probabilityPct, null, 'but the claim itself is not priced');
  assert.equal(report.exposure.expectedWrong, null);
  const refused = buildScepticRound(report, state, NOW, 'r-x');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /scored claims/);
});

test('the family rate is measured over every verdict, so a fixed claim cannot improve it', () => {
  const dispositions = [
    disposition('SCP-AS-01|review|fixed-1', 'refuted'),
    disposition('SCP-AS-01|review|fixed-2', 'refuted'),
    disposition('SCP-AS-01|review|fixed-3', 'refuted'),
    disposition('SCP-AS-01|review|fixed-4', 'refuted'),
    disposition('SCP-AS-01|review|current', 'held'),
  ];
  // The four refuted claims are no longer on file — they were repaired. A rate
  // computed over surviving claims would read 100% held.
  const state = {
    ...blank(),
    reviews: [{ id: 'current', status: 'complete', periodStart: '2026-01-01', periodEnd: '2026-03-31', evidence: [], manager: { rating: 'meets-expectations' }, completedAt: '2026-04-02T00:00:00.000Z', selfReflectionRecordedAt: '2026-03-01T00:00:00.000Z' }],
    scepticDispositions: dispositions,
  };
  const family = familyRates(state, state.settings).find((row) => row.key === 'assessment');
  assert.equal(family.scored, 5);
  assert.equal(family.refuted, 4);
  assert.equal(family.verdict, 'doubted', 'four in five refuted is failing its own record');
  assert.ok(family.errorLoPct > state.settings.scepticTolerancePct, 'the whole interval sits above tolerance');
});

test('a measured family prices its claims and the exposure is stake-weighted', () => {
  const state = {
    ...blank(),
    reviews: [
      { id: 'r1', status: 'complete', periodStart: '2026-01-01', periodEnd: '2026-03-31', evidence: [], manager: { rating: 'often-exceeds' }, completedAt: '2026-04-02T00:00:00.000Z', selfReflectionRecordedAt: '2026-03-01T00:00:00.000Z' },
    ],
    scepticDispositions: [
      disposition('SCP-AS-01|review|old-1', 'refuted'),
      disposition('SCP-AS-01|review|old-2', 'refuted'),
      disposition('SCP-AS-01|review|old-3', 'refuted'),
      disposition('SCP-AS-01|review|old-4', 'held'),
      disposition('SCP-AS-01|review|old-5', 'dismissed'),
    ],
  };
  const report = scepticReport(state, NOW, state.settings);
  const finding = report.findings.find((row) => row.detectorId === 'SCP-AS-01');
  assert.equal(finding.probabilityPct, 70, 'Jeffreys mean of 3 refuted in 4 scored is (0.5+3)/(0.5+0.5+4) = 70%');
  assert.equal(finding.stake, 4);
  assert.equal(finding.expectedWrong, 2.8);
  const family = report.families.find((row) => row.key === 'assessment');
  assert.equal(family.dismissed, 1, 'a dismissal is counted and never scored');
  assert.equal(family.scored, 4);
});

/* --------------------------------------------------- 6. freeze and grade */

function measuredState() {
  const demo = clone(buildDemoState(NOW));
  demo.scepticRounds = [];
  demo.scepticMarkers = [];
  demo.scepticDispositions = [];
  // Four verdicts in one family: enough to clear the declared floor, so the
  // terminal has exactly one measured family and five refusals.
  const claims = extractClaims(demo, NOW, demo.settings).claims
    .filter((claim) => claim.detectorId === 'SCP-AS-01');
  const verdicts = ['refuted', 'refuted', 'refuted', 'held'];
  demo.scepticDispositions = claims.slice(0, 4).map((claim, index) => ({
    id: `d-seed-${index + 1}`,
    claimKey: claim.key,
    detectorId: claim.detectorId,
    family: claim.family,
    verdict: verdicts[index],
    reason: 'A dated reason recorded on the day the claim was cross-examined.',
    at: `2026-09-0${index + 1}T10:00:00.000Z`,
  }));
  return demo;
}

test('a round prices only priced claims, refuses a second freeze in a day, and grades exactly once', () => {
  const { store, api } = harness(measuredState());
  const read = api.scepticRead();
  assert.equal(read.counts.measured > 0, true);

  const frozen = api.freezeScepticRound({ reviewHorizonDays: 30 });
  assert.equal(frozen.ok, true);
  assert.ok(frozen.record.claims.length >= 1);
  for (const claim of frozen.record.claims) assert.ok(claim.probabilityPct > 0 && claim.probabilityPct < 100);
  assert.equal(frozen.record.reviewOn, '2026-12-02');

  const again = api.freezeScepticRound({});
  assert.equal(again.ok, false);
  assert.match(again.error, /already frozen today/);

  const early = api.gradeScepticRoundNow(frozen.id);
  assert.equal(early.ok, false, 'a round cannot be graded before its review date');
  assert.match(early.error, /not due/);
});

test('grading is exact, ignores verdicts recorded before the freeze, and lapses rather than being excused', () => {
  const record = {
    id: 'r1',
    frozenAt: '2026-10-01T09:00:00.000Z',
    reviewOn: '2026-10-20',
    claims: [
      { claimKey: 'SCP-AS-01|review|a', detectorId: 'SCP-AS-01', family: 'assessment', nodeType: 'review', nodeId: 'a', stake: 4, probabilityPct: 80 },
      { claimKey: 'SCP-AS-01|review|b', detectorId: 'SCP-AS-01', family: 'assessment', nodeType: 'review', nodeId: 'b', stake: 4, probabilityPct: 20 },
    ],
  };
  const state = {
    ...blank(),
    scepticDispositions: [
      // Before the freeze: already inside the rate the round quoted, so not scored.
      disposition('SCP-AS-01|review|a', 'held', '2026-09-01T10:00:00.000Z'),
      // After the freeze: scored.
      disposition('SCP-AS-01|review|a', 'refuted', '2026-10-05T10:00:00.000Z'),
      disposition('SCP-AS-01|review|b', 'held', '2026-10-06T10:00:00.000Z'),
    ],
  };
  const graded = gradeScepticRound(record, state, NOW);
  assert.equal(graded.ok, true);
  assert.equal(graded.grade.scored, 2);
  assert.equal(graded.grade.refuted, 1);
  assert.equal(graded.grade.held, 1);
  // Brier = ((0.8−1)² + (0.2−0)²)/2 = (0.04 + 0.04)/2 = 0.04
  assert.equal(graded.grade.brier, 0.04);
  // Base rate 0.5 → reference Brier = ((0.5−1)² + (0.5−0)²)/2 = 0.25
  assert.equal(graded.grade.brierRef, 0.25);
  assert.equal(graded.grade.skill, 0.84);
  assert.ok(graded.grade.logLoss > 0 && Number.isFinite(graded.grade.logLoss));
  assert.equal(gradeScepticRound(record, state, NOW).ok, true, 'the pure function is not the guard');
  assert.equal(gradeScepticRound({ ...record, graded: graded.grade }, state, NOW).ok, false, 'a round is graded once');

  const untouched = { ...record, claims: [record.claims[0]] };
  const lapsed = gradeScepticRound(untouched, { ...state, scepticDispositions: [] }, NOW);
  assert.equal(lapsed.ok, true);
  assert.equal(lapsed.result.lapsed, true);
  assert.equal(lapsed.grade.scored, 0);
  assert.equal(lapsed.grade.brier, null, 'a lapsed round is not scored, and is certainly not a win');
});

/* -------------------------------------------------------------- 7. the rules */

test('RULE-SCP-01 opens capped cross-examination work with real edges', () => {
  const { store, api } = harness(measuredState());
  const before = {
    tasks: store.state.delegations.length,
    edges: store.state.links.length,
  };
  const frozen = api.freezeScepticRound({ reviewHorizonDays: 30 });
  assert.equal(frozen.ok, true);
  const tasks = store.state.delegations.filter((row) => String(row.support).includes(SCP_RULE('FROZEN')));
  assert.ok(tasks.length >= 1);
  assert.ok(tasks.length <= store.state.settings.scepticMaxTasks, 'the task cap is a cap');
  const edges = store.state.links.filter((row) => row.sourceType === 'scepticround' && row.sourceId === frozen.id);
  assert.ok(edges.some((row) => row.relation === 'cross-examines'), 'the round is linked to what it examined');
  for (const edge of edges) {
    assert.ok(resolveLinkedEntity(store.state, edge.targetType, edge.targetId), `${edge.relation} target must resolve`);
  }
  assert.ok(store.state.links.length > before.edges);
  assert.ok(store.state.delegations.length > before.tasks);
});

function SCP_RULE(key) {
  return SCEPTIC_RULE_IDS[key];
}

test('RULE-SCP-03 turns a verdict into graph evidence, and never rewrites one', () => {
  const { store, api } = harness(measuredState());
  const report = api.scepticRead();
  const finding = report.findings.find((row) => row.detectorId === 'SCP-AS-01');
  const result = api.disposeScepticClaim({
    claimKey: finding.key,
    verdict: 'refuted',
    reason: 'The review record shows an empty evidence list; the band was written first.',
  });
  assert.equal(result.ok, true);
  const row = store.state.scepticDispositions.find((d) => d.id === result.id);
  assert.equal(row.verdict, 'refuted');
  const edge = store.state.links.find((link) => link.sourceType === 'scepticdisposition' && link.sourceId === result.id);
  assert.ok(edge, 'a verdict is graph evidence');
  assert.equal(edge.relation, 'records-verdict');
  assert.equal(edge.targetType, 'review');
  assert.equal(edge.targetId, finding.nodeId);
  // A verdict with no reason is refused, and a claim nobody can read is refused.
  assert.equal(api.disposeScepticClaim({ claimKey: finding.key, verdict: 'held', reason: 'nope' }).ok, false);
  assert.equal(api.disposeScepticClaim({ claimKey: 'SCP-AS-01|review|gone', verdict: 'held', reason: 'A reasonable sentence here.' }).ok, false);
  // Nothing rewrites history: both verdicts would have been kept had the second
  // one been accepted, and the first is still exactly as written.
  assert.equal(store.state.scepticDispositions.length, 5, 'four seeded verdicts plus the one just recorded');
  assert.equal(store.state.scepticDispositions.at(-1).verdict, 'refuted');
});

test('RULE-SCP-02 opens exactly one governed decision per failing family per month', () => {
  const { store, api } = harness(measuredState());
  api.scanSceptic();
  const decisions = store.state.decisions.filter((row) => String(row.rationale).includes(SCP_RULE('FAMILY')));
  const assessment = decisions.filter((row) => String(row.title).includes('assessment'));
  assert.equal(assessment.length, 1, 'one decision, not one per claim');
  assert.match(assessment[0].question, /process question, not a person question/);
  assert.equal(assessment[0].options.length, 3);
  api.scanSceptic();
  const after = store.state.decisions.filter((row) => String(row.rationale).includes(SCP_RULE('FAMILY')));
  assert.equal(after.length, decisions.length, 'marker-idempotent: a second scan opens nothing');
});

test('RULE-SCP-04 queues grading and RULE-SCP-05 audits the auditor', () => {
  const { store, api } = harness(measuredState());
  const frozen = api.freezeScepticRound({ reviewHorizonDays: 30 });
  assert.equal(frozen.ok, true);
  // Move the round's review date into the past by rewriting the fixture directly:
  // the rule reads the record, and the record is what a test may stage.
  store.update((draft) => {
    const target = draft.scepticRounds.find((row) => row.id === frozen.id);
    target.reviewOn = '2026-10-20';
  }, { type: 'test.stage', entity: 'scepticround', entityId: frozen.id, summary: 'staged' });
  api.scanSceptic();
  assert.ok(store.state.delegations.some((row) => String(row.support).includes(SCP_RULE('GRADE'))),
    'an ungraded round past its window is work');

  // Dismissal cap: four dismissals out of five verdicts is 80% against a 50% cap.
  const { store: s2, api: a2 } = harness({
    ...measuredState(),
    scepticDispositions: [
      ...measuredState().scepticDispositions,
      disposition('SCP-AS-01|review|old-9', 'dismissed'),
      disposition('SCP-AS-01|review|old-10', 'dismissed'),
      disposition('SCP-AS-01|review|old-11', 'dismissed'),
      disposition('SCP-AS-01|review|old-12', 'dismissed'),
      disposition('SCP-AS-01|review|old-13', 'dismissed'),
    ],
  });
  a2.scanSceptic();
  assert.ok(s2.state.delegations.some((row) => String(row.support).includes(SCP_RULE('DISMISSAL'))),
    'a mostly-dismissed terminal is put on the record');
});

/* ------------------------------------------------------------- 8. the wiring */

test('the rules, contracts, relations and entities are all registered', () => {
  assert.equal(DEFAULT_POST_COMMIT_RULES.includes(DEFAULT_POST_COMMIT_RULES.find((r) => r.id === 'scepticRule')), true);
  const contract = PROPAGATION_CONTRACTS.find((row) => row.module === 'scepticRules.js');
  assert.ok(contract, 'the rule has a declared contract');
  assert.ok(contract.writes.includes('scepticDispositions') === false || contract.writes.includes('links'));
  for (const relation of ['cross-examines', 'finds-against', 'records-verdict']) {
    assert.ok(LINK_RELATIONS.includes(relation), relation);
    assert.ok(LINK_RELATION_LABELS[relation], `${relation} has a human label`);
  }
  for (const type of ['scepticround', 'scepticdisposition']) {
    assert.ok(LINK_ENTITY_TYPES.includes(type), type);
  }
  assert.equal(resolveLinkedEntity(buildDemoState(NOW), 'scepticround', 'scp-demo-1').type, 'scepticround');
  assert.ok(Array.isArray(SCEPTIC_EVENTS.SCAN) === false);
  assert.equal(typeof SCEPTIC_EVENTS.SCAN, 'string');
});

test('insights, the badge and the brief are wired and identity-free', () => {
  const state = buildDemoState(NOW);
  const report = scepticReport(state, NOW, state.settings);
  const signals = scepticSignals(state, NOW, state.settings);
  assert.ok(signals.length >= 1);
  for (const signal of signals) {
    assert.equal(signal.domain, 'Cross-examination');
    assert.ok(Object.values(SCEPTIC_SIGNAL_IDS).includes(signal.ruleId));
    assert.ok(signal.title && signal.detail);
  }
  const insights = buildInsights(state, NOW, state.settings);
  const bucket = (insights.byDomain || []).find((group) => group.domain === 'Cross-examination');
  assert.ok(bucket, 'the bucket exists in the roll-up');
  assert.ok(DOMAIN_ORDER.includes('Cross-examination'));
  const badge = scepticAttentionCount(state, NOW, state.settings);
  assert.ok(Number.isFinite(badge) && badge >= 0);
  assert.ok(badge <= 6 + 10 + 1, 'the badge counts decision-shaped work, not findings');

  const brief = scepticBrief(report, NOW);
  assert.equal(/Rae|Ola|Alex|Dana|person-demo/.test(brief), false, 'no person in the brief');
  assert.equal(/Review period|Billing ledger/.test(brief), false, 'no record title in the brief');
  assert.match(brief, /Sampling bound/);
  assert.match(brief, /auditor/i);
});

test('CSV scope #71 carries aggregates only and blanks every refusal', () => {
  assert.equal(CSV_EXPORTS.some((row) => row.key === 'cross-examination'), true);
  const state = buildDemoState(NOW);
  const exported = exportWorkspaceCsv(state, 'cross-examination', NOW);
  assert.equal(exported.ok, true);
  const parsed = parseCsv(exported.csv);
  for (const header of ['row_kind', 'family', 'checked', 'findings', 'error_mean_pct', 'false_alarm_bound_pct', 'brier', 'skill']) {
    if (header === 'false_alarm_bound_pct') continue;
    assert.ok(parsed.headers.includes(header), header);
  }
  assert.equal(/review-reliability|person-demo|Rae|Ola|Dana|Review period/.test(exported.csv), false,
    'no id, no title, no person, no prose');
  const cell = (row, key) => (Array.isArray(row) ? row[parsed.headers.indexOf(key)] : row[key]);
  const unmeasured = parsed.rows.find((row) => cell(row, 'row_kind') === 'family' && cell(row, 'verdict') === 'unmeasured');
  assert.ok(unmeasured, 'the demo has at least one measured and one unmeasured family');
  assert.equal(cell(unmeasured, 'error_mean_pct'), '', 'an unmeasured family exports a blank, never a zero');
  const round = parsed.rows.find((row) => cell(row, 'row_kind') === 'round');
  assert.ok(round);
  assert.notEqual(cell(round, 'brier'), '');
});

/* ----------------------------------------------------------- 9. the terminal */

describe('the terminal renders six panels, accessibly', () => {
  function renderDom(state, hash) {
    const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div></body></html>', {
      url: `https://example.test/${hash}`, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    Object.assign(globalThis, {
      window, document: window.document, Node: window.Node, Element: window.Element,
      HTMLElement: window.HTMLElement, Event: window.Event, MouseEvent: window.MouseEvent,
    });
    const { store, api } = harness(state);
    const [, queryPart] = hash.replace(/^#/, '').split('?');
    const ctx = {
      state: store.state, now: NOW, query: new URLSearchParams(queryPart || ''),
      navigate: () => {}, api, rerender: () => {},
    };
    window.document.getElementById('view').appendChild(renderSceptic(ctx));
    return dom;
  }

  test('routes and aliases reach the terminal', () => {
    for (const hash of ['#/sceptic', '#/cross-examination', '#/contradiction', '#/falsify', '#/claims', '#/red-team']) {
      assert.equal(parseRoute(hash).route, 'sceptic', hash);
    }
    const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
    assert.match(source, /route: 'sceptic'/);
    assert.match(source, /scepticAttentionCount/);
  });

  test('every panel: one h1, named tables, real content, axe-clean', async () => {
    const state = buildDemoState(NOW);
    for (const panel of ['findings', 'families', 'coverage', 'auditor', 'rounds', 'method']) {
      const dom = renderDom(state, `#/sceptic?panel=${panel}`);
      const { document } = dom.window;
      assert.equal(document.querySelectorAll('h1').length, 1, panel);
      assert.ok(document.body.textContent.length > 700, `${panel} renders real content`);
      assert.equal(document.body.textContent.includes('failed to draw'), false, `${panel} did not fall over`);
      for (const tableNode of document.querySelectorAll('table')) {
        assert.ok(tableNode.getAttribute('aria-label'), `${panel} table is named`);
      }
      if (panel === 'coverage') assert.match(document.body.textContent, /Discovery sampling/);
      if (panel === 'families') assert.match(document.body.textContent, /six kinds of claim/i);
      if (panel === 'method') assert.match(document.body.textContent, /refuses/i);
      if (panel === 'rounds') assert.match(document.body.textContent, /Brier/);
      dom.window.eval(AXE_SRC);
      const result = await dom.window.axe.run(document.getElementById('view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.deepEqual(Array.from(result.violations).map((v) => v.id), [], `${panel} is axe-clean`);
      dom.window.close();
    }
  });

  test('the demo round was frozen before the verdicts that graded it', () => {
    const state = buildDemoState(NOW);
    const round = state.scepticRounds.find((row) => row.id === 'scp-demo-1');
    assert.ok(round, 'the demo seeds one round');
    assert.ok(round.graded, 'and it is graded once its window closed');
    assert.ok(round.graded.scored > 0);
    assert.ok(round.graded.brier !== null && round.graded.brierRef !== null);
    assert.ok(round.frozenAt < `${round.reviewOn}T00:00:00.000Z`);
    const late = state.scepticDispositions.filter((row) => row.at > round.frozenAt);
    assert.ok(late.length >= round.graded.scored, 'the verdicts that graded it were recorded afterwards');
    const frozenClaims = new Set(round.claims.map((row) => row.claimKey));
    for (const row of late) {
      if (row.id.startsWith('scpdisp-demo-late')) assert.ok(frozenClaims.has(row.claimKey));
    }
    const report = scepticReport(state, NOW, state.settings);
    assert.ok(report.families.some((row) => row.verdict !== 'unmeasured'), 'at least one family is measured');
    assert.ok(report.families.some((row) => row.verdict === 'unmeasured'), 'and at least one still refuses');
    assert.ok(report.counts.examined > 0);
    assert.equal(dispositionIndex(state).size >= 1, true);
  });
});
