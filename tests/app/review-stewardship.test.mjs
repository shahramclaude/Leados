/**
 * tests/app/review-stewardship.test.mjs — Matrix Multi-Line Review Stewardship
 * (Session 203, Schema v122, ADR-0147, `#/reviews?panel=stewardship`, `RULE-SRV-01`,
 * CSV #109).
 *
 * The suite is organised around what a review packet can be betrayed by, not
 * around the file list:
 *
 *  1. NEVER COUNT A PERSON TWICE. A person on three lines is one packet row and
 *     three line rows; every total is a count of lines or of people, never of
 *     line-people.
 *  2. NEVER INFER. An unasked line reads `unasked`; a missing figure is not a
 *     zero contribution; no per-line share is ever computed, and the report says
 *     why on every row.
 *  3. NEVER PICK ONE ASSESSOR. A contested or undeclared `performance` right is
 *     reported with every holder, and RULE-SRV-01 issues NO work in that case.
 *  4. DISPLAY == STORED. Every figure the report and the CSV print is re-read
 *     from the stored blob and recomputed here, before and after a real reload.
 *  5. INERT SINGLE CHAIN. A workspace with no second line gains no row, no
 *     warning, no edge and no delegation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildReviewStewardship,
  reviewStewardshipBoard,
  reviewStewardshipBriefText,
  reviewStewardshipCsvRows,
  REVIEW_STEWARDSHIP_CSV_COLUMNS,
} from '../../app/core/domain/reviewStewardship.js';
import { reviewStewardshipRule } from '../../app/core/domain/reviewStewardshipRules.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const ISO = NOW.toISOString();

/* --------------------------------------------------------------- fixtures */

/**
 * engdir ─┬─ sam       (engineer, home line)
 *         └─ pmdir     (project manager, a leader with its own span)
 *               └─ kim (engineer under pmdir, so pmdir carries an altitude)
 *
 * Sam sits on a PROJECT line to pmdir as well as the home line to engdir.
 */
function roster() {
  return [
    { id: 'engdir', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, createdAt: ISO },
    { id: 'pmdir', name: 'Priya PM', role: 'Head of Product Delivery', level: 'manager', managerId: 'engdir', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'pmdir', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'ic', managerId: 'engdir', createdAt: ISO },
  ];
}

function projectLine({ shareH = 40, rights = [], ended = null } = {}) {
  return {
    id: 'line-sam-pm', personId: 'sam', managerId: 'pmdir', kind: 'project',
    shareH, rights, fromISO: '2026-01-01', toISO: ended,
    declaredAt: '2026-01-01T09:00:00.000Z', declaredBySeatId: null, note: '',
  };
}

function makeState({ lines = [projectLine()], reviews = null } = {}) {
  const state = createEmptyState(ISO);
  state.people = roster();
  state.reportingLines = lines;
  // Enough dated evidence that the ordinary review readiness gate can pass.
  state.oneOnOnes = [
    { id: 'oo-1', personId: 'sam', date: '2026-09-02', status: 'held', notes: 'Shipped the migration.', actions: [] },
    { id: 'oo-2', personId: 'sam', date: '2026-10-14', status: 'held', notes: 'Owned the incident review.', actions: [] },
  ];
  state.feedback = [
    { id: 'fb-1', personId: 'sam', direction: 'given', kind: 'praise', date: '2026-09-20', situation: 'Release', behavior: 'Ran the cutover', impact: 'zero downtime', tags: [], followUpDone: false },
  ];
  state.reviews = reviews || [{
    id: 'rev-sam', personId: 'sam', periodStart: '2026-08-01', periodEnd: '2026-10-31',
    status: 'draft', manager: { achievements: 'Sam ran the migration and the incident review with care.', development: 'Include testing in estimates before committing scope to a date.', nextSteps: 'Use the revised checklist from November.', rating: 'meets-expectations' },
    selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
    evidence: [], stewardship: { requests: [], answers: [] },
  }];
  return normalizeState(state).state;
}

/**
 * A store seeded through the SAME storage contract the app uses: the workspace is
 * written under `STORAGE_KEY` and read back by `load()`. Seeding an in-memory
 * field instead would test a path the app never takes, and would silently hide a
 * persistence defect behind a passing assertion.
 */
function seed(state = null, { failWrites = false } = {}) {
  const data = new Map(state ? [[STORAGE_KEY, JSON.stringify(state)]] : []);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { if (failWrites) throw new Error('Quota exceeded'); data.set(k, String(v)); },
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage, data, idFactory };
}

const report = (state, reviewId = 'rev-sam') =>
  buildReviewStewardship(state, (state.reviews || []).find((r) => r.id === reviewId), { now: NOW, settings: state.settings });

/* ------------------------------------------------- 1. never count twice */

test('a second manager is ONE relationship even across two declared kinds, and every total is a count of lines', () => {
  const state = makeState({
    lines: [
      projectLine(),
      { id: 'line-sam-xf', personId: 'sam', managerId: 'pmdir', kind: 'cross-functional', shareH: 30, rights: [], fromISO: '2026-02-01', toISO: null, declaredAt: '2026-02-01T09:00:00.000Z', note: '' },
    ],
  });
  const r = report(state);
  assert.equal(r.isMatrix, true);
  // Home line to engdir + ONE declared relationship to pmdir. The person holds two
  // declared lines to the SAME manager on different kinds; they are one
  // relationship and therefore one row — asking the same human twice and then
  // reporting their silence twice is the double-count the mandate forbids.
  assert.equal(r.totals.inPeriodLineN, 2);
  assert.equal(r.totals.secondaryInPeriodN, 1);
  const pmRow = r.lines.find((l) => l.managerId === 'pmdir');
  assert.deepEqual(pmRow.kinds.sort(), ['cross-functional', 'project'], 'both declared kinds stay visible on the one row');
  assert.equal(pmRow.declaredKindN, 2);

  const board = reviewStewardshipBoard(state, { now: NOW, settings: state.settings });
  assert.equal(board.matrixReviewN, 1, 'one review, one row — never one per line');
  const csv = reviewStewardshipCsvRows(state, { now: NOW, settings: state.settings });
  assert.equal(csv.length, 2, 'the CSV carries one row per relationship');
  assert.equal(new Set(csv.map((row) => row.review_id)).size, 1, 'and exactly one review among them');
});

/* ------------------------------------------------- 2. never infer */

test('an unasked second line reads `unasked` and is never a zero contribution', () => {
  const r = report(makeState());
  const secondary = r.lines.find((l) => l.role === 'secondary');
  assert.equal(secondary.lineState, 'unasked');
  assert.equal(secondary.answer, null);
  assert.equal(r.verdict, 'unasked-line');
  assert.equal(r.attribution.lineAttributable, false);
  assert.match(r.attribution.reason, /never WHICH reporting line produced it/);
  // There is a numerator-shaped hole here on purpose: no share field exists.
  assert.ok(!('contributionShare' in secondary));
  assert.equal(r.totals.answeredN, 0);
  assert.equal(r.totals.unaskedN, 1);
});

test('the home line carries the PRESUMED performance right and says so', () => {
  const r = report(makeState());
  const home = r.lines.find((l) => l.role === 'primary');
  assert.equal(home.holdsPerformanceRight, true);
  assert.equal(home.performanceRightPresumed, true, 'a presumption is printed as a presumption');
  assert.equal(r.assessorState, 'sole');
  assert.deepEqual(r.assessorIds, ['engdir']);
});

/* ------------------------------------------------- 3. never pick an assessor */

test('two lines declaring the performance right is CONTESTED, not silently resolved', () => {
  const state = makeState({ lines: [projectLine({ rights: ['performance'] })] });
  const r = report(state);
  assert.equal(r.verdict, 'contested-assessor');
  assert.equal(r.assessorState, 'contested');
  assert.deepEqual(r.assessorIds.sort(), ['engdir', 'pmdir'], 'every holder is printed');
  assert.match(reviewStewardshipBriefText(state, { now: NOW, settings: state.settings }), /CONTESTED assessor/);
});

test('a line with no declared rights leaves the home presumption as the sole assessor', () => {
  const r = report(makeState({ lines: [projectLine({ rights: [] })] }));
  assert.equal(r.assessorState, 'sole');
  assert.equal(r.assessorIds.length, 1);
});

/* ------------------------------------------------- 4. the acts, end to end */

test('ask → answer round-trips through the real store and survives a reload with display == stored', () => {
  const state = makeState();
  const { store, api, storage } = seed(state);

  const asked = api.reviewStewardshipAsk({
    reviewId: 'rev-sam', lineKey: 'line-sam-pm', dueOn: '2026-11-19',
    note: 'What did you see of Sam across delivery in Q3 — specifically the migration cutover and the incident review?',
  });
  assert.equal(asked.ok, true, asked.error);

  const afterAsk = report(store.state);
  const secondary = afterAsk.lines.find((l) => l.role === 'secondary');
  assert.equal(secondary.lineState, 'asked');
  assert.equal(secondary.request.dueOn, '2026-11-19');
  assert.equal(afterAsk.verdict, 'awaiting-input', 'an open ask is neither late nor settled');
  assert.equal(afterAsk.totals.unaskedN, 0);
  assert.equal(afterAsk.totals.askedN, 1);

  // The answer must come from the manager who holds the line.
  store.state.settings = { ...store.state.settings, activeSeatId: 'pmdir' };
  const answered = createApi(store, { now: () => NOW }).reviewStewardshipAnswer({
    reviewId: 'rev-sam', lineKey: 'line-sam-pm', outcome: 'input',
    text: 'Sam cut over the billing migration with no downtime and then led the incident review that changed our on-call policy.',
  });
  assert.equal(answered.ok, true, answered.error);

  const afterAnswer = report(store.state);
  assert.equal(afterAnswer.totals.answeredN, 1);
  assert.equal(afterAnswer.verdict, 'settled');
  assert.equal(afterAnswer.assessorState, 'sole');

  // DISPLAY == STORED: the printed text is byte-identical to the store's.
  const idx = store.state.reviews.findIndex((r) => r.id === 'rev-sam');
  const stored = store.state.reviews[idx].stewardship.answers[0];
  const printed = afterAnswer.lines.find((l) => l.role === 'secondary').answer;
  assert.equal(printed.text, stored.text);
  assert.equal(printed.answeredOn, stored.answeredOn);

  // SURVIVES RELOAD with the same numbers.
  store.flush?.();
  const reloaded = createStore({ storage, now: () => NOW });
  reloaded.load();
  const reread = report(reloaded.state);
  assert.equal(reread.totals.answeredN, afterAnswer.totals.answeredN);
  assert.equal(reread.totals.askedN, afterAnswer.totals.askedN);
  assert.equal(reread.verdict, afterAnswer.verdict);
  assert.equal(reread.lines.find((l) => l.role === 'secondary').answer.text, stored.text);
});

test('a manager cannot answer for another line, and nobody can answer a question never asked', () => {
  const state = makeState();
  const { store, api } = seed(state);

  // Never asked.
  const early = api.reviewStewardshipAnswer({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', outcome: 'input', text: 'Some words here that are long enough.' });
  assert.equal(early.ok, false);
  assert.match(early.error, /Nobody has asked this line/);

  api.reviewStewardshipAsk({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', dueOn: '2026-11-19', note: 'Speak to the migration cutover and the incident review, please.' });

  // engdir holds the HOME line, not the project line: refused.
  store.state.settings = { ...store.state.settings, activeSeatId: 'engdir' };
  const wrong = createApi(store, { now: () => NOW }).reviewStewardshipAnswer({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', outcome: 'input', text: 'I will answer on Priya’s behalf with a long enough sentence.' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /Only Priya PM/);
});

test('a decline requires a stated reason and a second ask inside the window is refused', () => {
  const state = makeState();
  const { store, api } = seed(state);

  const bare = api.reviewStewardshipAsk({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', dueOn: '2026-11-19', note: 'Tell me what this project line saw in Q3.' });
  assert.equal(bare.ok, true, bare.error);

  const again = api.reviewStewardshipAsk({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', dueOn: '2026-11-25', note: 'Asking the same line a second time inside the window.' });
  assert.equal(again.ok, false);
  assert.match(again.error, /already asked/);

  store.state.settings = { ...store.state.settings, activeSeatId: 'pmdir' };
  const noReason = createApi(store, { now: () => NOW }).reviewStewardshipAnswer({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', outcome: 'declined', reason: 'nope' });
  assert.equal(noReason.ok, false);
  assert.match(noReason.error, /why there is nothing to add/);

  const declined = createApi(store, { now: () => NOW }).reviewStewardshipAnswer({ reviewId: 'rev-sam', lineKey: 'line-sam-pm', outcome: 'declined', reason: 'This line had no delivery contact with Sam in the period.' });
  assert.equal(declined.ok, true, declined.error);
  const r = report(store.state);
  assert.equal(r.totals.declinedN, 1);
  assert.equal(r.totals.answeredN, 0, 'a decline is settled but is NOT evidence');
  assert.equal(r.verdict, 'settled');
});

/* ------------------------------------------------- 5. the rule */

test('RULE-SRV-01 issues one owned ask per unasked line on completion, idempotently, and never for a contested assessor', () => {
  const state = makeState({ lines: [projectLine({ rights: [] })] });
  const draft = JSON.parse(JSON.stringify(state));
  const completed = draft.reviews[0];
  completed.status = 'complete';
  const before = { dlg: (draft.delegations || []).length, links: (draft.links || []).length };

  const out = reviewStewardshipRule(draft, {
    event: { type: 'review.completed', entityId: 'rev-sam' },
    now: NOW,
    idFactory: (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`,
  });
  const created = (draft.delegations || []).length - before.dlg;
  assert.equal(created, 1, 'exactly one ask for the one unasked secondary line');
  const task = draft.delegations[0];
  assert.equal(task.personId, 'pmdir', 'addressed to the manager who holds the line');
  assert.ok(task.dueOn, 'and dated');
  assert.ok((draft.links || []).length > before.links, 'typed provenance was written');
  assert.ok(out.some((e) => e.ruleId === 'RULE-SRV-01'));

  // Idempotent: a rescan adds nothing.
  const afterFirst = (draft.delegations || []).length;
  reviewStewardshipRule(draft, { event: { type: 'review.stewardship.scan' }, now: NOW, idFactory: (p) => `${p}-x` });
  assert.equal((draft.delegations || []).length, afterFirst, 'a rescan cannot double the obligation');

  // Single-chain: inert.
  const single = JSON.parse(JSON.stringify(makeState({ lines: [] })));
  single.reviews[0].status = 'complete';
  const singleBefore = (single.delegations || []).length;
  const none = reviewStewardshipRule(single, { event: { type: 'review.completed', entityId: 'rev-sam' }, now: NOW, idFactory: (p) => `${p}-y` });
  assert.deepEqual(none, []);
  assert.equal((single.delegations || []).length, singleBefore);
});

test('a contested assessor issues NO work: a task addressed to nobody could never close', () => {
  const draft = JSON.parse(JSON.stringify(makeState({ lines: [projectLine({ rights: ['performance'] })] })));
  draft.reviews[0].status = 'complete';
  const before = (draft.delegations || []).length;
  const out = reviewStewardshipRule(draft, {
    event: { type: 'review.completed', entityId: 'rev-sam' }, now: NOW, idFactory: (p) => `${p}-z`,
  });
  assert.equal((draft.delegations || []).length, before);
  assert.ok(out.some((e) => /contested or undeclared assessor/.test(e.summary)));
});

/* ------------------------------------------------- 6. inert single chain */

test('a single-chain workspace gains no row, no warning and no verdict change', () => {
  const state = makeState({ lines: [] });
  const r = report(state);
  assert.equal(r.isMatrix, false);
  assert.equal(r.verdict, 'single-chain');
  assert.equal(r.lines.length, 1);
  assert.equal(r.totals.secondaryLineN, 0);
  assert.equal(reviewStewardshipBoard(state, { now: NOW, settings: state.settings }).matrixReviewN, 0);
  assert.equal(reviewStewardshipCsvRows(state, { now: NOW, settings: state.settings }).length, 0);
  assert.match(reviewStewardshipBriefText(state, { now: NOW, settings: state.settings }), /nothing to reconcile/);
});

/* ------------------------------------------------- 7. schema / spine */

test('schema v122 is additive: existing reviews gain an EMPTY stewardship and nothing is invented', () => {
  assert.equal(SCHEMA_VERSION, 125);
  const { raw, applied } = migrate({
    schemaVersion: 121,
    appId: 'leados',
    meta: { createdAt: ISO, updatedAt: ISO, isDemo: false, revision: 0 },
    people: roster(),
    reportingLines: [projectLine()],
    reviews: [{ id: 'rev-old', personId: 'sam', periodStart: '2026-01-01', periodEnd: '2026-03-31', status: 'complete', manager: { rating: 'meets-expectations' } }],
    settings: { reviewStewardshipAnswerDays: 999 },
  });
  assert.deepEqual(applied, ['121 → 122', '122 → 123', '123 → 124', '124 → 125']);
  assert.deepEqual(raw.reviews[0].stewardship, { requests: [], answers: [] });
  assert.equal(raw.settings.reviewStewardshipAnswerDays, 60, 'clamped to the declared bound, not fitted');
});

test('the rule and its contract are 1:1 on the shared spine, and the CSV scope exists', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  const idx = DEFAULT_POST_COMMIT_RULES.indexOf(reviewStewardshipRule);
  assert.ok(idx > 0, 'RULE-SRV-01 is registered');
  assert.ok(DEFAULT_POST_COMMIT_RULES.findIndex((r) => r.name === 'seatRule') > idx, 'it runs before the Operating Seat so its work rolls up in the same transaction');
  assert.equal(CSV_SCOPE_COUNT, 111);
});

// Named for readability above; the pin states the total deliberately so the next
// session cannot drift it silently.
import { CSV_EXPORTS as CSV_SCOPE } from '../../app/core/csv.js';
const CSV_SCOPE_COUNT = CSV_SCOPE.length;

/* ------------------------------------------------- 8. display vs stored */

test('every printed figure equals the stored blob recomputed, and the CSV matches the report row for row', () => {
  const state = makeState({ lines: [projectLine({ rights: ['performance'] })] });
  const { store, api } = seed(state);
  const read = api.reviewStewardshipBoard();
  assert.equal(read.ok, true, read.error);

  const stored = store.state.reviews[0];
  const recomputed = buildReviewStewardship(store.state, stored, { now: NOW, settings: store.state.settings });
  const shown = read.reports.find((r) => r.reviewId === 'rev-sam');

  // Deep equality of the SHAPE THAT IS PRINTED, not just the totals.
  assert.equal(shown.verdict, recomputed.verdict);
  assert.equal(shown.assessorState, recomputed.assessorState);
  assert.deepEqual(shown.totals, recomputed.totals);
  assert.deepEqual(shown.assessorIds, recomputed.assessorIds);
  assert.equal(shown.lines.length, recomputed.lines.length);
  for (const [i, line] of shown.lines.entries()) {
    const twin = recomputed.lines[i];
    assert.equal(line.key, twin.key);
    assert.equal(line.lineState, twin.lineState);
    assert.equal(line.holdsPerformanceRight, twin.holdsPerformanceRight);
    assert.equal(line.inPeriod, twin.inPeriod);
  }

  // CSV parity: one row per line, every column present, and the state matches.
  const csv = exportWorkspaceCsv(store.state, 'review-stewardship', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  assert.equal(csv.columnCount, REVIEW_STEWARDSHIP_CSV_COLUMNS.length);
  const parsed = parseCsv(csv.csv);
  assert.equal(parsed.rows.length, recomputed.lines.length);
  for (const [i, row] of parsed.rows.entries()) {
    const get = (key) => row[parsed.headers.indexOf(key)];
    assert.equal(get('line_key'), recomputed.lines[i].key);
    assert.equal(get('line_state'), recomputed.lines[i].lineState);
    assert.equal(get('verdict'), recomputed.verdict);
    assert.equal(get('person_id'), 'sam');
  }

  // Reading mutates nothing.
  const before = JSON.stringify(store.state.reviews);
  buildReviewStewardship(store.state, store.state.reviews[0], { now: NOW, settings: store.state.settings });
  reviewStewardshipCsvRows(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(JSON.stringify(store.state.reviews), before);
});

/* ------------------------------------------------- 9. overlay honesty */

test('a line that ended before the period is EXCLUDED, counted and given a printed reason', () => {
  const state = makeState({ lines: [projectLine({ ended: '2026-06-30' })] });
  const r = report(state);
  assert.equal(r.totals.inPeriodLineN, 1, 'only the home line was in force');
  assert.equal(r.totals.outOfPeriodN, 1);
  assert.equal(r.verdict, 'single-chain');
  const refused = r.refusals.find((x) => x.kind === 'line-outside-period');
  assert.ok(refused, 'the exclusion is named, not silently dropped');
  assert.match(refused.detail, /EXCLUDED rather than counted/);
  const excluded = r.lines.find((l) => l.role === 'secondary');
  assert.equal(excluded.inPeriod, false);
  assert.match(excluded.reason, /ended on 2026-06-30/);
});

test('a late answer is settled but printed as late', () => {
  const state = makeState();
  state.reviews[0].stewardship = {
    requests: [{ id: 'req-1', lineKey: 'line-sam-pm', lineRole: 'secondary', lineKind: 'project', managerId: 'pmdir', askedOn: '2026-09-01', askedBySeatId: null, dueOn: '2026-09-10', note: 'Q3 delivery input, please.' }],
    answers: [{ id: 'ans-1', lineKey: 'line-sam-pm', lineManagerId: 'pmdir', outcome: 'input', answeredOn: '2026-09-20', answeredBySeatId: null, text: 'Sam cut the migration over with no downtime.', reason: '' }],
  };
  const r = report(state);
  assert.equal(r.totals.answeredN, 1);
  assert.equal(r.lines.find((l) => l.role === 'secondary').answer.late, true);
  assert.ok(r.refusals.some((x) => x.kind === 'late-answer'));
});

/* ------------------------------------------------- 10. the panel renders what is stored */

test('the stewardship panel renders the stored state — display == stored, in a real DOM', async () => {
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><html lang="en"><head><title>LeadOS</title></head><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;

  const state = makeState();
  state.reviews[0].stewardship = {
    requests: [{ id: 'req-1', lineKey: 'line-sam-pm', lineRole: 'secondary', lineKind: 'project', managerId: 'pmdir', askedOn: '2026-09-01', askedBySeatId: null, dueOn: '2026-10-05', note: 'Q3 delivery input, please.' }],
    answers: [],
  };
  const { store, api } = seed(state);
  const { renderReviewStewardshipPanel } = await import('../../app/views/reviewStewardshipPanel.js');

  const ctx = {
    state: store.state,
    api,
    query: new URLSearchParams('panel=packet&review=rev-sam'),
    now: NOW,
    navigate: () => {},
    refresh: () => {},
  };
  const node = renderReviewStewardshipPanel(ctx);
  document.getElementById('view').appendChild(node);
  const text = document.querySelector('#view').textContent;

  // The derived state shown is the derived state stored/computed.
  const computed = buildReviewStewardship(store.state, store.state.reviews[0], { now: NOW, settings: store.state.settings });
  assert.equal(computed.lines.find((l) => l.role === 'secondary').lineState, 'overdue');
  assert.ok(text.includes('Asked, overdue'), 'the overdue state is printed, not softened');
  assert.ok(text.includes('Priya PM'), 'the line manager is named');
  assert.ok(text.includes('Dana Eng'), 'the home line is named');

  // The refusal of a contribution share is printed, not merely absent.
  assert.match(text, /never WHICH reporting line produced it/);

  // No uncaught render error, and the board panel renders too.
  assert.deepEqual(errors, []);
  const boardNode = renderReviewStewardshipPanel({ ...ctx, query: new URLSearchParams('panel=board') });
  document.getElementById('view').appendChild(boardNode);
  assert.ok(document.querySelector('#view').textContent.includes('Lines asked & late'));
});
