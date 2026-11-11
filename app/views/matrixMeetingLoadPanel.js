/**
 * app/views/matrixMeetingLoadPanel.js — `#/matrix?panel=meeting-load`, the Matrix
 * Meeting-Load & Coordination-Tax Ledger (ADR-0169, Schema v135 unchanged).
 *
 * Five questions the workspace could not answer before, each on its own card:
 *
 *   Board       how many recorded person-minutes did meetings consume in this
 *               seat, how many of them were convened outside the home line, and
 *               which figures are REFUSED rather than printed.
 *   People      one row per person in scope: exact minutes, sittings, forums,
 *               the split between home / one line / two lines / no line / own
 *               forum, and the cross-line rate — or the printed reason the
 *               total or the rate is refused.
 *   Forums      one row per forum: sittings held, minutes per sitting (refused
 *               below the declared floor), person-minutes and the cross-line
 *               share that forum imposed on the people in the room.
 *   Chairs      the same reading from the convener's side, never as a score.
 *   Method      the conventions, the placement classes, the person-state
 *               ladder, the sitting refusals and the declared limits.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A total for a sitting whose duration nobody recorded, or whose room could
 *    not be validated. The person's total is BLANK and the refusal is counted.
 *  - A rate below the declared floor, per person or per span.
 *  - Any attribution of a chair holding two of a person's declared lines.
 *  - Any language that grades a person on meeting volume. Minutes are a fact
 *    about a calendar; the panel says so in its own words.
 */

import { h } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { startOfDay } from '../core/time.js';
import { defaultAllocationPeriod } from '../core/domain/linePeriodAllocation.js';
import {
  buildMatrixMeetingLoad,
  matrixMeetingLoadBriefText,
  matrixMeetingLoadCsvRows,
} from '../core/domain/matrixMeetingLoad.js';
import {
  MATRIX_MEETING_LOAD_CSV_COLUMNS,
  MATRIX_MEETING_LOAD_LIMITS_TEXT,
  MATRIX_MEETING_LOAD_PLACEMENTS,
  MATRIX_MEETING_LOAD_PERSON_STATES,
  MATRIX_MEETING_LOAD_SESSION_REFUSALS,
} from '../core/domain/matrixMeetingLoadRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');
const hours = (minutes) => (minutes === null || minutes === undefined
  ? '—'
  : `${Math.round((minutes / 60) * 10) / 10} h`);

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
  const nav = (from, to) => ctx.navigate(`#/matrix?panel=meeting-load&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const fromInput = h('input', { type: 'date', value: w.from || '', 'aria-label': 'Period start day' });
  const toInput = h('input', { type: 'date', value: w.to || '', 'aria-label': 'Period end day' });
  return card({
    title: 'The window the sittings are placed in',
    subtitle: w.valid
      ? `${w.from} to ${w.to} — ${w.days} whole day(s). A sitting is placed by the day it actually sat; ${w.source === 'default' ? 'no period was named, so the default is the last completed calendar quarter and the screen says so rather than defaulting behind your back.' : 'named on this screen.'}`
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
        h('span', { class: 'muted small' }, 'Sittings are logged on #/cadence with their duration and their room. A sitting without a duration makes the totals of everyone in it BLANK — it is never assumed to be an hour.')),
    ),
  });
}

function boardPanel(report) {
  const b = report.board;
  const w = report.window;
  if (!w.valid) {
    return banner({ tone: 'bad', title: 'The period itself is refused', body: w.refuseReason });
  }
  return h('div', { class: 'stack' },
    b.refusedSittingsN
      ? banner({
        tone: 'bad',
        title: `${b.refusedSittingsN} sitting(s) could not be read and were charged to nobody`,
        body: `${report.sessionRefusals.filter((r) => r.sittingN > 0).map((r) => `${r.sittingN} ${r.label.toLowerCase()}`).join(' · ')}. The minutes are therefore missing from every total on this page, and ${b.refusedPeopleN} person(s) whose load those sittings touched carry a REFUSED total rather than a partial one.`,
      })
      : null,
    b.spanTaxPermille === null
      ? banner({ tone: 'warn', title: 'The span coordination-tax rate is REFUSED', body: b.spanTaxRefusedReason })
      : banner({
        tone: b.spanTaxPermille >= 500 ? 'warn' : 'info',
        title: `${b.spanTaxPermille} per-mille of recorded meeting time is convened outside the home line`,
        body: `${b.crossLineMinutes} of ${b.chargedMinutes} recorded person-minute(s) across ${b.measuredPeopleN} measured person(s). This is a statement about the CALENDAR — which lines are consuming the room — not about anyone’s diligence, and nothing on this page grades a person on meeting volume.`,
      }),
    h('div', { class: 'row gap' },
      stat({ label: 'Recorded person-minutes', value: num(b.chargedMinutes), hint: `${b.attendeeSittingsN} attendee-sitting(s) in scope` }),
      stat({ label: 'Recorded person-hours', value: hours(b.chargedMinutes), hint: 'exact minutes ÷ 60, one decimal, display only' }),
      stat({ label: 'Printable totals', value: num(b.printableMinutes), hint: b.refusedPeopleN ? `${b.refusedKnownMinutes} minute(s) refused rather than printed as totals` : 'every in-scope total is measured' }),
      stat({ label: 'Cross-line minutes', value: num(b.crossLineMinutes), hint: 'chaired by someone other than the home manager' }),
      stat({ label: 'Sittings held', value: num(b.heldN), hint: `${b.cancelledN} cancelled · ${b.refusedSittingsN} refused` }),
      stat({ label: 'Forums', value: num(b.forumsN), hint: `${b.activeForumsN} active · ${b.retiredForumsN} retired` }),
    ),
    h('div', { class: 'row gap' },
      stat({ label: 'People in scope', value: num(b.peopleN), hint: `${b.measuredPeopleN} measured · ${b.noAttendancePeopleN} no recorded sitting` }),
      stat({ label: 'Totals refused', value: num(b.refusedPeopleN), hint: 'BLANK rather than a partial sum', tone: b.refusedPeopleN ? 'bad' : '' }),
      stat({ label: 'Chaired by the home manager', value: num(b.homeMinutes), hint: 'printed and never charged to a second line' }),
      stat({ label: 'Person’s own forums', value: num(b.selfMinutes), hint: 'their own meeting time, not a tax' }),
      stat({ label: 'Outside seat scope', value: num(b.withheldSittingsN), hint: 'counted, never folded into a figure' }),
    ),
    card({
      title: 'Do these figures reconcile?',
      subtitle: 'Two separate claims, never one reassuring word. The first says every recorded minute was charged once; the second says every sitting and every total could be read at all.',
      body: h('p', { class: 'muted small' },
        `Minutes reconcile: ${b.minutesReconcile ? 'verified' : 'NOT verified — treat every figure here as unverified and report it'}. `,
        `Figures complete: ${b.figuresComplete ? 'verified' : 'NOT verified'}. `,
        `The independently accumulated totals are ${b.sessionMinutes} recorded minute(s) from the sitting log, ${b.chargedMinutes} minute(s) charged to person rows, and ${b.printableMinutes} + ${b.refusedKnownMinutes} minute(s) split between printable totals and refused totals. `,
        b.refusedKnownMinutes
          ? `${b.refusedKnownMinutes} of those minutes belong to ${b.refusedPeopleN} person(s) whose totals are refused and are printed nowhere as a total. `
          : '',
        b.rowsOmittedN ? `${b.rowsOmittedN} person row(s) are omitted by the declared cap and counted here. ` : '',
        b.sessionsOmittedN ? `${b.sessionsOmittedN} sitting(s) were beyond the read cap and are counted nowhere. ` : '',
        b.unreadableDayN ? `${b.unreadableDayN} sitting(s) carry no readable day and were not placed. ` : '',
        b.outsideWindowN ? `${b.outsideWindowN} sitting(s) fall outside the window and belong to another period. ` : '',
        b.withheldAttendancesN ? `${b.withheldAttendancesN} attendee-sitting(s) belong to people outside this seat and are counted, not shown. ` : '',
        'Minutes are whole numbers; nothing on this page is rounded before it is summed.'),
    }),
  );
}

function peoplePanel(report) {
  if (!report.people.length) return null;
  return card({
    title: 'Meeting burden, person by person',
    subtitle: 'Minutes are exact. A total is BLANK only where a sitting this person attended could not be read, and the reason is printed instead of a number that would understate the load.',
    body: table({
      caption: 'Meeting burden per person in scope',
      emptyMessage: 'No person is inside this seat’s scope.',
      columns: [
        { label: 'Person', key: 'person' },
        { label: 'Lines', key: 'lines' },
        { label: 'Sittings', key: 'sittings' },
        { label: 'Minutes', key: 'minutes' },
        { label: 'Hours', key: 'hours' },
        { label: 'Home', key: 'home' },
        { label: 'One line', key: 'line' },
        { label: 'No line', key: 'other' },
        { label: 'Own forum', key: 'self' },
        { label: 'Cross-line rate', key: 'rate' },
        { label: 'State', key: 'state' },
      ],
      rows: report.people.map((p) => ({
        person: p.personName,
        lines: p.linesN ? `${p.linesN} declared` : 'home only',
        sittings: num(p.sittingsN),
        minutes: num(p.minutes),
        hours: hours(p.minutes),
        home: num(p.homeMinutes),
        line: num(p.lineMinutes),
        other: num(p.otherMinutes),
        self: num(p.selfMinutes),
        rate: p.taxPermille === null
          ? h('span', { class: 'muted small' }, p.taxRefusedReason || 'refused')
          : `${p.taxPermille} ‰`,
        state: h('div', { class: 'stack-sm' },
          badge(p.stateLabel, toneFor(p.stateTone)),
          h('span', { class: 'muted small' }, p.reason)),
      })),
    }),
  });
}

function lineShareParityPanel(report) {
  const parity = report.lineShareParity;
  if (!parity?.board?.rowsN) return null;
  const b = parity.board;
  return card({
    title: 'Observed meeting share vs declared line share',
    subtitle: 'For each person and additional line, compare the line’s time-weighted declared share-days with the share of that person’s recorded meeting minutes chaired by that line manager. This is a calendar-mix diagnostic, not a work-output allocation or a manager score.',
    body: h('div', { class: 'stack-sm' },
      banner({
        tone: b.refusedN ? 'warn' : 'info',
        title: `${b.computedN} comparison(s) computed · ${b.refusedN} refused`,
        body: `Row counts reconcile: ${b.rowsReconcile ? 'verified' : 'NOT verified'}. Figures complete: ${b.figuresComplete ? 'verified' : 'NOT verified'}. Observed line-chair minutes printed: ${b.printedObservedMinutes}; refused rows remain blank. The current line must cover the full period, the declared share must be provable, and the person must have at least ${report.board.taxFloorMinutes} readable meeting minutes.`,
      }),
      table({
        caption: 'Per-person declared share against recorded meeting share',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'Line manager', key: 'manager' },
          { label: 'Declared share', key: 'declared' },
          { label: 'Meetings chaired by line', key: 'observed' },
          { label: 'Observed share', key: 'share' },
          { label: 'Difference', key: 'delta' },
          { label: 'State / refusal', key: 'state' },
        ],
        rows: parity.rows.map((row) => ({
          person: row.personName,
          manager: row.managerName,
          declared: row.declaredPermille === null ? '—' : `${row.declaredPermille} ‰ (${row.declaredShareDaysH} share-days / ${row.declaredDays} days)`,
          observed: row.observedMinutes === null ? '—' : `${row.observedMinutes} / ${row.totalMinutes} min`,
          share: row.observedPermille === null ? '—' : `${row.observedPermille} ‰`,
          delta: row.deltaPermille === null ? '—' : `${row.deltaPermille > 0 ? '+' : ''}${row.deltaPermille} ‰`,
          state: row.state === 'computed'
            ? badge('Computed', 'good')
            : h('div', { class: 'stack-sm' }, badge('Refused', 'warn'), h('span', { class: 'muted small' }, row.reason)),
        })),
      }),
    ),
  });
}

function forumPanel(report) {
  if (!report.forums.length) return null;
  return card({
    title: 'What each forum consumed',
    subtitle: 'Minutes per sitting is published from two readable sittings; below that the total is printed and the mean is refused. A retired forum keeps its history — the sittings happened.',
    body: table({
      caption: 'Meeting cost per forum',
      columns: [
        { label: 'Forum', key: 'forum' },
        { label: 'Chair', key: 'chair' },
        { label: 'Kind', key: 'kind' },
        { label: 'Status', key: 'status' },
        { label: 'Held', key: 'held' },
        { label: 'Cancelled', key: 'cancelled' },
        { label: 'Minutes', key: 'minutes' },
        { label: 'Per sitting', key: 'mean' },
        { label: 'Attendee-sittings', key: 'attendeeSittings' },
        { label: 'Person-minutes', key: 'personMinutes' },
        { label: 'Cross-line', key: 'crossLine' },
        { label: 'People', key: 'people' },
      ],
      rows: report.forums.map((f) => ({
        forum: f.title,
        chair: f.chairName || h('span', { class: 'muted small' }, 'chair not on the roster'),
        kind: f.kindLabel,
        status: f.status,
        held: num(f.heldN),
        cancelled: num(f.cancelledN),
        minutes: num(f.minutes),
        mean: f.meanMinutesPerSitting === null
          ? h('span', { class: 'muted small' }, f.meanRefusedReason)
          : `${f.meanMinutesPerSitting} min`,
        attendeeSittings: num(f.attendeeSittingsN),
        personMinutes: num(f.personMinutes),
        crossLine: f.crossLinePermille === null ? '—' : `${f.crossLineMinutes} (${f.crossLinePermille} ‰)`,
        people: num(f.peopleN),
      })),
    }),
  });
}

function chairPanel(report) {
  if (!report.chairs.length) return null;
  return card({
    title: 'The conveners',
    subtitle: 'The same minutes from the chair’s side. “No declared line” is the matrix signature: this convener is taking time from people who do not report to them — which may be entirely right, and is now visible.',
    body: table({
      caption: 'Meeting minutes by chair',
      columns: [
        { label: 'Chair', key: 'chair' },
        { label: 'Forums', key: 'forums' },
        { label: 'Sittings', key: 'sittings' },
        { label: 'Minutes', key: 'minutes' },
        { label: 'Person-minutes', key: 'personMinutes' },
        { label: 'People', key: 'people' },
        { label: 'Their own line', key: 'line' },
        { label: 'No declared line', key: 'other' },
      ],
      rows: report.chairs.map((c) => ({
        chair: c.chairName || c.chairId,
        forums: num(c.forumN),
        sittings: num(c.heldN),
        minutes: num(c.minutes),
        personMinutes: num(c.personMinutes),
        people: num(c.peopleN),
        line: num(c.lineMinutes),
        other: num(c.otherMinutes),
      })),
    }),
  });
}

function refusalPanel(report) {
  const rows = MATRIX_MEETING_LOAD_SESSION_REFUSALS.map((descriptor) => {
    const counted = report.sessionRefusals.find((r) => r.key === descriptor.key) || { sittingN: 0, personN: 0 };
    return {
      refusal: descriptor.label,
      sittings: num(counted.sittingN),
      people: num(counted.personN),
      detail: h('span', { class: 'muted small' }, descriptor.detail),
    };
  });
  return card({
    title: 'What could not be read, and why that is printed rather than patched',
    subtitle: 'Each refusal is counted. None is repaired into a plausible duration, a substituted attendee list or a partial total.',
    body: table({
      caption: 'Sitting refusals',
      columns: [
        { label: 'Refusal', key: 'refusal' },
        { label: 'Sittings', key: 'sittings' },
        { label: 'Attendee-slots', key: 'people' },
        { label: 'What it means', key: 'detail' },
      ],
      rows,
    }),
  });
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The declared conventions',
      subtitle: 'Stated once, used by the screen, the brief and the export. The panel does not paraphrase them.',
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
      title: 'How a sitting is placed against a person’s lines',
      subtitle: 'Exactly one class applies to each charged sitting. There is no “two lines” class: the matrix engine stores at most one line per person per manager, and the ledger will not declare a class nobody can reach.',
      body: table({
        caption: 'Placement classes',
        columns: [
          { label: 'Class', key: 'label' },
          { label: 'Counts as cross-line', key: 'cross' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: MATRIX_MEETING_LOAD_PLACEMENTS.map((p) => ({
          label: p.label,
          cross: p.crossLine ? 'yes' : 'no',
          detail: h('span', { class: 'muted small' }, p.detail),
        })),
      }),
    }),
    card({
      title: 'The person-state ladder',
      subtitle: 'The registry is the only place this order is stated, so the panel, the brief and the export cannot disagree about a word.',
      body: table({
        caption: 'Declared person states',
        columns: [
          { label: 'State', key: 'label' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: MATRIX_MEETING_LOAD_PERSON_STATES.map((s) => ({
          label: badge(s.label, toneFor(s.tone)),
          detail: h('span', { class: 'muted small' }, s.detail),
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
    card({
      title: 'Declared limits',
      body: h('p', { class: 'muted small' },
        `${MATRIX_MEETING_LOAD_LIMITS_TEXT} This is a reading of the sitting log, not of the calendar a person actually kept: a meeting nobody logged is invisible here, and the ledger never claims otherwise.`),
    }),
  );
}

export function renderMatrixMeetingLoadPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const q = ctx?.query;
  const report = buildMatrixMeetingLoad(state, {
    from: q?.get?.('from') || null,
    to: q?.get?.('to') || null,
    now,
    settings: state.settings || null,
  });
  if (!report) {
    return emptyState({ title: 'Meeting load unavailable', body: 'The ledger could not be built for this workspace.' });
  }
  const brief = matrixMeetingLoadBriefText(report);
  const csvRows = matrixMeetingLoadCsvRows(report);

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'Every other matrix surface reads a DECLARATION. This one reads the calendar the record can prove: each held sitting’s recorded minutes multiplied by the people in the room. It answers the question a director actually asks — how much of my people’s time is being convened by lines that are not mine — exactly, and refuses to guess the moment a sitting has no duration.'),

    periodPicker(ctx, report, now),
    boardPanel(report),

    !report.people.length && report.emptyNote
      ? emptyState({
        title: 'No recorded sitting in this window and this seat',
        body: report.emptyNote,
        action: h('a', { class: 'btn btn-primary', href: '#/cadence' }, 'Open the cadence register'),
      })
      : null,

    peoplePanel(report),
    lineShareParityPanel(report),
    forumPanel(report),
    chairPanel(report),
    refusalPanel(report),

    card({
      title: 'The brief (identity-free)',
      subtitle: 'The paragraph a manager pastes upward. It names no person, no chair, no forum and no sitting.',
      body: h('div', { class: 'stack-sm' },
        h('p', {}, brief),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: 'leados-meeting-load-brief.txt',
              text: `${brief}\n`,
              mime: 'text/plain',
            }),
          }, 'Download brief'),
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: `leados-meeting-load-${report.generatedOn}.csv`,
              text: serializeCsv(
                MATRIX_MEETING_LOAD_CSV_COLUMNS.map((key) => ({ key, header: key })),
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

export default renderMatrixMeetingLoadPanel;
