#!/usr/bin/env node
/**
 * scripts/check-headings.mjs — heading-order sweep across every declared route.
 *
 * Only three routes in this repository were ever run through axe, each in its
 * own test. A heading outline is a whole-document property, so a screen that is
 * never swept is a screen nobody has checked: `#/coupling` shipped an h1 → h3
 * skip that no test looked for, and it surfaced only when a render race that
 * had been hiding it was removed (ADR-0198).
 *
 * This script boots the real app against the demo workspace, walks every route
 * declared in `app/main.js` NAV, and runs axe-core's `heading-order` rule on
 * `#view`. It is deliberately narrow: one rule, one claim, fast enough to run
 * on every change.
 *
 * Usage: node scripts/check-headings.mjs [--verbose]
 * Exit:  0 clean, 1 at least one route breaks the outline, 2 axe unavailable.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const NOW = new Date('2026-10-25T10:00:00.000Z');

const axePath = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!fs.existsSync(axePath)) {
  console.error('axe-core is not installed. Run `npm install` (it arrives with the test toolchain).');
  process.exit(2);
}

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app', 'styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(axePath, 'utf8');

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

const dom = new JSDOM(HTML, {
  url: 'https://leados.test/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: new VirtualConsole(),
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

const { createApp } = await import(path.join(ROOT, 'app', 'main.js'));
const app = createApp({ storage: window.localStorage, now: () => NOW });
app.ctx.loadDemo();
window.eval(AXE_SRC);

const routes = declaredRoutes();
const failures = [];
for (const route of routes) {
  app.ctx.navigate(`#/${route}`);
  const result = await window.axe.run(window.document.querySelector('#view'), {
    runOnly: { type: 'rule', values: ['heading-order'] },
  });
  if (result.violations.length) {
    failures.push({
      route,
      nodes: result.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} — ${(n.html || '').slice(0, 90)}`)),
    });
  } else if (VERBOSE) {
    console.log(`ok   #/${route}`);
  }
}

if (failures.length) {
  console.error(`\nheading-order: ${failures.length} of ${routes.length} routes break the document outline\n`);
  for (const failure of failures) {
    console.error(`  #/${failure.route}`);
    for (const node of failure.nodes.slice(0, 3)) console.error(`    ${node}`);
  }
  console.error('\nFix the outline (add the missing h2), never the rule: a heading that skips a level is announced as a gap by a screen reader.');
  process.exit(1);
}

console.log(`heading-order: all ${routes.length} declared routes keep a clean outline.`);
