/**
 * app/views/chain.js — the Command Chain (`#/chain`, Schema v82, ADR-0075).
 *
 * Six panels over one question: is this work sitting at the altitude it belongs
 * to, and does the level above have any way to see it without asking for a
 * status update?
 *
 *   The chain     the reporting tree as it actually is — every span, its
 *                 altitude, its load, and every defect in the lines with the
 *                 reason it was reported instead of repaired
 *   Altitudes     the five-altitude ladder: what each altitude decides, what it
 *                 owes upward, what it must not be handed — and the roll-up from
 *                 the spans below, exact counts and a pooled rate printed beside
 *                 the mean of rates so the difference is visible
 *   Escalation    every item that has outlived its owner's time span, the date it
 *                 crossed, and the level it now demands
 *   Drift         work sitting below its owner's altitude (a span doing its
 *                 reports' work) and above it (work nobody has taken)
 *   Readings      frozen, dated readings of a span and their grades — the only
 *                 claim on this page that can be scored later
 *   Method        the estimators, the frameworks, the conventions and the
 *                 refusals, stated once
 *
 * What this page refuses: a span whose rates are below the evidence floor prints
 * the refusal, not a proportion of four; an altitude nobody holds is drawn empty
 * rather than given an invented incumbent; a span that cannot be quoted is not
 * frozen with a round number; and the demo roster — two levels — makes the top of
 * the ladder visibly empty, because it is.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { addDays, dayKey, formatDate } from '../core/time.js';
import { chainReport, chainSkill, discloseItems } from '../core/domain/chain.js';
import {
  ALTITUDES, CHAIN_LIMITS, CHAIN_PREMISE, DISCLOSURE_TEXT, altitudeByKey,
} from '../core/domain/chainRegistry.js';
import {
  openDeclareAltitudeDialog,
  openFreezeChainReadingDialog,
  openChainConventionsDialog,
} from '../ui/chain-modals.js';

const PANELS = [
  { key: 'map', label: 'The chain' },
  { key: 'altitudes', label: 'Altitudes' },
  { key: 'escalation', label: 'Escalation' },
  { key: 'drift', label: 'Altitude drift' },
  { key: 'frozen', label: 'Frozen readings' },
  { key: 'about', label: 'Method' },
];

/** Signal routes and old bookmarks point at these names. */
const PANEL_ALIAS = {
  chain: 'map',
  spans: 'map',
  tree: 'map',
  org: 'map',
  orgchart: 'map',
  ladder: 'altitudes',
  altitude: 'altitudes',
  escalation: 'escalation',
  escalations: 'escalation',
  forecast: 'escalation',
  drift: 'drift',
  misrouted: 'drift',
  rollup: 'drift',
  frozen: 'frozen',
  readings: 'frozen',
  reading: 'frozen',
  method: 'about',
  refusals: 'about',
};

const ALTITUDE_TONE = { frontline: 'info', manager: 'neutral', director: 'caution', exec: 'warn', chief: 'bad' };

/* ------------------------------------------------------------------ utils */

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

function days(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value)}d`;
}

function count(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function resolvePanel(query) {
  const requested = query?.get?.('panel');
  if (!requested) return 'map';
  const key = PANEL_ALIAS[requested] || requested;
  return PANELS.some((panel) => panel.key === key) ? key : 'map';
}

function navigate(ctx, panel, params = {}) {
  const query = new URLSearchParams({ panel });
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  ctx.navigate(`#/chain?${query.toString()}`);
}

function altitudeBadge(key, title = '') {
  const altitude = altitudeByKey(key);
  return badge(altitude?.shortLabel || 'unassigned', ALTITUDE_TONE[key] || 'neutral', title || altitude?.label || '');
}

function spanName(report, nodeId, { link = true } = {}) {
  const node = report.chain.nodes.get(nodeId);
  const name = nodeId === 'leader' ? (node?.name || 'You') : (node?.name || 'Unknown');
  if (!link) return name;
  return h('a', { href: `#/chain?panel=drift&node=${encodeURIComponent(nodeId)}` }, name);
}

function metricCell(metric) {
  if (metric.rate !== null && metric.rate !== undefined) {
    return h('span', { title: `${metric.num} of ${metric.den} (floor ${metric.floor})` }, pct(metric.rate, 0));
  }
  return h('span', { class: 'muted', title: metric.refused || '' }, 'withheld');
}

/**
 * One altitude's roll-up over its spans.
 *
 * Counts are an exact sum — a count of records cannot double-count here because
 * each item has exactly one owner. The rate is *pooled* (sum of numerators over
 * sum of denominators) with the mean of unit rates printed beside it; when they
 * differ by more than the declared materiality bar, the altitude's work is not
 * the same work and the crude number is labelled composition-sensitive.
 */
function poolAltitude(spans, conventions, leaderId = 'leader') {
  let num = 0;
  let den = 0;
  const unitRates = [];
  for (const span of spans) {
    for (const metric of span.dossier.metrics) {
      if (metric.rate === null || metric.rate === undefined) continue;
      num += metric.num;
      den += metric.den;
      unitRates.push(metric.rate);
    }
  }
  if (!den) {
    return { pooled: null, meanOfRates: null, gapPp: null, compositionSensitive: false, num: 0, den: 0, refused: 'no rate on any span at this altitude clears its evidence floor' };
  }
  const pooled = (num / den) * 100;
  const meanOfRates = unitRates.reduce((sum, value) => sum + value, 0) / unitRates.length;
  const gapPp = Math.abs(pooled - meanOfRates);
  return {
    pooled: Math.round(pooled * 10) / 10,
    meanOfRates: Math.round(meanOfRates * 10) / 10,
    gapPp: Math.round(gapPp * 10) / 10,
    compositionSensitive: gapPp >= Number(conventions.chainMaterialityPp),
    num,
    den,
    refused: null,
  };
}

/* ---------------------------------------------------------------- 1. map */

function treeNode(report, nodeId, depth) {
  const node = report.chain.nodes.get(nodeId);
  if (!node) return null;
  const dossier = report.dossiers.get(nodeId);
  const ownFindings = report.findings.filter((finding) => finding.nodeId === nodeId);
  const hard = ownFindings.filter((finding) => finding.severity >= 3);
  return h('li', { class: 'stack-xs', style: `margin-left:${depth * 18}px` },
    h('div', { class: 'row-inline' },
      h('strong', {}, nodeId === 'leader' ? `${node.name} (you)` : node.name),
      altitudeBadge(node.altitude, node.altitudeReason || ''),
      node.span ? h('span', { class: 'muted small' }, `${node.span} report${node.span === 1 ? '' : 's'}`) : h('span', { class: 'muted small' }, 'no reports'),
      dossier ? h('span', { class: 'muted small' }, `${dossier.openN} open · ${dossier.ownOpenN} own`) : null,
      hard.length ? badge(`${hard.length} hard defect${hard.length === 1 ? '' : 's'}`, 'bad') : null),
    node.altitudeReason && nodeId !== 'leader'
      ? h('span', { class: 'muted small' }, node.altitudeReason)
      : null,
    node.childIds.length
      ? h('ul', { class: 'stack-xs' }, ...node.childIds.map((childId) => treeNode(report, childId, depth + 1)))
      : null);
}

function mapPanel(ctx, report) {
  const blocks = [];

  if (!report.totals.people) {
    blocks.push(banner({
      tone: 'info',
      title: 'There is no chain to read yet — only your own span',
      body: 'The workspace holds no roster, so every altitude reads the same single span: yours. Add the people you lead and their manager, and this page becomes a measurement rather than a map. Nothing here is inferred from titles alone.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/people' }, 'Open People')],
    }));
  } else if (!report.totals.spanning) {
    blocks.push(banner({
      tone: 'warn',
      title: 'Nobody on the roster has a direct report',
      body: 'A chain needs at least one span. Every person is anchored to you for aggregation, which means every roll-up above them would be a guess about which unit their work belongs to. Set a manager on at least one person and the routing rules start working.',
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/people' }, 'Set reporting lines')],
    }));
  }

  const hard = report.findings.filter((finding) => finding.severity >= 3);
  if (report.findings.length) {
    blocks.push(card({
      title: `Structural defects in the reporting lines (${report.findings.length})`,
      subtitle: 'The chain reports what it cannot repair. A cycle, an orphan pointer or a senior title under a junior one all change who is accountable for what — so none of them is fixed quietly on your behalf.',
      body: h('div', { class: 'stack-sm' }, ...report.findings.map((finding) => h('article', { class: 'stack-xs' },
        h('div', { class: 'row-inline' },
          badge(finding.severity >= 3 ? 'hard' : 'soft', finding.severity >= 3 ? 'bad' : 'warn'),
          h('strong', {}, finding.title),
          finding.nodeId ? spanName(report, finding.nodeId) : null),
        h('p', { class: 'muted small' }, finding.detail)))),
    }));
  }

  if (hard.length) {
    blocks.push(banner({
      tone: 'bad',
      title: `${hard.length} defect(s) mean a roll-up above them is not yet trustworthy`,
      body: 'The chain still computes — it anchors an unreachable person to you and breaks a loop at its entry point — but the counts above a defect describe an organisation the roster does not contain. Fixing the line is a one-field edit in People; the reading then re-derives itself.',
    }));
  }

  const rows = report.spans.map((span) => ({
    name: spanName(report, span.nodeId),
    altitude: altitudeBadge(span.altitude, span.dossier.altitudeReason),
    span: count(span.dossier.span),
    people: count(span.dossier.peopleN),
    open: count(span.dossier.openN),
    own: count(span.dossier.ownOpenN),
    debt: span.dossier.debtN ? badge(String(span.dossier.debtN), 'warn') : h('span', { class: 'muted' }, '0'),
    oldest: days(span.dossier.oldestAgeDays),
    rate: span.composite.pooled === null
      ? h('span', { class: 'muted', title: span.composite.refused || '' }, 'withheld')
      : pct(span.composite.pooled),
    drift: span.drift && span.drift.overBar ? badge(`${pct(span.drift.driftSharePct, 0)} below`, 'warn') : badge('at altitude', 'good'),
  }));

  blocks.push(card({
    title: 'Spans in the chain',
    subtitle: `A span is a leader plus the people whose work they are accountable for. “Open” counts every item owned by the span (including the work of the people inside it); “own” counts only the items whose owner is the leader themselves. The rate is pooled across the span’s metrics, withheld below a floor of ${report.conventions.chainFloorN} observations.`,
    body: rows.length
      ? table({
        columns: [
          { label: 'Span', render: (row) => row.name },
          { label: 'Altitude', render: (row) => row.altitude },
          { label: 'Reports', render: (row) => row.span },
          { label: 'In span', render: (row) => row.people },
          { label: 'Open', render: (row) => row.open },
          { label: 'Own work', render: (row) => row.own },
          { label: 'Past horizon', render: (row) => row.debt },
          { label: 'Oldest item', render: (row) => row.oldest },
          { label: 'Pooled rate', render: (row) => row.rate },
          { label: 'Drift', render: (row) => row.drift },
        ],
        rows,
        caption: 'One row per span. A span with no reports is still drawn: a title without a span is a structural fact, not an empty row.',
      })
      : emptyState({ title: 'No spans', body: 'The roster is empty, so the only span in the chain is your own — and it holds no work worth reporting.' }),
  }));

  blocks.push(card({
    title: 'The reporting tree',
    subtitle: 'Read from person.managerId, anchored at you. Anything the roster could not answer is anchored here and reported above, never silently dropped.',
    body: h('ul', { class: 'stack-xs' }, treeNode(report, 'leader', 0)),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ------------------------------------------------------------ 2. altitudes */

function altitudeCard(report, rung) {
  const spans = report.spans.filter((span) => span.rank === rung.rank);
  const pool = poolAltitude(spans, report.conventions);
  const body = h('div', { class: 'stack-sm' },
    h('p', { class: 'muted small' }, rung.stance),
    h('div', { class: 'grid-cards' },
      stat({ label: 'Horizon', value: `${rung.horizonDays}d`, hint: 'time span of discretion' }),
      stat({ label: 'Owners here', value: String(rung.owners.length), hint: spans.length ? rung.owners.map((row) => row.name).join(', ') : 'nobody yet' }),
      stat({ label: 'Open rolled up', value: String(rung.rollupOpenN), hint: `${rung.ownOpenN} held by the leaders themselves` }),
      stat({ label: 'Past horizon', value: String(rung.debtN), tone: rung.debtN ? 'warn' : '', hint: 'demands a level above' }),
      stat({
        label: 'Pooled rate',
        value: pool.pooled === null ? 'withheld' : pct(pool.pooled),
        hint: pool.num ? `${pool.num}/${pool.den} observations` : 'no measurable cell',
      })),
    rung.represented
      ? null
      : h('p', { class: 'muted small' }, `No one in this roster holds this altitude, so its duties are drawn empty. The chain will not invent an incumbent: a ladder rung with nobody on it is a fact about the organisation, and pretending otherwise would hide exactly the gap this page exists to show.`),
    h('h4', {}, `Decides: ${rung.decisionForm}`),
    h('p', { class: 'small' }, rung.decisionQuestion),
    h('h4', {}, 'Duties and the routes that serve them'),
    h('ul', { class: 'stack-xs' }, ...rung.duties.map((duty) => h('li', { class: 'stack-xs' },
      h('div', { class: 'row-inline' }, h('strong', {}, duty.label),
        ...duty.routes.slice(0, 3).map((route) => h('a', { class: 'btn btn-small btn-ghost', href: route }, route.replace('#/', '')))),
      h('span', { class: 'muted small' }, duty.question)))),
    h('h4', {}, 'Owes the level above'),
    h('ul', { class: 'stack-xs' }, ...rung.handUp.map((line) => h('li', { class: 'small' }, line))),
    h('h4', {}, 'Must not be handed'),
    h('ul', { class: 'stack-xs' }, ...rung.forbidden.map((line) => h('li', { class: 'small' }, line))));

  return card({
    title: `${rung.rank}. ${rung.label}`,
    subtitle: `${rung.unitLabel} · horizon ${rung.horizonDays} days · span band ${altitudeByKey(rung.key)?.spanBand?.join('–') || '—'}`,
    actions: rung.represented ? [badge(`${rung.owners.length} owner(s)`, 'good')] : [badge('not represented', 'neutral')],
    body,
  });
}

function altitudesPanel(ctx, report) {
  const blocks = [];

  const rollupRows = report.ladder.map((rung) => {
    const spans = report.spans.filter((span) => span.rank === rung.rank);
    const pool = poolAltitude(spans, report.conventions);
    // Direct reports, not subtree size: summing `peopleN` across rungs would
    // count a person once at every altitude above them. The people whose manager
    // sits at this altitude is the only count that adds up to the roster.
    const directReports = rung.owners.reduce((total, owner) => total + (owner.span || 0), 0);
    return {
      altitude: altitudeBadge(rung.key, rung.stance),
      label: rung.label,
      horizon: `${rung.horizonDays}d`,
      owners: String(rung.owners.length),
      people: String(directReports),
      open: String(rung.rollupOpenN),
      own: String(rung.ownOpenN),
      debt: rung.debtN ? badge(String(rung.debtN), 'warn') : h('span', { class: 'muted' }, '0'),
      pooled: pool.pooled === null ? h('span', { class: 'muted' }, 'withheld') : pct(pool.pooled),
      mean: pool.meanOfRates === null ? h('span', { class: 'muted' }, '—') : pct(pool.meanOfRates),
      gap: pool.gapPp === null ? '—' : `${pool.gapPp} pp`,
      flag: pool.compositionSensitive
        ? badge('composition-sensitive', 'warn', `the pooled rate and the mean of unit rates differ by more than the declared ${report.conventions.chainMaterialityPp} pp`)
        : h('span', { class: 'muted' }, '—'),
    };
  });

  blocks.push(card({
    title: 'The roll-up, altitude by altitude',
    subtitle: 'Counts are exact sums: every item has exactly one owner, so no record is counted twice. Rates are pooled (numerators over denominators) and the naive mean of unit rates is printed beside them — because a roll-up that quietly averages averages reports a number nobody experienced.',
    body: table({
      columns: [
        { label: 'Altitude', render: (row) => row.altitude },
        { label: 'Horizon', render: (row) => row.horizon },
        { label: 'Owners', render: (row) => row.owners },
        { label: 'Direct reports', render: (row) => row.people },
        { label: 'Open (rolled up)', render: (row) => row.open },
        { label: 'Held directly', render: (row) => row.own },
        { label: 'Past horizon', render: (row) => row.debt },
        { label: 'Pooled rate', render: (row) => row.pooled },
        { label: 'Mean of rates', render: (row) => row.mean },
        { label: 'Gap', render: (row) => row.gap },
        { label: 'Composition', render: (row) => row.flag },
      ],
      rows: rollupRows,
      caption: 'The five altitudes of the ladder, represented or not. Empty rungs are printed with zeros rather than omitted. “Direct reports” counts the people whose manager sits at that altitude, so the column adds up to the roster; a subtree count would count a person once at every rung above them.',
    }),
  }));

  const missing = report.ladder.filter((rung) => !rung.represented);
  if (missing.length) {
    blocks.push(banner({
      tone: 'info',
      title: `${missing.length} of the 5 altitudes have nobody in them`,
      body: `Read upward from your own altitude: ${report.ladder.filter((rung) => rung.represented).map((rung) => rung.shortLabel).join(' → ') || 'nothing'} is the whole chain this roster describes. Every item whose age or consequence places it higher is reported as demanding a level the workspace does not contain — that is the honest reading, not a rounding error. Add the manager above you (or the person you report to) and the rungs fill in.`,
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: `#/chain?panel=escalation` }, 'See what demands those rungs')],
    }));
  }

  blocks.push(...report.ladder.slice().reverse().map((rung) => altitudeCard(report, rung)));
  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------- 3. escalation */

function escalationPanel(ctx, report) {
  const blocks = [];
  const queue = report.escalationQueue;
  const debt = queue.filter((item) => !item.aboveTop);

  if (!queue.length) {
    blocks.push(banner({
      tone: 'good',
      title: 'Nothing has outlived the altitude that owns it',
      body: 'Every open item is inside its owner’s time span: nothing has run longer than the period its altitude is allowed to hold work without review. This is the state the page is trying to produce — it is not a claim that the work is easy, only that nothing is being carried by a level too junior to decide it.',
    }));
  } else {
    blocks.push(banner({
      tone: debt.length ? 'warn' : 'info',
      title: `${debt.length} item(s) belong to a level above their owner`,
      body: `${report.totals.aboveTop} of them demand a level the chain does not contain at all, so there is nobody to escalate to and the honest move is to decide them or to change the altitude you declared. Nothing on this list was re-typed to escalate: the clock is each altitude’s own time span, and the crossing date is that span added to the day the item was opened.`,
      actions: [
        h('a', { class: 'btn btn-small btn-ghost', href: '#/chain?panel=drift' }, 'Open the drift audit'),
        h('a', { class: 'btn btn-small btn-ghost', href: '#/chain?panel=altitudes' }, 'Read the ladder'),
      ],
    }));
  }

  const forecast = report.leader.forecast;
  blocks.push(card({
    title: 'Your own span, before it escalates',
    subtitle: `A survival estimate over the ages at which this workspace’s own items actually closed, applied to every item you own. The quoted figure is the Fréchet lower bound — “at least one of these crosses the next horizon” with no independence assumption — with the independence value printed beside it so the assumption has a price.`,
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-cards' },
        stat({ label: 'Next threshold', value: forecast.nextThresholdDays ? `${forecast.nextThresholdDays}d` : '—', hint: forecast.nextAltitude ? `the ${forecast.nextAltitude} horizon` : 'no level above yours' }),
        stat({
          label: 'Any breach by then',
          value: forecast.predictedAnyBreachPct === null ? 'refused' : pct(forecast.predictedAnyBreachPct),
          tone: forecast.predictedAnyBreachPct !== null ? 'warn' : '',
          hint: forecast.predictedAnyBreachIndependencePct === null ? '' : `${pct(forecast.predictedAnyBreachIndependencePct)} under independence`,
        }),
        stat({ label: 'Items quoted', value: String(forecast.quotedN || 0), hint: forecast.excluded ? `${forecast.excluded} unquotable` : 'every item you own' }),
        stat({ label: 'Predicted breaches', value: count(forecast.predictedBreachN), hint: 'items at ≥ 50% each' })),
      forecast.refused
        ? banner({ tone: 'info', title: 'The probability is refused, and the reason is on the record', body: forecast.refused })
        : null,
      (forecast.members || []).length
        ? table({
          columns: [
            { label: 'Item', render: (row) => row.type },
            { label: 'Threshold', render: (row) => `${row.thresholdDays}d` },
            { label: 'Crosses on', render: (row) => (row.thresholdOn ? formatDate(row.thresholdOn) : '—') },
            { label: 'P(breach)', render: (row) => (row.pBreachPct === null ? h('span', { class: 'muted', title: row.refused || '' }, 'refused') : pct(row.pBreachPct)) },
          ],
          rows: (forecast.members || []).slice(0, 10),
          caption: 'The ten items closest to crossing the next altitude’s horizon, with the date they would cross it.',
        })
        : null),
  }));

  const rows = queue.slice(0, CHAIN_LIMITS.maxRows).map((item) => {
    const ownerHorizon = altitudeByKey(item.ownerAltitude)?.horizonDays;
    const crossedOn = Number.isFinite(ownerHorizon) ? addDays(item.openedOn, ownerHorizon) : null;
    return {
      item: h('a', { href: item.route || '#/today' }, item.title),
      unit: item.unit,
      owner: spanName(report, item.ownerNodeId),
      ownerAltitude: altitudeBadge(item.ownerAltitude),
      requires: altitudeBadge(item.requiredAltitude),
      age: days(item.ageDays),
      crossed: crossedOn ? formatDate(crossedOn) : '—',
      target: item.aboveTop ? badge('above the top', 'bad') : item.targetName,
      route: h('a', { class: 'btn btn-small btn-ghost', href: item.route || '#/today' }, 'Open'),
    };
  });

  blocks.push(card({
    title: 'The escalation queue',
    subtitle: `Ordered by the altitude demanded, then by age. ${queue.length > CHAIN_LIMITS.maxRows ? `Showing the first ${CHAIN_LIMITS.maxRows}; export the brief for the whole list.` : 'Every item is listed.'}`,
    body: rows.length
      ? table({
        columns: [
          { label: 'Item', render: (row) => row.item },
          { label: 'Unit', render: (row) => row.unit },
          { label: 'Owner', render: (row) => row.owner },
          { label: 'Owner altitude', render: (row) => row.ownerAltitude },
          { label: 'Demands', render: (row) => row.requires },
          { label: 'Age', render: (row) => row.age },
          { label: 'Crossed on', render: (row) => row.crossed },
          { label: 'Escalates to', render: (row) => row.target },
          { label: '', render: (row) => row.route },
        ],
        rows,
        caption: 'One row per item that has outlived its owner’s time span. The crossing date is the owner’s horizon added to the day the item was opened.',
      })
      : emptyState({ title: 'The queue is empty', body: 'No open item has passed the horizon of the altitude that owns it.' }),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ---------------------------------------------------------------- 4. drift */

function driftPanel(ctx, report) {
  const requested = ctx.query?.get?.('node');
  const focusId = requested && report.dossiers.has(requested) ? requested : 'leader';
  const focus = report.spans.find((span) => span.nodeId === focusId) || null;
  const focusNode = report.chain.nodes.get(focusId);
  const blocks = [];

  const allRows = report.spans.map((span) => ({
    span: spanName(report, span.nodeId),
    altitude: altitudeBadge(span.altitude),
    own: count(span.drift?.ownN),
    atAltitude: count(span.drift?.atAltitudeN),
    below: span.drift?.driftN ? badge(String(span.drift.driftN), 'warn') : h('span', { class: 'muted' }, '0'),
    above: span.drift?.aboveN ? badge(String(span.drift.aboveN), 'bad') : h('span', { class: 'muted' }, '0'),
    share: span.drift?.driftSharePct === null || span.drift?.driftSharePct === undefined ? '—' : pct(span.drift.driftSharePct, 0),
    verdict: span.drift?.overBar ? badge('over your bar', 'warn', `bar ${span.drift.bar}%`) : badge('inside the bar', 'good'),
  }));

  blocks.push(card({
    title: 'Where work is sitting, span by span',
    subtitle: `Drift is measured in two directions. Below: items whose consequence and age place them at a level *under* their owner — a span doing its reports’ work. Above: items whose requirement is over the owner — work nobody has picked up. The bar is a declaration, not a law: ${report.conventions.chainDriftPct}% of a span’s own work.`,
    body: table({
      columns: [
        { label: 'Span', render: (row) => row.span },
        { label: 'Altitude', render: (row) => row.altitude },
        { label: 'Own work', render: (row) => row.own },
        { label: 'At altitude', render: (row) => row.atAltitude },
        { label: 'Below', render: (row) => row.below },
        { label: 'Above', render: (row) => row.above },
        { label: 'Below share', render: (row) => row.share },
        { label: 'Verdict', render: (row) => row.verdict },
      ],
      rows: allRows,
      caption: 'Altitude drift for every span in the chain.',
    }),
  }));

  if (!focus || !focus.drift) {
    blocks.push(emptyState({ title: 'That span is not in the chain', body: 'Pick a span from the table above.' }));
    return h('div', { class: 'view-stack' }, ...blocks);
  }

  const drift = focus.drift;
  const altitude = altitudeByKey(focus.altitude);
  blocks.push(card({
    title: `Reading ${focus.dossier.name}’s own work`,
    subtitle: `${altitude?.label || 'Unassigned'} · horizon ${altitude?.horizonDays ?? '—'} days · discretion over ${altitude?.unitLabel || '—'}`,
    actions: report.spans.map((span) => (span.nodeId === focusId
      ? badge('showing', 'good')
      : h('a', { class: 'btn btn-small btn-ghost', href: `#/chain?panel=drift&node=${encodeURIComponent(span.nodeId)}` }, span.dossier.name))),
    body: h('div', { class: 'grid-cards' },
      stat({ label: 'Own work', value: String(drift.ownN), hint: 'items whose owner is this span' }),
      stat({ label: 'At this altitude', value: String(drift.atAltitudeN), tone: drift.atAltitudeN ? 'good' : '', hint: 'the work this altitude exists to do' }),
      stat({ label: 'Below', value: String(drift.driftN), tone: drift.driftN ? 'warn' : '', hint: 'belongs to a report' }),
      stat({ label: 'Above', value: String(drift.aboveN), tone: drift.aboveN ? 'bad' : '', hint: 'nobody has taken it' }),
      stat({
        label: 'Below share',
        value: drift.driftSharePct === null ? '—' : pct(drift.driftSharePct, 0),
        tone: drift.overBar ? 'warn' : '',
        hint: `bar ${drift.bar}%`,
      })),
  }));

  const disclosure = altitude?.disclosure || { names: 'visible', itemDetail: true, floorN: 3 };
  const below = discloseItems(drift.driftItems, focus.altitude, report.chain, { cap: CHAIN_LIMITS.maxRows });
  const above = discloseItems(drift.aboveItems, focus.altitude, report.chain, { cap: CHAIN_LIMITS.maxRows });

  const itemTable = (bundle, caption) => (bundle.rows.length
    ? table({
      columns: [
        { label: 'Item', render: (row) => (row.route ? h('a', { href: row.route }, row.title) : row.title) },
        { label: 'Unit', render: (row) => row.unit },
        { label: 'Concerning', render: (row) => row.who },
        { label: 'Age', render: (row) => days(row.ageDays) },
        { label: 'Requires', render: (row) => altitudeBadge(row.requiredAltitude) },
      ],
      rows: bundle.rows,
      caption,
    })
    : emptyState({ title: 'Nothing in this direction', body: 'The list is empty, which is the reading — not a missing filter.' }));

  blocks.push(card({
    title: 'Work sitting below this altitude',
    subtitle: `${drift.driftN} item(s). This is the measurable form of altitude drift: a leader doing the work their reports are accountable for, usually because handing it down takes a conversation and doing it does not.`,
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'muted small' }, DISCLOSURE_TEXT[disclosure.names] || DISCLOSURE_TEXT.visible),
      itemTable(below, `Items owned by this span whose requirement is below its altitude, capped at ${CHAIN_LIMITS.maxRows}.`),
      below.hiddenN ? h('p', { class: 'muted small' }, `${below.hiddenN} further item(s) not shown.`) : null),
  }));

  blocks.push(card({
    title: 'Work sitting above this altitude',
    subtitle: `${drift.aboveN} item(s). Nobody at this level has the authority to decide them, and nobody above has been given the chance: this is how escalation happens by surprise instead of by design.`,
    body: itemTable(above, 'Items owned by this span whose requirement is above its altitude.'),
  }));

  if (!drift.overBar && drift.driftN) {
    blocks.push(banner({
      tone: 'info',
      title: `The drift is real but inside your declared bar`,
      body: `${drift.driftN} of ${drift.ownN} item(s) sit below this altitude — ${pct(drift.driftSharePct, 0)} against the ${drift.bar}% you declared. That is a reading, not a reprimand: a leader carrying some of their team’s work during a bad week is normal. The bar exists so a normal week and a structural problem do not look the same.`,
    }));
  }

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ---------------------------------------------------------------- 5. frozen */

function gradeLabel(reading) {
  if (!reading.graded) return reading.reviewOn && reading.reviewOn <= dayKey(new Date()) ? badge('due', 'warn') : badge('pending', 'neutral');
  if (reading.graded.lapsed) return badge('lapsed', 'neutral', reading.graded.note);
  return badge(`Brier ${reading.graded.brier}`, reading.graded.brier <= 0.25 ? 'good' : 'warn',
    `${reading.graded.observedBreachN} of ${reading.graded.measuredN} member(s) crossed by ${reading.reviewOn}`);
}

function frozenPanel(ctx, report) {
  const blocks = [];
  const readings = report.readings.slice().sort((a, b) => String(b.frozenAt).localeCompare(String(a.frozenAt)));
  const skill = chainSkill(report.readings);

  blocks.push(card({
    title: 'Frozen readings, and whether they were right',
    subtitle: 'A reading is a dated claim about one span: its counts, the rates it could defend, and exactly one prospective probability. It is graded once, after its review date, and never rewritten — a forecast ledger that can be edited afterwards measures nothing.',
    actions: [h('button', {
      class: 'btn btn-small',
      type: 'button',
      onClick: () => openFreezeChainReadingDialog(ctx),
    }, 'Freeze a reading')],
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-cards' },
        stat({ label: 'Frozen', value: String(readings.length), hint: `cap ${report.conventions.chainReadingCap}` }),
        stat({ label: 'Due for grading', value: String(report.ungradedDue.length), tone: report.ungradedDue.length ? 'warn' : '', hint: 'review date has passed' }),
        stat({ label: 'Graded', value: String(readings.filter((row) => row.graded && !row.graded.lapsed).length), hint: 'scored once' }),
        stat({
          label: 'Skill vs base rate',
          value: skill.skill === null ? 'withheld' : String(skill.skill),
          tone: skill.skill !== null && skill.skill > 0 ? 'good' : '',
          hint: skill.refused || `mean Brier ${skill.meanBrier} · base rate ${skill.baseRate}%`,
        })),
      skill.refused ? h('p', { class: 'muted small' }, skill.refused) : null,
      readings.length
        ? table({
          columns: [
            { label: 'Frozen', render: (row) => formatDate(String(row.frozenAt).slice(0, 10)) },
            { label: 'Span', render: (row) => (report.dossiers.has(row.nodeId) ? spanName(report, row.nodeId) : row.nodeId) },
            { label: 'Altitude', render: (row) => altitudeBadge(row.altitude) },
            { label: 'Open', render: (row) => count(row.counts?.openN) },
            { label: 'Own', render: (row) => count(row.counts?.ownOpenN) },
            { label: 'Past horizon', render: (row) => count(row.counts?.debtN) },
            { label: 'Quoted', render: (row) => (Number.isFinite(Number(row.predictedAnyBreachPct)) ? pct(row.predictedAnyBreachPct) : h('span', { class: 'muted', title: row.quoteRefused || '' }, 'refused')) },
            { label: 'Under independence', render: (row) => (Number.isFinite(Number(row.predictedAnyBreachIndependencePct)) ? pct(row.predictedAnyBreachIndependencePct) : '—') },
            { label: 'Review on', render: (row) => (row.reviewOn ? formatDate(row.reviewOn) : '—') },
            { label: 'State', render: (row) => gradeLabel(row) },
            {
              label: '',
              render: (row) => {
                if (row.graded) return h('span', { class: 'muted small' }, 'sealed');
                const controls = [];
                if (row.reviewOn && row.reviewOn <= report.nowDay) {
                  controls.push(h('button', {
                    class: 'btn btn-small',
                    type: 'button',
                    onClick: () => {
                      const result = ctx.api.gradeChainReadingNow(row.id);
                      if (result && result.ok) {
                        toast(result.grade.lapsed
                          ? 'Reading lapsed: every member had been deleted.'
                          : `Graded — ${result.grade.observedBreachN} of ${result.grade.measuredN} crossed; Brier ${result.grade.brier}.`, result.grade.lapsed ? 'warn' : 'good');
                        ctx.refresh();
                        return;
                      }
                      toast((result && result.error) || 'Could not grade the reading.', 'bad');
                    },
                  }, 'Grade'));
                }
                controls.push(h('button', {
                  class: 'btn btn-small btn-ghost',
                  type: 'button',
                  onClick: () => {
                    const result = ctx.api.deleteChainReading(row.id);
                    if (result && result.ok) {
                      toast('Ungraded reading removed with its typed links.', 'good');
                      ctx.refresh();
                      return;
                    }
                    toast((result && result.error) || 'Could not remove the reading.', 'bad');
                  },
                }, 'Delete'));
                return h('div', { class: 'row-inline' }, ...controls);
              },
            },
          ],
          rows: readings.slice(0, report.conventions.chainReadingCap),
          caption: 'Frozen chain readings. Graded rows are sealed and cannot be deleted.',
        })
        : emptyState({
          title: 'No reading has been frozen',
          body: 'Freezing is how a judgement about escalation becomes checkable later. Until then this page is a live measurement with no track record — which is honest, and also the thing the readings exist to fix.',
        })),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------------- 6. about */

function aboutPanel(report) {
  return h('div', { class: 'view-stack' },
    card({
      title: 'What this page computes',
      subtitle: CHAIN_PREMISE,
      body: h('div', { class: 'stack-sm' },
        h('h4', {}, '1. The chain'),
        h('p', { class: 'small' }, 'person.managerId is already a tree: the workspace leader has no manager, and everyone else points at a person. The page reads that tree — decayed pointers, cycles and spans included — and assigns each node an altitude from its recorded level. A person with direct reports and no manager title is escalated to the frontline altitude with the reason printed, because a person with reports is doing a lead’s work whatever the title says.'),
        h('h4', {}, '2. Responsibility, by lowest common ancestor'),
        h('p', { class: 'small' }, 'Work belongs to the leader of the people it concerns. For one person that is their manager; for several it is the lowest common ancestor of their managers — the smallest span that contains everyone the item touches. Nothing about that is a judgement call, so cross-unit work rises to the right level without anyone escalating it by hand.'),
        h('h4', {}, '3. The clock'),
        h('p', { class: 'small' }, 'Each altitude has a time span (Jaques): the longest its work can run without review. An item whose age has passed its owner’s span belongs to the level above. `requiredAltitude` is the higher of the altitude its consequence places it at and the altitude its age places it at, so an item can be misrouted by what it touches or by how long it has sat there.'))}),
    card({
      title: 'The frameworks, named',
      subtitle: 'Every one of these is a declared model with a citation, not a fact about leadership. Where a model cannot be applied honestly, the page refuses rather than approximates.',
      body: h('div', { class: 'stack-xs' },
        kv('Time-span of discretion', 'Jaques 1956, Measurement of Responsibility; Jaques 1961, Equitable Payment; Stamp 1986 — an altitude is defined by the longest period its work is judged without review.'),
        kv('Requisite variety', 'Ashby 1956, An Introduction to Cybernetics — a level whose view is a crude aggregate cannot regulate a span whose mix of work differs from everyone else’s, hence the composition guard.'),
        kv('Span of control & channels', 'Graicunas 1933; Urwick 1956; Brooks 1975 — out-degree bands and n(n−1)/2 coordination channels. Declared, printed, never dressed as science.'),
        kv('Lowest common ancestor', 'Tarjan 1979, offline LCA — responsibility for cross-unit work is a property of the tree.'),
        kv('Pooling vs averaging', 'Simpson 1951; Blyth 1972; Greenland, Robins & Pearl 1999 on collapsibility — a pooled rate is what people experienced; a mean of unit rates is a number nobody did.'),
        kv('Direct standardisation', 'Lilienfeld & Lilienfeld 1980; Rothman, Greenland & Lash 2008 — re-weight each unit to a common mix before comparing it to anyone.'),
        kv('Small-cell suppression', 'Sweeney 2002; NCHS/CDC cell-suppression rules — below the evidence floor a cell is withheld, because 1 of 1 identifies a person.'),
        kv('Empirical survival', 'Kaplan & Meier 1958 — the chance an open item is still open later is read off the ages at which this workspace’s items actually closed, and refused when nothing has ever stayed open that long.')),
    }),
    card({
      title: 'What it refuses to do',
      subtitle: 'A refusal is a result. Each of these is printed on the page with its reason rather than filled with a plausible number.',
      body: h('ul', { class: 'stack-xs' },
        h('li', { class: 'small' }, 'It does not print a rate below the evidence floor. A cell of one is a person, not a measurement.'),
        h('li', { class: 'small' }, 'It does not rank or score a person. Every reading is about a span — the work a leader is carrying — and its members are counts.'),
        h('li', { class: 'small' }, 'It does not invent an incumbent for an empty altitude, or a probability the record cannot support.'),
        h('li', { class: 'small' }, 'It does not repair a reporting line. A cycle, an orphan or an inverted title is reported with its consequence; the roster is yours to fix.'),
        h('li', { class: 'small' }, 'It does not read confidential conflicts or anonymous pulse responses. Both are forbidden endpoints in the shared link contract, and widening that contract to compute an org chart is exactly the leak it prevents.'),
        h('li', { class: 'small' }, 'It does not assert access control. In a local-first workspace with no authentication there is one person at the keyboard; the disclosure ladder below is a rendering contract, and the page says so rather than implying a permission system it cannot enforce.')),
    }),
    card({
      title: 'The disclosure ladder',
      subtitle: 'What each altitude is shown of the work below it. Enforced in one function, used by this page and asserted by its test.',
      body: table({
        columns: [
          { label: 'Altitude', render: (row) => altitudeBadge(row.key, row.label) },
          { label: 'Names', render: (row) => row.names },
          { label: 'Item detail', render: (row) => row.detail },
          { label: 'Cell floor', render: (row) => String(row.floor) },
          { label: 'What that means', render: (row) => DISCLOSURE_TEXT[row.names] || '—' },
        ],
        rows: ALTITUDES.map((altitude) => ({
          key: altitude.key,
          label: altitude.label,
          names: altitude.disclosure.names,
          detail: altitude.disclosure.itemDetail ? 'titles and links' : 'unit only',
          floor: altitude.disclosure.floorN,
        })),
        caption: 'The rendering contract per altitude.',
      }),
    }),
    card({
      title: 'The conventions you declared',
      subtitle: 'These are declarations. Each one is clamped by the schema so no setting can disable its own test — a floor of 1 would make every cell measurable, and a drift bar of 100% would make drift undetectable.',
      body: h('div', { class: 'stack-xs' },
        kv('Your altitude', `${altitudeByKey(report.conventions.chainLeaderAltitude)?.label || '—'} · horizon ${altitudeByKey(report.conventions.chainLeaderAltitude)?.horizonDays ?? '—'} days`),
        kv('Evidence floor', `${report.conventions.chainFloorN} observations per cell`),
        kv('Span band', `${report.conventions.chainSpanMin}–${report.conventions.chainSpanMax} direct reports`),
        kv('Drift bar', `${report.conventions.chainDriftPct}% of a span’s own work`),
        kv('Materiality bar', `${report.conventions.chainMaterialityPp} pp between a pooled rate and the mean of rates`),
        kv('Window', `${report.conventions.chainWindowDays} days`),
        kv('Reading review horizon', `${report.conventions.chainReviewHorizonDays} days`),
        kv('Reading cap', `${report.conventions.chainReadingCap} frozen readings`),
        kv('Layer limit', `${report.conventions.chainMaxDepth} layers`),
        kv('Automatic propagation', report.conventions.chainAutoPropagate ? 'on — a scan runs after every mutation' : 'paused — only an explicit scan runs')),
    }),
    card({
      title: 'Where the numbers live',
      subtitle: 'Schema v82 is additive: two collections and their markers, no rewrite of existing records.',
      body: h('p', { class: 'small' }, `\`chainReadings\` holds frozen readings (aggregate only — counts, distances and record ids, never the people inside a span) and \`chainMarkers\` holds rule idempotency tags, capped at ${report.conventions.chainReadingCap} readings. Every count, rate, interval and probability on the other five panels is recomputed on read from records the workspace already holds: nothing is cached across a day, so a reading can never drift away from the record it describes.`),
    }));
}

/* ------------------------------------------------------------------ entry */

export function renderChain(ctx) {
  const { state, now } = ctx;
  const report = chainReport(state, now, state.settings || {});
  const panel = resolvePanel(ctx.query);
  const leaderAltitude = altitudeByKey(report.conventions.chainLeaderAltitude);

  const header = pageHeader({
    eyebrow: 'Command chain',
    title: 'Is this work at the altitude that owns it — and does the level above see it without asking?',
    subtitle: 'One hierarchy, five altitudes, one clock. Every span in this roster is read against the period its altitude may hold work without review; anything older belongs to the level above, and the crossing date is printed rather than remembered.',
    actions: [
      stat({ label: 'Spans', value: String(report.totals.spanning), hint: `${report.totals.people} people · ${report.totals.depth} layers` }),
      stat({
        label: 'Your altitude',
        value: leaderAltitude?.shortLabel || '—',
        hint: `${leaderAltitude?.horizonDays ?? '—'}d horizon`,
      }),
      stat({
        label: 'Past a horizon',
        value: String(report.totals.debt),
        tone: report.totals.debt ? 'warn' : '',
        hint: `${report.totals.aboveTop} above the top`,
      }),
      stat({
        label: 'Altitudes used',
        value: `${report.totals.altitudesPresent} / 5`,
        hint: `${5 - report.totals.altitudesPresent} empty rungs`,
      }),
      stat({
        label: 'Ungraded readings',
        value: String(report.ungradedDue.length),
        tone: report.ungradedDue.length ? 'warn' : '',
        hint: 'review date passed',
      }),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openDeclareAltitudeDialog(ctx),
      }, 'Declare altitude'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openChainConventionsDialog(ctx),
      }, 'Conventions'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanChain();
          if (result && result.ok) {
            toast('Scan complete — escalation debt and structural findings reconciled.', 'good');
            ctx.refresh();
          } else {
            toast((result && result.error) || 'Could not scan the chain.', 'bad');
          }
        },
      }, 'Scan now'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.chainBriefText();
          if (!downloadText({ filename: `leados-command-chain-${dayKey(now)}.txt`, text, mime: 'text/plain' })) {
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
      count: row.key === 'escalation' ? report.escalationQueue.length
        : row.key === 'frozen' ? report.readings.length
          : undefined,
    })),
    active: panel,
    ariaLabel: 'Command chain panels',
    onSelect: (key) => navigate(ctx, key),
  });

  const content = panel === 'altitudes'
    ? altitudesPanel(ctx, report)
    : panel === 'escalation'
      ? escalationPanel(ctx, report)
      : panel === 'drift'
        ? driftPanel(ctx, report)
        : panel === 'frozen'
          ? frozenPanel(ctx, report)
          : panel === 'about'
            ? aboutPanel(report)
            : mapPanel(ctx, report);

  return h('div', { class: 'view-stack' }, header, tabBar, content);
}

export default renderChain;
