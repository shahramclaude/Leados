import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION, COLLECTIONS } from '../../app/core/schema.js';
import { buildSkillCoverage } from '../../app/core/domain/skillCoverage.js';
import { SKILL_LIMITS, normalizeSkillTasks, normalizeSkillActs } from '../../app/core/domain/skillCoverageSchema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { guardApi, SAFE_READS } from '../../app/core/domain/accessGateway.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import { matrixLineScopeFor } from '../../app/core/domain/matrix.js';
import { renderStandardWork } from '../../app/views/standardWork.js';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const AT = '2026-11-12T09:00:00.000Z';
const person = (id, managerId, level = 'lead') => ({ id, name: id.toUpperCase(), managerId, level, role: 'Operations', status: 'active', createdAt: AT, updatedAt: AT });
const task = (id, holderId, floor = 2) => ({ id, holderId, title: `Task ${id}`, standard: 'Demonstrate the complete safe operating sequence.', floor, declaredAt: AT, retiredOn: null });
const act = (id, taskId, personId, byId, level = 'U', extra = {}) => ({ id, taskId, personId, byId, level, recordedAt: AT,
  expiresOn: '2026-11-13', evidence: `Observed qualification ${id} on the operating standard.`, supersedesId: null, ...extra });
function fixture({ matrix = true } = {}) {
  const raw = createEmptyState(NOW.toISOString());
  raw.people = [person('ada', null, 'vp'), person('ann', 'ada'), person('bob', 'ada'), person('kim', 'ann', 'ic'), person('ria', 'ann', 'ic')];
  raw.reportingLines = matrix ? [{ id: 'kim-bob', personId: 'kim', managerId: 'bob', kind: 'project', shareH: null,
    rights: [], fromISO: '2026-01-01', toISO: null, status: 'active', declaredAt: AT, note: '', history: [] }] : [];
  raw.skillTasks = [task('A', 'ann'), task('B', 'bob', 1)];
  raw.skillActs = [act('q1', 'A', 'kim', 'ann'), act('q2', 'A', 'ria', 'ann', 'L'), act('q3', 'B', 'kim', 'bob', 'O')];
  return normalizeState(raw, { now: NOW }).state;
}
const read = (state, extra = {}) => buildSkillCoverage(state, { now: NOW, ...extra });
function seatFor(state, id) {
  return activeSeat(buildSeats(state, { now: NOW, settings: { ...state.settings, activeSeatId: id }, lineScope: matrixLineScopeFor(state, { now: NOW }) }));
}
function harness(state = fixture(), { realSpine = false } = {}) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const events = [];
  const spyRule = (draft, ctx) => { events.push(ctx.event.type); return []; };
  let i = 0;
  const idFactory = (prefix) => `${prefix}-new-${++i}`;
  const store = createStore({ storage, now: () => NOW, idFactory, ...(realSpine ? {} : { postCommitRules: [spyRule] }) });
  store.load();
  const api = guardApi(createApi(store, { now: () => NOW, idFactory }), store, { now: () => NOW.getTime() });
  const sit = (activeSeatId) => store.update((draft) => { draft.settings.activeSeatId = activeSeatId; }, { type: 'seat.declared', entity: 'settings', entityId: 'seat', summary: 'Declared test seat' });
  return { api, store, storage, events, sit };
}

test('v152 migration is additive, empty and never infers skills from roles', () => {
  const old = { ...createEmptyState(AT), schemaVersion: 151 };
  delete old.skillTasks; delete old.skillActs;
  old.people = [person('kim', null)];
  const next = migrate(old);
  assert.equal(SCHEMA_VERSION, 154);
  assert.deepEqual(next.applied, ['151 → 152', '152 → 153', '153 → 154']);
  assert.deepEqual(next.raw.skillTasks, []);
  assert.deepEqual(next.raw.skillActs, []);
  assert.ok(COLLECTIONS.includes('skillTasks') && COLLECTIONS.includes('skillActs'));
  assert.ok(SAFE_READS.has('skillCoverageReport'));
  assert.ok(!SAFE_READS.has('skillRecordQualification'));
});

test('hand-computed matrix counts: one shared person is two task cells but ONE person at the common apex', () => {
  const r = read(fixture());
  assert.equal(r.clean, true, r.reasons.join(' '));
  assert.deepEqual(r.tasks.map((t) => [t.taskId, t.poolN, t.qualifiedN, t.shortfallN, t.status]), [
    ['A', 2, 1, 1, 'below-floor'], ['B', 1, 1, 0, 'single-point'],
  ]);
  assert.equal(r.totals.peopleN, 2);
  assert.equal(r.totals.qualifiedPeopleN, 1);
  assert.equal(r.totals.qualifiedCellsN, 2);
  assert.equal(r.totals.shortfallN, 1);
  assert.equal(r.totals.singlePointN, 2);
  const apex = r.spans.find((s) => s.nodeId === 'ada');
  assert.equal(apex.qualifiedPeopleN, 1);
  assert.equal(apex.tasksN, 2);
  assert.equal(apex.shortfallN, 1);
  for (const t of r.tasks) assert.equal(Object.values(t.counts).reduce((a, b) => a + b, 0), t.poolN);
  assert.equal(r.totals.qualifiedCellsN, r.tasks.reduce((n, t) => n + t.qualifiedN, 0));
});

test('expiry is inclusive and recomputes without any write; expired evidence never qualifies', () => {
  const state = fixture();
  const snapshot = JSON.stringify(state);
  const nextDay = read(state, { now: new Date('2026-11-14T00:00:00.000Z') });
  assert.equal(nextDay.totals.qualifiedCellsN, 0);
  assert.equal(nextDay.totals.shortfallN, 3);
  assert.equal(nextDay.tasks[0].counts.expired, 2);
  assert.equal(JSON.stringify(state), snapshot);
});

test('single-chain is first-class; an empty pool is not reassuring coverage', () => {
  const r = read(fixture({ matrix: false }));
  assert.equal(r.tasks[0].qualifiedN, 1);
  assert.equal(r.tasks[1].status, 'empty-pool');
  assert.equal(r.tasks[1].qualifiedN, 0);
  assert.equal(r.tasks[1].outOfPoolN, 1);
  assert.equal(r.tasks[1].shortfallN, 1);
});

test('reorganisation does not move credentials to a new pool or charge a departed member', () => {
  const state = fixture();
  state.reportingLines[0].toISO = '2026-11-12';
  const r = read(state);
  assert.equal(r.tasks[1].qualifiedN, 0);
  assert.equal(r.tasks[1].outOfPoolN, 1);
  state.people.find((p) => p.id === 'kim').status = 'archived';
  const next = read(normalizeState(state, { now: NOW }).state);
  // The declared line still references the now-archived person: the canonical
  // graph refuses it, so a certified zero would be an unjustified claim.
  assert.equal(next.clean, false);
  assert.equal(next.tasks[0].qualifiedN, null);
  assert.match(next.reasons.join(' '), /reporting-graph/);
  assert.equal(next.tasks[0].outOfPoolN, 1);
  state.reportingLines = [];
  const repaired = read(normalizeState(state, { now: NOW }).state);
  assert.equal(repaired.clean, true);
  assert.equal(repaired.tasks[0].qualifiedN, 0);
});

test('missing evidence is unknown, not zero-level or independently qualified', () => {
  const state = fixture(); state.skillActs = [];
  const r = read(state);
  assert.equal(r.tasks[0].counts.unknown, 2);
  assert.equal(r.tasks[0].qualifiedN, 0);
  assert.equal(r.tasks[0].status, 'uncovered');
});

test('raw corruption, duplicate IDs, broken chain and out-of-order evidence all fail closed and survive reload', () => {
  for (const mutate of [
    (s) => s.skillActs.push({ ...s.skillActs[0], id: 'bad', expiresOn: '2026-02-30', supersedesId: 'q1' }),
    (s) => s.skillActs.push({ ...s.skillActs[0] }),
    (s) => s.skillActs.push(act('new', 'A', 'kim', 'ann', 'revoked', { expiresOn: null, supersedesId: null })),
    (s) => s.skillActs.push(act('new', 'A', 'kim', 'ann', 'revoked', { expiresOn: null, supersedesId: 'q1', recordedAt: '2026-11-11T09:00:00.000Z' })),
    (s) => { s.skillTasks[0].floor = '2'; },
    (s) => { s.skillActs = null; },
  ]) {
    const s = fixture(); mutate(s);
    const first = normalizeState(s, { now: NOW });
    const r = read(first.state);
    assert.equal(r.clean, false);
    assert.equal(r.totals.qualifiedCellsN, null, 'no resurrection of prior good evidence');
    assert.ok(r.invalidN > 0);
    assert.ok(first.warnings.some((w) => w.includes('Coverage withheld')));
    const second = normalizeState(first.state, { now: NOW });
    assert.deepEqual(second.state.skillActs, first.state.skillActs);
    assert.deepEqual(second.state.skillTasks, first.state.skillTasks);
  }
});

test('over-bound evidence is retained for recovery and refuses claims rather than trimming a revocation', () => {
  const tasks = normalizeSkillTasks([task('A', 'ann')]);
  const rows = Array.from({ length: SKILL_LIMITS.acts + 1 }, (_, i) => act(`q${i}`, 'A', `p${i}`, 'ann'));
  const normalized = normalizeSkillActs(rows, tasks);
  assert.equal(normalized.at(-1).invalid, true);
  assert.equal(normalized.at(-1).excessRows[0].id, `q${SKILL_LIMITS.acts}`);
  assert.deepEqual(normalizeSkillActs(normalized, tasks), normalized, 'overflow envelope is stable across reloads');
  const state = fixture(); state.skillActs = normalized;
  assert.equal(read(state).totals.qualifiedCellsN, null);
});

test('future evidence and defective reporting graphs refuse coverage rather than inventing certainty', () => {
  const s = fixture(); s.skillActs[0].recordedAt = '2026-11-13T13:00:00.000Z';
  let r = read(s);
  assert.equal(r.clean, false); assert.match(r.reasons.join(' '), /future-dated/);
  assert.equal(r.tasks[0].qualifiedN, null);
  const broken = fixture(); broken.reportingLines[0].managerId = 'not-on-roster';
  r = read(broken);
  assert.equal(r.clean, false); assert.match(r.reasons.join(' '), /reporting-graph/);
});

test('seat adapter: own-pool detail only, ancestor counts only, no peer evidence or names', () => {
  const s = fixture();
  const ann = read(s, { seat: seatFor(s, 'ann') });
  assert.equal(ann.tasks.length, 1);
  assert.equal(ann.tasks[0].people.length, 2);
  const ada = read(s, { seat: seatFor(s, 'ada') });
  assert.equal(ada.tasks.length, 2);
  assert.ok(ada.tasks.every((t) => t.people.length === 0));
  assert.ok(ada.tasks.every((t) => t.qualifiedN === null), 'small ancestor cells are withheld');
  assert.equal(ada.totals.qualifiedCellsN, null, 'no subtraction through a grand total');
  assert.ok(!JSON.stringify(ada).includes('Observed qualification'));
  const bob = read(s, { seat: seatFor(s, 'bob') });
  assert.deepEqual(bob.tasks.map((t) => t.taskId), ['B']);
  assert.ok(!JSON.stringify(bob).includes('RIA'));
});

test('all commands enforce the declaring holder, matrix-only members work, self/peer attestation is refused', () => {
  const { api, store, sit } = harness();
  sit('bob');
  assert.equal(api.skillRecordQualification({ taskId: 'A', personId: 'kim', level: 'O', expiresOn: '2027-01-01', evidence: 'Observed it directly.' }).ok, false);
  assert.equal(api.skillRetireTask('A').ok, false);
  assert.equal(api.skillRecordQualification({ taskId: 'B', personId: 'ria', level: 'U', expiresOn: '2027-01-01', evidence: 'Observed it directly.' }).ok, false);
  const good = api.skillRecordQualification({ taskId: 'B', personId: 'kim', level: 'U', expiresOn: '2027-01-01', evidence: 'Observed it directly.', byId: 'ann' });
  assert.equal(good.ok, true, good.error);
  assert.equal(store.state.skillActs.at(-1).byId, 'bob', 'caller cannot impersonate another trainer');
  assert.equal(store.state.skillActs.at(-1).supersedesId, 'q3');
  assert.equal(api.skillRecordQualification({ taskId: 'B', personId: 'bob', level: 'O', expiresOn: '2027-01-01', evidence: 'I certified myself.' }).ok, false);
  sit('ada');
  assert.equal(api.skillRecordQualification({ taskId: 'A', personId: 'kim', level: 'O', expiresOn: '2027-01-01', evidence: 'I manage the whole span.' }).ok, false, 'an ancestor is not the task’s holder');
});

test('revocation is append-only, lower levels supersede higher levels, and reload equals the computed report', () => {
  const { api, store, sit, storage, events } = harness(); sit('ann');
  const result = api.skillRecordQualification({ taskId: 'A', personId: 'kim', level: 'revoked', evidence: 'Operating authorisation withdrawn after review.' });
  assert.equal(result.ok, true, result.error);
  assert.equal(store.state.skillActs.length, 4);
  assert.equal(store.state.skillActs[0].level, 'U');
  let r = api.skillCoverageReport().report;
  assert.equal(r.tasks[0].qualifiedN, 0);
  assert.equal(r.tasks[0].counts.revoked, 1);
  assert.ok(events.includes('skills.qualification.recorded'), 'the store sent the mutation through post-commit');
  assert.equal(api.skillRecordQualification({ taskId: 'A', personId: 'kim', level: 'L', expiresOn: '2027-01-01', evidence: 'Observed safe work only with support.' }).ok, true);
  r = api.skillCoverageReport().report;
  assert.equal(r.tasks[0].qualifiedN, 0);
  const reloaded = createStore({ storage, now: () => NOW, postCommitRules: [] }); reloaded.load();
  assert.deepEqual(read(reloaded.state, { seat: seatFor(reloaded.state, 'ann') }), r);
});

test('invalid writes do not mutate any ledger; task declaration/retirement is durable and non-destructive', () => {
  const { api, store, sit, storage } = harness(); sit('ann');
  const before = JSON.stringify(store.state.skillTasks);
  for (const floor of [0, 101, 1.5, '2', NaN]) assert.equal(api.skillDeclareTask({ title: 'Operate press', standard: 'Perform full changeover safely.', floor }).ok, false);
  assert.equal(JSON.stringify(store.state.skillTasks), before);
  const good = api.skillDeclareTask({ title: 'Operate press', standard: 'Perform full changeover safely.', floor: 2 });
  assert.equal(good.ok, true, good.error);
  assert.equal(api.skillDeclareTask({ title: 'Operate press', standard: 'Perform full changeover safely.', floor: 2 }).ok, false);
  assert.equal(api.skillRecordQualification({ taskId: good.id, personId: 'kim', level: 'U', expiresOn: '2026-02-30', evidence: 'Observed demonstration.' }).ok, false);
  assert.equal(api.skillRecordQualification({ taskId: good.id, personId: 'kim', level: 'U', expiresOn: '2026-11-13', evidence: 'Observed demonstration.' }).ok, true);
  assert.equal(api.skillRetireTask(good.id).ok, true);
  assert.equal(api.skillCoverageReport().report.clean, true, 'same-day retirement does not invalidate legitimate prior acts');
  assert.equal(api.skillCoverageReport().report.retiredN, 1);
  const reload = createStore({ storage, now: () => NOW, postCommitRules: [] }); reload.load();
  assert.equal(read(reload.state).clean, true);
  assert.equal(reload.state.skillActs.length, 4);
  assert.equal(api.skillRetireTask(good.id).ok, false);
});

test('one real shared-spine commit persists the same qualification and report without error', () => {
  const { api, store, sit, storage } = harness(fixture(), { realSpine: true }); sit('bob');
  const result = api.skillRecordQualification({ taskId: 'B', personId: 'kim', level: 'L', expiresOn: '2027-01-01', evidence: 'Reassessment found support still needed.' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.saved, true);
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.deepEqual(persisted.skillActs, store.state.skillActs);
  assert.equal(api.skillCoverageReport().report.tasks[0].qualifiedN, 0);
  assert.ok(store.state.events.some((e) => e.type === 'skills.qualification.recorded'));
  assert.ok(!store.state.events.some((e) => e.type === 'automation.rule_error'));
});

test('actual standard-work skills panel: rendered counts equal reader, real forms save, asset is present', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="modal-root"></div></body></html>', { url: 'https://example.test/' });
  const keys = ['window', 'document', 'HTMLElement', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const old = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of keys) Object.defineProperty(globalThis, k, { value: dom.window[k]?.bind && k.includes('AnimationFrame') ? dom.window[k].bind(dom.window) : dom.window[k], configurable: true, writable: true });
  try {
    const { api, store, sit } = harness(); sit('ann');
    const ctx = { api, query: new URLSearchParams('panel=skills'), navigate() {}, refresh() {} };
    document.getElementById('root').append(renderStandardWork(ctx));
    const r = api.skillCoverageReport().report;
    const text = document.querySelector('[data-testid="skill-summary"]').textContent;
    assert.ok(text.includes(`${r.totals.qualifiedCellsN} qualified task/person cells`));
    assert.ok(text.includes(`${r.totals.shortfallN} total shortfall`));
    assert.equal(document.querySelectorAll('[data-testid="skill-task-A"] tbody tr').length, 2);
    const img = document.querySelector('img[src$="skill-coverage.jpg"]');
    assert.ok(img && img.alt.includes('Conceptual'));
    const bytes = fs.readFileSync(new URL('../../app/assets/skill-coverage.jpg', import.meta.url));
    assert.ok(bytes.length > 10000); assert.equal(bytes.readUInt16BE(0), 0xffd8);
    document.querySelector('[data-testid="skill-declare"]').click();
    document.querySelector('[name="title"]').value = 'Inspect safety interlock';
    document.querySelector('[name="standard"]').value = 'Demonstrate safe isolation and interlock test.';
    document.querySelector('[name="floor"]').value = '2';
    document.querySelector('[data-testid="skill-save"]').click();
    const t = store.state.skillTasks.at(-1);
    assert.equal(t.title, 'Inspect safety interlock'); assert.equal(t.floor, 2);
    document.getElementById('root').replaceChildren(renderStandardWork(ctx));
    document.querySelector('[data-testid="skill-attest-A"]').click();
    document.querySelector('[name="level"]').value = 'O';
    document.querySelector('[name="expiresOn"]').value = '2027-01-01';
    document.querySelector('[name="evidence"]').value = 'Observed full safe operation and teach-back.';
    document.querySelector('[data-testid="skill-save"]').click();
    assert.equal(store.state.skillActs.at(-1).level, 'O');
    assert.equal(api.skillCoverageReport().report.tasks[0].qualifiedN, 1);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
