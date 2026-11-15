/**
 * app/views/dutyMeans.js — `#/means`, the Duty-Without-Means Register
 * (Accountability–Means Parity & Simons' Entrepreneurial Gap Ledger,
 * ADR-0221, Schema v175, CSV #163).
 *
 * ONE reader (`buildDutyMeans`) stands behind every verdict, requirement state,
 * currency shortfall, protected-hour balance, and joint-apex escalation on this
 * page. Nothing here computes a sum, a verdict, or an addressee of its own.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  DWM_AUTHORITY_SCOPES,
  DWM_EVIDENCE_KINDS,
  DWM_FRAMEWORKS,
  DWM_PILLARS,
  DWM_ROUTE,
  DWM_SOURCE_KINDS,
} from '../core/domain/dutyMeansRegistry.js';
import { formatDwmMoney } from '../core/domain/dutyMeansSchema.js';

const DIAGRAM_URL = './app/assets/duty-without-means-method.jpg';

const VIEWS = [
  { key: 'duties', label: 'Duties' },
  { key: 'requirements', label: 'Requirements & Supply' },
  { key: 'escalations', label: 'Escalations & Conservation' },
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

function reqQuantityText(req) {
  if (req.currency && Number.isSafeInteger(req.requiredCents)) {
    return formatDwmMoney(req.currency, req.requiredCents);
  }
  if (Number.isSafeInteger(req.requiredHours)) {
    return `${req.requiredHours} h`;
  }
  if (req.authorityScopeLabel) return req.authorityScopeLabel;
  return req.pillarLabel;
}

function reqShortfallText(req) {
  if (req.currency && Number.isSafeInteger(req.unbackedShortfallCents)) {
    return formatDwmMoney(req.currency, req.unbackedShortfallCents);
  }
  if (Number.isSafeInteger(req.unbackedShortfallHours)) {
    return `${req.unbackedShortfallHours} h`;
  }
  if (req.pillar === 'authority') {
    return req.state === 'backed' || req.state === 'accepted-gap' ? '0 rights' : '1 unbacked right';
  }
  return '—';
}

/* ------------------------------------------------------------------ dialogs */

function declareDutyDialog(ctx, onDone) {
  const cand = ctx.api.dutyMeansCandidates ? ctx.api.dutyMeansCandidates() : { carriers: [], holders: [] };
  const carriers = Array.isArray(cand?.carriers) ? cand.carriers : [];
  const holders = Array.isArray(cand?.holders) ? cand.holders : [];

  const form = buildForm([
    { name: 'label', label: 'Accountable outcome duty', type: 'text', required: true, help: '3–120 chars, e.g. “Cut station changeover scrap below 1.5% in Q4”.' },
    {
      name: 'carrierId',
      label: 'Duty carrier (person held accountable)',
      type: 'select',
      required: true,
      options: toOptions(carriers.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })), { blank: 'Choose carrier…' }),
    },
    {
      name: 'demandingLineHolderId',
      label: 'Demanding line holder (manager holding carrier accountable)',
      type: 'select',
      required: true,
      options: toOptions(holders.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })), { blank: 'Choose manager…' }),
    },
    { name: 'windowFrom', label: 'Window opens (YYYY-MM-DD)', type: 'date', required: true },
    { name: 'windowTo', label: 'Window closes (YYYY-MM-DD)', type: 'date', required: true },
    {
      name: 'sourceKind',
      label: 'Source instrument',
      type: 'select',
      required: true,
      options: DWM_SOURCE_KINDS.map((s) => ({ value: s.key, label: s.label })),
    },
    { name: 'sourceId', label: 'Source record ID (leave blank only for written instruction)', type: 'text' },
    { name: 'outcomeBasis', label: 'Written outcome basis (≥ 24 chars)', type: 'textarea', required: true, help: 'Exact target, commitment, or charter clause the carrier is held answerable for.' },
  ], (values) => {
    const res = ctx.api.dutyMeansDeclareDuty({
      label: values.label,
      carrierId: values.carrierId,
      demandingLineHolderId: values.demandingLineHolderId,
      windowFrom: values.windowFrom,
      windowTo: values.windowTo,
      sourceKind: values.sourceKind,
      sourceId: values.sourceId || '',
      outcomeBasis: values.outcomeBasis,
    });
    if (!res?.ok) {
      toast(res?.error || 'Could not declare duty.', 'bad');
      return;
    }
    closeAllModals();
    toast('Accountable duty recorded.', 'good');
    onDone?.();
  }, { submitLabel: 'Declare duty' });

  openModal({ title: 'Declare an accountable duty', body: form });
}

function addRequirementDialog(ctx, report, preselectedDutyId, onDone) {
  const cand = ctx.api.dutyMeansCandidates ? ctx.api.dutyMeansCandidates() : { holders: [] };
  const holders = Array.isArray(cand?.holders) ? cand.holders : [];
  const liveDuties = report.duties.filter((d) => d.status === 'live');

  const form = buildForm([
    {
      name: 'dutyId',
      label: 'Duty',
      type: 'select',
      required: true,
      value: preselectedDutyId || liveDuties[0]?.id || '',
      options: toOptions(liveDuties.map((d) => ({ value: d.id, label: `${d.label} (${d.id})` })), { blank: 'Choose live duty…' }),
    },
    {
      name: 'pillar',
      label: 'Required means pillar',
      type: 'select',
      required: true,
      options: DWM_PILLARS.map((p) => ({ value: p.key, label: p.label })),
    },
    {
      name: 'controllingHolderId',
      label: 'Controlling line holder (seat that controls this means)',
      type: 'select',
      required: true,
      options: toOptions(holders.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })), { blank: 'Choose controlling seat…' }),
    },
    {
      name: 'authorityScope',
      label: 'Authority scope (for Decision authority pillar only)',
      type: 'select',
      options: toOptions(DWM_AUTHORITY_SCOPES.map((s) => ({ value: s.key, label: s.label })), { blank: 'None (budget or time pillar)' }),
    },
    { name: 'currency', label: 'Currency (3-letter ISO, for budget or spend-commit authority)', type: 'text', help: 'Leave blank for time or non-spend authority.' },
    { name: 'amount', label: 'Amount in major units (for budget or spend-commit authority)', type: 'text', help: 'Exact up to 2 decimals, no commas (e.g. 45000.00).' },
    { name: 'hours', label: 'Protected whole hours (for Protected time pillar only)', type: 'text', help: 'Whole integer hours over the duty window (e.g. 120).' },
    { name: 'rationale', label: 'Why the duty requires this means (≥ 24 chars)', type: 'textarea', required: true },
  ], (values) => {
    const payload = {
      pillar: values.pillar,
      controllingHolderId: values.controllingHolderId,
      rationale: values.rationale,
      ...(values.authorityScope ? { authorityScope: values.authorityScope } : {}),
      ...(values.currency ? { currency: values.currency } : {}),
      ...(values.amount ? { amount: values.amount } : {}),
      ...(values.hours ? { hours: values.hours } : {}),
    };
    const res = ctx.api.dutyMeansAddRequirement(values.dutyId, payload);
    if (!res?.ok) {
      toast(res?.error || 'Could not declare required means.', 'bad');
      return;
    }
    closeAllModals();
    toast('Required means recorded.', 'good');
    onDone?.();
  }, { submitLabel: 'Add required means' });

  openModal({ title: 'Declare required authority, budget, or time', body: form });
}

function recordActDialog(ctx, req, onDone) {
  const form = buildForm([
    {
      name: 'state',
      label: 'Controlling-line response',
      type: 'select',
      required: true,
      options: [
        { value: 'supplied', label: 'Means supplied (with instrument reference)' },
        { value: 'declined', label: 'Means declined (written reason)' },
        { value: 'revoked', label: 'Previously supplied means withdrawn (written reason)' },
      ],
    },
    {
      name: 'evidenceKind',
      label: 'Evidence kind (required when supplied)',
      type: 'select',
      options: toOptions(DWM_EVIDENCE_KINDS.map((k) => ({ value: k.key, label: k.label })), { blank: 'None (declined / revoked)' }),
    },
    { name: 'evidenceId', label: 'Evidence instrument ID (required when supplied)', type: 'text' },
    { name: 'amount', label: `Supplied amount${req.currency ? ` (${req.currency})` : ''}`, type: 'text', help: 'Required only when supplying budget or spend-commit authority.' },
    { name: 'hours', label: 'Supplied whole hours', type: 'text', help: 'Required only when supplying protected time.' },
    { name: 'reason', label: 'Written reason (≥ 24 chars when declined or revoked)', type: 'textarea' },
  ], (values) => {
    const payload = {
      state: values.state,
      ...(values.evidenceKind ? { evidenceKind: values.evidenceKind } : {}),
      ...(values.evidenceId ? { evidenceId: values.evidenceId } : {}),
      ...(values.amount ? { amount: values.amount, currency: req.currency } : {}),
      ...(values.hours ? { hours: values.hours } : {}),
      ...(values.reason ? { reason: values.reason } : {}),
    };
    const res = ctx.api.dutyMeansRecordAct(req.id, payload);
    if (!res?.ok) {
      toast(res?.error || 'Response refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Controlling-line response recorded.', 'good');
    onDone?.();
  }, { submitLabel: 'Record response' });

  openModal({ title: `Answer required means — ${req.pillarLabel}`, body: form });
}

function governGapDialog(ctx, req, onDone) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Joint-apex entrepreneurial-gap rationale (≥ 24 chars)',
      type: 'textarea',
      required: true,
      help: 'Signed strictly above both the demanding line and the controlling line (Simons 2005): explains why accountability exceeds direct control and protects the carrier from unresourced blame.',
    },
    {
      name: 'evidenceKind',
      label: 'Supporting governance record (optional)',
      type: 'select',
      options: toOptions(DWM_EVIDENCE_KINDS.map((k) => ({ value: k.key, label: k.label })), { blank: 'None' }),
    },
    { name: 'evidenceId', label: 'Governance record ID (optional)', type: 'text' },
  ], (values) => {
    const res = ctx.api.dutyMeansGovernGap(req.id, {
      reason: values.reason,
      ...(values.evidenceKind ? { evidenceKind: values.evidenceKind } : {}),
      ...(values.evidenceId ? { evidenceId: values.evidenceId } : {}),
    });
    if (!res?.ok) {
      toast(res?.error || 'Joint-apex governance refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Bounded entrepreneurial gap signed at joint apex.', 'good');
    onDone?.();
  }, { submitLabel: 'Accept entrepreneurial gap' });

  openModal({ title: 'Govern unbacked gap at joint apex', body: form });
}

function retireDutyDialog(ctx, duty, onDone) {
  const form = buildForm([
    {
      name: 'reason',
      label: 'Retirement or rescoping reason (≥ 24 chars)',
      type: 'textarea',
      required: true,
      help: 'Only the demanding line holder or a seat strictly above them may close an assigned duty.',
    },
  ], (values) => {
    const res = ctx.api.dutyMeansRetireDuty(duty.id, { reason: values.reason });
    if (!res?.ok) {
      toast(res?.error || 'Retirement refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Duty retired on the register.', 'good');
    onDone?.();
  }, { submitLabel: 'Retire duty' });

  openModal({ title: `Retire duty — ${duty.label}`, body: form });
}

/* ----------------------------------------------------------------- sections */

function summaryStrip(report, attentionCount) {
  const currencySummary = report.currencies.length
    ? report.currencies.map((c) => `${c.currency} ${formatDwmMoney(c.currency, c.unbackedShortfallCents).slice(4)}`).join(' · ')
    : 'no money shortfall';

  return card({
    title: 'Accountability–means parity snapshot',
    subtitle: 'Every figure is read directly from the single domain reader. Authority, currencies, and hours are never converted into one composite score.',
    body: h('div', { class: 'stat-grid' },
      stat({
        label: 'Live duties',
        value: h('span', { 'data-testid': 'dwm-count-duties' }, String(report.counts.dutiesLive)),
        hint: `${report.counts.dutiesRetired} retired · ${report.counts.requirementsLive} live requirements`,
      }),
      stat({
        label: 'Parity verified',
        value: h('span', { 'data-testid': 'dwm-count-backed' }, String(report.counts.verdicts['means-backed'] || 0)),
        hint: `${report.counts.verdicts['entrepreneurial-gap'] || 0} bounded entrepreneurial gap(s)`,
      }),
      stat({
        label: 'Cross-line locks',
        value: h('span', { 'data-testid': 'dwm-count-cross-line' }, String(report.gaps.crossLineLockedDutiesN)),
        hint: `${report.counts.crossLineRequirementsLive} cross-line requirement(s) in scope`,
      }),
      stat({
        label: 'Means declined / withdrawn',
        value: h('span', { 'data-testid': 'dwm-count-declined' }, String(report.gaps.meansDeclinedDutiesN)),
        hint: 'duty still live after controlling line said no or revoked',
      }),
      stat({
        label: 'Single-line shortfalls',
        value: h('span', { 'data-testid': 'dwm-count-shortfall' }, String(report.gaps.meansShortfallDutiesN)),
        hint: `${report.gaps.overdueUnansweredN} overdue unanswered · ${report.gaps.driftedRequirementsN} drifted`,
      }),
      stat({
        label: 'Unscoped duties',
        value: h('span', { 'data-testid': 'dwm-count-unscoped' }, String(report.gaps.dutiesWithoutRequirementsN)),
        hint: 'live duty with zero declared means requirements',
      }),
      stat({
        label: 'Unbacked money & hours',
        value: h('span', { 'data-testid': 'dwm-count-hours-shortfall' }, `${report.hours.unbackedShortfallHours} h`),
        hint: currencySummary,
      }),
      stat({
        label: 'Your owed decisions',
        value: h('span', { 'data-testid': 'dwm-count-attention' }, String(attentionCount)),
        hint: attentionCount ? 'open parity decision(s) addressed to your seat' : 'nothing currently owed by this seat',
      }),
    ),
  });
}

function claimsSection(report) {
  const c = report.claims;
  return h('div', { class: 'stack', 'data-testid': 'dwm-claims' },
    banner({
      tone: c.countsReconcile ? 'good' : 'bad',
      title: c.countsReconcile
        ? 'Counts reconcile: every duty verdict, requirement state, currency cent, hour, and authority right sums to the exact total'
        : 'Counts do not reconcile — check load warnings',
      body: `Claim 1 (arithmetic conservation only): ${report.counts.dutiesLive} live duty row(s), ${report.counts.requirementsLive} live requirement(s), ${report.currencies.length} currency ledger(s), ${report.hours.requiredHours} required hour(s), ${report.authority.requiredN} authority requirement(s).`,
    }),
    banner({
      tone: c.figuresComplete ? 'good' : 'caution',
      title: c.figuresComplete
        ? 'Figures complete: every live duty has verified standing on all required means and nothing is withheld'
        : 'NOT COMPLETE — arithmetic reconciles, but coverage or standing has open gaps',
      body: c.figuresComplete
        ? 'Claim 2 (separate from Claim 1): zero unscoped duties, zero unanswered or drifted means, zero orphan rows, and full carrier visibility at this seat.'
        : `Reasons: ${c.incompleteReasons.join(', ')}.`,
    }),
    (report.scope.dutiesOutsideScopeN > 0 || report.scope.carrierIdentityWithheldN > 0)
      ? banner({
        tone: 'caution',
        title: `Seat boundary active (${report.scope.dutiesInScopeN} duty row(s) in scope)`,
        body: `${report.scope.dutiesOutsideScopeN} duty row(s) belong to unrelated spans and are excluded; ${report.scope.carrierIdentityWithheldN} duty row(s) redact individual contributor identity above director altitude so executive governance targets line-to-line locks rather than individuals.`,
      })
      : null,
  );
}

function dutiesView(ctx, report, onDone) {
  const rows = report.duties.map((d) => ({
    ...d,
    attrs: {
      'data-testid': `dwm-duty-${d.id}`,
      'data-verdict': d.verdict,
      'data-status': d.status,
      'data-requirements-n': String(d.requirementsN),
    },
  }));

  const columns = [
    {
      label: 'Outcome duty',
      render: (d) => h('div', null,
        h('strong', null, d.label),
        h('div', { class: 'small muted' }, `${d.windowFrom} → ${d.windowTo} · ${d.sourceLabel}${d.sourceId ? ` (${d.sourceId})` : ''}`),
        d.outcomeBasis ? h('div', { class: 'small muted' }, d.outcomeBasis) : null),
    },
    {
      label: 'Carrier & demanding line',
      render: (d) => h('div', { class: 'small' },
        h('div', null, `Carrier: ${d.carrierIdentityWithheld ? 'withheld (executive altitude)' : d.carrierName}`),
        h('div', { class: 'muted' }, `Demanding line: ${d.demandingLineName}`)),
    },
    {
      label: 'Verdict',
      render: (d) => h('div', { class: 'stack gap-xs' },
        badge(d.status === 'retired' ? 'Retired' : d.verdictLabel, d.status === 'retired' ? 'neutral' : toneOf(d.verdictTone)),
        h('span', { class: 'small muted' }, `${d.simonsGap.backedPillarsN}/${d.simonsGap.accountabilityPillarsN} backed · ${d.simonsGap.crossLinePillarsN} cross-line`)),
    },
    {
      label: 'Joint-apex route',
      render: (d) => {
        if (d.status === 'retired' || d.verdict === 'means-backed' || d.verdict === 'pending-means') {
          return h('span', { class: 'small muted' }, '—');
        }
        if (d.verdict === 'unscoped-means') {
          return h('span', { class: 'small' }, `${d.demandingLineName} (declare means)`);
        }
        if (d.escalation.ok) {
          return h('span', { class: 'small' }, d.escalation.apexIds.join(', '));
        }
        return h('span', { class: 'small text-warn' }, `unaddressable (${d.escalation.reason})`);
      },
    },
    {
      label: 'Actions',
      render: (d) => (d.status === 'live'
        ? h('div', { class: 'row gap-s' },
          button('+ Means', () => addRequirementDialog(ctx, report, d.id, onDone), { testid: `dwm-add-req-${d.id}` }),
          button('Retire', () => retireDutyDialog(ctx, d, onDone), { testid: `dwm-retire-${d.id}` }))
        : h('span', { class: 'small muted' }, `retired ${d.retiredOn}`)),
    },
  ];

  return h('div', { class: 'stack', 'data-testid': 'dwm-duties-view' },
    h('div', { class: 'row gap-s' },
      button('Declare a duty', () => declareDutyDialog(ctx, onDone), { primary: true, testid: 'dwm-declare-duty' }),
      button('Add required means', () => addRequirementDialog(ctx, report, null, onDone), { testid: 'dwm-add-requirement' }),
      button('Scan parity rule', () => {
        const res = ctx.api.dutyMeansScan();
        if (!res?.ok) {
          toast(res?.error || 'Scan refused.', 'bad');
          return;
        }
        toast('RULE-DWM-01 parity scan completed.', 'good');
        onDone?.();
      }, { testid: 'dwm-scan' })),
    table({
      caption: 'Declared accountable duties, their demanding lines, Simons entrepreneurial-gap classification, and live parity verdict',
      columns,
      rows,
      emptyMessage: 'No accountable duty has been declared on this register yet.',
    }),
  );
}

function requirementsView(ctx, report, onDone) {
  const rows = report.requirements.map((r) => ({
    ...r,
    attrs: {
      'data-testid': `dwm-req-${r.id}`,
      'data-state': r.state,
      'data-pillar': r.pillar,
      'data-cross-line': r.crossLine ? '1' : '0',
      'data-required-cents': String(r.requiredCents ?? ''),
      'data-shortfall-cents': String(r.unbackedShortfallCents ?? ''),
      'data-required-hours': String(r.requiredHours ?? ''),
      'data-shortfall-hours': String(r.unbackedShortfallHours ?? ''),
    },
  }));

  const columns = [
    {
      label: 'Duty & pillar',
      render: (r) => h('div', null,
        h('strong', null, r.dutyLabel),
        h('div', { class: 'small muted' }, `${r.pillarLabel}${r.authorityScopeLabel ? ` · ${r.authorityScopeLabel}` : ''}`)),
    },
    {
      label: 'Lines (demanding → controlling)',
      render: (r) => h('div', { class: 'small' },
        h('div', null, `${r.demandingLineName} → ${r.controllingHolderName}`),
        h('div', { class: 'muted' }, `${r.structureKind}${r.declaredLineShareH !== null ? ` · declared line share ${r.declaredLineShareH}%` : ''}`)),
    },
    {
      label: 'Required',
      render: (r) => h('span', { class: 'small' }, reqQuantityText(r)),
    },
    {
      label: 'Unbacked shortfall',
      render: (r) => h('span', { class: 'small' }, reqShortfallText(r)),
    },
    {
      label: 'State & standing',
      render: (r) => h('div', { class: 'stack gap-xs' },
        badge(r.stateLabel, toneOf(r.stateTone)),
        r.governingAct
          ? h('span', { class: 'small muted' }, `${r.governingAct.state} by ${r.governingAct.byName} on ${r.governingAct.on}`)
          : h('span', { class: 'small muted' }, r.standingReason)),
    },
    {
      label: 'Actions',
      render: (r) => (r.dutyStatus === 'live'
        ? h('div', { class: 'row gap-s' },
          button('Supply / decline', () => recordActDialog(ctx, r, onDone), { testid: `dwm-act-${r.id}` }),
          button('Joint-apex gap', () => governGapDialog(ctx, r, onDone), { testid: `dwm-govern-${r.id}` }))
        : h('span', { class: 'small muted' }, 'retired')),
    },
  ];

  return h('div', { class: 'stack', 'data-testid': 'dwm-requirements-view' },
    table({
      caption: 'Required authority, budget, and protected-time pillars, who controls each one, and exact unbacked shortfall',
      columns,
      rows,
      emptyMessage: 'No means requirements have been declared yet.',
    }),
  );
}

function escalationsView(report) {
  return h('div', { class: 'stack', 'data-testid': 'dwm-escalations-view' },
    card({
      title: 'Live joint-apex escalations',
      subtitle: 'When a controlling line declines, withdraws, partially supplies, or drifts off a required means, escalation routes strictly above EVERY involved line (`matrixJointApex`) — never to the carrier and never to one peer line over another.',
      body: report.escalations.length
        ? table({
          caption: 'Duties requiring joint-apex resolution across demanding and controlling lines',
          columns: [
            { label: 'Duty', key: 'dutyLabel' },
            { label: 'Verdict', render: (e) => badge(e.verdictLabel, 'bad') },
            { label: 'Demanding line', key: 'demandingLineName' },
            {
              label: 'Controlling line(s)',
              render: (e) => h('span', { class: 'small' }, e.controllingHolders.map((c) => c.name).join(', ')),
            },
            {
              label: 'Joint apex addressee(s)',
              render: (e) => (e.jointApex.ok
                ? h('strong', null, e.apexNames.join(', '))
                : h('span', { class: 'small text-warn' }, `No joint apex (${e.jointApex.reason}) — identity-free marker recorded`)),
            },
          ],
          rows: report.escalations.map((e) => ({ ...e, attrs: { 'data-testid': `dwm-escalation-${e.dutyId}` } })),
          emptyMessage: 'No unresolved means gap requires joint-apex escalation.',
        })
        : emptyState({
          title: 'Zero unresolved joint-apex escalations',
          body: 'Every live duty in scope either has parity, is inside its initial response window, or has a joint-apex entrepreneurial-gap sign-off.',
        }),
    }),
    card({
      title: 'Currency conservation ledger (no FX pooling, no cross-requirement netting)',
      subtitle: 'For every currency: covered + accepted-gap + unbacked shortfall === required cents. Over-supplying one requirement never masks a shortfall on another.',
      body: table({
        caption: 'Exact integer cents per declared currency',
        columns: [
          { label: 'Currency', key: 'currency' },
          { label: 'Required', key: 'requiredDisplay' },
          { label: 'Covered', key: 'coveredDisplay' },
          { label: 'Accepted gap', key: 'acceptedGapDisplay' },
          { label: 'Unbacked shortfall', key: 'unbackedShortfallDisplay' },
        ],
        rows: report.currencies.map((c) => ({
          ...c,
          attrs: {
            'data-testid': `dwm-currency-${c.currency}`,
            'data-required-cents': String(c.requiredCents),
            'data-covered-cents': String(c.coveredCents),
            'data-accepted-gap-cents': String(c.acceptedGapCents),
            'data-shortfall-cents': String(c.unbackedShortfallCents),
          },
        })),
        emptyMessage: 'No money-bearing means requirements are live in scope.',
      }),
    }),
    card({
      title: 'Protected time & decision authority conservation',
      subtitle: 'Hours stay whole hours and authority stays discrete rights — neither is priced into fake dollars.',
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Hours required', value: `${report.hours.requiredHours} h`, hint: `${report.hours.coveredHours} h covered` }),
        stat({ label: 'Hours accepted gap', value: `${report.hours.acceptedGapHours} h`, hint: `${report.hours.unbackedShortfallHours} h unbacked shortfall` }),
        stat({ label: 'Authority required', value: String(report.authority.requiredN), hint: `${report.authority.coveredN} backed` }),
        stat({ label: 'Authority unbacked', value: String(report.authority.unbackedN), hint: `${report.authority.acceptedGapN} accepted gap` }),
      ),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'dwm-method-view' },
    card({
      title: 'Accountability–means parity & matrix joint-apex resolution',
      subtitle: 'When a demanding line assigns an outcome duty whose required authority, budget, or protected hours sit under another line, parity is tested per pillar and escalated strictly above both lines.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Architectural balance diagram: Joint Apex at top connected to Demanding Line on left holding Outcome Duty pan and Controlling Line on right holding Required Means pan with key, coin stack, and clock tokens, with upward escalation arrow to Joint Apex when out of parity.',
          class: 'figure-img',
          'data-testid': 'dwm-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'Generated method diagram — conceptual illustration, not workspace data.')),
    }),
    card({
      title: 'Cross-domain frameworks encoded',
      body: h('ul', { class: 'list' },
        ...DWM_FRAMEWORKS.map((f) => h('li', null, h('strong', null, `${f.citation}: `), f.principle))),
    }),
    card({
      title: 'What this register refuses by construction',
      body: h('ul', { class: 'list' },
        h('li', null, 'Never lets a demanding line promise another matrix line’s budget, decision authority, or protected hours.'),
        h('li', null, 'Never lets a carrier self-certify their own required means OR unilaterally retire an assigned duty.'),
        h('li', null, 'Never pools currencies, converts hours into money, or lets over-supply on one requirement hide a shortfall on another.'),
        h('li', null, 'Never invents an allocation from reporting-line share percentages (`shareH` is printed as context only).'),
        h('li', null, 'Never scores, ranks, or blames the carrier for an unresourced mandate.')),
    }),
  );
}

export function renderDutyMeans(ctx) {
  const report = ctx.api.dutyMeansReport ? ctx.api.dutyMeansReport() : null;
  if (!report || report.ok === false || !report.claims) {
    return h('div', { class: 'page' },
      pageHeader({
        eyebrow: 'Frontline / mid-manager · single-chain and matrix',
        title: 'Duty-without-means register',
        subtitle: 'Does every accountable duty carry the authority, budget, and protected hours required to deliver it?',
      }),
      banner({
        tone: 'bad',
        title: 'The register could not be read',
        body: report?.error || 'Resolve a valid operating seat to read this register.',
      }));
  }

  const requested = ctx.query?.get?.('view');
  const activeTab = VIEWS.some((v) => v.key === requested) ? requested : 'duties';
  const attention = ctx.api.dutyMeansAttentionCount ? ctx.api.dutyMeansAttentionCount() : 0;
  const onDone = () => ctx.refresh?.();

  return h('div', { class: 'page', 'data-testid': 'duty-means-panel' },
    pageHeader({
      eyebrow: 'Frontline / mid-manager · single-chain and matrix',
      title: 'Does every accountable duty carry the means required to deliver it?',
      subtitle: 'Frontline supervisors and mid-managers put outcome duties and their required authority, budget, and protected hours on the record. Only the line that controls each means can supply or decline it; unresolved locks escalate to the joint apex above both lines.',
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
        count: v.key === 'duties' ? report.counts.dutiesLive
          : v.key === 'requirements' ? report.counts.requirementsLive
            : v.key === 'escalations' ? report.counts.escalationsLive
              : undefined,
      })),
      active: activeTab,
      ariaLabel: 'Duty-without-means register views',
      onSelect: (key) => ctx.navigate(`${DWM_ROUTE}?view=${key}`),
    }),
    activeTab === 'duties' ? dutiesView(ctx, report, onDone) : null,
    activeTab === 'requirements' ? requirementsView(ctx, report, onDone) : null,
    activeTab === 'escalations' ? escalationsView(report) : null,
    activeTab === 'method' ? methodView() : null,
    h('p', { class: 'small muted' }, `Engine ${report.engineVersion} · rule ${report.ruleId} · as of ${report.asOf} · response window ${report.conventions.dutyMeansResponseDays} day(s).`),
  );
}

export default renderDutyMeans;
