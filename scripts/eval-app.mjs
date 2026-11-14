#!/usr/bin/env node
/**
 * scripts/eval-app.mjs — a reproducible evaluation of the canonical LeadOS app.
 *
 * The app has no build step, no server and no dependencies, so the only honest
 * way to evaluate it is to run the real thing: the real index.html, the real
 * modules, a real DOM, a real demo workspace. This script boots that app in
 * jsdom, walks every declared navigation route, and records what actually
 * happened — wall-clock render time, mount cost, DOM size, repeated work on a
 * second render of the same route, empty screens and console errors.
 *
 * It also reports the three pillars this repository claims:
 *   efficiency  — per-route render cost and whether a repeat render is cheaper
 *   intelligence— how many signal families the fusion hub actually sees
 *   automation  — whether the orchestrator's priority/coalescing helpers are
 *                 reachable from the live write path at all
 *
 * Usage:
 *   node scripts/eval-app.mjs                 # human report
 *   node scripts/eval-app.mjs --json          # machine report to stdout
 *   node scripts/eval-app.mjs --out report.json
 *   node scripts/eval-app.mjs --budget-ms 400 # exit non-zero on regressions
 *
 * Exit codes: 0 measured, 1 budget exceeded or a route failed to render.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = new Date('2026-11-14T10:00:00.000Z');

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const JSON_OUT = args.includes('--json');
const OUT = flag('--out');
const BUDGET_MS = Number(flag('--budget-ms', '0')) || 0;

/** Routes are declared once in main.js NAV; read them from the source so the
 *  evaluation can never drift from the shipped navigation. */
function declaredRoutes() {
  const source = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
  const start = source.indexOf('const NAV = [');
  const end = source.indexOf('\n];', start);
  const block = source.slice(start, end === -1 ? source.length : end);
  const routes = [];
  for (const match of block.matchAll(/route:\s*'([^']+)'/g)) {
    if (!routes.includes(match[1])) routes.push(match[1]);
  }
  return routes;
}

function boot() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (...a) => errors.push(a.join(' ')));
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
  return { dom, window, document: window.document, errors };
}

const median = (xs) => {
  if (!xs.length) return 0;
  const sorted = xs.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const round = (n) => Math.round(n * 100) / 100;

async function main() {
  const { window, document, errors } = boot();
  const { createStore, STORAGE_KEY } = await import(path.join(ROOT, 'app/core/store.js'));
  const { buildDemoState } = await import(path.join(ROOT, 'app/core/demo.js'));
  const { createApp } = await import(path.join(ROOT, 'app/main.js'));

  const demo = buildDemoState(NOW);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));

  const app = createApp({
    root: document.getElementById('view'),
    storage: window.localStorage,
    now: () => NOW,
  });

  const state = app.store.state;
  const routes = declaredRoutes();
  const perRoute = [];

  for (const route of routes) {
    errors.length = 0;
    const samples = [];
    // Three renders: cold (route change), warm (same route again), and a third
    // to see whether repeated work is genuinely cached.
    for (let i = 0; i < 3; i += 1) {
      const t0 = process.hrtime.bigint();
      try {
        app.navigate(route);
      } catch (err) {
        errors.push(`navigate threw: ${err.message}`);
      }
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
    }
    const view = document.getElementById('view');
    const h1 = view?.querySelector('h1')?.textContent?.trim() || '';
    perRoute.push({
      route,
      coldMs: round(samples[0]),
      warmMs: round(median(samples.slice(1))),
      nodes: view ? view.querySelectorAll('*').length : 0,
      textLength: view ? (view.textContent || '').trim().length : 0,
      heading: h1.slice(0, 90),
      errors: [...errors].slice(0, 3),
    });
  }

  // What does a save cost? A commit invalidates the badge cache by design, so
  // the write path now pays the domain reads once — measure it rather than
  // assuming it is free.
  const writeSamples = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = process.hrtime.bigint();
    const result = app.api.addPerson({ name: `Eval Probe ${i}`, role: 'Engineer', level: 'ic' });
    writeSamples.push({ ms: Number(process.hrtime.bigint() - t0) / 1e6, ok: result?.ok !== false });
  }
  const navAfterWrite = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = process.hrtime.bigint();
    app.navigate(i % 2 === 0 ? '#/cases' : '#/today');
    navAfterWrite.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }

  const { perfRead, perfSummary } = await import(path.join(ROOT, 'app/core/perf.js'));
  const { intelligenceHubRead, registeredDomains, registeredSources } = await import(path.join(ROOT, 'app/core/domain/intelligenceHub.js'));

  const hub = intelligenceHubRead(state, NOW);
  const knowledge = await knowledgeCoverage(state, NOW);

  const routeTimes = perRoute.map((r) => r.coldMs);
  const report = {
    at: new Date().toISOString(),
    schemaVersion: state?.schemaVersion ?? null,
    routesMeasured: perRoute.length,
    render: {
      coldMedianMs: round(median(routeTimes)),
      coldP95Ms: round(routeTimes.slice().sort((a, b) => a - b)[Math.floor(routeTimes.length * 0.95)] || 0),
      coldMaxMs: round(Math.max(...routeTimes)),
      coldTotalMs: round(routeTimes.reduce((a, b) => a + b, 0)),
      slowRoutes: perRoute.filter((r) => r.coldMs > 250).sort((a, b) => b.coldMs - a.coldMs).slice(0, 15),
    },
    emptyScreens: perRoute.filter((r) => r.textLength < 40 || !r.heading).map((r) => ({ route: r.route, textLength: r.textLength, heading: r.heading })),
    failingRoutes: perRoute.filter((r) => r.errors.length).map((r) => ({ route: r.route, errors: r.errors })),
    write: {
      commitMedianMs: round(median(writeSamples.map((w) => w.ms))),
      commitMaxMs: round(Math.max(...writeSamples.map((w) => w.ms))),
      allCommitted: writeSamples.every((w) => w.ok),
      navAfterWriteMedianMs: round(median(navAfterWrite)),
    },
    efficiency: {
      perfSamples: perfRead().length,
      perf: perfSummary(),
      repeatedRoutes: perRoute.filter((r) => r.warmMs > r.coldMs * 1.2 && r.coldMs > 30).length,
    },
    intelligence: {
      registeredDomains: registeredDomains(),
      registeredSources: registeredSources(),
      domainCount: registeredDomains().length,
      signalsSeen: hub.dedupedCount,
      convergingClusters: hub.convergingClusters,
      knowledgeDomainsAvailable: knowledge.available,
      knowledgeDomainsWired: knowledge.wired,
      knowledgeDomainsMissing: knowledge.missing,
      familiesFused: Object.keys(hub.byDomain || {}).length,
    },
    automation: await automationWiring(),
    perRoute,
  };

  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  const jsonPath = OUT || path.join(ROOT, 'reports', 'eval-app.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    print(report);
    console.log(`\nFull machine report: ${path.relative(ROOT, jsonPath)}`);
  }

  if (BUDGET_MS > 0 && report.render.coldP95Ms > BUDGET_MS) {
    console.error(`\nFAIL budget: cold p95 ${report.render.coldP95Ms}ms > ${BUDGET_MS}ms`);
    process.exitCode = 1;
  }
  if (report.failingRoutes.length) process.exitCode = 1;
}

/** How many `*Signals` families the canonical tree exposes, and how many the
 *  fusion hub is actually registered to read. This separates "the product has
 *  the intelligence" from "the product uses it". */
async function knowledgeCoverage(state, now) {
  const dir = path.join(ROOT, 'app', 'core', 'domain');
  const available = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of source.matchAll(/export function (\w+Signals)\s*\(/g)) available.push(m[1]);
  }
  const { registeredDomains } = await import(path.join(ROOT, 'app/core/domain/intelligenceHub.js'));
  const wired = registeredDomains();
  return {
    available: Array.from(new Set(available)).length,
    wired: wired.length,
    missing: Array.from(new Set(available)).length - wired.length,
  };
}

/** Detect whether the orchestrator's live-write helpers are imported by any
 *  production module outside the helper itself. Dead helpers are reported as
 *  dead instead of being counted as automation. */
async function automationWiring() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'app'));
  const probes = ['eventKey', 'automationHealth', 'openReceipts', 'createKeyedMemo', 'estimateStateSize', 'quotaWarningFor'];
  const helpers = {};
  for (const name of probes) {
    const callers = files.filter((file) => {
      if (file.endsWith('automationOrchestrator.js') || file.endsWith('storeOptimizations.js')) return false;
      return fs.readFileSync(file, 'utf8').includes(name);
    }).map((f) => path.relative(ROOT, f));
    helpers[name] = { wired: callers.length > 0, callers };
  }
  const postCommit = path.join(ROOT, 'app', 'core', 'domain', 'postCommit.js');
  const spine = fs.readFileSync(postCommit, 'utf8');
  return {
    spineLines: spine.split('\n').length,
    helpers,
    deadHelpers: Object.entries(helpers).filter(([, v]) => !v.wired).map(([k]) => k),
  };
}

function print(report) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n=== LeadOS evaluation (real app, real demo workspace, jsdom) ===');
  console.log(`schema v${report.schemaVersion} · ${report.routesMeasured} routes measured`);
  console.log(`\nRender (cold route change): median ${report.render.coldMedianMs}ms · p95 ${report.render.coldP95Ms}ms · max ${report.render.coldMaxMs}ms · total ${report.render.coldTotalMs}ms`);
  if (report.render.slowRoutes.length) {
    console.log('\nSlowest routes:');
    for (const r of report.render.slowRoutes) console.log(`  ${pad(r.route, 26)} ${pad(r.coldMs + 'ms', 10)} warm ${pad(r.warmMs + 'ms', 10)} ${r.nodes} nodes`);
  }
  if (report.emptyScreens.length) {
    console.log(`\nEmpty / heading-less screens (${report.emptyScreens.length}): ${report.emptyScreens.map((e) => e.route).join(', ')}`);
  }
  if (report.failingRoutes.length) {
    console.log(`\nRoutes that threw (${report.failingRoutes.length}):`);
    for (const f of report.failingRoutes) console.log(`  ${f.route}: ${f.errors.join(' | ')}`);
  }
  console.log(`\nWrite path: median commit ${report.write.commitMedianMs}ms · nav after a write ${report.write.navAfterWriteMedianMs}ms · all committed ${report.write.allCommitted}`);
  console.log('\nEfficiency:');
  console.log(`  perf samples ${report.efficiency.perfSamples} · p95 ${report.efficiency.perf.p95Ms}ms · slow ${report.efficiency.perf.slowCount}`);
  console.log(`  routes where a repeat render costs more than the first: ${report.efficiency.repeatedRoutes}`);
  console.log('\nIntelligence:');
  console.log(`  signal families shipped: ${report.intelligence.knowledgeDomainsAvailable}`);
  console.log(`  fusion sources registered by the shell: ${report.intelligence.registeredSources.join(', ') || 'none'}`);
  console.log(`  signal families fused for the demo workspace: ${report.intelligence.familiesFused ?? 'n/a'}`);
  console.log(`  signals fused for the demo workspace: ${report.intelligence.signalsSeen} · converging clusters: ${report.intelligence.convergingClusters}`);
  console.log('\nAutomation:');
  console.log(`  post-commit spine: ${report.automation.spineLines} lines`);
  console.log(`  orchestrator helpers wired into the write path: ${Object.entries(report.automation.helpers).filter(([, v]) => v.wired).length}/${Object.keys(report.automation.helpers).length}`);
  if (report.automation.deadHelpers.length) console.log(`  dead helpers (exported, never called): ${report.automation.deadHelpers.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
