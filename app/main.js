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
import { renderComms } from './views/comms.js';
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
import { renderResilience, renderResilienceDetail } from './views/resilience.js';
import { forecastIntegrityReport } from './core/domain/forecastIntegrity.js';
import { pendingIntakeDrafts } from './core/domain/intake.js';
import { buildResilienceReport } from './core/domain/resilience.js';
import { buildPowerReport } from './core/domain/power.js';
import { renderPower, renderPowerDetail } from './views/power.js';
import { buildNetworkReport } from './core/domain/orgNetwork.js';
import { renderNetwork } from './views/network.js';
import { renderAssurance } from './views/assurance.js';
import { renderImpact } from './views/impact.js';
import { buildImpactReport } from './core/domain/impact.js';
import { renderAllocation } from './views/allocation.js';
import { buildAllocationReport } from './core/domain/allocation.js';
import { renderLoad } from './views/load.js';
import { buildLoadReport } from './core/domain/load.js';
import { renderPremises } from './views/premises.js';
import { buildPremiseReport } from './core/domain/premises.js';
import { renderAnomaly } from './views/anomaly.js';
import { assessAnomaly, generateBoardBrief, extractModuleSeries } from './core/domain/anomaly.js';
import { renderDynamics } from './views/dynamics.js';
import { dynamicsAttentionCount } from './core/domain/dynamics.js';
import { renderCapital } from './views/capital.js';
import { capitalAttentionCount } from './core/domain/policyPortfolio.js';
import { renderStrategy } from './views/strategy.js';
import { strategyAttentionCount } from './core/domain/strategy.js';
import { renderLearning } from './views/learning.js';
import { learningAttentionCount } from './core/domain/learning.js';
import { renderWatch } from './views/watch.js';
import { renderHandover } from './views/handover.js';
import { leaderDemandInventory } from './core/domain/leaderContinuity.js';
import { renderPropagation } from './views/propagation.js';
import { renderMeasurement } from './views/measurement.js';
import { renderFidelity } from './views/fidelity.js';
import { renderMerit } from './views/merit.js';
import { renderTransition } from './views/transition.js';
import { renderOrgDesign } from './views/orgDesign.js';
import { renderVoi } from './views/valueOfInformation.js';
import { renderDecisionPortfolio } from './views/decisionPortfolio.js';
import { renderAttentionMarket } from './views/attentionMarket.js';
import { renderSignalPath } from './views/signalPath.js';
import { renderAutopilot } from './views/autopilot.js';
import { renderWarGame } from './views/warGame.js';
import { renderCoupling } from './views/coupling.js';
import { renderPerformance } from './views/performance.js';
import { renderSurvival } from './views/survival.js';
import { buildMeasurementReport } from './core/domain/measurement.js';
import { buildWatchReport } from './core/domain/earlyWarning.js';
import { fidelityPortfolio } from './core/domain/fidelity.js';
import { meritAttention } from './core/domain/comp.js';
import { transitionAttention } from './core/domain/transition.js';
import { orgDesignAttention } from './core/domain/orgDesign.js';
import { voiAttentionCount } from './core/domain/valueOfInformation.js';
import { decisionPortfolioAttention } from './core/domain/decisionPortfolio.js';
import { lcalAttentionCount } from './core/domain/leaderCalibration.js';
import { attentionAttentionCount } from './core/domain/attentionMarket.js';
import { signalAttentionCount } from './core/domain/signalPath.js';
import { warGameAttentionCount } from './core/domain/warGame.js';
import { couplingAttentionCount } from './core/domain/coupling.js';
import { performanceAttentionCount } from './core/domain/performance.js';
import { survivalAttentionCount } from './core/domain/survival.js';
import { autopilotAttentionCount } from './core/domain/autopilot.js';

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
    { route: 'comms', label: 'Comms outbox', icon: '✉', badge: 'comms' },
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
    { route: 'measurement', label: 'Scorecard integrity', icon: '⚖', badge: 'measurement' },
    { route: 'delegations', label: 'Delegation', icon: '⇥' },
    { route: 'growth', label: 'Growth plans', icon: '↗' },
    { route: 'readiness', label: 'Succession', icon: '⌸' },
  ] },
  { section: 'Team', items: [
    { route: 'capacity', label: 'Capacity & flow', icon: '◫', badge: 'capacity' },
    { route: 'allocation', label: 'Allocation governor', icon: '⚖', badge: 'allocation' },
    { route: 'load', label: 'Load & attention', icon: '⏳', badge: 'load' },
    { route: 'handover', label: 'Leader continuity', icon: '⛨', badge: 'handover' },
    { route: 'dynamics', label: 'System dynamics', icon: '∿', badge: 'dynamics' },
    { route: 'capital', label: 'Capital allocation', icon: '⚖', badge: 'capital' },
    { route: 'strategy', label: 'Strategy coherence', icon: '⌖', badge: 'strategy' },
    { route: 'learning', label: 'After-action reviews', icon: '⟲', badge: 'learning' },
    { route: 'scenarios', label: 'What-if scenarios', icon: '◧' },
    { route: 'health', label: 'Health & pulse', icon: '♡' },
    { route: 'cases', label: 'Operational cases', icon: '⊞', badge: 'cases' },
    { route: 'resilience', label: 'Operational resilience', icon: '⛨', badge: 'resilience' },
    { route: 'power', label: 'Coalition & power', icon: '♛', badge: 'power' },
    { route: 'network', label: 'Influence network', icon: '❖', badge: 'network' },
    { route: 'impact', label: 'Impact ledger', icon: '◎', badge: 'impact' },
    { route: 'fidelity', label: 'Implementation fidelity', icon: '⇉', badge: 'fidelity' },
    { route: 'merit', label: 'Merit & pay equity', icon: '⊜', badge: 'merit' },
    { route: 'transition', label: 'Workforce transition', icon: '⇲', badge: 'transition' },
    { route: 'changes', label: 'Org design & change', icon: '⌬', badge: 'changes' },
    { route: 'orgdesign', label: 'Structural design', icon: '⑂', badge: 'orgdesign' },
    { route: 'voi', label: 'Information value', icon: '◮', badge: 'voi' },
    { route: 'portfolio', label: 'Decision portfolio', icon: '⊛', badge: 'portfolio' },
    { route: 'attention', label: 'Attention market', icon: '⚖', badge: 'attention' },
    { route: 'signal', label: 'Signal path', icon: '☍', badge: 'signal' },
    { route: 'autopilot', label: 'Autopilot Studio', icon: '⛭', badge: 'autopilot' },
    { route: 'wargame', label: 'War Games', icon: '⚔', badge: 'wargame' },
    { route: 'coupling', label: 'Coupled Load', icon: '⇌', badge: 'coupling' },
    // Schema v62: the leader's own process when someone is not delivering.
    { route: 'performance', label: 'Performance recovery', icon: '⚑', badge: 'performance' },
    // Schema v63: time-to-finish for every dated record, censored honestly.
    { route: 'survival', label: 'Delivery survival', icon: '⌛', badge: 'survival' },
    { route: 'negotiations', label: 'Negotiation', icon: '⤄', badge: 'negotiations' },
    { route: 'finance', label: 'Budget & finance', icon: '◈', badge: 'finance' },
    { route: 'stakeholders', label: 'Stakeholders', icon: '♜', badge: 'stakeholders' },
    { route: 'forecasts', label: 'Forecast integrity', icon: '⌁', badge: 'forecast' },
    { route: 'premises', label: 'Assumption ledger', icon: '⟡', badge: 'premises' },
    { route: 'anomaly', label: 'Anomaly intelligence', icon: '◈', badge: 'anomaly' },
    { route: 'watch', label: 'Early-warning watch', icon: '◐', badge: 'watch' },
    { route: 'tempo', label: 'Decision tempo', icon: '⧗', badge: 'tempo' },
    { route: 'decisions', label: 'Decisions', icon: '⑃' },
    { route: 'conflicts', label: 'Conflict resolution', icon: '⇄' },
  ] },
  { section: '', items: [
    { route: 'assurance', label: 'Automation control', icon: '⌘' },
    { route: 'propagation', label: 'Propagation ledger', icon: '⇶', badge: 'propagation' },
    { route: 'settings', label: 'Settings & data', icon: '⚙' },
  ] },
];

const RENDERERS = {
  assurance: (ctx) => renderAssurance(ctx),
  today: (ctx) => renderToday(ctx),
  intake: (ctx) => renderIntake(ctx),
  comms: (ctx) => renderComms(ctx),
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
  measurement: (ctx) => renderMeasurement(ctx),
  health: (ctx) => renderHealth(ctx),
  capacity: (ctx) => renderCapacity(ctx),
  allocation: (ctx) => renderAllocation(ctx),
  load: (ctx) => renderLoad(ctx),
  dynamics: (ctx) => renderDynamics(ctx),
  capital: (ctx) => renderCapital(ctx),
  strategy: (ctx) => renderStrategy(ctx),
  learning: (ctx) => renderLearning(ctx),
  premises: (ctx) => renderPremises(ctx),
  anomaly: (ctx) => renderAnomaly(ctx),
  watch: (ctx) => renderWatch(ctx),
  handover: (ctx) => renderHandover(ctx),
  propagation: (ctx) => renderPropagation(ctx),
  scenarios: (ctx) => renderScenarios(ctx),
  hiring: (ctx) => renderHiring(ctx),
  'hiring-detail': (ctx, segments) => renderHiringDetail(ctx, safeDecode(segments[1])),
  cases: (ctx) => renderCases(ctx),
  case: (ctx, segments) => renderCaseDetailView(ctx, safeDecode(segments[1])),
  resilience: (ctx) => renderResilience(ctx),
  'resilience-detail': (ctx, segments) => renderResilienceDetail(ctx, safeDecode(segments[1])),
  power: (ctx) => renderPower(ctx),
  'power-detail': (ctx, segments) => renderPowerDetail(ctx, safeDecode(segments[1])),
  network: (ctx) => renderNetwork(ctx),
  impact: (ctx) => renderImpact(ctx),
  fidelity: (ctx) => renderFidelity(ctx),
  merit: (ctx) => renderMerit(ctx),
  transition: (ctx) => renderTransition(ctx),
  orgdesign: (ctx) => renderOrgDesign(ctx),
  voi: (ctx) => renderVoi(ctx),
  portfolio: (ctx) => renderDecisionPortfolio(ctx),
  attention: (ctx) => renderAttentionMarket(ctx),
  signal: (ctx) => renderSignalPath(ctx),
  autopilot: (ctx) => renderAutopilot(ctx),
    wargame: (ctx) => renderWarGame(ctx),
    coupling: (ctx) => renderCoupling(ctx),
  performance: (ctx) => renderPerformance(ctx),
  survival: (ctx) => renderSurvival(ctx),
  negotiations: (ctx) => renderNegotiations(ctx),
  finance: (ctx) => renderFinance(ctx),
  budget: (ctx, segments) => renderBudgetDetail(ctx, safeDecode(segments[1])),
  stakeholders: (ctx) => renderStakeholders(ctx),
  stakeholder: (ctx, segments) => renderStakeholderDetail(ctx, safeDecode(segments[1])),
  forecasts: (ctx) => renderForecasts(ctx),
  tempo: (ctx) => renderTempo(ctx),
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
  const alias = { '': 'today', 'signals': 'insights', 'one-on-ones': 'oneonones', 'pulse': 'health', 'data': 'settings', 'succession': 'readiness', 'what-if': 'scenarios', 'sensitivity': 'scenarios', 'budgets': 'finance', 'forecast': 'forecasts', 'triage': 'intake', 'latency': 'tempo', 'tempo': 'tempo', 'continuity': 'resilience', 'coalition': 'power', 'warroom': 'power', 'cognitive-load': 'load', 'saturation': 'load', 'evidence': 'impact', 'studies': 'impact', 'did-it-work': 'impact', 'assumptions': 'premises', 'premise': 'premises', 'decision-memory': 'premises', 'signposts': 'premises', 'capital': 'capital', 'watch': 'watch', 'early-warning': 'watch', 'alerts': 'watch', 'monitoring': 'watch', 'effort': 'capital', 'shapley': 'capital', 'policy-portfolio': 'capital', 'budget-allocation': 'capital', 'absence': 'handover', 'leader-continuity': 'handover', 'drill': 'handover', 'cover': 'handover', 'fidelity': 'fidelity', 'implementation': 'fidelity', 'delivery': 'fidelity', 'adoption': 'fidelity', 'dose': 'fidelity', 'merit': 'merit', 'pay': 'merit', 'compensation': 'merit', 'comp': 'merit', 'equity': 'merit', 'pay-equity': 'merit', 'raise': 'merit', 'raises': 'merit', 'bands': 'merit', 'transition': 'transition', 'restructuring': 'transition', 'reduction': 'transition', 'redundancy': 'transition', 'severance': 'transition', 'exit': 'transition', 'offboarding': 'transition', 'rif': 'transition', 'orgdesign': 'orgdesign', 'org-design': 'orgdesign', 'structure': 'orgdesign', 'spans': 'orgdesign', 'reorg': 'orgdesign', 'reporting-lines': 'orgdesign', 'topology': 'orgdesign', 'span': 'orgdesign', 'voi': 'voi', 'information-value': 'voi', 'evpi': 'voi', 'evsi': 'voi', 'value-of-information': 'voi', 'probe': 'voi', 'test-before-deciding': 'voi', 'portfolio': 'portfolio', 'decision-portfolio': 'portfolio', 'sequencing': 'portfolio', 'decision-queue': 'portfolio', 'decision-load': 'portfolio', 'decision-bottleneck': 'portfolio', 'coupling': 'coupling', 'attention': 'attention', 'market': 'attention', 'my-week': 'attention', 'hours': 'attention', 'triage-week': 'attention', 'allocate': 'attention', 'attention-market': 'attention', 'signal': 'signal', 'signal-path': 'signal', 'escalation': 'signal', 'blind-spots': 'signal', 'what-reaches-me': 'signal', 'information-flow': 'signal', 'mum-effect': 'signal', 'signal-fidelity': 'signal', 'autopilot': 'autopilot', 'autopilot-studio': 'autopilot', 'operating-agreements': 'autopilot', 'agreements': 'autopilot', 'wargame': 'wargame', 'war-game': 'wargame', 'war-games': 'wargame', 'wargames': 'wargame', 'scenario-planning': 'wargame', 'strategic-stress': 'wargame', 'strategy-stress': 'wargame', 'rehearsal': 'wargame', 'warroom-stress': 'wargame',
    'performance': 'performance', 'perf': 'performance', 'recovery': 'performance',
    'performance-recovery': 'performance', 'underperformance': 'performance',
    'concern': 'performance', 'concerns': 'performance', 'capability': 'performance',
    'survival': 'survival', 'delivery': 'survival', 'kaplan-meier': 'survival',
    'km': 'survival', 'cycle-time': 'survival', 'time-to-close': 'survival',
    'censoring': 'survival', 'hazard': 'survival', 'delivery-survival': 'survival',
    'on-time': 'survival', 'slippage': 'survival' };
  const first = segments[0] || '';
  // Detail routes resolve to their own renderer, not the list.
  const detail = first === 'people' && segments.length > 1
    ? 'person'
    : first === 'reviews' && segments.length > 1
      ? 'review'
      : first === 'cases' && segments.length > 1
        ? 'case'
        : first === 'resilience' && segments.length > 1
        ? 'resilience-detail'
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
        : first === 'power' && segments.length > 1
        ? 'power-detail'
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
      // ADR-0026: the measured cost/outcome of the most recent rule chain.
      // Instrumentation only — never persisted, never exported.
      propagationMetrics: store.lastPropagationMetrics,
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
      // Schema v32: drafts written from case facts that still await a human.
      comms: (state.commsDrafts || []).filter((d) => d && d.status === 'draft').length,
      due: dueMeetings(state, at, state.settings).length,
      cases: casesRollup(state, at).attention.length,
      resilience: (state.dependencies || []).length ? buildResilienceReport(state, at).totals.attention : 0,
      power: (state.powerGames || []).length ? buildPowerReport(state, at).totals.attention : 0,
      // Session 48: a derived lens — measurable only with >= 2 active people.
      network: state.people.filter((p) => p.status !== 'archived').length >= 2
        ? buildNetworkReport(state, at).totals.attention : 0,
      // Impact ledger (Schema v31): studies whose evaluation window has closed
      // but which nobody has scored. A forgotten study is a lesson you paid for
      // and then threw away.
      impact: (state.impactStudies || []).length ? buildImpactReport(state, at).totals.awaitingEvaluation : 0,
      // Allocation Governor (Schema v33): exploration starvation, an open
      // rebalancing decision, and settled bets whose outcomes nobody recorded.
      allocation: (state.portfolio || []).length ? buildAllocationReport(state, at).totals.attention : 0,
      // Cognitive Load Governor (Schema v34): people in the saturated or
      // overloaded bands — a derived lens, zero unless the roster exists.
      load: state.people.filter((p) => p.status !== 'archived').length
        ? buildLoadReport(state, at).totals.attention : 0,
      // Premise Sentinel (Schema v35): breached/watch premises plus overdue
      // signpost reviews. Zero until the leader pre-registers an assumption.
      premises: (state.premises || []).length ? buildPremiseReport(state, at).totals.attention : 0,
      dynamics: dynamicsAttentionCount(state, at),
      // Structural Capital Allocation (Schema v38): unreviewed portfolio
      // checkpoints, an out-of-sample model failure, and a funded plan running
      // on a model that has not earned a directional reading.
      capital: capitalAttentionCount(state, at),
      // Strategy Coherence (Schema v42): overdue stop-rule verdicts, a say–do
      // gap over convention, strategy-blind work over convention, and active
      // bets that cannot be proven wrong. Attention, not a score of the leader.
      strategy: strategyAttentionCount(state, at),
      // After-action & learning (Schema v43): reviews past the convention, a
      // class repeating while its committed change stayed open, and committed
      // changes parked past the open-change window. Attention, not a grade.
      learning: learningAttentionCount(state, at),
      // Scorecard Integrity (Schema v47): committed scorecards that are modelled
      // to pay mostly for gaming, or that passed their measurement date with
      // nothing recorded. A derived lens: zero until a scorecard is committed.
      measurement: (() => {
        if (!(state.scorecards || []).length) return 0;
        const report = buildMeasurementReport(state, { now: at, metricCostPct: state.settings.measurementMetricCostPct });
        return report.attention.length;
      })(),
      // Early-Warning Watch: alerts promoted by the nominal screening
      // heuristic and still waiting for a human verdict. Suppressed candidates are
      // deliberately not counted here — the badge is attention, not telemetry.
      watch: buildWatchReport(state, at).queue.length,
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
      hiring: hiringSummary(state, { now: at, settings: state.settings }).needsDecision.length,
      // Schema v45: the badge counts critical obligations convention says the
      // leader cannot delegate in the current window. It is deliberately a
      // cheap inventory read, not a full simulation, because the counter runs
      // on every navigation render.
      handover: leaderDemandInventory(state, { now: at, horizonDays: state.settings.continuityHorizonDays }).counts.criticalHeld,
      // ADR-0026: only unresolved rule failures count. A resolved or dismissed
      // receipt is history; the badge is attention, not telemetry.
      propagation: (state.propagationReceipts || [])
        .filter((r) => r && (r.status === 'open' || r.status === 'retried')).length,
      // Schema v50: attention, not telemetry — plans with an overdue
      // checkpoint or a materially under-delivered programme. Derived from the
      // same read model the page renders, so the badge can never disagree.
      fidelity: (() => {
        if (!(state.fidelityPlans || []).length) return 0;
        const report = fidelityPortfolio(state, at);
        return report.counts.overdue + report.counts.underExposed;
      })(),
      // Schema v51: decision-shaped merit signals only (severity 3 and above).
      // Hygiene rows are deliberately excluded so the badge never becomes a
      // permanent, un-actionable number.
      merit: meritAttention(state, at),
      // Schema v52: decision-shaped transition signals only (severity 3 and
      // above). A sole-holder blocker, a failed selection screen, an under-named
      // target, survivor overload and a late hand-over all count; an unpriced
      // exit does not, because it is hygiene rather than a decision.
      transition: transitionAttention(state, at),
      // Schema v53: decision-shaped structural signals only (severity 3 and
      // above). A span breach, an unstable decision queue, a design left
      // uncommitted or un-scored, and concentrated approval authority count;
      // "no reporting lines recorded" does not, because it is setup rather
      // than a decision.
      orgdesign: orgDesignAttention(state, at),
      // Schema v54: decision-shaped information-value signals only (severity 3
      // and above). A buy-information decision waiting to be made, a test that
      // costs more than it can be worth, an overdue investigation and a premise
      // anchoring several decisions all count; an unpriced frame does not,
      // because it is setup rather than a decision.
      // Schema v56 adds leader-calibration signals (LCAL-01..04): overconfidence,
      // drift and verdict-ready events share the voi nav badge because they
      // live under the Information Value terminal's Calibration tab.
      voi: voiAttentionCount(state, at) + lcalAttentionCount(state, at),
      // Schema v55: decision portfolio signals (severity ≥ 3). Coupling,
      // dependency, bottleneck, regret and premise-concentration signals
      // count; an unpriced block does not, because it is setup rather than
      // a decision.
      portfolio: decisionPortfolioAttention(state, at),
      // Schema v57: attention-market signals — items the solver could not buy
      // inside the budget, plus committed plans whose review date has arrived.
      attention: attentionAttentionCount(state, at),
      // Schema v59: signal-path signals — declared channels that reach the leader
      // less than half the time, or that the probe ledger has contradicted.
      signal: signalAttentionCount(state, at),
      wargame: warGameAttentionCount(state, at),
      coupling: couplingAttentionCount(state, at),
      // Schema v62: open concerns that cannot support a plan, overdue reviews
      // and concerns that have gone stale without evidence.
      performance: performanceAttentionCount(state, at),
      // Schema v63: open items below the completion floor, classes sitting on a
      // high abandonment share, ungraded readings and readings that lost to
      // their own base rate.
      survival: survivalAttentionCount(state, at),
      // Schema v58: paused agreements and blocked runs need a human decision.
      autopilot: autopilotAttentionCount(state),
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
              const active = item.route === route || (item.route === 'people' && route === 'person') || (item.route === 'reviews' && route === 'review') || (item.route === 'cases' && route === 'case') || (item.route === 'resilience' && route === 'resilience-detail') || (item.route === 'power' && route === 'power-detail') || (item.route === 'changes' && route === 'change') || (item.route === 'negotiations' && route === 'negotiation') || (item.route === 'finance' && route === 'budget') || (item.route === 'stakeholders' && route === 'stakeholder') || (item.route === 'conflicts' && route === 'conflict') || (item.route === 'hiring' && route === 'hiring-detail');
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
      intake: 'Intake triage',
      comms: 'Comms outbox',
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
      allocation: 'Allocation governor — explore vs exploit',
    load: 'Cognitive Load & Attention Governor',
      scenarios: 'What-if scenarios & sensitivity',
      health: 'Health & pulse',
      cases: 'Operational cases',
      case: state.cases?.find((c) => c.id === seg1)?.title || 'Operational case',
      resilience: 'Operational resilience & continuity',
      'resilience-detail': state.dependencies?.find((d) => d.id === seg1)?.name || 'Operational dependency',
      power: 'Coalition & incentive war room',
      'power-detail': state.powerGames?.find((g) => g.id === seg1)?.title || 'Coalition situation',
      network: 'Influence network intelligence',
      impact: 'Impact ledger — pre-registered studies',
      changes: 'Org design & change',
      orgdesign: 'Structural design — span, coordination & decision latency',
      voi: 'Information value — what is worth finding out before deciding',
      portfolio: 'Decision portfolio — sequencing, coupling and bottleneck analysis',
      performance: 'Performance recovery — due process, evidence and the cost of waiting',
      survival: 'Delivery survival — how long work actually takes, with censoring and competing risks',
      change: state.changes?.find((c) => c.id === seg1)?.title || 'Organizational change',
      negotiations: 'Negotiation workbench',
      negotiation: state.negotiations?.find((n) => n.id === seg1)?.title || 'Negotiation',
      finance: 'Budget & finance',
      budget: state.budgets?.find((b) => b.id === seg1)?.name || 'Budget envelope',
      stakeholders: 'Stakeholder influence register',
      stakeholder: state.stakeholders?.find((s) => s.id === seg1)?.name || 'Stakeholder',
      forecasts: 'Forecast integrity terminal',
      premises: 'Assumption Ledger & Premise Sentinel',
      dynamics: 'Operating system dynamics',
      assurance: 'Automation control room',
      tempo: 'Decision tempo & timing',
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
