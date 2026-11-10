/**
 * app/views/matrixActivityPanel.js — `#/matrix?panel=activity`, the Matrix Line
 * Activity Reconciliation (ADR-0160, Schema v130 unchanged).
 *
 * Five sections, five questions the declared ledger cannot answer:
 *
 *   Board       what the named period charged, what each line actually
 *               originated, and which figures are REFUSED rather than compared.
 *   Ledger      one row per person per priced line: declared share-days, the
 *               declared and observed shares in whole per-mille, the attributed
 *               act count and the gap — or the verdict that refuses the gap.
 *   Placements  where the person's line-addressed acts actually came from:
 *               assigned to one line, home manager, ambiguous, unpriced or no
 *               declared line at all.
 *   Holders     the same reading from the line holder's side, with a rate only
 *               above the declared floor.
 *   Method      what counts as an act, the conventions, the ladder and the
 *               declared limits of the reading.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A share compared against a partially priced declared side.
 *  - An act from a manager holding two of the person's lines, assigned to one.
 *  - A gap below the declared act floor, or a rate below the declared floor.
 *  - An act count as a measure of managerial performance: it is a count of
 *    dated acts, and the method says so in the panel, the brief and the export.
 */

import { h } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { startOfDay } from '../core/time.js';
import {
  buildLineActivity,
  lineActivityBriefText,
  lineActivityCsvRows,
} from '../core/domain/lineActivity.js';
import {
  LINE_ACTIVITY_CSV_COLUMNS,
  LINE_ACTIVITY_PLACEMENTS,
  LINE_ACTIVITY_VERDICTS,
} from '../core/domain/lineActivityRegistry.js';
import { defaultAllocationPeriod } from '../core/domain/linePeriodAllocation.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');

function periodPresets(now) {
  const d = startOfDay(now) || new Date();
  const today = d.toISOString().slice(0, 10);
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const starts = ['01-01', '04-01', '07-01', '10-01'];
  const lastQ = defaultAllocationPeriod(d);
  return [
    { key: 'last-quarter', label: 'Last completed quarter', from: lastQ.from, to: lastQ.to },
    { key: 'quarter-to-date', label: 'Quarter to date (open)', from: `${year}-${starts[q]}`, to: today },
    { key: 'year-to-date', label: 'Year to date (open)', from: `${year}-01-01`, to: today },
    { key: 'last-year', label: 'Last completed year', from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
  ];
}

function periodPicker(ctx, report, now) {
  const w = report.window;
  const nav = (from, to) => ctx.navigate(`#/matrix?panel=activity&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const fromInput = h('input', { type: 'date', value: w.from || '', 'aria-label': 'Period start day' });
  const toInput = h('input', { type: 'date', value: w.to || '', 'aria-label': 'Period end day' });
  return card({
    title: 'The period on both sides',
    subtitle: w.valid
      ? `${w.from} to ${w.to} — ${w.days} whole day(s). The SAME window reads the declared share-days and the dated acts. ${w.source === 'default' ? 'No period was named, so the default is the last completed calendar quarter; the screen says so rather than defaulting behind your back.' : 'Named on this screen.'}`
      : 'The named period is REFUSED. Nothing was clamped and nothing was guessed.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' }, ...periodPresets(now).map((p) => h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onclick: () => nav(p.from, p.to),
      }, p.label))),
      h('div', { class: 'row gap' },
        fromInput,
        toInput,
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          onclick: () => {
            const from = String(fromInput.value || '').trim();
            const to = String(toInput.value || '').trim();
            if (!from || !to) return;
            nav(from, to);
          },
        }, 'Read this period'),
        h('span', { class: 'muted small' }, 'An open period mixes acts already recorded with days that have not happened; the comparison is only as closed as the window you name.')),
    ),
  });
}

function boardPanel(report) {
  const b = report.board;
  const w = report.window;
  return h('div', { class: 'stack' },
    !w.valid
      ? banner({ tone: 'bad', title: 'The period itself is refused', body: w.refuseReason })
      : null,
    w.valid && report.isMatrix && b.driftedN
      ? banner({
        tone: 'bad',
        title: `${b.driftedN} line(s) are running materially out of step with the share they were charged`,
        body: `${b.overActiveN} originating more activity than declared, ${b.underActiveN} less, ${b.silentLineN} charged share-days while originating nothing at all, against a declared band of ±${b.bandPermille / 10} percentage points. Nothing has been retuned: each of these is a question for the two managers and the person, and the declaration is theirs to change.`,
      })
      : null,
    w.valid && b.shareDaysRefused
      ? banner({ tone: 'warn', title: 'The declared share-day total is REFUSED', body: b.shareDaysRefusedReason })
      : null,
    w.valid && report.isMatrix && !b.driftedN
      ? banner({
        tone: 'good',
        title: 'Every compared line is inside the declared band',
        body: `${b.comparedN} line(s) carried enough attributed activity to compare. This is agreement inside a convention about composition — it is not proof that the effort matches, and the method section says why.`,
      })
      : null,
    h('div', { class: 'row gap' },
      stat({ label: 'People', value: num(b.peopleN), hint: 'on more than one reporting line, in this seat' }),
      stat({ label: 'Lines compared', value: num(b.comparedN), hint: `attributed acts ≥ ${b.actFloor}` }),
      stat({ label: 'Out of step', value: num(b.driftedN), hint: 'beyond the declared band', tone: b.driftedN ? 'bad' : '' }),
      stat({ label: 'Refused', value: num(b.refusedN), hint: 'never compared', tone: b.refusedN ? 'warn' : '' }),
      stat({ label: 'Declared share-days', value: b.shareDaysRefused ? 'refused' : num(b.shareDaysH), hint: 'ADR-0158 time-weighted ledger' }),
    ),
    h('div', { class: 'row gap' },
      stat({ label: 'Attributed acts', value: num(b.attributedN), hint: 'one declaration only' }),
      stat({ label: 'Home manager', value: num(b.homeN), hint: 'out of scope on both sides' }),
      stat({ label: 'Ambiguous', value: num(b.ambiguousN), hint: 'one manager, two lines' }),
      stat({ label: 'Unpriced line', value: num(b.unpricedN), hint: 'declared side incomplete' }),
      stat({ label: 'No declared line', value: num(b.otherN), hint: 'skip-level or ended line' }),
    ),
    card({
      title: 'Do these figures reconcile?',
      subtitle: 'Two separate claims. Counts add to the printed line count; shares add to exactly 1000 per-mille wherever a comparison was made.',
      body: h('p', { class: 'muted small' },
        `Counts reconcile: ${b.countsReconcile ? 'verified' : 'NOT verified — treat every figure here as unverified and report it'}. `,
        `Shares reconcile: ${b.sharesReconcile ? 'verified' : 'NOT verified'}. `,
        b.peopleWithNoActN ? `${b.peopleWithNoActN} person(s) in scope originated no dated act inside the window at all. ` : '',
        b.rowsOmittedN ? `${b.rowsOmittedN} row(s) are omitted from this rendering by the declared cap and are counted here. ` : '',
        b.actsOmittedN ? `${b.actsOmittedN} act(s) were beyond the read cap and are counted nowhere on this screen. ` : '',
        'The observed side counts dated acts, not hours and not work items.'),
    }),
  );
}

function ledgerPanel(report) {
  if (!report.isMatrix) {
    return emptyState({
      title: 'Nothing to compare',
      body: report.singleChainNote || 'No declared additional line reaches this seat.',
    });
  }
  const rows = report.people.flatMap((person) => person.lines.map((line) => ({
    person: person.personName,
    line: `${line.managerName} · ${line.kind || 'undeclared'}`,
    declared: num(line.shareDaysH),
    declaredPm: num(line.declaredPermille),
    observedN: num(line.observedN),
    observedPm: num(line.observedPermille),
    gap: line.gapPermille === null || line.gapPermille === undefined
      ? '—'
      : `${line.gapPermille > 0 ? '+' : ''}${line.gapPermille}`,
    verdict: h('div', { class: 'stack-sm' },
      badge(line.verdictLabel, toneFor(line.verdictTone)),
      h('span', { class: 'muted small' }, line.reason)),
  })));
  return card({
    title: 'Declared against what the line originated, line by line',
    subtitle: 'A gap is per-mille of the person’s attributed acts: positive means the line is originating more than it was charged, negative means less. — means the gap was refused, and the reason is printed.',
    body: table({
      caption: 'Line activity per person per priced line',
      emptyMessage: 'No priced line in this seat for this period.',
      columns: [
        { label: 'Person', key: 'person' },
        { label: 'Line', key: 'line' },
        { label: 'Share-days', key: 'declared' },
        { label: 'Declared ‰', key: 'declaredPm' },
        { label: 'Acts', key: 'observedN' },
        { label: 'Observed ‰', key: 'observedPm' },
        { label: 'Gap ‰', key: 'gap' },
        { label: 'Verdict', key: 'verdict' },
      ],
      rows,
    }),
  });
}

function placementPanel(report) {
  if (!report.isMatrix) return null;
  return card({
    title: 'Where the line-addressed acts came from',
    subtitle: 'Every dated act about this person whose own day falls inside the window, placed once. Nothing is split, dropped or charged to a home line.',
    body: table({
      caption: 'Act placements per person',
      emptyMessage: 'No dated act inside the window names a person on a declared line.',
      columns: [
        { label: 'Person', key: 'person' },
        { label: 'One line', key: 'line' },
        { label: 'Home', key: 'home' },
        { label: 'Two lines', key: 'ambiguous' },
        { label: 'Unpriced', key: 'unpriced' },
        { label: 'No line', key: 'other' },
        { label: 'Sources', key: 'sources' },
        { label: 'Shares reconcile', key: 'reconcile' },
      ],
      rows: report.people.map((p) => ({
        person: p.personName,
        line: num(p.attributedN),
        home: num(p.homeN),
        ambiguous: num(p.ambiguousN),
        unpriced: num(p.unpricedN),
        other: num(p.otherN),
        sources: p.sources.length
          ? h('span', { class: 'muted small' }, p.sources.map((s) => `${s.label} ${s.n}`).join(' · '))
          : '—',
        reconcile: p.sharesReconcile === null ? 'not compared' : p.sharesReconcile ? 'verified' : 'NOT verified',
      })),
    }),
  });
}

function holderPanel(report) {
  if (!report.isMatrix || !report.holders.length) return null;
  return card({
    title: 'Line holders',
    subtitle: 'The same reading from the holder’s side. A rate is printed only above the declared floor; below it the counts are shown and no rate is manufactured.',
    body: table({
      caption: 'Line holders and the lines they hold',
      columns: [
        { label: 'Line holder', key: 'holder' },
        { label: 'Lines', key: 'lines' },
        { label: 'People', key: 'people' },
        { label: 'Compared', key: 'compared' },
        { label: 'Out of step', key: 'drifted' },
        { label: 'Refused', key: 'refused' },
        { label: 'Share-days', key: 'shareDays' },
        { label: 'Out-of-step rate', key: 'rate' },
      ],
      rows: report.holders.map((holder) => ({
        holder: holder.managerName,
        lines: num(holder.linesN),
        people: num(holder.peopleN),
        compared: num(holder.comparedN),
        drifted: num(holder.driftedN),
        refused: num(holder.refusedN),
        shareDays: holder.shareDaysH === null
          ? h('span', { class: 'muted small' }, 'refused')
          : num(holder.shareDaysH),
        rate: holder.driftRatePermille === null
          ? h('span', { class: 'muted small' }, holder.driftRateRefusedReason)
          : `${holder.driftRatePermille} per-mille`,
      })),
    }),
  });
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What counts as an act',
      subtitle: 'Each scored source is a dated act a line holder originated about a named person. The load gate already dropped any row missing its line, person, manager or date, so nothing here is repaired or inferred.',
      body: table({
        caption: 'Scored act sources',
        columns: [
          { label: 'Source', key: 'label' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: report.sources.map((s) => ({
          label: s.label,
          detail: h('span', { class: 'muted small' }, s.detail),
        })),
      }),
    }),
    card({
      title: 'The declared conventions',
      subtitle: 'Stated once, used by the screen, the brief and the export.',
      body: table({
        caption: 'Declared conventions',
        columns: [
          { label: 'Convention', key: 'label' },
          { label: 'Value', key: 'value' },
          { label: 'Why', key: 'detail' },
        ],
        rows: report.conventions.map((c) => ({
          label: c.label,
          value: c.value,
          detail: h('span', { class: 'muted small' }, c.detail),
        })),
      }),
    }),
    card({
      title: 'The verdict ladder',
      subtitle: 'The registry is the only place this order is stated, so the panel, the brief and the export cannot disagree about a word.',
      body: table({
        caption: 'Declared verdict ladder',
        columns: [
          { label: 'Verdict', key: 'label' },
          { label: 'Opens work', key: 'open' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: LINE_ACTIVITY_VERDICTS.map((v) => ({
          label: badge(v.label, toneFor(v.tone)),
          open: v.open ? 'yes' : 'no',
          detail: h('span', { class: 'muted small' }, v.detail),
        })),
      }),
    }),
    card({
      title: 'What a placement is',
      subtitle: 'Each act is placed exactly once. The classes that are not “one line” are the reason a comparison can be refused.',
      body: table({
        caption: 'Placement classes',
        columns: [
          { label: 'Class', key: 'label' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: LINE_ACTIVITY_PLACEMENTS.map((p) => ({
          label: p.label,
          detail: h('span', { class: 'muted small' }, p.detail),
        })),
      }),
    }),
    card({
      title: 'The method',
      subtitle: 'What this reading is, and what it is not.',
      body: table({
        caption: 'Encoding',
        columns: [
          { label: 'Basis', key: 'name' },
          { label: 'Why', key: 'why' },
        ],
        rows: report.method.map((m) => ({
          name: m.name,
          why: h('span', { class: 'muted small' }, m.why),
        })),
      }),
    }),
  );
}

export function renderActivityPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const q = ctx?.query;
  const report = buildLineActivity(state, {
    from: q?.get?.('from') || null,
    to: q?.get?.('to') || null,
    now,
    settings: state.settings || null,
  });
  if (!report) {
    return emptyState({ title: 'Line activity unavailable', body: 'The reconciliation could not be built for this workspace.' });
  }
  const brief = lineActivityBriefText(report);
  const csvRows = lineActivityCsvRows(report);

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'Every other matrix surface reads what was DECLARED. This one reads what each line DID. A line declared at 40% of a person that originated no dated act about her all quarter is a line on paper; a line declared at 10% that originated most of her line-addressed acts is consuming attention it never declared. Both are visible here — or the comparison is refused, with the reason printed.'),

    periodPicker(ctx, report, now),
    boardPanel(report),
    ledgerPanel(report),
    placementPanel(report),
    holderPanel(report),

    card({
      title: 'The brief (identity-free)',
      subtitle: 'The paragraph a manager pastes upward. It names no person, no manager and no declaration.',
      body: h('div', { class: 'stack-sm' },
        h('p', {}, brief),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: 'leados-line-activity-brief.txt',
              text: `${brief}\n`,
              mime: 'text/plain',
            }),
          }, 'Download brief'),
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: `leados-line-activity-${report.generatedOn}.csv`,
              text: serializeCsv(
                LINE_ACTIVITY_CSV_COLUMNS.map((key) => ({ key, header: key })),
                csvRows,
              ),
              mime: 'text/csv',
            }),
          }, 'Download aggregate CSV'),
        ),
      ),
    }),

    methodPanel(report),
  );
}

export default renderActivityPanel;
