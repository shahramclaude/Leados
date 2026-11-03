/**
 * app/ui/retention-modals.js — the three write dialogs of the retention
 * terminal: record a departure, plan/commit a retention path, and record pay
 * data.
 *
 * Design rule that shapes all three: the dialog shows what the engine derived
 * and asks for the smallest possible human input. A leader should never type a
 * salary the app could have derived, and should never be shown a probability
 * without the interval and the model mode next to it.
 */

import { h, openModal, toast } from './dom.js';
import {
  DEPARTURE_REASON_CLASSES,
  DEPARTURE_REASON_LABELS,
  DEPARTURE_TYPES,
  DEPARTURE_TYPE_LABELS,
} from '../core/schema.js';
import { RETENTION_PLAN_STATUS_LABELS } from '../core/domain/retention.js';

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 'unpriced';
  return `${currency || ''} ${Math.round(Number(amount)).toLocaleString('en-US')}`.trim();
}

function pct(value, dp = 0) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(dp)}%`;
}

function field({ id, label, hint = null, control, wide = false }) {
  return h('div', { class: `field${wide ? ' field-wide' : ''}` },
    h('label', { class: 'field-label', for: id }, label),
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null);
}

function numberInput({ id, value, min = 0, placeholder = '', step = 'any' }) {
  return h('input', {
    id,
    name: id,
    type: 'number',
    min: String(min),
    step,
    placeholder,
    value: value === null || value === undefined ? '' : String(value),
    inputmode: 'decimal',
  });
}

function select({ id, options, value }) {
  const node = h('select', { id, name: id }, ...options.map((o) => h('option', { value: o.value }, o.label)));
  node.value = value;
  return node;
}

/* ------------------------------------------------------------ departure */

export function openDepartureDialog(ctx, person, { onSaved = null } = {}) {
  if (!person) return null;
  const today = new Date(ctx.now).toISOString().slice(0, 10);
  const lastDay = h('input', { id: 'departure-last-day', name: 'lastDay', type: 'date', value: today, max: today });
  const type = select({
    id: 'departure-type',
    value: 'voluntary',
    options: DEPARTURE_TYPES.map((key) => ({ value: key, label: DEPARTURE_TYPE_LABELS[key] })),
  });
  const reason = select({
    id: 'departure-reason',
    value: 'unknown',
    options: DEPARTURE_REASON_CLASSES.map((key) => ({ value: key, label: DEPARTURE_REASON_LABELS[key] })),
  });
  const regrettable = select({
    id: 'departure-regrettable',
    value: '',
    options: [
      { value: '', label: 'Not recorded' },
      { value: 'yes', label: 'Yes — we would hire them again' },
      { value: 'no', label: 'No — the exit was the right outcome' },
    ],
  });
  const currency = h('input', {
    id: 'departure-currency',
    name: 'currency',
    type: 'text',
    maxlength: '4',
    placeholder: 'USD',
    value: person.compensation?.currency || '',
  });
  const replacement = numberInput({
    id: 'departure-replacement',
    value: person.compensation?.annualCost ? Math.round(person.compensation.annualCost * ((ctx.state.settings?.retentionReplacementPct ?? 50) / 100)) : '',
    placeholder: 'derived from the recorded annual cost',
  });
  const note = h('textarea', {
    id: 'departure-note',
    name: 'exitNote',
    rows: 3,
    maxlength: '4000',
    placeholder: 'What actually happened, in plain language. This stays local and is excluded from every CSV export.',
  });
  const archive = h('input', { id: 'departure-archive', name: 'archive', type: 'checkbox', checked: true });
  const error = h('p', { class: 'field-error', id: 'departure-error', role: 'alert' });

  const body = h('div', { class: 'stack-md' },
    h('p', { class: 'prose small' },
      `Recording a departure changes three things at once: the survival evidence this module models, the roster and capacity plan, and one continuity case created through the shared case engine. Nothing is deleted, and no exit type or reason is inferred — if you do not know, record “not recorded”.`),
    h('div', { class: 'form-grid' },
      field({ id: 'departure-last-day', label: 'Last working day', control: lastDay }),
      field({ id: 'departure-type', label: 'Exit type', control: type, hint: 'Only voluntary exits become hazard events; involuntary exits censor the record.' }),
      field({ id: 'departure-reason', label: 'Recorded reason class', control: reason }),
      field({ id: 'departure-regrettable', label: 'Regrettable?', control: regrettable }),
      field({ id: 'departure-currency', label: 'Currency', control: currency }),
      field({ id: 'departure-replacement', label: 'Replacement cost (optional)', control: replacement, hint: 'Leave blank to use the recorded annual cost × your replacement convention.' }),
    ),
    field({ id: 'departure-note', label: 'What happened (local only)', control: note, wide: true }),
    h('label', { class: 'check-row', for: 'departure-archive' },
      archive,
      h('span', null, 'Archive this person from the roster and release their capacity')),
    error,
  );

  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Record departure');
  const form = h('form', {
    onSubmit: (event) => {
      event.preventDefault();
      error.textContent = '';
      const result = ctx.api.recordDeparture(person.id, {
        lastDay: lastDay.value,
        type: type.value,
        reasonClass: reason.value,
        regrettable: regrettable.value === '' ? null : regrettable.value === 'yes',
        currency: currency.value,
        replacementCostOverride: replacement.value === '' ? null : Number(replacement.value),
        exitNote: note.value,
        archive: archive.checked,
      });
      if (!result?.ok) {
        error.textContent = result?.error || 'The departure could not be recorded.';
        return;
      }
      close();
      toast(result.caseId ? 'Departure recorded and a continuity case opened' : 'Departure recorded', 'good');
      if (onSaved) onSaved(result);
      else ctx.refresh?.();
    },
  }, body, h('div', { class: 'dialog-actions' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => close() }, 'Cancel'),
    submit,
  ));

  const { close } = openModal({
    title: `Record a departure · ${person.name}`,
    description: 'One record, three consequences.',
    body: form,
    size: 'md',
  });
  return { close };
}

/* --------------------------------------------------------- plan & commit */

export function openRetentionPlanDialog(ctx, person, { existing = null, onSaved = null } = {}) {
  if (!person) return null;
  const draft = ctx.api.retentionDraft(person.id);
  if (!draft.ok) {
    toast(draft.error || 'That person is no longer available.', 'bad');
    return null;
  }
  const plan = existing || draft.livePlan;
  const committed = plan?.status === 'committed';
  const risk = draft.risk;
  const cost = draft.cost;
  const loss = draft.loss;

  const chosen = new Set((plan ? plan.interventions.map((i) => i.id) : draft.candidates.filter((c) => !c.blockedReason).map((c) => c.id)));
  const rows = draft.candidates;
  const totalCost = h('output', { class: 'retention-total' });
  const totalHours = h('output', { class: 'retention-total' });
  const totalBenefit = h('output', { class: 'retention-total' });
  const error = h('p', { class: 'field-error', id: 'retention-error', role: 'alert' });

  function recalc() {
    const picked = rows.filter((r) => chosen.has(r.id));
    // `spend`, not `money`: a local named `money` shadowed the formatting helper
    // and made the dialog throw the moment it recalculated.
    const spend = picked.reduce((s, r) => s + (r.moneyCost || 0), 0);
    const hours = picked.reduce((s, r) => s + (r.hours || 0), 0);
    const benefit = picked.reduce((s, r) => s + (r.benefit || 0), 0);
    const currency = picked.find((r) => r.currency)?.currency || '';
    totalCost.textContent = spend > 0 ? money(currency, spend) : 'no money';
    totalHours.textContent = `${hours.toFixed(1)} h`;
    totalBenefit.textContent = cost ? money(currency, benefit) : 'unpriced';
  }

  const optionNodes = rows.map((candidate) => {
    const checkbox = h('input', {
      id: `retention-opt-${candidate.id}`,
      type: 'checkbox',
      checked: chosen.has(candidate.id),
      disabled: Boolean(candidate.blockedReason) || committed,
      onChange: (event) => {
        if (event.target.checked) chosen.add(candidate.id);
        else chosen.delete(candidate.id);
        recalc();
      },
    });
    return h('div', { class: `retention-option${candidate.blockedReason ? ' is-blocked' : ''}` },
      h('label', { class: 'retention-option-head', for: `retention-opt-${candidate.id}` },
        checkbox,
        h('span', { class: 'retention-option-label' }, candidate.label),
        h('span', { class: 'retention-option-costs' },
          candidate.moneyCost > 0 ? money(candidate.currency, candidate.moneyCost) : 'no money',
          ' · ',
          `${candidate.hours} h`,
          candidate.hazardReduction ? ` · −${pct(candidate.hazardReduction)} hazard` : '',
        ),
      ),
      h('p', { class: 'muted tiny' }, candidate.description),
      candidate.blockedReason
        ? h('p', { class: 'field-error' }, candidate.blockedReason)
        : null,
    );
  });

  const rationale = h('textarea', {
    id: 'retention-rationale',
    name: 'rationale',
    rows: 2,
    maxlength: '2000',
    placeholder: 'Why these interventions, for this person, now?',
  }, plan?.rationale || '');
  const note = h('textarea', {
    id: 'retention-note',
    name: 'note',
    rows: 2,
    maxlength: '500',
    placeholder: committed ? 'What was said in the check-in (at least 8 characters)' : '',
  });
  const reviewDate = h('input', {
    id: 'retention-review',
    name: 'reviewOn',
    type: 'date',
    value: plan?.reviewOn || '',
  });

  const riskPanel = h('div', { class: 'retention-risk-panel' },
    h('div', { class: 'retention-risk-head' },
      h('strong', null, `${pct(risk.point, 1)} modelled exit probability over ${risk.horizonDays} days`),
      h('span', { class: `badge badge-${risk.band.tone}` }, risk.band.label),
    ),
    h('p', { class: 'muted small' },
      `Interval ${pct(risk.lo, 1)} – ${pct(risk.hi, 1)} (${risk.intervalBasis}). Multipliers: ${risk.mode === 'pooled' ? "this workspace's own fit" : `literature priors — ${draft.needs} more observed departure(s) to become this workspace's own`}.`),
    risk.factors.length
      ? h('ul', { class: 'retention-factor-list' }, ...risk.factors.map((f) => h('li', null,
          h('span', { class: 'retention-factor-name' }, f.label),
          h('span', { class: 'retention-factor-hr' }, `×${f.hr.toFixed(2)}`, h('span', { class: 'muted tiny' }, ` (${f.source})`)),
          h('span', { class: 'muted tiny retention-factor-evidence' }, f.evidence.join(' · ')),
        )))
      : h('p', { class: 'muted small' }, 'No recorded risk factors — this person sits at the baseline hazard for their tenure band.'),
    h('dl', { class: 'kv-inline' },
      h('dt', null, 'Replacement cost'), h('dd', null, cost ? money(cost.currency, cost.amount) : 'unpriced — record an annual cost'),
      h('dt', null, 'Expected loss'), h('dd', null, loss ? `${money(loss.currency, loss.lo)} – ${money(loss.currency, loss.hi)} (point ${money(loss.currency, loss.point)})` : 'unpriced'),
    ),
  );

  const submitLabel = committed ? 'Save check-in' : plan ? 'Commit this plan' : 'Propose plan';
  const form = h('form', {
    onSubmit: (event) => {
      event.preventDefault();
      error.textContent = '';
      const chosenIds = Array.from(chosen);
      let result;
      if (committed) {
        const today = new Date(ctx.now).toISOString().slice(0, 10);
        result = note.value.trim().length >= 8
          ? ctx.api.logRetentionCheckin(plan.id, { note: note.value })
          : { ok: true, skipped: true };
        if (reviewDate.value && reviewDate.value >= today) {
          // The action owns the review date arithmetic; a check-in always moves
          // it forward by the workspace convention.
          void reviewDate;
        }
        if (result?.ok && !result.skipped) toast('Check-in recorded', 'good');
      } else if (plan && plan.status === 'proposed') {
        result = ctx.api.commitRetentionPlan(plan.id, { interventions: chosenIds, rationale: rationale.value });
        if (result?.ok) toast(`Plan committed${result.committedCost ? ` · ${money(result.currency, result.committedCost)}` : ''}`, 'good');
      } else {
        result = ctx.api.planRetention(person.id, { interventions: chosenIds, rationale: rationale.value });
        if (result?.ok) toast('Plan proposed — no money committed yet', 'good');
      }
      if (!result?.ok) {
        error.textContent = result?.error || 'That could not be saved.';
        return;
      }
      close();
      if (onSaved) onSaved(result);
      else ctx.refresh?.();
    },
  },
  riskPanel,
  h('div', { class: 'stack-sm' },
    h('p', { class: 'field-label' }, committed ? 'Committed interventions' : 'Interventions'),
    rows.length
      ? h('div', { class: 'retention-options' }, ...optionNodes)
      : h('p', { class: 'muted small' }, 'The engine found no actionable factor to intervene on. Proposing a plan with no factor would be a gesture, not a decision.'),
  ),
  h('div', { class: 'retention-totals' },
    h('span', null, 'Cost ', totalCost),
    h('span', null, 'Attention ', totalHours),
    h('span', null, 'Expected loss avoided ', totalBenefit),
  ),
  committed
    ? field({ id: 'retention-note', label: 'Check-in note', control: note, hint: 'Recording a check-in moves the review date forward by the workspace convention.', wide: true })
    : h('div', { class: 'form-grid' },
        committed ? null : field({ id: 'retention-rationale', label: 'Rationale', control: rationale, wide: true }),
        field({ id: 'retention-review', label: 'Next review', control: reviewDate, hint: 'A commitment without a review date is a conversation you had once.' }),
      ),
  error,
  h('div', { class: 'dialog-actions' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => close() }, 'Cancel'),
    h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel),
  ));

  recalc();
  const { close } = openModal({
    title: `${committed ? 'Check in on' : plan ? RETENTION_PLAN_STATUS_LABELS[plan.status] : 'Propose'} a retention plan · ${person.name}`,
    description: committed
      ? 'A committed plan takes check-ins, not edits.'
      : 'A proposal commits nothing. Committing raises a decision and records the cost.',
    body: form,
    size: 'lg',
  });
  return { close };
}

/* ------------------------------------------------------------- pay data */

export function openCompensationDialog(ctx, person, { onSaved = null } = {}) {
  if (!person) return null;
  const comp = person.compensation || {};
  const annual = numberInput({ id: 'comp-annual', value: comp.annualCost ?? '', placeholder: 'e.g. 96000' });
  const bandMin = numberInput({ id: 'comp-min', value: comp.bandMin ?? '', placeholder: 'e.g. 104000' });
  const bandMax = numberInput({ id: 'comp-max', value: comp.bandMax ?? '', placeholder: 'e.g. 128000' });
  const currency = h('input', {
    id: 'comp-currency',
    name: 'currency',
    type: 'text',
    maxlength: '4',
    placeholder: 'USD',
    value: comp.currency || '',
  });
  const promo = h('input', {
    id: 'comp-promo',
    name: 'lastPromotionOn',
    type: 'date',
    max: new Date(ctx.now).toISOString().slice(0, 10),
    value: person.lastPromotionOn || '',
  });
  const error = h('p', { class: 'field-error', id: 'comp-error', role: 'alert' });

  const form = h('form', {
    onSubmit: (event) => {
      event.preventDefault();
      error.textContent = '';
      const result = ctx.api.updatePersonCompensation(person.id, {
        currency: currency.value,
        annualCost: annual.value,
        bandMin: bandMin.value,
        bandMax: bandMax.value,
        lastPromotionOn: promo.value,
      });
      if (!result?.ok) {
        error.textContent = result?.error || 'Those figures could not be saved.';
        return;
      }
      close();
      toast('Pay data saved', 'good');
      if (onSaved) onSaved(result);
      else ctx.refresh?.();
    },
  },
  h('p', { class: 'prose small' },
    'Every field is optional and independent. Blank means unknown, and the terminal says “unpriced” rather than assuming a figure. Nothing here leaves this browser, and pay data is excluded from every export except the pseudonymous retention scope.'),
  h('div', { class: 'form-grid' },
    field({ id: 'comp-currency', label: 'Currency', control: currency, hint: 'Required as soon as any amount is recorded.' }),
    field({ id: 'comp-annual', label: 'Current annual cost', control: annual }),
    field({ id: 'comp-band-min', label: 'Band minimum', control: bandMin }),
    field({ id: 'comp-band-max', label: 'Band maximum', control: bandMax }),
    field({ id: 'comp-promo', label: 'Last level change', control: promo, hint: 'Leave blank if there has been none on record — the engine will read that literally, not charitably.' }),
  ),
  error,
  h('div', { class: 'dialog-actions' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => close() }, 'Cancel'),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save pay data'),
  ));

  const { close } = openModal({
    title: `Pay data · ${person.name}`,
    description: 'Optional. The economics improves only when this exists.',
    body: form,
  });
  return { close };
}

/* --------------------------------------------------------- decline / close */

export function openRetentionDeclineDialog(ctx, plan, { onSaved = null } = {}) {
  if (!plan) return null;
  const reason = h('textarea', { id: 'decline-reason', name: 'reason', rows: 3, maxlength: '500', placeholder: 'Why is this not the right call?' });
  const error = h('p', { class: 'field-error', role: 'alert' });
  const form = h('form', {
    onSubmit: (event) => {
      event.preventDefault();
      error.textContent = '';
      const result = ctx.api.declineRetentionPlan(plan.id, reason.value);
      if (!result?.ok) {
        error.textContent = result?.error || 'That could not be saved.';
        return;
      }
      close();
      toast('Plan declined with a written reason', 'good');
      if (onSaved) onSaved(result);
      else ctx.refresh?.();
    },
  },
  h('p', { class: 'prose small' }, 'A declined retention plan is a decision. The reason is what makes it reviewable — and it is the record that shows the leader looked.'),
  field({ id: 'decline-reason', label: 'Reason', control: reason, wide: true }),
  error,
  h('div', { class: 'dialog-actions' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => close() }, 'Cancel'),
    h('button', { class: 'btn btn-danger', type: 'submit' }, 'Decline with this reason'),
  ));
  const { close } = openModal({ title: 'Decline this retention plan', body: form });
  return { close };
}
