/**
 * app/views/matrixExitPanel.js — `#/matrix?panel=exit`, the Matrix Line-Exit
 * Obligation Register (ADR-0152, Schema v127).
 *
 * Four sections, four questions a live-line view cannot answer:
 *
 *   Board      how many ended lines left how much work open, and who has settled
 *              what — printed as three separate figures, never merged.
 *   Register   one row per ended line, with every obligation it left behind, the
 *              day it was asked, how long it has been open, whether the work it is
 *              about could even have been owed on that line, and the ONE action
 *              that settles it.
 *   Method     what is stored, what is derived, and what this register refuses.
 *   Brief/CSV  the identity-free paragraph and the aggregate export.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - An obligation as settled because a line ended. It reads `open` with the whole
 *    days it has been open printed beside it.
 *  - A retirement the leader did not make. There is no button here that closes an
 *    obligation the person or the line has already answered, and none that retires
 *    the home line's work.
 *  - A carry to anybody. The picker offers only the managers who hold a LIVE line
 *    for that person today, which is exactly the set the action accepts.
 *  - A total that is not the sum of the printed rows. Under a state mismatch the
 *    panel says so in words instead of printing a reassuring number.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  LINE_EXIT_CSV_COLUMNS,
  LINE_EXIT_CONSENT_SCOPE_NOTE,
  LINE_EXIT_HOME_SCOPE_NOTE,
  LINE_EXIT_LIMITS_TEXT,
  LINE_EXIT_QUESTIONS,
  LINE_EXIT_SOURCES,
  LINE_EXIT_STATES,
  LINE_EXIT_STATE_LABELS,
  LINE_EXIT_WINDOWS,
  LINE_EXIT_WINDOW_LABELS,
} from '../core/domain/lineExitRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The remedy was refused.', 'bad'); return false; }
  toast(message, 'good');
  return true;
}

function toneFor(tone) {
  return tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral';
}

function windowBadge(row) {
  const tone = row.windowVerdict === LINE_EXIT_WINDOWS.after
    ? 'warn'
    : row.windowVerdict === LINE_EXIT_WINDOWS.unknown ? 'neutral' : 'good';
  return badge(row.windowLabel, tone);
}

function stateBadge(row) {
  return badge(row.stateLabel, toneFor(row.stateTone));
}

/* ------------------------------------------------------------------ dialogs */

function retireDialog(ctx, line, obligation) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Why is nothing owed on this obligation?',
      type: 'textarea',
      value: '',
      rows: 3,
      help: 'Required, and final: a retired obligation is closed by your words and the original ask stays readable beside them. If the work was genuinely owed, carry it instead.',
    },
  ]);
  openModal({
    title: `Retire — ${obligation.sourceLabel} for ${line.personName}`,
    description: `Asked ${obligation.askedOn} on ${line.managerName}’s ${line.kind} line, which ended ${line.endedOn}. ${obligation.windowLabel}.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineExitRemedy({
            obligationKey: obligation.key,
            outcome: 'retire',
            reason: values.reason || '',
          });
          if (!notify(result, 'Retired, with your reason on the record.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Retire the obligation'),
    ],
  });
}

function carryDialog(ctx, line, obligation) {
  const candidates = Array.isArray(line.carryCandidates) ? line.carryCandidates : [];
  if (!candidates.length) {
    toast('Nobody holds a live line for this person, so there is no manager this obligation could honestly be carried to. Retire it or re-declare the structure first.', 'bad');
    return;
  }
  const form = buildForm([
    {
      name: 'carryToManagerId',
      label: 'Who now owes it?',
      type: 'select',
      value: candidates[0].id,
      options: candidates.map((c) => ({
        value: c.id,
        label: `${c.name} — ${c.role === 'primary' ? 'home line' : 'line in force'} today`,
      })),
      help: 'Only managers who hold a LIVE line for this person (or their home line) are offered. Carrying work to anybody else would be an accountability nobody accepted, and the action refuses it.',
    },
    {
      name: 'reason',
      label: 'Why does this obligation survive the line?',
      type: 'textarea',
      value: '',
      rows: 3,
      help: 'Required. The ask keeps its original words and addressee; this records that it is still owed and who owes it now.',
    },
  ]);
  openModal({
    title: `Carry — ${obligation.sourceLabel} for ${line.personName}`,
    description: `Asked ${obligation.askedOn} on ${line.managerName}’s ${line.kind} line, which ended ${line.endedOn}.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineExitRemedy({
            obligationKey: obligation.key,
            outcome: 'carry',
            carryToManagerId: values.carryToManagerId,
            reason: values.reason || '',
          });
          if (!notify(result, 'Carried, with the named manager and your reason on the record.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Carry the obligation'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function boardPanel(ctx, report) {
  const b = report.board;
  return h('div', { class: 'stack' },
    card({
      title: 'What the ended lines left behind',
      subtitle: 'Three figures, printed apart: still open, retired with a reason, carried to a named manager.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Ended lines', value: num(b.endedLinesN), hint: 'dated out before today', tone: b.endedLinesN ? 'warn' : '' }),
          stat({ label: 'Obligations left', value: num(b.obligationsN), hint: 'asks the register can prove' }),
          stat({ label: 'Open, no remedy', value: num(b.openN), hint: 'still owed by somebody, or void and unrecorded', tone: b.openN ? 'bad' : 'good' }),
          stat({ label: 'Retired with a reason', value: num(b.retiredN), hint: 'a human said nothing was owed', tone: 'good' }),
          stat({ label: 'Carried to a manager', value: num(b.carriedN), hint: 'still owed, now attributed' }),
          stat({ label: 'Past their due day', value: num(b.overdueN), hint: 'open and late', tone: b.overdueN ? 'bad' : '' }),
          stat({ label: 'Outside the line’s life', value: num(b.afterWindowN), hint: 'flagged for retirement, never retired automatically', tone: b.afterWindowN ? 'warn' : '' }),
          stat({ label: 'No dated window', value: num(b.unknownWindowN), hint: 'cannot tell, not assumed' }),
          stat({ label: 'Oldest open', value: b.maxDaysOpen ? `${b.maxDaysOpen}d` : '—', hint: 'whole days since it was asked' }),
          stat({ label: 'People affected', value: num(b.personsN), hint: 'distinct people, never line-people' }),
        ),
        b.stateSum === b.obligationsN
          ? h('p', { class: 'muted small' }, `${b.openN} open + ${b.retiredN} retired + ${b.carriedN} carried = ${b.obligationsN} printed obligation(s).`)
          : banner({ tone: 'bad', title: 'The state counts do not reconcile', body: 'The state counts are not the sum of the printed rows. Treat every figure on this panel as unverified and report it.' }),
        h('div', { class: 'stack-tight' },
          ...report.states.map((state) => h('p', { class: 'muted small' }, `${state.label}: ${state.n}.`))),
      ),
    }),

    b.homeScopedN
      ? banner({ tone: 'neutral', title: 'Home-line obligations are handed over, not adjudicated', body: `${b.homeScopedN} open obligation(s) are addressed to a HOME line; ${b.homeMovedN} of them were asked before a recorded home-line move. ${LINE_EXIT_HOME_SCOPE_NOTE}` })
      : null,

    banner({ tone: 'neutral', title: 'One source family is deliberately not read', body: LINE_EXIT_CONSENT_SCOPE_NOTE }),

    card({
      title: 'Where the obligations come from',
      subtitle: 'Only records that carry the LINE KEY they were addressed to. No inference, no join by guesswork.',
      body: table({
        caption: 'Obligation sources',
        columns: [
          { label: 'Source', key: 'label' },
          { label: 'Obligations', key: 'n' },
          { label: 'Open', key: 'open' },
          { label: 'What it is', key: 'detail' },
        ],
        rows: LINE_EXIT_SOURCES.map((source) => {
          const row = (b.bySource || []).find((entry) => entry.key === source.key) || { n: 0, openN: 0 };
          return { label: source.label, n: row.n, open: row.openN, detail: h('span', { class: 'muted small' }, source.detail) };
        }),
      }),
    }),
  );
}

function registerPanel(ctx, report) {
  if (!report.lines.length) {
    return emptyState({
      title: 'No ended reporting line',
      body: 'No declared line has been dated out in this workspace, so no obligation has been left behind one. This register is inert here.',
    });
  }
  return h('div', { class: 'stack' },
    card({
      title: 'The register',
      subtitle: 'One row per ended line. Every figure is recomputed from the stored asks and the dated declarations on each read.',
      body: table({
        caption: 'Ended lines and the obligations they left',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'Line', key: 'line' },
          { label: 'Ended', key: 'ended' },
          { label: 'Verdict', key: 'verdict' },
          { label: 'Obligations', key: 'obligations' },
        ],
        rows: (report.renderedLines || []).map((line) => ({
          person: h('div', { class: 'stack-tight' },
            h('strong', {}, line.personName),
            h('span', { class: 'muted small' }, `was accountable to ${line.managerName}`)),
          line: h('div', { class: 'stack-tight' },
            h('span', {}, `${line.kind || 'undeclared'} line`),
            h('span', { class: 'muted small' }, line.fromISO ? `in force ${line.fromISO} → ${line.endedOn || 'unrecorded'}` : 'no declared window')),
          ended: h('div', { class: 'stack-tight' },
            h('span', {}, line.endedOn || 'unrecorded'),
            h('span', { class: 'muted small' }, line.daysSinceEnd === null ? 'day count withheld' : `${line.daysSinceEnd} day(s) ago`)),
          verdict: h('div', { class: 'stack-tight' },
            badge(line.verdictLabel, toneFor(line.verdictTone)),
            line.unverifiableReason ? h('span', { class: 'muted small' }, line.unverifiableReason) : null),
          obligations: h('div', { class: 'stack' },
            line.obligations.length
              ? h('div', { class: 'stack-tight' }, ...line.obligations.map((row) => h('div', { class: 'card card-tight' },
                h('div', { class: 'row-actions' },
                  h('strong', {}, row.sourceLabel),
                  stateBadge(row),
                  windowBadge(row)),
                h('p', { class: 'muted small' },
                  `Asked ${row.askedOn} · ${row.daysOpen === null ? 'age withheld' : `${row.daysOpen} day(s) open`}${row.overdue ? ` · ${row.overdueDays} day(s) past its due day` : ''}`),
                h('p', { class: 'muted small' }, `${row.workWindowLabel}. ${row.windowLabel}.`),
                row.remedy
                  ? h('p', { class: 'muted small' },
                    `${row.remedy.outcome === 'retire' ? 'Retired' : `Carried to ${row.remedy.carryToManagerName}`} on ${row.remedy.decidedOn} — “${row.remedy.reason}”${row.remedy.reviewOn ? ` · review ${row.remedy.reviewOn}` : ''}`)
                  : h('div', { class: 'row-actions' },
                    h('button', {
                      class: 'btn btn-small', type: 'button',
                      onClick: () => retireDialog(ctx, line, row),
                    }, 'Retire with a reason'),
                    h('button', {
                      class: 'btn btn-small btn-ghost', type: 'button',
                      onClick: () => carryDialog(ctx, line, row),
                    }, 'Carry to a named manager')),
              )))
              : h('span', { class: 'muted small' }, 'Nothing open on this line.'),
            line.counts.obligationsN
              ? h('span', { class: 'muted small' },
                `${line.counts.openN} open · ${line.counts.retiredN} retired · ${line.counts.carriedN} carried · ${line.counts.afterWindowN} outside the line’s life`)
              : null),
        })),
      }),
    }),
    report.board.withheldLines
      ? banner({ tone: 'neutral', title: 'The board is capped', body: `${report.board.withheldLines} further ended line(s) are counted in every total above and not listed.` })
      : null,
  );
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The questions this panel answers',
      subtitle: 'Printed so a reader knows what the figures are for.',
      body: h('ul', { class: 'muted small' }, ...LINE_EXIT_QUESTIONS.map((q) => h('li', {}, q))),
    }),
    card({
      title: 'Frameworks applied',
      subtitle: 'Named, not paraphrased.',
      body: h('ul', { class: 'stack-tight' },
        ...report.method.map((entry) => h('li', {},
          h('strong', {}, entry.name),
          h('p', { class: 'muted small' }, entry.why)))),
    }),
    card({
      title: 'Three states, five line verdicts',
      subtitle: 'Declared precedence, so the rule, the panel and the CSV cannot disagree about a word.',
      body: h('ul', { class: 'muted small' },
        h('li', {}, `Obligation states: ${LINE_EXIT_STATES.open} — ${LINE_EXIT_STATE_LABELS.open}; ${LINE_EXIT_STATES.retired} — ${LINE_EXIT_STATE_LABELS.retired}; ${LINE_EXIT_STATES.carried} — ${LINE_EXIT_STATE_LABELS.carried}.`),
        h('li', {}, `Window verdicts: ${LINE_EXIT_WINDOW_LABELS[LINE_EXIT_WINDOWS.overlaps]}; ${LINE_EXIT_WINDOW_LABELS[LINE_EXIT_WINDOWS.after]}; ${LINE_EXIT_WINDOW_LABELS[LINE_EXIT_WINDOWS.unknown]}.`)),
    }),
    card({
      title: 'Stored, derived and refused',
      subtitle: 'Nothing derived is stored, so a printed figure has no second copy to drift from.',
      body: h('ul', { class: 'stack-tight' },
        h('li', {}, `Stored: one row per dated remedy — the obligation, the line, the person, the outcome (retire or carry), the stated reason, the manager a carry names, the day and the seat.`),
        h('li', {}, `Derived on every read: every obligation, state, window verdict, day count, line verdict and workspace total.`),
        h('li', {}, `Convention: ${report.conventionsText}`),
        h('li', {}, `Sources read: ${LINE_EXIT_SOURCES.map((s) => s.label).join(', ')}.`)),
    }),
    card({
      title: 'Honest limits',
      subtitle: 'Printed on the page, so the reading cannot be mistaken for closure.',
      body: h('ul', { class: 'muted small' }, ...LINE_EXIT_LIMITS_TEXT.map((text) => h('li', {}, text))),
    }),
  );
}

function briefPanel(ctx, report) {
  return card({
    title: 'The reading, in one paragraph',
    subtitle: 'Identity-free, printable, and safe to paste into a leadership note.',
    actions: [
      h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => {
          const result = ctx.api.lineExitBriefText?.();
          if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
          downloadText({ filename: `leados-line-exit-brief-${new Date().toISOString().slice(0, 10)}.md`, text: result.text });
        },
      }, 'Download brief'),
      h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => {
          const result = ctx.api.lineExitCsvRows?.();
          if (!result?.ok) { toast(result?.error || 'The export was refused.', 'bad'); return; }
          downloadText({
            filename: `leados-line-exit-${new Date().toISOString().slice(0, 10)}.csv`,
            text: serializeCsv(LINE_EXIT_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
          });
        },
      }, 'Download CSV'),
      h('button', {
        class: 'btn btn-small btn-ghost', type: 'button',
        onClick: () => {
          const result = ctx.api.lineExitScan?.();
          if (!notify(result, 'Scanned. Any deferred settlement ask was retried.')) return;
          ctx.refresh();
        },
      }, 'Re-scan'),
    ],
    body: h('p', { class: 'muted' }, ctx.api.lineExitBriefText?.()?.text || 'The brief is unavailable.'),
  });
}

/* -------------------------------------------------------------------- route */

export function renderLineExitPanel(ctx) {
  const result = ctx.api.lineExitBoard?.();
  if (!result?.ok) {
    return banner({ tone: 'bad', title: 'The line-exit register is not available', body: result?.error || 'The register could not be built.' });
  }
  const report = result.report;
  if (!report.isMatrix) {
    return h('div', { class: 'stack' },
      banner({ tone: 'neutral', title: 'Single-chain workspace: nothing has ended', body: report.singleChainNote }),
      methodPanel(report));
  }
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A line that is dated out does not close the work it created. This panel reads every open obligation an ended line left behind — whose words it is, whether the work it is about could even have been owed there, and who has settled it.'),
    report.verdict !== 'clear' ? badge(report.verdictLabel, toneFor(report.verdictTone)) : null,
    ...report.refusals.map((refusal) => banner({
      tone: refusal.key === 'state-mismatch' || refusal.key === 'vanished-lines' ? 'bad' : 'warn',
      title: refusal.key === 'state-mismatch' ? 'The counts do not reconcile' : 'Printed limit',
      body: refusal.text,
    })),
    boardPanel(ctx, report),
    registerPanel(ctx, report),
    briefPanel(ctx, report),
    methodPanel(report),
  );
}

export default renderLineExitPanel;
