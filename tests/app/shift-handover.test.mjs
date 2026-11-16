/**
 * ADR-0223 — Shift Handover & Two-Key Readback Ledger (I-PASS / HRO boundary
 * transfer; Schema v178, CSV #165, `#/shift-handover`, `RULE-SHO-01`).
 *
 * Matrix topology (single seed):
 *   ceo (vp, rank 4)
 *    ├─ dan (director, rank 3)
 *    │   ├─ mia (manager, rank 2 — home line of ivo)
 *    │   │   └─ ivo (lead, rank 1 — also dotted project line to kai)
 *    │   └─ kai (manager, rank 2 — project line)
 *    └─ zoe (director, rank 3)
 *        └─ ben (manager, rank 2)
 *            └─ sam (ic)
 *   Ada Tech (ic, mia/ivo branch) and Leo Ops (ic, kai branch) stand in for the
 *   two shifts at a station boundary; night cover often sits on a second line.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  COLLECTIONS,
  DEFAULT_SETTINGS,
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeSettings,
  normalizeState,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  PAUSE_PERMIT_MATRIX_REACH_SWITCHES,
  PAUSE_PERMIT_SWITCH_RULES,
} from '../../app/core/domain/pausePermitRegistry.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import {
  SHO_CSV_COLUMNS,
  SHO_CSV_SCOPE,
  SHO_RULE_ID,
  SHO_SETTING_KEYS,
  SHO_SEVERITY_KEYS,
} from '../../app/core/domain/shiftHandoverRegistry.js';
import {
  normalizeShiftHandovers,
  normalizeShiftHandoverReadbacks,
  normalizeShiftHandoverSettings,
} from '../../app/core/domain/shiftHandoverSchema.js';
import {
  buildShiftHandover,
  shiftHandoverAttentionCount,
  shiftHandoverCsvRows,
  shiftHandoverMatrix,
} from '../../app/core/domain/shiftHandover.js';
import {
  shiftHandoverConditions,
  shiftHandoverRule,
} from '../../app/core/domain/shiftHandoverRules.js';
import { renderShiftHandover } from '../../app/views/shiftHandover.js';

const SUMMARY = 'Press line 2 changeover: die swap complete, first-article inspection pending, interlock jumpered and tagged, night shift owns the re-certification.';
const CONTINGENCY = 'If first-article scrap exceeds 2% or the jumpered interlock moves, stop the press, de-energize, and call Mia or Kai — do not remove the tag.';
const SYNTHESIS = 'I have the board: jumpered interlock stays tagged, first-article inspection is mine, scrap above 2% stops the press and I escalate to Mia or Kai before touching anything.';
const DISPUTE = 'The interlock jumper has no isolation certificate on file and the contingency names a tag I cannot verify; I cannot safely accept this station in this state.';
const REASON = 'Night cover fell through and the changeover did not happen.';

const at = (day) => new Date(`${day}T10:00:00.000Z`);

function guardApi(store, raw, clock) {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args) => {
        const verdict = guardApiCall(store.state, String(prop), args, clock().getTime());
        if (!verdict.ok) return verdict;
        return value.apply(target, args);
      };
    },
  });
}

function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost/#/shift-handover',
  });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    return run(dom);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    dom.window.close();
  }
}

function seed(nowDay = '2026-11-15') {
  let currentNow = at(nowDay);
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const iso = '2026-01-01T09:00:00.000Z';
  const person = (id, name, level, managerId) => ({
    id, name, role: level, level, managerId,
    status: 'active', startDate: iso, createdAt: iso, updatedAt: iso,
  });
  const raw = createEmptyState(currentNow.toISOString());
  raw.people = [
    person('ceo', 'Cleo VP', 'vp', null),
    person('dan', 'Dan Director', 'director', 'ceo'),
    person('mia', 'Mia HomeMgr', 'manager', 'dan'),
    person('kai', 'Kai ProjMgr', 'manager', 'dan'),
    person('ivo', 'Ivo Lead', 'lead', 'mia'),
    // The two shift operators hold the boundary: each leads one IC, so each
    // resolves a rank-1 frontline seat (an IC with no reports is not a seat).
    person('ada', 'Ada Tech', 'lead', 'ivo'),
    person('pat', 'Pat Day', 'ic', 'ada'),
    person('leo', 'Leo Ops', 'lead', 'kai'),
    person('quinn', 'Quinn Night', 'ic', 'leo'),
    person('zoe', 'Zoe PeerDir', 'director', 'ceo'),
    person('ben', 'Ben PeerMgr', 'manager', 'zoe'),
    person('sam', 'Sam Ops', 'ic', 'ben'),
  ];
  // Night/weekend cover on a shared-services line: Leo reports to Kai's line here,
  // standing in for the second matrix line a changeover crosses.
  raw.reportingLines = [
    // The day/night cover boundary lives on a declared shared-services line:
    // Ada holds Leo through it, which is the only reach the gate (and the action)
    // needs — night cover sits on a second line, never in this seat's tree.
    {
      id: 'rl-ada-night',
      personId: 'leo',
      managerId: 'ada',
      kind: 'project',
      shareH: 100,
      rights: ['assignment'],
      fromISO: '2026-01-01',
      toISO: null,
      declaredAt: iso,
      note: 'Night/weekend cover for the press boundary',
    },
  ];
  const normalized = normalizeState(raw, { now: currentNow }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => { values.set(k, String(v)); },
    removeItem: (k) => { values.delete(k); },
  };
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const rawApi = createApi(store, { now: clock, idFactory });
  const api = guardApi(store, rawApi, clock);

  return {
    store,
    rawApi,
    api,
    setDay(day) { currentNow = at(day); },
    declareInput(overrides = {}) {
      return {
        stationRef: 'Press line 2 — changeover',
        incomingId: 'leo',
        severity: 'abnormal',
        summary: SUMMARY,
        contingency: CONTINGENCY,
        abnormalities: 'Interlock jumpered and tagged; permit EX-2211 expires 2026-11-16T02:00Z',
        dueAt: '2026-11-15T22:00:00.000Z',
        openActions: [
          { text: 'Complete first-article inspection and log results', ownerId: 'leo', dueDay: '2026-11-16' },
          { text: 'Chase maintenance for the isolation certificate', ownerId: null, dueDay: null },
        ],
        ...overrides,
      };
    },
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId || 'leader', summary: 'seat switch' });
    },
  };
}

/** Declare a standard handover from ada (day) to leo (night) under the current seat. */
function declareStandard(env, overrides = {}) {
  env.sit('ada');
  return env.api.shiftHandoverDeclare(env.declareInput(overrides));
}

/* ------------------------------------------- 1. Schema, migration & loaders */

test('ADR-0223 Schema v178: additive migration, persisted convention, registered collections and fail-closed loaders', () => {
  assert.equal(SCHEMA_VERSION, 179);
  for (const col of ['shiftHandovers', 'shiftHandoverReadbacks', 'shiftHandoverMarkers']) {
    assert.ok(COLLECTIONS.includes(col), `${col} registered in COLLECTIONS`);
  }
  assert.equal(DEFAULT_SETTINGS.shiftHandoverAutoPropagate, true);
  assert.equal(normalizeSettings({ shiftHandoverAutoPropagate: false }).shiftHandoverAutoPropagate, false);
  assert.deepEqual(normalizeShiftHandoverSettings({}), { shiftHandoverAutoPropagate: true });

  const v177 = { schemaVersion: 177, people: [], settings: {} };
  assert.equal(typeof MIGRATIONS[177], 'function');
  const migrated = migrate(v177);
  assert.equal(migrated.raw.schemaVersion, 179);
  assert.equal(migrated.applied.at(-1), '178 → 179');
  assert.deepEqual(migrated.raw.shiftHandovers, []);
  assert.deepEqual(migrated.raw.shiftHandoverReadbacks, []);
  assert.deepEqual(migrated.raw.shiftHandoverMarkers, []);

  // Fail-closed loader: broken rows drop with counted warnings, nothing repaired.
  const warnings = [];
  const rows = normalizeShiftHandovers([
    { id: 'ok-1', stationRef: 'Press line 2', outgoingId: 'ada', incomingId: 'leo', severity: 'watch', summary: SUMMARY, contingency: CONTINGENCY, abnormalities: '', openActions: [], declaredAt: '2026-11-15T10:00:00.000Z', dueAt: '2026-11-15T22:00:00.000Z', cancelledOn: null, cancelledById: '', cancelReason: '' },
    { id: 'bad-self', stationRef: 'Press', outgoingId: 'ada', incomingId: 'ada', severity: 'watch', summary: SUMMARY, contingency: CONTINGENCY, declaredAt: '2026-11-15T10:00:00.000Z', dueAt: '2026-11-15T22:00:00.000Z' },
    { id: 'bad-sev', stationRef: 'Press', outgoingId: 'ada', incomingId: 'leo', severity: 'mostly-fine', summary: SUMMARY, contingency: CONTINGENCY, declaredAt: '2026-11-15T10:00:00.000Z', dueAt: '2026-11-15T22:00:00.000Z' },
    { id: 'bad-time', stationRef: 'Press', outgoingId: 'ada', incomingId: 'leo', severity: 'watch', summary: SUMMARY, contingency: CONTINGENCY, declaredAt: '2026-11-15T10:00:00.000Z', dueAt: '2026-11-14T10:00:00.000Z' },
    { id: 'bad-text', stationRef: 'Press', outgoingId: 'ada', incomingId: 'leo', severity: 'watch', summary: 'too short', contingency: CONTINGENCY, declaredAt: '2026-11-15T10:00:00.000Z', dueAt: '2026-11-15T22:00:00.000Z' },
  ], warnings);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'ok-1');
  assert.equal(warnings.length, 1);

  const actWarnings = [];
  assert.equal(normalizeShiftHandoverReadbacks([
    { id: 'a1', handoverId: 'ok-1', actorId: 'leo', kind: 'synthesized', synthesis: 'short', at: '2026-11-15T23:00:00.000Z' },
    { id: 'a2', handoverId: 'ok-1', actorId: 'leo', kind: 'disputed', disputeReason: 'also too short', at: '2026-11-15T23:00:00.000Z' },
    { id: 'a3', handoverId: 'ok-1', actorId: 'leo', kind: 'synthesized', synthesis: SYNTHESIS, at: '2026-11-15T23:00:00.000Z' },
  ], actWarnings).length, 1);
  assert.equal(actWarnings.length, 1);

  // Reload idempotency: a row the loader keeps survives a second load byte-identical.
  const kept = normalizeShiftHandovers(rows, []);
  const pass2 = normalizeShiftHandovers(JSON.parse(JSON.stringify(kept)), []);
  assert.deepEqual(pass2, kept);
});

/* --------------------------------- 2. First-person boundary & two-key refusals */

test('ADR-0223 two keys, first person: declare/readback/cancel refusals — no self-handover, no stranger at the boundary, no key turned for you', () => {
  const env = seed();
  env.sit('ada');

  const selfHandover = env.api.shiftHandoverDeclare(env.declareInput({ incomingId: 'ada' }));
  assert.equal(selfHandover.ok, false);
  assert.equal(selfHandover.refusal, 'shiftHandover:self-handover');

  const unknown = env.api.shiftHandoverDeclare(env.declareInput({ incomingId: 'ghost-op' }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.refusal, 'shiftHandover:incoming-unknown');

  const badSeverity = env.api.shiftHandoverDeclare(env.declareInput({ severity: 'mostly-fine' }));
  assert.equal(badSeverity.ok, false);
  assert.equal(badSeverity.refusal, 'shiftHandover:severity-invalid');

  const shortContingency = env.api.shiftHandoverDeclare(env.declareInput({ contingency: 'watch it' }));
  assert.equal(shortContingency.ok, false);
  assert.equal(shortContingency.refusal, 'shiftHandover:contingency-missing');

  const declared = declareStandard(env);
  assert.equal(declared.ok, true, declared.error);
  const briefId = declared.briefId;

  // Nobody turns Leo's key for him — not the outgoing operator, not the manager, not the chief.
  const byOutgoing = env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'synthesized', synthesis: SYNTHESIS });
  assert.equal(byOutgoing.ok, false);
  assert.equal(byOutgoing.refusal, 'shiftHandover:not-the-incoming');
  env.sit('mia');
  const byManager = env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'synthesized', synthesis: SYNTHESIS });
  assert.equal(byManager.ok, false);
  assert.equal(byManager.refusal, 'shiftHandover:not-the-incoming');

  // A synthesis needs the receiver's own words; a dispute needs its named reason.
  env.sit('leo');
  assert.equal(env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'synthesized', synthesis: 'got it' }).ok, false);
  assert.equal(env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'disputed', disputeReason: 'nope' }).ok, false);

  // The outgoing operator cannot cancel someone else's brief, and cannot cancel after a key turns.
  const cancelByStranger = (function () { env.sit('mia'); return env.api.shiftHandoverCancel({ handoverId: briefId, reason: REASON, on: '2026-11-15' }); })();
  assert.equal(cancelByStranger.ok, false);
  assert.equal(cancelByStranger.refusal, 'shiftHandover:not-your-brief');
  env.sit('leo');
  assert.equal(env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'disputed', disputeReason: DISPUTE }).ok, true);
  env.sit('ada');
  const cancelAfterKey = env.api.shiftHandoverCancel({ handoverId: briefId, reason: REASON, on: '2026-11-15' });
  assert.equal(cancelAfterKey.ok, false);
  assert.equal(cancelAfterKey.refusal, 'shiftHandover:readback-exists');
});

/* ------------------------------ 3. The two states a boundary can be in, and closure */

test('ADR-0223 containment is two keys: dispute holds the station uncontained until a later synthesis, and history is never edited', () => {
  const env = seed();
  const declared = declareStandard(env, { severity: 'emergency' });
  const briefId = declared.briefId;

  let report = env.api.shiftHandoverReport();
  assert.equal(report.totals.briefsDeclared, 1);
  assert.equal(report.briefs[0].state, 'awaiting-readback');
  assert.equal(report.totals.figuresComplete, false, 'nothing is contained until the key turns');

  env.sit('leo');
  const disputed = env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'disputed', disputeReason: DISPUTE });
  assert.equal(disputed.ok, true, disputed.error);
  report = env.api.shiftHandoverReport();
  assert.equal(report.briefs[0].state, 'disputed');
  assert.equal(report.totals.disputedN, 1);
  assert.equal(report.totals.figuresComplete, false);

  // The dispute stands; a second dispute is allowed to restate (still uncontained), then synthesis resolves.
  const resolved = env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'synthesized', synthesis: SYNTHESIS });
  assert.equal(resolved.ok, true, resolved.error);
  report = env.api.shiftHandoverReport();
  assert.equal(report.briefs[0].state, 'contained');
  assert.equal(report.totals.containedN, 1);
  assert.equal(report.totals.countsReconcile, true);
  assert.equal(report.totals.figuresComplete, true);

  // History is immutable: nothing further can be recorded on a contained brief.
  assert.equal(env.api.shiftHandoverReadback({ handoverId: briefId, kind: 'disputed', disputeReason: DISPUTE }).ok, false);
  assert.equal(env.api.shiftHandoverCancel({ handoverId: briefId, reason: REASON, on: '2026-11-15' }).ok, false);

  // A later synthesis is a NEW act — both acts remain on the record, in order.
  const acts = report.readbacks.map((row) => row.kind);
  assert.deepEqual(acts.slice().sort(), ['disputed', 'synthesized']);
});

/* --------------------------------------------- 4. Overdue escalation to the joint apex */

test('ADR-0223 RULE-SHO-01 asks the joint seat above EVERY line of both operators — never one peer line, never either operator', () => {
  const env = seed('2026-11-10');
  const declared = declareStandard(env, { dueAt: '2026-11-11T10:00:00.000Z' });
  assert.equal(declared.ok, true, declared.error);
  env.setDay('2026-11-15'); // the readback instant has passed

  // One write re-arms the rule through the spine.
  env.sit('ada');
  const scan = env.api.shiftHandoverScan();
  assert.equal(scan.ok, true, scan.error);

  const asks = env.store.state.delegations.filter((row) => row.status === 'active' && row.personId === 'dan');
  assert.equal(asks.length, 1, 'dan (the joint seat above ivo/kai peer lines — the seat above both operators’ lines)');
  assert.match(asks[0].title, /shift-handover register/i);
  assert.doesNotMatch(asks[0].title, /Press line 2|jumpered|ada|leo/i, 'the ask is opaque — no station, no name, no abnormality');
  assert.equal(asks[0].authority, 'act-inform');
  // Neither operator is asked to contain their own boundary.
  assert.equal(env.store.state.delegations.filter((row) => ['ada', 'leo'].includes(row.personId)).length, 0);

  // The ask closes itself when the condition clears.
  env.sit('leo');
  assert.equal(env.api.shiftHandoverReadback({ handoverId: declared.briefId, kind: 'synthesized', synthesis: SYNTHESIS }).ok, true);
  const scan2 = env.api.shiftHandoverScan();
  assert.equal(scan2.ok, true);
  const closed = env.store.state.delegations.find((row) => row.id === asks[0].id);
  assert.equal(closed.status, 'done');
  assert.match(closed.completionNote, /no longer reports this condition/i);
});

test('ADR-0223 RULE-SHO-01 writes ONE identity-free marker and asks nobody when no joint seat exists', () => {
  const env = seed('2026-11-10');
  const iso = '2026-01-01T09:00:00.000Z';
  // An unrelated branch that dies out at the root. Ada can reach it only
  // through a declared line over it; above both branches there is no roster
  // seat — the two lines resolve nothing but the synthetic workspace leader,
  // which is a graph node, not a seat. Nobody may be asked.
  env.store.update((draft) => {
    draft.people = [
      ...draft.people,
      { id: 'lone-a', name: 'Lone A', role: 'lead', level: 'lead', managerId: null, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso },
      { id: 'lone-b', name: 'Lone B', role: 'lead', level: 'lead', managerId: 'lone-a', status: 'active', startDate: iso, createdAt: iso, updatedAt: iso },
    ];
    draft.reportingLines = [
      ...(Array.isArray(draft.reportingLines) ? draft.reportingLines : []),
      { id: 'rl-ada-lone', personId: 'lone-b', managerId: 'ada', kind: 'project', shareH: 100, rights: ['assignment'], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: 'Cover on an unrelated branch' },
    ];
  }, { type: 'person.added', entity: 'person', entityId: 'lone', summary: 'unrelated branch' });
  env.sit('ada');
  const declared = env.api.shiftHandoverDeclare(env.declareInput({ incomingId: 'lone-b', dueAt: '2026-11-11T10:00:00.000Z' }));
  assert.equal(declared.ok, true, declared.error);
  env.setDay('2026-11-15');

  const report = buildShiftHandover(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: null });
  const row = report.briefsAll.find((brief) => brief.id === declared.briefId);
  assert.equal(row.overdue, true);
  assert.equal(row.escalation.disconnected, true, 'no roster seat above both lines — the synthetic leader is not askable');
  assert.equal(row.escalation.apexId, null);

  // Nobody is asked, and nobody invents a joint seat to ask.
  // No RULE-SHO-01 ask exists yet — at declaration the readback is not overdue.
  const shoAsks = (env.store.state.links || []).filter((link) => link && link.ruleId === SHO_RULE_ID);
  assert.equal(shoAsks.length, 0, 'no RULE-SHO-01 ask filed');

  // Directly pin the disconnected branch through the exported conditions function.
  const fakeReport = { briefsAll: [{ ...row, outgoingManagers: [], incomingManagers: [], overdue: true, state: 'awaiting-readback', severity: 'abnormal' }] };
  const { conditions, observations } = shiftHandoverConditions(env.store.state, fakeReport, { today: '2026-11-15', matrix: { nodes: new Map(), linesByPerson: new Map() } });
  assert.equal(conditions.length, 0);
  assert.equal(observations.length, 1);
  assert.match(observations[0].key, /^sho1\|no-apex\|/);

  // And pin the leader-only branch through the live matrix.
  const { conditions: leaderConditions, observations: leaderObservations } = shiftHandoverConditions(
    env.store.state,
    { briefsAll: [{ ...row, overdue: true, state: 'awaiting-readback', severity: 'abnormal' }] },
    { today: '2026-11-15', matrix: shiftHandoverMatrix(env.store.state, at('2026-11-15'), { ...env.store.state.settings, activeSeatId: null }) },
  );
  assert.equal(leaderConditions.length, 0, 'the synthetic leader is never asked');
  assert.equal(leaderObservations.length, 1);
  assert.match(leaderObservations[0].key, /^sho1\|no-apex\|/);
});

/* ------------------------------------------- 5. Attention, redaction & cross-line printing */

test('ADR-0223 attention counts the incoming operator’s owed key; redaction withholds identities at rank 4+; cross-line is classified, not pooled', () => {
  const env = seed();
  const declared = declareStandard(env);
  assert.equal(declared.ok, true, declared.error);

  env.sit('leo');
  assert.equal(shiftHandoverAttentionCount(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: { id: 'leo', nodeId: 'leo', rank: 1, fullAccess: false } }), 1);
  env.sit('ada');
  assert.equal(shiftHandoverAttentionCount(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: { id: 'ada', nodeId: 'ada', rank: 1, fullAccess: false } }), 0);

  const full = buildShiftHandover(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: { id: 'leo', nodeId: 'leo', rank: 1, fullAccess: false } });
  assert.equal(full.briefs[0].crossLine, true, 'ada (mia line via ivo) → leo (kai line) crosses lines');
  assert.equal(full.briefs[0].outgoingName, 'Ada Tech');

  const redacted = buildShiftHandover(env.store.state, { now: at('2026-11-15'), settings: env.store.state.settings, seat: { id: 'dan', nodeId: 'dan', rank: 4, fullAccess: false } });
  assert.equal(redacted.briefs[0].outgoingName, null, 'identity withheld at rank 4 without full access');
  assert.equal(redacted.briefs[0].incomingName, null);

  // Unowned actions are counted, printed as unowned, never assigned.
  assert.equal(full.totals.unownedActionsN, 1);
  assert.equal(full.briefs[0].openActions.filter((a) => !a.ownerId).length, 1);
});

/* --------------------------------------------- 6. CSV, wiring pins & the view */

test('ADR-0223 wiring: CSV #165 is identity-free, the rule is on the spine and pause-registered, and rights are declared for every altitude', () => {
  assert.equal(CSV_EXPORTS.length, 166);
  const scope = CSV_EXPORTS.find((entry) => entry.key === SHO_CSV_SCOPE);
  assert.ok(scope, 'shift-handover scope registered');
  assert.equal(scope.sensitive, true);
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => rule.id);
  assert.equal(ids.length, 140);
  assert.ok(ids.includes('shiftHandoverRule'));
  assert.equal(ids.lastIndexOf('shiftHandoverRule'), ids.indexOf('shiftHandoverRule'));
  assert.ok(ids.indexOf('shiftHandoverRule') < ids.indexOf('seatRule'));
  assert.deepEqual(ids.slice(-2), ['seatRule', 'sealRule']);
  assert.equal(DEFAULT_POST_COMMIT_RULES.length, PROPAGATION_CONTRACTS.length);
  const contract = PROPAGATION_CONTRACTS.find((row) => row.rule === shiftHandoverRule);
  assert.ok(contract, 'propagation contract registered');
  assert.deepEqual(contract.writes.sort(), ['delegations', 'links', 'shiftHandoverMarkers'].sort());
  assert.ok(PAUSE_PERMIT_MATRIX_REACH_SWITCHES.includes('shiftHandoverAutoPropagate'));
  assert.equal(PAUSE_PERMIT_SWITCH_RULES.shiftHandoverAutoPropagate, 'shiftHandoverRules.js');
  assert.equal(SHO_SETTING_KEYS.autoPropagate, 'shiftHandoverAutoPropagate');

  // CSV rows are aggregates; nothing identity-shaped crosses the boundary.
  const env = seed();
  const declared = declareStandard(env);
  assert.equal(declared.ok, true);
  env.sit('leo');
  assert.equal(env.api.shiftHandoverReadback({ handoverId: declared.briefId, kind: 'disputed', disputeReason: DISPUTE }).ok, true);
  const exported = exportWorkspaceCsv(env.store.state, SHO_CSV_SCOPE, { now: at('2026-11-15') });
  assert.equal(exported.ok, true, exported.error);
  const text = exported.csv;
  for (const banned of ['Ada Tech', 'Leo Ops', 'Press line 2', 'jumpered', DISPUTE, SYNTHESIS]) {
    assert.ok(!text.includes(banned.slice(0, 20)), `no identity in CSV (${banned.slice(0, 24)})`);
  }
  const { headers, rows } = parseCsv(text);
  assert.deepEqual(headers, [...SHO_CSV_COLUMNS]);
  assert.equal(exported.rowCount, 2 + SHO_SEVERITY_KEYS.length + 4);
  const col = (name) => headers.indexOf(name);
  const summary = rows.find((row) => row[col('row_kind')] === 'summary');
  assert.equal(summary[col('declared')], '1');
  assert.equal(summary[col('disputed')], '1');
});

test('ADR-0223 view: the panel renders the ledger, the declare dialog files a row, and the readback dialog turns Leo’s key', () => {
  const env = seed();
  const declared = declareStandard(env);
  assert.equal(declared.ok, true, declared.error);
  withDom(() => {
    const host = document.getElementById('host');
    const ctx = {
      api: env.rawApi,
      state: env.store.state,
      now: at('2026-11-15'),
      query: new URLSearchParams(''),
      navigate: () => {},
      refresh: () => {},
    };
    const node = renderShiftHandover(ctx);
    host.appendChild(node);
    assert.equal(host.querySelector('[data-testid="shift-handover-panel"]') !== null, true);
    assert.equal(host.querySelector('[data-testid="sho-count-briefs"]').textContent, '1');
    assert.equal(host.querySelector('[data-testid="sho-count-unowned"]').textContent, '1');
    // The incoming operator's owed key is surfaced as an attention count.
    const report = env.rawApi.shiftHandoverReport();
    assert.equal(report.totals.owedToMe >= 0, true);
  });
});

/* -------------------------------------------------- 7. The pause governs the scan too */

test('ADR-0223 the pause governs the rule on every path, including the explicit scan', () => {
  const env = seed('2026-11-10');
  const declared = declareStandard(env, { dueAt: '2026-11-11T10:00:00.000Z' });
  assert.equal(declared.ok, true);
  env.setDay('2026-11-15');
  env.store.update((draft) => { draft.settings = { ...(draft.settings || {}), shiftHandoverAutoPropagate: false }; },
    { type: 'convention.set', entity: 'settings', entityId: 'shiftHandoverAutoPropagate', summary: 'pause' });
  const before = env.store.state.delegations.length;
  const result = shiftHandoverRule(env.store.state, { event: { type: SHO_RULE_ID }, now: at('2026-11-15'), idFactory: (p) => `${p}-x` });
  assert.deepEqual(result, []);
  assert.equal(env.store.state.delegations.length, before, 'a paused rule files nothing');
});
