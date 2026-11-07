import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const now = new Date('2026-11-07T12:00:00Z');

test('real cover and hierarchy roll-up produce a scoped, anonymous branch comparison on the chief desk', () => {
  const raw = createEmptyState(now.toISOString());
  raw.settings = { ...raw.settings, activeSeatId: 'lead-a', chainLeaderAltitude: 'chief' };
  raw.people = [
    { id: 'vp-a', name: 'VP Alpha', level: 'vp', status: 'active' },
    { id: 'lead-a', name: 'Lead Alpha', level: 'lead', managerId: 'vp-a', status: 'active' },
    { id: 'ic-a', name: 'Person Alpha', level: 'ic', managerId: 'lead-a', status: 'active' },
    { id: 'vp-b', name: 'VP Beta', level: 'vp', status: 'active' },
    { id: 'lead-b', name: 'Lead Beta', level: 'lead', managerId: 'vp-b', status: 'active' },
    { id: 'ic-b', name: 'Person Beta', level: 'ic', managerId: 'lead-b', status: 'active' },
    { id: 'lead-c', name: 'Lead Gamma', level: 'lead', managerId: 'vp-b', status: 'active' },
    { id: 'ic-c', name: 'Person Gamma', level: 'ic', managerId: 'lead-c', status: 'active' },
  ];
  raw.oneOnOnes = [{ id: 'meeting', personId: 'ic-a', date: '2026-11-06', status: 'held', agenda: [], actions: [] }];
  const state = normalizeState(raw, { now }).state;
  const saved = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) };
  let seq = 0;
  const store = createStore({ storage, now: () => now, idFactory: (p) => `${p}-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => now, idFactory: (p) => `${p}-${++seq}` });
  const result = api.dutyCoverageDesignate({ dutyId: 'lead-a|coach', coverId: 'lead-a', note: 'The lead rehearses the coaching cadence.' });
  assert.ok(result.ok, result.error);
  assert.ok(store.state.links.some((l) => l.relation === 'rolls-up-to' && l.targetId === 'vp-a'));
  assert.ok(api.setActiveSeat('leader', { reason: 'review enterprise continuity' }).ok);
  const report = api.dutyCoverageReport().report;
  const c = report.branchCoverage;
  assert.equal(c.branches.length, 2);
  assert.equal(c.branches[0].coveredN, 1);
  assert.equal(c.branches[1].coveredN, 0);
  assert.ok(c.branches[1].dutiesN > c.branches[0].dutiesN, 'unequal branch sizes');
  assert.equal(c.branches.reduce((n, b) => n + b.dutiesN, c.ownN), report.summary.dutiesN);
  assert.notEqual(c.pooledPct, c.meanPct, 'pooled and unweighted rates do not conflate composition');
  assert.doesNotMatch(JSON.stringify(c), /Alpha|Beta|lead-a|vp-a|ic-a/);
  assert.match(api.dutyCoverageBriefText().text, /mean branch readiness/);
  store.load();
  assert.deepEqual(api.dutyCoverageReport().report.branchCoverage, c, 'derived view survives reload');

  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', { url: 'https://leados.test/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement']) globalThis[key] = dom.window[key];
  const node = renderDutyCover({ api, query: new URLSearchParams('panel=desk'), navigate() {}, refresh() {} });
  dom.window.document.querySelector('main').append(node);
  assert.match(node.textContent, /Continuity across direct branches/);
  assert.match(node.textContent, /mean of branch rates/);
  assert.match(node.textContent, /not a forecast/);
  assert.ok(api.setActiveSeat('vp-a', { reason: 'review own span' }).ok);
  const single = api.dutyCoverageReport().report.branchCoverage;
  assert.equal(single.branches.length, 1, 'peer branch excluded');
  assert.match(single.refusal, /At least two branches/);
  assert.ok(api.setActiveSeat('lead-a', { reason: 'return to work' }).ok);
  assert.equal(api.dutyCoverageReport().report.branchCoverage, null);
  dom.window.close();
});
