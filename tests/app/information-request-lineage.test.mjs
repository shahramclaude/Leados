import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  COLLECTIONS,
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildInformationRequests } from '../../app/core/domain/rqProduction.js';
import { buildInformationRequestReport } from '../../app/core/domain/rqReport.js';
import { normalizeRequests } from '../../app/core/domain/rqSchema.js';
import { exportWorkspaceCsv, CSV_EXPORTS } from '../../app/core/csv.js';
import {
  RQR_CSV_COLUMNS,
  RQR_CSV_SCOPE,
  RQR_FLAGS,
  RQR_LINEAGE_ADR,
} from '../../app/core/domain/rqRegistry.js';
import { renderInformationRequests } from '../../app/views/informationRequests.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const created = '2026-11-16T09:00:00.000Z';
const person = (id, name, level, managerId) => ({
  id, name, role: level, level, managerId, status: 'active',
  startDate: '2026-01-01', createdAt: created, updatedAt: created,
});
const reportingLine = (id, personId, managerId) => ({
  id, personId, managerId, kind: 'functional', shareH: null, rights: [],
  fromISO: '2026-01-01', toISO: null, declaredAt: created, note: '',
  status: 'active', history: [],
});

function seed() {
  let currentNow = at('2026-11-16');
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-${++sequence}`;
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Director', 'director', 'ceo'),
    person('omar', 'Omar Director', 'director', 'ceo'),
    person('leila', 'Leila Operations', 'manager', 'dana'),
    person('worker', 'Wes Worker', 'ic', 'leila'),
    person('other-worker', 'Ollie Other', 'ic', 'omar'),
  ];
  raw.reportingLines = [
    reportingLine('rl-dana-ceo', 'dana', 'ceo'),
    reportingLine('rl-omar-ceo', 'omar', 'ceo'),
    reportingLine('rl-leila-dana', 'leila', 'dana'),
    reportingLine('rl-worker-leila', 'worker', 'leila'),
    reportingLine('rl-other-worker-omar', 'other-worker', 'omar'),
  ];
  const normalized = normalizeState(raw, { now: currentNow }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  const store = createStore({ storage, now: () => currentNow, idFactory });
  store.load();
  const api = createApi(store, { now: () => currentNow, idFactory });
  return {
    store,
    api,
    now: () => currentNow,
    setDay(day) { currentNow = at(day); },
    setNow(value) { currentNow = value instanceof Date ? value : new Date(value); },
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId, summary: 'seat switch' });
    },
    snapshot() { return JSON.parse(values.get(STORAGE_KEY)); },
  };
}

const parentDemand = {
  requester: 'Financial Supervision Authority',
  requesterKind: 'supervisor',
  instrument: 'information-request',
  instrumentRef: 'FSA-2026-77',
  scope: 'Settlement records and operations controls for the Nordic payment services.',
  receivedOn: '2026-11-15',
  replyClockDays: 30,
  lines: [{
    lineId: 'ln-settlement',
    roleLabel: 'Operations',
    subject: 'Search and certify the settlement and shift-control records.',
    dueOn: '2026-11-25',
    producerId: 'leila',
  }],
};

const followUpDemand = {
  ...parentDemand,
  instrumentRef: 'FSA-2026-81',
  scope: 'Additional retained exception files for the same quarter and payment services.',
  receivedOn: '2026-11-17',
  replyClockDays: 20,
  lines: [{
    lineId: 'ln-exceptions',
    roleLabel: 'Operations',
    subject: 'Locate and produce the retained settlement exception files.',
    dueOn: '2026-11-27',
    producerId: 'leila',
  }],
};

function driveInsufficientParent(env, { respondedAt = null } = {}) {
  env.sit('dana');
  const received = env.api.informationRequestReceive(parentDemand);
  assert.equal(received.ok, true, `receive parent: ${received.error}`);
  const requestId = received.requestId;

  env.sit('leila');
  const produced = env.api.informationRequestProduce({
    requestId,
    lineId: 'ln-settlement',
    methodText: 'I searched the settlement archive and operations controls for the declared period.',
    searchWindow: '2026-Q3 · settlement archive and rota records',
    itemCount: 4,
    complete: true,
    privilege: { claimed: false },
  });
  assert.equal(produced.ok, true, `produce parent: ${produced.error}`);

  env.sit('ceo');
  const reviewed = env.api.informationRequestReview({
    requestId,
    lineId: 'ln-settlement',
    verdict: 'clear',
    methodText: 'I sampled the archive index against the declared scope and reconciled all four items.',
  });
  assert.equal(reviewed.ok, true, `review parent: ${reviewed.error}`);

  env.sit('dana');
  const released = env.api.informationRequestRelease({
    requestId,
    transmissionRef: 'FSA-PORTAL-991',
    releaseText: 'Four settlement and control records were sent through the secure portal.',
    itemCount: 4,
  });
  assert.equal(released.ok, true, `release parent: ${released.error}`);
  const beforeVerdict = env.api.informationRequestReceive({
    ...followUpDemand,
    followsUpOn: requestId,
  });
  assert.equal(beforeVerdict.ok, false, 'a link is refused before the requester has recorded an insufficient verdict');
  assert.equal(beforeVerdict.refusal, 'informationrequest:follow-up-parent-has-no-insufficient-verdict');
  assert.equal(env.snapshot().informationRequests.length, 1, 'the premature follow-up writes no row');

  const responded = env.api.informationRequestRespond({
    requestId,
    response: 'insufficient',
    responseRef: 'FSA-LETTER-992',
    responseText: 'The requester says the retained exception files were not included.',
    ...(respondedAt ? { respondedAt } : {}),
  });
  assert.equal(responded.ok, true, `insufficient verdict: ${responded.error}`);
  return requestId;
}

function fullLineageScenario() {
  const env = seed();
  const parentId = driveInsufficientParent(env);
  const rejectedBeforeDay = env.api.informationRequestReceive({
    ...followUpDemand,
    receivedOn: '2026-11-15',
    followsUpOn: parentId,
  });
  assert.equal(rejectedBeforeDay.ok, false);
  assert.equal(rejectedBeforeDay.refusal, 'informationrequest:follow-up-received-before-prior-verdict');
  assert.equal(env.snapshot().informationRequests.length, 1, 'a child dated before the verdict is not stored');

  env.setDay('2026-11-17');
  env.sit('dana');
  const receivedChild = env.api.informationRequestReceive({
    ...followUpDemand,
    followsUpOn: parentId,
  });
  assert.equal(receivedChild.ok, true, `receive follow-up: ${receivedChild.error}`);
  return { env, parentId, childId: receivedChild.requestId };
}

function requestRow(id, createdAt, extra = {}) {
  return {
    id,
    requester: 'Financial Supervision Authority',
    requesterKind: 'supervisor',
    instrument: 'information-request',
    instrumentRef: `${id}-ref`,
    scope: 'Settlement records and controls for the declared quarter.',
    receivedOn: '2026-11-15',
    replyClockDays: 30,
    receivedById: 'dana',
    createdAt,
    lines: [{
      lineId: `${id}-line`,
      producerId: 'leila',
      roleLabel: 'Operations',
      subject: 'Search the settlement records for the declared quarter.',
      dueOn: '2026-11-25',
    }],
    ...extra,
  };
}

function withDOM(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div><main id="view" tabindex="-1"></main></body></html>', { url: 'http://localhost/#/information-requests' });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'Event', 'CustomEvent'];
  const prior = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    run(dom);
  } finally {
    for (const name of names) {
      if (prior[name] === undefined) delete globalThis[name];
      else globalThis[name] = prior[name];
    }
    dom.window.close();
  }
}

test('Schema v190→191 preserves recorded requests as roots and never infers a follow-up', () => {
  assert.equal(SCHEMA_VERSION, 193, 'ADR-0238 (distributed-work equity) is the current head');
  assert.ok(COLLECTIONS.includes('informationRequests'));
  const legacy = createEmptyState(created);
  legacy.schemaVersion = 190;
  legacy.informationRequests = [requestRow('rq-legacy', created)];
  const migrated = migrate(legacy);
  // The chain now continues to head: 190 → 191 (this suite), 191 → 192 (ADR-0237)
  // and 192 → 193 (ADR-0238).
  assert.deepEqual(migrated.applied, ['190 → 191', '191 → 192', '192 → 193']);
  assert.equal(migrated.raw.schemaVersion, 193);
  assert.equal(migrated.raw.informationRequests[0].followsUpOn, null);
  assert.equal(migrated.raw.informationRequests[0].id, 'rq-legacy');
});

test('the request normalizer accepts only an earlier stored parent and refuses dangling or later links', () => {
  const root = requestRow('rq-root', '2026-11-16T09:00:00.000Z');
  const child = requestRow('rq-child', '2026-11-17T09:00:00.000Z', { followsUpOn: 'rq-root' });
  const orphan = requestRow('rq-orphan', '2026-11-18T09:00:00.000Z', { followsUpOn: 'rq-missing' });
  const warnings = [];
  const rows = normalizeRequests([root, child, orphan], warnings);
  assert.deepEqual(rows.map((row) => [row.id, row.followsUpOn]), [
    ['rq-root', null],
    ['rq-child', 'rq-root'],
  ]);
  assert.ok(warnings.some((warning) => warning.includes('orphaned')));

  const reversedWarnings = [];
  const reversed = normalizeRequests([child, root], reversedWarnings);
  assert.deepEqual(reversed.map((row) => row.id), ['rq-root']);
  assert.ok(reversedWarnings.some((warning) => warning.includes('non-prior')));

  const unsupportedChild = requestRow('rq-no-verdict-child', '2026-11-17T09:00:00.000Z', { followsUpOn: 'rq-no-verdict-root' });
  const unsubstantiated = buildInformationRequests({
    informationRequests: [requestRow('rq-no-verdict-root', '2026-11-16T09:00:00.000Z'), unsupportedChild],
    informationRequestActs: [],
    people: [],
    reportingLines: [],
  }, { now: at('2026-11-17') });
  const derivedChild = unsubstantiated.rows.find((row) => row.id === unsupportedChild.id);
  assert.equal(derivedChild.followUp.status, 'parent-not-insufficient');
  assert.ok(derivedChild.flags.includes(RQR_FLAGS.followUpUnsubstantiated));
  assert.equal(unsubstantiated.lineageCounts.followUpsUnsubstantiated, 1);
  assert.equal(unsubstantiated.lineageCounts.declaredLinksSupported, false);
});

test('lineage remains unsubstantiated when the child record predates the actual insufficient-verdict instant', () => {
  const parent = requestRow('rq-verdict-root', '2026-11-15T09:00:00.000Z');
  const child = requestRow('rq-recorded-too-soon', '2026-11-16T09:59:59.000Z', {
    receivedOn: '2026-11-16',
    followsUpOn: parent.id,
  });
  const responseAct = {
    id: 'rqa-response',
    requestId: parent.id,
    actorId: 'dana',
    kind: 'respond',
    response: 'insufficient',
    responseRef: 'FSA-LETTER-992',
    responseText: 'The requester says the retained exception files were not included.',
    respondedAt: '2026-11-16T10:00:00.000Z',
  };
  const report = buildInformationRequests({
    informationRequests: [parent, child],
    informationRequestActs: [responseAct],
    people: [],
    reportingLines: [],
  }, { now: at('2026-11-17') });
  const derivedChild = report.rows.find((row) => row.id === child.id);
  assert.equal(derivedChild.followUp.status, 'recorded-before-parent-verdict');
  assert.ok(derivedChild.flags.includes(RQR_FLAGS.followUpUnsubstantiated));
  assert.equal(report.lineageCounts.followUpsUnsubstantiated, 1);
});

test('a same-day follow-up is refused until the actual verdict instant has passed', () => {
  const env = seed();
  const parentId = driveInsufficientParent(env, { respondedAt: '2026-11-16T10:02:00.000Z' });
  env.sit('dana');
  const early = env.api.informationRequestReceive({
    ...followUpDemand,
    receivedOn: '2026-11-16',
    followsUpOn: parentId,
  });
  assert.equal(early.ok, false);
  assert.equal(early.refusal, 'informationrequest:follow-up-recorded-before-prior-insufficient-verdict');
  assert.equal(env.snapshot().informationRequests.length, 1, 'the early child is not stored');

  env.setNow('2026-11-16T10:03:00.000Z');
  env.sit('dana');
  const after = env.api.informationRequestReceive({
    ...followUpDemand,
    receivedOn: '2026-11-16',
    followsUpOn: parentId,
  });
  assert.equal(after.ok, true, `the same-day demand is accepted after the verdict: ${after.error}`);
  assert.equal(env.snapshot().informationRequests.length, 2);
});

test('an insufficient response can be followed by a separate linked demand from storage through kernel, report, CSV and DOM', () => {
  const { env, parentId, childId } = fullLineageScenario();
  const stored = env.snapshot();
  const parentStored = stored.informationRequests.find((row) => row.id === parentId);
  const childStored = stored.informationRequests.find((row) => row.id === childId);
  assert.equal(parentStored.followsUpOn, null, 'the original remains a root');
  assert.equal(childStored.followsUpOn, parentId, 'the child stores the declared parent id');
  assert.equal(childStored.scope, followUpDemand.scope, 'the child retains its own declared scope');
  assert.notEqual(parentStored.scope, childStored.scope, 'the parent scope was not overwritten');

  const kernel = buildInformationRequests(stored, { now: env.now() });
  assert.equal(kernel.lineageAdr, RQR_LINEAGE_ADR);
  assert.deepEqual(kernel.lineageCounts, {
    originalRequests: 1,
    followUpRequests: 1,
    followUpsAfterInsufficient: 1,
    followUpsUnsubstantiated: 0,
    rootsWithDirectFollowUps: 1,
    maxFollowUpDepth: 1,
    declaredLinksSupported: true,
  });
  const parentComputed = kernel.rows.find((row) => row.id === parentId);
  const childComputed = kernel.rows.find((row) => row.id === childId);
  assert.equal(parentComputed.response, 'insufficient');
  assert.equal(parentComputed.state, 'reply-insufficient', 'the original still reads insufficient, not answered');
  assert.equal(parentComputed.followUp.children[0].id, childId);
  assert.equal(childComputed.followUp.parent.id, parentId);
  assert.equal(childComputed.followUp.status, 'follows-up-after-insufficient');
  assert.equal(childComputed.followUp.depth, 1);
  assert.equal(childComputed.state, 'working', 'the child has its own open production duty');

  env.sit('dana');
  const report = env.api.informationRequestReport();
  assert.equal(report.lineageAdr, RQR_LINEAGE_ADR);
  assert.deepEqual(report.lineageCounts, kernel.lineageCounts, 'the seat-scoped whole-register report equals the kernel');
  const reportChild = report.rows.find((row) => row.id === childId);
  assert.equal(reportChild.followUp.parent.id, parentId);
  assert.equal(reportChild.followUp.status, childComputed.followUp.status);

  const candidates = env.api.informationRequestCandidates();
  assert.equal(candidates.ok, true);
  assert.ok(candidates.followUpParents.some((row) => row.id === parentId && row.respondedOn === parentComputed.respondedOn));

  const exported = exportWorkspaceCsv(stored, RQR_CSV_SCOPE, { now: env.now() });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(CSV_EXPORTS.some((item) => item.key === RQR_CSV_SCOPE));
  const csvLines = exported.csv.trimEnd().split(/\r?\n/);
  const headers = csvLines[0].split(',');
  assert.deepEqual(headers, RQR_CSV_COLUMNS);
  const summary = csvLines.find((line) => line.includes(',summary,')).split(',');
  const csvValue = (key) => summary[headers.indexOf(key)];
  for (const [key, value] of [
    ['follow_up_requests', kernel.lineageCounts.followUpRequests],
    ['follow_ups_after_insufficient', kernel.lineageCounts.followUpsAfterInsufficient],
    ['follow_ups_unsubstantiated', kernel.lineageCounts.followUpsUnsubstantiated],
    ['roots_with_follow_ups', kernel.lineageCounts.rootsWithDirectFollowUps],
    ['max_follow_up_depth', kernel.lineageCounts.maxFollowUpDepth],
  ]) assert.equal(csvValue(key), String(value), `CSV ${key} equals the computed integer`);
  for (const privateValue of [parentId, childId, parentDemand.requester, parentDemand.instrumentRef, parentDemand.scope, followUpDemand.scope]) {
    assert.equal(exported.csv.includes(privateValue), false, `aggregate CSV must not export ${privateValue}`);
  }

  withDOM(() => {
    const rowPanel = renderInformationRequests({
      api: env.api,
      state: env.store.state,
      query: new URLSearchParams('view=rows'),
      navigate() {},
      refresh() {},
    });
    document.getElementById('root').appendChild(rowPanel);
    rowPanel.querySelector('[data-testid="rq-receive"]').click();
    const dialog = document.querySelector('#modal-root [role="dialog"]');
    assert.ok(dialog, 'the receive dialog opens');
    const parentSelect = dialog.querySelector('select[name="followsUpOn"]');
    assert.ok(parentSelect, 'the intake form offers a declared follow-up parent');
    assert.ok([...parentSelect.options].some((option) => option.value === parentId));
    assert.ok([...dialog.querySelectorAll('button')].some((button) => button.textContent === 'Record the request'), 'the dialog exposes a working submit control');
    dialog.querySelector('.modal-foot .btn-ghost').click();

    const lineagePanel = renderInformationRequests({
      api: env.api,
      state: env.store.state,
      query: new URLSearchParams('view=lineage'),
      navigate() {},
      refresh() {},
    });
    const childNode = lineagePanel.querySelector(`[data-testid="rq-lineage-${childId}"]`);
    const parentNode = lineagePanel.querySelector(`[data-testid="rq-lineage-${parentId}"]`);
    assert.ok(childNode, 'the follow-up is rendered in the lineage view');
    assert.ok(parentNode, 'the original is rendered in the lineage view');
    assert.equal(childNode.getAttribute('data-follow-up-status'), childComputed.followUp.status);
    assert.equal(childNode.getAttribute('data-follow-up-depth'), String(childComputed.followUp.depth));
    assert.match(childNode.textContent, new RegExp(parentId));
    assert.match(childNode.textContent, /Follow-up after an insufficient verdict/);
    assert.match(parentNode.textContent, new RegExp(childId));
    assert.match(lineagePanel.textContent, /Whole-register lineage/);
    const stats = Object.fromEntries([...lineagePanel.querySelectorAll('.stat')].map((node) => [
      node.querySelector('.stat-label')?.textContent,
      node.querySelector('.stat-value')?.textContent,
    ]));
    assert.equal(stats['Follow-up demands'], String(kernel.lineageCounts.followUpRequests));
    assert.equal(stats['After an insufficient verdict'], String(kernel.lineageCounts.followUpsAfterInsufficient));
    assert.equal(stats['Unsubstantiated links'], String(kernel.lineageCounts.followUpsUnsubstantiated));
    assert.equal(stats['Maximum supported depth'], String(kernel.lineageCounts.maxFollowUpDepth));
  });
});

test('a visible follow-up does not grant access to its hidden parent or expose partial lineage counts', () => {
  const { env, parentId, childId } = fullLineageScenario();
  const state = env.snapshot();
  const child = state.informationRequests.find((row) => row.id === childId);
  child.receivedById = 'omar';
  const report = buildInformationRequestReport(state, {
    now: env.now(),
    seat: { fullAccess: false, id: 'omar', nodeId: 'omar', scope: new Set(['omar']), lineScope: new Set() },
  });
  assert.deepEqual(report.rows.map((row) => row.id), [childId], 'the child receiver cannot see the unrelated parent');
  assert.equal(report.rows[0].followUp.status, 'parent-withheld');
  assert.equal(report.rows[0].followUp.parent, null);
  assert.equal(report.rows[0].followUp.parentWithheld, true);
  assert.equal(report.rows[0].followUp.depth, null);
  assert.equal(report.rows[0].followUp.rootRequestId, null);
  assert.equal(report.lineageCounts, null);
  assert.equal(report.lineageCountsWithheld, true);
  assert.match(report.lineageCountsWithheldReason, /withheld whole/);
  assert.notEqual(report.rows[0].followUp.parent?.id, parentId);

  const noVerdictState = {
    ...state,
    informationRequestActs: state.informationRequestActs.filter((act) => !(act.requestId === parentId && act.kind === 'respond')),
  };
  const noVerdictReport = buildInformationRequestReport(noVerdictState, {
    now: env.now(),
    seat: { fullAccess: false, id: 'omar', nodeId: 'omar', scope: new Set(['omar']), lineScope: new Set() },
  });
  assert.equal(noVerdictReport.rows[0].followUp.status, 'parent-withheld');
  assert.equal(noVerdictReport.rows[0].flags.includes(RQR_FLAGS.followUpUnsubstantiated), false,
    'a hidden parent’s absent verdict is not disclosed through the child’s flags');

  env.store.update((draft) => {
    const storedChild = draft.informationRequests.find((row) => row.id === childId);
    storedChild.receivedById = 'omar';
  }, { type: 'test.receiver.moved', entity: 'informationrequest', entityId: childId, summary: 'seat privacy fixture' });
  env.sit('omar');
  const candidateRead = env.api.informationRequestCandidates();
  assert.equal(candidateRead.ok, true);
  assert.equal(candidateRead.followUpParents.some((row) => row.id === parentId), false,
    'the receive selector does not offer an unreadable parent');
  const hiddenParentAttempt = env.api.informationRequestReceive({
    ...followUpDemand,
    followsUpOn: parentId,
  });
  assert.equal(hiddenParentAttempt.ok, false);
  assert.equal(hiddenParentAttempt.refusal, 'informationrequest:follow-up-parent-not-readable');
  assert.equal(env.snapshot().informationRequests.length, 2, 'an unreadable parent link writes no request');

  const root = requestRow('rq-chain-root', '2026-11-15T09:00:00.000Z', { receivedById: 'dana' });
  const middle = requestRow('rq-chain-middle', '2026-11-16T11:00:00.000Z', {
    receivedOn: '2026-11-16', receivedById: 'omar', followsUpOn: 'rq-chain-root',
  });
  const leaf = requestRow('rq-chain-leaf', '2026-11-16T13:00:00.000Z', {
    receivedOn: '2026-11-16', receivedById: 'omar', followsUpOn: 'rq-chain-middle',
  });
  const chainAct = (id, requestId, respondedAt) => ({
    id, requestId, actorId: 'dana', kind: 'respond', response: 'insufficient',
    responseRef: `${id}-ref`,
    responseText: 'The requester says the production remains incomplete.',
    respondedAt,
  });
  const chainReport = buildInformationRequestReport({
    informationRequests: [root, middle, leaf],
    informationRequestActs: [
      chainAct('rq-chain-root-response', root.id, '2026-11-16T10:00:00.000Z'),
      chainAct('rq-chain-middle-response', middle.id, '2026-11-16T12:00:00.000Z'),
    ],
    people: [],
    reportingLines: [],
  }, {
    now: at('2026-11-17'),
    seat: { fullAccess: false, id: 'omar', nodeId: 'omar', scope: new Set(['omar']), lineScope: new Set() },
  });
  const visibleLeaf = chainReport.rows.find((row) => row.id === leaf.id);
  assert.equal(visibleLeaf.followUp.status, 'follows-up-after-insufficient');
  assert.equal(visibleLeaf.followUp.parent.relationshipState, 'parent-withheld',
    'a visible parent summary does not reveal the hidden grandparent relationship state');
  assert.equal(visibleLeaf.followUp.depth, null, 'depth is withheld when an ancestor is hidden');
});
