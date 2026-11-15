/**
 * app/views/portfolioReview.js — `#/portfolio`, the Enterprise Portfolio
 * Review Register (Keep / Fix / Sell / Exit, ADR-0222, Schema v176, CSV #164).
 *
 * ONE reader (`buildPortfolioReview`) stands behind every unit state,
 * milestone state, currency total, and joint-apex escalation on this page.
 * Nothing here computes a sum, a state, or an addressee of its own.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
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
  ], (values) => {
    const res = ctx.api.portfolioDeclareUnit({
      name: values.name,
      owningLineHolderId: values.owningLineHolderId,
      currency: values.currency,
      reviewDueOn: values.reviewDueOn,
      basis: values.basis,
    });
    if (!res?.ok) {
      toast(res?.error || 'Could not declare unit.', 'bad');
      return;
    }
    closeAllModals();
    toast('Business unit declared on the register.', 'good');
    onDone?.();
  }, { submitLabel: 'Declare unit' });

  openModal({ title: 'Declare a business unit', body: form });
}

function retireUnitDialog(ctx, unit, onDone) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Retirement reason (≥ 24 chars)',
      type: 'textarea',
      required: true,
      help: 'Only the CEO/C-suite seat (rank 5) may retire a portfolio unit.',
    },
  ], (values) => {
    const res = ctx.api.portfolioRetireUnit(unit.id, { reason: values.reason });
    if (!res?.ok) {
      toast(res?.error || 'Retirement refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Unit retired on the register.', 'good');
    onDone?.();
  }, { submitLabel: 'Retire unit' });

  openModal({ title: `Retire unit — ${unit.name}`, body: form });
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
  ], (values) => {
    const res = ctx.api.portfolioRecordReview(values.unitId, {
      amount: values.amount,
      evidenceKind: values.evidenceKind,
      evidenceId: values.evidenceId,
      basis: values.basis,
    });
    if (!res?.ok) {
      toast(res?.error || 'Review refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Dated review recorded.', 'good');
    onDone?.();
  }, { submitLabel: 'Record review' });

  openModal({ title: 'Record a dated review', body: form });
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
      label: 'Portfolio verdict (CEO/C-suite only)',
      type: 'select',
      required: true,
      options: PRV_VERDICTS.map((v) => ({ value: v.key, label: v.label })),
    },
    { name: 'rationale', label: 'Written verdict rationale (≥ 24 chars)', type: 'textarea', required: true, help: 'The diagnosis and guiding policy behind this judgement (Rumelt kernel).' },
    { name: 'reReviewOn', label: 'Re-review date (fix only, YYYY-MM-DD)', type: 'date', help: 'Required only for a fix verdict; must be after today.' },
    { name: 'amount', label: 'Expected proceeds in major units (sell/exit only)', type: 'text', help: 'Exact up to 2 decimals, no commas. Zero is allowed for a wind-down.' },
    { name: 'expectedOn', label: 'Expected completion date (sell/exit only, YYYY-MM-DD)', type: 'date', help: 'Required only for sell/exit; must be after today.' },
  ], (values) => {
    const payload = {
      verdict: values.verdict,
      rationale: values.rationale,
      ...(values.reReviewOn ? { reReviewOn: values.reReviewOn } : {}),
      ...(values.amount ? { amount: values.amount } : {}),
      ...(values.expectedOn ? { expectedOn: values.expectedOn } : {}),
    };
    const res = ctx.api.portfolioRecordVerdict(values.unitId, payload);
    if (!res?.ok) {
      toast(res?.error || 'Verdict refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Portfolio verdict recorded.', 'good');
    onDone?.();
  }, { submitLabel: 'Record verdict' });

  openModal({ title: 'Record a portfolio verdict', body: form });
}

function recordMilestoneDialog(ctx, report, preselectedVerdictId, onDone) {
  const liveVerdicts = report.verdicts.filter((v) => v.unitStatus === 'live');
  const form = buildForm([
    {
      name: 'verdictId',
      label: 'Verdict',
      type: 'select',
      required: true,
      value: preselectedVerdictId || liveVerdicts[0]?.id || '',
      options: toOptions(liveVerdicts.map((v) => ({ value: v.id, label: `${v.unitName} — ${v.verdictLabel} (${v.id})` })), { blank: 'Choose verdict…' }),
    },
    { name: 'milestoneId', label: 'Existing milestone ID (blank to add; copy from milestone table to update)', type: 'text' },
    { name: 'label', label: 'Milestone label', type: 'text', required: true, help: '3–120 chars, e.g. “Data room opened”.' },
    { name: 'dueOn', label: 'Due date (YYYY-MM-DD)', type: 'date', required: true },
    { name: 'doneOn', label: 'Completed date (leave blank if open, YYYY-MM-DD)', type: 'date' },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
  ], (values) => {
    const payload = {
      ...(values.milestoneId ? { milestoneId: values.milestoneId } : {}),
      label: values.label,
      dueOn: values.dueOn,
      ...(values.doneOn ? { doneOn: values.doneOn } : {}),
      ...(values.note ? { note: values.note } : {}),
    };
    const res = ctx.api.portfolioRecordMilestone(values.verdictId, payload);
    if (!res?.ok) {
      toast(res?.error || 'Milestone refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Verdict milestone recorded.', 'good');
    onDone?.();
  }, { submitLabel: 'Record milestone' });

  openModal({ title: 'Record a verdict milestone', body: form });
}

/* ----------------------------------------------------------------- sections */

function summaryStrip(report, attentionCount) {
  const currencySummary = report.currencies.length
    ? report.currencies.map((c) => c.measuredDisplay).join(' · ')
    : 'no measured value';
  return card({
    title: 'Portfolio snapshot',
    subtitle: 'Every figure is read directly from the single domain reader. Currencies are never converted into one composite total.',
    body: h('div', { class: 'stat-grid' },
      stat({
        label: 'Live units',
        value: h('span', { 'data-testid': 'prv-count-units' }, String(report.counts.unitsLive)),
        hint: `${report.counts.unitsRetired} retired · ${report.counts.reviewsTotal} review(s) · ${report.counts.verdictsTotal} verdict(s)`,
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
        hint: `${report.counts.unitStates['unreviewed'] || 0} never reviewed`,
      }),
      stat({
        label: 'Milestones overdue',
        value: h('span', { 'data-testid': 'prv-count-milestones-overdue' }, String(report.counts.milestoneStates['overdue'] || 0)),
        hint: `${report.counts.milestoneStates['done'] || 0} done · ${report.counts.milestoneStates['open'] || 0} open`,
      }),
      stat({
        label: 'Measured value',
        value: h('span', { 'data-testid': 'prv-count-measured' }, currencySummary),
        hint: 'latest review per live unit, per currency',
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
        ? 'Counts reconcile: every unit state, milestone state, and currency total sums to the exact total'
        : 'Counts do not reconcile — check load warnings',
      body: `Claim 1 (arithmetic conservation only): ${report.counts.unitsLive} live unit row(s), ${report.counts.milestonesTotal} milestone(s) on live verdicts, ${report.currencies.length} currency ledger(s).`,
    }),
    banner({
      tone: c.figuresComplete ? 'good' : 'caution',
      title: c.figuresComplete
        ? 'Figures complete: every live unit is reviewed, current, and verdicted, with no overdue milestones'
        : 'NOT COMPLETE — arithmetic reconciles, but coverage or currency has open gaps',
      body: c.figuresComplete
        ? 'Claim 2 (separate from Claim 1): zero unreviewed units, zero overdue reviews, zero pending verdicts, zero overdue milestones, and a clean matrix graph.'
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
        badge(u.status === 'retired' ? 'Retired' : u.stateLabel, u.status === 'retired' ? 'neutral' : toneOf(u.stateTone)),
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
      label: 'Latest verdict',
      render: (u) => u.latestVerdict
        ? h('div', { class: 'small' },
          h('div', null, `${u.latestVerdict.verdictLabel} · ${u.latestVerdict.decidedOn}`),
          u.latestVerdict.expectedProceedsDisplay
            ? h('div', { class: 'muted' }, `expected ${u.latestVerdict.expectedProceedsDisplay} by ${u.latestVerdict.expectedOn}`)
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
      render: (u) => u.status === 'live'
        ? h('div', { class: 'stack gap-xs' },
          button('Review', () => recordReviewDialog(ctx, report, u.id, onDone), { testid: `prv-review-${u.id}` }),
          button('Verdict', () => recordVerdictDialog(ctx, report, u.id, onDone), { testid: `prv-verdict-${u.id}` }),
          button('Retire', () => retireUnitDialog(ctx, u, onDone), { testid: `prv-retire-${u.id}` }))
        : h('span', { class: 'small muted' }, '—'),
    },
  ];

  return h('div', { class: 'stack' },
    h('div', { class: 'row gap' },
      button('Declare unit', () => declareUnitDialog(ctx, onDone), { primary: true, testid: 'prv-declare-unit' }),
      button('Record review', () => recordReviewDialog(ctx, report, null, onDone), { testid: 'prv-record-review' }),
      button('Record verdict', () => recordVerdictDialog(ctx, report, null, onDone), { testid: 'prv-record-verdict' })),
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
        ? button('Milestone', () => recordMilestoneDialog(ctx, report, v.id, onDone), { testid: `prv-milestone-${v.id}` })
        : h('span', { class: 'small muted' }, '—'),
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
      subtitle: 'Keep, fix, sell, or exit — each with a dated rationale. Only the CEO/C-suite seat may record one.',
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
        h('div', { class: 'small muted' }, `ID: ${m.id}`),
        h('div', { class: 'small muted' }, `due ${m.dueOn}${m.doneOn ? ` · done ${m.doneOn} by ${m.doneByName}` : ''}`)),
    },
    {
      label: 'State',
      render: (m) => badge(m.stateLabel, toneOf(m.stateTone)),
    },
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
      label: 'Joint apex',
      render: (e) => h('span', { class: 'small' },
        e.jointApex.ok ? e.apexNames.join(', ') : `unaddressable (${e.jointApex.reason})`),
    },
  ];

  return h('div', { class: 'stack' },
    button('Add or update milestone', () => recordMilestoneDialog(ctx, report, null, onDone)),
    card({
      title: 'Verdict milestones',
      subtitle: 'Fix, sell, and exit verdicts are tracked to completion; an overdue milestone escalates to the joint apex above the owning line.',
      body: report.milestones.length
        ? table({ columns: milestoneColumns, rows: report.milestones, caption: 'Verdict milestones' })
        : emptyState({ title: 'No milestones on record', body: 'Add milestones to a fix, sell, or exit verdict to track its execution.' }),
    }),
    card({
      title: 'Escalations & conservation',
      subtitle: 'Units needing a review, a verdict, or slippage resolution, with the joint-apex seat that must answer.',
      body: report.escalations.length
        ? table({ columns: escalationColumns, rows: report.escalations, caption: 'Portfolio escalations' })
        : emptyState({ title: 'No open escalations', body: 'Every live unit is reviewed, current, and verdicted with no overdue milestones.' }),
    }),
    card({
      title: 'Currency conservation',
      subtitle: 'Latest measured value and expected proceeds per currency, re-added from the printed integers. Currencies are never pooled.',
      body: report.currencies.length
        ? table({
          columns: [
            { label: 'Currency', render: (c) => h('strong', null, c.currency) },
            { label: 'Units', render: (c) => String(c.unitsN) },
            { label: 'Measured', render: (c) => c.measuredDisplay },
            { label: 'Expected proceeds', render: (c) => c.proceedsDisplay },
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
      subtitle: 'The CEO/C-suite judges every declared business unit on dated reviews and cited evidence. Only the owning line may review its unit; only the CEO seat may verdict it; fix, sell, and exit verdicts are tracked to completion.',
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
