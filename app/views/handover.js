/**
 * app/views/handover.js — Leader Continuity Drill (`#/handover`, Schema v45).
 *
 * The question this page answers: *what breaks if I am not here, who could hold
 * it, and what does the smallest honest hand-over cost?* Every number is
 * derived from dated records; every write goes through ctx.api. No calendar,
 * message or sentiment data is read.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, table, emptyState, kv,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey, formatDate } from '../core/time.js';
import {
  CONTINUITY_CRITICAL,
  CONTINUITY_DELEGABILITY_LABELS,
  CONTINUITY_KIND_LABELS,
  CONTINUITY_MIN_DRILLS,
} from '../core/domain/leaderContinuity.js';

const TONE_BY_VERDICT = {
  'nothing-in-window': 'info',
  coverable: 'good',
  'thin-cover': 'warn',
  'structural-single-point': 'bad',
};

function fmt(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  return unit ? `${text} ${unit}` : text;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value))}%`;
}

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(amount))}`;
}

function criticalityBadge(row) {
  const tone = row.criticality >= 5 ? 'bad' : row.criticality >= 4 ? 'warn' : row.criticality >= CONTINUITY_CRITICAL ? 'caution' : 'neutral';
  return badge(`${row.criticality}/5`, tone, row.criticalityBasis.join(' · '));
}

function delegabilityBadge(row) {
  const tone = row.delegability === 'held' ? 'bad' : row.delegability === 'shared' ? 'caution' : 'good';
  return badge(CONTINUITY_DELEGABILITY_LABELS[row.delegability], tone, row.holdReason || '');
}

function routeLink(ctx, row, label) {
  if (!row.route) return h('span', null, label);
  return h('a', {
    class: 'link',
    href: row.route,
    onClick: (event) => { event.preventDefault(); ctx.navigate(row.route); },
  }, label);
}

function controlsCard(ctx, report, params) {
  const start = h('input', {
    id: 'lcs-start',
    type: 'date',
    value: params.start || report.inventory.windowStart,
    min: report.asOf,
    'aria-describedby': 'lcs-start-hint',
  });
  const days = h('input', {
    id: 'lcs-days',
    type: 'number',
    min: 1,
    max: 90,
    value: String(report.inventory.horizonDays),
    'aria-describedby': 'lcs-days-hint',
  });
  const fit = h('input', {
    id: 'lcs-fit',
    type: 'number',
    min: 1,
    max: 100,
    value: String(report.simulation.minFitPct),
    'aria-describedby': 'lcs-fit-hint',
  });
  return card({
    title: 'Simulate a dated absence',
    subtitle: 'A window that begins when the absence begins. Nothing here is a calendar scrape: it is a list of obligations the workspace already records.',
    body: h('form', {
      class: 'stack-sm',
      onSubmit: (event) => {
        event.preventDefault();
        const next = new URLSearchParams();
        if (start.value) next.set('start', start.value);
        if (days.value) next.set('days', days.value);
        if (fit.value) next.set('fit', fit.value);
        ctx.navigate(`#/handover${next.toString() ? `?${next.toString()}` : ''}`);
      },
    },
    h('div', { class: 'form-grid' },
      h('div', { class: 'stack-xs' },
        h('label', { for: 'lcs-start' }, 'Absence starts'),
        start,
        h('p', { id: 'lcs-start-hint', class: 'small muted' }, 'The window begins on this date. Past dates fall back to today.')),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'lcs-days' }, 'Window length (days)'),
        days,
        h('p', { id: 'lcs-days-hint', class: 'small muted' }, '1–90 days. The default is the workspace convention.')),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'lcs-fit' }, 'Cover-evidence floor (%)'),
        fit,
        h('p', { id: 'lcs-fit-hint', class: 'small muted' }, 'Minimum recorded evidence before a critical item can be handed over.'))),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Rebuild the window'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const res = ctx.api.updateContinuityPolicy({ horizonDays: Number(days.value), minFitPct: Number(fit.value) });
          if (!res.ok) { toast(res.error, 'bad'); return; }
          toast('Continuity convention saved', 'good');
          ctx.refresh();
        },
      }, 'Save as the workspace convention'))),
  });
}

function summaryStats(report) {
  const { inventory, simulation, coverPlan } = report;
  return h('div', { class: 'stat-grid' },
    stat({ label: 'Obligations in window', value: fmt(inventory.counts.total), hint: `${inventory.counts.overdue} already late` }),
    stat({ label: 'Critical', value: fmt(inventory.counts.critical), hint: `${inventory.counts.criticalHeld} cannot be delegated`, tone: inventory.counts.criticalHeld ? 'warn' : '' }),
    stat({ label: 'Expected stalls', value: fmt(simulation.exact.expectedStalled), hint: `P50 ${simulation.exact.p50} · P80 ${simulation.exact.p80} · P90 ${simulation.exact.p90}` }),
    stat({ label: 'Modelled coverage', value: pct(simulation.coveragePct), hint: 'Informal coverage under the stated conventions' }),
    stat({ label: 'Critical cover', value: pct(coverPlan.coveragePct), hint: `${coverPlan.totalMinutes} setup minutes for the recommended plan` }),
    stat({ label: 'Priced critical items', value: `${inventory.counts.pricedCritical}/${inventory.counts.critical}`, hint: 'Only these contribute to exposure' }));
}

function exposureCard(report) {
  const currencies = Object.keys(report.simulation.tail).sort();
  if (!currencies.length) {
    return card({
      title: 'Exposure',
      body: h('p', { class: 'small muted' }, 'No critical obligation in this window records a currency amount. LeadOS does not assign a synthetic value; record an amount on the source record if you want it priced.'),
    });
  }
  return card({
    title: 'Exposure of the priced subset',
    subtitle: 'Coherent expected shortfall at 90%, per currency. Currencies are never summed.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'form-grid' }, ...currencies.map((currency) => {
        const tail = report.simulation.tail[currency];
        return h('div', { class: 'stack-xs' },
          h('p', { class: 'small muted' }, currency),
          kv('Expected loss', money(currency, tail.expected)),
          kv('P90 loss', money(currency, tail.p90)),
          kv('Expected shortfall (90%)', money(currency, tail.cvar90)));
      })),
      h('p', { class: 'small muted' }, `Independence is assumed. The exposure line covers ${report.inventory.counts.pricedCritical} of ${report.inventory.counts.critical} critical items; the rest are unpriced and excluded rather than guessed.`)),
  });
}

function demandCard(ctx, report) {
  const rows = report.inventory.items.map((row) => ({
    row,
    className: row.criticality >= CONTINUITY_CRITICAL ? '' : 'row-muted',
  }));
  const columns = [
    {
      key: 'kind',
      label: 'Presence',
      render: ({ row }) => h('div', { class: 'stack-xs' },
        h('span', null, CONTINUITY_KIND_LABELS[row.stallKind]),
        h('span', { class: 'small muted' }, row.sourceType)),
    },
    {
      key: 'title',
      label: 'Obligation',
      render: ({ row }) => h('div', { class: 'stack-xs' },
        routeLink(ctx, row, row.title),
        h('span', { class: 'small muted' }, row.overdueDays ? `${row.overdueDays} day(s) late` : `due ${formatDate(row.dueOn, { withYear: false })}`)),
    },
    { key: 'criticality', label: 'Criticality', render: ({ row }) => criticalityBadge(row) },
    { key: 'delegability', label: 'Delegability', render: ({ row }) => delegabilityBadge(row) },
    {
      key: 'deputy',
      label: 'Best recorded cover',
      render: ({ row }) => {
        const best = report.simulation.perItem.find((item) => item.key === row.key);
        if (!best || !best.deputyId) return h('span', { class: 'muted small' }, row.delegability === 'held' ? 'Held by convention' : 'No deputy above the floor');
        return h('span', null, `${report.deputies.find((d) => d.personId === best.deputyId)?.name || 'Deputy'} · fit ${best.deputyFit}`);
      },
    },
    { key: 'money', label: 'Recorded amount', render: ({ row }) => (row.money ? money(row.money.currency, row.money.amount) : h('span', { class: 'muted small' }, 'unpriced')) },
  ];
  return card({
    title: 'Demand inventory',
    subtitle: 'Every dated obligation inside the window that the leader’s presence currently satisfies. Sorted by criticality, then date.',
    actions: [badge(`${report.inventory.counts.total} items`, 'neutral')],
    body: table({ columns, rows, caption: 'Leader absence demand inventory', emptyMessage: 'No dated obligation requires the leader in this window.' }),
  });
}

function planCard(ctx, report) {
  const actions = report.coverPlan.actions.map((action) => ({
    action,
    className: '',
  }));
  const columns = [
    { key: 'deputy', label: 'Deputy', render: ({ action }) => h('span', null, action.deputyName) },
    { key: 'kind', label: 'Holds', render: ({ action }) => CONTINUITY_KIND_LABELS[action.stallKind] },
    { key: 'items', label: 'Items', render: ({ action }) => fmt(action.itemKeys.length) },
    { key: 'fit', label: 'Recorded fit', render: ({ action }) => `${action.avgFit}/100` },
    { key: 'minutes', label: 'Setup', render: ({ action }) => `${action.setupMinutes} min` },
  ];
  const uncoveredRows = report.coverPlan.uncoveredDetail.map((row) => ({
    row,
    className: '',
  }));
  const commission = h('button', {
    class: 'btn btn-primary',
    type: 'button',
    disabled: !report.coverPlan.actions.length || Boolean(report.openDrill && report.openDrill.startOn !== report.inventory.windowStart),
    onClick: async () => {
      const accepted = await confirmDialog({
        title: 'Commission this hand-over?',
        message: 'Creates one DACI hand-over decision, up to four owned deputy delegations with explicit authority, typed links to every covered record and at most one blameless prompt per deputy. It does not move an irreversible call, hold a 1:1 for you, spend money or send anything.',
        confirmLabel: 'Create linked cover',
      });
      if (!accepted) return;
      const res = ctx.api.commissionContinuityCover({
        planKey: report.planKey,
        horizonDays: report.inventory.horizonDays,
        startOn: report.inventory.windowStart,
        expectedRevision: ctx.state.meta.revision,
      });
      if (!res.ok) {
        toast(res.error, 'bad');
        return;
      }
      toast('Hand-over commissioned', 'good');
      ctx.refresh();
      if (res.id) ctx.navigate(`#/decisions?decision=${encodeURIComponent(res.id)}`);
    },
  }, 'Commission cover');

  return card({
    title: 'Minimum cover plan',
    subtitle: report.coverPlan.method === 'exact-branch-and-bound'
      ? `Exact minimum set cover over ${report.coverPlan.nodesVisited} branch nodes. ${report.coverPlan.criticalityCovered}/${report.coverPlan.criticalityTotal} criticality covered.`
      : (report.coverPlan.bound || 'Greedy set-cover heuristic.'),
    actions: [badge(`${report.coverPlan.totalMinutes} min`, 'neutral')],
    body: h('div', { class: 'stack-md' },
      actions.length
        ? table({ columns, rows: actions, caption: 'Recommended hand-over cover actions' })
        : emptyState({ title: 'No cover action is possible', body: 'No deputy clears the recorded-evidence floor for the critical items in this window. Lower the floor only if you can defend the evidence; otherwise move the work before you go.' }),
      uncoveredRows.length
        ? h('div', { class: 'stack-sm' },
          h('h3', { class: 'card-title' }, `${uncoveredRows.length} critical item(s) with no cover`),
          table({
            columns: [
              { key: 'title', label: 'Obligation', render: ({ row }) => row.title },
              { key: 'criticality', label: 'Criticality', render: ({ row }) => `${row.criticality}/5` },
              {
                key: 'reason',
                label: 'Why',
                render: ({ row }) => (row.reason === 'held-by-convention'
                  ? 'Held by convention: a conversation or irreversible call that cannot be delegated.'
                  : row.reason === 'no-deputy-above-floor'
                    ? 'No deputy clears the recorded-evidence floor.'
                    : 'Left out of the selected plan.'),
              },
            ],
            rows: uncoveredRows,
            caption: 'Critical items without cover',
          }))
        : null,
      h('div', { class: 'stat-grid' },
        stat({ label: 'Modelled stalls after cover', value: fmt(report.residual.expectedStalled), hint: `${report.residual.expectedCriticalStalled} of them critical` }),
        stat({ label: 'Cover uplift', value: `+${report.residual.briefedUpliftPoints} pts`, hint: 'Stated convention for explicit authority and briefing time' }),
        Object.entries(report.residual.expectedValue).map(([currency, amount]) => stat({ label: `Expected loss after cover (${currency})`, value: money(currency, amount) }))),
      h('p', { class: 'small muted' }, report.residual.briefedUpliftNote),
      h('div', { class: 'page-actions' }, commission)),
  });
}

function drillCard(ctx, report) {
  const open = report.openDrill;
  const today = report.asOf;
  const startInput = h('input', { id: 'lcs-drill-start', type: 'date', value: today, min: today });
  const endInput = h('input', { id: 'lcs-drill-end', type: 'date', value: addDays(today, 14), min: today });
  const noteInput = h('input', { id: 'lcs-drill-note', type: 'text', maxlength: 500, placeholder: 'Optional: what this drill is testing' });
  const startForm = h('form', {
    class: 'stack-sm',
    onSubmit: (event) => {
      event.preventDefault();
      const res = ctx.api.startContinuityDrill({
        startOn: startInput.value,
        endOn: endInput.value,
        note: noteInput.value,
      });
      if (!res.ok) { toast(res.error, 'bad'); return; }
      toast(`Froze ${res.predictions} prediction(s)`, 'good');
      ctx.refresh();
    },
  },
  h('div', { class: 'form-grid' },
    h('div', { class: 'stack-xs' }, h('label', { for: 'lcs-drill-start' }, 'Drill starts'), startInput),
    h('div', { class: 'stack-xs' }, h('label', { for: 'lcs-drill-end' }, 'Drill ends'), endInput),
    h('div', { class: 'stack-xs' }, h('label', { for: 'lcs-drill-note' }, 'What are you testing?'), noteInput)),
  h('button', { class: 'btn btn-secondary', type: 'submit', disabled: Boolean(open) }, open ? 'An open drill already exists' : 'Freeze a prediction for this window'));

  let closeForm = null;
  if (open) {
    const boxes = open.predictions
      .slice()
      .sort((a, b) => b.pStall - a.pStall)
      .slice(0, 12)
      .map((prediction) => {
        const [stallKind, sourceType, sourceId] = String(prediction.key).split('|');
        const source = (ctx.state[sourceType === 'person' ? 'people' : `${sourceType}s`] || []).find((row) => row && row.id === sourceId);
        const label = source?.title || source?.name || `${sourceType} ${sourceId}`;
        const id = `lcs-obs-${stallKind}-${sourceId}`;
        return h('label', { class: 'check-row', for: id },
          h('input', { id, type: 'checkbox', value: prediction.key }),
          h('span', null, `${CONTINUITY_KIND_LABELS[stallKind] || stallKind}: ${label} · P(stall) ${Math.round(prediction.pStall * 100)}%`));
      });
    const unexpected = h('input', { id: 'lcs-unexpected', type: 'number', min: 0, max: 50, value: '0' });
    closeForm = h('form', {
      class: 'stack-sm',
      onSubmit: (event) => {
        event.preventDefault();
        const observed = [...event.currentTarget.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
        const res = ctx.api.closeContinuityDrill({
          drillId: open.id,
          observedKeys: observed,
          unexpectedStalls: Number(unexpected.value),
        });
        if (!res.ok) { toast(res.error, 'bad'); return; }
        toast('Drill closed and scored', 'good');
        ctx.refresh();
      },
    },
    h('fieldset', { class: 'stack-xs' },
      h('legend', { class: 'card-title' }, `Which of these actually stalled? (${open.startOn} → ${open.endOn})`),
      h('p', { class: 'small muted' }, 'Tick only what you observed. An unticked item is scored as not stalled. Unpredicted stalls are recorded separately so the denominator cannot be changed afterwards.'),
      ...boxes),
    h('div', { class: 'stack-xs' },
      h('label', { for: 'lcs-unexpected' }, 'Unpredicted stalls you also observed (count)'),
      unexpected),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Close and score the drill'));
  }

  const closed = report.drills.filter((row) => row.status === 'closed');
  const ledgerRows = closed.map((row) => ({ row, className: '' }));
  const ledger = closed.length
    ? table({
      columns: [
        { key: 'window', label: 'Window', render: ({ row }) => `${row.startOn} → ${row.endOn}` },
        { key: 'n', label: 'Predictions', render: ({ row }) => fmt(row.score?.n ?? 0) },
        { key: 'observed', label: 'Observed', render: ({ row }) => `${row.score?.hits ?? 0} predicted + ${row.score?.unexpected ?? 0} unpredicted` },
        { key: 'brier', label: 'Brier', render: ({ row }) => (row.score?.countsOnly ? 'counts only' : fmt(row.score?.brier)) },
        { key: 'skill', label: 'Skill', render: ({ row }) => (row.score?.countsOnly || row.score?.skill === null ? '—' : fmt(row.score?.skill)) },
      ],
      rows: ledgerRows,
      caption: 'Closed absence-drill ledger',
    })
    : emptyState({ title: 'No drill has been closed', body: 'A drill is the only way this page learns whether its stall model is any good. Open one before your next absence and close it with what you actually saw.' });

  return card({
    title: 'Drill ledger',
    subtitle: 'A drill freezes the probabilities, then scores them against your own observation. Below the floor it reports counts only.',
    body: h('div', { class: 'stack-md' },
      banner({
        tone: report.calibration.countsOnly ? 'info' : report.calibration.skill !== null && report.calibration.skill < 0 ? 'bad' : 'good',
        title: report.calibration.countsOnly ? 'Counts only' : `Mean Brier ${fmt(report.calibration.brier)} · skill ${fmt(report.calibration.skill)}`,
        body: report.calibration.verdict,
      }),
      open ? closeForm : startForm,
      ledger,
      h('p', { class: 'small muted' }, `The skill score is withheld below ${CONTINUITY_MIN_DRILLS} closed drills. A drill is an observation, not a causal test of the hand-over.`)),
  });
}

function boundariesCard(report) {
  const list = (items) => h('ul', { class: 'stack-xs' }, ...items.map((text) => h('li', { class: 'small' }, text)));
  return card({
    title: 'What this model is, and is not',
    body: h('div', { class: 'stack-sm' },
      list([
        ...report.simulation.assumptions,
        'Deputy fit is recorded evidence (completed authority, succession rating, a recorded relationship, current commitments). It is a cover-planning input and never a performance rating.',
        'Some work is deliberately non-delegable: a management conversation, or an irreversible call above the big-bet convention. Those items are listed as uncovered, not covered on paper.',
        'The exact stall-count distribution is a Poisson-binomial convolution. The money tail is a seeded Monte Carlo over the same probabilities.',
        'A commissioned plan raises effective coverage by a stated briefing uplift. That uplift is a convention until drills show otherwise.',
      ])),
  });
}

export function renderHandover(ctx) {
  const params = {
    start: ctx.query?.get?.('start') || null,
    days: ctx.query?.get?.('days') || null,
    fit: ctx.query?.get?.('fit') || null,
  };
    const report = ctx.api.leaderContinuityReport({
    startOn: params.start,
    horizonDays: params.days ? Number(params.days) : undefined,
    minFitPct: params.fit ? Number(params.fit) : undefined,
  });

  if (!report || report.ok === false) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Continuity', title: 'Leader continuity' }),
      banner({ tone: 'bad', title: 'The absence window could not be computed', body: report?.error || 'Unknown error.' }));
  }

  const brief = () => {
    const text = ctx.api.leaderContinuityBriefText({
      startOn: params.start,
      horizonDays: params.days ? Number(params.days) : undefined,
      minFitPct: params.fit ? Number(params.fit) : undefined,
    });
    if (!downloadText({ filename: 'leados-leader-continuity.txt', text, mime: 'text/plain' })) {
      openModal({ title: 'Copy the continuity brief', body: h('textarea', { readOnly: true, rows: 18, 'aria-label': 'Leader continuity brief' }, text) });
    }
  };

  return h('div', { class: 'page', 'data-testid': 'handover-page' },
    pageHeader({
      eyebrow: 'Continuity · Schema v45',
      title: 'Leader continuity',
      subtitle: 'What breaks if you are unavailable, the smallest hand-over that prevents it, and an honest test of whether the prediction was right.',
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: brief }, 'Export the brief'),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx.api.scanLeaderContinuity();
            toast(res.ok ? (res.changed ? 'A structural decision was opened' : 'No structural change needed') : res.error, res.ok ? 'good' : 'bad');
            if (res.ok && res.changed) ctx.refresh();
          },
        }, 'Run a structural check'),
      ],
    }),
    banner({
      tone: TONE_BY_VERDICT[report.verdict.id] || 'info',
      title: report.verdict.label,
      body: report.verdict.detail,
    }),
    h('div', { 'data-testid': 'handover-summary' }, summaryStats(report)),
    controlsCard(ctx, report, params),
    h('div', { 'data-testid': 'handover-demand' }, demandCard(ctx, report)),
    h('div', { class: 'grid-2' },
      exposureCard(report),
      card({
        title: 'Stall distribution',
        subtitle: 'Exact convolution of the per-item stall probabilities.',
        body: h('div', { class: 'stack-sm' },
          kv('Expected stalls', fmt(report.simulation.exact.expectedStalled)),
          kv('P50', fmt(report.simulation.exact.p50)),
          kv('P80', fmt(report.simulation.exact.p80)),
          kv('P90', fmt(report.simulation.exact.p90)),
          kv('Probability nothing stalls', pct(report.simulation.exact.pNone * 100)),
          kv('Monte Carlo cross-check (mean)', fmt(report.simulation.monteCarlo.mean)),
          h('p', { class: 'small muted' }, `Critical: expected ${report.simulation.critical.expectedStalled} stalls of ${report.simulation.critical.total} critical items; ${report.simulation.critical.fullyUncovered} have no cover at all.`)),
      })),
    h('div', { 'data-testid': 'handover-plan' }, planCard(ctx, report)),
    h('div', { 'data-testid': 'handover-drill' }, drillCard(ctx, report)),
    boundariesCard(report));
}
