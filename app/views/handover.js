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
  CONTINUITY_MAX_STRESS_DEPUTIES,
  CONTINUITY_MIN_DRILLS,
  stressAbsence,
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
        {
          key: 'mechanism',
          label: 'Mechanism attribution',
          render: ({ row }) => {
            const attr = row.score?.attribution;
            if (!attr) return '—';
            return `${attr.modelMissKeys.length} model miss · ${attr.implementationDropKeys.length} dropped baton · ${attr.predictedStallKeys.length} structural`;
          },
        },
        { key: 'brier', label: 'Brier (raw / exec)', render: ({ row }) => (row.score?.countsOnly ? 'counts only' : `${fmt(row.score?.brier)} / ${fmt(row.score?.attribution?.executionConditionedBrier)}`) },
        { key: 'skill', label: 'Skill', render: ({ row }) => (row.score?.countsOnly || row.score?.skill === null ? '—' : fmt(row.score?.skill)) },
      ],
      rows: ledgerRows,
      caption: 'Closed absence-drill ledger',
    })
    : emptyState({ title: 'No drill has been closed', body: 'A drill is the only way this page learns whether its stall model is any good. Open one before your next absence and close it with what you actually saw.' });

  return card({
    title: 'Drill ledger & causal mechanism attribution',
    subtitle: 'A drill freezes the probabilities, then scores them against your own observation and separates stall-model fit misses from dropped hand-over implementation.',
    body: h('div', { class: 'stack-md' },
      banner({
        tone: report.calibration.countsOnly ? 'info' : report.calibration.skill !== null && report.calibration.skill < 0 ? 'bad' : 'good',
        title: report.calibration.countsOnly ? 'Counts only' : `Mean Brier ${fmt(report.calibration.brier)} · skill ${fmt(report.calibration.skill)}`,
        body: report.calibration.verdict,
      }),
      closed.length
        ? h('div', { class: 'stat-grid' },
          stat({ label: 'Model fit misses', value: fmt(report.calibration.modelMisses ?? 0), hint: 'Predicted covered or executed cover that still stalled' }),
          stat({ label: 'Implementation drops', value: fmt(report.calibration.implementationDrops ?? 0), hint: 'Unbriefed, returned, or paper-only cover that stalled', tone: (report.calibration.implementationDrops ?? 0) > 0 ? 'warn' : '' }),
          stat({ label: 'Predicted structural stalls', value: fmt(report.calibration.predictedStalls ?? 0), hint: 'Predicted to stall (P >= 50%) and stalled' }),
          stat({ label: 'Execution-conditioned Brier', value: fmt(report.calibration.executionConditionedBrier), hint: 'Model Brier excluding dropped hand-over batons' }))
        : null,
      open ? closeForm : startForm,
      ledger,
      h('p', { class: 'small muted' }, `The skill score is withheld below ${CONTINUITY_MIN_DRILLS} closed drills. Attribution uses recorded delegation check-ins and covered-source dates to distinguish forecast error from dropped execution.`)),
  });
}

function queryHref(params, patch = {}) {
  const next = new URLSearchParams();
  const merged = { ...params, ...patch };
  if (merged.start) next.set('start', merged.start);
  if (merged.days) next.set('days', merged.days);
  if (merged.fit) next.set('fit', merged.fit);
  if (merged.cause !== null && merged.cause !== undefined && merged.cause !== '') next.set('cause', String(merged.cause));
  if (merged.second !== null && merged.second !== undefined && merged.second !== '') next.set('second', String(merged.second));
  if (merged.vendor !== null && merged.vendor !== undefined && merged.vendor !== '') next.set('vendor', String(merged.vendor));
  const stress = Array.isArray(merged.stress) ? merged.stress.filter(Boolean) : [];
  if (stress.length) next.set('stress', stress.join(','));
  const query = next.toString();
  return `#/handover${query ? `?${query}` : ''}`;
}

function correlatedCard(ctx, report, params) {
  const correlated = report.simulation.correlated;
  const independent = report.simulation.exact;
  const currencies = [...new Set([...Object.keys(independent.tail || {}), ...Object.keys(correlated.tail || {})])].sort();
  const cause = h('input', {
    id: 'lcs-cause',
    type: 'number',
    min: 0,
    max: 100,
    value: String(correlated.commonCausePct),
    'aria-describedby': 'lcs-cause-hint',
  });
  const lift = correlated.vsIndependent.p90LiftPct;
  return card({
    title: 'Correlated absence — the assumption the exact model cannot make',
    subtitle: 'Same window, one extra assumption: a shared cause takes one recorded team offline at once, a deputy may be away on their own, and cover falls back to the next eligible deputy at a discount instead of to nobody.',
    actions: [badge(`${correlated.commonCausePct}% shared cause`, lift !== null && lift > 0 ? 'caution' : 'neutral', correlated.assumptions[0])],
    body: h('div', { class: 'stack-md' },
      banner({
        tone: lift !== null && lift > 10 ? 'warn' : 'info',
        title: `Independence flatters the plan by ${lift ?? '—'}% at P90`,
        body: `Independent model: mean ${independent.expectedStalled}, P90 ${independent.p90}. Correlated stress: mean ${correlated.mean}, P90 ${correlated.p90}. The difference is not new data; it is the cost of one assumption being removed.`,
      }),
      correlated.cluster.singleTeamPool
        ? banner({
          tone: 'caution',
          title: correlated.cluster.label,
          body: 'That is a real finding, not a modelling accident: with one recorded team or none, a single shared cause removes every deputy at once. Record teams if that is not the reality, or use the deputy-unavailability stress below to test a partial loss.',
        })
        : h('p', { class: 'small muted' }, correlated.cluster.label),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Correlated mean stalls', value: fmt(correlated.mean), hint: `P50 ${correlated.p50} · P80 ${correlated.p80} · P90 ${correlated.p90}` }),
        stat({ label: 'Mean lift vs independence', value: lift === null ? '—' : `+${correlated.vsIndependent.meanLiftPct}%`, hint: `${correlated.vsIndependent.expectedStalled} → ${correlated.mean}` }),
        stat({ label: 'Windows with a shared shock', value: pct(correlated.sharedShockPct), hint: `${correlated.sharedShockTrials} of ${correlated.trials} simulated windows` }),
        stat({ label: 'Individual absence odds', value: pct(correlated.individualAbsencePct), hint: `Per deputy, over this ${report.inventory.horizonDays}-day horizon` })),
      currencies.length
        ? table({
          columns: [
            { key: 'currency', label: 'Currency', render: ({ row }) => row.currency },
            { key: 'indep', label: 'Independent ES-90', render: ({ row }) => money(row.currency, row.independent) },
            { key: 'corr', label: 'Correlated ES-90', render: ({ row }) => money(row.currency, row.correlated) },
            { key: 'delta', label: 'Difference', render: ({ row }) => (row.independent > 0 ? `${Math.round(((row.correlated - row.independent) / row.independent) * 100)}%` : '—') },
          ],
          rows: currencies.map((currency) => ({
            row: {
              currency,
              independent: independent.tail?.[currency]?.cvar90 ?? 0,
              correlated: correlated.tail?.[currency]?.cvar90 ?? 0,
            },
          })),
          caption: 'Expected shortfall at 90% under both models, per currency',
        })
        : h('p', { class: 'small muted' }, 'No priced critical item exists in this window, so no currency tail is reported under either model.'),
      h('form', {
        class: 'form-grid',
        onSubmit: (event) => {
          event.preventDefault();
          ctx.navigate(queryHref(params, { cause: cause.value }));
        },
      },
      h('div', { class: 'stack-xs' },
        h('label', { for: 'lcs-cause' }, 'Shared-cause probability (%)'),
        cause,
        h('p', { id: 'lcs-cause-hint', class: 'small muted' }, '0% reproduces the independent model. The value is a stress convention, not a measured outage rate.')),
      h('div', { class: 'stack-xs' },
        h('span', { class: 'label' }, 'Conventions'),
        h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Preview this stress level'),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx.api.updateContinuityPolicy({ commonCausePct: Number(cause.value) });
            if (!res.ok) { toast(res.error, 'bad'); return; }
            toast('Stress convention saved', 'good');
            ctx.refresh();
          },
        }, 'Save as the workspace convention'))),
      h('ul', { class: 'stack-xs' }, ...correlated.assumptions.map((text) => h('li', { class: 'small muted' }, text)))),
  });
}

function stressCard(ctx, report, params) {
  const selected = new Set(params.stress);
  const rows = report.deputies.map((deputy) => ({
    deputy,
    checked: selected.has(deputy.personId),
  }));
  const result = selected.size ? stressAbsence(report.inventory, report.deputies, {
    unavailableDeputyIds: [...selected],
    minFitPct: report.inventory.minFitPct ?? report.concentration.minFitPct,
    state: ctx.state,
  }) : null;
  const singlePoint = report.concentration.criticalSinglePoint;
  return card({
    title: 'Deputy unavailability stress',
    subtitle: 'Zero writes: pick up to three deputies and re-derive the same window from the remaining pool. Nothing is commissioned and no record changes.',
    actions: [badge(`${report.concentration.critical.length} critical`, 'neutral')],
    body: h('div', { class: 'stack-md' },
      h('form', {
        class: 'stack-sm',
        onSubmit: (event) => {
          event.preventDefault();
          const ids = [...event.currentTarget.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
          ctx.navigate(queryHref(params, { stress: ids }));
        },
      },
      h('fieldset', { class: 'stack-xs' },
        h('legend', { class: 'label' }, 'Take these deputies out of the window'),
        ...rows.map(({ deputy, checked }, index) => h('label', { class: 'check-row', for: `lcs-stress-${index}` },
          h('input', { id: `lcs-stress-${index}`, type: 'checkbox', value: deputy.personId, checked }),
          h('span', null, `${deputy.name}${deputy.team ? ` · ${deputy.team}` : ''}`)))),
      h('button', { class: 'btn btn-secondary', type: 'submit' }, selected.size ? 'Re-run without them' : 'Run the stress')),
      result
        ? h('div', { class: 'stack-sm' },
          h('div', { class: 'stat-grid' },
            stat({ label: 'Expected stalls', value: fmt(result.afterExpectedStalled), hint: `${result.beforeExpectedStalled} → ${result.afterExpectedStalled} (+${result.deltaStalled})`, tone: result.deltaStalled > 0 ? 'warn' : '' }),
            stat({ label: 'Items that lose cover', value: fmt(result.lost.length), hint: `${result.lostCritical.length} of them critical` }),
            stat({ label: 'Items that lose all cover', value: fmt(result.newlyUncovered.length), hint: 'Fell to certain stall' }),
            stat({ label: 'Deputies remaining', value: fmt(result.availableDeputies), hint: `${selected.size} removed` })),
          result.lost.length
            ? table({
              columns: [
                { key: 'title', label: 'Obligation', render: ({ row }) => row.title },
                { key: 'kind', label: 'Presence', render: ({ row }) => CONTINUITY_KIND_LABELS[row.stallKind] },
                { key: 'before', label: 'Stall before', render: ({ row }) => pct(row.beforePStall * 100) },
                { key: 'after', label: 'Stall after', render: ({ row }) => pct(row.afterPStall * 100) },
                { key: 'criticality', label: 'Criticality', render: ({ row }) => `${row.criticality}/5` },
              ],
              rows: result.lost.map((row) => ({ row })),
              caption: 'Items whose cover degrades when the selected deputies are unavailable',
            })
            : h('p', { class: 'small muted' }, 'Every item keeps an equally strong alternate at the current evidence floor. That is redundancy in the record, not a promise about the people.'),
          h('p', { class: 'small muted' }, result.note))
        : h('p', { class: 'small muted' }, 'Select at least one deputy.'),
      h('div', { class: 'stack-xs' },
        h('h3', { class: 'card-title' }, 'Concentration'),
        singlePoint.length
          ? table({
            columns: [
              { key: 'title', label: 'Critical obligation with exactly one eligible deputy', render: ({ row }) => row.title },
              { key: 'kind', label: 'Presence', render: ({ row }) => CONTINUITY_KIND_LABELS[row.stallKind] },
              { key: 'deputy', label: 'Only eligible deputy', render: ({ row }) => report.deputies.find((d) => d.personId === row.onlyDeputyId)?.name || '—' },
            ],
            rows: singlePoint.map((row) => ({ row })),
            caption: 'Critical items with a single eligible deputy at the evidence floor',
          })
          : h('p', { class: 'small muted' }, `No critical item depends on exactly one eligible deputy at the ${report.concentration.minFitPct}% floor. ${report.concentration.critical.filter((row) => row.eligibleCount === 0).length} have none at all.`))),
  });
}

function readinessCard(ctx, report) {
  const readiness = report.readiness;
  if (!readiness.found) {
    return card({
      title: 'Hand-over briefing',
      subtitle: 'Whether the people who are supposed to hold your work actually acknowledged it.',
      body: h('p', { class: 'small muted' }, 'No hand-over has been commissioned for this window. Commissioning one creates the cover delegations; the readiness check then counts recorded acknowledgements, never intent.'),
    });
  }
  const rows = readiness.rows.map((row) => ({
    row,
    name: ctx.state.people.find((person) => person.id === row.personId)?.name || 'Unknown person',
  }));
  return card({
    title: 'Hand-over briefing',
    subtitle: 'A cover delegation with no recorded check-in is a document, not a plan. This counts evidence, not promises.',
    actions: [badge(readiness.verdict.label, readiness.acknowledged < readiness.planned ? 'caution' : 'good')],
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Acknowledged', value: `${readiness.acknowledged}/${readiness.planned}`, hint: 'Recorded check-in on the cover delegation', tone: readiness.acknowledged < readiness.planned ? 'warn' : '' }),
        stat({ label: 'Days until the window', value: readiness.daysToAbsence === null ? '—' : fmt(readiness.daysToAbsence), hint: `Window ${readiness.windowStart} → ${readiness.windowEnd}` }),
        stat({ label: 'Decision approved', value: readiness.decisionChosen ? 'Yes' : 'Not yet', hint: 'A chosen option on the hand-over decision' }),
        stat({ label: 'Still active', value: fmt(readiness.open), hint: `${readiness.completed} completed · ${readiness.returned} returned` })),
      rows.length
        ? table({
          columns: [
            { key: 'deputy', label: 'Deputy', render: ({ row }) => row.name },
            { key: 'title', label: 'Cover', render: ({ row }) => row.title },
            { key: 'status', label: 'Status', render: ({ row }) => badge(row.status, row.status === 'active' ? 'neutral' : row.status === 'done' ? 'good' : 'caution') },
            { key: 'checkins', label: 'Check-ins', render: ({ row }) => fmt(row.checkins) },
            { key: 'ack', label: 'Acknowledged', render: ({ row }) => (row.acknowledged ? badge('Yes', 'good') : badge('No record', 'caution')) },
          ],
          rows,
          caption: 'Cover delegations and their recorded acknowledgements',
        })
        : emptyState({ title: 'The hand-over decision exists but no cover delegation survived' }),
      h('div', { class: 'page-actions' },
        h('a', {
          class: 'btn btn-ghost btn-small',
          href: `#/decisions?decision=${encodeURIComponent(readiness.decisionId)}`,
          onClick: (event) => { event.preventDefault(); ctx.navigate(`#/decisions?decision=${encodeURIComponent(readiness.decisionId)}`); },
        }, 'Open the hand-over decision'),
        h('a', {
          class: 'btn btn-ghost btn-small',
          href: '#/oneonones',
          onClick: (event) => { event.preventDefault(); ctx.navigate('#/oneonones'); },
        }, 'Record a cover briefing in a 1:1')),
    ),
  });
}

function vendorContagionCard(ctx, report, params) {
  const contagion = report.vendorContagion;
  if (!contagion) return null;
  const independent = report.simulation.exact;
  const singleShock = report.simulation.correlated;
  const secondInput = h('input', {
    id: 'lcs-second-shock',
    type: 'number',
    min: 0,
    max: 100,
    value: String(contagion.secondShockPct),
    'aria-describedby': 'lcs-second-shock-hint',
  });
  const vendorInput = h('input', {
    id: 'lcs-vendor-shock',
    type: 'number',
    min: 0,
    max: 100,
    value: contagion.vendorShockOverridePct === null ? '' : String(contagion.vendorShockOverridePct),
    placeholder: 'Prorated from annual',
    'aria-describedby': 'lcs-vendor-shock-hint',
  });
  const chokeRows = contagion.chokePoints.map((row) => ({ row }));
  const comparisonRows = [
    {
      row: {
        model: 'Independent Poisson-binomial',
        mean: independent.expectedStalled,
        p50: independent.p50,
        p80: independent.p80,
        p90: independent.p90,
        scope: 'Assumes deputies and obligations fail independently',
      },
    },
    {
      row: {
        model: `Single-team shared cause (${singleShock.commonCausePct}%)`,
        mean: singleShock.mean,
        p50: singleShock.p50,
        p80: singleShock.p80,
        p90: singleShock.p90,
        scope: 'One recorded team offline at once + 8% individual absence',
      },
    },
    {
      row: {
        model: `Multi-shock + vendor contagion (${contagion.commonCausePct}% + ${contagion.secondShockPct}%)`,
        mean: contagion.mean,
        p50: contagion.p50,
        p80: contagion.p80,
        p90: contagion.p90,
        scope: 'Second simultaneous shock + cross-team dependency survival shortfalls (TTR > TTS)',
      },
    },
  ];
  return card({
    title: 'Multi-shock & cross-team vendor common-mode contagion',
    subtitle: 'Removes the single-shock ceiling: models a second simultaneous shock in the same window plus active service/vendor dependencies (TTR > TTS) whose outage pulls primary and backup stewards into recovery across team boundaries.',
    actions: [
      badge(`${contagion.crossTeamChokePoints.length} cross-team choke point(s)`, contagion.crossTeamChokePoints.length > 0 ? 'caution' : 'neutral'),
    ],
    body: h('div', { class: 'stack-md' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Multi-shock mean stalls', value: fmt(contagion.mean), hint: `P50 ${contagion.p50} · P80 ${contagion.p80} · P90 ${contagion.p90}` }),
        stat({ label: 'Dual-shock windows', value: pct(contagion.dualShockPct), hint: `${contagion.dualShockTrials} of ${contagion.trials} simulated windows` }),
        stat({ label: 'Vendor-shock windows', value: pct(contagion.vendorShockPct), hint: `${contagion.vendorShockTrials} windows with dependency shortfall` }),
        stat({ label: 'Cross-team choke points', value: fmt(contagion.crossTeamChokePoints.length), hint: `${contagion.chokePoints.length} total dependency choke point(s)` })),
      table({
        columns: [
          { key: 'model', label: 'Model', render: ({ row }) => row.model },
          { key: 'mean', label: 'Mean stalls', render: ({ row }) => fmt(row.mean) },
          { key: 'p50', label: 'P50', render: ({ row }) => fmt(row.p50) },
          { key: 'p80', label: 'P80', render: ({ row }) => fmt(row.p80) },
          { key: 'p90', label: 'P90', render: ({ row }) => fmt(row.p90) },
          { key: 'scope', label: 'Structural assumption', render: ({ row }) => row.scope },
        ],
        rows: comparisonRows,
        caption: 'Side-by-side comparison of independent, single-shock and multi-shock/vendor contagion models',
      }),
      chokeRows.length
        ? table({
          columns: [
            {
              key: 'name',
              label: 'Dependency / vendor',
              render: ({ row }) => h('a', {
                href: '#/resilience',
                onClick: (event) => { event.preventDefault(); ctx.navigate('#/resilience'); },
              }, `${row.name} (${row.kind})`),
            },
            { key: 'shortfall', label: 'Shortfall (TTR - TTS)', render: ({ row }) => `${row.maxShortfallDays}d (TTR ${row.ttrDays ?? '—'}d / TTS ${row.ttsDays ?? 0}d)` },
            { key: 'prob', label: 'Window outage odds', render: ({ row }) => (row.windowFailureProbPct === null ? 'unmodelled' : pct(row.windowFailureProbPct)) },
            { key: 'stewards', label: 'Deputies pulled into recovery', render: ({ row }) => row.stewardNames.join(', ') || '—' },
            { key: 'teams', label: 'Teams spanned', render: ({ row }) => (row.teamsAffected.length ? row.teamsAffected.join(', ') : 'unassigned') },
            { key: 'atRisk', label: 'Window obligations at risk', render: ({ row }) => `${row.criticalObligationsAtRisk} critical (${row.obligationsAtRisk} total)` },
          ],
          rows: chokeRows,
          caption: 'Service and vendor dependencies whose outage pulls cover deputies into simultaneous incident recovery',
        })
        : h('p', { class: 'small muted' }, 'No active dependency with a survival shortfall (TTR > TTS) currently pulls an eligible cover deputy away from window obligations.'),
      contagion.unmodeledDependencies.length
        ? banner({
          tone: 'info',
          title: `${contagion.unmodeledDependencies.length} active dependency record(s) have unmodelled outage odds`,
          body: `Missing recorded annual failure probability or recovery time on: ${contagion.unmodeledDependencies.map((d) => `${d.name} (${d.missing})`).join(', ')}. Unmodelled dependencies are listed explicitly and never treated as 0% failure risk.`,
        })
        : null,
      h('form', {
        class: 'form-grid',
        onSubmit: (event) => {
          event.preventDefault();
          ctx.navigate(queryHref(params, {
            second: secondInput.value,
            vendor: vendorInput.value.trim(),
          }));
        },
      },
      h('div', { class: 'stack-xs' },
        h('label', { for: 'lcs-second-shock' }, 'Second simultaneous shock (%)'),
        secondInput,
        h('p', { id: 'lcs-second-shock-hint', class: 'small muted' }, 'Probability that a second independent team or deputy shock hits in the same window.')),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'lcs-vendor-shock' }, 'Vendor shock override (%)'),
        vendorInput,
        h('p', { id: 'lcs-vendor-shock-hint', class: 'small muted' }, 'Optional stress override per dependency (blank uses prorated annual failure probability).')),
      h('div', { class: 'stack-xs' },
        h('span', { class: 'label' }, 'Multi-shock controls'),
        h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Preview multi-shock stress'),
        h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx.api.updateContinuityPolicy({ secondShockPct: Number(secondInput.value) });
            if (!res.ok) { toast(res.error, 'bad'); return; }
            toast('Second-shock convention saved', 'good');
            ctx.refresh();
          },
        }, 'Save second-shock convention'))),
      h('ul', { class: 'stack-xs' }, ...contagion.assumptions.map((text) => h('li', { class: 'small muted' }, text)))),
  });
}

function implementationCard(ctx, report) {
  const impl = report.implementation;
  if (!impl || !impl.found) {
    return card({
      title: 'Hand-over execution & covered-source progress',
      subtitle: 'Separates pre-window briefing from in-window execution and dated progress on the underlying covered records.',
      body: h('p', { class: 'small muted' }, 'No hand-over has been commissioned for this window yet. Once commissioned, this ledger tracks whether each cover delegation was briefed, executed, returned (and auto-reassigned to a backup deputy under RULE-LCS-04), or closed on paper without moving its linked source records.'),
    });
  }
  const stateTone = {
    'completed-verified': 'good',
    'active-executing': 'good',
    'paper-only': 'bad',
    returned: 'caution',
    blocked: 'bad',
    unexecuted: 'neutral',
  };
  const rows = impl.rows.map((row) => ({ row }));
  return card({
    title: 'Hand-over execution & covered-source progress',
    subtitle: 'A cover delegation marked done while 0 linked source obligations moved is a paper completion, not an executed hand-over.',
    actions: [
      badge(impl.verdict.label, impl.paperOnly > 0 || impl.returned > impl.returnedRecovered ? 'bad' : impl.completedVerified + impl.activeExecuting > 0 ? 'good' : 'neutral'),
    ],
    body: h('div', { class: 'stack-md' },
      banner({
        tone: impl.paperOnly > 0 || impl.returned > impl.returnedRecovered ? 'bad' : impl.unexecuted > 0 && impl.windowPhase !== 'pre-window' ? 'caution' : 'info',
        title: impl.verdict.label,
        body: impl.verdict.detail,
      }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Briefed', value: `${impl.briefed}/${impl.planned}`, hint: 'Recorded check-in or completion on cover delegation' }),
        stat({ label: 'Verified execution', value: `${impl.completedVerified + impl.activeExecuting}/${impl.planned}`, hint: `${impl.completedVerified} verified done · ${impl.activeExecuting} active executing` }),
        stat({ label: 'Paper-only / Returned', value: `${impl.paperOnly} / ${impl.returned}`, hint: `${impl.returnedRecovered} returned delegation(s) auto-recovered by backup deputy`, tone: impl.paperOnly > 0 || impl.returned > impl.returnedRecovered ? 'warn' : '' }),
        stat({ label: 'Covered sources moved', value: `${impl.sourcesMoved}/${impl.sourcesTotal}`, hint: impl.sourceMovePct === null ? 'No linked sources' : `${impl.sourceMovePct}% with dated movement in window` })),
      rows.length
        ? table({
          columns: [
            { key: 'deputy', label: 'Deputy', render: ({ row }) => row.deputyName },
            { key: 'title', label: 'Cover delegation', render: ({ row }) => row.title },
            {
              key: 'state',
              label: 'Execution state',
              render: ({ row }) => badge(row.executionState, stateTone[row.executionState] || 'neutral'),
            },
            {
              key: 'sources',
              label: 'Covered source records',
              render: ({ row }) => (row.sourcesTotal > 0 ? `${row.sourcesMoved}/${row.sourcesTotal} moved` : '0 linked'),
            },
            {
              key: 'recovery',
              label: 'Evidence / fallback lineage',
              render: ({ row }) => {
                if (row.executionState === 'returned') {
                  return row.backupDeputyName
                    ? `Returned (${row.returnReason || 'recorded'}) → superseded by ${row.backupDeputyName}`
                    : `Returned (${row.returnReason || 'recorded'}) — no eligible backup above floor`;
                }
                if (row.executionState === 'paper-only') {
                  return 'Delegation marked done, but 0 covered source records moved on or after window start';
                }
                const movedTitles = row.sources.filter((s) => s.moved).map((s) => `${s.title} (${s.evidence})`);
                return movedTitles.length ? movedTitles.slice(0, 2).join('; ') : 'Awaiting in-window check-in or source record movement';
              },
            },
          ],
          rows,
          caption: 'Commissioned cover delegations, execution verification and covered-source movement',
        })
        : null),
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
        'The correlated model adds one shared cause per window; the multi-shock & vendor contagion model adds a second simultaneous shock plus cross-team service/vendor survival shortfalls (TTR > TTS) from Operational Resilience.',
        'A person is never eligible to cover contact with a stakeholder who is themselves; relationship credit requires a typed stakeholder → person link, not a name in a text field.',
        'Hand-over implementation grading checks dated transitions on the covered source records themselves; drill attribution uses those dates to separate dropped hand-over batons from probability-model fit misses.',
      ])),
  });
}

export function renderHandover(ctx) {
  const params = {
    start: ctx.query?.get?.('start') || null,
    days: ctx.query?.get?.('days') || null,
    fit: ctx.query?.get?.('fit') || null,
    cause: ctx.query?.get?.('cause') || null,
    second: ctx.query?.get?.('second') || null,
    vendor: ctx.query?.get?.('vendor') || null,
    stress: (ctx.query?.get?.('stress') || '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, CONTINUITY_MAX_STRESS_DEPUTIES),
  };
  const report = ctx.api.leaderContinuityReport({
    startOn: params.start,
    horizonDays: params.days ? Number(params.days) : undefined,
    minFitPct: params.fit ? Number(params.fit) : undefined,
    commonCausePct: params.cause !== null ? Number(params.cause) : undefined,
    secondShockPct: params.second !== null ? Number(params.second) : undefined,
    vendorShockPct: params.vendor !== null && params.vendor !== '' ? Number(params.vendor) : undefined,
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
      commonCausePct: params.cause !== null ? Number(params.cause) : undefined,
      secondShockPct: params.second !== null ? Number(params.second) : undefined,
      vendorShockPct: params.vendor !== null && params.vendor !== '' ? Number(params.vendor) : undefined,
    });
    if (!downloadText({ filename: 'leados-leader-continuity.txt', text, mime: 'text/plain' })) {
      openModal({ title: 'Copy the continuity brief', body: h('textarea', { readOnly: true, rows: 18, 'aria-label': 'Leader continuity brief' }, text) });
    }
  };

  return h('div', { class: 'page', 'data-testid': 'handover-page' },
    pageHeader({
      eyebrow: 'Continuity · Schema v45–v46',
      title: 'Leader continuity',
      subtitle: 'What breaks if you are unavailable, the smallest hand-over that prevents it, whether the hand-over was actually executed on the underlying records, and an honest test of whether the prediction was right.',
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
    h('div', { 'data-testid': 'handover-correlated' }, correlatedCard(ctx, report, params)),
    h('div', { 'data-testid': 'handover-vendor-contagion' }, vendorContagionCard(ctx, report, params)),
    h('div', { 'data-testid': 'handover-stress' }, stressCard(ctx, report, params)),
    h('div', { 'data-testid': 'handover-readiness' }, readinessCard(ctx, report)),
    h('div', { 'data-testid': 'handover-implementation' }, implementationCard(ctx, report)),
    h('div', { 'data-testid': 'handover-drill' }, drillCard(ctx, report)),
    boundariesCard(report));
}
