/**
 * tests/app/comms.test.mjs — Stakeholder Comms Outbox (Session 50, Schema v32).
 *
 *   1. Audience: Mendelow key players and opposing stakeholders only.
 *   2. Drafting: facts only; gaps shown as "to confirm" with a readiness score;
 *      no invented exposure, owner or date.
 *   3. Atomic cross-module cascade through the real store (RULE-COMMS-01 + links).
 *   4. Idempotence, supersession with reasons, re-approval on changed facts.
 *   5. Human gates: acknowledgement for gaps, edit withdraws approval, dismiss needs a reason.
 *   6. Closed loop: logged touch → sent; closure owed only to briefed people; reopen withdraws it.
 *   7. Schema v32 migration and normalizer repairs.
 *   8. Signals, insights merge, demo seed, link resolution and DOM/axe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { dayKey, addDays } from '../../app/core/time.js';
import {
  COMMS_RULES,
  COMMS_RULE_IDS,
  COMMS_STATUSES,
  briefBasis,
  buildCommsFacts,
  commsAudience,
  commsRule,
  commsSignals,
  renderCommsDraft,
  stakeholderKeyOf,
} from '../../app/core/domain/comms.js';
import { resolveLinkedEntity, LINK_RELATIONS, LINK_ENTITY_TYPES } from '../../app/core/domain/cases.js';
import { buildInsights, DOMAIN_ORDER } from '../../app/core/domain/insights.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';

/* --------------------------------------------------------------- fixtures */

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-cm-${++seq}`;
  const store = createStore({ storage: kvStorage(), now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }) };
}

const STAKEHOLDERS = [
  { name: 'Dana Ortiz', power: 5, interest: 4, stance: 'skeptical', keyMessage: 'Worried about checkout revenue' },
  { name: 'Priya Shah', power: 4, interest: 4, stance: 'supportive' },
  { name: 'Lee Chen', power: 2, interest: 2, stance: 'neutral' },
];

function caseInput(overrides = {}) {
  return {
    title: 'Payment gateway outage',
    kind: 'incident',
    openedOn: '2026-10-26',
    reviewOn: '2026-11-09',
    fmea: { severity: 8, probability: 6, detectability: 7 },
    rca: { preventiveAction: 'Add canary release gate for the gateway' },
    stakeholders: STAKEHOLDERS,
    ...overrides,
  };
}

function openCase(api, store, overrides = {}) {
  const res = api.addCase(caseInput(overrides));
  assert.equal(res.ok, true, res.error);
  return store.state.cases.find((c) => c.id === res.id);
}

const briefsFor = (store, name) => store.state.commsDrafts.filter((d) => d.stakeholderName === name && d.purpose === 'brief');
const closuresFor = (store, name) => store.state.commsDrafts.filter((d) => d.stakeholderName === name && d.purpose === 'closure');

/* --------------------------------------------------------------- 1. audience */

test('audience: key players and opposing stakeholders only — keep-informed and monitor are excluded', () => {
  const caseRecord = {
    id: 'case-x',
    status: 'open',
    stakeholders: [
      { id: 'a', name: 'Exec', power: 5, interest: 5, stance: 'supportive' },
      { id: 'b', name: 'Sponsor', power: 4, interest: 2, stance: 'neutral' },
      { id: 'c', name: 'Engineer', power: 2, interest: 4, stance: 'neutral' },
      { id: 'd', name: 'Bystander', power: 1, interest: 1, stance: 'neutral' },
      { id: 'e', name: 'Quiet Blocker', power: 1, interest: 2, stance: 'blocker' },
    ],
  };
  const names = commsAudience(caseRecord, TODAY).map((a) => a.stakeholder.name).sort();
  assert.deepEqual(names, ['Exec', 'Quiet Blocker', 'Sponsor'].sort(), 'manage-closely, keep-satisfied and blockers only');
  assert.equal(stakeholderKeyOf(caseRecord.stakeholders[0]), 'id:a');
  assert.equal(stakeholderKeyOf({ name: 'No Id' }), 'name:no id');
});

/* --------------------------------------------------------------- 2. drafting */

test('drafting: quotes only recorded facts, names every gap, and scores readiness', () => {
  const caseRecord = {
    id: 'case-d', title: 'Vendor SLA breach', kind: 'risk', status: 'open',
    reviewOn: null, ownerId: null,
    fmea: { severity: 7, probability: 4, detectability: 5 },
    rca: { preventiveAction: '' },
    financial: {},
    stakeholders: [{ id: 's1', name: 'Marta Lund', power: 5, interest: 5, stance: 'neutral' }],
  };
  const facts = buildCommsFacts(caseRecord, { people: [] });
  assert.equal(facts.owner, null, 'no owner is invented');
  assert.equal(facts.exposure, null, 'no exposure is invented without a PERT estimate');
  const draft = renderCommsDraft({ caseRecord, stakeholder: caseRecord.stakeholders[0], purpose: 'brief', facts, classified: null });
  assert.deepEqual(draft.missing, ['owner', 'preventive action', 'review date']);
  assert.equal(draft.readiness, 0.25, 'one of four required facts recorded (the rating)');
  assert.match(draft.body, /\[to confirm — no owner assigned\]/);
  assert.match(draft.body, /Financial exposure: not yet estimated/);
  assert.match(draft.body, /Risk priority/, 'a rated case states its priority');
  assert.ok(draft.subject.startsWith('Update: Vendor SLA breach'));
});

test('drafting: an opposing stakeholder gets a concern-first brief, not a status blurb', () => {
  const caseRecord = { id: 'case-o', title: 'Pricing change', kind: 'initiative', status: 'open', reviewOn: '2026-11-20', ownerId: null, fmea: {}, rca: {}, financial: {}, stakeholders: [] };
  const facts = buildCommsFacts(caseRecord, { people: [] });
  const draft = renderCommsDraft({ caseRecord, stakeholder: { name: 'Sam Ito', stance: 'blocker' }, purpose: 'brief', facts, classified: { stance: 'blocker' } });
  assert.match(draft.body, /hear your concerns directly/);
  assert.ok(draft.subject.startsWith('Input needed:'));
});

test('engine catalog: four named rules with explicit frameworks, all registered on the spine', () => {
  assert.deepEqual(COMMS_RULES.map((r) => r.id), ['RULE-COMMS-01', 'RULE-COMMS-02', 'RULE-COMMS-03', 'RULE-COMMS-04']);
  for (const rule of COMMS_RULES) assert.ok(rule.framework.length > 20, `${rule.id} names its framework`);
  assert.ok(AUTOMATION_RULES.some((r) => r.id === 'RULE-COMMS-01'), 'catalogued in the shared automation catalog');
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(commsRule), 'registered in the post-commit spine');
  assert.ok(LINK_ENTITY_TYPES.includes('comms'));
  assert.ok(LINK_RELATIONS.includes('communicates'));
});

/* --------------------------------------------------------------- 3. cascade */

test('cascade: registering a case drafts briefs for key and opposing stakeholders in the same transaction', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const dana = briefsFor(store, 'Dana Ortiz');
  const priya = briefsFor(store, 'Priya Shah');
  assert.equal(dana.length, 1);
  assert.equal(priya.length, 1);
  assert.equal(briefsFor(store, 'Lee Chen').length, 0, 'a low-power, neutral stakeholder receives no brief');
  assert.equal(dana[0].status, 'draft');
  assert.equal(dana[0].caseId, caseRecord.id);
  assert.equal(dana[0].missing.join(','), 'owner', 'the only gap on this case is the owner');
  assert.equal(dana[0].readiness, 0.75);
  assert.match(dana[0].body, /Mitigation: Add canary release gate/);
  assert.match(dana[0].body, /Last time we aligned on: Worried about checkout revenue/);

  const links = store.state.links.filter((l) => l.targetType === 'comms');
  assert.equal(links.length, 2, 'each draft is typed-linked from its case');
  assert.ok(links.every((l) => l.sourceType === 'case' && l.sourceId === caseRecord.id && l.relation === 'communicates'));

  const audit = store.state.events.filter((e) => e.type === 'automation.propagated' && String(e.summary).includes('RULE-COMMS-01'));
  assert.equal(audit.length, 2, 'every drafted message is audited');
});

test('cascade: the resolved link is navigable from the comms node back to the case', () => {
  const { store, api } = harness();
  openCase(api, store);
  const draft = store.state.commsDrafts[0];
  const resolved = resolveLinkedEntity(store.state, 'comms', draft.id);
  assert.equal(resolved.type, 'comms');
  assert.equal(resolved.route, '#/comms');
  assert.equal(resolved.status, 'Awaiting approval');
});

/* --------------------------------------------------------------- 4. idempotence */

test('idempotence: an unchanged case is a no-op; a changed fact supersedes with a stated reason', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const before = store.state.commsDrafts.length;
  const auditBefore = store.state.events.length;
  api.updateCase(caseRecord.id, { title: caseRecord.title });
  assert.equal(store.state.commsDrafts.length, before, 'no new drafts for an unchanged case');
  assert.equal(store.state.events.filter((e) => String(e.summary).includes('RULE-COMMS-01')).length, 2, 'no new propagation audit');
  assert.ok(store.state.events.length >= auditBefore);

  api.updateCase(caseRecord.id, { reviewOn: '2026-11-16' });
  const danaRows = briefsFor(store, 'Dana Ortiz');
  assert.equal(danaRows.length, 2);
  assert.equal(danaRows[0].status, 'superseded');
  assert.match(danaRows[0].supersededReason, /facts changed: review date/);
  assert.equal(danaRows[0].supersededById, danaRows[1].id, 'the history points at its replacement');
  assert.equal(danaRows[1].status, 'draft');
  assert.match(danaRows[1].body, /Next checkpoint: 2026-11-16/);
});

test('re-approval: changing facts after approval withdraws the approval and says so', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const dana = briefsFor(store, 'Dana Ortiz')[0];
  assert.equal(api.approveCommsDraft(dana.id).ok, false, 'a gap blocks approval without acknowledgement');
  assert.equal(api.approveCommsDraft(dana.id, { acknowledgeGaps: true }).ok, true);
  assert.equal(briefsFor(store, 'Dana Ortiz')[0].approvedAcknowledgedGaps, 1);
  api.updateCase(caseRecord.id, { reviewOn: '2026-11-23' });
  const superseded = briefsFor(store, 'Dana Ortiz')[0];
  assert.equal(superseded.status, 'superseded');
  assert.match(superseded.supersededReason, /re-approval required/);
});

test('anti-nagging: a dismissed brief is not re-drafted until the facts actually change', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const dana = briefsFor(store, 'Dana Ortiz')[0];
  assert.equal(api.dismissCommsDraft(dana.id, { reason: 'x' }).ok, false, 'a dismissal needs a reason');
  assert.equal(api.dismissCommsDraft(dana.id, { reason: 'Already briefed in person' }).ok, true);
  api.updateCase(caseRecord.id, { title: caseRecord.title });
  assert.equal(briefsFor(store, 'Dana Ortiz').length, 1, 'same facts: no re-draft after a dismissal');
  api.updateCase(caseRecord.id, { reviewOn: '2026-11-30' });
  assert.equal(briefsFor(store, 'Dana Ortiz').length, 2, 'changed facts: a new draft is written');
});

/* --------------------------------------------------------------- 5. human gates */

test('human gates: edits are saved, an approved text edit withdraws approval, and sent is terminal', () => {
  const { store, api } = harness();
  openCase(api, store);
  const priya = briefsFor(store, 'Priya Shah')[0];
  assert.equal(api.editCommsDraft(priya.id, { subject: '', body: 'x' }).ok, false);
  assert.equal(api.editCommsDraft(priya.id, { subject: 'Update: outage', body: 'Hi Priya, revised.' }).ok, true);
  assert.equal(api.approveCommsDraft(priya.id).ok, false, 'the owner gap blocks approval without acknowledgement');
  assert.equal(api.approveCommsDraft(priya.id, { acknowledgeGaps: true }).ok, true, 'an explicit acknowledgement permits approval');
  assert.equal(api.editCommsDraft(priya.id, { subject: 'Update: outage', body: 'Hi Priya, changed after approval.' }).ok, true);
  const edited = store.state.commsDrafts.find((d) => d.id === priya.id);
  assert.equal(edited.status, 'draft', 'editing an approved text returns it to awaiting approval');
  assert.equal(edited.edited, true);
  assert.equal(api.approveCommsDraft(priya.id, { acknowledgeGaps: true }).ok, true);
  assert.equal(api.markCommsDraftSent(priya.id, { channel: 'Slack', sentOn: '2026-12-01' }).ok, false, 'future send dates are refused');
  assert.equal(api.markCommsDraftSent(priya.id, { channel: 'Slack', sentOn: TODAY }).ok, true);
  assert.equal(api.approveCommsDraft(priya.id).ok, false, 'a sent message cannot be approved again');
  assert.equal(api.editCommsDraft(priya.id, { subject: 's', body: 'b' }).ok, false, 'a sent message cannot be edited');
});

test('human gates: marking a brief sent moves the stakeholder cadence forward on the case', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const priya = briefsFor(store, 'Priya Shah')[0];
  api.markCommsDraftSent(priya.id, { channel: 'Email', sentOn: TODAY });
  const stakeholder = store.state.cases.find((c) => c.id === caseRecord.id).stakeholders.find((s) => s.name === 'Priya Shah');
  assert.equal(stakeholder.lastCommsOn, TODAY, 'the touch is recorded once, here');
  assert.equal(stakeholder.nextCommsOn, dayKey(addDays(new Date(`${TODAY}T12:00:00Z`), 3)), 'manage-closely cadence: 3 days');
});

/* --------------------------------------------------------------- 6. closed loop */

test('closed loop: a logged stakeholder touch marks the brief sent without a second entry', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const dana = store.state.cases.find((c) => c.id === caseRecord.id).stakeholders.find((s) => s.name === 'Dana Ortiz');
  const res = api.logCaseStakeholderComms(caseRecord.id, dana.id, {
    date: TODAY, nextCommsOn: '2026-11-03', stance: 'skeptical', keyMessage: 'Agreed to canary gate',
  });
  assert.equal(res.ok, true, res.error);
  const row = briefsFor(store, 'Dana Ortiz')[0];
  assert.equal(row.status, 'sent');
  assert.equal(row.sentOn, TODAY);
  assert.equal(row.channel, 'logged stakeholder brief');
  assert.ok(store.state.events.some((e) => String(e.summary).includes('RULE-COMMS-04')), 'the closure is audited');
});

test('closed loop: resolving a case withdraws unsent briefs and owes closure only to people who were briefed', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  const priya = briefsFor(store, 'Priya Shah')[0];
  api.markCommsDraftSent(priya.id, { channel: 'Email', sentOn: TODAY });
  const res = api.resolveCase(caseRecord.id, {
    resolutionNotes: 'Rolled back the deploy and enforced the canary gate',
    systemicBarrier: 'Canary gate blocks promotion on error-budget burn',
  });
  assert.equal(res.ok, true, res.error);

  assert.equal(briefsFor(store, 'Dana Ortiz').every((d) => d.status !== 'draft' && d.status !== 'approved'), true, 'the unsent brief is withdrawn');
  assert.equal(closuresFor(store, 'Dana Ortiz').length, 0, 'Dana was never briefed: no closure note');
  const closure = closuresFor(store, 'Priya Shah');
  assert.equal(closure.length, 1, 'Priya was briefed: she is owed the outcome');
  assert.equal(closure[0].status, 'draft');
  assert.equal(closure[0].missing.length, 0, 'every closure fact was recorded');
  assert.match(closure[0].body, /What resolved it: Rolled back the deploy/);
  assert.match(closure[0].body, /Guardrail now in place: Canary gate blocks promotion/);
  assert.match(closure[0].body, /Residual rating .*not rated after resolution/);
});

test('closed loop: reopening withdraws the closure note and re-briefs with current facts', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  api.markCommsDraftSent(briefsFor(store, 'Priya Shah')[0].id, { channel: 'Email', sentOn: TODAY });
  api.resolveCase(caseRecord.id, { resolutionNotes: 'Mitigated for now, monitoring', systemicBarrier: 'Gate in place' });
  assert.equal(closuresFor(store, 'Priya Shah')[0].status, 'draft');

  const res = api.reopenCase(caseRecord.id);
  assert.equal(res.ok, true, res.error);
  assert.equal(closuresFor(store, 'Priya Shah')[0].status, 'superseded', 'the closure note no longer holds');
  assert.match(closuresFor(store, 'Priya Shah')[0].supersededReason, /reopened/);
  const reBrief = briefsFor(store, 'Priya Shah').at(-1);
  assert.equal(reBrief.status, 'draft', 'the stakeholder receives a current brief, not a stale “closed” message');
});

test('closed loop: a plain status edit to resolved follows the same closure path as resolveCase', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  api.markCommsDraftSent(briefsFor(store, 'Priya Shah')[0].id, { channel: 'Email', sentOn: TODAY });
  const res = api.updateCase(caseRecord.id, { status: 'resolved' });
  assert.equal(res.ok, true, res.error);
  assert.equal(briefsFor(store, 'Dana Ortiz').every((d) => d.status !== 'draft'), true, 'open briefs are withdrawn');
  assert.equal(closuresFor(store, 'Priya Shah').length, 1, 'the briefed stakeholder is still owed the outcome');
});

test('closed loop: a resolved case with no briefed stakeholder produces no closure notes at all', () => {
  const { store, api } = harness();
  const caseRecord = openCase(api, store);
  api.resolveCase(caseRecord.id, { resolutionNotes: 'Resolved before anyone needed telling' });
  assert.equal(store.state.commsDrafts.filter((d) => d.purpose === 'closure').length, 0);
});

test('propagation guard: non-case events and autoPropagate:false cases are ignored', () => {
  const base = { id: 'case-g', title: 'Guarded', kind: 'risk', status: 'open', stakeholders: [{ id: 's', name: 'Ada', power: 5, interest: 5, stance: 'blocker' }], fmea: {}, rca: {}, financial: {} };
  const draft = { cases: [base], people: [], commsDrafts: [], links: [] };
  assert.deepEqual(commsRule(draft, { event: { type: 'impact.scored', entityId: 'x' }, now: NOW, idFactory: () => 'n' }), []);
  assert.deepEqual(commsRule(draft, { event: null, now: NOW, idFactory: () => 'n' }), []);
  const off = { ...base, autoPropagate: false };
  assert.deepEqual(commsRule({ cases: [off], people: [], commsDrafts: [], links: [] }, { event: { type: 'case.created', entityId: 'case-g' }, now: NOW, idFactory: () => 'n' }), []);
  const live = commsRule(draft, { event: { type: 'case.created', entityId: 'case-g' }, now: NOW, idFactory: () => 'n' });
  assert.equal(live.length, 1, 'an opposing stakeholder on an autoPropagate case is briefed');
});

/* --------------------------------------------------------------- 7. schema */

test('schema v32: migration is additive and the normalizer repairs unsafe drafts', () => {
  assert.equal(SCHEMA_VERSION, 44);
  assert.deepEqual(createEmptyState('2026-10-27T00:00:00Z').commsDrafts, []);
  const migrated = migrate({ schemaVersion: 31, settings: {}, people: [], cases: [] });
  assert.ok(migrated.applied.includes('31 → 32'));
  assert.deepEqual(migrated.raw.commsDrafts, [], 'no historical stakeholder is retro-messaged');

  const caseA = { id: 'case-a', title: 'A', kind: 'risk', status: 'open', stakeholders: [], fmea: {}, rca: {}, financial: {} };
  const { state, warnings } = normalizeState({
    schemaVersion: 32,
    cases: [caseA],
    commsDrafts: [
      { id: 'd1', caseId: 'case-a', stakeholderName: 'Ada', purpose: 'brief', status: 'teleported', body: 'Hello', missing: ['owner'] },
      { id: 'd2', caseId: 'case-a', stakeholderName: 'Ben', purpose: 'brief', status: 'sent', body: 'Sent with no date' },
      { id: 'd3', caseId: 'gone', stakeholderName: 'Cy', purpose: 'brief', status: 'draft', body: 'Orphan' },
      { id: 'd4', caseId: 'case-a', stakeholderName: 'Di', purpose: 'brief', status: 'draft', body: '' },
      { id: 'd5', caseId: 'case-a', stakeholderName: 'Ed', purpose: 'closure', status: 'superseded', body: 'Old', supersededById: 'd6', supersededReason: 'replaced' },
    ],
  }, { now: NOW });
  const byId = Object.fromEntries(state.commsDrafts.map((d) => [d.id, d]));
  assert.equal(byId.d1.status, 'draft', 'an unknown status never presents a message as sent');
  assert.equal(byId.d2.status, 'draft', 'sent without a send date is returned to awaiting approval');
  assert.equal(byId.d3, undefined, 'an orphan draft is dropped');
  assert.equal(byId.d4, undefined, 'a draft with no body is dropped');
  assert.equal(byId.d5.supersededById, 'd6', 'the history pointer survives');
  assert.deepEqual(byId.d1.missing, ['owner']);
  assert.ok(warnings.some((w) => w.includes('no longer exists')));
  assert.ok(warnings.some((w) => w.includes('unrecognised status')));
  assert.ok(warnings.some((w) => w.includes('no send date')));
  assert.ok(COMMS_STATUSES.includes('superseded'));
});

/* --------------------------------------------------------------- 8. signals, demo, UI */

test('signals: stale approvals, closure owed and awaiting-approval are surfaced and merged into Signals', () => {
  const past = addDays(TODAY, -5);
  const state = {
    commsDrafts: [
      { id: 'a', caseId: 'c', stakeholderName: 'Ada', purpose: 'brief', status: 'approved', approvedOn: past, missing: [], body: 'b', subject: 's' },
      { id: 'b', caseId: 'c', stakeholderName: 'Ben', purpose: 'closure', status: 'draft', missing: [], body: 'b', subject: 'Closed: x' },
      { id: 'c2', caseId: 'c', stakeholderName: 'Cy', purpose: 'brief', status: 'draft', missing: ['owner'], body: 'b', subject: 's' },
    ],
  };
  const ids = commsSignals(state, NOW).map((s) => s.ruleId);
  assert.deepEqual(ids.sort(), ['COMMS-01', 'COMMS-02', 'COMMS-03'].sort());
  assert.ok(DOMAIN_ORDER.includes('Comms'));
  const insights = buildInsights({ ...createEmptyState(NOW.toISOString()), ...state }, NOW);
  assert.ok(insights.findings.some((f) => f && f.ruleId === 'COMMS-02'), 'stale approval reaches the Signals feed');
});

test('demo: the demo workspace ships a real outbox, generated by the engine, with typed links', () => {
  const demo = buildDemoState(NOW);
  assert.ok(demo.commsDrafts.length >= 1, 'demo outbox is populated');
  const caseIds = new Set(demo.cases.map((c) => c.id));
  for (const d of demo.commsDrafts) {
    assert.ok(caseIds.has(d.caseId), 'every demo draft belongs to a demo case');
    assert.ok(d.body.length > 20);
  }
  assert.equal(demo.links.filter((l) => l.targetType === 'comms').length, demo.commsDrafts.length);
});

test('basis is canonical: same facts give the same fingerprint, changed facts do not', () => {
  const caseRecord = { id: 'k', title: 'T', kind: 'risk', status: 'open', reviewOn: '2026-11-01', fmea: { severity: 3, probability: 3, detectability: 3 }, rca: {}, financial: {}, stakeholders: [] };
  const facts = buildCommsFacts(caseRecord, { people: [] });
  const classified = { stance: 'supportive', quadrant: 'manage-closely' };
  const a = briefBasis(caseRecord, 'id:s', 'X', classified, facts);
  assert.equal(a, briefBasis(caseRecord, 'id:s', 'X', classified, buildCommsFacts({ ...caseRecord }, { people: [] })));
  assert.notEqual(a, briefBasis({ ...caseRecord, status: 'monitoring' }, 'id:s', 'X', classified, buildCommsFacts({ ...caseRecord, status: 'monitoring' }, { people: [] })));
});

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const css = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = css;
  window.document.head.appendChild(styleEl);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function axeViolations(env) {
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  if (!env.window.axe) env.window.eval(axeSrc);
  const result = await env.window.axe.run(env.document.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
  return Array.from(result.violations).map((v) => `${v.id}: ${v.help}`);
}

test('UI: the outbox renders every tab axe-clean, with cards for drafts and a labelled readiness meter', async () => {
  const env = bootDom();
  try {
    const { createApp } = await import('../../app/main.js');
    const app = createApp({ storage: env.window.localStorage, now: () => NOW });
    app.ctx.loadDemo();
    for (const route of ['#/comms', '#/comms?tab=ready', '#/comms?tab=sent', '#/comms?tab=history']) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      assert.ok(view.textContent.length > 120, `${route} renders content`);
      assert.ok(!/is not a function|undefined is|NaN/.test(view.textContent), `${route} renders without an error panel`);
      assert.deepEqual(await axeViolations(env), [], `${route} axe-clean`);
    }
    app.ctx.navigate('#/comms?tab=approve');
    const cards = env.document.querySelectorAll('article.comms-card');
    assert.ok(cards.length >= 1, 'approve tab lists the drafted messages');
    assert.ok(env.document.querySelector('.comms-readiness .progress, .comms-readiness [role="progressbar"], .comms-readiness'), 'readiness meter present');
    assert.ok(env.document.querySelector('nav a[href="#/comms"], [href="#/comms"]'), 'the outbox is reachable from navigation');
    assert.deepEqual(env.consoleErrors, [], 'no console errors');
  } finally {
    env.dom.window.close();
  }
});
