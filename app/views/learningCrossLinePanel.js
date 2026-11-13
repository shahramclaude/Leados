/**
 * app/views/learningCrossLinePanel.js — `#/learning?panel=cross-line`, the
 * Cross-Line After-Action Corroboration & Lesson-Adoption Parity register
 * (ADR-0188, Schema v149, CSV #141, RULE-AAC-01).
 *
 * THE QUESTION THIS SCREEN ANSWERS: "one line wrote this review — has every
 * other line that carried the event agreed with it, and has every line the
 * lesson touches actually adopted it?"
 *
 * Every figure printed here is a field of the report `aarCorroborationReport`
 * returned. The screen computes nothing: no count, no percentage, no parity
 * verdict. A rendering stores nothing.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 *  - Silence read as agreement. `not asked`, `awaiting`, `overdue` and `expired`
 *    are separate printed rows and none of them counts toward coverage.
 *  - A coverage or parity percentage below the declared disclosure floor; below
 *    it the figure is a dash and the reason is printed.
 *  - A dispute averaged into a "part support", or a refusal rounded into an
 *    "applied" lesson.
 *  - A rewritten review. The lesson's own state is printed BESIDE parity, never
 *    replaced by it.
 *  - A verdict about a person. The four answers describe an account; the parity
 *    states describe an adoption obligation.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { aarCorroborationBriefText, aarCorroborationCsvRows } from '../core/domain/aarCorroboration.js';
import {
  AAR_CORROBORATION_ADR,
  AAR_CORROBORATION_ANSWERS_NOTE,
  AAR_CORROBORATION_CSV_COLUMNS,
  AAR_CORROBORATION_FRAMEWORKS,
  AAR_CORROBORATION_METHOD,
  AAR_CORROBORATION_OUTCOMES,
  AAR_CORROBORATION_RULE_ID,
} from '../core/domain/aarCorroborationRegistry.js';

const DIAGRAM_URL = './app/assets/aar-corroboration-parity.jpg';

const num = (value) => (value === null || value === undefined ? '—' : String(value));
const pct = (value, withheld) => (withheld || value === null || value === undefined ? '—' : `${value}%`);
const claim = (value) => (value ? 'yes' : 'NO');

function notify(ctx, result, message) {
  const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
  if (!result?.ok) { say(result?.error || 'The corroboration action was refused.', 'bad'); return false; }
  say(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

/* --------------------------------------------------------------- dialogs */

function openRequestDialog(ctx, candidate) {
  const holders = (candidate.holders || []).filter((row) => !row.self);
  if (!holders.length) {
    toast('No other line holder is reachable for this review.', 'warn');
    return;
  }
  const form = buildForm([
    {
      name: 'holderId',
      label: 'Which line holder should answer?',
      type: 'select',
      value: holders[0].holderId,
      required: true,
      options: holders.map((row) => ({
        value: row.holderId,
        label: `${row.holderName} — holds ${row.personN} participant${row.personN === 1 ? '' : 's'}${row.kinds.length ? ` (${row.kinds.join(', ')})` : ''}${row.answered ? ' · already answered' : ''}`,
      })),
      help: 'A holder who carries several participants of this review answers once, about the review’s account.',
    },
    {
      name: 'dueOn',
      label: 'Answer due by (required)',
      type: 'date',
      value: '',
      required: true,
      help: 'Choose the date the line should answer by. No deadline is invented for you.',
    },
    {
      name: 'prompt',
      label: 'What should this line check? (optional)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'The review’s own account and every participant’s active line set are frozen onto the request.',
    },
  ]);
  openModal({
    title: `Ask a line to corroborate — ${candidate.subjectLabel}`,
    description: `Held ${candidate.heldOn}. The request snapshots the review’s account, the lesson set and every participant’s complete active line set as of today.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.aarCorroborationRequest?.({
            reviewId: candidate.reviewId,
            holderId: fields.holderId || '',
            dueOn: fields.dueOn || '',
            prompt: fields.prompt || '',
          });
          if (!notify(ctx, result, 'Dated corroboration request recorded.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Issue dated request'),
    ],
  });
}

function openAnswerDialog(ctx, row) {
  const form = buildForm([
    {
      name: 'kind',
      label: 'What are you recording?',
      type: 'select',
      value: 'corroboration',
      options: [
        { value: 'corroboration', label: 'My line’s answer (counts)' },
        { value: 'observation', label: 'A first-hand observation (never counts)' },
      ],
      help: 'An observation is evidence for a reviewer. It is not your line’s answer and it never counts toward coverage.',
    },
    {
      name: 'outcome',
      label: 'Your line’s answer',
      type: 'select',
      value: '',
      required: true,
      options: [{ value: '', label: '— choose one —' }, ...AAR_CORROBORATION_OUTCOMES.map((row2) => ({
        value: row2.key,
        label: `${row2.label} — ${row2.says}`,
      }))],
    },
    {
      name: 'validThrough',
      label: 'Valid through (required for a line answer)',
      type: 'date',
      value: '',
      help: 'Choose an explicit date, from tomorrow through one year. The answer stops counting after it.',
    },
    {
      name: 'note',
      label: 'What your line supports (required for “part supported”)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'At least eight characters when you choose “Part supported”: say which half — the cause or the lesson — you support.',
    },
    {
      name: 'reason',
      label: 'Why you dispute, or why you decline (required for both)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'At least eight characters. A dispute and a decline are reasoned acts, and neither is silence.',
    },
  ]);
  openModal({
    title: `Answer for your line — ${row.subjectLabel}`,
    description: `${row.holderName} · holds ${row.personN} participant${row.personN === 1 ? '' : 's'} of this review. This is only available while operating as the holder named on the request.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.aarCorroborationRespond?.({
            requestId: row.requestId,
            kind: fields.kind || 'corroboration',
            outcome: fields.outcome || '',
            validThrough: fields.validThrough || '',
            note: fields.note || '',
            reason: fields.reason || '',
          });
          if (!notify(ctx, result, 'Your line’s dated answer was recorded.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record answer'),
    ],
  });
}

function openAdoptDialog(ctx, lesson) {
  const form = buildForm([
    {
      name: 'outcome',
      label: 'What is your line recording?',
      type: 'select',
      value: 'adopted',
      required: true,
      options: [
        { value: 'adopted', label: 'Adopted — my line has taken this lesson on' },
        { value: 'refused', label: 'Refused — my line will not adopt it' },
      ],
    },
    {
      name: 'adoptedOn',
      label: 'Dated today or earlier',
      type: 'date',
      value: '',
      help: 'Leave blank to date it today. An adoption is dated; LeadOS does not date a claim for you.',
    },
    {
      name: 'note',
      label: 'What changed, or why not (required)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'At least eight characters. This is your line’s statement about its own accountability — it does not edit the review.',
    },
  ]);
  openModal({
    title: `Record your line’s adoption — ${lesson.subjectLabel}`,
    description: 'This records what YOUR line did with the lesson. The review’s own lesson state is not changed by it.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.aarLessonAdopt?.({
            reviewId: lesson.reviewId,
            lessonId: lesson.lessonId,
            outcome: fields.outcome || 'adopted',
            adoptedOn: fields.adoptedOn || '',
            note: fields.note || '',
          });
          if (!notify(ctx, result, 'Your line’s adoption act was recorded.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record adoption act'),
    ],
  });
}

/* ------------------------------------------------------------------ cards */

function headerCard(report) {
  const t = report.totals;
  return card({
    title: 'One line wrote the review — did every line that carried the event agree?',
    subtitle: `${AAR_CORROBORATION_ADR} · ${report.engineVersion} · read from ${report.seatLabel}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Held reviews', value: num(t.heldReviewsN), hint: `${t.multiLineReviewsN} touch more than one active line` }),
        stat({ label: 'Required line answers', value: num(t.requiredLineAnswersN), hint: `${t.unrequestedN} not asked · ${t.overdueN} overdue` }),
        stat({
          label: 'Corroborated',
          value: num(t.corroboratedTotalN),
          hint: t.coverageWithheld ? 'rate withheld — see the reason below' : `${t.coveragePct}% of required answers`,
          tone: t.disputedN ? 'bad' : t.corroboratedTotalN ? 'good' : '',
        }),
        stat({ label: 'Disputed', value: num(t.disputedN), hint: `${t.declinedN} declined · ${t.partlyN} part supported`, tone: t.disputedN ? 'bad' : '' }),
        stat({ label: 'Lessons under review', value: num(t.lessonsN), hint: `${t.parityCompleteN} parity-complete` }),
        stat({
          label: 'Parity broken by refusal',
          value: num(t.parityBrokenN),
          hint: `open ${t.parityOpenN} · inert ${t.parityInertN} · unattributable ${t.parityUnattributableN}`,
          tone: t.parityBrokenN ? 'bad' : '',
        }),
      ),
      h('p', { class: 'lede' }, t.requiredLineAnswersN
        ? `${t.heldReviewsN} held review(s) produce ${t.requiredLineAnswersN} required line answer(s) across ${t.multiLineReviewsN} review(s) that touch more than one active line. ${t.singleLineExcludedN} review(s) were excluded because every participant sits on one line — a single-line review is that line’s own record, not a cross-line finding.`
        : 'No held review in this workspace touches more than one active line, so the cross-line claim is inert rather than satisfied. Nothing here reads a single line’s account as a matrix result.'),
      h('p', { class: 'muted small' },
        `Six claims, printed apart because they are six different facts. Reviews held — ${claim(report.claims.reviewsHeld)}. A cross-line obligation exists — ${claim(report.claims.crossLineClaim)}. A line recorded a corroboration — ${claim(report.claims.corroborationRecorded)}. Every touched line adopted a lesson — ${claim(report.claims.parityClaimed)}. A line refused an adoption — ${claim(report.claims.adoptionRefused)}. And two more, apart: the figures add up — ${claim(t.countsReconcile)}; every printed figure rests on a complete cell — ${claim(t.figuresComplete)}.`),
      t.coverageWithheld
        ? banner({
          tone: 'warn',
          title: 'The coverage rate is withheld, and this is the reason',
          body: `${t.coverageWithheldReason} A withheld rate is printed as a dash; it is never printed as a zero, because a zero would be a measurement and this is an absence of one.`,
        })
        : null,
      report.detailLevel !== 'full'
        ? banner({ tone: 'info', title: 'Disclosure ladder applied at read time', body: report.detailReason })
        : null,
      h('figure', { class: 'stack' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Diagram: one after-action review fans out to three reporting lines; each line records a dated answer, and one line refuses to adopt the lesson while every touched line must adopt it.',
          class: 'diagram',
          loading: 'lazy',
        }),
        h('figcaption', { class: 'muted small' },
          'A conceptual method diagram for this register, not workspace data. One account fans out to every line that carried the event; adoption is asked of every line the lesson touches.')),
    ),
  });
}

function answersCard(ctx, report) {
  const rows = report.rows || [];
  if (!rows.length) {
    return card({
      title: 'Required line answers',
      body: emptyState({
        title: 'No line owes a corroboration yet',
        body: report.totals.heldReviewsN
          ? 'No held review touches more than one active line. A review written and answered inside one line is that line’s own record.'
          : 'No after-action review has been held. Open one from the Learning queue first; this register only reads reviews that already happened.',
      }),
    });
  }
  return card({
    title: 'Required line answers — one row per line holder',
    subtitle: 'A holder who carries several participants answers once, about the review’s account.',
    body: table({
      caption: 'Required corroboration answers per review and line holder',
      columns: [
        { label: 'Review', render: (row) => h('div', null, h('strong', null, row.subjectLabel), h('div', { class: 'muted small' }, `held ${row.heldOn || '—'}`)) },
        { label: 'Line holder', render: (row) => h('div', null, h('strong', null, row.holderName), h('div', { class: 'muted small' }, `${row.personN} participant${row.personN === 1 ? '' : 's'}${row.lineKinds.length ? ` · ${row.lineKinds.join(', ')}` : ''}`)) },
        { label: 'Asked', render: (row) => (row.requestedOn ? `${row.requestedOn} → due ${row.dueOn}` : '—') },
        { label: 'State', render: (row) => badge(row.stateLabel, row.stateTone, row.reason) },
        { label: 'Why', className: 'wrap', render: (row) => h('div', { class: 'small' }, row.reason) },
        {
          label: 'Action',
          render: (row) => {
            if (row.canRespond) {
              return h('button', {
                class: 'btn btn-small btn-primary', type: 'button',
                'data-testid': `aar-answer-${row.rowKey}`,
                onClick: () => openAnswerDialog(ctx, row),
              }, 'Answer for your line');
            }
            if (row.canRequest) {
              return h('button', {
                class: 'btn btn-small', type: 'button',
                'data-testid': `aar-request-${row.rowKey}`,
                onClick: () => openRequestDialog(ctx, { reviewId: row.reviewId, subjectLabel: row.subjectLabel, heldOn: row.heldOn, holders: [row] }),
              }, 'Ask this line');
            }
            return h('span', { class: 'muted small' }, row.state === 'corroborated' || row.state === 'partly' ? 'answered' : '—');
          },
        },
      ],
      rows,
    }),
  });
}

function lessonsCard(ctx, report) {
  const lessons = report.lessons || [];
  if (!lessons.length) {
    return card({
      title: 'Lesson adoption parity',
      body: emptyState({
        title: 'No lesson under a held review',
        body: 'A review with no lesson has nothing to corroborate and nothing to adopt. The register will not invent one.',
      }),
    });
  }
  return card({
    title: 'Lesson adoption parity — every line the lesson touches',
    subtitle: 'Parity is printed beside the lesson’s own state, never in place of it.',
    body: h('div', { class: 'stack' }, ...lessons.flatMap((lesson) => [
      h('div', { class: 'stack', 'data-testid': `aar-lesson-${lesson.rowKey}` },
        h('div', { class: 'row-actions' },
          badge(lesson.parityLabel, lesson.parityTone, lesson.parityReason),
          badge(`AAR state: ${lesson.aarState || '—'}`, 'neutral', 'The review’s own lesson state. Parity never rewrites it.'),
          badge(`${lesson.touchedLinesN} touched holder${lesson.touchedLinesN === 1 ? '' : 's'}`, 'neutral'),
          lesson.canAdopt
            ? h('button', {
              class: 'btn btn-small', type: 'button',
              'data-testid': `aar-adopt-${lesson.rowKey}`,
              onClick: () => openAdoptDialog(ctx, lesson),
            }, 'Record your line’s adoption')
            : null),
        h('p', null,
          lesson.lessonTextWithheld
            ? h('em', { class: 'muted' }, 'Lesson text withheld at this disclosure level.')
            : (lesson.lessonText || '—')),
        h('p', { class: 'small muted' }, lesson.parityReason),
        table({
          caption: `Adoption parity per touched line holder for ${lesson.subjectLabel}`,
          columns: [
            { label: 'Line holder', render: (row) => row.managerName || '—' },
            { label: 'Basis', render: (row) => (row.managerId ? `${row.basisN} person${row.basisN === 1 ? '' : 's'}${row.kind ? ` · ${row.kind}` : ''}` : '—') },
            { label: 'State', render: (row) => badge(row.stateLabel, row.stateTone, row.note) },
            { label: 'Dated', render: (row) => row.adoptionOn || '—' },
            { label: 'Note', className: 'wrap', render: (row) => h('span', { class: 'small' }, row.note || '—') },
          ],
          rows: lesson.lines,
          emptyMessage: 'No line holder could be resolved for this lesson.',
        }),
      ),
    ])),
  });
}

function candidatesCard(ctx, candidates) {
  if (!candidates || !candidates.length) return null;
  const requestable = candidates.filter((row) => row.ok && (row.requestableN > 0));
  return card({
    title: 'Ask a line to corroborate',
    subtitle: 'Only lines you can reach, and only lines you do not hold yourself.',
    body: requestable.length
      ? h('div', { class: 'stack' }, ...requestable.map((row) => h('div', { class: 'row-actions' },
        h('span', null, h('strong', null, row.subjectLabel), h('span', { class: 'muted small' }, ` · held ${row.heldOn} · ${row.requestableN} line holder(s) can still be asked`)),
        h('button', {
          class: 'btn btn-small', type: 'button',
          'data-testid': `aar-ask-${row.reviewId}`,
          onClick: () => openRequestDialog(ctx, row),
        }, 'Issue a dated request'))))
      : emptyState({
        title: 'Nothing you may ask right now',
        body: 'Every reachable holder already has a live request or a current answer. A duplicate request would inflate the denominator.',
      }),
  });
}

function historyCard(report) {
  const rows = report.historyRows || [];
  if (!rows.length) return null;
  return card({
    title: 'Retained as history',
    subtitle: 'A stale or superseded request is kept and never re-read as current.',
    body: table({
      caption: 'Historical corroboration requests',
      columns: [
        { label: 'Review', render: (row) => row.subjectLabel },
        { label: 'Line holder', render: (row) => row.managerName || '—' },
        { label: 'Asked', render: (row) => `${row.requestedOn} → due ${row.dueOn}` },
        { label: 'State', render: (row) => badge(row.stateLabel, row.stateTone, row.reason) },
        { label: 'Why it is history', className: 'wrap', render: (row) => h('span', { class: 'small' }, row.reason) },
      ],
      rows,
    }),
  });
}

function reconciliationCard(report) {
  const t = report.totals;
  return card({
    title: 'Reconciliation — the parts, added back',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Printed state rows', value: num(t.stateSum), hint: `required line answers ${t.requiredLineAnswersN}` }),
        stat({ label: 'Printed parity rows', value: num(t.paritySum), hint: `lessons under review ${t.lessonsN}` }),
        stat({ label: 'Withheld / truncated rows', value: num((t.hiddenRowsN || 0) + (t.truncatedN || 0)), hint: `${t.shownRowsN} shown of ${t.requiredLineAnswersN}` })),
      h('p', { class: 'small' },
        `The state partition is corroborated ${t.corroboratedN} + part supported ${t.partlyN} + disputed ${t.disputedN} + declined ${t.declinedN} + pending ${t.pendingN} + overdue ${t.overdueN} + not asked ${t.unrequestedN} + stale ${t.staleN} + expired ${t.expiredN} + superseded ${t.supersededN} + historical ${t.historicalN} = ${t.stateSum}, against ${t.requiredLineAnswersN} required answers. `,
        `The parity partition is complete ${t.parityCompleteN} + open ${t.parityOpenN} + broken ${t.parityBrokenN} + inert ${t.parityInertN} + unattributable ${t.parityUnattributableN} = ${t.paritySum}, against ${t.lessonsN} lessons. `,
        `Reviewer observations recorded: ${t.observationsN} — none of them counts as a line’s answer. `,
        `Two claims, apart: the figures add up — ${claim(t.countsReconcile)}; every printed figure rests on a complete cell — ${claim(t.figuresComplete)}.`),
      (t.refusalReasons || []).length
        ? h('div', { class: 'stack' },
          h('h4', null, 'What this read refused, and why'),
          ...t.refusalReasons.map((row) => h('p', { class: 'small' }, h('strong', null, `${row.key} — `), row.says)))
        : h('p', { class: 'small muted' }, 'This read raised no refusal: every figure it printed rests on a complete denominator.'),
    ),
  });
}

function methodCard(report) {
  return card({
    title: 'Method, frameworks and conventions in force',
    body: h('div', { class: 'stack' },
      h('p', { class: 'small' }, h('strong', null, `Unit: ${AAR_CORROBORATION_METHOD.unit}. `), AAR_CORROBORATION_METHOD.definition),
      h('p', { class: 'small muted' }, AAR_CORROBORATION_METHOD.notSaid),
      h('p', { class: 'small' }, h('strong', null, 'Coverage. '), AAR_CORROBORATION_METHOD.coverage),
      h('p', { class: 'small' }, h('strong', null, 'Parity. '), AAR_CORROBORATION_METHOD.parity),
      h('p', { class: 'small muted' }, AAR_CORROBORATION_ANSWERS_NOTE),
      h('h4', null, 'Named frameworks'),
      h('ul', { class: 'small' }, ...AAR_CORROBORATION_FRAMEWORKS.map((row) => h('li', null,
        h('strong', null, `${row.label} — `), row.says))),
      h('h4', null, 'Conventions in force'),
      h('p', { class: 'small' },
        `Escalate an unanswered request ${report.conventions.dueDays} day(s) after its due date · withhold a coverage rate below ${report.conventions.minLines} required answers · escalate an unadopted lesson after ${report.conventions.adoptWarnDays} day(s) · automation ${report.conventions.autoPropagate ? 'on' : 'paused'}.`),
      h('p', { class: 'small muted' }, `Rule ${AAR_CORROBORATION_RULE_ID} runs on the shared post-commit spine. It files asks and closes its own; it never edits a review, an answer, an adoption or a lesson state.`),
    ),
  });
}

/* ------------------------------------------------------------------- view */

export function renderLearningCrossLinePanel(ctx) {
  const result = ctx.api?.aarCorroborationReport?.();
  if (!result?.ok) {
    return card({
      title: 'Cross-line after-action corroboration',
      body: banner({ tone: 'bad', title: 'The corroboration register could not be read', body: result?.error || 'This seat cannot read the corroboration surface.' }),
    });
  }
  const report = result.report;
  const candidates = ctx.api?.aarCorroborationCandidates?.();

  return h('div', { class: 'view-stack' },
    banner({
      tone: 'info',
      title: 'A corroboration is agreement with an account — not approval, consent or a judgement about anyone',
      body: 'Each line records its own dated answer to a review somebody else wrote. The register counts silence as silence, a refusal as a refusal, and an observation as neither. Lesson adoption parity never rewrites the review.',
    }),
    h('div', { class: 'row-actions' },
      h('button', {
        class: 'btn btn-small', type: 'button', 'data-testid': 'aar-csv',
        onClick: async () => {
          const rows = aarCorroborationCsvRows(report);
          const text = serializeCsv(AAR_CORROBORATION_CSV_COLUMNS.map((key) => ({ key, header: key })), rows);
          const saved = downloadText({
            filename: `leados-matrix-aar-corroboration-${report.today}.csv`,
            text,
            mime: 'text/csv;charset=utf-8',
          });
          const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
          if (saved) { say('Aggregate CSV downloaded — the same figures this screen printed.', 'good'); return; }
          try {
            if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
            await globalThis.navigator.clipboard.writeText(text);
            say('The browser refused the download; the aggregate CSV was copied to the clipboard.', 'good');
          } catch {
            say('The browser refused both download and clipboard access. Use the workspace CSV export controls instead.', 'warn');
          }
        },
      }, 'Download aggregate CSV'),
      h('button', {
        class: 'btn btn-small', type: 'button', 'data-testid': 'aar-brief',
        onClick: async () => {
          const text = aarCorroborationBriefText(report);
          const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
          try {
            if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
            await globalThis.navigator.clipboard.writeText(text);
            say('Register brief copied to the clipboard.', 'good');
          } catch {
            say('Clipboard refused; the brief is printed in the register itself.', 'warn');
          }
        },
      }, 'Copy register brief')),
    headerCard(report),
    answersCard(ctx, report),
    lessonsCard(ctx, report),
    candidates?.ok ? candidatesCard(ctx, candidates.candidates) : null,
    historyCard(report),
    reconciliationCard(report),
    methodCard(report),
  );
}

export default renderLearningCrossLinePanel;
