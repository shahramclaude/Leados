/**
 * app/views/matrixHorizonPanel.js — `#/matrix?panel=horizon`, the Matrix
 * Forward Allocation Horizon (ADR-0179, Schema v143 unchanged).
 *
 * Every other matrix surface reads the declared lines for TODAY (the live
 * ledger, ADR-0140) or for a CLOSED period (the period-allocation ledger,
 * ADR-0158). A reporting line is a dated agreement, and this panel reads it
 * FORWARD: the lines that start next month and the lines that end in three
 * weeks are already in the record, and a weekly staffing review needs the
 * three questions that review exists to answer:
 *
 *   Picker   how far forward? Whole ISO weeks, 1–26; outside the bounds the
 *            window REFUSES with the bound printed — never clamped.
 *   Board    who is double-booked, split-unknown or unallocated on a day that
 *            has not arrived — one verdict per person, worst first, adding to
 *            the headcount — and the four reconciliation claims, printed as
 *            four separate claims, never one reassuring word.
 *   Weeks    one row per ISO week: person-days by state and the exact integer
 *            share-days, BLANK with the reason wherever an undeclared
 *            person-day or a refused declaration touches the total.
 *   People / events / managers / exposures
 *            the dated changes (roll-offs, roll-ons, home-share lapses) with
 *            what each person is left in the day after, what each manager
 *            holds week by week, and each forward exposure with the one seat
 *            that owns the fix — or the explicit reason no seat does.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A share-day total over the rows that happen to carry a number. An
 *    undeclared person-day or a refused line withholds every total it
 *    touches, with the reason on the row.
 *  - A future day's roster. Today's roster is held constant and the
 *    convention says so; a hire or a planned reorganisation is not read.
 *  - An owner for an exposure that has no single owning seat. Leader-held,
 *    tied and off-roster owners are counted and labelled; nobody is picked.
 *  - An average, a ramp or a smoothed share. Each line is read at the share
 *    it was declared at, until its declared last day.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  lineHorizonBriefText,
  lineHorizonCsvRows,
  lineHorizonStateLabel,
} from '../core/domain/lineHorizon.js';
import {
  LINE_HORIZON_BOUNDS,
  LINE_HORIZON_CSV_COLUMNS,
  LINE_HORIZON_RULE_ID,
} from '../core/domain/lineHorizonRegistry.js';

const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');
const num = (v) => (v === null || v === undefined ? '—' : String(v));
const yesNo = (v) => (v === null || v === undefined ? '—' : v ? 'yes' : 'NO');

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function act(ctx, result, ok) {
  if (!result?.ok) { toast(result?.error || 'The action was refused.', 'bad'); return; }
  toast(ok, 'good');
  refresh(ctx);
}

/* ------------------------------------------------------------- week picker */

const WEEK_PRESETS = [1, 4, 13, 26];

function weekPicker(ctx, report) {
  const bounds = LINE_HORIZON_BOUNDS.weeks;
  const current = report.window.valid ? report.window.weeks : null;
  const nav = (weeks) => ctx.navigate(`#/matrix?panel=horizon&weeks=${encodeURIComponent(String(weeks))}`);
  const input = h('input', {
    class: 'input',
    type: 'number',
    min: String(bounds.min),
    max: String(bounds.max),
    step: '1',
    value: current === null ? '' : String(current),
    'aria-label': 'Horizon length in whole weeks',
    style: 'width: 6rem;',
  });
  return card({
    title: 'How far forward?',
    subtitle: report.window.valid
      ? `${report.window.from} to ${report.window.to} — ${report.window.weeks} ISO week(s), ${report.window.days} day(s). ${report.window.source === 'fallback' ? 'No horizon was named, so the default is read: thirteen weeks, one quarter. The screen says so rather than defaulting behind your back.' : 'Named on this screen.'}`
      : 'The named horizon is REFUSED. Nothing was clamped and no shorter horizon was substituted.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' },
        ...WEEK_PRESETS.map((weeks) => h('button', {
          class: `btn btn-small ${weeks === current ? 'btn-primary' : 'btn-ghost'}`,
          type: 'button',
          onClick: () => nav(weeks),
        }, weeks === 1 ? '1 week' : `${weeks} weeks`)),
        input,
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          onClick: () => {
            const value = String(input.value || '').trim();
            if (!value) return;
            nav(value);
          },
        }, 'Read this horizon'),
      ),
      h('p', { class: 'muted small' },
        `Bounds: ${bounds.min}–${bounds.max} whole weeks, default ${bounds.fallback}. A value outside the bounds is refused with the bound printed — clamping would answer a question nobody asked. Weeks are ISO calendar weeks, Monday to Sunday; the first bucket is the rest of the running week and prints its own day count.`),
    ),
  });
}

/* ------------------------------------------------------------------- board */

function boardSection(report) {
  const b = report.board;
  const a = report.asks;
  const w = report.window;

  const withheld = !b.readingComplete
    ? banner({ tone: 'warn', title: 'Share-day totals are WITHHELD', body: b.withheldReason })
    : null;

  const reconciles = [
    b.personDaysReconcile,
    b.verdictsReconcile,
    b.readingComplete ? b.shareDaysReconcile : null,
    b.readingComplete ? b.fanOutReconcile : null,
    b.readingComplete ? b.weeksReconcile : null,
  ];
  const allGood = reconciles.every((claim) => claim === true || claim === null);
  const reconcileBanner = allGood
    ? banner({
      tone: 'good',
      title: 'The printed figures are the computed figures, and the printed rows add to the printed totals',
      body: `Reported separately: person-days add to people × days (${yesNo(b.personDaysReconcile)}); the six verdicts add to the headcount (${yesNo(b.verdictsReconcile)})`
        + (b.readingComplete
          ? `; attributed − capacity = over − unallocated (${yesNo(b.shareDaysReconcile)}); manager fan-out equals the person total (${yesNo(b.fanOutReconcile)}); the weeks add to the board (${yesNo(b.weeksReconcile)}).`
          : '. Share-day and fan-out claims are withheld with the totals above — they are not asserted over a refused reading.'),
    })
    : banner({ tone: 'bad', title: 'A reconciliation failed — do not rely on these figures', body: 'At least one displayed partition does not sum to its computed population. Report it as a defect rather than reading the total.' });

  return h('div', { class: 'stack' },
    !w.valid
      ? banner({ tone: 'bad', title: 'The horizon itself is refused', body: w.refuseReason })
      : null,
    w.valid && !report.isMatrix
      ? banner({ tone: 'info', title: 'Single-chain workspace', body: report.singleChainNote })
      : null,
    w.valid ? withheld : null,
    w.valid ? reconcileBanner : null,
    h('div', { class: 'stat-grid' },
      stat({ label: 'People in scope', value: num(b.peopleN), hint: `${report.scopeLabel}${report.peopleRemainderN ? ` · ${report.peopleRemainderN} row(s) past the ${report.limits.people}-person cap` : ''}` }),
      stat({ label: 'Double-booked ahead', value: num(b.verdicts['double-booked-ahead']), tone: b.verdicts['double-booked-ahead'] ? 'bad' : 'good', hint: 'Enters over-commitment on a later day' }),
      stat({ label: 'Split unknown / unallocated ahead', value: `${num(b.verdicts['split-unknown-ahead'])} / ${num(b.verdicts['unallocated-ahead'])}`, tone: (b.verdicts['split-unknown-ahead'] + b.verdicts['unallocated-ahead']) ? 'bad' : 'good', hint: 'A share goes missing, or a remainder nobody holds' }),
      stat({ label: 'Roll-offs / roll-ons dated ahead', value: `${num(b.rollOffN)} / ${num(b.rollOnN)}`, hint: `${num(b.homeShareChangeN)} home-share change(s) · ${num(b.returnsToHomeN)} return(s) to the home line (${b.returnsWholeN} whole)` }),
      stat({
        label: 'Attributed share-days',
        value: b.readingComplete ? num(b.attributedShareDaysH) : 'withheld',
        tone: b.readingComplete ? '' : 'warn',
        hint: b.readingComplete
          ? `against ${num(b.capacityShareDaysH)} of capacity · ${num(b.overShareDaysH)} over · ${num(b.unallocatedShareDaysH)} unallocated (integer hundredths × days)`
          : b.withheldReason,
      }),
      stat({
        label: 'Exposures inside the lead window',
        value: num(a.insideLeadWindowN),
        hint: `${a.leadWindowDays}-day window · ${a.owners.unique} one seat · ${a.owners['leader-held']} leader-held · ${a.owners.ambiguous} no single seat · ${a.owners['off-roster']} off-roster · ${a.openN} ask(s) open, ${a.answeredN} answered, ${a.notIssuedN} not issued`,
        tone: a.insideLeadWindowN && !a.owners.unique ? 'warn' : '',
      }),
    ),
  );
}

/* ------------------------------------------------------------------ tables */

function verdictsSection(report) {
  const b = report.board;
  return card({
    title: 'One verdict per person, worst first',
    subtitle: 'The six counts add to the headcount — a person is counted once, under the worse of the two states, so the columns cannot double-count.',
    body: table({
      caption: 'Person verdicts across the horizon',
      columns: [
        { label: 'Verdict', key: 'label' },
        { label: 'People', render: (row) => h('strong', null, num(b.verdicts[row.key])) },
        { label: 'What it means', key: 'detail' },
      ],
      rows: report.verdictDefs,
    }),
  });
}

function weeksSection(report) {
  const withheldCell = (week, display) => (week.complete
    ? display
    : h('span', { class: 'muted', title: week.withheldReason || 'Withheld' }, 'withheld'));
  return card({
    title: 'Week by week',
    subtitle: 'Exact integer share-days (hundredths of a person × whole calendar days). A total an undeclared person-day or a refused line touches is withheld on that row — never summed over the rows that happen to carry a number.',
    body: table({
      caption: 'ISO weeks of the horizon',
      columns: [
        { label: 'Week', render: (week) => `W${week.index} · ${week.from} → ${week.to}${week.partial ? ' (partial)' : ''}` },
        { label: 'Days', key: 'days' },
        { label: 'Person-days', key: 'personDaysN' },
        { label: 'Over', render: (week) => num(week.statePersonDays['over-committed']) },
        { label: 'Under', render: (week) => num(week.statePersonDays['under-allocated']) },
        { label: 'Unknown', render: (week) => num(week.statePersonDays.undeclared) },
        { label: 'Attributed', render: (week) => withheldCell(week, num(week.attributedShareDaysH)) },
        { label: 'Capacity', render: (week) => withheldCell(week, num(week.capacityShareDaysH)) },
        { label: 'Over-committed', render: (week) => withheldCell(week, num(week.overShareDaysH)) },
        { label: 'Held by nobody', render: (week) => withheldCell(week, num(week.unallocatedShareDaysH)) },
        { label: 'Roll-off / on / home change', render: (week) => `${week.rollOffN} / ${week.rollOnN} / ${week.homeShareChangeN}` },
      ],
      rows: report.weeks,
    }),
  });
}

function peopleSection(report) {
  return card({
    title: 'People, worst first',
    subtitle: `Today's state and the last day of the horizon, read from the same engine that prints the live ledger. ${report.peopleRemainderN ? `${report.peopleRemainderN} row(s) past the ${report.limits.people}-person cap are counted out, not guessed.` : 'Every person in scope is listed.'}`,
    body: table({
      caption: 'Person verdicts with today and last-day states',
      columns: [
        { label: 'Person', key: 'name' },
        { label: 'Verdict', render: (row) => badge(row.verdictLabel, toneFor(row.verdictTone)) },
        { label: 'Today', render: (row) => `${row.stateTodayLabel} · ${row.totalTodayDisplay ?? '—'} · ${row.lineNToday} line(s)` },
        { label: `Last day (${report.window.to})`, render: (row) => `${lineHorizonStateLabel(row.stateLastDay)} · ${row.totalLastDayDisplay ?? '—'} · ${row.lineNLastDay} line(s)` },
        { label: 'First exposure', render: (row) => (row.firstExposureOn ? `${row.firstExposureOn} (in ${row.firstExposureInDays} day(s))` : '—') },
        { label: 'Dated changes', render: (row) => num(row.eventN) },
      ],
      rows: report.people,
    }),
  });
}

function eventsSection(report) {
  if (!report.events.length && !report.isMatrix) return null;
  return card({
    title: 'Dated changes inside the horizon',
    subtitle: 'One row per stored line boundary. “After” is what the SAME engine reads on the first day after the change — never inferred from the event itself.',
    body: table({
      caption: 'Line boundaries inside the horizon',
      columns: [
        { label: 'Day', render: (row) => `${row.day} (in ${row.daysUntil} day(s))` },
        { label: 'Change', render: (row) => badge(row.kindLabel, row.kind === 'roll-off' || row.kind === 'home-share-end' ? 'warn' : 'neutral') },
        { label: 'Person', key: 'personName' },
        { label: 'Line', render: (row) => `${row.lineKindLabel}${row.managerName ? ` → ${row.managerName}` : row.managerId ? ` → ${row.managerId}` : ' (manager withheld)'}` },
        { label: 'Share', render: (row) => row.shareDisplay ?? 'undeclared' },
        { label: 'Left in', render: (row) => badge(row.outcomeLabel, toneFor(row.outcomeTone)) },
        { label: 'Total after', render: (row) => `${row.totalAfterDisplay ?? '—'} across ${row.lineNAfter} line(s)` },
      ],
      rows: report.events,
    }),
  });
}

function managersSection(report) {
  return card({
    title: 'What each manager holds, week by week',
    subtitle: `Share-days per ISO week in declared order (W1 → W${report.window.weeks}); “×” means a person-day under that manager could not be resolved, so the total is withheld rather than summed over the rest. ${report.managersRemainderN ? `${report.managersRemainderN} manager row(s) past the cap are counted out.` : ''}`,
    body: table({
      caption: 'Per-manager forward load',
      columns: [
        { label: 'Manager', render: (row) => (row.withheld ? h('span', { class: 'muted' }, 'name withheld by detail ceiling') : row.name) },
        { label: 'Today', render: (row) => row.todayShareDisplay ?? `${row.todayUnresolvedN} unresolved` },
        { label: `Last day (${report.window.to})`, render: (row) => row.lastShareDisplay ?? `${row.lastUnresolvedN} unresolved` },
        { label: 'Change', render: (row) => row.changeDisplay ?? '—' },
        { label: 'Roll-on / off / returns', render: (row) => `${row.rollOnN} / ${row.rollOffN} / ${row.returnsN}` },
        { label: 'Horizon share-days', render: (row) => (row.unresolvedPersonDaysN ? h('span', { class: 'muted', title: `${row.unresolvedPersonDaysN} unresolved person-day(s)` }, 'withheld') : row.personDaysDisplay) },
        { label: 'By week', render: (row) => h('span', { class: 'small mono' }, row.weeks.map((slot) => (slot.shareDaysH === null ? '×' : String(slot.shareDaysH))).join(' · ')) },
      ],
      rows: report.managers,
    }),
  });
}

function exposuresSection(report) {
  return card({
    title: 'Forward exposures and who owns the fix',
    subtitle: 'An exposure begins on the first day the declared shares create it. The owner is read from the graph on that day — never chosen among managers. The ask state is read back from the typed graph.',
    body: table({
      caption: 'Forward exposures inside the horizon',
      columns: [
        { label: 'State', render: (row) => badge(row.stateLabel, row.state === 'over-committed' || row.state === 'undeclared' ? 'bad' : 'warn') },
        { label: 'Person', key: 'personName' },
        { label: 'From', render: (row) => `${row.from} (in ${row.daysUntil} day(s)) · ${row.days} day(s)${row.reachesHorizonEnd ? ', through the horizon end' : ''}` },
        { label: 'Declared total', render: (row) => `${row.totalDisplay ?? '—'}${row.deviationDisplay ? ` (${row.deviationDisplay})` : ''}` },
        { label: 'Lines that day', render: (row) => row.lines.map((line) => `${line.managerName || (line.managerId === null ? 'manager withheld' : line.managerId)} · ${line.kindLabel} · ${line.shareDisplay ?? 'undeclared'}${line.toISO ? ` · to ${line.toISO}` : ''}`).join('; ') },
        { label: 'Owner', render: (row) => (row.ownerState === 'unique'
          ? (row.ownerName || (row.ownerWithheld ? h('span', { class: 'muted' }, 'name withheld') : row.ownerState))
          : badge(row.ownerState, 'warn')) },
        { label: `Ask (lead window ${report.asks.leadWindowDays}d)`, render: (row) => (row.insideLeadWindow
          ? (row.askState === 'open' ? badge(`open · due ${row.askDueOn || '—'}`, 'warn')
            : row.askState === 'answered' ? badge('answered', 'good')
              : badge('not issued', 'neutral'))
          : h('span', { class: 'muted' }, 'outside window')) },
      ],
      rows: report.exposures,
    }),
  });
}

function incomingSection(report) {
  if (!report.incoming.length) return null;
  return card({
    title: 'Lines declared TO this seat, not yet started',
    subtitle: 'A person who joins this span on a later day is listed only by the one line declared to this seat — never by their other lines, their total or their state.',
    body: table({
      caption: 'Incoming lines for this seat',
      columns: [
        { label: 'First day', render: (row) => `${row.day} (in ${row.daysUntil} day(s))` },
        { label: 'Person', key: 'personName' },
        { label: 'Line', key: 'lineKindLabel' },
        { label: 'Declared share', key: 'shareDisplay' },
      ],
      rows: report.incoming,
    }),
  });
}

function refusedSection(report) {
  if (!report.refusedLines.length) return null;
  return card({
    title: 'Declarations the ledger does not read',
    subtitle: 'Every refusal is listed with its days. One whose dates are reversed touches every day between the two it names.',
    body: table({
      caption: 'Refused line declarations',
      columns: [
        { label: 'Person', render: (row) => row.personName || '(not on the roster)' },
        { label: 'Manager', render: (row) => row.managerName || (row.managerId === null ? 'withheld / unknown' : row.managerId) },
        { label: 'Line', key: 'kindLabel' },
        { label: 'Defect', key: 'defect' },
        { label: 'Days touched', render: (row) => `${row.days} (${row.firstDay} → ${row.lastDay})` },
        { label: 'Why', key: 'detail' },
      ],
      rows: report.refusedLines,
    }),
  });
}

function asksSection(report) {
  const a = report.asks;
  return card({
    title: `Asks RULE-LHZ-01 issues inside the ${a.leadWindowDays}-day lead window`,
    subtitle: a.autoPropagate
      ? 'Auto-propagation is ON: the rule runs on line acts and on any write while a boundary sits inside the window or one of its own asks is open. The record holds no clock — in a workspace nobody writes to, nothing is issued.'
      : 'Auto-propagation is OFF (the declared matrix convention): only an explicit scan runs the rule.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Exposures beginning in the window', value: num(a.insideLeadWindowN) }),
        stat({ label: 'With one accountable seat', value: num(a.owners.unique) }),
        stat({ label: 'Leader-held / no single seat / off-roster', value: `${num(a.owners['leader-held'])} / ${num(a.owners.ambiguous)} / ${num(a.owners['off-roster'])}`, hint: 'Observed and counted; nobody is substituted' }),
        stat({ label: 'Open / answered / not issued', value: `${num(a.openN)} / ${num(a.answeredN)} / ${num(a.notIssuedN)}`, hint: 'Asked once per exposure of one seat; an answer is never re-asked' }),
      ),
      h('p', { class: 'muted small' },
        'The rule never edits a line, a share, a date or a roster record; it never closes an ask because the day arrived, and it is inert in a single-chain workspace.'),
    ),
  });
}

/* ------------------------------------------------------------------ export */

function exportCsv(report) {
  // The SAME rows the panel is built from, so an exported figure is provably
  // the figure that was printed — at this horizon, not a default one.
  return serializeCsv(
    LINE_HORIZON_CSV_COLUMNS.map((key) => ({ key, header: key })),
    lineHorizonCsvRows(report),
  );
}

/* ------------------------------------------------------------------- panel */

export function renderMatrixHorizonPanel(ctx, { now = new Date() } = {}) {
  const weeksRaw = ctx?.query?.get?.('weeks') ?? null;
  const result = ctx.api?.matrixHorizonReport?.({ weeks: weeksRaw });
  if (!result?.ok) {
    return card({
      title: 'Matrix forward allocation horizon',
      body: banner({ tone: 'bad', title: 'Reading refused', body: result?.error || 'The reader could not run.' }),
    });
  }
  const report = result.report;
  const w = report.window;

  const actions = h('div', { class: 'row gap' },
    h('button', {
      class: 'btn btn-small btn-primary',
      type: 'button',
      onClick: () => act(ctx, ctx.api.matrixHorizonScan(), `Scanned (${LINE_HORIZON_RULE_ID}).`),
    }, 'Scan now'),
    h('button', {
      class: 'btn btn-small',
      type: 'button',
      onClick: () => downloadText({
        filename: `leados-matrix-horizon-${report.generatedOn}.txt`,
        text: lineHorizonBriefText(report),
      }),
    }, 'Download brief'),
    h('button', {
      class: 'btn btn-small',
      type: 'button',
      onClick: () => downloadText({
        filename: `leados-line-horizon-${report.generatedOn}.csv`,
        text: exportCsv(report),
      }),
    }, 'Export CSV (#134)'),
  );

  return h('div', { class: 'stack', 'data-testid': 'matrix-horizon-panel' },
    card({
      title: 'Matrix Forward Allocation Horizon',
      subtitle: 'The dated reporting-line declarations read forward: who rolls off which line and into what, who is double-booked on a day that has not arrived, and what each manager holds week by week. One engine — the live ledger, re-evaluated on each day the line set changes.',
      actions,
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Horizon', value: w.valid ? `${w.from} → ${w.to}` : 'refused', hint: w.valid ? `${w.weeks} week(s), ${w.days} day(s) · first day equals the live ledger by construction` : w.refuseReason, tone: w.valid ? '' : 'bad' }),
          stat({ label: 'Engine evaluations', value: num(report.board.segmentN), hint: 'day(s) the line set changes — not every day of the horizon' }),
          stat({ label: 'Read over', value: report.scopeLabel, hint: `seat ${report.seat.label}${report.managerNamesWithheld ? ' · manager names withheld by detail ceiling' : ''}` }),
          stat({ label: 'Lead window', value: `${report.asks.leadWindowDays} day(s)`, hint: `the live ledger's own matrixExpiringDays · auto-propagation ${report.asks.autoPropagate ? 'on' : 'off'}` }),
        ),
        boardSection(report),
      ),
    }),
    weekPicker(ctx, report),
    w.valid && report.isMatrix ? verdictsSection(report) : null,
    w.valid ? weeksSection(report) : null,
    w.valid ? peopleSection(report) : null,
    w.valid ? eventsSection(report) : null,
    w.valid ? managersSection(report) : null,
    w.valid ? exposuresSection(report) : null,
    w.valid ? incomingSection(report) : null,
    w.valid ? refusedSection(report) : null,
    w.valid ? asksSection(report) : null,
    w.valid && !report.isMatrix
      ? emptyState({
        title: 'No additional reporting line in force on any day of this horizon',
        body: report.singleChainNote,
      })
      : null,
    card({
      title: 'What is declared, what is derived, what this reading cannot know',
      body: h('div', { class: 'stack-sm' },
        table({
          caption: 'Declared conventions',
          columns: [
            { label: 'Convention', key: 'label' },
            { label: 'Declared as', key: 'value' },
            { label: 'Why', key: 'detail' },
          ],
          rows: report.conventionRows,
        }),
        h('h3', { class: 'small' }, 'Method'),
        h('ol', { class: 'stack small' }, ...report.method.map((m) => h('li', {}, h('strong', null, `${m.name}. `), m.why))),
        h('h3', { class: 'small' }, 'Limits printed on this page, not buried'),
        h('ul', { class: 'stack small' }, ...report.limitsText.map((text) => h('li', null, text))),
      ),
    }),
  );
}

export default renderMatrixHorizonPanel;
