#!/usr/bin/env node
/** Optional real-browser phase-queue verification; no product/runtime dependency is added.
 * Start `npm run app` separately, then install the pinned tools in ignored scratch:
 * npm install --prefix tmp/browser --no-save --no-audit --no-fund playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
 * node scripts/app-onboarding-smoke.mjs
 * LEADOS_BROWSER_TOOLS and LEADOS_TEST_URL can override the defaults.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tools = path.resolve(process.env.LEADOS_BROWSER_TOOLS || 'tmp/browser/node_modules');
const output = path.resolve('tmp/onboarding-evidence');
await fs.mkdir(output, { recursive: true });
const { chromium: playwright } = await import(pathToFileURL(path.join(tools, 'playwright-core/index.mjs')));
const { default: chromium, inflate } = await import(pathToFileURL(path.join(tools, '@sparticuz/chromium/build/index.js')));
const libraries = await inflate(path.join(tools, '@sparticuz/chromium/bin/al2023.tar.br'));
const args = chromium.args.filter((arg) => !['--disable-web-security', '--allow-running-insecure-content', '--disable-site-isolation-trials'].includes(arg));
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: `${path.join(libraries, 'lib')}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}` } });
const base = process.env.LEADOS_TEST_URL || 'http://127.0.0.1:5173';
const origin = new URL(base).origin;
const errors = [], externalRequests = [], accessibility = [], routeChecks = [];
const { createStore } = await import('../app/core/store.js');
const { createApi } = await import('../app/actions.js');
const { addDays } = await import('../app/core/time.js');
const now = new Date('2026-10-25T10:00:00Z');
const key = 'leados.lifecycle.v1';
const store = createStore({ now: () => now });
store.load();
const api = createApi(store, { now: () => now });
// Fictional records in an isolated browser profile, never the preview user's data.
const ids = [];
for (const [name, kind, days] of [['Alex Example', 'new-hire', 95], ['Blair Example', 'role-transition', 70], ['Casey Example', 'reboarding', 23]]) {
  const person = api.addPerson({ name, startDate: '2020-01-01' });
  const plan = api.createOnboardingPlan({ personId: person.id, kind, startDate: addDays(now, -days), label: kind === 'role-transition' ? 'Acting platform lead' : '' });
  assert.equal(plan.ok, true);
  ids.push(plan.id);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ state, key }) => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-25T10:00:00.000Z'])); }
      static now() { return new OriginalDate('2026-10-25T10:00:00.000Z').getTime(); }
    };
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  }, { state: store.state, key });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
  const navigate = async (route) => { await page.goto(`${base}/#/${route}`); await page.locator('#view h1').waitFor(); routeChecks.push(route); };
  const state = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  const axe = async (label) => {
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: path.join(tools, 'axe-core/axe.min.js') });
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    accessibility.push({ label, violations: result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })) });
  };
  const noOverflow = async (label) => {
    const sizes = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    if (sizes.content > sizes.width + 1) {
      await page.screenshot({ path: path.join(output, 'overflow-debug.png'), fullPage: true });
      console.log(await page.evaluate(() => [...document.querySelectorAll('#view *')].map((el) => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width })).filter((item) => item.right > innerWidth).slice(0, 35)));
    }
    assert.ok(sizes.content <= sizes.width + 1, `${label}: ${JSON.stringify(sizes)}`);
  };
  await navigate('today');
  const queue = page.locator('#onboarding-checkins');
  assert.equal(await queue.locator('li').count(), 4);
  assert.ok((await queue.innerText()).includes('Showing 4 of 6'));
  await axe('desktop Today phase queue'); await noOverflow('desktop Today');
  await queue.screenshot({ path: path.join(output, 'today-checkins-desktop.png') });

  await queue.getByRole('button', { name: 'Log Day 30 check-in for Alex Example (New joiner)', exact: true }).click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('Alex Example'));
  const snapshot = JSON.stringify(await state());
  const dialog = page.getByRole('dialog');
  const last = dialog.locator('button').last(); await last.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(JSON.stringify(await state()), snapshot, 'opening and cancelling must not write');

  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('mobile Today'); await axe('mobile Today phase queue');
  await queue.screenshot({ path: path.join(output, 'today-checkins-mobile.png') });
  await queue.getByRole('link', { name: 'All 6 check-ins', exact: true }).click();
  await page.waitForURL('**/#/onboarding?status=checkins');
  await page.waitForFunction(() => document.querySelectorAll('#onboarding-checkins li').length === 6);
  assert.equal(await queue.locator('li').count(), 6);
  await noOverflow('mobile all-due queue'); await axe('mobile all-due phase queue');
  const reboarding = queue.locator(`li[data-plan-id="${ids[2]}"]`);
  await reboarding.getByRole('button', { name: /Log Day 30 check-in/ }).click();
  assert.ok((await dialog.innerText()).includes('Keep medical and leave reasons out'));
  await dialog.locator('.modal-foot .btn-primary').click();
  assert.equal(await dialog.count(), 1, 'empty summary is refused');
  await dialog.getByLabel('Conversation date', { exact: false }).fill('2026-10-26');
  await dialog.getByLabel('What is clear and working so far', { exact: false }).fill('Agreed sustainable scope and reviewed context changes.');
  await dialog.locator('.modal-foot .btn-primary').click();
  assert.equal(await dialog.count(), 1, 'future conversation is refused');
  await dialog.getByLabel('Conversation date', { exact: false }).fill('2026-10-25');
  await noOverflow('mobile phase dialog'); await axe('mobile reboarding dialog with validation');
  await dialog.locator('.modal-foot .btn-primary').click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await queue.locator('li').count(), 5);
  const record = (await state()).onboarding.find((p) => p.id === ids[2]);
  assert.equal(record.reviews[30].heldOn, '2026-10-25');
  assert.equal(record.status, 'active');
  assert.ok(record.checkpoints.every((c) => !c.done));
  assert.ok((await state()).events.some((e) => e.type === 'onboarding.review.recorded' && e.entityId === ids[2]));
  await page.reload(); await page.locator('#view h1').waitFor();
  assert.equal(await queue.locator('li').count(), 5);
  assert.equal(await reboarding.count(), 0);

  await queue.locator('li').first().getByRole('link', { name: /^Open 30-60-90 plan/ }).click();
  await page.waitForURL('**/#/onboarding?plan=*');
  await page.waitForFunction(() => document.querySelectorAll('.onboarding-card').length === 1);
  assert.equal(await page.locator('.onboarding-card').count(), 1);
  await noOverflow('mobile focused plan'); await axe('mobile focused plan');
  await page.getByRole('tab', { name: /^Active/ }).click();
  assert.ok(page.url().includes('status=active&plan='));
  await navigate('onboarding?plan=missing-plan');
  assert.ok((await page.locator('#view').innerText()).includes('30-60-90 plan not found'));
  assert.equal(await page.locator('.onboarding-card').count(), 0);
  await page.getByRole('link', { name: 'Show all plans', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.onboarding-card').length === 3);
  assert.equal(await page.locator('.onboarding-card').count(), 3);
  const report = { browser: browser.version(), viewport: ['1440×1000', '390×844'], lifecycle: 'Today → overflow → all-due queue → validation → log reboarding conversation → persist/reload → exact plan → clear stale link', routeChecks, errors, externalRequests, accessibility };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  assert.ok(accessibility.every((entry) => entry.violations.length === 0), 'WCAG violations; see tmp/onboarding-evidence/report.json');
} finally { await browser.close(); }
