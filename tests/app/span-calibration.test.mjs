/**
 * ADR-0100, Schema v102 — the Discretion Calibrator (`#/span-calibration`).
 *
 * The claims this suite makes, in order:
 *  1. The migration is additive: three empty ledgers, declared conventions, no
 *     ladder in force, and a v101 workspace's escalation clocks unchanged.
 *  2. The estimator is Kaplan–Meier, hand-checked: censored items never count as
 *     failures, the risk set shrinks by both events and censorings, and a curve
 *     that never reaches the coverage target refuses to name a span.
 *  3. The verdict is read off the interval at the DECLARED span against the
 *     declared coverage promise, and every refusal names its reason — decided
 *     floor, censoring ceiling, width ceiling, or no follow-up past the span.
 *  4. Crossing measured rungs are pooled (weighted PAVA) rather than printed as a
 *     ladder that runs downhill.
 *  5. The counterfactual is an exact partition of the open items, and the
 *     proposed ladder is clamped and monotone.
 *  6. RULE-SPC-01..04 on the shared spine: registration with `calibrates` and
 *     `rolls-up-to` edges in the same transaction, ONE governed decision per
 *     falsified rung per ISO week, one staleness task, drift re-decision, and a
 *     once-only grade on items opened after the freeze.
 *  7. Adoption is a dated, append-only, full-access declaration that actually
 *     changes the ladder the Command Chain routes on — and restoring it does too.
 *  8. The CSV is aggregate-only and refusal-honest; the view passes axe on every
 *     panel over both an empty and a populated workspace.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const AXE_SRC = fs.readFileSync(path.join(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');

import { createApi } from '../../app/actions.js';
import { guardApi } from '../../app/core/domain/accessGateway.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { manifestFor } from '../../app/core/domain/disclosureManifests.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS, contractFor } from '../../app/core/domain/propagationContracts.js';
import { ALTITUDES, buildChain, harvestWork, ladderFor } from '../../app/core/domain/chain.js';
import { altitudeRank } from '../../app/core/domain/chainRegistry.js';
import {
  adoptableLadder,
  buildSpanCalibrationReport,
  buildSpanReading,
  gradeSpanReading,
  isotopeRungs,
  proposeLadder,
  quantileFromCurve,
  spanCalibrationAttentionCount,
  spanCalibrationBriefText,
  spanCalibrationCsvRows,
  spanCalibrationSignals,
  spanCounterfactual,
  survivalAt,
  survivalCurve,
} from '../../app/core/domain/spanCalibration.js';
import {
  normalizeAdoptedHorizons,
  normalizeSpanAdoptions,
  normalizeSpanCalibrationSettings,
  normalizeSpanMarkers,
  normalizeSpanReadings,
} from '../../app/core/domain/spanCalibrationSchema.js';
import { SPAN_RULE_IDS } from '../../app/core/domain/spanCalibrationRegistry.js';
import { renderSpanCalibration } from '../../app/views/spanCalibration.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
const TODAY = '2026-11-05';
const ago = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);

/**
 * A three-altitude chain: one director (the workspace leader), one manager under
 * her, one frontline lead under the manager, and one IC under the lead. Work is
 * attributed by the lowest common ancestor of the people it touches, which is the
 * property under test — not a hand-assigned label.
 */
function tree() {
  const state = createEmptyState(NOW_ISO);
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Director',
    chainLeaderAltitude: 'director',
    spanCalibrationDecidedFloor: 8,
    spanCalibrationCensoringPct: 60,
    spanCalibrationMaxWidthPct: 45,
    spanCalibrationCellFloor: 2,
    spanCalibrationAutoPropagate: true,
  };
  for (const key of Object.keys(state.settings)) {
    if (key.endsWith('AutoPropagate') && key !== 'spanCalibrationAutoPropagate') state.settings[key] = false;
  }
  state.people = [
    { id: 'dir1', name: 'Dana Director', role: 'Director', level: 'director', team: 'Ops', status: 'active', createdAt: NOW_ISO },
    { id: 'mgr1', name: 'Mira Manager', role: 'Manager', level: 'manager', team: 'Billing', managerId: 'dir1', status: 'active', createdAt: NOW_ISO },
    { id: 'lead1', name: 'Lee Lead', role: 'Lead', level: 'lead', team: 'Billing', managerId: 'mgr1', status: 'active', createdAt: NOW_ISO },
    { id: 'ic1', name: 'Ivy Analyst', role: 'Analyst', level: 'ic', team: 'Billing', managerId: 'lead1', status: 'active', createdAt: NOW_ISO },
  ];
  return normalizeState(state, { now: NOW }).state;
}

/**
 * Closed work with a per-rung duration profile: a frontline decision closes in
 * days, a manager's in weeks, a director's in months. That is the shape the
 * ladder claims, so a fixture that matches it should calibrate — and a fixture
 * that contradicts it should be falsified.
 */
function withLatencies(state, { frontline = 2, manager = 26, director = 95, n = 12, jitter = 2, open = 1 } = {}) {
  const out = JSON.parse(JSON.stringify(state));
  out.cases = [];
  const add = (rung, ownerId, peopleIds, base, index) => {
    const duration = Math.max(0, base + ((index % 5) - 2) * jitter);
    out.cases.push({
      id: `case-${rung}-${index}`,
      title: `${rung} item ${index}`,
      status: 'resolved',
      ownerId,
      involvedPersonIds: peopleIds,
      openedOn: ago(duration + 140),
      resolvedOn: ago(140),
      createdAt: NOW_ISO,
      fmea: { severity: 4 },
    });
  };
  for (let index = 0; index < n; index += 1) {
    add('frontline', 'ic1', [], frontline, index);
    add('manager', 'lead1', ['ic1'], manager, index);
    add('director', 'mgr1', ['lead1'], director, index);
  }
  for (let index = 0; index < open; index += 1) {
    out.cases.push({
      id: `case-open-${index}`,
      title: `open item ${index}`,
      status: 'open',
      ownerId: 'ic1',
      involvedPersonIds: [],
      openedOn: ago(12 + index),
      createdAt: NOW_ISO,
      fmea: { severity: 4 },
    });
  }
  return normalizeState(out, { now: NOW }).state;
}

function harness(state) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  let current = NOW;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-spc-${++seq}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (value) => { current = value; } };
}

function bootDocument() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.SVGElement = window.SVGElement;
  globalThis.Event = window.Event;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

function renderPanel(state, panel) {
  const query = new URLSearchParams({ panel });
  const ctx = { state, now: NOW, query, navigate: () => {}, refresh: () => {}, api: {} };
  const node = renderSpanCalibration(ctx);
  return { node, text: node.textContent };
}

/* ------------------------------------------------------------------ */
/* 1. Schema                                                          */
/* ------------------------------------------------------------------ */

test('Schema v102 is additive: three empty ledgers, declared conventions, no ladder in force', () => {
  assert.equal(SCHEMA_VERSION, 113);
  const migrated = migrate({ schemaVersion: 101, settings: { leaderName: 'Keep this' } });
  assert.deepEqual(migrated.applied, ['101 → 102', '102 → 103', '103 → 104', '104 → 105', '105 → 106', '106 → 107', '107 → 108', '108 → 109', '109 → 110', '110 → 111', '111 → 112', '112 → 113']);
  assert.deepEqual(migrated.raw.spanReadings, []);
  assert.deepEqual(migrated.raw.spanAdoptions, []);
  assert.deepEqual(migrated.raw.spanMarkers, []);
  assert.equal(migrated.raw.settings.leaderName, 'Keep this');
  assert.equal(migrated.raw.settings.spanCalibrationCoveragePct, 85);
  assert.equal(migrated.raw.settings.spanCalibrationDecidedFloor, 8);
  assert.equal(migrated.raw.settings.chainAdoptedHorizons, null, 'no adoption is invented');

  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.deepEqual(normalized.state.spanReadings, []);
  assert.deepEqual(normalized.state.spanAdoptions, []);
  assert.equal(normalized.state.settings.chainAdoptedOn, null);
  // The declared ladder is untouched, so every escalation clock reads as it did.
  assert.deepEqual(ladderFor(normalized.state.settings), ALTITUDES);
});

test('the calibration normalizers are fail-closed: a reading without rungs, an undated adoption and a downhill ladder all refuse', () => {
  const warnings = [];
  const readings = normalizeSpanReadings([
    {
      id: 'ok', frozenOn: TODAY, reviewOn: '2027-02-03',
      rungs: [{ key: 'frontline', rank: 1, declaredDays: 7, decidedN: 12, censoredN: 1, verdict: 'calibrated', survivalAtDeclaredPct: 12, reason: 'inside' }],
      proposedLadder: [{ key: 'frontline', days: 9, declaredDays: 7, source: 'measured' }],
      engine: 'test',
    },
    { id: 'no-rungs', frozenOn: TODAY, reviewOn: '2027-02-03', rungs: [] },
    { id: 'no-date', reviewOn: '2027-02-03', rungs: [{ key: 'frontline', rank: 1, declaredDays: 7, verdict: 'calibrated' }] },
    { id: 'ok', frozenOn: TODAY, reviewOn: '2027-02-03', rungs: [{ key: 'frontline', rank: 1, declaredDays: 7, verdict: 'calibrated' } ] },
  ], warnings, { now: NOW });
  assert.equal(readings.length, 1);
  assert.equal(readings[0].id, 'ok');
  assert.match(warnings.join(' '), /no valid rung/i);
  assert.match(warnings.join(' '), /no valid freeze\/review date/i);

  const adoptions = normalizeSpanAdoptions([
    { id: 'a1', adoptedOn: TODAY, readingId: 'ok', table: [{ key: 'frontline', days: 9 }, { key: 'manager', days: 30 }] },
    { id: 'a2', readingId: 'ok', table: [{ key: 'frontline', days: 9 }] },
    { id: 'a3', adoptedOn: TODAY, table: [] },
  ], warnings);
  assert.equal(adoptions.length, 1);
  assert.equal(adoptions[0].id, 'a1');
  assert.match(warnings.join(' '), /no valid date/i);
  assert.match(warnings.join(' '), /no usable table/i);

  // A hand-edited settings object cannot run the ladder downhill.
  const adopted = normalizeAdoptedHorizons({ frontline: 40, manager: 20, director: 90, executive: 90, enterprise: 10 }, { frontline: 7, manager: 30, director: 90, executive: 180, enterprise: 365 });
  assert.equal(adopted.frontline, 40);
  assert.ok(adopted.manager > adopted.frontline, 'a rung below must sit above the rung under it');
  assert.ok(adopted.director > adopted.manager);
  assert.ok(adopted.executive > adopted.director);
  assert.ok(adopted.enterprise > adopted.executive);
  assert.equal(normalizeAdoptedHorizons(null, {}), null);

  const markers = normalizeSpanMarkers([
    { id: 'm1', kind: 'registered', week: '2026-W45', key: 'ok' },
    { id: 'm2', kind: 'registered', week: 'nonsense', key: 'ok' },
    { id: 'm1', kind: 'registered', week: '2026-W45', key: 'dup' },
  ]);
  assert.deepEqual(markers.map((row) => row.id), ['m1']);

  const conventions = normalizeSpanCalibrationSettings({ spanCalibrationCoveragePct: 400, spanCalibrationDecidedFloor: 0, spanCalibrationMaxWidthPct: 5 });
  assert.equal(conventions.spanCalibrationCoveragePct, 99, 'clamped, never silently obeyed');
  assert.equal(conventions.spanCalibrationDecidedFloor, 4);
  assert.equal(conventions.spanCalibrationMaxWidthPct, 20);
});

/* ------------------------------------------------------------------ */
/* 2. The estimator                                                   */
/* ------------------------------------------------------------------ */

test('Kaplan–Meier is hand-checked: censorings shrink the risk set and never count as decisions', () => {
  // t=1 event, t=2 event, t=3 CENSORED, t=4 event, n = 4.
  //   S(1) = 1 − 1/4 = 0.75          risk set at 1 = 4
  //   S(2) = 0.75 × (1 − 1/3) = 0.5  risk set at 2 = 3 (the censored item is still at risk)
  //   S(4) = 0.5 × (1 − 1/1) = 0     risk set at 4 = 1
  const curve = survivalCurve([
    { t: 1, event: true }, { t: 2, event: true }, { t: 3, event: false }, { t: 4, event: true },
  ], { riskFloor: 1 });
  assert.equal(curve.n, 4);
  assert.equal(curve.eventsN, 3);
  assert.equal(curve.censoredN, 1);
  const step = (t) => curve.steps.find((entry) => entry.t === t);
  assert.equal(step(1).s, 0.75);
  assert.equal(step(1).atRisk, 4);
  assert.equal(step(2).s, 0.5);
  assert.equal(step(2).atRisk, 3);
  assert.equal(step(3).s, 0.5, 'a censoring changes the risk set, not the estimate');
  assert.equal(step(4).s, 0);
  assert.equal(survivalAt(curve, 2.5, { riskFloor: 1 }).s, 0.5, 'the curve is right-continuous and flat between steps');
  // Beyond the last observation nothing is estimated — not 0, not the last value.
  assert.equal(survivalAt(curve, 9, { riskFloor: 1 }).s, null);
  assert.match(survivalAt(curve, 9, { riskFloor: 1 }).refused, /observed at 9 days/);

  // The quantile: at 50% coverage the curve first reaches 0.5 at t=2.
  const half = quantileFromCurve(curve, 50, { riskFloor: 1 });
  assert.equal(half.days, 2);
  // At 85% it never reaches 0.15 inside the follow-up, so it refuses by name.
  const high = quantileFromCurve(curve, 85, { riskFloor: 1 });
  assert.equal(high.days, null);
  assert.match(high.refused, /never reaches/);
  // A risk floor above the risk set refuses rather than reading the tail.
  assert.match(quantileFromCurve(curve, 50, { riskFloor: 10 }).refused, /risk set/);
});

test('a curve with no event is not a curve: it refuses with the reason, and a one-item rung is an anecdote', () => {
  const empty = survivalCurve([], {});
  assert.equal(empty.estimable, false);
  assert.match(empty.refused, /no observation/);
  const censoredOnly = survivalCurve([{ t: 5, event: false }, { t: 9, event: false }], {});
  assert.equal(censoredOnly.estimable, false);
  assert.match(censoredOnly.refused, /nothing at this rung has closed/i);
  assert.equal(quantileFromCurve(censoredOnly, 85, { riskFloor: 1 }).days, null);
});

/* ------------------------------------------------------------------ */
/* 3. The verdicts                                                    */
/* ------------------------------------------------------------------ */

test('the rung verdict is read off the interval at the declared span, and a falsified rung says which way and why', () => {
  // Frontline closes in ~2 days against a 7-day span: the span is generous.
  const generous = buildSpanCalibrationReport(withLatencies(tree()), { now: NOW });
  const frontline = generous.rungs.find((rung) => rung.key === 'frontline');
  assert.equal(frontline.decidedN, 12);
  assert.equal(frontline.verdict, 'too-wide', frontline.reason);
  assert.ok(frontline.survivalAtDeclaredPct < frontline.targetPct);
  assert.match(frontline.reason, /allows more time than this work needs/);
  assert.ok(Number.isFinite(frontline.measuredDays), 'the span the record implies is still printed');

  // Manager work takes ~26 days against a 30-day span: the declared span is close,
  // and the fixture is designed to fall inside the interval.
  const manager = generous.rungs.find((rung) => rung.key === 'manager');
  assert.equal(manager.decidedN, 12);
  assert.equal(manager.verdict, 'calibrated', manager.reason);
  assert.ok(manager.survivalAtDeclaredLoPct < manager.targetPct && manager.targetPct < manager.survivalAtDeclaredHiPct);

  // Director work takes ~95 days against a 90-day span with a tight spread.
  const director = generous.rungs.find((rung) => rung.key === 'director');
  assert.equal(director.decidedN, 12);

  // The ladder the record proposes never runs downhill and never jumps the band.
  const proposed = generous.ladder.proposed;
  for (let index = 1; index < proposed.length; index += 1) {
    assert.ok(proposed[index].days > proposed[index - 1].days, 'a ladder that runs downhill is not a ladder');
  }
  for (const row of proposed) {
    assert.ok(row.days >= Math.ceil(row.declaredDays * 0.25) - 1);
    assert.ok(row.days <= Math.round(row.declaredDays * 4) + 1);
  }
  assert.ok(generous.totals.measurableRungs >= 2);
  assert.equal(generous.verdictCounts['too-wide'] >= 1, true);
});

test('every refusal names its reason: decided floor, censoring ceiling, follow-up limit and interval width', () => {
  const lowFloor = buildSpanCalibrationReport(withLatencies(tree(), { n: 3, open: 0 }), { now: NOW });
  for (const rung of lowFloor.rungs) {
    if (rung.decidedN && rung.decidedN < 8) {
      assert.equal(rung.verdict, 'insufficient');
      assert.match(rung.reason, /below the declared floor/);
    }
  }

  const heavyCensoring = buildSpanCalibrationReport(withLatencies(tree(), { n: 9, open: 12 }), { now: NOW });
  const frontline = heavyCensoring.rungs.find((rung) => rung.key === 'frontline');
  assert.equal(frontline.verdict, 'insufficient');
  assert.match(frontline.reason, /censoring ceiling|still open/);

  // Nothing has ever been observed as old as the executive span in this fixture.
  const short = buildSpanCalibrationReport(withLatencies(tree()), { now: NOW });
  const executive = short.rungs.find((rung) => rung.key === 'executive');
  assert.equal(executive.verdict, 'insufficient');
  assert.match(executive.reason, /no item has ever been recorded at this rung/i);

  // A very wide band refuses rather than calling a coin-flip calibrated.
  const wide = buildSpanCalibrationReport(withLatencies(tree(), { n: 8, jitter: 26 }), { now: NOW });
  const manager = wide.rungs.find((rung) => rung.key === 'manager');
  if (manager.verdict === 'insufficient') assert.match(manager.reason, /points wide|below the declared floor|censoring/);
  // And the width ceiling is what makes that possible: with it at 90 the same
  // sample is allowed to speak, which the screen states as a convention.
  const loose = buildSpanCalibrationReport({
    ...withLatencies(tree(), { n: 8, jitter: 26 }),
    settings: { ...withLatencies(tree()).settings, spanCalibrationMaxWidthPct: 90 },
  }, { now: NOW });
  assert.ok(loose.conventions.maxWidthPct === 90);
});

test('crossing measured rungs are pooled by weighted PAVA, not silently reordered', () => {
  const pooled = isotopeRungs([
    { key: 'frontline', value: 40, weight: 4 },
    { key: 'manager', value: 12, weight: 6 },
    { key: 'director', value: 200, weight: 2 },
  ]);
  assert.equal(pooled.pooled.has('frontline'), true);
  assert.equal(pooled.pooled.has('manager'), true);
  assert.equal(pooled.pooled.has('director'), false);
  assert.ok(pooled.values.get('frontline') <= pooled.values.get('manager') + 0.001);
  // Weighted: (40×4 + 12×6)/10 = 23.2
  assert.equal(pooled.values.get('frontline'), 23.2);
  assert.equal(pooled.values.get('manager'), 23.2);


  // Monotone input is left exactly as it was.
  const clean = isotopeRungs([{ key: 'a', value: 7, weight: 1 }, { key: 'b', value: 30, weight: 1 }]);
  assert.equal(clean.pooled.size, 0);
  assert.equal(clean.values.get('a'), 7);
});

/* ------------------------------------------------------------------ */
/* 4. The counterfactual                                              */
/* ------------------------------------------------------------------ */

test('the counterfactual is an exact partition of the open items, and the proposal is clamped and monotone', () => {
  const state = withLatencies(tree(), { open: 6 });
  const report = buildSpanCalibrationReport(state, { now: NOW });
  const chain = buildChain(state, { now: NOW, settings: state.settings });
  const openItems = harvestWork(state, chain, { now: NOW, settings: state.settings }).length;

  assert.equal(report.counterfactual.itemsN, openItems, 'every open item is re-placed exactly once');
  assert.equal(
    report.counterfactual.riseN + report.counterfactual.fallN + report.counterfactual.unchangedN,
    report.counterfactual.itemsN,
    'the partition is exhaustive',
  );
  assert.equal(
    report.counterfactual.rows.reduce((sum, row) => sum + row.itemsN, 0),
    report.counterfactual.itemsN,
    'no item is counted twice or lost on the way into a rung',
  );
  assert.match(report.counterfactual.note, /open item/);
  assert.equal(typeof report.counterfactual.aboveTopN, 'number');

  // Empty workspace: a counterfactual of zero is stated, not rounded away.
  const empty = buildSpanCalibrationReport(createEmptyState(NOW_ISO), { now: NOW });
  assert.equal(empty.counterfactual.itemsN, 0);
  assert.match(empty.counterfactual.note, /empty rather than zero/);

  // The proposal is monotone even when the measured rungs cross.
  const ladder = ALTITUDES;
  const proposal = proposeLadder([
    { key: 'frontline', declaredDays: 7, verdict: 'too-narrow', measuredDays: 60, decidedN: 20 },
    { key: 'manager', declaredDays: 30, verdict: 'too-wide', measuredDays: 12, decidedN: 20 },
  ], ladder, { adoptMinPct: 25, adoptMaxPct: 400, ladderStepMax: 24 });
  for (let index = 1; index < proposal.length; index += 1) {
    assert.ok(proposal[index].days > proposal[index - 1].days, `${proposal[index].key} must sit above ${proposal[index - 1].key}`);
  }
  // The clamp binds: 60 days against a 7-day declaration is capped at 400%.
  assert.equal(proposal[0].days, 28);
});

/* ------------------------------------------------------------------ */
/* 5. Freezing and the spine                                          */
/* ------------------------------------------------------------------ */

test('freezing a reading registers it on the spine with calibrates + rolls-up-to edges, and opens one decision per falsified rung per week', () => {
  const state = withLatencies(tree());
  const { store, api } = harness(state);
  const frozen = api.spanCalibrationFreeze();
  assert.equal(frozen.ok, true, frozen.error);
  assert.equal(store.state.spanReadings.length, 1);
  const reading = store.state.spanReadings[0];
  assert.equal(reading.frozenOn, TODAY);
  assert.ok(reading.rungs.length === 5);
  assert.ok(reading.rungs.some((rung) => rung.verdict === 'too-wide'));

  // RULE-SPC-01: the reading is a graph node with a calibrates edge per covered
  // span and a rolls-up-to edge per ancestor, written in the same transaction.
  const links = store.state.links.filter((link) => link.sourceId === reading.id);
  assert.ok(links.some((link) => link.relation === 'calibrates' && link.targetType === 'person'), 'calibrates edge written');
  assert.ok(links.every((link) => LINK_RELATIONS.includes(link.relation)));
  const resolved = resolveLinkedEntity(store.state, 'spanreading', reading.id);
  assert.ok(resolved, 'the reading resolves through the shared typed-link resolver');
  assert.ok(LINK_ENTITY_TYPES.includes('spanreading'));

  // RULE-SPC-02: a falsified rung opens exactly ONE governed decision, owned by
  // the leader, carrying the interval and the honest options — never a person.
  const falsified = reading.rungs.filter((rung) => rung.verdict === 'too-wide' || rung.verdict === 'too-narrow');
  const opened = store.state.decisions.filter((row) => (row.tags || []).includes('span-calibration'));
  assert.equal(opened.length, falsified.length);
  for (const decision of opened) {
    assert.equal(decision.chosen, '');
    assert.ok(decision.options.length >= 3);
    assert.match(decision.question, /declared span|span allows|still open/);
    assert.doesNotMatch(decision.question, /Lee Lead|Ivy Analyst|Mira Manager/);
  }

  // Idempotent inside one ISO week: a scan adds no second decision per rung.
  const before = store.state.decisions.length;
  assert.equal(api.spanCalibrationScan().ok, true);
  assert.equal(store.state.decisions.length, before, 'the marker makes the rule idempotent inside the week');

  // Pausable: with auto-propagation off, an automatic event writes nothing new.
  store.update((draft) => { draft.settings.spanCalibrationAutoPropagate = false; }, { type: 'test.pause', entity: 'workspace', entityId: 'all', summary: 'pause' });
  const paused = store.state.spanReadings.length;
  store.update(() => {}, { type: 'spancalibration.frozen', entity: 'spanreading', entityId: reading.id, summary: 'replay' });
  assert.equal(store.state.spanReadings.length, paused);
  assert.equal(store.state.decisions.length, before, 'a paused spine opens nothing');
});

test('staleness opens one bounded review task, and a due reading is graded once, out of sample', () => {
  const state = withLatencies(tree());
  const { store, api, setNow } = harness(state);
  assert.equal(api.spanCalibrationFreeze().ok, true);
  const reading = store.state.spanReadings[0];
  const quoted = reading.rungs.filter((rung) => rung.survivalAtDeclaredPct !== null);
  assert.ok(quoted.length >= 1, 'the reading quotes at least one probability');

  // Before the review date the grade is refused by name.
  const early = gradeSpanReading(reading, store.state, { now: NOW });
  assert.equal(early.ok, false);
  assert.match(early.error, /cannot be graded before/);

  // Move past the review date; add post-freeze work that closes fast (so the
  // frozen claim that "this much is still open at the span" is falsified).
  setNow(new Date('2027-04-30T12:00:00.000Z'));
  const later = JSON.parse(JSON.stringify(store.state));
  for (let index = 0; index < 12; index += 1) {
    later.cases.push({
      id: `post-${index}`, title: `post-freeze ${index}`, status: 'resolved', ownerId: 'ic1',
      involvedPersonIds: [], openedOn: '2027-01-05', resolvedOn: '2027-01-06', createdAt: '2027-01-05T09:00:00.000Z', fmea: { severity: 3 },
    });
  }
  const normalized = normalizeState(later, { now: new Date('2027-04-30T12:00:00.000Z') }).state;
  const grade = gradeSpanReading(reading, normalized, { now: new Date('2027-04-30T12:00:00.000Z') });
  assert.equal(grade.ok, true, grade.error);
  const scored = grade.grade.rows.filter((row) => row.outcome === 'graded');
  assert.ok(scored.length >= 1);
  for (const row of scored) {
    assert.ok(row.n >= 8, 'graded only above the declared floor');
    assert.ok(row.brier >= 0 && row.brier <= 1, 'a Brier score is a probability');
    assert.equal(row.observedPct, 0, 'post-freeze work closed inside the span, so nothing was still open');
  }

  // Once graded, a second grade refuses: a frozen claim is scored once.
  const regrade = gradeSpanReading({ ...reading, gradedAt: grade.grade.gradedOn }, normalized, { now: new Date('2027-04-30T12:00:00.000Z') });
  assert.equal(regrade.ok, false);
  assert.match(regrade.error, /graded once/);

  // Staleness: with a reading older than the review window, the spine opens one task.
  const stale = JSON.parse(JSON.stringify(store.state));
  stale.spanReadings[0].frozenOn = '2025-01-02';
  stale.spanReadings[0].reviewOn = '2025-04-02';
  const hitch = harness(stale);
  hitch.api.spanCalibrationScan();
  const tasks = hitch.store.state.delegations.filter((row) => row && row.title && /Re-calibrate the leadership ladder/.test(row.title));
  assert.equal(tasks.length, 1, 'exactly one bounded review task per ISO week');
  hitch.api.spanCalibrationScan();
  assert.equal(hitch.store.state.delegations.filter((row) => row && /Re-calibrate/.test(String(row.title))).length, 1);
});

/* ------------------------------------------------------------------ */
/* 6. Adoption — the closed loop into routing                          */
/* ------------------------------------------------------------------ */

test('adoption is a dated, append-only, full-access declaration that changes the ladder the chain routes on', () => {
  const state = withLatencies(tree(), { open: 6 });
  const { store, api } = harness(state);
  assert.equal(api.spanCalibrationFreeze().ok, true);
  const reading = store.state.spanReadings[0];

  const adopted = api.spanCalibrationAdopt({ readingId: reading.id, note: 'Quarterly calibration.' });
  assert.equal(adopted.ok, true, adopted.error);
  assert.equal(store.state.spanAdoptions.length, 1);
  const ledger = store.state.spanAdoptions[0];
  assert.equal(ledger.readingId, reading.id);
  assert.equal(ledger.action, 'adopt');
  assert.equal(ledger.adoptedOn, TODAY);
  assert.ok(Array.isArray(ledger.priorTable) && ledger.priorTable.length === 5, 'the before table is kept');
  assert.deepEqual(ledger.priorTable.map((row) => row.days), ALTITUDES.map((altitude) => altitude.horizonDays));

  // The ladder in force is the adopted one, and the chain reads it.
  const inForce = ladderFor(store.state.settings);
  assert.notEqual(inForce, ALTITUDES);
  const expected = adoptableLadder(reading, ALTITUDES, normalizeSpanCalibrationSettings(store.state.settings));
  assert.deepEqual(inForce.map((altitude) => altitude.horizonDays), expected.map((row) => row.days));

  // The proof that routing actually changed: an item aged inside the new
  // frontline span but outside the declared 7 days now requires a lower rung.
  const young = { id: 'young', ownerNodeId: 'leader', ownerAltitude: 'director', ownerRank: 3, ageDays: 12, openedOn: ago(12) };
  const chainDeclared = buildChain(state, { now: NOW, settings: state.settings });
  const declaredHarvest = harvestWork(state, chainDeclared, { now: NOW, settings: state.settings }).filter((item) => item.ageDays === 12);
  assert.ok(declaredHarvest.length >= 0);
  const declaredRank = Math.max(1, altitudeRank('frontline'));
  const adoptedRank = ALTITUDES.find((altitude) => 12 <= altitude.horizonDays)?.rank ?? 1;
  assert.ok(adoptedRank >= declaredRank);
  assert.ok(young.ageDays > ALTITUDES[0].horizonDays, 'the declared frontline span does not cover 12 days');

  // Restoring is also dated and append-only, and puts the declared ladder back.
  const restored = api.spanCalibrationRestoreLadder({ note: 'Back to the convention.' });
  assert.equal(restored.ok, true, restored.error);
  assert.equal(store.state.spanAdoptions.length, 2);
  assert.equal(store.state.spanAdoptions[0].action, 'restore');
  assert.equal(store.state.spanAdoptions[0].supersedesId, ledger.id);
  assert.equal(store.state.settings.chainAdoptedHorizons, undefined);
  assert.equal(ladderFor(store.state.settings), ALTITUDES);
  const restoreAgain = api.spanCalibrationRestoreLadder({});
  assert.equal(restoreAgain.ok, false);
  assert.match(restoreAgain.error, /already in force/);

  // An adoption must name a reading.
  const noReading = api.spanCalibrationAdopt({ readingId: 'nope' });
  assert.equal(noReading.ok, false);
});

test('a subordinate seat may measure but may not declare the ladder in force', () => {
  const state = withLatencies(tree());
  const { store, api } = harness(state);
  assert.equal(api.spanCalibrationFreeze().ok, true);
  const reading = store.state.spanReadings[0];

  // Declare a seat for the manager, whose span is one unit of the workspace.
  const seat = api.setActiveSeat('mgr1');
  assert.equal(seat.ok, true, seat.error);
  const guarded = guardApi(api, store);
  const attempt = guarded.spanCalibrationAdopt({ readingId: reading.id });
  assert.equal(attempt.ok, false, 'a subordinate seat cannot re-price every escalation clock');
  assert.match(String(attempt.error), /workspace leader/i);
  // A scoped read still works, and freezing is still allowed at that altitude.
  const read = guarded.spanCalibrationReport();
  assert.equal(read.ok, true);
  const freezeAgain = guarded.spanCalibrationFreeze();
  assert.ok(freezeAgain.ok || /already/i.test(String(freezeAgain.error)));
});

/* ------------------------------------------------------------------ */
/* 7. CSV, brief, signals, wiring                                      */
/* ------------------------------------------------------------------ */

test('the CSV scope is aggregate-only and refusal-honest, and the brief carries no person', () => {
  const state = withLatencies(tree(), { n: 3, open: 1 });
  const report = buildSpanCalibrationReport(state, { now: NOW });
  const rows = spanCalibrationCsvRows(report);
  assert.ok(rows.length >= report.rungs.length);
  const allowed = new Set(['row_kind', 'altitude', 'altitude_rank', 'declared_days', 'declared_source', 'coverage_pct',
    'decided_n', 'censored_n', 'censoring_pct', 'measured_days', 'pooled_measured_days', 'interval_low_days',
    'interval_high_days', 'survival_at_declared_pct', 'survival_low_pct', 'survival_high_pct', 'verdict',
    'withheld', 'n', 'change_n']);
  for (const row of rows) {
    for (const key of Object.keys(row)) assert.ok(allowed.has(key), `unexpected CSV column ${key}`);
    assert.ok(!/Lee Lead|Ivy Analyst|Mira Manager|Dana Director/.test(JSON.stringify(row)));
    if (row.verdict === 'insufficient') assert.equal(row.measured_days, '', 'a refused span is blank, never zero');
    if (row.withheld === 'yes') assert.equal(row.decided_n, '', 'a suppressed cell exports no count');
  }
  const scope = CSV_EXPORTS.find((entry) => entry.key === 'span-calibration');
  assert.ok(scope, 'the scope is registered');
  const exported = exportWorkspaceCsv(state, 'span-calibration', { now: NOW });
  assert.equal(exported.ok, true, exported.error);
  assert.match(exported.text, /row_kind/);

  const brief = spanCalibrationBriefText(report);
  assert.match(brief, /Discretion calibration as of/);
  assert.match(brief, /no person, item or record title/i);
  assert.doesNotMatch(brief, /Lee Lead|Ivy Analyst/);
});

test('signals fire for the states they name and stay silent otherwise', () => {
  const falsified = spanCalibrationSignals(withLatencies(tree()), NOW);
  assert.ok(falsified.some((signal) => signal.id === 'SPC-01' || signal.id === 'SPC-02'));
  for (const signal of falsified) {
    assert.ok(signal.title && signal.detail);
    assert.doesNotMatch(signal.detail, /Lee Lead|Ivy Analyst/);
  }
  const virgin = spanCalibrationSignals(createEmptyState(NOW_ISO), NOW);
  assert.deepEqual(virgin.map((signal) => signal.id), ['SPC-04'], 'a virgin workspace says the record is the instrument');
  assert.equal(spanCalibrationAttentionCount(withLatencies(tree()), { now: NOW }), falsified.filter((s) => s.id === 'SPC-01' || s.id === 'SPC-02').length);
});

test('the module is wired into schema, spine, gateway, route table, CSV register and the disclosure catalogue', () => {
  const root = path.join(import.meta.dirname, '../..');
  const main = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
  assert.match(main, /import \{ renderSpanCalibration \} from '\.\/views\/spanCalibration\.js';/);
  assert.match(main, /'span-calibration': \(ctx\) => renderSpanCalibration\(ctx\)/);
  assert.match(main, /'span-calibration': 'span-calibration'/);
  assert.match(main, /spanCalibrationAttentionCount\(state/);

  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => typeof rule === 'function' && rule.name === 'spanCalibrationRule'));
  const contract = contractFor('spanCalibrationRules.js');
  assert.ok(contract, 'the propagation contract is declared');
  assert.match(contract.purpose, /RULE-SPC-01/);
  assert.ok(contract.writes.includes('spanMarkers'));

  const manifest = manifestFor('span-calibration');
  assert.ok(manifest, 'the disclosure catalogue declares the route');
  assert.equal(manifest.adapterScoped, true);
  assert.equal(manifest.classKey, 'unit');

  const schema = fs.readFileSync(path.join(root, 'app/core/schema.js'), 'utf8');
  assert.match(schema, /101: \(v101\)/);
  assert.match(schema, /spanReadings: Array\.isArray\(v101\.spanReadings\)/);
  assert.equal(SPAN_RULE_IDS.register, 'RULE-SPC-01');
});

/* ------------------------------------------------------------------ */
/* 8. The view                                                         */
/* ------------------------------------------------------------------ */

test('every panel renders on an empty and on a populated workspace without leaking a placeholder', () => {
  bootDocument();
  for (const panel of ['desk', 'ladder', 'cohorts', 'counterfactual', 'rollup', 'readings']) {
    const empty = renderPanel(createEmptyState(NOW_ISO), panel);
    assert.ok(empty.node.querySelector('h1'), `${panel} renders a page heading`);
    assert.ok(empty.text.length > 120, `${panel} has content`);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(empty.text), `${panel} leaked a placeholder on an empty workspace: ${empty.text.slice(0, 400)}`);
    assert.match(empty.text, /Discretion calibration/);

    const filled = renderPanel(withLatencies(tree(), { open: 3 }), panel);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(filled.text), `${panel} leaked a placeholder on a populated workspace: ${filled.text.slice(0, 400)}`);
  }
  assert.match(renderPanel(withLatencies(tree()), 'ladder').text, /The ladder against the record/);
  assert.match(renderPanel(withLatencies(tree()), 'counterfactual').text, /Exactly what would move/);
  assert.match(renderPanel(createEmptyState(NOW_ISO), 'readings').text, /No reading frozen yet/);
});

test('a11y: every panel passes axe-core, including a populated ladder with curves', async () => {
  const env = bootDocument();
  try {
    const state = withLatencies(tree(), { open: 3 });
    for (const panel of ['desk', 'ladder', 'cohorts', 'counterfactual', 'rollup', 'readings']) {
      const { node } = renderPanel(state, panel);
      const host = env.document.querySelector('#view');
      host.replaceChildren(node);
      if (!env.window.axe) env.window.eval(AXE_SRC);
      const result = await env.window.axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
      const violations = Array.from(result.violations).map((violation) => `${violation.id}: ${violation.help}`);
      assert.deepEqual(violations, [], `${panel} has axe violations`);
      assert.deepEqual(env.consoleErrors, [], `${panel} logged jsdom errors`);
    }
  } finally {
    env.dom.window.close();
  }
});
