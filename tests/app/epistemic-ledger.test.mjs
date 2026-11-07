/**
 * ADR-0103, Schema v105 — the Epistemic Ledger (`#/epistemic`).
 *
 * Cross-module and cross-altitude by construction: these tests prove that
 *   - v104 → v105 is additive and nothing is back-filled,
 *   - the harvest really reads the record (a case, a goal, a delegation, a
 *     performance conversation, a premise, a reminder …) and freezes ONE unknown
 *     per source record, idempotently,
 *   - RULE-EPI-01 writes the unknown as a graph node with a `rests-on` edge to
 *     the record it came from and one `rolls-up-to` edge per leadership ancestor
 *     in the SAME transaction — so the missing signal is visible ABOVE the span
 *     that missed it,
 *   - RULE-EPI-02 opens exactly ONE governed decision per ageing unopened signal,
 *     RULE-EPI-03 expires it rather than resolving it, RULE-EPI-04 opens one
 *     calibration review on an optimism gap, and RULE-EPI-05 grades once,
 *   - the overconfidence index is Cohen's kappa on the belief × record 2×2 read
 *     with the prevalence and bias indices and PABAK, and refuses below the floor
 *     and where one cell carries the table,
 *   - a belief about work whose outcome is already known is refused at write time,
 *   - the conventions are director+ AND full access, and a read is seat-scoped,
 *   - CSV scope #99 carries no identifier, and the six panels render axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.localStorage = dom.window.localStorage;

import { createApi } from '../../app/actions.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { manifestFor } from '../../app/core/domain/disclosureManifests.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { API_RIGHTS } from '../../app/core/domain/accessGateway.js';
import { RECORD_POLICIES } from '../../app/core/domain/seatRegistry.js';
import { LINK_ENTITY_TYPES, LINK_ENTITY_COLLECTIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import {
  buildEpistemicReport,
  cohenKappa,
  epistemicBriefText,
  epistemicCsvRows,
  harvestSignals,
  outcomeOfSubject,
  ruleOfThree,
  scoreObservation,
  wilsonInterval,
} from '../../app/core/domain/epistemic.js';
import { epistemicRule } from '../../app/core/domain/epistemicRules.js';
import {
  normalizeEpistemicObservations,
  normalizeEpistemicSettings,
  normalizeEpistemicUnknowns,
} from '../../app/core/domain/epistemicSchema.js';
import { EPISTEMIC_RULE_IDS } from '../../app/core/domain/epistemicRegistry.js';
import { renderEpistemic } from '../../app/views/epistemic.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

/** A four-altitude tree with every off-switch except the one under test. */
function tree(overrides = {}) {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'exec',
    epistemicWindowDays: 120,
    epistemicEscalateDays: 14,
    epistemicExpiryDays: 30,
    epistemicAnswerFloor: 3,
    epistemicPairFloor: 4,
    epistemicCellFloor: 2,
    epistemicBlindFloor: 55,
    epistemicBlindDarkPct: 5,
    epistemicReviewDays: 14,
    // ADR-0117's bounded backlog policy is UNDER TEST in its own fixtures at
    // the bottom of this file. Everywhere else the weekly escalation budget is
    // declared wide open, so the rest of the ledger is measured unbounded and
    // the two behaviours cannot confound each other.
    epistemicEscalateMaxPerWeek: 52,
    epistemicAutoPropagate: true,
  };
  for (const key of Object.keys(state.settings)) {
    if (key.endsWith('AutoPropagate') && key !== 'epistemicAutoPropagate') state.settings[key] = false;
  }
  // Four altitudes, using the ladder the Command Chain itself declares
  // (LEVEL_ALTITUDE: lead → manager → director → vp). The leader node above VP
  // is the workspace leader, so `chainLeaderAltitude` names the top rung.
  state.settings.chainLeaderAltitude = 'exec';
  state.people = [
    { id: 'vp1', name: 'Vera Executive', role: 'VP', level: 'vp', team: 'Ops', status: 'active' },
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active' },
    ...(overrides.people || []),
  ];
  return normalizeState({ ...state, ...overrides.state }, { now: NOW }).state;
}

/**
 * A real store, loaded from storage exactly as the app loads it. The gateway
 * resolves the operating seat against the loaded workspace, so a hand-rolled
 * object would test something the browser never runs.
 */
/**
 * `normalizeState` clamps `openedOn`/`dueDate` forward for some collections (a
 * case opened before the workspace existed is repaired to its creation day), so
 * a fixture that needs a genuinely OLD record pins the dates after normalization.
 * That is the state the app itself would hold once the record aged.
 */
function aged(state, { cases = [], goals = [], delegations = [] } = {}) {
  const patch = (rows, overrides) => rows.map((row) => ({ ...row, ...(overrides.find((o) => o.id === row.id) || {}) }));
  return {
    ...state,
    cases: patch(state.cases, cases),
    goals: patch(state.goals, goals),
    delegations: patch(state.delegations, delegations),
  };
}

function harness(state, clock = () => NOW) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-epi-${++seq}`;
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = createApi(store, { now: clock, idFactory });
  return { store, api };
}

/* ------------------------------------------------------------------ schema */

test('Schema v105 migrates additively: empty ledgers, declared conventions, nothing back-filled', () => {
  assert.equal(SCHEMA_VERSION, 113);
  const base = createEmptyState(NOW_ISO);
  const legacy = { ...base, schemaVersion: 104 };
  delete legacy.epistemicUnknowns;
  delete legacy.epistemicObservations;
  delete legacy.epistemicGrades;
  delete legacy.epistemicMarkers;
  legacy.settings = { ...base.settings };
  delete legacy.settings.epistemicWindowDays;
  const migrated = migrate(legacy);
  assert.equal(migrated.raw.schemaVersion, 112);
  assert.deepEqual(migrated.raw.epistemicUnknowns, []);
  assert.deepEqual(migrated.raw.epistemicObservations, []);
  assert.deepEqual(migrated.raw.epistemicGrades, []);
  assert.deepEqual(migrated.raw.epistemicMarkers, []);
  assert.equal(migrated.raw.settings.epistemicWindowDays, 90);
  assert.ok(migrated.applied.includes('104 → 105'));
  // A migration that invented an unknown would be manufacturing a finding.
  assert.equal(migrated.raw.epistemicUnknowns.length, 0);
});

test('the normalizers are fail-closed: an answer without a day, a dismissal without a reason and a back-dated belief are all dropped', () => {
  const warnings = [];
  const unknowns = normalizeEpistemicUnknowns([
    { id: 'u1', title: 'A real signal', className: 'danger', origin: 'harvested', sourceType: 'case', sourceId: 'c1', harvestedOn: '2026-11-01', state: 'unopened' },
    // claiming a resolution with no answer and no day
    { id: 'u2', title: 'Half answered', className: 'danger', origin: 'harvested', sourceType: 'case', sourceId: 'c2', harvestedOn: '2026-11-01', state: 'answered' },
    // claiming a dismissal with no reason
    { id: 'u3', title: 'Silent dismissal', className: 'defect', origin: 'harvested', sourceType: 'goal', sourceId: 'g1', harvestedOn: '2026-11-01', state: 'dismissed' },
    // harvested from a day that has not happened
    { id: 'u4', title: 'From the future', className: 'danger', origin: 'harvested', sourceType: 'case', sourceId: 'c3', harvestedOn: '2027-01-01' },
    // a harvested row with no provenance cannot be navigated back
    { id: 'u5', title: 'No provenance', className: 'danger', origin: 'harvested', harvestedOn: '2026-11-01' },
    // a declared row legitimately has no source record
    { id: 'u6', title: 'A question a human wrote', className: 'declared', origin: 'declared', harvestedOn: '2026-11-01', state: 'unopened' },
  ], warnings, { now: NOW });
  assert.deepEqual(unknowns.map((row) => row.id), ['u1', 'u6']);
  assert.ok(warnings.some((w) => w.includes('claiming a resolution')));
  assert.ok(warnings.some((w) => w.includes('ahead of today')));

  const observations = normalizeEpistemicObservations([
    { id: 'o1', declaredOn: '2026-11-01', pairs: [{ subjectType: 'decision', subjectId: 'd1', belief: true, declaredOn: '2026-11-01' }] },
    { id: 'o2', declaredOn: '2026-11-01', pairs: [{ subjectType: 'decision', subjectId: 'd2', belief: true, declaredOn: '2026-10-01' }] },
  ], [], { now: NOW });
  // The PAIR is preserved exactly; scoring — not the loader — is what refuses to
  // credit a pair dated before its own observation.
  assert.equal(observations[0].pairs.length, 1);
  assert.equal(observations[0].pairs[0].declaredOn, '2026-11-01');

  const settings = normalizeEpistemicSettings({ epistemicWindowDays: 5, epistemicBlindFloor: 400, epistemicPairFloor: 'x' });
  assert.equal(settings.epistemicWindowDays, 14, 'clamped up to the declared minimum');
  assert.equal(settings.epistemicBlindFloor, 95, 'clamped down to the declared maximum');
  assert.equal(settings.epistemicPairFloor, 8, 'a non-number falls back to the declared default');
  assert.equal(settings.epistemicEscalateMaxPerWeek, 5, 'the weekly escalation budget falls back to the declared default');
  assert.equal(normalizeEpistemicSettings({ epistemicEscalateMaxPerWeek: 999 }).epistemicEscalateMaxPerWeek, 52, 'the weekly escalation budget is clamped to its declared band');
});

/* ------------------------------------------------------------- statistics */

test('the statistics are the named ones: Wilson 1927, Cohen 1960 kappa, PABAK and the rule of three', () => {
  const w = wilsonInterval(3, 10);
  assert.equal(w.pct, 30);
  assert.ok(w.lowPct < 30 && w.highPct > 30);

  // A perfect table: kappa 1, PABAK 1.
  const perfect = cohenKappa({ agreedOk: 6, optimism: 0, pessimism: 0, agreedBad: 6 }, { pairFloor: 4 });
  assert.equal(perfect.kappa, 1);
  assert.equal(perfect.pabak, 1);
  assert.equal(perfect.refused, false);

  // The table this module exists for: the belief ran ahead.
  const optimism = cohenKappa({ agreedOk: 4, optimism: 6, pessimism: 1, agreedBad: 3 }, { pairFloor: 4 });
  assert.ok(optimism.biasIndex > 0, 'a positive bias index means the belief over-predicts good outcomes');
  assert.ok(optimism.pabak !== null);

  // Below the floor, refused with a reason.
  const thin = cohenKappa({ agreedOk: 1, optimism: 1, pessimism: 0, agreedBad: 0 }, { pairFloor: 8 });
  assert.equal(thin.refused, true);
  assert.equal(thin.kappa, null);

  // One cell carrying the table refines to nothing, and says so.
  const degenerate = cohenKappa({ agreedOk: 20, optimism: 0, pessimism: 0, agreedBad: 0 }, { pairFloor: 4 });
  assert.equal(degenerate.refused, true);
  assert.match(degenerate.reason, /one cell/i);

  // Rule of three: zero arrivals over 90 days.
  assert.equal(ruleOfThree(0, 90), 1);
  assert.equal(ruleOfThree(2, 90), null, 'it applies only where nothing arrived');
});

/* ---------------------------------------------------------------- harvest */

test('the harvest reads the record and freezes ONE unknown per source record, deterministically', () => {
  const state = tree({
    state: {
      cases: [{
        id: 'case1', title: 'Billing backlog', kind: 'risk', status: 'open', ownerId: 'mgr1',
        openedOn: '2026-09-01', fmea: { severity: 8, probability: 5, detectability: 4 },
      }],
      goals: [{
        id: 'goal1', title: 'Cut the queue', ownerId: 'lead1', status: 'active', confidence: 'off-track',
        dueDate: '2026-08-01', createdAt: '2026-07-01', keyResults: [], checkins: [],
      }],
      delegations: [{
        id: 'del1', title: 'Rewrite the intake form', personId: 'lead1', status: 'active',
        dueOn: '2026-10-01', delegatedOn: '2026-09-01', authority: 'decide', checkins: [],
      }],
      feedback: [{
        id: 'fb1', personId: 'lead1', direction: 'given', kind: 'constructive', situation: 's', behavior: 'b',
        impact: '', date: '2026-09-20', observedOn: '2026-09-19', followUpOn: '2026-10-01', followUpDone: false, tags: [],
      }],
      performanceConcerns: [{
        id: 'pc1', personId: 'lead1', label: 'A performance conversation', status: 'assessing',
        openedOn: '2026-08-01', observations: [], conversations: [], notes: [], history: [], markers: [],
      }],
      // A premise the sentinel has carried to `breached`: the fixture supplies
      // the evidence the sentinel itself would have read, then asserts the state
      // the loader derives, so the harvest is tested against a real premise and
      // not a hand-written verdict.
      premises: [{
        id: 'prem1', title: 'Demand falls in Q4', statement: 'Demand falls in Q4',
        criticality: 'load-bearing', priorPct: 70, watchPct: 55, breachPct: 30, halfLifeDays: 900,
        createdAt: '2026-07-01', sourceRefs: [], history: [],
        observations: [{
          id: 'o1', key: 'manual:1', sensorId: 'manual', direction: 'against', likelihoodRatio: 12,
          observedOn: '2026-09-01', sourceType: 'manual', sourceId: 'manual:1', title: 'Demand held',
          summary: 'Demand did not fall.', createdAt: '2026-09-01T10:00:00.000Z',
        }],
      }],
      decisions: [{
        id: 'dec1', title: 'Consolidate the queues', date: '2026-08-01', chosen: 'merge', outcome: 'bad',
        reviewedOn: '2026-10-01', options: [], rationale: '',
      }],
    },
  });
  assert.equal(state.premises[0].status, 'breached', 'the sentinel carried the premise through its signpost');
  const settings = state.settings;
  const first = harvestSignals(state, { now: NOW, settings });
  assert.equal(first.length, 7, first.map((s) => s.signalKey).join(' | '));
  assert.deepEqual(first.map((s) => s.signalKey).sort(), [
    'case-ageing', 'concern-stalled', 'decision-bad-outcome', 'delegation-overdue',
    'feedback-unclosed', 'goal-at-risk', 'premise-breached',
  ].sort());
  assert.deepEqual(first.map((s) => s.className).sort(), ['danger', 'danger', 'danger', 'defect', 'defect', 'defect', 'defect']);
  // Every signal carries the record it came from and the day that made it a signal.
  for (const signal of first) {
    assert.ok(signal.sourceType && signal.sourceId, 'a harvested signal always names its source');
    assert.ok(signal.evidencesOn, 'a harvested signal always carries an evidence day');
    assert.ok(signal.expiresOn > signal.evidencesOn, 'a harvested signal always carries a declared expiry');
    assert.match(signal.route, /^#\//);
  }
  // Deterministic: the same record harvested twice yields the same order.
  const second = harvestSignals(state, { now: NOW, settings });
  assert.deepEqual(first.map((s) => s.sourceId), second.map((s) => s.sourceId));
});

/* ------------------------------------------- cross-module + cross-altitude */

test('RULE-EPI-01 freezes the unknown as a graph node with rests-on and one rolls-up-to per ancestor, in ONE transaction', () => {
  const state = tree({
    state: {
      cases: [{
        id: 'case1', title: 'Billing backlog', kind: 'risk', status: 'open', ownerId: 'lead1',
        openedOn: '2026-09-01', fmea: { severity: 8, probability: 5, detectability: 4 },
      }],
    },
  });
  const { store, api } = harness(state);
  assert.equal(store.state.epistemicUnknowns.length, 0, 'a fresh workspace holds no unknown');
  // `setActiveSeat` is itself a committed write, and the spine runs on every
  // commit: the harvest fires on the very first write a workspace makes, before
  // anyone has pressed anything. That is the design — the ledger is a property of
  // the record, not of a visit to the screen.
  const seatRes = api.setActiveSeat('mgr1');
  assert.equal(seatRes.ok, true, 'declare the seat through the gateway');
  const after = store.state;
  assert.ok(after.epistemicUnknowns.length > 0, 'the harvest froze at least one unknown');

  const result = api.epistemicScan();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.report.summary.unknownN, store.state.epistemicUnknowns.length, 'an explicit scan reports the same record it just re-harvested, idempotently');

  const unknown = after.epistemicUnknowns.find((row) => row.sourceId === 'case1');
  assert.ok(unknown, 'the ageing case produced an unknown');
  assert.equal(unknown.className, 'danger');
  assert.equal(unknown.state, 'unopened');
  assert.equal(unknown.ownerSeatId, 'mgr1', 'the unknown is owned by the span that owns the record');

  // rests-on: the pointer back to the record. Never a copy of it.
  const restsOn = after.links.find((link) => link.sourceType === 'unknown' && link.sourceId === unknown.id && link.relation === 'rests-on');
  assert.ok(restsOn, 'the unknown rests on the record it was read from');
  assert.equal(restsOn.targetType, 'case');
  assert.equal(restsOn.targetId, 'case1');
  assert.ok(!JSON.stringify(unknown).includes('Billing backlog'), 'no record content is copied onto the unknown');

  // rolls-up-to: the MISSING signal climbs every leadership ancestor.
  const up = after.links
    .filter((link) => link.sourceType === 'unknown' && link.sourceId === unknown.id && link.relation === 'rolls-up-to')
    .map((link) => link.targetId)
    .sort();
  assert.deepEqual(up, ['dir1', 'vp1'], 'one rolls-up-to edge per leadership ancestor');

  // The graph node is navigable and projects no content.
  const resolved = resolveLinkedEntity(after, 'unknown', unknown.id);
  assert.ok(resolved);
  assert.match(resolved.route, /^#\/epistemic\?panel=unknowns&unknown=/);
  assert.ok(!resolved.title.includes('Billing backlog'));

  // Idempotent: a second scan cannot duplicate the unknown.
  const countAfterFirst = store.state.epistemicUnknowns.length;
  api.epistemicScan();
  assert.equal(store.state.epistemicUnknowns.length, countAfterFirst, 'a rescan does not duplicate a frozen unknown');
});

test('RULE-EPI-02 opens exactly ONE governed decision per ageing unopened signal, ever', () => {
  const state = tree({
    state: {
      cases: [{
        id: 'case1', title: 'Billing backlog', kind: 'risk', status: 'open', ownerId: 'lead1',
        openedOn: '2026-09-01', fmea: { severity: 8, probability: 5, detectability: 4 },
      }],
    },
  });
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  // RULE-EPI-01 and RULE-EPI-02 fire in the SAME pass: the 65-day-old case is
  // escalated on the day it is harvested, because the organisation already spent
  // two months not looking. The escalation is therefore already on the record.
  const seeded = store.state;
  const unknown = seeded.epistemicUnknowns.find((row) => row.sourceId === 'case1');
  assert.ok(unknown, 'the harvest ran');
  const escalatedOnSight = seeded.decisions.filter((row) => /^Unread danger signal/.test(row.title));
  assert.equal(escalatedOnSight.length, 1, 'a signal older than the escalation floor is escalated at harvest, not on a later visit');
  assert.match(escalatedOnSight[0].title, /65 day\(s\) old/);
  assert.equal(seeded.epistemicMarkers.filter((marker) => marker.kind === 'escalate').length, 1, 'one escalation marker per unknown');

  // Re-running on the record as it stands opens NOTHING: the marker is the guard
  // and it is written in the same transaction as the decision, so a crash between
  // the two cannot open a second one.
  const replay = JSON.parse(JSON.stringify(seeded));
  const replayEffects = epistemicRule(replay, {
    event: { type: 'epistemic.scan' },
    now: NOW,
    settings: replay.settings,
    idFactory: (prefix) => `${prefix}-replay`,
  });
  assert.equal(replay.decisions.length, seeded.decisions.length, 'a rescan never opens a second decision');
  assert.ok(!replayEffects.some((effect) => effect.ruleId === EPISTEMIC_RULE_IDS.ESCALATE && effect.action === 'created'));

  // Drop the marker on a copy and the rule fires exactly once — so the guard is
  // the marker, and it is what a real second decision would have to get past.
  const draft = JSON.parse(JSON.stringify(seeded));
  draft.epistemicMarkers = draft.epistemicMarkers.filter((marker) => marker.kind !== 'escalate');
  draft.decisions = draft.decisions.filter((row) => !/^Unread danger signal/.test(row.title));
  const effects = epistemicRule(draft, {
    event: { type: 'epistemic.scan' },
    now: NOW,
    settings: draft.settings,
    idFactory: (prefix) => `${prefix}-escalated`,
  });
  const created = draft.decisions.filter((row) => row.id === 'dec-escalated');
  assert.equal(created.length, 1, 'exactly one governed decision');
  assert.match(created[0].title, /Unread danger signal/);
  assert.match(created[0].question, /Two routes are honest/);
  assert.ok(effects.some((effect) => effect.ruleId === EPISTEMIC_RULE_IDS.ESCALATE));
  // The finding rolls up the tree as well.
  const rolled = draft.links.filter((link) => link.sourceType === 'decision' && link.sourceId === 'dec-escalated' && link.relation === 'rolls-up-to');
  assert.ok(rolled.length >= 1, 'the escalation rolls up the chain');

  // Never twice: the marker prevents a second decision for the same unknown.
  const secondEffects = epistemicRule(draft, {
    event: { type: 'epistemic.scan' },
    now: NOW,
    settings: draft.settings,
    idFactory: (prefix) => `${prefix}-again`,
  });
  assert.equal(draft.decisions.filter((row) => /Unread danger signal/.test(row.title)).length, 1, 'one decision per unknown, ever');
  assert.ok(!secondEffects.some((effect) => effect.ruleId === EPISTEMIC_RULE_IDS.ESCALATE && effect.action === 'created'));
});

test('RULE-EPI-03 expires an unanswered unknown instead of resolving it, and then prompts at most once a week', () => {
  const state = tree({
    state: {
      goals: [{
        id: 'goal1', title: 'Cut the queue', ownerId: 'lead1', status: 'active', confidence: 'at-risk',
        dueDate: '2026-08-01', createdAt: '2026-07-01', keyResults: [], checkins: [],
      }],
    },
  });
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  api.epistemicScan();
  const seeded = store.state;
  const unknown = seeded.epistemicUnknowns.find((row) => row.sourceId === 'goal1');
  assert.equal(unknown.state, 'unopened');
  // Move the declared expiry into the past: the window closed with no answer.
  const draft = JSON.parse(JSON.stringify(seeded));
  draft.epistemicUnknowns = draft.epistemicUnknowns.map((row) => (row.id === unknown.id ? { ...row, expiresOn: '2026-10-01' } : row));
  epistemicRule(draft, {
    event: { type: 'epistemic.scan' }, now: NOW, settings: draft.settings,
    idFactory: (prefix) => `${prefix}-exp`,
  });
  const expired = draft.epistemicUnknowns.find((row) => row.id === unknown.id);
  assert.equal(expired.state, 'expired', 'the workspace refuses to call a lapsed window resolved');
  assert.ok(expired.timeline.some((entry) => entry.kind === 'expired'));
  assert.equal(draft.decisions.filter((row) => /expired unanswered/.test(row.title)).length, 1);

  // A second pass in the SAME ISO week opens nothing more.
  epistemicRule(draft, {
    event: { type: 'epistemic.scan' }, now: NOW, settings: draft.settings,
    idFactory: (prefix) => `${prefix}-exp2`,
  });
  assert.equal(draft.decisions.filter((row) => /expired unanswered/.test(row.title)).length, 1, 'one bounded prompt per unknown per ISO week');
});

/* ----------------------------------------------------------- calibration */

test('a belief about work whose outcome is already on the record is refused at write time', () => {
  const state = tree({
    state: {
      decisions: [
        { id: 'd1', title: 'A settled call', date: '2026-09-01', chosen: 'yes', outcome: 'good', options: [], rationale: '' },
        { id: 'd2', title: 'A call in flight', date: '2026-10-01', chosen: '', outcome: 'pending', options: [], rationale: '' },
      ],
    },
  });
  const { store, api } = harness(state);
  const refused = api.epistemicObserve({ pairs: [{ subjectType: 'decision', subjectId: 'd1', belief: true }] });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /already on the record/);

  const accepted = api.epistemicObserve({
    question: 'Will the merge land on time?',
    confidencePct: 80,
    pairs: [{ subjectType: 'decision', subjectId: 'd2', belief: true }],
  });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(store.state.epistemicObservations.length, 1);
  assert.equal(store.state.epistemicObservations[0].pairs[0].subjectId, 'd2');
  assert.equal(store.state.epistemicObservations[0].declaredOn, '2026-11-05');
});

test('the overconfidence index reads the DIRECTION of the disagreement, and grades once', () => {
  // Four observations, each frozen on a day, whose subjects have since resolved.
  const state = tree({
    state: {
      decisions: [
        { id: 'd1', title: 'One', date: '2026-09-01', chosen: 'a', outcome: 'good', options: [], rationale: '' },
        { id: 'd2', title: 'Two', date: '2026-09-01', chosen: 'a', outcome: 'bad', options: [], rationale: '' },
        { id: 'd3', title: 'Three', date: '2026-09-01', chosen: 'a', outcome: 'bad', options: [], rationale: '' },
        { id: 'd4', title: 'Four', date: '2026-09-01', chosen: 'a', outcome: 'bad', options: [], rationale: '' },
        { id: 'd5', title: 'Five', date: '2026-09-01', chosen: 'a', outcome: 'good', options: [], rationale: '' },
        { id: 'd6', title: 'Six', date: '2026-09-01', chosen: 'a', outcome: 'good', options: [], rationale: '' },
      ],
      epistemicObservations: [{
        id: 'obs1', declaredOn: '2026-09-02', declaredAt: '2026-09-02T10:00:00.000Z',
        ownerSeatId: 'mgr1', altitudeKey: 'manager', rank: 2, question: 'Will these land?', confidencePct: 80,
        pairs: [
          { subjectType: 'decision', subjectId: 'd1', belief: true, declaredOn: '2026-09-02' },
          { subjectType: 'decision', subjectId: 'd2', belief: true, declaredOn: '2026-09-02' },
          { subjectType: 'decision', subjectId: 'd3', belief: true, declaredOn: '2026-09-02' },
          { subjectType: 'decision', subjectId: 'd4', belief: true, declaredOn: '2026-09-02' },
          { subjectType: 'decision', subjectId: 'd5', belief: true, declaredOn: '2026-09-02' },
          { subjectType: 'decision', subjectId: 'd6', belief: false, declaredOn: '2026-09-02' },
        ],
        pairN: 6, gradedOn: null, cells: null, unpairedN: 0,
        engineVersion: 'epistemic-ledger-2026.11-v1', createdAt: '2026-09-02T10:00:00.000Z',
      }],
    },
  });
  const scored = scoreObservation(state, state.epistemicObservations[0]);
  // d1 good/belief true -> agreedOk; d2..d4 bad/belief true -> optimism x3;
  // d5 good/belief true -> agreedOk; d6 good/belief false -> pessimism.
  assert.deepEqual(scored.cells, { agreedOk: 2, optimism: 3, pessimism: 1, agreedBad: 0 });
  assert.equal(scored.pairedN, 6);

  const report = buildEpistemicReport(state, { now: NOW, settings: state.settings });
  assert.equal(report.calibration.cells.optimism, 3);
  assert.ok(report.calibration.kappa.biasIndex > 0, 'the belief ran ahead of the record');
  assert.equal(report.calibration.verdict.key, 'optimism');
  assert.match(report.calibration.verdict.reason, /ran ahead|runs ahead/i);

  // RULE-EPI-05 grades once.
  const draft = JSON.parse(JSON.stringify(state));
  const effects = epistemicRule(draft, {
    event: { type: 'epistemic.scan' }, now: NOW, settings: draft.settings,
    idFactory: (prefix) => `${prefix}-g`,
  });
  assert.equal(draft.epistemicGrades.length, 1);
  assert.equal(draft.epistemicObservations[0].gradedOn, '2026-11-05');
  assert.ok(effects.some((effect) => effect.ruleId === EPISTEMIC_RULE_IDS.GRADE));
  // RULE-EPI-04 opened one calibration review on the optimism gap.
  assert.ok(draft.decisions.some((row) => /Calibration review/.test(row.title)), 'the optimism gap opens a governed review');
  // A second pass grades nothing more and does not re-open the review.
  epistemicRule(draft, { event: { type: 'epistemic.scan' }, now: NOW, settings: draft.settings, idFactory: (prefix) => `${prefix}-g2` });
  assert.equal(draft.epistemicGrades.length, 1, 'a frozen belief is graded exactly once');
  assert.equal(draft.decisions.filter((row) => /Calibration review/.test(row.title)).length, 1, 'one review per span per ISO week');
});

test('a pair dated BEFORE its own observation is excluded rather than credited as foresight', () => {
  const state = tree({
    state: {
      decisions: [{ id: 'd1', title: 'One', date: '2026-09-01', chosen: 'a', outcome: 'good', options: [], rationale: '' }],
      epistemicObservations: [{
        id: 'obs1', declaredOn: '2026-10-01', declaredAt: '2026-10-01T10:00:00.000Z',
        ownerSeatId: 'mgr1', altitudeKey: 'manager', rank: 2, question: '', confidencePct: 70,
        pairs: [{ subjectType: 'decision', subjectId: 'd1', belief: true, declaredOn: '2026-09-01' }],
        pairN: 1, gradedOn: null, cells: null, unpairedN: 0,
        engineVersion: 'epistemic-ledger-2026.11-v1', createdAt: '2026-10-01T10:00:00.000Z',
      }],
    },
  });
  const scored = scoreObservation(state, state.epistemicObservations[0]);
  assert.equal(scored.pairedN, 0, 'a back-dated pair enters no cell');
  assert.equal(scored.backdatedN, 1, 'and it is counted, not silently dropped');
  assert.equal(outcomeOfSubject(state, { subjectType: 'decision', subjectId: 'd1' }), true);
});

/* ----------------------------------------------------------- blind spots */

test('the implied ledger measures the absence of arriving edges, and bounds a zero with the rule of three', () => {
  const state = tree({
    state: {
      cases: [
        { id: 'c1', title: 'Open one', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-01', fmea: {} },
        { id: 'c2', title: 'Open two', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-02', fmea: {} },
        { id: 'c3', title: 'Open three', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-03', fmea: {} },
      ],
    },
  });
  const withNoEdges = buildEpistemicReport(state, { now: NOW, settings: state.settings });
  const danger = withNoEdges.blind.rows.find((row) => row.className === 'danger');
  assert.ok(danger.expectedN >= 3, 'three measurable records below the span');
  assert.equal(danger.arrivedN, 0, 'and nothing arrived: the graph carries no edge');
  // The operator seat's span IS the whole workspace, so three measurable records
  // with no arriving edge is a genuinely dark class — not a refusal.
  assert.equal(danger.band.key, 'dark', 'nothing arrived although measurable activity exists');
  assert.equal(danger.silentN, danger.expectedN, 'every measurable signal is silent');
  const small = buildEpistemicReport(tree({
    state: {
      cases: [{ id: 'c1', title: 'Only one', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-01', fmea: {} }],
      settings: { ...tree().settings, epistemicAutoPropagate: false },
    },
  }), { now: NOW, settings: { ...tree().settings, epistemicAutoPropagate: false, epistemicCellFloor: 3 } });
  void small;

  // Now give the span the edges the shared spine would actually write and read it
  // from the manager's own seat.
  const withEdges = tree({
    overrides: {},
    ...{
      state: {
        cases: [
          { id: 'c1', title: 'Open one', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-01', fmea: {} },
          { id: 'c2', title: 'Open two', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-02', fmea: {} },
          { id: 'c3', title: 'Open three', kind: 'risk', status: 'open', ownerId: 'lead1', openedOn: '2026-10-03', fmea: {} },
        ],
        links: [
          { id: 'l1', sourceType: 'case', sourceId: 'c1', targetType: 'person', targetId: 'mgr1', relation: 'rolls-up-to', ruleId: 'RULE-SEAT-01', createdOn: '2026-10-01' },
        ],
        settings: { ...tree().settings, activeSeatId: 'mgr1', epistemicAutoPropagate: false, epistemicWindowDays: 120, epistemicCellFloor: 2 },
      },
    },
  });
  const seated = buildEpistemicReport(withEdges, { now: NOW, settings: withEdges.settings });
  const seatedDanger = seated.blind.rows.find((row) => row.className === 'danger');
  assert.equal(seatedDanger.expectedN, 3);
  assert.equal(seatedDanger.arrivedN, 1, 'exactly one of the three produced an arriving edge');
  assert.equal(seatedDanger.coveragePct, 33.3);
  assert.equal(seatedDanger.band.key, 'blind', 'a third arriving is mostly blind under the declared bands');
});

/* ----------------------------------------------------- seats and export */

test('a governed finding is audit output: no module locks it, and the scan converges in one pass', () => {
  // A rule-opened decision is not operational work. Before this guard, the
  // hindsight lock scored every escalation the ledger opened — a lock with zero
  // consulted facts and a process verdict on a form the engine itself authored —
  // and each of those then became a subject for the next pass. On a real demo
  // workspace that turned a rescan into 109 → 213 decisions and 77 → 6132 links,
  // which is the difference between a ledger and a runaway.
  const state = tree({
    state: {
      cases: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        id: `case${n}`, title: `Risk ${n}`, kind: 'risk', status: 'open', ownerId: 'lead1',
        openedOn: `2026-0${n}-01`, fmea: { severity: 7, probability: 5, detectability: 4 },
      })),
    },
  });
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);

  const first = store.state;
  const escalations = first.epistemicUnknowns.filter((row) => row.className === 'danger');
  assert.ok(escalations.length >= 8, 'eight ageing cases were harvested');
  // ONE explicit scan escalates every ageing signal it found; it does not dribble
  // six per pass and call the remainder "changed" on the next visit.
  const decisionsAfterHarvest = first.decisions.length;
  assert.ok(decisionsAfterHarvest >= escalations.length, 'each ageing signal opened its governed decision in the same pass');

  const opened = first.decisions.map((row) => row.id);
  const locksOnFindings = (first.decisionLocks || []).filter((lock) => opened.includes(lock.decisionId));
  assert.equal(locksOnFindings.length, 0, 'no module freezes the information set of a governed finding');

  // The markers are the provenance, and they are what the guard reads.
  assert.ok(first.epistemicMarkers.filter((marker) => marker.decisionId).length >= escalations.length);

  // And the whole workspace converges: the second scan changes nothing at all.
  const snapshot = (s) => JSON.stringify({
    decisions: s.decisions.length,
    delegations: s.delegations.length,
    links: s.links.length,
    unknowns: s.epistemicUnknowns.length,
    markers: s.epistemicMarkers.length,
    locks: (s.decisionLocks || []).length,
  });
  const before = snapshot(store.state);
  const rescan = api.epistemicScan();
  assert.equal(rescan.ok, true);
  assert.equal(snapshot(store.state), before, 'a rescan is idempotent across every module it touches');
});

test('the conventions are director+ AND full access; the reads are seat-scoped', () => {
  assert.equal(API_RIGHTS.epistemicDeclare, 'record-epistemic-unknown');
  assert.equal(API_RIGHTS.epistemicSetConventions, 'govern-epistemic');
  assert.equal(RECORD_POLICIES.epistemicUnknowns.classKey, 'unit');

  const state = tree({
    state: { settings: { ...tree().settings, activeSeatId: 'lead1', epistemicAutoPropagate: false } },
  });
  const { store, api } = harness(state);
  // Rank: a manager (rank 2) may not re-declare what the whole workspace measures.
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  const rankRefusal = api.epistemicSetConventions({ epistemicPairFloor: 10 });
  assert.equal(rankRefusal.ok, false);
  assert.match(rankRefusal.error, /rank window is 4–5/);
  // Capability: an executive (rank 4) holds the rank but not a full-access seat,
  // and the handler refuses on the second condition rather than the first.
  assert.equal(api.setActiveSeat('vp1').ok, true);
  const capabilityRefusal = api.epistemicSetConventions({ epistemicPairFloor: 10 });
  assert.equal(capabilityRefusal.ok, false);
  assert.match(capabilityRefusal.error, /full-access/i);
  // And a manager may still RECORD an unknown at their own span: the governance
  // right is not needed to say out loud what you do not know.
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  const declared = api.epistemicDeclare({ title: 'Is the new intake form actually being used by the team?' });
  assert.equal(declared.ok, true, declared.error);
  const row = store.state.epistemicUnknowns.find((item) => item.id === declared.id);
  assert.equal(row.ownerSeatId, 'mgr1', 'a declared unknown is written at the seat that declared it');
  assert.equal(row.origin, 'declared', 'a declared unknown is never conflated with a harvested one');
});

test('the brief is identity-free, the CSV carries no identifier, and a refused rate exports BLANK', () => {
  assert.equal(CSV_EXPORTS.length, 102);
  const scope = CSV_EXPORTS.find((row) => row.key === 'epistemic');
  assert.ok(scope, 'CSV scope #99 is registered');
  assert.match(scope.description, /NO unknown id/);

  const state = tree({
    state: {
      cases: [{
        id: 'case-secret-991', title: 'Billing backlog', kind: 'risk', status: 'open', ownerId: 'lead1',
        openedOn: '2026-09-01', fmea: { severity: 8 },
      }],
    },
  });
  const report = buildEpistemicReport(state, { now: NOW, settings: state.settings });
  const rows = epistemicCsvRows(report);
  const text = JSON.stringify(rows);
  assert.ok(!text.includes('Billing backlog'), 'no title is exported');
  assert.ok(!text.includes('case-secret-991'), 'no record id is exported');
  assert.ok(!text.includes('lead1'), 'no person or span id is exported');
  const calibration = rows.find((row) => row.row_kind === 'calibration');
  assert.equal(calibration.kappa, '', 'a refused kappa is BLANK, never zero');
  assert.equal(calibration.suppressed, 'refused');

  const brief = harness(state).api.epistemicBriefText();
  assert.equal(brief.ok, true);
  assert.ok(!brief.text.includes('Billing backlog'));
  assert.match(brief.text, /No person is named|No person is rated/i);

  // The full export path runs through the registered scope.
  const exported = exportWorkspaceCsv(state, 'epistemic', { now: NOW });
  assert.ok(exported.ok, exported.error);
  assert.ok(exported.rowCount > 0);
});

test('the disclosure manifest declares the adapter, the class and the detail ceiling', () => {
  const manifest = manifestFor('epistemic');
  assert.ok(manifest);
  assert.equal(manifest.adapterScoped, true);
  assert.equal(manifest.classKey, 'unit');
  assert.equal(manifest.detailCeiling, 5);
  assert.deepEqual([...manifest.collections], ['epistemicUnknowns', 'epistemicObservations', 'epistemicGrades', 'epistemicMarkers']);
});

/* ---------------------------------------------------------------- graph */

test('the unknown is exhaustive with the link registry: one type, one collection, one resolver', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('unknown'));
  assert.equal(LINK_ENTITY_COLLECTIONS.unknown, 'epistemicUnknowns');
  assert.equal(new Set(LINK_ENTITY_TYPES).size, LINK_ENTITY_TYPES.length, 'no type is declared twice');
});

test('the spine registers the rule before the Operating Seat and with a 1:1 contract', () => {
  const index = DEFAULT_POST_COMMIT_RULES.indexOf(epistemicRule);
  assert.ok(index > 0, 'the rule is on the shared spine');
  assert.ok(PROPAGATION_CONTRACTS.some((entry) => entry.rule === epistemicRule));
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, 'one contract per rule');
  const seatIndex = DEFAULT_POST_COMMIT_RULES.findIndex((rule) => rule.name === 'seatRule');
  assert.ok(index < seatIndex, 'it runs before the Operating Seat, so its unknowns roll up in the same transaction');
});

/* ------------------------------------------------------------------- DOM */

test('the six panels render axe-clean', async () => {
  const state = tree({
    state: {
      cases: [{
        id: 'case1', title: 'Billing backlog', kind: 'risk', status: 'open', ownerId: 'lead1',
        openedOn: '2026-09-01', fmea: { severity: 8 },
      }],
      epistemicObservations: [],
    },
  });
  const { store, api } = harness(state);
  const host = document.getElementById('view');
  for (const panel of ['desk', 'unknowns', 'calibration', 'blind', 'rollup', 'method']) {
    host.replaceChildren();
    host.append(renderEpistemic({
      api,
      state: store.state,
      now: NOW,
      query: new URLSearchParams(`panel=${panel}`),
      navigate() {},
      refresh() {},
    }));
    const results = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(results.violations.length, 0, `${panel}: ${results.violations.map((v) => v.id).join(', ')}`);
  }
});

test('an empty workspace renders the empty state and offers the harvest', () => {
  const state = tree();
  const { store, api } = harness(state);
  const node = renderEpistemic({
    api,
    state: store.state,
    now: NOW,
    query: new URLSearchParams('panel=unknowns'),
    navigate() {},
    refresh() {},
  });
  const text = node.textContent;
  assert.match(text, /Nothing unread, nothing declared/);
  assert.match(text, /Run the harvest now/);
});

/* --------------------------------------- ADR-0117: the bounded backlog */

test('the bounded backlog policy opens one weekly batch per span and PRINTS the deferred remainder', async () => {
  const state = tree({
    state: {
      cases: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        id: `case${n}`, title: `Risk ${n}`, kind: 'risk', status: 'open', ownerId: 'lead1',
        openedOn: `2026-0${n}-01`, fmea: { severity: 7, probability: 5, detectability: 4 },
      })),
      settings: { ...tree().settings, epistemicEscalateMaxPerWeek: 3 },
    },
  });
  const { store, api } = harness(state);
  assert.equal(api.setActiveSeat('mgr1').ok, true);
  const first = store.state;

  // The weekly budget binds — not the per-invocation pile, not the ledger size.
  // (Attribution is ADR-0103's: work named to lead1 is owned at the span that
  // manages them — the same `responsibleNodeId` the Command Chain uses — so
  // this queue is the MANAGING span's inbox, which is a frontline lead's own
  // span whenever the lead actually holds a team, as in a real roster.)
  const opened = first.decisions.filter((row) => /^Unread danger signal/.test(row.title));
  assert.equal(opened.length, 3, 'one span opens its declared weekly budget of 3 and no more');
  const markers = first.epistemicMarkers.filter((marker) => marker.kind === 'escalate');
  assert.equal(markers.length, 3, 'one escalation marker per opened decision');
  assert.ok(markers.every((marker) => marker.ownerSeatId === 'mgr1' && marker.weekKey === '2026-11-02'),
    'each marker books the owning span and the ISO week it counted against');

  // Oldest condition first: the January–March cases open; the newer five queue.
  const unknownById = new Map(first.epistemicUnknowns.map((row) => [row.id, row]));
  const openedSources = markers.map((marker) => unknownById.get(marker.unknownId)?.sourceId).sort();
  assert.deepEqual(openedSources, ['case1', 'case2', 'case3'], 'the longest-waiting debt is bought back first');

  // The remainder is deferred and PRINTED — a queue with a renewal week, not a silence.
  const report = buildEpistemicReport(first, { now: NOW, settings: first.settings });
  assert.equal(report.backlog.capN, 3);
  assert.equal(report.backlog.openedN, 3);
  assert.equal(report.backlog.eligibleN, 5, 'the five over-budget rows are exactly what still waits');
  assert.equal(report.backlog.deferredN, 5);
  assert.equal(report.backlog.weekKey, '2026-11-02');
  assert.equal(report.backlog.nextWeekKey, '2026-11-09');
  const lead1Row = report.backlog.rows.find((row) => row.seatKey === 'mgr1');
  assert.ok(lead1Row, 'the span that owns the queue is named in its own reading');
  assert.equal(lead1Row.deferredN, 5);
  assert.equal(lead1Row.remainingN, 0);
  assert.equal(report.ledger.filter((row) => row.deferred).length, 5, 'the queued rows are flagged on the ledger');

  const brief = epistemicBriefText(report);
  assert.match(brief.text, /5 escalation\(s\) deferred/);
  assert.match(brief.text, /re-opening in the week of 2026-11-09/);
  assert.ok(!/case\d|epm-|lead1|mgr1/.test(brief.text), 'the brief names no id and no person');

  // A repeat scan in the same week opens nothing more and logs the deferral once.
  const snapshot = (s) => JSON.stringify({
    decisions: s.decisions.length, markers: s.epistemicMarkers.length,
    unknowns: s.epistemicUnknowns.length, links: s.links.length,
  });
  const before = snapshot(first);
  assert.equal(api.epistemicScan().ok, true);
  assert.equal(snapshot(store.state), before, 'the bounded scan is idempotent: the queue is not "changed work"');
  assert.equal(store.state.epistemicMarkers.filter((marker) => marker.kind === 'escalate-deferred').length, 1,
    'one dated deferral marker per span per week, not one per pass');

  // The Desk prints the queue and the Unknowns rows carry it — both axe-clean.
  const host = document.getElementById('view');
  for (const panel of ['desk', 'unknowns']) {
    host.replaceChildren();
    host.append(renderEpistemic({
      api, state: store.state, now: NOW,
      query: new URLSearchParams(`panel=${panel}`),
      navigate() {}, refresh() {},
    }));
    if (panel === 'desk') assert.match(host.textContent, /Escalations deferred by the weekly budget/);
    if (panel === 'unknowns') assert.match(host.textContent, /deferred to next week/);
    const results = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(results.violations.length, 0, `${panel}: ${results.violations.map((v) => v.id).join(', ')}`);
  }
});

test('the weekly quota renews oldest-debt-first and never starves a second span', () => {
  const tick = { at: NOW };
  const caseRow = (n, owner, day) => ({
    id: `case${n}`, title: `Risk ${n}`, kind: 'risk', status: 'open', ownerId: owner,
    openedOn: `2026-01-0${day}`, fmea: { severity: 7, probability: 5, detectability: 4 },
  });
  const state = tree({
    state: {
      cases: [
        caseRow(1, 'lead1', 1), caseRow(2, 'lead1', 2), caseRow(3, 'lead1', 3), caseRow(4, 'lead1', 4),
        caseRow(5, 'dir1', 5), caseRow(6, 'dir1', 6),
      ],
      settings: { ...tree().settings, epistemicEscalateMaxPerWeek: 3 },
    },
  });
  const { store, api } = harness(state, () => tick.at);
  assert.equal(api.setActiveSeat('vp1').ok, true);

  // Week one: each span spends its OWN budget. A full inbox at one span never
  // starves a sibling span inside the same transaction. (Cases named to lead1
  // are owned at mgr1's span; cases named to dir1 at vp1's — ADR-0103.)
  let report = buildEpistemicReport(store.state, { now: tick.at, settings: store.state.settings });
  const lead1 = report.backlog.rows.find((row) => row.seatKey === 'mgr1');
  const dir1 = report.backlog.rows.find((row) => row.seatKey === 'vp1');
  assert.ok(lead1 && dir1, 'both owning spans appear in the VP reading');
  assert.equal(lead1.openedN, 3);
  assert.equal(lead1.deferredN, 1);
  assert.equal(dir1.openedN, 2);
  assert.equal(dir1.deferredN, 0, 'a second span keeps its own quota');

  // Week two: the quota renews and the queued debt is bought back, oldest first.
  tick.at = new Date('2026-11-09T12:00:00.000Z');
  assert.equal(api.epistemicScan().ok, true);
  const escalations = store.state.decisions.filter((row) => /^Unread danger signal/.test(row.title));
  assert.equal(escalations.length, 6, 'the deferred escalation opened when the week renewed, and only then');
  report = buildEpistemicReport(store.state, { now: tick.at, settings: store.state.settings });
  assert.equal(report.backlog.deferredN, 0);
  assert.equal(report.backlog.weekKey, '2026-11-09');
  assert.equal(store.state.epistemicMarkers.filter((marker) => marker.kind === 'escalate-deferred').length, 1,
    'week two deferred nothing, so it logged nothing');
});
