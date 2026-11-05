/**
 * tests/app/terminal-publication.test.mjs — ADR-0096, registered publication
 * for the five terminals that used to apply their own per-table floor directly.
 *
 * The claims this suite proves:
 *   1. All five terminals (escalation, measurement, cadence, concordance,
 *      survival) declare a disclosure manifest, so each has a publishable
 *      aggregate — the precondition for entering the differencing register.
 *   2. PLAN works for every one of them from a declared seat: the planner
 *      reads the module's aggregate and returns a verdict against the register.
 *   3. PUBLISH writes exactly one dated register row for the module, and a
 *      second publication of the same table on the same day from the same seat
 *      is REFUSED by construction (the pairwise differencing attack).
 *   4. The register report then carries the module's route, so the terminal's
 *      series is audited as one integer system from then on.
 *   5. The shared publication panel renders axe-clean and wires both actions.
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

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { manifestFor, MANIFEST_ROUTES } from '../../app/core/domain/disclosureManifests.js';
import { publicationPanel } from '../../app/views/publicationPanel.js';

const NOW = new Date('2026-11-05T09:00:00.000Z');
const TARGET_ROUTES = ['escalation', 'measurement', 'cadence', 'concordance', 'survival'];

function seatedState() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Root',
    activeSeatId: 'dir1',
    chainLeaderAltitude: 'chief',
    disclosureCellFloor: 2,
    differencesCellFloor: 2,
  };
  state.people = [
    { id: 'chief1', name: 'Cleo Chief', role: 'Chief', level: 'chief', managerId: null, status: 'active' },
    { id: 'vp1', name: 'Rina Vee', role: 'VP', level: 'vp', managerId: 'chief1', status: 'active' },
    { id: 'dir1', name: 'Sam Dee', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'lead1', name: 'Priya Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic1', name: 'Ari One', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'lead2', name: 'Jordan Ell', role: 'Shift lead', level: 'lead', managerId: 'dir1', status: 'active' },
    { id: 'ic3', name: 'Cy Three', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  // Enough escalation records inside the director's span to give the aggregate
  // real cells above the declared floor of 2.
  state.escalationRecords = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `esc-${i}`,
    title: `Decision moment ${i + 1}`,
    disposition: i % 2 ? 'escalated' : 'absorbed',
    toSeatId: i % 2 ? 'dir1' : null,
    fromSeatId: i < 3 ? 'lead1' : 'lead2',
    reasonKey: 'capacity',
    status: 'open',
    loggedOn: '2026-11-03',
    createdAt: '2026-11-03T08:00:00.000Z',
  }));
  state.cadenceForums = [
    { id: 'f1', kind: 'weekly', cadence: 'weekly', status: 'active', chairSeatId: 'dir1', title: 'Ops sync', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'f2', kind: 'monthly', cadence: 'monthly', status: 'active', chairSeatId: 'lead1', title: 'Frontline huddle', createdAt: '2026-10-01T00:00:00.000Z' },
  ];
  // Sessions carry `ownerId`, one of the declared people keys, so they attribute
  // to a span in the published aggregate.
  state.cadenceSessions = [0, 1, 2, 3].map((i) => ({
    id: `s-${i}`,
    forumId: i < 2 ? 'f1' : 'f2',
    ownerId: i < 2 ? 'dir1' : 'lead1',
    heldOn: '2026-11-02',
    status: 'held',
    plannedN: 4,
    closedN: 3,
    createdAt: '2026-11-02T09:00:00.000Z',
  }));
  return normalizeState(state, { now: NOW }).state;
}

function boot(state, { now = NOW } = {}) {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => now, idFactory: (prefix) => `${prefix}-${map.size}-${Math.random().toString(36).slice(2, 8)}` });
  store.load();
  return { store, api: createApi(store) };
}

test('all five terminals declare a manifest, so each has a publishable aggregate', () => {
  for (const route of TARGET_ROUTES) {
    const manifest = manifestFor(route);
    assert.ok(manifest, `route ${route} has no disclosure manifest`);
    assert.ok(MANIFEST_ROUTES.includes(route), `${route} is in the catalogue`);
    assert.ok(manifest.collections.length > 0, `${route} declares at least one collection`);
  }
});

test('plan is available for every one of the five terminals from a declared seat', () => {
  const { api } = boot(seatedState());
  for (const route of TARGET_ROUTES) {
    const plan = api.differencesPlan({ route });
    assert.ok(plan, `no plan returned for ${route}`);
    assert.equal(plan.ok, true, `${route} plan should build: ${plan.error || ''}`);
    assert.ok(['safe', 'protected', 'refused'].includes(plan.verdict), `${route} verdict ${plan.verdict}`);
  }
});

test('publish writes one dated register row; a same-day second publish is refused', () => {
  const { api, store } = boot(seatedState());
  const first = api.differencesPublish({ route: 'escalation' });
  assert.equal(first.ok, true, `first publish failed: ${first.error || ''}`);
  const releases = store.state.differenceReleases || [];
  const mine = releases.filter((row) => row && row.route === 'escalation');
  assert.equal(mine.length, 1, 'exactly one escalation release registered');
  assert.equal(String(mine[0].releasedOn).slice(0, 10), '2026-11-05');

  const second = api.differencesPublish({ route: 'escalation' });
  assert.equal(second.ok, false, 'a second same-day publish must be refused');
  assert.match(second.error || '', /already published today/i);
  assert.equal((store.state.differenceReleases || []).filter((row) => row && row.route === 'escalation').length, 1, 'the refusal wrote nothing');

  const report = api.differencesRead();
  const row = (report.routes || []).find((r) => r.route === 'escalation');
  assert.ok(row, 'the register report carries the escalation route');
  assert.equal(row.releases, 1);
  assert.equal(String(row.lastReleasedOn).slice(0, 10), '2026-11-05');
});

test('publishing another terminal the same day is allowed — one release per module per day', () => {
  const { api, store } = boot(seatedState());
  assert.equal(api.differencesPublish({ route: 'cadence' }).ok, true);
  assert.equal(api.differencesPublish({ route: 'escalation' }).ok, true);
  const routes = (store.state.differenceReleases || []).map((row) => row.route).sort();
  assert.deepEqual(routes, ['cadence', 'escalation']);
});

test('the publication panel renders axe-clean and wires plan + publish', async () => {
  const { api } = boot(seatedState());
  const ctx = {
    now: NOW,
    api,
    refresh() { this.refreshed = true; },
    navigate() {},
  };
  const root = document.getElementById('view');
  root.replaceChildren(publicationPanel(ctx, 'escalation'));
  assert.ok(root.querySelector('[data-testid="publication-publish-btn-escalation"]'), 'publish button present');
  assert.ok(root.querySelector('[data-testid="publication-plan-btn-escalation"]'), 'plan button present');
  root.querySelector('[data-testid="publication-plan-btn-escalation"]').click();
  assert.ok(root.querySelector('[data-testid="publication-plan-escalation"]').textContent.length > 0, 'plan renders a verdict');
  const results = await axe.run(root);
  assert.equal(results.violations.length, 0, JSON.stringify(results.violations.map((v) => v.id)));
});
