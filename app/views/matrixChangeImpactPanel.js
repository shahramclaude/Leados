/**
 * app/views/matrixChangeImpactPanel.js — `#/matrix?panel=change-impacts`,
 * Matrix Change-Impact Line Review (ADR-0185, Schema v147).
 *
 * This is the lower-altitude, line-scoped review surface. The general `#/changes`
 * route stays at its existing portfolio floor. A response is dated review, not
 * approval, consent or authority to proceed.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { CHANGE_IMPACT_CSV_COLUMNS } from '../core/domain/changeImpactRegistry.js';

const value = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function notify(ctx, result, message) {
  const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
  if (!result?.ok) { say(result?.error || 'The change-impact review action was refused.', 'bad'); return false; }
  say(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function openRequestDialog(ctx, candidate, line) {
  const form = buildForm([
    {
      name: 'dueOn',
      label: 'Request due date (required)',
      type: 'date',
      value: '',
      required: true,
      help: 'Choose the date the line should respond by. No deadline is invented for you.',
    },
    {
      name: 'prompt',
      label: 'What should this line review? (optional)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'The material change and frozen impact summary are attached to the request.',
    },
  ]);
  openModal({
    title: `Request line review — ${line.managerName}`,
    description: `${candidate.changeTitle} · ${candidate.personName} · ${line.kind || line.role} line. The request snapshots every active Matrix line and the material impact context as of issuance.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.changeImpactReviewRequest?.({
            changeId: candidate.changeId,
            personId: candidate.personId,
            lineKey: line.lineKey,
            dueOn: fields.dueOn || '',
            prompt: fields.prompt || '',
          });
          if (!notify(ctx, result, `Dated request recorded for ${line.managerName}.`)) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Issue dated request'),
    ],
  });
}

function openResponseDialog(ctx, row) {
  const form = buildForm([
    {
      name: 'outcome',
      label: 'Your line response',
      type: 'select',
      value: '',
      required: true,
      options: [
        { value: '', label: '— choose one —' },
        { value: 'reviewed', label: 'Reviewed the frozen change impact' },
        { value: 'declined', label: 'Decline to review this request' },
      ],
    },
    {
      name: 'validThrough',
      label: 'Valid through (required for a review)',
      type: 'date',
      value: '',
      help: 'Choose an explicit date, from tomorrow through one year. Required only when you choose “Reviewed”; the review expires after this date.',
    },
    {
      name: 'basis',
      label: 'What did your line review? (required for a review)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'At least eight characters when you choose “Reviewed”. This is your line’s first-person review, not an approval or employee consent.',
    },
    {
      name: 'reason',
      label: 'Why decline? (required for a decline)',
      type: 'textarea',
      rows: 3,
      value: '',
      help: 'At least eight characters when you choose “Decline”. A decline is recorded as a decline, never as silence or a reviewed state.',
    },
  ]);
  openModal({
    title: `Respond for your line — ${row.managerName}`,
    description: `${row.changeTitle} · ${row.personName}. This action is available only while operating as the manager named on the requested Matrix line.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.changeImpactReviewRespond?.({
            requestId: row.requestId,
            outcome: fields.outcome || '',
            validThrough: fields.validThrough || '',
            basis: fields.basis || '',
            reason: fields.reason || '',
          });
          if (!notify(ctx, result, fields.outcome === 'declined' ? 'Reasoned decline recorded.' : 'Dated line review recorded.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record line response'),
    ],
  });
}

function responseText(row) {
  if (!row.response) return 'No response';
  if (row.response.outcome === 'declined') {
    return row.response.reason
      ? `Declined: ${row.response.reason}`
      : `Declined on ${row.response.respondedOn}; reason restricted.`;
  }
  return row.response.basis
    ? `${row.response.basis} (valid through ${row.response.validThrough})`
    : `Reviewed on ${row.response.respondedOn}, valid through ${row.response.validThrough}; details restricted.`;
}

function requestRows(ctx, report) {
  const byKey = new Map(report.rows.map((row) => [row.rowKey, row]));
  return report.candidates.flatMap((candidate) => candidate.lines
    .filter((line) => line.canRequest)
    .map((line) => ({ candidate, line, row: byKey.get(`${candidate.changeId}|${candidate.personId}|${line.lineKey}`) })));
}

export function renderMatrixChangeImpactPanel(ctx) {
  const result = ctx?.api?.changeImpactReviewBoard?.();
  if (!result?.ok || !result.report) {
    return card({
      title: 'Change-impact line review',
      body: banner({ tone: 'bad', title: 'The Matrix line-review register could not be read', body: result?.error || 'This seat cannot read the scoped review surface.' }),
    });
  }
  const report = result.report;
  const totals = report.totals;
  const coverageValue = totals.coverageWithheld ? 'Withheld' : `${totals.coveragePct}%`;
  const coverageHint = totals.coverageWithheld
    ? totals.coverageWithheldReason
    : `${totals.reviewedN} of ${totals.requiredLineReviewsN} required line reviews current`;
  const rows = report.rows;
  const history = report.historyRows;
  const requests = requestRows(ctx, report);

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'A line review is not an approval',
      body: 'Each response records what one Matrix line reviewed, by its own manager, against a frozen change-impact and active-line snapshot. It is not employee consent, a sign-off to proceed, or permission to implement. Silence never counts.',
    }),
    h('div', { class: 'row-actions' }, h('button', {
      class: 'btn btn-small',
      type: 'button',
      'data-testid': 'change-impact-csv',
      onClick: async () => {
        const csv = ctx.api?.changeImpactReviewCsvRows?.();
        const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
        if (!csv?.ok || !Array.isArray(csv.rows)) {
          say(csv?.error || 'The seat-scoped change-impact export was refused.', 'bad');
          return;
        }
        const text = serializeCsv(
          CHANGE_IMPACT_CSV_COLUMNS.map((key) => ({ key, header: key })),
          csv.rows,
        );
        const saved = downloadText({
          filename: `leados-matrix-change-impact-${report.today}.csv`,
          text,
          mime: 'text/csv;charset=utf-8',
        });
        if (saved) {
          say('Seat-scoped aggregate CSV downloaded.', 'good');
          return;
        }
        try {
          if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
          await globalThis.navigator.clipboard.writeText(text);
          say('The browser refused the download; the aggregate CSV was copied to the clipboard.', 'good');
        } catch {
          say('The browser refused both download and clipboard access. Use the workspace CSV export controls instead.', 'warn');
        }
      },
    }, 'Download aggregate CSV')),
    h('div', { class: 'row gap' },
      stat({ label: 'Current coverage', value: coverageValue, hint: coverageHint, tone: totals.coverageWithheld ? 'warn' : totals.clearanceState === 'covered' ? 'good' : 'warn' }),
      stat({ label: 'Required line reviews', value: value(totals.requiredLineReviewsN), hint: `${report.multiLinePeopleN} in-scope multi-line person(s)` }),
      stat({ label: 'Reviewed and current', value: value(totals.reviewedN), hint: 'explicit response + live snapshot + valid-through date', tone: totals.reviewedN ? 'good' : '' }),
      stat({ label: 'Need attention', value: value(totals.attentionN), hint: `${totals.overdueN} overdue · ${totals.staleN} stale · ${totals.declinedN} declined`, tone: totals.attentionN ? 'warn' : 'good' }),
    ),
    totals.coverageWithheld
      ? banner({ tone: 'warn', title: 'Coverage percentage withheld', body: totals.coverageWithheldReason })
      : banner({ tone: totals.clearanceState === 'covered' ? 'good' : 'warn', title: totals.clearanceState === 'covered' ? 'Every in-scope line has a current review' : 'Some line reviews are not current', body: 'A coverage figure counts only explicit, unexpired responses on an unchanged frozen snapshot.' }),

    card({
      title: 'Current line-review obligations',
      subtitle: 'One row per impacted person × active reporting line. A changed impact or any material line detail makes earlier responses stale, but keeps them in history.',
      body: table({
        caption: 'Current Matrix change-impact line-review obligations',
        emptyMessage: 'No current multi-line change-impact review is in this seat’s scope.',
        columns: [
          { label: 'Change / person', render: (row) => h('span', {}, h('strong', null, row.changeTitle), h('br'), `${row.personName} · ${row.impactLabel}${row.newRoleLabel ? ` · ${row.newRoleLabel}` : ''}`) },
          { label: 'Line', render: (row) => row.managerName ? `${row.managerName} · ${row.lineKind || row.lineRole}` : 'Full active line set unreadable' },
          { label: 'State', render: (row) => badge(row.stateLabel, row.stateTone, row.reason) },
          { label: 'Request / expiry', render: (row) => row.requestId ? `Asked ${row.requestedOn}; due ${row.dueOn}${row.response?.validThrough ? `; valid through ${row.response.validThrough}` : ''}` : 'Not requested' },
          { label: 'Line response', render: (row) => h('span', {}, responseText(row), row.late ? h('small', { class: 'muted' }, ' · late response') : null) },
          { label: 'Action', render: (row) => row.canRespond
            ? h('button', { class: 'btn btn-small btn-primary', type: 'button', 'aria-label': `Respond for ${row.managerName} on ${row.changeTitle}`, onClick: () => openResponseDialog(ctx, row) }, 'Respond')
            : row.canRequest
              ? h('button', { class: 'btn btn-small', type: 'button', 'aria-label': `Request review from ${row.managerName} on ${row.changeTitle}`, onClick: () => {
                const candidate = report.candidates.find((item) => item.changeId === row.changeId && item.personId === row.personId);
                const line = candidate?.lines.find((item) => item.lineKey === row.lineKey);
                if (candidate && line) openRequestDialog(ctx, candidate, line);
              } }, 'Request')
              : '—' },
        ],
        rows,
      }),
    }),

    card({
      title: 'Request another line to review',
      subtitle: 'Only open changes with an impacted person on at least two verifiable active Matrix lines appear. Choose an explicit due date for each request.',
      body: requests.length
        ? table({
          caption: 'Line-review requests available from this seat',
          columns: [
            { label: 'Change / person', render: ({ candidate }) => h('span', {}, h('strong', null, candidate.changeTitle), h('br'), `${candidate.personName} · ${candidate.impactLabel}${candidate.newRoleLabel ? ` · ${candidate.newRoleLabel}` : ''}`) },
            { label: 'Line to ask', render: ({ line }) => `${line.managerName} · ${line.kind || line.role}` },
            { label: 'Current state', render: ({ line }) => badge(line.stateLabel, line.state === 'reviewed' ? 'good' : 'warn') },
            { label: 'Action', render: ({ candidate, line }) => h('button', { class: 'btn btn-small', type: 'button', onClick: () => openRequestDialog(ctx, candidate, line) }, 'Request dated review') },
          ],
          rows: requests,
        })
        : emptyState({ title: 'No additional line needs a request in this seat’s current scope.' }),
    }),

    card({
      title: 'Prior requests and responses',
      subtitle: 'Superseded and stale responses are retained as dated history. They never count as current coverage.',
      body: table({
        caption: 'Historical Matrix change-impact requests and responses',
        emptyMessage: 'No prior line-review request is visible in this seat’s scope.',
        columns: [
          { label: 'Change / person', render: (row) => h('span', {}, h('strong', null, row.changeTitle), h('br'), `${row.personName} · ${row.impactLabel}${row.newRoleLabel ? ` · ${row.newRoleLabel}` : ''}`) },
          { label: 'Line', render: (row) => `${row.managerName} · ${row.lineKind || row.lineRole}` },
          { label: 'State', render: (row) => badge(row.stateLabel, row.stateTone, row.reason) },
          { label: 'Dates', render: (row) => `Asked ${row.requestedOn}; due ${row.dueOn}${row.response?.respondedOn ? `; answered ${row.response.respondedOn}` : ''}${row.response?.validThrough ? `; valid through ${row.response.validThrough}` : ''}` },
          { label: 'Response', render: (row) => responseText(row) },
        ],
        rows: history,
      }),
    }),
    h('p', { class: 'muted small' }, `Read scope: ${report.scope} · ${report.seatLabel}. Single-line impacts excluded: ${totals.singleLineExcludedN}. Unverifiable impacted people: ${totals.incompletePeopleN}. ${totals.truncatedN ? `${totals.truncatedN} row(s) withheld by the display cap.` : ''}`),
  );
}
