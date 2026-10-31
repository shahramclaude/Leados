import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDrift, survivalReport, survivalSignals } from '../../app/core/domain/survival.js';
import { survivalRule } from '../../app/core/domain/survivalRules.js';
import { rowConfidence } from '../../app/core/domain/waitCost.js';
import { addDays, dayKey } from '../../app/core/time.js';
import { normalizeState } from '../../app/core/schema.js';

const now = new Date('2026-10-31T12:00:00Z');
const dateAgo = (n) => dayKey(addDays(now, -n));
function items() {
  return ['recent', 'prior'].flatMap((group) => Array.from({ length: 20 }, (_, i) => ({
    key: `${group}${i}`, kind: 'case', startedOn: dateAgo(group === 'recent' ? 40 + i : 100 + i),
    elapsedDays: group === 'recent' ? 25 : 3, exitType: 'completed',
  })));
}
function state() {
  return { settings: { leaderName: 'Leader' }, people: [{ id: 'p1', name: 'Leader', status: 'active' }],
    cases: [...items().map((r) => ({ id: r.key, title: r.key, status: 'resolved', openedOn: r.startedOn,
      resolvedOn: dayKey(addDays(r.startedOn, r.elapsedDays)) })),
    { id: 'open', title: 'Still open', status: 'open', openedOn: dateAgo(5) }],
    decisions: [], delegations: [], links: [], survivalMarkers: [] };
}
test('fixed mature cohorts detect slower exit with Holm correction and restricted means', () => {
  const [unused, r] = calendarDrift(items(), dayKey(now));
  assert.equal(unused.available, false);
  assert.equal(r.available, true); assert.equal(r.changed, true);
  assert.equal(r.recentDays, 25); assert.equal(r.priorDays, 3); assert.equal(r.deltaDays, 22);
  assert.ok(r.adjustedP < .05);
});
test('equal cohorts do not claim drift; thin cohorts refuse; future starts ignored', () => {
  const equal = items().map((r) => ({ ...r, elapsedDays: 5 }));
  assert.equal(calendarDrift(equal, dayKey(now))[1].changed, false);
  assert.equal(calendarDrift(items().slice(0, 4), dayKey(now))[1].available, false);
  assert.equal(calendarDrift(items().map((r) => ({ ...r, startedOn: '2027-01-01' })), dayKey(now))[1].available, false);
});
test('equal follow-up censors exits after day 30; abandonment is an exit, not a completion claim', () => {
  const capped = items().map((r) => ({ ...r, elapsedDays: 40 }));
  assert.equal(calendarDrift(capped, dayKey(now))[1].available, false);
  assert.equal(calendarDrift(items().map((r) => ({ ...r, exitType: 'abandoned' })), dayKey(now))[1].changed, true);
});
test('scan creates decision, owner task, source links and audit; repeat is idempotent; records survive normalization', () => {
  const draft = state(); let id = 0; const logs = [];
  const ctx = { now, event: { type: 'survival.scan' }, idFactory: (p) => `${p}${++id}`, logEvent: (e) => logs.push(e) };
  const effects = survivalRule(draft, ctx).filter((e) => e.ruleId === 'RULE-SURV-06');
  assert.ok(effects.some((e) => e.targetType === 'decision'));
  assert.ok(effects.some((e) => e.targetType === 'delegation'));
  assert.ok(draft.links.some((e) => e.targetId === 'open'));
  assert.ok(logs.length);
  assert.equal(survivalRule(draft, ctx).filter((e) => e.ruleId === 'RULE-SURV-06').length, 0);
  const { state: normalized } = normalizeState(draft);
  assert.ok(normalized.decisions.some((d) => d.title.includes('calendar drift')));
  assert.ok(normalized.delegations.some((d) => d.title.includes('drift')));
});
test('shift flows into insights and finance confidence without altering declared price', () => {
  const s = state(); const report = survivalReport(s, now);
  assert.equal(report.classes.find((r) => r.key === 'case').drift.changed, true);
  assert.ok(survivalSignals(s, now).some((r) => r.ruleId === 'SURV-08'));
  const row = report.openItems.find((r) => r.item.sourceId === 'open');
  const price = { priced: true, source: 'declared', weekly: 500 };
  assert.equal(rowConfidence(row, price, { confidenceFloor: 10, minAtRisk: 4 }).level, 'low');
  assert.equal(price.weekly, 500);
});

test('real API scan commits the cross-module fan-out atomically and persists on reload', async () => {
  const { createStore } = await import('../../app/core/store.js');
  const { createApi } = await import('../../app/actions.js');
  const data = new Map(); const storage = { getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  let id = 0; const idFactory = (p) => `${p}-integration-${++id}`;
  const store = createStore({ storage, now: () => now, idFactory }); store.load();
  store.update((draft) => Object.assign(draft, state()), { type: 'fixture.loaded', entity: 'workspace' });
  const api = createApi(store, { now: () => now, idFactory });
  api.scanSurvival();
  assert.ok(store.state.decisions.some((d) => d.title.includes('calendar drift')));
  assert.ok(store.state.links.some((l) => l.targetId === 'open'));
  assert.ok(store.state.delegations.some((d) => d.title.includes('drift')));
  const restored = createStore({ storage, now: () => now, idFactory }); restored.load();
  assert.ok(restored.state.decisions.some((d) => d.title.includes('calendar drift')));
  assert.ok(restored.state.links.some((l) => l.targetId === 'open'));
});
