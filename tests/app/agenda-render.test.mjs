/**
 * tests/app/agenda-render.test.mjs — the `#/agenda-ledger` route end to end
 * (ADR-0113, Session 153).
 *
 * The engine suites prove the ledger's arithmetic; this suite proves the screen.
 * It boots the real app in jsdom, seeds a frontline waiting list that contains
 * one prompt of the person's own, one owed to them and one that belongs to the
 * leader's span, then walks all six panels, files a line by an actual click, and
 * runs axe over every panel. It exists because the route slug collided with an
 * existing `agenda → cadence` alias (silently rendering the wrong terminal) and
 * because an unnamed table header column failed axe — both real defects found
 * here and fixed in `app/main.js` and `app/views/agenda.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AXE = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-11-06T10:00:00.000Z');

function bootDom() {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
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
  return { dom, window, document: window.document, errors };
}

test('the agenda route renders, lists provenance, files a line, and is axe-clean', async () => {
  const env = bootDom();
  const { createApp } = await import(path.join(ROOT, 'app/main.js'));
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  const view = env.document.querySelector('#view');

  // Seed a person with a bucket of engine prompts and one of their own.
  const p = app.api.addPerson({ name: 'Jordan Alvarez', role: 'Product Manager', level: 'senior', team: 'Platform', startDate: '2025-09-01' });
  assert.ok(p.ok);
  app.api.updatePerson(p.id, { talkingPoints: [
    'Wants a decision on the activation definition',
    'Case support (Billing migration; ref case-1): review systemic barriers, capacity trade-offs & air-cover needed',
    'Classify “Activation rewrite”: is this Core, Adjacent or Exploratory? [RULE-ALLOC-04:pf-1]',
  ] });

  app.navigate('#/agenda-ledger');
  assert.ok(view.textContent.includes('Agenda provenance ledger'), 'header renders');
  assert.ok(view.textContent.includes('Waiting lists in your boundary'), 'queue panel renders');
  assert.ok(view.textContent.includes('Jordan Alvarez'), 'names the person at rank 1-2');

  app.navigate('#/agenda-ledger?panel=build&person=' + encodeURIComponent(p.id));
  assert.ok(view.textContent.includes('Next 1:1 with Jordan Alvarez'), 'build panel renders the plan');
  assert.ok(view.textContent.includes('They raised it'), 'their group is labelled');
  assert.ok(view.textContent.includes('Your own span duty'), 'the leader-owned group is labelled and separated');

  // File the line from the plan, then confirm the filed panel shows it.
  const fileBtn = [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === 'File to raise');
  assert.ok(fileBtn, 'a file button exists');
  fileBtn.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(app.store.state.agendaEntries.length, 1, 'exactly one line filed by a human click');
  app.navigate('#/agenda-ledger?panel=filed');
  assert.ok(view.textContent.includes('Prompts you committed to raise'));
  assert.ok(view.textContent.includes('Wants a decision on the activation definition'));

  // Receipts and roll-up must render their refusals honestly rather than a number.
  app.navigate('#/agenda-ledger?panel=receipt');
  assert.ok(view.textContent.includes('refused'), 'receipt rate refused below the floor');
  app.navigate('#/agenda-ledger?panel=rollup');
  assert.ok(view.textContent.includes('What your own leader receives'));
  app.navigate('#/agenda-ledger?panel=method');
  assert.ok(view.textContent.includes('Declared conventions'));

  // The prep sheet carries the provenance card the lead prints.
  app.navigate(`#/prep/${encodeURIComponent(p.id)}`);
  assert.ok(view.textContent.includes('Who owes each line'), 'prep sheet carries the provenance card');

  if (!env.window.axe) env.window.eval(AXE);
  for (const route of ['#/agenda-ledger', '#/agenda-ledger?panel=build&person=' + encodeURIComponent(p.id), '#/agenda-ledger?panel=filed', '#/agenda-ledger?panel=receipt', '#/agenda-ledger?panel=rollup', '#/agenda-ledger?panel=method']) {
    app.navigate(route);
    const res = await env.window.axe.run(env.document.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], `axe clean on ${route}`);
  }

  app.destroy?.();
  env.dom.window.close();
});
