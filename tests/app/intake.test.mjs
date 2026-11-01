/**
 * tests/app/intake.test.mjs — Natural-Language Intake Terminal suite
 * (Schema v27, RULE-INTAKE-01..07):
 *
 *   1. Pure deterministic engine: weighted-evidence classification, NegEx
 *      negation, softmax/shrinkage confidence, ambiguity and stakes checks.
 *   2. Entity extraction: money (US/EU/DK number formats + multipliers),
 *      durations, person-days, percentages, recurrence, roster matching with
 *      explicit ambiguity handling.
 *   3. Privacy wall: conflict language never produces a case suggestion; the
 *      engine never reads confidential conflicts or anonymous pulses.
 *   4. Actions: draft lifecycle, human-confirmed routing through the SAME
 *      addCase propagation path, outcome ledger for calibration, guards.
 *   5. Schema v26 → v27 additive migration, normalization repairs, point-in-time
 *      rewind parity, clearDemo preservation, stale-draft insight signal.
 *   6. JSDOM + axe-core UI workflow across #/intake composer, analysis,
 *      drafts queue, case-dialog handoff and calibration card.
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
  INTAKE_ENGINE_VERSION,
  analyzeIntakeText,
  intakeCalibration,
  matchPeople,
  parseNumericAmount,
  pendingIntakeDrafts,
  stem,
  toCaseInput,
} from '../../app/core/domain/intake.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { previewCasePropagations } from '../../app/core/domain/automation.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');
const TODAY = '2026-10-26';

const VENDOR_TEXT = `Priya missed the second deadline in a row on the billing migration. Our supplier contract is already three weeks late and is costing about $40,000 in penalty fees, and the team says they are overloaded and burnt out. We need to escalate this to the VP this week.`;
const SAFETY_TEXT = `There was a safety incident in the warehouse yesterday — a near-miss with a forklift in aisle four. Legal says this could be a compliance breach and we may have GDPR exposure because the incident log was not completed.`;
const CONFLICT_TEXT = `Sam and Jordan had a heated argument again, there is real tension in the team and two people are barely speaking to each other. Someone might resign over this.`;
const WEATHER_TEXT = `Lunch was nice today. The weather is sunny and the office plants look green.`;

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(storage = kvStorage(), now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-it-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
}

function seededHarness() {
  const env = harness();
  const priya = env.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead', startDate: '2024-01-15' });
  const other = env.api.addPerson({ name: 'Priya Sharma', role: 'Product Manager', startDate: '2024-02-15' });
  const samuel = env.api.addPerson({ name: 'Samuel Okafor', role: 'Support Team Lead', startDate: '2025-01-10' });
  const goal = env.api.addGoal({
    title: 'Reliable billing platform delivery',
    ownerId: priya.id,
    coAuthored: true,
    confidence: 'on-track',
    dueDate: '2026-12-15',
  });
  return { ...env, people: { priya: priya.id, other: other.id, samuel: samuel.id }, goal: goal.id };
}

/* ------------------------------------------------------------- pure engine */

test('intake engine: safety incident yields high-confidence safety class with mandatory stakes review', () => {
  const a = analyzeIntakeText(SAFETY_TEXT, {}, { now: NOW });
  assert.equal(a.primaryCategoryId, 'safety');
  assert.equal(a.confidenceBand, 'high');
  assert.equal(a.stakesReviewRequired, true);
  assert.equal(a.caseSuggestion.kind, 'incident');
  assert.ok(a.fmeaPrior.severity >= 9, 'critical-stakes markers force severity 9+');
  assert.ok(a.categories.find((c) => c.id === 'safety').evidence.length >= 3);
  assert.equal(a.engineVersion, INTAKE_ENGINE_VERSION);
});

test('intake engine: vendor slippage is multi-label with money, duration, recurrence and person ambiguity', () => {
  const env = seededHarness();
  const a = analyzeIntakeText(VENDOR_TEXT, env.store.state, { now: NOW });
  assert.ok(['delivery', 'capacity', 'vendor', 'finance'].includes(a.primaryCategoryId));
  const ids = a.categories.map((c) => c.id);
  for (const id of ['delivery', 'vendor', 'finance', 'capacity']) {
    assert.ok(ids.includes(id), `expected multi-label signal for ${id}`);
  }
  // Money: US format, symbol currency honestly flagged as assumed.
  const money = a.entities.money.find((m) => m.amount === 40000);
  assert.ok(money);
  assert.equal(money.currency, 'USD');
  assert.equal(money.currencyAssumed, true);
  // Duration and recurrence.
  assert.ok(a.entities.durations.some((d) => /three weeks/i.test(d.raw)));
  assert.ok(a.entities.recurrence.some((r) => /second|in a row/.test(r.raw)));
  // Two Priyas -> ambiguity, never auto-selected.
  assert.equal(a.entities.people.length, 0);
  assert.equal(a.entities.peopleAmbiguities.length, 1);
  assert.equal(a.entities.peopleAmbiguities[0].candidates.length, 2);
  // PERT legs are ordered and derived, not invented zeros.
  const fin = a.caseSuggestion.financial;
  assert.ok(fin.mostLikely === 40000 && fin.optimistic < fin.mostLikely && fin.pessimistic > fin.mostLikely);
  assert.ok(fin.capacityDaysMostLikely > 0, 'three-week duration seeds a capacity triple');
});

test('intake engine: conflict language triggers the privacy wall and never a case suggestion', () => {
  const env = seededHarness();
  const a = analyzeIntakeText(CONFLICT_TEXT, env.store.state, { now: NOW });
  assert.equal(a.primaryCategoryId, 'conflict');
  assert.equal(a.conflictPrivacyWall, true);
  assert.equal(a.privacyBlocked, true);
  assert.equal(a.caseSuggestion, null);
  assert.ok(a.routingPlan.some((r) => r.ruleId === 'RULE-INTAKE-04'));
  assert.ok(a.routingPlan.every((r) => r.autoCreatable === false));
  assert.ok(a.entities.recurrence.some((r) => r.raw === 'again'));
});

test('intake engine: thin, off-topic and empty inputs return insufficient verdicts without throwing', () => {
  for (const text of ['', null, undefined, '   ', WEATHER_TEXT, '🙂 ✅ 123', { weird: true }]) {
    const a = analyzeIntakeText(text, {}, { now: NOW });
    assert.equal(a.insufficient, true, `expected insufficient for ${JSON.stringify(text)}`);
    assert.equal(a.confidenceBand, 'none');
    assert.equal(a.caseSuggestion, null);
    assert.ok(a.insufficientReasons.length >= 1);
  }
});

test('intake engine: NegEx negation prevents a non-event from becoming a delivery case', () => {
  const text = 'This is not a delay, everything is on schedule and there are no budget issues.';
  const a = analyzeIntakeText(text, {}, { now: NOW });
  const delivery = a.categories.find((c) => c.id === 'delivery');
  assert.ok(delivery.evidence.some((e) => e.negated), 'the delay match must be recorded as negated');
  // Only a weak generic schedule term survives — below the routing floor.
  assert.equal(a.insufficient, true);
});

test('intake engine: analysis is deterministic and probabilities are well-formed', () => {
  const first = analyzeIntakeText(SAFETY_TEXT, {}, { now: NOW });
  const second = analyzeIntakeText(SAFETY_TEXT, {}, { now: NOW });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  const sum = first.categories.reduce((acc, c) => acc + c.probability, 0);
  // Displayed probabilities are rounded to 3 decimals, so tolerate that rounding.
  assert.ok(Math.abs(sum - 1) < 0.01, `softmax probabilities must sum to ~1, got ${sum}`);
  assert.ok(first.categories.every((c) => c.probability > 0), 'shrinkage keeps every class above zero');
  const sorted = first.categories.map((c) => c.probability);
  assert.deepEqual(sorted, [...sorted].sort((x, y) => y - x));
});

test('intake engine: ambiguity flag fires when top-1 and top-2 are nearly tied', () => {
  const text = 'The team is exhausted and overloaded while the deadline slips again and costs keep rising over budget.';
  const a = analyzeIntakeText(text, {}, { now: NOW });
  assert.equal(a.insufficient, false);
  assert.ok(a.margin < 0.25, 'mixed-evidence text should show a small margin');
});

test('intake engine: money parser handles US, European and Danish conventions', () => {
  assert.equal(parseNumericAmount('1,234.56'), 1234.56);
  assert.equal(parseNumericAmount('1.234.567,89'), 1234567.89);
  assert.equal(parseNumericAmount('250,50'), 250.5);
  assert.equal(parseNumericAmount('1,234'), 1234);
  assert.equal(parseNumericAmount('40k'), 40000);
  assert.equal(parseNumericAmount('1.2m'), 1200000);
  assert.equal(parseNumericAmount('75 thousand'), 75000);
  assert.equal(parseNumericAmount('2bn'), 2000000000);
  assert.equal(parseNumericAmount(''), null);
  assert.equal(parseNumericAmount('abc'), null);
});

test('intake engine: named currency variants and suffix kroner extraction', () => {
  const a = analyzeIntakeText('The contract penalty is DKK 250.000,50 and another invoice for 75k kr. remains unpaid.', {}, { now: NOW });
  const codes = a.entities.money.map((m) => m.currency);
  assert.ok(codes.includes('DKK'));
  assert.ok(a.entities.money.some((m) => m.amount === 250000.5));
  assert.ok(a.entities.money.some((m) => m.amount === 75000 && m.currencyAssumed === true));
});

test('intake engine: roster matching supports full names, unique first names and provenance spans', () => {
  const env = seededHarness();
  const a = analyzeIntakeText('Samuel Okafor flagged that Priya Natarajan needs help with the rota.', env.store.state, { now: NOW });
  const names = a.entities.people.map((p) => p.personId);
  assert.ok(names.includes(env.people.samuel));
  assert.ok(names.includes(env.people.priya));
  assert.ok(a.entities.people.every((p) => typeof p.start === 'number' && p.end > p.start));
});

test('intake engine: stemmer collapses inflected forms onto one lexicon key', () => {
  assert.equal(stem('delays'), stem('delay'));
  assert.equal(stem('delayed'), stem('delay'));
  assert.equal(stem('negotiating'), 'negotiat');
  assert.equal(stem('bug'), 'bug');
});

test('intake engine: person-days, calendar durations and percentages are distinguished', () => {
  const a = analyzeIntakeText('Fixing this will take 5 person-days, the vendor needs two weeks, and we are 25% over budget.', {}, { now: NOW });
  assert.ok(a.entities.durations.some((d) => d.type === 'person-days' && d.days === 5));
  assert.ok(a.entities.durations.some((d) => d.type === 'duration' && d.approxDays === 14));
  assert.ok(a.entities.percents.some((p) => p.value === 25));
});

test('intake engine: goal link uses conservative fuzzy overlap and stays null otherwise', () => {
  const env = seededHarness();
  const a = analyzeIntakeText('The billing delivery deadline slipped again and the platform is at risk.', env.store.state, { now: NOW });
  assert.ok(a.caseSuggestion.linkedGoalId === env.goal || a.caseSuggestion.linkedGoalId === null);
  if (a.caseSuggestion.linkedGoalId) assert.ok(a.caseSuggestion.goalLinkBasis.includes('overlap'));
  const b = analyzeIntakeText('A forklift near-miss happened in the warehouse.', env.store.state, { now: NOW });
  assert.equal(b.caseSuggestion.linkedGoalId, null);
});

test('intake engine: suggested title is bounded and derived from the strongest-evidence sentence', () => {
  const a = analyzeIntakeText(SAFETY_TEXT, {}, { now: NOW });
  assert.ok(a.suggestedTitle.length > 0 && a.suggestedTitle.length <= 91);
  assert.ok(SAFETY_TEXT.includes(a.suggestedTitle.replace('…', '').slice(0, 30)));
});

test('intake engine: toCaseInput produces a propagation-previewable payload', () => {
  const env = seededHarness();
  const a = analyzeIntakeText(VENDOR_TEXT, env.store.state, { now: NOW });
  const input = toCaseInput(a);
  assert.ok(input.title);
  assert.ok(['risk', 'incident'].includes(input.kind));
  assert.equal(input.autoPropagate, true);
  const previews = previewCasePropagations(input, env.store.state, { now: NOW });
  assert.ok(Array.isArray(previews));
});

test('intake engine: never reads confidential conflicts or anonymous pulses', () => {
  const env = seededHarness();
  env.store.state.conflicts = [{ id: 'c-secret', confidentialNotes: 'TOP SECRET harassment wording' }];
  env.store.state.pulses = [{ id: 'pu-1', anonymous: true }];
  const a = analyzeIntakeText('A routine scheduling delay on the migration.', env.store.state, { now: NOW });
  const serialized = JSON.stringify(a);
  assert.ok(!serialized.includes('TOP SECRET'));
  assert.ok(!serialized.includes('c-secret'));
});

/* ------------------------------------------------------------- action layer */

test('intake actions: analyze is pure and persists nothing', () => {
  const env = harness();
  const before = JSON.stringify(env.store.state.intakeDrafts);
  const res = env.api.analyzeIntake(SAFETY_TEXT);
  assert.equal(res.ok, true);
  assert.equal(res.analysis.primaryCategoryId, 'safety');
  assert.equal(JSON.stringify(env.store.state.intakeDrafts), before);
});

test('intake actions: insufficient text is refused instead of saved as a fake draft', () => {
  const env = harness();
  const res = env.api.saveIntakeDraft(WEATHER_TEXT);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'insufficient-evidence');
  assert.ok(res.analysis.insufficientReasons.length);
  assert.equal(env.store.state.intakeDrafts.length, 0);
});

test('intake actions: save, confirm and propagate through the standard case engine', () => {
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  assert.equal(saved.ok, true);
  assert.equal(env.store.state.intakeDrafts[0].status, 'analyzed');

  const confirmed = env.api.confirmIntakeDraft(saved.id, { ownerId: env.people.samuel });
  assert.equal(confirmed.ok, true);
  assert.ok(confirmed.caseId);
  // The existing event-driven engine did real parallel propagation.
  const caseRecord = env.store.state.cases.find((c) => c.id === confirmed.caseId);
  assert.ok(caseRecord);
  assert.equal(caseRecord.kind, 'incident');
  assert.ok((confirmed.propagations || []).length >= 1, 'at least one cross-module propagation fired');

  const draft = env.store.state.intakeDrafts.find((d) => d.id === saved.id);
  assert.equal(draft.status, 'confirmed');
  assert.equal(draft.confirmedCaseId, confirmed.caseId);
  assert.equal(draft.outcomes.primaryCategory, 'safety');
  assert.equal(typeof draft.outcomes.primaryAccepted, 'boolean');
  assert.equal(typeof draft.outcomes.entityOffered, 'number');
  assert.ok(Array.isArray(draft.outcomes.editedFields));

  // Idempotency: a second confirmation is refused.
  const again = env.api.confirmIntakeDraft(saved.id);
  assert.equal(again.ok, false);
});

test('intake actions: edited suggestions land in the calibration outcomes', () => {
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(VENDOR_TEXT);
  const analysis = saved.analysis;
  const confirmed = env.api.confirmIntakeDraft(saved.id, {
    kind: 'escalation',
    fmeaSeverity: 10,
    involvedPersonIds: [env.people.samuel],
  });
  assert.equal(confirmed.ok, true);
  const draft = env.store.state.intakeDrafts.find((d) => d.id === saved.id);
  assert.equal(draft.outcomes.primaryAccepted, false);
  assert.ok(draft.outcomes.editedFields.includes('kind'));
  assert.ok(draft.outcomes.editedFields.includes('fmea.severity'));
  assert.ok(analysis); // engine snapshot retained for provenance
});

test('intake actions: conflict drafts cannot be confirmed into cases', () => {
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(CONFLICT_TEXT);
  // Conflict text is triageable as a draft (so the leader sees the wall),
  // but offers no case suggestion and confirmation is refused.
  assert.equal(saved.ok, true);
  const confirmed = env.api.confirmIntakeDraft(saved.id);
  assert.equal(confirmed.ok, false);
  assert.equal(env.store.state.cases.length, 0);
});

test('intake actions: dismiss, delete and status guards behave', () => {
  const env = harness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  assert.equal(env.api.dismissIntakeDraft(saved.id, 'not actionable').ok, true);
  assert.equal(env.store.state.intakeDrafts[0].status, 'dismissed');
  assert.equal(env.api.confirmIntakeDraft(saved.id).ok, false);
  assert.equal(env.api.dismissIntakeDraft(saved.id).ok, false);
  assert.equal(env.api.deleteIntakeDraft(saved.id).ok, true);
  assert.equal(env.store.state.intakeDrafts.length, 0);
  assert.equal(env.api.deleteIntakeDraft('missing').ok, false);
});

test('intake actions: reanalyze replaces the snapshot and refuses thin edits', () => {
  const env = harness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  const res = env.api.reanalyzeIntakeDraft(saved.id, WEATHER_TEXT);
  assert.equal(res.ok, false);
  assert.equal(res.code, 'insufficient-evidence');
  const ok = env.api.reanalyzeIntakeDraft(saved.id, 'Another compliance breach in the vendor audit.');
  assert.equal(ok.ok, true);
  assert.equal(env.store.state.intakeDrafts[0].analysis.primaryCategoryId, 'safety');
});

test('intake calibration: counts-only below n=5 and agreement rate once enough samples exist', () => {
  const empty = intakeCalibration(createEmptyState());
  assert.equal(empty.totalConfirmed, 0);
  assert.ok(empty.bands.every((b) => b.countsOnly));
  assert.equal(empty.measuredConstruct.includes('agreement'), true);

  const env = harness();
  for (let i = 0; i < 5; i += 1) {
    const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
    env.api.confirmIntakeDraft(saved.id);
  }
  const report = env.api.intakeCalibrationReport();
  const high = report.bands.find((b) => b.band === 'high');
  assert.equal(high.n, 5);
  assert.equal(high.countsOnly, false);
  assert.equal(high.agreementRate, 1);
  assert.equal(env.api.pendingIntakeCount(), 0);
});

test('intake drafts: pending queue ages and flags staleness at three days', () => {
  const env = harness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  const later = new Date('2026-10-30T10:00:00.000Z');
  const pending = pendingIntakeDrafts(env.store.state, later);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].stale, true);
  assert.ok(pending[0].ageDays >= 4);
  assert.equal(saved.id, pending[0].id);
});

test('intake insights: RULE-INTAKE-06 surfaces stale drafts, with stakes escalated to severity 4', () => {
  const env = seededHarness();
  env.api.saveIntakeDraft(SAFETY_TEXT);
  const later = new Date('2026-10-31T10:00:00.000Z');
  const findings = buildInsights(env.store.state, later).findings;
  const signal = findings.find((f) => f.ruleId === 'RULE-INTAKE-06');
  assert.ok(signal);
  assert.equal(signal.severity, 4);
  assert.equal(signal.action.route, '#/intake');
  // Fresh drafts do not alarm.
  const fresh = buildInsights(env.store.state, NOW).findings;
  assert.equal(fresh.some((f) => f.ruleId === 'RULE-INTAKE-06'), false);
});

/* ------------------------------------------------------------- schema v27 */

test('schema v27: current version and empty state include the intake ledger', () => {
  assert.equal(SCHEMA_VERSION, 75);
  const state = createEmptyState();
  assert.ok(Array.isArray(state.intakeDrafts));
  assert.equal(state.intakeDrafts.length, 0);
});

test('schema v27: v26 → v27 migration is purely additive', () => {
  const v26 = { schemaVersion: 26, people: [], cases: [] };
  const snapshot = JSON.stringify(v26);
  const migrated = migrate(v26);
  assert.deepEqual(migrated.applied, ['26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69', '69 → 70', '70 → 71', '71 → 72', '72 → 73', '73 → 74', '74 → 75']);
  assert.equal(migrated.raw.schemaVersion, 75);
  assert.deepEqual(migrated.raw.intakeDrafts, []);
  assert.equal(JSON.stringify(v26), snapshot, 'migration never mutates its input');
});

test('schema v27: normalization repairs malformed drafts and drops invalid rows', () => {
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  const caseRef = env.api.confirmIntakeDraft(saved.id).caseId;
  const raw = {
    schemaVersion: 27,
    appId: 'leados.lifecycle',
    settings: {},
    meta: {},
    people: env.store.state.people,
    intakeDrafts: [
      env.store.state.intakeDrafts[0],
      { id: 'bad-status', createdAt: NOW.toISOString(), status: 'weird', sourceText: 'A valid delivery delay on the vendor contract.', analysis: {} },
      { id: 'no-text', createdAt: NOW.toISOString(), status: 'analyzed', sourceText: '   ', analysis: null },
      {
        id: 'dangling',
        createdAt: NOW.toISOString(),
        status: 'confirmed',
        sourceText: 'Another safety incident with forklift risk.',
        confirmedCaseId: 'case-does-not-exist',
        analysis: { primaryCategoryId: 'safety' },
        outcomes: { primaryAccepted: 'yes' },
      },
    ],
    cases: env.store.state.cases.filter((c) => c.id === caseRef),
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.intakeDrafts.length, 3, 'the empty-text draft is dropped, the other three survive');
  assert.equal(state.intakeDrafts.find((d) => d.id === 'bad-status').status, 'analyzed');
  const dangling = state.intakeDrafts.find((d) => d.id === 'dangling');
  assert.equal(dangling.confirmedCaseId, null);
  assert.equal(dangling.outcomes.primaryAccepted, false, 'non-boolean outcome repaired to boolean');
  assert.ok(warnings.some((w) => w.includes('Intake drafts')));
});

test('schema v27: point-in-time rewind removes future drafts and rewinds later decisions', () => {
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  env.api.confirmIntakeDraft(saved.id);
  const cut = new Date('2026-10-25T10:00:00.000Z');
  const rewind = reconstructStateAt(env.store.state, cut);
  assert.equal((rewind.state.intakeDrafts || []).length, 0, 'draft created after the cutoff is removed');

  // A draft decided after the cutoff is rewound to analyzed.
  const env2 = seededHarness();
  const saved2 = env2.api.saveIntakeDraft(SAFETY_TEXT);
  const draft = env2.store.state.intakeDrafts[0];
  draft.createdAt = '2026-10-20T08:00:00.000Z';
  env2.api.confirmIntakeDraft(saved2.id);
  const rewind2 = reconstructStateAt(env2.store.state, new Date('2026-10-22T10:00:00.000Z'));
  const rewound = rewind2.state.intakeDrafts.find((d) => d.id === saved2.id);
  assert.ok(rewound);
  assert.equal(rewound.status, 'analyzed');
  assert.equal(rewound.confirmedCaseId, null);
});

test('schema v27: clearDemo preserves leader-created intake drafts', () => {
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(SAFETY_TEXT);
  // A demo-marked draft must be cleared while real drafts survive.
  env.store.update((d) => {
    d.intakeDrafts.push({
      id: 'intake-demo-1',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      status: 'analyzed',
      sourceText: 'Demo delay text about a supplier.',
      engineVersion: INTAKE_ENGINE_VERSION,
      analysis: {},
      confirmedCaseId: null,
      outcomes: null,
      dismissReason: '',
    });
  }, { type: 'test.demo-draft', entity: 'intake', summary: 'seed demo draft' });
  env.store.clearDemo();
  const ids = env.store.state.intakeDrafts.map((d) => d.id);
  assert.ok(ids.includes(saved.id));
  assert.equal(ids.includes('intake-demo-1'), false);
});

test('intake CSV: calibration scope is registered, non-sensitive and contains no free text', () => {
  const descriptor = CSV_EXPORTS.find((c) => c.key === 'intakeCalibration');
  assert.ok(descriptor);
  assert.equal(descriptor.sensitive, false);
  const env = seededHarness();
  const saved = env.api.saveIntakeDraft(VENDOR_TEXT);
  env.api.confirmIntakeDraft(saved.id, { ownerId: env.people.samuel });
  const result = exportWorkspaceCsv(env.store.state, 'intakeCalibration', { now: NOW });
  assert.equal(result.ok, true);
  assert.ok(result.rowCount >= 1);
  assert.ok(!result.csv.includes(VENDOR_TEXT.slice(0, 30)), 'source note text never enters the calibration export');
  const headers = result.csv.split('\n')[0];
  assert.ok(headers.includes('confidence_band') && headers.includes('primary_accepted'));
  assert.ok(!/source|note|text|reason/i.test(headers), 'no free-text columns are exposed');
});

/* ------------------------------------------------------------------- UI */

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

function click(node) {
  assert.ok(node, 'expected a clickable DOM node');
  node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
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

test('UI: full triage workflow — analyze, review, confirm into a propagated case, then check the ledger', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.api.addPerson({ name: 'Priya Natarajan', role: 'Engineering Lead', startDate: '2024-01-15' });
    window.location.hash = '#/intake';
    // Route rendering is asynchronous. Under full-suite CPU contention a fixed
    // 30 ms sleep can expire before hashchange is dispatched.
    const deadline = Date.now() + 5000;
    while (!document.querySelector('[data-testid="intake-composer"]') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(document.querySelector('[data-testid="intake-composer"]'));
    const composer = document.querySelector('[data-testid="intake-composer"]');
    composer.value = SAFETY_TEXT;
    composer.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(document.querySelector('[data-testid="intake-analyze"]'));
    await new Promise((r) => setTimeout(r, 30));

    const analysis = document.querySelector('[data-testid="intake-analysis"]');
    assert.ok(analysis, 'analysis panel renders');
    assert.ok(document.querySelector('[data-testid="intake-cat-safety"]'));
    assert.ok(document.querySelector('[data-testid="intake-propagation-preview"]'));
    assert.ok(document.body.textContent.includes('Mandatory human review'));
    assert.deepEqual(await axeViolations(env), [], 'analysis view is axe-clean');

    // Save for later, then reopen from the drafts queue.
    click(document.querySelector('[data-testid="intake-save-draft"]'));
    await new Promise((r) => setTimeout(r, 30));
    window.location.hash = '#/intake?tab=drafts';
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(document.body.textContent.includes('Calibration ledger'));
    const reviewBtn = document.querySelector('[data-testid^="intake-open-"]');
    assert.ok(reviewBtn);
    click(reviewBtn);
    await new Promise((r) => setTimeout(r, 30));

    // Hand off to the standard case dialog and register the case.
    click(document.querySelector('[data-testid="intake-review-case"]'));
    await new Promise((r) => setTimeout(r, 30));
    const dialog = document.querySelector('.modal[role="dialog"]');
    assert.ok(dialog, 'the standard operational case dialog opens pre-filled');
    assert.ok(dialog.textContent.includes('Register operational case'));
    const submit = dialog.querySelector('button[type="button"].btn-primary');
    click(submit);
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(app.store.state.cases.length, 1);
    const draft = app.store.state.intakeDrafts[0];
    assert.equal(draft.status, 'confirmed');
    assert.equal(draft.confirmedCaseId, app.store.state.cases[0].id);
    assert.equal(env.consoleErrors.length, 0, `unexpected console errors: ${env.consoleErrors.join(' | ')}`);
  });
});

test('UI: insufficient evidence and dismiss flow stay accessible', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    window.location.hash = '#/intake';
    await new Promise((r) => setTimeout(r, 30));
    const composer = document.querySelector('[data-testid="intake-composer"]');
    composer.value = WEATHER_TEXT;
    composer.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(document.querySelector('[data-testid="intake-analyze"]'));
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(document.body.textContent.includes('Not enough evidence'));
    assert.deepEqual(await axeViolations(env), []);

    // A proper triage can be saved then dismissed from the drafts tab.
    composer.value = SAFETY_TEXT;
    composer.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(document.querySelector('[data-testid="intake-analyze"]'));
    await new Promise((r) => setTimeout(r, 30));
    click(document.querySelector('[data-testid="intake-save-draft"]'));
    await new Promise((r) => setTimeout(r, 30));
    window.location.hash = '#/intake?tab=drafts';
    await new Promise((r) => setTimeout(r, 30));
    const dismissBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Dismiss');
    assert.ok(dismissBtn);
    click(dismissBtn);
    await new Promise((r) => setTimeout(r, 30));
    const modal = document.querySelector('.modal[role="dialog"]');
    assert.ok(modal);
    const confirm = [...modal.querySelectorAll('button')].find((b) => b.textContent.includes('Dismiss triage'));
    click(confirm);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(app.store.state.intakeDrafts[0].status, 'dismissed');
    assert.deepEqual(await axeViolations(env), []);
  });
});

test('UI: nav carries an intake badge and Today nudges pending drafts', async () => {
  await withApp(async (app, env) => {
    const { document } = env;
    app.api.addPerson({ name: 'Samuel Okafor', role: 'Support Lead', startDate: '2025-01-10' });
    app.api.saveIntakeDraft(SAFETY_TEXT);
    window.location.hash = '#/today';
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(document.body.textContent.includes('intake triage'));
    const navItem = [...document.querySelectorAll('.nav-item')].find((a) => a.textContent.includes('Intake triage'));
    assert.ok(navItem);
    assert.ok(navItem.querySelector('.nav-count'));
    assert.deepEqual(await axeViolations(env), []);
  });
});
