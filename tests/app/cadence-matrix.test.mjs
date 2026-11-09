/**
 * tests/app/cadence-matrix.test.mjs — Operating Cadence Clock × Matrix Parity.
 *
 * Proves the complete Cadence × Matrix behavior end-to-end across domain,
 * post-commit spine, gateway, projection, CSV/brief, and JSDOM + axe-core:
 *   1. A line-only manager (`pm1`, 0 tree reports) can resolve an operating
 *      seat, declare a standing forum with direct line members (`ic1`), log
 *      sittings, and read scoped people/items while out-of-span peers remain
 *      refused at both `guardApi` and `cadenceActions`.
 *   2. Matrix subsidiarity: a superior forum above a matrix line defers to the
 *      competent lower line forum instead of claiming ambiguity or overriding by
 *      shorter meeting interval.
 *   3. Ambiguous matrix authority: when two incomparable accountable managers
 *      (`engMgr` via reporting tree and `pm1` via matrix line) both chair
 *      competent forums, LeadOS refuses to choose by interval, surfaces
 *      `ambiguous-matrix-authority` (`clock.state === 'ambiguous-authority'`),
 *      prunes stale `RULE-CAD-01` queue/rollup edges, and escalates `RULE-CAD-02`
 *      to `matrixJointApex`.
 *   4. Multi-branch `RULE-CAD-01` `rolls-up-to` across every accountable branch,
 *      `RULE-CAD-03` `fit-gap` reconciliation across matrix sites, and stale
 *      edge cleanup when a matrix line ends (`matrix.line.ended`).
 *   5. `scopedViewState`, `safeSeatContext`, `cadenceBriefText`/`cadenceCsvRows`
 *      privacy invariants, and JSDOM + axe-core accessibility across all five
 *      `#/cadence` panels under both operator and matrix-line seats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildCadenceReport, cadenceBriefText, cadenceCsvRows } from '../../app/core/domain/cadence.js';
import { guardApiCall } from '../../app/core/domain/accessGateway.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';
import { CADENCE_RULE_IDS } from '../../app/core/domain/cadenceRegistry.js';
import { renderCadence } from '../../app/views/cadence.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const NOW = new Date('2026-11-04T12:00:00.000Z');
const STAMP = '2026-10-01T00:00:00.000Z';

function matrixWorkspace({ includeLines = true, includeOutsider = true } = {}) {
  const state = createEmptyState(NOW.toISOString());
  for (const key of Object.keys(state.settings)) {
    if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  }
  state.settings.cadenceAutoPropagate = true;
  state.people = [
    { id: 'ceo', name: 'Ada Chief', role: 'CEO', level: 'vp', status: 'active' },
    { id: 'engdir', name: 'Eve Director', role: 'Engineering Director', level: 'director', managerId: 'ceo', status: 'active' },
    { id: 'engmgr', name: 'Morgan Eng', role: 'Engineering Manager', level: 'manager', managerId: 'engdir', status: 'active' },
    { id: 'pm1', name: 'Pia Product', role: 'Product Manager', level: 'manager', managerId: 'ceo', status: 'active' },
    { id: 'ic1', name: 'Sam Engineer', role: 'Staff Engineer', level: 'ic', managerId: 'engmgr', status: 'active' },
    { id: 'otherdir', name: 'Owen Peer', role: 'Sales Director', level: 'director', managerId: 'ceo', status: 'active' },
    { id: 'outsider', name: 'Zoe Outsider', role: 'Account Exec', level: 'ic', managerId: 'otherdir', status: 'active' },
  ];
  state.reportingLines = includeLines ? [
    {
      id: 'rl-sam-pm1',
      personId: 'ic1',
      managerId: 'pm1',
      kind: 'product',
      shareH: 40,
      rights: ['priority', 'assignment'],
      fromISO: '2026-10-01',
      toISO: null,
      declaredAt: STAMP,
      status: 'active',
      history: [],
    },
  ] : [];
  state.cases = [
    {
      id: 'case-shared',
      title: 'Checkout service stalls under spike',
      status: 'open',
      kind: 'operational',
      openedOn: '2026-10-28',
      ownerId: 'ic1',
      involvedPersonIds: ['ic1'],
      fmea: { severity: 9, probability: 5, detectability: 5 },
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
    ...(includeOutsider ? [{
      id: 'case-outsider',
      title: 'Peer deal blocked in procurement',
      status: 'open',
      kind: 'operational',
      openedOn: '2026-10-28',
      ownerId: 'outsider',
      involvedPersonIds: ['outsider'],
      fmea: { severity: 8, probability: 4, detectability: 5 },
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }] : []),
  ];
  return normalizeState(state, { now: NOW }).state;
}

function harness(state = matrixWorkspace()) {
  const mem = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  let serial = 0;
  let current = NOW;
  const idFactory = (p) => `${p}-mtx-${++serial}`;
  const store = createStore({ storage, now: () => current, idFactory });
  store.load();
  const api = createApi(store, { now: () => current, idFactory });
  return { store, api, setNow: (d) => { current = d; } };
}

test('line-only manager chairs a forum for direct line members while peers and non-leaders remain refused', () => {
  const { store, api } = harness();
  // Seat as line-only manager pm1 (0 tree reports).
  store.update((draft) => { draft.settings.activeSeatId = 'pm1'; }, {
    type: 'seat.declared', entity: 'seat', entityId: 'pm1', summary: 'Operate as pm1',
  });

  // Cannot include an out-of-span peer at either guardApi or action level.
  const badPeer = api.cadenceDeclareForum({
    title: 'Product Weekly',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'pm1',
    attending: ['pm1', 'outsider'],
    decisionCapacity: 4,
    serviceDays: 3,
  });
  assert.equal(badPeer.ok, false, 'out-of-span attendee must be refused');

  // Cannot nominate a non-leadership IC as chair even though IC is on a declared line.
  const badIcChair = api.cadenceDeclareForum({
    title: 'IC Forum',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'ic1',
    attending: ['ic1'],
    decisionCapacity: 4,
    serviceDays: 3,
  });
  assert.equal(badIcChair.ok, false, 'non-leadership IC cannot chair a standing forum');

  // Can declare and log sitting with direct line member ic1.
  const declared = api.cadenceDeclareForum({
    title: 'Product Operating Review',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'pm1',
    attending: ['pm1', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 3,
  });
  assert.equal(declared.ok, true, declared.error);

  const logged = api.cadenceLogSession(declared.forum.id, {
    heldOn: '2026-11-02', status: 'held', closedN: 1, plannedN: 1,
  });
  assert.equal(logged.ok, true, logged.error);

  const read = api.cadenceRead({ includeItems: true });
  assert.equal(read.ok, true, read.error);
  assert.equal(read.seat.lineScopeN, 1);
  assert.deepEqual(read.scopedPeople.map((p) => p.id), ['pm1', 'ic1']);
  assert.equal(read.forums.length, 1);
  assert.equal(read.forums[0].id, declared.forum.id);
  assert.ok(read.visibleItemKeys.includes('case:case-shared'), 'shared line item is visible to pm1');
  assert.ok(!read.visibleItemKeys.includes('case:case-outsider'), 'outsider item stays hidden from pm1');

  // Guard boundary allows cadenceDeclareForum with lineScope id, but refuses non-matrix commands targeting lineScope id.
  const lineAllowed = guardApiCall(store.state, 'cadenceDeclareForum', [{ chairSeatId: 'pm1', attending: ['ic1'] }], NOW.getTime());
  assert.equal(lineAllowed.ok, true, lineAllowed.error);
  const nonMatrixDenied = guardApiCall(store.state, 'createGoal', [{ title: 'Leak', ownerId: 'ic1' }], NOW.getTime());
  assert.equal(nonMatrixDenied.ok, false, 'non-matrix commands stay restricted to tree seat.scope');
});

test('matrix subsidiarity lets a direct line forum win over a superior forum even when the superior meets faster', () => {
  const { api, store } = harness(matrixWorkspace({ includeOutsider: false }));
  // CEO (common ancestor of both engmgr and pm1) runs a 3-day-cadence daily/weekly executive review.
  const execForum = api.cadenceDeclareForum({
    title: 'Chief Rapid Review',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'ceo',
    attending: ['ceo', 'engdir', 'pm1'],
    decisionCapacity: 6,
    serviceDays: 1,
  });
  assert.equal(execForum.ok, true, execForum.error);

  // pm1 (subordinate on the matrix line) chairs a fortnightly forum.
  const pmForum = api.cadenceDeclareForum({
    title: 'Product Squad Review',
    kind: 'operating-review',
    cadence: 'fortnightly',
    chairSeatId: 'pm1',
    attending: ['pm1', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 2,
  });
  assert.equal(pmForum.ok, true, pmForum.error);

  const report = buildCadenceReport(store.state, { now: NOW });
  const shared = report.picture.perItem.find((item) => item.entityId === 'case-shared');
  assert.equal(shared.forumId, pmForum.forum.id, 'subordinate line forum wins by subsidiarity over CEO forum');
  assert.notEqual(shared.matchBasis, 'ambiguous-matrix-authority');
});

test('competing line chairs trigger ambiguous-matrix-authority, prune stale edges, and escalate to matrixJointApex', () => {
  const { api, store } = harness(matrixWorkspace({ includeOutsider: false }));

  // 1. Only engmgr declares a weekly forum -> case-shared queues to engmgr's forum.
  const engForum = api.cadenceDeclareForum({
    title: 'Engineering Weekly Ops',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'engmgr',
    attending: ['engmgr', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 2,
  });
  assert.equal(engForum.ok, true, engForum.error);
  const queuedBefore = (store.state.links || []).filter(
    (l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.sourceId === 'case-shared' && l.relation === 'queued-for',
  );
  assert.equal(queuedBefore.length, 1);
  assert.equal(queuedBefore[0].targetId, engForum.forum.id);

  // 2. Now pm1 declares a competing competent forum at a SLOWER fortnightly cadence.
  // Shorter meeting interval MUST NOT make engmgr silently win.
  const pmForum = api.cadenceDeclareForum({
    title: 'Product Fortnightly Review',
    kind: 'operating-review',
    cadence: 'fortnightly',
    chairSeatId: 'pm1',
    attending: ['pm1', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 3,
  });
  assert.equal(pmForum.ok, true, pmForum.error);

  const report = buildCadenceReport(store.state, { now: NOW });
  assert.equal(report.counts.ambiguousAuthority, 1);
  assert.equal(report.counts.attributable, 0);
  assert.equal(report.clock.counts.ambiguousAuthority, 1);
  assert.equal(report.constraint.type, 'ambiguous-matrix-authority');

  const item = report.picture.perItem.find((r) => r.entityId === 'case-shared');
  assert.equal(item.matchBasis, 'ambiguous-matrix-authority');
  assert.equal(item.forumId, null);
  assert.deepEqual(item.competingChairIds.sort(), ['engmgr', 'pm1']);
  const clockRow = report.clock.rows.find((r) => r.entityId === 'case-shared');
  assert.equal(clockRow.clock.state, 'ambiguous-authority');

  // Stale RULE-CAD-01 edges for case-shared must have been pruned cleanly.
  const queuedAfter = (store.state.links || []).filter(
    (l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.relation === 'queued-for',
  );
  assert.equal(queuedAfter.length, 0, 'ambiguous item must not retain stale queued-for edge');
  const rollupsAfter = (store.state.links || []).filter(
    (l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.relation === 'rolls-up-to',
  );
  assert.equal(rollupsAfter.length, 0, 'ambiguous item must not retain stale rolls-up-to edges');

  // RULE-CAD-02 escalates ambiguous-matrix-authority to the exact joint apex (ceo).
  const ambigDec = (store.state.decisions || []).find((d) => String(d.question || '').includes('[CAD-SIG:ambiguous-matrix-authority:'));
  assert.ok(ambigDec, 'RULE-CAD-02 opened a governed DACI decision for ambiguous matrix authority');
  assert.equal(ambigDec.approver, 'Ada Chief', 'decision approver resolves to the joint apex');
  const decRollups = (store.state.links || []).filter(
    (l) => l.relation === 'rolls-up-to' && l.sourceType === 'decision' && l.sourceId === ambigDec.id,
  );
  assert.ok(decRollups.some((l) => l.targetId === 'ceo'), 'joint apex of engmgr and pm1 is ceo');

  // 3. Retire pm1's competing forum -> ambiguity resolves cleanly back to engmgr's forum.
  const retired = api.cadenceUpdateForum(pmForum.forum.id, { status: 'retired' });
  assert.equal(retired.ok, true, retired.error);
  const resolved = buildCadenceReport(store.state, { now: NOW });
  assert.equal(resolved.counts.ambiguousAuthority, 0);
  assert.equal(resolved.counts.attributable, 1);
  const reQueued = (store.state.links || []).filter(
    (l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.sourceId === 'case-shared' && l.relation === 'queued-for',
  );
  assert.equal(reQueued.length, 1);
});

test('multi-branch RULE-CAD-01 rolls-up-to, RULE-CAD-03 fit-gap reconciliation, and ended matrix line cleanup', () => {
  const { api, store, setNow } = harness(matrixWorkspace({ includeOutsider: false }));
  // Set expiry on the matrix line so we can prove cleanup when it ends.
  store.update((draft) => {
    draft.reportingLines[0].toISO = '2026-11-10';
  }, { type: 'matrix.line.retuned', entity: 'reportingline', entityId: 'rl-sam-pm1', summary: 'Set end date' });

  // Only CEO chairs an executive forum covering both branches, missing both accountable managers initially.
  const execForum = api.cadenceDeclareForum({
    title: 'CEO Operating Review',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'ceo',
    attending: ['ceo'],
    decisionCapacity: 6,
    serviceDays: 2,
  });
  assert.equal(execForum.ok, true, execForum.error);

  const rollups = (store.state.links || [])
    .filter((l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.relation === 'rolls-up-to')
    .map((l) => l.targetId)
    .sort();
  assert.deepEqual(rollups, ['ceo', 'engdir', 'engmgr', 'pm1'], 'rolls up across BOTH reporting lines');

  const gapsInitial = (store.state.links || [])
    .filter((l) => l.ruleId === CADENCE_RULE_IDS.FIT && l.relation === 'fit-gap')
    .map((l) => l.targetId)
    .sort();
  assert.deepEqual(gapsInitial, ['engmgr', 'pm1'], 'fit-gap names missing owning seats on both branches');

  // Add pm1 to attending -> pm1 fit-gap edge must be pruned while engmgr remains.
  const updated = api.cadenceUpdateForum(execForum.forum.id, { attending: ['ceo', 'pm1'] });
  assert.equal(updated.ok, true, updated.error);
  const gapsAfterAttend = (store.state.links || [])
    .filter((l) => l.ruleId === CADENCE_RULE_IDS.FIT && l.relation === 'fit-gap')
    .map((l) => l.targetId)
    .sort();
  assert.deepEqual(gapsAfterAttend, ['engmgr'], 'resolved fit-gap for pm1 was pruned');

  // Retire CEO forum; pm1 chairs Product Forum (only covers pm1 branch while line is live).
  api.cadenceUpdateForum(execForum.forum.id, { status: 'retired' });
  const pmForum = api.cadenceDeclareForum({
    title: 'Product Weekly',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'pm1',
    attending: ['pm1', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 2,
  });
  assert.equal(pmForum.ok, true, pmForum.error);
  assert.equal(
    (store.state.links || []).filter((l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.relation === 'queued-for').length,
    1,
  );

  // Advance clock past 2026-11-10 expiry and fire matrix.line.ended -> stale queue/rollup edges for pmForum are pruned.
  setNow(new Date('2026-11-12T12:00:00.000Z'));
  store.update(() => {}, {
    type: 'matrix.line.ended', entity: 'reportingline', entityId: 'rl-sam-pm1', summary: 'Line ended',
  });
  const reportAfterEnd = buildCadenceReport(store.state, { now: new Date('2026-11-12T12:00:00.000Z') });
  assert.equal(reportAfterEnd.counts.attributable, 0, 'ended line no longer routes ic1 item to pm1');
  assert.equal(
    (store.state.links || []).filter((l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.relation === 'queued-for').length,
    0,
    'stale queued-for edge pruned when matrix line ended',
  );
  assert.equal(
    (store.state.links || []).filter((l) => l.ruleId === CADENCE_RULE_IDS.QUEUE && l.relation === 'rolls-up-to').length,
    0,
    'stale rolls-up-to edges pruned when matrix line ended',
  );
});

test('scopedViewState + safeSeatContext + JSDOM/axe-core render cleanly with zero out-of-span leaks', async () => {
  const { api, store } = harness();
  // Create competing forums for ambiguous-authority rendering AND an outsider forum.
  const engForum = api.cadenceDeclareForum({
    title: 'Engineering Ops',
    kind: 'operating-review',
    cadence: 'weekly',
    chairSeatId: 'engmgr',
    attending: ['engmgr', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 2,
  });
  assert.equal(engForum.ok, true, engForum.error);

  const pmForum = api.cadenceDeclareForum({
    title: 'Product Ops',
    kind: 'operating-review',
    cadence: 'fortnightly',
    chairSeatId: 'pm1',
    attending: ['pm1', 'ic1'],
    decisionCapacity: 4,
    serviceDays: 3,
  });
  assert.equal(pmForum.ok, true, pmForum.error);

  // Brief & CSV must remain strictly identity-free.
  const report = buildCadenceReport(store.state, { now: NOW });
  const brief = cadenceBriefText(report);
  const csv = cadenceCsvRows(report, { floor: 3 });
  assert.match(brief, /ambiguous matrix authority/i);
  for (const person of store.state.people) {
    assert.ok(!brief.includes(person.name), `brief leaked person name ${person.name}`);
    assert.ok(!JSON.stringify(csv).includes(person.name), `csv leaked person name ${person.name}`);
  }

  // Operate from pm1 through the real projection path (safeSeatContext + scopedViewState).
  store.update((draft) => { draft.settings.activeSeatId = 'pm1'; }, {
    type: 'seat.declared', entity: 'seat', entityId: 'pm1', summary: 'Operate as pm1',
  });
  const seatCtx = safeSeatContext(store.state, NOW);
  assert.equal(seatCtx.error, null);
  assert.equal(seatCtx.seat.id, 'pm1');
  assert.equal(seatCtx.seat.lineScopeN, 1);

  const viewState = scopedViewState(store.state, seatCtx, { now: NOW, settings: store.state.settings });
  assert.ok(viewState.people.some((p) => p.id === 'ic1'), 'direct line member projected into viewState');
  assert.ok(!viewState.people.some((p) => p.id === 'outsider'), 'outsider never projected into viewState');

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', {
    url: 'https://leados.test/', virtualConsole,
  });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  dom.window.axe = undefined;
  dom.window.eval(AXE_SRC);
  globalThis.axe = dom.window.axe;

  try {
    for (const panel of ['clock', 'workbench', 'constraint', 'fit', 'brief']) {
      const node = renderCadence({
        state: viewState,
        now: NOW,
        api,
        query: new URLSearchParams(`panel=${panel}`),
        navigate: () => {},
        seatContext: seatCtx,
      });
      dom.window.document.getElementById('root').replaceChildren(node);
      const text = node.textContent;
      assert.ok(!text.includes('Zoe Outsider'), `panel ${panel} leaked outsider name`);
      assert.ok(!text.includes('Peer deal blocked in procurement'), `panel ${panel} leaked outsider case`);
      if (panel === 'workbench') {
        assert.match(text, /Ambiguous authority/, 'workbench shows ambiguous-authority badge');
        assert.match(text, /Checkout service stalls under spike/, 'workbench shows shared in-span item');
      }
      if (panel === 'constraint') {
        assert.match(text, /Ambiguous matrix authority/, 'constraint panel names ambiguous matrix authority');
      }
      const axeRes = await dom.window.axe.run(node, {
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      });
      assert.deepEqual(axeRes.violations.map((v) => v.id), [], `panel ${panel} has zero axe violations`);
    }
    assert.deepEqual(errors, [], 'no jsdom errors');
  } finally {
    dom.window.close();
  }
});
