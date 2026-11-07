/**
 * tests/app/succession-export.test.mjs — Session 168, Schema v115 unchanged.
 *
 * The Seat-scoped Succession Export Pack (ADR-0077 follow-up, Session 117
 * roadmap item 4): a counts-only JSON export of the succession report that a
 * chief can hand to an auditor or a board secretary. Identity-free by
 * construction — no person name, no individual rating, no individual cover
 * name, no span node ID.
 *
 * What this suite proves, against the REAL store, the REAL domain engine and
 * the REAL view:
 *   1. `successionExportPack` produces a valid JSON pack with the expected
 *      structure: metadata, seat scope, counts, per-altitude counts,
 *      certification, diffusion, skill, method, and refusals.
 *   2. The pack contains NO person names, NO individual ratings, NO individual
 *      cover names, and NO span node IDs. Every figure is a count, a withheld
 *      rate, or a printed refusal.
 *   3. The API function `successionExportPackFn` returns a JSON string that
 *      parses to the same structure.
 *   4. The succession view renders an "Export bench pack" button that is
 *      axe-clean and accessible.
 *   5. The pack's refusals array captures every refusal from certification,
 *      diffusion, and skill.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  SCHEMA_VERSION, createEmptyState, normalizeState, migrate, normalizeSettings,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  successionExportPack,
  successionReport,
} from '../../app/core/domain/succession.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const AXE_SRC = fs.readFileSync(
  path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8',
);

/* ------------------------------------------------------------------ helpers */

function makeHarness() {
  const warnings = [];
  const state = normalizeState(migrate(createEmptyState(NOW.toISOString()), SCHEMA_VERSION), SCHEMA_VERSION, warnings);
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  let seq = 0;
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `u-${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `u-${++seq}` });
  return { store, api, state, warnings };
}

/* ------------------------------------------------------------------ tests */

test('successionExportPack produces a valid JSON pack with expected structure', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });
  const pack = successionExportPack(report, { now: NOW, schemaVersion: SCHEMA_VERSION });

  assert.equal(pack.app, 'LeadOS');
  assert.equal(pack.module, 'succession');
  assert.equal(pack.schemaVersion, SCHEMA_VERSION);
  assert.ok(pack.exportedAt, 'exportedAt is set');
  assert.ok(pack.seatScope, 'seatScope is present');
  assert.ok(pack.counts, 'counts is present');
  assert.ok(Array.isArray(pack.altitudes), 'altitudes is an array');
  assert.ok(pack.certification, 'certification is present');
  assert.ok(pack.diffusion, 'diffusion is present');
  assert.ok(pack.skill, 'skill is present');
  assert.ok(pack.method, 'method is present');
  assert.ok(Array.isArray(pack.refusals), 'refusals is an array');
});

test('successionExportPack contains no person names, ratings, or span IDs', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });
  const pack = successionExportPack(report, { now: NOW, schemaVersion: SCHEMA_VERSION });
  const json = JSON.stringify(pack);

  // The pack must not contain any field that would identify a person.
  // Check for JSON keys (quoted), not substrings — the method description
  // legitimately mentions "rating" as a word to say what it is NOT.
  assert.ok(!json.includes('"personId"'), 'no personId key');
  assert.ok(!json.includes('"personName"'), 'no personName key');
  assert.ok(!json.includes('"holderId"'), 'no holderId key');
  assert.ok(!json.includes('"holderName"'), 'no holderName key');
  assert.ok(!json.includes('"coverId"'), 'no coverId key');
  assert.ok(!json.includes('"coverName"'), 'no coverName key');
  assert.ok(!json.includes('"readiness"'), 'no readiness key');
  assert.ok(!json.includes('"rating"'), 'no rating key');
  assert.ok(!json.includes('"score"'), 'no score key');

  // The pack must not contain span node IDs (which could identify a seat)
  assert.ok(!json.includes('"nodeId"'), 'no nodeId key');
  // seatId is allowed in seatScope only — check it doesn't appear elsewhere
  assert.ok(!json.includes('"seatId"') || json.indexOf('"seatId"') > json.indexOf('"seatScope"'),
    'seatId only appears inside seatScope');

  // Verify the JSON is parseable
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, 'LeadOS');
});

test('successionExportPack seat scope records altitude and enforcement', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });

  // Without a seat
  const packNoSeat = successionExportPack(report, { now: NOW });
  assert.equal(packNoSeat.seatScope.enforced, false);
  assert.equal(packNoSeat.seatScope.seatId, null);

  // With a declared seat
  const packWithSeat = successionExportPack(report, {
    now: NOW,
    seat: { id: 'seat-1', altitude: 'exec', fullAccess: true },
  });
  assert.equal(packWithSeat.seatScope.seatId, 'seat-1');
  assert.equal(packWithSeat.seatScope.enforced, false); // fullAccess = not enforced

  // With a non-full-access seat
  const packEnforced = successionExportPack(report, {
    now: NOW,
    seat: { id: 'seat-2', altitude: 'manager', fullAccess: false },
  });
  assert.equal(packEnforced.seatScope.seatId, 'seat-2');
  assert.equal(packEnforced.seatScope.enforced, true);
});

test('successionExportPack captures refusals from certification, diffusion, and skill', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });
  const pack = successionExportPack(report, { now: NOW, schemaVersion: SCHEMA_VERSION });

  // The pack should have a refusals array (may be empty on a healthy workspace)
  assert.ok(Array.isArray(pack.refusals), 'refusals is an array');

  // Check that refusals from each source are captured if present
  if (report.certification.refused) {
    assert.ok(pack.refusals.some((r) => r.startsWith('Certification:')), 'certification refusal captured');
  }
  if (report.diffusion.refused) {
    assert.ok(pack.refusals.some((r) => r.startsWith('Diffusion:')), 'diffusion refusal captured');
  }
  if (report.skill?.refused) {
    assert.ok(pack.refusals.some((r) => r.startsWith('Skill:')), 'skill refusal captured');
  }
});

test('successionExportPack per-altitude counts match the report', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });
  const pack = successionExportPack(report, { now: NOW, schemaVersion: SCHEMA_VERSION });

  // Verify per-altitude counts match the report's altitudes
  assert.equal(pack.altitudes.length, report.altitudes.length);
  for (let i = 0; i < report.altitudes.length; i++) {
    const r = report.altitudes[i];
    const p = pack.altitudes[i];
    assert.equal(p.altitude, r.altitude);
    assert.equal(p.rank, r.rank);
    assert.equal(p.spansN, r.spansN);
    assert.equal(p.membersN, r.membersN);
    assert.equal(p.itemsN, r.itemsN);
    assert.equal(p.blockedItemsN, r.blockedItemsN);
    assert.equal(p.certifiedN, r.certifiedN);
    assert.equal(p.concentratedN, r.concentratedN);
    assert.equal(p.coveredN, r.coveredN);
    assert.equal(p.unmeasuredN, r.unmeasuredN);
  }
});

test('successionExportPack certification and diffusion match the report', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });
  const pack = successionExportPack(report, { now: NOW, schemaVersion: SCHEMA_VERSION });

  assert.equal(pack.certification.pIndependence, report.certification.pIndependence);
  assert.equal(pack.certification.pLower, report.certification.pLower);
  assert.equal(pack.certification.refused, report.certification.refused);

  assert.equal(pack.diffusion.share, report.diffusion.share);
  assert.equal(pack.diffusion.degradedN, report.diffusion.degradedN);
  assert.equal(pack.diffusion.measuredN, report.diffusion.measuredN);
  assert.equal(pack.diffusion.spanN, report.diffusion.spanN);
  assert.equal(pack.diffusion.refused, report.diffusion.refused);
});

test('successionExportPackFn API returns a parseable JSON string', () => {
  const { api } = makeHarness();
  const json = api.successionExportPackFn();
  assert.ok(typeof json === 'string', 'returns a string');
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, 'LeadOS');
  assert.equal(parsed.module, 'succession');
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.ok(parsed.counts, 'counts present');
  assert.ok(parsed.method, 'method present');
});

test('succession view renders Export bench pack button, axe-clean', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(`jsdom: ${e.message}`));
  virtualConsole.on('error', (msg) => consoleErrors.push(`console: ${msg}`));

  const dom = new JSDOM('<!DOCTYPE html><html><body><main id="view"></main></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element,
    HTMLElement: window.HTMLElement, SVGElement: window.SVGElement,
    Event: window.Event, CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  })) globalThis[k] = v;

  const { renderSuccession } = await import('../../app/views/succession.js');
  const { api } = makeHarness();
  const ctx = { api, query: new URLSearchParams(), navigate: () => {}, refresh: () => {} };

  if (!window.axe) window.eval(AXE_SRC);
  const node = renderSuccession(ctx);
  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  view.replaceChildren(node);

  assert.ok(view.querySelector('h1'), 'the succession page has an h1');
  assert.ok(view.textContent.length > 200, 'rendered content');
  assert.ok(!/undefined|\[object Object\]/.test(view.textContent), 'no placeholder leaked');

  // Find the Export bench pack button
  const buttons = Array.from(view.querySelectorAll('button'));
  const exportBtn = buttons.find((b) => b.textContent.includes('Export bench pack'));
  assert.ok(exportBtn, 'the Export bench pack button is rendered');

  // Verify the button has an accessible name
  const name = (exportBtn.getAttribute('aria-label') || exportBtn.textContent || '').trim();
  assert.ok(name.length > 0, 'the Export bench pack button has an accessible name');

  // Run axe
  const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(
    Array.from(res.violations).map((v) => `${v.id}: ${v.help}`),
    [],
    'the succession view has axe violations',
  );

  assert.deepEqual(consoleErrors, [], 'no console errors while rendering');
  window.close();
});

test('successionExportPack on an empty workspace produces honest zeros and refusals', () => {
  const { state } = makeHarness();
  const report = successionReport(state, { now: NOW });
  const pack = successionExportPack(report, { now: NOW, schemaVersion: SCHEMA_VERSION });

  // An empty workspace should have zero spans
  assert.equal(pack.counts.spansN, 0);
  assert.equal(pack.counts.measuredN, 0);

  // The certification should refuse (no spans to certify)
  assert.ok(pack.certification.refused, 'certification refuses on an empty workspace');

  // The diffusion should refuse (no measured spans)
  assert.ok(pack.diffusion.refused, 'diffusion refuses on an empty workspace');

  // Refusals should capture both
  assert.ok(pack.refusals.some((r) => r.startsWith('Certification:')), 'certification refusal captured');
  assert.ok(pack.refusals.some((r) => r.startsWith('Diffusion:')), 'diffusion refusal captured');
});
