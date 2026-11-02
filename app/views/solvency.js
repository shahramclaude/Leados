/**
 * app/views/solvency.js — the Promise Solvency Terminal (`#/solvency`, Schema v80).
 *
 * Six panels over one liability book:
 *
 *   Book      every open promise the workspace holds, by source, with the
 *             measured reliability of that source, the overdue list and the
 *             maturity ladder
 *   Risk      the joint breach probability with the assumption-free bounds beside
 *             it, a ρ sensitivity table, and the marginal contribution of every
 *             exposure — which is what ranks a repair queue
 *   Capacity  the coverage ratio, the measured settlement and arrival rates,
 *             Little's Law, and what happens to coverage if capacity falls
 *   Repair    the queue: the sentence to say for each promise worth renegotiating
 *             (and the decision to make where a date has already hit its cap)
 *   Frozen    the readings, their grades and the price of the correlation
 *             assumption
 *   Method    every convention, estimator and refusal, in one place
 *
 * The view is a read adapter: it computes nothing and stores nothing. Every
 * figure comes from `solvencyReport`, which derives it from the workspace on each
 * render.
 */

import { h, toast, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table, emptyState, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import {
  breachCountDistribution,
  jointBreachRisk,
  solvencyReport,
  solvencySkill,
} from '../core/domain/solvency.js';
import { SOLVENCY_BUCKETS } from '../core/domain/solvencyRegistry.js';
import {
  openFreezeSolvencyDialog,
  openRenegotiatePromiseDialog,
  openSolvencyConventionsDialog,
} from '../ui/solvency-modals.js';

const PANELS = [
  { key: 'book', label: 'The book' },
  { key: 'risk', label: 'Breach risk' },
  { key: 'capacity', label: 'Coverage' },
  { key: 'repair', label: 'Repair queue' },
  { key: 'frozen', label: 'Frozen readings' },
  { key: 'method', label: 'Method & refusals' },
];

const SOURCE_VERDICT_TONE = { reliable: 'good', watch: 'warn', unreliable: 'bad', unproven: 'neutral' };
const REPAIR_TONE = { renegotiate: 'warn', decide: 'bad', watch: 'neutral', 'let-run': 'good' };

const num = (v, dp = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp));
const pct = (v, dp = 1) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(dp)}%`);
const days = (v) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  if (Number(v) === 0) return 'today';
  return Number(v) > 0 ? `${v} day(s) late` : `in ${Math.abs(v)} day(s)`;
};

function nav(ctx, panel, extra = {}) {
  const q = new URLSearchParams();
  q.set('panel', panel);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  ctx.navigate(`#/solvency?${q.toString()}`);
}

/* ------------------------------------------------------------------ book */

function bookPanel(ctx, report) {
  const blocks = [];

  if (!report.counts.open) {
    blocks.push(banner({
      tone: 'info',
      title: 'No promise is outstanding',
      body: 'Nothing in this workspace currently carries a date it owes to someone. A delegation, a call with a review date, a goal, a follow-up, a stakeholder cadence or a hiring date will appear here the moment it is recorded — this terminal never invents one.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/delegations' }, 'Open delegations')],
    }));
  }

  if (report.counts.overdue) {
    blocks.push(banner({
      tone: 'bad',
      title: `${report.counts.overdue} promise(s) are already past their date`,
      body: `The oldest is ${Math.abs(report.overduePromises[0].daysUntil)} day(s) late. A promise nobody has renegotiated is not a small delay — it is a breach the other side already knows about and you have not acknowledged. The repair queue carries the sentence to say for each one.`,
      actions: [h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => nav(ctx, 'repair'),
      }, 'Open the repair queue')],
    }));
  }

  const sourceRows = report.sources.map((source) => ({
    source: h('a', { href: `#/solvency?panel=book&source=${encodeURIComponent(source.key)}` }, source.label),
    owedTo: source.counterparty === 'person' ? 'people' : source.counterparty === 'org' ? 'the organisation' : 'outsiders',
    settled: String(source.settledN),
    onTime: source.onTimePct === null ? h('span', { class: 'muted' }, '—') : `${pct(source.onTimePct)}`,
    interval: source.onTimeInterval
      ? `${pct(source.onTimeInterval.loPct)}–${pct(source.onTimeInterval.hiPct)}`
      : h('span', { class: 'muted' }, '—'),
    median: source.medianOffsetDays === null ? h('span', { class: 'muted' }, '—') : `${num(source.medianOffsetDays, 1)} d`,
    open: String(source.openCount),
    overdue: source.overdueCount ? String(source.overdueCount) : h('span', { class: 'muted' }, '0'),
    priced: source.pricedBy === 'own' ? badge('Own history', 'good')
      : source.pricedBy === 'pool' ? badge('Class pool', 'neutral', source.classLabel)
        : badge('Unpriced', 'warn', 'No measurable history in this source or its counterparty class'),
    verdict: badge(source.verdictLabel, SOURCE_VERDICT_TONE[source.verdict] || 'neutral', source.verdictText),
  }));

  blocks.push(card({
    title: 'Promise sources',
    subtitle: `Settlement offsets are measured over the last ${report.method.windowDays} days. A source prices the book only from its own settled record; when it cannot, it may borrow from its counterparty class, and that borrowing is labelled. The on-time share carries a Wilson 95% interval, because a share of six promises is not a share of sixty.`,
    body: table({
      columns: [
        { label: 'Source', render: (row) => row.source },
        { label: 'Owed to', render: (row) => row.owedTo },
        { label: 'Settled', render: (row) => row.settled },
        { label: 'On time', render: (row) => row.onTime },
        { label: 'Interval', render: (row) => row.interval },
        { label: 'Median', render: (row) => row.median },
        { label: 'Open', render: (row) => row.open },
        { label: 'Late', render: (row) => row.overdue },
        { label: 'Priced by', render: (row) => row.priced },
        { label: 'Reading', render: (row) => row.verdict },
      ],
      rows: sourceRows,
      caption: 'One row per promise source',
      emptyMessage: 'No promise source is registered.',
    }),
  }));

  blocks.push(card({
    title: 'Maturity ladder',
    subtitle: 'Promises falling due inside the horizon, bucketed by when they fall due. The capacity column is what your own settlement rate would deliver in that window; where nothing is due the ratio is blank rather than infinite.',
    body: table({
      columns: [
        { label: 'Window', render: (row) => row.bucket },
        { label: 'Promises', render: (row) => row.count },
        { label: 'Stakes', render: (row) => row.weight },
        { label: 'Expected breaches', render: (row) => row.expected },
        { label: 'Worst PD', render: (row) => row.worst },
        { label: 'Capacity in window', render: (row) => row.capacity },
        { label: 'Coverage', render: (row) => row.coverage },
      ],
      rows: report.ladder.map((bucket) => ({
        bucket: bucket.label,
        count: String(bucket.count),
        weight: num(bucket.weightSum, 1),
        expected: num(bucket.expectedBreaches, 2),
        worst: bucket.maxPdPct === null ? h('span', { class: 'muted' }, '—') : pct(bucket.maxPdPct),
        capacity: bucket.capacity === null ? h('span', { class: 'muted' }, '—') : num(bucket.capacity, 2),
        coverage: bucket.coverage === null
          ? h('span', { class: 'muted' }, '—')
          : h('span', { class: bucket.coverage < 1 ? 'text-bad' : '' }, `${num(bucket.coverage, 2)}×`),
      })),
      caption: 'Maturity ladder',
    }),
  }));

  const openRows = report.book.filter((p) => !p.overdue).slice(0, 25).map((p) => ({
    promise: h('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      onClick: () => openRenegotiatePromiseDialog(ctx, { sourceKey: p.sourceKey, promiseId: p.promiseId }),
    }, p.label.length > 70 ? `${p.label.slice(0, 70)}…` : p.label),
    source: p.sourceLabel,
    due: p.obligationOn,
    until: days(p.daysUntil),
    pd: p.pdPct === null ? badge('Unpriced', 'neutral') : pct(p.pdPct),
    moves: p.moves ? String(p.moves) : h('span', { class: 'muted' }, '0'),
    record: h('a', { href: p.route }, 'Source record'),
  }));

  blocks.push(card({
    title: 'Open promises',
    subtitle: 'Each row is a real record in another module. The probability is read from that source\u2019s own settled history; “unpriced” means the record cannot measure it, not that it is safe.',
    body: openRows.length
      ? table({
        columns: [
          { label: 'Promise', render: (row) => row.promise },
          { label: 'Source', render: (row) => row.source },
          { label: 'Owed for', render: (row) => row.due },
          { label: 'Position', render: (row) => row.until },
          { label: 'P(breaks)', render: (row) => row.pd },
          { label: 'Moves', render: (row) => row.moves },
          { label: 'Record', render: (row) => row.record },
        ],
        rows: openRows,
        caption: 'Open promises',
        emptyMessage: 'Nothing is outstanding.',
      })
      : emptyState({
        title: 'Nothing outstanding',
        body: 'Every promise this workspace knows about has been settled.',
      }),
  }));

  return h('div', { class: 'stack' }, ...blocks);
}

/* ------------------------------------------------------------------ risk */

function riskPanel(ctx, report) {
  const j = report.joint;
  const rhoSensitivity = [0, 10, 20, 30, 40, 50, 60, 75, 90].map((rhoPct) => {
    const result = jointBreachRisk({ pds: report.exposures.map((p) => p.pd), rho: rhoPct / 100 });
    return {
      rho: `${rhoPct}%`,
      any: pct(result.pAny * 100),
      delta: rhoPct === report.method.rhoPct ? h('span', { class: 'muted' }, 'declared') : '',
      current: rhoPct === report.method.rhoPct,
    };
  });

  const blocks = [];

  blocks.push(card({
    title: 'The joint breach probability',
    subtitle: `A book of promises breaks together or separately depending on one thing: whether they all feed on the same capacity. That is what the declared ρ of ${report.method.rhoPct}% measures. The interval below is assumption-free — it holds under every possible dependence structure.`,
    body: h('div', { class: 'stack-xs' },
      table({
        columns: [
          { label: 'Reading', render: (row) => row.label },
          { label: 'P(at least one breach)', render: (row) => row.value },
          { label: 'What it assumes', render: (row) => row.note },
        ],
        rows: [
          { label: 'Copula at your declared ρ', value: pct(j.anyPct), note: `one-factor Gaussian, ρ = ${report.method.rhoPct}% — the graded claim` },
          { label: 'Independence', value: pct(j.independencePct), note: 'no promise affects any other; almost never true for one leader' },
          { label: 'Comonotonic floor', value: pct(j.comonotonicPct), note: 'all promises fail together — the most concentrated book (Fréchet lower bound)' },
          { label: 'Fréchet ceiling', value: pct(j.frechetHighPct), note: 'min(1, Σ pᵢ) — the assumption-free upper bound; printed, never graded, because a bound that reads 100% is a constant rather than a forecast' },
        ],
        caption: 'Joint breach probability under four readings',
      }),
      h('p', { class: 'small muted' },
        `Expected breaches — the one figure that needs no dependence assumption at all: `,
        h('strong', {}, `${num(j.expectedBreaches, 2)} across ${report.counts.withinHorizon} promise(s)`),
        ` (${pct(j.breachSharePct)} of the forward book). The probability of at least one breach saturates as the book grows; the expected count does not, which is why the alarm is set on the share.`),
    ),
  }));

  const pds = report.exposures.map((p) => p.pd);
  const declaredDist = breachCountDistribution({ pds, rho: report.method.rhoPct / 100 });
  const independentDist = breachCountDistribution({ pds, rho: 0 });
  const ladder = [];
  let cumulative = 0;
  for (let k = 0; k < declaredDist.pmf.length && k <= 14; k += 1) {
    cumulative += declaredDist.pmf[k];
    ladder.push({
      k: String(k),
      declared: `${(declaredDist.pmf[k] * 100).toFixed(1)}%`,
      independent: `${(independentDist.pmf[k] * 100).toFixed(1)}%`,
      cumulative: `${(cumulative * 100).toFixed(1)}%`,
      atRisk: Math.abs(k - j.expectedBreaches) <= 1,
    });
  }
  blocks.push(card({
    title: 'The count you are actually signing',
    subtitle: `A frozen reading does not sign “will anything break” — it signs “how many”. Both columns share the same ${pds.length} breach probabilities and differ only in whether the promises are allowed to break together. This is the forecast that gets scored when the window closes.`,
    body: h('div', { class: 'stack-xs' },
      table({
        columns: [
          { label: 'Promises broken', render: (row) => row.k },
          { label: `P(at declared ρ = ${report.method.rhoPct}%)`, render: (row) => row.declared },
          { label: 'P(if independent)', render: (row) => row.independent },
          { label: 'Cumulative', render: (row) => row.cumulative },
        ],
        rows: ladder,
        caption: 'Distribution of the number of breaches',
      }),
      h('p', { class: 'small muted' },
        `Row sums to 100%. The mean of both distributions is ${num(j.expectedBreaches, 2)} — the expected count is the same under every dependence structure, which is exactly why it is the figure quoted first.`),
    ),
  }));

  blocks.push(card({
    title: 'How much does the correlation choice matter?',
    subtitle: 'The same exposures re-priced at every ρ. If the answer barely moves, the correlation argument is not worth having; if it moves a lot, the declaration is the most consequential number on the page.',
    body: table({
      columns: [
        { label: 'Declared ρ', render: (row) => row.rho },
        { label: 'P(any breach)', render: (row) => row.any },
        { label: 'Position', render: (row) => row.delta },
      ],
      rows: rhoSensitivity,
      caption: 'Correlation sensitivity',
    }),
  }));

  const exposureRows = report.repair.slice(0, 20).map((row) => ({
    promise: h('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      onClick: () => openRenegotiatePromiseDialog(ctx, { sourceKey: row.sourceKey, promiseId: row.promiseId }),
    }, row.label.length > 64 ? `${row.label.slice(0, 64)}…` : row.label),
    source: row.sourceLabel,
    due: row.obligationOn,
    pd: pct(row.pdPct),
    contribution: `${num(row.contributionPct, 2)} pp`,
    weight: num(row.weight, 1),
    leave: num(row.leaveLoss, 2),
    ask: num(row.askCost, 2),
    verdict: badge(row.verdictLabel, REPAIR_TONE[row.verdict] || 'neutral'),
  }));

  blocks.push(card({
    title: 'Marginal contribution — what ranks the queue',
    subtitle: 'An exposure\u2019s own probability is not its contribution to the book. The contribution is how far the book\u2019s joint probability falls when that promise is removed (Euler/Tasche allocation applied to breach probability), and it is the number that decides what is worth asking for.',
    body: exposureRows.length
      ? table({
        columns: [
          { label: 'Exposure', render: (row) => row.promise },
          { label: 'Source', render: (row) => row.source },
          { label: 'Due', render: (row) => row.due },
          { label: 'P(breaks)', render: (row) => row.pd },
          { label: 'Contribution', render: (row) => row.contribution },
          { label: 'Stakes', render: (row) => row.weight },
          { label: 'Cost to leave', render: (row) => row.leave },
          { label: 'Cost to ask', render: (row) => row.ask },
          { label: 'Move', render: (row) => row.verdict },
        ],
        rows: exposureRows,
        caption: 'Exposures ranked',
        emptyMessage: 'No exposure falls due inside the horizon with a measurable history.',
      })
      : emptyState({
        title: 'Nothing is priced inside the horizon',
        body: 'Either no promise falls due in the window, or no source has settled enough promises to price one. The method panel says which.',
        action: h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => nav(ctx, 'method') }, 'Open the method'),
      }),
  }));

  return h('div', { class: 'stack' }, ...blocks);
}

/* -------------------------------------------------------------- capacity */

function capacityPanel(ctx, report) {
  const c = report.capacity;
  const blocks = [];

  if (c.coverageRatio === null) {
    blocks.push(banner({
      tone: 'warn',
      title: 'No coverage ratio is quoted',
      body: c.servicePerWeek === 0
        ? 'Nothing has settled inside the window, so there is no measured capacity to divide by. A ratio of zero would read as a fact about the book when it is a fact about the record.'
        : 'Nothing falls due in the next four weeks, so there is nothing to cover. The ratio is blank rather than infinite.',
    }));
  }

  blocks.push(card({
    title: 'Coverage',
    subtitle: 'A declared analogue of a liquidity coverage ratio: what falls due in the next four weeks against what your own record actually settles in four weeks. It is an analogue, not a regulation, and it is denominated in promises — not effort.',
    body: h('div', { class: 'stack-xs' },
      kv('Promises due in 28 days', String(c.dueNext28)),
      kv('Measured settlement rate', `${num(c.servicePerWeek, 2)} / week`),
      kv('New promises opened', `${num(c.arrivalsPerWeek, 2)} / week`),
      kv('Utilisation (arrivals ÷ settlements)', c.utilisation === null ? '—' : `${num(c.utilisation, 2)}×`),
      kv('Whole book clears in', c.clearanceWeeks === null ? 'not at this rate' : `${num(c.clearanceWeeks, 1)} week(s)`),
      kv('Coverage ratio', c.coverageRatio === null ? 'refused' : `${num(c.coverageRatio, 2)}×`, c.coverageRatio !== null && c.coverageRatio < 1 ? 'text-bad' : ''),
      h('p', { class: 'small muted' },
        'Little\u2019s Law (L = λW) is an identity, not a forecast: an open book of L promises against a measured settlement rate λ implies a clearance time, holding demand constant. If utilisation is above 1×, the book grows and no amount of clearing closes it.'),
    ),
  }));

  blocks.push(card({
    title: 'If capacity falls',
    subtitle: 'Deterministic arithmetic on the measured rate — a what-if, not a prediction. Each row answers: at this share of today\u2019s capacity, how many of the next four weeks\u2019 promises could not be served?',
    body: table({
      columns: [
        { label: 'Capacity', render: (row) => row.capacityPct },
        { label: 'Promises serveable in 28d', render: (row) => row.capacity },
        { label: 'Due in 28d', render: (row) => row.due },
        { label: 'Coverage', render: (row) => row.coverage },
        { label: 'Cannot serve', render: (row) => row.shortfall },
      ],
      rows: c.stress.map((row) => ({
        capacityPct: `${row.capacityPct}%`,
        capacity: num(row.capacity, 2),
        due: String(row.due28),
        coverage: row.coverage === null ? h('span', { class: 'muted' }, '—') : `${num(row.coverage, 2)}×`,
        shortfall: row.shortfall === null ? h('span', { class: 'muted' }, '—') : String(row.shortfall),
      })),
      caption: 'Capacity stress',
    }),
  }));

  if (report.unpricedPromises.length) {
    blocks.push(card({
      title: 'Promises the record cannot price',
      subtitle: 'These are counted, never assumed safe. A source with no measurable history — and no measurable counterparty class — cannot price anything, and this list is what that refusal costs.',
      body: table({
        columns: [
          { label: 'Promise', render: (row) => row.promise },
          { label: 'Source', render: (row) => row.source },
          { label: 'Due', render: (row) => row.due },
          { label: 'Position', render: (row) => row.position },
          { label: 'Record', render: (row) => row.record },
        ],
        rows: report.unpricedPromises.map((p) => ({
          promise: p.label.length > 64 ? `${p.label.slice(0, 64)}…` : p.label,
          source: p.sourceLabel,
          due: p.obligationOn,
          position: days(p.daysUntil),
          record: h('a', { href: p.route }, 'Source record'),
        })),
        caption: 'Unpriced promises',
      }),
    }));
  }

  return h('div', { class: 'stack' }, ...blocks);
}

/* ---------------------------------------------------------------- repair */

function repairPanel(ctx, report) {
  const blocks = [];
  const queue = report.repair.filter((row) => row.verdict === 'renegotiate' || row.verdict === 'decide');

  if (!queue.length && !report.overduePromises.length) {
    blocks.push(banner({
      tone: 'good',
      title: 'Nothing in the forward book is worth the ask',
      body: 'Every priced exposure costs less to leave than to renegotiate at your declared multiplier, and nothing is overdue. That is what a book inside its capacity looks like — freeze a reading so the claim can be graded later.',
    }));
  }

  for (const row of queue.slice(0, 6)) {
    blocks.push(card({
      title: `${row.verdict === 'decide' ? 'Decide, do not move' : 'Renegotiate'} · ${row.sourceLabel}`,
      subtitle: `Due ${row.obligationOn} · P(breaks) ${pct(row.pdPct)} · ${num(row.contributionPct, 2)} pp of the book · moved ${row.moves} of ${report.method.maxMoves} time(s)`,
      actions: [
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          onClick: () => openRenegotiatePromiseDialog(ctx, { sourceKey: row.sourceKey, promiseId: row.promiseId }),
        }, row.verdict === 'decide' ? 'Record the decision' : 'Move the date'),
        h('a', { class: 'btn btn-small btn-ghost', href: row.route }, 'Source record'),
      ],
      body: h('div', { class: 'stack-xs' },
        h('p', {}, row.repairScript),
        kv('Leaving it', `${num(row.leaveLoss, 2)} declared trust unit(s)`),
        kv('Asking now', `${num(row.askCost, 2)} declared trust unit(s)`),
        kv('Expected saving', `${num(row.expectedSaving, 2)} unit(s)`),
      ),
    }));
  }

  if (report.overduePromises.length) {
    blocks.push(card({
      title: 'Already broken — say it before it is discovered',
      subtitle: 'These are not risks; they are breaches. The only remaining choice is whether the other side hears it from you.',
      body: table({
        columns: [
          { label: 'Promise', render: (row) => row.promise },
          { label: 'Source', render: (row) => row.source },
          { label: 'Was due', render: (row) => row.due },
          { label: 'Late by', render: (row) => row.late },
          { label: 'Moves', render: (row) => row.moves },
          { label: 'Record', render: (row) => row.record },
        ],
        rows: report.overduePromises.map((p) => ({
          promise: p.label.length > 66 ? `${p.label.slice(0, 66)}…` : p.label,
          source: p.sourceLabel,
          due: p.obligationOn,
          late: `${Math.abs(p.daysUntil)} d`,
          moves: String(p.moves),
          record: h('a', { href: p.route }, 'Source record'),
        })),
        caption: 'Overdue promises',
      }),
    }));
  }

  if (report.repair.some((row) => row.verdict === 'watch' || row.verdict === 'let-run')) {
    blocks.push(card({
      title: 'Not yet worth the ask',
      subtitle: 'Shown so the queue is a judgement rather than a filter. Watching is a decision; it is just one that costs nothing yet.',
      body: table({
        columns: [
          { label: 'Promise', render: (row) => row.promise },
          { label: 'P(breaks)', render: (row) => row.pd },
          { label: 'Cost to leave', render: (row) => row.leave },
          { label: 'Cost to ask', render: (row) => row.ask },
          { label: 'Reading', render: (row) => row.verdict },
        ],
        rows: report.repair
          .filter((row) => row.verdict === 'watch' || row.verdict === 'let-run')
          .slice(0, 12)
          .map((row) => ({
            promise: row.label.length > 66 ? `${row.label.slice(0, 66)}…` : row.label,
            pd: pct(row.pdPct),
            leave: num(row.leaveLoss, 2),
            ask: num(row.askCost, 2),
            verdict: badge(row.verdictLabel, REPAIR_TONE[row.verdict] || 'neutral'),
          })),
        caption: 'Watch list',
      }),
    }));
  }

  return h('div', { class: 'stack' }, ...blocks);
}

/* ---------------------------------------------------------------- frozen */

function frozenPanel(ctx, report) {
  const skill = solvencySkill(report.readings);
  const blocks = [];

  if (!report.readings.length) {
    blocks.push(banner({
      tone: 'info',
      title: 'No reading has been frozen',
      body: 'A frozen reading records what the book\u2019s breach probability was, on a day, for a set of named promises — and commits to being graded once the window closes. Without one, this terminal can describe the book but cannot tell you whether it prices it well.',
      actions: [h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => openFreezeSolvencyDialog(ctx),
      }, 'Freeze a reading')],
    }));
  }

  if (skill.n) {
    blocks.push(card({
      title: 'What the grades say',
      subtitle: 'Brier loss is lower when better. The promise-level score is the honest one: one probability against one outcome, sixteen times over, weighted by how many promises each reading scored. The joint claim carries one observation per reading, so it is reported beside the promise-level score rather than instead of it.',
      body: h('div', { class: 'stack-xs' },
        kv('Graded readings', `${skill.n} · ${skill.scored} promise(s) scored individually`),
        kv('Brier — every promise priced', num(skill.brier, 4)),
        kv('Brier — the book\u2019s own breach rate (climatology)', skill.brierRef === null ? 'refused: nothing varied' : num(skill.brierRef, 4)),
        kv('Brier skill vs climatology', skill.skill === null ? 'withheld below five grades' : num(skill.skill, 3)),
        kv('Brier — the binary claim as signed', skill.brierJoint === null ? '—' : `${num(skill.brierJoint, 4)} — one observation per reading, so never the headline`),
        kv('RPS — the number of promises that broke', skill.countRps === null ? '—' : `${num(skill.countRps, 3)} vs ${num(skill.countRpsIndependence, 3)} under independence`),
        kv('Log score — same counts, in nats', skill.countLog === null ? '—' : `${num(skill.countLog, 3)} vs ${num(skill.countLogIndependence, 3)} under independence`),
        kv('Value of declaring correlation', skill.countGainRps === null ? '—' : `${num(skill.countGainRps, 3)} RPS${skill.countGainRps < 0 ? ' — independence scored better' : ''}`),
      ),
    }));
  }

  blocks.push(card({
    title: 'Frozen readings',
    subtitle: 'Each reading is one artefact quoted as a whole: the exposures, the probabilities and the horizon. A reading whose window has closed can be graded once; a reading whose promises have all been deleted lapses rather than being excused.',
    body: report.readings.length
      ? table({
        columns: [
          { label: 'Frozen', render: (row) => row.frozen },
          { label: 'Review', render: (row) => row.review },
          { label: 'Exposures', render: (row) => row.exposures },
          { label: 'P(any) / ceiling', render: (row) => row.any },
          { label: 'Expected', render: (row) => row.expected },
          { label: 'Coverage', render: (row) => row.coverage },
          { label: 'Status', render: (row) => row.status },
          { label: 'Action', render: (row) => row.actions },
        ],
        rows: report.readings.map((reading) => ({
          frozen: String(reading.frozenAt).slice(0, 10),
          review: reading.reviewOn,
          exposures: String(reading.exposures.length),
          any: `${pct(reading.predictedAnyBreachPct)} / ${reading.predictedCeilingPct === null ? '—' : pct(reading.predictedCeilingPct)}`,
          expected: reading.expectedBreaches === null || reading.expectedBreaches === undefined ? '—' : num(reading.expectedBreaches, 2),
          coverage: reading.coverageRatio === null ? h('span', { class: 'muted' }, '—') : `${num(reading.coverageRatio, 2)}×`,
          status: reading.graded
            ? badge(
              reading.graded.lapsed ? 'Lapsed' : reading.graded.anyBreach ? `Broke · ${reading.graded.breachedCount} of ${reading.graded.considered}` : 'Held',
              reading.graded.lapsed ? 'neutral' : reading.graded.anyBreach ? 'warn' : 'good',
              reading.graded.brier === null
                ? 'Nothing left to score'
                : `Brier ${reading.graded.brier} over ${reading.graded.scored} promise(s) · base ${reading.graded.brierRef} · ${reading.graded.breachedCount} broke, RPS ${reading.graded.countRps ?? '—'} vs ${reading.graded.countRpsIndependence ?? '—'} independent`,
            )
            : reading.windowOpen ? badge(`Frozen · ${reading.reviewOn}`, 'neutral') : badge('Due for grading', 'warn'),
          actions: reading.graded
            ? h('span', { class: 'muted small' }, 'graded once')
            : h('span', { class: 'row-actions' },
              reading.gradeable
                ? h('button', {
                  class: 'btn btn-small',
                  type: 'button',
                  onClick: () => {
                    const result = ctx.api.gradeSolvencyReadingNow(reading.id);
                    if (result && result.ok) {
                      toast(result.grade.lapsed
                        ? 'The reading lapsed: every frozen promise has been deleted, so there is nothing left to score.'
                        : `Graded: ${result.result.breached.length} of ${result.result.considered} broke · Brier ${result.result.brier}.`, 'good');
                      ctx.refresh();
                      return;
                    }
                    toast((result && result.error) || 'Could not grade the reading.', 'bad');
                  },
                }, 'Grade now')
                : null,
              h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                onClick: () => confirmDialog({
                  title: 'Delete this reading?',
                  message: 'An ungraded reading can be deleted. A graded one cannot — it is part of the calibration record.',
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => {
                    const result = ctx.api.deleteSolvencyReading(reading.id);
                    if (result && result.ok) {
                      toast('Reading removed.', 'good');
                      ctx.refresh();
                      return;
                    }
                    toast((result && result.error) || 'Could not delete the reading.', 'bad');
                  },
                }),
              }, 'Delete')),
          })),
        caption: 'Frozen readings',
      })
      : emptyState({ title: 'No readings yet', body: 'Freeze one to make the claim gradeable.' }),
  }));

  return h('div', { class: 'stack' }, ...blocks);
}

/* ---------------------------------------------------------------- method */

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'How each number is produced',
      subtitle: 'Every figure on this page comes from one of five steps, and each step can be checked by hand.',
      body: h('div', { class: 'stack-xs' },
        h('p', {}, h('strong', {}, '1. Harvest. '), 'Every promise is a dated record another module already keeps — a delegation due date, a call\u2019s review date, a goal date, a feedback follow-up, a stakeholder contact cadence, a hiring start date. A record with no date is not a promise and is never invented into one.'),
        h('p', {}, h('strong', {}, '2. Measure the source. '), 'For each source, every settled promise yields a settlement offset (settled on − owed for, in days). The on-time share is the fraction at or below zero, with a Wilson 95% interval. A source below the history floor is unproven and prices nothing.'),
        h('p', {}, h('strong', {}, '3. Price one promise. '), 'P(breaks) = S(1) / S(today − owed for), where S is the Jeffreys-smoothed survival of the source\u2019s own settlement offsets plus one virtual on-time settlement at offset 0 (the day-grid continuity correction). An item two months out is priced near its source\u2019s late share; an item already past its date is priced near 1.'),
        h('p', {}, h('strong', {}, '4. Price the book. '), 'A one-factor Gaussian copula (Vasicek 1987; Merton 1974): PDᵢ(z) = Φ((Φ⁻¹(PDᵢ) − √ρ·z)/√(1−ρ)), and P(any) = 1 − ∫ Π(1 − PDᵢ(z))·φ(z) dz, integrated by Simpson\u2019s rule on [−8, 8]. At ρ = 0 the integral is exactly the independence value, which is why the two can never disagree. Marginal contributions are computed in the same pass with prefix/suffix products.'),
        h('p', {}, h('strong', {}, '5. Compare to capacity. '), 'Settled promises per week, measured over the window, is the capacity. Promises falling due in the next 28 days is the demand. The ratio is withheld — not zeroed — when either side cannot be measured.'),
      ),
    }),
    card({
      title: 'How a reading is graded',
      subtitle: 'One frozen reading produces two scores, and only one of them is allowed to be the headline.',
      body: h('div', { class: 'stack-xs' },
        h('p', {}, h('strong', {}, 'Every price against its own outcome. '), 'Each priced promise is one forecast-outcome pair: its PD at freeze time against whether that promise was actually breached by the review date. The Brier score is the mean squared error over those pairs, and the reference is the book\u2019s own observed breach rate — the climatology a forecaster must beat before their model is worth anything (Brier 1950; Murphy 1973).'),
        h('p', {}, h('strong', {}, 'The signed number is a count. '), 'The reading also implies a full distribution over how many promises break, obtained by convolving the conditional Bernoullis under the one-factor model across the common factor. That distribution is scored with the ranked probability score (Epstein 1969) and the logarithmic score, against the same marginals under independence. Both are strictly proper: hedging cannot improve them, and being wrong by three breaches costs more than being wrong by one.'),
        h('p', {}, h('strong', {}, 'What is deliberately not scored. '), 'The binary claim earns a Brier score but is never the headline — it carries one observation per reading and saturates near certainty for any real book. The Fréchet ceiling is not scored at all: a bound that reads 100% is a constant, and scoring a constant against a book that broke would hand it a perfect zero. A grader that flatters the assumption-free bound is worse than no grader.'),
        h('p', {}, h('strong', {}, 'Refusals. '), 'A reading whose every promise was deleted lapses rather than being excused. A reading is graded once. A reading is never graded before its window closes: grading early would score a claim against evidence that had not yet had the chance to exist.'),
      ),
    }),
    card({
      title: 'Conventions you declared',
      subtitle: 'None of these is a statistic. Each is a number you chose, and each is printed here so a disagreement is with the assumption rather than with a hidden default.',
      body: h('div', { class: 'stack-xs' },
        kv('Settlement window', `${report.method.windowDays} days`),
        kv('Pricing horizon', `${report.method.horizonDays} days`),
        kv('Single-factor correlation ρ', `${report.method.rhoPct}%`),
        kv('Alarm — share of book expected to break', `${report.method.alarmPct}%`),
        kv('On-time bar for a source to count as reliable', `${report.method.onTimeBarPct}%`),
        kv('History floor before a source prices anything', `${report.method.minHistory} settled promise(s)`),
        kv('Cost of a late breach ÷ cost of an early ask', `${report.method.breachMultiplier}×`),
        kv('Move cap before a promise needs a decision', `${report.method.maxMoves} move(s)`),
        kv('Counterparty-class pooling', report.method.pooling ? 'allowed' : 'refused by you'),
        kv('Pooled settlement records available', String(report.method.pooledN)),
      ),
    }),
    card({
      title: 'What this terminal refuses to claim',
      subtitle: 'Each refusal is enforced in code, not in prose.',
      body: h('ul', { class: 'bullets' },
        h('li', {}, 'It never prices a promise from a source with no history. Those promises are listed and counted, never assumed safe.'),
        h('li', {}, 'It never pools across counterparty classes: a promise owed to an outsider cannot borrow the settlement curve of promises owed to the team. Where no class history exists, the promise stays unpriced.'),
        h('li', {}, 'It never treats an open promise as if its eventual settlement were observed. Settled offsets are right-censored at today and are not imputed.'),
        h('li', {}, 'It never moves a promise date. Renegotiation is a human action with a recorded reason, and it is capped; at the cap the honest move is a decision, not another date.'),
        h('li', {}, 'It never quotes a coverage ratio of zero where the truth is “unmeasurable”, and it never reports an infinite ratio where nothing falls due.'),
        h('li', {}, 'It never rates, ranks or names a person. A counterparty is a class — people, the organisation, outsiders — and the breach multiplier is a declared convention, not a measurement of anyone.'),
        h('li', {}, 'It is not legal or HR advice, and a breach probability is not a performance judgement of the leader or of the person who owes the work.'),
      ),
    }),
    card({
      title: 'Reading the numbers honestly',
      body: h('div', { class: 'stack-xs' },
        h('p', {}, 'P(at least one breach) rises with the size of the book and saturates near 1 for any book of more than a dozen live promises. That is not an alarm; it is arithmetic. The figure that discriminates is the expected count, and the figure that is actionable is the marginal contribution of a single promise.'),
        h('p', {}, 'Higher declared correlation *lowers* the probability of at least one breach while making the breach worse when it comes, because perfectly correlated promises fail all at once or not at all. This module prices the probability of *any* failure, so the correlation choice flatters it; the assumption-free Fréchet interval is printed beside it, and the graded count scores show whether the declaration has actually earned anything.'),
      ),
    }),
  );
}

/* ------------------------------------------------------------------ page */

export function renderSolvency(ctx) {
  const report = solvencyReport(ctx.state, ctx.now, ctx.state.settings || {});
  const active = PANELS.some((p) => p.key === ctx.query.get('panel')) ? ctx.query.get('panel') : 'book';

  const header = pageHeader({
    eyebrow: 'Leadership finance',
    title: 'Promise solvency',
    subtitle: `Every dated promise this workspace holds, read as one liability book: ${report.counts.open} open, ${report.counts.overdue} already late, ${report.counts.withinHorizon} falling due inside ${report.method.horizonDays} days.`,
    actions: [
      h('button', {
        class: 'btn btn-primary btn-small',
        type: 'button',
        onClick: () => openFreezeSolvencyDialog(ctx),
      }, 'Freeze a reading'),
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => openSolvencyConventionsDialog(ctx),
      }, 'Conventions'),
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanSolvency();
          if (result && result.ok) {
            toast(`Scan complete: ${(result.propagations || []).length} propagation step(s).`, 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'The scan could not run.', 'bad');
        },
      }, 'Scan'),
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => downloadText('promise-solvency.md', ctx.api.solvencyBriefText(), 'text/markdown'),
      }, 'Download brief'),
    ],
  });

  const stats = h('div', { class: 'stat-row' },
    stat({
      label: 'Open promises',
      value: String(report.counts.open),
      hint: `${report.counts.overdue} already late · ${report.counts.unpriced} unpriced`,
      tone: report.counts.overdue ? 'bad' : '',
    }),
    stat({
      label: 'Coverage',
      value: report.capacity.coverageRatio === null ? '—' : `${num(report.capacity.coverageRatio, 2)}×`,
      hint: report.capacity.coverageRatio === null
        ? 'no measurable rate or nothing due'
        : `${report.capacity.dueNext28} due in 28d vs ${num(report.capacity.servicePerWeek, 2)}/wk`,
      tone: report.capacity.coverageRatio !== null && report.capacity.coverageRatio < 1 ? 'bad' : 'good',
    }),
    stat({
      label: 'Expected breaches',
      value: num(report.joint.expectedBreaches, 2),
      hint: `${pct(report.joint.breachSharePct)} of the forward book · alarm ${report.alarm.pct}%`,
      tone: report.alarm.breached ? 'bad' : '',
    }),
    stat({
      label: 'P(at least one breach)',
      value: pct(report.joint.anyPct),
      hint: `at ρ ${report.method.rhoPct}% · bounds ${pct(report.joint.frechetLowPct)}–${pct(report.joint.frechetHighPct)}`,
    }),
    stat({
      label: 'Worth renegotiating',
      value: String(report.counts.repair),
      hint: report.counts.decide ? `${report.counts.decide} at the move cap` : 'nothing at the move cap',
      tone: report.counts.decide ? 'bad' : '',
    }),
  );

  const panelBody = active === 'risk' ? riskPanel(ctx, report)
    : active === 'capacity' ? capacityPanel(ctx, report)
      : active === 'repair' ? repairPanel(ctx, report)
        : active === 'frozen' ? frozenPanel(ctx, report)
          : active === 'method' ? methodPanel(report)
            : bookPanel(ctx, report);

  return h('div', { class: 'view-stack solvency-view' },
    header,
    stats,
    tabs({
      items: PANELS,
      active,
      ariaLabel: 'Promise solvency sections',
      onSelect: (key) => nav(ctx, key),
    }),
    panelBody,
  );
}
