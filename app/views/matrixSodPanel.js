/**
 * app/views/matrixSodPanel.js — `#/matrix?panel=sod`, the Cross-Line
 * Segregation-of-Duties Register (ADR-0170, Schema v135 unchanged).
 *
 * Six questions a chief could not ask the workspace before, each on its own card:
 *
 *   Board       how many decided calls name two hands that can be tested, how
 *               many carry a conflict, how many of those are irreversible, and
 *               which figures are REFUSED rather than printed.
 *   Pairs       the same two hands counted once per pair, not once per decision.
 *   Conflicts   one row per conflicted decision: the class, how the authorizing
 *               hand reached the initiating one, what the finding rests on, and
 *               the seat that could supply an independent second hand.
 *   Unreadable  decisions whose independence the structure of that day cannot
 *               answer — neither a finding nor a pass.
 *   Refusals    decisions that could not be tested at all, and why.
 *   Spans       the same conflicts rolled up every leadership span that holds
 *               the senior hand today, through every line.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A conflict read from a title, a team name or a body.
 *  - Today's reporting chart applied to a decision made on another day.
 *  - A share below the declared floor, or over a set with an unreadable member.
 *  - Any language that rates a person. A count of recorded roles is a fact about
 *    a control; the panel says so in its own words.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildSodRegister,
  sodFindingText,
  sodRegisterBriefText,
  sodRegisterCsvRows,
  sodSeatText,
} from '../core/domain/sodRegister.js';
import { SOD_CSV_COLUMNS } from '../core/domain/sodRegisterRegistry.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');
const OUTSIDE = 'a person outside this seat';

function boardPanel(report) {
  const b = report.board;
  return h('div', { class: 'stack' },
    b.conflictOneWayN
      ? banner({
        tone: 'bad',
        title: `${b.conflictOneWayN} irreversible decision(s) were ratified without an independent second hand`,
        body: `${b.conflictN} of ${b.testedN} tested decision(s) carry a conflict; ${b.conflictOneWayN} of them are recorded as irreversible. That is a statement about a CONTROL — which calls had one pair of eyes — not about any person: a decision record names who drove a call and who approved it, and this register reads those two names against the reporting graph of the day the call was made.`,
      })
      : b.conflictN
        ? banner({
          tone: 'warn',
          title: `${b.conflictN} reversible decision(s) carry a conflict; no irreversible one does`,
          body: 'A single hand on a call that can be undone is often a deliberate trade of control for speed. It is counted and printed here, and it is not escalated as a gap.',
        })
        : b.testedN
          ? banner({
            tone: 'info',
            title: 'No conflict is established among the tested decisions',
            body: `${b.clearN} decision(s) show two independent hands${b.unreadableN ? `; ${b.unreadableN} cannot be read for independence and are NOT counted as clear` : ''}.`,
          })
          : null,
    b.secondLineN
      ? banner({
        tone: 'warn',
        title: `${b.secondLineN} dependence(s) exist only through a declared second line`,
        body: 'On the decision day the Approver reported to the Driver through a project, product, cross-functional or administrative line and not through the home chain. A check that reads the reporting tree alone passes these decisions.',
      })
      : null,
    h('div', { class: 'row gap' },
      stat({ label: 'Decided decisions', value: num(b.decidedN), hint: `${b.readN} read · ${b.openN} still open and not read` }),
      stat({ label: 'Tested', value: num(b.testedN), hint: 'one Driver and one Approver, both on the roster' }),
      stat({ label: 'Not testable', value: num(b.refusedN), hint: 'a role is empty, plural or not a roster person', tone: b.refusedN ? 'warn' : '' }),
      stat({ label: 'Conflicted', value: num(b.conflictN), hint: `${b.findingsN} finding(s) across the three classes`, tone: b.conflictN ? 'bad' : '' }),
      stat({ label: 'Irreversible and conflicted', value: num(b.conflictOneWayN), hint: `of ${b.testedOneWayN} tested irreversible decision(s)`, tone: b.conflictOneWayN ? 'bad' : '' }),
      stat({ label: 'Independence unreadable', value: num(b.unreadableN), hint: 'neither a finding nor a pass', tone: b.unreadableN ? 'warn' : '' }),
      stat({ label: 'Two independent hands', value: num(b.clearN), hint: 'no class established, chain above the hand closed' }),
    ),
    h('div', { class: 'row gap' },
      stat({ label: 'One hand', value: num(b.sameHandN), hint: 'Driver and Approver are one person' }),
      stat({ label: 'Dependent hand', value: num(b.dependentHandN), hint: `${b.homeChainN} home chain · ${b.secondLineN} second line only` }),
      stat({ label: 'Custodian authorizes', value: num(b.custodyN), hint: `${b.custodyTestedN} tested decision(s) have a typed case link` }),
      stat({ label: 'Presumed findings', value: num(b.presumedBasisN), hint: 'rest on a printed presumption, not a record' }),
      stat({ label: 'No seat above the hand', value: num(b.seatNoneN), hint: 'the hand is the workspace leader', tone: b.seatNoneN ? 'bad' : '' }),
      stat({ label: 'Several seats above', value: num(b.seatTieN), hint: 'a tie the matrix created', tone: b.seatTieN ? 'warn' : '' }),
      stat({ label: 'Outside this seat', value: num(b.outsideSeatN), hint: 'counted, folded into no figure' }),
    ),
    card({
      title: 'The shares, or the reason there is none',
      subtitle: `A share is printed only over at least ${b.rateFloor} tested decisions with no unreadable member. Otherwise the reason is printed instead of a number.`,
      body: h('div', { class: 'stack-sm' },
        h('p', {},
          h('strong', {}, 'Irreversible decisions carrying a conflict: '),
          b.oneWayConflictPermille === null
            ? `REFUSED — ${b.oneWayPermilleRefusedReason}`
            : `${b.oneWayConflictPermille} ‰ — ${b.conflictOneWayN} of ${b.testedOneWayN} tested.`),
        h('p', {},
          h('strong', {}, 'All tested decisions carrying a conflict: '),
          b.conflictPermille === null
            ? `REFUSED — ${b.conflictPermilleRefusedReason}`
            : `${b.conflictPermille} ‰ — ${b.conflictN} of ${b.testedN} tested.`),
      ),
    }),
    card({
      title: 'Do these counts reconcile?',
      subtitle: 'Every identity below is checked on each read. One failed identity makes every figure on this page unverified.',
      body: h('p', { class: 'muted small' },
        `Counts reconcile: ${b.countsReconcile ? 'verified' : 'NOT verified — treat every figure here as unverified and report it'}. `,
        `${b.decidedN} decided = ${b.readN} read + ${b.omittedN} beyond the read cap. `,
        `${b.readN} read = ${b.inSeatN} inside this seat + ${b.outsideSeatN} outside it. `,
        `${b.inSeatN} inside = ${b.testedN} tested + ${b.refusedN} not testable. `,
        `${b.testedN} tested = ${b.conflictN} conflicted + ${b.unreadableN} unreadable + ${b.clearN} two independent hands. `,
        `${b.conflictN} conflicted = ${b.conflictOneWayN} irreversible + ${b.conflictTwoWayN} reversible. `,
        `${b.dependentHandN} dependent = ${b.homeChainN} home chain + ${b.secondLineN} second line only. `,
        `${b.conflictN} conflicted = ${b.seatUniqueN} one seat above + ${b.seatTieN} several + ${b.seatNoneN} none + ${b.seatUnreadableN} not readable. `,
        `A decision can carry two classes, so ${b.findingsN} finding(s) sit on ${b.conflictN} decision(s). `,
        `The structure was read on ${b.structureDaysN} distinct decision day(s).`),
    }),
  );
}

function pairLabel(pair) {
  const driver = pair.driverName || OUTSIDE;
  const approver = pair.approverName || OUTSIDE;
  return pair.sameHand ? `${approver} — both roles` : `${driver} drove · ${approver} approved`;
}

function pairsPanel(report) {
  if (!report.pairs.length) return null;
  const b = report.board;
  return card({
    title: 'The same two hands, counted once',
    subtitle: `One row per Driver/Approver pair with at least one conflict. A count of recorded roles — not a rating of either person.${b.pairsOmittedN ? ` ${b.pairsOmittedN} further pair(s) are past the declared cap and are counted in every total above.` : ''}`,
    body: table({
      caption: 'Conflicted decisions per pair of hands',
      columns: [
        { label: 'Hands', key: 'hands' },
        { label: 'Decisions', key: 'decisions' },
        { label: 'Irreversible', key: 'oneWay' },
        { label: 'Reversible', key: 'twoWay' },
        { label: 'One hand', key: 'same' },
        { label: 'Dependent', key: 'dependent' },
        { label: 'Second line only', key: 'second' },
        { label: 'Custodian', key: 'custody' },
        { label: 'Latest', key: 'last' },
      ],
      rows: report.pairs.map((pair) => ({
        hands: pairLabel(pair),
        decisions: num(pair.decisionsN),
        oneWay: num(pair.oneWayN),
        twoWay: num(pair.twoWayN),
        same: num(pair.sameHandN),
        dependent: num(pair.dependentHandN),
        second: num(pair.secondLineN),
        custody: num(pair.custodyN),
        last: num(pair.lastOn),
      })),
    }),
  });
}

function conflictsPanel(report) {
  if (!report.rows.length) return null;
  const b = report.board;
  return card({
    title: 'Conflicted decisions',
    subtitle: `Irreversible first. Each row states what the finding rests on and which seat could supply an independent second hand on the decision day.${b.rowsOmittedN ? ` ${b.rowsOmittedN} further decision(s) are past the declared cap of ${report.bounds.rows} and are counted in every total above.` : ''}`,
    body: table({
      caption: 'Conflicted decisions in scope',
      columns: [
        { label: 'Decision', key: 'decision' },
        { label: 'Decided', key: 'day' },
        { label: 'Door', key: 'tier' },
        { label: 'Conflict', key: 'conflict' },
        { label: 'Second hand', key: 'seat' },
      ],
      rows: report.rows.map((row) => ({
        decision: row.title,
        day: num(row.decidedOn),
        tier: badge(row.tierLabel, toneFor(row.tierTone)),
        conflict: h('div', { class: 'stack-sm' },
          ...row.classes.map((entry) => h('div', { class: 'stack-tight' },
            h('span', {},
              badge(entry.short, toneFor(entry.tone)),
              ' ',
              badge(entry.basisLabel, entry.basis === 'presumed' ? 'warn' : 'neutral')),
            h('span', { class: 'muted small' }, sodFindingText(row, entry)))),
          row.dependenceUnreadable
            ? h('span', { class: 'muted small' }, 'Whether the Approver also reported to the Driver cannot be read for that day.')
            : null),
        seat: h('div', { class: 'stack-tight' },
          badge(row.seat.label, toneFor(row.seat.tone)),
          h('span', { class: 'muted small' }, sodSeatText(row))),
      })),
    }),
  });
}

function unreadablePanel(report) {
  if (!report.unreadableRows.length) return null;
  const b = report.board;
  return card({
    title: 'Independence the record cannot answer',
    subtitle: `Two different hands, and the structure of the decision day cannot say whether one reported to the other. Not a finding and not a pass.${b.unreadableOmittedN ? ` ${b.unreadableOmittedN} further decision(s) are counted above and not listed.` : ''}`,
    body: table({
      caption: 'Decisions whose independence is not readable',
      columns: [
        { label: 'Decision', key: 'decision' },
        { label: 'Decided', key: 'day' },
        { label: 'Door', key: 'tier' },
        { label: 'Hands', key: 'hands' },
        { label: 'Why it cannot be read', key: 'reason' },
      ],
      rows: report.unreadableRows.map((row) => ({
        decision: row.title,
        day: num(row.decidedOn),
        tier: row.tierLabel,
        hands: `${row.driverName || OUTSIDE} drove · ${row.approverName || OUTSIDE} approved`,
        reason: h('div', { class: 'stack-tight' },
          badge(row.reasonLabel, 'warn'),
          h('span', { class: 'muted small' }, row.reasonDetail)),
      })),
    }),
  });
}

function refusalsPanel(report) {
  const rows = report.recordRefusals.filter((r) => r.n > 0);
  if (!rows.length) return null;
  const b = report.board;
  return card({
    title: 'Decisions that could not be tested',
    subtitle: 'A decision lands in exactly one bucket, checked in this order. Nothing here is a finding: the record does not name two testable hands.',
    body: h('div', { class: 'stack-sm' },
      table({
        caption: 'Record refusals',
        columns: [
          { label: 'Refusal', key: 'label' },
          { label: 'Decisions', key: 'n' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: rows.map((r) => ({
          label: r.label,
          n: num(r.n),
          detail: h('span', { class: 'muted small' }, r.detail),
        })),
      }),
      b.ambiguousNameN
        ? h('p', { class: 'muted small' }, `${b.ambiguousNameN} of these name a hand that two roster people share. The register does not pick one.`)
        : null,
    ),
  });
}

function spansPanel(report) {
  if (!report.spans.length) return null;
  const b = report.board;
  return card({
    title: 'Rolled up the reporting graph',
    subtitle: `Each conflict is carried to every leadership span that holds its senior hand today — through the home line and through every declared second line. The rows are NOT additive: the distinct total is ${b.distinctConflictN}, and ${b.sharedN} of those sit under two or more lines and so appear in more than one branch.${b.spansOmittedN ? ` ${b.spansOmittedN} further span(s) are not listed.` : ''}`,
    body: table({
      caption: 'Conflicted decisions per leadership span',
      columns: [
        { label: 'Span', key: 'span' },
        { label: 'Own decisions', key: 'own' },
        { label: 'Below', key: 'below' },
        { label: 'In span', key: 'total' },
        { label: 'Irreversible', key: 'oneWay' },
        { label: 'Second line only', key: 'second' },
        { label: 'No seat above', key: 'none' },
      ],
      rows: report.spans.map((span) => ({
        span: span.isLeader ? `${span.spanName} (workspace leader)` : span.spanName,
        own: num(span.ownN),
        below: num(span.belowN),
        total: num(span.totalN),
        oneWay: num(span.oneWayN),
        second: num(span.secondLineN),
        none: num(span.noSeatN),
      })),
    }),
  });
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The duties that are read, and from where',
      subtitle: 'Each duty comes from one typed field of the record. None is inferred from a title, a level or a team.',
      body: table({
        caption: 'Declared duties',
        columns: [
          { label: 'Duty', key: 'label' },
          { label: 'Read from', key: 'source' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: report.duties.map((d) => ({
          label: d.label,
          source: d.source,
          detail: h('span', { class: 'muted small' }, d.detail),
        })),
      }),
    }),
    card({
      title: 'The conflict classes',
      subtitle: 'Closed: a tested decision is checked against exactly these three.',
      body: table({
        caption: 'Declared conflict classes',
        columns: [
          { label: 'Class', key: 'label' },
          { label: 'Findings', key: 'n' },
          { label: 'Irreversible', key: 'oneWay' },
          { label: 'Presumed', key: 'presumed' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: report.classes.map((c) => ({
          label: badge(c.label, toneFor(c.tone)),
          n: num(c.n),
          oneWay: num(c.oneWayN),
          presumed: num(c.presumedN),
          detail: h('span', { class: 'muted small' }, c.detail),
        })),
      }),
    }),
    card({
      title: 'Who could supply the second hand',
      subtitle: 'Read for the senior hand of each conflicted decision, on the decision day.',
      body: table({
        caption: 'Seat above the senior hand',
        columns: [
          { label: 'Reading', key: 'label' },
          { label: 'Decisions', key: 'n' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: report.seatStates.map((s) => ({
          label: badge(s.label, toneFor(s.tone)),
          n: num(s.n),
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
      title: 'The method',
      subtitle: 'Named, so it can be argued with.',
      body: table({
        caption: 'Named methods',
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
      title: 'Honest limits',
      subtitle: 'Printed on the page, so the reading cannot be mistaken for an audit of everything a decision involved.',
      body: h('ul', { class: 'muted small' },
        ...report.limitsText.map((text) => h('li', {}, text)),
        report.singleChainNote ? h('li', {}, report.singleChainNote) : null,
        h('li', {}, report.hasLedger
          ? `The structure-history ledger begins on ${report.ledgerCoverageStart}. A home line with recorded history is read from it; one with none is presumed from today’s pointer and labelled so.`
          : 'This workspace has recorded no home-line history, so every home line of a past day is presumed from today’s pointer and every dependence found through one is labelled Presumed.')),
    }),
  );
}

export function renderMatrixSodPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const report = buildSodRegister(state, { now, settings: state.settings || null });
  const brief = sodRegisterBriefText(report);
  const csvRows = sodRegisterCsvRows(report);

  const record = () => {
    const result = ctx?.api?.matrixSodReview?.();
    if (!result?.ok) {
      toast(result?.error || 'The review could not be recorded.', 'bad');
      return;
    }
    toast(result.recorded
      ? 'Review recorded on the automation ledger.'
      : 'Nothing was written: this reading is already on the ledger for today, or there was no decided decision to read.',
    result.recorded ? 'good' : 'neutral');
    ctx.refresh?.();
  };

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'Every decision in the log names a Driver and an Approver. This register reads those two names against each other and against the reporting graph of the day the call was made: one hand holding both roles, an Approver who reported to the Driver — over the home chain or only through a declared second line — and an Approver who owns the case the decision is about. It answers the question a chief owes an audit committee: which calls had one pair of eyes, and who could have been the second.'),

    !report.board.decidedN && report.emptyNote
      ? emptyState({
        title: 'No decided decision on the record',
        body: report.emptyNote,
        action: h('a', { class: 'btn btn-primary', href: '#/decisions' }, 'Open the decision log'),
      })
      : boardPanel(report),

    pairsPanel(report),
    conflictsPanel(report),
    unreadablePanel(report),
    refusalsPanel(report),
    spansPanel(report),

    card({
      title: 'The brief (identity-free)',
      subtitle: 'The paragraph that goes upward. It names no person, no decision and no line.',
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onclick: record }, 'Record this review'),
      ],
      body: h('div', { class: 'stack-sm' },
        h('p', {}, brief),
        h('p', { class: 'muted small' }, 'Recording a review writes one identity-free line with these counts to the automation ledger, once per day per reading. The review itself opens no task, edits no decision and names nobody. It is a saved change like any other, so the workspace’s standing rules run on it as they would on the next save.'),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: 'leados-segregation-of-duties-brief.txt',
              text: `${brief}\n`,
              mime: 'text/plain',
            }),
          }, 'Download brief'),
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: `leados-segregation-of-duties-${report.generatedOn}.csv`,
              text: serializeCsv(SOD_CSV_COLUMNS.map((key) => ({ key, header: key })), csvRows),
              mime: 'text/csv',
            }),
          }, 'Download aggregate CSV'),
        ),
      ),
    }),

    methodPanel(report),
  );
}

export default renderMatrixSodPanel;
