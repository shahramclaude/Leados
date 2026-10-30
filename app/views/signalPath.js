/**
 * app/views/signalPath.js — the Signal Path terminal (Session 85, Schema v59).
 *
 * The screen is organised around one number no other tool in this category
 * produces: the probability that a material event three levels below the leader
 * reaches the leader's desk, unprompted, through the chain that is supposed to
 * carry it. Everything else on the page exists so a sceptical reader can check
 * that number rather than trust it.
 *
 *   Path     the roster as a channel: every person, their depth, and the reach
 *            and wait from their position up to the leader
 *   Reach    the declared event classes, with the arithmetic behind each figure
 *   Probes   the falsifier ledger: what was opened, what settled, and how the
 *            declared reach has held up
 *   Levers   interventions priced in the leader's own hours against a hurdle
 *   Method   the frameworks, the conventions and the exact limits
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, table, tabs, barRow } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { formatDate } from '../core/time.js';
import {
  SIGNAL_STATUS_LABELS,
  SIGNAL_LEARNED_VIA_LABELS,
  SIGNAL_MIN_PROBES,
  buildSignalReport,
  evaluateChannel,
  hopsFor,
  buildReportingIndex,
} from '../core/domain/signalPath.js';
import { buildAttentionMarket } from '../core/domain/attentionMarket.js';
import {
  openSignalClassDialog,
  openSignalCommitDialog,
  openSignalProbeDialog,
  openSignalSettleDialog,
  openSignalLeverDialog,
} from '../ui/signal-modals.js';

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const code = String(currency || '').trim().toUpperCase();
  return `${code ? `${code} ` : ''}${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function bits(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(2)}`;
}

function toneForReach(reach, floor = 0.5) {
  if (reach === null || reach === undefined) return '';
  if (reach < floor / 2) return 'bad';
  if (reach < floor) return 'warn';
  return 'good';
}

/**
 * The one expensive read on this page. The Attention Market's shadow price is
 * the leader's own measured price of an extra hour, and it is the correct
 * hurdle for a lever — but the solve costs real milliseconds, so only the panel
 * that prints it pays for it, exactly like the Frontier ladder on that terminal.
 */
function hourValueFromMarket(ctx) {
  try {
    const market = buildAttentionMarket(ctx.state, ctx.now);
    const primary = market.markets[0];
    if (primary && primary.saturated && Number.isFinite(Number(primary.shadowPrice)) && primary.shadowPrice > 0) {
      return { value: Number(primary.shadowPrice), currency: primary.currency, source: 'market' };
    }
  } catch {
    // A market that cannot be built is not an error here: the declared hour
    // value is the documented fallback and the page says which one it used.
  }
  return { value: ctx.state.settings?.sigHourValue ?? 250, currency: null, source: 'settings' };
}

export function renderSignalPath(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const requestedPanel = ctx.query?.get?.('panel') || ctx.query?.get?.('tab') || 'path';
  const panels = ['path', 'reach', 'probes', 'levers', 'method'];
  const panel = panels.includes(requestedPanel) ? requestedPanel : 'path';
  const requestedClass = ctx.query?.get?.('class') || '';
  const hourValue = panel === 'levers' ? hourValueFromMarket(ctx) : { value: ctx.state.settings?.sigHourValue ?? 250, currency: null, source: 'settings' };
  const report = buildSignalReport(ctx.state, now, {
    priceLevers: panel === 'levers',
    hourValue: hourValue.value,
  });
  const classes = report.classes;
  const selected = classes.find((row) => row.id === requestedClass) || classes[0] || null;
  const active = classes.filter((row) => row.status !== 'retired');
  const committed = classes.filter((row) => row.status === 'committed');

  const deepest = active.reduce((worst, row) => (worst === null || row.reading.reach < worst.reading.reach ? row : worst), null);

  const header = pageHeader({
    eyebrow: 'Decisions · Schema v59',
    title: 'Signal path',
    subtitle: 'Everything else in this workspace measures what you already know. This measures the chance you ever get told: the series reliability of your own escalation chain, the bits of a one-bit alarm that survive it, and a priced menu of ways to shorten the odds.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSignalClassDialog(ctx) }, 'Declare a signal class'),
      selected
        ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openSignalProbeDialog(ctx, selected.record || selected.id ? { id: selected.id, label: selected.label } : selected) }, 'Open a probe')
        : null,
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const ok = downloadText({ filename: 'leados-signal-path.txt', text: ctx.api.signalBriefText(), mime: 'text/plain' });
          if (!ok) toast('The download was refused by this browser. The Reach panel prints the same brief.', 'bad');
        },
      }, 'Download brief'),
    ],
    meta: deepest
      ? badge(`deepest declared channel ${pct(deepest.reading.reach)}`, toneForReach(deepest.reading.reach, report.conventions.blindFloor) || 'neutral')
      : badge('no class declared yet', 'neutral'),
  });

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'People below the blind line',
      value: `${report.totals.blindNodes}`,
      hint: report.totals.roster
        ? `of ${report.totals.roster} active · hop ${report.conventions.blindDepth} or deeper at ${Math.round(report.conventions.transmit * 100)}% per relay`
        : 'no roster yet',
      tone: report.totals.blindNodes > 0 ? 'warn' : '',
    }),
    stat({
      label: 'Declared channels',
      value: `${report.totals.committed}`,
      hint: active.length ? `${active.length} active · ${report.totals.declared} draft` : 'declare one to price a path',
    }),
    stat({
      label: 'Probes settled',
      value: `${report.classes.reduce((sum, row) => sum + row.observed.settledCount, 0)}`,
      hint: report.totals.untested
        ? `${report.totals.untested} committed class(es) untested`
        : 'every committed class tested at least once',
      tone: report.totals.untested > 0 ? 'warn' : '',
    }),
    stat({
      label: 'Contradicted declarations',
      value: `${report.totals.contradicted}`,
      hint: `observed reach more than ${report.conventions.underReachPp} pp below the frozen figure`,
      tone: report.totals.contradicted > 0 ? 'bad' : '',
    }));

  const tabsRow = tabs({
    items: [
      { key: 'path', label: 'Path', count: report.totals.roster },
      { key: 'reach', label: 'Reach', count: active.length },
      { key: 'probes', label: 'Probes', count: report.classes.reduce((sum, row) => sum + row.observed.settledCount, 0) },
      { key: 'levers', label: 'Levers' },
      { key: 'method', label: 'Method' },
    ],
    active: panel,
    onSelect: (key) => ctx.navigate(`#/signal?panel=${key}${selected ? `&class=${encodeURIComponent(selected.id)}` : ''}`),
    ariaLabel: 'Signal path sections',
  });

  let body;
  if (panel === 'reach') body = renderReachPanel(report, selected, ctx);
  else if (panel === 'probes') body = renderProbesPanel(report, selected, ctx);
  else if (panel === 'levers') body = renderLeversPanel(report, selected, ctx, hourValue);
  else if (panel === 'method') body = renderMethodPanel(report);
  else body = renderPathPanel(report, active, ctx);

  return h('div', { class: 'page' }, header, null, stats, tabsRow, body);
}

/* ------------------------------------------------------------- path panel */

function renderPathPanel(report, active, ctx) {
  const nodes = [];
  const conventions = report.conventions;

  if (report.totals.cycles) {
    nodes.push(banner({
      tone: 'bad',
      title: 'The reporting lines contain a loop',
      body: `${report.totals.cycles} person record(s) sit in a management cycle. No depth can be computed for them, so no path through them is priced. The roster is the one input this page cannot derive.`,
      actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/people' }, 'Open the roster')],
    }));
  }

  if (!report.totals.roster) {
    nodes.push(emptyState({
      title: 'The roster is empty, so there is no channel',
      body: 'This page prices the path between the people you lead and your own desk. With no reporting lines there is no path to measure — and the rest of the workspace already tells you to add people.',
      action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Add your team'),
      icon: '◍',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  // Reach from each person's own position, computed with the same evaluator.
  const index = buildReportingIndex(ctx.state.people);
  const perPerson = index.nodes.map((node) => {
    if (!Number.isFinite(node.depth)) return { node, reach: null };
    const built = hopsFor({ pathPersonId: node.personId, overrides: {} }, index, ctx.state, conventions, ctx.now);
    if (!built.hops.length) return { node, reach: null };
    return { node, reach: evaluateChannel({ hops: built.hops, direct: { enabled: false }, theta: 0.5 }) };
  });

  nodes.push(card({
    title: 'The channel, person by person',
    subtitle: `Every relay forwards a material signal ${Math.round(conventions.transmit * 100)}% of the time. Reach is what survives the series.`,
    body: h('div', { class: 'stack-xs' },
      ...perPerson.slice(0, 60).map((row) => barRow({
        label: `${'·'.repeat(Math.max(0, (row.node.depth || 1) - 1))}${row.node.name}`,
        value: row.reach ? Math.round(row.reach.reach * 100) : 0,
        hint: row.reach
          ? `hop ${row.node.depth} · reach ${pct(row.reach.reach)} · lag ${row.reach.latencyDays} d · ${bits(row.reach.carriedBits)} of ${bits(row.reach.sourceBits)} bits`
          : 'in a reporting cycle — no depth could be computed',
        tone: row.reach ? (row.reach.reach < conventions.blindFloor ? 'bad' : row.reach.reach < 0.8 ? 'warn' : null) : 'bad',
      }))),
  }));

  nodes.push(h('p', { class: 'muted small' },
    `The bar is the probability that an alert originating with that person arrives at your desk through the chain alone. `
    + `It is a property of the reporting structure and the declared per-hop convention — not a rating of anyone on the path. `
    + `A direct channel, if the class declares one, is added in parallel and will read higher on the Reach tab.`));

  if (!active.length) {
    nodes.push(emptyState({
      title: 'No event class is declared',
      body: 'The path above is the structure. To turn it into money you need one declared class: what kind of event, where it would start, what it would cost, and how likely it is. The page refuses to invent any of those four.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSignalClassDialog(ctx) }, 'Declare the first class'),
      icon: '◮',
    }));
  } else {
    nodes.push(table({
      caption: 'Declared event classes with their frozen status and the live reading',
      columns: [
        {
          label: 'Class',
          render: (row) => h('div', { class: 'stack-xs' },
            h('strong', null, row.label),
            h('span', { class: 'muted' }, `${row.originName || 'no origin'} · ${SIGNAL_STATUS_LABELS[row.status] || row.status}`)),
        },
        { label: 'Hops', className: 'num', render: (row) => (row.blockedReason ? '—' : String(row.reading.hopCount)) },
        { label: 'Reach', className: 'num', render: (row) => badge(pct(row.reading.reach), toneForReach(row.reading.reach, conventions.blindFloor) || 'neutral') },
        { label: 'Lag', className: 'num', render: (row) => `${row.reading.latencyDays} d` },
        { label: 'Bits', className: 'num', render: (row) => `${bits(row.reading.carriedBits)}/${bits(row.reading.sourceBits)}` },
        { label: 'Expected loss', className: 'num', render: (row) => (row.reading.expectedLoss === null ? '—' : money(row.reading.expectedLoss, row.currency)) },
        {
          label: 'Open',
          render: (row) => h('div', { class: 'row-actions' },
            h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => ctx.navigate(`#/signal?panel=reach&class=${encodeURIComponent(row.id)}`),
            }, 'Open'),
            row.status === 'declared'
              ? h('button', {
                class: 'btn btn-small btn-primary',
                type: 'button',
                onClick: () => openSignalCommitDialog(ctx, { id: row.id, label: row.label }),
              }, 'Commit')
              : null),
        },
      ],
      rows: active.slice(0, 30),
    }));
  }

  return h('div', { class: 'stack' }, ...nodes);
}

/* ------------------------------------------------------------ reach panel */

function renderReachPanel(report, selected, ctx) {
  const nodes = [];
  if (!report.classes.length) {
    nodes.push(emptyState({
      title: 'Nothing is declared, so nothing is priced',
      body: 'Declare one class and this panel shows its reach, its false-alarm rate, the information it carries in bits, the wait, and the expected loss its own numbers imply.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSignalClassDialog(ctx) }, 'Declare a class'),
      icon: '◮',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }
  if (!selected) return h('div', { class: 'stack' }, ...nodes);

  const r = selected.reading;
  const conventions = report.conventions;

  if (selected.blockedReason) {
    nodes.push(banner({ tone: 'warn', title: `${selected.label} has no priceable path`, body: selected.blockedReason }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  nodes.push(h('div', { class: 'section-head' },
    h('h2', null, selected.label),
    h('span', { class: 'muted' }, `${SIGNAL_STATUS_LABELS[selected.status]} · ${selected.originName} → you · ${r.hopCount} hop(s)`)));

  nodes.push(h('div', { class: 'stat-grid' },
    stat({ label: 'Reach', value: pct(r.reach), hint: `series ${pct(r.ladderReach)}${selected.direct.enabled ? ` × parallel ${pct(r.directReach)}` : ''}`, tone: toneForReach(r.reach, conventions.blindFloor) }),
    stat({ label: 'False alarms', value: pct(r.falseAlarm), hint: 'compounds in series exactly as reach decays', tone: r.falseAlarm > 0.2 ? 'warn' : '' }),
    stat({ label: 'Wait, if it arrives', value: `${r.latencyDays} d`, hint: 'conditional on arrival — a signal that never arrives has no arrival time' }),
    stat({ label: 'Information carried', value: `${bits(r.carriedBits)} bits`, hint: `of ${bits(r.sourceBits)} bits in the question · ${bits(r.lostBits)} lost`, tone: r.carriedBits < r.sourceBits * 0.3 ? 'warn' : '' })));

  nodes.push(card({
    title: 'The relays',
    subtitle: 'Each row is one hop. The lag at the top is measured from your own 1:1 history; a relay between two reports uses the declared convention, because the workspace has no 1:1 record between two non-leaders.',
    body: table({
      caption: `Each relay on the ${selected.label} path with its transmit probability, false-alarm rate and wait`,
      columns: [
        { label: 'Relay', render: (row, index) => h('div', { class: 'stack-xs' }, h('strong', null, row.name), h('span', { class: 'muted' }, `depth ${index + 1}`)) },
        { label: 'Forwards', className: 'num', render: (row) => h('div', { class: 'stack-xs' }, h('span', null, pct(row.transmit)), h('span', { class: 'muted small' }, row.transmitBasis)) },
        { label: 'Wait', className: 'num', render: (row) => `${row.lagDays} d` },
        { label: 'Where the wait comes from', render: (row) => h('span', { class: 'muted small' }, row.lagBasis) },
      ],
      rows: selected.hops,
    }),
  }));

  if (selected.direct.enabled) {
    nodes.push(card({
      title: 'The parallel branch',
      subtitle: selected.direct.label || 'Direct channel',
      body: h('div', { class: 'kv-grid' },
        h('div', null, h('span', { class: 'muted' }, 'Detects'), h('div', null, pct(selected.direct.detect))),
        h('div', null, h('span', { class: 'muted' }, 'False alarms'), h('div', null, pct(selected.direct.falseAlarm))),
        h('div', null, h('span', { class: 'muted' }, 'Lag'), h('div', null, `${selected.direct.lagDays} d`))),
    }));
  }

  nodes.push(card({
    title: 'What this implies in money',
    subtitle: r.exposure === null
      ? 'No exposure is declared, so the channel is quantified and the money is not'
      : `${money(r.exposure, selected.currency)} exposure at a ${pct(selected.theta)} prior over ${selected.horizonDays} days`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'kv-grid' },
        h('div', null, h('span', { class: 'muted' }, 'Expected loss'), h('div', null, r.expectedLoss === null ? 'not priced' : money(r.expectedLoss, selected.currency))),
        h('div', null, h('span', { class: 'muted' }, 'Weakest relay'), h('div', null, r.weakestHop ? `${r.weakestHop.name} at ${pct(r.weakestHop.transmit)}` : '—')),
        h('div', null, h('span', { class: 'muted' }, 'Blind from depth'), h('div', null, selected.blindDepth === null ? `never, at these conventions` : `${selected.blindDepth} hop(s)`))),
      h('p', { class: 'muted small' }, r.lossBasis)),
  }));

  if (selected.frozen) {
    nodes.push(card({
      title: 'The frozen prediction',
      subtitle: `Committed ${formatDate(selected.committedOn)} · this is what the probes are graded against, not the live reading above`,
      body: h('div', { class: 'kv-grid' },
        h('div', null, h('span', { class: 'muted' }, 'Reach'), h('div', null, pct(selected.frozen.reach))),
        h('div', null, h('span', { class: 'muted' }, 'False alarms'), h('div', null, pct(selected.frozen.falseAlarm))),
        h('div', null, h('span', { class: 'muted' }, 'Lag'), h('div', null, `${selected.frozen.latencyDays} d`)),
        h('div', null, h('span', { class: 'muted' }, 'Bits'), h('div', null, `${bits(selected.frozen.carriedBits)}/${bits(selected.frozen.sourceBits)}`)),
        h('div', null, h('span', { class: 'muted' }, 'Expected loss'), h('div', null, selected.frozen.expectedLoss === null ? '—' : money(selected.frozen.expectedLoss, selected.currency))),
        h('div', null, h('span', { class: 'muted' }, 'Chain at commit'), h('div', null, (selected.frozen.chain || []).map((n) => n.name).join(' → ') || '—'))),
    }));
  }

  if (selected.observed.settledCount) {
    const o = selected.observed;
    nodes.push(card({
      title: 'What the probes say',
      subtitle: o.ready
        ? `${o.hitCount} of ${o.eventCount} event probe(s) delivered · ${o.falseAlarmCount} of ${o.negativeCount} quiet probe(s) fired`
        : `${o.settledCount} settled · below the ${SIGNAL_MIN_PROBES}-probe floor, so these are counts and nothing more`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'kv-grid' },
          h('div', null, h('span', { class: 'muted' }, 'Observed reach'), h('div', null, o.observedReach ? `${pct(o.observedReach.p)}` : '—')),
          h('div', null, h('span', { class: 'muted' }, 'Wilson interval'), h('div', null, o.observedReach?.wilson ? `${pct(o.observedReach.wilson.low)}–${pct(o.observedReach.wilson.high)}` : '—')),
          h('div', null, h('span', { class: 'muted' }, 'Observed false alarm'), h('div', null, o.observedFalse ? pct(o.observedFalse.p) : 'unknown')),
          h('div', null, h('span', { class: 'muted' }, 'd′'), h('div', null, o.sensitivity ? String(o.sensitivity.dPrime) : '—')),
          h('div', null, h('span', { class: 'muted' }, 'Median lag'), h('div', null, o.medianLatency === null ? '—' : `${o.medianLatency} d`)),
          h('div', null, h('span', { class: 'muted' }, 'Brier'), h('div', null, o.brier ? `${o.brier.score} over ${o.brier.n}` : '—'))),
        ...o.notes.map((text) => h('p', { class: 'muted small' }, text))),
    }));
  }

  return h('div', { class: 'stack' }, ...nodes);
}

/* ----------------------------------------------------------- probes panel */

function renderProbesPanel(report, selected, ctx) {
  const nodes = [];
  if (!report.classes.length) {
    nodes.push(emptyState({
      title: 'A probe needs a class to test',
      body: 'Probes measure whether the channel delivers. Without a declared class there is no declared reach to grade, and a hit rate with nothing to compare it to is just a number.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSignalClassDialog(ctx) }, 'Declare a class'),
      icon: '◎',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }
  if (!selected) return h('div', { class: 'stack' }, ...nodes);

  const probes = (ctx.state.signalProbes || []).filter((row) => row && row.classId === selected.id);
  const open = probes.filter((row) => row.status === 'open');
  const settled = probes.filter((row) => row.status === 'settled');

  nodes.push(h('div', { class: 'section-head' },
    h('h2', null, `Probes · ${selected.label}`),
    h('span', { class: 'muted' }, `${open.length} open · ${settled.length} settled`)));

  nodes.push(banner({
    tone: 'info',
    title: 'A probe is a question, not surveillance',
    body: 'You record something you already know that existed down the chain, the day it became true, and later how you came to know it. Only "through the chain" counts as delivery. No message, calendar or person-level score is generated anywhere in this module.',
  }));

  nodes.push(h('div', { class: 'row-actions' },
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSignalProbeDialog(ctx, { id: selected.id, label: selected.label }) }, 'Open a probe')));

  if (!probes.length) {
    nodes.push(emptyState({
      title: 'No probe has ever been opened',
      body: `The declared reach is ${pct(selected.reading.reach)}. Until one probe settles, that is a declaration with no evidence behind it — and this workspace does not pretend otherwise.`,
      icon: '◎',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  nodes.push(table({
    caption: 'Open probes with the declared reach frozen when they were opened',
    columns: [
      { label: 'Probe', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.label), h('span', { class: 'muted' }, row.truth === 'none' ? 'quiet probe — nothing happened' : `existed since ${formatDate(row.existsSinceOn)}`)) },
      { label: 'Frozen reach', className: 'num', render: (row) => pct(row.prediction?.reach) },
      { label: 'Frozen lag', className: 'num', render: (row) => `${row.prediction?.latencyDays ?? '—'} d` },
      {
        label: 'Settle or abandon',
        render: (row) => h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openSignalSettleDialog(ctx, row) }, 'Settle'),
          h('button', {
            class: 'btn btn-small btn-ghost',
            type: 'button',
            onClick: () => {
              const result = ctx.api.abandonSignalProbe(row.id);
              if (result.ok) {
                ctx.refresh();
                toast('Probe abandoned. It is excluded from every rate.', 'neutral');
              } else toast(result.error, 'bad');
            },
          }, 'Abandon')),
      },
    ],
    rows: open,
    emptyMessage: 'No probe is open.',
  }));

  nodes.push(table({
    caption: 'Settled probes with how the leader actually learned, and the lag against the frozen prediction',
    columns: [
      { label: 'Probe', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.label), h('span', { class: 'muted' }, row.truth === 'none' ? 'quiet probe' : `existed since ${formatDate(row.existsSinceOn)}`)) },
      { label: 'Learned via', render: (row) => badge(SIGNAL_LEARNED_VIA_LABELS[row.learnedVia] || '—', row.delivered ? 'good' : 'warn') },
      { label: 'Observed lag', className: 'num', render: (row) => (row.latencyDays === null ? '—' : `${row.latencyDays} d`) },
      { label: 'Frozen lag', className: 'num', render: (row) => `${row.prediction?.latencyDays ?? '—'} d` },
      { label: 'Frozen reach', className: 'num', render: (row) => pct(row.prediction?.reach) },
      { label: 'Settled', className: 'num', render: (row) => formatDate(row.settledOn) },
    ],
    rows: settled.slice(0, 40),
    emptyMessage: 'No probe has settled yet.',
  }));

  const o = selected.observed;
  if (o.settledCount) {
    nodes.push(card({
      title: 'The score',
      subtitle: o.ready ? 'Above the floor: this page will call a contradiction a contradiction' : `Below the ${SIGNAL_MIN_PROBES}-probe floor: counts only`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'kv-grid' },
          h('div', null, h('span', { class: 'muted' }, 'Declared'), h('div', null, pct(o.declaredReach))),
          h('div', null, h('span', { class: 'muted' }, 'Observed'), h('div', null, o.observedReach ? pct(o.observedReach.p) : '—')),
          h('div', null, h('span', { class: 'muted' }, 'Gap'), h('div', null, o.gapPp === null ? '—' : `${o.gapPp} pp`)),
          h('div', null, h('span', { class: 'muted' }, 'Brier'), h('div', null, o.brier ? `${o.brier.score} (n=${o.brier.n})` : '—')),
          h('div', null, h('span', { class: 'muted' }, 'Declared lag'), h('div', null, `${o.declaredLatency ?? '—'} d`)),
          h('div', null, h('span', { class: 'muted' }, 'Observed median lag'), h('div', null, o.medianLatency === null ? '—' : `${o.medianLatency} d`))),
        ...o.notes.map((text) => h('p', { class: 'muted small' }, text))),
    }));
  }

  return h('div', { class: 'stack' }, ...nodes);
}

/* ----------------------------------------------------------- levers panel */

function renderLeversPanel(report, selected, ctx, hourValue) {
  const nodes = [];
  if (!selected || selected.status !== 'committed') {
    nodes.push(emptyState({
      title: 'Levers are priced against a committed class',
      body: 'An intervention with no baseline is an intention. Commit a class first, and every lever below is priced by re-running the same evaluator with that one parameter changed.',
      action: report.classes.length
        ? h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => openSignalCommitDialog(ctx, { id: report.classes[0].id, label: report.classes[0].label }),
        }, 'Commit the first class')
        : h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openSignalClassDialog(ctx) }, 'Declare a class'),
      icon: '⚖',
    }));
    return h('div', { class: 'stack' }, ...nodes);
  }
  const priced = selected.levers;
  if (!priced) {
    nodes.push(emptyState({ title: 'This class has no path to price', body: selected.blockedReason || 'Reload and try again.', icon: '∅' }));
    return h('div', { class: 'stack' }, ...nodes);
  }

  nodes.push(h('div', { class: 'section-head' },
    h('h2', null, `Levers · ${selected.label}`),
    h('span', { class: 'muted' }, `hurdle ${money(priced.price, hourValue.currency || selected.currency)} per hour — ${priced.priceSource}`)));

  nodes.push(banner({
    tone: 'info',
    title: 'The hurdle is your own opportunity cost, not a preference',
    body: hourValue.source === 'market'
      ? 'An Attention Market plan is currently budget-bound, so its measured shadow price — what one more hour of your week would buy elsewhere — is the hurdle used here. A lever that clears it is worth its time; one that does not is shown and refused.'
      : 'No Attention Market plan is currently budget-bound, so the declared value of an hour in Settings is the hurdle. Commit an attention plan and this page will use your measured price instead.',
  }));

  nodes.push(table({
    caption: 'Every candidate intervention, priced by re-running the same channel evaluator',
    columns: [
      {
        label: 'Lever',
        render: (row) => h('div', { class: 'stack-xs' },
          h('strong', null, row.label),
          h('span', { class: 'muted small' }, row.blurb)),
      },
      { label: 'Reach', className: 'num', render: (row) => h('div', { class: 'stack-xs' }, h('span', null, `${pct(row.reachBefore)} → ${pct(row.reachAfter)}`), h('span', { class: 'muted small' }, `${row.deltaReachPp >= 0 ? '+' : ''}${row.deltaReachPp} pp`)) },
      { label: 'Lag', className: 'num', render: (row) => h('div', { class: 'stack-xs' }, h('span', null, `${row.latencyBefore} → ${row.latencyAfter} d`), h('span', { class: 'muted small' }, `${row.deltaLatencyDays >= 0 ? '+' : ''}${row.deltaLatencyDays} d`)) },
      { label: 'False alarms', className: 'num', render: (row) => `${pct(row.falseAlarmBefore)} → ${pct(row.falseAlarmAfter)}` },
      { label: 'Hours', className: 'num', render: (row) => `${row.hours} h` },
      { label: 'Loss avoided', className: 'num', render: (row) => (row.value === null ? 'not priced' : money(row.value, selected.currency)) },
      { label: 'Per hour', className: 'num', render: (row) => (row.valuePerHour === null ? '—' : money(row.valuePerHour, selected.currency)) },
      { label: 'Hurdle', render: (row) => (row.clearsHurdle === null ? badge('unpriced', 'neutral') : badge(row.clearsHurdle ? 'clears' : 'below', row.clearsHurdle ? 'good' : 'warn')) },
      {
        label: 'Adopt',
        render: (row) => h('button', {
          class: 'btn btn-small btn-primary',
          type: 'button',
          onClick: () => openSignalLeverDialog(ctx, { id: selected.id, label: selected.label, ownerId: selected.ownerId }, row, hourValue.value),
        }, 'Adopt'),
      },
    ],
    rows: priced.rows,
  }));

  const adopted = (ctx.state.signalLevers || []).filter((row) => row && row.classId === selected.id);
  if (adopted.length) {
    nodes.push(card({
      title: 'Adopted',
      subtitle: `${adopted.filter((row) => row.status !== 'retired').length} active`,
      body: table({
        caption: 'Adopted interventions with the expectation frozen at adoption',
        columns: [
          { label: 'Lever', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.label), h('span', { class: 'muted' }, `adopted ${formatDate(row.adoptedOn)} · review ${formatDate(row.reviewOn)}`)) },
          { label: 'Hours', className: 'num', render: (row) => `${row.hours} h` },
          { label: 'Reach', className: 'num', render: (row) => `${pct(row.reachBefore)} → ${pct(row.reachAfter)}` },
          { label: 'Status', render: (row) => badge(row.status === 'retired' ? 'Retired' : 'Active', row.status === 'retired' ? 'neutral' : 'good') },
          {
            label: 'Retire',
            render: (row) => (row.status === 'retired' ? null : h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => {
                const result = ctx.api.retireSignalLever(row.id);
                if (result.ok) {
                  ctx.refresh();
                  toast('Lever retired. Its frozen expectation stays on the record.', 'neutral');
                } else toast(result.error, 'bad');
              },
            }, 'Retire')),
          },
        ],
        rows: adopted.slice(0, 20),
      }),
    }));
  }

  return h('div', { class: 'stack' }, ...nodes);
}

/* ----------------------------------------------------------- method panel */

function renderMethodPanel(report) {
  const c = report.conventions;
  return h('div', { class: 'stack' },
    card({
      title: 'The arithmetic',
      body: h('div', { class: 'stack' },
        h('p', null, 'A report that has to pass through d relays reaches you only if every relay forwards it. That is a series reliability block diagram, and it multiplies:'),
        h('p', { class: 'mono' }, 'reach = 1 − (1 − Π t_hop) × (1 − q_direct)'),
        h('p', null, 'False alarms compound the same way but in the opposite direction, which is why a deep hierarchy is simultaneously less sensitive and more prone to crying wolf:'),
        h('p', { class: 'mono' }, 'false = 1 − (1 − Π (1 − a_hop)) × (1 − a_direct)'),
        h('p', null, 'The information the channel carries is Shannon mutual information over a binary asymmetric channel — "something material happened, or not" against "an alert reached you, or silence":'),
        h('p', { class: 'mono' }, 'I(X;Y) = Σ p(x,y) log₂ [ p(x,y) / (p(x)·p(y)) ]'),
        h('p', null, 'The wait is the sum of the per-hop lags, conditional on the signal arriving at all. The expected loss uses one declared convention for how damage accrues:'),
        h('p', { class: 'mono' }, 'E[loss] = θ × exposure × (1 − reach × (1 − min(1, lag / horizon)))'),
        h('p', null, 'Probes give a hit count and a false-alarm count, so discriminability is the standard d′ with a log-linear correction for small samples.'),
        h('p', { class: 'mono' }, 'd′ = z(H) − z(F)')),
    }),
    card({
      title: 'The conventions in force',
      body: h('div', { class: 'kv-grid' },
        h('div', null, h('span', { class: 'muted' }, 'One relay forwards'), h('div', null, `${Math.round(c.transmit * 100)}%`)),
        h('div', null, h('span', { class: 'muted' }, 'One relay false-alarms'), h('div', null, `${Math.round(c.falseAlarm * 100)}%`)),
        h('div', null, h('span', { class: 'muted' }, 'Relay lag (report → report)'), h('div', null, `${c.relayLagDays} d`)),
        h('div', null, h('span', { class: 'muted' }, 'Blind floor'), h('div', null, `${Math.round(c.blindFloor * 100)}%`)),
        h('div', null, h('span', { class: 'muted' }, 'Blind at depth'), h('div', null, `${c.blindDepth} hop(s)`)),
        h('div', null, h('span', { class: 'muted' }, 'Contradiction margin'), h('div', null, `${c.underReachPp} pp`)),
        h('div', null, h('span', { class: 'muted' }, 'Value of an hour'), h('div', null, String(c.hourValue))),
        h('div', null, h('span', { class: 'muted' }, 'Cadence target'), h('div', null, `${c.cadenceTargetDays} d`))),
    }),
    card({
      title: 'What this page does not claim',
      body: h('ul', { class: 'plain-list' },
        h('li', null, 'No surveillance. There is no message, calendar, keystroke or sentiment reading anywhere in this module, and no outbound call.'),
        h('li', null, 'No person is scored. The per-hop transmit probability is a property of the channel you declared, not a judgement about the human on it. The page cannot say "Ana filters bad news" and will not guess.'),
        h('li', null, 'Independence of parallel branches is assumed, not verified. A skip-level and an escalation line plausibly share a failure mode, in which case the parallel branch adds less than the arithmetic says.'),
        h('li', null, 'Latency is conditional on arrival. A signal that never arrives has no arrival time; the module prices the non-arrivals through the loss term rather than pretending they are infinitely late.'),
        h('li', null, 'Damage accrues linearly to the declared horizon. That is one convention, printed with every figure, not a claim about any particular failure mode.'),
        h('li', null, 'A probe measures whether the chain would have delivered something you already found out about. It cannot measure what you never found out about at all — the deepest blind spot is invisible to this page by construction, and is one reason a direct channel exists as a lever.'),
        h('li', null, 'Real-browser and assistive-technology behaviour of this screen is [UNVERIFIED] against a live assistive-technology session.')),
    }),
  );
}
