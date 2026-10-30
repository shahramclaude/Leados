/**
 * app/views/warGame.js — Strategic War-Game Terminal (Schema v60).
 *
 * The screen is organised around one question no other terminal answers:
 * "If the world changes in these specific ways, how does my entire leadership
 * posture shift?" Every panel exists so a sceptical reader can trace that
 * answer back to the leader's own records.
 *
 *   Games        every declared war game, its scenarios and its status
 *   Scenarios    the selected game's scenarios with their kind and direction
 *   Stress Map   a matrix of strategy bets × scenarios showing gap divergence
 *   Resilience   the composite reading with explicit methodology limits
 *   Method       the frameworks, the conventions and the exact guarantees
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, table, tabs } from '../ui/components.js';
import {
  WARGAME_STATUS_LABELS,
  SCENARIO_KIND_LABELS,
  ADJUSTMENT_DIRECTION_LABELS,
  buildWarGameReport,
  warGameBrief,
  warGameSignals,
} from '../core/domain/warGame.js';

const STATUS_TONE = { draft: 'neutral', committed: 'good', archived: 'neutral' };

function statusBadge(wg) {
  return badge(WARGAME_STATUS_LABELS[wg.status] || wg.status, STATUS_TONE[wg.status] || 'neutral');
}

function kindBadge(scen) {
  return badge(SCENARIO_KIND_LABELS[scen.kind] || scen.kind, scen.direction.includes('negative') ? 'warn' : 'good');
}

function directionLabel(scen) {
  return ADJUSTMENT_DIRECTION_LABELS[scen.direction] || scen.direction;
}

function pctOrDash(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}pp`;
}

function numOrDash(value, suffix = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(1)}${suffix}`;
}

function divergenceTone(value) {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (n > 15) return 'bad';
  if (n > 5) return 'warn';
  if (n < -5) return 'good';
  return '';
}

/**
 * Main render entry point. Called from main.js route handler.
 */
export function renderWarGame(ctx) {
  const { state, api, params, navigate } = ctx;
  const warGames = state.warGames || [];
  const selectedId = params?.game || (warGames[0]?.id || null);
  const selectedGame = warGames.find((wg) => wg.id === selectedId) || null;
  const brief = warGameBrief(state, ctx.now);
  const signals = warGameSignals(state, ctx.now);

  const header = pageHeader(
    'War Games',
    `Stress-test your leadership posture under declared macro-scenarios. ${brief.summary}`,
    [
      stat('Games', brief.totalGames),
      stat('Committed', brief.committedGames),
      stat('Scenarios', brief.totalScenarios),
      stat('Signals', brief.highSeveritySignals, brief.highSeveritySignals > 0 ? 'warn' : ''),
    ],
    {
      action: {
        label: 'Declare war game',
        onClick: () => openWarGameDialog(api, () => navigate('wargame')),
      },
    },
  );

  const gameList = renderGameList(warGames, selectedId, api, navigate);
  const detail = selectedGame ? renderGameDetail(selectedGame, state, ctx) : emptyState('No war game selected', 'Select a war game from the list or declare a new one.');

  return h('div', { className: 'space-y-6' }, [
    header,
    h('div', { className: 'grid grid-cols-12 gap-6' }, [
      h('div', { className: 'col-span-12 md:col-span-4 lg:col-span-3' }, [gameList]),
      h('div', { className: 'col-span-12 md:col-span-8 lg:col-span-9' }, [detail]),
    ]),
  ]);
}

function renderGameList(warGames, selectedId, api, navigate) {
  if (warGames.length === 0) {
    return card('War Games', [
      emptyState('No war games declared', 'A war game is a strategic exercise: you declare plausible macro-scenarios and the system evaluates how your strategy, coalitions, resources and cases shift under each one.'),
    ]);
  }

  const items = warGames.map((wg) => {
    const isSelected = wg.id === selectedId;
    return h('button', {
      key: wg.id,
      className: `w-full text-left px-3 py-2 rounded-lg transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`,
      onClick: () => navigate(`wargame?game=${wg.id}`),
    }, [
      h('div', { className: 'flex items-center justify-between gap-2' }, [
        h('span', { className: 'font-medium text-sm truncate' }, wg.label),
        statusBadge(wg),
      ]),
      h('div', { className: 'text-xs text-gray-500 mt-1' }, [
        `${(wg.scenarios || []).length} scenario(s)`,
        wg.committedAt ? ` · committed ${wg.committedAt.slice(0, 10)}` : '',
      ]),
    ]);
  });

  return card('War Games', items);
}

function renderGameDetail(wg, state, ctx) {
  const { api, navigate } = ctx;
  const isCommitted = wg.status === 'committed';
  const report = isCommitted ? buildWarGameReport(state, wg, ctx.now) : null;

  const tabItems = [
    { key: 'scenarios', label: `Scenarios (${(wg.scenarios || []).length})` },
  ];
  if (isCommitted && report) {
    tabItems.push({ key: 'stress', label: 'Stress Map' });
    tabItems.push({ key: 'resilience', label: 'Resilience' });
  }
  tabItems.push({ key: 'method', label: 'Method' });

  const activeTab = ctx.params?.tab || 'scenarios';

  const actions = [];
  if (wg.status === 'draft') {
    actions.push({ label: 'Edit', onClick: () => openWarGameEditDialog(wg, api, () => navigate(`wargame?game=${wg.id}`)) });
    actions.push({ label: 'Commit', onClick: () => commitGame(wg, api, () => navigate(`wargame?game=${wg.id}`)) });
    actions.push({ label: 'Delete', onClick: () => deleteGame(wg, api, () => navigate('wargame')) });
  } else if (wg.status === 'committed') {
    actions.push({ label: 'Archive', onClick: () => retireGame(wg, api, () => navigate(`wargame?game=${wg.id}`)) });
  }

  const headerCard = card(wg.label, [
    h('div', { className: 'flex items-center gap-3 mb-4' }, [
      statusBadge(wg),
      h('span', { className: 'text-sm text-gray-500' }, `${(wg.scenarios || []).length} scenario(s) · ${wg.horizonDays}-day horizon`),
    ]),
    wg.purpose ? h('p', { className: 'text-sm text-gray-700 mb-4' }, wg.purpose) : null,
    h('div', { className: 'flex gap-2 flex-wrap' }, actions.map((a) =>
      h('button', { className: 'btn btn-sm btn-outline', onClick: a.onClick }, a.label),
    )),
  ].filter(Boolean));

  const tabContent = activeTab === 'stress' && report
    ? renderStressMap(report, wg)
    : activeTab === 'resilience' && report
      ? renderResilience(report)
      : activeTab === 'method'
        ? renderMethod()
        : renderScenarios(wg, api, ctx);

  return h('div', { className: 'space-y-6' }, [
    headerCard,
    tabs(tabItems, activeTab, (key) => navigate(`wargame?game=${wg.id}&tab=${key}`)),
    tabContent,
  ]);
}

function renderScenarios(wg, api, ctx) {
  const scenarios = wg.scenarios || [];
  if (scenarios.length === 0) {
    return card('Scenarios', [
      emptyState('No scenarios yet', 'Add scenarios to stress-test your leadership posture. Each scenario declares a macro-shock and its direction.'),
      wg.status === 'draft'
        ? h('button', { className: 'btn btn-primary mt-4', onClick: () => openScenarioDialog(wg.id, api, ctx) }, 'Add first scenario')
        : null,
    ]);
  }

  const rows = scenarios.map((scen) => [
    h('div', { className: 'flex items-center gap-2' }, [kindBadge(scen)]),
    h('div', {}, [
      h('div', { className: 'font-medium text-sm' }, scen.label),
      scen.description ? h('div', { className: 'text-xs text-gray-500 mt-1' }, scen.description.slice(0, 100)) : null,
    ]),
    h('div', { className: 'text-xs text-gray-500' }, directionLabel(scen)),
    wg.status === 'draft'
      ? h('button', { className: 'btn btn-sm btn-outline text-red-600', onClick: () => removeScenario(wg.id, scen.id, api, ctx) }, 'Remove')
      : h('span', {}),
  ]);

  return card('Scenarios', [
    table(['Kind', 'Scenario', 'Direction', ''], rows),
    wg.status === 'draft'
      ? h('button', { className: 'btn btn-primary mt-4', onClick: () => openScenarioDialog(wg.id, api, ctx) }, 'Add scenario')
      : null,
  ]);
}

function renderStressMap(report, wg) {
  const scenarios = report.scenarioReadings || [];
  if (scenarios.length === 0) {
    return card('Stress Map', [emptyState('No scenario readings', 'Commit the war game to evaluate scenarios.')]);
  }

  // Show strategy gap divergence
  const gapRows = scenarios.map((r) => [
    h('div', { className: 'font-medium text-sm' }, r.scenarioLabel),
    kindBadge(r),
    h('div', { className: `font-mono text-sm ${divergenceTone(r.gapDivergence) === 'bad' ? 'text-red-600' : divergenceTone(r.gapDivergence) === 'good' ? 'text-green-600' : ''}` }, pctOrDash(r.gapDivergence)),
    h('div', { className: 'text-sm' }, r.reallocationPct != null ? `${r.reallocationPct}%` : '—'),
    h('div', { className: 'text-sm' }, `${r.coalitionShifts.length}`),
    h('div', { className: 'text-sm' }, `${r.caseSeverityShifts.length}`),
  ]);

  return card('Strategy Stress Under Scenarios', [
    banner('info', 'Each row shows how one scenario shifts your leadership posture. Gap divergence is the change in say-do gap (positive = worse). Reallocation is the percentage of attention items that change hands. Coalition shifts count power games where winning coalitions change. Case shifts count open cases whose severity changes by ≥0.5.'),
    table(['Scenario', 'Kind', 'Gap Δ', 'Reallocation', 'Coalition Shifts', 'Case Shifts'], gapRows),
  ]);
}

function renderResilience(report) {
  if (!report.composite) {
    return card('Resilience', [
      banner('warn', 'Below three scenarios the page withholds a composite. Declare at least three scenarios to see the aggregated resilience reading.'),
    ]);
  }

  const c = report.composite;
  return card('Resilience Composite', [
    banner('info', 'This composite aggregates observable divergences across scenarios. It is not a single "resilience score" — it is a summary of what changed, with explicit methodology.'),
    h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 mt-4' }, [
      stat('Avg Gap Δ', pctOrDash(c.avgGapDivergence)),
      stat('Avg Reallocation', c.avgReallocationPct != null ? `${c.avgReallocationPct}%` : '—'),
      stat('Coalition Breaks', c.coalitionBreakCount),
      stat('Cases Worsened', c.caseWorsenCount),
    ]),
    h('div', { className: 'mt-4 text-sm text-gray-600' }, `Based on ${c.scenarioCount} scenario(s). Methodology: arithmetic mean of observable divergences. No probability is assigned to any scenario; the composite does not claim to predict which scenario will occur.`),
  ]);
}

function renderMethod() {
  return card('Method & Guarantees', [
    h('div', { className: 'prose prose-sm max-w-none' }, [
      h('h3', {}, 'Frameworks'),
      h('ul', {}, [
        h('li', {}, 'Schoemaker (1995) Strategic Scenario Planning: scenarios are declared external shocks with explicit plausibility.'),
        h('li', {}, 'Meadows (2008) Leverage Points: each scenario declares which system parameter it shifts.'),
        h('li', {}, 'Tsebelis (2002) Veto Players: coalition stability is re-checked under each scenario.'),
        h('li', {}, 'Total Variation Distance: say-do gap divergence is a distribution divergence, not an invented score.'),
      ]),
      h('h3', {}, 'What is computed'),
      h('ul', {}, [
        h('li', {}, 'Strategy coherence: say-do gap under each projected state vs. baseline.'),
        h('li', {}, 'Attention market: which obligations change hands under resource shifts.'),
        h('li', {}, 'Coalition stability: which power games see winning coalitions change.'),
        h('li', {}, 'Case severity: which open cases worsen by ≥0.5.'),
      ]),
      h('h3', {}, 'What is not computed'),
      h('ul', {}, [
        h('li', {}, 'No probability is assigned to any scenario. They are declared, not predicted.'),
        h('li', {}, 'No records are created or destroyed by projection. Existing records are adjusted within declared ranges.'),
        h('li', {}, 'Below three scenarios the composite is withheld.'),
        h('li', {}, 'Scenario adjustments are bounded multipliers, not causal claims.'),
      ]),
    ]),
  ]);
}

// ---- Dialogs and actions (simplified for this session) ----

function openWarGameDialog(api, onDone) {
  const label = prompt('War game name:');
  if (!label || label.trim().length < 3) return;
  const purpose = prompt('Purpose (optional):') || '';
  const horizonDays = prompt('Horizon (days, 7-365):', '90') || '90';
  const result = api.addWarGame({ label: label.trim(), purpose: purpose.trim(), horizonDays: Number(horizonDays) });
  if (result.ok) {
    toast('War game declared');
    onDone();
  } else {
    toast(result.error || 'Could not create war game');
  }
}

function openWarGameEditDialog(wg, api, onDone) {
  const label = prompt('War game name:', wg.label);
  if (!label || label.trim().length < 3) return;
  const result = api.updateWarGame(wg.id, { label: label.trim() });
  if (result.ok) {
    toast('War game updated');
    onDone();
  } else {
    toast(result.error || 'Could not update war game');
  }
}

function commitGame(wg, api, onDone) {
  if (!confirm(`Commit "${wg.label}"? This evaluates all ${wg.scenarios.length} scenario(s) and creates typed links and decisions.`)) return;
  const result = api.commitWarGame(wg.id);
  if (result.ok) {
    toast('War game committed');
    onDone();
  } else {
    toast(result.error || 'Could not commit war game');
  }
}

function retireGame(wg, api, onDone) {
  if (!confirm(`Archive "${wg.label}"?`)) return;
  const result = api.retireWarGame(wg.id);
  if (result.ok) {
    toast('War game archived');
    onDone();
  } else {
    toast(result.error || 'Could not archive war game');
  }
}

function deleteGame(wg, api, onDone) {
  if (!confirm(`Delete "${wg.label}"? This cannot be undone.`)) return;
  const result = api.deleteWarGame(wg.id);
  if (result.ok) {
    toast('War game deleted');
    onDone();
  } else {
    toast(result.error || 'Could not delete war game');
  }
}

function openScenarioDialog(warGameId, api, ctx) {
  const label = prompt('Scenario name:');
  if (!label || label.trim().length < 3) return;
  const kind = prompt('Kind (demand-shift, budget-cut, key-person-loss, regulation-change, competitor-move, supply-disruption):', 'demand-shift') || 'demand-shift';
  const direction = prompt('Direction (severe-negative, moderate-negative, mild-negative, mild-positive, moderate-positive, severe-positive):', 'moderate-negative') || 'moderate-negative';
  const description = prompt('Description (optional):') || '';
  const result = api.addWarGameScenario(warGameId, { label: label.trim(), kind, direction, description: description.trim() });
  if (result.ok) {
    toast('Scenario added');
    ctx.navigate(`wargame?game=${warGameId}`);
  } else {
    toast(result.error || 'Could not add scenario');
  }
}

function removeScenario(warGameId, scenarioId, api, ctx) {
  if (!confirm('Remove this scenario?')) return;
  const result = api.removeWarGameScenario(warGameId, scenarioId);
  if (result.ok) {
    toast('Scenario removed');
    ctx.navigate(`wargame?game=${warGameId}`);
  } else {
    toast(result.error || 'Could not remove scenario');
  }
}
