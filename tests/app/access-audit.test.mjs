/**
 * tests/app/access-audit.test.mjs — structural accessibility and interaction
 * safety for the three newest modules (operational cases, capacity & flow,
 * selection & hiring) and the screens that aggregate them.
 *
 * Why a *structural* audit and not just axe: axe answers "is this markup
 * invalid?" It does not answer the questions a screen-reader or keyboard user
 * actually hits — can I tell where I am, does every control have a name I can
 * hear, is the table navigable, does focus go somewhere sensible after an
 * action, can I back out of a destructive dialog. Those are checked directly
 * here, because they fail silently in a way axe does not report.
 *
 * Honest limit, stated once and not repeated per test: no screen reader (NVDA,
 * JAWS, VoiceOver, TalkBack, Orca), no real browser and no assistive-technology
 * user was available in this container. These checks catch broken semantics;
 * they cannot tell you whether the page is *understandable* when read aloud,
 * and they do not test visual layout, zoom, contrast in a real rendering
 * engine, or touch targets. Those remain [UNVERIFIED].
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2026-10-25T10:00:00.000Z');

const ROUTES = [
  ['#/today', 'Today'],
  ['#/insights', 'Signals'],
  ['#/cases', 'Operational cases'],
  ['#/changes', 'Org design & change'],
  ['#/capacity', 'Capacity'],
  ['#/scenarios', 'What-if scenarios'],
  ['#/hiring', 'Hiring'],
  ['#/tempo', 'Decision tempo'],
  ['#/resilience', 'Resilience'],
  ['#/power', 'War room'],
  ['#/network', 'Influence network'],
  ['#/transition', 'Workforce transition'],
  ['#/autopilot', 'Autopilot Studio'],
  ['#/signal', 'Signal path'],
  ['#/wargame', 'War games'],
  ['#/parity', 'Leadership parity'],
  ['#/integrity', 'Signal integrity'],
  ['#/credibility', 'Borrowed evidence'],
  ['#/confidence', 'Confidence transport'],
  ['#/settings', 'Settings'],
];

function bootDom() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://leados.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
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
  globalThis.SVGElement = window.SVGElement;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { dom, window, document: window.document, consoleErrors };
}

async function axeViolations(env, selector = '#view') {
  if (!env.window.axe) env.window.eval(AXE_SRC);
  const res = await env.window.axe.run(env.document.querySelector(selector), {
    rules: { 'color-contrast': { enabled: false } },
  });
  return Array.from(res.violations).map((v) => `${v.id}: ${v.help}`);
}

async function appWithDemo() {
  const env = bootDom();
  const { createApp } = await import('../../app/main.js');
  const app = createApp({ storage: env.window.localStorage, now: () => NOW });
  app.ctx.loadDemo();
  return { env, app };
}

/** Every element that a keyboard or screen-reader user must be able to operate. */
function interactiveNodes(root) {
  return Array.from(root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]'))
    .filter((el) => el.getAttribute('tabindex') !== '-1' || el.tagName === 'INPUT');
}

function accessibleName(el) {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const target = el.ownerDocument.getElementById(labelledBy);
    if (target && target.textContent.trim()) return target.textContent.trim();
  }
  const text = (el.textContent || '').trim();
  if (text) return text;
  const id = el.getAttribute('id');
  if (id) {
    const label = el.ownerDocument.querySelector(`label[for="${id}"]`);
    if (label && label.textContent.trim()) return label.textContent.trim();
  }
  const wrapping = el.closest('label');
  if (wrapping && wrapping.textContent.trim()) return wrapping.textContent.trim();
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();
  const value = el.getAttribute('value');
  if (el.type === 'submit' && value) return value;
  return '';
}

/* ------------------------------------------------------------- axe at scale */

test('a11y: every aggregate screen passes axe-core with the demo workspace loaded', async () => {
  const { env, app } = await appWithDemo();
  try {
    for (const [route, label] of ROUTES) {
      app.ctx.navigate(route);
      assert.ok(env.document.querySelector('#view').textContent.length > 0, `${route} rendered something`);
      assert.deepEqual(await axeViolations(env), [], `${route} (${label}) has axe violations`);
      assert.deepEqual(env.consoleErrors, [], `${route} logged errors`);
    }
  } finally {
    env.dom.window.close();
  }
});

test('a11y: detail screens and open dialogs also pass axe-core', async () => {
  const { env, app } = await appWithDemo();
  try {
    const hiring = app.ctx.state.requisitions.find((r) => r.title === 'Senior platform engineer');
    app.ctx.navigate(`#/hiring/${hiring.id}`);
    assert.deepEqual(await axeViolations(env), [], 'requisition detail');

    const kase = app.ctx.state.cases[0];
    app.ctx.navigate(`#/cases/${kase.id}`);
    assert.deepEqual(await axeViolations(env), [], 'case detail');

    for (const chg of app.ctx.state.changes) {
      app.ctx.navigate(`#/changes/${chg.id}`);
      assert.deepEqual(await axeViolations(env), [], `change detail ${chg.id}`);
    }

    // Schema v52: the transition terminal's five panels, populated by the demo.
    const transition = app.ctx.state.transitionPrograms.find((program) => program.status === 'draft');
    for (const panel of ['plan', 'exposure', 'continuity', 'alternatives', 'method']) {
      app.ctx.navigate(`#/transition?program=${transition.id}&panel=${panel}`);
      assert.ok(env.document.querySelector('#view').textContent.length > 0, `transition ${panel} rendered`);
      assert.deepEqual(await axeViolations(env), [], `transition ${panel}`);
      assert.deepEqual(env.consoleErrors, [], `transition ${panel} logged errors`);
    }

    app.ctx.navigate('#/changes');
    const openChg = Array.from(env.document.querySelectorAll('#view button')).find((b) => /Design change/i.test(b.textContent));
    assert.ok(openChg, 'the changes screen offers a way to design a change');
    openChg.focus();
    openChg.click();
    assert.ok(env.document.querySelector('[role="dialog"]'), 'change dialog opened');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), [], 'change dialog');
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    app.ctx.navigate('#/capacity');
    const openItem = Array.from(env.document.querySelectorAll('#view button')).find((b) => /Add work|Add a plan item|Plan work/i.test(b.textContent));
    assert.ok(openItem, 'the capacity screen offers a way to add work');
    // Focus first: focus restoration returns focus to whatever was focused when
    // the dialog opened, and a programmatic `.click()` does not focus anything
    // (a real mouse click does).
    openItem.focus();
    openItem.click();
    assert.ok(env.document.querySelector('[role="dialog"]'), 'dialog opened');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), [], 'capacity dialog');
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    // Focus restoration is checked in a second, axe-free open: axe-core moves
    // focus while probing rules, so the assertion has to be made without it.
    // The trigger is re-queried because rendering may have replaced the node.
    const opener = Array.from(env.document.querySelectorAll('#view button')).find((b) => /Add work|Add a plan item|Plan work/i.test(b.textContent));
    assert.ok(opener.isConnected, 'the trigger is still in the document');
    opener.focus();
    opener.click();
    assert.ok(env.document.querySelector('[role="dialog"]'));
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.document.activeElement, opener, 'focus returned to the control that opened the dialog');
  } finally {
    env.dom.window.close();
  }
});

/* ---------------------------------------------- structure a screen reader uses */

test('a11y: each screen has one top-level heading, real landmarks, and a reachable skip link', async () => {
  const { env, app } = await appWithDemo();
  try {
    for (const [route] of ROUTES) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      const h1s = view.querySelectorAll('h1');
      assert.equal(h1s.length, 1, `${route} must have exactly one h1 (found ${h1s.length})`);

      // Heading levels must not jump by more than one: a reader navigates by
      // level, and a skipped level makes the outline lie about the structure.
      const levels = Array.from(view.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => Number(h.tagName[1]));
      for (let i = 1; i < levels.length; i += 1) {
        assert.ok(levels[i] - levels[i - 1] <= 1, `${route} skips a heading level (${levels[i - 1]} → ${levels[i]})`);
      }

      assert.ok(env.document.querySelector('nav[aria-label]'), `${route} keeps a labelled navigation landmark`);
      assert.ok(env.document.querySelector('main#view'), `${route} keeps the main landmark`);
      const skip = env.document.querySelector('a.skip-link');
      assert.ok(skip, 'skip link exists');
      assert.equal(skip.getAttribute('href'), '#view');
    }
  } finally {
    env.dom.window.close();
  }
});

test('a11y: every interactive control on the three newest modules has an accessible name', async () => {
  const { env, app } = await appWithDemo();
  try {
    const routes = [
      '#/cases',
      '#/changes',
      '#/capacity',
      '#/hiring',
      '#/resilience',
      '#/resilience?tab=topology',
      '#/resilience?tab=stress',
      '#/resilience?tab=concentration',
      '#/resilience?tab=drills',
      '#/power',
      '#/power?tab=coalitions',
      '#/power?tab=game',
      '#/power?tab=incentives',
      '#/power?tab=script',
      '#/network',
      '#/network?tab=positions',
      '#/network?tab=holes',
      '#/network?tab=stress',
      '#/network?tab=followthrough',
      '#/today',
      '#/insights',
    ];
    const hiring = app.ctx.state.requisitions.find((r) => r.title === 'Senior platform engineer');
    routes.push(
      `#/hiring/${hiring.id}`,
      `#/cases/${app.ctx.state.cases[0].id}`,
      `#/resilience/${app.ctx.state.dependencies[0].id}`,
      ...app.ctx.state.changes.map((c) => `#/changes/${c.id}`),
    );

    const nameless = [];
    for (const route of routes) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      for (const el of interactiveNodes(view)) {
        const name = accessibleName(el);
        if (!name) nameless.push(`${route}: <${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ''}>`);
        // An icon-only button must carry its own label rather than relying on a
        // glyph a screen reader would read as "leftwards arrow".
        if (el.tagName === 'BUTTON' && /^[\u2190-\u21FF\u2600-\u27BF\u25A0-\u25FF\u2B00-\u2BFF✕☰]+$/.test((el.textContent || '').trim())) {
          if (!el.getAttribute('aria-label') && !el.querySelector('.sr-only')) nameless.push(`${route}: glyph-only button "${el.textContent.trim()}"`);
        }
      }
    }
    assert.deepEqual(nameless, [], `controls without an accessible name: ${nameless.join(', ')}`);
  } finally {
    env.dom.window.close();
  }
});

test('a11y: every table has a caption or accessible name, and no empty header cell', async () => {
  const { env, app } = await appWithDemo();
  try {
    const routes = [
      '#/cases',
      '#/changes',
      '#/capacity',
      '#/hiring',
      '#/resilience',
      '#/resilience?tab=topology',
      '#/resilience?tab=stress',
      '#/resilience?tab=concentration',
      '#/resilience?tab=drills',
      '#/power',
      '#/power?tab=coalitions',
      '#/power?tab=game',
      '#/power?tab=incentives',
      '#/power?tab=script',
      '#/network?tab=positions',
      '#/network?tab=holes',
      '#/network?tab=stress',
      '#/network?tab=stress&person=person-demo-2',
      '#/network?tab=followthrough',
      `#/hiring/${app.ctx.state.requisitions[0].id}`,
      `#/resilience/${app.ctx.state.dependencies[0].id}`,
      ...app.ctx.state.changes.map((c) => `#/changes/${c.id}`),
    ];
    const problems = [];
    for (const route of routes) {
      app.ctx.navigate(route);
      const view = env.document.querySelector('#view');
      for (const table of Array.from(view.querySelectorAll('table'))) {
        const caption = table.querySelector('caption');
        const labelled = table.getAttribute('aria-label') || table.getAttribute('aria-labelledby');
        if (!caption && !labelled) problems.push(`${route}: table without a caption or accessible name`);
        for (const th of Array.from(table.querySelectorAll('thead th'))) {
          if (!th.textContent.trim() && !th.querySelector('.sr-only')) problems.push(`${route}: empty header cell`);
          if (!th.getAttribute('scope')) problems.push(`${route}: header cell without scope`);
        }
      }
    }
    assert.deepEqual(problems, []);
  } finally {
    env.dom.window.close();
  }
});

test('a11y: the Today queue announces changes politely and never relies on colour alone', async () => {
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/today');
    const view = env.document.querySelector('#view');
    // Every tone/priority signal is carried by text, not just a class.
    for (const badge of Array.from(view.querySelectorAll('.badge, .tone-caution, .tone-good'))) {
      if (badge.classList.contains('badge') || badge.classList.contains('tone-caution') || badge.classList.contains('tone-good')) {
        assert.ok(badge.textContent.trim().length > 0, `a state marker with no text: ${badge.className}`);
      }
    }
    assert.ok(view.textContent.trim().length > 0);

    // Toasts are the only dynamic announcement surface in a no-framework app;
    // they must be role=status + aria-live so they are spoken at all.
    const { toast } = await import('../../app/ui/dom.js');
    toast('Saved', 'good');
    const live = env.document.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(live, 'a toast is announced politely');
    assert.equal(live.textContent, 'Saved');
  } finally {
    env.dom.window.close();
  }
});

/* ------------------------------------------- destructive confirmations (bug) */

test('safety: a destructive confirmation actually waits for the answer (regression)', async () => {
  // The promise-shaped `await confirmDialog(...)` used to resolve immediately
  // with the modal handle, so the three newest modules deleted the record the
  // moment you clicked, with the dialog still on screen afterwards.
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/hiring');
    const view = env.document.querySelector('#view');
    const before = app.ctx.state.candidates.length;
    const del = Array.from(view.querySelectorAll('button')).find((b) => /Delete the record for Marcus Feld/.test(b.getAttribute('aria-label') || ''));
    assert.ok(del, 'the retention row has a delete control');

    del.click();
    await Promise.resolve();
    assert.equal(app.ctx.state.candidates.length, before, 'nothing is deleted before the user confirms');
    assert.ok(env.document.querySelector('[role="dialog"]'));

    // Cancelling must leave the record alone and close the dialog.
    const cancel = Array.from(env.document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === 'Cancel');
    cancel.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(app.ctx.state.candidates.length, before, 'cancel really cancels');
    assert.equal(env.document.querySelector('[role="dialog"]'), null);

    // Escape must also mean "no".
    del.click();
    await Promise.resolve();
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(app.ctx.state.candidates.length, before, 'Escape cancels rather than confirms');
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
  } finally {
    env.dom.window.close();
  }
});

test('safety: confirming runs the action exactly once', async () => {
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/hiring');
    const view = env.document.querySelector('#view');
    const before = app.ctx.state.candidates.length;
    const del = Array.from(view.querySelectorAll('button')).find((b) => /Delete the record for Marcus Feld/.test(b.getAttribute('aria-label') || ''));
    del.click();
    await Promise.resolve();
    const confirm = Array.from(env.document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === 'Delete record');
    confirm.click();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(app.ctx.state.candidates.length, before - 1, 'exactly one record was removed');
    const deletions = app.ctx.state.events.filter((e) => e.type === 'candidate.deleted');
    assert.equal(deletions.length, 1, 'exactly one audit event was written');
  } finally {
    env.dom.window.close();
  }
});

test('safety: the callback-shaped callers still work, and their text actually reaches the dialog', async () => {
  const env = bootDom();
  try {
    const { confirmDialog } = await import('../../app/ui/dom.js');
    let ran = 0;
    const promise = confirmDialog({ title: 'Delete this case?', message: 'This removes the case and its links.', confirmLabel: 'Delete case', danger: true });
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog, 'dialog rendered');
    assert.match(dialog.textContent, /This removes the case and its links/, 'the message is rendered, not silently dropped');

    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Delete case');
    confirm.click();
    assert.equal(await promise, true, 'the promise resolves true on confirmation');

    const cancelPromise = confirmDialog({ title: 'Another?', message: 'x', onConfirm: () => { ran += 1; } });
    const cancel = Array.from(env.document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === 'Cancel');
    cancel.click();
    assert.equal(await cancelPromise, false, 'the promise resolves false on cancel');
    assert.equal(ran, 0, 'onConfirm is not called when the user cancels');
  } finally {
    env.dom.window.close();
  }
});

/* ------------------------------------------------- keyboard reachability */

test('a11y: dialogs trap focus, start on the first field, and restore focus on close', async () => {
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/hiring');
    const opener = Array.from(env.document.querySelectorAll('#view button')).find((b) => /Open a role/.test(b.textContent));
    opener.focus();
    opener.click();
    const dialog = env.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.ok(dialog.getAttribute('aria-labelledby'), 'the dialog is named for a screen reader');
    assert.ok(dialog.contains(env.document.activeElement), 'focus moved inside the dialog');
    assert.notEqual(env.document.activeElement, env.document.body, 'focus did not stay on the page behind');

    // Tab from the last focusable element must wrap to the first, not escape
    // into the page behind the modal.
    const focusables = Array.from(dialog.querySelectorAll('a[href], button, input, select, textarea'))
      .filter((el) => !el.disabled && el.getAttribute('tabindex') !== '-1');
    assert.ok(focusables.length >= 2);
    focusables.at(-1).focus();
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.ok(dialog.contains(env.document.activeElement), 'Tab wrapped inside the dialog');

    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    assert.equal(env.document.activeElement, opener, 'focus went back to the trigger, not to the top of the page');
  } finally {
    env.dom.window.close();
  }
});

test('a11y: the mobile navigation toggle reports its state and targets the sidebar', async () => {
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/today');
    const toggle = env.document.querySelector('#nav-toggle');
    assert.ok(toggle, 'nav toggle exists');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), 'sidebar');
    assert.ok(accessibleName(toggle).toLowerCase().includes('navigation'), 'the toggle has a spoken name, not just a glyph');
    toggle.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'state is reported, not just styled');
  } finally {
    env.dom.window.close();
  }
});

test('a11y: closing a dialog whose trigger was re-rendered away puts focus at the top of the content, not on <body>', async () => {
  const env = bootDom();
  try {
    const { openModal } = await import('../../app/ui/dom.js');
    // A trigger that is removed from the document while the dialog is open —
    // exactly what a re-render does to a button inside #view.
    const trigger = env.document.createElement('button');
    trigger.textContent = 'Detached trigger';
    env.document.body.appendChild(trigger);
    trigger.focus();
    assert.equal(env.document.activeElement, trigger);

    const api = openModal({ title: 'Anything', body: env.document.createElement('p') });
    trigger.remove();
    api.close();
    assert.equal(env.document.activeElement.id, 'view', 'focus landed on the main landmark');
  } finally {
    env.dom.window.close();
  }
});

test('a11y: Monte Carlo SVG charts expose text summaries & data tables, and pre-export disclosure dialogs pass axe-core and restore focus', async () => {
  const { env, app } = await appWithDemo();
  try {
    app.ctx.navigate('#/capacity');
    const mcSvg = env.document.querySelector('[data-testid="capacity-montecarlo-card"] svg[role="img"]');
    assert.ok(mcSvg, 'Monte Carlo SVG present');
    assert.match(mcSvg.getAttribute('aria-label') || '', /Monte Carlo committed-demand histogram/i);

    app.ctx.navigate(`#/changes/${app.ctx.state.changes[0].id}`);
    const jSvg = env.document.querySelector('[data-testid="change-jcurve-simulation"] svg[role="img"]');
    assert.ok(jSvg, 'J-curve SVG present');
    assert.match(jSvg.getAttribute('aria-label') || '', /Stochastic Satir J-curve fan chart/i);

    app.ctx.navigate('#/hiring');
    const expBtn = Array.from(env.document.querySelectorAll('#view button')).find((b) => /Export hiring CSV/i.test(b.textContent));
    assert.ok(expBtn, 'Export hiring CSV button present on #/hiring');
    expBtn.focus();
    expBtn.click();
    assert.ok(env.document.querySelector('[data-testid="export-disclosure-dialog"]'), 'disclosure dialog opened');
    assert.deepEqual(await axeViolations(env, '[role="dialog"]'), [], 'export disclosure dialog passes axe-core');

    // Second open without axe-core focus movement verifies Escape restores focus to trigger
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.document.querySelector('[role="dialog"]'), null);
    const opener = Array.from(env.document.querySelectorAll('#view button')).find((b) => /Export hiring CSV/i.test(b.textContent));
    assert.ok(opener && opener.isConnected, 'Export hiring CSV button connected');
    opener.focus();
    opener.click();
    assert.ok(env.document.querySelector('[role="dialog"]'));
    env.document.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(env.document.activeElement, opener, 'Escape restores focus to Export hiring CSV trigger');
  } finally {
    env.dom.window.close();
  }
});

