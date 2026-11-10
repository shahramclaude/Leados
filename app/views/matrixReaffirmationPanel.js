/**
 * app/views/matrixReaffirmationPanel.js — `#/matrix?panel=renewal`, the Matrix
 * Line Re-Affirmation Register (ADR-0157, Schema v129).
 *
 * Four sections, four questions no other line screen answers:
 *
 *   Board     how much of these people is still CHARGED to a commitment that no
 *             live answer covers, against how much a live re-affirmed term does
 *             cover — printed as two exact integers that add to the declared
 *             total, never as one reassuring percentage.
 *   Register  one row per declared line: who holds it, at what share, the term
 *             it was given, what both sides said, and the ONE action that moves
 *             it.
 *   Method    what is stored, what is derived, and what this register refuses.
 *   Brief/CSV the identity-free paragraph and the aggregate export.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A lapsed term as renewed. `term-lapsed` is its own word, its own colour, and
 *    it sits beside the share still being charged.
 *  - A release as an ending. The released line stays charged, the row says so,
 *    and the action offered is the governed End, not something this panel does.
 *  - An objection as a resolution. The person's words are on the row and the
 *    disagreement is a finding; nobody's accountability ended because they said so.
 *  - A total over the lines that happen to carry a number. If any line in scope
 *    has no allocation, both share totals are REFUSED with the reason.
 *  - An answer nobody gave: no button here re-affirms a line for a manager, and
 *    none answers for the person.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  LINE_REAFFIRMATION_CSV_COLUMNS,
  LINE_REAFFIRMATION_QUESTIONS,
  LINE_REAFFIRMATION_STATES,
  LINE_REAFFIRMATION_VERDICTS,
} from '../core/domain/lineReaffirmationRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pct = (v) => (v === null || v === undefined ? 'refused' : `${v}%`);

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The re-affirmation action was refused.', 'bad'); return false; }
  toast(message, 'good');
  return true;
}

function toneFor(tone) {
  return tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral';
}

function stateBadge(line) {
  return badge(line.stateLabel, toneFor(line.tone));
}

/* ------------------------------------------------------------------ dialogs */

function reaffirmDialog(ctx, line, conv) {
  const form = buildForm([
    {
      name: 'termEndsOn', label: 'This term runs until (YYYY-MM-DD)', type: 'date', value: '',
      help: `Blank uses the declared convention (${conv.lineReaffirmTermDays} days). A renewal must carry an end date: a term that never ends cannot be told apart from one nobody revisited.`,
    },
    {
      name: 'basis', label: 'What is this line on the hook to deliver? (optional)', type: 'textarea', value: '', rows: 3,
      help: 'Your own words, stored with the answer. Blank prints as “no basis stated”, which is honest; a three-word basis would be worse than none.',
    },
  ]);
  openModal({
    title: `Re-affirm — ${line.personName} → ${line.managerName}`,
    description: `A ${line.kind} line at ${line.shareDisplay}. Re-affirming records that this commitment still holds, at the share the line currently carries, for the term you state.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineReaffirm({
            declarationId: line.declarationId,
            termEndsOn: values.termEndsOn || null,
            basis: values.basis || '',
          });
          if (!notify(result, `Re-affirmed until ${result.termEndsOn}. ${line.personName} is asked to answer it.`)) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Re-affirm the commitment'),
    ],
  });
}

function releaseDialog(ctx, line) {
  const form = buildForm([
    {
      name: 'reason', label: 'Why does this commitment no longer hold?', type: 'textarea', value: '', rows: 3,
      help: 'Required. This does NOT end the line: the declaration still charges the share to the person and every roll-up inherits it. Ending it is the governed End action on the Lines tab, and this register will keep naming the difference until you use it.',
    },
  ]);
  openModal({
    title: `Release — ${line.personName} → ${line.managerName}`,
    description: `Recording that the ${line.kind} line at ${line.shareDisplay} no longer holds. The release is a decision; the charge is a fact until the declaration is dated out.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineRelease({ declarationId: line.declarationId, reason: values.reason || '' });
          if (!notify(result, result.stillCharged
            ? `Released, with your reason. ${result.stillChargedPct}% is STILL charged — date the line out on the Lines tab to make the charge follow the decision.`
            : 'Released, with your reason on the record.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the release'),
    ],
  });
}

/**
 * The objection is the one answer that carries a person's own words onto a
 * record a human will read, so it is asked for in a real field with the one rule
 * that matters printed beside it: objecting does not end the line.
 */
function objectDialog(ctx, line) {
  const form = buildForm([
    {
      name: 'reason', label: 'In your own words, why does this share no longer hold for you?', type: 'textarea', value: '', rows: 3,
      help: 'Required. This is your statement and it is what a human reads. It does NOT end the line: ending somebody else’s accountability is the line manager’s act, so your objection is recorded and escalated rather than quietly removing the share — or quietly ignored.',
    },
  ]);
  openModal({
    title: `Object — ${line.personName} → ${line.managerName}`,
    description: `A ${line.kind} line at ${line.shareDisplay}, re-affirmed by ${line.managerName} on ${line.lastAnsweredOn} until ${line.termEndsOn}.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineReaffirmationObject({
            declarationId: line.declarationId,
            reason: values.reason || '',
          });
          if (!notify(result, 'Objection recorded in your words. Your accountability did not end — it is escalated as a finding.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record my objection'),
    ],
  });
}

function answerDialog(ctx, line) {
  openModal({
    title: `Answer — ${line.personName} → ${line.managerName}`,
    description: `${line.managerName} re-affirmed this ${line.kind} line on ${line.lastAnsweredOn} for a term ending ${line.termEndsOn}. Your answer is the other half of it.`,
    body: h('div', { class: 'stack-tight' },
      h('p', {}, `Share: ${line.shareDisplay}. ${line.reaffirmationBasis ? `Stated basis: “${line.reaffirmationBasis}”.` : 'The line stated no basis for the share.'}`),
      h('p', { class: 'muted small' }, 'Only you can record this. A manager answering on your behalf would be exactly the inherited accountability this register exists to name.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => objectDialog(ctx, line),
      }, 'It no longer holds for me'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.lineReaffirmationAccept({ declarationId: line.declarationId });
          if (!notify(result, 'Accepted. The line now reads as answered by both sides.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'These hours are still mine to give'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function boardPanel(ctx, report) {
  const b = report.board;
  if (!report.isMatrix) {
    return h('div', { class: 'stack' },
      banner({
        tone: 'neutral',
        title: 'Single-chain workspace: nothing to re-affirm',
        body: report.singleChainNote || 'No person in scope reports to more than one manager.',
      }));
  }

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A re-affirmation is not a renewal. It asks whether the commitment still holds, puts the CURRENT share in front of both people it binds, and lets the answer end it. The two figures that matter are printed apart: how much of these people is covered by a live re-affirmed term, and how much is still charged to a commitment nobody has answered today.'),

    h('div', { class: 'stat-grid' },
      stat({ label: 'People on a second line', value: num(b.peopleN), hint: `${b.linesN} declared line(s) in scope` }),
      stat({ label: 'Declared', value: pct(b.declaredShareH), hint: 'shares on the ledger, agreed today or not', tone: b.sharesRefused ? 'warn' : '' }),
      stat({ label: 'Covered by a live term', value: pct(b.reaffirmedShareH), hint: 're-affirmed and inside the term', tone: '' }),
      stat({ label: 'Charged, uncovered', value: pct(b.uncoveredShareH), hint: 'no live answer covers it', tone: (b.uncoveredShareH || 0) > 0 ? 'bad' : '' }),
      stat({ label: 'In term, both answered', value: num(b.inTermN), hint: 'nothing to do on these lines', tone: '' }),
      stat({ label: 'Term lapsed', value: num(b.lapsedN), hint: 'still charged, nobody renewed it', tone: b.lapsedN ? 'bad' : '' }),
      stat({ label: 'Never termed', value: num(b.noTermN), hint: 'inherited every day nobody asked', tone: b.noTermN ? 'warn' : '' }),
      stat({ label: 'Due inside the window', value: num(b.dueN), hint: 'still in term, question open', tone: b.dueN ? 'warn' : '' }),
      stat({ label: 'Awaiting the person', value: num(b.awaitingPersonN), hint: 'one side is not both sides', tone: b.awaitingPersonN ? 'warn' : '' }),
      stat({ label: 'Objected by the person', value: num(b.objectedN), hint: 'still charged; escalated', tone: b.objectedN ? 'bad' : '' }),
      stat({ label: 'Released, still charged', value: num(b.chargedDespiteReleaseN), hint: 'the declaration was never dated out', tone: b.chargedDespiteReleaseN ? 'bad' : '' }),
      stat({ label: 'Re-affirmed a different share', value: num(b.changedN), hint: 'retuned after the answer', tone: b.changedN ? 'bad' : '' }),
      stat({ label: 'Past one whole person', value: num(b.personsOverReaffirmedN), hint: 're-affirmed shares sum above 100%', tone: b.personsOverReaffirmedN ? 'bad' : '' }),
      stat({ label: 'Withheld from this seat', value: num(b.withheldN), hint: 'counted, not shown', tone: '' }),
    ),

    b.sharesRefused
      ? banner({
          tone: 'warn',
          title: 'Share totals are refused',
          body: b.sharesRefusedReason || 'A declared line in scope carries no allocation, so a total would be printed over a part.',
        })
      : null,

    card({
      title: 'The reconciliation',
      subtitle: 'Every figure here is an exact integer count or an integer sum of printed rows. Nothing is rounded, netted or fitted.',
      body: table({
        caption: 'Re-affirmation identities',
        columns: [
          { label: 'Identity', key: 'label' },
          { label: 'Reading', key: 'detail' },
        ],
        rows: [
          {
            label: 'Lines in scope',
            detail: b.countsReconcile
              ? `${b.inTermN} in term + ${b.awaitingPersonN} awaiting the person + ${b.dueN} due + ${b.lapsedN} lapsed + ${b.noTermN} never termed + ${b.changedN} re-affirmed a different share + ${b.objectedN} objected + ${b.releasedN} released = ${b.linesN}`
              : 'THE COUNTS DO NOT ADD UP — do not rely on these totals',
          },
          {
            label: 'The share identity',
            detail: b.sharesRefused
              ? 'refused — see the refusal above'
              : `${b.reaffirmedShareH}% covered by a live re-affirmed term + ${b.uncoveredShareH}% charged with no live answer = ${b.declaredShareH}% declared${(b.reaffirmedShareH || 0) + (b.uncoveredShareH || 0) === (b.declaredShareH || 0) ? '' : ' — THE TWO HALVES DO NOT ADD TO THE WHOLE'}`,
          },
          {
            label: 'People in scope',
            detail: `${b.peopleN} on a second line, ${b.personsInTermN} fully in term, ${b.personsUncoveredN} carrying at least one uncovered share, ${b.personsUndeclaredN} with an undeclared share, ${b.withheldN} withheld.`,
          },
          {
            label: 'Answers dated in the future',
            detail: b.futureAnswerN
              ? `${b.futureAnswerN} answer(s) are dated after today. They are counted here and are NOT read as being in force.`
              : 'none — every stored answer is dated on or before today.',
          },
        ],
      }),
    }),

    card({
      title: 'The reading, in one paragraph',
      subtitle: 'Identity-free, printable, and safe to paste into a leadership note.',
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.lineReaffirmationBriefText?.();
            if (!result?.ok) { toast(result?.error || 'The brief could not be built.', 'bad'); return; }
            openModal({
              title: 'Line re-affirmation — the paragraph',
              description: 'Counts only. No person, no manager, no declaration.',
              body: h('p', {}, result.text),
              footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')],
            });
          },
        }, 'Show the brief'),
        h('button', {
          class: 'btn btn-small btn-ghost', type: 'button',
          onClick: () => {
            const result = ctx.api.lineReaffirmationCsvRows?.();
            if (!result?.ok) { toast(result?.error || 'The export could not be built.', 'bad'); return; }
            downloadText(`line-reaffirmation-${report.generatedOn}.csv`, serializeCsv([...LINE_REAFFIRMATION_CSV_COLUMNS], result.rows));
          },
        }, 'Export CSV'),
      ],
      body: h('p', { class: 'muted small' }, 'Counts of lines and of distinct people, the two share totals, and the reason for every refusal. No person, no manager, no declaration id and no stated reason leaves this screen.'),
    }),
  );
}

function registerPanel(ctx, report) {
  if (!report.persons.length) {
    return emptyState({
      title: 'No declared line in this seat',
      body: 'No person in this seat’s span holds a second reporting line, so no commitment has a term to call back.',
    });
  }

  const rows = [];
  for (const person of report.persons) {
    for (const line of person.lines) {
      const canManagerAct = line.state !== LINE_REAFFIRMATION_STATES.inTerm
        && line.state !== LINE_REAFFIRMATION_STATES.released
        && !(line.state === LINE_REAFFIRMATION_STATES.awaitingPerson && line.termDaysRemaining !== null);
      rows.push({
        person: h('div', { class: 'stack-tight' },
          h('strong', {}, person.personName),
          h('span', { class: 'muted small' }, `home line: ${person.homeManagerName || '—'}`),
          line.shareDeclared ? null : h('span', { class: 'muted small' }, 'allocation undeclared')),
        line: h('div', { class: 'stack-tight' },
          h('span', {}, line.managerName),
          h('span', { class: 'muted small' }, `${line.kind} line${line.fromISO ? ` from ${line.fromISO}` : ''}${line.toISO ? ` to ${line.toISO}` : ''}`)),
        share: pct(line.sharePct),
        term: h('div', { class: 'stack-tight' },
          h('span', {}, line.termEndsOn
            ? `${line.termEndsOn}${line.termDaysRemaining === null ? '' : ` (${line.termDaysRemaining} day(s))`}`
            : 'no term'),
          line.answeredSharePct !== null && line.answeredSharePct !== line.sharePct
            ? h('span', { class: 'muted small' }, `answered at ${line.answeredSharePct}%`)
            : null),
        state: h('div', { class: 'stack-tight' },
          stateBadge(line),
          h('span', { class: 'muted small' }, line.reason)),
        answers: h('div', { class: 'stack-tight' },
          h('span', { class: 'muted small' }, line.lastAnsweredOn
            ? `line: ${line.lastAnsweredOn}${line.answerVia === 'operator' ? ' (scribed)' : ''}`
            : 'line: never answered'),
          h('span', { class: 'muted small' }, line.personAnsweredOn
            ? `person: ${line.personAnsweredOn} — ${line.personOutcome}${line.personAnswerVia === 'operator' ? ' (scribed)' : ''}`
            : 'person: not answered'),
          line.releaseReason ? h('span', { class: 'muted small' }, `released: “${line.releaseReason}”`) : null,
          line.personReason ? h('span', { class: 'muted small' }, `objected: “${line.personReason}”`) : null,
          line.reaffirmationBasis ? h('span', { class: 'muted small' }, `basis: “${line.reaffirmationBasis}”`) : null),
        action: h('div', { class: 'row-actions' },
          canManagerAct
            ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => reaffirmDialog(ctx, line, report.conventions) }, 'Re-affirm')
            : null,
          line.state !== LINE_REAFFIRMATION_STATES.released
            ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => releaseDialog(ctx, line) }, 'Release')
            : null,
          line.state === LINE_REAFFIRMATION_STATES.awaitingPerson || line.state === LINE_REAFFIRMATION_STATES.due
            ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => answerDialog(ctx, line) }, 'Answer as the person')
            : null),
      });
    }
  }

  return h('div', { class: 'stack' },
    report.board.chargedDespiteReleaseN
      ? banner({
          tone: 'bad',
          title: `${report.board.chargedDespiteReleaseN} released line(s) are still charged`,
          body: 'A release is a decision; the declaration is still in force, so the ledger keeps charging the share and every roll-up inherits it. Dating the line out is the governed End action on the Lines tab, and this register names the difference until somebody uses it.',
        })
      : null,
    report.board.objectedN
      ? banner({
          tone: 'bad',
          title: `${report.board.objectedN} objection(s) on the record`,
          body: 'The person whose hours a share is taken from said, in their own words, that it no longer holds. Nobody’s accountability ended because they objected — ending a line is the line manager’s act — so the disagreement is a finding and it is escalated, never quietly resolved.',
        })
      : null,
    card({
      title: 'Every declared line, its term, and what both sides said',
      subtitle: `${report.persons.length} person(s) on a second line, read from ${report.scopeLabel}.`,
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.lineReaffirmationScan?.();
            if (!notify(result, 'Re-affirmation obligations retried. No declaration was changed.')) return;
            ctx.refresh();
          },
        }, 'Retry outstanding asks'),
      ],
      body: table({
        caption: 'Declared lines and their re-affirmation state',
        emptyMessage: 'No declared line is in force in this seat.',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'Line', key: 'line' },
          { label: 'Share', key: 'share' },
          { label: 'Term', key: 'term' },
          { label: 'State', key: 'state' },
          { label: 'Answers', key: 'answers' },
          { label: '', key: 'action' },
        ],
        rows,
      }),
    }),
  );
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The questions this panel answers',
      subtitle: 'Printed so a reader knows what the figures are for.',
      body: h('ul', { class: 'muted small' }, ...LINE_REAFFIRMATION_QUESTIONS.map((q) => h('li', {}, q))),
    }),
    card({
      title: 'What this register does',
      subtitle: 'Printed on every load, from the same registry the rule and the export read.',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `Engine ${report.engineVersion}; conventions: a re-affirmed term runs ${report.conventions.lineReaffirmTermDays} days unless a date is given, the question opens ${report.conventions.lineReaffirmWarnDays} day(s) before the term ends, and a line manager has ${report.conventions.lineReaffirmAskDueDays} day(s) to answer the ask the rule issued.`),
        ...report.method.map((m) => h('div', { class: 'stack-tight' },
          h('strong', {}, m.name),
          h('p', { class: 'muted small' }, m.why))),
      ),
    }),
    card({
      title: 'Seven states, ten verdicts',
      subtitle: 'Declared precedence, so the rule, the panel, the brief and the CSV cannot disagree about a word.',
      body: table({
        caption: 'Declared verdict ladder',
        columns: [
          { label: 'Verdict', key: 'label' },
          { label: 'Opens work', key: 'open' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: LINE_REAFFIRMATION_VERDICTS.map((v) => ({
          label: badge(v.label, toneFor(v.tone)),
          open: v.open ? 'yes' : 'no',
          detail: h('span', { class: 'muted small' }, v.detail),
        })),
      }),
    }),
  );
}

/* -------------------------------------------------------------------- route */

export function renderReaffirmationPanel(ctx) {
  const result = ctx.api.lineReaffirmationBoard?.();
  if (!result?.ok) {
    return banner({ tone: 'bad', title: 'Line re-affirmation is not available', body: result?.error || 'The register could not be built.' });
  }
  const report = result.report;
  return h('div', { class: 'stack' },
    boardPanel(ctx, report),
    report.isMatrix ? registerPanel(ctx, report) : null,
    methodPanel(report),
  );
}

export default renderReaffirmationPanel;
