import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, SCHEMA_VERSION, MIGRATIONS } from '../../app/core/schema.js';
import {
  buildDecisionPortfolioReport,
  decisionCoupling,
  decisionDependencies,
  simulateDeferral,
  portfolioBoardBrief,
  decisionPortfolioAttention,
  PORTFOLIO_MIN_DECISIONS,
  PORTFOLIO_SIGNALS,
} from '../../app/core/domain/decisionPortfolio.js';

function isoDay(daysAgo = 0) {
  const d = new Date('2026-10-30T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const NOW = new Date('2026-10-30T12:00:00Z');

function addDecision(state, { id, title, date, approver, driver, chosen } = {}) {
  state.decisions.push({
    id: id || `dec-${state.decisions.length + 1}`,
    title: title || `Decision ${state.decisions.length + 1}`,
    date: date || isoDay(10),
    reversibility: 'reversible',
    driver: driver || 'Driver',
    approver: approver || 'Boss',
    contributors: '',
    informed: '',
    options: [],
    chosen: chosen || '',
    rationale: '',
    reviewOn: null,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: NOW.toISOString(),
    portfolioNotes: [],
  });
}

function addLink(state, { sourceType, sourceId, targetType, targetId, relation }) {
  state.links.push({
    id: `lnk-${state.links.length + 1}`,
    sourceType, sourceId, targetType, targetId, relation,
    ruleId: null, summary: '', createdOn: isoDay(0), createdAt: NOW.toISOString(),
  });
}

function addPremise(state, id) {
  state.premises.push({
    id,
    title: `Premise ${id}`,
    status: 'active',
    direction: 'upside',
    criticality: 'load-bearing',
    owner: 'Owner',
    priorPct: 60,
    watchThresholdPct: 40,
    breachThresholdPct: 20,
    reviewCycleDays: 30,
    lastReviewedOn: null,
    reaffirmedOn: null,
    createdAt: NOW.toISOString(),
  });
}

function addTempoSchedule(state, { decisionId, currency, valueAtStake, delayProfile, edge, uncertainty }) {
  state.tempoSchedules.push({
    id: `ts-${state.tempoSchedules.length + 1}`,
    decisionId,
    status: 'armed',
    currency: currency || 'USD',
    valueAtStake: valueAtStake || 10000,
    delayProfile: delayProfile || 'linear',
    edge: edge || 0.6,
    uncertainty: uncertainty || 0.3,
    halfLifeDays: 14,
    decidedByDate: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
}

/* ------------------------------------------------------------------ */

describe('Decision Portfolio Engine — Schema v55', () => {
  it('schema version is 55', () => {
    assert.equal(SCHEMA_VERSION, 77);
  });

  it('v54 → v55 migration is additive and initializes portfolioMarkers', () => {
    const v54 = { schemaVersion: 54, decisions: [], links: [] };
    const step = MIGRATIONS[54];
    assert.ok(step, 'Migration 54 → 55 exists');
    const v55 = step(v54);
    assert.equal(v55.schemaVersion, 55);
    assert.ok(Array.isArray(v55.portfolioMarkers), 'portfolioMarkers initialized as array');
    assert.equal(v55.portfolioMarkers.length, 0);
    // Existing data preserved.
    assert.ok(Array.isArray(v55.decisions));
    assert.ok(Array.isArray(v55.links));
  });

  it('empty state includes portfolioMarkers collection', () => {
    const state = createEmptyState();
    assert.ok(Array.isArray(state.portfolioMarkers));
    assert.equal(state.portfolioMarkers.length, 0);
  });

  it('report returns empty for fewer than MIN_DECISIONS open decisions', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    const report = buildDecisionPortfolioReport(state, NOW);
    assert.equal(report.totals.open, 1);
    assert.equal(report.sequencing.optimal.length, 0);
    assert.equal(report.signals.length, 0);
  });

  it('report enumerates open decisions and counts priced vs unpriced', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', title: 'Hire engineer' });
    addDecision(state, { id: 'd2', title: 'Choose vendor' });
    addDecision(state, { id: 'd3', title: 'Set budget', chosen: 'Option A' }); // decided
    const report = buildDecisionPortfolioReport(state, NOW);
    assert.equal(report.totals.open, 2);
    assert.equal(report.totals.priced, 0);
    assert.equal(report.totals.unpriced, 2);
  });

  it('coupling detects shared premises between decisions', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    addDecision(state, { id: 'd2' });
    addPremise(state, 'p1');
    addLink(state, { sourceType: 'decision', sourceId: 'd1', targetType: 'premise', targetId: 'p1', relation: 'rests-on' });
    addLink(state, { sourceType: 'decision', sourceId: 'd2', targetType: 'premise', targetId: 'p1', relation: 'rests-on' });
    const open = state.decisions.filter((d) => !d.chosen);
    const { coupling, clusters } = decisionCoupling(state, open);
    assert.equal(coupling.get('d1').size, 1, 'd1 coupled to d2');
    assert.equal(coupling.get('d2').size, 1, 'd2 coupled to d1');
    // Both should be in the same cluster.
    const nonSingleton = clusters.filter((c) => c.length > 1);
    assert.equal(nonSingleton.length, 1);
    assert.equal(nonSingleton[0].length, 2);
  });

  it('coupling detects shared approver', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', approver: 'Alice' });
    addDecision(state, { id: 'd2', approver: 'Alice' });
    addDecision(state, { id: 'd3', approver: 'Bob' });
    const open = state.decisions.filter((d) => !d.chosen);
    const { coupling } = decisionCoupling(state, open);
    assert.equal(coupling.get('d1').size, 1, 'd1 coupled to d2 via approver');
    assert.ok(coupling.get('d1').get('d2')?.sharedApprover);
  });

  it('coupling detects shared typed-link resources', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    addDecision(state, { id: 'd2' });
    state.cases.push({ id: 'c1', title: 'Case 1', status: 'open' });
    addLink(state, { sourceType: 'decision', sourceId: 'd1', targetType: 'case', targetId: 'c1', relation: 'decides' });
    addLink(state, { sourceType: 'decision', sourceId: 'd2', targetType: 'case', targetId: 'c1', relation: 'decides' });
    const open = state.decisions.filter((d) => !d.chosen);
    const { coupling } = decisionCoupling(state, open);
    assert.equal(coupling.get('d1').size, 1);
    const pair = coupling.get('d1').get('d2');
    assert.ok(pair.sharedResources.length > 0);
    assert.equal(pair.sharedResources[0].type, 'case');
  });

  it('dependency DAG builds from shared premises', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', date: isoDay(20) });
    addDecision(state, { id: 'd2', date: isoDay(10) });
    addPremise(state, 'p1');
    addLink(state, { sourceType: 'decision', sourceId: 'd1', targetType: 'premise', targetId: 'p1', relation: 'rests-on' });
    addLink(state, { sourceType: 'decision', sourceId: 'd2', targetType: 'premise', targetId: 'p1', relation: 'rests-on' });
    const open = state.decisions.filter((d) => !d.chosen);
    const tempoById = new Map();
    const { edges, topologicalLayers } = decisionDependencies(state, open, tempoById);
    // Without tempo data, d1 should be the predecessor (earlier date).
    assert.equal(topologicalLayers.length >= 1, true, 'At least one layer');
    // d1 should be in an earlier or same layer as d2.
    const layerOf = new Map();
    topologicalLayers.forEach((layer, idx) => layer.forEach((id) => layerOf.set(id, idx)));
    assert.ok(layerOf.get('d1') <= layerOf.get('d2'), 'd1 precedes or equals d2 in layers');
  });

  it('bottleneck analysis identifies the most-loaded approver', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', approver: 'Alice' });
    addDecision(state, { id: 'd2', approver: 'Alice' });
    addDecision(state, { id: 'd3', approver: 'Alice' });
    addDecision(state, { id: 'd4', approver: 'Bob' });
    const report = buildDecisionPortfolioReport(state, NOW);
    assert.equal(report.bottlenecks.maxApproverLoad, 3);
    assert.equal(report.bottlenecks.approvers[0].name, 'alice');
    assert.ok(report.bottlenecks.approverHHI > 0.5, 'HHI should be high when one approver dominates');
  });

  it('decision load index produces a band', () => {
    const state = createEmptyState();
    for (let i = 0; i < 10; i++) addDecision(state, { id: `d${i}` });
    const report = buildDecisionPortfolioReport(state, NOW);
    assert.ok(report.loadIndex, 'loadIndex present');
    assert.ok(report.loadIndex.value >= 0 && report.loadIndex.value <= 1);
    assert.ok(['light', 'moderate', 'elevated', 'heavy', 'critical'].includes(report.loadIndex.band.id));
    assert.equal(Object.keys(report.loadIndex.components).length, 5);
  });

  it('signals include BOTTLENECK_APPROVER at severity >= 3 when approver has 3+ decisions', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', approver: 'Alice' });
    addDecision(state, { id: 'd2', approver: 'Alice' });
    addDecision(state, { id: 'd3', approver: 'Alice' });
    const report = buildDecisionPortfolioReport(state, NOW);
    const bottleneck = report.signals.find((s) => s.id === PORTFOLIO_SIGNALS.BOTTLENECK_APPROVER);
    assert.ok(bottleneck, 'bottleneck signal present');
    assert.ok(bottleneck.severity >= 3);
  });

  it('signals include UNPRICED_BLOCK when 3+ decisions are unpriced', () => {
    const state = createEmptyState();
    for (let i = 0; i < 5; i++) addDecision(state, { id: `d${i}` });
    const report = buildDecisionPortfolioReport(state, NOW);
    const unpriced = report.signals.find((s) => s.id === PORTFOLIO_SIGNALS.UNPRICED_BLOCK);
    assert.ok(unpriced, 'unpriced block signal present');
  });

  it('deferral simulation returns additional cost for priced decisions', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    addDecision(state, { id: 'd2' });
    // Without tempo data, deferral returns null cost.
    const report = buildDecisionPortfolioReport(state, NOW);
    const sim = simulateDeferral(report, ['d1'], 2);
    assert.equal(sim.weeks, 2);
    // Unpriced — additional cost should be null.
    assert.equal(sim.deferredDecisions[0].additionalCost, null);
  });

  it('board brief is a non-empty string for eligible portfolios', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    addDecision(state, { id: 'd2' });
    addDecision(state, { id: 'd3' });
    const report = buildDecisionPortfolioReport(state, NOW);
    const brief = portfolioBoardBrief(report);
    assert.ok(typeof brief === 'string');
    assert.ok(brief.length > 0);
    assert.ok(brief.includes('Decision Portfolio'));
  });

  it('board brief says "requires at least" for small portfolios', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    const report = buildDecisionPortfolioReport(state, NOW);
    const brief = portfolioBoardBrief(report);
    assert.ok(brief.includes('requires at least'));
  });

  it('attention count returns 0 for small portfolios', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    assert.equal(decisionPortfolioAttention(state, NOW), 0);
  });

  it('attention count returns signal count at severity >= 3 for larger portfolios', () => {
    const state = createEmptyState();
    // Create enough decisions with one bottleneck approver to trigger signals.
    for (let i = 0; i < 5; i++) addDecision(state, { id: `d${i}`, approver: 'Alice' });
    const count = decisionPortfolioAttention(state, NOW);
    assert.ok(count >= 1, `Expected at least 1 attention signal, got ${count}`);
  });

  it('sequencing produces an ordered list for all open decisions', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', date: isoDay(30) });
    addDecision(state, { id: 'd2', date: isoDay(20) });
    addDecision(state, { id: 'd3', date: isoDay(10) });
    const report = buildDecisionPortfolioReport(state, NOW);
    assert.equal(report.sequencing.optimal.length, 3);
    // Every decision should have a unique position.
    const positions = report.sequencing.optimal.map((e) => e.position);
    assert.deepEqual(positions, [1, 2, 3]);
  });

  it('sequencing regret is non-negative', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1' });
    addDecision(state, { id: 'd2' });
    addDecision(state, { id: 'd3' });
    const report = buildDecisionPortfolioReport(state, NOW);
    assert.ok(report.sequencing.regret >= 0);
  });

  it('clusters include all decisions (singletons and non-singletons)', () => {
    const state = createEmptyState();
    addDecision(state, { id: 'd1', approver: 'Alice' });
    addDecision(state, { id: 'd2', approver: 'Alice' });
    addDecision(state, { id: 'd3', approver: 'Bob' }); // singleton
    const report = buildDecisionPortfolioReport(state, NOW);
    const allIds = new Set(report.coupling.clusters.flatMap((c) => c.decisionIds));
    assert.equal(allIds.size, 3);
    const singletons = report.coupling.clusters.filter((c) => c.isSingleton);
    const nonSingleton = report.coupling.clusters.filter((c) => !c.isSingleton);
    assert.ok(singletons.length >= 1, 'At least one singleton cluster');
    assert.ok(nonSingleton.length >= 1, 'At least one non-singleton cluster');
  });

  it('couples relation is registered in LINK_RELATIONS', async () => {
    const { LINK_RELATIONS } = await import('../../app/core/domain/cases.js');
    assert.ok(LINK_RELATIONS.includes('couples'), 'couples relation exists');
  });

  it('decisionPortfolioRule is registered in post-commit rules', async () => {
    const { DEFAULT_POST_COMMIT_RULES } = await import('../../app/core/domain/postCommit.js');
    const rule = DEFAULT_POST_COMMIT_RULES.find((r) => r.id === 'decision-portfolio');
    assert.ok(rule, 'decision-portfolio rule found in DEFAULT_POST_COMMIT_RULES');
    assert.ok(Array.isArray(rule.triggers));
    assert.ok(typeof rule.effect === 'function');
  });

  it('decisionPortfolioRule contract is registered in propagation contracts', async () => {
    const { PROPAGATION_CONTRACTS } = await import('../../app/core/domain/propagationContracts.js');
    const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'decisionPortfolioRules.js');
    assert.ok(contract, 'contract found');
    assert.ok(contract.writes.includes('links'));
    assert.ok(contract.writes.includes('portfolioMarkers'));
  });
});
