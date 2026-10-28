/**
 * app/views/learning.js — the After-Action Review & Learning Ledger
 * (`#/learning`, Schema v43).
 *
 * Four tabs in the order a leader has to argue with them:
 *
 *   Queue       → what has ended and has not been reviewed, with its age and the
 *                 evidence the record already holds. This is the work.
 *   Ledger      → held reviews, their four answers, and the changes they
 *                 committed with their state. Nothing here is an intention.
 *   Recurrence  → the classes that keep coming back, and — the point of the
 *                 module — whether the change committed the first time was ever
 *                 made. Distinct events only.
 *   Coverage    → the denominators: what was reviewable, what was reviewed,
 *                 what was skipped and why, how long it took, and the
 *                 conventions that decide all of it.
 *
 * Nothing here scores a person. A lesson names a system, a decision or a
 * practice, and the UI says so on every tab that shows one.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, tabs, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { progressBar } from '../ui/charts.js';
import {
  AAR_BANDS,
  AAR_QUESTIONS,
  AAR_QUESTION_BY_KEY,
  CHANGE_TYPES,
  LESSON_CLASSES,
  LESSON_STATE_LABELS,
  RETRO_STATUS_LABELS,
  buildLearningReport,
  changeTypeLabel,
  learningBrief,
  learningSignals,
  assessLessonEvidence,
  lessonClassLabel,
  subjectEvidence,
  subjectTypeSpec,
} from '../core/domain/learning.js';
import {
  openAdHocRetroDialog,
  openAnnotateRetroDialog,
  openLearningConventionsDialog,
  openLessonDialog,
  openLessonEvidenceDialog,
  openLessonStateDialog,
  openRetroDialog,
  openSkipRetroDialog,
  openStartRetroDialog,
} from '../ui/learning-modals.js';
import { humanDays } from '../core/time.js';

const TABS = [
  { key: 'queue', label: 'Queue' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'recurrence', label: 'Recurrence' },
  { key: 'coverage', label: 'Coverage' },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

function pct(value) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function stateBadge(lesson) {
  if (lesson.state === 'applied') return badge('Applied', 'good', `Applied ${lesson.appliedOn || ''}`);
  if (lesson.state === 'dropped') return badge('Dropped', 'neutral', lesson.droppedReason || '');
  if (lesson.state === 'observation') return badge('Observation', 'info', 'No change was committed, so this is not counted as learning');
  return badge('Change committed', 'warn', `Committed ${lesson.committedOn || ''}`);
}

function propagationToast(message, res) {
  const n = Array.isArray(res?.propagations) ? res.propagations.length : 0;
  toast(n ? `${message} ${n} follow-up${n === 1 ? '' : 's'} opened automatically.` : message, 'good');
}

/* ------------------------------------------------------------------ queue */

function queueTab(ctx, report) {
  const body = [];
  if (!report.queue.length) {
    body.push(emptyState({
      icon: '⟲',
      title: report.closures.dated ? 'Every dated closure in the window has been reviewed' : 'Nothing has ended yet',
      body: report.closures.dated
        ? `All ${report.closures.dated} closure(s) in the ${report.settings.windowDays}-day window carry a review or a dated skip. The next closure will appear here the moment it lands.`
        : 'When a case resolves, a change anchors, a decision is reviewed or a delegation completes, it appears here with the intention and outcome already read from the record.',
    }));
  }

  if (report.queue.length) {
    const rows = report.queue.map((row) => {
      const retro = row.retroId ? (report.retros || []).find((r) => r.id === row.retroId) : null;
      return {
        ...row,
        retro,
        render: null,
      };
    });
    body.push(card({
      title: `${report.queue.length} closure${report.queue.length === 1 ? '' : 's'} awaiting a review`,
      subtitle: `A review is four questions. The first two arrive pre-filled from the frozen record, so the answer cannot be rewritten with hindsight. Convention: within ${report.settings.dueDays} days of the close.`,
      body: table({
        caption: 'Closed work awaiting an after-action review',
        columns: [
          {
            label: 'What ended',
            render: (row) => h('div', { class: 'view-stack', style: 'gap:2px' },
              row.route ? h('a', { href: row.route }, row.label) : row.label,
              h('span', { class: 'small muted' }, row.typeLabel)),
          },
          { label: 'Closed', render: (row) => h('div', { class: 'view-stack', style: 'gap:2px' }, row.outcomeOn, h('span', { class: 'small muted' }, row.dateBasis)) },
          {
            label: 'Waiting',
            render: (row) => h('div', { class: 'badge-row' },
              badge(humanDays(row.waitingDays), row.due ? 'bad' : 'neutral'),
              row.due ? badge(`${row.overdueDays}d late`, 'warn') : null,
              row.autoDrafted ? badge('Draft ready', 'info') : null),
          },
          {
            label: 'Review',
            render: (row) => h('div', { class: 'row-actions' },
              row.retroId
                ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openRetroDialog(ctx, { retro: row.retro, mode: 'hold' }) }, 'Finish review')
                : h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStartRetroDialog(ctx, { row }) }, 'Start review'),
              row.retroId
                ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openRetroDialog(ctx, { retro: row.retro, mode: 'draft' }) }, 'Edit draft')
                : null,
              row.retroId
                ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openSkipRetroDialog(ctx, { retro: row.retro }) }, 'Skip')
                : h('button', {
                    class: 'btn btn-ghost',
                    type: 'button',
                    onClick: () => {
                      const result = ctx.api.skipRetro
                        ? ctx.api.startRetro({ subjectType: row.subjectType, subjectId: row.subjectId, outcomeOn: row.outcomeOn })
                        : null;
                      if (!result || !result.ok) {
                        toast(result?.error || 'That review could not be opened.', 'warn');
                        return;
                      }
                      const created = (ctx.state.retros || []).find((r) => r.id === result.id);
                      if (created) openSkipRetroDialog(ctx, { retro: created });
                    },
                  }, 'Skip')),
          },
        ],
        rows,
        emptyMessage: 'Nothing is waiting for a review.',
      }),
    }));
  }

  const drafts = (report.retros || []).filter((retro) => retro.status === 'draft' && !retro.subjectId);
  if (drafts.length) {
    body.push(card({
      title: `${drafts.length} detached review${drafts.length === 1 ? '' : 's'}`,
      subtitle: 'A review of an event that is not a record in this workspace, or of a record that has since been deleted. Its own text is still evidence; open it to finish it.',
      body: h('div', { class: 'view-stack' }, ...drafts.map((retro) => h('div', { class: 'row-between' },
        h('span', null, `${retro.subjectLabel} · closed ${retro.outcomeOn || 'undated'}`),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openRetroDialog(ctx, { retro, mode: 'hold' }) }, 'Finish review')))),
    }));
  }

  body.push(card({
    title: 'Review something the workspace does not hold',
    subtitle: 'A team offsite, a failed experiment, a competitor move, a hard week. The four questions work on any event; only the pre-fill is missing.',
    body: h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAdHocRetroDialog(ctx) }, 'Open a review'),
      h('a', { class: 'btn btn-ghost', href: '#/learning?tab=coverage' }, 'See what is measured')),
  }));
  return body;
}

/* ------------------------------------------------------------------ ledger */

function lessonRow(ctx, retro, lesson) {
  const evidence = assessLessonEvidence(ctx.state, retro, lesson);
  return h('div', { class: 'view-stack', style: 'gap:4px' },
    h('div', { class: 'badge-row' },
      badge(lessonClassLabel(lesson.class), 'info'),
      stateBadge(lesson),
      lesson.changeType !== 'none' ? badge(changeTypeLabel(lesson.changeType), 'neutral') : null,
      lesson.state === 'applied' ? badge(evidence.status === 'record-corroborated'
        ? `Record-corroborated · ${evidence.corroborated}` : evidence.status === 'stale'
          ? `Stale artifact · ${evidence.stale}` : 'No linked artifact',
      evidence.status === 'record-corroborated' ? 'good' : evidence.status === 'stale' ? 'warn' : 'neutral') : null),
    h('p', { class: 'small' }, lesson.text),
    lesson.changeNote ? h('p', { class: 'small muted' }, `Change: ${lesson.changeNote}`) : null,
    lesson.appliedNote ? h('p', { class: 'small' }, h('strong', null, `Applied ${lesson.appliedOn}: `), lesson.appliedNote) : null,
    evidence.items.length ? h('ul', { class: 'prep-list' }, ...evidence.items.map((item) => h('li', { class: 'small' },
      h('strong', null, `${item.status === 'record-corroborated' ? 'Corroborated record' : 'Stale record'} · ${item.currentEvidenceOn || item.evidenceOn} · `),
      item.currentTitle || item.sourceTitle, ` — ${item.note}`,
      item.staleReason ? h('span', { class: 'muted' }, ` ${item.staleReason}`) : null))) : null,
    lesson.droppedReason ? h('p', { class: 'small muted' }, `Dropped ${lesson.droppedOn}: ${lesson.droppedReason}`) : null,
    h('div', { class: 'row-actions' },
      lesson.changeType !== 'none'
        ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openLessonStateDialog(ctx, { retro, lesson }) },
            lesson.state === 'open' ? 'Close or drop' : 'Change the state')
        : null,
      lesson.state === 'applied' && evidence.items.length < 5
        ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openLessonEvidenceDialog(ctx, { retro, lesson }) }, 'Attach record')
        : null));
}

function retroCard(ctx, report, retro) {
  const evidence = retro.subjectId ? subjectEvidence(ctx.state, retro.subjectType, retro.subjectId) : null;
  const actions = [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openAnnotateRetroDialog(ctx, { retro }) }, 'Annotate')];
  if (retro.status === 'held') {
    actions.unshift(h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openLessonDialog(ctx, { retro }) }, 'Record a lesson'));
  }
  const body = h('div', { class: 'view-stack' },
    h('div', { class: 'badge-row' },
      badge(RETRO_STATUS_LABELS[retro.status] || retro.status, retro.status === 'held' ? 'good' : retro.status === 'skipped' ? 'neutral' : 'warn'),
      badge(subjectTypeSpec(retro.subjectType)?.label || 'Event', 'neutral'),
      retro.outcomeOn ? badge(`Closed ${retro.outcomeOn}`, 'neutral') : badge('Undated', 'warn'),
      retro.heldOn ? badge(`Held ${retro.heldOn}`, 'info') : null,
      report.heldRetros.length && retro.heldOn && retro.outcomeOn ? badge(`${Math.max(0, Math.round((new Date(`${retro.heldOn}T00:00:00Z`) - new Date(`${retro.outcomeOn}T00:00:00Z`)) / 86400000))} day(s) to review`, 'neutral') : null),
    retro.status === 'held'
      ? h('div', { class: 'view-stack' },
          ...AAR_QUESTIONS.slice(0, 3).map((question) => h('p', { class: 'small' },
            h('strong', null, `${question.label} `),
            retro[question.key] || h('span', { class: 'text-warn' }, '— not recorded'))),
          retro.sustain ? h('p', { class: 'small' }, h('strong', null, 'Kept: '), retro.sustain) : null,
          retro.improve ? h('p', { class: 'small' }, h('strong', null, 'Different next time: '), retro.improve) : null)
      : h('p', { class: 'small muted' }, retro.skipReason ? `Skipped: ${retro.skipReason}` : `Not held yet.${retro.cause ? ` The cause is drafted: ${retro.cause}` : ''}`),
    retro.participants?.length
      ? h('p', { class: 'small muted' }, `In the room: ${retro.participants.map((pid) => (ctx.state.people || []).find((p) => p.id === pid)?.name || 'someone').join(', ')}`)
      : null,
    evidence?.lines?.length ? h('details', { class: 'view-stack' },
      h('summary', { class: 'small' }, 'What the record said'),
      h('ul', { class: 'prep-list' }, ...evidence.lines.map((line) => h('li', { class: 'small muted' }, `${line.label}: ${line.value} (${line.source})`)))) : null,
    (retro.lessons || []).length
      ? h('div', { class: 'view-stack' },
          h('p', { class: 'small' }, h('strong', null, `Lessons (${retro.lessons.length})`)),
          ...retro.lessons.map((lesson) => lessonRow(ctx, retro, lesson)))
      : retro.status === 'held'
        ? h('p', { class: 'small text-warn' }, 'No lessons recorded. A review that changed nothing is a legitimate outcome — but it should say so, which is why an observation is a lesson too.')
        : null,
    h('div', { class: 'row-actions' }, ...actions));
  return card({ title: retro.subjectLabel, subtitle: retro.autoDrafted ? 'Drafted automatically from the closing record' : null, body });
}

function ledgerTab(ctx, report) {
  const body = [];
  const held = (report.retros || []).filter((retro) => retro.status === 'held');
  const skipped = (report.retros || []).filter((retro) => retro.status === 'skipped');
  const drafts = (report.retros || []).filter((retro) => retro.status === 'draft');

  body.push(h('div', { class: 'grid-3' },
    stat({ label: 'Reviews held', value: String(held.length), hint: `${drafts.length} awaiting, ${skipped.length} skipped` }),
    stat({ label: 'Committed changes', value: String(report.lessons.committed), hint: `${report.lessons.open} open · ${report.lessons.applied} applied · ${report.lessons.dropped} dropped` }),
    stat({ label: 'Observations', value: String(report.lessons.observations), hint: 'Insight with no change — counted separately, never as learning' })));

  if (!held.length) {
    body.push(emptyState({
      icon: '⌗',
      title: 'No review has been held yet',
      body: 'The ledger fills when a review is held. Until then there is nothing to compare and nothing to claim.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/learning') }, 'Go to the queue'),
    }));
  }

  const openChanges = report.lessons.changeQueue || [];
  if (openChanges.length) {
    body.push(card({
      title: `${openChanges.length} committed change${openChanges.length === 1 ? '' : 's'} still open`,
      subtitle: `A change older than ${30} days is called out. Only a dated note from a human marks one applied — a closed delegation is not evidence that a practice changed.`,
      body: table({
        caption: 'Committed learning changes with an open state',
        columns: [
          { label: 'Change', render: (row) => h('div', { class: 'view-stack', style: 'gap:2px' }, h('span', null, row.text), h('span', { class: 'small muted' }, row.retroLabel || '')) },
          { label: 'Class', render: (row) => lessonClassLabel(row.class) },
          { label: 'Committed', render: (row) => `${row.heldOn || '—'}` },
          { label: 'Age', render: (row) => badge(`${row.ageDays ?? '—'} day(s)`, row.late ? 'bad' : 'neutral') },
          { label: 'Open', render: (row) => h('a', { class: 'btn btn-ghost', href: '#/learning?tab=ledger' }, 'Open the review') },
        ],
        rows: openChanges,
        emptyMessage: 'No open changes.',
      }),
    }));
  }

  if (held.length) body.push(h('div', { class: 'view-stack' }, ...held.map((retro) => retroCard(ctx, report, retro))));

  if (drafts.length) {
    body.push(card({
      title: `Drafts (${drafts.length})`,
      subtitle: 'A draft is not a review. Nothing in the ledger counts it until the cause is written and the review is held.',
      body: h('div', { class: 'view-stack' }, ...drafts.map((retro) => retroCard(ctx, report, retro))),
    }));
  }

  if (skipped.length) {
    body.push(card({
      title: `Skipped (${skipped.length})`,
      subtitle: 'A dated decision that a closure did not merit a review. These count as accounted-for, not as reviewed.',
      body: table({
        caption: 'Skipped reviews and their reasons',
        columns: [
          { label: 'Closure', render: (row) => row.subjectLabel },
          { label: 'Closed', render: (row) => row.outcomeOn || '—' },
          { label: 'Why it was skipped', render: (row) => row.skipReason },
        ],
        rows: skipped,
        emptyMessage: 'No review has been skipped.',
      }),
    }));
  }
  return body;
}

/* ------------------------------------------------------------------ recurrence */

function recurrenceTab(ctx, report) {
  const body = [];
  const { recurrence } = report;

  body.push(h('div', { class: 'grid-3' },
    stat({ label: 'Classes seen', value: String(recurrence.classes.length), hint: 'Lesson classes with at least one lesson' }),
    stat({ label: 'Repeated classes', value: String(recurrence.repeatedClasses), hint: 'Appeared in two or more distinct events' }),
    stat({ label: 'Unclosed loops', value: String(recurrence.unclosedCount), hint: 'Repeated while the earlier change stayed open', tone: recurrence.unclosedCount ? 'bad' : 'good' })));

  if (!recurrence.classes.length) {
    body.push(emptyState({
      icon: '↻',
      title: 'Nothing to compare yet',
      body: 'Recurrence is measured per lesson class across distinct events. It needs at least one held review with a lesson before it can show anything — and it will never show a pattern from two lessons inside the same review.',
    }));
    return body;
  }

  if (recurrence.unclosed.length) {
    body.push(banner({
      tone: 'bad',
      title: `${recurrence.unclosed.length} class(es) have recurred while the change committed the first time is still open`,
      body: 'This is the sentence the terminal exists to print. It is not a judgement of anyone: a committed change that was never made is usually a change nobody was given the authority, the time or the reminder to make. The app has already opened one close-or-drop decision per class so the choice is made deliberately.',
      actions: [h('a', { class: 'btn btn-ghost', href: '#/decisions' }, 'See the decisions')],
    }));
  }

  body.push(card({
    title: 'Recurrence by class',
    subtitle: 'Counted per class across distinct events. Two lessons in the same review are one event that taught two things, not a pattern.',
    body: table({
      caption: 'Lesson classes and their recurrence',
      columns: [
        { label: 'Class', render: (row) => h('div', { class: 'view-stack', style: 'gap:2px' }, h('strong', null, row.label), h('span', { class: 'small muted' }, LESSON_CLASSES.find((c) => c.key === row.class)?.help || '')) },
        { label: 'Events', render: (row) => String(row.eventCount) },
        { label: 'Lessons', render: (row) => String(row.lessonCount) },
        { label: 'Changes', render: (row) => `${row.committed} committed · ${row.applied} applied · ${row.open} open` },
        {
          label: 'Verdict',
          render: (row) => h('div', { class: 'badge-row' },
            row.unclosed ? badge('Repeating, unchanged', 'bad')
              : row.recurred && row.open === 0 ? badge('Repeated, closed', 'good')
                : row.observationsOnly ? badge('Observation only', 'info')
                  : row.recurred ? badge('Repeated, in progress', 'warn') : badge('First sighting', 'neutral')),
        },
        { label: 'Span', render: (row) => `${row.firstSeenOn} → ${row.lastSeenOn}` },
      ],
      rows: recurrence.classes,
      emptyMessage: 'No classes yet.',
    }),
  }));

  for (const row of recurrence.unclosed.slice(0, 4)) {
    body.push(card({
      title: `${row.label} — ${row.eventCount} events, ${row.open} open change(s)`,
      subtitle: `First seen ${row.firstSeenOn}, last seen ${row.lastSeenOn}. The earliest commitment is still open after ${row.laterEventsAfterOpen} later event(s).`,
      body: h('div', { class: 'view-stack' },
        h('ul', { class: 'prep-list' }, ...row.lessons.map((lesson) => h('li', { class: 'small' },
          h('span', { class: 'muted' }, `${lesson.heldOn} · ${lesson.retroLabel}: `),
          lesson.text,
          ' ',
          stateBadge(lesson)))),
        row.firstOpen?.changeNote
          ? h('p', { class: 'small' }, h('strong', null, 'Change committed the first time: '), row.firstOpen.changeNote)
          : h('p', { class: 'small text-warn' }, 'No change was ever committed for this class, which is why it keeps returning.')),
    }));
  }

  if (recurrence.observationsOnlyClasses) {
    body.push(banner({
      tone: 'info',
      title: `${recurrence.observationsOnlyClasses} repeated class(es) have only ever produced observations`,
      body: 'The team noticed the pattern more than once and committed nothing either time. That is not hypocrisy — it is usually a signal that the class is expensive to change, and worth naming as a cost rather than logging again.',
    }));
  }

  body.push(h('p', { class: 'small muted' },
    'Classes exist so recurrence is countable. A lesson filed under "other" can never show a pattern, which is why the dialog asks for a real class first and offers "other" last.'));
  return body;
}

/* ------------------------------------------------------------------ coverage */

function coverageTab(ctx, report) {
  const body = [];
  const { closures, latency, lessons, index } = report;

  body.push(card({
    title: 'Learning index',
    subtitle: 'Only components that can be measured are used; the weights renormalise and the missing parts are named. Below two measurable components there is no index at all — a percentage on an empty set is not a score.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'row-between' },
        h('div', null,
          h('p', { class: 'stat-value' }, index.pct === null ? 'Not measurable yet' : `${index.pct}%`),
          index.band ? h('p', { class: 'small' }, `${index.band.label} — ${index.band.help}`) : null),
        index.pct !== null ? progressBar(index.pct, { label: 'Learning index', tone: index.band?.tone === 'good' ? 'good' : index.band?.tone === 'bad' ? 'bad' : 'warn' }) : null),
      table({
        caption: 'Learning index components',
        columns: [
          { label: 'Component', render: (row) => row.label },
          { label: 'Value', render: (row) => `${Math.round(row.value)}%` },
          { label: 'Weight', render: (row) => `${Math.round(row.weight * 100)}%` },
          { label: 'What it measures', render: (row) => row.detail },
        ],
        rows: index.components,
        emptyMessage: 'No component is measurable yet.',
      }),
      index.missingComponents.length
        ? h('p', { class: 'small muted' }, `Not measurable yet: ${index.missingComponents.join(', ')}. Each needs either a dated closure or a committed lesson to exist.`)
        : null,
      h('p', { class: 'small muted' }, `Bands are conventions: ${AAR_BANDS.map((band) => `${band.label} ≥ ${band.min}%`).join(' · ')}.`)),
  }));

  body.push(h('div', { class: 'grid-3' },
    stat({ label: 'Reviewable closures', value: String(closures.dated), hint: `Last ${report.settings.windowDays} days · ${closures.undated} undated excluded` }),
    stat({ label: 'Coverage', value: closures.coveragePct === null ? 'counts only' : `${closures.coveragePct}%`, hint: `${closures.reviewed} reviewed (${closures.held} held, ${closures.skipped} skipped) · convention ${closures.coverageFloorPct}%`, tone: closures.belowFloor ? 'bad' : 'good' }),
    stat({ label: 'Review latency', value: latency.medianDays === null ? 'not measured' : `${latency.medianDays}d`, hint: latency.medianDays === null ? 'Needs two held reviews with both dates' : `median over ${latency.measured} review(s); worst ${latency.worstDays}d` })));

  body.push(card({
    title: 'Applied is a claim; corroboration is a separate check',
    subtitle: 'A dated, distinct completed workspace artifact can corroborate that a practice left a record. It cannot show that the practice persisted, was effective, or caused a business outcome.',
    body: h('div', { class: 'grid-3' },
      stat({ label: 'Applied claims', value: String(lessons.applied), hint: 'Human-recorded state; never inferred from a closed task' }),
      stat({ label: 'Record-corroborated', value: String(lessons.corroborated), hint: lessons.verificationPct === null ? `Counts only · ${lessons.uncorroborated} without a current corroborating artifact` : `${lessons.verificationPct}% of applied claims · n=${lessons.applied}`, tone: lessons.corroborated ? 'good' : 'neutral' }),
      stat({ label: 'Stale artifacts', value: String(lessons.staleEvidence), hint: 'Missing, edited, invalidated or no longer date-eligible', tone: lessons.staleEvidence ? 'warn' : 'good' })),
  }));

  body.push(card({
    title: 'What is counted, and what is excluded',
    body: h('div', { class: 'view-stack' },
      table({
        caption: 'Closures by subject type',
        columns: [
          { label: 'Type', render: (row) => row.label },
          { label: 'Closed in window', render: (row) => String(row.closed) },
          { label: 'Reviewed', render: (row) => String(row.reviewed) },
          { label: 'Unreviewed', render: (row) => String(row.closed - row.reviewed) },
        ],
        rows: closures.byType,
        emptyMessage: 'No closure type has anything in the window.',
      }),
      h('ul', { class: 'prep-list' },
        h('li', { class: 'small' }, `${closures.undated} closed record(s) have no closing date and are excluded from coverage and latency — an undated close cannot be measured, only guessed.`),
        h('li', { class: 'small' }, `${closures.outsideWindow} closure(s) fall outside the ${report.settings.windowDays}-day window. They are history, not missed reviews.`),
        h('li', { class: 'small' }, 'A skipped review counts as accounted for and is counted separately from a held one in every rate.'),
        h('li', { class: 'small' }, 'An observation is never counted as learning: only a lesson with a committed change enters the applied rate.')),
    ),
  }));

  body.push(card({
    title: 'Lessons by class',
    subtitle: 'Observations are listed beside committed changes so the difference is never hidden by a single percentage.',
    body: table({
      caption: 'Lessons by class',
      columns: [
        { label: 'Class', render: (row) => row.label },
        { label: 'Observations', render: (row) => String(row.observations) },
        { label: 'Changes committed', render: (row) => String(row.committed) },
        { label: 'Applied', render: (row) => String(row.applied) },
        { label: 'Open', render: (row) => String(row.open) },
      ],
      rows: lessons.byClass,
      emptyMessage: 'No lessons recorded yet.',
    }),
  }));

  body.push(card({
    title: 'Conventions',
    subtitle: 'These are this workspace\'s conventions, not laws. They are printed so a reader can disagree with them.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'grid-2' },
        kv('Review window', `${report.settings.windowDays} days`),
        kv('Late after', `${report.settings.dueDays} days`),
        kv('Coverage convention', `${report.settings.coverageFloorPct}%`),
        kv('Auto-draft on close', report.settings.autoDraft ? 'On' : 'Off')),
      h('p', { class: 'small muted' },
        'AAR method: what was supposed to happen · what happened · why · what we keep · what changes. Four questions, asked of the record rather than of memory wherever the record has an answer.'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openLearningConventionsDialog(ctx) }, 'Edit conventions'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => downloadText('leados-learning-brief.txt', learningBrief(ctx.state, ctx.now)) }, 'Download the brief'))),
  }));
  return body;
}

/* ------------------------------------------------------------------ view */

export function renderLearning(ctx) {
  const tab = TAB_KEYS.has(ctx.query.get('tab')) ? ctx.query.get('tab') : 'queue';
  const report = buildLearningReport(ctx.state, ctx.now, ctx.state.settings);
  const signals = learningSignals(ctx.state, ctx.now);

  const header = pageHeader({
    eyebrow: 'After-action & learning · Schema v44',
    title: report.hasHeld
      ? 'Did we find out why — and did anything change?'
      : 'What have we learned from what already ended?',
    subtitle: 'Every other LeadOS terminal measures the work. This one measures whether the team converts what happened into a change in how it works: the four AAR questions, a dated lesson per class, and the one number no other tool prints — a class that keeps returning while the change committed after the first one was never made.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAdHocRetroDialog(ctx) }, 'Open a review'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => downloadText('leados-learning-brief.txt', learningBrief(ctx.state, ctx.now)) }, 'Download the brief'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openLearningConventionsDialog(ctx) }, 'Conventions'),
    ],
    meta: h('div', { class: 'badge-row' },
      badge(`${report.retros.length} review${report.retros.length === 1 ? '' : 's'}`, report.retros.length ? 'info' : 'neutral'),
      badge(report.closures.coveragePct === null ? 'coverage: counts only' : `coverage ${report.closures.coveragePct}%`, report.closures.belowFloor ? 'warn' : 'good'),
      report.queue.filter((row) => row.due).length
        ? badge(`${report.queue.filter((row) => row.due).length} review(s) late`, 'bad')
        : null,
      report.recurrence.unclosedCount ? badge(`${report.recurrence.unclosedCount} unclosed loop(s)`, 'bad') : null,
      report.lessons.lateOpen ? badge(`${report.lessons.lateOpen} change(s) parked`, 'warn') : null),
  });

  const body = tab === 'queue'
    ? queueTab(ctx, report)
    : tab === 'ledger'
      ? ledgerTab(ctx, report)
      : tab === 'recurrence'
        ? recurrenceTab(ctx, report)
        : coverageTab(ctx, report);

  return h('div', { class: 'view-stack' },
    header,
    h('div', { class: 'view-stack' },
      tabs({
        items: TABS.map((entry) => ({
          ...entry,
          count: entry.key === 'queue' ? report.queue.length || undefined
            : entry.key === 'recurrence' ? report.recurrence.unclosedCount || undefined
              : undefined,
        })),
        active: tab,
        onSelect: (key) => ctx.navigate(`#/learning?tab=${key}`),
      }),
      signals.length && tab === 'queue'
        ? h('div', { class: 'view-stack' }, ...signals.slice(0, 3).map((signal) => banner({
            tone: signal.severity >= 4 ? 'bad' : 'warn',
            title: signal.title,
            body: signal.detail,
            actions: signal.action ? [h('a', { class: 'btn btn-ghost', href: signal.action.route }, signal.action.label)] : [],
          })))
        : null,
      h('p', { class: 'small muted' },
        'Blameless by construction: a lesson names a system, a decision or a practice — never a person. Owner fields identify who acts on a change, not who is to blame.'),
      body),
  );
}

export { CHANGE_TYPES, AAR_QUESTION_BY_KEY };
