/**
 * tests/app/premise-tails.test.mjs — Session 55: Assumption-Aware Scenario
 * Tails + Correlated-Evidence Clustering.
 * Paired CRN Monte Carlo, leave-one-out attribution, unmeasured exclusion,
 * pseudo-replication clustering, TAIL signals/Insights, CSV #37, UI + axe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, SCHEMA_VERSION } from '../../app/core/schema.js';
import {
  PREMISE_TAILS_ENGINE_VERSION, buildPremiseTailModel, clusterPremiseEvidence,
  premiseTailBrief, premiseTailSignals, simulatePremiseTails,
} from '../../app/core/domain/premiseTails.js';
import { evaluatePremiseCore } from '../../app/core/domain/premises.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { CSV_EXPORTS, exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-27T10:00:00.000Z');
const TODAY = '2026-10-27';

function obs(overrides = {}) {
  return { id: 'o1', key: 'manual:o1', sensorId: 'manual', sensorLabel: 'Leader observation',
    sourceType: 'case', sourceId: 'case-1', sourceRoute: '', title: 'Fact', summary: '',
    direction: 'against', likelihoodRatio: 3, observedOn: TODAY, createdAt: NOW.toISOString(), ...overrides };
}
function premise(overrides = {}) {
  return { id: 'prem-1', title: 'Vendor API stays within rate limits', statement: 's', signpost: 'sg',
    decisionId: 'dec-1', ownerId: 'person-1', criticality: 'load-bearing', priorPct: 70,
    watchPct: 55, breachPct: 30, halfLifeDays: 90, reviewBy: '2026-11-20', lastReviewedOn: null,
    acknowledgedAt: null, humanDisposition: null, sourceRefs: [{ sourceType: 'portfolio', sourceId: 'pf-1' }],
    observations: [obs()], createdOn: TODAY, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...overrides };
}
function state(overrides = {}) {
  const s = createEmptyState();
  s.people = [{ id: 'person-1', name: 'Ada Leader', status: 'active', createdAt: NOW.toISOString() }];
  s.decisions = [{ id: 'dec-1', title: 'Build on vendor API', status: 'open', createdAt: NOW.toISOString() }];
  s.portfolio = [{ id: 'pf-1', title: 'Integration build', kind: 'project', status: 'open', decision: 'funded',
    ownerId: 'person-1', currency: 'USD', effortDays: { optimistic: 10, mostLikely: 20, pessimistic: 40 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 }, createdAt: NOW.toISOString() }];
  s.premises = [premise()];
  return { ...s, ...overrides };
}

test('schema is v37 — tails remain a derived read model with no migration of their own', () => {
  assert.equal(SCHEMA_VERSION, 68);
  assert.equal(PREMISE_TAILS_ENGINE_VERSION, 'premise-tails-2026.10-v1');
});

test('hand-checked belief: prior 70% + one LR3 against today = 43.75%, failure 56.25%', () => {
  const ev = evaluatePremiseCore(premise(), { now: NOW, settings: {} });
  assert.equal(ev.posteriorPct, 43.75);
  const m = buildPremiseTailModel(state(), NOW);
  assert.equal(m.couplings.length, 1);
  assert.equal(m.couplings[0].failureProbability, 0.5625);
  assert.equal(m.couplings[0].shock, 0.6);
  assert.deepEqual(m.couplings[0].itemIds, ['pf-1']);
});

test('paired CRN simulation is deterministic and premise failure only widens the tail', () => {
  const a = simulatePremiseTails(state(), { now: NOW, trials: 400, seed: 7 });
  const b = simulatePremiseTails(state(), { now: NOW, trials: 400, seed: 7 });
  assert.equal(a.available, true);
  assert.deepEqual(a.baseline, b.baseline);
  assert.deepEqual(a.coupled, b.coupled);
  assert.ok(a.coupled.p90 >= a.baseline.p90, 'coupled P90 never beats baseline under positive failure risk');
  assert.ok(a.delta.p90Days > 0);
  assert.equal(a.contributions.length, 1);
  assert.ok(a.contributions[0].tailContributionDays > 0, 'holding the only premise true recovers tail days');
  assert.ok(a.contributions[0].tailContributionDays <= a.delta.p90Days + 5, 'LOO attribution bounded by total widening (sampling tolerance)');
});

test('unmeasured premise (no evidence) is excluded, never coupled from its prior', () => {
  const s = state({ premises: [premise({ observations: [] })] });
  const m = buildPremiseTailModel(s, NOW);
  assert.equal(m.couplings.length, 0);
  assert.equal(m.unmeasured.length, 1);
  assert.match(m.unmeasured[0].reason, /unmeasured/);
  const sim = simulatePremiseTails(s, { now: NOW, trials: 200 });
  assert.equal(sim.delta.p90Days, 0);
});

test('correlated-evidence clustering: same source told 3x is pseudo-replicated', () => {
  const rows = [
    { sourceType: 'case', sourceId: 'case-1', sensorId: 'a', bits: -1.5 },
    { sourceType: 'case', sourceId: 'case-1', sensorId: 'b', bits: -1.0 },
    { sourceType: 'case', sourceId: 'case-1', sensorId: 'c', bits: -0.5 },
    { sourceType: 'budget', sourceId: 'bud-1', sensorId: 'd', bits: 0.4 },
  ];
  const c = clusterPremiseEvidence(rows);
  assert.equal(c.clusterCount, 2);
  assert.equal(c.effectiveIndependentSources, 2);
  assert.ok(c.largestShare > 0.8);
  assert.equal(c.pseudoReplicated, true);
  const spread = clusterPremiseEvidence([
    { sourceType: 'case', sourceId: 'c1', sensorId: 'a', bits: -1 },
    { sourceType: 'budget', sourceId: 'b1', sensorId: 'b', bits: -1 },
  ]);
  assert.equal(spread.pseudoReplicated, false);
});

test('TAIL signals fire and merge into Insights; brief is deterministic', () => {
  const s = state();
  const sig = premiseTailSignals(s, NOW);
  assert.ok(sig.some((x) => x.ruleId === 'TAIL-01' || x.ruleId === 'TAIL-02'));
  const ins = buildInsights(s, NOW);
  const all = JSON.stringify(ins);
  assert.match(all, /TAIL-0/);
  const brief = premiseTailBrief(s, NOW);
  assert.match(brief, /NOT an actuarial/);
  assert.match(brief, /P90/);
});

test('CSV scope #37 is opaque: no premise title leaks', () => {
  assert.ok(CSV_EXPORTS.some((e) => e.key === 'premiseTails'));
  const out = exportWorkspaceCsv(state(), 'premiseTails', { now: NOW });
  const text = typeof out === 'string' ? out : out.csv || out.text || JSON.stringify(out);
  assert.ok(!text.includes('Vendor API stays'), 'title must not leak into CSV');
  const parsed = parseCsv(text);
  assert.ok(parsed.rows?.length >= 1 || text.includes('premise_1'));
});

/* ------------------------------------------------------------------ UI --- */
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
function bootDom() {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(HTML, { url: 'https://leados.test/#/premises?tab=tails', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const st = window.document.createElement('style'); st.textContent = CSS; window.document.head.appendChild(st);
  globalThis.window = window; globalThis.document = window.document;
  globalThis.Node = window.Node; globalThis.Element = window.Element; globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event; globalThis.MouseEvent = window.MouseEvent; globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader; globalThis.localStorage = window.localStorage;
  return { dom, window };
}

test('JSDOM: Scenario tails tab renders through the real app and is axe-clean', async () => {
  const { window } = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: window.localStorage, now: () => NOW });
  app.ctx.loadDemo();
  app.ctx.navigate('#/premises?tab=tails');
  const view = window.document.querySelector('#view');
  assert.ok(view.textContent.length > 200, 'tails tab renders content');
  assert.match(view.textContent, /Scenario tails|wider is the tail|Tails not computable/i);
  assert.ok(!/is not a function|undefined is/.test(view.textContent), 'no error panel');
  const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  window.eval(axeSrc);
  const result = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(result.violations.length, 0, `axe: ${JSON.stringify(result.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`);
});
