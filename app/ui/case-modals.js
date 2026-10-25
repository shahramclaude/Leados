/**
 * app/ui/case-modals.js — Cross-domain Operational Case dialogs.
 *
 * Provides interactive, WCAG-accessible capture and update dialogs for:
 *  - Registering or editing an Operational Case (`openCaseDialog`) with live
 *    FMEA RPN + AIAG-VDA Action Priority calculation, live 3-point PERT
 *    expected-value & risk-adjusted ROI readout, 5-Whys / Swiss-Cheese
 *    blameless framing guidance, Mendelow Power × Interest stakeholder rows,
 *    and a real-time Cross-Module Parallel Propagation Preview.
 *  - Logging stakeholder coalition briefs (`openCaseStakeholderCommsDialog`).
 *  - Resolving / closing a case with residual FMEA verification
 *    (`openResolveCaseDialog`).
 *  - Manually linking existing workspace entities (`openLinkCaseEntityDialog`).
 */

import { h, openModal, buildForm, toast, uid } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import { personOptions, goalOptions } from './options.js';
import {
  CASE_KINDS,
  CASE_KIND_LABELS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  LINK_RELATIONS,
  LINK_RELATION_LABELS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_CADENCE_LABELS,
  STAKEHOLDER_STANCES,
  STAKEHOLDER_STANCE_LABELS,
  classifyMendelowStakeholder,
  computeFmea,
  computePertImpact,
  evaluateRca,
} from '../core/domain/cases.js';
import { previewCasePropagations } from '../core/domain/automation.js';

function modalFooter(form, { submitLabel = 'Save', cancelLabel = 'Cancel', onClose } = {}) {
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, cancelLabel);
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__submit() }, submitLabel);
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    form.__submit();
  });
  return [cancelBtn, submitBtn];
}

function buildStakeholderEditor(initialStakeholders = [], todayStr, onChange) {
  const rows = [];
  const listNode = h('div', { class: 'stack-sm', 'data-case-stakeholders': 'true' });

  function readStakeholders() {
    return rows
      .filter((r) => !r.removed)
      .map((r) => ({
        id: r.id,
        name: r.nameInput.value.trim(),
        role: r.roleInput.value.trim(),
        power: Number(r.powerSelect.value) || 3,
        interest: Number(r.interestSelect.value) || 3,
        stance: r.stanceSelect.value || 'neutral',
        nextCommsOn: r.nextCommsInput.value || null,
        lastCommsOn: r.lastCommsOn || null,
        commsCadence: r.commsCadence || '',
        keyMessage: r.msgInput.value.trim(),
      }))
      .filter((s) => s.name);
  }

  function addRow(seed = {}) {
    const rowUid = uid('stk');
    const rowState = {
      id: seed.id || '',
      lastCommsOn: seed.lastCommsOn || null,
      commsCadence: seed.commsCadence || '',
      removed: false,
    };

    const nameInput = h('input', {
      id: `${rowUid}-name`,
      type: 'text',
      placeholder: 'VP Customer Success / Finance Ops',
      value: seed.name || '',
    });
    const roleInput = h('input', {
      id: `${rowUid}-role`,
      type: 'text',
      placeholder: 'Approver / Gatekeeper / Pod lead',
      value: seed.role || '',
    });
    const powerSelect = h(
      'select',
      { id: `${rowUid}-power` },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    powerSelect.value = String(seed.power || 3);

    const interestSelect = h(
      'select',
      { id: `${rowUid}-interest` },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    interestSelect.value = String(seed.interest || 3);

    const stanceSelect = h(
      'select',
      { id: `${rowUid}-stance` },
      ...STAKEHOLDER_STANCES.map((s) => h('option', { value: s }, STAKEHOLDER_STANCE_LABELS[s])),
    );
    stanceSelect.value = STAKEHOLDER_STANCES.includes(seed.stance) ? seed.stance : 'neutral';

    const nextCommsInput = h('input', {
      id: `${rowUid}-next`,
      type: 'date',
      value: seed.nextCommsOn || '',
    });

    const msgInput = h('input', {
      id: `${rowUid}-msg`,
      type: 'text',
      placeholder: 'Key alignment point, risk boundary, or ask',
      value: seed.keyMessage || '',
    });

    const quadrantBadge = h('span', { class: 'pill pill-neutral' }, '');
    const refreshBadge = () => {
      const info = classifyMendelowStakeholder(
        {
          power: Number(powerSelect.value),
          interest: Number(interestSelect.value),
          stance: stanceSelect.value,
        },
        todayStr,
      );
      quadrantBadge.textContent = `${info.quadrantLabel} (${info.quadrantSubtitle})`;
      quadrantBadge.className = `pill ${
        info.quadrant === 'manage-closely'
          ? 'pill-warn'
          : info.quadrant === 'keep-satisfied'
            ? 'pill-info'
            : 'pill-neutral'
      }`;
      if (onChange) onChange();
    };

    for (const ctrl of [nameInput, roleInput, powerSelect, interestSelect, stanceSelect, nextCommsInput, msgInput]) {
      ctrl.addEventListener('input', refreshBadge);
      ctrl.addEventListener('change', refreshBadge);
    }

    const rowEl = h(
      'div',
      { class: 'case-stakeholder-editor-row' },
      h(
        'div',
        { class: 'row-between' },
        quadrantBadge,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost btn-sm',
            'aria-label': `Remove stakeholder row`,
            onClick: () => {
              rowState.removed = true;
              rowEl.remove();
              if (onChange) onChange();
            },
          },
          'Remove',
        ),
      ),
      h(
        'div',
        { class: 'case-stakeholder-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-name` }, 'Stakeholder name'), nameInput),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-role` }, 'Role / group'), roleInput),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-power` }, 'Power (1–5)'), powerSelect),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-interest` }, 'Interest (1–5)'), interestSelect),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-stance` }, 'Stance'), stanceSelect),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-next` }, 'Next comms (blank = auto)'), nextCommsInput),
      ),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: `${rowUid}-msg` }, 'Key message / negotiation framing'), msgInput),
    );

    Object.assign(rowState, {
      nameInput,
      roleInput,
      powerSelect,
      interestSelect,
      stanceSelect,
      nextCommsInput,
      msgInput,
    });
    rows.push(rowState);
    listNode.appendChild(rowEl);
    refreshBadge();
  }

  for (const s of initialStakeholders) addRow(s);

  const addBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary btn-sm',
      onClick: () => addRow({ power: 4, interest: 4, stance: 'neutral' }),
    },
    '+ Add stakeholder to coalition map',
  );

  const root = h('div', { class: 'stack-sm' }, listNode, h('div', null, addBtn));
  return { node: root, getStakeholders: readStakeholders, addRow };
}

export function openCaseDialog(ctx, { caseRecord = null, prefill = null, onSaved = null } = {}) {
  const isEdit = Boolean(caseRecord);
  const seed = caseRecord || prefill || {};
  const todayStr = dayKey(ctx.now);
  const defaultReviewDays = ctx.state.settings?.caseReviewDays ?? 14;

  const peopleOpts = [
    { value: '', label: 'Unassigned (leader-held)' },
    ...personOptions(ctx.state, { includeArchived: isEdit }),
  ];
  const activePeopleOpts = personOptions(ctx.state);
  const goalsOpts = [
    { value: '', label: 'No linked goal' },
    ...goalOptions(ctx.state),
  ];

  const fmeaLiveNode = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });
  const pertLiveNode = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });
  const rcaLiveNode = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });
  const propagationPreviewNode = h('div', { class: 'case-propagation-preview', 'aria-live': 'polite' });

  let refreshLiveReadouts = () => {};
  const stakeholderEditor = buildStakeholderEditor(
    seed.stakeholders || [],
    todayStr,
    () => refreshLiveReadouts(),
  );

  const form = buildForm([
    {
      name: 'title',
      label: 'Case title',
      required: true,
      wide: true,
      value: seed.title || '',
      placeholder: 'Billing ledger cutover reconciliation drift',
    },
    {
      name: 'kind',
      label: 'Case type',
      type: 'select',
      value: seed.kind || 'risk',
      options: CASE_KINDS.map((k) => ({ value: k, label: CASE_KIND_LABELS[k] })),
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      value: seed.status || 'open',
      options: CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] })),
    },
    {
      name: 'ownerId',
      label: 'Accountable owner',
      type: 'select',
      value: seed.ownerId || '',
      options: peopleOpts,
      help: 'Active owner receives accountable mitigation delegation and 1:1 support prep.',
    },
    {
      name: 'linkedGoalId',
      label: 'Impacted OKR / goal',
      type: 'select',
      value: seed.linkedGoalId || '',
      options: goalsOpts,
      help: 'High-priority cases automatically flag on-track goals as at-risk with an audit check-in.',
    },
    {
      name: 'openedOn',
      label: 'Opened date',
      type: 'date',
      value: seed.openedOn || todayStr,
    },
    {
      name: 'reviewOn',
      label: 'Next case review date',
      type: 'date',
      value: seed.reviewOn !== undefined ? (seed.reviewOn || '') : addDays(todayStr, defaultReviewDays),
    },
    {
      name: 'summary',
      label: 'Operational context & scope',
      type: 'textarea',
      rows: 2,
      wide: true,
      value: seed.summary || '',
      placeholder: 'What happened or what is threatened, who is affected, and what decision window applies?',
    },
    ...(activePeopleOpts.length
      ? [
          {
            name: 'involvedPersonIds',
            label: 'Involved team members (blameless 1:1 support & load check)',
            type: 'boolean-block',
            wide: true,
            options: activePeopleOpts,
            value: seed.involvedPersonIds || [],
            help: 'Queues a supportive barrier/capacity topic for their next 1:1. Never enters performance ratings.',
          },
        ]
      : []),

    { type: 'divider', label: 'Engineering & Quality — FMEA Risk Profile (AIAG-VDA 1–10)' },
    {
      name: 'severity',
      label: 'Severity (1–10)',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      value: seed.fmea?.severity ?? 6,
      help: '1 = minor annoyance · 10 = severe customer/safety/compliance harm.',
    },
    {
      name: 'probability',
      label: 'Probability / occurrence (1–10)',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      value: seed.fmea?.probability ?? 5,
      help: '1 = remote · 10 = near-certain or recurring.',
    },
    {
      name: 'detectability',
      label: 'Detection gap (1–10)',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      value: seed.fmea?.detectability ?? 5,
      help: '1 = automated pre-impact halt · 10 = undetected until customer harm.',
    },
    {
      name: 'failureMode',
      label: 'Failure mode',
      value: seed.fmea?.failureMode || '',
      placeholder: 'How the process or system fails',
    },
    {
      name: 'effect',
      label: 'Downstream effect',
      value: seed.fmea?.effect || '',
      placeholder: 'Customer, SLA, team load, or financial consequence',
    },
    {
      name: 'controls',
      label: 'Current detection / prevention controls',
      value: seed.fmea?.controls || '',
      placeholder: 'Existing alerts, reviews, or manual checks',
    },
    { type: 'static', wide: true, value: fmeaLiveNode },

    { type: 'divider', label: 'Finance & Economics — 3-Point PERT Exposure & Opportunity Cost' },
    {
      name: 'currency',
      label: 'Currency',
      type: 'select',
      value: seed.financial?.currency || 'USD',
      options: [
        { value: 'USD', label: 'USD ($)' },
        { value: 'EUR', label: 'EUR (€)' },
        { value: 'DKK', label: 'DKK (kr)' },
        { value: 'GBP', label: 'GBP (£)' },
      ],
    },
    {
      name: 'mitigationCost',
      label: 'Mitigation investment cost',
      type: 'number',
      min: 0,
      step: 100,
      value: seed.financial?.mitigationCost ?? 0,
      help: 'Direct cost of tooling, contractor, stipend, or control.',
    },
    {
      name: 'optimistic',
      label: 'Optimistic impact (O)',
      type: 'number',
      min: 0,
      step: 100,
      value: seed.financial?.optimistic ?? 0,
    },
    {
      name: 'mostLikely',
      label: 'Most likely impact (M)',
      type: 'number',
      min: 0,
      step: 100,
      value: seed.financial?.mostLikely ?? 0,
    },
    {
      name: 'pessimistic',
      label: 'Pessimistic tail impact (P)',
      type: 'number',
      min: 0,
      step: 100,
      value: seed.financial?.pessimistic ?? 0,
    },
    {
      name: 'capacityDaysOptimistic',
      label: 'Team capacity days (Optimistic)',
      type: 'number',
      min: 0,
      step: 0.5,
      value: seed.financial?.capacityDaysOptimistic ?? 0,
    },
    {
      name: 'capacityDaysMostLikely',
      label: 'Team capacity days (Most likely)',
      type: 'number',
      min: 0,
      step: 0.5,
      value: seed.financial?.capacityDaysMostLikely ?? 0,
    },
    {
      name: 'capacityDaysPessimistic',
      label: 'Team capacity days (Pessimistic)',
      type: 'number',
      min: 0,
      step: 0.5,
      value: seed.financial?.capacityDaysPessimistic ?? 0,
    },
    {
      name: 'opportunityCost',
      label: 'Explicit opportunity cost (what roadmap work pauses?)',
      wide: true,
      value: seed.financial?.opportunityCost || '',
      placeholder: 'Name what gets deferred so the team is not asked to absorb unplanned work for free.',
    },
    { type: 'static', wide: true, value: pertLiveNode },

    { type: 'divider', label: 'Systems Thinking — 5-Whys & Swiss-Cheese Systemic Root Cause' },
    {
      name: 'problemStatement',
      label: 'Observable problem statement',
      wide: true,
      value: seed.rca?.problemStatement || '',
      placeholder: 'Fact-based statement of what deviated from expected behaviour',
    },
    {
      name: 'whysText',
      label: '5-Whys causal chain (one "Why" per line)',
      type: 'textarea',
      rows: 3,
      wide: true,
      value: (seed.rca?.whys || []).join('\n'),
      placeholder: 'Why 1: ...\nWhy 2: ...\nWhy 3: ...',
    },
    {
      name: 'rootCause',
      label: 'Systemic root cause',
      value: seed.rca?.rootCause || '',
      placeholder: 'Latent design, contract, or capacity gap',
    },
    {
      name: 'systemicBarrier',
      label: 'Swiss-Cheese guardrail / barrier to add',
      value: seed.rca?.systemicBarrier || '',
      placeholder: 'Automated gate, invariant check, or rota redundancy',
    },
    {
      name: 'preventiveAction',
      label: 'Concrete preventive / mitigation action',
      wide: true,
      value: seed.rca?.preventiveAction || '',
      placeholder: 'Specific deliverable that closes the systemic gap (populates accountable delegation)',
    },
    { type: 'static', wide: true, value: rcaLiveNode },

    { type: 'divider', label: 'Political Science & Strategy — Mendelow Power × Interest Coalition' },
    {
      type: 'static',
      wide: true,
      label: 'Stakeholders & coalition stance',
      value: stakeholderEditor.node,
      help: 'Power (1–5) × Interest (1–5) classifies stakeholders into Manage Closely, Keep Satisfied, Keep Informed, or Monitor.',
    },

    { type: 'divider', label: 'Event-Driven Cross-Module Automation' },
    {
      name: 'autoPropagate',
      label: 'Cross-module automation',
      checkboxLabel: 'Automatically create, update, and link affected Decisions, Mitigation Delegations, Goals, Stakeholder schedules & 1:1 Coaching in parallel',
      type: 'checkbox',
      wide: true,
      value: seed.autoPropagate !== false,
    },
    {
      type: 'static',
      wide: true,
      label: 'Live parallel propagation preview',
      value: propagationPreviewNode,
    },
  ]);

  function assembleDraftPayload(vals) {
    return {
      title: vals.title,
      kind: vals.kind,
      status: vals.status,
      ownerId: vals.ownerId || null,
      involvedPersonIds: vals.involvedPersonIds || [],
      linkedGoalId: vals.linkedGoalId || null,
      openedOn: vals.openedOn,
      reviewOn: vals.reviewOn || null,
      summary: vals.summary,
      fmea: {
        severity: vals.severity,
        probability: vals.probability,
        detectability: vals.detectability,
        failureMode: vals.failureMode,
        effect: vals.effect,
        controls: vals.controls,
      },
      financial: {
        currency: vals.currency || 'USD',
        optimistic: vals.optimistic,
        mostLikely: vals.mostLikely,
        pessimistic: vals.pessimistic,
        mitigationCost: vals.mitigationCost,
        capacityDaysOptimistic: vals.capacityDaysOptimistic,
        capacityDaysMostLikely: vals.capacityDaysMostLikely,
        capacityDaysPessimistic: vals.capacityDaysPessimistic,
        opportunityCost: vals.opportunityCost,
      },
      rca: {
        problemStatement: vals.problemStatement,
        whys: String(vals.whysText || '')
          .split('\n')
          .map((line) => line.replace(/^why\s*\d*\s*:\s*/i, '').trim())
          .filter(Boolean),
        rootCause: vals.rootCause,
        systemicBarrier: vals.systemicBarrier,
        preventiveAction: vals.preventiveAction,
      },
      stakeholders: stakeholderEditor.getStakeholders(),
      autoPropagate: Boolean(vals.autoPropagate),
      ...(prefill?._upstreamLink ? { _upstreamLink: prefill._upstreamLink } : {}),
    };
  }

  refreshLiveReadouts = () => {
    const vals = form.getValues();
    const draftPayload = assembleDraftPayload(vals);
    const fmea = computeFmea(draftPayload.fmea);
    const pert = computePertImpact(draftPayload.financial, fmea);
    const rca = evaluateRca(draftPayload.rca, draftPayload.kind);

    fmeaLiveNode.textContent = '';
    fmeaLiveNode.append(
      h(
        'div',
        { class: 'row-between' },
        h('strong', null, `FMEA RPN: ${fmea.rpn} / 1000`),
        h(
          'span',
          {
            class: `pill ${fmea.actionPriority === 'high' ? 'pill-bad' : fmea.actionPriority === 'medium' ? 'pill-warn' : 'pill-good'}`,
          },
          `AIAG-VDA Action Priority: ${fmea.actionPriority.toUpperCase()}`,
        ),
      ),
      h('p', { class: 'muted small' }, fmea.drivers.join(' · ')),
    );

    pertLiveNode.textContent = '';
    if (pert.hasFinancialEstimate || pert.hasCapacityEstimate) {
      const roiText = pert.mitigationRoi !== null
        ? `Risk-adjusted ROI: ${(pert.mitigationRoi * 100).toFixed(0)}% (Net value ${pert.currency} ${pert.netRiskAdjustedValue.toLocaleString('en-US')})`
        : pert.hasFinancialEstimate
          ? `Expected unmitigated loss: ${pert.currency} ${pert.expectedUnmitigatedLoss.toLocaleString('en-US')} (enter mitigation cost to compute ROI)`
          : 'No financial exposure entered.';
      pertLiveNode.append(
        h(
          'div',
          { class: 'stack-xs' },
          pert.hasFinancialEstimate
            ? h(
                'div',
                null,
                h('strong', null, `PERT Expected Exposure: ${pert.currency} ${pert.cost.expected.toLocaleString('en-US')} `),
                h('span', { class: 'muted small' }, `(P10 ${pert.cost.p10.toLocaleString('en-US')} – P90 ${pert.cost.p90.toLocaleString('en-US')}, σ = ${pert.cost.stdDev.toLocaleString('en-US')})`),
              )
            : null,
          h('div', { class: 'small' }, roiText),
          pert.hasCapacityEstimate
            ? h(
                'div',
                { class: 'muted small' },
                `PERT Diverted Capacity: ${pert.capacity.expected} person-days expected (P90 ${pert.capacity.p90}d, σ = ${pert.capacity.stdDev}d)`,
              )
            : null,
        ),
      );
    } else {
      pertLiveNode.append(
        h('span', { class: 'muted small' }, 'Enter 3-point PERT financial or capacity-day estimates to compute expected value, P10–P90 confidence intervals, and mitigation ROI.'),
      );
    }

    rcaLiveNode.textContent = '';
    rcaLiveNode.append(
      h('div', { class: 'small' }, `Systemic RCA completeness: ${rca.completenessPct}% (${rca.whyDepth} Why step${rca.whyDepth === 1 ? '' : 's'} recorded)`),
      rca.blameWarning ? h('p', { class: 'small text-warn' }, rca.blameWarning) : null,
    );

    propagationPreviewNode.textContent = '';
    if (!draftPayload.autoPropagate) {
      propagationPreviewNode.append(
        h('p', { class: 'muted small' }, 'Auto-propagation is paused for this save. Only the Operational Case record will be written.'),
      );
    } else {
      const previews = previewCasePropagations(draftPayload, ctx.state, {
        now: ctx.now,
        existingCaseId: caseRecord?.id || null,
      });
      if (!previews.length) {
        propagationPreviewNode.append(
          h('p', { class: 'muted small' }, 'No new downstream records needed yet — assign an owner, link a goal, add stakeholders, or raise FMEA priority to trigger parallel rules.'),
        );
      } else {
        propagationPreviewNode.append(
          h(
            'ul',
            { class: 'case-preview-list' },
            ...previews.map((item) =>
              h(
                'li',
                { class: 'case-preview-item' },
                h(
                  'div',
                  { class: 'row-between' },
                  h('strong', { class: 'small' }, `${item.targetModule}: ${item.summary}`),
                  h('span', { class: 'pill pill-info' }, item.ruleId),
                ),
                h('p', { class: 'muted small' }, item.detail),
              ),
            ),
          ),
        );
      }
    }
  };

  form.node.addEventListener('input', refreshLiveReadouts);
  form.node.addEventListener('change', refreshLiveReadouts);
  refreshLiveReadouts();

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const payload = assembleDraftPayload(form.getValues());
    const res = isEdit
      ? ctx.api.updateCase(caseRecord.id, payload)
      : ctx.api.addCase(payload);
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    const propCount = (res.propagations || []).length;
    const suffix = propCount > 0
      ? ` — ${propCount} parallel cross-module update${propCount === 1 ? '' : 's'} applied`
      : '';
    toast(`${isEdit ? 'Operational case updated' : 'Operational case registered'}${suffix}.`, 'good');
    closeFn();
    if (onSaved) onSaved(res);
  };

  const dialog = openModal({
    title: isEdit ? `Edit case: ${caseRecord.title}` : 'Register operational case',
    description:
      'Capture the operational risk, incident, or initiative once — LeadOS computes FMEA priority, 3-point PERT expected value, and Mendelow coalition strategy, then updates connected modules in parallel.',
    body: form.node,
    footer: modalFooter(form, {
      submitLabel: isEdit ? 'Save case' : 'Register case',
      onClose: () => closeFn(),
    }),
    size: 'lg',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

export function openCaseStakeholderCommsDialog(ctx, caseRecord, stakeholder) {
  const todayStr = dayKey(ctx.now);
  const classified = classifyMendelowStakeholder(stakeholder, todayStr);
  const defaultNextOffset = classified.quadrant === 'manage-closely' ? 7 : classified.quadrant === 'keep-satisfied' ? 14 : 21;

  const form = buildForm([
    {
      type: 'static',
      wide: true,
      value: h(
        'div',
        { class: 'callout callout-subtle' },
        h('strong', null, `${classified.name}${classified.role ? ` — ${classified.role}` : ''}`),
        h('p', { class: 'muted small' }, `${classified.quadrantLabel} (${classified.quadrantSubtitle}): ${classified.guidance}`),
      ),
    },
    {
      name: 'date',
      label: 'Briefing / communication date',
      type: 'date',
      required: true,
      value: todayStr,
    },
    {
      name: 'stance',
      label: 'Updated coalition stance',
      type: 'select',
      value: classified.stance,
      options: STAKEHOLDER_STANCES.map((s) => ({ value: s, label: STAKEHOLDER_STANCE_LABELS[s] })),
    },
    {
      name: 'commsCadence',
      label: 'Cadence',
      type: 'select',
      value: classified.commsCadence,
      options: STAKEHOLDER_CADENCES.map((c) => ({ value: c, label: STAKEHOLDER_CADENCE_LABELS[c] })),
    },
    {
      name: 'nextCommsOn',
      label: 'Next scheduled checkpoint',
      type: 'date',
      value: addDays(todayStr, defaultNextOffset),
    },
    {
      name: 'keyMessage',
      label: 'Alignment summary & commitments',
      type: 'textarea',
      rows: 3,
      required: true,
      wide: true,
      value: classified.keyMessage || '',
      placeholder: 'What trade-offs were agreed, what concerns remain, and what will be shared next?',
    },
  ]);

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const vals = form.getValues();
    const res = ctx.api.logCaseStakeholderComms(caseRecord.id, stakeholder.id, vals);
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    toast(`Logged stakeholder brief with ${stakeholder.name}.`, 'good');
    closeFn();
  };

  const dialog = openModal({
    title: `Log stakeholder brief: ${stakeholder.name}`,
    description: `Update coalition alignment and schedule the next checkpoint on "${caseRecord.title}".`,
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Record brief', onClose: () => closeFn() }),
    size: 'md',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

export function openResolveCaseDialog(ctx, caseRecord) {
  const todayStr = dayKey(ctx.now);
  const preFmea = computeFmea(caseRecord.fmea);
  const residualLive = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });

  const form = buildForm([
    {
      name: 'status',
      label: 'Resolution state',
      type: 'select',
      value: 'resolved',
      options: [
        { value: 'resolved', label: 'Resolved (verified guardrail in place)' },
        { value: 'closed', label: 'Closed (retired / superseded)' },
      ],
    },
    {
      name: 'resolvedOn',
      label: 'Resolved date',
      type: 'date',
      required: true,
      value: todayStr,
    },
    {
      name: 'systemicBarrier',
      label: 'Verified Swiss-Cheese systemic barrier',
      wide: true,
      value: caseRecord.rca?.systemicBarrier || '',
      placeholder: 'Which process or automated guardrail now prevents recurrence?',
    },
    { type: 'divider', label: `Post-Mitigation Residual FMEA (Pre-mitigation RPN: ${preFmea.rpn})` },
    {
      name: 'residualSeverity',
      label: 'Residual severity (1–10)',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      value: caseRecord.fmea?.residualSeverity ?? preFmea.severity,
    },
    {
      name: 'residualProbability',
      label: 'Residual probability (1–10)',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      value: caseRecord.fmea?.residualProbability ?? Math.max(1, Math.min(preFmea.probability, 2)),
    },
    {
      name: 'residualDetectability',
      label: 'Residual detection gap (1–10)',
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      value: caseRecord.fmea?.residualDetectability ?? Math.max(1, Math.min(preFmea.detectability, 2)),
    },
    { type: 'static', wide: true, value: residualLive },
    {
      name: 'resolutionNotes',
      label: 'Resolution outcome & blameless learning summary',
      type: 'textarea',
      rows: 3,
      required: true,
      wide: true,
      value: caseRecord.resolutionNotes || '',
      placeholder: 'What changed, how residual risk was verified, and what follow-up applies to linked goals.',
    },
  ]);

  const updateResidualReadout = () => {
    const vals = form.getValues();
    const full = computeFmea({
      ...caseRecord.fmea,
      residualSeverity: vals.residualSeverity,
      residualProbability: vals.residualProbability,
      residualDetectability: vals.residualDetectability,
    });
    residualLive.textContent = '';
    if (full.hasResidual) {
      residualLive.append(
        h(
          'span',
          { class: 'small' },
          `Residual RPN: ${full.residualRpn} (${full.residualActionPriority.toUpperCase()} priority) — ${full.rpnReductionPct}% RPN reduction from ${full.rpn}.`,
        ),
      );
    }
  };
  form.node.addEventListener('input', updateResidualReadout);
  form.node.addEventListener('change', updateResidualReadout);
  updateResidualReadout();

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const res = ctx.api.resolveCase(caseRecord.id, form.getValues());
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    toast('Operational case resolved and linked goal check-in updated.', 'good');
    closeFn();
  };

  const dialog = openModal({
    title: `Resolve case: ${caseRecord.title}`,
    description: 'Verify the post-mitigation residual risk and record the systemic guardrail that holds the fix.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Resolve case', onClose: () => closeFn() }),
    size: 'md',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

export function openLinkCaseEntityDialog(ctx, caseRecord) {
  const candidatesByType = {
    decision: (ctx.state.decisions || []).map((d) => ({ value: d.id, label: d.title })),
    delegation: (ctx.state.delegations || []).map((d) => ({ value: d.id, label: d.title })),
    goal: (ctx.state.goals || []).map((g) => ({ value: g.id, label: g.title })),
    growth: (ctx.state.growthPlans || []).map((g) => ({ value: g.id, label: g.goal })),
    person: personOptions(ctx.state),
  };

  const initialType = 'decision';
  const form = buildForm([
    {
      name: 'targetType',
      label: 'Module',
      type: 'select',
      value: initialType,
      options: [
        { value: 'decision', label: 'Decision (DACI)' },
        { value: 'delegation', label: 'Delegation' },
        { value: 'goal', label: 'Goal / OKR' },
        { value: 'growth', label: 'Development plan (GROW)' },
        { value: 'person', label: 'Team member (1:1 coaching)' },
      ],
    },
    {
      name: 'targetId',
      label: 'Record',
      type: 'select',
      value: candidatesByType[initialType][0]?.value || '',
      options: candidatesByType[initialType].length
        ? candidatesByType[initialType]
        : [{ value: '', label: 'No records in this module yet' }],
    },
    {
      name: 'relation',
      label: 'Relationship type',
      type: 'select',
      value: 'decides',
      options: LINK_RELATIONS.map((r) => ({ value: r, label: LINK_RELATION_LABELS[r] })),
    },
    {
      name: 'summary',
      label: 'Why these records are connected',
      wide: true,
      placeholder: 'Optional note explaining the cross-module dependency',
    },
  ]);

  const typeSelect = form.field('targetType');
  const idSelect = form.field('targetId');
  const relSelect = form.field('relation');
  const defaultRelByType = {
    decision: 'decides',
    delegation: 'mitigates',
    goal: 'impacts-goal',
    growth: 'develops',
    person: 'coaches',
  };

  typeSelect.addEventListener('change', () => {
    const t = typeSelect.value;
    const opts = candidatesByType[t] || [];
    idSelect.textContent = '';
    if (!opts.length) {
      idSelect.appendChild(h('option', { value: '' }, 'No records in this module yet'));
    } else {
      for (const opt of opts) idSelect.appendChild(h('option', { value: opt.value }, opt.label));
      idSelect.value = opts[0].value;
    }
    if (defaultRelByType[t]) relSelect.value = defaultRelByType[t];
  });

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const res = ctx.api.linkCaseEntity(caseRecord.id, form.getValues());
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    toast('Cross-module link recorded.', 'good');
    closeFn();
  };

  const dialog = openModal({
    title: 'Link connected record',
    description: `Connect "${caseRecord.title}" to an existing record in LeadOS. Confidential conflicts and anonymous pulses are excluded by design.`,
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Link record', onClose: () => closeFn() }),
    size: 'md',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}
