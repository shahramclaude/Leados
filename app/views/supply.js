/**
 * app/views/supply.js — the Evidence Supply Chain (`#/supply`, Schema v79).
 *
 * Six panels over one production system:
 *
 *   Chain       every evidence line as a line: units produced, the floor, the
 *               measured arrival rate, the verdict — and the Little's Law read
 *               of the whole queue
 *   Constraint  the binding line under Theory of Constraints: what it carries,
 *               what improving it is worth, and what improving anything else is
 *               worth (nothing)
 *   Capture     hours to manufacture the shortfall against weeks to wait for it,
 *               line by line, with the declared costs visible and editable
 *   Plan        the bounded weekly schedule, the fractional bound it is measured
 *               against and the exclusions with their reasons
 *   Plans       frozen plans, their live status and their Brier receipts
 *   Method      the estimators, the priors, the assumptions and the refusals
 *
 * The page refuses what it cannot support: a line with no history prints no
 * rate; an expected wait that does not exist prints "no finite wait"; a plan with
 * no members refuses to freeze; and every figure below its evidence floor is
 * blank rather than zero.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey, formatDate } from '../core/time.js';
import { supplyReport } from '../core/domain/supply.js';
import { SUPPLY_LINES } from '../core/domain/supplyRegistry.js';
import { openFreezeSupplyPlanDialog, openSupplyConventionsDialog } from '../ui/supply-modals.js';

const PANELS = [
  { key: 'chain', label: 'The chain' },
  { key: 'constraint', label: 'Constraint' },
  { key: 'capture', label: 'Capture vs wait' },
  { key: 'plan', label: 'This week’s plan' },
  { key: 'plans', label: 'Frozen plans' },
  { key: 'method', label: 'Method' },
];

const VERDICT_TONE = {
  met: 'good',
  filling: 'neutral',
  starved: 'warn',
  retire: 'bad',
  unobserved: 'bad',
};

const CAPTURE_TONE = { capture: 'warn', wait: 'good', either: 'neutral' };

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

function weeks(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'no finite wait';
  if (value === 0) return 'now';
  return `${Number(value).toFixed(value < 10 ? 1 : 0)} week${Math.abs(value) === 1 ? '' : 's'}`;
}

function hours(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(2)} h`;
}

function navigate(ctx, panel, params = {}) {
  const query = new URLSearchParams({ panel });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  ctx.navigate(`#/supply?${query.toString()}`);
}

function verdictBadge(line) {
  return badge(line.verdictLabel, VERDICT_TONE[line.verdict] || 'neutral', line.verdictText);
}

/* ------------------------------------------------------------------ chain */

function chainPanel(ctx, report) {
  const rows = report.lines.map((line) => ({
    line: h('a', { href: `#/supply?panel=capture&line=${encodeURIComponent(line.key)}` }, line.label),
    produces: line.unitLabel,
    holds: `${line.n} / ${line.required}`,
    rate: line.arrivalPerWeek === 0 && line.n === 0
      ? h('span', { class: 'muted' }, 'never produced')
      : `${line.arrivalPerWeek}/wk`,
    recent: line.recentPerWeek ? `${line.recentPerWeek}/wk` : h('span', { class: 'muted' }, '—'),
    eta: line.shortfall > 0 ? weeks(line.medianEtaWeeks) : h('span', { class: 'muted' }, 'answerable'),
    verdict: verdictBadge(line),
    demand: String(line.demandCount),
  }));

  const blocks = [];

  if (!report.counts.demand) {
    blocks.push(banner({
      tone: 'info',
      title: 'No open work is waiting on any of these lines',
      body: 'Every evidence line is measured against the count its consuming instrument needs. Nothing below is a debt — it is inventory with no buyer. The chain will start mattering as soon as you open a call, delegate work with a due date or put a question on the record.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/decisions' }, 'Open decisions')],
    }));
  }

  blocks.push(card({
    title: 'Evidence lines',
    subtitle: `Units are dated records you already keep, counted inside the last ${report.conventions.supplyWindowDays} days. The rate is measured, not assumed; the wait is a Gamma–Poisson posterior predictive, not a guess.`,
    body: report.lines.length
      ? table({
        columns: [
          { key: 'line', header: 'Line' },
          { key: 'produces', header: 'Produces' },
          { key: 'holds', header: 'Units / floor' },
          { key: 'rate', header: 'Rate' },
          { key: 'recent', header: 'Last 6 wk' },
          { key: 'eta', header: 'Median wait to floor' },
          { key: 'demand', header: 'Open demand' },
          { key: 'verdict', header: 'Verdict' },
        ],
        rows,
        caption: 'One row per evidence line. A line with no history shows “never produced” rather than a zero rate — they are different facts.',
      })
      : emptyState({ title: 'No evidence lines', body: 'This workspace holds no dated records for any line yet.' }),
  }));

  blocks.push(card({
    title: 'The queue, read with Little’s Law',
    subtitle: 'L = λW. Queue length, output rate and time in system are one identity, not three facts. This is a diagnostic, not a forecast: it holds demand constant and assumes no re-work.',
    body: h('div', { class: 'grid-cards' },
      stat({ label: 'Open demand', value: String(report.totalDemand), hint: 'items waiting on a judgement' }),
      stat({ label: 'Measured output', value: `${report.totalArrivalPerWeek}/wk`, hint: 'all lines summed' }),
      stat({
        label: 'Queue clearance',
        value: report.queueWeeks === null ? 'never' : weeks(report.queueWeeks),
        tone: report.queueWeeks !== null && report.queueWeeks > 26 ? 'warn' : '',
        hint: report.queueWeeks === null ? 'no line is producing' : 'at the current rate',
      }),
      stat({
        label: 'Capture cost, whole debt',
        value: hours(report.counts.captureHours),
        hint: 'your minutes × every missing unit',
      })),
  }));

  const verdictCards = [
    ['met', 'Answerable now', 'Read the answer; feed nothing.'],
    ['filling', 'Filling on their own', 'Wait; the record is doing the work.'],
    ['starved', 'Starved', 'Waiting is not a plan.'],
    ['retire', 'Retire the question', 'Waiting cannot pay for itself.'],
  ].map(([key, label, hint]) => stat({
    label,
    value: String(report.counts[key] || 0),
    tone: key === 'retire' && report.counts.retire ? 'bad' : key === 'starved' && report.counts.starved ? 'warn' : '',
    hint,
  }));
  blocks.push(card({
    title: 'Verdicts',
    subtitle: 'Five verdicts, each with a printed reason on the line itself. “Starved” and “never produced” are separated on purpose: one is a slow line, the other is a missing one.',
    body: h('div', { class: 'grid-cards' }, ...verdictCards,
      stat({ label: 'Never produced', value: String(report.counts.unobserved || 0), hint: 'no unit of this kind ever' })),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ------------------------------------------------------------- constraint */

function constraintPanel(ctx, report) {
  const b = report.bottleneck;
  if (!b) {
    return card({
      title: 'No constraint',
      subtitle: 'Theory of Constraints only names a constraint when one line carries starved demand. Right now either nothing is waiting, or every waiting line is filling on its own.',
      body: banner({
        tone: 'good',
        title: 'No evidence line is starving the workspace',
        body: 'Every open question sits on a line that will reach its floor inside the horizon at the record’s own rate. The next move is to read what is already answerable, not to gather more.',
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/supply?panel=chain' }, 'Back to the chain')],
      }),
    });
  }
  const line = report.lines.find((row) => row.key === b.key);
  const blocks = [];
  blocks.push(banner({
    tone: b.isBinding ? 'warn' : 'info',
    title: `The constraint is ${b.label.toLowerCase()}`,
    body: `${b.reason}. It carries ${b.demandSharePct}% of open demand, and ${b.starvedSharePct}% of all demand sits on starved lines against your ${report.conventions.supplyBottleneckPct}% bar.`
      + `${b.isBinding ? '' : ' That share is below your bar, so this is the biggest queue rather than a binding constraint — improving another line may still be worth doing.'}`
      + ` Improving any line other than this one does not raise the workspace’s throughput of judgeable questions.`,
    actions: [
      h('a', { class: 'btn btn-small btn-ghost', href: line ? line.consumerRoute : '#/today' },
        `Open ${b.consumerLabel}`),
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => openFreezeSupplyPlanDialog(ctx),
      }, 'Commit hours to it'),
    ],
  }));

  blocks.push(card({
    title: 'Pressure by line',
    subtitle: 'Pressure = open demand × the chance the line does NOT reach its floor inside the horizon. A line that is already full carries none.',
    body: table({
      columns: [
        { key: 'line', header: 'Line' },
        { key: 'demand', header: 'Open demand' },
        { key: 'share', header: 'Share of demand' },
        { key: 'pclear', header: 'Clears in horizon' },
        { key: 'pressure', header: 'Pressure' },
        { key: 'state', header: 'State' },
      ],
      rows: b.ranked.map((row) => ({
        line: row.key === b.key
          ? h('strong', {}, row.label)
          : row.label,
        demand: String(row.demandCount),
        share: pct(row.demandSharePct, 0),
        pclear: row.key === b.key ? pct(line?.pClearBeforeHorizonPct) : '—',
        pressure: String(row.pressure),
        state: row.starved ? badge('starved', 'warn') : badge('filling', 'neutral'),
      })),
      caption: 'Ranked by pressure. The top row is the constraint while it clears your share bar.',
    }),
  }));

  blocks.push(card({
    title: 'What the constraint is actually asking',
    subtitle: 'The question the line exists to make answerable — and the surface that cannot answer it until the line is full.',
    body: h('div', { class: 'stack-sm' },
      kv('Question', line?.question || '—'),
      kv('Blocks', b.consumerLabel),
      kv('Units held', line ? `${line.n} of ${line.required}` : '—'),
      kv('Measured rate', line ? `${line.arrivalPerWeek}/wk (last 6 weeks: ${line.recentPerWeek}/wk)` : '—'),
      kv('Median wait to floor', line ? weeks(line.medianEtaWeeks) : '—'),
      kv('80% interval', line ? `${weeks(line.etaLoWeeks)} – ${weeks(line.etaHiWeeks)}` : '—'),
      kv('Your cost to close it now', line ? hours(line.captureHours) : '—')),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ---------------------------------------------------------------- capture */

function capturePanel(ctx, report) {
  const focus = ctx.query?.get?.('line');
  const blocks = [];
  blocks.push(card({
    title: 'Capture or wait',
    subtitle: `Two ways to fill the same gap: manufacture the units now, or let the record produce them. The exchange rate between your hours and weeks of waiting is your declaration (${report.conventions.supplyCaptureRatio} week(s) saved per hour); the weeks come from the record’s own arrival rate.`,
    body: table({
      columns: [
        { key: 'line', header: 'Line' },
        { key: 'gap', header: 'Missing' },
        { key: 'rate', header: 'Rate' },
        { key: 'wait', header: 'Wait to 50%' },
        { key: 'capture', header: 'Your hours' },
        { key: 'exchange', header: 'Weeks / hour' },
        { key: 'verdict', header: 'Cheaper' },
        { key: 'action', header: '' },
      ],
      rows: report.lines.map((line) => ({
        line: line.key === focus
          ? h('strong', {}, line.label)
          : h('a', { href: `#/supply?panel=capture&line=${encodeURIComponent(line.key)}` }, line.label),
        gap: line.shortfall > 0 ? String(line.shortfall) : h('span', { class: 'muted' }, 'full'),
        rate: line.n === 0 && line.arrivalPerWeek === 0 ? 'none' : `${line.arrivalPerWeek}/wk`,
        wait: line.shortfall > 0 ? weeks(line.medianEtaWeeks) : '—',
        capture: line.shortfall > 0 ? hours(line.captureHours) : '—',
        exchange: line.weeksSavedPerHour === null ? '—' : String(line.weeksSavedPerHour),
        verdict: line.shortfall > 0
          ? badge(line.captureVerdictLabel, CAPTURE_TONE[line.captureVerdict] || 'neutral')
          : badge('nothing to buy', 'neutral'),
        action: line.shortfall > 0
          ? h('a', { class: 'btn btn-small btn-ghost', href: line.consumerRoute }, 'Why it matters')
          : '',
      })),
      caption: 'A missing figure is blank, never zero. “Weeks per hour” is infinite when the wait has no finite mean, and is printed as “—”.',
    }),
  }));

  const focusLine = focus ? report.lines.find((line) => line.key === focus) : null;
  if (focusLine) {
    blocks.push(card({
      title: focusLine.label,
      subtitle: focusLine.question,
      body: h('div', { class: 'stack-sm' },
        kv('Holds', `${focusLine.n} of ${focusLine.required} (${focusLine.nAllTime} lifetime)`),
        kv('Arrival rate', `${focusLine.arrivalPerWeek}/wk measured over ${focusLine.windowWeeks} week(s)`),
        kv('Median wait', weeks(focusLine.medianEtaWeeks)),
        kv('80% interval', `${weeks(focusLine.etaLoWeeks)} – ${weeks(focusLine.etaHiWeeks)}`),
        kv('Expected wait', focusLine.expectedWeeks === null
          ? 'does not exist — fewer than one unit has ever been observed'
          : weeks(focusLine.expectedWeeks)),
        kv('Chance it fills inside the horizon', pct(focusLine.pClearBeforeHorizonPct)),
        kv('One more unit costs you', `${focusLine.minutesPerUnit} min`),
        kv('The whole gap costs you', hours(focusLine.captureHours)),
        kv('Verdict', focusLine.verdictLabel),
        h('p', { class: 'muted small' }, focusLine.verdictText),
        h('a', { class: 'btn btn-small', href: focusLine.consumerRoute }, `Open ${focusLine.consumerLabel}`)),
    }));
  }

  blocks.push(card({
    title: 'Declared costs',
    subtitle: 'The engine can measure the wait. It cannot price your hour. What it does with your number is print the exchange rate and let the schedule follow it.',
    body: h('div', { class: 'stack-sm' },
      ...SUPPLY_LINES.map((meta) => kv(
        meta.label,
        `${report.conventions.supplyMinutesPerUnit[meta.key] ?? meta.defaultMinutes} min per ${meta.unitLabel}`,
      )),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openSupplyConventionsDialog(ctx),
      }, 'Change the declared costs')),
  }));
  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ------------------------------------------------------------------- plan */

function planPanel(ctx, report) {
  const preview = report.preview;
  const blocks = [];
  blocks.push(banner({
    tone: preview.chosen.length ? 'info' : 'warn',
    title: preview.chosen.length
      ? `${preview.chosen.length} line(s) fit inside ${preview.budgetHours} declared hour(s) this week`
      : 'Nothing fits the declared weekly hour budget',
    body: preview.chosen.length
      ? `The schedule commits ${preview.hoursUsed} h of ${preview.budgetHours} h. It is greedy, not optimal — the fractional bound is ${preview.fractionalBound} pressure against ${preview.integerPressure} achieved, so at most ${preview.gap} pressure is left on the table. That gap is printed rather than hidden because a heuristic is not a proof.`
      : `Every candidate line costs more than ${preview.budgetHours} h to close. Either raise the weekly budget, or accept that the refusals stay refused — both are legitimate; pretending a plan exists is not.`,
    actions: [
      h('button', {
        class: 'btn btn-small',
        type: 'button',
        disabled: preview.chosen.length ? undefined : 'disabled',
        onClick: () => openFreezeSupplyPlanDialog(ctx),
      }, 'Freeze this plan'),
    ],
  }));

  blocks.push(card({
    title: 'This week’s schedule',
    subtitle: 'Ranked by pressure per hour of your time — the only exchange rate the engine uses. A line with no open demand is never scheduled: evidence nobody is waiting for is not throughput.',
    body: preview.chosen.length
      ? table({
        columns: [
          { key: 'line', header: 'Line' },
          { key: 'hours', header: 'Hours' },
          { key: 'demand', header: 'Open demand' },
          { key: 'pressure', header: 'Pressure' },
          { key: 'efficiency', header: 'Pressure / hour' },
          { key: 'verdict', header: 'State' },
        ],
        rows: preview.chosen.map((row) => ({
          line: row.label,
          hours: hours(row.captureHours),
          demand: String(row.demandCount),
          pressure: String(row.pressure),
          efficiency: String(row.efficiency),
          verdict: badge(String(row.verdict), VERDICT_TONE[row.verdict] || 'neutral'),
        })),
        caption: `Greedy fill of a ${preview.budgetHours}-hour budget. The fractional (LP-relaxation) bound is ${preview.fractionalBound}; the integer schedule achieves ${preview.integerPressure}.`,
      })
      : emptyState({ title: 'Nothing scheduled', body: 'No line with open demand costs less than the weekly budget.' }),
  }));

  if (preview.leftOut.length) {
    blocks.push(card({
      title: 'Left out — and what it would cost to include',
      subtitle: 'A queue nobody reads is a wish list. These are the lines the budget could not buy this week.',
      body: table({
        columns: [
          { key: 'line', header: 'Line' },
          { key: 'hours', header: 'Hours needed' },
          { key: 'pressure', header: 'Pressure forgone' },
          { key: 'demand', header: 'Open demand' },
        ],
        rows: preview.leftOut.map((row) => ({
          line: row.label,
          hours: hours(row.captureHours),
          pressure: String(row.pressure),
          demand: String(row.demandCount),
        })),
      }),
    }));
  }

  if (preview.exclusions.length) {
    blocks.push(card({
      title: 'Excluded, with the reason',
      subtitle: 'Two ways a line is never scheduled, both printed so the absence is legible.',
      body: h('div', { class: 'stack-sm' },
        ...preview.exclusions.map((row) => {
          const meta = report.lines.find((line) => line.key === row.key);
          return kv(meta ? meta.label : row.key, row.reason);
        })),
    }));
  }

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ------------------------------------------------------------------ plans */

function plansPanel(ctx, report) {
  const focus = ctx.query?.get?.('plan');
  const blocks = [];
  if (!report.plans.length) {
    return card({
      title: 'No frozen plan',
      subtitle: 'A plan is a promise: hours committed, one probability, one review date. Until one is frozen this terminal measures but never predicts.',
      body: emptyState({
        title: 'Nothing frozen yet',
        body: 'Freeze a plan and the workspace records what you committed to manufacture, then grades the promise once, out of sample, with a Brier loss.',
        action: h('button', {
          class: 'btn btn-small',
          type: 'button',
          onClick: () => openFreezeSupplyPlanDialog(ctx),
        }, 'Freeze a plan'),
      }),
    });
  }
  blocks.push(card({
    title: 'Frozen plans',
    subtitle: 'The headline is the Fréchet lower bound — true with no independence assumption — with the independence value printed beside it. A plan is graded once, after its window closes, and never credited early.',
    body: table({
      columns: [
        { key: 'review', header: 'Review on' },
        { key: 'members', header: 'Lines' },
        { key: 'hours', header: 'Hours committed' },
        { key: 'quoted', header: 'Quoted' },
        { key: 'independence', header: 'Under independence' },
        { key: 'live', header: 'Live status' },
        { key: 'grade', header: 'Receipt' },
      ],
      rows: report.plans.slice().reverse().map((plan) => ({
        review: plan.id === focus
          ? h('strong', {}, plan.reviewOn)
          : h('a', { href: `#/supply?panel=plans&plan=${encodeURIComponent(plan.id)}` }, plan.reviewOn),
        members: String(plan.members.length),
        hours: hours(plan.hoursCommitted),
        quoted: pct(plan.predictedAnyClearPct),
        independence: plan.predictedAnyClearIndependencePct === null
          ? '—'
          : pct(plan.predictedAnyClearIndependencePct),
        live: plan.graded
          ? (plan.graded.anyClear ? badge('cleared', 'good') : badge('no line cleared', 'warn'))
          : plan.due
            ? badge('due — ungraded', 'warn')
            : badge('window open', 'neutral'),
        grade: plan.graded
          ? `Brier ${plan.graded.brier}`
          : plan.due
            ? h('button', {
              class: 'btn btn-small',
              type: 'button',
              onClick: () => {
                const result = ctx.api.gradeSupplyPlan(plan.id);
                if (result && result.ok) {
                  toast(`Graded: ${result.result.anyClear ? `${result.result.cleared.length} line(s) cleared` : 'no line cleared'} — Brier ${result.result.brier}.`, 'good');
                  ctx.rerender();
                  return;
                }
                toast((result && result.error) || 'Could not grade the plan.', 'bad');
              },
            }, 'Grade now')
            : h('span', { class: 'muted' }, `after ${plan.reviewOn}`),
      })),
    }),
  }));

  const plan = report.plans.find((row) => row.id === focus);
  if (plan) {
    blocks.push(card({
      title: `Plan frozen ${formatDate(plan.frozenAt)} · review ${plan.reviewOn}`,
      subtitle: `Quoted ${pct(plan.predictedAnyClearPct)} (assumption-free lower bound) · ${pct(plan.predictedAnyClearIndependencePct)} under independence · ${plan.reservePct} percentage points bought by dropping the assumption.`,
      body: h('div', { class: 'stack-sm' },
        table({
          columns: [
            { key: 'line', header: 'Line' },
            { key: 'atFreeze', header: 'At freeze' },
            { key: 'now', header: 'Now' },
            { key: 'eta', header: 'Median wait then' },
            { key: 'pclear', header: 'Quoted chance' },
            { key: 'state', header: 'State' },
          ],
          rows: plan.members.map((member) => ({
            line: member.label,
            atFreeze: `${member.observedN} / ${member.required}`,
            now: member.nowN === null ? '—' : `${member.nowN} / ${member.required}`,
            eta: weeks(member.medianEtaWeeks),
            pclear: pct(member.pClearBeforeHorizonPct),
            state: member.reached === null
              ? badge('unknown', 'neutral')
              : member.reached ? badge('cleared', 'good') : badge('short', 'warn'),
          })),
        }),
        plan.graded
          ? h('p', { class: 'muted small' },
            `Graded ${formatDate(plan.graded.gradedAt)}: ${plan.graded.anyClear ? `${(plan.graded.clearedLines || []).length} line(s) cleared` : 'no line cleared'} · Brier ${plan.graded.brier}.`)
          : h('p', { class: 'muted small' }, 'Not graded. The window closes before this plan can be scored, and grading early would score a claim before its evidence existed.'),
        !plan.graded
          ? h('button', {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              const result = ctx.api.deleteSupplyPlan(plan.id);
              if (result && result.ok) {
                toast('Ungraded plan removed.', 'neutral');
                ctx.rerender();
                return;
              }
              toast((result && result.error) || 'Could not remove the plan.', 'bad');
            },
          }, 'Remove (ungraded only)')
          : null),
    }));
  }
  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------------- method */

function methodPanel(report) {
  return h('div', { class: 'view-stack' }, card({
    title: 'Method, assumptions and refusals',
    subtitle: 'What is measured, what is declared, and what this terminal will not claim.',
    body: h('div', { class: 'stack' },
      h('h4', {}, 'The production model'),
      h('p', {}, 'Every judgement the workspace refuses to make is a work order. This terminal treats those work orders as a production system: an evidence line turns dated records into a judgeable quantity, and a line that cannot reach its floor inside the horizon is not a slow line, it is a constraint. '
        + 'Throughput is the number of questions the workspace can answer, and by Goldratt’s argument that number can only be raised at the constraint. The rope is your declared weekly evidence hours: no plan may commit more.'),
      h('h4', {}, 'The arrival rate'),
      h('p', {}, `Units are counted from dated records inside the declared ${report.conventions.supplyWindowDays}-day window: conclusive assumption settlements, decisions carrying a recorded decision day, delegations that closed, completed review observations (resolved by the reliability terminal's own harvester so the two can never disagree), resolved cases and graded forecasts. `
        + `The rate is those units over that window. The recent rate is the same count over the last six weeks, shown beside it so a line that is speeding up or dying is visible rather than averaged away.`),
      h('h4', {}, 'The wait — Gamma–Poisson, closed form'),
      h('p', {}, 'With n arrivals observed across W weeks and a Jeffreys prior (Gamma shape ½) on the rate, the posterior rate is Gamma(n + ½, W) and the predictive count of arrivals in t more weeks is negative binomial with r = n + ½ and p = W/(W + t). '
        + 'So the survival of the wait to k more arrivals is P(N(t) ≤ k − 1), evaluated term by term. Quantiles are solved by bisection. The expected wait is W·k/(r − 1), which does not exist when fewer than one arrival has been observed — printed as such instead of as a number.'),
      h('h4', {}, 'The verdicts'),
      h('p', {}, `Met: the floor is already reached. Filling: the record reaches it inside ${report.conventions.supplyHorizonDays} days with at least ${report.conventions.supplyStarvePct}% probability. Starved: below that. Retire: starved, with the open work it feeds older than the ${report.conventions.supplyAbandonDays}-day retirement bar — the sunk-cost rule, applied to questions. `
        + 'Never produced: no unit of the kind has ever existed, which no amount of waiting changes.'),
      h('h4', {}, 'The constraint'),
      h('p', {}, `Pressure = open demand × (1 − the chance the line fills inside the horizon). The constraint is the line with the most pressure, and it is only called binding when the share of open demand sitting on starved lines clears your ${report.conventions.supplyBottleneckPct}% bar. When it does not, the page says “the biggest queue, not a binding constraint” rather than borrowing the authority of a word it has not earned.`),
      h('h4', {}, 'The schedule'),
      h('p', {}, 'Pressure per hour of your declared time, filled greedily inside the weekly hour budget. The fractional knapsack value — the same order with the first non-fitting item taken partly — bounds the integer optimum from above, and the gap is printed. A greedy schedule is not an optimum and the page refuses to present it as one.'),
      h('h4', {}, 'The one probability'),
      h('p', {}, 'A frozen plan quotes the probability that at least one planned line clears by its review date. The headline is the Fréchet lower bound max(pᵢ), which is valid with no independence assumption at all; the independence value 1 − Π(1 − pᵢ) is printed beside it and labelled as an assumption. The plan is graded once, after the window closes, by Brier — and a window that closes with nothing cleared is graded, not excused.'),
      h('h4', {}, 'What this terminal refuses'),
      h('ul', {},
        h('li', {}, 'It never manufactures a unit, marks a line full or edits a record to make a line look healthier. Only real dated records fill a line.'),
        h('li', {}, 'It never schedules evidence with no open demand: gathering it would be inventory nobody buys.'),
        h('li', {}, 'It prints no rate for a line with no history, and no expected wait where the mean does not exist.'),
        h('li', {}, 'It never names, rates or ranks a person. Demand counts are aggregates; the only place a person appears is an open review observation, as a unit of the instrument, never as a score.'),
        h('li', {}, 'It does not read confidential conflicts or anonymous pulse responses — neither is an evidence line.'),
        h('li', {}, 'It never changes a floor, a required count or a convention on the leader’s behalf.')),
      h('h4', {}, 'Where the numbers live'),
      h('p', {}, `Schema v79 adds two collections: \`supplyPlans\` (frozen plans, capped at ${report.conventions.supplyPlanCap}, aggregate only — no titles, no names) and \`supplyMarkers\` (rule idempotency tags). Every count, rate, interval and probability is recomputed on read from records the workspace already holds; nothing is cached across a day.`)),
  }));
}

/* ------------------------------------------------------------------ entry */

export function renderSupply(ctx) {
  const { state, now } = ctx;
  const report = supplyReport(state, now, state.settings || {});
  const requested = ctx.query?.get?.('panel') || 'chain';
  const panel = PANELS.some((row) => row.key === requested) ? requested : 'chain';

  const header = pageHeader({
    eyebrow: 'Evidence supply chain',
    title: 'What the workspace cannot yet judge — and what it would cost to change that',
    subtitle: 'Every refusal in this workspace is a work order. This screen turns them into one production line: measured output, the binding constraint, the price of capturing the missing evidence against the price of waiting for it, and a plan you can be graded on.',
    actions: [
      stat({ label: 'Lines below floor', value: `${report.counts.openRefusals} / ${report.counts.lines}` }),
      stat({
        label: 'Constraint',
        value: report.bottleneck ? report.bottleneck.label : 'none',
        tone: report.bottleneck && report.bottleneck.isBinding ? 'warn' : '',
        hint: report.bottleneck ? `${report.bottleneck.demandSharePct}% of open demand` : 'nothing starved',
      }),
      stat({
        label: 'To capture everything',
        value: hours(report.counts.captureHours),
        hint: 'your declared minutes per unit',
      }),
      stat({
        label: 'Ungraded plans',
        value: String(report.ungradedDue),
        tone: report.ungradedDue ? 'warn' : '',
        hint: 'window closed',
      }),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanSupply();
          if (result && result.ok) {
            toast('Scan complete — constraint, capture tasks and grading work reconciled.', 'good');
          } else {
            toast((result && result.error) || 'Could not scan.', 'bad');
          }
        },
      }, 'Scan now'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openSupplyConventionsDialog(ctx),
      }, 'Conventions'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.supplyBriefText();
          if (!downloadText({ filename: `leados-evidence-supply-${dayKey(now)}.txt`, text, mime: 'text/plain' })) {
            toast('Could not start the download. Use Settings & data instead.', 'bad');
          }
        },
      }, 'Export brief'),
    ],
  });

  const tabBar = tabs({
    items: PANELS.map((row) => ({
      key: row.key,
      label: row.label,
      count: row.key === 'plans' ? report.plans.length : undefined,
    })),
    active: panel,
    ariaLabel: 'Evidence supply chain panels',
    onSelect: (key) => navigate(ctx, key),
  });

  const content = panel === 'constraint'
    ? constraintPanel(ctx, report)
    : panel === 'capture'
      ? capturePanel(ctx, report)
      : panel === 'plan'
        ? planPanel(ctx, report)
        : panel === 'plans'
          ? plansPanel(ctx, report)
          : panel === 'method'
            ? methodPanel(report)
            : chainPanel(ctx, report);

  return h('div', { class: 'view-stack' }, header, tabBar, content);
}

export default renderSupply;
