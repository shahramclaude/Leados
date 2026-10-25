#!/usr/bin/env node
/** Optional real-browser verification; no product/runtime dependency is added.
 * Start `npm run app` separately, then install the pinned tools in ignored scratch:
 * npm install --prefix tmp/browser --no-save --no-audit --no-fund playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
 * node scripts/app-browser-smoke.mjs
 * LEADOS_BROWSER_TOOLS and LEADOS_TEST_URL can override the defaults.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tools = path.resolve(process.env.LEADOS_BROWSER_TOOLS || 'tmp/browser/node_modules');
const output = path.resolve('tmp/browser-evidence');
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
const day = '2026-10-24';
const privateNote = 'PRIVATE-CASE-CONTENT-ONLY-9bf8';
const key = 'leados.lifecycle.v1';

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(() => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-24T10:00:00.000Z'])); }
      static now() { return new OriginalDate('2026-10-24T10:00:00.000Z').getTime(); }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
  const state = () => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
  const navigate = async (route) => { await page.goto(`${base}/#/${route}`); await page.locator('#view h1').waitFor(); };
  const click = async (label) => page.getByRole('button', { name: label, exact: true }).first().click();
  const save = () => page.locator('[role="dialog"] .modal-foot .btn-primary').click();
  const fill = (label, value) => page.getByRole('dialog').getByLabel(label, { exact: false }).fill(value);
  const axe = async (label) => {
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: path.join(tools, 'axe-core/axe.min.js') });
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    accessibility.push({ label, violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })) });
  };
  const noOverflow = async (label) => {
    const sizes = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    if (sizes.content > sizes.width + 1) {
      await page.screenshot({ path: path.join(output, 'overflow-debug.png'), fullPage: true });
      console.log(await page.evaluate(() => [...document.querySelectorAll('#view *')].map((el) => ({ tag: el.tagName, class: el.className, text: el.textContent.slice(0, 70), right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width })).filter((item) => item.right > innerWidth).slice(0, 25)));
    }
    assert.ok(sizes.content <= sizes.width + 1, `${label} horizontal overflow: ${JSON.stringify(sizes)}`);
  };

  await navigate('conflicts'); await axe('desktop empty conflict list');
  await click('Start a conflict record');
  assert.equal(await page.locator('form form').count(), 0);
  await fill('Neutral reference', 'Review handoff'); await fill('Who owns the next step?', 'Manager');
  await fill('Opening date', '2026-10-20'); await fill('Next follow-up', day);
  await page.getByRole('dialog').getByLabel('Which route is appropriate?', { exact: true }).selectOption('ordinary');
  await fill('Observable situation and impact', privateNote); await fill('Discussion process and ground rules', 'Listen separately, then meet voluntarily with equal airtime.');
  await fill('Agreed information-sharing limits', 'Keep perspectives private. Share only the agreed commitments.');
  for (let i = 0; i < 2; i += 1) {
    const party = page.getByRole('dialog').locator('fieldset').nth(i);
    await party.getByLabel('Name or agreed identifier', { exact: false }).fill(i ? 'Blair' : 'Avery');
    await party.getByLabel('Participation in informal discussion', { exact: true }).selectOption('willing');
    await party.getByLabel('Their perspective — what they said happened', { exact: true }).fill(i ? 'Requirements changed after customer calls.' : 'Late changes arrive after review.');
    await party.getByLabel('Their underlying interest — what matters to them', { exact: true }).fill(i ? 'Respond to the customer without surprises.' : 'Enough time for a reliable review.');
  }
  await axe('desktop conflict editor'); await save(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  const conflictId = (await state()).conflicts[0].id;
  await page.screenshot({ path: path.join(output, 'conflict-desktop.png'), fullPage: true });
  await noOverflow('desktop conflict detail'); await axe('desktop conflict detail');

  await click('Record agreement'); await fill('Agreement and what better will look like', 'Use a cutoff and an exception conversation before late handoffs.');
  await page.getByRole('dialog').getByLabel('Everyone explicitly confirmed this agreement and these commitments.', { exact: true }).check();
  const action = page.getByRole('dialog').locator('fieldset');
  await action.getByLabel('Accountable owner', { exact: false }).fill('Avery'); await action.getByLabel('Due date', { exact: true }).fill(day);
  await action.getByLabel('Observable commitment', { exact: false }).fill('Publish and test the cutoff and exception route.'); await save();
  assert.equal((await state()).conflicts[0].status, 'agreed');
  assert.equal(await page.getByRole('button', { name: 'Record resolution', exact: true }).isDisabled(), true);
  await click('Record commitment result'); await fill('What actually happened', 'Published the route and used it for a real handoff.'); await save();
  await click('Record follow-up'); await fill('What you checked and what changed', 'Checked with each colleague separately; both confirm the handoff works.');
  await page.getByRole('dialog').getByLabel('What did this establish?', { exact: true }).selectOption('holding');
  await save(); assert.equal(await page.getByRole('dialog').count(), 1, 'holding without confirmation must be refused');
  await page.getByRole('dialog').getByLabel('I checked with everyone, and they confirm the agreement is holding.', { exact: true }).check(); await save();
  await click('Record resolution'); await fill('Why the loop can be closed', 'Results are delivered and both colleagues confirm the working agreement holds.'); await save();
  assert.equal((await state()).conflicts[0].status, 'resolved');
  await page.reload(); await page.locator('#view h1').waitFor(); assert.equal((await state()).conflicts[0].status, 'resolved');
  await click('Reopen record'); await fill('What changed / why reopen?', 'A new exception needs a fresh check.'); await save();
  assert.equal(await page.getByRole('button', { name: 'Record resolution', exact: true }).isDisabled(), true, 'old verification cannot close a reopened case');

  await click('Edit context'); await page.getByRole('dialog').getByLabel('Which route is appropriate?', { exact: true }).selectOption('support'); await save();
  await click('Record support handoff'); await fill('Who will you contact?', 'Independent support contact');
  await fill('Next step and sharing boundaries', 'Contact them privately and establish safe information-sharing.'); await fill('Check the handoff was received on', day); await save();
  assert.equal((await state()).conflicts[0].status, 'escalated');
  for (const route of ['today', 'insights', 'settings']) {
    await navigate(route); assert.ok(!(await page.locator('#view').innerText()).includes(privateNote), `${route} leaked private notes`);
  }
  const downloadPromise = page.waitForEvent('download'); await click('Export JSON');
  const download = await downloadPromise; const exportFile = path.join(output, 'test-export.json'); await download.saveAs(exportFile);
  const exported = JSON.parse(await fs.readFile(exportFile, 'utf8')); assert.equal(exported.state.conflicts[0].summary, privateNote);
  await click('Import JSON'); await page.locator('#import-file').setInputFiles(exportFile); await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal((await state()).conflicts[0].status, 'escalated');
  await navigate('settings'); await click('Load demo data'); assert.ok(await page.getByRole('dialog').getByRole('heading', { name: 'Replace your records with demo data?' }).count());
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 }); await navigate(`conflicts/${conflictId}`);
  await noOverflow('mobile conflict detail'); await axe('mobile conflict detail');
  await page.screenshot({ path: path.join(output, 'conflict-mobile.png'), fullPage: true });
  await click('Reopen record'); await noOverflow('mobile conflict dialog'); await axe('mobile conflict dialog');
  const last = page.getByRole('dialog').locator('button').last(); await last.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close dialog');
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Show navigation', exact: true }).click();
  assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'), 'true'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'), 'false');

  // Use only an isolated headless browser profile, never the user's preview data.
  await page.evaluate(() => localStorage.clear()); await navigate('today');
  await click('Or explore with demo data');
  for (const route of ['today', 'insights', 'people', 'oneonones', 'feedback', 'reviews', 'recognition', 'goals', 'delegations', 'growth', 'readiness', 'health', 'decisions', 'conflicts', 'settings']) {
    await navigate(route); const content = await page.locator('#view').innerText();
    assert.ok(!content.includes('This screen failed to draw'), route); await noOverflow(`mobile ${route}`);
    routeChecks.push(route);
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await navigate('delegations');
  await page.getByRole('tab', { name: /^Completed/ }).click(); assert.ok(page.url().endsWith('filter=done'));
  await navigate('goals'); await page.getByRole('tab', { name: /^Team goals/ }).click(); assert.ok(page.url().endsWith('view=team'));
  await navigate('health'); await axe('desktop health');
  const report = { browser: browser.version(), lifecycle: 'create → agree → result → follow-up → resolve → reload → reopen → support handoff → export/import',
    mobileViewport: '390×844', routeChecks, errors, externalRequests, accessibility };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  assert.ok(accessibility.every((entry) => entry.violations.length === 0), 'WCAG A/AA violations; see tmp/browser-evidence/report.json');
} finally { await browser.close(); }
