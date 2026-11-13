/**
 * tests/app/change-impact-review.test.mjs — Matrix Change-Impact Line Review
 * (ADR-0185, Schema v147, RULE-CIL-01, CSV #139).
 *
 * A line review is a dated first-person account of what one active Matrix line
 * examined against one frozen material-impact snapshot. It is not approval,
 * employee consent or permission to proceed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import { buildChangeImpactReviewReport, changeImpactBriefText } from '../../app/core/domain/changeImpact.js';
import { normalizeChangeImpactResponses } from '../../app/core/domain/changeImpactSchema.js';
import {
  CHANGE_IMPACT_CSV_COLUMNS,
  CHANGE_IMPACT_CSV_DESCRIPTOR,
  CHANGE_IMPACT_EVENTS,
  CHANGE_IMPACT_RULE_ID,
} from '../../app/core/domain/changeImpactRegistry.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { matrixLineScopeFor } from '../../app/core/domain/matrix.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { routeVerdict, ACTION_RIGHTS, RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { renderMatrixChangeImpactPanel } from '../../app/views/matrixChangeImpactPanel.js';

const NOW = new Date('2026-11-12T09:30:00.000Z');
const ISO = NOW.toISOString();

function person(id, name, level, managerId = null) {
  return {
    id,
    name,
    role: level === 'ic' ? 'Engineer' : `${level} lead`,
    level,
    team: level === 'ic' ? 'Product' : 'Platform',
    managerId,
    status: 'active',
    startDate: '2022-01-01',
    createdAt: ISO,
  };
}

function matrixLine(id, personId, managerId, kind = 'project', shareH = 40, extra = {}) {
  return {
    id,
    personId,
    managerId,
    kind,
    shareH,
    rights: [],
    fromISO: '2026-01-01',
    toISO: null,
    declaredAt: '2026-01-01T09:00:00.000Z',
    declaredBySeatId: null,
    note: '',
    status: 'active',
    history: [],
    ...extra,
  };
}

function fixture() {
  const raw = createEmptyState(ISO);
  raw.settings = { ...raw.settings, leaderName: 'Avery Lead', activeSeatId: null };
  raw.people = [
    person('engdir', 'Dana Engineering', 'director', null),
    person('pmdir', 'Priya Product', 'manager', 'engdir'),
    person('sam', 'Sam Engineer', 'ic', 'engdir'),
    person('kim', 'Kim Engineer', 'ic', 'pmdir'),
  ];
  raw.reportingLines = [matrixLine('line-sam-pm', 'sam', 'pmdir', 'project', 4000)];
  raw.changes = [{
    id: 'change-operating-model',
    title: 'Product platform operating model',
    kind: 'operating-model',
    status: 'active',
    summary: 'Move release ownership into the platform team.',
    vision: 'Teams can release without a manual hand-off.',
    nonGoals: 'No change to customer support ownership.',
    ownerId: 'engdir',
    openedOn: '2026-11-01',
    targetOn: '2026-12-01',
    topology: {
      teamName: 'Product Platform',
      currentType: 'stream-aligned',
      targetType: 'platform',
      interactionMode: 'x-as-a-service',
      collaboratingTeamsCount: 2,
    },
    star: {
      strategy: 'Reduce release friction.',
      structure: 'Create a platform boundary.',
      processes: 'Replace the hand-off with a service path.',
      rewards: 'Recognise reliable self-service.',
      people: 'Clarify the platform on-call role.',
    },
    impacts: [{
      id: 'impact-sam',
      personId: 'sam',
      impactKind: 'scope-shift',
      newRoleLabel: 'Platform service owner',
      createTransitionPlan: true,
    }],
    createdAt: ISO,
    updatedAt: ISO,
  }];
  return normalizeState(raw, { now: NOW }).state;
}

function harness(state = fixture()) {
  let now = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-test-${++seq}`;
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  const api = createApi(store, { now: () => now, idFactory });
  return {
    store,
    api,
    data,
    setNow(value) { now = value; },
    reload() {
      const next = createStore({ storage, now: () => now, idFactory });
      next.load();
      return next;
    },
  };
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const previous = new Map(names.map((name) => [name, globalThis[name]]));
  try {
    for (const name of names) {
      globalThis[name] = name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name];
    }
    return run(dom);
  } finally {
    for (const name of names) globalThis[name] = previous.get(name);
  }
}

function request(api, lineKey = 'line-sam-pm', dueOn = '2026-11-20') {
  return api.changeImpactReviewRequest({
    changeId: 'change-operating-model',
    personId: 'sam',
    lineKey,
    dueOn,
    prompt: 'Check the effect on this line’s release ownership.',
  });
}

/* ------------------------------------------------------------- registration */

test('Schema v147 is additive; Matrix surface and scoped API rights are registered without lowering Changes', () => {
  assert.equal(SCHEMA_VERSION, 147);
  assert.deepEqual(createEmptyState(ISO).changeImpactRequests, []);
  assert.deepEqual(createEmptyState(ISO).changeImpactResponses, []);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'change-impacts'));
  assert.equal(CHANGE_IMPACT_RULE_ID, 'RULE-CIL-01');
  assert.equal(CHANGE_IMPACT_EVENTS.REQUESTED, 'change.impact.requested');
  assert.equal(CHANGE_IMPACT_EVENTS.RESPONDED, 'change.impact.responded');
  assert.equal(ACTION_RIGHTS['read-change-impact-review'].minRank, 1);
  assert.equal(ACTION_RIGHTS['request-change-impact-review'].minRank, 1);
  assert.equal(ACTION_RIGHTS['respond-change-impact-review'].minRank, 1);
  assert.equal(RECORD_POLICIES.changeImpactRequests.detailCeiling, 0);
  assert.equal(RECORD_POLICIES.changeImpactResponses.detailCeiling, 0);
  assert.equal(API_RIGHTS.changeImpactReviewRequest, 'request-change-impact-review');
  assert.equal(API_RIGHTS.changeImpactReviewRespond, 'respond-change-impact-review');
  for (const name of [
    'changeImpactReviewBoard', 'changeImpactReviewCandidates', 'changeImpactReviewBriefText',
    'changeImpactReviewCsvRows', 'changeImpactReviewAttentionCount',
  ]) assert.ok(SAFE_READS.has(name), `${name} is a registered scoped read`);
  assert.equal(CSV_EXPORTS.at(-1), CHANGE_IMPACT_CSV_DESCRIPTOR);
  assert.equal(CSV_EXPORTS.length, 139);

  const state = fixture();
  const lineScope = matrixLineScopeFor(state, { now: NOW, settings: state.settings });
  const built = buildSeats(state, { now: NOW, settings: state.settings, lineScope });
  const frontline = built.byId.get('pmdir');
  assert.ok(frontline, 'the secondary-line manager has a declared seat');
  assert.equal(routeVerdict('changes', frontline).allow, false, 'the general Changes route remains at its existing portfolio floor');
  assert.equal(routeVerdict('matrix', frontline).allow, true, 'the dedicated Matrix surface remains available');

  const migrated = migrate({ schemaVersion: 146, settings: {}, changes: [] });
  assert.deepEqual(migrated.applied, ['146 → 147']);
  assert.equal(migrated.raw.schemaVersion, 147);
  assert.deepEqual(migrated.raw.changeImpactRequests, []);
  assert.deepEqual(migrated.raw.changeImpactResponses, []);
});

/* ------------------------------------------------------ date + first-person */
test('a dated request freezes active lines; only the named line holder can respond, with explicit dates', () => {
  const h = harness();
  const emptyReport = h.api.changeImpactReviewBoard().report;
  assert.equal(emptyReport.ruleId, CHANGE_IMPACT_RULE_ID);
  assert.equal(emptyReport.rows.length, 2, 'one required row for each active Matrix line');
  assert.ok(emptyReport.rows.every((row) => row.state === 'unrequested'));
  assert.equal(emptyReport.totals.coverageWithheld, true, 'the aggregate coverage rate is withheld below the floor of three');

  assert.equal(request(h.api, 'line-sam-pm', '').ok, false, 'a due date is required');
  assert.equal(request(h.api, 'line-sam-pm', '2026-12-13').ok, false, 'the due date cannot exceed the declared 30-day bound');
  assert.equal(h.store.state.changeImpactRequests.length, 0, 'refused dates create no partial request');

  const asked = request(h.api);
  assert.equal(asked.ok, true);
  assert.equal(asked.requestedN, 1);
  const requestId = asked.requestIds[0];
  const savedRequest = h.store.state.changeImpactRequests[0];
  assert.equal(savedRequest.id, requestId);
  assert.equal(savedRequest.requestedOn, '2026-11-12');
  assert.equal(savedRequest.dueOn, '2026-11-20');
  assert.equal(savedRequest.requestedBySeatId, '__operator__');
  assert.equal(savedRequest.snapshot.lines.length, 2, 'both active lines are frozen for each request');
  assert.equal(savedRequest.snapshot.change.star.people, 'Clarify the platform on-call role.');
  assert.equal(savedRequest.snapshot.person.id, 'sam');
  assert.equal(savedRequest.snapshot.lines.find((line) => line.lineKey === 'line-sam-pm').managerId, 'pmdir');
  assert.ok(h.store.state.events.some((event) => event.type === CHANGE_IMPACT_EVENTS.REQUESTED));

  const operatorCannotSpeakForTheLine = h.api.changeImpactReviewRespond({
    requestId, outcome: 'reviewed', validThrough: '2026-12-12', basis: 'Reviewed the release hand-off.',
  });
  assert.equal(operatorCannotSpeakForTheLine.ok, false, 'the workspace operator is not a first-person line holder');
  assert.match(operatorCannotSpeakForTheLine.error, /not a first-person line holder/);

  assert.equal(h.api.setActiveSeat('engdir').ok, true);
  const peerCannotRespond = h.api.changeImpactReviewRespond({
    requestId, outcome: 'reviewed', validThrough: '2026-12-12', basis: 'Reviewed the release hand-off.',
  });
  assert.equal(peerCannotRespond.ok, false, 'a different line manager cannot answer for Priya');
  assert.match(peerCannotRespond.error, /Only the manager named/);

  assert.equal(h.api.setActiveSeat('pmdir').ok, true);
  const missingValidity = h.api.changeImpactReviewRespond({ requestId, outcome: 'reviewed', basis: 'Reviewed the release hand-off.' });
  assert.equal(missingValidity.ok, false);
  assert.equal(missingValidity.field, 'validThrough');
  const sameDayValidity = h.api.changeImpactReviewRespond({
    requestId, outcome: 'reviewed', validThrough: '2026-11-12', basis: 'Reviewed the release hand-off.',
  });
  assert.equal(sameDayValidity.ok, false, 'a review cannot be current without a future valid-through date');

  const answered = h.api.changeImpactReviewRespond({
    requestId,
    outcome: 'reviewed',
    validThrough: '2026-12-12',
    basis: 'Reviewed the release hand-off and platform support boundary.',
  });
  assert.equal(answered.ok, true);
  assert.equal(answered.validThrough, '2026-12-12');
  assert.equal(h.store.state.changeImpactResponses.length, 1);
  assert.equal(h.store.state.changeImpactResponses[0].via, 'seat');
  assert.equal(h.store.state.changeImpactResponses[0].responderSeatId, 'pmdir');
  assert.ok(h.store.state.events.some((event) => event.type === CHANGE_IMPACT_EVENTS.RESPONDED));

  const secondAnswer = h.api.changeImpactReviewRespond({
    requestId, outcome: 'declined', reason: 'No capacity to review this change.',
  });
  assert.equal(secondAnswer.ok, false, 'one request receives one append-only response');

  const ownLineReport = h.api.changeImpactReviewBoard().report;
  const ownLine = ownLineReport.rows.find((row) => row.lineKey === 'line-sam-pm');
  assert.equal(ownLine.state, 'reviewed');
  assert.equal(ownLine.response.basis, 'Reviewed the release hand-off and platform support boundary.');
  assert.equal(ownLine.canRespond, false);

  assert.equal(h.api.setActiveSeat(null).ok, true);
  h.setNow(new Date('2026-12-13T09:30:00.000Z'));
  const expired = h.api.changeImpactReviewBoard().report.rows.find((row) => row.lineKey === 'line-sam-pm');
  assert.equal(expired.state, 'expired');
  assert.equal(h.api.changeImpactReviewBoard().report.totals.reviewedN, 0, 'expired review does not count as current coverage');
  assert.equal(h.store.state.changeImpactResponses.length, 1, 'expiry is derived; the response is not deleted');
});

test('reload normalization never turns an operator into a first-person line response', () => {
  const requestRow = {
    id: 'request-root-line',
    changeId: 'change-operating-model',
    personId: 'sam',
    lineKey: 'home:sam',
    managerId: 'leader',
    requestedOn: '2026-11-12',
    requestedAt: ISO,
    requestedBySeatId: '__operator__',
    dueOn: '2026-11-20',
    prompt: '',
    snapshot: {},
  };
  const operatorResponse = {
    id: 'response-operator',
    requestId: requestRow.id,
    changeId: requestRow.changeId,
    personId: requestRow.personId,
    lineKey: requestRow.lineKey,
    managerId: requestRow.managerId,
    outcome: 'reviewed',
    respondedOn: '2026-11-12',
    respondedAt: ISO,
    responderSeatId: '__operator__',
    via: 'operator',
    validThrough: '2026-12-12',
    basis: 'Reviewed the impact and line hand-off.',
    reason: '',
  };
  const warnings = [];
  const normalized = normalizeChangeImpactResponses([operatorResponse], [requestRow], warnings, '2026-11-12');
  assert.deepEqual(normalized, [], 'the workspace operator cannot answer for the leader line');
  assert.ok(warnings.some((warning) => warning.includes('dropped 1 malformed response')));
});

/* -------------------------------------------------------- line-only scope */
test('a manager reached only through a Matrix line may request; a peer cannot answer that line', () => {
  const h = harness();
  assert.equal(h.api.setActiveSeat('pmdir').ok, true);
  const asked = request(h.api, 'home:sam', '2026-11-20');
  assert.equal(asked.ok, true, 'the request passes the API gateway through the active Matrix line scope');
  const saved = h.store.state.changeImpactRequests[0];
  assert.equal(saved.lineKey, 'home:sam');
  assert.equal(saved.managerId, 'engdir');
  assert.equal(saved.requestedBySeatId, 'pmdir');

  const peerAnswer = h.api.changeImpactReviewRespond({
    requestId: saved.id, outcome: 'reviewed', validThrough: '2026-12-12', basis: 'Reviewed the release ownership.',
  });
  assert.equal(peerAnswer.ok, false, 'the asking line is not the answering line');

  assert.equal(h.api.setActiveSeat('engdir').ok, true);
  const answer = h.api.changeImpactReviewRespond({
    requestId: saved.id,
    outcome: 'declined',
    reason: 'The home line cannot assess this platform design.',
  });
  assert.equal(answer.ok, true);
  assert.equal(h.store.state.changeImpactResponses[0].outcome, 'declined');
  assert.equal(h.store.state.changeImpactResponses[0].reason, 'The home line cannot assess this platform design.');
});

test('a caller who cannot read a line never receives its raw candidate state', () => {
  const h = harness();
  assert.equal(request(h.api, 'home:sam', '2026-11-20').ok, true);
  assert.equal(h.api.setActiveSeat('pmdir').ok, true);
  const result = h.api.changeImpactReviewCandidates();
  assert.equal(result.ok, true);
  const home = result.candidates.find((candidate) => candidate.personId === 'sam')
    .lines.find((line) => line.lineKey === 'home:sam');
  assert.equal(home.state, 'restricted', 'mask the raw state field, not only the display label');
  assert.equal(home.stateLabel, 'Existing line activity; details restricted');
  assert.equal(home.canRequest, false, 'the requester cannot duplicate an active request');
});

test('unreadable live lines do not weaken visibility checks on retained history', () => {
  const h = harness();
  const asked = request(h.api, 'home:sam', '2026-11-20');
  assert.equal(asked.ok, true);
  assert.equal(h.api.setActiveSeat('engdir').ok, true);
  assert.equal(h.api.changeImpactReviewRespond({
    requestId: asked.requestIds[0],
    outcome: 'reviewed',
    validThrough: '2026-12-12',
    basis: 'Reviewed the home line ownership boundary.',
  }).ok, true);

  const state = structuredClone(h.store.state);
  state.reportingLines.push(matrixLine('bad-matrix-line', 'sam', 'missing-manager', 'project', 20));
  const peerSeat = {
    id: 'pmdir',
    fullAccess: false,
    readOnly: false,
    rank: 2,
    scope: new Set(['sam']),
    lineScope: new Set(['sam']),
  };
  const report = buildChangeImpactReviewReport(state, { now: NOW, settings: state.settings, seat: peerSeat });
  assert.ok(report.rows.some((row) => row.state === 'unverifiable'));
  assert.equal(report.totals.unverifiableN, 1, 'an unreadable active-line set counts as a visible issue, not a guessed line count');
  assert.equal(report.totals.attentionN, 1);
  assert.match(report.totals.coverageWithheldReason, /unreadable live Matrix line set/);
  assert.match(changeImpactBriefText(report), /denominator is incomplete/);
  assert.equal(report.historyRows.length, 0, 'the peer does not receive another line holder’s response when live line detail is unreadable');
});

test('an overdue unanswered request is superseded by a refresh and cannot be answered later', () => {
  const h = harness();
  const first = request(h.api, 'line-sam-pm', '2026-11-12');
  assert.equal(first.ok, true);
  h.setNow(new Date('2026-11-13T09:30:00.000Z'));
  const second = request(h.api, 'line-sam-pm', '2026-11-20');
  assert.equal(second.ok, true, 'a new request may replace an unanswered request past its due date');

  assert.equal(h.api.setActiveSeat('pmdir').ok, true);
  const oldAnswer = h.api.changeImpactReviewRespond({
    requestId: first.requestIds[0],
    outcome: 'reviewed',
    validThrough: '2026-12-13',
    basis: 'Reviewed the release hand-off and support boundary.',
  });
  assert.equal(oldAnswer.ok, false);
  assert.match(oldAnswer.error, /superseded by a later request/);
  assert.equal(h.store.state.changeImpactResponses.length, 0);
  assert.equal(h.api.changeImpactReviewBoard().report.historyRows.find((row) => row.requestId === first.requestIds[0]).state, 'superseded');
});

/* ------------------------------------------------------- stale + history */
test('material and line-detail changes make prior responses stale; the history remains and cannot count', () => {
  const h = harness();
  const asked = request(h.api);
  assert.equal(asked.ok, true);
  const firstRequestId = asked.requestIds[0];
  assert.equal(h.api.setActiveSeat('pmdir').ok, true);
  assert.equal(h.api.changeImpactReviewRespond({
    requestId: firstRequestId,
    outcome: 'reviewed',
    validThrough: '2026-12-12',
    basis: 'Reviewed the release hand-off and support boundary.',
  }).ok, true);
  assert.equal(h.api.setActiveSeat(null).ok, true);

  h.store.update((draft) => {
    draft.changes[0].summary = 'Move release ownership into the platform team and make the service boundary explicit.';
  }, { type: 'test.material-change', entity: 'change', entityId: 'change-operating-model', summary: 'changed material summary' });
  let report = h.api.changeImpactReviewBoard().report;
  let currentLine = report.rows.find((row) => row.lineKey === 'line-sam-pm');
  assert.equal(currentLine.state, 'stale');
  assert.equal(currentLine.response.outcome, 'reviewed', 'the stale first-person response remains visible as history on the current obligation');
  assert.equal(report.totals.reviewedN, 0);
  assert.equal(report.totals.staleN, 1);

  const refreshed = request(h.api);
  assert.equal(refreshed.ok, true, 'a new request may be issued on the changed snapshot');
  const secondRequestId = refreshed.requestIds[0];
  report = h.api.changeImpactReviewBoard().report;
  currentLine = report.rows.find((row) => row.lineKey === 'line-sam-pm');
  assert.equal(currentLine.requestId, secondRequestId);
  assert.equal(currentLine.state, 'pending');
  const oldHistory = report.historyRows.find((row) => row.requestId === firstRequestId);
  assert.equal(oldHistory.state, 'stale');
  assert.equal(oldHistory.response.outcome, 'reviewed');

  h.store.update((draft) => {
    draft.reportingLines.find((line) => line.id === 'line-sam-pm').shareH = 35;
  }, { type: 'test.line-detail-change', entity: 'matrix-line', entityId: 'line-sam-pm', summary: 'changed active line share' });
  report = h.api.changeImpactReviewBoard().report;
  currentLine = report.rows.find((row) => row.lineKey === 'line-sam-pm');
  assert.equal(currentLine.state, 'stale', 'a material line-detail change invalidates the new request snapshot too');
  assert.equal(currentLine.response, null, 'the current changed snapshot has no response');
  assert.equal(report.totals.reviewedN, 0);

  const reloaded = h.reload();
  assert.equal(reloaded.state.changeImpactRequests.length, 2);
  assert.equal(reloaded.state.changeImpactResponses.length, 1);
  const recomputed = buildChangeImpactReviewReport(reloaded.state, {
    now: NOW,
    settings: reloaded.state.settings,
    seat: null,
  });
  assert.equal(recomputed.rows.find((row) => row.lineKey === 'line-sam-pm').state, 'stale');
  assert.equal(recomputed.historyRows.find((row) => row.requestId === firstRequestId).state, 'stale');
});

test('closing a change removes current coverage but preserves dated requests as history', () => {
  const h = harness();
  const asked = request(h.api);
  assert.equal(asked.ok, true);
  h.store.update((draft) => {
    draft.changes[0].status = 'anchored';
  }, { type: 'test.change-closed', entity: 'change', entityId: 'change-operating-model', summary: 'closed change' });

  const report = h.api.changeImpactReviewBoard().report;
  assert.equal(report.changesN, 0, 'the current open-change count excludes history');
  assert.equal(report.rows.length, 0, 'a closed change has no current line-review obligations');
  assert.equal(report.historyRows.length, 1, 'the original dated request remains visible as history');
  assert.equal(report.historyRows[0].state, 'historical');
});

/* ------------------------------------------------------ schema + exports */
test('normalization is bounded and fail-closed; the aggregate CSV has no identities or prose', () => {
  const h = harness();
  const asked = request(h.api);
  assert.equal(asked.ok, true);
  const valid = structuredClone(h.store.state.changeImpactRequests[0]);
  const badDue = { ...structuredClone(valid), id: 'bad-due', dueOn: '2027-01-01' };
  const badSnapshot = {
    ...structuredClone(valid),
    id: 'bad-snapshot',
    snapshot: { ...structuredClone(valid.snapshot), lines: [valid.snapshot.lines[0]] },
  };
  const normalized = normalizeState({
    ...h.store.state,
    changeImpactRequests: [valid, badDue, badSnapshot],
  }, { now: NOW });
  assert.deepEqual(normalized.state.changeImpactRequests.map((row) => row.id), [valid.id]);
  assert.ok(normalized.warnings.some((warning) => warning.includes('dropped 2 malformed request')));

  const result = exportWorkspaceCsv(fixture(), CHANGE_IMPACT_CSV_DESCRIPTOR.key, { now: NOW });
  assert.equal(result.ok, true);
  const parsed = parseCsv(result.csv);
  assert.deepEqual(parsed.headers, [...CHANGE_IMPACT_CSV_COLUMNS]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0][parsed.headers.indexOf('coverage_withheld')], 'true');
  assert.equal(parsed.rows[0][parsed.headers.indexOf('coverage_pct')], '');
  for (const forbidden of ['Sam Engineer', 'Dana Engineering', 'Priya Product', 'change-operating-model', 'impact-sam', 'release ownership']) {
    assert.ok(!result.csv.includes(forbidden), `aggregate CSV omits ${forbidden}`);
  }
});

/* ------------------------------------------------------------ panel surface */
test('the dedicated Matrix panel renders its scoped table and aggregate CSV control', () => {
  const h = harness();
  request(h.api);
  withDom((dom) => {
    const toasts = [];
    const panel = renderMatrixChangeImpactPanel({
      api: h.api,
      state: h.store.state,
      toast: (message, tone) => toasts.push({ message, tone }),
      refresh() {},
    });
    dom.window.document.body.appendChild(panel);
    assert.match(panel.textContent, /A line review is not an approval/);
    assert.match(panel.textContent, /Product platform operating model/);
    assert.ok(panel.querySelector('[data-testid="change-impact-csv"]'));
    assert.match(panel.textContent, /Not requested|Awaiting line review/);
  });
});
