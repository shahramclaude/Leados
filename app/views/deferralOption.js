/**
 * app/views/deferralOption.js — the Deferral Option Terminal (`#/deferral`,
 * Schema v78, ADR-0059/0060/0070).
 *
 * Five panels over one question the rest of the workspace cannot answer:
 * *what is the flexibility to wait worth, and is it worth more than waiting
 * costs?*
 *
 *   Overview    the verdict, the numbers behind it, and the whole queue
 *   Boundary    the exercise boundary over the window, plus premium
 *               sensitivity to volatility and to the carry price
 *   Portfolio   the whole book: declared correlations, the joint tail,
 *               concentration and shared-premise stress (Schema v69)
 *   Frozen      pre-registered frames, graded once against the decision date
 *   Method      the maths, the assumptions, the refusals and the settings
 *
 * The page refuses rather than guesses: a frame with no priced stake, no
 * volatility above the floor or no window prints the reason and no premium.
 */

import { h, toast, openModal } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey, round } from '../core/time.js';
import {
  DEFERRAL_ENGINE_VERSION,
  americanCommitOption,
  deferralBrief,
  deferralReport,
} from '../core/domain/deferralOption.js';
import { openFreezeDeferralDialog } from '../ui/deferral-modals.js';
import { renderPortfolioPanel } from './deferralPortfolioPanel.js';
import { renderCouplingPanel } from './couplingPanel.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'boundary', label: 'Boundary' },
  { key: 'portfolio', label: 'Portfolio' },
  // Schema v78: the ledger that reads the Portfolio tab's declared ρ back
  // against the realised joint timing of the calls it couples.
  { key: 'coupling', label: 'Coupling' },
  { key: 'frozen', label: 'Frozen' },
  { key: 'method', label: 'Method' },
];

function money(amount, currency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function num(value, dp = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: dp });
}

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(dp)}%`;
}

function route(ctx, panel, decisionId = null, overrides = {}) {
  const params = new URLSearchParams();
  params.set('panel', panel);
  if (decisionId) params.set('decision', decisionId);
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
  }
  return `#/deferral?${params.toString()}`;
}

function readOverrides(ctx) {
  const read = (key) => {
    const raw = ctx.query.get(key);
    if (raw === null || raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    commitCost: read('commit'),
    carryPerWeek: read('carry'),
    sigma: read('sigma'),
    horizonDays: read('days'),
  };
}

function verdictTone(id) {
  if (id === 'wait') return 'good';
  if (id === 'commit-now') return 'warn';
  if (id === 'indifferent') return 'neutral';
  if (id === 'act-or-drop') return 'bad';
  return 'neutral';
}

/* --------------------------------------------------------------- overview */

function overviewPanel(ctx, report) {
  const frame = report.focused;
  if (!frame) {
    return emptyState({
      title: 'No open decision carries a priced stake',
      body: 'Link value to an open decision first — a case exposure, a committed budget line, a negotiated stake. An unpriced call cannot be framed: an option premium without a stake would be an invented number.',
      action: h('a', { class: 'btn btn-primary', href: '#/decisions' }, 'Open the decision log'),
    });
  }
  const option = frame.option;
  const overrides = report.overrides || {};
  const candidates = report.candidates || [];

  const hero = card({
    title: `Verdict · ${frame.verdict.label}`,
    subtitle: `${frame.title} · ${frame.currency} · window ends ${frame.deadline}`,
    className: 'dro-hero',
    actions: [
      badge(frame.verdict.label, verdictTone(frame.verdict.id)),
      h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => openFreezeDeferralDialog(ctx, frame),
      }, 'Freeze this frame'),
    ],
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'dro-headline' }, frame.verdict.headline),
      h('p', { class: 'muted small' }, frame.verdict.detail)),
  });

  const stats = h('div', { class: 'stat-row' },
    stat({ label: 'Value at stake', value: money(frame.valueNow, frame.currency), hint: frame.valueBasis }),
    stat({ label: 'Commitment cost', value: money(frame.commitCost, frame.currency), hint: frame.commitBasis }),
    stat({ label: 'Carry of waiting', value: `${money(frame.carryPerWeek, frame.currency)}/wk`, hint: frame.carryBasis }),
    stat({ label: 'Volatility', value: pct(frame.sigma, 1), hint: frame.sigmaSource === 'derived' ? 'derived from your own settled magnitudes' : frame.sigmaSource === 'declared' ? 'declared for this frame' : 'withheld' }),
    stat({ label: 'Window', value: `${frame.horizonDays} day(s)`, hint: `to ${frame.deadline}` }),
    stat({ label: 'Exercise boundary', value: option?.thresholdNow === null || option?.thresholdNow === undefined ? '—' : money(option.thresholdNow, frame.currency), hint: 'Commit at or above this stake' }),
    stat({ label: 'Flexibility premium', value: option ? money(option.premium, frame.currency) : '—', hint: option ? `vs commit-now ${money(option.commitNow, frame.currency)}` : 'withheld' }),
    stat({ label: 'P(commit by deadline)', value: option ? `${option.exerciseProbabilityPct}%` : '—', hint: option ? (option.expectedWaitDays === null ? 'the tree expects no commit before the deadline' : `expected wait ${option.expectedWaitDays} day(s)`) : 'withheld' }));

  const whatIf = card({
    title: 'What-if — declare an input on this frame only',
    subtitle: 'These four inputs are the ones the model cannot derive from the record. A what-if is a URL, not a write: nothing is stored until you freeze.',
    body: h('div', { class: 'dro-whatif' },
      ...['commit', 'carry', 'sigma', 'days'].map((key) => {
        const label = { commit: 'Commitment cost', carry: 'Carry per week', sigma: 'Volatility (e.g. 0.4)', days: 'Window days' }[key];
        const current = overrides[key] ?? (key === 'commit' ? undefined : undefined);
        return h('label', { class: 'dro-field', for: `dro-${key}` },
          h('span', null, label),
          h('input', {
            id: `dro-${key}`,
            type: 'number',
            step: key === 'sigma' ? '0.05' : '1',
            min: '0',
            value: current === undefined ? '' : String(current),
            placeholder: key === 'commit' ? String(round(frame.commitCost, 2))
              : key === 'carry' ? String(round(frame.carryPerWeek, 2))
                : key === 'sigma' ? String(round(frame.sigma, 3))
                  : String(frame.horizonDays),
            onChange: (event) => {
              const raw = event.target.value;
              if (raw === '') {
                ctx.navigate(route(ctx, 'overview', frame.decisionId, { ...overrides, [key]: undefined }));
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              ctx.navigate(route(ctx, 'overview', frame.decisionId, { ...overrides, [key]: n }));
            },
          }));
      }),
      h('button', {
        class: 'btn btn-quiet btn-small',
        type: 'button',
        onClick: () => ctx.navigate(route(ctx, 'overview', frame.decisionId)),
      }, 'Reset to the recorded inputs')),
    meta: null,
  });

  const queue = card({
    title: 'Every priced open call',
    subtitle: 'One row per decision the workspace can price. The verdict is the root of its own binomial tree, not a ranking.',
    body: table({
      caption: 'Deferral frames across the open decision queue',
      columns: [
        { label: 'Decision', render: (row) => h('a', { href: route(ctx, 'overview', row.decisionId) }, row.title) },
        { label: 'Stake', render: (row) => money(row.valueNow, row.currency) },
        { label: 'Commitment', render: (row) => money(row.commitCost, row.currency) },
        { label: 'Carry/wk', render: (row) => money(row.carryPerWeek, row.currency) },
        { label: 'Window', render: (row) => (row.deadline ? `${row.horizonDays}d` : '—') },
        { label: 'Verdict', render: (row) => badge(row.verdict.label, verdictTone(row.verdict.id)) },
        { label: 'Premium', render: (row) => (row.option ? money(row.option.premium, row.currency) : '—') },
      ],
      rows: candidates,
      emptyMessage: 'No open decision carries a priced value at stake.',
    }),
  });

  const withheld = (report.withheld || []).length
    ? card({
      title: `${report.withheld.length} frame(s) withheld`,
      subtitle: 'A refusal is a result. Each one prints the input that is missing instead of a number.',
      body: h('ul', { class: 'stack-sm' },
        ...report.withheld.slice(0, 8).map((row) => h('li', { class: 'small' },
          h('strong', null, `${row.title} — `), row.refusal))),
    })
    : null;

  return h('div', { class: 'stack' }, hero, stats, whatIf, queue, withheld);
}

/* --------------------------------------------------------------- boundary */

function boundaryChart(frame) {
  const option = frame.option;
  if (!option || !option.boundary?.length) {
    return h('p', { class: 'muted' }, 'No boundary is defined for a withheld frame.');
  }
  const width = 640;
  const height = 220;
  const pad = { left: 56, right: 16, top: 14, bottom: 30 };
  const points = option.boundary.filter((row) => row.commitThreshold !== null);
  const values = points.map((row) => row.commitThreshold).concat([frame.valueNow]);
  const minV = Math.min(...values) * 0.98;
  const maxV = Math.max(...values) * 1.02;
  const maxDay = Math.max(1, ...points.map((row) => row.day));
  const x = (day) => pad.left + (width - pad.left - pad.right) * (day / maxDay);
  const y = (value) => height - pad.bottom - (height - pad.top - pad.bottom) * ((value - minV) / Math.max(1e-9, maxV - minV));
  const path = points.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(row.day).toFixed(1)} ${y(row.commitThreshold).toFixed(1)}`).join(' ');
  const stakeY = y(frame.valueNow);
  return h('div', { class: 'dro-chart' },
    h('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Exercise boundary over ${frame.horizonDays} days. The boundary is ${money(option.thresholdNow, frame.currency)} today against a stake of ${money(frame.valueNow, frame.currency)}.`,
    },
    h('line', { x1: pad.left, y1: height - pad.bottom, x2: width - pad.right, y2: height - pad.bottom, stroke: 'var(--border, #d0d5dd)' }),
    h('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: height - pad.bottom, stroke: 'var(--border, #d0d5dd)' }),
    h('line', { x1: pad.left, y1: stakeY, x2: width - pad.right, y2: stakeY, stroke: 'var(--muted, #8b93a7)', 'stroke-dasharray': '4 4' }),
    h('text', { x: pad.left + 4, y: stakeY - 6, fill: 'var(--muted, #8b93a7)', 'font-size': '11' }, `stake ${money(frame.valueNow, frame.currency)}`),
    h('path', { d: path, fill: 'none', stroke: 'var(--accent, #2563eb)', 'stroke-width': 2 }),
    h('text', { x: pad.left, y: height - 8, fill: 'var(--muted, #8b93a7)', 'font-size': '11' }, 'today'),
    h('text', { x: width - pad.right - 40, y: height - 8, fill: 'var(--muted, #8b93a7)', 'font-size': '11' }, `day ${Math.round(maxDay)}`),
    h('text', { x: 4, y: pad.top + 10, fill: 'var(--muted, #8b93a7)', 'font-size': '11' }, money(maxV, frame.currency)),
    h('text', { x: 4, y: height - pad.bottom, fill: 'var(--muted, #8b93a7)', 'font-size': '11' }, money(minV, frame.currency))));
}

function boundaryPanel(ctx, report) {
  const frame = report.focused;
  if (!frame || !frame.option) {
    return emptyState({
      title: 'Nothing to draw',
      body: frame?.refusal || 'Choose a framed call in Overview. A withheld frame has no boundary to plot.',
      action: h('a', { class: 'btn', href: route(ctx, 'overview') }, 'Back to the verdict'),
    });
  }
  const option = frame.option;
  const sigmaRows = [0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0].map((sigma) => {
    const trial = americanCommitOption({
      valueNow: frame.valueNow,
      commitCost: frame.commitCost,
      carryPerWeek: frame.carryPerWeek,
      sigma,
      horizonDays: frame.horizonDays,
      drift: frame.drift,
      discountRate: frame.discountRate,
      steps: 120,
    });
    const materiality = (frame.materiality || 0.01) * frame.valueNow;
    return {
      sigma,
      premium: trial.ok ? trial.premium : null,
      threshold: trial.ok ? trial.thresholdNow : null,
      verdict: !trial.ok ? 'withheld' : trial.immediateExercise || trial.premium < 0.01
        ? 'commit-now' : trial.premium < materiality ? 'indifferent' : 'wait',
    };
  });
  const sensitivity = card({
    title: 'Premium sensitivity to volatility',
    subtitle: 'The same tree re-priced at each volatility. Nothing else changes. The row your derived σ sits in is marked.',
    body: table({
      caption: 'Option premium by annualised volatility',
      columns: [
        { label: 'Volatility', render: (row) => `${h('strong', null, pct(row.sigma, 0))}${Math.abs(row.sigma - frame.sigma) < 0.005 ? ' ← yours' : ''}` },
        { label: 'Premium', render: (row) => (row.premium === null ? '—' : money(row.premium, frame.currency)) },
        { label: 'Boundary', render: (row) => (row.threshold === null ? '—' : money(row.threshold, frame.currency)) },
        { label: 'Verdict', render: (row) => badge(row.verdict.replace('-', ' '), verdictTone(row.verdict)) },
      ],
      rows: sigmaRows,
    }),
  });

  const breakEven = card({
    title: 'Break-even inversions',
    subtitle: 'Both numbers come from bisection on the same tree, not from a formula pasted beside it.',
    body: h('div', { class: 'stack-sm' },
      h('p', null, h('strong', null, 'Carry price: '),
        frame.breakEven.carryPerWeek === null
          ? 'waiting does not pay at any carry price in the tested range — the option is out of the money today.'
          : `waiting stops paying above ${money(frame.breakEven.carryPerWeek, frame.currency)}/week; your frame charges ${money(frame.carryPerWeek, frame.currency)}/week.`),
      h('p', null, h('strong', null, 'Volatility: '),
        frame.breakEven.sigma === null
          ? 'no volatility in the tested range (up to 300%) turns this frame into a wait.'
          : `waiting starts paying at ${pct(frame.breakEven.sigma, 1)} annualised; your frame uses ${pct(frame.sigma, 1)}.`),
      h('p', { class: 'muted small' }, 'Carry is a cash outflow in the frame currency; volatility is annualised. Neither is a market price and neither is added to the Value of Information terminal’s EVSI.'),
      h('p', { class: 'muted small' }, `Tree: ${option.steps} steps · up ${num(option.up, 4)} · down ${num(option.down, 4)} · real-world up probability ${num(option.probabilityUp, 4)} · carry per step ${money(option.carryPerStep, frame.currency)}${option.deterministic ? ' · deterministic (zero-volatility) limit' : ''}.`)),
  });

  const table2 = card({
    title: 'The boundary, step by step',
    subtitle: 'The stake at which committing beats continuing, as the window shortens. A null row means no node in that step exercised.',
    body: table({
      caption: 'Exercise boundary by day',
      columns: [
        { label: 'Day', render: (row) => num(row.day, 1) },
        { label: 'Commit at or above', render: (row) => (row.commitThreshold === null ? '—' : money(row.commitThreshold, frame.currency)) },
        { label: 'Abandon at or below', render: (row) => (row.abandonThreshold === null ? '—' : money(row.abandonThreshold, frame.currency)) },
      ],
      rows: option.boundary,
      emptyMessage: 'No boundary rows at this step count.',
    }),
  });

  return h('div', { class: 'stack' },
    card({ title: 'Exercise boundary', subtitle: 'Commit when the stake is at or above the blue line. Below it, the tree keeps the option alive.', body: boundaryChart(frame) }),
    breakEven,
    sensitivity,
    table2);
}

/* ----------------------------------------------------------------- frozen */

function frozenPanel(ctx, report) {
  const records = report.records || [];
  const calibration = report.calibration || {};
  return h('div', { class: 'stack' },
    card({
      title: 'Pre-registered deferral frames',
      subtitle: 'A frame records one probability — that you commit before the frozen deadline — and is scored once against the recorded decision date.',
      actions: [h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanDeferralOptions();
          toast(result?.warning ? `Scan ran in memory but was NOT SAVED: ${result.warning}`
            : result?.changed ? 'Scan opened grading work or reconciled edges.' : 'Scan complete: nothing new.',
          result?.warning ? 'bad' : result?.changed ? 'good' : 'neutral');
          ctx.navigate(route(ctx, 'frozen'));
        },
      }, 'Scan due work')],
      body: records.length
        ? h('div', { class: 'stack' }, ...records.map((record) => card({
          title: `Frame · ${record.verdict.replace('-', ' ')} · frozen ${record.frozenAt.slice(0, 10)}`,
          subtitle: `${record.currency} ${num(record.valueNow, 2)} stake · commit cost ${num(record.commitCost, 2)} · carry ${num(record.carryPerWeek, 2)}/wk · σ ${pct(record.sigma, 1)} (${record.sigmaSource}) · window ${record.horizonDays}d to ${record.reviewOn}`,
          actions: [
            badge(record.graded ? 'graded once' : record.reviewOn <= report.today ? 'due now' : 'frozen',
              record.graded ? 'good' : record.reviewOn <= report.today ? 'warn' : 'neutral'),
            !record.graded ? h('button', {
              class: 'btn btn-small',
              type: 'button',
              onClick: () => {
                const result = ctx.api.gradeDeferralFrame(record.id);
                if (!result?.ok) {
                  toast(result?.error || 'Could not grade this frame.', 'bad');
                  return;
                }
                toast(result.warning ? `Graded in memory but NOT SAVED: ${result.warning}`
                  : `Graded once: ${result.grade.committedByDeadline ? 'committed by' : 'not committed by'} ${record.reviewOn}; Brier ${result.grade.brier}.`,
                result.warning ? 'bad' : 'good');
                ctx.navigate(route(ctx, 'frozen'));
              },
            }, 'Grade') : null,
            !record.graded ? h('button', {
              class: 'btn btn-small btn-quiet',
              type: 'button',
              onClick: () => {
                const result = ctx.api.deleteDeferralFrame(record.id);
                toast(result?.warning ? `Removed in memory but NOT SAVED: ${result.warning}`
                  : result?.ok ? 'Ungraded frame removed; audit event retained.' : result?.error || 'Delete refused.',
                result?.warning || !result?.ok ? 'bad' : 'neutral');
                if (result?.ok) ctx.navigate(route(ctx, 'frozen'));
              },
            }, 'Delete') : null,
          ].filter(Boolean),
          body: h('div', { class: 'stack-sm' },
            h('p', { class: 'small' }, 'Source: ',
              (ctx.state.decisions || []).some((d) => d.id === record.decisionId)
                ? h('a', { href: `#/decisions?decision=${encodeURIComponent(record.decisionId)}` }, 'Open the original decision')
                : 'Removed from this workspace · the frozen grade is kept for audit and excluded from calibration'),
            h('div', { class: 'stat-row' },
              stat({ label: 'Frozen P(commit by deadline)', value: `${record.predictedCommitByDeadlinePct}%`, hint: `Deadline ${record.reviewOn}` }),
              stat({ label: 'Premium at freeze', value: money(record.premium, record.currency), hint: `Commit-now ${money(record.commitNow, record.currency)}` }),
              stat({ label: 'Boundary at freeze', value: record.threshold === null ? '—' : money(record.threshold, record.currency), hint: 'Commit at or above' }),
              stat({ label: 'Brier', value: record.graded ? String(record.graded.brier) : 'not yet', hint: record.graded ? (record.graded.committedByDeadline ? 'Committed by the deadline' : 'Not committed by the deadline') : 'A later date must settle it' }))),
        }))) : emptyState({
          title: 'No deferral frame has been frozen',
          body: 'Freeze one from the Overview panel. A frame that is written after the deadline is not a prediction.',
          action: h('a', { class: 'btn btn-primary', href: route(ctx, 'overview') }, 'Choose a call'),
        }),
    }),
    card({
      title: 'Calibration',
      subtitle: 'Scored against the workspace’s own observed commit rate, below five graded frames withheld.',
      body: h('div', { class: 'stack-sm' },
        h('p', { class: 'muted' }, calibration.verdict),
        calibration.graded > 0
          ? h('div', { class: 'stat-row' },
            stat({ label: 'Graded frames', value: `${calibration.graded}/${calibration.required}` }),
            stat({ label: 'Brier', value: calibration.brier === null ? '—' : String(calibration.brier) }),
            stat({ label: 'Base-rate Brier', value: calibration.baselineBrier === null ? '—' : String(calibration.baselineBrier) }),
            stat({ label: 'Observed commit rate', value: calibration.baseRate === null ? '—' : `${(calibration.baseRate * 100).toFixed(1)}%` }),
            stat({ label: 'Skill', value: calibration.skill === null ? 'withheld' : String(calibration.skill), hint: 'Positive beats the base rate' }))
          : null),
    }));
}

/* ----------------------------------------------------------------- method */

function methodPanel(ctx, report) {
  const conventions = report.conventions;
  const rows = [
    ['American option to commit (McDonald & Siegel 1986; Dixit & Pindyck 1994; Trigeorgis 1996)', 'The decision is a right, not an obligation: commit now for V − K, or hold the right to commit later at a better V. The optimal policy is a boundary — commit at or above it, keep waiting below it.'],
    ['Cox–Ross–Rubinstein (1979) binomial tree', 'N backward-induction steps with American exercise at every node; the up/down factors scale with √(step), and the same tree reproduces the Black–Scholes–Merton (1973) European price as N grows, which is pinned by test.'],
    ['Decision-analysis measure, not risk-neutral pricing', 'A leadership call has no replicating portfolio, so there is no risk-neutral measure to price it under. The tree runs on the declared real-world drift (default 0) discounted at the declared rate (default 0), and the output is an expected value under that model — never a market price.'],
    ['Carry as a cash outflow, never as drift', 'The weekly carry price is subtracted per step of waiting. Putting it in the drift as well would double count the Cost of Waiting arithmetic, so the drift carries only the leader’s declared growth.'],
    ['Robust volatility from the workspace (Rousseeuw & Croux 1993)', 'σ is 1.4826 × the median absolute deviation of log(realised ÷ assessed) magnitudes — settled case exposure and delivered effort — annualised by root-time scaling with the median observed horizon printed. One catastrophe cannot set the volatility for everything.'],
    ['Bisection inversion', 'The break-even carry price and the break-even volatility are solved on the same tree by bisection, then printed. No closed form is pasted beside an approximation that does not match it.'],
    ['Proper scoring (Brier 1950)', 'One probability is frozen before the deadline and scored once afterwards against the recorded decidedOn date. Skill is compared with the workspace’s own commit rate only from five graded frames.'],
  ];
  return h('div', { class: 'stack' },
    card({
      title: 'The model, in the open',
      body: table({
        caption: 'Deferral Option Terminal methods and what each one actually computes',
        columns: [
          { label: 'Method', render: (row) => h('strong', null, row[0]) },
          { label: 'Operational definition', render: (row) => row[1] },
        ],
        rows,
      }),
    }),
    card({
      title: 'Refusals and guardrails',
      body: h('ul', { class: 'stack-sm' },
        h('li', null, `Volatility is withheld below ${conventions.minObservations} settled observations, or below the ${(conventions.sigmaFloor * 100).toFixed(0)}% floor. A declared σ is labelled declared — the app does not pretend to have derived it.`),
        h('li', null, 'A frame with no priced stake is refused. The class weekly price alone does not reveal the stake, and an option premium without a stake would be invented.'),
        h('li', null, `A premium under ${(conventions.discountRate * 100).toFixed(0)}% discount and the ${(conventions.materiality * 100).toFixed(1)}% materiality floor is reported as indifference, not as advice to postpone.`),
        h('li', null, 'No option is chosen, no date moved, no message sent, no person scored. The frame prices a choice the leader still makes.'),
        h('li', null, 'EVSI is not added to the premium: value of information prices learning about an unobservable state, this prices flexibility under a value that moves. They overlap and must never be summed.'),
        h('li', null, 'GBM with constant σ is a model. No jumps, no stochastic volatility, no learning-by-waiting, no claim that the future resembles the tree.')),
    }),
    card({
      title: 'Settings in force',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Tree steps', value: String(conventions.steps), hint: 'Bounded 20–400' }),
        stat({ label: 'Observation floor', value: String(conventions.minObservations), hint: 'Settled magnitudes' }),
        stat({ label: 'Volatility floor', value: `${(conventions.sigmaFloor * 100).toFixed(0)}%`, hint: 'Annualised' }),
        stat({ label: 'Materiality', value: `${(conventions.materiality * 100).toFixed(1)}%`, hint: 'Premium vs stake' }),
        stat({ label: 'Max window', value: `${conventions.maxHorizonDays}d`, hint: 'Beyond this the frame is capped' }),
        stat({ label: 'Auto propagation', value: conventions.autoPropagate ? 'on' : 'paused', hint: 'Explicit freeze and scan always run' })),
    }),
    card({
      title: 'Model version',
      body: h('p', { class: 'muted small' }, `${DEFERRAL_ENGINE_VERSION} · schema v69 · deterministic, local, no network.`),
    }));
}

/* ------------------------------------------------------------------ page */

export function renderDeferralOption(ctx) {
  const state = ctx.state || {};
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const overrides = readOverrides(ctx);
  const decisionId = ctx.query.get('decision');
  const report = deferralReport(state, now, state.settings || {}, decisionId, overrides);
  const active = PANELS.find((p) => p.key === ctx.query.get('panel'))?.key || 'overview';
  // The Portfolio panel reads the whole book rather than one focused frame,
  // so it renders from its own report and ignores the frame selector.
  const body = active === 'portfolio'
    ? renderPortfolioPanel(ctx)
    : active === 'coupling'
      ? renderCouplingPanel(ctx)
      : { overview: overviewPanel, boundary: boundaryPanel, frozen: frozenPanel, method: methodPanel }[active](ctx, report);
  return h('div', { class: 'stack page' },
    pageHeader({
      eyebrow: 'Schema v78 · ADR-0059/0060/0070',
      title: 'The Deferral Option Terminal',
      subtitle: 'Every other screen prices what waiting costs. This one prices what waiting is worth — and the Portfolio panel reads the whole book of open calls at once.',
      actions: [
        h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            const text = deferralBrief(report, now);
            const saved = downloadText({
              filename: `deferral-option-${dayKey(now)}.txt`,
              text,
              mime: 'text/plain',
            });
            if (!saved) {
              openModal({
                title: 'Copy the deferral brief',
                description: 'This browser blocked the download. Select and copy the text below instead.',
                body: h('textarea', { rows: '18', readOnly: true, value: text, 'aria-label': 'Deferral brief text' }),
              });
            }
          },
        }, 'Save board brief'),
      ],
      meta: h('p', { class: 'muted small' },
        `${report.counts.open} priced call(s) · ${report.counts.frozen} frozen frame(s) · ${report.counts.withheld} withheld · local only · decision analysis, not a market price`),
    }),
    tabs({ items: PANELS, active, ariaLabel: 'Deferral Option panels', onSelect: (panel) => ctx.navigate(route(ctx, panel, report.focusId, report.overrides)) }),
    active !== 'frozen' && active !== 'method' && active !== 'portfolio' && active !== 'coupling' && report.candidates.length
      ? h('div', { class: 'dro-selector' },
        h('label', { for: 'dro-focus' }, 'Frame a different call'),
        h('select', {
          id: 'dro-focus',
          value: report.focusId,
          onChange: (event) => ctx.navigate(route(ctx, active, event.target.value)),
        }, ...report.candidates.map((row) => h('option', {
          value: row.decisionId,
          selected: row.decisionId === report.focusId,
        }, `${row.title} · ${row.currency} ${num(row.valueNow, 0)} · ${row.verdict.label}`))))
      : null,
    body);
}
