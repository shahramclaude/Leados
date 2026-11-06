/** ADR-0106: the catalogue is searchable, keyboard-native and route-gated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { NAV } from '../../app/main.js';
import { buildWorkspaceNav, renderWorkspaceNav } from '../../app/ui/workspace-nav.js';

function dom() {
  const d = new JSDOM('<!doctype html><html><body><nav id="sidebar-nav"></nav></body></html>', { url: 'https://leados.test/#/mission', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  globalThis.window = d.window; globalThis.document = d.window.document; globalThis.Node = d.window.Node; globalThis.Element = d.window.Element; globalThis.HTMLElement = d.window.HTMLElement;
  return d;
}
const opts = (extra = {}) => ({ groups: NAV, route: 'mission', seat: null, allowed: () => true, counts: {}, isAggregate: () => false, currentHref: '#/mission?panel=execution', ...extra });

test('search re-renders without stealing focus or losing the caret, and discloses matching tools', () => {
  const d = dom(); const nav = document.getElementById('sidebar-nav'); nav.replaceChildren(renderWorkspaceNav(opts()));
  const input = nav.querySelector('#workspace-nav-search'); input.focus(); input.value = 'board'; input.setSelectionRange(5, 5);
  input.dispatchEvent(new d.window.Event('input', { bubbles: true }));
  const next = nav.querySelector('#workspace-nav-search'); assert.equal(document.activeElement, next); assert.equal(next.value, 'board'); assert.equal(next.selectionStart, 5);
  assert.ok(nav.querySelector('a[href="#/board"]')); assert.ok(nav.querySelector('[role="status"]').textContent.includes('permitted tool'));
  next.value = 'zz-no-such-tool'; next.dispatchEvent(new d.window.Event('input', { bubbles: true })); assert.ok(nav.textContent.includes('No permitted tool matches'));
  next.value = ''; next.dispatchEvent(new d.window.Event('input', { bubbles: true }));
  d.window.close();
});

test('only the exact pinned deep link is current; native details preserve disclosure state', () => {
  const d = dom(); const nav = document.getElementById('sidebar-nav'); nav.replaceChildren(renderWorkspaceNav(opts()));
  const current = [...nav.querySelectorAll('.nav-pinned a[aria-current="page"]')]; assert.deepEqual(current.map((a) => a.getAttribute('href')), ['#/mission?panel=execution']);
  const overview = [...nav.querySelectorAll('details.nav-group')].find((x) => x.querySelector('summary').textContent.includes('Overview'));
  overview.open = false; overview.dispatchEvent(new d.window.Event('toggle'));
  nav.replaceChildren(renderWorkspaceNav(opts({ route: 'cases', currentHref: '#/cases' })));
  const reopened = [...nav.querySelectorAll('details.nav-group')].find((x) => x.querySelector('summary').textContent.includes('Overview'));
  assert.equal(reopened.open, false, 'a deliberate collapse survives the next render');
  d.window.close();
});

test('withheld routes are not offered even when they match a search; the builder stays pure', () => {
  const allowed = (i) => !['board', 'onboarding'].includes(i.route);
  const model = buildWorkspaceNav(NAV, { route: 'mission', seat: null, allowed, query: 'board' });
  assert.equal(model.resultCount, 0); assert.deepEqual(model.sections[0].items, []);
  const full = buildWorkspaceNav(NAV, { route: 'mission', seat: null, allowed: () => true });
  assert.equal(full.mode, 'operator'); assert.ok(full.sections[0].items.some((i) => i.route === 'cases'));
  assert.ok(full.resultCount >= NAV.reduce((n, g) => n + g.items.length, 0));
});
