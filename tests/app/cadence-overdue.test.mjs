import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildCadenceClock, nextSittingOn } from '../../app/core/domain/cadence.js';
import { renderCadence } from '../../app/views/cadence.js';

const now = new Date('2026-11-09T12:00:00Z');
const baseForum = { id: 'f', title: 'Review', kind: 'operating-review', cadence: 'weekly', status: 'active', horizonDays: 30, serviceDays: 3, lastHeldOn: '2026-11-01' };

test('cadence overdue: a missed sitting is not a zero-day wait', () => {
  const overdue = nextSittingOn(baseForum, '2026-11-09');
  assert.deepEqual(overdue, { on: '2026-11-08', known: false, daysAway: null, overdueDays: 1, reason: 'the expected sitting is 1 day(s) overdue; its next actual sitting is not known' });
  assert.equal(nextSittingOn(baseForum, '2026-11-08').daysAway, 0);
  assert.equal(nextSittingOn(baseForum, '2026-11-07').daysAway, 1);
  assert.equal(nextSittingOn({ ...baseForum, lastHeldOn: null }, '2026-11-09').known, false);
});

test('cadence overdue: an unknown alternative cannot prove all routes late or congested', () => {
  const forumRow = (id, next, rho, flowDays) => ({ id, title: id, kind: baseForum.kind, status: 'active', forum: baseForum, next, demand: { rho }, flow: { flowDays } });
  const item = { type: 'case', entityId: 'c', classKey: 'quality-defect', reviewable: true, requiredHorizonDays: 7, ageDays: 6, ownerNodeId: 'lead', forumId: 'f' };
  const knownLate = forumRow('f', { known: true, daysAway: 3 }, 0.4, 4);
  const unknown = forumRow('other', nextSittingOn(baseForum, '2026-11-09'), 0.4, 4);
  const run = (forums) => buildCadenceClock({ today: '2026-11-09', forums, perItem: [item] }).rows[0].clock;
  assert.equal(run([knownLate]).state, 'escape-ladder');
  const mixed = run([knownLate, unknown]);
  assert.equal(mixed.state, 'unpredictable');
  assert.equal(mixed.expectedCloseOn, null);
  assert.equal(mixed.slackDays, null);
  assert.equal(mixed.forumPath[1].waitDays, null);
  assert.match(mixed.forumPath[1].reason, /overdue/);
  assert.equal(run([forumRow('f', { known: true, daysAway: 0 }, 1.2, null), unknown]).state, 'unpredictable');
  assert.equal(run([forumRow('f', { known: true, daysAway: 0 }, 0.2, 0), unknown]).state, 'on-clock');
});

for (const matrix of [false, true]) {
  test(`cadence overdue: stored sitting, computed report and rendered view agree (${matrix ? 'matrix' : 'single-chain'})`, () => {
    const state = createEmptyState(now.toISOString());
    for (const k of Object.keys(state.settings)) if (k.endsWith('AutoPropagate')) state.settings[k] = false;
    state.settings.cadenceAutoPropagate = true;
    state.people = [
      { id: 'ceo', name: 'Chief', role: 'CEO', level: 'vp', status: 'active' },
      { id: 'mgr', name: 'Manager', role: 'Manager', level: 'manager', managerId: 'ceo', status: 'active' },
      { id: 'project', name: 'Project manager', role: 'Manager', level: 'manager', managerId: 'ceo', status: 'active' },
      { id: 'lead', name: 'Lead', role: 'Lead', level: 'lead', managerId: 'mgr', status: 'active' },
    ];
    if (matrix) state.reportingLines = [{ id: 'line', personId: 'lead', managerId: 'project', kind: 'project', shareH: 10, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: now.toISOString(), status: 'active', history: [] }];
    state.cases = [{ id: 'case', title: 'Operational issue', status: 'open', kind: 'operational', openedOn: '2026-11-08', ownerId: 'lead', fmea: { severity: 9, probability: 6, detectability: 5 }, createdAt: now.toISOString(), updatedAt: now.toISOString() }];
    const normalized = normalizeState(state, { now }).state;
    const mem = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
    const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
    let serial = 0;
    const idFactory = p => `${p}-${++serial}`;
    const store = createStore({ storage, now: () => now, idFactory });
    store.load();
    const api = createApi(store, { now: () => now, idFactory });
    const declaration = api.cadenceDeclareForum({ title: 'Weekly review', kind: 'operating-review', cadence: 'weekly', chairSeatId: 'mgr', attending: ['mgr', 'lead'], decisionCapacity: 10, serviceDays: 1 });
    assert.equal(declaration.ok, true, declaration.error);
    const logged = api.cadenceLogSession(declaration.forum.id, { heldOn: '2026-11-01', status: 'held', closedN: 1, plannedN: 1 });
    assert.equal(logged.ok, true, logged.error);
    const persisted = JSON.parse(mem.get(STORAGE_KEY));
    const forum = persisted.cadenceForums.find(f => f.id === declaration.forum.id);
    assert.equal(forum.lastHeldOn, '2026-11-01');
    assert.equal(persisted.cadenceSessions.find(s => s.forumId === forum.id).heldOn, forum.lastHeldOn);
    if (matrix) assert.equal(persisted.reportingLines.length, 1);
    const report = api.cadenceRead().report;
    const row = report.picture.forums.find(f => f.id === forum.id);
    assert.equal(row.next.on, '2026-11-08');
    assert.equal(row.next.overdueDays, 1);
    assert.equal(row.next.known, false);
    const item = report.clock.rows.find(r => r.entityId === 'case');
    assert.equal(item.clock.state, 'unpredictable');
    assert.equal(item.clock.expectedCloseOn, null);
    assert.equal(report.clock.counts.unpredictable, 1);
    assert.ok(report.constraint.type === 'calendar-unknown' || report.secondary.some(c => c.type === 'calendar-unknown'));
    const frozen = api.cadenceFreezeReading();
    assert.equal(frozen.ok, true, frozen.error);
    assert.equal(frozen.reading.prediction, null);
    assert.equal(JSON.parse(mem.get(STORAGE_KEY)).cadenceReadings.at(-1).prediction, null);
    assert.match(api.cadenceBriefText().text, /unpredictable ladders: \*\*1\*\*/);
    const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node; globalThis.Element = dom.window.Element;
    const view = renderCadence({ state: store.state, now, api, query: new URLSearchParams('panel=clock'), navigate() {}, seatContext: null });
    const text = view.textContent;
    assert.ok(text.includes(row.title));
    assert.ok(text.includes(row.next.reason));
    assert.match(text, /1 unpredictable/);
    assert.match(text, /zero escapes does not prove every item can land in time/);
    dom.window.close();
  });
}
