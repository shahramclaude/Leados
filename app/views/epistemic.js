/**
 * app/views/epistemic.js — `#/epistemic`, the Epistemic Ledger (ADR-0103).
 *
 * Six panels, six different questions:
 *   Desk          "What is this altitude actually supposed to do about it?"
 *   Unknowns      "What does the record already know that nobody has read?"
 *   Calibration   "Are my beliefs about my own span sunnier than its record?"
 *   Blind spots   "How much can go wrong below me that I would never hear?"
 *   Roll-up       "How does this look above me, below me, and by altitude?"
 *   Method        "What exactly is claimed, what is refused, what can I re-declare?"
 *
 * Nothing on this screen rates a person, and nothing on it asks how anyone feels.
 * Above director rank it prints counts by altitude only, and a suppressed cell is
 * blank, never zero.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { dayKey, addDays } from '../core/time.js';
import {
  BELIEF_CELLS,
  BLIND_CLASSES,
  EPISTEMIC_PANELS,
  UNKNOWN_KINDS,
  UNKNOWN_STATES,
} from '../core/domain/epistemicRegistry.js';

const PANELS = EPISTEMIC_PANELS;

const CSV_COLUMNS = ['row_kind', 'scope', 'unknown_n', 'unopened_n', 'open_n', 'answered_n',
  'dismissed_n', 'expired_n', 'escalate_n', 'declared_n', 'median_age_days', 'oldest_age_days',
  'paired_n', 'unpaired_n', 'agreed_ok_n', 'optimism_n', 'pessimism_n', 'agreed_bad_n',
  'kappa', 'pabak', 'bias_index', 'prevalence_index', 'p_value', 'verdict', 'expected_n',
  'arrived_n', 'silent_n', 'coverage_pct', 'band', 'rate_upper_30d', 'blind', 'suppressed'];

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((item) => item.key === key) ? key : 'desk';
};
const go = (ctx, panel, unknownId = null) => ctx.navigate(`#/epistemic?panel=${panel}${unknownId ? `&unknown=${encodeURIComponent(unknownId)}` : ''}`);
const num = (value) => (value === null || value === undefined ? 'refused' : String(value));

const kindBadge = (key) => {
  const meta = UNKNOWN_KINDS[key] || { label: key || 'unknown', tone: 'neutral', meaning: '' };
  return badge(meta.label, meta.tone, meta.meaning || '');
};
const stateBadge = (key) => {
  const meta = UNKNOWN_STATES[key] || { label: key || 'unknown', tone: 'neutral', meaning: '' };
  return badge(meta.label, meta.tone, meta.meaning || '');
};

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The epistemic action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv() {
  const result = ctxApi().epistemicCsvRows?.();
  if (!result?.ok) {
    toast(result?.error || 'The epistemic export was refused.', 'bad');
    return;
  }
  downloadText({
    filename: `leados-epistemic-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns: CSV_COLUMNS.map((key) => ({ key, header: key })), rows: result.rows }),
    mime: 'text/csv',
  });
}

// A module-level handle so `exportCsv` can reach the api without threading ctx
// through every helper. It is set on each render and never holds state.
let apiRef = null;
const ctxApi = () => apiRef || {};

function copyBrief(ctx) {
  const result = ctx.api.epistemicBriefText();
  if (!result?.ok) {
    toast(result?.error || 'No brief available.', 'bad');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(result.text).then(
      () => toast('Brief copied to the clipboard.', 'good'),
      () => toast('The clipboard is unavailable in this browser; the brief is shown on the Desk panel.', 'neutral'),
    );
  } else {
    toast('The clipboard is unavailable in this browser; the brief is shown on the Desk panel.', 'neutral');
  }
}

/* ------------------------------------------------------------- dialogs */

function declareDialog(ctx) {
  const conventions = ctx.api.epistemicConventions();
  const today = dayKey(ctx.now instanceof Date ? ctx.now : new Date());
  const form = buildForm([
    {
      name: 'title',
      label: 'The question the record cannot answer',
      type: 'textarea',
      rows: 3,
      required: true,
      help: 'Write the thing you do not know. It is stored at your seat, expires on a date you declare, and can only be closed by an answer or a written dismissal.',
    },
    {
      name: 'expiresOn',
      label: 'Declared expiry',
      type: 'date',
      required: true,
      value: addDays(today, conventions.epistemicExpiryDays),
      help: `The day after which the workspace stops calling this open and starts calling it expired (default ${conventions.epistemicExpiryDays} days). It must be after today.`,
    },
  ]);
  openModal({
    title: 'Declare an unknown',
    description: 'Most unknowns are already on the record and simply unread. Use this only for a question nothing in the workspace can answer.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.epistemicDeclare({ title: values.title, expiresOn: values.expiresOn });
          if (!result.ok) {
            form.setFieldError('title', result.error);
            toast(result.error, 'bad');
            return;
          }
          closeAllModals();
          notify(result, 'Unknown declared.');
          ctx.refresh();
        },
      }, 'Declare it'),
    ],
  });
}

function answerDialog(ctx, item) {
  const form = buildForm([
    {
      name: 'answer',
      label: 'What you found',
      type: 'textarea',
      rows: 4,
      required: true,
      help: 'An unknown closed without a sentence is an unknown dismissed with extra steps. The answer is what the next reader inherits.',
    },
  ]);
  openModal({
    title: 'Answer this unknown',
    description: item.title,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `Harvested ${item.harvestedOn} from a ${item.sourceType || 'declared'} record dated ${item.evidencesOn}. It has been in scope ${item.ageDays} day(s).`),
      form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.epistemicAnswer({ id: item.id, answer: values.answer });
          if (!result.ok) {
            form.setFieldError('answer', result.error);
            toast(result.error, 'bad');
            return;
          }
          closeAllModals();
          notify(result, 'Unknown answered.');
          ctx.refresh();
        },
      }, 'Record the answer'),
    ],
  });
}

function dismissDialog(ctx, item) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Why this is not worth carrying',
      type: 'textarea',
      rows: 3,
      required: true,
      help: 'The dismissal rate is printed beside the answer rate, so a dismissal has to say something a later reader can argue with.',
    },
  ]);
  openModal({
    title: 'Dismiss this unknown',
    description: item.title,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.epistemicDismiss({ id: item.id, reason: values.reason });
          if (!result.ok) {
            form.setFieldError('reason', result.error);
            toast(result.error, 'bad');
            return;
          }
          closeAllModals();
          notify(result, 'Unknown dismissed with a reason.');
          ctx.refresh();
        },
      }, 'Dismiss it'),
    ],
  });
}

/* ------------------------------------------------------------- desk */

function deskPanel(ctx, report) {
  const pb = report.playbook;
  const s = report.summary;
  const c = report.calibration;
  const b = report.backlog;
  return h('div', { class: 'stack' },
    banner({ tone: 'info', title: pb.title, body: `${pb.question} Horizon: ${pb.horizon}.` }),
    card({
      title: 'What you can see at this altitude',
      body: h('div', { class: 'stack' },
        h('p', null, pb.see),
        h('p', null, h('strong', null, 'Act: '), pb.act),
        h('p', null, h('strong', null, 'Hand up: '), pb.hand)),
    }),
    card({
      title: 'The ledger, right now',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Unknowns in scope', value: String(s.unknownN), hint: `${s.harvestedN} not yet frozen, ${s.declaredN} declared by a human` }),
        stat({ label: 'Unopened', value: String(s.unopenedN), tone: s.unopenedN ? 'bad' : '', hint: 'The record already knows; nobody has read it' }),
        stat({ label: 'Expired unanswered', value: String(s.expiredN), tone: s.expiredN ? 'warn' : '', hint: 'Time passed. The workspace refuses to call that resolved' }),
        stat({
          label: 'Escalation budget',
          value: `${b.openedN}/${b.capN}`,
          tone: b.deferredN ? 'warn' : '',
          hint: b.deferredN
            ? `${b.deferredN} deferred, oldest first · re-opens the week of ${b.nextWeekKey}`
            : `per span · ISO week of ${b.weekKey}`,
        }),
        stat({ label: 'Median age', value: s.medianAgeDays === null ? '—' : `${s.medianAgeDays}d`, hint: s.oldestAgeDays === null ? 'nothing in scope' : `oldest ${s.oldestAgeDays} days` }),
        stat({
          label: 'Overconfidence',
          value: c.verdict.key === 'refused' ? 'refused' : String(c.kappa.kappa ?? '—'),
          hint: c.verdict.label,
          tone: c.verdict.key === 'optimism' ? 'bad' : c.verdict.key === 'calibrated' ? 'good' : '',
        }),
        stat({ label: 'Dark classes', value: String(report.blind.darkN), tone: report.blind.darkN ? 'bad' : '', hint: `${report.blind.measurableN} measurable of ${report.blind.rows.length}` })),
    }),
    b.deferredN ? card({
      title: 'Escalations deferred by the weekly budget',
      subtitle: 'A deferral is a queue, not a resolution. Nothing here is dropped or closed.',
      body: h('div', { class: 'stack' },
        h('p', null, `${b.deferredN} unread danger/defect signal(s) have passed the declared escalation age, but their span has already opened its declared weekly budget of ${b.capN} escalation(s) in the ISO week of ${b.weekKey}. They stay queued, oldest first, and open automatically as the quota renews in the week of ${b.nextWeekKey}.`),
        report.seat.rank <= 3 && b.rows.some((row) => row.deferredN)
          ? table({
            columns: [
              { label: 'Span', render: (row) => row.name },
              { label: 'Opened / cap', render: (row) => `${row.openedN}/${row.capN}` },
              { label: 'Queued beyond budget', render: (row) => String(row.deferredN) },
            ],
            rows: b.rows.filter((row) => row.deferredN),
            caption: 'Per-span escalation budget for the current ISO week',
          })
          : h('p', { class: 'muted' }, 'Per-span breakdown prints at director rank and below; above it, only these counts travel.'),
        h('p', { class: 'muted' }, 'A span that must move a larger backlog this week can raise the declared budget in the Method panel — director or above, with a full-access seat. The budget is a convention, not a fitted number.')),
    }) : null,
    card({
      title: 'The brief',
      subtitle: 'Identity-free. This is what travels upward unchanged.',
      body: h('div', { class: 'stack' },
        h('pre', { class: 'brief-block' }, ctx.api.epistemicBriefText().text || 'No brief available.'),
        h('button', { class: 'btn small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief')),
    }),
    card({
      title: 'What this screen refuses to do',
      body: h('ul', { class: 'plain-list' },
        h('li', null, report.disclosure.expiry),
        h('li', null, report.disclosure.calibration),
        h('li', null, report.disclosure.blind),
        h('li', null, report.disclosure.refusal)),
    }),
  );
}

/* ---------------------------------------------------------- unknowns */

function unknownsPanel(ctx, report) {
  const rows = report.ledger;
  const columns = [
    { label: 'Signal', render: (row) => h('div', { class: 'stack-tight' },
      h('strong', null, row.title),
      h('span', { class: 'muted' }, `${row.origin === 'declared' ? 'Declared by a human' : `Harvested from a ${row.sourceType} record`} · owned at ${row.ownerName}`)) },
    { label: 'Class', render: (row) => kindBadge(row.className) },
    { label: 'State', render: (row) => h('div', { class: 'stack-tight' }, stateBadge(row.state), row.expired && row.state !== 'expired' ? badge('past expiry', 'warn', 'The declared window has closed') : null, row.deferred ? badge('deferred to next week', 'warn', 'Past the escalation age, but this span has already opened its declared weekly budget; the queued remainder opens as the quota renews') : null) },
    { label: 'Age', render: (row) => `${row.ageDays}d` },
    { label: 'Evidence day', render: (row) => row.evidencesOn || '—' },
    { label: 'Expires', render: (row) => row.expiresOn || '—' },
    {
      label: 'Act',
      render: (row) => (['answered', 'dismissed'].includes(row.state)
        ? h('span', { class: 'muted' }, row.state === 'answered' ? 'answered' : 'dismissed')
        : h('div', { class: 'row-actions' },
          row.route && row.sourceType
            ? h('a', { class: 'btn btn-tiny btn-ghost', href: row.route }, 'Open the record')
            : null,
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => answerDialog(ctx, row) }, 'Answer'),
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => dismissDialog(ctx, row) }, 'Dismiss'))),
    },
  ];
  return h('div', { class: 'stack' },
    card({
      title: 'The ledger of unknowns',
      subtitle: `${report.summary.unopenedN} unopened · ${report.summary.openN} under investigation · ${report.summary.answeredN} answered · ${report.summary.dismissedN} dismissed · ${report.summary.expiredN} expired unanswered`,
      actions: [h('button', { class: 'btn small', type: 'button', onClick: () => declareDialog(ctx) }, 'Declare an unknown')],
      body: rows.length
        ? table({ columns, rows: rows.slice(0, 60), caption: 'Unread and declared unknowns, most urgent first' })
        : emptyState({ title: 'Nothing unread, nothing declared', body: 'The record currently holds no signal that nobody has looked at. That is either a good week or a thin instrument — the Method panel prints which evidence classes produced anything at all.' }),
    }),
    card({
      title: 'Signals the spine has not frozen yet',
      subtitle: 'The harvest is not the first place you should learn what the record already said.',
      actions: [h('button', {
        class: 'btn small',
        type: 'button',
        onClick: () => {
          const result = ctx.api.epistemicScan();
          if (notify(result, 'Harvested, escalated and re-graded.')) ctx.refresh();
        },
      }, 'Run the harvest now')],
      body: (() => {
        const preview = ctx.api.epistemicPreview();
        if (!preview?.ok) return emptyState({ title: 'The preview could not be built', body: preview?.error || '' });
        if (!preview.pendingN) return h('p', { class: 'muted' }, 'Every signal the record currently holds is already in the ledger.');
        return h('div', { class: 'stack' },
          h('p', null, `${preview.pendingN} signal(s) are harvestable right now: ${Object.entries(preview.byClass).map(([key, n]) => `${n} ${UNKNOWN_KINDS[key]?.label.toLowerCase() || key}`).join(', ')}.`),
          table({
            columns: [
              { label: 'Class', render: (row) => kindBadge(row.className) },
              { label: 'Signal', render: (row) => row.title },
              { label: 'Evidence day', render: (row) => row.evidencesOn },
            ],
            rows: preview.sample,
            caption: 'A sample of the signals the next harvest will freeze',
          }));
      })(),
    }),
  );
}

/* -------------------------------------------------------- calibration */

function calibrationPanel(ctx, report) {
  const c = report.calibration;
  const k = c.kappa;
  const verdict = c.verdict;
  const cells = [
    { key: 'agreedOk', value: c.cells.agreedOk },
    { key: 'optimism', value: c.cells.optimism },
    { key: 'pessimism', value: c.cells.pessimism },
    { key: 'agreedBad', value: c.cells.agreedBad },
  ];
  return h('div', { class: 'stack' },
    banner({
      tone: verdict.key === 'optimism' ? 'bad' : verdict.key === 'underconfidence' ? 'warn' : verdict.key === 'calibrated' ? 'good' : 'info',
      title: `Verdict: ${verdict.label}`,
      body: verdict.meaning,
    }),
    card({
      title: 'Belief against the record',
      subtitle: 'Declared by you before the outcome was known. The record supplied the outcome. The distance between them is the reading.',
      actions: [h('button', {
        class: 'btn small',
        type: 'button',
        onClick: () => observeDialog(ctx, report),
      }, 'Freeze a belief')],
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Paired beliefs', value: String(c.pairedN), hint: `${c.unpairedN} still in flight, excluded` }),
          stat({ label: 'κ (Cohen)', value: k.refused ? 'refused' : String(k.kappa), hint: k.refused ? k.reason : `two-sided p = ${k.p}` }),
          stat({ label: 'PABAK', value: k.refused ? 'refused' : String(k.pabak), hint: 'Prevalence-adjusted, bias-adjusted — printed because raw κ collapses when outcomes are rare' }),
          stat({ label: 'Bias index', value: k.refused ? 'refused' : String(k.biasIndex), hint: k.refused ? '' : 'Positive = the belief ran ahead of the record' }),
          stat({ label: 'Prevalence index', value: k.refused ? 'refused' : String(k.prevalenceIndex), hint: k.refused ? '' : 'Positive = the outcomes were mostly good ones' })),
        k.refused
          ? banner({ tone: 'warn', title: 'The table cannot carry a reading', body: k.reason })
          : h('p', { class: 'muted' }, verdict.reason),
        table({
          columns: [
            { label: 'Cell', render: (row) => badge(row.label, row.tone, row.meaning) },
            { label: 'Meaning', render: (row) => row.meaning },
            { label: 'Count', render: (row) => String(row.value) },
          ],
          rows: cells.map((cell) => ({ ...cell, ...BELIEF_CELLS[cell.key] })),
          caption: 'The four belief-versus-record cells',
        })),
    }),
    card({
      title: 'The observations',
      subtitle: 'Each one is frozen on the day you declared it and graded once against the record.',
      body: c.rows.length
        ? table({
          columns: [
            { label: 'Declared', render: (row) => row.declaredOn },
            { label: 'Question', render: (row) => row.question || 'A belief about open work' },
            { label: 'Confidence', render: (row) => `${row.confidencePct}%` },
            { label: 'Paired', render: (row) => `${row.pairedN}${row.unpairedN ? ` (+${row.unpairedN} in flight)` : ''}` },
            { label: 'Verdict', render: (row) => badge(row.verdict.label, row.verdict.tone, row.verdict.reason || row.verdict.meaning) },
          ],
          rows: c.rows,
          caption: 'Frozen belief observations',
        })
        : emptyState({ title: 'No belief has been frozen yet', body: 'Declare what you believe about work whose outcome is not on the record. That is the only way this screen can ever tell you whether your reading of your own span is accurate — and it is deliberately the only way, because a belief recorded after the outcome is a memory.' }),
    }),
    card({
      title: 'Per-span cells',
      subtitle: c.bySeatHidden ? 'Above director rank the per-span rows are withheld; the pooled reading above is what survives.' : 'Below the declared floor a cell is suppressed, with a complementary partner so a printed total cannot be differenced back into it.',
      body: c.bySeatHidden
        ? h('p', { class: 'muted' }, `This seat is at rank ${report.seat.rank}. Individual span cells are not projected here; the pooled reading, the two indices and every refusal are.`)
        : (c.bySeat.length
          ? table({
            columns: [
              { label: 'Span', render: (row) => row.name },
              { label: 'Altitude', render: (row) => row.altitudeKey || '—' },
              { label: 'Paired', render: (row) => (row.suppressed ? 'suppressed' : String(row.pairedN)) },
              { label: 'κ', render: (row) => (row.suppressed || row.kappa === null ? '—' : String(row.kappa)) },
              { label: 'Bias', render: (row) => (row.suppressed || row.biasIndex === null ? '—' : String(row.biasIndex)) },
              { label: 'Verdict', render: (row) => (row.suppressed ? badge('suppressed', 'neutral', 'Below the declared cell floor') : badge(row.verdict.label, row.verdict.tone, row.verdict.reason || '')) },
            ],
            rows: c.bySeat,
            caption: 'Calibration by span',
          })
          : emptyState({ title: 'No span cell has a paired belief yet' })),
    }),
  );
}

function observeDialog(ctx, report) {
  // Candidates: open work whose outcome is not yet on the record. The API
  // refuses a resolved subject, so this list is a convenience, never the guard.
  const candidates = openWorkForBelief(ctx, report);
  if (!candidates.length) {
    openModal({
      title: 'Nothing to predict right now',
      description: 'A belief can only be frozen about work whose outcome is not yet on the record.',
      body: h('p', null, 'Every open decision, goal, case, premise and delegation in scope already carries a resolved outcome, or there is no open work at all. A belief recorded after the outcome is a memory — and grading it as foresight is exactly what this workspace refuses to do.'),
      footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => closeAllModals() }, 'Understood')],
    });
    return;
  }
  const form = buildForm([
    {
      name: 'question',
      label: 'What are you predicting?',
      type: 'text',
      help: 'Optional. One sentence the later reader will see beside the grade.',
    },
    {
      name: 'confidencePct',
      label: 'How confident are you that it will go well? (%)',
      type: 'number',
      min: 1,
      max: 99,
      value: 70,
      help: 'Recorded as declared. The terminal reads the direction of your beliefs, never this number alone.',
    },
    {
      name: 'subject',
      label: 'The piece of open work',
      type: 'select',
      options: candidates.map((item, index) => ({ value: String(index), label: item.label })),
      help: 'Only work whose outcome is still unknown is offered here.',
    },
    {
      name: 'belief',
      label: 'You believe it will go well',
      type: 'checkbox',
      value: true,
      help: 'Uncheck if you believe it will not. Both directions are useful: under-confidence is handed down, not up.',
    },
  ]);
  openModal({
    title: 'Freeze a belief',
    description: 'Written once, on this day. Later the record supplies the outcome, and the distance between the two is the only honest measure of how well you read your own span.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const picked = candidates[Number(values.subject)];
          if (!picked) {
            toast('Choose a piece of open work first.', 'bad');
            return;
          }
          const result = ctx.api.epistemicObserve({
            question: values.question,
            confidencePct: values.confidencePct,
            pairs: [{ subjectType: picked.subjectType, subjectId: picked.subjectId, belief: values.belief === true }],
          });
          if (!result.ok) {
            toast(result.error, 'bad');
            return;
          }
          closeAllModals();
          notify(result, 'Belief frozen. It will be graded once against the record.');
          ctx.refresh();
        },
      }, 'Freeze it'),
    ],
  });
}

/** Open work with NO resolved outcome, drawn from the record the reader can see. */
function openWorkForBelief(ctx, report) {
  const state = ctx.state || {};
  const resolved = {
    decisions: (row) => ['good', 'mixed', 'bad'].includes(row.outcome),
    goals: (row) => ['done', 'dropped'].includes(row.status),
    cases: (row) => ['resolved', 'closed'].includes(row.status),
    premises: (row) => ['supported', 'reaffirmed', 'breached'].includes(row.status),
    delegations: (row) => ['done', 'returned'].includes(row.status),
  };
  const labels = {
    decisions: ['decision', (row) => row.title],
    goals: ['goal', (row) => row.title],
    cases: ['case', (row) => row.title],
    premises: ['premise', (row) => row.statement || row.title || 'A registered premise'],
    delegations: ['delegation', (row) => row.title],
  };
  const out = [];
  for (const collection of Object.keys(labels)) {
    const rows = Array.isArray(state[collection]) ? state[collection] : [];
    for (const row of rows) {
      if (!row || !row.id) continue;
      if (resolved[collection](row)) continue;
      const [subjectType, label] = labels[collection];
      out.push({ subjectType, subjectId: row.id, label: `${subjectType[0].toUpperCase()}${subjectType.slice(1)} — ${String(label(row) || row.id).slice(0, 90)}` });
      if (out.length >= 80) break;
    }
    if (out.length >= 80) break;
  }
  void report;
  return out;
}

/* ------------------------------------------------------------ blind */

function blindPanel(ctx, report) {
  const b = report.blind;
  return h('div', { class: 'stack' },
    banner({
      tone: b.darkN ? 'bad' : b.mostlyBlindN ? 'warn' : 'info',
      title: b.darkN ? `${b.darkN} evidence class(es) are dark at this span` : `${b.measurableN} class(es) measurable, ${b.mostlyBlindN} mostly blind`,
      body: 'Coverage is an exact ratio over the records this workspace holds: measurable activity below this span against activity that produced an arriving edge. Work nobody logged is invisible to this arithmetic — and that limit is larger than the number.',
    }),
    card({
      title: 'The implied ledger',
      subtitle: 'No survey. The absence of the plumbing’s own edges is the evidence.',
      body: table({
        columns: [
          { label: 'Class', render: (row) => h('div', { class: 'stack-tight' }, h('strong', null, row.label), h('span', { class: 'muted' }, row.question)) },
          { label: 'Measurable', render: (row) => String(row.expectedN) },
          { label: 'Arrived', render: (row) => String(row.arrivedN) },
          { label: 'Silent', render: (row) => String(row.silentN) },
          { label: 'Coverage', render: (row) => (row.refused ? h('span', { class: 'muted' }, row.refusedReason) : `${row.coveragePct}%`) },
          { label: 'Band', render: (row) => badge(row.band.label, row.band.tone, row.band.meaning) },
          { label: 'Zero-arrival bound', render: (row) => (row.zeroArrivalRateUpper === null ? '—' : `≤ ${row.zeroArrivalRateUpper} / 30d`) },
        ],
        rows: b.rows,
        caption: 'Blind classes, measured from the graph the workspace already writes',
      }),
    }),
    card({
      title: 'What that means in one number',
      body: h('div', { class: 'stack' },
        h('p', null, `${b.impliedUnheardLower} dated record(s) below this span are measurable in a class that produced NO arriving edge at all. ${b.silentClasses.length} class(es) are in that state.`),
        h('p', { class: 'muted' }, 'This is a lower bound on what can be going wrong below you without anyone above you hearing, and it is a statement about the information system around a span — never a judgement of the person running it. The class with nothing measurable is a different finding: it is a blind INSTRUMENT, not a clean one.')),
    }),
    card({
      title: 'Evidence classes with no signal in the window',
      subtitle: 'A class that produced nothing is not evidence of calm. It is evidence that the instrument is not looking.',
      body: table({
        columns: [
          { label: 'Discipline', render: (row) => row.discipline },
          { label: 'Signals in window', render: (row) => String(row.evidenceN) },
          { label: 'Reading', render: (row) => (row.blind ? badge('Blind instrument', 'warn', 'No signal of any kind came from this discipline in the declared window. The workspace cannot tell whether that class of trouble exists — only that nothing is watching it.') : badge('Produced signal', 'good', 'At least one signal was harvested from this discipline, so the instrument is at least connected.')) },
        ],
        rows: report.instruments,
        caption: 'Declared evidence classes and whether they produced anything at all',
      }),
    }),
  );
}

/* ----------------------------------------------------------- rollup */

function rollupPanel(ctx, report) {
  const rows = report.altitudeRows;
  return h('div', { class: 'stack' },
    card({
      title: 'By altitude',
      subtitle: 'Where the unread signals sit in the hierarchy. Small cells are suppressed with a complementary partner.',
      body: rows.length
        ? table({
          columns: [
            { label: 'Altitude', render: (row) => row.altitudeKey },
            { label: 'Unknowns', render: (row) => (row.suppressed ? 'suppressed' : String(row.unknownN)) },
            { label: 'Unopened', render: (row) => (row.suppressed ? '—' : String(row.unopenedN)) },
            { label: 'Answered', render: (row) => (row.suppressed ? '—' : String(row.answeredN)) },
            { label: 'Expired', render: (row) => (row.suppressed ? '—' : String(row.expiredN)) },
          ],
          rows,
          caption: 'Unknowns by altitude within this seat’s scope',
        })
        : emptyState({ title: 'No unknowns are in scope at any altitude yet' }),
    }),
    card({
      title: 'How the altitude roll-up actually works here',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Frontline:'), ' the individual, the week and the unopened signal that is already on their own record.'),
        h('li', null, h('strong', null, 'Manager:'), ' the same ledger over the span they run, plus the calibration cell per direct span.'),
        h('li', null, h('strong', null, 'Director:'), ' counts by altitude and class, the two indices and every refusal — never an individual belief.'),
        h('li', null, h('strong', null, 'Executive and chief:'), ' the dark-class map, the age distribution and the pooled direction, identity-free and safe to carry upward unchanged.')),
    }),
  );
}

/* ----------------------------------------------------------- method */

function methodPanel(ctx, report) {
  const conv = report.conventions;
  const fields = [
    ['epistemicWindowDays', 'Harvest window (days)', 14, 730, 'How far back the harvest reads the record.'],
    ['epistemicEscalateDays', 'Escalation age (days)', 3, 180, 'The age at which an unopened danger or defect signal opens one governed decision.'],
    ['epistemicExpiryDays', 'Declared expiry (days)', 7, 365, 'Stamped on every harvested unknown. Expiry escalates; it never resolves.'],
    ['epistemicAnswerFloor', 'Answer-rate floor', 2, 50, 'Closed unknowns required before an answer rate is printed.'],
    ['epistemicPairFloor', 'Paired-belief floor', 4, 200, 'Paired beliefs required before a kappa, PABAK or p-value is printed.'],
    ['epistemicCellFloor', 'Cell floor', 2, 20, 'Small-cell suppression, and the measurability floor for a blind class.'],
    ['epistemicBlindFloor', 'Blind band (%)', 5, 95, 'Coverage below this reads as mostly blind.'],
    ['epistemicBlindDarkPct', 'Dark band (%)', 0, 40, 'Coverage at or below this reads as dark.'],
    ['epistemicReviewDays', 'Review horizon (days)', 3, 90, 'The review date on every governed finding this module opens.'],
    ['epistemicEscalateMaxPerWeek', 'Weekly escalation budget (per span)', 1, 52, 'How many unread danger/defect escalations one span can open per ISO week (ADR-0117). The over-budget remainder stays queued and is printed with its renewal week — raise this deliberately to drain a backlog faster.'],
  ];
  const form = buildForm(fields.map(([name, label, min, max, help]) => ({
    name, label, type: 'number', min, max, value: conv[name], help,
  })));
  return h('div', { class: 'stack' },
    card({
      title: 'What is claimed, exactly',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Cohen (1960) κ'), ' on the belief × record 2×2, with its normal-approximation z and two-sided p.'),
        h('li', null, h('strong', null, 'Byrt, Bishop & Carlin (1993); McKenna & Myers (1997) prevalence and bias indices'), ' — because κ falls when outcomes are rare, and the DIRECTION of the disagreement is the finding.'),
        h('li', null, h('strong', null, 'PABAK (Feinstein & Cicchetti 1990)'), ' printed beside κ rather than instead of it.'),
        h('li', null, h('strong', null, 'Wilson (1927)'), ' on every proportion, and the ', h('strong', null, 'rule of three (Hanley & Lippman-Hand 1983)'), ' as the upper bound where a class recorded zero arrivals in the window.'),
        h('li', null, h('strong', null, 'Jaques’ time-span of discretion'), ' as the altitude ladder the roll-up reads, and the shared spine (ADR-0076) as the only roll-up mechanism.')),
    }),
    card({
      title: 'What is refused',
      body: h('ul', { class: 'plain-list' },
        h('li', null, 'A kappa, PABAK or p-value below the paired-belief floor, or from a table where one cell carries every pair.'),
        h('li', null, 'An answer rate below its floor, and any suppressed cell — printed blank, never zero.'),
        h('li', null, 'Any coverage figure from fewer measurable records than the cell floor.'),
        h('li', null, 'An average of the two indices when they point in opposite directions. There is no composite score, and there never will be.')),
    }),
    card({
      title: 'The conventions',
      subtitle: 'Declared, clamped and printed. Director or above, with a full-access seat.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'field-grid' }, form.node),
        h('div', { class: 'form-actions' },
          h('button', {
            class: 'btn btn-primary',
            type: 'button',
            onClick: () => {
              const values = form.getValues();
              const patch = {};
              for (const [name] of fields) patch[name] = Number(values[name]);
              const result = ctx.api.epistemicSetConventions(patch);
              if (notify(result, 'Conventions re-declared.')) ctx.refresh();
            },
          }, 'Re-declare conventions'),
          h('button', {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              const result = ctx.api.epistemicScan();
              if (notify(result, 'Scan complete.')) ctx.refresh();
            },
          }, 'Run an explicit scan'))),
    }),
    card({
      title: 'How this is stored',
      body: h('ul', { class: 'plain-list' },
        h('li', null, 'An unknown stores a generated class-and-date title and a POINTER to the one record it was read from — never that record’s content, never a note and never a person’s name.'),
        h('li', null, 'A belief observation is frozen on the day it is declared. A subject whose outcome is already on the record is refused at write time, because a belief about a known result is a memory.'),
        h('li', null, report.disclosure.local)),
    }),
  );
}

/* ------------------------------------------------------------ render */

export function renderEpistemic(ctx) {
  apiRef = ctx.api;
  const panel = panelFor(ctx.query);
  const report = ctx.api.epistemicReport();
  if (!report?.ok) {
    return h('div', { class: 'stack' }, emptyState({ title: 'The epistemic ledger could not be built', body: report?.error || 'No report is available.' }));
  }
  const body = panel === 'desk'
    ? deskPanel(ctx, report)
    : panel === 'unknowns'
      ? unknownsPanel(ctx, report)
      : panel === 'calibration'
        ? calibrationPanel(ctx, report)
        : panel === 'blind'
          ? blindPanel(ctx, report)
          : panel === 'rollup'
            ? rollupPanel(ctx, report)
            : methodPanel(ctx, report);

  return h('div', { class: 'stack epistemic-view' },
    pageHeader({
      eyebrow: 'Integrity',
      title: 'The Epistemic Ledger',
      subtitle: 'What does this team believe that is false, what does it not know that it could know — and how would anyone ever find out?',
      actions: [
        badge(`${report.summary.unknownN} unknown(s)`, 'neutral', 'Harvested from the record and declared by a human'),
        report.summary.unopenedN
          ? badge(`${report.summary.unopenedN} unopened`, 'bad', 'The record already knows; nobody has read it')
          : badge('nothing unread', 'good', 'Every harvested signal has been looked at'),
        report.summary.expiredN
          ? badge(`${report.summary.expiredN} expired unanswered`, 'warn', 'Time passed. The workspace refuses to call that resolved')
          : badge('no lapses', 'good', 'No unknown has passed its declared expiry unanswered'),
        report.blind.darkN
          ? badge(`${report.blind.darkN} dark class(es)`, 'bad', 'Nothing arrived from a class with measurable activity')
          : null,
        h('button', { class: 'btn small', type: 'button', onClick: () => notify(ctx.api.epistemicScan(), 'Scan complete.') || ctx.refresh() }, 'Scan'),
        h('button', { class: 'btn small', type: 'button', onClick: exportCsv }, 'Export CSV'),
        h('button', { class: 'btn small', type: 'button', onClick: () => copyBrief(ctx) }, 'Copy brief'),
      ].filter(Boolean),
      meta: h('p', { class: 'muted' }, report.premise),
    }),
    tabs({ items: PANELS.map((item) => ({ key: item.key, label: item.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Epistemic ledger panels' }),
    body,
  );
}

/** The blind-class vocabulary, exported for the tests and the disclosure console. */
export { BLIND_CLASSES };
