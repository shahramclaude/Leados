import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { analyzeRobustness, robustnessCaseInput, robustnessWorksheet, parseRobustnessWorksheet, ROBUSTNESS_DUTIES } from '../../app/core/domain/decisionRobustness.js';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, resolveSeat, seatDigest } from '../../app/core/domain/seat.js';
import { postureFor } from '../../app/core/domain/disclosure.js';
import { scopedViewState } from '../../app/core/domain/viewScope.js';
import { renderDecisionRobustness } from '../../app/views/decisionRobustness.js';

const NOW = new Date('2026-11-05T12:00:00Z');
const BASE = { mean: 2, coverage: 50, missingLow: 1, missingHigh: 5, target: 3, cost: 20, loss: 100, effectiveness: 50 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  Object.assign(state.settings, { chainLeaderAltitude: 'chief', activeSeatId: 'lead', seatAutoPropagate: true, seatMaxLinks: 100 });
  state.people = [
    ['vp', 'vp', null], ['director', 'director', 'vp'], ['manager', 'manager', 'director'],
    ['lead', 'lead', 'manager'], ['worker', 'ic', 'lead'], ['peer', 'lead', 'manager'], ['outsider', 'ic', 'peer'],
  ].map(([id, level, managerId]) => ({ id, name: id, level, managerId, status: 'active', createdAt: '2025-01-01T00:00:00Z' }));
  state.pulses = [{ id: 'PRIVATE-PULSE', comment: 'NEVER-COPY-COMMENT', date: '2026-11-05', scores: { safety: 1, clarity: 2, workload: 3, growth: 4 } }];
  return state;
}
function command(overrides = {}) {
  return robustnessCaseInput({ analysis: analyzeRobustness(BASE), choice: 'act', ownerId: 'worker',
    reviewOn: '2026-11-12', plan: 'Trial a shorter handover; review whether unresolved handovers fall next week.',
    rationale: 'Reversible scope and a written stop condition make this experiment appropriate.', altitude: 'frontline', ...overrides });
}
function setup() {
  let seq = 0;
  const idFactory = (p) => `${p}-robust-${++seq}`;
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const store = createStore({ storage, now: () => NOW, idFactory }); store.load();
  store.update((draft) => Object.assign(draft, fixture()), { type: 'fixture.loaded', entity: 'workspace' });
  return { store, api: createApi(store, { now: () => NOW, idFactory }), storage };
}

test('Manski bounds, endpoint losses, Savage regrets and the switch price are computed explicitly', () => {
  const r = analyzeRobustness(BASE);
  assert.equal(r.ok, true); close(r.low, 1.5); close(r.high, 3.5);
  close(r.actRegret, 20); close(r.waitRegret, 55); close(r.costSwitch, 37.5);
  assert.equal(r.preferred, 'act'); assert.equal(r.dominance, 'none'); assert.equal(r.threshold, 'crosses');
  assert.equal(analyzeRobustness({ ...BASE, cost: 37.5 }).preferred, 'tie');
  assert.equal(r.sensitivity.length, 5);
});

test('zero/full coverage, zero cost/effectiveness/loss, exact ties and target kinks stay honest', () => {
  let r = analyzeRobustness({ ...BASE, coverage: 0 }); close(r.low, 1); close(r.high, 5);
  r = analyzeRobustness({ ...BASE, coverage: 100 }); close(r.low, 2); close(r.high, 2); assert.equal(r.dominance, 'act');
  r = analyzeRobustness({ ...BASE, effectiveness: 0 }); assert.equal(r.preferred, 'wait'); close(r.regretCeiling, 0);
  r = analyzeRobustness({ ...BASE, effectiveness: 0, cost: 0 }); assert.equal(r.preferred, 'tie');
  r = analyzeRobustness({ ...BASE, loss: 0 }); assert.equal(r.preferred, 'wait');
  r = analyzeRobustness({ ...BASE, coverage: 100, mean: 3, cost: 0 }); assert.equal(r.preferred, 'tie'); assert.equal(r.threshold, 'meets');
});

test('missing, malformed and impossible inputs fail rather than coerce unknown to zero', () => {
  for (const bad of [null, undefined, '', ' ', false, true, NaN, Infinity, [], {}]) {
    assert.equal(analyzeRobustness({ ...BASE, cost: bad }).ok, false, String(bad));
  }
  for (const patch of [{ coverage: 101 }, { mean: 0 }, { effectiveness: -1 }, { cost: -1 }, { missingLow: 4, missingHigh: 2 }]) {
    assert.equal(analyzeRobustness({ ...BASE, ...patch }).ok, false);
  }
  assert.equal(analyzeRobustness(Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, String(v)]))).ok, true);
});

test('500 deterministic scenarios match an independent dense regret oracle; narrower assumptions cannot enlarge the identified set', () => {
  let seed = 891;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 500; i++) {
    const missingLow = 1 + random() * 4;
    const v = { mean: 1 + random() * 4, coverage: random() * 100, missingLow,
      missingHigh: missingLow + random() * (5 - missingLow), target: 1 + random() * 4,
      cost: random() * 100, loss: random() * 100, effectiveness: random() * 100 };
    const r = analyzeRobustness(v);
    let act = 0; let wait = 0;
    for (let j = 0; j <= 100; j++) {
      const missing = v.missingLow + (v.missingHigh - v.missingLow) * j / 100;
      const mean = v.coverage / 100 * v.mean + (1 - v.coverage / 100) * missing;
      const w = v.loss * Math.max(0, v.target - mean);
      const a = v.cost + (1 - v.effectiveness / 100) * w;
      act = Math.max(act, a - Math.min(a, w)); wait = Math.max(wait, w - Math.min(a, w));
    }
    close(r.actRegret, act); close(r.waitRegret, wait);
    assert.ok(r.low >= r.unrestricted.low - 1e-9); assert.ok(r.high <= r.unrestricted.high + 1e-9);
  }
});

test('explicit handoff requires owner, choice, plan and rationale and excludes numeric worksheet data', () => {
  for (const patch of [{ analysis: null }, { choice: 'tie' }, { ownerId: '' }, { plan: 'fix' }, { rationale: '' }]) assert.equal(command(patch).ok, false);
  const c = command(); assert.equal(c.ok, true);
  assert.equal(c.data.fmea, undefined); assert.equal(c.data.financial, undefined);
  assert.equal(c.data.propagateDecision, true); assert.equal(c.data.propagateDelegation, true);
  const text = JSON.stringify(c.data); assert.doesNotMatch(text, /"actRegret"|"coverage"|"missingLow"|PRIVATE-PULSE|NEVER-COPY/);
  const worksheet = JSON.parse(robustnessWorksheet(analyzeRobustness(BASE)));
  assert.deepEqual(worksheet.assumptions, BASE); assert.match(worksheet.warning, /not confidence intervals/);
});

test('one frontline approval creates case + DACI + owned task + every roster ancestor and CEO digest; survives reload', () => {
  const { store, api, storage } = setup();
  const result = api.addCase(command().data); assert.equal(result.ok, true, result.error);
  const related = store.state.links.filter((l) => l.sourceType === 'case' && l.sourceId === result.id);
  assert.ok(related.some((l) => l.relation === 'decides' && l.targetType === 'decision'));
  assert.ok(related.some((l) => l.relation === 'mitigates' && l.targetType === 'delegation'));
  for (const id of ['lead', 'manager', 'director', 'vp']) assert.ok(related.some((l) => l.relation === 'rolls-up-to' && l.targetId === id), id);
  const built = buildSeats(store.state, { now: NOW });
  const digest = seatDigest(store.state, resolveSeat(built, 'leader'), built, { now: NOW, settings: store.state.settings });
  assert.ok(digest.counts.openN > 0);
  const operational = JSON.stringify({ cases: store.state.cases, decisions: store.state.decisions, delegations: store.state.delegations, links: store.state.links });
  assert.doesNotMatch(operational, /PRIVATE-PULSE|NEVER-COPY-COMMENT/);
  assert.ok(store.state.events.some((e) => e.type === 'case.created' && e.entityId === result.id));
  assert.equal(api.refreshCaseAutomation(result.id).ok, true);
  assert.equal(store.state.links.filter((l) => l.sourceId === result.id && l.relation === 'decides').length, 1);
  assert.equal(store.state.links.filter((l) => l.sourceId === result.id && l.relation === 'mitigates').length, 1);
  const loaded = createStore({ storage, now: () => NOW }); loaded.load();
  assert.ok(loaded.state.cases.some((c) => c.id === result.id));
  assert.ok(normalizeState(loaded.state, { now: NOW }).state.links.some((l) => l.sourceId === result.id && l.relation === 'mitigates'));
});

test('existing command gateway refuses peer owners, stale seats and invalid dates without creating cases', () => {
  const { store, api } = setup();
  assert.equal(api.addCase(command({ ownerId: 'outsider' }).data).ok, false);
  assert.equal(api.addCase(command({ reviewOn: '2026-02-30' }).data).ok, false);
  assert.equal(store.state.cases.length, 0);
  store.update((draft) => { draft.settings.activeSeatId = 'deleted-seat'; }, { type: 'fixture.loaded', entity: 'workspace' });
  assert.equal(api.addCase(command().data).ok, false); assert.equal(store.state.cases.length, 0);
});

function boot() {
  const dom = new JSDOM('<!doctype html><html lang="en"><head><title>Robustness test</title></head><body><main></main></body></html>', { url: 'http://localhost', runScripts: 'outside-only' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  return dom;
}
function fill(root, values) {
  for (const [key, value] of Object.entries(values)) root.querySelector(`[name="${key}"]`).value = String(value);
}
function submit(dom, form) { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); }

test('all five altitude views use the declared scope, expose no private responses and have distinct duties/review horizons', () => {
  boot(); const state = fixture(); const built = buildSeats(state, { now: NOW });
  for (const [seatId, altitude] of [['lead', 'frontline'], ['manager', 'manager'], ['director', 'director'], ['vp', 'exec'], ['leader', 'chief']]) {
    const seat = resolveSeat(built, seatId); const seatContext = { seat, built };
    const projected = scopedViewState(state, seatContext, { now: NOW });
    const node = renderDecisionRobustness({ state: projected, seatContext, now: NOW, api: {} });
    assert.equal(postureFor(state, seat, built, 'decision-robustness', { now: NOW }).posture, 'detail');
    assert.ok(node.textContent.includes(ROBUSTNESS_DUTIES[altitude].question));
    assert.doesNotMatch(node.textContent, /PRIVATE-PULSE|NEVER-COPY-COMMENT/);
    const ids = [...node.querySelectorAll('select[name="ownerId"] option')].map((o) => o.value).filter(Boolean);
    assert.ok(ids.every((id) => seat.scope.has(id)));
    if (seatId === 'lead') assert.ok(!ids.includes('outsider'));
  }
});

test('keyboard form analysis, stale-input invalidation, private-download fallback and one-shot reviewed submission work', () => {
  const dom = boot(); let submitted = 0; let navigated = '';
  const root = renderDecisionRobustness({ state: fixture(), now: NOW, api: { addCase: () => { submitted++; return { ok: true, id: 'new-case', propagations: [] }; } }, navigate: (r) => { navigated = r; } });
  document.querySelector('main').append(root);
  fill(root, BASE); submit(dom, root.querySelectorAll('form')[0]);
  assert.match(root.querySelector('[data-testid="robustness-results"]').textContent, /1.50–3.50/);
  const originalCreateURL = URL.createObjectURL;
  URL.createObjectURL = undefined;
  try { [...root.querySelectorAll('button')].find((b) => b.textContent.includes('Export private')).click(); }
  finally { URL.createObjectURL = originalCreateURL; }
  assert.match(root.textContent, /Download unavailable/);
  root.querySelector('[name="cost"]').dispatchEvent(new dom.window.Event('input'));
  assert.equal(root.querySelectorAll('form')[1].querySelector('button[type="submit"]').disabled, true);
  assert.equal(root.querySelector('[data-testid="robustness-results"]').textContent, '');
  submit(dom, root.querySelectorAll('form')[0]);
  fill(root, { ownerId: 'worker', choice: 'wait', plan: 'Review unresolved handovers after one week without expanding collection.', rationale: 'The reversible monitoring option fits our current operating constraints.' });
  submit(dom, root.querySelectorAll('form')[1]); submit(dom, root.querySelectorAll('form')[1]);
  assert.equal(submitted, 1); assert.equal(navigated, '#/case/new-case');
});

test('analyzed screen is axe-clean (jsdom; color contrast requires a real browser)', async () => {
  const dom = boot();
  const root = renderDecisionRobustness({ state: fixture(), now: NOW, api: {} }); document.querySelector('main').append(root);
  fill(root, BASE); submit(dom, root.querySelectorAll('form')[0]);
  const require = createRequire(import.meta.url);
  dom.window.eval(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
  const report = await dom.window.axe.run(dom.window.document, { rules: { 'color-contrast': { enabled: false } } });
  assert.equal(report.violations.length, 0, JSON.stringify(report.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))));
  dom.window.close();
});


test('private worksheet replay validates version/size/assumptions and ignores forged result claims', () => {
  const json = JSON.parse(robustnessWorksheet(analyzeRobustness(BASE)));
  json.results = { preferred: 'wait', low: 0, high: 0 };
  const replay = parseRobustnessWorksheet(JSON.stringify(json));
  assert.equal(replay.ok, true); assert.equal(analyzeRobustness(replay.assumptions).preferred, 'act');
  for (const raw of ['not JSON', 'x'.repeat(65537), 'null', JSON.stringify({ ...json, version: 'future' }), JSON.stringify({ ...json, assumptions: { ...BASE, cost: null } })]) {
    assert.equal(parseRobustnessWorksheet(raw).ok, false);
  }
});
