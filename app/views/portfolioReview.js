/**
 * app/views/portfolioReview.js — `#/portfolio-review`, the Enterprise Portfolio
 * Review Register (Keep / Fix / Sell / Exit, ADR-0222, Schema v177, CSV #164).
 *
 * ONE reader (`buildPortfolioReview`) stands behind every unit state,
 * milestone state, currency total, chief queue item, and authority-aligned
 * escalation on this page. Nothing here computes a sum, a state, or an
 * addressee of its own.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  PRV_CONDITION_KINDS,
  PRV_EVIDENCE_KINDS,
  PRV_FRAMEWORKS,
  PRV_ROUTE,
  PRV_VERDICTS,
} from '../core/domain/portfolioReviewRegistry.js';

const DIAGRAM_URL = './app/assets/portfolio-review-method.jpg';

const VIEWS = [
  { key: 'units', label: 'Units' },
  { key: 'reviews', label: 'Reviews & Verdicts' },
  { key: 'exits', label: 'Exits & Milestones' },
  { key: 'method', label: 'Method' },
];

const TONE_MAP = {
  good: 'good',
  warn: 'caution',
  caution: 'caution',
  bad: 'bad',
  neutral: 'neutral',
};

const toneOf = (t) => TONE_MAP[t] || 'neutral';

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const toOptions = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((r) => ({ value: r.value, label: r.label })),
];

function openFormModal({ title, description = '', form, submitLabel, intro = null, onSubmit }) {
  const submit = () => {
    form.clearErrors();
    const res = onSubmit(form.getValues());
    if (!res?.ok) {
      if (res?.field) form.setFieldError(res.field, res.error || '');
      toast(res?.error || 'Action refused.', 'bad');
      return;
    }
    closeAllModals();
  };
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => closeAllModals() }, 'Cancel');
  const submitBtn = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'prv-modal-submit', onClick: submit }, submitLabel);
  openModal({
    title,
    description,
    body: h('div', { class: 'stack' }, intro, form.node),
    footer: [cancelBtn, submitBtn],
  });
}

/* ------------------------------------------------------------------ dialogs */

function declareUnitDialog(ctx, onDone) {
  const cand = ctx.api.portfolioCandidates ? ctx.api.portfolioCandidates() : { owners: [], holders: [] };
  const owners = Array.isArray(cand?.owners) ? cand.owners : [];

  const form = buildForm([
    { name: 'name', label: 'Business unit name', type: 'text', required: true, help: '3–120 chars, e.g. “Nordic Packaging”.' },
    {
      name: 'owningLineHolderId',
      label: 'Owning line holder (manager whose line owns this unit)',
      type: 'select',
      required: true,
      options: toOptions(owners.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })), { blank: 'Choose owning line…' }),
    },
    { name: 'currency', label: 'Currency (3-letter ISO)', type: 'text', required: true, help: 'e.g. DKK, EUR, USD. Money is never converted across currencies.' },
    { name: 'reviewDueOn', label: 'First review due (YYYY-MM-DD)', type: 'date', required: true },
    { name: 'basis', label: 'Written unit boundary basis (≥ 24 chars)', type: 'textarea', required: true, help: 'What this unit is and is not — the boundary a verdict will judge.' },
  ]);

  openFormModal({
    title: 'Declare a business unit',
    submitLabel: 'Declare unit',
    form,
    onSubmit(values) {
      const res = ctx.api.portfolioDeclareUnit({
        name: values.name,
        owningLineHolderId: values.owningLineHolderId,
        currency: values.currency,
        reviewDueOn: values.reviewDueOn,
        basis: values.basis,
      });
      if (res?.ok) {
        toast('Business unit declared on the register.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function retireUnitDialog(ctx, unit, onDone) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Retirement reason (≥ 24 chars)',
      type: 'textarea',
      required: true,
      help: 'Only the CEO/chief seat (rank 5) may retire a portfolio unit.',
    },
  ]);

  openFormModal({
    title: `Retire unit — ${unit.name}`,
    submitLabel: 'Retire unit',
    form,
    onSubmit(values) {
      const res = ctx.api.portfolioRetireUnit(unit.id, { reason: values.reason });
      if (res?.ok) {
        toast('Unit retired on the register.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function recordReviewDialog(ctx, report, preselectedUnitId, onDone) {
  const liveUnits = report.units.filter((u) => u.status === 'live');
  const form = buildForm([
    {
      name: 'unitId',
      label: 'Business unit',
      type: 'select',
      required: true,
      value: preselectedUnitId || liveUnits[0]?.id || '',
      options: toOptions(liveUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.id})` })), { blank: 'Choose live unit…' }),
    },
    { name: 'amount', label: 'Measured value in major units', type: 'text', required: true, help: 'Exact up to 2 decimals, no commas. Zero is allowed for a unit measured at nothing.' },
    {
      name: 'evidenceKind',
      label: 'Evidence kind',
      type: 'select',
      required: true,
      options: PRV_EVIDENCE_KINDS.map((k) => ({ value: k.key, label: k.label })),
    },
    { name: 'evidenceId', label: 'Evidence record ID', type: 'text', required: true },
    { name: 'basis', label: 'Written review basis (≥ 24 chars)', type: 'textarea', required: true, help: 'What was measured, over what period, and why it is comparable to prior reviews.' },
  ]);

  openFormModal({
    title: 'Record a dated review',
    submitLabel: 'Record review',
    form,
    onSubmit(values) {
      const res = ctx.api.portfolioRecordReview(values.unitId, {
        amount: values.amount,
        evidenceKind: values.evidenceKind,
        evidenceId: values.evidenceId,
        basis: values.basis,
      });
      if (res?.ok) {
        toast('Dated review recorded.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function recordVerdictDialog(ctx, report, preselectedUnitId, onDone) {
  const liveUnits = report.units.filter((u) => u.status === 'live');
  const form = buildForm([
    {
      name: 'unitId',
      label: 'Business unit',
      type: 'select',
      required: true,
      value: preselectedUnitId || liveUnits[0]?.id || '',
      options: toOptions(liveUnits.map((u) => ({ value: u.id, label: `${u.name} (${u.id})` })), { blank: 'Choose live unit…' }),
    },
    {
      name: 'verdict',
      label: 'Portfolio verdict (CEO/chief rank 5 only)',
      type: 'select',
      required: true,
      options: PRV_VERDICTS.map((v) => ({ value: v.key, label: v.label })),
    },
    { name: 'rationale', label: 'Written verdict rationale (≥ 24 chars)', type: 'textarea', required: true, help: 'The diagnosis and guiding policy behind this judgement (Rumelt kernel).' },
    { name: 'reReviewOn', label: 'Re-review date (fix only, YYYY-MM-DD)', type: 'date', help: 'Required only for a fix verdict; must be after decision date.' },
    { name: 'amount', label: 'Expected proceeds in major units (sell/exit only)', type: 'text', help: 'Exact up to 2 decimals, no commas. Zero is allowed for a wind-down.' },
    { name: 'expectedOn', label: 'Expected completion date (sell/exit only, YYYY-MM-DD)', type: 'date', help: 'Required only for sell/exit; must be after decision date.' },
  ]);

  openFormModal({
    title: 'Record a portfolio verdict',
    submitLabel: 'Record verdict',
    form,
    onSubmit(values) {
      const payload = {
        verdict: values.verdict,
        rationale: values.rationale,
        ...(values.reReviewOn ? { reReviewOn: values.reReviewOn } : {}),
        ...(values.amount ? { amount: values.amount } : {}),
        ...(values.expectedOn ? { expectedOn: values.expectedOn } : {}),
      };
      const res = ctx.api.portfolioRecordVerdict(values.unitId, payload);
      if (res?.ok) {
        toast('Portfolio verdict recorded.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function recordMilestoneDialog(ctx, report, preselectedVerdictId, onDone, existingMilestone = null) {
  const liveVerdicts = report.verdicts.filter((v) => v.unitStatus === 'live');
  const editing = Boolean(existingMilestone);
  const fields = [
    ...(editing ? [{ name: 'milestoneId', type: 'hidden', value: existingMilestone.id }] : []),
    {
      name: 'verdictId',
      label: 'Verdict',
      type: 'select',
      required: true,
      value: existingMilestone?.verdictId || preselectedVerdictId || liveVerdicts[0]?.id || '',
      options: toOptions(liveVerdicts.map((v) => ({ value: v.id, label: `${v.unitName} — ${v.verdictLabel} (${v.id})` })), { blank: 'Choose verdict…' }),
    },
    { name: 'label', label: 'Milestone label', type: 'text', value: existingMilestone?.label || '', required: true, help: '3–120 chars, e.g. “Data room opened”.' },
    { name: 'dueOn', label: 'Due date (YYYY-MM-DD)', type: 'date', value: existingMilestone?.dueOn || '', required: true },
    { name: 'doneOn', label: 'Completed date (leave blank if open, YYYY-MM-DD)', type: 'date', value: existingMilestone?.doneOn || '' },
    { name: 'note', label: 'Note (optional)', type: 'textarea', value: existingMilestone?.note || '' },
  ];
  const form = buildForm(fields);

  openFormModal({
    title: editing ? 'Update verdict milestone' : 'Add verdict milestone',
    submitLabel: editing ? 'Save milestone' : 'Add milestone',
    form,
    onSubmit(values) {
      const payload = {
        ...(values.milestoneId ? { milestoneId: values.milestoneId } : {}),
        label: values.label,
        dueOn: values.dueOn,
        ...(values.doneOn ? { doneOn: values.doneOn } : {}),
        ...(values.note ? { note: values.note } : {}),
      };
      const res = ctx.api.portfolioRecordMilestone(values.verdictId, payload);
      if (res?.ok) {
        toast(editing ? 'Verdict milestone updated.' : 'Verdict milestone recorded.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

function completeExitDialog(ctx, report, verdictRow, onDone) {
  const form = buildForm([
    { name: 'completedOn', label: 'Settlement / completion date (YYYY-MM-DD)', type: 'date', value: report.asOf, required: true },
    { name: 'amount', label: `Actual realized proceeds (${verdictRow.currency})`, type: 'text', required: true, help: 'Exact up to 2 decimals, no commas. Enter 0 for a nil-proceeds wind-down.' },
    {
      name: 'evidenceKind',
      label: 'Settlement evidence kind',
      type: 'select',
      required: true,
      options: PRV_EVIDENCE_KINDS.map((k) => ({ value: k.key, label: k.label })),
    },
    { name: 'evidenceId', label: 'Settlement instrument / reference ID', type: 'text', required: true },
    { name: 'basis', label: 'Written settlement basis (≥ 24 chars)', type: 'textarea', required: true, help: 'State how the divestiture or exit closed and reconcile proceeds to the final instrument.' },
  ]);

  openFormModal({
    title: `Complete ${verdictRow.verdictLabel.toLowerCase()} — ${verdictRow.unitName}`,
    submitLabel: 'Complete exit',
    intro: banner({
      tone: 'info',
      title: 'Dated disposal settlement (CEO/chief rank 5 only)',
      body: 'Completing a sell or exit settles the active mandate, freezes milestone tracking on it, and records exact realized proceeds separate from expected proceeds.',
    }),
    form,
    onSubmit(values) {
      const res = ctx.api.portfolioCompleteExit(verdictRow.id, {
        completedOn: values.completedOn,
        amount: values.amount,
        evidenceKind: values.evidenceKind,
        evidenceId: values.evidenceId,
        basis: values.basis,
      });
      if (res?.ok) {
        toast('Sell/exit completed and settled on the register.', 'good');
        onDone?.();
      }
      return res;
    },
  });
}

/* ----------------------------------------------------------------- sections */

function summaryStrip(report, attentionCount) {
  const currencySummary = report.currencies.length
    ? report.currencies.map((c) => c.measuredDisplay).join(' · ')
    : 'no measured value';
  const realizedSummary = report.currencies.some((c) => c.completedUnitsN > 0)
    ? report.currencies.filter((c) => c.completedUnitsN > 0).map((c) => c.realizedProceedsDisplay).join(' · ')
    : 'no completed exits';
  return card({
    title: 'Portfolio snapshot',
    subtitle: 'Every figure is read directly from the single domain reader. Currencies are never converted into one composite total.',
    body: h('div', { class: 'stat-grid' },
      stat({
        label: 'Live units',
        value: h('span', { 'data-testid': 'prv-count-units' }, String(report.counts.unitsLive)),
        hint: `${report.counts.unitsCompleted} completed · ${report.counts.unitsRetired} retired · ${report.counts.reviewsTotal} review(s)`,
      }),
      stat({
        label: 'Keep (current)',
        value: h('span', { 'data-testid': 'prv-count-keep' }, String(report.counts.unitStates['keep'] || 0)),
        hint: `${report.counts.unitStates['fix'] || 0} fix · ${report.counts.unitStates['sell'] || 0} sell · ${report.counts.unitStates['exit'] || 0} exit`,
      }),
      stat({
        label: 'Verdict pending',
        value: h('span', { 'data-testid': 'prv-count-pending' }, String(report.counts.unitStates['verdict-pending'] || 0)),
        hint: 'reviewed but not yet judged keep/fix/sell/exit',
      }),
      stat({
        label: 'Review overdue',
        value: h('span', { 'data-testid': 'prv-count-overdue' }, String(report.counts.unitStates['review-overdue'] || 0)),
        hint: `${report.counts.unitStates['unreviewed'] || 0} never reviewed · ${report.gaps.executionOverdueUnitsN} past-due exit(s)`,
      }),
      stat({
        label: 'Milestones overdue',
        value: h('span', { 'data-testid': 'prv-count-milestones-overdue' }, String(report.counts.milestoneStates['overdue'] || 0)),
        hint: `${report.counts.milestoneStates['done'] || 0} done · ${report.counts.milestoneStates['open'] || 0} open`,
      }),
      stat({
        label: 'Measured value',
        value: h('span', { 'data-testid': 'prv-count-measured' }, currencySummary),
        hint: `realized exits: ${realizedSummary}`,
      }),
      stat({
        label: 'Your owed decisions',
        value: h('span', { 'data-testid': 'prv-count-attention' }, String(attentionCount)),
        hint: attentionCount ? 'open portfolio decision(s) addressed to your seat' : 'nothing currently owed by this seat',
      }),
    ),
  });
}

function claimsSection(report) {
  const c = report.claims;
  return h('div', { class: 'stack', 'data-testid': 'prv-claims' },
    banner({
      tone: c.countsReconcile ? 'good' : 'bad',
      title: c.countsReconcile
        ? 'Counts reconcile: every unit state, exit state, milestone state, and currency total sums to the exact total'
        : 'Counts do not reconcile — check load warnings',
      body: `Claim 1 (arithmetic conservation only): ${report.counts.unitsLive} live, ${report.counts.unitsCompleted} completed exit(s), ${report.counts.unitsRetired} retired, ${report.counts.milestonesTotal} milestone(s), ${report.currencies.length} currency ledger(s).`,
    }),
    banner({
      tone: c.figuresComplete ? 'good' : 'caution',
      title: c.figuresComplete
        ? 'Figures complete: every live unit is reviewed, current, and verdicted, with no overdue milestones or past-due exits'
        : 'NOT COMPLETE — arithmetic reconciles, but coverage or execution has open gaps',
      body: c.figuresComplete
        ? 'Claim 2 (separate from Claim 1): zero unreviewed units, zero overdue reviews, zero pending verdicts, zero overdue milestones, zero past-due exits, and a clean matrix graph.'
        : `Reasons: ${c.incompleteReasons.join(', ')}.`,
    }),
    report.scope.unitsOutsideScopeN > 0
      ? banner({
        tone: 'caution',
        title: `Seat boundary active (${report.scope.unitsInScopeN} unit row(s) in scope)`,
        body: `${report.scope.unitsOutsideScopeN} unit row(s) belong to unrelated spans and are excluded from this seat's reading.`,
      })
      : null,
  );
}

function chiefQueueCard(ctx, report, onDone) {
  if (!report.chiefQueue?.length) return null;
  const isChief = report.scope.seatRank === null || report.scope.seatRank >= 5;
  const columns = [
    {
      label: 'Unit',
      render: (q) => h('strong', null, q.unitName),
    },
    {
      label: 'Decision owed (rank 5 chief)',
      render: (q) => h('span', { class: 'small' }, q.stateLabel),
    },
    {
      label: 'Owning line',
      render: (q) => h('span', { class: 'small' }, q.owningLineName),
    },
    {
      label: 'Due / effective',
      render: (q) => h('span', { class: 'small' }, q.dueOn),
    },
    ...(isChief ? [{
      label: 'Chief action',
      render: (q) => {
        const unit = report.units.find((u) => u.id === q.unitId);
        const latestVerdictRow = unit?.latestVerdict ? report.verdicts.find((v) => v.id === unit.latestVerdict.id) : null;
        if (q.kind === PRV_CONDITION_KINDS.EXECUTION_OVERDUE && latestVerdictRow) {
          return h('div', { class: 'row gap-xs' },
            button('Complete exit', () => completeExitDialog(ctx, report, latestVerdictRow, onDone), { primary: true, testid: `prv-queue-complete-${q.unitId}` }),
            button('Re-verdict', () => recordVerdictDialog(ctx, report, q.unitId, onDone), { testid: `prv-queue-verdict-${q.unitId}` }));
        }
        return button('Record verdict', () => recordVerdictDialog(ctx, report, q.unitId, onDone), { primary: true, testid: `prv-queue-verdict-${q.unitId}` });
      },
    }] : []),
  ];

  return h('div', { 'data-testid': 'prv-chief-queue' },
    card({
      title: 'Chief (CEO) decision queue',
      subtitle: isChief
        ? 'Portfolio verdicts and past-due disposal settlements require rank-5 chief authority and cannot be delegated down to lower apexes.'
        : 'Listed items await CEO (rank-5) judgement; lower seats cannot verdict or settle disposals directly.',
      body: table({ columns, rows: report.chiefQueue, caption: 'Chief portfolio decision queue' }),
    }));
}

function unitsView(ctx, report, onDone) {
  const rows = report.units.map((u) => ({
    ...u,
    attrs: {
      'data-testid': `prv-unit-${u.id}`,
      'data-state': u.state,
      'data-status': u.status,
    },
  }));

  const columns = [
    {
      label: 'Business unit',
      render: (u) => h('div', null,
        h('strong', null, u.name),
        h('div', { class: 'small muted' }, `Owning line: ${u.owningLineName} · ${u.currency} · review due ${u.reviewDueOn}`),
        u.basis ? h('div', { class: 'small muted' }, u.basis) : null),
    },
    {
      label: 'State',
      render: (u) => h('div', { class: 'stack gap-xs' },
        badge(
          u.status === 'retired'
            ? 'Retired'
            : u.executionOverdue
              ? `${u.stateLabel} (past expected date)`
              : u.stateLabel,
          u.status === 'retired' ? 'neutral' : u.executionOverdue ? 'bad' : toneOf(u.stateTone),
        ),
        h('span', { class: 'small muted' }, `${u.reviewsN} review(s) · ${u.verdictsN} verdict(s)`)),
    },
    {
      label: 'Latest review',
      render: (u) => u.latestReview
        ? h('div', { class: 'small' },
          h('div', null, u.latestReview.measuredDisplay),
          h('div', { class: 'muted' }, `${u.latestReview.assessedOn} · ${u.latestReview.evidenceLabel} (${u.latestReview.evidenceId})`))
        : h('span', { class: 'small muted' }, 'no review on record'),
    },
    {
      label: 'Latest verdict / settlement',
      render: (u) => u.latestVerdict
        ? h('div', { class: 'small' },
          h('div', null, `${u.latestVerdict.verdictLabel} · ${u.latestVerdict.decidedOn}`),
          u.latestVerdict.expectedProceedsDisplay
            ? h('div', { class: 'muted' }, `expected ${u.latestVerdict.expectedProceedsDisplay} by ${u.latestVerdict.expectedOn}`)
            : null,
          u.latestExit
            ? h('div', { class: 'muted' }, `settled ${u.latestExit.actualProceedsDisplay} on ${u.latestExit.completedOn}`)
            : null,
          u.latestVerdict.reReviewOn
            ? h('div', { class: 'muted' }, `re-review ${u.latestVerdict.reReviewOn}`)
            : null)
        : h('span', { class: 'small muted' }, 'no verdict recorded'),
    },
    {
      label: 'Milestones',
      render: (u) => h('span', { class: 'small' },
        `${u.milestonesDoneN} done · ${u.milestonesOpenN} open · ${u.milestonesOverdueN} overdue`),
    },
    {
      label: 'Actions',
      render: (u) => {
        if (u.status !== 'live') return h('span', { class: 'small muted' }, '—');
        const latestVerdictRow = u.latestVerdict ? report.verdicts.find((v) => v.id === u.latestVerdict.id) : null;
        const canCompleteExit = (u.latestVerdict?.verdict === 'sell' || u.latestVerdict?.verdict === 'exit') && latestVerdictRow;
        return h('div', { class: 'stack gap-xs' },
          button('Review', () => recordReviewDialog(ctx, report, u.id, onDone), { testid: `prv-review-${u.id}` }),
          button('Verdict', () => recordVerdictDialog(ctx, report, u.id, onDone), { testid: `prv-verdict-${u.id}` }),
          canCompleteExit
            ? button('Complete exit', () => completeExitDialog(ctx, report, latestVerdictRow, onDone), { testid: `prv-complete-exit-${u.id}` })
            : null,
          button('Retire', () => retireUnitDialog(ctx, u, onDone), { testid: `prv-retire-${u.id}` }));
      },
    },
  ];

  return h('div', { class: 'stack' },
    h('div', { class: 'row gap' },
      button('Declare unit', () => declareUnitDialog(ctx, onDone), { primary: true, testid: 'prv-declare-unit' }),
      button('Record review', () => recordReviewDialog(ctx, report, null, onDone), { testid: 'prv-record-review' }),
      button('Record verdict', () => recordVerdictDialog(ctx, report, null, onDone), { testid: 'prv-record-verdict' })),
    chiefQueueCard(ctx, report, onDone),
    rows.length
      ? table({ columns, rows, caption: 'Enterprise portfolio units' })
      : emptyState({ title: 'No business units declared', body: 'Declare the first business unit the portfolio must judge keep, fix, sell, or exit.' }));
}

function reviewsView(ctx, report, onDone) {
  const reviewColumns = [
    {
      label: 'Unit',
      render: (r) => h('div', null,
        h('strong', null, r.unitName),
        h('div', { class: 'small muted' }, r.isLatest ? 'latest review' : '')),
    },
    {
      label: 'Measured',
      render: (r) => h('div', { class: 'small' },
        h('div', null, r.measuredDisplay),
        h('div', { class: 'muted' }, `${r.assessedOn} · ${r.assessedByName}`)),
    },
    {
      label: 'Evidence',
      render: (r) => h('span', { class: 'small' }, `${r.evidenceLabel} (${r.evidenceId})`),
    },
    {
      label: 'Basis',
      render: (r) => h('span', { class: 'small muted' }, r.basis),
    },
  ];
  const verdictColumns = [
    {
      label: 'Unit',
      render: (v) => h('div', null,
        h('strong', null, v.unitName),
        h('div', { class: 'small muted' }, v.isLatest ? 'latest verdict' : '')),
    },
    {
      label: 'Verdict',
      render: (v) => h('div', { class: 'small' },
        h('div', null, v.verdictLabel),
        h('div', { class: 'muted' }, `${v.decidedOn} · ${v.decidedByName}`)),
    },
    {
      label: 'Commitment',
      render: (v) => h('span', { class: 'small' },
        v.expectedProceedsDisplay ? `expected ${v.expectedProceedsDisplay} by ${v.expectedOn}`
          : v.reReviewOn ? `re-review ${v.reReviewOn}` : '—'),
    },
    {
      label: 'Rationale',
      render: (v) => h('span', { class: 'small muted' }, v.rationale),
    },
    {
      label: 'Actions',
      render: (v) => v.unitStatus === 'live'
        ? h('div', { class: 'row gap-xs' },
          button('Milestone', () => recordMilestoneDialog(ctx, report, v.id, onDone), { testid: `prv-milestone-${v.id}` }),
          v.isLatest && (v.verdict === 'sell' || v.verdict === 'exit')
            ? button('Complete exit', () => completeExitDialog(ctx, report, v, onDone), { testid: `prv-verdict-complete-${v.id}` })
            : null)
        : h('span', { class: 'small muted' }, v.exitCompleted ? 'Completed' : '—'),
    },
  ];

  return h('div', { class: 'stack' },
    h('div', { class: 'row gap' },
      button('Record review', () => recordReviewDialog(ctx, report, null, onDone), { primary: true, testid: 'prv-record-review' }),
      button('Record verdict', () => recordVerdictDialog(ctx, report, null, onDone), { testid: 'prv-record-verdict' })),
    card({
      title: 'Dated reviews',
      subtitle: 'Every review is a dated measurement with cited evidence; the latest review per unit is what the verdict rests on.',
      body: report.reviews.length
        ? table({ columns: reviewColumns, rows: report.reviews, caption: 'Portfolio reviews' })
        : emptyState({ title: 'No reviews on record', body: 'A verdict must rest on a dated review; record one before judging a unit.' }),
    }),
    card({
      title: 'Portfolio verdicts',
      subtitle: 'Keep, fix, sell, or exit — each with a dated rationale. Only the CEO/chief seat (rank 5) may record one.',
      body: report.verdicts.length
        ? table({ columns: verdictColumns, rows: report.verdicts, caption: 'Portfolio verdicts' })
        : emptyState({ title: 'No verdicts on record', body: 'Record a keep, fix, sell, or exit verdict against a reviewed unit.' }),
    }));
}

function exitsView(ctx, report, onDone) {
  const milestoneColumns = [
    {
      label: 'Unit',
      render: (m) => h('strong', null, report.units.find((u) => u.id === m.unitId)?.name || m.unitId),
    },
    {
      label: 'Milestone',
      render: (m) => h('div', null,
        h('strong', null, m.label),
        h('div', { class: 'small muted' }, `due ${m.dueOn}${m.doneOn ? ` · done ${m.doneOn} by ${m.doneByName}` : ''}`),
        m.note ? h('div', { class: 'small muted' }, m.note) : null),
    },
    {
      label: 'State',
      render: (m) => badge(m.stateLabel, toneOf(m.stateTone)),
    },
    {
      label: 'Actions',
      render: (m) => {
        const unit = report.units.find((u) => u.id === m.unitId);
        return unit?.status === 'live'
          ? button('Update', () => recordMilestoneDialog(ctx, report, m.verdictId, onDone, m), { testid: `prv-milestone-edit-${m.id}` })
          : h('span', { class: 'small muted' }, '—');
      },
    },
  ];
  const exitColumns = [
    { label: 'Unit', render: (ex) => h('strong', null, ex.unitName) },
    { label: 'Mandate', render: (ex) => h('span', { class: 'small' }, `${ex.verdictLabel} (expected ${ex.expectedProceedsDisplay || '—'} by ${ex.expectedOn || '—'})`) },
    { label: 'Actual settlement', render: (ex) => h('div', { class: 'small' }, h('div', null, ex.actualProceedsDisplay), h('div', { class: 'muted' }, `${ex.completedOn} · ${ex.recordedByName}`)) },
    { label: 'Evidence', render: (ex) => h('span', { class: 'small' }, `${ex.evidenceLabel} (${ex.evidenceId})`) },
    { label: 'Basis', render: (ex) => h('span', { class: 'small muted' }, ex.basis) },
  ];
  const escalationColumns = [
    {
      label: 'Unit',
      render: (e) => h('strong', null, e.unitName),
    },
    {
      label: 'Condition',
      render: (e) => h('span', { class: 'small' }, e.stateLabel),
    },
    {
      label: 'Owning line',
      render: (e) => h('span', { class: 'small' }, e.owningLineName),
    },
    {
      label: 'Authorized addressee',
      render: (e) => h('span', { class: 'small' },
        e.jointApex.ok ? `${e.apexNames.join(', ')} (min rank ${e.requiredRank})` : `unaddressable (${e.jointApex.reason})`),
    },
  ];

  return h('div', { class: 'stack' },
    button('Add milestone', () => recordMilestoneDialog(ctx, report, null, onDone), { primary: true, testid: 'prv-add-milestone' }),
    card({
      title: 'Verdict milestones',
      subtitle: 'Fix, sell, and exit verdicts are tracked to completion; use Update on any row to mark completion or re-plan dates.',
      body: report.milestones.length
        ? table({ columns: milestoneColumns, rows: report.milestones, caption: 'Verdict milestones' })
        : emptyState({ title: 'No milestones on record', body: 'Add milestones to a fix, sell, or exit verdict to track its execution.' }),
    }),
    h('div', { 'data-testid': 'prv-completed-exits' },
      card({
        title: 'Completed sell & exit settlements',
        subtitle: 'Dated disposals settled on cited closing evidence with exact actual realized proceeds.',
        body: report.exits.length
          ? table({ columns: exitColumns, rows: report.exits, caption: 'Completed portfolio exits' })
          : emptyState({ title: 'No completed exits yet', body: 'Settling a live sell or exit verdict moves it out of execution into completed history.' }),
      })),
    card({
      title: 'Escalations & conservation',
      subtitle: 'Units needing a review, a verdict, milestone tracking, or overdue disposal settlement, routed strictly to right-capable seats.',
      body: report.escalations.length
        ? table({ columns: escalationColumns, rows: report.escalations, caption: 'Portfolio escalations' })
        : emptyState({ title: 'No open escalations', body: 'Every live unit is reviewed, current, and verdicted with no overdue milestones or past-due exits.' }),
    }),
    card({
      title: 'Currency conservation',
      subtitle: 'Latest measured value and expected proceeds across live units, plus realized proceeds on completed exits, re-added from printed integers.',
      body: report.currencies.length
        ? table({
          columns: [
            { label: 'Currency', render: (c) => h('strong', null, c.currency) },
            { label: 'Live units', render: (c) => String(c.unitsN) },
            { label: 'Measured (live)', render: (c) => c.measuredDisplay },
            { label: 'Expected proceeds (live)', render: (c) => c.proceedsDisplay },
            { label: 'Completed exits', render: (c) => String(c.completedUnitsN) },
            { label: 'Realized proceeds', render: (c) => c.realizedProceedsDisplay },
          ],
          rows: report.currencies,
          caption: 'Per-currency portfolio totals',
        })
        : emptyState({ title: 'No currency totals', body: 'Declare a unit with a currency to see its per-currency totals.' }),
    }));
}

function methodView() {
  return h('div', { class: 'stack' },
    card({
      title: 'Method — keep / fix / sell / exit on dated evidence',
      subtitle: 'BCG growth-share balance, Rumelt kernel, Porter attractiveness, Simons interactive control, Jaques stratum-appropriate accountability.',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'Portfolio review method diagram: declare units, review on evidence, verdict keep fix sell exit, track milestones', class: 'method-diagram' }),
        h('ul', { class: 'small' },
          PRV_FRAMEWORKS.map((f) => h('li', null, h('strong', null, f.citation), ` — ${f.principle}`)))),
    }));
}

export function renderPortfolioReview(ctx) {
  const report = ctx.api.portfolioReport ? ctx.api.portfolioReport() : null;
  if (!report || report.ok === false || !report.claims) {
    return h('div', { class: 'page' },
      pageHeader({
        eyebrow: 'CEO / C-suite · single-chain and matrix',
        title: 'Portfolio review register',
        subtitle: 'Which business units does the enterprise keep, fix, sell, or exit — and on what dated evidence?',
      }),
      banner({
        tone: 'bad',
        title: 'The register could not be read',
        body: report?.error || 'Resolve a valid operating seat to read this register.',
      }));
  }

  const requested = ctx.query?.get?.('view');
  const activeTab = VIEWS.some((v) => v.key === requested) ? requested : 'units';
  const attention = ctx.api.portfolioAttentionCount ? ctx.api.portfolioAttentionCount() : 0;
  const onDone = () => ctx.refresh?.();

  return h('div', { class: 'page', 'data-testid': 'portfolio-review-panel' },
    pageHeader({
      eyebrow: 'CEO / C-suite · single-chain and matrix',
      title: 'Which business units do we keep, fix, sell, or exit?',
      subtitle: 'The CEO/C-suite judges every declared business unit on dated reviews and cited evidence. Executive lines hold review rights (rank 4+); directors+ track execution milestones (rank 3+); only the rank-5 chief declares boundaries, pronounces keep/fix/sell/exit verdicts, or settles exits.',
    }),
    ctx.persistError
      ? banner({ tone: 'caution', title: 'Persistence warning', body: `Changes are not being persisted: ${ctx.persistError}` })
      : null,
    report.matrixError
      ? banner({ tone: 'bad', title: 'Reporting graph unreadable', body: report.matrixError })
      : null,
    ...(report.loadWarnings || []).map((w) => banner({ tone: 'caution', title: 'Malformed stored row dropped', body: w })),
    summaryStrip(report, attention),
    claimsSection(report),
    tabs({
      items: VIEWS.map((v) => ({
        key: v.key,
        label: v.label,
        count: v.key === 'units' ? report.counts.unitsLive
          : v.key === 'reviews' ? report.counts.reviewsTotal + report.counts.verdictsTotal
            : v.key === 'exits' ? report.counts.escalationsLive
              : undefined,
      })),
      active: activeTab,
      ariaLabel: 'Portfolio review register views',
      onSelect: (key) => ctx.navigate(`${PRV_ROUTE}?view=${key}`),
    }),
    activeTab === 'units' ? unitsView(ctx, report, onDone) : null,
    activeTab === 'reviews' ? reviewsView(ctx, report, onDone) : null,
    activeTab === 'exits' ? exitsView(ctx, report, onDone) : null,
    activeTab === 'method' ? methodView() : null,
    h('p', { class: 'small muted' }, `Engine ${report.engineVersion} · rule ${report.ruleId} · as of ${report.asOf} · review cadence ${report.conventions.portfolioReviewDays} day(s).`),
  );
}

export default renderPortfolioReview;
