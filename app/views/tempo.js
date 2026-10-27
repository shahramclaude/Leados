/**
 * app/views/tempo.js — Decision Tempo & Timing Terminal (`#/tempo`).
 *
 * The terminal answers one question per open decision: decide now, or is the
 * option to wait worth its carrying cost? It shows the delay curve, the optimal
 * decision date, the switch probability, the workspace's own measured latency
 * band and a deterministic board brief. Every number is derived from recorded
 * records by the pure engine in `core/domain/decisionTempo.js`; this file only
 * renders it and routes writes through `ctx.api`.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, table, emptyState, timeline,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate, humanDays } from '../core/time.js';
import {
  TEMPO_ENGINE_VERSION,
  TEMPO_MIN_SAMPLES,
  TEMPO_RULES,
  DECISION_TYPE_HELP,
  DELAY_PROFILE_LABELS,
  TEMPO_SCHEDULE_STATUS_LABELS,
  buildTempoReport,
  evaluateDecisionTiming,
  latencyBand,
} from '../core/domain/decisionTempo.js';
import { openTempoScheduleDialog, openTempoAbandonDialog } from '../ui/tempo-modals.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'timing', label: 'Timing lab' },
  { key: 'ledger', label: 'Timeboxes' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'board', label: 'Board pack' },
];

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency || ''} ${Math.round(Number(amount)).toLocaleString('en-US')}`.trim();
}

function num(value, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
  return unit ? `${text} ${unit}` : text;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

const VERDICT_META = {
  'gather-first': { label: 'Waiting pays', tone: 'caution' },
  'decide-now': { label: 'Decide now', tone: 'good' },
  unpriced: { label: 'Unpriced', tone: 'neutral' },
  'needs-economics': { label: 'Needs edge + uncertainty', tone: 'neutral' },
};

function verdictBadge(timing) {
  const meta = VERDICT_META[timing.verdict] || VERDICT_META.unpriced;
  return badge(meta.label, meta.tone, timing.verdictReason);
}

function valueAtStakeCell(row) {
  if (!row.timing.priced) return h('span', { class: 'muted small' }, 'unpriced');
  return h('span', null,
    h('strong', null, money(row.timing.currency, row.timing.amount)),
    row.timing.amountSource === 'override' ? badge('override', 'caution', 'Value override recorded by the leader') : null,
  );
}

/* --------------------------------------------------------------- curve chart */

function timingCurve(timing) {
  const points = timing.curve || [];
  if (!points.length) return emptyState({ title: 'No timing curve', body: 'Record the edge and the uncertainty to price the option to wait.' });
  const W = 720;
  const H = 240;
  const pad = { left: 54, right: 16, top: 14, bottom: 30 };
  const maxDay = points.at(-1)?.day || 1;
  const values = points.flatMap((p) => [p.evsi, p.delayCost, p.net]);
  const maxVal = Math.max(1, ...values.map((v) => Math.abs(v)));
  const x = (day) => pad.left + ((W - pad.left - pad.right) * day) / maxDay;
  const y = (value) => pad.top + ((H - pad.top - pad.bottom) * (maxVal - value)) / (2 * maxVal);
  const path = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const best = timing.bestPlan;
  const bestX = best ? x(best.day) : null;
  const summary = `Timing curve over ${maxDay} days. Information value peaks at ${money(timing.currency, Math.max(...points.map((p) => p.evsi)))}; carrying cost reaches ${money(timing.currency, Math.max(...points.map((p) => p.delayCost)))}. Best plan: ${best ? `${best.day} days` : '—'}.`;
  return h('div', { class: 'tempo-chart' },
    h('svg', {
      viewBox: `0 0 ${W} ${H}`,
      class: 'tempo-chart-svg',
      role: 'img',
      'aria-label': summary,
      preserveAspectRatio: 'xMidYMid meet',
    },
      h('line', { x1: pad.left, y1: zeroY, x2: W - pad.right, y2: zeroY, class: 'tempo-axis' }),
      h('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: H - pad.bottom, class: 'tempo-axis' }),
      bestX !== null ? h('line', { x1: bestX, y1: pad.top, x2: bestX, y2: H - pad.bottom, class: 'tempo-best-line' }) : null,
      h('path', { d: path('evsi'), class: 'tempo-line tempo-line-info' }),
      h('path', { d: path('delayCost'), class: 'tempo-line tempo-line-delay' }),
      h('path', { d: path('net'), class: 'tempo-line tempo-line-net' }),
      h('text', { x: pad.left, y: H - 8, class: 'tempo-axis-label' }, 'today'),
      h('text', { x: W - pad.right, y: H - 8, class: 'tempo-axis-label', 'text-anchor': 'end' }, `+${maxDay}d`),
      h('text', { x: pad.left - 8, y: pad.top + 4, class: 'tempo-axis-label', 'text-anchor': 'end' }, `+${Math.round(maxVal).toLocaleString('en-US')}`),
      h('text', { x: pad.left - 8, y: H - pad.bottom, class: 'tempo-axis-label', 'text-anchor': 'end' }, `−${Math.round(maxVal).toLocaleString('en-US')}`),
      bestX !== null ? h('text', { x: bestX + 4, y: pad.top + 12, class: 'tempo-axis-label' }, `best: day ${best.day}`) : null,
    ),
    h('ul', { class: 'tempo-legend' },
      h('li', null, h('span', { class: 'tempo-swatch tempo-swatch-info' }), 'Value of information (EVSI)'),
      h('li', null, h('span', { class: 'tempo-swatch tempo-swatch-delay' }), 'Carrying cost of delay'),
      h('li', null, h('span', { class: 'tempo-swatch tempo-swatch-net' }), 'Net value of waiting'),
    ),
    h('p', { class: 'muted tiny' }, 'Information value is a preposterior expectation, so it can never exceed the value of perfect information. Carrying cost is the integral of the chosen delay profile, capped at the value at stake.'),
  );
}

/* ------------------------------------------------------------------- tabs */

function overviewTab(ctx, report) {
  const perCurrency = report.totals.byCurrency;
  const rows = report.rows.map((row) => ({ ...row, className: row.debtDays > 0 ? 'tempo-row-debt' : '' }));

  const stats = h('div', { class: 'stat-grid' },
    stat({ label: 'Open decisions', value: String(report.totals.openDecisions), hint: `${report.totals.pricedDecisions} priced from linked records`, tone: '' }),
    stat({ label: 'Decision debt', value: String(report.totals.decisionDebt), hint: report.totals.decisionDebt ? 'Past decide-by or type guardrail' : 'Nothing overdue', tone: report.totals.decisionDebt ? 'bad' : 'good' }),
    stat({
      label: 'Value at stake',
      value: perCurrency.length ? money(perCurrency[0].currency, perCurrency[0].amount) : 'unpriced',
      hint: perCurrency.length > 1 ? `+${perCurrency.length - 1} other currency (never summed)` : 'Derived from linked records only',
      tone: '',
    }),
    stat({ label: 'Timeboxes', value: `${report.totals.armed} armed`, hint: `${report.totals.proposed} proposed · ${report.totals.settled} settled`, tone: '' }),
  );

  const queue = table({
    caption: 'Open decisions ranked by cost of delay per unit of decision duration (CD3)',
    columns: [
      { label: 'Decision', render: (r) => h('div', { class: 'stack-xs' },
        h('a', { class: 'link', href: '#/decisions', onClick: (e) => { e.preventDefault(); ctx.navigate('#/decisions'); } }, r.decision.title),
        h('span', { class: 'muted tiny' }, `${r.timing.ageDays}d old · ${r.timing.typeLabel}${r.schedule ? ` · ${TEMPO_SCHEDULE_STATUS_LABELS[r.schedule.status].toLowerCase()}` : ''}`),
      ) },
      { label: 'Value at stake', render: (r) => valueAtStakeCell(r) },
      { label: 'Cost / week', render: (r) => h('span', null, money(r.timing.currency, r.timing.ratePerWeek), h('span', { class: 'muted tiny' }, ` (${r.timing.rateSource})`)) },
      { label: 'CD3', className: 'num', render: (r) => h('strong', null, num(r.cd3)) },
      { label: 'Timing', render: (r) => h('div', { class: 'stack-xs' },
        h('span', { class: 'small' }, r.decisionDebt ? badge(`${r.debtDays}d late`, 'bad', 'Decision debt') : h('span', { class: 'muted small' }, `decide by ${formatDate(r.timing.decideBy, { withYear: false })}`)),
        verdictBadge(r.timing),
      ) },
      { label: 'Timebox', render: (r) => h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        'data-testid': `tempo-model-${r.decision.id}`,
        onClick: () => openTempoScheduleDialog(ctx, r.decision, { existing: r.schedule }),
      }, r.schedule ? 'Edit timebox' : 'Model timing') },
    ],
    rows,
    emptyMessage: 'No open decisions. Record one in Decisions and the tempo engine will price it from whatever it is linked to.',
  });

  return h('div', { class: 'stack-md' },
    stats,
    report.totals.decisionDebt
      ? banner({
          tone: 'bad',
          title: `${report.totals.decisionDebt} decision(s) are past their own decide-by date`,
          body: 'Decision debt is the one leadership cost that never appears on a budget line. RULE-DLY-02 opens one owned, blameless timeboxed delegation per overdue call — the app never makes the call for you.',
          actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/tempo?tab=ledger' }, 'Open timeboxes')],
        })
      : banner({
          tone: 'good',
          title: 'No decision debt recorded',
          body: 'Every open decision is inside its type guardrail. Guardrails are workspace conventions, not standards: adjust them in Calibration if they do not match how this team works.',
        }),
    card({ title: 'Cost-of-delay queue', subtitle: 'Ranked by CD3 = cost of delay ÷ decision duration. A rank, never a currency amount.', body: queue }),
    card({
      title: 'How the queue is priced',
      subtitle: 'Reinertsen (2009) cost of delay · Raiffa–Schlaifer (1961) preposterior EVSI · Dixit–Pindyck (1994) option to wait',
      body: h('div', { class: 'prose small' },
        h('p', null, 'Delay is priced from the value that linked records put at stake — open case exposure, encumbered budget lines, portfolio value, negotiated stakes — split by currency and never added across currencies. A decision with no linked money is labelled unpriced instead of being given a zero.'),
        h('p', null, 'The option to wait is priced with a normal prior on the believed edge, resolved by evidence at a stated half-life. The expected gain from information is the preposterior expectation of the positive part of that normal, so it is exact rather than simulated and always below the value of perfect information.'),
        h('p', null, 'Decisions are classified delegated / cross-cutting / big-bet from recorded evidence (reversibility, participants, linked records, veto players, money), following McKinsey’s decision taxonomy. Each class carries its own guardrail.'),
      ),
    }),
  );
}

function timingTab(ctx, report) {
  const selectedId = ctx.query.get('decision') || report.rows[0]?.decision.id || null;
  const row = report.rows.find((r) => r.decision.id === selectedId) || report.rows[0] || null;
  if (!row) {
    return emptyState({
      title: 'No open decision to model',
      body: 'Record a decision first; the timing lab prices the option to wait on the decision you select.',
      action: h('a', { class: 'btn btn-primary', href: '#/decisions' }, 'Open decisions'),
    });
  }
  const timing = row.timing;
  const decision = row.decision;
  const selector = h('select', {
    id: 'tempo-decision-select',
    'aria-label': 'Decision to model',
    onChange: (e) => ctx.navigate(`#/tempo?tab=timing&decision=${encodeURIComponent(e.target.value)}`),
  }, ...report.rows.map((r) => h('option', { value: r.decision.id }, `${r.decision.title} — CD3 ${r.cd3}`)));
  selector.value = decision.id;

  const scenarios = table({
    caption: 'Net value of waiting at fixed horizons',
    columns: [
      { label: 'Wait', render: (s) => h('span', null, s.day === 0 ? 'Decide today' : `${s.day} days`) },
      { label: 'Date', render: (s) => h('span', { class: 'muted small' }, formatDate(s.date, { withYear: false })) },
      { label: 'Value of information', className: 'num', render: (s) => money(timing.currency, s.evsi) },
      { label: 'Carrying cost', className: 'num', render: (s) => money(timing.currency, s.delayCost) },
      { label: 'Evidence cost', className: 'num', render: (s) => money(timing.currency, s.infoCost) },
      { label: 'Net', className: 'num', render: (s) => h('strong', { class: s.net >= 0 ? 'tempo-net-pos' : 'tempo-net-neg' }, money(timing.currency, s.net)) },
      { label: 'Flip risk', className: 'num', render: (s) => (s.switchProbability === null ? '—' : pct(s.switchProbability)) },
    ],
    rows: timing.scenarios,
  });

  return h('div', { class: 'stack-md' },
    h('div', { class: 'field tempo-selector' },
      h('label', { class: 'field-label', for: 'tempo-decision-select' }, 'Decision'),
      selector,
    ),
    banner({
      tone: VERDICT_META[timing.verdict]?.tone === 'good' ? 'good' : timing.verdict === 'gather-first' ? 'caution' : 'info',
      title: `${timing.title} — ${VERDICT_META[timing.verdict]?.label || timing.verdict}`,
      body: timing.verdictReason,
      actions: [
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openTempoScheduleDialog(ctx, decision, { existing: row.schedule }) }, row.schedule ? 'Edit timebox' : 'Arm timebox'),
        h('a', { class: 'btn btn-small btn-ghost', href: '#/decisions' }, 'Open decision log'),
      ],
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Value at stake', value: money(timing.currency, timing.amount), hint: timing.amountSource === 'derived' ? 'Derived from linked records' : timing.amountSource === 'override' ? 'Leader override recorded' : 'Nothing priced yet' }),
      stat({ label: 'Cost of delay', value: `${money(timing.currency, timing.ratePerWeek)}/wk`, hint: `${DELAY_PROFILE_LABELS[timing.profile].split('—')[0].trim()} profile · ${timing.rateSource}` }),
      stat({ label: 'Optimal wait', value: timing.canPriceInformation ? `${timing.bestPlan.day} days` : '—', hint: timing.canPriceInformation ? `Net ${money(timing.currency, timing.gainFromBestPlan)} better than deciding now` : 'Record the edge and uncertainty' }),
      stat({ label: 'Information horizon', value: timing.informationHorizonDays === null ? '—' : `${timing.informationHorizonDays} days`, hint: 'After this day, information is worth less than the wait' }),
    ),
    card({ title: 'Delay curve', subtitle: `Half-life ${timing.halfLifeDays} days · erosion window ${timing.windowWeeks} weeks · ${timing.infoPlanDays ? `${timing.infoPlanDays}-day evidence plan` : 'no evidence plan recorded'}`, body: timingCurve(timing) }),
    card({ title: 'Scenario table — “what if I wait?”', subtitle: 'Every row is the same closed-form model at a different horizon; nothing is a simulation draw.', body: scenarios }),
    card({
      title: 'Why this decision is classified the way it is',
      subtitle: `${timing.typeLabel} · guardrail ${timing.guardrailDays} days · ${DECISION_TYPE_HELP[timing.type]}`,
      body: h('ul', { class: 'plain-list' },
        ...timing.typeReasons.map((reason) => h('li', null, reason)),
        h('li', null, `Age ${timing.ageDays} days; ${timing.decideBy ? `decide-by ${formatDate(timing.decideBy)} (${humanDays(timing.dueInDays)})` : 'no decide-by date recorded'}.`),
      ),
    }),
    card({
      title: 'Value at stake, line by line',
      subtitle: 'Every term is traceable to a record; the schedule is derived, not typed.',
      body: row.valuation.terms.length
        ? h('ul', { class: 'tempo-terms' }, ...row.valuation.terms.map((t) => h('li', null,
            h('span', { class: 'tempo-term-label' }, t.label),
            h('span', { class: 'tempo-term-value' }, t.amount !== null && t.amount !== undefined ? money(t.currency, t.amount) : `${num(t.days)} person-days`),
            h('span', { class: 'muted tiny tempo-term-basis' }, t.basis),
            t.route ? h('a', { class: 'link tiny', href: t.route, onClick: (e) => { e.preventDefault(); ctx.navigate(t.route); } }, 'open source') : null,
          )))
        : h('p', { class: 'muted small' }, 'No money is linked to this decision. Link a case, budget line, portfolio item or negotiation — or record a value override in the timebox dialog.'),
    }),
  );
}

function ledgerTab(ctx, report) {
  const schedules = (ctx.state.tempoSchedules || []).slice().sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)));
  const decisionById = new Map((ctx.state.decisions || []).map((d) => [d.id, d]));
  if (!schedules.length) {
    return emptyState({
      title: 'No timeboxes yet',
      body: 'RULE-DLY-03 proposes a timebox whenever an open decision has money linked to it. You can also arm one from any decision.',
      action: h('a', { class: 'btn btn-primary', href: '#/tempo' }, 'Back to the queue'),
    });
  }
  const decision = (s) => decisionById.get(s.decisionId);
  const actionsFor = (s) => {
    const target = decision(s);
    if (!target) return h('span', { class: 'muted tiny' }, 'decision missing');
    const actions = [];
    if (s.status === 'proposed') {
      actions.push(h('button', {
        class: 'btn btn-small btn-primary', type: 'button', 'data-testid': `tempo-arm-${s.id}`,
        onClick: () => openTempoScheduleDialog(ctx, target, { existing: s }),
      }, 'Arm'));
      actions.push(h('button', {
        class: 'btn btn-small btn-ghost', type: 'button',
        onClick: () => {
          const result = ctx.api.deleteTempoSchedule(s.id);
          toast(result.ok ? 'Proposal deleted' : result.error, result.ok ? 'good' : 'bad');
          ctx.refresh();
        },
      }, 'Discard'));
    } else if (s.status === 'armed') {
      actions.push(h('button', {
        class: 'btn btn-small btn-ghost', type: 'button',
        onClick: () => openTempoScheduleDialog(ctx, target, { existing: s }),
      }, 'Edit'));
      actions.push(h('button', {
        class: 'btn btn-small btn-ghost', type: 'button',
        onClick: () => openTempoAbandonDialog(ctx, s, target.title),
      }, 'Abandon'));
    }
    return h('div', { class: 'tempo-row-actions' }, ...actions);
  };

  const cards = schedules.slice(0, 40).map((s) => {
    const target = decision(s);
    const valuation = target ? report.rows.find((r) => r.decision.id === target.id)?.valuation : null;
    const timing = target ? evaluateDecisionTiming({ decision: target, valuation: valuation || { dominant: null, terms: [] }, schedule: s, now: ctx.now, settings: ctx.state.settings }) : null;
    const statusTone = s.status === 'armed' ? 'good' : s.status === 'proposed' ? 'caution' : s.status === 'abandoned' ? 'bad' : 'neutral';
    return card({
      id: `tempo-${s.id}`,
      title: target ? target.title : 'Decision (missing)',
      subtitle: `${TEMPO_SCHEDULE_STATUS_LABELS[s.status]} · ${DELAY_PROFILE_LABELS[s.profile]} · decide by ${formatDate(s.decideBy)}`,
      actions: [badge(s.status, statusTone), ...(actionsFor(s) ? [actionsFor(s)] : [])],
      body: h('div', { class: 'stack-sm' },
        h('div', { class: 'tempo-facts' },
          h('div', null, h('span', { class: 'muted tiny' }, 'Value at stake'), h('strong', null, money(s.currency, s.valueAtStakeOverride ?? s.derivedAmount))),
          h('div', null, h('span', { class: 'muted tiny' }, 'Cost / week'), h('strong', null, timing ? money(timing.currency, timing.ratePerWeek) : '—')),
          h('div', null, h('span', { class: 'muted tiny' }, 'Edge believed'), h('strong', null, s.advantageAmount === null ? 'not recorded' : money(s.currency, s.advantageAmount))),
          h('div', null, h('span', { class: 'muted tiny' }, 'Uncertainty'), h('strong', null, s.uncertaintyPct === null ? 'not recorded' : `${s.uncertaintyPct}%`)),
          h('div', null, h('span', { class: 'muted tiny' }, 'Evidence plan'), h('strong', null, s.infoWeeks ? `${s.infoWeeks} week(s)` : 'none')),
          h('div', null, h('span', { class: 'muted tiny' }, s.status === 'settled' ? 'Realised latency' : 'Timing verdict'), h('strong', null, s.status === 'settled' ? (s.realizedLatencyDays === null ? 'unmeasured' : `${s.realizedLatencyDays} days`) : (timing ? VERDICT_META[timing.verdict]?.label : '—'))),
        ),
        hintForStatus(s),
        (s.history || []).length ? timeline(s.history.slice(-4).map((e) => ({ date: e.on, label: e.action, detail: e.note }))) : null,
      ),
    });
  });

  return h('div', { class: 'stack-md' },
    banner({
      tone: 'info',
      title: `${schedules.filter((s) => s.status === 'armed').length} armed · ${schedules.filter((s) => s.status === 'proposed').length} proposal(s) awaiting your call`,
      body: 'A proposal is never armed automatically: the engine derives the money and the date, but the believed edge and the uncertainty are yours to record. Arming writes the position into the audit trail.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/tempo?tab=calibration' }, 'Tempo calibration')],
    }),
    ...cards,
  );
}

function hintForStatus(schedule) {
  if (schedule.status === 'proposed') {
    return h('p', { class: 'muted small' }, 'Proposed by RULE-DLY-03 from linked records. Arming it records the decision date you are committing to; discarding it removes an unarmed suggestion only.');
  }
  if (schedule.status === 'armed') {
    return h('p', { class: 'muted small' }, 'Armed timebox. RULE-DLY-02 opens exactly one owned delegation if the date passes with the decision still open, and RULE-DLY-04 refreshes the derived value when a linked record moves by more than 20%.');
  }
  if (schedule.status === 'settled') {
    return h('p', { class: 'muted small' }, `Settled when the call was recorded${schedule.resolvedChoice ? `: “${schedule.resolvedChoice}”` : ''}. The realised latency feeds the empirical band; the frozen plan is kept beside the outcome instead of being rewritten.`);
  }
  return h('p', { class: 'muted small' }, schedule.abandonReason ? `Abandoned: ${schedule.abandonReason}` : 'Abandoned without a written reason.');
}

function calibrationTab(ctx, report) {
  const settings = ctx.state.settings;
  const latency = report.latency;
  const setGuardrail = (key, label) => h('div', { class: 'field' },
    h('label', { class: 'field-label', for: `tempo-${key}` }, label),
    h('input', {
      id: `tempo-${key}`,
      type: 'number',
      min: '1',
      value: String(settings[key] ?? ''),
      onChange: (e) => {
        const value = Number(e.target.value);
        if (!Number.isFinite(value) || value < 1) {
          toast('A guardrail must be at least one day.', 'bad');
          return;
        }
        const result = ctx.api.updateSettings({ [key]: Math.round(value) });
        toast(result.ok ? 'Guardrail updated' : result.error, result.ok ? 'good' : 'bad');
        ctx.refresh();
      },
    }),
  );

  const rows = table({
    caption: 'Measured decision latency by decision type, with the empirical band',
    columns: [
      { label: 'Decision type', render: (r) => h('div', { class: 'stack-xs' }, h('strong', null, r.label), h('span', { class: 'muted tiny' }, DECISION_TYPE_HELP[r.type])) },
      { label: 'Measured', className: 'num', render: (r) => (r.band.sufficient ? `${r.band.n}` : `counts only (${r.band.n})`) },
      { label: 'Median', className: 'num', render: (r) => (r.band.medianDays === null ? '—' : `${r.band.medianDays} d`) },
      { label: 'p80', className: 'num', render: (r) => (r.band.sufficient ? `${r.band.p80Days} d` : `needs n≥${TEMPO_MIN_SAMPLES}`) },
      { label: 'Guardrail', className: 'num', render: (r) => `${r.guardrailDays} d` },
      { label: 'Status', render: (r) => (r.band.sufficient ? (r.breach ? badge('breach', 'bad') : badge('inside guardrail', 'good')) : badge('insufficient evidence', 'neutral')) },
    ],
    rows: latency.rows,
  });

  return h('div', { class: 'stack-md' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Measured latencies', value: String(latency.totalMeasured), hint: `Unmeasured settled decisions: ${latency.unmeasured}` }),
      stat({ label: 'Workspace p80', value: latency.all.sufficient ? `${latency.all.p80Days} d` : `n<${TEMPO_MIN_SAMPLES}`, hint: latency.all.sufficient ? `Coverage ≥ ${latency.all.coverageBound}` : 'Counts only until five latencies exist' }),
      stat({ label: 'Coverage target', value: `${settings.tempoCoveragePct ?? 80}%`, hint: 'Distribution-free, finite-sample bound reported' }),
      stat({ label: 'Breaches', value: String(report.breaches.length), hint: 'RULE-DLY-05 opens one DACI decision per class', tone: report.breaches.length ? 'bad' : 'good' }),
    ),
    card({ title: 'Latency band by decision type', subtitle: 'Measured from the day a decision was logged to the day it was actually made. Legacy records without that stamp are counted as unmeasured, never inferred.', body: rows }),
    card({
      title: 'Guardrails (workspace conventions)',
      subtitle: 'Management conventions, not standards. McKinsey-style decision types differ in how fast they should move; set them to match this team, then measure against them.',
      body: h('div', { class: 'field-row' },
        setGuardrail('tempoDelegatedMaxDays', 'Delegated (days)'),
        setGuardrail('tempoCrossCuttingMaxDays', 'Cross-cutting (days)'),
        setGuardrail('tempoBigBetMaxDays', 'Big-bet (days)'),
        setGuardrail('tempoInfoHalfLifeDays', 'Evidence half-life (days)'),
      ),
    }),
    card({
      title: 'What the band means — and does not',
      subtitle: 'Split conformal order statistic over the leader’s own settled decisions',
      body: h('div', { class: 'prose small' },
        h('p', null, `With n measured latencies, the ${Math.ceil((TEMPO_MIN_SAMPLES + 1) * ((settings.tempoCoveragePct ?? 80) / 100))}-th order statistic gives a finite-sample coverage bound of k/(n+1) for the next decision of the same class, assuming future decisions are exchangeable with past ones.`),
        h('p', null, `Below n=${TEMPO_MIN_SAMPLES} nothing is shown but counts: a two-sample “band” would be a rumour with a decimal point.`),
        h('p', null, 'This is a planning range for a class of decisions, not a score of any person, and not proof about any single call.'),
      ),
    }),
  );
}

function boardTab(ctx, report) {
  const brief = report.board.text;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      toast('Tempo brief copied', 'good');
    } catch {
      toast('Clipboard blocked — select the text instead.', 'bad');
    }
  };
  const download = () => {
    const ok = downloadText({ filename: `leados-decision-tempo-${report.generatedOn}.txt`, text: brief, mime: 'text/plain;charset=utf-8' });
    toast(ok ? 'Tempo brief downloaded' : 'Download blocked by the browser', ok ? 'good' : 'bad');
  };
  const downloadCsv = () => {
    const result = ctx.exportCSV('decisionTempo');
    if (!result.ok) { toast(result.error || 'Could not export the tempo CSV.', 'bad'); return; }
    const ok = downloadText({ filename: result.filename, text: result.csv, mime: 'text/csv;charset=utf-8' });
    toast(ok ? 'Decision tempo CSV downloaded' : 'Download blocked by the browser', ok ? 'good' : 'bad');
  };
  return h('div', { class: 'stack-md' },
    card({
      title: 'Board-ready decision tempo brief',
      subtitle: `Generated ${formatDate(ctx.now)} · deterministic · no network call · engine ${TEMPO_ENGINE_VERSION}`,
      actions: [
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: copy }, 'Copy brief'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: downloadCsv }, 'Download CSV'),
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: download }, 'Download brief'),
      ],
      body: h('pre', { class: 'fi-brief', tabindex: '0', 'aria-label': 'Board-ready decision tempo brief' }, brief),
    }),
    card({
      title: 'Automation behind this terminal',
      subtitle: 'Event-driven, idempotent, inside the store transaction',
      body: h('ul', { class: 'plain-list' },
        ...TEMPO_RULES.map((rule) => h('li', null,
          h('strong', null, `${rule.id} · ${rule.name}`),
          h('span', { class: 'muted tiny' }, ` — ${rule.description} (${rule.framework})`),
        )),
      ),
    }),
    card({
      title: 'What this brief does not claim',
      body: h('div', { class: 'prose small' },
        h('p', null, 'It is not a person-performance score, a financial forecast, or a claim that faster decisions cause better outcomes. It is a transparent, local record of the timing position of the decisions this leader has recorded.'),
        h('p', null, 'Every carrying-cost figure is a derived convention unless a rate was recorded explicitly. Confidential conflicts and anonymous pulse responses are never read by this engine.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ render */

export function renderTempo(ctx) {
  const report = buildTempoReport(ctx.state, { now: ctx.now, settings: ctx.state.settings });
  const requested = ctx.query.get('tab') || 'overview';
  const active = TABS.some((t) => t.key === requested) ? requested : 'overview';
  const paused = ctx.state.settings.tempoAutoPropagate === false;

  const header = pageHeader({
    eyebrow: 'Decision economics',
    title: 'Decision tempo',
    subtitle: 'Every open decision as a timed position: what waiting costs, what waiting buys, and when to call it.',
    meta: `Schema v28 · engine ${TEMPO_ENGINE_VERSION} · ${report.rows.length} open decision(s) · ${report.totals.decisionDebt} in debt`,
    actions: [
      h('a', { class: 'btn btn-ghost', href: '#/decisions' }, 'Decision log'),
      h('a', { class: 'btn btn-ghost', href: '#/forecasts' }, 'Forecast integrity'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        'data-testid': 'tempo-scan',
        onClick: () => {
          const result = ctx.api.scanDecisionTempo();
          toast(result.ok ? (result.changed ? 'Tempo scan complete — records created' : 'Tempo scan complete — nothing new to propagate') : result.error, result.ok ? 'good' : 'bad');
          ctx.refresh();
        },
      }, 'Run tempo scan'),
    ],
  });

  const tabBar = tabs({
    items: TABS.map((t) => ({
      ...t,
      count: t.key === 'ledger'
        ? (ctx.state.tempoSchedules || []).filter((s) => s.status === 'proposed').length || undefined
        : t.key === 'overview' ? report.totals.decisionDebt || undefined : undefined,
    })),
    active,
    onSelect: (key) => ctx.navigate(key === 'overview' ? '#/tempo' : `#/tempo?tab=${key}`),
    ariaLabel: 'Decision tempo sections',
  });

  const body = active === 'timing' ? timingTab(ctx, report)
    : active === 'ledger' ? ledgerTab(ctx, report)
      : active === 'calibration' ? calibrationTab(ctx, report)
        : active === 'board' ? boardTab(ctx, report)
          : overviewTab(ctx, report);

  return h('div', { class: 'page' },
    header,
    paused
      ? banner({ tone: 'caution', title: 'Automatic tempo propagation is paused', body: 'Existing timeboxes stay readable and the read-side model still computes. An explicit “Run tempo scan” still works; no record is created by linked events while paused.' })
      : null,
    tabBar,
    body,
  );
}

/** Nav badge + Today card both count the same thing: decisions in debt. */
export function tempoDebtCount(state, now) {
  return buildTempoReport(state, { now, settings: state.settings }).totals.decisionDebt;
}

/** Compact Today card: the three most expensive open calls, and why. */
export function tempoTodayCard(ctx) {
  const report = buildTempoReport(ctx.state, { now: ctx.now, settings: ctx.state.settings });
  if (!report.rows.length) return null;
  const top = report.rows.slice(0, 3);
  return card({
    title: 'Decision tempo',
    subtitle: report.totals.decisionDebt
      ? `${report.totals.decisionDebt} decision(s) past their decide-by date`
      : 'Ranked by cost of delay per unit of decision duration (CD3)',
    actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/tempo' }, 'Open tempo terminal')],
    body: h('ul', { class: 'plain-list' },
      ...top.map((row) => h('li', null,
        h('strong', null, row.decision.title),
        h('span', { class: 'muted small' }, ` — CD3 ${row.cd3}${row.timing.priced ? `, ${money(row.timing.currency, row.timing.amount)} at stake` : ', unpriced'}${row.decisionDebt ? `, ${row.debtDays}d in debt` : ''}. `),
        h('span', { class: 'small' }, VERDICT_META[row.timing.verdict]?.label || row.timing.verdict),
      )),
      report.waitingPays.length
        ? h('li', { class: 'muted small' }, `${report.waitingPays.length} decision(s) where a named evidence plan is worth more than deciding today.`)
        : null,
    ),
  });
}
