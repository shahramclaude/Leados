/**
 * tests/app/standalone.test.mjs — Session 42, single-file offline distribution.
 *
 * Proves that `LeadOS-standalone.html` is genuinely portable: every module and
 * stylesheet is inline, no network primitive is needed, it boots from a
 * file:// URL with an arbitrary filename, the standalone storage key is
 * distinct, the portability warning is visible, and the build can be
 * regenerated to any path without touching canonical index.html.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

import { STORAGE_KEY } from '../../app/core/store.js';

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const ROOT = path.resolve(import.meta.dirname, '../..');
const ARTIFACT = path.join(ROOT, 'LeadOS-standalone.html');
const BUILD_SCRIPT = path.join(ROOT, 'scripts/build-standalone.mjs');
const flush = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

function readArtifact() {
  return fs.readFileSync(ARTIFACT, 'utf8');
}

async function bootStandalone(html, url, { withAxe = false } = {}) {
  const errors = [];
  const networkAttempts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const message = String(e?.message || '');
    if (message.includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${message}`);
  });
  virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.join(' ')}`));
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.__LEADOS_NETWORK_ATTEMPTS__ = networkAttempts;
      window.fetch = () => {
        networkAttempts.push('fetch');
        throw new Error('A standalone build must never call fetch().');
      };
      window.WebSocket = function WebSocket() {
        networkAttempts.push('websocket');
        throw new Error('A standalone build must never open a WebSocket.');
      };
      window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      }));
      window.scrollTo = () => {};
    },
  });
  await flush(80);
  let axeViolations = [];
  if (withAxe) {
    dom.window.eval(AXE_SRC);
    const result = await dom.window.axe.run(dom.window.document.getElementById('view'), {
      rules: { 'color-contrast': { enabled: false } },
    });
    axeViolations = Array.from(result.violations).map((v) => v.id);
  }
  return { dom, errors, networkAttempts, axeViolations };
}

test('standalone artifact exists and is a single inline HTML document', () => {
  const html = readArtifact();
  const bytes = Buffer.byteLength(html, 'utf8');
  assert.ok(bytes > 1_000_000, `expected the full app to be inlined (${bytes} bytes)`);
  // Two guards, because they catch different accidents. The absolute ceiling is a
  // bloat tripwire, not a cap on features: it moves when real modules are added.
  // The density bound is the one that catches a *duplication* — a module inlined
  // twice, or a binary asset embedded — which is what this test exists to stop.
  // Raised in Schema v51: the Merit & Pay-Equity Terminal added four real modules
  // (comp.js, compSchema.js, compRules.js, views/merit.js ≈ 130 KB of source), so
  // the single-file build grew by about 117 KB. Raised again in Schema v52: the
  // Workforce Transition Terminal added four modules of comparable size
  // (transition.js, transitionSchema.js, transitionRules.js, views/transition.js)
  // and the build grew by about 143 KB to 3.74 MB. Raised again in Schema v54: the
  // Information Value Terminal added valueOfInformation.js, valueOfInformationSchema.js,
  // valueOfInformationRules.js, views/valueOfInformation.js and ui/voi-modals.js, and the
  // build grew by about 120 KB to 3.95 MB. Raised again in Schema v57: the Attention
  // Market added attentionMarket.js, attentionMarketSchema.js, attentionMarketRules.js,
  // views/attentionMarket.js and ui/attention-modals.js, and the build grew by about
  // 190 KB to 4.15 MB. The density bound below is what still catches an actual
  // duplication; the absolute ceiling only catches a whole app being inlined twice.
  // Raised in Schema v62: the file grew past the old 4.4 MB ceiling when the
  // Signal Path, War Games, Coupled Load and Performance Recovery modules were
  // inlined; raised in Schema v65 for Survival, Cost of Waiting and Leadership
  // Parity & Standard Consistency; raised in Schema v66 for the Evidence
  // Terminal (evidence.js, evidenceSchema.js, evidenceRules.js,
  // views/evidence.js, ui/evidence-modals.js); raised in Session 95 for the
  // transport read model (landmark profile + classTransport in survival.js,
  // RULE-SURV-08, axis-aware wait-cost/consequence consumption and the
  // transport card — ~17 KB over the Session 94 artifact, density unchanged);
  // raised in Session 97 for the Deferral Option Terminal (deferralOption.js,
  // deferralOptionSchema.js, deferralOptionRules.js, views/deferralOption.js,
  // ui/deferral-modals.js), the first surface to price the option to wait;
  // raised in Session 98 for the Deferral Portfolio (deferralPortfolio.js,
  // deferralPortfolioSchema.js, deferralPortfolioRules.js,
  // views/deferralPortfolioPanel.js, ui/deferral-portfolio-modals.js), the
  // book-level read: declared correlation, correlated Monte Carlo, exact tail
  // contributions — ~48 KB over the Session 97 artifact, density unchanged;
  // raised in Session 99 for the Signal Integrity Board (integrityRegistry.js,
  // integrity.js, integritySchema.js, integrityRules.js, views/integrity.js,
  // ui/integrity-modals.js) — ~150 KB over the Session 98 artifact at 20,325
  // bytes per module, inside the unchanged density bound. The density bound
  // below (bytes per module) is what catches duplication; the absolute ceiling
  // only catches a runaway.
  // Raised in Session 102 (Schema v72): the Confidence Transport Terminal added
  // confidence.js, confidenceRegistry.js, confidenceSchema.js, confidenceRules.js,
  // views/confidence.js and ui/confidence-modals.js — ~90 KB over the Session 101
  // artifact, at 20,186 bytes per module against an unchanged 24,000 density
  // bound. Raised in Session 107 (Schema v75): the Outcome Attribution & Loop
  // Settlement Terminal added settlementRegistry.js, settlementSchema.js,
  // settlement.js, settlementRules.js, ui/settlement-modals.js and
  // views/settlement.js — ~98 KB minified over Session 106, at 19,515 bytes per
  // module against an unchanged 24,000 density bound.
  // Raised in Session 108 (Schema v77): the Measurement Reliability Terminal
  // added reliabilityRegistry.js, reliabilitySchema.js, reliability.js,
  // reliabilityRules.js and views/reliability.js (~93 KB minified over Session
  // 107), landing at 19,507 bytes per module against an unchanged 24,000
  // density bound.
  // Raised in Session 109 (Schema v78): the Coupling Ledger added
  // couplingLedger.js, couplingLedgerSchema.js, couplingLedgerRules.js,
  // views/couplingPanel.js, a chart in ui/charts.js and the two new
  // relations — ~66 KB minified over Session 108, at 19,490 bytes per module
  // against an unchanged 24,000 density bound. The ceiling moves only because
  // the module count moved; the density bound is what still catches a
  // duplication.
  // Raised in Schema v82: the Command Chain added six real modules (chainRegistry,
  // chainSchema, chainRules, chain.js, views/chain.js, ui/chain-modals.js) and the
  // single-file build grew by ~100 KB.
  // Raised in Schema v83: the Succession Terminal added six real modules
  // (successionRegistry, successionSchema, successionRules, succession.js,
  // views/succession.js, and its panel wiring). The density bound below is what
  // still catches a duplication; this ceiling only tracks the module count.
  // Retention and Mission Control add four more source modules; density is checked below.
  // Raised in Schema v93: the Operating Model (ADR-0087) contributes six modules on top of
  // Catchball (ADR-0084), the Board Room (ADR-0085) and the Disclosure Compiler (ADR-0086).
  // The single-file build is 7,238,250 bytes across 401 source modules — 18,050 bytes per
  // module, still under the 24,000 density bound. The ceiling moves only because the module
  // count moved; density is what catches a module inlined twice.
  // Raised in Session 131: the artifact already exceeded BOTH ceilings on main
  // (7,824,494 bytes / 451 modules at commit 9a050af), so `verify:standalone`
  // was failing before this session touched anything. One ceiling now, sized
  // from the measured build (7,830,962 bytes / 451 modules — 17,363 bytes per
  // module against the unchanged 24,000 density bound, which is what still
  // catches a module inlined twice).
  // Raised in Session 132 (Schema v96): the Differencing Defender added seven real
  // modules (differencingRegistry.js, differencingDeterminacy.js,
  // differencingSchema.js, differencing.js, differencingRules.js,
  // differencingActions.js, views/differencing.js) and the build measured
  // 7,912,690 bytes / 458 modules — 17,276 bytes per module, DOWN from the
  // Session 131 density, which is the point: the density bound (24,000) is what
  // catches a module inlined twice; this absolute ceiling only catches a runaway.
  // Raised in Session 134 (Schema v97, ADR-0094): the Prospective Intervention
  // Contract added six real modules (prospectiveRegistry, prospectiveSchema,
  // prospective, prospectiveRules, prospectiveActions, views/prospective) plus
  // the shell/CSV/graph/permission wiring. Measured build: 7,996,525 bytes /
  // 466 modules = 17,160 bytes per module, DOWN again from Session 132's
  // 17,276. The density bound (24,000) is unchanged and is still the guard that
  // catches a module inlined twice; this ceiling only tracks module count.
  // Raised in Session 135 (Schema v98, ADR-0095): the Robust Allocation Terminal
  // added six real modules (robustAllocationRegistry, robustAllocationSchema,
  // robustAllocation, robustAllocationRules, robustAllocationActions,
  // views/robustAllocation) plus the shell/CSV/graph/permission wiring and the
  // .grid-3/.grid-4 CSS. Measured build: 8,072,085 bytes / 472 modules = 17,102
  // bytes per module, DOWN again from Session 134's 17,160. The density bound
  // (24,000) is unchanged and still catches a module inlined twice; this ceiling
  // only tracks module count.
  // Session 142 (ADR-0102) added six modules (hindsightRegistry, hindsightSchema,
  // hindsight, hindsightRules, hindsightActions, views/hindsight) plus the
  // shell/CSV/graph/permission wiring. Measured build: 8,517,555 bytes / 504
  // modules = 16,900 bytes per module, DOWN again from Session 135's 17,102.
  // The ceiling only tracks module count; the density bound below is what
  // catches a module being inlined twice.
  // Session 144 (ADR-0104) added six modules (diligenceRegistry,
  // diligenceSchema, diligence, diligenceRules, diligenceActions,
  // views/diligence) plus the shell/schema/CSV/graph/permission/manifest
  // wiring. Measured build: 8,706,536 bytes / 516 modules = 16,873 bytes per
  // module, DOWN again from Session 142's 16,900. Session 152 (ADR-0112) added
  // one module (redrawRehearsal) plus shell/view wiring — measured build:
  // 9,022,803 bytes / 546 modules = 16,525 bytes per module, DOWN again.
  // The ceiling only tracks module count; the bytes-per-module bound below is
  // what catches a module being inlined twice.
  // Session 181 (ADR-0134) added one module (talkingPointPolicy) plus the
  // schema/actions/agenda wiring — measured build: 9,501,154 bytes / 584
  // modules = 16,269 bytes per module, DOWN again from 16,525. The ceiling
  // tracks module count only; the per-module bound below is what catches a
  // module inlined twice, so raising the ceiling by one session's growth does
  // not weaken the duplicate-inlining guard.
  // Session 183 (ADR-0136) added two modules (budgetExposure, budgetExposureActions)
  // plus the finance view/actions/gateway wiring — measured build: 9,545,055
  // bytes / 587 modules = 16,261 bytes per module, DOWN again from 16,269.
  // The per-module density bound below is still what catches a module inlined twice.
  // Session 203 (ADR-0147) added six modules (reviewStewardshipRegistry,
  // reviewStewardshipSchema, reviewStewardship, reviewStewardshipActions,
  // reviewStewardshipRules, views/reviewStewardshipPanel) plus the schema,
  // spine, CSV, gateway, seat-right and reviews/main wiring — measured build:
  // 9,939,891 bytes / 615 modules = 16,163 bytes per module, DOWN again from
  // 16,261. The artifact had already passed this absolute ceiling on main before
  // this session touched anything (9,882,413 bytes at the branch point), so the
  // ceiling is raised to the measured build plus headroom; the density bound
  // below is what still catches a module inlined twice.
  // Raised in Session 221 (Schema v130 unchanged, ADR-0160): the Matrix Line
  // Activity Reconciliation added three real modules (lineActivity.js,
  // lineActivityRegistry.js, views/matrixActivityPanel.js) plus shell/CSV/panel
  // wiring. Measured build: 10,497,412 bytes / 669 modules = 15,691 bytes per
  // module — DOWN from the previous density, against the unchanged 24,000 bound
  // that still catches a module or asset inlined twice. The ceiling moves only
  // because real capability was added; density is what guards duplication.
  // Session 227 adds four bundled 1:1 holder/read modules: 10,619,691 bytes
  // across 686 modules, or 15,481 bytes/module (down from 15,530 on main).
  // Session 229 (Schema v133, ADR-0166) adds three real bundled modules
  // (meritEvidence.js, meritEvidenceRegistry.js, meritEvidenceRules.js) and the
  // panel/rule wiring: 10,661,063 bytes / 690 modules = 15,451 bytes per module,
  // DOWN from 15,481. The 24,000-byte density guard is unchanged and is what
  // still catches a module inlined twice; this absolute ceiling only tracks the
  // real capability added.
  // Session 231 (Schema v135, ADR-0168) adds three real bundled modules
  // (benchEvidence.js, benchEvidenceRegistry.js, benchEvidenceRules.js) plus the
  // succession panel/rule/schema/CSV wiring: 10,708,780 bytes / 695 modules =
  // 15,408 bytes per module, DOWN from Session 229's 15,451. The 24,000-byte
  // density guard is unchanged and is what still catches a module inlined twice;
  // this absolute ceiling only tracks the real capability added.
  // The checked-in artifact is behind the current canonical source tree:
  // this rebuild brings in seven already-present source modules (709 vs 702)
  // as well as the current meeting-share parity edits. It weighs 10,898,676
  // bytes / 709 modules = 15,372 bytes per module. Keep the per-module density
  // guard unchanged (it catches duplicate inlining); this absolute ceiling
  // accommodates the actual source-to-artifact delta without masking duplication.
  assert.ok(bytes < 10_920_000, `standalone file is unexpectedly large (${bytes} bytes)`);
  const declaredModules = Number((html.match(/content="[^"]*?(\d+) source modules/) || [])[1]);
  assert.ok(declaredModules > 100, `expected the build to declare its module count (got ${declaredModules})`);
  const bytesPerModule = Math.round(bytes / declaredModules);
  assert.ok(
    bytesPerModule < 24_000,
    `standalone bytes per source module is ${bytesPerModule} (${bytes} bytes / ${declaredModules} modules); ` +
      'that usually means something is inlined twice',
  );
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en" data-leados-standalone="true">/);
  assert.match(html, /<meta name="leados-distribution" content="standalone-offline" \/>/);
  assert.match(html, /<meta name="leados-standalone-build" content="[^"]*[0-9]+ source modules/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<style id="leados-inline-styles">/);
  assert.match(html, /<script id="leados-standalone-bootstrap">/);
  assert.match(html, /<script id="leados-standalone-app">/);
  assert.match(html, /\.standalone-banner/);
  assert.match(html, /window\.__LEADOS_STANDALONE__ = true/);
  assert.match(html, /window\.__LEADOS_STORAGE_KEY__ = 'leados\.standalone\.v1'/);
  assert.match(html, /Standalone offline copy/);
  assert.match(html, /records are NOT embedded/);
});

test('standalone artifact has no external resources, module imports or runtime npm dependency', () => {
  const html = readArtifact();
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+type=["']module["']/i);
  assert.doesNotMatch(html, /\bimport\s*\(/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
  assert.doesNotMatch(html, /node_modules/);
  assert.doesNotMatch(html, /@import/);
  assert.doesNotMatch(html, /url\(\s*['"]?https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  // Canonical development entry remains untouched and server-based.
  const canonical = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(canonical, /<script type="module" src="\.\/app\/main\.js"><\/script>/);
  assert.match(canonical, /<link rel="stylesheet" href="\.\/app\/styles\.css" \/>/);
});

test('standalone storage key is distinct from the served workspace', () => {
  assert.equal(STORAGE_KEY, 'leados.lifecycle.v1');
  const html = readArtifact();
  assert.match(html, /leados\.standalone\.v1/);
  assert.doesNotMatch(html, /__LEADOS_STORAGE_KEY__ = 'leados\.lifecycle\.v1'/);
});

test('build script regenerates to an arbitrary filename and refuses to overwrite index.html', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leados-standalone-'));
  try {
    const out = path.join(tmp, 'LeadOS portable copy.html');
    const stdout = execFileSync(process.execPath, [BUILD_SCRIPT, '--out', out], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(stdout, /[0-9]+ source modules/);
    const rebuilt = fs.readFileSync(out, 'utf8');
    assert.match(rebuilt, /data-leados-standalone="true"/);
    assert.match(rebuilt, /<script id="leados-standalone-app">/);
    assert.doesNotMatch(rebuilt, /<script[^>]+src=/i);

    let refused = false;
    try {
      execFileSync(process.execPath, [BUILD_SCRIPT, '--out', 'index.html'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      refused = /Refusing to overwrite the canonical index\.html/.test(String(error.stderr || error.message));
    }
    assert.ok(refused, 'build script must protect canonical index.html');
    assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /<script type="module"/);
    fs.writeFileSync(path.join(tmp, 'boot.html'), rebuilt, 'utf8');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('standalone HTML boots from a file:// path, renders Today and makes no network call', async () => {
  const html = readArtifact();
  const { dom, errors, networkAttempts, axeViolations } = await bootStandalone(
    html,
    'file:///C:/Users/Test/Desktop/LeadOS-standalone.html',
    { withAxe: true },
  );
  try {
    const { window } = dom;
    assert.equal(window.__LEADOS_STANDALONE__, true);
    assert.equal(window.__LEADOS_STORAGE_KEY__, 'leados.standalone.v1');
    assert.ok(window.__LEADOS_BUILD_ID__);
    assert.equal(window.document.title, 'Today · LeadOS');
    const view = window.document.getElementById('view');
    assert.match(view.textContent, /Start with the people you lead/);
    assert.match(window.document.querySelector('[data-leados-standalone-banner]').textContent, /records are NOT embedded/);
    assert.deepEqual(networkAttempts, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(axeViolations, []);
  } finally {
    dom.window.close();
  }
});

test('standalone copy keeps hash routing and exposes the portability/data-export guidance in Settings', async () => {
  const html = readArtifact();
  const { dom, errors, networkAttempts } = await bootStandalone(
    html,
    'file:///home/someone/LeadOS%20portable%20copy.html',
  );
  try {
    const { window } = dom;
    window.location.hash = '#/settings';
    window.dispatchEvent(new window.Event('hashchange'));
    await flush();
    const text = window.document.getElementById('view').textContent;
    assert.match(text, /Settings & data/);
    assert.match(text, /You are running the portable copy/);
    assert.match(text, /Export JSON before moving PCs/);
    assert.match(text, /Some browsers block local storage for local files/);

    window.location.hash = '#/forecasts';
    window.dispatchEvent(new window.Event('hashchange'));
    await flush();
    assert.match(window.document.getElementById('view').textContent, /Forecast integrity/);
    assert.equal(window.document.title, 'Forecast integrity terminal · LeadOS');
    assert.deepEqual(networkAttempts, []);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test('static server exposes only the deliberate standalone artifact outside app/**', () => {
  const server = fs.readFileSync(path.join(ROOT, 'scripts/serve.mjs'), 'utf8');
  assert.match(server, /relPath === 'LeadOS-standalone\.html'/);
  assert.match(server, /relPath === 'index\.html'/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['build:standalone'], 'node scripts/build-standalone.mjs');
  assert.equal(pkg.scripts['verify:standalone'], 'npm run build:standalone && node --test tests/app/standalone.test.mjs');
  assert.ok(pkg.devDependencies.esbuild, 'esbuild is an explicit build-time-only dependency');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /Run LeadOS from one HTML file on any PC/);
  assert.match(readme, /LeadOS-standalone\.html/);
});
