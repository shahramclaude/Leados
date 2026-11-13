/**
 * tests/app/merit-evidence.test.mjs — the Cross-Line Review-Evidence Join
 * (ADR-0166, Schema v133, `#/merit?panel=matrix`, CSV scope #116 extended).
 *
 * Organised around what an evidence join can be betrayed by:
 *
 *  1. THE REVIEW, NOT A NEIGHBOUR. A pay decision is joined to the SAME review
 *     `comp.js` read its rating from. A different review with different lines in
 *     force must never be substituted, and an untraceable rating reads UNKNOWN.
 *  2. NEVER ASKED IS THE FINDING. A second line in force that was never asked is
 *     `line-unasked` and it blocks the cycle's evidence verdict — the defect the
 *     module exists to print.
 *  3. WHAT IS NOT A GAP IS NOT PRINTED AS ONE. A decline with a reason counts;
 *     a single-line person reads `single-line`, not "missing evidence".
 *  4. A REFUSED FIGURE IS BLANK. Below the floor or over a partial pool the rate
 *     is withheld with its reason — never a zero, never a narrowed percentage.
 *  5. DISPLAY == STORED. Every printed figure equals the recomputed blob, before
 *     and after a real reload, and no read mutates state or bumps a revision.
 *  6. THE RULE WRITES WORK, NOT CORRECTIONS. Finalising issues one dated, owned
 *     ask per open decision, idempotently, after finalisation asking for the
 *     correction path rather than the missing input — and it never edits a
 *     rating, a pay figure or a line.
 *  7. NO IDENTITY IN THE EXPORT, and the ADR-0154/0155 columns are unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  buildMeritParity,
  meritParityCsvRows,
  MERIT_PARITY_CSV_COLUMNS,
  MERIT_PARITY_EXPORT_COLUMNS,
} from '../../app/core/domain/meritParity.js';
import {
  buildMeritEvidenceJoin,
  meritEvidenceBriefText,
  meritEvidenceCsvCells,
} from '../../app/core/domain/meritEvidence.js';
import {
  MERIT_EVIDENCE_CSV_COLUMNS,
  MERIT_EVIDENCE_STATES,
  normalizeMeritEvidenceMarkers,
} from '../../app/core/domain/meritEvidenceRegistry.js';
import { MERIT_EVIDENCE_RULE_ID } from '../../app/core/domain/meritEvidenceRules.js';
import { renderMeritMatrixTab } from '../../app/views/meritMatrixPanel.js';

const NOW = new Date('2026-12-20T10:00:00.000Z');
const ISO = NOW.toISOString();
const EFFECTIVE = '2026-11-15';
const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-11-10';

/* --------------------------------------------------------------- fixtures */

function person(id, name, level, managerId = 'dana') {
  return { id, name, role: 'Engineer', level, managerId, status: 'active', startDate: '2024-01-01', createdAt: ISO };
}

function roster(over = {}) {
  return [
    person('dana', 'Dana Eng', 'director', null),
    person('priya', 'Priya PM', 'manager', 'dana'),
    person('sam', 'Sam Engineer', 'lead'),
    person('lee', 'Lee Engineer', 'lead'),
    person('mo', 'Mo Engineer', 'lead'),
    person('kim', 'Kim Engineer', 'lead'),
    person('ana', 'Ana Engineer', 'lead'),
    person('zoe', 'Zoe Engineer', 'lead'),
  ].map((p) => (over[p.id] ? { ...p, ...over[p.id] } : p));
}

function line(personId, over = {}) {
  return {
    id: `line-${personId}-priya`,
    personId,
    managerId: 'priya',
    kind: 'project',
    shareH: 40,
    rights: [],
    fromISO: '2026-01-01',
    toISO: null,
    declaredAt: '2026-01-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: 'Migration programme delivery.',
    ...over,
  };
}

const projectLines = (ids = ['sam', 'lee', 'mo'], over = {}) => ids.map((id) => line(id, over));

function payRow(personId, currentPay, proposedPay, over = {}) {
  return { personId, level: 'lead', currentPay, proposedPay, origin: 'internal', retentionConcern: false, note: '', ...over };
}

/** Three second-line leads at +2%, three home-line leads at +4%. */
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

/**
 * A completed review for `personId` whose manager rating is `rating`, completed
 * before the effective date — the review `ratingIndex` will read.
 */
function review(personId, { rating = 'meets-expectations', stewardship = null, over = {} } = {}) {
  return {
    id: `review-${personId}`,
    personId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    status: 'complete',
    selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
    manager: { achievements: 'Delivered the migration.', development: '', nextSteps: '', rating },
    evidence: [],
    stewardship,
    instrumentNotes: [],
    createdAt: ISO,
    completedAt: '2026-11-12T09:00:00.000Z',
    updatedAt: '2026-11-12T09:00:00.000Z',
    ...over,
  };
}

/** An ask to one line, due long ago, with no answer. */
const ask = (personId, askedOn, dueOn, managerId = 'priya') => ({
  id: `ask-${personId}-${managerId}`,
  lineKey: `line-${personId}-priya`,
  lineRole: 'secondary',
  lineKind: 'project',
  managerId,
  askedOn,
  dueOn,
  note: 'Please record what the programme observed.',
});

const answer = (personId, outcome, answeredOn, extra = {}) => ({
  id: `ans-${personId}-${outcome}`,
  lineKey: `line-${personId}-priya`,
  lineManagerId: 'priya',
  outcome,
  answeredOn,
  text: outcome === 'input' ? 'Carried the migration cutover through two incidents.' : '',
  reason: outcome === 'declined' ? 'The programme had no observation this cycle.' : '',
  ...extra,
});

function makeState({
  people = roster(),
  lines = projectLines(),
  rows = defaultRows(),
  reviews = [],
  cycleOver = {},
} = {}) {
  const state = createEmptyState(ISO);
  state.people = people;
  state.reportingLines = lines;
  state.structureHistory = [];
  state.reviews = reviews;
  state.meritCycles = [cycle(rows, cycleOver)];
  return normalizeState(state).state;
}

const joinFor = (state, over = {}) => buildMeritEvidenceJoin(state, { now: NOW, settings: state.settings, ...over });

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

/* ---------------------------------------- 1. the review, never a neighbour */

test('a pay decision is joined to the review its rating came from, not a neighbouring one', () => {
  // Sam has TWO completed reviews. The later one (completed after the effective
  // date) must not be read; the rating the money was made from is the earlier
  // one, and that is the review whose lines the join must resolve.
  const earlier = review('sam', {
    rating: 'meets-expectations',
    stewardship: { requests: [ask('sam', '2026-11-01', '2026-11-08')], answers: [answer('sam', 'input', '2026-11-05')] },
    over: { id: 'review-sam-nov', completedAt: '2026-11-12T09:00:00.000Z', updatedAt: '2026-11-12T09:00:00.000Z' },
  });
  const later = review('sam', {
    rating: 'often-exceeds',
    stewardship: null,
    over: { id: 'review-sam-dec', completedAt: '2026-12-01T09:00:00.000Z', updatedAt: '2026-12-01T09:00:00.000Z', periodEnd: '2026-11-30' },
  });
  const state = makeState({ reviews: [earlier, later], lines: projectLines(['sam']) });
  const r = joinFor(state);
  const row = r.rows.find((x) => x.personId === 'sam');
  assert.equal(row.rating, 'meets-expectations', 'the rating the money was made from');
  assert.equal(row.reviewId, 'review-sam-nov', 'and the id of that review, not the later one');
  assert.equal(row.evidenceState, 'corroborated');
});

test('a rating with no readable completed review reads UNKNOWN and no review is substituted', () => {
  // The rotation: the rating exists in `reviews` only as a DRAFT, so
  // `ratingIndex` reads nothing and the join must not fall back to a draft.
  const draft = review('sam', { over: { status: 'draft', completedAt: null, updatedAt: ISO } });
  const rows = [payRow('sam', 100000, 102000)];
  const state = makeState({ rows, reviews: [draft], lines: projectLines(['sam']) });
  const r = joinFor(state);
  const row = r.rows[0];
  assert.equal(row.evidenceState, 'unknown');
  assert.equal(row.reviewId, null, 'nothing invented');
  assert.equal(row.blocking, true);
  assert.equal(r.ratePrinted, false, 'a rate over a population with an unreadable decision is refused');
  assert.match(r.rateWithheldReason, /cannot be traced to a readable review/);
  assert.equal(r.verdict, 'incomplete');
  assert.equal(r.figuresComplete, false);
});

/* ------------------------------------ 2. a line never asked is the finding */

test('a second line in force that was never asked is the printed finding and blocks the verdict', () => {
  // Sam sits on Priya's project line all year. The review was completed with the
  // project line NEVER asked: no request, no answer.
  const state = makeState({
    reviews: [review('sam', { stewardship: null })],
    lines: projectLines(['sam']),
    rows: [payRow('sam', 100000, 102000)],
  });
  const r = joinFor(state);
  const row = r.rows[0];
  assert.equal(row.isMatrix, true);
  assert.equal(row.lineN, 2);
  assert.equal(row.evidenceState, 'line-unasked');
  assert.equal(row.unaskedN, 1);
  assert.equal(row.evidenceOpen, true);
  assert.equal(r.verdict, 'gap');
  assert.equal(r.totals.unaskedLinesN, 1);
  assert.ok(r.findings.some((f) => f.kind === 'line-unasked' && f.personId === 'sam'));
  // The rate is withheld below the declared floor of three second-line decisions.
  assert.equal(r.ratePrinted, false);
  assert.match(r.rateWithheldReason, /declared floor/);
  assert.match(meritEvidenceBriefText(state, { now: NOW }), /never asked/);
});

test('a line asked and still silent inside its window reads line-silent, not unasked', () => {
  const state = makeState({
    reviews: [review('sam', { stewardship: { requests: [ask('sam', '2026-11-01', '2026-11-08')], answers: [] } })],
    lines: projectLines(['sam']),
    rows: [payRow('sam', 100000, 102000)],
  });
  const r = joinFor(state);
  const row = r.rows[0];
  assert.equal(row.evidenceState, 'line-silent');
  assert.equal(row.unaskedN, 0, 'it was asked');
  assert.equal(row.silentN, 1);
  assert.equal(r.totals.silentLinesN, 1);
  assert.equal(r.totals.unaskedLinesN, 0, 'the two are never collapsed');
});

/* ------------------------- 3. what is not a gap is not printed as one ---- */

test('a decline with a stated reason counts toward corroboration', () => {
  const state = makeState({
    reviews: [review('sam', { stewardship: { requests: [ask('sam', '2026-11-01', '2026-11-08')], answers: [answer('sam', 'declined', '2026-11-07')] } })],
    lines: projectLines(['sam']),
    rows: [payRow('sam', 100000, 102000)],
  });
  const row = joinFor(state).rows[0];
  assert.equal(row.evidenceState, 'corroborated');
  assert.equal(row.declinedN, 1);
  assert.equal(row.evidenceOpen, false);
});

test('a person on one line reads single-line and is never counted as a gap', () => {
  const state = makeState({
    reviews: [review('kim', { stewardship: null })],
    lines: projectLines(['sam']), // kim holds no declared line
    rows: [payRow('kim', 100000, 104000)],
  });
  const r = joinFor(state);
  const row = r.rows[0];
  assert.equal(row.isMatrix, false);
  assert.equal(row.evidenceState, 'single-line');
  assert.equal(row.evidenceOpen, false);
  assert.equal(r.verdict, 'single-line');
  assert.equal(r.totals.secondLineJoinedN, 0);
});

/* ---------------------------------------------- 4. a refused figure is blank */

test('the second-line rate is printed only above the declared floor and over a complete pool', () => {
  const reviews = ['sam', 'lee', 'mo'].map((id) => review(id, {
    stewardship: { requests: [ask(id, '2026-11-01', '2026-11-08')], answers: [answer(id, 'input', '2026-11-05')] },
  })).concat(['kim', 'ana', 'zoe'].map((id) => review(id, { stewardship: null })));
  const state = makeState({ reviews });
  const r = joinFor(state);
  assert.equal(r.totals.secondLineJoinedN, 3);
  assert.equal(r.totals.secondLineCleanN, 3);
  assert.equal(r.totals.secondLineGapN, 0);
  assert.equal(r.ratePrinted, true);
  assert.equal(r.totals.secondLineCleanPct, 100);
  assert.equal(r.verdict, 'corroborated');

  // CSV: the rate column carries the number, and a withheld one is EMPTY.
  const cells = meritEvidenceCsvCells(state, { now: NOW });
  assert.equal(cells.second_line_clean_pct, '100');
  const withheld = meritEvidenceCsvCells(makeState({ reviews: [review('sam', { stewardship: null })], lines: projectLines(['sam']), rows: [payRow('sam', 1, 2)] }), { now: NOW });
  assert.equal(withheld.second_line_clean_pct, '', 'a withheld rate is BLANK, never zero');
});

test('an unpriced row that excludes nobody still joins, and a partial pool withholds every rate', () => {
  // One row names a person who is not on the roster: the join refuses the rate
  // over the readable remainder rather than narrowing the population quietly.
  const reviews = ['sam', 'lee', 'mo'].map((id) => review(id, {
    stewardship: { requests: [ask(id, '2026-11-01', '2026-11-08')], answers: [answer(id, 'input', '2026-11-05')] },
  }));
  const rows = defaultRows().concat([payRow('ghost', 100000, 102000)]);
  const r = joinFor(makeState({ reviews, rows }));
  assert.equal(r.ratePrinted, false);
  assert.match(r.rateWithheldReason, /incomplete/);
  assert.equal(r.verdict, 'incomplete');
  assert.equal(r.totals.secondLineCleanPct, null);
});

/* --------------------------------------------- 5. display == stored ------- */

test('every printed figure equals the recomputed blob across a real reload, and reads mutate nothing', () => {
  const reviews = ['sam', 'lee', 'mo'].map((id) => review(id, {
    stewardship: { requests: [ask(id, '2026-11-01', '2026-11-08')], answers: [answer(id, 'input', '2026-11-05')] },
  })).concat(['kim', 'ana', 'zoe'].map((id) => review(id, { stewardship: null })));
  const ctx = seed(makeState({ reviews }));
  const before = JSON.stringify(ctx.store.state);
  const revision = ctx.store.state.meta.revision;

  const apiReport = ctx.api.meritParityReport({ now: NOW }).report;
  const direct = buildMeritParity(ctx.store.state, { now: NOW, settings: ctx.store.state.settings });
  assert.deepEqual(apiReport.evidence, direct.evidence);
  assert.equal(apiReport.evidence.totals.secondLineJoinedN, 3);
  assert.equal(apiReport.evidence.totals.secondLineCleanN, 3);

  // The CSV cells are the report's own figures, cell for cell.
  const cells = meritParityCsvRows(ctx.store.state, { now: NOW })[0];
  assert.equal(cells.second_line_joined_n, String(apiReport.evidence.totals.secondLineJoinedN));
  assert.equal(cells.second_line_clean_n, String(apiReport.evidence.totals.secondLineCleanN));
  assert.equal(cells.evidence_verdict, apiReport.evidence.verdict);
  assert.equal(cells.evidence_reconciles, 'yes');
  assert.equal(cells.evidence_complete, 'yes');

  // A real reload reproduces the same figures, and no read wrote anything.
  ctx.store.load();
  const reloaded = ctx.api.meritParityReport({ now: NOW }).report;
  assert.equal(reloaded.evidence.totals.secondLineCleanN, apiReport.evidence.totals.secondLineCleanN);
  assert.equal(JSON.stringify(ctx.store.state), before, 'reads mutate nothing');
  assert.equal(ctx.store.state.meta.revision, revision, 'and bump no revision');
});

/* -------------------------------- 6. the rule writes work, not corrections */

test('finalising issues one dated owned ask per open decision, idempotently, and never edits the record', () => {
  // Sam's review closed with the project line never asked; the cycle is about to
  // be finalised. The ask must land on Sam's HOME line manager, before the money
  // lands, and again on a rescan it must NOT duplicate.
  const state = makeState({
    reviews: [review('sam', { stewardship: null })],
    lines: projectLines(['sam']),
    rows: [payRow('sam', 100000, 102000)],
  });
  const ctx = seed(state);
  const result = ctx.api.finalizeMeritCycle('merit-1');
  assert.equal(result.ok, true);

  const tasks = ctx.store.state.delegations.filter((d) => String(d.support).includes(MERIT_EVIDENCE_RULE_ID));
  assert.equal(tasks.length, 1, 'exactly one ask for one open decision');
  assert.equal(tasks[0].personId, 'dana', 'addressed to the home-line manager, the seat that owns the pay decision');
  assert.match(tasks[0].title, /correction path/, 'after finalisation the ask is the correction path, not the missing input');
  assert.ok(tasks[0].dueOn && tasks[0].dueOn > EFFECTIVE);
  assert.ok(ctx.store.state.meritEvidenceMarkers.some((m) => m.kind === 'obligation'));

  const revision = ctx.store.state.meta.revision;
  const again = ctx.api.scanMeritEvidence({ now: NOW });
  assert.equal(again.ok, true);
  assert.equal(
    ctx.store.state.delegations.filter((d) => String(d.support).includes(MERIT_EVIDENCE_RULE_ID)).length,
    1,
    'a rescan does not double the work',
  );
  assert.ok(ctx.store.state.meta.revision > revision, 'but the scan is a real committed event');

  // It never edited a rating, a pay figure or a line.
  assert.equal(ctx.store.state.reviews[0].manager.rating, 'meets-expectations');
  assert.equal(ctx.store.state.meritCycles[0].rows[0].proposedPay, 102000);
  assert.equal(ctx.store.state.reportingLines.length, 1);
});

test('a pre-finalisation finding issues the missing-input ask, and a single-chain workspace issues nothing', () => {
  const state = makeState({
    reviews: [review('sam', { stewardship: null })],
    lines: projectLines(['sam']),
    rows: [payRow('sam', 100000, 102000)],
  });
  // A completed review is itself a trigger: the defect exists before finalisation.
  const ctx = seed(state);
  ctx.api.completeReview?.(ctx.store.state.reviews[0].id);
  ctx.store.update(
    () => {},
    { type: 'review.completed', entity: 'review', entityId: 'review-sam' },
  );
  const tasks = ctx.store.state.delegations.filter((d) => String(d.support).includes(MERIT_EVIDENCE_RULE_ID));
  assert.ok(tasks.length >= 1);
  assert.match(tasks[0].title, /missing line input/);

  // No declared line at all: the rule is inert by construction.
  const single = makeState({
    reviews: [review('kim', { stewardship: null })],
    lines: [],
    rows: [payRow('kim', 100000, 104000)],
  });
  const sctx = seed(single);
  sctx.api.scanMeritEvidence({ now: NOW });
  assert.equal(
    sctx.store.state.delegations.filter((d) => String(d.support).includes(MERIT_EVIDENCE_RULE_ID)).length,
    0,
  );
});

/* --------------------------------------- 7. export shape and no identity ---- */

test('CSV #116 appends the evidence columns, keeps the existing ones, and carries no identity', () => {
  const reviews = ['sam', 'lee', 'mo'].map((id) => review(id, {
    stewardship: { requests: [ask(id, '2026-11-01', '2026-11-08')], answers: [answer(id, 'input', '2026-11-05')] },
  }));
  const state = makeState({ reviews });
  assert.equal(CSV_EXPORTS.length, 144, 'ADR-0166 extends #116; ADR-0168..0175 register through #129, ADR-0164 #130, ADR-0183..0185 #137..139 (139 registered; #75 stays reserved)');

  // The old header is a PREFIX of the new one, in order.
  assert.deepEqual(
    MERIT_PARITY_EXPORT_COLUMNS.slice(0, MERIT_PARITY_CSV_COLUMNS.length),
    [...MERIT_PARITY_CSV_COLUMNS],
  );
  assert.deepEqual(
    MERIT_PARITY_EXPORT_COLUMNS.slice(MERIT_PARITY_CSV_COLUMNS.length),
    [...MERIT_EVIDENCE_CSV_COLUMNS],
  );

  const exported = exportWorkspaceCsv(state, 'merit-matrix-parity', { now: NOW });
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, [...MERIT_PARITY_EXPORT_COLUMNS]);

  // No identity anywhere in the export: no person, name, manager, rating, review id.
  const banned = ['sam', 'lee', 'mo', 'dana', 'priya', 'Sam Engineer', 'review-sam', 'meets-expectations', '100000', '102000'];
  for (const row of parsed.rows) {
    const flat = JSON.stringify(row);
    for (const needle of banned) {
      assert.equal(flat.includes(needle), false, `export must not contain ${needle}`);
    }
  }
});

test('the schema migration adds one empty marker ledger and changes no record', () => {
  assert.equal(SCHEMA_VERSION, 151);
  const v132 = { ...createEmptyState(ISO), schemaVersion: 132 };
  delete v132.meritEvidenceMarkers;
  const out = migrate(v132);
  assert.ok(out.applied.includes('132 → 133'), 'the v132 → v133 step still runs');
  assert.deepEqual(out.applied.slice(-3), ['139 → 140', '140 → 141', '141 → 142'], 'and the head is ADR-0177\'s empty transfer-price ledger');
  assert.deepEqual(out.raw.meritEvidenceMarkers, []);
  // A malformed marker is dropped, never repaired into a plausible suppression.
  assert.deepEqual(normalizeMeritEvidenceMarkers([{ kind: 'obligation' }, null, 5]), []);
  assert.equal(normalizeMeritEvidenceMarkers([{ key: 'k', kind: 'obligation', recordedOn: '2026-11-01' }]).length, 1);
});

/* --------------------------------------------------------------- 8. render */

test('the panel renders the third claim, its refusal and its states without mutating state', async (t) => {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    t.skip('jsdom is not installed in this environment; the render pass is unverified here');
    return;
  }
  const reviews = [review('sam', { stewardship: null }), review('kim', { stewardship: null })];
  const state = makeState({ reviews, lines: projectLines(['sam']), rows: [payRow('sam', 100000, 102000), payRow('kim', 100000, 104000)] });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const before = JSON.stringify(state);
  const ctx = { state, api: { meritParityCsv: () => ({ ok: true, rows: [] }) }, navigate: () => {}, refresh: () => {}, query: new URLSearchParams() };
  const node = renderMeritMatrixTab(ctx, state.meritCycles[0], NOW);
  const text = node.textContent.replace(/\s+/g, ' ');
  assert.match(text, /Cross-line review evidence|review every line in force answered|Second-line evidence rate withheld/);
  assert.match(text, /never asked|never asked for input/i, 'the unasked line is named on the screen');
  assert.equal(JSON.stringify(state), before, 'rendering mutates nothing');
  assert.equal(dom.window.document.querySelectorAll('h1').length, 0, 'no second page heading');
});
