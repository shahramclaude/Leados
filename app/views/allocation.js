/**
 * app/views/allocation.js — the Allocation Governor (`#/allocation`).
 *
 * Session 51. Four tabs in the order a leader thinks about allocation:
 *   Mix        → where funded effort sits now, and whether recent funding
 *                behaviour is starving exploration (March 1991)
 *   Arms       → what each ambition horizon has actually returned per
 *                person-day, learned from settled bets (UCB1, Auer et al.)
 *   Candidates → the exploratory queue waiting for a funding call, plus the
 *                unclassified work the mix cannot see yet
 *   Policy     → the exploration floor, the look-back window and the pause
 *                switch — conventions the leader owns, in plain language
 *
 * Every mutation goes through the validated `ctx.api`; this file renders and
 * explains, it does not decide. Propagation counts surfaced in toasts come
 * from the store's post-commit results, so the leader sees what one click
 * caused across modules (decisions, delegations, 1:1 prompts).
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import { PORTFOLIO_HORIZONS, PORTFOLIO_HORIZON_LABELS } from '../core/domain/capacity.js';
import {
  ALLOC_MIN_ARM_N,
  allocationBrief,
  allocationSignals,
  buildAllocationReport,
} from '../core/domain/allocation.js';

const TABS = [
  { key: 'mix', label: 'Mix' },
  { key: 'arms', label: 'Learned arms' },
  { key: 'candidates', label: 'Candidates' },
  { key: 'policy', label: 'Policy' },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

function money(n) {
  return n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US');
}

function propagationToast(prefix, res) {
  const n = Array.isArray(res?.propagations) ? res.propagations.length : 0;
  toast(n ? `${prefix} ${n} follow-up${n === 1 ? '' : 's'} propagated automatically (see Signals).` : prefix, 'good');
}

/* ------------------------------------------------------------------ tabs */

function mixTab(ctx, report) {
  const f = report.fundedFlow;
  const mixRows = report.currentMix.map((m) => h('div', { class: 'view-stack', style: 'gap:2px' },
    h('div', null, kv(m.label, `${m.expectedDays}d · ${m.items} item(s)${m.sharePct === null ? '' : ` · ${m.sharePct}%`}`)),
    progressBar(m.sharePct === null ? 0 : m.sharePct, { label: `${m.label} share of funded expected effort`, tone: m.horizon === 'unclassified' ? 'warn' : 'neutral' })));

  const flowBody = f.explorationSharePct === null
    ? h('p', { class: 'muted' }, `Not enough classified funded effort in the last ${f.windowDays} days to measure the exploratory share (${f.decisions} funding decision(s) in window). Fund work with horizons classified and this gauge comes alive.`)
    : h('div', { class: 'view-stack' },
      h('div', null, kv('Exploratory share of recently funded effort', `${f.explorationSharePct}% (floor ${f.floorPct}%)`)),
      progressBar(f.explorationSharePct, { label: 'Exploratory share of recently funded classified effort', tone: f.starvation ? 'bad' : 'good' }),
      h('p', { class: 'muted small' }, `${f.decisions} funding decision(s) since ${f.windowStart}: core ${f.daysByHorizon.core}d · adjacent ${f.daysByHorizon.adjacent}d · exploratory ${f.daysByHorizon.exploratory}d of expected effort.`
        + (f.unclassifiedDays > 0 ? ` ${f.unclassifiedDays}d unclassified is excluded from the share.` : '')
        + (f.reserveDaysExcluded > 0 ? ` ${f.reserveDaysExcluded}d of incident reserves excluded — obligations are not allocation choices.` : '')
        + (f.starvation ? ` Restoring the floor needs about ${f.starvationDebtDays} exploratory person-days.` : '')));

  return h('div', { class: 'view-stack' },
    card({
      title: 'Where funded effort sits now',
      subtitle: 'Expected person-days of open funded work, by ambition horizon (Nagji & Tuff). Unclassified work is shown, not guessed.',
      body: h('div', { class: 'view-stack' }, ...mixRows),
    }),
    card({
      title: 'Recent funding behaviour',
      subtitle: 'March (1991): exploitation drives out exploration quietly. This gauge watches what you actually funded, not what you intended.',
      body: flowBody,
    }),
    card({
      title: 'How to read this terminal',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, 'A leadership team allocates its scarcest resource — person-days — the way an investor allocates capital. Core work optimises what exists (reliable returns), adjacent work extends into nearby ground, and exploratory work buys options on a future the current business cannot see. The failure mode is not picking a bad bet; it is funding only core work until the environment moves — the success trap.'),
        h('p', { class: 'small' }, 'The Governor holds two honest lines: a floor on the exploratory share of new funding (Policy tab), and a learning table of what each horizon has actually returned per person-day (Arms tab), computed only from settled work whose actuals you recorded. Below five settled bets an arm shows counts only — no return is invented.')),
    }));
}

function armsTab(ctx, report) {
  const blocks = report.armsByCurrency.map((block) => {
    const rows = block.arms.map((arm) => ({
      ...arm,
      className: block.leader && block.leader.horizon === arm.horizon ? 'row-highlight' : '',
    }));
    return card({
      title: `${block.currency} — settled returns per person-day`,
      subtitle: `${block.totalObservations} settled observation(s). Rewards are recorded delivered value ÷ recorded effort; unsettled or unrecorded work never enters the means.`,
      body: h('div', { class: 'view-stack' },
        table({
          caption: `Learned allocation arms in ${block.currency}`,
          columns: [
            { label: 'Horizon', render: (r) => r.label },
            { label: 'Settled bets', render: (r) => String(r.n) },
            { label: 'Mean / day', render: (r) => (r.meanReward === null ? '—' : money(r.meanReward)) },
            { label: 'Median / day', render: (r) => (r.medianReward === null ? '—' : money(r.medianReward)) },
            { label: 'Exploration bonus', render: (r) => (r.explorationBonus === null ? '—' : money(r.explorationBonus)) },
            { label: 'UCB index', render: (r) => (r.ucb === null ? '—' : h('strong', null, money(r.ucb))) },
            {
              label: 'Verdict',
              render: (r) => (r.verdict === 'learned'
                ? badge(block.leader && block.leader.horizon === r.horizon ? 'Next marginal day' : 'Learned', block.leader && block.leader.horizon === r.horizon ? 'good' : 'info')
                : r.verdict === 'counts-only'
                  ? badge(`Counts only (n<${ALLOC_MIN_ARM_N})`, 'warn')
                  : badge('No settled bets', 'neutral')),
            },
          ],
          rows,
          emptyMessage: 'No settled evidence in this currency yet.',
        }),
        block.leader
          ? h('p', { class: 'small' }, `Next marginal person-day in ${block.currency}: ${PORTFOLIO_HORIZON_LABELS[block.leader.horizon]} (UCB ${money(block.leader.ucb)}/day).${block.leader.singleArm ? ' Only one arm has enough evidence, so this is not yet a comparison.' : ''}`)
          : null,
        block.hindsightRegret !== null
          ? h('p', { class: 'muted small' }, `Hindsight regret vs the best learned arm: ${block.currency} ${money(block.hindsightRegret)} across settled effort — a learning diagnostic, not a loss figure. Yesterday's funding paid for today's knowledge.`)
          : null),
    });
  });

  const evidenceBody = report.missingEvidence.length
    ? h('div', { class: 'view-stack' },
      ...report.missingEvidence.map((m) => h('p', { class: 'small' }, `“${m.title}” (${m.horizon}, completed ${m.completedOn || 'date not recorded'}) — `, h('a', { href: '#/capacity' }, 'record actuals in Capacity & flow'))),
      h('p', { class: 'muted small' }, 'Until actuals are recorded, these settled bets are excluded from every statistic above — never scored as zero.'))
    : h('p', { class: 'muted small' }, 'Every settled, classified bet has recorded actuals. The learning loop is closed.');

  return h('div', { class: 'view-stack' },
    ...(blocks.length ? blocks : [emptyState({
      icon: '⚖',
      title: 'No settled evidence yet',
      body: 'Arms learn from delivered portfolio work with recorded actual effort and value. Complete an item in Capacity & flow, record its actuals, and the first (counts-only) observations appear here.',
    })]),
    card({ title: 'Settled without an outcome — the evidence debt', body: evidenceBody }),
    card({
      title: 'What the UCB index means, in one paragraph',
      body: h('p', { class: 'small' }, 'UCB1 (Auer, Cesa-Bianchi & Fischer, 2002) scores each horizon as its average settled return plus an exploration bonus that grows when the horizon has been tried rarely: bonus = dispersion × √(2·ln(total settled bets) ÷ bets on this horizon). A rarely-tried horizon keeps a wide bonus until evidence replaces it — that is optimism in the face of uncertainty, priced. The theoretically optimal Gittins index needs reward distributions and a discount rate you cannot honestly supply, so LeadOS uses the approximation you can audit by hand.'),
    }));
}

function candidatesTab(ctx, report) {
  const candidateRows = report.candidates.map((c) => ({ ...c }));
  const candidateTable = candidateRows.length
    ? table({
      caption: 'Exploratory candidates awaiting a funding decision',
      columns: [
        { label: 'Exploratory bet', render: (r) => `“${r.title}”` },
        { label: 'Currency', render: (r) => r.currency },
        { label: '~Effort', render: (r) => `${r.expectedEffortDays}d` },
        { label: 'Value density / day', render: (r) => (r.valueDensity === null ? 'not estimated' : money(r.valueDensity)) },
        { label: 'Status', render: (r) => badge(r.decision === 'deferred' ? 'Deferred' : 'Undecided', 'warn') },
        { label: 'Fund it', render: () => h('a', { class: 'btn btn-small btn-ghost', href: '#/capacity' }, 'Decide in Capacity') },
      ],
      rows: candidateRows,
    })
    : emptyState({
      icon: '◇',
      title: 'No exploratory candidates queued',
      body: 'Exploration cannot be funded from an empty queue. Add planned work in Capacity & flow and classify it as Exploratory; it will wait for its funding call here.',
    });

  const classifyRows = report.unclassifiedOpen.slice(0, 20).map((u) => h('div', { class: 'view-stack', style: 'gap:2px' },
    h('label', { class: 'small' },
      `“${u.title}” — ~${u.expectedEffortDays}d, ${u.decision}. `,
      h('select', {
        'aria-label': `Classify ${u.title}`,
        onChange: (e) => {
          const res = ctx.api.classifyPortfolioHorizon(u.id, e.target.value || null);
          if (res.ok) { propagationToast(`Classified “${u.title}”.`, res); ctx.refresh(); } else toast(res.error, 'bad');
        },
      },
      h('option', { value: '' }, 'Unclassified — not measured'),
      ...PORTFOLIO_HORIZONS.map((hz) => h('option', { value: hz }, PORTFOLIO_HORIZON_LABELS[hz]))))));

  return h('div', { class: 'view-stack' },
    card({
      title: 'Exploratory queue',
      subtitle: 'Ranked within each currency by estimated value density. Funding one restores the exploration floor; funding a small probe with a stop rule is a legitimate first step.',
      body: candidateTable,
    }),
    card({
      title: 'Unclassified open work',
      subtitle: 'The Governor never guesses a horizon. Classify here (or in the Capacity item dialog) and the mix becomes measurable.',
      body: classifyRows.length
        ? h('div', { class: 'view-stack' }, ...classifyRows)
        : h('p', { class: 'muted small' }, 'All open work is classified. The allocation mix is fully measurable.'),
    }));
}

function policyTab(ctx, report) {
  const floorInput = h('input', {
    type: 'number', min: 0, max: 50, step: 1, value: report.policy.floorPct,
    'aria-label': 'Exploration floor percent', style: 'max-width:120px',
  });
  const windowInput = h('input', {
    type: 'number', min: 30, max: 730, step: 1, value: report.policy.windowDays,
    'aria-label': 'Funded-flow window days', style: 'max-width:120px',
  });
  const autoInput = h('input', { type: 'checkbox', 'aria-label': 'Automatic allocation propagation' });
  autoInput.checked = report.policy.autoPropagate;

  return h('div', { class: 'view-stack' },
    card({
      title: 'Allocation policy',
      subtitle: 'Your conventions, stated once and applied consistently. Changing them is itself a decision — the fourth option on every rebalancing decision says so explicitly.',
      body: h('div', { class: 'view-stack' },
        h('label', { class: 'small' }, 'Exploration floor (% of classified funded effort; 0 = off): ', floorInput),
        h('p', { class: 'muted small' }, 'Nagji & Tuff found top performers hold roughly 70/20/10 across core/adjacent/transformational. 10% is the default floor for exploratory work — a starting convention, not a law.'),
        h('label', { class: 'small' }, 'Funded-flow window (days of funding behaviour measured): ', windowInput),
        h('label', { class: 'small' }, autoInput, ' Automatic propagation (RULE-ALLOC-01..04). Pausing stops new decisions, delegations and talking points; the measurement tabs still work.'),
        h('div', null, h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            const res = ctx.api.setAllocationPolicy({
              explorationFloorPct: Number(floorInput.value),
              windowDays: Number(windowInput.value),
              autoPropagate: autoInput.checked,
            });
            if (res.ok) { toast('Allocation policy saved', 'good'); ctx.refresh(); } else toast(res.error, 'bad');
          },
        }, 'Save policy'))),
    }),
    card({
      title: 'Fixed guardrails (not settings)',
      body: h('div', { class: 'view-stack' },
        h('p', { class: 'small' }, `An arm needs ${ALLOC_MIN_ARM_N} settled bets before any return is shown. Currencies are never converted or summed. Settled work without recorded actuals is excluded, never zero. A horizon is never inferred from an item's kind. Nothing is ever auto-funded: the Governor opens the decision, a human makes it.`)),
    }));
}

/* ------------------------------------------------------------------ view */

export function renderAllocation(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'mix';
  const report = buildAllocationReport(ctx.state, ctx.now);
  const signals = allocationSignals(ctx.state, ctx.now);

  if (report.empty) {
    return h('div', { class: 'view-stack' },
      pageHeader({
        eyebrow: 'Allocation governor',
        title: 'Where should the next person-day go?',
        subtitle: 'This terminal learns — from your own settled work — what core, adjacent and exploratory effort return per person-day, and opens a rebalancing decision when exploration is being starved.',
      }),
      emptyState({
        icon: '⚖',
        title: 'No operating-plan work recorded yet',
        body: 'Add planned work in Capacity & flow, classify each item as Core, Adjacent or Exploratory, and record actuals when work delivers. The Governor needs no other input: it measures your funding behaviour and learns from settlement evidence automatically.',
        action: h('a', { class: 'btn btn-primary', href: '#/capacity' }, 'Open Capacity & flow'),
      }));
  }

  const signalCards = signals.map((s) => banner({
    tone: s.severity >= 3 ? 'warn' : 'info',
    title: s.title,
    body: s.detail,
    actions: s.action ? [h('a', { class: 'btn btn-ghost', href: s.action.route }, s.action.label)] : [],
  }));

  const body = tab === 'mix'
    ? mixTab(ctx, report)
    : tab === 'arms'
      ? armsTab(ctx, report)
      : tab === 'candidates'
        ? candidatesTab(ctx, report)
        : policyTab(ctx, report);

  return h('div', { class: 'view-stack' },
    pageHeader({
      eyebrow: 'Allocation governor',
      title: 'Where should the next person-day go?',
      subtitle: 'Exploration vs exploitation, measured on your own funding behaviour and settled evidence. The Governor opens the decision when exploration starves — a human always makes it.',
      actions: [
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const res = ctx.api.scanAllocation();
            if (res.ok) { propagationToast('Allocation scan complete.', res); ctx.refresh(); } else toast(res.error || 'Scan failed', 'bad');
          },
        }, 'Run allocation scan'),
        h('button', {
          class: 'btn btn-ghost', type: 'button',
          onClick: () => {
            const ok = downloadText({
              filename: `leados-allocation-governor-${dayKey(ctx.now)}.txt`,
              text: allocationBrief(ctx.state, ctx.now),
              mime: 'text/plain;charset=utf-8',
            });
            toast(ok ? 'Brief downloaded' : 'Download was not available in this browser', ok ? 'good' : 'bad');
          },
        }, 'Download brief'),
      ],
    }),
    report.policy.autoPropagate
      ? null
      : banner({
        tone: 'warn',
        title: 'Automatic allocation propagation is paused',
        body: 'Measurement still works, but RULE-ALLOC-01..04 will not open decisions, delegations or talking points until you resume it in the Policy tab.',
        actions: [h('a', { class: 'btn btn-ghost', href: '#/allocation?tab=policy' }, 'Open policy')],
      }),
    h('div', { class: 'stat-grid' },
      stat({
        label: 'Exploratory share (recent funding)',
        value: report.fundedFlow.explorationSharePct === null ? '—' : `${report.fundedFlow.explorationSharePct}%`,
        hint: `Floor ${report.fundedFlow.floorPct}% over ${report.fundedFlow.windowDays} days`,
        tone: report.fundedFlow.starvation ? 'warn' : '',
      }),
      stat({ label: 'Settled bets observed', value: report.totals.settledObserved, hint: 'Recorded actuals only' }),
      stat({
        label: 'Evidence debts',
        value: report.totals.settledMissingEvidence,
        hint: 'Settled without recorded actuals',
        tone: report.totals.settledMissingEvidence ? 'warn' : '',
      }),
      stat({
        label: 'Rebalancing decision',
        value: report.openRebalanceDecision ? 'Open' : 'None',
        hint: report.openRebalanceDecision
          ? `Waiting ${report.openRebalanceDecision.ageDays ?? '—'} day(s)`
          : 'Opens automatically on a floor breach',
        tone: report.openRebalanceDecision ? 'warn' : '',
      })),
    signalCards.length ? h('div', { class: 'view-stack' }, ...signalCards) : null,
    tabs({
      items: TABS.map((t) => ({
        ...t,
        count: t.key === 'candidates'
          ? report.candidates.length + report.unclassifiedOpen.length
          : t.key === 'arms'
            ? report.totals.settledObserved
            : undefined,
      })),
      active: tab,
      onSelect: (key) => ctx.navigate(`#/allocation?tab=${key}`),
      ariaLabel: 'Allocation governor sections',
    }),
    body);
}
