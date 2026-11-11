/**
 * tests/app/merit-parity.test.mjs — Matrix Merit Pool Stewardship & Cohort Parity
 * (ADR‑0154, Schema v128 unchanged, `#/merit?panel=matrix`, CSV scope #116).
 *
 * Organised around what a pay pool can betray in a matrix:
 *
 *  1. THE STRUCTURE IS READ ON THE EFFECTIVE DATE. A project line that ended
 *     before the money lands, or starts after it, does not make the person
 *     matrix — and a line that was in force does, even if it is gone today.
 *  2. PAY AUTHORITY IS NAMED, NEVER SETTLED. Two declared lines holding the
 *     `pay` right is `contested`; nobody holding it is `unowned`; a person the
 *     roster no longer has is `unknown`, never assumed clear.
 *  3. A THIN COHORT PRINTS NOTHING. Below the declared floor the median and the
 *     gap are BLANK with the reason printed — never a zero, never a two-person
 *     anecdote.
 *  4. A PARTIAL TABLE BLOCKS THE COMPARISON. One unpriced row makes the whole
 *     reading `incomplete`; the row is counted and excluded, never read as a zero
 *     increase.
 *  5. THE GAP IS DESCRIPTIVE. Direction is printed, causation is not, and the
 *     declared band is a convention rather than significance.
 *  6. DISPLAY == STORED. Every figure is recomputed from the stored cycle, the
 *     roster and the dated lines before and after a real reload, and a read
 *     mutates nothing.
 *  7. THE EXPORT CARRIES NO IDENTITY. No person, name, manager id, salary or
 *     individual increase; a withheld figure is BLANK with its reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildMeritParity,
  meritParityAttentionCount,
  meritParityBriefText,
  meritParityCsvRows,
  MERIT_PARITY_CSV_COLUMNS,
  MERIT_PARITY_EXPORT_COLUMNS,
} from '../../app/core/domain/meritParity.js';
import {
  MERIT_PARITY_AUTHORITY_STATES,
  MERIT_PARITY_CONVENTIONS,
  MERIT_PARITY_FLOOR,
  MERIT_PARITY_TOLERANCE_BPS,
  MERIT_PARITY_VERDICTS,
} from '../../app/core/domain/meritParityRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const ISO = NOW.toISOString();
const EFFECTIVE = '2026-11-15';

/* --------------------------------------------------------------- fixtures */

function person(id, name, level, managerId = 'dana') {
  return {
    id,
    name,
    role: 'Engineer',
    level,
    managerId,
    status: 'active',
    startDate: '2024-01-01',
    createdAt: ISO,
  };
}

function roster() {
  return [
    person('dana', 'Dana Eng', 'director', null),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'lead'),
    person('lee', 'Lee Engineer', 'lead'),
    person('mo', 'Mo Engineer', 'lead'),
    person('kim', 'Kim Engineer', 'lead'),
    person('ana', 'Ana Engineer', 'lead'),
    person('zoe', 'Zoe Engineer', 'lead'),
  ];
}

function line(personId, over = {}) {
  return {
    id: `line-${personId}-priya`,
    personId,
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

/** All three matrix people, one project line each. */
function projectLines(over = {}) {
  return ['sam', 'lee', 'mo'].map((id) => line(id, over));
}

function payRow(personId, currentPay, proposedPay, over = {}) {
  return { personId, level: 'lead', currentPay, proposedPay, origin: 'internal', retentionConcern: false, note: '', ...over };
}

/** Three matrix leads at +2%, three home-line leads at +4%: a −200 bp gap. */
function defaultRows() {
  return [
    payRow('sam', 100000, 102000),
    payRow('lee', 100000, 102000),
    payRow('mo', 100000, 102000),
    payRow('kim', 100000, 104000),
    payRow('ana', 100000, 104000),
    payRow('zoe', 100000, 104000),
  ];
}

function cycle(rows, over = {}) {
  return {
    id: 'merit-1',
    label: 'FY26 merit',
    currency: 'USD',
    effectiveOn: EFFECTIVE,
    status: 'draft',
    budget: { kind: 'amount', value: 60000 },
    comparison: { dimension: 'origin' },
    ownerId: null,
    rows,
    audit: null,
    outcomes: [],
    history: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function makeState({ people = roster(), lines = projectLines(), rows = defaultRows(), cycleOver = {} } = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.meritCycles = [cycle(rows, cycleOver)];
  return normalizeState(state).state;
}

const reportFor = (state, over = {}) => buildMeritParity(state, { now: NOW, settings: state.settings, ...over });

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
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

/* ------------------------------------------- the structure, read on the day */

test('the cohort split is read on the effective date, not on today’s chart', () => {
  const ended = makeState({
    lines: [line('sam', { toISO: '2026-10-31' }), line('lee'), line('mo')],
  });
  const r = reportFor(ended);
  assert.equal(r.cohorts.matrix.rowsN, 2, 'a line that ended before the money lands makes nobody matrix');
  assert.equal(r.cohorts['single-line'].rowsN, 4);
  assert.equal(r.rows.find((row) => row.personId === 'sam').cohort, 'single-line');
  assert.equal(r.rows.find((row) => row.personId === 'sam').lineN, 1);

  const future = makeState({
    lines: [line('sam', { fromISO: '2026-12-01' }), line('lee'), line('mo')],
  });
  assert.equal(reportFor(future).rows.find((row) => row.personId === 'sam').cohort, 'single-line');

  const live = makeState();
  const rl = reportFor(live);
  assert.equal(rl.rows.find((row) => row.personId === 'sam').cohort, 'matrix');
  assert.equal(rl.rows.find((row) => row.personId === 'sam').lineN, 2);
  assert.equal(rl.cohorts.matrix.rowsN, 3);
  assert.equal(rl.isMatrix, true);
});

/* -------------------------------------------------------- pay authority */

test('a second line that declares the pay right reads `contested` — named, never settled', () => {
  const state = makeState({ lines: [line('sam', { rights: ['pay'] }), line('lee'), line('mo')] });
  const r = reportFor(state);
  assert.equal(r.authorityVerdict, 'contested');
  assert.equal(r.totals.contestedN, 1);
  assert.equal(r.totals.clearN, 5);
  const finding = r.findings.find((f) => f.kind === 'contested-pay-authority');
  assert.ok(finding, 'the ambiguity is a finding on the pay decision');
  assert.deepEqual(finding.holderNames.sort(), ['Dana Eng', 'Priya PM']);
  assert.equal(finding.personName, 'Sam Engineer');
  assert.match(r.authorityDetail, /never picks a winner/i);
  assert.equal(meritParityAttentionCount(state, { now: NOW, settings: state.settings }), 1);
});

test('a home line whose declared pay right is unaided still reads `clear` — one holder', () => {
  const state = makeState({ lines: [line('sam', { rights: ['priority', 'technical'] }), line('lee'), line('mo')] });
  const r = reportFor(state);
  assert.equal(r.authorityVerdict, 'clear');
  assert.equal(r.rows.find((row) => row.personId === 'sam').holderN, 1);
});

test('a pay row naming a person the roster no longer has is excluded and reads UNKNOWN', () => {
  const rows = [...defaultRows(), payRow('ghost', 90000, 93000)];
  const state = makeState({ rows });
  const r = reportFor(state);
  const ghost = r.rows.find((row) => row.personId === 'ghost');
  assert.equal(ghost.included, false);
  assert.equal(ghost.excludeReason, 'missing-person-row');
  assert.equal(ghost.authorityState, 'unknown');
  assert.equal(r.authorityVerdict, 'unknown');
  assert.equal(r.totals.missingPersonN, 1);
  assert.ok(r.findings.some((f) => f.kind === 'unreadable-pay-authority'));
  assert.equal(r.gapBps, null, 'an unreadable row blocks the comparison');
  assert.match(r.gapReason, /roster/i);
});

/* ------------------------------------------------------- exact arithmetic */

test('basis points are exact integers from integer cents, and truncation is flagged', () => {
  const rows = [
    payRow('sam', 90000, 90001), // +1.00 on 900.00 → 0.111 bp, truncated to 0
    payRow('lee', 100000, 102000),
    payRow('mo', 100000, 102000),
    payRow('kim', 100000, 104000),
    payRow('ana', 100000, 104000),
    payRow('zoe', 100000, 104000),
  ];
  const r = reportFor(makeState({ rows }));
  const sam = r.rows.find((row) => row.personId === 'sam');
  assert.equal(sam.deltaCents, 100);
  assert.equal(sam.bps, 0);
  assert.equal(sam.truncated, true);
  assert.equal(sam.zeroIncrease, false, 'a real increase is not a zero increase because its bps truncated to 0');
  assert.equal(r.totals.truncatedRowN, 1);
  assert.equal(r.rows.find((row) => row.personId === 'lee').bps, 200);
  assert.equal(r.rows.find((row) => row.personId === 'kim').bps, 400);
});

test('the lower median is the declared convention and the gap is exact', () => {
  const rows = [
    payRow('sam', 100000, 101000), // 100
    payRow('lee', 100000, 102000), // 200
    payRow('mo', 100000, 103000), // 300
    payRow('kim', 100000, 101000), // 100
    payRow('ana', 100000, 102000), // 200
    payRow('zoe', 100000, 104000), // 400
  ];
  const r = reportFor(makeState({ rows }));
  assert.equal(r.cohorts['single-line'].includedN, 3);
  assert.equal(r.cohorts['single-line'].medianBps, 200, 'lower median of 100/200/400 is 200');
  assert.equal(r.cohorts.matrix.medianBps, 200);
  assert.equal(r.gapBps, 0);
  assert.equal(r.verdict, 'parity');
});

/* ---------------------------------------------------------- the refusals */

test('a cohort below the floor withholds the median and the gap — blank, never zero', () => {
  const rows = [
    payRow('sam', 100000, 102000),
    payRow('lee', 100000, 102000),
    payRow('kim', 100000, 104000),
    payRow('ana', 100000, 104000),
    payRow('zoe', 100000, 104000),
  ];
  const r = reportFor(makeState({ rows }));
  assert.equal(r.cohorts.matrix.includedN, 2);
  assert.equal(r.cohorts.matrix.medianPrinted, false);
  assert.equal(r.cohorts.matrix.medianBps, null);
  assert.equal(r.gapBps, null);
  assert.equal(r.verdict, 'incomplete');
  assert.ok(r.refusals.some((x) => x.kind === 'cohort-below-floor'));
  assert.match(r.gapReason, /floor of 3/);
  assert.equal(meritParityCsvRows(makeState({ rows }), { now: NOW }).find((x) => x.row_kind === 'summary').gap_bps, '');
});

test('one unpriced row blocks the comparison and is counted, never read as a zero increase', () => {
  const rows = defaultRows();
  rows[3] = payRow('kim', 100000, null);
  const state = makeState({ rows });
  const r = reportFor(state);
  assert.equal(r.totals.excludedN, 1);
  assert.equal(r.totals.unpricedN, 1);
  assert.equal(r.cohorts['single-line'].includedN, 2);
  assert.equal(r.gapBps, null);
  assert.equal(r.verdict, 'incomplete');
  assert.ok(r.refusals.some((x) => x.kind === 'unpriced-row'));
  const kim = r.rows.find((row) => row.personId === 'kim');
  assert.equal(kim.included, false);
  assert.equal(kim.bps, null);
});

test('a pool that moved no money cannot report parity', () => {
  const rows = defaultRows().map((row) => ({ ...row, proposedPay: row.currentPay }));
  const r = reportFor(makeState({ rows }));
  assert.equal(r.gapBps, null, 'an unspent pool prints no comparison, including no reassuring zero');
  assert.equal(r.gapWithheld, true);
  assert.equal(r.figuresComplete, false);
  assert.ok(r.byLevel.every((l) => !l.printed && l.gapBps === null));
  assert.equal(r.verdict, 'incomplete');
  assert.ok(r.refusals.some((x) => x.kind === 'no-money-moved'));
  assert.equal(r.totals.matrixPoolShareBps, null);
});

/* ---------------------------------------------------------- the verdicts */

test('a divergence names its direction and claims no cause', () => {
  const state = makeState();
  const r = reportFor(state);
  assert.equal(r.verdict, 'divergent');
  assert.equal(r.gapBps, -200);
  assert.equal(r.gapDirection, 'matrix-below');
  assert.equal(r.gapDirectionLabel, 'Second-line cohort paid less');
  assert.equal(r.verdictOpen, true);
  assert.ok(r.findings.some((f) => f.kind === 'cohort-divergence'));
  const brief = meritParityBriefText(state, { now: NOW, settings: state.settings });
  assert.match(brief, /UNADJUSTED/i);
  assert.match(brief, /not causal/i);
  assert.match(brief, /descriptive/i);
});

test('inside the declared band the reading is parity — a convention, not proof of fairness', () => {
  const rows = [
    payRow('sam', 100000, 104000),
    payRow('lee', 100000, 104000),
    payRow('mo', 100000, 104000),
    payRow('kim', 100000, 104200),
    payRow('ana', 100000, 104200),
    payRow('zoe', 100000, 104200),
  ];
  const r = reportFor(makeState({ rows }));
  assert.equal(r.gapBps, -20);
  assert.equal(Math.abs(r.gapBps) < MERIT_PARITY_TOLERANCE_BPS, true);
  assert.equal(r.verdict, 'parity');
  assert.equal(r.verdictOpen, false);
  assert.match(r.verdictDetail, /fairness was not proven/i);
  assert.equal(r.rows.every((row) => row.included), true);
});

test('a single-line pool is inert: no cohort, no gap and no invented comparison', () => {
  const state = makeState({ lines: [] });
  const r = reportFor(state);
  assert.equal(r.isMatrix, false);
  assert.equal(r.verdict, 'single-line');
  assert.equal(r.cohorts.matrix.rowsN, 0);
  assert.equal(r.gapBps, null);
  assert.equal(r.gapWithheld, true);
  assert.equal(r.figuresComplete, true, 'nothing is missing: there is simply no second-line cohort');
  assert.match(meritParityBriefText(state, { now: NOW }), /no second-line/i);
  const rows = meritParityCsvRows(state, { now: NOW });
  assert.equal(rows.find((x) => x.row_kind === 'summary').matrix_median_bps, '');
});

test('the level-matched reading prints only cells where both cohorts clear the floor', () => {
  const thin = reportFor(makeState({
    lines: [line('sam'), line('lee'), line('mo')],
    rows: [
      payRow('sam', 100000, 102000),
      payRow('lee', 100000, 102000),
      payRow('mo', 100000, 102000),
      payRow('kim', 100000, 104000),
      payRow('ana', 100000, 104000),
      payRow('zoe', 100000, 104000),
      payRow('dana', 180000, 190000, { level: 'director' }),
    ],
  }));
  const lead = thin.byLevel.find((l) => l.key === 'lead');
  assert.equal(lead.matrixN, 3);
  assert.equal(lead.singleN, 3);
  assert.equal(lead.printed, true);
  assert.equal(lead.gapBps, -200);
  assert.equal(thin.matchedLevelN, 1);

  const skewed = reportFor(makeState({
    lines: [line('sam'), line('lee'), line('mo')],
    rows: defaultRows().map((row) => (row.personId === 'kim' ? { ...row, level: 'director' } : row)),
  }));
  const leadSkewed = skewed.byLevel.find((l) => l.key === 'lead');
  assert.equal(leadSkewed.printed, false, 'only two home-line leads remain at this level');
  assert.equal(leadSkewed.matrixMedianBps, null);
  assert.match(leadSkewed.withheldReason, /fewer than 3/);
  assert.equal(skewed.matchedLevelN, 0);
});

/* ------------------------------------------------------- storage & schema */

test('the reading stores nothing: a reload prints the identical figures and reads mutate nothing', () => {
  const state = makeState({ lines: [line('sam', { rights: ['pay'] }), line('lee'), line('mo')] });
  const ctx = seed(state);
  const before = JSON.stringify(ctx.store.state);
  const revision = ctx.store.state.meta.revision;

  const api = ctx.api.meritParityReport();
  assert.equal(api.ok, true);
  const a = api.report;
  const b = ctx.api.meritParityReport().report;
  assert.deepEqual(a, b, 'two reads of an unchanged workspace are identical');
  assert.equal(JSON.stringify(ctx.store.state), before, 'reading mutates nothing');
  assert.equal(ctx.store.state.meta.revision, revision, 'and bumps no revision');
  assert.equal(ctx.store.state.schemaVersion, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 136);

  // Recompute every printed figure from the stored blob and compare.
  const recomputed = buildMeritParity(ctx.store.state, { now: NOW, settings: ctx.store.state.settings });
  assert.deepEqual(a.totals, recomputed.totals);
  assert.deepEqual(a.cohorts, recomputed.cohorts);
  assert.equal(a.gapBps, recomputed.gapBps);
  assert.equal(a.reconciles, true);
  assert.match(a.reconcilesDetail, /3 second-line row\(s\) \+ 3 home-line row\(s\) = 6 pay row\(s\)/);
});

/* ------------------------------------------------------------------ CSV */

test('CSV #116 is registered, exact-column, aggregate-only and reconciles with the panel', () => {
  assert.equal(CSV_EXPORTS.length, 124, 'the register now holds 123 scopes (ADR-0162 #122, ADR-0168 #123, ADR-0169 #124)');
  const descriptor = CSV_EXPORTS.find((item) => item.key === 'merit-matrix-parity');
  assert.ok(descriptor, 'the scope is registered');
  assert.equal(descriptor.group, 'analytics');
  assert.equal(descriptor.sensitive, false);

  const state = makeState({ lines: [line('sam', { rights: ['pay'] }), line('lee'), line('mo')] });
  const rows = meritParityCsvRows(state, { now: NOW });
  assert.equal(rows[0].row_kind, 'summary');
  assert.ok(rows.some((row) => row.row_kind === 'level'));
  for (const row of rows) {
    // ADR-0166 APPENDS the review-evidence columns to this scope; the ADR-0154/
    // 0155 header stays an in-order prefix, which is the property a consumer
    // reading by header depends on.
    assert.deepEqual(Object.keys(row), [...MERIT_PARITY_EXPORT_COLUMNS], 'exact column parity');
    assert.deepEqual(
      Object.keys(row).slice(0, MERIT_PARITY_CSV_COLUMNS.length),
      [...MERIT_PARITY_CSV_COLUMNS],
      'the existing columns are unchanged and in place',
    );
    const cell = JSON.stringify(row);
    assert.equal(/Sam|Lee|Mo|Kim|Ana|Zoe|Dana|Priya/.test(cell), false, 'no person or manager identity');
    assert.equal(/\d{5,}/.test(cell.replace(/cell_floor|tolerance_bps/g, '')) && /pay/.test(cell), false);
  }
  const summary = rows[0];
  const r = reportFor(state);
  assert.equal(summary.matrix_median_bps, String(r.cohorts.matrix.medianBps));
  assert.equal(summary.single_median_bps, String(r.cohorts['single-line'].medianBps));
  assert.equal(summary.gap_bps, String(r.gapBps));
  assert.equal(summary.parity_verdict, r.verdict);
  assert.equal(summary.authority_verdict, r.authorityVerdict);
  assert.equal(summary.reconciles, 'yes');
  assert.equal(summary.figures_complete, 'yes');

  const exported = exportWorkspaceCsv(state, 'merit-matrix-parity', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  const parsed = parseCsv(exported.csv);
  assert.equal(parsed.rows.length, rows.length);
  assert.deepEqual(parsed.headers, [...MERIT_PARITY_EXPORT_COLUMNS]);
});

test('a withheld figure exports BLANK with its reason and never a zero', () => {
  const rows = [
    payRow('sam', 100000, 102000),
    payRow('lee', 100000, 102000),
    payRow('kim', 100000, 104000),
    payRow('ana', 100000, 104000),
    payRow('zoe', 100000, 104000),
  ];
  const csv = meritParityCsvRows(makeState({ rows }), { now: NOW });
  const summary = csv.find((row) => row.row_kind === 'summary');
  assert.equal(summary.matrix_median_bps, '');
  assert.equal(summary.gap_bps, '');
  assert.match(summary.withheld_reason, /floor/i);
  assert.equal(summary.figures_complete, 'no');
  assert.notEqual(summary.gap_bps, '0');
});

/* ------------------------------------------------------------ conventions */

test('the declared vocabulary is closed and printed where a reader can disagree', () => {
  assert.equal(MERIT_PARITY_FLOOR, 3);
  assert.equal(MERIT_PARITY_TOLERANCE_BPS, 50);
  assert.equal(MERIT_PARITY_CONVENTIONS.median, 'lower');
  assert.deepEqual(MERIT_PARITY_VERDICTS.map((v) => v.key), ['no-cycle', 'single-line', 'incomplete', 'divergent', 'parity']);
  assert.deepEqual(MERIT_PARITY_AUTHORITY_STATES.map((s) => s.key), ['unknown', 'unowned', 'contested', 'clear']);
  assert.equal(MERIT_PARITY_AUTHORITY_STATES[0].rank < MERIT_PARITY_AUTHORITY_STATES[1].rank, true, 'unknown is worse than unowned');
});

test('a workspace with no cycle returns a printed no-cycle report, never an empty pool', () => {
  const empty = normalizeState(createEmptyState(ISO)).state;
  const r = buildMeritParity(empty, { now: NOW });
  assert.equal(r.hasCycle, false);
  assert.equal(r.verdict, 'no-cycle');
  assert.equal(r.gapBps, null);
  assert.equal(meritParityCsvRows(empty, { now: NOW }).length, 0);
  assert.match(meritParityBriefText(empty, { now: NOW }), /no merit cycle/i);
  const ctx = seed(empty);
  const api = ctx.api.meritParityReport();
  assert.equal(api.ok, true);
  assert.equal(api.report.verdict, 'no-cycle');
});

/* ------------------------------------------------------------------ panel */

test('the panel prints both verdicts, the withheld figures and the findings', async (t) => {
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
  const { renderMeritMatrixTab } = await import('../../app/views/meritMatrixPanel.js');

  const state = makeState({ lines: [line('sam', { rights: ['pay'] }), line('lee'), line('mo')] });
  const ctx = seed(state);
  const node = renderMeritMatrixTab({
    api: ctx.api,
    navigate: () => {},
    refresh: () => {},
    state: ctx.store.state,
  }, ctx.store.state.meritCycles[0], NOW);
  const host = dom.window.document.getElementById('root');
  host.innerHTML = '';
  host.appendChild(node);
  const text = host.textContent || '';
  assert.match(text, /Cohort parity: The cohorts were paid differently/);
  assert.match(text, /Pay authority: Two or more lines hold the pay right/);
  assert.match(text, /−2\.00%/);
  assert.match(text, /Second-line cohort paid less/);
  assert.match(text, /Sam Engineer/);
  assert.match(text, /Dana Eng/);
  assert.match(text, /Counts reconcile/);
  assert.match(text, /Figures complete/);
  assert.match(text, /Holmström/);
  assert.match(text, /never settled here|never picks an owner|does not choose one/i);

  // A below-floor workspace prints WITHHELD rather than a number.
  const thin = makeState({
    rows: [
      payRow('sam', 100000, 102000),
      payRow('lee', 100000, 102000),
      payRow('kim', 100000, 104000),
      payRow('ana', 100000, 104000),
      payRow('zoe', 100000, 104000),
    ],
  });
  const thinCtx = seed(thin);
  const thinNode = renderMeritMatrixTab({
    api: thinCtx.api,
    navigate: () => {},
    refresh: () => {},
    state: thinCtx.store.state,
  }, thinCtx.store.state.meritCycles[0], NOW);
  host.innerHTML = '';
  host.appendChild(thinNode);
  const thinText = host.textContent || '';
  assert.match(thinText, /The comparison cannot be made/);
  assert.match(thinText, /withheld/i);
  assert.match(thinText, /Fewer than 3 priced people/);
});

test('the merit terminal exposes the reading as a tab, rendered from the stored cycle', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    t.skip('jsdom is not installed in this environment; the wiring pass is unverified here');
    return;
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderMerit } = await import('../../app/views/merit.js');

  const state = makeState({ lines: [line('sam', { rights: ['pay'] }), line('lee'), line('mo')] });
  const ctx = seed(state);
  const node = renderMerit({
    api: ctx.api,
    state: ctx.store.state,
    now: NOW,
    query: new URLSearchParams('cycle=merit-1&panel=matrix'),
    navigate: () => {},
    refresh: () => {},
    exportCSV: () => {},
  });
  const host = dom.window.document.getElementById('root');
  host.innerHTML = '';
  host.appendChild(node);
  const text = host.textContent || '';
  assert.match(text, /Matrix parity/, 'the tab is offered on the merit terminal');
  assert.match(text, /Cohort parity: The cohorts were paid differently/);
  assert.match(text, /Pay authority: Two or more lines hold the pay right/);
  assert.match(text, /Second-line cohort paid less/);
});

test('partial pools withhold level comparisons in the stored report, export and panel', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderMeritMatrixTab } = await import('../../app/views/meritMatrixPanel.js');
  const state = makeState({ rows: [...defaultRows(), payRow('dana', 100000, null)] });
  const ctx = seed(state);
  const report = ctx.api.meritParityReport().report;
  const level = report.byLevel.find((l) => l.key === 'lead');
  assert.equal(level.printed, false);
  assert.equal(level.gapBps, null);
  assert.match(level.withheldReason, /incomplete/);
  assert.equal(report.matchedLevelN, 0);
  const exported = meritParityCsvRows(ctx.store.state, { now: NOW }).find((r) => r.level === 'lead');
  assert.equal(exported.level_gap_bps, '');
  assert.equal(exported.withheld_reason, level.withheldReason);
  const node = renderMeritMatrixTab({ api: ctx.api, navigate: () => {}, refresh: () => {}, state: ctx.store.state }, ctx.store.state.meritCycles[0], NOW);
  assert.match(node.textContent, /pay pool is incomplete/);
  const reloaded = createStore({ storage: ctx.storage, now: () => NOW });
  reloaded.load();
  assert.deepEqual(reportFor(reloaded.state).byLevel, report.byLevel);
});


test('complete-pool gate refuses missing, duplicate and malformed recipients without silent loss', () => {
  for (const [label, extra, expected] of [
    ['unpriced', [payRow('dana', 100000, null)], { excludedN: 1, malformedN: 0, duplicateN: 0 }],
    ['missing person', [payRow('removed', 100000, 104000)], { excludedN: 1, malformedN: 0, duplicateN: 0 }],
    ['duplicate', [payRow('sam', 100000, 105000)], { excludedN: 2, malformedN: 0, duplicateN: 2 }],
    ['malformed', [null, {}, { personId: '   ' }], { excludedN: 0, malformedN: 3, duplicateN: 0 }],
  ]) {
    const state = makeState();
    // Deliberately bypass normalisation to exercise the reader's own boundary.
    state.meritCycles[0].rows.push(...extra);
    const r = reportFor(state);
    assert.equal(r.verdict, 'incomplete', label);
    assert.equal(r.figuresComplete, false, label);
    assert.equal(r.reconciles, true, label);
    for (const [key, value] of Object.entries(expected)) assert.equal(r.totals[key], value, `${label}: ${key}`);
    assert.equal(r.totals.rowsN + r.totals.malformedN + r.totals.overflowN, state.meritCycles[0].rows.length);
    assert.equal(r.gapBps, null);
    assert.equal(r.totals.matrixPoolShareBps, null);
    for (const cohort of Object.values(r.cohorts)) {
      assert.equal(cohort.medianPrinted, false);
      assert.equal(cohort.medianBps, null);
      assert.equal(cohort.medianWithheldReason, r.gapReason);
    }
    assert.ok(r.byLevel.every((l) => !l.printed && l.gapBps === null));
    const summary = meritParityCsvRows(state, { now: NOW })[0];
    for (const key of ['matrix_median_bps', 'single_median_bps', 'gap_bps', 'matrix_pool_share_bps']) assert.equal(summary[key], '', `${label}: ${key}`);
    assert.equal(summary.withheld_reason, r.gapReason);
    assert.equal(summary.parity_verdict, 'incomplete');
    assert.match(meritParityBriefText(state, { now: NOW }), /comparison: REFUSED/);
    if (label === 'missing person' || label === 'malformed') assert.equal(r.authorityVerdict, 'unknown');
  }
});

test('incompleteness outranks single-line and a capped pool cannot pronounce divergence', () => {
  const single = makeState({ lines: [], rows: [...defaultRows(), payRow('dana', 100000, null)] });
  assert.equal(reportFor(single).verdict, 'incomplete');
  assert.equal(reportFor(single).figuresComplete, false);

  const state = makeState();
  // Keep both floor-clearing cohorts inside the cap, with unique recipients.
  for (let i = 6; i < 501; i++) {
    state.people.push(person(`extra-${i}`, `Extra ${i}`, 'lead'));
    state.meritCycles[0].rows.push(payRow(`extra-${i}`, 100000, 104000));
  }
  const r = reportFor(state);
  assert.equal(r.totals.sourceRowsN, 501);
  assert.equal(r.totals.rowsN, 500);
  assert.equal(r.totals.overflowN, 1);
  assert.equal(r.totals.excludedN, 0);
  assert.equal(r.verdict, 'incomplete');
  assert.equal(r.authorityVerdict, 'unknown');
  assert.equal(r.figuresComplete, false);
  assert.equal(r.gapBps, null);
  assert.equal(r.cohorts.matrix.medianBps, null);
  assert.equal(r.cohorts['single-line'].medianBps, null);
  assert.equal(r.totals.matrixPoolShareBps, null);
  assert.match(r.reconcilesDetail, /500 classified \+ 0 malformed \+ 1 beyond the read limit = 501 stored/);
  const summary = meritParityCsvRows(state, { now: NOW })[0];
  assert.equal(summary.parity_verdict, r.verdict);
  assert.equal(summary.withheld_reason, r.gapReason);
  assert.match(meritParityBriefText(state, { now: NOW }), /501 stored row/);
});

test('pool share respects both disclosure floors even when one median could print', () => {
  const state = makeState({ rows: defaultRows().filter((r) => r.personId !== 'mo') });
  const r = reportFor(state);
  assert.equal(r.cohorts['single-line'].medianPrinted, true);
  assert.equal(r.cohorts.matrix.medianPrinted, false);
  assert.equal(r.totals.matrixPoolShareBps, null);
  assert.match(r.poolShareReason, /floor of 3/);
  assert.equal(meritParityCsvRows(state, { now: NOW })[0].matrix_pool_share_bps, '');
});

test('partial-pool display equals persisted API, CSV and recomputation across reload without writes', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderMeritMatrixTab } = await import('../../app/views/meritMatrixPanel.js');
  const ctx = seed(makeState({ rows: [...defaultRows(), payRow('dana', 100000, null)] }));
  const before = ctx.storage.getItem(STORAGE_KEY);
  const report = ctx.api.meritParityReport().report;
  const node = renderMeritMatrixTab({ api: ctx.api, state: ctx.store.state }, ctx.store.state.meritCycles[0], NOW);
  const text = node.textContent;
  assert.match(text, /Cohort parity: The comparison cannot be made/);
  assert.match(text, /7 classified \+ 0 malformed \+ 0 beyond the read limit = 7 stored/);
  assert.ok(text.includes(report.gapReason));
  assert.doesNotMatch(text, /−2\.00%|33\.33%|two cohort medians sat inside/);
  const stats = [...node.querySelectorAll('.stat')];
  assert.ok(stats.length > 0, 'the rendered statistic cells are inspected');
  for (const label of ['Second-line median', 'Home-line median', 'Gap (unadjusted)', 'Second-line share of the pool']) {
    const cell = stats.find((n) => n.textContent.includes(label));
    assert.ok(cell, label);
    assert.match(cell.textContent, /withheld/);
    assert.ok(cell.textContent.includes(report.gapReason));
  }
  const csv = ctx.api.meritParityCsv().rows;
  assert.deepEqual(csv, meritParityCsvRows(ctx.store.state, { now: NOW }));
  assert.equal(csv[0].figures_complete, 'no');
  const reloaded = createStore({ storage: ctx.storage, now: () => NOW });
  reloaded.load();
  assert.deepEqual(reportFor(reloaded.state), report);
  assert.equal(ctx.storage.getItem(STORAGE_KEY), before, 'all reads preserve persisted bytes');
});
