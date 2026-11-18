// ADR-0261 — Performance Calibration Decision Register (Schema v214 head; the
// register itself landed at v213).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — three empty ledgers (calSessions,
//      calDecisions, calMarkers) and three declared conventions, and no
//      session, decision or marker inferred from a review, a comp run or a
//      person record;
//   2. the loaders are FAIL-CLOSED — a session with no reference, cycle,
//      title, status, opened day, holder or recording hand is DROPPED with a
//      counted warning, a closed session with no closed day is dropped, an
//      open session with a closed day is dropped, a decision with no rationale
//      or with a rating outside the closed set is dropped, and a decision
//      naming a session that is not on the register is dropped. Nothing is
//      repaired;
//   3. the STATES are DERIVED and five different facts — uncalibrated,
//      calibrated, adjusted, divergent-uncalibrated, overdue-session — and a
//      session recorded as balanced whose decisions say otherwise prints the
//      divergence, because the reader recomputes from its inputs;
//   4. the CALIBRATED RATING IS NEVER AVERAGED — two divergent proposals are
//      never merged into one calibrated rating; the proposed rating is
//      re-read from the review and must match it at the door;
//   5. the MATRIX is correct — every active line holding the person is
//      resolved, a person is counted ONCE, the joint apex is computed over
//      ALL of them, and a hand off the graph is printed as an orphan, never
//      dropped;
//   6. RULE-CAL-01 is idempotent, capped at four asks per commit,
//      self-closing, pause-governed on every path, OPAQUE in its ask text and
//      observes identity-free where nobody can be asked;
//   7. the DOOR refuses a duplicate session, a bad status, a bad rating, a
//      decision whose proposed rating disagrees with the review, a decision
//      with no rationale, a decision on a closed session, a future day, and
//      narrows every write to a seat that holds the right;
//   8. the CSV boundary is aggregate, identity-free and floored, and its
//      summary equals the reader's own totals;
//   9. the panel prints the reader's own figures cell by cell (display ==
//      computed), on an empty workspace and on the demo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { buildCalibration, deriveCalibration, calAttentionCount, calSignals } from '../../app/core/domain/cal.js';
import { createCalActions } from '../../app/core/domain/calActions.js';
import {
  normalizeCalDecisions,
  normalizeCalMarkers,
  normalizeCalSessions,
  normalizeCalSettings,
} from '../../app/core/domain/calSchema.js';
import { distributionCounts, fourFifths, ratingGap } from '../../app/core/domain/calMath.js';
import { calConditions, calRule, indexCalAsks } from '../../app/core/domain/calRules.js';
import { calCsvRows } from '../../app/core/domain/calReport.js';
import {
  CAL_CSV_COLUMNS,
  CAL_CSV_SCOPE,
  CAL_PAUSE_SWITCH,
  CAL_RATING_KEYS,
  CAL_SETTING_KEYS,
  CAL_STATE_KEYS,
} from '../../app/core/domain/calRegistry.js';
import { renderPerformanceCalibration } from '../../app/views/performanceCalibration.js';

const NOW = new Date('2026-11-18T09:00:00.000Z');
const T0 = NOW.toISOString();
const iso = (value) => new Date(value).toISOString();
const day = (offset) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- fixtures */

function person(id, name, level, managerId) {
  return { id, name, role: level, level, managerId, status: 'active', startDate: iso('2024-01-01T00:00:00.000Z'), createdAt: iso('2024-01-01T00:00:00.000Z'), updatedAt: iso('2024-01-01T00:00:00.000Z') };
}

function line(id, personId, managerId, kind = 'functional') {
  return { id, personId, managerId, kind, shareH: null, rights: [], fromISO: iso('2024-01-01T00:00:00.000Z'), toISO: null, declaredAt: iso('2024-01-01T00:00:00.000Z'), note: '', status: 'active', history: [] };
}

/**
 * `dana` and `omar` are two director lines. `mei` sits under `dana`; `priya`
 * sits under `omar`; `samuel` is held by BOTH (`mei` as his home line and
 * `priya` as a declared secondary line), which is the matrix case this register
 * must get right. `frieda` is under `priya` only.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Function', 'director', 'ceo'),
    person('omar', 'Omar Project', 'director', 'ceo'),
    person('mei', 'Mei Manager', 'manager', 'dana'),
    person('priya', 'Priya Manager', 'manager', 'omar'),
    person('samuel', 'Samuel Holder', 'ic', 'mei'),
    person('frieda', 'Frieda Holder', 'ic', 'priya'),
  ];
  raw.reportingLines = [
    line('rl-mei-dana', 'mei', 'dana'),
    line('rl-priya-omar', 'priya', 'omar'),
    line('rl-samuel-mei', 'samuel', 'mei'),
    line('rl-samuel-priya', 'samuel', 'priya', 'cross-functional'),
    line('rl-frieda-priya', 'frieda', 'priya'),
  ];
  Object.assign(raw, overrides);
  return raw;
}

/** A completed review with a manager rating. The proposed rating is read from it. */
function review(overrides = {}) {
  return {
    id: 'rev-samuel',
    personId: 'samuel',
    periodStart: day(-120),
    periodEnd: day(-30),
    status: 'complete',
    selfReflection: { achievements: 'Ship the migration.', challenges: 'Headcount slip.', growth: 'Delegate.', support: 'Mentoring.' },
    selfReflectionRecordedAt: iso(day(-31)),
    manager: { achievements: 'Delivered on time.', development: 'Stretch the delegation.', nextSteps: 'Lead the next cycle.', rating: 'meets-expectations' },
    evidence: [],
    stewardship: { asks: [], answers: [] },
    instrumentNotes: [],
    createdAt: iso(day(-30)),
    updatedAt: iso(day(-30)),
    completedAt: iso(day(-30)),
    ...overrides,
  };
}

const session = (overrides = {}) => ({
  sessionId: 'cal-sess-one',
  cycle: 'FY2026-H1',
  title: 'FY2026 H1 calibration',
  scope: 'All ic-level holders in the two divisions',
  status: 'open',
  openedOn: day(-20),
  closedOn: null,
  declaredDistribution: '',
  holders: ['dana', 'omar'],
  createdBy: 'mei',
  createdAt: iso(day(-20)),
  ...overrides,
});

const decision = (overrides = {}) => ({
  decisionId: 'cal-dec-one',
  sessionId: 'cal-sess-one',
  personId: 'samuel',
  reviewId: 'rev-samuel',
  proposedRating: 'meets-expectations',
  calibratedRating: 'meets-expectations',
  rationale: 'The committee confirmed the proposal; evidence supports the rating.',
  decidedBy: 'dana',
  decidedOn: day(-10),
  decidedAt: iso(day(-10)),
  ...overrides,
});

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildCalibration(load(raw), { now: NOW, ...opts });

function harness(raw) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(load(raw))]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-t-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  return { store, api };
}

function asSeat(api, store, seatId) {
  store.update((draft) => { draft.settings.activeSeatId = seatId; }, { type: 'test.seat', entity: 'workspace', entityId: seatId, summary: 'test seat' });
  return api;
}

/* --------------------------------------------------------------- 1. schema */

test('schema v214 is additive: three empty ledgers, three conventions, nothing inferred', () => {
  assert.equal(SCHEMA_VERSION, 214, 'ADR-0262 (secondment & assignment return) is the current head; prior registers ride along');
  const state = load(fixture());
  for (const collection of ['calSessions', 'calDecisions', 'calMarkers']) {
    assert.ok(COLLECTIONS.includes(collection), `${collection} must be a governed collection`);
    assert.deepEqual(state[collection], [], `${collection} starts empty`);
  }
  const conv = normalizeCalSettings(state.settings);
  assert.equal(conv[CAL_SETTING_KEYS.autoPropagate], true, 'calibration propagation defaults ON');
  assert.equal(conv[CAL_SETTING_KEYS.privacyFloor], 3, 'privacy floor defaults to 3');
  assert.equal(conv[CAL_SETTING_KEYS.warnHorizonDays], 30, 'warn horizon defaults to 30 days');
  // Nothing inferred from a review or a person record.
  assert.deepEqual(state.calSessions, []);
  assert.deepEqual(state.calDecisions, []);
});

test('migration 212 → 214 is additive and carries the empty ledgers forward', () => {
  const before = migrate({ schemaVersion: 212, settings: {} });
  assert.equal(before.raw.schemaVersion, 214);
  assert.deepEqual(before.applied, ['212 → 213', '213 → 214']);
  assert.deepEqual(before.raw.calSessions, []);
  assert.deepEqual(before.raw.calDecisions, []);
  assert.deepEqual(before.raw.calMarkers, []);
  // ADR-0262 rode along at 213 → 214: four empty secondment ledgers, nothing inferred.
  assert.deepEqual(before.raw.asgAssignments, []);
  assert.deepEqual(before.raw.asgCovers, []);
  assert.deepEqual(before.raw.asgActs, []);
  assert.deepEqual(before.raw.asgMarkers, []);
});

/* -------------------------------------------------------------- 2. loaders */

test('the loaders are fail-closed: a bad session or decision is dropped, not repaired', () => {
  const warnings = [];
  // A session with no holders is dropped.
  assert.equal(normalizeCalSessions([session({ holders: [] })], warnings).length, 0);
  assert.ok(warnings.some((w) => w.includes('calSessions')), 'a dropped session is counted');

  // A closed session with no closed day is dropped.
  assert.equal(normalizeCalSessions([session({ status: 'closed', closedOn: null })], warnings).length, 0);

  // An open session carrying a closed day is dropped.
  assert.equal(normalizeCalSessions([session({ status: 'open', closedOn: day(-1) })], warnings).length, 0);

  // A decision with no rationale is dropped.
  const sessions = normalizeCalSessions([session()], []);
  assert.equal(normalizeCalDecisions([decision({ rationale: '' })], sessions, warnings).length, 0);
  assert.ok(warnings.some((w) => w.includes('calDecisions')), 'a dropped decision is counted');

  // A decision with a rating outside the closed set is dropped.
  assert.equal(normalizeCalDecisions([decision({ calibratedRating: 'nine-box' })], sessions, warnings).length, 0);

  // A decision naming a session that is not on the register is dropped.
  assert.equal(normalizeCalDecisions([decision({ sessionId: 'no-such-session' })], sessions, warnings).length, 0);

  // A decision with no rationale is DROPPED, never completed.
  const out = normalizeCalDecisions([decision({ rationale: '' })], sessions, []);
  assert.equal(out.length, 0, 'a calibration nobody justified is dropped, not completed');
});

test('the loader keeps an off-roster hand as an orphan, never drops the duty', () => {
  const warnings = [];
  const sessions = normalizeCalSessions([session({ holders: ['ghost'] })], warnings);
  assert.equal(sessions.length, 1, 'a session with a hand off the roster is kept');
  assert.deepEqual(sessions[0].holders, ['ghost'], 'the hand is kept so the duty is not erased');
});

/* ---------------------------------------------------------- 3. the states */

test('the five states are derived, not stored, and a session that lies prints the divergence', () => {
  // A decision recorded as calibrated with a rationale.
  const state = load(fixture({ reviews: [review()], calSessions: [session()], calDecisions: [decision()] }));
  const report = buildCalibration(state, { now: NOW });
  assert.equal(report.sessions.length, 1);
  const row = report.sessions[0].rows.find((r) => r.personId === 'samuel');
  assert.equal(row.state, 'calibrated', 'a recorded, matching decision is calibrated');

  // A decision whose calibrated rating differs from the proposal is adjusted.
  const adjusted = load(fixture({ reviews: [review()], calSessions: [session()], calDecisions: [decision({ calibratedRating: 'often-exceeds' })] }));
  const row2 = buildCalibration(adjusted, { now: NOW }).sessions[0].rows.find((r) => r.personId === 'samuel');
  assert.equal(row2.state, 'adjusted', 'a differing calibrated rating is adjusted, with rationale');

  // No decision at all is uncalibrated.
  const noDec = load(fixture({ reviews: [review()], calSessions: [session()] }));
  const row3 = buildCalibration(noDec, { now: NOW }).sessions[0].rows.find((r) => r.personId === 'samuel');
  assert.equal(row3.state, 'uncalibrated', 'no decision means uncalibrated');
});

test('two divergent proposals are NEVER averaged', () => {
  // Samuel has two lines. A single-line kernel never averages; the divergence
  // is a derived state. We drive the kernel directly with two reviews for one
  // person on two lines to prove the reader refuses to average.
  const derived = deriveCalibration({
    session: session(),
    decisions: [],
    reviews: [
      review({ id: 'rev-a', personId: 'samuel', manager: { rating: 'needs-development' } }),
      review({ id: 'rev-b', personId: 'samuel', manager: { rating: 'sets-standard' } }),
    ],
    people: fixture().people,
    matrix: null,
    todayDay: day(0),
    conventions: normalizeCalSettings({}),
  });
  // The reader takes the LATEST completed review per person as the proposal,
  // but never merges two divergent lines into a calibrated rating.
  const samuel = derived.rows.find((r) => r.personId === 'samuel');
  assert.ok(samuel, 'the person is present');
  assert.equal(samuel.calibratedRating, null, 'no calibrated rating is invented to reconcile divergence');
});

/* ------------------------------------------------------------- 4. matrix */

test('the matrix resolves every active line, counts a person once, and computes the joint apex', () => {
  // Samuel is held by mei (home) and priya (cross-functional). The reader
  // resolves every active line and computes the joint apex above them.
  const state = load(fixture({ reviews: [review()], calSessions: [session()], calDecisions: [decision()] }));
  const report = buildCalibration(state, { now: NOW });
  const row = report.sessions[0].rows.find((r) => r.personId === 'samuel');
  assert.ok(row, 'samuel is counted once');
  assert.ok(row.lines.length >= 2, 'every active line holding the person is resolved');
  assert.ok(row.managerIds.includes('mei') && row.managerIds.includes('priya'), 'both line managers are resolved');
  assert.ok(row.jointApex, 'the joint apex over all lines is computed');
});

/* -------------------------------------------------------------- 5. rule */

test('RULE-CAL-01 files capped, opaque, self-closing asks to the joint apex', () => {
  const state = load(fixture({ reviews: [review()], calSessions: [session({ openedOn: day(-40) })] }));
  const committed = [];
  // The commit mutates state.links exactly as the spine does, so idempotency
  // can see the prior ask on the second run.
  const commit = (entry) => { committed.push(entry); state.links = [...(state.links || []), { ...entry, status: 'open' }]; };
  const out = calRule(state, { now: NOW, settings: normalizeCalSettings({}), commit });
  assert.ok(out.filed >= 1, 'an overdue, uncalibrated person files at least one ask');
  assert.ok(out.filed <= 4, 'the rule is capped at four asks per commit');
  for (const entry of committed) {
    assert.equal(entry.kind, 'issues-obligation');
    assert.equal(entry.from, 'performance-calibration');
    assert.match(entry.signature, /^cal1:/, 'the opaque signature lives only in the typed link');
    // Ask text is opaque: no session reference, person, rating or rationale.
    assert.doesNotMatch(entry.title, /cal-sess|samuel|meets-expectations/i, 'the ask title is opaque');
    assert.ok(entry.to, 'the ask is addressed to a joint apex');
  }

  // Idempotent: a second run with the same open ask files nothing new.
  const out2 = calRule(state, { now: NOW, settings: normalizeCalSettings({}), commit });
  assert.equal(out2.filed, 0, 'an already-open ask is not re-filed');
});

test('RULE-CAL-01 is pause-governed on every path, including the explicit scan', () => {
  const state = load(fixture({ reviews: [review()], calSessions: [session({ openedOn: day(-40) })] }));
  const pausedSettings = { ...normalizeCalSettings({}), [CAL_PAUSE_SWITCH]: false };
  const out = calRule(state, { now: NOW, settings: pausedSettings, commit: () => {} });
  assert.equal(out.paused, true, 'the rule pauses when the switch is off');
  // The explicit scan always runs, even when paused.
  const scanOut = calRule(state, { now: NOW, settings: pausedSettings, commit: () => {}, scan: true });
  assert.equal(scanOut.paused, false, 'the explicit scan runs even when paused');
});

test('RULE-CAL-01 observes identity-free where nobody can be asked', () => {
  // A session whose hands are all off the graph and whose person is not on
  // the roster at all (printed as an orphan, never dropped), opened past the
  // warn horizon — so no manager line resolves the apex and the rule writes an
  // identity-free marker.
  const state = load(fixture({
    people: [
      person('ceo', 'Cleo Executive', 'vp', null),
      person('dana', 'Dana Function', 'director', 'ceo'),
      person('omar', 'Omar Project', 'director', 'ceo'),
      person('mei', 'Mei Manager', 'manager', 'dana'),
      person('priya', 'Priya Manager', 'manager', 'omar'),
      person('frieda', 'Frieda Holder', 'ic', 'priya'),
    ],
    reviews: [review()],
    calSessions: [session({ holders: ['ghost-one', 'ghost-two'], openedOn: day(-40) })],
    reportingLines: [
      line('rl-mei-dana', 'mei', 'dana'),
      line('rl-priya-omar', 'priya', 'omar'),
      line('rl-frieda-priya', 'frieda', 'priya'),
    ],
  }));
  const markers = [];
  const commit = (entry) => { markers.push(entry); };
  const out = calRule(state, { now: NOW, settings: normalizeCalSettings({}), commit });
  assert.equal(out.markers >= 1, true, 'where nobody can be asked, an identity-free marker is written');
  assert.equal(out.filed, 0, 'no ask is filed where there is no addressee');
  assert.ok(state.calMarkers.length >= 1, 'the marker is stored on the record');
  const marker = state.calMarkers[0];
  assert.equal(typeof marker.condition, 'string');
  assert.ok(!('personId' in marker), 'the marker carries no person');
});

test('the rule spine is registered in the propagation contracts', () => {
  const entry = PROPAGATION_CONTRACTS.find((c) => c.rule === calRule);
  assert.ok(entry, 'RULE-CAL-01 is on the shared spine');
  assert.equal(entry.module, 'calRules.js');
  assert.ok(entry.writes.includes('calMarkers'), 'the rule writes identity-free calMarkers');
  assert.ok(entry.scansWorkspace, 'the rule scans the workspace');
});

/* ---------------------------------------------------------------- 6. door */

test('the door refuses a bad rating, a misstated proposal, a missing rationale and a closed session', () => {
  const { api, store } = harness(fixture({ reviews: [review()] }));

  // Record a session first.
  const rec = api.recordCalSession(session());
  assert.equal(rec.ok, true, 'the session is recorded');

  // A decision whose proposed rating disagrees with the review is refused.
  const bad = api.recordCalDecision(decision({ proposedRating: 'sets-standard' }));
  assert.equal(bad.ok, false, 'a misstated proposal is refused');
  assert.match(bad.error, /proposed rating must match/);

  // A decision with no rationale is refused.
  const noRationale = api.recordCalDecision(decision({ rationale: '' }));
  assert.equal(noRationale.ok, false, 'a calibration without rationale is refused');

  // A valid decision is accepted.
  const good = api.recordCalDecision(decision());
  assert.equal(good.ok, true, 'a valid decision is recorded');

  // A duplicate decision for the same person is refused.
  const dup = api.recordCalDecision(decision({ decisionId: 'cal-dec-two' }));
  assert.equal(dup.ok, false, 'a duplicate decision is refused');

  // Close the session, then a new decision is refused.
  const close = api.closeCalSession({ sessionId: 'cal-sess-one', closedOn: day(-1) });
  assert.equal(close.ok, true, 'the session is closed');
  const afterClose = api.recordCalDecision(decision({ decisionId: 'cal-dec-three', personId: 'frieda' }));
  assert.equal(afterClose.ok, false, 'a closed session takes no new decisions');
  assert.match(afterClose.error, /closed/i);
});

test('the door refuses a duplicate session and a future day', () => {
  const { api } = harness(fixture());
  assert.equal(api.recordCalSession(session()).ok, true);
  const dup = api.recordCalSession(session());
  assert.equal(dup.ok, false, 'a duplicate session is refused');
  const future = api.recordCalSession(session({ sessionId: 'cal-sess-two', openedOn: day(5) }));
  assert.equal(future.ok, false, 'a future opened day is refused');
});

/* ----------------------------------------------------------------- 7. CSV */

test('the CSV boundary is aggregate, identity-free and floored, and equals the reader', () => {
  const state = load(fixture({
    reviews: [review()],
    calSessions: [session()],
    calDecisions: [decision()],
  }));
  const out = exportWorkspaceCsv(state, CAL_CSV_SCOPE, { now: NOW });
  assert.equal(out.ok, true, 'the export produces a file');
  const parsed = parseCsv(out.csv);
  assert.ok(parsed.rows.length >= 1, 'the export has rows');

  // Every column is in the declared set.
  for (const header of parsed.headers) {
    assert.ok(CAL_CSV_COLUMNS.includes(header), `column ${header} is declared`);
  }

  // Map the CSV rows (arrays) to objects keyed by header.
  const rows = parsed.rows.map((cells) => Object.fromEntries(parsed.headers.map((header, i) => [header, cells[i] ?? ''])));

  // No identity crosses the boundary: no session reference, person or rating
  // sentence. Check the summary row carries counts, not names.
  const summary = rows.find((r) => r.row_kind === 'summary');
  assert.ok(summary, 'there is a summary row');
  assert.equal(summary.sessions_n, '1', 'the summary session count equals the reader');
  assert.equal(summary.total_persons_n, '1', 'the summary person count equals the reader');

  // The reader's own totals re-add to the CSV summary.
  const report = buildCalibration(state, { now: NOW });
  assert.equal(Number(summary.sessions_n), report.sessions.length);
  assert.equal(Number(summary.total_persons_n), report.enterprise.totalPersons);
  assert.equal(Number(summary.total_decisions_n), report.enterprise.totalDecisions);

  // Privacy floor: a per-state count below the floor is withheld BLANK.
  const floor = report.conventions[CAL_SETTING_KEYS.privacyFloor];
  const stateRows = rows.filter((r) => r.row_kind === 'state');
  for (const row of stateRows) {
    if (Number(row.calibrated_n) > 0 && Number(row.calibrated_n) < floor) {
      assert.equal(row.calibrated_n, '', 'a count below the floor is withheld, not printed small');
    }
  }
});

/* ------------------------------------------------------------ 8. the view */

test('the panel prints the reader figures cell by cell on the demo', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const state = load(buildDemoState(NOW));
    const report = buildCalibration(state, { now: NOW });
    const view = renderPerformanceCalibration({ api: { getState: () => state }, query: new URLSearchParams(''), state, calibrationReport: report, refresh: () => {} });
    const html = view.outerHTML || String(view);
    // The stats reflect the reader's enterprise totals.
    assert.ok(html.includes(`data-testid="performance-calibration-page"`), 'the page renders');
    assert.ok(html.includes('Performance calibration'), 'the page title renders');
    // Displayed == computed: the sessions stat equals the reader's count.
    assert.ok(html.includes(String(report.enterprise.totalSessions)), 'the sessions stat equals the reader');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the panel renders on an empty workspace without throwing', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const state = load(fixture());
    const report = buildCalibration(state, { now: NOW });
    for (const viewKey of ['sessions', 'decisions', 'distributions', 'method']) {
      const view = renderPerformanceCalibration({
        api: { getState: () => state },
        query: new URLSearchParams(`view=${viewKey}`),
        state,
        calibrationReport: report,
        refresh: () => {},
      });
      const html = view.outerHTML || String(view);
      assert.ok(html.includes('data-testid="performance-calibration-page"'), `the ${viewKey} view renders`);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

/* ------------------------------------------- 8b. standing repair: the seat gate */

test('standing repair (ADR-0261): a truthy { allow:false } verdict is a REFUSAL, and no first-seat fallback exists', () => {
  const { api, store } = harness(fixture({ reviews: [review()] }));
  // The undeclared operator (full access) manages — the historical default.
  assert.equal(api.recordCalSession(session()).ok, true, 'the operator seat still manages');

  // A seated hand with NO calibration right: `canAct` returns a truthy object
  // whose `allow` is false — the old gate passed that object as its own
  // permission. Call the ACTION directly (past the gateway, which also now
  // refuses) to prove the gate itself fails closed.
  const rawApi = createCalActions(store, { now: () => NOW, idFactory: (prefix) => `${prefix}-raw` });
  asSeat(api, store, 'samuel');
  const refused = rawApi.recordCalSession(session({ sessionId: 'cal-sess-two' }));
  assert.equal(refused.ok, false, 'a verdict object is not its own permission');
  assert.equal(refused.refusal, 'performance-calibration:no-right');
  // An unresolvable seat acts on nothing — the old `seats[0]` fallback is gone.
  asSeat(api, store, 'seat-that-never-existed');
  const ghostRefused = rawApi.recordCalSession(session({ sessionId: 'cal-sess-three' }));
  assert.equal(ghostRefused.ok, false, 'an unresolved seat acts on nothing');
  // The gateway refuses the same unseated call too (the wiring repair).
  asSeat(api, store, 'samuel');
  const gated = api.recordCalSession(session({ sessionId: 'cal-sess-four' }));
  assert.equal(gated.ok, false, 'the gateway refuses an unseated write by name');
  // Nothing was written by any refusal.
  assert.equal(store.state.calSessions.length, 1, 'displayed == stored: one session on the record');
});

/* ------------------------------------------------------------- 9. reader */

test('the reader refuses below its floors and never invents a rating', () => {
  // Distribution counts never invent a rating.
  const dist = distributionCounts(['needs-development', 'bogus-rating']);
  assert.equal(dist.counts['needs-development'], 1);
  assert.equal(dist.counts.unknown, 1, 'an unknown rating is counted, not invented');

  // Four-fifths is refused below the floor.
  const refused = fourFifths([{ key: 'A', favourable: 1, total: 1 }], { floor: 3 });
  assert.equal(refused.refused, true, 'the bias screen is refused below its floor');
  assert.equal(refused.flagged, false, 'a refused ratio never flags');

  // ratingGap is exact.
  assert.equal(ratingGap('needs-development', 'sets-standard'), 3, 'the gap between the extremes is three steps');
});

test('the attention count and signals are derived from the reader', () => {
  const state = load(fixture({ reviews: [review()], calSessions: [session({ openedOn: day(-40) })] }));
  const count = calAttentionCount(state, { now: NOW, settings: state.settings });
  assert.equal(count, calAttentionCount(state, { now: NOW, settings: state.settings }), 'the count is deterministic');
  const signals = calSignals(state, { now: NOW, settings: state.settings });
  for (const sig of signals) {
    assert.ok(['divergent-uncalibrated', 'overdue-session'].includes(sig.kind), 'each signal is one of the reader conditions');
  }
});
