// ADR-0218 — Just Culture Decision Record (Schema v172).
//
// This register's claims are about who may decide, what response the answers
// point to, and what the screen prints. The tests are:
//
//   1. the schema bump is ADDITIVE — two ledgers arrive empty, and no review is
//      inferred from the incidents, feedback or disputes an upgraded workspace holds;
//   2. the response the answers point to is the algorithm's, branch by branch, and
//      an unanswered question is named as pending — never a default response;
//   3. OWNERSHIP is proved against the live matrix: a multi-line person needs a named
//      deciding line, nobody opens a review of their own conduct, and a seat that is
//      not the deciding line cannot decide;
//   4. a response that DEPARTS from the answers is accepted only with a written reason,
//      and is printed as a departure, never corrected;
//   5. another line the person holds must answer; a dissent CONTESTS the decision, and
//      a revision resets concurrence;
//   6. a withdrawn review refuses every later act, and stays on the record;
//   7. a stored row is the row its loader returns, and a malformed one is dropped and
//      counted rather than repaired;
//   8. the panel prints what the reader computed, cell by cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { buildJustCultureReport, justCultureAttentionCount } from '../../app/core/domain/justCulture.js';
import {
  JUST_CULTURE_LIMITS,
  JUST_CULTURE_RIGHTS,
  justCultureExpectation,
} from '../../app/core/domain/justCultureRegistry.js';
import { normalizeJustCultureReviews } from '../../app/core/domain/justCultureSchema.js';
import { renderJustCulture } from '../../app/views/justCulture.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const L = JUST_CULTURE_LIMITS;

const person = (id, managerId, level) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  level,
  role: 'Executive',
  status: 'active',
  startDate: '2026-01-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
});

// ceo → dan (director) → mia (manager) → ivo (IC)
//                      → kai (manager) → lea (IC)
// ivo ALSO answers to kai on a declared project line: a person with two lines
// must have a deciding line NAMED, and the second line's concurrence is required.
function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'chief'),
    person('dan', 'ceo', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'dan', 'manager'),
    person('lea', 'kai', 'ic'),
  ];
  raw.reportingLines = [{
    id: 'rl-ivo-kai', personId: 'ivo', managerId: 'kai', kind: 'project', shareH: 20,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  return normalizeState(raw, { now: at('2026-11-15') }).state;
}

function seed(state = fixture(), startAt = T0) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let clock = new Date(startAt);
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const store = createStore({ storage, now: () => clock, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => clock, idFactory }), store, { now: () => clock.getTime() });
  const sit = (id) => store.update((draft) => { draft.settings = { ...draft.settings, activeSeatId: id }; },
    { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'seat' });
  const on = (day) => { clock = at(day); };
  return { store, api, sit, on, values, clock: () => clock };
}

const SUMMARY = 'Handover sheet left unsigned twice this week during the night shift, with the second on Thursday.';
const OPEN = { personId: 'ivo', eventOn: '2026-11-10', eventSummary: SUMMARY, decidingManagerId: '' };

const ANSWERS = {
  console: { deviation: 'departure', choice: 'unintended', risk: '', substitution: 'peer-would-not', system: 'none-identified', response: 'console', departureReason: '', systemAction: '', note: 'A slip on a busy night: the sheet was in the wrong tray; the step belongs on sign-in.' },
};

/** Opens a review for ivo as the deciding line mia (single line in the fixture, so none is named). */
function withReview(env = seed()) {
  env.sit('mia');
  const opened = env.api.justCultureOpen({ ...OPEN, personId: 'ivo', decidingManagerId: 'mia' });
  assert.ok(opened.ok, opened.error);
  return { ...env, reviewId: opened.reviewId };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return run(dom);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

/* ------------------------------------------------------------ 1. schema v172 */

test('ADR-0218 schema: the bump is additive — two empty ledgers, and no review inferred from an upgraded workspace', () => {
  assert.equal(SCHEMA_VERSION, 176);

  const v171 = {
    ...createEmptyState(T0),
    schemaVersion: 171,
    // What an upgraded workspace may already hold: an incident and a concern. Neither
    // is a conduct review, and neither may become one.
    concernReports: [{ id: 'sup-1', summary: 'a concern' }],
  };
  delete v171.justCultureReviews;
  delete v171.justCultureActs;
  const migrated = migrate(v171);
  assert.equal(migrated.applied.at(-1), '175 → 176', 'the whole chain runs to the current schema');
  assert.equal(migrated.raw.schemaVersion, 176);
  assert.deepEqual(migrated.raw.justCultureReviews, []);
  assert.deepEqual(migrated.raw.justCultureActs, []);
});

/* ---------------------------------------------- 2. the response the answers point to */

test('ADR-0218 algorithm: every branch points to the response its path declares', () => {
  const cases = [
    [{ deviation: 'none', system: 'none-identified' }, 'console', 'no-departure'],
    [{ deviation: 'departure', choice: 'unintended', substitution: 'peer-would', system: 'none-identified' }, 'console', 'unintended-departure'],
    [{ deviation: 'departure', choice: 'intended', risk: 'unaware-or-justified', substitution: 'peer-would-not', system: 'none-identified' }, 'coach', 'at-risk'],
    [{ deviation: 'departure', choice: 'intended', risk: 'disregarded', substitution: 'peer-would', system: 'none-identified' }, 'coach', 'reckless-system-shaped'],
    [{ deviation: 'departure', choice: 'intended', risk: 'disregarded', substitution: 'peer-would-not', system: 'present' }, 'formal-review', 'reckless-individual'],
  ];
  for (const [answers, response, path] of cases) {
    const e = justCultureExpectation(answers);
    assert.equal(e.response, response, JSON.stringify(answers));
    assert.equal(e.path, path);
    assert.deepEqual(e.pending, []);
  }
});

test('ADR-0218 algorithm: an unanswered question is named as pending — never a default response', () => {
  const none = justCultureExpectation({});
  assert.equal(none.response, null);
  assert.equal(none.path, 'indeterminate');
  assert.ok(none.pending.includes('deviation'));
  assert.ok(none.pending.includes('system'), 'the system question is always asked');

  const departure = justCultureExpectation({ deviation: 'departure', choice: 'intended', system: 'none-identified' });
  assert.equal(departure.response, null, 'a choice without its risk, and no substitution test, has no response');
  assert.ok(departure.pending.includes('risk'));
  assert.ok(departure.pending.includes('substitution'));

  const untested = justCultureExpectation({ deviation: 'departure', choice: 'unintended', substitution: 'untested', system: 'untested' });
  assert.equal(untested.response, null, '"untested" is not an answer');
  assert.ok(untested.pending.includes('system') && untested.pending.includes('substitution'));
});

/* ---------------------------------------------------------- 3. ownership */

test('ADR-0218 ownership: a multi-line person needs a NAMED deciding line, and a self-review is refused', () => {
  const env = seed();
  env.sit('mia');
  const ambiguous = env.api.justCultureOpen({ ...OPEN, decidingManagerId: '' });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.field, 'decidingManagerId', 'the record will not choose one of several managers');
  assert.match(ambiguous.error, /Nothing was saved/);
  assert.equal(env.store.state.justCultureReviews.length, 0);

  const self = env.api.justCultureOpen({ ...OPEN, personId: 'mia', decidingManagerId: '' });
  assert.equal(self.ok, false);
  assert.equal(self.field, 'personId');

  const future = env.api.justCultureOpen({ ...OPEN, decidingManagerId: 'mia', eventOn: '2026-11-16' });
  assert.equal(future.ok, false, 'an event cannot be dated after today');
  assert.equal(future.field, 'eventOn');
});

test('ADR-0218 ownership: a seat that is not the deciding line cannot decide, and the reader says why', () => {
  const env = withReview();
  env.sit('kai'); // kai holds ivo's second line, not the deciding line
  const refused = env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, on: '2026-11-15' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /deciding line|not .*line|line.*not/i, refused.error);
  assert.equal(env.store.state.justCultureActs.length, 0, 'a refused decision writes nothing');
});

/* --------------------------------------- 4. a departure from the answers needs a reason */

test('ADR-0218 decision: a response that departs from the answers is refused without a reason, and kept with one', () => {
  const env = withReview();
  env.on('2026-11-15');
  // The answers point to CONSOLE; the manager chooses FORMAL REVIEW with no reason.
  const bare = env.api.justCultureDecide({
    reviewId: env.reviewId,
    deviation: 'departure', choice: 'unintended', risk: '', substitution: 'peer-would-not', system: 'none-identified',
    response: 'formal-review', departureReason: '', systemAction: '', note: 'Basis for the decision, written out in full here.', on: '2026-11-15',
  });
  assert.equal(bare.ok, false);
  assert.equal(bare.field, 'departureReason');

  const reasoned = env.api.justCultureDecide({
    reviewId: env.reviewId,
    deviation: 'departure', choice: 'unintended', risk: '', substitution: 'peer-would-not', system: 'none-identified',
    response: 'formal-review', departureReason: 'Three unsigned sheets in a week is a pattern the coach conversation has not yet reached.', systemAction: '', note: 'Basis for the decision, written out in full here.', on: '2026-11-15',
  });
  assert.equal(reasoned.ok, true, reasoned.error);
  assert.equal(reasoned.followsAnswers, false);
  assert.equal(reasoned.expectedResponse, 'console');

  const report = env.api.justCultureReport();
  const row = report.rows.find((r) => r.id === env.reviewId);
  assert.equal(row.decision.response, 'formal-review', 'the response chosen is stored');
  assert.equal(row.decision.expectedResponse, 'console', 'the response the answers point to is stored beside it');
  assert.equal(row.decision.followsAnswers, false, 'and the departure is printed as one');
  assert.equal(report.totals.departsN, 1);
});

test('ADR-0218 decision: a system condition present without a named system action is refused', () => {
  const env = withReview();
  env.on('2026-11-15');
  const refused = env.api.justCultureDecide({
    reviewId: env.reviewId,
    deviation: 'departure', choice: 'unintended', risk: '', substitution: 'peer-would-not', system: 'present',
    response: 'console', departureReason: '', systemAction: '', note: 'Basis for the decision, written out in full here.', on: '2026-11-15',
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.field, 'systemAction');
});

/* -------------------------------------- 5. concurrence, dissent, and revision */

test('ADR-0218 concurrence: another line must answer; a dissent contests; a revision resets concurrence', () => {
  const env = withReview();
  env.on('2026-11-15');
  const decided = env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, on: '2026-11-15' });
  assert.equal(decided.ok, true, decided.error);

  let row = env.api.justCultureReport().rows.find((r) => r.id === env.reviewId);
  assert.equal(row.state, 'awaiting-concurrence', 'a decision is not settled while another line the person holds has not answered');
  assert.deepEqual(row.owedLines.map((l) => l.managerId), ['kai']);

  env.sit('kai');
  const dissent = env.api.justCultureConcur({ reviewId: env.reviewId, verdict: 'dissent', note: 'Not a slip: the sheet was signed off in my system and left unsigned on paper.', on: '2026-11-15' });
  assert.equal(dissent.ok, true, dissent.error);
  row = env.api.justCultureReport().rows.find((r) => r.id === env.reviewId);
  assert.equal(row.state, 'contested', 'a dissent contests the decision — it is not settled');

  env.sit('mia');
  const revised = env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, note: 'Revised after kai’s dissent: the paper and the system disagree, so the step is recorded as unclear.', on: '2026-11-15' });
  assert.equal(revised.ok, true, revised.error);
  assert.equal(revised.revision, true);
  row = env.api.justCultureReport().rows.find((r) => r.id === env.reviewId);
  assert.equal(row.state, 'awaiting-concurrence', 'a revision resets concurrence: earlier answers no longer count');
});

test('ADR-0218 concurrence: the deciding line cannot concur with its own decision', () => {
  const env = withReview();
  env.on('2026-11-15');
  assert.equal(env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, on: '2026-11-15' }).ok, true);
  const self = env.api.justCultureConcur({ reviewId: env.reviewId, verdict: 'concur', on: '2026-11-15' });
  assert.equal(self.ok, false, 'mia holds the deciding line; she does not concur with herself');
});

/* ------------------------------------------------------------ 6. withdrawal */

test('ADR-0218 withdrawal: once withdrawn, every later act is refused and the review stays on the record', () => {
  const env = withReview();
  env.on('2026-11-15');
  const withdrawn = env.api.justCultureWithdraw({ reviewId: env.reviewId, note: 'Opened on the wrong person: the sheets were signed by the night lead.', on: '2026-11-15' });
  assert.equal(withdrawn.ok, true, withdrawn.error);

  const decided = env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, on: '2026-11-15' });
  assert.equal(decided.ok, false, 'a decision after a withdrawal is refused');

  const row = env.api.justCultureReport().rows.find((r) => r.id === env.reviewId);
  assert.equal(row.state, 'withdrawn');
  assert.equal(env.store.state.justCultureReviews.length, 1, 'withdrawn, not deleted');
});

/* ------------------------------------------------ 7. reload and displayed data */

test('ADR-0218 reload: a stored row is the row its loader returns, and a malformed one is dropped and counted', () => {
  const env = withReview();
  env.on('2026-11-15');
  env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, on: '2026-11-15' });

  const stored = env.store.state.justCultureReviews[0];
  const warnings = [];
  const [reloaded] = normalizeJustCultureReviews([JSON.parse(JSON.stringify(stored))], warnings);
  assert.deepEqual(reloaded, stored, 'no repair, no re-dating, no line invented on reload');

  const junk = normalizeJustCultureReviews([{ id: 'bad', personId: '' }, stored], warnings);
  assert.equal(junk.length, 1, 'a malformed review is dropped');
  assert.ok(warnings.length >= 1, 'and counted in the warnings');
});

test('ADR-0218 reader: the displayed counts are the reader’s counts, and the badge is the panel’s attention figure', () => {
  const env = withReview();
  env.on('2026-11-15');
  const seatState = env.store.state;
  const report = env.api.justCultureReport();
  assert.equal(report.totals.reviewsN, 1);
  assert.equal(report.totals.reconciles, true, 'per-state counts add up to the reviews held');
  assert.equal(report.totals.byState['awaiting-decision'], 1);

  const badge = env.api.justCultureAttentionCount();
  assert.equal(badge, report.attention, 'the badge is the figure the panel prints');
  // Fail closed: a read with no seat sees nothing and owes nothing — not the count.
  assert.equal(justCultureAttentionCount(seatState, { now: at('2026-11-15'), seat: null }), 0, 'no seat, no attention owed');
});

test('ADR-0218 panel: what the screen prints is what the reader computed, cell by cell', () => withDom((dom) => {
  const env = withReview();
  env.on('2026-11-15');
  const ctx = { api: env.api, navigate: () => {}, refresh: () => {}, query: new URLSearchParams('') };
  const report = env.api.justCultureReport();
  const node = renderJustCulture(ctx);
  const text = (testid) => node.querySelector(`[data-testid="${testid}"]`)?.textContent?.trim();
  assert.equal(text('jc-count-total'), String(report.totals.reviewsN));
  assert.equal(text('jc-count-awaiting-decision'), String(report.totals.byState['awaiting-decision']));
  assert.equal(text('jc-count-contested'), String(report.totals.byState.contested));
  assert.equal(text('jc-count-departs'), String(report.totals.departsN));
  const row = report.rows.find((r) => r.id === env.reviewId);
  const rowNode = node.querySelector(`[data-testid="jc-row-${env.reviewId}"]`);
  assert.ok(rowNode, 'the review row is printed');
  assert.equal(rowNode.getAttribute('data-state'), row.state);
  assert.ok(rowNode.textContent.includes(row.personName));
  assert.ok(rowNode.textContent.includes('Awaiting decision'));
  void dom;
}));

test('ADR-0218 gateway: the decide right is refused to a seat below the manager altitude', () => {
  assert.equal(JUST_CULTURE_RIGHTS.DECIDE, 'decide-just-culture');
  const env = withReview();
  env.sit('dan'); // director: rank 3, above the decide window of 1–2
  env.on('2026-11-15');
  const refused = env.api.justCultureDecide({ reviewId: env.reviewId, ...ANSWERS.console, on: '2026-11-15' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /rank window is 1–2; this seat is rank 3/);
});


test('line disclosure omits small groups from the reader and screen while preserving exact eligible counts', () => withDom(() => {
  const env = withReview();
  for (let i = 0; i < 2; i++) assert.ok(env.api.justCultureOpen({ ...OPEN, decidingManagerId: 'mia' }).ok);
  env.sit('kai');
  assert.ok(env.api.justCultureOpen({ ...OPEN, personId: 'lea', decidingManagerId: 'kai' }).ok);
  env.sit('dan');
  const report = env.api.justCultureReport();
  assert.equal(report.totals.reviewsN, 4);
  assert.equal(report.totals.withheldLines, 1);
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].managerId, 'mia');
  assert.equal(report.lines[0].reviewsN, 3);
  assert.equal(report.lines[0].byState['awaiting-decision'], 3);
  assert.ok(!JSON.stringify(report.lines).includes('kai'));
  const node = renderJustCulture({ api: env.api, navigate: () => {}, refresh: () => {}, query: new URLSearchParams('view=lines') });
  const lines = node.querySelector('[data-testid="jc-lines"]');
  assert.ok(lines.textContent.includes('1 line(s) withheld'));
  assert.ok(lines.textContent.includes('not a confidentiality guarantee'));
  assert.ok(!lines.querySelector('[data-testid="jc-line-kai"]'));
  const row = lines.querySelector('[data-testid="jc-line-mia"]');
  assert.ok(row);
  const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim());
  assert.equal(cells[1], String(report.lines[0].reviewsN));
  assert.ok(cells[2].startsWith(String(report.lines[0].byState['awaiting-decision'])));
}));
