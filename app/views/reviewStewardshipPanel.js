/**
 * app/views/reviewStewardshipPanel.js — `#/reviews?panel=stewardship`, the Matrix
 * Multi-Line Review Stewardship screen (ADR-0147, Schema v122).
 *
 * THREE VIEWS, ONE QUESTION EACH:
 *
 *   Board   "Across every review in this span, which second lines were never
 *            asked — and which packets carry an assessor nobody can name?"
 *   Packet  ONE review: the lines this person sat on in the period side by side
 *            with what each line actually produced, and the two acts that close
 *            the gap (ask a line; answer for your own line).
 *   Method  the states, the verdicts, the conventions, and — printed plainly —
 *            what this screen REFUSES to compute and why.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A per-line "contribution share". The workspace records who evidence is about,
 *    never which line produced it, so the split would be invented. The limit is
 *    printed on the Method panel and beside the Packet's evidence count.
 *  - A zero for an unasked line. It reads `unasked`, which is a fact about the
 *    process, not a claim about the person's contribution.
 *  - A single "complete" badge that collapses four different claims. The verdict
 *    is one line; the counts beside it are printed separately.
 *  - A person rating, ranking or score. Every row is a line and a packet.
 *  - An answer on somebody else's behalf: the answer form is only offered for a
 *    line the acting seat holds.
 */
import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { serializeCsv } from '../core/csv.js';
import {
  REVIEW_STEWARDSHIP_STATE_LABELS,
  REVIEW_STEWARDSHIP_STATE_TONES,
  REVIEW_STEWARDSHIP_STATES,
  REVIEW_STEWARDSHIP_VERDICTS,
} from '../core/domain/reviewStewardshipRegistry.js';
import { REVIEW_STEWARDSHIP_CSV_COLUMNS } from '../core/domain/reviewStewardship.js';
import {
  ASSESSMENT_RECONCILIATION_VERDICTS,
} from '../core/domain/assessmentReconciliationRegistry.js';
import { openStewardshipAskDialog, openStewardshipAnswerDialog } from '../ui/review-stewardship-modals.js';

export const STEWARDSHIP_PANELS = Object.freeze([
  { key: 'board', label: 'Board', hint: 'Every review in this span whose matrix step is not settled, worst first. One row per packet — a person is never counted twice.' },
  { key: 'packet', label: 'Packet', hint: 'One review: the lines the person sat on during the period, what each line produced, and the two acts that close the gap.' },
  { key: 'method', label: 'Method', hint: 'The seven line states, the seven verdicts, the declared conventions — and what this screen refuses to compute.' },
]);

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return STEWARDSHIP_PANELS.some((p) => p.key === key) ? key : 'board';
};

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const toneBadge = (label, tone) => badge(label, tone || 'neutral');

/** The URL for one packet in the stewardship lens. */
export const stewardshipHref = (reviewId) => `#/reviews?panel=packet&review=${encodeURIComponent(reviewId)}`;

function stateCell(line) {
  return h(
    'div',
    { class: 'row-gap' },
    toneBadge(line.lineStateLabel, line.lineStateTone),
    line.request?.overdue && line.request.overdueDays !== null
      ? h('span', { class: 'muted tiny' }, `${line.request.overdueDays}d late`)
      : null,
    line.answer?.late ? h('span', { class: 'muted tiny' }, 'answered late') : null,
  );
}

/* ------------------------------------------------------------------- board */

function boardPanel(ctx, board) {
  if (!board.matrixReviewN) {
    return card({
      body: emptyState({
        title: 'No review covers a person on a second line yet',
        body: 'Every performance review in this workspace is currently single-chain, so there is nothing for this lens to reconcile. That is a different claim from "every line was asked": it means no review here covers a person who sat on more than one reporting line during its period. Declare the second line on the Matrix accountability panel, then prepare or reopen a review for that person.',
        action: h('a', { class: 'btn btn-primary', href: '#/matrix' }, 'Open the Matrix ledger'),
      }),
    });
  }

  const columns = [
    {
      label: 'Person',
      render: (report) => h(
        'div',
        { class: 'stack-sm' },
        h('a', { class: 'link', href: stewardshipHref(report.reviewId) }, report.personName || report.personId),
        h('span', { class: 'muted tiny' }, `${report.periodStart} → ${report.periodEnd} · ${report.status}`),
      ),
    },
    {
      label: 'Verdict',
      render: (report) => h(
        'div',
        { class: 'stack-sm' },
        toneBadge(report.verdictLabel, report.verdictTone),
        h('span', { class: 'muted tiny' }, report.assessorState === 'sole'
          ? `Assessor: ${report.assessors[0]?.managerName || 'nobody named'}`
          : report.assessorState === 'contested'
            ? `${report.assessorState} (${report.assessorIds.length} holders)`
            : 'no declared assessor'),
      ),
    },
    {
      label: 'Lines in period',
      render: (report) => h(
        'div',
        { class: 'stack-sm' },
        h('strong', null, String(report.totals.inPeriodLineN)),
        h('span', { class: 'muted tiny' }, `${report.totals.secondaryInPeriodN} second-line · ${report.totals.settledN} settled`),
      ),
    },
    {
      label: 'Answered / declined',
      render: (report) => h('span', null,
        h('strong', null, String(report.totals.answeredN)),
        h('span', { class: 'muted tiny' }, ` answered · ${report.totals.declinedN} declined`)),
    },
    {
      label: 'Late / unasked',
      render: (report) => h('span', null,
        h('strong', { class: report.totals.overdueN ? 'text-bad' : '' }, String(report.totals.overdueN)),
        h('span', { class: 'muted tiny' }, ` late · ${report.totals.unaskedN} never asked`)),
    },
    {
      label: '',
      render: (report) => h('a', { class: 'btn btn-tiny btn-ghost', href: stewardshipHref(report.reviewId) }, 'Open packet →'),
    },
  ];

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Matrix packets', value: board.matrixReviewN, hint: `${board.singleChainN} single-chain unaffected` }),
      stat({ label: 'Not settled', value: board.openN, hint: 'a matrix step is outstanding', tone: board.openN ? 'warn' : 'good' }),
      stat({ label: 'Lines asked & late', value: board.overdueLinesN, hint: `${board.askedLinesN} still inside the window`, tone: board.overdueLinesN ? 'bad' : '' }),
      stat({ label: 'Lines never asked', value: board.unaskedLinesN, hint: 'no ask recorded in this period', tone: board.unaskedLinesN ? 'caution' : 'good' }),
      stat({ label: 'Contested assessors', value: board.contestedN, hint: `${board.unownedN} with no assessor at all`, tone: board.contestedN || board.unownedN ? 'bad' : 'good' }),
    ),
    banner({
      tone: board.openN ? 'caution' : 'info',
      title: board.openN ? `${board.openN} packet(s) carry an outstanding matrix step` : 'Every matrix packet here is settled',
      body: board.openN
        ? `Settled means every line the person sat on during the period either answered or declined with a stated reason, AND exactly one line holds the performance-assessment right. ${board.contestedN} packet(s) cannot name a sole assessor until that contest is resolved on the Matrix panel.`
        : 'Every line the person sat on during the period is settled and exactly one line holds the assessment right. That is not a claim that the assessments are fair — it means the matrix step is complete.',
    }),
    card({
      title: 'Packets in this span',
      subtitle: board.truncatedN ? `Showing ${board.shown.length} of ${board.reports.length}; ${board.truncatedN} further packet(s) are counted in the figures above but not rendered.` : 'One row per review packet. A person on four lines is one row, never four.',
      actions: [
        h('button', {
          class: 'btn btn-small btn-ghost', type: 'button',
          onClick: () => {
            const rows = board.reports.flatMap((r) => r.lines);
            const csv = serializeCsv(
              REVIEW_STEWARDSHIP_CSV_COLUMNS.map((key) => ({ key, header: key })),
              rows.map((line) => {
                const report = board.reports.find((r) => r.lines.includes(line));
                return {
                  review_id: report.reviewId, person_id: report.personId, person_name: report.personName,
                  period_start: report.periodStart, period_end: report.periodEnd, review_status: report.status,
                  verdict: report.verdict, assessor_state: report.assessorState,
                  assessor_manager_ids: report.assessorIds.join(' '),
                  line_key: line.key, line_role: line.role, line_kind: line.kind,
                  manager_id: line.managerId, manager_name: line.managerName,
                  in_period: line.inPeriod ? 'yes' : 'no', exclusion_reason: line.inPeriod ? '' : line.reason,
                  from_on: line.fromISO, to_on: line.toISO,
                  holds_performance_right: line.holdsPerformanceRight ? 'yes' : 'no',
                  performance_right_presumed: line.performanceRightPresumed ? 'yes' : 'no',
                  line_state: line.lineState, asked_on: line.request?.askedOn || '',
                  asked_by_seat: line.request?.askedBySeatId || '', due_on: line.request?.dueOn || '',
                  overdue: line.request ? (line.request.overdue ? 'yes' : 'no') : '',
                  overdue_days: line.request?.overdueDays ?? '',
                  answered_on: line.answer?.answeredOn || '',
                  answered_by_manager: line.answer?.answeredByManagerId || '',
                  answer_outcome: line.answer?.outcome || '',
                  answer_late: line.answer ? (line.answer.late ? 'yes' : 'no') : '',
                  answer_text: line.answer?.text || '', decline_reason: line.answer?.reason || '',
                  line_attributable: report.attribution.lineAttributable ? 'yes' : 'no',
                };
              }),
            );
            downloadText({
              filename: `leados-review-stewardship-${new Date().toISOString().slice(0, 10)}.csv`,
              text: csv,
              mime: 'text/csv',
            });
            toast(`Exported ${rows.length} review line(s)`, 'good');
          },
        }, 'Export CSV'),
      ],
      body: table({ columns, rows: board.shown }),
    }),
  );
}

/* ------------------------------------------------------------------ packet */

function packetPanel(ctx, board, reviewId) {
  const report = board.reports.find((r) => r.reviewId === reviewId) || null;
  if (!report) {
    return card({
      body: emptyState({
        title: 'Choose a packet from the Board',
        body: 'This lens reconciles a review against the reporting lines the person actually sat on. Open a packet from the Board panel, or prepare a review for someone who carries a second line.',
        action: h('a', { class: 'btn btn-primary', href: '#/reviews?panel=board' }, 'Open the Board'),
      }),
    });
  }
  // The substance reconciliation is the director/VP calibration layer over the
  // stewardship ask/answer state. It is derived from the SAME stored answers
  // the packet already renders, so displaying it cannot drift from them.
  let reconciliation = null;
  try {
    const raw = ctx.api.buildAssessmentReconciliation(report.reviewId);
    if (raw?.ok && raw.reconciliation) reconciliation = raw.reconciliation;
  } catch { /* a broken API returns no reconciliation; the packet still renders */ }

  const canAsk = (line) => line.inPeriod && !line.answer && (!line.request || line.request.overdue);
  const linesColumns = [
    {
      label: 'Line',
      render: (line) => h(
        'div',
        { class: 'stack-sm' },
        h('strong', null, line.managerName),
        h('span', { class: 'muted tiny' }, `${line.role === 'primary' ? 'Home' : 'Second'} · ${line.kind}${line.inPeriod ? '' : ' · outside period'}`),
      ),
    },
    {
      label: 'In force',
      render: (line) => h('div', { class: 'stack-sm' },
        line.inPeriod ? badge('In period', 'good') : badge('Excluded', 'neutral'),
        h('span', { class: 'muted tiny' }, line.inPeriod ? (line.toISO ? `to ${line.toISO}` : 'open') : line.toISO ? `ended ${line.toISO}` : `starts ${line.fromISO}`)),
    },
    {
      label: 'Assessor right',
      render: (line) => line.holdsPerformanceRight
        ? h('div', { class: 'stack-sm' },
            badge('Holds performance', 'good'),
            line.performanceRightPresumed ? h('span', { class: 'muted tiny' }, 'presumed on the home line') : h('span', { class: 'muted tiny' }, 'declared on this line'))
        : h('span', { class: 'muted tiny' }, 'No assessment right'),
    },
    { label: 'State', render: stateCell },
    {
      label: 'Ask',
      render: (line) => line.request
        ? h('div', { class: 'stack-sm' },
            h('span', { class: 'small' }, `asked ${line.request.askedOn}`),
            h('span', { class: 'muted tiny' }, `due ${dash(line.request.dueOn)}`),
            line.request.note ? h('span', { class: 'muted tiny' }, line.request.note) : null)
        : h('span', { class: 'muted tiny' }, 'nobody asked'),
    },
    {
      label: 'What the line said',
      render: (line) => line.answer
        ? h('div', { class: 'stack-sm' },
            h('span', { class: 'small' }, line.answer.outcome === 'declined' ? `Declined: ${line.answer.reason}` : line.answer.text),
            h('span', { class: 'muted tiny' }, `${line.answer.answeredOn}${line.answer.late ? ' · after the window' : ''}`))
        : h('span', { class: 'muted tiny' }, line.lineState === 'unasked'
            ? 'Not asked — this is a gap in the process, not a zero contribution.'
            : 'Waiting'),
    },
    {
      label: '',
      render: (line) => h('div', { class: 'row-gap no-print' },
        canAsk(line)
          ? h('button', {
              class: 'btn btn-tiny btn-ghost', type: 'button',
              onClick: () => openStewardshipAskDialog(ctx, { reviewId: report.reviewId, line }),
            }, line.request ? 'Ask again' : 'Ask this line')
          : null,
        line.request && !line.answer
          ? h('button', {
              class: 'btn btn-tiny btn-primary', type: 'button',
              onClick: () => openStewardshipAnswerDialog(ctx, { reviewId: report.reviewId, line }),
            }, 'Answer as this line')
          : null),
    },
  ];

  return h(
    'div',
    { class: 'stack' },
    h('a', { class: 'back-link', href: '#/reviews?panel=board' }, '← All packets'),
    pageHeader({
      eyebrow: 'Matrix review stewardship',
      title: report.personName || report.personId,
      subtitle: `${report.periodStart} → ${report.periodEnd} · ${report.totals.inPeriodLineN} line(s) in force · ${report.totals.secondaryInPeriodN} second-line`,
      meta: h('div', { class: 'person-meta' },
        toneBadge(report.verdictLabel, report.verdictTone),
        report.assessorState === 'sole'
          ? badge(`Assessor: ${report.assessors[0]?.managerName || 'unnamed'}`, 'neutral')
          : badge(report.assessorState === 'contested' ? `Contested assessor (${report.assessorIds.length})` : 'No assessor', 'bad')),
      actions: [h('a', { class: 'btn btn-small btn-ghost no-print', href: `#/reviews/${encodeURIComponent(report.reviewId)}` }, 'Open the review packet →')],
    }),
    banner({
      tone: report.verdictTone === 'good' ? 'info' : report.verdictTone === 'bad' ? 'bad' : 'caution',
      title: report.verdictLabel,
      body: report.verdictDetail,
    }),
    reconciliation
      ? banner({
          tone: reconciliation.verdictTone === 'good' ? 'info' : reconciliation.verdictTone === 'bad' ? 'bad' : 'caution',
          title: `Calibration: ${reconciliation.verdictLabel}`,
          body: `${reconciliation.verdictDetail}${reconciliation.maxSignalGap !== null ? ` The declared signals on this packet span ${reconciliation.maxSignalGap} step(s) — ${reconciliation.answeredLines.map((l) => `${l.managerName}: ${l.signal || 'no signal'} (${l.chars} chars)`).join(' · ')}.` : ''}${reconciliation.thinN ? ` ${reconciliation.thinN} line(s) wrote < ${reconciliation.conventions.assessmentReconciliationThinChars} chars while another answered line on the same packet wrote well above it.` : ''}`,
        })
      : null,
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Lines in force', value: report.totals.inPeriodLineN, hint: `${report.totals.outOfPeriodN} excluded as outside the period` }),
      stat({ label: 'Answered', value: report.totals.answeredN, hint: `${report.totals.declinedN} declined with a reason`, tone: report.totals.answeredN ? 'good' : '' }),
      stat({ label: 'Asked, late', value: report.totals.overdueN, hint: `${report.totals.askedN} inside the window`, tone: report.totals.overdueN ? 'bad' : '' }),
      stat({ label: 'Never asked', value: report.totals.unaskedN, hint: 'a process gap, not a zero contribution', tone: report.totals.unaskedN ? 'caution' : 'good' }),
      stat({ label: 'Settled', value: `${report.totals.settledN}/${report.totals.accountableN}`, hint: 'answered or declined' }),
    ),
    card({
      title: 'Every line this person sat on',
      subtitle: 'A row is a reporting line, never a fragment of the person. The home line is the roster’s own pointer; a second line is a dated human declaration.',
      body: table({ columns: linesColumns, rows: report.lines }),
    }),
    reconciliation && reconciliation.lines.length
      ? card({
          title: 'Did the lines agree? The substance reconciliation',
          subtitle: 'The ONLY comparison the product makes is of declared coarse signals and of text length. Two paragraphs are never auto-compared for sentiment — a sentence beside a paragraph is flagged as thin, not as uncaring; a declared \"needs support\" against a declared \"strong\" is flagged as divergent, not as a ranking of the line.',
          body: h('div', { class: 'stack' },
            table({
              columns: [
                { label: 'Line', render: (row) => h('div', { class: 'stack-sm' }, h('strong', null, row.managerName), h('span', { class: 'muted tiny' }, `${row.role === 'primary' ? 'Home' : 'Second'} · ${row.kind || '—'}`)) },
                { label: 'State', render: (row) => toneBadge(row.lineStateLabel || row.lineState, row.lineState === 'answered' ? 'good' : row.lineState === 'declined' ? 'neutral' : 'warn') },
                { label: 'Declared signal', render: (row) => row.signal ? h('div', { class: 'stack-sm' }, badge(row.signal, 'neutral'), h('span', { class: 'muted tiny' }, `rank ${row.signalRank}`)) : h('span', { class: 'muted tiny' }, 'No signal — prose only') },
                { label: 'Length', render: (row) => h('div', { class: 'stack-sm' }, h('span', { class: row.thin ? 'text-bad' : '' }, `${row.chars} chars`), row.thin ? badge('Thin', 'bad') : null) },
                { label: 'Words', render: (row) => h('span', { class: 'small' }, row.text ? row.text.slice(0, 180) + (row.text.length > 180 ? '…' : '') : row.reason ? `Declined: ${row.reason}` : '—') },
              ],
              rows: reconciliation.lines,
            }),
            reconciliation.refusals.length
              ? h('ul', { class: 'calibration-list' }, ...reconciliation.refusals.map((refusal) => h('li', { class: 'calibration-item' }, h('div', null, badge(refusal.kind, 'caution'), h('p', { class: 'small' }, refusal.detail)))))
              : null,
            h('p', { class: 'muted tiny' }, `Conventions: thin < ${reconciliation.conventions.assessmentReconciliationThinChars} chars while another line ratio ≥ ${reconciliation.conventions.assessmentReconciliationThinRatio}× · divergence when declared signals differ by ≥ ${reconciliation.conventions.assessmentReconciliationDivergentSteps} steps · divergence ONLY from declared signals, never from prose.`),
          ),
        })
      : null,
    card({
      title: 'What this packet will not tell you',
      subtitle: 'Printed because the alternative is a number that looks like evidence and is not.',
      body: h('p', { class: 'muted small' }, report.attribution.reason),
    }),
    report.refusals.length
      ? card({
          title: 'Counted, excluded or late — each printed',
          subtitle: 'Nothing here is silently dropped, and nothing excluded is counted as evidence.',
          body: h('ul', { class: 'calibration-list' },
            ...report.refusals.map((refusal) => h('li', { class: 'calibration-item' },
              h('div', null, badge(refusal.kind, 'caution'), h('p', { class: 'small' }, refusal.detail))))),
        })
      : null,
    report.orphanRequests.length || report.orphanAnswers.length
      ? card({
          title: 'Asks that no longer resolve',
          subtitle: 'A recorded ask is a promise. If the line was withdrawn and re-declared, the promise is kept here rather than disappearing.',
          body: h('ul', { class: 'small' },
            ...report.orphanRequests.map((r) => h('li', null, `Ask for line ${r.lineKey} on ${r.askedOn}, due ${dash(r.dueOn)}`)),
            ...report.orphanAnswers.map((a) => h('li', null, `Answer for line ${a.lineKey} on ${a.answeredOn}`))),
        })
      : null,
  );
}

/* ------------------------------------------------------------------ method */

/**
 * One row per state in the registry, so the Method panel cannot fall behind the
 * engine. The copy is here; the labels and tones are the registry's.
 */
const STATE_DETAILS = (conv) => [
  { key: REVIEW_STEWARDSHIP_STATES.answered, detail: 'The line holder recorded, in their own words, what that line observed in the period. A first-person dated act; it is the only thing this module counts as line input.' },
  { key: REVIEW_STEWARDSHIP_STATES.declined, detail: 'The line holder recorded that there is nothing to add, and said why. Counted as settled and counted as NOT evidence.' },
  { key: REVIEW_STEWARDSHIP_STATES.asked, detail: `Asked on a stated date with a due date ${conv.reviewStewardshipAnswerDays} days later (a declared convention). Nobody has answered yet; it is not late.` },
  { key: REVIEW_STEWARDSHIP_STATES.overdue, detail: 'The due date has passed with no answer. The overdue days are printed, not rounded away.' },
  { key: REVIEW_STEWARDSHIP_STATES.assessor, detail: 'This line IS the assessor: it holds the performance right and nobody else did. Asking the manager who writes the assessment for input into their own act is not a question, and a skipped line it is not.' },
  { key: REVIEW_STEWARDSHIP_STATES.unasked, detail: 'No ask exists for this line in this period. That is a gap in the process — it says nothing about what the person contributed.' },
  { key: REVIEW_STEWARDSHIP_STATES.excluded, detail: 'The line did not exist inside the review period. Not a gap and not a zero: a claim about a period it was not part of would be false either way.' },
];

function methodPanel(ctx, board) {
  const conv = board.conventions;
  return h(
    'div',
    { class: 'stack' },
    card({
      title: 'The seven states a line can be in',
      subtitle: 'Seven different facts. Collapsing them into "asked" or "not asked" is how a workspace starts lying about its own process.',
      body: table({
        columns: [
          { label: 'State', render: (row) => toneBadge(row.label, row.tone) },
          { label: 'What it means', render: (row) => h('span', { class: 'small' }, row.detail) },
        ],
        rows: STATE_DETAILS(conv).map((row) => ({
          label: REVIEW_STEWARDSHIP_STATE_LABELS[row.key] || row.key,
          tone: REVIEW_STEWARDSHIP_STATE_TONES[row.key] || 'neutral',
          detail: row.detail,
        })),
      }),
    }),
    card({
      title: 'The verdicts and their precedence',
      subtitle: 'Declared once, so the rule, the panel and the CSV cannot disagree about what a word means. Lower severity sorts first on the Board.',
      body: table({
        columns: [
          { label: 'Verdict', render: (v) => toneBadge(v.label, v.tone) },
          { label: 'Open?', render: (v) => h('span', { class: 'small' }, v.open ? 'A matrix step is outstanding' : 'Nothing outstanding') },
          { label: 'When it fires', render: (v) => h('span', { class: 'small' }, v.detail) },
        ],
        rows: REVIEW_STEWARDSHIP_VERDICTS,
      }),
    }),
    card({
      title: 'The declared conventions',
      subtitle: 'Printed so they can be argued with. Clamped on load; neither is fitted from the record.',
      body: h('ul', { class: 'small' },
        h('li', null, `Answer window: ${conv.reviewStewardshipAnswerDays} day(s) from the ask. Bounds 1–60.`),
        h('li', null, `Board-first: ${conv.reviewStewardshipBoardFirst ? 'yes' : 'no'} — whether this panel opens on the aggregate rather than a single packet.`)),
    }),
    card({
      title: 'What this screen refuses to compute, and why',
      subtitle: 'The Bulletproof Reliability Mandate applies hardest where a plausible number would be fabricated.',
      body: h('ul', { class: 'small' },
        h('li', null, h('strong', null, 'A per-line contribution share. '), 'Feedback, recognition, 1:1 notes and delegations record WHO the evidence is about, never WHICH reporting line produced it. Any split derived from them would be a fabricated allocation that every downstream figure inherits. `line_attributable` exports as `no` on every row, with the reason.'),
        h('li', null, h('strong', null, 'A zero for an unasked line. '), 'It reads `unasked`. Treating silence as a zero contribution would turn a process gap into a judgement about a person.'),
        h('li', null, h('strong', null, 'A single assessor when two lines claim the right. '), 'The contest is printed with every holder. Picking one silently is the exact failure the Matrix Leadership Mandate forbids.'),
        h('li', null, h('strong', null, 'An inferred answer. '), 'A line holder answers for their own line or nobody does. A manager answering for another line would fabricate consent to an assessment.'),
        h('li', null, h('strong', null, 'A rating, a score or a ranking. '), 'Every row is a line and a packet. No person is rated, ranked or scored by this module.')),
    }),
    card({
      title: 'The one consequence: RULE-SRV-01',
      subtitle: 'A screen that only prints a gap is a dashboard. Completing a matrix review issues dated, owned work.',
      body: h('ul', { class: 'small' },
        h('li', null, 'It fires ONLY on a completed review or an explicit scan. Declaring a second line is not asking it.'),
        h('li', null, `It issues at most one owned delegation per unasked line per review, addressed to that line's holder, due ${conv.reviewStewardshipAnswerDays} days later. A per-transaction cap of 8 is counted, and an explicit scan retries the remainder.`),
        h('li', null, 'It issues NOTHING when the assessor is contested or undeclared: a task addressed to nobody could never close, so the observation is recorded and the declaration question stays with the leader.'),
        h('li', null, 'It never assesses anybody, never edits a rating, never marks a line answered, and writes typed provenance only — `concerns`, `issues-obligation`, `rolls-up-to` per leadership ancestor in the matrix DAG.')),
    }),
    card({
      title: 'What is stored, and what is derived',
      subtitle: 'The reliability claim is structural, not a promise.',
      body: h('ul', { class: 'small' },
        h('li', null, 'STORED, on the review row so it freezes with the packet at completion: the asks (`stewardship.requests`) and the line holders’ own answers (`stewardship.answers`).'),
        h('li', null, 'DERIVED on every read: every period line, every line state, every overdue flag, the assessor resolution, the verdict and every total. A printed state cannot drift from the declarations and dates it claims to describe.'),
        h('li', null, 'IDEMPOTENT: RULE-SRV-01 keeps a per-review-per-line marker, so a rescan cannot double an obligation.')),
    }),
  );
}

/* ------------------------------------------------------------------- page */

export function renderReviewStewardshipPanel(ctx) {
  const panel = panelFor(ctx.query);
  const reviewId = ctx.query?.get?.('review') || null;
  let board;
  try {
    board = ctx.api.reviewStewardshipBoard();
  } catch (error) {
    return h('div', { class: 'page' }, pageHeader({ title: 'Review stewardship could not be read' }), card({ body: banner({ tone: 'bad', title: 'Read failed', body: String(error?.message || error) }) }));
  }
  if (!board?.ok && board?.error) {
    return h('div', { class: 'page' }, pageHeader({ title: 'Review stewardship is refused to this seat' }), card({ body: banner({ tone: 'warn', title: 'Refused', body: board.error }) }));
  }

  const go = (key) => ctx.navigate(`#/reviews?panel=${encodeURIComponent(key)}`);

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Performance',
      title: 'Every line that assessed this person — or never spoke',
      subtitle: 'A matrix review is not one manager’s act. This lens reconciles each packet against the reporting lines the person actually sat on, names the lines nobody asked, and refuses to invent the contribution share it cannot compute.',
      actions: [h('a', { class: 'btn btn-ghost', href: '#/reviews' }, '← Performance reviews')],
    }),
    tabs({
      items: STEWARDSHIP_PANELS.map((p) => ({ key: p.key, label: p.label, hint: p.hint })),
      active: panel,
      onSelect: go,
      ariaLabel: 'Matrix review stewardship sections',
    }),
    h('p', { class: 'muted small' }, STEWARDSHIP_PANELS.find((p) => p.key === panel)?.hint || ''),
    panel === 'board' ? boardPanel(ctx, board) : null,
    panel === 'packet' ? packetPanel(ctx, board, reviewId) : null,
    panel === 'method' ? methodPanel(ctx, board) : null,
  );
}
