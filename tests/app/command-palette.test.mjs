/**
 * Command palette: keyboard-first access with a real DOM and the real app.
 * The pure permission/ranking rules live in quick-search.test.mjs; this file
 * proves the surface is reachable, navigable and remembers recent choices.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { PALETTE_RECENT_KEY, readPaletteRecent, rememberPaletteRecent } from '../../app/ui/command-palette.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = new Date('2026-11-14T10:00:00.000Z');

function boot() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
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
  return { window, document: window.document, consoleErrors };
}

async function appIn(env) {
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ root: env.document.getElementById('view'), storage: env.window.localStorage, now: () => NOW });
  app.store.seedDemo();
  return app;
}

const openWith = (env, key, extra = {}) => env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
  key, bubbles: true, cancelable: true, ...extra,
}));

test('Ctrl-K opens a combobox, focuses the input and shows safe shortcuts', async () => {
  const env = boot();
  await appIn(env);
  openWith(env, 'k', { ctrlKey: true });
  const dialog = env.document.querySelector('.palette-modal');
  assert.ok(dialog, 'the palette is open');
  const input = env.document.querySelector('.palette-input');
  assert.equal(env.document.activeElement, input);
  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.ok(input.getAttribute('aria-controls'));
  const options = [...env.document.querySelectorAll('.palette-option')];
  assert.ok(options.length >= 4, 'quick actions are offered before typing');
  assert.ok(options.some((node) => node.textContent.includes('Describe a situation')));
  assert.ok(options.some((node) => node.textContent.includes('Run a workspace checkup')));
  assert.deepEqual(env.consoleErrors, []);
});

test('typing searches records, and Enter opens the active result', async () => {
  const env = boot();
  await appIn(env);
  openWith(env, 'k', { ctrlKey: true });
  const input = env.document.querySelector('.palette-input');
  input.value = 'priya';
  input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  const options = [...env.document.querySelectorAll('.palette-option')];
  assert.ok(options.length >= 1);
  assert.equal(options[0].querySelector('.palette-type').textContent, 'Person');
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
  input.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(env.document.querySelector('.palette-modal'), null, 'selecting closes the dialog');
  assert.match(env.window.location.hash, /^#\/people\//);
  assert.match(env.document.querySelector('#view h1').textContent, /Priya Natarajan/);
});

test('Arrow keys move the active option without leaving the input', async () => {
  const env = boot();
  await appIn(env);
  openWith(env, 'k', { ctrlKey: true });
  const input = env.document.querySelector('.palette-input');
  input.value = 'priya';
  input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(env.document.activeElement, input);
  const selected = [...env.document.querySelectorAll('.palette-option')].filter((node) => node.getAttribute('aria-selected') === 'true');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].dataset.index, '1');
  assert.equal(input.getAttribute('aria-activedescendant'), selected[0].id);
});

test('the toolbar trigger opens the same palette and Escape closes it', async () => {
  const env = boot();
  await appIn(env);
  const trigger = env.document.getElementById('palette-open');
  assert.ok(trigger, 'index.html exposes a pointer-accessible trigger');
  trigger.click();
  assert.ok(env.document.querySelector('.palette-modal'));
  env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(env.document.querySelector('.palette-modal'), null);
});

test('a recent choice is remembered locally and offered on the next open', async () => {
  const env = boot();
  await appIn(env);
  openWith(env, 'k', { ctrlKey: true });
  const input = env.document.querySelector('.palette-input');
  input.value = 'checkup';
  input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
  const option = [...env.document.querySelectorAll('.palette-option')].find((node) => node.textContent.includes('Workspace checkup'));
  assert.ok(option);
  option.click();
  const stored = JSON.parse(env.window.localStorage.getItem(PALETTE_RECENT_KEY));
  assert.equal(stored[0].route, '#/checkup');
  openWith(env, 'k', { ctrlKey: true });
  const labels = [...env.document.querySelectorAll('.palette-option')].map((node) => node.textContent);
  assert.ok(labels.some((label) => label.includes('Workspace checkup')), 'recent destination is offered again');
  const ids = [...env.document.querySelectorAll('.palette-option')].map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length, 'a recent row and its tool row must not share a DOM id');
});

test('recent storage refuses malformed rows instead of rendering them', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  values.set(PALETTE_RECENT_KEY, JSON.stringify([
    { label: 'Bad route', route: 'https://evil.example', kind: 'tool' },
    { label: 'Bad kind', route: '#/cases', kind: 'script' },
    { label: 'Cases', route: '#/cases', kind: 'tool' },
  ]));
  const rows = readPaletteRecent(storage);
  assert.deepEqual(rows.map((row) => row.label), ['Cases']);
  assert.equal(rememberPaletteRecent(storage, { label: 'Cases', route: '#/cases', kind: 'tool' }), true);
  assert.equal(JSON.parse(values.get(PALETTE_RECENT_KEY)).length, 1, 'the same route is not duplicated');
});

test('"/" is a shortcut only when the person is not already typing', async () => {
  const env = boot();
  await appIn(env);
  const input = env.document.createElement('input');
  env.document.body.appendChild(input);
  input.focus();
  input.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  assert.equal(env.document.querySelector('.palette-modal'), null, 'typing a slash into a field must not open search');
  input.blur();
  env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  assert.ok(env.document.querySelector('.palette-modal'), 'slash opens search outside an editable field');
});
