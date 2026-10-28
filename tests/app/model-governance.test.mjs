/**
 * tests/app/model-governance.test.mjs — Evidence Governance, the Claim &
 * Counterfactual Registry (Schema v41, RULE-MODEL-01..04).
 *
 *   1. The one trust ladder: every grade reachable, and its boundary identical
 *      to the capital module it shares primitives with.
 *   2. Claim derivation: one claim per quantitative statement, guarded so a
 *      broken source module yields no claim rather than an invented one.
 *   3. Challenge arithmetic: hand-checked Bayes in log-odds, clamping, and a
 *      posterior that a hand edit cannot fake because it is never stored.
 *   4. Conflict criteria: each fires only under its stated condition.
 *   5. Schema v41: additive migration, and a normaliser that repairs rather
 *      than deletes a leader's recorded observation.
 *   6. The real store: a challenge recorded through the API fans out into one
 *      DACI re-decision, one verification delegation, one blameless 1:1 prompt
 *      and a priced timing position — idempotently.
 *   7. Signals, Insights, the brief, and a JSDOM + axe render of `#/models`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  DEFAULT_SETTINGS,
  MIGRATIONS,
  SCHEMA_VERSION,
  migrate,
  normalizeModelChallenges,
  normalizeState,
} from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import {
  MODEL_CHALLENGE_DIRECTIONS,
  MODEL_ENGINE_VERSION,
  MODEL_MAX_LIKELIHOOD_RATIO,
  MODEL_MIN_LIKELIHOOD_RATIO,
  MODEL_RULE_IDS,
  MODEL_TRUST_GRADES,
  applyModelChallenges,
  buildModelGovernanceReport,
  detectModelConflicts,
  extractModelClaims,
  modelGovernanceBrief,
  modelGovernanceRule,
  modelGovernanceSignals,
  normalizeModelChallengePayload,
  unifiedTrust,
} from '../../app/core/domain/claimRegistry.js';
import { CAP_TRUST_GRADES } from '../../app/core/domain/policyPortfolio.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-28T10:00:00.000Z');
const TODAY = '2026-10-28';

function demoState(at = NOW) {
  return buildDemoState(at);
}

/* ------------------------------------------------------------- 1. ladder */

test('the trust ladder has five ordered grades and matches the capital module', () => {
  const grades = Object.keys(MODEL_TRUST_GRADES);
  assert.deepEqual(grades, ['unvalidated', 'refuted', 'provisional', 'backtested', 'validated']);
  const ranks = grades.map((g) => MODEL_TRUST_GRADES[g].rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  // The stated point of the module: one ladder, re-derived from the same
  // primitives, so the two cannot silently diverge.
  assert.equal(CAP_TRUST_GRADES.refuted.rank, MODEL_TRUST_GRADES.refuted.rank);
  assert.equal(CAP_TRUST_GRADES.validated.rank, MODEL_TRUST_GRADES.validated.rank);
  const twice = Object.values(MODEL_TRUST_GRADES).map((g) => g.rank);
  assert.equal(new Set(twice).size, twice.length, 'ranks must be distinct');
});

test('every trust grade is reachable, and none is claimed without evidence', () => {
  assert.equal(unifiedTrust({}).grade, 'unvalidated');
  assert.equal(unifiedTrust({ skill: null }).grade, 'unvalidated');
  // A negative skill is refuted regardless of anything else.
  assert.equal(unifiedTrust({ skill: -0.1, assumedPct: 10, oosN: 9, oosSkill: 0.9 }).grade, 'refuted');
  // Zero skill loses to persistence exactly at the floor.
  assert.equal(unifiedTrust({ skill: 0 }).grade, 'refuted');
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 65 }).grade, 'provisional');
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 10, oosN: 0 }).grade, 'backtested');
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 10, oosN: 0, oosSkill: null }).grade, 'backtested');
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 10, oosN: 2, oosSkill: 0.4 }).grade, 'validated');
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 10, oosN: 2, oosSkill: -0.1 }).grade, 'refuted');
  // Only Backtested and above may be called actionable.
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 10, oosN: 0 }).actionable, true);
  assert.equal(unifiedTrust({ skill: 0.2, assumedPct: 65 }).actionable, false);
  assert.equal(unifiedTrust({ skill: -1 }).actionable, false);
});

/* ------------------------------------------------------- 2. claim derivation */

test('the demo workspace derives claims from real records and reports no source warnings', () => {
  const { claims, sourceWarnings } = extractModelClaims(demoState(), NOW);
  assert.ok(claims.length >= 10, `expected real claims, got ${claims.length}`);
  assert.deepEqual(sourceWarnings, []);
  const modules = new Set(claims.map((c) => c.module));
  for (const expected of ['capital', 'dynamics', 'premises', 'watch', 'impact']) {
    assert.ok(modules.has(expected), `missing claims from ${expected}`);
  }
  for (const claim of claims) {
    assert.ok(claim.id && claim.statement && claim.trustGrade, 'every claim is identified, stated and graded');
    assert.ok(MODEL_TRUST_GRADES[claim.trustGrade], `unknown grade ${claim.trustGrade}`);
    assert.ok(Array.isArray(claim.blockers));
    assert.ok(Array.isArray(claim.lineage));
  }
});

test('an empty workspace invents no claims', () => {
  const state = createEmptyState(NOW.toISOString());
  const report = buildModelGovernanceReport(state, NOW);
  assert.deepEqual(report.claims, []);
  assert.deepEqual(report.conflicts, []);
  assert.equal(report.aggregates.claims, 0);
  assert.equal(report.aggregates.actionable, 0);
  assert.deepEqual(report.sourceWarnings, []);
});

test('a source module that throws yields a warning, never a fabricated claim', () => {
  // A capital report needs an adequate dynamics model; break the roster so the
  // capital source degrades. The registry must still return the rest.
  const state = demoState();
  const broken = { ...state, people: [], oneOnOnes: [], portfolio: [] };
  const report = buildModelGovernanceReport(broken, NOW);
  for (const claim of report.claims) {
    assert.notEqual(claim.module, 'capital', 'no capital claim without a team');
  }
  assert.ok(report.claims.length > 0, 'other sources still report');
});

test('an open decision is a claim only when something is registered against it', () => {
  const state = demoState();
  state.decisions.push({
    id: 'dec-unlinked', title: 'Pick a coffee supplier', status: 'open', ownerId: state.people[0].id,
    createdAt: NOW.toISOString(),
  });
  const { claims } = extractModelClaims(state, NOW);
  assert.equal(claims.some((c) => c.subjectId === 'dec-unlinked'), false,
    'an unlinked decision belongs to the Decisions terminal, not the claim registry');
});

/* ------------------------------------------------- 3. challenge arithmetic */

test('hand-checked Bayes: 50% prior with a 4:1 challenge reads 20%', () => {
  const claim = { id: 'c1', priorPct: 50 };
  const result = applyModelChallenges(claim, [
    { id: 'm1', claimId: 'c1', direction: 'challenges', likelihoodRatio: 4 },
  ]);
  // odds 1:1 -> 1:4 = 0.25 -> p = 0.25/1.25 = 20%
  assert.equal(result.posteriorPct, 20);
  assert.equal(result.logBayesFactor, -1.386);
});

test('hand-checked Bayes: two independent 2:1 supports from 50% read 80%', () => {
  const claim = { id: 'c2', priorPct: 50 };
  const result = applyModelChallenges(claim, [
    { id: 'm1', claimId: 'c2', direction: 'supports', likelihoodRatio: 2 },
    { id: 'm2', claimId: 'c2', direction: 'supports', likelihoodRatio: 2 },
  ]);
  // odds 1 -> 4 -> p = 4/5 = 80%
  assert.equal(result.posteriorPct, 80);
  assert.equal(result.challengeCount, 2);
  assert.equal(result.lineage.length, 2);
});

test('a supporting and a challenging observation of the same strength cancel', () => {
  const claim = { id: 'c3', priorPct: 30 };
  const result = applyModelChallenges(claim, [
    { id: 'm1', claimId: 'c3', direction: 'supports', likelihoodRatio: 3 },
    { id: 'm2', claimId: 'c3', direction: 'challenges', likelihoodRatio: 3 },
  ]);
  assert.equal(result.posteriorPct, 30);
  assert.equal(result.logBayesFactor, 0);
});

test('challenges from other claims never leak into a claim posterior', () => {
  const claim = { id: 'c4', priorPct: 50 };
  const result = applyModelChallenges(claim, [
    { id: 'm1', claimId: 'other', direction: 'challenges', likelihoodRatio: 20 },
  ]);
  assert.equal(result.posteriorPct, 50);
  assert.equal(result.challengeCount, 0);
});

test('payload validation refuses a confidence score dressed as a likelihood ratio', () => {
  const claim = { id: 'c5', challengable: true };
  const tooBig = normalizeModelChallengePayload({ observation: 'x', direction: 'supports', likelihoodRatio: 100 }, { claim });
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.field, 'likelihoodRatio');
  const tooSmall = normalizeModelChallengePayload({ observation: 'x', direction: 'challenges', likelihoodRatio: 0.001 }, { claim });
  assert.equal(tooSmall.ok, false);
  const noObservation = normalizeModelChallengePayload({ observation: '   ', direction: 'challenges', likelihoodRatio: 2 }, { claim });
  assert.equal(noObservation.ok, false);
  assert.equal(noObservation.field, 'observation');
  const noDirection = normalizeModelChallengePayload({ observation: 'fact', direction: 'meh', likelihoodRatio: 2 }, { claim });
  assert.equal(noDirection.ok, false);
  const ok = normalizeModelChallengePayload({ observation: 'A dated fact', direction: 'challenges', likelihoodRatio: 2 }, { claim });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.likelihoodRatio, 2);
  assert.equal(ok.value.sourceType, 'leader-observation');
});

test('a claim that owns its evidence machinery cannot be re-challenged', () => {
  const { claims } = extractModelClaims(demoState(), NOW);
  const premiseClaim = claims.find((c) => c.gradedBy === 'premise-sentinel');
  assert.ok(premiseClaim, 'the demo has a premise claim');
  const result = normalizeModelChallengePayload(
    { observation: 'fact', direction: 'challenges', likelihoodRatio: 2 },
    { claim: premiseClaim },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /own evidence machinery|Premise Sentinel/i);
});

/* --------------------------------------------------------- 4. conflicts */

test('C1: a load-bearing premise that slipped under an open decision is a conflict', () => {
  const state = demoState();
  const { claims } = extractModelClaims(state, NOW);
  const conflicts = detectModelConflicts(claims, state, NOW);
  const c1 = conflicts.filter((c) => c.type === 'fragile-premise-under-open-decision');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].severity, 4);
  assert.ok(c1[0].criterion.includes('Assumption-Based Planning'));
});

test('C1 does not fire when the tested decision is closed', () => {
  const state = demoState();
  const conflictsBefore = detectModelConflicts(extractModelClaims(state, NOW).claims, state, NOW)
    .filter((c) => c.type === 'fragile-premise-under-open-decision');
  assert.equal(conflictsBefore.length, 1);
  const decisionId = conflictsBefore[0].evidence.decisionId;
  state.decisions = state.decisions.map((d) => (d.id === decisionId ? { ...d, status: 'closed', chosen: 'x' } : d));
  const after = detectModelConflicts(extractModelClaims(state, NOW).claims, state, NOW)
    .filter((c) => c.type === 'fragile-premise-under-open-decision');
  assert.equal(after.length, 0, 'a closed decision resolves the criterion');
});

test('C2: an adopted commitment on a refuted model is a conflict', () => {
  const state = demoState();
  const { claims } = extractModelClaims(state, NOW);
  const conflicts = detectModelConflicts(claims, state, NOW);
  const c2 = conflicts.filter((c) => c.type === 'adopted-on-refuted-model');
  assert.ok(c2.length >= 1);
  assert.ok(c2[0].criterion.includes('Popper'));
});

test('C2 does not fire when nothing has been adopted', () => {
  const state = demoState();
  state.capitalPolicies = [];
  state.dynamicsExperiments = [];
  const { claims } = extractModelClaims(state, NOW);
  const conflicts = detectModelConflicts(claims, state, NOW);
  assert.equal(conflicts.filter((c) => c.type === 'adopted-on-refuted-model').length, 0);
});

test('C3 fires only when the detector has a negative skill', () => {
  const state = demoState();
  const { claims } = extractModelClaims(state, NOW);
  const watchModel = claims.find((c) => c.subjectKey === 'watch:model');
  assert.ok(watchModel);
  // The demo detector has no scored forecasts, so skill is null -> no C3.
  if (watchModel.skill === null) {
    assert.equal(detectModelConflicts(claims, state, NOW).filter((c) => c.type === 'signal-vs-refuted-detector').length, 0);
  }
  // Force a negative skill and confirm exactly one conflict per open alert.
  watchModel.skill = -0.5;
  const forced = detectModelConflicts(claims, state, NOW).filter((c) => c.type === 'signal-vs-refuted-detector');
  const openAlerts = claims.filter((c) => c.module === 'watch' && c.kind === 'control-signal').length;
  assert.equal(forced.length, Math.min(3, openAlerts));
});

/* ------------------------------------------------------ 5. schema v41 */

test('schema is v41 and the migration is purely additive', () => {
  assert.equal(SCHEMA_VERSION, 41);
  const v40 = { schemaVersion: 40, people: [] };
  const { raw, applied } = migrate(v40);
  assert.equal(raw.schemaVersion, 41);
  assert.deepEqual(applied, ['40 → 41']);
  assert.deepEqual(raw.modelChallenges, []);
  assert.ok(typeof MIGRATIONS[40] === 'function');
  assert.equal(DEFAULT_SETTINGS.modelAutoPropagate, true);
  const normalized = normalizeState({ schemaVersion: 41, people: [] }, { now: NOW });
  assert.equal(normalized.state.settings.modelAutoPropagate, true);
  assert.equal(normalizeState({ settings: { modelAutoPropagate: false } }, { now: NOW }).state.settings.modelAutoPropagate, false);
});

test('the normaliser repairs a challenge rather than deleting a leader observation', () => {
  const warnings = [];
  const out = normalizeModelChallenges([
    { id: 'a', claimId: 'clm-x', observation: 'A fact', direction: 'nonsense', likelihoodRatio: 500, recordedOn: '2030-01-01' },
    { id: 'a', claimId: 'clm-y', observation: 'duplicate id' },
    { id: 'b', claimId: '', observation: 'no claim' },
    { id: 'c', claimId: 'clm-z', observation: '' },
    { id: 'd', claimId: 'clm-w', observation: 'undated', direction: 'supports', likelihoodRatio: 0 },
  ], TODAY, NOW, warnings);

  assert.equal(out.length, 2, 'the duplicate id and the two unusable rows are dropped');
  const first = out.find((r) => r.id === 'a');
  assert.equal(first.direction, 'challenges', 'unknown direction defaults to scepticism');
  assert.equal(first.likelihoodRatio, MODEL_MAX_LIKELIHOOD_RATIO);
  assert.equal(first.recordedOn, TODAY, 'a future observation is clamped to today, not deleted');
  const second = out.find((r) => r.id === 'd');
  assert.equal(second.likelihoodRatio, MODEL_MIN_LIKELIHOOD_RATIO);
  assert.equal(second.recordedOn, TODAY);
  assert.ok(warnings.length >= 5);
  assert.ok(warnings.some((w) => w.includes('default is scepticism')));
});

test('an orphaned challenge is kept and reported, not silently deleted', () => {
  const state = normalizeState({
    schemaVersion: 41,
    people: [{ id: 'p1', name: 'Ada', status: 'active' }],
    modelChallenges: [{
      id: 'm1', claimId: 'clm-gone', observation: 'A fact', direction: 'challenges',
      likelihoodRatio: 2, recordedOn: TODAY, createdAt: NOW.toISOString(),
    }],
  }, { now: NOW }).state;
  assert.equal(state.modelChallenges.length, 1);
  const report = buildModelGovernanceReport(state, NOW);
  assert.equal(report.challenges.length, 1);
  assert.equal(report.claims.some((c) => c.id === 'clm-gone'), false);
});

/* ------------------------------------------- 6. the real cross-module cascade */

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

test('a challenge recorded through the API fans out across modules in one transaction', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => NOW });
  store.seedDemo({ force: true });
  const api = createApi(store, { now: () => NOW });

  const before = buildModelGovernanceReport(store.state, NOW);
  const claim = before.claims.find((c) => c.id === 'clm-capital-model');
  assert.ok(claim, 'the demo registers a capital model claim');
  assert.equal(claim.posteriorPct, 50, 'neutral prior before any challenge');
  const decisionsBefore = store.state.decisions.length;
  const delegationsBefore = store.state.delegations.length;

  const result = api.recordModelChallenge({
    claimId: claim.id,
    observation: 'The last two checkpoint predictions were optimistic by more than a week.',
    direction: 'challenges',
    likelihoodRatio: 4,
  });
  assert.equal(result.ok, true, result.error || '');
  assert.equal(result.posteriorPct, 20, '50% prior with a 4:1 challenge reads 20%');

  // 1. The observation itself is appended, not a rewritten belief.
  assert.equal(store.state.modelChallenges.length, 1);
  assert.equal(store.state.modelChallenges[0].observation.length > 0, true);

  // 2. Exactly one DACI re-decision opened by governance, with three honest
  //    options. Decision Tempo may open its own policy decision in the same
  //    transaction (RULE-DLY-05) — that is the intended fan-out, so this
  //    asserts on provenance rather than on a total count, and then proves
  //    the second decision came from tempo and not from a duplicate rule run.
  const governanceDecisions = store.state.decisions.filter((d) => d.source === 'model-governance');
  assert.equal(governanceDecisions.length, 1, 'exactly one governance re-decision');
  assert.ok(store.state.decisions.length >= decisionsBefore + 1);
  const tempoDecisions = store.state.decisions.slice(decisionsBefore)
    .filter((d) => d.source !== 'model-governance');
  assert.ok(tempoDecisions.length <= 1, 'at most one further tempo decision, never a rule storm');
  for (const extra of tempoDecisions) {
    assert.match(String(extra.title || extra.question), /tempo|Tempo|timebox|guardrail/i,
      `the extra decision must be a tempo decision, not a duplicate: ${extra.title}`);
  }
  const decision = governanceDecisions[0];
  assert.equal(decision.claimId, claim.id);
  assert.equal(decision.options.length, 3);
  assert.match(decision.question, /Bayes factor/);

  // 3. Exactly one owned verification delegation from governance. Tempo may
  //    add its own recovery delegation for pre-existing overdue decisions.
  const governanceDelegations = store.state.delegations.slice(delegationsBefore)
    .filter((d) => d.source === 'model-governance');
  assert.equal(governanceDelegations.length, 1);

  // 4. A blameless 1:1 prompt on the owner.
  const prompts = store.state.people.flatMap((p) => p.talkingPoints || [])
    .filter((t) => String(t).includes(MODEL_RULE_IDS.CHALLENGE));
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Blameless/);

  // 5. Typed lineage, and the claim still derives its posterior from the ledger.
  assert.ok(store.state.links.some((l) => l.sourceType === 'modelClaim' && l.relation === 'tests'));
  const after = buildModelGovernanceReport(store.state, NOW);
  assert.equal(after.claims.find((c) => c.id === claim.id).posteriorPct, 20);

  // 6. Audit trail names the rule.
  assert.ok(store.state.events.some((e) => e.type === 'model.challenge'));
  assert.ok(store.state.events.some((e) => e.summary.includes(MODEL_RULE_IDS.CHALLENGE)));
});

test('a repeated identical challenge on the same day is refused, not double-counted', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => NOW });
  store.seedDemo({ force: true });
  const api = createApi(store, { now: () => NOW });
  const payload = {
    claimId: 'clm-capital-model',
    observation: 'Same fact twice',
    direction: 'challenges',
    likelihoodRatio: 3,
  };
  assert.equal(api.recordModelChallenge(payload).ok, true);
  const second = api.recordModelChallenge(payload);
  assert.equal(second.ok, false);
  assert.match(second.error, /already recorded/i);
  assert.equal(store.state.modelChallenges.length, 1);
});

test('a second, different challenge opens a second decision instead of being swallowed', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => NOW });
  store.seedDemo({ force: true });
  const api = createApi(store, { now: () => NOW });
  const base = { claimId: 'clm-capital-model', direction: 'challenges', likelihoodRatio: 2 };
  assert.equal(api.recordModelChallenge({ ...base, observation: 'First independent fact' }).ok, true);
  assert.equal(api.recordModelChallenge({ ...base, observation: 'Second independent fact' }).ok, true);
  const governanceDecisions = store.state.decisions.filter((d) => d.source === 'model-governance');
  assert.equal(governanceDecisions.length, 2, 'each distinct challenge earns its own re-decision');
  assert.equal(store.state.modelChallenges.length, 2);
});

test('modelAutoPropagate:false suppresses follow-through but never the evidence', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => NOW });
  store.seedDemo({ force: true });
  const api = createApi(store, { now: () => NOW });
  api.updateSettings({ modelAutoPropagate: false });
  const decisionsBefore = store.state.decisions.length;
  const delegationsBefore = store.state.delegations.length;
  const result = api.recordModelChallenge({
    claimId: 'clm-capital-model',
    observation: 'Recorded while governance is paused',
    direction: 'challenges',
    likelihoodRatio: 2,
  });
  assert.equal(result.ok, true);
  assert.equal(store.state.modelChallenges.length, 1, 'the observation is still recorded');
  assert.equal(store.state.decisions.length, decisionsBefore, 'no re-decision while paused');
  assert.equal(store.state.delegations.length, delegationsBefore);
  // The posterior still moves: pausing governance cannot pause arithmetic.
  assert.equal(buildModelGovernanceReport(store.state, NOW).claims.find((c) => c.id === 'clm-capital-model').posteriorPct, 33.3);
});

test('the rule is registered on the shared spine and in the rule catalogue', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(modelGovernanceRule));
  const ids = AUTOMATION_RULES.map((r) => r.id);
  for (const id of [MODEL_RULE_IDS.SENSE, MODEL_RULE_IDS.CONFLICT, MODEL_RULE_IDS.CHALLENGE, MODEL_RULE_IDS.REFRESH]) {
    assert.ok(ids.includes(id), `${id} is missing from the catalogue`);
  }
  assert.equal(new Set(ids).size, ids.length, 'catalogue ids must stay unique');
  // The rule must not run on unrelated events.
  const draft = { modelChallenges: [], decisions: [], links: [], people: [] };
  assert.deepEqual(modelGovernanceRule(draft, { event: { type: 'case.created' }, now: NOW }), []);
  assert.deepEqual(modelGovernanceRule(null, {}), []);
});

test('refresh re-derives claims and writes only an audit entry', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => NOW });
  store.seedDemo({ force: true });
  const api = createApi(store, { now: () => NOW });
  const before = JSON.stringify({ claims: store.state.modelChallenges, decisions: store.state.decisions.length });
  const result = api.refreshModelGovernance();
  assert.equal(result.ok, true);
  assert.ok(result.claims > 0);
  assert.equal(JSON.stringify({ claims: store.state.modelChallenges, decisions: store.state.decisions.length }), before);
  assert.ok(store.state.events.some((e) => e.type === 'model.refresh'));
});

/* ------------------------------------------- 7. signals, insights, brief */

test('signals name the conflict, the refuted recommendation, and the unchallenged claims', () => {
  const report = buildModelGovernanceReport(demoState(), NOW);
  const signals = modelGovernanceSignals(report);
  assert.ok(signals.length >= 3);
  assert.ok(signals.every((s) => s.domain === 'Model governance'));
  assert.ok(signals.some((s) => s.ruleId === MODEL_RULE_IDS.CONFLICT && s.severity >= 4));
  assert.ok(signals.some((s) => s.ruleId === MODEL_RULE_IDS.CHALLENGE && s.severity === 1));
});

test('Insights merges the governance signals under its own domain', () => {
  const state = demoState();
  const insights = buildInsights(state, NOW);
  const governance = insights.findings.filter((f) => f.domain === 'Model governance');
  assert.ok(governance.length >= 3);
  assert.ok(governance.every((f) => String(f.ruleId).startsWith('RULE-MODEL')));
  assert.ok(insights.byDomain.some((d) => d.domain === 'Model governance'));
});

test('the brief composes every claim, conflict and counterfactual deterministically', () => {
  const report = buildModelGovernanceReport(demoState(), NOW);
  const brief = modelGovernanceBrief(report);
  assert.ok(brief.startsWith('# LEADOS — EVIDENCE GOVERNANCE'));
  assert.ok(brief.includes('What would change my mind'));
  assert.ok(brief.includes('Honest limits'));
  assert.ok(brief.includes('counterfactual:') || brief.includes('counterfactual'));
  assert.equal(brief, modelGovernanceBrief(buildModelGovernanceReport(demoState(), NOW)));
  assert.ok(brief.length > 1200);
});

test('CSV scope #41 exports claim telemetry with no free text', async () => {
  const { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } = await import('../../app/core/csv.js');
  const scope = CSV_EXPORTS.find((s) => s.key === 'models');
  assert.ok(scope, 'scope #41 is declared');
  const state = demoState();
  state.modelChallenges = [{
    id: 'm1', claimId: 'clm-capital-model', observation: 'SECRET OBSERVATION TEXT',
    direction: 'challenges', likelihoodRatio: 4, sourceType: 'leader-observation',
    sourceId: null, cycle: 0, recordedOn: TODAY, createdOn: TODAY, createdAt: NOW.toISOString(),
  }];
  const result = exportWorkspaceCsv(state, 'models', { now: NOW });
  assert.equal(result.ok, true, result.error || '');
  const csv = result.csv ?? result.text ?? '';
  assert.ok(csv.length > 0, 'the scope produces a file');
  assert.ok(!csv.includes('SECRET OBSERVATION TEXT'), 'observations are never exported');
  assert.ok(!csv.includes('Signing-service'), 'claim statements are never exported');
  assert.ok(!csv.includes('Capital allocation model'), 'subject labels are never exported');
  const table = parseCsv(csv);
  assert.ok(table.rows.length >= 10);
  for (const cell of Object.values(table.rows[0])) {
    assert.equal(String(cell).includes('SECRET'), false);
  }
});

/* --------------------------------------------------------------- 8. UI */

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

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

const waitFor = async (fn, { timeout = 5000, interval = 25 } = {}) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, interval));
  }
};

test('ui: #/models renders every tab and passes axe-core', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.store.seedDemo({ force: true });
    app.navigate('#/models');
    const view = env.document.querySelector('#view');
    assert.ok(await waitFor(() => view.textContent.includes('What is this number worth?')), 'header renders');

    const tabs = ['register', 'conflicts', 'challenges', 'method', 'brief'];
    for (const tab of tabs) {
      app.navigate(`#/models?tab=${tab}`);
      assert.ok(await waitFor(() => {
        const text = env.document.querySelector('#view').textContent;
        return tab === 'register' ? text.includes('Claim register')
          : tab === 'conflicts' ? text.includes('Criterion')
            : tab === 'challenges' ? text.includes('append-only ledger')
              : tab === 'method' ? text.includes('The one trust ladder')
                : text.includes('EVIDENCE GOVERNANCE');
      }), `tab ${tab} renders`);
      const violations = await axeViolations(env);
      assert.deepEqual(violations, [], `axe violations on ${tab}: ${violations.join('; ')}`);
    }
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app.destroy?.();
  }
});

test('ui: the challenge dialog previews the posterior and records a real challenge', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.store.seedDemo({ force: true });
    app.navigate('#/models?tab=register');
    assert.ok(await waitFor(() => env.document.querySelector('#view').textContent.includes('Claim register')));
    assert.ok(env.document.querySelector('#view').textContent.includes('Refuted'),
      'the demo model is graded Refuted, and the page says so');

    const challengeButtons = [...env.document.querySelectorAll('#view button')]
      .filter((b) => b.textContent.trim() === 'Challenge');
    assert.ok(challengeButtons.length > 0, 'at least one claim can be challenged');
    challengeButtons[0].click();

    const dialog = await waitFor(() => env.document.querySelector('[role="dialog"]'));
    assert.ok(dialog, 'dialog opens');
    const dialogText = env.document.querySelector('[role="dialog"]').textContent;
    assert.match(dialogText, /does not rewrite anything/);
    assert.match(dialogText, /Neutral prior/);

    // The preview must move when the ratio changes.
    const ratio = env.document.querySelector('#mch-ratio');
    assert.ok(ratio);
    const before = env.document.querySelector('[role="dialog"]').textContent;
    ratio.value = '10';
    ratio.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    const after = env.document.querySelector('[role="dialog"]').textContent;
    assert.notEqual(before, after, 'the posterior preview reacts to the declared ratio');

    const observation = env.document.querySelector('#mch-observation');
    observation.value = 'Two checkpoint predictions missed by more than a week.';
    const record = [...env.document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.trim() === 'Record challenge');
    assert.ok(record);
    record.click();

    assert.ok(await waitFor(() => app.store.state.modelChallenges.length === 1), 'the challenge is stored');
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app.destroy?.();
  }
});

test('ui: an empty workspace shows an honest empty register, not a blank page', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.navigate('#/models');
    assert.ok(await waitFor(() => {
      const text = env.document.querySelector('#view').textContent;
      return text.includes('No registered claims yet') || text.includes('What is this number worth?');
    }));
    const text = env.document.querySelector('#view').textContent;
    assert.ok(text.includes('No registered claims yet'), `empty state missing: ${text.slice(0, 200)}`);
    const violations = await axeViolations(env);
    assert.deepEqual(violations, []);
    assert.deepEqual(env.consoleErrors, []);
  } finally {
    app.destroy?.();
  }
});

test('the engine version is stamped so a stored claim cannot masquerade as a newer one', () => {
  assert.equal(MODEL_ENGINE_VERSION, 'model-governance-2026.10-v1');
  assert.deepEqual(MODEL_CHALLENGE_DIRECTIONS, ['supports', 'challenges']);
});
