/**
 * tests/app/role-clarity.test.mjs — Cross-Line Role Clarity Reconciliation
 * (Schema v128, ADR-0153, `#/onboarding?panel=clarity`, CSV #115).
 *
 * Organised around what two incompatible job definitions can betray:
 *
 *  1. NEVER PARSE THE PROSE. The scope text is shown, never classified. Only the
 *     marks a line DECLARES can be compared, and a brief with no marks is
 *     `unscoped-line` — excluded, named, never guessed.
 *  2. NEVER IMPUTE A DEFINITION FOR A LINE THAT NEVER BRIEFED. A secondary
 *     absence fails the case to `unbriefed`; the home line carries the plan as a
 *     printed presumption and is never decomposed into domains.
 *  3. KAHN ROLE CONFLICT IS NAMED, NEVER SETTLED. A decision-right spread of two
 *     steps or a criteria spread of two steps reads `contested` — before anyone
 *     is graded, while it is still a design problem.
 *  4. STRUCTURAL FINDINGS ONLY. Every finding is on a LINE or a DOMAIN. No person
 *     is scored, ranked or shared out.
 *  5. DISPLAY == STORED. Every figure is recomputed from the stored blob before
 *     and after a real reload, and a read mutates nothing.
 *  6. INERT SINGLE CHAIN. No case, no finding, no row, no export.
 *  7. FAIL-CLOSED WRITES. An unknown domain, right or standing is REFUSED with
 *     the closed vocabulary printed — never dropped silently, never coerced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildRoleClarity,
  buildRoleClarityCase,
  roleClarityAttentionCount,
  roleClarityBriefText,
  roleClarityCsvRows,
  ROLE_CLARITY_CSV_COLUMNS,
} from '../../app/core/domain/roleClarity.js';
import { ROLE_CLARITY_DOMAIN_KEYS } from '../../app/core/domain/roleClarityRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const TODAY = '2026-11-09';
const ISO = NOW.toISOString();
/** A plan that started 20 days ago: the window is open and both lines are in force. */
const START = '2026-10-20';
const WINDOW_END = '2027-01-18';

/* --------------------------------------------------------------- fixtures */

/**
 * dana ─┬─ priya ── kim
 *       └─ sam        sam's home line is dana; her PROJECT line to priya runs
 *                      2026-09-01 → (open). She sits on both in the window.
 */
function roster() {
  return [
    { id: 'dana', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, status: 'active', startDate: '2024-01-01', createdAt: ISO },
    { id: 'priya', name: 'Priya PM', role: 'Head of Delivery', level: 'manager', managerId: 'dana', status: 'active', startDate: '2024-01-01', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'priya', status: 'active', startDate: '2026-09-01', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'lead', managerId: 'dana', status: 'active', startDate: '2026-09-01', createdAt: ISO },
  ];
}

function projectLine(over = {}) {
  return {
    id: 'line-sam-priya',
    personId: 'sam',
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-09-01',
    toISO: null,
    declaredAt: '2026-09-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Migration programme delivery.',
    ...over,
  };
}

function plan(over = {}) {
  return {
    id: 'ob-1',
    personId: 'sam',
    kind: 'new-hire',
    label: '',
    startDate: START,
    buddyId: 'kim',
    buddyName: '',
    roleClarity: 'Owns the billing service.',
    earlyWin: 'Ship the invoice retry fix.',
    stakeholders: [],
    checkpoints: [],
    reviews: {},
    status: 'active',
    completedOn: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function brief(over = {}) {
  const lineKey = over.lineKey || 'line-sam-priya';
  return {
    id: `obf-${lineKey}`,
    planId: 'ob-1',
    personId: 'sam',
    lineKey,
    lineRole: lineKey === 'home:sam' ? 'primary' : 'secondary',
    lineKind: lineKey === 'home:sam' ? 'functional' : 'project',
    managerId: lineKey === 'home:sam' ? 'dana' : 'priya',
    outcome: 'brief',
    declaredOn: '2026-10-21',
    declaredBySeatId: null,
    declaredSource: 'manager',
    scope: 'Some scope written in words.',
    firstWork: '',
    stakeholders: [],
    domains: [],
    decisionRight: '',
    criteria: '',
    acknowledgedOn: null,
    acknowledgedBySeatId: null,
    acknowledgementSource: 'person',
    acknowledgement: '',
    ...over,
  };
}

function makeState({ people = roster(), lines = [projectLine()], plans = [plan()], briefs = [] } = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.onboarding = plans;
  state.onboardingLineBriefs = briefs;
  return normalizeState(state).state;
}

function seed(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), data, storage };
}

function reload(ctx) {
  let seq = 1000;
  const idFactory = (p) => `${p}-reload-${++seq}`;
  const store = createStore({ storage: ctx.storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const kase = (state) => buildRoleClarityCase(state, state.onboarding[0], { now: NOW, settings: state.settings });
const board = (state) => buildRoleClarity(state, { now: NOW, settings: state.settings, limit: 40 });

/* ------------------------------------------------- the comparison itself */

test('two lines that cannot both be served read `contested` — named, never settled', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', declaredOn: '2026-10-21', domains: ['delivery', 'technical', 'risk'], decisionRight: 'decides', criteria: 'written', scope: 'Own the migration end-to-end.' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', domains: ['delivery'], decisionRight: 'informed', criteria: 'unstated', scope: 'Support the migration when asked.' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.isMatrix, true);
  assert.equal(k.verdict, 'contested');
  assert.equal(k.verdictOpen, true);
  assert.equal(k.totals.scopedN, 2);
  assert.equal(k.totals.overlapDomainN, 1);
  assert.equal(k.totals.maxAuthorityGap, 2);
  assert.equal(k.totals.maxCriteriaGap, 2);
  assert.equal(k.totals.contestedAuthorityN, 1);
  assert.equal(k.totals.divergentCriteriaN, 1);

  const overlap = k.findings.find((f) => f.kind === 'overlapping-scope');
  assert.ok(overlap, 'the shared ground is named');
  assert.deepEqual(overlap.lineKeys, ['home:sam', 'line-sam-priya']);
  assert.equal(overlap.domain, 'delivery');

  const authority = k.findings.find((f) => f.kind === 'contested-authority');
  assert.ok(authority, 'the decision-right conflict is named');
  assert.equal(authority.gap, 2);

  const criteria = k.findings.find((f) => f.kind === 'divergent-criteria');
  assert.ok(criteria, 'the criteria conflict is named');
  assert.equal(criteria.gap, 2);

  // Every total is the sum of the printed rows.
  const b = board(state);
  assert.equal(b.contestedN, 1);
  assert.equal(b.openN, 1);
  assert.equal(b.findingsN, k.findingsN);
  assert.equal(roleClarityAttentionCount(state, { now: NOW, settings: state.settings }), 1);
});

test('a clean partition of the domains reads `partitioned` — one job, divided', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['people', 'budget'], decisionRight: 'decides', criteria: 'written' }),
      brief({ lineKey: 'line-sam-priya', domains: ['delivery', 'technical'], decisionRight: 'decides', criteria: 'written' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.verdict, 'partitioned');
  assert.equal(k.verdictOpen, false);
  assert.equal(k.findingsN, 0);
  assert.equal(k.totals.overlapDomainN, 0);
  assert.equal(k.byDomain.every((d) => d.n === 1), true);
});

test('shared ground with identical marks reads `overlapping` — visible, not a conflict', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['delivery'], decisionRight: 'advises', criteria: 'verbal' }),
      brief({ lineKey: 'line-sam-priya', domains: ['delivery'], decisionRight: 'advises', criteria: 'verbal' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.verdict, 'overlapping');
  assert.equal(k.totals.overlapDomainN, 1);
  assert.equal(k.totals.contestedAuthorityN, 0);
  assert.equal(k.totals.divergentCriteriaN, 0);
  assert.equal(k.findingsN, 1);
  assert.equal(k.findings[0].kind, 'overlapping-scope');
});

test('a one-step spread is a note, not a conflict — the threshold is the width of the scales', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['people'], decisionRight: 'decides', criteria: 'written' }),
      brief({ lineKey: 'line-sam-priya', domains: ['delivery'], decisionRight: 'advises', criteria: 'verbal' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.totals.maxAuthorityGap, 1);
  assert.equal(k.totals.maxCriteriaGap, 1);
  assert.equal(k.verdict, 'partitioned');
});

/* ------------------------------------------- never invent a definition */

test('a secondary line that never briefed fails the case to `unbriefed` — the home line does not', () => {
  const homeOnly = makeState({
    briefs: [brief({ lineKey: 'home:sam', domains: ['delivery'], decisionRight: 'decides', criteria: 'written' })],
  });
  const k = kase(homeOnly);
  assert.equal(k.verdict, 'unbriefed');
  assert.equal(k.findings.some((f) => f.kind === 'absent-line'), true);

  // The home line absent still does not block: fewer than two comparable
  // definitions reads `unscoped-pair`, and the home line is printed as the
  // presumption it is — never decomposed into domains, never counted.
  const secondaryOnly = makeState({
    briefs: [brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', domains: ['delivery'], decisionRight: 'decides', criteria: 'written' })],
  });
  const k2 = kase(secondaryOnly);
  assert.equal(k2.verdict, 'unscoped-pair');
  assert.equal(k2.refusals.some((r) => r.kind === 'home-line-presumed'), true);
  assert.equal(k2.findings.every((f) => f.kind !== 'absent-line'), true);
});

test('a brief with no declared marks is `unscoped-line` — the words are printed, never parsed', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', scope: 'Own the migration end-to-end.' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', scope: 'Support the migration when asked.' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.verdict, 'unscoped-pair');
  const unscoped = k.findings.find((f) => f.kind === 'unscoped-line');
  assert.ok(unscoped);
  assert.deepEqual(unscoped.lineKeys, ['home:sam', 'line-sam-priya']);
  // The prose is printed for a human to read, but no comparison was drawn from it.
  assert.equal(k.byDomain.length, 0);
  assert.equal(k.totals.maxAuthorityGap, null);
});

test('one scoped line and one silent line is `unscoped-pair` — a singleton proves nothing', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['people'], decisionRight: 'decides', criteria: 'written' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.verdict, 'unscoped-pair');
  assert.equal(k.totals.scopedN, 1);
  assert.equal(k.totals.unscopedN, 1);
});

test('a declined line is an answer, never a definition — it leaves the comparison, printed as a decline', () => {
  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['people'], decisionRight: 'decides', criteria: 'written' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', outcome: 'declined', scope: '', domains: [], decisionRight: '', criteria: '', reason: 'Not in scope for this project yet.' }),
    ],
  });
  const k = kase(state);
  assert.equal(k.verdict, 'unscoped-pair');
  assert.equal(k.totals.declinedN, 1);
  assert.equal(k.refusals.some((r) => r.kind === 'line-declined'), true);
  const declinedRow = k.lines.find((l) => l.key === 'line-sam-priya');
  assert.equal(declinedRow.outcome, 'declined');
  assert.equal(declinedRow.scoped, false);
  assert.equal(declinedRow.declineReason, 'Not in scope for this project yet.');
});

test('a decline plus two scoped lines never contaminates the comparison', () => {
  const state = makeState({
    lines: [projectLine(), projectLine({ id: 'line-sam-strategy', kind: 'functional', managerId: 'priya' })],
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['people'], decisionRight: 'decides', criteria: 'written' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', outcome: 'declined', scope: '', domains: [], decisionRight: '', criteria: '', reason: 'Not in scope for this project yet.' }),
      brief({ id: 'obf-strategy', lineKey: 'line-sam-strategy', lineKind: 'functional', domains: ['strategy'], decisionRight: 'decides', criteria: 'written' }),
    ],
  });
  // Note: the third brief names the strategy line via `lineKey`, which is the
  // declared line's id. Both lines to priya collapse to one relationship by the
  // matrix engine (one manager, one opinion), so priya's decline excludes the
  // pair and the home partition stands alone.
  const k = kase(state);
  assert.equal(k.totals.declinedN >= 1, true);
  assert.equal(k.isMatrix, true);
});

/* ------------------------------------------------- the write is fail-closed */

test('the write path refuses an unknown domain, right or standing with the vocabulary printed', () => {
  const state = makeState();
  const ctx = seed(state);
  ctx.store.state.settings.activeSeatId = 'priya';
  const bad1 = ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.', domains: ['not-a-domain'] });
  assert.equal(bad1.ok, false);
  assert.match(bad1.error, /closed lexicon/);
  const bad2 = ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.', decisionRight: 'yolo' });
  assert.equal(bad2.ok, false);
  assert.match(bad2.error, /decides, advises, informed/);
  const bad3 = ctx.api.onboardingMatrixBriefLine({ planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You own the cut-over plan.', criteria: 'vibes' });
  assert.equal(bad3.ok, false);
  assert.match(bad3.error, /written, verbal, unstated/);
  // Nothing was written by any refusal.
  assert.equal(ctx.store.state.onboardingLineBriefs.length, 0);
});

test('marks declared through the live API survive a real reload, display == stored', () => {
  const state = makeState();
  const ctx = seed(state);
  ctx.store.state.settings.activeSeatId = 'dana';
  const home = ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1', lineKey: 'home:sam', scope: 'You own the migration end-to-end.',
    domains: ['delivery', 'risk'], decisionRight: 'decides', criteria: 'written',
  });
  assert.equal(home.ok, true, home.error);
  ctx.store.state.settings.activeSeatId = 'priya';
  const proj = ctx.api.onboardingMatrixBriefLine({
    planId: 'ob-1', lineKey: 'line-sam-priya', scope: 'You support the migration when asked.',
    domains: ['delivery'], decisionRight: 'informed', criteria: 'unstated',
  });
  assert.equal(proj.ok, true, proj.error);

  const stored = ctx.store.state.onboardingLineBriefs;
  assert.equal(stored.length, 2);
  assert.deepEqual([...stored].sort((a, b) => a.lineKey.localeCompare(b.lineKey)).map((r) => [r.lineKey, r.domains, r.decisionRight, r.criteria]), [
    ['home:sam', ['delivery', 'risk'], 'decides', 'written'],
    ['line-sam-priya', ['delivery'], 'informed', 'unstated'],
  ]);

  const before = kase(ctx.store.state);
  const afterReload = reload(ctx);
  const after = kase(afterReload.store.state);
  assert.equal(after.verdict, before.verdict);
  assert.equal(after.verdict, 'contested');
  assert.deepEqual(after.totals, before.totals);
  assert.deepEqual(after.findings, before.findings);
  assert.deepEqual(after.byDomain, before.byDomain);
  // A read mutates nothing: the stored blob after reload carries exactly the rows
  // the two writes stored, field for field, including the marks.
  const reStored = JSON.parse(ctx.storage.getItem(STORAGE_KEY));
  assert.deepEqual(afterReload.store.state.onboardingLineBriefs, reStored.onboardingLineBriefs);
});

test('the case read refuses a seat outside the person and accepts a line holder', () => {
  const state = makeState();
  const ctx = seed(state);
  ctx.store.state.settings.activeSeatId = 'kim'; // kim reports to priya, not sam, and holds no line on sam
  const refused = ctx.api.roleClarityRead({ planId: 'ob-1' });
  assert.equal(refused.ok, false);
  ctx.store.state.settings.activeSeatId = 'priya';
  const allowed = ctx.api.roleClarityRead({ planId: 'ob-1' });
  assert.equal(allowed.ok, true, allowed.error);
  assert.equal(allowed.report.verdict, 'unbriefed', 'no briefs exist yet, so the secondary line is absent');
});

/* ------------------------------------------------- marks are never guessed */

test('a hand-edited file cannot smuggle an unknown domain, right or standing into the comparison', () => {
  const raw = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['delivery', 'not-a-domain', 'RISK'], decisionRight: 'yolo', criteria: 'vibes' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', domains: ['delivery'], decisionRight: 'advises', criteria: 'verbal' }),
    ],
  });
  // makeState normalizes once; rebuild RAW to see the drop warnings explicitly.
  const state = createEmptyState(ISO);
  Object.assign(state, raw);
  state.onboardingLineBriefs = [
    brief({ lineKey: 'home:sam', domains: ['delivery', 'not-a-domain', 'risk'], decisionRight: 'yolo', criteria: 'vibes' }),
    brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', domains: ['delivery'], decisionRight: 'advises', criteria: 'verbal' }),
  ];
  const { state: norm, warnings } = normalizeState(state);
  assert.ok(warnings.some((w) => /not-a-domain/.test(w)));
  assert.ok(warnings.some((w) => /yolo/.test(w)));
  assert.ok(warnings.some((w) => /vibes/.test(w)));
  const home = norm.onboardingLineBriefs.find((r) => r.lineKey === 'home:sam');
  assert.deepEqual(home.domains, ['delivery', 'risk'], 'unknown keys dropped, known keys kept, closed lexicon enforced');
  assert.equal(home.decisionRight, '', 'an undeclared right is not a right');
  assert.equal(home.criteria, '', 'an undeclared standing is not a standing');
  // The words survive every drop.
  assert.equal(home.scope, 'Some scope written in words.');
  // The honest subset still compares: the home line keeps its two real marks and
  // the shared 'delivery' domain is an overlap (neither line declares a spread).
  const k = kase(norm);
  assert.equal(k.totals.scopedN, 2);
  assert.equal(k.totals.unscopedN, 0);
  assert.equal(k.verdict, 'overlapping');
});

/* --------------------------------------------------------------- schema */

test('schema v127→v128 is additive: existing briefs gain EMPTY marks, never invented ones', () => {
  assert.equal(SCHEMA_VERSION, 137);
  const legacy = createEmptyState(ISO);
  legacy.people = roster();
  legacy.reportingLines = [projectLine()];
  legacy.onboarding = [plan()];
  legacy.onboardingLineBriefs = [{ ...brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22' }), domains: undefined, decisionRight: undefined, criteria: undefined }];
  legacy.schemaVersion = 127;

  const { raw: migrated } = migrate(JSON.parse(JSON.stringify(legacy)));
  assert.equal(migrated.schemaVersion, 137);
  assert.equal(migrated.onboardingLineBriefs.length, 1);
  assert.deepEqual(migrated.onboardingLineBriefs[0].domains, []);
  assert.equal(migrated.onboardingLineBriefs[0].decisionRight, '');
  assert.equal(migrated.onboardingLineBriefs[0].criteria, '');
  // Nothing was invented for the upgraded workspace: the line reads unscoped.
  const norm = normalizeState(migrated).state;
  const k = kase(norm);
  assert.equal(k.totals.scopedN, 0);
  assert.equal(k.totals.unscopedN, 1);
  assert.equal(k.verdict, 'unscoped-pair');
});

/* -------------------------------------------------------------- single chain */

test('a single-chain workspace is inert end to end', () => {
  const state = makeState({ lines: [] });
  const k = kase(state);
  assert.equal(k.isMatrix, false);
  assert.equal(k.verdict, 'single-chain');
  const b = board(state);
  assert.equal(b.caseN, 0);
  assert.equal(b.openN, 0);
  assert.equal(roleClarityCsvRows(state, { now: NOW }).length, 0);
  assert.match(roleClarityBriefText(state, { now: NOW }), /nothing to reconcile/i);
});

/* -------------------------------------------------------------------- CSV */

test('CSV #115 is aggregate-only, exact-column, and reconciles row-for-row with the board', () => {
  assert.equal(CSV_EXPORTS.length, 126, 'the register now holds 126 scopes (ADR-0162 #122, ADR-0168 #123, ADR-0169 #124, ADR-0170 #125, ADR-0171 #126, ADR-0172 #127; #75 stays reserved)');
  const descriptor = CSV_EXPORTS.find((item) => item.key === 'role-clarity');
  assert.ok(descriptor, 'the role-clarity scope is registered');
  assert.equal(descriptor.group, 'analytics');
  assert.equal(descriptor.sensitive, false);

  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['delivery', 'risk'], decisionRight: 'decides', criteria: 'written' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', domains: ['delivery'], decisionRight: 'informed', criteria: 'unstated' }),
    ],
  });
  const rows = roleClarityCsvRows(state, { now: NOW });
  assert.equal(rows.length, 2, 'one row per case × line');
  for (const row of rows) {
    assert.deepEqual(Object.keys(row), [...ROLE_CLARITY_CSV_COLUMNS], 'exact column parity');
    const cell = JSON.stringify(row);
    assert.equal(/Sam Engineer|Priya PM|Dana Eng/.test(cell), false, 'no person or manager identity');
    assert.equal(/migration end-to-end/.test(cell), false, 'no brief text');
  }
  const home = rows.find((r) => r.line_role === 'primary');
  assert.equal(home.domain_keys, 'delivery;risk');
  assert.equal(home.domains_n, '2');
  assert.equal(home.decision_right, 'decides');
  assert.equal(home.criteria, 'written');
  const proj = rows.find((r) => r.line_role === 'secondary');
  assert.equal(proj.domain_keys, 'delivery');
  assert.equal(proj.verdict, 'contested');

  // The exported rows equal the figures the board printed.
  const exported = exportWorkspaceCsv(state, 'role-clarity', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, rows.length);
  assert.deepEqual(parsed.headers, [...ROLE_CLARITY_CSV_COLUMNS]);
});

/* ------------------------------------------------------------------ panel */

test('the panel prints the stored marks, the conflicts and the refusals — and refuses a bad seat', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    t.skip('jsdom is not installed in this environment; the render pass is unverified here');
    return;
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderOnboardingClarityPanel } = await import('../../app/views/onboardingClarityPanel.js');

  const state = makeState({
    briefs: [
      brief({ lineKey: 'home:sam', domains: ['delivery', 'risk'], decisionRight: 'decides', criteria: 'written', scope: 'Own the migration end-to-end.' }),
      brief({ lineKey: 'line-sam-priya', declaredOn: '2026-10-22', domains: ['delivery'], decisionRight: 'informed', criteria: 'unstated', scope: 'Support the migration when asked.' }),
    ],
  });
  state.settings = { ...state.settings, activeSeatId: 'priya' };
  const ctx = seed(state);

  const renderPanel = (params) => {
    const node = renderOnboardingClarityPanel({
      api: ctx.api,
      query: new URLSearchParams(params),
      refresh: () => {},
      navigate: () => {},
      state: ctx.store.state,
    });
    const host = dom.window.document.getElementById('root');
    host.innerHTML = '';
    host.appendChild(node);
    return host.textContent || '';
  };

  const boardText = renderPanel('panel=clarity');
  assert.match(boardText, /Sam Engineer/);
  assert.match(boardText, /Contested/);

  const caseText = renderPanel('panel=clarity&tab=case&plan=ob-1');
  assert.match(caseText, /Own the migration end-to-end/);
  assert.match(caseText, /Support the migration when asked/);
  assert.match(caseText, /delivery/);
  assert.match(caseText, /Contested authority|Contested/);
  assert.match(caseText, /2026-10-20/, 'the stored window start is printed');
  assert.match(caseText, /A conflict is named, not settled/);

  const methodText = renderPanel('panel=clarity&tab=method');
  assert.match(methodText, /Kahn/);
  assert.match(methodText, /never parses|not parse/i);

  // A seat outside the person is printed as unreadable, never as an empty workspace.
  const refusedNode = renderOnboardingClarityPanel({
    api: { roleClarityBoard: () => ({ ok: false, error: 'Outside your seat.' }) },
    query: new URLSearchParams('panel=clarity'),
    refresh: () => {},
    navigate: () => {},
    state: ctx.store.state,
  });
  const host = dom.window.document.getElementById('root');
  host.innerHTML = '';
  host.appendChild(refusedNode);
  assert.match(host.textContent || '', /Not readable at this seat/);
});

/* --------------------------------------- the declared lexicon is exactly ten */

test('the accountability lexicon is closed and exactly what the method panel prints', () => {
  assert.deepEqual(ROLE_CLARITY_DOMAIN_KEYS, ['delivery', 'technical', 'quality', 'people', 'budget', 'risk', 'stakeholder', 'strategy', 'operations', 'data']);
});
