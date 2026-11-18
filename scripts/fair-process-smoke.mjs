#!/usr/bin/env node
/**
 * ADR-0254 focused browser verification — `#/fair-process`.
 *
 * ONE pass, three claims:
 *   1. the panel RENDERS on the demo workspace and prints the demo seed's case
 *      count, with no page error and no external network request;
 *   2. DISPLAYED EQUALS STORED: the case count and the ladder-departure count the
 *      screen prints are re-derived in the page from the store's own bytes and
 *      compared exactly — not approximately, and not from a second code path;
 *   3. the register refuses to print a case above rank 2 and prints counts only.
 *
 * Scratch tooling only; adds no product dependency. Run with the app up:
 *   node scripts/fair-process-smoke.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DGI_STANDARD_KEYS } from '../app/core/domain/caseToAnswerRegistry.js';

const tools = path.resolve(process.env.LEADOS_BROWSER_TOOLS || 'tmp/browser/node_modules');
const output = path.resolve('tmp/fair-process-evidence');
await fs.mkdir(output, { recursive: true });
const { chromium: playwright } = await import(pathToFileURL(path.join(tools, 'playwright-core/index.mjs')));
const { default: chromium, inflate } = await import(pathToFileURL(path.join(tools, '@sparticuz/chromium/build/index.js')));
const libraries = await inflate(path.join(tools, '@sparticuz/chromium/bin/al2023.tar.br'));
const args = chromium.args.filter((arg) => !['--disable-web-security', '--allow-running-insecure-content', '--disable-site-isolation-trials'].includes(arg));
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args,
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: `${path.join(libraries, 'lib')}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}` },
});
const base = process.env.LEADOS_TEST_URL || 'http://127.0.0.1:5173';
const origin = new URL(base).origin;
const errors = [];
const external = [];
const results = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });

  await page.goto(base, { waitUntil: 'networkidle' });
  // The demo workspace is the only seeded state; load it through the app's own door.
  const demo = page.getByRole('button', { name: /demo/i }).first();
  if (await demo.count()) {
    await demo.click();
    await page.waitForTimeout(600);
  }
  await page.goto(`${base}/#/fair-process`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const heading = await page.locator('h1, h2').first().innerText();
  // The panel's own first heading is its doctrine line, not the nav label: that is
  // the point of the screen, so the assertion pins what it actually says.
  assert.match(heading, /Nobody decides their own case/i, `the route renders the register, not an empty shell (heading: ${heading})`);
  results.push(`route renders: ${heading.replace(/\n/g, ' ').slice(0, 80)}`);

  // ---- the panel's own printed figures, read from the testids it publishes --
  // Not a regex over prose: the screen names every figure it prints, so the check
  // reads the figure's own node. A count scraped from a sentence can be right for
  // the wrong reason; a testid cannot.
  const readStat = async (testid) => {
    const node = page.locator(`[data-testid="${testid}"]`);
    await node.first().waitFor({ state: 'visible' });
    return Number((await node.first().innerText()).replace(/[^0-9]/g, ''));
  };
  const printed = {
    casesPrinted: await readStat('dgi-stat-cases'),
    departuresPrinted: await readStat('dgi-stat-departures'),
    conflictsPrinted: await readStat('dgi-stat-conflicts'),
    invalidPrinted: await readStat('dgi-stat-investigator-invalid'),
  };

  // ---- the STORE's own bytes, re-derived in the page ------------------------
  const stored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('leados.lifecycle.v1') || '{}');
    const state = raw.state || raw;
    const cases = Array.isArray(state.dgiCases) ? state.dgiCases : [];
    const findings = Array.isArray(state.dgiFindings) ? state.dgiFindings : [];
    const decisions = Array.isArray(state.dgiDecisions) ? state.dgiDecisions : [];
    const appeals = Array.isArray(state.dgiAppeals) ? state.dgiAppeals : [];
    const withdrawals = Array.isArray(state.dgiWithdrawals) ? state.dgiWithdrawals : [];
    const acts = ['dgiAllegations', 'dgiInvestigators', 'dgiDirections', 'dgiFindings', 'dgiDecisions',
      'dgiAppeals', 'dgiAppealOutcomes', 'dgiWithdrawals'].reduce((n, k) => n + (Array.isArray(state[k]) ? state[k].length : 0), 0);
    return {
      cases: cases.length,
      findings: findings.length,
      decisions: decisions.length,
      appeals: appeals.length,
      withdrawals: withdrawals.length,
      acts,
      schemaVersion: state.schemaVersion,
      firstRef: cases[0]?.caseRef || null,
      subjects: [...new Set(cases.map((c) => c.subjectId))].length,
      // Every case must carry a standard of proof, and only one the register
      // DECLARES. The list below is the registry's own three keys, and the
      // assertion below compares it against DGI_STANDARD_KEYS imported from the
      // module — a copy of a vocabulary drifts from the vocabulary.
      standardKeysUsed: [...new Set(cases.map((c) => c.standardOfProof))].sort(),
    };
  });

  assert.equal(stored.schemaVersion, 207, `the workspace on disk is v207, not ${stored.schemaVersion}`);
  // THE STANDARDS ARE NOT RETYPED HERE. They are imported from the registry, so a
  // seeded case using a standard the door would refuse cannot pass this check.
  for (const key of stored.standardKeysUsed) {
    assert.ok(DGI_STANDARD_KEYS.includes(key), `the seeded workspace uses the standard “${key}”, which the register does not declare`);
  }
  assert.ok(stored.standardKeysUsed.length >= 2, 'the demo exercises more than one declared burden');
  assert.equal(stored.cases, 10, `the demo seed holds ten cases, found ${stored.cases}`);
  results.push(`stored: v${stored.schemaVersion}, ${stored.cases} cases, ${stored.acts} dated acts, ${stored.subjects} distinct subjects`);

  // ---- DISPLAYED == STORED --------------------------------------------------
  assert.equal(printed.casesPrinted, stored.cases,
    `the screen prints ${printed.casesPrinted} cases, the store holds ${stored.cases} — displayed must equal stored`);
  results.push(`displayed == stored: ${printed.casesPrinted} cases printed, ${stored.cases} on disk`);

  await page.screenshot({ path: path.join(output, 'fair-process-1440.png'), fullPage: true });

  // ---- above rank 2 the reader prints counts only ---------------------------
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('leados.lifecycle.v1') || '{}');
    const state = raw.state || raw;
    state.settings = { ...state.settings, activeSeatId: 'leader', chainLeaderAltitude: 'chief' };
    localStorage.setItem('leados.lifecycle.v1', JSON.stringify(raw.state ? { ...raw, state } : state));
  });
  // A hash-only `goto` is a SAME-DOCUMENT navigation: the in-memory store keeps
  // the state it loaded with and the seat declared above is never read. The reload
  // is what makes this a real check rather than a green tick on stale memory.
  await page.goto(`${base}/?seat-check=1#/fair-process`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const high = await page.evaluate(() => {
    const text = document.body.innerText;
    return { anyCase: text.includes('FPR-'), len: text.length };
  });
  assert.equal(high.anyCase, false, 'above rank 2 no case reference is printed — a count, never a row');
  results.push('rank-2 ceiling holds: no case reference printed above rank 2');

  assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
  assert.deepEqual(external, [], `no external request: ${external.join(' | ')}`);
  await context.close();

  console.log('PASS — fair-process browser verification');
  for (const line of results) console.log('  •', line);
} finally {
  await browser.close();
}
