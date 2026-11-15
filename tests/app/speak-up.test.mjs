// ADR-0215 — Speak-Up Concern Routing & Impartiality Register (Schema v169).
//
// This register's claims are governance and graph properties, so the tests are:
//
//   1. the schema bump is ADDITIVE — two ledgers and a marker table arrive empty,
//      and no concern is invented from the disputes an upgraded workspace holds;
//   2. the ROUTE is proved at the door: every disqualifying relationship is
//      refused by its own name, and a route that exists cannot be skipped;
//   3. the impartiality test is the one the doctrine claims — the subject's own
//      manager is an ESCALATION route (allowed and labelled), the subject's
//      subordinate is refused, and in a matrix the reporter's second line can
//      hear a concern about the home line;
//   4. the three clocks are three facts: acknowledgement, outcome and the dated
//      retaliation check, with "closed before any check" kept apart from "checked";
//   5. the disclosure ladder holds: the subject never reads their own concern, a
//      seat outside the span gets a count, and no name or body reaches the CSV;
//   6. a receiver who is no longer impartial after the fact is PRINTED as such
//      rather than quietly keeping the authority;
//   7. `RULE-SUP-01` files a deliberately opaque ask to the receiver only, exactly
//      once, closes it when the act lands, and stops when the switch is off;
//   8. a stored row is the row its loader returns — no repair, no re-dating, no
//      receiver invented on reload — and the panel prints what the reader computed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildSpeakUpReport, speakUpCsvRows, impartialityVerdict } from '../../app/core/domain/speakUp.js';
import { SPEAK_UP_CSV_SCOPE, SPEAK_UP_RULE_ID } from '../../app/core/domain/speakUpRegistry.js';
import { renderSpeakUp } from '../../app/views/speakUp.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { speakUpRule } from '../../app/core/domain/speakUpRules.js';

const T0 = '2026-11-15T12:00:00.000Z';
const at = (day) => new Date(`${day}T12:00:00.000Z`);
const LEADER = 'leader';

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

// ceo → vera (VP) → dan (director) → mia (manager) → ivo (IC)
//                    → vic (VP) → kai (manager) → lea (IC)
// mia ALSO answers to vic on a declared project line: the second line that can
// hear a concern about the home line is the whole reason a matrix exists here.
function fixture() {
  const raw = createEmptyState(T0);
  raw.people = [
    person('ceo', null, 'chief'),
    person('vera', 'ceo', 'vp'),
    person('vic', 'ceo', 'vp'),
    person('dan', 'vera', 'director'),
    person('mia', 'dan', 'manager'),
    person('ivo', 'mia', 'ic'),
    person('kai', 'vic', 'manager'),
    person('lea', 'kai', 'ic'),
  ];
  raw.reportingLines = [{
    id: 'rl-mia-vic', personId: 'mia', managerId: 'vic', kind: 'project', shareH: 20,
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
  // Any commit runs the spine; a settlement of the calendar needs one.
  const touch = () => store.update((draft) => { draft.settings = { ...draft.settings, retentionDays: 30 }; },
    { type: 'settings.updated', entity: 'settings', entityId: 'calendar', summary: 'calendar' });
  return { store, api, sit, on, touch, values, clock: () => clock };
}

const CONCERN = {
  subjectKind: 'person',
  subjectPersonId: 'dan',
  categoryKey: 'conduct',
  summary: 'The night handover is being skipped and nobody is being told when it is.',
  routeKey: 'internal-person',
  receiverId: 'vic',
  channelBasis: 'The home-line manager is the subject, so the second line vic holds over me hears it.',
};

/** mia raises a concern about dan, routed to vic (her declared second line). */
function withConcern(env = seed()) {
  env.sit('mia');
  const raised = env.api.speakUpRaiseConcern(CONCERN);
  assert.ok(raised.ok, raised.error);
  return { ...env, reportId: raised.reportId };
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

/* ------------------------------------------------------------ 1. schema v169 */

test('ADR-0215 schema: the bump is additive — three empty ledgers, four declared conventions', () => {
  assert.equal(SCHEMA_VERSION, 175);
  const old = createEmptyState(T0);
  old.schemaVersion = 168;
  delete old.concernReports;
  delete old.concernActs;
  delete old.concernMarkers;
  const migrated = migrate(old);
  assert.equal(migrated.applied.at(-1), '174 → 175');
  assert.deepEqual(migrated.raw.concernReports, []);
  assert.deepEqual(migrated.raw.concernActs, []);
  assert.deepEqual(migrated.raw.concernMarkers, []);
  // The windows arrive as declared defaults, and silence is never invented.
  assert.equal(migrated.raw.settings.speakUpAckDays, 7);
  assert.equal(migrated.raw.settings.speakUpFeedbackDays, 90);
  assert.equal(migrated.raw.settings.speakUpWatchDays, 90);
  assert.equal(migrated.raw.settings.speakUpAutoPropagate, true);

  // An upgraded workspace that holds disputes and cases gains NO concern.
  const busy = createEmptyState(T0);
  busy.schemaVersion = 168;
  delete busy.concernReports;
  busy.conflicts = [{ id: 'c-1', people: ['mia', 'kai'], status: 'open', title: 'Two managers disagree' }];
  busy.cases = [{ id: 'case-1', ownerId: 'dan', status: 'open', title: 'Something went wrong' }];
  const after = migrate(busy);
  assert.equal(after.raw.concernReports.length, 0, 'a dispute is not a report raised through a channel');
});

/* ------------------------------------------------------ 2. the door and route */

test('ADR-0215 route: every disqualifying relationship is refused by its own name', () => {
  const env = seed();
  env.sit('mia');
  const refusals = [
    ['receiver is the subject', { ...CONCERN, receiverId: 'dan' }, 'receiver-is-subject'],
    ['receiver sits below the subject', { ...CONCERN, receiverId: 'ivo' }, 'receiver-reports-to-subject'],
    ['self-concern', { ...CONCERN, subjectPersonId: 'mia' }, 'subject-is-reporter'],
    ['unknown receiver', { ...CONCERN, receiverId: 'ghost' }, 'receiver-not-on-roster'],
    ['no route while one exists', { ...CONCERN, routeKey: 'none-available', receiverId: null }, 'route-not-available'],
    ['future date', { ...CONCERN, raisedOn: '2026-12-01' }, 'future-dated'],
    ['category guessed', { ...CONCERN, categoryKey: 'vibes' }, 'unknown-category'],
    ['short summary', { ...CONCERN, summary: 'bad' }, 'summary-too-short'],
    ['external without a channel', { ...CONCERN, routeKey: 'external-declared', receiverId: null }, 'external-label-required'],
  ];
  for (const [label, input, refusal] of refusals) {
    const result = env.api.speakUpRaiseConcern(input);
    assert.equal(result.ok, false, `${label} must be refused`);
    assert.equal(result.refusal, `speakUp:${refusal}`, `${label} → ${result.error}`);
  }
  assert.equal(env.store.state.concernReports.length, 0, 'a refused concern leaves no row behind');
});

test('ADR-0215 route: a manager may hear a concern about their own report, and cannot hear one about the person they answer to', () => {
  const state = fixture();
  const env = seed(state);
  env.sit('mia');
  // The reporter's own manager is the ordinary route for a PRACTICE concern.
  const viaOwnManager = env.api.speakUpRaiseConcern({
    ...CONCERN, subjectKind: 'practice', subjectPersonId: null, subjectLabel: 'the night handover', receiverId: 'dan',
  });
  assert.ok(viaOwnManager.ok, viaOwnManager.error);
  // A receiver who answers to the subject cannot adjudge the subject.
  const below = env.api.speakUpRaiseConcern({ ...CONCERN, receiverId: 'ivo' });
  assert.equal(below.ok, false);
  assert.equal(below.refusal, 'speakUp:receiver-reports-to-subject');
});

test('ADR-0215 matrix: the second line hears a concern about the home line, and the role is printed', () => {
  const env = withConcern();
  const report = buildSpeakUpReport(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: null });
  const row = report.rows[0];
  assert.equal(row.receiverId, 'vic');
  assert.equal(row.receiverImpartial, true);
  assert.equal(row.receiverRoles.managesReporter, true, 'vic manages mia on the declared project line');
  assert.equal(row.receiverRoles.managesSubject, false);
  assert.match(row.receiverRoleLabel, /manages the reporter/);

  // The single-chain degenerate case: no declared line at all. The same concern
  // about dan then has no second line to fall back on, and the register says what
  // the graph actually offers rather than assuming a matrix.
  const chain = fixture();
  chain.reportingLines = [];
  const e2 = seed(normalizeState(chain, { now: at('2026-11-15') }).state);
  e2.sit('mia');
  const board = e2.api.speakUpCandidates({ subjectKind: 'person', subjectPersonId: 'dan' });
  assert.ok(board.ok, board.error);
  const ids = board.candidates.map((row) => row.id);
  assert.ok(!ids.includes('vic') || board.candidates.find((row) => row.id === 'vic')?.roles.managesReporter === false,
    'with no declared line, vic no longer manages the reporter');
  // The subject's own manager remains available, LABELLED as an escalation route.
  const vera = board.candidates.find((row) => row.id === 'vera');
  assert.ok(vera, 'vera can hear it');
  assert.equal(vera.roles.managesSubject, true, 'charging vera as "independent" would be the lie the register exists to avoid');
});

/* -------------------------------------------------- 3. structural absence */

test('ADR-0215 no-route: a concern against the workspace leader has no impartial seat, and the register prints that instead of inventing one', () => {
  const env = seed();
  env.sit('mia');
  const board = env.api.speakUpCandidates({ subjectKind: 'person', subjectPersonId: LEADER });
  assert.equal(board.candidates.length, 0, 'every seat in this record reports up to the leader');
  assert.ok(board.noRoute);

  const raised = env.api.speakUpRaiseConcern({
    ...CONCERN, subjectPersonId: LEADER, routeKey: 'none-available', receiverId: null,
    channelBasis: 'Every seat in this record reports to the leader; no impartial internal route exists.',
  });
  assert.ok(raised.ok, raised.error);
  const report = env.api.speakUpReport().report;
  assert.equal(report.rows[0].stateKey, 'no-impartial-route');
  assert.equal(report.noRouteN, 1);
  assert.equal(report.overdueN, 0, 'a structural absence is not an overdue clock');
  assert.equal(env.api.speakUpAttentionCount().count, 1);
  env.touch();
  assert.ok(env.store.state.concernMarkers.some((marker) => /no seat able to hear it/.test(marker.detail)),
    'the rule records an identity-free observation when nobody can be asked');
});

/* ------------------------------------------------------------ 4. the clocks */

test('ADR-0215 clocks: acknowledgement, outcome and retaliation are three separate facts', () => {
  const env = withConcern();
  const state = () => buildSpeakUpReport(env.store.state, { now: env.clock(), settings: env.store.state.settings, seat: null });

  // Day 0 — inside the seven-day window.
  env.on('2026-11-15');
  assert.equal(state().rows[0].stateKey, 'unacknowledged');
  assert.equal(state().rows[0].ackDueOn, '2026-11-22');

  // Day 11 — the window passed with nothing recorded.
  env.on('2026-11-26');
  assert.equal(state().rows[0].stateKey, 'ack-overdue');

  // A late acknowledgement is allowed and PRINTED as late, never rewritten.
  env.sit('vic');
  const ack = env.api.speakUpAcknowledge({ reportId: env.reportId, on: '2026-11-26', note: 'I received it today and have begun.' });
  assert.ok(ack.ok, ack.error);
  const acked = state().rows[0];
  assert.equal(acked.stateKey, 'acknowledged');
  assert.equal(acked.acknowledgedLate, true, 'the lateness is a fact about the promise, not a hidden detail');
  assert.equal(acked.feedbackDueOn, '2027-02-24');

  // Day 200 — the feedback window passed.
  env.on('2027-03-01');
  assert.equal(state().rows[0].stateKey, 'feedback-overdue');

  const out = env.api.speakUpRecordOutcome({ reportId: env.reportId, on: '2027-03-01', outcomeKey: 'upheld', note: 'Handover restored and audited for a fortnight.' });
  assert.ok(out.ok, out.error);
  assert.equal(state().rows[0].stateKey, 'outcome-recorded');
  assert.equal(state().rows[0].resolvedLate, true);

  // Day 400 — the retaliation window closed with NO check: refused information.
  env.on('2027-06-04');
  const overdue = state().rows[0];
  assert.equal(overdue.stateKey, 'watch-overdue');
  assert.equal(overdue.watchState, 'overdue');
  assert.equal(overdue.watchVerdictKey, null, 'silence is never a verdict');

  // Closing does NOT erase the missing check; it is printed as skipped-by-close.
  const closed = env.api.speakUpCloseConcern({ reportId: env.reportId, on: '2027-06-04', note: 'Closing with the check unresolved so the gap stays visible.' });
  assert.ok(closed.ok, closed.error);
  const after = state().rows[0];
  assert.equal(after.stateKey, 'closed');
  assert.equal(after.watchState, 'skipped-by-close');
});

test('ADR-0215 clocks: a window change after the fact cannot rewrite the promise made to that reporter', () => {
  const env = withConcern();
  // A manager may not declare the promise; a director-and-above seat may.
  env.sit('mia');
  const refused = env.api.speakUpSetConventions({ speakUpAckDays: 3 });
  assert.equal(refused.ok, false, 'a manager does not set the window it owes');
  assert.match(refused.error, /may not/);
  // The undeclared operator view: the same record, no seat declared.
  const bare = { ...JSON.parse(JSON.stringify(env.store.state)), settings: { ...env.store.state.settings } };
  delete bare.settings.activeSeatId;
  const operator = createStore({ storage: { getItem: () => JSON.stringify(bare), setItem: () => {}, removeItem: () => {} }, now: () => at('2026-11-15'), idFactory: (p) => `${p}-x` });
  operator.load();
  const api = createApi(operator, { now: () => at('2026-11-15'), idFactory: (p) => `${p}-op` });
  const set = api.speakUpSetConventions({ speakUpAckDays: 3 });
  assert.ok(set.ok, set.error);

  // The row keeps the window it was raised under, and the reader prints both.
  const row = buildSpeakUpReport(operator.state, { now: at('2026-11-15'), settings: operator.state.settings, seat: null }).rows[0];
  assert.equal(row.windows.ackDays, 7, 'stored on the row');
  assert.equal(row.windowsMoved, true, 'and the difference from today’s convention is printed');
});

/* -------------------------------------------------- 5. the retaliation check */

test('ADR-0215 retaliation: refused outside its window, once only, never by the subject', () => {
  const env = withConcern();
  env.sit('vic');
  env.api.speakUpAcknowledge({ reportId: env.reportId, note: 'Received and read; both lines will be spoken to.' });
  assert.equal(env.api.speakUpRecordWatch({ reportId: env.reportId, verdictKey: 'no-adverse-act', note: 'Too early to check anything at all.' }).refusal, 'speakUp:watch-before-outcome');

  env.on('2026-11-20');
  assert.ok(env.api.speakUpRecordOutcome({ reportId: env.reportId, outcomeKey: 'upheld', note: 'Handover restored and audited for a fortnight.' }).ok);

  // Outside the declared 90-day window: the check must not be filed against a
  // period nobody watched.
  env.on('2027-06-01');
  const late = env.api.speakUpRecordWatch({ reportId: env.reportId, verdictKey: 'no-adverse-act', note: 'Nothing adverse happened to the reporter.' });
  assert.equal(late.ok, false);
  assert.equal(late.refusal, 'speakUp:watch-outside-window');

  env.on('2026-12-01');
  const ok = env.api.speakUpRecordWatch({ reportId: env.reportId, verdictKey: 'no-adverse-act', note: 'No change to roster, rating or allocation in the window.' });
  assert.ok(ok.ok, ok.error);
  const again = env.api.speakUpRecordWatch({ reportId: env.reportId, verdictKey: 'adverse-act-declared', note: 'A second verdict would overwrite the first.' });
  assert.equal(again.refusal, 'speakUp:watch-once');

  // The subject of a concern never conducts the check about it.
  env.sit('dan');
  const other = env.api.speakUpReport();
  assert.ok(other.ok, other.error);
  const bySubject = env.api.speakUpRecordWatch({ reportId: env.reportId, verdictKey: 'adverse-act-declared', note: 'The subject must never conduct this check.' });
  assert.equal(bySubject.ok, false);
  assert.equal(bySubject.refusal, 'speakUp:not-the-receiver');
});

/* ------------------------------------------------------- 6. the disclosure */

test('ADR-0215 disclosure: the subject reads a count, a peer reads a count, an ancestor loses the body, the receiver reads it all', () => {
  const env = seed();
  env.sit('mia');
  const raised = env.api.speakUpRaiseConcern({ ...CONCERN, raisedOn: '2026-11-10' });
  assert.ok(raised.ok, raised.error);
  const levels = {};
  for (const who of ['dan', 'vera', 'vic', 'kai', 'mia']) {
    env.sit(who);
    const result = env.api.speakUpReport();
    assert.ok(result.ok, `${who}: ${result.error}`);
    levels[who] = result.report.rows[0];
  }
  assert.equal(levels.dan.detail, 'counted', 'the subject of a concern never reads it');
  assert.match(levels.dan.detailReason, /subject of the concern/);
  assert.equal(levels.dan.summary, null);
  assert.equal(levels.vera.detail, 'summary', 'the subject’s own manager may know it exists');
  assert.equal(levels.vera.summary, null, 'and does not read what was written about somebody');
  assert.equal(levels.vera.receiverRef, null);
  assert.equal(levels.vic.detail, 'full', 'the receiver reads the concern');
  assert.ok(levels.vic.summary);
  assert.ok(levels.vic.channelBasis);
  assert.equal(levels.kai.detail, 'counted', 'a peer line gets a count, not a description');

  // The CSV is aggregate only: no name, no id, no text, no date.
  const csv = env.api.speakUpCsvRows();
  assert.ok(csv.ok);
  const text = JSON.stringify(csv.rows);
  for (const leak of ['mia', 'dan', 'vic', 'handover', '2026-11-10', 'REF-', 'night']) {
    assert.ok(!text.includes(leak), `the export must not carry ${leak}`);
  }
  assert.equal(csv.rows[0].as_of, '2026-11-15', 'the reading day is the only date, and it is the export’s own');
  assert.equal(csv.rows[0].concerns_total, 1);
  assert.equal(csv.rows[0].state_count, 1);
});

/* --------------------------------------------------------- 7. receiver drift */

test('ADR-0215 drift: a line declared after the route makes the receiver partial, and the register prints it', () => {
  const env = withConcern();
  // vic now answers to dan on a declared line: the receiver has become the
  // subject's subordinate, which is exactly the relationship the door refuses.
  env.store.update((draft) => {
    draft.reportingLines = [...draft.reportingLines, {
      id: 'rl-vic-dan', personId: 'vic', managerId: 'dan', kind: 'project', shareH: 10,
      rights: [], fromISO: '2026-11-16', toISO: null, declaredAt: '2026-11-16T09:00:00.000Z', note: '',
    }];
  }, { type: 'matrix.line.declared', entity: 'reportingLine', entityId: 'rl-vic-dan', summary: 'line' });

  env.on('2026-11-20');
  const report = buildSpeakUpReport(env.store.state, { now: at('2026-11-20'), settings: env.store.state.settings, seat: null });
  const row = report.rows[0];
  assert.equal(row.receiverImpartial, false, 'the graph moved under the route');
  assert.equal(row.receiverDriftReason, 'receiver-reports-to-subject');
  assert.match(row.receiverDriftLabel, /reports to the subject/);
  assert.equal(report.driftedN, 1);
  env.touch();
  assert.ok(env.store.state.concernMarkers.some((marker) => /impartiality test/.test(marker.detail)),
    'the rule records the drift without re-routing the concern on its own');
});

/* ---------------------------------------------------- 8. RULE-SUP-01 on the spine */

test('ADR-0215 rule: one opaque ask to the receiver, idempotent, self-closing, paused by its own switch', () => {
  const env = withConcern();
  env.on('2026-11-26'); // past the seven-day acknowledgement window
  env.touch();
  const asks = () => env.store.state.delegations.filter((task) => String(task.title).includes('an open register reference')
    || String(task.title).includes('speak-up'));
  assert.equal(asks().length, 1);
  const ask = asks()[0];
  assert.equal(ask.personId, 'vic', 'the receiver is asked, never the reporter and never the subject');
  assert.equal(ask.authority, 'act-inform');

  // THE ASK SAYS NOTHING: no party, no category, no summary, no concern date.
  const body = JSON.stringify(ask).toLowerCase();
  for (const leak of ['mia', 'dan', 'handover', 'conduct', '2026-11-15', 'reporter']) {
    assert.ok(!body.includes(leak), `the ask must not carry “${leak}”: a delegation is readable above the receiver`);
  }
  const links = env.store.state.links.filter((link) => link.ruleId === SPEAK_UP_RULE_ID);
  assert.equal(links.length, 1);
  assert.equal(links[0].relation, 'issues-obligation');
  assert.match(links[0].summary, /sup1:ack:/);

  // Idempotent: another commit files nothing.
  env.touch();
  assert.equal(asks().length, 1);

  // Self-closing: the act lands, the ask closes.
  env.sit('vic');
  assert.ok(env.api.speakUpAcknowledge({ reportId: env.reportId, note: 'Received and read; both lines will be spoken to.' }).ok);
  const closed = env.store.state.delegations.find((task) => task.id === ask.id);
  assert.equal(closed.status, 'done');
  assert.match(closed.completionNote, /no longer reports this condition/);

  // The pause governs every path, including an explicit scan.
  const e2 = withConcern();
  e2.on('2026-11-26');
  e2.store.update((draft) => { draft.settings = { ...draft.settings, speakUpAutoPropagate: false }; },
    { type: 'settings.updated', entity: 'settings', entityId: 'speakUp', summary: 'paused' });
  e2.touch();
  assert.equal(e2.store.state.delegations.filter((task) => String(task.title).includes('an open register reference')).length, 0);
});

test('ADR-0215 rule: registered on the shared spine before the seat and the seal, with a declared contract', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  const index = ids.indexOf('speakUpRule');
  assert.ok(index >= 0, 'speakUpRule is on the spine');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-2).id, 'seatRule');
  assert.equal(DEFAULT_POST_COMMIT_RULES.at(-1).id, 'sealRule');
  assert.ok(index < ids.indexOf('seatRule'), 'it runs before the operating seat so the ask rolls up in the same transaction');
  assert.equal(speakUpRule.id, 'speakUpRule');
});

/* ------------------------------------------------------------ 9. reload identity */

test('ADR-0215 reload: a stored row is the row its loader returns, and a malformed one is dropped and counted', () => {
  const env = withConcern();
  const stored = env.store.state.concernReports[0];
  const loaded = normalizeState(JSON.parse(JSON.stringify(env.store.state)), { now: at('2026-11-15') });
  const again = loaded.state.concernReports[0];
  assert.deepEqual({ ...again }, { ...stored }, 'no field is repaired, added or re-dated on reload');

  // A row with no summary is not loaded as an empty concern.
  const broken = JSON.parse(JSON.stringify(env.store.state));
  broken.concernReports.push({ ...broken.concernReports[0], id: 'sup-broken', summary: '' });
  const result = normalizeState(broken, { now: at('2026-11-15') });
  assert.equal(result.state.concernReports.length, 1);
  assert.ok(result.warnings.some((warning) => /refused 1 malformed/.test(warning)),
    'the refusal is COUNTED, never silent');

  // A typed third state is not invented either.
  const weird = JSON.parse(JSON.stringify(env.store.state));
  weird.concernReports[0].routeKey = 'a-friend';
  assert.equal(normalizeState(weird, { now: at('2026-11-15') }).state.concernReports.length, 0);
});

/* --------------------------------------------------------------- 10. the panel */

test('ADR-0215 panel: what the screen prints is what the reader computed, cell by cell', () => {
  withDom(() => {
    const env = withConcern();
    const report = env.api.speakUpReport().report;
    const ctx = {
      api: env.api,
      query: new Map([['view', 'register']]),
      navigate: () => {},
      refresh: () => {},
      persistError: null,
    };
    const node = renderSpeakUp(ctx);
    const find = (testid) => node.querySelector(`[data-testid="${testid}"]`);

    assert.equal(find('sup-count-total').textContent, String(report.totals.reports));
    assert.equal(find('sup-count-overdue').textContent, String(report.overdueN));
    assert.equal(find('sup-count-no-route').textContent, String(report.noRouteN));
    assert.equal(find('sup-count-drifted').textContent, String(report.driftedN));

    const rows = [...node.querySelectorAll('[data-testid^="sup-row-"]')];
    assert.equal(rows.length, report.rows.length);
    rows.forEach((row, index) => {
      const source = report.rows[index];
      assert.equal(row.getAttribute('data-state'), source.stateKey);
      assert.equal(row.getAttribute('data-detail'), source.detail);
      assert.equal(row.getAttribute('data-category'), source.categoryKey);
      assert.equal(row.getAttribute('data-route'), source.routeKey);
      assert.equal(row.getAttribute('data-ref'), source.ref);
    });

    // The brief is identity-free.
    const brief = env.api.speakUpBriefText().text;
    for (const leak of ['Mia', 'Dan', 'Vic', 'handover']) assert.ok(!brief.includes(leak), `brief leaks ${leak}`);
  });
});

/* ----------------------------------------------------------------- 11. the CSV */

test('ADR-0215 CSV: the export scope is registered, sensitive, and its rows re-add to the reader', () => {
  const descriptor = CSV_EXPORTS.find((row) => row.key === SPEAK_UP_CSV_SCOPE);
  assert.ok(descriptor, 'CSV scope #157 is registered');
  assert.equal(descriptor.sensitive, true);
  assert.match(descriptor.description, /NO reporter/);

  const env = withConcern();
  const report = buildSpeakUpReport(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: null });
  const rows = speakUpCsvRows(report);
  const buckets = rows.slice(1);
  const sum = buckets.reduce((total, row) => total + row.state_count, 0);
  assert.equal(sum, report.totals.reports, 'the exported buckets are the rows the panel printed');
  assert.equal(rows[0].state_count, report.totals.sumStates);
  assert.equal(rows[0].counts_reconcile, 'true');

  const exported = exportWorkspaceCsv(env.store.state, SPEAK_UP_CSV_SCOPE, { now: at('2026-11-15') });
  assert.equal(exported.ok, true, exported.error);
  assert.equal(exported.rowCount, rows.length, 'the dispatcher serves the scope from the same reader');
  assert.match(exported.csv, /concerns_total/);
});

/* ------------------------------------------------------------ 12. the catalogue */

test('ADR-0215 catalogue: the register declares its refusals, frameworks and method', async () => {
  const registry = await import('../../app/core/domain/speakUpRegistry.js');
  assert.ok(registry.SPEAK_UP_REFUSALS.length >= 30, 'every refusal is named, not generic');
  assert.ok(registry.SPEAK_UP_FRAMEWORKS.length >= 6);
  assert.equal(registry.SPEAK_UP_METHOD.impartiality.length > 200, true);
  assert.deepEqual(registry.SPEAK_UP_STATE_KEYS.length, 11);
  for (const category of registry.SPEAK_UP_CATEGORIES) assert.ok(category.says.length > 20);
});
