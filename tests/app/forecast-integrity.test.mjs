/**
 * tests/app/forecast-integrity.test.mjs — Session 41 (Schema v26).
 *
 * Proves the Forecast Integrity Terminal is real, not a dashboard mock:
 *   1. conformal band maths, sign test, zero-actual handling and n floor
 *   2. typed prediction atoms across seven ledgers with unit segmentation
 *   3. additive v25→v26 migration, repair-not-reject normalization, settings
 *   4. generalized post-commit propagation from a budget outcome into open
 *      forecasts in another module, DACI decisions, typed graph links, audit
 *      events and idempotency — with source estimates never rewritten
 *   5. challenge responses, pause/resume, measurement-gap delegation, signals
 *   6. purpose-limited formula-safe CSV, clearDemo/rewind parity
 *   7. JSDOM + axe-core UI rendering and the response dialog
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  FORECAST_ADAPTERS,
  FORECAST_INTEGRITY_RULES,
  FORECAST_MIN_SAMPLES,
  bandForForecast,
  buildForecastAtoms,
  conformalBand,
  forecastChallengeCandidates,
  forecastIntegrityReport,
  forecastIntegrityRule,
  forecastIntegritySignals,
  ratioSignTest,
} from '../../app/core/domain/forecastIntegrity.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DOMAIN_ORDER, buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildDemoState } from '../../app/core/demo.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function harness(options = {}) {
  let seq = 0;
  const storage = options.storage || memStorage();
  const idFactory = (prefix) => `${prefix}-fi-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...options.storeOptions });
  store.load();
  return { store, storage, api: createApi(store, { now: () => NOW, idFactory }) };
}

function settledLine(api, budgetId, index, actual = 150) {
  const line = api.addBudgetLine(budgetId, {
    title: `Settled commitment ${index}`,
    status: 'committed',
    committedAmount: 100,
  });
  assert.equal(line.ok, true, line.error);
  const recorded = api.recordBudgetActual(budgetId, line.lineId, {
    actualAmount: actual,
    spentOn: '2026-10-20',
  });
  assert.equal(recorded.ok, true, recorded.error);
  return { line, recorded };
}

/** A real, biased workspace with open forecasts in two different modules. */
function biasedWorkspace() {
  const h = harness();
  const person = h.api.addPerson({ name: 'Ada', startDate: '2025-01-01' });
  assert.equal(person.ok, true, person.error);
  const budget = h.api.addBudget({ name: 'Operations', currency: 'USD', limit: 100000 });
  assert.equal(budget.ok, true, budget.error);
  const openLine = h.api.addBudgetLine(budget.id, {
    title: 'Open commitment',
    status: 'committed',
    committedAmount: 100,
  });
  assert.equal(openLine.ok, true, openLine.error);
  const portfolio = h.api.addPortfolioItem({
    title: 'Migration work',
    kind: 'project',
    effortDays: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    decision: 'funded',
    createdOn: '2026-10-10',
  });
  assert.equal(portfolio.ok, true, portfolio.error);
  let fifth = null;
  for (let i = 0; i < 5; i += 1) fifth = settledLine(h.api, budget.id, i);
  return { ...h, person, budget, openLine, portfolio, fifth };
}

function challengeFixture(over = {}) {
  return {
    id: 'fc-fixture',
    atomKey: 'budgetCommitment:bud-1:line-1:amount',
    classKey: 'ratio:budget-commitment:USD',
    ledger: 'budgetCommitment',
    quantity: 'amount',
    sourceType: 'budget',
    sourceId: 'bud-1',
    sourceRoute: '#/finance/bud-1',
    title: 'Fixture commitment',
    recordedForecast: 100,
    unit: 'USD',
    medianRatio: 1.5,
    bandLow: 50,
    bandHigh: 150,
    coverageBound: 0.8333,
    coverageTarget: 0.8,
    evidenceN: 5,
    signP: 0.0625,
    confidence: 'medium',
    status: 'open',
    ruleId: 'RULE-FCI-01',
    createdOn: '2026-10-20',
    createdAt: '2026-10-20T10:00:00.000Z',
    ...over,
  };
}

/* ============================================================ 1. statistics */

test('conformal band: counts-only below n=5, then finite-sample quantile with explicit coverage bound', () => {
  const atoms = (ratios) => ratios.map((ratio) => ({ ratio }));
  const thin = conformalBand(atoms([1.5, 1.4, 1.3, 1.6]));
  assert.equal(thin.sufficient, false);
  assert.equal(thin.n, 4);
  assert.equal(thin.q, null);
  assert.match(thin.reason, /Counts only/);

  const band = conformalBand(atoms([1.5, 1.4, 1.3, 1.6, 1.2]), { coverage: 0.8 });
  assert.equal(band.sufficient, true);
  assert.equal(band.n, 5);
  assert.equal(band.k, 5, 'ceil((5+1)*0.8) = 5');
  assert.equal(band.q, 0.6, 'largest absolute relative residual');
  assert.equal(band.lowFactor, 0.4);
  assert.equal(band.highFactor, 1.6);
  assert.equal(band.coverageBound, 0.8333);
  const applied = bandForForecast(band, 100);
  assert.deepEqual(applied, { low: 40, central: 100, high: 160, coverageBound: 0.8333, evidenceN: 5 });
});

test('conformal band: a zero actual is representable, not silently discarded', () => {
  const band = conformalBand([0, 0.8, 1.1, 1.2, 1.3].map((ratio) => ({ ratio })));
  assert.equal(band.n, 5, 'zero actual contributes a residual of 1');
  assert.equal(band.q, 1);
  assert.equal(band.lowFactor, 0);
  assert.equal(band.highFactor, 2);
});

test('ratioSignTest: exact two-sided binomial p-values and tie handling', () => {
  assert.deepEqual(ratioSignTest([1.2, 1.3, 1.4, 1.5, 1.6]), { n: 5, greater: 5, less: 0, p: 0.0625 });
  const mixed = ratioSignTest([1.2, 0.8, 1.4, 0.9, 1.1, 1]);
  assert.equal(mixed.greater, 3);
  assert.equal(mixed.less, 2);
  assert.equal(mixed.n, 5, 'exact ties are excluded from the sign-test denominator');
  assert.ok(mixed.p > 0.5);
});

/* ============================================================== 2. adapters */

test('adapter registry spans seven forecast ledgers and never reads conflicts or pulses', () => {
  const ids = FORECAST_ADAPTERS.map((a) => a.id);
  for (const id of ['decisionProbability', 'portfolioEffort', 'caseLedger', 'budgetCommitment', 'negotiationValue']) {
    assert.ok(ids.includes(id), `${id} adapter registered`);
  }
  const state = {
    ...createEmptyState(NOW.toISOString()),
    conflicts: [{ id: 'conf-secret', title: 'Private mediation' }],
    pulses: [{ id: 'pulse-anon', scores: { safety: 1 } }],
  };
  const atoms = buildForecastAtoms(state);
  assert.equal(atoms.length, 0);
  assert.ok(atoms.every((a) => !['conflict', 'pulse'].includes(a.sourceType)));
  const report = forecastIntegrityReport(state, NOW);
  assert.equal(report.verdict.id, 'collecting');
  assert.equal(report.global.band.sufficient, false);
});

test('decision probabilities are scored with Brier/Murphy and never enter the ratio band', () => {
  const h = harness();
  for (let i = 0; i < 5; i += 1) {
    const made = h.api.addDecision({
      title: `Call ${i}`,
      date: '2026-09-01',
      chosen: 'Proceed',
      rationale: 'Evidence on hand',
      forecastProbability: 80,
    });
    assert.equal(made.ok, true, made.error);
    const reviewed = h.api.reviewDecision(made.id, {
      outcome: i < 2 ? 'bad' : 'good',
      outcomeNotes: 'Reviewed against recorded outcome',
      reviewedOn: '2026-10-01',
    });
    assert.equal(reviewed.ok, true, reviewed.error);
  }
  const report = forecastIntegrityReport(h.store.state, NOW);
  assert.equal(report.probability.n, 5);
  assert.equal(report.probability.sufficient, true);
  assert.equal(report.probability.brier, 0.28, 'three good at 0.8 and two bad at 0.8');
  assert.equal(report.global.n, 0, 'probability outcomes are not pooled with magnitudes');
  assert.equal(report.atoms.filter((a) => a.family === 'probability').length, 5);
  assert.match(report.boardBrief, /Decision forecasts: Brier/);
});

test('reference classes stay segmented by quantity, currency and deal direction; no FX or zero-fill', () => {
  const state = {
    ...createEmptyState(NOW.toISOString()),
    budgets: [
      { id: 'bud-usd', name: 'USD', currency: 'USD', limit: null, status: 'active', lines: [{ id: 'l1', title: 'USD spend', status: 'spent', committedAmount: 100, actualAmount: 150, spentOn: '2026-10-20' }], createdAt: NOW.toISOString() },
      { id: 'bud-eur', name: 'EUR', currency: 'EUR', limit: null, status: 'active', lines: [{ id: 'l2', title: 'EUR spend', status: 'spent', committedAmount: 100, actualAmount: 160, spentOn: '2026-10-21' }], createdAt: NOW.toISOString() },
    ],
    negotiations: [{ id: 'neg-1', title: 'Vendor', status: 'agreed', stakesValue: 100, stakesCurrency: 'USD', dealDirection: 'maximize', openedOn: '2026-09-01', closedOn: '2026-09-10', settlement: { settledOn: '2026-10-01', realisedValue: 80, counterpartyDelivered: true, note: '' }, createdAt: NOW.toISOString() }],
  };
  const normalized = normalizeState(state, { now: NOW }).state;
  const report = forecastIntegrityReport(normalized, NOW);
  const keys = report.classes.map((c) => c.key);
  assert.ok(keys.includes('ratio:budget-commitment:USD'));
  assert.ok(keys.includes('ratio:budget-commitment:EUR'));
  assert.ok(keys.includes('ratio:negotiation-value:maximize:USD'));
  assert.ok(!keys.some((k) => k.includes('EUR:USD')));
  for (const cls of report.classes) {
    assert.equal(cls.sufficient, false, 'each segmented cohort stays counts-only below n=5');
    assert.equal(cls.medianRatio, null);
  }
  assert.equal(report.missingActuals.length, 0, 'explicit actuals are not gaps');
  assert.match(report.boardBrief, /no external model or invoice verification/);
});

test('missing actuals are visible gaps and never become synthetic zero outcomes', () => {
  const h = harness();
  const budget = h.api.addBudget({ name: 'Gaps', currency: 'USD', limit: 10000 });
  for (let i = 0; i < 3; i += 1) {
    const line = h.api.addBudgetLine(budget.id, {
      title: `Spent without actual ${i}`,
      status: 'spent',
      committedAmount: 100,
      spentOn: '2026-10-20',
    });
    assert.equal(line.ok, true, line.error);
  }
  const report = forecastIntegrityReport(h.store.state, NOW);
  assert.equal(report.missingActuals.length, 3);
  assert.equal(report.scored.length, 0);
  assert.equal(report.global.n, 0);
  assert.match(report.boardBrief, /Measurement gaps/);
});

/* =============================================================== 3. schema */

test('migration v25→v26 is additive, preserves challenges and installs settings defaults', () => {
  assert.equal(SCHEMA_VERSION, 51);
  const old = {
    schemaVersion: 25,
    decisions: [{ id: 'keep-me', title: 'Old decision' }],
    forecastChallenges: [{ id: 'fc-old', title: 'Existing challenge' }],
  };
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, 51);
  assert.deepEqual(migrated.applied, ['25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51']);
  assert.deepEqual(migrated.raw.decisions, old.decisions);
  assert.deepEqual(migrated.raw.forecastChallenges, old.forecastChallenges);
  const state = normalizeState({ schemaVersion: 25 }, { now: NOW }).state;
  assert.equal(state.settings.forecastAutoPropagate, true);
  assert.equal(state.settings.forecastCoveragePct, 80);
  assert.deepEqual(state.forecastChallenges, []);
});

test('normalizer repairs challenge enums and drops challenges whose source no longer exists', () => {
  const state = {
    ...createEmptyState(NOW.toISOString()),
    budgets: [{ id: 'bud-live', name: 'Live', currency: 'USD', limit: null, status: 'active', lines: [], createdAt: NOW.toISOString() }],
    forecastChallenges: [
      challengeFixture({ id: 'fc-good', sourceId: 'bud-live', status: 'unknown', bandScope: 'unknown' }),
      challengeFixture({ id: 'fc-dangling', sourceId: 'bud-gone' }),
      challengeFixture({ id: 'fc-no-forecast', sourceId: 'bud-live', recordedForecast: null }),
    ],
  };
  const { state: normalized, warnings } = normalizeState(state, { now: NOW });
  assert.equal(normalized.forecastChallenges.length, 1);
  assert.equal(normalized.forecastChallenges[0].id, 'fc-good');
  assert.equal(normalized.forecastChallenges[0].status, 'open');
  assert.equal(normalized.forecastChallenges[0].bandScope, 'class');
  assert.ok(warnings.some((w) => /unrecognised response status/.test(w)));
  assert.ok(warnings.some((w) => /dropped a challenge/.test(w)));
});

test('rule catalog exposes four FCI rules and the generalized post-commit hook records failures', () => {
  assert.equal(FORECAST_INTEGRITY_RULES.length, 4);
  assert.equal(AUTOMATION_RULES.length, 119, '+ LCS rules');
  for (const id of ['RULE-FCI-01', 'RULE-FCI-02', 'RULE-FCI-03', 'RULE-FCI-04']) {
    assert.ok(AUTOMATION_RULES.some((r) => r.id === id));
  }
  const h = harness({ storeOptions: { postCommitRules: [() => { throw new Error('deliberate rule fault'); }] } });
  h.store.update(() => {}, { type: 'forecast.scan', entity: 'workspace', summary: 'Rule error probe' });
  assert.ok(h.store.state.events.some((e) => e.type === 'automation.rule_error'));
  assert.ok(h.store.warnings.some((w) => /deliberate rule fault/.test(w)));
});

/* =============================================== 4. cross-module propagation */

test('RULE-FCI-01/02: one budget settlement event cascades into cross-module challenges, DACI decisions, links and audit events', () => {
  const h = biasedWorkspace();
  const challenges = h.store.state.forecastChallenges;
  assert.equal(challenges.length, 2, 'one class-specific budget challenge + one low-confidence portfolio challenge');
  const byTitle = new Map(challenges.map((c) => [c.title, c]));
  const budgetChallenge = byTitle.get('Open commitment');
  const portfolioChallenge = byTitle.get('Migration work');
  assert.ok(budgetChallenge && portfolioChallenge);
  assert.equal(budgetChallenge.classKey, 'ratio:budget-commitment:USD');
  assert.equal(budgetChallenge.bandScope, 'class');
  assert.equal(budgetChallenge.confidence, 'medium');
  assert.equal(portfolioChallenge.classKey, 'global:mixed-quantity');
  assert.equal(portfolioChallenge.bandScope, 'mixed-quantity-global');
  assert.equal(portfolioChallenge.confidence, 'low');
  assert.equal(budgetChallenge.recordedForecast, 100);
  assert.equal(budgetChallenge.referenceClassCentral, 150);
  assert.deepEqual([budgetChallenge.bandLow, budgetChallenge.bandHigh], [50, 150]);

  const decisions = h.store.state.decisions.filter((d) => d.title.startsWith('Forecast re-baseline'));
  assert.equal(decisions.length, 2, 'exactly one open DACI decision per challenged class');
  assert.ok(decisions.some((d) => d.question.includes('[RULE-FCI-02:ratio:budget-commitment:USD]')));
  assert.ok(decisions.some((d) => d.options.some((o) => /conformal upper bound/.test(o.label))));

  assert.equal(h.store.state.links.filter((l) => l.relation === 'forecasts').length, 2, 'typed forecast→source edges');
  assert.equal(h.store.state.links.filter((l) => l.ruleId === 'RULE-FCI-02').length, 2, 'decision→source edges');
  assert.ok(h.store.state.events.filter((e) => e.summary.includes('[RULE-FCI-01]')).length >= 2);
  assert.ok(h.store.state.events.some((e) => e.summary.includes('[RULE-FCI-02]')));
  assert.ok(resolveLinkedEntity(h.store.state, 'forecast', budgetChallenge.id));
  assert.equal(resolveLinkedEntity(h.store.state, 'forecast', budgetChallenge.id).route, `#/forecasts?tab=challenges&challenge=${encodeURIComponent(budgetChallenge.id)}`);

  // The source estimates were never rewritten by the outside view.
  const openBudgetLine = h.store.state.budgets[0].lines.find((l) => l.id === h.openLine.lineId);
  assert.equal(openBudgetLine.committedAmount, 100);
  assert.equal(openBudgetLine.actualAmount, null);
  assert.equal(h.store.state.portfolio[0].effortDays.mostLikely, 3);
  assert.equal(h.store.state.portfolio[0].actualEffortDays, null);
});

test('post-commit propagation is idempotent and respects a workspace pause while an explicit scan still works', () => {
  const h = biasedWorkspace();
  const before = {
    challenges: h.store.state.forecastChallenges.length,
    decisions: h.store.state.decisions.length,
    links: h.store.state.links.length,
  };
  const second = h.api.syncForecastIntegrity();
  assert.equal(second.ok, true);
  assert.equal(second.created, 0);
  assert.equal(h.store.state.forecastChallenges.length, before.challenges);
  assert.equal(h.store.state.decisions.length, before.decisions);
  assert.equal(h.store.state.links.length, before.links);

  const paused = harness();
  assert.equal(paused.api.updateSettings({ forecastAutoPropagate: false }).ok, true);
  const person = paused.api.addPerson({ name: 'Grace', startDate: '2025-01-01' });
  assert.equal(person.ok, true);
  const budget = paused.api.addBudget({ name: 'Paused', currency: 'USD', limit: 100000 });
  paused.api.addBudgetLine(budget.id, { title: 'Open', status: 'committed', committedAmount: 100 });
  for (let i = 0; i < 5; i += 1) settledLine(paused.api, budget.id, i);
  assert.equal(paused.store.state.forecastChallenges.length, 0, 'outcome events do not write while paused');
  const explicit = paused.api.syncForecastIntegrity();
  assert.equal(explicit.ok, true);
  assert.ok(explicit.created >= 1, 'the leader-initiated scan explicitly overrides the pause');
  assert.equal(paused.api.updateSettings({ forecastAutoPropagate: 'yes' }).ok, false);
});

test('RULE-FCI-03: three missing actuals open exactly one blameless measurement-recovery delegation', () => {
  const h = harness();
  h.api.addPerson({ name: 'Ada', startDate: '2025-01-01' });
  const budget = h.api.addBudget({ name: 'Gaps', currency: 'USD', limit: 10000 });
  for (let i = 0; i < 3; i += 1) {
    const line = h.api.addBudgetLine(budget.id, {
      title: `Spent without actual ${i}`,
      status: 'spent',
      committedAmount: 100,
      spentOn: '2026-10-20',
    });
    assert.equal(line.ok, true, line.error);
  }
  const result = h.api.syncForecastIntegrity();
  assert.equal(result.ok, true);
  const delegations = h.store.state.delegations.filter((d) => d.support.includes('[RULE-FCI-03]'));
  assert.equal(delegations.length, 1);
  assert.match(delegations[0].support, /Blameless measurement recovery/);
  h.api.syncForecastIntegrity();
  assert.equal(h.store.state.delegations.filter((d) => d.support.includes('[RULE-FCI-03]')).length, 1);
});

test('challenge responses are validated, append-only and never rewrite source forecasts', () => {
  const h = biasedWorkspace();
  const challenge = h.store.state.forecastChallenges[0];
  const sourceBefore = JSON.stringify({ budgets: h.store.state.budgets, portfolio: h.store.state.portfolio });
  assert.equal(h.api.respondForecastChallenge(challenge.id, { response: 'unknown' }).ok, false);
  assert.equal(h.api.respondForecastChallenge(challenge.id, { response: 'dismissed', note: '' }).ok, false);
  const accepted = h.api.respondForecastChallenge(challenge.id, {
    response: 'accepted',
    note: 'Use the outside view for the next planning round.',
  });
  assert.equal(accepted.ok, true);
  const saved = h.store.state.forecastChallenges.find((c) => c.id === challenge.id);
  assert.equal(saved.status, 'accepted');
  assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].action, 'accepted');
  assert.equal(saved.respondedOn, '2026-10-26');
  assert.equal(sourceBefore, JSON.stringify({ budgets: h.store.state.budgets, portfolio: h.store.state.portfolio }));
  assert.equal(h.api.respondForecastChallenge(challenge.id, { response: 'adapted' }).ok, false, 'a second response is refused');
  const scan = h.api.syncForecastIntegrity();
  assert.equal(scan.created, 0, 'a dismissed/accepted atom is not reopened by new evidence of the same version');
  assert.ok(h.store.state.events.some((e) => e.summary.includes('recorded estimate unchanged')));
});

test('forecastIntegrityRule also runs when an action explicitly declares the rule set', () => {
  const h = biasedWorkspace();
  const draft = JSON.parse(JSON.stringify(h.store.state));
  draft.forecastChallenges = [];
  draft.settings.forecastAutoPropagate = true;
  let seq = 0;
  const result = forecastIntegrityRule(draft, {
    event: { type: 'custom.module.outcome', rules: ['forecastIntegrity'] },
    now: NOW,
    idFactory: (p) => `${p}-declared-${++seq}`,
    logEvent: () => {},
  });
  assert.ok(result.length >= 2);
  assert.ok(draft.forecastChallenges.length >= 2);
});

/* ====================================================== 5. signals & settings */

test('FI-01..05 signals appear when evidence supports them; demo baseline stays silent', () => {
  const demo = normalizeState(buildDemoState(NOW), { now: NOW }).state;
  assert.deepEqual(forecastIntegritySignals(demo, NOW), [], 'healthy demo fires no FI signal');
  assert.deepEqual(buildInsights(demo, NOW).findings.filter((f) => String(f.ruleId).startsWith('FI-')), []);
  assert.ok(DOMAIN_ORDER.includes('Forecast integrity'));

  const h = biasedWorkspace();
  const codes = forecastIntegritySignals(h.store.state, NOW).map((f) => f.ruleId);
  assert.ok(codes.includes('FI-01'));
  assert.ok(codes.includes('FI-02'));
  const insights = buildInsights(h.store.state, NOW);
  assert.ok(insights.findings.some((f) => f.ruleId === 'FI-02' && f.action.route === '#/forecasts?tab=challenges'));
});

test('coverage target is a validated, recomputed workspace convention', () => {
  const h = biasedWorkspace();
  assert.equal(h.api.updateSettings({ forecastCoveragePct: 40 }).ok, false);
  assert.equal(h.api.updateSettings({ forecastCoveragePct: 90 }).ok, true);
  const report = forecastIntegrityReport(h.store.state, NOW);
  assert.equal(report.coverageTarget, 0.9);
  assert.equal(report.global.band.coverageTarget, 0.9);
});

/* =============================================================== 6. CSV */

test('forecasts CSV scope #26 round-trips all row types and neutralizes formula strings', () => {
  const h = biasedWorkspace();
  const sourceId = h.budget.id;
  h.store.state.forecastChallenges.push(challengeFixture({
    id: 'fc-formula',
    sourceId,
    title: '=SUM(A1:A9)',
    status: 'accepted',
    responseNote: '@SUM(B1:B9)',
    createdOn: '2026-10-24',
  }));
  h.api.addBudgetLine(h.budget.id, {
    title: 'Missing actual',
    status: 'spent',
    committedAmount: 100,
    spentOn: '2026-10-20',
  });
  assert.equal(CSV_EXPORTS.length, 45);
  const descriptor = CSV_EXPORTS.find((d) => d.key === 'forecasts');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, false);
  const result = exportWorkspaceCsv(h.store.state, 'forecasts', { now: NOW });
  assert.equal(result.ok, true, result.error);
  const parsed = parseCsv(result.csv);
  assert.equal(parsed.headers.length, result.columnCount);
  assert.equal(parsed.rows.length, result.rowCount);
  const idx = Object.fromEntries(parsed.headers.map((header, i) => [header, i]));
  const types = new Set(parsed.rows.map((row) => row[idx.row_type]));
  for (const type of ['atom', 'class', 'missing_actual', 'challenge', 'brief']) {
    assert.ok(types.has(type), `${type} rows are present`);
  }
  const titles = parsed.rows.map((row) => row[idx.title]);
  assert.ok(titles.some((t) => t.startsWith("'=SUM")), 'CWE-1236 formula prefix neutralized');
  assert.ok(!result.csv.includes('Private mediation'));
  assert.ok(!result.csv.includes('anonymous-pulse-person'));
});

/* ================================================ 7. lifecycle parity */

test('clearDemo removes challenges attached to demo sources and keeps user-derived challenges', () => {
  const storage = memStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(buildDemoState(NOW)));
  let seq = 0;
  const idFactory = (p) => `${p}-fixture-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  const demoBudget = store.state.budgets[0];
  assert.ok(demoBudget);
  const userBudget = api.addBudget({ name: 'Real envelope', currency: 'USD', limit: 10000 });
  assert.equal(userBudget.ok, true, userBudget.error);
  store.state.forecastChallenges.push(
    challengeFixture({ id: 'fc-demo-source', sourceId: demoBudget.id }),
    challengeFixture({ id: 'fc-user-source', sourceId: userBudget.id, atomKey: 'user' }),
  );
  store.clearDemo();
  const ids = store.state.forecastChallenges.map((c) => c.id);
  assert.ok(!ids.includes('fc-demo-source'));
  assert.ok(ids.includes('fc-user-source'));
});

test('point-in-time rewind removes later challenges and responses with an explicit fidelity note', () => {
  const h = biasedWorkspace();
  const challenge = h.store.state.forecastChallenges[0];
  challenge.createdOn = '2026-10-20';
  challenge.createdAt = '2026-10-20T10:00:00.000Z';
  challenge.status = 'accepted';
  challenge.respondedOn = '2026-10-25';
  challenge.responseNote = 'Accepted after review';
  challenge.history = [{ id: 'h1', on: '2026-10-25', action: 'accepted' }];
  const beforeResponse = reconstructStateAt(h.store.state, '2026-10-22', { currentDay: '2026-10-26' });
  const rewound = beforeResponse.state.forecastChallenges.find((c) => c.id === challenge.id);
  assert.ok(rewound);
  assert.equal(rewound.status, 'open');
  assert.equal(rewound.responseNote, '');
  assert.equal(beforeResponse.fidelity.forecastIntegrity.level, 'approximate');
  const beforeCreation = reconstructStateAt(h.store.state, '2026-10-15', { currentDay: '2026-10-26' });
  assert.ok(!beforeCreation.state.forecastChallenges.some((c) => c.id === challenge.id));
});

/* =================================================================== 8. UI */

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
  const style = window.document.createElement('style');
  style.textContent = CSS;
  window.document.head.appendChild(style);
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'FileReader', 'localStorage']) {
    globalThis[key] = window[key];
  }
  return { dom, window, document: window.document, consoleErrors };
}

async function withApp(fn) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeIds(env, node) {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const result = await env.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(result.violations).map((v) => v.id);
}

test('UI: #/forecasts renders every tab, the board brief and passes axe-core', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    for (const tab of ['overview', 'ledgers', 'classes', 'challenges', 'brief']) {
      app.navigate(tab === 'overview' ? '#/forecasts' : `#/forecasts?tab=${tab}`);
      await flush();
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.includes('Forecast integrity'), `${tab} tab renders`);
      assert.deepEqual(await axeIds(env, view), [], `zero axe violations on ${tab} tab`);
    }
    app.navigate('#/forecasts?tab=brief');
    await flush();
    const brief = env.document.querySelector('.fi-brief');
    assert.ok(brief);
    assert.match(brief.textContent, /FORECAST INTEGRITY BRIEF/);
    assert.match(brief.textContent, /exchangeability/i);
    assert.deepEqual(env.consoleErrors, []);
  });
});

test('UI: outside-view response dialog is labelled, writes through the API and is axe-clean', async () => {
  await withApp(async (app, env) => {
    const person = app.api.addPerson({ name: 'Ada', startDate: '2025-01-01' });
    assert.equal(person.ok, true, person.error);
    const budget = app.api.addBudget({ name: 'Operations', currency: 'USD', limit: 100000 });
    app.api.addBudgetLine(budget.id, { title: 'Open commitment', status: 'committed', committedAmount: 100 });
    for (let i = 0; i < 5; i += 1) {
      const line = app.api.addBudgetLine(budget.id, { title: `Settled ${i}`, status: 'committed', committedAmount: 100 });
      app.api.recordBudgetActual(budget.id, line.lineId, { actualAmount: 150, spentOn: '2026-10-20' });
    }
    app.api.syncForecastIntegrity();
    app.navigate('#/forecasts?tab=challenges');
    await flush();
    const respond = [...env.document.querySelectorAll('#view button')].find((b) => b.textContent.trim() === 'Respond');
    assert.ok(respond, 'an open challenge has a Respond action');
    respond.click();
    await flush();
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.ok(dialog.textContent.includes('Recorded'));
    assert.deepEqual(await axeIds(env, dialog), [], 'zero axe violations in the response dialog');
    const select = dialog.querySelector('#forecast-response');
    const note = dialog.querySelector('#forecast-response-note');
    assert.ok(select && note);
    select.value = 'accepted';
    note.value = 'Plan against the observed reference class for the next commitment.';
    const save = [...dialog.querySelectorAll('button')].find((b) => b.textContent.includes('Save response'));
    assert.ok(save);
    save.click();
    await flush();
    assert.ok(app.store.state.forecastChallenges.some((c) => c.status === 'accepted'));
    assert.equal(app.store.state.budgets[0].lines.find((l) => l.title === 'Open commitment').committedAmount, 100);
    assert.deepEqual(env.consoleErrors, []);
  });
});
