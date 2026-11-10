/**
 * app/views/matrixPeriodAllocationPanel.js — `#/matrix?panel=allocation`, the
 * Matrix Line Period-Allocation Ledger (ADR-0158, Schema v129 unchanged).
 *
 * Three sections, three questions the live ledger cannot answer:
 *
 *   Board    what did the named period actually charge, in exact integer
 *            share-days — and which parts of the period CANNOT be priced, with
 *            the refusal and its reason printed beside the total?
 *   Ledger   one row per person per declared line: the overlap, the segments
 *            the share stood at, the retunes inside the window, the share-day
 *            figure printed as arithmetic, and the state word with its reason.
 *   Method   what is stored, what is derived, the declared conventions, and
 *            what this ledger refuses.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A period total over the rows that happen to carry a number. One refused
 *    person refuses the workspace total and the reason is printed.
 *  - A weighted figure for days the retained history cannot prove. The
 *    coverage start is printed and the row is refused — today's share is never
 *    projected backwards over the gap.
 *  - An average as a bare float. Every average prints its numerator and
 *    denominator beside the rounded display.
 *  - An over-commitment claim from a partial day sweep. Where any line of a
 *    person could not be priced, the day claim is refused, not narrowed.
 *  - A home-line share weighed into the period. It is counted as out of scope
 *    with the reason printed, because the home pointer moves and this screen
 *    will not name today's holder as a past period's.
 */

import { h } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { startOfDay } from '../core/time.js';
import {
  buildLinePeriodAllocation,
  linePeriodAllocationBriefText,
  linePeriodAllocationCsvRows,
  defaultAllocationPeriod,
} from '../core/domain/linePeriodAllocation.js';
import {
  LINE_PERIOD_ALLOCATION_CSV_COLUMNS,
  LINE_PERIOD_ALLOCATION_CONVENTIONS,
  LINE_PERIOD_ALLOCATION_LIMITS_TEXT,
  LINE_PERIOD_ALLOCATION_QUESTIONS,
  LINE_PERIOD_ALLOCATION_VERDICTS,
} from '../core/domain/linePeriodAllocationRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function toneFor(tone) {
  return tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral';
}

/* ------------------------------------------------------------- period picker */

/**
 * The period presets, computed from the injected `now`. A reconciliation reads
 * a CLOSED period by default; the running quarter and year are offered too, but
 * the screen says which periods are still open.
 */
function periodPresets(now) {
  const d = startOfDay(now) || new Date();
  const today = d.toISOString().slice(0, 10);
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const starts = ['01-01', '04-01', '07-01', '10-01'];
  const lastQ = defaultAllocationPeriod(d);
  return [
    { key: 'last-quarter', label: 'Last completed quarter', from: lastQ.from, to: lastQ.to, open: false },
    { key: 'quarter-to-date', label: 'Quarter to date (open)', from: `${year}-${starts[q]}`, to: today, open: true },
    { key: 'year-to-date', label: 'Year to date (open)', from: `${year}-01-01`, to: today, open: true },
    { key: 'last-year', label: 'Last completed year', from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, open: false },
  ];
}

function periodPicker(ctx, report, now) {
  const presets = periodPresets(now);
  const w = report.window;
  const nav = (from, to) => ctx.navigate(`#/matrix?panel=allocation&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const fromInput = h('input', { type: 'date', value: w.from || '', 'aria-label': 'Period start day' });
  const toInput = h('input', { type: 'date', value: w.to || '', 'aria-label': 'Period end day' });
  return card({
    title: 'The period being priced',
    subtitle: w.valid
      ? `${w.from} to ${w.to} — ${w.days} whole day(s), inclusive at both ends. ${w.source === 'default' ? 'No period was named, so the default is read: the last completed calendar quarter. The screen says so rather than defaulting behind your back.' : 'Named on this screen.'}`
      : 'The named period is REFUSED. Nothing was clamped and nothing was guessed.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'row gap' },
        ...presets.map((p) => h('button', {
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
        h('span', { class: 'muted small' }, 'An open period mixes a measured past with days that have not happened; the figures are only as closed as the window you name.')),
    ),
  });
}

/* -------------------------------------------------------------------- board */

function boardPanel(report) {
  const b = report.board;
  const w = report.window;
  return h('div', { class: 'stack' },
    !w.valid
      ? banner({ tone: 'bad', title: 'The period itself is refused', body: w.refuseReason })
      : null,
    w.valid && b.shareDaysRefused
      ? banner({ tone: 'warn', title: 'The period total is REFUSED', body: b.shareDaysRefusedReason })
      : null,
    w.valid && !b.shareDaysRefused
      ? banner({
        tone: 'good',
        title: 'The period is priced, and the printed rows add to the printed total',
        body: `${b.shareDaysH} share-days over ${b.daysN} period day(s) across ${b.peopleN} person(s) in scope. Totals reconcile: ${b.totalsReconcile ? 'verified as integer equality' : 'NOT verified — treat every figure here as unverified and report it'}.`,
      })
      : null,
    b.personsOverCommittedN
      ? banner({
        tone: 'bad',
        title: `${b.personsOverCommittedN} person(s) were charged more than one whole person on at least one day`,
        body: `${b.overDaysN} over-committed day(s) inside the period; the worst day charged ${b.worstDayShareH}% of a person across declared additional lines. The home line is out of scope, so this count is a FLOOR, and it is only claimed where every line of the person was priced.`,
      })
      : null,
    b.retunedInPeriodN
      ? banner({
        tone: 'warn',
        title: `${b.retunedInPeriodN} line(s) moved inside the period`,
        body: 'A share that changed mid-period means every roll-up that read today’s single number mispriced part of this window. The ledger prints both the standing number and the time-weighted one, and never lets one stand in for the other.',
      })
      : null,

    h('div', { class: 'stat-grid' },
      stat({
        label: 'Share-days charged by the period',
        value: b.shareDaysRefused ? 'refused' : num(b.shareDaysH),
        hint: b.shareDaysRefused
          ? b.shareDaysRefusedReason
          : `${b.averageArithmetic}. Exact integers: hundredths of a person × whole days.`,
        tone: b.shareDaysRefused ? 'bad' : '',
      }),
      stat({
        label: 'Rows priced / rows in scope',
        value: `${b.computedN} / ${b.linesN}`,
        hint: `${b.refusedHistoryGapN} refused for unprovable history · ${b.refusedUndeclaredN} refused for an undeclared day · ${b.refusedDefectN + b.engineRefusalsN} refused by the engine · ${b.outOfWindowN} outside the period · ${b.homeRowsN} home rows counted out of scope`,
      }),
      stat({
        label: 'People in scope',
        value: num(b.peopleN),
        hint: `${b.personsRefusedN} could not be priced · ${b.personsOverCommittedN} over-committed on at least one day · ${b.withheldN} withheld by this seat and counted`,
      }),
      stat({
        label: 'The two identities',
        value: b.countsReconcile && b.totalsReconcile !== false ? 'printed' : 'CHECK',
        hint: `State counts add to the row count: ${b.countsReconcile ? 'yes' : 'NO'}. Person totals add to the workspace total: ${b.totalsReconcile === null ? 'refused with the total' : b.totalsReconcile ? 'yes' : 'NO'}. The two claims are reported separately and never collapsed into one reassuring word.`,
        tone: b.countsReconcile && b.totalsReconcile !== false ? '' : 'bad',
      }),
    ),
  );
}

/* ------------------------------------------------------------------- ledger */

function ledgerPanel(report) {
  if (!report.persons.length) {
    return emptyState({
      title: 'No declared additional line in this seat',
      body: report.singleChainNote || 'No person this seat reaches holds a second reporting line, so no period has a second share to weigh.',
    });
  }
  const rows = [];
  for (const person of report.persons) {
    for (const line of person.lines) {
      rows.push({
        person: h('div', { class: 'stack-tight' },
          h('strong', {}, person.personName),
          h('span', { class: 'muted small' }, `home line: ${person.homeManagerName || '—'}`),
          badge(person.verdictLabel, toneFor(person.verdictTone)),
          person.totals.refused ? h('span', { class: 'muted small' }, 'period total refused') : null),
        line: h('div', { class: 'stack-tight' },
          h('span', {}, line.managerName),
          h('span', { class: 'muted small' }, `${line.kind} line${line.fromISO ? ` from ${line.fromISO}` : ''}${line.toISO ? ` to ${line.toISO}` : ''}`),
          line.relationshipMerged ? h('span', { class: 'muted small' }, 'second declared kind to the same manager: one relationship in the graph, two charges on the person — both are weighed') : null),
        overlap: line.overlap
          ? h('div', { class: 'stack-tight' },
            h('span', {}, `${line.overlap.from} → ${line.overlap.to}`),
            h('span', { class: 'muted small' }, `${line.overlap.days} day(s) of the period`))
          : h('span', { class: 'muted small' }, 'does not touch the period'),
        weighted: h('div', { class: 'stack-tight' },
          line.shareDaysH !== null
            ? h('strong', {}, `${line.shareDaysH} share-days`)
            : h('strong', {}, 'refused'),
          line.averageArithmetic ? h('span', { class: 'muted small' }, `${line.averageArithmetic} = ${line.averageShareDisplay}`) : null,
          line.segments.length
            ? h('span', { class: 'muted small' }, line.segments.map((s) => `${s.shareH}% × ${s.days}d`).join(' + ')
                + (line.segmentsOmittedN ? ` + ${line.segmentsOmittedN} more segment(s) counted, not printed` : ''))
            : null),
        state: h('div', { class: 'stack-tight' },
          badge(line.stateLabel, toneFor(line.stateTone)),
          h('span', { class: 'muted small' }, line.reason),
          line.retunesInWindowN ? h('span', { class: 'muted small' }, `${line.retunesInWindowN} change(s) inside the window; first day ${num(line.firstShareH)}%, last day ${num(line.lastShareH)}%`) : null,
          line.historyAtCap ? h('span', { class: 'muted small' }, `history at its cap; coverage provable from ${num(line.coverageFrom)}`) : null,
          line.historyUnsorted ? h('span', { class: 'muted small' }, 'stored history was out of timestamp order; read in timestamp order and printed as such') : null,
          line.sameDayRetunesN ? h('span', { class: 'muted small' }, `${line.sameDayRetunesN} same-day change(s): the day is read at its closing share`) : null),
        personTotal: h('div', { class: 'stack-tight' },
          person.totals.shareDaysH !== null
            ? h('strong', {}, `${person.totals.shareDaysH} share-days`)
            : h('strong', {}, 'refused'),
          person.totals.averageArithmetic ? h('span', { class: 'muted small' }, `${person.totals.averageArithmetic} = ${person.totals.averageShareDisplay}`) : null,
          person.totals.overDaysN ? h('span', { class: 'muted small' }, `${person.totals.overDaysN} over-committed day(s), worst at ${person.totals.worstDayShareH}%`) : null,
          person.totals.overCommitmentRefused ? h('span', { class: 'muted small' }, person.totals.overCommitmentRefusedReason) : null,
          h('span', { class: 'muted small' }, person.totals.reconciles === null
            ? 'row-to-total identity: refused with the total'
            : `row-to-total identity: ${person.totals.reconciles ? 'verified' : 'FAILED — report it'}`)),
      });
    }
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Every declared line, weighed against the named period',
      subtitle: `${report.persons.length} person(s), read from ${report.scopeLabel}. Nothing on this table is stored: every segment and total is recomputed from the persisted declarations on every render.`,
      body: table({
        caption: 'Time-weighted period allocation per declared line',
        emptyMessage: 'No declared line in this seat.',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'Line', key: 'line' },
          { label: 'Overlap', key: 'overlap' },
          { label: 'Time-weighted', key: 'weighted' },
          { label: 'State', key: 'state' },
          { label: 'Person total', key: 'personTotal' },
        ],
        rows,
      }),
    }),
    report.engineRefusals.length
      ? card({
        title: 'Rows the engine could not attribute to anyone',
        subtitle: `${report.board.engineRefusalsN} row(s) name no roster person. Counted, printed, never weighted${report.engineRefusalsOmittedN ? `; ${report.engineRefusalsOmittedN} more counted beyond the printed bound` : ''}.`,
        body: table({
          caption: 'Engine refusals',
          columns: [
            { label: 'Row', key: 'row' },
            { label: 'Refusal', key: 'refusal' },
          ],
          rows: report.engineRefusals.map((r) => ({
            row: `${r.kind} line naming “${r.personId}”`,
            refusal: h('span', { class: 'muted small' }, `${r.defect}: ${r.detail}`),
          })),
        }),
      })
      : null,
  );
}

/* ------------------------------------------------------------------- method */

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The questions this panel answers',
      subtitle: 'Printed so a reader knows what the figures are for.',
      body: h('ul', { class: 'muted small' }, ...LINE_PERIOD_ALLOCATION_QUESTIONS.map((q) => h('li', {}, q))),
    }),
    card({
      title: 'What this ledger does',
      subtitle: `Engine ${report.engineVersion}. Stored: the declarations, their windows and their bounded change history — all of which predate this module. Derived on every read: every segment, every share-day total, every verdict.`,
      body: h('div', { class: 'stack' },
        ...report.method.map((m) => h('div', { class: 'stack-tight' },
          h('strong', {}, m.name),
          h('p', { class: 'muted small' }, m.why))),
      ),
    }),
    card({
      title: 'Declared conventions',
      subtitle: 'A convention nobody can see is an assumption doing arithmetic in the dark.',
      body: h('ul', { class: 'muted small' }, ...LINE_PERIOD_ALLOCATION_CONVENTIONS.map((c) => h('li', {}, c))),
    }),
    card({
      title: 'Six row states, five verdicts',
      subtitle: 'Declared precedence, so the panel, the brief and the CSV cannot disagree about a word.',
      body: table({
        caption: 'Declared verdict ladder',
        columns: [
          { label: 'Verdict', key: 'label' },
          { label: 'Opens work', key: 'open' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: LINE_PERIOD_ALLOCATION_VERDICTS.map((v) => ({
          label: badge(v.label, toneFor(v.tone)),
          open: v.open ? 'yes' : 'no',
          detail: h('span', { class: 'muted small' }, v.detail),
        })),
      }),
    }),
    card({
      title: 'Honest limits',
      subtitle: 'Printed on the page, so the reading cannot be mistaken for a measurement of hours worked.',
      body: h('ul', { class: 'muted small' }, ...LINE_PERIOD_ALLOCATION_LIMITS_TEXT.map((t) => h('li', {}, t))),
    }),
  );
}

/* -------------------------------------------------------------------- route */

/**
 * @param {object} ctx   the view context (state, query, navigate)
 * @param {object} opts  { now }
 */
export function renderPeriodAllocationPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const q = ctx?.query;
  const fromParam = q?.get?.('from') || null;
  const toParam = q?.get?.('to') || null;
  const report = buildLinePeriodAllocation(state, {
    from: fromParam,
    to: toParam,
    now,
    settings: state.settings || null,
  });
  if (!report) {
    return emptyState({ title: 'Period allocation unavailable', body: 'The ledger could not be built for this workspace.' });
  }
  const brief = linePeriodAllocationBriefText(report);
  const csvRows = linePeriodAllocationCsvRows(report);

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'Every roll-up in this product charges a line at ONE number — the share on the declaration today. A period that contains a retune was therefore never priced as it ran. This ledger weighs each declared line across the period you name, in exact integer share-days, and refuses the figure wherever the retained record cannot prove the window.'),

    periodPicker(ctx, report, now),
    boardPanel(report),

    card({
      title: 'The brief (identity-free)',
      subtitle: 'The paragraph a director pastes into the quarter review. It names no person, no manager and no declaration.',
      body: h('div', { class: 'stack-sm' },
        h('p', {}, brief),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: 'leados-line-period-allocation-brief.txt',
              text: `${brief}\n`,
              mime: 'text/plain',
            }),
          }, 'Download brief'),
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: `leados-line-period-allocation-${report.generatedOn}.csv`,
              text: serializeCsv(
                LINE_PERIOD_ALLOCATION_CSV_COLUMNS.map((key) => ({ key, header: key })),
                csvRows,
              ),
              mime: 'text/csv',
            }),
          }, 'Download aggregate CSV'),
        ),
      ),
    }),

    report.isMatrix ? ledgerPanel(report) : emptyState({
      title: 'Nothing to weigh',
      body: report.singleChainNote || 'No declared additional line reaches this seat.',
    }),
    methodPanel(report),
  );
}

export default renderPeriodAllocationPanel;
