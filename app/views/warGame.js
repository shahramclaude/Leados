/**
 * app/views/warGame.js — Strategic War-Game Terminal (`#/wargame`, Schema v60).
 *
 * Four accessible panels over declared strategic exercises:
 *   Scenarios    Declared macro-scenarios with kind, direction and scope
 *   Stress map   Projected say–do gap, attention reallocation, coalition and case shifts
 *   Resilience   Aggregate divergence reading (withheld below 3 scenarios)
 *   Method       Frameworks (Schoemaker, Meadows, Tsebelis), bounds and refusals
 */

import { h, openModal, confirmDialog, toast, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState } from '../ui/components.js';
import {
  WARGAME_STATUS_LABELS,
  SCENARIO_KIND_KEYS,
  SCENARIO_KIND_LABELS,
  ADJUSTMENT_DIRECTIONS,
  ADJUSTMENT_DIRECTION_LABELS,
  buildWarGameReport,
  warGameBrief,
  warGameSignals,
} from '../core/domain/warGame.js';

const STATUS_TONE = { draft: 'neutral', committed: 'good', archived: 'neutral' };

function statusBadge(wg) {
  return badge(WARGAME_STATUS_LABELS[wg.status] || wg.status, STATUS_TONE[wg.status] || 'neutral');
}

function directionLabel(scen) {
  return ADJUSTMENT_DIRECTION_LABELS[scen.direction] || scen.direction;
}

function kindBadge(scen) {
  return badge(SCENARIO_KIND_LABELS[scen.kind] || scen.kind, 'neutral');
}

function pctOrDash(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n}pp`;
}

function divergenceTone(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'neutral';
  if (n > 15) return 'bad';
  if (n > 5) return 'warn';
  if (n < -5) return 'good';
  return 'neutral';
}

function navWarGame(ctx, gameId, tab = 'scenarios') {
  const q = new URLSearchParams();
  if (gameId) q.set('game', gameId);
  if (tab && tab !== 'scenarios') q.set('tab', tab);
  const qs = q.toString();
  ctx.navigate(qs ? `#/wargame?${qs}` : '#/wargame');
}

export function renderWarGame(ctx) {
  const { state, api } = ctx;
  const warGames = Array.isArray(state.warGames) ? state.warGames : [];
  const requestedGame = ctx.query?.get('game') || null;
  const selectedGame = (requestedGame && warGames.find((wg) => wg && wg.id === requestedGame))
    || warGames[0]
    || null;
  const selectedId = selectedGame ? selectedGame.id : null;
  const brief = warGameBrief(state, ctx.now);
  const signals = warGameSignals(state, ctx.now);

  const header = pageHeader({
    eyebrow: 'STRATEGIC STRESS REHEARSAL',
    title: 'War Games',
    subtitle: `Stress-test declared strategy bets, coalitions, attention and operational cases under macro-scenarios. ${brief.summary}`,
    actions: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => openWarGameDialog(ctx),
      }, 'Declare war game'),
    ],
  });

  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Games', value: brief.totalGames, hint: `${brief.draftGames} draft` }),
    stat({ label: 'Committed', value: brief.committedGames, hint: 'frozen posture readings' }),
    stat({ label: 'Scenarios', value: brief.totalScenarios, hint: 'across committed games' }),
    stat({
      label: 'Stress signals',
      value: signals.length,
      hint: `${brief.highSeveritySignals} high-severity`,
      tone: brief.highSeveritySignals > 0 ? 'warn' : '',
    }),
  );

  const selectorCard = warGames.length === 0
    ? card({
        title: 'Declared exercises',
        subtitle: 'Up to 12 macro-scenarios per war game; composite withheld below 3 scenarios.',
        body: emptyState({
          title: 'No war games declared yet',
          body: 'Declare a strategic war game with plausible external shocks to project how your strategy say–do gap, weekly attention allocation, stakeholder coalitions and open cases respond.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openWarGameDialog(ctx) }, 'Declare first war game'),
        }),
      })
    : card({
        title: 'Declared exercises',
        subtitle: 'Select an exercise to inspect or edit its scenario set.',
        body: h('div', { class: 'row-gap', role: 'list', 'aria-label': 'Declared war games' },
          ...warGames.map((wg) => h('button', {
            type: 'button',
            role: 'listitem',
            class: `btn ${wg.id === selectedId ? 'btn-primary' : 'btn-ghost'}`,
            'aria-pressed': wg.id === selectedId ? 'true' : 'false',
            onClick: () => navWarGame(ctx, wg.id, ctx.query?.get('tab') || 'scenarios'),
          }, `${wg.label} (${(wg.scenarios || []).length})`)),
        ),
      });

  return h('div', { class: 'page view-stack' },
    header,
    stats,
    selectorCard,
    selectedGame ? renderGameDetail(selectedGame, state, ctx, api) : null,
  );
}

function renderGameDetail(wg, state, ctx, api) {
  const isCommitted = wg.status === 'committed';
  const report = isCommitted ? buildWarGameReport(state, wg, ctx.now) : null;
  const tabItems = [{ key: 'scenarios', label: 'Scenarios', count: (wg.scenarios || []).length }];
  if (isCommitted && report) {
    tabItems.push({ key: 'stress', label: 'Stress map', count: report.scenarioReadings.length });
    tabItems.push({ key: 'resilience', label: 'Resilience' });
  }
  tabItems.push({ key: 'method', label: 'Method' });

  const requestedTab = ctx.query?.get('tab') || 'scenarios';
  const activeTab = tabItems.some((t) => t.key === requestedTab) ? requestedTab : 'scenarios';

  const cardActions = [statusBadge(wg)];
  if (wg.status === 'draft') {
    cardActions.push(
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openScenarioDialog(ctx, wg) }, 'Add scenario'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openWarGameDialog(ctx, wg) }, 'Edit'),
      h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => confirmCommitGame(ctx, wg) }, 'Commit & run'),
      h('button', { class: 'btn btn-small btn-danger', type: 'button', onClick: () => confirmDeleteGame(ctx, wg) }, 'Delete'),
    );
  } else if (wg.status === 'committed') {
    cardActions.push(
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => confirmRetireGame(ctx, wg) }, 'Archive'),
    );
  }

  const panelBody = activeTab === 'stress' && report
    ? renderStressMap(report)
    : activeTab === 'resilience' && report
      ? renderResilience(report)
      : activeTab === 'method'
        ? renderMethod()
        : renderScenarios(ctx, wg, api);

  return h('div', { class: 'view-stack' },
    card({
      title: wg.label,
      subtitle: `${(wg.scenarios || []).length} scenario(s) · ${wg.horizonDays}-day horizon${wg.committedAt ? ` · committed ${wg.committedAt.slice(0, 10)}` : ''}`,
      actions: cardActions,
      body: wg.purpose
        ? h('p', { class: 'prose small' }, wg.purpose)
        : h('p', { class: 'muted small' }, 'No purpose note recorded for this exercise.'),
    }),
    tabs({
      items: tabItems,
      active: activeTab,
      ariaLabel: 'War game views',
      onSelect: (key) => navWarGame(ctx, wg.id, key),
    }),
    panelBody,
  );
}

function renderScenarios(ctx, wg, api) {
  const scenarios = wg.scenarios || [];
  if (!scenarios.length) {
    return card({
      title: 'Scenarios',
      subtitle: 'Declare at least one scenario to commit; declare three or more to unlock the composite reading.',
      body: emptyState({
        title: 'No scenarios in this exercise',
        body: 'Each scenario names an external shock (demand shift, budget contraction, key-person loss, regulation change, competitor move, or supply disruption) and a bounded severity direction.',
        action: wg.status === 'draft'
          ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openScenarioDialog(ctx, wg) }, 'Add first scenario')
          : null,
      }),
    });
  }
  return card({
    title: 'Declared scenarios',
    subtitle: 'Scenarios adjust existing parameters in a disposable copy without fabricating records.',
    body: table({
      caption: `Scenarios in ${wg.label}`,
      rows: scenarios,
      columns: [
        { label: 'Scenario', render: (s) => h('div', null, h('strong', null, s.label), s.description ? h('div', { class: 'muted small' }, s.description) : null) },
        { label: 'Kind', render: (s) => kindBadge(s) },
        { label: 'Direction', render: (s) => directionLabel(s) },
        {
          label: 'Actions',
          render: (s) => wg.status === 'draft'
            ? h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                onClick: () => confirmDialog({
                  title: `Remove scenario “${s.label}”?`,
                  message: 'This removes the scenario from the draft war game.',
                  confirmLabel: 'Remove',
                  danger: true,
                  onConfirm: () => {
                    const res = api.removeWarGameScenario(wg.id, s.id);
                    if (res.ok) toast('Scenario removed', 'good');
                    else toast(res.error || 'Could not remove scenario', 'bad');
                  },
                }),
              }, 'Remove')
            : h('span', { class: 'muted small' }, 'Locked'),
        },
      ],
    }),
  });
}

function renderStressMap(report) {
  const scenarios = report.scenarioReadings || [];
  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'Deterministic cross-module stress projection',
      body: 'Gap Δ measures change in strategy say–do divergence (positive = worse). Reallocation measures the share of weekly bought obligations that change hands. Coalition shifts count power games whose winning-coalition count changes. Case shifts count open cases shifting by ≥0.5 severity.',
    }),
    card({
      title: 'Posture shift by scenario',
      body: table({
        caption: 'Scenario stress readings',
        rows: scenarios,
        emptyMessage: 'Commit the war game to evaluate scenarios.',
        columns: [
          { label: 'Scenario', render: (r) => h('strong', null, r.scenarioLabel) },
          { label: 'Kind', render: (r) => kindBadge(r) },
          { label: 'Say–do gap Δ', render: (r) => badge(pctOrDash(r.gapDivergence), divergenceTone(r.gapDivergence)) },
          { label: 'Attention reallocation', render: (r) => r.reallocationPct != null ? `${r.reallocationPct}%` : '—' },
          { label: 'Coalition shifts', render: (r) => String(r.coalitionShifts.length) },
          { label: 'Case shifts', render: (r) => String(r.caseSeverityShifts.length) },
        ],
      }),
    }),
  );
}

function renderResilience(report) {
  if (!report.composite) {
    return banner({
      tone: 'caution',
      title: 'Composite withheld below three scenarios',
      body: 'Declare and commit at least three distinct scenarios before reading an across-scenario summary. Averaging one or two scenarios would disguise single-shock sensitivity as general resilience.',
    });
  }
  const c = report.composite;
  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'Observable divergence summary — not a probability forecast',
      body: `Computed across ${c.scenarioCount} declared scenarios with equal weight. No probability is assigned to any scenario.`,
    }),
    h('div', { class: 'stat-row' },
      stat({ label: 'Mean say–do gap Δ', value: pctOrDash(c.avgGapDivergence) }),
      stat({ label: 'Mean reallocation', value: c.avgReallocationPct != null ? `${c.avgReallocationPct}%` : '—' }),
      stat({ label: 'Coalition breaks', value: c.coalitionBreakCount, tone: c.coalitionBreakCount > 0 ? 'warn' : '' }),
      stat({ label: 'Cases worsened', value: c.caseWorsenCount, tone: c.caseWorsenCount > 0 ? 'warn' : '' }),
    ),
  );
}

function renderMethod() {
  return card({
    title: 'Method, frameworks & explicit refusals',
    subtitle: 'Why scenarios are declared rather than assigned invented probabilities.',
    body: h('div', { class: 'prose small' },
      h('h3', null, 'Named frameworks'),
      h('ul', null,
        h('li', null, 'Schoemaker (1995) Strategic Scenario Planning — scenarios bound plausible external regimes without pretending to know point probabilities.'),
        h('li', null, 'Meadows (2008) Leverage Points — each scenario perturbs explicit capacity, budget, severity or coalition parameters on a disposable copy.'),
        h('li', null, 'Tsebelis (2002) Veto Players & Banzhaf power — coalition stability re-evaluates winning-coalition counts under stance stress.'),
        h('li', null, 'Total Variation / Say–Do Divergence — strategy drift compares declared bet shares against projected execution coverage.'),
      ),
      h('h3', null, 'Refusals'),
      h('ul', null,
        h('li', null, 'No probability is invented for macro-scenarios; the composite is withheld below 3 scenarios.'),
        h('li', null, 'Projection mutates a disposable clone only; committed follow-through runs strictly through RULE-WG-01..04.'),
        h('li', null, 'Confidential conflicts and anonymous pulses are never read.'),
      ),
    ),
  });
}

function openWarGameDialog(ctx, existing = null) {
  const form = buildForm([
    { name: 'label', label: 'Exercise name', required: true, value: existing?.label || '', placeholder: 'e.g., Q1 Runway & Attrition Rehearsal' },
    { name: 'purpose', label: 'Purpose / strategic question', type: 'textarea', rows: 3, value: existing?.purpose || '' },
    { name: 'horizonDays', label: 'Horizon (days, 7–365)', type: 'number', value: String(existing?.horizonDays ?? 90) },
  ]);
  const modal = openModal({
    title: existing ? 'Edit war game' : 'Declare war game',
    description: 'Name the strategic stress exercise and horizon. Scenarios are added before committing.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const data = form.read();
          const payload = {
            label: String(data.label || '').trim(),
            purpose: String(data.purpose || '').trim(),
            horizonDays: Number(data.horizonDays) || 90,
          };
          const res = existing
            ? ctx.api.updateWarGame(existing.id, payload)
            : ctx.api.addWarGame(payload);
          if (!res.ok) {
            toast(res.error || 'Could not save war game.', 'bad');
            return;
          }
          modal.close();
          toast(existing ? 'War game updated' : 'War game declared', 'good');
          navWarGame(ctx, existing ? existing.id : res.id);
        },
      }, existing ? 'Save changes' : 'Declare'),
    ],
  });
}

function openScenarioDialog(ctx, wg) {
  const form = buildForm([
    { name: 'label', label: 'Scenario name', required: true, placeholder: 'e.g., 20% enterprise renewal freeze' },
    {
      name: 'kind',
      label: 'Shock kind',
      type: 'select',
      value: SCENARIO_KIND_KEYS[0],
      options: SCENARIO_KIND_KEYS.map((k) => ({ value: k, label: SCENARIO_KIND_LABELS[k] || k })),
    },
    {
      name: 'direction',
      label: 'Magnitude & direction',
      type: 'select',
      value: 'moderate-negative',
      options: ADJUSTMENT_DIRECTIONS.map((d) => ({ value: d, label: ADJUSTMENT_DIRECTION_LABELS[d] || d })),
    },
    { name: 'description', label: 'Notes / trigger signposts', type: 'textarea', rows: 2, value: '' },
  ]);
  const modal = openModal({
    title: `Add scenario to “${wg.label}”`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const data = form.read();
          const res = ctx.api.addWarGameScenario(wg.id, {
            label: String(data.label || '').trim(),
            kind: data.kind,
            direction: data.direction,
            description: String(data.description || '').trim(),
          });
          if (!res.ok) {
            toast(res.error || 'Could not add scenario.', 'bad');
            return;
          }
          modal.close();
          toast('Scenario added', 'good');
          navWarGame(ctx, wg.id, 'scenarios');
        },
      }, 'Add scenario'),
    ],
  });
}

function confirmCommitGame(ctx, wg) {
  confirmDialog({
    title: `Commit “${wg.label}”?`,
    message: `Evaluates ${(wg.scenarios || []).length} scenario(s) and runs RULE-WG-01..04 to link stressed bets/cases and open bounded follow-through.`,
    confirmLabel: 'Commit war game',
    onConfirm: () => {
      const res = ctx.api.commitWarGame(wg.id);
      if (!res.ok) {
        toast(res.error || 'Could not commit war game.', 'bad');
        return;
      }
      toast('War game committed', 'good');
      navWarGame(ctx, wg.id, 'stress');
    },
  });
}

function confirmRetireGame(ctx, wg) {
  confirmDialog({
    title: `Archive “${wg.label}”?`,
    message: 'Archived exercises remain in audit history and stop emitting active signals.',
    confirmLabel: 'Archive',
    onConfirm: () => {
      const res = ctx.api.retireWarGame(wg.id);
      if (res.ok) toast('War game archived', 'good');
      else toast(res.error || 'Could not archive war game.', 'bad');
    },
  });
}

function confirmDeleteGame(ctx, wg) {
  confirmDialog({
    title: `Delete “${wg.label}”?`,
    message: 'Removes this draft exercise from the workspace.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => {
      const res = ctx.api.deleteWarGame(wg.id);
      if (res.ok) {
        toast('War game deleted', 'good');
        navWarGame(ctx, null);
      } else {
        toast(res.error || 'Could not delete war game.', 'bad');
      }
    },
  });
}
