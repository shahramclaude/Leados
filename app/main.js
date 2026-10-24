/**
 * app/main.js — bootstrap, routing, and the shell.
 *
 * The app is a single store plus a pure-ish render function per route. Every
 * render is wrapped so a bug in one view degrades to an error panel with an
 * export button rather than a blank screen.
 */

import { h, mount, toast, closeAllModals } from './ui/dom.js';
import { createStore, STORAGE_KEY } from './core/store.js';
import { createApi } from './actions.js';
import { buildInsights } from './core/domain/insights.js';
import { teamHealth } from './core/domain/health.js';
import { dueMeetings } from './core/domain/oneonone.js';
import { renderToday } from './views/today.js';
import { renderInsights } from './views/insights.js';
import { renderPeople } from './views/people.js';
import { renderPerson } from './views/person.js';
import { renderOneOnOnes } from './views/oneonones.js';
import { renderFeedback } from './views/feedback.js';
import { renderGoals } from './views/goals.js';
import { renderDelegations } from './views/delegations.js';
import { renderGrowth } from './views/growth.js';
import { renderReadiness } from './views/readiness.js';
import { renderHealth } from './views/health.js';
import { renderConflicts, renderConflictDetail } from './views/conflicts.js';
import { renderDecisions } from './views/decisions.js';
import { renderRecognition } from './views/recognition.js';
import { renderReviews, renderReviewDetail } from './views/reviews.js';
import { renderSettings } from './views/settings.js';

export const NAV = [
  { section: 'Overview', items: [
    { route: 'today', label: 'Today', icon: '◎' },
    { route: 'insights', label: 'Signals', icon: '⚑', badge: 'signals' },
  ] },
  { section: 'People', items: [
    { route: 'people', label: 'People', icon: '◍' },
    { route: 'oneonones', label: '1:1s', icon: '❯', badge: 'due' },
    { route: 'feedback', label: 'Feedback', icon: '✎' },
    { route: 'reviews', label: 'Performance reviews', icon: '▤' },
    { route: 'recognition', label: 'Recognition', icon: '★' },
  ] },
  { section: 'Growth', items: [
    { route: 'goals', label: 'Goals', icon: '⊕' },
    { route: 'delegations', label: 'Delegation', icon: '⇥' },
    { route: 'growth', label: 'Growth plans', icon: '↗' },
    { route: 'readiness', label: 'Succession', icon: '⌸' },
  ] },
  { section: 'Team', items: [
    { route: 'health', label: 'Health & pulse', icon: '♡' },
    { route: 'decisions', label: 'Decisions', icon: '⑃' },
    { route: 'conflicts', label: 'Conflict resolution', icon: '⇄' },
  ] },
  { section: '', items: [
    { route: 'settings', label: 'Settings & data', icon: '⚙' },
  ] },
];

const RENDERERS = {
  today: (ctx) => renderToday(ctx),
  insights: (ctx) => renderInsights(ctx),
  people: (ctx) => renderPeople(ctx),
  person: (ctx, segments) => renderPerson(ctx, segments[1]),
  oneonones: (ctx) => renderOneOnOnes(ctx),
  feedback: (ctx) => renderFeedback(ctx),
  goals: (ctx) => renderGoals(ctx),
  delegations: (ctx) => renderDelegations(ctx),
  growth: (ctx) => renderGrowth(ctx),
  readiness: (ctx) => renderReadiness(ctx),
  health: (ctx) => renderHealth(ctx),
  decisions: (ctx) => renderDecisions(ctx),
  conflicts: (ctx) => renderConflicts(ctx),
  conflict: (ctx, segments) => renderConflictDetail(ctx, decodeURIComponent(segments[1] || '')),
  recognition: (ctx) => renderRecognition(ctx),
  reviews: (ctx) => renderReviews(ctx),
  review: (ctx, segments) => renderReviewDetail(ctx, decodeURIComponent(segments[1] || '')),
  settings: (ctx) => renderSettings(ctx),
};

export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const alias = { '': 'today', 'signals': 'insights', 'one-on-ones': 'oneonones', 'pulse': 'health', 'data': 'settings', 'succession': 'readiness' };
  const first = segments[0] || '';
  // Detail routes resolve to their own renderer, not the list.
  const detail = first === 'people' && segments.length > 1
    ? 'person'
    : first === 'reviews' && segments.length > 1
      ? 'review'
      : first === 'conflicts' && segments.length > 1 ? 'conflict' : null;
  const route = detail || alias[first] || (RENDERERS[first] ? first : 'today');
  const known = Boolean(detail || RENDERERS[first] || alias[first] || first === '');
  return { route: known ? route : 'notfound', segments, query: new URLSearchParams(queryPart || '') };
}

export function createApp({ root, storage, now = () => new Date(), idFactory } = {}) {
  const store = createStore({ storage, now, idFactory });
  const api = createApi(store, { now, idFactory });
  let ctx = null;
  let currentRoute = null;
  let lastRenderedRoute = null;

  store.load();

  function navigate(target) {
    if (!target) return;
    const hash = target.startsWith('#') ? target : `#/${target.replace(/^\//, '')}`;
    // A dialog must never survive a route change: it would hover over a screen
    // it no longer describes, and its buttons would write to the old context.
    closeAllModals();
    if (window.location.hash === hash) {
      render();
    } else {
      window.location.hash = hash;
      render();
    }
  }

  function buildContext(route, segments, query) {
    const state = store.state;
    return {
      state,
      now: now(),
      route,
      segments,
      query,
      api,
      navigate,
      warnings: store.warnings,
      persistError: store.persistError,
      storageSize: () => store.sizeBytes(),
      exportJSON: () => store.exportJSON(),
      exportCSV: (scope) => store.exportCSV(scope),
      importJSON: (text) => {
        const result = store.importJSON(text);
        if (result.ok) render();
        return result;
      },
      resetStore: () => {
        const next = store.reset();
        render();
        return next;
      },
      loadDemo: (options = {}) => {
        const result = store.seedDemo(options);
        if (result.ok) render();
        return result;
      },
      clearDemo: () => {
        store.clearDemo();
        toast('Demo data cleared', 'good');
        render();
      },
    };
  }

  function counters(state, at) {
    const insights = buildInsights(state, at);
    return {
      signals: insights.urgent.length,
      due: dueMeetings(state, at, state.settings).length,
    };
  }

  function renderNav(state, at, route) {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    const counts = counters(state, at);
    mount(
      nav,
      h(
        'div',
        { class: 'nav-inner' },
        ...NAV.map((group) =>
          h(
            'div',
            { class: 'nav-group' },
            group.section ? h('p', { class: 'nav-section' }, group.section) : null,
            ...group.items.map((item) => {
              const active = item.route === route || (item.route === 'people' && route === 'person') || (item.route === 'reviews' && route === 'review') || (item.route === 'conflicts' && route === 'conflict');
              const count = item.badge ? counts[item.badge] : 0;
              return h(
                'a',
                {
                  class: `nav-item ${active ? 'is-active' : ''}`,
                  href: `#/${item.route}`,
                  'aria-current': active ? 'page' : null,
                },
                h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, item.icon),
                h('span', { class: 'nav-label' }, item.label),
                count ? h('span', { class: 'nav-count', 'aria-label': `${count} needing attention` }, String(count)) : null,
              );
            }),
          ),
        ),
      ),
    );
  }

  function renderTopbar(state, at) {
    const bar = document.getElementById('topbar-meta');
    if (!bar) return;
    const health = teamHealth(state, at, { withTrend: false });
    const people = state.people.filter((p) => p.status !== 'archived').length;
    mount(
      bar,
      h(
        'div',
        { class: 'topbar-meta' },
        h('span', { class: 'topbar-team' }, state.settings.teamName),
        h('span', { class: 'topbar-sep', 'aria-hidden': 'true' }, '·'),
        h('span', { class: 'muted small' }, `${people} ${people === 1 ? 'person' : 'people'}`),
        health.overall === null
          ? h('span', { class: 'health-chip is-neutral' }, 'not measured')
          : h(
              'a',
              { class: `health-chip ${health.overall >= 75 ? 'is-good' : health.overall >= 55 ? 'is-warn' : 'is-bad'}`, href: '#/health', title: 'Team health — open the detail' },
              `${health.overall} · ${health.grade}`,
            ),
        state.meta.isDemo ? h('span', { class: 'demo-chip' }, 'DEMO') : null,
      ),
    );
  }

  function renderError(error, route) {
    const view = document.getElementById('view');
    if (!view) return;
    mount(
      view,
      h(
        'div',
        { class: 'page' },
        h(
          'div',
          { class: 'card' },
          h('h1', { class: 'page-title' }, 'This screen failed to draw'),
          h('p', { class: 'muted' }, 'Your data is untouched — it lives in this browser, not in the failed screen. You can export it before reloading.'),
          h('pre', { class: 'error-detail' }, String(error && error.stack ? error.stack : error)),
          h(
            'div',
            { class: 'row-gap' },
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => render() }, 'Try again'),
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { window.location.hash = '#/today'; } }, 'Go to Today'),
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { window.location.hash = '#/settings'; } }, 'Open data & export'),
          ),
        ),
      ),
    );
    if (typeof console !== 'undefined') console.error(`Render failed for route "${route}"`, error);
  }

  function render() {
    const view = document.getElementById('view');
    if (!view) return;
    const { route, segments, query } = parseRoute(window.location.hash);
    const at = now();
    const routeChanged = route !== lastRenderedRoute || (currentRoute === null && lastRenderedRoute === null);
    currentRoute = route;
    renderNav(store.state, at, route);
    renderTopbar(store.state, at);
    ctx = buildContext(route, segments, query);
    const renderer = RENDERERS[route];
    try {
      if (!renderer) {
        mount(
          view,
          h(
            'div',
            { class: 'page' },
            h('h1', { class: 'page-title' }, 'That page does not exist'),
            h('p', { class: 'muted' }, 'Nothing is broken — the link just does not match a screen.'),
            h('a', { class: 'btn btn-primary', href: '#/today' }, 'Back to Today'),
          ),
        );
        return;
      }
      const node = renderer(ctx, segments);
      mount(view, node);
      const heading = view.querySelector('h1');
      if (heading) heading.setAttribute('tabindex', '-1');
      // Move focus to the new heading only when the route actually changed.
      // Doing it on every re-render yanked the caret out of search boxes and
      // form fields whenever the store updated.
      if (heading && routeChanged && !document.activeElement?.closest?.('#modal-root')) {
        heading.focus({ preventScroll: true });
      }
      lastRenderedRoute = route;
      document.title = `${documentTitle(route, store.state)} · LeadOS`;
    } catch (error) {
      renderError(error, route);
    }
  }

  function documentTitle(route, state) {
    const labels = {
      today: 'Today',
      insights: 'Signals',
      people: 'People',
      person: state.people.find((p) => p.id === parseRoute(window.location.hash).segments[1])?.name || 'Person',
      oneonones: '1:1s',
      feedback: 'Feedback',
      recognition: 'Recognition',
      reviews: 'Performance reviews',
      review: 'Performance review',
      goals: 'Goals',
      growth: 'Growth plans',
      readiness: 'Succession',
      health: 'Health & pulse',
      decisions: 'Decisions',
      conflicts: 'Conflict resolution',
      conflict: 'Conflict working record',
      delegations: 'Delegation',
      settings: 'Settings',
    };
    return labels[route] || 'LeadOS';
  }

  store.subscribe(() => render());

  window.addEventListener('hashchange', () => {
    closeAllModals();
    render();
  });

  // Mobile navigation
  const toggle = document.getElementById('nav-toggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
        sidebar.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    // Close the drawer after navigating on small screens.
    window.addEventListener('hashchange', () => {
      sidebar.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  render();

  return {
    render,
    navigate,
    api,
    get store() {
      return store;
    },
    get ctx() {
      return ctx;
    },
    get route() {
      return currentRoute;
    },
  };
}

/* Auto-boot when loaded as the app entry point (skipped under test, which
   constructs the app explicitly against a jsdom document). */
const rootEl = typeof document !== 'undefined' ? document.getElementById('view') : null;
if (rootEl && !window.__LEADOS_TEST__) {
  createApp({ root: rootEl });
  if (window.localStorage && !window.localStorage.getItem(STORAGE_KEY)) {
    // First run: nothing is fabricated. The Today screen explains what to do.
    if (typeof console !== 'undefined') console.info('LeadOS: empty workspace created at', STORAGE_KEY);
  }
}
