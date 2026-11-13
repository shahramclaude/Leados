/**
 * tests/app/duty-handover-digest.test.mjs — ADR-0132, Schema v118 unchanged.
 *
 * One focused pass over the built path: inference-only covers reach the seat's
 * Desk digest, roll up as counts, clear through the existing rehearsal write,
 * reappear on revocation, respect the identity wall, and render/act in the UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildDutyCoverageReport, dutyCoverageBriefText, dutyCoverageCsvRows, buildHandoverDigest,
} from '../../app/core/domain/dutyCoverage.js';
import { DUTY_COVERAGE_LIMITS } from '../../app/core/domain/dutyCoverageRegistry.js';
import { DUTY_REHEARSAL_EVENTS, DUTY_REHEARSAL_RELATION } from '../../app/core/domain/dutyRehearsalRegistry.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2027-07-04T00:00:00.000Z');
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
  ].map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
}

function caseRow(id, ownerId, involved) {
  return {
    id, title: `Case ${id}`, status: 'open', ownerId, involvedPersonIds: involved,
    openedOn: '2027-07-01', resolvedOn: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    fmea: { severity: 5 },
  };
}

function makeState({ activeSeatId = 'mgr1' } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Whitfield', chainLeaderAltitude: 'chief', activeSeatId };
  state.people = people();
  state.cases = [
    caseRow('case-1', 'ic1', ['ic1', 'mgr1']),
    caseRow('case-2', 'ic2', ['ic2', 'mgr1']),
    caseRow('case-3', 'ic2', ['ic2', 'mgr1']),
  ];
  state.absencePlans = [
    { seatId: 'lead1', from: '2027-07-05', to: '2027-07-09' },
    { seatId: 'lead2', from: '2027-07-06', to: '2027-07-10' },
  ].map((a, i) => ({
    id: `abs-${i + 1}`, seatId: a.seatId, from: a.from, to: a.to,
    reason: 'A planned absence declared for this window.', note: '', decisionId: null,
    declaredBySeatId: a.seatId, declaredOn: ago(2), declaredAt: NOW.toISOString(),
    status: 'active', revokedOn: null, revokedAt: null, revokeReason: '', version: 'duty-absence-2026.11-v1',
  }));
  state.dutyCovers = [
    { seatId: 'lead1', dutyKey: 'first-signal', coverId: 'mgr1' },
    { seatId: 'lead2', dutyKey: 'first-signal', coverId: 'mgr1' },
  ].map((c, i) => ({
    id: `cover-${i + 1}`, dutyId: `${c.seatId}|${c.dutyKey}`, seatId: c.seatId, dutyKey: c.dutyKey,
    coverId: c.coverId, note: 'Declared answerable for this duty.', decisionId: null,
    declaredBySeatId: 'mgr1', declaredOn: ago(5), declaredAt: NOW.toISOString(), status: 'active',
    revokedOn: null, revokedAt: null, revokeReason: '', verifiedOn: null, version: 'duty-coverage-2026.11-v1',
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

const reportFor = (state, seatId = state.settings.activeSeatId, now = NOW) =>
  buildDutyCoverageReport(state, { now, settings: { ...state.settings, activeSeatId: seatId } });
const digestOf = (state, seatId, now) => reportFor(state, seatId, now).absences.handoverDigest;

test('the digest lists only inference-only covers, scopes by seat, sorts by open work then cutoff, and rolls up counts without changing the badge', () => {
  assert.equal(SCHEMA_VERSION, 147);
  const state = makeState();
  const manager = digestOf(state, 'mgr1');
  assert.equal(manager.summary.checksN, 2);
  assert.equal(manager.summary.openWorkChecksN, 2);
  assert.equal(manager.summary.cutoffPassedN, 0);
  assert.equal(manager.summary.windowsN, 2);
  assert.deepEqual(manager.rows.map((r) => r.planId), ['abs-1', 'abs-2'], 'equal open work falls back to the earlier preparation cutoff');
  assert.equal(manager.rows[0].openN, manager.rows[1].openN);
  assert.ok(manager.rows[0].preparationTo < manager.rows[1].preparationTo);
  assert.equal(manager.rows[0].coverName, 'Mei Chen');
  assert.equal(manager.rows[0].canRecord, true);
  assert.equal(manager.rows[0].evidenceOn, '2027-07-01');

  const frontline = digestOf(state, 'lead1');
  assert.equal(frontline.summary.checksN, 1);
  assert.equal(frontline.rows[0].planId, 'abs-1');
  const peer = digestOf(state, 'lead2');
  assert.equal(peer.summary.checksN, 1);
  assert.equal(peer.rows[0].planId, 'abs-2', 'a peer never inherits the sibling’s check');

  const director = digestOf(state, 'dir1');
  assert.equal(director.summary.checksN, 2);
  assert.equal(director.namesVisible, false);
  for (const row of director.rows) {
    assert.equal(row.holderName, null);
    assert.equal(row.coverName, null);
    assert.equal(row.evidenceSourceId, null);
    assert.ok(!Object.hasOwn(row, 'coverId'));
    assert.ok(!Object.hasOwn(row, 'holderSeatId'));
  }
  const serialized = JSON.stringify(director);
  for (const banned of ['Mei Chen', 'Priya Raman', 'Jordan Lee', 'case-1', 'case-2']) assert.ok(!serialized.includes(banned), banned);

  const brief = dutyCoverageBriefText(reportFor(state, 'dir1'));
  assert.match(brief, /Handover checks \(inference-only covers\): 2 across 2 unended absence window/);
  for (const banned of ['Mei Chen', 'Priya Raman', 'cover-1', 'abs-1', 'mgr1', 'lead1']) assert.ok(!brief.includes(banned), banned);
  const csv = dutyCoverageCsvRows(reportFor(state, 'dir1'));
  const absenceRows = csv.filter((r) => r.row_kind === 'absence');
  assert.equal(absenceRows.length, 2);
  assert.ok(absenceRows.every((r) => r.absence_handover_checks_n === 1 && r.absence_handover_open_work_n === 1));
  assert.deepEqual([...new Set(csv.map((r) => r.row_kind))].sort(), ['absence', 'branch', 'branch-summary', 'duty', 'register']);

  const { api } = boot(state);
  const managerReport = reportFor(state, 'mgr1');
  assert.equal(api.dutyCoverageAttentionCount(), managerReport.summary.openGapN + managerReport.summary.ineligibleN, 'the digest is a review prompt, not a new navigation badge');
});

test('the existing rehearsal transaction clears the check, writes the typed edge and roll-ups, and survives reload; revocation brings it back', () => {
  const { store, api } = boot(makeState());
  assert.equal(digestOf(store.state, 'mgr1').summary.checksN, 2);
  const beforeDecisions = store.state.decisions.length;
  const result = api.dutyRehearsalRecord({
    coverRowId: 'cover-1', rehearsedOn: '2027-07-01', mode: 'supervised', outcome: 'ready',
    note: 'Walked the escalation triage end to end on the live board.',
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.decisionId, null);
  assert.equal(store.state.decisions.length, beforeDecisions);
  assert.equal(digestOf(store.state, 'mgr1').summary.checksN, 1);
  assert.equal(digestOf(store.state, 'lead1').summary.checksN, 0);
  assert.equal(digestOf(store.state, 'mgr1').rows[0].planId, 'abs-2');

  const row = store.state.dutyRehearsals[0];
  const attest = store.state.links.filter((l) => l.relation === DUTY_REHEARSAL_RELATION);
  assert.equal(attest.length, 1);
  assert.equal(attest[0].targetId, 'cover-1');
  const rollups = store.state.links.filter((l) => l.sourceType === 'rehearsal' && l.relation === 'rolls-up-to');
  assert.deepEqual(rollups.map((l) => l.targetId).sort(), ['dir1', 'lead1', 'mgr1', 'vp1']);
  assert.ok(store.state.events.some((e) => e.type === DUTY_REHEARSAL_EVENTS.RECORD && e.entityId === row.id));

  const reloaded = boot(store.state);
  assert.equal(digestOf(reloaded.store.state, 'mgr1').summary.checksN, 1, 'derived, not stored');
  const revoked = reloaded.api.dutyRehearsalRevoke({ id: row.id, reason: 'The attestation no longer holds after the roster move.' });
  assert.equal(revoked.ok, true, revoked.error);
  assert.equal(digestOf(reloaded.store.state, 'mgr1').summary.checksN, 2, 'inferred work is still valid, so the review prompt returns');
});

test('gaps leave the inference queue for their own governed decision; started windows print cutoff passed and ended windows clear', () => {
  const { store, api } = boot(makeState());
  const gaps = api.dutyRehearsalRecord({
    coverRowId: 'cover-1', rehearsedOn: '2027-07-01', mode: 'handover', outcome: 'gaps',
    note: 'The night escalation stalled at the handoff.',
  });
  assert.equal(gaps.ok, true, gaps.error);
  assert.ok(gaps.decisionId);
  const afterGaps = digestOf(store.state, 'mgr1');
  assert.equal(afterGaps.summary.checksN, 1);
  assert.equal(afterGaps.rows[0].planId, 'abs-2');

  const fresh = makeState();
  const started = digestOf(fresh, 'mgr1', new Date('2027-07-05T00:00:00.000Z'));
  assert.equal(started.summary.checksN, 2);
  assert.equal(started.summary.cutoffPassedN, 1);
  assert.equal(started.rows.find((r) => r.planId === 'abs-1').cutoffPassed, true);
  const ended = digestOf(fresh, 'mgr1', new Date('2027-07-11T00:00:00.000Z'));
  assert.equal(ended.summary.checksN, 0);
});

test('the Desk slice is bounded and the remainder is counted, never silently dropped', () => {
  const checks = Array.from({ length: DUTY_COVERAGE_LIMITS.handoverDigestRowCap + 5 }, (_, i) => ({
    id: `check-${i}`, planId: `abs-${i}`, openN: i % 3, preparationTo: '2027-07-04', from: '2027-07-05', cutoffPassed: false, canRecord: true,
  }));
  const digest = buildHandoverDigest(checks, { namesVisible: true });
  assert.equal(digest.summary.checksN, checks.length);
  assert.equal(digest.rows.length, DUTY_COVERAGE_LIMITS.handoverDigestRowCap);
  assert.equal(digest.summary.deferredN, 5);
  assert.equal(digest.summary.rowCap, DUTY_COVERAGE_LIMITS.handoverDigestRowCap);
  assert.equal(digest.rows[0].openN, 2, 'open work on the duty is the first sort key');
  assert.ok(digest.rows.every((r, i) => i === 0 || digest.rows[i - 1].openN >= r.openN));
});

test('the Desk renders the queue axe-clean and the Record rehearsal act clears the row end to end', async () => {
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

  const { store, api } = boot(makeState());
  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  const ctx = { api, query: new URLSearchParams('panel=desk'), navigate: () => {}, refresh: () => view.replaceChildren(renderDutyCover(ctx)) };
  if (!window.axe) window.eval(AXE_SRC);
  view.replaceChildren(renderDutyCover(ctx));
  assert.match(view.textContent, /Handover checks — 2 inference-only cover check/);
  assert.match(view.textContent, /Inferred evidence/);
  assert.match(view.textContent, /Record rehearsal/);
  const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), []);

  const button = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Record rehearsal');
  assert.ok(button);
  button.click();
  const modal = window.document.body.textContent;
  assert.match(modal, /Record a rehearsal/);
  const set = (name, value) => {
    const field = window.document.querySelector(`[name="${name}"]`);
    assert.ok(field, name);
    field.value = value;
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  set('rehearsedOn', '2027-07-01');
  set('mode', 'supervised');
  set('outcome', 'ready');
  set('note', 'Walked the whole triage path on the live board.');
  const submit = [...window.document.querySelectorAll('button')].find((b) => b.textContent === 'Record the rehearsal');
  assert.ok(submit);
  submit.click();
  assert.equal(digestOf(store.state, 'mgr1').summary.checksN, 1);
  assert.match(view.textContent, /Handover checks — 1 inference-only cover check/);
  assert.deepEqual(consoleErrors, []);
});
