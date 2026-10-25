#!/usr/bin/env node
/** Optional real-Chromium validation of check-in → manager-owned follow-up → real 1:1.
 * Start `npm run app` separately, then install the pinned tools in ignored scratch:
 * npm install --prefix tmp/browser --no-save --no-audit --no-fund playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
 * node scripts/app-manager-support-smoke.mjs
 * LEADOS_BROWSER_TOOLS and LEADOS_TEST_URL can override the defaults.
 * This checks browser/keyboard behavior and axe findings, not screen-reader support or usability.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStore } from '../app/core/store.js';
import { createApi } from '../app/actions.js';
import { addDays } from '../app/core/time.js';

const tools = path.resolve(process.env.LEADOS_BROWSER_TOOLS || 'tmp/browser/node_modules');
const output = path.resolve('tmp/manager-support-evidence');
await fs.mkdir(output, { recursive: true });
const { chromium: playwright } = await import(pathToFileURL(path.join(tools, 'playwright-core/index.mjs')));
const { default: chromium, inflate } = await import(pathToFileURL(path.join(tools, '@sparticuz/chromium/build/index.js')));
const libraries = await inflate(path.join(tools, '@sparticuz/chromium/bin/al2023.tar.br'));
const args = chromium.args.filter((arg) => !['--disable-web-security', '--allow-running-insecure-content', '--disable-site-isolation-trials'].includes(arg));
const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: `${path.join(libraries, 'lib')}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}` } });
const base = process.env.LEADOS_TEST_URL || 'http://127.0.0.1:5173';
const origin = new URL(base).origin;
const errors = [], externalRequests = [], accessibility = [], routes = [];
const now = new Date('2026-10-25T10:00:00.000Z');
const key = 'leados.lifecycle.v1';
const blocker = 'PRIVATE-BLOCKER-DO-NOT-COPY-2d91';
const commitmentText = 'I will arrange access and share the release checklist';
const dueDate = '2026-10-30';
const store = createStore({ now: () => now });
store.load();
const api = createApi(store, { now: () => now });
const person = api.addPerson({ name: 'Morgan Browser Test', role: 'Platform engineer', startDate: '2026-09-25' });
const plan = api.createOnboardingPlan({ personId: person.id, kind: 'new-hire', startDate: '2026-09-25' });
assert.equal(plan.ok, true);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ state, storageKey }) => {
    const OriginalDate = Date;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-25T10:00:00.000Z'])); }
      static now() { return new OriginalDate('2026-10-25T10:00:00.000Z').getTime(); }
    };
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(state));
  }, { state: store.state, storageKey: key });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
  const state = () => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
  const navigate = async (route) => {
    await page.goto(`${base}/#/${route}`);
    await page.locator('#view h1').waitFor();
    routes.push(route);
  };
  const axe = async (label) => {
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: path.join(tools, 'axe-core/axe.min.js') });
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    accessibility.push({ label, violations: result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target) })) });
  };
  const noOverflow = async (label) => {
    const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    assert.ok(size.content <= size.viewport + 1, `${label} horizontal overflow: ${JSON.stringify(size)}`);
  };
  const dialog = page.getByRole('dialog');
  const submit = () => dialog.locator('.modal-foot .btn-primary').click();
  const fill = (label, value) => dialog.getByLabel(label, { exact: false }).fill(value);

  await navigate(`onboarding?plan=${encodeURIComponent(plan.id)}`);
  await noOverflow('desktop plan');
  await axe('desktop onboarding plan before check-in');
  await page.getByRole('button', { name: /Log Day 30 check-in/ }).click();
  await fill('Conversation date', '2026-10-25');
  await fill('What is clear and working so far', 'We clarified role scope and agreed the first-month priorities.');
  await fill('Open questions, blockers or manager air-cover needed', blocker);
  await axe('desktop Day 30 check-in dialog');
  await submit();
  await dialog.waitFor({ state: 'detached' });
  let saved = await state();
  const checkin = saved.onboarding.find((record) => record.id === plan.id).reviews[30];
  assert.equal(checkin.heldOn, '2026-10-25');
  assert.equal(checkin.blockers, blocker);
  assert.equal(saved.managerSupport.length, 0, 'recording a check-in must not invent a manager commitment');

  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow('mobile plan with recorded check-in');
  await axe('mobile onboarding plan with recorded check-in');
  const trigger = page.getByRole('button', { name: '+ Manager follow-up', exact: true });
  await trigger.focus();
  await trigger.click();
  assert.ok(await dialog.isVisible());
  await noOverflow('mobile manager follow-up dialog');
  await axe('mobile manager follow-up dialog');
  assert.ok(await dialog.getByText(/Day 30.*held/i).count(), 'dialog must name the exact source phase and date');
  assert.ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), 'opening the modal must move focus inside it');
  await dialog.locator('.modal-foot .btn-primary').focus();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), 'Tab from the last control must stay inside the modal');
  await dialog.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])').first().focus();
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), 'Shift+Tab from the first control must stay inside the modal');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '+ Manager follow-up', 'Escape must return focus to the opener');
  assert.equal((await state()).managerSupport.length, 0, 'cancelling must not write a commitment');

  await trigger.click();
  await fill('What will you do?', commitmentText);
  await axe('mobile manager follow-up form with validation pending');
  await submit();
  assert.ok(await dialog.isVisible(), 'missing due date must be refused');
  assert.ok((await dialog.innerText()).includes('Choose a valid due date'), 'missing date must have an actionable error');
  const dueField = dialog.getByLabel('Due date', { exact: false });
  assert.equal(await dueField.getAttribute('aria-invalid'), 'true');
  const describedBy = (await dueField.getAttribute('aria-describedby')).split(/\s+/);
  assert.ok(describedBy.includes(`${await dueField.getAttribute('id')}-help`), 'field instructions must remain associated');
  const errorId = describedBy.find((id) => id.endsWith('-error'));
  assert.ok(errorId, 'assistive technology needs a programmatic link to the inline error');
  assert.match(await dialog.locator(`#${errorId}`).innerText(), /Choose a valid due date/);
  await fill('Due date', dueDate);
  await submit();
  await dialog.waitFor({ state: 'detached' });
  saved = await state();
  assert.equal(saved.managerSupport.length, 1);
  const followup = saved.managerSupport[0];
  assert.equal(followup.text, commitmentText);
  assert.equal(followup.due, dueDate);
  assert.equal(followup.sourcePlanId, plan.id);
  assert.equal(followup.sourceCheckinId, checkin.id);
  assert.equal(followup.sourceHorizon, 30);
  assert.equal(followup.sourceHeldOn, '2026-10-25');
  assert.ok(!followup.text.includes(blocker), 'candid blocker must not be copied into manager-owned work');
  await page.screenshot({ path: path.join(output, 'mobile-onboarding-source.png'), fullPage: true });

  await navigate('oneonones');
  await noOverflow('mobile 1:1 commitment board');
  await axe('mobile 1:1 commitment board');
  const boardText = await page.locator('#view').innerText();
  assert.ok(boardText.includes(commitmentText));
  assert.ok(boardText.includes('You own it'));
  assert.ok(boardText.includes('Day 30 check-in'));
  assert.ok(!boardText.includes(blocker), 'the candid check-in blocker must not leak into the commitment board');
  const sourceLink = page.getByRole('link', { name: /Day 30 check-in/ });
  assert.equal(await sourceLink.count(), 1, 'board must expose the source check-in link');
  await sourceLink.click();
  await page.waitForURL(`**/#/onboarding?plan=${plan.id}`);
  assert.equal((await state()).onboarding.find((record) => record.id === plan.id).reviews[30].heldOn, '2026-10-25');
  await navigate('oneonones');

  await page.getByRole('button', { name: 'Log 1:1', exact: true }).first().click();
  assert.ok((await dialog.innerText()).includes('manager follow-up from Day 30 check-in'));
  assert.equal((await state()).oneOnOnes.length, 0, 'opening a 1:1 dialog must not synthesize a meeting');
  await noOverflow('mobile 1:1 reconciliation dialog');
  await axe('mobile 1:1 reconciliation dialog');
  await dialog.getByRole('radio', { name: 'Done', exact: true }).check();
  await dialog.getByRole('button', { name: 'Log it', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  saved = await state();
  assert.equal(saved.oneOnOnes.length, 1);
  assert.equal(saved.managerSupport[0].status, 'done');
  assert.equal(saved.managerSupport[0].completedInMeetingId, saved.oneOnOnes[0].id);
  assert.equal(saved.onboarding.find((record) => record.id === plan.id).reviews[30].heldOn, '2026-10-25');
  await navigate('today');
  await noOverflow('mobile Today after reconciliation');
  await axe('mobile Today after reconciliation');
  assert.ok(!(await page.locator('#view').innerText()).includes(commitmentText), 'completed follow-up must leave the open commitments queue');

  const report = {
    browser: browser.version(), viewport: ['1440×1000', '390×844'],
    lifecycle: 'record Day 30 check-in with candid blocker → explicit manager follow-up with manager-selected date → source-link validation → settle in real held 1:1',
    routes, errors, externalRequests, accessibility,
    limitations: ['headless Chromium only', 'axe automated scan is not screen-reader certification', 'no manager/employee comprehension study'],
  };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.ok(accessibility.every((scan) => scan.violations.length === 0), 'axe WCAG A/AA violations; see tmp/manager-support-evidence/report.json');
} finally {
  await browser.close();
}
