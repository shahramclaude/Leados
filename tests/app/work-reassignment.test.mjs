// ADR-0196 — Cross-Line Work-Reassignment Consent & Receiving-Capacity Gate.
//
// This suite fixes the boundary that a fair-turn finding could formerly cross
// without evidence: a source manager can propose a concrete next piece of
// non-promotable work, but only a receiving-line holder can accept it, and only
// while exact declared share-day capacity remains. The accepted transfer is a
// reservation — never an automatic delegation reassignment.

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
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { RECORD_POLICIES, ACTION_RIGHTS } from '../../app/core/domain/seatRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { MATRIX_PANELS } from '../../app/core/domain/matrixRegistry.js';
import { buildLineIntakeGate, lineCapacityUsage } from '../../app/core/domain/lineIntake.js';
import {
  buildWorkReassignments,
  workReassignmentCompletionCheck,
  workReassignmentCsvRows,
} from '../../app/core/domain/workReassignment.js';
import { normalizeWorkReassignmentActs } from '../../app/core/domain/workReassignmentSchema.js';
import { workTurnRule } from '../../app/core/domain/workTurnRules.js';
import { workTurnAskProvenance } from '../../app/core/domain/workTurnSchema.js';
import { WORK_TURN_RULE_ID } from '../../app/core/domain/workTurnRegistry.js';
import {
  WORK_REASSIGNMENT_CSV_COLUMNS,
  WORK_REASSIGNMENT_CSV_SCOPE,
  WORK_REASSIGNMENT_EVENTS,
  WORK_REASSIGNMENT_RIGHTS,
} from '../../app/core/domain/workReassignmentRegistry.js';
import { workReassignmentRule } from '../../app/core/domain/workReassignmentRules.js';
import { renderMatrixWorkReassignmentPanel } from '../../app/views/matrixWorkReassignmentPanel.js';
import { renderMatrix } from '../../app/views/matrix.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const ISO = NOW.toISOString();

const person = (id, name, level, managerId = null) => ({
  id, name, role: `${name} role`, level, managerId, status: 'active',
  startDate: '2020-01-01', createdAt: ISO, updatedAt: ISO,
});
const delegation = (id, personId, title) => ({
  id, personId, title, delegatedOn: '2026-11-01', dueOn: null,
  status: 'active', checkins: [], completedOn: null, completionNote: '',
  returnedOn: null, returnReason: '', createdAt: ISO, updatedAt: ISO,
});
const reportingLine = (id, personId, managerId, kind, shareH) => ({
  id, personId, managerId, kind, shareH, rights: [], fromISO: '2026-01-01',
  toISO: null, status: 'active', declaredAt: ISO, history: [], note: '',
});

/**
 * `fm` hands every classified non-promotable ask to `src`, producing one real
 * RULE-NPW-01 pool rotation ask. `dst` belongs to fm's home span but has a
 * declared 2% project line to `pm`; 2 hundredths over Q4's 92 days = 1.84
 * person-days of exact receiving capacity. This makes a 1.00-day transfer fit
 * and a second one fail without any guessed ceiling.
 */
function seedState() {
  const raw = createEmptyState(ISO);
  raw.people = [
    person('vp', 'Vera VP', 'vp'),
    person('fm', 'Finn Source', 'manager', 'vp'),
    person('pm', 'Petra Receiving', 'manager', 'vp'),
    person('om', 'Omar Outside', 'manager', 'vp'),
    person('src', 'Sana Source', 'ic', 'fm'),
    person('other', 'Ola Other', 'ic', 'fm'),
    person('dst', 'Drew Recipient', 'ic', 'fm'),
    person('oc', 'Orla Outside', 'ic', 'om'),
  ];
  // `dst-fm` is an allocation declaration for the roster's home edge. Matrix
  // constructs its live id as `home:dst`; raw ids cannot contain ':' and are
  // intentionally not copied into transfer acts.
  raw.reportingLines = [
    reportingLine('dst-fm', 'dst', 'fm', 'functional', 98),
    reportingLine('dst-pm', 'dst', 'pm', 'project', 2),
  ];
  raw.delegations = ['s1', 's2', 's3', 's4'].map((id) => delegation(id, 'src', `Non-promotable work ${id}`));
  raw.workTurnActs = ['s1', 's2', 's3', 's4'].map((delegationId, index) => ({
    id: `kind-${index + 1}`, delegationId, personId: 'src', kind: 'non-promotable', byId: null, at: ISO,
  }));
  let state = normalizeState(raw, { now: NOW }).state;
  // Build the same rule-owned ask the real spine produces. It is important that
  // ADR-0196 points at this marker, not at a human's ordinary delegation.
  workTurnRule(state, {
    event: { type: 'work.turn.classified', entity: 'workTurn', entityId: 'kind-4' },
    now: NOW,
    idFactory: (prefix) => `${prefix}-rotation`,
  });
  state = normalizeState(state, { now: NOW }).state;
  assert.ok(state.workTurnMarkers.some((row) => row.kind === 'ask'), 'fixture made a real rotation ask');
  return state;
}

function boot(state = seedState()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-test-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  const sit = (id) => store.update((draft) => {
    draft.settings = { ...draft.settings, activeSeatId: id };
  }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: `Operate as ${id}` });
  const rotationAskId = () => store.state.workTurnMarkers.find((row) => row.kind === 'ask')?.taskId;
  return { store, api, sit, rotationAskId };
}

const proposalInput = (rotationAskId) => ({
  rotationAskId,
  sourcePersonId: 'src', sourceLineId: 'home:src', sourceManagerId: 'fm',
  recipientId: 'dst', receivingLineId: 'dst-pm', receivingManagerId: 'pm',
  workTitle: 'Prepare the customer-support handover agenda',
  effortPersonDays: '1.00',
  note: 'A concrete next piece, not a reassignment of the old delegation.',
});

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div><div id="toast-root"></div></body></html>');
  const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event'];
  const before = new Map(names.map((name) => [name, globalThis[name]]));
  try {
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name];
    return run(dom);
  } finally {
    for (const name of names) globalThis[name] = before.get(name);
    dom.window.close();
  }
}

test('ADR-0196 is registered as Schema v156, a scoped adapter, aggregate CSV #147, matrix panel, and a no-auto-move spine contract', () => {
  assert.equal(SCHEMA_VERSION, 156);
  assert.ok(COLLECTIONS.includes('workReassignmentActs'));
  assert.deepEqual(createEmptyState(ISO).workReassignmentActs, []);
  const upgraded = migrate({ schemaVersion: 155, appId: 'leados', meta: {}, settings: {} });
  assert.deepEqual(upgraded.applied, ['155 → 156']);
  assert.deepEqual(upgraded.raw.workReassignmentActs, [], 'upgrade invents neither consent nor capacity');

  for (const right of Object.values(WORK_REASSIGNMENT_RIGHTS)) assert.ok(ACTION_RIGHTS[right], `${right} is a declared right`);
  assert.ok(SAFE_READS.has('workReassignmentReport'));
  assert.ok(SAFE_READS.has('workReassignmentCandidates'));
  assert.equal(API_RIGHTS.workReassignmentPropose, WORK_REASSIGNMENT_RIGHTS.PROPOSE);
  assert.equal(API_RIGHTS.workReassignmentAccept, WORK_REASSIGNMENT_RIGHTS.ANSWER);
  assert.equal(API_RIGHTS.workReassignmentDecline, WORK_REASSIGNMENT_RIGHTS.ANSWER);
  assert.equal(API_RIGHTS.workReassignmentWithdraw, WORK_REASSIGNMENT_RIGHTS.WITHDRAW);
  assert.equal(RECORD_POLICIES.workReassignmentActs.detailCeiling, 0);
  assert.ok(MATRIX_PANELS.some((panel) => panel.key === 'reassignments'));

  assert.equal(CSV_EXPORTS.length, 147);
  assert.equal(CSV_EXPORTS.at(-1).key, WORK_REASSIGNMENT_CSV_SCOPE);
  assert.deepEqual(CSV_EXPORTS.at(-1).key, 'work-reassignments');
  assert.equal(new Set(WORK_REASSIGNMENT_CSV_COLUMNS).size, WORK_REASSIGNMENT_CSV_COLUMNS.length);

  const rules = DEFAULT_POST_COMMIT_RULES;
  const ruleAt = rules.indexOf(workReassignmentRule);
  assert.equal(rules[ruleAt - 1].id, 'workTurnRule', 'the negative contract follows the work-turn producer');
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.rule === workReassignmentRule);
  assert.ok(contract);
  assert.deepEqual(contract.writes, []);
  assert.deepEqual(contract.emits, []);
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length);
  assert.equal(workReassignmentRule({}, { event: { type: WORK_REASSIGNMENT_EVENTS.ACCEPTED } }).length, 0, 'acceptance cannot create or mutate work');
});

test('load-time grammar preserves only a complete append-only rule-owned proposal and capacity-proof answer', () => {
  const state = seedState();
  const rotationAskId = state.workTurnMarkers.find((row) => row.kind === 'ask').taskId;
  const base = {
    transferId: 'x1', via: 'operator', decidedBySeatId: null,
    decidedOn: '2026-11-13', at: ISO, note: '', reason: '',
  };
  // A loose marker cannot manufacture rule provenance for an ordinary
  // delegation: it has neither the rule-authored support nor an
  // `issues-obligation` link from RULE-NPW-01.
  state.workTurnMarkers.push({
    key: 'ask|pool|fm|forged-ordinary', kind: 'ask', subject: 'pool|fm', taskId: 's1', state: 'pool',
    ruleId: WORK_TURN_RULE_ID, summary: 'Hand-edited marker, not a rule ask.', at: ISO,
  });
  state.workReassignmentActs = [
    {
      ...base, id: 'p1', kind: 'propose', rotationAskId,
      sourcePersonId: 'src', sourceLineId: 'home:src', sourceManagerId: 'fm',
      recipientId: 'dst', receivingLineId: 'dst-pm', receivingManagerId: 'pm',
      periodKey: '2026-Q4', workTitle: 'Prepare a handover agenda', effortShareDaysH: 100,
      capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
    },
    { ...base, id: 'a1', kind: 'accept', capacityCeilingH: 184, capacityConsumedH: 0, capacityProjectedH: 100 },
    // An ordinary delegation plus a loose plausible-looking marker is still
    // not enough: the rule support/link pair must corroborate it.
    { ...base, id: 'orphan', transferId: 'x2', kind: 'propose', rotationAskId: 's1', sourcePersonId: 'src', sourceLineId: 'home:src', sourceManagerId: 'fm', recipientId: 'dst', receivingLineId: 'dst-pm', receivingManagerId: 'pm', periodKey: '2026-Q4', workTitle: 'Forged ordinary-delegation transfer', effortShareDaysH: 100 },
    // A receiving answer with a false arithmetic snapshot cannot become consent.
    { ...base, id: 'forged', transferId: 'x1', kind: 'withdraw', reason: 'short' },
    // A seat act without a named seat is not an authenticated human statement.
    { ...base, id: 'seatless', transferId: 'x3', kind: 'propose', via: 'seat', decidedBySeatId: null, rotationAskId, sourcePersonId: 'src', sourceLineId: 'home:src', sourceManagerId: 'fm', recipientId: 'dst', receivingLineId: 'dst-pm', receivingManagerId: 'pm', periodKey: '2026-Q4', workTitle: 'Seatless transfer', effortShareDaysH: 100 },
  ];
  const warnings = [];
  const kept = normalizeWorkReassignmentActs(state.workReassignmentActs, state, warnings);
  assert.deepEqual(kept.map((act) => act.id), ['p1', 'a1']);
  assert.ok(warnings.some((warning) => /proposal act\(s\) whose RULE-NPW-01 provenance could not be proved/.test(warning)), warnings.join(' | '));
  assert.ok(warnings.some((warning) => /malformed/.test(warning)), warnings.join(' | '));
});

test('a loose work-turn marker fails closed and cannot reopen the generic prose-completion bypass', () => {
  const { api, store } = boot();
  store.update((draft) => {
    draft.settings = { ...draft.settings, activeSeatId: null };
    draft.workTurnMarkers.push({
      key: 'ask|pool|fm|loose-completion-marker', kind: 'ask', subject: 'pool|fm', taskId: 's1', state: 'pool',
      ruleId: WORK_TURN_RULE_ID, summary: 'Loose marker without rule task evidence.', at: ISO,
    });
  }, { type: 'test.work-reassignment.loose-marker', entity: 'delegation', entityId: 's1', summary: 'test' });
  const completed = api.completeDelegation('s1', { completionNote: 'A plain task should not be called a served rotation.' });
  assert.equal(completed.ok, false);
  assert.match(completed.error, /provenance cannot be proved/i);
  assert.equal(store.state.delegations.find((row) => row.id === 's1').status, 'active');
});

test('a pre-field legacy marker is history-only: it cannot offer or import a live new transfer', () => {
  const { api, sit, store, rotationAskId } = boot();
  const askId = rotationAskId();
  store.update((draft) => {
    draft.workTurnMarkers.find((row) => row.taskId === askId).ruleId = null;
  }, { type: 'test.work-reassignment.legacy-marker', entity: 'delegation', entityId: askId, summary: 'test' });
  sit('fm');
  const proposal = api.workReassignmentPropose(proposalInput(askId));
  assert.equal(proposal.ok, false);
  assert.match(proposal.error, /explicitly names RULE-NPW-01/i);
  assert.equal(api.workReassignmentCandidates().rotationAsks.length, 0, 'a legacy marker is not offered as a current source candidate');

  const raw = structuredClone(store.state);
  raw.workReassignmentActs = [
    {
      id: 'legacy-proposal', kind: 'propose', transferId: 'legacy-transfer', rotationAskId: askId,
      rotationRuleId: WORK_TURN_RULE_ID, rotationProvenance: 'legacy-attested',
      sourcePersonId: 'src', sourceLineId: 'home:src', sourceManagerId: 'fm',
      recipientId: 'dst', receivingLineId: 'dst-pm', receivingManagerId: 'pm',
      periodKey: '2026-Q4', workTitle: 'Imported legacy current transfer', effortShareDaysH: 100,
      via: 'operator', decidedBySeatId: null, decidedOn: '2026-11-13', at: ISO, note: '', reason: '',
      capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
    },
    {
      id: 'legacy-acceptance', kind: 'accept', transferId: 'legacy-transfer',
      via: 'operator', decidedBySeatId: null, decidedOn: '2026-11-13', at: ISO, note: '', reason: '',
      capacityCeilingH: 184, capacityConsumedH: 0, capacityProjectedH: 100,
    },
  ];
  const warnings = [];
  assert.deepEqual(normalizeWorkReassignmentActs(raw.workReassignmentActs, raw, warnings), []);
  assert.match(warnings.join(' | '), /legacy-attested act\(s\)/i);
});

test('RULE-NPW-01 provenance is explicit for new markers and an independently attested accepted history survives bounded marker retention', () => {
  const { api, sit, store, rotationAskId } = boot();
  const askId = rotationAskId();
  assert.equal(workTurnAskProvenance(store.state, askId).provenance, 'explicit');

  sit('fm');
  const proposed = api.workReassignmentPropose(proposalInput(askId));
  assert.equal(proposed.ok, true, proposed.error);
  sit('pm');
  assert.equal(api.workReassignmentAccept(proposed.id).ok, true);
  sit('fm');
  assert.equal(api.completeDelegation(askId, { completionNote: 'Served through the accepted receiving-line transfer.' }).ok, true);

  // ADR-0181 predates the marker `ruleId` field. Its genuine old asks remain
  // usable as historical evidence only when the independent task support and
  // typed RULE-NPW-01 obligation link corroborate the marker.
  const legacyRaw = structuredClone(store.state);
  legacyRaw.workTurnMarkers.find((row) => row.taskId === askId).ruleId = null;
  const legacy = normalizeState(legacyRaw, { now: NOW }).state;
  assert.equal(legacy.workReassignmentActs[0].rotationRuleId, WORK_TURN_RULE_ID);
  assert.equal(legacy.workReassignmentActs[0].rotationProvenance, 'legacy-attested');
  assert.equal(workTurnAskProvenance(legacy, askId).provenance, 'legacy-attested');

  // Markers are bounded and may be compacted after an ask is closed. The
  // accepted, served transfer survives only because its persisted rule id and
  // the task/link evidence still agree; marker-less ordinary delegations never
  // get this compatibility path.
  const compactedRaw = structuredClone(legacy);
  compactedRaw.workTurnMarkers = compactedRaw.workTurnMarkers.filter((row) => row.taskId !== askId);
  const compacted = normalizeState(compactedRaw, { now: NOW }).state;
  assert.equal(compacted.workReassignmentActs.length, 2);
  assert.equal(compacted.workReassignmentActs[0].rotationProvenance, 'retained-attested');
  const report = buildWorkReassignments(compacted, { now: NOW, settings: compacted.settings });
  assert.equal(report.rows.find((row) => row.transferId === proposed.id).operationState, 'served');
});

test('only the two current line holders can make their own statements; an accepted transfer reserves exact receiving capacity and blocks a later intake', () => {
  const { api, sit, store, rotationAskId } = boot();
  const askId = rotationAskId();
  sit('fm');
  const wrongAnswer = api.workReassignmentAccept('not-a-transfer');
  assert.equal(wrongAnswer.ok, false);
  const proposed = api.workReassignmentPropose(proposalInput(askId));
  assert.equal(proposed.ok, true, proposed.error);
  assert.equal(store.state.workReassignmentActs.length, 1);
  assert.equal(store.state.delegations.find((row) => row.id === askId).personId, 'fm', 'proposal never changes the rule ask owner');
  assert.equal(lineCapacityUsage(store.state, 'dst', 'pm', '2026-Q4').transferReservationH, 0, 'a proposal is not a reservation');
  assert.equal(api.workReassignmentAccept(proposed.id).ok, false, 'source manager cannot speak for receiving line');

  sit('pm');
  const accepted = api.workReassignmentAccept(proposed.id, { note: 'The project line will take this defined next piece.' });
  assert.equal(accepted.ok, true, accepted.error);
  const usage = lineCapacityUsage(store.state, 'dst', 'pm', '2026-Q4');
  assert.equal(usage.transferReservationN, 1);
  assert.equal(usage.transferReservationH, 100);
  assert.equal(usage.consumedH, 100);
  const gate = buildLineIntakeGate(store.state, { now: NOW, settings: store.state.settings });
  const receiving = gate.lines.find((row) => row.personId === 'dst' && row.managerId === 'pm');
  assert.equal(receiving.ceilingH, 184, '2 hundredths × 92 Q4 days');
  assert.equal(receiving.transferReservationH, 100);
  assert.equal(receiving.headroomH, 84);

  const laterIntake = api.matrixRecordIntake({
    personId: 'dst', managerId: 'pm', title: 'A one-person-day competing intake', date: '2026-11-13', shareDays: '1.00',
  });
  assert.equal(laterIntake.ok, false, 'the intake door shares transfer-reservation capacity arithmetic');
  assert.match(laterIntake.error, /including accepted work-turn transfer reservations/i);

  // A second exact one-day proposal can be made, but cannot be accepted because
  // 1.00 accepted + 1.00 proposed exceeds the declared 1.84-day line ceiling.
  sit('fm');
  store.update((draft) => {
    const first = draft.delegations.find((row) => row.id === askId);
    draft.delegations.push({ ...first, id: 'dlg-second', title: 'Second rotation ask', status: 'active', completionNote: '', completedOn: null });
    // This synthetic second case carries the same three structured artefacts a
    // real RULE-NPW-01 issuance writes. A marker alone would be refused.
    draft.workTurnMarkers.push({ key: 'ask|pool|fm|second-capacity-case', kind: 'ask', subject: 'pool|fm', taskId: 'dlg-second', state: 'pool', ruleId: WORK_TURN_RULE_ID, summary: 'Test-only second active rotation ask.', at: ISO });
    draft.links.push({
      id: 'lnk-second-work-turn-proof', sourceType: 'person', sourceId: 'src',
      targetType: 'delegation', targetId: 'dlg-second', relation: 'issues-obligation',
      ruleId: WORK_TURN_RULE_ID, summary: 'Test-only RULE-NPW-01 provenance.', createdOn: '2026-11-13', createdAt: ISO,
    });
  }, { type: 'test.work-reassignment.second-ask', entity: 'delegation', entityId: 'dlg-second', summary: 'test' });
  const second = api.workReassignmentPropose({ ...proposalInput('dlg-second'), workTitle: 'Prepare a second handover agenda' });
  assert.equal(second.ok, true, second.error);
  sit('pm');
  const overCapacity = api.workReassignmentAccept(second.id);
  assert.equal(overCapacity.ok, false);
  assert.match(overCapacity.error, /Refused: accepting|declared .* ceiling/i);
  assert.equal(store.state.workReassignmentActs.filter((act) => act.kind === 'accept').length, 1, 'refusal adds no consent act');
});

test('a RULE-NPW-01 rotation cannot be completed as served before an accepted, live-capacity transfer; source closes it after acceptance and history cannot be withdrawn', () => {
  const { api, sit, store, rotationAskId } = boot();
  const askId = rotationAskId();
  sit('fm');
  const noTransfer = api.completeDelegation(askId, { completionNote: 'We decided somebody else should take it.' });
  assert.equal(noTransfer.ok, false);
  assert.match(noTransfer.error, /receiving-line acceptance/i);

  const proposed = api.workReassignmentPropose(proposalInput(askId));
  assert.equal(proposed.ok, true, proposed.error);
  const noConsent = api.completeDelegation(askId, { completionNote: 'A proposal exists but no answer does.' });
  assert.equal(noConsent.ok, false);
  assert.match(noConsent.error, /No receiving-line consent/i);

  sit('pm');
  assert.equal(api.workReassignmentAccept(proposed.id).ok, true);
  assert.equal(api.completeDelegation(askId, { completionNote: 'The receiver cannot close the source manager’s delegation.' }).ok, false, 'the source remains accountable for closing the rule ask');

  sit('fm');
  const before = workReassignmentCompletionCheck(store.state, askId, { now: NOW });
  assert.equal(before.ok, true);
  const completed = api.completeDelegation(askId, { completionNote: 'The concrete next piece was served with the receiving line.' });
  assert.equal(completed.ok, true, completed.error);
  const task = store.state.delegations.find((row) => row.id === askId);
  assert.equal(task.status, 'done');
  assert.match(task.completionNote, new RegExp(`ADR-0196 transfer ${proposed.id}`));
  assert.equal(store.state.delegations.find((row) => row.id === askId).personId, 'fm', 'completion does not move the delegation owner');
  const report = buildWorkReassignments(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(report.rows.find((row) => row.transferId === proposed.id).operationState, 'served');
  const withdrawnAfterService = api.workReassignmentWithdraw(proposed.id, { reason: 'Trying to erase a served capacity record.' });
  assert.equal(withdrawnAfterService.ok, false);
  assert.match(withdrawnAfterService.error, /already served/i);
});

test('detail stays party-scoped, CSV remains aggregate-only, and the matrix panel dispatches without offering a receiving manager the source close button', () => {
  const { api, sit, store, rotationAskId } = boot();
  const askId = rotationAskId();
  sit('fm');
  const proposed = api.workReassignmentPropose(proposalInput(askId));
  sit('pm');
  assert.equal(api.workReassignmentAccept(proposed.id).ok, true);

  const party = api.workReassignmentReport();
  assert.equal(party.ok, true);
  assert.equal(party.report.rows.length, 1, 'receiving manager sees the record it accepted');
  assert.equal(party.report.rows[0].workTitle, proposalInput(askId).workTitle);

  const outsideState = { ...store.state, settings: { ...store.state.settings, activeSeatId: 'om' } };
  const outside = buildWorkReassignments(outsideState, { now: NOW, settings: outsideState.settings });
  assert.equal(outside.rows.length, 0, 'an unrelated manager cannot enumerate cross-line records');
  assert.equal(outside.board.transfersN, 0);
  assert.equal(outside.board.withheldN, 1, 'withheld records are explicit internally, not silently called zero');

  const exportResult = exportWorkspaceCsv(outsideState, WORK_REASSIGNMENT_CSV_SCOPE, { now: NOW });
  assert.equal(exportResult.ok, true);
  const parsed = parseCsv(exportResult.csv);
  assert.deepEqual(parsed.headers, WORK_REASSIGNMENT_CSV_COLUMNS);
  assert.equal(parsed.rows[0][parsed.headers.indexOf('transfers_n')], '0');
  for (const forbidden of ['Sana Source', 'Drew Recipient', 'Finn Source', 'Petra Receiving', proposalInput(askId).workTitle, proposed.id]) {
    assert.equal(exportResult.csv.includes(forbidden), false, `CSV excludes ${forbidden}`);
  }
  assert.equal(workReassignmentCsvRows(party.report)[0].row_type, 'workspace');

  withDom((dom) => {
    const ctx = { api, state: store.state, query: new URLSearchParams('panel=reassignments'), navigate() {}, refresh() {} };
    const panel = renderMatrixWorkReassignmentPanel(ctx, { now: NOW });
    dom.window.document.body.append(panel);
    assert.ok(dom.window.document.querySelector('[data-testid="work-reassignment-panel"]'));
    assert.equal(dom.window.document.querySelector(`[data-testid="work-reassignment-serve-${proposed.id}"]`), null, 'only source manager/operator may close the source-owned rotation ask');
    assert.match(dom.window.document.body.textContent, /Source manager closes the rotation ask/);

    const page = renderMatrix(ctx);
    dom.window.document.body.replaceChildren(page);
    assert.ok(dom.window.document.querySelector('[data-testid="work-reassignment-panel"]'), 'matrix route dispatches the new panel');
  });
});
