/**
 * app/ui/stakeholder-modals.js — Stakeholder Influence Register dialogs.
 *
 * Capture forms for the Schema v25 stakeholder collection:
 *  - openStakeholderDialog: register/edit with live Mitchell-Agle-Wood
 *    salience and Mendelow quadrant readouts, an alliance editor and a
 *    dry-run cross-module propagation preview (RULE-STK-01/02/03).
 *  - openStanceDialog: append an evidence-bearing stance-history entry.
 *  - openContactDialog: log a contact and auto-propose the next cadence date.
 *
 * All writes go through ctx.api; this layer never touches the store.
 */

import { h, openModal, toast, uid } from './dom.js';
import { dayKey, addDays } from '../core/time.js';
import { personOptions } from './options.js';
import {
  ALLIANCE_KINDS,
  ALLIANCE_KIND_LABELS,
  CADENCE_DAYS,
  ESTIMATE_CONFIDENCE,
  ESTIMATE_CONFIDENCE_LABELS,
  SALIENCE_CLASSES,
  STAKEHOLDER_CATEGORIES,
  STAKEHOLDER_CATEGORY_LABELS,
  classifySalience,
} from '../core/domain/stakeholders.js';
import {
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_CADENCE_LABELS,
  STAKEHOLDER_STANCES,
  STAKEHOLDER_STANCE_LABELS,
  classifyMendelowStakeholder,
} from '../core/domain/cases.js';

function modalFooter(form, { submitLabel = 'Save', onClose }) {
  const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => onClose() }, 'Cancel');
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.__submit() }, submitLabel);
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    form.__submit();
  });
  return [cancelBtn, submitBtn];
}

function labelFor(id, text, required = false) {
  return h('label', { class: 'field-label', for: id }, text, required ? h('span', { class: 'text-warn', 'aria-hidden': 'true' }, ' *') : null);
}

function selectField(id, label, options, value, { required = false } = {}) {
  const select = h(
    'select',
    { id, name: id, 'aria-label': label },
    ...options.map((o) => h('option', { value: o.value }, o.label)),
  );
  if (value !== undefined && value !== null && value !== '') select.value = String(value);
  return h('div', { class: 'field' }, labelFor(id, label, required), select);
}

function ratingSelect(id, label, value) {
  return selectField(
    id,
    label,
    [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` })),
    String(value ?? 3),
  );
}

function textInput(id, label, value, { type = 'text', placeholder = '', required = false } = {}) {
  const input = h('input', { id, name: id, type, placeholder, value: value ?? '' });
  return h('div', { class: 'field' }, labelFor(id, label, required), input);
}

function textArea(id, label, value, { rows = 3, placeholder = '' } = {}) {
  const input = h('textarea', { id, name: id, rows, placeholder });
  input.value = value ?? '';
  return h('div', { class: 'field field-wide' }, labelFor(id, label), input);
}

function readRatings(form) {
  const v = (name) => Number(form.getValues()[name]);
  return {
    power: v('power'),
    interest: v('interest'),
    legitimacy: v('legitimacy'),
    urgency: v('urgency'),
  };
}

/** Dynamic alliance/opposition/influence edge editor. */
function buildAllianceEditor(ctx, initial, selfId, onChange) {
  const listNode = h('div', { class: 'stack-sm', 'data-stk-alliances': 'true' });
  const rows = [];
  const others = (ctx.state.stakeholders || []).filter((s) => s.id !== selfId && s.status !== 'archived');

  function targetOptions() {
    return [
      { value: '', label: 'Select a registered stakeholder…' },
      ...others.map((s) => ({ value: s.id, label: `${s.name}${s.org ? ` — ${s.org}` : ''}` })),
    ];
  }

  function addRow(seed = {}) {
    const rowUid = uid('stkall');
    const removed = { value: false };
    const targetSelect = h('select', { id: `${rowUid}-target`, 'aria-label': 'Alliance target' }, ...targetOptions().map((o) => h('option', { value: o.value }, o.label)));
    if (seed.targetId) targetSelect.value = seed.targetId;
    const kindSelect = h(
      'select',
      { id: `${rowUid}-kind`, 'aria-label': 'Relationship kind' },
      ...ALLIANCE_KINDS.map((k) => h('option', { value: k }, ALLIANCE_KIND_LABELS[k])),
    );
    kindSelect.value = ALLIANCE_KINDS.includes(seed.kind) ? seed.kind : 'alliance';
    const strengthSelect = h(
      'select',
      { id: `${rowUid}-strength`, 'aria-label': 'Relationship strength 1 to 5' },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    strengthSelect.value = String(seed.strength || 3);

    const removeBtn = h(
      'button',
      {
        class: 'btn btn-tiny btn-ghost',
        type: 'button',
        onClick: () => {
          removed.value = true;
          rowNode.remove();
          onChange();
        },
      },
      'Remove',
    );
    const rowNode = h(
      'div',
      { class: 'card stk-alliance-row' },
      h('div', { class: 'form-grid' }, [
        h('div', { class: 'field field-wide' }, labelFor(`${rowUid}-target`, 'Target stakeholder'), targetSelect),
        h('div', { class: 'field' }, labelFor(`${rowUid}-kind`, 'Relationship'), kindSelect),
        h('div', { class: 'field' }, labelFor(`${rowUid}-strength`, 'Strength'), strengthSelect),
      ]),
      removeBtn,
    );
    for (const el of [targetSelect, kindSelect, strengthSelect]) {
      el.addEventListener('change', onChange);
    }
    rows.push({
      get removed() {
        return removed.value;
      },
      read: () => ({ targetId: targetSelect.value, kind: kindSelect.value, strength: Number(strengthSelect.value) }),
    });
    listNode.appendChild(rowNode);
  }

  const addBtn = h('button', { class: 'btn btn-small btn-ghost', type: 'button' }, 'Add relationship');
  addBtn.addEventListener('click', () => {
    addRow({});
    onChange();
  });

  for (const edge of initial || []) addRow(edge);

  return {
    node: h('div', { class: 'stack-sm' }, listNode, addBtn),
    getAlliances() {
      return rows.filter((r) => !r.removed).map((r) => r.read()).filter((r) => r.targetId);
    },
  };
}

export function openStakeholderDialog(ctx, stakeholder = null, onSaved = null) {
  const isEdit = Boolean(stakeholder);
  const form = { node: h('form', { class: 'form', novalidate: true }), errors: new Map() };
  const today = dayKey(ctx.now);
  const s = stakeholder || {};

  const fieldValues = {
    name: s.name || '',
    org: s.org || '',
    role: s.role || '',
    category: s.category || 'other',
    personId: s.personId || '',
    power: s.power ?? 3,
    interest: s.interest ?? 3,
    legitimacy: s.legitimacy ?? 3,
    urgency: s.urgency ?? 3,
    vetoPlayer: s.vetoPlayer === true,
    vetoBasis: s.vetoBasis || '',
    stance: s.stance || 'neutral',
    estimateConfidence: s.estimateConfidence || 'medium',
    commsCadence: s.commsCadence || 'weekly',
    lastContactOn: s.lastContactOn || '',
    nextContactOn: s.nextContactOn || '',
    preferredComms: s.preferredComms || '',
    keyMessage: s.keyMessage || '',
    influenceNotes: s.influenceNotes || '',
    tags: Array.isArray(s.tags) ? s.tags.join(', ') : '',
    autoPropagate: s.autoPropagate !== false,
  };

  const nameInput = h('input', { id: 'stk-name', type: 'text', placeholder: 'Named individual or body', value: fieldValues.name });
  const orgInput = h('input', { id: 'stk-org', type: 'text', placeholder: 'Department, company or agency', value: fieldValues.org });
  const roleInput = h('input', { id: 'stk-role', type: 'text', placeholder: 'Title or function', value: fieldValues.role });
  const categorySelect = h(
    'select',
    { id: 'stk-category' },
    ...STAKEHOLDER_CATEGORIES.map((c) => h('option', { value: c }, STAKEHOLDER_CATEGORY_LABELS[c])),
  );
  categorySelect.value = fieldValues.category;
  const personSelect = h(
    'select',
    { id: 'stk-person' },
    h('option', { value: '' }, 'No roster link (external or unnamed group)'),
    ...personOptions(ctx.state, { includeNone: null }).map((o) => h('option', { value: o.value }, o.label)),
  );
  personSelect.value = fieldValues.personId;

  const ratingFields = ['power', 'interest', 'legitimacy', 'urgency'].map((key) => {
    const node = h(
      'select',
      { id: `stk-${key}`, 'aria-label': `${key} rating` },
      ...[1, 2, 3, 4, 5].map((n) => h('option', { value: String(n) }, `${n} / 5`)),
    );
    node.value = String(fieldValues[key]);
    return { key, node };
  });
  const getRating = (key) => Number(ratingFields.find((r) => r.key === key).node.value);

  const vetoCheck = h('input', { id: 'stk-veto', type: 'checkbox' });
  vetoCheck.checked = fieldValues.vetoPlayer;
  const vetoBasisInput = h('textarea', { id: 'stk-veto-basis', rows: 2, placeholder: 'Why does this actor hold a gate? (budget sign-off, regulatory authority…)' });
  vetoBasisInput.value = fieldValues.vetoBasis;

  const stanceSelect = h(
    'select',
    { id: 'stk-stance' },
    ...STAKEHOLDER_STANCES.map((v) => h('option', { value: v }, STAKEHOLDER_STANCE_LABELS[v])),
  );
  stanceSelect.value = fieldValues.stance;
  const confidenceSelect = h(
    'select',
    { id: 'stk-confidence' },
    ...ESTIMATE_CONFIDENCE.map((v) => h('option', { value: v }, ESTIMATE_CONFIDENCE_LABELS[v])),
  );
  confidenceSelect.value = fieldValues.estimateConfidence;
  const cadenceSelect = h(
    'select',
    { id: 'stk-cadence' },
    ...STAKEHOLDER_CADENCES.map((v) => h('option', { value: v }, STAKEHOLDER_CADENCE_LABELS[v])),
  );
  cadenceSelect.value = fieldValues.commsCadence;

  const lastContactInput = h('input', { id: 'stk-last-contact', type: 'date' });
  lastContactInput.value = fieldValues.lastContactOn;
  const nextContactInput = h('input', { id: 'stk-next-contact', type: 'date' });
  nextContactInput.value = fieldValues.nextContactOn;
  const preferredInput = h('input', { id: 'stk-preferred', type: 'text', placeholder: 'Channel or style, e.g. short written brief' });
  preferredInput.value = fieldValues.preferredComms;
  const keyMsgInput = h('textarea', { id: 'stk-key-message', rows: 2, placeholder: 'The one message this actor needs to hear' });
  keyMsgInput.value = fieldValues.keyMessage;
  const notesInput = h('textarea', { id: 'stk-notes', rows: 3, placeholder: 'Private political assessment — export-governed, never shared upwards without scrubbing' });
  notesInput.value = fieldValues.influenceNotes;
  const tagsInput = h('input', { id: 'stk-tags', type: 'text', placeholder: 'Comma-separated tags' });
  tagsInput.value = fieldValues.tags;
  const autoPropCheck = h('input', { id: 'stk-autoprop', type: 'checkbox' });
  autoPropCheck.checked = fieldValues.autoPropagate;

  const liveNode = h('div', { class: 'stk-live', 'aria-live': 'polite' });
  const previewNode = h('div', { class: 'stk-preview' });
  const allianceEditor = buildAllianceEditor(ctx, s.alliances || [], s.id, refreshLiveReadouts);

  function payload() {
    return {
      name: nameInput.value.trim(),
      org: orgInput.value.trim(),
      role: roleInput.value.trim(),
      category: categorySelect.value,
      personId: personSelect.value || null,
      power: getRating('power'),
      interest: getRating('interest'),
      legitimacy: getRating('legitimacy'),
      urgency: getRating('urgency'),
      vetoPlayer: vetoCheck.checked,
      vetoBasis: vetoBasisInput.value.trim(),
      stance: stanceSelect.value,
      estimateConfidence: confidenceSelect.value,
      commsCadence: cadenceSelect.value,
      lastContactOn: lastContactInput.value || null,
      nextContactOn: nextContactInput.value || null,
      preferredComms: preferredInput.value.trim(),
      keyMessage: keyMsgInput.value.trim(),
      influenceNotes: notesInput.value.trim(),
      tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
      alliances: allianceEditor.getAlliances(),
      autoPropagate: autoPropCheck.checked,
    };
  }

  function refreshLiveReadouts() {
    const candidate = payload();
    const salience = classifySalience(candidate);
    const mendelow = classifyMendelowStakeholder(candidate, today);
    liveNode.textContent = '';
    liveNode.append(
      h(
        'div',
        { class: 'stk-readout-grid' },
        h('div', { class: 'card stk-readout' }, [
          h('p', { class: 'small muted' }, 'Mitchell-Agle-Wood salience (1997)'),
          h('strong', { class: `stk-salience stk-salience-${salience.salienceClass}` }, salience.classLabel),
          h('p', { class: 'tiny muted' }, salience.subtitle),
          h('p', { class: 'small' }, `Score ${salience.salienceScore}/15 · evidence-adjusted ${salience.expectedSalienceScore}`),
        ]),
        h('div', { class: 'card stk-readout' }, [
          h('p', { class: 'small muted' }, 'Mendelow power × interest (1981)'),
          h('strong', null, mendelow.quadrantLabel),
          h('p', { class: 'tiny muted' }, mendelow.quadrantSubtitle),
          h('p', { class: 'small' }, mendelow.guidance.slice(0, 140)),
        ]),
        h('div', { class: 'card stk-readout' }, [
          h('p', { class: 'small muted' }, 'Tsebelis veto gate'),
          h('strong', { class: candidate.vetoPlayer ? 'text-bad' : 'muted' }, candidate.vetoPlayer ? 'Veto player' : 'No veto recorded'),
          h('p', { class: 'tiny muted' }, candidate.vetoPlayer
            ? (candidate.vetoBasis ? candidate.vetoBasis.slice(0, 120) : 'Record the gate basis before relying on it.')
            : 'Adverse veto gates auto-open a DACI alignment decision on linked initiatives.'),
        ]),
      ),
      h('p', { class: 'tiny muted' }, SALIENCE_CLASSES[salience.salienceClass].guidance),
    );

    previewNode.textContent = '';
    if (!candidate.autoPropagate) {
      previewNode.append(h('p', { class: 'muted small' }, 'Auto-propagation paused: only the register record will be written.'));
      return;
    }
    const result = ctx.api.previewStakeholder(candidate, isEdit ? stakeholder.id : null);
    if (!result.ok) {
      previewNode.append(h('p', { class: 'text-warn small' }, result.error));
      return;
    }
    if (!result.previews.length) {
      previewNode.append(h('p', { class: 'muted small' }, 'No cross-module effects yet — link this actor to an initiative, or record an adverse veto gate, to trigger propagation.'));
    } else {
      previewNode.append(
        h(
          'ul',
          { class: 'case-preview-list' },
          ...result.previews.map((item) =>
            h(
              'li',
              { class: 'case-preview-item' },
              h('div', { class: 'row-between' }, h('strong', { class: 'small' }, `${item.targetModule}: ${item.summary}`), h('span', { class: 'pill pill-info' }, item.ruleId)),
              h('p', { class: 'muted small' }, item.detail || ''),
            ),
          ),
        ),
      );
    }
  }

  form.node.append(
    h('div', { class: 'form-divider' }, h('span', null, 'Identity')),
    h('div', { class: 'form-grid' }, [
      h('div', { class: 'field field-wide' }, labelFor('stk-name', 'Name', true), nameInput),
      h('div', { class: 'field' }, labelFor('stk-org', 'Organisation'), orgInput),
      h('div', { class: 'field' }, labelFor('stk-role', 'Role / title'), roleInput),
      h('div', { class: 'field' }, labelFor('stk-category', 'Category'), categorySelect),
      h('div', { class: 'field field-wide' }, labelFor('stk-person', 'Internal roster link'), personSelect),
    ]),
    h('div', { class: 'form-divider' }, h('span', null, 'Power, salience & stance')),
    h('div', { class: 'form-grid' }, [
      ...ratingFields.map((r) => h('div', { class: 'field' }, labelFor(`stk-${r.key}`, r.key[0].toUpperCase() + r.key.slice(1)), r.node)),
      h('div', { class: 'field' }, labelFor('stk-stance', 'Current stance'), stanceSelect),
      h('div', { class: 'field' }, labelFor('stk-confidence', 'Evidence confidence'), confidenceSelect),
    ]),
    h('div', { class: 'field check-grid' }, h('label', { class: 'check', for: 'stk-veto' }, vetoCheck, h('span', null, 'Tsebelis veto player — their agreement is required'))),
    h('div', { class: 'field field-wide' }, labelFor('stk-veto-basis', 'Veto basis'), vetoBasisInput),
    liveNode,
    h('div', { class: 'form-divider' }, h('span', null, 'Communication')),
    h('div', { class: 'form-grid' }, [
      h('div', { class: 'field' }, labelFor('stk-cadence', 'Cadence'), cadenceSelect),
      h('div', { class: 'field' }, labelFor('stk-last-contact', 'Last contact on'), lastContactInput),
      h('div', { class: 'field' }, labelFor('stk-next-contact', 'Next contact on'), nextContactInput),
      h('div', { class: 'field field-wide' }, labelFor('stk-preferred', 'Preferred channel / style'), preferredInput),
    ]),
    h('div', { class: 'field field-wide' }, labelFor('stk-key-message', 'Key message'), keyMsgInput),
    h('div', { class: 'form-divider' }, h('span', null, 'Coalition network')),
    allianceEditor.node,
    h('div', { class: 'form-divider' }, h('span', null, 'Private assessment & governance')),
    h('div', { class: 'field field-wide' }, labelFor('stk-notes', 'Influence notes (export-governed)'), notesInput),
    h('div', { class: 'field field-wide' }, labelFor('stk-tags', 'Tags'), tagsInput),
    h('div', { class: 'field check-grid' }, h('label', { class: 'check', for: 'stk-autoprop' }, autoPropCheck, h('span', null, 'Auto-propagate links, decisions and coaching from this record'))),
    h('div', { class: 'form-divider' }, h('span', null, 'Parallel propagation preview')),
    previewNode,
  );

  for (const el of form.node.querySelectorAll('input, select, textarea')) {
    el.addEventListener('input', refreshLiveReadouts);
    el.addEventListener('change', refreshLiveReadouts);
  }
  refreshLiveReadouts();

  form.getValues = payload;
  form.clearErrors = () => {
    for (const node of form.node.querySelectorAll('.field-error')) node.remove();
  };
  form.setFieldError = (field, message) => {
    const target = form.node.querySelector(`[name="${field}"], #stk-${field}`);
    if (target) target.closest('.field')?.append(h('p', { class: 'field-error small text-bad' }, message));
  };
  form.__submit = () => {
    form.clearErrors();
    const data = payload();
    if (!data.name) {
      form.setFieldError('name', 'Name the stakeholder.');
      toast('A register entry needs a name.', 'bad');
      return;
    }
    const res = isEdit ? ctx.api.updateStakeholder(stakeholder.id, data) : ctx.api.addStakeholder(data);
    if (!res.ok) {
      if (res.field) form.setFieldError(res.field, res.error);
      toast(res.error, 'bad');
      return;
    }
    const count = (res.propagations || []).length;
    toast(`${isEdit ? 'Stakeholder updated' : 'Stakeholder registered'}${count ? ` — ${count} parallel update${count === 1 ? '' : 's'} applied` : ''}.`, 'good');
    closeFn();
    if (onSaved) onSaved(res);
    ctx.refresh();
  };

  let closeFn = () => {};
  const dialog = openModal({
    title: isEdit ? `Edit stakeholder: ${stakeholder.name}` : 'Register stakeholder',
    description:
      'Mendelow, Mitchell-Agle-Wood salience and Tsebelis veto analysis update live. Saving reconciles involvement across cases, changes and negotiations and propagates alignment decisions in parallel.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: isEdit ? 'Save stakeholder' : 'Register stakeholder', onClose: () => closeFn() }),
    size: 'lg',
    onClose: () => form.clearErrors(),
  });
  closeFn = dialog.close;
  return dialog;
}

export function openStanceDialog(ctx, stakeholder, onSaved = null) {
  const form = { node: h('form', { class: 'form', novalidate: true }) };
  const today = dayKey(ctx.now);
  const stanceSelect = h(
    'select',
    { id: 'stk-stance-log', 'aria-label': 'New stance' },
    ...STAKEHOLDER_STANCES.map((v) => h('option', { value: v }, STAKEHOLDER_STANCE_LABELS[v])),
  );
  stanceSelect.value = stakeholder.stance || 'neutral';
  const dateInput = h('input', { id: 'stk-stance-on', type: 'date', value: today });
  const contextInput = h('textarea', { id: 'stk-stance-context', rows: 3, placeholder: 'What did they say or do? Evidence for the shift.' });
  const sourceSelect = h(
    'select',
    { id: 'stk-stance-source' },
    h('option', { value: '' }, 'General register observation'),
    h('option', { value: 'case' }, 'An operational case'),
    h('option', { value: 'change' }, 'An organizational change'),
    h('option', { value: 'negotiation' }, 'A negotiation'),
  );
  const sourceIdInput = h('input', { id: 'stk-stance-source-id', type: 'text', placeholder: 'Source record id (optional)' });

  form.node.append(
    h('div', { class: 'form-grid' }, [
      h('div', { class: 'field' }, labelFor('stk-stance-log', 'New stance', true), stanceSelect),
      h('div', { class: 'field' }, labelFor('stk-stance-on', 'Observed on'), dateInput),
    ]),
    h('div', { class: 'field field-wide' }, labelFor('stk-stance-context', 'Evidence & context'), contextInput),
    h('div', { class: 'form-grid' }, [
      h('div', { class: 'field' }, labelFor('stk-stance-source', 'Linked to'), sourceSelect),
      h('div', { class: 'field' }, labelFor('stk-stance-source-id', 'Source id'), sourceIdInput),
    ]),
    h('p', { class: 'small muted' }, 'An adverse shift on a high-salience internal stakeholder queues a blameless 1:1 talking point (RULE-STK-03). History is append-only.'),
  );

  form.__submit = () => {
    const res = ctx.api.logStakeholderStance(stakeholder.id, {
      stance: stanceSelect.value,
      on: dateInput.value || today,
      context: contextInput.value.trim(),
      sourceType: sourceSelect.value || null,
      sourceId: sourceIdInput.value.trim() || null,
    });
    if (!res.ok) {
      toast(res.error, 'bad');
      return;
    }
    toast(`Stance recorded (${res.shift}${res.adverse ? ', adverse — coaching response queued if applicable' : ''}).`, res.adverse ? 'warn' : 'good');
    closeFn();
    if (onSaved) onSaved(res);
    ctx.refresh();
  };
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    form.__submit();
  });
  let closeFn = () => {};
  const dialog = openModal({
    title: `Log stance: ${stakeholder.name}`,
    description: 'Append a dated, evidence-bearing stance entry. The register stance moves with it; nothing is overwritten.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Save stance entry', onClose: () => closeFn() }),
    size: 'md',
  });
  closeFn = dialog.close;
  return dialog;
}

export function openContactDialog(ctx, stakeholder, onSaved = null) {
  const form = { node: h('form', { class: 'form', novalidate: true }) };
  const today = dayKey(ctx.now);
  const dateInput = h('input', { id: 'stk-contact-on', type: 'date', value: today });
  const noteInput = h('textarea', { id: 'stk-contact-note', rows: 3, placeholder: 'What was discussed, agreed, or observed?' });
  const cadenceDays = CADENCE_DAYS[stakeholder.commsCadence] || null;
  const proposed = cadenceDays ? addDays(today, cadenceDays) : null;

  form.node.append(
    h('div', { class: 'field' }, labelFor('stk-contact-on', 'Contact date'), dateInput),
    h('div', { class: 'field field-wide' }, labelFor('stk-contact-note', 'Note'), noteInput),
    proposed
      ? h('p', { class: 'small muted' }, `With the “${STAKEHOLDER_CADENCE_LABELS[stakeholder.commsCadence]}” cadence, the next contact will be proposed for ${proposed} (only when no later date is already planned).`)
      : null,
  );

  form.__submit = () => {
    const res = ctx.api.logStakeholderContact(stakeholder.id, {
      on: dateInput.value || today,
      note: noteInput.value.trim(),
    });
    if (!res.ok) {
      toast(res.error, 'bad');
      return;
    }
    toast(res.scheduledNextOn ? `Contact logged — next proposed ${res.scheduledNextOn}.` : 'Contact logged.', 'good');
    closeFn();
    if (onSaved) onSaved(res);
    ctx.refresh();
  };
  form.node.addEventListener('submit', (e) => {
    e.preventDefault();
    form.__submit();
  });
  let closeFn = () => {};
  const dialog = openModal({
    title: `Log contact: ${stakeholder.name}`,
    description: 'Records the touchpoint in the dated contact log and keeps cadence commitments visible.',
    body: form.node,
    footer: modalFooter(form, { submitLabel: 'Save contact', onClose: () => closeFn() }),
    size: 'md',
  });
  closeFn = dialog.close;
  return dialog;
}
