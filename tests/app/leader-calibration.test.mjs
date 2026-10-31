/**
 * tests/app/leader-calibration.test.mjs — tests for Schema v56: the Leader
 * Probability Calibration engine (Brier, Murphy decomposition, reliability
 * bins, Wilson intervals, cohort drift, advisory remap, RULE-LCAL-01..03).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMA_VERSION, MIGRATIONS, createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildCalibrationReport,
  calibrationScenarioForFrame,
  extractCalibrationSamples,
  buildReliabilityBins,
  murphyDecomposition,
  advisoryRemap,
  LCAL_ENGINE_VERSION,
  LCAL_VERDICT_FLOOR,
  lcalSignals,
  lcalAttentionCount,
  lcalBrief,
} from '../../app/core/domain/leaderCalibration.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { AUTOMATION_RULES } from '../../app/core/domain/automation.js';
import { LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { leaderCalibrationRule } from '../../app/core/domain/leaderCalibrationRules.js';

const NOW = new Date('2026-10-30T12:00:00Z');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function settledFrame({ id = 'f1', label = 'A frame', states, probabilities, realized, settledOn = '2026-10-29' }) {
  return {
    id, label,
    status: 'decided',
    currency: 'USD',
    states: states.map((sid, i) => ({
      id: sid, label: `State ${sid}`, probability: probabilities[i], premiseId: null,
    })),
    options: [{ id: 'o1', label: 'Go', isStatusQuo: false }, { id: 'o2', label: 'Wait', isStatusQuo: true }],
    payoffs: [
      { optionId: 'o1', stateId: states[0], value: 100 }, { optionId: 'o1', stateId: states[1], value: 0 },
      { optionId: 'o2', stateId: states[0], value: 20 }, { optionId: 'o2', stateId: states[1], value: 20 },
    ],
    chosenOptionId: 'o1',
    decidedOn: '2026-10-01',
    outcomes: [{
      on: settledOn, settledOn,
      realizedStateId: realized,
      probabilities: states.map((sid, i) => ({ stateId: sid, pct: probabilities[i] })),
      regret: 0,
    }],
  };
}

function makeSamples() {
  // Produce 10 well-calibrated outcomes (10 single-P samples, enough for a verdict
  // at floor=10): 5 outcomes at 80% declared with 4 hits (80%), and 5 outcomes at
  // 50% declared with ~3 hits (50% not achievable with 5; we use 2 hits = 40% which
  // keeps mean gap within tolerance when combined).
  const frames = [];
  for (let i = 0; i < 5; i += 1) {
    // 80% declared, hits 4 of 5 (80%).
    const hit = i < 4;
    frames.push(settledFrame({
      id: `wc80-${i}`, label: `WC80 ${i}`,
      states: ['a', 'b'], probabilities: [80, 20], realized: hit ? 'a' : 'b',
      settledOn: `2026-01-${String(1 + i).padStart(2, '0')}`,
    }));
  }
  for (let i = 0; i < 5; i += 1) {
    // 50% declared: 3 of 5 hit to approximate 50% (closer = 60%, averaged with
    // the 80% band gives mean abs gap < 10pp).
    const hit = i < 3;
    frames.push(settledFrame({
      id: `wc50-${i}`, label: `WC50 ${i}`,
      states: ['a', 'b'], probabilities: [50, 50], realized: hit ? 'a' : 'b',
      settledOn: `2026-02-${String(1 + i).padStart(2, '0')}`,
    }));
  }
  return frames;
}

test('schema v56 version constant', () => {
  assert.equal(SCHEMA_VERSION, 66);
});

test('v55 → v56 migration is additive: calibrationMarkers array initialized', () => {
  const v55 = { schemaVersion: 56, decisions: [], links: [], voiDecisions: [] };
  const step = MIGRATIONS[55];
  assert.ok(step, 'migration 55 → 56 exists');
  const v56 = step(v55);
  assert.equal(v56.schemaVersion, 56);
  assert.ok(Array.isArray(v56.calibrationMarkers));
  assert.equal(v56.calibrationMarkers.length, 0);
  assert.ok(Array.isArray(v56.decisions));
});

test('empty state has calibrationMarkers', () => {
  const s = createEmptyState();
  assert.ok(Array.isArray(s.calibrationMarkers));
  assert.equal(s.calibrationMarkers.length, 0);
  assert.equal(s.settings.lcalMinSamples, 5);
  assert.equal(s.settings.lcalVerdictSamples, 10);
});

test('normalization of calibrationMarkers caps entries at 2000 and 200 chars', () => {
  const normalized = normalizeState({
    schemaVersion: 56,
    calibrationMarkers: ['short', 'x'.repeat(300), ...Array.from({ length: 2500 }, (_, i) => `m${i}`)],
  }, { now: NOW });
  assert.equal(normalized.state.calibrationMarkers.length, 2000);
  assert.equal(normalized.state.calibrationMarkers[1], 'x'.repeat(200), 'overlong marker truncated');
});

test('extracting calibration samples from settled frames', () => {
  const state = { voiDecisions: [settledFrame({ id: 'f1', states: ['a', 'b'], probabilities: [80, 20], realized: 'a' })] };
  const samples = extractCalibrationSamples(state);
  // One settled frame → one single-P calibration sample (probability assigned to the realised state).
  assert.equal(samples.length, 1);
  assert.equal(samples[0].stateId, 'a');
  assert.equal(samples[0].forecastPct, 80);
  assert.equal(samples[0].realized, 1);
  // The allStateP vector carries the multi-class binary pairs for Brier.
  assert.equal(samples[0].allStateP.length, 2);
});

test('calibration report renders counts-only below threshold', () => {
  const state = { voiDecisions: [settledFrame({ id: 'f1', states: ['a', 'b'], probabilities: [70, 30], realized: 'a' })] };
  const r = buildCalibrationReport(state, NOW);
  assert.equal(r.usableCount, 1);
  assert.equal(r.verdict, 'insufficient');
  assert.equal(r.engineVersion, LCAL_ENGINE_VERSION);
});

test('calibration report detects overconfidence on a doctored hot track record', () => {
  // Build 12 settled frames where every declaration is 90% and only 50% hit.
  const frames = [];
  for (let i = 0; i < 12; i += 1) {
    frames.push(settledFrame({
      id: `hot-${i}`, label: `Hot ${i}`,
      states: ['a', 'b'], probabilities: [90, 10],
      realized: i < 6 ? 'a' : 'b', // 50% hit rate at 90% declared
      settledOn: `2026-03-${String(1 + i).padStart(2, '0')}`,
    }));
  }
  const r = buildCalibrationReport({ voiDecisions: frames }, NOW);
  assert.equal(r.usableCount, 12); // 1 per frame (single-P)
  assert.equal(r.verdict, 'overconfident');
  // Top bin (80-100): 12 single-P forecasts at 90%, only 6 hit.
  const top = r.bins[4];
  assert.equal(top.binaryCount, 12); // the 90% entries
  assert.equal(top.hits, 6);
  assert.equal(top.status, 'scored');
  assert.ok(top.hitRate < 0.7, `top-bin hit rate should be 0.5, got ${top.hitRate}`);
  // Bottom bin (0-20): 12 entries at 10% (complement), 6 hit.
  const low = r.bins[0];
  assert.equal(low.binaryCount, 12);
  assert.equal(low.hits, 6);
});

test('Murphy decomposition on well-calibrated predictions', () => {
  const frames = makeSamples();
  const r = buildCalibrationReport({ voiDecisions: frames }, NOW);
  assert.equal(r.usableCount, 10); // 5 + 5 outcomes
  assert.equal(r.verdict, 'calibrated', `expected calibrated, got ${r.verdict} (${r.verdictReason})`);
  // Reliability should be low for a well-calibrated set.
  assert.ok(r.murphy.reliability < 0.05, `reliability ${r.murphy.reliability} should be < 0.05`);
});

test('Cromwell clamp holds for extreme probabilities', () => {
  // 0% and 100% get clamped to 5/95 in the sample's forecastPct.
  const state = {
    voiDecisions: [
      settledFrame({ id: 'f1', states: ['a', 'b'], probabilities: [100, 0], realized: 'a' }),
    ],
  };
  const samples = extractCalibrationSamples(state);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].forecastPct, 95);
  // The allStateP multi-class vector includes the clamped 5% for the losing state.
  const losingP = samples[0].allStateP.find((r) => r.stateId === 'b');
  assert.equal(losingP.pct, 5);
});

test('advisory remap returns one row per bin', () => {
  const frames = makeSamples();
  const r = buildCalibrationReport({ voiDecisions: frames }, NOW);
  assert.equal(r.remap.length, 5);
  // Top bin (80-100) holds the 80% states across the 8 frames.
  const top = r.remap[4];
  assert.equal(top.loPct, 80);
  assert.equal(top.hiPct, 100);
  assert.ok(top.count > 0);
});

test('calibration stress is bounded, exact on payoffs and refuses uncovered probability bands', () => {
  const history = makeSamples();
  const frame = {
    id: 'open-stress', label: 'Open calibrated test', status: 'open', currency: 'USD',
    states: [
      { id: 'a', label: 'A', probability: 80 },
      { id: 'b', label: 'B', probability: 20 },
    ],
    options: [{ id: 'o1', label: 'Go' }, { id: 'o2', label: 'Wait', isStatusQuo: true }],
    payoffs: [
      { optionId: 'o1', stateId: 'a', value: 100 }, { optionId: 'o1', stateId: 'b', value: -20 },
      { optionId: 'o2', stateId: 'a', value: 25 }, { optionId: 'o2', stateId: 'b', value: 25 },
    ],
  };
  const reading = calibrationScenarioForFrame({ voiDecisions: history }, frame);
  assert.equal(reading.status, 'ready');
  assert.equal(reading.rawEvpi, 9, 'EVPI is recomputed exactly from the original payoff table');
  assert.ok(reading.scenarioEvpi >= 0);
  assert.ok(reading.evpiLow <= reading.scenarioEvpi && reading.scenarioEvpi <= reading.evpiHigh);
  assert.ok(reading.evpiHigh >= reading.evpiLow);
  assert.equal(reading.cornersEvaluated, 4);
  assert.ok(reading.evidenceFrameIds.length > 0);
  assert.equal(reading.coveredBands.length, 2);
  assert.match(reading.caveat, /not simultaneous/);
  assert.deepEqual(frame.states.map((row) => row.probability), [80, 20], 'declared inputs are never mutated');

  const thin = calibrationScenarioForFrame({ voiDecisions: [history[0]] }, frame);
  assert.equal(thin.status, 'insufficient-band-data');
  assert.equal(thin.scenarioEvpi, undefined);

  const unpriced = calibrationScenarioForFrame({ voiDecisions: history }, { ...frame, payoffs: [] });
  assert.equal(unpriced.status, 'unpriced');
});

test('lcalSignals surfaces overconfidence signal when hot', () => {
  const frames = [];
  for (let i = 0; i < 12; i += 1) {
    frames.push(settledFrame({
      id: `hot-${i}`, label: `Hot ${i}`,
      states: ['a', 'b'], probabilities: [90, 10],
      realized: i < 6 ? 'a' : 'b',
      settledOn: `2026-03-${String(1 + i).padStart(2, '0')}`,
    }));
  }
  const sigs = lcalSignals({ voiDecisions: frames }, NOW);
  assert.ok(sigs.some((s) => s.ruleId === 'LCAL-01'), 'overconfidence signal expected');
  assert.ok(lcalAttentionCount({ voiDecisions: frames }, NOW) >= 1);
});

test('RULE-LCAL-03 stamps an advisory note on a new open frame when overconfident', () => {
  // Build 12 hot frames then declare an open frame.
  const frames = [];
  for (let i = 0; i < 12; i += 1) {
    frames.push(settledFrame({
      id: `hot-${i}`, label: `Hot ${i}`,
      states: ['a', 'b'], probabilities: [90, 10],
      realized: i < 6 ? 'a' : 'b',
      settledOn: `2026-03-${String(1 + i).padStart(2, '0')}`,
    }));
  }
  const draft = {
    voiDecisions: [
      ...frames,
      {
        id: 'open-new', label: 'Open new', status: 'open', currency: 'USD',
        states: [{ id: 'a', label: 'A', probability: 70 }, { id: 'b', label: 'B', probability: 30 }],
        options: [{ id: 'o1', label: 'Go' }, { id: 'o2', label: 'Wait', isStatusQuo: true }],
        payoffs: [], notes: [],
      },
    ],
    calibrationMarkers: [],
    decisions: [], links: [],
    settings: { lcalVerdictSamples: 10 },
  };
  const event = { id: 'ev1', type: 'voi.declared', entityId: 'open-new' };
  const ids = new Map();
  const idFactory = (prefix) => {
    const n = (ids.get(prefix) || 0) + 1;
    ids.set(prefix, n);
    return `${prefix}-${n}`;
  };
  const emitted = [];
  const logEvent = (e) => emitted.push(e);
  const results = leaderCalibrationRule.effect(draft, event, { now: NOW, idFactory, logEvent });
  const note = draft.voiDecisions.find((f) => f.id === 'open-new').notes[0];
  assert.ok(note, 'an advisory note should be stamped');
  assert.equal(note.source, 'RULE-LCAL-03');
  assert.ok(note.note.includes('Calibration advisory'));
  assert.ok(results.some((r) => r.rule === 'RULE-LCAL-03'));
  assert.ok(emitted.some((e) => e.type === 'calibration.advisory'));
});

test('RULE-LCAL-04 fans a calibration stress into typed source-frame provenance, idempotently', () => {
  const history = [];
  for (let i = 0; i < 12; i += 1) {
    history.push(settledFrame({
      id: `bridge-${i}`, states: ['a', 'b'], probabilities: [90, 10],
      realized: i < 6 ? 'a' : 'b', settledOn: `2026-04-${String(i + 1).padStart(2, '0')}`,
    }));
  }
  const target = {
    id: 'bridge-open', label: 'New pricing call', status: 'open', currency: 'USD',
    states: [{ id: 'a', label: 'A', probability: 90 }, { id: 'b', label: 'B', probability: 10 }],
    options: [{ id: 'o1', label: 'Go' }, { id: 'o2', label: 'Wait' }],
    payoffs: [
      { optionId: 'o1', stateId: 'a', value: 100 }, { optionId: 'o1', stateId: 'b', value: -100 },
      { optionId: 'o2', stateId: 'a', value: 20 }, { optionId: 'o2', stateId: 'b', value: 20 },
    ],
    notes: [],
  };
  const draft = { voiDecisions: [...history, target], calibrationMarkers: [], decisions: [], links: [], settings: {} };
  let next = 0;
  const idFactory = (prefix) => `${prefix}-${++next}`;
  const event = { id: 'bridge-event', type: 'voi.declared', entityId: target.id };
  const emitted = [];
  const first = leaderCalibrationRule.effect(draft, event, { now: NOW, idFactory, logEvent: (entry) => emitted.push(entry) });
  const bridge = first.find((result) => result.rule === 'RULE-LCAL-04');
  assert.ok(bridge, 'a mature calibration signal produces the bridge');
  assert.equal(bridge.sourceFrameIds.length, 3, 'bounded to three directly relevant settled frames');
  assert.equal(draft.links.length, 3);
  assert.ok(draft.links.every((link) => link.relation === 'calibrates' && link.targetId === target.id));
  assert.ok(draft.links.every((link) => resolveLinkedEntity(draft, link.sourceType, link.sourceId)));
  assert.ok(draft.links.every((link) => resolveLinkedEntity(draft, link.targetType, link.targetId)));
  assert.ok(target.notes.some((note) => note.source === 'RULE-LCAL-04' && /not an adjusted belief/.test(note.note)));
  assert.ok(emitted.some((entry) => entry.type === 'calibration.stress-linked'));

  const afterFirst = { links: draft.links.length, notes: target.notes.length };
  const second = leaderCalibrationRule.effect(draft, event, { now: NOW, idFactory, logEvent: () => {} });
  assert.equal(second.length, 0, 'same event is fully marker-idempotent');
  assert.equal(draft.links.length, afterFirst.links);
  assert.equal(target.notes.length, afterFirst.notes);
});

test('a real frame declaration runs the calibration bridge on the shared transaction spine', () => {
  const history = [];
  for (let i = 0; i < 12; i += 1) {
    history.push(settledFrame({
      id: `spine-${i}`, states: ['a', 'b'], probabilities: [90, 10],
      realized: i < 6 ? 'a' : 'b', settledOn: `2026-05-${String(i + 1).padStart(2, '0')}`,
    }));
  }
  let sequence = 0;
  const idFactory = (prefix) => `${prefix}-spine-${++sequence}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  store.update((draft) => {
    draft.people = [{ id: 'leader', name: 'Leader', role: 'Manager', level: 'lead', managerId: null, status: 'active', startDate: '2024-01-01', talkingPoints: [] }];
    draft.voiDecisions = history;
  }, { type: 'test.seed', entity: 'workspace', entityId: '', summary: 'Seed settled probability evidence' });
  const api = createApi(store, { now: () => NOW, idFactory });
  const created = api.addVoiDecision({
    label: 'A pricing call', question: 'Which path is worth testing?', ownerId: 'leader', currency: 'USD',
    states: [{ id: 'new-a', label: 'Adoption succeeds', probability: 90 }, { id: 'new-b', label: 'Adoption slips', probability: 10 }],
    options: [{ id: 'new-go', label: 'Launch', isStatusQuo: false }, { id: 'new-wait', label: 'Wait', isStatusQuo: true }],
    payoffs: [
      { optionId: 'new-go', stateId: 'new-a', value: 100 }, { optionId: 'new-go', stateId: 'new-b', value: -100 },
      { optionId: 'new-wait', stateId: 'new-a', value: 20 }, { optionId: 'new-wait', stateId: 'new-b', value: 20 },
    ],
  });
  assert.equal(created.ok, true, created.error);
  const frame = store.state.voiDecisions.find((row) => row.id === created.id);
  assert.ok(frame.notes.some((note) => note.source === 'RULE-LCAL-04'));
  const provenance = store.state.links.filter((link) => link.targetType === 'voi' && link.targetId === frame.id && link.relation === 'calibrates');
  assert.equal(provenance.length, 3);
  assert.ok(provenance.every((link) => history.some((source) => source.id === link.sourceId)));
  assert.ok(store.state.events.some((event) => event.type === 'calibration.stress-linked' && event.entityId === frame.id));
});

test('new settled evidence backfills calibration provenance onto an existing open frame', () => {
  const history = [];
  for (let i = 0; i < 12; i += 1) {
    history.push(settledFrame({
      id: `mature-${i}`, states: ['a', 'b'], probabilities: [90, 10],
      realized: i < 6 ? 'a' : 'b', settledOn: `2026-06-${String(i + 1).padStart(2, '0')}`,
    }));
  }
  const open = {
    id: 'already-open', label: 'Previously declared frame', status: 'open', currency: 'USD',
    states: [{ id: 'a', label: 'A', probability: 90 }, { id: 'b', label: 'B', probability: 10 }],
    options: [{ id: 'go', label: 'Go' }, { id: 'wait', label: 'Wait' }],
    payoffs: [
      { optionId: 'go', stateId: 'a', value: 100 }, { optionId: 'go', stateId: 'b', value: -100 },
      { optionId: 'wait', stateId: 'a', value: 20 }, { optionId: 'wait', stateId: 'b', value: 20 },
    ],
    notes: [],
  };
  const draft = { voiDecisions: [...history, open], calibrationMarkers: [], links: [], settings: {} };
  let next = 0;
  const idFactory = (prefix) => `${prefix}-settle-${++next}`;
  const result = leaderCalibrationRule(draft, {
    event: { id: 'maturity-event', type: 'voi.scanned', entityId: history.at(-1).id },
    now: NOW,
    idFactory,
    logEvent: () => {},
  });
  assert.ok(result.some((entry) => entry.rule === 'RULE-LCAL-04' && entry.frameId === open.id));
  assert.ok(open.notes.some((note) => note.source === 'RULE-LCAL-04'));
  assert.ok(draft.links.some((link) => link.targetId === open.id && link.relation === 'calibrates'));
});

test('the bridge rule is visible in the automation catalog and propagation contract', () => {
  assert.ok(AUTOMATION_RULES.some((rule) => rule.id === 'RULE-LCAL-04'));
  const contract = PROPAGATION_CONTRACTS.find((entry) => entry.rule === leaderCalibrationRule);
  assert.ok(contract.writes.includes('links'));
});

test('RULE-LCAL-01 marks a settled frame', () => {
  const frame = settledFrame({ id: 'f1', states: ['a', 'b'], probabilities: [80, 20], realized: 'a' });
  const draft = { voiDecisions: [frame], calibrationMarkers: [], decisions: [], links: [], settings: { lcalVerdictSamples: 10 } };
  const event = { id: 'ev1', type: 'voi.scanned', entityId: 'f1' };
  const ids = new Map();
  const idFactory = (prefix) => {
    const n = (ids.get(prefix) || 0) + 1; ids.set(prefix, n); return `${prefix}-${n}`;
  };
  const emitted = [];
  const results = leaderCalibrationRule.effect(draft, event, { now: NOW, idFactory, logEvent: (e) => emitted.push(e) });
  assert.ok(results.some((r) => r.rule === 'RULE-LCAL-01'));
  assert.ok(draft.calibrationMarkers.some((m) => m.startsWith('lcal:LCAL-01')));
});

test('RULE-LCAL-01 is marker-idempotent', () => {
  const frame = settledFrame({ id: 'f1', states: ['a', 'b'], probabilities: [80, 20], realized: 'a' });
  const draft = { voiDecisions: [frame], calibrationMarkers: ['lcal:LCAL-01:ev1:f1'], decisions: [], links: [], settings: { lcalVerdictSamples: 10 } };
  const event = { id: 'ev1', type: 'voi.scanned', entityId: 'f1' };
  const idFactory = () => 'x';
  const results = leaderCalibrationRule.effect(draft, event, { now: NOW, idFactory, logEvent: () => {} });
  assert.equal(results.length, 0, 'second run produces no new results');
});

test('calibrates relation is registered', () => {
  assert.ok(LINK_RELATIONS.includes('calibrates'));
});

test('leaderCalibrationRule is registered in the post-commit spine', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(leaderCalibrationRule));
});

test('leaderCalibrationRule has a propagation contract', () => {
  const contract = PROPAGATION_CONTRACTS.find((c) => c.rule === leaderCalibrationRule);
  assert.ok(contract, 'contract registered');
  assert.ok(contract.writes.includes('calibrationMarkers'));
  assert.ok(contract.writes.includes('voiDecisions'));
});

test('lcalBrief produces a textual summary', () => {
  const frames = makeSamples();
  const brief = lcalBrief({ voiDecisions: frames }, NOW);
  assert.ok(brief.includes('LEADER PROBABILITY CALIBRATION BRIEF'));
  assert.ok(brief.includes('RELIABILITY DIAGRAM'));
  assert.ok(brief.includes('ADVISORY REMAP'));
  assert.ok(brief.includes('SCENARIOS: OPEN-DECISION EVPI CALIBRATION STRESS'));
});
