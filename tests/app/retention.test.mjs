/**
 * tests/app/retention.test.mjs — candidate-record retention review (Schema v18).
 *
 * The rule under test is a *reminder*, not a deletion policy. These tests
 * exist mostly to prove the negative: nothing is ever erased without a person
 * choosing to erase it, a live decision is never nagged about, an explicit
 * "keep in touch" is honoured rather than silently ignored, and an unknown age
 * is reported as unknown instead of guessed.
 *
 * Covers:
 *   1. The review itself — window, boundary, anchors, exemptions, missing roles,
 *      undated records, and the disabled state
 *   2. hiringSummary wiring and the HIRE-08 insight
 *   3. Schema v17 → v18 migration, normalization and the settings contract
 *   4. The action path (deletion still requires an explicit call and is audited)
 *   5. The `#/hiring` retention card, its accessible name and axe-core
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, migrate, normalizeState } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { hiringSummary, retentionReview } from '../../app/core/domain/hiring.js';
import { buildInsights } from '../../app/core/domain/insights.js';
import { buildDemoState } from '../../app/core/demo.js';
import { linksForEntity } from '../../app/core/domain/cases.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');
const TODAY = '2026-10-25';

function kvStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function dayAgo(n) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function requisition(overrides = {}) {
  return {
    id: 'req-1',
    title: 'Finance operations analyst',
    status: 'open',
    openedOn: dayAgo(60),
    targetStartOn: dayAgo(-10),
    closedOn: null,
    competencies: [{ id: 'cmp-1', name: 'Controls design', weight: 4, required: true }],
    interviewers: [],
    effortDays: { optimistic: 1, mostLikely: 3, pessimistic: 5 },
    dailyVacancyCost: null,
    currency: 'USD',
    autoEscalated: false,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  const decision = overrides.decision || { outcome: 'reject', decidedOn: dayAgo(200), rationale: 'Gap in controls design.', evidenceGapAcknowledged: false };
  return {
    id: 'cand-1',
    reqId: 'req-1',
    name: 'Marcus Feld',
    stage: 'rejected',
    appliedOn: dayAgo(210),
    lastActivityOn: dayAgo(200),
    source: 'Job board',
    signals: [],
    decision,
    offerOn: null,
    offerAcceptedOn: null,
    hiredOn: null,
    startOn: null,
    personId: null,
    keepInTouch: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function workspace({ requisitions = [requisition()], candidates = [candidate()], settings = {} } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.requisitions = requisitions;
  state.candidates = candidates;
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state).state;
}

/* ------------------------------------------------------------------ review */

test('retention: the window is a reminder, and a disabled review says so rather than "nothing due"', () => {
  const off = workspace({ settings: { candidateRetentionDays: 0 } });
  const disabled = retentionReview(off, { now: NOW });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.count, 0);
  assert.match(disabled.reason, /switched off/i);
  assert.match(disabled.reason, /kept until you delete them/i);
  // Nothing is due, but the records are still there — a disabled review is not
  // a deletion.
  assert.equal(off.candidates.length, 1);
});

test('retention: a settled record past the window is due, and the age comes from the latest recorded fact', () => {
  const state = workspace({
    candidates: [
      candidate({ id: 'old', name: 'Marcus Feld', decision: { outcome: 'reject', decidedOn: dayAgo(200), rationale: 'Gap.', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(190) }),
      candidate({ id: 'recent', name: 'Sam Okafor', decision: { outcome: 'reject', decidedOn: dayAgo(10), rationale: 'Gap.', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(9) }),
    ],
  });
  const review = retentionReview(state, { now: NOW, settings: { candidateRetentionDays: 180 } });
  assert.equal(review.enabled, true);
  assert.equal(review.count, 1);
  const row = review.due[0];
  assert.equal(row.candidate.id, 'old');
  // 200 days for the decision, but lastActivityOn is more recent at 190, so the
  // clock runs from the *last* recorded fact rather than punishing older records.
  assert.equal(row.ageDays, 190);
  assert.equal(row.anchorOn, dayAgo(190));
  assert.match(row.reason, /closed|no decision activity/i);
});

test('retention: the window boundary is inclusive, and one day short is not due', () => {
  const atWindow = workspace({
    candidates: [candidate({ id: 'edge', decision: { outcome: 'reject', decidedOn: dayAgo(180), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(180), appliedOn: dayAgo(190) })],
  });
  assert.equal(retentionReview(atWindow, { now: NOW, settings: { candidateRetentionDays: 180 } }).count, 1);

  const shortOfWindow = workspace({
    candidates: [candidate({ id: 'edge', decision: { outcome: 'reject', decidedOn: dayAgo(179), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(179), appliedOn: dayAgo(190) })],
  });
  assert.equal(retentionReview(shortOfWindow, { now: NOW, settings: { candidateRetentionDays: 180 } }).count, 0);
});

test('retention: a live candidate on an open role is never nagged about', () => {
  const state = workspace({
    candidates: [
      candidate({
        id: 'live',
        name: 'Priya Raman',
        stage: 'interviewing',
        decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
        appliedOn: dayAgo(400),
        lastActivityOn: dayAgo(300),
      }),
    ],
  });
  const review = retentionReview(state, { now: NOW, settings: { candidateRetentionDays: 30 } });
  assert.equal(review.count, 0, 'the working file for a live decision is not a retention problem');
  assert.equal(review.settledCount, 0);
});

test('retention: a settled candidate is due even while the role is still open, with a different reason', () => {
  const state = workspace({
    candidates: [
      candidate({ id: 'rejected-open-role', decision: { outcome: 'reject', decidedOn: dayAgo(240), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(240) }),
    ],
  });
  const review = retentionReview(state, { now: NOW, settings: { candidateRetentionDays: 180 } });
  assert.equal(review.count, 1);
  assert.equal(review.due[0].roleClosed, false);
  assert.match(review.due[0].reason, /process has ended/i);
});

test('retention: "keep in touch" is exempt and counted separately, so the exemption stays visible', () => {
  const state = workspace({
    candidates: [
      candidate({ id: 'exempt', name: 'Aisha Bello', keepInTouch: true, decision: { outcome: 'reject', decidedOn: dayAgo(240), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(240) }),
      candidate({ id: 'due', name: 'Marcus Feld', decision: { outcome: 'reject', decidedOn: dayAgo(240), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(240) }),
    ],
  });
  const review = retentionReview(state, { now: NOW, settings: { candidateRetentionDays: 180 } });
  assert.deepEqual(review.due.map((r) => r.candidate.id), ['due']);
  assert.deepEqual(review.exempt.map((r) => r.candidate.id), ['exempt']);
  assert.match(review.exempt[0].reason, /retained on purpose/i);
  assert.equal(review.count, 1, 'exempt records are not counted as outstanding work');
});

test('retention: an undated record is unknown age, not "due"', () => {
  const state = workspace({
    candidates: [
      candidate({
        id: 'undated',
        appliedOn: null,
        lastActivityOn: null,
        decision: { outcome: 'reject', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
      }),
    ],
  });
  // normalizeState fills appliedOn/lastActivityOn from today when they are
  // missing, so force the truly-empty case through the review directly.
  const bare = { ...state, candidates: [{ ...state.candidates[0], appliedOn: null, lastActivityOn: null }] };
  const review = retentionReview(bare, { now: NOW, settings: { candidateRetentionDays: 1 } });
  assert.equal(review.count, 0);
});

test('retention: a candidate whose role no longer exists counts as a closed role', () => {
  const state = workspace({
    requisitions: [],
    candidates: [candidate({ id: 'orphanless', decision: { outcome: 'reject', decidedOn: dayAgo(200), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(200) })],
  });
  // normalizeState drops a candidate with no requisition; build the review from
  // the raw shape so the function's own fallback is what is being tested.
  const raw = { ...state, candidates: [candidate({ id: 'orphanless', reqId: 'req-gone', decision: { outcome: 'reject', decidedOn: dayAgo(200), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(200) })] };
  const review = retentionReview(raw, { now: NOW, settings: { candidateRetentionDays: 180 } });
  assert.equal(review.count, 1);
  assert.equal(review.due[0].roleClosed, true);
  assert.equal(review.due[0].requisition, null);
});

test('retention: the review never mutates the workspace', () => {
  const state = workspace({ candidates: [candidate({ decision: { outcome: 'reject', decidedOn: dayAgo(400), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(400) })] });
  const before = JSON.stringify(state.candidates);
  const review = retentionReview(state, { now: NOW, settings: { candidateRetentionDays: 30 } });
  assert.equal(review.count, 1);
  assert.equal(JSON.stringify(state.candidates), before, 'reviewing is not editing');
});

test('retention: due records are ordered oldest first, so the worst offender is on top', () => {
  const state = workspace({
    candidates: [
      candidate({ id: 'a', appliedOn: dayAgo(201), lastActivityOn: dayAgo(200), decision: { outcome: 'reject', decidedOn: dayAgo(200), rationale: '', evidenceGapAcknowledged: false } }),
      candidate({ id: 'b', appliedOn: dayAgo(401), lastActivityOn: dayAgo(400), decision: { outcome: 'reject', decidedOn: dayAgo(400), rationale: '', evidenceGapAcknowledged: false } }),
      candidate({ id: 'c', appliedOn: dayAgo(301), lastActivityOn: dayAgo(300), decision: { outcome: 'reject', decidedOn: dayAgo(300), rationale: '', evidenceGapAcknowledged: false } }),
    ],
  });
  const review = retentionReview(state, { now: NOW, settings: { candidateRetentionDays: 180 } });
  assert.deepEqual(review.due.map((r) => r.candidate.id), ['b', 'c', 'a']);
  assert.equal(review.oldestDays, 400);
});

/* --------------------------------------------------- wiring and insight */

test('retention: hiringSummary carries the review so the index and the insight agree', () => {
  const state = workspace({ settings: { candidateRetentionDays: 180 } });
  const summary = hiringSummary(state, { now: NOW });
  assert.equal(summary.retention.count, 1);
  assert.equal(summary.retention.windowDays, 180);
  assert.equal(retentionReview(state, { now: NOW }).count, summary.retention.count);
});

test('retention: HIRE-08 fires with honest evidence, and escalates when records are far past the window', () => {
  const mild = buildInsights(workspace({ settings: { candidateRetentionDays: 180 } }), NOW).findings.filter((f) => f.ruleId === 'HIRE-08');
  assert.equal(mild.length, 1);
  assert.equal(mild[0].severity, 2);
  assert.ok(mild[0].evidence.some((e) => /Window: 180 days/.test(e)));
  assert.ok(mild[0].evidence.some((e) => /Deletion is manual, audited/.test(e)));
  assert.equal(mild[0].action.route, '#/hiring');

  const severe = buildInsights(
    workspace({
      settings: { candidateRetentionDays: 90 },
      candidates: [candidate({ decision: { outcome: 'reject', decidedOn: dayAgo(300), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(300) })],
    }),
    NOW,
  ).findings.filter((f) => f.ruleId === 'HIRE-08');
  assert.equal(severe[0].severity, 3, '300 days is more than twice a 90-day window');
});

test('retention: HIRE-08 does not fire when the review is off or nothing is due', () => {
  const off = buildInsights(workspace({ settings: { candidateRetentionDays: 0 } }), NOW).findings.filter((f) => f.ruleId === 'HIRE-08');
  assert.equal(off.length, 0);
  const clean = buildInsights(
    workspace({ candidates: [candidate({ decision: { outcome: 'reject', decidedOn: dayAgo(5), rationale: '', evidenceGapAcknowledged: false }, lastActivityOn: dayAgo(4) })] }),
    NOW,
  ).findings.filter((f) => f.ruleId === 'HIRE-08');
  assert.equal(clean.length, 0);
});

test('retention: the demo workspace shows one due record and one deliberate exemption', () => {
  const state = normalizeState(buildDemoState(NOW)).state;
  const review = retentionReview(state, { now: NOW });
  assert.equal(review.count, 1, 'exactly one record is past the window in the demo');
  assert.equal(review.due[0].candidate.name, 'Marcus Feld');
  assert.equal(review.exempt.length, 1, 'the silver medallist is exempt, not a to-do');
  assert.equal(review.exempt[0].candidate.name, 'Aisha Bello');
});

/* ------------------------------------------------------- schema contract */

test('retention: schema v17 → v18 adds the retention window without deleting or ageing anything', () => {
  assert.equal(SCHEMA_VERSION, 40);
  const v17 = {
    schemaVersion: 17,
    settings: { leaderName: 'Sam', candidateRetentionDays: undefined },
    requisitions: [requisition()],
    candidates: [candidate()],
  };
  const before = JSON.stringify(v17.candidates);
  const migrated = migrate(v17, { now: NOW });
  assert.deepEqual(migrated.applied, ['17 → 18', '18 → 19', '19 → 20', '20 → 21', '21 → 22', '22 → 23', '23 → 24', '24 → 25', '25 → 26', '26 → 27', '27 → 28', '28 → 29', '29 → 30', '30 → 31', '31 → 32', '32 → 33', '33 → 34', '34 → 35', '35 → 36', '36 → 37', '37 → 38', '38 → 39', '39 → 40']);
  assert.equal(migrated.raw.schemaVersion, 40);
  assert.equal(migrated.raw.settings.candidateRetentionDays, 180);
  assert.equal(migrated.raw.settings.leaderName, 'Sam');
  assert.equal(JSON.stringify(migrated.raw.candidates), before, 'the migration does not touch candidate records');
});

test('retention: the setting is clamped and repaired rather than trusted', () => {
  const repaired = (value) => normalizeState({ ...createEmptyState(), settings: { candidateRetentionDays: value } }).state.settings.candidateRetentionDays;
  assert.equal(repaired(180), 180);
  assert.equal(repaired(0), 0, 'zero is a real value: it disables the review');
  assert.equal(repaired(-5), 180, 'a negative window falls back to the default');
  assert.equal(repaired(99999), 3650);
  assert.equal(repaired('abc'), 180);
  assert.equal(repaired(90.6), 91);
  const d = createEmptyState().settings.candidateRetentionDays;
  assert.equal(d, 180);
});

test('retention: settings are editable through the action layer and land in the audit trail', () => {
  const now = NOW;
  const store = createStore({ storage: kvStorage(), now: () => now });
  store.load();
  const api = createApi(store, { now: () => now });
  const res = api.updateSettings({ candidateRetentionDays: 90 });
  assert.equal(res.ok, true);
  assert.equal(store.state.settings.candidateRetentionDays, 90);
  assert.ok(store.state.events.some((e) => /settings/i.test(e.type) || /settings/i.test(e.summary || '')), 'the change is recorded');
});

/* -------------------------------------------------------------- the action */

test('retention: deleting from the list removes the record, its evidence and its links — and only that record', () => {
  const now = NOW;
  const store = createStore({ storage: kvStorage(), now: () => now });
  store.load();
  const api = createApi(store, { now: () => now });

  api.addRequisition({ title: 'Finance operations analyst', competencies: 'Controls design' });
  const req = store.state.requisitions[0];
  api.addCandidate({ reqId: req.id, name: 'Marcus Feld' });
  api.addCandidate({ reqId: req.id, name: 'Aisha Bello' });
  const [marcus, aisha] = store.state.candidates;
  store.update((draft) => {
    draft.candidates[0].stage = 'rejected';
    draft.candidates[0].decision = { outcome: 'reject', decidedOn: dayAgo(240), rationale: 'Gap.', evidenceGapAcknowledged: false };
    // addCandidate stamps appliedOn/lastActivityOn as today; age the record so
    // it exercises the real retention path rather than a fresh application.
    draft.candidates[0].appliedOn = dayAgo(250);
    draft.candidates[0].lastActivityOn = dayAgo(240);
    draft.candidates[0].signals = [{ id: 'sig-1', kind: 'structured-interview', competencyId: draft.requisitions[0].competencies[0].id, rating: 2, interviewerId: null, date: dayAgo(242), note: 'Could not explain the control gap.' }];
    draft.links = [{ id: 'lnk-1', sourceType: 'candidate', sourceId: draft.candidates[0].id, targetType: 'requisition', targetId: draft.requisitions[0].id, relation: 'assessed-for', createdAt: new Date().toISOString() }];
  }, { type: 'test.setup', entity: 'candidate', entityId: marcus.id, summary: 'setup' });

  const review = retentionReview(store.state, { now, settings: { candidateRetentionDays: 180 } });
  assert.equal(review.count, 1);
  assert.equal(linksForEntity(store.state, 'candidate', marcus.id).length, 1);

  // The review reports; it does not delete.
  assert.equal(store.state.candidates.length, 2);

  const res = api.deleteCandidate(marcus.id);
  assert.equal(res.ok, true);
  assert.deepEqual(store.state.candidates.map((c) => c.id), [aisha.id]);
  assert.equal(linksForEntity(store.state, 'candidate', marcus.id).length, 0, 'edges went with the record');
  const event = store.state.events.at(-1);
  assert.equal(event.type, 'candidate.deleted');
  assert.match(event.summary, /data minimisation/i);
  assert.equal(retentionReview(store.state, { now, settings: { candidateRetentionDays: 180 } }).count, 0);
});

test('retention: a candidate who is already on the roster cannot be deleted from the list', () => {
  const now = NOW;
  const store = createStore({ storage: kvStorage(), now: () => now });
  store.load();
  const api = createApi(store, { now: () => now });
  api.addRequisition({ title: 'Finance operations analyst', competencies: 'Controls design' });
  api.addPerson({ name: 'Aisha Bello' });
  const person = store.state.people[0];
  api.addCandidate({ reqId: store.state.requisitions[0].id, name: 'Aisha Bello' });
  const cand = store.state.candidates[0];
  store.update((draft) => { draft.candidates[0].personId = person.id; }, { type: 't', entity: 'candidate', entityId: cand.id, summary: 't' });
  const res = api.deleteCandidate(cand.id);
  assert.equal(res.ok, false);
  assert.match(res.error, /roster/i);
});

/* ------------------------------------------------------------------- UI */

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

test('ui: the retention card lists the due record, names its delete action, and passes axe-core', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    app.ctx.navigate('#/hiring');
    const view = env.document.querySelector('#view');
    const text = view.textContent;
    assert.ok(text.includes('Data minimisation'));
    assert.ok(text.includes('180-day retention window'));
    assert.ok(text.includes('Marcus Feld'), 'the due record is listed');
    assert.ok(text.includes('Aisha Bello'), 'the exemption is visible, not silent');
    assert.ok(text.includes('keep in touch') || text.includes('“keep in touch”'));

    const deleteBtn = Array.from(view.querySelectorAll('button')).find((b) => /Delete the record for Marcus Feld/.test(b.getAttribute('aria-label') || ''));
    assert.ok(deleteBtn, 'the row has a button with an accessible name that includes the person');
    assert.equal(deleteBtn.textContent.trim(), 'Delete record');

    const table = view.querySelector('#retention table');
    assert.ok(table, 'the list is a real table');
    assert.ok(table.querySelector('caption'), 'the table has a caption for screen-reader navigation');
    const headers = Array.from(table.querySelectorAll('thead th'));
    assert.equal(headers.length, 5);
    assert.ok(headers.every((th) => th.getAttribute('scope') === 'col'), 'every header cell is a column header');
    assert.ok(headers.every((th) => th.textContent.trim().length > 0), 'no header cell is empty (axe: empty-table-header)');
    assert.equal(headers[4].querySelector('.sr-only').textContent, 'Actions');

    assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
    assert.deepEqual(await axeViolations(env), []);
  } finally {
    env.dom.window.close();
  }
});

test('ui: with the review off the card explains why, and does not pretend a list is empty', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    app.ctx.api.updateSettings({ candidateRetentionDays: 0 });
    app.ctx.navigate('#/hiring');
    const view = env.document.querySelector('#view');
    assert.ok(view.textContent.includes('Data minimisation is switched off'));
    assert.ok(view.textContent.includes('it still never deletes anything for you'));
    assert.equal(view.querySelector('#retention'), null);
    assert.deepEqual(await axeViolations(env), []);
  } finally {
    env.dom.window.close();
  }
});

test('ui: deleting from the retention card asks first, then removes the record and updates the card', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    app.ctx.navigate('#/hiring');
    const view = env.document.querySelector('#view');
    const before = app.ctx.state.candidates.length;
    const deleteBtn = Array.from(view.querySelectorAll('button')).find((b) => /Delete the record for Marcus Feld/.test(b.getAttribute('aria-label') || ''));
    deleteBtn.click();

    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'a confirmation dialog appeared instead of deleting on one click');
    assert.match(dialog.textContent, /Marcus Feld/);
    assert.match(dialog.textContent, /cannot be recovered/i);
    assert.equal(app.ctx.state.candidates.length, before, 'nothing is deleted before confirmation');

    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => /Delete record/.test(b.textContent));
    confirm.click();
    // The view awaits the confirmation promise, so the deletion lands on the
    // next microtask rather than inside the click handler.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(app.ctx.state.candidates.length, before - 1);
    assert.equal(app.ctx.state.candidates.some((c) => c.name === 'Marcus Feld'), false);

    app.ctx.navigate('#/hiring');
    assert.equal(env.document.querySelector('#view').textContent.includes('Marcus Feld'), false);
    assert.deepEqual(await axeViolations(env), []);
  } finally {
    env.dom.window.close();
  }
});

test('ui: Settings exposes the retention window with its honesty caveat', async () => {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  try {
    app.ctx.loadDemo();
    app.ctx.navigate('#/settings');
    const text = env.document.querySelector('#view').textContent;
    assert.ok(text.includes('Candidate record retention reminder'));
    assert.ok(text.includes('180 days after the last recorded fact'));
    assert.ok(text.includes('never automatic deletion'));
    assert.deepEqual(await axeViolations(env), []);
  } finally {
    env.dom.window.close();
  }
});
