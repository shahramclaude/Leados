/**
 * tests/app/jurisdiction-matrix.test.mjs — Jurisdiction Compiler × Matrix Parity
 * (Director / VP primary; all altitudes inherit).
 *
 * Proves end-to-end across domain, post-commit spine, gateway, projection
 * (`scopedViewState` + `safeSeatContext`), CSV/brief privacy, and JSDOM + axe-core:
 *   1. Single-chain workspaces preserve exact legacy path (matrixActive: false).
 *   2. Higher-altitude matrix joint apex (`lcaBasis: 'matrix-apex'`) lets a
 *      line-only Director / VP resolve cross-functional work without false
 *      CEO-only escalation, while `RULE-JUR-01/02/04` roll up across matrix
 *      lines and ancestors in one atomic commit.
 *   3. Matrix diamond ties (`ambiguous-matrix-lca`) refuse to pick a single
 *      decider silently, roll up to ALL competing apexes, and reconcile cleanly
 *      when `matrix.line.ended` prunes the departed manager's line.
 *   4. Rank 1–2 line-only managers resolve seats, see exact `spanHygiene`
 *      matching `jurSpanRollUp`, anchor matrix-line work through `guardApi`
 *      (`jurAnchorWork`), and are refused sideways/joint-outsider access.
 *   5. `rehearseBoundaryRedraw` & `api.jurRedrawRehearse` remain matrix-aware,
 *      pure, and span-redacted for Directors/VPs through `scopedViewState`.
 *   6. All seven `#/jurisdiction` panels render axe-clean under `scopedViewState`
 *      for rank-2 line manager, rank-3 line director, and rank-4 VP with exact
 *      display-vs-stored/computed parity and zero out-of-span leaks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, guardApiCall, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { safeSeatContext, scopedViewState } from '../../app/core/domain/viewScope.js';
import {
  buildJurisdictionBook, jurisdictionRead, jurSpanRollUp, jurCsvRows, jurBrief,
} from '../../app/core/domain/jurisdiction.js';
import { jurDriftRead } from '../../app/core/domain/jurisdictionDrift.js';
import { rehearseBoundaryRedraw } from '../../app/core/domain/redrawRehearsal.js';
import { normalizeJurSettings } from '../../app/core/domain/jurisdictionSchema.js';
import { JUR_RULE_IDS, JUR_REFUSALS } from '../../app/core/domain/jurisdictionRegistry.js';
import { renderJurisdiction } from '../../app/views/jurisdiction.js';

const AXE_SRC = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const NOW = new Date('2026-11-06T12:00:00.000Z');
const STAMP = '2026-10-15T00:00:00.000Z';

function matrixOrg({ includeDiamond = false, includeLines = true } = {}) {
  const state = createEmptyState(NOW.toISOString());
  for (const key of Object.keys(state.settings)) {
    if (key.endsWith('AutoPropagate')) state.settings[key] = false;
  }
  state.settings = {
    ...state.settings,
    ...normalizeJurSettings({ jurEvidenceFloorN: 3, jurCellFloor: 1 }),
    jurAutoPropagate: true,
    matrixAutoPropagate: true,
    leaderName: 'Ada Root',
    chainLeaderAltitude: 'chief',
  };
  state.people = [
    { id: 'vp_prod', name: 'Vera ProductVP', role: 'VP Product', level: 'vp', managerId: null, status: 'active' },
    { id: 'proddir', name: 'Pia ProdDir', role: 'Product Director', level: 'director', managerId: 'vp_prod', status: 'active' },
    { id: 'platdir', name: 'Pat PlatDir', role: 'Platform Director', level: 'director', managerId: null, status: 'active' },
    { id: 'engdir', name: 'Eve EngDir', role: 'Engineering Director', level: 'director', managerId: null, status: 'active' },
    { id: 'salesdir', name: 'Sal SalesDir', role: 'Sales Director', level: 'director', managerId: null, status: 'active' },
    { id: 'engmgr', name: 'Morgan EngMgr', role: 'Engineering Manager', level: 'manager', managerId: 'engdir', status: 'active' },
    { id: 'salesmgr', name: 'Soren SalesMgr', role: 'Sales Manager', level: 'manager', managerId: 'salesdir', status: 'active' },
    { id: 'pm1', name: 'Mina LineMgr', role: 'Product Manager', level: 'manager', managerId: 'proddir', status: 'active' },
    { id: 'ic1', name: 'Sam Eng', role: 'Staff Engineer', level: 'ic', managerId: 'engmgr', status: 'active' },
    { id: 'ic2', name: 'Kai Solutions', role: 'Solutions Lead', level: 'ic', managerId: 'salesmgr', status: 'active' },
    { id: 'outsider', name: 'Zoe Outsider', role: 'Finance Analyst', level: 'ic', managerId: 'salesdir', status: 'active' },
  ];
  state.goals = [
    {
      id: 'goal-launch',
      title: 'Unified Checkout v2',
      description: '',
      ownerId: null,
      scope: 'enterprise',
      coAuthored: null,
      dueDate: null,
      keyResults: [],
      confidence: 'on-track',
      initialConfidence: 'on-track',
      status: 'active',
      completedOn: null,
      krUpdatedOn: null,
      checkins: [],
      createdAt: STAMP,
    },
  ];
  state.reportingLines = includeLines ? [
    {
      id: 'rl-ic1-prod',
      personId: 'ic1',
      managerId: 'proddir',
      kind: 'product',
      shareH: 40,
      rights: ['technical'],
      fromISO: '2026-10-01',
      toISO: null,
      declaredAt: STAMP,
      status: 'active',
      history: [],
      note: 'Checkout v2 product line',
      createdAt: STAMP,
    },
    {
      id: 'rl-ic2-prod',
      personId: 'ic2',
      managerId: 'proddir',
      kind: 'product',
      shareH: 40,
      rights: ['technical'],
      fromISO: '2026-10-01',
      toISO: null,
      declaredAt: STAMP,
      status: 'active',
      history: [],
      note: 'Checkout v2 product line',
      createdAt: STAMP,
    },
    {
      id: 'rl-ic1-pm1',
      personId: 'ic1',
      managerId: 'pm1',
      kind: 'project',
      shareH: 20,
      rights: ['assignment'],
      fromISO: '2026-10-01',
      toISO: null,
      declaredAt: STAMP,
      status: 'active',
      history: [],
      note: 'Sprint execution line',
      createdAt: STAMP,
    },
    ...(includeDiamond ? [
      {
        id: 'rl-ic1-plat',
        personId: 'ic1',
        managerId: 'platdir',
        kind: 'cross-functional',
        shareH: 20,
        rights: ['technical'],
        fromISO: '2026-10-01',
        toISO: null,
        declaredAt: STAMP,
        status: 'active',
        history: [],
        note: 'Competing platform line',
        createdAt: STAMP,
      },
      {
        id: 'rl-ic2-plat',
        personId: 'ic2',
        managerId: 'platdir',
        kind: 'cross-functional',
        shareH: 20,
        rights: ['technical'],
        fromISO: '2026-10-01',
        toISO: null,
        declaredAt: STAMP,
        status: 'active',
        history: [],
        note: 'Competing platform line',
        createdAt: STAMP,
      },
    ] : []),
  ] : [];
  state.cases = [
    {
      id: 'c-eng-1', kind: 'risk', status: 'open', title: 'Checkout latency spike', summary: '',
      ownerId: 'ic1', involvedPersonIds: [], linkedGoalId: 'goal-launch', openedOn: '2026-11-04',
      createdAt: STAMP, updatedAt: STAMP,
    },
    {
      id: 'c-eng-2', kind: 'risk', status: 'open', title: 'Idempotency key race', summary: '',
      ownerId: 'ic1', involvedPersonIds: [], linkedGoalId: 'goal-launch', openedOn: '2026-11-04',
      createdAt: STAMP, updatedAt: STAMP,
    },
    {
      id: 'c-sales-1', kind: 'risk', status: 'open', title: 'Enterprise contract alignment', summary: '',
      ownerId: 'ic2', involvedPersonIds: [], linkedGoalId: 'goal-launch', openedOn: '2026-11-05',
      createdAt: STAMP, updatedAt: STAMP,
    },
    {
      id: 'c-ic1-unanchored', kind: 'risk', status: 'open', title: 'Unlinked telemetry follow-up', summary: '',
      ownerId: 'ic1', involvedPersonIds: [], linkedGoalId: null, openedOn: '2026-11-05',
      createdAt: STAMP, updatedAt: STAMP,
    },
    {
      id: 'c-joint-outsider', kind: 'risk', status: 'open', title: 'Shared finance audit item', summary: '',
      ownerId: 'ic1', involvedPersonIds: ['outsider'], linkedGoalId: null, openedOn: '2026-11-05',
      createdAt: STAMP, updatedAt: STAMP,
    },
    {
      id: 'c-outsider-only', kind: 'risk', status: 'open', title: 'Outsider private finance close', summary: '',
      ownerId: 'outsider', involvedPersonIds: [], linkedGoalId: null, openedOn: '2026-11-05',
      createdAt: STAMP, updatedAt: STAMP,
    },
  ];
  return state;
}

function makeHarness(seedState) {
  let seq = 0;
  let now = new Date(NOW.getTime());
  const data = new Map([[STORAGE_KEY, JSON.stringify(seedState)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  const idFactory = (p) => `${p}-jm-${++seq}`;
  const store = createStore({ storage, now: () => now, idFactory });
  store.load();
  const rawApi = createApi(store, { now: () => now, idFactory });
  const api = guardApi(rawApi, store, { now: () => now });
  return {
    store,
    rawApi,
    api,
    setNow: (d) => { now = d instanceof Date ? d : new Date(d); },
  };
}

test('1. Single-chain workspace keeps exact legacy book behavior (matrixActive === false)', () => {
  const single = matrixOrg({ includeLines: false });
  const book = buildJurisdictionBook(single, { now: NOW });
  assert.equal(book.matrixActive, false);
  assert.equal(book.lineScope, null);
  assert.equal(book.clusters.length, 1);
  const c = book.clusters[0];
  assert.equal(c.lcaBasis, 'tree');
  assert.equal(c.lcaNodeId, 'leader');
  assert.equal(c.lcaRank, 5);
  assert.deepEqual(c.accountableSpanIds, ['engmgr', 'salesmgr']);
});

test('2. Matrix joint apex resolves to rank-3 line-only Director (proddir), rolls up to proddir -> vp_prod -> leader, and exposes identity-free drift/rehearsal', () => {
  const { store, rawApi } = makeHarness(matrixOrg({ includeDiamond: false }));
  const scan = rawApi.jurScan();
  assert.equal(scan.ok, true, scan.error);

  const book = buildJurisdictionBook(store.state, { now: NOW });
  assert.equal(book.matrixActive, true);
  assert.equal(book.clusters.length, 1);
  const cluster = book.clusters[0];
  assert.equal(cluster.lcaBasis, 'matrix-apex');
  assert.equal(cluster.lcaNodeId, 'proddir', 'unique rank-3 matrix director holding both ICs becomes joint apex instead of CEO rank 5');
  assert.equal(cluster.lcaRank, 3);
  assert.ok(cluster.accountableSpanIds.includes('proddir'));
  assert.ok(cluster.accountableSpanIds.includes('pm1'));

  const finding = store.state.jurFindings.find((f) => f.objectiveKey === 'goal:goal-launch');
  assert.ok(finding);
  assert.equal(finding.lcaNodeId, 'proddir');
  assert.equal(finding.lcaBasis, 'matrix-apex');

  const rollTargets = new Set(
    (store.state.links || [])
      .filter((l) => l.relation === 'rolls-up-to' && l.sourceType === 'jurfinding' && l.sourceId === finding.id)
      .map((l) => l.targetId),
  );
  for (const expected of ['proddir', 'vp_prod', 'engdir', 'salesdir', 'leader']) {
    assert.ok(rollTargets.has(expected), `rolls-up-to edge reaches ${expected}`);
  }

  // Span roll-ups & frozen jurReadings include matrix-line-only proddir & pm1, and roll up to vp_prod.
  const prodRoll = jurSpanRollUp(store.state, { nodeId: 'proddir', now: NOW });
  assert.equal(prodRoll.ok, true);
  assert.equal(prodRoll.clusters, 1);
  assert.equal(prodRoll.openWork, 4, '3 launch cases + 1 unanchored case on ic1 (excludes joint outsider case and outsider-only case)');
  const prodReading = (store.state.jurReadings || []).find((r) => r.nodeId === 'proddir');
  assert.ok(prodReading, 'RULE-JUR-04 froze a jurReading for line-only Director proddir');
  assert.equal(prodReading.clusters, 1);
  assert.equal(prodReading.objectives, 1);

  const vpRoll = jurSpanRollUp(store.state, { nodeId: 'vp_prod', now: NOW });
  assert.equal(vpRoll.clusters, 1);

  // Switch active seat to line-only Director (proddir, rank 3) and VP (vp_prod, rank 4).
  for (const [seatId, expectedRank, expectedLabel] of [
    ['proddir', 3, 'Your unit'],
    ['vp_prod', 4, 'Your function'],
  ]) {
    store.update((draft) => {
      draft.settings.activeSeatId = seatId;
      draft.settings.seatEnforce = true;
    }, { type: 'seat.declared', entity: 'seat', entityId: seatId, summary: `Operate as ${seatId}` });

    const read = jurisdictionRead(store.state, { now: NOW, settings: store.state.settings });
    assert.equal(read.ok, true);
    assert.equal(read.seat.id, seatId);
    assert.equal(read.seat.readOnly, false, `${seatId} must not fall back to read-only`);
    assert.equal(read.seat.rank, expectedRank);
    assert.equal(read.withheld, true, 'rank >= 3 withholds raw item detail');
    assert.equal(read.hygieneQueue.length, 0);
    assert.ok(read.ownSpanClusterKeys.includes('goal:goal-launch'), `${seatId} sees own matrix-line objective in ownSpanClusterKeys`);
    assert.ok(read.cells.some((c) => c.clusters >= 1), `${seatId} sees non-zero compiled rank cells`);

    const drift = jurDriftRead(store.state, { now: NOW, settings: store.state.settings });
    assert.equal(drift.rank, expectedRank);
    assert.equal(drift.scopeLabel, expectedLabel);
    assert.ok(drift.weeks.length === 1 && drift.weeks[0].spansN >= 1, `${seatId} drift scope includes matrix readings`);
    assert.ok(!/ic1|ic2|outsider|goal-launch|Checkout/.test(`${drift.brief} ${JSON.stringify(drift.rows)}`), 'zero identity leaks in drift brief/CSV');

    // CSV & brief are strictly identity-free.
    const csv = JSON.stringify(jurCsvRows(store.state, { now: NOW }));
    const brief = jurBrief(store.state, { now: NOW });
    assert.ok(!/ic1|ic2|proddir|Pia ProdDir|goal-launch|Checkout/.test(`${csv} ${brief}`), 'CSV & brief are identity-free');
  }
});

test('3. Matrix diamond tie refuses silent LCA choice (ambiguous-matrix-lca) and reconciles atomically on matrix.line.ended', () => {
  const { store, rawApi } = makeHarness(matrixOrg({ includeDiamond: true }));
  const scan = rawApi.jurScan();
  assert.equal(scan.ok, true);

  const finding = store.state.jurFindings.find((f) => f.objectiveKey === 'goal:goal-launch');
  assert.ok(finding);
  assert.equal(finding.verdict, 'refused');
  assert.equal(finding.refusalKey, 'ambiguous-matrix-lca');
  assert.equal(finding.matrixAmbiguous, true);
  assert.deepEqual([...finding.matrixApexIds].sort(), ['platdir', 'proddir']);
  assert.equal(finding.governedDecisionId, null, 'RULE-JUR-02 never opens a single-driver governed decision on a diamond tie');

  const rollTargetsBefore = new Set(
    (store.state.links || [])
      .filter((l) => l.relation === 'rolls-up-to' && l.sourceType === 'jurfinding' && l.sourceId === finding.id)
      .map((l) => l.targetId),
  );
  assert.ok(rollTargetsBefore.has('proddir'), 'rolls up to competing apex proddir');
  assert.ok(rollTargetsBefore.has('platdir'), 'rolls up to competing apex platdir');

  // End platdir's competing matrix lines via api.matrixEndLine -> RULE-JUR-01 reconciles in the SAME commit.
  const end1 = rawApi.matrixEndLine({ id: 'rl-ic1-plat', reason: 'Retired platform matrix line', toISO: '2026-11-05' });
  assert.equal(end1.ok, true, end1.error);
  const end2 = rawApi.matrixEndLine({ id: 'rl-ic2-plat', reason: 'Retired platform matrix line', toISO: '2026-11-05' });
  assert.equal(end2.ok, true, end2.error);

  const reconciled = store.state.jurFindings.find((f) => f.objectiveKey === 'goal:goal-launch');
  assert.equal(reconciled.matrixAmbiguous, false);
  assert.equal(reconciled.verdict, 'priced');
  assert.equal(reconciled.lcaBasis, 'matrix-apex');
  assert.equal(reconciled.lcaNodeId, 'proddir');

  const rollTargetsAfter = new Set(
    (store.state.links || [])
      .filter((l) => l.relation === 'rolls-up-to' && l.sourceType === 'jurfinding' && l.sourceId === reconciled.id)
      .map((l) => l.targetId),
  );
  assert.equal(rollTargetsAfter.has('platdir'), false, 'stale rolls-up-to edge to ended matrix line director is pruned');
  assert.ok(rollTargetsAfter.has('proddir'), 'surviving matrix apex keeps its rolls-up-to edge');
});

test('4. Rank-2 line-only manager (pm1) sees matrix hygiene, anchors ic1 work via guardApi, and is blocked on outsider/joint-outsider', () => {
  const { store, api } = makeHarness(matrixOrg({ includeDiamond: false }));
  store.update((draft) => {
    draft.settings.activeSeatId = 'pm1';
    draft.settings.seatEnforce = true;
  }, { type: 'seat.declared', entity: 'seat', entityId: 'pm1', summary: 'Operate as line manager pm1' });

  const read = jurisdictionRead(store.state, { now: NOW, settings: store.state.settings });
  const roll = jurSpanRollUp(store.state, { nodeId: 'pm1', now: NOW });

  assert.equal(read.seat.id, 'pm1');
  assert.equal(read.seat.rank, 2);
  assert.equal(read.withheld, false);
  assert.ok(read.ownSpanClusterKeys.includes('goal:goal-launch'));
  assert.equal(read.spanHygiene.openWork, roll.openWork, 'displayed spanHygiene.openWork equals jurSpanRollUp.openWork');
  assert.equal(read.spanHygiene.openWork, 3, '2 anchored launch cases + 1 unanchored case on ic1 (joint outsider & outsider-only excluded)');
  assert.deepEqual(read.hygieneQueue.map((q) => q.recordId), ['c-ic1-unanchored']);

  // Guarded API permits anchoring ic1's own unanchored case and wakes RULE-JUR-01 atomically.
  const anchorOk = api.jurAnchorWork({ entityType: 'case', recordId: 'c-ic1-unanchored', goalId: 'goal-launch' });
  assert.equal(anchorOk.ok, true, anchorOk.error);
  const afterAnchor = jurisdictionRead(store.state, { now: NOW, settings: store.state.settings });
  assert.equal(afterAnchor.hygieneQueue.length, 0);
  assert.equal(afterAnchor.spanHygiene.unanchoredWork, 0);
  assert.equal(afterAnchor.spanHygiene.anchoredWork, 3);
  const frozen = store.state.jurFindings.find((f) => f.objectiveKey === 'goal:goal-launch');
  assert.ok(frozen && frozen.memberIds.includes('c-ic1-unanchored'), 'RULE-JUR-01 froze anchored line work in the same transaction');

  // Guarded API refuses sideways outsider AND joint ic1+outsider records.
  const deniedOutsider = api.jurAnchorWork({ entityType: 'case', recordId: 'c-outsider-only', goalId: 'goal-launch' });
  assert.equal(deniedOutsider.ok, false);
  const deniedJoint = api.jurAnchorWork({ entityType: 'case', recordId: 'c-joint-outsider', goalId: 'goal-launch' });
  assert.equal(deniedJoint.ok, false);
  assert.equal(guardApiCall(store.state, 'jurAnchorWork', [{ entityType: 'case', recordId: 'c-ic1-unanchored', goalId: 'goal-launch', ownerId: 'ic1' }], NOW.getTime()).ok, true);
  assert.equal(guardApiCall(store.state, 'jurAnchorWork', [{ entityType: 'case', recordId: 'c-outsider-only', goalId: 'goal-launch', ownerId: 'outsider' }], NOW.getTime()).ok, false);
});

test('5. Boundary redraw rehearsal & api.jurRedrawRehearse are matrix-aware, pure, and span-redacted for Directors', () => {
  assert.ok(SAFE_READS.has('jurRedrawRehearse'));
  const { store, api } = makeHarness(matrixOrg({ includeDiamond: false }));
  api.jurScan();

  // Pure dry run moving ic2 under engmgr collapses the home cross-branch gap cleanly without mutating state.
  const snapshotBefore = JSON.stringify(store.state);
  const raw = rehearseBoundaryRedraw(store.state, {
    moves: [{ personId: 'ic2', newManagerId: 'engmgr' }],
    now: NOW,
  });
  assert.equal(raw.ok, true);
  assert.equal(raw.before.crossBranch, 1);
  assert.equal(raw.after.crossBranch, 0);
  assert.equal(raw.collapsed.length, 1);
  assert.equal(raw.collapsed[0].lcaBeforeId, 'proddir');
  assert.equal(JSON.stringify(store.state), snapshotBefore, 'dry run never mutates state');

  // Under enforced rank-3 proddir, api.jurRedrawRehearse returns redacted objectives and withholds rank<3.
  store.update((draft) => {
    draft.settings.activeSeatId = 'proddir';
    draft.settings.seatEnforce = true;
  }, { type: 'seat.declared', entity: 'seat', entityId: 'proddir', summary: 'Operate as proddir' });
  const dirRehearsal = api.jurRedrawRehearse({ moves: [{ personId: 'ic2', newManagerId: 'engmgr' }] });
  assert.equal(dirRehearsal.ok, true, dirRehearsal.error);
  assert.equal(dirRehearsal.report.collapsed[0].objectiveKey, null, 'objectiveKey withheld above rank 2');
  assert.match(dirRehearsal.report.collapsed[0].objective, /^Objective \d+$/);

  // Under rank-2 pm1, api.jurRedrawRehearse is refused (director-and-above instrument).
  store.update((draft) => {
    draft.settings.activeSeatId = 'pm1';
  }, { type: 'seat.declared', entity: 'seat', entityId: 'pm1', summary: 'Operate as pm1' });
  const mgrBlocked = api.jurRedrawRehearse({ moves: [{ personId: 'ic1', newManagerId: 'pm1' }] });
  assert.equal(mgrBlocked.ok, false);
});

test('6. All 7 #/jurisdiction panels render via scopedViewState + safeSeatContext with display/computed parity and 0 axe/leak issues', async () => {
  const { store, api } = makeHarness(matrixOrg({ includeDiamond: false }));
  api.jurScan();
  // Re-anchor c-ic1-unanchored? Leave it unanchored so hygiene panel exercises its live queue for pm1!
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html lang="en"><body><main id="root"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>', {
    url: 'https://leados.test/#/jurisdiction', virtualConsole,
  });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }
  dom.window.axe = undefined;
  dom.window.eval(AXE_SRC);
  globalThis.axe = dom.window.axe;

  try {
    for (const seatId of ['pm1', 'proddir', 'vp_prod']) {
      store.update((draft) => {
        draft.settings.activeSeatId = seatId;
        draft.settings.seatEnforce = true;
      }, { type: 'seat.declared', entity: 'seat', entityId: seatId, summary: `Seat ${seatId}` });

      const seatCtx = safeSeatContext(store.state, NOW);
      assert.equal(seatCtx.error, null);
      assert.equal(seatCtx.seat.id, seatId);
      const viewState = scopedViewState(store.state, seatCtx, { now: NOW, settings: store.state.settings });
      const expectedRead = api.jurRead().report;

      for (const panel of ['map', 'hygiene', 'options', 'redraw', 'grades', 'drift', 'method']) {
        const node = renderJurisdiction({
          state: viewState,
          store,
          api,
          now: NOW,
          query: new URLSearchParams(`panel=${panel}`),
          navigate: () => {},
          refresh: () => {},
          render: () => {},
          seatContext: seatCtx,
        });
        dom.window.document.getElementById('root').replaceChildren(node);
        const text = node.textContent || '';

        // Never leak out-of-span outsider work or upper-ceiling goal titles/ids.
        assert.ok(!text.includes('Outsider private finance close'), `${seatId}/${panel} never leaks outsider case`);
        assert.ok(!text.includes('Shared finance audit item'), `${seatId}/${panel} never leaks joint outsider case`);
        if (seatId !== 'pm1') {
          assert.ok(!text.includes('goal-launch'), `${seatId}/${panel} never leaks goal key above detail ceiling`);
          assert.ok(!text.includes('Checkout latency spike'), `${seatId}/${panel} never leaks case title above detail ceiling`);
        }

        // Verify display-vs-computed parity on the rendered KPI strip.
        const totals = expectedRead.book.totals;
        assert.ok(text.includes(String(totals.objectives)), `${seatId}/${panel} displays computed objectives count (${totals.objectives})`);
        assert.ok(text.includes(String(totals.crossBranch)), `${seatId}/${panel} displays computed cross-branch count (${totals.crossBranch})`);
        if (seatId === 'pm1' && panel === 'hygiene') {
          assert.ok(text.includes('Unlinked telemetry follow-up'), 'pm1 hygiene panel shows matrix-line unanchored case');
        }
        if ((seatId === 'proddir' || seatId === 'vp_prod') && panel === 'map') {
          assert.match(text, /compiled counts/i, `${seatId} sees compiled upper-altitude map rather than empty state`);
        }
        if (panel === 'method') {
          assert.ok(text.includes(JUR_REFUSALS['ambiguous-matrix-lca']), 'method panel documents ambiguous-matrix-lca refusal');
        }

        const axeRes = await dom.window.axe.run(node, {
          rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
        });
        assert.deepEqual(axeRes.violations.map((v) => v.id), [], `${seatId}/${panel} is axe-clean`);
      }
    }
    assert.deepEqual(errors, [], 'no jsdom errors');
  } finally {
    dom.window.close();
  }
});
