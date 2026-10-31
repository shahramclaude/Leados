/**
 * app/views/waitCost.js — the Cost of Waiting Terminal (`#/wait`, Schema v64).
 *
 * Six panels over one priced queue:
 *
 *   Overview      the weekly exposure per currency, the triage threshold, and
 *                 where the waiting is concentrated
 *   Queue         every open item with its weekly delay price, confidence,
 *                 class-median position and the +2-week scenario cell
 *   Scenarios     "what happens if I wait N more weeks" — expected additional
 *                 delay cost per currency, from the class KM curve
 *   Prices        the declared weekly price per class (the one input the app
 *                 cannot derive) and the decisions priced from their own value
 *   Certificates  the frozen weekly exposure certificates (append-only audit)
 *   Method        the pricing rule, the estimators, the assumptions and the
 *                 refusals — prominently
 *
 * The page refuses what it cannot support: an unpriced wait shows "unpriced,
 * not zero"; a scenario below the at-risk floor says why instead of printing a
 * guess; currencies are never summed across units.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, barRow,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey } from '../core/time.js';
import {
  classLabel,
  waitCostReport,
} from '../core/domain/waitCost.js';
import { openDeclarePriceDialog, openFreezeExposureDialog } from '../ui/wait-cost-modals.js';

const PANELS = [
  { key: 'overview', label: 'Overview' },
  { key: 'queue', label: 'Priced queue' },
  { key: 'scenarios', label: 'Wait scenarios' },
  { key: 'prices', label: 'Prices' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'method', label: 'Method' },
];

function money(amount, currency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function days(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n} day${Math.abs(n) === 1 ? '' : 's'}`;
}

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

function confidenceTone(level) {
  if (level === 'high') return 'good';
  if (level === 'medium') return 'warn';
  return 'neutral';
}

function navigate(ctx, panel, params = {}) {
  const query = new URLSearchParams({ panel });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  ctx.navigate(`#/wait?${query.toString()}`);
}

function scenarioCell(row, weeks) {
  const scenario = (row.scenarios || []).find((s) => s.weeks === weeks);
  if (!scenario) return badge('—', 'neutral');
  if (!scenario.available) return badge('withheld', 'neutral', scenario.reason || '');
  return h('span', { title: scenario.reason || '' },
    `${money(scenario.expectedAdditionalCost, row.price.currency)} `,
    h('span', { class: 'muted small' }, `(${pct(scenario.stillOpenPct, 0)} still open${scenario.beyondEvidence ? ', extrapolated tail' : ''})`));
}

/* --------------------------------------------------------------- overview */

function overviewPanel(ctx, report) {
  const { conventions } = report;
  const blocks = [];

  if (!report.totals.length) {
    blocks.push(banner({
      tone: 'info',
      title: 'Nothing is priced yet — and unpriced is not zero',
      body: `The weekly delay price of a class of work is the one number this terminal cannot derive: what an open week costs is your call. Declare a price per class on the Prices panel (decisions with linked value at stake are priced automatically), then scan: the price cascades into a weekly certificate, typed links, owned tasks and a triage decision. ${report.counts.unpricedOverdue} overdue item(s) currently carry an unknown cost.`,
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/wait?panel=prices' }, 'Declare prices')],
    }));
  }

  const exposureCards = report.totals.map((bucket) => card({
    title: `${bucket.currency} weekly exposure`,
    subtitle: `${bucket.pricedItems} priced open item(s) · ${bucket.overduePricedItems} past class median`,
    body: h('div', { class: 'stack-sm' }, [
      kv('All priced open items', money(bucket.weeklyExposure, bucket.currency)),
      kv('Overdue (past class median)', money(bucket.weeklyExposureOverdue, bucket.currency),
        bucket.weeklyExposureOverdue > conventions.triageThreshold ? 'warn' : ''),
      kv('Triage threshold', money(conventions.triageThreshold, bucket.currency),
        bucket.weeklyExposureOverdue > conventions.triageThreshold ? 'bad' : ''),
      bucket.topItemShare >= 50
        ? kv('Concentration', `${pct(bucket.topItemShare, 0)} on one item`, 'warn')
        : null,
      ...bucket.scenarios.map((s) => kv(`Wait +${s.weeks} week(s)`, `+ ${money(s.expectedAdditionalCost, bucket.currency)} expected`, s.coveredRows ? '' : 'neutral')),
    ].filter(Boolean)),
  }));

  blocks.push(card({
    title: 'Weekly exposure by currency',
    subtitle: 'Currencies are never summed across units — each bucket is one currency only. An unpriced wait is reported as unpriced, never as zero.',
    body: report.totals.length
      ? h('div', { class: 'grid-cards' }, ...exposureCards)
      : emptyState({ title: 'No priced open item', body: 'Declare a weekly price for a class of work, or link money to an open decision, and the exposure appears here in that currency.' }),
  }));

  if (report.counts.pricedOverdue) {
    const top = report.rows.find((row) => row.price.priced && row.overdue);
    blocks.push(banner({
      tone: 'bad',
      title: `${report.counts.pricedOverdue} priced item(s) are past the point where comparable work finishes`,
      body: top
        ? `The largest single wait is priced at ${money(top.price.weeklyAmount, top.price.currency)}/week (${top.item.elapsedDays} days old against a class median of ${top.klass.completionQuantile.reached ? `${top.klass.completionQuantile.days} days` : 'not reached'}). The price attaches to the work, not to anyone holding it.`
        : 'Each is past its class median and carries a declared or decision-derived weekly price.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/wait?panel=queue' }, 'Open the priced queue')],
    }));
  }
  if (report.counts.unpricedOverdue) {
    blocks.push(banner({
      tone: 'caution',
      title: `${report.counts.unpricedOverdue} overdue item(s) have an unpriced wait`,
      body: 'Unknown cost is not zero cost. One declared price per class turns these into numbers; the scan opens a task to do exactly that.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/wait?panel=prices' }, 'Declare prices')],
    }));
  }

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ------------------------------------------------------------------ queue */

function queueTable(ctx, report) {
  const rows = report.rows;
  if (!rows.length) return emptyState({ title: 'No open item exists yet', body: 'This terminal reads the same dated records as Delivery Survival: funded work, cases, requisitions, org changes, delegations and decisions.' });
  const head = ['Item', 'Class', 'Age', 'Position', 'Weekly price', 'Confidence', 'Price source', '+2 wk scenario'];
  const body = rows.map((row) => h('tr', null,
    h('td', { 'data-label': 'Item' },
      row.item.route ? h('a', { href: row.item.route }, row.item.title) : h('strong', null, row.item.title),
      h('div', { class: 'muted small' }, `opened ${row.item.startedOn}`)),
    h('td', { 'data-label': 'Class' }, classLabel(row.item.kind)),
    h('td', { 'data-label': 'Age', class: 'num' }, days(row.item.elapsedDays)),
    h('td', { 'data-label': 'Position' },
      row.overdue
        ? badge(`+${row.overdueBy}d past median`, row.severe ? 'bad' : 'warn',
          `${row.percentile?.available ? `${pct(row.percentile.percentile, 0)} of past exits were faster` : 'no comparison'}`)
        : badge('inside the class', 'good')),
    h('td', { 'data-label': 'Weekly price', class: 'num' },
      row.price.priced
        ? h('strong', null, money(row.price.weeklyAmount, row.price.currency))
        : badge('unpriced, not zero', 'neutral', row.price.basis)),
    h('td', { 'data-label': 'Confidence' },
      badge(row.confidence.level, confidenceTone(row.confidence.level), row.confidence.basis)),
    h('td', { 'data-label': 'Price source' },
      h('span', { title: row.price.basis }, row.price.sourceLabel),
      row.guardrail?.past ? h('div', { class: 'muted small' }, `past ${row.guardrail.type} guardrail (${row.guardrail.days}d)`) : null),
    h('td', { 'data-label': '+2 wk scenario' }, scenarioCell(row, 2))));
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table', 'aria-label': 'Open work items with their weekly delay price, confidence and two-week wait scenario' },
      h('caption', { class: 'sr-only' }, 'Open items ranked by weekly delay price, with class-median position, confidence and the expected additional cost of waiting two more weeks'),
      h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
      h('tbody', null, ...body)));
}

/* -------------------------------------------------------------- scenarios */

function scenariosPanel(ctx, report) {
  const { conventions } = report;
  const weeks = conventions.scenarioWeeks;
  const blocks = [];
  blocks.push(banner({
    tone: 'info',
    title: '“What happens if I wait N more weeks?” — answered from your own record',
    body: `Expected additional delay cost = weekly price × weeks × P(still open at age + 7×weeks | survived to its current age), with P read as S(age + 7w)/S(age) on the class's Kaplan–Meier curve. Below the at-risk floor the scenario is withheld — a guess wearing a percentage is worse than no number — and past the longest observation the tail is flagged as extrapolated.`,
  }));
  if (!report.totals.length) {
    blocks.push(emptyState({ title: 'Nothing is priced yet', body: 'Declare a weekly price per class first; the scenarios multiply that price by the survival curve.' }));
    return h('div', { class: 'view-stack' }, ...blocks);
  }
  for (const bucket of report.totals) {
    const head = ['Horizon', 'Items the curve could answer', 'Expected additional cost'];
    const body = weeks.map((w) => {
      const scenario = bucket.scenarios.find((s) => s.weeks === w);
      return h('tr', null,
        h('td', { 'data-label': 'Horizon', class: 'num' }, `+${w} week${w === 1 ? '' : 's'}`),
        h('td', { 'data-label': 'Items the curve could answer', class: 'num' }, scenario ? String(scenario.coveredRows) : '0'),
        h('td', { 'data-label': 'Expected additional cost', class: 'num' },
          scenario ? h('strong', null, `+ ${money(scenario.expectedAdditionalCost, bucket.currency)}`) : '—'));
    });
    blocks.push(card({
      title: `${bucket.currency} — wait scenarios`,
      subtitle: `Current weekly exposure ${money(bucket.weeklyExposure, bucket.currency)}; overdue share ${money(bucket.weeklyExposureOverdue, bucket.currency)}.`,
      body: h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': `Wait scenarios in ${bucket.currency}` },
          h('caption', { class: 'sr-only' }, `Expected additional delay cost in ${bucket.currency} for waiting one, two, four and eight more weeks`),
          h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null, ...body))),
    }));
  }
  // Per-item scenario detail for the top priced rows.
  const top = report.rows.filter((row) => row.price.priced).slice(0, 10);
  if (top.length) {
    const head = ['Item', 'Weekly price', ...weeks.map((w) => `+${w}w`)];
    const body = top.map((row) => h('tr', null,
      h('td', { 'data-label': 'Item' },
        row.item.route ? h('a', { href: row.item.route }, row.item.title) : h('strong', null, row.item.title),
        h('div', { class: 'muted small' }, `${classLabel(row.item.kind)} · ${row.item.elapsedDays}d old`)),
      h('td', { 'data-label': 'Weekly price', class: 'num' }, money(row.price.weeklyAmount, row.price.currency)),
      ...weeks.map((w) => h('td', { 'data-label': `+${w}w`, class: 'num' }, scenarioCell(row, w)))));
    blocks.push(card({
      title: 'Top priced items — per-item scenarios',
      subtitle: 'Each cell is the expected additional delay cost if the item is still open after that many more weeks, conditioned on it having survived this long.',
      body: h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': 'Per-item wait scenarios for the top priced items' },
          h('caption', { class: 'sr-only' }, 'Per-item expected additional delay cost for each scenario horizon'),
          h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null, ...body))),
    }));
  }
  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------------- prices */

function pricesPanel(ctx, report) {
  const prices = Array.isArray(ctx.state.waitPrices) ? ctx.state.waitPrices : [];
  const head = ['Class', 'Weekly price', 'Declared', 'Note', ''];
  const body = prices.map((row) => h('tr', null,
    h('td', { 'data-label': 'Class' }, classLabel(row.classKey)),
    h('td', { 'data-label': 'Weekly price', class: 'num' }, money(row.weeklyAmount, row.currency)),
    h('td', { 'data-label': 'Declared' }, row.declaredOn || '—'),
    h('td', { 'data-label': 'Note' }, row.note || h('span', { class: 'muted' }, '—')),
    h('td', { 'data-label': 'Actions' },
      h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.removeWaitPrice(row.id);
          if (result && result.ok) { toast('Price removed — the class wait is now unpriced, not zero.'); ctx.refresh(); }
          else if (result && result.error) toast(result.error, 'bad');
        },
      }, 'Remove'))));
  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'The one input this terminal cannot derive',
      body: 'What an open week costs is your call. Declare a weekly price per class of work — or link money to an open decision and its value at stake is spread over the declared erosion window automatically (linear cost-of-delay, Reinertsen 2009). Declaring a price fires a scan: the certificate, typed edges, owned tasks and triage decision update in the same write.',
    }),
    card({
      title: 'Declared weekly prices',
      subtitle: `${prices.length} declaration(s). The latest per class is active; older rows stay as history.`,
      actions: [h('button', {
        class: 'btn btn-small btn-primary',
        type: 'button',
        onClick: () => openDeclarePriceDialog(ctx),
      }, 'Declare a price')],
      body: prices.length
        ? h('div', { class: 'table-wrap' },
          h('table', { class: 'table', 'aria-label': 'Declared weekly delay prices per class of work' },
            h('caption', { class: 'sr-only' }, 'Declared weekly delay prices per class of work'),
            h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', null, ...body)))
        : emptyState({ title: 'No price declared yet', body: 'Nothing is priced, so every wait is reported as unpriced — unknown, not zero. Declare the weekly cost of waiting for a class of work to get started.' }),
    }),
    card({
      title: 'Classes without a declared price',
      body: h('ul', { class: 'stack-xs' },
        ...report.survival.classes.map((klass) => {
          const price = prices.some((row) => row.classKey === klass.key);
          const openCount = report.rows.filter((row) => row.item.kind === klass.key).length;
          return h('li', null,
            h('strong', null, classLabel(klass.key)),
            ` — ${price ? 'priced' : 'unpriced'} · ${openCount} open item(s) · ${klass.counts.exits} exits on record`);
        })),
    }));
}

/* ----------------------------------------------------------- certificates */

function certificatesPanel(ctx, report) {
  const exposures = Array.isArray(ctx.state.waitExposures) ? ctx.state.waitExposures : [];
  const selected = ctx.query?.get?.('exposure') || '';
  const current = exposures.find((row) => row.id === selected) || exposures[0] || null;
  const blocks = [];
  if (!exposures.length) {
    blocks.push(emptyState({
      title: 'No exposure certificate yet',
      body: 'Run a scan (or freeze one explicitly) and the week’s priced exposure is frozen here as an append-only record: what the waiting was priced at, per currency, with the scenario table. Certificates are audit history, not predictions — the survival readings grade predictions.',
      action: h('button', {
        class: 'btn btn-small btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeWaitExposure({});
          if (result && result.ok) { toast('Exposure certificate frozen.', 'good'); ctx.refresh(); }
          else if (result && result.error) toast(result.error, 'bad');
        },
      }, 'Freeze this week’s certificate'),
    }));
    return h('div', { class: 'view-stack' }, ...blocks);
  }
  const head = ['Week', 'Frozen', 'Review', 'Priced items', 'Currencies', 'Weekly exposure', ''];
  const body = exposures.map((row) => {
    const exposureText = row.totals.map((t) => money(t.weeklyExposureOverdue, t.currency)).join(' · ') || '—';
    return h('tr', { class: row === current ? 'is-selected' : '' },
      h('td', { 'data-label': 'Week' }, row.week),
      h('td', { 'data-label': 'Frozen' }, row.frozenOn),
      h('td', { 'data-label': 'Review' }, row.reviewOn || '—'),
      h('td', { 'data-label': 'Priced items', class: 'num' }, String(row.items?.length || 0)),
      h('td', { 'data-label': 'Currencies', class: 'num' }, String(row.totals?.length || 0)),
      h('td', { 'data-label': 'Weekly exposure' }, exposureText),
      h('td', { 'data-label': 'Open' },
        h('a', { class: 'btn btn-small btn-ghost', href: `#/wait?panel=certificates&exposure=${encodeURIComponent(row.id)}` }, 'Open')));
  });
  blocks.push(card({
    title: 'Frozen exposure certificates',
    subtitle: 'Append-only audit history of what the waiting was priced at. A certificate records the money the curve was multiplied by; it is never edited after the freeze.',
    body: h('div', { class: 'table-wrap' },
      h('table', { class: 'table', 'aria-label': 'Frozen weekly exposure certificates' },
        h('caption', { class: 'sr-only' }, 'Frozen weekly exposure certificates with priced item counts and weekly exposure per currency'),
        h('thead', null, h('tr', null, ...head.map((label) => h('th', { scope: 'col' }, label)))),
        h('tbody', null, ...body))),
  }));
  if (current) {
    const detailHead = ['Item', 'Class', 'Age', 'Overdue', 'Weekly price', 'Confidence', 'Scenarios'];
    const detailBody = (current.items || []).map((item) => h('tr', null,
      h('td', { 'data-label': 'Item' }, item.title || item.key),
      h('td', { 'data-label': 'Class' }, classLabel(item.classKey)),
      h('td', { 'data-label': 'Age', class: 'num' }, days(item.elapsedDays)),
      h('td', { 'data-label': 'Overdue' }, item.overdue ? badge('past median', 'warn') : badge('inside', 'good')),
      h('td', { 'data-label': 'Weekly price', class: 'num' }, money(item.weeklyAmount, item.currency)),
      h('td', { 'data-label': 'Confidence' }, badge(item.confidence, confidenceTone(item.confidence))),
      h('td', { 'data-label': 'Scenarios' },
        (item.scenarios || []).map((s) => h('div', { class: 'small' }, `+${s.weeks}w: ${money(s.expectedAdditionalCost, item.currency)} (${pct(s.stillOpenPct, 0)})`)).join(' ') || '—')));
    blocks.push(card({
      title: `${current.label} — ${current.week}`,
      subtitle: `Frozen ${current.frozenOn} · review ${current.reviewOn || '—'} · ${current.items?.length || 0} priced item(s) · each row has a typed prices-delay edge from this certificate`,
      body: h('div', { class: 'table-wrap' },
        h('table', { class: 'table', 'aria-label': `Priced items of certificate ${current.label}` },
          h('caption', { class: 'sr-only' }, `Priced open items frozen in certificate ${current.label}`),
          h('thead', null, h('tr', null, ...detailHead.map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null, ...detailBody))),
    }));
  }
  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------------- method */

function methodPanel(report) {
  const { conventions } = report;
  return h('div', { class: 'view-stack' },
    card({
      title: 'Method — every figure on this page, named',
      body: h('ul', { class: 'stack-sm' }, [
        h('li', null, h('strong', null, 'Weekly delay price. '), 'A leader-declared weekly amount per class of work (Prices panel), or — for an open decision — its own value at stake (linked cases, budget lines, portfolio value, negotiation stakes, dependency shortfalls, computed by the decision-tempo valuation) spread over the declared erosion window of ', h('strong', null, `${conventions.erosionWeeks} week(s)`), ': rate = value ÷ window. Linear cost-of-delay profile (Reinertsen, The Principles of Product Development Flow, 2009). A class with no declared price is UNPRICED — reported as unknown, never as zero.'),
        h('li', null, h('strong', null, '“Past the class median” (overdue). '), 'The class completion median is the 50% quantile of the Aalen–Johansen cumulative incidence over all dated items of the class, censoring and abandonment handled as in the Delivery Survival terminal. An item older than that is overdue; the age percentile is a share of past exits and is never called a probability.'),
        h('li', null, h('strong', null, 'Wait scenario. '), 'For horizon w weeks: expected additional cost = weekly price × w × P(still open at age + 7w | survived to age), with P = S(age + 7w) / S(age) on the class Kaplan–Meier (1958) curve. Below the at-risk floor of ', h('strong', null, `${conventions.minAtRisk}`), ' comparable items the scenario is withheld with its reason; past the longest observation on record the tail is flagged as extrapolated, never drawn silently.'),
        h('li', null, h('strong', null, 'Confidence. '), `A row is high-confidence only with a price AND at least ${conventions.confidenceFloor} exits in the class AND the at-risk floor met now; otherwise medium or low, and the basis is printed beside the badge. Recommendations here are confidence-scored, not flat.`),
        h('li', null, h('strong', null, 'Currencies. '), 'Every aggregate is per currency; money is never summed across units. Concentration shares are computed inside a single currency.'),
        h('li', null, h('strong', null, 'Automation. '), 'RULE-WAIT-01..05 on the shared post-commit spine: a scan or a price declaration freezes the week’s certificate once, writes typed prices-delay edges to priced overdue items, opens at most one triage DACI decision per currency per week (priced by decision tempo in the same transaction), one owned task per top priced overdue item (recorded owner only), and one declare-a-price task per unpriced overdue class. All marker-idempotent; waitAutoPropagate=false pauses automatic work and an explicit scan always catches up.'),
      ]),
    }),
    card({
      title: 'Assumptions and refusals',
      body: h('ul', { class: 'stack-sm' }, [
        h('li', null, 'Independence of censoring is assumed, not checked — it is doubtful precisely when the slowest work is stopped first. The competing-risk incidence exists because of that doubt.'),
        h('li', null, 'Exchangeability within a class is assumed. Narrowing the class is the remedy.'),
        h('li', null, 'The scenario probability conditions on survival to the current age; it is not a completion probability and not a verdict on anyone.'),
        h('li', null, 'A declared price is the leader’s own number. The app never invents a price, never back-fills a certificate, and never converts an unpriced wait into zero.'),
        h('li', null, 'No person is scored, ranked or reassigned. The price attaches to work in a system; owned tasks go to the recorded owner of the item, and the terminal cannot close, expedite or defer anything itself.'),
        h('li', null, 'The certificate is audit history of the price×queue state, not a prediction that is graded; grading of predictions lives in the Delivery Survival readings.'),
      ]),
    }));
}

/* ------------------------------------------------------------------ page */

export function renderWaitCost(ctx) {
  const { state, now } = ctx;
  const report = waitCostReport(state, now, state.settings || {});
  const requested = ctx.query?.get?.('panel') || 'overview';
  const panel = PANELS.some((row) => row.key === requested) ? requested : 'overview';

  const header = pageHeader({
    title: 'Cost of Waiting',
    subtitle: 'What every open item costs per week of waiting — priced from your own declarations and your own time-to-finish curve, with the “wait N more weeks” scenario computed, not asserted.',
    actions: [
      stat({ label: 'Open items', value: report.counts.open }),
      stat({ label: 'Priced', value: report.counts.priced, hint: `${report.counts.unpriced} unpriced, not zero` }),
      stat({
        label: 'Overdue priced',
        value: report.counts.pricedOverdue,
        tone: report.counts.pricedOverdue ? 'warn' : '',
        hint: 'past the class median',
      }),
      ...report.totals.slice(0, 1).map((bucket) => stat({
        label: `Waiting / week (${bucket.currency})`,
        value: money(bucket.weeklyExposureOverdue, bucket.currency),
        tone: bucket.weeklyExposureOverdue > report.conventions.triageThreshold ? 'bad' : '',
        hint: 'overdue share',
      })),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanWaitCost();
          if (result && result.ok) {
            toast(result.changed ? 'Scan complete — certificate, links, tasks and triage decisions updated.' : 'Scan complete — nothing was missing.', result.changed ? 'good' : 'neutral');
          } else if (result && result.error) {
            toast(result.error, 'bad');
          }
        },
      }, 'Scan now'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openFreezeExposureDialog(ctx),
      }, 'Freeze certificate'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.waitCostBriefText();
          if (!downloadText({ filename: `leados-cost-of-waiting-${dayKey(now)}.txt`, text, mime: 'text/plain' })) {
            toast('Could not start the download. Use Data & export instead.', 'bad');
          }
        },
      }, 'Export brief'),
    ],
  });

  const tabBar = tabs({
    items: PANELS.map((row) => ({ key: row.key, label: row.label })),
    active: panel,
    ariaLabel: 'Cost of waiting panels',
    onSelect: (key) => navigate(ctx, key, { exposure: key === 'certificates' ? (ctx.query?.get?.('exposure') || '') : '' }),
  });

  const content = panel === 'queue'
    ? card({
      title: 'The priced queue',
      subtitle: 'Ranked by weekly delay price. Overdue means past the class completion median from your own closed records. Confidence says how much evidence stands behind the row — a declared price on a thin class is a real price on thin evidence.',
      body: queueTable(ctx, report),
    })
    : panel === 'scenarios'
      ? scenariosPanel(ctx, report)
      : panel === 'prices'
        ? pricesPanel(ctx, report)
        : panel === 'certificates'
          ? certificatesPanel(ctx, report)
          : panel === 'method'
            ? methodPanel(report)
            : overviewPanel(ctx, report);

  return h('div', { class: 'view-stack' }, [header, tabBar, content]);
}

export default renderWaitCost;
