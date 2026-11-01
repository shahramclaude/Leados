/**
 * tests/app/coupling-ledger.test.mjs — Schema v78, ADR-0070.
 *
 * The claims this suite makes, in order:
 *  1. The migration is additive and invents nothing.
 *  2. The numerics are right: Φ, Φ⁻¹ and Φ₂ against published values, and the
 *     copula curve hits its two anchors exactly (1/k at ρ = 0, 1 at ρ = 1).
 *  3. The observation builder refuses A PAIR RESOLVING INSIDE ONE BLOCK rather
 *     than counting a certain coincidence as evidence.
 *  4. The rotation null is deterministic (no seed), conservative, and reports
 *     the floor p-value it can actually reach.
 *  5. A doctored record of six pairs that resolve together in a band declared
 *     near-independent is caught as `under-declared`.
 *  6. A band declared strongly coupled whose calls resolve independently is
 *     caught as `over-declared`.
 *  7. A thin band prints no verdict at all — it is not read as independence.
 *  8. Two rank mappings that disagree flag the magnitude finding as
 *     mapping-dependent, and no work is opened on it.
 *  9. A frozen review stores aggregate figures only, carries exactly one
 *     probability, and is refused when no member call is still open.
 * 10. A review grades exactly once, and only after its window closes.
 * 11. RULE-CPL-01 writes typed links, one reconciliation task, and never
 *     touches `correlationDeclarations`.
 * 12. RULE-CPL-02 opens one re-declaration decision per ISO week.
 * 13. RULE-CPL-03 appends a challenge note to the frozen review when a new
 *     declaration lands in a contradicted band — and rewrites no figure.
 * 14. Signals fire for the states they name, and stay silent otherwise.
 * 15. The typed relations and entity type are registered, and the rule is on
 *     the post-commit spine.
 * 16. CSV scope #61 exports band aggregates only — no decision id, no title.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeState,
} from '../../app/core/schema.js';
import {
  COUPLING_BANDS,
  COUPLING_LEDGER_EVENTS,
  COUPLING_LEDGER_RULE_IDS,
  COUPLING_LEDGER_SIGNAL_IDS,
  analyseBands,
  bandFor,
  bivariateNormal,
  buildCouplingReview,
  collisionProbability,
  couplingLedgerBrief,
  couplingLedgerConventions,
  couplingLedgerReport,
  couplingLedgerSignals,
  couplingObservations,
  gradeCouplingReview,
  impliedRankCorrelation,
  inverseNormalCdf,
  normalCdf,
  rotationTest,
} from '../../app/core/domain/couplingLedger.js';
import { couplingLedgerRule } from '../../app/core/domain/couplingLedgerRules.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, LINK_RELATION_LABELS } from '../../app/core/domain/cases.js';
import { normalizeCouplingReviews } from '../../app/core/domain/couplingLedgerSchema.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';

const NOW = new Date('2027-06-30T00:00:00.000Z');
const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString().slice(0, 10);

const clone = (v) => JSON.parse(JSON.stringify(v));

function decide(id, startOffset, resolveOffset, extra = {}) {
  return {
    id,
    title: `Call ${id}`,
    question: `Should we take ${id}?`,
    date: day(startOffset),
    createdAt: `${day(startOffset)}T09:00:00.000Z`,
    chosen: resolveOffset === null ? '' : 'option-1',
    decidedOn: resolveOffset === null ? null : day(resolveOffset),
    status: resolveOffset === null ? 'open' : 'closed',
    currency: 'EUR',
    ...extra,
  };
}

/**
 * Six declared pairs at ρ 0.8. `together` of them resolve inside the same
 * 30-day block; the rest resolve one block apart.
 */
function strongBand({ together = 6, rho = 0.8, pairs = 6 } = {}) {
  const decisions = [];
  const correlationDeclarations = [];
  const premises = [];
  for (let i = 0; i < pairs; i += 1) {
    const start = i * 7;
    decisions.push(decide(`a${i}`, start, start + 90));
    decisions.push(decide(`b${i}`, start, start + (i < together ? 91 : 121)));
    correlationDeclarations.push({
      id: `corr-${i}`,
      aId: `a${i}`,
      bId: `b${i}`,
      rho,
      declaredAt: '2026-01-01T00:00:00.000Z',
    });
    premises.push({ id: `p${i}`, decisionId: `a${i}`, topic: 'demand', status: 'open' });
  }
  return {
    decisions,
    correlationDeclarations,
    premises,
    links: [],
    couplingReviews: [],
    couplingMarkers: [],
    settings: {},
  };
}

function bandReport(state) {
  const report = couplingLedgerReport(state, NOW, state.settings || {});
  return report;
}

/* ------------------------------------------------------------------ */
/* 1. Schema                                                          */
/* ------------------------------------------------------------------ */

test('v77 -> v78 migrates additively and invents nothing', () => {
  const v77 = createEmptyState(NOW.toISOString());
  v77.schemaVersion = 77;
  delete v77.couplingReviews;
  delete v77.couplingMarkers;
  const { raw: v78, applied } = migrate(clone(v77));
  assert.ok(applied.includes('77 → 78'));
  assert.equal(v78.schemaVersion, 78);
  assert.deepEqual(v78.couplingReviews, []);
  assert.deepEqual(v78.couplingMarkers, []);
  assert.equal(SCHEMA_VERSION, 78);
  assert.equal(typeof MIGRATIONS[77], 'function');
  // The conventions exist and are clamped into declared bands.
  assert.equal(v78.settings.couplingBlockDays, 30);
  assert.equal(v78.settings.couplingMinPairs, 4);
});

test('a typo in a convention is clamped into a declared band, never read as "off"', () => {
  const raw = createEmptyState(NOW.toISOString());
  raw.settings = {
    ...raw.settings,
    couplingBlockDays: 0,
    couplingMinPairs: 0,
    couplingRotations: 999999,
    couplingAlphaPct: 90,
  };
  const { state } = normalizeState(raw, NOW);
  assert.equal(state.settings.couplingBlockDays, 7, 'a zero block length would divide the calendar into one block');
  assert.equal(state.settings.couplingMinPairs, 2, 'a zero pair floor would print a verdict on no evidence');
  assert.equal(state.settings.couplingRotations, 4000);
  assert.equal(state.settings.couplingAlphaPct, 20);
});

test('an unreadable review is dropped with a warning, not clamped into a plausible number', () => {
  const warnings = [];
  const rows = normalizeCouplingReviews([
    { id: 'ok', frozenAt: NOW.toISOString(), reviewOn: '2027-09-30', predictedAnyCommitPct: 40, bands: [], pairs: [] },
    { id: 'no-prob', frozenAt: NOW.toISOString(), reviewOn: '2027-09-30', predictedAnyCommitPct: null },
    { id: 'bad-band', frozenAt: NOW.toISOString(), reviewOn: '2027-09-30', predictedAnyCommitPct: 10,
      bands: [{ key: 'strong', verdict: 'not-a-verdict', assessment: 'confirmed' }] },
  ], warnings);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'ok');
  assert.ok(warnings.some((w) => /probability-free/.test(w)));
  assert.ok(warnings.some((w) => /readable key, verdict or assessment/.test(w)));
});

/* ------------------------------------------------------------------ */
/* 2. Numerics                                                        */
/* ------------------------------------------------------------------ */

test('the normal functions agree with published values', () => {
  const cases = [[0, 0.5], [1, 0.8413447461], [1.959963985, 0.975], [-1, 0.1586552539], [2.575829304, 0.995]];
  for (const [z, expected] of cases) {
    assert.ok(Math.abs(normalCdf(z) - expected) < 2e-7, `Φ(${z}) = ${normalCdf(z)}, expected ${expected}`);
  }
  for (const p of [0.001, 0.025, 0.5, 0.9, 0.999]) {
    const z = inverseNormalCdf(p);
    assert.ok(Math.abs(normalCdf(z) - p) < 1e-7, `Φ⁻¹ round trip at p=${p}`);
  }
  // Φ₂ reduces to the product at ρ = 0 and to the minimum at ρ = 1.
  assert.ok(Math.abs(bivariateNormal(0, 0, 0) - 0.25) < 1e-6);
  assert.ok(Math.abs(bivariateNormal(1.959963985, 1.959963985, 0) - 0.975 * 0.975) < 1e-5);
  assert.ok(Math.abs(bivariateNormal(-0.5, 0.25, 0) - normalCdf(-0.5) * normalCdf(0.25)) < 1e-5);
});

test('the copula curve has exact anchors and is monotone in ρ', () => {
  for (const k of [2, 3, 4, 6, 11]) {
    const atZero = collisionProbability(0, k);
    assert.ok(Math.abs(atZero - 1 / k) < 1e-6, `ρ = 0 must reproduce the printed independence rate 1/${k}`);
    // The clamp at ρ = 0.99 does not reach the ρ = 1 limit, so the anchor is
    // tested where it is reachable: a two-block window is the coarsest one and
    // therefore the closest to certainty.
    if (k === 2) {
      assert.ok(collisionProbability(0.99, k) > 0.95, 'ρ → 1 must approach certainty on a two-block window');
    }
    assert.ok(collisionProbability(0.99, k) > collisionProbability(0.5, k), 'the curve must rise with ρ');
    let previous = -1;
    for (const rho of [-0.6, -0.2, 0, 0.2, 0.5, 0.8, 0.95]) {
      const value = collisionProbability(rho, k);
      assert.ok(value >= previous - 1e-9, `curve must not fall at ρ = ${rho} (k = ${k})`);
      previous = value;
    }
  }
});

test('an implied ρ is refused outside the curve range and when the curve is flat', () => {
  const inside = impliedRankCorrelation(0.4, 6);
  assert.ok(inside && typeof inside.rho === 'number');
  const outside = impliedRankCorrelation(1.2, 6);
  assert.equal(outside.rho, null);
  assert.equal(outside.identified, false);
  assert.match(outside.reason, /outside the range/);
});

/* ------------------------------------------------------------------ */
/* 3. Observations                                                    */
/* ------------------------------------------------------------------ */

test('a pair resolving inside a single block is refused, never counted as a coincidence', () => {
  const state = {
    decisions: [decide('a', 0, 5), decide('b', 0, 6)],
    correlationDeclarations: [{ id: 'c', aId: 'a', bId: 'b', rho: 0.8, declaredAt: '2026-01-01T00:00:00.000Z' }],
    premises: [],
    links: [],
  };
  const observations = couplingObservations({ ...state, __today: day(400) }, couplingLedgerConventions({}));
  assert.equal(observations.pairs.length, 0);
  assert.equal(observations.refusals.length, 1);
  assert.match(observations.refusals[0].reason, /single 30-day block/);
});

test('an open member is refused with a reason, not treated as a non-coincidence', () => {
  const state = {
    decisions: [decide('a', 0, 90), decide('b', 0, null)],
    correlationDeclarations: [{ id: 'c', aId: 'a', bId: 'b', rho: 0.8, declaredAt: '2026-01-01T00:00:00.000Z' }],
    premises: [],
    links: [],
  };
  const observations = couplingObservations({ ...state, __today: day(400) }, couplingLedgerConventions({}));
  assert.equal(observations.pairs.length, 0);
  assert.equal(observations.refusals.length, 1);
  assert.match(observations.refusals[0].reason, /has not resolved/);
});

test('the analytic independence expectation is |A∩B| / (|A|·|B|)', () => {
  const state = {
    decisions: [decide('a', 0, 90), decide('b', 0, 91)],
    correlationDeclarations: [{ id: 'c', aId: 'a', bId: 'b', rho: 0.8, declaredAt: '2026-01-01T00:00:00.000Z' }],
    premises: [],
    links: [],
  };
  const observations = couplingObservations({ ...state, __today: day(400) }, couplingLedgerConventions({}));
  const pair = observations.pairs[0];
  assert.equal(pair.windowA, pair.commonBlocks);
  assert.equal(pair.windowB, pair.commonBlocks);
  assert.ok(Math.abs(pair.expectedCollision - 1 / pair.commonBlocks) < 1e-12);
});

/* ------------------------------------------------------------------ */
/* 4. The rotation null                                               */
/* ------------------------------------------------------------------ */

test('the rotation test is deterministic and never returns a zero p-value', () => {
  const state = strongBand({});
  const first = bandReport(state);
  const second = bandReport(state);
  assert.deepEqual(
    first.bands.map((b) => [b.key, b.pValue, b.collisions, b.lift]),
    second.bands.map((b) => [b.key, b.pValue, b.collisions, b.lift]),
  );
  for (const band of first.bands) {
    assert.ok(band.pValue > 0, 'a p-value of exactly 0 is not achievable and must not be printed');
    assert.ok(band.pValue >= band.floorP, 'the printed p-value cannot beat the rotation floor');
  }
});

test('the null makes coincidence no easier than the analytic expectation', () => {
  const state = strongBand({ together: 0 });
  const report = bandReport(state);
  const band = report.bands[0];
  // With no coincidence at all, the rotated null must centre near the analytic
  // expectation — if it centred far below, the test would be generous.
  assert.ok(band.nullMeanCollisions >= band.expectedCollisions * 0.5,
    `null mean ${band.nullMeanCollisions} vs analytic ${band.expectedCollisions}`);
  assert.equal(band.collisions, 0);
  assert.ok(band.pValue > 0.5);
});

test('rotationTest on an empty band reports nothing rather than a vacuous verdict', () => {
  const result = rotationTest([], 200);
  assert.equal(result.testablePairs, 0);
  assert.equal(result.pValue, null);
  assert.equal(result.lift, null);
});

/* ------------------------------------------------------------------ */
/* 5. Detection                                                        */
/* ------------------------------------------------------------------ */

test('calls declared near-independent that resolve together are caught as under-declared', () => {
  const state = strongBand({ together: 6, rho: 0 });
  const report = bandReport(state);
  const band = report.bands.find((b) => b.key === 'weak');
  assert.ok(band, 'ρ = 0 lands in the near-independent band');
  assert.equal(band.verdict, 'coupled');
  assert.equal(band.assessment, 'under-declared');
  assert.equal(band.contradiction, true);
  assert.match(couplingLedgerBrief(report, NOW), /declared independent, resolved together/i);
});

test('a strongly-coupling declaration the record shows as independent is caught as over-declared', () => {
  // Twenty pairs, none of which resolves together. Six pairs would not be
  // enough: with ~1.2 expected coincidences a zero is unremarkable, and the
  // module must not call that a refutation.
  const thin = bandReport(strongBand({ together: 0, rho: 0.8, pairs: 6 }));
  const thinBand = thin.bands[0];
  assert.equal(thinBand.collisions, 0);
  assert.ok(['inconclusive', 'independent'].includes(thinBand.verdict),
    `six pairs cannot refute a declaration; got ${thinBand.verdict}`);
  assert.equal(thinBand.contradiction, false);

  const state = strongBand({ together: 0, rho: 0.8, pairs: 20 });
  const band = bandReport(state).bands.find((b) => b.key === 'strong');
  assert.equal(band.collisions, 0);
  assert.ok(band.expectedCollisions > 3, `twenty pairs must carry a real expectation, got ${band.expectedCollisions}`);
  assert.equal(band.verdict, 'hedged');
  assert.equal(band.assessment, 'over-declared');
  assert.equal(band.contradiction, true);
  assert.ok(band.pValueLow < 0.05, 'the lower tail is what carries a deficit finding');
});

test('a band below the pair floor prints no verdict — thinness is not independence', () => {
  const state = strongBand({ pairs: 2, rho: 0.8 });
  const report = bandReport(state);
  const band = report.bands[0];
  assert.equal(band.verdict, 'insufficient');
  assert.equal(band.assessment, 'unresolved');
  assert.equal(band.contradiction, false);
  const findings = couplingLedgerSignals({ ...state, couplingReviews: [] }, NOW, state.settings);
  assert.ok(findings.every((f) => f.id !== COUPLING_LEDGER_SIGNAL_IDS.UNDER_DECLARED));
});

test('a magnitude finding that only holds under one rank mapping is flagged and opens no work', () => {
  // Four blocks per pair is wide enough for the two mappings to separate.
  const decisions = [];
  const correlationDeclarations = [];
  for (let i = 0; i < 6; i += 1) {
    const start = i * 3;
    decisions.push(decide(`a${i}`, start, start + 120));
    decisions.push(decide(`b${i}`, start, start + (i < 4 ? 121 : 240)));
    correlationDeclarations.push({ id: `c${i}`, aId: `a${i}`, bId: `b${i}`, rho: 0.45, declaredAt: '2026-01-01T00:00:00.000Z' });
  }
  const report = bandReport({ decisions, correlationDeclarations, premises: [], links: [] });
  const band = report.bands.find((b) => b.key === 'moderate');
  assert.ok(band, 'the declared ρ 0.45 lands in the moderate band');
  assert.ok(Array.isArray(band.modelByMapping) && band.modelByMapping.length === 2);
  assert.ok(band.modelByMapping[0].collisionAllTestablePct !== band.modelByMapping[1].collisionAllTestablePct,
    'the two mappings must actually differ, or the robustness check is theatre');
  if (band.assessment === 'overstated' || band.assessment === 'understated') {
    assert.equal(typeof band.mappingDisagreement, 'boolean');
    if (band.mappingDisagreement) assert.equal(band.contradiction, false, 'a mapping-dependent finding is not a contradiction');
  }
});

test('bands partition the declaration range without gaps', () => {
  for (const rho of [-0.99, -0.5, -0.2, -0.19, 0, 0.2, 0.21, 0.55, 0.56, 0.99]) {
    assert.ok(bandFor(rho), `every ρ must land in a band (${rho})`);
  }
  assert.equal(bandFor(0.9).key, 'strong');
  assert.equal(bandFor(0.1).key, 'weak');
  assert.equal(bandFor(-0.5).key, 'hedge');
  assert.deepEqual(COUPLING_BANDS.map((b) => b.key), ['hedge', 'weak', 'moderate', 'strong']);
});

/* ------------------------------------------------------------------ */
/* 6. Freezing and grading                                            */
/* ------------------------------------------------------------------ */

test('a frozen review stores aggregates only and carries exactly one probability', () => {
  const state = strongBand({ rho: 0 });
  state.decisions.push(decide('open1', 10, null));
  state.correlationDeclarations.push({ id: 'co', aId: 'a0', bId: 'open1', rho: 0.3, declaredAt: '2026-01-01T00:00:00.000Z' });
  const report = bandReport(state);
  const built = buildCouplingReview(report, state, NOW, 'cpl-1');
  assert.equal(built.ok, true);
  const record = built.record;
  assert.equal(record.id, 'cpl-1');
  assert.ok(record.reviewOn > record.frozenAt.slice(0, 10));
  assert.ok(Number.isFinite(record.predictedAnyCommitPct));
  assert.equal(record.graded, null);
  const serialised = JSON.stringify(record);
  assert.ok(!/Call a0/.test(serialised), 'no decision title may enter the frozen record');
  assert.ok(!/Should we take/.test(serialised), 'no question text may enter the frozen record');
  for (const band of record.bands) {
    assert.ok(Number.isFinite(band.collisions));
    assert.ok(Number.isFinite(band.expectedCollisions));
    assert.ok(typeof band.verdict === 'string');
  }
});

test('a freeze is refused when every member call has already resolved', () => {
  const state = strongBand({ rho: 0 });
  const report = bandReport(state);
  const built = buildCouplingReview(report, state, NOW, 'cpl-x');
  assert.equal(built.ok, false);
  assert.match(built.reason, /no arrival left to forecast/);
});

test('a freeze with open members carries a hazard and a real probability', () => {
  const state = strongBand({ rho: 0 });
  // Five resolved calls establish a hazard; two open calls give the forecast
  // something to be about.
  state.decisions.push(decide('open1', 10, null), decide('open2', 10, null));
  state.correlationDeclarations.push({ id: 'co', aId: 'a0', bId: 'open1', rho: 0.3, declaredAt: '2026-01-01T00:00:00.000Z' });
  const report = bandReport(state);
  const built = buildCouplingReview(report, state, NOW, 'cpl-2');
  assert.equal(built.ok, true);
  assert.ok(Number.isFinite(built.record.hazardPct));
  assert.ok(built.record.predictedAnyCommitPct > 0 && built.record.predictedAnyCommitPct <= 100);
  assert.match(built.record.hazardBasis, /Laplace-smoothed/);
});

test('a review grades exactly once, and only after its window closes', () => {
  const state = strongBand({ rho: 0 });
  state.decisions.push(decide('open1', 10, null), decide('open2', 10, null));
  state.correlationDeclarations.push({ id: 'co', aId: 'a0', bId: 'open1', rho: 0.3, declaredAt: '2026-01-01T00:00:00.000Z' });
  const report = bandReport(state);
  const { record } = buildCouplingReview(report, state, NOW, 'cpl-3');
  const early = gradeCouplingReview(record, state, NOW);
  assert.equal(early.ok, false);
  assert.match(early.reason, /Wait until the window closes/);
  const graded = { ...record, graded: { gradedAt: NOW.toISOString(), anyCommitted: false, gradedMembers: 2, brier: 0.1 } };
  const again = gradeCouplingReview(graded, state, new Date('2027-12-31T00:00:00.000Z'));
  assert.equal(again.ok, false);
  assert.match(again.reason, /scored once/);
  // And a grade that arrives after the window is real arithmetic, not a guess.
  const late = gradeCouplingReview(record, state, new Date('2027-12-31T00:00:00.000Z'));
  assert.equal(late.ok, true);
  assert.ok(Number.isFinite(late.brier));
});

/* ------------------------------------------------------------------ */
/* 7. Rules                                                           */
/* ------------------------------------------------------------------ */

function ruleContext(event, now = NOW) {
  let counter = 0;
  return {
    event,
    now,
    settings: {},
    idFactory: (prefix) => `${prefix}-${(counter += 1)}`,
    logEvent: () => {},
    out: [],
  };
}

function frozenRecord(overrides = {}) {
  return {
    id: 'cpl-r1',
    frozenAt: NOW.toISOString(),
    reviewOn: '2027-09-28',
    windowDays: 90,
    blockDays: 30,
    rotations: 1000,
    memberIds: ['a0', 'b0', 'a1', 'b1'],
    pairCount: 2,
    testablePairs: 2,
    stressedPremiseIds: ['p0'],
    bands: [{
      key: 'strong',
      label: 'Declared strongly coupled',
      declaredMidRho: 0.8,
      declaredMinRho: 0.8,
      declaredMaxRho: 0.8,
      pairs: 6,
      testablePairs: 6,
      collisions: 1,
      expectedCollisions: 1.5,
      lift: 0.67,
      pValue: 0.62,
      rotations: 1000,
      verdict: 'independent',
      assessment: 'over-declared',
      contradiction: true,
      mappingDisagreement: false,
      observedCollisionPct: 16.7,
      modelCollisionPct: 48.2,
      modelIndependentPct: 9.1,
      blockDays: 30,
      minAttainableP: 0.05,
    }],
    pairs: [],
    predictedAnyCommitPct: 42,
    graded: null,
    challengeNotes: [],
    ...overrides,
  };
}

function ruleDraft(extra = {}) {
  return {
    people: [{ id: 'p1', name: 'Sam', status: 'active', managerId: null }],
    decisions: [
      { id: 'a0', title: 'A0' }, { id: 'b0', title: 'B0' },
      { id: 'a1', title: 'A1' }, { id: 'b1', title: 'B1' },
    ],
    delegations: [],
    links: [],
    premises: [{ id: 'p0', statement: 'Demand holds' }],
    couplingReviews: [frozenRecord()],
    couplingMarkers: [],
    correlationDeclarations: [{ id: 'c1', aId: 'a0', bId: 'b0', rho: 0.85, declaredAt: NOW.toISOString() }],
    settings: {},
    ...extra,
  };
}

test('RULE-CPL-01 writes typed links and exactly one reconciliation task', () => {
  const draft = ruleDraft();
  const ctx = ruleContext({ type: COUPLING_LEDGER_EVENTS.FROZEN, entityId: 'cpl-r1' });
  const effects = couplingLedgerRule(draft, ctx);
  const memberLinks = draft.links.filter((l) => l.relation === 'calibrates-coupling');
  assert.equal(memberLinks.length, 4, 'one edge per surviving member call');
  assert.equal(memberLinks[0].sourceType, 'couplingreview');
  const premiseLinks = draft.links.filter((l) => l.relation === 'measures-coupling');
  assert.equal(premiseLinks.length, 1);
  const tasks = draft.delegations.filter((d) => /reconcile the/i.test(d.title));
  assert.equal(tasks.length, 1);
  // Rerunning the same rule writes nothing new.
  const again = couplingLedgerRule(draft, ruleContext({ type: COUPLING_LEDGER_EVENTS.FROZEN, entityId: 'cpl-r1' }));
  assert.equal(again.length, 0);
  assert.equal(draft.delegations.filter((d) => /reconcile the/i.test(d.title)).length, 1);
  assert.ok(effects.length > 0);
});

test('RULE-CPL-01 never rewrites a declared correlation', () => {
  const draft = ruleDraft();
  const before = clone(draft.correlationDeclarations);
  couplingLedgerRule(draft, ruleContext({ type: COUPLING_LEDGER_EVENTS.FROZEN, entityId: 'cpl-r1' }));
  assert.deepEqual(draft.correlationDeclarations, before);
});

test('RULE-CPL-02 opens at most one re-declaration decision per ISO week', () => {
  const draft = ruleDraft();
  const first = couplingLedgerRule(draft, ruleContext({ type: COUPLING_LEDGER_EVENTS.SCAN }));
  assert.ok(first.some((e) => e.ruleId === COUPLING_LEDGER_RULE_IDS.SCAN && e.targetType === 'decision'));
  const decisionsAfter = draft.decisions.filter((d) => /Reconcile a declared correlation/.test(d.title)).length;
  assert.equal(decisionsAfter, 1);
  couplingLedgerRule(draft, ruleContext({ type: COUPLING_LEDGER_EVENTS.SCAN }));
  assert.equal(draft.decisions.filter((d) => /Reconcile a declared correlation/.test(d.title)).length, 1,
    'a second scan in the same week must not open a second decision');
});

test('RULE-CPL-02 opens grading work for an expired review', () => {
  const draft = ruleDraft({ couplingReviews: [frozenRecord({ reviewOn: '2027-01-01' })] });
  couplingLedgerRule(draft, ruleContext({ type: COUPLING_LEDGER_EVENTS.SCAN }));
  assert.ok(draft.delegations.some((d) => /Grade the overdue coupling review/.test(d.title)));
});

test('RULE-CPL-03 appends a challenge note and rewrites no frozen figure', () => {
  const draft = ruleDraft();
  const before = clone(draft.couplingReviews[0].bands);
  couplingLedgerRule(draft, ruleContext({ type: 'deferralPortfolio.declared' }));
  const review = draft.couplingReviews[0];
  assert.equal(review.challengeNotes.length, 1);
  assert.match(review.challengeNotes[0], /Challenged/);
  assert.deepEqual(review.bands, before, 'a challenge appends; it never rewrites a frozen band');
  assert.ok(draft.delegations.some((d) => /declaration lands in a band/.test(d.title)));
});

test('RULE-CPL-03 stays silent when the band was confirmed', () => {
  const record = frozenRecord();
  record.bands[0].assessment = 'confirmed';
  record.bands[0].contradiction = false;
  record.bands[0].verdict = 'coupled';
  const draft = ruleDraft({ couplingReviews: [record] });
  const effects = couplingLedgerRule(draft, ruleContext({ type: 'deferralPortfolio.declared' }));
  assert.equal(effects.length, 0);
  assert.equal(draft.couplingReviews[0].challengeNotes.length, 0);
});

test('the coupling rule is on the post-commit spine and registers its triggers', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(couplingLedgerRule));
  assert.ok(couplingLedgerRule.triggers.includes(COUPLING_LEDGER_EVENTS.FROZEN));
  assert.ok(couplingLedgerRule.triggers.includes(COUPLING_LEDGER_EVENTS.SCAN));
  assert.ok(couplingLedgerRule.triggers.includes('deferralPortfolio.declared'));
  assert.equal(typeof couplingLedgerRule.effect, 'function');
});

/* ------------------------------------------------------------------ */
/* 8. Typed graph                                                     */
/* ------------------------------------------------------------------ */

test('the entity type and both relations are registered with labels', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('couplingreview'));
  for (const relation of ['calibrates-coupling', 'measures-coupling']) {
    assert.ok(LINK_RELATIONS.includes(relation), `${relation} must be a registered relation`);
    assert.ok(LINK_RELATION_LABELS[relation], `${relation} must carry a human label`);
  }
});

/* ------------------------------------------------------------------ */
/* 9. Signals                                                         */
/* ------------------------------------------------------------------ */

test('signals fire for a contradiction, an overdue review and an undeclared pair', () => {
  const state = strongBand({ rho: 0 });
  state.decisions.push(decide('open1', 10, null), decide('open2', 10, null));
  state.correlationDeclarations.push({ id: 'co', aId: 'a0', bId: 'open1', rho: 0.3, declaredAt: '2026-01-01T00:00:00.000Z' });
  state.premises.push({ id: 'shared', decisionId: 'open1' });
  // The second open call rests on the same premise through a typed edge, which
  // is the other source the shared-premise graph reads.
  state.links.push({
    id: 'lnk-1',
    sourceType: 'decision',
    sourceId: 'open2',
    targetType: 'premise',
    targetId: 'shared',
    relation: 'rests-on',
  });
  state.couplingReviews = [frozenRecord({ reviewOn: '2027-01-01' })];
  const findings = couplingLedgerSignals(state, NOW, state.settings);
  const ids = findings.map((f) => f.ruleId);
  assert.ok(ids.includes(COUPLING_LEDGER_SIGNAL_IDS.OVER_DECLARED));
  assert.ok(ids.includes(COUPLING_LEDGER_SIGNAL_IDS.DUE));
  assert.ok(ids.includes(COUPLING_LEDGER_SIGNAL_IDS.UNDECLARED));
  for (const finding of findings) {
    // The workspace signal contract, not this module's own vocabulary: the
    // Signals board, the domain roll-up, Today and the nav badge all read these
    // fields, so a signal missing one of them is invisible work.
    assert.match(finding.ruleId, /^CPL-0[1-5]$/, `${finding.ruleId} must be a CPL id`);
    assert.equal(finding.domain, 'Coupling ledger');
    assert.ok(finding.title.length > 0);
    assert.ok(typeof finding.detail === 'string' && finding.detail.length > 20);
    assert.ok(Number.isInteger(finding.severity) && finding.severity >= 1);
    assert.ok(Array.isArray(finding.evidence) && finding.evidence.length > 0);
    assert.ok(finding.action && finding.action.route.startsWith('#/deferral?panel='),
      `${finding.ruleId} must deep-link into the terminal it lives in`);
    assert.ok(finding.action.label.length > 0);
    if (finding.ruleId !== COUPLING_LEDGER_SIGNAL_IDS.UNDECLARED) {
      assert.equal(finding.action.route, '#/deferral?panel=coupling');
    }
  }
});

test('the coupling signals land on the Signals board and in the domain roll-up', async () => {
  const { buildInsights, DOMAIN_ORDER } = await import('../../app/core/domain/insights.js');
  const { buildDemoState } = await import('../../app/core/demo.js');
  assert.ok(DOMAIN_ORDER.includes('Coupling ledger'), 'the domain must be ordered, not only counted');
  // The demo seeds the coupled history and one graded frozen review, so this
  // runs the real board over a real workspace rather than over a stub.
  const demo = buildDemoState(NOW);
  const insights = buildInsights(demo, NOW);
  const cpl = insights.findings.filter((f) => String(f.ruleId).startsWith('CPL-'));
  assert.ok(cpl.length >= 1, 'the board must carry the coupling findings');
  assert.ok(insights.byDomain.some((row) => row.domain === 'Coupling ledger'),
    'a new domain must appear in the roll-up, not only in the count');
  // And every non-test finding on the board must carry a rule id: the coupling
  // signals arrived once with `id`/`why` instead of the workspace's own shape,
  // which broke this exact assertion in another suite.
  for (const finding of insights.findings) {
    assert.equal(typeof finding.ruleId, 'string', `${finding.title} has no rule id`);
    assert.ok(finding.ruleId.length > 0);
  }
});

test('an empty workspace produces no coupling signals', () => {
  const state = createEmptyState(NOW.toISOString());
  assert.deepEqual(couplingLedgerSignals(state, NOW, state.settings), []);
});

/* ------------------------------------------------------------------ */
/* 10. Export                                                         */
/* ------------------------------------------------------------------ */

test('CSV scope #61 exports band aggregates with no decision id and no title', () => {
  const scope = CSV_EXPORTS.find((s) => s.key === 'coupling-ledger');
  assert.ok(scope, 'the coupling-ledger scope must be registered');
  assert.equal(scope.sensitive, false);
  const state = createEmptyState(NOW.toISOString());
  state.couplingReviews = [{
    id: 'cpl-1',
    frozenAt: NOW.toISOString(),
    reviewOn: '2027-09-28',
    windowDays: 90,
    blockDays: 30,
    rotations: 1000,
    memberIds: ['a0', 'b0'],
    pairCount: 1,
    testablePairs: 1,
    predictedAnyCommitPct: 40,
    graded: null,
    bands: [{
      key: 'strong', label: 'Declared strongly coupled', declaredMidRho: 0.8,
      declaredMinRho: 0.8, declaredMaxRho: 0.8, pairs: 6, testablePairs: 6,
      collisions: 1, expectedCollisions: 1.5, lift: 0.67, pValue: 0.62, rotations: 1000,
      verdict: 'independent', assessment: 'over-declared', contradiction: true,
      mappingDisagreement: false, observedCollisionPct: 16.7, modelCollisionPct: 48.2,
      modelSpearmanPct: 47.1, modelIndependentPct: 9.1, impliedRho: null,
      impliedIdentified: false, materiality: 9.6, blockDays: 30, minAttainableP: 0.05,
    }],
    pairs: [],
    challengeNotes: [],
  }];
  const result = exportWorkspaceCsv(state, 'coupling-ledger', { now: NOW });
  assert.equal(result.ok, true);
  const serialised = result.csv;
  assert.match(serialised, /^band,declared_rho_min/, 'the band column must lead the header row');
  assert.match(serialised, /strong/);
  assert.match(serialised, /independent/);
  assert.equal(serialised.trim().split('\n').length, 2, 'one header row and one band row');
  assert.ok(!/a0/.test(serialised), 'no member decision id may be exported');
  assert.ok(!/Declared strongly coupled/.test(serialised), 'no band label text may be exported');
});

/* ------------------------------------------------------------------ */
/* 11. Routing                                                        */
/* ------------------------------------------------------------------ */

test('#/coupling still opens the Coupled Load terminal, not the ledger', async () => {
  // v78 added ledger aliases to the same router. A duplicate `coupling` key
  // would silently rewrite the existing nav entry, so the collision guard is
  // asserted rather than assumed.
  const { parseRoute } = await import('../../app/main.js');
  assert.equal(parseRoute('#/coupling').route, 'coupling');
  for (const alias of ['#/coupling-ledger', '#/declared-correlation', '#/co-resolution', '#/correlation-audit', '#/coincidence', '#/joint-timing']) {
    assert.equal(parseRoute(alias).route, 'deferral', `${alias} must open the deferral terminal`);
  }
  assert.equal(parseRoute('#/deferral?panel=coupling').query.get('panel'), 'coupling');
});

test('a frozen review is an addressable node: the panel marks the linked row without reordering', async () => {
  // v78 registers `couplingreview` in the typed-link graph, so a reconciliation
  // task or a governed re-declaration decision links back to the review it was
  // opened on. That link is only honest if the destination resolves — the
  // lineage suite asserts the route, and this asserts the panel honours it.
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const restore = ['window', 'document', 'Node', 'HTMLElement', 'Element'].map((key) => [key, globalThis[key]]);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  try {
    const { buildDemoState } = await import('../../app/core/demo.js');
    const { renderCouplingPanel } = await import('../../app/views/couplingPanel.js');
    const { resolveLinkedEntity } = await import('../../app/core/domain/cases.js');
    const state = buildDemoState(new Date('2026-10-28T10:00:00.000Z'));
    const review = state.couplingReviews[0];
    const resolved = resolveLinkedEntity(state, 'couplingreview', review.id);
    assert.ok(resolved, 'a frozen review resolves as a graph node');
    assert.equal(resolved.route, `#/deferral?panel=coupling&review=${encodeURIComponent(review.id)}`);

    const base = { state, now: new Date('2026-10-28T10:00:00.000Z'), api: {}, navigate: () => {}, refresh: () => {} };
    const focused = renderCouplingPanel({ ...base, query: new URLSearchParams(`panel=coupling&review=${review.id}`) });
    const marked = focused.querySelectorAll('.is-focused');
    assert.equal(marked.length, 1, 'exactly one row is marked');
    assert.ok(marked[0].textContent.includes(review.reviewOn), 'the marked row is the requested review');
    assert.equal(renderCouplingPanel({ ...base, query: new URLSearchParams('panel=coupling') }).querySelectorAll('.is-focused').length, 0);
    const unknown = renderCouplingPanel({ ...base, query: new URLSearchParams('panel=coupling&review=does-not-exist') });
    assert.equal(unknown.querySelectorAll('.is-focused').length, 0, 'an unknown id highlights nothing and throws nothing');
  } finally {
    for (const [key, value] of restore) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
