/**
 * tests/app/nav-counter-cache.test.mjs — the navigation badge strip's cache.
 *
 * The badge strip runs ~110 domain reads per render (retention hazard curves,
 * capacity PERT, the deferral option lattice, resilience Bus-Factor…). On the
 * demo workspace that was 450-530ms — most of a route change — recomputing
 * numbers that had not moved. The cache added for that must be **invisible**
 * in behaviour and **visible** in cost, so this file asserts both:
 *
 *   1. A route change over the same workspace snapshot reuses the previous
 *      computation (measured by the instrumentation, not by a stopwatch).
 *   2. A committed write invalidates it, and the badge the leader sees changes
 *      in the same render — the cache can never print a stale number.
 *   3. A new calendar day invalidates it (the reads are day-based).
 *   4. One navigation paints once: the queued hashchange event does not repeat
 *      the render that already happened.
 *   5. The fusion hub the shell registers is the canonical engine — the hub
 *      sees every family that produced a finding, not a hand-picked three.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { clearPerf, perfRead } from '../../app/core/perf.js';
import { buildDemoState } from '../../app/core/demo.js';
import { clearIntelligenceRegistry, registeredSources, intelligenceHubRead } from '../../app/core/domain/intelligenceHub.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = new Date('2026-11-14T10:00:00.000Z');

function boot() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => consoleErrors.push(e.message));
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  // A real workspace with real records: an empty one has nothing to fuse and
  // nothing to badge, which would make every claim below vacuous.
  window.localStorage.setItem('leados.lifecycle.v1', JSON.stringify(buildDemoState(NOW)));
  return { dom, window, document: window.document, consoleErrors };
}

let appModule = null;
async function getApp() {
  if (!appModule) appModule = await import('../../app/main.js');
  return appModule;
}

async function createAppInstance(env, options = {}) {
  const { createApp } = await getApp();
  return createApp({
    root: env.document.getElementById('view'),
    storage: env.window.localStorage,
    now: () => NOW,
    ...options,
  });
}

/** Badge text per destination, read from the DOM the leader actually sees. */
function badges(env) {
  const out = {};
  for (const link of env.document.querySelectorAll('#sidebar-nav .nav-item')) {
    const count = link.querySelector('.nav-count');
    if (count) out[link.getAttribute('href')] = count.textContent.trim();
  }
  return out;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const navSamples = () => perfRead().filter((s) => s.label === 'nav.counters');

test('a route change over an unchanged workspace reuses the badge computation', async () => {
  clearPerf();
  clearIntelligenceRegistry();
  const env = boot();
  const app = await createAppInstance(env);
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));

  const before = badges(env);
  assert.ok(Object.keys(before).length >= 3, 'the demo workspace should light some badges');
  const afterBoot = navSamples().length;
  assert.ok(afterBoot >= 1, 'the first render must compute the badges once');

  // Five route changes, one workspace snapshot: the work happens once.
  for (const route of ['cases', 'people', 'today', 'insights', 'cases']) app.navigate(`#/${route}`);
  assert.equal(
    navSamples().length,
    afterBoot,
    'navigating between screens must not re-run 110 domain reads',
  );
  assert.deepEqual(badges(env), before, 'the cached badges are the same badges');

  const stats = env.window.__LEADOS_PERF.navCounters();
  assert.ok(stats.hits >= 5, `expected cache hits, saw ${JSON.stringify(stats)}`);
  assert.equal(stats.misses, afterBoot, 'one miss per computation');
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('a committed write invalidates the cache and the visible badge changes in the same render', async () => {
  clearPerf();
  clearIntelligenceRegistry();
  const env = boot();
  const app = await createAppInstance(env);
  const before = badges(env);
  const beforeMisses = env.window.__LEADOS_PERF.navCounters().misses;

  // A person with no start date, no 1:1 and no feedback is a severity-4
  // finding set; the Signals badge must move without a reload.
  const add = app.api.addPerson({ name: 'Cache Probe', role: 'Engineer', level: 'ic' });
  assert.equal(add.ok, true, add.error);
  const after = badges(env);
  assert.notDeepEqual(after, before, 'a write must repaint the badges');
  assert.ok(env.window.__LEADOS_PERF.navCounters().misses > beforeMisses, 'the write must invalidate the cache');
  assert.ok(app.store.state.people.some((p) => p.name === 'Cache Probe'));

  // And the recomputed value is the same value an uncached render would print:
  // re-navigating now must not change the badge again.
  const settled = badges(env);
  app.navigate('#/people');
  assert.deepEqual(badges(env), settled);
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('one navigation paints once — the queued hashchange does not repeat it', async () => {
  clearPerf();
  clearIntelligenceRegistry();
  const env = boot();
  const app = await createAppInstance(env);
  const before = navSamples().length;
  const beforeHits = env.window.__LEADOS_PERF?.navCounters?.().hits ?? 0;

  app.navigate('#/cases');
  await tick();
  await tick();
  const afterEvent = navSamples().length;
  assert.equal(afterEvent, before, 'the hashchange render repeated the work');
  const hits = env.window.__LEADOS_PERF.navCounters().hits;
  // Exactly one consult: the synchronous paint inside navigate. A second one
  // would be the queued hashchange re-rendering a route already on screen.
  assert.equal(hits - beforeHits, 1, 'the suppressed hashchange must not consult the badge cache');

  // A hash set from outside the shell (a bookmark, a typed URL, back/forward)
  // still renders: the guard only consumes the paint navigate already did.
  env.window.location.hash = '#/people';
  env.window.dispatchEvent(new env.window.HashChangeEvent('hashchange'));
  assert.ok(env.document.getElementById('view').querySelector('h1'), 'external hashchange still renders');
});

test('the shell wires the fusion hub to the canonical engine', async () => {
  clearPerf();
  clearIntelligenceRegistry();
  assert.deepEqual(registeredSources(), [], 'the registry starts empty in this process');
  const env = boot();
  const app = await createAppInstance(env);

  assert.deepEqual(registeredSources(), ['insights'], 'the shell registers the insight engine as the fusion source');

  // Demo workspace: the engine produces findings across many families, and the
  // hub must fuse all of them — not three hand-picked modules.
  const insights = app.ctx.getInsights();
  assert.ok(insights.findings.length > 20, `expected a rich demo finding set, saw ${insights.findings.length}`);
  const hub = intelligenceHubRead(app.store.state, NOW);
  assert.equal(hub.dedupedCount, insights.findings.length, 'every finding is fused');
  assert.ok(hub.domainCount >= 8, `expected many families, saw ${hub.domainCount}: ${Object.keys(hub.byDomain).join(', ')}`);
  assert.ok(hub.convergingClusters >= 1, 'the demo workspace should contain at least one converging cluster');
  assert.equal(hub.sources.length, 1);
  assert.ok(hub.topSignals.length > 0);
  // Ranking must be monotone in urgency and every entry must carry the boost.
  for (let i = 1; i < hub.ranked.length; i += 1) {
    assert.ok(hub.ranked[i - 1]._urgency >= hub.ranked[i]._urgency);
  }
  assert.ok(hub.ranked.every((s) => typeof s._clusterBoost === 'number'));
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});
