/**
 * app/views/retention.js — Retention Intelligence & Talent Economics (`#/retention`).
 *
 * Five questions, five tabs, one model:
 *   Ledger      — who is outside the watch band, why, and what it would cost.
 *   Plans       — what has been committed, what it cost, and whether it was reviewed.
 *   Survivorship— the observed hazard, its confidence band and its censoring.
 *   Invest      — which interventions buy the most retained value for money AND attention.
 *   Departures  — what actually happened, and whether the reasons cluster.
 *   Board pack  — a deterministic memo that quotes no number the terminal cannot defend.
 *
 * Nothing here computes a score. Every figure comes from the pure engine in
 * `core/domain/retention.js`, and every write goes through `ctx.api`.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, kv, barRow,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate, humanDays } from '../core/time.js';
import {
  DEPARTURE_REASON_LABELS,
  DEPARTURE_TYPE_LABELS,
  RETENTION_PLAN_STATUS_LABELS,
} from '../core/domain/retention.js';
import {
  RETENTION_ENGINE_VERSION,
  RETENTION_FACTORS,
  RETENTION_MIN_EVENTS,
  RETENTION_MIN_PAIRS,
  RETENTION_RULES,
  buildRetentionReport,
  retentionBrief,
} from '../core/domain/retention.js';
import {
  openDepartureDialog,
  openRetentionPlanDialog,
  openCompensationDialog,
  openRetentionDeclineDialog,
} from '../ui/retention-modals.js';

const TABS = [
  { key: 'ledger', label: 'Risk ledger' },
  { key: 'plans', label: 'Plans' },
  { key: 'survival', label: 'Survivorship' },
  { key: 'invest', label: 'Investment lab' },
  { key: 'departures', label: 'Departures' },
  { key: 'board', label: 'Board pack' },
];

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 'unpriced';
  return `${currency || ''} ${Math.round(Number(amount)).toLocaleString('en-US')}`.trim();
}

function pct(value, dp = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(dp)}%`;
}

function riskBadge(risk) {
  return badge(risk.band.label, risk.band.tone, `${risk.mode === 'pooled' ? 'Fitted multipliers' : 'Prior multipliers'}`);
}

function modeBadge(report) {
  return report.model.mode === 'pooled'
    ? badge("This team's own fit", 'good', report.model.reason)
    : badge('Literature priors', 'caution', report.model.reason);
}

/* --------------------------------------------------------- survivorship chart */

function survivalChart(survivorship) {
  const points = survivorship.points || [];
  if (points.length < 2) {
    return emptyState({
      title: 'Not enough tenure history yet',
      body: 'A survival curve needs at least one recorded departure. Until then the baseline hazard is the prior, and the terminal says so rather than drawing a line through no data.',
    });
  }
  const W = 720;
  const H = 260;
  const pad = { left: 48, right: 18, top: 14, bottom: 34 };
  const maxT = Math.max(24, Math.ceil((survivorship.maxTenure || 24) / 6) * 6);
  const x = (t) => pad.left + ((W - pad.left - pad.right) * t) / maxT;
  const y = (s) => pad.top + (H - pad.top - pad.bottom) * (1 - s);

  // Step function: survival is constant between event times.
  const step = (key) => {
    const out = [];
    let previous = 1;
    out.push(`M${x(0).toFixed(1)} ${y(1).toFixed(1)}`);
    for (const point of points) {
      out.push(`L${x(point.t).toFixed(1)} ${y(previous).toFixed(1)}`);
      out.push(`L${x(point.t).toFixed(1)} ${y(point[key]).toFixed(1)}`);
      previous = point[key];
    }
    out.push(`L${x(maxT).toFixed(1)} ${y(previous).toFixed(1)}`);
    return out.join(' ');
  };
  const bandTop = points.map((p) => `${x(p.t).toFixed(1)} ${y(p.ciHi).toFixed(1)}`).join(' L');
  const bandBottom = points.slice().reverse().map((p) => `${x(p.t).toFixed(1)} ${y(p.ciLo).toFixed(1)}`).join(' L');
  const censoredTicks = points.filter((p) => p.censored > 0);

  const svg = h('svg', {
    class: 'retention-chart',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-labelledby': 'retention-chart-title retention-chart-desc',
  },
  h('title', { id: 'retention-chart-title' }, 'Kaplan–Meier survival of tenure with a 95% log–log confidence band'),
  h('desc', { id: 'retention-chart-desc' },
    `${survivorship.events} observed voluntary departures and ${survivorship.censored} censored records. ${survivorship.medianIdentified ? `Median tenure ${survivorship.median.toFixed(1)} months.` : 'The curve has not crossed 50%, so median tenure is not identified.'}`),
  h('rect', { x: pad.left, y: pad.top, width: W - pad.left - pad.right, height: H - pad.top - pad.bottom, class: 'retention-plot' }),
  ...[0.25, 0.5, 0.75, 1].map((s) => h('g', null,
    h('line', { x1: pad.left, x2: W - pad.right, y1: y(s), y2: y(s), class: 'retention-grid' }),
    h('text', { x: pad.left - 8, y: y(s) + 4, class: 'retention-axis', 'text-anchor': 'end' }, `${Math.round(s * 100)}%`),
  )),
  ...[0, maxT / 2, maxT].map((t) => h('text', { x: x(t), y: H - 10, class: 'retention-axis', 'text-anchor': 'middle' }, `${Math.round(t)}m`)),
  h('path', { d: `M${bandTop} L${bandBottom} Z`, class: 'retention-band' }),
  h('path', { d: step('survival'), class: 'retention-line', fill: 'none' }),
  ...censoredTicks.map((p) => h('line', {
    x1: x(p.t), x2: x(p.t), y1: y(p.survival) - 4, y2: y(p.survival) + 4, class: 'retention-censor',
  })),
  survivorship.medianIdentified
    ? h('g', null,
        h('line', { x1: x(survivorship.median), x2: x(survivorship.median), y1: y(0.5), y2: y(0), class: 'retention-median' }),
        h('text', { x: x(survivorship.median) + 6, y: y(0) - 8, class: 'retention-annotation' }, `median ${survivorship.median.toFixed(1)}m`),
      )
    : null,
  );

  const dataTable = table({
    caption: 'Survival estimates at each recorded departure time',
    columns: [
      { label: 'Tenure (months)', className: 'num', render: (p) => p.t.toFixed(1) },
      { label: 'Still here', className: 'num', render: (p) => String(p.atRisk) },
      { label: 'Departures', className: 'num', render: (p) => String(p.events) },
      { label: 'Survival', className: 'num', render: (p) => pct(p.survival, 1) },
      { label: '95% band', className: 'num', render: (p) => `${pct(p.ciLo, 1)} – ${pct(p.ciHi, 1)}` },
    ],
    rows: points.filter((p) => p.events > 0),
    emptyMessage: 'No departure times are recorded.',
  });

  return h('div', { class: 'stack-sm' },
    svg,
    h('p', { class: 'muted tiny' },
      'Step function with Greenwood variance and a log–log 95% band. Vertical ticks mark censored records (people still here, or exits excluded from the event definition). The band widens where the evidence is thin — that is the point of drawing it.'),
    h('details', { class: 'retention-chart-data' },
      h('summary', null, 'Data behind the curve'),
      dataTable,
    ),
  );
}

/* ------------------------------------------------------------------ ledger */

function ledgerTab(ctx, report) {
  const rows = report.people;
  const byCurrency = report.totals.byCurrency;

  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Measured people', value: `${report.totals.measured}`, hint: `${report.totals.unmeasurable} without a start date`, tone: '' }),
    stat({
      label: 'Outside the watch band',
      value: `${report.totals.elevated}`,
      hint: `Threshold ${pct((ctx.state.settings?.retentionRiskThresholdPct ?? 12) / 100)} over ${report.horizonDays} days`,
      tone: report.totals.elevated ? 'bad' : 'good',
    }),
    stat({
      label: 'Expected loss',
      value: byCurrency.length ? money(byCurrency[0].currency, byCurrency[0].point) : 'unpriced',
      hint: byCurrency.length > 1
        ? `+${byCurrency.length - 1} other currency (never summed)`
        : report.totals.unpriced
          ? `${report.totals.unpriced} people unpriced`
          : 'Regrettable-weighted, from recorded costs only',
      tone: '',
    }),
    stat({
      label: 'Evidence',
      value: `${report.calibration.events} departure${report.calibration.events === 1 ? '' : 's'}`,
      hint: report.model.mode === 'pooled' ? 'Enough for the workspace’s own multipliers' : `${report.calibration.needs} more to leave prior mode`,
      tone: report.model.mode === 'pooled' ? 'good' : 'caution',
    }),
  );

  const dataTable = table({
    caption: `Retention risk by person over a ${report.horizonDays}-day horizon`,
    columns: [
      {
        label: 'Person',
        render: (row) => h('div', { class: 'stack-xs' },
          h('a', {
            class: 'link',
            href: `#/people/${row.personId}`,
            onClick: (event) => { event.preventDefault(); ctx.navigate(`#/people/${row.personId}`); },
          }, row.person.name),
          h('span', { class: 'muted tiny' }, `${row.person.role || 'No role recorded'} · ${row.tenureBandLabel.split('—')[0].trim()}`),
        ),
      },
      {
        label: 'Modelled risk',
        render: (row) => h('div', { class: 'stack-xs' },
          h('strong', null, pct(row.risk.point, 1)),
          h('span', { class: 'muted tiny' }, `${pct(row.risk.lo, 1)} – ${pct(row.risk.hi, 1)}`),
        ),
      },
      { label: 'Band', render: (row) => riskBadge(row.risk) },
      {
        label: 'Drivers',
        render: (row) => row.factors.length
          ? h('div', { class: 'retention-chips' }, ...row.factors.slice(0, 3).map((f) => badge(f.label, 'neutral', `${f.evidence.join(' · ')} (${f.source} ×${f.hr.toFixed(2)})`)),
              row.factors.length > 3 ? h('span', { class: 'muted tiny' }, `+${row.factors.length - 3}`) : null)
          : h('span', { class: 'muted small' }, 'Baseline only'),
      },
      {
        label: 'Expected loss',
        className: 'num',
        render: (row) => row.loss
          ? h('div', { class: 'stack-xs' },
              h('span', null, money(row.loss.currency, row.loss.lo)),
              h('span', { class: 'muted tiny' }, `point ${money(row.loss.currency, row.loss.point)}`))
          : h('span', { class: 'muted small' }, 'unpriced'),
      },
      {
        label: 'Plan',
        render: (row) => row.livePlan
          ? badge(RETENTION_PLAN_STATUS_LABELS[row.livePlan.status] || row.livePlan.status, row.livePlan.status === 'committed' ? 'good' : 'caution')
          : h('span', { class: 'muted small' }, 'none'),
      },
      {
        label: 'Actions',
        render: (row) => h('div', { class: 'row-actions' },
          h('button', {
            class: 'btn btn-small btn-ghost',
            type: 'button',
            'data-testid': `retention-plan-${row.personId}`,
            onClick: () => openRetentionPlanDialog(ctx, row.person),
          }, row.livePlan ? (row.livePlan.status === 'committed' ? 'Check in' : 'Review plan') : 'Plan retention'),
          h('button', {
            class: 'btn btn-small btn-ghost',
            type: 'button',
            onClick: () => openCompensationDialog(ctx, row.person),
          }, row.cost ? 'Pay data' : 'Add pay data'),
          row.person.status !== 'archived'
            ? h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                'data-testid': `retention-departure-${row.personId}`,
                onClick: () => openDepartureDialog(ctx, row.person),
              }, 'Record departure')
            : null,
        ),
      },
    ],
    rows,
    emptyMessage: 'No one is measurable yet. Record a start date for each person and the ledger fills itself.',
  });

  return h('div', { class: 'stack-md' },
    stats,
    report.model.mode !== 'pooled'
      ? banner({
          tone: 'caution',
          title: `Every multiplier on this screen is a prior, not a measurement`,
          body: `${report.calibration.events} observed voluntary departure(s); the model needs ${RETENTION_MIN_EVENTS} before it estimates this team's own hazard ratios. The ordering is still useful — calibration shows C = ${report.calibration.c === null ? '—' : report.calibration.c.toFixed(2)} — but the percentages are borrowed.`,
          actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/retention?tab=survival' }, 'See the evidence')],
        })
      : banner({
          tone: 'good',
          title: `The model has enough evidence to estimate this team's own multipliers`,
          body: `λ = ${report.model.ridge} shrinks each fitted ratio toward its prior, so a thin factor stays near the literature and a well-evidenced one departs from it. The confidence intervals are shown on every row.`,
        }),
    card({
      title: 'Risk ledger',
      subtitle: `Ranked by modelled ${report.horizonDays}-day exit probability · ${modeBadge(report) ? '' : ''}`,
      actions: [modeBadge(report)],
      body: dataTable,
    }),
    card({
      title: 'What this model is, and what it is not',
      subtitle: 'Kaplan–Meier survival · prior-centred penalised Poisson regression · proportional-hazards economics',
      body: h('div', { class: 'prose small' },
        h('p', null, 'The baseline hazard is non-parametric: a Kaplan–Meier curve over recorded tenure, Lexis-expanded into tenure bands, then smoothed toward a stated prior by a person-month strength you control. Two events over forty person-months is not a rate; the smoothing makes that visible rather than letting a single exit become a percentage.'),
        h('p', null, 'The factor multipliers are a Poisson regression on person-period exposure with a Gaussian prior centred on published hazard ratios, fitted by IRLS. The penalty is the prior: with no evidence every ratio sits at its published value, and with enough departures the fit moves off it. Both are reported on every row.'),
        h('p', null, 'This is decision support for retention investment. It is not a performance rating, it never writes to a review, and it cannot read a confidential conflict or an anonymous pulse response — those collections are not imported by the engine at all.')),
    }),
  );
}

/* ------------------------------------------------------------------- plans */

function plansTab(ctx, report) {
  const plans = report.plans;
  const live = plans.filter((p) => p.status === 'committed');
  const committed = live.reduce((sum, p) => sum + (p.committedCost || 0), 0);
  const currency = live.find((p) => p.currency)?.currency || '';
  const overdue = live.filter((p) => p.reviewOn && p.reviewOn < report.generatedOn);

  const rows = plans.map((plan) => ({
    plan,
    person: (ctx.state.people || []).find((p) => p.id === plan.personId),
  }));

  const dataTable = table({
    caption: 'Retention plans, proposals and settlements',
    columns: [
      {
        label: 'Person',
        render: (r) => h('div', { class: 'stack-xs' },
          h('span', null, r.person?.name || 'Unknown'),
          h('span', { class: 'muted tiny' }, `${r.plan.interventions.length} intervention(s) · ${r.plan.source === 'RULE-RET-01' ? 'engine proposal' : 'leader plan'}`),
        ),
      },
      { label: 'Status', render: (r) => badge(RETENTION_PLAN_STATUS_LABELS[r.plan.status] || r.plan.status, r.plan.status === 'committed' ? 'good' : r.plan.status === 'moot' ? 'neutral' : 'caution') },
      { label: 'Cost', className: 'num', render: (r) => (r.plan.committedCost ? money(r.plan.currency, r.plan.committedCost) : '—') },
      { label: 'Predicted risk', className: 'num', render: (r) => (r.plan.predictedRisk === null ? '—' : `${r.plan.predictedRisk.toFixed(1)}%`) },
      {
        label: 'Review',
        render: (r) => (r.plan.reviewOn
          ? h('span', { class: r.plan.reviewOn < report.generatedOn && r.plan.status === 'committed' ? 'text-bad small' : 'small' },
              r.plan.reviewOn < report.generatedOn && r.plan.status === 'committed'
                ? `Overdue ${humanDays(r.plan.reviewOn)}`
                : formatDate(r.plan.reviewOn, { withYear: false }))
          : h('span', { class: 'muted small' }, '—')),
      },
      {
        label: 'Actions',
        render: (r) => h('div', { class: 'row-actions' },
          h('button', {
            class: 'btn btn-small btn-ghost',
            type: 'button',
            'data-testid': `retention-open-${r.plan.id}`,
            onClick: () => openRetentionPlanDialog(ctx, r.person, { existing: r.plan }),
          }, r.plan.status === 'committed' ? 'Check in' : r.plan.status === 'proposed' ? 'Commit or edit' : 'View'),
          r.plan.status === 'proposed'
            ? h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                onClick: () => openRetentionDeclineDialog(ctx, r.plan),
              }, 'Decline')
            : null,
        ),
      },
    ],
    rows,
    emptyMessage: 'No retention plans yet. Propose one from the risk ledger; the engine never commits spend on its own.',
  });

  return h('div', { class: 'stack-md' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Committed plans', value: String(live.length), hint: `${plans.filter((p) => p.status === 'proposed').length} awaiting a decision`, tone: '' }),
      stat({ label: 'Committed cost', value: committed ? money(currency, committed) : 'none', hint: 'Recorded at commitment, never recomputed', tone: '' }),
      stat({ label: 'Past review', value: String(overdue.length), hint: overdue.length ? 'A commitment nobody revisited' : 'Every plan is inside its review window', tone: overdue.length ? 'bad' : 'good' }),
      stat({ label: 'Moot', value: String(plans.filter((p) => p.status === 'moot').length), hint: 'People who left before the plan played out', tone: '' }),
    ),
    banner({
      tone: 'info',
      title: 'A proposal is not a commitment',
      body: 'RULE-RET-01 proposes. Committing is a human act that raises a DACI decision and records the cost. Completed plans are what the Brier score is computed against, so the note you write on completion is the evidence the next model is scored on.',
    }),
    card({ title: 'Plan ledger', body: dataTable }),
  );
}

/* -------------------------------------------------------------- survival */

function survivalTab(ctx, report) {
  const s = report.survivorship;
  const bands = s.bands || [];

  const bandTable = table({
    caption: 'Hazard by tenure band with person-month exposure',
    columns: [
      { label: 'Tenure band', render: (b) => h('span', null, b.label) },
      { label: 'Departures', className: 'num', render: (b) => String(b.events) },
      { label: 'Person-months', className: 'num', render: (b) => String(Math.round(b.months)) },
      { label: 'Crude rate', className: 'num', render: (b) => (b.crude === null ? '—' : `${pct(b.crude, 2)}/mo`) },
      { label: 'Smoothed', className: 'num', render: (b) => h('strong', null, `${pct(b.smoothed, 2)}/mo`) },
      { label: 'Poisson band', className: 'num', render: (b) => `${pct(b.lo, 2)} – ${pct(b.hi, 2)}` },
      { label: 'Basis', render: (b) => (b.priorDriven ? badge('prior-driven', 'caution', `Less exposure than the smoothing strength of ${s.strengthMonths} person-months`) : badge('evidence-driven', 'good')) },
    ],
    rows: bands,
  });

  const hrTable = table({
    caption: 'Hazard ratios per factor with their source',
    columns: [
      { label: 'Factor', render: (c) => h('span', null, c.label) },
      { label: 'Hazard ratio', className: 'num', render: (c) => h('strong', null, `×${c.hr.toFixed(2)}`) },
      { label: '95% interval', className: 'num', render: (c) => `${c.lo.toFixed(2)} – ${c.hi.toFixed(2)}` },
      { label: 'Source', render: (c) => (c.source === 'fitted' ? badge('fitted', 'good', `Fitted from ${report.model.events} observed departures`) : badge('prior', 'caution', 'Published ratio; not yet estimated from this team')) },
    ],
    rows: report.model.coefficients || [],
  });

  const calibration = report.calibration;

  return h('div', { class: 'stack-md' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Observed departures', value: String(s.totalEvents), hint: 'Voluntary exits only; involuntary exits censor', tone: '' }),
      stat({ label: 'Censored', value: pct(s.censorShare), hint: 'Still here, or exits outside the event definition', tone: '' }),
      stat({ label: 'Median tenure', value: s.medianIdentified ? `${s.median.toFixed(1)} mo` : 'not identified', hint: s.medianIdentified ? 'Where the curve crosses 50%' : 'The curve has not crossed 50% — saying so beats interpolating', tone: '' }),
      stat({ label: 'Person-months', value: String(Math.round(s.totalMonths)), hint: `Prior ${pct(s.prior, 2)}/mo, smoothing strength ${s.strengthMonths} months`, tone: '' }),
    ),
    card({
      title: 'Kaplan–Meier survival of tenure',
      subtitle: `${s.events} event(s) · ${s.censored} censored · log–log 95% band`,
      body: survivalChart(s),
    }),
    card({ title: 'Hazard by tenure band', subtitle: 'Lexis-expanded exposure, smoothed toward the prior by person-months', body: bandTable }),
    card({
      title: 'Hazard ratios',
      subtitle: report.model.mode === 'pooled' ? report.model.reason : `${report.model.reason}`,
      actions: [modeBadge(report)],
      body: hrTable,
    }),
    card({
      title: 'Does the ordering work?',
      subtitle: 'Harrell’s concordance index · Brier score over settled plans',
      body: h('div', { class: 'stack-sm' },
        calibration.sufficient
          ? h('p', { class: 'prose small' },
              `Across ${calibration.pairs} comparable pairs, the modelled multiplier ordered the earlier departure ahead of the later one in C = ${calibration.c.toFixed(2)} of them. A model at chance scores 0.50. ${calibration.c < 0.6 ? 'That is close enough to chance that the ranking should not drive allocation until it recovers — RET-07 fires in Signals while it stays there.' : 'The ordering is doing something real, even while the multipliers remain priors.'}`)
          : h('p', { class: 'prose small' },
              `Concordance needs ${RETENTION_MIN_PAIRS} comparable pairs before it is reported; this workspace has ${calibration.pairs}. An index computed on two pairs is noise with a decimal point.`),
        calibration.brier.sufficient
          ? h('p', { class: 'prose small' },
              `Brier score ${calibration.brier.brier.toFixed(3)} over ${calibration.brier.n} settled plans. Lower is better; the base rate alone would score differently only if the forecasts are actually informative.`)
          : h('p', { class: 'muted small' },
              `No settled plans yet, so no Brier score. ${calibration.brier.n} of 5 required plans have closed.`),
        h('p', { class: 'muted tiny' },
          'Both statistics are computed from what this workspace recorded, not from a benchmark. When they look bad, the terminal shows that too.')),
    }),
    card({
      title: 'Every factor, with its published basis',
      subtitle: 'A multiplier nobody can trace is a rumour with a decimal point',
      body: h('ul', { class: 'retention-factor-catalogue' },
        ...RETENTION_FACTORS.map((f) => h('li', null,
          h('div', { class: 'retention-factor-catalogue-head' },
            h('strong', null, f.label),
            h('span', { class: 'muted small' }, `prior ×${f.priorHr.toFixed(2)}`),
          ),
          h('p', { class: 'muted small' }, f.basis),
        ))),
    }),
  );
}

/* ----------------------------------------------------------------- invest */

function investTab(ctx, report) {
  const budget = Number(ctx.query.get('budget') ?? 0) || 0;
  const hours = Number(ctx.query.get('hours') ?? (ctx.state.settings?.retentionAttentionHours ?? 12)) || 0;
  const scenario = ctx.api.retentionScenario({ budget, hours });
  const allocation = scenario.allocation;
  const byPerson = new Map(report.people.map((row) => [row.personId, row]));

  const budgetInput = h('input', { id: 'retention-budget', name: 'budget', type: 'number', min: '0', step: '100', value: String(budget), inputmode: 'decimal' });
  const hoursInput = h('input', { id: 'retention-hours', name: 'hours', type: 'number', min: '0', step: '1', value: String(hours), inputmode: 'numeric' });
  const form = h('form', {
    class: 'retention-budget-form',
    onSubmit: (event) => {
      event.preventDefault();
      ctx.navigate(`#/retention?tab=invest&budget=${encodeURIComponent(budgetInput.value || 0)}&hours=${encodeURIComponent(hoursInput.value || 0)}`);
    },
  },
  h('div', { class: 'form-grid' },
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'retention-budget' }, 'Money budget'),
      budgetInput,
      h('p', { class: 'field-hint' }, 'In the workspace currency. A budget of zero still ranks the interventions that cost attention only.')),
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: 'retention-hours' }, 'Leader attention (hours)'),
      hoursInput,
      h('p', { class: 'field-hint' }, 'Retention work competes for the leader’s calendar, not just the budget. Both constraints are applied.')),
  ),
  h('button', { class: 'btn btn-primary', type: 'submit' }, 'Model allocation'),
  );

  const selectedTable = table({
    caption: 'Selected interventions, ranked by conservative value per unit of budget and attention',
    columns: [
      {
        label: 'Intervention',
        render: (c) => h('div', { class: 'stack-xs' },
          h('span', null, c.label),
          h('span', { class: 'muted tiny' }, byPerson.get(c.personId)?.person.name || 'Unknown'),
        ),
      },
      { label: 'Removes', render: (c) => h('div', { class: 'retention-chips' }, ...c.removesFactors.map((id) => badge(id, 'neutral'))) },
      { label: 'Cost', className: 'num', render: (c) => (c.moneyCost > 0 ? money(c.currency, c.moneyCost) : 'money-free') },
      { label: 'Attention', className: 'num', render: (c) => `${c.hours} h` },
      { label: 'Hazard removed', className: 'num', render: (c) => `−${pct(c.hazardReduction, 0)}` },
      { label: 'Value (point)', className: 'num', render: (c) => (c.benefit ? money(c.currency, c.benefit) : '—') },
      { label: 'Defensible at lower bound', className: 'num', render: (c) => (c.fundableAtLowerBound ? badge('yes', 'good') : badge('no', 'caution', 'The benefit does not survive the lower bound of the hazard estimate')) },
      {
        label: 'Actions',
        render: (c) => h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => openRetentionPlanDialog(ctx, byPerson.get(c.personId)?.person, {}),
        }, 'Plan for person'),
      },
    ],
    rows: allocation.selected,
    emptyMessage: 'No intervention fits the current budget and attention allowance. Raise either constraint, or reduce the ask.',
  });

  const skippedTable = allocation.skipped.length
    ? table({
        caption: 'Interventions that did not fit',
        columns: [
          { label: 'Intervention', render: (c) => h('span', null, c.label) },
          { label: 'Person', render: (c) => h('span', { class: 'muted small' }, byPerson.get(c.personId)?.person.name || '—') },
          { label: 'Cost', className: 'num', render: (c) => (c.moneyCost > 0 ? money(c.currency, c.moneyCost) : 'money-free') },
          { label: 'Why not', render: (c) => h('span', { class: 'muted small' }, c.skippedBecause) },
        ],
        rows: allocation.skipped,
      })
    : null;

  const blocked = allocation.blocked.length
    ? card({
        title: 'Blocked by missing data',
        subtitle: 'The engine will not price a raise it cannot see',
        body: h('ul', { class: 'plain-list' },
          ...allocation.blocked.map((c) => h('li', null,
            h('strong', null, `${c.label} · ${byPerson.get(c.personId)?.person.name || 'Unknown'}`),
            h('span', { class: 'muted small' }, ` — ${c.blockedReason}`)))),
      })
    : null;

  return h('div', { class: 'stack-md' },
    banner({
      tone: 'info',
      title: 'Allocation, not advocacy',
      body: 'The optimiser is a two-constraint knapsack with an explicit fairness tier: closing a below-band pay gap outranks everything else, and if it cannot be funded the lab says so instead of quietly funding a growth plan instead. A greedy allocation is not optimal; it is explainable, which is the property that survives a review.',
    }),
    card({ title: 'Set the constraints', subtitle: 'Money and the leader’s own calendar', body: form }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Money allocated', value: allocation.spend ? money(allocation.selected.find((c) => c.currency)?.currency, allocation.spend) : 'none', hint: `${money(allocation.selected.find((c) => c.currency)?.currency, allocation.moneyLeft)} unspent`, tone: '' }),
      stat({ label: 'Attention used', value: `${allocation.hoursUsed.toFixed(1)} h`, hint: `${allocation.hoursLeft.toFixed(1)} h left`, tone: '' }),
      stat({
        label: 'Expected loss avoided',
        value: allocation.selected.length ? money(allocation.selected.find((c) => c.currency)?.currency, allocation.benefit) : '—',
        hint: allocation.defensibleShare === null ? 'Unpriced' : `${pct(allocation.defensibleShare, 0)} survives the lower bound`,
        tone: '',
      }),
      stat({ label: 'Interventions', value: String(allocation.selected.length), hint: `${allocation.skipped.length} did not fit`, tone: '' }),
    ),
    allocation.equity.warning
      ? banner({ tone: 'bad', title: 'Fairness guardrail triggered', body: allocation.equity.warning })
      : banner({ tone: 'good', title: 'No below-band pay gap is left unfunded by this allocation', body: 'The pay-gap tier is satisfied at the current constraints.' }),
    card({ title: 'Selected', subtitle: allocation.method, body: selectedTable }),
    skippedTable ? card({ title: 'Left on the table', body: skippedTable }) : null,
    blocked,
  );
}

/* ------------------------------------------------------------- departures */

function departuresTab(ctx, report) {
  const people = (ctx.state.people || []).filter((p) => p.status !== 'archived');
  const active = report.people;

  const picker = h('select', { id: 'retention-departure-person', 'aria-label': 'Team member' },
    ...active.map((row) => h('option', { value: row.personId }, `${row.person.name} — ${row.person.role || 'no role'}`)));
  const recordButton = h('button', {
    class: 'btn btn-small btn-ghost',
    type: 'button',
    onClick: () => {
      const person = (ctx.state.people || []).find((p) => p.id === picker.value);
      if (person) openDepartureDialog(ctx, person);
    },
  }, 'Record departure');

  const table1 = table({
    caption: 'Recorded departures',
    columns: [
      {
        label: 'Person',
        render: (d) => {
          const person = (ctx.state.people || []).find((p) => p.id === d.personId);
          return h('div', { class: 'stack-xs' },
            h('span', null, person?.name || 'Unknown'),
            h('span', { class: 'muted tiny' }, `${person?.role || 'no role'} · last day ${d.lastDay}`),
          );
        },
      },
      { label: 'Type', render: (d) => badge(DEPARTURE_TYPE_LABELS[d.type] || d.type, d.type === 'voluntary' ? 'caution' : 'neutral') },
      { label: 'Reason class', render: (d) => h('span', null, DEPARTURE_REASON_LABELS[d.reasonClass] || d.reasonClass) },
      { label: 'Regrettable', render: (d) => (d.regrettable === null ? h('span', { class: 'muted small' }, 'not recorded') : badge(d.regrettable ? 'Yes' : 'No', d.regrettable ? 'bad' : 'neutral')) },
      {
        label: 'Continuity',
        render: (d) => (d.continuityCaseId
          ? h('a', { class: 'link small', href: `#/cases/${d.continuityCaseId}`, onClick: (e) => { e.preventDefault(); ctx.navigate(`#/cases/${d.continuityCaseId}`); } }, 'Open case')
          : d.continuityHandled
            ? badge('handled', 'good')
            : badge('no case', 'caution', 'No continuity case was raised for this departure')),
      },
      { label: 'Model evidence', render: (d) => (d.type === 'voluntary' ? badge('counts as an event', 'caution') : badge('censors the record', 'neutral')) },
    ],
    rows: report.departures,
    emptyMessage: 'No departures recorded. Until one is, the survival curve is flat and every multiplier is a prior.',
  });

  const clusterCards = report.clusters.length
    ? report.clusters.map((cluster) => card({
        title: `${cluster.label} · ${cluster.departures.length} exits in 12 months`,
        subtitle: `RULE-RET-04 raises exactly one systemic-driver decision per class`,
        body: h('ul', { class: 'plain-list' },
          ...cluster.departures.map((d) => h('li', null, `${d.lastDay} · ${DEPARTURE_TYPE_LABELS[d.type] || d.type}`)),
          h('li', { class: 'muted small' }, 'Repeat exit reasons are a process signal, not a run of bad luck.')),
      }))
    : [card({
        title: 'No clustered exit reasons',
        subtitle: 'Two or more exits sharing a recorded class inside twelve months is when a pattern becomes a hypothesis',
        body: h('p', { class: 'muted small' }, 'Nothing clusters yet. When it does, RULE-RET-04 raises a single decision about the driver instead of opening a case per person.'),
      })];

  return h('div', { class: 'stack-md' },
    banner({
      tone: 'info',
      title: 'Recording a departure is a four-way write',
      body: 'One record updates the survival evidence, the roster and capacity model, opens a continuity case through the shared case engine (which fans out to FMEA, stakeholder cadence, DACI and delegation), and may trigger a systemic-driver decision. Nothing is deleted and no reason is inferred.',
    }),
    card({
      title: 'Record a departure',
      subtitle: `${people.length} person(s) still on the roster`,
      body: h('div', { class: 'row-gap' },
        people.length
          ? h('div', { class: 'retention-departure-controls' },
              h('label', { class: 'field-label', for: 'retention-departure-person' }, 'Team member'),
              picker,
              recordButton)
          : h('p', { class: 'muted small' }, 'No one is on the roster. Add a person first.')),
    }),
    card({ title: 'Departure ledger', body: table1 }),
    ...clusterCards,
  );
}

/* ------------------------------------------------------------------ board */

function boardTab(ctx, report) {
  const lines = retentionBrief(report, { teamName: ctx.state.settings?.teamName || 'The team' });
  const text = lines.join('\n');
  const perCurrency = report.totals.byCurrency;

  return h('div', { class: 'stack-md' },
    banner({
      tone: 'info',
      title: 'A deterministic memo, not a generated narrative',
      body: 'Every sentence is assembled from the same numbers the other tabs show. It names no cause, claims no causality between speed and outcome, and quotes no figure the engine cannot defend.',
    }),
    card({
      title: 'Board pack',
      subtitle: `Engine ${RETENTION_ENGINE_VERSION} · ${report.generatedOn}`,
      actions: [
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => downloadText({ filename: `retention-brief-${report.generatedOn}.txt`, text, mime: 'text/plain' }),
        }, 'Download'),
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast('Brief copied', 'good');
            } catch {
              toast('The clipboard is unavailable in this browser', 'bad');
            }
          },
        }, 'Copy'),
      ],
      body: h('div', { class: 'stack-sm' },
        h('ul', { class: 'plain-list retention-brief' }, ...lines.map((line) => h('li', null, line)))),
    }),
    card({
      title: 'Totals by currency',
      subtitle: 'Regrettable-weighted expected loss; currencies are never added together',
      body: perCurrency.length
        ? h('div', { class: 'stack-sm' },
            ...perCurrency.map((total) => barRow({
              label: `${total.currency} · ${total.people} priced person(s)`,
              value: total.point,
              hint: `${money(total.currency, total.lo)} – ${money(total.currency, total.hi)} (point ${money(total.currency, total.point)})`,
              tone: 'caution',
            })))
        : h('p', { class: 'muted small' }, 'No annual cost is recorded, so no money is quoted. Unpriced is not zero.'),
    }),
    card({
      title: 'Rules behind this terminal',
      subtitle: 'Registered in the shared post-commit hook, pausable, and idempotent',
      body: table({
        caption: 'Retention automation rules',
        columns: [
          { label: 'Rule', render: (rule) => h('span', null, rule.id) },
          { label: 'What it does', render: (rule) => h('div', { class: 'stack-xs' }, h('span', null, rule.name), h('span', { class: 'muted tiny' }, rule.description)) },
          { label: 'Framework', render: (rule) => h('span', { class: 'muted small' }, rule.framework) },
          { label: 'Target', render: (rule) => badge(rule.targetModule, 'neutral') },
        ],
        rows: RETENTION_RULES,
      }),
    }),
    card({
      title: 'Known limits',
      subtitle: 'Stated here so they cannot be discovered later',
      body: h('ul', { class: 'plain-list prose small' },
        h('li', null, 'Involuntary exits censor the record rather than being modelled as a competing risk. Cause-specific hazards would need more data than one team produces.'),
        h('li', null, 'Factor multipliers assume proportional hazards: a factor’s effect is constant over tenure. A leader whose team changes shape materially will move through the priors for a while.'),
        h('li', null, 'The replacement-cost convention (recorded annual cost × a share you set) is a convention. It is labelled as one wherever it appears.'),
        h('li', null, 'Pay data is optional. Where it is missing the economics is unpriced rather than estimated.')),
    }),
  );
}

/* ------------------------------------------------------------------- shell */

export function renderRetention(ctx) {
  const report = buildRetentionReport(ctx.state, { now: new Date(ctx.now), settings: ctx.state.settings });
  const active = TABS.some((tab) => tab.key === ctx.query.get('tab')) ? ctx.query.get('tab') : 'ledger';
  const body = active === 'ledger' ? ledgerTab(ctx, report)
    : active === 'plans' ? plansTab(ctx, report)
      : active === 'survival' ? survivalTab(ctx, report)
        : active === 'invest' ? investTab(ctx, report)
          : active === 'departures' ? departuresTab(ctx, report)
            : boardTab(ctx, report);

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Retention intelligence',
      title: 'Retention & talent economics',
      subtitle: `Survival analysis, hazard economics and a two-constraint allocation lab · ${report.model.modeLabel} · engine ${RETENTION_ENGINE_VERSION}`,
      meta: h('span', null, `${report.totals.headcount} measured · ${report.calibration.events} observed departure(s) · ${pct(report.survivorship.censorShare)} censored`),
      actions: [
        h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanRetention();
            toast(result?.ok ? 'Retention scan complete' : 'The scan could not run', result?.ok ? 'good' : 'bad');
            ctx.refresh?.();
          },
        }, 'Run scan'),
      ],
    }),
    tabs({
      items: TABS,
      active,
      onSelect: (key) => ctx.navigate(`#/retention?tab=${key}`),
      ariaLabel: 'Retention terminal sections',
    }),
    body,
  );
}

/** Nav badge: people outside the watch band with no committed plan. */
export function retentionWatchCount(state, now) {
  try {
    const report = buildRetentionReport(state, { now, settings: state.settings });
    return report.people.filter((row) => ['elevated', 'high'].includes(row.risk.band.key) && row.livePlan?.status !== 'committed').length;
  } catch {
    return 0;
  }
}

export { RETENTION_FACTORS };
