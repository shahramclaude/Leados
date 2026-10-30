/**
 * app/ui/autopilot-modals.js — the dialogs of Autopilot Studio (Schema v58).
 *
 * Each dialog changes exactly one kind of thing:
 *
 *   - `openAutopilotPolicyDialog` declares or edits an agreement: the source
 *     event, up to six conditions over registry facts, and up to five actions.
 *     It never activates. Editing an active agreement returns it to draft,
 *     because the rehearsal it was approved under no longer describes it.
 *   - `openAutopilotRehearseDialog` shows the rehearsal against the current
 *     records — every match, every record it would create, every owner it
 *     would load, every blocked action — and offers activation bound to that
 *     exact preview. A stale or blocked rehearsal cannot activate.
 *   - `openAutopilotPauseDialog` pauses with a recorded reason.
 *   - `confirmAutopilotRetire` / `confirmAutopilotDelete` retire (history kept)
 *     or delete (only before anything ever executed).
 *
 * All are keyboard-operable and every control has a bound label.
 */

import { h, toast, openModal } from './dom.js';
import {
  AUTOPILOT_ACTIONS,
  AUTOPILOT_ACTION_BY_ID,
  AUTOPILOT_LIMITS,
  AUTOPILOT_OPERATORS,
  AUTOPILOT_SOURCES,
  AUTOPILOT_SOURCE_BY_ID,
  AUTOPILOT_TOKENS,
  defaultAction,
  defaultCondition,
} from '../core/domain/autopilotRegistry.js';
import { agreementTemplate } from '../core/domain/autopilot.js';

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function activePeople(ctx) {
  return (ctx.state.people || []).filter((person) => person && person.status !== 'archived');
}

function fieldControl(prefix, field, value, onChange) {
  const id = `${prefix}-${field.id}`;
  if (field.type === 'enum') {
    return h('select', { id, onChange: (event) => onChange(event.target.value) },
      ...field.values.map((option) => h('option', {
        value: option, ...(option === value ? { selected: 'selected' } : {}),
      }, option)));
  }
  if (field.type === 'boolean') {
    return h('select', { id, onChange: (event) => onChange(event.target.value === 'true') },
      h('option', { value: 'true', ...(value === true ? { selected: 'selected' } : {}) }, 'yes'),
      h('option', { value: 'false', ...(value === false ? { selected: 'selected' } : {}) }, 'no'));
  }
  if (field.type === 'number') {
    return h('input', {
      id, type: 'number', min: String(field.min ?? 0), max: String(field.max ?? 1000000),
      step: 'any', value: value === '' || value === null ? '' : String(value),
      onInput: (event) => onChange(event.target.value),
    });
  }
  return h('input', {
    id, type: 'text', maxlength: '160', value: typeof value === 'string' ? value : '',
    onInput: (event) => onChange(event.target.value),
  });
}

/* ------------------------------------------------------------ the builder */

export function openAutopilotPolicyDialog(ctx, { policy = null } = {}) {
  const editing = Boolean(policy);
  const draft = policy
    ? JSON.parse(JSON.stringify({ name: policy.name, purpose: policy.purpose, sourceType: policy.sourceType, trigger: policy.trigger, conditions: policy.conditions, actions: policy.actions, maxRuns: policy.maxRuns }))
    : { ...agreementTemplate('delay') };
  const people = activePeople(ctx);
  const formId = uid('ap');
  const live = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });

  const name = h('input', { id: `${formId}-name`, type: 'text', maxlength: '120', required: 'required', value: draft.name || '' });
  const purpose = h('textarea', { id: `${formId}-purpose`, rows: '2', maxlength: '600' });
  purpose.value = draft.purpose || '';
  const maxRuns = h('input', { id: `${formId}-maxruns`, type: 'number', min: '1', max: '100', step: '1', value: String(draft.maxRuns || 25) });
  const sourceSelect = h('select', { id: `${formId}-source` },
    ...AUTOPILOT_SOURCES.map((source) => h('option', {
      value: source.id, ...(source.id === draft.sourceType ? { selected: 'selected' } : {}),
    }, source.label)));
  const triggerSelect = h('select', { id: `${formId}-trigger` });
  const conditionsHost = h('div', { class: 'stack-sm' });
  const actionsHost = h('div', { class: 'stack-sm' });

  function source() {
    return AUTOPILOT_SOURCE_BY_ID[draft.sourceType] || AUTOPILOT_SOURCES[0];
  }

  function refreshLive() {
    const enabled = draft.actions.length;
    live.textContent = `${draft.conditions.length} condition(s), all must match · ${enabled} action(s) · runs at most ${maxRuns.value || '?'} matched events per activation. `
      + (draft.actions.some((a) => a.ownerMode === 'source')
        ? 'Actions follow the source record\u2019s owner; a record with no owner blocks the run instead of guessing.'
        : 'Every action names its owner explicitly.');
  }

  function renderTriggers() {
    triggerSelect.replaceChildren(...source().events.map((event) => h('option', {
      value: event, ...(event === draft.trigger ? { selected: 'selected' } : {}),
    }, event)));
  }

  function renderConditions() {
    conditionsHost.replaceChildren();
    draft.conditions.forEach((condition, index) => {
      const field = source().fields.find((f) => f.id === condition.field) || source().fields[0];
      condition.field = field.id;
      const ops = AUTOPILOT_OPERATORS[field.type];
      if (!ops.some((op) => op.id === condition.op)) condition.op = ops[0].id;
      const rowId = `${formId}-cond-${index}`;
      const fieldSelect = h('select', {
        id: `${rowId}-field`, 'aria-label': `Condition ${index + 1} fact`,
        onChange: (event) => {
          const next = source().fields.find((f) => f.id === event.target.value);
          draft.conditions[index] = { field: next.id, op: AUTOPILOT_OPERATORS[next.type][0].id, value: next.values?.[0] ?? (next.type === 'boolean' ? true : next.type === 'number' ? '' : '') };
          renderConditions(); refreshLive();
        },
      }, ...source().fields.map((f) => h('option', { value: f.id, ...(f.id === field.id ? { selected: 'selected' } : {}) }, f.label)));
      const opSelect = h('select', {
        id: `${rowId}-op`, 'aria-label': `Condition ${index + 1} comparison`,
        onChange: (event) => { condition.op = event.target.value; },
      }, ...ops.map((op) => h('option', { value: op.id, ...(op.id === condition.op ? { selected: 'selected' } : {}) }, op.label)));
      const valueControl = fieldControl(`${rowId}-value`, field, condition.value, (value) => { condition.value = value; });
      valueControl.setAttribute('aria-label', `Condition ${index + 1} value`);
      conditionsHost.append(h('div', { class: 'ap-condition-row' },
        fieldSelect, opSelect, valueControl,
        h('button', {
          class: 'btn btn-small btn-ghost', type: 'button', 'aria-label': `Remove condition ${index + 1}`,
          onClick: () => { draft.conditions.splice(index, 1); renderConditions(); refreshLive(); },
        }, 'Remove')));
    });
    if (!draft.conditions.length) {
      conditionsHost.append(h('p', { class: 'muted small' }, 'No conditions: every event of this kind would match. Prefer at least one so the agreement stays narrow.'));
    }
    if (draft.conditions.length < AUTOPILOT_LIMITS.conditions) {
      conditionsHost.append(h('button', {
        class: 'btn btn-small btn-ghost', type: 'button',
        onClick: () => { draft.conditions.push(defaultCondition(draft.sourceType)); renderConditions(); refreshLive(); },
      }, 'Add condition'));
    }
  }

  function ownerControls(action, rowId) {
    if (!['delegation', 'coaching', 'premise'].includes(action.type)) return [];
    const modeId = `${rowId}-ownermode`;
    const ownerId = `${rowId}-owner`;
    const mode = h('select', {
      id: modeId, 'aria-label': 'Action owner',
      onChange: (event) => { action.ownerMode = event.target.value; renderActions(); refreshLive(); },
    },
    h('option', { value: 'source', ...(action.ownerMode !== 'fixed' ? { selected: 'selected' } : {}) }, 'The source record\u2019s owner'),
    h('option', { value: 'fixed', ...(action.ownerMode === 'fixed' ? { selected: 'selected' } : {}) }, 'A named person'));
    const nodes = [h('div', { class: 'field' }, h('label', { for: modeId }, 'Owner'), mode)];
    if (action.ownerMode === 'fixed') {
      nodes.push(h('div', { class: 'field' }, h('label', { for: ownerId }, 'Named owner'),
        h('select', { id: ownerId, onChange: (event) => { action.ownerId = event.target.value; } },
          h('option', { value: '' }, 'Choose a person'),
          ...people.map((person) => h('option', { value: person.id, ...(person.id === action.ownerId ? { selected: 'selected' } : {}) }, person.name)))));
    }
    return nodes;
  }

  function textField(rowId, key, label, action, { rows = 0, maxlength = 1000, hint = '' } = {}) {
    const id = `${rowId}-${key}`;
    const control = rows
      ? h('textarea', { id, rows: String(rows), maxlength: String(maxlength), onInput: (event) => { action[key] = event.target.value; } })
      : h('input', { id, type: 'text', maxlength: String(maxlength), value: action[key] || '', onInput: (event) => { action[key] = event.target.value; } });
    if (rows) control.value = action[key] || '';
    return h('div', { class: 'field' }, h('label', { for: id }, label), control,
      hint ? h('p', { class: 'muted small' }, hint) : null);
  }

  function numberField(rowId, key, label, action, { min, max }) {
    const id = `${rowId}-${key}`;
    return h('div', { class: 'field' }, h('label', { for: id }, label),
      h('input', {
        id, type: 'number', min: String(min), max: String(max), step: '1',
        value: action[key] === undefined ? '' : String(action[key]),
        onInput: (event) => { action[key] = event.target.value; },
      }));
  }

  function renderActions() {
    actionsHost.replaceChildren();
    for (const spec of AUTOPILOT_ACTIONS) {
      const rowId = `${formId}-action-${spec.id}`;
      const enabled = draft.actions.some((a) => a.type === spec.id);
      const toggle = h('input', {
        id: `${rowId}-toggle`, type: 'checkbox', ...(enabled ? { checked: 'checked' } : {}),
        ...(spec.id === 'comms' && draft.sourceType !== 'case' ? { disabled: 'disabled' } : {}),
        onChange: (event) => {
          if (event.target.checked) draft.actions.push(defaultAction(spec.id));
          else draft.actions = draft.actions.filter((a) => a.type !== spec.id);
          renderActions(); refreshLive();
        },
      });
      const action = draft.actions.find((a) => a.type === spec.id);
      const cardNodes = [
        h('div', { class: 'ap-action-head' }, toggle,
          h('label', { for: `${rowId}-toggle` }, h('strong', null, spec.label)),
          h('span', { class: 'muted small' }, spec.description)),
      ];
      if (spec.id === 'comms' && draft.sourceType !== 'case') {
        cardNodes.push(h('p', { class: 'muted small' }, 'Stakeholder briefs are available only for case agreements.'));
      }
      if (enabled && action) {
        const fields = [];
        if (spec.id === 'decision') {
          fields.push(textField(rowId, 'title', 'Decision title', action, { maxlength: 180 }));
          fields.push(textField(rowId, 'question', 'Decision question', action, { rows: 2, maxlength: 1000 }));
          fields.push(numberField(rowId, 'dueDays', 'Review in (days)', action, { min: 1, max: 90 }));
        } else if (spec.id === 'delegation') {
          fields.push(textField(rowId, 'title', 'Task title', action, { maxlength: 180 }));
          fields.push(textField(rowId, 'outcome', 'Expected outcome', action, { rows: 2, maxlength: 1000 }));
          const authId = `${rowId}-authority`;
          fields.push(h('div', { class: 'field' }, h('label', { for: authId }, 'Authority level'),
            h('select', { id: authId, onChange: (event) => { action.authority = event.target.value; } },
              ...['recommend', 'agree', 'act-inform', 'own'].map((level) => h('option', { value: level, ...(level === action.authority ? { selected: 'selected' } : {}) }, level)))));
          fields.push(numberField(rowId, 'dueDays', 'Due in (days)', action, { min: 1, max: 90 }));
          fields.push(...ownerControls(action, rowId));
        } else if (spec.id === 'coaching') {
          fields.push(textField(rowId, 'text', 'Coaching prompt', action, { rows: 2, maxlength: 155, hint: 'A support prompt for the next 1:1, not a rating or a verdict.' }));
          fields.push(...ownerControls(action, rowId));
        } else if (spec.id === 'premise') {
          fields.push(textField(rowId, 'statement', 'Assumption', action, { rows: 2, maxlength: 900 }));
          fields.push(textField(rowId, 'signpost', 'Signpost to watch', action, { rows: 2, maxlength: 500 }));
          fields.push(numberField(rowId, 'priorPct', 'Prior confidence (%)', action, { min: 5, max: 95 }));
          fields.push(numberField(rowId, 'reviewDays', 'Review in (days)', action, { min: 1, max: 90 }));
          fields.push(...ownerControls(action, rowId));
        }
        cardNodes.push(h('div', { class: 'ap-action-fields' }, ...fields));
      }
      actionsHost.append(h('div', { class: `ap-action-card${enabled ? ' is-on' : ''}` }, ...cardNodes));
    }
  }

  function applyTemplate(id) {
    const template = agreementTemplate(id);
    Object.assign(draft, JSON.parse(JSON.stringify(template)));
    name.value = draft.name; purpose.value = draft.purpose; maxRuns.value = String(draft.maxRuns);
    sourceSelect.value = draft.sourceType;
    renderTriggers(); triggerSelect.value = draft.trigger;
    renderConditions(); renderActions(); refreshLive();
  }

  sourceSelect.addEventListener('change', () => {
    draft.sourceType = sourceSelect.value;
    draft.trigger = source().events[0];
    draft.conditions = [];
    draft.actions = draft.actions.filter((a) => a.type !== 'comms');
    renderTriggers(); renderConditions(); renderActions(); refreshLive();
  });
  triggerSelect.addEventListener('change', () => { draft.trigger = triggerSelect.value; });
  maxRuns.addEventListener('input', refreshLive);
  renderTriggers(); renderConditions(); renderActions(); refreshLive();

  const templateBar = editing ? null : h('div', { class: 'row-gap' },
    h('span', { class: 'muted small' }, 'Start from a template:'),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => applyTemplate('delay') }, 'Production delay'),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => applyTemplate('completion') }, 'Completed work'),
    h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => applyTemplate('goal') }, 'Off-track goal'));

  const body = h('div', { class: 'stack' },
    templateBar,
    h('div', { class: 'field' }, h('label', { for: `${formId}-name` }, 'Agreement name'), name),
    h('div', { class: 'field' }, h('label', { for: `${formId}-purpose` }, 'Purpose (why does this agreement exist?)'), purpose),
    h('div', { class: 'field' }, h('label', { for: `${formId}-source` }, 'Source module'), sourceSelect),
    h('div', { class: 'field' }, h('label', { for: `${formId}-trigger` }, 'Triggering event'), triggerSelect),
    h('div', null, h('h3', null, 'When — all conditions must match'), conditionsHost),
    h('div', null, h('h3', null, 'Then — the accountable work it creates'), actionsHost),
    h('div', { class: 'field' }, h('label', { for: `${formId}-maxruns` }, 'Activation budget (matched events)'), maxRuns),
    live,
    h('p', { class: 'muted small' }, `Text fields accept ${AUTOPILOT_TOKENS.map((t) => `{{${t}}}`).join(', ')} and nothing else — an unknown token refuses to save, because an agreement must never render a half-built instruction. Saving keeps the agreement a draft; nothing runs until rehearsal.`),
    editing && policy.status === 'active'
      ? h('p', { class: 'muted small' }, 'This agreement is active. Saving returns it to draft and voids its activation approval — rehearse and reactivate afterwards.')
      : null);

  const dialog = openModal({
    title: editing ? `Edit “${policy.name}”` : 'Declare an operating agreement',
    description: 'A standing instruction the workspace follows — but only after you rehearse it',
    size: 'lg',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const input = {
            name: name.value, purpose: purpose.value, sourceType: draft.sourceType, trigger: draft.trigger,
            conditions: draft.conditions.map((c) => ({ ...c, value: typeof c.value === 'string' && c.value !== '' && !Number.isNaN(Number(c.value)) && source().fields.find((f) => f.id === c.field)?.type === 'number' ? Number(c.value) : c.value })),
            actions: draft.actions, maxRuns: Number(maxRuns.value),
          };
          for (const action of input.actions) {
            for (const key of ['dueDays', 'priorPct', 'reviewDays']) {
              if (action[key] !== undefined && action[key] !== '') action[key] = Number(action[key]);
            }
          }
          const result = editing
            ? ctx.api.updateAutopilotPolicy(policy.id, input)
            : ctx.api.addAutopilotPolicy(input);
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(editing ? 'Agreement saved as a draft. Rehearse before reactivating.' : 'Agreement declared as a draft. Rehearse it before anything can run.', 'good');
          ctx.navigate(`#/autopilot?panel=agreements&policy=${encodeURIComponent(result.id)}`);
        },
      }, editing ? 'Save as draft' : 'Declare draft'),
    ],
  });
}

/* ---------------------------------------------------------- the rehearsal */

export function openAutopilotRehearseDialog(ctx, policy) {
  if (!policy) { toast('That agreement no longer exists.', 'bad'); return; }
  const result = ctx.api.rehearseAutopilotPolicy(policy.id);
  if (!result.ok) { toast(result.error, 'bad'); return; }
  const rehearsal = result.rehearsal;
  const matchedRows = rehearsal.rows.filter((row) => row.matched);

  const summary = h('div', { class: 'stat-grid' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Records examined'), h('span', { class: 'stat-value' }, String(rehearsal.examined))),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Would match'), h('span', { class: 'stat-value' }, String(rehearsal.matched))),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Records it would create'), h('span', { class: 'stat-value' }, String(rehearsal.created))),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Blocked'), h('span', { class: 'stat-value' }, String(rehearsal.blockers.length))));

  const nodes = [summary];
  if (rehearsal.blockers.length) {
    nodes.push(h('div', { class: 'banner banner-bad', role: 'alert' },
      h('div', { class: 'banner-text' }, h('strong', null, 'Rehearsal found a blocked action'),
        h('p', null, 'Activation is refused until every blocker is repaired. A blocked action is a missing owner, a full 1:1 queue, a record with no stakeholders to brief, or no briefing audience.'))));
    for (const row of rehearsal.blockers.slice(0, 6)) {
      nodes.push(h('p', { class: 'small' }, h('strong', null, row.title), ` — ${row.error || (row.actions.find((a) => a.status === 'blocked') || {}).reason || 'blocked'}`));
    }
  }
  if (!matchedRows.length && !rehearsal.blockers.length) {
    nodes.push(h('p', { class: 'muted' }, 'Nothing in the current records matches. The agreement is valid but would do nothing today — widen a condition, or keep it narrow on purpose and activate anyway.'));
  }
  if (matchedRows.length) {
    nodes.push(h('div', { class: 'table-wrap' },
      h('table', { class: 'table', 'aria-label': 'Records the rehearsal matched and what it would do' },
        h('caption', { class: 'sr-only' }, 'Records the rehearsal matched and what it would do'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Record'), h('th', { scope: 'col' }, 'Result'), h('th', { scope: 'col' }, 'Detail'))),
        h('tbody', null, ...matchedRows.slice(0, 20).map((row) => h('tr', null,
          h('td', null, row.title),
          h('td', null, row.status),
          h('td', { class: 'small' }, row.error || row.actions.map((a) => `${AUTOPILOT_ACTION_BY_ID[a.type]?.label || a.type}: ${a.status}`).join(' · ') || 'matches; nothing new to do')))))));
    if (matchedRows.length > 20) nodes.push(h('p', { class: 'muted small' }, `Showing 20 of ${matchedRows.length} matched records.`));
  }
  if (Object.keys(rehearsal.ownerLoads).length) {
    const names = Object.entries(rehearsal.ownerLoads).map(([ownerId, count]) => {
      const person = (ctx.state.people || []).find((p) => p.id === ownerId);
      return `${person?.name || 'Unknown person'}: ${count} new item(s) if every match fired at once`;
    });
    nodes.push(h('div', null, h('h3', null, 'Owner load if every match fired at once'),
      h('ul', { class: 'evidence-list' }, ...names.map((line) => h('li', null, line)))));
  }
  if (rehearsal.stress.length) {
    nodes.push(h('div', null, h('h3', null, 'Threshold sensitivity'),
      h('p', { class: 'muted small' }, 'The same records under a looser and a tighter numeric threshold. A policy stress test, not a forecast.'),
      h('ul', { class: 'evidence-list' }, ...rehearsal.stress.map((s) => h('li', null, `Threshold ${s.threshold} (×${s.multiplier}): ${s.matches} match(es)`)))));
  }
  nodes.push(h('p', { class: 'muted small' }, rehearsal.caveat));
  nodes.push(h('p', { class: 'muted small' }, `Approval token ${rehearsal.token} · workspace revision ${rehearsal.workspaceRevision} · agreement v${rehearsal.version}. Any change to the agreement or the workspace before activation invalidates this preview.`));

  const dialog = openModal({
    title: `Rehearsal — “${policy.name}”`,
    description: 'Exactly what this agreement would do to your current records. Nothing here is written.',
    size: 'lg',
    body: h('div', { class: 'stack' }, ...nodes),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Close'),
      ...(rehearsal.blockers.length || rehearsal.omitted ? [] : [h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const activation = ctx.api.activateAutopilotPolicy(policy.id, { token: rehearsal.token });
          if (!activation.ok) {
            dialog.close();
            toast(activation.error, 'bad');
            if (activation.rehearsal) openAutopilotRehearseDialog(ctx, { ...policy });
            else ctx.refresh();
            return;
          }
          dialog.close();
          toast(`“${policy.name}” is active. It will act on matching ${policy.trigger} events within its budget.`, 'good');
          ctx.navigate(`#/autopilot?panel=agreements&policy=${encodeURIComponent(policy.id)}`);
        },
      }, policy.status === 'active' ? 'Re-approve this version' : 'Activate with this rehearsal')]),
    ],
  });
}

/* --------------------------------------------------- pause, retire, delete */

export function openAutopilotPauseDialog(ctx, policy) {
  if (!policy) { toast('That agreement no longer exists.', 'bad'); return; }
  const reason = h('textarea', { id: 'ap-pause-reason', rows: '3', maxlength: '300', placeholder: 'Why is this agreement pausing? (recorded in its history)' });
  const dialog = openModal({
    title: `Pause “${policy.name}”`,
    description: 'A paused agreement ignores every event until you rehearse and reactivate it',
    size: 'md',
    body: h('div', { class: 'stack' },
      h('p', null, `This stops future matches. The ${policy.runCount} matched event(s) on record and their created work stay in the workspace — pausing never deletes what already happened.`),
      h('div', { class: 'field' }, h('label', { for: 'ap-pause-reason' }, 'Reason (optional)'), reason)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.pauseAutopilotPolicy(policy.id, { reason: reason.value });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Agreement paused.', 'good');
          ctx.navigate(`#/autopilot?panel=agreements&policy=${encodeURIComponent(policy.id)}`);
        },
      }, 'Pause agreement'),
    ],
  });
}

export function confirmAutopilotRetire(ctx, policy) {
  if (!policy) { toast('That agreement no longer exists.', 'bad'); return; }
  const dialog = openModal({
    title: `Retire “${policy.name}”?`,
    description: 'Retirement is permanent and keeps the audit trail',
    size: 'md',
    body: h('div', { class: 'stack' },
      h('p', null, `Retiring ends this agreement at v${policy.version} with ${policy.runCount} matched event(s) on record. Its execution history stays in the ledger; only future matches stop. A retired agreement cannot be reactivated — declare a new one instead.`)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: () => {
          const result = ctx.api.retireAutopilotPolicy(policy.id);
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Agreement retired. Its history is retained.', 'good');
          ctx.navigate('#/autopilot?panel=agreements');
        },
      }, 'Retire agreement'),
    ],
  });
}

export function confirmAutopilotDelete(ctx, policy) {
  if (!policy) { toast('That agreement no longer exists.', 'bad'); return; }
  const dialog = openModal({
    title: `Delete “${policy.name}”?`,
    description: 'Only an agreement that never executed can be deleted',
    size: 'md',
    body: h('div', { class: 'stack' },
      h('p', null, 'This draft has never matched an event, so there is no execution history to preserve. Deleting removes the definition. If it had ever fired, retirement — not deletion — would be the honest ending.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: () => {
          const result = ctx.api.deleteAutopilotPolicy(policy.id);
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Draft deleted.', 'good');
          ctx.navigate('#/autopilot?panel=agreements');
        },
      }, 'Delete draft'),
    ],
  });
}
