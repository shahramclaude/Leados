/**
 * tests/app/matrix-remedy.test.mjs — the Matrix Pattern Repair Register
 * (ADR-0175, Schema v139, `#/matrix?panel=remedies`, CSV scope #129).
 *
 * What the register must never get wrong:
 *  1. THE RECURRENCE IS THE CONCORDANCE'S. Patterns are read from the
 *     ADR-0145/0146 recurrence; the register's pattern count equals the
 *     concordance's own recurring count, asserted directly.
 *  2. NO VERDICT WITHOUT A RECORD THAT SUPPORTS ONE. Before the review date a
 *     remedy prints counts and no verdict. After it, a verdict needs a baseline
 *     and enough audited decisions in the review window — otherwise a printed
 *     refusal with its reason, never a zero, never a success.
 *  3. THE WRITE REFUSES WHAT IT CANNOT SUPPORT. An act against a pattern the
 *     record does not show, a second active remedy, an invented owner, an
 *     out-of-bounds review window, or a future decision date is refused.
 *  4. DISPLAY = STORED = COMPUTED. The panel's text and the CSV are checked
 *     against the report's own counts, and the report's counts are recomputed
 *     here from the raw decision log.
 *  5. IDENTITY-FREE EXPORT. The CSV names no owner, person, decision, line or
 *     remedy text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { buildRightsConcordance } from '../../app/core/domain/rightsConcordance.js';
import { buildMatrixRemedyReport, matrixRemedyCsvRows, remedyVerdict } from '../../app/core/domain/matrixRemedy.js';
import { createMatrixRemedyActions } from '../../app/core/domain/matrixRemedyActions.js';
import { normalizeMatrixRemedy, canonicalSignatureKey } from '../../app/core/domain/matrixRemedySchema.js';
import {
  MATRIX_REMEDY_CSV_COLUMNS,
  MATRIX_REMEDY_REFUSALS,
  MATRIX_REMEDY_VERDICT_KEYS,
} from '../../app/core/domain/matrixRemedyRegistry.js';
import { CSV_EXPORTS } from '../../app/core/csv.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const STAMP = '2026-10-01T00:00:00.000Z';

/* ------------------------------------------------------------------ fixtures */

function orgRoster() {
  return [
    { id: 'ceo', name: 'Ada Executive', level: 'vp', managerId: null, status: 'active', createdAt: STAMP },
    { id: 'vp1', name: 'Victor VP Eng', level: 'vp', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'pmdir', name: 'Pia Product', level: 'director', managerId: 'vp1', status: 'active', createdAt: STAMP },
    { id: 'dana', name: 'Dana Director', level: 'director', managerId: 'ceo', status: 'active', createdAt: STAMP },
    { id: 'sam', name: 'Sam Engineer', level: 'ic', managerId: 'pmdir', status: 'active', createdAt: STAMP },
    { id: 'kim', name: 'Kim Analyst', level: 'ic', managerId: 'pmdir', status: 'active', createdAt: STAMP },
    { id: 'lee', name: 'Lee Engineer', level: 'ic', managerId: 'dana', status: 'active', createdAt: STAMP },
  ];
}

function line(id, personId, managerId, kind, shareH, rights = [], extra = {}) {
  return {
    id, personId, managerId, kind,
    role: managerId === (orgRoster().find((p) => p.id === personId)?.managerId) ? 'primary' : 'secondary',
    shareH, rights,
    fromISO: extra.fromISO ?? '2026-10-01',
    toISO: extra.toISO ?? null,
    note: '',
    status: extra.status ?? 'active',
    declaredAt: STAMP, history: [], createdAt: STAMP, updatedAt: STAMP,
  };
}

/** Sam on two lines: a functional line under Pia and a project line under Victor. */
function baseLines() {
  return [
    line('l-sam-fn', 'sam', 'pmdir', 'functional', 60, ['priority', 'technical', 'performance'], { fromISO: '2026-01-01' }),
    line('l-sam-pj', 'sam', 'vp1', 'project', 40, ['priority'], { fromISO: '2026-01-01' }),
  ];
}

function decision(id, { date, approver, contributors = '' }) {
  return {
    id, title: `Decision ${id}`, question: '', date,
    reversibility: 'reversible', driver: 'Sam Engineer', approver,
    contributors, informed: '', options: [], chosen: 'Option A',
    rationale: 'A written rationale that is long enough to pass the quality bar.',
    reviewOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn: date, portfolioNotes: [], createdAt: STAMP,
  };
}

function caseRec(id, ownerId) {
  return { id, title: `Case ${id}`, status: 'open', severity: 3, ownerId, kind: 'initiative', openedOn: '2026-10-10', createdAt: STAMP };
}

function link(id, sourceId, targetId) {
  return { id, sourceType: 'case', sourceId, targetType: 'decision', targetId, relation: 'decides', ruleId: 'RULE-TEST', summary: '', createdOn: '2026-10-20', createdAt: STAMP };
}

/** A bypass: Ada (no declared right on Sam's lines) decides Sam's work. */
const BYPASS = (id, date) => ({ decision: decision(id, { date, approver: 'Ada Executive' }), caseId: `case-${id}` });
/** A clean decision: Pia holds priority; Victor (the other priority holder) is consulted. */
const CLEAN = (id, date) => ({ decision: decision(id, { date, approver: 'Pia Product', contributors: 'Victor VP Eng' }), caseId: `case-${id}` });

function workspace({ lines = baseLines(), rows = [], remedies = [], settings = {} } = {}) {
  const base = createEmptyState(STAMP);
  base.people = orgRoster();
  base.reportingLines = lines;
  base.decisions = rows.map((r) => r.decision);
  base.cases = rows.map((r) => caseRec(r.caseId, 'sam'));
  base.links = rows.map((r, i) => link(`lnk-${i}`, r.caseId, r.decision.id));
  base.matrixRemedies = remedies;
  base.settings = { ...base.settings, activeSeatId: null, ...settings };
  return normalizeState({ ...base }, { now: NOW }).state;
}

/** The first recurring signature the concordance itself reports. */
function signatureOf(state, kind = null) {
  const c = buildRightsConcordance(state, { now: NOW, settings: state.settings });
  const sigs = (c.recurrence?.signatures || []).filter((s) => s.decisionN >= 2 && (!kind || s.kind === kind));
  assert.ok(sigs.length >= 1, 'the fixture must produce a recurring pattern');
  return sigs[0].signatureKey;
}

/** The pattern for one signature — never `patterns[0]`, which is the largest, not the one under test. */
const patternFor = (report, sig) => {
  const p = report.allPatterns.find((x) => x.signatureKey === sig);
  assert.ok(p, 'the signature under test must be a recurring pattern in the report');
  return p;
};

const remedyRow = (overrides = {}) => ({
  id: 'mtxrmd-1',
  signatureKey: overrides.signatureKey,
  ownerId: 'pmdir',
  remedy: 'Pia signs off every decision on Sam’s work before it is taken.',
  basis: 'Three bypasses in one quarter.',
  decidedOn: '2026-09-10',
  reviewOn: '2026-10-10',
  declaredAt: '2026-09-10T09:00:00.000Z',
  declaredBySeatId: null,
  status: 'active',
  ...overrides,
});

/* ----------------------------------------------- 1. the recurrence is the concordance's */

test('a recurring bypass pattern is found, has no remedy, and the identities hold', () => {
  const state = workspace({ rows: [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20'), BYPASS('b3', '2026-09-05')] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  const bypass = report.allPatterns.find((p) => p.kind === 'bypass');
  assert.ok(bypass, 'the three bypasses recur as one structural pattern');
  assert.equal(bypass.decisionsN, 3);
  assert.equal(bypass.verdict, null);
  assert.equal(report.counts.unaddressedPatternN, report.counts.recurringPatternN, 'nothing has a remedy yet');
  assert.equal(report.counts.remediedPatternN, 0);
  assert.equal(report.identity.concordance, true, 'the register and the concordance count the same recurring patterns');
  assert.equal(report.identity.all, true);
});

test('a single decision is never a pattern: nothing recurs, and the reason is printed', () => {
  const state = workspace({ rows: [BYPASS('b1', '2026-08-12')] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  assert.equal(report.counts.recurringPatternN, 0);
  assert.equal(report.patterns.length, 0);
  assert.ok(report.emptyReason, 'an empty reading prints its reason rather than a reassuring zero');
  assert.equal(report.identity.all, true);
});

test('single-chain workspace: no declared line, no pattern, identities still hold', () => {
  const state = workspace({ lines: [], rows: [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20')] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  assert.equal(report.hasReportingLines, false);
  assert.equal(report.counts.recurringPatternN, 0);
  assert.equal(report.identity.all, true);
});

/* ----------------------------------------------- 2. verdicts: each one, and its refusal */

test('before the review date: running counts only, no verdict', () => {
  const rows = [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20'), BYPASS('b3', '2026-09-05'), BYPASS('b4', '2026-10-20')];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig, reviewOn: '2026-12-10' })] });
  const p = patternFor(buildMatrixRemedyReport(state, { now: NOW }), sig);
  assert.equal(p.remedyState, 'remedied');
  assert.equal(p.reviewDue, false);
  assert.equal(p.verdict, 'pending');
  assert.equal(p.verdictReason, null);
  assert.equal(p.afterDecisionsN, 1, 'the running count is printed as a count');
});

test('unchanged: as many matching decisions after the remedy as before it', () => {
  const rows = [
    BYPASS('b1', '2026-08-15'), BYPASS('b2', '2026-08-25'), BYPASS('b3', '2026-09-05'),
    BYPASS('a1', '2026-09-20'), BYPASS('a2', '2026-10-01'), BYPASS('a3', '2026-10-06'),
    CLEAN('c1', '2026-09-22'),
  ];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
  const p = patternFor(buildMatrixRemedyReport(state, { now: NOW }), sig);
  assert.equal(p.baselineDecisionsN, 3);
  assert.equal(p.afterDecisionsN, 3);
  assert.equal(p.verdict, 'unchanged');
});

test('reduced: fewer matching decisions after the remedy, but not none', () => {
  const rows = [
    BYPASS('b1', '2026-08-15'), BYPASS('b2', '2026-08-25'), BYPASS('b3', '2026-09-05'),
    BYPASS('a1', '2026-09-20'), CLEAN('c1', '2026-10-05'),
  ];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
  const p = patternFor(buildMatrixRemedyReport(state, { now: NOW }), sig);
  assert.equal(p.baselineDecisionsN, 3);
  assert.equal(p.afterDecisionsN, 1);
  assert.equal(p.verdict, 'reduced');
});

test('cleared: no matching decision in a review window that held enough audited decisions', () => {
  const rows = [
    BYPASS('b1', '2026-08-15'), BYPASS('b2', '2026-08-25'), BYPASS('b3', '2026-09-05'),
    CLEAN('c1', '2026-09-22'), CLEAN('c2', '2026-10-05'),
  ];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
  const p = patternFor(buildMatrixRemedyReport(state, { now: NOW }), sig);
  assert.equal(p.afterDecisionsN, 0);
  assert.equal(p.reviewWindowAuditedN, 2);
  assert.equal(p.verdict, 'cleared');
  assert.equal(p.verdictReason, null);
});

test('refused: no baseline — fewer than two matching decisions before the remedy', () => {
  const rows = [BYPASS('b1', '2026-08-20'), BYPASS('a1', '2026-09-20')];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
  const p = patternFor(buildMatrixRemedyReport(state, { now: NOW }), sig);
  assert.equal(p.baselineDecisionsN, 1);
  assert.equal(p.verdict, 'refused');
  assert.equal(p.verdictReason, MATRIX_REMEDY_REFUSALS.noBaseline);
});

test('refused: thin review — a quiet window cannot be told apart from a window nobody decided in', () => {
  const rows = [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20'), BYPASS('b3', '2026-09-05')];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
  const p = patternFor(buildMatrixRemedyReport(state, { now: NOW }), sig);
  assert.equal(p.afterDecisionsN, 0);
  assert.equal(p.reviewWindowAuditedN, 0);
  assert.equal(p.verdict, 'refused');
  assert.equal(p.verdictReason, MATRIX_REMEDY_REFUSALS.thinReview);
});

test('refused: two active remedies for one pattern — no verdict is read', () => {
  const rows = [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20'), BYPASS('b3', '2026-09-05'), CLEAN('c1', '2026-09-22'), CLEAN('c2', '2026-10-05')];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [
    remedyRow({ signatureKey: sig, id: 'r-1' }),
    remedyRow({ signatureKey: sig, id: 'r-2' }),
  ] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  const p = patternFor(report, sig);
  assert.equal(p.duplicateRemedyN, 2);
  assert.equal(p.verdict, 'refused');
  assert.equal(p.verdictReason, MATRIX_REMEDY_REFUSALS.duplicateActive);
  assert.equal(report.identity.all, true);
});

test('an owner no longer on the roster is shown as a defect, never repaired or named', () => {
  const rows = [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20')];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig, ownerId: 'ghost' })] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  const p = patternFor(report, sig);
  assert.equal(p.ownerMissing, true);
  assert.equal(p.ownerName, null);
  assert.equal(report.counts.ownerMissingN, 1);
});

test('a remedy naming a pattern this seat cannot see is counted as unmatched, never read', () => {
  const rows = [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20')];
  const ghostSig = canonicalSignatureKey('bypass', ['functional'], ['zzz-not-a-right']);
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: ghostSig })] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  assert.equal(report.counts.unmatchedRemedyN, 1);
  assert.equal(report.counts.activeRemedyN, 1);
  assert.equal(report.identity.remedies, true);
});

test('the pure verdict rule is ordered: duplicate, pending, baseline, review, then the after-count', () => {
  const base = { today: '2026-11-09', reviewOn: '2026-10-10', duplicate: false, baselineN: 3, reviewAuditedN: 2, afterN: 0 };
  assert.equal(remedyVerdict({ ...base, duplicate: true }).reason, MATRIX_REMEDY_REFUSALS.duplicateActive);
  assert.equal(remedyVerdict({ ...base, today: '2026-10-09' }).key, 'pending');
  assert.equal(remedyVerdict({ ...base, baselineN: 1 }).reason, MATRIX_REMEDY_REFUSALS.noBaseline);
  assert.equal(remedyVerdict({ ...base, reviewAuditedN: 1 }).reason, MATRIX_REMEDY_REFUSALS.thinReview);
  assert.equal(remedyVerdict(base).key, 'cleared');
  assert.equal(remedyVerdict({ ...base, afterN: 1 }).key, 'reduced');
  assert.equal(remedyVerdict({ ...base, afterN: 3 }).key, 'unchanged');
  assert.deepEqual(MATRIX_REMEDY_VERDICT_KEYS, ['pending', 'refused', 'unchanged', 'reduced', 'cleared']);
});

/* ----------------------------------------------- 3. the governed write refuses what it cannot support */

function storeOf(state) {
  return {
    state,
    update(fn) { fn(this.state); },
  };
}

test('declare: refuses a pattern the record does not show, a bad owner, bad text, bad dates; accepts one valid act', () => {
  const rows = [BYPASS('b1', '2026-08-12'), BYPASS('b2', '2026-08-20'), BYPASS('b3', '2026-09-05')];
  const state = workspace({ rows });
  const store = storeOf(state);
  const sig = signatureOf(state, 'bypass');
  const actions = createMatrixRemedyActions(store, { now: () => NOW, idFactory: () => 'mtxrmd-fixed' });
  const good = {
    signatureKey: sig, ownerId: 'pmdir',
    remedy: 'Pia signs off every decision on Sam’s work before it is taken.',
    decidedOn: '2026-09-10', reviewOn: '2026-10-10', basis: 'Three bypasses.',
  };

  assert.equal(actions.matrixRemedyDeclare({ ...good, signatureKey: canonicalSignatureKey('bypass', ['functional'], ['nope']) }).ok, false);
  assert.equal(actions.matrixRemedyDeclare({ ...good, ownerId: 'ghost' }).ok, false);
  assert.equal(actions.matrixRemedyDeclare({ ...good, ownerId: '' }).ok, false);
  assert.equal(actions.matrixRemedyDeclare({ ...good, remedy: 'too short' }).ok, false);
  assert.equal(actions.matrixRemedyDeclare({ ...good, decidedOn: '2026-11-20' }).ok, false, 'a decision cannot be dated after today');
  assert.equal(actions.matrixRemedyDeclare({ ...good, reviewOn: '2026-09-15' }).ok, false, 'review window below the minimum');
  assert.equal(actions.matrixRemedyDeclare({ ...good, reviewOn: '2028-01-01' }).ok, false, 'review window above the maximum');
  assert.equal(actions.matrixRemedyDeclare({ ...good, reviewOn: 'next month' }).ok, false);
  assert.equal(state.matrixRemedies.length, 0, 'every refusal leaves the record untouched');

  const ok = actions.matrixRemedyDeclare(good);
  assert.equal(ok.ok, true, ok.error);
  assert.equal(state.matrixRemedies.length, 1);
  const stored = state.matrixRemedies[0];
  assert.deepEqual(normalizeMatrixRemedy(stored), stored, 'the stored row is already in its canonical form');
  assert.equal(stored.verdict, undefined, 'no verdict is ever stored');

  const report = buildMatrixRemedyReport(state, { now: NOW });
  assert.equal(report.counts.remediedPatternN, 1);
  const shown = patternFor(report, sig);
  assert.equal(shown.ownerName, 'Pia Product', 'the owner printed is the owner stored');
  assert.equal(shown.reviewOn, '2026-10-10');

  const again = actions.matrixRemedyDeclare(good);
  assert.equal(again.ok, false, 'a second active remedy for one pattern is refused');
  assert.equal(state.matrixRemedies.length, 1);
});

test('declare: a pattern with no recurrence on the record cannot be given a remedy', () => {
  const state = workspace({ rows: [BYPASS('b1', '2026-08-12')] });
  const actions = createMatrixRemedyActions(storeOf(state), { now: () => NOW, idFactory: () => 'x' });
  const res = actions.matrixRemedyDeclare({
    signatureKey: canonicalSignatureKey('bypass', ['functional', 'project'], ['priority']),
    ownerId: 'pmdir', remedy: 'A remedy that is long enough to pass the length check.',
    decidedOn: '2026-09-10', reviewOn: '2026-10-10',
  });
  assert.equal(res.ok, false);
  assert.equal(state.matrixRemedies.length, 0);
});

/* ----------------------------------------------- 4. display = stored = computed; identity-free export */

test('the CSV is identity-free, and its counts equal the report and the raw recount', () => {
  const rows = [BYPASS('b1', '2026-08-15'), BYPASS('b2', '2026-08-25'), BYPASS('b3', '2026-09-05'), CLEAN('c1', '2026-09-22'), CLEAN('c2', '2026-10-05')];
  const sig = signatureOf(workspace({ rows }), 'bypass');
  const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
  const report = buildMatrixRemedyReport(state, { now: NOW });
  const csv = matrixRemedyCsvRows(report);

  assert.deepEqual(Object.keys(csv[0]), MATRIX_REMEDY_CSV_COLUMNS);
  const summary = (label) => csv.find((r) => r.row_kind === 'summary' && r.label === label);
  assert.equal(summary('Recurring structural patterns').bucket_n, report.counts.recurringPatternN);
  assert.equal(summary('Verdict: Cleared in the review window').bucket_n, 1);

  const patternRows = csv.filter((r) => r.row_kind === 'pattern');
  assert.equal(patternRows.length, report.allPatterns.length, 'every recurring pattern is exported, not only the shown ones');
  const serialized = JSON.stringify(csv);
  for (const secret of ['Pia Product', 'Ada Executive', 'Sam Engineer', 'Pia signs off', 'b1', 'mtxrmd-1']) {
    assert.equal(serialized.includes(secret), false, `the export must not carry "${secret}"`);
  }
  assert.ok(CSV_EXPORTS.some((e) => e.key === 'matrix-remedies' && e.sensitive === false && e.group === 'analytics'));
});

test('the panel renders the report’s own figures in JSDOM, and an unreadable verdict prints its reason', async () => {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event']) globalThis[key] = dom.window[key];
  try {
    const { renderMatrixRemedyPanel } = await import('../../app/views/matrixRemedyPanel.js');
    const rows = [BYPASS('b1', '2026-08-20'), BYPASS('a1', '2026-09-20')];
    const sig = signatureOf(workspace({ rows }), 'bypass');
    const state = workspace({ rows, remedies: [remedyRow({ signatureKey: sig })] });
    const report = buildMatrixRemedyReport(state, { now: NOW });
    const shown = patternFor(report, sig);
    const node = renderMatrixRemedyPanel({ state, api: {}, toast() {} }, { now: NOW });
    dom.window.document.body.replaceChildren(node);
    const text = dom.window.document.body.textContent;
    assert.ok(text.includes(shown.verdictLabel), 'the verdict label printed is the report’s');
    assert.ok(text.includes(MATRIX_REMEDY_REFUSALS.noBaseline), 'the refusal reason is printed, not hidden');
    assert.ok(text.includes(`Recurring patterns`));
    assert.ok(text.includes(`Before: ${shown.baselineDecisionsN} matching`));
    assert.ok(text.includes(`After: ${shown.afterDecisionsN} matching`));
    assert.ok(text.includes('Pia Product'), 'the owner printed is the owner stored');
  } finally {
    dom.window.close();
  }
});

/* ----------------------------------------------- 5. schema: additive, fail-closed, no stored verdict */

test('schema v139: the collection is empty on upgrade, malformed rows are dropped with a warning, and nothing is repaired', () => {
  assert.equal(SCHEMA_VERSION, 154);
  const migrated = migrate({ schemaVersion: 138, appId: 'leados', meta: {}, settings: {} });
  assert.equal(migrated.raw.schemaVersion, 154);
  assert.deepEqual(migrated.raw.matrixRemedies, []);

  const valid = remedyRow({ signatureKey: canonicalSignatureKey('bypass', ['functional', 'project'], ['priority']) });
  const nonCanonical = remedyRow({ id: 'bad-1', signatureKey: JSON.stringify(['bypass', ['project', 'functional'], ['priority']]) });
  const retired = remedyRow({ id: 'bad-2', status: 'superseded' });
  const noOwner = remedyRow({ id: 'bad-3', ownerId: '' });
  const state = normalizeState({ ...createEmptyState(STAMP), matrixRemedies: [valid, nonCanonical, retired, noOwner] }, { now: NOW });
  assert.equal(state.state.matrixRemedies.length, 1, 'only the canonical, active, owned row survives');
  assert.equal(state.state.matrixRemedies[0].id, 'mtxrmd-1');
  assert.ok(state.warnings.some((w) => w.collection === 'matrixRemedies' && w.dropped === 3), 'the drop is counted and printed');
});
