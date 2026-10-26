/**
 * app/ui/negotiation-modals.js — Negotiation Workbench dialogs.
 *
 * Capture forms for the Schema v23 negotiation collection:
 *  - openNegotiationDialog: register/edit with a dynamic measurable-issue
 *    editor, live Fisher & Ury prep completeness and Raiffa ZOPA readouts,
 *    and a dry-run cross-module propagation preview (RULE-NEG-01/02/03).
 *  - openNegotiationAgreementDialog: record agreed terms, each with an
 *    optional roster owner and due date; ownerless terms are allowed and
 *    surfaced as ownership gaps rather than silently assigned.
 *
 * All writes go through ctx.api; this layer never touches the store.
 */

import { h, openModal, buildForm, toast, uid } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import { personOptions, goalOptions } from './options.js';
import {
  ESTIMATE_CONFIDENCE,
  ESTIMATE_CONFIDENCE_LABELS,
  NEGOTIATION_ISSUE_DIRECTIONS,
  NEGOTIATION_ISSUE_DIRECTION_LABELS,
  NEGOTIATION_KIND_LABELS,
  NEGOTIATION_KINDS,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUSES,
  analyzeNegotiationIssue,
  evaluateNegotiationPrep,
} from '../core/domain/negotiation.js';
import { previewNegotiationPropagations } from '../core/domain/automation.js';

function modalFooter(form, { submitLabel = 'Save', onClose } = {}) {
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, 'Cancel');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__submit() }, submitLabel);
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    form.__submit();
  });
  return [cancelBtn, submitBtn];
}

function linesFromText(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Dynamic editor for measurable issues (reservation prices and ZOPA inputs). */
function buildIssueEditor(initialIssues = [], onChange) {
  const rows = [];
  const listNode = h('div', { class: 'stack-sm', 'data-neg-issues': 'true' });

  function readIssues() {
    return rows
      .filter((r) => !r.removed)
      .map((r) => ({
        id: r.id,
        name: r.inputs.name.value.trim(),
        unit: r.inputs.unit.value.trim(),
        direction: r.inputs.direction.value,
        weight: Number(r.inputs.weight.value) || 3,
        ourReservation: r.inputs.ourReservation.value === '' ? null : Number(r.inputs.ourReservation.value),
        ourTarget: r.inputs.ourTarget.value === '' ? null : Number(r.inputs.ourTarget.value),
        theirReservation: r.inputs.theirReservation.value === '' ? null : Number(r.inputs.theirReservation.value),
        theirTarget: r.inputs.theirTarget.value === '' ? null : Number(r.inputs.theirTarget.value),
        estimateConfidence: r.inputs.confidence.value || null,
      }));
  }

  function addRow(seed = {}) {
    const rowUid = uid('negiss');
    const removed = { value: false };
    const labelFor = (suffix, text) => h('label', { class: 'field-label', for: `${rowUid}-${suffix}` }, text);

    const nameInput = h('input', { id: `${rowUid}-name`, type: 'text', placeholder: 'Annual fee, headcount, SLA days…', value: seed.name || '' });
    const unitInput = h('input', { id: `${rowUid}-unit`, type: 'text', placeholder: 'USD / days', value: seed.unit || '' });
    const directionSelect = h(
      'select',
      { id: `${rowUid}-direction` },
      ...NEGOTIATION_ISSUE_DIRECTIONS.map((d) => h('option', { value: d }, NEGOTIATION_ISSUE_DIRECTION_LABELS[d])),
    );
    directionSelect.value = NEGOTIATION_ISSUE_DIRECTIONS.includes(seed.direction) ? seed.direction : 'minimize';
    const weightSelect = h(
      'select',
      { id: `${rowUid}-weight`, 'aria-label': 'Issue weight 1 to 5' },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    weightSelect.value = String(seed.weight || 3);
    const numInput = (suffix, placeholder, value) =>
      h('input', { id: `${rowUid}-${suffix}`, type: 'number', min: '0', step: 'any', placeholder, value: value === null || value === undefined ? '' : String(value) });
    const ourReservation = numInput('ourres', 'Our walk-away', seed.ourReservation);
    const ourTarget = numInput('ourtarget', 'Our target', seed.ourTarget);
    const theirReservation = numInput('theirres', 'Their walk-away (est.)', seed.theirReservation);
    const theirTarget = numInput('theirtarget', 'Their target (est.)', seed.theirTarget);
    const confidenceSelect = h(
      'select',
      { id: `${rowUid}-confidence` },
      h('option', { value: '' }, 'Estimate confidence…'),
      ...ESTIMATE_CONFIDENCE.map((c) => h('option', { value: c }, ESTIMATE_CONFIDENCE_LABELS[c])),
    );
    confidenceSelect.value = ESTIMATE_CONFIDENCE.includes(seed.estimateConfidence) ? seed.estimateConfidence : '';

    const inputs = {
      name: nameInput,
      unit: unitInput,
      direction: directionSelect,
      weight: weightSelect,
      ourReservation,
      ourTarget,
      theirReservation,
      theirTarget,
      confidence: confidenceSelect,
    };

    const zopaBadge = h('span', { class: 'pill pill-neutral', 'aria-live': 'polite' }, 'No reservation prices yet');
    const removeBtn = h(
      'button',
      {
        class: 'btn btn-tiny btn-ghost',
        type: 'button',
        onClick: () => {
          removed.value = true;
          rowState.removed = true;
          rowNode.remove();
          onChange();
        },
      },
      'Remove issue',
    );

    const rowNode = h(
      'div',
      { class: 'neg-issue-row card' },
      h('div', { class: 'form-grid' }, [
        h('div', { class: 'field field-wide' }, labelFor('name', 'Issue name'), nameInput),
        h('div', { class: 'field' }, labelFor('unit', 'Unit'), unitInput),
        h('div', { class: 'field' }, labelFor('direction', 'Direction'), directionSelect),
        h('div', { class: 'field' }, labelFor('weight', 'Weight'), weightSelect),
        h('div', { class: 'field' }, labelFor('ourres', 'Our reservation (walk-away)'), ourReservation),
        h('div', { class: 'field' }, labelFor('ourtarget', 'Our target (aspiration)'), ourTarget),
        h('div', { class: 'field' }, labelFor('theirres', 'Their reservation — estimate'), theirReservation),
        h('div', { class: 'field' }, labelFor('theirtarget', 'Their target — estimate'), theirTarget),
        h('div', { class: 'field' }, labelFor('confidence', 'Estimate confidence'), confidenceSelect),
      ]),
      h('div', { class: 'row-between' }, zopaBadge, removeBtn),
    );

    const rowState = { id: seed.id || '', removed: false };
    const refreshBadge = () => {
      // Recompute directly from this row's inputs so the badge stays correct
      // while the row is being edited (readIssues reflects committed values).
      const local = analyzeNegotiationIssue({
        direction: directionSelect.value,
        ourReservation: ourReservation.value === '' ? null : Number(ourReservation.value),
        theirReservation: theirReservation.value === '' ? null : Number(theirReservation.value),
        weight: Number(weightSelect.value),
        unit: unitInput.value,
        name: nameInput.value,
      });
      if (local.status === 'zopa') {
        zopaBadge.className = 'pill pill-good';
        zopaBadge.textContent = `ZOPA exists: ${local.zopaLow}–${local.zopaHigh} ${local.unit || ''} · midpoint ${local.zopaMidpoint}`;
      } else if (local.status === 'no-zopa') {
        zopaBadge.className = 'pill pill-bad';
        zopaBadge.textContent = `No ZOPA — reservation gap ${local.gap} ${local.unit || ''}`;
      } else {
        zopaBadge.className = 'pill pill-neutral';
        zopaBadge.textContent = 'Enter both reservation prices to test the ZOPA';
      }
    };
    for (const input of Object.values(inputs)) {
      input.addEventListener('input', () => { refreshBadge(); onChange(); });
      input.addEventListener('change', () => { refreshBadge(); onChange(); });
    }
    refreshBadge();
    const row = { id: seed.id || '', node: rowNode, inputs, get removed() { return rowState.removed; }, set removed(v) { rowState.removed = v; } };
    rows.push(row);
    listNode.appendChild(rowNode);
  }

  const addBtn = h('button', { class: 'btn btn-small btn-ghost', type: 'button' }, 'Add measurable issue');
  addBtn.addEventListener('click', () => {
    addRow({});
    onChange();
  });

  for (const issue of initialIssues) addRow(issue);
  if (!initialIssues.length) addRow({});

  return {
    node: h('div', { class: 'stack-md' }, listNode, addBtn),
    getIssues: readIssues,
  };
}

/** Source-record picker (case / change / requisition / decision / goal). */
function sourceOptions(state) {
  const groups = [
    ['case', state.cases || [], (r) => r.title],
    ['change', state.changes || [], (r) => r.title],
    ['requisition', state.requisitions || [], (r) => r.title],
    ['decision', state.decisions || [], (r) => r.title],
    ['goal', state.goals || [], (r) => r.title],
  ];
  const options = [h('option', { value: '' }, 'No originating record (standalone negotiation)')];
  for (const [type, records, labelOf] of groups) {
    if (!records.length) continue;
    const group = h('optgroup', { label: type });
    for (const record of records.slice(0, 50)) {
      group.appendChild(h('option', { value: `${type}:${record.id}` }, String(labelOf(record) || record.id).slice(0, 120)));
    }
    options.push(group);
  }
  return options;
}

export function openNegotiationDialog(ctx, { negotiation = null, prefill = null, onSaved = null } = {}) {
  const isEdit = Boolean(negotiation);
  const seed = negotiation || prefill || {};
  const todayStr = dayKey(ctx.now);
  const defaultReviewDays = ctx.state.settings?.negotiationReviewDays ?? 14;

  const peopleOpts = [
    { value: '', label: 'Unassigned (leader-held)' },
    ...personOptions(ctx.state),
  ];
  const goalsOpts = [
    { value: '', label: 'No linked goal' },
    ...goalOptions(ctx.state),
  ];

  const prepLiveNode = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });
  const zopaLiveNode = h('div', { class: 'callout callout-subtle', 'aria-live': 'polite' });
  const previewNode = h('div', { class: 'case-propagation-preview', 'aria-live': 'polite' });

  const issueEditor = buildIssueEditor(seed.issues || [], () => refreshLiveReadouts());

  const sourceSelect = h('select', { id: 'neg-source', 'aria-label': 'Originating record' }, ...sourceOptions(ctx.state));
  if (seed.sourceType && seed.sourceId) sourceSelect.value = `${seed.sourceType}:${seed.sourceId}`;

  const form = buildForm([
    { name: 'title', label: 'Negotiation title', required: true, wide: true, value: seed.title || '', placeholder: 'NorthCloud annual renewal' },
    {
      name: 'kind', label: 'Negotiation type', type: 'select', value: seed.kind || 'vendor-contract',
      options: NEGOTIATION_KINDS.map((k) => ({ value: k, label: NEGOTIATION_KIND_LABELS[k] })),
    },
    {
      name: 'status', label: 'Status', type: 'select', value: seed.status || 'preparing',
      options: NEGOTIATION_STATUSES.map((s) => ({ value: s, label: NEGOTIATION_STATUS_LABELS[s] })),
      help: 'Agreements are recorded from the negotiation screen so terms and owners are captured.',
    },
    { name: 'counterparty', label: 'Counterparty', value: seed.counterparty || '', placeholder: 'Vendor, internal leader, candidate…' },
    { name: 'counterpartyRole', label: 'Counterparty role / authority', value: seed.counterpartyRole || '', placeholder: 'Procurement director, hiring manager…' },
    { name: 'ownerId', label: 'Internal owner', type: 'select', value: seed.ownerId || '', options: peopleOpts, help: 'Receives a marked BATNA/ZOPA prep topic on their next 1:1.' },
    { name: 'linkedGoalId', label: 'Impacted goal', type: 'select', value: seed.linkedGoalId || '', options: goalsOpts },
    { name: 'openedOn', label: 'Opened date', type: 'date', value: seed.openedOn || todayStr },
    {
      name: 'nextSessionOn', label: 'Next session date', type: 'date',
      value: seed.nextSessionOn || '',
    },
    {
      name: 'reviewOn', label: 'Review date', type: 'date',
      value: seed.reviewOn !== undefined ? (seed.reviewOn || '') : addDays(todayStr, defaultReviewDays),
    },
    { type: 'divider', label: 'Economics — stakes and BATNA (Fisher & Ury; Raiffa)' },
    {
      name: 'stakesValue', label: 'Recorded deal value (optional)', type: 'number', min: '0', step: 'any',
      value: seed.stakesValue ?? '', help: 'Values at or above 25,000 (or the strategic flag) trigger a DACI mandate decision. Never inferred — blank stays blank.',
    },
    { name: 'stakesCurrency', label: 'Currency', value: seed.stakesCurrency || 'USD' },
    { name: 'strategic', label: 'Strategic negotiation', type: 'checkbox', checkboxLabel: 'Mark as strategic regardless of recorded value', value: Boolean(seed.strategic) },
    { name: 'ourBatnaDescription', label: 'Our BATNA — what we do if there is no deal', type: 'textarea', rows: 2, wide: true, value: seed.ourBatnaDescription || '', placeholder: 'Walk-away course, alternative supplier, internal build…' },
    { name: 'ourBatnaValue', label: 'BATNA comparable value (optional)', type: 'number', min: '0', step: 'any', value: seed.ourBatnaValue ?? '' },
    { name: 'ourBatnaUnit', label: 'BATNA value unit', value: seed.ourBatnaUnit || '', placeholder: 'USD / days' },
    { name: 'theirBatnaEstimate', label: 'Counterparty BATNA estimate (optional)', type: 'textarea', rows: 2, wide: true, value: seed.theirBatnaEstimate || '' },
    { type: 'divider', label: 'Interests, objective criteria & options — one per line' },
    { name: 'ourInterests', label: 'Our interests (not positions)', type: 'textarea', rows: 3, wide: true, value: (seed.ourInterests || []).join('\n') },
    { name: 'theirInterests', label: 'Counterparty interests — estimated', type: 'textarea', rows: 3, wide: true, value: (seed.theirInterests || []).join('\n') },
    { name: 'objectiveCriteria', label: 'Objective criteria (market rate, precedent, regulation)', type: 'textarea', rows: 3, wide: true, value: (seed.objectiveCriteria || []).join('\n') },
    { name: 'options', label: 'Package options for mutual gain', type: 'textarea', rows: 3, wide: true, value: (seed.options || []).join('\n') },
    { type: 'divider', label: 'Measurable issues — reservation prices and the Zone of Possible Agreement' },
    { type: 'static', wide: true, label: 'Issues & ZOPA analysis', value: issueEditor.node, help: 'Counterparty figures are estimates with a confidence label; they are never treated as observed facts.' },
    { type: 'static', wide: true, value: zopaLiveNode },
    { type: 'static', wide: true, value: prepLiveNode },
    { name: 'notes', label: 'Prep notes', type: 'textarea', rows: 3, wide: true, value: seed.notes || '' },
    { type: 'divider', label: 'Origin & automation' },
    { type: 'static', wide: true, label: 'Originating record', value: sourceSelect },
    {
      name: 'autoPropagate', label: 'Cross-module automation', type: 'checkbox', wide: true,
      checkboxLabel: 'Automatically create and link the mandate decision, prep topic and (on impasse/agreement) downstream records in parallel',
      value: seed.autoPropagate !== false,
    },
    { type: 'static', wide: true, label: 'Live parallel propagation preview', value: previewNode },
  ]);

  function assemblePayload(vals) {
    const sourceRaw = sourceSelect.value || '';
    const [sourceType, sourceId] = sourceRaw.includes(':') ? sourceRaw.split(':') : [null, null];
    return {
      title: vals.title,
      kind: vals.kind,
      status: vals.status,
      counterparty: vals.counterparty,
      counterpartyRole: vals.counterpartyRole,
      ownerId: vals.ownerId || null,
      linkedGoalId: vals.linkedGoalId || null,
      sourceType,
      sourceId,
      openedOn: vals.openedOn,
      nextSessionOn: vals.nextSessionOn || null,
      reviewOn: vals.reviewOn || null,
      stakesValue: vals.stakesValue === '' ? null : vals.stakesValue,
      stakesCurrency: vals.stakesCurrency,
      strategic: vals.strategic,
      ourBatnaDescription: vals.ourBatnaDescription,
      ourBatnaValue: vals.ourBatnaValue === '' ? null : vals.ourBatnaValue,
      ourBatnaUnit: vals.ourBatnaUnit,
      theirBatnaEstimate: vals.theirBatnaEstimate,
      ourInterests: linesFromText(vals.ourInterests),
      theirInterests: linesFromText(vals.theirInterests),
      objectiveCriteria: linesFromText(vals.objectiveCriteria),
      options: linesFromText(vals.options),
      issues: issueEditor.getIssues(),
      notes: vals.notes,
      autoPropagate: vals.autoPropagate,
    };
  }

  function refreshLiveReadouts() {
    const payload = assemblePayload(form.getValues());
    const candidate = { ...payload, id: negotiation?.id || 'neg-preview' };
    const prep = evaluateNegotiationPrep(candidate);
    prepLiveNode.textContent = '';
    prepLiveNode.append(
      h('div', { class: 'small' }, `Fisher & Ury prep completeness: ${prep.completenessPct}% (${prep.metCount}/${prep.totalCount} checks)`),
      prep.blockers.length
        ? h('ul', { class: 'small muted' }, ...prep.blockers.slice(0, 7).map((b) => h('li', null, b)))
        : h('p', { class: 'small text-good' }, 'All prep anchors in place — BATNA, reservations, interests, criteria and options.'),
    );

    const analyses = payload.issues.map(analyzeNegotiationIssue).filter((a) => a.name);
    zopaLiveNode.textContent = '';
    if (!analyses.length) {
      zopaLiveNode.append(h('span', { class: 'muted small' }, 'Add a named issue with reservation prices to compute the ZOPA.'));
    } else {
      zopaLiveNode.append(
        h(
          'ul',
          { class: 'small stack-xs' },
          ...analyses.map((a) =>
            h(
              'li',
              null,
              h('strong', null, a.name || 'Unnamed issue'),
              ` — ${a.status === 'zopa' ? `ZOPA ${a.zopaLow}–${a.zopaHigh} ${a.unit} (surplus ${a.zopaWidth}, Raiffa midpoint ${a.zopaMidpoint})` : a.status === 'no-zopa' ? `no ZOPA, gap ${a.gap} ${a.unit}` : 'incomplete reservation prices'}`,
              a.targetWarning ? h('span', { class: 'text-warn' }, ` ⚠ ${a.targetWarning}`) : null,
            ),
          ),
        ),
      );
    }

    previewNode.textContent = '';
    if (!payload.autoPropagate) {
      previewNode.append(h('p', { class: 'muted small' }, 'Auto-propagation is paused for this save. Only the negotiation record will be written.'));
      return;
    }
    const previews = previewNegotiationPropagations(payload, ctx.state, { now: ctx.now, existingNegotiationId: negotiation?.id || null });
    if (!previews.length) {
      previewNode.append(h('p', { class: 'muted small' }, 'No downstream records needed yet — assign an owner, raise the stakes, or mark the negotiation strategic to trigger parallel rules.'));
    } else {
      previewNode.append(
        h(
          'ul',
          { class: 'case-preview-list' },
          ...previews.map((item) =>
            h(
              'li',
              { class: 'case-preview-item' },
              h('div', { class: 'row-between' }, h('strong', { class: 'small' }, `${item.targetModule}: ${item.summary}`), h('span', { class: 'pill pill-info' }, item.ruleId)),
              h('p', { class: 'muted small' }, item.detail),
            ),
          ),
        ),
      );
    }
  }

  form.node.addEventListener('input', refreshLiveReadouts);
  form.node.addEventListener('change', refreshLiveReadouts);
  sourceSelect.addEventListener('change', refreshLiveReadouts);
  refreshLiveReadouts();

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const payload = assemblePayload(form.getValues());
    const res = isEdit ? ctx.api.updateNegotiation(negotiation.id, payload) : ctx.api.addNegotiation(payload);
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    const propCount = (res.propagations || []).length;
    const suffix = propCount ? ` — ${propCount} parallel cross-module update${propCount === 1 ? '' : 's'} applied` : '';
    toast(`${isEdit ? 'Negotiation updated' : 'Negotiation registered'}${suffix}.`, 'good');
    closeFn();
    if (onSaved) onSaved(res);
  };

  const dialog = openModal({
    title: isEdit ? `Edit negotiation: ${negotiation.title}` : 'Register negotiation',
    description:
      'Prepare once: record the BATNA, reservation prices, interests and objective criteria. LeadOS computes the ZOPA and propagates mandate, prep and escalation records across the workspace in parallel.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: isEdit ? 'Save negotiation' : 'Register negotiation', onClose: () => closeFn() }),
    size: 'lg',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

/** Agreement dialog: agreed terms with optional owner and due date per term. */
export function openNegotiationAgreementDialog(ctx, negotiation) {
  const todayStr = dayKey(ctx.now);
  const peopleOpts = [{ value: '', label: 'No owner yet (surfaced as a gap)' }, ...personOptions(ctx.state)];
  const termRows = [];
  const listNode = h('div', { class: 'stack-sm', 'data-neg-terms': 'true' });

  function readTerms() {
    return termRows
      .filter((r) => !r.removed)
      .map((r) => ({
        id: r.id,
        issueId: r.issueSelect.value || null,
        text: r.textInput.value.trim(),
        ownerId: r.ownerSelect.value || null,
        dueOn: r.dueInput.value || null,
        agreedValue: r.valueInput.value === '' ? null : Number(r.valueInput.value),
        unit: r.unitInput.value.trim(),
      }))
      .filter((t) => t.text);
  }

  function addTermRow(seed = {}) {
    const rowState = { removed: false, id: seed.id || uid('negterm') };
    const issueSelect = h(
      'select',
      { 'aria-label': 'Linked issue' },
      h('option', { value: '' }, 'General term'),
      ...(negotiation.issues || []).filter((i) => i.name).map((i) => h('option', { value: i.id }, i.name)),
    );
    if (seed.issueId) issueSelect.value = seed.issueId;
    const textInput = h('input', { type: 'text', 'aria-label': 'Committed term', placeholder: 'What was committed?', value: seed.text || '' });
    const ownerSelect = h('select', { 'aria-label': 'Term owner' }, ...peopleOpts.map((o) => h('option', { value: o.value }, o.label)));
    if (seed.ownerId) ownerSelect.value = seed.ownerId;
    const dueInput = h('input', { type: 'date', 'aria-label': 'Term due date', value: seed.dueOn || '', min: todayStr });
    const valueInput = h('input', { type: 'number', min: '0', step: 'any', 'aria-label': 'Agreed value', placeholder: 'Agreed value', value: seed.agreedValue ?? '' });
    const unitInput = h('input', { type: 'text', 'aria-label': 'Agreed value unit', placeholder: 'Unit', value: seed.unit || negotiation.stakesCurrency || '' });
    const removeBtn = h(
      'button',
      { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => { rowState.removed = true; rowNode.remove(); } },
      'Remove',
    );
    const rowNode = h(
      'div',
      { class: 'neg-term-row card' },
      h('div', { class: 'form-grid' }, [
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Linked issue'), issueSelect),
        h('div', { class: 'field field-wide' }, h('label', { class: 'field-label' }, 'Committed term *'), textInput),
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Owner'), ownerSelect),
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Due date'), dueInput),
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Agreed value'), valueInput),
        h('div', { class: 'field' }, h('label', { class: 'field-label' }, 'Unit'), unitInput),
      ]),
      removeBtn,
    );
    termRows.push({ id: rowState.id, get removed() { return rowState.removed; }, issueSelect, textInput, ownerSelect, dueInput, valueInput, unitInput });
    listNode.appendChild(rowNode);
  }

  (negotiation.agreedTerms || []).forEach((t) => addTermRow(t));
  if (!negotiation.agreedTerms?.length) addTermRow({});
  const addBtn = h('button', { class: 'btn btn-small btn-ghost', type: 'button' }, 'Add another term');
  addBtn.addEventListener('click', () => addTermRow({}));

  const form = buildForm([
    { name: 'outcomeNotes', label: 'Outcome notes', type: 'textarea', rows: 3, wide: true, value: negotiation.outcomeNotes || '', placeholder: 'How the agreement was reached, trade-offs made, risks to monitor.' },
    { type: 'static', wide: true, label: 'Agreed terms', value: h('div', { class: 'stack-md' }, listNode, addBtn), help: 'Owned terms become tracked delegations (RULE-NEG-02); ownerless terms stay visible as ownership gaps.' },
  ]);

  let closeFn = () => {};
  form.__submit = () => {
    form.clearErrors();
    const terms = readTerms();
    if (!terms.length) {
      toast('Record at least one agreed term describing the commitment.', 'bad');
      return;
    }
    const res = ctx.api.recordNegotiationAgreement(negotiation.id, { agreedTerms: terms, outcomeNotes: form.getValues().outcomeNotes });
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    const gaps = (res.propagations || []).filter((p) => p.action === 'ownership-gap').length;
    toast(`Agreement recorded — ${(res.propagations || []).length} cross-module update${res.propagations.length === 1 ? '' : 's'}${gaps ? `, ${gaps} ownership gap${gaps === 1 ? '' : 's'}` : ''}.`, 'good');
    closeFn();
  };

  const dialog = openModal({
    title: `Record agreement: ${negotiation.title}`,
    description: 'Each owned term becomes an accountable delegation; the mandate decision moves onto the outcome-review queue.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Record agreement', onClose: () => closeFn() }),
    size: 'lg',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}
