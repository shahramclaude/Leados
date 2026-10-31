/**
 * tests/app/strategy-coherence.test.mjs — the Strategy Coherence Terminal
 * (Session 62, Schema v42, RULE-SCO-01..04).
 *
 *   1. Pure distance math: share normalisation, total variation, Herfindahl,
 *      band conventions and exact bounds.
 *   2. Report: declared vs measured shares, effort-vs-count basis, recent-flow
 *      drift, blind work with the vintage boundary, and the exclusion of the
 *      terminal's own scaffolding.
 *   3. Normalisers: adoption-vintage repair, owner scrubbing, orphan tags,
 *      duplicate tags, unknown-effort discipline.
 *   4. Schema v42: additive migration, empty collections, setting clamps.
 *   5. Actions and the real cross-module cascade through the store: adoption
 *      fan-out, idempotency, stop-rule delegation, stop-rule verdict decision,
 *      a `retire` verdict retiring in the same transaction, and the pause switch.
 *   6. Signals SCO-01..06, the attention badge, the brief and the demo seed.
 *   7. JSDOM + axe across all four tabs, with the dialog opened through the UI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { addDays, dayKey } from '../../app/core/time.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { LINK_ENTITY_TYPES } from '../../app/core/domain/cases.js';
import {
  BET_VERDICT_KEYS,
  SCO_CHECKS,
  SCO_COMPONENT_WEIGHTS,
  SCO_RULE_IDS,
  SCO_RULES,
  STRATEGY_KIND_KEYS,
  WORK_SOURCES,
  bandForCoherence,
  bandForHhi,
  buildStrategyReport,
  herfindahl,
  normalizeShares,
  normalizeStrategyBets,
  normalizeStrategyTagPayload,
  normalizeStrategyTags,
  strategyAttentionCount,
  strategyBrief,
  strategyRule,
  strategySignals,
  strategyTotals,
  totalVariationPct,
} from '../../app/core/domain/strategy.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const TODAY = dayKey(NOW);
const ROOT = path.resolve(import.meta.dirname, '../..');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function freshStore(now = NOW) {
  const store = createStore({ storage: memoryStorage(), now: () => now });
  const api = createApi(store, { now: () => now });
  return { store, api };
}

function bet(overrides = {}) {
  return {
    id: 'bet-1',
    title: 'Win the mid-market with a faster first value',
    kind: 'where-to-play',
    advantage: 'differentiation',
    diagnosis: 'Onboarding takes fourteen days and mid-market trials churn before value.',
    guidingPolicy: 'Guided onboarding for the 50–200 seat segment until first value is under ten minutes.',
    weightPct: 60,
    horizonWeeks: 26,
    ownerId: 'person-1',
    notDoing: ['No self-serve tier this half.'],
    killCriterion: { metric: 'Median time to first value', threshold: 14, direction: 'above', checkOn: '2027-02-01', note: '' },
    status: 'active',
    adoptedOn: '2026-09-01',
    retiredOn: null,
    retiredReason: '',
    verdict: null,
    notes: '',
    createdOn: '2026-09-01',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    history: [],
    ...overrides,
  };
}

function baseState() {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'person-1', name: 'Ana Silva', role: 'Engineering lead', level: 'lead', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }];
  state.strategyBets = [
    bet(),
    bet({
      id: 'bet-2',
      title: 'Cut cost to serve',
      kind: 'how-to-win',
      advantage: 'cost',
      diagnosis: 'Every ticket costs twice the benchmark to resolve.',
      guidingPolicy: 'Deflect the top three ticket classes with better documentation.',
      weightPct: 40,
      adoptedOn: '2026-09-10',
      createdOn: '2026-09-10',
    }),
  ];
  state.cases = [
    { id: 'case-1', title: 'Onboarding drop-off', status: 'open', createdOn: '2026-09-20' },
    { id: 'case-2', title: 'Ticket backlog', status: 'open', createdOn: '2026-10-01' },
  ];
  state.goals = [{ id: 'goal-1', title: 'Activation', status: 'active', createdOn: '2026-09-25' }];
  state.strategyTags = [
    { id: 'tag-1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 6, createdOn: '2026-09-21', createdAt: '2026-09-21T09:00:00.000Z' },
    { id: 'tag-2', betId: 'bet-1', entityType: 'goal', entityId: 'goal-1', effortWeeks: 4, createdOn: '2026-10-20', createdAt: '2026-10-20T09:00:00.000Z' },
    { id: 'tag-3', betId: 'bet-2', entityType: 'case', entityId: 'case-2', effortWeeks: 2, createdOn: '2026-10-22', createdAt: '2026-10-22T09:00:00.000Z' },
  ];
  return normalizeState(state, { now: NOW }).state;
}

/* ------------------------------------------------------------------ 1. math */

test('shares normalise to one and a zero-weight vector becomes an equal convention, never a single winner', () => {
  assert.deepEqual(normalizeShares([{ key: 'a', weight: 30 }, { key: 'b', weight: 10 }]).map((r) => r.share), [0.75, 0.25]);
  assert.equal(normalizeShares([]), null);
  assert.equal(normalizeShares([{ key: 'a', weight: 0 }]), null);
  const equal = normalizeShares([{ key: 'a', weight: 0 }, { key: 'b', weight: 0 }]);
  assert.equal(equal, null, 'a zero vector is not silently turned into 100% for the first bet');
});

test('total variation distance is exactly 0 on agreement, 100 on disjoint support, and half the L1 otherwise', () => {
  assert.equal(totalVariationPct([{ key: 'a', share: 1 }], [{ key: 'a', share: 1 }]), 0);
  assert.equal(totalVariationPct([{ key: 'a', share: 1 }], [{ key: 'b', share: 1 }]), 100);
  assert.equal(totalVariationPct(
    [{ key: 'a', share: 0.6 }, { key: 'b', share: 0.4 }],
    [{ key: 'a', share: 0.8 }, { key: 'b', share: 0.2 }],
  ), 20);
  assert.equal(totalVariationPct([], []), null);
});

test('Herfindahl concentration matches hand-computed values and its bands are conventions with printed labels', () => {
  assert.equal(herfindahl([{ key: 'a', share: 1 }]), 1);
  assert.equal(herfindahl([{ key: 'a', share: 0.5 }, { key: 'b', share: 0.5 }]), 0.5);
  assert.equal(herfindahl([{ key: 'a', share: 0.2 }, { key: 'b', share: 0.2 }, { key: 'c', share: 0.2 }, { key: 'd', share: 0.2 }, { key: 'e', share: 0.2 }]), 0.2);
  assert.equal(herfindahl([]), null);
  assert.equal(bandForHhi(0.1).key, 'diffuse');
  assert.equal(bandForHhi(0.2).key, 'balanced');
  assert.equal(bandForHhi(0.6).key, 'concentrated');
  assert.equal(bandForCoherence(80).key, 'coherent');
  assert.equal(bandForCoherence(60).key, 'drifting');
  assert.equal(bandForCoherence(10).key, 'split');
  assert.equal(bandForCoherence(null).key, 'split', 'unmeasurable is not called coherent');
});

/* ---------------------------------------------------------------- 2. report */

test('the report compares declared shares with measured shares on an effort basis and prints the gap', () => {
  const state = baseState();
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.bets.length, 2);
  const first = report.bets.find((row) => row.id === 'bet-1');
  assert.equal(first.measured.declaredSharePct, 60);
  assert.equal(first.measured.measuredSharePct, 83.3, '10 of 12 known effort-weeks');
  assert.equal(first.measured.gapPct, 23.3);
  assert.equal(report.portfolio.basis, 'effort');
  assert.equal(report.portfolio.sayDoGapPct, 23.3);
  assert.equal(report.portfolio.gapBreached, true, 'convention is 20pp');
  assert.equal(report.portfolio.knownEffortWeeks, 12);
  assert.equal(report.portfolio.effortCoveragePct, 100);
});

test('with no effort estimates the shares fall back to record counts and say so', () => {
  const state = baseState();
  state.strategyTags = state.strategyTags.map((tag) => ({ ...tag, effortWeeks: null }));
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.portfolio.basis, 'count');
  assert.equal(report.confidence.level, 'counts-only', 'three tags are not yet a measured share');
  assert.ok(report.confidence.reasons.some((reason) => /open strategy-era work/.test(reason)));
  assert.equal(report.portfolio.knownEffortWeeks, null, 'no effort is invented');
  assert.equal(report.portfolio.effortCoveragePct, 0);
  assert.equal(report.portfolio.sayDoGapPct, 6.7, 'counted shares are still computed and labelled');
});

test('half the tags carrying effort is enough for the effort basis; a fifth is not', () => {
  const state = baseState();
  state.strategyTags = [
    { id: 't1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 5, createdOn: '2026-09-21' },
    { id: 't2', betId: 'bet-1', entityType: 'goal', entityId: 'goal-1', effortWeeks: null, createdOn: '2026-09-22' },
  ];
  assert.equal(buildStrategyReport(state, NOW).portfolio.basis, 'effort');
  state.strategyTags = [
    { id: 't1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 5, createdOn: '2026-09-21' },
    { id: 't2', betId: 'bet-1', entityType: 'goal', entityId: 'goal-1', effortWeeks: null, createdOn: '2026-09-22' },
    { id: 't3', betId: 'bet-2', entityType: 'case', entityId: 'case-2', effortWeeks: null, createdOn: '2026-09-23' },
    { id: 't4', betId: 'bet-2', entityType: 'case', entityId: 'case-2', effortWeeks: null, createdOn: '2026-09-24' },
  ];
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.portfolio.basis, 'count');
  assert.equal(report.portfolio.effortCoveragePct, 25);
});

test('closed records and pre-strategy records never count as current funding', () => {
  const state = baseState();
  state.cases = [
    { id: 'case-1', title: 'Onboarding drop-off', status: 'resolved', createdOn: '2026-09-20' },
    { id: 'case-2', title: 'Ticket backlog', status: 'open', createdOn: '2026-10-01' },
    { id: 'case-0', title: 'Old pre-strategy work', status: 'open', createdOn: '2026-01-05' },
  ];
  state.strategyTags = [
    { id: 'tag-1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 6, createdOn: '2026-09-21' },
    { id: 'tag-2', betId: 'bet-2', entityType: 'case', entityId: 'case-2', effortWeeks: 2, createdOn: '2026-10-22' },
    { id: 'tag-3', betId: 'bet-1', entityType: 'case', entityId: 'case-0', effortWeeks: 9, createdOn: '2026-01-06' },
  ];
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.portfolio.closedTagged, 1, 'the resolved case tag is history');
  assert.equal(report.portfolio.fundingTags, 1, 'the pre-strategy tag is not current funding');
  assert.equal(report.portfolio.blind.preStrategy, 1);
  assert.equal(report.portfolio.blind.vintageStart, '2026-09-01');
  assert.equal(report.portfolio.blind.unknownVintage, 0);
});

test('records with no start date are excluded from the denominator and reported as unknown vintage', () => {
  const state = baseState();
  state.cases = [
    { id: 'case-1', title: 'Under the bet', status: 'open', createdOn: '2026-09-20' },
    { id: 'case-2', title: 'No date at all', status: 'open', createdOn: null, createdAt: null },
  ];
  state.goals = [];
  state.strategyTags = [{ id: 't1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 3, createdOn: '2026-09-21' }];
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.portfolio.blind.unknownVintage, 1);
  assert.equal(report.portfolio.blind.postStrategy, 1);
  assert.equal(report.portfolio.blind.blindPct, 0);
});

test('the terminal does not count its own governance records as strategy-blind work', () => {
  const state = baseState();
  state.decisions = [{
    id: 'dec-1',
    title: 'Rebalance funding',
    question: 'The declared shares diverge… [RULE-SCO-02]',
    chosen: '',
    date: '2026-10-20',
    createdAt: '2026-10-20T09:00:00.000Z',
  }];
  state.delegations = [{
    id: 'del-1',
    title: 'Link the work already in flight',
    expectedOutcome: 'Tag the records… [RULE-SCO-01-tag:bet-1]',
    status: 'active',
    delegatedOn: '2026-10-20',
    createdAt: '2026-10-20T09:00:00.000Z',
  }];
  state.cases.push({ id: 'case-3', title: 'Untagged work', status: 'open', createdOn: '2026-10-02' });
  const report = buildStrategyReport(state, NOW);
  assert.ok(!report.bets.some((row) => row.id === 'dec-1'));
  assert.equal(report.portfolio.blind.postStrategy, 4, 'two cases and a goal under the bets, one case outside');
  assert.equal(report.portfolio.blind.blindPct, 25);
});

test('recent flow is compared with the standing mix, so direction can lead the balance sheet', () => {
  const state = baseState();
  // Standing mix is 83/17 by effort; the newest tags go 100% to the small bet.
  state.strategyTags = [
    { id: 't1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 6, createdOn: '2026-09-10' },
    { id: 't2', betId: 'bet-2', entityType: 'case', entityId: 'case-2', effortWeeks: 6, createdOn: '2026-10-26' },
    { id: 't3', betId: 'bet-2', entityType: 'goal', entityId: 'goal-1', effortWeeks: 8, createdOn: '2026-10-27' },
  ];
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.portfolio.sayDoGapPct, 30, 'funded 30/70 against a declared 60/40');
  assert.equal(report.portfolio.driftGapPct, 30, 'recent flow is 0/100 against a funded mix of 30/70');
  const small = report.bets.find((row) => row.id === 'bet-2');
  assert.equal(small.measured.recentSharePct, 100);
  assert.equal(small.measured.recentGapPct, 60);
});

test('a bet is graded on six named checks and the missing ones are printed', () => {
  const state = baseState();
  state.strategyBets = [bet({ notDoing: [], killCriterion: null, ownerId: null, guidingPolicy: '' })];
  const report = buildStrategyReport(state, NOW);
  const row = report.bets[0];
  assert.equal(row.grade.total, SCO_CHECKS.length);
  assert.equal(row.grade.key, 'unfalsifiable');
  assert.deepEqual(row.grade.missing.sort(), ['guidingPolicy', 'owner', 'refusal', 'stopRule'].sort());
  assert.equal(report.falsifiability.unfalsifiable, 1);
});

test('a stop rule that came due without a verdict is listed and no verdict is invented', () => {
  const state = baseState();
  state.strategyBets = [bet({ killCriterion: { metric: 'Median time to first value', threshold: 14, direction: 'above', checkOn: '2026-10-01', note: '' } })];
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.verdictsDue.length, 1);
  assert.equal(report.verdictsDue[0].kill.daysOverdue, 27);
  const judged = baseState();
  judged.strategyBets = [bet({
    killCriterion: { metric: 'Median time to first value', threshold: 14, direction: 'above', checkOn: '2026-10-01', note: '' },
    verdict: { verdict: 'continue', recordedOn: '2026-10-02', note: 'Ten days at the last read.', at: '2026-10-02T09:00:00.000Z' },
  })];
  assert.equal(buildStrategyReport(judged, NOW).verdictsDue.length, 0);
});

test('below five open post-strategy records the report is counts-only and says why', () => {
  const state = baseState();
  const report = buildStrategyReport(state, NOW);
  assert.equal(report.confidence.level, 'counts-only');
  assert.ok(report.confidence.reasons.some((reason) => /5 are needed/.test(reason)));
  assert.equal(report.coherence.components.length >= 2, true);
  assert.deepEqual(Object.keys(SCO_COMPONENT_WEIGHTS).sort(), ['alignment', 'coverage', 'falsifiability']);
});

test('an empty workspace produces no invented bet, no score and no signal', () => {
  const empty = createEmptyState(NOW.toISOString());
  const report = buildStrategyReport(empty, NOW);
  assert.equal(report.hasBets, false);
  assert.equal(report.coherence.pct, null);
  assert.equal(report.portfolio.sayDoGapPct, null);
  assert.equal(report.portfolio.blind.blindPct, null);
  assert.deepEqual(strategySignals(empty, NOW), []);
  assert.equal(strategyAttentionCount(empty, NOW), 0);
});

/* ----------------------------------------------------------- 3. normalisers */

test('a bet marked active without an adoption date is reopened as a draft, with a warning', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'person-1', name: 'Ana', status: 'active' }];
  const warnings = [];
  const rows = normalizeStrategyBets([bet({ adoptedOn: null })], state, NOW, warnings);
  assert.equal(rows[0].status, 'draft');
  assert.equal(rows[0].adoptedOn, null);
  assert.match(warnings.join(' '), /reopened as drafts/);
});

test('normalisation scrubs a departed owner, clamps shares and drops unusable bets', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'person-1', name: 'Ana', status: 'archived' }];
  const warnings = [];
  const rows = normalizeStrategyBets([
    bet({ ownerId: 'person-1', weightPct: 400, horizonWeeks: 5000 }),
    bet({ id: 'bet-bad', title: '' }),
  ], state, NOW, warnings);
  assert.equal(rows.length, 1, 'a titleless bet is not a bet');
  assert.equal(rows[0].ownerId, null);
  assert.equal(rows[0].weightPct, 100);
  assert.equal(rows[0].horizonWeeks, 104);
  assert.match(warnings.join(' '), /active roster/);
});

test('tags resolve against real bets and real records, collapse duplicates and report drops', () => {
  const state = createEmptyState(NOW.toISOString());
  state.strategyBets = [{ id: 'bet-1', title: 'A bet', status: 'active', adoptedOn: '2026-09-01' }];
  state.cases = [{ id: 'case-1', title: 'Open', status: 'open' }];
  const warnings = [];
  const rows = normalizeStrategyTags([
    { id: 't1', betId: 'bet-1', entityType: 'case', entityId: 'case-1', effortWeeks: 3 },
    { id: 't2', betId: 'bet-1', entityType: 'case', entityId: 'case-1' },
    { id: 't3', betId: 'bet-missing', entityType: 'case', entityId: 'case-1' },
    { id: 't4', betId: 'bet-1', entityType: 'case', entityId: 'case-missing' },
  ], state, NOW, warnings);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 't1');
  const text = warnings.join(' ');
  assert.match(text, /tag\(s\) pointed at a bet that no longer exists/);
  assert.match(text, /tag\(s\) pointed at a record that no longer exists/);
  assert.match(text, /duplicate tag\(s\) were collapsed/);
});

test('the tag payload refuses retired bets, closed records and non-numeric effort', () => {
  const state = createEmptyState(NOW.toISOString());
  state.strategyBets = [
    { id: 'bet-1', title: 'Live', status: 'active', adoptedOn: '2026-09-01' },
    { id: 'bet-2', title: 'Retired', status: 'retired', adoptedOn: '2026-08-01' },
  ];
  state.cases = [
    { id: 'case-open', title: 'Open', status: 'open' },
    { id: 'case-closed', title: 'Closed', status: 'resolved' },
  ];
  assert.match(normalizeStrategyTagPayload({ betId: 'bet-2', entityType: 'case', entityId: 'case-open' }, { state, now: NOW }).error, /retired/);
  assert.match(normalizeStrategyTagPayload({ betId: 'bet-1', entityType: 'case', entityId: 'case-closed' }, { state, now: NOW }).error, /already closed/);
  assert.match(normalizeStrategyTagPayload({ betId: 'bet-1', entityType: 'case', entityId: 'case-open', effortWeeks: 'lots' }, { state, now: NOW }).error, /number of weeks/);
  const ok = normalizeStrategyTagPayload({ betId: 'bet-1', entityType: 'case', entityId: 'case-open', effortWeeks: null }, { state, now: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.effortWeeks, null, 'unknown effort stays unknown');
});

/* --------------------------------------------------------------- 4. schema */

test('Schema v42 adds empty strategy collections and additive migration invents nothing', () => {
  assert.equal(SCHEMA_VERSION, 67);
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(empty.strategyBets, []);
  assert.deepEqual(empty.strategyTags, []);
  assert.deepEqual(empty.links, []);
  assert.equal(DEFAULT_SETTINGS.strategyGapThresholdPct, 20);
  assert.equal(DEFAULT_SETTINGS.strategyBlindWipThresholdPct, 40);
  assert.equal(DEFAULT_SETTINGS.strategyDriftWindowDays, 28);

  const migrated = migrate({ schemaVersion: 41, people: [], cases: [] });
  assert.equal(migrated.raw.schemaVersion, 67);
  assert.deepEqual(migrated.raw.strategyBets, []);
  assert.deepEqual(migrated.raw.strategyTags, []);
});

test('strategy settings are clamped, and an unparseable value falls back rather than disabling the check', () => {
  const normalized = normalizeState({
    settings: { strategyGapThresholdPct: 900, strategyBlindWipThresholdPct: 'nonsense', strategyDriftWindowDays: 2, strategyAutoPropagate: false },
  }, { now: NOW }).state;
  assert.equal(normalized.settings.strategyGapThresholdPct, 60);
  assert.equal(normalized.settings.strategyBlindWipThresholdPct, 40);
  assert.equal(normalized.settings.strategyDriftWindowDays, 7);
  assert.equal(normalized.settings.strategyAutoPropagate, false);
});

test('a strategy bet is a first-class graph node and the rule ids are published', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('strategy'));
  assert.equal(SCO_RULES.length, 4);
  assert.deepEqual(Object.values(SCO_RULE_IDS).sort(), ['RULE-SCO-01', 'RULE-SCO-02', 'RULE-SCO-03', 'RULE-SCO-04'].sort());
  assert.ok(STRATEGY_KIND_KEYS.includes('where-to-play'));
  assert.ok(WORK_SOURCES.some((spec) => spec.entityType === 'goal'));
  assert.deepEqual([...BET_VERDICT_KEYS].sort(), ['continue', 'reconsider', 'retire']);
});

/* --------------------------------------------------------- 5. actions/spine */

test('adoption fans out in one transaction into a decision, a delegation, a talking point and typed links', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Engineering lead', level: 'lead' });
  const saved = api.saveStrategyBet({
    title: 'Win the mid-market with a faster first value',
    kind: 'where-to-play',
    advantage: 'differentiation',
    diagnosis: 'Onboarding takes fourteen days and mid-market trials churn before value.',
    guidingPolicy: 'Guided onboarding for the 50–200 seat segment until first value is under ten minutes.',
    weightPct: 60,
    ownerId: person.id,
    notDoing: ['No self-serve tier this half.'],
    killCriterion: { metric: 'Median time to first value', threshold: 14, direction: 'above', checkOn: addDays(TODAY, 60) },
  });
  assert.equal(saved.ok, true);
  assert.equal(store.state.strategyBets[0].status, 'draft');

  const adopted = api.adoptStrategyBet(saved.id, { adoptedOn: addDays(TODAY, -30) });
  assert.equal(adopted.ok, true, adopted.error);
  assert.deepEqual(adopted.propagations.map((row) => row.ruleId), [SCO_RULE_IDS.ADOPT, SCO_RULE_IDS.ADOPT, SCO_RULE_IDS.ADOPT]);
  assert.equal(store.state.decisions.length, 1);
  assert.match(store.state.decisions[0].question, /\[RULE-SCO-01:/);
  assert.equal(store.state.decisions[0].options.length, 3);
  assert.equal(store.state.decisions[0].chosen, '', 'the app never chooses for the leader');
  assert.equal(store.state.delegations.length, 1);
  assert.equal(store.state.delegations[0].personId, person.id);
  assert.ok(store.state.people[0].talkingPoints.some((line) => line.includes('[RULE-SCO-01-review:')));
  assert.equal(store.state.links.filter((link) => link.sourceType === 'strategy').length, 2);
  assert.equal(store.state.links.every((link) => link.sourceId === saved.id), true);

  // A second audit must not duplicate the adoption fan-out.
  api.runStrategyAudit();
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes('[RULE-SCO-01:')).length, 1);
  assert.equal(store.state.delegations.filter((d) => String(d.expectedOutcome).includes('[RULE-SCO-01-tag:')).length, 1);
});

test('an active bet with no dated stop rule gets exactly one owned delegation (RULE-SCO-03)', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const saved = api.saveStrategyBet({
    title: 'Cut cost to serve',
    diagnosis: 'Every ticket costs twice the benchmark to resolve.',
    guidingPolicy: 'Deflect the top three ticket classes with better documentation.',
    weightPct: 20,
    ownerId: person.id,
  });
  api.adoptStrategyBet(saved.id, { adoptedOn: addDays(TODAY, -10) });
  const stopDelegations = store.state.delegations.filter((d) => String(d.expectedOutcome).includes('[RULE-SCO-03:'));
  assert.equal(stopDelegations.length, 1);
  assert.match(stopDelegations[0].title, /Write the stop rule/);
  api.runStrategyAudit();
  assert.equal(store.state.delegations.filter((d) => String(d.expectedOutcome).includes('[RULE-SCO-03:')).length, 1, 'idempotent');
});

test('a say–do gap over convention opens exactly one rebalancing decision, keyed to the diverging bet set', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const a = api.saveStrategyBet({
    title: 'Grow activation',
    diagnosis: 'Activation is the constraint on expansion revenue.',
    guidingPolicy: 'Guided onboarding until first value is under ten minutes.',
    weightPct: 50,
    ownerId: person.id,
    killCriterion: { metric: 'Time to first value', threshold: 14, direction: 'above', checkOn: addDays(TODAY, 45) },
  });
  const b = api.saveStrategyBet({
    title: 'Shrink cost to serve',
    diagnosis: 'Ticket handling costs twice the benchmark.',
    guidingPolicy: 'Deflect the top three classes.',
    weightPct: 50,
    ownerId: person.id,
    killCriterion: { metric: 'Cost per ticket', threshold: 20, direction: 'above', checkOn: addDays(TODAY, 45) },
  });
  api.adoptStrategyBet(a.id, { adoptedOn: addDays(TODAY, -20) });
  api.adoptStrategyBet(b.id, { adoptedOn: addDays(TODAY, -20) });
  for (const index of [1, 2, 3]) {
    api.addCase({ title: `Activation work ${index}`, kind: 'initiative', severity: 'medium' });
  }
  const cases = store.state.cases.filter((c) => c.title.startsWith('Activation work'));
  for (const record of cases) api.tagStrategyWork({ betId: a.id, entityType: 'case', entityId: record.id, effortWeeks: 4 });
  const audit = api.runStrategyAudit();
  assert.equal(audit.ok, true, audit.error);
  const gapDecisions = store.state.decisions.filter((d) => String(d.question).includes('[RULE-SCO-02:'));
  assert.equal(gapDecisions.length, 1, 'one decision for this bet set');
  assert.match(gapDecisions[0].question, /Most over-funded/);
  assert.match(gapDecisions[0].question, /Most under-funded/);
  api.runStrategyAudit();
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes('[RULE-SCO-02:')).length, 1);
});

test('an overdue stop rule opens one retire-or-renew decision (RULE-SCO-04), never a silent retirement', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const saved = api.saveStrategyBet({
    title: 'Make reliability a precondition',
    diagnosis: 'Two weekend P1s went untouched for over an hour.',
    guidingPolicy: 'Rebuild escalation and the on-call rota first.',
    weightPct: 25,
    ownerId: person.id,
    killCriterion: { metric: 'P1 response under 30m', threshold: 80, direction: 'below', checkOn: addDays(TODAY, 30) },
  });
  api.adoptStrategyBet(saved.id, { adoptedOn: addDays(TODAY, -60) });
  // Move the stop rule into the past by editing the record the same way a leader would.
  store.update((draft) => {
    const target = draft.strategyBets.find((row) => row.id === saved.id);
    target.killCriterion.checkOn = addDays(TODAY, -3);
  }, { type: 'strategy.bet.updated', entity: 'strategy', entityId: saved.id, summary: 'Stop rule date moved' });
  api.runStrategyAudit();
  const verdictDecisions = store.state.decisions.filter((d) => String(d.question).includes('[RULE-SCO-04:'));
  assert.equal(verdictDecisions.length, 1);
  assert.equal(verdictDecisions[0].options.length, 3);
  assert.equal(store.state.strategyBets[0].status, 'active', 'the app does not retire by itself');
  assert.ok(store.state.people[0].talkingPoints.some((line) => line.includes('[RULE-SCO-04-review:')));
});

test('a retire verdict retires the bet in the same transaction and keeps the history', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const saved = api.saveStrategyBet({
    title: 'Cut cost to serve',
    diagnosis: 'Every ticket costs twice the benchmark.',
    guidingPolicy: 'Deflect the top three classes.',
    weightPct: 15,
    ownerId: person.id,
  });
  api.adoptStrategyBet(saved.id, { adoptedOn: addDays(TODAY, -20) });
  const result = api.recordStrategyVerdict(saved.id, { verdict: 'retire', note: 'Deflection did not move the cost per ticket.', recordedOn: TODAY });
  assert.equal(result.ok, true, result.error);
  const row = store.state.strategyBets[0];
  assert.equal(row.status, 'retired');
  assert.equal(row.retiredReason, 'Deflection did not move the cost per ticket.');
  assert.equal(row.verdict.verdict, 'retire');
  assert.ok(row.history.some((entry) => entry.type === 'retired'));
  assert.match(api.recordStrategyVerdict(saved.id, { verdict: 'continue', note: 'Nope.' }).error, /already retired/);
});

test('actions validate: an ownerless bet, a future adoption and a bare verdict are all refused', () => {
  const { api } = freshStore();
  const saved = api.saveStrategyBet({
    title: 'A bet with no owner',
    diagnosis: 'Something is wrong and the diagnosis is written here.',
    guidingPolicy: 'Do the thing that deals with it.',
    weightPct: 10,
  });
  assert.equal(saved.ok, true);
  assert.match(api.adoptStrategyBet(saved.id).error, /Name an owner/);

  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const owned = api.saveStrategyBet({
    title: 'An owned bet',
    diagnosis: 'The obstacle is written down in enough detail.',
    guidingPolicy: 'The approach that deals with the obstacle.',
    weightPct: 10,
    ownerId: person.id,
  });
  assert.match(api.adoptStrategyBet(owned.id, { adoptedOn: addDays(TODAY, 5) }).error, /future/);
  assert.match(api.recordStrategyVerdict(owned.id, { verdict: 'continue', note: 'ok' }).error, /Record what the stop rule showed/);
  assert.match(api.retireStrategyBet(owned.id, { reason: 'no' }).error, /Record why the bet is being retired/);
  assert.match(api.runStrategyAudit().error, /Adopt at least one bet/);
});

test('the pause switch stops the automatic cascade but an explicit adoption never is blocked', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  api.updateSettings({ strategyAutoPropagate: false });
  const saved = api.saveStrategyBet({
    title: 'Cut cost to serve',
    diagnosis: 'Every ticket costs twice the benchmark.',
    guidingPolicy: 'Deflect the top three classes.',
    weightPct: 15,
    ownerId: person.id,
  });
  api.adoptStrategyBet(saved.id, { adoptedOn: addDays(TODAY, -20) });
  assert.equal(store.state.decisions.length, 0, 'the pause switch holds the governance response');
  assert.equal(store.state.delegations.length, 0);
});

test('tagging and untagging move the measured share and the gap immediately', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const a = api.saveStrategyBet({
    title: 'Grow activation', diagnosis: 'Activation is the constraint on expansion.', guidingPolicy: 'Guided onboarding.',
    weightPct: 50, ownerId: person.id, killCriterion: { metric: 'TTFV', threshold: 14, direction: 'above', checkOn: addDays(TODAY, 30) },
  });
  const b = api.saveStrategyBet({
    title: 'Shrink cost to serve', diagnosis: 'Ticket handling costs twice the benchmark.', guidingPolicy: 'Deflect the top classes.',
    weightPct: 50, ownerId: person.id, killCriterion: { metric: 'Cost per ticket', threshold: 20, direction: 'above', checkOn: addDays(TODAY, 30) },
  });
  api.adoptStrategyBet(a.id, { adoptedOn: addDays(TODAY, -20) });
  api.adoptStrategyBet(b.id, { adoptedOn: addDays(TODAY, -20) });
  const record = api.addCase({ title: 'Activation instrumentation', kind: 'initiative', severity: 'medium' });
  const tagged = api.tagStrategyWork({ betId: a.id, entityType: 'case', entityId: record.id, effortWeeks: 6 });
  assert.equal(tagged.ok, true, tagged.error);
  assert.equal(api.tagStrategyWork({ betId: a.id, entityType: 'case', entityId: record.id, effortWeeks: 2 }).ok, false, 'no duplicate tag');
  assert.equal(api.strategyReport().bets.find((row) => row.id === a.id).measured.measuredSharePct, 100);
  assert.equal(api.untagStrategyWork(tagged.id).ok, true);
  assert.equal(api.strategyReport().bets.find((row) => row.id === a.id).measured.measuredSharePct, 0);
  assert.equal(store.state.strategyTags.length, 0);
});

/* ------------------------------------------------------- 6. signals / demo */

test('signals fire on the measured conditions and stay silent when none is met', () => {
  const state = baseState();
  const ids = strategySignals(state, NOW).map((signal) => signal.ruleId);
  assert.ok(ids.includes('SCO-01'), 'say–do gap over convention');
  assert.ok(!ids.includes('SCO-02'), 'every open strategy-era record is tagged in this fixture');
  for (const index of [1, 2, 3]) {
    state.cases.push({ id: `case-blind-${index}`, title: `Untagged ${index}`, status: 'open', createdOn: '2026-10-05' });
  }
  assert.ok(strategySignals(state, NOW).map((signal) => signal.ruleId).includes('SCO-02'), 'blind work over convention');
  const withoutStrategy = createEmptyState(NOW.toISOString());
  withoutStrategy.cases = [{ id: 'case-1', title: 'Open', status: 'open', createdOn: '2026-09-01' }];
  const emptySignals = strategySignals(withoutStrategy, NOW);
  assert.equal(emptySignals.length, 1);
  assert.equal(emptySignals[0].ruleId, 'SCO-05');
  assert.equal(strategyAttentionCount(withoutStrategy, NOW), 1);
});

test('every signal names its evidence and a route, and the brief carries the real numbers', () => {
  const state = baseState();
  for (const signal of strategySignals(state, NOW)) {
    assert.ok(signal.title.length > 10);
    assert.ok(signal.detail.length > 40);
    assert.ok(Array.isArray(signal.evidence) && signal.evidence.length >= 1);
    assert.ok(signal.action.route.startsWith('#/strategy'));
    assert.ok(Number.isFinite(signal.severity));
  }
  const brief = strategyBrief(state, NOW);
  assert.match(brief, /Say–do gap: 23\.3pp/);
  assert.match(brief, /Strategy-blind work/);
  assert.match(brief, /WHAT THIS IS NOT/);
  assert.match(brief, /never as zero effort/);
  assert.ok(!/lorem|TODO|undefined|NaN/.test(brief));
});

test('the demo workspace declares three bets of different quality and one verdict that is due', () => {
  const demo = buildDemoState(NOW);
  assert.equal(demo.strategyBets.length, 3);
  assert.ok(demo.strategyTags.length >= 4);
  const report = buildStrategyReport(demo, NOW);
  assert.equal(report.bets.length, 3);
  assert.equal(report.bets.filter((row) => row.grade.key === 'falsifiable').length, 2);
  assert.equal(report.bets.filter((row) => row.grade.key === 'unfalsifiable').length, 1);
  assert.equal(report.verdictsDue.length, 1);
  assert.equal(report.portfolio.basis, 'effort');
  assert.equal(report.confidence.level, 'measured');
  assert.ok(report.portfolio.blind.blindPct > 0, 'the demo honestly shows work outside any bet');
  assert.ok(strategyTotals(demo, NOW).bets === 3);
  // The demo seed survives the same normaliser every import uses.
  const renormalized = normalizeState(demo, { now: NOW }).state;
  assert.equal(renormalized.strategyBets.length, 3);
  assert.equal(renormalized.strategyTags.length, demo.strategyTags.length);
});

test('the rule is quiet on unrelated events and synchronous', () => {
  const { store, api } = freshStore();
  const person = api.addPerson({ name: 'Ana Silva', role: 'Lead', level: 'lead' });
  const saved = api.saveStrategyBet({
    title: 'Grow activation', diagnosis: 'Activation is the constraint on expansion.', guidingPolicy: 'Guided onboarding.',
    weightPct: 50, ownerId: person.id,
  });
  api.adoptStrategyBet(saved.id, { adoptedOn: addDays(TODAY, -5) });
  const before = store.state.decisions.length;
  api.addCase({ title: 'An unrelated case', kind: 'incident', severity: 'low' });
  assert.ok(store.state.decisions.length >= before, 'a case may open its own cascade');
  const result = strategyRule(store.state, { event: { type: 'case.created' }, now: NOW, idFactory: (p) => `${p}-x` });
  assert.deepEqual(result, [], 'strategy rule declines unrelated events');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'strategyRule'), 'registered on the shared spine');
});

/* ----------------------------------------------------------------- 7. DOM */

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
  const dom = new JSDOM(html, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
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

async function axeViolations(env) {
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  if (!env.window.axe) env.window.eval(axeSrc);
  const result = await env.window.axe.run(env.document.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: every strategy tab renders axe-clean on the demo workspace and the dialogs work', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/strategy', '#/strategy?tab=coherence', '#/strategy?tab=falsifiability', '#/strategy?tab=verdicts']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 400, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/strategy?tab=coherence');
    assert.match(env.document.querySelector('#view').textContent, /Say–do gap|Work under a bet/);
    assert.ok(env.document.querySelector('[href="#/strategy"]'), 'reachable from navigation');

    // The explicit audit is idempotent through the real header button.
    app.ctx.navigate('#/strategy');
    const auditButton = [...env.document.querySelectorAll('#view button')].find((b) => /run coherence audit/i.test(b.textContent));
    assert.ok(auditButton);
    const before = app.store.state.decisions.length;
    auditButton.click();
    const afterFirst = app.store.state.decisions.length;
    assert.ok(afterFirst >= before);
    const auditAgain = [...env.document.querySelectorAll('#view button')].find((b) => /run coherence audit/i.test(b.textContent));
    auditAgain.click();
    assert.equal(app.store.state.decisions.length, afterFirst, 'a second audit does not duplicate decisions');

    // Declaring a bet opens a real dialog with validated fields.
    app.ctx.navigate('#/strategy');
    const declare = [...env.document.querySelectorAll('#view button')].find((b) => /declare a bet/i.test(b.textContent));
    assert.ok(declare);
    declare.click();
    const dialog = env.document.querySelector('.modal, [role="dialog"]');
    assert.ok(dialog, 'the bet dialog opens');
    assert.match(dialog.textContent, /Diagnosis/);
    assert.match(dialog.textContent, /NOT do/);
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});

test('UI: the empty workspace invites the first bet instead of showing a fake score', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.navigate('#/strategy');
    assert.equal(app.route, 'strategy');
    const view = env.document.querySelector('#view');
    assert.match(view.textContent, /No strategy declared yet/);
    assert.ok(!view.textContent.includes('Coherence 0%'), 'no zero-score theatre');
    assert.ok([...view.querySelectorAll('button')].some((b) => /declare the first bet/i.test(b.textContent)));
    assert.deepEqual(await axeViolations(env), [], 'the empty state is axe-clean');
  } finally {
    env.dom.window.close();
  }
});

test('UI: the adoption dialog grades the draft bet itself, not an empty row', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    // A draft that meets the bar: everything except committed work, which by
    // definition cannot exist before the bet is adopted.
    const created = app.api.saveStrategyBet({
      title: 'Enter the enterprise segment through security review',
      kind: 'where-to-play',
      advantage: 'focus',
      diagnosis: 'Enterprise deals stall for six weeks in security review with nobody accountable for the pack.',
      guidingPolicy: 'Build a reusable review pack before hiring a single enterprise seller.',
      weightPct: 20,
      horizonWeeks: 26,
      ownerId: app.store.state.people[0].id,
      notDoing: ['No enterprise seller before the review pack exists.'],
      killCriterion: { metric: 'Review cycle in weeks', threshold: 3, direction: 'above', checkOn: '2027-03-01' },
      status: 'draft',
    });
    assert.equal(created.ok, true, created.error);
    app.ctx.navigate('#/strategy');
    const adopt = [...env.document.querySelectorAll('#view button')].find((b) => b.textContent.trim() === 'Adopt');
    assert.ok(adopt, 'a draft exposes an adopt action');
    adopt.click();
    const dialog = env.document.querySelector('.modal, [role="dialog"]');
    assert.ok(dialog, 'the adopt dialog opens');
    assert.equal((dialog.textContent.match(/Passes/g) || []).length, 5,
      'five checks pass on the draft payload — the bet must not be graded as an empty active row');
    assert.equal((dialog.textContent.match(/Missing/g) || []).length, 1,
      'only committed work is missing before anything is tagged');
    assert.match(dialog.textContent, /tag work immediately after adopting/);
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});
