/** ADR-0080: Mission Control, scoped API boundary and disclosure-safe briefs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createEmptyState, normalizeState, SCHEMA_VERSION, migrate } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { buildMission, displayBound, suppressHierarchy, missionCommandKinds } from '../../app/core/domain/mission.js';
import { harvestWork } from '../../app/core/domain/chain.js';
import { scopedViewState } from '../../app/core/domain/viewScope.js';
import { guardApiCall, workspaceRouteVerdict } from '../../app/core/domain/accessGateway.js';
import { normalizeMissionBriefs } from '../../app/core/domain/missionSchema.js';
import { rehearseActionBundle } from '../../app/services/actionBundleRehearsal.js';
import { renderMission } from '../../app/views/mission.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const ago = (n) => new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Root', chainLeaderAltitude: 'chief', activeSeatId: null, missionCellFloor: 5 };
  state.people = [
    { id: 'vp1', name: 'Rina VP', role: 'VP', level: 'vp', managerId: null, status: 'active' },
    { id: 'dir1', name: 'Sam Director', role: 'Director', level: 'director', managerId: 'vp1', status: 'active' },
    { id: 'mgr1', name: 'Mei Manager', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active' },
    { id: 'lead1', name: 'Priya Lead', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active' },
    { id: 'lead2', name: 'Jordan Lead', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active' },
    { id: 'ic1', name: 'Ari Klein', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Operator', level: 'ic', managerId: 'lead1', status: 'active' },
    { id: 'ic3', name: 'Cy Orlov', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
    { id: 'ic4', name: 'Dee Park', role: 'Operator', level: 'ic', managerId: 'lead2', status: 'active' },
  ];
  state.cases = [
    { id: 'c1', title: 'Handover friction', status: 'open', ownerId: 'ic1', involvedPersonIds: [], openedOn: ago(10), reviewOn: ago(-2), fmea: { severity: 8 }, autoPropagate: true },
    { id: 'c2', title: 'Peer span cover gap', status: 'open', ownerId: 'ic3', involvedPersonIds: [], openedOn: ago(3), reviewOn: ago(-5), fmea: { severity: 4 }, autoPropagate: true },
    { id: 'c-cross', title: 'Cross-team constraint', status: 'open', ownerId: 'ic1', involvedPersonIds: ['ic3'], openedOn: ago(20), reviewOn: ago(-1), fmea: { severity: 6 }, autoPropagate: true },
  ];
  state.oneOnOnes = [{ id: 'oo1', personId: 'ic1', date: ago(1), status: 'held', notes: 'PRIVATE_COACHING_NOTE' }];
  state.pulses = [{ id: 'p1', personId: 'ic1', anonymity: 'named', date: ago(1), scores: { safety: 2, workload: 4, clarity: 3, growth: 3 } }];
  state.budgets = [{ id: 'b1', name: 'Enterprise envelope', label: 'Enterprise envelope', ownerId: null, currency: 'USD', limit: 100000, status: 'active', lines: [] }];
  return normalizeState(state, { now: NOW }).state;
}
function boot(state = fixture()) {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  map.set(STORAGE_KEY, JSON.stringify(state));
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `${p}-test-${++seq}` });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory: (p) => `${p}-test-${++seq}` }) };
}
function bootDocument() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', { url: 'https://leados.test/', pretendToBeVisual: true, virtualConsole: vc });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Event = dom.window.Event;
  return dom;
}

test('schema v87 migrates additively and refuses malformed brief bodies', () => {
  assert.equal(SCHEMA_VERSION, 101);
  const old = { schemaVersion: 86, settings: { leaderName: 'Keep' }, cases: [{ id: 'keep' }], retentionPlans: [{ id: 'retained' }] };
  const migrated = migrate(old);
  assert.equal(migrated.raw.schemaVersion, 100);
  assert.deepEqual(migrated.raw.missionBriefs, []);
  assert.equal(migrated.raw.cases[0].id, 'keep');
  assert.equal(migrated.raw.retentionPlans[0].id, 'retained');
  const warnings = [];
  assert.deepEqual(normalizeMissionBriefs([{ id: 'bad', open: { lower: 4, upper: 2 } }], warnings), []);
  assert.ok(warnings.length);
  assert.equal(normalizeState({ settings: { missionCellFloor: 1 } }).state.settings.missionCellFloor, 5);
});

test('five altitudes have different operating loops; nobody gets a generic dashboard', () => {
  const state = fixture();
  const titles = new Set();
  for (const id of ['lead1', 'mgr1', 'dir1', 'vp1', 'leader']) {
    state.settings.activeSeatId = id;
    const r = buildMission(state, { now: NOW });
    assert.equal(r.ok, true); titles.add(r.profile.title);
    assert.deepEqual(r.profile.commands, missionCommandKinds(r.seat.rank));
    if (r.seat.rank > 2) assert.equal(r.profile.commands.includes('coaching'), false);
    if (r.seat.rank < 4) assert.equal(r.profile.commands.includes('budget'), false);
  }
  assert.equal(titles.size, 5);
});

test('hierarchy partitions LCA work once and applies complementary suppression', () => {
  const state = fixture();
  for (let i = 0; i < 5; i++) state.cases.push({ id: `direct-${i}`, title: `Direct coordination ${i}`, status: 'open', ownerId: 'lead1', openedOn: ago(1), reviewOn: ago(-5) });
  for (let i = 0; i < 5; i++) state.cases.push({ id: `peer-${i}`, title: `Peer coordination ${i}`, status: 'open', ownerId: 'ic3', openedOn: ago(1), reviewOn: ago(-5) });
  const built = buildSeats(state, { now: NOW });
  const items = harvestWork(state, built.chain, { now: NOW });
  const mgr = built.byId.get('mgr1');
  const h = suppressHierarchy(items, mgr, built, { floor: 5 });
  assert.equal(h.exactInternal.open.lower, items.filter((i) => i.ownerNodeId === 'mgr1' || mgr.scope.has(i.ownerNodeId)).length);
  assert.ok(h.suppressedN >= 2, 'one small cell forces a second withheld cell');
  assert.ok(h.cells.some((c) => c.secondary));
  assert.notEqual(h.totals.open.lower, h.totals.open.upper, 'parent total cannot reveal the hidden complement');
  const cross = items.find((i) => i.entityId === 'c-cross');
  assert.equal(cross.ownerNodeId, 'mgr1', 'cross-team work belongs to the common leader exactly once');
  const before = JSON.stringify(h);
  state.people.find((p) => p.id === 'ic1').managerId = 'lead2';
  const afterBuilt = buildSeats(state, { now: NOW });
  const after = suppressHierarchy(harvestWork(state, afterBuilt.chain, { now: NOW }), afterBuilt.byId.get('mgr1'), afterBuilt, { floor: 5 });
  assert.notEqual(JSON.stringify(after), before, 'reorganisation re-derives the partition');
  assert.ok(after.cells.every((c) => !c.suppressed || c.open.upper < 5 || c.secondary));
});

test('render projection and API gateway close the legacy raw-state leak', () => {
  const state = fixture(); state.settings.activeSeatId = 'leader';
  const built = buildSeats(state, { now: NOW }); const seat = activeSeat(built);
  const view = scopedViewState(state, { built, seat });
  assert.equal(view.oneOnOnes.length, 0);
  assert.equal(view.pulses.length, 0);
  assert.equal(view.events.length, 0);
  assert.equal(view.people.some((p) => p.id === 'ic1'), false);
  assert.equal(view.people.find((p) => p.id === 'vp1').talkingPoints, undefined);
  assert.equal(workspaceRouteVerdict('oneonones', seat).allow, false);
  assert.equal(workspaceRouteVerdict('mission', seat).allow, true);
  assert.equal(guardApiCall(state, 'harvestReliabilityObservations', []).ok, false);
  state.settings.activeSeatId = 'lead1';
  assert.match(guardApiCall(state, 'addCase', [{ ownerId: 'ic3' }]).error, /outside/);
  assert.equal(guardApiCall(state, 'finalizeMeritCycle', []).ok, false);
});

test('one frontline intervention crosses modules and altitudes in one reviewed transaction', () => {
  const { store, api } = boot();
  assert.equal(api.setActiveSeat('lead1').ok, true);
  const created = api.missionCreateIntervention({ caseId: 'c1', ownerId: 'ic1', kinds: ['decision', 'delegation', 'coaching'], reviewOn: ago(-7) });
  assert.equal(created.ok, true, created.error);
  const id = created.id;
  const preview = rehearseActionBundle(store.state, id, { now: NOW });
  assert.equal(preview.ok, true, preview.error);
  assert.equal(api.saveMissionPreview(id, preview).ok, true);
  assert.equal(api.missionCommit(id, store.state.meta.revision, false).ok, false);
  const before = store.state.meta.revision;
  const adopted = api.missionCommit(id, before, true);
  assert.equal(adopted.ok, true, adopted.error);
  assert.ok(store.state.meta.revision > before);
  assert.equal(store.state.events.filter((e) => e.type === 'bundle.committed' && e.entityId === id).length, 1, 'one bundle adoption receipt');
  const b = store.state.actionBundles.find((x) => x.id === id);
  assert.equal(b.status, 'committed');
  assert.ok(b.outputs.some((o) => o.kind === 'decision'));
  assert.ok(b.outputs.some((o) => o.kind === 'delegation'));
  assert.ok(store.state.people.find((p) => p.id === 'ic1').talkingPoints.length);
  for (const ancestor of ['mgr1', 'dir1', 'vp1']) {
    assert.ok(store.state.links.some((l) => l.sourceType === 'case' && l.sourceId === 'c1' && l.targetId === ancestor && l.relation === 'rolls-up-to'), `roll-up to ${ancestor}`);
  }
  assert.ok(store.state.links.some((l) => l.sourceType === 'bundle' && l.sourceId === id && l.relation === 'coordinates'));
  const withdrawn = api.missionWithdraw(id, 'The checkpoint has not been used; withdraw the whole untouched loop.');
  assert.equal(withdrawn.ok, true, withdrawn.error);
  assert.equal(store.state.actionBundles.find((x) => x.id === id).status, 'withdrawn');
});

test('a stale rehearsal cannot adopt after the workspace changes', () => {
  const { store, api } = boot(); api.setActiveSeat('lead1');
  const created = api.missionCreateIntervention({ caseId: 'c1', ownerId: 'ic1', kinds: ['decision'], reviewOn: ago(-7) });
  const preview = rehearseActionBundle(store.state, created.id, { now: NOW });
  api.saveMissionPreview(created.id, preview);
  const revision = store.state.meta.revision;
  api.missionOpenCase({ title: 'Unrelated new fact', ownerId: 'ic1', severity: 3, reviewOn: ago(-7) });
  const result = api.missionCommit(created.id, revision, true);
  assert.equal(result.ok, false);
  assert.match(result.error, /changed|stale|Rehearse/i);
});

test('a chief freezes an identity-free brief, opens a review and links span provenance', () => {
  const { store, api } = boot(); api.setActiveSeat('leader');
  const r = api.missionRead();
  const frozen = api.missionFreezeBrief(r.revision);
  assert.equal(frozen.ok, true, frozen.error);
  const brief = store.state.missionBriefs[0];
  assert.equal(brief.rank, 5);
  assert.equal(JSON.stringify(brief).includes('PRIVATE_COACHING_NOTE'), false);
  assert.equal(JSON.stringify(brief).includes('Handover friction'), false);
  assert.ok(store.state.decisions.some((d) => d.title === 'Review the frozen enterprise mission brief'));
  assert.ok(store.state.links.some((l) => l.sourceType === 'missionbrief' && l.relation === 'summarizes-span' && l.targetId === 'vp1'));
  assert.ok(store.state.links.some((l) => l.sourceType === 'missionbrief' && l.relation === 'tracks-followup'));
  assert.equal(api.missionFreezeBrief(0).ok, false, 'stale source revision refused');
  const text = api.missionBriefText(brief.id);
  assert.equal(text.ok, true); assert.match(text.text, /Evidence fingerprint/);
  api.setActiveSeat('lead1');
  assert.equal(api.missionFreezeBrief(store.state.meta.revision).ok, false);
  assert.equal(api.missionBriefText(brief.id).ok, false);
  assert.equal(api.missionHandoffText().ok, true);
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.name === 'missionRule'));
});

test('Mission Control renders all four panels without private detail at enterprise altitude', async () => {
  const dom = bootDocument();
  const { store, api } = boot(); api.setActiveSeat('leader');
  const axe = (await import('axe-core')).default;
  for (const panel of ['now', 'hierarchy', 'interventions', 'brief']) {
    const ctx = { api, state: store.state, now: NOW, query: new URLSearchParams(`panel=${panel}`), navigate() {}, refresh() {}, rehearseMission: async () => ({ ok: false, error: 'stub' }) };
    const node = renderMission(ctx); document.getElementById('view').replaceChildren(node);
    assert.ok(node.querySelector('h1'));
    assert.equal(node.textContent.includes('PRIVATE_COACHING_NOTE'), false);
    const results = await axe.run(node, { rules: { region: { enabled: false } } });
    assert.deepEqual(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })), [], `axe: ${panel}`);
  }
  dom.window.close();
});

test('an executive owns a cross-span situation and commits only an owned envelope', () => {
  const { store, api } = boot(); api.setActiveSeat('vp1');
  store.update((d) => { d.budgets.push({ id: 'b-vp', name: 'VP envelope', label: 'VP envelope', ownerId: 'vp1', currency: 'USD', limit: 50000, status: 'active', lines: [] }); }, { type: 'test.budget', entity: 'budget', entityId: 'b-vp', summary: 'test envelope' });
  const m = api.missionRead();
  assert.equal(m.budgets.some((b) => b.id === 'b1'), false, 'unowned enterprise envelope is not handed to a VP');
  assert.equal(m.hierarchy.exactInternal, undefined);
  const opened = api.missionOpenCase({ title: 'Portfolio operating constraint', severity: 6, reviewOn: ago(-30) });
  assert.equal(opened.ok, true, opened.error);
  const after = api.missionRead();
  assert.ok(after.eligibleCases.some((c) => c.id === opened.id));
  const created = api.missionCreateIntervention({ caseId: opened.id, kinds: ['decision', 'budget'], budgetId: 'b-vp', amount: 1200, reviewOn: ago(-30) });
  assert.equal(created.ok, true, created.error);
  const preview = rehearseActionBundle(store.state, created.id, { now: NOW });
  assert.equal(preview.ok, true, preview.error);
  api.saveMissionPreview(created.id, preview);
  const adopted = api.missionCommit(created.id, store.state.meta.revision, true);
  assert.equal(adopted.ok, true, adopted.error);
  assert.ok(store.state.budgets.find((b) => b.id === 'b-vp').lines.some((l) => l.committedAmount === 1200));
});

test('drill-up/down and mission adapters cannot bypass the acting-seat gateway', () => {
  const state = fixture();
  // A frontline lead may read a parent aggregate, never a peer team's titles.
  state.settings.activeSeatId = 'lead1';
  const up = buildMission(state, { now: NOW, seatId: 'mgr1' });
  assert.equal(up.ok, true);
  assert.equal(up.hierarchy.exactInternal, undefined);
  assert.ok(up.queue.every((i) => i.title !== 'Peer span cover gap'));
  assert.ok(up.owners.every((o) => o.id !== 'ic3'));
  assert.equal(up.eligibleCases.some((c) => c.id === 'c2'), false);
  assert.equal(buildMission(state, { now: NOW, seatId: 'lead2' }).ok, false, 'sideways drill refused');
  // A chief drilling down does not inherit the junior altitude's detail ceiling.
  state.settings.activeSeatId = 'leader';
  const down = buildMission(state, { now: NOW, seatId: 'lead1' });
  assert.equal(down.ok, true);
  assert.equal(down.hierarchy.exactInternal, undefined);
  assert.ok(down.queue.every((i) => i.title !== 'Handover friction'));
  assert.ok(down.owners.every((o) => o.id !== 'ic1'));

  const { store, api } = boot();
  const outside = api.createActionBundle({ name: 'Peer loop', sourceType: 'case', sourceId: 'c2', reviewOn: ago(-7), commands: [{ kind: 'decision', title: 'Peer choice', sourceId: 'c2', ownerId: 'ic3', dueOn: ago(-7) }] });
  assert.equal(outside.ok, true, outside.error);
  api.setActiveSeat('lead1');
  assert.equal(api.missionArchive(outside.id).ok, false, 'mission adapter cannot archive a peer bundle');
  assert.equal(api.setMissionFloor(7).ok, false, 'frontline cannot set the disclosure floor');
  api.setActiveSeat('vp1');
  const vpCase = api.missionOpenCase({ title: 'VP portfolio constraint', severity: 6, reviewOn: ago(-30) });
  assert.equal(vpCase.ok, true, vpCase.error);
  const badBudget = api.missionCreateIntervention({ caseId: vpCase.id, kinds: ['decision', 'budget'], budgetId: 'b1', amount: 100, reviewOn: ago(-30) });
  assert.equal(badBudget.ok, false, 'unowned enterprise envelope refused');
  assert.match(badBudget.error, /budget|span/i);
  assert.equal(store.state.actionBundles.find((b) => b.id === outside.id).status, 'draft');
});
