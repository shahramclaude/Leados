/**
 * app/views/matrixRemedyPanel.js — `#/matrix?panel=remedies`, the Matrix Pattern
 * Repair Register (ADR-0175, Schema v139, CSV scope #129).
 *
 * Renders the recurring structural patterns from ADR-0146, whether each has a
 * named owner and dated remedy, and — once the review date is reached — the
 * before/after verdict or the printed reason no verdict exists. Every figure is
 * the report's own; the panel computes none. The identity banner is shown only
 * when the reconciliation holds, and says plainly when it does not.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { buildMatrixRemedyReport } from '../core/domain/matrixRemedy.js';
import { MATRIX_RIGHTS, matrixLineKind } from '../core/domain/matrixRegistry.js';
import { MATRIX_REMEDY_LIMITS } from '../core/domain/matrixRemedyRegistry.js';

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };

const rightLabel = (key) => MATRIX_RIGHTS.find((r) => r.key === key)?.label || key;
const lineLabel = (key) => matrixLineKind(key)?.label || key;

function plusDays(iso, n) {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86400000).toISOString().slice(0, 10);
}

function notify(ctx, result, message) {
  if (!result?.ok) {
    const err = result?.error || 'The remedy was refused.';
    if (typeof ctx?.toast === 'function') ctx.toast(err, 'bad');
    else toast(err, 'bad');
    return false;
  }
  if (typeof ctx?.toast === 'function') ctx.toast(message, 'good');
  else toast(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function openDeclareDialog(ctx, report, pattern) {
  const today = report.readOn;
  const form = buildForm([
    {
      name: 'ownerId',
      label: 'Accountable owner',
      type: 'select',
      required: true,
      value: report.ownerOptions[0]?.id || '',
      help: 'Only people this seat reaches are offered. Ownership is named here, never inferred from a line or title.',
      options: report.ownerOptions.map((o) => ({ value: o.id, label: o.name })),
    },
    {
      name: 'remedy',
      label: 'Remedy — what will change',
      type: 'textarea',
      rows: 4,
      required: true,
      help: `At least ${MATRIX_REMEDY_LIMITS.remedyMinChars} characters. Say what changes and how the owner will know.`,
    },
    {
      name: 'decidedOn',
      label: 'Remedy decision date',
      type: 'date',
      required: true,
      value: today,
      help: 'The day the remedy was decided. It cannot be after today.',
    },
    {
      name: 'reviewOn',
      label: 'Review date',
      type: 'date',
      required: true,
      value: plusDays(today, 90),
      help: `${MATRIX_REMEDY_LIMITS.reviewMinDays}–${MATRIX_REMEDY_LIMITS.reviewMaxDays} days after the decision. The verdict is read on or after this date.`,
    },
    {
      name: 'basis',
      label: 'Basis (optional)',
      type: 'textarea',
      rows: 2,
      help: `Up to ${MATRIX_REMEDY_LIMITS.basisChars} characters: the evidence or reasoning behind the remedy.`,
    },
  ]);
  openModal({
    title: `Record remedy — ${pattern.findingLabel}`,
    description: `Pattern: ${pattern.lineKinds.map(lineLabel).join(' + ')} · rights ${pattern.rightKeys.map(rightLabel).join(', ')} · ${pattern.decisionsN} recurring decisions.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const v = form.getValues();
          const res = ctx.api.matrixRemedyDeclare({
            signatureKey: pattern.signatureKey,
            ownerId: v.ownerId,
            remedy: v.remedy,
            decidedOn: v.decidedOn,
            reviewOn: v.reviewOn,
            basis: v.basis || '',
          });
          if (!notify(ctx, res, 'Remedy recorded. Its verdict will be read on the review date.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record remedy'),
    ],
  });
}

function ownerCell(p) {
  if (p.ownerMissing) return h('span', { class: 'muted small' }, 'Owner no longer on the active roster (defect — shown, not repaired)');
  if (p.ownerWithheld) return h('span', { class: 'muted small' }, 'Owner outside this seat’s reach — name withheld');
  if (p.ownerName) return h('span', {}, p.ownerName);
  return h('span', { class: 'muted small' }, '—');
}

function verdictCell(p) {
  if (p.remedyState !== 'remedied' && !p.duplicateRemedyN) {
    return h('span', { class: 'muted small' }, 'No remedy — no verdict is possible');
  }
  if (p.verdict === 'pending') {
    return h('div', { class: 'stack-xs' },
      badge(p.verdictLabel, TONE.neutral),
      h('span', { class: 'muted small' }, `Running count so far: ${p.afterDecisionsN} matching decision(s) after the remedy. No verdict until ${p.reviewOn}.`));
  }
  const tone = p.verdict === 'refused' ? 'warn' : p.verdict === 'cleared' ? 'good' : p.verdict === 'reduced' ? 'warn' : 'bad';
  return h('div', { class: 'stack-xs' },
    badge(p.verdictLabel, TONE[tone] || 'neutral'),
    p.verdictReason ? h('span', { class: 'muted small' }, p.verdictReason) : null);
}

function patternsCard(ctx, report) {
  const canDeclare = Boolean(ctx.api && typeof ctx.api.matrixRemedyDeclare === 'function');
  return card({
    title: 'Recurring structural patterns in this seat',
    subtitle: 'Two or more distinct decisions sharing one finding kind, line kinds in force and affected rights (ADR-0146). Counts are re-derived on every read.',
    body: table({
      caption: 'Recurring structural patterns and their remedies',
      emptyMessage: report.emptyReason || 'No recurring pattern is visible in this seat.',
      columns: [
        {
          label: 'Pattern',
          render: (p) => h('div', { class: 'stack-xs' },
            h('strong', {}, p.findingLabel),
            h('span', { class: 'muted small' }, `${p.lineKinds.map(lineLabel).join(' + ') || 'no line kinds'} · ${p.rightKeys.map(rightLabel).join(', ') || 'no rights'}`)),
        },
        { label: 'Decisions', render: (p) => String(p.decisionsN) },
        {
          label: 'Remedy & owner',
          render: (p) => h('div', { class: 'stack-xs' },
            badge(p.remedyStateLabel, p.remedyState === 'remedied' ? 'good' : 'warn'),
            ownerCell(p),
            p.duplicateRemedyN ? h('span', { class: 'muted small' }, `${p.duplicateRemedyN} active remedies name this pattern`) : null,
            p.remedyState === 'unaddressed' && canDeclare
              ? h('button', {
                class: 'btn btn-sm',
                type: 'button',
                onClick: () => openDeclareDialog(ctx, report, p),
              }, 'Record remedy')
              : null),
        },
        {
          label: 'Review',
          render: (p) => (p.reviewOn
            ? h('div', { class: 'stack-xs' },
              h('span', {}, `Decided ${p.decidedOn}`),
              h('span', { class: 'muted small' }, `Review ${p.reviewOn}${p.reviewDue ? ' (reached)' : ' (not yet)'}`))
            : h('span', { class: 'muted small' }, '—')),
        },
        {
          label: 'Baseline vs review window',
          render: (p) => (p.baselineDecisionsN === null
            ? h('span', { class: 'muted small' }, '—')
            : h('div', { class: 'stack-xs' },
              h('span', {}, `Before: ${p.baselineDecisionsN} matching`),
              h('span', {}, `After: ${p.afterDecisionsN} matching`),
              h('span', { class: 'muted small' }, `Audited decisions in review window: ${p.reviewWindowAuditedN}`))),
        },
        { label: 'Verdict', render: (p) => verdictCell(p) },
      ],
      rows: report.patterns,
    }),
  });
}

export function renderMatrixRemedyPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const report = buildMatrixRemedyReport(state, { now, settings: state.settings || null });
  const c = report.counts;
  const v = c.byVerdict;

  const reconciliation = report.identity.all
    ? null
    : banner({
      tone: 'bad',
      title: 'Reconciliation failed — figures withheld',
      body: `Failed identities: ${Object.entries(report.identity).filter(([k, ok]) => k !== 'all' && !ok).map(([k]) => k).join(', ')}. Do not act on these counts until the record is repaired.`,
    });

  const notes = [];
  if (c.invalidRemedyN) notes.push(`${c.invalidRemedyN} stored remedy row(s) failed the fail-closed normaliser and were dropped, not repaired.`);
  if (c.unmatchedRemedyN) notes.push(`${c.unmatchedRemedyN} remedy record(s) name a pattern that is not a recurring pattern in this seat; they are counted, not read.`);
  if (c.ownerWithheldN) notes.push(`${c.ownerWithheldN} owner name(s) are outside this seat’s reach and are withheld.`);
  if (c.ownerMissingN) notes.push(`${c.ownerMissingN} remedy owner(s) are no longer on the active roster.`);
  if (report.patternsRemainderN) notes.push(`${report.patternsRemainderN} further pattern(s) are withheld from the panel by the display bound; they are included in the CSV.`);

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' },
      'Recurring patterns already show what keeps going wrong. This register asks the two questions that follow: does anyone own the pattern, and did the decisions change after the remedy? The verdict arrives on the review date, is read from the decision log, and is refused with its reason whenever the record cannot support it.'),
    reconciliation,
    notes.length ? banner({ tone: 'info', title: 'What this reading withholds', body: notes.join(' ') }) : null,
    h('div', { class: 'stat-grid' },
      stat({ label: 'Recurring patterns', value: String(c.recurringPatternN), hint: `${c.recurringObservationN} decision observation(s)` }),
      stat({ label: 'Remedy on record', value: String(c.remediedPatternN), hint: `${c.unaddressedPatternN} with no remedy` }),
      stat({ label: 'Cleared in window', value: String(v.cleared), tone: v.cleared ? 'good' : '' }),
      stat({ label: 'Reduced', value: String(v.reduced), tone: v.reduced ? 'warn' : '' }),
      stat({ label: 'Unchanged', value: String(v.unchanged), tone: v.unchanged ? 'bad' : '' }),
      stat({ label: 'Refused — no reading', value: String(v.refused), hint: 'printed reason on each row' }),
      stat({ label: 'Pending review', value: String(v.pending) }),
    ),
    patternsCard(ctx, report),
    card({
      title: 'Method and named frameworks',
      subtitle: `Read on ${report.readOn} for ${report.seat.label}${report.seat.fullAccess ? ' (full access)' : ''}.`,
      body: h('div', { class: 'stack-xs' },
        ...report.method.map((line) => h('p', { class: 'muted small' }, line)),
        ...report.frameworks.map((f) => h('p', { class: 'small' }, h('strong', {}, f.name), ` — ${f.use}`))),
    }),
    report.patterns.length ? null : emptyState({
      title: 'No remedy can be read yet',
      body: report.emptyReason || 'No recurring pattern is visible in this seat.',
    }),
  );
}
