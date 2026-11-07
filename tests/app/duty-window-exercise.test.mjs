/**
 * tests/app/duty-window-exercise.test.mjs — ADR-0125, Schema v115 unchanged.
 *
 * One focused pass over the built path: a cover is exercised for a SPECIFIC
 * absence only when duty-specific evidence is recorded by today inside the
 * preparation window ending the day before the absence starts. The suite proves
 * closed-work evidence, wrong-source refusal, stale/future/late/missing bands,
 * held-1:1 credit (not synthetic cadence), window-shift re-derivation, hierarchy
 * roll-up + identity wall, the declare/scan transaction, derived-not-stored, and
 * the plan panel render.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildSeats, activeSeat } from '../../app/core/domain/seat.js';
import {
  absenceWindowPlan, buildDutyCoverageReport, dutyCoverageBriefText,
} from '../../app/core/domain/dutyCoverage.js';
import {
  buildWindowExerciseIndex, windowExerciseFor,
} from '../../app/core/domain/dutyWindowExercise.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-07-04T00:00:00.000Z');
const WINDOW = { from: '2027-07-05', to: '2027-07-09' };
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);

function people() {
  return [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1' },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1' },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1' },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1' },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead2' },
  ];
}

function caseRow(id, day, { closed = false, involved = ['ic1', 'mgr1'] } = {}) {
  return {
    id, title: `Case ${id}`, status: closed ? 'resolved' : 'open', ownerId: 'ic1',
    involvedPersonIds: involved, openedOn: day, resolvedOn: closed ? day : null,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), fmea: { severity: 5 },
  };
}

function makeState({ activeSeatId = 'lead1', cases = [], oneOnOnes = [], absences = [], covers = null } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    oneOnOneCadenceDays: 7,
    activeSeatId,
  };
  state.people = people().map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
  state.cases = cases;
  state.oneOnOnes = oneOnOnes;
  state.absencePlans = absences.map((a, i) => ({
    id: `abs-${i + 1}`, seatId: a.seatId, from: a.from, to: a.to,
    reason: 'A planned absence declared for this window.', note: '', decisionId: null,
    declaredBySeatId: a.seatId, declaredOn: ago(2), declaredAt: NOW.toISOString(),
    status: 'active', revokedOn: null, revokedAt: null, revokeReason: '', version: 'duty-absence-2026.11-v1',
  }));
  const coverRows = covers || [
    { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' },
    { seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' },
  ];
  state.dutyCovers = coverRows.map((c, i) => ({
    id: `cover-${i + 1}`, dutyId: `${c.seatId}|${c.dutyKey}`, seatId: c.seatId,
    dutyKey: c.dutyKey, coverId: c.coverId, note: 'Declared answerable for this duty.',
    decisionId: null, declaredBySeatId: 'mgr1', declaredOn: ago(5), declaredAt: NOW.toISOString(),
    status: 'active', revokedOn: null, revokedAt: null, revokeReason: '', verifiedOn: null,
    version: 'duty-coverage-2026.11-v1',
  }));
  return normalizeState(state, { now: NOW }).state;
}

function boot(state) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

function planFor(state, window = WINDOW, seatId = state.settings.activeSeatId, namesVisible = null) {
  const built = buildSeats(state, { now: NOW, settings: state.settings });
  const seat = built.byId.get(seatId) || activeSeat(built);
  return absenceWindowPlan(state, built, seat, window, { now: NOW, settings: state.settings, namesVisible });
}

function firstSignal(plan) {
  return plan.rows.find((r) => r.key === 'first-signal');
}

test('closed duty-specific work at the preparation cutoff covers the window; an unrelated source does not', () => {
  const wrongSource = makeState({ cases: [], covers: [{ seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' }] });
  wrongSource.delegations = [{ id: 'del-1', title: 'Rota', personId: 'mgr1', delegatedOn: '2027-07-04', status: 'active' }];
  const thin = firstSignal(planFor(wrongSource));
  assert.equal(thin.windowBand, 'thin');
  assert.equal(thin.covers[0].windowExercise.status, 'missing');

  const state = makeState({ cases: [caseRow('case-valid', '2027-07-04', { closed: true })] });
  const plan = planFor(state);
  assert.deepEqual(plan.exerciseWindow, { from: '2027-06-05', to: '2027-07-04', days: 30 });
  const row = firstSignal(plan);
  assert.equal(row.windowBand, 'covered');
  assert.equal(row.covers[0].windowExercise.status, 'valid');
  assert.equal(row.covers[0].windowExercise.evidence.sourceId, 'case-valid');
  assert.equal(row.covers[0].windowExercise.evidence.day, '2027-07-04');
  assert.equal(plan.summary.exercise.validCoversN, 1);
});

test('stale, future-dated, late and missing evidence are refused with their own reason', () => {
  const built = buildSeats(makeState(), { now: NOW, settings: makeState().settings });
  const seat = built.byId.get('lead1');
  const grade = (day, window = WINDOW) => {
    const state = makeState({ cases: day ? [caseRow('case-x', day)] : [] });
    const index = buildWindowExerciseIndex(state, built, seat, { now: NOW, settings: state.settings });
    return windowExerciseFor(index, 'first-signal', 'mgr1', window, { now: NOW, exerciseDays: 30 });
  };
  assert.equal(grade('2027-06-04').status, 'stale');
  assert.match(grade('2027-06-04').reason, /before the preparation window/);
  // Future-dated evidence is graded directly: the schema may clamp imported
  // dates, but the window reader itself must never credit unobserved work.
  const futureIndex = new Map([['first-signal|mgr1', [{ day: '2027-07-06', type: 'case', typeLabel: 'Operational cases', sourceId: 'case-future', route: '#/cases' }]]]);
  const future = windowExerciseFor(futureIndex, 'first-signal', 'mgr1', WINDOW, { now: NOW, exerciseDays: 30 });
  assert.equal(future.status, 'future');
  assert.match(future.reason, /future-dated work is not observed evidence/);
  assert.equal(grade('2027-06-21', { from: '2027-06-20', to: '2027-06-25' }).status, 'late');
  assert.match(grade('2027-06-21', { from: '2027-06-20', to: '2027-06-25' }).reason, /after the preparation cutoff/);
  assert.equal(grade(null).status, 'missing');
});

test('a held 1:1 credits the manager for coaching; synthetic overdue cadence does not', () => {
  const noMeeting = makeState({ covers: [{ seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' }] });
  const coachThin = planFor(noMeeting).rows.find((r) => r.key === 'coach');
  assert.equal(coachThin.windowBand, 'thin');

  const state = makeState({
    covers: [{ seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1' }],
    oneOnOnes: [{ id: 'oo-1', personId: 'lead1', date: '2027-07-01', status: 'held', notes: 'Handover rehearsal.', agenda: [], actions: [] }],
  });
  const coach = planFor(state).rows.find((r) => r.key === 'coach');
  assert.equal(coach.windowBand, 'covered');
  assert.equal(coach.covers[0].windowExercise.evidence.type, 'oneonone');
  assert.equal(coach.covers[0].windowExercise.evidence.sourceId, 'oo-1');
});

test('shifting the absence window re-derives the verdict without mutating the record', () => {
  const state = makeState({ cases: [caseRow('case-valid', '2027-07-04')] });
  const before = JSON.stringify(state);
  assert.equal(firstSignal(planFor(state, WINDOW)).windowBand, 'covered');
  const far = firstSignal(planFor(state, { from: '2027-09-01', to: '2027-09-05' }));
  assert.equal(far.windowBand, 'thin');
  assert.equal(far.covers[0].windowExercise.status, 'stale');
  assert.equal(JSON.stringify(state), before, 'the read stores nothing');
});

test('the same exercise counts roll up through report/brief; source ids are withheld above rank 2', () => {
  const state = makeState({
    cases: [caseRow('case-valid', '2027-07-04', { closed: true })],
    absences: [
      { seatId: 'lead1', from: WINDOW.from, to: WINDOW.to },
      { seatId: 'lead2', from: WINDOW.from, to: WINDOW.to },
    ],
    covers: [
      { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' },
      { seatId: 'lead2', dutyKey: 'first-signal', coverId: 'mgr1' },
    ],
  });
  const named = firstSignal(planFor(state, WINDOW, 'lead1', true));
  assert.equal(named.covers[0].windowExercise.evidence.sourceId, 'case-valid');
  const withheld = firstSignal(planFor(state, WINDOW, 'lead1', false));
  assert.equal(withheld.covers[0].windowExercise.evidence.sourceId, null);
  assert.equal(withheld.covers[0].windowExercise.status, 'valid');

  const mgrState = normalizeState({ ...state, settings: { ...state.settings, activeSeatId: 'mgr1' } }, { now: NOW }).state;
  const mgrReport = buildDutyCoverageReport(mgrState, { now: NOW, settings: mgrState.settings });
  assert.ok(mgrReport.absences.exercise.validLinesN >= 1);
  assert.ok(mgrReport.absences.concurrency.coverExercise.validCoversN >= 1);

  const dirState = normalizeState({ ...state, settings: { ...state.settings, activeSeatId: 'dir1' } }, { now: NOW }).state;
  const dirReport = buildDutyCoverageReport(dirState, { now: NOW, settings: dirState.settings });
  const brief = dutyCoverageBriefText(dirReport);
  assert.match(brief, /Pre-window cover exercise/);
  for (const banned of ['Mei Chen', 'Priya Raman', 'case-valid', 'mgr1', 'lead1']) {
    assert.ok(!brief.includes(banned), `the upward brief must not carry ${banned}`);
  }
});

test('declaring an absence puts pre-window exercise on the governed decision and event; the scan re-derives it', () => {
  const state = makeState({ cases: [caseRow('case-valid', '2027-07-04', { closed: true })] });
  const { store, api } = boot(state);
  const declared = api.dutyAbsenceDeclare({ from: WINDOW.from, to: WINDOW.to, reason: 'A planned week off in early July.' });
  assert.equal(declared.ok, true, declared.error);
  assert.equal(declared.exercise.validCoversN, 1);
  const decision = store.state.decisions.find((d) => d.id === declared.decisionId);
  assert.match(decision.question, /Pre-window exercise: 0 available cover\(s\) hold an explicit rehearsal record .* and 1 have inferred duty-specific evidence/);
  const event = store.state.events.find((e) => e.type === 'dutyAbsence.declared' && e.entityId === declared.id);
  assert.match(event.summary, /Pre-window exercise: 0 rehearsed by explicit record, 1 valid on inferred work/);

  const scanned = api.dutyAbsenceScan();
  assert.equal(scanned.ok, true, scanned.error);
  assert.ok(scanned.exercise.validLinesN >= 1);
  const scanEvent = store.state.events.filter((e) => e.type === 'dutyAbsence.scan').at(-1);
  assert.match(scanEvent.summary, /Pre-window exercise/);
});

test('the plan panel renders the preparation window and evidence badge, axe-clean', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    FileReader: window.FileReader, localStorage: window.localStorage,
  })) globalThis[k] = v;

  const state = makeState({ cases: [caseRow('case-valid', '2027-07-04', { closed: true })] });
  const { store, api } = boot(state);
  const declared = api.dutyAbsenceDeclare({ from: WINDOW.from, to: WINDOW.to, reason: 'A planned week off in early July.' });
  assert.ok(declared.ok, declared.error);
  assert.ok(store.state.absencePlans.length === 1);

  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  const ctx = { api, query: new URLSearchParams('panel=plan'), navigate: () => {}, refresh: () => {} };
  if (!window.axe) window.eval(AXE_SRC);
  const node = renderDutyCover(ctx);
  view.replaceChildren(node);
  assert.match(view.textContent, /Preparation evidence must be duty-specific/);
  assert.match(view.textContent, /2027-06-05 → 2027-07-04/);
  assert.match(view.textContent, /evidence 2027-07-04/);
  assert.match(view.textContent, /Pre-window evidence/);
  const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), []);
  assert.deepEqual(consoleErrors, []);
  window.close();
});
