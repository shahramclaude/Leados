/**
 * tests/app/vroom-yetton.test.mjs — Vroom–Yetton–Jago Decision-Participation
 * Selector (ADR-0230, Schema v183, `RULE-VY-01`, CSV scope #171).
 *
 * 22 tests: schema, reader, tree logic, actions, rights, CSV, rule.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  COLLECTIONS,
  MIGRATIONS,
  normalizeState,
} from '../../app/core/schema.js';
import {
  createStore,
  STORAGE_KEY,
} from '../../app/core/store.js';
import {
  createApi,
} from '../../app/actions.js';

import {
  buildVroomYetton,
  vyAttentionCount,
  vyCsvRows,
} from '../../app/core/domain/vy.js';
import {
  VY_QUESTIONS,
  VY_STYLES,
  VY_TREE_VARIANTS,
  VY_STYLE_KEYS,
  VY_TREE_KEYS,
  VY_PER_LINE_KEYS,
  VY_SOLO_DIAGNOSTICS,
  VY_RIGHTS,
  VY_LIMITS as L,
  vyRecommendStyle,
  vyTimeDrivenTree,
  vyDevelopmentDrivenTree,
  vyCombinePerLineAnswers,
  vyDecidesAlone,
  vyQuestion,
  vyStyle,
  vyVerdict,
} from '../../app/core/domain/vyRegistry.js';
import {
  normalizeVyDecisions,
  normalizeVyAnswers,
  normalizeVyStyleRecords,
  normalizeVyMarkers,
} from '../../app/core/domain/vySchema.js';
import { vyRule } from '../../app/core/domain/vyRules.js';

const BASIS = 'Choosing how much to involve the team in the build-vs-buy call for the billing engine — the commitment of two lines is at stake.';
const SEED_NOW = '2026-11-16';

/* ---------------------------------------------------------------- harness */

function seed() {
  let currentNow = new Date(SEED_NOW + 'T09:00:00.000Z');
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const iso = '2026-01-01T09:00:00.000Z';
  const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
  const raw = { schemaVersion: SCHEMA_VERSION, settings: {}, people: [], cases: [], riskAppetiteStatements: [] };
  raw.settings.chainLeaderAltitude = 'chief';
  raw.settings.activeSeatId = 'dan';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dan', 'Dan Director', 'director', 'ceo'),
    person('mia', 'Mia HomeMgr', 'manager', 'dan'),
    person('kai', 'Kai ProjMgr', 'manager', 'dan'),
    person('ivo', 'Ivo Lead', 'lead', 'mia'),
    person('ada', 'Ada Tech', 'ic', 'ivo'),
    person('zoe', 'Zoe PeerDir', 'director', 'ceo'),
    person('ben', 'Ben PeerMgr', 'manager', 'zoe'),
  ];
  raw.reportingLines = [
    { id: 'rl-ivo-home', personId: 'ivo', managerId: 'dan', kind: 'functional', shareH: 60, rights: ['coaching'], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '' },
    { id: 'rl-ivo-proj', personId: 'ivo', managerId: 'dan', kind: 'project', shareH: 40, rights: ['tasking'], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '' },
  ];
  const normalized = normalizeState(raw, { now: clock() }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => { values.set(k, String(v)); },
    removeItem: (k) => { values.delete(k); },
  };
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = createApi(store, { now: clock, idFactory });
  return {
    store,
    api,
    setDay(day) { currentNow = new Date(day + 'T09:00:00.000Z'); },
    now: () => currentNow,
    sit(seatId) {
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), activeSeatId: seatId };
      }, { type: 'seat.declared', entity: 'settings', entityId: seatId || 'leader', summary: 'seat switch' });
    },
  };
}

function declareDecision(env, over = {}) {
  const res = env.api.declareVyDecision({
    title: 'Build or buy the billing engine',
    question: 'Should the firm build the billing engine in-house or buy a licence?',
    treeVariant: 'time-driven',
    lineIds: ['rl-ivo-home'],
    reason: BASIS,
    seatId: 'dan',
    seatRank: 3,
    seatLineIds: ['rl-ivo-home'],
    ...over,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.decision;
}

const DECL = (over = {}) => ({
  title: 'Build or buy the billing engine',
  question: 'Should the firm build the billing engine in-house or buy a licence?',
  treeVariant: 'time-driven',
  lineIds: ['rl-ivo-home'],
  reason: BASIS,
  ...over,
});

/* =====================================================================
 * 1. SCHEMA — additive, empty, stable across a reload
 */

test('vy: schema v184 with four EMPTY vy ledgers and nothing inferred', () => {
  // Session ADR-0231 raised the schema to v184; the vy ledgers are still the
  // collections THIS ADR added, and the 182→183 step is still where they appear.
  assert.equal(SCHEMA_VERSION, 184);
  for (const key of ['vyDecisions', 'vyAnswers', 'vyStyleRecords', 'vyMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is a declared collection`);
  }
  const v182 = { schemaVersion: 182, settings: {}, people: [], sourcingCases: [] };
  const step = MIGRATIONS[182](v182);
  assert.equal(step.schemaVersion, 183);
  assert.deepEqual(step.vyDecisions, [], 'no decision is inferred on upgrade');
  assert.deepEqual(step.vyAnswers, [], 'no diagnostic answer is inferred on upgrade');
  assert.deepEqual(step.vyStyleRecords, [], 'no style is inferred on upgrade');
  assert.deepEqual(step.vyMarkers, [], 'no observation is manufactured');
  assert.equal(step.settings.vyAutoPropagate, true, 'the pause switch defaults ON');
});

/* =====================================================================
 * 2. TREE LOGIC — seven diagnostics to one of five styles
 */

test('vy: time-driven tree walks diagnostics in order', () => {
  // Quality not critical → A1
  assert.equal(vyTimeDrivenTree({ q1: false, q2: true, q3: true, q4: true, q5: true, q6: true, q7: false }), 'A1');
  // Quality critical, commitment not needed → A1
  assert.equal(vyTimeDrivenTree({ q1: true, q2: false, q3: true, q4: true, q5: true, q6: true, q7: false }), 'A1');
  // Leader has info → A2
  assert.equal(vyTimeDrivenTree({ q1: true, q2: true, q3: true, q4: false, q5: false, q6: false, q7: false }), 'A2');
  // Problem structured → A2
  assert.equal(vyTimeDrivenTree({ q1: true, q2: true, q3: false, q4: true, q5: false, q6: false, q7: false }), 'A2');
  // Would commit alone → A2
  assert.equal(vyTimeDrivenTree({ q1: true, q2: true, q3: false, q4: false, q5: true, q6: false, q7: false }), 'A2');
  // Goals shared, no conflict → C2
  assert.equal(vyTimeDrivenTree({ q1: true, q2: true, q3: false, q4: false, q5: false, q6: true, q7: false }), 'C2');
  // Conflict likely, goals shared → C1
  assert.equal(vyTimeDrivenTree({ q1: true, q2: true, q3: false, q4: false, q5: false, q6: false, q7: true }), 'C1');
});

test('vy: development-driven tree walks diagnostics in order', () => {
  // Quality not critical → A1
  assert.equal(vyDevelopmentDrivenTree({ q1: false, q2: true, q3: true, q4: true, q5: true, q6: true, q7: false }), 'A1');
  // Commitment not needed → A1
  assert.equal(vyDevelopmentDrivenTree({ q1: true, q2: false, q3: true, q4: true, q5: true, q6: true, q7: false }), 'A1');
  // Leader has info → A2
  assert.equal(vyDevelopmentDrivenTree({ q1: true, q2: true, q3: true, q4: true, q5: true, q6: true, q7: false }), 'A2');
  // Problem not structured → C1
  assert.equal(vyDevelopmentDrivenTree({ q1: true, q2: true, q3: false, q4: false, q5: true, q6: true, q7: false }), 'C1');
  // Would commit alone → C1
  assert.equal(vyDevelopmentDrivenTree({ q1: true, q2: true, q3: false, q4: true, q5: true, q6: true, q7: false }), 'C1');
  // Goals shared, no conflict → C2
  assert.equal(vyDevelopmentDrivenTree({ q1: true, q2: true, q3: false, q4: true, q5: false, q6: true, q7: false }), 'C2');
  // Conflict likely, goals NOT shared → G2 (q6=false so q7 matters)
  assert.equal(vyDevelopmentDrivenTree({ q1: true, q2: true, q3: false, q4: true, q5: false, q6: false, q7: true }), 'G2');
});

test('vy: recommends style per tree variant', () => {
  const answers = { q1: true, q2: true, q3: false, q4: false, q5: false, q6: false, q7: true };
  assert.equal(vyRecommendStyle('time-driven', answers), 'C1');
  const answersDev = { q1: true, q2: true, q3: false, q4: true, q5: false, q6: false, q7: true };
  assert.equal(vyRecommendStyle('development-driven', answersDev), 'G2');
});

test('vy: decides-alone styles are A1 and A2', () => {
  assert.equal(vyDecidesAlone('A1'), true);
  assert.equal(vyDecidesAlone('A2'), true);
  assert.equal(vyDecidesAlone('C1'), false);
  assert.equal(vyDecidesAlone('C2'), false);
  assert.equal(vyDecidesAlone('G2'), false);
});

/* =====================================================================
 * 3. PER-LINE COMBINATION — OR for per-line, AND for solo
 */

test('vy: per-line answers are OR-combined; solo require agreement', () => {
  const byLine = {
    'line-1': { q1: true, q2: true, q3: true, q4: true, q5: false, q6: false, q7: false },
    'line-2': { q2: true, q5: true, q6: false, q7: true },
  };
  const combined = vyCombinePerLineAnswers(byLine);
  // Solo: q1,q3,q4 require agreement — line-2 doesn't have them, so they stay true from line-1
  assert.equal(combined.q1, true);
  assert.equal(combined.q3, true);
  assert.equal(combined.q4, true);
  // Per-line: OR — q2 is true on both → true; q5 is true on line-2 → true; q6 false on both → false; q7 true on line-2 → true
  assert.equal(combined.q2, true);
  assert.equal(combined.q5, true);
  assert.equal(combined.q6, false);
  assert.equal(combined.q7, true);
});

test('vy: solo diagnostics require agreement — any no wins', () => {
  const byLine = {
    'line-1': { q1: true, q3: true, q4: true },
    'line-2': { q1: false, q3: true, q4: true },
  };
  const combined = vyCombinePerLineAnswers(byLine);
  assert.equal(combined.q1, false, 'any line says no → combined is no');
  assert.equal(combined.q3, true);
  assert.equal(combined.q4, true);
});

/* =====================================================================
 * 4. READER — buildVroomYetton
 */

test('vy: reader returns counts, rows and verdicts', () => {
  const env = seed();
  const d = declareDecision(env);
  // No answers yet → decision-owed
  const report = buildVroomYetton(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(report.ok, true);
  assert.equal(report.counts.total, 1);
  assert.equal(report.counts.decisionOwed, 1);
  assert.equal(report.rows[0].verdict.key, 'decision-owed');
  assert.equal(report.rows[0].state, 'declared');
});

test('vy: after answers are recorded, state is answered and recommendation appears', () => {
  const env = seed();
  const d = declareDecision(env);
  // Solo diagnostics (q1, q3, q4) — no line
  const res1 = env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: false, q4: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res1.ok, true, JSON.stringify(res1));
  // Per-line diagnostics (q2, q5, q6, q7) — under a line
  const res2 = env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res2.ok, true, JSON.stringify(res2));

  const report = buildVroomYetton(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const row = report.rows[0];
  assert.equal(row.state, 'answered');
  assert.equal(row.verdict.key, 'decision-owed');
  // q1=true,q2=true,q3=false,q4=false,q5=true → time-driven tree returns A2
  assert.equal(row.recommended['time-driven'], 'A2');
});

test('vy: after style is selected, verdict is selected', () => {
  const env = seed();
  const d = declareDecision(env);
  // dan records both solo and per-line diagnostics, then selects
  env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: false, q4: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });

  const res = env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'A2', recommendedStyle: 'A2', seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res.ok, true, JSON.stringify(res));

  const report = buildVroomYetton(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(report.rows[0].verdict.key, 'selected');
  assert.equal(report.counts.selected, 1);
  assert.equal(report.counts.decisionOwed, 0);
});

test('vy: override requires a written reason', () => {
  const env = seed();
  const d = declareDecision(env);
  env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: false, q4: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });

  const res = env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'G2', recommendedStyle: 'A2', overrideReason: '', seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res.ok, false);
  assert.equal(res.field, 'overrideReason');

  const res2 = env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'G2', recommendedStyle: 'A2', overrideReason: 'The decision is urgent and the team is dispersed.', seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res2.ok, true, JSON.stringify(res2));
  assert.equal(reportRows(env).verdict.key, 'selected-override');
});

function reportRows(env) {
  const report = buildVroomYetton(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  return report.rows[0];
}

test('vy: grade the commitment outcome', () => {
  const env = seed();
  env.sit('dan');
  const d = declareDecision(env);
  env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: false, q4: false });
  env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false });
  env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'A2', recommendedStyle: 'A2' });

  // Grade as ceo (rank 5, not the selector)
  env.sit('ceo');
  const res = env.api.recordVyCommitmentOutcome({ decisionId: d.id, commitmentMaterialised: true, lesson: 'The team committed and the build launched on time.' });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.styleRecord.commitmentMaterialised, true);
});

test('vy: selector cannot grade their own selection', () => {
  const env = seed();
  env.sit('dan');
  const d = declareDecision(env);
  env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: false, q4: false });
  env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false });
  env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'A2', recommendedStyle: 'A2' });

  // Dan (the selector) tries to grade — rank 3 but is the selector
  const res = env.api.recordVyCommitmentOutcome({ decisionId: d.id, commitmentMaterialised: true, lesson: 'The team committed and the build launched on time, just as predicted.' });
  assert.equal(res.ok, false);
  assert.equal(res.field, 'seatId');
});

test('vy: frontline cannot select (rank 1-2)', () => {
  const env = seed();
  env.sit('dan');
  const d = declareDecision(env);
  env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: false, q4: false });
  env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false });
  env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'A2', recommendedStyle: 'A2' });

  // Now ivo (rank 1) tries to select — refused by rank
  env.sit('ivo');
  const res = env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'A2', recommendedStyle: 'A2' });
  assert.equal(res.ok, false);
});

/* =====================================================================
 * 5. DECIDE-ALONE UNAVAILABLE WHEN ANOTHER LINE ANSWERS
 */

test('vy: decide-alone unavailable when another seat has answered on a line', () => {
  const env = seed();
  env.sit('dan');
  const d = declareDecision(env, { lineIds: ['rl-ivo-home', 'rl-ivo-proj'] });

  // Dan answers per-line diagnostics on rl-ivo-home (only per-line keys: q2, q5, q6, q7)
  const res1 = env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q2: true, q5: true, q6: true, q7: false });
  assert.equal(res1.ok, true, JSON.stringify(res1));
  // Solo diagnostics once
  const res2 = env.api.recordVyAnswers({ decisionId: d.id, q1: true, q3: true, q4: true });
  assert.equal(res2.ok, true, JSON.stringify(res2));

  // Manually inject an answer from a different seat on rl-ivo-proj to simulate another line answering
  env.store.update((draft) => {
    draft.vyAnswers = [...(draft.vyAnswers || []), {
      id: 'vy-answer-cross', decisionId: d.id, answeredById: 'zoe', answeredOn: env.now(),
      lineId: 'rl-ivo-proj', answers: { q2: true, q5: true, q6: true, q7: true },
    }];
  }, { type: 'test.inject', entity: 'vyAnswer', entityId: 'vy-answer-cross', summary: 'cross-line answer' });

  // Dan tries to select A1 (decide alone) — should be refused because zoe answered on rl-ivo-proj
  const res = env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'A1', recommendedStyle: 'C1', overrideReason: 'I need to decide quickly.' });
  assert.equal(res.ok, false);
  assert.equal(res.field, 'chosenStyle');

  // C1 should be fine (override from A2 recommendation, with a reason)
  const res3 = env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'C1', recommendedStyle: 'C1', overrideReason: 'The team needs to be consulted because the change spans two reporting lines.' });
  assert.equal(res3.ok, true, JSON.stringify(res3));
});

/* =====================================================================
 * 6. WITHDRAWAL IS FINAL
 */

test('vy: withdrawal is final and closes the question', () => {
  const env = seed();
  const d = declareDecision(env);
  const res = env.api.withdrawVyDecision({ decisionId: d.id, reason: 'The decision was made by another forum.', seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(res.decision.withdrawnOn);

  // Cannot withdraw again
  const res2 = env.api.withdrawVyDecision({ decisionId: d.id, reason: '...', seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  assert.equal(res2.ok, false);
});

/* =====================================================================
 * 7. CSV #171 — identity-free
 */

test('vy: CSV rows are identity-free and reconcile with the reader', () => {
  const env = seed();
  const d = declareDecision(env);
  env.api.recordVyAnswers({ decisionId: d.id, q1: true, q2: true, q3: false, q4: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  env.api.recordVyAnswers({ decisionId: d.id, lineId: 'rl-ivo-home', q5: true, q6: true, q7: false, seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });
  env.api.selectVyStyle({ decisionId: d.id, chosenStyle: 'C2', recommendedStyle: 'C2', seatId: 'dan', seatRank: 3, seatLineIds: ['rl-ivo-home'] });

  const report = buildVroomYetton(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  const rows = vyCsvRows(report);
  const summary = rows.find((r) => r.row_kind === 'summary');
  assert.ok(summary);
  assert.equal(summary.decisions_n, report.counts.total);
  assert.equal(summary.selected_n, report.counts.selected);
  assert.equal(summary.style_c2_n, report.counts.byStyle?.c2 || 0);

  // No identity crosses the boundary
  const flat = JSON.stringify(rows);
  assert.equal(flat.includes('Billing engine'), false);
  assert.equal(flat.includes('dan'), false);
  assert.equal(flat.includes('rl-ivo-home'), false);
});

/* =====================================================================
 * 8. RULE — on the spine, pause-governed, idempotent
 */

test('vy: rule files asks and is pause-governed', () => {
  const env = seed();
  const d = declareDecision(env);

  // Active: files decision.owed ask to the declaring seat
  const draft = JSON.parse(JSON.stringify(env.store.state));
  const result = vyRule(draft, { event: { type: 'vroom-yetton.decision.declared', decisionId: d.id }, now: env.now(), idFactory: (p) => `${p}-1`, settings: env.store.state.settings });
  assert.equal(result.ok, true);
  const owedAsk = result.asks.find((a) => a.kind === 'decision.owed');
  assert.ok(owedAsk, 'decision.owed ask filed');
  assert.equal(owedAsk.addresseeId, d.declaredById, 'ask addressed to the declaring seat');

  // Paused: no asks
  const paused = { ...env.store.state.settings, vyAutoPropagate: false };
  const result2 = vyRule(draft, { event: { type: 'vroom-yetton.decision.declared', decisionId: d.id }, now: env.now(), idFactory: (p) => `${p}-2`, settings: paused });
  assert.equal(result2.ok, true);
  assert.equal(result2.asks.length, 0, 'paused rule files no asks');
});

test('vy: rule is idempotent per signature', () => {
  const env = seed();
  const d = declareDecision(env);
  let seq = 0;

  const draft = JSON.parse(JSON.stringify(env.store.state));
  const r1 = vyRule(draft, { event: { type: 'vroom-yetton.scan' }, now: env.now(), idFactory: (p) => `vy-ask-${++seq}`, settings: env.store.state.settings });
  const r2 = vyRule(draft, { event: { type: 'vroom-yetton.scan' }, now: env.now(), idFactory: (p) => `vy-ask-${++seq}`, settings: env.store.state.settings });
  // Second scan files no second ask
  assert.equal(r2.asks.length, 0, 'a second scan files no second ask');
});

/* =====================================================================
 * 9. ATTENTION COUNT
 */

test('vy: attention count reflects decisions owed', () => {
  const env = seed();
  declareDecision(env);
  const count = vyAttentionCount(env.store.state, { now: env.now(), settings: env.store.state.settings, seat: null });
  assert.equal(count.count, 1, 'one decision owed a style selection');
});
