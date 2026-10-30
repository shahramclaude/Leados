/**
 * tests/app/stakeholders.test.mjs — Stakeholder Influence Register (Schema v25)
 *
 * Covers the four-lens political engine and its event-driven wiring:
 *   1. Mitchell-Agle-Wood salience classes (7 classes, confidence adjustment)
 *   2. Mendelow power × interest quadrants (reused canonical classifier)
 *   3. Tsebelis veto math: per-player ≤25 points, cohesion +5/+8, three bands
 *   4. Coalition network: union-find blocs, directional edges, hidden influencers
 *   5. Strict register reconciliation (exact name/person match, never guessed)
 *   6. Rollup attention queue and empty-workspace safety
 *   7. Normalizer repairs and the additive v24 → v25 migration
 *   8. Actions CRUD + cross-module propagation (RULE-STK-01/02/03), idempotency,
 *      cadence-driven contact proposals, archive/delete cascades, dry-run preview
 *   9. CSV 32-column export and contextual-integrity redaction
 *  10. Point-in-time rewind fidelity and clearDemo demo/user separation
 *  11. JSDOM + axe-core UI workflow across the register, matrix, network,
 *      dossier and dialogs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState,
  migrate,
  normalizeState,
  SCHEMA_VERSION,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  SALIENCE_CLASSES,
  VETO_BANDS,
  CADENCE_DAYS,
  classifySalience,
  analyzeInitiativeVetoRisk,
  buildCoalitionNetwork,
  reconciliationReport,
  stakeholdersRollup,
  summarizeStakeholder,
  vetoRiskOverview,
  classifyStanceShift,
  matchRegisterStakeholder,
} from '../../app/core/domain/stakeholders.js';
import { classifyMendelowStakeholder } from '../../app/core/domain/cases.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { reconstructStateAt } from '../../app/core/domain/health.js';
import { buildDemoState } from '../../app/core/demo.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-26T10:00:00.000Z');
const TODAY = '2026-10-26';

/* ------------------------------------------------------------- test harness */

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function harness(storage = kvStorage(), now = NOW) {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-s25-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
}

function demoHarness(now = NOW) {
  const storage = kvStorage();
  let seq = 1000;
  const idFactory = (prefix) => `${prefix}-s25-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  storage.setItem(STORAGE_KEY, JSON.stringify(buildDemoState(now)));
  store.load();
  return { store, api: createApi(store, { now: () => now, idFactory }), storage };
}

/* ============================================================ 1. salience */

test('salience: all seven Mitchell-Agle-Wood classes from the three attributes', () => {
  const high = { power: 5, legitimacy: 5, urgency: 5 };
  assert.equal(classifySalience(high).salienceClass, 'definitive');
  assert.equal(classifySalience({ power: 5, legitimacy: 5, urgency: 1 }).salienceClass, 'dominant');
  assert.equal(classifySalience({ power: 5, legitimacy: 1, urgency: 5 }).salienceClass, 'dangerous');
  assert.equal(classifySalience({ power: 1, legitimacy: 5, urgency: 5 }).salienceClass, 'dependent');
  assert.equal(classifySalience({ power: 5, legitimacy: 1, urgency: 1 }).salienceClass, 'dormant');
  assert.equal(classifySalience({ power: 1, legitimacy: 5, urgency: 1 }).salienceClass, 'discretionary');
  assert.equal(classifySalience({ power: 1, legitimacy: 1, urgency: 5 }).salienceClass, 'demanding');
  assert.equal(classifySalience({ power: 1, legitimacy: 1, urgency: 1 }).salienceClass, 'minimal');

  // Threshold is rating >= 4: a 3/3/3 record possesses no attribute.
  assert.equal(classifySalience({ power: 3, legitimacy: 3, urgency: 3 }).salienceClass, 'minimal');
  assert.equal(classifySalience({ power: 4, legitimacy: 3, urgency: 3 }).salienceClass, 'dormant');
});

test('salience: raw score /15 and evidence-adjusted score follow confidence factors', () => {
  const ratings = { power: 5, legitimacy: 4, urgency: 3, estimateConfidence: 'high' };
  const r = classifySalience(ratings);
  assert.equal(r.salienceScore, 12);
  assert.equal(r.expectedSalienceScore, 12); // high confidence factor = 1

  const medium = classifySalience({ ...ratings, estimateConfidence: 'medium' });
  assert.equal(medium.expectedSalienceScore, Math.round(12 * 0.85 * 10) / 10); // 10.2
  const low = classifySalience({ ...ratings, estimateConfidence: 'low' });
  assert.equal(low.expectedSalienceScore, Math.round(12 * 0.7 * 10) / 10); // 8.4
  // Every class carries human guidance and a subtitle — no dead enum values.
  for (const cls of Object.values(SALIENCE_CLASSES)) {
    assert.ok(cls.guidance.length > 20, `${cls.id} needs guidance text`);
    assert.ok(cls.subtitle.length > 3);
  }
});

/* ============================================================ 2. Mendelow */

test('Mendelow: power × interest thresholds map to the four canonical quadrants', () => {
  assert.equal(classifyMendelowStakeholder({ power: 5, interest: 5 }).quadrant, 'manage-closely');
  assert.equal(classifyMendelowStakeholder({ power: 5, interest: 1 }).quadrant, 'keep-satisfied');
  assert.equal(classifyMendelowStakeholder({ power: 1, interest: 5 }).quadrant, 'keep-informed');
  assert.equal(classifyMendelowStakeholder({ power: 2, interest: 2 }).quadrant, 'monitor');
  // Boundary: rating 3 on both axes already means manage closely.
  assert.equal(classifyMendelowStakeholder({ power: 3, interest: 3 }).quadrant, 'manage-closely');
  const q = classifyMendelowStakeholder({ power: 4, interest: 4 });
  assert.ok(q.quadrantLabel && q.guidance && q.quadrantSubtitle);
});

/* ====================================================== 3. Tsebelis veto math */

test('veto: no recorded players means an open modelled gate, not a zeroed blocker', () => {
  const r = analyzeInitiativeVetoRisk([]);
  assert.equal(r.vetoCount, 0);
  assert.equal(r.opposingVetoCount, 0);
  assert.equal(r.difficulty, 0);
  assert.equal(r.band.id, 'feasible');
});

test('veto: each player contributes at most 25 points from stance distance × power', () => {
  // blocker (ordinal 4), power 5 => (4/4) × (5/5) × 25 = 25
  const blocker = analyzeInitiativeVetoRisk([
    { id: 'a', name: 'A', vetoPlayer: true, stance: 'blocker', power: 5 },
  ]);
  assert.equal(blocker.contributors[0].points, 25);
  assert.equal(blocker.difficulty, 25);
  assert.equal(blocker.band.id, 'feasible'); // 0–33

  // skeptical (ordinal 3), power 5 => 18.75 → 19
  const skeptical = analyzeInitiativeVetoRisk([
    { id: 'b', name: 'B', vetoPlayer: true, stance: 'skeptical', power: 5 },
  ]);
  assert.equal(skeptical.contributors[0].points, 19);

  // supportive veto player contributes but is not opposing; gate stays open.
  const friendly = analyzeInitiativeVetoRisk([
    { id: 'c', name: 'C', vetoPlayer: true, stance: 'supportive', power: 5 },
  ]);
  assert.equal(friendly.opposingVetoCount, 0);
  assert.equal(friendly.contributors[0].points, 6); // (1/4)×25 = 6.25 → 6
  assert.match(friendly.rationale, /open/i);
});

test('veto: cohesion penalties (+5 spread, +8 unified blocker) and band edges', () => {
  // Two unified blockers at power 5: 25 + 25 + 8 = 58 → contested (34–66).
  const unified = analyzeInitiativeVetoRisk([
    { id: 'a', name: 'A', vetoPlayer: true, stance: 'blocker', power: 5 },
    { id: 'b', name: 'B', vetoPlayer: true, stance: 'blocker', power: 5 },
  ]);
  assert.equal(unified.difficulty, 58);
  assert.equal(unified.band.id, 'contested');
  assert.match(unified.rationale, /\+8/);

  // blocker + skeptical (ordinal spread 1): 25 + 19 + 5 = 49 → contested.
  const cohesive = analyzeInitiativeVetoRisk([
    { id: 'a', name: 'A', vetoPlayer: true, stance: 'blocker', power: 5 },
    { id: 'b', name: 'B', vetoPlayer: true, stance: 'skeptical', power: 5 },
  ]);
  assert.equal(cohesive.difficulty, 49);
  assert.match(cohesive.rationale, /\+5/);

  // Four unified blockers: raw 100 capped at 100 with +8 → blocked band.
  const blocked = analyzeInitiativeVetoRisk([
    { id: 'a', name: 'A', vetoPlayer: true, stance: 'blocker', power: 5 },
    { id: 'b', name: 'B', vetoPlayer: true, stance: 'blocker', power: 5 },
    { id: 'c', name: 'C', vetoPlayer: true, stance: 'blocker', power: 5 },
    { id: 'd', name: 'D', vetoPlayer: true, stance: 'blocker', power: 5 },
  ]);
  assert.equal(blocked.difficulty, 100);
  assert.equal(blocked.band.id, VETO_BANDS.blocked.id);
  assert.equal(VETO_BANDS.feasible.max, 33);
  assert.equal(VETO_BANDS.contested.max, 66);
});

test('veto: low confidence in any contributor downgrades the overall confidence label', () => {
  const r = analyzeInitiativeVetoRisk([
    { id: 'a', name: 'A', vetoPlayer: true, stance: 'blocker', power: 5, estimateConfidence: 'high' },
    { id: 'b', name: 'B', vetoPlayer: true, stance: 'blocker', power: 4, estimateConfidence: 'low' },
  ]);
  assert.equal(r.confidence, 'low');
});

/* ====================================================== 4. coalition network */

function stk(id, overrides = {}) {
  return {
    id,
    name: id,
    status: 'active',
    stance: 'neutral',
    power: 3,
    interest: 3,
    alliances: [],
    ...overrides,
  };
}

test('network: alliance edges form union-find blocs; opposition/influence stay directional', () => {
  const a = stk('a', { alliances: [{ id: 'e1', targetId: 'b', kind: 'alliance', strength: 4 }] });
  const b = stk('b', { alliances: [{ id: 'e2', targetId: 'c', kind: 'alliance', strength: 2 }] });
  const c = stk('c');
  const d = stk('d', { stance: 'blocker', power: 5, alliances: [{ id: 'e3', targetId: 'a', kind: 'opposition', strength: 5 }] });
  const net = buildCoalitionNetwork([a, b, c, d]);
  assert.equal(net.blocs.length, 1);
  assert.deepEqual([...net.blocs[0].memberIds].sort(), ['a', 'b', 'c']);
  // Opposition never unions actors into one bloc.
  assert.equal(net.oppositionPairs.length, 1);
  assert.equal(net.allianceEdges.length, 2);
  // Weighted degree centrality is normalised against (n-1) × 5.
  assert.ok(net.centrality.get('a') > net.centrality.get('c'));
  assert.ok(net.opposingPower >= 5);
});

test('network: bloc leaning comes from power-weighted stance centroid', () => {
  const champion = stk('p1', { stance: 'champion', power: 5, alliances: [{ id: 'x', targetId: 'p2', kind: 'alliance', strength: 3 }] });
  const supporter = stk('p2', { stance: 'supportive', power: 4 });
  const net = buildCoalitionNetwork([champion, supporter]);
  assert.equal(net.blocs[0].leaning, 'supportive');
});

test('network: hidden influencers have low formal power but high out-influence', () => {
  // Weak actor influences two strong targets with strength ≥ 3 each (sum ≥ 6).
  const weak = stk('weak', { power: 2, alliances: [
    { id: 'i1', targetId: 'big1', kind: 'influences', strength: 3 },
    { id: 'i2', targetId: 'big2', kind: 'influences', strength: 4 },
  ] });
  const big1 = stk('big1', { power: 5 });
  const big2 = stk('big2', { power: 5 });
  const net = buildCoalitionNetwork([weak, big1, big2]);
  assert.deepEqual(net.hiddenInfluencers.map((h) => h.id), ['weak']);
  assert.equal(net.influenceEdges.length, 2);
});

test('network: archived actors are excluded from blocs, edges and centrality', () => {
  const a = stk('a', { alliances: [{ id: 'e', targetId: 'gone', kind: 'alliance', strength: 5 }] });
  const gone = stk('gone', { status: 'archived' });
  const net = buildCoalitionNetwork([a, gone]);
  assert.equal(net.blocs.length, 0);
  assert.equal(net.allianceEdges.length, 0);
  assert.equal(net.centrality.has('gone'), false);
});

/* ================================================== 5. strict reconciliation */

test('reconciliation: strict name/person matching; near-misses stay unmapped', () => {
  const state = {
    stakeholders: [
      { id: 'stk-1', name: 'Dana Kowalski', personId: null, status: 'active' },
      { id: 'stk-2', name: 'Priya Natarajan', personId: 'person-1', status: 'active' },
    ],
    changes: [{
      id: 'chg-1',
      status: 'active',
      coalition: [
        { name: 'Dana Kowalski', personId: null, stance: 'skeptical', power: 5, interest: 5 },
        { name: 'Dana Kowalsky', personId: null, stance: 'neutral', power: 4, interest: 4 }, // near-miss, no match
        { name: 'Some Person', personId: 'person-1', stance: 'supportive', power: 3, interest: 3 },
      ],
    }],
    cases: [],
    negotiations: [],
    links: [],
  };
  const report = reconciliationReport(state);
  assert.equal(report.total, 3);
  assert.equal(report.mappedCount, 2); // exact name + person link
  assert.equal(report.unmappedCount, 1);
  assert.equal(report.unmapped[0].name, 'Dana Kowalsky');
  assert.ok(report.coveragePct < 100);
  // The matcher itself never guesses.
  assert.equal(matchRegisterStakeholder(state.stakeholders, { name: 'dana kowalski ' })?.id, 'stk-1');
  assert.equal(matchRegisterStakeholder(state.stakeholders, { name: 'Dana K.' }), null);
});

/* ============================================================ 6. rollup */

test('rollup: empty workspace yields an all-zero queue without throwing', () => {
  const roll = stakeholdersRollup({}, NOW);
  assert.equal(roll.attention.length, 0);
  assert.equal(roll.stats.total, 0);
  assert.equal(roll.stats.vetoPlayers, 0);
  assert.equal(roll.network.blocs.length, 0);
  assert.equal(roll.reconciliation.coveragePct, null);
  assert.equal(roll.register.length, 0);
  assert.equal(roll.vetoOverview.rows.length, 0);
});

test('rollup: demo portfolio produces the calibrated register statistics', () => {
  const { store } = demoHarness();
  const roll = stakeholdersRollup(store.state, NOW);
  assert.equal(roll.stats.total, 12);
  assert.equal(roll.stats.vetoPlayers, 3);
  assert.equal(roll.stats.definitive, 2);
  assert.equal(roll.stats.highSalience, 5);
  assert.equal(roll.stats.adverse, 4);
  assert.equal(roll.stats.blocs, 3);
  assert.equal(roll.reconciliation.mappedCount, 12);
  assert.equal(roll.reconciliation.unmappedCount, 0);
  assert.equal(roll.reconciliation.coveragePct, 100);
  // Dana Kowalski is the one severity-5 attention item (adverse veto gate).
  assert.ok(roll.attention.some((a) => a.record.name === 'Dana Kowalski' && a.severity === 5));
});

test('rollup: veto overview only counts open initiatives and reports the demo gate', () => {
  const { store } = demoHarness();
  const overview = vetoRiskOverview(store.state, NOW);
  assert.equal(overview.rows.length, 1);
  const row = overview.rows[0];
  assert.equal(row.sourceType, 'change');
  assert.equal(row.risk.difficulty, 25);
  assert.equal(row.risk.opposingVetoCount, 1);
  assert.equal(row.risk.band.id, 'feasible');
});

test('rollup: overdue contact on a high-salience actor enters the attention queue', () => {
  const state = {
    ...createEmptyState(NOW.toISOString()),
    stakeholders: [{
      id: 'stk-x', name: 'Urgent Regulator', status: 'active',
      power: 5, legitimacy: 5, urgency: 5, // definitive
      stance: 'neutral', vetoPlayer: false, estimateConfidence: 'high',
      commsCadence: 'weekly', nextContactOn: '2026-10-01', lastContactOn: '2026-09-20',
      alliances: [], stanceHistory: [], contactLog: [], tags: [],
    }],
    links: [],
  };
  const profile = summarizeStakeholder(state.stakeholders[0], state, NOW);
  assert.equal(profile.contactOverdue, true);
  const roll = stakeholdersRollup(state, NOW);
  assert.ok(roll.attention.some((a) => a.code === 'STK-ROLL-CONTACT'));
  assert.equal(roll.stats.overdueContacts, 1);
});

test('stance shift classifier labels adverse vs benign movement', () => {
  assert.equal(classifyStanceShift('supportive', 'blocker').adverse, true);
  assert.equal(classifyStanceShift('neutral', 'skeptical').adverse, true);
  assert.equal(classifyStanceShift('skeptical', 'supportive').adverse, false);
  assert.equal(classifyStanceShift('neutral', 'neutral').adverse, false);
});

/* ================================================ 7. normalizer & migration */

test('normalizer: repairs enums, dates, alliances and contact logs with warnings', () => {
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    people: [{ id: 'person-1', name: 'Real Person', status: 'active' }],
    stakeholders: [{
      id: 'stk-1',
      name: 'Broken Record',
      category: 'made-up',
      status: 'weird',
      stance: 'hostile',
      estimateConfidence: 'sure-ish',
      personId: 'person-gone', // dangling -> cleared
      power: 5, interest: 5, legitimacy: 4, urgency: 2,
      lastContactOn: '2099-01-01', // future -> clamped to today
      nextContactOn: '2020-01-01', // before last contact -> null
      alliances: [
        { targetId: 'stk-2', kind: 'strange', strength: 9 }, // repaired kind + clamped strength
        { targetId: 'stk-1' }, // self link -> dropped
        { targetId: 'ghost' }, // unknown target -> dropped
      ],
      contactLog: [
        { id: 'c1', on: '2026-09-01', note: 'Called them' },
        { on: 'not-a-date', note: 'unparseable' }, // dropped
      ],
      stanceHistory: [
        { on: '2026-09-10', stance: 'blocker', context: 'steering pushback' },
      ],
      tags: ['board'],
    }, {
      id: 'stk-2', name: 'Target', status: 'active', power: 2, interest: 2, legitimacy: 2, urgency: 2,
      alliances: [], stanceHistory: [], contactLog: [], tags: [],
    }],
  };
  const { state, warnings } = normalizeState(raw, { now: NOW });
  const [s1] = state.stakeholders;
  assert.equal(s1.category, 'other');
  assert.equal(s1.status, 'active');
  assert.equal(s1.stance, 'neutral');
  assert.equal(s1.estimateConfidence, 'medium');
  assert.equal(s1.personId, null);
  assert.equal(s1.lastContactOn, TODAY);
  assert.equal(s1.nextContactOn, null);
  assert.equal(s1.alliances.length, 1);
  assert.equal(s1.alliances[0].kind, 'alliance');
  assert.equal(s1.alliances[0].strength, 5);
  assert.equal(s1.alliances[0].targetId, 'stk-2');
  assert.equal(s1.contactLog.length, 1);
  assert.equal(s1.contactLog[0].note, 'Called them');
  assert.equal(s1.stanceHistory[0].stance, 'blocker');
  assert.ok(warnings.some((w) => w.includes('category')));
  assert.ok(warnings.some((w) => w.includes('status')));
  assert.ok(warnings.some((w) => w.includes('stance')));
  assert.ok(warnings.some((w) => w.includes('future last-contact')));
});

test('migration: v24 → v25 is additive and never invents register records', () => {
  const v24 = { schemaVersion: 24, cases: [{ id: 'old-case' }], people: [] };
  const { raw, applied } = migrate(v24);
  assert.deepEqual(applied, ['24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56']);
  assert.equal(raw.schemaVersion, 56);
  assert.deepEqual(raw.stakeholders, []);
  assert.equal(raw.cases[0].id, 'old-case'); // untouched
  // A workspace already carrying stakeholders keeps them.
  const withRecords = migrate({ schemaVersion: 24, stakeholders: [{ id: 'stk-keep' }] });
  assert.equal(withRecords.raw.stakeholders[0].id, 'stk-keep');
});

/* ====================================== 8. actions + cross-module propagation */

test('rules: the register contributes RULE-STK-01..04 to the 41-rule catalogue', () => {
  assert.equal(AUTOMATION_RULES.length, 142, '+ VOI and LCAL calibration rules');
  const ids = AUTOMATION_RULES.map((r) => r.id);
  for (const id of ['RULE-STK-01', 'RULE-STK-02', 'RULE-STK-03', 'RULE-STK-04']) {
    assert.ok(ids.includes(id), `${id} registered`);
  }
});

test('addStakeholder: persists, audits, reconciles involvement and veto decisions', () => {
  const { store, api } = demoHarness();
  const dana = store.state.stakeholders.find((s) => s.name === 'Dana Kowalski');
  // Re-saving an existing adverse veto player drives STK-01 (edge idempotent)
  // and STK-02 (one alignment decision).
  const res = api.updateStakeholder(dana.id, { influenceNotes: 'renewed assessment' });
  assert.equal(res.ok, true);
  const stk02 = store.state.decisions.filter((d) => String(d.question).includes('RULE-STK-02'));
  assert.equal(stk02.length, 1);
  assert.match(stk02[0].title, /Veto alignment/);
  assert.equal(stk02[0].options.length, 3); // redesign / align / escalate
  // A graph edge links the decision to the change.
  assert.ok(store.state.links.some((l) => l.ruleId === 'RULE-STK-02' && l.targetType === 'decision'));
  assert.ok(res.propagations.some((p) => p.ruleId === 'RULE-STK-02'));
  assert.ok(store.state.events.some((e) => String(e.summary).includes('RULE-STK-02')));

  // Idempotent: a second save creates no duplicate decision or involvement edge.
  const edgeCount = store.state.links.filter((l) => l.ruleId === 'RULE-STK-01').length;
  api.updateStakeholder(dana.id, { influenceNotes: 'another note' });
  assert.equal(store.state.decisions.filter((d) => String(d.question).includes('RULE-STK-02')).length, 1);
  assert.equal(store.state.links.filter((l) => l.ruleId === 'RULE-STK-01').length, edgeCount);
});

test('logStakeholderStance: appends history, classifies the shift and fires STK-03 once', () => {
  const { store, api } = demoHarness();
  // Priya is a person-linked, high-salience register stakeholder.
  const priya = store.state.stakeholders.find((s) => s.personId === 'person-demo-1');
  const before = priya.stance;
  const res = api.logStakeholderStance(priya.id, {
    stance: 'blocker',
    on: TODAY,
    context: 'Withdrew support in the steering committee',
  });
  assert.equal(res.ok, true);
  assert.equal(res.adverse, true);
  const updated = store.state.stakeholders.find((s) => s.id === priya.id);
  assert.equal(updated.stance, 'blocker');
  assert.equal(updated.stanceHistory.length, (priya.stanceHistory || []).length + 1);
  // RULE-STK-03 queues a blameless talking point on the roster entry. Re-fetch
  // from the store: updates swap the state object, so a pre-call reference is stale.
  let person = store.state.people.find((p) => p.id === 'person-demo-1');
  assert.ok(person.talkingPoints.some((t) => t.includes('Stakeholder shift') && t.includes(priya.id)));
  assert.ok(store.state.events.some((e) => String(e.summary).includes('RULE-STK-03')));
  assert.notEqual(before, 'blocker');

  // A thaw back to supportive is not adverse and therefore propagates nothing.
  const topicsBefore = person.talkingPoints.length;
  const thaw = api.logStakeholderStance(priya.id, { stance: 'supportive', on: TODAY, context: 'slight thaw' });
  assert.equal(thaw.ok, true);
  assert.equal(thaw.adverse, false);
  assert.equal(thaw.propagations.length, 0);

  // A second adverse wave (supportive → skeptical) refreshes the managed topic
  // in place: the talking-point count never grows beyond one per stakeholder.
  const again = api.logStakeholderStance(priya.id, { stance: 'skeptical', on: TODAY, context: 'renewed concern in exec review' });
  assert.equal(again.ok, true);
  assert.equal(again.adverse, true);
  assert.ok(again.propagations.some((p) => p.ruleId === 'RULE-STK-03'));
  assert.equal(store.state.people.find((p) => p.id === 'person-demo-1').talkingPoints.length, topicsBefore);

  // Invalid stance is rejected, not silently coerced.
  const bad = api.logStakeholderStance(priya.id, { stance: 'furious' });
  assert.equal(bad.ok, false);
});

test('logStakeholderContact: cadence proposes the next date and never overwrites a later plan', () => {
  const { store, api } = harness();
  const created = api.addStakeholder({ name: 'Weekly Auditor', commsCadence: 'weekly' });
  const id = created.id;
  const res = api.logStakeholderContact(id, { on: TODAY, note: 'intro call' });
  assert.equal(res.ok, true);
  // weekly cadence = 7 days.
  const expected = new Date(NOW);
  expected.setUTCDate(expected.getUTCDate() + CADENCE_DAYS.weekly);
  const expectedKey = expected.toISOString().slice(0, 10);
  assert.equal(res.scheduledNextOn, expectedKey);
  let rec = store.state.stakeholders.find((s) => s.id === id);
  assert.equal(rec.nextContactOn, expectedKey);
  assert.equal(rec.lastContactOn, TODAY);
  assert.equal(rec.contactLog.length, 1);

  // A contact logged before the planned next date must not move it backwards.
  const earlier = '2026-10-28';
  const second = api.logStakeholderContact(id, { on: earlier, note: 'quick check-in' });
  assert.equal(second.scheduledNextOn, null);
  rec = store.state.stakeholders.find((s) => s.id === id);
  assert.equal(rec.nextContactOn, expectedKey);
  assert.equal(rec.contactLog.length, 2);

  // Immediate cadence on a fresh record proposes +2 days.
  const imm = api.addStakeholder({ name: 'Daily Crisis Lead', commsCadence: 'immediate' });
  const r2 = api.logStakeholderContact(imm.id, { on: TODAY, note: 'war room' });
  const expected2 = new Date(NOW);
  expected2.setUTCDate(expected2.getUTCDate() + 2);
  assert.equal(r2.scheduledNextOn, expected2.toISOString().slice(0, 10));
});

test('archive and delete: status flip vs full cascade across edges and alliances', () => {
  const { store, api } = demoHarness();
  const dana = store.state.stakeholders.find((s) => s.name === 'Dana Kowalski');
  const arch = api.archiveStakeholder(dana.id);
  assert.equal(arch.ok, true);
  assert.equal(store.state.stakeholders.find((s) => s.id === dana.id).status, 'archived');
  // Archived records leave the active register.
  assert.equal(stakeholdersRollup(store.state, NOW).stats.total, 11);

  // Build a relationship then delete: the other record's alliance edge must go too.
  const target = store.state.stakeholders.find((s) => s.status === 'active');
  const holder = api.addStakeholder({
    name: 'Connected Consultant',
    alliances: [{ targetId: target.id, kind: 'alliance', strength: 4 }],
  });
  assert.ok(store.state.stakeholders.find((s) => s.id === holder.id).alliances.length === 1);
  const del = api.deleteStakeholder(holder.id);
  assert.equal(del.ok, true);
  assert.equal(store.state.stakeholders.some((s) => s.id === holder.id), false);
  // Deleting an unknown id is a clean failure, not a throw.
  assert.equal(api.deleteStakeholder('does-not-exist').ok, false);
  assert.equal(api.archiveStakeholder('does-not-exist').ok, false);
});

test('previewStakeholder: dry run reports effects without writing anything', () => {
  const { store, api } = demoHarness();
  const beforeRecords = store.state.stakeholders.length;
  const beforeDecisions = store.state.decisions.length;
  const preview = api.previewStakeholder({
    name: 'Phantom Gatekeeper',
    power: 5, interest: 5, legitimacy: 5, urgency: 5,
    vetoPlayer: true, stance: 'blocker',
  });
  assert.equal(preview.ok, true);
  assert.ok(Array.isArray(preview.previews));
  assert.equal(store.state.stakeholders.length, beforeRecords);
  assert.equal(store.state.decisions.length, beforeDecisions);

  // Validation failures surface through the preview too.
  assert.equal(api.previewStakeholder({ name: '', power: 9 }).ok, false);
});

test('autoPropagate=false: the register record is written but propagation is silent', () => {
  const { store, api } = demoHarness();
  const res = api.addStakeholder({ name: 'Silent Observer', autoPropagate: false, power: 5 });
  assert.equal(res.ok, true);
  assert.equal(res.propagations.length, 0);
  assert.equal(store.state.stakeholders.at(-1).autoPropagate, false);
});

test('validation: anonymous, out-of-range and malformed records are coached, not saved', () => {
  const { store, api } = harness();
  assert.equal(api.addStakeholder({ name: '   ' }).ok, false);
  assert.equal(api.addStakeholder({ name: 'X', power: 0 }).ok, false);
  assert.equal(api.addStakeholder({ name: 'X', urgency: 6 }).field, 'urgency');
  assert.equal(api.addStakeholder({ name: 'X', nextContactOn: 'soon' }).field, 'nextContactOn');
  assert.equal(store.state.stakeholders.length, 0);
});

test('demo silence: the seeded workspace contains no RULE-STK automation events', () => {
  const { store } = demoHarness();
  // Structural seed: links and decisions exist as data, but no fabricated events.
  assert.ok(store.state.links.some((l) => l.ruleId === 'RULE-STK-01'));
  assert.equal(store.state.events.some((e) => String(e.summary).includes('RULE-STK')), false);
  // Insights still surface the live adverse veto gate read-side (STK-01 insight).
  const findings = buildInsights(store.state, NOW).findings.filter((f) => String(f.ruleId).startsWith('STK'));
  assert.deepEqual(findings.map((f) => f.ruleId), ['STK-01']);
  assert.equal(findings[0].severity, 5);
});

/* ======================================================== 9. CSV & redaction */

test('CSV: stakeholders scope exports 32 formula-safe columns for every active record', () => {
  const { store } = demoHarness();
  const out = exportWorkspaceCsv(store.state, 'stakeholders', { now: NOW });
  assert.equal(out.ok, true);
  assert.equal(out.sensitive, true);
  assert.equal(out.rowCount, 12);
  assert.equal(out.columnCount, 32);
  const { headers, rows } = parseCsv(out.csv);
  assert.equal(headers.length, 32);
  assert.equal(rows.length, 12);
  for (const required of ['stakeholder_id', 'name', 'salience_class', 'veto_player', 'stance', 'influence_notes', 'contact_log_entries']) {
    assert.ok(headers.includes(required), `column ${required}`);
  }
  // Formula-injection guard on a name beginning with a spreadsheet trigger.
  const guarded = exportWorkspaceCsv({
    ...store.state,
    stakeholders: [{
      id: 'stk-inject', name: '=CMD|calc', status: 'active', category: 'other',
      power: 1, interest: 1, legitimacy: 1, urgency: 1, stance: 'neutral',
      estimateConfidence: 'medium', commsCadence: 'weekly', vetoPlayer: false,
      alliances: [], stanceHistory: [], contactLog: [], tags: [],
    }],
  }, 'stakeholders', { now: NOW });
  assert.match(guarded.csv, /'=/);
});

test('CSV: contextual-integrity redaction neutralizes stances and private text', () => {
  const { store } = demoHarness();
  const red = exportWorkspaceCsv(store.state, 'stakeholders', { now: NOW, redactStakeholderStances: true });
  assert.equal(red.omitted.stakeholderRecordsScrubbed > 0, true);
  const { headers, rows } = parseCsv(red.csv);
  const stanceIdx = headers.indexOf('stance');
  const notesIdx = headers.indexOf('influence_notes');
  const basisIdx = headers.indexOf('veto_basis');
  assert.ok(rows.every((r) => r[stanceIdx] === 'neutral'));
  assert.ok(rows.every((r) => !r[notesIdx]));
  assert.ok(rows.every((r) => !r[basisIdx]));
  // The un-redacted export still carries the real stance.
  const plain = parseCsv(exportWorkspaceCsv(store.state, 'stakeholders', { now: NOW }).csv);
  const plainStanceIdx = plain.headers.indexOf('stance');
  assert.ok(plain.rows.some((r) => r[plainStanceIdx] === 'skeptical'));
});

/* ============================ 10. point-in-time rewind & clearDemo hygiene */

test('rewind: history later than the cutoff is stripped and the stance rewinds with a fidelity note', () => {
  const state = {
    ...createEmptyState(NOW.toISOString()),
    stakeholders: [{
      id: 'stk-old', name: 'Historical Actor', status: 'active',
      power: 5, legitimacy: 5, urgency: 5, stance: 'blocker',
      estimateConfidence: 'high', commsCadence: 'weekly', vetoPlayer: false,
      createdAt: '2026-08-01T09:00:00.000Z',
      stanceHistory: [
        { id: 'h1', on: '2026-08-15', stance: 'supportive', context: 'early backing', sourceType: null, sourceId: null },
        { id: 'h2', on: '2026-10-20', stance: 'blocker', context: 'late reversal', sourceType: null, sourceId: null },
      ],
      contactLog: [{ id: 'c1', on: '2026-10-22', note: 'late contact' }],
      lastContactOn: '2026-10-22', nextContactOn: '2026-11-01',
      alliances: [], tags: [],
    }],
  };
  const rewind = reconstructStateAt(state, '2026-10-01', { currentDay: TODAY });
  const rec = rewind.state.stakeholders[0];
  assert.ok(rec, 'a record created before the cutoff survives');
  assert.equal(rec.stanceHistory.length, 1);
  assert.equal(rec.stance, 'supportive', 'register stance rewinds to the latest surviving entry');
  assert.equal(rec.contactLog.length, 0);
  assert.equal(rec.lastContactOn, null);
  assert.equal(rec.nextContactOn, null);
  assert.equal(rewind.fidelity.stakeholders.level, 'approximate');
  assert.match(rewind.fidelity.stakeholders.reasons.join(' '), /Stakeholder stance and contact history/);

  // A cutoff after everything happened is exact.
  const later = reconstructStateAt(state, '2026-12-01', { currentDay: TODAY });
  assert.equal(later.fidelity.stakeholders.level, 'exact');
});

test('clearDemo: removes fabricated register records but keeps user-created ones and trims their edges', () => {
  const { store, api } = demoHarness();
  const demoTarget = store.state.stakeholders.find((s) => s.status === 'active');
  const mine = api.addStakeholder({
    name: 'My Real Regulator',
    alliances: [
      { targetId: demoTarget.id, kind: 'alliance', strength: 3 }, // points into demo data
    ],
  });
  store.clearDemo();
  const remaining = store.state.stakeholders;
  assert.equal(remaining.some((s) => s.id === mine.id), true);
  assert.equal(remaining.every((s) => !String(s.id).includes('-demo-')), true);
  // The alliance into a deleted demo record is scrubbed, not left dangling.
  const kept = remaining.find((s) => s.id === mine.id);
  assert.equal(kept.alliances.length, 0);
  // No graph edge references a removed stakeholder.
  const liveIds = new Set(remaining.map((s) => s.id));
  for (const link of store.state.links) {
    if (link.targetType === 'stakeholder') assert.ok(liveIds.has(link.targetId));
    if (link.sourceType === 'stakeholder') assert.ok(liveIds.has(link.sourceId));
  }
});

/* ============================================================ 11. JSDOM UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const k of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'FileReader', 'localStorage']) {
    globalThis[k] = window[k];
  }
  return { dom, window, document: window.document, consoleErrors };
}

async function withApp(fn, now = NOW) {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => now });
  try {
    await fn(app, env);
  } finally {
    app.destroy?.();
    env.dom.window.close();
  }
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
// Poll instead of a fixed sleep: under full-suite load a hashchange render can
// take longer than the timer, and a fixed wait flakes.
async function waitFor(fn, { timeout = 2000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await wait(10);
  }
  throw new Error(`waitFor timed out: ${label}${lastError ? ` — ${lastError.message}` : ''}`);
}
async function goTo(env, hash) {
  // Wait for the actual hashchange render: the view already has children from
  // the initial boot, so polling child count would resolve on the stale page.
  if (env.window.location.hash === hash) {
    await wait(10);
    return;
  }
  const changed = new Promise((resolve) => {
    env.window.addEventListener('hashchange', () => resolve(), { once: true });
  });
  env.window.location.hash = hash;
  await changed;
  await waitFor(() => env.document.getElementById('view')?.children?.length > 0, { label: `render ${hash}` });
}
const click = (node) => node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const setValue = (input, value) => {
  if (input.type === 'checkbox' || input.type === 'radio') input.checked = Boolean(value);
  else input.value = String(value);
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
};

test('UI: register route renders stats, tabs and the full active register', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    await goTo(env, '#/stakeholders');
    const view = env.document.getElementById('view');
    assert.ok(view.textContent.includes('Stakeholder influence register'));
    assert.equal(view.querySelectorAll('.stk-matrix-cell').length, 0); // register tab default
    assert.equal(view.querySelectorAll('.tabs .tab').length, 3);
    assert.deepEqual(await axeViolations(env), []);
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('; '));
  });
});

test('UI: matrix tab draws 25 cells with all four Mendelow quadrant tints and 12 chips', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    await goTo(env, '#/stakeholders?tab=matrix');
    const cells = [...env.document.querySelectorAll('.stk-matrix-cell')];
    assert.equal(cells.length, 25);
    assert.equal(env.document.querySelectorAll('.stk-matrix-chip').length, 12);
    const classes = new Set(cells.map((c) => [...c.classList].find((x) => x.startsWith('stk-q-'))));
    for (const q of ['stk-q-manage-closely', 'stk-q-keep-satisfied', 'stk-q-keep-informed', 'stk-q-monitor']) {
      assert.ok(classes.has(q), q);
    }
    assert.deepEqual(await axeViolations(env), []);
  });
});

test('UI: network tab renders union-find blocs and the power balance', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    await goTo(env, '#/stakeholders?tab=network');
    assert.equal(env.document.querySelectorAll('.stk-bloc').length, 3);
    assert.ok(env.document.body.textContent.includes('Supportive power'));
    assert.ok(env.document.body.textContent.includes('Opposing power'));
    assert.deepEqual(await axeViolations(env), []);
  });
});

test('UI: dossier shows the Tsebelis veto card and the append-only history', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const dana = app.store.state.stakeholders.find((s) => s.name === 'Dana Kowalski');
    await goTo(env, `#/stakeholders/${dana.id}`);
    const text = env.document.getElementById('view').textContent;
    assert.ok(text.includes('Tsebelis veto analysis'));
    assert.ok(text.includes('difficulty 25/100'));
    assert.ok(text.includes('Mitchell, Agle & Wood'));
    assert.ok(text.includes('Archive stakeholder'));
    assert.deepEqual(await axeViolations(env), []);
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('; '));
  });
});

test('UI: register dialog saves through the API and the new record appears in the list', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    await goTo(env, '#/stakeholders');
    const openBtn = [...env.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Register stakeholder');
    click(openBtn);
    await wait();
    const modal = env.document.querySelector('.modal');
    assert.ok(modal);
    assert.equal(modal.querySelectorAll('.stk-readout').length, 3); // live salience / Mendelow / veto
    setValue(modal.querySelector('#stk-name'), 'UI Test Regulator');
    setValue(modal.querySelector('#stk-power'), '5');
    setValue(modal.querySelector('#stk-legitimacy'), '5');
    setValue(modal.querySelector('#stk-urgency'), '5');
    await wait();
    assert.ok(modal.querySelector('.stk-salience-definitive'));
    const save = [...modal.querySelectorAll('button')].find((b) => b.textContent.includes('Register stakeholder'));
    click(save);
    await wait();
    assert.equal(env.document.querySelector('.modal'), null);
    assert.equal(app.store.state.stakeholders.some((s) => s.name === 'UI Test Regulator'), true);
    assert.ok(env.document.getElementById('view').textContent.includes('UI Test Regulator'));
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('; '));
    assert.deepEqual(await axeViolations(env, '#modal-root'), []);
  });
});

test('UI: stance dialog appends an entry and contact dialog proposes the cadence date', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    const priya = app.store.state.stakeholders.find((s) => s.personId === 'person-demo-1');
    await goTo(env, `#/stakeholders/${priya.id}`);
    click([...env.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Log stance'));
    await wait();
    let modal = env.document.querySelector('.modal');
    setValue(modal.querySelector('#stk-stance-log'), 'blocker');
    setValue(modal.querySelector('#stk-stance-context'), 'UI-driven shift');
    click([...modal.querySelectorAll('button')].find((b) => b.textContent.includes('Save stance')));
    await wait();
    assert.equal(env.document.querySelector('.modal'), null);
    assert.equal(app.store.state.stakeholders.find((s) => s.id === priya.id).stance, 'blocker');

    click([...env.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Log contact'));
    await wait();
    modal = env.document.querySelector('.modal');
    assert.ok(modal.textContent.includes('next contact will be proposed'));
    setValue(modal.querySelector('#stk-contact-note'), 'UI contact note');
    click([...modal.querySelectorAll('button')].find((b) => b.textContent.includes('Save contact')));
    await wait();
    const rec = app.store.state.stakeholders.find((s) => s.id === priya.id);
    assert.equal(rec.contactLog.at(-1).note, 'UI contact note');
    assert.ok(rec.nextContactOn);
    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('; '));
  });
});

test('UI: Today triage surfaces the stakeholder attention queue and deep-links to the dossier', async () => {
  await withApp(async (app, env) => {
    app.ctx.loadDemo();
    await goTo(env, '#/today');
    const card = env.document.getElementById('stakeholders-triage');
    assert.ok(card, 'stakeholder triage card rendered');
    assert.ok(card.textContent.includes('Dana Kowalski'));
    const link = card.querySelector('a[href^="#/stakeholders/"]');
    assert.ok(link);
    assert.deepEqual(await axeViolations(env), []);
  });
});
