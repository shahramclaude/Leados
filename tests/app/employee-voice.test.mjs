// ADR-0243 — Employee Voice & Collective Consultation Register (Schema v197).
//
// The claims this suite exists to prove:
//
//   1. the schema bump is ADDITIVE — seven empty ledgers and four declared
//      conventions, and no body, item, sitting, advice or decision inferred from
//      an absence, a change, a transition checklist row or an existing decision;
//   2. the loaders are FAIL-CLOSED — a body with no instrument, an item with no
//      instrument/line/window, an elected seat with no election day, a sitting
//      naming a non-member, a second advice and a departure with no written reason
//      are DROPPED with counted warnings and never repaired;
//   3. ORDERING BREACHES ARE KEPT, NEVER REPAIRED — a hand-edited decision dated
//      before its window closed, and an implementation dated before its decision,
//      survive the loader and print the exact days early;
//   4. the arithmetic is EXACT — the close day, the days left, the days late and
//      the reply day are whole days computed from the item's own declared window;
//   5. SILENCE IS NOT CONSENT — a window that closes with nothing on the record is
//      `advice-lapsed`, and a decision afterwards is `decided-without-advice` with
//      its own written reason;
//   6. the DOOR refuses to create a breach — a decision before the close, an
//      implementation before its decision, a decision by one affected line where
//      the joint seat is the deciding hand, and an item put to a dissolved body;
//   7. the MATRIX is correct — the joint apex is computed through the one engine,
//      a single line cannot decide for two, and a person is counted once;
//   8. RULE-VOI-01 is idempotent, capped, self-closing, pause-governed on every
//      path, opaque in its ask text, and observes identity-free where nobody can
//      be asked;
//   9. the CSV boundary is aggregate and identity-free, exports a withheld count
//      BLANK with its reason, and keeps `complete` apart from the counts;
//  10. the panel prints the reader's own figures cell by cell (display == computed).

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildVoice, deriveVoiceItem, deriveVoiceSitting } from '../../app/core/domain/voice.js';
import {
  normalizeVoiceBodies,
  normalizeVoiceItems,
  normalizeVoiceMembers,
  normalizeVoiceResponses,
  normalizeVoiceDecisions,
  normalizeVoiceSittings,
  normalizeVoiceSettings,
} from '../../app/core/domain/voiceSchema.js';
import { earlyDays, lateDays, windowClosesOn } from '../../app/core/domain/voiceMath.js';
import {
  voiceRule,
  voiceConditions,
  indexVoiceAsks,
  voiceAskSignature,
} from '../../app/core/domain/voiceRules.js';
import {
  VOI_CSV_COLUMNS,
  VOI_CSV_SCOPE,
  VOI_SETTING_KEYS,
} from '../../app/core/domain/voiceRegistry.js';
import { voiceCsvRows } from '../../app/core/domain/voiceReport.js';
import { renderVoice } from '../../app/views/voice.js';

const NOW = new Date('2026-11-17T09:00:00.000Z');
const T0 = NOW.toISOString();
const day = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const person = (id, managerId, overrides = {}) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  managerId,
  role: 'Lead',
  status: 'active',
  startDate: '2026-01-01',
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T09:00:00.000Z',
  ...overrides,
});

/**
 * priya leads mei and freya; sam reports to mei, and also holds a declared PROJECT
 * line to freya. The two-line item (owners mei + freya) therefore has exactly one
 * joint seat above it — priya — which is the matrix case the decision door is
 * built for.
 */
function fixture(overrides = {}) {
  const raw = createEmptyState(T0);
  raw.people = [
    person('priya', null, { level: 'director' }),
    person('mei', 'priya', { level: 'manager' }),
    person('freya', 'priya', { level: 'manager' }),
    person('sam', 'mei', { level: 'ic' }),
  ];
  raw.reportingLines = [{
    id: 'rl-sam-freya', personId: 'sam', managerId: 'freya', kind: 'project', shareH: 30,
    rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', note: '',
  }];
  if (overrides.activeSeatId) raw.settings = { ...raw.settings, activeSeatId: overrides.activeSeatId };
  raw.voiceBodies = overrides.bodies !== undefined ? overrides.bodies : [body()];
  raw.voiceMembers = overrides.members !== undefined ? overrides.members : members();
  raw.voiceItems = overrides.items !== undefined ? overrides.items : [item()];
  raw.voiceSittings = overrides.sittings || [];
  raw.voiceResponses = overrides.responses || [];
  raw.voiceDecisions = overrides.decisions || [];
  raw.voiceMarkers = overrides.markers || [];
  return raw;
}

function body(overrides = {}) {
  return {
    id: 'bdy-1',
    name: 'Platform Staff Council',
    kind: 'works-council',
    instrumentRef: 'Staff Council Constitution 2026, clause 4.2 — ten working days on working arrangements',
    constitutedOn: '2025-01-06',
    termEndsOn: null,
    quorumWhole: 2,
    createdAt: '2025-01-06T09:00:00.000Z',
    updatedAt: '2025-01-06T09:00:00.000Z',
    ...overrides,
  };
}

function members() {
  return [
    { id: 'mbr-1', bodyId: 'bdy-1', personId: 'sam', role: 'chair', basis: 'appointed', termStart: '2025-01-06', termEnd: null, electedOn: null, declaredById: 'leader', createdAt: '2025-01-06T09:00:00.000Z' },
    { id: 'mbr-2', bodyId: 'bdy-1', personId: 'mei', role: 'member', basis: 'elected', termStart: '2025-01-06', termEnd: null, electedOn: '2024-12-20', declaredById: 'leader', createdAt: '2025-01-06T09:00:00.000Z' },
    { id: 'mbr-3', bodyId: 'bdy-1', personId: 'freya', role: 'observer', basis: 'appointed', termStart: '2025-01-06', termEnd: null, electedOn: null, declaredById: 'leader', createdAt: '2025-01-06T09:00:00.000Z' },
  ];
}

/** A ten-day consultation opened 20 days ago and closed 10 days ago. */
function item(overrides = {}) {
  return {
    id: 'itm-1',
    bodyId: 'bdy-1',
    subject: 'Move the on-call rota to a two-week rotation',
    kind: 'consultation',
    ownerIds: ['mei', 'freya'],
    instrumentRef: 'Staff Council Constitution 2026, clause 4.2 — ten working days on working arrangements',
    windowDays: 10,
    openedOn: day(20),
    documents: [{ label: 'Rota proposal v2', on: day(20) }],
    declaredById: 'mei',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function advice(overrides = {}) {
  return {
    id: 'adv-1',
    itemId: 'itm-1',
    receivedOn: day(8),
    advice: 'amend',
    note: 'The council asked for the payments batch to be excluded from the freeze window.',
    recordedById: 'mei',
    replyOn: null,
    replyNote: null,
    replyById: null,
    createdAt: T0,
    ...overrides,
  };
}

const load = (raw) => normalizeState(raw, { now: NOW }).state;
const read = (raw, opts = {}) => buildVoice(load(raw), { now: NOW, seat: null, ...opts });

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
  return { store, storage, api };
}

/* --------------------------------------------------------------- 1. schema */

test('schema v197 is additive: seven empty ledgers, four conventions, nothing inferred', () => {
  const empty = createEmptyState(T0);
  assert.equal(SCHEMA_VERSION, 203);
  for (const key of ['voiceBodies', 'voiceMembers', 'voiceItems', 'voiceSittings', 'voiceResponses', 'voiceDecisions', 'voiceMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
    assert.deepEqual(empty[key], [], `${key} starts empty`);
  }
  const loaded = normalizeState(createEmptyState(T0), { now: NOW }).state;
  assert.equal(loaded.settings[VOI_SETTING_KEYS.autoPropagate], true);
  assert.equal(loaded.settings[VOI_SETTING_KEYS.privacyFloor], 3);
  assert.equal(loaded.settings[VOI_SETTING_KEYS.replyDays], 10);
  assert.equal(loaded.settings[VOI_SETTING_KEYS.minutesDueDays], 10);

  // NOTHING IS INFERRED. A workspace carrying a workforce-transition checklist row
  // called "consultation" does not thereby have a body that was consulted.
  const previous = {
    ...createEmptyState(T0),
    schemaVersion: 196,
    changes: [{ id: 'chg-1', title: 'Shift change', checklist: [{ key: 'consultation', done: true, on: day(30), note: 'Representatives briefed.' }] }],
  };
  for (const key of ['voiceBodies', 'voiceMembers', 'voiceItems', 'voiceSittings', 'voiceResponses', 'voiceDecisions', 'voiceMarkers']) delete previous[key];
  const { raw, applied } = migrate(previous);
  // Position-asserted, not last-asserted: a later schema bump appends rather than
  // invalidating the claim that ADR-0243's own step runs.
  assert.deepEqual(applied.slice(0, 1), ['196 → 197']);
  assert.equal(applied[applied.length - 1], `${SCHEMA_VERSION - 1} → ${SCHEMA_VERSION}`);
  assert.equal(raw.schemaVersion, 203);
  for (const key of ['voiceBodies', 'voiceMembers', 'voiceItems', 'voiceSittings', 'voiceResponses', 'voiceDecisions', 'voiceMarkers']) {
    assert.deepEqual(raw[key], [], `${key} is empty after the upgrade`);
  }
  // No consultation period convention exists: the period is declared per item.
  assert.equal(Object.prototype.hasOwnProperty.call(raw.settings, 'voiceWindowDays'), false);
});

test('the demo seeds live states relative to the injected clock, and the reader derives them', () => {
  const state = buildDemoState(NOW);
  const report = buildVoice(state, { now: NOW, settings: state.settings, seat: null });
  assert.equal(report.totals.items, 5);
  assert.equal(report.states['advice-lapsed'], 1, 'one window closed with no advice');
  assert.equal(report.states['reply-overdue'], 1, 'one advice the organisation has not answered');
  assert.equal(report.states.implemented, 1, 'one decision in place');
  assert.equal(report.states.notified, 1, 'one information item');
  assert.equal(report.states.decided, 1, 'one decision following advice');
  assert.equal(report.totals.sittingsN, 3);
  assert.equal(report.sittingRows.filter((row) => row.state.key === 'below-quorum').length, 1);
  assert.equal(report.sittingRows.filter((row) => row.state.key === 'minutes-lapsed').length, 1);
  assert.equal(report.totals.advisedLateN, 1, 'the late advice stays counted');
  assert.equal(report.balances.statesReconcile, true);
  assert.equal(report.figuresComplete, true, report.incompleteReasons.join(' '));
});

/* -------------------------------------------------------------- 2. loaders */

test('loaders are fail-closed: no instrument, no line, no window, a reversed term', () => {
  const warnings = [];
  const bodies = normalizeVoiceBodies([
    body(),
    body({ id: 'bdy-noinstr', instrumentRef: 'short' }),
    body({ id: 'bdy-reversed', constitutedOn: '2026-05-01', termEndsOn: '2026-04-01' }),
    body({ id: 'bdy-noquorum', quorumWhole: 0 }),
  ], warnings);
  assert.deepEqual(bodies.map((row) => row.id), ['bdy-1']);
  assert.ok(warnings.length >= 1);

  const items = normalizeVoiceItems([
    item(),
    item({ id: 'itm-noinstr', instrumentRef: 'clause' }),
    item({ id: 'itm-noline', ownerIds: [] }),
    item({ id: 'itm-nowindow', windowDays: 0 }),
    item({ id: 'itm-fraction', windowDays: 2.5 }),
    item({ id: 'itm-info', kind: 'information', windowDays: 0 }),
  ], [body()], []);
  assert.deepEqual(items.map((row) => row.id), ['itm-1', 'itm-info'], 'the information item legitimately carries no window');

  const memberRows = normalizeVoiceMembers([
    ...members(),
    { ...members()[1], id: 'mbr-noelection', electedOn: null },
    { ...members()[2], id: 'mbr-backwards', termStart: '2026-05-01', termEnd: '2026-04-01' },
    { ...members()[0], id: 'mbr-nobody', bodyId: 'bdy-missing' },
  ], [body()], []);
  assert.equal(memberRows.length, 3, 'an elected seat with no election day is not a mandate');

  const sittingRows = normalizeVoiceSittings([
    { id: 'sit-1', bodyId: 'bdy-1', on: day(2), presentIds: ['mbr-1'], itemIds: [], minutesOn: null, minutesRef: null, recordedById: 'sam', createdAt: T0 },
    { id: 'sit-nonmember', bodyId: 'bdy-1', on: day(2), presentIds: ['priya'], itemIds: [], minutesOn: null, minutesRef: null, recordedById: 'sam', createdAt: T0 },
    { id: 'sit-halfminutes', bodyId: 'bdy-1', on: day(2), presentIds: ['mbr-1'], itemIds: [], minutesOn: day(1), minutesRef: null, recordedById: 'sam', createdAt: T0 },
  ], [body()], memberRows, items, []);
  assert.deepEqual(sittingRows.map((row) => row.id), ['sit-1']);
});

test('advice arrives once and a departure without a written reason is dropped', () => {
  const items = normalizeVoiceItems([item()], [body()], []);
  const responses = normalizeVoiceResponses([
    advice(),
    advice({ id: 'adv-2', note: 'A second note on the same item must not overwrite the first.' }),
    advice({ id: 'adv-replyhalf', itemId: 'itm-1', replyOn: day(4), replyNote: null, replyById: null }),
  ], items, []);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].id, 'adv-1');

  const decisions = normalizeVoiceDecisions([
    { id: 'dec-1', itemId: 'itm-1', decidedOn: day(3), decidedById: 'priya', course: 'departed', note: '', implementedOn: null, createdAt: T0 },
    { id: 'dec-2', itemId: 'itm-1', decidedOn: day(3), decidedById: 'priya', course: 'followed-advice', note: '', implementedOn: null, createdAt: T0 },
    { id: 'dec-before', itemId: 'itm-1', decidedOn: day(30), decidedById: 'priya', course: 'followed-advice', note: '', implementedOn: null, createdAt: T0 },
  ], items, []);
  assert.deepEqual(decisions.map((row) => row.id), ['dec-2'], 'a departure with no reason is not a record');
});

/* -------------------------------------------------- 3. breaches are kept */

test('a decision before the window closed survives the loader and prints the exact days early', () => {
  const raw = fixture({
    items: [item({ openedOn: day(5), windowDays: 10 })],
    decisions: [{ id: 'dec-early', itemId: 'itm-1', decidedOn: day(2), decidedById: 'priya', course: 'proceeded-without-advice', note: 'The change was taken before the window closed.', implementedOn: null, createdAt: T0 }],
  });
  const report = read(raw);
  const row = report.rows[0];
  assert.equal(row.state.key, 'breach-decided-before-advice');
  assert.equal(row.closesOn, day(-5), 'the window closes five days from now');
  assert.equal(row.breaches[0].earlyDays, 7, 'the decision was seven days before the close');
  assert.equal(report.totals.breachesN, 1, 'the breach is counted, never dropped');
});

test('an implementation before its decision is its own breach state', () => {
  const raw = fixture({
    items: [item({ openedOn: day(30), windowDays: 5 })],
    responses: [advice({ receivedOn: day(24) })],
    decisions: [{ id: 'dec-order', itemId: 'itm-1', decidedOn: day(20), decidedById: 'priya', course: 'followed-advice', note: '', implementedOn: day(22), createdAt: T0 }],
  });
  const row = read(raw).rows[0];
  assert.equal(row.state.key, 'breach-implemented-before-decision');
  assert.equal(row.breaches[0].earlyDays, 2, 'in place two days before the decision');
});

test('an item put to a body after its term ended is a printed breach, not a consultation', () => {
  const raw = fixture({
    bodies: [body({ termEndsOn: day(15) })],
    items: [item({ openedOn: day(10), windowDays: 5 })],
  });
  const row = read(raw).rows[0];
  assert.equal(row.state.key, 'breach-body-lapsed');
  assert.equal(row.breaches[0].afterDays, 5, 'opened five days after the body’s term ended');
});

/* ------------------------------------------------------- 4. exact arithmetic */

test('the window, the days left, the days late and the reply day are exact whole days', () => {
  assert.equal(windowClosesOn('2026-11-07', 10), '2026-11-17');
  assert.equal(earlyDays('2026-11-15', '2026-11-17'), 2);
  assert.equal(earlyDays('2026-11-17', '2026-11-17'), 0, 'a decision on the closing day is in time');
  assert.equal(earlyDays('2026-11-18', '2026-11-17'), 0, 'a late decision is not an early one');
  assert.equal(lateDays('2026-11-19', '2026-11-17'), 2);
  assert.equal(lateDays('2026-11-17', '2026-11-17'), 0);

  const raw = fixture({
    items: [item({ openedOn: day(9), windowDays: 10 })],
  });
  const row = read(raw).rows[0];
  assert.equal(row.closesOn, day(-1), 'ten days from nine days ago closes tomorrow');
  assert.equal(row.daysRemaining, 1);
  assert.equal(row.state.key, 'advice-owed');

  const late = read(fixture({ items: [item({ openedOn: day(20), windowDays: 5 })], responses: [advice({ receivedOn: day(12) })] })).rows[0];
  assert.equal(late.closesOn, day(15));
  assert.equal(late.adviceLateDays, 3, 'advice twelve days ago against a close fifteen days ago is three days late');
  assert.equal(late.replyOverdueDays, 2, 'the declared reply window ran out two days ago');
  assert.equal(late.state.key, 'reply-overdue', 'a late advice still owes its reply');
});

/* ------------------------------------------------- 5. silence is not consent */

test('a window that closes with nothing is lapsed, and a decision afterwards is recorded as taken without advice', () => {
  const row = read(fixture()).rows[0];
  assert.equal(row.state.key, 'advice-lapsed');
  assert.equal(row.response, null);
  assert.equal(row.daysRemaining, -10, 'the window closed ten days ago');

  const { api, store } = harness(fixture({ activeSeatId: 'priya' }));
  const decided = api.voiceRecordDecision({
    itemId: 'itm-1',
    decidedOn: day(2),
    course: 'proceeded-without-advice',
    note: 'The rota change proceeded with no advice because the council did not respond inside its declared period.',
  });
  assert.equal(decided.ok, true, decided?.error);
  assert.equal(store.state.voiceDecisions.length, 1);
  const after = buildVoice(store.state, { now: NOW, settings: store.state.settings, seat: null });
  assert.equal(after.rows[0].state.key, 'decided-without-advice', 'silence stays on the record beside the decision');
});

/* ---------------------------------------------------------- 6. the door */

test('the door refuses an item with no instrument, no affected line or no window', () => {
  const { api } = harness(fixture({ activeSeatId: 'mei' }));
  const noInstrument = api.voiceOpenItem({ bodyId: 'bdy-1', subject: 'A change to the rota', kind: 'consultation', instrumentRef: 'clause 4', windowDays: 10, openedOn: day(1), ownerIds: ['mei'] });
  assert.equal(noInstrument.ok, false);
  assert.equal(noInstrument.refusal, 'voice:instrument-missing');

  const noLine = api.voiceOpenItem({ bodyId: 'bdy-1', subject: 'A change to the rota', kind: 'consultation', instrumentRef: 'Staff Council Constitution 2026, clause 4.2 — ten working days', windowDays: 10, openedOn: day(1), ownerIds: [] });
  assert.equal(noLine.ok, false);
  assert.equal(noLine.refusal, 'voice:no-owner');

  const noWindow = api.voiceOpenItem({ bodyId: 'bdy-1', subject: 'A change to the rota', kind: 'consultation', instrumentRef: 'Staff Council Constitution 2026, clause 4.2 — ten working days', windowDays: 0, openedOn: day(1), ownerIds: ['mei'] });
  assert.equal(noWindow.ok, false);
  assert.equal(noWindow.refusal, 'voice:window-invalid', 'no default period exists anywhere in this register');

  const anotherLine = api.voiceOpenItem({ bodyId: 'bdy-1', subject: 'A change to the rota', kind: 'consultation', instrumentRef: 'Staff Council Constitution 2026, clause 4.2 — ten working days', windowDays: 10, openedOn: day(1), ownerIds: ['priya'] });
  assert.equal(anotherLine.ok, false, 'one line does not put another line’s work to a body');
});

test('the door refuses an item put to a dissolved body and an elected seat with no election day', () => {
  const { api } = harness(fixture({ activeSeatId: 'priya', bodies: [body({ termEndsOn: day(3) })] }));
  const lapsed = api.voiceOpenItem({ bodyId: 'bdy-1', subject: 'A change to the rota', kind: 'consultation', instrumentRef: 'Staff Council Constitution 2026, clause 4.2 — ten working days', windowDays: 10, openedOn: day(1), ownerIds: ['mei'] });
  assert.equal(lapsed.ok, false);
  assert.equal(lapsed.refusal, 'voice:body-lapsed');

  const live = harness(fixture({ activeSeatId: 'priya' }));
  const elected = live.api.voiceDeclareMember({ bodyId: 'bdy-1', personId: 'freya', role: 'member', basis: 'elected', electedOn: '', termStart: day(1) });
  assert.equal(elected.ok, false);
  assert.equal(elected.refusal, 'voice:election-missing');
});

test('the door refuses a decision before the window closes, and prints the exact days early', () => {
  const { api, store } = harness(fixture({ items: [item({ openedOn: day(5), windowDays: 10 })], activeSeatId: 'priya' }));
  const result = api.voiceRecordDecision({ itemId: 'itm-1', decidedOn: day(2), course: 'proceeded-without-advice', note: 'A written reason that will not be enough.' });
  assert.equal(result.ok, false);
  assert.equal(result.refusal, 'voice:decided-before-advice');
  assert.match(result.error, /7 day\(s\) before the declared window closes/);
  assert.equal(store.state.voiceDecisions.length, 0, 'the breach is not created');
});

test('the joint seat decides, and one affected line is refused with the reason', () => {
  const raw = fixture({ items: [item({ openedOn: day(20), windowDays: 5 })], responses: [advice({ receivedOn: day(14) })] });
  const oneLine = harness({ ...raw, settings: { ...raw.settings, activeSeatId: 'mei' } });
  const refused = oneLine.api.voiceRecordDecision({ itemId: 'itm-1', decidedOn: day(2), course: 'followed-advice' });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'voice:not-apex', 'one line cannot decide for two');

  const apex = harness({ ...raw, settings: { ...raw.settings, activeSeatId: 'priya' } });
  const allowed = apex.api.voiceRecordDecision({ itemId: 'itm-1', decidedOn: day(2), course: 'followed-advice' });
  assert.equal(allowed.ok, true, allowed?.error);
  assert.deepEqual(allowed.apexIds, ['priya']);
  assert.equal(apex.store.state.voiceDecisions.length, 1);
});

test('a departure needs advice and a reason; no advice and no implementation ordering are all refused', () => {
  const { api } = harness(fixture({ items: [item({ openedOn: day(20), windowDays: 5 })], activeSeatId: 'priya' }));
  const needsAdvice = api.voiceRecordDecision({ itemId: 'itm-1', decidedOn: day(2), course: 'departed', note: 'A written reason for a departure with no advice on the record.' });
  assert.equal(needsAdvice.ok, false);
  assert.equal(needsAdvice.refusal, 'voice:course-needs-advice');

  const withoutReason = api.voiceRecordDecision({ itemId: 'itm-1', decidedOn: day(2), course: 'proceeded-without-advice', note: '' });
  assert.equal(withoutReason.ok, false);
  assert.equal(withoutReason.refusal, 'voice:decision-note-missing');

  const lateImplement = api.voiceRecordDecision({ itemId: 'itm-1', decidedOn: day(2), course: 'proceeded-without-advice', note: 'Proceeded without advice after the declared period closed.', implementedOn: day(4) });
  assert.equal(lateImplement.ok, false);
  assert.equal(lateImplement.refusal, 'voice:implemented-before-decision');
});

test('advice and its reply are each recorded once, in order, and never on an information item', () => {
  const { api, store } = harness(fixture({ items: [
    item({ openedOn: day(20), windowDays: 10 }),
    item({ id: 'itm-info', kind: 'information', windowDays: 0, subject: 'Quarterly headcount briefing for the council' }),
  ], activeSeatId: 'mei' }));

  const onInformation = api.voiceRecordAdvice({ itemId: 'itm-info', receivedOn: day(2), advice: 'support', note: 'The council supported the briefing and asked for the chart to be included.' });
  assert.equal(onInformation.ok, false);
  assert.equal(onInformation.refusal, 'voice:no-advice-owed');

  const beforeItem = api.voiceRecordAdvice({ itemId: 'itm-1', receivedOn: day(40), advice: 'support', note: 'Advice recorded before the question was put to the body.' });
  assert.equal(beforeItem.ok, false);
  assert.equal(beforeItem.refusal, 'voice:advice-before-item');

  const recorded = api.voiceRecordAdvice({ itemId: 'itm-1', receivedOn: day(9), advice: 'amend', note: 'The council asked for the payments batch to be excluded from the freeze.' });
  assert.equal(recorded.ok, true, recorded?.error);
  assert.equal(recorded.lateDays, 1, 'advice nine days ago against a close ten days ago is one day late');

  const second = api.voiceRecordAdvice({ itemId: 'itm-1', receivedOn: day(8), advice: 'oppose', note: 'A second note must not overwrite what the body already said.' });
  assert.equal(second.ok, false);
  assert.equal(second.refusal, 'voice:advice-exists');

  const earlyReply = api.voiceReplyToAdvice({ itemId: 'itm-1', replyOn: day(12), replyNote: 'A reply that predates the advice it claims to answer.' });
  assert.equal(earlyReply.ok, false);
  assert.equal(earlyReply.refusal, 'voice:reply-before-advice');

  const reply = api.voiceReplyToAdvice({ itemId: 'itm-1', replyOn: day(6), replyNote: 'The payments batch was excluded before the change was implemented.' });
  assert.equal(reply.ok, true, reply?.error);
  assert.equal(store.state.voiceResponses[0].replyOn, day(6));
});

test('a sitting names members of its own body and its minutes arrive whole', () => {
  const { api, store } = harness(fixture({ activeSeatId: 'mei' }));
  const nonMember = api.voiceHoldSitting({ bodyId: 'bdy-1', on: day(2), presentIds: ['priya'], itemIds: [] });
  assert.equal(nonMember.ok, false);
  assert.equal(nonMember.refusal, 'voice:non-member-present');

  const halfMinutes = api.voiceHoldSitting({ bodyId: 'bdy-1', on: day(2), presentIds: ['mbr-1', 'mbr-2'], itemIds: [], minutesOn: day(1), minutesRef: '' });
  assert.equal(halfMinutes.ok, false);
  assert.equal(halfMinutes.refusal, 'voice:minutes-ref-missing');

  const held = api.voiceHoldSitting({ bodyId: 'bdy-1', on: day(2), presentIds: ['mbr-1', 'mbr-2'], itemIds: ['itm-1'] });
  assert.equal(held.ok, true, held?.error);
  assert.equal(store.state.voiceSittings[0].minutesOn, null, 'minutes are recorded by their own act');
  const minutes = api.voiceRecordMinutes({ sittingId: held.id, on: day(1), reference: 'Minutes 2026/C-31 held by the chair' });
  assert.equal(minutes.ok, true, minutes?.error);
});

/* ------------------------------------------------------------- 7. matrix */

test('the reader resolves the joint seat per item and counts a person once', () => {
  const report = read(fixture());
  const row = report.rows[0];
  assert.deepEqual(row.apex.apexIds, ['priya'], 'the one seat above both affected lines');
  assert.deepEqual(row.owners.map((owner) => owner.id).sort(), ['freya', 'mei']);
  assert.equal(report.totals.ownersN, 2, 'two distinct line holders, not four owner references');

  const single = read(fixture({ items: [item({ ownerIds: ['mei'] })] }));
  assert.deepEqual(single.rows[0].apex.apexIds, ['mei'], 'a single affected line is its own apex');
});

test('an item whose lines are not on the graph is printed as unresolved and the figures say so', () => {
  const raw = fixture({ items: [item({ ownerIds: ['ghost'] })] });
  const report = read(raw);
  assert.equal(report.rows[0].owners[0].resolved, false);
  assert.equal(report.unresolvedOwnerN, 1);
  assert.equal(report.figuresComplete, false);
  assert.match(report.incompleteReasons.join(' '), /not on the active reporting graph/);
});

/* --------------------------------------------------------------- 8. rule */

function ruleDraft(raw) {
  const draft = load(raw);
  return draft;
}

test('RULE-VOI-01 asks the joint seat for a lapsed window, once, and closes when the advice arrives', () => {
  const draft = ruleDraft(fixture());
  const factory = (prefix) => `${prefix}-rule-${draft.delegations.length}`;
  const ctx = { event: { type: 'voice.item.opened' }, now: NOW, idFactory: factory, linkCtx: { idFactory: factory } };
  const first = voiceRule(draft, ctx);
  assert.ok(first.some((effect) => effect.action === 'delegated'));
  const asks = indexVoiceAsks(draft);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].seatId, 'priya', 'the joint seat above both affected lines');
  assert.equal(asks[0].signature, voiceAskSignature('advice-lapsed', 'itm-1'));
  assert.equal(asks[0].task.personId, 'priya', 'never the body, which is not a person');
  assert.equal(asks[0].task.title.includes('itm-1'), false, 'the ask text names no item id');
  assert.equal(asks[0].task.title.includes('Staff Council'), false, 'the ask text names no body');

  const again = voiceRule(draft, { ...ctx, now: new Date(NOW.getTime() + 1000) });
  assert.equal(again.filter((effect) => effect.action === 'delegated').length, 0, 'idempotent per signature and addressee');
  assert.equal(indexVoiceAsks(draft).length, 1);

  // The condition clears: the ask closes itself, without a human answer.
  draft.voiceResponses.push(advice({ receivedOn: day(9) }));
  const cleared = voiceRule(draft, { ...ctx, event: { type: 'voice.advice.recorded' } });
  assert.ok(cleared.some((effect) => effect.action === 'closed'));
  assert.equal(draft.delegations[0].status, 'done');
  assert.match(draft.delegations[0].completionNote, /RULE-VOI-01/);
});

test('the rule is pause-governed on every path and observes identity-free when no apex resolves', () => {
  const paused = ruleDraft(fixture());
  paused.settings = { ...paused.settings, [VOI_SETTING_KEYS.autoPropagate]: false };
  assert.deepEqual(voiceRule(paused, { event: { type: 'voice.item.opened' }, now: NOW }), [], 'a pause is a pause');

  // Owners on the graph but no joint seat: two apex-less branches (a disconnected
  // root pair). The rule asks nobody and writes ONE identity-free marker.
  const orphan = ruleDraft(fixture({ items: [item({ ownerIds: ['mei', 'sam'] })], activeSeatId: undefined }));
  orphan.people = [person('mei', null), person('sam', null), person('priya', null)];
  orphan.reportingLines = [];
  orphan.voiceMembers = members().filter((row) => row.personId !== 'freya');
  const before = orphan.voiceMarkers.length;
  const markerFactory = (prefix) => `${prefix}-mark`;
  voiceRule(orphan, { event: { type: 'voice.item.opened' }, now: NOW, idFactory: markerFactory, linkCtx: { idFactory: markerFactory } });
  const markers = orphan.voiceMarkers.slice(before);
  assert.equal(markers.length, 1, 'one observation, once');
  assert.equal(markers[0].key, voiceAskSignature('advice-lapsed', 'itm-1'));
  assert.match(markers[0].detail, /no joint seat/, 'the marker says why nobody was asked');
  assert.equal(indexVoiceAsks(orphan).length, 0, 'nobody was asked');
});

test('the rule files at most four asks per commit and counts the rest as deferred', () => {
  const many = [];
  for (let i = 1; i <= 6; i += 1) {
    many.push(item({ id: `itm-${i}`, subject: `Rota change number ${i} put to the council for advice`, openedOn: day(40), windowDays: 5 }));
  }
  const draft = ruleDraft(fixture({ items: many }));
  const capFactory = (prefix) => `${prefix}-cap-${draft.delegations.length}`;
  const effects = voiceRule(draft, { event: { type: 'voice.item.opened' }, now: NOW, idFactory: capFactory, linkCtx: { idFactory: capFactory } });
  assert.equal(indexVoiceAsks(draft).length, 4, 'capped at four');
  assert.ok(effects.some((effect) => effect.action === 'deferred' && /2 employee-voice ask/.test(effect.summary)));
});

test('an advice nobody answered and a sitting with no minutes each file their own ask', () => {
  const draft = ruleDraft(fixture({
    items: [item({ openedOn: day(30), windowDays: 5 })],
    responses: [advice({ receivedOn: day(24) })],
    sittings: [{ id: 'sit-1', bodyId: 'bdy-1', on: day(30), presentIds: ['mbr-1', 'mbr-2'], itemIds: ['itm-1'], minutesOn: null, minutesRef: null, recordedById: 'mei', createdAt: T0 }],
  }));
  const twoFactory = (prefix) => `${prefix}-two-${draft.delegations.length}`;
  voiceRule(draft, { event: { type: 'voice.sitting.held' }, now: NOW, idFactory: twoFactory, linkCtx: { idFactory: twoFactory } });
  const signatures = indexVoiceAsks(draft).map((ask) => ask.signature).sort();
  assert.deepEqual(signatures, [voiceAskSignature('minutes-lapsed', 'sit-1'), voiceAskSignature('reply-overdue', 'itm-1')].sort());
});

test('the condition kernel says why an unaskable condition is observed rather than filed', () => {
  const report = read(fixture({ items: [item({ ownerIds: ['ghost'] })] }));
  const { conditions, observations } = voiceConditions(report);
  assert.equal(conditions.length, 0);
  assert.equal(observations.length, 1, 'one observation per condition, not one per line');
  assert.match(observations[0].detail, /no seat can be asked|resolves on the active graph|no joint seat/);
});

/* ---------------------------------------------------------------- 9. CSV */

test('CSV #184 is identity-free, keeps complete apart from the counts, and withholds a small state', () => {
  const report = read(fixture({ items: [item(), item({ id: 'itm-info', kind: 'information', windowDays: 0, subject: 'Quarterly headcount briefing for the council' })] }));
  const rows = voiceCsvRows(report);
  assert.deepEqual(Object.keys(rows[0]), VOI_CSV_COLUMNS);
  const summary = rows.find((row) => row.row_kind === 'summary');
  assert.equal(Number(summary.items_n), 2);
  assert.equal(Number(summary.advice_lapsed_n), 1);
  assert.equal(Number(summary.complete), 1);

  const serialized = JSON.stringify(rows);
  for (const forbidden of ['Staff Council', 'on-call', 'priya', 'mei', 'sam', 'freya', 'bdy-1', 'itm-1', 'Constitution']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not cross the export boundary`);
  }

  // Below the declared floor of 3, the per-state count is BLANK with its reason.
  const lapsedRow = rows.find((row) => row.row_kind === 'item_state' && row.key === 'advice-lapsed');
  assert.equal(lapsedRow.items_n, '', 'a count of one is withheld');
  assert.match(lapsedRow.blank_reason, /privacy floor/);

  const withheld = read(fixture({ items: [item(), item({ id: 'itm-info', kind: 'information', windowDays: 0, subject: 'Another briefing for the council' })] }));
  withheld.figuresComplete = false;
  withheld.incompleteReasons = ['A stored row could not be read.'];
  const flagged = voiceCsvRows(withheld).find((row) => row.row_kind === 'summary');
  assert.equal(Number(flagged.complete), 0);
  assert.match(flagged.blank_reason, /could not be read/);
});

test('the CSV scope is registered and exports the reader’s own summary through the real pipeline', () => {
  const state = load(fixture());
  const exported = exportWorkspaceCsv(state, VOI_CSV_SCOPE);
  assert.equal(exported.ok, true, exported?.error);
  const parsed = parseCsv(exported.csv);
  assert.deepEqual(parsed.headers, VOI_CSV_COLUMNS);
  const summary = parsed.rows[0];
  assert.equal(summary[0], day(0), 'as_of is the injected day');
  assert.equal(summary[2], 'ALL');
});

/* -------------------------------------------------------------- 10. panel */

test('the panel prints the reader’s own figures cell by cell (display == computed)', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({
      items: [item(), item({ id: 'itm-2', subject: 'Friday release freeze for the billing migration', openedOn: day(30), windowDays: 5 })],
      responses: [advice({ itemId: 'itm-2', receivedOn: day(24) })],
    });
    const state = load(raw);
    const report = buildVoice(state, { now: NOW, seat: null });
    const { api } = harness(raw);
    const html = renderVoice({ api, query: new URLSearchParams(''), state }).outerHTML;
    const cell = (testid) => {
      const match = new RegExp(`data-testid="${testid}"[^>]*>([^<]*)<`).exec(html);
      return match ? match[1].trim() : null;
    };
    assert.equal(cell('voice-count-lapsed'), String(report.totals.adviceLapsedN));
    assert.equal(cell('voice-count-reply-overdue'), String(report.totals.replyOverdueN));
    assert.equal(cell('voice-count-breaches'), String(report.totals.breachesN));
    assert.match(html, /Two claims, reported apart/);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the panel renders every tab without throwing on a workspace with no body at all', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="modal-root"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  try {
    const raw = fixture({ bodies: [], members: [], items: [], sittings: [] });
    const state = load(raw);
    const { api } = harness(raw);
    for (const panel of ['board', 'items', 'sittings', 'lines', 'method']) {
      const node = renderVoice({ api, query: new URLSearchParams(`panel=${panel}`), state });
      assert.ok(node.outerHTML.length > 0, `${panel} renders`);
    }
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.Element;
  }
});

test('the conventions are refused rather than clamped, and the reader derives nothing from an unknown key', () => {
  const { api, store } = harness(fixture({ activeSeatId: 'priya' }));
  const refused = api.voiceSetConventions({ patch: { voiceReplyDays: 0 } });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal, 'voice:setting-out-of-bounds');
  const unknown = api.voiceSetConventions({ patch: { voiceConsultationDays: 10 } });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'voice:unknown-setting');
  const set = api.voiceSetConventions({ patch: { voiceReplyDays: 7, voiceMinutesDueDays: 5 } });
  assert.equal(set.ok, true, set?.error);
  assert.equal(normalizeVoiceSettings(store.state.settings)[VOI_SETTING_KEYS.replyDays], 7);
});
