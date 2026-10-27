/**
 * app/main.js — bootstrap, routing, and the shell.
 *
 * The app is a single store plus a pure-ish render function per route. Every
 * render is wrapped so a bug in one view degrades to an error panel with an
 * export button rather than a blank screen.
 */

import { h, mount, toast, closeAllModals, openModal } from './ui/dom.js';
import { createStore, STORAGE_KEY } from './core/store.js';
import { createApi } from './actions.js';
import { createIdleMonitor } from './core/idle.js';
import { buildInsights } from './core/domain/insights.js';
import { teamHealth } from './core/domain/health.js';
import { dueMeetings } from './core/domain/oneonone.js';
import { renderToday } from './views/today.js';
import { renderIntake } from './views/intake.js';
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
import { renderVault } from './views/vault.js';
import { renderPrepSheet } from './views/prep.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderCases, renderCaseDetailView } from './views/cases.js';
import { renderChanges, renderChangeDetailView } from './views/changes.js';
import { renderCapacity } from './views/capacity.js';
import { renderScenarios } from './views/scenarios.js';
import { renderHiring, renderHiringDetail } from './views/hiring.js';
import { casesRollup } from './core/domain/cases.js';
import { changesRollup } from './core/domain/changes.js';
import { capacitySummary } from './core/domain/capacity.js';
import { hiringSummary } from './core/domain/hiring.js';
import { negotiationsRollup } from './core/domain/negotiation.js';
import { budgetsRollup } from './core/domain/finance.js';
import { stakeholdersRollup } from './core/domain/stakeholders.js';
import { renderNegotiations, renderNegotiationDetail } from './views/negotiation.js';
import { renderFinance, renderBudgetDetail } from './views/finance.js';
import { renderStakeholders, renderStakeholderDetail } from './views/stakeholders.js';
import { renderForecasts } from './views/forecasts.js';
import { renderTempo, tempoDebtCount } from './views/tempo.js';
import { renderRetention, retentionWatchCount } from './views/retention.js';
import { forecastIntegrityReport } from './core/domain/forecastIntegrity.js';
import { pendingIntakeDrafts } from './core/domain/intake.js';

function safeDecode(segment) {
  const raw = String(segment || '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const NAV = [
  { section: 'Overview', items: [
    { route: 'today', label: 'Today', icon: '◎' },
    { route: 'intake', label: 'Intake triage', icon: '⌖', badge: 'intake' },
    { route: 'insights', label: 'Signals', icon: '⚑', badge: 'signals' },
  ] },
  { section: 'People', items: [
    { route: 'people', label: 'People', icon: '◍' },
    { route: 'onboarding', label: 'Onboarding & transitions', icon: '◈' },
    { route: 'oneonones', label: '1:1s', icon: '❯', badge: 'due' },
    { route: 'feedback', label: 'Feedback', icon: '✎' },
    { route: 'reviews', label: 'Performance reviews', icon: '▤' },
    { route: 'hiring', label: 'Hiring', icon: '◇', badge: 'hiring' },
    { route: 'recognition', label: 'Recognition', icon: '★' },
  ] },
  { section: 'Growth', items: [
    { route: 'goals', label: 'Goals', icon: '⊕' },
    { route: 'delegations', label: 'Delegation', icon: '⇥' },
    { route: 'growth', label: 'Growth plans', icon: '↗' },
    { route: 'readiness', label: 'Succession', icon: '⌸' },
  ] },
  { section: 'Team', items: [
    { route: 'capacity', label: 'Capacity & flow', icon: '◫', badge: 'capacity' },
    { route: 'scenarios', label: 'What-if scenarios', icon: '◧' },
    { route: 'health', label: 'Health & pulse', icon: '♡' },
    { route: 'cases', label: 'Operational cases', icon: '⊞', badge: 'cases' },
    { route: 'changes', label: 'Org design & change', icon: '⌬', badge: 'changes' },
    { route: 'negotiations', label: 'Negotiation', icon: '⤄', badge: 'negotiations' },
    { route: 'finance', label: 'Budget & finance', icon: '◈', badge: 'finance' },
    { route: 'stakeholders', label: 'Stakeholders', icon: '♜', badge: 'stakeholders' },
    { route: 'forecasts', label: 'Forecast integrity', icon: '⌁', badge: 'forecast' },
    { route: 'tempo', label: 'Decision tempo', icon: '⧗', badge: 'tempo' },
    { route: 'retention', label: 'Retention & economics', icon: '⌾', badge: 'retention' },
    { route: 'decisions', label: 'Decisions', icon: '⑃' },
    { route: 'conflicts', label: 'Conflict resolution', icon: '⇄' },
  ] },
  { section: '', items: [
    { route: 'settings', label: 'Settings & data', icon: '⚙' },
  ] },
];

const RENDERERS = {
  today: (ctx) => renderToday(ctx),
  intake: (ctx) => renderIntake(ctx),
  insights: (ctx) => renderInsights(ctx),
  people: (ctx) => renderPeople(ctx),
  person: (ctx, segments) => renderPerson(ctx, safeDecode(segments[1])),
  onboarding: (ctx) => renderOnboarding(ctx),
  oneonones: (ctx) => renderOneOnOnes(ctx),
  feedback: (ctx) => renderFeedback(ctx),
  goals: (ctx) => renderGoals(ctx),
  delegations: (ctx) => renderDelegations(ctx),
  growth: (ctx) => renderGrowth(ctx),
  readiness: (ctx) => renderReadiness(ctx),
  health: (ctx) => renderHealth(ctx),
  capacity: (ctx) => renderCapacity(ctx),
  scenarios: (ctx) => renderScenarios(ctx),
  hiring: (ctx) => renderHiring(ctx),
  'hiring-detail': (ctx, segments) => renderHiringDetail(ctx, safeDecode(segments[1])),
  cases: (ctx) => renderCases(ctx),
  case: (ctx, segments) => renderCaseDetailView(ctx, safeDecode(segments[1])),
  negotiations: (ctx) => renderNegotiations(ctx),
  finance: (ctx) => renderFinance(ctx),
  budget: (ctx, segments) => renderBudgetDetail(ctx, safeDecode(segments[1])),
  stakeholders: (ctx) => renderStakeholders(ctx),
  stakeholder: (ctx, segments) => renderStakeholderDetail(ctx, safeDecode(segments[1])),
  forecasts: (ctx) => renderForecasts(ctx),
  tempo: (ctx) => renderTempo(ctx),
  retention: (ctx) => renderRetention(ctx),
  negotiation: (ctx, segments) => renderNegotiationDetail(ctx, safeDecode(segments[1])),
  changes: (ctx) => renderChanges(ctx),
  change: (ctx, segments) => renderChangeDetailView(ctx, safeDecode(segments[1])),
  decisions: (ctx) => renderDecisions(ctx),
  conflicts: (ctx) => renderConflicts(ctx),
  conflict: (ctx, segments) => renderConflictDetail(ctx, safeDecode(segments[1])),
  recognition: (ctx) => renderRecognition(ctx),
  reviews: (ctx) => renderReviews(ctx),
  review: (ctx, segments) => renderReviewDetail(ctx, safeDecode(segments[1])),
  settings: (ctx) => renderSettings(ctx),
  prep: (ctx, segments) => renderPrepSheet(ctx, safeDecode(segments[1])),
};

export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const alias = { '': 'today', 'signals': 'insights', 'one-on-ones': 'oneonones', 'pulse': 'health', 'data': 'settings', 'succession': 'readiness', 'what-if': 'scenarios', 'sensitivity': 'scenarios', 'budgets': 'finance', 'forecast': 'forecasts', 'triage': 'intake', 'latency': 'tempo', 'tempo': 'tempo' };
  const first = segments[0] || '';
  // Detail routes resolve to their own renderer, not the list.
  const detail = first === 'people' && segments.length > 1
    ? 'person'
    : first === 'reviews' && segments.length > 1
      ? 'review'
      : first === 'cases' && segments.length > 1
        ? 'case'
        : first === 'negotiations' && segments.length > 1
        ? 'negotiation'
        : first === 'finance' && segments.length > 1
        ? 'budget'
        : first === 'stakeholders' && segments.length > 1
        ? 'stakeholder'
        : first === 'changes' && segments.length > 1
        ? 'change'
        : first === 'hiring' && segments.length > 1
        ? 'hiring-detail'
        : first === 'conflicts' && segments.length > 1 ? 'conflict' : null;
  const route = detail || alias[first] || (RENDERERS[first] ? first : 'today');
  const known = Boolean(detail || RENDERERS[first] || alias[first] || first === '');
  return { route: known ? route : 'notfound', segments, query: new URLSearchParams(queryPart || '') };
}

export function createApp({ root, storage, now = () => new Date(), idFactory, crypto, kdfIterations, minKdfIterations } = {}) {
  const store = createStore({ storage, now, idFactory, crypto, kdfIterations, minKdfIterations });
  const api = createApi(store, { now, idFactory });
  let ctx = null;
  let currentRoute = null;
  let lastRenderedRoute = null;

  store.load();

  /* ------------------------------------------------------------- idle guard */
  /**
   * Idle auto-lock for an unlocked, encrypted workspace. One monitor per app
   * instance, driven by a timer; `warningModal` tracks the in-progress
   * "keep working or lock?" prompt so a lock can dismiss it.
   */
  let idleMonitor = null;
  let idleInterval = null;
  let appliedIdleMinutes = null;
  let warningModal = null;

  function stopIdleMonitor() {
    if (idleInterval) {
      clearInterval(idleInterval);
      idleInterval = null;
    }
    if (idleMonitor) {
      idleMonitor.stop();
      idleMonitor = null;
    }
    appliedIdleMinutes = null;
    closeWarningModal();
  }

  function closeWarningModal() {
    if (warningModal) {
      warningModal.close();
      warningModal = null;
    }
  }

  /** Any interaction cancels a pending warning/lock and restarts the clock. */
  function resetIdle() {
    closeWarningModal();
    idleMonitor?.recordActivity();
  }

  /** Show the non-destructive warning before an automatic lock. */
  function showIdleWarning(ctx) {
    const minutes = Number(ctx.state.settings.idleLockMinutes) || 0;
    const dialog = openModal({
      title: 'You have been inactive',
      description: `No activity for ${minutes} minutes. Lock now to protect your records, or keep working. The workspace locks automatically in 1 minute.`,
      body: h(
        'p',
        { class: 'modal-text' },
        'Locking clears the records from this tab until you unlock again with your passphrase. Nothing you have written is discarded — changes are saved before the lock.'
      ),
      footer: [
        h(
          'button',
          { class: 'btn btn-ghost', type: 'button', onClick: () => resetIdle() },
          'Keep working'
        ),
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onClick: () => {
              closeWarningModal();
              lockWorkspace(ctx);
            },
          },
          'Lock now'
        ),
      ],
      size: 'sm',
      onClose: () => resetIdle(),
    });
    warningModal = dialog;
  }

  /** Log the lock to the audit trail, then lock the workspace. */
  async function lockWorkspace(ctx) {
    closeWarningModal();
    store.update(
      (draft) => {},
      {
        type: 'privacy.idle-lock',
        entity: 'workspace',
        summary: 'Workspace locked automatically after inactivity',
      }
    );
    const result = await store.lock();
    if (!result.ok) {
      toast(result.error || 'The workspace could not be locked. Nothing was changed.', 'bad');
    }
  }

  /**
   * Start, restart or stop the idle monitor as the lock state and settings
   * change. Called on every render while the workspace is unlocked.
   */
  function ensureIdleMonitor(ctx) {
    const minutes = Number(ctx.state.settings.idleLockMinutes) || 0;
    if (!store.isEncrypted || store.isLocked || minutes <= 0) {
      stopIdleMonitor();
      return;
    }
    if (idleMonitor && appliedIdleMinutes === minutes) return;
    stopIdleMonitor();
    idleMonitor = createIdleMonitor({
      now,
      thresholdMs: minutes * 60 * 1000,
      warnGraceMs: 60 * 1000,
      onWarn: () => showIdleWarning(ctx),
      onLock: () => lockWorkspace(ctx),
    });
    appliedIdleMinutes = minutes;
    idleMonitor.start();
    const interval = setInterval(() => idleMonitor.tick(), 20 * 1000);
    // `unref()` lets the test process exit even while timers are pending. It
    // is a no-op in the browser, where the interval returns a plain id.
    if (typeof interval.unref === 'function') interval.unref();
    idleInterval = interval;
  }

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
      exportRedactedJSON: (options) => store.exportRedactedJSON(options),
      exportCSV: (scope, options) => store.exportCSV(scope, options),
      importJSON: (text, options) => {
        const result = store.importJSON(text, options);
        if (result.ok) render();
        return result;
      },
      /* ------------------------------------------------------- encryption */
      isStandalone: typeof window !== 'undefined' && window.__LEADOS_STANDALONE__ === true,
      standaloneBuildId: typeof window !== 'undefined' ? window.__LEADOS_BUILD_ID__ || null : null,
      isEncrypted: store.isEncrypted,
      isLocked: store.isLocked,
      vaultStatus: store.vaultStatus,
      vaultFacts: store.vaultFacts,
      cryptoAvailable: store.cryptoAvailable,
      refresh: () => render(),
      unlock: (passphrase) => store.unlock(passphrase),
      lockWorkspace: () => store.lock(),
      enableEncryption: (passphrase) => store.enableEncryption(passphrase),
      changePassphrase: (passphrase) => store.changePassphrase(passphrase),
      disableEncryption: () => store.disableEncryption(),
      exportEncryptedJSON: (passphrase, options) => store.exportEncrypted(passphrase, options),
      importBackup: async (text, options) => {
        const result = await store.importBackup(text, options);
        if (result.ok) render();
        return result;
      },
      eraseLockedWorkspace: async () => {
        if (!store.isLocked) return { ok: false, error: 'This workspace is not locked.' };
        try {
          store.reset({ eraseEncrypted: true });
          render();
          return { ok: true };
        } catch {
          return { ok: false, error: 'The workspace could not be erased. Nothing was changed.' };
        }
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
      intake: pendingIntakeDrafts(state, at).length,
      due: dueMeetings(state, at, state.settings).length,
      cases: casesRollup(state, at).attention.length,
      changes: changesRollup(state, at).attention.length,
      negotiations: negotiationsRollup(state, at).attention.length,
      finance: budgetsRollup(state, at).attention.length,
      stakeholders: stakeholdersRollup(state, at).attention.length,
      forecast: (() => {
        const report = forecastIntegrityReport(state, at);
        return report.openChallenges + (report.missingActuals.length >= 3 ? 1 : 0);
      })(),
      // Decision debt (Schema v28): open decisions past their own decide-by date
      // or their decision-type guardrail. Zero on an empty workspace.
      tempo: (state.decisions || []).some((d) => !d.chosen) ? tempoDebtCount(state, at) : 0,
      // Retention (Schema v29): people above the watch band with no committed
      // plan. Zero on an empty workspace, and never a count of "flight risks".
      retention: (state.people || []).some((p) => p.status !== 'archived') ? retentionWatchCount(state, at) : 0,
      hiring: hiringSummary(state, { now: at, settings: state.settings }).needsDecision.length,
      capacity: (() => {
        if (!(state.portfolio || []).length) return 0;
        const cap = capacitySummary(state, at);
        if (!cap.model.hasTeam) return 0;
        let count = 0;
        if (['elevated', 'overloaded', 'infeasible'].includes(cap.model.band.id)) count += 1;
        if (cap.forecast.lateTargetCount > 0) count += 1;
        if (cap.model.demand.wanted.length > 0) count += 1;
        return count;
      })(),
    };
  }

  function renderNav(state, at, route) {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    if (store.isLocked) {
      // No section links while locked: they would open empty screens and imply
      // the workspace is readable when it is not.
      mount(nav, h('p', { class: 'nav-section' }, 'Workspace locked'));
      return;
    }
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
              const active = item.route === route || (item.route === 'people' && route === 'person') || (item.route === 'reviews' && route === 'review') || (item.route === 'cases' && route === 'case') || (item.route === 'changes' && route === 'change') || (item.route === 'negotiations' && route === 'negotiation') || (item.route === 'finance' && route === 'budget') || (item.route === 'stakeholders' && route === 'stakeholder') || (item.route === 'conflicts' && route === 'conflict') || (item.route === 'hiring' && route === 'hiring-detail');
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
    if (store.isLocked) {
      mount(
        bar,
        h(
          'div',
          { class: 'topbar-meta' },
          h('span', { class: 'topbar-team' }, 'Encrypted workspace'),
          h('span', { class: 'topbar-sep', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'muted small' }, 'locked'),
          h('span', { class: 'badge badge-caution' }, 'locked'),
        ),
      );
      return;
    }
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
    const topbarActions = document.querySelector('.topbar-actions');
    if (topbarActions) topbarActions.hidden = store.isLocked;
    if (store.isLocked) {
      // One screen only. Routing still works after unlocking, so the hash is
      // left untouched and the person returns to where they were.
      try {
        mount(view, renderVault(ctx));
        const heading = view.querySelector('h1');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
        lastRenderedRoute = route;
        document.title = 'Unlock workspace · LeadOS';
      } catch (error) {
        renderError(error, 'vault');
      }
      return;
    }

    // An unlocked, encrypted workspace guards itself against inactivity.
    ensureIdleMonitor(ctx);

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
    const seg1 = safeDecode(parseRoute(window.location.hash).segments[1]);
    const labels = {
      today: 'Today',
      insights: 'Signals',
      people: 'People',
      person: state.people.find((p) => p.id === seg1)?.name || 'Person',
      onboarding: 'Onboarding & transitions (30-60-90)',
      oneonones: '1:1s',
      feedback: 'Feedback',
      recognition: 'Recognition',
      reviews: 'Performance reviews',
      review: 'Performance review',
      goals: 'Goals',
      growth: 'Growth plans',
      readiness: 'Succession',
      capacity: 'Capacity & flow',
      scenarios: 'What-if scenarios & sensitivity',
      health: 'Health & pulse',
      cases: 'Operational cases',
      case: state.cases?.find((c) => c.id === seg1)?.title || 'Operational case',
      changes: 'Org design & change',
      change: state.changes?.find((c) => c.id === seg1)?.title || 'Organizational change',
      negotiations: 'Negotiation workbench',
      negotiation: state.negotiations?.find((n) => n.id === seg1)?.title || 'Negotiation',
      finance: 'Budget & finance',
      budget: state.budgets?.find((b) => b.id === seg1)?.name || 'Budget envelope',
      stakeholders: 'Stakeholder influence register',
      stakeholder: state.stakeholders?.find((s) => s.id === seg1)?.name || 'Stakeholder',
      forecasts: 'Forecast integrity terminal',
      hiring: 'Selection & hiring',
      'hiring-detail': state.requisitions?.find((r) => r.id === seg1)?.title || 'Requisition',
      decisions: 'Decisions',
      conflicts: 'Conflict resolution',
      conflict: 'Conflict working record',
      delegations: 'Delegation',
      settings: 'Settings',
      prep: '1:1 prep sheet',
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
const isTestBoot = typeof window !== 'undefined' && window.__LEADOS_TEST__ === true;
if (rootEl && !isTestBoot) {
  createApp({ root: rootEl });
  // `window.localStorage` itself can throw on an opaque file:// origin, not
  // just return null. The store already degrades to an in-memory workspace;
  // this first-run informational check must not break a portable copy.
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (storage && !storage.getItem(STORAGE_KEY)) {
      // First run: nothing is fabricated. The Today screen explains what to do.
      if (typeof console !== 'undefined') console.info('LeadOS: empty workspace created at', STORAGE_KEY);
    }
  } catch {
    // Storage is unavailable (private mode / opaque origin). The Settings
    // screen surfaces the persistence warning; boot must still succeed.
  }
}
