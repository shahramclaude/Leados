/**
 * ADR-0120 — one associative ownership meet for every altitude.
 * Focused on the changed shared helper, its two compatibility wrappers, and
 * the real manager intake → case → automation → vertical roll-up path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildChain, lowestCommonAncestor, responsibleNodeId } from '../../app/core/domain/chain.js';
import { multiSpanLowestCommonAncestor } from '../../app/core/domain/missionCaptureMerge.js';
import { commonAncestorOfAll } from '../../app/core/domain/jurisdiction.js';
import { resolveIntakeRouting } from '../../app/core/domain/intake.js';
import { buildSeats, canSee } from '../../app/core/domain/seat.js';
import { ROUTER_RULES } from '../../app/core/domain/altitudeRouterRegistry.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Chief', chainLeaderAltitude: 'chief', activeSeatId: 'mgr1' };
  state.people = [
    ['vp1', null, 'vp', 'Rina VP'],
    ['vp2', null, 'vp', 'Omar VP'],
    ['dir1', 'vp1', 'director', 'Sam Director'],
    ['dir2', 'vp1', 'director', 'Ira Director'],
    ['mgr1', 'dir1', 'manager', 'Mei Manager'],
    ['mgr2', 'dir1', 'manager', 'Alex Manager'],
    ['mgr3', 'dir2', 'manager', 'Zoe Manager'],
    ['lead1', 'mgr1', 'lead', 'Priya Lead'],
    ['lead2', 'mgr1', 'lead', 'Jordan Lead'],
    ['lead3', 'mgr1', 'lead', 'Tessa Lead'],
    ['leadPeer', 'mgr2', 'lead', 'Kai Lead'],
    ['ic1', 'lead1', 'ic', 'Ari Klein'],
    ['ic2', 'lead1', 'ic', 'Bo Nilsen'],
    ['ic3', 'lead2', 'ic', 'Cy Orlov'],
    ['ic4', 'lead3', 'ic', 'Dev Patel'],
    ['icPeer', 'leadPeer', 'ic', 'Noa Lin'],
  ].map(([id, managerId, level, name]) => ({ id, name, role: level, level, managerId, status: 'active', createdAt: NOW.toISOString() }));
  return normalizeState(state, { now: NOW }).state;
}

function boot(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-lca-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, storage, api: createApi(store, { now: () => NOW, idFactory }) };
}

function permutations(ids) {
  if (ids.length <= 1) return [ids];
  return ids.flatMap((id, index) => permutations([...ids.slice(0, index), ...ids.slice(index + 1)]).map((rest) => [id, ...rest]));
}

test('the shared meet considers every span, is order/grouping invariant, and both wrappers agree at all five altitudes', () => {
  const chain = buildChain(fixture(), { now: NOW });
  const cases = [
    { ids: ['lead1', 'lead2'], expected: 'mgr1' },
    { ids: ['lead1', 'lead2', 'lead3'], expected: 'mgr1' },
    { ids: ['mgr1', 'mgr2'], expected: 'dir1' },
    { ids: ['mgr1', 'mgr2', 'mgr3'], expected: 'vp1' },
    { ids: ['dir1', 'dir2'], expected: 'vp1' },
    { ids: ['vp1', 'vp2'], expected: 'leader' },
    { ids: ['lead1', 'leadPeer', 'mgr3'], expected: 'vp1' },
  ];
  assert.equal(multiSpanLowestCommonAncestor, lowestCommonAncestor, 'capture merge uses the exact shared function');
  for (const { ids, expected } of cases) {
    for (const order of permutations(ids)) {
      assert.equal(lowestCommonAncestor(chain, order), expected, order.join(' → '));
      assert.equal(multiSpanLowestCommonAncestor(chain, order), expected);
      assert.equal(commonAncestorOfAll(chain, order), expected);
      assert.equal(lowestCommonAncestor(chain, [...order, ...order]), expected, 'duplicates are idempotent');
    }
    if (ids.length >= 3) {
      const [a, b, c] = ids;
      assert.equal(lowestCommonAncestor(chain, [lowestCommonAncestor(chain, [a, b]), c]), expected);
      assert.equal(lowestCommonAncestor(chain, [a, lowestCommonAncestor(chain, [b, c])]), expected);
    }
  }
  assert.equal(responsibleNodeId(chain, ['ic1', 'ic2', 'ic3', 'ic4']), 'mgr1', 'two reports under one lead cannot hide the other two teams');
  assert.equal(lowestCommonAncestor(chain, []), 'leader');
  assert.equal(lowestCommonAncestor(chain, ['missing']), 'leader');
  assert.equal(lowestCommonAncestor(chain, ['lead1']), 'lead1');
  assert.equal(lowestCommonAncestor(chain, ['mgr1', 'lead1', 'ic1']), 'mgr1', 'ancestor-or-self stays included');
  assert.equal(lowestCommonAncestor(chain, ['lead1', 'missing']), 'lead1', 'unknown ids keep the existing root-fallback/filter contract');
  assert.equal(lowestCommonAncestor(null, ['lead1']), 'leader', 'the former capture-wrapper null fallback is preserved');
});

test('deep reporting lines are not truncated and repaired cycles/orphans terminate at the root', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = Array.from({ length: 80 }, (_, index) => ({
    id: `deep${index}`, name: `Deep ${index}`, level: 'ic', status: 'active',
    managerId: index ? `deep${index - 1}` : null, createdAt: NOW.toISOString(),
  }));
  state.people.push({ id: 'branch', name: 'Branch', level: 'ic', status: 'active', managerId: 'deep0', createdAt: NOW.toISOString() });
  const chain = buildChain(state, { now: NOW });
  for (const meet of [lowestCommonAncestor, multiSpanLowestCommonAncestor, commonAncestorOfAll]) {
    assert.equal(meet(chain, ['deep79', 'branch']), 'deep0', 'no 16- or 64-hop ownership truncation');
  }

  const broken = createEmptyState(NOW.toISOString());
  broken.people = [
    { id: 'a', name: 'A', level: 'lead', status: 'active', managerId: 'b' },
    { id: 'b', name: 'B', level: 'lead', status: 'active', managerId: 'a' },
    { id: 'orphan', name: 'Orphan', level: 'lead', status: 'active', managerId: 'missing' },
  ];
  const repaired = buildChain(broken, { now: NOW });
  assert.ok(repaired.findings.some((finding) => finding.key === 'cycle'));
  assert.ok(repaired.findings.some((finding) => finding.key === 'orphan'));
  assert.equal(lowestCommonAncestor(repaired, ['a', 'b', 'orphan']), 'leader');
});

test('a manager confirms one cross-team blocker: the case, mitigation and hierarchy receipts commit together and survive reload', () => {
  const state = fixture();
  const { store, storage, api } = boot(state);
  const note = 'The delivery deadline slipped and Ari Klein, Bo Nilsen, Cy Orlov and Dev Patel are blocked on the critical path; the handover bottleneck is overdue today.';
  const people = ['ic1', 'ic2', 'ic3', 'ic4'];
  const chain = buildChain(store.state, { now: NOW });
  assert.equal(responsibleNodeId(chain, people), 'mgr1');
  const intake = resolveIntakeRouting(people.map((personId) => ({ personId })), store.state, { now: NOW });
  assert.equal(intake.ownerNodeId, 'mgr1');
  assert.equal(intake.ownerPersonId, 'mgr1');

  const saved = api.routingSaveDraft(note);
  assert.equal(saved.ok, true, saved.error);
  assert.deepEqual(saved.plan.seatPath.map((row) => row.seatId), ['mgr1', 'dir1', 'vp1', 'leader']);
  assert.equal(saved.plan.ownerSeatId, 'mgr1');
  assert.equal(saved.plan.effectiveRank, 2);
  assert.equal(store.state.cases.length, 0, 'a preview is not an adoption');
  const revision = store.state.meta.revision;
  const confirmed = api.routingConfirm(saved.plan.id, { confirmedAltitudeKey: 'manager', fmeaSeverity: 8 });
  assert.equal(confirmed.ok, true, confirmed.error);
  assert.equal(store.persistError, null);
  assert.equal(store.state.meta.revision, revision + 1, 'one atomic transaction');
  assert.equal(store.lastPropagationMetrics.rolledBack, 0);
  assert.ok(store.lastPropagations.every((row) => row.status !== 'rolled-back'));

  const record = store.state.cases.find((row) => row.id === confirmed.caseId);
  assert.ok(record);
  assert.equal(record.ownerId, 'mgr1', 'the first lead no longer receives another team’s blocker');
  assert.deepEqual(clone(record.involvedPersonIds).sort(), people);
  const plan = store.state.altitudeRoutingPlans.find((row) => row.id === saved.plan.id);
  assert.equal(plan.status, 'confirmed');
  assert.equal(plan.ownerSeatId, 'mgr1');
  assert.deepEqual(plan.seatPath.map((row) => row.disclosure), ['names', 'unit', 'aggregate', 'aggregate']);
  const rules = new Set(store.lastPropagations.map((row) => row.ruleId));
  assert.ok(rules.has(ROUTER_RULES.ROLLUP), 'the existing hierarchy rule ran');
  assert.ok(rules.has('RULE-DEL-01'), 'the existing case automation ran');
  assert.ok(store.state.delegations.some((row) => row.personId === 'mgr1' && store.state.links.some((link) => link.sourceId === record.id && link.targetId === row.id && link.relation === 'mitigates')));
  const edges = store.state.links.filter((row) => row.ruleId === ROUTER_RULES.ROLLUP && row.sourceId === plan.id);
  assert.ok(edges.some((row) => row.relation === 'discloses-to' && row.targetId === 'mgr1'));
  for (const ancestor of ['dir1', 'vp1']) {
    assert.equal(edges.filter((row) => row.relation === 'rolls-up-to' && row.targetId === ancestor).length, 1);
  }
  assert.ok(edges.every((row) => !row.summary.includes('Ari Klein') && !row.summary.includes(note)));

  const built = buildSeats(store.state, { now: NOW });
  assert.equal(canSee(record, 'cases', built.byId.get('mgr1'), built).allow, 'full');
  assert.equal(canSee(record, 'cases', built.byId.get('mgr2'), built).allow, 'denied', 'a peer manager does not gain sideways access');

  const reloaded = createStore({ storage, now: () => NOW });
  reloaded.load();
  assert.equal(reloaded.state.cases.find((row) => row.id === record.id).ownerId, 'mgr1');
  assert.equal(reloaded.state.altitudeRoutingPlans.find((row) => row.id === plan.id).ownerSeatId, 'mgr1');
  assert.deepEqual(reloaded.state.links.filter((row) => row.ruleId === ROUTER_RULES.ROLLUP), store.state.links.filter((row) => row.ruleId === ROUTER_RULES.ROLLUP));
});
