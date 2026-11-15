/**
 * app/views/matrixGoalAttainmentPanel.js — `#/matrix?panel=attainment`, the Goal
 * Attainment Period Close & Restatement Register (IAS 8 / ASC 250 prior-period
 * adjustment; COSO 2013 principle 10; Kaplan & Norton 1996) (ADR-0206, Schema
 * v160, CSV scope #149, `RULE-GAR-01`).
 *
 * One reader (`buildGoalAttainment`) is behind the totals, every closure card,
 * every span row, the brief and the CSV. Nothing is recomputed here, so what the
 * screen prints is what the reader computed, and a withheld figure prints a dash
 * with its reason — never a zero.
 *
 * THE TWO CLAIMS THIS SCREEN KEEPS APART, because collapsing them is the failure
 * the register exists to prevent:
 *   1. "the buckets add up to the goal count"       — per closure, printed;
 *   2. "the printed figures are the frozen ones"    — the verdict, from a
 *      goal-by-goal comparison against the closing act.
 * A restatement is printed with its causes and its fingerprint beside the
 * original, and an acknowledged restatement still shows both.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { goalAttainmentBriefText } from '../core/domain/goalAttainment.js';
import {
  GOAL_ATTAINMENT_CSV_COLUMNS,
  GOAL_ATTAINMENT_LIMITS,
  GOAL_ATTAINMENT_METHOD,
  GOAL_ATTAINMENT_RIGHTS,
  GOAL_ATTAINMENT_RULE_ID,
  GOAL_ATTAINMENT_SETTING_KEYS,
} from '../core/domain/goalAttainmentRegistry.js';

const DIAGRAM_URL = './app/assets/goal-attainment-close.jpg';

const PANELS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Closed periods' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

const BUCKET_ORDER = Object.freeze([
  Object.freeze({ key: 'achieved', label: 'Completed' }),
  Object.freeze({ key: 'on-track', label: 'On track' }),
  Object.freeze({ key: 'at-risk', label: 'At risk' }),
  Object.freeze({ key: 'off-track', label: 'Off track' }),
  Object.freeze({ key: 'no-checkin', label: 'Never checked in' }),
  Object.freeze({ key: 'unknown-confidence', label: 'Confidence unreadable' }),
  Object.freeze({ key: 'dropped', label: 'Dropped' }),
]);

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const n = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : '—');

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function finish(ctx, result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The goal-attainment act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  refresh(ctx);
  return true;
}

function closePeriod(ctx, report) {
  if (!report.seat.operator && !report.seat.canActClose) {
    toast('Closing a period is the act of the altitude that reports the figure upward (director and above).', 'bad');
    return;
  }
  const candidates = ctx.api.matrixGoalAttainmentCandidates();
  const openMonths = (candidates?.months || []).filter((month) => month.closeable).slice(-3).reverse();
  const suggested = openMonths[0] || null;
  const form = buildForm([
    { name: 'label', label: 'What is this period called?', type: 'text', value: suggested ? `${suggested.month} close` : '', help: `Your own words for the report — ${GOAL_ATTAINMENT_LIMITS.labelMin}–${GOAL_ATTAINMENT_LIMITS.labelMax} characters. The register never parses it.` },
    { name: 'periodFrom', label: 'First day of the period', type: 'date', value: suggested?.periodFrom || '' },
    { name: 'periodTo', label: 'Last day (inclusive) — the period must have ended', type: 'date', value: suggested?.periodTo || '' },
    { name: 'note', label: 'Note on the close (optional)', type: 'textarea', value: '', help: `At least ${GOAL_ATTAINMENT_LIMITS.reasonMin} characters if you write one. What this report is, not who is responsible for it.` },
  ]);
  openModal({
    title: 'Close a period’s attainment figures',
    body: h('div', { class: 'stack' },
      form.node,
      suggested
        ? h('p', { class: 'muted small' }, `Suggested from the record: ${suggested.goalsN} goal(s) fall due in ${suggested.month}, the last on ${suggested.lastDueOn}. A period is your own declaration — this is a prompt, not a prescription.`)
        : h('p', { class: 'muted small' }, 'No ended calendar month of due dates is currently unclosed. Any period you declare that has ended and is not already closed can be closed.'),
      h('p', { class: 'muted small' }, 'The act freezes the bucket and span of every goal that fell due inside the period, as the record stands at the moment you press it. It edits nothing: no goal, no check-in, no due date, no owner.')),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'attainment-close-save',
        onClick: () => finish(ctx, ctx.api.matrixGoalAttainmentClose(form.getValues()), 'Period closed. The figures are now a fact on the record.'),
      }, 'Close the period'),
    ],
  });
}

function acknowledge(ctx, closure) {
  const form = buildForm([
    { name: 'reason', label: 'What are you accepting, and why?', type: 'textarea', value: '', help: `At least ${GOAL_ATTAINMENT_LIMITS.reasonMin} characters. This is a decision that the restated basis is the accepted period fact — the original figures stay printed beside it.` },
  ]);
  openModal({
    title: 'Acknowledge this restatement',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'warn',
        title: `Restatement ${dash(closure.signature)} of “${closure.label}”`,
        body: `The period ${closure.periodFrom} to ${closure.periodTo} reported ${closure.frozen.goalsN} goal(s) over ${closure.frozen.spansN} span slice(s); re-derived from the record today, ${closure.causedGoalsN} goal(s) changed (${closure.causeRows.map((cause) => `${cause.count} ${cause.key}`).join(', ') || 'no causes'}). Acknowledging accepts these figures as the period's figures — it does not edit, delete or re-post the original.`,
      }),
      form.node),
    footer: [
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Cancel'),
      h('button', {
        type: 'button', class: 'btn btn-primary', 'data-testid': 'attainment-acknowledge-save',
        onClick: () => finish(ctx, ctx.api.matrixGoalAttainmentAcknowledge({ closureId: closure.closureId, signature: closure.signature, reason: form.getValues().reason }), 'Restatement acknowledged. The restated basis is now the accepted period fact.'),
      }, 'Acknowledge'),
    ],
  });
}

function downloadCsv(ctx, today) {
  const result = ctx.api.matrixGoalAttainmentCsvRows();
  if (!result?.ok) { toast(result?.error || 'The goal-attainment export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-goal-attainment-closures-${today}.csv`,
    text: serializeCsv(GOAL_ATTAINMENT_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Aggregate CSV downloaded — the same figures this screen printed.', 'good');
}

function briefDialog(ctx) {
  const result = ctx.api.matrixGoalAttainmentBriefText();
  if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
  openModal({
    title: 'Goal attainment close — brief',
    body: h('pre', { class: 'brief', 'data-testid': 'attainment-brief' }, goalAttainmentBriefText(result.report) || result.text),
    footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: closeAllModals }, 'Close')],
  });
}

const VERDICT_TONE = { faithful: 'good', acknowledged: 'warn', restated: 'bad', unprovable: 'bad' };

function bucketTable(row) {
  const frozen = row.frozen.buckets || {};
  const live = row.live?.buckets || null;
  return table({
    caption: `Attainment buckets as closed for ${row.label}`,
    columns: [
      { label: 'Bucket', render: (r) => r.label },
      { label: 'Closed', className: 'num', render: (r) => n(frozen[r.key]) },
      { label: 'Now', className: 'num', render: (r) => (live ? n(live[r.key]) : '—') },
      { label: 'Change', className: 'num', render: (r) => (live ? ((live[r.key] || 0) - (frozen[r.key] || 0) === 0 ? '0' : `${(live[r.key] || 0) - (frozen[r.key] || 0) > 0 ? '+' : ''}${(live[r.key] || 0) - (frozen[r.key] || 0)}`) : '—') },
    ],
    rows: BUCKET_ORDER.map((bucket) => ({ key: bucket.key, label: bucket.label })),
    emptyMessage: 'No bucket is printed for this closure.',
  });
}

function spanTable(row) {
  return table({
    caption: `Span slices as closed and as re-derived for ${row.label}`,
    columns: [
      { label: 'Span', render: (span) => (span.name ? span.name : (span.ownerless ? 'No owner (team objective)' : span.code)) },
      { label: 'Closed', className: 'num', render: (span) => (span.withheld ? '—' : n(span.frozenN)) },
      { label: 'Now', className: 'num', render: (span) => (span.withheld ? '—' : n(span.liveN)) },
      { label: 'Change', className: 'num', render: (span) => (span.withheld ? '—' : (span.deltaN === 0 ? '0' : `${span.deltaN > 0 ? '+' : ''}${span.deltaN}`)) },
    ],
    rows: row.spans,
    emptyMessage: row.verdict === 'unprovable' ? 'The span slices are withheld with the reason above.' : 'No span slice is printed for this closure.',
  });
}

function closureCard(ctx, row, report) {
  const canAcknowledge = row.verdict === 'restated';
  const detailNote = row.spans.some((span) => span.withheld)
    ? 'Some span rows sit below the declared disclosure floor at this seat and print a dash with the reason.'
    : null;
  return card({
    title: `${row.label} · ${row.periodFrom} → ${row.periodTo}`,
    subtitle: `Closed ${row.closedOn} · ${row.frozen.goalsN} goal(s) over ${row.frozen.spansN} span slice(s)`
      + `${row.frozen.ownerlessN ? ` · ${row.frozen.ownerlessN} ownerless` : ''}`
      + `${row.frozen.multiLineN ? ` · ${row.frozen.multiLineN} multi-line owner` : ''}`
      + ` · fingerprint ${dash(row.signature)}`,
    attrs: { 'data-testid': `attainment-closure-${row.closureId}` },
    actions: [
      badge({ label: row.verdictMeta.label, tone: VERDICT_TONE[row.verdict] || 'neutral' }),
      canAcknowledge
        ? h('button', { type: 'button', class: 'btn btn-small btn-primary', 'data-testid': `attainment-ack-${row.closureId}`, onClick: () => acknowledge(ctx, row) }, 'Acknowledge restatement')
        : null,
    ].filter(Boolean),
    body: h('div', { class: 'stack' },
      row.reasons.length ? banner({ tone: 'bad', title: 'No restated figure is claimed', body: row.reasons.join(' ') }) : null,
      row.verdict === 'restated'
        ? banner({
          tone: 'bad',
          title: `The record no longer reproduces what was reported`,
          body: `${row.causedGoalsN} goal(s) moved since the close, across ${row.spans.filter((span) => span.changed).length} span slice(s). ${row.causeRows.map((cause) => `${cause.meta.label}: ${cause.count}`).join(' · ')}. The original figures are printed beside the restated ones — nothing here overwrites the closed period.`,
        })
        : null,
      row.verdict === 'acknowledged'
        ? banner({
          tone: 'warn',
          title: `Restated and acknowledged on ${row.acknowledgingNote?.actedOn}`,
          body: `A written acknowledgement of this exact fingerprint is on the record, so the restated basis is the accepted period fact. The original is still printed beside it. ${row.causeRows.map((cause) => `${cause.meta.label}: ${cause.count}`).join(' · ')}.`,
        })
        : null,
      row.verdict === 'faithful'
        ? h('p', { class: 'muted small' }, 'Every goal due inside this period re-derives to the same bucket in the same span. The reported figure is still the computed figure.')
        : null,
      row.note ? h('p', { class: 'small' }, h('strong', null, 'Note on the close: '), row.note) : null,
      bucketTable(row),
      spanTable(row),
      detailNote ? h('p', { class: 'muted small' }, detailNote) : null,
      row.spansRemainderN ? h('p', { class: 'muted small' }, `${row.spansRemainderN} span slice(s) are not listed here; the closure totals count them.`) : null,
      row.notes.length
        ? h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, `Acknowledgements on file (${row.notes.length}):`),
          ...row.notes.map((note) => h('p', { class: 'small' }, `${note.actedOn} · ${note.signature} · ${note.reason}`)))
        : null,
      !report.seat.operator && row.verdict === 'restated'
        ? h('p', { class: 'muted small' }, 'Acknowledging a restatement is the act of the altitude that reports the figure upward (director and above).')
        : null,
    ),
  });
}

function methodPanel(report) {
  const method = GOAL_ATTAINMENT_METHOD;
  return h('div', { class: 'stack' },
    card({
      title: 'Conceptual method illustration',
      subtitle: 'The frozen figure, the movements beside it, and the one ask that follows — generated asset, never workspace data.',
      body: h('figure', {},
        h('img', { src: DIAGRAM_URL, alt: 'Conceptual method diagram: a sealed ledger sheet on the left holds the frozen attainment figures inside a protective sleeve; to its right the same rows are shown as an overlay where one bar has changed colour, one has slipped out of its row and one is new, each marked with a dated dot and bracketed to its old position, so nothing is drawn over the sealed sheet. A thin dashed timeline separates the closed period from the record today, and a single arrow routes the highlighted movements upward to one neutral apex node and on to a dated acknowledgement stamp.', style: 'max-width:100%;height:auto;border-radius:8px;' }),
        h('figcaption', { class: 'muted small' }, 'Conceptual method diagram (generated asset) — not workspace data.')),
    }),
    card({
      title: 'What a closing act freezes — and what it refuses',
      subtitle: `${GOAL_ATTAINMENT_RULE_ID} · ask window ${report.conventions[GOAL_ATTAINMENT_SETTING_KEYS.askDueDays]} day(s) · automation ${report.conventions[GOAL_ATTAINMENT_SETTING_KEYS.autoPropagate] ? 'on' : 'paused'}`,
      body: h('div', { class: 'stack' },
        ...['unit', 'population', 'bucket', 'structure', 'matrix', 'restatement', 'refusal', 'notSaid'].map((key) => h('p', null,
          h('strong', null, `${key[0].toUpperCase()}${key.slice(1)}: `), method[key])),
        h('p', { class: 'muted small' }, 'One dated limitation, printed rather than hidden: this workspace does not date a DROP. A goal dropped after a close therefore restates the periods it was due in, which is the honest reading of an undated edit.')),
    }),
    card({
      title: 'Frameworks this register applies',
      body: h('div', { class: 'stack' }, ...(report.frameworks || []).map((framework) => h('p', null,
        h('strong', null, `${framework.label}. `), framework.says))),
    }),
    card({
      title: 'Refusals this register can print',
      body: h('div', { class: 'stack' },
        ...(report.refusals || []).map((refusal) => h('p', { class: 'small' }, h('strong', null, `${refusal.key}: `), refusal.says)),
        (report.refusals || []).length ? null : h('p', { class: 'muted small' }, 'Nothing is being refused right now.')),
    }),
    card({
      title: 'What is never done here',
      body: h('ul', null,
        h('li', null, 'No goal, check-in, due date, owner or closed figure is ever edited by this register or its rule.'),
        h('li', null, 'No person, manager or span is scored, ranked or charged with a restatement. The register charges it to the record.'),
        h('li', null, 'No attainment is inferred from a title, a description, a note or prose.'),
        h('li', null, 'No goal is split across a person’s additional reporting lines: it is counted once, in the home line, and the multi-line owner is printed.'),
        h('li', null, 'A period that cannot be re-derived is never reported over the part that can.')),
    }),
  );
}

export function renderMatrixGoalAttainmentPanel(ctx) {
  const result = ctx.api.matrixGoalAttainmentReport();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Matrix', title: 'Goal attainment close', subtitle: 'The figures that were reported, and whether they still hold.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat refused the read.' }));
  }
  const report = result.report;
  const requested = ctx.query.get('view') || (PANELS.some((row) => row.key === ctx.query.get('panel')) ? ctx.query.get('panel') : null);
  const panel = PANELS.some((row) => row.key === requested) ? requested : 'board';
  const t = report.totals;

  return h('div', { class: 'page', 'data-testid': 'goal-attainment-panel' },
    pageHeader({
      eyebrow: 'Matrix · Goals',
      title: 'What was reported, and whether it still holds',
      subtitle: 'A closed period is a fact, not a screen. Close the quarter’s attainment once; every later change to the record is printed beside the original as a dated restatement, never written over it.',
      actions: [
        h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'attainment-brief-open', onClick: () => briefDialog(ctx) }, 'Brief'),
        h('button', { type: 'button', class: 'btn btn-small', 'data-testid': 'attainment-csv', onClick: () => downloadCsv(ctx, report.today) }, 'Download CSV'),
        h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'attainment-close-open', onClick: () => closePeriod(ctx, report) }, 'Close a period'),
      ],
    }),

    h('div', { class: 'stat-row' },
      stat({ label: 'Closed periods', value: t.closuresN, hint: 'figures reported upward' }),
      stat({ label: 'Reproduce exactly', value: t.faithfulN, hint: 'the figure is still the computed figure', tone: t.faithfulN ? 'good' : '' }),
      stat({ label: 'Restated, unacknowledged', value: t.restatedN, hint: 'nobody has put their name to the new basis', tone: t.restatedN ? 'bad' : '' }),
      stat({ label: 'Restated and acknowledged', value: t.acknowledgedN, hint: 'the restated basis is the accepted fact', tone: t.acknowledgedN ? 'warn' : '' }),
      stat({ label: 'Cannot be re-derived', value: t.unprovableN, hint: 'the record it needs is missing', tone: t.unprovableN ? 'bad' : '' })),

    tabs({
      items: PANELS.map((row) => ({ key: row.key, label: row.label })),
      active: panel,
      ariaLabel: 'Goal attainment panels',
      onSelect: (key) => ctx.navigate(`#/matrix?panel=attainment&view=${encodeURIComponent(key)}`),
    }),

    panel === 'board'
      ? h('div', { class: 'stack' },
        t.unacknowledgedN
          ? banner({
            tone: 'bad',
            title: `${t.unacknowledgedN} closed period(s) no longer reproduce their reported figures`,
            body: `${t.restatedGoalsN} goal movement(s) across ${t.restatedSpansN} span slice(s). The rule asks the joint apex of the spans that moved for a written acknowledgement, or for the record to be repaired. A restatement is a fact about the record, not a verdict on anyone.`,
          })
          : null,
        report.closures.length
          ? h('div', { class: 'stack' }, ...report.closures.map((row) => closureCard(ctx, row, report)))
          : emptyState({
            title: 'No period has been closed yet',
            body: 'Until a period is closed, this register has nothing to restate — and every screen that shows a quarter’s attainment will keep recomputing it silently. Close the period whose figures you reported upward.',
          }),
        t.remainderN ? h('p', { class: 'muted small' }, `${t.remainderN} earlier close(s) are not listed here; the totals above count them.`) : null,
        report.refusals.length
          ? card({ title: `Refusals and withheld rows (${report.refusals.length})`, body: h('div', { class: 'stack' },
            ...report.refusals.map((refusal) => h('p', { class: 'small' }, h('strong', null, `${refusal.key}: `), refusal.says))) })
          : null)
      : methodPanel(report),

    h('p', { class: 'muted small' }, `Read at ${report.today}. ${GOAL_ATTAINMENT_RIGHTS.READ} is open at every altitude; closing a period and acknowledging a restatement require ${GOAL_ATTAINMENT_RIGHTS.CLOSE}.`),
  );
}

export default renderMatrixGoalAttainmentPanel;
