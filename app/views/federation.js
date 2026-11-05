/**
 * app/views/federation.js — `#/federation`, the Programme Federation Reading
 * (ADR-0090).
 *
 * Five panels, five different questions:
 *   Desk        "What should I do at this altitude, and what is withheld?"
 *   Edges       "Which declared leadership edges actually carried work?"
 *   Channels    "Which measured artefact proves it, and who wrote it?"
 *   Coverage    "What share is connected — with what interval, and refused when?"
 *   Certificate "What can go into a board pack without naming a person?"
 *
 * Nothing on this screen names a person, rates one, or sends anything to
 * anyone. A silent edge is a finding about the EDGE.
 */
import { h, toast, openModal } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { dayKey } from '../core/time.js';
import { FEDERATION_STATE_META } from '../core/domain/federationRegistry.js';

const PANELS = [
  { key: 'desk', label: 'Desk' },
  { key: 'edges', label: 'Edges' },
  { key: 'channels', label: 'Channels' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'certificate', label: 'Certificate' },
];

const CSV_COLUMNS = ['row_kind', 'altitude', 'rank', 'state', 'evidence_n', 'direct_n', 'bypass_n', 'last_carriage_on', 'days_since', 'suppressed'];

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return PANELS.some((item) => item.key === p) ? p : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/federation?panel=${panel}`);
const toneFor = (state) => FEDERATION_STATE_META[state]?.tone || 'neutral';
const stateBadge = (state) => badge(FEDERATION_STATE_META[state]?.label || state, toneFor(state), FEDERATION_STATE_META[state]?.meaning || '');
const pct = (value) => (value === null || value === undefined ? 'withheld' : `${value}%`);

function tableOf({ caption = '', labels = [], rows = [], emptyMessage = 'Nothing here yet.' }) {
  return table({
    caption,
    columns: labels.map((label) => ({ label, render: (row) => row[labels.indexOf(label)] })),
    rows,
    emptyMessage,
  });
}

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The federation action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv(ctx) {
  const result = ctx.api.federationCsvRows();
  if (!result.ok) return toast(result.error, 'bad');
  const text = serializeCsv(CSV_COLUMNS, result.rows);
  const filename = `leados-programme-federation-${dayKey(ctx.now)}.csv`;
  if (!downloadText({ filename, text, mime: 'text/csv' })) {
    openModal({
      title: 'Copy programme federation CSV',
      body: h('textarea', { rows: 16, readonly: true, value: text, class: 'input', 'aria-label': 'Programme federation CSV' }),
    });
  }
}

function exportBrief(ctx) {
  const result = ctx.api.federationBriefText();
  if (!result.ok) return toast(result.error, 'bad');
  const filename = `leados-programme-federation-${dayKey(ctx.now)}.md`;
  if (!downloadText({ filename, text: result.text, mime: 'text/markdown' })) {
    openModal({
      title: 'Copy federation brief',
      body: h('textarea', { rows: 16, readonly: true, value: result.text, class: 'input', 'aria-label': 'Federation brief' }),
    });
  }
}

/** Accessible convention dialog — no blocking window.prompt. */
function openConventionDialog(ctx, report, key) {
  const isWindow = key === 'windowDays';
  const input = h('input', {
    class: 'input', type: 'number', min: isWindow ? '7' : '3', max: isWindow ? '365' : '20',
    step: '1', value: String(isWindow ? report.conventions.windowDays : report.conventions.minSpans),
    'aria-label': isWindow ? 'Federation window in days' : 'Span floor',
  });
  const dialog = openModal({
    title: isWindow ? 'Set the federation window' : 'Set the span floor',
    description: isWindow
      ? 'How many days of carriage an edge is measured over. A longer window flatters a stale edge; a shorter one turns a slow cadence silent.'
      : 'Below this many declared edges the coverage rate is withheld rather than printed. It can never sit below the small-cell floor.',
    body: h('label', { class: 'field' }, h('span', null, isWindow ? 'Window (days)' : 'Span floor'), input),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.federationSetConventions({ [key]: Number(input.value) });
          dialog.close();
          if (notify(result, isWindow ? 'Federation window set.' : 'Span floor set.')) ctx.refresh();
        },
      }, 'Save'),
    ],
    size: 'sm',
  });
}

/* -------------------------------------------------------------------- panels */

function deskPanel(ctx, report) {
  const playbook = report.playbook;
  const coverage = report.coverage;
  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: `What this screen measures at ${report.seat.label.toLowerCase()}`,
      body: report.premise,
    }),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Connected edges', value: report.summary.direct, hint: `of ${report.summary.withParentN} declared edge(s)`, tone: 'good' }),
      stat({ label: 'Bypassed', value: report.summary.bypass, hint: 'carriage reached above the parent', tone: report.summary.bypass ? 'warn' : '' }),
      stat({ label: 'Silent', value: report.summary.silent, hint: 'no dated carriage ever reached above', tone: report.summary.silent ? 'bad' : '' }),
      stat({ label: 'Coverage', value: coverage.refused ? 'withheld' : pct(coverage.pct), hint: coverage.refused ? `below the ${coverage.minSpans}-span floor` : `Wilson 95% ${coverage.lowPct}–${coverage.highPct}%` }),
    ),
    card({
      title: playbook.title,
      subtitle: `${playbook.horizon} · the ${report.seat.label.toLowerCase()} decision this reading exists to support`,
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, 'Question: '), playbook.question),
        h('p', null, h('strong', null, 'What you can see here: '), playbook.see),
        h('p', null, h('strong', null, 'What this altitude can do: '), playbook.act),
        h('p', null, h('strong', null, 'What travels upward: '), playbook.hand),
        h('div', { class: 'form-actions' },
          h('button', {
            type: 'button', class: 'btn btn-primary', disabled: report.seat.readOnly || report.live.overflow,
            onClick: () => {
              const result = ctx.api.federationFreeze();
              if (notify(result, result.existing ? 'A reading for this seat is already frozen today.' : 'Reading frozen; roll-up and any governed carriage findings were propagated.')) ctx.refresh();
            },
          }, 'Freeze this reading'),
          h('button', {
            type: 'button', class: 'btn btn-ghost', disabled: report.seat.readOnly,
            onClick: () => {
              const result = ctx.api.federationScan();
              if (notify(result, 'Every declared edge re-measured; bounded carriage findings opened.')) ctx.refresh();
            },
          }, 'Scan declared edges'),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => exportBrief(ctx) }, 'Copy upward brief'),
          h('a', { class: 'btn btn-ghost', href: '#/seat' }, 'Change altitude'),
        ),
      ),
    }),
    report.live.overflow ? banner({
      tone: 'bad',
      title: 'This span declares more edges than one bounded reading',
      body: 'Narrow the operating seat. No partial assessment is written, because a partial reading would understate how many edges are silent.',
    }) : null,
    card({
      title: 'Open carriage findings',
      subtitle: 'Each is a governed decision owned at the span ABOVE the edge. The engine opens them; only a human resolves them.',
      body: report.openDecisions.length
        ? tableOf({
          caption: 'Open carriage findings',
          labels: ['Finding', 'Edge state', 'Review on', 'Decision'],
          rows: report.openDecisions.map((decision) => [
            decision.title,
            decision.state ? stateBadge(decision.state) : '—',
            decision.reviewOn || '—',
            h('a', { href: '#/decisions' }, 'Open in Decisions'),
          ]),
        })
        : emptyState({ title: 'No open carriage finding in this span', body: 'Either every declared edge carried work inside the window, or nothing has been frozen or scanned yet. The reading itself is still live above.' }),
    }),
    card({
      title: 'What this reading deliberately does not do',
      body: h('ul', { class: 'list' },
        h('li', null, report.disclosure.carriage),
        h('li', null, report.disclosure.local),
        h('li', null, report.disclosure.engine)),
    }),
  );
}

function edgesPanel(ctx, report) {
  if (!report.rows.length) {
    return emptyState({
      title: 'No declared leadership edge in this span',
      body: 'A federation reading needs at least one span with a leadership span above it. Add a reporting line on People, or change altitude.',
    });
  }
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: `Window ${report.window.start} → ${report.window.end}`, body: `An edge counts as connected only when a dated artefact from the span below reached the span above it inside ${report.window.days} days. ${report.disclosure.coverage}` }),
    card({
      title: 'Declared edges, measured',
      subtitle: 'The state is a measurement of the EDGE. No person is named, rated or ranked anywhere in this table.',
      body: tableOf({
        caption: 'Declared leadership edges and their measured carriage',
        labels: ['Span', 'Above', 'State', 'Carried', 'Bypassed', 'Latest carriage', 'Why'],
        rows: report.rows.map((row) => [
          row.label,
          row.parentId ? `span above (${row.parentId})` : 'top of the tree',
          stateBadge(row.state),
          row.suppressed ? 'suppressed' : String(row.directN),
          row.suppressed ? 'suppressed' : String(row.bypassN),
          // ADR-0099: a suppressed row never shows a carriage date — "withheld",
          // never a date and never a misleading "never".
          row.suppressed ? 'withheld' : (row.lastCarriageOn || 'never'),
          row.meaning,
        ]),
      }),
    }),
    report.withheld.length
      ? card({
        title: 'What is withheld here, and why',
        body: h('ul', { class: 'list' }, ...report.withheld.map((item) => h('li', null, h('strong', null, `${item.n} row(s): `), item.reason))),
      })
      : null,
    card({
      title: 'By altitude',
      subtitle: `A group smaller than ${report.conventions.cellFloor} is suppressed as a whole, so no child span can be recovered by subtracting it from the total.`,
      body: tableOf({
        caption: 'Edge states by altitude',
        labels: ['Altitude', 'Edges', 'Connected', 'Bypassed', 'Stale', 'Silent', 'Top'],
        rows: report.byAltitude.map((row) => [
          row.altitudeKey,
          String(row.n),
          row.suppressed ? 'suppressed' : String(row.connected),
          row.suppressed ? 'suppressed' : String(row.bypassed),
          row.suppressed ? 'suppressed' : String(row.stale),
          row.suppressed ? 'suppressed' : String(row.silent),
          row.suppressed ? 'suppressed' : String(row.root),
        ]),
      }),
    }),
  );
}

function channelsPanel(ctx, report) {
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: 'Five channels, all of them other modules’ dated records', body: 'This module writes into none of them. A span cannot improve its reading by using this screen, and a channel that stops producing artefacts degrades the reading instead of hiding it.' }),
    card({
      title: 'Measured channels',
      body: tableOf({
        caption: 'Measured carriage channels',
        labels: ['Channel', 'Source', 'Written by', 'Artefacts', 'Spans', 'Latest'],
        rows: report.channels.map((channel) => [
          channel.label,
          channel.source,
          channel.ruleId,
          String(channel.events),
          String(channel.spans),
          channel.lastOn || 'never',
        ]),
      }),
    }),
    h('div', { class: 'grid-2' }, ...report.channels.map((channel) => card({
      title: channel.label,
      subtitle: `${channel.source} · ${channel.ruleId}`,
      body: h('p', { class: 'muted' }, channel.detail),
    }))),
  );
}

function coveragePanel(ctx, report) {
  const coverage = report.coverage;
  return h('div', { class: 'stack' },
    card({
      title: 'Coverage of the declared tree',
      subtitle: 'A share of DECLARED edges with measured carriage — a property of the information system, never of the people in it.',
      body: h('div', { class: 'stack' },
        coverage.refused
          ? banner({ tone: 'warn', title: 'Rate withheld', body: coverage.reason })
          : banner({
            tone: 'info',
            title: `${coverage.k} of ${coverage.n} declared edges measurably connected`,
            body: `${coverage.pct}% (Wilson 95% interval ${coverage.lowPct}–${coverage.highPct}%). The interval is published because a point estimate on a small tree reads as more certainty than the tree can support.`,
          }),
        h('div', { class: 'stat-grid' },
          stat({ label: 'Edges measured', value: coverage.n, hint: `floor ${coverage.minSpans}` }),
          stat({ label: 'Connected', value: coverage.k }),
          stat({ label: 'Point estimate', value: coverage.refused ? 'withheld' : pct(coverage.pct) }),
          stat({ label: '95% interval', value: coverage.refused ? 'withheld' : `${coverage.lowPct}–${coverage.highPct}%` }),
        ),
      ),
    }),
    card({
      title: 'Conventions',
      subtitle: 'Director rank and above sets these; they bound what every altitude below reads.',
      body: h('div', { class: 'stack' },
        h('p', null, `Window: ${report.conventions.windowDays} days. Span floor: ${report.conventions.minSpans}. Small-cell floor: ${report.conventions.cellFloor}. Automatic propagation: ${report.conventions.autoPropagate ? 'on' : 'off (an explicit scan still runs)'}.`),
        report.seat.rank >= 3
          ? h('div', { class: 'form-actions' },
            h('button', {
              type: 'button', class: 'btn btn-ghost', disabled: report.seat.readOnly,
              onClick: () => openConventionDialog(ctx, report, 'windowDays'),
            }, 'Set window'),
            h('button', {
              type: 'button', class: 'btn btn-ghost', disabled: report.seat.readOnly,
              onClick: () => openConventionDialog(ctx, report, 'minSpans'),
            }, 'Set span floor'))
          : h('p', { class: 'muted' }, 'These conventions are set at director rank and above.'),
      ),
    }),
    card({
      title: 'Frozen readings',
      subtitle: 'Identity-reduced snapshots. Each one rolled up to every leadership ancestor in the same transaction it was written.',
      body: report.assessments.length
        ? tableOf({
          caption: 'Frozen federation readings',
          labels: ['Frozen', 'Altitude', 'Window', 'Connected', 'Silent', 'Coverage'],
          rows: report.assessments.map((row) => [
            row.frozenOn,
            row.altitudeKey || '—',
            `${row.windowDays}d`,
            String(row.summary.direct),
            String(row.summary.silent),
            row.summary.coverage?.refused ? 'withheld' : pct(row.summary.coverage?.pct),
          ]),
        })
        : emptyState({ title: 'No frozen reading yet', body: 'Freeze on the Desk panel to keep a dated, identity-reduced record of this measurement.' }),
    }),
  );
}

function certificatePanel(ctx, report) {
  const coverage = report.coverage;
  return h('div', { class: 'stack' },
    card({
      title: 'Upward certificate',
      subtitle: 'What an executive may carry upward from this reading without exposing a person or a span.',
      body: h('div', { class: 'stack' },
        h('ul', { class: 'list' },
          h('li', null, `Measured on ${report.today} over a ${report.window.days}-day window (${report.window.start} → ${report.window.end}).`),
          h('li', null, `${report.summary.withParentN} declared leadership edge(s): ${report.summary.direct} connected, ${report.summary.bypass} bypassed, ${report.summary.stale} stale, ${report.summary.silent} silent.`),
          h('li', null, coverage.refused ? `Coverage WITHHELD: ${coverage.n} edge(s) below the declared floor of ${coverage.minSpans}.` : `Coverage ${coverage.pct}% (Wilson 95% ${coverage.lowPct}–${coverage.highPct}%) over ${coverage.n} edge(s).`),
          h('li', null, report.disclosure.coverage),
          h('li', null, report.disclosure.local)),
        h('div', { class: 'form-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => exportBrief(ctx) }, 'Download brief (Markdown)'),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => exportCsv(ctx) }, 'Download aggregate CSV'),
        ),
      ),
    }),
    card({
      title: 'Boundary statement',
      body: h('p', { class: 'muted' }, report.disclosure.rollup),
    }),
  );
}

export function renderFederation(ctx) {
  const panel = panelFor(ctx.query);
  const report = ctx.api.federationRead();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The federation reading could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'edges'
      ? edgesPanel(ctx, report)
      : panel === 'channels'
        ? channelsPanel(ctx, report)
        : panel === 'coverage'
          ? coveragePanel(ctx, report)
          : certificatePanel(ctx, report);

  return h('div', { class: 'stack' },
    pageHeader({
      eyebrow: 'Programme',
      title: 'Programme federation',
      subtitle: 'Which declared leadership edges actually carry work — measured from dated artefacts other modules already wrote, not from the reporting line that says they should.',
      actions: [
        badge(`${report.summary.withParentN} declared edge(s)`, 'neutral', 'Leadership edges in this span with a span above them'),
        report.summary.silent ? badge(`${report.summary.silent} silent`, 'bad', 'No dated carriage ever reached above the parent') : badge('no silent edge', 'good'),
      ],
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Federation panels' }),
    body,
  );
}
