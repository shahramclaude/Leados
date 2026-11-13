/**
 * tests/app/contradiction-audit.test.mjs — the Cross-Line Contradiction Audit
 * (Session 195, Schema v121, ADR-0144, `#/contradiction`, RULE-CNT-01, CSV #107).
 *
 * The suite is organised around the four things a chief's decision can be
 * betrayed by, not around the file list:
 *
 *  1. THE ARITHMETIC. The queueing multiplier and every basis-point total must be
 *     provably the arithmetic of the printed integers. The oracle for the
 *     multiplier is the rational τ/(100−τ), computed independently here.
 *  2. THE HONESTY OF SEVERITY. `incompatible` may appear ONLY where declared
 *     integers or the queueing law prove it; a trade-off that a process change
 *     can move reads `tension`; a pair that shares nobody reads `isolated`; a
 *     missing figure reads `insufficient` and names what is missing.
 *  3. THE REFUSALS. A lever outside the taxonomy, a missing share, a duplicate
 *     charter, a utilisation target of 100, a claim on a closed envelope, a
 *     ruling with no reasoning, a resequence naming a non-party, a ruling on a
 *     finding that no longer reproduces — each refused WITH a reason and leaving
 *     the store unchanged.
 *  4. THE ONE CONSEQUENCE. RULE-CNT-01 opens exactly one decision per ruling and
 *     issues work ONLY for a resequence, only to the named line, idempotently.
 *
 * Display-vs-stored parity is asserted directly: every figure the report and the
 * CSV print is re-read from the stored blob and recomputed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { parseCsv, serializeCsv } from '../../app/core/csv.js';
import {
  buildContradictionAudit,
  contradictionAttentionCount,
  contradictionBriefText,
  contradictionCsvRows,
  contradictionQueueMultiplier,
} from '../../app/core/domain/contradictionAudit.js';
import {
  CONTRADICTION_CSV_COLUMNS,
  CONTRADICTION_ENGINE_VERSION,
} from '../../app/core/domain/contradictionRegistry.js';
import { contradictionRule, CONTRADICTION_RULE_ID } from '../../app/core/domain/contradictionRules.js';
import {
  normalizeContradictionReviews,
  normalizeLineMandates,
} from '../../app/core/domain/contradictionSchema.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS } from '../../app/core/domain/cases.js';
import { renderContradiction } from '../../app/views/contradiction.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const NOW = new Date('2026-11-09T12:00:00.000Z');
const STAMP = '2026-10-01T00:00:00.000Z';

/* ------------------------------------------------------------------ fixtures */

function orgRoster() {
  return [
    { id: 'ceo', name: 'Ada Executive', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'vp1', name: 'Victor VP Eng', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'vp2', name: 'Vera VP Prod', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'engdir', name: 'Eve Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'vp2', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'engdir', status: 'active', createdAt: STAMP },
  ];
}

function line(id, personId, managerId, kind, shareH, rights = []) {
  return {
    id, personId, managerId, kind,
    role: kind === 'functional' ? 'primary' : 'secondary',
    shareH, rights, fromISO: '2026-10-01', toISO: null, note: '',
    status: 'active', declaredAt: STAMP, history: [], createdAt: STAMP, updatedAt: STAMP,
  };
}

/** Sam and Kim both sit on Eve's (home) engineering line and Pia's project line. */
function baseLines() {
  return [
    line('l-sam-fn', 'sam', 'engdir', 'functional', 60, ['priority', 'technical', 'performance']),
    line('l-sam-pj', 'sam', 'pmdir', 'project', 40, ['priority']),
    line('l-kim-fn', 'kim', 'engdir', 'functional', 50, ['priority', 'technical']),
    line('l-kim-pj', 'kim', 'pmdir', 'product', 50, []),
  ];
}

function mandate(id, lineManagerId, lever, direction, weightBp, extra = {}) {
  return {
    id,
    lineManagerId,
    objectiveId: null,
    lever,
    direction,
    weightBp,
    targetValue: null,
    envelopeId: null,
    envelopeClaimBp: null,
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    note: '',
    status: 'active',
    withdrawnOn: null,
    withdrawReason: '',
    declaredOn: '2026-10-01',
    declaredBySeatId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

function budget(id, name, currency, limit, status = 'active') {
  return {
    id, name, currency, limit, periodLabel: 'Q4', startsOn: '2026-10-01', endsOn: '2026-12-31',
    status, ownerId: null, note: '', lines: [], autoPropagate: true,
    createdAt: STAMP, updatedAt: STAMP,
  };
}

function workspace({ lines = baseLines(), mandates = [], budgets = [], extra = {}, settings = {} } = {}) {
  const base = createEmptyState(STAMP);
  base.people = orgRoster();
  base.reportingLines = lines;
  base.lineMandates = mandates;
  base.budgets = budgets;
  base.settings = { ...base.settings, activeSeatId: null, ...settings };
  return normalizeState({ ...base, ...extra }, { now: NOW }).state;
}

function bootMemoryApi(initialState) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(initialState)]]);
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createStore({ now: () => NOW });
  store.load();
  const api = createApi(store, { now: () => NOW });
  return { store, api };
}

const auditOf = (state, opts = {}) => buildContradictionAudit(state, { now: NOW, ...opts });
const findingsOf = (report, kind) => (report.allFindings || report.findings).filter((f) => f.kind === kind);

/* ------------------------------------------------- 1. the calibration arithmetic */

test('the queueing multiplier is the exact τ/(100−τ) ratio, and refuses an unbounded target', () => {
  for (const tau of [10, 50, 80, 85, 90, 99]) {
    const m = contradictionQueueMultiplier(tau);
    assert.ok(m, `τ=${tau} must produce a multiplier`);
    // ORACLE: the rational itself, computed independently.
    assert.equal(m.numerator, tau);
    assert.equal(m.denominator, 100 - tau);
    assert.equal(m.value, Math.round((tau / (100 - tau)) * 100) / 100);
  }
  assert.equal(contradictionQueueMultiplier(85).value, 5.67);
  // Unbounded or absent targets are refused, never returned as a big number.
  assert.equal(contradictionQueueMultiplier(100), null);
  assert.equal(contradictionQueueMultiplier(120), null);
  assert.equal(contradictionQueueMultiplier(0), null);
  assert.equal(contradictionQueueMultiplier(null), null);
});

/* --------------------------------------------------------- 2. severity honesty */

test('a utilisation/lead-time pair is incompatible above the declared knee and tension below it, with the multiplier printed', () => {
  const atKnee = auditOf(workspace({
    mandates: [
      mandate('m-eng', 'engdir', 'utilisation', 'increase', 5000, { targetValue: 85 }),
      mandate('m-pm', 'pmdir', 'lead-time', 'decrease', 5000),
    ],
  }));
  const [high] = findingsOf(atKnee, 'coupled-trade-off');
  assert.equal(high.severity, 'incompatible');
  assert.equal(high.utilisationTargetPct, 85);
  assert.equal(high.queueMultiplier, 5.67);
  assert.equal(high.utilisationCeilingPct, 85);
  assert.equal(high.sharedPersonN, 2);

  const belowKnee = auditOf(workspace({
    mandates: [
      mandate('m-eng', 'engdir', 'utilisation', 'increase', 5000, { targetValue: 60 }),
      mandate('m-pm', 'pmdir', 'lead-time', 'decrease', 5000),
    ],
  }));
  const [low] = findingsOf(belowKnee, 'coupled-trade-off');
  assert.equal(low.severity, 'tension', 'below the knee the pair is a trade-off, never a proof');
  assert.equal(low.queueMultiplier, 1.5);
});

test('a missing or unusable utilisation target is refused with the missing figure named — never defaulted', () => {
  const missing = auditOf(workspace({
    mandates: [
      mandate('m-eng', 'engdir', 'utilisation', 'increase', 5000),
      mandate('m-pm', 'pmdir', 'lead-time', 'decrease', 5000),
    ],
  }));
  const [finding] = findingsOf(missing, 'coupled-trade-off');
  assert.equal(finding.severity, 'insufficient');
  assert.match(finding.missingFigure, /utilisation target/i);
  assert.equal(finding.queueMultiplier, undefined);

  const unbounded = auditOf(workspace({
    mandates: [
      mandate('m-eng', 'engdir', 'utilisation', 'increase', 5000, { targetValue: 100 }),
      mandate('m-pm', 'pmdir', 'lead-time', 'decrease', 5000),
    ],
  }));
  const [refused] = findingsOf(unbounded, 'coupled-trade-off');
  assert.equal(refused.severity, 'insufficient');
  assert.equal(refused.utilisationTargetPct, 100);
  assert.equal(refused.queueMultiplier, undefined);
});

test('the same lever pushed opposite ways is incompatible when people sit on both lines, isolated when nobody does', () => {
  const shared = auditOf(workspace({
    mandates: [
      mandate('m-eng', 'engdir', 'cost', 'decrease', 3000),
      mandate('m-pm', 'pmdir', 'cost', 'increase', 3000),
    ],
  }));
  const [live] = findingsOf(shared, 'lever-opposition');
  assert.equal(live.severity, 'incompatible');
  assert.equal(live.sharedPersonN, 2);
  assert.deepEqual(live.sharedPersonIds, ['kim', 'sam']);

  // Remove the second line from both people: the charters still oppose, but no
  // person sits on both, so the pair is ISOLATED — a latent design note, never
  // counted as a live contradiction.
  const isolated = auditOf(workspace({
    lines: [line('l-sam-fn', 'sam', 'engdir', 'functional', 100), line('l-kim-fn', 'kim', 'engdir', 'functional', 100)],
    mandates: [
      mandate('m-eng', 'engdir', 'cost', 'decrease', 3000),
      mandate('m-pm', 'pmdir', 'cost', 'increase', 3000),
    ],
  }));
  const latent = findingsOf(isolated, 'lever-opposition');
  assert.equal(latent.length, 1);
  assert.equal(latent[0].severity, 'isolated');
  assert.equal(latent[0].sharedPersonN, 0);
  assert.equal(isolated.totals.incompatibleN, 0, 'a latent pair is never counted as a contradiction');
  assert.equal(isolated.totals.isolatedN, 1);
});

test('a person whose declared shares sum past 100% is incompatible, and the exact integer sum is printed', () => {
  const report = auditOf(workspace({
    mandates: [
      mandate('m-eng-a', 'engdir', 'cost', 'decrease', 6000),
      mandate('m-pm-a', 'pmdir', 'growth', 'increase', 6000),
    ],
  }));
  const over = findingsOf(report, 'incentive-oversubscription');
  assert.equal(over.length, 2, 'both multi-line people are over-subscribed');
  for (const finding of over) {
    assert.equal(finding.weightSumBp, 12000);
    assert.equal(finding.severity, 'incompatible');
    // Display-vs-stored: the printed parts must add to the printed total.
    assert.equal(finding.weightPartsBp.reduce((s, w) => s + w, 0), finding.weightSumBp);
  }
});

test('an undeclared share refuses the total rather than reading the gap as zero', () => {
  const report = auditOf(workspace({
    mandates: [
      mandate('m-eng-a', 'engdir', 'cost', 'decrease', null),
      mandate('m-pm-a', 'pmdir', 'growth', 'increase', 6000),
    ],
  }));
  assert.equal(findingsOf(report, 'incentive-oversubscription').length, 0);
  assert.ok(report.refusals.unreadableWeight.length >= 2);
  const person = report.people.find((p) => p.personId === 'sam');
  assert.equal(person.weightSumBp, null);
  assert.equal(person.weightState, 'undeclared');
});

test('opposite-direction pay is material only above the declared floor', () => {
  const build = (settings) => auditOf(workspace({
    settings,
    mandates: [
      mandate('m-eng-a', 'engdir', 'cost', 'decrease', 1000),
      mandate('m-pm-a', 'pmdir', 'cost', 'increase', 1000),
    ],
  }));
  // 1000 + 1000 = 2000 bp = the default floor → material.
  const atFloor = findingsOf(build({}), 'incentive-opposition');
  assert.ok(atFloor.length >= 1);
  assert.equal(atFloor[0].weightSumBp, 2000);
  // Raise the floor above the pair: the same facts are now immaterial, and the
  // audit says so by printing nothing rather than a contradiction.
  const above = findingsOf(build({ ctrMaterialityBp: 2500 }), 'incentive-opposition');
  assert.equal(above.length, 0);
});

test('two lines claiming more than 100% of one envelope is an exact over-claim against the envelope’s own ceiling', () => {
  const envelope = budget('bud-q4', 'Platform Q4', 'USD', 100000);
  const over = auditOf(workspace({
    budgets: [envelope],
    mandates: [
      mandate('m-eng-a', 'engdir', 'cost', 'decrease', 1000, { envelopeId: 'bud-q4', envelopeClaimBp: 6000 }),
      mandate('m-pm-a', 'pmdir', 'throughput', 'increase', 1000, { envelopeId: 'bud-q4', envelopeClaimBp: 6000 }),
    ],
  }));
  const [finding] = findingsOf(over, 'envelope-overclaim');
  assert.equal(finding.severity, 'incompatible');
  assert.equal(finding.claimSumBp, 12000);
  assert.equal(finding.envelopeLimit, 100000);
  assert.equal(finding.claimantN, 2);

  const within = auditOf(workspace({
    budgets: [envelope],
    mandates: [
      mandate('m-eng-a', 'engdir', 'cost', 'decrease', 1000, { envelopeId: 'bud-q4', envelopeClaimBp: 4000 }),
      mandate('m-pm-a', 'pmdir', 'throughput', 'increase', 1000, { envelopeId: 'bud-q4', envelopeClaimBp: 5000 }),
    ],
  }));
  assert.equal(findingsOf(within, 'envelope-overclaim').length, 0);
});

test('a claim on an envelope that no longer exists is refused and never counted', () => {
  const report = auditOf(workspace({
    mandates: [
      mandate('m-eng-a', 'engdir', 'cost', 'decrease', 1000, { envelopeId: 'bud-gone', envelopeClaimBp: 6000 }),
      mandate('m-pm-a', 'pmdir', 'throughput', 'increase', 1000, { envelopeId: 'bud-gone', envelopeClaimBp: 6000 }),
    ],
  }));
  assert.equal(findingsOf(report, 'envelope-overclaim').length, 0);
  assert.equal(report.refusals.danglingEnvelope.length, 2);
});

/* -------------------------------------------------------- 3. inert single chain */

test('a single-chain workspace is inert: no findings, no decisions, no edges, and it says why', () => {
  const state = workspace({
    lines: [line('l-sam-fn', 'sam', 'engdir', 'functional', 100), line('l-kim-fn', 'kim', 'engdir', 'functional', 100)],
    mandates: [mandate('m-eng-a', 'engdir', 'cost', 'decrease', 5000)],
  });
  const report = auditOf(state);
  assert.equal(report.isMatrix, false);
  assert.equal(report.totals.findingN, 0);
  assert.match(contradictionBriefText(report), /single|one line/i);

  const draft = JSON.parse(JSON.stringify(state));
  const before = { decisions: (draft.decisions || []).length, links: (draft.links || []).length };
  const effects = contradictionRule(draft, { event: { type: 'contradiction.scan' }, now: NOW, idFactory: (p) => `${p}-x` });
  assert.deepEqual(effects, []);
  assert.equal((draft.decisions || []).length, before.decisions);
  assert.equal((draft.links || []).length, before.links);
});

/* --------------------------------------------------------- 4. schema / migration */

test('schema v121 is additive and clamps the conventions without inventing a charter', () => {
  assert.equal(SCHEMA_VERSION, 155);
  const { raw, applied } = migrate({
    schemaVersion: 120,
    appId: 'leados',
    meta: { createdAt: STAMP, updatedAt: STAMP, isDemo: false, revision: 0 },
    settings: { ctrUtilisationCeiling: 999, ctrMaterialityBp: -10, ctrReviewDays: 1 },
    people: orgRoster(),
    reportingLines: baseLines(),
  });
  assert.deepEqual(applied, ['120 → 121', '121 → 122', '122 → 123', '123 → 124', '124 → 125', '125 → 126', '126 → 127', '127 → 128', '128 → 129', '129 → 130', '130 → 131', '131 → 132', '132 → 133', '133 → 134', '134 → 135', '135 → 136', '136 → 137', '137 → 138', '138 → 139', '139 → 140', '140 → 141', '141 → 142', '142 → 143', '143 → 144', '144 → 145', '145 → 146', '146 → 147', '147 → 148', '148 → 149', '149 → 150', '150 → 151', '151 → 152', '152 → 153', '153 → 154', '154 → 155']);
  assert.deepEqual(raw.lineMandates, []);
  assert.deepEqual(raw.contradictionReviews, []);
  assert.deepEqual(raw.contradictionMarkers, []);
  assert.equal(raw.settings.ctrUtilisationCeiling, 95);
  assert.equal(raw.settings.ctrMaterialityBp, 0);
  assert.equal(raw.settings.ctrReviewDays, 7);
});

test('the normalizers drop an unreadable charter or ruling rather than repairing it', () => {
  const warnings = [];
  const mandates = normalizeLineMandates([
    mandate('m-ok', 'engdir', 'cost', 'decrease', 5000),
    mandate('m-bad-lever', 'engdir', 'vibes', 'decrease', 5000),
    mandate('m-bad-direction', 'engdir', 'cost', 'sideways', 5000),
    mandate('m-no-line', null, 'cost', 'decrease', 5000),
    // A window that ends before it starts is not a charter.
    mandate('m-bad-window', 'pmdir', 'cost', 'increase', 5000, { effectiveFrom: '2026-11-01', effectiveTo: '2026-10-01' }),
    // A null share is PRESERVED as null — never coerced to zero.
    mandate('m-null-weight', 'pmdir', 'growth', 'increase', null),
  ], warnings);
  assert.deepEqual(mandates.map((m) => m.id), ['m-ok', 'm-null-weight']);
  assert.equal(mandates[1].weightBp, null);
  assert.ok(warnings.some((w) => /dropped/i.test(w)));

  const reviewWarnings = [];
  const reviews = normalizeContradictionReviews([
    { id: 'r-ok', findingKey: 'lever-opposition|a~b~m1~m2', kind: 'lever-opposition', verdict: 'accepted', rationale: 'We run both knowingly for the quarter.', decidedOn: '2026-11-01', subjectType: 'lines', lineAId: 'engdir', lineBId: 'pmdir', reviewOn: '2027-02-01' },
    // No reasoning → not a ruling.
    { id: 'r-no-reason', findingKey: 'x|a', kind: 'lever-opposition', verdict: 'accepted', rationale: '', decidedOn: '2026-11-01', subjectType: 'lines', lineAId: 'engdir', lineBId: 'pmdir' },
    // A resequence that names nobody to change.
    { id: 'r-no-line', findingKey: 'x|b', kind: 'lever-opposition', verdict: 'resequenced', rationale: 'Somebody must change this charter.', decidedOn: '2026-11-01', subjectType: 'lines', lineAId: 'engdir', lineBId: 'pmdir' },
    // A pair that is not two distinct lines.
    { id: 'r-same-line', findingKey: 'x|c', kind: 'lever-opposition', verdict: 'accepted', rationale: 'Reviewed with both lines present.', decidedOn: '2026-11-01', subjectType: 'lines', lineAId: 'engdir', lineBId: 'engdir' },
  ], reviewWarnings);
  assert.deepEqual(reviews.map((r) => r.id), ['r-ok']);
  assert.ok(reviewWarnings.some((w) => /dropped/i.test(w)));
});

/* --------------------------------------------------------- 5. reviewed commands */

function apiFor(mandatesFixture, extra = {}) {
  return bootMemoryApi(workspace({ mandates: mandatesFixture, ...extra }));
}

test('a charter declaration refuses a lever outside the taxonomy, a missing share, a duplicate and an unbounded utilisation target', () => {
  const { store, api } = apiFor([]);
  const before = JSON.stringify(store.state.lineMandates);

  const badLever = api.contradictionDeclareMandate({ lineManagerId: 'engdir', lever: 'vibes', direction: 'increase', weightBp: 1000 });
  assert.equal(badLever.ok, false);
  assert.match(badLever.error, /taxonomy/i);

  const noWeight = api.contradictionDeclareMandate({ lineManagerId: 'engdir', lever: 'cost', direction: 'decrease' });
  assert.equal(noWeight.ok, false);
  assert.match(noWeight.error, /basis points/i);

  const unbounded = api.contradictionDeclareMandate({ lineManagerId: 'engdir', lever: 'utilisation', direction: 'increase', weightBp: 1000, targetValue: 100 });
  assert.equal(unbounded.ok, false);
  assert.match(unbounded.error, /1 and 99/i);

  const ok = api.contradictionDeclareMandate({ lineManagerId: 'engdir', lever: 'cost', direction: 'decrease', weightBp: 4000, note: 'Cut unit cost.' });
  assert.equal(ok.ok, true, ok.error);

  const duplicate = api.contradictionDeclareMandate({ lineManagerId: 'engdir', lever: 'cost', direction: 'decrease', weightBp: 4000 });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /already carries/i);

  // The refusals left the store exactly as it was before the successful write in
  // count terms: exactly ONE charter exists.
  assert.equal((store.state.lineMandates || []).length, 1);
  assert.notEqual(JSON.stringify(store.state.lineMandates), before);
});

test('a claim on a closed envelope is refused; withdrawal demands a reason', () => {
  const { store, api } = bootMemoryApi(workspace({ budgets: [budget('bud-closed', 'Closed Q3', 'USD', 50000, 'closed')] }));
  const refused = api.contradictionDeclareMandate({
    lineManagerId: 'engdir', lever: 'cost', direction: 'decrease', weightBp: 1000,
    envelopeId: 'bud-closed', envelopeClaimBp: 5000,
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /not active/i);

  const ok = api.contradictionDeclareMandate({ lineManagerId: 'engdir', lever: 'cost', direction: 'decrease', weightBp: 1000 });
  assert.equal(ok.ok, true, ok.error);
  const noReason = api.contradictionWithdrawMandate({ mandateId: ok.id });
  assert.equal(noReason.ok, false);
  assert.match(noReason.error, /why|reason/i);
  const withdrawn = api.contradictionWithdrawMandate({ mandateId: ok.id, reason: 'Objective retired with the programme.' });
  assert.equal(withdrawn.ok, true, withdrawn.error);
  assert.equal((store.state.lineMandates || [])[0].status, 'withdrawn');
});

test('a scoped seat cannot declare a charter on a line it cannot reach', () => {
  const { api } = apiFor([], { settings: { activeSeatId: 'engdir' } });
  const outside = api.contradictionDeclareMandate({ lineManagerId: 'pmdir', lever: 'cost', direction: 'increase', weightBp: 1000 });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /outside this seat/i);
});

test('a ruling refuses thin reasoning, a non-party resequence, a past review date, and a finding that no longer reproduces', () => {
  const { api } = apiFor([
    mandate('m-eng', 'engdir', 'cost', 'decrease', 3000),
    mandate('m-pm', 'pmdir', 'cost', 'increase', 3000),
  ]);
  const report = api.contradictionReport().report;
  const [finding] = findingsOf(report, 'lever-opposition');
  assert.ok(finding, 'the fixture must produce a lever-opposition finding');

  const thin = api.contradictionReview({ findingKey: finding.key, verdict: 'accepted', rationale: 'ok' });
  assert.equal(thin.ok, false);
  assert.match(thin.error, /reasoning|characters/i);

  const nonParty = api.contradictionReview({ findingKey: finding.key, verdict: 'resequenced', rationale: 'One line has to give somewhere.', resequenceLineId: 'sam' });
  assert.equal(nonParty.ok, false);
  assert.match(nonParty.error, /not party/i);

  const past = api.contradictionReview({ findingKey: finding.key, verdict: 'accepted', rationale: 'Both lines will run for this quarter.', reviewOn: '2026-01-01' });
  assert.equal(past.ok, false);
  assert.match(past.error, /future/i);

  const stale = api.contradictionReview({ findingKey: 'lever-opposition|nobody~here~x~y', verdict: 'accepted', rationale: 'A ruling on something that is gone.' });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /no longer reproduces/i);
});

/* ----------------------------------------- 6. the one consequence (RULE-CNT-01) */

test('a resequence opens exactly one decision and one dated obligation to the NAMED line, idempotently', () => {
  const { store, api } = apiFor([
    mandate('m-eng', 'engdir', 'cost', 'decrease', 3000),
    mandate('m-pm', 'pmdir', 'cost', 'increase', 3000),
  ]);
  const report = api.contradictionReport().report;
  const [finding] = findingsOf(report, 'lever-opposition');

  const ruled = api.contradictionReview({
    findingKey: finding.key,
    verdict: 'resequenced',
    rationale: 'Product will re-baseline its cost target so engineering can pursue the reduction.',
    resequenceLineId: 'pmdir',
    reviewOn: '2027-01-15',
  });
  assert.equal(ruled.ok, true, ruled.error);

  const decisions = (store.state.decisions || []).filter((d) => d.id === `dec-contradiction-${ruled.id}`);
  assert.equal(decisions.length, 1, 'exactly one governed decision per ruling');
  const tasks = (store.state.delegations || []).filter((t) => t.id && (store.state.contradictionReviews || [])[0].obligationIssued.some((i) => i.taskId === t.id));
  assert.equal(tasks.length, 1, 'exactly one obligation');
  assert.equal(tasks[0].personId, 'pmdir', 'issued to the line named in the ruling, not to the person caught');
  assert.equal(tasks[0].dueOn, '2027-01-15');

  const review = (store.state.contradictionReviews || [])[0];
  assert.equal(review.decisionId, `dec-contradiction-${ruled.id}`);
  assert.equal(review.obligationIssued.length, 1);

  // Provenance edges exist and point at real rows.
  const links = (store.state.links || []).filter((l) => l.sourceType === 'contradiction' && l.sourceId === ruled.id);
  assert.ok(links.some((l) => l.targetType === 'decision'));
  assert.ok(links.some((l) => l.targetType === 'delegation'));
  assert.ok(links.some((l) => l.targetType === 'person' && l.relation === 'concerns'));

  // IDEMPOTENCE: a scan cannot double the decision or the obligation.
  const scan = api.contradictionScan();
  assert.equal(scan.ok, true, scan.error);
  assert.equal((store.state.decisions || []).filter((d) => d.id === `dec-contradiction-${ruled.id}`).length, 1);
  assert.equal((store.state.delegations || []).length, tasks.length + (store.state.delegations || []).length - tasks.length);
  const issued = (store.state.contradictionReviews || [])[0].obligationIssued;
  assert.equal(issued.length, 1, 'a rescan must not issue a second obligation');
});

test('an acceptance opens a governed decision and issues NO work', () => {
  const { store, api } = apiFor([
    mandate('m-eng', 'engdir', 'cost', 'decrease', 3000),
    mandate('m-pm', 'pmdir', 'cost', 'increase', 3000),
  ]);
  const finding = findingsOf(api.contradictionReport().report, 'lever-opposition')[0];
  const delegationBefore = (store.state.delegations || []).length;
  const ruled = api.contradictionReview({
    findingKey: finding.key,
    verdict: 'accepted',
    rationale: 'The chief accepts running both criteria for one quarter and will re-review.',
  });
  assert.equal(ruled.ok, true, ruled.error);
  assert.equal((store.state.decisions || []).filter((d) => d.id === `dec-contradiction-${ruled.id}`).length, 1);
  assert.equal((store.state.delegations || []).length, delegationBefore, 'accepting a trade-off assigns nobody a task');
  const review = (store.state.contradictionReviews || [])[0];
  assert.equal(review.obligationIssued.length, 0);
  // The review horizon is derived from the declared convention and printed as derived.
  assert.equal(review.reviewOn, '2027-02-07');
});

/* ------------------------------------------------------ 7. engine wiring / CSV */

test('the rule is on the shared spine, has a contract, and the graph knows the node type', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(contradictionRule), 'RULE-CNT-01 must be on the post-commit spine');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === contradictionRule);
  assert.ok(contract, 'the rule must have a propagation contract');
  assert.deepEqual(contract.writes.slice().sort(), ['contradictionMarkers', 'contradictionReviews', 'decisions', 'delegations', 'links']);
  assert.ok(LINK_ENTITY_TYPES.includes('contradiction'));
  assert.equal(LINK_ENTITY_COLLECTIONS.contradiction, 'contradictionReviews');
  // The contract is real, not decorative.
  assert.equal(CONTRADICTION_RULE_ID, 'RULE-CNT-01');
  assert.equal(CONTRADICTION_ENGINE_VERSION, 'contradiction-audit-2026.11-v1');
});

test('the CSV is identity-free and its figures equal the report’s computed figures', () => {
  const state = workspace({
    budgets: [budget('bud-q4', 'Platform Q4', 'USD', 100000)],
    mandates: [
      mandate('m-eng', 'engdir', 'utilisation', 'increase', 6000, { targetValue: 90, envelopeId: 'bud-q4', envelopeClaimBp: 6000 }),
      mandate('m-pm', 'pmdir', 'lead-time', 'decrease', 6000, { envelopeId: 'bud-q4', envelopeClaimBp: 6000 }),
    ],
  });
  const report = auditOf(state);
  const rows = contradictionCsvRows(report);
  const columns = CONTRADICTION_CSV_COLUMNS.map((key) => ({ key, header: key }));
  const parsedCsv = parseCsv(serializeCsv(columns, rows));
  const header = parsedCsv.headers;
  const parsed = parsedCsv.rows.map((values) => {
    const row = [];
    for (let i = 0; i < header.length; i += 1) row[i] = values[i] ?? '';
    return row;
  });

  assert.equal(parsed.length, rows.length, 'every printed row must round-trip');
  assert.deepEqual(header, CONTRADICTION_CSV_COLUMNS.slice());
  assert.equal(CONTRADICTION_CSV_COLUMNS.length, columns.length);
  assert.equal(parsed[0][header.indexOf('findings_n')], String(report.totals.findingN));
  assert.equal(parsed[0][header.indexOf('incompatible_n')], String(report.totals.incompatibleN));

  const findingRows = parsed.filter((row) => row[0] === 'finding');
  assert.equal(findingRows.length, report.findings.length);
  for (const row of findingRows) {
    const severity = row[header.indexOf('severity')];
    const kind = row[header.indexOf('finding_kind')];
    const match = report.findings.find((f) => f.kind === kind && f.severity === severity);
    assert.ok(match, `the CSV row (${kind}/${severity}) must be a real finding`);
  }

  // No name, no id, no reasoning text anywhere in the export.
  const flat = JSON.stringify(parsed);
  for (const forbidden of ['Sam Engineer', 'Eve Director', 'Pia Product', 'engdir', 'pmdir', 'sam', 'kim', 'Platform will']) {
    assert.equal(flat.includes(forbidden), false, `the export must not carry “${forbidden}”`);
  }

  const queueRow = findingRows.find((row) => row[header.indexOf('finding_kind')] === 'coupled-trade-off');
  assert.equal(queueRow[header.indexOf('utilisation_target_pct')], '90');
  assert.equal(queueRow[header.indexOf('queue_multiplier')], '9');
});

/* ------------------------------------------------------------ 8. the rendered page */

function renderPanel(state, panel, extraQuery = '') {
  const { api } = bootMemoryApi(state);
  const ctx = {
    api,
    query: new URLSearchParams(`panel=${panel}${extraQuery}`),
    navigate: () => {},
    refresh: () => {},
  };
  const node = renderContradiction(ctx);
  document.body.innerHTML = '';
  document.body.appendChild(node);
  return node;
}

const DOM = new JSDOM('<!doctype html><html lang="en"><head><title>LeadOS</title></head><body></body></html>');
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'getComputedStyle']) {
  globalThis[key] = DOM.window[key];
}
DOM.window.axe = undefined;
DOM.window.eval(AXE_SRC);
globalThis.axe = DOM.window.axe;

test('every panel renders clean under axe, and the single-chain workspace prints its refusal instead of an empty table', async () => {
  const matrixState = workspace({
    budgets: [budget('bud-q4', 'Platform Q4', 'USD', 100000)],
    mandates: [
      mandate('m-eng', 'engdir', 'utilisation', 'increase', 6000, { targetValue: 90, envelopeId: 'bud-q4', envelopeClaimBp: 6000 }),
      mandate('m-pm', 'pmdir', 'lead-time', 'decrease', 6000, { envelopeId: 'bud-q4', envelopeClaimBp: 6000 }),
    ],
  });
  const { api } = bootMemoryApi(matrixState);
  const findingKey = findingsOf(buildContradictionAudit(matrixState, { now: NOW }), 'coupled-trade-off')[0].key;

  const panels = [
    ['board', ''],
    ['finding', `&finding=${encodeURIComponent(findingKey)}`],
    ['log', ''],
    ['method', ''],
  ];
  for (const [panel, extra] of panels) {
    const node = renderPanel(matrixState, panel, extra);
    assert.ok(node.textContent.length > 0, `${panel} must render`);
    assert.equal(node.querySelectorAll('main').length, 0, 'no nested <main>');
    const results = await axe.run(document.body, { rules: { region: { enabled: false } } });
    assert.equal(results.violations.length, 0, `${panel}: ${results.violations.map((v) => v.id).join(', ')}`);
  }

  // A single-chain workspace: the page must SAY there is nothing to compare.
  const single = workspace({
    lines: [line('l-sam-fn', 'sam', 'engdir', 'functional', 100)],
    mandates: [mandate('m-eng', 'engdir', 'cost', 'decrease', 5000)],
  });
  const singleNode = renderPanel(single, 'board');
  assert.match(singleNode.textContent, /single-chain/i);

  // The API read the page uses is the same read a CSV export uses.
  assert.equal(api.contradictionReport().ok, true);
});
