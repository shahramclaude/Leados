#!/usr/bin/env node
// Optional browser tooling lives in ignored tmp/browser; see app-browser-smoke.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createEmptyState } from '../app/core/schema.js';

const tools = path.resolve(process.env.LEADOS_BROWSER_TOOLS || 'tmp/browser/node_modules');
const { chromium: playwright } = await import(pathToFileURL(path.join(tools, 'playwright-core/index.mjs')));
const { default: chromium, inflate } = await import(pathToFileURL(path.join(tools, '@sparticuz/chromium/build/index.js')));
const libraries = await inflate(path.join(tools, '@sparticuz/chromium/bin/al2023.tar.br'));
const browser = await playwright.launch({ executablePath: await chromium.executablePath(),
  args: chromium.args.filter((arg) => !['--disable-web-security', '--allow-running-insecure-content', '--disable-site-isolation-trials'].includes(arg)), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: `${path.join(libraries, 'lib')}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}` },
});
const base = process.env.LEADOS_TEST_URL || 'http://127.0.0.1:5173';
const output = path.resolve('tmp/browser-evidence/robustness'); await fs.mkdir(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const state = createEmptyState('2026-11-05T12:00:00Z');
  Object.assign(state.settings, { activeSeatId: 'lead', chainLeaderAltitude: 'chief', seatAutoPropagate: true });
  state.people = [['vp', 'vp', null], ['director', 'director', 'vp'], ['manager', 'manager', 'director'], ['lead', 'lead', 'manager'], ['worker', 'ic', 'lead']]
    .map(([id, level, managerId]) => ({ id, name: id, level, managerId, status: 'active', createdAt: '2025-01-01T00:00:00Z' }));
  await context.addInitScript((seed) => { if (!localStorage.getItem('leados.lifecycle.v1')) localStorage.setItem('leados.lifecycle.v1', JSON.stringify(seed)); }, state);
  const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/#/decision-robustness`);
  await page.getByRole('heading', { name: 'Decision robustness lab', exact: true }).waitFor();
  for (const [key, value] of Object.entries({ mean: 2, coverage: 50, missingLow: 1, missingHigh: 5, target: 3, cost: 20, loss: 100, effectiveness: 50 })) {
    await page.locator(`[name="${key}"]`).fill(String(value));
  }
  await page.getByRole('button', { name: 'Analyze decision robustness', exact: true }).click();
  assert.match(await page.locator('[data-testid="robustness-results"]').innerText(), /1.50–3.50/);
  await page.addScriptTag({ path: path.join(tools, 'axe-core/axe.min.js') });
  const a11y = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })));
  assert.deepEqual(a11y, []);
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(width.content <= width.viewport + 1, `Mobile overflow: ${JSON.stringify(width)}`);
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await page.locator('[name="ownerId"]').selectOption('worker');
  await page.locator('[name="choice"]').selectOption('act');
  await page.locator('[name="plan"]').fill('Trial a shorter handover; review unresolved handovers after one week.');
  await page.locator('[name="rationale"]').fill('A reversible experiment is proportionate; the model is not survey evidence.');
  await page.getByRole('button', { name: 'Create reviewed case + decision + task', exact: true }).click();
  await page.waitForURL(/#\/case\//);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('leados.lifecycle.v1')));
  assert.equal(saved.cases.length, 1);
  const links = saved.links.filter((l) => l.sourceId === saved.cases[0].id);
  assert.ok(links.some((l) => l.relation === 'decides')); assert.ok(links.some((l) => l.relation === 'mitigates'));
  for (const id of ['lead', 'manager', 'director', 'vp']) assert.ok(links.some((l) => l.relation === 'rolls-up-to' && l.targetId === id), id);
  await page.reload(); assert.match(await page.locator('#view').innerText(), /Protect the next shift/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, a11yViolations: a11y.length, mobile: width, persistedCases: saved.cases.length, crossModule: ['decision', 'delegation'], ancestors: ['frontline', 'manager', 'director', 'VP'], screenshots: output }, null, 2));
} finally { await browser.close(); }
