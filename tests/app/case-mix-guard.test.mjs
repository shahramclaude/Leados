import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayKey } from '../../app/core/time.js';
import { caseMixOverlap, classTransport, harvestWorkItems, survivalReport, survivalSignals, survivalBrief } from '../../app/core/domain/survival.js';
import { rowConfidence } from '../../app/core/domain/waitCost.js';
import { survivalRule } from '../../app/core/domain/survivalRules.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';

const now = new Date('2026-10-31T12:00:00Z');
const ago = (n) => dayKey(addDays(now, -n));
function fixture() {
  const cohort = (prefix, age, kind) => Array.from({ length: 12 }, (_, i) => ({
    id: `${prefix}${i}`, title: `${prefix}${i}`, kind, status: 'resolved',
    openedOn: ago(age + i), resolvedOn: dayKey(addDays(ago(age + i), 10)),
  }));
  return { settings: { leaderName: 'Leader' }, people: [{ id: 'p1', name: 'Leader', status: 'active' }],
    cases: [...cohort('prior', 100, 'risk'), ...cohort('recent', 40, 'incident'),
      { id: 'open', title: 'Open case', kind: 'incident', status: 'open', openedOn: ago(5) }],
    decisions: [], delegations: [], links: [], survivalMarkers: [] };
}

test('mix uses fixed cohorts, total variation and observed support; thin or unknown refuses', () => {
  const items = harvestWorkItems(fixture(), now).items;
  const m = caseMixOverlap(items, dayKey(now));
  assert.equal(m.distance, 1); assert.deepEqual(m.missingPrior, ['incident']); assert.equal(m.challenged, true);
  const same = items.map((x) => ({ ...x, mixKind: 'risk' }));
  assert.equal(caseMixOverlap(same, dayKey(now)).distance, 0);
  assert.equal(caseMixOverlap(same, dayKey(now)).challenged, false);
  assert.equal(caseMixOverlap(same.slice(0, 4), dayKey(now)).available, false);
  same[0].mixKind = null;
  assert.equal(caseMixOverlap(same, dayKey(now)).available, false);
});

test('change of case mix lowers waiting confidence without changing price or declaring statistical drift', () => {
  const report = survivalReport(fixture(), now);
  const c = report.classes.find((x) => x.key === 'case');
  assert.equal(c.drift.changed, false); assert.equal(c.transport.headline, 'case-mix-challenge');
  const row = report.openItems.find((x) => x.item.sourceId === 'open');
  const price = { priced: true, source: 'declared', weekly: 500 };
  assert.equal(rowConfidence(row, price, { confidenceFloor: 10, minAtRisk: 4 }).level, 'low');
  assert.equal(price.weekly, 500);
  assert.ok(survivalSignals(fixture(), now).some((x) => x.ruleId === 'SURV-12'));
  assert.match(survivalBrief(fixture(), now), /CASE-MIX WARNING/);
});

test('future-dated terminal events remain censored until their date', () => {
  const state = { cases: [{ id: 'f', kind: 'risk', status: 'resolved', openedOn: ago(10), resolvedOn: '2026-11-02' }] };
  const item = harvestWorkItems(state, now).items[0];
  assert.equal(item.exitType, null); assert.equal(item.elapsedDays, 10);
  assert.equal(survivalReport(state, now).classes.find((x) => x.key === 'case').counts.completed, 0);
  assert.equal(harvestWorkItems(state, new Date('2026-11-03T12:00:00Z')).items[0].exitType, 'completed');
});

test('an unassessed axis cannot produce a supported headline', () => {
  assert.equal(classTransport({ drift: { available: true, changed: false, adjustedP: 1 } }).headline, 'not-assessed');
});

test('scan creates review, links and task, challenges frozen readings, and is idempotent', () => {
  const state = fixture(); state.survivalReadings = [{ id: 'r1', status: 'frozen', predictions: [{ classKey: 'case', probabilityPct: 40 }], notes: [] }];
  state.waitExposures = [{ id: 'wx-1', items: [{ classKey: 'case', sourceId: 'open' }] }];
  let id = 0; const ctx = { now, event: { type: 'survival.scan' }, idFactory: (p) => `${p}${++id}` };
  survivalRule(state, ctx);
  const decision = state.decisions.find((x) => x.title === 'Review operational case reference-class mix');
  assert.ok(decision); assert.ok(state.links.some((x) => x.sourceId === decision.id && x.targetId === 'open'));
  assert.ok(state.delegations.some((x) => x.title.includes('case-type mix')));
  assert.ok(state.links.some((x) => x.targetId === 'wx-1' && x.relation === 'tracks-followup'));
  assert.ok(state.delegations.some((x) => x.title.includes('case mix requires review')));
  assert.equal(state.survivalReadings[0].predictions[0].probabilityPct, 40);
  assert.ok(state.survivalReadings[0].notes.some((x) => x.text?.includes('case-type mix')));
  survivalRule(state, ctx);
  assert.equal(state.decisions.filter((x) => x.title === 'Review operational case reference-class mix').length, 1);
});

test('real scan commits review and typed links; reload preserves them', () => {
  const data = new Map(); const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  let id = 0; const idFactory = (p) => `${p}-mix-${++id}`;
  const store = createStore({ storage, now: () => now, idFactory }); store.load();
  store.update((draft) => Object.assign(draft, fixture()), { type: 'fixture.loaded', entity: 'workspace' });
  createApi(store, { now: () => now, idFactory }).scanSurvival();
  const d = store.state.decisions.find((x) => x.title === 'Review operational case reference-class mix');
  assert.ok(d); assert.ok(store.state.links.some((x) => x.sourceId === d.id && x.targetId === 'open'));
  const restored = createStore({ storage, now: () => now, idFactory }); restored.load();
  assert.ok(restored.state.decisions.some((x) => x.id === d.id));
  assert.ok(restored.state.links.some((x) => x.sourceId === d.id && x.targetId === 'open'));
});

test('classes panel renders the mix counts and the limitations', async () => {
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const { renderSurvival } = await import('../../app/views/survival.js');
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main></body></html>', {
    url: 'https://leados.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
  });
  const previous = {};
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    previous[key] = globalThis[key]; globalThis[key] = dom.window[key];
  }
  try {
    dom.window.document.getElementById('view').appendChild(renderSurvival({ state: fixture(), now,
      query: new URLSearchParams('panel=classes&class=case'), navigate: () => {},
      api: { scanSurvival: () => ({ ok: true }), survivalBriefText: () => '' } }));
    const text = dom.window.document.body.textContent;
    assert.match(text, /Case-type overlap/);
    assert.match(text, /incident: prior 0\/12, recent 12\/12/);
    assert.match(text, /Current labels can have changed since intake/);
    assert.match(text, /not a statistical test or proof of causal transport/);
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key];
    }
    dom.window.close();
  }
});
