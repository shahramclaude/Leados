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
  // The declared cover must also have EXERCISED the duty: a declaration nobody
  // exercises reads `thin`, never `covered` (ADR-0121). One dated case inside
  // the span that names the cover is that evidence.
  raw.cases = [{
    id: 'case-vp', title: 'Coaching cadence reset', status: 'open', ownerId: 'ic-a',
    involvedPersonIds: ['vp-a', 'ic-a'], openedOn: '2026-11-05',
    createdAt: '2026-11-05T09:00:00.000Z', updatedAt: '2026-11-05T09:00:00.000Z',
  }];
  const state = normalizeState(raw, { now }).state;
  const saved = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) };
  let seq = 0;
  const store = createStore({ storage, now: () => now, idFactory: (p) => `${p}-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => now, idFactory: (p) => `${p}-${++seq}` });
  // The duty holder may not cover their own absence (Session 166). The fixture
  // originally declared `lead-a` as its own stand-in, which the register has
  // refused since then — it was recorded as a pre-existing failure in Sessions
  // 169–171. Declaring the reporting-tree ancestor is the eligible path.
  const result = api.dutyCoverageDesignate({ dutyId: 'lead-a|coach', coverId: 'vp-a', note: 'The VP rehearses the coaching cadence in the lead’s span.' });
  assert.ok(result.ok, result.error);
  assert.ok(store.state.links.some((l) => l.relation === 'rolls-up-to' && l.targetId === 'vp-a'));
  assert.ok(api.setActiveSeat('leader', { reason: 'review enterprise continuity' }).ok);

  // ADR-0126 (Session 172): at the DECLARED DEFAULT the chief desk no longer
  // prints exact per-branch rates over two-to-four seats — it withholds them.
  // Both branches here are below the default floor of 3 contributing seats
  // (vp-a carries 2, vp-b 4 but is the last released cell), so both cells are
  // withheld and the pooled rate is refused outright.
  const defaults = api.dutyCoverageReport().report.branchCoverage;
  assert.equal(defaults.floor, 3, 'the disclosure floor is declared, not fitted');
  assert.equal(defaults.suppressedN, 2, 'every cell is withheld at the default floor');
  assert.equal(defaults.pooledPct, null, 'no pooled rate over a fully withheld table');
  assert.equal(defaults.branches.every((b) => b.coveredN === null), true, 'withheld is null, never 0');
  assert.doesNotMatch(JSON.stringify(defaults), /Alpha|Beta|lead-a|vp-a|ic-a/);

  // The comparison semantics ADR-0121 established are unchanged once the floor
  // is deliberately re-declared lower by a rank-4+ full-access seat.
  assert.ok(api.setActiveSeat(null, { reason: 'enterprise-scope declaration' }).ok);
  assert.ok(api.dutyCoverageSetConventions({ dutyCoverageBranchFloorN: 2, dutyCoverageBranchRateFloorN: 2 }).ok);
  assert.ok(api.setActiveSeat('leader', { reason: 'review enterprise continuity' }).ok);
  const report = api.dutyCoverageReport().report;
  const c = report.branchCoverage;
  assert.equal(c.branches.length, 2);
  assert.equal(c.suppressedN, 0, 'the lowered floor releases the cells');
  assert.equal(c.branches[0].coveredN, 1);
  assert.equal(c.branches[1].coveredN, 0);
  assert.ok(c.branches[1].dutiesN > c.branches[0].dutiesN, 'unequal branch sizes');
  assert.equal(c.branches.reduce((n, b) => n + b.dutiesN, c.ownN), report.summary.dutiesN);
  assert.notEqual(c.pooledPct, c.meanPct, 'pooled and unweighted rates do not conflate composition');
  assert.doesNotMatch(JSON.stringify(c), /Alpha|Beta|lead-a|vp-a|ic-a/);
  assert.match(api.dutyCoverageBriefText().text, /mean of branch rates/);
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
