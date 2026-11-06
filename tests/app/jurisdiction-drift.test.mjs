/**
 * ADR-0115 — Cross-week Jurisdiction Drift (`#/jurisdiction?panel=drift`).
 *
 * What this suite defends, in the order the feature fails if it is wrong:
 *  1. STORAGE. The objective denominator is additive + nullable: an old reading
 *     refuses its share rather than back-filling a number.
 *  2. STATISTICS. The conformal band is hand-computable, refuses below four
 *     weeks and refuses unidentifiable coverage (k > n) instead of +infinity.
 *  3. AGGREGATION BIAS. The pooled rate and the mean of unit rates are both
 *     printed, with their gap; suppression is counted, never zeroed.
 *  4. HIERARCHY. A declared seat reads ONLY its own reporting subtree, the
 *     brief/CSV are identity-free, and the altitude question changes.
 *  5. AUTOMATION. RULE-JUR-05 on the SHARED spine opens exactly one governed,
 *     marker-idempotent decision per ISO week with vertical roll-up edges; an
 *     ordinary `jur.scan` opens none; engine output is never priced as work.
 *  6. UI. The new panel renders at every altitude and is axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { buildChain } from '../../app/core/domain/chain.js';
import { buildSeats } from '../../app/core/domain/seat.js';
import { jurisdictionRule } from '../../app/core/domain/jurisdictionRules.js';
import { serializeCsv } from '../../app/core/csv.js';
import { API_RIGHTS, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { normalizeJurReadings } from '../../app/core/domain/jurisdictionSchema.js';
import { jurConventions, jurSpanRollUp, buildJurisdictionBook } from '../../app/core/domain/jurisdiction.js';
import {
  JUR_CONVENTION_DEFAULTS, JUR_RULE_IDS, JUR_PANELS, JUR_REFUSALS,
} from '../../app/core/domain/jurisdictionRegistry.js';
import {
  conformalDriftBand, jurDriftConventions, jurDriftWeeklySeries,
  countedWeekGaps, buildJurisdictionDrift, jurDriftRead, jurDriftBrief,
  jurDriftCsvRows, medianOf,
} from '../../app/core/domain/jurisdictionDrift.js';
import {
  JUR_DRIFT_CSV_COLUMNS, JUR_DRIFT_ALTITUDE_QUESTIONS, JUR_DRIFT_OPTIONS,
} from '../../app/core/domain/jurisdictionDriftRegistry.js';
import { renderJurisdiction } from '../../app/views/jurisdiction.js';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const WEEKS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'];
const clone = (v) => JSON.parse(JSON.stringify(v));

function reading(nodeId, week, objectives, crossBranch, coalition = 2, extra = {}) {
  return {
    id: `jurread:${nodeId}:${week}`, nodeId, nodeRank: 1, week,
    frozenAt: `${week}T09:00:00.000Z`, reviewOn: '2026-11-23',
    clusters: crossBranch, objectives, crossBranch,
    priced: crossBranch, governed: 0, refusals: 0, suppressed: 0,
    medianCoalitionSize: coalition,
    status: 'frozen', gradedOn: null, gradeNote: '',
    engineVersion: 'jurisdiction-2026.11-v2',
    ...extra,
  };
}

/** A workspace with `jurReadings` for every chain node in every declared week. */
function seededState({ values = [10, 11, 12, 30], weeks = WEEKS.slice(0, 4), nodes = null } = {}) {
  const state = buildDemoState(NOW);
  const chain = buildChain(state, { now: NOW, settings: state.settings });
  const ids = nodes || [...chain.nodes.keys()];
  const rows = [];
  weeks.forEach((week, i) => {
    for (const nodeId of ids) rows.push(reading(nodeId, week, 100, values[i] ?? values.at(-1), 2));
  });
  state.jurReadings = rows;
  state.jurFindings = [];
  state.jurMarkers = [];
  return { state, chain, ids };
}

function harness({ rules = [jurisdictionRule] } = {}) {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-drift-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory, postCommitRules: rules });
  store.load();
  store.seedDemo();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

/* --------------------------------------------------------- 1. storage */

test('the objective denominator is additive, nullable and fail-closed', () => {
  const warnings = [];
  const fresh = normalizeJurReadings([reading('person-demo-3', WEEKS[0], 12, 3)], warnings);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].objectives, 12);
  assert.deepEqual(warnings, []);
  const legacy = clone(fresh[0]);
  delete legacy.objectives;
  assert.equal(normalizeJurReadings([legacy], warnings)[0].objectives, null,
    'a pre-ADR-0115 reading must refuse its share, never inherit a number');
  assert.equal(normalizeJurReadings([{ ...clone(fresh[0]), objectives: 'nope' }], warnings)[0].objectives, null);
  // Declared, clamped, printed by the EXISTING conventions command.
  const conv = jurConventions({ jurDriftMinWeeks: 999, jurDriftCoveragePct: 1, jurDriftMaxWeeks: 999 });
  assert.equal(conv.jurDriftMinWeeks, JUR_CONVENTION_DEFAULTS.jurDriftMinWeeks);
  assert.equal(conv.jurDriftCoveragePct, JUR_CONVENTION_DEFAULTS.jurDriftCoveragePct);
  assert.equal(conv.jurDriftMaxWeeks, JUR_CONVENTION_DEFAULTS.jurDriftMaxWeeks);
  assert.equal(jurDriftConventions({}).minWeeks, 4);
  assert.equal(jurDriftConventions({}).coverage, 0.66);
  // The denominator is derived from the same priced book, not a second harvest.
  const { state } = seededState({ weeks: WEEKS.slice(0, 1) });
  const book = buildJurisdictionBook(state, { now: NOW });
  assert.ok(Array.isArray(book.allClusters));
  const roll = jurSpanRollUp(state, { nodeId: 'leader', now: NOW });
  assert.equal(roll.ok, true);
  assert.ok(Number.isInteger(roll.objectives) && roll.objectives >= roll.crossBranch);
});

/* ----------------------------------------------------- 2. statistics */

test('the conformal band is hand-computable and refuses weak evidence by name', () => {
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 2, 9]), 3);
  assert.equal(medianOf([]), null);

  // Deltas +2, -1, +9. Calibration |Δ| = [2, 1] → sorted [1, 2], m=2,
  // k=ceil(3*0.66)=2, bound=2, achieved coverage 2/3, newest |Δ|=9 > 2.
  const band = conformalDriftBand([10, 12, 11, 20], { coverage: 0.66, minWeeks: 4 });
  assert.equal(band.status, 'published');
  assert.equal(band.m, 2);
  assert.equal(band.k, 2);
  assert.equal(band.bound, 2);
  assert.equal(band.currentDelta, 9);
  assert.equal(band.outside, true);
  assert.equal(band.coverageBound, 0.67);
  assert.equal(band.p, 0.33);
  assert.match(band.method, /Vovk/);

  assert.equal(conformalDriftBand([10, 12, 11], { minWeeks: 4 }).reason, 'drift-thin-series');
  assert.equal(conformalDriftBand([10, 12, 11, 20], { coverage: 0.9, minWeeks: 4 }).reason,
    'drift-thin-calibration', 'k=3 > n=2 at 90% coverage is refused, never +infinity');
  assert.equal(conformalDriftBand([10, 12, null, 20], { minWeeks: 4 }).reason,
    'drift-incomplete-series', 'a gap is not interpolated');
  const calm = conformalDriftBand([10, 11, 12, 12], { coverage: 0.66, minWeeks: 4 });
  assert.equal(calm.outside, false);
  assert.equal(calm.bound, 1);
});

test('the report refuses below the declared week floor and counts unsampled weeks', () => {
  const thin = seededState({ weeks: WEEKS.slice(0, 3), values: [10, 11, 12] });
  const refused = buildJurisdictionDrift(thin.state, { now: NOW });
  assert.equal(refused.status, 'refused');
  assert.equal(refused.reason, 'drift-thin-series');
  assert.equal(refused.verdict, 'refused');
  assert.equal(refused.reasonText, JUR_REFUSALS['drift-thin-series']);

  const empty = buildJurisdictionDrift({ jurReadings: [] }, { now: NOW });
  assert.equal(empty.reason, 'drift-no-readings');
  assert.equal(empty.windowN, 0);

  assert.equal(countedWeekGaps([{ week: '2026-10-05' }, { week: '2026-10-12' }]), 0);
  assert.equal(countedWeekGaps([{ week: '2026-10-05' }, { week: '2026-10-26' }]), 2);
  const gapped = seededState({ weeks: ['2026-10-05', '2026-10-12', '2026-10-26', '2026-11-02'], values: [10, 11, 12, 30] });
  assert.equal(buildJurisdictionDrift(gapped.state, { now: NOW }).gapWeeks, 1);
});

/* ------------------------------------------- 3. aggregation bias */

test('pooled rate and mean of unit rates are both printed, with their gap', () => {
  const state = {
    jurReadings: [
      reading('a', WEEKS[0], 10, 2, 3),
      reading('b', WEEKS[0], 2, 2, 4, { suppressed: 1 }),
    ],
  };
  const { weeks } = jurDriftWeeklySeries(state);
  assert.equal(weeks.length, 1);
  const w = weeks[0];
  // Pooled 4/12 = 33.3%; mean of (20%, 100%) = 60%; gap = -26.7 pp.
  assert.equal(w.pooledPct, 33.3);
  assert.equal(w.meanUnitPct, 60);
  assert.equal(w.compositionGapPct, -26.7);
  assert.equal(w.spansN, 2);
  assert.equal(w.suppressedN, 1, 'a suppressed cell is counted, not dropped or zeroed');
  assert.equal(w.medianCoalition, 3.5);
  assert.equal(w.reason, null);

  // A legacy reading with no denominator is a REFUSAL, not 100% or zero.
  const legacyState = { jurReadings: [{ ...reading('a', WEEKS[0], 10, 2), objectives: null }] };
  const legacy = jurDriftWeeklySeries(legacyState).weeks[0];
  assert.equal(legacy.pooledPct, null);
  assert.equal(legacy.reason, 'drift-no-denominator');
  assert.equal(legacy.reasonText, JUR_REFUSALS['drift-no-denominator']);
});

test('a published band crossing grades DRIFT with a direction; raising coverage refuses it', () => {
  const { state } = seededState({ values: [10, 11, 12, 30] });
  const report = buildJurisdictionDrift(state, { now: NOW });
  assert.equal(report.status, 'published');
  assert.equal(report.verdict, 'drift');
  assert.equal(report.direction, 'up');
  assert.deepEqual(report.outside.map((o) => o.metric), ['share']);
  assert.equal(report.windowN, 4);
  assert.equal(report.bands.share.bound, 1);
  assert.equal(report.bands.coalition.outside, false, 'a flat coalition series stays inside its own band');
  assert.equal(report.weeks.at(-1).pooledPct, 30);
  assert.equal(report.totals.objectives, 100 * 8 * 4);

  const strict = buildJurisdictionDrift(state, {
    now: NOW, settings: { ...state.settings, jurDriftCoveragePct: 90 },
  });
  assert.equal(strict.status, 'refused');
  assert.equal(strict.verdict, 'refused');
  assert.equal(strict.bands.share.reason, 'drift-thin-calibration');
  assert.match(strict.reasonText, /coverage/i);
});

/* ------------------------------------------- 4. hierarchy & disclosure */

test('a declared seat reads only its own subtree; brief and CSV are identity-free', () => {
  const { state } = seededState({ values: [10, 11, 12, 30] });
  const frontier = { ...state, settings: { ...state.settings, activeSeatId: 'person-demo-3' } };
  const read = jurDriftRead(frontier, { now: NOW, settings: frontier.settings });
  assert.equal(read.rank, 1);
  assert.equal(read.withheld, false);
  assert.equal(read.scopeLabel, 'Your span');
  assert.equal(read.question, JUR_DRIFT_ALTITUDE_QUESTIONS.frontline);
  assert.equal(read.weeks[0].spansN, 2, 'only the two nodes in this frontline span’s reporting subtree');
  assert.ok(read.weeks[0].spansN < state.jurReadings.length / 4, 'peer spans are outside the scope');

  const vp = { ...state, settings: { ...state.settings, activeSeatId: 'person-demo-12' } };
  const vpRead = jurDriftRead(vp, { now: NOW, settings: vp.settings });
  assert.equal(vpRead.rank, 4);
  assert.equal(vpRead.withheld, true);
  assert.equal(vpRead.scopeLabel, 'Your function');
  assert.equal(vpRead.question, JUR_DRIFT_ALTITUDE_QUESTIONS.exec);
  assert.ok(vpRead.weeks[0].spansN < state.jurReadings.length / 4, 'the enterprise reading is not silently reused');

  const enterprise = jurDriftRead(state, { now: NOW });
  assert.equal(enterprise.fullAccess, true);
  assert.equal(enterprise.scopeLabel, 'Enterprise');
  assert.equal(enterprise.question, JUR_DRIFT_ALTITUDE_QUESTIONS.chief);
  for (const read2 of [read, vpRead, enterprise]) {
    const text = `${read2.brief} ${JSON.stringify(read2.rows)}`;
    assert.ok(!/person-demo-|leader|goal:|case-demo-|dec-jur-/.test(text),
      'no span id, person, objective key or note reaches an upward reading');
    assert.match(read2.brief, /pooled cross-branch share/);
    assert.match(read2.brief, /Yule|Simpson/);
    for (const row of read2.rows) {
      for (const key of Object.keys(row)) assert.ok(JUR_DRIFT_CSV_COLUMNS.includes(key), key);
    }
  }
  // A BLANK is a refusal, never a printed zero in the CSV.
  const legacy = { ...state, jurReadings: state.jurReadings.map((r) => ({ ...r, objectives: null })) };
  const legacyRows = jurDriftCsvRows(buildJurisdictionDrift(legacy, { now: NOW }), { rank: 5 });
  assert.ok(legacyRows.some((r) => r.pooled_pct === null && r.reason_code === 'drift-no-denominator'));
  assert.equal(serializeCsv(JUR_DRIFT_CSV_COLUMNS.map((key) => ({ key, header: key })), legacyRows).includes('drift-no-denominator'), true);
  assert.doesNotMatch(jurDriftBrief(buildJurisdictionDrift(legacy, { now: NOW }), { rank: 5 }), /NaN|undefined/);
});

/* --------------------------------------------------- 5. automation */

test('RULE-JUR-05 governs one drift decision per ISO week with vertical roll-up', () => {
  const { store, api } = harness();
  // The fixture MUST include the current ISO week, otherwise the full scan
  // legitimately freezes a fifth week of real readings during the command.
  const { state: fixture } = seededState({ values: [10, 11, 12, 30], weeks: WEEKS.slice(1) });
  store.update((draft) => {
    draft.jurReadings = clone(fixture.jurReadings);
    draft.jurFindings = [];
    draft.jurMarkers = [];
  }, { type: 'drift.fixture', entity: 'workspace', entityId: 'fixture', summary: 'Seed four frozen ISO weeks' });

  const before = store.state.decisions.length;
  const result = api.jurDriftScan();
  assert.equal(result.ok, true);
  assert.equal(result.report.verdict, 'drift');
  const drift = store.state.decisions.filter((d) => /\[RULE-JUR-05:/.test(String(d?.question || '')));
  assert.equal(drift.length, 1, 'exactly one governed ask per ISO week');
  assert.equal(drift[0].chosen, '', 'the engine never accepts its own proposal');
  assert.equal(drift[0].options.length, JUR_DRIFT_OPTIONS.length);
  assert.match(drift[0].question, /Declared|DECLARED exchangeability/);
  const rollUps = (store.state.links || []).filter((l) => l.relation === 'rolls-up-to'
    && l.sourceType === 'decision' && l.sourceId === drift[0].id && l.ruleId === JUR_RULE_IDS.DRIFT);
  assert.ok(rollUps.length >= 1, 'the governed ask is visible above the sending span');
  assert.ok(rollUps.every((l) => l.targetType === 'person' && l.targetId !== 'leader'));
  assert.ok(store.state.jurMarkers.some((m) => m.includes('JUR-DRIFT:2026-11-02')));
  assert.equal(store.state.jurFindings.some((f) => /RULE-JUR-05/.test(String(f.objectiveKey))), false,
    'engine-authored governance is never priced back as work');

  // IDEMPOTENCE: a second scan in the same ISO week invents nothing new.
  const decisionsAfter = store.state.decisions.length;
  const linksAfter = store.state.links.length;
  api.jurDriftScan();
  assert.equal(store.state.decisions.filter((d) => /\[RULE-JUR-05:/.test(String(d?.question || ''))).length, 1);
  assert.equal(store.state.decisions.length, decisionsAfter);
  assert.equal(store.state.links.length, linksAfter);
  assert.ok(store.state.decisions.length > before);
});

test('an ordinary scan opens no drift decision; a calm series opens none either', () => {
  const { store, api } = harness();
  const { state: fixture } = seededState({ values: [10, 10, 10, 10], weeks: WEEKS.slice(1) });
  store.update((draft) => {
    draft.jurReadings = clone(fixture.jurReadings);
    draft.jurFindings = [];
    draft.jurMarkers = [];
  }, { type: 'drift.fixture', entity: 'workspace', entityId: 'fixture', summary: 'Seed a flat series' });
  assert.equal(api.jurScan().ok, true);
  assert.equal(store.state.decisions.filter((d) => /\[RULE-JUR-05:/.test(String(d?.question || ''))).length, 0,
    'jur.scan is unchanged; only the named drift command grades the series');
  assert.equal(api.jurDriftScan().report.verdict, 'within-band');
  assert.equal(store.state.decisions.filter((d) => /\[RULE-JUR-05:/.test(String(d?.question || ''))).length, 0);
  assert.equal(store.state.jurMarkers.some((m) => m.includes('JUR-DRIFT:')), false);
});

test('the new command and reads are registered in the access gateway', () => {
  assert.equal(API_RIGHTS.jurDriftScan, 'record-jurisdiction');
  for (const name of ['jurDriftRead', 'jurDriftCsvRows', 'jurDriftBriefText']) assert.ok(SAFE_READS.has(name), name);
  assert.ok(JUR_PANELS.some((p) => p.key === 'drift'));
  assert.equal(JUR_RULE_IDS.DRIFT, 'RULE-JUR-05');
});

/* ------------------------------------------------------------- 6. UI */

test('the drift panel renders at every altitude and is axe-clean', async () => {
  const { state } = seededState({ values: [10, 11, 12, 30] });
  const { store, api } = harness();
  store.update((draft) => {
    draft.jurReadings = clone(state.jurReadings);
  }, { type: 'drift.fixture', entity: 'workspace', entityId: 'fixture', summary: 'Seed frozen weeks' });
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', { url: 'https://leados.test/#/jurisdiction?panel=drift' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  const AXE_SRC = fs.readFileSync(path.resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
  for (const seatId of [null, 'person-demo-3', 'person-demo-12']) {
    const scoped = { ...store.state, settings: { ...store.state.settings, activeSeatId: seatId } };
    const ctx = {
      state: scoped, store, api, now: NOW, query: new URLSearchParams('panel=drift'),
      navigate() {}, refresh() {}, render() {},
    };
    const node = renderJurisdiction(ctx);
    assert.equal(node.querySelectorAll('h1').length, 1);
    assert.ok(node.querySelector('[data-jur-drift]'), 'the drift panel is mounted');
    assert.ok(node.querySelector('table'), 'the weekly series is printed');
    assert.match(node.textContent, /Cross-week verdict/);
    assert.match(node.textContent, /pooled|Pooled/);
    document.getElementById('view').replaceChildren(node);
    dom.window.eval(AXE_SRC);
    const results = await dom.window.axe.run(node, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => v.id), [], `seat ${seatId || 'operator'} is axe-clean`);
  }
  dom.window.close();
});
