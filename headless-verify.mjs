/* LeadOS part-13 headless verification harness.
   Loads the six shipped modules in doctrinal order inside a jsdom window —
   the same order index.html declares — then executes the REAL health battery
   (T-suite, live G-suite, goldens, claims) plus a UI boot smoke test.
   Usage: node scripts/headless-verify.mjs [baseDir=.]
   Exit code 0 iff every check passes; JSON-ish report on stdout. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || '.';
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const cssRefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);

const report = { base: path.resolve(base), srcs, cssRefs, problems: [], counts: {}, suites: {}, ui: {} };
const fail = (where, msg) => report.problems.push(where + ': ' + msg);

if (srcs.length !== 6) fail('index.html', 'expected exactly 6 classic scripts, found ' + srcs.length);
for (const r of cssRefs.concat(srcs)) {
  if (/^https?:|^\/\//.test(r)) fail('index.html', 'non-local asset reference ' + r);
  if (!fs.existsSync(path.join(base, r))) fail('index.html', 'referenced asset missing on disk: ' + r);
}

const dom = new JSDOM(html, {
  url: 'https://leados.local/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:stub';
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};

// ---- load modules in declared order ----
const loadErrors = [];
for (const s of srcs) {
  const code = fs.readFileSync(path.join(base, s), 'utf8');
  try { window.eval(code); } catch (e) { loadErrors.push(s + ' -> ' + (e && e.message)); }
}
const L = window.LeadOS || {};
report.counts.namespaces = ['events', 'store', 'engine', 'rules', 'playbooks', 'health', 'ui'].filter((k) => !!L[k]);
if (loadErrors.length) report.loadErrors = loadErrors;

if (L.events) report.counts.registryTypes = Object.keys(L.events.REGISTRY).length;
if (L.rules) report.counts.rules = L.rules.RULES.map((r) => r.id).join(',');
if (L.engine) report.counts.namedProjections = L.engine.NAMED_PROJECTIONS.length;
if (L.playbooks) {
  report.counts.interactivePlaybooks = L.playbooks.INTERACTIVE.map((p) => p.id);
  report.counts.playbookNamespaces = Object.keys(L.playbooks);
}
if (L.ui) report.counts.routes = L.ui.ROUTE_IDS;
if (L.health) {
  report.counts.T = L.health.T.length; report.counts.G = L.health.G.length;
  report.counts.liveG = L.health.LIVE_G.length; report.counts.goldens = L.health.GOLDENS.length;
  report.counts.claims = L.health.CLAIMS.length; report.counts.manifest = L.health.MANIFEST.length;
}

// ---- direct rule battery (pre-fix this throws through fin(); record honestly) ----
try {
  const seed = L.health.buildSeed();
  const findings = L.rules.run(L.engine.project(seed.events), seed.today);
  report.ruleBattery = { ok: true, findings: findings.length, rulesFired: [...new Set(findings.map((f) => f.rule))].length };
} catch (e) {
  report.ruleBattery = { ok: false, error: String((e && e.message) || e) };
}

// ---- suites ----
const summarize = (arr) => ({ total: arr.length, passed: arr.filter((r) => r.pass).length,
  failed: arr.filter((r) => !r.pass).map((r) => r.id + ' — ' + (r.detail || '').slice(0, 160)) });
try {
  const all = L.health.runAll();
  report.suites.T = summarize(all.t);
  report.suites.GplusGoldens = summarize(all.g);
  report.suites.claimsUnproven = all.claims.filter((c) => !(c.pass ?? c.proven)).map((c) => c.id + ': ' + c.text.slice(0, 90));
} catch (e) {
  report.suites.runAllError = String((e && e.stack) || e).slice(0, 600);
}
try {
  const boot = L.health.boot();
  report.suites.bootGate = { ok: boot.ok, failed: boot.g.filter((r) => !r.pass).map((r) => r.id + ' — ' + (r.detail || '').slice(0, 160)) };
} catch (e) {
  report.suites.bootError = String((e && e.message) || e);
}

// ---- UI boot smoke: real DOMContentLoaded, default route, then #/health ----
try {
  document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  report.ui.hashAfterBoot = window.location.hash;
  report.ui.viewBytesAtToday = (document.getElementById('view') || {}).innerHTML?.length || 0;
  report.ui.wallShown = !document.getElementById('wall').hidden && document.getElementById('wall').innerHTML.length > 0;
  window.location.hash = '#/health';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  const vh = document.getElementById('view').innerHTML;
  report.ui.healthViewBytes = vh.length;
  report.ui.healthViewShowsFail = /\bFAIL\b/.test(vh);
  window.location.hash = '#/signals';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  report.ui.signalsViewBytes = document.getElementById('view').innerHTML.length;
} catch (e) {
  report.ui.error = String((e && e.message) || e).slice(0, 300);
}

console.log(JSON.stringify(report, null, 2));
const suitesRed = (report.suites.T && report.suites.T.failed.length) ||
  (report.suites.GplusGoldens && report.suites.GplusGoldens.failed.length) ||
  (report.suites.bootGate && !report.suites.bootGate.ok) || report.suites.runAllError || report.suites.bootError;
process.exit(report.problems.length || loadErrors.length || suitesRed || !report.ruleBattery.ok ? 1 : 0);
